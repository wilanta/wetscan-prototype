import { createHmac } from "node:crypto";
import type { GuardPipelineEventV1, GuardProducerProof } from "@/features/sentinel/contracts";
import { validateGuardHandoff } from "@/features/sentinel/integrations";
import type { Grant, IntegrationResult, RepositoryRef, Scope } from "../contracts";
import type { SentinelPort } from "../contracts";
import type { G06OutboxRecord } from "./contracts";
import { redactG06Text, redactG06Value } from "./redaction";
import { stableDigest, type G06PostgresStore } from "./store";

export type SentinelPipelineEventInput = {
  type: "release_evaluated" | "remediation_retested";
  scanId: string;
  decision: string;
  repository: RepositoryRef;
  evidenceIds: string[];
  origin?: "observed_scan" | "controlled_test";
  retestVerified?: boolean;
  occurredAt?: string;
  summary?: string;
};

export interface SentinelConsumerOutcome {
  outcome:
    | "acknowledged"
    | "consumer_unavailable"
    | "retryable_error"
    | "conflict"
    | "rejected"
    | "permanent_failure";
  consumerStatus: string;
  consumerRef: string | null;
  httpStatus?: number | null;
  errorCode?: string;
  errorDetail?: string;
  permanent?: boolean;
}

export interface SentinelPipelineConsumer {
  deliver(event: GuardPipelineEventV1): Promise<SentinelConsumerOutcome>;
}

export function validateConsumerUrl(raw: string): URL {
  const url = new URL(raw);
  const loopback = ["127.0.0.1", "localhost", "::1"].includes(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) {
    throw new Error("sentinel_consumer_https_required");
  }
  return url;
}

export class HttpSentinelPipelineConsumer implements SentinelPipelineConsumer {
  private readonly url: URL;

  constructor(
    rawUrl: string,
    private readonly sharedSecret?: string,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly timeoutMs = 5000,
  ) {
    this.url = validateConsumerUrl(rawUrl);
  }

  async deliver(event: GuardPipelineEventV1): Promise<SentinelConsumerOutcome> {
    const body = JSON.stringify(redactG06Value(event));
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-WetScan-Schema": "guard-pipeline-v1",
      "X-WetScan-Idempotency-Key": event.idempotencyKey,
    };
    if (this.sharedSecret) {
      headers["X-WetScan-Signature-256"] =
        "sha256=" +
        createHmac("sha256", this.sharedSecret).update(body).digest("hex");
    }

    try {
      const response = await this.fetchImpl(this.url.toString(), {
        method: "POST",
        headers,
        body,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      const json = (await response.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;
      if (response.ok) {
        if (json.accepted !== true && typeof json.acknowledgmentId !== "string") {
          return {
            outcome: "rejected",
            httpStatus: response.status,
            consumerStatus: "malformed_ack",
            consumerRef: null,
            errorCode: "invalid_consumer_ack",
            errorDetail: "Consumer returned 2xx without accepted=true or acknowledgmentId.",
            permanent: true,
          };
        }
        return {
          outcome: "acknowledged",
          httpStatus: response.status,
          consumerStatus:
            typeof json.status === "string" ? json.status : "accepted",
          consumerRef:
            typeof json.acknowledgmentId === "string"
              ? json.acknowledgmentId
              : event.deliveryId,
        };
      }

      if (response.status === 409) {
        return {
          outcome: "conflict",
          httpStatus: 409,
          consumerStatus: "conflict",
          consumerRef: null,
          errorCode: "consumer_conflict",
          errorDetail: redactG06Text(
            String(json.error ?? "Consumer detected conflicting payload for idempotency key"),
          ),
        };
      }
      if (response.status === 400 || response.status === 422 || response.status === 403) {
        return {
          outcome: "rejected",
          httpStatus: response.status,
          consumerStatus: "rejected",
          consumerRef: null,
          errorCode: String(json.error ?? `http_${response.status}`),
          errorDetail: redactG06Text(
            String(json.message ?? `Consumer rejected event (${response.status})`),
          ),
          permanent: true,
        };
      }
      return {
        outcome: "retryable_error",
        httpStatus: response.status,
        consumerStatus: "transient_error",
        consumerRef: null,
        errorCode: String(json.error ?? `http_${response.status}`),
        errorDetail: redactG06Text(
          String(json.message ?? `Consumer returned retryable status ${response.status}`),
        ),
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        outcome: "retryable_error",
        httpStatus: null,
        consumerStatus: "network_error",
        consumerRef: null,
        errorCode:
          error instanceof Error && error.name === "TimeoutError"
            ? "consumer_timeout"
            : "consumer_unreachable",
        errorDetail: redactG06Text(msg),
      };
    }
  }
}

export class UnconfiguredSentinelConsumer implements SentinelPipelineConsumer {
  async deliver(): Promise<SentinelConsumerOutcome> {
    return {
      outcome: "consumer_unavailable",
      consumerStatus: "not_configured",
      consumerRef: null,
      httpStatus: null,
      errorCode: "sentinel_consumer_not_configured",
      errorDetail:
        "Sentinel core does not expose a native guard_pipeline_audit ingestion endpoint (Sentinel 0001..0009 accepts runtime telemetry only). Event remains durable in guard.g06_outbox without creating runtime incidents.",
    };
  }
}

export function sentinelConsumerFromEnv(
  env: Readonly<Record<string, string | undefined>> = process.env,
): { consumer: SentinelPipelineConsumer; configured: boolean } {
  const url = env.GUARD_G06_SENTINEL_CONSUMER_URL?.trim();
  if (!url) {
    return { consumer: new UnconfiguredSentinelConsumer(), configured: false };
  }
  const secret = env.GUARD_G06_SENTINEL_CONSUMER_SECRET?.trim();
  return {
    consumer: new HttpSentinelPipelineConsumer(url, secret),
    configured: true,
  };
}

export function buildValidatedPipelineEvent(input: {
  grant: Grant;
  scope: Scope;
  event: SentinelPipelineEventInput;
  now?: string;
}): { handoff: GuardPipelineEventV1; idempotencyKey: string } {
  const { grant, scope, event } = input;
  if (
    event.type === "remediation_retested" &&
    event.retestVerified !== true
  ) {
    throw new Error("remediation_retested_requires_verified_retest_evidence");
  }
  if (!event.evidenceIds.length) {
    throw new Error("guard_pipeline_event_requires_evidence_ids");
  }
  const occurredAt =
    input.now ?? event.occurredAt ?? new Date().toISOString();
  const safeDecision = redactG06Text(event.decision);
  const digest = stableDigest({
    projectId: scope.projectId,
    type: event.type,
    scanId: event.scanId,
    commit: event.repository.commit,
    decision: safeDecision,
    evidenceIds: [...event.evidenceIds].sort(),
  });
  const idempotencyKey = `sentinel:${scope.projectId}:${event.type}:${event.scanId}:${digest.slice(0, 16)}`;
  const origin = event.origin ?? "observed_scan";

  const handoff: GuardPipelineEventV1 = {
    schemaVersion: 1,
    producer: "guard",
    mode: "live",
    workspaceId: scope.workspaceId,
    projectId: scope.projectId,
    deliveryId: `gpe_${digest.slice(0, 24)}`,
    idempotencyKey,
    repository: event.repository,
    evidence: event.evidenceIds.slice(0, 20).map((id) => ({
      id,
      sourceId: `guard:${event.scanId}`,
      origin,
      occurredAt,
      recordedAt: occurredAt,
    })),
    occurredAt,
    category: "security_pipeline",
    event: {
      type: event.type,
      scanId: event.scanId,
      decision: safeDecision,
    },
  };

  const proof: GuardProducerProof = {
    scope: {
      mode: "live",
      workspaceId: scope.workspaceId,
      projectId: scope.projectId,
    },
    scanId: event.scanId,
    repository: event.repository,
    evidenceIds: event.evidenceIds,
    origin,
  };

  validateGuardHandoff(grant, handoff, proof);
  return { handoff, idempotencyKey };
}

export class G06SentinelAdapter implements SentinelPort {
  constructor(
    private readonly store: G06PostgresStore,
    private readonly context: {
      repository: RepositoryRef;
      actor?: string;
      consumer?: SentinelPipelineConsumer;
    },
  ) {}

  async enqueueValidatedEvent(
    grant: Grant,
    scope: Scope,
    event: SentinelPipelineEventInput,
  ): Promise<{ record: G06OutboxRecord; duplicate: boolean }> {
    const { handoff, idempotencyKey } = buildValidatedPipelineEvent({
      grant,
      scope,
      event,
    });
    const envelopePayload = redactG06Value({
      ...handoff,
      securityIncident: false,
      auditNote: event.summary ?? null,
    });

    return this.store.enqueueOutbox(scope, {
      topic: "sentinel_pipeline",
      scanId: event.scanId,
      commitSha: event.repository.commit,
      idempotencyKey,
      eventType: event.type,
      schemaVersion: "guard.pipeline.v1",
      payload: envelopePayload,
      actor: this.context.actor ?? grant.actorId,
    });
  }

  async publish(
    grant: Grant,
    scope: Scope,
    event: {
      type: "release_evaluated" | "remediation_retested";
      scanId: string;
      decision: string;
    },
  ): Promise<IntegrationResult<{ deliveryId: string }>> {
    const enqueued = await this.enqueueValidatedEvent(grant, scope, {
      ...event,
      repository: this.context.repository,
      evidenceIds: [`scan:${event.scanId}`],
      origin: "observed_scan",
      retestVerified: event.type === "remediation_retested" ? false : undefined,
    });

    return {
      status: "available",
      value: { deliveryId: enqueued.record.deliveryId },
    };
  }
}

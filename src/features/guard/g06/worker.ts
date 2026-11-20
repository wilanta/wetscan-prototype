import { randomUUID } from "node:crypto";
import type { GuardPipelineEventV1 } from "@/features/sentinel/contracts";
import type { GuardInventoryV1 } from "@/features/sentinel/contracts";
import type { G06OutboxRecord } from "./contracts";
import type { IntelligenceConsumer } from "./intelligence-bridge";
import type { SentinelPipelineConsumer } from "./sentinel-bridge";
import type { G06PostgresStore } from "./store";

export interface G06WorkerSweepResult {
  discovered: number;
  claimed: number;
  acknowledged: number;
  retried: number;
  failed: number;
  conflicts: number;
  outcomes: Array<{
    deliveryId: string;
    topic: G06OutboxRecord["topic"];
    state: G06OutboxRecord["state"];
    consumerStatus: string | null;
  }>;
}

export class G06OutboxWorker {
  readonly workerId: string;

  constructor(
    private readonly store: G06PostgresStore,
    private readonly deps: {
      intelligenceConsumer: IntelligenceConsumer;
      sentinelConsumer: SentinelPipelineConsumer;
      workerId?: string;
      leaseMs?: number;
    },
  ) {
    this.workerId =
      deps.workerId ?? `g06-worker-${process.pid}-${randomUUID().slice(0, 6)}`;
  }

  async runOnce(limit = 25): Promise<G06WorkerSweepResult> {
    const due = await this.store.pendingDeliveriesWorker(limit);
    const result: G06WorkerSweepResult = {
      discovered: due.length,
      claimed: 0,
      acknowledged: 0,
      retried: 0,
      failed: 0,
      conflicts: 0,
      outcomes: [],
    };

    for (const item of due) {
      const scope = {
        workspaceId: item.workspaceId,
        projectId: item.projectId,
      };
      const claimed = await this.store.claimDeliveryWorker(
        scope,
        item.deliveryId,
        this.workerId,
        this.deps.leaseMs ?? 30_000,
      );
      if (!claimed) continue;
      result.claimed += 1;

      const { lease, record } = claimed;
      let updated: G06OutboxRecord;

      if (record.topic === "intelligence_inventory") {
        updated = await this.processIntelligenceDelivery(lease, record);
      } else {
        updated = await this.processSentinelDelivery(lease, record);
      }

      if (updated.state === "acknowledged") result.acknowledged += 1;
      else if (updated.state === "retry_scheduled") result.retried += 1;
      else if (updated.state === "conflict") result.conflicts += 1;
      else if (updated.state === "failed") result.failed += 1;

      result.outcomes.push({
        deliveryId: updated.deliveryId,
        topic: updated.topic,
        state: updated.state,
        consumerStatus: updated.consumerStatus,
      });
    }

    return result;
  }

  private async processIntelligenceDelivery(
    lease: Parameters<G06PostgresStore["completeDeliveryWorker"]>[0],
    record: G06OutboxRecord,
  ): Promise<G06OutboxRecord> {
    const payload = record.payload as {
      handoff?: GuardInventoryV1;
      metadata?: {
        lockfilePath?: string;
        inventoryDigest?: string;
        unsupportedCount?: number;
        itemCount?: number;
      };
    };
    const handoff = payload.handoff;
    if (!handoff) {
      return this.store.failOrRetryDeliveryWorker(lease, {
        outcome: "permanent_failure",
        errorCode: "invalid_outbox_payload",
        errorDetail: "Missing GuardInventoryV1 handoff payload.",
        permanent: true,
      });
    }

    const meta = {
      lockfilePath: payload.metadata?.lockfilePath ?? "package-lock.json",
      inventoryDigest: payload.metadata?.inventoryDigest ?? record.payloadDigest,
      unsupportedCount: payload.metadata?.unsupportedCount ?? 0,
    };

    const res = await this.deps.intelligenceConsumer.ingest(handoff, meta);
    await this.store.upsertIntelligenceSync(
      { workspaceId: lease.workspaceId, projectId: lease.projectId },
      {
        deliveryId: record.deliveryId,
        scanId: record.scanId,
        commitSha: record.commitSha,
        inventoryDigest: meta.inventoryDigest,
        lockfilePath: meta.lockfilePath,
        itemCount: handoff.inventory.length,
        unsupportedCount: meta.unsupportedCount,
        syncStatus: res.syncStatus,
        sentinelSnapshotId: res.sentinelSnapshotId,
        exposureAssessment: res.exposureAssessment,
        exposureCount: res.exposureCount,
        exposureSummary: res.exposureSummary,
        acknowledgedAt:
          res.outcome === "acknowledged" ? new Date().toISOString() : null,
        asWorker: true,
      },
    );

    if (res.outcome === "acknowledged") {
      return this.store.completeDeliveryWorker(lease, {
        consumerStatus: "sentinel_s09_acknowledged",
        consumerAckRef: res.sentinelSnapshotId,
      });
    }

    return this.store.failOrRetryDeliveryWorker(lease, {
      outcome: res.outcome,
      errorCode: res.errorCode ?? res.syncStatus,
      errorDetail:
        res.errorDetail ??
        "Intelligence consumer unavailable or project unregistered.",
      permanent: res.outcome === "rejected",
    });
  }

  private async processSentinelDelivery(
    lease: Parameters<G06PostgresStore["completeDeliveryWorker"]>[0],
    record: G06OutboxRecord,
  ): Promise<G06OutboxRecord> {
    const handoff = record.payload as unknown as GuardPipelineEventV1;
    if (
      !handoff ||
      handoff.schemaVersion !== 1 ||
      handoff.producer !== "guard" ||
      handoff.category !== "security_pipeline"
    ) {
      return this.store.failOrRetryDeliveryWorker(lease, {
        outcome: "permanent_failure",
        errorCode: "invalid_sentinel_envelope",
        errorDetail: "Outbox payload does not match GuardPipelineEventV1.",
        permanent: true,
      });
    }

    const res = await this.deps.sentinelConsumer.deliver(handoff);
    if (res.outcome === "acknowledged") {
      return this.store.completeDeliveryWorker(lease, {
        consumerStatus: res.consumerStatus,
        consumerAckRef: res.consumerRef,
        httpStatus: res.httpStatus ?? 200,
      });
    }

    return this.store.failOrRetryDeliveryWorker(lease, {
      outcome: res.outcome,
      errorCode: res.errorCode ?? res.consumerStatus,
      errorDetail:
        res.errorDetail ?? "Sentinel pipeline consumer unavailable.",
      httpStatus: res.httpStatus ?? null,
      permanent: res.permanent,
    });
  }
}

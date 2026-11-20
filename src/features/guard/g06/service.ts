import type { ArchitectureGraph } from "@/features/canvas/types";
import type { ProjectAuthority } from "../live/model";
import type { RepositoryRef } from "../contracts";
import {
  G06Error,
  type G06CanvasOverlayPayload,
  type G06CanvasOverlayRecord,
  type G06IntelligenceSyncRecord,
  type G06OutboxRecord,
  type G06Overview,
  type G06Scope,
  type G06UnifiedReportRecord,
} from "./contracts";
import { buildGuardCanvasOverlay } from "./canvas-overlay";
import {
  extractInventoryFromScan,
  G06IntelligenceAdapter,
  type IntelligenceConsumer,
} from "./intelligence-bridge";
import {
  G06SentinelAdapter,
  type SentinelPipelineConsumer,
} from "./sentinel-bridge";
import type { G06PostgresStore } from "./store";
import { buildUnifiedGuardReport } from "./unified-report";
import { G06OutboxWorker, type G06WorkerSweepResult } from "./worker";

function scopeFromAuthority(auth: ProjectAuthority): G06Scope {
  const repoIdMatch = /^github-([1-9]\d{0,15})$/.exec(auth.grant.projectId);
  return {
    workspaceId: auth.grant.workspaceId,
    projectId: auth.grant.projectId,
    repositoryId: repoIdMatch ? Number(repoIdMatch[1]) : undefined,
    repositoryName: auth.repositoryName,
  };
}

function repoRefFor(
  auth: ProjectAuthority,
  commit: string,
  branch?: string,
): RepositoryRef {
  return {
    provider: "github",
    repositoryId: auth.repositoryId,
    branch: branch || auth.branch || "main",
    commit,
  };
}

export class G06Service {
  constructor(
    readonly store: G06PostgresStore,
    private readonly deps: {
      intelligenceConsumer: IntelligenceConsumer;
      sentinelConsumer: SentinelPipelineConsumer;
      sentinelConsumerConfigured: boolean;
      worker?: G06OutboxWorker;
    },
  ) {}

  async overview(auth: ProjectAuthority): Promise<G06Overview> {
    const scope = scopeFromAuthority(auth);
    const [latestOverlay, latestSync, intelOutbox, sentinelOutbox, recentAttempts, reports] =
      await Promise.all([
        this.store.latestCanvasOverlay(scope),
        this.store.latestIntelligenceSync(scope),
        this.store.listOutbox(scope, "intelligence_inventory", 20),
        this.store.listOutbox(scope, "sentinel_pipeline", 20),
        this.store.listDeliveryAttempts(scope, undefined, 25),
        this.store.listReports(scope, 20),
      ]);

    return {
      projectId: scope.projectId,
      configured: true,
      scopeNote:
        "WetScan Guard is GitHub-only (GRD-002 GitLab & ZIP uploads are excluded by owner decision). Canvas/Intelligence/Sentinel bridges operate over persisted scan and DAST/Integrity records.",
      canvas: { latestOverlay },
      intelligence: {
        latestSync,
        outbox: intelOutbox,
      },
      sentinel: {
        outbox: sentinelOutbox,
        recentAttempts,
        consumerConfigured: this.deps.sentinelConsumerConfigured,
      },
      reports,
    };
  }

  async resolveCanvasOverlay(
    auth: ProjectAuthority,
    input: {
      graph: ArchitectureGraph | null;
      scanId?: string;
      persist?: boolean;
    },
  ): Promise<{
    overlay: G06CanvasOverlayPayload;
    record: G06CanvasOverlayRecord | null;
  }> {
    const scope = scopeFromAuthority(auth);
    const scans = await this.store.listOperationalScans(scope, 10);
    const g02Scan = input.scanId
      ? scans.find((s) => s.id === input.scanId) ??
        (await this.store.getOperationalScan(scope, input.scanId))
      : scans[0] ?? null;

    if (input.scanId && !g02Scan) {
      throw new G06Error("not_found", 404, "scan_not_found");
    }

    const g05 = await this.store.readG05Snapshot(scope);
    const overlay = buildGuardCanvasOverlay({
      projectId: scope.projectId,
      graph: input.graph,
      g02Scan,
      g05Runs: g05.runs,
      g05Findings: g05.findings,
    });

    if (!input.graph) {
      const persisted = await this.store.latestCanvasOverlay(scope);
      return {
        overlay: persisted?.overlay ?? overlay,
        record: persisted,
      };
    }

    if (
      input.persist !== false &&
      (g02Scan || g05.runs.length > 0)
    ) {
      const record = await this.store.saveCanvasOverlay(scope, {
        overlay,
        actor: auth.grant.actorId,
      });
      return { overlay, record };
    }

    return { overlay, record: null };
  }

  async syncIntelligence(
    auth: ProjectAuthority,
    input: { scanId?: string; dispatch?: boolean } = {},
  ): Promise<{
    delivery: G06OutboxRecord;
    duplicate: boolean;
    sync: G06IntelligenceSyncRecord | null;
    sweep: G06WorkerSweepResult | null;
  }> {
    const scope = scopeFromAuthority(auth);
    const scan = input.scanId
      ? await this.store.getOperationalScan(scope, input.scanId)
      : (await this.store.listOperationalScans(scope, 5))[0] ?? null;
    if (!scan) {
      throw new G06Error("not_found", 404, "no_operational_scan_available");
    }

    const commit = scan.job.repository.commit;
    const inventory = extractInventoryFromScan(scan.job);
    const adapter = new G06IntelligenceAdapter(this.store, {
      repository: repoRefFor(auth, commit, scan.job.repository.branch),
      scanId: scan.id,
      actor: auth.grant.actorId,
      origin: "observed_scan",
      occurredAt: scan.job.finishedAt ?? scan.job.createdAt,
    });

    const pub = await adapter.publish(auth.grant, auth.grant, commit, inventory);
    if (pub.status !== "available") {
      throw new G06Error("consumer_unavailable", 503, pub.reason);
    }

    let sweep: G06WorkerSweepResult | null = null;
    if (input.dispatch !== false && this.deps.worker) {
      sweep = await this.deps.worker.runOnce(10);
    }

    const [delivery, sync] = await Promise.all([
      this.store.getOutboxDelivery(scope, pub.value.deliveryId),
      this.store.latestIntelligenceSync(scope),
    ]);
    if (!delivery) {
      throw new G06Error("not_found", 404, "delivery_not_found");
    }
    return {
      delivery,
      duplicate: false,
      sync,
      sweep,
    };
  }

  async publishSentinelEvent(
    auth: ProjectAuthority,
    input: {
      scanId?: string;
      type?: "release_evaluated" | "remediation_retested";
      dispatch?: boolean;
    } = {},
  ): Promise<{
    delivery: G06OutboxRecord;
    duplicate: boolean;
    sweep: G06WorkerSweepResult | null;
  }> {
    const scope = scopeFromAuthority(auth);
    const scan = input.scanId
      ? await this.store.getOperationalScan(scope, input.scanId)
      : (await this.store.listOperationalScans(scope, 5))[0] ?? null;
    if (!scan) {
      throw new G06Error("not_found", 404, "no_operational_scan_available");
    }

    const eventType = input.type ?? "release_evaluated";
    const [g04, g05] = await Promise.all([
      this.store.readG04Snapshot(scope),
      this.store.readG05Snapshot(scope),
    ]);

    const commit = scan.job.repository.commit;
    const g04Eval = g04.evaluations.find((e) => e.commit === commit) ?? g04.evaluations[0];

    let decision: string;
    let retestVerified = false;
    const evidenceIds = [`scan:${scan.id}`];

    if (eventType === "remediation_retested") {
      const hasG02Retest = Boolean(
        scan.job.guardRetests?.some((r) => r.verifiedFixed === true) ||
        scan.job.findings.some((f) => f.status === "verified_fixed"),
      );
      const hasG05Fixed = g05.findings.some((f) => f.status === "verified_fixed");
      if (!hasG02Retest && !hasG05Fixed) {
        throw new G06Error(
          "invalid_input",
          400,
          "remediation_retested requires persisted verified_fixed retest evidence.",
        );
      }
      retestVerified = true;
      decision = "retest_verified_fixed";
      if (hasG05Fixed && g05.runs[0]) evidenceIds.push(`g05-run:${g05.runs[0].id}`);
    } else {
      decision = g04Eval?.decision
        ? g04Eval.decision.toLowerCase()
        : scan.status === "completed"
          ? "pass"
          : scan.status === "failed"
            ? "block"
            : "incomplete";
      if (g04Eval) evidenceIds.push(`g04-eval:${g04Eval.id}`);
    }

    const adapter = new G06SentinelAdapter(this.store, {
      repository: repoRefFor(auth, commit, scan.job.repository.branch),
      actor: auth.grant.actorId,
      consumer: this.deps.sentinelConsumer,
    });

    const { record, duplicate } = await adapter.enqueueValidatedEvent(
      auth.grant,
      auth.grant,
      {
        type: eventType,
        scanId: scan.id,
        decision,
        repository: repoRefFor(auth, commit, scan.job.repository.branch),
        evidenceIds,
        origin: "observed_scan",
        retestVerified,
        occurredAt: scan.job.finishedAt ?? scan.job.createdAt,
        summary: `Guard ${eventType} (${decision}) for commit ${commit.slice(0, 12)}`,
      },
    );

    let sweep: G06WorkerSweepResult | null = null;
    if (input.dispatch !== false && this.deps.worker) {
      sweep = await this.deps.worker.runOnce(10);
    }

    const fresh = (await this.store.getOutboxDelivery(scope, record.deliveryId)) ?? record;
    return { delivery: fresh, duplicate, sweep };
  }

  async retryOutbox(
    auth: ProjectAuthority,
    deliveryId: string,
    dispatch = true,
  ): Promise<{ delivery: G06OutboxRecord; sweep: G06WorkerSweepResult | null }> {
    const scope = scopeFromAuthority(auth);
    const updated = await this.store.requestManualRetry(
      scope,
      deliveryId,
      auth.grant.actorId,
    );
    let sweep: G06WorkerSweepResult | null = null;
    if (dispatch && this.deps.worker) {
      sweep = await this.deps.worker.runOnce(10);
    }
    const fresh = (await this.store.getOutboxDelivery(scope, updated.deliveryId)) ?? updated;
    return { delivery: fresh, sweep };
  }

  async generateReport(
    auth: ProjectAuthority,
    scanId?: string,
  ): Promise<G06UnifiedReportRecord> {
    const scope = scopeFromAuthority(auth);
    const [scans, g04, g05, latestOverlay, latestSync, intelOutbox, sentinelOutbox, sentinelAttempts] =
      await Promise.all([
        this.store.listOperationalScans(scope, 10),
        this.store.readG04Snapshot(scope),
        this.store.readG05Snapshot(scope),
        this.store.latestCanvasOverlay(scope),
        this.store.latestIntelligenceSync(scope),
        this.store.listOutbox(scope, "intelligence_inventory", 10),
        this.store.listOutbox(scope, "sentinel_pipeline", 10),
        this.store.listDeliveryAttempts(scope, undefined, 15),
      ]);

    const scan = scanId
      ? scans.find((s) => s.id === scanId) ??
        (await this.store.getOperationalScan(scope, scanId))
      : scans[0] ?? null;
    if (scanId && !scan) {
      throw new G06Error("not_found", 404, "scan_not_found");
    }

    const body = buildUnifiedGuardReport({
      projectId: scope.projectId,
      repositoryName: auth.repositoryName,
      branch: scan?.job.repository.branch ?? auth.branch ?? null,
      scan,
      g04,
      g05,
      latestOverlay,
      intelligenceSync: latestSync,
      intelligenceOutbox: intelOutbox,
      sentinelOutbox,
      sentinelAttempts,
      sentinelConsumerConfigured: this.deps.sentinelConsumerConfigured,
    });

    const matchedEval =
      (scan
        ? g04.evaluations.find((e) => e.commit === scan.job.repository.commit)
        : undefined) ?? g04.evaluations[0];

    return this.store.saveReport(scope, {
      body,
      scanId: scan?.id ?? null,
      g05RunId: g05.runs[0]?.id ?? null,
      g04EvaluationId: matchedEval?.id ?? null,
      actor: auth.grant.actorId,
    });
  }
}

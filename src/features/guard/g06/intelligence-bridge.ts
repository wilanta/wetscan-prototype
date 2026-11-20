import { createHash } from "node:crypto";
import { ApprovedPool, PlatformDatabase } from "@/platform/database";
import { approvedDatabaseConfig } from "@/platform/config";
import { migrationPlan } from "@/platform/migrations";
import { assessExposure } from "@/features/sentinel/external/exposure";
import { InventoryStore } from "@/features/sentinel/external/inventory-store";
import type {
  ExposureReport,
  InventoryItem as SentinelInventoryItem,
} from "@/features/sentinel/external/model";
import type {
  GuardInventoryV1,
  GuardProducerProof,
} from "@/features/sentinel/contracts";
import { validateGuardHandoff } from "@/features/sentinel/integrations";
import { TelemetryError } from "@/features/sentinel/telemetry/validation";
import type { SentinelProjectContext } from "@/features/sentinel/types";
import type {
  Grant,
  IntegrationResult,
  IntelligencePort,
  InventoryItem,
  RepositoryRef,
  ScanJob,
  Scope,
} from "../contracts";
import { normalizeRepoPath } from "./canvas-overlay";
import { stableDigest, type G06PostgresStore } from "./store";

export interface NormalizedGuardInventory {
  commitSha: string;
  lockfilePath: string;
  inventoryDigest: string;
  items: InventoryItem[];
  sentinelItems: SentinelInventoryItem[];
  unsupportedCount: number;
  unknownLicenseCount: number;
}

export interface IntelligenceConsumerResult {
  outcome:
    | "acknowledged"
    | "consumer_unavailable"
    | "retryable_error"
    | "rejected";
  syncStatus:
    | "acknowledged"
    | "consumer_unavailable"
    | "project_not_registered"
    | "failed";
  sentinelSnapshotId: string | null;
  exposureAssessment: ExposureReport["assessment"] | null;
  exposureCount: number;
  exposureSummary: Record<string, unknown>;
  errorCode?: string;
  errorDetail?: string;
}

export interface IntelligenceConsumer {
  ingest(
    handoff: GuardInventoryV1,
    metadata: { lockfilePath: string; inventoryDigest: string; unsupportedCount: number },
  ): Promise<IntelligenceConsumerResult>;
  assessCurrentExposure?(scope: Scope): Promise<ExposureReport | null>;
}

export function extractInventoryFromScan(job: ScanJob): InventoryItem[] {
  if (Array.isArray(job.inventory) && job.inventory.length > 0) {
    return job.inventory;
  }
  const components = job.sbom?.components ?? [];
  return components.map((c) => {
    const ecosystem =
      c.properties?.find((p) => p.name === "wetscan:ecosystem")?.value ?? "npm";
    const sourcePath =
      c.properties?.find((p) => p.name === "wetscan:source-path")?.value ??
      "package-lock.json";
    const lic = c.licenses?.[0]?.license?.name;
    return {
      name: c.name,
      version: c.version,
      ecosystem,
      license: lic && lic.trim() ? lic.trim() : null,
      sourcePath,
    };
  });
}

export function normalizeInventoryForG06(
  commitSha: string,
  rawItems: readonly InventoryItem[],
): NormalizedGuardInventory {
  const deduped = new Map<string, InventoryItem>();
  for (const item of rawItems) {
    const ecosystem = (item.ecosystem || "unknown").trim().toLowerCase();
    const name = item.name.trim();
    const version = item.version.trim();
    const sourcePath =
      normalizeRepoPath(item.sourcePath) ??
      (item.sourcePath || "package-lock.json").trim().replaceAll("\\", "/");
    if (!name || !version) continue;
    const license =
      typeof item.license === "string" && item.license.trim().length > 0
        ? item.license.trim()
        : null;
    const key = `${ecosystem}:${name}:${version}:${sourcePath}`;
    if (!deduped.has(key)) {
      deduped.set(key, { ecosystem, name, version, license, sourcePath });
    }
  }

  const items = [...deduped.values()].sort(
    (a, b) =>
      a.ecosystem.localeCompare(b.ecosystem) ||
      a.name.localeCompare(b.name) ||
      a.version.localeCompare(b.version) ||
      a.sourcePath.localeCompare(b.sourcePath),
  );

  const lockfilePath =
    items.find((i) => i.sourcePath.endsWith("package-lock.json"))?.sourcePath ??
    items[0]?.sourcePath ??
    "package-lock.json";

  const inventoryDigest = createHash("sha256")
    .update(
      JSON.stringify({
        commitSha,
        lockfilePath,
        items: items.map((i) => ({
          ecosystem: i.ecosystem,
          name: i.name,
          version: i.version,
          license: i.license,
          sourcePath: i.sourcePath,
        })),
      }),
    )
    .digest("hex");

  const sentinelMap = new Map<string, SentinelInventoryItem>();
  let unsupportedCount = 0;
  let unknownLicenseCount = 0;
  for (const item of items) {
    if (!item.license) unknownLicenseCount += 1;
    if (item.ecosystem === "npm") {
      const k = `npm:${item.name}:${item.version}`;
      if (!sentinelMap.has(k)) {
        sentinelMap.set(k, {
          ecosystem: "npm",
          name: item.name,
          version: item.version,
          scope: "unknown",
        });
      }
    } else {
      unsupportedCount += 1;
    }
  }

  return {
    commitSha,
    lockfilePath,
    inventoryDigest,
    items,
    sentinelItems: [...sentinelMap.values()],
    unsupportedCount,
    unknownLicenseCount,
  };
}

export class SentinelS09IntelligenceConsumer implements IntelligenceConsumer {
  constructor(private readonly sentinelDb: PlatformDatabase) {}

  async ingest(
    handoff: GuardInventoryV1,
    metadata: { lockfilePath: string; inventoryDigest: string; unsupportedCount: number },
  ): Promise<IntelligenceConsumerResult> {
    const commitSha = handoff.repository.commit;
    if (!/^[a-f0-9]{40}$/.test(commitSha)) {
      return {
        outcome: "rejected",
        syncStatus: "failed",
        sentinelSnapshotId: null,
        exposureAssessment: null,
        exposureCount: 0,
        exposureSummary: {},
        errorCode: "invalid_commit_sha",
        errorDetail: "Inventory handoff requires 40-char commit SHA.",
      };
    }

    const npmSeen = new Map<string, SentinelInventoryItem>();
    let nonNpm = 0;
    for (const item of handoff.inventory) {
      if (item.ecosystem.toLowerCase() === "npm") {
        const key = `${item.name}:${item.version}`;
        if (!npmSeen.has(key)) {
          npmSeen.set(key, {
            ecosystem: "npm",
            name: item.name,
            version: item.version,
            scope: "unknown",
          });
        }
      } else {
        nonNpm += 1;
      }
    }

    const ctx: SentinelProjectContext = {
      scope: {
        mode: "live",
        workspaceId: handoff.workspaceId,
        projectId: handoff.projectId,
      },
      actorId: `guard:${handoff.scanId}`,
      repositoryId: String(handoff.repository.repositoryId),
      canvasProjectRef: handoff.projectId,
    };

    try {
      const store = new InventoryStore(this.sentinelDb);
      const saved = await store.save(ctx, {
        commitSha,
        lockfilePath: metadata.lockfilePath || "package-lock.json",
        lockfileSha256: metadata.inventoryDigest,
        lockfileVersion: 3,
        items: [...npmSeen.values()],
      });
      const report = await assessExposure(this.sentinelDb, ctx.scope);
      return {
        outcome: "acknowledged",
        syncStatus: "acknowledged",
        sentinelSnapshotId: saved.snapshotId,
        exposureAssessment: report.assessment,
        exposureCount: report.exposures.length,
        exposureSummary: {
          itemsTotal: report.coverage.itemsTotal,
          itemsAssessable: report.coverage.itemsAssessable,
          catalogSources: report.coverage.catalogSources,
          unsupportedEcosystems: [
            ...new Set([
              ...report.coverage.unsupportedEcosystems,
              ...(nonNpm > 0 || metadata.unsupportedCount > 0
                ? ["non_npm_guard_items"]
                : []),
            ]),
          ],
          exposures: report.exposures.slice(0, 20).map((e) => ({
            canonicalId: e.canonicalId,
            packageName: e.packageName,
            installedVersion: e.installedVersion,
            severity: e.topSeverity,
            kev: e.kev,
            summary: `${e.sources.length} advisory source(s)${e.conflicting ? " (conflicting)" : ""}`,
          })),
          message: report.message,
        },
      };
    } catch (error) {
      if (error instanceof TelemetryError) {
        if (error.code === "project_not_registered") {
          return {
            outcome: "retryable_error",
            syncStatus: "project_not_registered",
            sentinelSnapshotId: null,
            exposureAssessment: "cannot_assess",
            exposureCount: 0,
            exposureSummary: {
              errorCode: error.code,
              message:
                "Project is not registered in Sentinel (sentinel.project_bindings) yet; queued for retry once registered.",
            },
            errorCode: error.code,
            errorDetail: "Project binding absent in Sentinel DB.",
          };
        }
        return {
          outcome: "rejected",
          syncStatus: "failed",
          sentinelSnapshotId: null,
          exposureAssessment: null,
          exposureCount: 0,
          exposureSummary: { errorCode: error.code },
          errorCode: error.code,
          errorDetail: error.message,
        };
      }
      return {
        outcome: "consumer_unavailable",
        syncStatus: "consumer_unavailable",
        sentinelSnapshotId: null,
        exposureAssessment: null,
        exposureCount: 0,
        exposureSummary: {
          errorCode: "sentinel_db_error",
          message: error instanceof Error ? error.message : String(error),
        },
        errorCode: "sentinel_db_error",
        errorDetail: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async assessCurrentExposure(scope: Scope): Promise<ExposureReport | null> {
    try {
      return await assessExposure(this.sentinelDb, {
        mode: "live",
        workspaceId: scope.workspaceId,
        projectId: scope.projectId,
      });
    } catch {
      return null;
    }
  }
}

export class UnconfiguredIntelligenceConsumer implements IntelligenceConsumer {
  async ingest(): Promise<IntelligenceConsumerResult> {
    return {
      outcome: "consumer_unavailable",
      syncStatus: "consumer_unavailable",
      sentinelSnapshotId: null,
      exposureAssessment: null,
      exposureCount: 0,
      exposureSummary: {
        errorCode: "sentinel_external_db_not_configured",
        message:
          "Sentinel External Intelligence database (SENTINEL_DB_*) is not configured in Guard worker environment. Inventory preserved in guard.g06_outbox.",
      },
      errorCode: "sentinel_external_db_not_configured",
      errorDetail: "Sentinel External Intelligence DB unavailable to worker.",
    };
  }
}

export async function openSentinelConsumerFromEnv(
  env: Readonly<Record<string, string | undefined>> = process.env,
): Promise<{
  consumer: IntelligenceConsumer;
  configured: boolean;
  close: () => Promise<void>;
}> {
  const approvalFile =
    env.SENTINEL_DB_APPROVAL_FILE ?? env.SENTINEL_DB_APP_APPROVAL_FILE;
  if (!approvalFile || !env.SENTINEL_DB_APP_PASSWORD_FILE) {
    return {
      consumer: new UnconfiguredIntelligenceConsumer(),
      configured: false,
      close: async () => undefined,
    };
  }
  try {
    const resolvedEnv = {
      ...env,
      SENTINEL_DB_APPROVAL_FILE: approvalFile,
    };
    const plan = await migrationPlan();
    const cfg = await approvedDatabaseConfig(
      resolvedEnv,
      "app",
      "runtime",
      plan.sha256,
    );
    const pool = new ApprovedPool(cfg);
    const db = new PlatformDatabase(pool, false, "sentinel");
    return {
      consumer: new SentinelS09IntelligenceConsumer(db),
      configured: true,
      close: () => pool.end(),
    };
  } catch {
    return {
      consumer: new UnconfiguredIntelligenceConsumer(),
      configured: false,
      close: async () => undefined,
    };
  }
}

export class G06IntelligenceAdapter implements IntelligencePort {
  constructor(
    private readonly store: G06PostgresStore,
    private readonly context: {
      repository: RepositoryRef;
      scanId: string;
      actor?: string;
      origin?: "observed_scan" | "controlled_test";
      occurredAt?: string;
    },
  ) {}

  async publish(
    grant: Grant,
    scope: Scope,
    commit: string,
    inventory: InventoryItem[],
  ): Promise<IntegrationResult<{ deliveryId: string }>> {
    const norm = normalizeInventoryForG06(commit, inventory);
    const occurredAt = this.context.occurredAt ?? new Date().toISOString();
    const digest = stableDigest({
      projectId: scope.projectId,
      scanId: this.context.scanId,
      commit,
      inventoryDigest: norm.inventoryDigest,
    });
    const idempotencyKey = `intel:${scope.projectId}:${commit}:${norm.inventoryDigest}`;
    const deliveryId = `ginv_${digest.slice(0, 24)}`;
    const origin = this.context.origin ?? "observed_scan";

    const handoff: GuardInventoryV1 = {
      schemaVersion: 1,
      producer: "guard",
      mode: "live",
      workspaceId: scope.workspaceId,
      projectId: scope.projectId,
      deliveryId,
      idempotencyKey,
      repository: { ...this.context.repository, commit },
      evidence: [
        {
          id: `scan:${this.context.scanId}`,
          sourceId: `guard:${this.context.scanId}`,
          origin,
          occurredAt,
          recordedAt: occurredAt,
        },
      ],
      occurredAt,
      category: "dependency_inventory",
      scanId: this.context.scanId,
      inventory: norm.items,
      exposureBasis: "repository_only",
    };

    const proof: GuardProducerProof = {
      scope: {
        mode: "live",
        workspaceId: scope.workspaceId,
        projectId: scope.projectId,
      },
      scanId: this.context.scanId,
      repository: { ...this.context.repository, commit },
      evidenceIds: [`scan:${this.context.scanId}`],
      origin,
    };

    validateGuardHandoff(grant, handoff, proof);

    const { record } = await this.store.enqueueOutbox(scope, {
      topic: "intelligence_inventory",
      scanId: this.context.scanId,
      commitSha: commit,
      idempotencyKey,
      eventType: "dependency_inventory",
      schemaVersion: "guard.inventory.v1",
      payload: {
        handoff,
        metadata: {
          lockfilePath: norm.lockfilePath,
          inventoryDigest: norm.inventoryDigest,
          unsupportedCount: norm.unsupportedCount,
          unknownLicenseCount: norm.unknownLicenseCount,
          itemCount: norm.items.length,
        },
      },
      actor: this.context.actor ?? grant.actorId,
    });

    await this.store.upsertIntelligenceSync(scope, {
      deliveryId: record.deliveryId,
      scanId: this.context.scanId,
      commitSha: commit,
      inventoryDigest: norm.inventoryDigest,
      lockfilePath: norm.lockfilePath,
      itemCount: norm.items.length,
      unsupportedCount: norm.unsupportedCount,
      syncStatus: "pending",
      sentinelSnapshotId: null,
      exposureAssessment: null,
      exposureCount: 0,
      exposureSummary: {
        message: "Enqueued to Guard outbox for Sentinel S09 exposure correlation.",
      },
      acknowledgedAt: null,
    });

    return {
      status: "available",
      value: { deliveryId: record.deliveryId },
    };
  }
}

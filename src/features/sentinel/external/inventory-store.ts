import { randomUUID } from "node:crypto";
import type { PlatformDatabase } from "../../../platform/database";
import { TelemetryError } from "../telemetry/validation";
import type { SentinelProjectContext, SentinelScope } from "../types";
import {
  catalogLimits,
  type DependencyInventoryPort,
  type InventoryItem,
  type InventorySnapshot,
} from "./model";

const iso = (v: unknown) => new Date(v as string).toISOString();
const where = "mode=$1 AND workspace_id=$2 AND project_id=$3";
const sv = (s: SentinelScope) => [s.mode, s.workspaceId, s.projectId];
function view(
  r: Record<string, unknown>,
  scope: SentinelScope,
): InventorySnapshot {
  return {
    ...scope,
    snapshotId: r.snapshot_id as string,
    sourceKind: "repository_lockfile",
    repositoryId: r.repository_id as string,
    commitSha: r.commit_sha as string,
    lockfilePath: r.lockfile_path as string,
    lockfileSha256: r.lockfile_sha256 as string,
    lockfileVersion: Number(r.lockfile_version),
    itemCount: Number(r.item_count),
    ecosystems: r.ecosystems as string[],
    collectedBy: r.collected_by as string,
    collectedAt: iso(r.collected_at),
    expiresAt: iso(r.expires_at),
  };
}
export interface SnapshotInput {
  commitSha: string;
  lockfilePath: string;
  lockfileSha256: string;
  lockfileVersion: number;
  items: InventoryItem[];
}
/** Project-private declared-dependency snapshots. Scope and actor always come from the authorized server context. */
export class InventoryStore {
  constructor(private readonly db: PlatformDatabase) {}
  async latest(scope: SentinelScope): Promise<InventorySnapshot | null> {
    return this.db.scoped(scope, async (tx) => {
      const r = await this.db.query(
        tx,
        `SELECT * FROM sentinel.ext_inventory_snapshots WHERE ${where} ORDER BY collected_at DESC,snapshot_id LIMIT 1`,
        sv(scope),
      );
      return r.rows[0] ? view(r.rows[0], scope) : null;
    });
  }
  async items(scope: SentinelScope, snapshotId: string) {
    return this.db.scoped(
      scope,
      async (tx) =>
        (
          await this.db.query(
            tx,
            `SELECT ecosystem,package_name,version,dep_scope FROM sentinel.ext_inventory_items WHERE ${where} AND snapshot_id=$4 ORDER BY ecosystem,package_name,version`,
            [...sv(scope), snapshotId],
          )
        ).rows,
    );
  }
  /** Same commit + same lockfile bytes ⇒ the existing immutable snapshot is re-verified (validity extended), never duplicated. */
  async save(
    ctx: SentinelProjectContext,
    input: SnapshotInput,
  ): Promise<InventorySnapshot> {
    if (
      !/^[a-f0-9]{40}$/.test(input.commitSha) ||
      !/^[a-f0-9]{64}$/.test(input.lockfileSha256) ||
      input.items.length > catalogLimits.inventoryItems
    )
      throw new TelemetryError("invalid_inventory");
    const scope = ctx.scope;
    return this.db.scoped(scope, async (tx) => {
      const bound = await this.db.query(
        tx,
        `SELECT 1 FROM sentinel.project_bindings WHERE ${where} AND enabled FOR SHARE`,
        sv(scope),
      );
      if (!bound.rowCount)
        throw new TelemetryError("project_not_registered", 409);
      const ttl = `${catalogLimits.inventoryMaxAgeHours} hours`;
      const found = await this.db.query(
        tx,
        `UPDATE sentinel.ext_inventory_snapshots SET collected_at=clock_timestamp(),expires_at=clock_timestamp()+interval '${ttl}',collected_by=$6
         WHERE ${where} AND commit_sha=$4 AND lockfile_sha256=$5 RETURNING *`,
        [...sv(scope), input.commitSha, input.lockfileSha256, ctx.actorId],
      );
      if (found.rows[0]) return view(found.rows[0], scope);
      const snapshotId = randomUUID();
      const ecosystems = [
        ...new Set(input.items.map((i) => i.ecosystem)),
      ].sort();
      const created = await this.db.query(
        tx,
        `INSERT INTO sentinel.ext_inventory_snapshots(mode,workspace_id,project_id,snapshot_id,source_kind,repository_id,commit_sha,lockfile_path,lockfile_sha256,lockfile_version,item_count,ecosystems,collected_by,expires_at)
         VALUES($1,$2,$3,$4,'repository_lockfile',$5,$6,$7,$8,$9,$10,$11,$12,clock_timestamp()+interval '${ttl}') RETURNING *`,
        [
          ...sv(scope),
          snapshotId,
          ctx.repositoryId,
          input.commitSha,
          input.lockfilePath,
          input.lockfileSha256,
          input.lockfileVersion,
          input.items.length,
          ecosystems,
          ctx.actorId,
        ],
      );
      if (input.items.length)
        await this.db.query(
          tx,
          `INSERT INTO sentinel.ext_inventory_items(mode,workspace_id,project_id,snapshot_id,ecosystem,package_name,version,dep_scope)
           SELECT $1,$2,$3,$4,ecosystem,package_name,version,dep_scope
           FROM jsonb_to_recordset($5::jsonb) AS x(ecosystem text,package_name text,version text,dep_scope text)`,
          [
            ...sv(scope),
            snapshotId,
            JSON.stringify(
              input.items.map((i) => ({
                ecosystem: i.ecosystem,
                package_name: i.name,
                version: i.version,
                dep_scope: i.scope ?? "unknown",
              })),
            ),
          ],
        );
      // Bounded retention: keep the newest snapshots; items go first (no cascade, no silent loss of the latest).
      const old = `SELECT snapshot_id FROM sentinel.ext_inventory_snapshots WHERE ${where} ORDER BY collected_at DESC,snapshot_id OFFSET ${catalogLimits.inventoryKeep}`;
      await this.db.query(
        tx,
        `DELETE FROM sentinel.ext_inventory_items WHERE ${where} AND snapshot_id IN (${old})`,
        sv(scope),
      );
      await this.db.query(
        tx,
        `DELETE FROM sentinel.ext_inventory_snapshots WHERE ${where} AND snapshot_id IN (${old})`,
        sv(scope),
      );
      return view(created.rows[0], scope);
    });
  }
}
export const lockfileInventoryPort = (
  store: InventoryStore,
): DependencyInventoryPort => ({
  source: "repository_lockfile",
  configured: true,
  latest: (scope) => store.latest(scope),
});
/** Guard GRD-020 producer: not integrated. Nothing writes a guard-sourced snapshot and this port never reports one. */
export const guardInventoryPort: DependencyInventoryPort = {
  source: "guard_grd020",
  configured: false,
  latest: async () => null,
};

import { realpath, stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { isAbsolute, resolve, relative, sep } from "node:path";
import { createHash } from "node:crypto";
import type { DatabaseApproval } from "../../src/platform/config";
import { PlatformError } from "../../src/platform/config";
import type { EvidenceSnapshot } from "./telemetry-retest-safety";
import { uuid, object } from "../../src/features/sentinel/telemetry/validation";

export const reviewedS03Plan =
  "c3e39f6fd43ee6eb2fbf5b244778955aab4cabb8a11ed3c66d791cf99a252a94";
export function snapshotDigest(snapshot: EvidenceSnapshot) {
  return createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
}
export async function acceptancePermission(
  approval: DatabaseApproval & { s03Acceptance?: unknown },
) {
  const raw = (approval as DatabaseApproval & { s03Acceptance?: unknown })
    .s03Acceptance;
  const p = object(raw, [
    "fixtureId",
    "baselineSha256",
    "backupFile",
    "backupSha256",
    "operations",
  ]);
  const fixtureId = uuid(p.fixtureId);
  if (
    typeof p.baselineSha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(p.baselineSha256) ||
    typeof p.backupFile !== "string" ||
    !isAbsolute(p.backupFile) ||
    typeof p.backupSha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(p.backupSha256) ||
    JSON.stringify(p.operations) !==
      JSON.stringify([
        "up_up",
        "new_fixtures",
        "process_fixture_jobs",
        "expire_fixture_lease",
        "fixture_hold_transitions",
        "negative_dml_rollback",
        "populated_down_refusal",
      ])
  )
    throw new PlatformError("approval_required");
  const path = await realpath(resolve(p.backupFile)),
    rel = relative(process.cwd(), path);
  const outside = isAbsolute(rel) || rel === ".." || rel.startsWith(`..${sep}`);
  if (!outside || /onedrive/i.test(path))
    throw new PlatformError("target_denied");
  if (!(await stat(path)).isFile())
    throw new PlatformError("approval_required");
  const info = await stat(path),
    digest = createHash("sha256");
  for await (const chunk of createReadStream(path)) digest.update(chunk);
  if (!info.size || digest.digest("hex") !== p.backupSha256)
    throw new PlatformError("approval_required");
  return {
    fixtureId,
    workspaceId: `github-user-7:s03-${fixtureId}`,
    baselineSha256: p.baselineSha256,
  };
}
export function preserveS02(before: EvidenceSnapshot, after: EvidenceSnapshot) {
  for (const [table, hashes] of Object.entries(before.rows)) {
    const retained = after.rows[table].slice();
    for (const hash of hashes) {
      const at = retained.indexOf(hash);
      if (at < 0) throw Error("historical_row_changed:" + table);
      retained.splice(at, 1);
    }
  }
  const oldTables = new Set(
    before.structure.catalog.map((r) => `${r.nspname}.${r.relname}`),
  );
  if (
    JSON.stringify(before.ledger) !==
      JSON.stringify(after.ledger.slice(0, 2)) ||
    JSON.stringify(before.structure.roles) !==
      JSON.stringify(after.structure.roles)
  )
    throw Error("historical_identity_or_ledger_changed");
  for (const type of ["catalog", "policies", "grants"] as const) {
    const key = (r: Record<string, unknown>) =>
      type === "catalog"
        ? `${r.nspname}.${r.relname}`
        : type === "policies"
          ? `${r.schemaname}.${r.tablename}`
          : `${r.table_schema}.${r.table_name}`;
    const selected = after.structure[type].filter((r) => oldTables.has(key(r)));
    if (JSON.stringify(before.structure[type]) !== JSON.stringify(selected))
      throw Error("historical_catalog_or_permissions_changed:" + type);
  }
}

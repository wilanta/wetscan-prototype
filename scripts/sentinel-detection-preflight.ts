import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ApprovedPool } from "../src/platform/database";
import { approvedDatabaseConfig, PlatformError } from "../src/platform/config";
import { migrationPlan } from "../src/platform/migrations";
import { evidenceSnapshot } from "../tests/sentinel/telemetry-retest-safety";
import {
  reviewedS03Plan,
  snapshotDigest,
} from "../tests/sentinel/detection-acceptance-safety";

/** Read-only TEST preflight, separately approved. No migrations, fixtures, backup deletion or process activation. */
async function main() {
  if (!process.argv.includes("--read-only"))
    throw new PlatformError("approval_required");
  const config = await approvedDatabaseConfig(
    process.env,
    "migration",
    "runtime",
    reviewedS03Plan,
  );
  const plan = await migrationPlan();
  if (plan.sha256 !== reviewedS03Plan)
    throw new PlatformError("approval_required");
  if (
    config.target.host !== "127.0.0.1" ||
    config.target.port !== 55432 ||
    config.target.database !== "wetscan_s01_test" ||
    config.target.marker !==
      "wetscan-s01:9f3560a6-127f-42a6-abaf-9f45951e6bd5" ||
    (
      config.approval as typeof config.approval & {
        s03ReadOnlyPreflight?: boolean;
      }
    ).s03ReadOnlyPreflight !== true
  )
    throw new PlatformError("approval_required");
  const pool = new ApprovedPool(config);
  try {
    const client = await pool.connect();
    try {
      await client.query("BEGIN READ ONLY");
      const identity = (
        await client.query(
          "SELECT current_setting('server_version_num')::int AS version,pg_get_userbyid(datdba) AS owner,current_setting('max_connections')::int AS connections,to_regclass('sentinel.telemetry_detection_window') AS unexpected_index FROM pg_database WHERE datname=current_database()",
        )
      ).rows[0];
      const memberships = (
        await client.query(
          "SELECT count(*)::int AS n FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.member WHERE r.rolname IN ('wetscan_app','wetscan_sentinel_worker','wetscan_migrator')",
        )
      ).rows[0].n;
      const defaults = (
        await client.query(
          "SELECT count(*)::int AS n FROM pg_default_acl WHERE defaclrole=(SELECT oid FROM pg_roles WHERE rolname='wetscan_migrator')",
        )
      ).rows[0].n;
      if (
        identity.version !== 170012 ||
        identity.owner !== "wetscan_migrator" ||
        identity.connections !== 40 ||
        identity.unexpected_index ||
        memberships !== 0 ||
        defaults !== 0
      )
        throw new PlatformError("target_denied");
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
    const snapshot = await evidenceSnapshot(pool);
    if (
      JSON.stringify(snapshot.ledger.map((r) => [r.version, r.checksum])) !==
        JSON.stringify(
          plan.migrations.slice(0, 2).map((m) => [m.version, m.checksum]),
        ) ||
      snapshot.structure.catalog.length !== 12 ||
      snapshot.structure.catalog.some((r) =>
        String(r.relname).startsWith("detection_"),
      ) ||
      snapshot.structure.roles.length !== 3 ||
      snapshot.structure.roles.some(
        (r) =>
          r.rolsuper ||
          r.rolbypassrls ||
          r.rolcreatedb ||
          r.rolcreaterole ||
          !r.rolcanlogin,
      )
    )
      throw new PlatformError("target_denied");
    const baselineSha256 = snapshotDigest(snapshot),
      fixtureId = randomUUID();
    const path = join(
      process.cwd(),
      ".local",
      "sentinel",
      `s03-test-preflight-${fixtureId}.json`,
    );
    await mkdir(join(process.cwd(), ".local", "sentinel"), { recursive: true });
    await writeFile(
      path,
      JSON.stringify(
        {
          recordedAt: new Date().toISOString(),
          target: config.target,
          baselineSha256,
          proposedFixtureId: fixtureId,
          snapshot,
          mutations: 0,
        },
        null,
        2,
      ) + "\n",
      { flag: "wx" },
    );
    console.log(
      JSON.stringify({
        status: "READ_ONLY_PREFLIGHT_ONLY",
        target: config.target,
        ledger: snapshot.ledger,
        baselineSha256,
        proposedFixtureId: fixtureId,
        counts: snapshot.counts,
        privateEvidence: path,
        backup: "OWNER_APPROVED_VERIFIED_BACKUP_STILL_REQUIRED",
        mutations: 0,
        acceptance: "NOT_AUTHORIZED_BY_PREFLIGHT",
      }),
    );
  } finally {
    await pool.end();
  }
}
main().catch((e) => {
  console.error(
    JSON.stringify({
      status: "BLOCKED_OR_FAILED",
      reason:
        e instanceof PlatformError ? e.code : "read_only_preflight_failed",
      secretsLogged: false,
    }),
  );
  process.exitCode = 2;
});

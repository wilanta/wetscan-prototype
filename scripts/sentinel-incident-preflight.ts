import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ApprovedPool } from "../src/platform/database";
import { approvedDatabaseConfig, PlatformError } from "../src/platform/config";
import { migrationPlan } from "../src/platform/migrations";
import { evidenceSnapshot } from "../tests/sentinel/telemetry-retest-safety";
import {
  fullS04EvidenceSnapshot,
  preserveAllS04CommittedRows,
  reviewedS04Plan,
  snapshotDigest,
  type FullS04Snapshot,
} from "../tests/sentinel/incident-acceptance-safety";

function flagValue(prefix: string): string | undefined {
  const exact = process.argv.find((a) => a.startsWith(`${prefix}=`));
  if (exact) return exact.slice(prefix.length + 1);
  const idx = process.argv.indexOf(prefix);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

/** Read-only S04 TEST preflight/postflight, separately approved. No migrations, fixtures, backup deletion or process activation. */
async function main() {
  const readOnly = process.argv.includes("--read-only");
  const postH04b = process.argv.includes("--post-h04b");
  const postflightPath = flagValue("--postflight");
  if (!readOnly && !postH04b && !postflightPath)
    throw new PlatformError("approval_required");
  if ([readOnly, postH04b, Boolean(postflightPath)].filter(Boolean).length > 1)
    throw new PlatformError("invalid_input");
  const config = await approvedDatabaseConfig(
    process.env,
    "migration",
    "runtime",
    reviewedS04Plan,
  );
  const plan = await migrationPlan();
  if (plan.sha256 !== reviewedS04Plan)
    throw new PlatformError("approval_required");
  if (
    config.target.host !== "127.0.0.1" ||
    config.target.port !== 55432 ||
    config.target.database !== "wetscan_s01_test" ||
    config.target.marker !==
      "wetscan-s01:9f3560a6-127f-42a6-abaf-9f45951e6bd5" ||
    (
      config.approval as typeof config.approval & {
        s04ReadOnlyPreflight?: boolean;
      }
    ).s04ReadOnlyPreflight !== true
  )
    throw new PlatformError("approval_required");
  const pool = new ApprovedPool(config);
  try {
    const client = await pool.connect();
    try {
      await client.query("BEGIN READ ONLY");
      const identity = (
        await client.query(
          "SELECT current_setting('server_version_num')::int AS version,pg_get_userbyid(datdba) AS owner,current_setting('max_connections')::int AS connections,to_regclass('sentinel.incidents') AS existing_incidents FROM pg_database WHERE datname=current_database()",
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
      const expectsAppliedS04 = postH04b || Boolean(postflightPath);
      if (
        identity.version < 170000 ||
        identity.owner !== "wetscan_migrator" ||
        identity.connections !== 40 ||
        (expectsAppliedS04
          ? !identity.existing_incidents
          : Boolean(identity.existing_incidents)) ||
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

    if (postflightPath) {
      const saved = JSON.parse(await readFile(postflightPath, "utf8")) as {
        fullSnapshot: FullS04Snapshot;
        proposedFixtureId: string;
        target: typeof config.target;
      };
      if (
        JSON.stringify(saved.target) !== JSON.stringify(config.target) ||
        !saved.fullSnapshot
      )
        throw new PlatformError("target_denied");
      const afterFull = await fullS04EvidenceSnapshot(pool);
      preserveAllS04CommittedRows(saved.fullSnapshot, afterFull);
      if (
        JSON.stringify(afterFull.ledger.map((r) => [r.version, r.checksum])) !==
          JSON.stringify(plan.migrations.map((m) => [m.version, m.checksum])) ||
        afterFull.catalogCount !== 25 ||
        afterFull.activeLeases !== 0
      )
        throw new PlatformError("target_denied");
      const checkClient = await pool.connect();
      let orphans = -1;
      try {
        await checkClient.query("BEGIN READ ONLY");
        orphans = Number(
          (
            await checkClient.query(
              "SELECT count(*)::int AS n FROM sentinel.incident_timeline_evidence ite LEFT JOIN sentinel.incident_timeline t USING(mode,workspace_id,project_id,incident_id,timeline_id) WHERE t.timeline_id IS NULL",
            )
          ).rows[0]?.n ?? -1,
        );
        await checkClient.query("COMMIT");
      } finally {
        checkClient.release();
      }
      if (orphans !== 0) throw new Error(`orphaned_timeline_evidence:${orphans}`);
      let backupVerified: { size: number; sha256: string } | undefined;
      if (process.env.SENTINEL_S04_BACKUP_FILE) {
        const info = await stat(process.env.SENTINEL_S04_BACKUP_FILE);
        const h = createHash("sha256");
        for await (const c of createReadStream(
          process.env.SENTINEL_S04_BACKUP_FILE,
        ))
          h.update(c);
        const sha256 = h.digest("hex");
        if (
          process.env.SENTINEL_S04_BACKUP_SHA256 &&
          sha256 !== process.env.SENTINEL_S04_BACKUP_SHA256
        )
          throw new PlatformError("target_denied");
        backupVerified = { size: info.size, sha256 };
      }
      console.log(
        JSON.stringify({
          status: "POST_H04B_READ_ONLY_POSTFLIGHT_PASS",
          target: config.target,
          fixtureId: saved.proposedFixtureId,
          preservedTables: Object.keys(saved.fullSnapshot.rows).length,
          catalogCount: afterFull.catalogCount,
          activeLeases: afterFull.activeLeases,
          orphanedTimelineEvidence: orphans,
          beforeCounts: saved.fullSnapshot.counts,
          afterCounts: afterFull.counts,
          backupVerified,
          mutations: 0,
        }),
      );
      return;
    }

    const snapshot = await evidenceSnapshot(pool);
    const fullSnapshot = postH04b
      ? await fullS04EvidenceSnapshot(pool)
      : undefined;
    if (
      JSON.stringify(snapshot.ledger.map((r) => [r.version, r.checksum])) !==
        JSON.stringify(
          (postH04b ? plan.migrations : plan.migrations.slice(0, 3)).map((m) => [
            m.version,
            m.checksum,
          ]),
        ) ||
      snapshot.structure.catalog.length !== (postH04b ? 25 : 20) ||
      (postH04b
        ? fullSnapshot!.activeLeases !== 0
        : snapshot.structure.catalog.some((r) =>
            String(r.relname).startsWith("incident"),
          )) ||
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
      fullBaselineSha256 = fullSnapshot
        ? createHash("sha256")
            .update(JSON.stringify(fullSnapshot))
            .digest("hex")
        : undefined,
      fixtureId = randomUUID();
    const path = join(
      process.cwd(),
      ".local",
      "sentinel",
      postH04b
        ? `s04-test-regression-preflight-${fixtureId}.json`
        : `s04-test-preflight-${fixtureId}.json`,
    );
    await mkdir(join(process.cwd(), ".local", "sentinel"), { recursive: true });
    await writeFile(
      path,
      JSON.stringify(
        {
          recordedAt: new Date().toISOString(),
          target: config.target,
          baselineSha256,
          ...(fullBaselineSha256 ? { fullBaselineSha256, fullSnapshot } : {}),
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
        status: postH04b
          ? "POST_H04B_READ_ONLY_PREFLIGHT_OK"
          : "READ_ONLY_PREFLIGHT_ONLY",
        target: config.target,
        ledger: snapshot.ledger,
        baselineSha256,
        ...(fullBaselineSha256
          ? {
              fullBaselineSha256,
              fullCounts: fullSnapshot!.counts,
              activeLeases: fullSnapshot!.activeLeases,
            }
          : {}),
        proposedFixtureId: fixtureId,
        counts: snapshot.counts,
        privateEvidence: path,
        backup: postH04b
          ? "EXISTING_H04A_BACKUP_MUST_BE_PRESERVED"
          : "OWNER_APPROVED_VERIFIED_BACKUP_STILL_REQUIRED",
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

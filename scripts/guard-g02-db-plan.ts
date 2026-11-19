/** Offline plan generator only. No pool, SQL execution, credential loader or role creation. */
import { mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { randomUUID } from "node:crypto";
import {
  guardMigrationPlan,
  GUARD_PLATFORM_BASELINE,
} from "../src/features/guard/live/migrations";
import { migrationPlan } from "../src/platform/migrations";
export async function g02DatabasePlan(marker = "wetscan-s01:" + randomUUID()) {
  if (
    !/^wetscan-s01:[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(
      marker,
    )
  )
    throw Error("invalid_g02_marker");
  const guard = await guardMigrationPlan(),
    platform = await migrationPlan(GUARD_PLATFORM_BASELINE);
  const header = `-- NOT AUTHORIZED / REVIEW ONLY. Do not run without separate owner database mutation approval.\n-- Exact target only: localhost:5432/wetscan_dev_guardg02; never the G01 fixture or external Sentinel DB.\n-- Reuse existing Guard roles. No CREATE ROLE, ALTER ROLE or passwords.\n`;
  const create =
    header +
    `-- Run once on a NEW maintenance connection to postgres, outside a transaction.\nCREATE DATABASE wetscan_dev_guardg02 OWNER wetscan_guard_migrator TEMPLATE template0 ENCODING 'UTF8';\n`;
  const preflight = `BEGIN;\nDO $g02$ BEGIN\n IF current_database()<>'wetscan_dev_guardg02' OR inet_server_port() IS DISTINCT FROM 5432 OR (SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname=current_database()) IS DISTINCT FROM 'wetscan_guard_migrator' OR (SELECT shobj_description(oid,'pg_database') FROM pg_database WHERE datname=current_database()) IS NOT NULL THEN RAISE EXCEPTION 'g02_new_unconfigured_target_required'; END IF;\n IF current_user<>'postgres' OR NOT (SELECT rolsuper FROM pg_roles WHERE rolname=current_user) THEN RAISE EXCEPTION 'g02_bootstrap_operator_required'; END IF;\n IF to_regnamespace('platform') IS NOT NULL OR to_regnamespace('guard') IS NOT NULL OR to_regnamespace('sentinel') IS NOT NULL THEN RAISE EXCEPTION 'g02_empty_database_required'; END IF;\n IF (SELECT count(*) FROM pg_roles WHERE rolname IN ('wetscan_guard_migrator','wetscan_guard_app','wetscan_guard_worker') AND NOT rolsuper AND NOT rolbypassrls AND rolcanlogin)<>3 THEN RAISE EXCEPTION 'g02_existing_guard_roles_required'; END IF;\n IF (SELECT count(*) FROM pg_roles WHERE rolname IN ('wetscan_app','wetscan_sentinel_worker'))<>2 THEN RAISE EXCEPTION 'g02_existing_shared_roles_required'; END IF;\nEND $g02$;\nCOMMENT ON DATABASE wetscan_dev_guardg02 IS '${marker}';\nREVOKE ALL ON DATABASE wetscan_dev_guardg02 FROM PUBLIC;\nGRANT CONNECT ON DATABASE wetscan_dev_guardg02 TO wetscan_guard_migrator,wetscan_guard_app,wetscan_guard_worker;\nSET LOCAL ROLE wetscan_guard_migrator;\nCREATE SCHEMA platform;\nCREATE TABLE platform.schema_migrations(version text PRIMARY KEY,checksum char(64) NOT NULL,applied_at timestamptz NOT NULL DEFAULT clock_timestamp());\nREVOKE ALL ON SCHEMA platform FROM PUBLIC;\n`;
  let apply =
    header +
    "-- New connection to the exact NEW database only. Full file, one transaction.\n" +
    preflight;
  for (const m of platform.migrations)
    apply +=
      `\n-- Shared immutable baseline ${m.version}; inert Sentinel namespaces exist ONLY inside this new isolated database.\n` +
      m.up +
      `\nINSERT INTO platform.schema_migrations(version,checksum) VALUES('${m.version}','${m.checksum}');\n`;
  apply +=
    "\n-- Guard schema and exact checksum.\n" +
    guard.migration.up +
    `\nINSERT INTO guard.schema_migrations(version,checksum) VALUES('${guard.migration.version}','${guard.migration.checksum}');\n`;
  const access = guard.artifacts.find(
    (a) => a.name === "platform-access.proposed.sql",
  )!;
  apply +=
    "\nRESET ROLE;\n-- Guard-only policies/grants inside this new database; no existing database is connected.\n" +
    access.sql +
    "\nCOMMIT;\n";
  const verify =
    header +
    `-- New connection to the NEW G02 target only. Whole file; includes its own ROLLBACK.
BEGIN READ ONLY;
DO $verify$ BEGIN
 IF current_database()<>'wetscan_dev_guardg02' OR inet_server_port() IS DISTINCT FROM 5432 OR (SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname=current_database()) IS DISTINCT FROM 'wetscan_guard_migrator' OR (SELECT shobj_description(oid,'pg_database') FROM pg_database WHERE datname=current_database()) IS DISTINCT FROM '${marker}' THEN RAISE EXCEPTION 'g02_exact_target_required'; END IF;
END $verify$;
SELECT jsonb_build_object(
 'classification','OWNER_READONLY_G02_POST_PROVISION_METADATA',
 'observedAt',clock_timestamp(),'database',current_database(),'port',inet_server_port(),'operator',current_user,
 'readOnly',current_setting('transaction_read_only')='on',
 'owner',(SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname=current_database()),
 'marker',(SELECT shobj_description(oid,'pg_database') FROM pg_database WHERE datname=current_database()),
 'platformLedger',(SELECT jsonb_agg(jsonb_build_object('version',version,'checksum',checksum) ORDER BY version) FROM platform.schema_migrations),
 'guardLedger',(SELECT jsonb_agg(jsonb_build_object('version',version,'checksum',checksum) ORDER BY version) FROM guard.schema_migrations),
 'guardBudget',(SELECT max_running FROM platform.module_limits WHERE module='guard'),
 'forcedRlsCount',(SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relrowsecurity AND c.relforcerowsecurity AND (n.nspname,c.relname) IN (('guard','scans'),('platform','jobs'),('platform','module_limits'))),
 'scanRows',(SELECT count(*) FROM guard.scans),'guardJobRows',(SELECT count(*) FROM platform.jobs WHERE module='guard'),
 'appScanPrivileges',has_table_privilege('wetscan_guard_app','guard.scans','SELECT') AND has_table_privilege('wetscan_guard_app','guard.scans','INSERT') AND has_table_privilege('wetscan_guard_app','guard.scans','UPDATE'),
 'workerScanPrivileges',has_table_privilege('wetscan_guard_worker','guard.scans','SELECT') AND has_table_privilege('wetscan_guard_worker','guard.scans','UPDATE') AND NOT has_table_privilege('wetscan_guard_worker','guard.scans','INSERT'),
 'appConnect',has_database_privilege('wetscan_guard_app',current_database(),'CONNECT'),
 'workerConnect',has_database_privilege('wetscan_guard_worker',current_database(),'CONNECT')
) AS g02_provisioned_metadata;
ROLLBACK;
`;
  return {
    target: {
      host: "localhost",
      port: 5432,
      database: "wetscan_dev_guardg02",
      marker,
    },
    guardPlanSha256: guard.sha256,
    platformPlanSha256: platform.sha256,
    platformVersions: guard.platformVersions,
    guardVersion: {
      version: guard.migration.version,
      checksum: guard.migration.checksum,
    },
    create,
    apply,
    verify,
    roleCreation: 0,
    passwordChanges: 0,
    existingDatabaseMutation: 0,
  };
}
async function main() {
  const dir = resolve(".local/g02-install/database-proposed");
  await mkdir(dir, { recursive: true });
  const p = await g02DatabasePlan();
  await writeFile(join(dir, "01-create-database.NOT_APPROVED.sql"), p.create, {
    flag: "wx",
  });
  await writeFile(join(dir, "02-schema.NOT_APPROVED.sql"), p.apply, {
    flag: "wx",
  });
  await writeFile(join(dir, "03-verify.READONLY.sql"), p.verify, {
    flag: "wx",
  });
  const metadata = {
    target: p.target,
    guardPlanSha256: p.guardPlanSha256,
    platformPlanSha256: p.platformPlanSha256,
    platformVersions: p.platformVersions,
    guardVersion: p.guardVersion,
    roleCreation: p.roleCreation,
    passwordChanges: p.passwordChanges,
    existingDatabaseMutation: p.existingDatabaseMutation,
  };
  await writeFile(
    join(dir, "plan.json"),
    JSON.stringify({ status: "NOT_AUTHORIZED", ...metadata }, null, 2),
    { flag: "wx" },
  );
  console.log(
    JSON.stringify({
      classification: "OFFLINE_PROPOSAL_ONLY",
      directory: dir,
      ...metadata,
      sqlExecuted: false,
    }),
  );
}
if (process.argv[1]?.replaceAll("\\", "/").endsWith("/guard-g02-db-plan.ts"))
  main().catch(() => {
    console.error(
      "G02 plan not written; preserve existing proposal and inspect the safe source.",
    );
    process.exitCode = 1;
  });

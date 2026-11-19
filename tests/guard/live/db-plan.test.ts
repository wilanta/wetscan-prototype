import { it, expect } from "vitest";
import { g02DatabasePlan } from "../../../scripts/guard-g02-db-plan";
it("proposes a new isolated target with immutable baselines and explicit bootstrap ownership", async () => {
  const p = await g02DatabasePlan();
  expect(p.target.database).toBe("wetscan_dev_guardg02");
  expect(p.target.marker).toMatch(/^wetscan-s01:[a-f0-9-]{36}$/);
  expect(p.create).toContain(
    "CREATE DATABASE wetscan_dev_guardg02 OWNER wetscan_guard_migrator",
  );
  expect(p.apply).toContain("g02_empty_database_required");
  expect(p.apply).toContain("g02_existing_shared_roles_required");
  expect(p.apply).toContain("wetscan_guard_app");
  expect(p.apply).not.toMatch(/^(?:CREATE|ALTER) ROLE /m);
  expect(p.apply).not.toContain("wetscan_s01_test_guardg01");
  expect(p.apply.indexOf("RESET ROLE;")).toBeGreaterThan(
    p.apply.indexOf("CREATE SCHEMA IF NOT EXISTS guard"),
  );
  expect(p.apply.indexOf("RESET ROLE;")).toBeLessThan(
    p.apply.indexOf(
      "INSERT INTO platform.module_limits(module,max_running) VALUES('guard',1)",
    ),
  );
  expect(p.apply).toContain(p.guardVersion.checksum);
  expect(p.roleCreation).toBe(0);
  expect(p.passwordChanges).toBe(0);
  expect(p.existingDatabaseMutation).toBe(0);
});

it("CREATE DATABASE is sent alone; metadata and schema share the second guarded transaction", async () => {
  const marker = "wetscan-s01:f0927e49-0e70-4b90-913f-6cd6984df9d8";
  const p = await g02DatabasePlan(marker),
    commands = p.create
      .replace(/^--.*$/gm, "")
      .trim()
      .split(";")
      .filter((x) => x.trim());
  expect(commands).toHaveLength(1);
  expect(commands[0]).toMatch(/^CREATE DATABASE/);
  expect(p.create).not.toContain("BEGIN;");
  expect(p.apply).toContain("g02_new_unconfigured_target_required");
  expect(p.apply).toContain("g02_bootstrap_operator_required");
  expect(p.apply).toContain("inet_server_port() IS DISTINCT FROM 5432");
  expect(p.apply).toContain(
    "IS NOT NULL THEN RAISE EXCEPTION 'g02_new_unconfigured_target_required'",
  );
  expect(p.apply.indexOf("END $g02$;")).toBeLessThan(
    p.apply.indexOf("COMMENT ON DATABASE"),
  );
  expect(p.apply.indexOf("COMMENT ON DATABASE")).toBeLessThan(
    p.apply.indexOf("SET LOCAL ROLE"),
  );
  expect(p.apply).toContain(
    "COMMENT ON DATABASE wetscan_dev_guardg02 IS '" + marker + "'",
  );
  expect(p.apply).toContain(
    "REVOKE ALL ON DATABASE wetscan_dev_guardg02 FROM PUBLIC",
  );
  expect(p.apply.trimEnd()).toMatch(/COMMIT;$/);
});
it("invalid marker never becomes interpolated SQL", async () => {
  await expect(
    g02DatabasePlan("wetscan-s01:';DROP DATABASE postgres;--"),
  ).rejects.toThrow("invalid_g02_marker");
});

it("post-provision observer binds the exact new target and remains read-only", async () => {
  const p = await g02DatabasePlan();
  expect(p.verify).toContain("BEGIN READ ONLY;");
  expect(p.verify.trimEnd()).toMatch(/ROLLBACK;$/);
  expect(p.verify).toContain(p.target.marker);
  expect(p.verify).toContain("wetscan_dev_guardg02");
  expect(p.verify).not.toMatch(
    /^(?:CREATE|ALTER|DROP|UPDATE|INSERT|DELETE|GRANT|REVOKE|COMMIT)\b/m,
  );
  expect(p.verify).toContain("'forcedRlsCount'");
  expect(p.verify).toContain("'workerScanPrivileges'");
});

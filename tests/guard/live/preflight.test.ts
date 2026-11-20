import { it, expect, vi } from "vitest";
import { mkdtemp, writeFile, rm, realpath } from "node:fs/promises";
import { join, basename, dirname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import {
  verifyProductDatabase,
  probeProductReadiness,
  verifyPhysical,
} from "../../../src/features/guard/live/product-preflight";
import { RecordingClient, fakePool } from "../../platform/helpers";
import { deploymentFixture } from "./operational-fixture";
const plan = {
  migration: { version: "0001_guard", checksum: "a".repeat(64) },
  platformVersions: [{ version: "0001_foundation", checksum: "b".repeat(64) }],
};
function databaseFixture(mode = "valid", purpose: "app" | "worker" = "worker") {
  const d = deploymentFixture(),
    c = new RecordingClient();
  let guardContext = false;
  c.respond = async (sql, values) => {
    if (sql.startsWith("SELECT set_config")) {
      guardContext = true;
      return { rows: [], rowCount: 0 };
    }
    if (sql.startsWith("SELECT current_database"))
      return {
        rowCount: 1,
        rows: [
          {
            database: d.target.database,
            marker: mode === "marker" ? "wrong" : d.target.marker,
            owner: "wetscan_guard_migrator",
            role: mode === "role" ? "postgres" : "wetscan_guard_" + purpose,
            readonly: "on",
            rolsuper: false,
            rolbypassrls: false,
          },
        ],
      };
    if (sql.includes("FROM guard.schema_migrations"))
      return { rowCount: 1, rows: [plan.migration] };
    if (sql.includes("FROM platform.schema_migrations"))
      return { rowCount: 1, rows: plan.platformVersions };
    if (sql.includes("FROM pg_class"))
      return { rowCount: 1, rows: [{ verified: mode === "rls" ? 2 : 3 }] };
    if (sql.includes("max_running"))
      return {
        rowCount: 1,
        rows: [{ max_running: mode === "capacity" || !guardContext ? 4 : 1 }],
      };
    if (sql.includes("has_table_privilege"))
      return {
        rowCount: 1,
        rows: [
          {
            verified:
              mode !== "privilege" &&
              JSON.parse(String(values[0])).every(
                (r: { t: string; p: string }) =>
                  purpose === "app" ||
                  r.t !== "guard.scans" ||
                  r.p !== "INSERT",
              ),
          },
        ],
      };
    if (sql === "ROLLBACK" && mode === "rollback") throw Error("unknown");
    return { rowCount: 0, rows: [] };
  };
  return { d, c, pool: fakePool(c) };
}
it("checks both target/role/schema/RLS and finishes only with an explicit read-only rollback", async () => {
  const f = databaseFixture();
  expect(
    await verifyProductDatabase(f.pool, "worker", f.d, plan as never),
  ).toMatchObject({ connected: true, readOnly: true, rlsVerified: true });
  expect(f.c.calls[0].sql).toBe("BEGIN READ ONLY");
  expect(f.c.calls.at(-1)?.sql).toBe("ROLLBACK");
  expect(
    f.c.calls.every((c) => /^(SELECT|BEGIN READ ONLY|ROLLBACK)/.test(c.sql)),
  ).toBe(true);
  expect(f.c.release).toHaveBeenCalledWith(false);
});
it.each(["marker", "role", "rls", "capacity", "rollback"])(
  "read-only preflight refuses %s without mutation",
  async (mode) => {
    const f = databaseFixture(mode);
    await expect(
      verifyProductDatabase(f.pool, "worker", f.d, plan as never),
    ).rejects.toThrow();
    expect(f.c.calls.at(-1)?.sql).toBe("ROLLBACK");
    expect(
      f.c.calls.some((c) =>
        /^(UPDATE|INSERT|DELETE|CREATE|ALTER|COMMIT)/.test(c.sql),
      ),
    ).toBe(false);
    if (mode === "rollback") expect(f.c.release).toHaveBeenCalledWith(true);
  },
);
it("missing deployment reports only this process's reference metadata; no path/secret is exposed", async () => {
  const r = await probeProductReadiness({
    NODE_ENV: "test",
    GUARD_DB_APP_PASSWORD_FILE: "OFFLINE_PATH_DO_NOT_EXPOSE",
  });
  expect(r.appDatabase).toBe("NOT_CONNECTED");
  expect(r.references.app.passwordReferencePresent).toBe(true);
  expect(JSON.stringify(r)).not.toContain("OFFLINE_PATH_DO_NOT_EXPOSE");
  expect(r.runtimeOperations).toBe(0);
});
async function artifactFixture() {
  const root = await mkdtemp(join(tmpdir(), "wetscan-g02-runtime-unit-")),
    d = deploymentFixture().deployments[0],
    q = d.qualification;
  const install = JSON.stringify({
    schemaVersion: 1,
    module: "guard-scanner-installation",
    classification: "LIVE_VERIFIED_INSTALLATION",
    status: "PASS",
    verifiedBy: "OFFLINE_UNIT_ONLY",
    verifiedAt: q.verifiedAt,
    expiresAt: q.expiresAt,
    engine: q.engine,
    specDigest: q.specDigest,
    imageId: q.imageId,
    scannerVersion: q.scannerVersion,
    rulePack: q.rulePack,
    rulePackSha256: q.rulePackSha256,
  });
  q.installationArtifactSha256 = createHash("sha256")
    .update(install)
    .digest("hex");
  await writeFile(
    join(root, `installation.${q.installationArtifactSha256}.json`),
    install,
  );
  const artifact = {
    version: 1,
    module: "guard-sandbox-qualification",
    classification: q.classification,
    engine: q.engine,
    specDigest: q.specDigest,
    imageId: q.imageId,
    daemonId: q.daemonId,
    daemonVersion: q.daemonVersion,
    kernelVersion: q.kernelVersion,
    verifiedAt: q.verifiedAt,
    expiresAt: q.expiresAt,
    verifiedBy: "OFFLINE_UNIT_ONLY",
    controls: q.controls,
    tests: {
      controls: "PASS",
      timeout: "PASS",
      output: "PASS",
      cancellation: "PASS",
      cleanup: "PASS",
    },
  };
  const bytes = JSON.stringify(artifact);
  q.evidenceSha256 = createHash("sha256").update(bytes).digest("hex");
  const file = join(root, `qualification.${q.evidenceSha256}.json`);
  await writeFile(file, bytes);
  const call = vi.fn(async (args: readonly string[]) =>
    JSON.stringify(
      args[0] === "version"
        ? { Os: "linux", Version: q.daemonVersion }
        : args[0] === "info"
          ? { OSType: "linux", ID: q.daemonId, KernelVersion: q.kernelVersion }
          : { Id: q.imageId, RepoDigests: [d.spec.image] },
    ),
  );
  const close = async () => {
    const actual = await realpath(root),
      temp = await realpath(tmpdir());
    if (
      dirname(actual).toLowerCase() !== temp.toLowerCase() ||
      !basename(actual).startsWith("wetscan-g02-runtime-unit-")
    )
      throw Error("owned fixture boundary");
    await rm(resolve(actual), { recursive: true, force: true });
  };
  return { root, d, call, file, close };
}
it("physical preflight reads only version/info/image metadata after bound qualification artifacts", async () => {
  const f = await artifactFixture();
  try {
    await verifyPhysical(f.d, f.root, { call: f.call });
    expect(f.call.mock.calls.map((c) => c[0][0])).toEqual([
      "version",
      "info",
      "image",
    ]);
    expect(f.call.mock.calls[2][0][1]).toBe("inspect");
  } finally {
    await f.close();
  }
});
it("modified qualification artifact is refused before any Docker call", async () => {
  const f = await artifactFixture();
  try {
    await writeFile(f.file, "{}");
    await expect(
      verifyPhysical(f.d, f.root, { call: f.call }),
    ).rejects.toThrow();
    expect(f.call).not.toHaveBeenCalled();
  } finally {
    await f.close();
  }
});
it("another daemon cannot satisfy a valid recorded qualification", async () => {
  const f = await artifactFixture();
  try {
    const original = f.call.getMockImplementation()!;
    f.call.mockImplementation(async (a) =>
      a[0] === "info"
        ? JSON.stringify({
            OSType: "linux",
            ID: "other-daemon",
            KernelVersion: f.d.qualification.kernelVersion,
          })
        : original(a),
    );
    await expect(
      verifyPhysical(f.d, f.root, { call: f.call }),
    ).rejects.toThrow();
  } finally {
    await f.close();
  }
});

it("app preflight checks insert privilege while worker does not require app-only insert permission", async () => {
  const f = databaseFixture("valid", "app");
  await verifyProductDatabase(f.pool, "app", f.d, plan as never);
  const call = f.c.calls.find((c) => c.sql.includes("jsonb_to_recordset"))!;
  const required = JSON.parse(String(call.values[0]));
  expect(required).toContainEqual({ t: "guard.scans", p: "INSERT", col: null });
  expect(
    f.c.calls.findIndex((c) => c.sql.startsWith("SELECT set_config")),
  ).toBeLessThan(f.c.calls.findIndex((c) => c.sql.includes("max_running")));
});
it("missing one required privilege fails closed rather than accepting another privilege on the same table", async () => {
  const f = databaseFixture("privilege");
  await expect(
    verifyProductDatabase(f.pool, "worker", f.d, plan as never),
  ).rejects.toThrow("approval_required");
  expect(f.c.calls.at(-1)?.sql).toBe("ROLLBACK");
});

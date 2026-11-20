import { it, expect } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  HISTORICAL_MARKER,
  localApproval,
  localTarget,
} from "../../../scripts/guard-g02-local-env";
import { g02Target, referenceDocuments } from "../../../scripts/guard-live-setup";
import { guardDatabaseConfig, validateGuardApproval } from "../../../src/features/guard/live/database-config";
import { guardMigrationPlan } from "../../../src/features/guard/live/migrations";

const NEW_MARKER = "wetscan-s01:d9058dd4-2823-4582-9721-4a1a56557664";
const hours = (h: number) => new Date(Date.now() + h * 3600000).toISOString();

it("accepts only a strictly validated loopback target that is neither historical nor reserved", () => {
  expect(localTarget(55434, NEW_MARKER)).toEqual({ host: "127.0.0.1", port: 55434, database: "wetscan_dev_guardg02", marker: NEW_MARKER });
  for (const bad of [
    [5432, NEW_MARKER], // host PostgreSQL
    [55432, NEW_MARKER], // Sentinel development server
    [80, NEW_MARKER],
    [55434.5, NEW_MARKER],
    [55434, HISTORICAL_MARKER], // never reuse the old machine's identity
    [55434, "wetscan-s01:not-a-uuid"],
    [55434, "other:" + NEW_MARKER.slice(12)],
  ] as const)
    expect(() => localTarget(bad[0], bad[1])).toThrow("LOCAL_TARGET_INVALID");
  expect(HISTORICAL_MARKER).toBe(g02Target.marker);
});

it("generated approvals are purpose-bound, honest about provenance and bounded in time", async () => {
  const plan = (await guardMigrationPlan()).sha256, target = localTarget(55434, NEW_MARKER);
  const app = localApproval("app", target, plan, hours(48)), migration = localApproval("migration", target, plan, hours(48));
  expect(app).toMatchObject({ module: "guard", purpose: "app", role: "wetscan_guard_app", actions: ["runtime"] });
  expect(migration).toMatchObject({ role: "wetscan_guard_migrator", actions: ["migrate_up"] });
  expect(app.approvedBy).toMatch(/not owner-signed/);
  expect(() => validateGuardApproval(app, "app", plan)).not.toThrow();
  expect(() => validateGuardApproval(app, "worker", plan)).toThrow(); // purpose/role mismatch
  expect(() => validateGuardApproval(app, "app", "0".repeat(64))).toThrow(); // plan mismatch
  expect(() => localApproval("app", target, plan, hours(0.5))).toThrow("LOCAL_APPROVAL_EXPIRY_INVALID");
  expect(() => localApproval("app", target, plan, hours(24 * 31))).toThrow("LOCAL_APPROVAL_EXPIRY_INVALID");
  expect(() => validateGuardApproval({ ...app, expiresAt: hours(-1) }, "app", plan)).toThrow();
});

it("an old-target approval cannot authorize the new database and vice versa", async () => {
  const plan = await guardMigrationPlan(), target = localTarget(55434, NEW_MARKER);
  const dir = await mkdtemp(join(tmpdir(), "wetscan-local-env-unit-"));
  try {
    const write = async (name: string, value: unknown) => {
      const file = join(dir, name);
      await writeFile(file, typeof value === "string" ? value : JSON.stringify(value));
      return file;
    };
    const password = await write("p.password", "x".repeat(40));
    const oldDocs = referenceDocuments(plan.sha256, hours(48));
    const oldApp = await write("old.json", oldDocs.app), newApp = await write("new.json", localApproval("app", target, plan.sha256, hours(48)));
    const env = (approval: string) => ({ GUARD_DB_APP_APPROVAL_FILE: approval, GUARD_DB_APP_PASSWORD_FILE: password });
    // Each approval authorizes only its own target.
    await expect(guardDatabaseConfig(env(oldApp), "app", plan.sha256, g02Target)).resolves.toMatchObject({ target: g02Target });
    await expect(guardDatabaseConfig(env(newApp), "app", plan.sha256, target)).resolves.toMatchObject({ target });
    await expect(guardDatabaseConfig(env(oldApp), "app", plan.sha256, target)).rejects.toMatchObject({ code: "approval_required" });
    await expect(guardDatabaseConfig(env(newApp), "app", plan.sha256, g02Target)).rejects.toMatchObject({ code: "approval_required" });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

it("generated approvals can only ever name the dedicated Guard database, never a Sentinel one", async () => {
  const plan = (await guardMigrationPlan()).sha256;
  const app = localApproval("app", localTarget(55434, NEW_MARKER), plan, hours(48));
  expect(app.target.database).toBe("wetscan_dev_guardg02");
  expect(app.target.database).not.toBe("wetscan_dev");
  // The product deployment loader additionally pins this exact database name (product-deployment.ts).
});

it("runtime configuration is single-repository and refuses container scope or malformed ids", async () => {
  const { productConfig } = await import("../../../scripts/guard-g02-local-env");
  const t = localTarget(55434, NEW_MARKER), ws = "github-user-187839747:test";
  expect(() => productConfig(t, "C:/x/wetscan-g02-runtime-meas-1", { deployments: [] }, { workspaceId: ws, repositoryId: "1464294716", branch: "main", engines: ["sast", "container"] })).toThrow("LOCAL_SCOPE_INVALID");
  expect(() => productConfig(t, "C:/x/wetscan-g02-runtime-meas-1", { deployments: [] }, { workspaceId: ws, repositoryId: "0", branch: "main", engines: ["sast"] })).toThrow("LOCAL_SCOPE_INVALID");
});

it("a valid repository id passes the scope check (fails later only on missing deployments)", async () => {
  const { productConfig } = await import("../../../scripts/guard-g02-local-env");
  expect(() => productConfig(localTarget(55434, NEW_MARKER), "C:/x/wetscan-g02-runtime-meas-1", { deployments: [] }, { workspaceId: "github-user-187839747:test", repositoryId: "1464294716", branch: "main", engines: ["sast"] })).toThrow(expect.objectContaining({ code: "not_configured" }));
});

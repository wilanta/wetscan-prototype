import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
const env = () => {
  const e = { ...process.env };
  for (const k of Object.keys(e))
    if (k.startsWith("SENTINEL_") || k === "NODE_OPTIONS") delete e[k];
  return e;
};
describe("unconfigured entrypoints - zero database configuration", () => {
  it("plan is offline and produces a review hash", () => {
    const r = spawnSync(
      process.execPath,
      ["--import", "tsx", "scripts/sentinel-db.ts", "plan"],
      { env: env(), encoding: "utf8", windowsHide: true },
    );
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout)).toMatchObject({
      action: "review_only",
      databaseConnections: 0,
    });
  });
  it("up refuses without the review hash before opening a pool", () => {
    const r = spawnSync(
      process.execPath,
      ["--import", "tsx", "scripts/sentinel-db.ts", "up"],
      { env: env(), encoding: "utf8", windowsHide: true },
    );
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("approval_required");
  });
  it("health reports not configured rather than pretending a live DB/worker", () => {
    const r = spawnSync(
      process.execPath,
      ["--import", "tsx", "scripts/sentinel-health.ts"],
      { env: env(), encoding: "utf8", windowsHide: true },
    );
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout)).toMatchObject({
      status: "not_configured",
      database: "not_connected",
      worker: "not_started",
    });
  });
  it("worker does not start without approval and its own secret path", () => {
    const r = spawnSync(
      process.execPath,
      ["--import", "tsx", "worker/sentinel/main.ts", "--once"],
      { env: env(), encoding: "utf8", windowsHide: true },
    );
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("not_started");
    expect(r.stderr).toContain("not_configured");
  });
  it("the real PostgreSQL acceptance command is blocked before connection when H01 is missing", () => {
    const r = spawnSync(
      process.execPath,
      ["--import", "tsx", "scripts/sentinel-postgres-test.ts"],
      { env: env(), encoding: "utf8", windowsHide: true },
    );
    expect(r.status).toBe(2);
    expect(JSON.parse(r.stderr)).toMatchObject({
      status: "BLOCKED_H01",
      databaseConnections: 0,
      migrationsApplied: 0,
    });
  });
});

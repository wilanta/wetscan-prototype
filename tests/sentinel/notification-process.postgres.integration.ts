import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer, type Server } from "node:http";
import { mkdtemp, rm, writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pg from "pg";
import { migrationPlan } from "../../src/platform/migrations";
import { newKey, setupNotificationHarness, type NotificationHarness } from "./notification-pg-harness";

/**
 * Process-level S06 acceptance: the REAL `worker/notifier/main.ts` against a throwaway PostgreSQL (database name + marker accepted by
 * the approval gate) and a loopback mock Telegram server. No external network, no real credentials, no production database.
 */
const TOKEN_A = "123456789:AAEhBP0av28zD1pV0T2tKq9xYz7mNn3Qw4kLs";
const TOKEN_B = "987654321:BBEhBP0av28zD1pV0T2tKq9xYz7mNn3Qw4kLs";
const LONG_PW = "s06_process_test_notifier_password_0123456789";
const HARNESS_PW = "s05_local_only_pw";
let h: NotificationHarness, dir: string, mock: Server, child: ChildProcess | undefined;
const requests: { url: string; body: string }[] = [];
let mockMode: "ok" | "unauthorized" = "ok";
let out = "";
let healthPort = 0;

const rows = async (sql: string, v: unknown[] = []) => (await h.admin.query(sql, v)).rows;
const until = async <T,>(fn: () => Promise<T | undefined | false>, ms = 30000): Promise<T> => {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error("timeout");
    await new Promise((r) => setTimeout(r, 150));
  }
};
const freePort = () => new Promise<number>((res) => { const s = createServer().listen(0, "127.0.0.1", () => { const p = (s.address() as { port: number }).port; s.close(() => res(p)); }); });

beforeAll(async () => {
  h = await setupNotificationHarness({ dbPrefix: "wetscan_s01_test" });
  dir = await mkdtemp(join(tmpdir(), "s06-proc-"));
  mock = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      requests.push({ url: req.url ?? "", body });
      res.writeHead(mockMode === "ok" ? 200 : 401, { "content-type": "application/json" });
      res.end(JSON.stringify(mockMode === "ok" ? { ok: true, result: { message_id: 500 + requests.length } } : { ok: false, error_code: 401, description: "Unauthorized" }));
    });
  });
  await new Promise<void>((ok) => mock.listen(0, "127.0.0.1", ok));
  await h.enableChannel(h.context, "telegram", "123456789", { includeControlledTest: true, throttlePerHour: 60 });
});
afterAll(async () => {
  if (child && child.exitCode === null) child.kill();
  await new Promise((ok) => mock?.close(ok));
  const root = new pg.Pool({ ...(() => { const u = new URL(process.env.SENTINEL_S05_PG_ADMIN_URL!); return { host: u.hostname, port: Number(u.port), user: decodeURIComponent(u.username), password: decodeURIComponent(u.password), database: "postgres" }; })() });
  await root.query(`ALTER ROLE wetscan_sentinel_notifier PASSWORD '${HARNESS_PW}'`).catch(() => undefined);
  await root.end();
  await h?.close();
  await rm(dir, { recursive: true, force: true });
});

describe("S06 notifier process (real entry point, real HTTP stack to a loopback mock)", () => {
  it("refuses to start without an approval block (fail closed: no DB connection, no provider call)", async () => {
    const r = await new Promise<{ code: number | null; err: string }>((ok) => {
      const c = spawn(process.execPath, ["--import", "tsx", "worker/notifier/main.ts"], { env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, SENTINEL_NOTIFIER_ENABLED: "1" } as unknown as NodeJS.ProcessEnv, stdio: ["ignore", "pipe", "pipe"] });
      let err = "";
      c.stderr.on("data", (d) => (err += d));
      c.on("exit", (code) => ok({ code, err }));
    });
    expect(r.code).toBe(2);
    expect(r.err).toContain("not_configured");
    expect(requests).toHaveLength(0);
  });

  it("A4/A7 end to end: sends exactly once with the file token, authenticates as the notifier role, hides the secret, and shuts down cleanly", async () => {
    const plan = await migrationPlan();
    const u = new URL(process.env.SENTINEL_S05_PG_ADMIN_URL!);
    const root = new pg.Pool({ host: u.hostname, port: Number(u.port), user: decodeURIComponent(u.username), password: decodeURIComponent(u.password), database: "postgres" });
    await root.query(`ALTER ROLE wetscan_sentinel_notifier PASSWORD '${LONG_PW}'`);
    await root.end();
    const now = Date.now();
    const approval = {
      schemaVersion: 1,
      status: "APPROVED",
      approvedBy: "s06-test-owner",
      approvedAt: new Date(now - 60000).toISOString(),
      target: { host: u.hostname, port: Number(u.port), database: h.dbName, marker: h.marker },
      actions: ["runtime"],
      migrationPlanSha256: plan.sha256,
      notifications: { mode: "live", workspaceId: h.context.scope.workspaceId, projectId: h.context.scope.projectId, notBefore: new Date(now - 30000).toISOString(), channels: ["telegram"], approvedUse: "owner_controlled_notifications" },
    };
    await writeFile(join(dir, "approval.json"), JSON.stringify(approval));
    await writeFile(join(dir, "notifier.pw"), LONG_PW);
    await writeFile(join(dir, "telegram.token"), TOKEN_A);
    healthPort = await freePort();
    const mockPort = (mock.address() as { port: number }).port;
    const incidentId = await h.trigger(h.context, { severity: "high" });
    child = spawn(process.execPath, ["--import", "tsx", "worker/notifier/main.ts"], {
      env: {
        PATH: process.env.PATH,
        SystemRoot: process.env.SystemRoot,
        SENTINEL_DB_HOST: u.hostname,
        SENTINEL_DB_PORT: u.port,
        SENTINEL_DB_NAME: h.dbName,
        SENTINEL_DB_MARKER: h.marker,
        SENTINEL_DB_APPROVAL_FILE: join(dir, "approval.json"),
        SENTINEL_DB_NOTIFIER_PASSWORD_FILE: join(dir, "notifier.pw"),
        SENTINEL_NOTIFIER_ENABLED: "1",
        SENTINEL_NOTIFIER_HEALTH_PORT: String(healthPort),
        SENTINEL_NOTIFIER_SECRET_TTL_MS: "0",
        SENTINEL_WORKER_POLL_MS: "200",
        SENTINEL_WORKER_HEARTBEAT_MS: "1000",
        SENTINEL_JOB_LEASE_MS: "10000",
        SENTINEL_JOB_TIMEOUT_MS: "5000",
        TELEGRAM_BOT_TOKEN_FILE: join(dir, "telegram.token"),
        TELEGRAM_API_BASE_URL: `http://127.0.0.1:${mockPort}`,
        // Things the sender must never carry (stripped at startup; presence here must not matter):
        AUTH_SECRET: "should-be-stripped",
        GITHUB_APP_CLIENT_SECRET: "should-be-stripped",
        SENTINEL_DB_WORKER_PASSWORD_FILE: join(dir, "notifier.pw"),
      } as unknown as NodeJS.ProcessEnv,
      stdio: ["ignore", "pipe", "pipe", "ipc"],
    });
    child.stdout!.on("data", (d) => (out += d));
    child.stderr!.on("data", (d) => (out += d));
    await until(async () => (await rows("SELECT state FROM sentinel.notification_deliveries WHERE subject_ref=$1 AND channel='telegram'", [incidentId]))[0]?.state === "provider_accepted");
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe(`/bot${TOKEN_A}/sendMessage`);
    expect(JSON.parse(requests[0].body)).toMatchObject({ chat_id: "123456789", disable_web_page_preview: true });
    expect(JSON.parse(requests[0].body).text).toContain("HIGH incident opened");
    expect(requests[0].body).not.toContain(TOKEN_A);
    const [d] = await rows("SELECT * FROM sentinel.notification_deliveries WHERE subject_ref=$1 AND channel='telegram'", [incidentId]);
    expect(d).toMatchObject({ state: "provider_accepted", delivered_at: null, delivery_evidence_ref: null, attempt_count: 1 });
    expect(Number(d.provider_message_id)).toBeGreaterThan(500);
    // identity: the sender session is the notifier role, not the worker/app role
    const sessions = await rows("SELECT DISTINCT usename,application_name FROM pg_stat_activity WHERE datname=$1 AND usename LIKE 'wetscan_%' AND application_name='wetscan-sentinel-notifier'", [h.dbName]);
    expect(sessions.map((s) => s.usename)).toEqual(["wetscan_sentinel_notifier"]);
    const health = await fetch(`http://127.0.0.1:${healthPort}/health`).then((r) => r.text());
    expect(JSON.parse(health)).toMatchObject({ status: "ready", lane: "notifier", channels: { telegram: "adapter_loaded" }, whatsapp: "requires_business_setup" });
    expect(health).not.toContain(TOKEN_A);

    // A7: revocation (token file removed) ⇒ next incident fails closed as provider_not_configured, no request leaves the process.
    await unlink(join(dir, "telegram.token"));
    const revoked = await h.trigger(h.context, { severity: "high" });
    const rd = await until(async () => (await rows("SELECT * FROM sentinel.notification_deliveries WHERE subject_ref=$1 AND channel='telegram' AND finished_at IS NOT NULL", [revoked]))[0]);
    expect(rd).toMatchObject({ state: "failed", reason: "provider_not_configured", dead_letter: true });
    expect(requests).toHaveLength(1);
    // Rotation: new token file ⇒ authorized manual retry succeeds with the NEW token, with no restart.
    await writeFile(join(dir, "telegram.token"), TOKEN_B);
    await h.store.command(h.context, { action: "retry", deliveryId: rd.delivery_id, idempotencyKey: newKey() });
    await until(async () => requests.length === 2);
    expect(requests[1].url).toBe(`/bot${TOKEN_B}/sendMessage`);
    // Provider-side revocation (401): permanent, one request, never retried, token not stored anywhere.
    mockMode = "unauthorized";
    const third = await h.trigger(h.context, { severity: "high" });
    const td = await until(async () => (await rows("SELECT * FROM sentinel.notification_deliveries WHERE subject_ref=$1 AND channel='telegram' AND finished_at IS NOT NULL", [third]))[0]);
    expect(td).toMatchObject({ state: "failed", reason: "provider_auth_failed", dead_letter: true });
    await new Promise((r) => setTimeout(r, 1200));
    expect(requests).toHaveLength(3);

    // Clean shutdown through the parent-owned IPC channel.
    const exited = new Promise<number | null>((ok) => child!.once("exit", ok));
    child.send({ type: "sentinel.shutdown", version: 1 });
    expect(await exited).toBe(0);
    expect(out).toContain('"phase":"started"');
    expect(out).toContain('"phase":"stopped"');
    // Secret hygiene: neither token nor DB password appears in process output, ledger, outbox or attempts.
    for (const secret of [TOKEN_A, TOKEN_B, LONG_PW, "AAEhBP0av28zD1pV0T2tKq9xYz7mNn3Qw4kLs"]) {
      expect(out).not.toContain(secret);
      for (const t of ["sentinel.notification_deliveries", "platform.notification_outbox", "platform.notification_attempts", "platform.jobs", "sentinel.notification_audit"])
        expect(JSON.stringify(await rows(`SELECT * FROM ${t}`))).not.toContain(secret);
    }
  }, 120000);
});

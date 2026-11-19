import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { PlatformDatabase } from "../../src/platform/database";
import { applyMigrations, migrationPlan } from "../../src/platform/migrations";
import { heartbeatWorker, platformHealth } from "../../src/platform/health";
import { workerConfig } from "../../src/platform/config";
import { runSentinelWorker } from "../../worker/sentinel/runtime";
import { collectLiveReport } from "../../src/features/sentinel/reports/collect";
import type {
  SentinelEventV1,
  SentinelProjectContext,
} from "../../src/features/sentinel/types";
import {
  ctx,
  intelAdminUrl,
  setupIntelHarness,
  type IntelHarness,
} from "./intelligence-pg-harness";

/**
 * S11 cross-module PostgreSQL hardening acceptance (disposable database only; the harness refuses non-loopback
 * hosts). One database carries every migration 0001..latest and three tenants: two projects in one workspace and
 * one project in another workspace. Everything below is generic over the catalog, so a table added by a future
 * migration is audited automatically instead of silently escaping the isolation matrix.
 */
const hasPg = Boolean(
  process.env.SENTINEL_S08_PG_ADMIN_URL ||
  process.env.SENTINEL_S07_PG_ADMIN_URL ||
  process.env.SENTINEL_S05_PG_ADMIN_URL,
);
const A = ctx(21, "github-user-21:s11", "921001");
const A2 = ctx(21, "github-user-21:s11", "921002"); // same workspace, other project
const B = ctx(22, "github-user-22:s11", "922001"); // different workspace
const ROLES = [
  "wetscan_app",
  "wetscan_sentinel_worker",
  "wetscan_sentinel_notifier",
  "wetscan_migrator",
];
/** Tables that legitimately carry no tenant columns. Anything else without them fails the audit until reviewed. */
const NON_TENANT_TABLES = new Set([
  "platform.schema_migrations",
  "platform.module_limits",
  "platform.worker_heartbeats",
  "sentinel.ext_sources",
  "sentinel.ext_runs",
  "sentinel.ext_advisories",
  "sentinel.ext_affected",
  "sentinel.ext_history",
]);

describe.skipIf(!hasPg)(
  "S11 PostgreSQL hardening matrix (disposable DB)",
  () => {
    let h: IntelHarness;
    let tables: {
      name: string;
      rls: boolean;
      force: boolean;
      cols: string[];
      policies: number;
    }[];
    const live = new Map<string, { credential: string; sourceId: string }>();
    const key = (c: SentinelProjectContext) => c.scope.projectId;
    const event = (
      c: SentinelProjectContext,
      over: Partial<SentinelEventV1> = {},
    ): SentinelEventV1 => ({
      schemaVersion: 1,
      eventId: randomUUID(),
      projectId: c.scope.projectId,
      occurredAt: new Date().toISOString(),
      kind: "http.suspicious_path",
      request: { method: "GET", routeTemplate: "/admin", statusCode: 404 },
      attributes: { reasonCode: "suspicious_path" },
      ...over,
    });
    const batch = (
      c: SentinelProjectContext,
      e: SentinelEventV1 = event(c),
      batchId: string = randomUUID(),
    ) => ({
      schemaVersion: 1 as const,
      batchId,
      sentAt: new Date().toISOString(),
      events: [e],
    });
    const notBefore = new Date(Date.now() - 60_000).toISOString();
    const scopeSql = `SELECT set_config('wetscan.workspace',$1,true),set_config('wetscan.project',$2,true),set_config('wetscan.mode',$3,true),set_config('wetscan.module','sentinel',true)`;

    async function asApp<T>(
      c: { workspaceId: string; projectId: string; mode?: string } | null,
      work: (q: pg.PoolClient) => Promise<T>,
    ): Promise<T> {
      const client = await h.appPool.connect();
      try {
        await client.query("BEGIN");
        if (c)
          await client.query(scopeSql, [
            c.workspaceId,
            c.projectId,
            c.mode ?? "live",
          ]);
        return await work(client);
      } finally {
        await client.query("ROLLBACK").catch(() => undefined);
        client.release();
      }
    }
    const tryQuery = async (q: pg.PoolClient, sql: string) => {
      await q.query("SAVEPOINT s");
      try {
        const r = await q.query(sql);
        return { rows: r.rows, rowCount: r.rowCount ?? 0, denied: false };
      } catch {
        await q.query("ROLLBACK TO SAVEPOINT s");
        return { rows: [], rowCount: 0, denied: true };
      }
    };
    async function runWorkerOnce(c: SentinelProjectContext) {
      const url = intelAdminUrl();
      const pool = new pg.Pool({
        host: url.hostname,
        port: Number(url.port || 5432),
        database: h.dbName,
        user: "wetscan_sentinel_worker",
        password: "s05_local_only_pw",
        max: 4,
      });
      const control = Object.assign(new EventEmitter(), {
        connected: true,
        disconnect: () => {},
      });
      await runSentinelWorker({
        db: new PlatformDatabase(pool, true),
        pool,
        migrations: (await migrationPlan()).migrations,
        options: { ...workerConfig({}), healthPort: 0, pollMs: 50 },
        detection: { scope: c.scope, notBefore },
        incidents: { scope: c.scope, notBefore },
        workerId: randomUUID(),
        control,
        once: true,
        report: () => {},
      });
    }
    const count = async (sql: string, v: unknown[] = []) =>
      Number((await h.admin.query(sql, v)).rows[0].n);

    beforeAll(async () => {
      h = await setupIntelHarness();
      for (const c of [A, A2, B]) {
        const created = await h.telemetry.create(c, {
          name: `s11 ${key(c)}`,
          environment: "local",
          origin: "runtime",
          retentionDays: 7,
          rateLimit: 1000,
        });
        live.set(key(c), created);
        const { ruleId } = await h.rule(c);
        const rule = (await h.detection.rules(c)).find(
          (r) => r.ruleId === ruleId,
        )!;
        await h.detection.command(c, {
          action: "enable",
          ruleId,
          expectedRevision: rule.revision,
        });
      }
      tables = (
        await h.admin.query(
          `SELECT n.nspname||'.'||c.relname AS name, c.relrowsecurity AS rls, c.relforcerowsecurity AS force,
          (SELECT array_agg(a.attname::text) FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped) AS cols,
          (SELECT count(*)::int FROM pg_policy p WHERE p.polrelid=c.oid) AS policies
         FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
         WHERE c.relkind IN ('r','p') AND n.nspname IN ('sentinel','platform') ORDER BY 1`,
        )
      ).rows;
    }, 180_000);
    afterAll(async () => {
      await h?.close();
    });

    it("S11-A2: migration ledger is complete, checksum-exact and a second up is a no-op", async () => {
      const plan = await migrationPlan();
      const before = (
        await h.admin.query(
          "SELECT * FROM platform.schema_migrations ORDER BY 1",
        )
      ).rows;
      expect(before.length).toBe(plan.migrations.length);
      await applyMigrations(h.migrator, plan.migrations, "up");
      const after = (
        await h.admin.query(
          "SELECT * FROM platform.schema_migrations ORDER BY 1",
        )
      ).rows;
      expect(after).toEqual(before);
    });

    it("S11-A2: every tenant table has ENABLE + FORCE row level security and at least one policy", () => {
      const tenant = tables.filter((t) => !NON_TENANT_TABLES.has(t.name));
      expect(tenant.length).toBeGreaterThan(30);
      for (const t of tenant) {
        expect(t.cols, t.name).toEqual(
          expect.arrayContaining(["workspace_id", "project_id"]),
        );
        expect(
          { rls: t.rls, force: t.force, hasPolicy: t.policies > 0 },
          t.name,
        ).toEqual({ rls: true, force: true, hasPolicy: true });
      }
    });

    it("S11-A2: the tenant-free allowlist is exact (a new unscoped table must be reviewed and listed)", () => {
      const unscoped = tables
        .filter(
          (t) =>
            !(t.cols.includes("workspace_id") && t.cols.includes("project_id")),
        )
        .map((t) => t.name);
      expect(unscoped.sort()).toEqual([...NON_TENANT_TABLES].sort());
    });

    it("S11-A2: roles are least-privilege (no superuser, createrole, createdb, replication or BYPASSRLS)", async () => {
      const r = await h.admin.query(
        `SELECT rolname,rolsuper,rolcreaterole,rolcreatedb,rolreplication,rolbypassrls FROM pg_roles WHERE rolname=ANY($1)`,
        [ROLES],
      );
      expect(r.rows.map((x) => x.rolname).sort()).toEqual([...ROLES].sort());
      for (const x of r.rows)
        expect(x, x.rolname).toMatchObject({
          rolsuper: false,
          rolcreaterole: false,
          rolcreatedb: false,
          rolreplication: false,
          rolbypassrls: false,
        });
    });

    it("S11-A2: PUBLIC holds no privilege on any Sentinel/platform table, and runtime roles hold no DDL, TRUNCATE, TRIGGER or REFERENCES", async () => {
      const pub = await h.admin.query(
        `SELECT n.nspname||'.'||c.relname AS t FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace,
        LATERAL aclexplode(c.relacl) a WHERE a.grantee=0 AND n.nspname IN ('sentinel','platform')`,
      );
      expect(pub.rows).toEqual([]);
      const runtime = ROLES.filter((r) => r !== "wetscan_migrator");
      for (const role of runtime) {
        for (const schema of ["sentinel", "platform", "public"])
          expect(
            (
              await h.admin.query(
                `SELECT has_schema_privilege($1,$2,'CREATE') AS c`,
                [role, schema],
              )
            ).rows[0].c,
            `${role} CREATE on ${schema}`,
          ).toBe(false);
        for (const t of tables)
          for (const priv of ["TRUNCATE", "TRIGGER", "REFERENCES"])
            expect(
              (
                await h.admin.query(
                  `SELECT has_table_privilege($1,$2,$3) AS p`,
                  [role, t.name, priv],
                )
              ).rows[0].p,
              `${role} ${priv} ${t.name}`,
            ).toBe(false);
      }
    });

    it("S11-A2: SECURITY DEFINER functions are an explicit, reviewed set", async () => {
      const r = await h.admin.query(
        `SELECT n.nspname||'.'||p.proname AS f FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
       WHERE n.nspname IN ('sentinel','platform') AND p.prosecdef ORDER BY 1`,
      );
      // Reviewed: S00-S10 define none. A future SECURITY DEFINER function must be added here deliberately.
      expect(r.rows.map((x) => x.f)).toEqual([]);
    });

    it("S11-A3: authorized telemetry -> detection -> alert -> incident -> evidence, per project, and a worker restart changes nothing", async () => {
      for (const c of [A, A2, B]) {
        const { credential } = live.get(key(c))!;
        const receipt = await h.telemetry.ingest(credential, batch(c));
        expect(receipt.duplicate).toBe(false);
      }
      for (const c of [A, A2, B]) await runWorkerOnce(c);
      const snapshot = async () =>
        (
          await h.admin.query(
            `SELECT i.project_id, count(DISTINCT i.incident_id)::int incidents, count(DISTINCT a.alert_id)::int alerts,
             count(DISTINCT e.event_id)::int evidence, count(DISTINCT t.timeline_id)::int timeline
           FROM sentinel.incidents i
           LEFT JOIN sentinel.incident_alerts a USING (mode,workspace_id,project_id,incident_id)
           LEFT JOIN sentinel.incident_evidence e USING (mode,workspace_id,project_id,incident_id)
           LEFT JOIN sentinel.incident_timeline t USING (mode,workspace_id,project_id,incident_id)
           GROUP BY i.project_id ORDER BY 1`,
          )
        ).rows;
      const first = await snapshot();
      expect(first).toEqual(
        [A, A2, B].map((c) => ({
          project_id: key(c),
          incidents: 1,
          alerts: 1,
          evidence: 1,
          timeline: expect.any(Number),
        })),
      );
      for (const row of first) expect(row.timeline).toBeGreaterThanOrEqual(2);
      // Restart/replay: workers again over the same data; nothing is duplicated or lost.
      for (const c of [A, A2, B]) await runWorkerOnce(c);
      expect(await snapshot()).toEqual(first);
      // Secure by default: no response action, notification or case was created automatically.
      for (const t of [
        "response_actions",
        "notification_deliveries",
        "intel_cases",
      ])
        expect(await count(`SELECT count(*) n FROM sentinel.${t}`), t).toBe(0);
    }, 180_000);

    it("S11-A3: replayed, forged-provenance, revoked and wrong-project telemetry are rejected without mutation", async () => {
      const events = () =>
        count("SELECT count(*) n FROM sentinel.telemetry_events");
      const base = await events();
      const { credential } = live.get(key(A))!;
      const dup = batch(A);
      expect((await h.telemetry.ingest(credential, dup)).duplicate).toBe(false);
      expect((await h.telemetry.ingest(credential, dup)).duplicate).toBe(true);
      expect(await events()).toBe(base + 1);
      // Source A's credential claiming project B (forged provenance) must be refused.
      await expect(
        h.telemetry.ingest(credential, batch(B)),
      ).rejects.toBeDefined();
      // Garbage / unknown credentials never authenticate.
      await expect(
        h.telemetry.ingest("x".repeat(64), batch(A)),
      ).rejects.toBeDefined();
      expect(await events()).toBe(base + 1);
      // Revocation is immediate.
      const victim = await h.telemetry.create(A2, {
        name: "to revoke",
        environment: "local",
        origin: "runtime",
        retentionDays: 7,
        rateLimit: 1000,
      });
      await h.telemetry.change(A2, victim.sourceId, "revoke");
      await expect(
        h.telemetry.ingest(victim.credential, batch(A2)),
      ).rejects.toBeDefined();
      expect(await events()).toBe(base + 1);
    });

    it("S11-A2: with no scope an app-role session reads no tenant row from any table", async () => {
      const tenant = tables.filter((t) => !NON_TENANT_TABLES.has(t.name));
      let populated = 0;
      for (const t of tenant) {
        if (await count(`SELECT count(*) n FROM ${t.name}`)) populated++;
        const rows = await asApp(null, async (q) =>
          tryQuery(q, `SELECT 1 FROM ${t.name} LIMIT 1`),
        );
        expect(rows.rows, `${t.name} leaked without a scope`).toEqual([]);
      }
      expect(populated).toBeGreaterThanOrEqual(8); // the matrix is not vacuous
    });

    it("S11-A2: each scope sees only its own rows in every tenant table; forged workspace/project/mode combinations see nothing", async () => {
      const tenant = tables.filter((t) => !NON_TENANT_TABLES.has(t.name));
      for (const t of tenant) {
        for (const c of [A, A2, B]) {
          const r = await asApp(c.scope, async (q) =>
            tryQuery(
              q,
              `SELECT DISTINCT workspace_id,project_id FROM ${t.name}`,
            ),
          );
          for (const row of r.rows)
            expect(
              { w: row.workspace_id, p: row.project_id },
              `${t.name} foreign row visible to ${key(c)}`,
            ).toEqual({ w: c.scope.workspaceId, p: c.scope.projectId });
        }
        for (const forged of [
          { workspaceId: B.scope.workspaceId, projectId: A.scope.projectId },
          { workspaceId: A.scope.workspaceId, projectId: B.scope.projectId },
          { workspaceId: A.scope.workspaceId, projectId: "github-1" },
          { ...A.scope, mode: "demo" },
          { ...A.scope, mode: "controlled_test" },
        ]) {
          const r = await asApp(forged, async (q) =>
            tryQuery(q, `SELECT 1 FROM ${t.name}`),
          );
          expect(r.rows, `${t.name} ${JSON.stringify(forged)}`).toEqual([]);
        }
      }
    });

    it("S11-A2: foreign-scope UPDATE/DELETE of another tenant's rows changes nothing in any table", async () => {
      const tenant = tables.filter((t) => !NON_TENANT_TABLES.has(t.name));
      const total = async () =>
        Object.fromEntries(
          await Promise.all(
            tenant.map(async (t) => [
              t.name,
              await count(`SELECT count(*) n FROM ${t.name}`),
            ]),
          ),
        );
      const before = await total();
      for (const t of tenant) {
        const r = await asApp(B.scope, async (q) => {
          const del = await tryQuery(
            q,
            `DELETE FROM ${t.name} WHERE project_id='${A.scope.projectId}'`,
          );
          const upd = await tryQuery(
            q,
            `UPDATE ${t.name} SET project_id=project_id WHERE project_id='${A.scope.projectId}'`,
          );
          return { del, upd };
        });
        expect(r.del.rowCount, `${t.name} cross-tenant DELETE`).toBe(0);
        expect(r.upd.rowCount, `${t.name} cross-tenant UPDATE`).toBe(0);
      }
      expect(await total()).toEqual(before);
    });

    it("S11-A2: append-only audit/timeline tables cannot be rewritten or deleted by the app or worker role even inside their own scope", async () => {
      const appendOnly = [
        "sentinel.incident_timeline",
        "sentinel.incident_timeline_evidence",
        "sentinel.detection_audit",
        "sentinel.response_audit",
        "sentinel.notification_audit",
        "sentinel.ghost_audit",
        "sentinel.intel_audit",
      ].filter((n) => tables.some((t) => t.name === n));
      expect(appendOnly.length).toBe(7);
      for (const name of appendOnly) {
        const before = await count(`SELECT count(*) n FROM ${name}`);
        const r = await asApp(A.scope, async (q) => ({
          del: await tryQuery(q, `DELETE FROM ${name}`),
          upd: await tryQuery(q, `UPDATE ${name} SET project_id=project_id`),
        }));
        expect(
          {
            del: r.del.denied || r.del.rowCount === 0,
            upd: r.upd.denied || r.upd.rowCount === 0,
          },
          name,
        ).toEqual({ del: true, upd: true });
        expect(await count(`SELECT count(*) n FROM ${name}`), name).toBe(
          before,
        );
      }
    });

    it("S11-A5: the live report is scoped to its project and exposes no other tenant's incident", async () => {
      const ids = async (c: SentinelProjectContext) =>
        (
          await h.admin.query(
            `SELECT incident_id FROM sentinel.incidents WHERE project_id=$1`,
            [c.scope.projectId],
          )
        ).rows.map((r) => r.incident_id as string);
      const [a, a2, b] = [await ids(A), await ids(A2), await ids(B)];
      const text = JSON.stringify(await collectLiveReport(h.app, A, 7));
      for (const id of a2.concat(b)) expect(text).not.toContain(id);
      expect(a.length).toBeGreaterThan(0);
    });

    it("S11 health on the real ledger: an older build on a newer database is ready only with an operator acceptance, and a real checksum drift is never safe", async () => {
      const full = (await migrationPlan()).migrations;
      const older = (await migrationPlan("0008_internal_intelligence"))
        .migrations;
      await heartbeatWorker(h.worker, randomUUID(), "running");
      const current = await platformHealth(h.worker, undefined, full);
      expect(current).toMatchObject({
        schemaStatus: "current",
        warnings: [],
      });
      // Build that only knows 0001-0008 against the real 0009 ledger.
      const unattested = await platformHealth(h.worker, undefined, older);
      expect(unattested).toMatchObject({
        status: "degraded",
        schemaStatus: "ahead_unverified",
      });
      const attested = await platformHealth(h.worker, undefined, older, {
        acceptAheadThrough: "0009_external_intelligence",
      });
      expect(attested).toMatchObject({
        schemaStatus: "ahead_compatible",
        schema: "0009_external_intelligence",
        warnings: ["schema_ahead_of_code:0009_external_intelligence"],
      });
      // Overlap checksum drift outranks everything, even with a blanket acceptance.
      const drifted = older.map((x, n) =>
        n === 2 ? { ...x, checksum: "f".repeat(64) } : x,
      );
      expect(
        await platformHealth(h.worker, undefined, drifted, {
          acceptAheadThrough: "0009_external_intelligence",
        }),
      ).toMatchObject({
        status: "degraded",
        schemaStatus: "checksum_mismatch",
      });
    });
  },
);

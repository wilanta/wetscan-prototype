import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import {
  ResponseStore,
  ResponsePolicyDenied,
} from "../../src/features/sentinel/response/store";
import {
  setupHarness,
  provisionTarget,
  type Harness,
} from "./response-pg-harness";
import type { SentinelProjectContext } from "../../src/features/sentinel/types";

const key = () => randomBytes(32).toString("hex");
const origin = "http://127.0.0.1:4999";
const code = (e: unknown) =>
  (e as { code?: string }).code ?? (e as Error).message;

describe.skipIf(!process.env.SENTINEL_S05_PG_ADMIN_URL)(
  "S05 response store on an isolated throwaway PostgreSQL",
  () => {
    let h: Harness;
    let app: ResponseStore;
    let worker: ResponseStore;
    let ctx: SentinelProjectContext;
    let approver: SentinelProjectContext;
    let target: string;
    beforeAll(async () => {
      h = await setupHarness();
      app = new ResponseStore(h.app);
      worker = new ResponseStore(h.worker);
      ctx = h.context;
      approver = { ...ctx, actorId: "github-user-8" };
      target = await provisionTarget(h, {
        origin,
        approvers: ["github-user-8"],
      });
    });
    afterAll(async () => h?.close());

    const propose = (c = ctx, t = target, ttl = 120, k = key()) =>
      app.command(c, {
        action: "propose",
        incidentId: h.incidentId,
        targetId: t,
        ttlSeconds: ttl,
        idempotencyKey: k,
      });
    const status = async (id: string) =>
      (
        await h.admin.query(
          "SELECT status,revision FROM sentinel.response_actions WHERE action_id=$1",
          [id],
        )
      ).rows[0];
    const jobs = async (id: string) =>
      Number(
        (
          await h.admin.query(
            "SELECT count(*) FROM platform.jobs WHERE kind LIKE 'sentinel.response.%' AND subject_ref=$1",
            [id],
          )
        ).rows[0].count,
      );

    it("applies 0005 on top of 0001-0004 and the S04 incident stays untouched", async () => {
      const v = (
        await h.admin.query(
          "SELECT version FROM platform.schema_migrations ORDER BY version",
        )
      ).rows.map((r) => r.version);
      expect(v.slice(0, 5)).toEqual([
        "0001_foundation",
        "0002_telemetry",
        "0003_detection",
        "0004_incidents",
        "0005_response",
      ]);
      const inc = (
        await h.admin.query(
          "SELECT verification_status FROM sentinel.incidents WHERE incident_id=$1",
          [h.incidentId],
        )
      ).rows[0];
      expect(inc.verification_status).toBe("not_requested");
    });

    it("S05-A1: denies unconfigured/disabled targets and unknown incidents without any write", async () => {
      const disabled = await provisionTarget(h, {
        origin: "http://127.0.0.1:5001",
        approvers: ["github-user-8"],
        enabled: false,
      });
      await expect(
        propose(ctx, "11111111-1111-4111-8111-111111111111"),
      ).rejects.toBeInstanceOf(ResponsePolicyDenied);
      const e = await propose(ctx, disabled).catch((x) => x);
      expect(e).toBeInstanceOf(ResponsePolicyDenied);
      expect(e.reasons).toContain("target_disabled");
      await expect(
        app.command(ctx, {
          action: "propose",
          incidentId: "22222222-2222-4222-8222-222222222222",
          targetId: target,
          ttlSeconds: 60,
          idempotencyKey: key(),
        }),
      ).rejects.toMatchObject({ code: "not_found" });
      expect(
        Number(
          (
            await h.admin.query(
              "SELECT count(*) FROM sentinel.response_actions",
            )
          ).rows[0].count,
        ),
      ).toBe(0);
    });

    let actionId = "";
    it("proposes (idempotent), requires approver, prohibits self-approval, and enqueues exactly one apply job", async () => {
      const k = key();
      const p = await propose(ctx, target, 120, k);
      actionId = p.action.actionId;
      expect(p.action.status).toBe("awaiting_approval");
      expect(p.replay).toBe(false);
      expect((await propose(ctx, target, 120, k)).replay).toBe(true);
      await expect(propose(ctx, target, 90, k)).rejects.toMatchObject({
        code: "idempotency_conflict",
      });
      // proposer is not an approver on this target
      await expect(
        app.command(ctx, { action: "approve", actionId, expectedRevision: 1 }),
      ).rejects.toMatchObject({ code: "approver_denied" });
      expect((await status(actionId)).status).toBe("awaiting_approval");
      expect(await jobs(actionId)).toBe(0);
      // approver may approve; self-approval flag is off, proposer==approver is denied
      await h.admin.query(
        "UPDATE sentinel.response_targets SET approver_actor_ids=ARRAY['github-user-7','github-user-8'] WHERE target_id=$1",
        [target],
      );
      await expect(
        app.command(ctx, { action: "approve", actionId, expectedRevision: 1 }),
      ).rejects.toMatchObject({ code: "approver_denied" });
      const a = await app.command(approver, {
        action: "approve",
        actionId,
        expectedRevision: 1,
      });
      expect(a.action.status).toBe("approved");
      expect(a.action.approvedBy).toBe("github-user-8");
      expect(await jobs(actionId)).toBe(1);
      // replay of the same command does not enqueue again; stale revision conflicts
      expect(
        (
          await app.command(approver, {
            action: "approve",
            actionId,
            expectedRevision: 1,
          })
        ).replay,
      ).toBe(true);
      expect(await jobs(actionId)).toBe(1);
      await expect(
        app.command(approver, {
          action: "deny",
          actionId,
          expectedRevision: 1,
        }),
      ).rejects.toMatchObject({ code: "revision_conflict" });
      await expect(
        app.command(approver, {
          action: "deny",
          actionId,
          expectedRevision: 2,
        }),
      ).rejects.toMatchObject({ code: "invalid_state" });
    });

    it("one active action per target (policy + partial unique index)", async () => {
      const e = await propose(ctx).catch((x) => x);
      expect(e).toBeInstanceOf(ResponsePolicyDenied);
      expect(e.reasons).toContain("active_action_on_target");
      await expect(
        h.admin.query(
          `INSERT INTO sentinel.response_actions(mode,workspace_id,project_id,action_id,incident_id,target_id,incident_origin,operation,ttl_seconds,status,proposed_by,approved_by,approved_at,approval_expires_at,idempotency_key)
           SELECT mode,workspace_id,project_id,gen_random_uuid(),incident_id,target_id,incident_origin,operation,ttl_seconds,'approved',proposed_by,'x',now(),now(),repeat('b',64) FROM sentinel.response_actions WHERE action_id=$1`,
          [actionId],
        ),
      ).rejects.toMatchObject({ code: "23505" });
    });

    it("S05-A1: expired approval and un-approved actions are never applied", async () => {
      await h.admin.query(
        "UPDATE sentinel.response_actions SET approval_expires_at=now()-interval '1 second' WHERE action_id=$1",
        [actionId],
      );
      const r = await worker.beginApply(ctx.scope, actionId);
      expect(r).toEqual({ skip: "approval_invalid" });
      expect((await status(actionId)).status).toBe("expired");
      const p = await propose();
      expect(await worker.beginApply(ctx.scope, p.action.actionId)).toEqual({
        skip: "not_approved",
      });
      // deny path
      await h.admin.query(
        "UPDATE sentinel.response_targets SET approver_actor_ids=ARRAY['github-user-8'] WHERE target_id=$1",
        [target],
      );
      const d = await app.command(approver, {
        action: "deny",
        actionId: p.action.actionId,
        expectedRevision: 1,
        note: "not needed",
      });
      expect(d.action.status).toBe("denied");
      expect(await jobs(p.action.actionId)).toBe(0);
    });

    it("S05-A1: a forged approval (approver not on the target list) is never applied", async () => {
      await h.admin.query(
        "UPDATE sentinel.response_targets SET approver_actor_ids=ARRAY['github-user-8'] WHERE target_id=$1",
        [target],
      );
      const p = await propose();
      const id = p.action.actionId;
      await app.command(approver, {
        action: "approve",
        actionId: id,
        expectedRevision: 1,
      });
      await h.admin.query(
        "UPDATE sentinel.response_actions SET approved_by='intruder' WHERE action_id=$1",
        [id],
      );
      expect(await worker.beginApply(ctx.scope, id)).toEqual({
        skip: "approval_invalid",
      });
      expect((await status(id)).status).toBe("expired");
    });

    it("manual rollback before apply is terminal and idempotent; apply then no-ops", async () => {
      const p = await propose();
      const id = p.action.actionId;
      await app.command(approver, {
        action: "approve",
        actionId: id,
        expectedRevision: 1,
      });
      const rb = await app.command(approver, {
        action: "rollback",
        actionId: id,
        expectedRevision: 2,
      });
      expect(rb.action.status).toBe("rolled_back");
      expect(
        (
          await app.command(approver, {
            action: "rollback",
            actionId: id,
            expectedRevision: 2,
          })
        ).replay,
      ).toBe(true);
      expect(await worker.beginApply(ctx.scope, id)).toEqual({
        skip: "not_approved",
      });
    });

    it("S05-A6: cross-project/workspace and demo-mode isolation under RLS; wrong actor roles", async () => {
      const row = (
        await h.admin.query(
          "SELECT action_id FROM sentinel.response_actions LIMIT 1",
        )
      ).rows[0];
      const other = { ...ctx, scope: { ...ctx.scope, projectId: "github-1" } };
      expect(
        await h.app.scoped(
          other.scope,
          async (tx) =>
            (await h.app.query(tx, "SELECT * FROM sentinel.response_actions"))
              .rowCount,
        ),
      ).toBe(0);
      const otherWs = { ...ctx.scope, workspaceId: "github-user-9:s05" };
      expect(
        await h.app.scoped(
          otherWs,
          async (tx) =>
            (await h.app.query(tx, "SELECT * FROM sentinel.response_audit"))
              .rowCount,
        ),
      ).toBe(0);
      await expect(app.details(other, row.action_id)).rejects.toMatchObject({
        code: "not_found",
      });
      await expect(
        h.admin.query(
          "INSERT INTO sentinel.response_targets(mode,workspace_id,project_id,target_id,kind,origin,max_ttl_seconds,approver_actor_ids,h03_proof_id) VALUES('demo','w','p',gen_random_uuid(),'local_fixture','http://127.0.0.1:5002',60,ARRAY['a'],'abc')",
        ),
      ).rejects.toMatchObject({ code: "23514" });
      await expect(
        h.admin.query(
          "INSERT INTO sentinel.response_targets(mode,workspace_id,project_id,target_id,kind,origin,max_ttl_seconds,approver_actor_ids,h03_proof_id) VALUES('live','w','p',gen_random_uuid(),'local_fixture','http://10.0.0.1:5002',60,ARRAY['a'],'abc')",
        ),
      ).rejects.toMatchObject({ code: "23514" });
    });

    it("audit is append-only and targets are not writable for app/worker", async () => {
      const attempt = async (db: typeof h.app, sql: string) =>
        db
          .scoped(ctx.scope, async (tx) => db.query(tx, sql))
          .then(
            () => "allowed",
            (e) => (e as { code?: string }).code,
          );
      expect(
        await attempt(
          h.app,
          "UPDATE sentinel.response_audit SET summary='tampered'",
        ),
      ).toBe("42501");
      expect(await attempt(h.app, "DELETE FROM sentinel.response_audit")).toBe(
        "42501",
      );
      expect(
        await attempt(
          h.worker,
          "UPDATE sentinel.response_audit SET summary='tampered'",
        ),
      ).toBe("42501");
      expect(
        await attempt(h.worker, "DELETE FROM sentinel.response_audit"),
      ).toBe("42501");
      expect(
        await attempt(h.app, "DELETE FROM sentinel.response_actions"),
      ).toBe("42501");
      expect(
        await attempt(
          h.app,
          "UPDATE sentinel.response_targets SET enabled=false",
        ),
      ).toBe("42501");
      expect(
        await attempt(
          h.worker,
          "INSERT INTO sentinel.response_targets(mode) VALUES('live')",
        ),
      ).toBe("42501");
      expect(
        await attempt(
          h.app,
          "UPDATE sentinel.response_actions SET proposed_by='x'",
        ),
      ).toBe("42501");
      expect(
        await attempt(
          h.worker,
          "UPDATE sentinel.response_actions SET approved_by='x'",
        ),
      ).toBe("42501");
      const d = await app.details(ctx, actionId);
      expect(d.audit.map((a) => a.sequence)).toEqual(
        d.audit.map((_, i) => i + 1),
      );
      expect(code(new Error("x"))).toBe("x");
    });

    it("empty 0005 reverses cleanly (only 0005 removed) and re-applies; S01-S04 tables survive", async () => {
      const { applyMigrations, migrationPlan } =
        await import("../../src/platform/migrations");
      const h2 = await setupHarness({ seedIncident: false });
      try {
        const plan = await migrationPlan();
        // 0006 (S06) sits on top: reverse it first, then 0005 on its own.
        await applyMigrations(h2.admin as never, plan.migrations, "down");
        await applyMigrations(h2.admin as never, plan.migrations, "down");
        const v = (
          await h2.admin.query(
            "SELECT version FROM platform.schema_migrations ORDER BY version",
          )
        ).rows.map((r) => r.version);
        expect(v).toEqual([
          "0001_foundation",
          "0002_telemetry",
          "0003_detection",
          "0004_incidents",
        ]);
        expect(
          (
            await h2.admin.query(
              "SELECT to_regclass('sentinel.response_actions') AS t, to_regclass('sentinel.incidents') AS i",
            )
          ).rows[0],
        ).toEqual({ t: null, i: "sentinel.incidents" });
        await applyMigrations(h2.admin as never, plan.migrations, "up");
        expect(
          (
            await h2.admin.query(
              "SELECT count(*)::int AS n FROM platform.schema_migrations",
            )
          ).rows[0].n,
        ).toBe(6); // 0001-0005 + 0006 (S06) re-applied
      } finally {
        await h2.close();
      }
    });

    it("refuses 0005 down while response rows exist", async () => {
      const { applyMigrations, migrationPlan } =
        await import("../../src/platform/migrations");
      const plan = await migrationPlan();
      await expect(
        applyMigrations(h.pools[0] as never, plan.migrations, "down"),
      ).rejects.toBeTruthy();
    });
  },
);

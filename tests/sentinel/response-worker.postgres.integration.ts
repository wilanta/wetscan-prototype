import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomBytes, randomUUID } from "node:crypto";
import { ResponseStore } from "../../src/features/sentinel/response/store";
import { retainIncidents } from "../../src/features/sentinel/incidents/retention";
import { IncidentStore } from "../../src/features/sentinel/incidents/store";
import { PostgresQueue } from "../../src/platform/queue";
import { executeLease } from "../../worker/sentinel/executor";
import {
  handleResponseJob,
  type ResponseDeps,
} from "../../worker/sentinel/response-handlers";
import { adapterForTarget } from "../../src/features/sentinel/response/local-rate-limit-adapter";
import { FixtureVerifier } from "../../src/features/sentinel/response/verifier";
import {
  responseJobKinds,
  type ResponseTarget,
} from "../../src/features/sentinel/response/model";
import {
  startFixture,
  type Fixture,
} from "../../scripts/sentinel-response-fixture";
import {
  setupHarness,
  provisionTarget,
  type Harness,
} from "./response-pg-harness";
import type { SentinelProjectContext } from "../../src/features/sentinel/types";

const token = "s05-fixture-token-0123456789";
const key = () => randomBytes(32).toString("hex");

describe.skipIf(!process.env.SENTINEL_S05_PG_ADMIN_URL)(
  "S05 worker flows: apply → verify → TTL/rollback/reconcile on throwaway PostgreSQL + real loopback fixture",
  () => {
    let h: Harness;
    let app: ResponseStore;
    let wstore: ResponseStore;
    let ctx: SentinelProjectContext;
    let approver: SentinelProjectContext;
    const fixtures: Fixture[] = [];
    beforeAll(async () => {
      h = await setupHarness();
      app = new ResponseStore(h.app);
      wstore = new ResponseStore(h.worker);
      ctx = h.context;
      approver = { ...ctx, actorId: "github-user-8" };
    });
    afterAll(async () => {
      await Promise.all(fixtures.map((f) => f.stop().catch(() => undefined)));
      await h?.close();
    });
    const deps = (): ResponseDeps => ({
      store: wstore,
      adapter: (t) =>
        adapterForTarget(
          {
            SENTINEL_RESPONSE_BASE_URL: t.origin,
            SENTINEL_RESPONSE_TOKEN: token,
          },
          t,
        ),
      verifier: (t) =>
        new FixtureVerifier({ origin: t.origin, timeoutMs: 1500 }),
    });
    /** Fresh fixture + approved target per scenario (one active limit per target). */
    async function scenario(opts: { selfApproval?: boolean } = {}) {
      const f = await startFixture({ token });
      fixtures.push(f);
      const targetId = await provisionTarget(h, {
        origin: f.origin,
        approvers: ["github-user-8", "github-user-7"],
        selfApproval: opts.selfApproval,
      });
      return { f, targetId };
    }
    const proposeApprove = async (targetId: string, c = approver, ttl = 60) => {
      const p = await app.command(ctx, {
        action: "propose",
        incidentId: h.incidentId,
        targetId,
        ttlSeconds: ttl,
        idempotencyKey: key(),
      });
      const a = await app.command(c, {
        action: "approve",
        actionId: p.action.actionId,
        expectedRevision: 1,
      });
      return a.action.actionId;
    };
    const row = async (id: string) =>
      (
        await h.admin.query(
          "SELECT status,revision,rollback_requested_by FROM sentinel.response_actions WHERE action_id=$1",
          [id],
        )
      ).rows[0];
    const audit = async (id: string) =>
      (
        await h.admin.query(
          "SELECT event_type,to_status,metadata,actor_id FROM sentinel.response_audit WHERE action_id=$1 ORDER BY sequence",
          [id],
        )
      ).rows;
    /** Claim + execute only the given response job kinds, like the worker loop does. */
    async function drain(kinds: string[], d = deps()) {
      const q = new PostgresQueue(h.worker, ctx.scope, kinds);
      let ran = 0;
      for (;;) {
        const leases = await q.claim({
          module: "sentinel",
          workerId: "s05-test",
          limit: 5,
          leaseMs: 30000,
        });
        if (!leases.length) return ran;
        for (const l of leases) {
          const r = await executeLease(
            q,
            l,
            (job, sig) => handleResponseJob(job, sig, d),
            {
              heartbeatMs: 5000,
              timeoutMs: 15000,
              signal: new AbortController().signal,
            },
          );
          if (r === "completed") ran++;
        }
        if (leases.every(() => true) && ran === 0) return ran;
      }
    }
    const makeJob = (kind: string, id: string, attempts = 0) => ({
      ...ctx.scope,
      schemaVersion: 1 as const,
      module: "sentinel" as const,
      jobId: randomUUID(),
      kind,
      subjectRef: id,
      idempotencyKey: `t:${kind}:${id}`,
      revision: 1,
      attempts,
      maxAttempts: 5,
      availableAt: new Date().toISOString(),
      cancelRequested: false,
    });
    const run = (kind: string, id: string, attempts = 0) =>
      handleResponseJob(
        makeJob(kind, id, attempts),
        new AbortController().signal,
        deps(),
      );

    it("S05-A2/A3: approved action applies (receipt only), then independent verifier proves block + benign allowed", async () => {
      const { f, targetId } = await scenario();
      const id = await proposeApprove(targetId);
      await drain([responseJobKinds.apply]);
      expect((await row(id)).status).toBe("applied"); // applied != verified
      expect(f.state()).toMatchObject({ active: true, actionId: id });
      const a1 = await audit(id);
      const applied = a1.find((x) => x.event_type === "mitigation_applied")!;
      expect(applied.metadata).toMatchObject({
        receipt: "action_applied",
        verified: false,
      });
      expect(a1.some((x) => x.event_type === "neutralization_verified")).toBe(
        false,
      );
      const base = a1.find((x) => x.event_type === "verification_recorded")!;
      expect(base.metadata).toMatchObject({
        phase: "baseline",
        attackStatus: 200,
        benignStatus: 200,
      });
      expect(
        (
          await h.admin.query(
            "SELECT verification_status FROM sentinel.incidents WHERE incident_id=$1",
            [h.incidentId],
          )
        ).rows[0].verification_status,
      ).toBe("not_requested");
      await drain([responseJobKinds.verify]);
      expect((await row(id)).status).toBe("verified");
      const v = (await audit(id)).find(
        (x) => x.event_type === "neutralization_verified",
      )!;
      expect(v.actor_id).toBe("system:response-verifier"); // distinct from the applying actor
      expect(v.metadata).toMatchObject({
        attackStatus: 429,
        benignStatus: 200,
        maliciousReplayBlocked: true,
        benignControlAllowed: true,
      });
      expect(applied.actor_id).toBe("system:response-worker");
      // incident lifecycle untouched by the response (no timeline rows, still not_requested)
      expect(
        (
          await h.admin.query(
            "SELECT count(*)::int AS n FROM sentinel.incident_timeline WHERE event_type NOT IN ('alert_created','incident_opened')",
          )
        ).rows[0].n,
      ).toBe(0);
      await app.command(approver, {
        action: "rollback",
        actionId: id,
        expectedRevision: (await row(id)).revision,
      });
      await drain([responseJobKinds.expire]);
      expect((await row(id)).status).toBe("rolled_back");
      expect(f.state().active).toBe(false);
    });

    it("S05-A5: manual rollback is idempotent and restores the target; closing the incident never rolls back or verifies", async () => {
      const { f, targetId } = await scenario();
      const id = await proposeApprove(targetId);
      await drain([responseJobKinds.apply, responseJobKinds.verify]);
      expect((await row(id)).status).toBe("verified");
      // closing the incident is an investigation decision, not mitigation evidence and not a rollback
      const inc = (
        await h.admin.query(
          "SELECT revision FROM sentinel.incidents WHERE incident_id=$1",
          [h.incidentId],
        )
      ).rows[0];
      await new IncidentStore(h.app).command(ctx, {
        action: "close",
        incidentId: h.incidentId,
        expectedRevision: inc.revision,
        reason: "closed for test",
      });
      expect((await row(id)).status).toBe("verified");
      expect(f.state().active).toBe(true);
      const rev = (await row(id)).revision;
      const first = await app.command(approver, {
        action: "rollback",
        actionId: id,
        expectedRevision: rev,
      });
      const second = await app.command(approver, {
        action: "rollback",
        actionId: id,
        expectedRevision: rev,
      });
      expect(first.replay).toBe(false);
      expect(second.replay).toBe(true);
      await drain([responseJobKinds.expire]);
      expect((await row(id)).status).toBe("rolled_back");
      expect(f.state().active).toBe(false);
      expect(
        (await audit(id)).filter((x) => x.event_type === "rollback"),
      ).toHaveLength(2); // requested + completed
      await run(responseJobKinds.expire, id); // duplicate job is a no-op
      expect((await row(id)).status).toBe("rolled_back");
      // reopen incident for later scenarios
      const inc2 = (
        await h.admin.query(
          "SELECT revision FROM sentinel.incidents WHERE incident_id=$1",
          [h.incidentId],
        )
      ).rows[0];
      await new IncidentStore(h.app).command(ctx, {
        action: "reopen",
        incidentId: h.incidentId,
        expectedRevision: inc2.revision,
        reason: "reopen for test",
      });
    });

    it("S05-A5: TTL expiry job removes the limit and marks expired; early job refuses", async () => {
      const { f, targetId } = await scenario();
      const id = await proposeApprove(targetId, approver, 600);
      await drain([responseJobKinds.apply]);
      await expect(run(responseJobKinds.expire, id)).rejects.toThrow(
        "not_due_yet",
      ); // not due: never expires early
      expect(f.state().active).toBe(true);
      await h.admin.query(
        "UPDATE sentinel.response_actions SET expires_at=now()-interval '1 second' WHERE action_id=$1",
        [id],
      );
      await run(responseJobKinds.expire, id);
      expect((await row(id)).status).toBe("expired");
      expect(f.state().active).toBe(false);
      expect((await audit(id)).at(-1)).toMatchObject({
        event_type: "expiry",
        to_status: "expired",
      });
    });

    it("S05-A4: target unavailable ⇒ retry then explicit apply_failed, never applied", async () => {
      const { f, targetId } = await scenario();
      const id = await proposeApprove(targetId);
      await f.stop();
      await expect(run(responseJobKinds.apply, id, 1)).rejects.toThrow(); // transient: stays applying for queue retry
      expect((await row(id)).status).toBe("applying");
      await run(responseJobKinds.apply, id, 5); // final attempt
      expect((await row(id)).status).toBe("apply_failed");
      expect(
        (await audit(id)).some((x) => x.event_type === "mitigation_applied"),
      ).toBe(false);
    });

    it("S05-A4: unconfigured adapter is NO-OP ⇒ apply_failed(not_configured), no target call", async () => {
      const { f, targetId } = await scenario();
      const id = await proposeApprove(targetId);
      const d = { ...deps(), adapter: (t: never) => adapterForTarget({}, t) };
      await handleResponseJob(
        makeJob(responseJobKinds.apply, id),
        new AbortController().signal,
        d,
      );
      expect((await row(id)).status).toBe("apply_failed");
      expect(f.state().active).toBe(false);
    });

    it("S05-A4: collateral damage ⇒ failed; unclean baseline ⇒ inconclusive; neither is verified", async () => {
      const a = await scenario();
      const id1 = await proposeApprove(a.targetId);
      await drain([responseJobKinds.apply]);
      a.f.setBenignStatus(500);
      await drain([responseJobKinds.verify]);
      expect((await row(id1)).status).toBe("failed");
      expect((await audit(id1)).at(-1)).toMatchObject({
        event_type: "verification_failed",
      });
      const b = await scenario();
      b.f.setBenignStatus(500); // baseline already unclean ⇒ causality unprovable
      const id2 = await proposeApprove(b.targetId);
      await drain([responseJobKinds.apply]);
      b.f.setBenignStatus(200);
      await drain([responseJobKinds.verify]);
      expect((await row(id2)).status).toBe("inconclusive");
      // rollback both
      for (const [id, x] of [
        [id1, a.f],
        [id2, b.f],
      ] as const) {
        await app.command(approver, {
          action: "rollback",
          actionId: id,
          expectedRevision: (await row(id)).revision,
        });
        await drain([responseJobKinds.expire]);
        expect((await row(id)).status).toBe("rolled_back");
        expect(x.state().active).toBe(false);
      }
    });

    it("S05-A5: crash between target PUT and DB commit ⇒ reconcile adopts; lost target ⇒ reconcile closes; orphan limit is removed", async () => {
      const a = await scenario();
      const id = await proposeApprove(a.targetId);
      // simulate crash: worker marked `applying` and the PUT landed, but markApplied never committed
      const begin = await wstore.beginApply(ctx.scope, id);
      expect("action" in begin).toBe(true);
      await a.f.stop().catch(() => undefined);
      const f2 = await startFixture({ token, port: a.f.port });
      fixtures.push(f2);
      await deps()
        .adapter((begin as unknown as { target: ResponseTarget }).target)
        .apply(ctx, {
          ...ctx.scope,
          schemaVersion: 1,
          revision: 1,
          actionId: id,
          incidentId: h.incidentId,
          targetRef: f2.origin,
          operation: "temporary_rate_limit",
          ttlSeconds: 60,
          idempotencyKey: id,
          approval: null,
        });
      expect((await row(id)).status).toBe("applying");
      await run(responseJobKinds.reconcile, "reconcile"); // "restarted" worker
      expect((await row(id)).status).toBe("applied");
      expect(
        (await audit(id)).some((x) => x.event_type === "reconcile_adopted"),
      ).toBe(true);
      // enforcement vanished on the target (target restarted): reconcile closes the stale row
      f2.clear();
      await run(responseJobKinds.reconcile, "reconcile");
      expect((await row(id)).status).toBe("expired");
      // orphan: a terminal row but the target still enforces its id ⇒ removed
      const orphanId = (
        await app.command(ctx, {
          action: "propose",
          incidentId: h.incidentId,
          targetId: a.targetId,
          ttlSeconds: 60,
          idempotencyKey: key(),
        })
      ).action.actionId;
      await deps()
        .adapter((begin as unknown as { target: ResponseTarget }).target)
        .apply(ctx, {
          ...ctx.scope,
          schemaVersion: 1,
          revision: 1,
          actionId: orphanId,
          incidentId: h.incidentId,
          targetRef: f2.origin,
          operation: "temporary_rate_limit",
          ttlSeconds: 60,
          idempotencyKey: orphanId,
          approval: null,
        });
      expect(f2.state().active).toBe(true);
      await run(responseJobKinds.reconcile, "reconcile");
      expect(f2.state().active).toBe(false); // no orphan enforcement
      // reconcile reschedules itself durably
      expect(
        Number(
          (
            await h.admin.query(
              "SELECT count(*) FROM platform.jobs WHERE kind=$1 AND state='queued'",
              [responseJobKinds.reconcile],
            )
          ).rows[0].count,
        ),
      ).toBeGreaterThan(0);
    });

    it("S05-A6: two concurrent approvals produce one apply; duplicate apply job is a no-op", async () => {
      const { f, targetId } = await scenario({ selfApproval: true });
      const p = await app.command(ctx, {
        action: "propose",
        incidentId: h.incidentId,
        targetId,
        ttlSeconds: 60,
        idempotencyKey: key(),
      });
      const id = p.action.actionId;
      const results = await Promise.allSettled([
        app.command(approver, {
          action: "approve",
          actionId: id,
          expectedRevision: 1,
        }),
        app.command(ctx, {
          action: "approve",
          actionId: id,
          expectedRevision: 1,
        }), // self-approval allowed on this fixture
      ]);
      expect(results.every((r) => r.status === "fulfilled")).toBe(true);
      expect(
        Number(
          (
            await h.admin.query(
              "SELECT count(*) FROM platform.jobs WHERE kind='sentinel.response.apply' AND subject_ref=$1",
              [id],
            )
          ).rows[0].count,
        ),
      ).toBe(1);
      await run(responseJobKinds.apply, id);
      await run(responseJobKinds.apply, id); // replay
      expect((await row(id)).status).toBe("applied");
      expect(f.state().actionId).toBe(id);
      const sa = (await audit(id)).find(
        (x) => x.event_type === "human_approved",
      )!;
      expect(typeof sa.metadata.selfApproved).toBe("boolean");
      await app.command(approver, {
        action: "rollback",
        actionId: id,
        expectedRevision: (await row(id)).revision,
      });
      await drain([responseJobKinds.expire]);
    });

    it("retention pins an incident that has response records (append-only audit, local-test policy)", async () => {
      await h.admin.query(
        "UPDATE sentinel.incidents SET status='closed',closed_at=now()-interval '31 days',closed_by='x',close_reason='old'",
      );
      const r = await retainIncidents(h.worker, ctx.scope);
      expect(r.incidents).toBe(0);
      expect(
        (
          await h.admin.query(
            "SELECT count(*)::int AS n FROM sentinel.incidents WHERE incident_id=$1",
            [h.incidentId],
          )
        ).rows[0].n,
      ).toBe(1);
    });

    it("no orphan enforcement remains on any fixture at the end", () => {
      for (const f of fixtures) expect(f.state().active).toBe(false);
    });
  },
);

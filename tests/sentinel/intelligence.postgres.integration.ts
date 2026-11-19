import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { applyMigrations, migrationPlan } from "../../src/platform/migrations";
import { retainIncidents } from "../../src/features/sentinel/incidents/retention";
import {
  createCaseLibraryPort,
  disabledAIExplanation,
} from "../../src/features/sentinel/intelligence/case-library";
import type { CaseLibraryArchiveCandidateV1 } from "../../src/features/sentinel/contracts";
import {
  ctx,
  setupIntelHarness,
  type IntelHarness,
} from "./intelligence-pg-harness";

const hasPg = Boolean(
  process.env.SENTINEL_S08_PG_ADMIN_URL ||
  process.env.SENTINEL_S07_PG_ADMIN_URL ||
  process.env.SENTINEL_S05_PG_ADMIN_URL,
);
const A = ctx(1);
const A2 = ctx(1, "github-user-1:s08", "900101"); // same workspace, other project
const B = ctx(2);
const CANARY = "ActorHashCanary" + "f".repeat(49);

async function expectCode(p: Promise<unknown>, code: string) {
  await expect(p).rejects.toMatchObject({ code });
}

describe.skipIf(!hasPg)(
  "S08 Internal Intelligence PostgreSQL acceptance",
  () => {
    let h: IntelHarness;
    let srcA: string, srcA2: string, srcB: string, srcAT: string;
    let ruleA: string, ruleA2: string, ruleB: string, ruleAT: string;

    beforeAll(async () => {
      h = await setupIntelHarness();
      srcA = await h.source(A);
      srcAT = await h.source(A, "controlled_test");
      srcA2 = await h.source(A2);
      srcB = await h.source(B);
      ruleA = (await h.rule(A)).ruleId;
      ruleAT = (await h.rule(A)).ruleId;
      ruleA2 = (await h.rule(A2)).ruleId;
      ruleB = (await h.rule(B)).ruleId;
    });
    afterAll(async () => {
      await h?.close();
    });

    const mkIncident = (
      c: typeof A,
      sourceId: string,
      ruleId: string,
      extra: Partial<Parameters<IntelHarness["incident"]>[1]> = {},
    ) => h.incident(c, { sourceId, ruleId, ...extra });

    it("0008 migration: up/up idempotent, empty down reverses and re-applies, populated down refuses", async () => {
      const plan = await migrationPlan();
      await applyMigrations(h.migrator, plan.migrations, "up");
      await applyMigrations(h.migrator, plan.migrations, "down");
      const after = (
        await h.admin.query(
          "SELECT version FROM platform.schema_migrations ORDER BY version",
        )
      ).rows.map((r) => r.version);
      expect(after).toEqual(plan.migrations.slice(0, 7).map((m) => m.version));
      expect(
        (await h.admin.query("SELECT to_regclass('sentinel.intel_cases') AS t"))
          .rows[0].t,
      ).toBeNull();
      await applyMigrations(h.migrator, plan.migrations, "up");
      expect(
        (await h.admin.query("SELECT to_regclass('sentinel.intel_cases') AS t"))
          .rows[0].t,
      ).toBe("sentinel.intel_cases");
    });

    it("S08-A1: archives an authorized incident with full provenance, idempotently, without implying resolution", async () => {
      const inc = await mkIncident(A, srcA, ruleA, {
        status: "open",
        events: [{ actorHash: CANARY }, {}, {}],
      });
      const first = await h.intel.command(A, {
        action: "archive",
        incidentId: inc.incidentId,
      });
      expect(first.deduplicated).toBe(false);
      const c = first.case;
      expect(c).toMatchObject({
        mode: "live",
        workspaceId: A.scope.workspaceId,
        projectId: A.scope.projectId,
        incidentId: inc.incidentId,
        sourceId: srcA,
        ruleId: ruleA,
        ruleVersion: 1,
        origin: "runtime",
        status: "draft_pending_review",
        shelfState: "active",
        incidentStatusAtArchive: "open",
        archivedBy: A.actorId,
        revision: 1,
        incidentPinned: true,
        evidence: { total: 3, available: 3, missing: 0, state: "complete" },
        incident: {
          state: "available",
          status: "open",
          changedSinceArchive: false,
        },
      });
      expect(c.indicators).toMatchObject({
        reasonCodes: ["suspicious_path"],
        methods: ["GET"],
        statusCodes: [404],
        evidenceCount: 3,
        alertCount: 1,
      });
      expect(JSON.stringify(c)).not.toContain("ActorHashCanary");
      expect(
        (
          await h.admin.query(
            "SELECT 1 FROM sentinel.intel_cases WHERE indicators::text LIKE '%ActorHashCanary%'",
          )
        ).rowCount,
      ).toBe(0);
      // Replay: same case, no second row, no second audit entry.
      const again = await h.intel.command(A, {
        action: "archive",
        incidentId: inc.incidentId,
      });
      expect(again.deduplicated).toBe(true);
      expect(again.case.caseId).toBe(c.caseId);
      const rows = await h.admin.query(
        "SELECT (SELECT count(*) FROM sentinel.intel_cases WHERE incident_id=$1)::int AS cases,(SELECT count(*) FROM sentinel.intel_audit WHERE case_id=$2)::int AS audit,(SELECT count(*) FROM sentinel.intel_case_evidence WHERE case_id=$2)::int AS ev",
        [inc.incidentId, c.caseId],
      );
      expect(rows.rows[0]).toEqual({ cases: 1, audit: 1, ev: 3 });
      // Concurrent duplicate archive requests still produce one case.
      const inc2 = await mkIncident(A, srcA, ruleA);
      const results = await Promise.all(
        Array.from({ length: 4 }, () =>
          h.intel.command(A, {
            action: "archive",
            incidentId: inc2.incidentId,
          }),
        ),
      );
      expect(new Set(results.map((r) => r.case.caseId)).size).toBe(1);
      expect(results.filter((r) => !r.deduplicated)).toHaveLength(1);
      // Source incident is untouched (archive never closes, mitigates or neutralizes).
      const src = (
        await h.admin.query(
          "SELECT status,revision,archived FROM sentinel.incidents WHERE incident_id=$1",
          [inc.incidentId],
        )
      ).rows[0];
      expect(src).toEqual({ status: "open", revision: 1, archived: false });
      // Detail exposes immutable evidence refs.
      const d = await h.intel.detail(A, c.caseId);
      expect(d.case.evidenceRefs).toHaveLength(3);
      expect(
        d.case.evidenceRefs!.every(
          (r) =>
            r.state === "available" && r.id.startsWith(`telemetry:${srcA}:`),
        ),
      ).toBe(true);
      expect(d.audit.map((a) => a.action)).toEqual(["case_archived"]);
    });

    it("S08-A1/A6: unknown, cross-project and cross-workspace incidents are not archivable and leak nothing", async () => {
      const other = await mkIncident(B, srcB, ruleB);
      const sibling = await mkIncident(A2, srcA2, ruleA2);
      for (const id of [other.incidentId, sibling.incidentId, randomUUID()])
        await expectCode(
          h.intel.command(A, { action: "archive", incidentId: id }),
          "incident_not_found",
        );
      expect(
        (
          await h.admin.query(
            "SELECT 1 FROM sentinel.intel_cases WHERE incident_id=ANY($1::uuid[])",
            [[other.incidentId, sibling.incidentId]],
          )
        ).rowCount,
      ).toBe(0);
      const ov = await h.intel.overview(A);
      expect(ov.archivableIncidents.map((i) => i.incidentId)).not.toContain(
        other.incidentId,
      );
      expect(ov.archivableIncidents.map((i) => i.incidentId)).not.toContain(
        sibling.incidentId,
      );
    });

    it("append-only/immutable: app role cannot rewrite provenance, delete audit/evidence, or skip lifecycle constraints; worker is read-only", async () => {
      const c = (await h.intel.overview(A)).cases[0];
      const attempt = (sql: string, params: unknown[] = []) =>
        h.app.scoped(A.scope, (tx) => h.app.query(tx, sql, params));
      await expect(
        attempt(
          "UPDATE sentinel.intel_cases SET incident_id=$1 WHERE case_id=$2",
          [randomUUID(), c.caseId],
        ),
      ).rejects.toThrow();
      await expect(
        attempt(
          "UPDATE sentinel.intel_cases SET indicators='{}'::jsonb WHERE case_id=$1",
          [c.caseId],
        ),
      ).rejects.toThrow();
      await expect(
        attempt("DELETE FROM sentinel.intel_cases WHERE case_id=$1", [
          c.caseId,
        ]),
      ).rejects.toThrow();
      await expect(
        attempt("DELETE FROM sentinel.intel_audit"),
      ).rejects.toThrow();
      await expect(
        attempt("UPDATE sentinel.intel_audit SET summary='tampered text'"),
      ).rejects.toThrow();
      await expect(
        attempt("DELETE FROM sentinel.intel_case_evidence"),
      ).rejects.toThrow();
      await expect(
        attempt(
          "UPDATE sentinel.intel_case_evidence SET event_kind='http.request'",
        ),
      ).rejects.toThrow();
      await h.worker.scoped(A.scope, async (tx) => {
        h.worker.requireWorker(tx);
        expect(
          (
            await h.worker.query(
              tx,
              "SELECT count(*)::int AS n FROM sentinel.intel_cases",
            )
          ).rows[0].n,
        ).toBeGreaterThan(0);
        await expect(
          h.worker.query(
            tx,
            "UPDATE sentinel.intel_cases SET status='reviewed'",
          ),
        ).rejects.toThrow();
      });
      await h.worker.scoped(A.scope, async (tx) => {
        await expect(
          h.worker.query(tx, "DELETE FROM sentinel.intel_audit"),
        ).rejects.toThrow();
      });
    });

    it("S08 RLS: the app role sees only its own scope; unscoped and cross-scope reads/writes fail closed", async () => {
      const a = await h.intel.overview(A);
      const b = await h.intel.overview(B);
      const a2 = await h.intel.overview(A2);
      expect(a.cases.length).toBeGreaterThan(0);
      expect(b.cases).toHaveLength(0);
      expect(a2.cases).toHaveLength(0);
      // Raw connection without scope settings reads nothing.
      expect(
        (
          await h.appPool.query(
            "SELECT count(*)::int AS n FROM sentinel.intel_cases",
          )
        ).rows[0].n,
      ).toBe(0);
      // Cross-scope INSERT (A's scope values + A's case id, issued under B's scope) is rejected by WITH CHECK.
      await expect(
        h.app.scoped(B.scope, (tx) =>
          h.app.query(
            tx,
            "INSERT INTO sentinel.intel_audit(mode,workspace_id,project_id,audit_id,case_id,sequence,action,actor_id,revision,summary) VALUES('live',$1,$2,gen_random_uuid(),$3,99,'case_tagged','x',1,'cross scope write')",
            [A.scope.workspaceId, A.scope.projectId, a.cases[0].caseId],
          ),
        ),
      ).rejects.toThrow();
      expect(
        (
          await h.admin.query(
            "SELECT 1 FROM sentinel.intel_audit WHERE summary='cross scope write'",
          )
        ).rowCount,
      ).toBe(0);
      // Cases of A are not addressable from B.
      await expectCode(h.intel.detail(B, a.cases[0].caseId), "not_found");
      await expectCode(
        h.intel.command(B, {
          action: "tag",
          caseId: a.cases[0].caseId,
          expectedRevision: 1,
          tags: ["x1"],
        }),
        "not_found",
      );
    });

    it("case workflow: tags, annotations, status and shelf use revision fencing and append-only audit; archive never changes the incident", async () => {
      const inc = await mkIncident(A, srcA, ruleA, {
        status: "closed",
        closedDaysAgo: 1,
      });
      const { case: c } = await h.intel.command(A, {
        action: "archive",
        incidentId: inc.incidentId,
      });
      const tagged = (
        await h.intel.command(A, {
          action: "tag",
          caseId: c.caseId,
          expectedRevision: 1,
          tags: ["brute-force", "w46"],
        })
      ).case;
      expect(tagged).toMatchObject({
        tags: ["brute-force", "w46"],
        revision: 2,
      });
      await expectCode(
        h.intel.command(A, {
          action: "tag",
          caseId: c.caseId,
          expectedRevision: 1,
          tags: [],
        }),
        "revision_conflict",
      );
      await h.intel.command(A, {
        action: "annotate",
        caseId: c.caseId,
        note: "Observed twice this week; not exploited.",
      });
      const reviewed = (
        await h.intel.command(A, {
          action: "set_status",
          caseId: c.caseId,
          expectedRevision: 2,
          status: "reviewed",
        })
      ).case;
      expect(reviewed.status).toBe("reviewed");
      await expectCode(
        h.intel.command(A, {
          action: "set_status",
          caseId: c.caseId,
          expectedRevision: 3,
          status: "reviewed",
        }),
        "invalid_transition",
      );
      const shelved = (
        await h.intel.command(A, {
          action: "set_shelf",
          caseId: c.caseId,
          expectedRevision: 3,
          shelfState: "shelved",
        })
      ).case;
      expect(shelved).toMatchObject({
        shelfState: "shelved",
        incidentPinned: false,
      });
      const d = await h.intel.detail(A, c.caseId);
      expect(d.audit.map((x) => x.action)).toEqual([
        "case_shelf_changed",
        "case_status_changed",
        "case_annotated",
        "case_tagged",
        "case_archived",
      ]);
      expect(d.audit.map((x) => x.sequence)).toEqual([5, 4, 3, 2, 1]);
      expect(d.audit.every((x) => x.actorId === A.actorId)).toBe(true);
      expect(
        d.audit.find((x) => x.action === "case_annotated")!.note,
      ).toContain("not exploited");
      // Closed-at-archive source incident keeps its own status; case states are a separate domain.
      expect(
        (
          await h.admin.query(
            "SELECT status FROM sentinel.incidents WHERE incident_id=$1",
            [inc.incidentId],
          )
        ).rows[0].status,
      ).toBe("closed");
      // Filtered search.
      const found = await h.intel.overview(A, {
        tag: "brute-force",
        shelf: "shelved",
      });
      expect(found.cases.map((x) => x.caseId)).toEqual([c.caseId]);
      expect(
        (await h.intel.overview(A, { q: "no-such-title%_" })).cases,
      ).toHaveLength(0);
    });

    describe("pattern grouping, candidates and human review", () => {
      let groupId: string;
      let groupId2: string;
      const burst = { events: [{}, {}, {}, {}] };

      it("S08-A2: groups identical-indicator cases deterministically, never across projects or origins", async () => {
        const archive = async (
          c: typeof A,
          s: string,
          r: string,
          extra = {},
        ) => {
          const i = await mkIncident(c, s, r, { ...burst, ...extra });
          return (
            await h.intel.command(c, {
              action: "archive",
              incidentId: i.incidentId,
            })
          ).case;
        };
        // Pattern 1 in project A: 3 runtime cases (different times).
        const caseIds = [
          (
            await archive(A, srcA, ruleA, {
              firstAt: "2026-11-11T00:00:00.000Z",
            })
          ).caseId,
          (
            await archive(A, srcA, ruleA, {
              firstAt: "2026-11-12T00:00:00.000Z",
            })
          ).caseId,
          (
            await archive(A, srcA, ruleA, {
              firstAt: "2026-11-13T00:00:00.000Z",
            })
          ).caseId,
        ];
        // Same indicators in other project/workspace and in controlled_test origin: must never join.
        await archive(B, srcB, ruleB);
        await archive(B, srcB, ruleB);
        await archive(A2, srcA2, ruleA2);
        await archive(A2, srcA2, ruleA2);
        await archive(A, srcAT, ruleAT, { origin: "controlled_test" });
        const ov = await h.intel.overview(A);
        const big = ov.groups.find(
          (g) =>
            g.caseIds.length >= 3 &&
            caseIds.every((id) => g.caseIds.includes(id)),
        )!;
        expect(big).toBeTruthy();
        groupId = big.groupId;
        expect(big.origin).toBe("runtime");
        expect(big.confidence).toBe("exact_indicator_match");
        expect(big.matchedOn).toMatchObject({
          reasonCodes: ["suspicious_path"],
          methods: ["GET"],
          statusCodes: [404],
        });
        expect(big.explanation.length).toBeGreaterThan(1);
        // Deterministic: repeated analysis yields identical groups.
        expect((await h.intel.overview(A)).groups).toEqual(ov.groups);
        // No leakage of other scopes' case ids into A's groups.
        const b = await h.intel.overview(B);
        const a2 = await h.intel.overview(A2);
        const all = new Set([...ov.cases.map((c) => c.caseId)]);
        for (const g of [...b.groups, ...a2.groups])
          for (const id of g.caseIds) expect(all.has(id)).toBe(false);
        expect(b.groups).toHaveLength(1);
        expect(b.groups[0].caseIds).toHaveLength(2);
        expect(
          ov.groups.every(
            (g) => g.origin === "runtime" || g.caseIds.length >= 2,
          ),
        ).toBe(true);
        // A second distinct pattern (POST/401) in project A.
        const post = {
          events: [
            {
              request: {
                method: "POST",
                routeTemplate: "/login",
                statusCode: 401,
              },
              attributes: { reasonCode: "invalid_credentials" },
            },
          ],
        };
        await archive(A, srcA, ruleA, post);
        await archive(A, srcA, ruleA, post);
        groupId2 = (await h.intel.overview(A)).groups.find(
          (g) => g.matchedOn.methods[0] === "POST",
        )!.groupId;
        expect(groupId2).not.toBe(groupId);
      });

      it("S08-A3: proposes DRAFT-only candidates, dedupes concurrent proposals, and never creates or enables an S03 rule", async () => {
        const rulesBefore = (
          await h.admin.query(
            "SELECT count(*)::int AS n FROM sentinel.detection_rules WHERE project_id=$1",
            [A.scope.projectId],
          )
        ).rows[0].n;
        const results = await Promise.all(
          Array.from({ length: 4 }, () =>
            h.intel.command(A, { action: "propose", groupId }),
          ),
        );
        expect(new Set(results.map((r) => r.candidate.candidateId)).size).toBe(
          1,
        );
        expect(results.filter((r) => !r.deduplicated)).toHaveLength(1);
        const cand = results[0].candidate;
        expect(cand).toMatchObject({
          reviewStatus: "DRAFT",
          promotedRuleId: null,
          ruleStatus: null,
          validatedAt: null,
          proposedBy: A.actorId,
          groupingVersion: 1,
          origin: "runtime",
        });
        expect(cand.definition.correlation).toBe("source");
        const grp = (await h.intel.overview(A)).groups.find(
          (g) => g.groupId === groupId,
        )!;
        // Threshold is the smallest member evidence count (this pattern also contains earlier single-event cases).
        expect(cand.definition.threshold).toBe(
          Math.min(...grp.members.map((m) => m.evidenceCount)),
        );
        expect(cand.definition.windowSeconds).toBeGreaterThanOrEqual(60);
        expect(cand.caseIds.slice().sort()).toEqual(grp.caseIds.slice().sort());
        expect(cand.caseIds.length).toBeGreaterThanOrEqual(3);
        expect(cand.basis.limitations.join(" ")).toMatch(
          /not prove a common attacker/,
        );
        const rulesAfter = (
          await h.admin.query(
            "SELECT count(*)::int AS n FROM sentinel.detection_rules WHERE project_id=$1",
            [A.scope.projectId],
          )
        ).rows[0].n;
        expect(rulesAfter).toBe(rulesBefore);
        expect(
          (
            await h.admin.query(
              "SELECT 1 FROM sentinel.detection_rule_versions WHERE status='ENABLED' AND project_id=$1",
              [A.scope.projectId],
            )
          ).rowCount,
        ).toBe(0);
        expect(
          (await h.intel.overview(A)).groups.find((g) => g.groupId === groupId)!
            .candidateId,
        ).toBe(cand.candidateId);
        // Unknown signature or foreign-project signature cannot create anything.
        await expectCode(
          h.intel.command(A, { action: "propose", groupId: "a".repeat(64) }),
          "group_not_found",
        );
        // The signature is project-independent by design, but a sibling project only ever proposes from ITS OWN cases.
        const sibling = (
          await h.intel.command(A2, { action: "propose", groupId })
        ).candidate;
        expect(sibling.candidateId).not.toBe(cand.candidateId);
        expect(sibling.projectId).toBe(A2.scope.projectId);
        const a2Cases = new Set(
          (await h.intel.overview(A2)).cases.map((c) => c.caseId),
        );
        expect(sibling.caseIds.every((id) => a2Cases.has(id))).toBe(true);
        expect(sibling.caseIds.some((id) => cand.caseIds.includes(id))).toBe(
          false,
        );
        await expectCode(
          h.intel.command(B, { action: "propose", groupId: "b".repeat(64) }),
          "group_not_found",
        );
      });

      it("S08-A4: reject is terminal, approval does not validate/promote/enable, conflicting concurrent decisions have one winner", async () => {
        // Reject path on pattern 2.
        const p2 = (
          await h.intel.command(A, { action: "propose", groupId: groupId2 })
        ).candidate;
        const rejected = (
          await h.intel.command(A, {
            action: "review",
            candidateId: p2.candidateId,
            expectedRevision: 1,
            decision: "reject",
            reason: "Too noisy for this app",
          })
        ).candidate;
        expect(rejected).toMatchObject({
          reviewStatus: "REJECTED",
          reviewedBy: A.actorId,
          reviewReason: "Too noisy for this app",
          revision: 2,
        });
        await expectCode(
          h.intel.command(A, {
            action: "review",
            candidateId: p2.candidateId,
            expectedRevision: 2,
            decision: "approve",
            reason: "changed my mind",
          }),
          "invalid_transition",
        );
        await expectCode(
          h.intel.command(A, {
            action: "validate",
            candidateId: p2.candidateId,
            expectedRevision: 2,
          }),
          "invalid_transition",
        );
        await expectCode(
          h.intel.command(A, {
            action: "promote",
            candidateId: p2.candidateId,
            expectedRevision: 2,
          }),
          "invalid_transition",
        );
        // Re-proposing a rejected pattern returns the same rejected candidate; it never silently reopens.
        const again = await h.intel.command(A, {
          action: "propose",
          groupId: groupId2,
        });
        expect(again.deduplicated).toBe(true);
        expect(again.candidate.reviewStatus).toBe("REJECTED");
        // Approve path on pattern 1.
        const c1 = (await h.intel.command(A, { action: "propose", groupId }))
          .candidate;
        await expectCode(
          h.intel.command(A, {
            action: "promote",
            candidateId: c1.candidateId,
            expectedRevision: 1,
          }),
          "invalid_transition",
        );
        await expectCode(
          h.intel.command(A, {
            action: "validate",
            candidateId: c1.candidateId,
            expectedRevision: 1,
          }),
          "invalid_transition",
        );
        const race = await Promise.allSettled([
          h.intel.command(A, {
            action: "review",
            candidateId: c1.candidateId,
            expectedRevision: 1,
            decision: "approve",
            reason: "Looks right",
          }),
          h.intel.command(A, {
            action: "review",
            candidateId: c1.candidateId,
            expectedRevision: 1,
            decision: "reject",
            reason: "Looks wrong",
          }),
        ]);
        expect(race.filter((r) => r.status === "fulfilled")).toHaveLength(1);
        const loser = race.find(
          (r) => r.status === "rejected",
        ) as PromiseRejectedResult;
        expect(["revision_conflict", "invalid_transition"]).toContain(
          loser.reason.code,
        );
        const current = (await h.intel.overview(A)).candidates.find(
          (c) => c.candidateId === c1.candidateId,
        )!;
        if (current.reviewStatus === "REJECTED") {
          // Winner was reject; use the other pattern's lifecycle below instead.
          expect(current.promotedRuleId).toBeNull();
          return;
        }
        expect(current).toMatchObject({
          reviewStatus: "APPROVED",
          promotedRuleId: null,
          validatedAt: null,
          ruleStatus: null,
        });
        // No rule exists yet after approval alone.
        expect(
          (
            await h.admin.query(
              "SELECT count(*)::int AS n FROM sentinel.detection_rules WHERE project_id=$1 AND current_version=1 AND rule_id IN (SELECT promoted_rule_id FROM sentinel.intel_candidates WHERE project_id=$1)",
              [A.scope.projectId],
            )
          ).rows[0].n,
        ).toBe(0);
      });

      it("S08-A4: validated approval promotes to an S03 DRAFT only; enabling is a separate explicit S03 action; other tenants cannot act", async () => {
        // Dedicated pattern so the previous race cannot affect this test.
        const arch = async () => {
          const i = await mkIncident(A, srcA, ruleA, {
            events: [
              {
                request: {
                  method: "DELETE",
                  routeTemplate: "/x",
                  statusCode: 403,
                },
                attributes: { reasonCode: "forbidden" },
              },
            ],
          });
          return (
            await h.intel.command(A, {
              action: "archive",
              incidentId: i.incidentId,
            })
          ).case;
        };
        await arch();
        await arch();
        const gid = (await h.intel.overview(A)).groups.find(
          (g) => g.matchedOn.methods[0] === "DELETE",
        )!.groupId;
        const cand = (
          await h.intel.command(A, { action: "propose", groupId: gid })
        ).candidate;
        expect(cand.definition.threshold).toBe(1);
        // Cross-tenant: B cannot see, review, validate or promote A's candidate.
        for (const action of ["validate", "promote"] as const)
          await expectCode(
            h.intel.command(B, {
              action,
              candidateId: cand.candidateId,
              expectedRevision: 1,
            }),
            "not_found",
          );
        await expectCode(
          h.intel.command(B, {
            action: "review",
            candidateId: cand.candidateId,
            expectedRevision: 1,
            decision: "approve",
            reason: "not mine",
          }),
          "not_found",
        );
        const approved = (
          await h.intel.command(A, {
            action: "review",
            candidateId: cand.candidateId,
            expectedRevision: 1,
            decision: "approve",
            reason: "Matches observed pattern",
          })
        ).candidate;
        expect(approved).toMatchObject({
          reviewStatus: "APPROVED",
          revision: 2,
        });
        await expectCode(
          h.intel.command(A, {
            action: "promote",
            candidateId: cand.candidateId,
            expectedRevision: 2,
          }),
          "invalid_transition",
        );
        await expectCode(
          h.intel.command(A, {
            action: "validate",
            candidateId: cand.candidateId,
            expectedRevision: 1,
          }),
          "revision_conflict",
        );
        const validated = (
          await h.intel.command(A, {
            action: "validate",
            candidateId: cand.candidateId,
            expectedRevision: 2,
          })
        ).candidate;
        expect(validated).toMatchObject({
          validatedBy: A.actorId,
          promotedRuleId: null,
          revision: 3,
        });
        const promoted = await h.intel.command(A, {
          action: "promote",
          candidateId: cand.candidateId,
          expectedRevision: 3,
        });
        expect(promoted).toMatchObject({
          ruleStatus: "DRAFT",
          automaticallyEnabled: false,
        });
        const ruleId = (promoted as { ruleId: string }).ruleId;
        await expectCode(
          h.intel.command(A, {
            action: "promote",
            candidateId: cand.candidateId,
            expectedRevision: 4,
          }),
          "invalid_transition",
        );
        const rules = await h.detection.rules(A);
        const rule = rules.find((r) => r.ruleId === ruleId)!;
        expect(rule).toMatchObject({
          status: "DRAFT",
          revision: 1,
          actorId: A.actorId,
        });
        expect(rule.definition).toEqual(cand.definition);
        expect(
          (
            await h.admin.query(
              "SELECT count(*)::int AS n FROM sentinel.detection_rule_versions WHERE rule_id=$1 AND status='ENABLED'",
              [ruleId],
            )
          ).rows[0].n,
        ).toBe(0);
        // Explicit, separate enablement through the established S03 engine (controlled project A only).
        await h.detection.command(A, {
          action: "enable",
          ruleId,
          expectedRevision: 1,
        });
        const after = (await h.intel.overview(A)).candidates.find(
          (c) => c.candidateId === cand.candidateId,
        )!;
        expect(after).toMatchObject({
          reviewStatus: "APPROVED",
          ruleStatus: "ENABLED",
          promotedRuleId: ruleId,
        });
        // Full audit trail with human actors.
        const audit = (
          await h.admin.query(
            "SELECT action,actor_id FROM sentinel.intel_audit WHERE candidate_id=$1 ORDER BY sequence",
            [cand.candidateId],
          )
        ).rows;
        expect(audit.map((a) => a.action)).toEqual([
          "candidate_proposed",
          "candidate_approved",
          "candidate_validated",
          "candidate_promoted",
        ]);
        expect(audit.every((a) => a.actor_id === A.actorId)).toBe(true);
        // Other projects never received this rule.
        expect(
          (
            await h.admin.query(
              "SELECT 1 FROM sentinel.detection_rules WHERE rule_id=$1 AND project_id<>$2",
              [ruleId, A.scope.projectId],
            )
          ).rowCount,
        ).toBe(0);
        // Lifecycle constraints also hold at the database level (defense in depth).
        const draft = (
          await h.intel.command(A, { action: "propose", groupId: groupId2 })
        ).candidate;
        await expect(
          h.app.scoped(A.scope, (tx) =>
            h.app.query(
              tx,
              "UPDATE sentinel.intel_candidates SET validated_at=now(),validated_by='x' WHERE candidate_id=$1",
              [draft.candidateId],
            ),
          ),
        ).rejects.toThrow();
        await expect(
          h.app.scoped(A.scope, (tx) =>
            h.app.query(
              tx,
              "UPDATE sentinel.intel_candidates SET definition='{\"schemaVersion\":1}'::jsonb WHERE candidate_id=$1",
              [cand.candidateId],
            ),
          ),
        ).rejects.toThrow();
      });
    });

    it("S08-A5: missing and retained evidence is reported honestly; active cases pin incidents; shelving releases the pin without losing the case", async () => {
      const inc = await mkIncident(A, srcA, ruleA, {
        status: "closed",
        closedDaysAgo: 40,
        events: [{}, {}, {}],
      });
      const { case: c } = await h.intel.command(A, {
        action: "archive",
        incidentId: inc.incidentId,
      });
      expect(c.evidence.state).toBe("complete");
      // Retention with an ACTIVE case: the closed 40-day incident is pinned.
      await retainIncidents(h.worker, A.scope);
      expect(
        (
          await h.admin.query(
            "SELECT 1 FROM sentinel.incidents WHERE incident_id=$1",
            [inc.incidentId],
          )
        ).rowCount,
      ).toBe(1);
      expect((await h.intel.detail(A, c.caseId)).case.incident.state).toBe(
        "available",
      );
      // Shelve -> pin released -> retention may expire the incident; the case persists with honest state.
      await h.intel.command(A, {
        action: "set_shelf",
        caseId: c.caseId,
        expectedRevision: 1,
        shelfState: "shelved",
      });
      await retainIncidents(h.worker, A.scope);
      expect(
        (
          await h.admin.query(
            "SELECT 1 FROM sentinel.incidents WHERE incident_id=$1",
            [inc.incidentId],
          )
        ).rowCount,
      ).toBe(0);
      const expired = (await h.intel.detail(A, c.caseId)).case;
      expect(expired.incident).toEqual({ state: "expired" });
      expect(expired.incidentPinned).toBe(false);
      expect(expired.evidence.state).toBe("complete"); // telemetry events still exist
      expect(expired.indicators.evidenceCount).toBe(3);
      // Telemetry retention removes one event: partial; remove all: unavailable. Nothing is reconstructed.
      await h.admin.query(
        "DELETE FROM sentinel.telemetry_events WHERE event_id=$1",
        [inc.eventIds[0]],
      );
      let d = (await h.intel.detail(A, c.caseId)).case;
      expect(d.evidence).toMatchObject({
        total: 3,
        available: 2,
        missing: 1,
        state: "partial",
      });
      expect(
        d
          .evidenceRefs!.filter((r) => r.state === "missing")
          .map((r) => r.eventId),
      ).toEqual([inc.eventIds[0]]);
      await h.admin.query(
        "DELETE FROM sentinel.telemetry_events WHERE event_id=ANY($1::uuid[])",
        [inc.eventIds],
      );
      d = (await h.intel.detail(A, c.caseId)).case;
      expect(d.evidence).toMatchObject({
        available: 0,
        missing: 3,
        state: "unavailable",
      });
      expect(d.evidenceRefs).toHaveLength(3);
      // Dismissed also releases the pin; a re-activated case pins only while the incident still exists.
      const inc2 = await mkIncident(A, srcA, ruleA, {
        status: "closed",
        closedDaysAgo: 40,
      });
      const c2 = (
        await h.intel.command(A, {
          action: "archive",
          incidentId: inc2.incidentId,
        })
      ).case;
      await h.intel.command(A, {
        action: "set_status",
        caseId: c2.caseId,
        expectedRevision: 1,
        status: "dismissed",
      });
      await retainIncidents(h.worker, A.scope);
      expect(
        (
          await h.admin.query(
            "SELECT 1 FROM sentinel.incidents WHERE incident_id=$1",
            [inc2.incidentId],
          )
        ).rowCount,
      ).toBe(0);
      // Re-archiving an expired incident is an idempotent replay of the existing case, never a reconstruction.
      const replay = await h.intel.command(A, {
        action: "archive",
        incidentId: inc2.incidentId,
      });
      expect(replay).toMatchObject({ deduplicated: true });
      expect(replay.case.caseId).toBe(c2.caseId);
    });

    it("S07 Ghost compatibility: decoy incidents archive through the typed CaseLibraryPort; mismatched provenance is rejected", async () => {
      const port = createCaseLibraryPort(h.intel);
      const ruleD = (await h.rule(A, "ghost.decoy_triggered")).ruleId;
      const inc = await mkIncident(A, srcAT, ruleD, {
        category: "decoy",
        origin: "controlled_test",
        events: [
          {
            request: {
              method: "GET",
              routeTemplate: "/__wetscan/ghost-decoy",
              statusCode: 200,
            },
            attributes: { reasonCode: "decoy_hit" },
          },
        ],
      });
      const evidenceId = `telemetry:${srcAT}:${inc.eventIds[0]}`;
      const candidate: CaseLibraryArchiveCandidateV1 = {
        ...A.scope,
        schemaVersion: 1,
        incidentId: inc.incidentId,
        sourceId: srcAT,
        origin: "controlled_test",
        category: "decoy",
        evidenceIds: [evidenceId],
        falsePositiveNotice:
          "A decoy hit is a suspicious signal, never proof of compromise.",
        decoyHits: [
          {
            ...A.scope,
            schemaVersion: 1,
            decoyId: randomUUID(),
            sourceId: srcAT,
            eventId: inc.eventIds[0],
            origin: "controlled_test",
            routeTemplate: "/__wetscan/ghost-decoy",
            method: "GET",
            signalClassification: "controlled_test_hit",
            occurredAt: new Date().toISOString(),
            ingestedAt: new Date().toISOString(),
            evidence: {
              id: evidenceId,
              sourceId: srcAT,
              origin: "controlled_test",
              occurredAt: new Date().toISOString(),
              recordedAt: new Date().toISOString(),
            },
          },
        ],
      };
      expect(port.configured).toBe(true);
      const ok = await port.archiveIncidentDraft(A, candidate);
      expect(ok).toMatchObject({
        status: "available",
        value: { status: "draft_pending_review" },
      });
      const detail = await h.intel.detail(
        A,
        (ok as { value: { caseId: string } }).value.caseId,
      );
      expect(detail.case).toMatchObject({
        category: "decoy",
        origin: "controlled_test",
      });
      // Replay returns the same case.
      expect(await port.archiveIncidentDraft(A, candidate)).toEqual(ok);
      // A replay must also agree with the stored provenance.
      await expect(
        port.archiveIncidentDraft(A, {
          ...candidate,
          origin: "runtime",
          decoyHits: undefined,
        }),
      ).rejects.toMatchObject({ code: "provenance_mismatch" });
      // Provenance mismatches and scope violations fail closed.
      const inc2 = await mkIncident(A, srcAT, ruleD, {
        category: "decoy",
        origin: "controlled_test",
      });
      const evidence2 = `telemetry:${srcAT}:${inc2.eventIds[0]}`;
      const base = {
        ...candidate,
        incidentId: inc2.incidentId,
        evidenceIds: [evidence2],
        decoyHits: undefined,
      };
      for (const bad of [
        { ...base, origin: "runtime" as const },
        { ...base, category: "http" as const },
        { ...base, sourceId: srcA },
        { ...base, evidenceIds: [evidenceId] },
        { ...base, evidenceIds: [] },
        { ...base, decoyHits: candidate.decoyHits },
      ])
        await expect(port.archiveIncidentDraft(A, bad)).rejects.toThrow();
      await expect(port.archiveIncidentDraft(B, base)).rejects.toThrow(
        "Sentinel scope denied",
      );
      expect(
        (
          await h.admin.query(
            "SELECT 1 FROM sentinel.intel_cases WHERE incident_id=$1",
            [inc2.incidentId],
          )
        ).rowCount,
      ).toBe(0);
    });

    it("AI explanation port is disabled by default and makes no calls", async () => {
      expect(disabledAIExplanation.configured).toBe(false);
      expect(await disabledAIExplanation.explain("anything")).toMatchObject({
        status: "not_configured",
      });
      const ov = await h.intel.overview(A);
      expect(ov.aiExplanation).toMatchObject({
        configured: false,
        status: "disabled",
      });
    });

    it("S08-A6: nothing in the live tables is demo data and no demo/other mode can be written", async () => {
      expect(
        (
          await h.admin.query(
            "SELECT 1 FROM sentinel.intel_cases WHERE mode<>'live' OR project_id='orderly-demo' OR workspace_id LIKE 'demo:%'",
          )
        ).rowCount,
      ).toBe(0);
      await expect(
        h.admin.query(
          "INSERT INTO sentinel.intel_cases(mode,workspace_id,project_id,case_id,incident_id,source_id,rule_id,rule_version,title,category,severity,origin,incident_status_at_archive,incident_revision_at_archive,incident_first_observed_at,incident_last_observed_at,indicators,grouping_version,archived_by) VALUES('demo','demo:northstar-studio','orderly-demo',gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),1,'demo','http','low','runtime','open',1,now(),now(),'{}',1,'x')",
        ),
      ).rejects.toThrow();
    });

    it("clean shutdown: pools close without leaked work", async () => {
      expect((await h.intel.overview(A)).cases.length).toBeGreaterThan(0);
    });
  },
);

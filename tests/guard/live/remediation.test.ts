import { it, expect } from "vitest";
import { analysisFixture, afterScan } from "./analysis-fixture";
import {
  deterministicAdvice,
  adviceInput,
  compareRecordedRetest,
} from "../../../src/features/guard/live/product-remediation";
it("persists bounded advice/review with original commit/evidence; approval cannot manufacture a patch or verified fix", async () => {
  const f = await analysisFixture(),
    p = await f.store.reserveAdvice(f.grant, f.grant, f.job.id, {
      revision: 1,
      findingId: f.job.findings[0].id,
      requestKey: "g03-unit-advice01",
      aiConsent: false,
    });
  await f.store.finishAdvice(f.grant, f.grant, f.job.id, 2, p.record.id, {
    advice: deterministicAdvice(f.job.findings[0]),
  });
  await f.store.reviewAdvice(f.grant, f.grant, f.job.id, {
    revision: 3,
    proposalId: p.record.id,
    decision: "approved",
    reason: "Reviewed original finding and rule",
  });
  const value = await f.store.extensions(f.grant, f.grant, f.job.id);
  expect(value.proposals[0]).toMatchObject({
    state: "completed",
    review: "approved",
    baseCommit: f.job.repository.commit,
    untrusted: true,
    patchApplied: false,
    retest: "NOT_EXECUTED",
  });
  expect(f.get().current.findings[0].status).toBe("potential");
  await f.store.createReport(f.grant, f.grant, f.job.id, { revision: 4 });
  expect(f.get().current.guardReports![0].body.remediation).toHaveLength(1);
});
it("reserves no more than three provider attempts durably; unknown/failure is not automatically retried", async () => {
  const f = await analysisFixture();
  for (let i = 0; i < 3; i++) {
    const p = await f.store.reserveAdvice(f.grant, f.grant, f.job.id, {
      revision: f.get().revision,
      findingId: f.job.findings[0].id,
      requestKey: "g03-unit-attempt-" + i,
      aiConsent: true,
    });
    const r = f.get().revision;
    const duplicate = await f.store.reserveAdvice(f.grant, f.grant, f.job.id, {
      revision: r,
      findingId: f.job.findings[0].id,
      requestKey: "g03-unit-attempt-" + i,
      aiConsent: true,
    });
    expect(duplicate.reused).toBe(true);
    expect(f.get().revision).toBe(r);
    await f.store.finishAdvice(
      f.grant,
      f.grant,
      f.job.id,
      r,
      p.record.id,
      null,
    );
  }
  await expect(
    f.store.reserveAdvice(f.grant, f.grant, f.job.id, {
      revision: f.get().revision,
      findingId: f.job.findings[0].id,
      requestKey: "g03-unit-attempt-4",
      aiConsent: true,
    }),
  ).rejects.toThrow("source_limit");
  expect(
    f.get().current.guardRemediation!.every((p) => p.state === "failed"),
  ).toBe(true);
});
it.each(["stale", "historical", "leased", "expired", "synthetic"])(
  "advice fails closed for %s before persistence",
  async (mode) => {
    const f = await analysisFixture();
    if (mode === "historical") f.queue.kind = "guard.scan.prepare";
    if (mode === "leased") {
      f.queue.state = "leased";
      f.queue.lease_owner = "active";
    }
    if (mode === "synthetic")
      f.get().current.findings[0].evidence[0].synthetic = true;
    const grant =
      mode === "expired" ? { ...f.grant, expiresAt: Date.now() - 1 } : f.grant;
    await expect(
      f.store.reserveAdvice(grant, grant, f.job.id, {
        revision: mode === "stale" ? 99 : 1,
        findingId: f.job.findings[0].id,
        requestKey: "g03-unit-boundary",
        aiConsent: false,
      }),
    ).rejects.toThrow();
    expect(f.c.calls.some((c) => c.sql.startsWith("UPDATE"))).toBe(false);
  },
);
it("read-only consumers cannot reserve or approve advice", async () => {
  const f = await analysisFixture(),
    grant = { ...f.grant, operations: ["read"] as const };
  expect((await f.store.extensions(grant, grant, f.job.id)).proposals).toEqual(
    [],
  );
  await expect(
    f.store.reserveAdvice(grant, grant, f.job.id, {
      revision: 1,
      findingId: f.job.findings[0].id,
      requestKey: "g03-unit-readonly",
      aiConsent: false,
    }),
  ).rejects.toThrow("authorization");
});
it("AI input excludes source/title/path/repository/package/evidence summaries", async () => {
  const f = await analysisFixture();
  const finding = f.job.findings[0];
  finding.title = "PRIVATE SOURCE";
  finding.location.path = "private-company/route.ts";
  finding.evidence[0].summary = "MATCHED_VALUE";
  const input = adviceInput(finding);
  expect(Object.keys(input).sort()).toEqual([
    "confidence",
    "engine",
    "ruleId",
    "severity",
  ]);
  expect(JSON.stringify(input)).not.toMatch(/PRIVATE|MATCHED|private-company/);
});
it("a complete recorded scanner comparison can only prove not_detected, never verified_fixed", async () => {
  const f = await analysisFixture(),
    after = afterScan(f.job);
  const r = compareRecordedRetest(f.grant, f.job, after, f.job.findings[0].id);
  expect(r).toMatchObject({
    outcome: "not_detected",
    verifiedFixed: false,
    afterCommit: after.repository.commit,
  });
  await f.store.recordRetest(
    f.grant,
    f.grant,
    f.job.id,
    1,
    after,
    f.job.findings[0].id,
  );
  expect(f.get().current.guardRetests).toHaveLength(1);
  expect(f.get().current.findings[0].status).toBe("potential");
});
it.each(["partial", "version", "cleanup", "failed"])(
  "retest %s remains inconclusive",
  async (mode) => {
    const f = await analysisFixture(),
      after = afterScan(f.job);
    if (mode === "partial") after.sourceCoverage!.status = "partial";
    const run = after.runs.find((r) => r.engine === "sast")!;
    if (mode === "version") run.version = "different";
    if (mode === "cleanup") run.executionEvidence = undefined;
    if (mode === "failed") run.status = "failed";
    expect(
      compareRecordedRetest(f.grant, f.job, after, f.job.findings[0].id)
        .outcome,
    ).toBe("inconclusive");
  },
);
it("moved source lines do not manufacture a negative result for a finding still present", async () => {
  const f = await analysisFixture(),
    after = afterScan(f.job);
  after.findings = structuredClone(f.job.findings);
  after.findings[0].location.line = 100;
  after.findings[0].evidence.forEach(
    (e) => (e.commit = after.repository.commit),
  );
  expect(
    compareRecordedRetest(f.grant, f.job, after, f.job.findings[0].id).outcome,
  ).toBe("reproduced");
});
it.each(["same_commit", "cross_project", "synthetic"])(
  "retest denies %s",
  async (mode) => {
    const f = await analysisFixture(),
      after = afterScan(f.job);
    if (mode === "same_commit")
      after.repository.commit = f.job.repository.commit;
    if (mode === "cross_project") after.projectId = "github-456";
    if (mode === "synthetic") {
      after.findings = structuredClone(f.job.findings);
      after.findings[0].evidence[0].synthetic = true;
    }
    expect(() =>
      compareRecordedRetest(f.grant, f.job, after, f.job.findings[0].id),
    ).toThrow();
  },
);

it("untrusted advice is HTML-escaped in a persisted report", async () => {
  const { analysisReportHtml } =
    await import("../../../src/features/guard/live/analysis-report");
  const f = await analysisFixture(),
    p = await f.store.reserveAdvice(f.grant, f.grant, f.job.id, {
      revision: 1,
      findingId: f.job.findings[0].id,
      requestKey: "g03-html-report01",
      aiConsent: false,
    });
  await f.store.finishAdvice(f.grant, f.grant, f.job.id, 2, p.record.id, {
    advice: {
      ...deterministicAdvice(f.job.findings[0]),
      explanation: "</pre><script>alert(1)</script>",
    },
  });
  await f.store.createReport(f.grant, f.grant, f.job.id, { revision: 3 });
  const reports = await f.store.reports(f.grant, f.grant, f.job.id);
  const html = analysisReportHtml(reports[0].body);
  expect(html).toContain("&lt;script&gt;");
  expect(html).not.toContain("<script>");
});

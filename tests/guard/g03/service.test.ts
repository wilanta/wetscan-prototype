import { it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { fixture, fileFixture, content, edit, plan } from "./fixture";
import { fingerprint } from "../../../src/platform/identity";
import { G03Error } from "../../../src/features/guard/g03/contracts";
const signal = () => new AbortController().signal;
it("distinguishes provider settings from a recorded successful response for the exact plan", async () => {
  const f = await fixture();
  expect((await f.service.state(f.authority, f.job.id)).provider).toMatchObject(
    { requestEnabled: true, successfulResponseRecorded: false },
  );
  await f.proposed();
  expect(
    (await f.service.state(f.authority, f.job.id)).provider
      .successfulResponseRecorded,
  ).toBe(true);
  f.provider.plan.mockReturnValue({ ...plan, model: "another_model" });
  expect(
    (await f.service.state(f.authority, f.job.id)).provider
      .successfulResponseRecorded,
  ).toBe(false);
});
it("AI off persists sanitized deterministic guidance without source or provider calls", async () => {
  const f = await fixture();
  const before = structuredClone(f.get().job);
  await f.service.generate(
    f.authority,
    f.job.id,
    f.generate({
      aiConsent: false,
      sourceConsent: false,
      path: null,
      sourceSha256: null,
      planDigest: null,
    }),
    signal(),
  );
  expect(f.provider.generate).not.toHaveBeenCalled();
  expect(f.source.read).not.toHaveBeenCalled();
  const s = await f.service.state(f.authority, f.job.id);
  expect(s.proposals[0]).toMatchObject({
    state: "completed",
    consent: { ai: false, source: false },
  });
  expect(s.proposals[0].patch).toBeUndefined();
  expect(f.get().job.findings).toEqual(before.findings);
  expect(f.get().job.audit).toEqual(before.audit);
});
it("explicit source preview reads only the authorized finding path and audits without AI", async () => {
  const f = await fixture();
  await expect(
    f.service.context(
      f.authority,
      f.job.id,
      { ...f.context(), sourceConsent: false },
      signal(),
    ),
  ).rejects.toThrow("source_consent_required");
  const r = await f.service.context(
    f.authority,
    f.job.id,
    f.context(),
    signal(),
  );
  expect(r.binding.sourceSha256).toBe(f.file.sourceSha256);
  expect(f.source.read).toHaveBeenCalledWith(
    f.authority,
    "main",
    f.job.repository.commit,
    "route.ts",
    expect.any(AbortSignal),
  );
  expect(f.provider.generate).not.toHaveBeenCalled();
  await expect(
    f.service.context(
      f.authority,
      f.job.id,
      { ...f.context(), path: "other.ts" },
      signal(),
    ),
  ).rejects.toThrow("source_scope_mismatch");
});
it("binds provider provenance, consent, finding evidence, source and minimal diff", async () => {
  const f = await fixture(),
    p = await f.proposed();
  expect(p.state).toBe("completed");
  expect(p.patch!.diff).toContain(
    "+export function route(input: string) { return JSON.parse(input); }",
  );
  expect(p.binding!.sourceSha256).toBe(f.file.sourceSha256);
  expect(p.consent.plan).toEqual(plan);
  expect(p.providerResult!.responseId).toBe("unit_response");
  expect(f.provider.generate.mock.calls).toHaveLength(1);
  const queries = f.client.calls.map((c) => c.sql);
  expect(queries.some((s) => s.includes("pg_advisory_xact_lock"))).toBe(true);
  expect(queries.some((s) => s.includes("jsonb_array_elements"))).toBe(true);
});
it("idempotency never repeats an AI call and rejects changed consent", async () => {
  const f = await fixture();
  await f.proposed();
  expect(
    (await f.service.generate(f.authority, f.job.id, f.generate(), signal()))
      .reused,
  ).toBe(true);
  expect(f.provider.generate).toHaveBeenCalledTimes(1);
  await expect(
    f.service.generate(
      f.authority,
      f.job.id,
      f.generate({ sourceConsent: false, path: null, sourceSha256: null }),
      signal(),
    ),
  ).rejects.toThrow("request_key_conflict");
});
it.each([
  { baseCommit: "c".repeat(40) },
  { sourceSha256: "d".repeat(64) },
  { path: "other.ts" },
  { planDigest: "b".repeat(64) },
  { aiConsent: true, sourceConsent: false, path: "route.ts" },
])(
  "rejects stale/inconsistent request before a provider call %j",
  async (invalid) => {
    const f = await fixture();
    await expect(
      f.service.generate(f.authority, f.job.id, f.generate(invalid), signal()),
    ).rejects.toThrow();
    expect(f.provider.generate).not.toHaveBeenCalled();
  },
);
it.each([
  { requests: 20, cost: "0", recent: 0 },
  { requests: 0, cost: "499999", recent: 0 },
  { requests: 0, cost: "0", recent: 1 },
])("enforces durable budget/rate reservation %j", async (usage) => {
  const f = await fixture();
  f.setUsage(usage);
  await expect(f.proposed()).rejects.toThrow("provider_budget_exhausted");
  expect(f.provider.generate).not.toHaveBeenCalled();
});
it("unconfigured provider fails closed without reserving or sending context", async () => {
  const f = await fixture();
  f.provider.plan.mockImplementation(() => {
    throw new G03Error("provider_not_configured", 503);
  });
  await expect(f.proposed()).rejects.toThrow("provider_not_configured");
  expect(f.source.read).not.toHaveBeenCalled();
  expect(f.provider.generate).not.toHaveBeenCalled();
});
it.each(["timeout", "provider_error", "prompt_injection"])(
  "consumes failed provider attempt %s with no sensitive body or retry",
  async (reason) => {
    const f = await fixture();
    f.provider.generate.mockRejectedValue(
      Error(reason + " SECRET_PROVIDER_BODY"),
    );
    const p = await f.proposed();
    expect(p.state).toBe("failed");
    expect(JSON.stringify(f.get())).not.toContain("SECRET_PROVIDER_BODY");
    await f.service.generate(f.authority, f.job.id, f.generate(), signal());
    expect(f.provider.generate).toHaveBeenCalledTimes(1);
  },
);
it("rejects synthetic/mismatched evidence and expired/cross-project grants", async () => {
  const f = await fixture();
  f.get().job.findings[0].evidence[0].synthetic = true;
  await expect(f.proposed()).rejects.toThrow();
  expect(f.provider.generate).not.toHaveBeenCalled();
  const other = await fixture();
  await expect(
    other.service.state(
      { ...other.authority, grant: { ...other.grant, expiresAt: 0 } },
      other.job.id,
    ),
  ).rejects.toThrow();
  await expect(
    other.service.state(
      {
        ...other.authority,
        grant: { ...other.grant, projectId: "github-456" },
      },
      other.job.id,
    ),
  ).rejects.toThrow();
});
it("revocation after provider response leaves a consumed reservation without a success claim", async () => {
  const f = await fixture();
  f.revalidate
    .mockImplementationOnce(async () => f.authority)
    .mockRejectedValueOnce(Error("revoked"));
  await expect(f.proposed()).rejects.toThrow("revoked");
  expect(f.get().job.guardG03!.proposals[0].state).toBe("reserved");
});
it("review approval is bound to current source and exact patch digest; it writes no GitHub data", async () => {
  const f = await fixture(),
    p = await f.proposed();
  await expect(
    f.service.review(
      f.authority,
      f.job.id,
      {
        revision: f.get().revision,
        proposalId: p.id,
        patchDigest: "bad",
        decision: "approved",
        reason: "Reviewed changes",
      },
      signal(),
    ),
  ).rejects.toThrow("patch_review_conflict");
  await f.service.review(
    f.authority,
    f.job.id,
    {
      revision: f.get().revision,
      proposalId: p.id,
      patchDigest: p.patch!.digest,
      decision: "approved",
      reason: "Reviewed the exact diff",
    },
    signal(),
  );
  expect(f.get().job.guardG03!.proposals[0].review!.decision).toBe("approved");
  expect(f.github.publish).not.toHaveBeenCalled();
});
it("PR writes require approval, owner consent, current permissions and fresh source", async () => {
  const f = await fixture(),
    p = await f.proposed();
  const body = () => ({
    revision: f.get().revision,
    proposalId: p.id,
    patchDigest: p.patch!.digest,
    repositoryId: "123",
    baseCommit: p.baseCommit,
    writeConsent: true,
  });
  await expect(
    f.service.publish(f.authority, f.job.id, body(), signal()),
  ).rejects.toThrow("pr_approval_required");
  await f.service.review(
    f.authority,
    f.job.id,
    {
      revision: f.get().revision,
      proposalId: p.id,
      patchDigest: p.patch!.digest,
      decision: "approved",
      reason: "Reviewed the exact diff",
    },
    signal(),
  );
  await expect(
    f.service.publish(
      f.authority,
      f.job.id,
      { ...body(), writeConsent: false },
      signal(),
    ),
  ).rejects.toThrow("repository_write_consent_required");
  f.github.permission.mockRejectedValueOnce(Error("permission denied"));
  await expect(
    f.service.publish(f.authority, f.job.id, body(), signal()),
  ).rejects.toThrow("permission denied");
  expect(f.github.publish).not.toHaveBeenCalled();
  await f.service.publish(f.authority, f.job.id, body(), signal());
  expect(f.github.publish).toHaveBeenCalledTimes(1);
  expect(f.get().job.guardG03!.proposals[0].pr).toMatchObject({
    state: "open",
    number: 1,
    patchDigest: p.patch!.digest,
  });
  await expect(
    f.service.publish(f.authority, f.job.id, body(), signal()),
  ).rejects.toThrow("pr_approval_required");
});
it("unknown GitHub write is not retried; status reconciliation is read-only", async () => {
  const f = await fixture(),
    p = await f.approved();
  f.github.publish.mockRejectedValueOnce(Error("network after write SECRET"));
  await f.service.publish(
    f.authority,
    f.job.id,
    {
      revision: f.get().revision,
      proposalId: p.id,
      patchDigest: p.patch!.digest,
      repositoryId: "123",
      baseCommit: p.baseCommit,
      writeConsent: true,
    },
    signal(),
  );
  expect(f.get().job.guardG03!.proposals[0].pr!.state).toBe("unknown");
  await f.service.prStatus(
    f.authority,
    f.job.id,
    { revision: f.get().revision, proposalId: p.id },
    signal(),
  );
  expect(f.get().job.guardG03!.proposals[0].pr!.state).toBe("open");
  expect(f.github.publish).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(f.get())).not.toContain("SECRET");
});
it("queues the relevant real G02 scanner only after separate retest consent and compares exact revision", async () => {
  const f = await fixture(),
    p = await f.approved();
  const fixed = fileFixture(
    content.replace(edit.oldText, edit.newText),
    f.after.repository.commit,
  );
  f.source.read.mockResolvedValue(fixed);
  const body = () => ({
    revision: f.get().revision,
    proposalId: p.id,
    afterCommit: f.after.repository.commit,
    branch: "main",
    retestConsent: true,
  });
  await expect(
    f.service.startRetest(
      f.authority,
      f.job.id,
      { ...body(), retestConsent: false },
      signal(),
    ),
  ).rejects.toThrow("retest_consent_required");
  expect(f.scanner.enqueue).not.toHaveBeenCalled();
  await f.service.startRetest(f.authority, f.job.id, body(), signal());
  const t = f.get().job.guardG03!.retests[0];
  expect(f.scanner.enqueue).toHaveBeenCalledWith(
    f.authority,
    expect.objectContaining({
      engine: "sast",
      commit: f.after.repository.commit,
      branch: "main",
      idempotencyKey: expect.stringMatching(/^g02-live-g03-retest-/),
    }),
    expect.any(AbortSignal),
  );
  expect(t.verifiedFixed).toBe(false);
  const r = await f.service.compareRetest(
    f.authority,
    f.job.id,
    { revision: f.get().revision, retestId: t.id },
    signal(),
  );
  expect(r.value).toMatchObject({
    outcome: "fixed",
    evidenceOutcome: "verified_fixed",
    verifiedFixed: true,
  });
  expect(f.get().job.findings[0].status).toBe("potential");
  f.source.read.mockRejectedValueOnce(new G03Error("stale_commit"));
  await f.service.compareRetest(
    f.authority,
    f.job.id,
    { revision: f.get().revision, retestId: t.id },
    signal(),
  );
  expect(f.get().job.guardG03!.retests[0]).toMatchObject({
    outcome: "not_verified",
    verifiedFixed: false,
    invalidatedAt: expect.any(String),
  });
});
it("server reports persist scope, audit and provenance, escape XSS and log authorized downloads", async () => {
  const f = await fixture();
  await f.proposed();
  f.get().job.guardG03!.proposals[0].advice!.explanation =
    "<script>alert('x')</script>";
  const r = await f.service.createReport(f.authority, f.job.id, {
    revision: f.get().revision,
  });
  const output = await f.service.exportReport(f.authority, f.job.id, {
    revision: f.get().revision,
    reportId: r.value.reportId,
    format: "html",
  });
  expect(output.body).not.toContain("<script>");
  expect(output.body).toContain("&lt;script&gt;");
  expect(output.body).toContain("guard-g03-report-v1");
  expect(f.get().job.guardG03!.audit.at(-1)!.action).toBe(
    "g03_report_downloaded",
  );
  // A valid expired report still has matching immutable body/envelope fields.
  const expired = f.get().job.guardG03!.reports[0];
  expired.expiresAt = new Date(0).toISOString();
  expired.body.expiresAt = expired.expiresAt;
  expired.id = fingerprint(expired.body);
  await expect(
    f.service.exportReport(f.authority, f.job.id, {
      revision: f.get().revision,
      reportId: expired.id,
      format: "json",
    }),
  ).rejects.toThrow("report_expired");
  expect(fingerprint(plan)).toHaveLength(64);
});
it.each(["expiresAt", "createdAt", "sourceRevision"])(
  "rejects tampered report envelope %s",
  async (field) => {
    const f = await fixture();
    await f.service.createReport(f.authority, f.job.id, {
      revision: f.get().revision,
    });
    const report = f.get().job.guardG03!.reports[0];
    if (field === "sourceRevision") report.sourceRevision += 1;
    else if (field === "expiresAt" || field === "createdAt")
      report[field] = new Date(0).toISOString();
    await expect(f.service.state(f.authority, f.job.id)).rejects.toThrow(
      "stored_state_invalid",
    );
  },
);

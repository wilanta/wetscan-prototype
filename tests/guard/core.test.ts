import { describe, expect, it } from "vitest";
import type {
  DastScope,
  Grant,
  InvariantPlan,
  ScanJob,
  ScanRequest,
} from "../../src/features/guard/contracts";
import {
  allowDast,
  authorize,
  redact,
  safePath,
} from "../../src/features/guard/security";
import {
  createJob,
  DemoMemoryStore,
  transition,
  triage,
} from "../../src/features/guard/pipeline";
import {
  applyRetest,
  deduplicate,
  normalizeGitleaks,
  normalizeOpengrep,
  normalizeOSV,
  normalizeTrivy,
  type NormalizationContext,
} from "../../src/features/guard/evidence";
import {
  evaluate,
  report,
  reportHtml,
  type ReleasePolicy,
} from "../../src/features/guard/release";
import { runSyntheticInvariant } from "../../src/features/guard/integrity";
const scope = {
  workspaceId: "workspace-a",
  projectId: "project-a",
  mode: "demo" as const,
};
const grant: Grant = {
  ...scope,
  actorId: "reviewer",
  operations: ["read", "scan", "triage", "report"],
  expiresAt: Date.now() + 60000,
};
const request: ScanRequest = {
  ...scope,
  repository: {
    provider: "github",
    repositoryId: "fixture-only",
    branch: "main",
    commit: "a".repeat(40),
  },
  profile: "quick",
  engines: ["sast"],
  idempotencyKey: "request-a",
};
const ctx: NormalizationContext = {
  ...scope,
  commit: "a".repeat(40),
  recordedAt: "2026-11-14T00:00:00.000Z",
  artifactDigest: "1".repeat(64),
  synthetic: true,
  scannerVersion: "fixture-v1",
  rulePack: "fixture-rules",
};
const raw = {
  results: [
    {
      check_id: "test-rule",
      path: "src/handler.js",
      start: { line: 3 },
      extra: {
        severity: "ERROR",
        message: "Review dynamic evaluation",
        lines: "omitted",
      },
    },
  ],
  errors: [],
};
const policy: ReleasePolicy = {
  id: "review",
  required: ["sast"],
  blockSeverities: ["critical", "high"],
  blockPotential: false,
};
async function completed(): Promise<ScanJob> {
  let job = await createJob(grant, request);
  for (const state of [
    "preparing",
    "running",
    "normalizing",
    "completed",
  ] as const)
    job = transition(job, state, grant.actorId);
  return {
    ...job,
    findings: await normalizeOpengrep(raw, ctx),
    runs: job.runs.map((r) =>
      r.engine === "sast"
        ? { ...r, status: "completed", scanner: "fixture", version: "v1" }
        : r,
    ),
  };
}
describe("Guard authorization and repository safety", () => {
  it.each(["workspaceId", "projectId", "mode"] as const)(
    "rejects mismatched %s",
    (key) =>
      expect(() =>
        authorize(
          grant,
          { ...scope, [key]: key === "mode" ? "live" : "other" },
          "read",
        ),
      ).toThrow("authorization"),
  );
  it("rejects expired and insufficient grants", () => {
    expect(() =>
      authorize({ ...grant, expiresAt: 0 }, scope, "read"),
    ).toThrow();
    expect(() =>
      authorize({ ...grant, operations: ["read"] }, scope, "scan"),
    ).toThrow();
  });
  it.each([
    "../outside",
    "/etc/passwd",
    "C:\\outside",
    "src/../../a",
    "src/%2e%2e/a",
    "src/a\u0000.js",
    ".env",
    "config/.env.local",
    "private.pem",
    "id_rsa",
    ".git/config",
    "node_modules/test.js",
    "src/CON.js",
    "src/dir./a",
  ])("rejects excluded path %s", (path) =>
    expect(() => safePath(path)).toThrow(),
  );
  it("normalizes permitted relative paths", () =>
    expect(safePath("src\\api\\handler.ts")).toBe("src/api/handler.ts"));
  it("does not retain common credential formats or private blocks", () => {
    const value = redact(
      "authorization: Bearer synthetic-only\npassword=synthetic-only\nghp_" +
        "x".repeat(40) +
        "\n-----BEGIN RSA PRIVATE KEY-----\nsynthetic-only\n-----END RSA PRIVATE KEY-----",
    );
    expect(value).not.toContain("synthetic-only");
    expect(value).not.toContain("ghp_");
    expect(value).not.toContain("BEGIN RSA");
  });
  it("isolates and clones demo storage; refuses live persistence", async () => {
    const store = new DemoMemoryStore(),
      job = await createJob(grant, request);
    await store.create(grant, job);
    const duplicate = await store.create(grant, job);
    expect(duplicate.id).toBe(job.id);
    duplicate.status = "failed";
    expect((await store.get(grant, scope, job.id))?.status).toBe("queued");
    await expect(
      store.get(
        { ...grant, workspaceId: "other" },
        { ...scope, workspaceId: "other" },
        job.id,
      ),
    ).rejects.toThrow("authorization");
    await expect(
      store.create({ ...grant, mode: "live" }, { ...job, mode: "live" }),
    ).rejects.toThrow("Durable");
  });
  it("rejects altered idempotency input and source providers", async () => {
    const store = new DemoMemoryStore(),
      job = await createJob(grant, request);
    await store.create(grant, job);
    await expect(
      store.create(grant, {
        ...job,
        repository: { ...job.repository, commit: "b".repeat(40) },
      }),
    ).rejects.toThrow("Idempotency");
    await expect(
      createJob(grant, {
        ...request,
        repository: { ...request.repository, commit: "HEAD" },
      }),
    ).rejects.toThrow();
  });
});
describe("Guard normalization and evidence", () => {
  it("keeps identity stable across commits while versioning evidence", async () => {
    const [a] = await normalizeOpengrep(raw, ctx),
      [b] = await normalizeOpengrep(raw, {
        ...ctx,
        commit: "b".repeat(40),
        artifactDigest: "2".repeat(64),
      });
    expect(a.id).toBe(b.id);
    expect(a.evidence[0].id).not.toBe(b.evidence[0].id);
    expect(deduplicate([a, b, a])[0].evidence).toHaveLength(2);
    expect(deduplicate([a, { ...a, severity: "low" }])).toHaveLength(2);
    expect(
      deduplicate([a, { ...a, source: { ...a.source, scanner: "other" } }]),
    ).toHaveLength(2);
  });
  it("separates project/mode identities and rejects scanner error coverage", async () => {
    const [a] = await normalizeOpengrep(raw, ctx),
      [b] = await normalizeOpengrep(raw, { ...ctx, mode: "live" });
    expect(a.id).not.toBe(b.id);
    await expect(
      normalizeOpengrep(
        { results: [], errors: [{ message: "parse failed" }] },
        ctx,
      ),
    ).rejects.toThrow("incomplete");
    await expect(
      normalizeOpengrep(
        { results: [{ ...raw.results[0], path: "../escape" }] },
        ctx,
      ),
    ).rejects.toThrow();
    await expect(normalizeOpengrep({ results: "bad" }, ctx)).rejects.toThrow();
  });
  it("drops Gitleaks raw values before findings", async () => {
    const value = "synthetic-sensitive-match";
    const result = await normalizeGitleaks(
      [
        {
          RuleID: "fixture-rule",
          File: "src/config.js",
          StartLine: 2,
          Secret: value,
          Match: value,
          Description: value,
        },
      ],
      ctx,
    );
    expect(JSON.stringify(result)).not.toContain(value);
    expect(result[0].source.scanner).toBe("gitleaks");
  });
  it("normalizes advisory and IaC fixture formats without claiming exploitation", async () => {
    const osv = await normalizeOSV(
      {
        results: [
          {
            source: { path: "package-lock.json" },
            packages: [
              {
                package: { name: "synthetic-package", version: "0.0.1" },
                vulnerabilities: [{ id: "SYNTHETIC-ADVISORY" }],
              },
            ],
          },
        ],
      },
      ctx,
    );
    expect(osv[0].location.installedVersion).toBe("0.0.1");
    expect(osv[0].status).toBe("potential");
    const iac = await normalizeTrivy(
      {
        Results: [
          {
            Target: "infra/main.tf",
            Misconfigurations: [{ ID: "SYNTHETIC-IAC", Severity: "HIGH" }],
          },
        ],
      },
      ctx,
      "iac",
    );
    expect(iac[0].source.engine).toBe("iac");
  });
  it("requires audited triage reasons", async () => {
    const [f] = await normalizeOpengrep(raw, ctx);
    expect(() => triage(grant, f, "false_positive", "")).toThrow("meaningful");
    const reviewed = triage(
      grant,
      f,
      "risk_accepted",
      "Accepted for controlled fixture review",
    );
    expect(reviewed.audit.actorId).toBe("reviewer");
    expect(reviewed.finding.status).toBe("risk_accepted");
  });
  it("does not promote empty or generic retests to verified fixed", async () => {
    const [f] = await normalizeOpengrep(raw, ctx);
    const result = {
      findingId: f.id,
      beforeCommit: ctx.commit,
      afterCommit: "b".repeat(40),
      engineCompleted: true,
      targeted: false,
      outcome: "not_detected" as const,
    };
    expect(applyRetest(f, result).status).toBe("potential");
    expect(() =>
      applyRetest(f, { ...result, outcome: "verified_fixed" }),
    ).toThrow("evidence");
    const verified = applyRetest(f, {
      ...result,
      targeted: true,
      outcome: "verified_fixed",
      expected: "403",
      observed: "403",
      evidence: { ...f.evidence[0], id: "after", commit: result.afterCommit },
    });
    expect(verified.status).toBe("verified_fixed");
    expect(verified.evidence).toHaveLength(2);
  });
});
describe("job lifecycle, policy and reports", () => {
  it("rejects skipped lifecycle steps and terminal mutation", async () => {
    const job = await createJob(grant, request);
    expect(() => transition(job, "completed", "reviewer")).toThrow();
    const cancelled = transition(job, "cancelled", "reviewer");
    expect(cancelled.finishedAt).toBeTruthy();
    expect(() => transition(cancelled, "running", "reviewer")).toThrow();
  });
  it("never passes missing required coverage", async () => {
    const job = await completed();
    expect(
      evaluate(job, { ...policy, required: ["sast", "sca"] }).decision,
    ).toBe("INCOMPLETE");
    expect(evaluate(job, policy).decision).toBe("WARN");
    expect(evaluate(job, { ...policy, blockPotential: true }).decision).toBe(
      "BLOCK",
    );
    expect(evaluate({ ...job, findings: [] }, policy).decision).toBe("PASS");
    expect(evaluate(job, policy).enforced).toBe(false);
  });
  it("exports scoped redacted evidence and escapes untrusted HTML", async () => {
    const job = await completed();
    job.findings[0].title = '<script>alert("x")</script>';
    job.audit[0].reason = "token=synthetic-hidden";
    const result = report(grant, job, policy),
      html = reportHtml(result);
    expect(JSON.stringify(result)).not.toContain("synthetic-hidden");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(result.limitations).toContain(
      "No CI/deployment enforcement is connected.",
    );
    expect(() =>
      report({ ...grant, projectId: "other" }, job, policy),
    ).toThrow();
  });
});
describe("DAST fail-closed and Integrity execution", () => {
  const staging: DastScope = {
    environment: "staging",
    origin: "https://staging.example.com",
    paths: ["/api/test"],
    methods: ["GET"],
    consentActor: "reviewer",
    proofId: "owned",
    expiresAt: Date.now() + 60000,
    requestsPerSecond: 1,
    concurrency: 1,
    timeoutMs: 10000,
    syntheticAccounts: true,
  };
  it("does not enable DAST through a URL validator alone", async () => {
    await expect(
      allowDast(staging, { ready: true, validate: async () => true }),
    ).rejects.toThrow("disabled");
    await expect(
      allowDast(staging, { ready: false, validate: async () => true }, true),
    ).rejects.toThrow("disabled");
    await expect(
      allowDast(staging, { ready: true, validate: async () => false }, true),
    ).rejects.toThrow("egress");
  });
  it.each([
    "http://staging.example.com",
    "https://127.0.0.1",
    "https://169.254.169.254",
    "https://localhost",
    "https://[::1]",
    "https://staging.internal",
    "https://user:pass@example.com",
  ])("denies unsafe origin %s", async (origin) =>
    expect(
      allowDast(
        { ...staging, origin },
        { ready: true, validate: async () => true },
        true,
      ),
    ).rejects.toThrow(),
  );
  it("requires enforcing egress for approved staging", async () =>
    expect(
      allowDast(staging, { ready: true, validate: async () => true }, true),
    ).resolves.toBeUndefined());
  it.each([
    "ownership",
    "workflow_bypass",
    "state_transition",
    "replay",
    "unauthorized_modification",
  ] as const)("executes vulnerable and patched %s fixture", (kind) => {
    const plan: InvariantPlan = {
      ...scope,
      id: kind,
      kind,
      description: "Controlled synthetic invariant",
      confirmedBy: "reviewer",
      expectedStatus:
        kind === "ownership" || kind === "unauthorized_modification"
          ? 403
          : 409,
      synthetic: true,
    };
    expect(runSyntheticInvariant(plan, false).status).toBe("failed");
    expect(runSyntheticInvariant(plan, true).status).toBe("passed");
    expect(() =>
      runSyntheticInvariant({ ...plan, mode: "live" }, true),
    ).toThrow();
    expect(() =>
      runSyntheticInvariant({ ...plan, confirmedBy: "" }, true),
    ).toThrow();
  });
});

it("removes terminal escape sequences and rejects a vacuous release policy", async () => {
  expect(redact("\u001b[31mreview\u001b[0m")).toBe("review");
  expect(
    evaluate(await completed(), { ...policy, required: [] }).decision,
  ).toBe("INCOMPLETE");
});
it("accepts OSV empty vulnerabilities as missing matches, not malformed output", async () => {
  expect(
    await normalizeOSV(
      {
        results: [
          {
            source: { path: "package-lock.json" },
            packages: [
              {
                package: { name: "fixture", version: "1.0.0" },
                vulnerabilities: null,
              },
            ],
          },
        ],
      },
      ctx,
    ),
  ).toEqual([]);
});

it("live advisory with unknown severity cannot become a policy PASS", async () => {
  const job = await completed();
  job.mode = "live";
  job.sourceCoverage = {
    status: "complete",
    retrievedFiles: 1,
    excludedFiles: 0,
    treeTruncated: false,
  };
  job.findings[0].severityKnown = false;
  job.findings[0].status = "potential";
  expect(evaluate(job, policy).decision).toBe("INCOMPLETE");
});

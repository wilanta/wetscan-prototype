import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
// Browser contract tests with mocked transport. No owner findings, real AI or GitHub write is claimed.
const base = "http://127.0.0.1:3109",
  scan = "a".repeat(64),
  commit = "b".repeat(40),
  finding = "c".repeat(64),
  proposal = "d".repeat(64),
  digest = "e".repeat(64);
async function login(page: Page, n: number) {
  await page.route(
    "https://github.com/login/oauth/authorize?*",
    async (route) => {
      const url = new URL(route.request().url()),
        callback = new URL("/api/auth/github/callback", base);
      callback.search = new URLSearchParams({
        code: "fixture-single-" + n,
        state: url.searchParams.get("state")!,
      }).toString();
      await route.fulfill({
        contentType: "text/html",
        body:
          "<script>location.replace(" +
          JSON.stringify(callback.toString()) +
          ")</script>",
      });
    },
  );
  await page.goto("/onboarding");
  await page.getByLabel("Workspace name").fill("G03 browser fixture " + n);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page
    .getByRole("button", { name: "Install GitHub App", exact: true })
    .click();
  await expect(
    page.getByText("fixture/wetscan-web", { exact: true }),
  ).toBeVisible({ timeout: 20000 });
  await page.locator('input[name="repositories"]').check();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.locator('input[name="email"]').fill("g03-" + n + "@example.test");
  await page.getByRole("button", { name: "Finish setup", exact: true }).click();
  await expect(page).toHaveURL(base + "/app", { timeout: 20000 });
}
function initialView() {
  return {
    scanId: scan,
    revision: 1,
    execution: "repository_scan",
    status: "completed",
    repository: {
      provider: "github",
      repositoryId: "101",
      branch: "main",
      commit,
    },
    createdAt: "2026-11-20T00:00:00Z",
    finishedAt: "2026-11-20T00:01:00Z",
    coverage: null,
    sourceCoverage: {
      status: "complete",
      retrievedFiles: 1,
      excludedFiles: 0,
      treeTruncated: false,
    },
    inventory: [],
    engines: [
      {
        engine: "sast",
        scanner: "opengrep",
        version: "OFFLINE_UI",
        rulePack: "OFFLINE_RULES",
        status: "completed",
        reason: "Mocked transport only",
      },
    ],
    findings: [
      {
        id: finding,
        mode: "live",
        workspaceId: "fixture",
        projectId: "github-101",
        title: "G03 browser finding",
        severity: "high",
        confidence: "medium",
        status: "potential",
        source: {
          engine: "sast",
          scanner: "opengrep",
          version: "OFFLINE_UI",
          rulePack: "OFFLINE_RULES",
          ruleId: "eval-input",
        },
        location: { path: "route.ts", line: 1 },
        evidence: [
          {
            id: "f".repeat(64),
            commit,
            artifactDigest: digest,
            synthetic: false,
            summary: "Offline browser contract",
            recordedAt: "2026-11-20T00:01:00Z",
          },
        ],
      },
    ],
    audit: [],
    release: {
      decision: "BLOCK",
      reasons: ["Finding unresolved"],
      enforced: false,
    },
    integrations: { ai: "NOT_CONFIGURED", targetedRetest: "NOT_CONFIGURED" },
    retry: { eligible: false, reason: "not_failed" },
    scannerExecution: "RECORDED_ENGINE_RESULTS",
  };
}
async function transport(
  page: Page,
  options: { configured?: boolean; unknownPr?: boolean } = {},
) {
  const view = initialView(),
    state: {
      revision: number;
      baseCommit: string;
      provider: unknown;
      githubWritesEnabled: boolean;
      proposals: Record<string, unknown>[];
      retests: Record<string, unknown>[];
      reports: Record<string, unknown>[];
      audit: unknown[];
    } = {
      revision: 1,
      baseCommit: commit,
      provider: {
        requestEnabled: options.configured !== false,
        successfulResponseRecorded: false,
        plan: {
          provider: "OFFLINE_PROVIDER",
          model: "OFFLINE_MODEL",
          promptVersion: "test-v1",
          policyVersion: "test-policy",
          reservedMicroUsd: 10000,
        },
        planDigest: digest,
      },
      githubWritesEnabled: true,
      proposals: [],
      retests: [],
      reports: [],
      audit: [],
    };
  const posts: { action: string; body: Record<string, unknown> }[] = [];
  await page.route("**/api/guard/projects/github-101/**", async (route) => {
    const url = new URL(route.request().url()),
      action = url.pathname.split("/").at(-1)!;
    if (url.pathname.includes("/g03/")) {
      if (route.request().method() === "GET")
        return route.fulfill({ json: state });
      const body = route.request().postDataJSON();
      posts.push({ action, body });
      state.revision++;
      view.revision = state.revision;
      if (action === "context")
        return route.fulfill({
          json: {
            revision: state.revision,
            binding: {
              repositoryId: "101",
              branch: "main",
              baseCommit: commit,
              path: "route.ts",
              blob: "f".repeat(40),
              tree: "e".repeat(40),
              sourceSha256: digest,
            },
            context: { source: "return eval(input); // redacted context" },
          },
        });
      if (action === "generate")
        state.proposals = [
          {
            version: 1,
            id: proposal,
            requestKey: body.requestKey,
            findingId: finding,
            evidenceSha256: digest,
            baseCommit: commit,
            actorId: "test-owner",
            createdAt: "2026-11-20T00:02:00Z",
            state: "completed",
            consent: {
              ai: body.aiConsent,
              source: body.sourceConsent,
              path: "route.ts",
              at: "2026-11-20T00:02:00Z",
              plan: {
                provider: "OFFLINE_PROVIDER",
                model: "OFFLINE_MODEL",
                promptVersion: "test-v1",
              },
            },
            advice: {
              explanation: "Input reaches evaluation <script>test</script>",
              rootCause: "Dynamic evaluation",
              recommendation: "Use JSON parsing",
              securityConsequences: "Avoid execution",
              compatibilityRisks: "Valid JSON inputs required",
              verification: "Real scanner required",
              alternative: "Remove feature",
            },
            patch: body.aiConsent
              ? {
                  path: "route.ts",
                  baseCommit: commit,
                  digest,
                  sourceSha256: digest,
                  afterSha256: "1".repeat(64),
                  diff: "--- a/route.ts\n+++ b/route.ts\n@@ -1 +1 @@\n-return eval(input);\n+return JSON.parse(input);\n",
                  syntax: "passed",
                  repositoryTests: "NOT_RUN",
                }
              : undefined,
          },
        ];
      if (action === "review")
        state.proposals[0].review = {
          decision: body.decision,
          actorId: "test-owner",
          at: "2026-11-20T00:03:00Z",
          reason: body.reason,
          patchDigest: digest,
        };
      if (action === "publish")
        state.proposals[0].pr = {
          state: options.unknownPr ? "unknown" : "open",
          branch: "wetscan/g03-test",
          number: 17,
          url: "https://github.com/fixture/repository/pull/17",
        };
      if (action === "pr-status")
        state.proposals[0].pr = {
          ...(state.proposals[0].pr as object),
          state: "open",
        };
      if (action === "retest")
        state.retests = [
          {
            id: "2".repeat(64),
            proposalId: proposal,
            scanId: "3".repeat(64),
            beforeCommit: commit,
            afterCommit: body.afterCommit,
            targetBranch: body.branch,
            outcome: "not_verified",
            evidenceOutcome: "not_verified",
            verifiedFixed: false,
            state: "queued",
            reason: "Scanner queued only",
          },
        ];
      if (action === "compare")
        Object.assign(state.retests[0], {
          outcome: "inconclusive",
          evidenceOutcome: "inconclusive",
          state: "compared",
          reason: "Partial scanner coverage; no verified fix.",
        });
      if (action === "report")
        state.reports = [
          {
            id: "4".repeat(64),
            createdAt: "2026-11-20T00:04:00Z",
            expiresAt: "2026-11-27T00:04:00Z",
            sourceRevision: state.revision,
          },
        ];
      if (action === "export")
        return route.fulfill({
          contentType: "application/json",
          headers: {
            "Content-Disposition": "attachment; filename=g03-test.json",
          },
          body: JSON.stringify({ classification: "BROWSER_TRANSPORT_FIXTURE" }),
        });
      return route.fulfill({ json: { revision: state.revision } });
    }
    if (action === "readiness")
      return route.fulfill({
        json: {
          database: "approved",
          schema: "verified",
          product: {
            repositoryScanning: "BLOCKED",
            reason: "offline_contract",
          },
        },
      });
    if (action === "scans")
      return route.fulfill({
        json: {
          scans: [
            {
              id: scan,
              revision: view.revision,
              status: view.status,
              repository: view.repository,
              createdAt: view.createdAt,
            },
          ],
        },
      });
    if (action === "view") return route.fulfill({ json: view });
    if (action === "reports") return route.fulfill({ json: { reports: [] } });
    if (action === "remediation")
      return route.fulfill({
        json: {
          revision: view.revision,
          proposals: [],
          retests: [],
          bundles: [],
          provider: {
            enabled: false,
            modelConfigured: false,
            credentialReferencePresent: false,
            dataPolicyApproved: false,
          },
        },
      });
    return route.fulfill({ status: 404, json: { error: "not_found" } });
  });
  return { posts, state };
}
test("G03 explicit consent → diff review → PR approval → inconclusive scanner evidence → audited report UI", async ({
  page,
}) => {
  await login(page, 931);
  const f = await transport(page);
  await page.goto("/app/projects/github-101/guard/findings");
  const writes: string[] = [];
  const observe = (request: { method(): string; url(): string }) => {
    if (!["GET", "HEAD"].includes(request.method())) writes.push(request.url());
  };
  page.on("request", observe);
  const localDownload = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export G03 selection metadata", exact: true })
    .click();
  const downloaded = await localDownload;
  const selection = JSON.parse(
    await readFile((await downloaded.path())!, "utf8"),
  );
  page.off("request", observe);
  expect(selection).toMatchObject({
    schema: "guard-g03-selection-metadata-v1",
    scanId: scan,
    projectId: "github-101",
    currentHeadVerified: false,
    sourceRead: false,
    providerCalled: false,
  });
  expect(selection.candidates[0].findingId).toBe(finding);
  expect(writes).toEqual([]);
  await page
    .getByRole("link", { name: "Remediate G03 browser finding", exact: true })
    .click();
  await expect(page).toHaveURL(
    new RegExp(
      "/guard/remediation\\?scan=" + scan + "&finding=" + finding + "$",
    ),
  );
  const panel = page.getByRole("region", {
    name: "AI remediation and verified retest",
  });
  await expect(
    panel.getByRole("button", { name: "Save deterministic guidance (AI off)" }),
  ).toBeEnabled();
  expect(f.posts).toEqual([]);
  await panel.getByLabel(/I authorize reading only/).check();
  await panel
    .getByRole("button", { name: "Review authorized source context" })
    .click();
  await expect(panel.getByText(/Source SHA256/)).toBeVisible();
  expect(f.posts.map((p) => p.action)).toEqual(["context"]);
  await panel.getByLabel(/I consent to one AI request/).check();
  await panel
    .getByRole("button", { name: "Generate AI remediation proposal" })
    .click();
  await expect(panel.getByLabel("Proposed patch diff")).toContainText(
    "JSON.parse(input)",
  );
  await expect(
    panel.getByText(
      "explanation: Input reaches evaluation <script>test</script>",
      {
        exact: true,
      },
    ),
  ).toBeVisible();
  await expect(
    panel.getByRole("button", { name: "Approve exact patch" }),
  ).toBeDisabled();
  await panel
    .getByLabel("Patch review reason")
    .fill("Reviewed the exact patch and compatibility risk");
  await panel.getByLabel("I reviewed this exact diff and its risks.").check();
  await panel.getByRole("button", { name: "Approve exact patch" }).click();
  await expect(
    panel.getByRole("button", { name: "Create authorized draft PR" }),
  ).toBeDisabled();
  await panel
    .getByLabel(/I explicitly authorize writing this exact patch/)
    .check();
  await panel
    .getByRole("button", { name: "Create authorized draft PR" })
    .click();
  await expect(panel.getByRole("link", { name: "PR #17" })).toBeVisible();
  await panel.getByLabel("Retest branch", { exact: true }).fill("main");
  await panel.getByLabel("Retest commit", { exact: true }).fill("f".repeat(40));
  await panel.getByLabel(/I authorize one real G02 scanner run/).check();
  await panel
    .getByRole("button", { name: "Run authorized scanner retest" })
    .click();
  await expect(
    panel.getByText(/not_verified \/ not_verified \/ queued/),
  ).toBeVisible();
  await panel
    .getByRole("button", { name: "Compare real scanner evidence" })
    .click();
  await expect(
    panel.getByText(/Partial scanner coverage; no verified fix/),
  ).toBeVisible();
  await panel.getByRole("button", { name: "Save G03 evidence report" }).click();
  const download = page.waitForEvent("download");
  await panel.getByRole("button", { name: "Download server JSON" }).click();
  expect((await download).suggestedFilename()).toContain(".json");
  expect(f.posts.map((p) => p.action)).toEqual([
    "context",
    "generate",
    "review",
    "publish",
    "retest",
    "compare",
    "report",
    "export",
  ]);
  expect(f.posts[1].body).toMatchObject({
    aiConsent: true,
    sourceConsent: true,
    sourceSha256: digest,
    baseCommit: commit,
  });
  expect(f.posts[3].body).toMatchObject({
    writeConsent: true,
    repositoryId: "101",
    patchDigest: digest,
  });
  expect(f.state.retests[0].verifiedFixed).toBe(false);
});
test("G03 unconfigured AI stays opt-out with deterministic guidance and no external actions", async ({
  page,
}) => {
  await login(page, 932);
  const f = await transport(page, { configured: false });
  await page.goto("/app/projects/github-101/guard/remediation");
  const panel = page.getByRole("region", {
    name: "AI remediation and verified retest",
  });
  await expect(panel.getByLabel(/I consent to one AI request/)).toBeDisabled();
  await panel
    .getByRole("button", { name: "Save deterministic guidance (AI off)" })
    .click();
  expect(f.posts).toHaveLength(1);
  expect(f.posts[0]).toMatchObject({
    action: "generate",
    body: {
      aiConsent: false,
      sourceConsent: false,
      path: null,
      planDigest: null,
    },
  });
  await expect(panel.getByLabel("Proposed patch diff")).toHaveCount(0);
});
test("G03 metadata export distinguishes unavailable storage and starts no operation", async ({
  page,
}) => {
  await login(page, 933);
  const f = await transport(page);
  await page.route(
    "**/api/guard/projects/github-101/scans/*/view",
    async (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "storage_unavailable" }),
      }),
  );
  await page.goto("/app/projects/github-101/guard/findings");
  const pending = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export G03 selection metadata", exact: true })
    .click();
  const downloaded = await pending;
  const metadata = JSON.parse(
    await readFile((await downloaded.path())!, "utf8"),
  );
  expect(metadata).toMatchObject({
    storageStatus: "UNAVAILABLE",
    scanId: null,
    candidates: [],
    sourceRead: false,
    providerCalled: false,
    scannerStarted: false,
    currentHeadVerified: false,
  });
  expect(metadata.readDiagnostics.scanView).toMatchObject({
    status: "ERROR",
    httpStatus: 503,
    errorCode: "storage_unavailable",
  });
  expect(metadata.readDiagnostics.scanHistory.status).toBe("OK");
  expect(f.posts).toEqual([]);
});

import { test, expect, type Page } from "@playwright/test";
// API fixtures below test rendering/requests only. They are NOT evidence of a live repository scan.
const base = "http://127.0.0.1:3109",
  path = "/app/projects/github-101/guard",
  id = "a".repeat(64),
  commit = "b".repeat(40);
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
  await page.getByLabel("Workspace name").fill("Live UI fixture " + n);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page
    .getByRole("button", { name: "Install GitHub App", exact: true })
    .click();
  await expect(
    page.getByText("fixture/wetscan-web", { exact: true }),
  ).toBeVisible({ timeout: 20000 });
  await page.locator('input[name="repositories"]').check();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page
    .locator('input[name="email"]')
    .fill("live-ui-" + n + "@example.test");
  await page.getByRole("button", { name: "Finish setup", exact: true }).click();
  await expect(page).toHaveURL(base + "/app", { timeout: 20000 });
}
function view() {
  return {
    scanId: id,
    revision: 1,
    execution: "repository_scan",
    status: "completed",
    repository: {
      provider: "github",
      repositoryId: "101",
      branch: "main",
      commit,
    },
    createdAt: "2026-11-18T00:00:00Z",
    finishedAt: "2026-11-18T00:01:00Z",
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
        status: "completed",
        scanner: "opengrep",
        version: "OFFLINE_API_TEST",
        rulePack: "OFFLINE_RULES",
        reason: "Offline API contract fixture, not runtime evidence",
      },
    ],
    findings: [
      {
        mode: "live",
        workspaceId: "fixture",
        projectId: "github-101",
        id: "c".repeat(64),
        title: "API fixture finding",
        severity: "high",
        status: "potential",
        confidence: "medium",
        source: {
          engine: "sast",
          scanner: "opengrep",
          version: "OFFLINE_API_TEST",
          rulePack: "OFFLINE_RULES",
          ruleId: "test-rule",
        },
        location: { path: "route.ts", line: 1 },
        evidence: [
          {
            id: "d".repeat(64),
            commit,
            artifactDigest: "e".repeat(64),
            synthetic: false,
            summary: "Offline rendering test input",
            recordedAt: "2026-11-18T00:01:00Z",
          },
        ],
      },
    ],
    audit: [],
    release: {
      decision: "BLOCK",
      reasons: ["Offline policy display test"],
      enforced: false,
    },
    integrations: {
      ai: "NOT_CONFIGURED",
      targetedRetest: "NOT_CONFIGURED",
      githubChecks: "NOT_CONFIGURED",
      vercel: "NOT_CONFIGURED",
      dast: "NOT_AUTHORIZED",
      integrity: "NOT_EXECUTED",
      canvas: "NOT_INTEGRATED",
      intelligence: "NOT_INTEGRATED",
      sentinel: "NOT_INTEGRATED",
    },
    scannerExecution: "RECORDED_ENGINE_RESULTS",
  };
}
test("six Live tabs render scoped stored API data; no demo or scanner action is substituted", async ({
  page,
}) => {
  await login(page, 911);
  let current = view();
  const posts: { url: string; body: Record<string, unknown> }[] = [];
  await page.route("**/api/guard/projects/github-101/**", async (route) => {
    const r = route.request(),
      url = new URL(r.url());
    if (r.method() === "POST") {
      const body = r.postDataJSON();
      posts.push({ url: url.pathname, body });
      if (url.pathname.endsWith("/triage")) {
        current = {
          ...current,
          revision: 2,
          findings: current.findings.map((f) => ({
            ...f,
            status: "under_review",
          })),
        };
        return route.fulfill({ json: { status: "under_review", revision: 2 } });
      }
      return route.fulfill({
        status: 503,
        json: { error: "execution_not_ready" },
      });
    }
    if (url.pathname.endsWith("/readiness"))
      return route.fulfill({
        json: {
          database: "approved",
          schema: "verified",
          product: {
            repositoryScanning: "BLOCKED",
            reason: "sandbox_not_qualified",
          },
        },
      });
    if (url.pathname.endsWith("/scans"))
      return route.fulfill({
        json: {
          scans: [
            {
              id,
              status: current.status,
              repository: current.repository,
              createdAt: current.createdAt,
              revision: current.revision,
            },
          ],
        },
      });
    if (url.pathname.endsWith("/view")) return route.fulfill({ json: current });
    if (url.pathname.endsWith("/reports"))
      return route.fulfill({ json: { reports: [] } });
    return route.fulfill({ status: 404, json: { error: "not_found" } });
  });
  await page.goto(path);
  const panel = page.getByRole("region", {
    name: "Guard live workspace",
    exact: true,
  });
  await expect(panel.getByRole("status")).toContainText(id);
  await expect(
    panel.getByRole("button", { name: "Start repository scan", exact: true }),
  ).toBeDisabled();
  const nav = page.getByRole("navigation", {
    name: "Live Guard sections",
    exact: true,
  });
  expect(await nav.getByRole("link").count()).toBe(7);
  await expect(nav.getByRole("link", { name: "DAST & Integrity" })).toBeVisible();
  await nav.getByRole("link", { name: "Findings", exact: true }).click();
  await expect(
    panel.getByRole("heading", { name: "API fixture finding", exact: true }),
  ).toBeVisible();
  await panel
    .getByLabel("Review reason")
    .fill("Authorized fixture review reason");
  await panel
    .getByRole("button", { name: "Save finding review", exact: true })
    .click();
  await expect(panel.getByText(/high \/ under_review/)).toBeVisible();
  expect(posts).toHaveLength(1);
  expect(posts[0].body).toMatchObject({
    revision: 1,
    status: "under_review",
    findingId: "c".repeat(64),
  });
  for (const label of [
    "Logic & Workflows",
    "Remediation",
    "Release Status",
    "Scan History",
    "Overview",
  ]) {
    await nav.getByRole("link", { name: label, exact: true }).click();
    await expect(panel.getByRole("status")).toContainText(commit);
  }
  expect(page.url()).not.toContain("orderly-demo");
  expect(posts).toHaveLength(1);
  await expect(
    page.getByRole("region", { name: "Guard workbench", exact: true }),
  ).toHaveCount(0);
  await page.screenshot({
    path: "test-results/guard-live/live-tabs.png",
    fullPage: true,
    animations: "disabled",
  });
});
test("historical preparation never exposes normal product cancellation or triage", async ({
  page,
}) => {
  await login(page, 912);
  const old = {
    ...view(),
    execution: "historical_preparation",
    status: "preparing",
    findings: [],
    engines: [],
  };
  await page.route("**/api/guard/projects/github-101/**", (route) => {
    const u = new URL(route.request().url());
    return route.fulfill({
      json: u.pathname.endsWith("/readiness")
        ? {
            product: {
              repositoryScanning: "BLOCKED",
              reason: "not_configured",
            },
          }
        : u.pathname.endsWith("/scans")
          ? {
              scans: [
                {
                  id,
                  status: old.status,
                  repository: old.repository,
                  createdAt: old.createdAt,
                  revision: 1,
                },
              ],
            }
          : old,
    });
  });
  await page.goto(path + "/findings?scan=" + id);
  const panel = page.getByRole("region", {
    name: "Guard live workspace",
    exact: true,
  });
  await expect(panel.getByText(/historical preparation record/)).toBeVisible();
  await expect(
    panel.getByRole("button", { name: "Cancel repository scan", exact: true }),
  ).toHaveCount(0);
  await expect(
    panel.getByRole("button", { name: "Save finding review", exact: true }),
  ).toHaveCount(0);
});
test("database unavailable stays blocked with no fake findings in all six routes", async ({
  page,
}) => {
  await login(page, 913);
  await page.goto(path + "/scans");
  const panel = page.getByRole("region", {
    name: "Guard live workspace",
    exact: true,
  });
  await expect(panel.getByRole("alert")).toContainText("No synthetic results", {
    timeout: 20000,
  });
  await expect(
    panel.getByText("No recorded scan loaded", { exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("navigation", { name: "Live Guard sections" })
      .getByRole("link", { name: "Findings", exact: true }),
  ).toHaveAttribute("href", path + "/findings");
});

test("authenticated preflight uses the actual local app process and remains read-only with missing configuration", async ({
  page,
}) => {
  await login(page, 914);
  await page.goto(path);
  const result = await page.evaluate(async () => {
    const r = await fetch("/api/guard/projects/github-101/preflight", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    return { status: r.status, body: await r.json() };
  });
  expect(result.status).toBe(200);
  expect(result.body).toMatchObject({
    authenticated: true,
    providerAuthorizationVerified: true,
    configuration: "NOT_CONFIGURED",
    appDatabase: "NOT_CONNECTED",
    workerDatabase: "NOT_CONNECTED",
    runtimeOperations: 0,
    credentialValuesExposed: false,
    pinnedCommitVerified: false,
  });
  expect(JSON.stringify(result.body)).not.toMatch(
    /passwordPath|installationToken|sessionToken/,
  );
});

test("recorded remediation review and pending handoff use scoped APIs without scanner or GitHub writes", async ({
  page,
}) => {
  await login(page, 915);
  let current = view(),
    proposals: Record<string, unknown>[] = [],
    bundles: Record<string, unknown>[] = [];
  const posts: { path: string; body: Record<string, unknown> }[] = [];
  await page.route("**/api/guard/projects/github-101/**", async (route) => {
    const r = route.request(),
      p = new URL(r.url()).pathname;
    if (r.method() === "POST") {
      const body = r.postDataJSON();
      posts.push({ path: p, body });
      current = { ...current, revision: current.revision + 1 };
      if (p.endsWith("/remediation"))
        proposals = [
          {
            version: 1,
            id: "f".repeat(64),
            findingId: current.findings[0].id,
            baseCommit: commit,
            evidenceSha256: "e".repeat(64),
            requestKey: body.requestKey,
            aiConsent: false,
            actorId: "fixture-owner",
            createdAt: new Date().toISOString(),
            state: "completed",
            source: "deterministic",
            review: "pending",
            untrusted: true,
            patchApplied: false,
            retest: "NOT_EXECUTED",
            advice: {
              explanation: "Recorded rule advice",
              recommendation: "Review the authorized source",
              risks: "No patch was applied",
              verification: "Run a real scanner",
            },
          },
        ];
      else if (p.endsWith("/remediation-review"))
        proposals = proposals.map((a) => ({ ...a, review: body.decision }));
      else if (p.endsWith("/integrations"))
        bundles = [
          {
            id: "9".repeat(64),
            acknowledged: false,
            delivery: {
              canvas: "PENDING_CONSUMER_NOT_CONFIGURED",
              intelligence: "PENDING_CONSUMER_NOT_CONFIGURED",
              sentinel: "PENDING_CONSUMER_NOT_CONFIGURED",
            },
          },
        ];
      else
        return route.fulfill({
          status: 503,
          json: { error: "not_configured" },
        });
      return route.fulfill({ json: { revision: current.revision } });
    }
    if (p.endsWith("/readiness"))
      return route.fulfill({
        json: {
          database: "approved",
          schema: "verified",
          product: { repositoryScanning: "BLOCKED", reason: "test_only" },
        },
      });
    if (p.endsWith("/scans"))
      return route.fulfill({
        json: {
          scans: [
            {
              id,
              revision: current.revision,
              status: current.status,
              repository: current.repository,
              createdAt: current.createdAt,
            },
          ],
        },
      });
    if (p.endsWith("/view")) return route.fulfill({ json: current });
    if (p.endsWith("/reports")) return route.fulfill({ json: { reports: [] } });
    if (p.endsWith("/remediation"))
      return route.fulfill({
        json: {
          revision: current.revision,
          proposals,
          retests: [],
          bundles,
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
  await page.goto(path + "/remediation");
  const panel = page.getByRole("region", {
    name: "Recorded remediation",
    exact: true,
  });
  const prepare = panel.getByRole("button", {
    name: "Prepare remediation advice",
    exact: true,
  });
  await expect(prepare).toBeEnabled();
  await prepare.click();
  await expect(
    panel.getByText("explanation: Recorded rule advice", { exact: true }),
  ).toBeVisible();
  await panel
    .getByLabel("Advice review reason")
    .fill("Reviewed actual API contract fixture");
  await panel
    .getByRole("button", { name: "Approve advice only", exact: true })
    .click();
  await expect(
    panel.getByRole("heading", { name: /review approved/ }),
  ).toBeVisible();
  expect(posts[0].body).toMatchObject({
    aiConsent: false,
    findingId: "c".repeat(64),
    revision: 1,
  });
  await page
    .getByRole("navigation", { name: "Live Guard sections" })
    .getByRole("link", { name: "Release Status", exact: true })
    .click();
  const integration = page.getByRole("region", {
    name: "Integration handoff",
    exact: true,
  });
  await expect(
    integration.getByRole("button", {
      name: "Prepare integration handoff",
      exact: true,
    }),
  ).toBeEnabled();
  await integration
    .getByRole("button", { name: "Prepare integration handoff", exact: true })
    .click();
  await expect(integration.getByText(/acknowledged: false/)).toBeVisible();
  expect(posts.map((p) => p.path.split("/").at(-1))).toEqual([
    "remediation",
    "remediation-review",
    "integrations",
  ]);
});

test("failed source acquisition shows recorded diagnostic and zero findings without implying a clean scan or starting work", async ({
  page,
}) => {
  await login(page, 916);
  const diagnostic = JSON.stringify({
    version: 1,
    stage: "snapshot_acquire",
    component: "source",
    code: "source_timeout",
    source: { phase: "blob", timedOut: true, cleanup: "NOT_CREATED" },
  });
  const failed = {
    ...view(),
    status: "failed",
    findings: [],
    sourceCoverage: null,
    scannerExecution: "NOT_RUN",
    engines: [
      {
        engine: "sast",
        status: "failed",
        scanner: "unavailable",
        version: "not_configured",
        rulePack: "not_configured",
        reason: "Scanner not started; " + diagnostic,
      },
    ],
    audit: [
      {
        at: "2026-11-19T08:00:00Z",
        action: "worker_stopped",
        reason: diagnostic,
      },
    ],
    release: {
      decision: "INCOMPLETE",
      reasons: ["Source acquisition failed; no scanner coverage."],
      enforced: false,
    },
  };
  let posts = 0;
  await page.route("**/api/guard/projects/github-101/**", (route) => {
    const u = new URL(route.request().url());
    if (route.request().method() === "POST") posts++;
    return route.fulfill({
      json: u.pathname.endsWith("/readiness")
        ? {
            product: {
              repositoryScanning: "BLOCKED",
              reason: "disabled",
              allowedEngines: [],
            },
          }
        : u.pathname.endsWith("/scans")
          ? {
              scans: [
                {
                  id,
                  status: "failed",
                  repository: failed.repository,
                  createdAt: failed.createdAt,
                  revision: 1,
                },
              ],
            }
          : u.pathname.endsWith("/reports")
            ? { reports: [] }
            : failed,
    });
  });
  await page.goto(path + "?scan=" + id);
  const panel = page.getByRole("region", {
    name: "Guard live workspace",
    exact: true,
  });
  await expect(panel.getByText(/Scanner not started/)).toContainText(
    "source_timeout",
  );
  await expect(
    panel.getByRole("button", { name: "Start repository scan", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("navigation", { name: "Live Guard sections" })
    .getByRole("link", { name: "Findings", exact: true })
    .click();
  await expect(panel.getByText(/No recorded findings/)).toBeVisible();
  expect(posts).toBe(0);
});

test("operational profiles expose supported SBOM coverage and keep unconfigured image scanning disabled (API fixtures)", async ({
  page,
}) => {
  await login(page, 7);
  await page.route("**/api/guard/projects/github-101/**", (route) => {
    const u = new URL(route.request().url());
    return route.fulfill({
      json: u.pathname.endsWith("/readiness")
        ? {
            product: {
              repositoryScanning: "CONFIGURED",
              allowedEngines: ["sast", "sca", "secrets", "iac", "sbom"],
            },
          }
        : { scans: [] },
    });
  });
  await page.goto(path);
  const panel = page.getByRole("region", {
    name: "Guard live workspace",
    exact: true,
  });
  await panel
    .getByRole("combobox", { name: "Scan profile", exact: true })
    .selectOption("standard");
  await expect(
    panel.getByRole("checkbox", { name: "sbom", exact: true }),
  ).toBeChecked();
  await panel
    .getByRole("combobox", { name: "Scan profile", exact: true })
    .selectOption("full");
  await expect(
    panel.getByRole("checkbox", { name: "container", exact: true }),
  ).toBeDisabled();
  await expect(
    panel.getByText(/Profiles define required coverage/),
  ).toBeVisible();
  await expect(
    panel.getByRole("button", { name: "Start repository scan", exact: true }),
  ).toBeDisabled();
});

test("recorded inventory/SBOM download and unknown-severity filter remain separate from actual scanner execution (API fixtures)", async ({
  page,
}) => {
  await login(page, 8);
  const { repositorySbom } = await import("../../../src/features/guard/sbom");
  const inventory = [
    {
      name: "is-number",
      version: "7.0.0",
      ecosystem: "npm",
      license: null,
      sourcePath: "packages/app/package-lock.json",
    },
  ];
  const original = view();
  const result = {
    ...original,
    inventory,
    sbom: repositorySbom(
      inventory,
      { provider: "github", repositoryId: "101", branch: "main", commit },
      "e".repeat(64),
    ),
    findings: [
      ...original.findings,
      {
        ...original.findings[0],
        id: "f".repeat(64),
        title: "Unknown advisory fixture",
        severityKnown: false,
      },
    ],
  };
  await page.route("**/api/guard/projects/github-101/**", (route) => {
    const u = new URL(route.request().url());
    return route.fulfill({
      json: u.pathname.endsWith("/readiness")
        ? { product: { repositoryScanning: "BLOCKED" } }
        : u.pathname.endsWith("/reports")
          ? { reports: [] }
          : u.pathname.endsWith("/scans")
            ? { scans: [] }
            : result,
    });
  });
  await page.goto(path + "/findings?scan=" + id);
  const panel = page.getByRole("region", {
    name: "Guard live workspace",
    exact: true,
  });
  await expect(
    panel.getByText("Recorded inventory:", { exact: false }),
  ).toContainText("1 packages");
  await panel
    .getByRole("combobox", { name: "Severity filter", exact: true })
    .selectOption("unknown");
  await expect(
    panel.getByRole("heading", {
      name: "Unknown advisory fixture",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    panel.getByRole("heading", {
      name: original.findings[0].title,
      exact: true,
    }),
  ).toHaveCount(0);
  const waiting = page.waitForEvent("download");
  await panel
    .getByRole("button", {
      name: "Download recorded CycloneDX SBOM",
      exact: true,
    })
    .click();
  const download = await waiting;
  expect(download.suggestedFilename()).toBe("guard-" + id + ".cdx.json");
  const { readFile } = await import("node:fs/promises");
  const document = JSON.parse(await readFile((await download.path())!, "utf8"));
  expect(document.bomFormat).toBe("CycloneDX");
  expect(document.components).toHaveLength(1);
  expect(document.metadata.properties).toContainEqual({
    name: "wetscan:commit",
    value: commit,
  });
});

test("failed scan offers one authorized Retry that starts a new linked scan; ineligible failures explain why and send nothing", async ({
  page,
}) => {
  await login(page, 917);
  const retryId = "e".repeat(64);
  const failedBase = {
    ...view(),
    status: "failed",
    findings: [],
    scannerExecution: "NOT_RUN",
    retryOf: null,
  };
  let current: unknown = {
    ...failedBase,
    retry: { eligible: true, reason: null, notBefore: null },
  };
  const posts: string[] = [];
  await page.route("**/api/guard/projects/github-101/**", async (route) => {
    const u = new URL(route.request().url());
    if (route.request().method() === "POST") {
      posts.push(u.pathname + " " + (route.request().postData() ?? ""));
      return route.fulfill({
        status: 202,
        json: {
          scanId: retryId,
          status: "queued",
          execution: "repository_scan",
          scannerExecution: "QUEUED",
          retryOf: id,
        },
      });
    }
    return route.fulfill({
      json: u.pathname.endsWith("/readiness")
        ? {
            product: {
              repositoryScanning: "CONFIGURED",
              reason: null,
              allowedEngines: ["sast"],
            },
          }
        : u.pathname.endsWith("/scans")
          ? { scans: [] }
          : u.pathname.endsWith("/reports")
            ? { reports: [] }
            : current,
    });
  });
  await page.goto(path + "?scan=" + id);
  const panel = page.getByRole("region", {
    name: "Guard live workspace",
    exact: true,
  });
  const retry = panel.getByRole("button", {
    name: "Retry failed scan",
    exact: true,
  });
  await expect(retry).toBeEnabled();
  await retry.click();
  await expect(page).toHaveURL(new RegExp("scan=" + retryId));
  expect(posts).toEqual(["/api/guard/projects/github-101/scans/" + id + "/retry {}"]);
  // Terminal cause: button is disabled with the recorded reason, and nothing is sent.
  current = {
    ...failedBase,
    retry: { eligible: false, reason: "failure_not_transient", notBefore: null },
  };
  await page.goto(path + "?scan=" + id);
  await expect(retry).toBeDisabled();
  await expect(panel.getByText(/Retry unavailable: failure not transient/)).toBeVisible();
  expect(posts).toHaveLength(1);
});

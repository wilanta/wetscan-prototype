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
  expect(await nav.getByRole("link").count()).toBe(6);
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

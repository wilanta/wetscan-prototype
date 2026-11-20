import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdir } from "node:fs/promises";
import { openG04 } from "../../../../src/features/guard/g04/db";
import { g04Env } from "../pg-env";

// Real: browser, production Next server, G04 routes, PostgreSQL (the isolated G04 environment), UI.
// Doubled: the GitHub provider and Auth login (existing Guard fixture). Rows seeded for rendering are labelled FIXTURE and
// are NOT evidence of a scan. Real scan evidence is in docs/GUARD_G04_VALIDATION.md (dispatcher run), not here.
const base = "http://127.0.0.1:3109",
  project = "github-101",
  cicd = "/app/projects/" + project + "/guard/cicd",
  shots = "../../../../test-results/guard-g04/screens";
const COMMIT = "d".repeat(40);

async function login(page: Page) {
  await page.route("https://github.com/login/oauth/authorize?*", async (route) => {
    const url = new URL(route.request().url()),
      callback = new URL("/api/auth/github/callback", base);
    callback.search = new URLSearchParams({ code: "fixture-single-g04", state: url.searchParams.get("state")! }).toString();
    await route.fulfill({ contentType: "text/html", body: "<script>location.replace(" + JSON.stringify(callback.toString()) + ")</script>" });
  });
  await page.goto("/onboarding");
  await page.getByLabel("Workspace name").fill("G04 fixture " + Date.now());
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Install GitHub App", exact: true }).click();
  await expect(page.getByText("fixture/wetscan-web", { exact: true })).toBeVisible({ timeout: 20000 });
  await page.locator('input[name="repositories"]').check();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.locator('input[name="email"]').fill("g04-" + Date.now() + "@example.test");
  await page.getByRole("button", { name: "Finish setup", exact: true }).click();
  await expect(page).toHaveURL(base + "/app", { timeout: 20000 });
}
const shot = async (page: Page, name: string) => {
  await mkdir(shots, { recursive: true });
  await page.screenshot({ path: shots + "/" + name + ".png", fullPage: true });
};
const api = (page: Page, path: string, init?: { method?: string; data?: unknown }) =>
  page.evaluate(
    async ([p, i]) => {
      const r = await fetch(p as string, { method: (i as { method?: string })?.method ?? "GET", credentials: "same-origin", headers: (i as { data?: unknown })?.data ? { "Content-Type": "application/json" } : undefined, body: (i as { data?: unknown })?.data ? JSON.stringify((i as { data: unknown }).data) : undefined });
      return { status: r.status, body: await r.json().catch(() => null) };
    },
    [path, init ?? {}] as const,
  );

test.describe.configure({ mode: "serial" });
let page: Page;
test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  await login(page);
});
test.afterAll(async () => page.close());

test("tab is part of the existing Guard Live workspace; unconfigured state is explicit, never green", async () => {
  await page.goto("/app/projects/" + project + "/guard");
  await expect(page.getByRole("link", { name: "CI/CD Gate" })).toBeVisible();
  await page.getByRole("link", { name: "CI/CD Gate" }).click();
  await expect(page).toHaveURL(base + cicd);
  await expect(page.getByRole("heading", { name: /Security policy/ })).toBeVisible();
  await expect(page.getByText("not configured").first()).toBeVisible();
  await expect(page.getByText(/not a branch rule|A published check alone is not a branch rule/)).toBeVisible();
  await expect(page.getByText("No evaluations yet")).toBeVisible();
  await expect(page.getByText(/G03|Not connected/).first()).toBeVisible();
  await shot(page, "01-unconfigured");
});

test("policy: edit, save, revision recorded, audit trail and history persist", async () => {
  await page.goto(cicd);
  await page.getByLabel(/Enable automated scanning/).check();
  await page.getByLabel(/Protected branches/).fill("main, release/*");
  await page.getByLabel("Reason for this change").fill("browser acceptance");
  await page.getByRole("button", { name: "Save policy" }).click();
  await expect(page.getByRole("status")).toContainText("Policy saved");
  await expect(page.getByText("revision 1")).toBeVisible();
  await expect(page.getByRole("cell", { name: "policy_saved" }).first()).toBeVisible();
  // invalid configuration is refused by the server, nothing changes
  await page.getByLabel(/Protected branches/).fill("refs/heads/main");
  await page.getByRole("button", { name: "Save policy" }).click();
  await expect(page.getByRole("alert")).toContainText("nothing was changed");
  await page.reload();
  await expect(page.getByText("revision 1")).toBeVisible();
  const hist = await api(page, "/api/guard/projects/" + project + "/g04/policy");
  expect(hist.status).toBe(200);
  expect(hist.body.history).toHaveLength(1);
  expect(hist.body.policy.policy.protectedBranches).toEqual(["main", "release/*"]);
  await shot(page, "02-policy-saved");
});

test("GitHub integration: live re-verification shows permissions and that a published check is not a branch rule", async () => {
  await page.goto(cicd);
  await page.getByRole("button", { name: /Re-verify GitHub App access/ }).click();
  await expect(page.getByLabel("GitHub access result")).toContainText("checks:write true");
  await expect(page.getByLabel("GitHub access result")).toContainText(/NOT required|not observable/);
  await shot(page, "03-integration");
});

test("scan automation: manual scan is queued (never executed in the request) and visible with its exact commit", async () => {
  await page.goto(cicd);
  await page.getByLabel(/Exact commit/).fill(COMMIT);
  await page.getByRole("button", { name: "Queue manual scan" }).click();
  await expect(page.getByRole("status")).toContainText("Scan queued");
  const row = page.getByRole("row", { name: /manual/ }).first();
  await expect(row).toContainText("dddddddddddd");
  await expect(row).toContainText("pending");
  // idempotent HTTP behaviour and validation at the trust boundary
  expect((await api(page, "/api/guard/projects/" + project + "/g04/triggers", { method: "POST", data: { branch: "main", idempotencyKey: "short" } })).status).toBe(400);
  expect((await api(page, "/api/guard/projects/" + project + "/g04/triggers", { method: "POST", data: { branch: "scratch/x", commit: COMMIT, idempotencyKey: "abcdefgh12345" } })).status).toBe(422);
  await shot(page, "04-triggers");
});

test("gate results render decision, commit, check state and explicit non-enforcement (FIXTURE rows seeded through the store)", async () => {
  const overview = await api(page, "/api/guard/projects/" + project + "/g04/overview");
  const scope = { workspaceId: overview.body.policy.workspaceId as string, projectId: project };
  const rt = await openG04(g04Env());
  try {
    const t = (await rt.appStore.listTriggers(scope, 5))[0];
    const evaluation = { version: 1, decision: "BLOCK", reasons: [{ code: "blocking_findings", message: "FIXTURE: 2 finding(s) match the blocking policy." }], commit: COMMIT, scanId: "e".repeat(64), policyRevision: 1, policyDigest: "f".repeat(64), counts: { critical: 1, high: 1, medium: 0, low: 0, info: 0, active: 2, blocking: 2, warning: 0, unknownSeverity: 0 }, coverage: { required: ["sast"], completed: ["sast"], missing: [], partial: [], source: "complete" }, digest: "a".repeat(64) };
    const saved = await rt.appStore.saveEvaluation(scope, { triggerId: t.id, scanId: "e".repeat(64), commit: COMMIT, branch: "main", policyRevision: 1, decision: "BLOCK", evaluation, enforcement: { enforced: false, level: "CHECK_PUBLISHED_NOT_REQUIRED", notes: ["A published check is not a required branch rule; no merge enforcement was observed."] }, digest: evaluation.digest });
    await rt.appStore.planCheck(scope, { commit: COMMIT, externalId: "g04:" + COMMIT, status: "completed", conclusion: "failure", decision: "BLOCK", triggerId: t.id, evaluationId: saved.id });
  } finally {
    await rt.close();
  }
  await page.goto(cicd);
  const row = page.getByRole("row", { name: /dddddddddddd/ }).filter({ hasText: "BLOCK" });
  await expect(row).toContainText("Not enforced");
  await expect(row).toContainText("FIXTURE: 2 finding(s)");
  await expect(row).toContainText("completed / failure");
  await expect(page.getByText(/ENFORCEMENT OBSERVED/)).toHaveCount(0);
  await shot(page, "05-gate-results");
});

test("check publication retry is a visible, idempotent user action", async () => {
  await page.goto(cicd);
  const row = page.getByRole("row", { name: /dddddddddddd/ }).filter({ hasText: "BLOCK" });
  await expect(row).toContainText("pending");
  await row.getByRole("button", { name: "Retry" }).click();
  await expect(page.getByRole("status")).toContainText("Check re-publication requested");
  await expect(row).toContainText("(published)");
});

test("schedules are gated by the policy trigger and bounded", async () => {
  await page.goto(cicd);
  await expect(page.getByRole("button", { name: "Save schedule" })).toBeDisabled();
  const bad = await api(page, "/api/guard/projects/" + project + "/g04/schedules", { method: "PUT", data: { id: "every-minute", enabled: true, branch: "main", profile: "standard", cadence: { kind: "cron", expr: "* * * * *" } } });
  expect(bad.status).toBe(422);
  const policy = (await api(page, "/api/guard/projects/" + project + "/g04/policy")).body.policy;
  const saved = await api(page, "/api/guard/projects/" + project + "/g04/policy", { method: "PUT", data: { policy: { ...policy.policy, triggers: { ...policy.policy.triggers, schedule: true } }, expectedRevision: policy.revision, reason: "enable schedules" } });
  expect(saved.status).toBe(200);
  await page.reload();
  await page.getByLabel("Schedule id").fill("nightly-scan");
  await page.getByRole("button", { name: "Save schedule" }).click();
  await expect(page.getByRole("status")).toContainText("Schedule saved");
  const row = page.getByRole("row", { name: /nightly-scan/ });
  await expect(row).toContainText("every 1440 min");
  await expect(row).toContainText("true");
  await shot(page, "06-schedules");
});

test("deployments: unmapped provider and missing token are explicit; nothing is claimed as enforced", async () => {
  await page.goto(cicd);
  await expect(page.getByText("not mapped")).toBeVisible();
  await expect(page.getByText("No deployment evidence")).toBeVisible();
  await page.getByLabel(/Vercel project id/).fill("prj_fixture123");
  await page.getByRole("button", { name: "Verify and map project" }).click();
  await expect(page.getByRole("alert")).toContainText("provider_not_configured");
  await expect(page.getByRole("button", { name: "Register deployment check" })).toBeDisabled();
  // the write action refuses without the exact confirmation, even via the API
  expect((await api(page, "/api/guard/projects/" + project + "/g04/gate", { method: "POST", data: { confirm: "yes", blocks: "deployment-alias", targets: ["production"] } })).status).toBe(400);
  await shot(page, "07-deployments");
});

test("isolation and Demo Mode: other projects are 404, demo has no live CI/CD tab, no live data leaks into demo", async () => {
  for (const r of ["overview", "policy", "triggers", "checks", "deployments", "schedules", "access"]) expect((await api(page, "/api/guard/projects/github-102/g04/" + r)).status).toBe(404);
  expect((await api(page, "/api/guard/projects/github-102/g04/triggers", { method: "POST", data: { branch: "main", idempotencyKey: "abcdefgh12345" } })).status).toBe(404);
  expect((await api(page, "/api/guard/projects/orderly-demo/g04/overview")).status).toBe(404);
  expect((await api(page, "/api/guard/projects/github-101/g04/unknown")).status).toBe(404);
  await page.goto("/app/projects/orderly-demo/guard");
  await expect(page.getByRole("link", { name: "CI/CD Gate" })).toHaveCount(0);
  await expect(page.getByText("BLOCK").first().or(page.getByText("Guard").first())).toBeVisible();
  await expect(page.getByText(COMMIT.slice(0, 12))).toHaveCount(0);
  // unauthenticated access is refused
  const anon = await page.context().browser()!.newContext({ baseURL: base });
  const r = await anon.request.get("/api/guard/projects/github-101/g04/overview");
  expect(r.status()).toBe(401);
  await anon.close();
});

test("webhook endpoint is reachable unauthenticated by session but refuses unsigned requests", async () => {
  const anon = await page.context().browser()!.newContext({ baseURL: base });
  const unsigned = await anon.request.post("/api/guard/webhooks/github", { headers: { "content-type": "application/json", "x-github-event": "push", "x-github-delivery": "11111111-2222-3333-4444-555555555555" }, data: "{}" });
  expect(unsigned.status()).toBe(401);
  const bad = await anon.request.post("/api/guard/webhooks/github", { headers: { "content-type": "application/json", "x-github-event": "push", "x-github-delivery": "11111111-2222-3333-4444-555555555555", "x-hub-signature-256": "sha256=" + "0".repeat(64) }, data: "{}" });
  expect(bad.status()).toBe(401);
  await anon.close();
});

test("accessibility: no serious or critical axe violations on the CI/CD tab; usable at 400px width", async () => {
  await page.goto(cicd);
  await expect(page.getByRole("heading", { name: /Security policy/ })).toBeVisible();
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  const bad = results.violations.filter((v) => ["serious", "critical"].includes(v.impact ?? ""));
  expect(bad.map((v) => v.id + ":" + v.nodes.length)).toEqual([]);
  await page.setViewportSize({ width: 400, height: 900 });
  await page.goto(cicd);
  await expect(page.getByRole("heading", { name: /Security policy/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await shot(page, "08-mobile");
  await page.setViewportSize({ width: 1440, height: 900 });
});

test("dark theme renders the tab", async () => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto(cicd);
  await expect(page.getByRole("heading", { name: /Security policy/ })).toBeVisible();
  await shot(page, "09-dark");
  await page.emulateMedia({ colorScheme: "light" });
});

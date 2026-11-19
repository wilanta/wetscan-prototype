import { test, expect, type Page } from "@playwright/test";
const ruleId = "00000000-0000-4000-8000-000000000002",
  sourceId = "00000000-0000-4000-8000-000000000001",
  at = "2026-11-15T00:00:00.000Z";
const definition = {
  schemaVersion: 1,
  name: "HTTP errors fixture",
  description: "Normalized error responses",
  category: "http",
  severity: "low",
  confidence: 40,
  eventKinds: ["http.request"],
  conditions: [{ field: "request.statusCode", op: "gte", value: 400 }],
  correlation: "source",
  windowSeconds: 300,
  threshold: 5,
  cooldownSeconds: 300,
  suppressionWindows: [],
};
const fixtureRule = {
  schemaVersion: 1,
  mode: "live",
  workspaceId: "github-user-7:fixture",
  projectId: "github-123",
  ruleId,
  revision: 1,
  version: 1,
  status: "DRAFT",
  definition,
  enabledAt: null,
  createdAt: at,
  updatedAt: at,
  actorId: "github-user-7",
  supported: true,
  unsupportedReason: null,
};
const alert = (n: number) => ({
  schemaVersion: 1,
  mode: "live",
  workspaceId: fixtureRule.workspaceId,
  projectId: fixtureRule.projectId,
  alertId: `00000000-0000-4000-8000-${String(n + 10).padStart(12, "0")}`,
  ruleId,
  ruleVersion: 2,
  ruleName: "HTTP errors fixture " + n,
  sourceId,
  category: "http",
  severity: "low",
  confidence: 40,
  origin: "controlled_test",
  correlationKey: "a".repeat(64),
  windowStart: at,
  windowEnd: "2026-11-15T00:05:00Z",
  firstObservedAt: at,
  lastObservedAt: at,
  detectedAt: at,
  matchedEventCount: 5,
  deduplicationKey: "b".repeat(64),
  suppressionStatus: "not_suppressed",
});
async function mock(
  page: Page,
  options: { empty?: boolean; error?: number } = {},
) {
  let state = { ...fixtureRule };
  const writes: Record<string, unknown>[] = [];
  await page.route("**/api/sentinel/**", async (route) => {
    const r = route.request(),
      u = new URL(r.url());
    if (options.error)
      return route.fulfill({
        status: options.error,
        json: { error: "not_configured" },
      });
    if (r.method() === "POST") {
      const c = r.postDataJSON();
      writes.push(c);
      if (c.action === "enable" || c.action === "disable")
        state = {
          ...state,
          status: c.action === "enable" ? "ENABLED" : "DISABLED",
          version: state.version + 1,
          revision: state.revision + 1,
        };
      if (c.action === "create" || c.action === "update")
        state = {
          ...state,
          definition: c.definition,
          status: "DRAFT",
          version: state.version + 1,
          revision: state.revision + 1,
        };
      return route.fulfill({ json: { ruleId, revision: state.revision } });
    }
    if (u.pathname.endsWith("/rules"))
      return route.fulfill({
        json: u.searchParams.has("ruleId")
          ? {
              rule: state,
              versions: [{ version: 1, status: "DRAFT" }],
              audit: [{ action: "create", actor_id: "github-user-7" }],
              evaluations: [],
            }
          : { rules: options.empty ? [] : [state] },
      });
    if (u.searchParams.has("alertId"))
      return route.fulfill({
        json: {
          alert: alert(1),
          definition,
          evidence: [
            {
              event: { request: { routeTemplate: "/api/:redacted" } },
              origin: "controlled_test",
            },
          ],
        },
      });
    const older = u.searchParams.has("cursor");
    return route.fulfill({
      json: {
        items: options.empty ? [] : [alert(older ? 2 : 1)],
        nextCursor: older ? null : "fixture-cursor",
        window: { from: at, to: at },
      },
    });
  });
  return writes;
}
test("draft create/edit/enable/disable and immutable history use scoped API", async ({
  page,
}) => {
  const writes = await mock(page);
  await page.goto("/app/detection-fixture");
  await expect(page.getByText("DRAFT", { exact: true })).toBeVisible();
  await page
    .getByLabel("Rule name", { exact: true })
    .fill("Reviewed fixture draft");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(
    page.getByRole("heading", { name: "Reviewed fixture draft" }),
  ).toBeVisible();
  expect(writes[0].action).toBe("create");
  await page.getByRole("button", { name: "Enable rule", exact: true }).click();
  await expect(page.getByText("ENABLED", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit draft" })).toBeDisabled();
  await page.getByRole("button", { name: "Disable rule", exact: true }).click();
  await expect(page.getByText("DISABLED", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Edit draft" }).click();
  await page.getByLabel("Threshold", { exact: true }).fill("6");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("DRAFT", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Inspect rule" }).click();
  await expect(
    page.getByRole("region", { name: "Rule versions and audit" }),
  ).toContainText("github-user-7");
  expect(writes.map((c) => c.action)).toEqual([
    "create",
    "enable",
    "disable",
    "update",
  ]);
  expect(writes[3].expectedRevision).toBe(4);
});
test("persisted alert filters, details and actual older-page control preserve records", async ({
  page,
}) => {
  await mock(page);
  await page.goto("/app/detection-fixture?section=alerts");
  await expect(
    page.getByRole("heading", { name: "HTTP errors fixture 1" }),
  ).toBeVisible();
  const filtered = page.waitForRequest(
    (r) =>
      r.url().includes("/alerts?") &&
      new URL(r.url()).searchParams.get("severity") === "high",
  );
  await page.getByLabel("Alert severity").selectOption("high");
  await filtered;
  await expect(
    page.getByRole("button", { name: "Load older alerts" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Load older alerts" }).click();
  await expect(
    page.getByRole("heading", { name: "HTTP errors fixture 2" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "HTTP errors fixture 1" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Inspect alert" }).first().click();
  await expect(
    page.getByRole("region", { name: "Redacted alert evidence" }),
  ).toContainText("/api/:redacted");
  await expect(
    page.getByRole("region", { name: "Redacted alert evidence" }),
  ).toContainText("controlled_test");
});
test("empty and unavailable states never fabricate alerts", async ({
  page,
}) => {
  await mock(page, { empty: true });
  await page.goto("/app/detection-fixture?section=alerts");
  await expect(
    page.getByRole("heading", { name: "No persisted alerts" }),
  ).toBeVisible();
  await page.unroute("**/api/sentinel/**");
  await mock(page, { error: 503 });
  await page.reload();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "not configured",
  );
  await expect(page.getByRole("button", { name: "Inspect alert" })).toHaveCount(
    0,
  );
});
test("unknown or forbidden project data stays unavailable", async ({
  page,
}) => {
  await mock(page, { error: 404 });
  await page.goto("/app/detection-fixture");
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "unavailable to your account",
  );
  await expect(page.getByRole("button", { name: "Inspect rule" })).toHaveCount(
    0,
  );
});
test("invalid advanced conditions fail locally without sending a write", async ({
  page,
}) => {
  const writes = await mock(page);
  await page.goto("/app/detection-fixture");
  // Rules arrive via a client fetch, so their presence proves hydration; a click before it is silently lost (CI race).
  await expect(page.getByRole("button", { name: "Inspect rule" }).first()).toBeVisible();
  await page
    .getByText("Matching conditions and suppression windows", { exact: true })
    .click();
  await page.getByLabel("Conditions JSON").fill("not json");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "valid JSON",
  );
  expect(writes).toHaveLength(0);
});
test("mobile detail is bounded and demo performs no detection API calls", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mock(page);
  await page.goto("/app/detection-fixture?section=alerts");
  await page.getByRole("button", { name: "Inspect alert" }).click();
  await expect(
    page.getByRole("region", { name: "Redacted alert evidence" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  let calls = 0;
  page.on("request", (r) => {
    if (r.url().includes("/api/sentinel/")) calls++;
  });
  await page.goto("/app/projects/orderly-demo/sentinel/activity");
  await expect(
    page.getByRole("heading", { name: "Every signal, in context." }),
  ).toBeVisible();
  expect(calls).toBe(0);
});

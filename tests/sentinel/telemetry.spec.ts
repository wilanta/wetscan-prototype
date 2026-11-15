import { test, expect, type Page } from "@playwright/test";
const id = "26b6b537-c016-4dc7-8007-4e839e8b838f",
  eventId = "9f3560a6-127f-42a6-abaf-9f45951e6bd5",
  at = "2026-11-14T08:00:00.000Z";
const source = {
  schemaVersion: 1,
  revision: 1,
  mode: "live",
  workspaceId: "github-user-7:fixture",
  projectId: "github-123",
  sourceId: id,
  name: "Owned test fixture",
  origin: "controlled_test",
  environment: "local",
  enabled: true,
  status: "stale",
  lastContactAt: at,
  lastIngestedAt: at,
  activeCredentials: 1,
  retentionDays: 7,
  rateLimit: 1000,
};
const item = {
  schemaVersion: 1,
  revision: 1,
  mode: "live",
  workspaceId: source.workspaceId,
  projectId: source.projectId,
  sourceId: id,
  ingestedAt: at,
  evidence: {
    id: `telemetry:${id}/${eventId}`,
    sourceId: id,
    origin: "controlled_test",
    occurredAt: at,
    recordedAt: at,
  },
  event: {
    schemaVersion: 1,
    eventId,
    projectId: source.projectId,
    kind: "auth.failed",
    occurredAt: at,
    severityHint: "info",
    request: { routeTemplate: "/api/users/:redacted" },
  },
};
async function mock(
  page: Page,
  options: { empty?: boolean; error?: boolean } = {},
) {
  await page.route("**/api/sentinel/**", async (route) => {
    if (options.error)
      return route.fulfill({
        status: 503,
        json: { error: "telemetry_not_configured" },
      });
    if (route.request().method() === "POST")
      return route.fulfill({
        status: 201,
        json: {
          sourceId: id,
          credential: "fixture-only-not-a-usable-credential",
          showOnce: true,
        },
      });
    if (new URL(route.request().url()).pathname.endsWith("/sources"))
      return route.fulfill({
        json: { sources: options.empty ? [] : [source] },
      });
    return route.fulfill({
      json: {
        items: options.empty ? [] : [item],
        nextCursor: null,
        window: { from: at, to: at },
      },
    });
  });
}
test("fixture Event Explorer shows provenance, redacted details and sends scoped filters", async ({
  page,
}) => {
  await mock(page);
  await page.goto("/app/telemetry-fixture");
  await expect(
    page.getByRole("heading", { name: "Every received event, in context." }),
  ).toBeVisible();
  await expect(
    page.getByText("auth.failed", { exact: true }).last(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Inspect event" }).click();
  await expect(
    page.getByRole("region", { name: "Redacted event details" }),
  ).toContainText("/api/users/:redacted");
  const request = page.waitForRequest(
    (r) =>
      r.url().includes("/events?") &&
      new URL(r.url()).searchParams.get("kind") === "auth.failed",
  );
  await page
    .getByLabel("Event type", { exact: true })
    .selectOption("auth.failed");
  expect((await request).url()).toContain("/projects/github-123/events");
  await expect(
    page.getByText("Severity is an untrusted sender hint", { exact: false }),
  ).toBeVisible();
});
test("fixture registration requires explicit ownership and shows credential only until dismissed", async ({
  page,
}) => {
  await mock(page, { empty: true });
  await page.goto("/app/telemetry-fixture?section=sources");
  await expect(
    page.getByRole("button", { name: "Create telemetry source" }),
  ).toBeDisabled();
  await page.getByLabel("Source name", { exact: true }).fill("Owned fixture");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Create telemetry source" }).click();
  await expect(page.getByLabel("One-time ingest credential")).toContainText(
    "fixture-only-not-a-usable-credential",
  );
  await page.getByRole("button", { name: "Dismiss credential" }).click();
  await expect(page.getByLabel("One-time ingest credential")).toHaveCount(0);
});
test("fixture empty and configuration failure states do not claim monitoring", async ({
  page,
}) => {
  await mock(page, { empty: true });
  await page.goto("/app/telemetry-fixture");
  await expect(
    page.getByRole("heading", { name: "No received events" }),
  ).toBeVisible();
  await page.unroute("**/api/sentinel/**");
  await mock(page, { error: true });
  await page.reload();
  await expect(
    page
      .getByText("Telemetry storage is not configured", { exact: false })
      .first(),
  ).toBeVisible();
  await expect(
    page.getByText("Detection and alerts are not enabled.", { exact: false }),
  ).toBeVisible();
});
test("fixture telemetry page cannot insert records into the original demo", async ({
  page,
}) => {
  let calls = 0;
  await page.route("**/api/sentinel/**", async (route) => {
    calls++;
    await route.fulfill({ json: { sources: [], items: [], nextCursor: null } });
  });
  await page.goto("/app/projects/orderly-demo/sentinel/activity");
  await expect(
    page.getByRole("heading", { name: "Every signal, in context." }),
  ).toBeVisible();
  expect(calls).toBe(0);
});
test("fixture Event Explorer stays within a mobile viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mock(page);
  await page.goto("/app/telemetry-fixture");
  await expect(
    page.getByRole("button", { name: "Inspect event" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

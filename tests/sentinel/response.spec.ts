import { test, expect, type Page } from "@playwright/test";

const incidentId = "00000000-0000-5000-a000-000000000001";
const targetId = "00000000-0000-4000-8000-0000000000aa";
const at = "2026-11-19T00:00:00.000Z";
const action = (status: string, extra: Record<string, unknown> = {}) => ({
  schemaVersion: 1,
  mode: "live",
  workspaceId: "github-user-7:fixture",
  projectId: "github-123",
  actionId: "00000000-0000-4000-8000-0000000000b1",
  incidentId,
  targetId,
  incidentOrigin: "controlled_test",
  operation: "temporary_rate_limit",
  ttlSeconds: 120,
  status,
  proposedBy: "github-user-7",
  approvedBy: null,
  approvedAt: null,
  approvalExpiresAt: null,
  appliedAt: null,
  expiresAt: null,
  rollbackRequestedBy: null,
  policyReasons: ["policy_passed"],
  revision: 1,
  createdAt: at,
  updatedAt: at,
  ...extra,
});
async function mock(
  page: Page,
  o: { targets?: unknown[]; actions?: unknown[] },
) {
  const writes: Record<string, unknown>[] = [];
  await page.route("**/api/sentinel/**", async (route) => {
    const r = route.request();
    const u = new URL(r.url());
    if (r.method() === "POST") {
      writes.push(r.postDataJSON());
      return route.fulfill({
        json: { action: action("awaiting_approval"), replay: false },
      });
    }
    if (u.pathname.endsWith("/incidents"))
      return route.fulfill({
        json: {
          items: [
            {
              incidentId,
              title: "HTTP error burst",
              status: "open",
              origin: "controlled_test",
            },
          ],
          nextCursor: null,
          window: { from: at, to: at },
        },
      });
    if (u.searchParams.get("view") === "targets")
      return route.fulfill({ json: { targets: o.targets ?? [] } });
    return route.fulfill({ json: { actions: o.actions ?? [] } });
  });
  return writes;
}

test("unconfigured project shows NO-OP / NOT_CONFIGURED and offers no way to propose", async ({
  page,
}) => {
  await mock(page, {});
  await page.goto("/app/response-fixture");
  await expect(page.getByText("NO-OP / NOT_CONFIGURED")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Propose temporary rate limit" }),
  ).toHaveCount(0);
});

test("applied is never shown as verified; verified is scoped to the fixture; propose sends no scope or URL", async ({
  page,
}) => {
  const writes = await mock(page, {
    targets: [
      {
        targetId,
        origin: "http://127.0.0.1:4999",
        maxTtlSeconds: 600,
        allowSelfApproval: true,
      },
    ],
    actions: [
      action("applied", { actionId: "00000000-0000-4000-8000-0000000000b2" }),
      action("verified", { actionId: "00000000-0000-4000-8000-0000000000b3" }),
      action("awaiting_approval"),
    ],
  });
  await page.goto("/app/response-fixture");
  await expect(page.getByText("Applied · NOT verified")).toBeVisible();
  await expect(
    page.getByText("Neutralization verified (fixture scope)"),
  ).toHaveCount(1);
  await page.getByLabel("Incident").selectOption(incidentId);
  await page.getByLabel("Target").selectOption(targetId);
  await page
    .getByRole("button", { name: "Propose temporary rate limit" })
    .click();
  await expect.poll(() => writes.length).toBe(1);
  expect(Object.keys(writes[0]).sort()).toEqual([
    "action",
    "idempotencyKey",
    "incidentId",
    "targetId",
    "ttlSeconds",
  ]);
  expect(writes[0]).toMatchObject({
    action: "propose",
    incidentId,
    targetId,
    ttlSeconds: 120,
  });
  await page.getByRole("button", { name: "Approve" }).click();
  await expect.poll(() => writes.length).toBe(2);
  expect(writes[1]).toMatchObject({ action: "approve", expectedRevision: 1 });
  expect(Object.keys(writes[1]).sort()).toEqual([
    "action",
    "actionId",
    "expectedRevision",
  ]);
});

test("S05-A7: Orderly Demo Response flow makes zero live API calls", async ({
  page,
}) => {
  let live = 0;
  page.on("request", (r) => {
    if (r.url().includes("/api/sentinel/")) live++;
  });
  await page.goto("/app/projects/orderly-demo/sentinel/responses");
  await expect(page.getByText("Response history")).toBeVisible();
  await expect(page.getByText("Auditable demo actions")).toBeVisible();
  expect(live).toBe(0);
});

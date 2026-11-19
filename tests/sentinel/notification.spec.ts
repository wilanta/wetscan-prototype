import { test, expect, type Page } from "@playwright/test";

const at = "2026-11-19T00:00:00.000Z";
const channel = (name: string, o: Record<string, unknown> = {}) => ({
  channel: name,
  enabled: false,
  destinationMasked: null,
  destinationVerified: false,
  consentAt: null,
  consentBy: null,
  minSeverity: "high",
  triggers: ["incident_opened"],
  includeControlledTest: false,
  quiet: { enabled: false, timezone: null, startMinute: null, endMinute: null },
  throttlePerHour: 10,
  revision: 0,
  available: name !== "whatsapp",
  ...(name === "whatsapp"
    ? {
        unavailableReason:
          "Requires official WhatsApp Business setup, templates and recipient opt-in (H06). Not configured.",
      }
    : {}),
  ...o,
});
const delivery = (
  id: string,
  state: string,
  o: Record<string, unknown> = {},
) => ({
  deliveryId: `00000000-0000-4000-8000-00000000000${id}`,
  channel: "telegram",
  trigger: "incident_opened",
  subjectRef: "i",
  origin: "runtime",
  state,
  reason: null,
  attemptCount: 1,
  lastAttemptAt: at,
  nextAttemptAt: null,
  providerAcceptedAt: null,
  deliveredAt: null,
  providerMessageId: null,
  deadLetter: false,
  retryOf: null,
  createdAt: at,
  finishedAt: at,
  ...o,
});
async function mock(
  page: Page,
  o: { channels?: unknown[]; deliveries?: unknown[] },
) {
  const writes: Record<string, unknown>[] = [];
  const hosts: string[] = [];
  page.on("request", (r) => hosts.push(new URL(r.url()).host));
  await page.route("**/api/sentinel/**", async (route) => {
    const r = route.request();
    if (r.method() === "POST") {
      writes.push(r.postDataJSON());
      return route.fulfill({ json: { saved: true } });
    }
    if (new URL(r.url()).searchParams.get("view") === "deliveries")
      return route.fulfill({ json: { deliveries: o.deliveries ?? [] } });
    return route.fulfill({
      json: {
        channels: o.channels ?? [
          channel("telegram"),
          channel("email"),
          channel("whatsapp"),
        ],
      },
    });
  });
  return { writes, hosts };
}

test("unconfigured project: nothing enabled, WhatsApp unavailable, enable blocked until a provider-accepted test", async ({
  page,
}) => {
  await mock(page, {});
  await page.goto("/app/notification-fixture");
  await expect(page.getByRole("heading", { name: "Telegram" })).toBeVisible();
  await expect(
    page.getByText("Requires business setup · Not configured"),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Enable notifications" }).first(),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Send one test message" }).first(),
  ).toBeDisabled();
  await expect(page.getByText("No deliveries yet")).toBeVisible();
});

test("consent is an explicit act and the payload carries no scope, token or free text", async ({
  page,
}) => {
  const { writes } = await mock(page, {});
  await page.goto("/app/notification-fixture");
  const card = page
    .locator(".card, section, div")
    .filter({ has: page.getByRole("heading", { name: "Telegram" }) })
    .last();
  await card.getByLabel("Telegram chat ID (numeric)").fill("123456789");
  await expect(
    card.getByRole("button", { name: "Save destination" }),
  ).toBeEnabled();
  await card.getByLabel(/consent to receive Sentinel notifications/).check();
  await card.getByRole("button", { name: "Save destination" }).click();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0]).toEqual({
    action: "save_channel",
    channel: "telegram",
    destination: "123456789",
    consent: true,
  });
  expect(JSON.stringify(writes[0])).not.toMatch(
    /workspace|project|token|text|chatId/i,
  );
});

test("test send and enable use idempotent minimal commands; verified destination unlocks enabling", async ({
  page,
}) => {
  const { writes } = await mock(page, {
    channels: [
      channel("telegram", {
        revision: 3,
        consentAt: at,
        destinationMasked: "…6789",
        destinationVerified: true,
      }),
      channel("email"),
      channel("whatsapp"),
    ],
  });
  await page.goto("/app/notification-fixture");
  await expect(
    page.getByText("…6789 · test accepted by provider"),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Send one test message" })
    .first()
    .click();
  await expect.poll(() => writes.length).toBe(1);
  expect(Object.keys(writes[0]).sort()).toEqual([
    "action",
    "channel",
    "idempotencyKey",
  ]);
  expect(writes[0]).toMatchObject({ action: "test", channel: "telegram" });
  expect(String(writes[0].idempotencyKey)).toMatch(/^[a-f0-9]{64}$/);
  await page
    .getByRole("button", { name: "Enable notifications" })
    .first()
    .click();
  await expect.poll(() => writes.length).toBe(2);
  expect(writes[1]).toEqual({
    action: "save_channel",
    channel: "telegram",
    expectedRevision: 3,
    enabled: true,
  });
});

test("provider acceptance is never shown as delivery; failures/unknown offer an authorized manual retry", async ({
  page,
}) => {
  const { writes } = await mock(page, {
    channels: [
      channel("telegram", {
        revision: 2,
        enabled: true,
        consentAt: at,
        destinationMasked: "…6789",
        destinationVerified: true,
      }),
      channel("email"),
      channel("whatsapp"),
    ],
    deliveries: [
      delivery("1", "provider_accepted", {
        providerMessageId: "77",
        providerAcceptedAt: at,
      }),
      delivery("2", "failed", {
        reason: "destination_rejected",
        deadLetter: true,
      }),
      delivery("3", "unknown", { reason: "network_or_timeout" }),
      delivery("4", "suppressed", { reason: "deferred_quiet_hours" }),
      delivery("5", "pending", {
        createdAt: "2026-11-18T00:00:00.000Z",
        finishedAt: null,
      }),
    ],
  });
  await page.goto("/app/notification-fixture");
  await expect(
    page.getByText("Provider accepted · delivery not confirmed"),
  ).toBeVisible();
  await expect(page.getByText("Delivered (provider evidence)")).toHaveCount(0);
  await expect(
    page.getByText("Provider rejected the destination."),
  ).toBeVisible();
  await expect(
    page.getByText("Network timeout; outcome uncertain."),
  ).toBeVisible();
  await expect(page.getByText(/no sender has picked this up/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry" })).toHaveCount(2);
  await page.getByRole("button", { name: "Retry" }).first().click();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0]).toMatchObject({
    action: "retry",
    deliveryId: "00000000-0000-4000-8000-000000000002",
  });
  expect(Object.keys(writes[0]).sort()).toEqual([
    "action",
    "deliveryId",
    "idempotencyKey",
  ]);
});

test("NOT_CONFIGURED backend is reported honestly, never an empty success", async ({
  page,
}) => {
  await page.route("**/api/sentinel/**", (route) =>
    route.fulfill({
      status: 503,
      json: { error: "notifications_not_configured" },
    }),
  );
  await page.goto("/app/notification-fixture");
  await expect(
    page.getByText(/not configured \(NOT_CONFIGURED\)/i),
  ).toBeVisible();
});

test("S06-A6: Orderly Demo notification previews make zero live API or provider calls", async ({
  page,
}) => {
  const seen: string[] = [];
  page.on("request", (r) => seen.push(r.url()));
  await page.goto("/app/notifications");
  await expect(
    page.getByText(/No Telegram, email, or WhatsApp messages are sent/),
  ).toBeVisible();
  await page
    .getByRole("checkbox")
    .first()
    .check()
    .catch(() => undefined);
  await page
    .getByRole("button", { name: /preview/i })
    .first()
    .click()
    .catch(() => undefined);
  await page.goto("/app/projects/orderly-demo/sentinel/responses");
  await page.goto("/app/integrations");
  expect(
    seen.filter((u) =>
      /\/api\/sentinel\/|api\.telegram\.org|api\.resend\.com|graph\.facebook\.com/.test(
        u,
      ),
    ),
  ).toEqual([]);
});

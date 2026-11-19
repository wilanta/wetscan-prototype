import { test, expect, type Page } from "@playwright/test";

const at = "2026-11-19T01:00:00.000Z";
const sourceId = "00000000-0000-4000-8000-0000000000a1";
const decoyId = "00000000-0000-4000-8000-0000000000d1";
const ruleId = "00000000-0000-4000-8000-0000000000r1";
const eventId = "00000000-0000-4000-8000-0000000000e1";
const alertId = "00000000-0000-4000-8000-0000000000a9";
const incidentId = "00000000-0000-4000-8000-0000000000c1";

function baseSource() {
  return {
    schemaVersion: 1,
    mode: "live",
    workspaceId: "github-user-7:fixture",
    projectId: "github-123",
    sourceId,
    name: "Local Ghost Source",
    origin: "controlled_test",
    environment: "local",
    revision: 1,
    enabled: true,
    activeCredentials: 1,
    retentionDays: 7,
    rateLimit: 1000,
    lastContactAt: at,
    lastIngestedAt: at,
    status: "connected",
  };
}

function baseDecoy(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    mode: "live",
    workspaceId: "github-user-7:fixture",
    projectId: "github-123",
    decoyId,
    sourceId,
    sourceName: "Local Ghost Source",
    name: "Local Ghost Decoy",
    environment: "local",
    origin: "controlled_test",
    targetRef: "local-fixture:127.0.0.1",
    decoyPath: "/__wetscan/ghost-decoy",
    enabled: false,
    ownedAppConfirmed: true,
    responseStatus: 200,
    rateLimitPerMin: 30,
    h07ProofId: "h07-local-fixture",
    falsePositiveNotice:
      "A decoy hit is a suspicious signal, never proof of compromise.",
    revision: 1,
    createdAt: at,
    updatedAt: at,
    lastHitAt: null,
    sourceEnabled: true,
    sourceStatus: "connected",
    activeCredentials: 1,
    lastContactAt: at,
    lastIngestedAt: at,
    connectionStatus: "disabled",
    ...overrides,
  };
}

async function mockGhost(
  page: Page,
  options: {
    status?: number;
    errorCode?: string;
    overview?: Record<string, unknown>;
  },
) {
  const posts: { url: string; body: Record<string, unknown> }[] = [];
  await page.route("**/api/sentinel/**", async (route) => {
    const req = route.request();
    if (req.method() === "POST") {
      posts.push({ url: req.url(), body: req.postDataJSON() });
      return route.fulfill({ json: { decoy: baseDecoy() } });
    }
    if (options.status && options.status !== 200) {
      return route.fulfill({
        status: options.status,
        json: { error: options.errorCode ?? "ghost_not_configured" },
      });
    }
    return route.fulfill({
      json: {
        decoys: [],
        sources: [],
        rule: null,
        ruleStatus: "not_seeded",
        hits: [],
        alerts: [],
        incidents: [],
        audit: [],
        falsePositivePolicy:
          "A decoy hit is a suspicious signal, never proof of compromise. Benign scanners or crawlers can trigger this endpoint. Automated blocking, credential capture, and session hijacking are disabled.",
        futureS08Archive: {
          available: false,
          reason:
            "S08 Internal Intelligence Case Library is not implemented in S07.",
          eligibleIncidentCount: 0,
        },
        ...options.overview,
      },
    });
  });
  return posts;
}

test("unconfigured migration (503) shows honest NOT_CONFIGURED message", async ({
  page,
}) => {
  await mockGhost(page, { status: 503, errorCode: "ghost_not_configured" });
  await page.goto("/app/ghost-fixture");
  await expect(
    page.getByText(
      "Ghost Lite is not configured (NOT_CONFIGURED). Database migration 0007 is not applied.",
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Register disabled decoy" }),
  ).toHaveCount(0);
});

test("no telemetry source shows honest unconfigured state; creating decoy requires ownership and sends no scope/provenance", async ({
  page,
}) => {
  const posts = await mockGhost(page, {
    overview: { sources: [] },
  });
  await page.goto("/app/ghost-fixture");
  await expect(page.getByText("No authorized telemetry source")).toBeVisible();

  await page.unroute("**/api/sentinel/**");
  const posts2 = await mockGhost(page, {
    overview: { sources: [baseSource()], decoys: [] },
  });
  await page.goto("/app/ghost-fixture");
  const createBtn = page.getByRole("button", {
    name: "Register disabled decoy",
  });
  await expect(createBtn).toBeDisabled();
  await page
    .getByLabel(
      "I own this test application or have explicit H07 permission for this decoy endpoint.",
    )
    .check();
  await expect(createBtn).toBeEnabled();
  await createBtn.click();
  await expect.poll(() => posts2.length).toBe(1);
  expect(posts2[0].body).toMatchObject({
    action: "create",
    sourceId,
    decoyPath: "/__wetscan/ghost-decoy",
    ownedApplicationConfirmed: true,
  });
  expect(JSON.stringify(posts2[0].body)).not.toMatch(
    /workspaceId|projectId|origin|environment/,
  );
  expect(posts).toHaveLength(0);
});

test("displays disabled, connected, hit history, evidence-backed alerts, linked incidents, false-positive notice, and redacted details", async ({
  page,
}) => {
  const posts = await mockGhost(page, {
    overview: {
      sources: [baseSource()],
      decoys: [
        baseDecoy({
          enabled: true,
          connectionStatus: "connected",
          lastHitAt: at,
        }),
      ],
      rule: {
        schemaVersion: 1,
        mode: "live",
        workspaceId: "github-user-7:fixture",
        projectId: "github-123",
        ruleId,
        revision: 2,
        version: 2,
        status: "ENABLED",
        definition: {
          schemaVersion: 1,
          name: "Accepted decoy trigger",
          description: "Decoy hit rule",
          category: "decoy",
          severity: "high",
          confidence: 70,
          eventKinds: ["ghost.decoy_triggered"],
          conditions: [],
          correlation: "source",
          windowSeconds: 60,
          threshold: 1,
          cooldownSeconds: 60,
          suppressionWindows: [],
        },
        enabledAt: at,
        createdAt: at,
        updatedAt: at,
        actorId: "github-user-7",
        supported: true,
        unsupportedReason: null,
      },
      ruleStatus: "ENABLED",
      hits: [
        {
          schemaVersion: 1,
          revision: 1,
          mode: "live",
          workspaceId: "github-user-7:fixture",
          projectId: "github-123",
          sourceId,
          ingestedAt: at,
          evidence: {
            id: `telemetry:${sourceId}:${eventId}`,
            sourceId,
            origin: "controlled_test",
            occurredAt: at,
            recordedAt: at,
          },
          event: {
            schemaVersion: 1,
            eventId,
            projectId: "github-123",
            occurredAt: at,
            kind: "ghost.decoy_triggered",
            severityHint: "medium",
            request: {
              method: "GET",
              routeTemplate: "/__wetscan/ghost-decoy",
              statusCode: 200,
            },
            attributes: {
              reasonCode: "decoy_hit",
              signalClassification: "automated_crawler_or_scanner",
            },
          },
        },
      ],
      alerts: [
        {
          schemaVersion: 1,
          mode: "live",
          workspaceId: "github-user-7:fixture",
          projectId: "github-123",
          alertId,
          ruleId,
          ruleVersion: 2,
          ruleName: "Accepted decoy trigger",
          sourceId,
          category: "decoy",
          severity: "high",
          confidence: 70,
          origin: "controlled_test",
          correlationKey: "a".repeat(64),
          windowStart: at,
          windowEnd: at,
          firstObservedAt: at,
          lastObservedAt: at,
          detectedAt: at,
          matchedEventCount: 1,
          deduplicationKey: "b".repeat(64),
          suppressionStatus: "not_suppressed",
        },
      ],
      incidents: [
        {
          schemaVersion: 1,
          mode: "live",
          workspaceId: "github-user-7:fixture",
          projectId: "github-123",
          incidentId,
          sourceId,
          primaryAlertId: alertId,
          ruleId,
          ruleVersion: 2,
          ruleName: "Accepted decoy trigger",
          title: "Accepted decoy trigger (Controlled test)",
          summary: "Controlled decoy hit recorded.",
          category: "decoy",
          severity: "high",
          status: "open",
          verificationStatus: "not_requested",
          archived: false,
          origin: "controlled_test",
          correlationKey: "a".repeat(64),
          deduplicationKey: "b".repeat(64),
          alertIds: [alertId],
          evidenceIds: [`telemetry:${sourceId}:${eventId}`],
          evidenceRefs: [],
          occurredAt: at,
          firstObservedAt: at,
          lastObservedAt: at,
          openedAt: at,
          updatedAt: at,
          closedAt: null,
          closedBy: null,
          closeReason: null,
          lastActorId: "system:sentinel-worker",
          revision: 1,
        },
      ],
      futureS08Archive: {
        available: false,
        reason:
          "S08 Internal Intelligence Case Library is not implemented in S07.",
        eligibleIncidentCount: 1,
      },
    },
  });

  await page.goto("/app/ghost-fixture");
  await expect(
    page.getByText("never proof of compromise", { exact: false }),
  ).toBeVisible();
  await expect(page.getByText("Connected", { exact: true })).toBeVisible();
  await expect(page.getByText("/__wetscan/ghost-decoy").first()).toBeVisible();
  await expect(
    page.getByText("automated crawler or scanner", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByText("Accepted decoy trigger (Controlled test)"),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Inspect incident" }),
  ).toHaveAttribute(
    "href",
    `/app/projects/github-123/sentinel/incidents/${incidentId}`,
  );

  await page.getByRole("button", { name: "Inspect hit" }).click();
  await expect(
    page.getByRole("region", { name: "Redacted decoy hit details" }),
  ).toContainText("/__wetscan/ghost-decoy");

  await page
    .getByRole("button", { name: "Disable decoy", exact: true })
    .click();
  await expect.poll(() => posts.length).toBe(1);
  expect(posts[0].body).toEqual({
    action: "disable",
    decoyId,
    expectedRevision: 1,
  });
});

test("S07-A6: Orderly Demo Ghost remains purely synthetic with zero live API or external requests", async ({
  page,
}) => {
  const apiRequests: string[] = [];
  const externalHosts: string[] = [];
  page.on("request", (req) => {
    const u = new URL(req.url());
    if (u.pathname.startsWith("/api/sentinel")) apiRequests.push(u.pathname);
    if (!["127.0.0.1", "localhost"].includes(u.hostname))
      externalHosts.push(u.hostname);
  });

  await page.goto("/app/projects/orderly-demo/sentinel/ghost");
  await page.getByRole("button", { name: "Set up demo decoy" }).click();
  await page.getByRole("switch", { name: "Enable local demo decoy" }).check();
  await page.getByRole("button", { name: "Save demo configuration" }).click();
  await page.getByRole("button", { name: "Test decoy (simulated)" }).click();
  await expect(
    page.getByRole("heading", { name: "A demo decoy was accessed" }),
  ).toBeVisible();
  expect(apiRequests).toEqual([]);
  expect(externalHosts).toEqual([]);
});

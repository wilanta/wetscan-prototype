import { test, expect, type Page } from "@playwright/test";
import type {
  IncidentStatus,
  IncidentTimelineRecord,
} from "../../src/features/sentinel/incidents/model";

const incidentId1 = "00000000-0000-5000-a000-000000000001";
const incidentId2 = "00000000-0000-5000-a000-000000000002";
const alertId = "00000000-0000-4000-8000-000000000003";
const ruleId = "00000000-0000-4000-8000-000000000002";
const sourceId = "00000000-0000-4000-8000-000000000001";
const at = "2026-11-15T00:00:00.000Z";

function makeIncident(
  n: number,
  status: "open" | "investigating" | "closed" = "open",
  revision = 1,
) {
  const id = n === 1 ? incidentId1 : incidentId2;
  return {
    schemaVersion: 1,
    mode: "live",
    workspaceId: "github-user-7:fixture",
    projectId: "github-123",
    incidentId: id,
    sourceId,
    primaryAlertId: alertId,
    ruleId,
    ruleVersion: 2,
    ruleName: `HTTP error burst ${n}`,
    title: `HTTP error burst ${n} (Controlled test)`,
    summary: `Repeated 500 responses on source ${sourceId}.`,
    category: "http",
    severity: "high",
    status,
    verificationStatus: "not_requested",
    archived: false,
    origin: "controlled_test",
    correlationKey: "a".repeat(64),
    deduplicationKey: "b".repeat(64),
    alertIds: [alertId],
    evidenceIds: [`telemetry:${sourceId}:00000000-0000-4000-8000-000000000011`],
    evidenceRefs: [
      {
        id: `telemetry:${sourceId}:00000000-0000-4000-8000-000000000011`,
        sourceId,
        origin: "controlled_test",
        occurredAt: at,
        recordedAt: at,
      },
    ],
    occurredAt: at,
    firstObservedAt: at,
    lastObservedAt: at,
    openedAt: at,
    updatedAt: at,
    closedAt: status === "closed" ? at : null,
    closedBy: status === "closed" ? "github-user-7" : null,
    closeReason:
      status === "closed"
        ? "Verified synthetic probe during controlled acceptance."
        : null,
    lastActorId: status === "open" ? "system:sentinel-worker" : "github-user-7",
    revision,
  };
}

async function mockIncidents(
  page: Page,
  options: { empty?: boolean; error?: number } = {},
) {
  let currentStatus: IncidentStatus = "open";
  let currentRevision = 1;
  const timeline: IncidentTimelineRecord[] = [
    {
      schemaVersion: 1,
      mode: "live",
      workspaceId: "github-user-7:fixture",
      projectId: "github-123",
      timelineId: "00000000-0000-5000-a000-000000000011",
      incidentId: incidentId1,
      sequence: 1,
      revision: 1,
      incidentRevision: 1,
      type: "alert_created",
      actorId: "system:sentinel-worker",
      actorType: "system",
      fromStatus: null,
      toStatus: null,
      summary: `Alert ${alertId} recorded by rule HTTP error burst 1 v2 (controlled_test).`,
      metadata: { alertId, ruleVersion: 2 },
      idempotencyKey: "1".repeat(64),
      occurredAt: at,
      recordedAt: at,
      evidenceIds: [
        `telemetry:${sourceId}:00000000-0000-4000-8000-000000000011`,
      ],
      evidenceRefs: [],
    },
    {
      schemaVersion: 1,
      mode: "live",
      workspaceId: "github-user-7:fixture",
      projectId: "github-123",
      timelineId: "00000000-0000-5000-a000-000000000012",
      incidentId: incidentId1,
      sequence: 2,
      revision: 2,
      incidentRevision: 1,
      type: "incident_opened",
      actorId: "system:sentinel-worker",
      actorType: "system",
      fromStatus: null,
      toStatus: "open",
      summary: `Incident opened from alert ${alertId} with status OPEN (controlled_test).`,
      metadata: { alertId, status: "open" },
      idempotencyKey: "2".repeat(64),
      occurredAt: at,
      recordedAt: at,
      evidenceIds: [
        `telemetry:${sourceId}:00000000-0000-4000-8000-000000000011`,
      ],
      evidenceRefs: [],
    },
  ];
  const writes: Record<string, unknown>[] = [];

  await page.route("**/api/sentinel/**", async (route) => {
    const r = route.request();
    const u = new URL(r.url());
    if (options.error)
      return route.fulfill({
        status: options.error,
        json: { error: "not_configured" },
      });
    if (r.method() === "POST") {
      const body = r.postDataJSON();
      writes.push(body);
      if (body.expectedRevision !== currentRevision) {
        return route.fulfill({
          status: 409,
          json: { error: "revision_conflict" },
        });
      }
      if (
        body.action === "close" &&
        (!body.reason || String(body.reason).trim().length < 3)
      ) {
        return route.fulfill({
          status: 400,
          json: { error: "invalid_close_reason" },
        });
      }
      const prevStatus: IncidentStatus = currentStatus;
      currentStatus = body.action === "close" ? "closed" : "investigating";
      currentRevision += 1;
      timeline.push({
        schemaVersion: 1,
        mode: "live",
        workspaceId: "github-user-7:fixture",
        projectId: "github-123",
        timelineId: `00000000-0000-5000-a000-${String(currentRevision + 20).padStart(12, "0")}`,
        incidentId: incidentId1,
        sequence: timeline.length + 1,
        revision: timeline.length + 1,
        incidentRevision: currentRevision,
        type: body.action === "close" ? "incident_closed" : "incident_opened",
        actorId: "github-user-7",
        actorType: "user",
        fromStatus: prevStatus,
        toStatus: currentStatus,
        summary:
          body.action === "close"
            ? `Investigation closed by github-user-7: ${body.reason}`
            : body.action === "reopen"
              ? `Investigation reopened by github-user-7: ${body.reason}`
              : `Investigation started by github-user-7: ${body.note ?? "Triage started"}`,
        metadata: { alertId, action: String(body.action), status: currentStatus },
        idempotencyKey: String(currentRevision).repeat(64).slice(0, 64),
        occurredAt: at,
        recordedAt: at,
        evidenceIds: [
          `telemetry:${sourceId}:00000000-0000-4000-8000-000000000011`,
        ],
        evidenceRefs: [],
      });
      return route.fulfill({
        json: {
          incidentId: incidentId1,
          status: currentStatus,
          revision: currentRevision,
          verificationStatus: "not_requested",
        },
      });
    }
    if (u.searchParams.has("incidentId")) {
      return route.fulfill({
        json: {
          incident: makeIncident(1, currentStatus, currentRevision),
          alerts: [
            {
              schemaVersion: 1,
              mode: "live",
              workspaceId: "github-user-7:fixture",
              projectId: "github-123",
              alertId,
              ruleId,
              ruleVersion: 2,
              ruleName: "HTTP error burst 1",
              sourceId,
              category: "http",
              severity: "high",
              confidence: 80,
              origin: "controlled_test",
              correlationKey: "a".repeat(64),
              windowStart: at,
              windowEnd: "2026-11-15T00:05:00.000Z",
              firstObservedAt: at,
              lastObservedAt: at,
              detectedAt: at,
              matchedEventCount: 5,
              deduplicationKey: "b".repeat(64),
              suppressionStatus: "not_suppressed",
            },
          ],
          evidence: [
            {
              schemaVersion: 1,
              revision: 1,
              mode: "live",
              workspaceId: "github-user-7:fixture",
              projectId: "github-123",
              sourceId,
              ingestedAt: at,
              event: {
                schemaVersion: 1,
                eventId: "00000000-0000-4000-8000-000000000011",
                projectId: "github-123",
                occurredAt: at,
                kind: "http.request",
                request: { method: "GET", routeTemplate: "/api/:redacted", statusCode: 500 },
              },
              evidence: {
                id: `telemetry:${sourceId}:00000000-0000-4000-8000-000000000011`,
                sourceId,
                origin: "controlled_test",
                occurredAt: at,
                recordedAt: at,
              },
            },
          ],
          timeline,
        },
      });
    }
    const older = u.searchParams.has("cursor");
    return route.fulfill({
      json: {
        items: options.empty
          ? []
          : [
              makeIncident(
                older ? 2 : 1,
                older ? "open" : currentStatus,
                older ? 1 : currentRevision,
              ),
            ],
        nextCursor: older ? null : "fixture-incident-cursor",
        window: { from: at, to: at },
      },
    });
  });
  return writes;
}

test("incident list, filters, pagination, detail timeline and OPEN -> INVESTIGATING -> CLOSED -> REOPEN transitions use scoped API", async ({
  page,
}) => {
  const writes = await mockIncidents(page);
  await page.goto("/app/incident-fixture");
  await expect(
    page.getByRole("heading", { name: "HTTP error burst 1 (Controlled test)" }),
  ).toBeVisible();
  await expect(page.getByText("verification: not_requested")).toBeVisible();

  const filtered = page.waitForRequest(
    (r) =>
      r.url().includes("/incidents?") &&
      new URL(r.url()).searchParams.get("status") === "open",
  );
  await page.getByLabel("Incident status").selectOption("open");
  await filtered;

  await page.getByRole("button", { name: "Load older incidents" }).click();
  await expect(
    page.getByRole("heading", { name: "HTTP error burst 2 (Controlled test)" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Inspect incident" }).first().click();
  const detailRegion = page.getByRole("region", {
    name: "Incident investigation detail",
  });
  await expect(detailRegion).toContainText(incidentId1);
  await expect(detailRegion).toContainText(
    "Controlled-test evidence (not an observed attack)",
  );
  await expect(detailRegion).toContainText(
    "not_requested (no mitigation executed)",
  );

  const timelineRegion = page.getByRole("region", {
    name: "Investigation timeline",
  });
  await expect(timelineRegion).toContainText("#1 · alert_created");
  await expect(timelineRegion).toContainText("#2 · incident_opened");

  await page
    .getByLabel("Investigation note")
    .fill("Triage started on synthetic HTTP 500 burst.");
  await page.getByRole("button", { name: "Start investigation" }).click();
  await expect(timelineRegion).toContainText(
    "#3 · incident_opened (investigate)",
  );
  await expect(timelineRegion).toContainText("status: open → investigating");

  await page
    .getByLabel("Close reason")
    .fill("Confirmed synthetic acceptance probe; investigation complete.");
  await page.getByRole("button", { name: "Close incident" }).click();
  await expect(timelineRegion).toContainText("#4 · incident_closed (close)");
  await expect(timelineRegion).toContainText("status: investigating → closed");

  await page
    .getByLabel("Reopen reason")
    .fill("Reopening to verify additional correlated evidence.");
  await page.getByRole("button", { name: "Reopen investigation" }).click();
  await expect(timelineRegion).toContainText("#5 · incident_opened (reopen)");
  await expect(timelineRegion).toContainText("status: closed → investigating");

  expect(writes.map((w) => [w.action, w.expectedRevision])).toEqual([
    ["investigate", 1],
    ["close", 2],
    ["reopen", 3],
  ]);
});

test("empty, 503 and 404 states never fabricate incidents or leak unauthorized details", async ({
  page,
}) => {
  await mockIncidents(page, { empty: true });
  await page.goto("/app/incident-fixture");
  await expect(
    page.getByRole("heading", { name: "No persisted incidents" }),
  ).toBeVisible();

  await page.unroute("**/api/sentinel/**");
  await mockIncidents(page, { error: 503 });
  await page.reload();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "not configured",
  );
  await expect(
    page.getByRole("button", { name: "Inspect incident" }),
  ).toHaveCount(0);

  await page.unroute("**/api/sentinel/**");
  await mockIncidents(page, { error: 404 });
  await page.reload();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "unavailable to your account",
  );
});

test("mobile detail layout stays within viewport and Orderly Demo incidents make zero live API calls", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockIncidents(page);
  await page.goto(`/app/incident-fixture?incidentId=${incidentId1}`);
  await expect(
    page.getByRole("region", { name: "Incident investigation detail" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);

  let liveApiCalls = 0;
  page.on("request", (r) => {
    if (r.url().includes("/api/sentinel/")) liveApiCalls++;
  });
  await page.goto("/app/projects/orderly-demo/sentinel/incidents");
  await expect(
    page.getByRole("heading", { name: "From signal to a clear outcome." }),
  ).toBeVisible();
  expect(liveApiCalls).toBe(0);
});

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("../../src/features/sentinel/server/telemetry-runtime", () => ({
  telemetryStore: vi.fn(),
}));
vi.mock("../../src/features/canvas/server/github-reader", () => ({
  canvasIdentity: vi.fn(),
  workspaceScope: () => "github-user-7:fixture",
}));
vi.mock("../../src/features/sentinel/server/project-context", () => ({
  authorizeSentinelProject: vi.fn(),
}));

import { NextRequest } from "next/server";
import { reportRoute } from "../../src/features/sentinel/server/report-http";
import { collectLiveReport } from "../../src/features/sentinel/reports/collect";
import {
  csvCell,
  integrationStatus,
  reportFilename,
  reportToCsv,
  type LiveReport,
} from "../../src/features/sentinel/reports/live-report";
import { futureGuardBridgePorts } from "../../src/features/sentinel/integrations";
import { canvasIdentity } from "../../src/features/canvas/server/github-reader";
import { authorizeSentinelProject } from "../../src/features/sentinel/server/project-context";
import { telemetryStore } from "../../src/features/sentinel/server/telemetry-runtime";
import { AuthError } from "../../src/lib/auth/config";
import { PlatformDatabase } from "../../src/platform/database";
import { TelemetryStore } from "../../src/features/sentinel/telemetry/store";
import { ResponseStore } from "../../src/features/sentinel/response/store";
import { NotificationStore } from "../../src/features/sentinel/notifications/store";
import { GhostStore } from "../../src/features/sentinel/ghost/store";
import { IntelligenceStore } from "../../src/features/sentinel/intelligence/store";
import { ExternalService } from "../../src/features/sentinel/external/service";
import { RecordingClient, fakePool } from "../platform/helpers";
import { context } from "./detection-fixtures";

const SECRET_DESTINATION = "owner-secret@example.test";
const ACTOR = "github-user-7-secret-actor";
function db(respond?: RecordingClient["respond"]) {
  const client = new RecordingClient();
  if (respond) client.respond = respond;
  return { db: new PlatformDatabase(fakePool(client)), client };
}
function stubStores(overrides: Partial<Record<string, unknown>> = {}) {
  vi.spyOn(TelemetryStore.prototype, "sources").mockResolvedValue([
    {
      sourceId: "s1",
      name: "=HYPERLINK(evil)",
      origin: "runtime",
      environment: "production",
      status: "connected",
      lastContactAt: "2026-11-19T00:00:00.000Z",
      lastIngestedAt: "2026-11-19T00:00:00.000Z",
      workspaceId: "github-user-7:fixture",
      enabled: true,
    },
  ] as never);
  vi.spyOn(ResponseStore.prototype, "list").mockResolvedValue([
    { status: "applied", proposedBy: ACTOR, approvedBy: ACTOR },
    { status: "verified", proposedBy: ACTOR, approvedBy: ACTOR },
    { status: "verification_pending", proposedBy: ACTOR },
  ] as never);
  vi.spyOn(NotificationStore.prototype, "channels").mockResolvedValue([
    {
      channel: "telegram",
      enabled: true,
      available: true,
      consentAt: "2026-11-18T00:00:00Z",
      destinationMasked: "ow***",
      destinationVerified: true,
      destination: SECRET_DESTINATION,
    },
  ] as never);
  vi.spyOn(NotificationStore.prototype, "deliveries").mockResolvedValue([
    {
      state: "provider_accepted",
      providerAcceptedAt: "2026-11-19T00:00:00Z",
      deliveredAt: null,
      deadLetter: false,
      providerMessageId: "provider-secret-id",
      subjectRef: "incident:secret",
    },
    {
      state: "delivered",
      providerAcceptedAt: "2026-11-19T00:00:00Z",
      deliveredAt: "2026-11-19T00:00:01Z",
      deadLetter: false,
      providerMessageId: "provider-secret-id-2",
    },
  ] as never);
  vi.spyOn(GhostStore.prototype, "overview").mockResolvedValue({
    decoys: [{ enabled: true, origin: "controlled_test", targetRef: "secret" }],
    ruleStatus: "ENABLED",
    hits: [{ event: { actorHash: "h" } }],
    alerts: [],
    incidents: [],
    falsePositivePolicy: "A decoy hit is a signal, not proof.",
  } as never);
  vi.spyOn(IntelligenceStore.prototype, "overview").mockResolvedValue({
    cases: [{}, {}],
    groups: [{}],
    candidates: [{ reviewStatus: "DRAFT" }],
  } as never);
  vi.spyOn(ExternalService.prototype, "overview").mockResolvedValue({
    sources: [
      {
        provider: "cisa_kev",
        status: "ok",
        freshness: "stale",
        lastSuccessAt: null,
        officialUrl: "https://x",
      },
    ],
    catalog: { advisories: 3, kev: 1, withdrawn: 0 },
    inventory: { snapshot: null, expired: false },
  } as never);
  vi.spyOn(ExternalService.prototype, "exposures").mockResolvedValue({
    assessment: "cannot_assess",
    reason: "no_inventory",
    exposures: [],
    truncated: false,
    disclaimer: "Not proof of deployment.",
    ...overrides,
  } as never);
}
const respondAggregates: RecordingClient["respond"] = async (sql) => {
  if (sql.includes("FROM sentinel.telemetry_events"))
    return {
      rows: [
        { kind: "http.request", origin: "runtime", n: 4 },
        { kind: "auth.failed", origin: "controlled_test", n: 2 },
      ],
      rowCount: 2,
    };
  if (sql.includes("FROM sentinel.detection_alerts"))
    return {
      rows: [{ severity: "high", origin: "runtime", n: 1 }],
      rowCount: 1,
    };
  if (sql.includes("FROM sentinel.incidents"))
    return {
      rows: [{ status: "open", severity: "high", origin: "runtime", n: 1 }],
      rowCount: 1,
    };
  return { rows: [], rowCount: 0 };
};

beforeEach(() => {
  vi.restoreAllMocks();
  vi.mocked(canvasIdentity)
    .mockReset()
    .mockResolvedValue({ profile: { githubId: 7 } } as never);
  vi.mocked(authorizeSentinelProject).mockReset().mockResolvedValue(context);
});

describe("S10 live report builder", () => {
  it("aggregates real module reads, scopes SQL, and keeps applied distinct from verified", async () => {
    stubStores();
    const { db: database, client } = db(respondAggregates);
    const report = await collectLiveReport(
      database,
      context,
      7,
      new Date("2026-11-19T01:00:00Z"),
    );
    expect(report).toMatchObject({
      mode: "live",
      synthetic: false,
      scope: { projectId: "github-123" },
      windowDays: 7,
    });
    const r = report.sections.responses;
    expect(r.state === "ok" && r.data).toMatchObject({
      independentlyVerified: 1,
      appliedNotVerified: 2,
    });
    const t = report.sections.telemetry;
    expect(t.state === "ok" && t.data.events).toMatchObject({
      total: 6,
      byOrigin: { runtime: 4, controlled_test: 2 },
    });
    const n = report.sections.notifications;
    expect(n.state === "ok" && n.data.deliveries).toMatchObject({
      providerAccepted: 2,
      delivered: 1,
    });
    // single shared aggregate transaction, each query scope-bound with the window as the 4th parameter
    const aggregate = client.calls.filter((c) =>
      c.sql.includes("make_interval"),
    );
    expect(aggregate).toHaveLength(3);
    for (const c of aggregate)
      expect(c.values).toEqual([
        "live",
        context.scope.workspaceId,
        context.scope.projectId,
        7,
      ]);
  });

  it("never copies destinations, actor ids, provider ids, subject refs, target refs or event payloads", async () => {
    stubStores();
    const report = await collectLiveReport(
      db(respondAggregates).db,
      context,
      7,
    );
    const text = JSON.stringify(report) + reportToCsv(report);
    for (const secret of [
      SECRET_DESTINATION,
      ACTOR,
      "provider-secret-id",
      "incident:secret",
      "actorHash",
      "targetRef",
      "github-user-7:fixture",
    ])
      expect(text).not.toContain(secret);
  });

  it("marks failing producers unavailable/not_configured instead of reporting empty success", async () => {
    stubStores();
    vi.spyOn(ResponseStore.prototype, "list").mockRejectedValue(
      Object.assign(new Error("x"), { code: "42P01" }),
    );
    vi.spyOn(GhostStore.prototype, "overview").mockRejectedValue(
      new Error("db"),
    );
    const report = await collectLiveReport(
      db(respondAggregates).db,
      context,
      7,
    );
    expect(report.sections.responses.state).toBe("not_configured");
    expect(report.sections.ghost.state).toBe("unavailable");
    expect(report.sections.telemetry.state).toBe("ok");
  });

  it("an aggregate failure never turns incidents/alerts into zero counts", async () => {
    stubStores();
    const report = await collectLiveReport(
      db(async () => {
        throw new Error("boom");
      }).db,
      context,
      1,
    );
    for (const k of ["telemetry", "detection", "incidents"] as const)
      expect(report.sections[k].state).toBe("unavailable");
  });

  it("states GRD-020/021 as not_integrated and that status tracks the real ports", async () => {
    expect(integrationStatus.guardInventory).toMatchObject({
      id: "GRD-020",
      status: "not_integrated",
    });
    expect(integrationStatus.guardPipeline).toMatchObject({
      id: "GRD-021",
      status: "not_integrated",
    });
    const grant = {
      ...context.scope,
      actorId: "a",
      operations: ["read" as const],
      expiresAt: Date.now() + 60000,
    };
    await expect(
      futureGuardBridgePorts.pipeline.publish(
        grant as never,
        context.scope,
        {} as never,
      ),
    ).resolves.toMatchObject({
      status: "not_integrated",
      backlogId: "GRD-021",
    });
    await expect(
      futureGuardBridgePorts.inventory.publish(
        grant as never,
        context.scope,
        "a".repeat(40),
        [],
      ),
    ).resolves.toMatchObject({
      status: "not_integrated",
      backlogId: "GRD-020",
    });
  });

  it("includes the honest limitations", async () => {
    stubStores();
    const report = await collectLiveReport(
      db(respondAggregates).db,
      context,
      7,
    );
    const text = report.limitations.join(" ");
    for (const phrase of [
      "not evidence of safety",
      "independent verifier",
      "not confirmed delivery",
      "not proof of a successful attack",
      "not observed exploitation",
    ])
      expect(text).toContain(phrase);
  });
});

describe("S10 CSV export safety", () => {
  it.each(["=1+1", "+1", "-1", "@SUM(A1)", "\tx", "\rx"])(
    "neutralizes formula prefix %j",
    (value) => {
      expect(csvCell(value)).toBe(`"'${value}"`);
    },
  );
  it("quotes and escapes embedded quotes and newlines", () => {
    expect(csvCell('a"b\nc')).toBe('"a""b\nc"');
    expect(csvCell(null)).toBe('""');
  });
  it("no exported cell can start with a formula character", async () => {
    stubStores();
    const csv = reportToCsv(
      await collectLiveReport(db(respondAggregates).db, context, 7),
    );
    for (const line of csv.trim().split("\r\n"))
      for (const cell of line.match(/"(?:[^"]|"")*"/g)!)
        expect(cell.slice(1, 2)).not.toMatch(/[=+\-@\t\r]/);
    expect(csv).toContain("'=HYPERLINK");
  });
  it("builds a safe filename", () => {
    expect(reportFilename("github-123", "2026-11-19T01:00:00Z", "csv")).toBe(
      "wetscan-sentinel-report-github-123-2026-11-19.csv",
    );
    expect(
      reportFilename('github-1"../x', "2026-11-19T01:00:00Z", "json"),
    ).not.toMatch(/["/.]\./);
  });
});

describe("S10 report route", () => {
  const req = (q = "") =>
    new NextRequest(
      "http://localhost:3000/api/sentinel/projects/github-123/report" + q,
    );
  beforeEach(() => {
    stubStores();
    vi.mocked(telemetryStore)
      .mockReset()
      .mockResolvedValue({ db: db(respondAggregates).db } as never);
  });
  it("returns inline live JSON with private no-store headers", async () => {
    const r = await reportRoute(req(), "github-123");
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toBe("private, no-store");
    expect(r.headers.get("content-disposition")).toBeNull();
    expect(await r.json()).toMatchObject({
      kind: "wetscan.sentinel.live_report",
      synthetic: false,
    });
  });
  it("exports CSV and JSON as attachments with safe content types", async () => {
    const csv = await reportRoute(
      req("?format=csv&download=1&days=30"),
      "github-123",
    );
    expect(csv.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(csv.headers.get("content-disposition")).toMatch(
      /^attachment; filename="wetscan-sentinel-report-github-123-\d{4}-\d\d-\d\d\.csv"$/,
    );
    expect(csv.headers.get("x-content-type-options")).toBe("nosniff");
    const json = await reportRoute(
      req("?format=json&download=1"),
      "github-123",
    );
    expect(json.headers.get("content-type")).toBe(
      "application/json; charset=utf-8",
    );
    expect(json.headers.get("content-disposition")).toContain("attachment");
  });
  it.each([
    "?days=2",
    "?days=abc",
    "?format=xlsx",
    "?download=yes",
    "?projectId=github-999",
    "?days=7&days=1",
    "?workspaceId=other",
  ])("rejects %s before authentication", async (q) => {
    expect((await reportRoute(req(q), "github-123")).status).toBe(400);
    expect(canvasIdentity).not.toHaveBeenCalled();
  });
  it.each(["orderly-demo", "github-0", "demo", "github-1/../x"])(
    "denies %s (404) before auth or storage",
    async (id) => {
      expect((await reportRoute(req(), id)).status).toBe(404);
      expect(canvasIdentity).not.toHaveBeenCalled();
      expect(telemetryStore).not.toHaveBeenCalled();
    },
  );
  it.each([401, 403, 404])(
    "denies auth status %i without reading storage",
    async (status) => {
      vi.mocked(canvasIdentity).mockRejectedValueOnce(
        new AuthError(
          status === 401 ? "unauthenticated" : ("repository_denied" as never),
          status,
        ),
      );
      expect((await reportRoute(req(), "github-123")).status).toBe(
        status === 401 ? 401 : 404,
      );
      expect(telemetryStore).not.toHaveBeenCalled();
    },
  );
  it("a revoked project (authorizeSentinelProject rejects) leaks nothing", async () => {
    vi.mocked(authorizeSentinelProject).mockRejectedValueOnce(
      new AuthError("repository_denied", 403),
    );
    const r = await reportRoute(req(), "github-123");
    expect(r.status).toBe(404);
    expect(telemetryStore).not.toHaveBeenCalled();
    expect(JSON.stringify(await r.json())).not.toMatch(/incident|evidence/i);
  });
  it("only ever reads the authorized project's scope", async () => {
    await reportRoute(req("?days=1"), "github-123");
    expect(authorizeSentinelProject).toHaveBeenCalledWith(undefined, {
      mode: "live",
      workspaceId: "github-user-7:fixture",
      projectId: "github-123",
    });
  });
  it("rejects non-GET", async () => {
    const r = await reportRoute(
      new NextRequest(
        "http://localhost:3000/api/sentinel/projects/github-123/report",
        { method: "POST" },
      ),
      "github-123",
    );
    expect(r.status).toBe(405);
  });
});

export type { LiveReport };

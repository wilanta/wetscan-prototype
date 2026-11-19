import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CanvasOverlayStore } from "../../src/features/sentinel/canvas/overlay-store";
import { buildSentinelOverlay } from "../../src/features/sentinel/canvas/mapping";
import { collectLiveReport } from "../../src/features/sentinel/reports/collect";
import { reportToCsv } from "../../src/features/sentinel/reports/live-report";
import type { ArchitectureGraph } from "../../src/features/canvas/types";
import {
  ctx,
  setupIntelHarness,
  type IntelHarness,
} from "./intelligence-pg-harness";

const hasPg = Boolean(
  process.env.SENTINEL_S08_PG_ADMIN_URL ||
  process.env.SENTINEL_S07_PG_ADMIN_URL ||
  process.env.SENTINEL_S05_PG_ADMIN_URL,
);
const A = ctx(10, "github-user-10:s10", "910001");
const A2 = ctx(10, "github-user-10:s10", "910002"); // same workspace, other project
const B = ctx(11, "github-user-11:s10", "910003"); // other workspace
const graph: Pick<ArchitectureGraph, "nodes" | "revision"> = {
  revision: "a".repeat(40),
  nodes: [
    {
      id: "orders",
      kind: "api",
      label: "/api/orders/[id]",
      evidenceIds: [],
      origin: "verified",
      status: "observed_in_source",
      metadata: { route: "/api/orders/[id]", methods: "GET, PATCH" },
    },
  ],
};
const orders = {
  request: {
    method: "GET",
    routeTemplate: "/api/orders/:redacted",
    statusCode: 401,
  },
};

describe.skipIf(!hasPg)(
  "S10 CAN-008 overlay + live report: PostgreSQL acceptance (disposable DB, forced RLS)",
  () => {
    let h: IntelHarness;
    let srcA: string, srcAT: string, srcA2: string, srcB: string;
    let ruleA: string, ruleA2: string, ruleB: string;
    let routed: string,
      decoy: string,
      closed: string,
      otherProject: string,
      otherWorkspace: string;

    beforeAll(async () => {
      h = await setupIntelHarness();
      srcA = await h.source(A);
      srcAT = await h.source(A, "controlled_test");
      srcA2 = await h.source(A2);
      srcB = await h.source(B);
      ruleA = (await h.rule(A)).ruleId;
      ruleA2 = (await h.rule(A2)).ruleId;
      ruleB = (await h.rule(B)).ruleId;
      const recent = new Date(Date.now() - 3600_000).toISOString();
      const seed = async (
        c: typeof A,
        sourceId: string,
        ruleId: string,
        extra: Partial<Parameters<IntelHarness["incident"]>[1]> = {},
      ) =>
        (
          await h.incident(c, {
            sourceId,
            ruleId,
            firstAt: recent,
            events: [orders],
            ...extra,
          })
        ).incidentId;
      routed = await seed(A, srcA, ruleA, { severity: "high" });
      decoy = await seed(A, srcAT, ruleA, {
        origin: "controlled_test",
        category: "decoy",
        events: [
          {
            request: {
              method: "GET",
              routeTemplate: "/.well-known/ghost-decoy",
              statusCode: 200,
            },
          },
        ],
      });
      closed = await seed(A, srcA, ruleA, { status: "closed" });
      otherProject = await seed(A2, srcA2, ruleA2);
      otherWorkspace = await seed(B, srcB, ruleB);
    });
    afterAll(async () => {
      await h?.close();
    });

    it("returns only this project's OPEN incidents with route evidence (closed, other project, other workspace excluded)", async () => {
      const r = await new CanvasOverlayStore(h.app).openIncidents(A);
      const ids = r.incidents.map((i) => i.incidentId).sort();
      expect(ids).toEqual([routed, decoy].sort());
      expect(ids).not.toContain(closed);
      expect(ids).not.toContain(otherProject);
      expect(ids).not.toContain(otherWorkspace);
      expect(r.truncated).toBe(false);
      const row = r.incidents.find((i) => i.incidentId === routed)!;
      expect(row.evidence).toHaveLength(1);
      expect(row.evidence[0]).toMatchObject({
        routeTemplate: "/api/orders/:redacted",
        method: "GET",
        origin: "runtime",
      });
      expect(
        r.incidents.find((i) => i.incidentId === decoy)!.evidence[0].origin,
      ).toBe("controlled_test");
    });

    it("each scope sees only its own rows (forced RLS)", async () => {
      const store = new CanvasOverlayStore(h.app);
      expect(
        (await store.openIncidents(A2)).incidents.map((i) => i.incidentId),
      ).toEqual([otherProject]);
      expect(
        (await store.openIncidents(B)).incidents.map((i) => i.incidentId),
      ).toEqual([otherWorkspace]);
    });

    it("maps the routed incident to the API node, leaves the decoy unmapped, and never claims monitoring for sources that never made contact", async () => {
      const { incidents, truncated } = await new CanvasOverlayStore(
        h.app,
      ).openIncidents(A);
      const sources = await h.telemetry.sources(A);
      const overlay = buildSentinelOverlay({
        graph,
        projectRef: A.canvasProjectRef,
        projectId: A.scope.projectId,
        now: new Date().toISOString(),
        incidents,
        truncated,
        sources: sources.map((s) => ({
          status: s.status,
          origin: s.origin,
          enabled: s.enabled,
        })),
      });
      expect(overlay.incidents.map((i) => i.id)).toEqual([routed]);
      expect(overlay.incidents[0]).toMatchObject({
        nodeId: "orders",
        simulated: false,
      });
      expect(overlay.sentinelDetail!.unmapped.map((u) => u.id)).toEqual([
        decoy,
      ]);
      expect(overlay.sentinel).toBe("not_monitored");
    });

    it("is read-only: building the overlay changes no rows", async () => {
      const count = async () =>
        (
          await h.admin.query(
            "SELECT (SELECT count(*) FROM sentinel.incidents)+(SELECT count(*) FROM sentinel.telemetry_events)+(SELECT count(*) FROM sentinel.incident_evidence) AS n",
          )
        ).rows[0].n;
      const before = await count();
      await new CanvasOverlayStore(h.app).openIncidents(A);
      expect(await count()).toBe(before);
    });

    it("live report: real aggregates by origin, window-bound, cross-project isolated, every module readable", async () => {
      await h.incident(A, {
        sourceId: srcA,
        ruleId: ruleA,
        firstAt: new Date(Date.now() - 10 * 86400_000).toISOString(),
        events: [orders],
      });
      const day = await collectLiveReport(h.app, A, 1);
      const month = await collectLiveReport(h.app, A, 30);
      for (const k of Object.keys(day.sections) as (keyof typeof day.sections)[])
        expect(day.sections[k].state, k).toBe("ok");
      const ev = (r: typeof day) =>
        r.sections.telemetry.state === "ok"
          ? r.sections.telemetry.data.events
          : null;
      expect(ev(day)!.total).toBe(3); // routed + decoy + closed (this project, last 24h)
      expect(ev(day)!.byOrigin).toEqual({ runtime: 2, controlled_test: 1 });
      expect(ev(month)!.total).toBe(4); // + the 10-day-old event
      const inc = day.sections.incidents;
      expect(inc.state === "ok" && inc.data.total).toBe(3);
      expect(inc.state === "ok" && inc.data.byStatus).toEqual({
        open: 2,
        closed: 1,
      });
      expect(inc.state === "ok" && inc.data.byOrigin).toEqual({
        runtime: 2,
        controlled_test: 1,
      });
      // Other project / workspace data never appears in A's totals.
      expect(ev(await collectLiveReport(h.app, B, 1))!.total).toBe(1);
      expect(day.integrations.guardInventory.status).toBe("not_integrated");
      expect(day.integrations.guardPipeline.status).toBe("not_integrated");
      const text = JSON.stringify(day) + reportToCsv(day);
      expect(text).not.toContain(A.actorId);
      expect(text).not.toContain(A.scope.workspaceId);
      // No inventory collected: cannot assess, never a clean "no match".
      const ext = day.sections.externalIntelligence;
      expect(ext.state === "ok" && ext.data.exposure.assessment).toBe(
        "cannot_assess",
      );
      const tel = day.sections.telemetry;
      expect(
        tel.state === "ok" && tel.data.sourceStatusCounts.connected,
      ).toBeUndefined();
    });

    it("an unscoped wetscan_app connection cannot read any incident (forced RLS)", async () => {
      const client = await h.appPool.connect();
      try {
        const r = await client.query(
          "SELECT count(*)::int AS n FROM sentinel.incidents",
        );
        expect(r.rows[0].n).toBe(0);
      } finally {
        client.release();
      }
    });
  },
);

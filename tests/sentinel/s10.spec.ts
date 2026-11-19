import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdirSync } from "node:fs";
import {
  S10_PROJECT_REF,
  S10_REVISION,
  s10ApiNodeId,
} from "../canvas/fixture/s10-graph";

const at = "2026-11-19T01:00:00.000Z";
const incidentId = "00000000-0000-4000-8000-0000000000c1";
const incident2 = "00000000-0000-4000-8000-0000000000c2";
const shots = "test-results/sentinel-s10";
mkdirSync(shots, { recursive: true });

type Sec =
  | { state: "ok"; asOf: string; data: unknown }
  | { state: string; asOf: string };
const ok = (data: unknown): Sec => ({ state: "ok", asOf: at, data });
function report(over: Record<string, Sec> = {}, days = 7) {
  return {
    schemaVersion: 1,
    kind: "wetscan.sentinel.live_report",
    mode: "live",
    synthetic: false,
    generatedAt: at,
    scope: { projectId: "github-123" },
    windowDays: days,
    sections: {
      telemetry: ok({
        sources: [
          {
            sourceId: "s1",
            name: "Runtime API",
            origin: "runtime",
            environment: "production",
            status: "connected",
            lastContactAt: at,
            lastIngestedAt: at,
          },
          {
            sourceId: "s2",
            name: "Local test",
            origin: "controlled_test",
            environment: "local",
            status: "stale",
            lastContactAt: at,
            lastIngestedAt: at,
          },
        ],
        sourceStatusCounts: { connected: 1, stale: 1 },
        events: {
          total: 12,
          byKind: { "http.request": 12 },
          byOrigin: { runtime: 9, controlled_test: 3 },
        },
      }),
      detection: ok({
        alerts: { total: 2, bySeverity: { high: 2 }, byOrigin: { runtime: 2 } },
      }),
      incidents: ok({
        total: 1,
        byStatus: { open: 1 },
        bySeverity: { high: 1 },
        byOrigin: { runtime: 1 },
        note: "Closing an incident ends the investigation workflow only; it does not verify mitigation.",
      }),
      responses: ok({
        total: 3,
        byStatus: { applied: 1, verified: 1, verification_pending: 1 },
        independentlyVerified: 1,
        appliedNotVerified: 2,
        note: "Most recent 50 actions.",
      }),
      notifications: ok({
        channels: [
          {
            channel: "telegram",
            enabled: true,
            available: true,
            consentRecorded: true,
            destinationVerified: false,
          },
        ],
        deliveries: {
          total: 4,
          byState: { provider_accepted: 3, delivered: 1 },
          providerAccepted: 4,
          delivered: 1,
          deadLetters: 0,
        },
        note: "Provider acceptance is not confirmed delivery or reading.",
      }),
      ghost: ok({
        decoys: { total: 1, enabled: 1, byOrigin: { controlled_test: 1 } },
        ruleStatus: "ENABLED",
        hits: 2,
        alerts: 1,
        incidents: 0,
        note: "A decoy hit is a signal, not proof.",
      }),
      internalIntelligence: ok({
        cases: 2,
        groups: 1,
        candidates: { total: 1, byReviewStatus: { DRAFT: 1 } },
        note: "Candidates are DRAFT.",
      }),
      externalIntelligence: ok({
        sources: [
          {
            provider: "cisa_kev",
            status: "ok",
            freshness: "fresh",
            lastSuccessAt: at,
          },
        ],
        catalog: { advisories: 10, kev: 2, withdrawn: 0 },
        inventory: {
          source: "repository_lockfile",
          commitSha: "b".repeat(40),
          collectedAt: at,
          itemCount: 120,
          expired: false,
        },
        exposure: {
          assessment: "potential_exposure",
          reason: null,
          items: [
            {
              advisory: "GHSA-xxxx",
              ecosystem: "npm",
              package: "lodash",
              version: "4.17.0",
              kev: false,
              severity: "high",
              conflicting: false,
            },
          ],
          truncated: false,
        },
        note: "Not proof of deployment.",
      }),
      ...over,
    },
    integrations: {
      canvas: {
        id: "CAN-008",
        status: "implemented",
        detail: "Incidents are placed only on route evidence.",
      },
      guardInventory: {
        id: "GRD-020",
        status: "not_integrated",
        detail: "No Guard inventory producer.",
      },
      guardPipeline: {
        id: "GRD-021",
        status: "not_integrated",
        detail: "No Guard pipeline producer.",
      },
    },
    limitations: [
      "Counts cover only telemetry that authorized sources actually delivered; absence of events or incidents is not evidence of safety.",
    ],
  };
}
async function mockReport(
  page: Page,
  build = (days: number) => report({}, days),
) {
  const seen: string[] = [];
  await page.route(
    "**/api/sentinel/projects/github-123/report**",
    async (route) => {
      const url = new URL(route.request().url());
      seen.push(url.search);
      await route.fulfill({
        contentType: "application/json",
        json: build(Number(url.searchParams.get("days") ?? 7)),
      });
    },
  );
  return seen;
}
function overlay(over: Record<string, unknown> = {}) {
  return {
    projectRef: S10_PROJECT_REF,
    mode: "live",
    guard: "not_scanned",
    sentinel: "available",
    findings: [],
    incidents: [
      {
        id: incidentId,
        nodeId: s10ApiNodeId(),
        title: "Repeated failed logins",
        status: "open",
        href: `/app/projects/github-123/sentinel/incidents/${incidentId}`,
        simulated: false,
        provenance: {
          origin: "runtime",
          sourceId: "s1",
          severity: "high",
          firstObservedAt: at,
          lastObservedAt: at,
          evidenceIds: ["telemetry:s1:e1"],
          mapping: {
            basis: "route_redacted_segments",
            routes: ["/api/orders/:redacted"],
          },
        },
      },
    ],
    message: "Connected sources are reporting. This is not proof of safety.",
    sentinelDetail: {
      sourceRevision: S10_REVISION,
      generatedAt: at,
      sources: { total: 2, connected: 1, runtimeConnected: 1 },
      mappedCount: 1,
      unmapped: [
        {
          id: incident2,
          title: "Decoy probe",
          status: "open",
          reason: "no_matching_node",
          href: `/app/projects/github-123/sentinel/incidents/${incident2}`,
        },
      ],
      unmappedCount: 1,
      truncated: false,
    },
    ...over,
  };
}
async function mockCanvas(
  page: Page,
  respond: () => { status: number; json: unknown },
) {
  await page.route("**/api/canvas/github-123**", (route) =>
    route.fulfill({
      contentType: "application/json",
      json: { state: "up_to_date", revision: S10_REVISION },
    }),
  );
  const calls: string[] = [];
  await page.route("**/api/sentinel/projects/github-123/canvas**", (route) => {
    calls.push(route.request().url());
    const r = respond();
    return route.fulfill({
      status: r.status,
      contentType: "application/json",
      json: r.json,
    });
  });
  return calls;
}
const tabs = [
  "Overview",
  "Event Explorer",
  "Telemetry sources",
  "Detection Rules",
  "Alerts",
  "Incidents",
  "Responses",
  "Notifications",
  "Ghost",
  "Intelligence",
  "Reports",
  "Canvas security",
];
async function overflow(page: Page) {
  return page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
}

test.describe("S10 live Sentinel integration (mocked transport, no database)", () => {
  test("Overview shows evidence-backed summaries and one consistent navigation with the active tab highlighted", async ({
    page,
  }) => {
    await mockReport(page);
    await page.goto("/app/projects/github-123/sentinel");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "What Sentinel can see",
    );
    const nav = page.getByRole("navigation", {
      name: "Sentinel live sections",
    });
    for (const label of tabs)
      await expect(
        nav.getByRole("link", { name: label, exact: true }),
      ).toBeVisible();
    await expect(
      nav.getByRole("link", { name: "Overview", exact: true }),
    ).toHaveAttribute("aria-current", "page");
    await expect(
      nav.getByRole("link", { name: "Overview", exact: true }),
    ).toHaveClass(/active/);
    await expect(
      page.getByText("Applied / pending · NOT verified"),
    ).toBeVisible();
    await expect(page.getByText("Independently verified")).toBeVisible();
    await expect(
      page.getByText("Provider accepted", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Delivery confirmed")).toBeVisible();
    await expect(
      page.getByText("Declared-dependency context, not observed exploitation."),
    ).toBeVisible();
    // GRD-020/021 are honestly not integrated, CAN-008 is implemented.
    const integrations = page.getByRole("table");
    await expect(integrations).toContainText("GRD-020");
    await expect(integrations).toContainText("not integrated");
    await expect(page.locator(".topbar-actions")).toContainText(
      "GitHub source",
    );
    await page.screenshot({
      path: `${shots}/overview-1440.png`,
      fullPage: true,
    });
  });

  test("a project with no connected source never looks safe", async ({
    page,
  }) => {
    await mockReport(page, (d) =>
      report(
        {
          telemetry: ok({
            sources: [],
            sourceStatusCounts: {},
            events: { total: 0, byKind: {}, byOrigin: {} },
          }),
        },
        d,
      ),
    );
    await page.goto("/app/projects/github-123/sentinel");
    await expect(
      page.getByText(/No telemetry source is currently connected/),
    ).toBeVisible();
    await expect(
      page.getByText(/does not mean this application is safe/),
    ).toBeVisible();
    await expect(
      page.getByText("Runtime traffic is not monitored."),
    ).toBeVisible();
  });

  test("an unreadable or unconfigured module is never rendered as healthy or empty", async ({
    page,
  }) => {
    await mockReport(page, (d) =>
      report(
        {
          responses: { state: "not_configured", asOf: at },
          ghost: { state: "unavailable", asOf: at },
        },
        d,
      ),
    );
    await page.goto("/app/projects/github-123/sentinel");
    await expect(
      page.getByText(/Not configured: this module's storage is not set up/),
    ).toBeVisible();
    await expect(
      page.getByText(/Unavailable: this module could not be read/),
    ).toBeVisible();
    await expect(page.getByText("Independently verified")).toHaveCount(0);
  });

  test("a failed summary shows an alert with retry and no stale figures", async ({
    page,
  }) => {
    let failing = true; // React StrictMode runs the fetch effect twice in dev, so key on state, not call count.
    await page.route("**/api/sentinel/projects/github-123/report**", (route) =>
      failing
        ? route.fulfill({
            status: 503,
            contentType: "application/json",
            json: { error: "telemetry_not_configured" },
          })
        : route.fulfill({ contentType: "application/json", json: report() }),
    );
    await page.goto("/app/projects/github-123/sentinel");
    await expect(page.locator("main [role=alert]")).toContainText(
      "not configured or is temporarily unavailable",
    );
    await expect(page.getByText("Sources connected")).toHaveCount(0);
    failing = false;
    await page.getByRole("button", { name: "Retry" }).click();
    await expect(page.getByText("Sources connected")).toBeVisible();
  });

  test("a response for another project is rejected, not displayed", async ({
    page,
  }) => {
    await mockReport(page, (d) => ({
      ...report({}, d),
      scope: { projectId: "github-999" },
    }));
    await page.goto("/app/projects/github-123/sentinel");
    await expect(page.locator("main [role=alert]")).toContainText(
      "did not match this project",
    );
  });

  test("Reports: provenance, limitations, window filter and authorized export links", async ({
    page,
  }) => {
    const seen = await mockReport(page);
    await page.goto("/app/projects/github-123/sentinel/reports");
    await expect(page.getByText("LIVE · not synthetic")).toBeVisible();
    await expect(page.getByText(/evidence of safety/)).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Download CSV" }),
    ).toHaveAttribute(
      "href",
      "/api/sentinel/projects/github-123/report?format=csv&download=1&days=7",
    );
    await expect(
      page.getByRole("link", { name: "Download JSON" }),
    ).toHaveAttribute(
      "href",
      "/api/sentinel/projects/github-123/report?format=json&download=1&days=7",
    );
    await page.getByLabel("Report time window").selectOption("30");
    await expect(
      page.getByRole("link", { name: "Download CSV" }),
    ).toHaveAttribute("href", /days=30/);
    await expect.poll(() => seen.some((s) => s.includes("days=30"))).toBe(true);
    await expect(
      page
        .getByRole("navigation", { name: "Sentinel live sections" })
        .getByRole("link", { name: "Reports" }),
    ).toHaveAttribute("aria-current", "page");
    await page.screenshot({
      path: `${shots}/reports-1440.png`,
      fullPage: true,
    });
  });

  test("print view hides navigation chrome", async ({ page }) => {
    await mockReport(page);
    await page.goto("/app/projects/github-123/sentinel/reports");
    await expect(page.getByText("LIVE · not synthetic")).toBeVisible();
    await page.emulateMedia({ media: "print" });
    await expect(page.locator(".sidebar")).toBeHidden();
    await expect(
      page.getByRole("navigation", { name: "Sentinel live sections" }),
    ).toBeHidden();
    await expect(
      page.getByRole("heading", { name: "Limitations" }),
    ).toBeVisible();
  });

  test("sidebar and topbar are project-aware: live modules, no demo links, no demo preview count, no demo reset", async ({
    page,
  }) => {
    await mockReport(page);
    await page.goto("/app/projects/github-123/sentinel/reports");
    const side = page.locator(".sidebar");
    const children = side.locator(".nav-children");
    for (const label of ["Incidents", "Responses", "Ghost", "Intelligence"])
      await expect(children.getByRole("link", { name: label })).toBeVisible();
    const reports = side.getByRole("link", { name: "Reports", exact: true });
    await expect(reports).toHaveAttribute(
      "href",
      "/app/projects/github-123/sentinel/reports",
    );
    await expect(reports).toHaveClass(/active/);
    await expect(
      side.getByRole("link", { name: "Notifications", exact: true }),
    ).toHaveAttribute(
      "href",
      "/app/projects/github-123/sentinel/notifications",
    );
    await expect(
      side.getByRole("link", { name: /Integrations/ }),
    ).toContainText("DEMO");
    await expect(
      page.getByRole("link", { name: "Notifications", exact: true }).last(),
    ).toBeVisible();
    await expect(page.locator(".topbar a.notification-icon")).toHaveAttribute(
      "href",
      "/app/projects/github-123/sentinel/notifications",
    );
    await expect(page.locator(".topbar a.notification-icon")).toHaveAttribute(
      "aria-label",
      "Notifications",
    );
    await expect(page.getByRole("button", { name: "Reset demo" })).toHaveCount(
      0,
    );
  });
});

test.describe("S10 CAN-008 Canvas overlay (real LiveCanvas, mocked transport)", () => {
  async function openSecurity(page: Page) {
    await page.goto("/app/projects/github-123/canvas");
    await expect(page.locator(".component-explorer")).toBeVisible();
    await page.getByRole("button", { name: "Security", exact: true }).click();
    return page.getByRole("region", { name: "Security coverage" });
  }
  test("shows a mapped incident with provenance, a real link, and lists unmapped incidents as not placed", async ({
    page,
  }) => {
    const calls = await mockCanvas(page, () => ({
      status: 200,
      json: overlay(),
    }));
    const security = await openSecurity(page);
    await expect(security).toContainText("Sentinel: Sources reporting");
    await expect(security).toContainText("Repeated failed logins");
    await expect(security).toContainText("runtime");
    await expect(security).toContainText("Incidents not placed on this graph");
    await expect(security).toContainText("Decoy probe");
    await expect(security).toContainText(
      "No source-observed API node matches its route",
    );
    expect(calls.every((c) => c.includes(`revision=${S10_REVISION}`))).toBe(
      true,
    );
    // Select the mapped node: inspector shows provenance and links to the authorized incident.
    await security
      .getByRole("button", { name: /Repeated failed logins/ })
      .click();
    const inspector = page.locator(".inspector");
    await expect(inspector).toContainText("Runtime");
    await expect(inspector).toContainText("redacted segments (weaker)");
    await expect(
      inspector.getByRole("link", { name: "View incident evidence" }),
    ).toHaveAttribute(
      "href",
      `/app/projects/github-123/sentinel/incidents/${incidentId}`,
    );
    await expect(inspector).not.toContainText("simulated");
    await page.screenshot({
      path: `${shots}/canvas-security-1440.png`,
      fullPage: true,
    });
  });

  test("a node without a mapped incident never claims safety", async ({
    page,
  }) => {
    await mockCanvas(page, () => ({
      status: 200,
      json: overlay({
        incidents: [],
        sentinel: "partial",
        message: "Partial coverage",
      }),
    }));
    const security = await openSecurity(page);
    await expect(security).toContainText("Sentinel: Partial coverage");
    await page.locator(".component-list > button").first().click();
    await expect(page.locator(".inspector")).toContainText(
      /does not establish that it is safe/,
    );
  });

  for (const [state, label] of [
    ["stale", "Stale — last-known records"],
    ["not_monitored", "Monitoring not connected"],
    ["partial", "Partial coverage"],
  ] as const)
    test(`coverage ${state} is labelled honestly`, async ({ page }) => {
      await mockCanvas(page, () => ({
        status: 200,
        json: overlay({ sentinel: state, incidents: [] }),
      }));
      const security = await openSecurity(page);
      await expect(security).toContainText(`Sentinel: ${label}`);
    });

  test("a storage failure is shown as unavailable, never as a clean state, and the map stays usable", async ({
    page,
  }) => {
    await mockCanvas(page, () => ({
      status: 503,
      json: { error: "telemetry_unavailable" },
    }));
    const security = await openSecurity(page);
    await expect(security).toContainText("Security data unavailable");
    await expect(security).toContainText("Sentinel: Security data unavailable");
    await expect(page.locator(".component-explorer")).toBeVisible();
  });

  test("unconfigured Sentinel storage reads as monitoring not connected", async ({
    page,
  }) => {
    await mockCanvas(page, () => ({
      status: 503,
      json: { error: "telemetry_not_configured" },
    }));
    const security = await openSecurity(page);
    await expect(security).toContainText("Sentinel: Monitoring not connected");
    await expect(security).toContainText("Guard: Not yet scanned");
  });

  test("an overlay pinned to another revision is discarded as unavailable", async ({
    page,
  }) => {
    await mockCanvas(page, () => ({
      status: 200,
      json: overlay({
        sentinelDetail: {
          ...overlay().sentinelDetail,
          sourceRevision: "f".repeat(40),
        },
      }),
    }));
    const security = await openSecurity(page);
    await expect(security).toContainText("Security data unavailable");
    await expect(security).not.toContainText("Repeated failed logins");
  });

  test("an overlay for another project is discarded", async ({ page }) => {
    await mockCanvas(page, () => ({
      status: 200,
      json: overlay({ projectRef: "github-user-7/github-999" }),
    }));
    const security = await openSecurity(page);
    await expect(security).not.toContainText("Repeated failed logins");
  });
});

test.describe("S10-A1 Orderly Demo isolation and parity", () => {
  const demo = [
    "/app/projects/orderly-demo/sentinel",
    "/app/projects/orderly-demo/sentinel/activity",
    "/app/projects/orderly-demo/sentinel/incidents",
    "/app/projects/orderly-demo/sentinel/responses",
    "/app/projects/orderly-demo/sentinel/ghost",
    "/app/projects/orderly-demo/sentinel/intelligence",
    "/app/projects/orderly-demo/canvas",
    "/app/notifications",
    "/app/integrations",
    "/app/reports",
  ];
  test("demo routes issue zero Sentinel/Canvas live API calls and keep their original chrome", async ({
    page,
  }) => {
    const live: string[] = [];
    page.on("request", (r) => {
      const u = new URL(r.url());
      if (
        u.pathname.startsWith("/api/sentinel") ||
        u.pathname.startsWith("/api/canvas")
      )
        live.push(r.method() + " " + u.pathname);
    });
    for (const path of demo) {
      await page.goto(path);
      await expect(page.locator("main#main")).toBeVisible();
      await expect(page.locator(".topbar-actions")).toContainText("Demo mode");
    }
    await page.goto("/app/projects/orderly-demo/sentinel");
    await expect(
      page.getByRole("navigation", { name: "Sentinel sections" }),
    ).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "Sentinel live sections" }),
    ).toHaveCount(0);
    await expect(page.getByText(/Demo simulation only/)).toBeVisible();
    // Demo simulation runs entirely in the browser.
    await page
      .getByRole("button", { name: /Simulate suspicious request/ })
      .first()
      .click();
    expect(live).toEqual([]);
  });
  test("the demo sidebar keeps exactly Ghost and Intelligence under Sentinel and the demo Reports link", async ({
    page,
  }) => {
    await page.goto("/app/projects/orderly-demo/sentinel");
    const children = page.locator(".sidebar .nav-children a");
    await expect(children).toHaveText(["Ghost", "Intelligence"]);
    await expect(page.locator('.sidebar a[href="/app/reports"]')).toBeVisible();
  });
  test("the live report route never serves demo or another project's data from the demo project", async ({
    request,
  }) => {
    const r = await request.get("/api/sentinel/projects/orderly-demo/report");
    expect([401, 404]).toContain(r.status());
  });
});

test.describe("S10-A7 responsive, theme and accessibility", () => {
  for (const [name, width, height] of [
    ["desktop", 1440, 900],
    ["tablet", 768, 1024],
    ["mobile", 390, 844],
  ] as const) {
    test(`no horizontal overflow at ${name} (${width}px) for Overview, Reports and Canvas security`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height });
      await mockReport(page);
      await mockCanvas(page, () => ({ status: 200, json: overlay() }));
      for (const path of [
        "/app/projects/github-123/sentinel",
        "/app/projects/github-123/sentinel/reports",
      ]) {
        await page.goto(path);
        await expect(page.locator(".card").first()).toBeVisible();
        expect(await overflow(page)).toBeLessThanOrEqual(1);
      }
      await page.screenshot({
        path: `${shots}/reports-${width}.png`,
        fullPage: true,
      });
      await page.goto("/app/projects/github-123/canvas");
      await expect(
        page.locator(".component-explorer, [class*=canvas]").first(),
      ).toBeVisible();
      expect(await overflow(page)).toBeLessThanOrEqual(1);
    });
  }
  test("dark theme parity: Overview renders with readable foreground/background contrast", async ({
    page,
  }) => {
    await mockReport(page);
    await page.goto("/app/projects/github-123/sentinel");
    await page.getByRole("button", { name: "Switch to dark theme" }).click();
    await expect(page.getByText("Sources connected")).toBeVisible();
    const [fg, bg] = await page.evaluate(() => {
      const card = document.querySelector(".card")!;
      const style = getComputedStyle(card);
      return [style.color, style.backgroundColor];
    });
    const lum = (c: string) => {
      const [r, g, b] = c
        .match(/\d+(\.\d+)?/g)!
        .slice(0, 3)
        .map(Number)
        .map((v) => {
          v /= 255;
          return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
        });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const ratio =
      (Math.max(lum(fg), lum(bg)) + 0.05) / (Math.min(lum(fg), lum(bg)) + 0.05);
    expect(ratio).toBeGreaterThan(4.5);
    await page.screenshot({
      path: `${shots}/overview-dark.png`,
      fullPage: true,
    });
  });
  test("keyboard: tabs are reachable and the report window control is labelled", async ({
    page,
  }) => {
    await mockReport(page);
    await page.goto("/app/projects/github-123/sentinel/reports");
    await page
      .getByRole("navigation", { name: "Sentinel live sections" })
      .getByRole("link", { name: "Overview" })
      .focus();
    await page.keyboard.press("Tab");
    await expect(
      page
        .getByRole("navigation", { name: "Sentinel live sections" })
        .getByRole("link", { name: "Event Explorer" }),
    ).toBeFocused();
    await expect(page.getByLabel("Report time window")).toBeVisible();
  });
  test("axe: no serious or critical violations in the new live views", async ({
    page,
  }) => {
    await mockReport(page);
    await mockCanvas(page, () => ({ status: 200, json: overlay() }));
    for (const path of [
      "/app/projects/github-123/sentinel",
      "/app/projects/github-123/sentinel/reports",
    ]) {
      await page.goto(path);
      await expect(page.locator(".card").first()).toBeVisible();
      const results = await new AxeBuilder({ page })
        .include("main#main")
        .withTags(["wcag2a", "wcag2aa"])
        .analyze();
      const bad = results.violations.filter((v) =>
        ["serious", "critical"].includes(v.impact ?? ""),
      );
      expect(
        bad.map(
          (v) =>
            `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`,
        ),
      ).toEqual([]);
    }
  });
});

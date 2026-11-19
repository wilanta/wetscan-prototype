import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const at = "2026-11-19T01:00:00.000Z";
const scope = {
  mode: "live",
  workspaceId: "github-user-7:fixture",
  projectId: "github-123",
};
const DISCLAIMER =
  "A public advisory describes a vulnerability in a package. It is not evidence that this project is affected, that the package is deployed, or that anyone attempted exploitation.";
const EXPOSURE_DISCLAIMER =
  "Potential repository exposure compares DECLARED lockfile dependencies with public advisories. It is not proof of deployment, exploitability, compromise or an observed attack, and 'no match' is not a security guarantee.";

const source = (
  provider: string,
  label: string,
  over: Record<string, unknown> = {},
) => ({
  provider,
  label,
  officialUrl: `https://example.invalid/${provider}`,
  status: "never_run",
  freshness: "never_synced",
  lastAttemptAt: null,
  lastSuccessAt: null,
  lastErrorCode: null,
  consecutiveFailures: 0,
  feedVersion: null,
  recordCount: 0,
  blockedUntil: null,
  ...over,
});
const snapshot = {
  ...scope,
  snapshotId: "00000000-0000-4000-8000-0000000000s1",
  sourceKind: "repository_lockfile",
  repositoryId: "123",
  commitSha: "a".repeat(40),
  lockfilePath: "package-lock.json",
  lockfileSha256: "b".repeat(64),
  lockfileVersion: 3,
  itemCount: 120,
  ecosystems: ["npm"],
  collectedBy: "github-user-7",
  collectedAt: at,
  expiresAt: "2026-11-26T01:00:00.000Z",
};
const overview = (over: Record<string, unknown> = {}) => ({
  schemaVersion: 1,
  sources: [
    source("cisa_kev", "CISA Known Exploited Vulnerabilities"),
    source("ghsa", "GitHub Global Security Advisories (reviewed)"),
    source("osv", "OSV (Open Source Vulnerabilities)"),
  ],
  runs: [],
  catalog: { advisories: 0, kev: 0, withdrawn: 0 },
  pendingSyncRequests: 0,
  inventory: {
    configured: true,
    guardProducer: "not_integrated",
    snapshot: null,
    expired: false,
  },
  disclaimer: DISCLAIMER,
  ...over,
});
const coverage = (over: Record<string, unknown> = {}) => ({
  snapshot: null,
  snapshotExpired: false,
  itemsTotal: 0,
  itemsAssessable: 0,
  unsupportedEcosystems: [],
  uncertainAdvisories: 0,
  assessedAt: at,
  catalogSources: [],
  ...over,
});
const cannot = {
  assessment: "cannot_assess",
  reason: "no_inventory",
  message:
    "Cannot assess project exposure: no verified dependency inventory has been collected for this project. Collect a lockfile snapshot first.",
  coverage: coverage(),
  exposures: [],
  truncated: false,
  disclaimer: EXPOSURE_DISCLAIMER,
};
const assertion = (
  provider: string,
  sourceId: string,
  over: Record<string, unknown> = {},
) => ({
  provider,
  sourceId,
  status: "active",
  title: "Command Injection in lodash",
  summary: null,
  severity: "high",
  cvssVector: null,
  cvssScore: null,
  kev: null,
  publishedAt: at,
  modifiedAt: at,
  withdrawnAt: null,
  sourceUrl: "https://github.com/advisories/GHSA-35jh-r3h4-6jhm",
  retrievedAt: at,
  feedVersion: null,
  rawSha256: "c".repeat(64),
  revision: 1,
  ident: ["CVE-2021-23337", "GHSA-35jh-r3h4-6jhm"],
  affected: [
    {
      ecosystem: "npm",
      packageName: "lodash",
      ranges: [{ introduced: "0", fixed: "4.17.21", lastAffected: null }],
      versions: [],
      fixed: ["4.17.21"],
      certainty: "verified",
    },
  ],
  ...over,
});
const advisory = (over: Record<string, unknown> = {}) => ({
  canonicalId: "CVE-2021-23337",
  aliases: ["GHSA-35jh-r3h4-6jhm"],
  kev: true,
  topSeverity: "high",
  modifiedAt: at,
  conflicting: false,
  assertions: [
    assertion("ghsa", "GHSA-35jh-r3h4-6jhm"),
    assertion("cisa_kev", "CVE-2021-23337", {
      kev: {
        dateAdded: at,
        dueDate: at,
        knownRansomwareCampaignUse: "Unknown",
        requiredAction: "Apply updates.",
        vendorProject: "Lodash",
        product: "lodash",
      },
      affected: [],
      sourceUrl: "https://www.cisa.gov/known-exploited-vulnerabilities-catalog",
      feedVersion: "2026.11.18",
    }),
  ],
  ...over,
});
const exposure = {
  assessment: "potential_exposure",
  reason: null,
  message:
    "1 potential repository exposure(s): declared lockfile dependencies match public advisories.",
  coverage: coverage({ snapshot, itemsTotal: 120, itemsAssessable: 120 }),
  exposures: [
    {
      canonicalId: "CVE-2021-23337",
      ecosystem: "npm",
      packageName: "lodash",
      installedVersion: "4.17.20",
      dependencyScope: "runtime",
      kev: true,
      topSeverity: "high",
      conflicting: true,
      sources: [
        {
          provider: "ghsa",
          sourceId: "GHSA-35jh-r3h4-6jhm",
          severity: "high",
          matched: true,
          matchedRange: {
            introduced: "0",
            fixed: "4.17.21",
            lastAffected: null,
          },
          matchedVersion: "4.17.20",
          fixedVersions: ["4.17.21"],
          sourceUrl: "https://github.com/advisories/GHSA-35jh-r3h4-6jhm",
          modifiedAt: at,
        },
        {
          provider: "osv",
          sourceId: "GHSA-35jh-r3h4-6jhm",
          severity: "high",
          matched: false,
          matchedRange: null,
          matchedVersion: null,
          fixedVersions: ["4.17.19"],
          sourceUrl: "https://osv.dev/vulnerability/GHSA-35jh-r3h4-6jhm",
          modifiedAt: at,
        },
      ],
    },
  ],
  truncated: false,
  disclaimer: EXPOSURE_DISCLAIMER,
};

interface Options {
  status?: number;
  error?: string;
  overview?: Record<string, unknown>;
  exposures?: Record<string, unknown>;
  advisories?: Record<string, unknown>[];
  detail?: Record<string, unknown>;
  postStatus?: number;
  postError?: string;
}
async function mock(page: Page, o: Options) {
  const posts: Record<string, unknown>[] = [];
  const gets: string[] = [];
  const outside: string[] = [];
  page.on("request", (r) => {
    const u = new URL(r.url());
    if (
      !["127.0.0.1", "localhost"].includes(u.hostname) &&
      !u.protocol.startsWith("data")
    )
      outside.push(r.url());
  });
  await page.route("**/api/sentinel/**", async (route) => {
    const req = route.request();
    const url = req.url();
    if (!url.includes("/external"))
      return route.fulfill({
        json: {
          cases: [],
          groups: [],
          ungroupedCount: 0,
          candidates: [],
          archivableIncidents: [],
          audit: [],
          grouping: { version: 1, windowDays: 30, disclaimer: "x" },
          aiExplanation: {
            configured: false,
            status: "disabled",
            reason: "No AI provider is configured.",
          },
        },
      });
    if (req.method() === "POST") {
      posts.push(req.postDataJSON());
      if (o.postStatus)
        return route.fulfill({
          status: o.postStatus,
          json: { error: o.postError },
        });
      return route.fulfill({ status: 202, json: { requested: [] } });
    }
    gets.push(url);
    if (o.status)
      return route.fulfill({ status: o.status, json: { error: o.error } });
    if (url.includes("advisoryId=")) return route.fulfill({ json: o.detail });
    if (url.includes("view=exposures"))
      return route.fulfill({ json: o.exposures ?? cannot });
    if (url.includes("view=advisories"))
      return route.fulfill({
        json: {
          items: o.advisories ?? [],
          nextOffset: null,
          disclaimer: DISCLAIMER,
        },
      });
    return route.fulfill({ json: overview(o.overview) });
  });
  return { posts, gets, outside };
}
const open = async (page: Page) => {
  await page.goto("/app/intelligence-fixture");
  await page.getByRole("button", { name: "External advisories" }).click();
};

test("unconfigured migration (503) is an honest NOT_CONFIGURED state with no actions", async ({
  page,
}) => {
  await mock(page, { status: 503, error: "external_not_configured" });
  await open(page);
  await expect(
    page.getByText(
      "External Intelligence is not configured (NOT_CONFIGURED). Database migration 0009 is not applied.",
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Request feed sync" }),
  ).toHaveCount(0);
});

test("without inventory the page says `Cannot assess project exposure`, never a clean result, and the demo is untouched", async ({
  page,
}) => {
  const m = await mock(page, {});
  await open(page);
  const card = page
    .getByRole("heading", { name: "Potential project exposure" })
    .locator("xpath=ancestor::*[contains(@class,'card')][1]");
  await expect(
    card.getByText("Cannot assess project exposure").first(),
  ).toBeVisible();
  await expect(card.getByText("This is not a clean result")).toBeVisible();
  await expect(
    card.getByText(/Guard dependency inventory \(GRD-020\): not integrated/),
  ).toBeVisible();
  await expect(page.getByLabel("Potential exposures")).toHaveCount(0);
  await expect(
    page.getByText(/no vulnerabilities|all clear|you are safe|secure\b/i),
  ).toHaveCount(0);
  await expect(page.getByText("Orderly")).toHaveCount(0);
  await expect(page.getByText("ADV-009")).toHaveCount(0); // the synthetic demo advisory never appears in live mode
  await expect(page.getByText(DISCLAIMER).first()).toBeVisible();
  const rows = page.getByLabel("Advisory feed status").getByRole("row");
  await expect(rows).toHaveCount(4);
  await expect(
    page.getByLabel("Advisory feed status").getByText("Never synced"),
  ).toHaveCount(3);
  await expect(page.getByText("No feed has synchronized yet")).toBeVisible();
  expect(m.gets.every((u) => u.includes("/external"))).toBe(true);
  expect(m.outside).toEqual([]); // the page itself never reaches an external host
});

test("rendering and reading are read-only: no POST is ever sent on load", async ({
  page,
}) => {
  const m = await mock(page, {});
  await open(page);
  await expect(page.getByLabel("Advisory feed status")).toBeVisible();
  await page.waitForTimeout(500);
  expect(m.posts).toEqual([]);
});

test("a potential exposure cites exact advisory and inventory evidence, flags disagreement, and claims no deployment or attack", async ({
  page,
}) => {
  await mock(page, {
    overview: {
      catalog: { advisories: 1, kev: 1, withdrawn: 0 },
      inventory: {
        configured: true,
        guardProducer: "not_integrated",
        snapshot,
        expired: false,
      },
    },
    exposures: exposure,
    advisories: [advisory()],
  });
  await open(page);
  const table = page.getByLabel("Potential exposures");
  await expect(table.getByText("lodash")).toBeVisible();
  await expect(table.getByText("4.17.20")).toBeVisible();
  await expect(table.getByText("CISA KEV")).toBeVisible();
  await expect(table.getByText("Sources disagree")).toBeVisible();
  await expect(
    table.getByText(/ghsa GHSA-35jh-r3h4-6jhm: asserts affected/),
  ).toBeVisible();
  await expect(
    table.getByText(/osv GHSA-35jh-r3h4-6jhm: does not match/),
  ).toBeVisible();
  await expect(page.getByText(/commit aaaaaaaaaaaa/)).toBeVisible();
  await expect(page.getByText(/lockfile sha256 bbbbbbbbbbbb/)).toBeVisible();
  await expect(
    page.getByText(
      /not proof of deployment, exploitability, compromise or an observed attack/,
    ),
  ).toBeVisible();
  await expect(
    page.getByText(
      /is being exploited in your|your app was attacked|compromised/i,
    ),
  ).toHaveCount(0);
});

test("feed health is source-level: degraded, stale and backed-off sources are visible with their error code", async ({
  page,
}) => {
  await mock(page, {
    overview: {
      sources: [
        source("cisa_kev", "CISA Known Exploited Vulnerabilities", {
          status: "ok",
          freshness: "fresh",
          lastSuccessAt: at,
          lastAttemptAt: at,
          recordCount: 1786,
          feedVersion: "2026.11.18",
        }),
        source("ghsa", "GitHub Global Security Advisories (reviewed)", {
          status: "rate_limited",
          freshness: "stale",
          lastSuccessAt: "2026-11-10T00:00:00.000Z",
          lastAttemptAt: at,
          lastErrorCode: "rate_limited",
          blockedUntil: "2026-11-19T02:00:00.000Z",
          recordCount: 50,
        }),
        source("osv", "OSV (Open Source Vulnerabilities)", {
          status: "degraded",
          freshness: "stale",
          lastSuccessAt: "2026-11-01T00:00:00.000Z",
          lastAttemptAt: at,
          lastErrorCode: "timeout",
          recordCount: 5,
        }),
      ],
      runs: [
        {
          runId: "r1",
          provider: "ghsa",
          trigger: "scheduled",
          status: "rate_limited",
          startedAt: at,
          finishedAt: at,
          httpStatus: 429,
          requests: 1,
          bytes: 0,
          recordsSeen: 0,
          recordsChanged: 0,
          recordsRejected: 0,
          errorCode: "rate_limited",
        },
      ],
      catalog: { advisories: 55, kev: 3, withdrawn: 0 },
      pendingSyncRequests: 2,
    },
  });
  await open(page);
  const t = page.getByLabel("Advisory feed status");
  await expect(t.getByText("Fresh", { exact: true })).toBeVisible();
  await expect(t.getByText("Stale", { exact: true })).toHaveCount(2);
  await expect(t.getByText("rate limited", { exact: true })).toBeVisible();
  await expect(
    t.getByText("rate_limited", { exact: true }).first(),
  ).toBeVisible();
  await expect(t.getByText(/backing off until/)).toBeVisible();
  await expect(t.getByText("timeout", { exact: true })).toBeVisible();
  await expect(page.getByText("2 sync request(s) queued")).toBeVisible();
  await expect(
    page.getByText(/Last-known-good advisories stay visible/),
  ).toBeVisible();
  await page.getByText(/Recent sync runs/).click();
  await expect(
    page
      .getByLabel("Recent sync runs")
      .getByText(/ghsa · scheduled · rate_limited/),
  ).toBeVisible();
});

test("manual actions send only a fixed command, never scope, URLs or credentials, and never claim a completed sync", async ({
  page,
}) => {
  const m = await mock(page, {});
  await open(page);
  await page.getByRole("button", { name: "Request feed sync" }).click();
  await expect.poll(() => m.posts.length).toBe(1);
  expect(m.posts[0]).toEqual({ action: "sync" });
  await expect(
    page.getByText(
      /Sync requested\. It runs only when the Sentinel worker has External Intelligence enabled/,
    ),
  ).toBeVisible();
  await expect(
    page.getByText(/synchronized successfully|sync complete/i),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Collect lockfile inventory" })
    .click();
  await expect.poll(() => m.posts.length).toBe(2);
  expect(m.posts[1]).toEqual({ action: "refresh_inventory" });
});

test("a missing lockfile keeps the exposure state honest", async ({ page }) => {
  await mock(page, { postStatus: 404, postError: "lockfile_not_found" });
  await open(page);
  await page
    .getByRole("button", { name: "Collect lockfile inventory" })
    .click();
  await expect(
    page
      .getByRole("alert")
      .getByText(/No package-lock\.json exists at the repository root/),
  ).toBeVisible();
  await expect(
    page.getByText("Cannot assess project exposure").first(),
  ).toBeVisible();
});

test("Advisory Explorer filters server-side and shows unmerged per-source provenance in the detail", async ({
  page,
}) => {
  const m = await mock(page, {
    overview: { catalog: { advisories: 1, kev: 1, withdrawn: 0 } },
    advisories: [advisory({ conflicting: true })],
    detail: {
      advisory: advisory({ conflicting: true }),
      history: [
        {
          provider: "ghsa",
          sourceId: "GHSA-35jh-r3h4-6jhm",
          revision: 2,
          modifiedAt: at,
          contentHash: "d".repeat(64),
          retrievedAt: at,
        },
      ],
      disclaimer: DISCLAIMER,
    },
  });
  await open(page);
  await expect(
    page
      .getByRole("table", { name: "Advisories" })
      .getByText("Command Injection in lodash"),
  ).toBeVisible();
  await page.getByLabel("Search advisories").fill("lodash");
  await page.getByLabel("Filter by source").selectOption("ghsa");
  await page.getByLabel("Filter by severity").selectOption("high");
  await page.getByLabel("Known exploited (CISA KEV)").check();
  await expect
    .poll(() =>
      m.gets.some(
        (u) =>
          u.includes("q=lodash") &&
          u.includes("provider=ghsa") &&
          u.includes("severity=high") &&
          u.includes("kev=1"),
      ),
    )
    .toBe(true);
  await page
    .getByRole("table", { name: "Advisories" })
    .getByRole("button", { name: "CVE-2021-23337" })
    .click();
  await expect(page.getByText("Advisory CVE-2021-23337")).toBeVisible();
  await expect(page.getByText("Aliases: GHSA-35jh-r3h4-6jhm")).toBeVisible();
  await expect(
    page.getByText(/Sources disagree about the affected ranges/),
  ).toBeVisible();
  await expect(page.getByLabel("ghsa assertion")).toContainText("0 → <4.17.21");
  await expect(page.getByLabel("cisa_kev assertion")).toContainText(
    "CISA KEV: added",
  );
  await expect(page.getByLabel("cisa_kev assertion")).toContainText(
    "feed 2026.11.18",
  );
  const link = page
    .getByLabel("ghsa assertion")
    .getByRole("link", { name: "Source" });
  await expect(link).toHaveAttribute(
    "href",
    "https://github.com/advisories/GHSA-35jh-r3h4-6jhm",
  );
  await expect(link).toHaveAttribute("rel", "noopener noreferrer");
  await page.getByText(/Revision history/).click();
  await expect(
    page.getByText(/ghsa GHSA-35jh-r3h4-6jhm · revision 2/),
  ).toBeVisible();
  await expect(
    page.getByText(
      "An advisory is not evidence that this project is affected or was attacked.",
    ),
  ).toBeVisible();
});

test("the internal case library tab is preserved and external content does not leak into it", async ({
  page,
}) => {
  await mock(page, { advisories: [advisory()] });
  await page.goto("/app/intelligence-fixture");
  await expect(
    page.getByRole("button", { name: "Case library (internal)" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByText("Case library", { exact: true }).first(),
  ).toBeVisible();
  await expect(page.getByRole("table", { name: "Advisories" })).toHaveCount(0);
  await page.getByRole("button", { name: "External advisories" }).click();
  await expect(page.getByRole("table", { name: "Advisories" })).toBeVisible();
  await page.getByRole("button", { name: "Case library (internal)" }).click();
  await expect(page.getByRole("table", { name: "Advisories" })).toHaveCount(0);
});

test("accessible, and usable at phone width without page-level horizontal scroll", async ({
  page,
}) => {
  await mock(page, {
    overview: {
      catalog: { advisories: 1, kev: 1, withdrawn: 0 },
      inventory: {
        configured: true,
        guardProducer: "not_integrated",
        snapshot,
        expired: false,
      },
    },
    exposures: exposure,
    advisories: [advisory()],
  });
  await open(page);
  await expect(page.getByLabel("Potential exposures")).toBeVisible();
  const results = await new AxeBuilder({ page })
    .include("[aria-label='External advisories']")
    .analyze();
  expect(
    results.violations.filter((v) =>
      ["serious", "critical"].includes(v.impact ?? ""),
    ),
  ).toEqual([]);
  await page.setViewportSize({ width: 400, height: 800 });
  await expect(page.getByLabel("Potential exposures")).toBeVisible();
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

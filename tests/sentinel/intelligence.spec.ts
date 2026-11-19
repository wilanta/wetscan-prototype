import { test, expect, type Page } from "@playwright/test";

const at = "2026-11-19T01:00:00.000Z";
const scope = {
  mode: "live",
  workspaceId: "github-user-7:fixture",
  projectId: "github-123",
};
const caseId = "00000000-0000-4000-8000-0000000000c1";
const incidentId = "00000000-0000-4000-8000-0000000000i1";
const candidateId = "00000000-0000-4000-8000-0000000000d1";
const groupId = "a".repeat(64);

const indicators = {
  schemaVersion: 1,
  ruleName: "Suspicious path",
  eventKinds: ["http.suspicious_path"],
  reasonCodes: ["suspicious_path"],
  methods: ["GET"],
  statusCodes: [404],
  routeTemplates: [],
  evidenceCount: 3,
  spanSeconds: 90,
  alertCount: 1,
};
function aCase(over: Record<string, unknown> = {}) {
  return {
    ...scope,
    schemaVersion: 1,
    caseId,
    incidentId,
    sourceId: "00000000-0000-4000-8000-0000000000a1",
    ruleId: "00000000-0000-4000-8000-0000000000b1",
    ruleVersion: 1,
    title: "Probe of admin paths",
    category: "http",
    severity: "medium",
    origin: "runtime",
    incidentStatusAtArchive: "open",
    incidentRevisionAtArchive: 1,
    incidentFirstObservedAt: at,
    incidentLastObservedAt: at,
    indicators,
    signature: groupId,
    groupingVersion: 1,
    tags: ["recon"],
    status: "draft_pending_review",
    shelfState: "active",
    archivedBy: "github-user-7",
    archivedAt: at,
    updatedAt: at,
    revision: 1,
    incidentPinned: true,
    incident: {
      state: "available",
      status: "open",
      revision: 1,
      changedSinceArchive: false,
    },
    evidence: { total: 3, available: 3, missing: 0, state: "complete" },
    ...over,
  };
}
function aCandidate(over: Record<string, unknown> = {}) {
  return {
    ...scope,
    schemaVersion: 1,
    candidateId,
    origin: "runtime",
    signature: groupId,
    groupingVersion: 1,
    definition: {
      schemaVersion: 1,
      name: "Candidate http pattern aaaaaaaa",
      description: "DRAFT proposed",
      category: "http",
      severity: "medium",
      confidence: 50,
      eventKinds: ["http.suspicious_path"],
      conditions: [
        { field: "attributes.reasonCode", op: "eq", value: "suspicious_path" },
      ],
      correlation: "source",
      windowSeconds: 90,
      threshold: 3,
      cooldownSeconds: 300,
      suppressionWindows: [],
    },
    basis: {
      thresholdRationale: "Smallest evidence count among member incidents (3).",
      limitations: ["x", "No back-test against live telemetry has been run."],
    },
    reviewStatus: "DRAFT",
    reviewedBy: null,
    reviewedAt: null,
    reviewReason: null,
    validatedBy: null,
    validatedAt: null,
    promotedRuleId: null,
    promotedBy: null,
    promotedAt: null,
    ruleStatus: null,
    proposedBy: "github-user-7",
    createdAt: at,
    updatedAt: at,
    revision: 1,
    caseIds: [caseId, "00000000-0000-4000-8000-0000000000c2"],
    ...over,
  };
}
const group = (over: Record<string, unknown> = {}) => ({
  groupId,
  groupingVersion: 1,
  origin: "runtime",
  category: "http",
  matchedOn: {
    eventKinds: ["http.suspicious_path"],
    reasonCodes: ["suspicious_path"],
    methods: ["GET"],
    statusCodes: [404],
  },
  caseIds: [caseId, "00000000-0000-4000-8000-0000000000c2"],
  incidentIds: [],
  members: [],
  distinctSourceCount: 1,
  severity: "medium",
  firstObservedAt: at,
  lastObservedAt: at,
  windowDays: 30,
  excludedOutsideWindow: 0,
  confidence: "exact_indicator_match",
  explanation: [
    '2 runtime cases in category "http" share identical event kinds.',
  ],
  limitations: ["Similarity is a deterministic indicator match."],
  candidateId: null,
  ...over,
});
const overview = (over: Record<string, unknown> = {}) => ({
  cases: [],
  groups: [],
  ungroupedCount: 0,
  candidates: [],
  archivableIncidents: [],
  audit: [],
  grouping: {
    version: 1,
    windowDays: 30,
    disclaimer:
      "Similarity is a deterministic indicator match. It does not prove a common attacker, successful exploitation, or that any incident was neutralized.",
  },
  aiExplanation: {
    configured: false,
    status: "disabled",
    reason:
      "No AI provider is configured. No case or evidence data is sent to any model.",
  },
  ...over,
});

async function mock(
  page: Page,
  options: {
    status?: number;
    error?: string;
    overview?: Record<string, unknown>;
    detail?: Record<string, unknown>;
  },
) {
  const posts: Record<string, unknown>[] = [];
  const gets: string[] = [];
  await page.route("**/api/sentinel/**", async (route) => {
    const req = route.request();
    if (req.method() === "POST") {
      posts.push(req.postDataJSON());
      return route.fulfill({ json: { ok: true } });
    }
    gets.push(req.url());
    if (options.status)
      return route.fulfill({
        status: options.status,
        json: { error: options.error },
      });
    if (req.url().includes("caseId="))
      return route.fulfill({ json: options.detail });
    return route.fulfill({ json: overview(options.overview) });
  });
  return { posts, gets };
}

test("unconfigured migration (503) shows an honest NOT_CONFIGURED state and no actions", async ({
  page,
}) => {
  await mock(page, { status: 503, error: "intelligence_not_configured" });
  await page.goto("/app/intelligence-fixture");
  await expect(
    page.getByText(
      "Internal Intelligence is not configured (NOT_CONFIGURED). Database migration 0008 is not applied.",
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Archive as case/ }),
  ).toHaveCount(0);
});

test("empty library shows empty states, never demo cases, and states that AI is disabled", async ({
  page,
}) => {
  await mock(page, {});
  await page.goto("/app/intelligence-fixture");
  await expect(page.getByText("No cases match")).toBeVisible();
  await expect(page.getByText("No unarchived incidents")).toBeVisible();
  await expect(page.getByText("No groups yet")).toBeVisible();
  await expect(page.getByText("No candidates")).toBeVisible();
  await expect(page.getByText("No AI provider is configured")).toBeVisible();
  await expect(page.getByText("Orderly")).toHaveCount(0);
  await expect(
    page.getByText(/does not prove a common attacker/).first(),
  ).toBeVisible();
});

test("archiving sends only the incident id: never scope, actor or provenance", async ({
  page,
}) => {
  const { posts } = await mock(page, {
    overview: {
      archivableIncidents: [
        {
          incidentId,
          title: "Probe of admin paths",
          category: "http",
          severity: "medium",
          status: "open",
          origin: "runtime",
          lastObservedAt: at,
        },
      ],
    },
  });
  await page.goto("/app/intelligence-fixture");
  await page
    .getByRole("button", { name: "Archive incident Probe of admin paths" })
    .click();
  await expect.poll(() => posts.length).toBe(1);
  expect(posts[0]).toEqual({ action: "archive", incidentId });
});

test("case detail shows honest expired/partial-evidence states and never claims resolution", async ({
  page,
}) => {
  const expired = aCase({
    incident: { state: "expired" },
    incidentPinned: false,
    evidence: { total: 3, available: 1, missing: 2, state: "partial" },
    incidentStatusAtArchive: "closed",
  });
  await mock(page, {
    overview: { cases: [expired] },
    detail: {
      case: {
        ...expired,
        evidenceRefs: [
          {
            id: "telemetry:s:e1",
            sourceId: "s",
            eventId: "e1",
            kind: "http.suspicious_path",
            occurredAt: at,
            state: "available",
          },
          {
            id: "telemetry:s:e2",
            sourceId: "s",
            eventId: "e2",
            kind: "http.suspicious_path",
            occurredAt: at,
            state: "missing",
          },
        ],
      },
      audit: [
        {
          auditId: "a1",
          sequence: 1,
          action: "case_archived",
          actorId: "github-user-7",
          recordedAt: at,
          summary: "Incident archived.",
          note: null,
        },
      ],
      candidates: [],
    },
  });
  await page.goto("/app/intelligence-fixture");
  await expect(page.getByText("Source incident expired").first()).toBeVisible();
  await page
    .getByRole("button", { name: "Open case Probe of admin paths" })
    .click();
  await expect(page.getByText(/no longer stored/).first()).toBeVisible();
  await expect(
    page.getByText("2 of 3 evidence events are no longer stored", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Evidence references").getByText("missing"),
  ).toBeVisible();
  await expect(
    page.getByText("Missing evidence is never reconstructed."),
  ).toBeVisible();
  await expect(page.getByText(/resolved|neutralized/i).first()).toBeVisible(); // only inside the disclaimer
  await expect(page.getByText(/Mitigated|Resolved by/)).toHaveCount(0);
});

test("candidate review is human-only: reason required, approve then validate then DRAFT-only creation with explicit acknowledgement", async ({
  page,
}) => {
  const state = { c: aCandidate() };
  const { posts } = await mock(page, {
    overview: { cases: [aCase()], groups: [group()], candidates: [state.c] },
  });
  await page.goto("/app/intelligence-fixture");
  const approve = page.getByRole("button", { name: "Approve candidate" });
  await expect(approve).toBeDisabled();
  await expect(page.getByText("Review DRAFT")).toBeVisible();
  await expect(page.getByText("No S03 rule")).toBeVisible();
  await page.getByLabel("Review reason").fill("Matches what we saw");
  await expect(approve).toBeEnabled();
  await approve.click();
  await expect.poll(() => posts.length).toBe(1);
  expect(posts[0]).toEqual({
    action: "review",
    candidateId,
    expectedRevision: 1,
    decision: "approve",
    reason: "Matches what we saw",
  });

  // Approved, not validated: only Validate is offered. No promote, no enable.
  await page.unroute("**/api/sentinel/**");
  const second = await mock(page, {
    overview: {
      cases: [aCase()],
      candidates: [
        aCandidate({
          reviewStatus: "APPROVED",
          reviewedBy: "github-user-7",
          reviewedAt: at,
          reviewReason: "ok",
          revision: 2,
        }),
      ],
    },
  });
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Validate definition" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Create DRAFT detection rule/ }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Enable/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Validate definition" }).click();
  await expect.poll(() => second.posts.length).toBe(1);
  expect(second.posts[0]).toEqual({
    action: "validate",
    candidateId,
    expectedRevision: 2,
  });

  // Validated: creation needs an explicit acknowledgement and only creates a DRAFT.
  await page.unroute("**/api/sentinel/**");
  const third = await mock(page, {
    overview: {
      cases: [aCase()],
      candidates: [
        aCandidate({
          reviewStatus: "APPROVED",
          reviewedBy: "github-user-7",
          reviewedAt: at,
          reviewReason: "ok",
          validatedBy: "github-user-7",
          validatedAt: at,
          revision: 3,
        }),
      ],
    },
  });
  await page.reload();
  const create = page.getByRole("button", {
    name: "Create DRAFT detection rule",
  });
  await expect(create).toBeDisabled();
  await page.getByLabel(/creates a DRAFT rule only/).check();
  await create.click();
  await expect.poll(() => third.posts.length).toBe(1);
  expect(third.posts[0]).toEqual({
    action: "promote",
    candidateId,
    expectedRevision: 3,
  });
});

test("a promoted rule is shown with its live S03 status and enabling is only linked to Detection Rules", async ({
  page,
}) => {
  await mock(page, {
    overview: {
      cases: [aCase()],
      candidates: [
        aCandidate({
          reviewStatus: "APPROVED",
          reviewedBy: "github-user-7",
          reviewedAt: at,
          reviewReason: "ok",
          validatedBy: "github-user-7",
          validatedAt: at,
          promotedRuleId: "00000000-0000-4000-8000-0000000000f1",
          promotedBy: "github-user-7",
          promotedAt: at,
          ruleStatus: "DRAFT",
          revision: 4,
        }),
      ],
    },
  });
  await page.goto("/app/intelligence-fixture");
  await expect(page.getByText("S03 rule DRAFT")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Detection Rules" }).last(),
  ).toHaveAttribute("href", "/app/projects/github-123/sentinel/rules");
  await expect(page.getByRole("button", { name: /Enable/ })).toHaveCount(0);
});

test("pattern groups explain the match and its limits, and offer DRAFT proposals only", async ({
  page,
}) => {
  const { posts } = await mock(page, {
    overview: { cases: [aCase()], groups: [group()], ungroupedCount: 2 },
  });
  await page.goto("/app/intelligence-fixture");
  await expect(
    page.getByText("Confidence: exact indicator match only."),
  ).toBeVisible();
  await expect(page.getByText("2 case(s) are ungrouped")).toBeVisible();
  await page.getByRole("button", { name: "Propose DRAFT rule" }).click();
  await expect.poll(() => posts.length).toBe(1);
  expect(posts[0]).toEqual({ action: "propose", groupId });
});

test("S08-A6: Orderly Demo Intelligence stays synthetic, separate from live cases, with zero live API or external requests", async ({
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
  await page.goto("/app/projects/orderly-demo/sentinel/intelligence");
  await expect(
    page.getByRole("heading", { name: "Turn a case into a useful lesson." }),
  ).toBeVisible();
  await page.getByRole("button", { name: /External advisories/ }).click();
  await page.getByRole("button", { name: /Case library/ }).click();
  // The live component is never mounted for the demo project.
  await expect(page.getByText("Evidence-based case library.")).toHaveCount(0);
  await expect(page.getByLabel("Evidence references")).toHaveCount(0);
  expect(apiRequests).toEqual([]);
  expect(externalHosts).toEqual([]);
});

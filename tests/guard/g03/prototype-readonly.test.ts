import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { expect, it } from "vitest";

const script = readFileSync("scripts/guard-g03-prototype-readonly.js", "utf8");
const commit = "5e52ac2d9df641eebef5cb4818c4efb7887c0c5c";
const scanId = "a".repeat(64),
  findingId = "b".repeat(64);
const repository = {
  provider: "github",
  repositoryId: "123",
  branch: "master",
  commit,
};
const prefix = "/api/guard/projects/github-123";
function responses() {
  return {
    "/api/onboarding": {
      authenticated: true,
      profile: {
        email: "PRIVATE_ACCOUNT_SENTINEL",
        repositories: [
          {
            id: 123,
            fullName: "wilanta/wetscan-prototype",
            defaultBranch: "master",
          },
        ],
      },
    },
    [prefix + "/readiness"]: {
      database: "approved",
      schema: "verified",
      product: {
        repositoryScanning: "BLOCKED",
        private: "PRIVATE_READY_SENTINEL",
      },
    },
    [prefix + "/scans?limit=50"]: {
      scans: [
        {
          id: scanId,
          status: "completed",
          repository,
          createdAt: "2026-11-20T08:00:00Z",
        },
      ],
    },
    [prefix + "/scans/" + scanId + "/view"]: {
      scanId,
      revision: 2,
      status: "completed",
      repository,
      execution: "repository_scan",
      sourceCoverage: {
        status: "complete",
        retrievedFiles: 1,
        excludedFiles: 0,
        treeTruncated: false,
      },
      engines: [
        {
          engine: "sast",
          scanner: "opengrep",
          version: "2.0.0",
          rulePack: "controlled-test",
          status: "completed",
          artifactDigest: "c".repeat(64),
          executionEvidence: {
            version: 1,
            imageId: "sha256:" + "d".repeat(64),
            specDigest: "e".repeat(64),
            installationArtifactSha256: "f".repeat(64),
            cleanup: "VERIFIED",
            private: "PRIVATE_RECEIPT_SENTINEL",
          },
          coverage: { status: "complete", scannedFiles: 1, eligibleFiles: 1 },
        },
      ],
      findings: [
        {
          id: findingId,
          projectId: "github-123",
          mode: "live",
          status: "potential",
          severity: "high",
          confidence: "medium",
          title: "PRIVATE_TITLE_SENTINEL",
          source: {
            engine: "sast",
            scanner: "opengrep",
            version: "2.0.0",
            rulePack: "controlled-test",
            ruleId: "controlled-test-rule",
          },
          location: { path: "src/parser.ts", line: 3 },
          evidence: [
            {
              id: "1".repeat(64),
              commit,
              artifactDigest: "c".repeat(64),
              synthetic: false,
              summary: "PRIVATE_SUMMARY_SENTINEL",
              recordedAt: "2026-11-20T08:00:00Z",
            },
          ],
        },
      ],
    },
  };
}
async function collect(
  options: {
    origin?: string;
    change?: (rows: Record<string, unknown>) => void;
    failure?: "auth" | "storage" | "network" | "json";
  } = {},
) {
  const rows: Record<string, unknown> = responses();
  options.change?.(rows);
  const calls: { path: string; options: RequestInit }[] = [],
    logs: string[] = [];
  let downloads = 0;
  const report = await runInNewContext(script, {
    location: { origin: options.origin ?? "http://localhost:3000" },
    AbortSignal,
    Blob,
    URL: {
      createObjectURL: () => "blob:local-test",
      revokeObjectURL: () => undefined,
    },
    document: { createElement: () => ({ click: () => downloads++ }) },
    console: { log: (message: string) => logs.push(message) },
    setTimeout: () => 1,
    fetch: async (path: string, init: RequestInit) => {
      calls.push({ path, options: init });
      if (options.failure === "network")
        throw Error("PRIVATE_NETWORK_SENTINEL");
      const fail =
        (options.failure === "auth" && path === "/api/onboarding") ||
        (options.failure === "storage" && path.includes("/scans?"));
      return {
        status: fail ? 503 : 200,
        ok: !fail,
        json: async () => {
          if (options.failure === "json") throw Error("PRIVATE_BODY_SENTINEL");
          return fail ? { error: "PRIVATE_ERROR_SENTINEL" } : rows[path];
        },
      };
    },
  });
  return { report, calls, downloads, logs };
}
it("resolves the selected target and projects stored SAST metadata with GET only", async () => {
  const { report, calls, downloads, logs } = await collect();
  expect(report.status).toBe("EXISTING_METADATA_COLLECTED");
  expect(report.repository.projectId).toBe("github-123");
  expect(report.views[0]).toMatchObject({
    commit,
    matchesPreparedMasterHead: true,
    sastRunCount: 1,
    sourceCoverage: { status: "complete" },
    findings: [{ findingId, rule: "controlled-test-rule" }],
  });
  expect(report.currentHeadVerified).toBe(false);
  expect(
    report.repositorySourceAcquired ||
      report.providerCalled ||
      report.scannerStarted ||
      report.githubWritten,
  ).toBe(false);
  expect(calls).toHaveLength(4);
  expect(
    calls.every(
      (c) =>
        c.options.method === "GET" &&
        c.options.credentials === "same-origin" &&
        c.options.redirect === "error" &&
        c.options.body === undefined,
    ),
  ).toBe(true);
  expect(downloads).toBe(1);
  expect(logs.join("\n")).not.toContain("PRIVATE_");
});
it("stops before any fetch on a different origin", async () => {
  const { report, calls, downloads } = await collect({
    origin: "https://example.test",
  });
  expect(report.status).toBe("WRONG_ORIGIN_STOP");
  expect(calls).toEqual([]);
  expect(downloads).toBe(0);
});
it.each(["auth", "network", "json"] as const)(
  "does not retry or leak a %s failure",
  async (failure) => {
    const { report, calls, logs } = await collect({ failure });
    expect(report.status).toBe("EXISTING_SESSION_UNAVAILABLE");
    expect(calls).toHaveLength(1);
    expect(logs.join("\n")).not.toContain("PRIVATE_");
  },
);
it("distinguishes inaccessible storage from a clean scan", async () => {
  const { report } = await collect({ failure: "storage" });
  expect(report.status).toBe("SCAN_HISTORY_UNAVAILABLE");
  expect(report.requests.at(-1).errorCode).toBe("unrecognized_error");
  expect(report.views).toEqual([]);
});
it.each(["different", "duplicate"])(
  "does not change selection when target is %s",
  async (fault) => {
    const { report, calls } = await collect({
      change: (rows) => {
        const account = rows["/api/onboarding"] as ReturnType<
          typeof responses
        >["/api/onboarding"];
        if (fault === "different")
          account.profile.repositories[0].fullName = "inkAja/wdu";
        else account.profile.repositories.push(account.profile.repositories[0]);
      },
    });
    expect(report.status).toBe("TARGET_NOT_SELECTED_OR_AMBIGUOUS");
    expect(calls).toHaveLength(1);
  },
);
it("rejects a mismatched stored view revision instead of exporting a candidate", async () => {
  const { report } = await collect({
    change: (rows) => {
      const view = rows[prefix + "/scans/" + scanId + "/view"] as {
        repository: typeof repository;
      };
      view.repository = { ...repository, commit: "9".repeat(40) };
    },
  });
  expect(report.status).toBe("BINDING_OR_RESPONSE_INVALID_STOP");
  expect(report.views).toEqual([]);
});
it("bounds requests and marks truncated history without a no-vulnerability claim", async () => {
  const { report, calls } = await collect({
    change: (rows) => {
      const scans = Array.from({ length: 50 }, (_, i) => ({
        id: (i + 1).toString(16).padStart(64, "0"),
        status: "completed",
        repository,
        createdAt: "2026-11-20T08:00:00Z",
      }));
      rows[prefix + "/scans?limit=50"] = { scans };
      rows[prefix + "/scans?limit=50&after=" + scans[49].id] = {
        scans: scans.map((s) => ({ ...s, id: "1" + s.id.slice(1) })),
      };
    },
  });
  expect(calls).toHaveLength(8);
  expect(report.historyTruncated).toBe(true);
  expect(report.currentHeadVerified).toBe(false);
});

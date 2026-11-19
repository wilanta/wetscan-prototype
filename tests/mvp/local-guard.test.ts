import { describe, expect, it, vi } from "vitest";
import { localDemoAllowed } from "../../src/features/guard/local-demo-access";
import {
  inspectPackageLock,
  MAX_LOCK_BYTES,
  previewReplacement,
} from "../../src/features/guard/local-artifacts";
import { localFixtureFindings } from "../../src/features/guard/local-fixtures";
import {
  createJob,
  transition,
  triage,
} from "../../src/features/guard/pipeline";
import { evaluate, report, reportHtml } from "../../src/features/guard/release";
import { digest } from "../../src/features/guard/security";
const scope = {
  workspaceId: "orderly-demo",
  projectId: "orderly-demo",
  mode: "demo" as const,
};
const grant = {
  ...scope,
  actorId: "demo-reviewer",
  operations: ["read", "scan", "report", "triage"] as (
    "read" | "scan" | "report" | "triage"
  )[],
  expiresAt: Date.now() + 60000,
};
const lock = (packages: object, version = 3) =>
  JSON.stringify({ lockfileVersion: version, packages });
describe("local-only boundary", () => {
  it.each(["production", undefined, "preview"])(
    "refuses %s even with flag and localhost",
    (env) => expect(localDemoAllowed(env, "1", "localhost:3000")).toBe(false),
  );
  it.each([
    "evil.test",
    "localhost.evil.test",
    "localhost:3000@evil.test",
    "0.0.0.0:3000",
    null,
  ])("refuses non-loopback host %s", (host) =>
    expect(localDemoAllowed("development", "1", host)).toBe(false),
  );
  it.each(["localhost:3000", "127.0.0.1:3118", "[::1]:3000"])(
    "allows opted-in development %s",
    (host) => expect(localDemoAllowed("development", "1", host)).toBe(true),
  );
  it("requires an explicit flag", () =>
    expect(localDemoAllowed("development", undefined, "localhost")).toBe(
      false,
    ));
});
describe("real local inventory", () => {
  it("extracts exact nested/scoped versions, deduplicates and never queries network", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(() => {
      throw Error("Network forbidden");
    });
    try {
      const result = await inspectPackageLock(
        lock({
          "": {},
          "node_modules/@fixture/pkg": {
            version: "1.2.3",
            license: "MIT",
            resolved: "https://untrusted.invalid/archive",
            scripts: { install: "not executed" },
          },
          "node_modules/one/node_modules/@fixture/pkg": { version: "1.2.3" },
          "node_modules/other": { version: "2.0.0" },
        }),
      );
      expect(result.items).toHaveLength(2);
      expect(result.items.find((x) => x.name === "other")?.license).toBeNull();
      expect(result.advisoryStatus).toBe("NOT_QUERIED");
      expect(JSON.stringify(result)).not.toContain("untrusted.invalid");
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      fetch.mockRestore();
    }
  });
  it.each([2, 3])("accepts supported npm lockfile v%i", async (version) =>
    expect(
      (
        await inspectPackageLock(
          lock({ "node_modules/a": { version: "1.0.0" } }, version),
        )
      ).items,
    ).toHaveLength(1),
  );
  it.each([1, 4])("refuses unsupported lockfile v%i", async (version) =>
    expect(inspectPackageLock(lock({}, version))).rejects.toThrow(),
  );
  it("does not turn unresolved/local/link versions into inventory or vulnerabilities", async () => {
    const result = await inspectPackageLock(
      lock({
        "node_modules/a": { version: "file:../a" },
        "node_modules/b": { link: true },
        "packages/c": { version: "1.0.0" },
      }),
    );
    expect(result.items).toEqual([]);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result).not.toHaveProperty("findings");
  });
  it.each([
    "../node_modules/a",
    "node_modules/../a",
    "node_modules/.env",
    "node_modules/a%2fb",
  ])("rejects unsafe metadata path %s", async (path) =>
    expect(
      inspectPackageLock(lock({ [path]: { version: "1.0.0" } })),
    ).rejects.toThrow(),
  );
  it("rejects oversized, malformed and excessive input", async () => {
    await expect(
      inspectPackageLock(" ".repeat(MAX_LOCK_BYTES + 1)),
    ).rejects.toThrow();
    await expect(inspectPackageLock("{")).rejects.toThrow();
    await expect(
      inspectPackageLock(
        lock(
          Object.fromEntries(
            Array.from({ length: 5001 }, (_, i) => [
              "node_modules/p" + i,
              { version: "1.0.0" },
            ]),
          ),
        ),
      ),
    ).rejects.toThrow();
  });
});
describe("patch preview cannot apply or verify a fix", () => {
  const base = {
    findingId: "finding-a",
    baseCommit: "a".repeat(40),
    path: "src/example.ts",
    original: "export const answer = 1;",
    search: "1",
    replacement: "2",
  };
  it("binds proposal to exact text and base while leaving verification unexecuted", async () => {
    const result = await previewReplacement({
      ...base,
      expectedSha256: await digest(base.original),
    });
    expect(result.after).toBe("export const answer = 2;");
    expect(result.applied).toBe(false);
    expect(result.retest).toBe("NOT_EXECUTED");
  });
  it("rejects stale source digest", async () =>
    expect(
      previewReplacement({ ...base, expectedSha256: "b".repeat(64) }),
    ).rejects.toThrow("digest"));
  it.each([
    ".env",
    "../src/a.ts",
    "src/auth/session.ts",
    ".github/workflows/a.yml",
    "secret.pem",
  ])("rejects sensitive/unsafe path %s", async (path) =>
    expect(
      previewReplacement({
        ...base,
        path,
        expectedSha256: await digest(base.original),
      }),
    ).rejects.toThrow(),
  );
  it.each([
    { search: "missing" },
    { search: "" },
    { replacement: "1" },
    { baseCommit: "main" },
    { original: "1+1" },
  ])("rejects ambiguous or unbound proposal %j", async (override) => {
    const value = { ...base, ...override };
    await expect(
      previewReplacement({
        ...value,
        expectedSha256: await digest(value.original),
      }),
    ).rejects.toThrow();
  });
});
describe("integrated fixture normalization, review, policy and reporting", () => {
  it("preserves mode/provenance and leaves missing engines INCOMPLETE", async () => {
    let job = await createJob(grant, {
      ...scope,
      repository: {
        provider: "github",
        repositoryId: "orderly-synthetic-fixture",
        branch: "demo-fixture",
        commit: "a".repeat(40),
      },
      profile: "standard",
      engines: ["sast", "sca", "secrets", "iac", "sbom"],
      idempotencyKey: "mvp-test-fixture",
    });
    job.findings = await localFixtureFindings(job, job.requestedEngines, false);
    expect(job.findings.map((x) => x.source.engine)).toEqual([
      "sast",
      "sca",
      "secrets",
      "iac",
    ]);
    expect(
      job.findings.every(
        (x) => x.mode === "demo" && x.evidence.every((e) => e.synthetic),
      ),
    ).toBe(true);
    const reviewed = triage(
      grant,
      job.findings[0],
      "under_review",
      "Review fixture evidence only",
    );
    job.findings[0] = reviewed.finding;
    job.audit.push(reviewed.audit);
    const policy = {
      id: "required-coverage",
      required: job.requestedEngines,
      blockSeverities: ["high" as const],
      blockPotential: true,
    };
    expect(evaluate(job, policy).decision).toBe("INCOMPLETE");
    expect(evaluate(job, policy).enforced).toBe(false);
    expect(report(grant, job, policy).scope.mode).toBe("demo");
    expect(reportHtml(report(grant, job, policy))).toContain("Synthetic");
    await expect(
      localFixtureFindings({ ...job, mode: "live" }, ["sast"], false),
    ).rejects.toThrow();
    expect(
      (await localFixtureFindings(job, ["sast", "sca"], true)).map(
        (x) => x.source.engine,
      ),
    ).toEqual(["sca"]);
    job = transition(job, "preparing", "demo-reviewer");
    expect(job.mode).toBe("demo");
  });
});

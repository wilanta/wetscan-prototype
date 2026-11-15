import { expect, it } from "vitest";
import { evaluate } from "../../../src/features/guard/release";
import { createJob } from "../../../src/features/guard/pipeline";
it("never passes missing/partial Live source coverage even when every required engine completed", async () => {
  const grant = {
    mode: "live" as const,
    workspaceId: "github-user-7:test",
    projectId: "github-123",
    actorId: "github-user-7",
    operations: ["scan"] as const,
    expiresAt: Date.now() + 60000,
  };
  const base = await createJob(grant, {
    ...grant,
    repository: {
      provider: "github",
      repositoryId: "123",
      branch: "main",
      commit: "a".repeat(40),
    },
    profile: "quick",
    engines: ["sast"],
    idempotencyKey: "coverage-test",
  });
  const job = {
      ...base,
      status: "completed" as const,
      runs: base.runs.map((r) =>
        r.engine === "sast" ? { ...r, status: "completed" as const } : r,
      ),
    },
    policy = {
      id: "fixture-policy",
      required: ["sast" as const],
      blockSeverities: [],
      blockPotential: false,
    };
  expect(evaluate(job, policy).decision).toBe("INCOMPLETE");
  expect(
    evaluate(
      {
        ...job,
        sourceCoverage: {
          status: "partial",
          retrievedFiles: 1,
          excludedFiles: 1,
          treeTruncated: false,
        },
      },
      policy,
    ).decision,
  ).toBe("INCOMPLETE");
  expect(
    evaluate(
      {
        ...job,
        sourceCoverage: {
          status: "complete",
          retrievedFiles: 1,
          excludedFiles: 0,
          treeTruncated: false,
        },
      },
      policy,
    ).decision,
  ).toBe("PASS");
  expect(evaluate({ ...job, mode: "demo" }, policy).decision).toBe("PASS");
});

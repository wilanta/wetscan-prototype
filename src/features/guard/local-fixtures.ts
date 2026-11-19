import type { Engine, ScanJob } from "./contracts";
import {
  normalizeGitleaks,
  normalizeOpengrep,
  normalizeOSV,
  normalizeTrivy,
  type NormalizationContext,
} from "./evidence";
import { digest, GuardError } from "./security";

export const localFixtureEngines: Engine[] = ["sast", "sca", "secrets", "iac"];
/** Fixed reviewed JSON fixtures. Completed means parser exercise, never a scanner invocation. */
export async function localFixtureFindings(
  job: ScanJob,
  selected: Engine[],
  failSast: boolean,
) {
  if (
    job.mode !== "demo" ||
    job.repository.repositoryId !== "orderly-synthetic-fixture"
  )
    throw new GuardError("forbidden", "Fixture scope required.");
  const payloads = {
    sast: {
      results: [
        {
          check_id: "synthetic-eval",
          path: "fixtures/demo-handler.js",
          start: { line: 3 },
          extra: { message: "Synthetic dynamic evaluation", severity: "ERROR" },
        },
      ],
      errors: [],
    },
    sca: {
      results: [
        {
          source: { path: "package-lock.json" },
          packages: [
            {
              package: {
                name: "fixture-dependency",
                version: "1.0.0",
                ecosystem: "npm",
              },
              vulnerabilities: [{ id: "DEMO-ADVISORY-001" }],
            },
          ],
        },
      ],
    },
    secrets: [
      {
        RuleID: "synthetic-credential",
        File: "fixtures/demo-config.js",
        StartLine: 2,
      },
    ],
    iac: {
      Results: [
        {
          Target: "fixtures/main.tf",
          Misconfigurations: [
            {
              ID: "DEMO-IAC-001",
              Severity: "HIGH",
              Title: "Synthetic unrestricted network rule",
            },
          ],
        },
      ],
    },
  };
  const ctx = async (
    engine: keyof typeof payloads,
  ): Promise<NormalizationContext> => ({
    workspaceId: job.workspaceId,
    projectId: job.projectId,
    mode: "demo",
    commit: job.repository.commit,
    recordedAt: new Date().toISOString(),
    artifactDigest: await digest(JSON.stringify(payloads[engine])),
    synthetic: true,
    scannerVersion: "fixture-v1-NOT_EXECUTED",
    rulePack: "reviewed-local-fixture-v1",
  });
  return [
    ...(selected.includes("sast") && !failSast
      ? await normalizeOpengrep(payloads.sast, await ctx("sast"))
      : []),
    ...(selected.includes("sca")
      ? await normalizeOSV(payloads.sca, await ctx("sca"))
      : []),
    ...(selected.includes("secrets")
      ? await normalizeGitleaks(payloads.secrets, await ctx("secrets"))
      : []),
    ...(selected.includes("iac")
      ? await normalizeTrivy(payloads.iac, await ctx("iac"), "iac")
      : []),
  ];
}

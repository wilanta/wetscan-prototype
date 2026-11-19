import type { ProjectAuthority, StoredScan } from "./model";
import { LiveGuardError } from "./model";
import { authorize } from "../security";
import { operationalJob } from "./product-policy";
import { evaluate, type ReleasePolicy } from "../release";
import { profiles } from "../pipeline";
export function releasePolicy(value: StoredScan): ReleasePolicy {
  return {
    id: "guard-default-v1",
    required: [...profiles[value.job.profile]],
    blockSeverities: ["critical", "high"],
    blockPotential: true,
  };
}
/** Never sends private receipts, broker state, source excerpts or unknown JSONB fields to the client. */
export function storedScanView(authority: ProjectAuthority, value: StoredScan) {
  const j = value.job;
  authorize(authority.grant, j, "read");
  if (
    j.mode !== "live" ||
    j.repository.provider !== "github" ||
    j.repository.repositoryId !== authority.repositoryId ||
    j.projectId !== "github-" + authority.repositoryId ||
    j.findings.length > 1000 ||
    j.findings.some(
      (f) =>
        f.mode !== "live" ||
        f.workspaceId !== j.workspaceId ||
        f.projectId !== j.projectId ||
        !f.evidence.length ||
        f.evidence.some(
          (e) =>
            e.synthetic ||
            e.commit !== j.repository.commit ||
            !/^[a-f0-9]{64}$/.test(e.artifactDigest),
        ),
    )
  )
    throw new LiveGuardError("source_integrity");
  return {
    scanId: j.id,
    revision: value.revision,
    execution: operationalJob(j)
      ? ("repository_scan" as const)
      : ("historical_preparation" as const),
    status: j.status,
    repository: j.repository,
    createdAt: j.createdAt,
    finishedAt: j.finishedAt ?? null,
    coverage: value.coverage,
    sourceCoverage: j.sourceCoverage ?? null,
    engines: j.runs,
    inventory: j.inventory ?? [],
    findings: j.findings,
    audit: j.audit,
    release: evaluate(j, releasePolicy(value)),
    integrations: {
      ai: "NOT_CONFIGURED",
      targetedRetest: "NOT_CONFIGURED",
      githubChecks: "NOT_CONFIGURED",
      vercel: "NOT_CONFIGURED",
      dast: "NOT_AUTHORIZED",
      integrity: "NOT_EXECUTED",
      canvas: "NOT_INTEGRATED",
      intelligence: "NOT_INTEGRATED",
      sentinel: "NOT_INTEGRATED",
    },
    scannerExecution: j.runs.some((r) => r.status === "completed")
      ? "RECORDED_ENGINE_RESULTS"
      : j.runs.some((r) => r.startedAt)
        ? "EXECUTION_OUTCOME_INCOMPLETE"
        : "NOT_RUN",
  };
}
export type StoredScanView = ReturnType<typeof storedScanView>;

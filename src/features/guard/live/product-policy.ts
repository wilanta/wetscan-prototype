import { validateImageScope } from "../../../../worker/guard/image-artifact";
import type { Grant, ScanJob } from "../contracts";
import { authorize } from "../security";
import { LiveGuardError } from "./model";
import { fingerprint } from "../../../platform/identity";
import {
  sandboxControls,
  validateOperationalSandboxSpec,
  type SandboxSpec,
} from "../../../../worker/guard/sandbox";

export const repositoryScanKind = "guard.scan.repository" as const;
export const repositoryEngines = [
  "sast",
  "sca",
  "secrets",
  "iac",
  "sbom",
  "container",
] as const;
export type RepositoryScanEngine = (typeof repositoryEngines)[number];
/** Server-owned operational configuration. Never deserialized from a browser request. */
export interface RepositoryScanPolicy {
  image?: import("../../../../worker/guard/image-artifact").ImageScope;
  version: 1;
  id: string;
  workspaceId: string;
  projectId: string;
  repositoryId: string;
  branches: string[];
  engines: RepositoryScanEngine[];
  scannerTimeoutMs: number;
  jobTimeoutMs: number;
  maxAttempts: 1;
}
export interface ScannerQualification {
  version: 1;
  classification: "LIVE_VERIFIED_SANDBOX";
  engine: RepositoryScanEngine;
  specDigest: string;
  imageId: string;
  scannerVersion: string;
  rulePack: string;
  rulePackSha256: string;
  installationArtifactSha256: string;
  verifiedAt: string;
  expiresAt: string;
  evidenceSha256: string;
  daemonId: string;
  daemonVersion: string;
  kernelVersion: string;
  controls: readonly (typeof sandboxControls)[number][];
}
const sha = (value: unknown) =>
  typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
export function validateProductPolicy(
  policy: RepositoryScanPolicy,
  job: Pick<
    ScanJob,
    | "mode"
    | "workspaceId"
    | "projectId"
    | "repository"
    | "requestedEngines"
    | "idempotencyKey"
  >,
) {
  if (
    !policy ||
    policy.version !== 1 ||
    !policy.id ||
    policy.id.length > 128 ||
    job.mode !== "live" ||
    policy.workspaceId !== job.workspaceId ||
    policy.projectId !== job.projectId ||
    policy.repositoryId !== job.repository.repositoryId ||
    job.projectId !== "github-" + policy.repositoryId ||
    job.repository.provider !== "github" ||
    !/^[a-f0-9]{40}$/.test(job.repository.commit) ||
    !Array.isArray(policy.branches) ||
    !policy.branches.includes(job.repository.branch) ||
    !Array.isArray(policy.engines) ||
    !policy.engines.length ||
    policy.engines.some((e) => !repositoryEngines.includes(e)) ||
    !job.requestedEngines.length ||
    new Set(job.requestedEngines).size !== job.requestedEngines.length ||
    new Set(policy.engines).size !== policy.engines.length ||
    job.requestedEngines.some(
      (e) => !policy.engines.includes(e as RepositoryScanEngine),
    ) ||
    !/^g02-live-[A-Za-z0-9_-]{8,110}$/.test(job.idempotencyKey) ||
    policy.maxAttempts !== 1 ||
    !Number.isInteger(policy.scannerTimeoutMs) ||
    policy.scannerTimeoutMs < 100 ||
    policy.scannerTimeoutMs > 45000 ||
    !Number.isInteger(policy.jobTimeoutMs) ||
    policy.jobTimeoutMs < 60000 ||
    policy.jobTimeoutMs > 600000 ||
    policy.jobTimeoutMs <
      45000 + job.requestedEngines.length * policy.scannerTimeoutMs + 10000
  )
    throw new LiveGuardError("execution_not_ready");
  if (job.requestedEngines.includes("container")) validateImageScope(policy.image!);
  return policy;
}
export function validateQualification(
  q: ScannerQualification,
  engine: RepositoryScanEngine,
  spec: SandboxSpec,
  now = Date.now(),
) {
  validateOperationalSandboxSpec(spec);
  if (
    !q ||
    q.version !== 1 ||
    q.classification !== "LIVE_VERIFIED_SANDBOX" ||
    q.engine !== engine ||
    q.specDigest !== fingerprint(spec) ||
    !/^sha256:[a-f0-9]{64}$/.test(q.imageId) ||
    !sha(q.rulePackSha256) ||
    !sha(q.installationArtifactSha256) ||
    !sha(q.evidenceSha256) ||
    !q.scannerVersion ||
    q.scannerVersion.length > 100 ||
    /fixture|not_configured|unavailable/i.test(q.scannerVersion) ||
    !q.rulePack ||
    q.rulePack.length > 200 ||
    [
      q.scannerVersion,
      q.rulePack,
      q.daemonId,
      q.daemonVersion,
      q.kernelVersion,
    ].some(
      (v) =>
        typeof v !== "string" || !v || v.length > 256 || /[\r\n\0]/.test(v),
    ) ||
    !Number.isFinite(Date.parse(q.verifiedAt)) ||
    Date.parse(q.verifiedAt) > now ||
    !Number.isFinite(Date.parse(q.expiresAt)) ||
    Date.parse(q.expiresAt) <= now ||
    Date.parse(q.expiresAt) - Date.parse(q.verifiedAt) > 3600000 ||
    !Array.isArray(q.controls) ||
    new Set(q.controls).size !== sandboxControls.length ||
    sandboxControls.some((control) => !q.controls.includes(control))
  )
    throw new LiveGuardError("execution_not_ready");
  return q;
}
export function operationalJob(job: ScanJob) {
  return (
    job.mode === "live" &&
    job.idempotencyKey.startsWith("g02-live-") &&
    job.audit.some(
      (a) => a.action === "repository_scan_requested" && a.subjectId === job.id,
    )
  );
}
export function requireOperationalJob(grant: Grant, job: ScanJob) {
  authorize(grant, job, "read");
  if (!operationalJob(job)) throw new LiveGuardError("not_found", 404);
}

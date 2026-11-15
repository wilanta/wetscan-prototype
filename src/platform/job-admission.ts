import type { SentinelScope } from "../features/sentinel/types";
import { PlatformError } from "./config";
import { identifier } from "./identity";

/** Optional service-side admission. Never accepted from an HTTP request. */
export interface JobAdmission {
  readonly scope: SentinelScope;
  readonly jobIds: readonly string[];
  readonly expiresAt: string;
}
export function sealedAdmission(input: JobAdmission): JobAdmission {
  if (
    input.scope.mode !== "live" ||
    !input.jobIds.length ||
    input.jobIds.length > 12 ||
    new Set(input.jobIds).size !== input.jobIds.length ||
    !Number.isFinite(Date.parse(input.expiresAt)) ||
    new Date(input.expiresAt).toISOString() !== input.expiresAt ||
    Date.parse(input.expiresAt) <= Date.now()
  )
    throw new PlatformError("approval_required");
  for (const id of input.jobIds) identifier(id);
  return Object.freeze({
    scope: Object.freeze({ ...input.scope }),
    jobIds: Object.freeze([...input.jobIds]),
    expiresAt: input.expiresAt,
  });
}
export function assertAdmission(
  admission: JobAdmission,
  scope: SentinelScope,
  jobId?: string,
) {
  if (
    Date.now() >= Date.parse(admission.expiresAt) ||
    scope.mode !== admission.scope.mode ||
    scope.workspaceId !== admission.scope.workspaceId ||
    scope.projectId !== admission.scope.projectId ||
    (jobId !== undefined && !admission.jobIds.includes(jobId))
  )
    throw new PlatformError("scope_denied");
}

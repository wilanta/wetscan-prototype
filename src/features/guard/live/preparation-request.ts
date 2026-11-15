import { guardPreparationTiming } from "../../../../worker/guard/timing";
import "server-only";
import { readFile, lstat } from "node:fs/promises";
import { isAbsolute, extname } from "node:path";
import type { ProjectAuthority } from "./model";
import { LiveGuardError } from "./model";
import { authorizeGuardProject } from "./project";
import { scanInput } from "./service";
import { enqueueApprovedGuardPreparation } from "./preparation";
import { guardLiveService } from "./runtime";
import { guardMigrationPlan } from "./migrations";
import { launchApprovedGuardWorker } from "./worker-launcher";
import {
  bindGuardJob,
  validateWorkerApproval,
  type GuardWorkerApproval,
} from "../../../../worker/guard/approval";
import { within } from "../../../../worker/sentinel/lifecycle";
/** Operator-owned non-secret approval only. No client path, dotenv or credential loading. */
export async function readGuardOperatorApproval(
  path: string | undefined,
): Promise<unknown> {
  if (!path || !isAbsolute(path) || extname(path).toLowerCase() !== ".json")
    throw new LiveGuardError("approval_required");
  try {
    const info = await lstat(path);
    if (!info.isFile() || info.isSymbolicLink() || info.size > 32768)
      throw new Error();
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    throw new LiveGuardError("approval_required");
  }
}
export async function preparationRequest(input: {
  authority: ProjectAuthority;
  token: string | undefined;
  value: unknown;
  environment: Readonly<Record<string, string | undefined>>;
  signal: AbortSignal;
}) {
  if (
    !input.value ||
    typeof input.value !== "object" ||
    Array.isArray(input.value)
  )
    throw new LiveGuardError("invalid_input", 400);
  const value = input.value as Record<string, unknown>;
  if (value.action === "enqueue") {
    const request = { ...value };
    delete request.action;
    scanInput(request);
    const approval = await readGuardOperatorApproval(
      input.environment.GUARD_PREPARATION_APPROVAL_FILE,
    );
    return enqueueApprovedGuardPreparation({
      approval,
      request,
      sessionToken: input.token,
      environment: input.environment,
      signal: input.signal,
    });
  }
  if (
    value.action !== "launch" ||
    Object.keys(value).some((k) => !["action", "scanId"].includes(k)) ||
    typeof value.scanId !== "string" ||
    !/^[a-f0-9]{64}$/.test(value.scanId)
  )
    throw new LiveGuardError("invalid_input", 400);
  const approval = (await readGuardOperatorApproval(
    input.environment.GUARD_WORKER_APPROVAL_FILE,
  )) as GuardWorkerApproval;
  const plan = await guardMigrationPlan();
  const permit = validateWorkerApproval(
    approval,
    approval?.binding,
    plan.sha256,
  );
  if (
    permit.binding.projectId !== input.authority.grant.projectId ||
    permit.binding.actorId !== input.authority.grant.actorId ||
    permit.binding.jobId !== value.scanId
  )
    throw new LiveGuardError("not_found", 404);
  const service = await guardLiveService(),
    stored = await service.get(input.authority, value.scanId);
  validateWorkerApproval(permit, bindGuardJob(stored.job), plan.sha256);
  if (input.signal.aborted) throw new LiveGuardError("source_unavailable");
  const launched = await launchApprovedGuardWorker({
    approval: permit,
    job: stored.job,
    sessionToken: input.token,
    environment: input.environment,
  });
  const abort = () => {
    void launched.stop().catch(() => undefined);
  };
  input.signal.addEventListener("abort", abort, { once: true });
  try {
    if (input.signal.aborted) throw new LiveGuardError("source_unavailable");
    await within(launched.done, guardPreparationTiming.requestMs);
    const current = await authorizeGuardProject(
      input.token,
      input.authority.grant.projectId,
    );
    const actual = await service.get(current, value.scanId);
    if (
      !actual.job.audit.some((a) => a.action === "foundation_prepared") ||
      !actual.coverage
    )
      throw new LiveGuardError("execution_not_ready");
    return {
      scanId: actual.job.id,
      status: actual.job.status,
      preparation: "verified",
      coverage: actual.coverage,
      execution: "prepare_only",
      scannerExecution: "NOT_RUN",
    };
  } catch (error) {
    await launched.stop().catch(() => {
      throw new LiveGuardError("cleanup_failed");
    });
    throw error;
  } finally {
    input.signal.removeEventListener("abort", abort);
  }
}

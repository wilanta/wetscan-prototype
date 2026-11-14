import { createHash } from "node:crypto";
import type { DurableJob } from "../features/sentinel/platform-contracts";
import { PlatformError } from "./config";

export function identifier(value: string): string {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > 256 ||
    /[\x00-\x1f]/.test(value)
  )
    throw new PlatformError("invalid_input");
  return value;
}
export function fingerprint(value: unknown): string {
  function canonical(v: unknown): string {
    if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
    if (v !== null && typeof v === "object")
      return `{${Object.entries(v)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, val]) => `${JSON.stringify(k)}:${canonical(val)}`)
        .join(",")}}`;
    const text = JSON.stringify(v);
    if (text === undefined) throw new PlatformError("invalid_input");
    return text;
  }
  return createHash("sha256").update(canonical(value)).digest("hex");
}
export function validateJob(job: DurableJob) {
  if (
    job.schemaVersion !== 1 ||
    !["sentinel", "guard"].includes(job.module) ||
    job.mode !== "live" ||
    job.attempts !== 0 ||
    job.revision !== 1 ||
    job.cancelRequested ||
    !Number.isInteger(job.maxAttempts) ||
    job.maxAttempts < 1 ||
    job.maxAttempts > 5 ||
    !Number.isFinite(Date.parse(job.availableAt))
  )
    throw new PlatformError("invalid_input");
  [
    job.workspaceId,
    job.projectId,
    job.jobId,
    job.kind,
    job.subjectRef,
    job.idempotencyKey,
  ].forEach(identifier);
}
export function backoffMs(attempt: number, random = Math.random): number {
  return (
    Math.min(60000, 1000 * 2 ** Math.min(6, Math.max(0, attempt - 1))) +
    Math.floor(random() * 250)
  );
}

import {
  providerInfo,
  type Freshness,
  type Provider,
  type RunView,
  type SourceView,
} from "./model";

export function freshnessOf(
  provider: Provider,
  lastSuccess: unknown,
  now = new Date(),
): Freshness {
  if (!lastSuccess) return "never_synced";
  const ageH =
    (now.getTime() - new Date(lastSuccess as string).getTime()) / 3_600_000;
  return ageH <= providerInfo[provider].maxAgeHours ? "fresh" : "stale";
}
const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);
export function sourceView(
  r: Record<string, unknown>,
  now = new Date(),
): SourceView {
  const provider = r.provider as Provider;
  return {
    provider,
    label: providerInfo[provider].label,
    officialUrl: providerInfo[provider].officialUrl,
    status: r.status as SourceView["status"],
    freshness: freshnessOf(provider, r.last_success_at, now),
    lastAttemptAt: iso(r.last_attempt_at),
    lastSuccessAt: iso(r.last_success_at),
    lastErrorCode: (r.last_error_code as string) ?? null,
    consecutiveFailures: Number(r.consecutive_failures),
    feedVersion: (r.feed_version as string) ?? null,
    recordCount: Number(r.record_count),
    blockedUntil: iso(r.blocked_until),
  };
}
export function runView(r: Record<string, unknown>): RunView {
  return {
    runId: r.run_id as string,
    provider: r.provider as Provider,
    trigger: r.trigger as RunView["trigger"],
    status: r.status as string,
    startedAt: iso(r.started_at)!,
    finishedAt: iso(r.finished_at),
    httpStatus: r.http_status === null ? null : Number(r.http_status),
    requests: Number(r.requests),
    bytes: Number(r.bytes),
    recordsSeen: Number(r.records_seen),
    recordsChanged: Number(r.records_changed),
    recordsRejected: Number(r.records_rejected),
    errorCode: (r.error_code as string) ?? null,
  };
}

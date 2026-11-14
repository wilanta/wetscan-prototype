import type { SentinelScope } from "./types";

/** Exact tuple used for every future DB uniqueness/FK/cache/dedupe namespace. */
export function scopeKey(scope: SentinelScope): string {
  if (
    !scope.workspaceId ||
    !scope.projectId ||
    !["demo", "live"].includes(scope.mode)
  )
    throw new Error("Invalid Sentinel scope");
  return JSON.stringify([scope.mode, scope.workspaceId, scope.projectId]);
}
export function assertSameScope(
  expected: SentinelScope,
  actual: SentinelScope,
): void {
  if (scopeKey(expected) !== scopeKey(actual))
    throw new Error("Sentinel scope denied");
}
/** Demo identity is an explicit namespace, never minted from an authenticated repo. */
export const orderlyDemoScope: Readonly<SentinelScope> = Object.freeze({
  workspaceId: "demo:northstar-studio",
  projectId: "orderly-demo",
  mode: "demo",
});
export function deliveryKey(
  scope: SentinelScope,
  producer: string,
  key: string,
): string {
  if (!producer || !key) throw new Error("Missing delivery identity");
  return JSON.stringify([scopeKey(scope), producer, key]);
}

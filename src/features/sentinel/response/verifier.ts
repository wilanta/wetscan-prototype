import { createHash } from "node:crypto";
import type { VerificationPort } from "../contracts";
import type { SentinelProjectContext, VerificationResult } from "../types";
import { ResponseTargetError, targetRequest } from "./local-rate-limit-adapter";

/**
 * Independent verifier. By construction it holds NO admin credential and imports nothing from the adapter's
 * authority: it only replays a labelled synthetic request and a benign control against the public probe paths.
 * `applied` from the adapter never reaches this module as proof.
 */
export interface ProbeSnapshot {
  attackStatus: number | null;
  benignStatus: number | null;
  error?: string;
}
export type VerifierDecision = "verified" | "failed" | "inconclusive";
export const probeNonce = (actionId: string) =>
  createHash("sha256")
    .update(`wetscan-probe:${actionId}`)
    .digest("hex")
    .slice(0, 32);

export function decide(
  baseline: ProbeSnapshot | undefined,
  after: ProbeSnapshot,
): VerifierDecision {
  // Without a clean baseline (attack allowed, benign allowed) causality cannot be established.
  if (
    !baseline ||
    baseline.attackStatus !== 200 ||
    baseline.benignStatus !== 200
  )
    return "inconclusive";
  if (after.error || after.attackStatus === null || after.benignStatus === null)
    return "inconclusive";
  if (after.attackStatus !== 429) return "failed"; // not blocked
  if (after.benignStatus !== 200) return "failed"; // collateral damage
  return "verified";
}

export class FixtureVerifier implements VerificationPort {
  constructor(
    private readonly o: {
      origin: string;
      timeoutMs?: number;
      fetchImpl?: typeof fetch;
    },
  ) {}
  async probe(actionId: string, signal?: AbortSignal): Promise<ProbeSnapshot> {
    const req = (path: string, headers: Record<string, string>) =>
      targetRequest(
        { ...this.o, timeoutMs: this.o.timeoutMs ?? 3000 },
        "GET",
        path,
        headers,
        undefined,
        signal,
      );
    try {
      const attack = await req("/probe/attack", {
        "x-wetscan-probe": probeNonce(actionId),
      });
      const benign = await req("/probe/benign", {});
      return { attackStatus: attack.status, benignStatus: benign.status };
    } catch (e) {
      return {
        attackStatus: null,
        benignStatus: null,
        error: e instanceof ResponseTargetError ? e.code : "probe_failed",
      };
    }
  }
  /** `baseline` was recorded before the limit was applied; absent/unclean ⇒ inconclusive. */
  async verify(
    context: SentinelProjectContext,
    actionId: string,
    baseline?: ProbeSnapshot,
    signal?: AbortSignal,
  ) {
    const after = await this.probe(actionId, signal);
    const status = decide(baseline, after);
    const value: VerificationResult = {
      ...context.scope,
      schemaVersion: 1,
      revision: 1,
      actionId,
      verificationStatus: status,
      maliciousReplayBlocked:
        after.attackStatus === null ? null : after.attackStatus === 429,
      benignControlAllowed:
        after.benignStatus === null ? null : after.benignStatus === 200,
      evidenceIds: [`probe:${probeNonce(actionId)}`],
      checkedAt: new Date().toISOString(),
    };
    return { status: "available" as const, value, after };
  }
}

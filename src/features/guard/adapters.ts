import type {
  AIProviderPort,
  CanvasPort,
  Engine,
  IntelligencePort,
  IntegrationResult,
  SentinelPort,
} from "./contracts";
import { authorize, redact } from "./security";
export const engineBacklog: Record<Engine, string> = {
  sast: "GRD-006",
  sca: "GRD-007",
  secrets: "GRD-008",
  iac: "GRD-009",
  container: "GRD-010",
  sbom: "GRD-010",
  dast: "GRD-011",
  api: "GRD-012",
  integrity: "GRD-016",
};
function unavailable<T>(
  backlogId: string,
  reason: string,
): IntegrationResult<T> {
  return { status: "not_integrated", backlogId, reason };
}
export const unavailableCanvas: CanvasPort = {
  async publish(grant, overlays) {
    for (const overlay of overlays) authorize(grant, overlay.scope, "read");
    return unavailable("GRD-013", "Canvas overlay delivery is not integrated.");
  },
  async plans(grant, scope) {
    authorize(grant, scope, "read");
    return unavailable("GRD-014", "Confirmed Canvas plans are not integrated.");
  },
};
export const unavailableIntelligence: IntelligencePort = {
  async publish(grant, scope) {
    authorize(grant, scope, "read");
    return unavailable("GRD-020", "Inventory delivery is not integrated.");
  },
};
export const unavailableSentinel: SentinelPort = {
  async publish(grant, scope) {
    authorize(grant, scope, "read");
    return unavailable("GRD-021", "Sentinel event delivery is not integrated.");
  },
};
export const disabledAI: AIProviderPort = {
  configured: false,
  async explain(input) {
    return {
      text: `AI not configured (GRD-017). Review rule ${redact(input.ruleId)} and affected scope; validate a minimal fix using a targeted before/after retest. Suggestions require human review.`,
      untrusted: true,
    };
  },
};
export class UnavailableGuardAdapter {
  readonly mode = "live";
  availability(engine: Engine) {
    return {
      engine,
      status: "not_configured" as const,
      backlogId: engineBacklog[engine],
      reason:
        "Live scans require authorized snapshot, durable queue/storage and enforcing sandbox (GRD-001/003/004/005).",
    };
  }
  async start(): Promise<IntegrationResult<never>> {
    return {
      status: "not_configured",
      backlogId: "GRD-001",
      reason:
        "No live job started. Project-scoped server grant and authorized snapshot are unavailable.",
    };
  }
}

export const unavailableCI: import("./contracts").ReleaseCheckPort = {
  async publish(grant, scope) {
    authorize(grant, scope, "report");
    return unavailable(
      "GRD-019",
      "CI checks are not integrated. No deployment enforcement occurred.",
    );
  },
};

import type { G06CanvasOverlayPayload } from "../../guard/g06/contracts";
import type { CanvasOverlaySource } from "../contracts";
import type { FindingSummary, SecurityOverlay } from "../types";
import { UnavailableCanvasOverlaySource } from "./overlay-unavailable";
import { validateSecurityOverlay } from "./overlay-validation";

function mapGuardFindings(detail: G06CanvasOverlayPayload): FindingSummary[] {
  return detail.mappedFindings.map((f) => ({
    id: f.id,
    nodeId: f.nodeId,
    title: f.title,
    severity: f.severity,
    source: "Guard",
    status: f.status,
    evidenceType: f.basis,
    evidence: f.evidenceSummary,
    href: f.href,
    simulated: false,
    priority: f.priority,
    engine: f.engine,
    confidence: f.confidence,
    scanId: f.scanId,
    commitSha: f.commitSha,
  }));
}

async function fetchGuardOverlay(
  projectId: string,
  revision: string,
): Promise<G06CanvasOverlayPayload | null> {
  try {
    const res = await fetch(
      `/api/guard/projects/${encodeURIComponent(projectId)}/g06/canvas?revision=${encodeURIComponent(revision)}`,
      {
        credentials: "same-origin",
        cache: "no-store",
        signal: AbortSignal.timeout(15000),
      },
    );
    if (!res.ok) return null;
    const data = (await res.json().catch(() => null)) as {
      overlay?: G06CanvasOverlayPayload;
    } | null;
    const ov = data?.overlay;
    if (!ov || ov.version !== "guard.canvas.v1" || ov.projectId !== projectId) {
      return null;
    }
    if (
      ov.graphRevision !== "unavailable" &&
      ov.graphRevision !== revision
    ) {
      return null;
    }
    return ov;
  } catch {
    return null;
  }
}

/**
 * CAN-008 + GRD-013 client seam. Fetches both Sentinel runtime overlay and Guard G06 risk overlay
 * for the exact graph revision on screen and refuses anything mismatched in project or revision.
 */
export function sentinelOverlaySource(
  projectId: string,
  revision: string,
): CanvasOverlaySource {
  return {
    mode: "live",
    async getSecurity(projectRef) {
      const [sentinelResult, guardOverlay] = await Promise.all([
        fetch(
          `/api/sentinel/projects/${encodeURIComponent(projectId)}/canvas?revision=${encodeURIComponent(revision)}`,
          {
            credentials: "same-origin",
            cache: "no-store",
            signal: AbortSignal.timeout(20000),
          },
        ),
        fetchGuardOverlay(projectId, revision),
      ]);

      let base: SecurityOverlay;
      if (!sentinelResult.ok) {
        const code = (await sentinelResult.json().catch(() => null))?.error;
        if (
          sentinelResult.status === 503 &&
          (code === "telemetry_not_configured" ||
            code === "migration_not_ready")
        ) {
          base = {
            ...(await UnavailableCanvasOverlaySource.getSecurity(projectRef)),
            mode: guardOverlay ? "live" : "live",
            sentinel: "not_monitored",
            message:
              "Monitoring not connected: Sentinel storage is not configured in this environment. No incident data is available.",
          };
        } else if (guardOverlay) {
          base = {
            ...(await UnavailableCanvasOverlaySource.getSecurity(projectRef)),
            mode: "live",
            sentinel: "unavailable",
            message: "Sentinel runtime overlay unavailable; showing Guard G06 risk overlay.",
          };
        } else {
          throw new Error("Security overlay unavailable");
        }
      } else {
        const validated = validateSecurityOverlay(await sentinelResult.json());
        if (
          validated.mode !== "live" ||
          validated.projectRef !== projectRef ||
          validated.sentinelDetail?.sourceRevision !== revision
        ) {
          throw new Error("Security overlay scope or revision mismatch");
        }
        base = validated;
      }

      if (!guardOverlay) {
        return base;
      }

      const guardFindings = mapGuardFindings(guardOverlay);
      const merged: SecurityOverlay = {
        ...base,
        mode: "live",
        guard: guardOverlay.coverageStatus,
        findings: [
          ...guardFindings,
          ...base.findings.filter((f) => f.source !== "Guard"),
        ],
        guardDetail: guardOverlay,
        message: `Guard (${guardOverlay.coverageStatus}): ${guardOverlay.summary.mappedCount} mapped, ${guardOverlay.summary.unmatchedCount} unmatched · ${base.message}`,
      };
      return validateSecurityOverlay(merged);
    },
    getTrustVerification: UnavailableCanvasOverlaySource.getTrustVerification,
    getWorkflowTests: UnavailableCanvasOverlaySource.getWorkflowTests,
  };
}

import type { CanvasOverlaySource } from "../contracts";
import { UnavailableCanvasOverlaySource } from "./overlay-unavailable";
import { validateSecurityOverlay } from "./overlay-validation";

/**
 * CAN-008 client seam. Fetches the server-built overlay for the exact graph revision on screen and refuses anything
 * that is not scoped to this project, live, and pinned to that revision (a stale mapping must never look current).
 * Trust/workflow lenses stay on the unavailable source: Guard producers GRD-020/021 are not integrated.
 */
export function sentinelOverlaySource(
  projectId: string,
  revision: string,
): CanvasOverlaySource {
  return {
    mode: "live",
    async getSecurity(projectRef) {
      const response = await fetch(
        `/api/sentinel/projects/${encodeURIComponent(projectId)}/canvas?revision=${revision}`,
        {
          credentials: "same-origin",
          cache: "no-store",
          signal: AbortSignal.timeout(20000),
        },
      );
      if (!response.ok) throw new Error("Security overlay unavailable");
      const overlay = validateSecurityOverlay(await response.json());
      if (
        overlay.mode !== "live" ||
        overlay.projectRef !== projectRef ||
        overlay.sentinelDetail?.sourceRevision !== revision
      )
        throw new Error("Security overlay scope or revision mismatch");
      return overlay;
    },
    getTrustVerification: UnavailableCanvasOverlaySource.getTrustVerification,
    getWorkflowTests: UnavailableCanvasOverlaySource.getWorkflowTests,
  };
}

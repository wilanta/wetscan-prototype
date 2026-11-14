import type { CanvasOverlaySource } from "../contracts";
export const UnavailableCanvasOverlaySource: CanvasOverlaySource = {
  mode: "unavailable",
  async getSecurity(projectRef) {
    return {
      projectRef,
      mode: "unavailable",
      guard: "not_scanned",
      sentinel: "not_monitored",
      findings: [],
      incidents: [],
      message:
        "Not yet scanned. Monitoring not connected. No Guard scan has been performed; no security conclusion can be drawn.",
    };
  },
  async getTrustVerification(projectRef) {
    return { projectRef, status: "not_tested", observations: [] };
  },
  async getWorkflowTests(projectRef) {
    return { projectRef, status: "not_executed", results: [] };
  },
};

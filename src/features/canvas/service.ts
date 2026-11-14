import type { CanvasGraphSource, CanvasOverlaySource } from "./contracts";
import type {
  ArchitectureGraph,
  SecurityOverlay,
  UserCanvasOverlay,
} from "./types";
import { emptyOverlay, mergeGraph, normalizeGraph } from "./graph/model";
import { validateGraph, validateOverlay } from "./validation";
import { UnavailableCanvasOverlaySource } from "./adapters/overlay-unavailable";
import { validateSecurityOverlay } from "./adapters/overlay-validation";
/** Defensive scope gate: a faulty adapter cannot leak synthetic data into a snapshot/live graph. */
export function scopeSecurity(
  graph: ArchitectureGraph,
  overlay: SecurityOverlay,
): SecurityOverlay {
  overlay = validateSecurityOverlay(overlay);
  if (
    overlay.projectRef !== graph.projectRef ||
    (graph.mode !== "demo" &&
      (overlay.mode === "demo" ||
        overlay.findings.some((f) => f.simulated) ||
        overlay.incidents.some((i) => i.simulated)))
  )
    return {
      projectRef: graph.projectRef,
      mode: "unavailable",
      guard: "failed",
      sentinel: "failed",
      findings: [],
      incidents: [],
      message: "Overlay rejected: source mode or project scope mismatch.",
    };
  const nodes = new Set(graph.nodes.map((n) => n.id));
  return {
    ...overlay,
    findings: overlay.findings.filter((f) => nodes.has(f.nodeId)),
    incidents: overlay.incidents.filter((i) => nodes.has(i.nodeId)),
  };
}
export async function loadCanvas(
  source: CanvasGraphSource,
  projectRef: string,
  overlays: CanvasOverlaySource = UnavailableCanvasOverlaySource,
) {
  const graph = normalizeGraph(
    validateGraph(await source.loadGraph({ projectRef })),
  );
  if (graph.projectRef !== projectRef || graph.mode !== source.mode)
    throw new Error("Canvas source scope mismatch");
  let security: SecurityOverlay;
  try {
    security = scopeSecurity(graph, await overlays.getSecurity(projectRef));
  } catch {
    security = {
      ...(await UnavailableCanvasOverlaySource.getSecurity(projectRef)),
      guard: "failed",
      sentinel: "failed",
      message: "Security data unavailable. Architecture remains available.",
    };
  }
  return { graph, security };
}
export function canvasView(
  graph: ArchitectureGraph,
  overlay: UserCanvasOverlay = emptyOverlay(graph.projectRef),
) {
  return mergeGraph(graph, validateOverlay(overlay, graph.projectRef));
}

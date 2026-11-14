"use client";
import { useEffect, useMemo, useState } from "react";
import type { DemoState } from "@/domain/types";
import type { ArchitectureGraph, UserCanvasOverlay } from "../types";
import {
  demoPositions,
  demoProjectRef,
  demoTrust,
  DemoCanvasSource,
  demoOverlaySource,
  demoCanvasSource,
} from "../adapters/demo-source";
import fixtureGraphs from "../adapters/fixture-graphs.json";
import {
  DemoCanvasPersistence,
  MemoryCanvasPersistence,
} from "../adapters/persistence";
import { emptyOverlay } from "../graph/model";
import { canvasView, loadCanvas } from "../service";
import { validateGraph, validateOverlay } from "../validation";
import { workflowTemplate } from "../workflows/model";
import { UnavailableCanvasOverlaySource } from "../adapters/overlay-unavailable";
import type { CanvasOverlaySource, CanvasPersistencePort } from "../contracts";
export function graphSource(key: string, supplied?: ArchitectureGraph) {
  if (supplied) {
    const graph = validateGraph(supplied);
    return {
      mode: graph.mode,
      async loadGraph() {
        return graph;
      },
    };
  }
  if (key === "demo") return DemoCanvasSource;
  if (key === "empty") {
    const graph: ArchitectureGraph = {
      schemaVersion: 1,
      analyzerVersion: "internal-empty/1",
      projectRef: "internal:empty",
      mode: "snapshot",
      revision: "empty-v1",
      generatedAt: "2026-11-14T00:00:00.000Z",
      environment: "unknown",
      nodes: [],
      edges: [],
      evidence: [],
      diagnostics: [],
      coverage: [
        {
          capability: "source-coverage",
          status: "partial",
          detail: "Empty internal example; choose a readable snapshot.",
        },
      ],
    };
    return {
      mode: graph.mode,
      async loadGraph() {
        return graph;
      },
    };
  }
  const graph = validateGraph(fixtureGraphs[key as keyof typeof fixtureGraphs]);
  return {
    mode: graph.mode,
    async loadGraph() {
      return graph;
    },
  };
}
export function useCanvas(
  key: string,
  state: DemoState,
  supplied?: ArchitectureGraph,
  ports?: {
    overlays?: CanvasOverlaySource;
    persistence?: CanvasPersistencePort;
  },
) {
  const source = useMemo(
    () =>
      !supplied && key === "demo"
        ? demoCanvasSource({ provider: state.provider, branch: state.branch })
        : graphSource(key, supplied),
    [key, supplied, state.provider, state.branch],
  );
  const projectRef =
    supplied?.projectRef ??
    (key === "demo" ? demoProjectRef : `internal:${key}`);
  const [base] = useState(() => {
    const overlay = emptyOverlay(projectRef);
    if (source.mode === "demo") {
      overlay.nodePositions = demoPositions;
      overlay.trustModel = structuredClone(demoTrust);
      const workflow = workflowTemplate(0, "demo-order");
      overlay.workflowModels = [workflow];
    }
    if (supplied && supplied.nodes.length > 18) {
      overlay.groups = supplied.nodes
        .filter((n) => n.kind === "service_group")
        .map((n) => ({
          id: n.id,
          label: n.label,
          nodeIds: supplied.nodes
            .filter((m) => m.groupId === n.id)
            .map((m) => m.id),
          collapsed: true,
        }));
    }
    return overlay;
  });
  const persistence = useMemo(
    () =>
      ports?.persistence ??
      (source.mode === "demo"
        ? new DemoCanvasPersistence()
        : new MemoryCanvasPersistence()),
    [source.mode, ports?.persistence],
  );
  const [data, setData] = useState<Awaited<
    ReturnType<typeof loadCanvas>
  > | null>(() =>
    supplied
      ? {
          graph: validateGraph(supplied),
          security: {
            projectRef: supplied.projectRef,
            mode: "unavailable",
            guard: "not_scanned",
            sentinel: "not_monitored",
            findings: [],
            incidents: [],
            message:
              "Not yet scanned. Monitoring not connected. No security verification has been performed.",
          },
        }
      : null,
  );
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState("");
  const [history, setHistory] = useState<{
    past: UserCanvasOverlay[];
    present: UserCanvasOverlay;
    future: UserCanvasOverlay[];
  }>({ past: [], present: base, future: [] });
  const overlays = useMemo(
    () =>
      ports?.overlays ??
      (source.mode === "demo"
        ? demoOverlaySource(state)
        : UnavailableCanvasOverlaySource),
    [source.mode, state, ports?.overlays],
  );
  useEffect(() => {
    let active = true;
    loadCanvas(source, projectRef, overlays)
      .then((result) => {
        if (active) {
          setData(result);
          setError("");
        }
      })
      .catch(() => {
        if (active)
          setError(
            "Architecture data could not be loaded. Choose a readable snapshot or retry.",
          );
      });
    return () => {
      active = false;
    };
  }, [source, projectRef, overlays]);
  useEffect(() => {
    let active = true;
    persistence
      .load(projectRef)
      .then((saved) => {
        if (active) {
          setHistory({ past: [], present: saved ?? base, future: [] });
          setReady(true);
        }
      })
      .catch(() => {
        if (active) {
          setReady(true);
          setMessage(
            "Saved annotations could not be loaded. Edits remain available in this session; reset Canvas edits to recover.",
          );
        }
      });
    return () => {
      active = false;
    };
  }, [projectRef, persistence, base]);
  const overlay = history.present;
  const graph = useMemo(
    () => (data ? canvasView(data.graph, overlay) : null),
    [data, overlay],
  );
  function persist(next: UserCanvasOverlay) {
    void persistence
      .save(projectRef, next)
      .catch(() =>
        setMessage("Save failed. Edits remain in memory in this session."),
      );
  }
  function edit(change: (draft: UserCanvasOverlay) => void) {
    if (!ready) return;
    const draft = structuredClone(overlay);
    change(draft);
    try {
      const next = validateOverlay(draft, projectRef);
      setHistory({
        past: [...history.past.slice(-49), overlay],
        present: next,
        future: [],
      });
      persist(next);
      setMessage("Canvas edit saved. Undo applies to manual edits only.");
    } catch {
      setMessage(
        "This edit is invalid or exceeds Canvas limits. Check its fields and try again.",
      );
    }
  }
  function undo() {
    const previous = history.past.at(-1);
    if (previous) {
      setHistory({
        past: history.past.slice(0, -1),
        present: previous,
        future: [overlay, ...history.future],
      });
      persist(previous);
    }
  }
  function redo() {
    const next = history.future[0];
    if (next) {
      setHistory({
        past: [...history.past, overlay],
        present: next,
        future: history.future.slice(1),
      });
      persist(next);
    }
  }
  async function reset() {
    try {
      await persistence.reset(projectRef);
      setHistory({ past: [], present: structuredClone(base), future: [] });
      setMessage("Canvas annotations, models and positions reset.");
    } catch {
      setMessage(
        "Could not reset saved annotations; browser storage may be unavailable.",
      );
    }
  }
  return {
    graph,
    sourceGraph: data?.graph,
    security: data?.security,
    overlay,
    initialPositions: base.nodePositions,
    edit,
    undo,
    redo,
    reset,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    ready,
    error,
    message,
    overlays,
  };
}
export type CanvasController = ReturnType<typeof useCanvas>;

"use client";
import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ReactFlowProvider, useReactFlow } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  ChevronRight,
  Cloud,
  Info,
  List,
  Maximize,
  Network,
  Search,
  ShieldCheck,
  LockKeyhole,
  Workflow,
  Braces,
} from "lucide-react";
import { Badge, Button, PageHeader } from "@/components/ui";
import { useDemo } from "@/components/demo-provider";
import type { ArchitectureGraph } from "../types";
import type { CanvasOverlaySource, CanvasPersistencePort } from "../contracts";
import { useCanvas } from "../hooks/use-canvas";
import { emptyFilters, filterGraph } from "../graph/model";
import { layoutGraph } from "../graph/layout";
import { architectureExport, download, readableSummary } from "../export";
import { nodeKinds } from "../types";
import { ArchitectureFlow } from "./graph";
import { icons } from "./graph-node";
import { Inspector } from "./inspector";
import { TrustLens } from "./trust-lens";
import { WorkflowLens } from "./workflow-lens";
import { ManualEditor } from "./manual-editor";
import styles from "./canvas.module.css";
export interface CanvasProps {
  initialGraph?: ArchitectureGraph;
  ports?: {
    overlays?: CanvasOverlaySource;
    persistence?: CanvasPersistencePort;
  };
}
export function CanvasPage(props: CanvasProps) {
  const [source, setSource] = useState("demo");
  return (
    <div className={styles.root}>
      {!props.initialGraph && (
        <div className={styles.source}>
          <label>
            Canvas data source
            <select
              aria-label="Canvas data source"
              value={source}
              onChange={(e) => setSource(e.target.value)}
            >
              <option value="demo">Orderly Demo · synthetic fixtures</option>
              <option value="a">Internal snapshot · Next.js App Router</option>
              <option value="b">Internal snapshot · Pages Router</option>
              <option value="c">Internal snapshot · WetScan miniature</option>
              <option value="d">Internal snapshot · partial / malformed</option>
              <option value="e">Internal snapshot · monorepo</option>
              <option value="empty">Internal snapshot · empty</option>
            </select>
          </label>
          <small>
            Internal examples only. No user repository is connected
            (CAN-001–003).
          </small>
        </div>
      )}
      <ReactFlowProvider key={props.initialGraph ? `${props.initialGraph.projectRef}:${props.initialGraph.revision}` : source}>
        <CanvasWorkspace source={source} {...props} />
      </ReactFlowProvider>
    </div>
  );
}
function CanvasWorkspace({
  source,
  initialGraph,
  ports,
}: CanvasProps & { source: string }) {
  const { state, dark } = useDemo();
  const params = useSearchParams();
  const flow = useReactFlow();
  const controller = useCanvas(source, state, initialGraph, ports);
  const { graph, overlay, security } = controller;
  const [selected, setSelected] = useState(params.get("node") ?? "");
  const [edgeId, setEdgeId] = useState("");
  const [lens, setLens] = useState("Architecture");
  const [filters, setFilters] = useState(emptyFilters);
  const [list, setList] = useState(false);
  const [environment, setEnvironment] = useState("current");
  const allPositions = useMemo(
    () => (graph ? { ...layoutGraph(graph), ...overlay.nodePositions } : {}),
    [graph, overlay.nodePositions],
  );
  const findings = useMemo(
    () =>
      (security?.findings ?? []).filter(
        (f) =>
          (!filters.severity || f.severity === filters.severity) &&
          (!filters.status || f.status === filters.status) &&
          (!filters.source || f.source === filters.source) &&
          (!filters.priority || f.priority === filters.priority),
      ),
    [security, filters],
  );
  const collapsedGroups = overlay.groups.filter((g) => g.collapsed);
  const excluded = new Set([
    ...overlay.hiddenNodeIds,
    ...collapsedGroups.flatMap((g) => g.nodeIds),
  ]);
  const visibleGraph = graph
    ? {
        ...graph,
        nodes: graph.nodes.filter((n) => !excluded.has(n.id)),
        edges: graph.edges.filter(
          (e) => !excluded.has(e.source) && !excluded.has(e.target),
        ),
      }
    : null;
  const visible = visibleGraph
    ? filterGraph(visibleGraph, filters, [
        ...findings.map((f) => f.nodeId),
        ...(security?.incidents.map((i) => i.nodeId) ?? []),
      ])
    : { nodes: [], edges: [] };
  const node = visible.nodes.find((n) => n.id === selected);
  const edge = visible.edges.find((e) => e.id === edgeId);
  function choose(id: string) {
    setSelected(id);
    setEdgeId("");
    const point = allPositions[id];
    if (point && !list)
      void flow.setCenter(point.x + 110, point.y + 70, {
        zoom: 0.85,
        duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? 0
          : 300,
      });
  }
  const patchFilter = (key: keyof typeof filters, value: string | boolean) =>
    setFilters((f) => ({ ...f, [key]: value }));
  const clear = () => {
    setSelected("");
    setEdgeId("");
  };
  if (controller.error)
    return (
      <div className="page">
        <h1>Canvas data unavailable</h1>
        <p role="alert">{controller.error}</p>
        <Button onClick={() => window.location.reload()}>Retry Canvas</Button>
      </div>
    );
  if (!graph || !security)
    return (
      <div className="page" role="status">
        Preparing your application map…
      </div>
    );
  return (
    <div
      className="page canvas-page"
      onKeyDown={(e) => {
        if (e.key === "Escape") clear();
      }}
    >
      <PageHeader
        eyebrow="UNDERSTAND YOUR APP"
        title="Everything is connected."
        description="Follow the connections. Find the context. Know your next step."
        action={
          <Badge tone="blue">
            {graph.mode === "demo"
              ? "Demo architecture"
              : `${graph.mode} · source observations`}
          </Badge>
        }
      />
      <div className={styles.metadata}>
        <span>
          {graph.projectRef} · {graph.branch ?? "branch unknown"}
        </span>
        <span>
          Revision:{" "}
          {graph.mode === "demo"
            ? `${state.branch} · ${graph.revision}`
            : graph.revision}
        </span>
        <span>
          {graph.mode === "demo" ? "Fixture date" : "Last analyzed"}:{" "}
          {graph.generatedAt}
        </span>
        <span>
          {graph.mode === "demo"
            ? "Annotations / positions / models saved in this browser only"
            : ports?.persistence
              ? "Persistence supplied by workspace adapter"
              : "Edits in page memory only; lost on reload or navigation"}
        </span>
      </div>
      <div className="canvas-toolbar">
        <div className="segmented" aria-label="Canvas lens">
          {[
            { label: "Architecture", Icon: Network },
            { label: "Security", Icon: ShieldCheck },
            { label: "Trust", Icon: LockKeyhole },
            { label: "Workflows", Icon: Workflow },
          ].map(({ label, Icon }) => (
            <button
              key={label}
              aria-pressed={lens === label}
              className={lens === label ? "selected" : ""}
              onClick={() => setLens(label)}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
        </div>
        <div className="canvas-tools">
          <label className="sr-only" htmlFor="canvas-environment">
            Environment
          </label>
          <select
            id="canvas-environment"
            value={environment}
            onChange={(e) => setEnvironment(e.target.value)}
          >
            <option value="current">
              {graph.mode === "demo"
                ? "Staging"
                : graph.environment === "unknown"
                  ? "Unknown · source snapshot"
                  : graph.environment}
            </option>
            <option value="production">Production · no map</option>
          </select>
          <button
            className="icon-button"
            aria-label={list ? "Show graph" : "Show component list"}
            title="Toggle graph or accessible list"
            onClick={() => setList(!list)}
          >
            {list ? <Network size={18} /> : <List size={18} />}
          </button>
          <Button
            variant="secondary"
            disabled={list || lens === "Workflows"}
            onClick={() =>
              void flow.fitView({
                padding: 0.15,
                duration: window.matchMedia("(prefers-reduced-motion: reduce)")
                  .matches
                  ? 0
                  : 300,
              })
            }
          >
            <Maximize size={15} />
            Fit map
          </Button>
        </div>
      </div>
      <div className={styles.actions}>
        <Button
          variant="secondary"
          disabled={!controller.canUndo}
          onClick={controller.undo}
        >
          Undo Canvas edit
        </Button>
        <Button
          variant="secondary"
          disabled={!controller.canRedo}
          onClick={controller.redo}
        >
          Redo Canvas edit
        </Button>
        <Button
          variant="secondary"
          onClick={() =>
            controller.edit((o) => {
              o.nodePositions = layoutGraph(graph);
            })
          }
        >
          Auto layout
        </Button>
        <Button
          variant="secondary"
          onClick={() =>
            controller.edit((o) => {
              o.nodePositions = controller.initialPositions;
            })
          }
        >
          Reset layout
        </Button>
        <Button
          variant="secondary"
          onClick={() =>
            download(
              "canvas-architecture.json",
              architectureExport(controller.sourceGraph!, overlay),
            )
          }
        >
          Export architecture JSON
        </Button>
        <Button
          variant="secondary"
          onClick={() =>
            download("canvas-summary.txt", readableSummary(graph), true)
          }
        >
          Export readable summary
        </Button>
        <Button variant="ghost" onClick={() => void controller.reset()}>
          Reset Canvas edits
        </Button>
      </div>
      <p role="status" className={styles.feedback}>
        {controller.message}
      </p>
      {environment === "production" ? (
        <div className="empty card">
          <Cloud size={35} />
          <h2>No production map yet</h2>
          <p>
            No production resources are connected. Source configuration does not
            establish a deployment.
          </p>
          <Button onClick={() => setEnvironment("current")}>
            {graph.mode === "demo"
              ? "Return to demo staging"
              : "Return to source snapshot"}
          </Button>
        </div>
      ) : (
        <>
          {lens === "Security" && (
            <section aria-label="Security coverage" className={styles.security}>
              <strong>{security.message}</strong>
              <p>
                Guard:{" "}
                {security.guard === "not_scanned"
                  ? "Not yet scanned"
                  : security.guard}{" "}
                · Sentinel:{" "}
                {security.sentinel === "not_monitored"
                  ? "Monitoring not connected"
                  : security.sentinel}
              </p>
              <div className="canvas-form-row">
                {(
                  [
                    ["severity", ["critical", "high", "medium", "low", "info"]],
                    [
                      "status",
                      Array.from(
                        new Set(security.findings.map((f) => f.status)),
                      ),
                    ],
                    ["source", ["Guard", "Sentinel", "Manual"]],
                    ["priority", ["review", "resolved"]],
                  ] as const
                ).map(([name, choices]) => (
                  <label key={name}>
                    Security {name}
                    <select
                      aria-label={`Security ${name}`}
                      value={filters[name]}
                      onChange={(e) => patchFilter(name, e.target.value)}
                    >
                      <option value="">All {name}</option>
                      {choices.map((v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
                <label className="check-line">
                  <input
                    type="checkbox"
                    checked={filters.affected}
                    onChange={(e) => patchFilter("affected", e.target.checked)}
                  />
                  Only affected components
                </label>
              </div>
              <ul>
                {findings.map((f) => (
                  <li key={f.id}>
                    <button onClick={() => choose(f.nodeId)}>
                      {f.severity} · {f.id}: {f.title} · {f.status} ·{" "}
                      {f.simulated ? "Demo / Simulated" : f.source}
                    </button>
                  </li>
                ))}
              </ul>
              {!findings.length && (
                <p>
                  No results from the selected coverage / filters. This does not
                  mean the app is secure.
                </p>
              )}
            </section>
          )}
          {(selected || edgeId) && !node && !edge && (
            <div className="notice">
              <Info size={17} />
              <div>
                Selected item is hidden or no longer in this revision. Clear
                filters or unhide components to inspect it.
                <Button
                  variant="secondary"
                  onClick={() => {
                    setFilters(emptyFilters);
                    controller.edit((o) => {
                      o.hiddenNodeIds = [];
                      o.groups = o.groups.map((g) => ({
                        ...g,
                        collapsed: false,
                      }));
                    });
                  }}
                >
                  Clear filters and reveal selection
                </Button>
              </div>
            </div>
          )}
          <div className="canvas-workspace">
            <aside
              className="component-explorer"
              aria-label="Component explorer"
            >
              <div className="explorer-heading">
                <strong>Components</strong>
                <span>{visible.nodes.length}</span>
              </div>
              <div className="search-input">
                <Search size={15} />
                <input
                  aria-label="Find a component"
                  placeholder="Find a component…"
                  value={filters.search}
                  onChange={(e) => patchFilter("search", e.target.value)}
                />
              </div>
              <label className="check-line verified-filter">
                <input
                  type="checkbox"
                  checked={filters.origin === "verified"}
                  onChange={(e) =>
                    patchFilter("origin", e.target.checked ? "verified" : "")
                  }
                />
                Verified only
              </label>
              <label>
                Component kind
                <select
                  aria-label="Component kind"
                  value={filters.kind}
                  onChange={(e) => patchFilter("kind", e.target.value)}
                >
                  <option value="">All kinds</option>
                  {nodeKinds.map((k) => (
                    <option key={k} value={k}>
                      {k.replaceAll("_", " ")}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Evidence source
                <select
                  aria-label="Evidence source"
                  value={filters.origin}
                  onChange={(e) => patchFilter("origin", e.target.value)}
                >
                  <option value="">All provenance</option>
                  <option value="verified">Verified source observation</option>
                  <option value="inferred">Inferred</option>
                  <option value="user_added">User-added</option>
                </select>
              </label>
              <Button variant="ghost" onClick={() => setFilters(emptyFilters)}>
                Clear filters
              </Button>
              <div className="component-list">
                {visible.nodes.map((n) => {
                  const Icon = icons[n.kind] ?? Braces;
                  return (
                    <button
                      key={n.id}
                      aria-pressed={selected === n.id}
                      className={selected === n.id ? "selected" : ""}
                      onClick={() => choose(n.id)}
                    >
                      <Icon size={16} />
                      <span>
                        {n.label}
                        <small>{n.kind}</small>
                      </span>
                      {findings.some((f) => f.nodeId === n.id) && (
                        <span className="component-issue">
                          {findings.filter((f) => f.nodeId === n.id).length}
                        </span>
                      )}
                    </button>
                  );
                })}
                {!visible.nodes.length && (
                  <p className="muted">
                    No components match. Clear your search or choose another
                    snapshot to recover.
                  </p>
                )}
              </div>
              <div className={styles.groups}>
                {graph.nodes
                  .filter(
                    (n) =>
                      n.kind === "service_group" &&
                      !overlay.groups.some((g) => g.id === n.id),
                  )
                  .map((n) => (
                    <Button
                      key={n.id}
                      variant="ghost"
                      onClick={() =>
                        controller.edit((o) => {
                          o.groups.push({
                            id: n.id,
                            label: n.label,
                            nodeIds: graph.nodes
                              .filter((member) => member.groupId === n.id)
                              .map((member) => member.id),
                            collapsed: true,
                          });
                        })
                      }
                    >
                      Collapse group {n.label}
                    </Button>
                  ))}
                {overlay.groups.map((g) => (
                  <Button
                    key={g.id}
                    variant="ghost"
                    onClick={() =>
                      controller.edit((o) => {
                        o.groups.find((v) => v.id === g.id)!.collapsed =
                          !g.collapsed;
                      })
                    }
                  >
                    {g.collapsed ? "Expand" : "Collapse"} group {g.label}
                  </Button>
                ))}
              </div>
              {overlay.hiddenNodeIds.length > 0 && (
                <Button
                  variant="secondary"
                  onClick={() =>
                    controller.edit((o) => {
                      o.hiddenNodeIds = [];
                    })
                  }
                >
                  Unhide {overlay.hiddenNodeIds.length} components
                </Button>
              )}
              <div className="explorer-bottom">
                <span>
                  {graph.mode === "demo"
                    ? state.branch
                    : (graph.branch ?? "unknown")}{" "}
                  · {graph.revision}
                </span>
                <small>
                  {graph.mode === "demo"
                    ? "Synthetic commit"
                    : "Pinned internal / authorized source revision"}
                </small>
              </div>
            </aside>
            <div
              className={`graph-area ${list ? "list-mode" : ""} ${lens === "Workflows" ? styles.workflowArea : ""}`}
            >
              {lens === "Workflows" ? (
                <WorkflowLens
                  controller={controller}
                  graph={graph}
                  dark={dark}
                />
              ) : (
                <>
                  <div className="graph-caption">
                    {graph.mode === "demo"
                      ? "ORDERLY · STAGING ARCHITECTURE"
                      : "STATIC SOURCE MAP · RUNTIME UNKNOWN"}
                  </div>
                  <div className="flow-desktop">
                    <ArchitectureFlow
                      graph={graph}
                      nodes={visible.nodes}
                      edges={visible.edges}
                      positions={allPositions}
                      selected={selected}
                      edgeId={edgeId}
                      lens={lens}
                      dark={dark}
                      overlay={overlay}
                      findings={findings}
                      onSelect={choose}
                      onEdge={(id) => {
                        setEdgeId(id);
                        setSelected("");
                      }}
                      onPosition={(id, p) =>
                        controller.edit((o) => {
                          o.nodePositions[id] = p;
                        })
                      }
                    />
                  </div>
                  <div
                    className="graph-list-fallback"
                    aria-label="Accessible component list"
                  >
                    {visible.nodes.map((n) => (
                      <button key={n.id} onClick={() => choose(n.id)}>
                        <Network size={20} />
                        <span>
                          <strong>{n.label}</strong>
                          <small>
                            {n.technology ?? n.kind} · {n.origin}
                          </small>
                        </span>
                        <ChevronRight size={16} />
                      </button>
                    ))}
                  </div>
                  <div
                    className="graph-edge-list"
                    aria-label="Accessible connection list"
                  >
                    {visible.edges.map((e) => (
                      <button
                        key={e.id}
                        onClick={() => {
                          setEdgeId(e.id);
                          setSelected("");
                        }}
                      >
                        <Network size={20} />
                        <span>
                          {graph.nodes.find((n) => n.id === e.source)?.label} →{" "}
                          {graph.nodes.find((n) => n.id === e.target)?.label}
                          <small>
                            {e.description ?? e.relationship} · {e.origin}
                          </small>
                        </span>
                      </button>
                    ))}
                  </div>
                  {!selected && !edgeId && (
                    <div className="graph-hint">
                      <Info size={16} />
                      Click any component or connection to see what WetScan
                      knows.
                    </div>
                  )}
                </>
              )}
            </div>
            <Inspector
              graph={graph}
              node={node}
              edge={edge}
              controller={controller}
              security={security}
              choose={choose}
              clear={clear}
              related={(id) => patchFilter("relatedId", id)}
              workflow={() => setLens("Workflows")}
            />
          </div>
          {lens === "Trust" && (
            <TrustLens controller={controller} graph={graph} />
          )}
          <ManualEditor graph={graph} controller={controller} />
          <div className="canvas-legend">
            <div>
              {(["verified", "inferred", "user_added"] as const).map(
                (origin) => (
                  <span key={origin}>
                    <i className={`origin-dot ${origin}`} />
                    {origin.replace("_", " ")}
                  </span>
                ),
              )}
              <span>
                <i className="severity-dot high" />
                Finding to review
              </span>
            </div>
            <small>
              {graph.mode === "demo"
                ? "All provenance is scoped to demo fixtures"
                : "Verified source ≠ deployed, connected or secure"}
            </small>
          </div>
          <details className={styles.coverage}>
            <summary>
              Discovery coverage and limitations · {graph.diagnostics.length}{" "}
              diagnostics
            </summary>
            <p>
              Partial map. Inferred relationships need confirmation. User-added
              content has not been automatically verified.
            </p>
            {graph.coverage.map((c) => (
              <p key={c.capability}>
                <strong>
                  {c.capability} · {c.status}
                </strong>{" "}
                — {c.detail}
              </p>
            ))}
            {graph.diagnostics.map((d, i) => (
              <p key={`${d.code}:${i}`}>
                {d.code}: {d.message} {d.sourcePath}
              </p>
            ))}
            <p>
              Analyzer: {graph.analyzerVersion}. Guard / Sentinel / authorized
              project integration: CAN-001–015.
            </p>
          </details>
        </>
      )}
    </div>
  );
}

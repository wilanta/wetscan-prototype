"use client";
import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  AppWindow,
  ArrowRight,
  Braces,
  CheckCircle2,
  ChevronRight,
  Cloud,
  Database,
  GitBranch,
  Info,
  KeyRound,
  Layers,
  List,
  LockKeyhole,
  Maximize,
  Network,
  Radio,
  Search,
  ShieldCheck,
  Workflow,
  X,
} from "lucide-react";
import {
  nodes as fixtures,
  edges as fixtureEdges,
  PROJECT,
  findings,
} from "@/data/demo";
import type { AppNode } from "@/domain/types";
import { Badge, Button, LinkButton, Notice, PageHeader } from "../ui";
import { useDemo } from "../demo-provider";
const icons: Record<string, typeof Braces> = {
  frontend: AppWindow,
  api: Braces,
  auth: KeyRound,
  database: Database,
  repository: GitBranch,
  release: Workflow,
  hosting: Cloud,
  telemetry: Radio,
};
type ComponentNode = Node<
  { component: AppNode; mode: string; fixed: boolean },
  "component"
>;
function GraphNode({ data, selected }: NodeProps<ComponentNode>) {
  const n = data.component;
  const Icon = icons[n.kind] || Braces;
  return (
    <div
      className={`graph-node ${selected ? "selected" : ""} ${n.id === "orders-api" && !data.fixed ? "at-risk" : ""} ${data.mode === "Security" && n.id === "orders-api" ? "security-highlight" : ""}`}
    >
      <Handle type="target" position={Position.Left} id="target-left" />
      {n.kind === "api" && (
        <>
          <Handle
            type="target"
            position={Position.Top}
            id="target-top"
            style={{ left: "35%" }}
          />
          <Handle
            type="source"
            position={Position.Top}
            id="source-top"
            style={{ left: "75%" }}
          />
        </>
      )}
      {n.kind === "auth" && (
        <Handle
          type="source"
          position={Position.Bottom}
          id="source-bottom"
          style={{ left: "35%" }}
        />
      )}
      {n.kind === "telemetry" && (
        <Handle type="target" position={Position.Bottom} id="target-bottom" />
      )}
      <div className="graph-node-top">
        <span className={`node-icon ${n.kind}`}>
          <Icon size={20} />
        </span>
        <span className="node-kind">{n.kind}</span>
        {n.evidenceOrigin === "verified" && <CheckCircle2 size={13} />}
      </div>
      <strong>{n.label}</strong>
      <small>{n.tech}</small>
      <div className="graph-node-footer">
        {n.id === "orders-api" && !data.fixed ? (
          <>
            <span className="severity-dot high" />1 finding to review
          </>
        ) : (
          <>
            <span className={`origin-dot ${n.evidenceOrigin}`} />
            {n.evidenceOrigin.replace("_", " ")}{" "}
            <span className="demo-origin">· demo</span>
          </>
        )}
      </div>
      <Handle type="source" position={Position.Right} id="source-right" />
    </div>
  );
}
const nodeTypes = { component: GraphNode };
export function Canvas() {
  return (
    <ReactFlowProvider>
      <CanvasInner />
    </ReactFlowProvider>
  );
}
function CanvasInner() {
  const { state, dark } = useDemo();
  const searchParams = useSearchParams();
  const [selected, setSelected] = useState(searchParams.get("node") || "");
  const [edge, setEdge] = useState("");
  const [mode, setMode] = useState("Architecture");
  const [search, setSearch] = useState("");
  const [verified, setVerified] = useState(false);
  const [list, setList] = useState(false);
  const [role, setRole] = useState("Customer");
  const [environment, setEnvironment] = useState("staging");
  const flow = useReactFlow();
  const components = fixtures.filter(
    (n) =>
      (!verified || n.evidenceOrigin === "verified") &&
      n.label.toLowerCase().includes(search.toLowerCase()),
  );
  const graphNodes = useMemo<ComponentNode[]>(
    () =>
      fixtures
        .filter((n) => !verified || n.evidenceOrigin === "verified")
        .map((n) => ({
          id: n.id,
          type: "component",
          position: { x: n.x, y: n.y },
          data: {
            component:
              n.kind === "repository"
                ? {
                    ...n,
                    tech: `${state.provider === "github" ? "GitHub" : "GitLab"} · ${state.branch}`,
                  }
                : n,
            mode,
            fixed: state.findingStatus === "verified_fixed",
          },
          selected: n.id === selected,
          ariaLabel: `${n.label}, ${n.kind}, ${n.evidenceOrigin} in demo`,
        })),
    [
      verified,
      mode,
      state.findingStatus,
      state.provider,
      state.branch,
      selected,
    ],
  );
  const graphEdges = useMemo(
    () =>
      fixtureEdges
        .filter((e) => !verified || e.evidenceOrigin === "verified")
        .map((e) => ({
          ...e,
          selected: e.id === edge,
          sourceHandle:
            e.id === "identity"
              ? "source-bottom"
              : e.id === "observe"
                ? "source-top"
                : "source-right",
          targetHandle:
            e.id === "identity"
              ? "target-top"
              : e.id === "observe"
                ? "target-bottom"
                : "target-left",
          type: "smoothstep",
          animated: mode === "Security" && e.source === "orders-api",
          label: e.label,
          markerEnd: {
            type: MarkerType.ArrowClosed,
            width: 14,
            height: 14,
            color:
              mode === "Security" && e.source === "orders-api"
                ? "#c5752a"
                : "#a2aec5",
          },
          style: {
            stroke:
              mode === "Security" && e.source === "orders-api"
                ? "#c5752a"
                : "var(--graph-edge)",
            strokeWidth: 1.5,
            strokeDasharray:
              e.evidenceOrigin === "inferred" ? "5 5" : undefined,
          },
          labelStyle: { fontSize: 10, fill: "var(--ink-muted)" },
          labelBgStyle: { fill: "var(--surface)" },
          ariaLabel: `${e.source} to ${e.target}, ${e.label}`,
        })),
    [verified, mode, edge],
  );
  const component = fixtures.find((n) => n.id === selected);
  const connection = fixtureEdges.find((e) => e.id === edge);
  function choose(id: string) {
    setSelected(id);
    setEdge("");
    const n = fixtures.find((n) => n.id === id);
    if (n && !list)
      flow.setCenter(n.x + 110, n.y + 70, {
        zoom: 0.85,
        duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? 0
          : 300,
      });
  }
  return (
    <div className="page canvas-page">
      <PageHeader
        eyebrow="UNDERSTAND YOUR APP"
        title="Everything is connected."
        description="Follow the connections. Find the context. Know your next step."
        action={<Badge tone="blue">Demo architecture</Badge>}
      />
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
              aria-pressed={mode === label}
              className={mode === label ? "selected" : ""}
              onClick={() => setMode(label)}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
        </div>
        <div className="canvas-tools">
          <label className="sr-only" htmlFor="environment">
            Environment
          </label>
          <select
            id="environment"
            value={environment}
            onChange={(e) => setEnvironment(e.target.value)}
          >
            <option value="staging">Staging</option>
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
            disabled={list}
            onClick={() =>
              flow.fitView({
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
      {environment === "production" ? (
        <div className="empty card">
          <Cloud size={35} />
          <h2>No production map yet</h2>
          <p>
            The sample architecture covers staging only. No production resources
            are connected.
          </p>
          <Button onClick={() => setEnvironment("staging")}>
            Return to demo staging
          </Button>
        </div>
      ) : (
        <>
          <div className="canvas-workspace">
            <aside className="component-explorer">
              <div className="explorer-heading">
                <strong>Components</strong>
                <span>{components.length}</span>
              </div>
              <div className="search-input">
                <Search size={15} />
                <input
                  aria-label="Find a component"
                  placeholder="Find a component…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <label className="check-line verified-filter">
                <input
                  type="checkbox"
                  checked={verified}
                  onChange={(e) => setVerified(e.target.checked)}
                />
                Verified only
              </label>
              <div className="component-list">
                {components.map((n) => {
                  const Icon = icons[n.kind] || Braces;
                  return (
                    <button
                      key={n.id}
                      className={selected === n.id ? "selected" : ""}
                      onClick={() => choose(n.id)}
                    >
                      <Icon size={16} />
                      <span>
                        {n.label}
                        <small>{n.kind}</small>
                      </span>
                      {n.findingIds.length > 0 && (
                        <span className="component-issue">1</span>
                      )}
                    </button>
                  );
                })}
                {!components.length && (
                  <p className="muted">
                    No components match. Clear your search to try again.
                  </p>
                )}
              </div>
              <div className="explorer-bottom">
                <GitBranch size={14} />
                {state.branch}
                <span>· a1b2c3d</span>
                <small>Synthetic commit</small>
              </div>
            </aside>
            <div className={`graph-area ${list ? "list-mode" : ""}`}>
              {mode === "Architecture" && (
                <div className="graph-caption">
                  <span className="live-dot" />
                  ORDERLY · STAGING ARCHITECTURE
                </div>
              )}
              {mode === "Trust" && (
                <div className="lens-note">
                  <strong>Who should access an order?</strong>
                  <label>
                    Role
                    <select
                      aria-label="Role"
                      value={role}
                      onChange={(e) => setRole(e.target.value)}
                    >
                      <option>Customer</option>
                      <option>Staff</option>
                      <option>Admin</option>
                    </select>
                  </label>
                  <p>
                    {role === "Customer"
                      ? "Expected: own orders only. Observed demo fixture: another customer’s order is readable."
                      : role === "Staff"
                        ? "Expected: assigned orders only. No scoped staff-access evidence yet."
                        : "Expected: all orders with an audited admin role. No admin-access evidence yet."}
                  </p>
                </div>
              )}
              {mode === "Workflows" ? (
                <div className="workflow-canvas">
                  <Badge tone="blue">Integrity · workflow overlay</Badge>
                  <h2>An order should stay locked.</h2>
                  <div className="workflow-steps">
                    <span>Draft</span>
                    <ArrowRight />
                    <span>Approved</span>
                    <ArrowRight />
                    <span>
                      <LockKeyhole size={16} />
                      Locked
                    </span>
                  </div>
                  <div className="forbidden-transition">
                    <span>Observed demo transition</span>
                    <strong>Locked → Edited</strong>
                    <Badge tone="red">Forbidden</Badge>
                  </div>
                  <p>
                    Expected: reject updates after approval is locked.
                    <br />
                    Fixture: update accepted with status 200.
                  </p>
                  <LinkButton href={`${PROJECT}/guard/integrity`}>
                    Inspect the workflow test <ArrowRight size={16} />
                  </LinkButton>
                </div>
              ) : (
                <>
                  <div className="flow-desktop">
                    <ReactFlow<ComponentNode>
                      nodes={graphNodes}
                      edges={graphEdges}
                      nodeTypes={nodeTypes}
                      onNodesChange={(changes) => {
                        for (const change of changes) {
                          if (change.type === "select" && change.selected) {
                            setSelected(change.id);
                            setEdge("");
                          }
                        }
                      }}
                      onEdgesChange={(changes) => {
                        for (const change of changes) {
                          if (change.type === "select" && change.selected) {
                            setEdge(change.id);
                            setSelected("");
                          }
                        }
                      }}
                      onNodeClick={(_, node) => {
                        setSelected(node.id);
                        setEdge("");
                      }}
                      onEdgeClick={(_, e) => {
                        setEdge(e.id);
                        setSelected("");
                      }}
                      nodesDraggable={false}
                      nodesConnectable={false}
                      fitView
                      fitViewOptions={{ padding: 0.15 }}
                      minZoom={0.3}
                      maxZoom={1.5}
                      colorMode={dark ? "dark" : "light"}
                      proOptions={{ hideAttribution: true }}
                    >
                      <Background
                        color={dark ? "#364157" : "#d7dfec"}
                        gap={22}
                        size={1}
                      />
                      <Controls showInteractive={false} />
                    </ReactFlow>
                  </div>
                  <div className="graph-list-fallback">
                    {components.map((n) => {
                      const Icon = icons[n.kind] || Braces;
                      return (
                        <button key={n.id} onClick={() => choose(n.id)}>
                          <Icon size={22} />
                          <span>
                            <strong>{n.label}</strong>
                            <small>{n.tech}</small>
                          </span>
                          <ChevronRight size={16} />
                        </button>
                      );
                    })}
                  </div>
                  {!selected && !edge && (
                    <div className="graph-hint">
                      <Info size={16} />
                      Click any component or connection to see what WetScan
                      knows.
                    </div>
                  )}
                </>
              )}
            </div>
            <aside
              className={`inspector ${component || connection ? "has-selection" : ""}`}
            >
              <div className="inspector-heading">
                <span>INSPECTOR</span>
                {(component || connection) && (
                  <button
                    aria-label="Clear selection"
                    className="icon-button"
                    onClick={() => {
                      setSelected("");
                      setEdge("");
                    }}
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
              {component ? (
                <>
                  <span className={`inspector-icon ${component.kind}`}>
                    {(() => {
                      const Icon = icons[component.kind] || Braces;
                      return <Icon size={25} />;
                    })()}
                  </span>
                  <h2>{component.label}</h2>
                  <p>{component.description}</p>
                  <Badge
                    tone={
                      component.evidenceOrigin === "verified"
                        ? "green"
                        : "neutral"
                    }
                  >
                    {component.evidenceOrigin.replace("_", " ")} · demo fixture
                  </Badge>
                  <dl className="inspector-meta">
                    <div>
                      <dt>Component</dt>
                      <dd>{component.kind}</dd>
                    </div>
                    <div>
                      <dt>Environment</dt>
                      <dd>Staging</dd>
                    </div>
                    <div>
                      <dt>Source</dt>
                      <dd>Synthetic app map</dd>
                    </div>
                    <div>
                      <dt>Owner</dt>
                      <dd>Northstar Studio</dd>
                    </div>
                  </dl>
                  <h3>What needs attention</h3>
                  {component.id === "orders-api" ? (
                    <div className="inspector-finding">
                      <Badge tone="amber">
                        High · {state.findingStatus.replaceAll("_", " ")}
                      </Badge>
                      <strong>Who can see an order?</strong>
                      <p>
                        A customer may read another customer’s order details.
                      </p>
                      <LinkButton href={`${PROJECT}/guard/findings/FIND-102`}>
                        View evidence <ArrowRight size={15} />
                      </LinkButton>
                      <small>FIND-102 · Synthetic API test</small>
                    </div>
                  ) : component.findingIds.length > 0 ? (
                    <div className="inspector-finding">
                      <Badge>Inferred · demo fixture</Badge>
                      <strong>
                        {
                          findings.find((f) => f.id === component.findingIds[0])
                            ?.title
                        }
                      </strong>
                      <LinkButton
                        href={`${PROJECT}/guard/findings/${component.findingIds[0]}`}
                      >
                        View evidence <ArrowRight size={15} />
                      </LinkButton>
                    </div>
                  ) : (
                    <p className="muted small-text">
                      No linked findings in this fixture. This does not
                      establish security coverage.
                    </p>
                  )}
                  <h3>Related activity</h3>
                  {state.incidents.length && component.id === "orders-api" ? (
                    <LinkButton
                      secondary
                      href={`${PROJECT}/sentinel/incidents/${state.incidents.at(-1)!.id}`}
                    >
                      View simulated incident
                    </LinkButton>
                  ) : (
                    <p className="muted small-text">
                      No runtime source connected.
                    </p>
                  )}
                </>
              ) : connection ? (
                <>
                  <Network size={28} />
                  <h2>{connection.label}</h2>
                  <p>
                    {fixtures.find((n) => n.id === connection.source)?.label} →{" "}
                    {fixtures.find((n) => n.id === connection.target)?.label}
                  </p>
                  <Badge>{connection.evidenceOrigin} · demo</Badge>
                  <Notice>
                    Describes a synthetic architecture relationship.{" "}
                    {connection.evidenceOrigin === "inferred"
                      ? "The actual relationship has not been established."
                      : "Confirmed only in the fixture definition."}
                  </Notice>
                  <p>
                    Identity and authorization remain separate. A connection
                    alone does not prove access is permitted.
                  </p>
                </>
              ) : (
                <div className="inspector-empty">
                  <span>
                    <Layers size={28} />
                  </span>
                  <h3>A little more context.</h3>
                  <p>
                    Select a component to understand its role, evidence, and
                    what needs attention.
                  </p>
                  <Button
                    variant="secondary"
                    onClick={() => choose("orders-api")}
                  >
                    Explore Orders API
                    <ArrowRight size={15} />
                  </Button>
                </div>
              )}
            </aside>
          </div>
          <div className="canvas-legend">
            <div>
              <span>
                <i className="origin-dot verified" />
                Verified
              </span>
              <span>
                <i className="origin-dot inferred" />
                Inferred
              </span>
              <span>
                <i className="origin-dot user_added" />
                User-added
              </span>
              <span>
                <i className="severity-dot high" />
                Finding to review
              </span>
            </div>
            <small>All provenance is scoped to demo fixtures</small>
          </div>
        </>
      )}
    </div>
  );
}

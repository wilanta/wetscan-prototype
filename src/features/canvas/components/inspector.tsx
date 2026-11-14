"use client";
import { ArrowRight, Layers, Network, X } from "lucide-react";
import { Badge, Button, LinkButton } from "@/components/ui";
import type {
  ArchitectureGraph,
  ComponentEdge,
  ComponentNode,
  SecurityOverlay,
} from "../types";
import type { CanvasController } from "../hooks/use-canvas";
import { icons } from "./graph-node";
import { EvidencePanel } from "./evidence-panel";
import { demoFocusNode, demoLinks } from "../adapters/demo-source";
import { download, sanitize } from "../export";
export function Inspector({
  graph,
  node,
  edge,
  controller,
  security,
  choose,
  clear,
  related,
  workflow,
}: {
  graph: ArchitectureGraph;
  node?: ComponentNode;
  edge?: ComponentEdge;
  controller: CanvasController;
  security: SecurityOverlay;
  choose(id: string): void;
  clear(): void;
  related(id: string): void;
  workflow(): void;
}) {
  const item = node ?? edge;
  const Icon = node ? (icons[node.kind] ?? Network) : Network;
  const { overlay, edit } = controller;
  return (
    <aside
      className={`inspector ${item ? "has-selection" : ""}`}
      aria-label="Canvas inspector"
      onKeyDown={(e) => {
        if (e.key === "Escape") clear();
      }}
    >
      <div className="inspector-heading">
        <span>INSPECTOR</span>
        {item && (
          <button
            aria-label="Clear selection"
            className="icon-button"
            onClick={clear}
          >
            <X size={16} />
          </button>
        )}
      </div>
      {item ? (
        <>
          <span className={`inspector-icon ${node?.kind ?? ""}`}>
            <Icon size={25} />
          </span>
          <h2>{node?.label ?? edge?.description ?? edge?.relationship}</h2>
          <p>
            {node
              ? (node.description ??
                (node.origin === "user_added"
                  ? "User-added context. No generated source evidence is attached."
                  : "Architecture context. Review the source evidence; runtime behavior is unverified."))
              : `${graph.nodes.find((n) => n.id === edge?.source)?.label ?? "Unknown source"} → ${graph.nodes.find((n) => n.id === edge?.target)?.label ?? "Unknown target"}`}
          </p>
          <Badge>
            {item.origin.replace("_", " ")} ·{" "}
            {graph.mode === "demo" ? "demo fixture" : "source observation"}
          </Badge>
          <dl className="inspector-meta">
            <div>
              <dt>Component</dt>
              <dd>{node?.kind ?? edge?.relationship}</dd>
            </div>
            <div>
              <dt>Environment</dt>
              <dd>{graph.environment}</dd>
            </div>
            <div>
              <dt>Revision</dt>
              <dd>{graph.revision}</dd>
            </div>
            <div>
              <dt>Technology</dt>
              <dd>{node?.technology ?? "Not established"}</dd>
            </div>
          </dl>
          {node && (
            <>
              <h3>What needs attention</h3>
              {security.findings
                .filter((f) => f.nodeId === node.id)
                .map((f) => (
                  <div className="inspector-finding" key={f.id}>
                    <Badge tone="amber">
                      {f.severity} · {f.status.replaceAll("_", " ")}
                    </Badge>
                    <strong>{f.title}</strong>
                    <p>
                      {f.evidenceType}: {f.evidence}
                    </p>
                    {f.href && (
                      <LinkButton href={f.href}>
                        View evidence <ArrowRight size={15} />
                      </LinkButton>
                    )}
                    <small>
                      {f.id} · {f.simulated ? "Synthetic / Demo" : f.source}
                    </small>
                  </div>
                ))}
              {!security.findings.some((f) => f.nodeId === node.id) && (
                <p>
                  {graph.mode === "demo"
                    ? "No linked findings in this fixture. This does not establish security coverage."
                    : "Not yet scanned. Guard findings are not connected."}
                </p>
              )}
              <h3>Related activity</h3>
              {security.incidents
                .filter((i) => i.nodeId === node.id)
                .map(
                  (i) =>
                    i.href && (
                      <LinkButton key={i.id} href={i.href}>
                        View simulated incident
                      </LinkButton>
                    ),
                )}
              {!security.incidents.some((i) => i.nodeId === node.id) && (
                <p>Monitoring not connected.</p>
              )}
              <h3>Recommended next step</h3>
              <p>
                Review the source evidence and confirm any inferred
                relationships with the project owner.
              </p>
              {graph.mode === "demo" ? (
                <LinkButton secondary href={demoLinks.guard}>
                  Open Guard demo
                </LinkButton>
              ) : (
                <p>
                  Guard / Sentinel not connected. Connect authorized result
                  adapters before reviewing scan or incident evidence.
                </p>
              )}
            </>
          )}
          <details
            className="canvas-inspector-tools"
            open={graph.mode !== "demo"}
          >
            <summary>Evidence and editing</summary>
            <EvidencePanel graph={graph} ids={item.evidenceIds} />
            <label>
              Canvas note
              <textarea
                aria-label="Canvas note"
                value={overlay.annotations[item.id] ?? ""}
                maxLength={2000}
                onChange={(e) =>
                  edit((o) => {
                    o.annotations[item.id] = e.target.value;
                  })
                }
              />
            </label>
            {node && (
              <div className="canvas-action-stack">
                <Button variant="secondary" onClick={() => related(node.id)}>
                  Filter related components
                </Button>
                <Button
                  variant="secondary"
                  onClick={() =>
                    edit((o) => {
                      o.hiddenNodeIds.push(node.id);
                    })
                  }
                >
                  Hide component
                </Button>
                <label className="check-line">
                  <input
                    type="checkbox"
                    checked={overlay.trustModel.boundaryNodeIds.includes(
                      node.id,
                    )}
                    onChange={(e) =>
                      edit((o) => {
                        o.trustModel.boundaryNodeIds = e.target.checked
                          ? [...o.trustModel.boundaryNodeIds, node.id]
                          : o.trustModel.boundaryNodeIds.filter(
                              (id) => id !== node.id,
                            );
                      })
                    }
                  />
                  Trust boundary
                </label>
                <Button variant="secondary" onClick={workflow}>
                  Review workflow model
                </Button>
              </div>
            )}
            {edge && (
              <label className="check-line">
                <input
                  type="checkbox"
                  checked={overlay.unconfirmedEdgeIds.includes(edge.id)}
                  onChange={(e) =>
                    edit((o) => {
                      o.unconfirmedEdgeIds = e.target.checked
                        ? [...o.unconfirmedEdgeIds, edge.id]
                        : o.unconfirmedEdgeIds.filter((id) => id !== edge.id);
                    })
                  }
                />
                Mark relationship unconfirmed
              </label>
            )}
            <Button
              variant="secondary"
              onClick={() =>
                download(
                  "canvas-evidence.json",
                  sanitize({
                    revision: graph.revision,
                    mode: graph.mode,
                    observation: item,
                    evidence: graph.evidence.filter((e) =>
                      item.evidenceIds.includes(e.id),
                    ),
                    disclaimer:
                      "Source observations only; not runtime or security verification.",
                  }),
                )
              }
            >
              Export selected evidence
            </Button>
          </details>
        </>
      ) : (
        <div className="inspector-empty">
          <span>
            <Layers size={28} />
          </span>
          <h3>A little more context.</h3>
          <p>
            Select a component to understand its role, evidence, and what needs
            attention.
          </p>
          {graph.nodes.length > 0 && (
            <Button
              variant="secondary"
              onClick={() =>
                choose(
                  graph.mode === "demo"
                    ? demoFocusNode
                    : (graph.nodes.find((n) => n.kind === "api")?.id ??
                        graph.nodes[0].id),
                )
              }
            >
              {graph.mode === "demo"
                ? "Explore Orders API"
                : "Explore source evidence"}
              <ArrowRight size={15} />
            </Button>
          )}
        </div>
      )}
    </aside>
  );
}

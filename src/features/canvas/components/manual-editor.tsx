"use client";
import { useState } from "react";
import { Button } from "@/components/ui";
import { nodeKinds, type ArchitectureGraph, type NodeKind } from "../types";
import type { CanvasController } from "../hooks/use-canvas";
export function ManualEditor({
  graph,
  controller,
}: {
  graph: ArchitectureGraph;
  controller: CanvasController;
}) {
  const [label, setLabel] = useState("");
  const [kind, setKind] = useState<NodeKind>("external_service");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [relationship, setRelationship] = useState("");
  const [groupLabel, setGroupLabel] = useState("");
  const [members, setMembers] = useState<string[]>([]);
  return (
    <details className="canvas-editor">
      <summary>Annotate and correct the map</summary>
      <p>
        User additions remain separate from generated evidence. Undo / Redo
        covers these edits, positions, Trust and workflow models.
      </p>
      <form
        className="canvas-form-row"
        onSubmit={(e) => {
          e.preventDefault();
          if (!label.trim()) return;
          controller.edit((o) => {
            o.manualNodes.push({
              id: `manual:${Date.now()}`,
              label: label.trim(),
              kind,
              origin: "user_added",
              status: "manual",
              evidenceIds: [],
              description: "User-added component. Not automatically verified.",
            });
          });
          setLabel("");
        }}
      >
        <label>
          Manual component name
          <input
            aria-label="Manual component name"
            value={label}
            maxLength={100}
            onChange={(e) => setLabel(e.target.value)}
            required
          />
        </label>
        <label>
          Manual component kind
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as NodeKind)}
          >
            {nodeKinds.map((k) => (
              <option key={k} value={k}>
                {k.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </label>
        <Button variant="secondary" type="submit">
          Add component
        </Button>
      </form>
      <form
        className="canvas-form-row"
        onSubmit={(e) => {
          e.preventDefault();
          if (!from || !to || !relationship.trim()) return;
          controller.edit((o) => {
            o.manualEdges.push({
              id: `manual-edge:${Date.now()}`,
              source: from,
              target: to,
              relationship: "unknown",
              description: relationship.trim(),
              origin: "user_added",
              evidenceIds: [],
            });
          });
          setRelationship("");
        }}
      >
        <label>
          Relationship source
          <select
            aria-label="Relationship source"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            required
          >
            <option value="">Choose a component</option>
            {graph.nodes.map((n) => (
              <option key={n.id} value={n.id}>
                {n.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Relationship target
          <select
            aria-label="Relationship target"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            required
          >
            <option value="">Choose a component</option>
            {graph.nodes.map((n) => (
              <option key={n.id} value={n.id}>
                {n.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Relationship label
          <input
            aria-label="Relationship label"
            value={relationship}
            maxLength={200}
            onChange={(e) => setRelationship(e.target.value)}
            required
          />
        </label>
        <Button variant="secondary" type="submit">
          Add relationship
        </Button>
      </form>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!groupLabel.trim() || !members.length) return;
          controller.edit((o) => {
            const id = `manual-group:${Date.now()}`;
            o.groups.push({
              id,
              label: groupLabel.trim(),
              nodeIds: members,
              collapsed: false,
            });
            o.manualNodes.push({
              id,
              kind: "service_group",
              label: groupLabel.trim(),
              origin: "user_added",
              status: "manual",
              evidenceIds: [],
            });
          });
          setGroupLabel("");
          setMembers([]);
        }}
      >
        <div className="canvas-form-row">
          <label>
            Group name
            <input
              aria-label="Group name"
              value={groupLabel}
              maxLength={100}
              onChange={(e) => setGroupLabel(e.target.value)}
              required
            />
          </label>
          <Button variant="secondary" type="submit" disabled={!members.length}>
            Create group
          </Button>
        </div>
        <fieldset>
          <legend>Group members</legend>
          <div className="canvas-form-row">
            {graph.nodes
              .filter((n) => n.kind !== "service_group")
              .map((n) => (
                <label className="check-line" key={n.id}>
                  <input
                    type="checkbox"
                    checked={members.includes(n.id)}
                    onChange={(e) =>
                      setMembers(
                        e.target.checked
                          ? [...members, n.id]
                          : members.filter((id) => id !== n.id),
                      )
                    }
                  />
                  {n.label}
                </label>
              ))}
          </div>
        </fieldset>
      </form>
    </details>
  );
}

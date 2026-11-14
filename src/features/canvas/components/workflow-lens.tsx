"use client";
import { useEffect, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MarkerType,
  Position,
} from "@xyflow/react";
import { Badge, Button } from "@/components/ui";
import type {
  ArchitectureGraph,
  WorkflowModel,
  WorkflowTestResult,
} from "../types";
import type { CanvasController } from "../hooks/use-canvas";
import {
  removeState,
  templateNames,
  workflowTemplate,
  workflowTestPlan,
} from "../workflows/model";
import { download } from "../export";
export function WorkflowLens({
  controller,
  graph,
  dark,
}: {
  controller: CanvasController;
  graph: ArchitectureGraph;
  dark: boolean;
}) {
  const { overlay, edit } = controller;
  const [chosen, setChosen] = useState("");
  const [template, setTemplate] = useState(0);
  const [stateName, setStateName] = useState("");
  const [transitionId, setTransitionId] = useState("");
  const [results, setResults] = useState<WorkflowTestResult>();
  const workflow =
    overlay.workflowModels.find((w) => w.id === chosen) ??
    overlay.workflowModels[0];
  const transition = workflow?.transitions.find((t) => t.id === transitionId);
  useEffect(() => {
    let active = true;
    controller.overlays
      .getWorkflowTests(graph.projectRef)
      .then((result) => {
        if (
          active &&
          result.projectRef === graph.projectRef &&
          (graph.mode === "demo" || result.status !== "simulated")
        )
          setResults(result);
      })
      .catch(() => {
        if (active) setResults(undefined);
      });
    return () => {
      active = false;
    };
  }, [controller.overlays, graph.mode, graph.projectRef]);
  function change(fn: (w: WorkflowModel) => void) {
    if (workflow)
      edit((o) => {
        const w = o.workflowModels.find((v) => v.id === workflow.id);
        if (w) {
          fn(w);
          w.status = "policy_defined";
        }
      });
  }
  return (
    <section className="canvas-model-panel" aria-label="Workflow model editor">
      <h2>How should the workflow behave?</h2>
      <p>
        Model states, actors and invariants. Templates are examples to review
        with the owner. No HTTP requests or Integrity tests run here.
      </p>
      {graph.mode === "demo" && (
        <p>
          Demo / Simulated: {results?.results[0]?.result}. Expected models below
          remain Not executed.
        </p>
      )}
      <div className="canvas-form-row">
        <label>
          Example template
          <select
            aria-label="Example template"
            value={template}
            onChange={(e) => setTemplate(Number(e.target.value))}
          >
            {templateNames.map((name, i) => (
              <option value={i} key={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <Button
          variant="secondary"
          onClick={() => {
            const id = `manual-workflow:${Date.now()}`;
            edit((o) => {
              o.workflowModels.push(workflowTemplate(template, id));
            });
            setChosen(id);
          }}
        >
          Use example template
        </Button>
        {workflow && (
          <label>
            Selected workflow
            <select
              value={workflow.id}
              onChange={(e) => {
                setChosen(e.target.value);
                setTransitionId("");
              }}
            >
              {overlay.workflowModels.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {workflow ? (
        <>
          <div className="canvas-form-row">
            <label>
              Workflow name
              <input
                aria-label="Workflow name"
                value={workflow.name}
                maxLength={200}
                onChange={(e) =>
                  change((w) => {
                    w.name = e.target.value;
                  })
                }
              />
            </label>
            <Badge>{workflow.status.replaceAll("_", " ")} · Not executed</Badge>
            <Button
              variant="ghost"
              onClick={() => {
                edit((o) => {
                  o.workflowModels = o.workflowModels.filter(
                    (w) => w.id !== workflow.id,
                  );
                });
                setChosen("");
              }}
            >
              Remove workflow
            </Button>
          </div>
          <label>
            Involved components
            <select
              aria-label="Involved components"
              multiple
              size={4}
              value={workflow.nodeIds}
              onChange={(e) =>
                change((w) => {
                  w.nodeIds = Array.from(
                    e.target.selectedOptions,
                    (option) => option.value,
                  );
                })
              }
            >
              {graph.nodes.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.label}
                </option>
              ))}
            </select>
          </label>
          {!workflow.nodeIds.length && (
            <p>
              Missing context · no components linked. Select one or more
              components to connect this model to the architecture.
            </p>
          )}
          <div
            className="canvas-state-graph"
            aria-label="Workflow state visualization"
          >
            <ReactFlowProvider>
              <ReactFlow
                nodes={workflow.states.map((s, i) => ({
                  id: s.id,
                  position: { x: (i % 3) * 210, y: Math.floor(i / 3) * 170 },
                  data: { label: s.label },
                  sourcePosition: Position.Right,
                  targetPosition: Position.Left,
                  ariaLabel: `Workflow state ${s.label}`,
                }))}
                edges={workflow.transitions.map((t) => ({
                  id: t.id,
                  source: t.from,
                  target: t.to,
                  ariaLabel: `${t.forbidden ? "Forbidden" : "Allowed"} transition ${t.from} to ${t.to}, actor ${t.actor}`,
                  markerEnd: { type: MarkerType.ArrowClosed },
                  style: {
                    stroke: t.forbidden ? "#b95824" : "#6c78ac",
                    strokeDasharray: t.forbidden ? "5 5" : undefined,
                  },
                  selected: transitionId === t.id,
                }))}
                onEdgeClick={(_, e) => setTransitionId(e.id)}
                onEdgesChange={(changes) => {
                  for (const c of changes)
                    if (c.type === "select" && c.selected)
                      setTransitionId(c.id);
                }}
                fitView
                nodesDraggable={false}
                nodesConnectable={false}
                colorMode={dark ? "dark" : "light"}
              >
                <Background />
                <Controls showInteractive={false} />
              </ReactFlow>
            </ReactFlowProvider>
          </div>
          <h3>States</h3>
          <form
            className="canvas-form-row"
            onSubmit={(e) => {
              e.preventDefault();
              if (!stateName.trim()) return;
              change((w) => {
                const id = stateName.trim().toLowerCase().replace(/\s/g, "-");
                if (!w.states.some((s) => s.id === id))
                  w.states.push({ id, label: stateName.trim() });
              });
              setStateName("");
            }}
          >
            <label>
              New state
              <input
                aria-label="New state"
                value={stateName}
                maxLength={100}
                onChange={(e) => setStateName(e.target.value)}
                required
              />
            </label>
            <Button variant="secondary" type="submit">
              Add state
            </Button>
          </form>
          <ul className="canvas-state-list">
            {workflow.states.map((s) => (
              <li key={s.id}>
                <input
                  aria-label={`State name ${s.id}`}
                  value={s.label}
                  maxLength={100}
                  onChange={(e) =>
                    change((w) => {
                      w.states.find((v) => v.id === s.id)!.label =
                        e.target.value;
                    })
                  }
                />
                <Button
                  variant="ghost"
                  onClick={() =>
                    change((w) => {
                      Object.assign(w, removeState(w, s.id));
                    })
                  }
                >
                  Remove state {s.label}
                </Button>
              </li>
            ))}
          </ul>
          <h3>Transitions</h3>
          <Button
            variant="secondary"
            disabled={workflow.states.length < 2}
            onClick={() =>
              change((w) => {
                const id = `transition:${Date.now()}`;
                w.transitions.push({
                  id,
                  from: w.states[0].id,
                  to: w.states[1].id,
                  actor: "Actor",
                  forbidden: false,
                  precondition: "",
                  endpoint: "<authorized-staging-endpoint>",
                  expectedHttp: 200,
                  assertion: "Expected state is reached",
                  hypothesis: "",
                });
                setTransitionId(id);
              })
            }
          >
            Add transition
          </Button>
          <div className="canvas-table-wrap">
            <table>
              <caption>Allowed and forbidden transitions</caption>
              <thead>
                <tr>
                  <th>From</th>
                  <th>To</th>
                  <th>Actor</th>
                  <th>Forbidden</th>
                  <th>Inspect</th>
                  <th>Remove</th>
                </tr>
              </thead>
              <tbody>
                {workflow.transitions.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <select
                        aria-label={`Transition from ${t.id}`}
                        value={t.from}
                        onChange={(e) =>
                          change((w) => {
                            w.transitions.find((v) => v.id === t.id)!.from =
                              e.target.value;
                          })
                        }
                      >
                        {workflow.states.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <select
                        aria-label={`Transition to ${t.id}`}
                        value={t.to}
                        onChange={(e) =>
                          change((w) => {
                            w.transitions.find((v) => v.id === t.id)!.to =
                              e.target.value;
                          })
                        }
                      >
                        {workflow.states.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        aria-label={`Transition actor ${t.id}`}
                        value={t.actor}
                        maxLength={100}
                        onChange={(e) =>
                          change((w) => {
                            w.transitions.find((v) => v.id === t.id)!.actor =
                              e.target.value;
                          })
                        }
                      />
                    </td>
                    <td>
                      <input
                        aria-label={`Forbidden transition ${t.id}`}
                        type="checkbox"
                        checked={t.forbidden}
                        onChange={(e) =>
                          change((w) => {
                            const v = w.transitions.find((v) => v.id === t.id)!;
                            v.forbidden = e.target.checked;
                            v.expectedHttp = e.target.checked ? 403 : 200;
                          })
                        }
                      />
                    </td>
                    <td>
                      <Button
                        variant="ghost"
                        onClick={() => setTransitionId(t.id)}
                      >
                        Inspect transition {t.id}
                      </Button>
                    </td>
                    <td>
                      <Button
                        variant="ghost"
                        onClick={() =>
                          change((w) => {
                            w.transitions = w.transitions.filter(
                              (v) => v.id !== t.id,
                            );
                          })
                        }
                      >
                        Remove transition {t.id}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {transition && (
            <section
              aria-label="Transition inspector"
              className="canvas-transition-inspector"
            >
              <h3>Transition details · {transition.id}</h3>
              {(
                [
                  ["precondition", "Precondition"],
                  ["endpoint", "Endpoint placeholder"],
                  ["assertion", "Expected assertion"],
                  ["hypothesis", "Risk / hypothesis"],
                ] as const
              ).map(([key, label]) => (
                <label key={key}>
                  {label}
                  <input
                    aria-label={label}
                    value={transition[key]}
                    maxLength={1000}
                    onChange={(e) =>
                      change((w) => {
                        w.transitions.find((v) => v.id === transition.id)![
                          key
                        ] = e.target.value;
                      })
                    }
                  />
                </label>
              ))}
              <label>
                Expected HTTP result
                <input
                  aria-label="Expected HTTP result"
                  type="number"
                  min={100}
                  max={599}
                  value={transition.expectedHttp}
                  onChange={(e) =>
                    change((w) => {
                      w.transitions.find(
                        (v) => v.id === transition.id,
                      )!.expectedHttp = Number(e.target.value);
                    })
                  }
                />
              </label>
              <p>
                Not executed · no request is sent. Export uses the original
                state for a forbidden transition.
              </p>
            </section>
          )}
          <label>
            Invariants (one per line)
            <textarea
              aria-label="Workflow invariants"
              maxLength={3000}
              value={workflow.invariants.join("\n")}
              onChange={(e) =>
                change((w) => {
                  w.invariants = e.target.value.split("\n");
                })
              }
            />
          </label>
          <label>
            Protected fields (comma separated)
            <input
              aria-label="Protected fields"
              maxLength={1000}
              value={workflow.protectedFields.join(", ")}
              onChange={(e) =>
                change((w) => {
                  w.protectedFields = e.target.value
                    .split(",")
                    .map((v) => v.trim());
                })
              }
            />
          </label>
          <div className="canvas-form-row">
            <Button
              variant="secondary"
              onClick={() =>
                download(
                  "canvas-integrity-test-plan.json",
                  workflowTestPlan(graph.projectRef, workflow),
                )
              }
            >
              Export Integrity test plan
            </Button>
            <Button
              disabled
              title="Guard Integrity execution is not connected yet"
            >
              Run workflow test · not connected
            </Button>
          </div>
          <p>
            Guard Integrity runner is not connected. Expected models and
            exported plans have not been executed.
          </p>
        </>
      ) : (
        <p>
          No workflow model yet. Choose an example template to start, then
          confirm its rules for your application.
        </p>
      )}
    </section>
  );
}

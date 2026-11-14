"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui";
import type { ArchitectureGraph, TrustVerificationResult } from "../types";
import type { CanvasController } from "../hooks/use-canvas";
import { stableId } from "../graph/ids";
import { trustTestPlan, updatePolicy } from "../trust/model";
import { download } from "../export";
export function TrustLens({
  controller,
  graph,
}: {
  controller: CanvasController;
  graph: ArchitectureGraph;
}) {
  const { overlay, edit } = controller;
  const model = overlay.trustModel;
  const [roleName, setRoleName] = useState("");
  const [resourceName, setResourceName] = useState("");
  const [roleId, setRoleId] = useState("");
  const [resourceId, setResourceId] = useState("");
  const [action, setAction] = useState("read");
  const [ownership, setOwnership] = useState("own resources only");
  const [sampleRole, setSampleRole] = useState("Customer");
  const [verification, setVerification] = useState<TrustVerificationResult>();
  useEffect(() => {
    let active = true;
    controller.overlays
      .getTrustVerification(graph.projectRef)
      .then((result) => {
        if (
          active &&
          result.projectRef === graph.projectRef &&
          (graph.mode === "demo" || result.status !== "simulated")
        )
          setVerification(result);
      })
      .catch(() => {
        if (active) setVerification(undefined);
      });
    return () => {
      active = false;
    };
  }, [controller.overlays, graph.projectRef, graph.mode]);
  return (
    <section className="canvas-model-panel" aria-label="Trust policy editor">
      <h2>Who should have access?</h2>
      <p>
        Define expected policy with the project owner. Source imports do not
        establish permissions. Observed access remains Not tested until a Guard
        runner supplies evidence.
      </p>
      {graph.mode === "demo" && (
        <div className="notice">
          <div>
            <strong>Demo sample · who should access an order?</strong>
            <label>
              Role
              <select
                aria-label="Role"
                value={sampleRole}
                onChange={(e) => setSampleRole(e.target.value)}
              >
                <option>Customer</option>
                <option>Staff</option>
                <option>Admin</option>
              </select>
            </label>
            <p>
              {sampleRole === "Customer"
                ? "Expected: own orders only. Observed demo fixture: another customer’s order is readable."
                : sampleRole === "Staff"
                  ? "Expected: assigned orders only. No scoped staff-access evidence yet."
                  : "Expected: all orders with an audited admin role. No admin-access evidence yet."}
            </p>
            <small>
              {verification?.observations[0]?.result} · Simulated sample,
              separate from your policy edits.
            </small>
          </div>
        </div>
      )}
      <div className="canvas-model-grid">
        <div>
          <h3>Roles / actors</h3>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!roleName.trim()) return;
              edit((o) => {
                const id = stableId(graph.projectRef, "role", roleName.trim());
                if (!o.trustModel.roles.some((r) => r.id === id))
                  o.trustModel.roles.push({ id, label: roleName.trim() });
              });
              setRoleName("");
            }}
          >
            <label>
              New role
              <input
                aria-label="New role"
                maxLength={100}
                value={roleName}
                onChange={(e) => setRoleName(e.target.value)}
                required
              />
            </label>
            <Button variant="secondary" type="submit">
              Add role
            </Button>
          </form>
          {model.roles.map((r) => (
            <div key={r.id} className="canvas-inline">
              <input
                aria-label={`Role name ${r.label}`}
                value={r.label}
                maxLength={100}
                onChange={(e) =>
                  edit((o) => {
                    o.trustModel.roles.find((v) => v.id === r.id)!.label =
                      e.target.value;
                  })
                }
              />
              <Button
                variant="ghost"
                onClick={() =>
                  edit((o) => {
                    o.trustModel.roles = o.trustModel.roles.filter(
                      (v) => v.id !== r.id,
                    );
                    o.trustModel.policies = o.trustModel.policies.filter(
                      (p) => p.roleId !== r.id,
                    );
                  })
                }
              >
                Remove role {r.label}
              </Button>
            </div>
          ))}
        </div>
        <div>
          <h3>Resources / components</h3>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!resourceName.trim()) return;
              edit((o) => {
                const id = stableId(
                  graph.projectRef,
                  "resource",
                  resourceName.trim(),
                );
                if (!o.trustModel.resources.some((r) => r.id === id))
                  o.trustModel.resources.push({
                    id,
                    label: resourceName.trim(),
                  });
              });
              setResourceName("");
            }}
          >
            <label>
              New resource
              <input
                aria-label="New resource"
                maxLength={100}
                value={resourceName}
                onChange={(e) => setResourceName(e.target.value)}
                required
              />
            </label>
            <Button variant="secondary" type="submit">
              Add resource
            </Button>
          </form>
          {model.resources.map((r) => (
            <div key={r.id}>
              <input
                aria-label={`Resource name ${r.label}`}
                value={r.label}
                maxLength={100}
                onChange={(e) =>
                  edit((o) => {
                    o.trustModel.resources.find((v) => v.id === r.id)!.label =
                      e.target.value;
                  })
                }
              />
              <label>
                Component for {r.label}
                <select
                  value={r.nodeId ?? ""}
                  onChange={(e) =>
                    edit((o) => {
                      o.trustModel.resources.find(
                        (v) => v.id === r.id,
                      )!.nodeId = e.target.value || undefined;
                    })
                  }
                >
                  <option value="">Missing context · not linked</option>
                  {graph.nodes.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.label}
                    </option>
                  ))}
                </select>
              </label>
              <Button
                variant="ghost"
                onClick={() =>
                  edit((o) => {
                    o.trustModel.resources = o.trustModel.resources.filter(
                      (v) => v.id !== r.id,
                    );
                    o.trustModel.policies = o.trustModel.policies.filter(
                      (p) => p.resourceId !== r.id,
                    );
                  })
                }
              >
                Remove resource {r.label}
              </Button>
            </div>
          ))}
        </div>
      </div>
      <h3>Expected access matrix</h3>
      <form
        className="canvas-form-row"
        onSubmit={(e) => {
          e.preventDefault();
          const r = roleId || model.roles[0]?.id;
          const resource = resourceId || model.resources[0]?.id;
          if (!r || !resource) return;
          edit((o) => {
            const id = stableId(
              graph.projectRef,
              "policy",
              `${r}:${resource}:${action}`,
            );
            o.trustModel = updatePolicy(o.trustModel, {
              id,
              roleId: r,
              resourceId: resource,
              action,
              ownership,
              allowed: true,
              confirmed: false,
            });
          });
        }}
      >
        <label>
          Policy role
          <select
            aria-label="Policy role"
            value={roleId || model.roles[0]?.id || ""}
            onChange={(e) => setRoleId(e.target.value)}
            required
          >
            {!model.roles.length && <option value="">Add a role first</option>}
            {model.roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Policy resource
          <select
            aria-label="Policy resource"
            value={resourceId || model.resources[0]?.id || ""}
            onChange={(e) => setResourceId(e.target.value)}
            required
          >
            {!model.resources.length && (
              <option value="">Add a resource first</option>
            )}
            {model.resources.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Action
          <input
            aria-label="Policy action"
            list="canvas-actions"
            value={action}
            maxLength={100}
            onChange={(e) => setAction(e.target.value)}
            required
          />
          <datalist id="canvas-actions">
            {["read", "create", "update", "delete"].map((a) => (
              <option key={a} value={a} />
            ))}
          </datalist>
        </label>
        <label>
          Ownership constraint
          <input
            aria-label="Ownership constraint"
            value={ownership}
            maxLength={500}
            onChange={(e) => setOwnership(e.target.value)}
          />
        </label>
        <Button
          variant="secondary"
          type="submit"
          disabled={!model.roles.length || !model.resources.length}
        >
          Add policy
        </Button>
      </form>
      <div className="canvas-table-wrap">
        <table>
          <caption>Expected policy vs observed authorization evidence</caption>
          <thead>
            <tr>
              <th>Role / resource / action</th>
              <th>Expected</th>
              <th>Ownership</th>
              <th>Confirmed</th>
              <th>Observed</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {model.policies.map((p) => (
              <tr key={p.id}>
                <td>
                  {model.roles.find((r) => r.id === p.roleId)?.label} /{" "}
                  {model.resources.find((r) => r.id === p.resourceId)?.label} /{" "}
                  {p.action}
                </td>
                <td>
                  <select
                    aria-label={`Expected access ${p.id}`}
                    value={p.allowed ? "allow" : "deny"}
                    onChange={(e) =>
                      edit((o) => {
                        o.trustModel = updatePolicy(o.trustModel, {
                          ...p,
                          allowed: e.target.value === "allow",
                          confirmed: false,
                        });
                      })
                    }
                  >
                    <option value="allow">Allow</option>
                    <option value="deny">Deny</option>
                  </select>
                </td>
                <td>
                  <input
                    aria-label={`Ownership ${p.id}`}
                    value={p.ownership}
                    maxLength={500}
                    onChange={(e) =>
                      edit((o) => {
                        o.trustModel = updatePolicy(o.trustModel, {
                          ...p,
                          ownership: e.target.value,
                          confirmed: false,
                        });
                      })
                    }
                  />
                </td>
                <td>
                  <input
                    aria-label={`Confirm expected policy ${p.id}`}
                    type="checkbox"
                    checked={p.confirmed}
                    onChange={(e) =>
                      edit((o) => {
                        o.trustModel = updatePolicy(o.trustModel, {
                          ...p,
                          confirmed: e.target.checked,
                        });
                      })
                    }
                  />
                </td>
                <td>Not tested</td>
                <td>
                  <Button
                    variant="ghost"
                    onClick={() =>
                      edit((o) => {
                        o.trustModel.policies = o.trustModel.policies.filter(
                          (v) => v.id !== p.id,
                        );
                      })
                    }
                  >
                    Remove policy
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!model.policies.length && (
        <p>
          Add a role, a resource and a policy to define your expected access
          matrix.
        </p>
      )}
      <div className="canvas-form-row">
        <Button
          variant="secondary"
          onClick={() =>
            download(
              "canvas-trust-test-plan.json",
              trustTestPlan(graph.projectRef, model),
            )
          }
        >
          Export Trust test plan
        </Button>
        <Button
          disabled
          title="Guard authorization testing is not connected yet"
        >
          Run verification · not connected
        </Button>
      </div>
      <p>
        Guard authorization testing is not connected yet (CAN-009). Exporting a
        plan does not enforce policy or run requests.
      </p>
    </section>
  );
}

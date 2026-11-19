"use client";
import { useCallback, useEffect, useState } from "react";
import {
  Badge,
  Button,
  Card,
  Empty,
  Notice,
  PageHeader,
} from "@/components/ui";
import type { ResponseAction, ResponseAuditRecord } from "../response/model";
import type { IncidentPage } from "../incidents/model";

interface TargetView {
  targetId: string;
  origin: string;
  maxTtlSeconds: number;
  allowSelfApproval: boolean;
}
const labels: Record<
  string,
  [string, "neutral" | "blue" | "green" | "amber" | "red"]
> = {
  awaiting_approval: ["Awaiting approval", "amber"],
  approved: ["Approved · not yet applied", "blue"],
  denied: ["Denied", "neutral"],
  applying: ["Applying", "blue"],
  // `applied` is only the target's receipt. It is never presented as protection.
  applied: ["Applied · NOT verified", "amber"],
  apply_failed: ["Apply failed", "red"],
  verification_pending: ["Verification pending", "amber"],
  verified: ["Neutralization verified (fixture scope)", "green"],
  failed: ["Verification failed", "red"],
  inconclusive: ["Verification inconclusive", "amber"],
  rolled_back: ["Rolled back", "neutral"],
  expired: ["Expired · restored", "neutral"],
};
const reasons: Record<string, string> = {
  target_not_configured: "No approved response target.",
  target_disabled: "The response target is disabled.",
  ttl_above_target_maximum: "TTL exceeds the target maximum.",
  ttl_invalid: "TTL is invalid.",
  incident_closed: "The incident is closed.",
  no_evidence: "The incident has no evidence.",
  active_action_on_target: "Another response is already active on this target.",
};
const errors: Record<string, string> = {
  approver_denied:
    "You are not an approver for this target, or self-approval is prohibited.",
  revision_conflict:
    "This response changed in another session. Refresh and retry.",
  invalid_state: "This action is not permitted in the current state.",
  response_not_configured:
    "Responses are not configured (NO-OP / NOT_CONFIGURED).",
};
async function api(path: string, body?: unknown) {
  const r = await fetch(path, {
    method: body ? "POST" : "GET",
    credentials: "same-origin",
    cache: "no-store",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    if (j.reasons)
      throw Error(
        (j.reasons as string[]).map((x) => reasons[x] ?? x).join(" "),
      );
    throw Error(
      errors[j.error] ??
        (r.status === 401 ? "Sign in again." : "Request rejected."),
    );
  }
  return j;
}
const hex = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
const at = (v: string) =>
  new Date(v).toLocaleString("en-GB", { timeZone: "Asia/Jakarta" }) + " WIB";

export function LiveResponses({ projectId }: { projectId: string }) {
  const root = `/api/sentinel/projects/${encodeURIComponent(projectId)}`;
  const [targets, setTargets] = useState<TargetView[] | null>(null);
  const [actions, setActions] = useState<ResponseAction[]>([]);
  const [incidents, setIncidents] = useState<IncidentPage["items"]>([]);
  const [audit, setAudit] = useState<Record<string, ResponseAuditRecord[]>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [incidentId, setIncidentId] = useState("");
  const [targetId, setTargetId] = useState("");
  const [ttl, setTtl] = useState(120);

  const load = useCallback(async () => {
    try {
      setError("");
      const [t, a, i] = await Promise.all([
        api(`${root}/responses?view=targets`),
        api(`${root}/responses`),
        api(`${root}/incidents`),
      ]);
      setTargets(t.targets);
      setActions(a.actions);
      setIncidents(
        (i as IncidentPage).items.filter((x) => x.status !== "closed"),
      );
    } catch (e) {
      setTargets([]);
      setError((e as Error).message);
    }
  }, [root]);
  useEffect(() => {
    const first = setTimeout(() => void load(), 0);
    const timer = setInterval(() => void load(), 10000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [load]);

  const run = async (body: unknown) => {
    setBusy(true);
    try {
      await api(`${root}/responses`, body);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const open = async (id: string) => {
    const d = await api(`${root}/responses?actionId=${id}`).catch(() => null);
    if (d) setAudit((s) => ({ ...s, [id]: d.audit }));
  };
  const active = [
    "approved",
    "applying",
    "applied",
    "verification_pending",
    "verified",
    "failed",
    "inconclusive",
  ];

  return (
    <>
      <PageHeader
        eyebrow="Sentinel"
        title="Controlled responses"
        description="Narrowly approved, reversible and independently verified responses on an owner-controlled local fixture."
      />
      <Notice tone="neutral">
        Local fixture only. No production firewall, WAF, CDN or cloud change is
        ever made from here. Applied is not verified; verification needs a
        blocked test request and a permitted benign control.
      </Notice>
      {error && <Notice tone="amber">{error}</Notice>}
      {targets && targets.length === 0 ? (
        <Card>
          <Empty
            title="NO-OP / NOT_CONFIGURED"
            description="No response target is approved for this project. Enforcement stays off until the owner grants H03 scope."
          />
        </Card>
      ) : (
        <Card>
          <h3>Propose a response</h3>
          <div className="form-grid">
            <label>
              Incident
              <select
                value={incidentId}
                onChange={(e) => setIncidentId(e.target.value)}
              >
                <option value="">Select…</option>
                {incidents.map((i) => (
                  <option key={i.incidentId} value={i.incidentId}>
                    {i.title} ·{" "}
                    {i.origin === "controlled_test"
                      ? "controlled test"
                      : "runtime"}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Target
              <select
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
              >
                <option value="">Select…</option>
                {(targets ?? []).map((t) => (
                  <option key={t.targetId} value={t.targetId}>
                    local fixture · {t.origin}
                  </option>
                ))}
              </select>
            </label>
            <label>
              TTL (seconds, 10–600)
              <input
                type="number"
                min={10}
                max={600}
                value={ttl}
                onChange={(e) => setTtl(Number(e.target.value))}
              />
            </label>
          </div>
          <Button
            disabled={busy || !incidentId || !targetId}
            onClick={() =>
              void run({
                action: "propose",
                incidentId,
                targetId,
                ttlSeconds: ttl,
                idempotencyKey: hex(),
              })
            }
          >
            Propose temporary rate limit
          </Button>
        </Card>
      )}
      <Card>
        <h3>Response history</h3>
        {actions.length === 0 ? (
          <Empty
            title="No responses yet"
            description="Proposals, approvals, verification and rollbacks appear here with a full audit trail."
          />
        ) : (
          actions.map((a) => {
            const [label, tone] = labels[a.status] ?? [
              a.status,
              "neutral" as const,
            ];
            return (
              <div className="history-row" key={a.actionId}>
                <div>
                  <strong>Temporary rate limit · {a.ttlSeconds}s</strong>
                  <small>
                    {a.incidentOrigin === "controlled_test"
                      ? "controlled test"
                      : "runtime"}{" "}
                    · proposed by {a.proposedBy} · {at(a.createdAt)}
                    {a.expiresAt ? ` · expires ${at(a.expiresAt)}` : ""}
                  </small>
                </div>
                <Badge tone={tone}>{label}</Badge>
                {a.status === "awaiting_approval" && (
                  <>
                    <Button
                      disabled={busy}
                      onClick={() =>
                        void run({
                          action: "approve",
                          actionId: a.actionId,
                          expectedRevision: a.revision,
                        })
                      }
                    >
                      Approve
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={busy}
                      onClick={() =>
                        void run({
                          action: "deny",
                          actionId: a.actionId,
                          expectedRevision: a.revision,
                        })
                      }
                    >
                      Deny
                    </Button>
                  </>
                )}
                {active.includes(a.status) && !a.rollbackRequestedBy && (
                  <Button
                    variant="danger"
                    disabled={busy}
                    onClick={() =>
                      void run({
                        action: "rollback",
                        actionId: a.actionId,
                        expectedRevision: a.revision,
                      })
                    }
                  >
                    Roll back
                  </Button>
                )}
                {a.rollbackRequestedBy && active.includes(a.status) && (
                  <Badge tone="amber">Rollback requested</Badge>
                )}
                <Button variant="ghost" onClick={() => void open(a.actionId)}>
                  Audit
                </Button>
                {audit[a.actionId] && (
                  <ol className="audit-list">
                    {audit[a.actionId].map((e) => (
                      <li key={e.auditId}>
                        <strong>{e.eventType.replaceAll("_", " ")}</strong> ·{" "}
                        {e.actorId} · {at(e.occurredAt)}
                        <br />
                        <small>{e.summary}</small>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            );
          })
        )}
      </Card>
    </>
  );
}

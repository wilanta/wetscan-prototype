"use client";
import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Card, Empty, Notice } from "@/components/ui";
import styles from "../workbench.module.css";
import type { SecurityPolicy } from "./policy";

type Tone = "neutral" | "blue" | "green" | "amber" | "red";
const decisionTone: Record<string, Tone> = {
  PASS: "green",
  WARN: "amber",
  BLOCK: "red",
  INCOMPLETE: "amber",
};
const severities = ["critical", "high", "medium", "low", "info"] as const;
const engineList = ["sast", "sca", "secrets", "iac", "sbom"] as const;
const profileEngines: Record<string, readonly string[]> = {
  quick: ["sast", "sca", "secrets"],
  standard: engineList,
  full: engineList,
};

/* eslint-disable @typescript-eslint/no-explicit-any -- responses are validated server-side; the panel only renders them */
type Overview = any;
function useApi(projectId: string) {
  const api = "/api/guard/projects/" + encodeURIComponent(projectId) + "/g04/";
  return useCallback(
    async (
      resource: string,
      method: "GET" | "POST" | "PUT" = "GET",
      body?: unknown,
    ) => {
      const r = await fetch(api + resource, {
        method,
        credentials: "same-origin",
        cache: "no-store",
        redirect: "error",
        headers:
          body === undefined
            ? undefined
            : { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const b = await r.json().catch(() => ({}));
      if (!r.ok)
        throw Error(
          typeof b.error === "string" && /^[a-z_0-9]{1,64}$/.test(b.error)
            ? b.error
            : "g04_unavailable",
        );
      return b;
    },
    [api],
  );
}
const when = (v?: string | null) =>
  v ? new Date(v).toISOString().replace("T", " ").slice(0, 19) + " UTC" : "—";

export function CicdPanel({
  projectId,
  defaultBranch,
}: {
  projectId: string;
  defaultBranch: string;
}) {
  const call = useApi(projectId);
  const [o, setO] = useState<Overview | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [access, setAccess] = useState<any>(null),
    [note, setNote] = useState("");
  const load = useCallback(async () => {
    setBusy(true);
    try {
      setO(await call("overview"));
      setError("");
    } catch (e) {
      setO(null);
      setError(e instanceof Error ? e.message : "g04_unavailable");
    } finally {
      setBusy(false);
    }
  }, [call]);
  useEffect(() => {
    // Initial fetch of external state; load() sets state only after awaiting the network.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);
  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    setNote("");
    try {
      await fn();
      setNote(ok);
      await load();
    } catch (e) {
      setError(
        (e instanceof Error ? e.message : "g04_unavailable") +
          " — nothing was changed.",
      );
      setBusy(false);
    }
  };
  if (error === "g04_disabled")
    return (
      <Notice tone="amber">
        The CI/CD security gate is not enabled in this environment (
        <code>GUARD_G04_ENABLED</code> is off). Nothing is scanned
        automatically, no GitHub check is published and no deployment is gated.
        This is reported as disabled, not as passing.
      </Notice>
    );
  return (
    <Card className={styles.panel} aria-label="CI/CD security gate">
      <div className={styles.toolbar}>
        <Badge tone="blue">LIVE · CI/CD GATE</Badge>
        <Button variant="secondary" disabled={busy} onClick={() => void load()}>
          Refresh
        </Button>
      </div>
      {error && (
        <p role="alert">
          CI/CD data unavailable: {error}. No synthetic data is substituted.
        </p>
      )}
      {note && <p role="status">{note}</p>}
      <Notice>
        A <strong>decision</strong> (PASS / WARN / BLOCK / INCOMPLETE) is a
        policy outcome. It is shown as <strong>enforced</strong> only when
        GitHub or the deployment provider independently shows that something was
        actually held. A published check alone is not a branch rule.
      </Notice>
      {!o ? (
        !error && <p>Loading CI/CD state…</p>
      ) : (
        <>
          <PolicySection
            o={o}
            busy={busy}
            defaultBranch={defaultBranch}
            save={(p: SecurityPolicy, rev: number, reason: string) =>
              act(
                () =>
                  call("policy", "PUT", {
                    policy: p,
                    expectedRevision: rev,
                    reason,
                  }),
                "Policy saved (new revision recorded).",
              )
            }
          />
          <IntegrationSection
            o={o}
            access={access}
            check={() =>
              act(
                async () => setAccess(await call("access")),
                "GitHub access re-verified.",
              )
            }
            busy={busy}
          />
          <GateSection
            o={o}
            busy={busy}
            retry={(commit: string) =>
              act(
                () => call("checks", "POST", { commit }),
                "Check re-publication requested.",
              )
            }
          />
          <TriggerSection
            o={o}
            busy={busy}
            defaultBranch={defaultBranch}
            start={(branch: string, commit: string) =>
              act(
                () =>
                  call("triggers", "POST", {
                    branch,
                    ...(commit ? { commit } : {}),
                    idempotencyKey: crypto
                      .randomUUID()
                      .replaceAll("-", "")
                      .slice(0, 32),
                  }),
                "Scan queued. The dispatcher runs it; this page does not scan.",
              )
            }
          />
          <DeploymentSection
            o={o}
            busy={busy}
            map={(projectIdV: string, teamId: string) =>
              act(
                () =>
                  call("mapping", "PUT", {
                    projectId: projectIdV,
                    ...(teamId ? { teamId } : {}),
                  }),
                "Vercel project verified and mapped.",
              )
            }
            verify={(id: string) =>
              act(
                () =>
                  call("deployments", "POST", id ? { deploymentId: id } : {}),
                "Deployment verified against provider state.",
              )
            }
            register={() =>
              act(
                () =>
                  call("gate", "POST", {
                    confirm: "REGISTER_VERCEL_DEPLOYMENT_CHECK",
                    blocks: "deployment-alias",
                    targets: ["production"],
                  }),
                "Deployment Check registered on the Vercel project.",
              )
            }
          />
          <ScheduleSection
            o={o}
            busy={busy}
            defaultBranch={defaultBranch}
            save={(s: unknown) =>
              act(() => call("schedules", "PUT", s), "Schedule saved.")
            }
          />
          <section aria-label="Remediation integration">
            <h2>Remediation and retest (G03)</h2>
            <Notice tone="neutral">
              Not connected. AI remediation and verified retest evidence come
              from G03; none is generated or implied here, and release decisions
              do not depend on it.
            </Notice>
          </section>
          <section aria-label="Audit">
            <h2>Recent audit events</h2>
            {o.audit.length ? (
              <div className={styles.scroll}>
                <table>
                  <caption>Redacted structured audit (newest first)</caption>
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Actor</th>
                      <th>Action</th>
                      <th>Subject</th>
                    </tr>
                  </thead>
                  <tbody>
                    {o.audit.map((a: any) => (
                      <tr key={a.id}>
                        <td>{when(a.at)}</td>
                        <td>{a.actor}</td>
                        <td>{a.action}</td>
                        <td>{a.subject ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty
                title="No audit events yet"
                description="Events appear when policies change, webhooks arrive or checks are published."
              />
            )}
          </section>
        </>
      )}
    </Card>
  );
}

function PolicySection({
  o,
  busy,
  defaultBranch,
  save,
}: {
  o: Overview;
  busy: boolean;
  defaultBranch: string;
  save: (p: SecurityPolicy, rev: number, reason: string) => void;
}) {
  const base: SecurityPolicy = o.policy?.policy ?? {
    ...o.defaults,
    protectedBranches: [defaultBranch],
  };
  const [p, setP] = useState<SecurityPolicy>(base),
    [branches, setBranches] = useState(base.protectedBranches.join(", ")),
    [reason, setReason] = useState("");
  const toggle = <
    K extends "blockSeverities" | "warnSeverities" | "requiredEngines",
  >(
    k: K,
    v: string,
  ) =>
    setP(
      (x) =>
        ({
          ...x,
          [k]: (x[k] as string[]).includes(v)
            ? (x[k] as string[]).filter((i) => i !== v)
            : [...(x[k] as string[]), v],
        }) as SecurityPolicy,
    );
  const set = <K extends keyof SecurityPolicy>(k: K, v: SecurityPolicy[K]) =>
    setP((x) => ({ ...x, [k]: v }));
  const rev: number = o.policy?.revision ?? 0;
  return (
    <section aria-label="Security policy">
      <h2>
        Security policy{" "}
        {rev ? (
          <Badge tone="neutral">revision {rev}</Badge>
        ) : (
          <Badge tone="amber">not configured</Badge>
        )}
      </h2>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          save(
            {
              ...p,
              protectedBranches: branches
                .split(",")
                .map((b) => b.trim())
                .filter(Boolean),
            },
            rev,
            reason || "policy update",
          );
        }}
      >
        <label className="field">
          <span>
            <input
              type="checkbox"
              checked={p.enabled}
              onChange={(e) => set("enabled", e.target.checked)}
            />{" "}
            Enable automated scanning and GitHub checks for this repository
          </span>
        </label>
        <label className="field">
          Protected branches (comma separated; one trailing <code>{"/*"}</code>{" "}
          wildcard allowed)
          <input
            value={branches}
            onChange={(e) => setBranches(e.target.value)}
          />
        </label>
        <fieldset>
          <legend>Triggers</legend>
          {(["pullRequest", "push", "manual", "schedule"] as const).map((t) => (
            <label key={t}>
              <input
                type="checkbox"
                checked={p.triggers[t]}
                onChange={(e) =>
                  set("triggers", { ...p.triggers, [t]: e.target.checked })
                }
              />{" "}
              {t}
            </label>
          ))}
        </fieldset>
        <label className="field">
          Scan profile
          <select
            value={p.scanProfile}
            onChange={(e) => {
              const sp = e.target.value as SecurityPolicy["scanProfile"];
              setP((x) => ({
                ...x,
                scanProfile: sp,
                requiredEngines: x.requiredEngines.filter((g) =>
                  profileEngines[sp].includes(g),
                ),
              }));
            }}
          >
            {["quick", "standard", "full"].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
        <fieldset>
          <legend>
            Required engines (missing or partial coverage is never PASS)
          </legend>
          {engineList
            .filter((e) => profileEngines[p.scanProfile].includes(e))
            .map((e) => (
              <label key={e}>
                <input
                  type="checkbox"
                  checked={p.requiredEngines.includes(e)}
                  onChange={() => toggle("requiredEngines", e)}
                />{" "}
                {e}
              </label>
            ))}
        </fieldset>
        <fieldset>
          <legend>Blocking severities</legend>
          {severities.map((s) => (
            <label key={s}>
              <input
                type="checkbox"
                checked={p.blockSeverities.includes(s)}
                onChange={() => toggle("blockSeverities", s)}
              />{" "}
              {s}
            </label>
          ))}
        </fieldset>
        <fieldset>
          <legend>Warning severities</legend>
          {severities.map((s) => (
            <label key={s}>
              <input
                type="checkbox"
                checked={p.warnSeverities.includes(s)}
                onChange={() => toggle("warnSeverities", s)}
              />{" "}
              {s}
            </label>
          ))}
        </fieldset>
        <label className="field">
          Minimum confidence to block
          <select
            value={p.minBlockConfidence}
            onChange={(e) =>
              set(
                "minBlockConfidence",
                e.target.value as SecurityPolicy["minBlockConfidence"],
              )
            }
          >
            {["low", "medium", "high"].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>
            <input
              type="checkbox"
              checked={p.blockPotential}
              onChange={(e) => set("blockPotential", e.target.checked)}
            />{" "}
            Unverified (potential) findings can block
          </span>
        </label>
        <label className="field">
          <span>
            <input
              type="checkbox"
              checked={p.requireCompleteSourceCoverage}
              onChange={(e) =>
                set("requireCompleteSourceCoverage", e.target.checked)
              }
            />{" "}
            Require complete source coverage
          </span>
        </label>
        <label className="field">
          Missing / failed coverage is
          <select
            value={p.onMissingCoverage}
            onChange={(e) =>
              set(
                "onMissingCoverage",
                e.target.value as SecurityPolicy["onMissingCoverage"],
              )
            }
          >
            <option value="incomplete">INCOMPLETE (fails the check)</option>
            <option value="block">BLOCK</option>
          </select>
        </label>
        <label className="field">
          Unknown severity is
          <select
            value={p.onUnknownSeverity}
            onChange={(e) =>
              set(
                "onUnknownSeverity",
                e.target.value as SecurityPolicy["onUnknownSeverity"],
              )
            }
          >
            {["incomplete", "warn", "block"].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
        <label className="field">
          A required engine reports &ldquo;not applicable&rdquo; (nothing of its kind to
          scan)
          <select
            value={p.onNotApplicable}
            onChange={(e) =>
              set(
                "onNotApplicable",
                e.target.value as SecurityPolicy["onNotApplicable"],
              )
            }
          >
            <option value="incomplete">INCOMPLETE (not clean coverage, default)</option>
            <option value="satisfy">Covered (at least one engine must still complete)</option>
          </select>
        </label>
        <label className="field">
          Reason for this change
          <input
            value={reason}
            maxLength={200}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        <Button type="submit" disabled={busy}>
          Save policy
        </Button>
      </form>
      {o.policy && (
        <p>
          Installation:{" "}
          <Badge
            tone={o.policy.installationState === "active" ? "green" : "amber"}
          >
            {o.policy.installationState}
          </Badge>{" "}
          · last change {when(o.policy.updatedAt)} by {o.policy.updatedBy}
        </p>
      )}
    </section>
  );
}

function IntegrationSection({
  o,
  access,
  check,
  busy,
}: {
  o: Overview;
  access: any;
  check: () => void;
  busy: boolean;
}) {
  return (
    <section aria-label="GitHub integration">
      <h2>GitHub integration</h2>
      <p>
        Webhook secret:{" "}
        <Badge tone={o.readiness.webhookSecretConfigured ? "green" : "red"}>
          {o.readiness.webhookSecretConfigured
            ? "configured"
            : "not configured"}
        </Badge>{" "}
        · Check name: <code>{o.readiness.checkName}</code>
      </p>
      <Button
        variant="secondary"
        disabled={busy || !o.configured}
        onClick={check}
      >
        Re-verify GitHub App access and required-check rules
      </Button>
      {access?.access && (
        <ul aria-label="GitHub access result">
          <li>
            Access:{" "}
            <Badge tone={access.access.ok ? "green" : "red"}>
              {access.access.ok
                ? "verified"
                : (access.access.reason ?? "denied")}
            </Badge>
          </li>
          <li>
            Permissions: contents {String(access.access.permissions.contents)},
            metadata {String(access.access.permissions.metadata)}, checks:write{" "}
            {String(access.access.permissions.checks)}
          </li>
          {(access.requiredChecks ?? []).map((r: any, i: number) => (
            <li key={i}>
              Required-check rule on protected branch:{" "}
              {r.observable
                ? r.requiresGuardCheck
                  ? "OBSERVED (Guard check is required)"
                  : "NOT required — publishing a check does not block merges"
                : "not observable with the granted permissions"}{" "}
              (rulesets: {r.sources.rulesets}, classic: {r.sources.classic})
            </li>
          ))}
        </ul>
      )}
      <h3>Latest webhook deliveries</h3>
      {o.deliveries.length ? (
        <div className={styles.scroll}>
          <table>
            <caption>Deliveries routed to this project</caption>
            <thead>
              <tr>
                <th>Received</th>
                <th>Event</th>
                <th>Outcome</th>
                <th>Reason</th>
                <th>Attempts</th>
              </tr>
            </thead>
            <tbody>
              {o.deliveries.map((d: any) => (
                <tr key={d.deliveryId}>
                  <td>{when(d.receivedAt)}</td>
                  <td>
                    {d.event}
                    {d.action ? "." + d.action : ""}
                  </td>
                  <td>{d.outcome}</td>
                  <td>{d.reason ?? "—"}</td>
                  <td>{d.attempts}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty
          title="No deliveries yet"
          description="Signed GitHub deliveries for this repository will be listed here."
        />
      )}
    </section>
  );
}

function enforcementLabel(e: any) {
  if (!e?.level) return "Not assessed";
  return e.enforced
    ? "ENFORCEMENT OBSERVED — " + e.level
    : "Not enforced — " + e.level;
}
function GateSection({
  o,
  retry,
  busy,
}: {
  o: Overview;
  retry: (c: string) => void;
  busy: boolean;
}) {
  return (
    <section aria-label="Gate results">
      <h2>Gate results and GitHub checks</h2>
      {o.evaluations.length ? (
        <div className={styles.scroll}>
          <table>
            <caption>Evaluations per exact commit (newest first)</caption>
            <thead>
              <tr>
                <th>Commit</th>
                <th>Branch</th>
                <th>Decision</th>
                <th>Policy rev.</th>
                <th>GitHub check</th>
                <th>Enforcement</th>
                <th>Why</th>
              </tr>
            </thead>
            <tbody>
              {o.evaluations.map((e: any) => {
                const c = o.checks.find((x: any) => x.commit === e.commit);
                return (
                  <tr key={e.id}>
                    <td>
                      <code>{e.commit.slice(0, 12)}</code>
                    </td>
                    <td>{e.branch}</td>
                    <td>
                      <Badge tone={decisionTone[e.decision] ?? "neutral"}>
                        {e.decision}
                      </Badge>
                    </td>
                    <td>{e.policyRevision}</td>
                    <td>
                      {c ? (
                        <>
                          {c.status}
                          {c.conclusion ? " / " + c.conclusion : ""}{" "}
                          {c.published ? (
                            "(published)"
                          ) : (
                            <Badge tone="amber">
                              {c.lastError
                                ? "retrying: " + c.lastError
                                : "pending"}
                            </Badge>
                          )}
                          {!c.published && (
                            <Button
                              variant="secondary"
                              disabled={busy}
                              onClick={() => retry(e.commit)}
                            >
                              Retry
                            </Button>
                          )}
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>{enforcementLabel(e.enforcement)}</td>
                    <td>
                      {(e.evaluation?.reasons ?? [])
                        .map((r: any) => r.message)
                        .join(" ") || "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty
          title="No evaluations yet"
          description="An evaluation is recorded when a scan of an exact commit completes under the policy."
        />
      )}
      {o.checks.filter(
        (c: any) => !o.evaluations.some((e: any) => e.commit === c.commit),
      ).length > 0 && (
        <>
          <h3>Checks without a verdict yet</h3>
          <ul>
            {o.checks
              .filter(
                (c: any) =>
                  !o.evaluations.some((e: any) => e.commit === c.commit),
              )
              .map((c: any) => (
                <li key={c.commit}>
                  <code>{c.commit.slice(0, 12)}</code> — {c.status}
                  {c.conclusion ? " / " + c.conclusion : ""}{" "}
                  {c.decision ? "(" + c.decision + ")" : ""}{" "}
                  {c.published ? "" : "· not yet published"}
                </li>
              ))}
          </ul>
        </>
      )}
    </section>
  );
}

function TriggerSection({
  o,
  start,
  busy,
  defaultBranch,
}: {
  o: Overview;
  start: (b: string, c: string) => void;
  busy: boolean;
  defaultBranch: string;
}) {
  const [branch, setBranch] = useState(defaultBranch),
    [commit, setCommit] = useState("");
  return (
    <section aria-label="Scan automation">
      <h2>Scan automation</h2>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          start(branch, commit.trim());
        }}
      >
        <label className="field">
          Branch
          <input value={branch} onChange={(e) => setBranch(e.target.value)} />
        </label>
        <label className="field">
          Exact commit (optional; default is the branch head)
          <input
            value={commit}
            pattern="[a-f0-9]{40}|"
            onChange={(e) => setCommit(e.target.value)}
          />
        </label>
        <Button type="submit" disabled={busy || !o.policy?.policy?.enabled}>
          Queue manual scan
        </Button>
      </form>
      {!o.policy?.policy?.enabled && (
        <Notice tone="amber">
          Enable the policy first; disabled policies never scan.
        </Notice>
      )}
      {o.triggers.length ? (
        <div className={styles.scroll}>
          <table>
            <caption>Triggers and execution history</caption>
            <thead>
              <tr>
                <th>Created</th>
                <th>Source</th>
                <th>Commit</th>
                <th>Branch</th>
                <th>Status</th>
                <th>Attempts</th>
                <th>Detail</th>
              </tr>
            </thead>
            <tbody>
              {o.triggers.map((t: any) => (
                <tr key={t.id}>
                  <td>{when(t.createdAt)}</td>
                  <td>
                    {t.source}
                    {t.prNumber ? " #" + t.prNumber : ""}
                  </td>
                  <td>
                    <code>{t.commit.slice(0, 12)}</code>
                  </td>
                  <td>{t.branch}</td>
                  <td>
                    <Badge
                      tone={
                        t.status === "completed"
                          ? "green"
                          : t.status === "failed"
                            ? "red"
                            : "neutral"
                      }
                    >
                      {t.status}
                    </Badge>
                  </td>
                  <td>{t.attempts}</td>
                  <td>{t.lastError ?? t.note ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty
          title="No triggers yet"
          description="Pushes, pull requests, schedules and manual requests appear here."
        />
      )}
    </section>
  );
}

function DeploymentSection({
  o,
  map,
  verify,
  register,
  busy,
}: {
  o: Overview;
  map: (p: string, t: string) => void;
  verify: (id: string) => void;
  register: () => void;
  busy: boolean;
}) {
  const [pid, setPid] = useState(""),
    [team, setTeam] = useState(""),
    [dep, setDep] = useState(""),
    [confirm, setConfirm] = useState("");
  const v = o.providers.vercel;
  return (
    <section aria-label="Deployments">
      <h2>Deployments (Vercel)</h2>
      <p>
        Vercel:{" "}
        <Badge tone={v.mapped ? "green" : "neutral"}>
          {v.mapped ? "mapped " + v.projectId : "not mapped"}
        </Badge>{" "}
        · token:{" "}
        <Badge tone={o.readiness.vercelTokenConfigured ? "green" : "amber"}>
          {o.readiness.vercelTokenConfigured ? "configured" : "not configured"}
        </Badge>
      </p>
      <Notice tone="neutral">
        Three different things: (1) GitHub blocks a pull-request <em>merge</em>{" "}
        only through a required-check rule; (2) Vercel holds{" "}
        <em>production promotion</em> only when its Deployment Check is
        registered; (3) Guard never claims to prevent deployment{" "}
        <em>creation</em> or the build. Read-only verification is the default.
      </Notice>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          map(pid.trim(), team.trim());
        }}
      >
        <label className="field">
          Vercel project id (prj_…)
          <input value={pid} onChange={(e) => setPid(e.target.value)} />
        </label>
        <label className="field">
          Vercel team id (optional)
          <input value={team} onChange={(e) => setTeam(e.target.value)} />
        </label>
        <Button type="submit" disabled={busy || !pid.trim()}>
          Verify and map project
        </Button>
      </form>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          verify(dep.trim());
        }}
      >
        <label className="field">
          Deployment id (blank = latest production)
          <input value={dep} onChange={(e) => setDep(e.target.value)} />
        </label>
        <Button type="submit" variant="secondary" disabled={busy || !v.mapped}>
          Verify deployment (read-only)
        </Button>
      </form>
      {o.deployments.length ? (
        <div className={styles.scroll}>
          <table>
            <caption>Verified provider evidence</caption>
            <thead>
              <tr>
                <th>Deployment</th>
                <th>Env</th>
                <th>State</th>
                <th>Commit</th>
                <th>Decision</th>
                <th>Enforcement</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {o.deployments.map((d: any) => (
                <tr key={d.deploymentId}>
                  <td>
                    <code>{d.deploymentId}</code>
                  </td>
                  <td>{d.environment}</td>
                  <td>{d.state}</td>
                  <td>
                    <code>{d.commit?.slice(0, 12) ?? "?"}</code>
                  </td>
                  <td>
                    {d.decision ? (
                      <Badge tone={decisionTone[d.decision] ?? "neutral"}>
                        {d.decision}
                      </Badge>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>{enforcementLabel(d.enforcement)}</td>
                  <td>
                    {(d.enforcement?.notes ?? []).join(" ") ||
                      d.providerError ||
                      "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty
          title="No deployment evidence"
          description="Nothing is shown as enforced until a provider deployment of the evaluated commit has been read."
        />
      )}
      <details>
        <summary>
          Register Guard as a required Vercel Deployment Check (changes your
          Vercel project)
        </summary>
        <p>
          This is the only action that writes to Vercel. It adds a GitHub-backed
          Deployment Check named <code>{o.readiness.checkName}</code> that holds{" "}
          <strong>production</strong> aliasing until it passes. Team members can
          still Force Promote in Vercel; Guard reports that honestly.
        </p>
        <label className="field">
          Type <code>REGISTER_VERCEL_DEPLOYMENT_CHECK</code> to confirm
          <input value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </label>
        <Button
          variant="danger"
          disabled={
            busy || !v.mapped || confirm !== "REGISTER_VERCEL_DEPLOYMENT_CHECK"
          }
          onClick={register}
        >
          Register deployment check
        </Button>
      </details>
    </section>
  );
}

function ScheduleSection({
  o,
  save,
  busy,
  defaultBranch,
}: {
  o: Overview;
  save: (s: unknown) => void;
  busy: boolean;
  defaultBranch: string;
}) {
  const [id, setId] = useState("nightly-scan"),
    [kind, setKind] = useState<"interval" | "cron">("interval"),
    [minutes, setMinutes] = useState(1440),
    [expr, setExpr] = useState("0 3 * * *"),
    [branch, setBranch] = useState(defaultBranch),
    [profile, setProfile] = useState("standard"),
    [enabled, setEnabled] = useState(true);
  return (
    <section aria-label="Scheduled scans">
      <h2>Scheduled scans</h2>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          save({
            id,
            enabled,
            branch,
            profile,
            cadence: kind === "interval" ? { kind, minutes } : { kind, expr },
          });
        }}
      >
        <label className="field">
          Schedule id
          <input value={id} onChange={(e) => setId(e.target.value)} />
        </label>
        <label className="field">
          Cadence
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as "interval" | "cron")}
          >
            <option value="interval">Every N minutes</option>
            <option value="cron">Cron (UTC)</option>
          </select>
        </label>
        {kind === "interval" ? (
          <label className="field">
            Minutes (60–10080)
            <input
              type="number"
              min={60}
              max={10080}
              value={minutes}
              onChange={(e) => setMinutes(Number(e.target.value))}
            />
          </label>
        ) : (
          <label className="field">
            Cron expression (5 fields, at most hourly)
            <input value={expr} onChange={(e) => setExpr(e.target.value)} />
          </label>
        )}
        <label className="field">
          Branch
          <input value={branch} onChange={(e) => setBranch(e.target.value)} />
        </label>
        <label className="field">
          Profile
          <select value={profile} onChange={(e) => setProfile(e.target.value)}>
            {["quick", "standard", "full"].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />{" "}
            Enabled
          </span>
        </label>
        <Button
          type="submit"
          disabled={busy || !o.policy?.policy?.triggers?.schedule}
        >
          Save schedule
        </Button>
      </form>
      {!o.policy?.policy?.triggers?.schedule && (
        <Notice tone="amber">
          Enable the “schedule” trigger in the policy to allow scheduled scans.
        </Notice>
      )}
      {o.schedules.length ? (
        <div className={styles.scroll}>
          <table>
            <caption>Schedules (UTC)</caption>
            <thead>
              <tr>
                <th>Id</th>
                <th>Enabled</th>
                <th>Cadence</th>
                <th>Branch</th>
                <th>Next run</th>
                <th>Last run</th>
                <th>Last status</th>
                <th>Failures</th>
              </tr>
            </thead>
            <tbody>
              {o.schedules.map((s: any) => (
                <tr key={s.id}>
                  <td>{s.id}</td>
                  <td>{String(s.enabled)}</td>
                  <td>
                    {s.cadence.kind === "interval"
                      ? "every " + s.cadence.minutes + " min"
                      : "cron " + s.cadence.expr}
                  </td>
                  <td>{s.branch}</td>
                  <td>{when(s.nextRunAt)}</td>
                  <td>{when(s.lastRunAt)}</td>
                  <td>{s.lastStatus ?? "—"}</td>
                  <td>{s.consecutiveFailures}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty
          title="No schedules"
          description="Schedules are explicit, bounded (at most hourly, five per project) and re-check authorization on every run."
        />
      )}
    </section>
  );
}

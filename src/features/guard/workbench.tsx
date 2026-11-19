"use client";
import { useState } from "react";
import {
  Badge,
  Button,
  Card,
  Empty,
  Modal,
  Notice,
  SectionHeading,
} from "@/components/ui";
import {
  engines,
  type Engine,
  type Finding,
  type InvariantPlan,
  type ScanJob,
} from "./contracts";
import { profiles } from "./pipeline";
import { guidance } from "./evidence";
import { evaluate, report, reportHtml, type ReleasePolicy } from "./release";
import { runSyntheticInvariant, type IntegrityResult } from "./integrity";
import {
  cancelGuardDemo,
  demoGrant,
  demoScope,
  resetGuardDemo,
  reviewDemo,
  runGuardDemo,
  selectJob,
  useGuardDemo,
} from "./demo-session";
import styles from "./workbench.module.css";
import { DastScopeForm } from "./dast-scope-form";
import { LocalArtifactTools } from "./local-artifact-tools";
const names: Record<Engine, string> = {
  sast: "Code (SAST)",
  sca: "Dependencies (SCA)",
  secrets: "Secrets",
  iac: "Infrastructure",
  container: "Container",
  sbom: "SBOM",
  dast: "Staging DAST",
  api: "API security",
  integrity: "Integrity",
};
function download(content: string, extension: "json" | "html") {
  const url = URL.createObjectURL(
    new Blob([content], {
      type: extension === "json" ? "application/json" : "text/html",
    }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = "guard-demo-evidence." + extension;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function Coverage({ job }: { job?: ScanJob }) {
  return (
    <div className={styles.scroll}>
      <table>
        <caption>Engine coverage - demo scope only</caption>
        <thead>
          <tr>
            <th>Engine</th>
            <th>Status</th>
            <th>Source / reason</th>
          </tr>
        </thead>
        <tbody>
          {engines.map((engine) => {
            const run = job?.runs.find((r) => r.engine === engine);
            return (
              <tr key={engine}>
                <th scope="row">{names[engine]}</th>
                <td>{run?.status ?? "not_configured"}</td>
                <td>
                  {run
                    ? `${run.scanner} ${run.version}: ${run.reason}`
                    : "No job executed. Live adapter unavailable."}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
function FindingReview({
  finding,
  onClose,
}: {
  finding: Finding;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const [status, setStatus] = useState<
    "under_review" | "fix_pending_retest" | "false_positive" | "risk_accepted"
  >("under_review");
  const [error, setError] = useState("");
  return (
    <Modal
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={finding.title}
      description="Synthetic finding. This evidence is not from your connected repository."
    >
      <div className={styles.stack}>
        <Badge tone="amber">
          {finding.severity} / {finding.status}
        </Badge>
        <p>
          {finding.source.scanner} {finding.source.version} /{" "}
          {finding.source.ruleId}
        </p>
        <p>
          {finding.location.path}:{finding.location.line} / confidence{" "}
          {finding.confidence}
        </p>
        {finding.evidence.map((e) => (
          <div key={e.id} className={styles.meta}>
            <p>{e.summary}</p>
            <small>
              Commit {e.commit}
              <br />
              Evidence {e.id}
              <br />
              {e.recordedAt}
            </small>
          </div>
        ))}
        <Notice>AI not configured. {guidance(finding)}</Notice>
        <label className="field">
          Review outcome
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as typeof status)}
          >
            <option value="under_review">Under review</option>
            <option value="fix_pending_retest">Fix pending retest</option>
            <option value="false_positive">False positive</option>
            <option value="risk_accepted">Risk accepted</option>
          </select>
        </label>
        <label className="field">
          Review reason
          <textarea
            value={reason}
            maxLength={1000}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
          />
        </label>
        {error && <p role="alert">{error}</p>}
        <Button
          disabled={reason.trim().length < 8}
          onClick={() => {
            try {
              reviewDemo(finding.id, status, reason);
              onClose();
            } catch {
              setError(
                "A meaningful reason and valid demo review scope are required.",
              );
            }
          }}
        >
          Save demo review
        </Button>
        <Notice tone="neutral">
          Live targeted retest is not configured. An empty scan cannot mark this
          fixed. Canvas linking requires a component mapping; none exists for
          this fixture.
        </Notice>
      </div>
    </Modal>
  );
}
function IntegrityLab() {
  const [kind, setKind] = useState<InvariantPlan["kind"]>("ownership"),
    [confirmed, setConfirmed] = useState(false),
    [patched, setPatched] = useState(false),
    [result, setResult] = useState<IntegrityResult | null>(null);
  return (
    <div className={styles.stack}>
      <h3>Five controlled security invariants</h3>
      <label className="field">
        Synthetic invariant
        <select
          value={kind}
          onChange={(e) => {
            setKind(e.target.value as typeof kind);
            setResult(null);
            setConfirmed(false);
          }}
        >
          {[
            "ownership",
            "workflow_bypass",
            "state_transition",
            "replay",
            "unauthorized_modification",
          ].map((k) => (
            <option key={k} value={k}>
              {k.replaceAll("_", " ")}
            </option>
          ))}
        </select>
      </label>
      <p>
        Expected:{" "}
        {kind === "ownership" || kind === "unauthorized_modification"
          ? "403: another dummy actor cannot read or modify the resource."
          : "409: reject bypass, locked-state edits or duplicate actions."}
      </p>
      <label className="check-line">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => {
            setConfirmed(e.target.checked);
            setResult(null);
          }}
        />
        I confirm this synthetic invariant
      </label>
      <label className="check-line">
        <input
          type="checkbox"
          checked={patched}
          onChange={(e) => {
            setPatched(e.target.checked);
            setResult(null);
          }}
        />
        Use patched in-memory fixture
      </label>
      <Button
        disabled={!confirmed}
        onClick={() =>
          setResult(
            runSyntheticInvariant(
              {
                ...demoScope,
                id: kind,
                kind,
                description: "User-confirmed synthetic template",
                confirmedBy: "demo-reviewer",
                expectedStatus:
                  kind === "ownership" || kind === "unauthorized_modification"
                    ? 403
                    : 409,
                synthetic: true,
              },
              patched,
            ),
          )
        }
      >
        Run controlled invariant
      </Button>
      <div role="status">
        {result
          ? `${result.status.toUpperCase()}: expected ${result.expected}, observed ${result.observed}. ${result.summary}`
          : "NOT_EXECUTED - confirm the invariant before running."}
      </div>
      <Notice tone="neutral">
        No HTTP requests or customer mutations. Live execution requires approved
        staging, dummy accounts and an isolated runner.
      </Notice>
    </div>
  );
}
export function GuardWorkbench({
  section = "",
  fixtureWorkflow = false,
}: {
  section?: string;
  fixtureWorkflow?: boolean;
}) {
  const state = useGuardDemo();
  const job = state.jobs.find((j) => j.id === state.selectedId);
  const [open, setOpen] = useState(false),
    [live, setLive] = useState(false),
    [profile, setProfile] = useState<ScanJob["profile"]>("quick"),
    [selected, setSelected] = useState<Engine[]>([...profiles.quick]),
    [failure, setFailure] = useState(false),
    [query, setQuery] = useState(""),
    [severity, setSeverity] = useState("all"),
    [selectedFinding, setSelectedFinding] = useState<string | null>(null),
    [strict, setStrict] = useState(false);
  const policy: ReleasePolicy = {
    id: strict ? "strict-demo" : "review-demo",
    required: [...profiles[job?.profile ?? profile]],
    blockSeverities: ["critical", "high"],
    blockPotential: strict,
  };
  const release = job ? evaluate(job, policy) : null;
  const detail = job?.findings.find((f) => f.id === selectedFinding);
  const rows = (job?.findings ?? [])
    .filter(
      (f) =>
        (severity === "all" || f.severity === severity) &&
        `${f.title} ${f.location.path} ${f.source.ruleId}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .sort(
      (a, b) =>
        ["critical", "high", "medium", "low", "info"].indexOf(a.severity) -
        ["critical", "high", "medium", "low", "info"].indexOf(b.severity),
    );
  return (
    <Card className={styles.panel} aria-label="Guard workbench">
      <SectionHeading title="Guard workbench">
        <Badge tone="blue">DEMO MODE</Badge>
      </SectionHeading>
      <p>
        Orderly synthetic fixture / demo-fixture / commit {"a".repeat(12)}.
        Connected customer repositories are not scanned here.
      </p>
      <div className={styles.toolbar}>
        <Button onClick={() => setOpen(true)} disabled={state.busy}>
          {fixtureWorkflow ? "Run fixture workflow" : "Scan My App"}
        </Button>
        {state.busy && (
          <Button variant="danger" onClick={cancelGuardDemo}>
            Cancel demo scan
          </Button>
        )}
        <Button variant="secondary" onClick={() => setLive(true)}>
          {fixtureWorkflow ? "View live dependencies" : "Check Live readiness"}
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            resetGuardDemo();
            setSelectedFinding(null);
          }}
        >
          Reset Guard demo
        </Button>
      </div>
      <Notice>
        Demo jobs stay in this browser runtime only. Reload clears them and does
        not invent completed results. Fixture results do not prove live
        scanning. The original Orderly examples remain available separately
        below.
      </Notice>
      {state.error && <p role="alert">{state.error}</p>}
      <p role="status">
        {job ? `Latest demo job: ${job.status}` : "No workbench scan has run."}{" "}
        Release: {release?.decision ?? "INCOMPLETE"}. No CI gate connected.
      </p>
      {section === "/inventory" || section === "/remediation" ? (
        <LocalArtifactTools section={section} />
      ) : section === "/integrity" ? (
        <IntegrityLab />
      ) : section === "/remediation" ? (
        <Notice>
          AI not configured. Open a finding for deterministic review guidance.
          No patches or pull requests are created.
        </Notice>
      ) : (
        <>
          {(section === "" || section === "/scans") && (
            <details open={Boolean(job) || section === "/scans"}>
              <summary>Engine coverage and scan history</summary>
              <Coverage job={job} />
              <h3>Workbench scan history</h3>
              {!state.jobs.length ? (
                <Empty
                  title="No scan history yet"
                  description="Start an explicit demo simulation. No customer code is fetched."
                />
              ) : (
                <div className={styles.scroll}>
                  <table>
                    <caption>Synthetic scan jobs</caption>
                    <thead>
                      <tr>
                        <th>Scan</th>
                        <th>Status</th>
                        <th>Commit</th>
                        <th>Started / finished</th>
                      </tr>
                    </thead>
                    <tbody>
                      {state.jobs.map((j) => (
                        <tr key={j.id}>
                          <td>
                            <Button
                              variant="ghost"
                              onClick={() => selectJob(j.id)}
                            >
                              {j.id.slice(0, 10)}
                            </Button>
                          </td>
                          <td>{j.status}</td>
                          <td>{j.repository.commit.slice(0, 12)}</td>
                          <td>
                            {j.createdAt}
                            <br />
                            {j.finishedAt ?? "unfinished"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </details>
          )}
          {(section === "/findings" || (section === "" && Boolean(job))) && (
            <>
              <h3>Workbench findings</h3>
              <div className={styles.toolbar}>
                <label className="field">
                  Search workbench findings
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </label>
                <label className="field">
                  Workbench severity
                  <select
                    value={severity}
                    onChange={(e) => setSeverity(e.target.value)}
                  >
                    {["all", "critical", "high", "medium", "low", "info"].map(
                      (s) => (
                        <option key={s}>{s}</option>
                      ),
                    )}
                  </select>
                </label>
              </div>
              {rows.length ? (
                <ul className={styles.stack}>
                  {rows.map((f) => (
                    <li key={f.id}>
                      <Button
                        variant="secondary"
                        onClick={() => setSelectedFinding(f.id)}
                      >
                        {f.title}
                      </Button>
                      <p>
                        {f.severity} / {f.confidence} confidence / {f.status} /{" "}
                        {f.source.scanner} / {f.location.path}:{f.location.line}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>
                  No matching findings. Missing or failed coverage is not
                  evidence of safety.
                </p>
              )}
            </>
          )}
          {(section === "/releases" || (section === "" && Boolean(job))) && (
            <>
              <h3>Release evidence</h3>
              <label className="check-line">
                <input
                  type="checkbox"
                  checked={strict}
                  onChange={(e) => setStrict(e.target.checked)}
                />
                Strict demo policy: include potential high/critical findings as
                blockers
              </label>
              <p>
                Required engines ({job?.profile ?? profile}):{" "}
                {policy.required.join(", ")}.{" "}
                {release?.reasons.join(" ") ?? "No job evidence available."}
              </p>
              <div className={styles.actions}>
                <Button
                  variant="secondary"
                  disabled={!job || state.busy}
                  onClick={() =>
                    job &&
                    download(
                      JSON.stringify(report(demoGrant(), job, policy), null, 2),
                      "json",
                    )
                  }
                >
                  Download JSON evidence
                </Button>
                <Button
                  variant="secondary"
                  disabled={!job || state.busy}
                  onClick={() =>
                    job &&
                    download(
                      reportHtml(report(demoGrant(), job, policy)),
                      "html",
                    )
                  }
                >
                  Download printable HTML
                </Button>
              </div>
              <Notice tone="neutral">
                Evaluation only. Missing required checks produce INCOMPLETE.
                Exported evidence is synthetic and is not a pentest or security
                certification.
              </Notice>
            </>
          )}
        </>
      )}
      <Modal
        open={open}
        onOpenChange={setOpen}
        title="Configure Guard demo scan"
        description="An explicit local simulation. No scanner, repository download, paid API or target request."
      >
        <div className={styles.stack}>
          <label className="field">
            Scan profile
            <select
              value={profile}
              onChange={(e) => {
                const p = e.target.value as typeof profile;
                setProfile(p);
                setSelected([...profiles[p]]);
              }}
            >
              <option value="quick">Quick</option>
              <option value="standard">Standard</option>
              <option value="full">Full</option>
            </select>
          </label>
          <fieldset>
            <legend>Requested engines and actual demo availability</legend>
            {engines.map((engine) => (
              <label className="check-line" key={engine}>
                <input
                  type="checkbox"
                  checked={selected.includes(engine)}
                  onChange={(e) =>
                    setSelected(
                      e.target.checked
                        ? [...selected, engine]
                        : selected.filter((s) => s !== engine),
                    )
                  }
                />
                {names[engine]} -{" "}
                {engine === "sast" ||
                (fixtureWorkflow && ["sca", "secrets", "iac"].includes(engine))
                  ? "synthetic parser simulation"
                  : "NOT_CONFIGURED (excluded from completed coverage)"}
              </label>
            ))}
          </fieldset>
          <Notice>
            Scope: reviewed synthetic JSON only, no network and no billable
            compute. Runtime varies by browser; no production resource estimate
            is available. DAST remains disabled.
          </Notice>
          <label className="check-line">
            <input
              type="checkbox"
              checked={failure}
              onChange={(e) => setFailure(e.target.checked)}
            />
            Inject synthetic SAST failure
          </label>
          <Button
            disabled={!selected.length || state.busy}
            onClick={() => {
              setOpen(false);
              void runGuardDemo(profile, selected, failure, fixtureWorkflow);
            }}
          >
            Start workbench simulation
          </Button>
        </div>
      </Modal>
      <Modal
        open={live}
        onOpenChange={setLive}
        title="Live Guard is not configured"
        description="No customer job is started and no demo findings are shown as Live results."
      >
        <div className={styles.stack}>
          <p>
            NOT_SCANNED / NOT_TESTED. Connect &rarr; Understand &rarr; Test
            &rarr; Protect &rarr; Monitor requires an authorized immutable
            repository snapshot and project-scoped server grant first.
          </p>
          <ul>
            <li>
              Repository jobs require current project authorization and an
              immutable snapshot
            </li>
            <li>
              Durable results/queue integration and runtime qualification
              required
            </li>
            <li>
              Scanner isolation and enforcing egress: live qualification
              required
            </li>
            <li>
              DAST: disabled; staging authorization not configured (GRD-011/012)
            </li>
            <li>Canvas, Intelligence and Sentinel: typed ports only</li>
            <li>
              AI: not configured; deterministic guidance available (GRD-017)
            </li>
          </ul>
          <Notice>
            No upload/local path or arbitrary target URL is accepted. Your
            existing Auth/session is unchanged.
          </Notice>
          <DastScopeForm />
        </div>
      </Modal>
      {detail && (
        <FindingReview
          key={detail.id}
          finding={detail}
          onClose={() => setSelectedFinding(null)}
        />
      )}
    </Card>
  );
}

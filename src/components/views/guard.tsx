"use client";
import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  CircleDashed,
  Code2,
  FileCode2,
  GitBranch,
  LockKeyhole,
  Play,
  ShieldCheck,
  TriangleAlert,
  Workflow,
} from "lucide-react";
import { findings, PROJECT } from "@/data/demo";
import { scans } from "@/services/adapters";
import { useDemo, toast } from "../demo-provider";
import {
  Badge,
  Button,
  Card,
  Empty,
  LinkButton,
  Modal,
  Notice,
  PageHeader,
  SectionHeading,
  TextLink,
} from "../ui";
export function GuardTabs({ active }: { active: string }) {
  return (
    <nav className="page-tabs" aria-label="Guard sections">
      {[
        ["Overview", ""],
        ["Scan history", "/scans"],
        ["Findings", "/findings"],
        ["Logic & workflows", "/integrity"],
        ["Remediation", "/remediation"],
        ["Release status", "/releases"],
      ].map(([label, path]) => (
        <Link
          key={label}
          href={`${PROJECT}/guard${path}`}
          className={active === path ? "active" : ""}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
export function SimulateScan() {
  const { dispatch } = useDemo();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  async function run() {
    setBusy(true);
    try {
      await scans.run();
      dispatch({ type: "scan" });
      toast.success("Demo scan completed. Synthetic findings are ready.");
      setOpen(false);
    } catch {
      toast.error("Simulation could not finish. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      open={open}
      onOpenChange={setOpen}
      trigger={
        <Button>
          <Play size={16} />
          Simulate scan
        </Button>
      }
      title="Run a demo security check"
      description="A local simulation using fixed synthetic evidence. No repository or deployment is accessed."
    >
      <div className="check-summary">
        <p>
          <CheckCircle2 size={17} />
          Code and access-control fixtures
        </p>
        <p>
          <CheckCircle2 size={17} />
          Dependency and configuration fixtures
        </p>
        <p>
          <CircleDashed size={17} />
          DAST excluded · separately authorized target required
        </p>
      </div>
      <Notice>
        Estimated duration: 1 second. No paid API, network testing, or compute
        credits.
      </Notice>
      <Button onClick={run} disabled={busy}>
        {busy ? "Running demo simulation…" : "Start simulated scan"}
        <Play size={16} />
      </Button>
    </Modal>
  );
}
export function Guard({ section = "" }: { section?: string }) {
  const { state } = useDemo();
  return (
    <div className="page">
      <PageHeader
        eyebrow="GUARD · CHECK BEFORE YOU SHIP"
        title={
          section === "/scans"
            ? "Every check has a story."
            : section === "/findings"
              ? "A clear path from risk to resolution."
              : section === "/releases"
                ? "A thoughtful pause before release."
                : "Build with a little more confidence."
        }
        description="Understand the evidence, what was checked, and what still needs your attention."
        action={<SimulateScan />}
      />
      <GuardTabs active={section} />
      {section === "/findings" ? (
        <FindingsList />
      ) : section === "/scans" ? (
        <ScanHistory />
      ) : section === "/releases" ? (
        <ReleaseStatus />
      ) : (
        <>
          <div className="three-columns">
            <Card className="summary-card">
              <span className="stat-icon blue">
                <ShieldCheck />
              </span>
              <small>Latest check</small>
              <h2>Demo scan #{state.scans}</h2>
              <Badge tone="blue">Simulated</Badge>
              <p>{state.branch} · a1b2c3d · synthetic commit</p>
            </Card>
            <Card className="summary-card">
              <span className="stat-icon amber">
                <TriangleAlert />
              </span>
              <small>Findings to review</small>
              <h2>
                {state.findingStatus === "verified_fixed" ? 2 : 3} findings
              </h2>
              <Badge tone="amber">1 high priority</Badge>
              <p>Access control is a good place to start.</p>
            </Card>
            <Card className="summary-card">
              <span className="stat-icon neutral">
                <LockKeyhole />
              </span>
              <small>Release decision</small>
              <h2>Review required</h2>
              <Badge>No real gate connected</Badge>
              <p>Incomplete checks never mean a pass.</p>
            </Card>
          </div>
          <div className="two-columns">
            <Card>
              <SectionHeading title="Your security checks">
                <Badge>Availability</Badge>
              </SectionHeading>
              <div className="checks-list">
                {[
                  ["Code analysis (SAST)", "Demo fixtures", "blue"],
                  ["Dependencies (SCA)", "Demo inventory", "blue"],
                  ["Secrets & configuration", "Demo fixtures", "blue"],
                  ["API access-control tests", "Demo simulation", "blue"],
                  ["Logic & workflows", "Demo simulation", "blue"],
                  [
                    "Staging DAST",
                    state.staging.url
                      ? "Scope configured · runner unavailable"
                      : "Not configured",
                    "neutral",
                  ],
                  ["Container & SBOM", "Runner unavailable", "neutral"],
                  ["AI remediation", "Not configured", "neutral"],
                ].map(([label, status, tone]) => (
                  <div key={label}>
                    <span>{label}</span>
                    <Badge tone={tone as "blue" | "neutral"}>{status}</Badge>
                  </div>
                ))}
              </div>
            </Card>
            <Card className="recommended-finding">
              <div className="eyebrow">RECOMMENDED NEXT STEP</div>
              <span className="big-feature-icon amber">
                <FileCode2 size={30} />
              </span>
              <h2>Who can see an order?</h2>
              <p>
                A customer may be able to read another customer’s order. Start
                with the evidence and a small, scoped fix.
              </p>
              <Badge tone="amber">High · Access control</Badge>
              <LinkButton href={`${PROJECT}/guard/findings/FIND-102`}>
                Understand this finding <ArrowRight size={16} />
              </LinkButton>
              <TextLink href={`${PROJECT}/canvas?node=orders-api`}>
                See it on your application map
              </TextLink>
            </Card>
          </div>
          <Notice>
            Every check shown here uses local demo fixtures. No source code,
            deployment, credentials, or real customer records are scanned.
          </Notice>
        </>
      )}
    </div>
  );
}
export function FindingsList() {
  const { state } = useDemo();
  const [query, setQuery] = useState("");
  const [severity, setSeverity] = useState("all");
  const [verification, setVerification] = useState("all");
  const [engine, setEngine] = useState("all");
  const [component, setComponent] = useState("all");
  const filtered = findings.filter(
    (f) =>
      (severity === "all" || f.severity === severity) &&
      (engine === "all" || f.engine === engine) &&
      (component === "all" || f.nodeId === component) &&
      (verification === "all" ||
        (f.id === "FIND-102"
          ? state.findingStatus === "verified" ||
            state.findingStatus === "verified_fixed"
          : false)) &&
      (f.title + " " + f.category + " " + f.id)
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <Card className="findings-card">
      <div className="filters">
        <input
          aria-label="Search findings"
          placeholder="Search findings or ID…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          aria-label="Filter severity"
          value={severity}
          onChange={(e) => setSeverity(e.target.value)}
        >
          <option value="all">All severities</option>
          {["high", "medium", "low"].map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
        <select
          aria-label="Filter verification"
          value={verification}
          onChange={(e) => setVerification(e.target.value)}
        >
          <option value="all">All evidence</option>
          <option value="verified">Verified in simulation</option>
        </select>
        <select
          aria-label="Filter component"
          value={component}
          onChange={(e) => setComponent(e.target.value)}
        >
          <option value="all">All components</option>
          <option value="orders-api">Orders API</option>
          <option value="web">Web application</option>
          <option value="hosting">Hosting</option>
        </select>
        <select
          aria-label="Filter engine"
          value={engine}
          onChange={(e) => setEngine(e.target.value)}
        >
          <option value="all">All engines</option>
          {findings.map((f) => (
            <option key={f.id}>{f.engine}</option>
          ))}
        </select>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Finding</th>
              <th>Priority</th>
              <th>Evidence</th>
              <th>Component</th>
              <th>
                <span className="sr-only">Open</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((f) => (
              <tr key={f.id}>
                <td>
                  <Link href={`${PROJECT}/guard/findings/${f.id}`}>
                    <strong>{f.title}</strong>
                    <small>
                      {f.id} · {f.category}
                    </small>
                  </Link>
                </td>
                <td>
                  <Badge
                    tone={
                      f.severity === "high"
                        ? "amber"
                        : f.severity === "medium"
                          ? "blue"
                          : "neutral"
                    }
                  >
                    {f.severity}
                  </Badge>
                </td>
                <td>
                  <span className="small-text">
                    {f.id === "FIND-102"
                      ? state.findingStatus.replaceAll("_", " ")
                      : "Inferred"}
                  </span>
                  <small>Demo fixture</small>
                </td>
                <td>{f.nodeId}</td>
                <td>
                  <Link
                    aria-label={`View ${f.id}`}
                    href={`${PROJECT}/guard/findings/${f.id}`}
                  >
                    <ArrowRight size={17} />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!filtered.length && (
        <Empty
          title="Nothing matches these filters"
          description="Try a different search or reset the filters."
          action={
            <Button
              variant="secondary"
              onClick={() => {
                setQuery("");
                setSeverity("all");
                setVerification("all");
                setComponent("all");
                setEngine("all");
              }}
            >
              Clear filters
            </Button>
          }
        />
      )}
      <div className="table-footer">
        {filtered.length} findings · Orderly Demo · Synthetic evidence
      </div>
    </Card>
  );
}
function ScanHistory() {
  const { state } = useDemo();
  return (
    <Card>
      <SectionHeading title="Scan history">
        <Badge tone="blue">Demo jobs</Badge>
      </SectionHeading>
      {Array.from({ length: state.scans }, (_, i) => state.scans - i).map(
        (id) => (
          <div className="history-row" key={id}>
            <span className="stat-icon blue">
              <ShieldCheck size={20} />
            </span>
            <div>
              <strong>Demo security check #{id}</strong>
              <small>
                {state.branch} · a1b2c3d · Code, dependencies & API fixtures · 1
                sec
              </small>
            </div>
            <Badge tone="blue">Simulated</Badge>
            <TextLink href={`${PROJECT}/guard/findings`}>3 findings</TextLink>
          </div>
        ),
      )}
    </Card>
  );
}
function ReleaseStatus() {
  const { state } = useDemo();
  const [policy, setPolicy] = useState("strict");
  return (
    <div className="two-columns">
      <Card>
        <SectionHeading title="Release policy preview">
          <Badge tone="amber">Review required</Badge>
        </SectionHeading>
        <Notice tone="amber">
          {state.findingStatus === "verified_fixed"
            ? "The access-control retest passed within the demo fixture. Other checks remain incomplete."
            : "An unresolved high-priority finding needs review."}{" "}
          No provider deployment is blocked by this prototype.
        </Notice>
        <label className="field">
          Demo policy
          <select value={policy} onChange={(e) => setPolicy(e.target.value)}>
            <option value="strict">
              High / Critical require review · Medium warn
            </option>
            <option value="review">Manual review for every release</option>
          </select>
        </label>
        <Button
          variant="secondary"
          onClick={() =>
            toast.success(
              "Demo release policy saved. No deployment enforcement is connected.",
            )
          }
        >
          Save demo policy
        </Button>
        <div className="checks-list">
          <div>
            <span>Access-control evidence</span>
            <Badge tone="amber">
              {state.findingStatus.replaceAll("_", " ")}
            </Badge>
          </div>
          <div>
            <span>DAST</span>
            <Badge>Not run</Badge>
          </div>
          <div>
            <span>Provider enforcement</span>
            <Badge>Unavailable</Badge>
          </div>
        </div>
      </Card>
      <Card>
        <h2>Release history</h2>
        <div className="history-row">
          <GitBranch size={20} />
          <div>
            <strong>a1b2c3d · main</strong>
            <small>13 Nov 2026 · Synthetic release</small>
          </div>
          <Badge>Review required</Badge>
        </div>
        <p>
          A check that was not run cannot establish a pass. This release is a
          demo record, not an actual deployment.
        </p>
        <TextLink href="/app/reports">View release evidence</TextLink>
      </Card>
    </div>
  );
}
export function FindingDetail({ id = "FIND-102" }: { id?: string }) {
  const f = findings.find((f) => f.id === id)!;
  const { state, dispatch } = useDemo();
  const [fix, setFix] = useState(false);
  const [busy, setBusy] = useState(false);
  async function retest() {
    setBusy(true);
    await scans.run();
    dispatch({
      type: "finding",
      status:
        state.findingStatus === "fixed_pending_retest"
          ? "verified_fixed"
          : "verified",
    });
    setBusy(false);
    toast.success(
      "Synthetic test completed. Evidence applies to this fixture only.",
    );
  }
  return (
    <div className="page">
      <Link className="back-link" href={`${PROJECT}/guard/findings`}>
        <ArrowLeft size={15} />
        All findings
      </Link>
      <PageHeader
        eyebrow={`GUARD / ${f.id}`}
        title={f.title}
        description={f.category}
        action={
          <LinkButton secondary href={`${PROJECT}/canvas?node=${f.nodeId}`}>
            View on Canvas <ArrowRight size={16} />
          </LinkButton>
        }
      />
      <div className="detail-status">
        <Badge tone={f.severity === "high" ? "amber" : "blue"}>
          {f.severity} priority
        </Badge>
        <Badge tone="blue">Demo evidence</Badge>
        <Badge>
          {id === "FIND-102"
            ? state.findingStatus.replaceAll("_", " ")
            : "Inferred · needs review"}
        </Badge>
      </div>
      <div className="detail-columns">
        <div className="detail-main">
          <Card>
            <SectionHeading title="Why it matters">
              <ShieldCheck size={19} />
            </SectionHeading>
            <p className="lead-text">{f.impact}</p>
            <Notice>
              All customers, requests, responses, and code excerpts below are
              fictional. No real repository or endpoint was tested.
            </Notice>
            <h3>What we found</h3>
            <p>{f.evidence}</p>
            <details>
              <summary>Show technical context</summary>
              <p>
                {id === "FIND-102"
                  ? "Broken Object Level Authorization (BOLA / IDOR). CWE-639. Authentication must be followed by a resource ownership check."
                  : "This deterministic fixture is an educational example, not an externally verified vulnerability."}
              </p>
            </details>
          </Card>
          <Card>
            <SectionHeading title="The evidence">
              <Badge>Scoped fixture</Badge>
            </SectionHeading>
            <dl className="evidence-grid">
              <div>
                <dt>Source</dt>
                <dd>{f.engine}</dd>
              </div>
              <div>
                <dt>Location</dt>
                <dd>
                  <code>{f.file}</code>
                </dd>
              </div>
              <div>
                <dt>Scope</dt>
                <dd>Orderly Demo · staging · synthetic data</dd>
              </div>
              <div>
                <dt>Recorded</dt>
                <dd>13 Nov 2026 · 14:31 WIB</dd>
              </div>
            </dl>
            {id === "FIND-102" ? (
              <>
                <div className="request-example">
                  <span>DEMO REQUEST</span>
                  <code>
                    GET /api/orders/ord_demo_b
                    <br />
                    Authorization: [redacted demo session A]
                  </code>
                </div>
                <div className="expected-observed">
                  <div>
                    <small>EXPECTED</small>
                    <strong>403 Forbidden</strong>
                    <p>Customer A cannot access Customer B’s order.</p>
                  </div>
                  <div>
                    <small>OBSERVED FIXTURE</small>
                    <strong>
                      {state.findingStatus === "verified_fixed"
                        ? "403 Forbidden"
                        : "200 OK"}
                    </strong>
                    <p>
                      {state.findingStatus === "verified_fixed"
                        ? "Post-fix synthetic retest rejected cross-customer access."
                        : "The order belongs to customer_b."}
                    </p>
                  </div>
                </div>
                <pre>
                  <code>{`// Fictional vulnerable handler\nconst session = await auth();\nconst order = await db.order.findUnique({\n  where: { id: params.id }\n});\nreturn Response.json(order);`}</code>
                </pre>
              </>
            ) : (
              <p>{f.evidence}</p>
            )}
          </Card>
          <Card>
            <SectionHeading title="A practical next step">
              <Badge tone="blue">Prewritten example</Badge>
            </SectionHeading>
            <p>
              {id === "FIND-102"
                ? "Check ownership before returning order data. A valid session is only the first step."
                : "Review this fixture against your actual code and dependency inventory before making a change."}
            </p>
            <Button variant="secondary" onClick={() => setFix(!fix)}>
              <Code2 size={16} />
              {fix ? "Hide" : "Show"} example remediation
            </Button>
            {fix && (
              <div className="remediation-example">
                <Notice>
                  Prewritten demo suggestion. AI is not configured. No code is
                  changed and no pull request is created.
                </Notice>
                <pre>
                  <code>
                    {id === "FIND-102"
                      ? `// Example only — adapt and review before use\nconst session = await auth();\nif (!session.userId) return forbidden();\nconst order = await db.order.findFirst({\n  where: { id: params.id, customerId: session.userId }\n});\nif (!order) return forbidden();\nreturn Response.json(order);`
                      : "Review the affected version and request a scoped retest.\nSet an explicit policy based on your actual application."}
                  </code>
                </pre>
                {id === "FIND-102" && (
                  <Button
                    onClick={() => {
                      dispatch({
                        type: "finding",
                        status: "fixed_pending_retest",
                      });
                      toast.success(
                        "Demo example selected. Marked as awaiting synthetic retest.",
                      );
                    }}
                  >
                    Use example in demo scenario <ArrowRight size={16} />
                  </Button>
                )}
              </div>
            )}
          </Card>
        </div>
        <aside className="detail-sidebar">
          <Card>
            <h3>Finding at a glance</h3>
            <dl className="inspector-meta">
              <div>
                <dt>Project</dt>
                <dd>{state.projectName}</dd>
              </div>
              <div>
                <dt>Component</dt>
                <dd>{f.nodeId}</dd>
              </div>
              <div>
                <dt>Commit</dt>
                <dd>a1b2c3d · demo</dd>
              </div>
              <div>
                <dt>Verification</dt>
                <dd>Fixture only</dd>
              </div>
            </dl>
            {id === "FIND-102" && (
              <>
                <Button onClick={retest} disabled={busy}>
                  <Play size={15} />
                  {busy ? "Simulating test…" : "Run simulated retest"}
                </Button>
                <small className="muted block">
                  {state.findingStatus === "fixed_pending_retest"
                    ? "Next test uses the fixed fixture."
                    : "Initial test reproduces the cross-customer access fixture."}
                </small>
                <Button
                  variant="ghost"
                  onClick={() => {
                    dispatch({ type: "finding", status: "false_positive" });
                    toast.info(
                      "Marked false positive in demo state. Review evidence before suppressing real findings.",
                    );
                  }}
                >
                  Mark false positive (demo)
                </Button>
              </>
            )}
          </Card>
          <Notice tone="neutral">
            A verified fixture result does not prove your real application is
            secure.
          </Notice>
          <LinkButton secondary href={`${PROJECT}/sentinel`}>
            Explore Sentinel <ArrowRight size={15} />
          </LinkButton>
        </aside>
      </div>
    </div>
  );
}
export function Integrity() {
  const { state, dispatch } = useDemo();
  const [template, setTemplate] = useState("Illegal state transition");
  const [invariant, setInvariant] = useState(
    "Once an order is locked, its items cannot be edited.",
  );
  const [patched, setPatched] = useState(false);
  const [busy, setBusy] = useState(false);
  async function run() {
    setBusy(true);
    await scans.run();
    dispatch({ type: "integrity", result: patched ? "passed" : "failed" });
    setBusy(false);
    toast.info(
      patched
        ? "Synthetic invariant passed with the demo patch."
        : "Synthetic invariant failed. Locked order accepted an edit.",
    );
  }
  return (
    <div className="page">
      <PageHeader
        eyebrow="GUARD / INTEGRITY"
        title="Your rules should hold up."
        description="Check that important actions follow the workflow you intended."
      />
      <GuardTabs active="/integrity" />
      <div className="two-columns">
        <Card>
          <SectionHeading title="Define the invariant">
            <Workflow size={21} />
          </SectionHeading>
          <label className="field">
            Test template
            <select
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
            >
              {[
                "Illegal state transition",
                "Workflow step bypass",
                "Access control",
                "Replay / idempotency",
                "Unauthorized data modification",
              ].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <Notice>
            Templates organize your review. The executable demo scenario remains
            a locked-order edit test.
          </Notice>
          <label className="field">
            Expected rule
            <textarea
              value={invariant}
              onChange={(e) => setInvariant(e.target.value)}
              rows={3}
            />
          </label>
          <div className="workflow-steps compact">
            <span>Draft</span>
            <ArrowRight size={16} />
            <span>Approved</span>
            <ArrowRight size={16} />
            <span>Locked</span>
          </div>
          <label className="check-line">
            <input
              type="checkbox"
              checked={patched}
              onChange={(e) => setPatched(e.target.checked)}
            />
            Use demo fix: reject updates when locked
          </label>
          <Button disabled={busy || !invariant.trim()} onClick={run}>
            <Play size={16} />
            {busy ? "Checking demo invariant…" : "Run simulated workflow test"}
          </Button>
        </Card>
        <Card>
          <SectionHeading title="Expected → observed → evidence">
            <Badge
              tone={
                state.integrity === "failed"
                  ? "red"
                  : state.integrity === "passed"
                    ? "green"
                    : "neutral"
              }
            >
              {state.integrity === "not_run"
                ? "Not run"
                : `${state.integrity} · demo`}
            </Badge>
          </SectionHeading>
          {state.integrity === "not_run" ? (
            <Empty
              title="Make the rule explicit"
              description="Confirm the invariant, then run the local simulation."
            />
          ) : (
            <>
              <p>
                <strong>Expected</strong>
                <br />
                {invariant}
              </p>
              <p>
                <strong>Observed</strong>
                <br />
                {state.integrity === "passed"
                  ? "409 Conflict. Locked order unchanged."
                  : "200 OK. Locked order was edited in the fixture."}
              </p>
              <pre>
                <code>{`PATCH /api/orders/ord_demo_b\n{ "state": "locked", "items": ["changed"] }\n\nDemo result: ${state.integrity === "passed" ? "409 — rejected" : "200 — accepted"}\nEvidence: EV-INTEGRITY-01 (synthetic)`}</code>
              </pre>
              <Notice tone={state.integrity === "failed" ? "amber" : "blue"}>
                {state.integrity === "failed"
                  ? "Check order state before applying changes, and enforce the invariant in a transaction."
                  : "The separate synthetic retest confirms this invariant only within the demo fixture."}
              </Notice>
            </>
          )}
          <TextLink href={`${PROJECT}/canvas`}>
            Visualize the workflow on Canvas
          </TextLink>
        </Card>
      </div>
    </div>
  );
}
export function Remediation() {
  return (
    <div className="page">
      <PageHeader
        eyebrow="GUARD / REMEDIATION"
        title="A smaller, clearer fix."
        description="Understand the proposed change before you apply it."
      />
      <GuardTabs active="/remediation" />
      <Notice>
        AI is not configured. Suggestions are prewritten examples and require
        your review.
      </Notice>
      <Card>
        <Code2 size={30} />
        <h2>Add an order ownership check</h2>
        <p>
          Limit the query to both the requested ID and the authenticated
          customer. Reject requests that do not match.
        </p>
        <Badge tone="blue">Example remediation · FIND-102</Badge>
        <p>
          No file edits, pull requests, or automatic remediation occur in this
          prototype.
        </p>
        <LinkButton href={`${PROJECT}/guard/findings/FIND-102`}>
          Review evidence and fix example <ArrowRight size={16} />
        </LinkButton>
      </Card>
    </div>
  );
}

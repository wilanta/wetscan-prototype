"use client";

import Link from "next/link";
import { useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Braces,
  BrainCircuit,
  Check,
  CheckCircle2,
  Database,
  FileCode2,
  KeyRound,
  Layers,
  Network,
  Package,
  Radar,
  ShieldAlert,
} from "lucide-react";

type ShowcaseTab = "architecture" | "findings" | "remediation" | "monitoring" | "intelligence";

const TABS: { id: ShowcaseTab; label: string; Icon: typeof Network }[] = [
  { id: "architecture", label: "Architecture", Icon: Network },
  { id: "findings", label: "Security Findings", Icon: ShieldAlert },
  { id: "remediation", label: "Remediation", Icon: FileCode2 },
  { id: "monitoring", label: "Threat Monitoring", Icon: Radar },
  { id: "intelligence", label: "Intelligence", Icon: BrainCircuit },
];

const ARCH_NODES = [
  {
    id: "web",
    label: "Web Application",
    tech: "Next.js · Storefront Edge",
    zone: "Public Untrusted Edge",
    findings: "1 Medium (FIND-103 Dependency)",
    file: "package-lock.json",
    Icon: Layers,
  },
  {
    id: "auth",
    label: "Authentication Service",
    tech: "Clerk · Session Tokens",
    zone: "Authenticated Session Boundary",
    findings: "Verified Identity Provider",
    file: "src/lib/auth/session.ts",
    Icon: KeyRound,
  },
  {
    id: "orders-api",
    label: "Orders API",
    tech: "REST API · 6 endpoints",
    zone: "Internal Service Mesh",
    findings: "1 High (FIND-102 BOLA / IDOR)",
    file: "app/api/orders/[id]/route.ts:18",
    Icon: Braces,
  },
  {
    id: "database",
    label: "Orders Database",
    tech: "PostgreSQL · 4 tables",
    zone: "Privileged Data Tier",
    findings: "Verified Demo Persistence",
    file: "prisma/schema.prisma",
    Icon: Database,
  },
];

const SHOWCASE_FINDINGS = [
  {
    id: "FIND-102",
    severity: "high",
    engine: "DAST",
    title: "Customers may see someone else’s order (BOLA / IDOR)",
    node: "Orders API",
    location: "app/api/orders/[id]/route.ts:18",
    evidence:
      "Customer A requested Customer B’s synthetic order ord_demo_b. Expected: 403. Observed: 200 OK.",
  },
  {
    id: "FIND-103",
    severity: "medium",
    engine: "SCA",
    title: "Dependency advisory match in storefront lockfile",
    node: "Web Application",
    location: "package-lock.json",
    evidence:
      "ADV-009 maps to demo-parser@1.4.0 in the storefront dependency graph.",
  },
  {
    id: "FIND-104",
    severity: "low",
    engine: "CONFIG",
    title: "Missing Content-Security-Policy header",
    node: "Application hosting",
    location: "next.config.ts",
    evidence:
      "Staging configuration omits an explicit Content-Security-Policy directive.",
  },
];

const MONITORING_TIMELINE = [
  {
    step: "Detected",
    time: "03:28:18 UTC",
    title: "Repeated unauthorized order access probes correlated into Incident",
    detail:
      "Sentinel rule matched repeated cross-tenant order ID reads on /api/orders/[id].",
  },
  {
    step: "Approved",
    time: "03:28:42 UTC",
    title: "Scoped containment action approved by operator",
    detail:
      "Target scope validated with explicit blast-radius bounds and TTL.",
  },
  {
    step: "Applied",
    time: "03:29:04 UTC",
    title: "Response applied separately from outcome verification",
    detail:
      "Edge mitigation staged cleanly without impacting valid customer checkout requests.",
  },
  {
    step: "Verified",
    time: "03:29:15 UTC",
    title: "Separate verification probe confirmed neutralization",
    detail:
      "Probe traffic blocked cleanly while healthy requests returned 200 OK.",
  },
];

export function ProductShowcaseSection() {
  const [tab, setTab] = useState<ShowcaseTab>("architecture");
  const [archNodeId, setArchNodeId] = useState<string>("orders-api");
  const [findingId, setFindingId] = useState<string>("FIND-102");
  const [responseStage, setResponseStage] = useState<number>(3);

  const activeNode = ARCH_NODES.find((n) => n.id === archNodeId) ?? ARCH_NODES[2];
  const activeFinding =
    SHOWCASE_FINDINGS.find((f) => f.id === findingId) ?? SHOWCASE_FINDINGS[0];

  return (
    <section id="showcase" className="showcase-section" aria-labelledby="showcase-heading">
      <div className="landing-container">
        <div className="section-intro-center">
          <span className="eyebrow">INTERACTIVE PRODUCT PREVIEW</span>
          <h2 id="showcase-heading">See how WetScan works together.</h2>
          <p>
            Switch tabs to explore Orderly&apos;s application architecture, prioritized security
            findings, side-by-side remediation diff, runtime incident verification, and dependency
            exposure tracing.
          </p>
        </div>

        <div className="showcase-shell">
          <div className="showcase-topbar">
            <div className="mini-window-bar" style={{ borderBottom: 0, flex: 1 }}>
              <span />
              <span />
              <span />
              <div>northstar-studio / orderly-demo · {tab}</div>
            </div>
            <div className="showcase-tabs" role="tablist" aria-label="Product showcase views">
              {TABS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === item.id}
                  className={`showcase-tab-btn ${tab === item.id ? "active" : ""}`}
                  onClick={() => setTab(item.id)}
                >
                  <item.Icon size={14} />
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="showcase-body" role="tabpanel">
            {tab === "architecture" && (
              <div className="showcase-split">
                <div className="showcase-graph-grid">
                  {ARCH_NODES.map((node) => {
                    const selected = node.id === activeNode.id;
                    return (
                      <button
                        key={node.id}
                        type="button"
                        className={`showcase-arch-node ${selected ? "selected" : ""}`}
                        onClick={() => setArchNodeId(node.id)}
                      >
                        <div className="showcase-arch-node-top">
                          <node.Icon size={16} />
                          <span className="badge neutral">{node.zone.split(" ")[0]}</span>
                        </div>
                        <strong>{node.label}</strong>
                        <small>{node.tech}</small>
                        <span
                          className={`badge ${node.id === "orders-api" ? "amber" : "blue"}`}
                        >
                          {node.findings}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <div className="showcase-inspector">
                  <span className="eyebrow">SELECTED COMPONENT</span>
                  <h3>{activeNode.label}</h3>
                  <p className="muted">{activeNode.tech}</p>
                  <dl className="inspector-meta" style={{ marginTop: 14 }}>
                    <div>
                      <dt>Trust Boundary</dt>
                      <dd>{activeNode.zone}</dd>
                    </div>
                    <div>
                      <dt>Security Status</dt>
                      <dd>{activeNode.findings}</dd>
                    </div>
                    <div>
                      <dt>Verified Source</dt>
                      <dd>
                        <code>{activeNode.file}</code>
                      </dd>
                    </div>
                  </dl>
                  <Link
                    href={`/app/projects/orderly-demo/canvas?node=${activeNode.id}`}
                    className="button primary"
                  >
                    Open in Canvas <ArrowRight size={15} />
                  </Link>
                </div>
              </div>
            )}

            {tab === "findings" && (
              <div className="showcase-split">
                <div className="showcase-findings-list">
                  {SHOWCASE_FINDINGS.map((f) => {
                    const selected = f.id === activeFinding.id;
                    return (
                      <button
                        key={f.id}
                        type="button"
                        className={`showcase-finding-item ${selected ? "selected" : ""}`}
                        onClick={() => setFindingId(f.id)}
                      >
                        <div className="actions" style={{ justifyContent: "space-between", width: "100%" }}>
                          <span className="actions" style={{ gap: 6 }}>
                            <span
                              className={`badge ${f.severity === "high" ? "amber" : "blue"}`}
                            >
                              {f.severity.toUpperCase()}
                            </span>
                            <span className="badge neutral">{f.engine}</span>
                          </span>
                          <code>{f.id}</code>
                        </div>
                        <strong>{f.title}</strong>
                        <small className="muted">
                          {f.node} · {f.location}
                        </small>
                      </button>
                    );
                  })}
                </div>
                <div className="showcase-inspector">
                  <span className="eyebrow">{activeFinding.id} · GUARD EVIDENCE</span>
                  <h3>{activeFinding.title}</h3>
                  <div className="notice amber" style={{ margin: "12px 0" }}>
                    <AlertTriangle size={16} />
                    <div>{activeFinding.evidence}</div>
                  </div>
                  <p className="muted" style={{ fontSize: 12 }}>
                    Location: <code>{activeFinding.location}</code>
                  </p>
                  <div className="actions" style={{ marginTop: 14 }}>
                    <Link
                      href={`/app/projects/orderly-demo/guard/findings/${activeFinding.id}`}
                      className="button primary"
                    >
                      Inspect in Guard <ArrowRight size={15} />
                    </Link>
                  </div>
                </div>
              </div>
            )}

            {tab === "remediation" && (
              <div>
                <div className="showcase-remediation-head">
                  <div>
                    <span className="badge green">FIND-102 · TARGETED RETEST READY</span>
                    <h3 style={{ marginTop: 8 }}>
                      Enforce authenticated customer ownership on order lookup
                    </h3>
                    <p className="muted" style={{ fontSize: 12 }}>
                      Scope query filters in <code>app/api/orders/[id]/route.ts</code> to the signed-in{" "}
                      <code>session.customerId</code> before returning order details.
                    </p>
                  </div>
                  <Link
                    href="/app/projects/orderly-demo/guard/findings/FIND-102"
                    className="button primary"
                  >
                    Run Retest in Guard <ArrowRight size={15} />
                  </Link>
                </div>

                <div className="diff-viewer">
                  <div className="diff-pane before">
                    <div className="diff-pane-head">
                      <span>Before · Unscoped Lookup</span>
                      <span>CWE-639</span>
                    </div>
                    <pre>{`const order = await db.order.findUnique({\n  where: { id: params.id },\n});\nreturn Response.json(order);`}</pre>
                  </div>
                  <div className="diff-pane after">
                    <div className="diff-pane-head">
                      <span>After · Owner-Scoped Query</span>
                      <span>Retest Verified</span>
                    </div>
                    <pre>{`const order = await db.order.findFirst({\n  where: { id: params.id, customerId: session.userId },\n});\nif (!order) return Response.json({ error: "Forbidden" }, { status: 403 });\nreturn Response.json(order);`}</pre>
                  </div>
                </div>
              </div>
            )}

            {tab === "monitoring" && (
              <div>
                <div className="showcase-remediation-head">
                  <div>
                    <span className="badge red">SENTINEL · CORRELATED CONTAINMENT</span>
                    <h3 style={{ marginTop: 8 }}>
                      Repeated cross-tenant order access detection &amp; separate verification
                    </h3>
                  </div>
                  <Link
                    href="/app/projects/orderly-demo/sentinel"
                    className="button primary"
                  >
                    Inspect in Sentinel <ArrowRight size={15} />
                  </Link>
                </div>

                <div className="response-stepper">
                  {MONITORING_TIMELINE.map((st, idx) => (
                    <button
                      key={st.step}
                      type="button"
                      className={`response-step-pill ${idx <= responseStage ? "done" : "active"}`}
                      onClick={() => setResponseStage(idx)}
                    >
                      <Check size={13} />
                      <span>
                        {idx + 1}. {st.step}
                      </span>
                    </button>
                  ))}
                </div>

                <div className="stack">
                  {MONITORING_TIMELINE.slice(0, responseStage + 1).map((item) => (
                    <div key={item.step} className="finding-row" style={{ justifyContent: "space-between" }}>
                      <div>
                        <strong>{item.title}</strong>
                        <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                          {item.detail}
                        </p>
                      </div>
                      <span className="badge green">{item.time}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {tab === "intelligence" && (
              <div className="showcase-split">
                <div className="stack">
                  <div className="finding-row" style={{ flexDirection: "column", alignItems: "stretch", gap: 6 }}>
                    <div className="actions" style={{ justifyContent: "space-between" }}>
                      <span className="badge amber">ADVISORY MATCH</span>
                      <code>ADV-009</code>
                    </div>
                    <strong>Storefront dependency parser advisory match</strong>
                    <p className="muted" style={{ fontSize: 12 }}>
                      Affects <code>demo-parser@1.4.0</code> in storefront dependencies. Linked
                      for reachability verification.
                    </p>
                  </div>
                  <div className="finding-row" style={{ flexDirection: "column", alignItems: "stretch", gap: 6 }}>
                    <div className="actions" style={{ justifyContent: "space-between" }}>
                      <span className="badge blue">LIVE CAPABILITY</span>
                      <code>OSV / NVD / KEV</code>
                    </div>
                    <strong>Real repository lockfile advisory sync (GRD-020)</strong>
                    <p className="muted" style={{ fontSize: 12 }}>
                      Connect a GitHub repo to sync Guard dependency inventory directly into Sentinel Intelligence.
                    </p>
                  </div>
                </div>
                <div className="showcase-inspector">
                  <span className="eyebrow">EXPOSURE TRACE</span>
                  <h3>
                    <Package size={16} style={{ verticalAlign: "text-bottom" }} /> Lockfile to
                    Component
                  </h3>
                  <ul className="platform-highlights" style={{ marginTop: 12 }}>
                    <li>
                      <CheckCircle2 size={14} />
                      <span>
                        <strong>Dependency inventory</strong> correlated per repository commit
                      </span>
                    </li>
                    <li>
                      <CheckCircle2 size={14} />
                      <span>
                        <strong>Case library</strong> promotes verified incidents to draft detection rules
                      </span>
                    </li>
                    <li>
                      <CheckCircle2 size={14} />
                      <span>
                        <strong>Canvas security overlay</strong> highlights exposed nodes
                      </span>
                    </li>
                  </ul>
                  <Link
                    href="/app/projects/orderly-demo/sentinel/intelligence"
                    className="button primary"
                    style={{ marginTop: 14 }}
                  >
                    Open Intelligence Explorer <ArrowRight size={15} />
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowRight,
  BrainCircuit,
  CheckCircle2,
  Eye,
  Ghost,
  GitBranch,
  Layers,
  Network,
  Radar,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Wrench,
} from "lucide-react";

const PROBLEMS = [
  {
    title: "Security data scattered across tools",
    detail:
      "SAST alerts, dependency CVEs, IaC lints, and runtime logs live in disconnected tabs with no common model.",
  },
  {
    title: "Findings disconnected from architecture",
    detail:
      "A high-severity warning in a library file does not tell you whether it sits behind authentication or on public ingress.",
  },
  {
    title: "Vulnerabilities discovered too late",
    detail:
      "Injection paths and object-level access bugs often pass unit tests and surface right before or after release.",
  },
  {
    title: "Blind handoff between code and runtime",
    detail:
      "Runtime teams see suspicious requests without knowing which code component, owner, or remediation diff fixes the root cause.",
  },
];

const SOLUTIONS = [
  {
    title: "One graph tying code to runtime",
    detail:
      "Canvas discovers components, datastores, trust zones, and business workflows so every issue has clear context.",
  },
  {
    title: "Scoped fixes verified before merge",
    detail:
      "Guard surfaces reproducible evidence, code diffs, targeted retests, and explicit CI/CD release gates.",
  },
  {
    title: "Advisories mapped to actual usage",
    detail:
      "Intelligence cross-references CVEs and KEV entries with your dependency lockfile and service boundaries.",
  },
  {
    title: "High-confidence detection & containment",
    detail:
      "Sentinel correlates attack patterns with Ghost deception decoys and tracks containment through separate verification.",
  },
];

const MODULES = [
  {
    id: "platform-canvas",
    Icon: Network,
    eyebrow: "WETSCAN CANVAS",
    name: "Canvas",
    tagline: "Visualize architecture, trust zones, and workflows",
    description:
      "Map frontend applications, APIs, auth boundaries, databases, queues, and external dependencies into an interactive topology graph.",
    highlights: [
      "Switch across Architecture, Security, Trust, and Workflows lenses",
      "Trace upstream callers and downstream data stores in one click",
      "Open affected Guard findings or Sentinel incidents from any node",
    ],
    previewTitle: "orderly-demo · trust & component graph",
    previewItems: [
      "Public Edge: Web Application -> Orders API",
      "Auth Boundary: Clerk Session Tokens",
      "Orders API: FIND-102 BOLA Access Control",
    ],
    href: "/app/projects/orderly-demo/canvas",
  },
  {
    id: "platform-guard",
    Icon: ShieldCheck,
    eyebrow: "WETSCAN GUARD",
    name: "Guard",
    tagline: "Pre-merge scanning, guided diffs & CI/CD gates",
    description:
      "Analyze source repositories across SAST, SCA, Secrets, IaC, SBOM, and scoped DAST integrity checks with clear pass/block release verdicts.",
    highlights: [
      "Deterministic commit verdicts (PASS, WARN, BLOCK, INCOMPLETE)",
      "Consented AI-assisted diffs with exact-revision targeted retests",
      "Workflow state invariants and access-control test assertions",
    ],
    previewTitle: "guard · release gate evaluation",
    previewItems: [
      "wetscan/guard-release-gate: REVIEW / BLOCK",
      "SAST + SCA + Secrets + IaC + SBOM coverage tracking",
      "DAST: FIND-102 BOLA Order Ownership (High)",
    ],
    href: "/app/projects/orderly-demo/guard",
  },
  {
    id: "platform-sentinel",
    Icon: Radar,
    eyebrow: "WETSCAN SENTINEL",
    name: "Sentinel",
    tagline: "Telemetry correlation & verified runtime containment",
    description:
      "Ingest structured HTTP and authentication telemetry, match detection rules, triage correlated incidents, and verify mitigation blocks.",
    highlights: [
      "Event explorer across gateway, middleware, auth audit, and Ghost sinks",
      "Automated incident correlation grouping repeated probes by source",
      "Controlled response workflow separating apply state from verification",
    ],
    previewTitle: "sentinel · incident containment",
    previewItems: [
      "Signal: Repeated unauthorized order access probes",
      "Action: Policy-evaluated temporary containment scope",
      "Verification: Separate outcome verification probe",
    ],
    href: "/app/projects/orderly-demo/sentinel",
  },
  {
    id: "platform-intelligence",
    Icon: BrainCircuit,
    eyebrow: "WETSCAN INTELLIGENCE",
    name: "Intelligence",
    tagline: "Vulnerability advisories tied to dependency exposure",
    description:
      "Connect OSV, NVD, GHSA, and CISA KEV advisories directly to repository lockfiles, impacted Canvas services, and archived runtime cases.",
    highlights: [
      "Prioritize KEV-flagged and high-CVSS packages present in lockfiles",
      "See every service node importing an exposed dependency",
      "Promote reviewed runtime cases into new Sentinel detection rules",
    ],
    previewTitle: "advisory intelligence · lockfile trace",
    previewItems: [
      "Package inventory correlated with CVE/OSV/KEV feeds",
      "Linked Guard dependency finding & remediation scope",
      "Draft rule review workflow from closed incidents",
    ],
    href: "/app/projects/orderly-demo/sentinel/intelligence",
  },
  {
    id: "platform-ghost",
    Icon: Ghost,
    eyebrow: "WETSCAN GHOST",
    name: "Ghost",
    tagline: "Authorized deception routes for early recon signals",
    description:
      "Deploy unadvertised internal decoy endpoints that legitimate users never touch, turning attacker reconnaissance into immediate incidents.",
    highlights: [
      "Zero-noise signal when internal backup or debug endpoints are probed",
      "Instant correlation with Sentinel detection rules and audit logs",
      "Explicit false-positive guidance keeping containment operator-driven",
    ],
    previewTitle: "armed deception endpoints",
    previewItems: [
      "GET /__wetscan/ghost-decoy (Authorized scope only)",
      "Signals logged explicitly with origin & rate limit controls",
      "Promoted directly into Sentinel alert & incident queues",
    ],
    href: "/app/projects/orderly-demo/sentinel/ghost",
  },
];

const WORKFLOW_STEPS = [
  {
    step: "01",
    title: "Connect a repository",
    module: "GitHub App Onboarding",
    summary:
      "Create a workspace, install the GitHub App on selected repositories with explicit read permissions, and finish account setup.",
    input: "Repository metadata, default branch & installation grant",
    output: "Isolated project workspace ready for Canvas, Guard, and Sentinel",
    Icon: GitBranch,
  },
  {
    step: "02",
    title: "Explore your architecture",
    module: "Canvas",
    summary:
      "Discover storefronts, API routes, databases, trust boundaries, and multi-step workflows directly from your repository tree.",
    input: "Route handlers, dependency files & source structure",
    output: "Interactive component & trust-boundary topology graph",
    Icon: Network,
  },
  {
    step: "03",
    title: "Analyze security risks",
    module: "Guard & Intelligence",
    summary:
      "Run SAST, SCA, Secrets, IaC, SBOM, and scoped DAST integrity checks prioritized by dependency exposure and real evidence.",
    input: "Pinned commit SHA & declared dependency lockfiles",
    output: "Evidence-backed findings mapped straight onto Canvas nodes",
    Icon: ShieldAlert,
  },
  {
    step: "04",
    title: "Review remediation",
    module: "AI Remediation & Retest",
    summary:
      "Inspect root cause with explicit consent gates, compare before/after diffs, open draft PRs, and verify on exact commit retest.",
    input: "Finding evidence bundle & exact base commit",
    output: "Commit-bound retest proof before release gate approval",
    Icon: Wrench,
  },
  {
    step: "05",
    title: "Monitor suspicious activity",
    module: "Sentinel & Ghost",
    summary:
      "Evaluate incoming gateway events and armed decoy endpoint hits against configurable detection thresholds.",
    input: "Signed HTTP telemetry events & Ghost trap signals",
    output: "Deduplicated security alerts & correlated incidents",
    Icon: Eye,
  },
  {
    step: "06",
    title: "Investigate & verify outcomes",
    module: "Sentinel Response",
    summary:
      "Approve mitigation scopes, track containment state separately from independent verification, and archive lessons to Intelligence.",
    input: "Incident timeline & operator-approved response plan",
    output: "Auditable containment outcome & draft detection rules",
    Icon: CheckCircle2,
  },
];

export function WhyWetScanSection() {
  return (
    <section className="why-section" aria-labelledby="why-heading">
      <div className="landing-container">
        <div className="section-intro-center">
          <span className="eyebrow">WHY WETSCAN</span>
          <h2 id="why-heading">
            Building software is complex. Understanding its security shouldn&apos;t be.
          </h2>
          <p>
            Modern stacks span storefronts, APIs, caches, third-party webhooks, and cloud
            manifests. WetScan aligns code scanning and runtime defense around the architecture
            engineers actually ship.
          </p>
        </div>

        <div className="problem-solution-grid">
          <div className="ps-column problems">
            <div className="ps-column-head">
              <span className="badge amber">WITHOUT UNIFIED CONTEXT</span>
              <h3>Where engineering teams lose time</h3>
            </div>
            <div className="ps-list">
              {PROBLEMS.map((item) => (
                <div key={item.title} className="ps-item">
                  <strong>{item.title}</strong>
                  <p>{item.detail}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="ps-column solutions">
            <div className="ps-column-head">
              <span className="badge blue">WITH WETSCAN</span>
              <h3>Architecture-grounded clarity</h3>
            </div>
            <div className="ps-list">
              {SOLUTIONS.map((item) => (
                <div key={item.title} className="ps-item">
                  <strong>{item.title}</strong>
                  <p>{item.detail}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function PlatformOverviewSection() {
  const [expandedId, setExpandedId] = useState<string>("platform-canvas");
  const active = MODULES.find((m) => m.id === expandedId) ?? MODULES[0];

  return (
    <section id="platform" className="platform-section" aria-labelledby="platform-heading">
      <div className="landing-container">
        <div className="section-intro-split">
          <div>
            <span className="eyebrow">INTRODUCING THE PLATFORM</span>
            <h2 id="platform-heading">
              One workspace. A clearer picture of your application&apos;s security.
            </h2>
          </div>
          <p>
            Five purpose-built modules share a single source of truth so architecture maps, code
            remediations, vulnerability intelligence, and runtime containment reinforce each other.
          </p>
        </div>

        <div className="platform-tabs-layout">
          <div className="platform-selector-col" role="tablist" aria-label="WetScan modules">
            {MODULES.map((mod) => {
              const isSelected = mod.id === active.id;
              return (
                <button
                  key={mod.id}
                  id={mod.id}
                  type="button"
                  role="tab"
                  aria-selected={isSelected}
                  className={`platform-selector-card ${isSelected ? "selected" : ""}`}
                  onClick={() => setExpandedId(mod.id)}
                >
                  <div className="platform-selector-icon">
                    <mod.Icon size={18} />
                  </div>
                  <div>
                    <div className="platform-selector-top">
                      <strong>WetScan {mod.name}</strong>
                      <small>{mod.eyebrow.replace("WETSCAN ", "")}</small>
                    </div>
                    <p>{mod.tagline}</p>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="platform-detail-card" role="tabpanel" aria-labelledby={active.id}>
            <div className="platform-detail-head">
              <span className="badge blue">{active.eyebrow}</span>
              <h3>{active.tagline}</h3>
              <p>{active.description}</p>
            </div>

            <div className="platform-detail-preview">
              <div className="preview-bar">
                <Sparkles size={13} />
                <span>{active.previewTitle}</span>
              </div>
              <ul>
                {active.previewItems.map((line) => (
                  <li key={line}>
                    <CheckCircle2 size={14} />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </div>

            <ul className="platform-highlights">
              {active.highlights.map((pt) => (
                <li key={pt}>
                  <Layers size={14} />
                  <span>{pt}</span>
                </li>
              ))}
            </ul>

            <div className="actions" style={{ marginTop: 18 }}>
              <Link href={active.href} className="button primary">
                Explore {active.name} <ArrowRight size={15} />
              </Link>
              <Link href="/onboarding" className="button secondary">
                Connect Repository
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function HowItWorksSection() {
  const [stepIdx, setStepIdx] = useState(0);
  const current = WORKFLOW_STEPS[stepIdx] ?? WORKFLOW_STEPS[0];

  return (
    <section id="how-it-works" className="workflow-section" aria-labelledby="how-heading">
      <div className="landing-container">
        <div className="section-intro-center">
          <span className="eyebrow">HOW IT WORKS</span>
          <h2 id="how-heading">From your repository to actionable security context.</h2>
          <p>
            Select any stage in the sequence to see how repository evidence flows into verified
            containment.
          </p>
        </div>

        <div className="how-rail" role="tablist" aria-label="Security workflow steps">
          {WORKFLOW_STEPS.map((st, idx) => {
            const isActive = idx === stepIdx;
            const isPast = idx < stepIdx;
            return (
              <button
                key={st.step}
                type="button"
                role="tab"
                aria-selected={isActive}
                className={`how-step-node ${isActive ? "active" : ""} ${isPast ? "done" : ""}`}
                onClick={() => setStepIdx(idx)}
              >
                <span className="how-step-num">{st.step}</span>
                <strong>{st.title}</strong>
                <small>{st.module}</small>
              </button>
            );
          })}
        </div>

        <div className="how-detail-panel" role="tabpanel">
          <div className="how-detail-main">
            <div className="how-detail-badge">
              <current.Icon size={18} />
              <span>
                Step {current.step} · {current.module}
              </span>
            </div>
            <h3>{current.title}</h3>
            <p>{current.summary}</p>
          </div>
          <div className="how-detail-io">
            <div>
              <small>INPUT</small>
              <strong>{current.input}</strong>
            </div>
            <div>
              <small>OUTCOME</small>
              <strong>{current.output}</strong>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

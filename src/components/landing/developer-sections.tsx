"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowRight,
  ChevronDown,
  Code2,
  FileCode2,
  GitBranch,
  GitPullRequest,
  KeyRound,
  Layers,
  LockKeyhole,
  Network,
  Package,
  Radar,
  ShieldCheck,
  Users,
  Workflow,
} from "lucide-react";
import { Logo } from "@/components/logo";

const USE_CASES = [
  {
    id: "devs",
    role: "Software Developers",
    headline: "Fix real flaws without hunting across five tools",
    description:
      "See the exact file path, line number, vulnerable code block, and proposed diff alongside the service component that owns it.",
    points: [
      "Side-by-side before/after patch previews tied to exact route handlers",
      "Clear reproduction payloads showing expected vs observed HTTP behavior",
      "Targeted commit-bound retest before opening a pull request",
    ],
  },
  {
    id: "teams",
    role: "Engineering Teams",
    headline: "Shared visibility from architecture diagram to merge",
    description:
      "Replace stale wiki diagrams with a living map of storefronts, APIs, caches, and third-party dependencies grounded in repository evidence.",
    points: [
      "Connect GitHub App repositories or explore the interactive Orderly Demo",
      "Transparent coverage accounting across every scan revision",
      "Unified activity timeline connecting code fixes and runtime actions",
    ],
  },
  {
    id: "appsec",
    role: "Application Security Engineers",
    headline: "Triage findings and runtime signals in one place",
    description:
      "Validate whether a vulnerable dependency sits on a public edge or behind authentication, and trace runtime exploitation probes cleanly.",
    points: [
      "Trust boundary & role-resource policy views directly inside Canvas",
      "Intelligence view linking NVD/GHSA/OSV/KEV advisories to dependencies",
      "Ghost decoys capturing unauthorized endpoint probing safely",
    ],
  },
  {
    id: "devsecops",
    role: "DevSecOps Teams",
    headline: "Enforce consistent gates without hiding uncertainty",
    description:
      "Evaluate commit readiness across SAST, SCA, Secrets, IaC, and SBOM coverage with explicit policy rules that never fail open.",
    points: [
      "Deterministic PASS / WARN / BLOCK / INCOMPLETE verdicts per commit SHA",
      "Editable release gate thresholds persisted per repository policy revision",
      "Exportable JSON & printable audit bundles for security reviews",
    ],
  },
];

const TECH_STACK = [
  { name: "GitHub App Flow", detail: "OAuth & installation scoping", Icon: GitBranch },
  { name: "SAST Analysis", detail: "Static taint & query checks", Icon: FileCode2 },
  { name: "Dependency Scanning", detail: "Lockfile & advisory matching", Icon: Package },
  { name: "Secret Detection", detail: "Token & key entropy checks", Icon: KeyRound },
  { name: "CycloneDX SBOM", detail: "Bill of materials generation", Icon: Layers },
  { name: "IaC Security", detail: "Infrastructure policy checks", Icon: LockKeyhole },
  { name: "CI/CD Release Gate", detail: "Policy-driven merge verdicts", Icon: GitPullRequest },
  { name: "Telemetry & Ghost", detail: "Signed ingestion & decoys", Icon: Radar },
];

const FAQS = [
  {
    q: "What is WetScan?",
    a: "WetScan is an application security platform that brings together interactive architecture mapping (Canvas), pre-merge security analysis and remediation (Guard), vulnerability intelligence, deception traps (Ghost), and runtime monitoring (Sentinel) in a unified workspace.",
  },
  {
    q: "Who is WetScan designed for?",
    a: "WetScan is built for software developers, engineering teams, application security engineers, and DevSecOps practitioners who want clear context connecting application design, code vulnerabilities, and runtime behavior.",
  },
  {
    q: "How does repository onboarding work?",
    a: "Guided onboarding lets you create a workspace, connect your GitHub App installation with explicit read permissions, select repositories to map, and explore either your connected repositories or the interactive Orderly Demo.",
  },
  {
    q: "What can I explore in WetScan Canvas?",
    a: "Canvas renders interactive service topology graphs with four lenses: Architecture, Security overlay, Trust boundaries, and application Workflows.",
  },
  {
    q: "How does Guard help identify and fix security issues?",
    a: "Guard evaluates commits across SAST, SCA, Secrets, IaC, SBOM, and scoped DAST integrity checks. For open findings, you can inspect evidence, generate consented AI diff fixes, open draft PRs, and run targeted retests.",
  },
  {
    q: "What is the difference between Guard and Sentinel?",
    a: "Guard protects code and infrastructure before release by catching vulnerabilities and evaluating CI/CD gates. Sentinel operates post-deployment to monitor telemetry streams, evaluate detection rules, correlate incidents, and verify response outcomes.",
  },
  {
    q: "How does Intelligence relate to application dependencies?",
    a: "Intelligence syncs repository lockfile inventory with advisory feeds (OSV, NVD, CISA KEV), highlights potential exposures on Canvas, and tracks archived runtime incidents into candidate rules.",
  },
  {
    q: "Can I explore the interface safely before scanning a live repository?",
    a: "Yes. After signing in through onboarding or login, you can explore the isolated Orderly Demo project alongside any live connected repositories, with clear Live vs Demo separation.",
  },
];

export function DeveloperSections() {
  const [activeCaseId, setActiveCaseId] = useState<string>("devs");
  const [openFaqIdx, setOpenFaqIdx] = useState<number | null>(0);
  const currentCase = USE_CASES.find((u) => u.id === activeCaseId) ?? USE_CASES[0];

  return (
    <>
      <section id="developers" className="dev-section" aria-labelledby="dev-heading">
        <div className="landing-container">
          <div className="dev-grid">
            <div>
              <span className="eyebrow">BUILT FOR DEVELOPERS</span>
              <h2 id="dev-heading">Security context that fits how engineers ship.</h2>
              <p className="dev-lead">
                No opaque risk scores without provenance. Every gate decision, diff proposal, and
                runtime alert traces back to concrete files, API endpoints, and components in your
                repository.
              </p>
              <div className="dev-checklist">
                <div>
                  <GitBranch size={17} />
                  <div>
                    <strong>GitHub-aligned workspace onboarding</strong>
                    <span>Authorize repositories cleanly and scope scans per branch.</span>
                  </div>
                </div>
                <div>
                  <Code2 size={17} />
                  <div>
                    <strong>Actionable findings pinned to code &amp; architecture</strong>
                    <span>Move directly from a Canvas service node to line-level remediation.</span>
                  </div>
                </div>
                <div>
                  <ShieldCheck size={17} />
                  <div>
                    <strong>Evidence-backed merge &amp; response workflows</strong>
                    <span>Every release check and containment action records verifiable state.</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="dev-workflow-card">
              <div className="mini-window-bar">
                <span />
                <span />
                <span />
                <div>Orderly Demo · Pull Request Security Context</div>
              </div>
              <div className="dev-code-preview">
                <div className="dev-meta-pills">
                  <span className="badge blue">Branch: fix/orders-ownership</span>
                  <span className="badge green">Retest: Verified</span>
                </div>
                <pre>{`// Mapped Component: orders-api
// Fix Example: Customer Ownership Filter
const order = await db.order.findFirst({
  where: {
    id: params.id,
    customerId: session.userId,
  },
});
if (!order) return Response.json({ error: "Forbidden" }, { status: 403 });`}</pre>
                <div className="dev-card-footer">
                  <span>Targeted Retest: 403 Forbidden on cross-tenant probe</span>
                  <Link href="/onboarding" className="text-link">
                    Try onboarding <ArrowRight size={13} />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="use-cases" className="usecases-section" aria-labelledby="usecases-heading">
        <span id="solutions" className="section-anchor-offset" aria-hidden="true" />
        <div className="landing-container">
          <div className="section-intro-center">
            <span className="eyebrow">SOLUTIONS BY ROLE</span>
            <h2 id="usecases-heading">Built for the people who build and secure applications.</h2>
          </div>

          <div className="usecase-switcher" role="tablist" aria-label="Role use cases">
            {USE_CASES.map((u) => (
              <button
                key={u.id}
                type="button"
                role="tab"
                aria-selected={u.id === currentCase.id}
                className={`usecase-pill ${u.id === currentCase.id ? "active" : ""}`}
                onClick={() => setActiveCaseId(u.id)}
              >
                <Users size={14} />
                <span>{u.role}</span>
              </button>
            ))}
          </div>

          <div className="usecase-spotlight-card" role="tabpanel">
            <div>
              <span className="badge blue">{currentCase.role.toUpperCase()}</span>
              <h3>{currentCase.headline}</h3>
              <p>{currentCase.description}</p>
            </div>
            <ul>
              {currentCase.points.map((pt) => (
                <li key={pt}>
                  <ShieldCheck size={15} />
                  <span>{pt}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section id="integrations" className="tech-section" aria-labelledby="tech-heading">
        <div className="landing-container">
          <div className="section-intro-split">
            <div>
              <span className="eyebrow">TECHNOLOGY &amp; COVERAGE</span>
              <h2 id="tech-heading">Verified capabilities built into one workflow.</h2>
            </div>
            <p>
              Core static, supply-chain, configuration, telemetry, and advisory workflows operate
              together inside one coherent model.
            </p>
          </div>

          <div className="tech-grid">
            {TECH_STACK.map((item) => (
              <div key={item.name} className="tech-card">
                <div className="tech-card-icon">
                  <item.Icon size={18} />
                </div>
                <strong>{item.name}</strong>
                <span>{item.detail}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="about" className="about-section" aria-labelledby="about-heading">
        <div className="landing-container about-grid">
          <div>
            <span className="eyebrow">ABOUT WETSCAN</span>
            <h2 id="about-heading">Clarity across architecture, code, and runtime.</h2>
          </div>
          <div className="about-copy">
            <p>
              WetScan was designed around a straightforward idea: software teams make faster, safer
              decisions when security findings are rooted directly in how their application is built
              and how it behaves at runtime.
            </p>
            <p>
              By unifying service topology discovery, pre-merge scanning, consented code
              remediation, dependency advisories, and runtime threat verification inside one
              workspace, WetScan replaces fragmented alerts with one continuous workflow.
            </p>
          </div>
        </div>
      </section>

      <section id="faq" className="faq-section" aria-labelledby="faq-heading">
        <div className="landing-container faq-container">
          <div className="section-intro-center">
            <span className="eyebrow">FREQUENTLY ASKED QUESTIONS</span>
            <h2 id="faq-heading">Everything teams ask before getting started.</h2>
          </div>

          <div className="faq-list">
            {FAQS.map((item, idx) => {
              const isOpen = openFaqIdx === idx;
              return (
                <div key={item.q} className={`faq-item ${isOpen ? "open" : ""}`}>
                  <button
                    type="button"
                    className="faq-trigger"
                    aria-expanded={isOpen}
                    onClick={() => setOpenFaqIdx(isOpen ? null : idx)}
                  >
                    <span>{item.q}</span>
                    <ChevronDown size={17} className={isOpen ? "rotated" : ""} />
                  </button>
                  {isOpen && (
                    <div className="faq-panel">
                      <p>{item.a}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="final-cta-section" aria-labelledby="cta-heading">
        <div className="landing-container final-cta-card">
          <div>
            <span className="eyebrow">READY WHEN YOU ARE</span>
            <h2 id="cta-heading">Build with confidence. Understand what matters.</h2>
            <p>
              Connect your repositories through GitHub App onboarding, or explore the Orderly Demo
              inside the authenticated workspace.
            </p>
          </div>
          <div className="final-cta-buttons">
            <Link href="/onboarding" className="button primary large">
              Start Setup <ArrowRight size={17} />
            </Link>
            <Link href="/login" className="button secondary large">
              <Network size={17} /> Sign in to Workspace
            </Link>
          </div>
        </div>
      </section>

      <footer className="landing-footer-expanded">
        <div className="landing-container footer-columns">
          <div className="footer-brand-col">
            <Logo />
            <p>
              Application security clarity connecting architecture mapping, pre-merge verification,
              intelligence advisories, and runtime containment.
            </p>
          </div>

          <div className="footer-nav-col">
            <strong>Product</strong>
            <a href="#platform">Platform</a>
            <Link href="/app/projects/orderly-demo/canvas">Canvas</Link>
            <Link href="/app/projects/orderly-demo/guard">Guard</Link>
            <Link href="/app/projects/orderly-demo/sentinel">Sentinel</Link>
            <Link href="/app/projects/orderly-demo/sentinel/intelligence">Intelligence</Link>
            <Link href="/app/projects/orderly-demo/sentinel/ghost">Ghost</Link>
          </div>

          <div className="footer-nav-col">
            <strong>Explore</strong>
            <a href="#how-it-works">How It Works</a>
            <a href="#showcase">Interactive Showcase</a>
            <a href="#use-cases">Solutions</a>
            <a href="#developers">Developers</a>
            <a href="#about">About</a>
          </div>

          <div className="footer-nav-col">
            <strong>Get Started</strong>
            <Link href="/login">Sign in</Link>
            <Link href="/onboarding">Create Workspace</Link>
            <Link href="/app">Dashboard</Link>
            <a href="#faq">FAQ</a>
          </div>
        </div>

        <div className="landing-container footer-bottom-bar">
          <span>WetScan Application Security Platform</span>
          <span>
            <Workflow size={13} style={{ verticalAlign: "text-bottom", marginRight: 5 }} />
            Architecture · Code · Runtime
          </span>
        </div>
      </footer>
    </>
  );
}

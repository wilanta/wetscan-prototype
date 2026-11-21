import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  FileCode2,
  GitCommit,
  Network,
  Radar,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

const LIFECYCLE_STAGES = [
  {
    stage: "Discover",
    module: "Canvas",
    summary:
      "Map repositories into services, datastores, trust tiers, and multi-step application workflows.",
    signal: "Feeds architecture boundaries to Guard & Sentinel",
  },
  {
    stage: "Analyze",
    module: "Guard & Intelligence",
    summary:
      "Scan code, lockfiles, secrets, IaC, and live KEV advisories tied directly to component ownership.",
    signal: "Pinpoints high-impact exposure before release",
  },
  {
    stage: "Remediate",
    module: "Guided Diffs",
    summary:
      "Review clear root causes and before/after diffs with explicit source and provider consent gates.",
    signal: "Staged cleanly for draft PR review",
  },
  {
    stage: "Verify",
    module: "Retest & CI/CD Gate",
    summary:
      "Confirm fixes against pinned commits and evaluate policy gates across required engines.",
    signal: "Prevents regressions before production deploy",
  },
  {
    stage: "Monitor",
    module: "Sentinel & Ghost",
    summary:
      "Watch live gateway telemetry and armed decoy traps for anomalous probing and verify containment.",
    signal: "Promotes reviewed cases into detection rules",
  },
];

export function LifecycleAndSpotlightsSection() {
  return (
    <>
      <section className="lifecycle-section" aria-labelledby="lifecycle-heading">
        <div className="landing-container">
          <div className="section-intro-center">
            <span className="eyebrow">SECURITY LIFECYCLE</span>
            <h2 id="lifecycle-heading">Security context across your development lifecycle.</h2>
            <p>
              Findings from Guard inform which Canvas nodes are at risk, while Sentinel runtime
              signals validate that fixes hold under live traffic.
            </p>
          </div>

          <div className="lifecycle-grid">
            {LIFECYCLE_STAGES.map((item, idx) => (
              <div key={item.stage} className="lifecycle-card">
                <div className="lifecycle-card-top">
                  <span className="lifecycle-step-dot">0{idx + 1}</span>
                  <span className="badge blue">{item.module}</span>
                </div>
                <h3>{item.stage}</h3>
                <p>{item.summary}</p>
                <div className="lifecycle-signal">
                  <Sparkles size={12} />
                  <span>{item.signal}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="spotlights-section" aria-label="Deep Feature Spotlights">
        <div className="landing-container stack" style={{ gap: 56 }}>
          <div id="spotlight-architecture" className="spotlight-row">
            <div className="spotlight-visual">
              <div className="mini-window-bar">
                <span />
                <span />
                <span />
                <div>Canvas · Orderly Trust &amp; Workflow Map</div>
              </div>
              <div className="spotlight-panel">
                <div className="spotlight-flow-chips">
                  <span>Customer</span>
                  <ArrowRight size={13} />
                  <span>Authentication</span>
                  <ArrowRight size={13} />
                  <span className="warn">Orders API</span>
                  <ArrowRight size={13} />
                  <span>PostgreSQL</span>
                </div>
                <div className="spotlight-zones">
                  <div>
                    <small>PUBLIC EDGE</small>
                    <strong>Web Application</strong>
                  </div>
                  <div>
                    <small>INTERNAL MESH</small>
                    <strong>Orders API (BOLA)</strong>
                  </div>
                  <div>
                    <small>PRIVILEGED</small>
                    <strong>Orders DB</strong>
                  </div>
                </div>
              </div>
            </div>

            <div className="spotlight-copy">
              <span className="eyebrow">SPOTLIGHT 01 · ARCHITECTURE</span>
              <h3>Understand the system before fixing the issue</h3>
              <p>
                Seeing that a route reads customer orders directly from PostgreSQL makes
                prioritization obvious. WetScan maps trust boundaries and workflows alongside
                verified source file locations.
              </p>
              <Link href="/app/projects/orderly-demo/canvas" className="text-link">
                Explore Orderly on Canvas <ArrowRight size={15} />
              </Link>
            </div>
          </div>

          <div id="spotlight-guard" className="spotlight-row reverse">
            <div className="spotlight-copy">
              <span className="eyebrow">SPOTLIGHT 02 · GUARD &amp; CI/CD GATE</span>
              <h3>Find vulnerabilities and understand the next step</h3>
              <p>
                Guard combines SAST, dependency audits, secrets, IaC, SBOM, and scoped API
                integrity checks into evidence-backed findings. Generate scoped patches, run
                commit-bound retests, and inspect release gate verdicts.
              </p>
              <Link href="/app/projects/orderly-demo/guard/releases" className="text-link">
                Inspect Guard &amp; Release Gate <ArrowRight size={15} />
              </Link>
            </div>

            <div className="spotlight-visual">
              <div className="mini-window-bar">
                <span />
                <span />
                <span />
                <div>Guard · Release Gate Evaluation</div>
              </div>
              <div className="spotlight-panel">
                <div className="spotlight-gate-row blocked">
                  <div>
                    <GitCommit size={15} />
                    <strong>Unverified / Blocking policy revision</strong>
                    <small>Explicit BLOCK or INCOMPLETE when required engines fail</small>
                  </div>
                  <span className="badge red">BLOCK</span>
                </div>
                <div className="spotlight-gate-row passed">
                  <div>
                    <CheckCircle2 size={15} />
                    <strong>Exact-commit retest verified</strong>
                    <small>Scoped patch verified clean across required scanner coverage</small>
                  </div>
                  <span className="badge green">PASS</span>
                </div>
              </div>
            </div>
          </div>

          <div id="spotlight-sentinel" className="spotlight-full">
            <div className="spotlight-full-copy">
              <span className="eyebrow">SPOTLIGHT 03 · SENTINEL &amp; GHOST</span>
              <h3>Investigate what happens after deployment</h3>
              <p>
                Track signed gateway events, authentication bursts, and armed Ghost decoy hits in
                a single timeline. Escalate correlated alerts to incidents and track mitigation
                verification separately from execution.
              </p>
              <div className="actions">
                <Link href="/app/projects/orderly-demo/sentinel" className="button primary">
                  <Radar size={15} /> Open Sentinel
                </Link>
                <Link
                  href="/app/projects/orderly-demo/sentinel/ghost"
                  className="button secondary"
                >
                  View Ghost Decoys
                </Link>
              </div>
            </div>
            <div className="spotlight-full-metrics">
              <div>
                <Network size={18} />
                <strong>Telemetry Ingestion</strong>
                <span>Signed HTTP sources, auth audits &amp; Ghost sinks</span>
              </div>
              <div>
                <FileCode2 size={18} />
                <strong>Correlated Incidents</strong>
                <span>Groups repeated enumeration &amp; injection attempts cleanly</span>
              </div>
              <div>
                <ShieldCheck size={18} />
                <strong>Honest Verification</strong>
                <span>Keeps response application separate from neutralization proof</span>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

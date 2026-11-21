"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Braces,
  Check,
  Database,
  KeyRound,
  Layers,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { MiniMap } from "@/components/mini-map";

const HERO_COMPONENTS = [
  {
    id: "orders-api",
    label: "Orders API",
    badge: "High · FIND-102",
    tone: "amber",
    summary:
      "Enforce customer ownership scoping in GET /api/orders/[id] before returning order records.",
    href: "/app/projects/orderly-demo/guard/findings/FIND-102",
    Icon: Braces,
  },
  {
    id: "auth",
    label: "Auth Service",
    badge: "Session Check",
    tone: "blue",
    summary:
      "Verified Clerk session identity flows into Orders API to separate auth from object authorization.",
    href: "/app/projects/orderly-demo/canvas?node=auth",
    Icon: KeyRound,
  },
  {
    id: "web",
    label: "Web Application",
    badge: "Medium · FIND-103",
    tone: "amber",
    summary:
      "Review demo-parser@1.4.0 advisory exposure on storefront routes in Intelligence.",
    href: "/app/projects/orderly-demo/guard/findings/FIND-103",
    Icon: Layers,
  },
  {
    id: "database",
    label: "Orders DB",
    badge: "PostgreSQL",
    tone: "green",
    summary:
      "Isolated relational persistence accessed strictly through the authenticated Orders API boundary.",
    href: "/app/projects/orderly-demo/canvas?node=database",
    Icon: Database,
  },
] as const;

export function LandingHero() {
  const [selectedId, setSelectedId] = useState<string>("orders-api");
  const active = HERO_COMPONENTS.find((c) => c.id === selectedId) ?? HERO_COMPONENTS[0];

  return (
    <section className="hero">
      <div className="hero-copy">
        <div className="hero-kicker">
          <span className="live-dot" /> A LITTLE CLARITY. A LOT MORE CONFIDENCE.
        </div>
        <h1>
          Your app is growing.
          <br />
          Let’s keep it <span>safe.</span>
        </h1>
        <p>
          WetScan is a unified application security workspace for engineering teams. Map how your
          services connect, verify pull requests before merge, and follow threats through runtime
          containment.
        </p>
        <div className="hero-buttons">
          <Link className="button primary large" href="/onboarding">
            Start for Free <ArrowRight size={18} />
          </Link>
          <a className="button secondary large" href="#platform">
            Explore Platform <ArrowRight size={17} />
          </a>
        </div>
        <div className="hero-reassurance">
          <Check size={15} /> Architecture map <span>·</span>
          <Check size={15} /> Multi-engine Guard gates <span>·</span>
          <Check size={15} /> Sentinel telemetry &amp; Ghost traps
        </div>
      </div>

      <div className="hero-product">
        <div className="mini-window-bar">
          <span />
          <span />
          <span />
          <div>orderly-demo · application security map</div>
          <span className="badge blue">Workspace Preview</span>
        </div>

        <div className="hero-map-title">
          <span className="eyebrow">YOUR APPLICATION, CONNECTED</span>
          <h2>See the bigger picture.</h2>
          <p>Click a service tier below to inspect security context.</p>
        </div>

        <MiniMap />

        <div className="hero-focus-strip" role="tablist" aria-label="Select Orderly component">
          {HERO_COMPONENTS.map((comp) => {
            const isSelected = comp.id === active.id;
            return (
              <button
                key={comp.id}
                type="button"
                role="tab"
                aria-selected={isSelected}
                className={`hero-focus-pill ${isSelected ? "selected" : ""}`}
                onClick={() => setSelectedId(comp.id)}
              >
                <comp.Icon size={13} />
                <span>{comp.label}</span>
              </button>
            );
          })}
        </div>

        <div className="hero-finding">
          {active.tone === "green" ? (
            <ShieldCheck size={22} style={{ color: "var(--good)" }} />
          ) : (
            <ShieldAlert size={22} />
          )}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <strong>{active.label} — Next step</strong>
              <span className={`badge ${active.tone}`}>{active.badge}</span>
            </div>
            <p>{active.summary}</p>
          </div>
          <Link aria-label={`Inspect ${active.label} details`} href={active.href}>
            <ArrowUpRight size={20} />
          </Link>
        </div>
      </div>
    </section>
  );
}

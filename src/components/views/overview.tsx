"use client";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Braces,
  CheckCircle2,
  ChevronRight,
  Circle,
  GitBranch,
  Network,
  Plus,
  Radar,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import { useDemo } from "../demo-provider";
import {
  Badge,
  Card,
  LinkButton,
  PageHeader,
  SectionHeading,
  TextLink,
} from "../ui";
import { MiniMap } from "../mini-map";
import { PROJECT } from "@/data/demo";
export function Overview() {
  const { state } = useDemo();
  const open = state.incidents.filter((i) => i.status === "open").length;
  const progress =
    1 +
    Number(state.findingStatus !== "potential") +
    Number(!!state.staging.url) +
    Number(state.notifications.length > 0);
  return (
    <div className="page overview-page">
      <PageHeader
        eyebrow="YOUR SECURITY WORKSPACE"
        title="A little clarity for your next big thing."
        description="Here’s what’s happening across your apps. Let’s take it one step at a time."
        action={
          <LinkButton href="/onboarding" secondary>
            <Plus size={17} />
            Connect repository
          </LinkButton>
        }
      />
      <div className="welcome-strip">
        <span className="welcome-icon">
          <SparkleIcon />
        </span>
        <div>
          <strong>Welcome to your workspace.</strong>
          <span>
            {" "}
            You’re exploring Orderly, a fictional commerce app. Follow the
            connections and see what needs a closer look.
          </span>
        </div>
        <Link href={`${PROJECT}/canvas`}>
          Take a look <ArrowRight size={16} />
        </Link>
      </div>
      <div className="stats-grid">
        <Card className="stat-card">
          <div className="stat-label">
            <span>Apps in your workspace</span>
            <span className="stat-icon blue">
              <Network size={20} />
            </span>
          </div>
          <div className="stat-value">
            01
            <small>
              <span className="live-dot" />
              Demo repository
            </small>
          </div>
          <div className="stat-bottom">
            Your first app, all in one place
            <TextLink href="/app/projects">View app</TextLink>
          </div>
        </Card>
        <Card className="stat-card">
          <div className="stat-label">
            <span>Findings needing review</span>
            <span className="stat-icon amber">
              <ShieldCheck size={20} />
            </span>
          </div>
          <div className="stat-value">
            {state.findingStatus === "verified_fixed" ? "02" : "03"}
            <small>
              <span className="severity-dot high" />
              {state.findingStatus === "verified_fixed"
                ? "High finding retested"
                : "1 high priority"}
            </small>
          </div>
          <div className="stat-bottom">
            A clear next step for each finding
            <TextLink href={`${PROJECT}/guard/findings`}>Review</TextLink>
          </div>
        </Card>
        <Card className="stat-card">
          <div className="stat-label">
            <span>Open incidents</span>
            <span className="stat-icon green">
              <Radar size={20} />
            </span>
          </div>
          <div className="stat-value">
            {String(open).padStart(2, "0")}
            <small>{open ? "Demo investigation" : "Ready to explore"}</small>
          </div>
          <div className="stat-bottom">
            Runtime telemetry not connected
            <TextLink href={`${PROJECT}/sentinel`}>Sentinel</TextLink>
          </div>
        </Card>
      </div>
      <div className="overview-columns">
        <div className="overview-primary">
          <Card className="application-preview">
            <SectionHeading title="Your app, connected">
              <Badge tone="blue">Application map</Badge>
            </SectionHeading>
            <div className="app-identity">
              <span className="project-icon">
                <BoxesIcon />
              </span>
              <div>
                <Link href={PROJECT}>
                  <h3>
                    {state.projectName}
                    <ArrowUpRight size={15} />
                  </h3>
                </Link>
                <p>
                  <GitBranch size={13} />
                  {state.provider === "github" ? "GitHub" : "GitLab"}
                  <span>·</span>
                  {state.branch}
                  <span>·</span>Next.js
                </p>
              </div>
              <Badge>Staging</Badge>
            </div>
            <Link
              href={`${PROJECT}/canvas`}
              className="map-link"
              aria-label="Explore application map"
            >
              <MiniMap />
            </Link>
            <div className="preview-bottom">
              <span>
                <span className="live-dot" />8 components{" "}
                <span className="dot-separator">·</span>6 connections{" "}
                <span className="dot-separator">·</span>Demo architecture
              </span>
              <Link href={`${PROJECT}/canvas`}>
                Open Canvas <ArrowRight size={15} />
              </Link>
            </div>
          </Card>
          <Card className="attention-card">
            <SectionHeading title="A good place to start">
              <span className="muted small-text">Prioritized for you</span>
            </SectionHeading>
            <Link
              className="attention-item"
              href={`${PROJECT}/guard/findings/FIND-102`}
            >
              <span className="attention-icon amber">
                <Braces size={21} />
              </span>
              <div>
                <div className="attention-title">
                  <strong>Who can see an order?</strong>
                  <Badge tone="amber">High priority</Badge>
                </div>
                <p>
                  Orders API may allow customers to access someone else’s order.
                </p>
                <small>
                  Orderly Demo<span>·</span>Access control<span>·</span>Needs
                  verification
                </small>
              </div>
              <ChevronRight size={20} />
            </Link>
            <Link className="attention-item" href="/app/integrations">
              <span className="attention-icon blue">
                <Radar size={21} />
              </span>
              <div>
                <strong>Complete the picture with runtime data</strong>
                <p>
                  See the setup boundary before enabling continuous monitoring.
                </p>
                <small>
                  Sentinel<span>·</span>Not connected
                </small>
              </div>
              <ChevronRight size={20} />
            </Link>
          </Card>
        </div>
        <div className="overview-secondary">
          <Card className="setup-card">
            <SectionHeading title="Small steps. Safer apps.">
              <span className="progress-count">{progress} / 4</span>
            </SectionHeading>
            <p>You don’t have to do it all at once.</p>
            <div className="setup-progress">
              <span style={{ width: `${progress * 25}%` }} />
            </div>
            {[
              {
                done: true,
                title: "Explore a demo repository",
                sub: "Orderly Demo is ready",
                href: PROJECT,
              },
              {
                done: state.findingStatus !== "potential",
                title: "Understand your first finding",
                sub: "See the evidence, then the fix",
                href: `${PROJECT}/guard/findings/FIND-102`,
              },
              {
                done: !!state.staging.url,
                title: "Set your staging scope",
                sub: "Only test what you authorize",
                href: "/app/integrations",
              },
              {
                done: state.notifications.length > 0,
                title: "Make notifications yours",
                sub: "Choose where updates find you",
                href: "/app/notifications",
              },
            ].map((s, i) => (
              <Link
                href={s.href}
                className={`setup-step ${s.done ? "done" : ""}`}
                key={s.title}
              >
                {s.done ? (
                  <CheckCircle2 size={20} />
                ) : (
                  <span className="step-number">{i + 1}</span>
                )}
                <div>
                  <strong>{s.title}</strong>
                  <small>{s.sub}</small>
                </div>
                <ChevronRight size={15} />
              </Link>
            ))}
            <div className="setup-footnote">
              <ShieldCheck size={15} />
              Progress you can understand. No security scores.
            </div>
          </Card>
          <Card className="recent-card">
            <SectionHeading title="The latest">
              <Link href="/app/activity" aria-label="View all activity">
                <ArrowUpRight size={17} />
              </Link>
            </SectionHeading>
            <div className="recent-event">
              <span className="event-marker blue">
                <Network size={14} />
              </span>
              <div>
                <strong>Your application map is ready</strong>
                <p>8 components, connected and explained.</p>
                <small>Demo fixture · 14:30 WIB</small>
              </div>
            </div>
            <div className="recent-event">
              <span className="event-marker amber">
                <TriangleAlert size={14} />
              </span>
              <div>
                <strong>A finding worth reviewing</strong>
                <p>Access control in your Orders API.</p>
                <small>Demo fixture · 14:31 WIB</small>
              </div>
            </div>
            {state.incidents.slice(-1).map((i) => (
              <Link
                className="recent-event"
                href={`${PROJECT}/sentinel/incidents/${i.id}`}
                key={i.id}
              >
                <span className="event-marker amber">
                  <Radar size={14} />
                </span>
                <div>
                  <strong>{i.title}</strong>
                  <p>{i.id} · Simulated</p>
                  <small>Demo scenario · 14:32 WIB</small>
                </div>
              </Link>
            ))}
            <TextLink href="/app/activity">View workspace activity</TextLink>
          </Card>
          <div className="coverage-note">
            <Circle size={14} />
            <p>
              <strong>A note on coverage</strong>This is a demo. Scans,
              incidents, and protection outcomes use synthetic evidence.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
function SparkleIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 22 22"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="m11 2 2.5 6.5L20 11l-6.5 2.5L11 20l-2.5-6.5L2 11l6.5-2.5L11 2Z"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  );
}
function BoxesIcon() {
  return (
    <svg
      width="25"
      height="25"
      viewBox="0 0 25 25"
      fill="none"
      aria-hidden="true"
    >
      <rect
        x="3"
        y="3"
        width="8"
        height="8"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <rect
        x="14"
        y="3"
        width="8"
        height="8"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <rect
        x="3"
        y="14"
        width="8"
        height="8"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <rect
        x="14"
        y="14"
        width="8"
        height="8"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.6"
      />
    </svg>
  );
}

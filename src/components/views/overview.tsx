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
  Play,
  Plus,
  Radar,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Wrench,
} from "lucide-react";
import { useDemo } from "../demo-provider";
import { useDashboardAccountView } from "../dashboard-account";
import {
  Badge,
  Button,
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
  const { account, status, refresh, setOpen } = useDashboardAccountView();
  const repositoriesReady = status === "ready" && account.repositoriesAvailable;
  const repositories = account.repositories;
  const hasRepositories = repositoriesReady && repositories.length > 0;
  const loadingRepositories = status === "loading";

  const repositoryAction = repositoriesReady ? (
    hasRepositories ? (
      <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
        View repositories
      </Button>
    ) : (
      <LinkButton href="/onboarding" secondary>
        <Plus size={17} />
        Connect repository
      </LinkButton>
    )
  ) : (
    <Button
      type="button"
      variant="secondary"
      disabled={loadingRepositories}
      onClick={refresh}
    >
      {loadingRepositories ? "Loading repositories..." : "Retry repositories"}
    </Button>
  );

  const openIncidents = state.incidents.filter((i) => i.status === "open").length;
  const openFindingsCount = state.findingStatus === "verified_fixed" ? 2 : 3;
  const progress =
    1 +
    Number(state.findingStatus !== "potential") +
    Number(!!state.staging.url) +
    Number(state.notifications.length > 0);

  const primaryLiveRepo = hasRepositories ? repositories[0] : null;
  const radius = 26;
  const circumference = 2 * Math.PI * radius;
  const strokeOffset = circumference - (progress / 4) * circumference;

  return (
    <div className="page overview-page">
      <PageHeader
        eyebrow="YOUR SECURITY WORKSPACE"
        title="A little clarity for your next big thing."
        description="Unified visibility across connected GitHub repositories and the interactive Orderly Demo walkthrough."
        action={repositoryAction}
      />

      <div className="welcome-strip">
        <span className="welcome-icon">
          <Sparkles size={20} />
        </span>
        <div>
          <strong>
            {primaryLiveRepo
              ? `${primaryLiveRepo.fullName} is connected.`
              : "Welcome to your workspace."}
          </strong>{" "}
          <span>
            {primaryLiveRepo
              ? "Inspect live source architecture in Canvas, run Guard repository checks, or explore the Orderly Demo walkthrough."
              : "You’re exploring Orderly, a fictional commerce app. Follow the connections and see what needs a closer look."}
          </span>
        </div>
        <Link
          href={
            primaryLiveRepo
              ? `/app/projects/github-${primaryLiveRepo.id}/canvas`
              : `${PROJECT}/canvas`
          }
        >
          Take a look <ArrowRight size={16} />
        </Link>
      </div>

      <div className="four-columns">
        <Card
          className="stat-card repository-summary"
          aria-label="Connected repositories summary"
        >
          <div className="stat-label">
            <span>Connected repositories</span>
            <span className="stat-icon blue">
              <Network size={19} />
            </span>
          </div>
          <div className="stat-value">
            <span className="repository-count">
              {repositoriesReady
                ? String(repositories.length).padStart(2, "0")
                : "--"}
            </span>
            <small>
              {hasRepositories ? (
                <>
                  <span className="live-dot" />
                  <span
                    className="repository-summary-name"
                    title={repositories[0].fullName}
                  >
                    {repositories[0].fullName}
                  </span>
                  {repositories.length > 1 && (
                    <span className="repository-summary-more">
                      +{repositories.length - 1} more
                    </span>
                  )}
                </>
              ) : repositoriesReady ? (
                "No repositories selected"
              ) : loadingRepositories ? (
                "Loading repositories..."
              ) : (
                "Repository data unavailable"
              )}
            </small>
          </div>
          <div className="stat-bottom">
            <span>
              {hasRepositories
                ? "Saved repository selection"
                : repositoriesReady
                  ? "Connect your first repository"
                  : "Saved selection unavailable"}
            </span>
            {hasRepositories && (
              <Button
                type="button"
                variant="ghost"
                className="text-link"
                onClick={() => setOpen(true)}
              >
                View list <ArrowRight size={15} />
              </Button>
            )}
          </div>
        </Card>

        <Card className="stat-card">
          <div className="stat-label">
            <span>Findings needing review</span>
            <span className="stat-icon amber">
              <ShieldAlert size={19} />
            </span>
          </div>
          <div className="stat-value">
            <span>{String(openFindingsCount).padStart(2, "0")}</span>
            <small>
              <span className="severity-dot high" />
              {state.findingStatus === "verified_fixed"
                ? "High finding retested"
                : "1 high priority · demo"}
            </small>
          </div>
          <div className="stat-bottom">
            <span>Orderly Demo findings</span>
            <TextLink href={`${PROJECT}/guard/findings`}>Review</TextLink>
          </div>
        </Card>

        <Card className="stat-card">
          <div className="stat-label">
            <span>Open incidents</span>
            <span className="stat-icon green">
              <Radar size={19} />
            </span>
          </div>
          <div className="stat-value">
            <span>{String(openIncidents).padStart(2, "0")}</span>
            <small>
              {openIncidents ? "Demo investigation" : "Ready to explore"}
            </small>
          </div>
          <div className="stat-bottom">
            <span>
              {primaryLiveRepo
                ? "Live Sentinel available per repo"
                : "Runtime telemetry not connected"}
            </span>
            <TextLink
              href={
                primaryLiveRepo
                  ? `/app/projects/github-${primaryLiveRepo.id}/sentinel`
                  : `${PROJECT}/sentinel`
              }
            >
              Sentinel
            </TextLink>
          </div>
        </Card>

        <Card className="stat-card">
          <div className="stat-label">
            <span>Walkthrough progress</span>
            <Badge tone={progress === 4 ? "green" : "blue"}>
              {progress} / 4
            </Badge>
          </div>
          <div className="posture-meter" style={{ margin: "10px 0 12px" }}>
            <div className="posture-ring" style={{ width: 60, height: 60 }}>
              <svg width="60" height="60" viewBox="0 0 60 60">
                <circle
                  cx="30"
                  cy="30"
                  r={radius}
                  fill="none"
                  stroke="var(--border)"
                  strokeWidth="5"
                />
                <circle
                  cx="30"
                  cy="30"
                  r={radius}
                  fill="none"
                  stroke={progress === 4 ? "var(--good)" : "var(--primary)"}
                  strokeWidth="5"
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeOffset}
                  strokeLinecap="round"
                  transform="rotate(-90 30 30)"
                />
              </svg>
              <strong style={{ position: "absolute", fontSize: 13 }}>
                {progress * 25}%
              </strong>
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>
                {state.projectName}
              </div>
              <small>
                {state.scans} demo scan{state.scans === 1 ? "" : "s"} run
              </small>
            </div>
          </div>
          <div className="stat-bottom">
            <span>Demo guide</span>
            <TextLink href={`${PROJECT}`}>Open hub</TextLink>
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
                <Network size={20} />
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
              <Badge>Staging · Demo</Badge>
            </div>
            <Link
              href={`${PROJECT}/canvas`}
              className="map-link"
              aria-label="Explore application map"
            >
              <MiniMap
                apiIssues={state.findingStatus === "verified_fixed" ? 0 : 1}
              />
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
                  Orderly Demo<span>·</span>Access control<span>·</span>
                  {state.findingStatus === "verified_fixed"
                    ? "Verified fixed"
                    : "Needs verification"}
                </small>
              </div>
              <ChevronRight size={20} />
            </Link>
            {primaryLiveRepo ? (
              <Link
                className="attention-item"
                href={`/app/projects/github-${primaryLiveRepo.id}/guard`}
              >
                <span className="attention-icon blue">
                  <ShieldCheck size={21} />
                </span>
                <div>
                  <div className="attention-title">
                    <strong>Inspect {primaryLiveRepo.fullName} in Live Guard</strong>
                    <Badge tone="green">Live GitHub</Badge>
                  </div>
                  <p>
                    Run repository scans, review SAST/SCA coverage, or configure CI/CD release gates.
                  </p>
                  <small>
                    Guard<span>·</span>Branch {primaryLiveRepo.defaultBranch}
                  </small>
                </div>
                <ChevronRight size={20} />
              </Link>
            ) : (
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
            )}
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
              Progress you can understand. Explicit coverage boundaries.
            </div>
          </Card>

          <Card>
            <SectionHeading title="Quick actions" />
            <div className="stack" style={{ gap: 10 }}>
              <LinkButton
                secondary
                href={
                  primaryLiveRepo
                    ? `/app/projects/github-${primaryLiveRepo.id}/guard`
                    : `${PROJECT}/guard`
                }
                className="justify-between"
              >
                <span>
                  {primaryLiveRepo ? "Run live Guard scan" : "Open Guard workbench"}
                </span>
                <Play size={14} />
              </LinkButton>
              <LinkButton
                secondary
                href={
                  primaryLiveRepo
                    ? `/app/projects/github-${primaryLiveRepo.id}/guard/remediation`
                    : `${PROJECT}/guard/remediation`
                }
                className="justify-between"
              >
                <span>AI remediation &amp; retests</span>
                <Wrench size={14} />
              </LinkButton>
              <LinkButton
                secondary
                href={
                  primaryLiveRepo
                    ? `/app/projects/github-${primaryLiveRepo.id}/sentinel/ghost`
                    : `${PROJECT}/sentinel/ghost`
                }
                className="justify-between"
              >
                <span>Inspect Ghost decoys</span>
                <Radar size={14} />
              </LinkButton>
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
                <ShieldAlert size={14} />
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
              <strong>A note on coverage</strong>Live GitHub repositories stay strictly separated
              from Orderly Demo fixtures.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import {
  ArrowRight,
  BrainCircuit,
  FileText,
  Ghost,
  GitBranch,
  LockKeyhole,
  Network,
  Plus,
  Radar,
  Search,
  ShieldCheck,
} from "lucide-react";
import { useDemo } from "../demo-provider";
import {
  Badge,
  Card,
  LinkButton,
  Notice,
  PageHeader,
  SectionHeading,
  TextLink,
} from "../ui";
import { PROJECT } from "@/data/demo";
import { MiniMap } from "../mini-map";
import { RepositoryProjects } from "../repository-projects";

export function Projects({ hub = false }: { hub?: boolean }) {
  const { state } = useDemo();
  const [query, setQuery] = useState("");

  if (hub) {
    return (
      <div className="page">
        <PageHeader
          eyebrow="PROJECT / ORDERLY DEMO"
          title={state.projectName}
          description="A fictional commerce app, connected across code, architecture, and evidence."
          action={
            <LinkButton secondary href="/onboarding">
              <Plus size={16} />
              Connect repository
            </LinkButton>
          }
        />
        <div className="project-meta-strip">
          <Badge tone="blue">Demo data</Badge>
          <span>{state.provider} · northstar-studio/orderly-demo</span>
          <span>{state.branch} · a1b2c3d (synthetic)</span>
          <span>Staging · Next.js</span>
        </div>
        <div className="three-columns">
          {[
            {
              title: "Explore your application map",
              text: "Follow components, data flows, and linked evidence.",
              href: `${PROJECT}/canvas`,
              Icon: Network,
              label: "Open Canvas",
            },
            {
              title: "Check before you ship",
              text: "Understand risks and review scoped example fixes.",
              href: `${PROJECT}/guard`,
              Icon: ShieldCheck,
              label: "Open Guard",
            },
            {
              title: "Follow every outcome",
              text: "Trace detection, response, and separate verification.",
              href: `${PROJECT}/sentinel`,
              Icon: Radar,
              label: "Open Sentinel",
            },
          ].map(({ title, text, href, Icon, label }) => (
            <Card className="project-action" key={href}>
              <span className="big-feature-icon blue">
                <Icon size={29} />
              </span>
              <h2>{title}</h2>
              <p>{text}</p>
              <TextLink href={href}>{label}</TextLink>
            </Card>
          ))}
        </div>
        <div className="two-columns">
          <Card>
            <SectionHeading title="What WetScan knows">
              <Badge tone="blue">Demo scope</Badge>
            </SectionHeading>
            <ul className="plain-list">
              <li>8 fictional application components and 6 connections</li>
              <li>3 synthetic findings with linked evidence</li>
              <li>main branch and a1b2c3d synthetic revision</li>
              <li>A local scripted incident lifecycle</li>
            </ul>
          </Card>
          <Card>
            <SectionHeading title="What remains unverified">
              <Badge>Coverage boundary</Badge>
            </SectionHeading>
            <ul className="plain-list">
              <li>Actual repository content and OAuth permissions</li>
              <li>Real deployment behavior and DAST results</li>
              <li>Runtime telemetry and response enforcement</li>
              <li>Recipient delivery on notification channels</li>
            </ul>
          </Card>
        </div>
        <Notice>
          Connecting a repository does not imply runtime protection or
          authorize testing a deployment.
        </Notice>
      </div>
    );
  }

  return (
    <div className="page">
      <PageHeader
        eyebrow="YOUR PROJECTS"
        title="Big ideas. A clear home."
        description="Keep your connected GitHub applications and the interactive Orderly Demo in one approachable workspace."
        action={
          <LinkButton secondary href="/onboarding">
            <Plus size={16} />
            Connect repository
          </LinkButton>
        }
      />

      <Card style={{ marginBottom: 20 }}>
        <div className="filters">
          <div className="search-input" style={{ flex: 1, minWidth: 220 }}>
            <Search size={15} />
            <input
              aria-label="Filter projects"
              placeholder="Search repositories, stacks, or branches…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>
      </Card>

      <RepositoryProjects query={query} />

      <Card className="project-directory" style={{ marginTop: 18 }}>
        <div className="app-identity">
          <span className="project-icon">
            <Network size={26} />
          </span>
          <div>
            <h2>{state.projectName}</h2>
            <p>
              <GitBranch size={15} />
              {state.provider} · {state.branch} · Next.js
            </p>
          </div>
          <Badge tone="blue">Demo repository</Badge>
        </div>
        <MiniMap apiIssues={state.findingStatus === "verified_fixed" ? 0 : 1} />
        <div className="project-directory-footer">
          <span>Staging · 8 components · 3 synthetic findings</span>
          <div className="actions" style={{ marginTop: 0 }}>
            <LinkButton href={PROJECT}>
              Open project <ArrowRight size={16} />
            </LinkButton>
            <LinkButton secondary href={`${PROJECT}/canvas`}>
              Canvas
            </LinkButton>
            <LinkButton secondary href={`${PROJECT}/guard`}>
              Guard
            </LinkButton>
          </div>
        </div>
      </Card>
    </div>
  );
}

export function LiveProjectHub({
  projectId,
  fullName,
  defaultBranch,
  isPrivate,
}: {
  projectId: string;
  fullName: string;
  defaultBranch: string;
  isPrivate: boolean | null;
}) {
  const base = `/app/projects/${encodeURIComponent(projectId)}`;
  return (
    <div className="page">
      <PageHeader
        eyebrow={`LIVE PROJECT · ${projectId.toUpperCase()}`}
        title={fullName}
        description="Authorized GitHub App repository hub across Canvas source discovery, Guard verification & CI/CD gates, and Sentinel runtime monitoring."
        action={
          <LinkButton secondary href="/app/projects">
            All projects
          </LinkButton>
        }
      />

      <div className="project-meta-strip">
        <Badge tone="green">GitHub connected</Badge>
        <span>Branch: {defaultBranch}</span>
        <span>
          {isPrivate === null
            ? "Visibility unavailable"
            : isPrivate
              ? "Private repository"
              : "Public repository"}
        </span>
      </div>

      <div className="three-columns">
        {[
          {
            title: "Architecture & Trust Map",
            text: "Inspect source-discovered components, file evidence, Trust boundaries, and Guard/Sentinel overlays.",
            href: `${base}/canvas`,
            Icon: Network,
            label: "Open Canvas",
          },
          {
            title: "Guard Security Scanning",
            text: "Run repository scans, review SAST/SCA findings, apply consented AI patches, and evaluate CI/CD policy gates.",
            href: `${base}/guard`,
            Icon: ShieldCheck,
            label: "Open Guard",
          },
          {
            title: "Sentinel Telemetry & Response",
            text: "Monitor ingested telemetry streams, triage correlated incidents, and manage controlled response workflows.",
            href: `${base}/sentinel`,
            Icon: Radar,
            label: "Open Sentinel",
          },
        ].map(({ title, text, href, Icon, label }) => (
          <Card className="project-action" key={href}>
            <span className="big-feature-icon blue">
              <Icon size={29} />
            </span>
            <h2>{title}</h2>
            <p>{text}</p>
            <TextLink href={href}>{label}</TextLink>
          </Card>
        ))}
      </div>

      <div className="four-columns">
        <Card className="compact-stat">
          <small>CI/CD Release Gate</small>
          <div style={{ marginTop: 6 }}>
            <TextLink href={`${base}/guard/cicd`}>
              <LockKeyhole size={14} /> Open G04 Gate
            </TextLink>
          </div>
        </Card>
        <Card className="compact-stat">
          <small>Intelligence &amp; Advisories</small>
          <div style={{ marginTop: 6 }}>
            <TextLink href={`${base}/sentinel/intelligence`}>
              <BrainCircuit size={14} /> Open Intelligence
            </TextLink>
          </div>
        </Card>
        <Card className="compact-stat">
          <small>Ghost Deception Traps</small>
          <div style={{ marginTop: 6 }}>
            <TextLink href={`${base}/sentinel/ghost`}>
              <Ghost size={14} /> Open Ghost
            </TextLink>
          </div>
        </Card>
        <Card className="compact-stat">
          <small>Unified Audit Reports</small>
          <div style={{ marginTop: 6 }}>
            <TextLink href={`${base}/guard/reports`}>
              <FileText size={14} /> Open G06 Reports
            </TextLink>
          </div>
        </Card>
      </div>
    </div>
  );
}

export function WorkspaceActivity() {
  const { state } = useDemo();
  return (
    <div className="page">
      <PageHeader
        eyebrow="WORKSPACE ACTIVITY"
        title="The story so far."
        description="A chronological record of workspace exploration and local demo activity with linked evidence."
      />
      <Card>
        <div className="activity-row">
          <span className="event-marker blue">
            <Network size={16} />
          </span>
          <div>
            <strong>Application map prepared</strong>
            <p>
              8 components and 6 connections from the synthetic architecture
              fixture.
            </p>
            <small>13 Nov 2026 · 14:30 WIB · Demo</small>
          </div>
          <TextLink href={`${PROJECT}/canvas`}>Canvas</TextLink>
        </div>
        <div className="activity-row">
          <span className="event-marker blue">
            <ShieldCheck size={16} />
          </span>
          <div>
            <strong>Demo scan #{state.scans} available</strong>
            <p>Code, dependencies, and API fixtures. No real scanning.</p>
          </div>
          <TextLink href={`${PROJECT}/guard/scans`}>Scan history</TextLink>
        </div>
        {state.incidents.map((i) => (
          <div className="activity-row" key={i.id}>
            <span className="event-marker amber">
              <Radar size={16} />
            </span>
            <div>
              <strong>{i.title}</strong>
              <p>
                {i.id} · {i.responseState.replaceAll("_", " ")} ·{" "}
                {i.timeline.length} synthetic events
              </p>
            </div>
            <TextLink href={`${PROJECT}/sentinel/incidents/${i.id}`}>
              Incident
            </TextLink>
          </div>
        ))}
      </Card>
    </div>
  );
}

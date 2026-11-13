"use client";
import {
  ArrowRight,
  GitBranch,
  Network,
  Plus,
  Radar,
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
export function Projects({ hub = false }: { hub?: boolean }) {
  const { state } = useDemo();
  return (
    <div className="page">
      <PageHeader
        eyebrow={hub ? "PROJECT / ORDERLY DEMO" : "YOUR PROJECTS"}
        title={hub ? state.projectName : "Big ideas. A clear home."}
        description={
          hub
            ? "A fictional commerce app, connected across code, architecture, and evidence."
            : "Keep your applications and their next steps in one approachable workspace."
        }
        action={
          <LinkButton secondary href="/onboarding">
            <Plus size={16} />
            Connect repository
          </LinkButton>
        }
      />
      {!hub ? (
        <Card className="project-directory">
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
          <MiniMap />
          <div className="project-directory-footer">
            <span>Staging · 8 components · 3 synthetic findings</span>
            <LinkButton href={PROJECT}>
              Open project <ArrowRight size={16} />
            </LinkButton>
          </div>
        </Card>
      ) : (
        <>
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
        </>
      )}
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
        description="A record of local demo activity with linked evidence."
      />
      <Card>
        <div className="activity-row">
          <Network size={22} />
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
          <ShieldCheck size={22} />
          <div>
            <strong>Demo scan #{state.scans} available</strong>
            <p>Code, dependencies, and API fixtures. No real scanning.</p>
          </div>
          <TextLink href={`${PROJECT}/guard/scans`}>Scan history</TextLink>
        </div>
        {state.incidents.map((i) => (
          <div className="activity-row" key={i.id}>
            <Radar size={22} />
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

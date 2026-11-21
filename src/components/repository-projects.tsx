"use client";

import Link from "next/link";
import { GitBranch, Network, Radar, ShieldCheck } from "lucide-react";
import { useDashboardAccountView } from "./dashboard-account";
import { Badge, Button, Card } from "./ui";

export function RepositoryProjects({ query = "" }: { query?: string }) {
  const { account, status, refresh } = useDashboardAccountView();
  if (
    status === "ready" &&
    account.repositoriesAvailable &&
    account.repositories.length === 0
  )
    return null;

  const filtered = account.repositories.filter((repo) =>
    `${repo.fullName} ${repo.defaultBranch}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );

  return (
    <section aria-label="Connected GitHub repositories">
      <h2>Connected GitHub repositories</h2>
      {status !== "ready" || !account.repositoriesAvailable ? (
        <div role="status">
          <p>
            {status === "loading"
              ? "Loading selected repositories…"
              : "Repository selection unavailable."}
          </p>
          <Button
            variant="secondary"
            onClick={refresh}
            disabled={status === "loading"}
          >
            Retry repository list
          </Button>
        </div>
      ) : account.repositories.length === 0 ? (
        <p>
          No repositories selected.{" "}
          <Link href="/onboarding">Connect GitHub</Link>
        </p>
      ) : filtered.length === 0 ? (
        <p className="muted small-text">
          No connected GitHub repositories match &ldquo;{query}&rdquo;.
        </p>
      ) : (
        <div className="two-columns">
          {filtered.map((repo) => (
            <Card key={repo.id} className="project-directory">
              <div className="app-identity">
                <span className="project-icon">
                  <Network size={24} />
                </span>
                <div style={{ minWidth: 0 }}>
                  <h3 style={{ overflowWrap: "anywhere" }}>{repo.fullName}</h3>
                  <p>
                    <GitBranch size={14} />
                    {repo.defaultBranch} ·{" "}
                    {repo.private === null
                      ? "Visibility unavailable"
                      : repo.private
                        ? "Private"
                        : "Public"}
                  </p>
                </div>
                <Badge tone="blue">GitHub repository</Badge>
              </div>
              <p className="muted small-text" style={{ marginTop: 8 }}>
                Source analysis · runtime unverified unless Sentinel telemetry is connected
              </p>
              <div className="project-directory-footer" style={{ flexWrap: "wrap", gap: 8 }}>
                <span>
                  Live workspace · github-{repo.id}
                </span>
                <div className="actions" style={{ marginTop: 0 }}>
                  <Link
                    prefetch={false}
                    className="button primary"
                    href={`/app/projects/github-${repo.id}/canvas`}
                  >
                    Open Canvas<span className="sr-only"> for {repo.fullName}</span>
                  </Link>
                  <Link
                    prefetch={false}
                    className="button secondary"
                    href={`/app/projects/github-${repo.id}/guard`}
                  >
                    <ShieldCheck size={14} />
                    Guard
                  </Link>
                  <Link
                    prefetch={false}
                    className="button secondary"
                    href={`/app/projects/github-${repo.id}/sentinel`}
                  >
                    <Radar size={14} />
                    Sentinel
                  </Link>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}

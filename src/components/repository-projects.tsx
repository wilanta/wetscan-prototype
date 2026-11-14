"use client";
import Link from "next/link";
import { GitBranch, Network } from "lucide-react";
import { useDashboardAccountView } from "./dashboard-account";
import { Badge, Button, Card } from "./ui";

export function RepositoryProjects() {
  const { account, status, refresh } = useDashboardAccountView();
  if (
    status === "ready" &&
    account.repositoriesAvailable &&
    account.repositories.length === 0
  )
    return null;
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
      ) : (
        account.repositories.map((repo) => (
          <Card key={repo.id} className="project-directory">
            <div className="app-identity">
              <span className="project-icon">
                <Network size={26} />
              </span>
              <div style={{ minWidth: 0 }}>
                <h3 style={{ overflowWrap: "anywhere" }}>{repo.fullName}</h3>
                <p>
                  <GitBranch size={15} />
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
            <p className="muted small-text">
              Source analysis · runtime unverified
            </p>
            <div className="project-directory-footer">
              <span>
                Guard: Not yet scanned · Sentinel: Monitoring not connected
              </span>
              <Link
                prefetch={false}
                className="button"
                href={`/app/projects/github-${repo.id}/canvas`}
              >
                Open Canvas<span className="sr-only"> for {repo.fullName}</span>
              </Link>
            </div>
          </Card>
        ))
      )}
    </section>
  );
}

"use client";
import Link from "next/link";
import { useDashboardAccountView } from "./dashboard-account";
import { Badge, Button, Card } from "./ui";

export function RepositoryProjects() {
  const { account, status, refresh } = useDashboardAccountView();
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
          <Card key={repo.id}>
            <h3 style={{ overflowWrap: "anywhere" }}>{repo.fullName}</h3>
            <p>
              {repo.defaultBranch} ·{" "}
              {repo.private === null
                ? "Visibility unavailable"
                : repo.private
                  ? "Private"
                  : "Public"}
            </p>
            <Badge>Source analysis · runtime unverified</Badge>
            <p>Guard: Not yet scanned · Sentinel: Monitoring not connected</p>
            <Link
              prefetch={false}
              className="button"
              href={`/app/projects/github-${repo.id}/canvas`}
            >
              Open Canvas<span className="sr-only"> for {repo.fullName}</span>
            </Link>
          </Card>
        ))
      )}
    </section>
  );
}

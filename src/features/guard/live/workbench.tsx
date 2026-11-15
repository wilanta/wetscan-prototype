"use client";
import { useState } from "react";
import { Button, Card, Notice, PageHeader } from "@/components/ui";
import styles from "../workbench.module.css";
interface Revision {
  repository: { id: string; name: string; branch: string };
  commit: string;
  tree: string;
  verifiedAt: string;
  preparation: {
    status: "REVIEW_REQUIRED";
    request: Record<string, unknown>;
    binding: { jobId: string };
    migrationPlanSha256: string;
  };
}
export function LiveGuardWorkbench({
  projectId,
  repositoryName,
  branch: initialBranch,
}: {
  projectId: string;
  repositoryName: string;
  branch: string;
}) {
  const [branch, setBranch] = useState(initialBranch),
    [commit, setCommit] = useState("");
  const [verified, setVerified] = useState<Revision>(),
    [scanId, setScanId] = useState<string>();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  function invalidate() {
    setVerified(undefined);
    setScanId(undefined);
    setError("");
    setMessage("");
  }
  async function request(resource: string, body: unknown) {
    const response = await fetch(
      `/api/guard/projects/${encodeURIComponent(projectId)}/${resource}`,
      {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        cache: "no-store",
      },
    );
    const data = await response.json();
    if (!response.ok)
      throw new Error(
        typeof data.error === "string" && /^[a-z_]{1,64}$/.test(data.error)
          ? data.error
          : "guard_unavailable",
      );
    return data;
  }
  async function run(action: "verify" | "source" | "enqueue" | "launch") {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (action === "verify") {
        setVerified(undefined);
        setScanId(undefined);
        const value = (await request("repository", {
          branch,
          ...(commit ? { commit } : {}),
        })) as Revision;
        setVerified(value);
        setMessage(
          "Repository revision verified. No source snapshot or scan has run.",
        );
      } else if (verified) {
        if (action === "source") {
          const result = await request("source-acceptance", {
            branch: verified.repository.branch,
            commit: verified.commit,
          });
          setMessage(
            `Source snapshot verified; ${result.sourceFiles} files retrieved, temporary source cleanup ${result.cleanup}. No scanner ran.`,
          );
        } else if (action === "enqueue") {
          const result = await request("preparation", {
            action: "enqueue",
            ...verified.preparation.request,
          });
          setScanId(result.scanId);
          setMessage(
            "Preparation job queued. Worker execution has not been verified.",
          );
        } else if (scanId) {
          const result = await request("preparation", {
            action: "launch",
            scanId,
          });
          setMessage(
            result.preparation === "verified"
              ? "Worker preparation and temporary source cleanup verified. No scanner ran; full scan execution is not configured."
              : "Worker preparation could not be verified.",
          );
        }
      }
    } catch (cause) {
      setError(
        cause instanceof Error && /^[a-z_]{1,64}$/.test(cause.message)
          ? cause.message
          : "guard_unavailable",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="page">
      <PageHeader
        eyebrow="GUARD"
        title="Repository source preparation"
        description="Uses the GitHub account and repository already selected in WetScan onboarding and Canvas."
      />
      <Card className={styles.panel} aria-label="Live Guard preparation">
        <h2>{repositoryName}</h2>
        <p>Connected repository: {projectId}</p>
        <a href={`/app/projects/${encodeURIComponent(projectId)}/canvas`}>
          Open existing Canvas
        </a>
        <div className={styles.toolbar}>
          <label>
            Branch
            <input
              value={branch}
              disabled={busy}
              onChange={(event) => {
                setBranch(event.target.value);
                invalidate();
              }}
              maxLength={255}
            />
          </label>
          <label>
            Commit SHA (optional)
            <input
              value={commit}
              disabled={busy}
              onChange={(event) => {
                setCommit(event.target.value);
                invalidate();
              }}
              maxLength={40}
              placeholder="Leave empty to resolve branch HEAD"
            />
          </label>
          <Button disabled={busy || !branch} onClick={() => void run("verify")}>
            Verify repository revision
          </Button>
        </div>
        {error && (
          <p role="alert">
            {error === "approval_required"
              ? "This operation needs a matching operator approval for the selected repository, commit and runtime target."
              : `Verification failed: ${error}. No successful preparation is claimed.`}
          </p>
        )}
        {message && <p role="status">{message}</p>}
        {verified && (
          <div className={styles.stack}>
            <p className={styles.meta}>
              Preparation reference:{" "}
              <code>{verified.preparation.binding.jobId}</code>
            </p>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => {
                const url = URL.createObjectURL(
                  new Blob([JSON.stringify(verified.preparation, null, 2)], {
                    type: "application/json",
                  }),
                );
                const link = document.createElement("a");
                link.href = url;
                link.download = "guard-preparation-request.json";
                link.click();
                URL.revokeObjectURL(url);
              }}
            >
              Download preparation request
            </Button>
            <p className={styles.meta}>
              Verified commit: <code>{verified.commit}</code>
            </p>
            <div className={styles.actions}>
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => void run("source")}
              >
                Verify approved source snapshot
              </Button>
              <Button
                disabled={busy || !!scanId}
                onClick={() => void run("enqueue")}
              >
                Queue approved preparation
              </Button>
              {scanId && (
                <Button disabled={busy} onClick={() => void run("launch")}>
                  Run approved preparation worker
                </Button>
              )}
            </div>
          </div>
        )}
        <Notice>
          Source snapshots, database writes and worker execution require
          separate matching approvals. Full security scans are not configured in
          G01.
        </Notice>
      </Card>
    </div>
  );
}

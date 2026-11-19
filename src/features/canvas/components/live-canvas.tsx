"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Modal } from "@/components/ui";
import type { CachedCanvas, CanvasLoadResult } from "../cache-contracts";
import { validateGraph } from "../validation";
import { Canvas } from "@/components/views/canvas";
import { CanvasLoading } from "./canvas-loading";
import { SourceError } from "./source-error";
import { sessionCanvasPersistence } from "../adapters/persistence";
import { sentinelOverlaySource } from "../adapters/sentinel-overlay";
import styles from "./canvas.module.css";

export function LiveCanvas({
  projectId,
  initialEntry,
  revision,
}: {
  projectId: string;
  initialEntry: CachedCanvas | null;
  revision?: string;
}) {
  const [entry, setEntry] = useState(initialEntry);
  const [status, setStatus] = useState(
    initialEntry
      ? "Previously analyzed revision · Checking updates"
      : "Preparing source map",
  );
  const [busy, setBusy] = useState(false);
  const [newRevision, setNewRevision] = useState("");
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(false);
  const mounted = useRef(true),
    request = useRef<AbortController | null>(null);
  const displayedRevision = useRef(initialEntry?.graph.revision);
  const run = useCallback(
    async (action: "load" | "check" | "refresh" | "reanalyze") => {
      request.current?.abort();
      const controller = new AbortController();
      request.current = controller;
      setBusy(true);
      setError("");
      setStatus(
        action === "check"
          ? "Checking updates"
          : action === "load"
            ? "Preparing source map"
            : "Analyzing latest source · Previous map remains available",
      );
      try {
        const params = new URLSearchParams();
        if (action === "load" || action === "check")
          params.set("operation", action);
        if (revision) params.set("revision", revision);
        const response = await fetch(`/api/canvas/${projectId}?${params}`, {
          method: action === "load" || action === "check" ? "GET" : "POST",
          headers: { "Content-Type": "application/json" },
          body:
            action === "load" || action === "check"
              ? undefined
              : JSON.stringify({ action }),
          cache: "no-store",
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(90000),
          ]),
        });
        if (!mounted.current || controller.signal.aborted) return;
        if (!response.ok) {
          // Access is unconfirmed: remove private content instead of displaying stale data.
          setEntry(null);
          throw new Error(
            [401, 403, 404].includes(response.status)
              ? "Repository access is no longer confirmed. Sign in again or check your repository selection."
              : "Repository authorization or source reading could not be confirmed. Retry when the connection is available.",
          );
        }
        const result = (await response.json()) as CanvasLoadResult;
        if (!mounted.current || controller.signal.aborted) return;
        if (result.state === "ready") {
          const graph = validateGraph(result.entry.graph);
          if (
            !graph.projectRef.endsWith(`/${projectId}`) ||
            graph.mode !== "live"
          )
            throw new Error("Repository map scope mismatch.");
          setEntry({ ...result.entry, graph });
          displayedRevision.current = graph.revision;
          setNewRevision("");
          setStatus(
            result.cached
              ? "Previously analyzed revision · Check for updates"
              : "Up to date",
          );
        } else if (result.state === "up_to_date") {
          const matchesDisplayed =
            displayedRevision.current === result.revision;
          setStatus(matchesDisplayed ? "Up to date" : "New revision available");
          setNewRevision(matchesDisplayed ? "" : result.revision);
        } else if (result.state === "new_revision") {
          setNewRevision(result.revision);
          setStatus("New revision available");
        } else {
          setStatus("Previously analyzed revision");
          setError(result.message);
        }
      } catch (failure) {
        if (!controller.signal.aborted && mounted.current) {
          setEntry(null);
          setError(
            failure instanceof Error
              ? failure.message
              : "Canvas request failed. Retry the operation.",
          );
          setStatus("Freshness unknown");
        }
      } finally {
        if (mounted.current && !controller.signal.aborted) setBusy(false);
      }
    },
    [projectId, revision],
  );
  useEffect(() => {
    mounted.current = true;
    const timer = setTimeout(
      () => void run(initialEntry ? "check" : "load"),
      0,
    );
    return () => {
      mounted.current = false;
      clearTimeout(timer);
      request.current?.abort();
    };
  }, [run, initialEntry]);
  const scope = entry?.scope;
  const graphRevision = entry?.graph.revision;
  const ports = useMemo(
    () =>
      scope && graphRevision
        ? {
            persistence: sessionCanvasPersistence(scope),
            overlays: sentinelOverlaySource(projectId, graphRevision),
          }
        : undefined,
    [scope, graphRevision, projectId],
  );
  if (!entry)
    return error ? <SourceError message={error} /> : <CanvasLoading />;
  return (
    <>
      <div className={styles.freshness} aria-label="Repository revision status">
        <div>
          <strong>{entry.repositoryName}</strong>
          <span role="status">{status}</span>
          {error && <p role="alert">{error}</p>}
        </div>
        <div className="actions">
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => void run("check")}
          >
            Check for updates
          </Button>
          {newRevision && (
            <Button disabled={busy} onClick={() => void run("refresh")}>
              Update map to {newRevision.slice(0, 7)}
            </Button>
          )}
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => setConfirm(true)}
          >
            Reanalyze repository
          </Button>
        </div>
        <Modal
          open={confirm}
          onOpenChange={setConfirm}
          title="Confirm repository reanalysis"
          description="Read source and analyze the repository again, even if its commit is unchanged."
        >
          <p>
            Read and analyze this repository again even if its commit is
            unchanged? Your manual edits will be kept.
          </p>
          <Button
            disabled={busy}
            onClick={() => {
              setConfirm(false);
              void run("reanalyze");
            }}
          >
            Confirm reanalysis
          </Button>
          <Button variant="secondary" onClick={() => setConfirm(false)}>
            Cancel
          </Button>
        </Modal>
      </div>
      <Canvas initialGraph={entry.graph} ports={ports} />
    </>
  );
}

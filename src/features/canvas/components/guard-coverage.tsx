"use client";

import Link from "next/link";
import type { SecurityOverlay } from "../types";

const coverageBadge: Record<string, string> = {
  available: "Guard overlay aligned",
  partial: "Guard overlay partial",
  stale: "Guard overlay stale",
  not_scanned: "Guard not scanned",
  unavailable: "Guard overlay unavailable",
};

export function GuardCoverage({ overlay }: { overlay: SecurityOverlay | null }) {
  const detail = overlay?.guardDetail;
  if (!overlay || overlay.mode !== "live" || !detail) return null;

  const badge = coverageBadge[detail.coverageStatus] ?? detail.coverageStatus;

  return (
    <div
      className="guard-canvas-coverage"
      aria-label="Guard risk overlay details"
    >
      <div className="guard-coverage-header">
        <strong>{badge}</strong>
        <span>
          Commit:{" "}
          <code>{detail.commitSha ? detail.commitSha.slice(0, 12) : "none"}</code>{" "}
          · Graph: <code>{detail.graphRevision.slice(0, 12)}</code> · Mapped{" "}
          <strong>{detail.summary.mappedCount}</strong> /{" "}
          {detail.summary.totalEvaluated}
        </span>
      </div>

      {detail.staleReasons.length > 0 && (
        <div role="alert" className="notice compact-notice">
          <div>
            <strong>Stale attribution warning:</strong>{" "}
            {detail.staleReasons.join(" ")}
          </div>
        </div>
      )}

      {detail.unmatchedFindings.length > 0 && (
        <details className="guard-unmatched-details">
          <summary>
            Unmatched Guard findings ({detail.unmatchedFindings.length}) — not
            attached to nodes
          </summary>
          <ul>
            {detail.unmatchedFindings.map((u) => (
              <li key={u.id}>
                <span>
                  [{u.severity}] {u.title} ({u.engine}, reason:{" "}
                  <code>{u.reason}</code>)
                </span>
                <small>{u.detail}</small>
                <Link href={u.href}>Inspect in Guard</Link>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

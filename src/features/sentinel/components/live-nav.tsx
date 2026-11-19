"use client";
import Link from "next/link";

/** Single source of truth for live-project Sentinel navigation (replaces six divergent hard-coded lists). */
export const liveSections = [
  ["Overview", ""],
  ["Event Explorer", "/activity"],
  ["Telemetry sources", "/sources"],
  ["Detection Rules", "/rules"],
  ["Alerts", "/alerts"],
  ["Incidents", "/incidents"],
  ["Responses", "/responses"],
  ["Notifications", "/notifications"],
  ["Ghost", "/ghost"],
  ["Intelligence", "/intelligence"],
  ["Reports", "/reports"],
] as const;

export function LiveSentinelNav({
  projectId,
  active,
}: {
  projectId: string;
  active: string;
}) {
  const current = active.startsWith("/incidents") ? "/incidents" : active;
  return (
    <nav className="page-tabs" aria-label="Sentinel live sections">
      {liveSections.map(([label, path]) => (
        <Link
          key={path}
          href={`/app/projects/${projectId}/sentinel${path}`}
          className={current === path ? "active" : ""}
          aria-current={current === path ? "page" : undefined}
        >
          {label}
        </Link>
      ))}
      <Link href={`/app/projects/${projectId}/canvas`}>Canvas security</Link>
    </nav>
  );
}

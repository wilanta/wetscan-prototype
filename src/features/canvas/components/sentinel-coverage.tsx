"use client";
import { Badge, LinkButton } from "@/components/ui";
import type { CoverageState, SecurityOverlay } from "../types";

const labels: Record<CoverageState, string> = {
  not_scanned: "Not yet scanned",
  not_monitored: "Monitoring not connected",
  available: "Sources reporting",
  partial: "Partial coverage",
  stale: "Stale — last-known records",
  failed: "Security data unavailable",
  unavailable: "Unavailable",
};
export const coverageLabel = (state: CoverageState) => labels[state];
const reasons = {
  no_route_evidence: "No route evidence in its events",
  no_matching_node: "No source-observed API node matches its route",
  ambiguous_nodes: "More than one API node could match",
} as const;

/** CAN-008 details: what is mapped, what is deliberately NOT placed on the graph, and why. */
export function SentinelCoverage({
  security,
  choose,
  nodeLabel,
}: {
  security: SecurityOverlay;
  choose: (nodeId: string) => void;
  nodeLabel: (nodeId: string) => string;
}) {
  const detail = security.sentinelDetail;
  if (!detail) return null;
  return (
    <div aria-label="Sentinel incident mapping">
      <p>
        <Badge tone={security.sentinel === "available" ? "blue" : "amber"}>
          {coverageLabel(security.sentinel)}
        </Badge>{" "}
        {detail.sources.connected}/{detail.sources.total} sources connected (
        {detail.sources.runtimeConnected} runtime) · {detail.mappedCount} mapped
        · {detail.unmappedCount} not placed
        {detail.truncated ? " · list truncated" : ""} · graph{" "}
        {detail.sourceRevision.slice(0, 7)} ·{" "}
        {new Date(detail.generatedAt).toLocaleTimeString("en-GB", {
          timeZone: "Asia/Jakarta",
        })}{" "}
        WIB
      </p>
      {security.incidents.length > 0 && (
        <ul>
          {security.incidents.map((i) => (
            <li key={i.id}>
              <button onClick={() => choose(i.nodeId)}>
                {i.provenance?.severity} · {i.title} ·{" "}
                {i.provenance?.origin === "controlled_test"
                  ? "controlled test"
                  : "runtime"}{" "}
                → {nodeLabel(i.nodeId)}
              </button>
            </li>
          ))}
        </ul>
      )}
      {detail.unmapped.length > 0 && (
        <>
          <p>
            <strong>Incidents not placed on this graph</strong> (never guessed):
          </p>
          <ul>
            {detail.unmapped.map((u) => (
              <li key={u.id}>
                {u.title} · {u.status} · {reasons[u.reason]}{" "}
                {u.href && (
                  <LinkButton secondary href={u.href}>
                    Open incident
                  </LinkButton>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

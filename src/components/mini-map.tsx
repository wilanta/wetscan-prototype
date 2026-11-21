import {
  AppWindow,
  Braces,
  Cloud,
  Database,
  GitBranch,
  KeyRound,
} from "lucide-react";

export interface MiniMapProps {
  apiName?: string;
  frontendLabel?: string;
  frontendSub?: string;
  apiIssues?: number;
  webIssues?: number;
  repoLabel?: string;
  envLabel?: string;
}

export function MiniMap({
  apiName = "Orders API",
  frontendLabel = "Web application",
  frontendSub = "Next.js · TypeScript",
  apiIssues = 1,
  webIssues = 0,
  repoLabel = "northstar-studio/orderly-demo",
  envLabel = "staging",
}: MiniMapProps) {
  return (
    <div
      className="mini-map"
      aria-label="Application architecture preview: web application calls API, which accesses authentication and the database"
    >
      <svg viewBox="0 0 650 260" preserveAspectRatio="none" aria-hidden="true">
        <path
          d="M160 136 H270 M380 136 H480 M325 116 V55 M125 165 V225 H525 V165"
          fill="none"
          stroke="var(--graph-edge)"
          strokeWidth="1.5"
          strokeDasharray="5 5"
        />
        <circle cx="218" cy="136" r="4" fill="var(--primary)" />
        <circle cx="432" cy="136" r="4" fill="var(--primary)" />
      </svg>
      <div className="mini-node mini-web">
        <AppWindow />
        <strong>{frontendLabel}</strong>
        <small>{frontendSub}</small>
        <span className={`tiny-status ${webIssues > 0 ? "warning-dot" : ""}`}>
          {webIssues > 0
            ? `${webIssues} finding${webIssues > 1 ? "s" : ""}`
            : "Verified in demo"}
        </span>
      </div>
      <div
        className={`mini-node mini-api ${apiIssues === 0 ? "mini-api-clean" : ""}`}
      >
        <Braces />
        <strong>{apiName}</strong>
        <small>REST · 6 endpoints</small>
        <span className={`tiny-status ${apiIssues > 0 ? "warning-dot" : ""}`}>
          {apiIssues > 0 ? `${apiIssues} needs review` : "All checks passing"}
        </span>
      </div>
      <div className="mini-node mini-db">
        <Database />
        <strong>Orders database</strong>
        <small>PostgreSQL</small>
        <span className="tiny-status">Verified in demo</span>
      </div>
      <div className="mini-auth">
        <KeyRound size={14} /> Auth Boundary
      </div>
      <div className="mini-support">
        <span>
          <GitBranch size={14} /> {repoLabel}
        </span>
        <span>
          <Cloud size={14} /> {envLabel}
        </span>
      </div>
    </div>
  );
}

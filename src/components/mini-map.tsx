import {
  AppWindow,
  Braces,
  Database,
  KeyRound,
  GitBranch,
  Cloud,
} from "lucide-react";
export function MiniMap() {
  return (
    <div
      className="mini-map"
      aria-label="Demo architecture: web application calls Orders API, which accesses authentication and the database"
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
        <strong>Web application</strong>
        <small>Next.js frontend</small>
        <span className="tiny-status">Verified in demo</span>
      </div>
      <div className="mini-node mini-api">
        <Braces />
        <strong>Orders API</strong>
        <small>REST · 6 endpoints</small>
        <span className="tiny-status warning-dot">1 needs review</span>
      </div>
      <div className="mini-node mini-db">
        <Database />
        <strong>Orders database</strong>
        <small>PostgreSQL</small>
        <span className="tiny-status">Verified in demo</span>
      </div>
      <div className="mini-auth">
        <KeyRound size={14} /> Clerk Auth
      </div>
      <div className="mini-support">
        <span>
          <GitBranch size={14} /> Repository
        </span>
        <span>
          <Cloud size={14} /> Staging hosting
        </span>
      </div>
    </div>
  );
}

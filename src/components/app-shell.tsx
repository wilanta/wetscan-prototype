"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  ArrowUpRight,
  Bell,
  BookOpen,
  BrainCircuit,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  FileText,
  FolderGit2,
  FolderOpen,
  Ghost,
  LayoutDashboard,
  Menu,
  Moon,
  Network,
  Plug,
  Radar,
  RotateCcw,
  Search,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Sun,
  X,
} from "lucide-react";
import { Logo } from "./logo";
import { useDemo, toast } from "./demo-provider";
import { Badge, Button, Modal } from "./ui";
import { PROJECT, findings as demoFindings } from "@/data/demo";
import {
  DashboardAccountDialog,
  DashboardAccountProvider,
  useDashboardAccount,
} from "./dashboard-account";

const home = [
  { href: "/app", label: "Overview", Icon: LayoutDashboard },
  { href: "/app/projects", label: "Projects", Icon: FolderOpen },
  { href: "/app/activity", label: "Workspace activity", Icon: Activity },
];
const protect = [
  { href: `${PROJECT}/canvas`, label: "Canvas", Icon: Network },
  { href: `${PROJECT}/guard`, label: "Guard", Icon: ShieldCheck },
  { href: `${PROJECT}/sentinel`, label: "Sentinel", Icon: Radar },
];
const manage = [
  { href: "/app/notifications", label: "Notifications", Icon: Bell },
  { href: "/app/integrations", label: "Integrations", Icon: Plug },
  { href: "/app/reports", label: "Reports", Icon: FileText },
  { href: "/app/settings", label: "Team & settings", Icon: Settings },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const realProject =
    /^\/app\/projects\/github-[1-9]\d*(?:\/(?:canvas|guard(?:\/(?:scans|findings|integrity|dast|remediation|releases|cicd|reports))?|sentinel(?:\/(?:activity|sources|rules|alerts|incidents(?:\/[a-f0-9-]+)?|responses|notifications|ghost|intelligence|reports))?))?$/.test(
      pathname,
    );
  const currentRealId = realProject ? pathname.split("/")[3] : null;
  const accountState = useDashboardAccount();
  const { account, status: accountStatus } = accountState;
  const { state, dispatch, dark, setDark } = useDemo();
  const [mobile, setMobile] = useState(false);
  const [reset, setReset] = useState(false);
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const activeRepo = currentRealId
    ? account.repositories.find((r) => `github-${r.id}` === currentRealId)
    : undefined;

  const section = pathname.includes("/canvas")
    ? "Canvas"
    : pathname.includes("/guard")
      ? "Guard"
      : pathname.includes("/sentinel/ghost")
        ? "Ghost"
        : pathname.includes("/sentinel/intelligence")
          ? "Intelligence"
          : pathname.includes("/sentinel")
            ? "Sentinel"
            : pathname.split("/").filter(Boolean).at(-1)?.replaceAll("-", " ") ||
              "Overview";

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      if (e.key === "Escape") {
        setProjectMenuOpen(false);
        setSearchFocused(false);
        searchInputRef.current?.blur();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    const results: { label: string; sub: string; href: string; kind: string }[] =
      [];

    if (realProject && currentRealId) {
      const base = `/app/projects/${currentRealId}`;
      const liveRoutes = [
        { label: "Canvas Architecture", sub: `${activeRepo?.fullName ?? currentRealId} · Source map`, href: `${base}/canvas`, kind: "Module" },
        { label: "Guard Overview & Scans", sub: "Repository scanning & findings", href: `${base}/guard`, kind: "Guard" },
        { label: "Guard Findings", sub: "Static, dependency & secrets evidence", href: `${base}/guard/findings`, kind: "Guard" },
        { label: "Guard AI Remediation", sub: "Consented patches & targeted retests", href: `${base}/guard/remediation`, kind: "Guard" },
        { label: "Guard CI/CD Release Gate", sub: "Branch policy & commit evaluations", href: `${base}/guard/cicd`, kind: "Guard" },
        { label: "Guard DAST & Integrity", sub: "Authorized staging probes (G05)", href: `${base}/guard/dast`, kind: "Guard" },
        { label: "Guard Reports & Bridges", sub: "Unified reports & S09 sync (G06)", href: `${base}/guard/reports`, kind: "Guard" },
        { label: "Sentinel Overview", sub: "Live telemetry, alerts & containment", href: `${base}/sentinel`, kind: "Sentinel" },
        { label: "Sentinel Incidents", sub: "Correlated runtime incidents", href: `${base}/sentinel/incidents`, kind: "Sentinel" },
        { label: "Sentinel Responses", sub: "Controlled response lifecycle", href: `${base}/sentinel/responses`, kind: "Sentinel" },
        { label: "Ghost Deception Traps", sub: "Authorized decoy routes", href: `${base}/sentinel/ghost`, kind: "Ghost" },
        { label: "Sentinel Intelligence", sub: "Advisories, lockfiles & case archive", href: `${base}/sentinel/intelligence`, kind: "Intelligence" },
      ];
      for (const item of liveRoutes) {
        if (`${item.label} ${item.sub} ${item.kind}`.toLowerCase().includes(q)) {
          results.push(item);
        }
      }
      return results.slice(0, 7);
    }

    for (const repo of account.repositories) {
      if (repo.fullName.toLowerCase().includes(q)) {
        results.push({
          label: repo.fullName,
          sub: `Connected GitHub repo · branch ${repo.defaultBranch}`,
          href: `/app/projects/github-${repo.id}/canvas`,
          kind: "Live Repo",
        });
      }
    }

    for (const f of demoFindings) {
      if (`${f.id} ${f.title} ${f.file} ${f.category}`.toLowerCase().includes(q)) {
        results.push({
          label: `${f.id} · ${f.title}`,
          sub: `${f.severity.toUpperCase()} · Orderly Demo`,
          href: `${PROJECT}/guard/findings/${f.id}`,
          kind: "Demo Finding",
        });
      }
    }

    for (const inc of state.incidents) {
      if (`${inc.id} ${inc.title}`.toLowerCase().includes(q)) {
        results.push({
          label: `${inc.id} · ${inc.title}`,
          sub: `${inc.responseState.replaceAll("_", " ")} · Orderly Demo`,
          href: `${PROJECT}/sentinel/incidents/${inc.id}`,
          kind: "Demo Incident",
        });
      }
    }

    for (const mod of [
      { label: "Canvas · Orderly Demo", sub: "Architecture & Trust Lenses", href: `${PROJECT}/canvas`, kind: "Demo" },
      { label: "Guard · Orderly Demo", sub: "Scans, Inventory & Workbench", href: `${PROJECT}/guard`, kind: "Demo" },
      { label: "Sentinel · Orderly Demo", sub: "Activity, Incidents & Responses", href: `${PROJECT}/sentinel`, kind: "Demo" },
      { label: "Ghost Decoy Setup", sub: "Orderly Demo deception endpoint", href: `${PROJECT}/sentinel/ghost`, kind: "Demo" },
      { label: "Intelligence", sub: "Advisories & Draft Rule Promotion", href: `${PROJECT}/sentinel/intelligence`, kind: "Demo" },
    ]) {
      if (`${mod.label} ${mod.sub}`.toLowerCase().includes(q)) {
        results.push(mod);
      }
    }

    return results.slice(0, 7);
  }, [searchQuery, realProject, currentRealId, activeRepo?.fullName, account.repositories, state.incidents]);

  function nav(items: typeof home) {
    return items.map(({ href, label, Icon }) => {
      if (realProject && currentRealId) {
        const sentinel = `/app/projects/${currentRealId}/sentinel`;
        if (["Sentinel", "Guard", "Canvas"].includes(label))
          href = `/app/projects/${currentRealId}/${label.toLowerCase()}`;
        if (label === "Notifications") href = `${sentinel}/notifications`;
        if (label === "Reports") href = `${sentinel}/reports`;
      }
      const active =
        href === "/app"
          ? pathname === "/app"
          : pathname === href ||
            (label === "Sentinel" &&
              (href.includes("/guard") || href.includes("/sentinel")) &&
              pathname.startsWith(href)) ||
            (label === "Guard" && pathname.startsWith(href));
      return (
        <div key={href}>
          <Link
            href={href}
            className={`nav-link ${active ? "active" : ""}`}
            aria-current={active ? "page" : undefined}
            onClick={() => setMobile(false)}
          >
            <Icon size={18} />
            <span>{label}</span>
            {realProject && label === "Integrations" && (
              <span className="nav-new">DEMO</span>
            )}
            {realProject && label === "Guard" && (
              <span className="nav-new">LIVE</span>
            )}
            {label === "Canvas" && <span className="nav-new">MAP</span>}
            {!realProject && label === "Guard" && (
              <span className="nav-count">
                {state.findingStatus === "verified_fixed" ? 2 : 3}
              </span>
            )}
            {label === "Sentinel" && <ChevronDown size={14} />}
          </Link>
          {label === "Sentinel" && (
            <div className="nav-children">
              {(realProject
                ? [
                    ["Incidents", "/incidents", Radar],
                    ["Responses", "/responses", ShieldCheck],
                    ["Ghost", "/ghost", Ghost],
                    ["Intelligence", "/intelligence", BrainCircuit],
                  ]
                : [
                    ["Ghost", "/ghost", Ghost],
                    ["Intelligence", "/intelligence", BrainCircuit],
                  ]
              ).map(([text, path, ChildIcon]) => {
                const root = realProject
                  ? `/app/projects/${currentRealId}/sentinel`
                  : `${PROJECT}/sentinel`;
                return (
                  <Link
                    key={path as string}
                    href={`${root}${path}`}
                    onClick={() => setMobile(false)}
                    className={
                      pathname === `${root}${path}` ||
                      pathname.startsWith(`${root}${path}/`)
                        ? "active"
                        : ""
                    }
                  >
                    <ChildIcon size={15} />
                    {text as string}
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      );
    });
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      {mobile && (
        <button
          className="sidebar-scrim"
          aria-label="Close navigation"
          onClick={() => setMobile(false)}
        />
      )}
      <aside className={`sidebar ${mobile ? "mobile-open" : ""}`}>
        <div className="sidebar-brand">
          <Link href="/" aria-label="WetScan home">
            <Logo />
          </Link>
          <button
            className="icon-button mobile-only"
            aria-label="Close navigation"
            onClick={() => setMobile(false)}
          >
            <X size={19} />
          </button>
        </div>

        <Link
          className="workspace-switch account-workspace"
          href="/app/settings"
          title={account.workspace}
          onClick={() => setMobile(false)}
        >
          <span className="workspace-monogram">{account.workspaceInitial}</span>
          <div>
            <strong>
              {accountStatus === "loading"
                ? "Loading workspace..."
                : account.workspace}
            </strong>
            <small>
              {accountStatus !== "ready"
                ? "Account data unavailable"
                : !account.repositoriesAvailable
                  ? "Repository data unavailable"
                  : `${account.repositories.length} connected ${account.repositories.length === 1 ? "repository" : "repositories"}`}
            </small>
          </div>
          <ChevronDown size={15} />
        </Link>

        <div className="project-select-box">
          <button
            type="button"
            className="project-select-trigger"
            aria-expanded={projectMenuOpen}
            aria-label="Switch project scope"
            onClick={() => setProjectMenuOpen((v) => !v)}
          >
            <FolderGit2 size={15} />
            <div>
              <strong>
                {realProject
                  ? activeRepo?.fullName ?? currentRealId
                  : pathname.startsWith(PROJECT)
                    ? state.projectName
                    : "Workspace projects"}
              </strong>
              <small>
                {realProject
                  ? `Live · ${activeRepo?.defaultBranch ?? "GitHub"}`
                  : pathname.startsWith(PROJECT)
                    ? `Demo · ${state.branch}`
                    : `${account.repositories.length} connected · switch scope`}
              </small>
            </div>
            <ChevronDown size={14} />
          </button>

          {projectMenuOpen && (
            <div className="project-dropdown" role="menu">
              {account.repositories.map((repo) => {
                const pid = `github-${repo.id}`;
                const selected = pid === currentRealId;
                return (
                  <button
                    key={repo.id}
                    type="button"
                    className={selected ? "selected" : ""}
                    onClick={() => {
                      setProjectMenuOpen(false);
                      setMobile(false);
                      router.push(`/app/projects/${pid}/canvas`);
                    }}
                  >
                    <div>
                      <strong>{repo.fullName}</strong>
                      <small>{repo.defaultBranch} · GitHub App</small>
                    </div>
                    <Badge tone="green">Live</Badge>
                  </button>
                );
              })}
              <button
                type="button"
                className={!realProject && pathname.startsWith(PROJECT) ? "selected" : ""}
                onClick={() => {
                  setProjectMenuOpen(false);
                  setMobile(false);
                  router.push(PROJECT);
                }}
              >
                <div>
                  <strong>{state.projectName}</strong>
                  <small>Orderly sandbox walkthrough</small>
                </div>
                <Badge tone="blue">Demo</Badge>
              </button>
              <Link
                href="/onboarding"
                onClick={() => {
                  setProjectMenuOpen(false);
                  setMobile(false);
                }}
                style={{
                  display: "block",
                  textAlign: "center",
                  padding: "7px 9px",
                  borderTop: "1px solid var(--border)",
                  marginTop: 4,
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                + Manage GitHub repositories
              </Link>
            </div>
          )}
        </div>

        <div className="sidebar-nav">
          <div className="nav-group-label">WORKSPACE</div>
          {nav(home)}
          <div className="nav-group-label">PROTECT YOUR APP</div>
          {nav(
            protect.map((item) =>
              realProject && currentRealId && item.label === "Canvas"
                ? {
                    ...item,
                    href: `/app/projects/${currentRealId}/canvas`,
                  }
                : item,
            ),
          )}
          <div className="nav-group-label">MANAGE</div>
          {nav(manage)}
        </div>

        <div className="sidebar-bottom">
          <div className="demo-card">
            <div>
              <span className="live-dot" />
              <strong>
                {realProject ? "GitHub source map" : "You’re exploring a demo"}
              </strong>
            </div>
            <p>
              {realProject ? (
                "Inspect source architecture on Canvas, run Guard scans & gates, and monitor Sentinel streams."
              ) : (
                <>
                  Real clarity. Sample data.
                  <br />
                  Make yourself at home.
                </>
              )}
            </p>
            {!realProject && (
              <Button variant="ghost" onClick={() => setReset(true)}>
                <RotateCcw size={14} />
                Reset demo
              </Button>
            )}
          </div>

          <Modal
            trigger={
              <button className="nav-link help-button">
                <CircleHelp size={18} />
                Help &amp; quick tour
                <ArrowUpRight size={14} />
              </button>
            }
            title="Your two-minute WetScan tour"
            description="Understand the separation between Live GitHub repository analysis and the interactive Orderly Demo."
          >
            <ol className="tour-list">
              <li>Use the project switcher above to switch between Live GitHub repos and Orderly Demo.</li>
              <li>Open Canvas and inspect Architecture, Security, Trust, and Workflow views.</li>
              <li>In Orderly Demo Guard, view FIND-102, its evidence, and simulate a retest.</li>
              <li>In Sentinel, simulate a suspicious request, apply a response, and verify outcome separately.</li>
              <li>In Live repositories, use Guard (G02-G06) and Sentinel for server-persisted workflows.</li>
            </ol>
            <Link href="/app/reports" className="button secondary">
              Read the demo report <BookOpen size={16} />
            </Link>
          </Modal>

          <button
            type="button"
            className="profile account-trigger"
            aria-label="Open account menu"
            onClick={() => {
              setMobile(false);
              accountState.setOpen(true);
            }}
          >
            <span className="avatar" title="Avatar placeholder">
              {account.initials}
            </span>
            <div>
              <strong>{account.login}</strong>
              <small>{account.email}</small>
            </div>
            <Settings size={16} />
          </button>
        </div>
      </aside>

      <div className="app-main">
        <header className="topbar">
          <button
            className="icon-button mobile-only"
            onClick={() => setMobile(true)}
            aria-label="Open navigation"
          >
            <Menu size={21} />
          </button>

          <div className="breadcrumbs">
            <span className="desktop-context">Workspace</span>
            <ChevronRight size={14} />
            {realProject && currentRealId ? (
              <>
                <Link href={`/app/projects/${currentRealId}/canvas`}>
                  {activeRepo?.fullName ?? currentRealId}
                </Link>
                <ChevronRight size={14} />
              </>
            ) : pathname.startsWith(PROJECT) ? (
              <>
                <Link href={PROJECT}>{state.projectName}</Link>
                <ChevronRight size={14} />
              </>
            ) : null}
            <strong>
              {pathname === "/app"
                ? "Overview"
                : section.charAt(0).toUpperCase() + section.slice(1)}
            </strong>
          </div>

          <div className="topbar-search">
            <div className="topbar-search-input">
              <Search size={14} />
              <input
                ref={searchInputRef}
                type="search"
                autoComplete="off"
                suppressHydrationWarning
                aria-label="Global workspace search"
                placeholder={
                  realProject
                    ? "Search live Canvas, Guard, or Sentinel modules…"
                    : "Search repositories, findings, or incidents…"
                }
                value={searchQuery}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setTimeout(() => setSearchFocused(false), 180)}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <span className="topbar-search-kbd">Ctrl+K</span>
            </div>
            {searchFocused && searchQuery.trim().length > 0 && (
              <div className="topbar-search-results">
                {searchResults.length > 0 ? (
                  searchResults.map((res) => (
                    <button
                      key={`${res.kind}-${res.href}`}
                      type="button"
                      className="search-result-item"
                      onMouseDown={() => {
                        setSearchQuery("");
                        setSearchFocused(false);
                        router.push(res.href);
                      }}
                    >
                      <span className="stat-icon blue" style={{ width: 28, height: 28 }}>
                        <ShieldAlert size={14} />
                      </span>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <strong style={{ fontSize: 12, display: "block" }}>
                          {res.label}
                        </strong>
                        <small className="muted" style={{ fontSize: 11 }}>
                          {res.sub}
                        </small>
                      </div>
                      <Badge tone="neutral">{res.kind}</Badge>
                    </button>
                  ))
                ) : (
                  <p className="muted" style={{ padding: "8px 10px", fontSize: 12 }}>
                    No matches for &ldquo;{searchQuery}&rdquo;.
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="topbar-actions">
            <Badge tone="blue">
              {realProject ? "GitHub source" : "Demo mode"}
            </Badge>
            <button
              className="icon-button"
              title={dark ? "Switch to light theme" : "Switch to dark theme"}
              aria-label={
                dark ? "Switch to light theme" : "Switch to dark theme"
              }
              onClick={() => setDark(!dark)}
            >
              {dark ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <Link
              href={
                realProject && currentRealId
                  ? `/app/projects/${currentRealId}/sentinel/notifications`
                  : "/app/notifications"
              }
              className="icon-button notification-icon"
              aria-label={
                realProject
                  ? "Notifications"
                  : `Notifications, ${state.notifications.length} previews`
              }
            >
              <Bell size={18} />
              {!realProject && state.notifications.length > 0 && <span />}
            </Link>
            <button
              type="button"
              className="avatar small"
              aria-label="Open account menu"
              title="Your account and logout (avatar placeholder)"
              onClick={() => accountState.setOpen(true)}
            >
              {account.initials}
            </button>
          </div>
        </header>

        <main id="main" className="main-content">
          <DashboardAccountProvider value={accountState}>
            {children}
          </DashboardAccountProvider>
        </main>

        <footer className="app-footer">
          <span>
            <ShieldCheck size={13} /> A clearer picture. A safer next step.
          </span>
          <span>
            {realProject
              ? "Source observations · Runtime unverified · No live protection"
              : "Demo fixtures · No live protection"}
          </span>
        </footer>
      </div>

      <DashboardAccountDialog state={accountState} />

      <Modal
        open={reset}
        onOpenChange={setReset}
        title="Start fresh?"
        description="Restore the original demo fixtures, project settings, incidents, and notification previews."
      >
        <div className="actions">
          <Button variant="secondary" onClick={() => setReset(false)}>
            Keep exploring
          </Button>
          <Button
            onClick={() => {
              dispatch({ type: "reset" });
              setDark(false);
              setReset(false);
              toast.success("Demo reset to its initial state.");
            }}
          >
            Reset demo
          </Button>
        </div>
      </Modal>
    </div>
  );
}

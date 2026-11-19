"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Activity,
  ArrowUpRight,
  Bell,
  BookOpen,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  FileText,
  FolderOpen,
  LayoutDashboard,
  Menu,
  Moon,
  Network,
  Plug,
  Radar,
  RotateCcw,
  Settings,
  ShieldCheck,
  Sun,
  X,
  Ghost,
  BrainCircuit,
} from "lucide-react";
import { Logo } from "./logo";
import { useDemo, toast } from "./demo-provider";
import { Badge, Button, Modal } from "./ui";
import { PROJECT } from "@/data/demo";
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
  const realProject =
    /^\/app\/projects\/github-[1-9]\d*\/(?:canvas|guard(?:\/(?:scans|findings|integrity|remediation|releases))?|sentinel(?:\/(?:activity|sources|rules|alerts|incidents(?:\/[a-f0-9-]+)?|responses|notifications|ghost|intelligence|reports))?)$/.test(
      pathname,
    );
  const accountState = useDashboardAccount();
  const { account, status: accountStatus } = accountState;
  const { state, dispatch, dark, setDark } = useDemo();
  const [mobile, setMobile] = useState(false);
  const [reset, setReset] = useState(false);
  const section = pathname.includes("/canvas")
    ? "Canvas"
    : pathname.includes("/guard")
      ? "Guard"
      : pathname.includes("/sentinel")
        ? "Sentinel"
        : pathname.split("/").filter(Boolean).at(-1)?.replaceAll("-", " ") ||
          "Overview";
  function nav(items: typeof home) {
    return items.map(({ href, label, Icon }) => {
      if (realProject) {
        const projectId = pathname.split("/")[3];
        const sentinel = `/app/projects/${projectId}/sentinel`;
        // Real projects never link to the synthetic demo pages for modules that have a live view.
        if (["Sentinel", "Guard", "Canvas"].includes(label))
          href = `/app/projects/${projectId}/${label.toLowerCase()}`;
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
              <span className="nav-new">LIVE · COVERAGE REQUIRED</span>
            )}
            {label === "Canvas" && <span className="nav-new">APP MAP</span>}
            {label === "Guard" && <span className="nav-count">3</span>}
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
                  ? `/app/projects/${pathname.split("/")[3]}/sentinel`
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
        <div className="sidebar-nav">
          <div className="nav-group-label">WORKSPACE</div>
          {nav(home)}
          <div className="nav-group-label">PROTECT YOUR APP</div>
          {nav(
            protect.map((item) =>
              realProject && item.label === "Canvas"
                ? {
                    ...item,
                    href: `/app/projects/${pathname.split("/")[3]}/canvas`,
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
                "Guard: Not yet scanned · Open Sentinel to inspect live sources, Ghost Lite and the Intelligence case library."
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
                Help & quick tour
                <ArrowUpRight size={14} />
              </button>
            }
            title="Your two-minute WetScan tour"
            description="Everything here uses synthetic local fixtures. No real system is scanned."
          >
            <ol className="tour-list">
              <li>Open Canvas and select Orders API.</li>
              <li>View FIND-102, its evidence, and the example fix.</li>
              <li>Simulate a suspicious request in Sentinel.</li>
              <li>Advance the response, then run a separate verification.</li>
              <li>Review notification previews, Ghost, and Intelligence.</li>
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
            {pathname.startsWith(PROJECT) ? (
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
                realProject
                  ? `/app/projects/${pathname.split("/")[3]}/sentinel/notifications`
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

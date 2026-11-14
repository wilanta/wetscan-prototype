"use client";
import Link from "next/link";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { LogOut } from "lucide-react";
import { authFetch } from "@/components/auth/api";
import { dashboardAccount } from "@/lib/dashboard-account";
import type { OnboardingState } from "@/lib/auth/types";
import { Button, Modal, Notice } from "./ui";

export function useDashboardAccount() {
  const [account, setAccount] = useState(dashboardAccount);
  const [status, setStatus] = useState<"loading" | "ready" | "unavailable">(
    "loading",
  );
  const [open, setOpen] = useState(false);
  const [revision, setRevision] = useState(0);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  useEffect(() => {
    let active = true;
    let request = 0;
    async function load() {
      const current = ++request;
      try {
        const data = await authFetch<OnboardingState>("/api/onboarding");
        if (!active || current !== request) return;
        if (data.authenticated === false) {
          window.location.replace("/login");
          return;
        }
        if (data.authenticated !== true || !data.step)
          throw new Error("Invalid public account response");
        if (data.step !== "complete") {
          window.location.replace("/onboarding");
          return;
        }
        setAccount(dashboardAccount(data.profile, data.connected));
        setStatus("ready");
      } catch {
        if (!active || current !== request) return;
        setAccount(dashboardAccount());
        setStatus("unavailable");
      }
    }
    function restore(event: PageTransitionEvent) {
      if (!event.persisted) return;
      setAccount(dashboardAccount());
      setStatus("loading");
      void load();
    }
    function focus() {
      void load();
    }
    void load();
    window.addEventListener("pageshow", restore);
    window.addEventListener("focus", focus);
    return () => {
      active = false;
      request++;
      window.removeEventListener("pageshow", restore);
      window.removeEventListener("focus", focus);
    };
  }, [revision]);
  function refresh() {
    setStatus("loading");
    setAccount(dashboardAccount());
    setRevision((value) => value + 1);
  }
  async function logout() {
    if (loggingOut) return;
    setLoggingOut(true);
    setLogoutError("");
    try {
      // The existing endpoint deletes the server session, clears its cookie,
      // and redirects to HTML. Do not parse that response as JSON.
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Logout failed");
      setAccount(dashboardAccount());
      // Full navigation also discards the dashboard's in-memory client cache.
      window.location.replace("/login");
    } catch {
      setLogoutError("Could not log out. Please try again.");
      setLoggingOut(false);
    }
  }
  return {
    account,
    status,
    open,
    setOpen,
    refresh,
    logout,
    loggingOut,
    logoutError,
  };
}
// UI context only: AppShell owns the existing account request and state.
// Consumers must not call useDashboardAccount again to obtain repository data.
type DashboardAccountView = Pick<
  ReturnType<typeof useDashboardAccount>,
  "account" | "status" | "refresh" | "setOpen"
>;
const DashboardAccountContext = createContext<DashboardAccountView | null>(
  null,
);
export function DashboardAccountProvider({
  value,
  children,
}: {
  value: DashboardAccountView;
  children: ReactNode;
}) {
  return (
    <DashboardAccountContext.Provider value={value}>
      {children}
    </DashboardAccountContext.Provider>
  );
}
export function useDashboardAccountView() {
  const value = useContext(DashboardAccountContext);
  if (!value) throw new Error("DashboardAccountProvider required");
  return value;
}

export function DashboardAccountDialog({
  state,
}: {
  state: ReturnType<typeof useDashboardAccount>;
}) {
  const {
    account,
    status,
    open,
    setOpen,
    refresh,
    logout,
    loggingOut,
    logoutError,
  } = state;
  return (
    <Modal
      open={open}
      onOpenChange={setOpen}
      title="Your account"
      description="Your signed-in account and saved GitHub connection."
    >
      <div className="dashboard-account">
        {status === "loading" && (
          <p role="status">Loading account details...</p>
        )}
        {status === "unavailable" && (
          <Notice>
            Account details are unavailable. You can keep using the dashboard
            and retry.{" "}
            <Button variant="ghost" onClick={refresh}>
              Retry account details
            </Button>
          </Notice>
        )}
        <div className="account-avatar-placeholder">
          <span className="avatar" role="img" aria-label="Avatar placeholder">
            {account.initials}
          </span>
          <span>Avatar placeholder: no avatar is saved in your profile.</span>
        </div>
        <dl className="inspector-meta">
          <div>
            <dt>GitHub username</dt>
            <dd>{account.login}</dd>
          </div>
          <div>
            <dt>Email</dt>
            <dd>{account.email}</dd>
          </div>
          <div>
            <dt>Workspace</dt>
            <dd>{account.workspace}</dd>
          </div>
        </dl>
        <h3>Connected repositories</h3>
        {status !== "ready" || !account.repositoriesAvailable ? (
          <p>Repository information unavailable.</p>
        ) : !account.connected ? (
          <p>No GitHub installation connected.</p>
        ) : !account.repositories.length ? (
          <p>No repositories selected.</p>
        ) : (
          <ul className="account-repositories">
            {account.repositories.map((repo) => (
              <li key={repo.id}>
                <strong>{repo.fullName}</strong>
                <small>
                  {repo.private === null
                    ? "Visibility unavailable"
                    : repo.private
                      ? "Private"
                      : "Public"}{" "}
                  / {repo.defaultBranch}
                </small>
              </li>
            ))}
          </ul>
        )}
        {logoutError && <p role="alert">{logoutError}</p>}
        <div className="actions">
          <Link href="/account" className="button secondary">
            Account settings
          </Link>
          <Button
            variant="secondary"
            onClick={() => void logout()}
            disabled={loggingOut}
          >
            <LogOut size={16} />
            {loggingOut ? "Logging out..." : "Log out"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

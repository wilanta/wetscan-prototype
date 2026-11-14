"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  GitBranch,
  ShieldCheck,
} from "lucide-react";
import { Logo } from "@/components/logo";
import { Badge, Button, Card, Notice } from "@/components/ui";
import type {
  InstallationChoice,
  OnboardingState,
  Repository,
} from "@/lib/auth/types";
import { authFetch, errorMessage } from "./api";

const steps = [
  "Create workspace",
  "Connect GitHub",
  "Select repositories",
  "Set up account",
];
const stepNumber = {
  workspace: 0,
  github: 1,
  repositories: 2,
  account: 3,
  complete: 3,
};
export function Onboarding({ initialError = "" }: { initialError?: string }) {
  const router = useRouter();
  const [state, setState] = useState<OnboardingState>();
  const [step, setStep] = useState(0);
  const [workspace, setWorkspace] = useState("");
  const [repos, setRepos] = useState<Repository[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [email, setEmail] = useState("");
  const [security, setSecurity] = useState(true);
  const [updates, setUpdates] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [reposLoaded, setReposLoaded] = useState(false);
  const [error, setError] = useState(
    initialError ? errorMessage(initialError) : "",
  );
  const [saved, setSaved] = useState("");

  useEffect(() => {
    const callbackError = new URLSearchParams(window.location.search).get(
      "error",
    );
    if (callbackError) {
      window.history.replaceState(null, "", "/onboarding");
    }
    void authFetch<OnboardingState>("/api/onboarding")
      .then((data) => {
        if (data.step === "complete") {
          window.location.replace("/app");
          return;
        }
        setState(data);
        setStep(stepNumber[data.step]);
        setWorkspace(data.profile.workspace);
        setSelected(data.profile.repositories.map((repo) => repo.id));
        setEmail(data.profile.email);
        setSecurity(data.profile.securityNotifications);
        setUpdates(data.profile.productUpdates);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  // Save partial account input on the server; never put credentials in browser storage.
  useEffect(() => {
    if (step !== 3 || !state?.authenticated) return;
    const timer = setTimeout(() => {
      setSaved("Saving preferences...");
      void authFetch<OnboardingState>("/api/onboarding", {
        action: "account",
        email,
        securityNotifications: security,
        productUpdates: updates,
      })
        .then(() => setSaved("Preferences saved."))
        .catch((e: Error) => {
          setSaved("");
          setError(e.message);
        });
    }, 600);
    return () => clearTimeout(timer);
  }, [step, state?.authenticated, email, security, updates]);

  async function loadRepositories() {
    setLoadingRepos(true);
    setError("");
    setReposLoaded(false);
    try {
      const data = await authFetch<{ repositories: Repository[] }>(
        "/api/onboarding/repositories",
      );
      setRepos(data.repositories);
      setSelected((ids) =>
        ids.filter((id) => data.repositories.some((repo) => repo.id === id)),
      );
      setReposLoaded(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoadingRepos(false);
    }
  }
  useEffect(() => {
    if (step !== 2 || !state?.connected) return;
    let active = true;
    void authFetch<{ repositories: Repository[] }>(
      "/api/onboarding/repositories",
    )
      .then((data) => {
        if (!active) return;
        setRepos(data.repositories);
        setReposLoaded(true);
        setSelected((ids) =>
          ids.filter((id) => data.repositories.some((repo) => repo.id === id)),
        );
      })
      .catch((e: Error) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [step, state?.connected]);

  async function run(work: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function connect(installationId?: number) {
    await run(async () => {
      const result = await authFetch<
        { url: string } | { installations: InstallationChoice[] }
      >(
        "/api/auth/github/start",
        installationId
          ? { intent: "select", installationId }
          : { intent: "install" },
      );
      if ("url" in result) window.location.assign(result.url);
      else
        setState((current) =>
          current
            ? { ...current, installations: result.installations }
            : current,
        );
    });
  }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await run(async () => {
      if (step === 0) {
        const data = await authFetch<OnboardingState>("/api/onboarding", {
          action: "workspace",
          workspace,
        });
        setState(data);
        setStep(stepNumber[data.step]);
      } else if (step === 2) {
        const data = await authFetch<OnboardingState>("/api/onboarding", {
          action: "repositories",
          repositoryIds: selected,
        });
        setState(data);
        setStep(3);
      } else if (step === 3) {
        await authFetch("/api/onboarding", {
          action: "complete",
          email,
          securityNotifications: security,
          productUpdates: updates,
        });
        router.push("/app");
        router.refresh();
      }
    });
  }
  return (
    <div className="onboarding">
      <header className="landing-nav">
        <Link href="/" aria-label="WetScan home">
          <Logo />
        </Link>
        {state?.authenticated ? (
          <Link href="/account">Account & sign out</Link>
        ) : (
          <Link href="/login">Sign in</Link>
        )}
      </header>
      <main id="main" className="onboarding-layout">
        <aside>
          <Badge tone="blue">YOUR WORKSPACE, CONNECTED</Badge>
          <h1>
            A clear view starts <br />
            with your code.
          </h1>
          <p>
            Create your workspace, connect the GitHub App, and choose the
            repositories WetScan can access.
          </p>
          <ol className="onboarding-steps">
            {steps.map((label, i) => (
              <li
                key={label}
                className={i === step ? "current" : i < step ? "complete" : ""}
                aria-current={i === step ? "step" : undefined}
              >
                <span>{i < step ? <Check size={16} /> : i + 1}</span>
                {label}
              </li>
            ))}
          </ol>
          <div className="onboarding-boundary">
            <ShieldCheck size={20} />
            <p>
              GitHub permissions stay under your control.
              <br />
              Saved progress survives a page refresh.
            </p>
          </div>
        </aside>
        <Card className="onboarding-card">
          <span className="eyebrow">STEP {step + 1} OF 4</span>
          <h2>{steps[step]}</h2>
          {error && (
            <div role="alert">
              <Notice tone="amber">{error}</Notice>
              <p>
                <Link href="/login">Sign in again</Link> ·{" "}
                <Link href="/onboarding">Reload setup</Link>
              </p>
            </div>
          )}
          {!state ? (
            <p role="status">Loading setup...</p>
          ) : (
            <form onSubmit={submit} aria-busy={busy}>
              <fieldset
                disabled={busy}
                style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}
              >
                {step === 0 && (
                  <>
                    <p>
                      Give your team a workspace name. You can connect GitHub in
                      the next step.
                    </p>
                    <label className="field">
                      Workspace name
                      <input
                        name="workspace"
                        required
                        maxLength={60}
                        autoComplete="organization"
                        value={workspace}
                        onChange={(e) => setWorkspace(e.target.value)}
                      />
                    </label>
                  </>
                )}
                {step === 1 && (
                  <>
                    <p>
                      Install the WetScan GitHub App on your personal account or
                      organization. Choose all repositories or only selected
                      repositories on GitHub.
                    </p>
                    <div className="permissions-list">
                      <p>
                        <Check size={18} />
                        Read repository metadata
                      </p>
                      <p>
                        <Check size={18} />
                        Read contents when permitted by your GitHub App
                      </p>
                      <p>
                        <ShieldCheck size={18} />
                        No repository write permission required
                      </p>
                    </div>
                    <Notice>
                      Authorize your GitHub identity so we can find an existing
                      installation. If none is available, GitHub will ask you to
                      install the App. Organization approval may be required.
                    </Notice>
                    {!!state.installations?.length && (
                      <div
                        className="repository-options"
                        aria-label="GitHub installations"
                      >
                        <p>Choose a GitHub App installation to connect.</p>
                        {state.installations.map((installation) => (
                          <Button
                            key={installation.id}
                            type="button"
                            variant="secondary"
                            disabled={busy}
                            onClick={() => void connect(installation.id)}
                          >
                            Connect {installation.account}
                          </Button>
                        ))}
                      </div>
                    )}
                    <div className="onboarding-controls">
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => setStep(0)}
                      >
                        <ArrowLeft size={16} />
                        Back
                      </Button>
                      <Button
                        type="button"
                        disabled={busy}
                        onClick={() => void connect()}
                      >
                        <GitBranch size={18} />
                        {busy ? "Connecting..." : "Install GitHub App"}
                      </Button>
                    </div>
                    {state.connected && (
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => setStep(2)}
                      >
                        Continue with connected GitHub App
                      </Button>
                    )}
                  </>
                )}
                {step === 2 && (
                  <>
                    <p>
                      These repositories are returned by GitHub for your
                      verified installation and account. Select up to 100
                      repositories.
                    </p>
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={loadingRepos}
                      onClick={loadRepositories}
                    >
                      {loadingRepos ? "Refreshing..." : "Refresh repositories"}
                    </Button>
                    {!reposLoaded && !error && (
                      <p role="status">Loading repositories from GitHub...</p>
                    )}
                    {reposLoaded && !repos.length && (
                      <Notice>
                        No accessible repositories were returned. Check your
                        GitHub installation grants or organization approval,
                        then refresh.
                      </Notice>
                    )}
                    <div className="repository-options">
                      {repos.map((repo) => (
                        <label key={repo.id}>
                          <input
                            type="checkbox"
                            name="repositories"
                            checked={selected.includes(repo.id)}
                            disabled={
                              !selected.includes(repo.id) &&
                              selected.length >= 100
                            }
                            onChange={(e) =>
                              setSelected((ids) =>
                                e.target.checked
                                  ? [...ids, repo.id]
                                  : ids.filter((id) => id !== repo.id),
                              )
                            }
                          />
                          <div>
                            <strong>{repo.fullName}</strong>
                            <small>{repo.defaultBranch}</small>
                          </div>
                          <Badge>{repo.private ? "Private" : "Public"}</Badge>
                        </label>
                      ))}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setStep(1)}
                    >
                      Manage GitHub connection
                    </Button>
                  </>
                )}
                {step === 3 && (
                  <>
                    <p>
                      Choose where to receive workspace notifications. GitHub
                      remains your sign-in method.
                    </p>
                    <label className="field">
                      Email address
                      <input
                        type="email"
                        name="email"
                        autoComplete="email"
                        required
                        maxLength={254}
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                      />
                    </label>
                    <label className="check-line">
                      <input
                        type="checkbox"
                        checked={security}
                        onChange={(e) => setSecurity(e.target.checked)}
                      />
                      Security notifications
                    </label>
                    <label className="check-line">
                      <input
                        type="checkbox"
                        checked={updates}
                        onChange={(e) => setUpdates(e.target.checked)}
                      />
                      Product updates
                    </label>
                    <p role="status">{saved}</p>
                    <Notice>
                      Preferences are saved here. Email delivery is not
                      configured. The existing dashboard currently displays demo
                      scan data; connecting GitHub does not start a scan.
                    </Notice>
                  </>
                )}
                {step !== 1 && (
                  <div className="onboarding-controls">
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={step === 0}
                      onClick={() => setStep(step - 1)}
                    >
                      <ArrowLeft size={16} />
                      Back
                    </Button>
                    <Button
                      type="submit"
                      disabled={
                        (step === 2 &&
                          (!reposLoaded || !selected.length || loadingRepos)) ||
                        (step === 0 && !workspace.trim())
                      }
                    >
                      {busy
                        ? "Saving..."
                        : step === 3
                          ? "Finish setup"
                          : "Continue"}
                      <ArrowRight size={16} />
                    </Button>
                  </div>
                )}
              </fieldset>
            </form>
          )}
        </Card>
      </main>
    </div>
  );
}

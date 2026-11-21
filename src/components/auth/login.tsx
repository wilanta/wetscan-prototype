"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { GitBranch } from "lucide-react";
import { Logo } from "@/components/logo";
import { Button, Card } from "@/components/ui";
import { authFetch, errorMessage } from "./api";
import type { OnboardingState } from "@/lib/auth/types";

export function Login({ initialError = "" }: { initialError?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(
    initialError ? errorMessage(initialError) : "",
  );

  useEffect(() => {
    void authFetch<OnboardingState>("/api/onboarding")
      .then((state) => {
        if (state.authenticated)
          window.location.replace(
            state.step === "complete" ? "/app" : "/onboarding",
          );
      })
      .catch(() => undefined);
  }, []);

  async function login() {
    setBusy(true);
    setError("");
    try {
      const result = await authFetch<{ url: string }>(
        "/api/auth/github/start",
        { intent: "login" },
      );
      window.location.assign(result.url);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="onboarding">
      <header className="landing-nav">
        <Link href="/" aria-label="WetScan home">
          <Logo />
        </Link>
        <nav aria-label="Authentication navigation">
          <Link href="/">Home</Link>
          <Link href="/onboarding">Start for Free</Link>
        </nav>
      </header>

      <main id="main" className="onboarding-layout">
        <aside>
          <span className="badge blue">WORKSPACE ACCESS</span>
          <h1>Welcome back.</h1>
          <p>
            Sign in with GitHub to resume your WetScan architecture map,
            Guard repository checks, and Sentinel telemetry.
          </p>

          <div className="onboarding-boundary">
            <GitBranch size={20} />
            <p>
              GitHub OAuth sessions remain scoped to your server-side profile.
              <br />
              Your completed workspace onboarding is preserved automatically.
            </p>
          </div>
        </aside>

        <Card className="onboarding-card">
          <span className="eyebrow">SIGN IN</span>
          <h2>Sign in to WetScan</h2>
          <p>Use the GitHub account connected to your WetScan workspace.</p>

          {error && (
            <div className="notice amber" role="alert" style={{ margin: "14px 0" }}>
              <div>{error}</div>
            </div>
          )}

          <div className="actions" style={{ marginTop: 18 }}>
            <Button type="button" onClick={login} disabled={busy}>
              <GitBranch size={18} />
              {busy ? "Redirecting to GitHub..." : "Continue with GitHub"}
            </Button>
          </div>

          <div className="onboarding-controls" style={{ marginTop: 28 }}>
            <span className="muted" style={{ fontSize: 12 }}>
              New here?{" "}
              <Link href="/onboarding" className="text-link">
                Create a workspace
              </Link>
            </span>
          </div>
        </Card>
      </main>
    </div>
  );
}

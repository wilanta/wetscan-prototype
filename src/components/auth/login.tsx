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
        <Link href="/onboarding">Start for Free</Link>
      </header>
      <main id="main" className="onboarding-layout">
        <aside>
          <h1>Welcome back.</h1>
          <p>
            Sign in with GitHub to resume your workspace. Your completed
            onboarding is saved.
          </p>
        </aside>
        <Card className="onboarding-card">
          <h2>Sign in to WetScan</h2>
          <p>Use the GitHub account connected to your workspace.</p>
          {error && <p role="alert">{error}</p>}
          <Button onClick={login} disabled={busy}>
            <GitBranch size={18} />
            {busy ? "Redirecting to GitHub..." : "Continue with GitHub"}
          </Button>
          <p>
            New here?{" "}
            <Link href="/onboarding" className="text-link">
              Create a workspace
            </Link>
          </p>
        </Card>
      </main>
    </div>
  );
}

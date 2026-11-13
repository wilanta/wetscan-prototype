"use client";
import Link from "next/link";
import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  GitBranch,
  LockKeyhole,
  ShieldCheck,
} from "lucide-react";
import { Logo } from "@/components/logo";
import { useDemo, toast } from "@/components/demo-provider";
import { Badge, Button, Card, Notice } from "@/components/ui";
import { PROJECT } from "@/data/demo";
import { repositories } from "@/services/adapters";
export default function Onboarding() {
  const { dispatch } = useDemo();
  const [step, setStep] = useState(0);
  const [provider, setProvider] = useState<"github" | "gitlab">("github");
  const [consent, setConsent] = useState(false);
  const [repo, setRepo] = useState("northstar-studio/orderly-demo");
  const [repoList, setRepoList] = useState<{ name: string; branch: string }[]>(
    [],
  );
  const [name, setName] = useState("Orderly Demo");
  const [branch, setBranch] = useState("main");
  const steps = [
    "Choose source",
    "Review access",
    "Choose repository",
    "Set your project",
    "Ready to explore",
  ];
  async function next() {
    if (step === 1) {
      setRepoList(await repositories.listRepositories(provider));
    }
    if (step === 3) {
      dispatch({ type: "project", name: name.trim(), provider, branch });
      toast.success(
        "Demo project configured. No real repository access was granted.",
      );
    }
    setStep(step + 1);
  }
  return (
    <div className="onboarding">
      <header className="landing-nav">
        <Link href="/" aria-label="WetScan home">
          <Logo />
        </Link>
        <Link className="text-link" href="/demo">
          Skip and explore demo <ArrowRight size={15} />
        </Link>
      </header>
      <main id="main" className="onboarding-layout">
        <aside>
          <Badge tone="blue">A FRIENDLIER FIRST STEP</Badge>
          <h1>
            A clear view starts
            <br />
            with your code.
          </h1>
          <p>
            Choose a demo source, understand the permissions, and get to know
            your application.
          </p>
          <ol className="onboarding-steps">
            {steps.map((label, i) => (
              <li
                key={label}
                className={i === step ? "current" : i < step ? "complete" : ""}
              >
                <span>{i < step ? <Check size={16} /> : i + 1}</span>
                {label}
              </li>
            ))}
          </ol>
          <div className="onboarding-boundary">
            <ShieldCheck size={20} />
            <p>
              This is a local prototype.
              <br />
              No OAuth, credentials, or real repository access.
            </p>
          </div>
        </aside>
        <Card className="onboarding-card">
          <span className="eyebrow">STEP {step + 1} OF 5</span>
          <h2>{steps[step]}</h2>
          {step === 0 && (
            <>
              <p>
                Only the code you choose. Start with a sample repository from
                one of our supported source providers.
              </p>
              <div className="provider-options">
                {(["github", "gitlab"] as const).map((p) => (
                  <button
                    className={provider === p ? "selected" : ""}
                    key={p}
                    onClick={() => setProvider(p)}
                  >
                    <GitBranch size={30} />
                    <strong>{p === "github" ? "GitHub" : "GitLab"}</strong>
                    <span>Explore demo repositories</span>
                    {provider === p && <CheckCircle2 size={18} />}
                  </button>
                ))}
              </div>
              <Notice>
                Demo connections only. You won’t be redirected to a provider or
                asked to authorize this prototype.
              </Notice>
            </>
          )}
          {step === 1 && (
            <>
              <p>
                A production {provider === "github" ? "GitHub" : "GitLab"}{" "}
                integration will request narrowly scoped read-only access.
              </p>
              <div className="permissions-list">
                <p>
                  <CheckCircle2 size={18} />
                  Read selected repository contents
                </p>
                <p>
                  <CheckCircle2 size={18} />
                  Read repository metadata and branch details
                </p>
                <p>
                  <LockKeyhole size={18} />
                  No write permissions by default
                </p>
              </div>
              <details>
                <summary>What would real setup require?</summary>
                <p>
                  A server-side provider integration, explicit owner approval,
                  secure secret storage, and an auditable repository grant. None
                  are configured here.
                </p>
              </details>
              <label className="check-line">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                />
                I understand this is a demo connection, with no OAuth success
                implied.
              </label>
            </>
          )}
          {step === 2 && (
            <>
              <p>
                These fictional repositories come from the local demo adapter.
              </p>
              <div className="repository-options">
                {repoList.map((r) => (
                  <label key={r.name}>
                    <input
                      type="radio"
                      name="repository"
                      checked={repo === r.name}
                      onChange={() => {
                        setRepo(r.name);
                        setBranch(r.branch);
                      }}
                    />
                    <div>
                      <strong>{r.name}</strong>
                      <small>
                        {r.branch} · TypeScript · synthetic repository
                      </small>
                    </div>
                    <Badge tone="blue">Demo</Badge>
                  </label>
                ))}
              </div>
            </>
          )}
          {step === 3 && (
            <>
              <p>
                Give the sample project a familiar name. You can configure a
                separately authorized staging target later in Integrations.
              </p>
              <label className="field">
                Project name
                <input
                  maxLength={50}
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <label className="field">
                Main branch
                <input
                  required
                  maxLength={60}
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                />
              </label>
              <Notice>
                The selected sample ({repo}) maps to the same deterministic
                Orderly architecture. Renaming does not discover a new app.
              </Notice>
            </>
          )}
          {step === 4 && (
            <div className="onboarding-success">
              <span className="big-feature-icon green">
                <CheckCircle2 size={40} />
              </span>
              <h3>You’re ready to connect the dots.</h3>
              <p>
                Start with Orders API on the Canvas. Follow its finding to
                understand the evidence and your next step.
              </p>
              <Badge tone="blue">{provider} · Demo connection</Badge>
              <Link className="button primary large" href={`${PROJECT}/canvas`}>
                Explore your application map <ArrowRight size={18} />
              </Link>
            </div>
          )}
          {step < 4 && (
            <div className="onboarding-controls">
              <Button
                variant="ghost"
                disabled={step === 0}
                onClick={() => setStep(step - 1)}
              >
                <ArrowLeft size={15} />
                Back
              </Button>
              <Button
                onClick={next}
                disabled={
                  (step === 1 && !consent) ||
                  (step === 3 && (!name.trim() || !branch.trim()))
                }
              >
                {step === 1
                  ? "Explore demo repositories"
                  : step === 3
                    ? "Create demo project"
                    : "Continue"}
                <ArrowRight size={16} />
              </Button>
            </div>
          )}
        </Card>
      </main>
    </div>
  );
}

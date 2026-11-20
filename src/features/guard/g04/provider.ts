import type { Decision } from "./policy";

/**
 * Provider-neutral deployment seam. An interface existing does NOT mean a provider works: only "vercel" has an adapter,
 * and each future provider (Netlify, Railway, GCP, AWS, Azure, VPS) needs its own credentials, positive and negative tests.
 */
export type ProviderId = "vercel";
export type ProviderErrorKind = "not_configured" | "unauthorized" | "permission_denied" | "not_found" | "rate_limited" | "unavailable" | "unsupported" | "invalid_response";
export class ProviderError extends Error {
  constructor(
    readonly kind: ProviderErrorKind,
    readonly retryAfterMs?: number,
  ) {
    super(kind);
  }
}
export interface DeploymentInfo {
  provider: ProviderId;
  deploymentId: string;
  projectId: string;
  url: string | null;
  /** Provider lifecycle state, upper-case as reported. */
  state: string;
  environment: "production" | "preview" | "staging" | "other";
  commit: string | null;
  branch: string | null;
  repositoryId: string | null;
  createdAt: number | null;
  /** Provider-reported: has this deployment been aliased/promoted to its production domains? null = not reported. */
  promoted: boolean | null;
  checks: { state: string | null; conclusion: string | null };
}
export interface GateRegistration {
  /** Is Guard's check registered as a REQUIRED deployment check on the mapped project (read from the provider)? */
  registered: boolean;
  blocks: string | null;
  targets: string[];
  providerCheckId: string | null;
}
export interface DeploymentProvider {
  readonly id: ProviderId;
  /** Read-only: token valid, project reachable, and which identity the token resolves to. */
  verifyConnection(): Promise<{ projectId: string; projectName: string | null; teamId: string | null; framework: string | null; linkedRepositoryId: string | null }>;
  getDeployment(idOrUrl: string): Promise<DeploymentInfo>;
  latestDeployments(opts: { target?: "production" | "preview"; limit: number }): Promise<DeploymentInfo[]>;
  /** Read-only observation of whether Guard's gate is a required deployment check. */
  observeGate(checkName: string): Promise<GateRegistration>;
  /** Write: registers the gate. Only ever called after explicit owner approval; never automatically. */
  registerGate(input: { checkName: string; blocks: "deployment-alias" | "deployment-promotion"; targets: string[] }): Promise<GateRegistration>;
}

export type EnforcementLevel =
  | "NONE"
  | "CHECK_PUBLISHED_NOT_REQUIRED"
  | "MERGE_RULE_OBSERVED"
  | "DEPLOYMENT_GATE_REGISTERED"
  | "PROMOTION_HELD_OBSERVED"
  | "PROMOTION_RELEASED_OBSERVED";
export interface EnforcementInput {
  decision: Decision;
  commit: string;
  github: { checkPublished: boolean; requiredCheckObserved: boolean | null };
  deployment: { info: DeploymentInfo; gate: GateRegistration | null; latestCommitOnBranch?: string | null } | null;
  providerError?: ProviderErrorKind | null;
}
export interface EnforcementReport {
  /** Always the policy decision; never rewritten by enforcement. */
  decision: Decision;
  /** `true` ONLY with provider/repository evidence that the gate actually acted. A local policy result is never "enforced". */
  enforced: boolean;
  level: EnforcementLevel;
  /** The separate claims, never conflated: merge, production promotion, and build/deployment creation. */
  claims: { githubMerge: "NOT_VERIFIED" | "RULE_OBSERVED"; vercelPromotion: "NOT_VERIFIED" | "GATE_REGISTERED" | "HELD_OBSERVED" | "RELEASED_OBSERVED" | "UNAVAILABLE"; deploymentCreation: "NOT_CLAIMED" };
  stale: boolean;
  wrongCommit: boolean;
  notes: string[];
}
/**
 * Pure and conservative. Policy decisions stay separate from enforcement evidence:
 *  - "held" needs the provider to report a production deployment of THIS commit that is READY, not promoted, and whose checks
 *    did not succeed, while a gate is registered. Anything weaker is only "registered".
 *  - A deployment of another commit, or a provider error, can never yield enforced=true.
 *  - Deployment CREATION/build is never claimed: a Guard check only holds the later promotion step.
 */
export function assessEnforcement(i: EnforcementInput): EnforcementReport {
  const notes: string[] = [];
  const claims: EnforcementReport["claims"] = { githubMerge: i.github.requiredCheckObserved ? "RULE_OBSERVED" : "NOT_VERIFIED", vercelPromotion: "NOT_VERIFIED", deploymentCreation: "NOT_CLAIMED" };
  let level: EnforcementLevel = i.github.checkPublished ? "CHECK_PUBLISHED_NOT_REQUIRED" : "NONE";
  let enforced = false;
  if (i.github.requiredCheckObserved) level = "MERGE_RULE_OBSERVED";
  else if (i.github.checkPublished) notes.push("A published check is not a required branch rule; no merge enforcement was observed.");
  const d = i.deployment?.info,
    wrongCommit = !!d && d.commit !== null && d.commit !== i.commit,
    stale = !!d && !!i.deployment?.latestCommitOnBranch && i.deployment.latestCommitOnBranch !== d.commit;
  if (i.providerError) {
    claims.vercelPromotion = "UNAVAILABLE";
    notes.push("Provider state is unavailable (" + i.providerError + "); no enforcement is claimed and nothing is released by this.");
  } else if (!d) notes.push("No deployment evidence for this commit.");
  else if (wrongCommit) notes.push("The deployment is for a different commit than the evaluated one; it is not evidence for this decision.");
  else if (d.commit === null) notes.push("The provider did not report a commit for this deployment; it cannot be tied to the decision.");
  else if (stale) notes.push("A newer commit exists on the branch; this evaluation does not release the newer deployment.");
  else {
    const gate = i.deployment?.gate;
    if (gate?.registered) {
      claims.vercelPromotion = "GATE_REGISTERED";
      if (!["DEPLOYMENT_GATE_REGISTERED"].includes(level) && level !== "MERGE_RULE_OBSERVED") level = "DEPLOYMENT_GATE_REGISTERED";
      const failing = d.checks.state === "completed" && d.checks.conclusion !== "succeeded";
      if (d.environment === "production" && d.state === "READY" && d.promoted === false && (failing || d.checks.state !== "completed") && i.decision !== "PASS") {
        claims.vercelPromotion = "HELD_OBSERVED";
        level = "PROMOTION_HELD_OBSERVED";
        enforced = true;
      } else if (d.environment === "production" && d.promoted === true) {
        claims.vercelPromotion = "RELEASED_OBSERVED";
        level = "PROMOTION_RELEASED_OBSERVED";
        // A promoted deployment under a non-PASS decision is a policy/provider mismatch that must be visible, not hidden.
        if (i.decision !== "PASS" && i.decision !== "WARN") notes.push("MISMATCH: the deployment was promoted although the decision is " + i.decision + ".");
      } else notes.push("A gate is registered, but the provider has not (yet) shown a held or released production deployment for this commit.");
    } else notes.push("Guard's check is not registered as a required Deployment Check on the mapped project; the provider will not hold a deployment for it.");
    if (d.environment !== "production") notes.push("Preview deployments are not production promotion: only production deployments are held by Deployment Checks.");
  }
  return { decision: i.decision, enforced, level, claims, stale, wrongCommit, notes };
}

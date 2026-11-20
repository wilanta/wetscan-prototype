import "server-only";
import { createHash } from "node:crypto";
import type { PlatformDatabase } from "../../../platform/database";
import { LiveGuardError, type ProjectAuthority, type StoredScan } from "../live/model";
import { PostgresGuardStore } from "../live/persistence";
import { repositoryScanKind } from "../live/product-policy";
import { repositoryProfiles } from "../live/scan-profiles";
import { githubSourceAccess } from "../live/github-source";
import { GhError, revokeToken, type GhTransport, type InstallationTokens } from "./github";
import { gateEngines } from "./policy";
import type { AccessReport, ScanPort } from "./service";
import type { PolicyRecord, TriggerRecord } from "./store";

/** The stored owner identity, never a browser session. Re-verified against GitHub on every use (see verifyAccess). */
export function automationAuthority(rec: PolicyRecord, branch: string): ProjectAuthority {
  const issuedAt = Date.now();
  return {
    grant: { mode: "live", workspaceId: rec.workspaceId, projectId: rec.projectId, actorId: rec.ownerActor, operations: ["read", "scan"], issuedAt, expiresAt: issuedAt + 60_000 },
    repositoryId: rec.repositoryId,
    repositoryName: rec.repositoryName,
    branch,
    installationId: rec.installationId,
    userId: rec.ownerUserId,
  };
}
export const scanEngines = (rec: PolicyRecord) => repositoryProfiles[rec.policy.scanProfile].filter((e) => (gateEngines as readonly string[]).includes(e));
/** G02 requires `g02-live-` keys. The key binds commit, branch, profile, engines and the deliberate-rerun number. */
export const scanIdempotencyKey = (rec: PolicyRecord, t: Pick<TriggerRecord, "commit" | "branch">, rerun: number) =>
  "g02-live-g04-" + createHash("sha256").update(JSON.stringify([rec.projectId, t.commit, t.branch, rec.policy.scanProfile, scanEngines(rec), rerun])).digest("hex").slice(0, 40);

export interface G02Deps {
  transport: GhTransport;
  tokens: InstallationTokens;
  /** App-role database used only to READ stored G02 scans through the existing scoped store. */
  db: PlatformDatabase;
  /** Builds the qualified G02 product service for this authority/source (see productHostService's automationSource seam). */
  service(authority: ProjectAuthority, source: ReturnType<typeof githubSourceAccess> extends infer S ? (branch: string, commit: string) => S : never): Promise<{ create(a: ProjectAuthority, input: unknown, signal: AbortSignal): Promise<{ scanId: string }> }>;
}
export class G02ScanPort implements ScanPort {
  constructor(private readonly d: G02Deps) {}
  async verifyAccess(rec: PolicyRecord): Promise<AccessReport> {
    const none = { contents: false, metadata: false, checks: false };
    if (rec.installationState !== "active") return { ok: false, reason: "installation_suspended", permissions: none };
    try {
      const a = await this.d.tokens(rec.installationId, rec.repositoryId, { contents: "read", metadata: "read", checks: "write" });
      try {
        const repo = (await this.d.transport("GET", `/repositories/${rec.repositoryId}`, a.token)).json as { id?: number; full_name?: string } | null;
        if (String(repo?.id) !== rec.repositoryId || repo?.full_name !== rec.repositoryName) return { ok: false, reason: "repository_not_accessible", permissions: none };
        const permissions = { contents: ["read", "write"].includes(a.permissions.contents), metadata: ["read", "write"].includes(a.permissions.metadata), checks: a.permissions.checks === "write" };
        return permissions.contents && permissions.metadata ? { ok: true, permissions } : { ok: false, reason: "permissions_missing", permissions };
      } finally {
        await revokeToken(this.d.transport, a.token);
      }
    } catch (e) {
      if (!(e instanceof GhError)) return { ok: false, reason: "unavailable", permissions: none };
      if (e.kind === "permission_denied") return { ok: false, reason: "permissions_missing", permissions: none };
      if (e.kind === "not_found" || e.kind === "unauthorized") return { ok: false, reason: "repository_not_accessible", permissions: none };
      if (e.kind === "rate_limited") return { ok: false, reason: "rate_limited", permissions: none, retryAfterMs: e.retryAfterMs };
      return { ok: false, reason: "unavailable", permissions: none };
    }
  }
  async branchHead(rec: PolicyRecord, branch: string): Promise<string> {
    const a = await this.d.tokens(rec.installationId, rec.repositoryId, { contents: "read", metadata: "read" });
    try {
      const j = (await this.d.transport("GET", `/repos/${rec.repositoryName}/branches/${encodeURIComponent(branch)}`, a.token)).json as { name?: string; commit?: { sha?: string } } | null;
      if (j?.name !== branch || !/^[a-f0-9]{40}$/.test(j.commit?.sha ?? "")) throw new GhError("unavailable", 502);
      return j.commit!.sha!;
    } finally {
      await revokeToken(this.d.transport, a.token);
    }
  }
  async ensureScan(rec: PolicyRecord, t: TriggerRecord, rerun: number) {
    const authority = automationAuthority(rec, t.branch);
    const source = (branch: string, commit: string) =>
      githubSourceAccess(undefined, rec.projectId, { branch, commit }, async () => {
        const access = await this.verifyAccess(rec);
        if (!access.ok || !access.permissions.contents) throw new LiveGuardError("not_found", 404);
        return automationAuthority(rec, branch);
      });
    const svc = await this.d.service(authority, source);
    const out = await svc.create(authority, { profile: rec.policy.scanProfile, engines: scanEngines(rec), branch: t.branch, commit: t.commit, idempotencyKey: scanIdempotencyKey(rec, t, rerun) }, AbortSignal.timeout(120_000));
    return { scanId: out.scanId };
  }
  async readScan(rec: PolicyRecord, scanId: string): Promise<StoredScan | null> {
    const g = automationAuthority(rec, rec.policy.protectedBranches[0] ?? "main").grant;
    return new PostgresGuardStore(this.d.db, repositoryScanKind).get(g, g, scanId);
  }
}

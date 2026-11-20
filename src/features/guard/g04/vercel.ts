import { readFile } from "node:fs/promises";
import { isAbsolute, basename } from "node:path";
import { ProviderError, type DeploymentInfo, type DeploymentProvider, type GateRegistration } from "./provider";

const ORIGIN = "https://api.vercel.com";
const idPattern = /^[A-Za-z0-9_-]{1,128}$/;
export interface VercelMapping {
  /** Vercel project id (prj_…); a name is accepted by the API but an id is the stable identity. */
  projectId: string;
  /** Vercel team id (team_…) when the project lives in a team. */
  teamId?: string;
  /** GitHub repository id this Vercel project must be linked to. Mismatch = refuse. */
  repositoryId: string;
}
export type VercelFetch = (url: string, init: { method: string; headers: Record<string, string>; body?: string; signal: AbortSignal; redirect: "error"; cache: "no-store" }) => Promise<Response>;

/** Token comes from the process environment or a private file, never from the database or request. */
export async function vercelToken(env: NodeJS.ProcessEnv = process.env): Promise<string> {
  let t = env.GUARD_VERCEL_TOKEN;
  const file = env.GUARD_VERCEL_TOKEN_FILE;
  if (!t && file) {
    if (!isAbsolute(file) || /\.env(?:\.|$)/i.test(basename(file))) throw new ProviderError("not_configured");
    t = (await readFile(file, "utf8").catch(() => "")).trim();
  }
  if (!t || !/^[A-Za-z0-9_.-]{16,512}$/.test(t)) throw new ProviderError("not_configured");
  return t;
}
const rec = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : (() => { throw new ProviderError("invalid_response"); })());
const str = (v: unknown) => (typeof v === "string" && v ? v : null);

export function vercelProvider(mapping: VercelMapping, token: () => Promise<string>, fetcher: VercelFetch = fetch as unknown as VercelFetch): DeploymentProvider {
  if (!idPattern.test(mapping.projectId) || (mapping.teamId && !idPattern.test(mapping.teamId)) || !/^[1-9]\d{0,15}$/.test(mapping.repositoryId)) throw new ProviderError("not_configured");
  const q = (extra: Record<string, string> = {}) => {
    const p = new URLSearchParams(extra);
    if (mapping.teamId) p.set("teamId", mapping.teamId);
    const s = p.toString();
    return s ? "?" + s : "";
  };
  async function call(method: "GET" | "POST", path: string, body?: unknown): Promise<unknown> {
    let res: Response;
    try {
      res = await fetcher(ORIGIN + path, { method, headers: { Authorization: "Bearer " + (await token()), "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15000), redirect: "error", cache: "no-store" });
    } catch (e) {
      if (e instanceof ProviderError) throw e;
      throw new ProviderError("unavailable");
    }
    if (res.status === 401) throw new ProviderError("unauthorized");
    if (res.status === 403) throw new ProviderError("permission_denied");
    if (res.status === 404 || res.status === 410) throw new ProviderError("not_found");
    if (res.status === 429) throw new ProviderError("rate_limited", Math.min(3600000, (Number(res.headers.get("retry-after")) || 60) * 1000));
    if (!res.ok) throw new ProviderError(res.status >= 500 ? "unavailable" : "invalid_response");
    const text = await res.text();
    if (text.length > 2_000_000) throw new ProviderError("invalid_response");
    try {
      return text ? JSON.parse(text) : {};
    } catch {
      throw new ProviderError("invalid_response");
    }
  }
  function info(raw: unknown): DeploymentInfo {
    const d = rec(raw),
      git = d.gitSource ? rec(d.gitSource) : {},
      meta = d.meta ? rec(d.meta) : {};
    const commit = str(git.sha) ?? str(meta.githubCommitSha),
      repo = git.repoId !== undefined ? String(git.repoId) : str(meta.githubRepoId ?? meta.githubRepositoryId),
      target = d.target === "production" ? "production" : d.target === "staging" ? "staging" : d.target === null || d.target === undefined ? "preview" : "other";
    if (!str(d.id) || !str(d.readyState ?? d.status) || (commit && !/^[a-f0-9]{40}$/.test(commit))) throw new ProviderError("invalid_response");
    const sub = str(d.readySubstate);
    return {
      provider: "vercel",
      deploymentId: d.id as string,
      projectId: str(d.projectId) ?? mapping.projectId,
      url: str(d.url),
      state: String(d.readyState ?? d.status).toUpperCase(),
      environment: target,
      commit,
      branch: str(git.ref) ?? str(meta.githubCommitRef),
      repositoryId: repo,
      createdAt: typeof d.createdAt === "number" ? d.createdAt : null,
      promoted: sub ? sub === "PROMOTED" || sub === "ROLLING" : typeof d.aliasAssigned === "boolean" ? d.aliasAssigned : null,
      checks: { state: str(d.checksState), conclusion: str(d.checksConclusion) },
    };
  }
  /** Identity gate: a deployment of another project, or of a repository other than the mapped one, is never accepted. */
  const own = (d: DeploymentInfo) => {
    if (d.projectId !== mapping.projectId || (d.repositoryId !== null && d.repositoryId !== mapping.repositoryId)) throw new ProviderError("not_found");
    return d;
  };
  const gateFrom = (checks: unknown[], name: string): GateRegistration => {
    const c = checks.map(rec).find((c) => c.name === name && !c.deletedAt);
    return c ? { registered: true, blocks: str(c.blocks), targets: Array.isArray(c.targets) ? c.targets.filter((t): t is string => typeof t === "string") : [], providerCheckId: str(c.id) } : { registered: false, blocks: null, targets: [], providerCheckId: null };
  };
  return {
    id: "vercel",
    async verifyConnection() {
      const p = rec(await call("GET", `/v9/projects/${encodeURIComponent(mapping.projectId)}${q()}`)),
        link = p.link ? rec(p.link) : {};
      const repo = link.repoId !== undefined ? String(link.repoId) : null;
      if (str(p.id) !== mapping.projectId) throw new ProviderError("not_found");
      if (repo !== null && repo !== mapping.repositoryId) throw new ProviderError("permission_denied"); // linked to a different repository
      return { projectId: mapping.projectId, projectName: str(p.name), teamId: mapping.teamId ?? null, framework: str(p.framework), linkedRepositoryId: repo };
    },
    async getDeployment(idOrUrl) {
      if (!/^[A-Za-z0-9_.-]{1,255}$/.test(idOrUrl)) throw new ProviderError("not_found");
      return own(info(await call("GET", `/v13/deployments/${encodeURIComponent(idOrUrl)}${q({ withGitRepoInfo: "true" })}`)));
    },
    async latestDeployments({ target, limit }) {
      const r = rec(await call("GET", `/v6/deployments${q({ projectId: mapping.projectId, limit: String(Math.min(Math.max(limit, 1), 20)), ...(target ? { target } : {}) })}`));
      return (Array.isArray(r.deployments) ? r.deployments : []).slice(0, 20).map((d) => {
        // The list endpoint has a reduced shape (meta only): same parser, same identity gate.
        const x = rec(d);
        return own(info({ ...x, id: x.uid ?? x.id, readyState: x.readyState ?? x.state }));
      });
    },
    async observeGate(name) {
      const r = rec(await call("GET", `/v2/projects/${encodeURIComponent(mapping.projectId)}/checks${q()}`));
      return gateFrom(Array.isArray(r.checks) ? r.checks : Array.isArray(r) ? (r as unknown[]) : [], name);
    },
    async registerGate({ checkName, blocks, targets }) {
      // GitHub-backed Deployment Check: Vercel imports the named GitHub check run as a condition for promotion/aliasing.
      const c = rec(await call("POST", `/v2/projects/${encodeURIComponent(mapping.projectId)}/checks${q()}`, { name: checkName, requires: "none", blocks, targets, isRerequestable: false, source: { kind: "git-provider", provider: "github", externalCheckName: checkName } }));
      return gateFrom([c], checkName);
    },
  };
}

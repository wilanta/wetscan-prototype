import "server-only";
import { createHash } from "node:crypto";
import { AuthError, githubConfig } from "@/lib/auth/config";
import {
  appJwt,
  userToken,
  verifyAppInstallation,
  verifyIdentity,
} from "@/lib/auth/github";
import { getSession, profileFor, saveSession } from "@/lib/auth/session";
import { exclusive } from "@/lib/auth/store";
import type { Profile, Session } from "@/lib/auth/types";
import type {
  AuthorizedRepositorySnapshotReader,
  RepositorySnapshot,
  SnapshotEntry,
} from "../contracts";
import type { AnalysisDiagnostic } from "../types";
import { limits, redactEnvironmentNames, safePath } from "../discovery/safety";
import { sourceRequest, revokeSourceToken } from "./github-api";

const shaPattern = /^[a-f0-9]{40}$/;
export function workspaceScope(profile: Profile) {
  return `github-user-${profile.githubId}:${profile.workspace}`;
}
export async function canvasIdentity(token?: string) {
  const session = await getSession(token);
  const profile = await profileFor(session);
  if (!session || !profile || profile.githubId !== session.githubId)
    throw new AuthError("unauthenticated", 401);
  if (!profile.completedAt || !profile.workspace || !profile.installationId)
    throw new AuthError("onboarding_incomplete", 403);
  return { session, profile };
}
type Repo = { id: number; full_name: string; default_branch: string };
function validateRepo(value: Repo, id: number) {
  if (
    !value ||
    value.id !== id ||
    !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value.full_name) ||
    typeof value.default_branch !== "string" ||
    !value.default_branch ||
    value.default_branch.length > 255 ||
    /[\x00-\x1f]/.test(value.default_branch)
  )
    throw new AuthError("repository_denied", 403);
  return value;
}
async function currentUserAccess(
  session: Session,
  installationId: number,
  repositoryId: number,
  signal: AbortSignal,
) {
  // App JWT alone never grants user access. Bound installation enumeration.
  await verifyIdentity(session);
  const token = await userToken(session);
  for (let page = 1; page <= 20; page++) {
    const data = await sourceRequest<{
      installations: {
        id: number;
        app_id: number;
        suspended_at: string | null;
      }[];
    }>(`/user/installations?per_page=100&page=${page}`, token, signal);
    if (
      !data ||
      !Array.isArray(data.installations) ||
      data.installations.length > 100
    )
      throw new AuthError("github_response", 502);
    if (
      data.installations.some(
        (i) =>
          i &&
          i.id === installationId &&
          String(i.app_id) === githubConfig().id &&
          i.suspended_at === null,
      )
    )
      return validateRepo(
        await sourceRequest<Repo>(
          `/repositories/${repositoryId}`,
          token,
          signal,
        ),
        repositoryId,
      );
    if (data.installations.length < 100) break;
  }
  throw new AuthError("installation_denied", 403);
}

// No private graph/source cache. Bound concurrent jobs without retaining account data.
const running = new Set<string>();
export class GitHubRepositorySnapshotReader implements AuthorizedRepositorySnapshotReader {
  constructor(private readonly sessionToken?: string) {}
  async getSnapshot(input: {
    authenticatedWorkspaceId: string;
    projectId: string;
    revision?: string;
  }): Promise<RepositorySnapshot> {
    const match = /^github-([1-9]\d{0,15})$/.exec(input.projectId);
    const repositoryId = Number(match?.[1]);
    if (!match || !Number.isSafeInteger(repositoryId))
      throw new AuthError("repository_denied", 403);
    if (input.revision !== undefined && !shaPattern.test(input.revision))
      throw new AuthError("invalid_revision", 400);
    const lock = createHash("sha256")
      .update(this.sessionToken ?? "")
      .digest("hex");
    if (running.has(lock) || running.size >= 4)
      throw new AuthError("source_busy", 429);
    running.add(lock);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 45000);
    const signal = controller.signal;
    let installationToken: string | undefined;
    try {
      const selected = (profile: Profile) => {
        if (
          workspaceScope(profile) !== input.authenticatedWorkspaceId ||
          !profile.repositories.some((r) => r.id === repositoryId)
        )
          throw new AuthError("repository_denied", 403);
      };
      const { profile, repo } = await exclusive(async () => {
        const { session, profile } = await canvasIdentity(this.sessionToken);
        selected(profile);
        await verifyAppInstallation(profile.installationId!);
        const repo = await currentUserAccess(
          session,
          profile.installationId!,
          repositoryId,
          signal,
        );
        // Keep existing refresh-token rotation in the existing encrypted session store.
        await saveSession(this.sessionToken!, session);
        return { profile, repo };
      });
      const grant = await sourceRequest<{ token: string; expires_at: string }>(
        `/app/installations/${profile.installationId}/access_tokens`,
        appJwt(),
        signal,
        16000,
        {
          repository_ids: [repositoryId],
          permissions: { metadata: "read", contents: "read" },
        },
      );
      if (typeof grant?.token === "string" && grant.token)
        installationToken = grant.token;
      if (
        !installationToken ||
        !Number.isFinite(Date.parse(grant.expires_at)) ||
        Date.parse(grant.expires_at) <= Date.now()
      )
        throw new AuthError("github_response", 502);
      const allowed = validateRepo(
        await sourceRequest<Repo>(
          `/repositories/${repositoryId}`,
          installationToken,
          signal,
        ),
        repositoryId,
      );
      if (allowed.full_name !== repo.full_name)
        throw new AuthError("repository_denied", 403);
      const base = `/repos/${allowed.full_name}`;
      const branch = allowed.default_branch;
      const commit = await sourceRequest<{
        sha: string;
        commit: { tree: { sha: string } };
      }>(
        `${base}/commits/${encodeURIComponent(branch)}`,
        installationToken,
        signal,
      );
      if (
        !shaPattern.test(commit?.sha) ||
        !shaPattern.test(commit?.commit?.tree?.sha)
      )
        throw new AuthError("github_response", 502);
      if (input.revision && input.revision !== commit.sha)
        throw new AuthError("stale_revision", 409);
      const treeSha = commit.commit.tree.sha;
      const tree = await sourceRequest<{
        sha: string;
        truncated: boolean;
        tree: {
          path: string;
          mode: string;
          type: string;
          size?: number;
          sha: string;
        }[];
      }>(
        `${base}/git/trees/${treeSha}?recursive=1`,
        installationToken,
        signal,
        12_000_000,
      );
      if (
        tree?.sha !== treeSha ||
        typeof tree.truncated !== "boolean" ||
        !Array.isArray(tree.tree) ||
        tree.tree.length > 100000
      )
        throw new AuthError("github_response", 502);
      const diagnostics: AnalysisDiagnostic[] = [];
      const warn = (code: string, message: string) => {
        if (!diagnostics.some((d) => d.code === code))
          diagnostics.push({ code, severity: "warning", message });
      };
      if (tree.truncated)
        warn(
          "github_tree_truncated",
          "GitHub truncated the recursive tree. This map covers only returned source; coverage is partial.",
        );
      const entries: (SnapshotEntry & { sha: string })[] = [];
      const paths = new Set<string>();
      let bytes = 0;
      // Deterministic priority: architecture manifests/configuration before ordinary source.
      const priority = (path: string) =>
        /(?:^|\/)(?:package.json|tsconfig.json|schema.prisma|Dockerfile)$/.test(
          path,
        )
          ? 0
          : /(?:^|\/)(?:app|pages)\//.test(path)
            ? 1
            : 2;
      for (const item of tree.tree) {
        if (
          !item ||
          typeof item.path !== "string" ||
          !shaPattern.test(item.sha) ||
          !["tree", "blob", "commit"].includes(item.type) ||
          !["040000", "100644", "100755", "120000", "160000"].includes(
            item.mode,
          )
        )
          throw new AuthError("github_response", 502);
        if (paths.has(item.path)) throw new AuthError("github_response", 502);
        paths.add(item.path);
      }
      const candidates = tree.tree
        .filter(
          (i) =>
            i.type === "blob" &&
            ["100644", "100755"].includes(i.mode) &&
            safePath(i.path) &&
            i.path.split("/").length <= limits.maxDepth,
        )
        .sort(
          (a, b) =>
            priority(a.path) - priority(b.path) || a.path.localeCompare(b.path),
        );
      if (
        candidates.length !== tree.tree.filter((i) => i.type !== "tree").length
      )
        warn(
          "github_excluded_paths",
          "Unsupported, unsafe, deep, symlink and submodule paths were excluded; no code was executed.",
        );
      for (const item of candidates) {
        if (!Number.isSafeInteger(item.size) || item.size! < 0)
          throw new AuthError("github_response", 502);
        if (
          entries.length >= 200 ||
          item.size! > limits.maxFileBytes ||
          bytes + item.size! > limits.maxTotalBytes
        ) {
          warn(
            "github_snapshot_limit",
            "Source retrieval reached its 200-file, 256 KB/file or 8 MB total limit. Coverage is partial.",
          );
          continue;
        }
        bytes += item.size!;
        entries.push({ path: item.path, size: item.size!, sha: item.sha });
      }
      const texts = new Map<string, string>();
      let next = 0;
      let fatal: unknown;
      await Promise.all(
        Array.from({ length: Math.min(4, entries.length) }, async () => {
          for (;;) {
            if (fatal) return;
            const entry = entries[next++];
            if (!entry) return;
            try {
              const blob = await sourceRequest<{
                sha: string;
                encoding: string;
                size: number;
                content: string;
              }>(
                `${base}/git/blobs/${entry.sha}`,
                installationToken!,
                signal,
                400_000,
              );
              if (
                blob?.sha !== entry.sha ||
                blob.encoding !== "base64" ||
                blob.size !== entry.size ||
                typeof blob.content !== "string"
              )
                throw new AuthError("github_response", 502);
              const encoded = blob.content.replace(/\n/g, "");
              const buffer = Buffer.from(encoded, "base64");
              if (buffer.toString("base64") !== encoded)
                throw new AuthError("github_response", 502);
              const hash = createHash("sha1")
                .update(`blob ${buffer.length}\0`)
                .update(buffer)
                .digest("hex");
              if (buffer.length !== entry.size || hash !== entry.sha)
                throw new AuthError("source_integrity", 502);
              try {
                const text = new TextDecoder("utf-8", { fatal: true }).decode(
                  buffer,
                );
                if (text.includes("\0")) throw new Error("binary");
                texts.set(
                  entry.path,
                  entry.path.endsWith(".env.example")
                    ? redactEnvironmentNames(text)
                    : text,
                );
              } catch {
                warn(
                  "github_binary_excluded",
                  "Binary or invalid UTF-8 files were excluded. Coverage is partial.",
                );
              }
            } catch (error) {
              if (
                error instanceof AuthError &&
                ["source_timeout", "github_rate_limited"].includes(error.code)
              ) {
                warn(
                  "github_read_partial",
                  "GitHub retrieval timed out or hit an API limit. Unread files are omitted; retry later.",
                );
                return;
              }
              fatal = error;
            }
          }
        }),
      );
      if (fatal) throw fatal;
      if (!texts.size && entries.length)
        throw new AuthError("source_unavailable", 502);
      // Recheck local revocation/logout and provider grants before releasing private output.
      await exclusive(async () => {
        const current = await canvasIdentity(this.sessionToken);
        selected(current.profile);
        if (current.profile.installationId !== profile.installationId)
          throw new AuthError("repository_denied", 403);
        await verifyAppInstallation(profile.installationId!);
        await currentUserAccess(
          current.session,
          profile.installationId!,
          repositoryId,
          AbortSignal.timeout(15000),
        );
        await saveSession(this.sessionToken!, current.session);
      });
      return {
        sourceKind: "github",
        repositoryRef: `github-user-${profile.githubId}/${input.projectId}`,
        revision: commit.sha,
        branch,
        diagnostics,
        async listFiles() {
          return entries.map(({ path, size }) => ({ path, size }));
        },
        async readTextFile(path) {
          return safePath(path) ? (texts.get(path) ?? null) : null;
        },
      };
    } finally {
      clearTimeout(timer);
      controller.abort();
      if (installationToken) await revokeSourceToken(installationToken);
      running.delete(lock);
    }
  }
}

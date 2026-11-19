import "server-only";
import { createHash } from "node:crypto";
import { AuthError } from "../../../lib/auth/config";
import { appJwt } from "../../../lib/auth/github";
import { authorizeCanvasProject } from "../../canvas/server/github-reader";
import {
  revokeSourceToken,
  sourceRequest,
} from "../../canvas/server/github-api";
import { LOCKFILE_MAX_BYTES } from "../external/lockfile";

const sha = /^[a-f0-9]{40}$/;
const running = new Set<string>();
/**
 * Read-only fetch of the ROOT `package-lock.json` of an already authorized repository, through the existing
 * GitHub App installation (contents:read, single repository). No second OAuth/registry, no code execution, no cache.
 */
export async function readRootLockfile(
  sessionToken: string | undefined,
  projectId: string,
) {
  if (running.has(projectId) || running.size >= 4)
    throw new AuthError("source_busy", 429);
  running.add(projectId);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  const signal = controller.signal;
  let token: string | undefined;
  try {
    const { profile, repo } = await authorizeCanvasProject(
      sessionToken,
      projectId,
    );
    const grant = await sourceRequest<{ token: string; expires_at: string }>(
      `/app/installations/${profile.installationId}/access_tokens`,
      appJwt(),
      signal,
      16000,
      {
        repository_ids: [repo.id],
        permissions: { metadata: "read", contents: "read" },
      },
    );
    if (typeof grant?.token !== "string" || !grant.token)
      throw new AuthError("github_response", 502);
    token = grant.token;
    const base = `/repos/${repo.full_name}`;
    const commit = await sourceRequest<{
      sha: string;
      commit: { tree: { sha: string } };
    }>(
      `${base}/commits/${encodeURIComponent(repo.default_branch)}`,
      token,
      signal,
    );
    if (!sha.test(commit?.sha) || !sha.test(commit?.commit?.tree?.sha))
      throw new AuthError("github_response", 502);
    const tree = await sourceRequest<{
      sha: string;
      tree: {
        path: string;
        mode: string;
        type: string;
        size?: number;
        sha: string;
      }[];
    }>(`${base}/git/trees/${commit.commit.tree.sha}`, token, signal, 2_000_000);
    if (tree?.sha !== commit.commit.tree.sha || !Array.isArray(tree.tree))
      throw new AuthError("github_response", 502);
    const entry = tree.tree.find((e) => e?.path === "package-lock.json");
    if (!entry) return { found: false as const, commitSha: commit.sha };
    if (
      entry.type !== "blob" ||
      entry.mode !== "100644" ||
      !sha.test(entry.sha) ||
      !Number.isSafeInteger(entry.size) ||
      entry.size! > LOCKFILE_MAX_BYTES
    )
      throw new AuthError("source_response_limit", 413);
    const blob = await sourceRequest<{
      sha: string;
      encoding: string;
      size: number;
      content: string;
    }>(
      `${base}/git/blobs/${entry.sha}`,
      token,
      signal,
      Math.ceil(LOCKFILE_MAX_BYTES * 1.4) + 4096,
    );
    if (
      blob?.sha !== entry.sha ||
      blob.encoding !== "base64" ||
      typeof blob.content !== "string" ||
      blob.size !== entry.size
    )
      throw new AuthError("github_response", 502);
    const buffer = Buffer.from(blob.content.replace(/\n/g, ""), "base64");
    const gitHash = createHash("sha1")
      .update(`blob ${buffer.length}\0`)
      .update(buffer)
      .digest("hex");
    if (buffer.length !== entry.size || gitHash !== entry.sha)
      throw new AuthError("source_integrity", 502);
    let text: string;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    } catch {
      throw new AuthError("github_response", 502);
    }
    return {
      found: true as const,
      commitSha: commit.sha,
      path: "package-lock.json",
      text,
      sha256: createHash("sha256").update(buffer).digest("hex"),
    };
  } finally {
    clearTimeout(timer);
    controller.abort();
    if (token) await revokeSourceToken(token);
    running.delete(projectId);
  }
}

import "server-only";
import { appJwt, userToken } from "../../../lib/auth/github";
import { saveSession } from "../../../lib/auth/session";
import { exclusive } from "../../../lib/auth/store";
import { canvasIdentity } from "../../canvas/server/github-reader";
import {
  sourceRequest,
  revokeSourceToken,
} from "../../canvas/server/github-api";
import type { ProjectAuthority } from "../live/model";
import { G03Error, type Proposal, type SourceFile } from "./contracts";
import { gitBlob, isSha } from "./safety";

export interface PullRequestStatus {
  state: "open" | "closed" | "merged";
  number: number;
  url: string;
  headCommit: string;
  mergeCommit?: string;
}
export interface GithubPort {
  enabled: boolean;
  permission(
    authority: ProjectAuthority,
    branch: string,
    signal: AbortSignal,
  ): Promise<void>;
  publish(
    authority: ProjectAuthority,
    proposal: Proposal,
    file: SourceFile,
    content: string,
    signal: AbortSignal,
  ): Promise<PullRequestStatus>;
  status(
    authority: ProjectAuthority,
    proposal: Proposal,
    signal: AbortSignal,
  ): Promise<PullRequestStatus | null>;
}
type Json = Record<string, unknown>;
const record = (v: unknown): Json => {
  if (!v || typeof v !== "object" || Array.isArray(v))
    throw new G03Error("github_response_invalid", 502);
  return v as Json;
};
export function githubPullRequests(
  token: string | undefined,
  enabled = process.env.GUARD_G03_GITHUB_WRITES_ENABLED === "1",
): GithubPort {
  async function userAccess(a: ProjectAuthority, signal: AbortSignal) {
    return exclusive(async () => {
      const { session, profile } = await canvasIdentity(token);
      if (
        profile.githubId !== a.userId ||
        profile.installationId !== a.installationId ||
        !profile.repositories.some((r) => String(r.id) === a.repositoryId)
      )
        throw new G03Error("github_permission_denied", 403);
      const access = await userToken(session);
      const repo = record(
        await sourceRequest(`/repositories/${a.repositoryId}`, access, signal),
      );
      await saveSession(token!, session);
      if (
        String(repo.id) !== a.repositoryId ||
        repo.full_name !== a.repositoryName ||
        String(record(repo.owner).id) !== String(a.userId) ||
        record(repo.permissions).push !== true ||
        record(repo.permissions).admin !== true
      )
        throw new G03Error("github_owner_write_required", 403);
    });
  }
  async function installation(
    a: ProjectAuthority,
    write: boolean,
    signal: AbortSignal,
  ) {
    await userAccess(a, signal);
    if (write && !enabled) throw new G03Error("github_writes_disabled", 503);
    if (write) {
      const installed = record(
        await sourceRequest(
          `/app/installations/${a.installationId}`,
          appJwt(),
          signal,
        ),
      );
      const permissions = record(installed.permissions);
      if (
        installed.id !== a.installationId ||
        installed.suspended_at !== null ||
        permissions.contents !== "write" ||
        permissions.pull_requests !== "write"
      )
        throw new G03Error("github_app_write_required", 403);
    }
    const grant = record(
      await sourceRequest(
        `/app/installations/${a.installationId}/access_tokens`,
        appJwt(),
        signal,
        16000,
        {
          repository_ids: [Number(a.repositoryId)],
          permissions: write
            ? { contents: "write", pull_requests: "write", metadata: "read" }
            : { contents: "read", pull_requests: "read", metadata: "read" },
        },
      ),
    );
    if (
      typeof grant.token !== "string" ||
      !Number.isFinite(Date.parse(String(grant.expires_at))) ||
      Date.parse(String(grant.expires_at)) <= Date.now()
    )
      throw new G03Error("github_response_invalid", 502);
    const read = async (path: string, body?: unknown) => {
      if (Date.parse(String(grant.expires_at)) <= Date.now())
        throw new G03Error("github_permission_expired", 403);
      return sourceRequest<unknown>(
        `/repos/${a.repositoryName}${path}`,
        grant.token as string,
        signal,
        500000,
        body,
      );
    };
    return { read, close: () => revokeSourceToken(grant.token as string) };
  }
  async function permission(
    a: ProjectAuthority,
    branch: string,
    signal: AbortSignal,
  ) {
    if (!enabled) throw new G03Error("github_writes_disabled", 503);
    await userAccess(a, signal);
    const installed = record(
      await sourceRequest(
        `/app/installations/${a.installationId}`,
        appJwt(),
        signal,
      ),
    );
    const p = record(installed.permissions);
    if (
      installed.id !== a.installationId ||
      installed.suspended_at !== null ||
      p.contents !== "write" ||
      p.pull_requests !== "write"
    )
      throw new G03Error("github_app_write_required", 403);
    if (!branch) throw new G03Error("invalid_branch", 400);
  }
  function parse(
    a: ProjectAuthority,
    p: Proposal,
    value: unknown,
  ): PullRequestStatus {
    const r = record(value),
      head = record(r.head),
      base = record(r.base);
    if (
      !Number.isSafeInteger(r.number) ||
      Number(r.number) < 1 ||
      r.html_url !==
        `https://github.com/${a.repositoryName}/pull/${r.number}` ||
      String(record(head.repo).id) !== a.repositoryId ||
      String(record(base.repo).id) !== a.repositoryId ||
      head.ref !== p.pr?.branch ||
      base.ref !== p.binding?.branch ||
      !isSha(head.sha) ||
      !["open", "closed"].includes(String(r.state)) ||
      (r.merged_at && !isSha(r.merge_commit_sha))
    )
      throw new G03Error("github_response_invalid", 502);
    return {
      number: r.number as number,
      url: r.html_url as string,
      headCommit: head.sha,
      state: r.merged_at ? "merged" : (r.state as "open" | "closed"),
      ...(r.merged_at ? { mergeCommit: r.merge_commit_sha as string } : {}),
    };
  }
  return {
    enabled,
    permission,
    async publish(a, p, file, content, signal) {
      if (
        !p.pr ||
        p.pr.state !== "reserved" ||
        p.review?.decision !== "approved" ||
        p.pr.patchDigest !== p.patch?.digest ||
        p.binding?.baseCommit !== file.baseCommit ||
        p.pr.branch === file.branch ||
        !/^wetscan\/g03-[a-f0-9]{32}$/.test(p.pr.branch)
      )
        throw new G03Error("pr_approval_required", 403);
      const api = await installation(a, true, signal);
      try {
        const assertHead = async () => {
          const b = record(
            await api.read(`/branches/${encodeURIComponent(file.branch)}`),
          );
          if (
            b.name !== file.branch ||
            record(b.commit).sha !== file.baseCommit
          )
            throw new G03Error("stale_commit");
        };
        await assertHead();
        const blob = record(
          await api.read("/git/blobs", {
            content: Buffer.from(content).toString("base64"),
            encoding: "base64",
          }),
        );
        if (blob.sha !== gitBlob(content))
          throw new G03Error("github_response_invalid", 502);
        const tree = record(
          await api.read("/git/trees", {
            base_tree: file.tree,
            tree: [
              { path: file.path, mode: "100644", type: "blob", sha: blob.sha },
            ],
          }),
        );
        if (!isSha(tree.sha))
          throw new G03Error("github_response_invalid", 502);
        const commit = record(
          await api.read("/git/commits", {
            message: `Guard remediation ${p.findingId.slice(0, 16)}`,
            tree: tree.sha,
            parents: [file.baseCommit],
          }),
        );
        if (
          !isSha(commit.sha) ||
          record(commit.tree).sha !== tree.sha ||
          !Array.isArray(commit.parents) ||
          commit.parents.length !== 1 ||
          record(commit.parents[0]).sha !== file.baseCommit
        )
          throw new G03Error("github_response_invalid", 502);
        await assertHead();
        await api.read("/git/refs", {
          ref: "refs/heads/" + p.pr.branch,
          sha: commit.sha,
        });
        await assertHead();
        const pr = await api.read("/pulls", {
          title: `Guard remediation: ${file.path}`,
          head: p.pr.branch,
          base: file.branch,
          draft: true,
          body: `Finding: ${p.findingId}\nProposal: ${p.id}\nEvidence: ${p.evidenceSha256}\nBase commit: ${file.baseCommit}\nPatch digest: ${p.patch!.digest}\n\nHuman reviewed draft. Syntax passed. Repository behavioral tests have NOT_RUN; compatibility requires review and CI. AI advice is untrusted. No auto-merge or deployment enforcement. Verified retest is required.`,
        });
        const result = parse(a, p, pr);
        if (
          result.headCommit !== commit.sha ||
          record(record(pr).base).sha !== file.baseCommit
        )
          throw new G03Error("github_response_invalid", 502);
        return result;
      } finally {
        await api.close();
      }
    },
    async status(a, p, signal) {
      if (!p.pr) throw new G03Error("pr_not_requested");
      const api = await installation(a, false, signal);
      try {
        if (p.pr.number)
          return parse(a, p, await api.read(`/pulls/${p.pr.number}`));
        const list = await api.read(
          `/pulls?state=all&head=${encodeURIComponent(a.repositoryName.split("/")[0] + ":" + p.pr.branch)}&base=${encodeURIComponent(p.binding!.branch)}&per_page=2`,
        );
        if (!Array.isArray(list) || list.length > 1)
          throw new G03Error("pr_result_ambiguous");
        return list.length ? parse(a, p, list[0]) : null;
      } finally {
        await api.close();
      }
    },
  };
}

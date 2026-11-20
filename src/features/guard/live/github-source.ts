import "server-only";
import { appJwt } from "../../../lib/auth/github";
import {
  sourceRequest,
  revokeSourceToken,
} from "../../canvas/server/github-api";
import { array, record, text, authorize } from "../security";
import { LiveGuardError, type ProjectAuthority, type SourceAccess, type SourceEntry } from "./model";
import { authorizeGuardProject } from "./project";
import { guardRevision, type GuardRevision } from "./revision";
const sha = (value: unknown) => {
  const s = text(value);
  if (!/^[a-f0-9]{40}$/.test(s))
    throw new LiveGuardError("source_integrity", 502);
  return s;
};
/** Only provider transport/auth primitives are reused; no Canvas file selection or graph cache. */
export function githubSourceAccess(
  token: string | undefined,
  projectId: string,
  revision?: GuardRevision,
  /** G04 automation: a server-held authority (re-verified by the caller) instead of a browser session. Omitted = unchanged G02 behaviour. */
  authorizer?: () => Promise<ProjectAuthority>,
): SourceAccess {
  const selection =
    revision === undefined ? undefined : guardRevision(revision);
  const currentAuthority = async () => {
    const current = authorizer ? await authorizer() : await authorizeGuardProject(token, projectId);
    return selection ? { ...current, branch: selection.branch } : current;
  };
  return {
    authorize: currentAuthority,
    async open(authority, signal) {
      if (signal?.aborted) throw new LiveGuardError("source_unavailable");
      const current = await currentAuthority();
      authorize(current.grant, authority.grant, "scan");
      if (
        current.grant.actorId !== authority.grant.actorId ||
        current.userId !== authority.userId ||
        current.installationId !== authority.installationId ||
        current.repositoryId !== authority.repositoryId ||
        current.repositoryName !== authority.repositoryName ||
        current.branch !== authority.branch ||
        !Number.isSafeInteger(authority.installationId) ||
        authority.installationId < 1 ||
        !/^[1-9]\d{0,15}$/.test(authority.repositoryId) ||
        !Number.isSafeInteger(Number(authority.repositoryId)) ||
        !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(authority.repositoryName)
      )
        throw new LiveGuardError("not_found", 404);
      const grant = record(
        await sourceRequest<unknown>(
          `/app/installations/${authority.installationId}/access_tokens`,
          appJwt(),
          signal,
          16000,
          {
            repository_ids: [Number(authority.repositoryId)],
            permissions: { metadata: "read", contents: "read" },
          },
        ),
      );
      const installationToken = text(grant.token, 2000);
      try {
        if (
          typeof grant.expires_at !== "string" ||
          !Number.isFinite(Date.parse(grant.expires_at)) ||
          Date.parse(grant.expires_at) <= Date.now()
        )
          throw new LiveGuardError("source_integrity", 502);
        const repo = record(
          await sourceRequest<unknown>(
            `/repositories/${authority.repositoryId}`,
            installationToken,
            signal,
          ),
        );
        if (
          String(repo.id) !== authority.repositoryId ||
          repo.full_name !== authority.repositoryName ||
          !/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(authority.repositoryName)
        )
          throw new LiveGuardError("not_found", 404);
      } catch (error) {
        await revokeSourceToken(installationToken);
        throw error;
      }
      const base = `/repos/${authority.repositoryName}`;
      let closed = false;
      const read = <T>(
        path: string,
        signal: AbortSignal,
        maxBytes?: number,
      ) => {
        if (closed || Date.parse(String(grant.expires_at)) <= Date.now())
          throw new LiveGuardError("source_unavailable");
        return sourceRequest<T>(path, installationToken, signal, maxBytes);
      };
      return {
        async head(s) {
          let target = authority.branch;
          let branchHead: string | undefined;
          if (selection) {
            const branch = record(
              await read<unknown>(
                `${base}/branches/${encodeURIComponent(selection.branch)}`,
                s,
              ),
            );
            if (branch.name !== selection.branch)
              throw new LiveGuardError("source_integrity", 502);
            branchHead = sha(record(branch.commit).sha);
            target = selection.commit ?? branchHead;
          }
          const value = record(
            await read<unknown>(
              `${base}/commits/${encodeURIComponent(target)}`,
              s,
            ),
          );
          const commit = sha(value.sha);
          if (selection && commit !== target)
            throw new LiveGuardError("source_integrity", 502);
          if (branchHead && commit !== branchHead) {
            const compared = record(
              await read<unknown>(
                `${base}/compare/${commit}...${branchHead}`,
                s,
                1000000,
              ),
            );
            if (
              !["ahead", "identical"].includes(String(compared.status)) ||
              sha(record(compared.base_commit).sha) !== commit ||
              sha(record(compared.merge_base_commit).sha) !== commit
            )
              throw new LiveGuardError("revision_conflict", 409);
          }
          return { commit, tree: sha(record(record(value.commit).tree).sha) };
        },
        async tree(tree, s) {
          const value = record(
            await read<unknown>(
              `${base}/git/trees/${sha(tree)}?recursive=1`,
              s,
              4000000,
            ),
          );
          if (typeof value.truncated !== "boolean")
            throw new LiveGuardError("source_integrity", 502);
          const entries = array(value.tree, 10000).map((input) => {
            const row = record(input);
            if (
              !["tree", "blob", "commit"].includes(String(row.type)) ||
              !["040000", "100644", "100755", "120000", "160000"].includes(
                String(row.mode),
              )
            )
              throw new LiveGuardError("source_integrity", 502);
            return {
              path: text(row.path),
              sha: sha(row.sha),
              mode: text(row.mode),
              type: row.type as SourceEntry["type"],
              size: row.size as number | undefined,
            };
          });
          return { sha: sha(value.sha), truncated: value.truncated, entries };
        },
        async blob(hash, s, responseLimit) {
          if (responseLimit !== undefined && (!Number.isInteger(responseLimit) || responseLimit < 120000 || responseLimit > 3000000)) throw new LiveGuardError("invalid_input",400);
          const value = record(
            await read<unknown>(`${base}/git/blobs/${sha(hash)}`, s, responseLimit ?? 120000),
          );
          return {
            sha: sha(value.sha),
            size: value.size as number,
            encoding: text(value.encoding),
            content: typeof value.content === "string" ? value.content : "",
          };
        },
        close: async () => {
          if (closed) return;
          closed = true;
          await revokeSourceToken(installationToken);
        },
      };
    },
  };
}

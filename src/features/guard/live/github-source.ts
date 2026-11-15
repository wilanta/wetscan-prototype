import "server-only";
import { appJwt } from "../../../lib/auth/github";
import {
  sourceRequest,
  revokeSourceToken,
} from "../../canvas/server/github-api";
import { array, record, text, authorize } from "../security";
import { LiveGuardError, type SourceAccess, type SourceEntry } from "./model";
import { authorizeGuardProject } from "./project";
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
): SourceAccess {
  return {
    authorize: () => authorizeGuardProject(token, projectId),
    async open(authority, signal) {
      if (signal?.aborted) throw new LiveGuardError("source_unavailable");
      const current = await authorizeGuardProject(token, projectId);
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
      return {
        async head(s) {
          const value = record(
            await sourceRequest<unknown>(
              `${base}/commits/${encodeURIComponent(authority.branch)}`,
              installationToken,
              s,
            ),
          );
          return {
            commit: sha(value.sha),
            tree: sha(record(record(value.commit).tree).sha),
          };
        },
        async tree(tree, s) {
          const value = record(
            await sourceRequest<unknown>(
              `${base}/git/trees/${sha(tree)}?recursive=1`,
              installationToken,
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
        async blob(hash, s) {
          const value = record(
            await sourceRequest<unknown>(
              `${base}/git/blobs/${sha(hash)}`,
              installationToken,
              s,
              120000,
            ),
          );
          return {
            sha: sha(value.sha),
            size: value.size as number,
            encoding: text(value.encoding),
            content: typeof value.content === "string" ? value.content : "",
          };
        },
        close: () => revokeSourceToken(installationToken),
      };
    },
  };
}

import "server-only";
import { githubSourceAccess } from "../live/github-source";
import type { ProjectAuthority } from "../live/model";
import { G03Error, type SourceFile } from "./contracts";
import { gitBlob, isSha, patchPath, sha256 } from "./safety";
import { validateSource } from "./patch";

export interface SourcePort {
  read(
    authority: ProjectAuthority,
    branch: string,
    commit: string,
    path: string,
    signal: AbortSignal,
  ): Promise<SourceFile>;
}
export function githubRemediationSource(token: string | undefined): SourcePort {
  return {
    async read(authority, branch, commit, path, signal) {
      patchPath(path);
      if (!isSha(commit)) throw new G03Error("invalid_revision", 400);
      // Resolve the branch HEAD, rather than accepting an ancestor as the current base.
      const access = githubSourceAccess(token, authority.grant.projectId, {
        branch,
      });
      const fresh = await access.authorize();
      if (
        fresh.repositoryId !== authority.repositoryId ||
        fresh.grant.actorId !== authority.grant.actorId ||
        fresh.installationId !== authority.installationId
      )
        throw new G03Error("authorization_changed", 404);
      const lease = await access.open(fresh, signal);
      try {
        const head = await lease.head(signal);
        if (head.commit !== commit) throw new G03Error("stale_commit");
        const tree = await lease.tree(head.tree, signal);
        if (tree.truncated || tree.sha !== head.tree)
          throw new G03Error("source_integrity");
        const matches = tree.entries.filter((e) => e.path === path);
        if (
          matches.length !== 1 ||
          matches[0].type !== "blob" ||
          matches[0].mode !== "100644" ||
          !Number.isSafeInteger(matches[0].size) ||
          matches[0].size! > 24000
        )
          throw new G03Error("unsafe_patch_target");
        const blob = await lease.blob(matches[0].sha, signal);
        if (
          blob.sha !== matches[0].sha ||
          blob.encoding !== "base64" ||
          blob.size !== matches[0].size ||
          !/^[A-Za-z0-9+/=\r\n]+$/.test(blob.content)
        )
          throw new G03Error("source_integrity");
        const bytes = Buffer.from(blob.content, "base64");
        if (bytes.length !== blob.size) throw new G03Error("source_integrity");
        // Preserve a UTF-8 BOM: proposal hashes and Git blobs bind the original bytes.
        const content = new TextDecoder("utf-8", {
          fatal: true,
          ignoreBOM: true,
        }).decode(bytes);
        if (gitBlob(content) !== blob.sha)
          throw new G03Error("source_integrity");
        const file = {
          repositoryId: authority.repositoryId,
          branch,
          baseCommit: commit,
          tree: head.tree,
          path,
          blob: blob.sha,
          sourceSha256: sha256(content),
          content,
        };
        validateSource(file);
        // Fail closed if the branch moved during the read.
        if ((await lease.head(signal)).commit !== commit)
          throw new G03Error("stale_commit");
        return file;
      } finally {
        await lease.close();
      }
    },
  };
}

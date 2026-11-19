import {
  tagFailure,
  type SourcePhase,
} from "../../../../worker/guard/source-failure";
import { createHash, randomUUID } from "node:crypto";
import {
  mkdtemp,
  mkdir,
  writeFile,
  rm,
  lstat,
  readFile,
  unlink,
  rename,
  realpath,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import {
  basename,
  dirname,
  join,
  resolve,
  relative,
  isAbsolute,
} from "node:path";
import { fingerprint } from "../../../platform/identity";
import type {
  AuthorizedSnapshot,
  Grant,
  ScanRequest,
  SnapshotPort,
} from "../contracts";
import { authorize, safePath } from "../security";
import { secureSnapshotDirectory } from "./snapshot-directory";
import {
  LiveGuardError,
  type GuardSnapshot,
  type ProjectAuthority,
  type SourceAccess,
  type SourceCoverage,
  type SourceEntry,
  type SourceLease,
} from "./model";
export const snapshotPolicy = {
  maxFiles: 1000,
  maxFileBytes: 65536,
  maxTotalBytes: 20000000,
  maxDepth: 16,
  maxMs: 45000,
} as const;
/** Only operational dependency manifests get a reviewed larger bound; source/config defaults stay64KiB. */
export function operationalManifestBytes(path: string) {
 return /(?:^|\/)(?:package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|poetry\.lock|Pipfile\.lock|Cargo\.lock|Gemfile\.lock|composer\.lock|go\.sum)$/.test(path) ? 2097152 : snapshotPolicy.maxFileBytes;
}
const sha256 = (data: string | Buffer) =>
  createHash("sha256").update(data).digest("hex");
export class GuardSnapshotAdapter implements SnapshotPort {
  private readonly owned = new WeakMap<AuthorizedSnapshot, string>();
  constructor(
    private readonly source: SourceAccess,
    private readonly remove = (path: string) =>
      rm(path, { recursive: true, force: true }),
    private readonly acceptanceHooks?: {
      afterWrite(
        root: string,
        relative: string,
        writtenFiles: number,
        signal: AbortSignal,
      ): Promise<void>;
      beforeCleanup(root: string): Promise<void>;
    },
    private readonly acquisition: { blobConcurrency?: number; largeDependencyManifests?: boolean } = {},
  ) {}
  private bind(
    authority: ProjectAuthority,
    grant: Grant,
    request: ScanRequest,
  ) {
    authorize(grant, request, "scan");
    authorize(authority.grant, request, "scan");
    if (
      request.mode !== "live" ||
      request.repository.provider !== "github" ||
      grant.actorId !== authority.grant.actorId ||
      authority.repositoryId !== request.repository.repositoryId ||
      request.projectId !== `github-${authority.repositoryId}` ||
      request.repository.branch !== authority.branch ||
      !/^[a-f0-9]{40}$/.test(request.repository.commit)
    )
      throw new LiveGuardError("not_found", 404);
  }
  async acquire(
    grant: Grant,
    request: ScanRequest,
    parentSignal?: AbortSignal,
  ): Promise<GuardSnapshot> {
    const started = performance.now(),
      concurrency = this.acquisition.blobConcurrency ?? 1;
    if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 3)
      throw new LiveGuardError("invalid_input", 400);
    let phase: SourcePhase = "authorize",
      root: string | undefined,
      result: GuardSnapshot | undefined;
    let lease: SourceLease | undefined,
      coverage: SourceCoverage | undefined,
      deadline: AbortSignal | undefined;
    let cleanupState: "NOT_CREATED" | "VERIFIED" | "UNKNOWN" = "NOT_CREATED";
    const stop = new AbortController();
    const buffers: {
      path: string;
      content: Buffer;
      sha256: string;
      size: number;
    }[] = [];
    type BlobResult = {
      file?: (typeof buffers)[number];
      excluded?: "retrieval_failed" | "binary";
    };
    let pending: { path: string; size: number; work: Promise<BlobResult> }[] =
      [];
    let fatal: { error: unknown } | undefined;
    const decorate = (error: unknown) => {
      const e = tagFailure(error, "source");
      return Object.assign(e, {
        guardSourceDiagnostic: {
          version: 1,
          phase,
          elapsedMs: Math.round(Math.min(600000, performance.now() - started)),
          retrievedFiles: buffers.length,
          eligibleFiles: coverage?.eligibleFiles ?? 0,
          timedOut: deadline?.aborted === true,
          parentCancelled: parentSignal?.aborted === true,
          cleanup: cleanupState,
          concurrency,
        },
      });
    };
    const flush = async () => {
      const batch = pending;
      pending = [];
      const values = await Promise.all(batch.map((x) => x.work));
      if (fatal) throw fatal.error;
      for (let i = 0; i < batch.length; i++) {
        const value = values[i];
        if (value.excluded)
          coverage!.exclusions.push({
            pathDigest: sha256(batch[i].path),
            reason: value.excluded,
          });
        else if (value.file) {
          coverage!.bytes += value.file.size;
          buffers.push(value.file);
        }
      }
    };
    try {
      if (parentSignal?.aborted) throw new LiveGuardError("source_unavailable");
      const authority = await this.source.authorize();
      this.bind(authority, grant, request);
      deadline = AbortSignal.timeout(snapshotPolicy.maxMs);
      const signal = AbortSignal.any([
        deadline,
        stop.signal,
        ...(parentSignal ? [parentSignal] : []),
      ]);
      phase = "open";
      lease = await this.source.open(authority, signal);
      if (signal.aborted) throw new LiveGuardError("source_unavailable");
      phase = "head";
      const head = await lease.head(signal);
      if (
        head.commit !== request.repository.commit ||
        !/^[a-f0-9]{40}$/.test(head.tree)
      )
        throw new LiveGuardError("revision_conflict", 409);
      phase = "tree";
      const tree = await lease.tree(head.tree, signal);
      if (tree.sha !== head.tree || tree.entries.length > 10000)
        throw new LiveGuardError("source_integrity", 502);
      coverage = {
        status: "complete",
        treeTruncated: tree.truncated,
        eligibleFiles: 0,
        retrievedFiles: 0,
        bytes: 0,
        exclusions: [],
      };
      const excluded = (
        path: string,
        reason: SourceCoverage["exclusions"][number]["reason"],
      ) => coverage!.exclusions.push({ pathDigest: sha256(path), reason });
      const readBlob = async (item: SourceEntry): Promise<BlobResult> => {
        try {
          let blob: Awaited<ReturnType<SourceLease["blob"]>>;
          try {
            blob = await lease!.blob(item.sha, signal, item.size! > snapshotPolicy.maxFileBytes ? 3000000 : undefined);
          } catch (error) {
            const code = (error as { code?: unknown })?.code;
            if (
              [
                "repository_denied",
                "installation_denied",
                "unauthenticated",
                "github_rate_limited",
              ].includes(String(code))
            )
              throw error;
            if (signal.aborted)
              throw fatal?.error ?? new LiveGuardError("source_unavailable");
            return { excluded: "retrieval_failed" };
          }
          const encoded = blob.content.replace(/\n/g, ""),
            content = Buffer.from(encoded, "base64");
          if (
            blob.sha !== item.sha ||
            blob.encoding !== "base64" ||
            content.toString("base64") !== encoded ||
            content.length !== item.size ||
            blob.size !== item.size ||
            createHash("sha1")
              .update(`blob ${content.length}\0`)
              .update(content)
              .digest("hex") !== item.sha
          )
            throw new LiveGuardError("source_integrity", 502);
          try {
            if (content.includes(0)) throw Error();
            new TextDecoder("utf-8", { fatal: true }).decode(content);
          } catch {
            return { excluded: "binary" };
          }
          return {
            file: {
              path: item.path,
              content,
              size: content.length,
              sha256: sha256(content),
            },
          };
        } catch (error) {
          fatal ??= { error };
          stop.abort();
          return {};
        }
      };
      const seen = new Set<string>();
      for (const item of [...tree.entries].sort((a, b) =>
        a.path.localeCompare(b.path),
      )) {
        if (signal.aborted)
          throw fatal?.error ?? new LiveGuardError("source_unavailable");
        if (seen.has(item.path))
          throw new LiveGuardError("source_integrity", 502);
        seen.add(item.path);
        if (item.type === "tree" && item.mode === "040000") continue;
        if (item.mode === "120000") {
          excluded(item.path, "symlink");
          continue;
        }
        if (item.type === "commit" || item.mode === "160000") {
          excluded(item.path, "submodule");
          continue;
        }
        if (
          item.type !== "blob" ||
          !["100644", "100755"].includes(item.mode) ||
          !/^[a-f0-9]{40}$/.test(item.sha)
        )
          throw new LiveGuardError("source_integrity", 502);
        try {
          if (safePath(item.path) !== item.path) throw Error();
        } catch {
          excluded(
            item.path,
            /(?:^|\/)(?:\.env|credentials|secrets?|id_rsa)|\.(?:pem|key|p12|pfx)$/i.test(
              item.path,
            )
              ? "sensitive_path"
              : "unsafe_path",
          );
          continue;
        }
        if (item.path.split("/").length > snapshotPolicy.maxDepth) {
          excluded(item.path, "depth");
          continue;
        }
        if (!Number.isSafeInteger(item.size) || item.size! < 0)
          throw new LiveGuardError("source_integrity", 502);
        coverage.eligibleFiles++;
        if (item.size! > (this.acquisition.largeDependencyManifests ? operationalManifestBytes(item.path) : snapshotPolicy.maxFileBytes)) {
          excluded(item.path, "file_size");
          continue;
        }
        if (
          pending.length &&
          (buffers.length + pending.length >= snapshotPolicy.maxFiles ||
            coverage.bytes +
              pending.reduce((n, x) => n + x.size, 0) +
              item.size! >
              snapshotPolicy.maxTotalBytes)
        )
          await flush();
        if (buffers.length >= snapshotPolicy.maxFiles) {
          excluded(item.path, "file_limit");
          continue;
        }
        if (coverage.bytes + item.size! > snapshotPolicy.maxTotalBytes) {
          excluded(item.path, "total_size");
          continue;
        }
        phase = "blob";
        pending.push({
          path: item.path,
          size: item.size!,
          work: readBlob(item),
        });
        if (pending.length >= concurrency) await flush();
      }
      await flush();
      if (signal.aborted)
        throw fatal?.error ?? new LiveGuardError("source_unavailable");
      phase = "final_authorize";
      const finalAuthority = await this.source.authorize();
      this.bind(finalAuthority, grant, request);
      if (
        finalAuthority.installationId !== authority.installationId ||
        finalAuthority.userId !== authority.userId ||
        finalAuthority.repositoryName !== authority.repositoryName
      )
        throw new LiveGuardError("not_found", 404);
      coverage.retrievedFiles = buffers.length;
      coverage.status =
        tree.truncated || coverage.exclusions.length ? "partial" : "complete";
      if (!buffers.length && coverage.eligibleFiles)
        throw new LiveGuardError("source_unavailable");
      phase = "write";
      root = await mkdtemp(join(tmpdir(), "wetscan-g01-snapshot-"));
      await secureSnapshotDirectory(root);
      let writtenFiles = 0;
      for (const file of buffers) {
        if (signal.aborted) throw new LiveGuardError("source_unavailable");
        const path = join(root, ...file.path.split("/"));
        await mkdir(dirname(path), { recursive: true, mode: 0o700 });
        await writeFile(path, file.content, { flag: "wx", mode: 0o400 });
        await this.acceptanceHooks?.afterWrite(
          root,
          file.path,
          ++writtenFiles,
          signal,
        );
      }
      const files = buffers.map(({ path, size, sha256 }) => ({
        path,
        size,
        sha256,
      }));
      result = {
        mode: "live",
        workspaceId: grant.workspaceId,
        projectId: grant.projectId,
        repository: { ...request.repository },
        files,
        digest: fingerprint({
          repository: request.repository,
          files,
          coverage,
        }),
        expiresAt: Math.min(grant.expiresAt, authority.grant.expiresAt),
        sourceKind: "github",
        tree: head.tree,
        policyVersion: "guard-source-v1",
        coverage,
      };
      await writeFile(
        root + ".lease",
        JSON.stringify({
          version: 1,
          kind: "guard-source",
          rootName: basename(root),
          createdAt: Date.now(),
          expiresAt: Math.min(result.expiresAt, Date.now() + 300000),
        }),
        { mode: 0o600, flag: "wx" },
      );
      this.owned.set(result, root);
      return result;
    } catch (error) {
      stop.abort();
      await Promise.all(pending.map((x) => x.work));
      pending = [];
      let failure = error;
      if (root) {
        try {
          await this.cleanup(root);
          cleanupState = "VERIFIED";
        } catch (cleanupError) {
          cleanupState = "UNKNOWN";
          failure = cleanupError;
        }
      }
      throw decorate(failure);
    } finally {
      try {
        await lease?.close();
      } catch {
        phase = "lease_close";
        if (result) {
          try {
            await this.dispose(result);
            cleanupState = "VERIFIED";
          } catch {
            cleanupState = "UNKNOWN";
          }
        }
        throw decorate(new LiveGuardError("cleanup_failed"));
      }
    }
  }
  /** Normal worker renewal between engines. No repository download, old grant extension, or orphan adoption. */
  async refresh(
    snapshot: AuthorizedSnapshot,
    grant: Grant,
  ): Promise<GuardSnapshot> {
    const root = this.owned.get(snapshot),
      current = snapshot as GuardSnapshot;
    if (
      !root ||
      current.sourceKind !== "github" ||
      current.digest !==
        fingerprint({
          repository: current.repository,
          files: current.files,
          coverage: current.coverage,
        })
    )
      throw new LiveGuardError("source_integrity");
    const authority = await this.source.authorize();
    this.bind(authority, grant, {
      ...current,
      engines: [],
      profile: "quick",
      idempotencyKey: "owned-source-renewal",
    });
    if ((await lstat(root)).isSymbolicLink())
      throw new LiveGuardError("source_integrity");
    for (const file of current.files) {
      const path = join(root, ...safePath(file.path).split("/"));
      const actual = await realpath(path),
        rootActual = await realpath(root),
        within = relative(rootActual, actual);
      if (within.startsWith("..") || isAbsolute(within))
        throw new LiveGuardError("source_integrity");
      const stat = await lstat(path);
      if (
        !stat.isFile() ||
        stat.isSymbolicLink() ||
        stat.size !== file.size ||
        sha256(await readFile(path)) !== file.sha256
      )
        throw new LiveGuardError("source_integrity");
    }
    const fresh = await this.source.authorize();
    this.bind(fresh, grant, {
      ...current,
      engines: [],
      profile: "quick",
      idempotencyKey: "owned-source-renewal",
    });
    const expiresAt = Math.min(grant.expiresAt, fresh.grant.expiresAt),
      marker = root + ".lease",
      lease = JSON.parse(await readFile(marker, "utf8"));
    if (
      lease.version !== 1 ||
      lease.kind !== "guard-source" ||
      lease.rootName !== basename(root) ||
      !Number.isFinite(lease.createdAt) ||
      lease.createdAt > Date.now()
    )
      throw new LiveGuardError("source_integrity");
    const temp = marker + ".renew-" + randomUUID();
    try {
      await writeFile(temp, JSON.stringify({ ...lease, expiresAt }), {
        flag: "wx",
        mode: 0o600,
      });
      await rename(temp, marker);
    } catch {
      await rm(temp, { force: true });
      throw new LiveGuardError("cleanup_failed");
    }
    const next = { ...current, expiresAt };
    this.owned.delete(snapshot);
    this.owned.set(next, root);
    return next;
  }
  /** Internal worker capability only. Never serialize or expose this path through an API. */
  async directory(snapshot: AuthorizedSnapshot): Promise<string> {
    const root = this.owned.get(snapshot);
    if (
      !root ||
      snapshot.expiresAt <= Date.now() ||
      (await lstat(root)).isSymbolicLink()
    )
      throw new LiveGuardError("not_found", 404);
    return root;
  }
  async dispose(snapshot: AuthorizedSnapshot) {
    const root = this.owned.get(snapshot);
    if (!root) throw new LiveGuardError("not_found", 404);
    await this.cleanup(root);
    this.owned.delete(snapshot);
  }
  async reapExpired(
    roots: readonly string[],
    now = Date.now(),
  ): Promise<number> {
    if (roots.length > 100) throw new LiveGuardError("source_limit", 413);
    let count = 0;
    for (const root of roots) {
      const target = resolve(root);
      if (
        dirname(target) !== resolve(tmpdir()) ||
        !basename(target).startsWith("wetscan-g01-snapshot-")
      )
        throw new LiveGuardError("cleanup_failed");
      const stat = await lstat(target),
        marker = await lstat(target + ".lease");
      if (
        stat.isSymbolicLink() ||
        marker.isSymbolicLink() ||
        !stat.isDirectory() ||
        marker.size > 2048
      )
        throw new LiveGuardError("cleanup_failed");
      const lease = JSON.parse(await readFile(target + ".lease", "utf8")) as {
        version: number;
        kind: string;
        rootName: string;
        createdAt: number;
        expiresAt: number;
      };
      if (
        lease.version !== 1 ||
        lease.kind !== "guard-source" ||
        lease.rootName !== basename(target) ||
        !Number.isFinite(lease.expiresAt) ||
        !Number.isFinite(lease.createdAt) ||
        lease.expiresAt > now ||
        lease.createdAt > now - 3600000
      )
        continue;
      await this.cleanup(target);
      count++;
    }
    return count;
  }
  private async cleanup(root: string) {
    const target = resolve(root);
    if (
      dirname(target) !== resolve(tmpdir()) ||
      !basename(target).startsWith("wetscan-g01-snapshot-")
    )
      throw new LiveGuardError("cleanup_failed");
    try {
      await this.acceptanceHooks?.beforeCleanup(target);
      await this.remove(target);
      await unlink(target + ".lease").catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOENT") throw error;
      });
    } catch {
      throw new LiveGuardError("cleanup_failed");
    }
  }
}

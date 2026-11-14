import "server-only";
import { createHash, randomBytes } from "node:crypto";
import {
  mkdir,
  lstat,
  readdir,
  readFile,
  rename,
  unlink,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { authConfig } from "@/lib/auth/config";
import { seal, unseal } from "@/lib/auth/store";
import { validateGraph } from "../validation";
import { analyzerVersion } from "../discovery/analyzer";
import type { ArchitectureGraph } from "../types";
import type {
  CanvasCacheIdentity,
  CanvasGraphStore,
  CachedCanvas,
} from "../cache-contracts";

const digest = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const maxEntryBytes = 4_000_000,
  maxDiskBytes = 64_000_000,
  maxEntries = 128,
  maxAge = 7 * 86400000;
const cacheName = /^[a-f0-9]{64}\.[a-f0-9]{64}\.[a-f0-9]{40}\.bin$/;
function cacheGraph(input: ArchitectureGraph) {
  const graph = validateGraph(input);
  const pick = (value: object, keys: string[]) =>
    Object.fromEntries(
      keys
        .filter((key) => Object.hasOwn(value, key))
        .map((key) => [key, (value as Record<string, unknown>)[key]]),
    );
  return validateGraph({
    ...pick(graph, [
      "schemaVersion",
      "analyzerVersion",
      "projectRef",
      "mode",
      "revision",
      "branch",
      "generatedAt",
      "environment",
    ]),
    nodes: graph.nodes.map((n) => ({
      ...pick(n, [
        "id",
        "kind",
        "label",
        "technology",
        "description",
        "evidenceIds",
        "origin",
        "status",
        "groupId",
      ]),
      ...(n.metadata
        ? {
            metadata: pick(n.metadata, [
              "packageManager",
              "framework",
              "version",
              "route",
              "methods",
            ]),
          }
        : {}),
    })),
    edges: graph.edges.map((e) =>
      pick(e, [
        "id",
        "source",
        "target",
        "relationship",
        "evidenceIds",
        "origin",
        "description",
      ]),
    ),
    evidence: graph.evidence.map((e) =>
      pick(e, [
        "id",
        "kind",
        "sourcePath",
        "startLine",
        "endLine",
        "summary",
        "origin",
        "sourceRevision",
      ]),
    ),
    coverage: graph.coverage.map((c) =>
      pick(c, ["capability", "status", "detail"]),
    ),
    diagnostics: graph.diagnostics.map((d) =>
      pick(d, ["code", "severity", "message", "sourcePath"]),
    ),
  });
}
export function projectCacheScope(
  identity: Pick<CanvasCacheIdentity, "userId" | "workspace" | "repositoryId">,
) {
  return digest([
    identity.userId,
    identity.workspace,
    "github",
    identity.repositoryId,
  ]);
}
/** Encrypted graph-only store under the existing private auth data directory. No grants/tokens. */
export class FileCanvasGraphStore implements CanvasGraphStore {
  constructor(
    private readonly version = analyzerVersion,
    private readonly schema = 1,
  ) {}
  private async directory() {
    const path = join(authConfig().directory, "canvas-graphs-v1");
    await mkdir(path, { recursive: true, mode: 0o700 });
    const stat = await lstat(path);
    if (!stat.isDirectory() || stat.isSymbolicLink())
      throw new Error("Invalid private Canvas cache directory");
    return path;
  }
  private prefix(identity: CanvasCacheIdentity) {
    return `${projectCacheScope(identity)}.${digest([identity.provider, identity.installationId, identity.repositoryId, identity.repositoryName.toLowerCase(), this.version, this.schema])}.`;
  }
  async latest(
    identity: CanvasCacheIdentity,
    revision?: string,
  ): Promise<CachedCanvas | null> {
    if (revision !== undefined && !/^[a-f0-9]{40}$/.test(revision)) return null;
    const directory = await this.directory();
    const prefix = this.prefix(identity);
    const names = (await readdir(directory)).filter(
      (name) =>
        cacheName.test(name) &&
        name.startsWith(prefix) &&
        (!revision || name === prefix + revision + ".bin"),
    );
    const candidates = await Promise.all(
      names.map(async (name) => ({
        name,
        stat: await lstat(join(directory, name)).catch(() => null),
      })),
    );
    for (const { name, stat } of candidates.sort(
      (a, b) => (b.stat?.mtimeMs ?? 0) - (a.stat?.mtimeMs ?? 0),
    )) {
      if (
        !stat?.isFile() ||
        stat.isSymbolicLink() ||
        stat.size > maxEntryBytes ||
        stat.mtimeMs < Date.now() - maxAge
      )
        continue;
      try {
        const value = unseal<{
          identity: CanvasCacheIdentity;
          graph: ArchitectureGraph;
        }>(await readFile(join(directory, name)), "canvas:" + name);
        if (
          this.prefix(value.identity) !== prefix ||
          projectCacheScope(value.identity) !== projectCacheScope(identity)
        )
          continue;
        const graph = cacheGraph(value.graph);
        if (
          graph.schemaVersion !== this.schema ||
          graph.analyzerVersion !== this.version ||
          graph.mode !== "live" ||
          graph.projectRef !==
            `github-user-${identity.userId}/github-${identity.repositoryId}` ||
          !name.endsWith(`.${graph.revision}.bin`) ||
          !Number.isFinite(Date.parse(graph.generatedAt))
        )
          continue;
        return {
          graph,
          repositoryName: identity.repositoryName,
          scope: projectCacheScope(identity),
        };
      } catch {
        /* Corrupt/incompatible entries are cache misses; never source data. */
      }
    }
    return null;
  }
  async put(identity: CanvasCacheIdentity, input: ArchitectureGraph) {
    const graph = cacheGraph(input);
    if (
      graph.analyzerVersion !== this.version ||
      graph.schemaVersion !== this.schema ||
      graph.mode !== "live" ||
      !/^[a-f0-9]{40}$/.test(graph.revision) ||
      graph.projectRef !==
        `github-user-${identity.userId}/github-${identity.repositoryId}`
    )
      throw new Error("Canvas cache scope mismatch");
    const directory = await this.directory();
    const name = this.prefix(identity) + graph.revision + ".bin";
    // Explicit projection prevents accidental credential fields entering the envelope.
    const data = seal(
      {
        identity: {
          workspace: identity.workspace,
          userId: identity.userId,
          provider: identity.provider,
          installationId: identity.installationId,
          repositoryId: identity.repositoryId,
          repositoryName: identity.repositoryName,
        },
        graph,
      },
      "canvas:" + name,
    );
    if (data.byteLength > maxEntryBytes)
      throw new Error("Canvas graph exceeds local cache budget");
    const target = join(directory, name),
      temporary = target + "." + randomBytes(8).toString("hex") + ".tmp";
    try {
      await writeFile(temporary, data, { flag: "wx", mode: 0o600 });
      for (let attempt = 0; ; attempt++) {
        try {
          await rename(temporary, target);
          break;
        } catch (error) {
          if (
            process.platform !== "win32" ||
            attempt >= 4 ||
            !["EPERM", "EACCES"].includes(
              (error as NodeJS.ErrnoException).code ?? "",
            )
          )
            throw error;
          await delay(20 * 2 ** attempt);
        }
      }
    } finally {
      await unlink(temporary).catch(() => undefined);
    }
    await this.cleanup(directory, name);
    return {
      graph,
      repositoryName: identity.repositoryName,
      scope: projectCacheScope(identity),
    };
  }
  async purge(
    identity: Pick<
      CanvasCacheIdentity,
      "userId" | "workspace" | "repositoryId"
    >,
  ) {
    const directory = await this.directory();
    const prefix = projectCacheScope(identity) + ".";
    await Promise.all(
      (await readdir(directory))
        .filter((name) => cacheName.test(name) && name.startsWith(prefix))
        .map((name) => unlink(join(directory, name)).catch(() => undefined)),
    );
  }
  private async cleanup(directory: string, keep: string) {
    const names = (await readdir(directory)).filter((name) =>
      cacheName.test(name),
    );
    const entries = await Promise.all(
      names.map(async (name) => ({
        name,
        stat: await lstat(join(directory, name)).catch(() => null),
      })),
    );
    let bytes = 0,
      count = 0;
    for (const { name, stat } of entries.sort((a, b) =>
      a.name === keep
        ? -1
        : b.name === keep
          ? 1
          : (b.stat?.mtimeMs ?? 0) - (a.stat?.mtimeMs ?? 0),
    )) {
      if (!stat) continue;
      bytes += stat.size;
      count++;
      if (
        name !== keep &&
        (stat.isSymbolicLink() ||
          Date.now() - stat.mtimeMs > maxAge ||
          bytes > maxDiskBytes ||
          count > maxEntries)
      )
        await unlink(join(directory, name)).catch(() => undefined);
    }
  }
}

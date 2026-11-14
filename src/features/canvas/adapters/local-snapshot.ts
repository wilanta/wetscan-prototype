/** Internal CLI/tests only. Do not import this adapter in a route or client bundle (CAN-001). */
import { lstat, open, readdir, realpath } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import type { RepositorySnapshot, SnapshotEntry } from "../contracts";
import { limits, redactEnvironmentNames, safePath } from "../discovery/safety";
export async function localSnapshot(
  root: string,
  metadata: { repositoryRef: string; revision: string; branch?: string },
): Promise<RepositorySnapshot> {
  const base = await realpath(resolve(root));
  const contained = (path: string) => {
    const rel = relative(base, path);
    return rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
  };
  return {
    sourceKind: "local_test",
    ...metadata,
    async listFiles() {
      const entries: SnapshotEntry[] = [];
      const started = Date.now();
      async function walk(dir: string, depth: number) {
        if (
          depth > limits.maxDepth ||
          entries.length > limits.maxFiles ||
          Date.now() - started > limits.maxMs
        )
          return;
        const folder = await readdir(dir, { withFileTypes: true });
        for (const item of folder.sort((a, b) =>
          a.name.localeCompare(b.name),
        )) {
          if (entries.length > limits.maxFiles) break;
          const path = join(dir, item.name);
          const rel = relative(base, path).split(sep).join("/");
          if (item.isSymbolicLink()) {
            entries.push({ path: rel, size: 0, symlink: true });
            continue;
          }
          if (item.isDirectory()) {
            if (
              !/^(?:node_modules|\.next|dist|build|\.git|coverage|vendor|generated|\.auth|sessions?|credentials?)$/i.test(
                item.name,
              )
            )
              await walk(path, depth + 1);
          } else if (safePath(rel)) {
            const stat = await lstat(path);
            entries.push({ path: rel, size: stat.size });
          }
        }
      }
      await walk(base, 0);
      // A sentinel makes an interrupted directory walk visible as partial coverage.
      if (Date.now() - started > limits.maxMs)
        entries.push({
          path: "__listing_timeout__.ts",
          size: limits.maxTotalBytes + 1,
        });
      return entries;
    },
    async readTextFile(path) {
      if (!safePath(path)) return null;
      const target = resolve(base, path);
      if (!contained(target)) return null;
      try {
        const stat = await lstat(target);
        if (
          !stat.isFile() ||
          stat.isSymbolicLink() ||
          stat.size > limits.maxFileBytes ||
          !contained(await realpath(target))
        )
          return null;
        const handle = await open(target, "r");
        try {
          const current = await handle.stat();
          if (
            !current.isFile() ||
            current.size > limits.maxFileBytes ||
            !contained(await realpath(target))
          )
            return null;
          const bytes = Buffer.alloc(limits.maxFileBytes + 1);
          const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);
          if (bytesRead > limits.maxFileBytes) return null;
          const text = bytes.subarray(0, bytesRead).toString("utf8");
          if (text.includes("\0") || text.includes("\uFFFD")) return null;
          return path.endsWith(".env.example")
            ? redactEnvironmentNames(text)
            : text;
        } finally {
          await handle.close();
        }
      } catch {
        return null;
      }
    },
  };
}

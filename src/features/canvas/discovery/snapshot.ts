import type { RepositorySnapshot } from "../contracts";
import { limits, redactEnvironmentNames, safePath } from "./safety";
export function memorySnapshot(
  files: Record<string, string>,
  metadata: {
    repositoryRef?: string;
    revision?: string;
    branch?: string;
    sourceKind?: RepositorySnapshot["sourceKind"];
  } = {},
): RepositorySnapshot {
  return {
    sourceKind: metadata.sourceKind ?? "local_test",
    repositoryRef: metadata.repositoryRef ?? "internal/example",
    revision: metadata.revision ?? "fixture-v1",
    branch: metadata.branch ?? "main",
    async listFiles() {
      return Object.entries(files).map(([path, text]) => ({
        path,
        size: new TextEncoder().encode(text).length,
      }));
    },
    async readTextFile(path) {
      if (!safePath(path)) return null;
      const text = Object.hasOwn(files, path) ? files[path] : null;
      if (
        text === null ||
        text.includes("\0") ||
        new TextEncoder().encode(text).length > limits.maxFileBytes
      )
        return null;
      return path.endsWith(".env.example")
        ? redactEnvironmentNames(text)
        : text;
    },
  };
}

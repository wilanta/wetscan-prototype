import { vi } from "vitest";
import { createHash } from "node:crypto";
import type {
  SourceAccess,
  SourceEntry,
} from "../../../src/features/guard/live/model";
import { authority } from "./operational-fixture";
export function sourceFixture(
  options: {
    count?: number;
    delay?: number;
    bytes?: number;
    failAt?: number;
    error?: unknown;
    corruptAt?: number;
  } = {},
) {
  const count = options.count ?? 80,
    content = new Map<string, Buffer>();
  const entries: SourceEntry[] = Array.from({ length: count }, (_, i) => {
    const b = Buffer.from(
      ("/* " + i + " */\n").padEnd(options.bytes ?? 32, "x"),
    );
    const sha = createHash("sha1")
      .update("blob " + b.length + "\0")
      .update(b)
      .digest("hex");
    content.set(sha, b);
    return {
      path: "src/file" + String(i).padStart(4, "0") + ".js",
      sha,
      type: "blob",
      mode: "100644",
      size: b.length,
    };
  });
  let active = 0,
    peak = 0,
    completed = 0;
  const startedAt = performance.now();
  const grant = {
    ...authority.grant,
    issuedAt: Date.now(),
    expiresAt: Date.now() + 60000,
  };
  const current = () => ({
    ...authority,
    grant: { ...grant, issuedAt: Date.now(), expiresAt: Date.now() + 60000 },
  });
  const close = vi.fn(async () => {});
  const blob = vi.fn(async (hash: string, signal: AbortSignal) => {
    const i = entries.findIndex((e) => e.sha === hash);
    active++;
    peak = Math.max(peak, active);
    try {
      if (signal.aborted) throw Error("synthetic aborted");
      if (options.delay)
        await new Promise<void>((resolve, reject) => {
          const done = () => {
            clearTimeout(timer);
            signal.removeEventListener("abort", abort);
          };
          const abort = () => {
            done();
            reject(Error("synthetic aborted"));
          };
          const timer = setTimeout(() => {
            done();
            resolve();
          }, options.delay);
          signal.addEventListener("abort", abort, { once: true });
        });
      if (i === options.failAt)
        throw options.error ?? Error("synthetic provider failure");
      const b = content.get(hash)!;
      completed++;
      return {
        sha: i === options.corruptAt ? "f".repeat(40) : hash,
        size: b.length,
        encoding: "base64",
        content: b.toString("base64"),
      };
    } finally {
      active--;
    }
  });
  const source: SourceAccess = {
    authorize: vi.fn(async () => current()),
    open: vi.fn(async () => ({
      head: async () => ({ commit: "a".repeat(40), tree: "b".repeat(40) }),
      tree: async () => ({ sha: "b".repeat(40), truncated: false, entries }),
      blob,
      close,
    })),
  };
  const request = {
    mode: "live" as const,
    workspaceId: grant.workspaceId,
    projectId: grant.projectId,
    repository: {
      provider: "github" as const,
      repositoryId: "123",
      branch: "main",
      commit: "a".repeat(40),
    },
    profile: "quick" as const,
    engines: ["sast" as const],
    idempotencyKey: "g02-live-source-fixture-0001",
  };
  return {
    source,
    grant,
    request,
    entries,
    blob,
    close,
    metrics: () => ({
      active,
      peak,
      completed,
      elapsedMs: performance.now() - startedAt,
    }),
  };
}

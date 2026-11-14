import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { createHash, generateKeyPairSync, randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
vi.mock("server-only", () => ({}));
import {
  GitHubRepositorySnapshotReader,
  workspaceScope,
} from "../../src/features/canvas/server/github-reader";
import { SnapshotCanvasSource } from "../../src/features/canvas/adapters/snapshot-source";
import { sourceRequest } from "../../src/features/canvas/server/github-api";
import {
  newSession,
  saveSession,
  getSession,
} from "../../src/lib/auth/session";
import { writeRecord, deleteRecord } from "../../src/lib/auth/store";
import type { Profile } from "../../src/lib/auth/types";
import { loadCanvas } from "../../src/features/canvas/service";
import { UnavailableCanvasOverlaySource } from "../../src/features/canvas/adapters/overlay-unavailable";
import {
  DemoCanvasSource,
  demoProjectRef,
  demoOverlaySource,
} from "../../src/features/canvas/adapters/demo-source";
import { initialState } from "../../src/data/demo";

let directory: string, token: string;
let profile: Profile;
const revision = "a".repeat(40),
  treeSha = "b".repeat(40);
const permission = { metadata: "read", contents: "read" };
const files: Record<string, string> = {
  "package.json": JSON.stringify({ dependencies: { next: "16", pg: "8" } }),
  "src/app/api/orders/route.ts":
    "import { db } from '../../../lib/db'; export async function GET() { return db.query('select 1'); }",
  "src/lib/db.ts": "import { Pool } from 'pg'; export const db = new Pool();",
  ".env.example":
    "PASSWORD=never-return-this-secret\nDATABASE_URL=postgres://user:secret@host/db",
};
function blobSha(text: string) {
  return createHash("sha1")
    .update(`blob ${Buffer.byteLength(text)}\0`)
    .update(text)
    .digest("hex");
}
function json(value: unknown, status = 200, headers?: HeadersInit) {
  return new Response(JSON.stringify(value), { status, headers });
}
function provider(
  options: {
    revoked?: boolean;
    userDenied?: boolean;
    appDenied?: boolean;
    truncated?: boolean;
    extra?: boolean;
    badHash?: boolean;
    malformed?: boolean;
    rate?: boolean;
    duringRead?: () => Promise<void>;
  } = {},
) {
  const source = { ...files };
  const secondSource = {
    ...files,
    "src/app/api/billing/route.ts":
      "export async function POST() { return Response.json({ ok: true }); }",
  };
  delete (secondSource as Record<string, string>)[
    "src/app/api/orders/route.ts"
  ];
  const tree = Object.entries(source).map(([path, text]) => ({
    path,
    mode: "100644",
    type: "blob",
    size: Buffer.byteLength(text),
    sha: blobSha(text),
  }));
  if (options.extra)
    tree.push(
      {
        path: "huge.ts",
        mode: "100644",
        type: "blob",
        size: 999999,
        sha: "c".repeat(40),
      },
      {
        path: "../unsafe.ts",
        mode: "100644",
        type: "blob",
        size: 12,
        sha: "d".repeat(40),
      },
      {
        path: ".env.local",
        mode: "100644",
        type: "blob",
        size: 12,
        sha: "e".repeat(40),
      },
      {
        path: "linked.ts",
        mode: "120000",
        type: "blob",
        size: 12,
        sha: "f".repeat(40),
      },
    );
  const fetcher = vi.fn(
    async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input));
      const auth = new Headers(init?.headers).get("authorization");
      expect(url.origin).toBe("https://api.github.com");
      if (url.pathname === "/user") return json({ id: 501, login: "owner" });
      if (url.pathname === "/user/installations")
        return json({
          installations: [{ id: 77, app_id: 123, suspended_at: null }],
        });
      if (url.pathname === "/app/installations/77")
        return options.revoked
          ? json({}, 404)
          : json({
              id: 77,
              app_id: 123,
              suspended_at: null,
              permissions: permission,
            });
      if (url.pathname === "/app/installations/77/access_tokens") {
        expect(JSON.parse(init?.body as string)).toEqual({
          repository_ids: [expect.any(Number)],
          permissions: permission,
        });
        return json({
          token: "private-installation-token",
          expires_at: new Date(Date.now() + 3600000).toISOString(),
        });
      }
      if (/^\/repositories\/(101|202)$/.test(url.pathname)) {
        if (
          (options.userDenied && auth === "Bearer private-user-token") ||
          (options.appDenied && auth === "Bearer private-installation-token")
        )
          return json({}, 404);
        const id = Number(url.pathname.split("/").at(-1));
        return json({
          id,
          full_name: id === 101 ? "owner/first" : "owner/second",
          default_branch: "main",
        });
      }
      if (/\/commits\/main$/.test(url.pathname))
        return json({
          sha: revision,
          commit: {
            tree: {
              sha: url.pathname.includes("/second/") ? "c".repeat(40) : treeSha,
            },
          },
        });
      if (url.pathname.includes("/git/trees/"))
        return options.malformed
          ? json({ sha: treeSha, tree: null })
          : url.pathname.includes("/second/")
            ? json({
                sha: "c".repeat(40),
                truncated: false,
                tree: Object.entries(secondSource).map(([path, text]) => ({
                  path,
                  mode: "100644",
                  type: "blob",
                  size: Buffer.byteLength(text),
                  sha: blobSha(text),
                })),
              })
            : json({ sha: treeSha, truncated: !!options.truncated, tree });
      if (url.pathname.includes("/git/blobs/")) {
        if (options.duringRead) await options.duringRead();
        if (
          options.rate &&
          url.pathname.endsWith(blobSha(source["src/lib/db.ts"]))
        )
          return json({}, 429);
        const text = Object.values({ ...source, ...secondSource }).find(
          (text) => url.pathname.endsWith(blobSha(text)),
        )!;
        return json({
          sha: options.badHash ? "f".repeat(40) : blobSha(text),
          size: Buffer.byteLength(text),
          encoding: "base64",
          content: Buffer.from(text).toString("base64"),
        });
      }
      if (url.pathname === "/installation/token" && init?.method === "DELETE")
        return new Response(null, { status: 204 });
      throw new Error("Unexpected provider endpoint");
    },
  );
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}
function snapshot(projectId = "github-101", ref?: string) {
  return new GitHubRepositorySnapshotReader(token).getSnapshot({
    authenticatedWorkspaceId: workspaceScope(profile),
    projectId,
    revision: ref,
  });
}
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "wetscan-canvas-reader-"));
  vi.stubEnv("APP_URL", "http://localhost:3000");
  vi.stubEnv("AUTH_SECRET", randomBytes(32).toString("hex"));
  vi.stubEnv("AUTH_DATA_DIR", directory);
  vi.stubEnv("GITHUB_APP_ID", "123");
  vi.stubEnv("GITHUB_APP_SLUG", "test-app");
  vi.stubEnv("GITHUB_APP_CLIENT_ID", "test-client");
  vi.stubEnv("GITHUB_APP_CLIENT_SECRET", "test-secret");
  vi.stubEnv(
    "GITHUB_APP_PRIVATE_KEY",
    generateKeyPairSync("rsa", { modulusLength: 2048 })
      .privateKey.export({ type: "pkcs8", format: "pem" })
      .toString(),
  );
});
beforeEach(async () => {
  profile = {
    githubId: 501,
    login: "owner",
    workspace: "Private workspace",
    installationId: 77,
    repositories: [
      {
        id: 101,
        fullName: "owner/first",
        private: true,
        defaultBranch: "main",
      },
      {
        id: 202,
        fullName: "owner/second",
        private: true,
        defaultBranch: "main",
      },
    ],
    email: "a@example.test",
    securityNotifications: true,
    productUpdates: false,
    completedAt: new Date().toISOString(),
  };
  await writeRecord("user-501", profile);
  ({ token } = await newSession({
    githubId: 501,
    workspace: profile.workspace,
    userToken: "private-user-token",
    expiresAt: Date.now() + 60000,
  }));
});
afterEach(() => vi.unstubAllGlobals());
afterAll(async () => {
  if (
    !relative(resolve(tmpdir()), resolve(directory)).startsWith(
      "wetscan-canvas-reader-",
    )
  )
    throw new Error("Unsafe cleanup");
  await rm(directory, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

describe("authorized GitHub snapshot to existing Canvas discovery", () => {
  it("pins source, redacts environment values, keeps credentials out of a serializable graph and revokes its read token", async () => {
    const fetcher = provider();
    const value = await snapshot();
    expect(await value.readTextFile(".env.example")).not.toContain(
      "never-return-this-secret",
    );
    expect(await value.readTextFile("../unsafe.ts")).toBeNull();
    const graph = await SnapshotCanvasSource(value).loadGraph({
      projectRef: value.repositoryRef,
      revision,
    });
    expect(graph.mode).toBe("live");
    expect(graph.nodes.some((n) => n.label.includes("orders"))).toBe(true);
    expect(graph.evidence.every((e) => e.sourceRevision === revision)).toBe(
      true,
    );
    expect(JSON.stringify(graph)).not.toMatch(
      /private-(installation|user)-token|never-return-this-secret|postgres:\/\//,
    );
    expect(
      fetcher.mock.calls.some(
        ([url, init]) =>
          String(url).endsWith("/installation/token") &&
          init?.method === "DELETE",
      ),
    ).toBe(true);
  });
  it("gives two selected repositories independent IDs and graphs", async () => {
    provider();
    const a = await snapshot(),
      b = await snapshot("github-202");
    const ga = await SnapshotCanvasSource(a).loadGraph({
      projectRef: a.repositoryRef,
    });
    const gb = await SnapshotCanvasSource(b).loadGraph({
      projectRef: b.repositoryRef,
    });
    expect(ga.projectRef).not.toBe(gb.projectRef);
    expect(ga.nodes.some((n) => n.label === "/api/orders")).toBe(true);
    expect(gb.nodes.some((n) => n.label === "/api/billing")).toBe(true);
    expect(gb.nodes.some((n) => n.label === "/api/orders")).toBe(false);
    expect(
      ga.nodes.every((n) => !gb.nodes.some((other) => n.id === other.id)),
    ).toBe(true);
  });
  it("denies an unselected repository before contacting GitHub", async () => {
    const fetcher = provider();
    await expect(snapshot("github-303")).rejects.toMatchObject({
      code: "repository_denied",
    });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each([undefined, "invalid"])(
    "rejects missing or invalid session %s",
    async (sessionToken) => {
      const fetcher = provider();
      await expect(
        new GitHubRepositorySnapshotReader(sessionToken).getSnapshot({
          authenticatedWorkspaceId: workspaceScope(profile),
          projectId: "github-101",
        }),
      ).rejects.toMatchObject({ code: "unauthenticated" });
      expect(fetcher).not.toHaveBeenCalled();
    },
  );
  it("rejects expired sessions", async () => {
    provider();
    const session = (await getSession(token))!;
    session.expiresAt = Date.now() - 1;
    await saveSession(token, session);
    await expect(snapshot()).rejects.toMatchObject({ code: "unauthenticated" });
  });
  it("requires completed onboarding", async () => {
    provider();
    delete profile.completedAt;
    await writeRecord("user-501", profile);
    await expect(snapshot()).rejects.toMatchObject({
      code: "onboarding_incomplete",
    });
  });
  it("denies a mismatched workspace", async () => {
    provider();
    await expect(
      new GitHubRepositorySnapshotReader(token).getSnapshot({
        authenticatedWorkspaceId: "other",
        projectId: "github-101",
      }),
    ).rejects.toMatchObject({ code: "repository_denied" });
  });
  it("denies revoked installations", async () => {
    provider({ revoked: true });
    await expect(snapshot()).rejects.toMatchObject({
      code: "installation_denied",
    });
  });
  it.each(["userDenied", "appDenied"] as const)(
    "revalidates %s repository access",
    async (key) => {
      provider({ [key]: true });
      await expect(snapshot()).rejects.toMatchObject({
        code: "repository_denied",
      });
    },
  );
  it.each(["main", "../main", "a".repeat(39)])(
    "rejects invalid revision %s",
    async (ref) => {
      const fetcher = provider();
      await expect(snapshot("github-101", ref)).rejects.toMatchObject({
        code: "invalid_revision",
      });
      expect(fetcher).not.toHaveBeenCalled();
    },
  );
  it("rejects stale commits and accepts current pinned HEAD", async () => {
    provider();
    await expect(snapshot("github-101", "c".repeat(40))).rejects.toMatchObject({
      code: "stale_revision",
    });
    expect((await snapshot("github-101", revision)).revision).toBe(revision);
  });
  it("reports truncation, unsafe paths and oversized files without fetching their blobs", async () => {
    const fetcher = provider({ truncated: true, extra: true });
    const value = await snapshot();
    const graph = await SnapshotCanvasSource(value).loadGraph({
      projectRef: value.repositoryRef,
    });
    expect(graph.diagnostics.map((d) => d.code)).toEqual(
      expect.arrayContaining([
        "github_tree_truncated",
        "github_snapshot_limit",
        "github_excluded_paths",
      ]),
    );
    expect(
      graph.coverage.some(
        (c) => c.capability === "provider-retrieval" && c.status === "partial",
      ),
    ).toBe(true);
    expect(
      fetcher.mock.calls.some(([url]) =>
        String(url).endsWith("/git/blobs/" + "c".repeat(40)),
      ),
    ).toBe(false);
  });
  it("reports partial blob rate limits", async () => {
    provider({ rate: true });
    const value = await snapshot();
    expect(
      value.diagnostics?.some((d) => d.code === "github_read_partial"),
    ).toBe(true);
  });
  it.each(["badHash", "malformed"] as const)(
    "rejects malformed or mismatched source %s",
    async (key) => {
      provider({ [key]: true });
      await expect(snapshot()).rejects.toMatchObject({
        code: "github_response",
      });
    },
  );
  it("never releases a graph after logout during retrieval", async () => {
    let logout: Promise<void> | undefined;
    provider({
      duringRead: async () => {
        const { sessionKey } = await import("../../src/lib/auth/session");
        await (logout ??= deleteRecord(sessionKey(token)));
      },
    });
    await expect(snapshot()).rejects.toMatchObject({ code: "unauthenticated" });
  });
  it("rejects oversized streamed responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({ value: "x".repeat(100) })),
    );
    await expect(
      sourceRequest("/test", "private", AbortSignal.timeout(1000), 20),
    ).rejects.toMatchObject({ code: "source_response_limit" });
  });
  it("keeps synthetic results out of real graphs while Orderly Demo retains its overlays", async () => {
    provider();
    const value = await snapshot();
    const live = await loadCanvas(
      SnapshotCanvasSource(value),
      value.repositoryRef,
      UnavailableCanvasOverlaySource,
    );
    expect(live.security.findings).toEqual([]);
    expect(live.security.incidents).toEqual([]);
    const demo = await loadCanvas(
      DemoCanvasSource,
      demoProjectRef,
      demoOverlaySource(initialState()),
    );
    expect(demo.graph.mode).toBe("demo");
    expect(demo.security.findings.length).toBeGreaterThan(0);
  });
});

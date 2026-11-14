import { describe, expect, it } from "vitest";
import { mkdtemp, mkdir, writeFile, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { analyzeSnapshot } from "../../src/features/canvas/discovery/analyzer";
import { memorySnapshot } from "../../src/features/canvas/discovery/snapshot";
import { fixtures } from "../../src/features/canvas/discovery/fixtures";
import { localSnapshot } from "../../src/features/canvas/adapters/local-snapshot";
import {
  parseSource,
  routeInfo,
} from "../../src/features/canvas/discovery/source-parser";
import { limits, safePath } from "../../src/features/canvas/discovery/safety";
import { validateGraph } from "../../src/features/canvas/validation";
import committed from "../../src/features/canvas/adapters/fixture-graphs.json";
const analyze = (key: string) =>
  analyzeSnapshot(memorySnapshot(fixtures[key].files));
describe("Canvas deterministic source discovery", () => {
  it("rejects malformed snapshot listing metadata without crashing", async () => {
    const source = memorySnapshot({});
    const invalid = {
      ...source,
      async listFiles() {
        return [{ path: 42, size: 1 }, null] as never;
      },
    };
    expect(
      (await analyzeSnapshot(invalid)).diagnostics.some(
        (d) => d.code === "invalid_entries",
      ),
    ).toBe(true);
    expect(
      (
        await analyzeSnapshot({
          ...source,
          async listFiles() {
            return {} as never;
          },
        })
      ).diagnostics[0].code,
    ).toBe("invalid_listing");
  });
  it("App Router methods, source paths and SDK wrapper import chains carry evidence", async () => {
    const graph = await analyze("a");
    const api = graph.nodes.find((n) => n.kind === "api")!;
    expect(api.label).toBe("/api/orders/[id]");
    expect(api.metadata?.methods).toBe("GET, PATCH");
    const auth = graph.nodes.find((n) => n.label === "Clerk")!;
    const db = graph.nodes.find((n) => n.label === "Prisma")!;
    expect(
      graph.edges.some(
        (e) =>
          e.source === api.id &&
          e.target === auth.id &&
          e.origin === "verified",
      ),
    ).toBe(true);
    expect(
      graph.edges.some(
        (e) =>
          e.source === api.id &&
          e.target === db.id &&
          e.relationship === "imports",
      ),
    ).toBe(true);
    const evidence = graph.evidence.find(
      (e) => e.sourcePath?.endsWith("[id]/route.ts") && e.startLine === 1,
    );
    expect(evidence?.sourceRevision).toBe("fixture-v1");
    expect(graph.nodes.some((n) => n.label === "Stripe")).toBe(false);
    expect(
      graph.nodes.find((n) => n.kind === "frontend")?.metadata?.packageManager,
    ).toBe("npm");
    expect(graph.nodes.find((n) => n.kind === "hosting")?.origin).toBe(
      "inferred",
    );
    expect(graph.edges.every((e) => e.evidenceIds.length > 0)).toBe(true);
    expect(validateGraph(graph)).toEqual(graph);
  });
  it("Pages Router index and SDK use do not invent auth or HTTP methods", async () => {
    const graph = await analyze("b");
    expect(graph.nodes.find((n) => n.kind === "api")?.metadata).toMatchObject({
      route: "/api/payments",
      methods: "unknown",
    });
    expect(graph.nodes.some((n) => n.label === "Stripe")).toBe(true);
    expect(graph.nodes.some((n) => n.kind === "auth")).toBe(false);
    expect(graph.nodes.some((n) => n.kind === "ci")).toBe(true);
  });
  it("WetScan miniature finds custom auth without inventing PostgreSQL", async () => {
    const graph = await analyze("c");
    expect(
      graph.nodes
        .filter((n) => n.kind === "api")
        .map((n) => n.label)
        .sort(),
    ).toEqual(["/api/auth/github", "/api/onboarding"]);
    expect(graph.nodes.some((n) => n.label === "Custom auth source")).toBe(
      true,
    );
    expect(graph.nodes.some((n) => n.kind === "database")).toBe(false);
  });
  it("malformed, secret, traversal, binary, giant and unknown files produce safe diagnostics", async () => {
    const graph = await analyze("d");
    expect(graph.diagnostics.map((d) => d.code)).toEqual(
      expect.arrayContaining([
        "malformed_manifest",
        "malformed_source",
        "unknown_framework",
        "size_limit",
        "excluded_files",
      ]),
    );
    expect(JSON.stringify(graph)).not.toContain("SECRET_MUST_NOT_APPEAR");
    expect(graph.nodes.some((n) => n.kind === "api")).toBe(false);
  });
  it("monorepo IDs, service scopes and grouping stay stable regardless of file order", async () => {
    const one = await analyze("e");
    const two = await analyzeSnapshot(
      memorySnapshot(
        Object.fromEntries(Object.entries(fixtures.e.files).reverse()),
      ),
    );
    expect(one.nodes).toEqual(two.nodes);
    expect(one.edges).toEqual(two.edges);
    expect(one.nodes.filter((n) => n.kind === "service_group")).toHaveLength(2);
    expect(
      one.nodes.filter((n) => n.kind === "api").every((n) => n.groupId),
    ).toBe(true);
  });
  it.each(["a", "b", "c", "d", "e"])(
    "committed UI example %s is reproducible from actual fixture parsing",
    async (key) => {
      const graph = await analyzeSnapshot(
        memorySnapshot(fixtures[key].files, {
          repositoryRef: `internal:${key}`,
          revision: `example-${key}-v1`,
          branch: "example",
        }),
        { analyzedAt: "2026-11-14T00:00:00.000Z" },
      );
      expect(graph).toEqual(committed[key as keyof typeof committed]);
    },
  );
  it("deduplicates services referenced by multiple routes while retaining evidence", async () => {
    const graph = await analyzeSnapshot(
      memorySnapshot({
        ...fixtures.a.files,
        "src/app/api/users/route.ts":
          'import { PrismaClient } from "@prisma/client"; export const POST = () => new PrismaClient();',
      }),
    );
    expect(graph.nodes.filter((n) => n.label === "Prisma")).toHaveLength(1);
    expect(
      graph.nodes.find((n) => n.label === "Prisma")!.evidenceIds.length,
    ).toBe(2);
  });
  it("does not execute imported repository code", async () => {
    const graph = await analyzeSnapshot(
      memorySnapshot({
        "src/app/api/trap/route.ts":
          'throw new Error("MUST_NOT_EXECUTE"); export function GET() { return fetch("https://never.example"); }',
      }),
    );
    expect(graph.nodes.some((n) => n.label === "/api/trap")).toBe(true);
  });
  it("budgets count, byte size, return size and unavailable readers", async () => {
    const source = memorySnapshot(fixtures.a.files);
    expect(
      (
        await analyzeSnapshot(source, { limits: { maxFiles: 1 } })
      ).diagnostics.some((d) => d.code === "file_count_limit"),
    ).toBe(true);
    expect(
      (
        await analyzeSnapshot(source, { limits: { maxTotalBytes: 1 } })
      ).diagnostics.some((d) => d.code === "size_limit"),
    ).toBe(true);
    const liar = {
      ...source,
      async listFiles() {
        return [{ path: "huge.ts", size: 1 }];
      },
      async readTextFile() {
        return "a".repeat(limits.maxFileBytes + 1);
      },
    };
    expect(
      (await analyzeSnapshot(liar)).diagnostics.some(
        (d) => d.code === "size_limit",
      ),
    ).toBe(true);
    expect(
      (
        await analyzeSnapshot({
          ...source,
          async listFiles() {
            throw new Error("private token");
          },
        })
      ).diagnostics[0].code,
    ).toBe("snapshot_unavailable");
  });
  it("time budget returns a partial graph even when a reader never settles", async () => {
    const source = {
      ...memorySnapshot({}),
      async listFiles() {
        return new Promise<never>(() => {});
      },
    };
    expect(
      (await analyzeSnapshot(source, { limits: { maxMs: 5 } })).diagnostics[0]
        .code,
    ).toBe("snapshot_unavailable");
  });
  it.each([
    "../route.ts",
    "/root.ts",
    "C:\\private.ts",
    "src/../escape.ts",
    "src/%2e%2e/secret.ts",
    "node_modules/a.ts",
    ".env",
    ".env.local",
    "private.pem",
    "session.json",
    ".auth/store.json",
    "app.min.js",
  ])("rejects unsafe path %s", (path) => expect(safePath(path)).toBe(false));
  it("reads variable names only from an environment example", async () => {
    const source = memorySnapshot({
      ".env.example": "DATABASE_URL=postgres://private\nAPI_KEY=DO_NOT_RETAIN",
    });
    expect(await source.readTextFile(".env.example")).toBe(
      "DATABASE_URL=[redacted]\nAPI_KEY=[redacted]",
    );
  });
  it("local filesystem adapter rejects traversal and symlink escapes without reading outside root", async () => {
    const root = await mkdtemp(join(tmpdir(), "canvas-local-"));
    const external = await mkdtemp(join(tmpdir(), "canvas-external-"));
    try {
      await mkdir(join(root, "src"));
      await writeFile(
        join(root, "package.json"),
        '{"dependencies":{"next":"16"}}',
      );
      await writeFile(join(root, ".env"), "SECRET_MUST_NOT_APPEAR");
      await writeFile(join(external, "escape.ts"), "SECRET_MUST_NOT_APPEAR");
      await symlink(external, join(root, "linked"), "junction");
      const source = await localSnapshot(root, {
        repositoryRef: "internal:test",
        revision: "test-v1",
      });
      expect(await source.readTextFile("../escape.ts")).toBeNull();
      expect(await source.readTextFile("linked/escape.ts")).toBeNull();
      expect(await source.readTextFile(".env")).toBeNull();
      expect((await source.listFiles()).some((e) => e.symlink)).toBe(true);
      expect(JSON.stringify(await analyzeSnapshot(source))).not.toContain(
        "SECRET_MUST_NOT_APPEAR",
      );
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(external, { recursive: true, force: true });
    }
  });
});
describe("Next route syntax", () => {
  it.each([
    ["app/(internal)/api/[[...path]]/route.ts", "/api/[[...path]]"],
    ["src/app/api/[id]/route.ts", "/api/[id]"],
    ["pages/api/index.ts", "/api"],
    ["src/pages/api/[...all].ts", "/api/[...all]"],
    ["apps/web/src/app/(site)/api/nested/[id]/route.ts", "/api/nested/[id]"],
  ])("normalizes %s", (path, expected) =>
    expect(
      routeInfo(path, { imports: [], methods: ["GET"], malformed: false })
        ?.route,
    ).toBe(expected),
  );
  it("ignores comments and type-only imports; exported aliases are evident method names", () => {
    const parsed = parseSource(
      "route.ts",
      '// export function DELETE() {}\nimport type { Clerk } from "@clerk/nextjs";\nimport Stripe from "stripe";\nconst example = "export function PUT()";\nfunction handler() { return Stripe; }\nexport { handler as GET };',
    );
    expect(parsed.methods).toEqual(["GET"]);
    expect(parsed.imports[0].used).toBe(false);
    expect(parsed.imports[1].used).toBe(true);
  });
});

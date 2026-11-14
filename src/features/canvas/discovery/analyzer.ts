import type { RepositorySnapshot } from "../contracts";
import type { ArchitectureGraph, ComponentNode, NodeKind } from "../types";
import { normalizeGraph } from "../graph/model";
import { stableId } from "../graph/ids";
import { limits, safePath, type DiscoveryLimits } from "./safety";
import {
  configAliases,
  parseSource,
  routeInfo,
  type ParsedSource,
} from "./source-parser";
export const analyzerVersion = "canvas-next-ts/1.0.0";
const integrations: { pattern: RegExp; kind: NodeKind; label: string }[] = [
  { pattern: /^(?:next-auth|@auth\/)/, kind: "auth", label: "Auth.js" },
  { pattern: /^@clerk\//, kind: "auth", label: "Clerk" },
  { pattern: /^firebase\/auth$/, kind: "auth", label: "Firebase Auth" },
  {
    pattern: /^@supabase\/(?:ssr|auth-helpers)/,
    kind: "auth",
    label: "Supabase Auth",
  },
  { pattern: /^@prisma\/client$/, kind: "database", label: "Prisma" },
  { pattern: /^drizzle-orm(?:\/|$)/, kind: "database", label: "Drizzle" },
  {
    pattern: /^(?:pg|postgres)$/,
    kind: "database",
    label: "PostgreSQL client",
  },
  {
    pattern: /^(?:mongodb|mongoose)$/,
    kind: "database",
    label: "MongoDB client",
  },
  {
    pattern: /^@supabase\/supabase-js$/,
    kind: "external_service",
    label: "Supabase SDK",
  },
  { pattern: /^stripe$/, kind: "external_service", label: "Stripe" },
  { pattern: /^@aws-sdk\/client-s3$/, kind: "storage", label: "S3 SDK" },
  {
    pattern: /^(?:ioredis|redis|@upstash\/redis)$/,
    kind: "cache",
    label: "Redis client",
  },
  { pattern: /^(?:bullmq|amqplib)$/, kind: "queue", label: "Queue client" },
  {
    pattern: /^firebase(?:\/|$)/,
    kind: "external_service",
    label: "Firebase SDK",
  },
  {
    pattern: /^(?:\.|@\/).*\/(?:auth|authentication)(?:\/|\.|$)/,
    kind: "auth",
    label: "Custom auth source",
  },
];
async function bounded<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("Discovery time limit reached")),
          Math.max(1, ms),
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
export async function analyzeSnapshot(
  snapshot: RepositorySnapshot,
  options: { limits?: Partial<DiscoveryLimits>; analyzedAt?: string } = {},
): Promise<ArchitectureGraph> {
  const bound = { ...limits, ...options.limits };
  const started = Date.now();
  const graph: ArchitectureGraph = {
    schemaVersion: 1,
    analyzerVersion,
    projectRef: snapshot.repositoryRef,
    mode: snapshot.sourceKind === "local_test" ? "snapshot" : "live",
    revision: snapshot.revision,
    branch: snapshot.branch,
    environment: "unknown",
    generatedAt: options.analyzedAt ?? new Date().toISOString(),
    nodes: [],
    edges: [],
    evidence: [],
    diagnostics: [],
    coverage: [
      {
        capability: "nextjs-typescript",
        status: "supported",
        detail:
          "App/Pages routes, static imports and supported SDK usage; source observations only.",
      },
      {
        capability: "runtime-connections",
        status: "unsupported",
        detail:
          "No code executed, network accessed, deployment checked or security test run.",
      },
      {
        capability: "generic-frameworks-openapi",
        status: "partial",
        detail:
          "Manifest identification only; Express/Nest/Vite endpoint analysis and OpenAPI are not implemented (CAN-016).",
      },
    ],
  };
  const id = (kind: string, key: string) =>
    stableId(graph.projectRef, kind, key);
  function evidence(
    path: string,
    summary: string,
    line = 1,
    kind: "source_file" | "manifest" | "config" = "source_file",
  ) {
    const key = id("evidence", `${path}:${line}:${summary}`);
    graph.evidence.push({
      id: key,
      kind,
      sourcePath: path,
      startLine: line,
      summary,
      origin: "verified",
      sourceRevision: graph.revision,
    });
    return key;
  }
  function node(
    key: string,
    kind: NodeKind,
    label: string,
    eid: string,
    technology?: string,
    groupId?: string,
  ): ComponentNode {
    const keyId = id(kind, key);
    let value = graph.nodes.find((n) => n.id === keyId);
    if (!value) {
      value = {
        id: keyId,
        kind,
        label,
        technology,
        evidenceIds: [],
        origin: "verified",
        status: "observed_in_source",
        groupId,
        description:
          "Observed in this source revision. Availability, deployment and runtime behavior have not been verified.",
      };
      graph.nodes.push(value);
    }
    value.evidenceIds.push(eid);
    return value;
  }
  let entries;
  try {
    entries = await bounded(snapshot.listFiles(), bound.maxMs);
  } catch {
    graph.diagnostics.push({
      code: "snapshot_unavailable",
      severity: "error",
      message:
        "Snapshot listing failed or timed out. Supply a readable, pinned snapshot and try again.",
    });
    return graph;
  }
  if (!Array.isArray(entries)) {
    graph.diagnostics.push({
      code: "invalid_listing",
      severity: "error",
      message: "Snapshot listing must be an array of file metadata.",
    });
    return graph;
  }
  if (entries.length > bound.maxFiles)
    graph.diagnostics.push({
      code: "file_count_limit",
      severity: "warning",
      message: `Only the first ${bound.maxFiles} entries can be analyzed.`,
    });
  const files = new Map<string, string>();
  let total = 0;
  let skipped = 0;
  const candidates = entries
    .slice(0, bound.maxFiles)
    .filter(
      (entry) =>
        entry &&
        typeof entry.path === "string" &&
        typeof entry.size === "number",
    );
  if (candidates.length !== Math.min(entries.length, bound.maxFiles))
    graph.diagnostics.push({
      code: "invalid_entries",
      severity: "warning",
      message: "Invalid file metadata entries were excluded.",
    });
  for (const entry of candidates.sort((a, b) => a.path.localeCompare(b.path))) {
    if (
      !safePath(entry.path) ||
      entry.symlink ||
      entry.path.split("/").length > bound.maxDepth
    ) {
      skipped++;
      continue;
    }
    if (
      entry.size < 0 ||
      !Number.isFinite(entry.size) ||
      entry.size > bound.maxFileBytes ||
      total + entry.size > bound.maxTotalBytes
    ) {
      graph.diagnostics.push({
        code: "size_limit",
        severity: "warning",
        message: "A file was excluded by the byte budget.",
      });
      continue;
    }
    try {
      const text = await bounded(
        snapshot.readTextFile(entry.path),
        bound.maxMs - (Date.now() - started),
      );
      if (text === null || text.includes("\0")) {
        skipped++;
        continue;
      }
      const size = new TextEncoder().encode(text).length;
      if (size > bound.maxFileBytes || total + size > bound.maxTotalBytes) {
        graph.diagnostics.push({
          code: "size_limit",
          severity: "warning",
          message: "Returned file content exceeded the byte budget.",
        });
        continue;
      }
      total += size;
      files.set(entry.path, text);
    } catch {
      graph.diagnostics.push({
        code: "read_failed",
        severity: "warning",
        message: "A snapshot file could not be read within the time budget.",
      });
    }
    if (Date.now() - started >= bound.maxMs) {
      graph.diagnostics.push({
        code: "time_limit",
        severity: "warning",
        message: "Analysis time budget reached; map is partial.",
      });
      break;
    }
  }
  if (skipped)
    graph.diagnostics.push({
      code: "excluded_files",
      severity: "info",
      message: `${skipped} unsafe, unsupported, binary or symlink entries excluded without exposing content.`,
    });
  const repo: ComponentNode = {
    id: id("repository", "root"),
    kind: "repository",
    label: snapshot.repositoryRef,
    technology: `${snapshot.sourceKind} · ${snapshot.branch ?? "branch unknown"}`,
    origin: "inferred",
    status: "inferred",
    evidenceIds: [],
    description:
      "Repository identity supplied by snapshot metadata; access authorization belongs to the source adapter.",
  };
  graph.nodes.push(repo);
  const packages: { root: string; frontend?: ComponentNode; group?: string }[] =
    [];
  for (const [path, text] of files) {
    if (!/(?:^|\/)package.json$/.test(path)) continue;
    try {
      const manifest: unknown = JSON.parse(text);
      if (!manifest || typeof manifest !== "object" || Array.isArray(manifest))
        throw new Error("Invalid manifest");
      const m = manifest as Record<string, unknown>;
      const deps = {
        ...(typeof m.dependencies === "object" ? m.dependencies : {}),
        ...(typeof m.devDependencies === "object" ? m.devDependencies : {}),
      } as Record<string, unknown>;
      const root = path.slice(0, -"package.json".length);
      const eid = evidence(
        path,
        "Package manifest identifies installed framework dependencies; installation alone does not prove use.",
        1,
        "manifest",
      );
      let group: string | undefined;
      if (root)
        group = node(root, "service_group", root.replace(/\/$/, ""), eid).id;
      const framework = Object.hasOwn(deps, "next")
        ? "Next.js"
        : Object.hasOwn(deps, "vite")
          ? "Vite"
          : Object.hasOwn(deps, "@nestjs/core")
            ? "NestJS"
            : Object.hasOwn(deps, "express")
              ? "Express"
              : undefined;
      const frontend = framework
        ? node(
            root || "app",
            framework === "Express" || framework === "NestJS"
              ? "backend"
              : "frontend",
            root ? `${root}application` : "Web application",
            eid,
            [
              framework,
              Object.hasOwn(deps, "react") ? "React" : "",
              Object.hasOwn(deps, "typescript") ? "TypeScript" : "",
            ]
              .filter(Boolean)
              .join(" · "),
            group,
          )
        : undefined;
      if (frontend) {
        const manager = files.has(`${root}pnpm-lock.yaml`)
          ? "pnpm"
          : files.has(`${root}yarn.lock`)
            ? "yarn"
            : files.has(`${root}bun.lock`)
              ? "bun"
              : files.has(`${root}package-lock.json`)
                ? "npm"
                : "unknown";
        frontend.metadata = {
          packageManager: manager,
          framework: framework ?? "unknown",
          version:
            typeof deps.next === "string" && /^[~^\d.*x -]+$/.test(deps.next)
              ? deps.next
              : "declared version not retained",
        };
      }
      packages.push({ root, frontend, group });
      const sdkCount = Object.keys(deps).filter((key) =>
        integrations.some((rule) => rule.pattern.test(key)),
      ).length;
      if (sdkCount)
        graph.diagnostics.push({
          code: "dependency_usage_required",
          severity: "info",
          message: `${sdkCount} integration dependencies declared; services require concrete source usage.`,
        });
    } catch {
      graph.diagnostics.push({
        code: "malformed_manifest",
        severity: "warning",
        message:
          "A package manifest is malformed; its contents were not retained.",
        sourcePath: path,
      });
    }
  }
  if (!packages.some((p) => p.frontend))
    graph.diagnostics.push({
      code: "unknown_framework",
      severity: "warning",
      message: "No supported framework manifest found. The map is partial.",
    });
  const sourceNodes = new Map<string, ComponentNode>();
  const serviceFiles = new Map<
    string,
    { node: ComponentNode; evidence: string }[]
  >();
  const parsedFiles = new Map<string, ParsedSource>();
  const packageFor = (path: string) =>
    packages
      .filter((p) => path.startsWith(p.root))
      .sort((a, b) => b.root.length - a.root.length)[0];
  for (const [path, text] of files) {
    if (!/\.[cm]?[jt]sx?$/.test(path)) continue;
    if (Date.now() - started > bound.maxMs) {
      graph.diagnostics.push({
        code: "parse_time_limit",
        severity: "warning",
        message:
          "Parsing time budget reached; remaining source files were not analyzed.",
      });
      break;
    }
    const parsed = parseSource(path, text);
    parsedFiles.set(path, parsed);
    if (parsed.malformed) {
      graph.diagnostics.push({
        code: "malformed_source",
        severity: "warning",
        message: "Syntax errors prevented reliable analysis of a source file.",
        sourcePath: path,
      });
      continue;
    }
    const pkg = packageFor(path);
    const route = routeInfo(path, parsed);
    if (route) {
      const eid = evidence(
        path,
        `${route.router}: ${route.route}; ${route.methods.length ? `exported methods ${route.methods.join(", ")}` : "HTTP methods unknown"}.`,
      );
      const api = node(path, "api", route.route, eid, route.router, pkg?.group);
      api.metadata = {
        route: route.route,
        methods: route.methods.join(", ") || "unknown",
      };
      sourceNodes.set(path, api);
      for (const method of route.methods)
        api.evidenceIds.push(
          evidence(
            path,
            `${method} is a statically exported HTTP method. Request authorization and runtime results are not tested.`,
            parsed.methodLines?.[method] ?? 1,
          ),
        );
    } else if (
      /(?:^|\/)(?:src\/)?(?:app\/.*\/page|app\/page|pages\/(?!api\/).*)\.[jt]sx?$/.test(
        path,
      ) &&
      pkg?.frontend
    ) {
      const relative = path.slice(pkg.root.length).replace(/^src\//, "");
      const section = /^(?:app|pages)\/([^/]+)\//.exec(relative)?.[1];
      if (section && section !== "api") {
        const group = node(
          `${pkg.root}frontend:${section}`,
          "frontend",
          `Frontend · ${section.replace(/[()]/g, "")}`,
          evidence(
            path,
            "Frontend route section observed in source; individual component files are not expanded.",
          ),
          pkg.frontend.technology,
          pkg.group,
        );
        sourceNodes.set(path, group);
      } else sourceNodes.set(path, pkg.frontend);
    } else if (
      /(?:^|\/)(?:middleware|proxy)\.[jt]s$/.test(path) &&
      pkg?.frontend
    )
      sourceNodes.set(path, pkg.frontend);
    for (const imp of parsed.imports.filter((i) => i.used)) {
      const rule = integrations.find((rule) => rule.pattern.test(imp.module));
      if (!rule) continue;
      const eid = evidence(
        path,
        `${rule.label} imported and referenced in source. This proves source usage, not a provisioned service or runtime connection.`,
        imp.line,
      );
      const service = node(
        `${pkg?.root ?? ""}${rule.label}`,
        rule.kind,
        rule.label,
        eid,
        rule.label,
        pkg?.group,
      );
      serviceFiles.set(path, [
        ...(serviceFiles.get(path) ?? []),
        { node: service, evidence: eid },
      ]);
    }
  }
  function resolveImport(from: string, specifier: string): string | undefined {
    const pkg = packageFor(from);
    let base: string;
    const aliases = configAliases(
      files.get(`${pkg?.root ?? ""}tsconfig.json`) ?? "{}",
    );
    const alias = aliases.find((a) => specifier.startsWith(a.prefix));
    if (alias) {
      const candidates = alias.targets.map(
        (target) =>
          `${pkg?.root ?? ""}${target}${specifier.slice(alias.prefix.length)}`,
      );
      base =
        candidates.find((candidate) =>
          [
            candidate,
            `${candidate}.ts`,
            `${candidate}.tsx`,
            `${candidate}/index.ts`,
          ].some((p) => safePath(p) && files.has(p)),
        ) ?? candidates[0];
    } else if (specifier.startsWith("@/"))
      base = `${pkg?.root ?? ""}src/${specifier.slice(2)}`;
    else if (specifier.startsWith(".")) {
      const parts = from.split("/").slice(0, -1);
      for (const part of specifier.split("/")) {
        if (part === "..") parts.pop();
        else if (part !== ".") parts.push(part);
      }
      base = parts.join("/");
    } else return undefined;
    return [
      base,
      ...[".ts", ".tsx", ".js", ".jsx", "/index.ts", "/index.tsx"].map(
        (ext) => base.replace(/\.js$/, "") + ext,
      ),
    ].find((path) => safePath(path) && files.has(path));
  }
  for (const [path, source] of sourceNodes) {
    const visited = new Set<string>();
    const queue = [path];
    while (queue.length && visited.size < 100) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);
      for (const service of serviceFiles.get(current) ?? []) {
        if (service.node.id === source.id) continue;
        const chainEvidence =
          current === path
            ? []
            : [
                evidence(
                  path,
                  "Static import chain reaches the referenced SDK wrapper. Aliases support conventional @/src only; runtime execution is unknown.",
                ),
              ];
        graph.edges.push({
          id: id("edge", `${source.id}>${service.node.id}:imports`),
          source: source.id,
          target: service.node.id,
          relationship: "imports",
          evidenceIds: [service.evidence, ...chainEvidence],
          origin: "verified",
          description:
            current === path
              ? "Direct source import and reference; runtime data flow unknown."
              : "Reachable static import chain; runtime data flow unknown.",
        });
      }
      for (const imp of parsedFiles
        .get(current)
        ?.imports.filter((i) => i.used) ?? []) {
        const target = resolveImport(current, imp.module);
        if (target) queue.push(target);
      }
    }
  }
  for (const [path, text] of files) {
    if (path.endsWith(".prisma")) {
      const providers = [
        ...text
          .replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "")
          .matchAll(
            /provider\s*=\s*"(postgresql|mysql|sqlite|mongodb|cockroachdb|sqlserver)"/g,
          ),
      ].map((m) => m[1]);
      for (const provider of new Set(providers))
        node(
          `${packageFor(path)?.root ?? ""}schema:${provider}`,
          "database",
          `${provider} schema`,
          evidence(
            path,
            `Prisma schema configures ${provider}. No database connection or provisioning verified.`,
            1,
            "config",
          ),
          "Prisma schema",
          packageFor(path)?.group,
        );
    }
    if (/(?:^|\/)\.github\/workflows\/[^/]+\.ya?ml$/.test(path))
      node(
        path,
        "ci",
        "CI workflow",
        evidence(
          path,
          "CI workflow file exists. Successful runs and deployment are unknown.",
          1,
          "config",
        ),
        "GitHub Actions configuration",
      );
    if (
      /(?:^|\/)(?:Dockerfile|(?:docker-)?compose\.ya?ml|vercel\.json|railway\.json|netlify\.toml)$/.test(
        path,
      )
    ) {
      const hosting = node(
        path,
        "hosting",
        "Hosting configuration",
        evidence(
          path,
          "Deployment configuration exists. Provider connection and deployment have not been verified.",
          1,
          "config",
        ),
        path.split("/").at(-1),
      );
      hosting.origin = "inferred";
      hosting.status = "inferred";
    }
  }
  graph.coverage.push({
    capability: "source-coverage",
    status: "partial",
    detail: `${files.size} readable files, ${total} bytes; ${skipped} excluded. Static observations never establish security or runtime coverage. Analyzer ${analyzerVersion}.`,
  });
  return normalizeGraph(graph);
}

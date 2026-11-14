// Explicit real-provider benchmark; no provider substitute, not part of npm test.
import { it, expect, vi } from "vitest";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { chromium } from "@playwright/test";
vi.mock("server-only", () => ({}));
import { authConfig } from "../../src/lib/auth/config";
import { readRecord, deleteRecord } from "../../src/lib/auth/store";
import { newSession, profileFor, sessionKey } from "../../src/lib/auth/session";
import type { Session } from "../../src/lib/auth/types";
import {
  GitHubRepositorySnapshotReader,
  workspaceScope,
} from "../../src/features/canvas/server/github-reader";
import { SnapshotCanvasSource } from "../../src/features/canvas/adapters/snapshot-source";
import { layoutGraph } from "../../src/features/canvas/graph/layout";
import { projectCanvasService } from "../../src/features/canvas/server/project-service";

it("measures actual GitHub retrieval, analysis, layout and production Canvas navigation", async () => {
  for (const [key, value] of Object.entries(
    parseEnv(await readFile(".env.local", "utf8")),
  ))
    vi.stubEnv(key, value);
  const records = await readdir(authConfig().directory);
  for (const record of records.filter((s) =>
    /^session-[a-f0-9]{64}\.bin$/.test(s),
  )) {
    const session = await readRecord<Session>(record.slice(0, -4));
    if (
      !session?.githubId ||
      !session.userToken ||
      session.expiresAt <= Date.now() ||
      (session.tokenExpiresAt && session.tokenExpiresAt < Date.now() + 300000)
    )
      continue;
    const profile = await profileFor(session);
    if (!profile?.completedAt || !profile.repositories.length) continue;
    const verification = await newSession({
      ...session,
      expiresAt: Date.now() + 240000,
    });
    const network: { stage: string; ms: number; status: number }[] = [];
    const nativeFetch = globalThis.fetch;
    const phase = process.env.CANVAS_BENCH_PHASE ?? "baseline";
    const origin = authConfig().origin;
    if (!["localhost", "127.0.0.1"].includes(new URL(origin).hostname))
      throw new Error("Local benchmark only");
    const browser = await chromium.launch({
      channel: "msedge",
      headless: true,
    });
    try {
      globalThis.fetch = async (input, init) => {
        const started = performance.now();
        const response = await nativeFetch(input, init);
        const url = new URL(
          typeof input === "string" || input instanceof URL ? input : input.url,
        );
        if (url.hostname === "api.github.com")
          network.push({
            stage: url.pathname.includes("/git/blobs/")
              ? "blobs"
              : url.pathname.includes("/git/trees/")
                ? "tree"
                : url.pathname.includes("/commits/")
                  ? "revision"
                  : "authorization",
            ms: performance.now() - started,
            status: response.status,
          });
        return response;
      };
      const started = performance.now();
      let backendMetrics: Record<string, number> | undefined;
      let graph, snapshotMs, analyzerMs;
      if (phase === "baseline") {
        const snapshot = await new GitHubRepositorySnapshotReader(
          verification.token,
        ).getSnapshot({
          authenticatedWorkspaceId: workspaceScope(profile),
          projectId: `github-${profile.repositories[0].id}`,
        });
        snapshotMs = performance.now() - started;
        const analyzerStart = performance.now();
        graph = await SnapshotCanvasSource(snapshot).loadGraph({
          projectRef: snapshot.repositoryRef,
        });
        analyzerMs = performance.now() - analyzerStart;
      } else {
        const service = projectCanvasService(
          verification.token,
          `github-${profile.repositories[0].id}`,
        );
        const result = await service.load("load");
        if (result.state !== "ready")
          throw new Error("No graph for cached benchmark");
        graph = result.entry.graph;
        snapshotMs = performance.now() - started;
        analyzerMs = service.metrics.analysisMs;
        backendMetrics = { ...service.metrics };
        expect(result.cached).toBe(true);
        expect(service.metrics.analysisRuns).toBe(0);
      }
      const serializeStart = performance.now();
      const serialized = JSON.stringify(graph);
      const serializationMs = performance.now() - serializeStart;
      const layoutStart = performance.now();
      layoutGraph(graph);
      const layoutMs = performance.now() - layoutStart;
      globalThis.fetch = nativeFetch;
      const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
      });
      await context.addCookies([
        {
          name: "wetscan_session",
          value: verification.token,
          url: origin,
          httpOnly: true,
          sameSite: "Lax",
        },
      ]);
      const page = await context.newPage();
      const navigations = [];
      await page.goto(origin + "/app/projects");
      for (let attempt = 0; attempt < 3; attempt++) {
        const navigationStart = performance.now();
        await page
          .locator(
            `a[href="/app/projects/github-${profile.repositories[0].id}/canvas"]`,
          )
          .click();
        await page
          .locator(".component-list > button")
          .first()
          .waitFor({ state: "visible", timeout: 90000 });
        await page
          .locator(".react-flow__node")
          .first()
          .waitFor({ state: "visible" });
        navigations.push({
          usableGraphMs: performance.now() - navigationStart,
          transfer: await page.evaluate(() =>
            performance
              .getEntriesByType("resource")
              .filter(
                (e) =>
                  e.name.includes("/canvas") || e.name.includes("/api/canvas/"),
              )
              .map((e) => ({
                ms: e.duration,
                bytes: (e as PerformanceResourceTiming).transferSize,
                serverTiming: (e as PerformanceResourceTiming).serverTiming.map(
                  (s) => ({ name: s.name, ms: s.duration }),
                ),
              })),
          ),
        });
        if (attempt === 0)
          await page.screenshot({
            path: `test-results/canvas-performance/${phase}.png`,
            fullPage: true,
          });
        await page.goto(origin + "/app/projects");
      }
      expect(graph.nodes.length).toBeGreaterThan(0);
      const apiStart = performance.now();
      const cachedResponse =
        phase === "baseline"
          ? null
          : await nativeFetch(
              `${origin}/api/canvas/github-${profile.repositories[0].id}?operation=load`,
              { headers: { cookie: "wetscan_session=" + verification.token } },
            );
      const apiCheck = cachedResponse
        ? {
            ms: performance.now() - apiStart,
            cache: cachedResponse.headers.get("x-canvas-cache"),
            analysisRuns: cachedResponse.headers.get("x-canvas-analysis-runs"),
            timing: cachedResponse.headers.get("server-timing"),
          }
        : null;
      if (cachedResponse) {
        expect(cachedResponse.status).toBe(200);
        expect(apiCheck?.cache).toBe("HIT");
        expect(apiCheck?.analysisRuns).toBe("0");
        await cachedResponse.body?.cancel();
      }
      const result = {
        phase,
        repositoryId: profile.repositories[0].id,
        revision: graph.revision,
        analysisGeneratedAt: graph.generatedAt,
        nodes: graph.nodes.length,
        edges: graph.edges.length,
        snapshotMs,
        analyzerMs,
        serializationMs,
        serializedBytes: Buffer.byteLength(serialized),
        layoutMs,
        githubRequestCount: network.length,
        network,
        navigations,
        backendMetrics,
        apiCheck,
      };
      await mkdir("test-results/canvas-performance", { recursive: true });
      await writeFile(
        `test-results/canvas-performance/${phase}.json`,
        JSON.stringify(result, null, 2),
      );
      console.log(JSON.stringify(result));
      return;
    } finally {
      globalThis.fetch = nativeFetch;
      await browser.close();
      await deleteRecord(sessionKey(verification.token));
    }
  }
  throw new Error(
    "No current completed local GitHub session is available for real measurements.",
  );
});

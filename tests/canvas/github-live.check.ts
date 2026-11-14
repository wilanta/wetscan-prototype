// Opt-in local acceptance check. NO provider mocks and never part of npm test.
import { expect, it, vi } from "vitest";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { createHash } from "node:crypto";
import { chromium } from "@playwright/test";
vi.mock("server-only", () => ({})); // Node test runner has no Next server-only alias.
import { authConfig } from "../../src/lib/auth/config";
import { readRecord, deleteRecord } from "../../src/lib/auth/store";
import { newSession, profileFor, sessionKey } from "../../src/lib/auth/session";
import type { Session } from "../../src/lib/auth/types";
import {
  GitHubRepositorySnapshotReader,
  workspaceScope,
} from "../../src/features/canvas/server/github-reader";
import { SnapshotCanvasSource } from "../../src/features/canvas/adapters/snapshot-source";
import { validateGraph } from "../../src/features/canvas/validation";

it("reads selected repositories through actual GitHub APIs using a current local authenticated session", async () => {
  const environment = parseEnv(await readFile(".env.local", "utf8"));
  for (const [key, value] of Object.entries(environment))
    vi.stubEnv(key, value);
  const records = await readdir(authConfig().directory);
  for (const record of records.filter((name) =>
    /^session-[a-f0-9]{64}\.bin$/.test(name),
  )) {
    const session = await readRecord<Session>(record.slice(0, -4));
    // Never revive an expired identity or rotate its original refresh token for this check.
    if (
      !session?.githubId ||
      !session.userToken ||
      session.expiresAt <= Date.now() ||
      (session.tokenExpiresAt && session.tokenExpiresAt <= Date.now() + 180000)
    )
      continue;
    const profile = await profileFor(session);
    if (!profile?.completedAt || !profile.repositories.length) continue;
    const temporary = await newSession({
      ...session,
      expiresAt: Date.now() + 180000,
    });
    try {
      const results = [];
      for (const repo of profile.repositories.slice(0, 2)) {
        const snapshot = await new GitHubRepositorySnapshotReader(
          temporary.token,
        ).getSnapshot({
          authenticatedWorkspaceId: workspaceScope(profile),
          projectId: `github-${repo.id}`,
        });
        const graph = validateGraph(
          await SnapshotCanvasSource(snapshot).loadGraph({
            projectRef: snapshot.repositoryRef,
          }),
        );
        expect(graph.mode).toBe("live");
        expect(graph.revision).toMatch(/^[a-f0-9]{40}$/);
        expect(graph.nodes.length).toBeGreaterThan(0);
        results.push({
          repositoryId: repo.id,
          projectRef: graph.projectRef,
          revision: graph.revision,
          nodes: graph.nodes.length,
          edges: graph.edges.length,
          evidence: graph.evidence.length,
          diagnostics: graph.diagnostics.map((d) => d.code),
          graphHash: createHash("sha256")
            .update(JSON.stringify(graph))
            .digest("hex"),
        });
      }
      console.log("ACTUAL_GITHUB_CANVAS " + JSON.stringify(results));
      await mkdir("test-results/github-live", { recursive: true });
      await writeFile(
        "test-results/github-live/results.json",
        JSON.stringify(
          {
            provider: "actual GitHub APIs; no provider mocks",
            checkedAt: new Date().toISOString(),
            results,
          },
          null,
          2,
        ),
      );
      if (process.env.WETSCAN_LIVE_BROWSER === "1") {
        const origin = authConfig().origin;
        if (!["localhost", "127.0.0.1"].includes(new URL(origin).hostname))
          throw new Error("Live browser check requires a local APP_URL");
        const browser = await chromium.launch({
          channel: "msedge",
          headless: true,
        });
        try {
          const context = await browser.newContext({
            viewport: { width: 1440, height: 900 },
          });
          await context.addCookies([
            {
              name: "wetscan_session",
              value: temporary.token,
              url: origin,
              httpOnly: true,
              sameSite: "Lax",
            },
          ]);
          const page = await context.newPage();
          await page.goto(`${origin}/app/projects`);
          const link = page.locator(
            `a[href="/app/projects/github-${profile.repositories[0].id}/canvas"]`,
          );
          await link.waitFor();
          await link.click();
          await page.locator(".component-explorer").waitFor({ timeout: 90000 });
          expect(await page.locator(".react-flow__node").count()).toBe(
            results[0].nodes,
          );
          await page.locator(".component-list > button").first().click();
          expect(
            await page.locator(".inspector h2").textContent(),
          ).toBeTruthy();
          await page
            .getByRole("button", { name: "Security", exact: true })
            .click();
          const coverage = await page
            .getByRole("region", { name: "Security coverage" })
            .textContent();
          expect(coverage).toContain("Not yet scanned");
          expect(coverage).toContain("Monitoring not connected");
          await page.screenshot({
            path: "test-results/github-live/canvas.png",
            fullPage: true,
          });
          await writeFile(
            "test-results/github-live/browser.json",
            JSON.stringify(
              {
                provider: "actual GitHub; existing saved user identity",
                projectRef: results[0].projectRef,
                nodesRendered: results[0].nodes,
                inspector: "passed",
                guard: "Not yet scanned",
                sentinel: "Monitoring not connected",
              },
              null,
              2,
            ),
          );
        } finally {
          await browser.close();
        }
      }
      if (results.length > 1)
        expect(results[0].projectRef).not.toBe(results[1].projectRef);
      return;
    } finally {
      await deleteRecord(sessionKey(temporary.token));
    }
  }
  throw new Error(
    "LIVE CHECK UNAVAILABLE: no unexpired completed local user session with a current GitHub user token and selected repositories. Log in and complete onboarding locally, then rerun.",
  );
});

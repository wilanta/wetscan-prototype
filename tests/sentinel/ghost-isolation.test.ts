import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { seedRules } from "../../src/features/sentinel/detection/seeds";

const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

describe("S07 Ghost Lite isolation and safe defaults (source-level)", () => {
  it("keeps controlled-decoy-v1 as a DRAFT seed and never auto-enables in migrations or worker", () => {
    const decoySeed = seedRules.find((r) => r.key === "controlled-decoy-v1");
    expect(decoySeed).toBeDefined();
    expect(decoySeed!.definition.category).toBe("decoy");
    expect(decoySeed!.definition.eventKinds).toEqual(["ghost.decoy_triggered"]);

    const sql0007 = read("migrations/sentinel/0007_ghost.up.sql");
    expect(sql0007).not.toMatch(
      /INSERT INTO sentinel\.(detection_rules|ghost_decoys)/i,
    );
    expect(sql0007).toContain("enabled boolean NOT NULL DEFAULT false");

    const workerMain = read("worker/sentinel/main.ts");
    const workerRuntime = read("worker/sentinel/runtime.ts");
    expect(workerMain).not.toContain("controlled-decoy-v1");
    expect(workerRuntime).not.toContain("controlled-decoy-v1");
  });

  it("never triggers S05 responses or S06 notifications automatically from Ghost decoy or UI", () => {
    const decoy = read("src/features/sentinel/ghost/decoy.ts");
    const ghostStore = read("src/features/sentinel/ghost/store.ts");
    const ghostUi = read("src/features/sentinel/components/live-ghost.tsx");

    for (const source of [decoy, ghostStore, ghostUi]) {
      expect(source).not.toContain("ResponseStore");
      expect(source).not.toContain("NotificationStore");
      expect(source).not.toContain("notifications/providers");
      expect(source).not.toContain("local-rate-limit-adapter");
    }
  });

  it("preserves Orderly Demo reducer and original Ghost component without network telemetry", () => {
    const demo = read("src/domain/demo.ts");
    expect(demo).not.toContain("/api/sentinel");
    expect(demo).not.toContain("fetch(");

    const sentinelView = read("src/components/views/sentinel.tsx");
    expect(sentinelView).toContain("export function Ghost()");
    expect(sentinelView).toContain("Test decoy (simulated)");
    expect(sentinelView).toContain(
      "<LiveGhost projectId={projectId} key={projectId} />",
    );
  });
});

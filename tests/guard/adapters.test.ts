import { expect, it } from "vitest";
import {
  disabledAI,
  UnavailableGuardAdapter,
  unavailableCanvas,
  unavailableIntelligence,
  unavailableSentinel,
} from "../../src/features/guard/adapters";
import type { Grant } from "../../src/features/guard/contracts";
import { normalizeOSVInventory } from "../../src/features/guard/evidence";
const scope = { workspaceId: "w", projectId: "p", mode: "live" as const };
const grant: Grant = {
  ...scope,
  actorId: "a",
  operations: ["read"],
  expiresAt: Date.now() + 60000,
};
it("unconfigured Live never returns demo data or a fabricated delivery", async () => {
  const adapter = new UnavailableGuardAdapter();
  expect(adapter.availability("sast").status).toBe("not_configured");
  expect((await adapter.start()).status).toBe("not_configured");
  expect((await unavailableCanvas.plans(grant, scope)).status).toBe(
    "not_integrated",
  );
  expect(
    (await unavailableIntelligence.publish(grant, scope, "a".repeat(40), []))
      .status,
  ).toBe("not_integrated");
  expect(
    (
      await unavailableSentinel.publish(grant, scope, {
        type: "release_evaluated",
        scanId: "s",
        decision: "INCOMPLETE",
      })
    ).status,
  ).toBe("not_integrated");
  await expect(
    unavailableCanvas.plans({ ...grant, projectId: "other" }, scope),
  ).rejects.toThrow();
});
it("AI-disabled fallback uses no provider and never verifies a fix", async () => {
  expect(disabledAI.configured).toBe(false);
  const result = await disabledAI.explain({
    title: "Review",
    ruleId: "fixture",
    redactedSummary: "No private source",
  });
  expect(result.untrusted).toBe(true);
  expect(result.text).toContain("AI not configured");
});
it("inventory keeps actual package versions and unknown licenses explicit", () => {
  const result = normalizeOSVInventory({
    results: [
      {
        source: { path: "package-lock.json" },
        packages: [
          { package: { name: "fixture", version: "1.0.0", ecosystem: "npm" } },
        ],
      },
    ],
  });
  expect(result[0]).toEqual({
    name: "fixture",
    version: "1.0.0",
    ecosystem: "npm",
    license: null,
    sourcePath: "package-lock.json",
  });
});

it("does not claim CI enforcement or allow report publishing without a report grant", async () => {
  const { unavailableCI } = await import("../../src/features/guard/adapters");
  const input = {
    scanId: "fixture",
    commit: "a".repeat(40),
    decision: "INCOMPLETE" as const,
  };
  await expect(unavailableCI.publish(grant, scope, input)).rejects.toThrow();
  expect(
    (
      await unavailableCI.publish(
        { ...grant, operations: ["report"] },
        scope,
        input,
      )
    ).status,
  ).toBe("not_integrated");
});

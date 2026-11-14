import { describe, expect, expectTypeOf, it, vi } from "vitest";
import type {
  Grant,
  IntelligencePort,
  InventoryItem,
  Scope,
  SentinelPort,
} from "../../src/features/guard/contracts";
import type { SentinelIncidentOverlaySource } from "../../src/features/canvas/contracts";
import type {
  CanvasIncidentHandoffV1,
  GuardInventoryV1,
  GuardPipelineEventV1,
  GuardPipelinePayload,
  GuardProducerProof,
} from "../../src/features/sentinel/contracts";
import type {
  SentinelEventV1,
  SentinelProjectContext,
  SentinelScope,
} from "../../src/features/sentinel/types";
import {
  futureGuardBridgePorts,
  unavailableCanvasIncidentSource,
  validateCanvasIncidentHandoff,
  validateGuardHandoff,
} from "../../src/features/sentinel/integrations";
const scope: SentinelScope = {
  workspaceId: "github-user-7:Review",
  projectId: "github-123",
  mode: "live",
};
const at = "2026-11-14T00:00:00Z",
  commit = "a".repeat(40);
const repository = {
  provider: "github" as const,
  repositoryId: "123",
  branch: "main",
  commit,
};
const evidence = [
  {
    id: "e1",
    sourceId: "scan-source",
    origin: "controlled_test" as const,
    occurredAt: at,
    recordedAt: at,
  },
];
const grant = (): Grant => ({
  ...scope,
  actorId: "github-user-7",
  operations: ["read"],
  expiresAt: Date.now() + 60000,
});
const pipeline = (): GuardPipelineEventV1 => ({
  ...scope,
  schemaVersion: 1,
  producer: "guard",
  deliveryId: "d1",
  idempotencyKey: "publish-1",
  repository: { ...repository },
  evidence: structuredClone(evidence),
  occurredAt: at,
  category: "security_pipeline",
  event: { type: "release_evaluated", scanId: "scan1", decision: "BLOCK" },
});
const proof = (): GuardProducerProof => ({
  scope: { ...scope },
  scanId: "scan1",
  repository: { ...repository },
  evidenceIds: ["e1"],
  origin: "controlled_test",
});
const context: SentinelProjectContext = {
  scope,
  actorId: "github-user-7",
  repositoryId: "123",
  canvasProjectRef: "github-user-7/github-123",
};
const overlay = (): CanvasIncidentHandoffV1 => ({
  ...scope,
  schemaVersion: 1,
  category: "runtime_incidents",
  projectRef: context.canvasProjectRef,
  sourceRevision: commit,
  generatedAt: at,
  coverage: "available",
  evidence: structuredClone(evidence),
  incidents: [
    {
      id: "inc1",
      nodeId: "orders-api",
      title: "Controlled signal",
      status: "open",
      simulated: false,
      sourceId: "scan-source",
      occurredAt: at,
      evidenceIds: ["e1"],
      href: "/app/projects/github-123/sentinel/incidents/inc1",
    },
  ],
});
const graph = { revision: commit, nodeIds: ["orders-api"] };
describe("compile-time cross-owner compatibility", () => {
  it("pins exact Guard payload, inventory and scope types and Canvas method", () => {
    expectTypeOf<SentinelScope>().toEqualTypeOf<Scope>();
    expectTypeOf<GuardPipelinePayload>().toEqualTypeOf<
      Parameters<SentinelPort["publish"]>[2]
    >();
    expectTypeOf<
      GuardInventoryV1["inventory"][number]
    >().toEqualTypeOf<InventoryItem>();
    expectTypeOf(futureGuardBridgePorts.pipeline).toEqualTypeOf<SentinelPort>();
    expectTypeOf(
      futureGuardBridgePorts.inventory,
    ).toEqualTypeOf<IntelligencePort>();
    expectTypeOf<GuardPipelinePayload["type"]>().toEqualTypeOf<
      "release_evaluated" | "remediation_retested"
    >();
    expectTypeOf<
      Extract<GuardPipelinePayload["type"], SentinelEventV1["kind"]>
    >().toEqualTypeOf<never>();
    expectTypeOf(
      unavailableCanvasIncidentSource(context, async () => context),
    ).toEqualTypeOf<SentinelIncidentOverlaySource>();
  });
});
describe("future Guard handoff preflight; fixtures, no live producer", () => {
  it.each(["release_evaluated", "remediation_retested"] as const)(
    "keeps %s in pipeline audit category",
    (type) => {
      const event = pipeline();
      event.event.type = type;
      expect(validateGuardHandoff(grant(), event, proof()).category).toBe(
        "security_pipeline",
      );
    },
  );
  it.each(["workspaceId", "projectId", "mode"] as const)(
    "denies wrong %s",
    (field) => {
      const event = pipeline();
      Object.assign(event, { [field]: field === "mode" ? "demo" : "other" });
      expect(() => validateGuardHandoff(grant(), event, proof())).toThrow();
    },
  );
  it("denies expired and missing-operation grants", () => {
    expect(() =>
      validateGuardHandoff({ ...grant(), expiresAt: 0 }, pipeline(), proof()),
    ).toThrow();
    expect(() =>
      validateGuardHandoff({ ...grant(), operations: [] }, pipeline(), proof()),
    ).toThrow();
  });
  it.each([
    (e: GuardPipelineEventV1) => {
      e.schemaVersion = 2 as 1;
    },
    (e: GuardPipelineEventV1) => {
      e.event.scanId = "other";
    },
    (e: GuardPipelineEventV1) => {
      e.repository.commit = "b".repeat(40);
    },
    (e: GuardPipelineEventV1) => {
      e.repository.repositoryId = "456";
    },
    (e: GuardPipelineEventV1) => {
      e.repository.branch = "other";
    },
    (e: GuardPipelineEventV1) => {
      e.evidence[0].origin = "fixture";
    },
    (e: GuardPipelineEventV1) => {
      e.evidence[0].origin = "demo";
    },
    (e: GuardPipelineEventV1) => {
      e.evidence[0].origin = "runtime";
    },
    (e: GuardPipelineEventV1) => {
      e.evidence[0].id = "unknown";
    },
    (e: GuardPipelineEventV1) => {
      e.evidence = [];
    },
    (e: GuardPipelineEventV1) => {
      e.idempotencyKey = "";
    },
    (e: GuardPipelineEventV1) => {
      e.occurredAt = "bad";
    },
    (e: GuardPipelineEventV1) => {
      e.event.type = "auth.failed" as "release_evaluated";
    },
  ])("rejects invalid version/provenance/event mutation %#", (mutate) => {
    const event = pipeline();
    mutate(event);
    expect(() => validateGuardHandoff(grant(), event, proof())).toThrow();
  });
  it("preserves inventory source/licensing and repository-only exposure", () => {
    const event = pipeline();
    const inventory: GuardInventoryV1 = {
      ...event,
      category: "dependency_inventory",
      scanId: "scan1",
      exposureBasis: "repository_only",
      inventory: [
        {
          name: "package",
          version: "1.2.3",
          ecosystem: "npm",
          sourcePath: "package-lock.json",
          license: null,
        },
      ],
    };
    const before = structuredClone(inventory);
    expect(validateGuardHandoff(grant(), inventory, proof()).category).toBe(
      "dependency_inventory",
    );
    expect(inventory).toEqual(before);
    expect(
      validateGuardHandoff(grant(), inventory, proof()).dedupeKey,
    ).not.toBe(validateGuardHandoff(grant(), event, proof()).dedupeKey);
    inventory.inventory[0].sourcePath = "";
    expect(() => validateGuardHandoff(grant(), inventory, proof())).toThrow();
  });
  it("leaves GRD-020 and GRD-021 explicitly not_integrated", async () => {
    await expect(
      futureGuardBridgePorts.pipeline.publish(grant(), scope, pipeline().event),
    ).resolves.toMatchObject({
      status: "not_integrated",
      backlogId: "GRD-021",
    });
    await expect(
      futureGuardBridgePorts.inventory.publish(grant(), scope, commit, []),
    ).resolves.toMatchObject({
      status: "not_integrated",
      backlogId: "GRD-020",
    });
  });
});
describe("CAN-008 scoped future incident seam", () => {
  it("validates real-origin references with graph/evidence mappings (contract fixture only)", () => {
    expect(() =>
      validateCanvasIncidentHandoff(context, overlay(), graph),
    ).not.toThrow();
  });
  it.each([
    (e: CanvasIncidentHandoffV1) => {
      e.workspaceId = "other";
    },
    (e: CanvasIncidentHandoffV1) => {
      e.projectId = "github-456";
    },
    (e: CanvasIncidentHandoffV1) => {
      e.mode = "demo";
    },
    (e: CanvasIncidentHandoffV1) => {
      e.projectRef = "github-user-9/github-123";
    },
    (e: CanvasIncidentHandoffV1) => {
      e.sourceRevision = "b".repeat(40);
    },
    (e: CanvasIncidentHandoffV1) => {
      e.incidents[0].nodeId = "unknown";
    },
    (e: CanvasIncidentHandoffV1) => {
      e.incidents[0].simulated = true as false;
    },
    (e: CanvasIncidentHandoffV1) => {
      e.evidence[0].origin = "fixture";
    },
    (e: CanvasIncidentHandoffV1) => {
      e.evidence[0].origin = "observed_scan";
    },
    (e: CanvasIncidentHandoffV1) => {
      e.incidents[0].evidenceIds = ["unknown"];
    },
    (e: CanvasIncidentHandoffV1) => {
      e.incidents[0].sourceId = "other";
    },
    (e: CanvasIncidentHandoffV1) => {
      e.coverage = "not_monitored";
    },
    (e: CanvasIncidentHandoffV1) => {
      e.incidents[0].href = "/app/projects/github-456/sentinel/incidents/inc1";
    },
  ])("denies wrong scope/synthetic/stale/unmapped references %#", (mutate) => {
    const value = overlay();
    mutate(value);
    expect(() =>
      validateCanvasIncidentHandoff(context, value, graph),
    ).toThrow();
  });
  it("reauthorizes each read and reports unavailable with no invented incidents", async () => {
    const authorize = vi.fn(async () => context);
    const source = unavailableCanvasIncidentSource(context, authorize);
    await expect(
      source.getSecurity(context.canvasProjectRef),
    ).resolves.toMatchObject({
      mode: "unavailable",
      sentinel: "not_monitored",
      incidents: [],
      findings: [],
    });
    await expect(source.getSecurity("other")).rejects.toThrow();
    authorize.mockRejectedValueOnce(new Error("repository revoked"));
    await expect(source.getSecurity(context.canvasProjectRef)).rejects.toThrow(
      "revoked",
    );
    expect(authorize).toHaveBeenCalledTimes(3);
  });
});

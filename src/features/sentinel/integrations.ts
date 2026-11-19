import type { Grant } from "../guard/contracts";
import { authorize } from "../guard/security";
import {
  unavailableIntelligence,
  unavailableSentinel,
} from "../guard/adapters";
import type { SentinelIncidentOverlaySource } from "../canvas/contracts";
import type {
  CanvasIncidentHandoffV1,
  CaseLibraryArchiveCandidateV1,
  CaseLibraryPort,
  GuardBridgePorts,
  GuardInventoryV1,
  GuardPipelineEventV1,
  GuardProducerProof,
} from "./contracts";
import { assertSameScope, deliveryKey } from "./scope";
import type { EvidenceRef, SentinelProjectContext } from "./types";

/** Existing Guard ports stay unavailable; no publisher/consumer is installed. */
export const futureGuardBridgePorts: GuardBridgePorts = {
  pipeline: unavailableSentinel,
  inventory: unavailableIntelligence,
};
/** S08 Case Library stays unavailable in S07; never auto-archives or auto-approves rules. */
export const unavailableCaseLibrary: CaseLibraryPort = {
  configured: false,
  async archiveIncidentDraft(
    context: SentinelProjectContext,
    candidate: CaseLibraryArchiveCandidateV1,
  ) {
    assertSameScope(context.scope, candidate);
    return {
      status: "not_integrated",
      backlogId: "S08",
      reason: "S08 Internal Intelligence Case Library is not implemented in S07.",
    };
  },
};
function required(value: string): void {
  if (typeof value !== "string" || !value.trim())
    throw new Error("Missing handoff provenance");
}
function timestamp(value: string): void {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value)))
    throw new Error("Invalid handoff timestamp");
}
function observedEvidence(
  evidence: EvidenceRef[],
  origins: readonly EvidenceRef["origin"][],
): void {
  if (
    !evidence.length ||
    new Set(evidence.map((e) => e.id)).size !== evidence.length
  )
    throw new Error("Observed evidence required");
  for (const item of evidence) {
    if (!origins.includes(item.origin))
      throw new Error("Synthetic evidence denied");
    required(item.id);
    required(item.sourceId);
    timestamp(item.occurredAt);
    timestamp(item.recordedAt);
  }
}
/** Internal preflight, not a wire parser or proof of delivery/idempotent persistence.
 * Caller must reauthorize current repository access and resolve proof from real scan storage.
 */
export function validateGuardHandoff(
  grant: Grant,
  handoff: GuardPipelineEventV1 | GuardInventoryV1,
  proof: GuardProducerProof,
): {
  dedupeKey: string;
  category: "security_pipeline" | "dependency_inventory";
} {
  authorize(grant, handoff, "read");
  if (
    handoff.schemaVersion !== 1 ||
    handoff.producer !== "guard" ||
    handoff.mode !== "live"
  )
    throw new Error("Unsupported Guard handoff");
  assertSameScope(handoff, proof.scope);
  if (!["observed_scan", "controlled_test"].includes(proof.origin))
    throw new Error("Synthetic producer denied");
  required(handoff.deliveryId);
  required(handoff.idempotencyKey);
  timestamp(handoff.occurredAt);
  const repo = handoff.repository;
  if (
    repo.provider !== "github" ||
    !/^github-[1-9]\d*$/.test(handoff.projectId) ||
    handoff.projectId !== `github-${repo.repositoryId}` ||
    !/^[a-f0-9]{40}$/.test(repo.commit) ||
    !repo.branch ||
    repo.provider !== proof.repository.provider ||
    repo.repositoryId !== proof.repository.repositoryId ||
    repo.branch !== proof.repository.branch ||
    repo.commit !== proof.repository.commit
  )
    throw new Error("Guard scan/repository mismatch");
  observedEvidence(handoff.evidence, ["observed_scan", "controlled_test"]);
  if (
    handoff.evidence.some(
      (e) => e.origin !== proof.origin || !proof.evidenceIds.includes(e.id),
    )
  )
    throw new Error("Unverified Guard evidence");
  if (handoff.category === "security_pipeline") {
    if (
      !handoff.event ||
      !["release_evaluated", "remediation_retested"].includes(
        handoff.event.type,
      )
    )
      throw new Error("Not a pipeline audit event");
    required(handoff.event.decision);
    if (handoff.event.scanId !== proof.scanId || !proof.scanId)
      throw new Error("Guard scan mismatch");
  } else if (handoff.category === "dependency_inventory") {
    if (
      handoff.scanId !== proof.scanId ||
      !proof.scanId ||
      handoff.exposureBasis !== "repository_only"
    )
      throw new Error("Guard inventory provenance mismatch");
    if (!Array.isArray(handoff.inventory) || handoff.inventory.length > 10000)
      throw new Error("Invalid inventory");
    for (const item of handoff.inventory) {
      required(item.name);
      required(item.version);
      required(item.ecosystem);
      required(item.sourcePath);
      if (
        item.license !== null &&
        (typeof item.license !== "string" || !item.license.trim())
      )
        throw new Error("Invalid license provenance");
    }
  } else throw new Error("Unsupported Guard category");
  return {
    dedupeKey: deliveryKey(
      handoff,
      `guard:${handoff.category}`,
      handoff.idempotencyKey,
    ),
    category: handoff.category,
  };
}
/** CAN-008 preflight binds revision, graph nodes and evidence outside Canvas-owned code. */
export function validateCanvasIncidentHandoff(
  context: SentinelProjectContext,
  handoff: CanvasIncidentHandoffV1,
  graph: { revision: string; nodeIds: readonly string[] },
): void {
  assertSameScope(context.scope, handoff);
  if (
    handoff.schemaVersion !== 1 ||
    handoff.category !== "runtime_incidents" ||
    handoff.mode !== "live" ||
    handoff.projectRef !== context.canvasProjectRef ||
    handoff.sourceRevision !== graph.revision ||
    !/^[a-f0-9]{40}$/.test(graph.revision)
  )
    throw new Error("Canvas incident scope/revision denied");
  timestamp(handoff.generatedAt);
  if (
    ![
      "not_monitored",
      "available",
      "partial",
      "stale",
      "failed",
      "unavailable",
    ].includes(handoff.coverage) ||
    !Array.isArray(handoff.incidents) ||
    handoff.incidents.length > 2000 ||
    (["not_monitored", "failed", "unavailable"].includes(handoff.coverage) &&
      handoff.incidents.length)
  )
    throw new Error("Invalid monitoring coverage");
  if (handoff.incidents.length)
    observedEvidence(handoff.evidence, ["runtime", "controlled_test"]);
  const ids = new Set<string>();
  for (const incident of handoff.incidents) {
    required(incident.id);
    required(incident.title);
    required(incident.status);
    required(incident.sourceId);
    if (ids.has(incident.id)) throw new Error("Duplicate incident");
    ids.add(incident.id);
    timestamp(incident.occurredAt);
    if (
      incident.simulated !== false ||
      !graph.nodeIds.includes(incident.nodeId) ||
      !incident.evidenceIds.length ||
      incident.evidenceIds.some(
        (id) =>
          !handoff.evidence.some(
            (e) => e.id === id && e.sourceId === incident.sourceId,
          ),
      )
    )
      throw new Error("Unmapped or synthetic Canvas incident");
    if (
      incident.href !== undefined &&
      incident.href !==
        `/app/projects/${handoff.projectId}/sentinel/incidents/${encodeURIComponent(incident.id)}`
    )
      throw new Error("Canvas incident link denied");
  }
}
/** Scope-bound, explicitly unavailable seam. Reauthorization is mandatory on each read. */
export function unavailableCanvasIncidentSource(
  context: SentinelProjectContext,
  reauthorize: () => Promise<SentinelProjectContext>,
): SentinelIncidentOverlaySource {
  return {
    async getSecurity(projectRef) {
      const current = await reauthorize();
      assertSameScope(context.scope, current.scope);
      if (
        projectRef !== current.canvasProjectRef ||
        projectRef !== context.canvasProjectRef
      )
        throw new Error("Canvas project denied");
      return {
        projectRef,
        mode: "unavailable",
        guard: "not_scanned",
        sentinel: "not_monitored",
        findings: [],
        incidents: [],
        message: "CAN-008: Sentinel telemetry is not integrated.",
      };
    },
  };
}

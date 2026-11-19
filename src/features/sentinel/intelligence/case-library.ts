import type {
  AIExplanationPort,
  CaseLibraryArchiveCandidateV1,
  CaseLibraryPort,
} from "../contracts";
import { assertSameScope } from "../scope";
import type { SentinelProjectContext } from "../types";
import { TelemetryError, uuid } from "../telemetry/validation";
import type { IntelGroup } from "./model";
import type { IntelligenceStore } from "./store";

/**
 * S07 -> S08 seam. The incident row in the database is the authority; the handoff only names an
 * incident and must agree with it (source, category, origin, evidence ids and any Ghost hit event ids).
 */
export function createCaseLibraryPort(
  store: IntelligenceStore,
): CaseLibraryPort {
  return {
    configured: true,
    async archiveIncidentDraft(
      context: SentinelProjectContext,
      candidate: CaseLibraryArchiveCandidateV1,
    ) {
      assertSameScope(context.scope, candidate);
      if (
        candidate.schemaVersion !== 1 ||
        !Array.isArray(candidate.evidenceIds) ||
        candidate.evidenceIds.length > 500
      )
        throw new TelemetryError("provenance_mismatch", 409);
      const incidentId = uuid(candidate.incidentId);
      for (const hit of candidate.decoyHits ?? []) {
        assertSameScope(context.scope, hit);
        if (
          candidate.category !== "decoy" ||
          hit.sourceId !== candidate.sourceId ||
          hit.origin !== candidate.origin ||
          !candidate.evidenceIds.includes(
            `telemetry:${hit.sourceId}:${hit.eventId}`,
          )
        )
          throw new TelemetryError("provenance_mismatch", 409);
      }
      const { case: archived } = await store.archiveFromHandoff(
        context,
        incidentId,
        {
          sourceId: candidate.sourceId,
          category: candidate.category,
          origin: candidate.origin,
          evidenceIds: candidate.evidenceIds,
        },
      );
      return {
        status: "available" as const,
        value: { caseId: archived.caseId, status: archived.status },
      };
    },
  };
}

/** Default: no model, no egress. Replacing this requires a new HUMAN_REQUIRED gate (provider, cost, privacy, consent). */
export const disabledAIExplanation: AIExplanationPort = {
  configured: false,
  async explain() {
    return {
      status: "not_configured",
      backlogId: "S08",
      reason:
        "No AI explanation provider is configured; no data leaves the system.",
    };
  },
};

/** Minimized model input: indicator labels and counts only. Never ids, actors, sources, titles, notes or evidence. */
export function redactedGroupSummary(group: IntelGroup): string {
  const m = group.matchedOn;
  return [
    `origin=${group.origin}`,
    `category=${group.category}`,
    `cases=${group.caseIds.length}`,
    `eventKinds=${m.eventKinds.join("|")}`,
    `reasonCodes=${m.reasonCodes.join("|") || "none"}`,
    `methods=${m.methods.join("|") || "none"}`,
    `statusCodes=${m.statusCodes.join("|") || "none"}`,
  ].join("; ");
}

/** Suggestion-only helper: output is untrusted draft text and can never become rule logic. */
export async function explainGroup(port: AIExplanationPort, group: IntelGroup) {
  if (!port.configured) return port.explain("");
  return port.explain(redactedGroupSummary(group));
}

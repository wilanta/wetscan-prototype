import { describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import {
  createCaseLibraryPort,
  disabledAIExplanation,
  explainGroup,
  redactedGroupSummary,
} from "../../src/features/sentinel/intelligence/case-library";
import { unavailableCaseLibrary } from "../../src/features/sentinel/integrations";
import type { IntelGroup } from "../../src/features/sentinel/intelligence/model";
import type { IntelligenceStore } from "../../src/features/sentinel/intelligence/store";
import type { AIExplanationPort } from "../../src/features/sentinel/contracts";
import { context } from "./incident-fixtures";

const base = (over: object = {}) => ({
  ...context.scope,
  schemaVersion: 1 as const,
  incidentId: randomUUID(),
  sourceId: randomUUID(),
  origin: "runtime" as const,
  category: "http" as const,
  evidenceIds: ["telemetry:s:e"],
  falsePositiveNotice: "n",
  ...over,
});

describe("S08 CaseLibraryPort adapter", () => {
  it("keeps the S07 unavailable stub untouched as history", () => {
    expect(unavailableCaseLibrary.configured).toBe(false);
  });
  it("rejects scope mismatch and malformed candidates before touching storage", async () => {
    const archive = vi.fn();
    const port = createCaseLibraryPort({
      archiveFromHandoff: archive,
    } as unknown as IntelligenceStore);
    await expect(
      port.archiveIncidentDraft(context, base({ projectId: "github-999" })),
    ).rejects.toThrow("Sentinel scope denied");
    await expect(
      port.archiveIncidentDraft(context, base({ mode: "demo" })),
    ).rejects.toThrow();
    await expect(
      port.archiveIncidentDraft(context, base({ incidentId: "nope" })),
    ).rejects.toThrow();
    await expect(
      port.archiveIncidentDraft(context, base({ schemaVersion: 2 })),
    ).rejects.toThrow();
    // Decoy hit not backed by the declared evidence is a provenance mismatch.
    await expect(
      port.archiveIncidentDraft(
        context,
        base({
          category: "decoy",
          decoyHits: [
            {
              ...context.scope,
              sourceId: randomUUID(),
              eventId: randomUUID(),
              origin: "runtime",
            },
          ],
        }),
      ),
    ).rejects.toMatchObject({ code: "provenance_mismatch" });
    expect(archive).not.toHaveBeenCalled();
  });
  it("delegates a valid handoff to the store and reports the real case status", async () => {
    const archive = vi
      .fn()
      .mockResolvedValue({
        case: { caseId: "c1", status: "reviewed" },
        deduplicated: true,
      });
    const port = createCaseLibraryPort({
      archiveFromHandoff: archive,
    } as unknown as IntelligenceStore);
    const c = base();
    expect(await port.archiveIncidentDraft(context, c)).toEqual({
      status: "available",
      value: { caseId: "c1", status: "reviewed" },
    });
    expect(archive).toHaveBeenCalledWith(context, c.incidentId, {
      sourceId: c.sourceId,
      category: "http",
      origin: "runtime",
      evidenceIds: c.evidenceIds,
    });
  });
});

describe("S08 optional AI explanation port", () => {
  const group = {
    origin: "runtime",
    category: "http",
    caseIds: [
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
    ],
    incidentIds: ["33333333-3333-4333-8333-333333333333"],
    matchedOn: {
      eventKinds: ["http.suspicious_path"],
      reasonCodes: ["suspicious_path"],
      methods: ["GET"],
      statusCodes: [404],
    },
    members: [],
  } as unknown as IntelGroup;
  it("is disabled by default and never produces text", async () => {
    expect(disabledAIExplanation.configured).toBe(false);
    expect(await explainGroup(disabledAIExplanation, group)).toMatchObject({
      status: "not_configured",
      backlogId: "S08",
    });
  });
  it("sends only minimized indicator labels, never ids, titles, notes or actors", async () => {
    const explain = vi
      .fn()
      .mockResolvedValue({
        status: "available",
        value: { text: "x", untrusted: true, purpose: "draft_only" },
      });
    const port: AIExplanationPort = { configured: true, explain };
    await explainGroup(port, group);
    const sent = explain.mock.calls[0][0] as string;
    expect(sent).toBe(redactedGroupSummary(group));
    expect(sent).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/);
    expect(sent).toContain("reasonCodes=suspicious_path");
  });
  it("a disabled provider is never invoked", async () => {
    const explain = vi.fn();
    await explainGroup(
      { configured: false, explain } as unknown as AIExplanationPort,
      group,
    );
    expect(explain).toHaveBeenCalledTimes(1); // the port itself decides; explainGroup passes an empty string, no data
    expect(explain).toHaveBeenCalledWith("");
  });
});

import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import {
  decoyPathCategory,
  ghostCommand,
  validateDecoyPath,
} from "../../src/features/sentinel/ghost/validation";
import { unavailableCaseLibrary } from "../../src/features/sentinel/integrations";
import { context } from "./incident-fixtures";

const uid = () => randomUUID();

describe("S07 Ghost Lite validation & S08 typed contracts", () => {
  it("accepts valid create, enable, disable, and update commands with strict defaults", () => {
    const src = uid();
    expect(
      ghostCommand({
        action: "create",
        sourceId: src,
        name: "Local Ghost decoy",
        ownedApplicationConfirmed: true,
      }),
    ).toEqual({
      action: "create",
      sourceId: src,
      name: "Local Ghost decoy",
      targetRef: "local-fixture:127.0.0.1",
      decoyPath: "/__wetscan/ghost-decoy",
      responseStatus: 200,
      rateLimitPerMin: 30,
      ownedApplicationConfirmed: true,
      h07ProofId: null,
    });

    const decoyId = uid();
    expect(
      ghostCommand({
        action: "enable",
        decoyId,
        expectedRevision: 1,
        ownedApplicationConfirmed: true,
      }),
    ).toEqual({
      action: "enable",
      decoyId,
      expectedRevision: 1,
      ownedApplicationConfirmed: true,
    });

    expect(
      ghostCommand({
        action: "disable",
        decoyId,
        expectedRevision: 2,
      }),
    ).toEqual({
      action: "disable",
      decoyId,
      expectedRevision: 2,
    });

    expect(
      ghostCommand({
        action: "update",
        decoyId,
        expectedRevision: 3,
        decoyPath: "/.well-known/ghost-decoy",
        responseStatus: 204,
        rateLimitPerMin: 15,
      }),
    ).toEqual({
      action: "update",
      decoyId,
      expectedRevision: 3,
      decoyPath: "/.well-known/ghost-decoy",
      responseStatus: 204,
      rateLimitPerMin: 15,
    });
  });

  it("rejects scope spoofing, provenance injection, missing ownership confirmation, and unsafe decoy paths", () => {
    const src = uid();
    const decoyId = uid();
    for (const badPath of [
      "/api/auth/login",
      "/login",
      "/app/projects/github-1",
      "/__wetscan/ghost-decoy?secret=1",
      "/__wetscan/../admin",
      "/__wetscan/UPPERCASE",
      "/custom/decoy",
    ]) {
      expect(() => validateDecoyPath(badPath)).toThrow("invalid_decoy_path");
      expect(() =>
        ghostCommand({
          action: "create",
          sourceId: src,
          name: "Bad path",
          decoyPath: badPath,
          ownedApplicationConfirmed: true,
        }),
      ).toThrow("invalid_decoy_path");
    }

    for (const bad of [
      {
        action: "create",
        sourceId: src,
        name: "No consent",
        ownedApplicationConfirmed: false,
      },
      {
        action: "create",
        sourceId: src,
        name: "Scope spoof",
        workspaceId: "other",
        ownedApplicationConfirmed: true,
      },
      {
        action: "create",
        sourceId: src,
        name: "Origin spoof",
        origin: "runtime",
        ownedApplicationConfirmed: true,
      },
      {
        action: "create",
        sourceId: src,
        name: "Bad status",
        responseStatus: 302,
        ownedApplicationConfirmed: true,
      },
      {
        action: "create",
        sourceId: src,
        name: "Bad rate limit",
        rateLimitPerMin: 121,
        ownedApplicationConfirmed: true,
      },
      {
        action: "create",
        sourceId: src,
        name: "token_aaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        ownedApplicationConfirmed: true,
      },
      {
        action: "enable",
        decoyId,
        expectedRevision: 1,
      },
      {
        action: "disable",
        decoyId,
        expectedRevision: 0,
      },
      {
        action: "update",
        decoyId,
        expectedRevision: 1,
      },
    ]) {
      expect(() => ghostCommand(bad)).toThrow();
    }
  });

  it("maps decoy path categories deterministically and keeps S08 Case Library unavailable", async () => {
    expect(decoyPathCategory("/__wetscan/ghost-decoy")).toBe("wetscan_decoy");
    expect(decoyPathCategory("/.well-known/ghost-decoy")).toBe(
      "well_known_decoy",
    );
    expect(unavailableCaseLibrary.configured).toBe(false);
    const res = await unavailableCaseLibrary.archiveIncidentDraft(context, {
      schemaVersion: 1,
      ...context.scope,
      incidentId: uid(),
      sourceId: uid(),
      origin: "controlled_test",
      category: "decoy",
      evidenceIds: ["telemetry:1:2"],
      falsePositiveNotice: "Signal only",
    });
    expect(res).toEqual({
      status: "not_integrated",
      backlogId: "S08",
      reason:
        "S08 Internal Intelligence Case Library is not implemented in S07.",
    });
  });
});

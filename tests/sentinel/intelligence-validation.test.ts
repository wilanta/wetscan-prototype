import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import {
  caseTransitions,
  intelCommand,
  intelQuery,
} from "../../src/features/sentinel/intelligence/validation";

const id = () => randomUUID();
const bad = (v: unknown) => expect(() => intelCommand(v)).toThrow();

describe("S08 strict command parser", () => {
  it("accepts every documented command", () => {
    expect(intelCommand({ action: "archive", incidentId: id() }).action).toBe(
      "archive",
    );
    expect(
      intelCommand({
        action: "tag",
        caseId: id(),
        expectedRevision: 1,
        tags: ["b-tag", "a1", "a1"],
      }),
    ).toMatchObject({ tags: ["a1", "b-tag"] });
    expect(
      intelCommand({ action: "annotate", caseId: id(), note: "seen again" })
        .action,
    ).toBe("annotate");
    expect(
      intelCommand({
        action: "set_status",
        caseId: id(),
        expectedRevision: 2,
        status: "reviewed",
      }).action,
    ).toBe("set_status");
    expect(
      intelCommand({
        action: "set_shelf",
        caseId: id(),
        expectedRevision: 2,
        shelfState: "shelved",
      }).action,
    ).toBe("set_shelf");
    expect(
      intelCommand({ action: "propose", groupId: "a".repeat(64) }).action,
    ).toBe("propose");
    expect(
      intelCommand({
        action: "review",
        candidateId: id(),
        expectedRevision: 1,
        decision: "approve",
        reason: "Looks right",
      }).action,
    ).toBe("review");
    expect(
      intelCommand({
        action: "validate",
        candidateId: id(),
        expectedRevision: 2,
      }).action,
    ).toBe("validate");
    expect(
      intelCommand({
        action: "promote",
        candidateId: id(),
        expectedRevision: 3,
      }).action,
    ).toBe("promote");
  });
  it("rejects scope/actor/definition spoofing and unknown or cross-action fields", () => {
    for (const extra of [
      { workspaceId: "x" },
      { projectId: "x" },
      { mode: "live" },
      { actorId: "x" },
      { definition: {} },
      { status: "reviewed" },
      { enabled: true },
    ])
      bad({ action: "archive", incidentId: id(), ...extra });
    bad({ action: "propose", groupId: "a".repeat(64), definition: {} });
    bad({
      action: "promote",
      candidateId: id(),
      expectedRevision: 1,
      enable: true,
    });
    bad({ action: "enable", candidateId: id(), expectedRevision: 1 });
    bad({ action: "unknown" });
    bad(null);
    bad([]);
  });
  it("rejects malformed ids, revisions, tags, notes, decisions and reasons", () => {
    bad({ action: "archive", incidentId: "not-a-uuid" });
    bad({ action: "tag", caseId: id(), expectedRevision: 0, tags: [] });
    bad({
      action: "tag",
      caseId: id(),
      expectedRevision: 1,
      tags: ["Bad Tag"],
    });
    bad({
      action: "tag",
      caseId: id(),
      expectedRevision: 1,
      tags: Array.from({ length: 11 }, (_, i) => `t-${i}`),
    });
    bad({ action: "annotate", caseId: id(), note: "   " });
    bad({ action: "annotate", caseId: id(), note: "x".repeat(501) });
    bad({ action: "annotate", caseId: id(), note: "bad\u0000control" });
    bad({
      action: "review",
      candidateId: id(),
      expectedRevision: 1,
      decision: "enable",
      reason: "because",
    });
    bad({
      action: "review",
      candidateId: id(),
      expectedRevision: 1,
      decision: "approve",
      reason: "no",
    });
    bad({ action: "propose", groupId: "xyz" });
    bad({
      action: "set_status",
      caseId: id(),
      expectedRevision: 1,
      status: "neutralized",
    });
  });
  it("defines case status transitions that never imply resolution", () => {
    expect(caseTransitions.draft_pending_review).toEqual([
      "reviewed",
      "dismissed",
    ]);
    expect(caseTransitions.reviewed).toEqual(["dismissed"]);
    expect(caseTransitions.dismissed).toEqual(["draft_pending_review"]);
    expect(JSON.stringify(caseTransitions)).not.toMatch(
      /resolved|neutraliz|closed/,
    );
  });
});

describe("S08 strict query parser", () => {
  const q = (s: string) => intelQuery(new URLSearchParams(s));
  it("accepts allow-listed filters", () => {
    expect(
      q(
        "status=reviewed&shelf=active&category=http&origin=runtime&tag=a1&q=login",
      ),
    ).toMatchObject({
      status: "reviewed",
      shelf: "active",
      category: "http",
      origin: "runtime",
      tag: "a1",
      q: "login",
    });
    expect(q("")).toEqual({});
  });
  it("rejects unknown, repeated, invalid and mixed caseId queries", () => {
    for (const s of [
      "x=1",
      "status=a&status=b",
      "status=bogus",
      "origin=demo",
      "tag=Bad Tag",
      `caseId=${id()}&status=reviewed`,
      "caseId=nope",
      "q=",
    ])
      expect(() => q(s)).toThrow();
  });
});

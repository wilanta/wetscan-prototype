import { TelemetryError, object, uuid } from "../telemetry/validation";
import { intelLimits, type CaseStatus, type ShelfState } from "./model";

const revision = (v: unknown) => {
  if (
    !Number.isInteger(v) ||
    Number(v) < 1 ||
    Number(v) > intelLimits.revisions
  )
    throw new TelemetryError("invalid_revision");
  return Number(v);
};
function text(v: unknown, min: number, max: number, code: string) {
  if (
    typeof v !== "string" ||
    v.trim().length < min ||
    v.length > max ||
    /[\x00-\x1f\x7f]/.test(v)
  )
    throw new TelemetryError(code);
  return v.trim();
}
export function tagList(v: unknown): string[] {
  if (!Array.isArray(v) || v.length > intelLimits.tagsPerCase)
    throw new TelemetryError("invalid_tags");
  const tags = v.map((t) => {
    if (typeof t !== "string" || !/^[a-z0-9][a-z0-9-]{1,31}$/.test(t))
      throw new TelemetryError("invalid_tags");
    return t;
  });
  return [...new Set(tags)].sort();
}
const caseStatuses: CaseStatus[] = [
  "draft_pending_review",
  "reviewed",
  "dismissed",
];
/** Allowed human case-status moves; anything else fails closed. */
export const caseTransitions: Record<CaseStatus, CaseStatus[]> = {
  draft_pending_review: ["reviewed", "dismissed"],
  reviewed: ["dismissed"],
  dismissed: ["draft_pending_review"],
};

export type IntelCommand =
  | { action: "archive"; incidentId: string }
  | { action: "tag"; caseId: string; expectedRevision: number; tags: string[] }
  | { action: "annotate"; caseId: string; note: string }
  | {
      action: "set_status";
      caseId: string;
      expectedRevision: number;
      status: CaseStatus;
    }
  | {
      action: "set_shelf";
      caseId: string;
      expectedRevision: number;
      shelfState: ShelfState;
    }
  | { action: "propose"; groupId: string }
  | {
      action: "review";
      candidateId: string;
      expectedRevision: number;
      decision: "approve" | "reject";
      reason: string;
    }
  | { action: "validate"; candidateId: string; expectedRevision: number }
  | { action: "promote"; candidateId: string; expectedRevision: number };

/** Strict allow-list parser. Scope, actor and rule definitions are never accepted from the client. */
export function intelCommand(input: unknown): IntelCommand {
  const c = object(input, [
    "action",
    "incidentId",
    "caseId",
    "candidateId",
    "groupId",
    "expectedRevision",
    "tags",
    "note",
    "status",
    "shelfState",
    "decision",
    "reason",
  ]);
  const only = (keys: string[]) => {
    if (Object.keys(c).some((k) => k !== "action" && !keys.includes(k)))
      throw new TelemetryError("invalid_action");
  };
  switch (c.action) {
    case "archive":
      only(["incidentId"]);
      return { action: "archive", incidentId: uuid(c.incidentId) };
    case "tag":
      only(["caseId", "expectedRevision", "tags"]);
      return {
        action: "tag",
        caseId: uuid(c.caseId),
        expectedRevision: revision(c.expectedRevision),
        tags: tagList(c.tags),
      };
    case "annotate":
      only(["caseId", "note"]);
      return {
        action: "annotate",
        caseId: uuid(c.caseId),
        note: text(c.note, 1, 500, "invalid_note"),
      };
    case "set_status":
      only(["caseId", "expectedRevision", "status"]);
      if (!caseStatuses.includes(c.status as CaseStatus))
        throw new TelemetryError("invalid_status");
      return {
        action: "set_status",
        caseId: uuid(c.caseId),
        expectedRevision: revision(c.expectedRevision),
        status: c.status as CaseStatus,
      };
    case "set_shelf":
      only(["caseId", "expectedRevision", "shelfState"]);
      if (!["active", "shelved"].includes(String(c.shelfState)))
        throw new TelemetryError("invalid_status");
      return {
        action: "set_shelf",
        caseId: uuid(c.caseId),
        expectedRevision: revision(c.expectedRevision),
        shelfState: c.shelfState as ShelfState,
      };
    case "propose":
      only(["groupId"]);
      if (typeof c.groupId !== "string" || !/^[a-f0-9]{64}$/.test(c.groupId))
        throw new TelemetryError("invalid_group");
      return { action: "propose", groupId: c.groupId };
    case "review":
      only(["candidateId", "expectedRevision", "decision", "reason"]);
      if (!["approve", "reject"].includes(String(c.decision)))
        throw new TelemetryError("invalid_decision");
      return {
        action: "review",
        candidateId: uuid(c.candidateId),
        expectedRevision: revision(c.expectedRevision),
        decision: c.decision as "approve" | "reject",
        reason: text(c.reason, 3, 280, "invalid_reason"),
      };
    case "validate":
    case "promote":
      only(["candidateId", "expectedRevision"]);
      return {
        action: c.action,
        candidateId: uuid(c.candidateId),
        expectedRevision: revision(c.expectedRevision),
      };
    default:
      throw new TelemetryError("invalid_action");
  }
}

export interface IntelQuery {
  caseId?: string;
  status?: CaseStatus;
  shelf?: ShelfState;
  tag?: string;
  category?: "authentication" | "http" | "decoy";
  origin?: "runtime" | "controlled_test";
  q?: string;
}
export function intelQuery(params: URLSearchParams): IntelQuery {
  const out: IntelQuery = {};
  const allowed = [
    "caseId",
    "status",
    "shelf",
    "tag",
    "category",
    "origin",
    "q",
  ];
  for (const key of new Set(params.keys())) {
    if (!allowed.includes(key) || params.getAll(key).length !== 1)
      throw new TelemetryError("invalid_query");
  }
  const get = (k: string) => params.get(k) ?? undefined;
  const oneOf = <T extends string>(k: string, values: readonly T[]) => {
    const v = get(k);
    if (v === undefined) return undefined;
    if (!values.includes(v as T)) throw new TelemetryError("invalid_query");
    return v as T;
  };
  if (get("caseId") !== undefined) out.caseId = uuid(get("caseId"));
  out.status = oneOf("status", caseStatuses);
  out.shelf = oneOf("shelf", ["active", "shelved"] as const);
  out.category = oneOf("category", [
    "authentication",
    "http",
    "decoy",
  ] as const);
  out.origin = oneOf("origin", ["runtime", "controlled_test"] as const);
  if (get("tag") !== undefined) out.tag = tagList([get("tag")])[0];
  if (get("q") !== undefined) out.q = text(get("q"), 1, 80, "invalid_query");
  if (
    out.caseId &&
    Object.values(out).filter((v) => v !== undefined).length > 1
  )
    throw new TelemetryError("invalid_query");
  return out;
}

import type { ArchitectureGraph, UserCanvasOverlay } from "./types";
import { nodeKinds } from "./types";
import { safePath } from "./discovery/safety";
type Obj = Record<string, unknown>;
function fail(): never {
  throw new Error(
    "Invalid or oversized Canvas document (schema version 1 required)",
  );
}
function obj(value: unknown): Obj {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail();
  return value as Obj;
}
function str(value: unknown, max = 4000): asserts value is string {
  if (
    typeof value !== "string" ||
    value.length > max ||
    /[\x00-\x08]/.test(value)
  )
    fail();
}
function strings(value: unknown) {
  for (const item of arr(value, 2000)) str(item, 1000);
}
function arr(value: unknown, max = 2000): unknown[] {
  if (!Array.isArray(value) || value.length > max) fail();
  return value;
}
function bool(value: unknown) {
  if (typeof value !== "boolean") fail();
}
function choice(value: unknown, values: readonly string[]) {
  if (typeof value !== "string" || !values.includes(value)) fail();
}
function optionalString(value: unknown) {
  if (value !== undefined) str(value);
}
function boundedObject(value: unknown): Obj {
  const record = obj(value);
  if (Object.keys(record).length > 2000) fail();
  for (const key of Object.keys(record)) {
    str(key, 1000);
    if (["__proto__", "constructor", "prototype"].includes(key)) fail();
  }
  return record;
}
function origin(value: unknown) {
  choice(value, ["verified", "inferred", "user_added"]);
}
function base(value: unknown): Obj {
  const record = obj(value);
  if (record.schemaVersion !== 1) fail();
  str(record.projectRef, 512);
  return record;
}
function checkSize(value: unknown) {
  const text = JSON.stringify(value);
  if (text.length > 2_000_000) fail();
}
function nodes(value: unknown, manual = false) {
  for (const item of arr(value)) {
    const n = obj(item);
    str(n.id, 1000);
    str(n.label, 256);
    choice(n.kind, nodeKinds);
    origin(n.origin);
    choice(n.status, ["observed_in_source", "inferred", "manual"]);
    strings(n.evidenceIds);
    optionalString(n.technology);
    optionalString(n.description);
    optionalString(n.groupId);
    if (manual && (n.origin !== "user_added" || n.status !== "manual")) fail();
    if (n.metadata !== undefined)
      for (const v of Object.values(boundedObject(n.metadata)))
        if (
          v !== null &&
          typeof v !== "boolean" &&
          typeof v !== "number" &&
          typeof v !== "string"
        )
          fail();
  }
}
function edges(value: unknown, manual = false) {
  for (const item of arr(value, 4000)) {
    const e = obj(item);
    for (const key of ["id", "source", "target"]) str(e[key], 1000);
    origin(e.origin);
    strings(e.evidenceIds);
    optionalString(e.description);
    choice(e.relationship, [
      "http_call",
      "imports",
      "reads",
      "writes",
      "authenticates",
      "publishes",
      "subscribes",
      "builds",
      "deploys",
      "hosts",
      "depends_on",
      "sends_events",
      "unknown",
    ]);
    if (manual && e.origin !== "user_added") fail();
  }
}
export function validateGraph(input: unknown): ArchitectureGraph {
  checkSize(input);
  const g = base(input);
  choice(g.mode, ["demo", "snapshot", "live", "unavailable"]);
  str(g.revision, 512);
  str(g.analyzerVersion, 128);
  str(g.generatedAt, 64);
  if (!Number.isFinite(Date.parse(g.generatedAt as string))) fail();
  choice(g.environment, ["local", "staging", "production", "unknown"]);
  optionalString(g.branch);
  nodes(g.nodes);
  edges(g.edges);
  for (const item of arr(g.evidence, 8000)) {
    const e = obj(item);
    str(e.id, 1000);
    str(e.summary);
    origin(e.origin);
    choice(e.kind, [
      "source_file",
      "manifest",
      "config",
      "api_spec",
      "provider",
      "runtime",
      "manual",
    ]);
    optionalString(e.sourceRevision);
    if (
      e.sourcePath !== undefined &&
      (typeof e.sourcePath !== "string" || !safePath(e.sourcePath))
    )
      fail();
    for (const key of ["startLine", "endLine"])
      if (
        e[key] !== undefined &&
        (!Number.isSafeInteger(e[key]) || (e[key] as number) < 1)
      )
        fail();
  }
  for (const item of arr(g.coverage, 100)) {
    const c = obj(item);
    str(c.capability, 100);
    choice(c.status, ["supported", "partial", "unsupported"]);
    str(c.detail);
  }
  for (const item of arr(g.diagnostics, 4000)) {
    const d = obj(item);
    str(d.code, 128);
    str(d.message);
    choice(d.severity, ["info", "warning", "error"]);
    if (
      d.sourcePath !== undefined &&
      (typeof d.sourcePath !== "string" || !safePath(d.sourcePath))
    )
      fail();
  }
  return structuredClone(input) as ArchitectureGraph;
}
export function validateOverlay(
  input: unknown,
  projectRef: string,
): UserCanvasOverlay {
  checkSize(input);
  const o = base(input);
  if (o.projectRef !== projectRef) fail();
  nodes(o.manualNodes, true);
  edges(o.manualEdges, true);
  strings(o.hiddenNodeIds);
  strings(o.unconfirmedEdgeIds);
  for (const position of Object.values(boundedObject(o.nodePositions))) {
    const p = obj(position);
    if (
      ![p.x, p.y].every(
        (v) =>
          typeof v === "number" &&
          Number.isFinite(v) &&
          Math.abs(v) < 1_000_000,
      )
    )
      fail();
  }
  for (const value of Object.values(boundedObject(o.annotations))) str(value);
  for (const item of arr(o.groups, 100)) {
    const g = obj(item);
    str(g.id, 1000);
    str(g.label, 256);
    strings(g.nodeIds);
    bool(g.collapsed);
  }
  const trust = obj(o.trustModel);
  strings(trust.boundaryNodeIds);
  for (const item of arr(trust.roles, 100)) {
    const r = obj(item);
    str(r.id, 1000);
    str(r.label, 256);
  }
  for (const item of arr(trust.resources, 100)) {
    const r = obj(item);
    str(r.id, 1000);
    str(r.label, 256);
    optionalString(r.nodeId);
  }
  const roles = new Set((trust.roles as Obj[]).map((r) => r.id));
  const resources = new Set((trust.resources as Obj[]).map((r) => r.id));
  for (const item of arr(trust.policies, 1000)) {
    const p = obj(item);
    for (const key of ["id", "roleId", "resourceId", "action", "ownership"])
      str(p[key], 1000);
    bool(p.allowed);
    bool(p.confirmed);
    if (!roles.has(p.roleId) || !resources.has(p.resourceId)) fail();
  }
  for (const item of arr(o.workflowModels, 100)) {
    const w = obj(item);
    str(w.id, 1000);
    str(w.name, 256);
    strings(w.nodeIds);
    strings(w.invariants);
    strings(w.protectedFields);
    choice(w.status, ["policy_defined", "test_pending"]);
    const states = arr(w.states, 100);
    for (const item of states) {
      const s = obj(item);
      str(s.id, 1000);
      str(s.label, 256);
    }
    const stateIds = new Set(states.map((s) => (s as Obj).id));
    for (const item of arr(w.transitions, 300)) {
      const t = obj(item);
      for (const key of [
        "id",
        "from",
        "to",
        "actor",
        "precondition",
        "endpoint",
        "assertion",
        "hypothesis",
      ])
        str(t[key], 1000);
      bool(t.forbidden);
      if (
        !stateIds.has(t.from) ||
        !stateIds.has(t.to) ||
        !Number.isInteger(t.expectedHttp) ||
        (t.expectedHttp as number) < 100 ||
        (t.expectedHttp as number) > 599
      )
        fail();
    }
  }
  return structuredClone(input) as UserCanvasOverlay;
}
export function parseOverlayJSON(text: string, projectRef: string) {
  if (text.length > 2_000_000) fail();
  return validateOverlay(JSON.parse(text), projectRef);
}

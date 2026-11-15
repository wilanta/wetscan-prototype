import { createHash } from "node:crypto";
import { fingerprint } from "../../../src/platform/identity";
import { LiveGuardError } from "../../../src/features/guard/live/model";
import type { GuardJobBinding } from "../approval";
import { validGuardBranch } from "../../../src/features/guard/live/revision";
import { scanInput } from "../../../src/features/guard/live/service";
import { caseLimits, fixtureTarget, spentJob, type CaseId } from "./catalog";
export const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
export interface ExecutionPacket {
  schemaVersion: 2;
  module: "guard-g01-acceptance";
  caseId: CaseId;
  execution: "foundation_probe" | "qualification" | "cleanup_only" | "schema_readonly";
  runId: string;
  target: typeof fixtureTarget;
  binding: GuardJobBinding | null;
  repositoryName: string | null;
  workerIds: string[];
  containerNames: string[];
  limits: { enqueues: number; launches: number; snapshots: number; containers: number; cancels: number; minutes: number };
  artifacts: { file: string; sha256: string }[];
  specDigests: string[];
  migrationPlanSha256: string;
  programSha256: string;
  daemon: { endpoint: string; id: string; version: string; kernel: string; imageId: string } | null;
  cleanupReference: { jobId: string; registrySha256: string; notBefore: string } | null;
}
export interface ExecutionApproval {
  schemaVersion: 2; module: "guard-g01-acceptance-approval"; status: "APPROVED";
  packetSha256: string; approvedBy: string; approvedAt: string; expiresAt: string;
}
export function validatePacket(value: unknown): ExecutionPacket {
  const p = value as ExecutionPacket;
  const fail = () => { throw new LiveGuardError("approval_required"); };
  if (!p || p.schemaVersion !== 2 || p.module !== "guard-g01-acceptance" ||
      !Object.hasOwn(caseLimits,p.caseId) || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(p.runId) ||
      fingerprint(p.target) !== fingerprint(fixtureTarget)) fail();
  const allowed = ["schemaVersion", "module", "caseId", "execution", "runId", "target", "binding", "repositoryName", "workerIds", "containerNames", "limits", "artifacts", "specDigests", "migrationPlanSha256", "programSha256", "daemon", "cleanupReference"];
  if (Object.keys(p).some(k => !allowed.includes(k))) fail();
  const limits = caseLimits[p.caseId];
  if (fingerprint(p.limits) !== fingerprint({ enqueues: limits[0], launches: limits[1], snapshots: limits[2], containers: limits[3], cancels: limits[4], minutes: limits[5] })) fail();
  const expectedMode = p.caseId === "Q00" || p.caseId === "N00" ? "qualification" : p.caseId === "C02B" ? "cleanup_only" : p.caseId.startsWith("L") ? "schema_readonly" : "foundation_probe";
  if (p.execution !== expectedMode || !Array.isArray(p.artifacts) || p.artifacts.length < 4 ||
      p.artifacts.some(a => !a || Object.keys(a).sort().join()!=="file,sha256" || typeof a.file!=="string" || !/^(?:worker\/(?:guard|sentinel)\/|src\/(?:features\/(?:guard|canvas|sentinel)\/|platform\/|lib\/auth\/|app\/api\/guard\/)|tests\/(?:guard|auth|platform|sentinel)\/|docs\/acceptance\/guard-g01\/)[a-zA-Z0-9_[\]./-]+\.(?:ts|tsx|py|json|sql|mjs|md|txt|cjs)$/.test(a.file) || a.file.split("/").some(v=>!v||v.startsWith(".")) || /(?:^|\/)(?:secrets?|credentials?|passwords?|tokens?)(?:\.|\/|$)/i.test(a.file) || !/^[a-f0-9]{64}$/.test(a.sha256)) ||
      new Set(p.artifacts.map(a => a.file)).size !== p.artifacts.length ||
      !/^[a-f0-9]{64}$/.test(p.migrationPlanSha256) || !/^[a-f0-9]{64}$/.test(p.programSha256)) fail();
  if (!Array.isArray(p.workerIds) || p.workerIds.length !== limits[1] || new Set(p.workerIds).size !== p.workerIds.length || p.workerIds.some(w => !/^g01-rgv2-[a-z0-9-]{1,80}$/.test(w)) ||
      !Array.isArray(p.containerNames) || p.containerNames.length !== limits[3] || new Set(p.containerNames).size !== p.containerNames.length || p.containerNames.some(n => !/^wetscan-guard-[a-f0-9-]{36}$/.test(n))) fail();
  if (!Array.isArray(p.specDigests) || p.specDigests.some(s => !/^[a-f0-9]{64}$/.test(s))) fail();
  if (limits[0]) {
    const b = p.binding;
    if (!b || typeof p.repositoryName!=="string" || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(p.repositoryName) || b.jobId === spentJob || b.mode !== "live" || !/^github-user-[1-9]\d*$/.test(b.actorId) || !b.workspaceId.startsWith(b.actorId + ":") || b.projectId !== "github-" + b.repository?.repositoryId ||
        b.repository?.provider !== "github" || !/^[1-9]\d{0,15}$/.test(b.repository.repositoryId) || !validGuardBranch(b.repository.branch) || !/^[a-f0-9]{40}$/.test(b.repository.commit) || b.idempotencyKey !== "g01-remain-v1-" + p.caseId.toLowerCase() ||
        b.jobId !== hash(JSON.stringify([b.workspaceId,b.projectId,b.mode,b.idempotencyKey]))) fail();
    try { scanInput({profile:b!.profile,engines:b!.engines,commit:b!.repository.commit,idempotencyKey:b!.idempotencyKey}); } catch { fail(); }
  } else if (p.binding !== null || p.repositoryName!==null) fail();
  if (limits[3] || p.caseId === "N00") {
    if (!p.daemon || p.daemon.endpoint !== "npipe:////./pipe/dockerDesktopLinuxEngine" || !p.daemon.id || !p.daemon.version || !p.daemon.kernel || !/^sha256:[a-f0-9]{64}$/.test(p.daemon.imageId) || !p.specDigests.length) fail();
  }
  if (p.caseId === "C02B" && (!p.cleanupReference || !/^[a-f0-9]{64}$/.test(p.cleanupReference.jobId) || p.cleanupReference.jobId === spentJob || !/^[a-f0-9]{64}$/.test(p.cleanupReference.registrySha256) || !Number.isFinite(Date.parse(p.cleanupReference.notBefore)))) fail();
  if (p.caseId!=="C02B" && p.cleanupReference!==null) fail();
  if (!(limits[3] || p.caseId==="N00") && p.daemon!==null) fail();
  return structuredClone(p);
}
/** No loader/config/driver is invoked before this pure authority boundary. */
export function validateExecution(packet: unknown, approval: unknown, now = Date.now()) {
  const p = validatePacket(packet), a = approval as ExecutionApproval;
  if (!a || Object.keys(a).sort().join() !== ["schemaVersion","module","status","packetSha256","approvedBy","approvedAt","expiresAt"].sort().join() ||
      a.schemaVersion !== 2 || a.module !== "guard-g01-acceptance-approval" || a.status !== "APPROVED" ||
      a.packetSha256 !== hash(JSON.stringify(p)) || typeof a.approvedBy !== "string" || !a.approvedBy.trim() ||
      !Number.isFinite(Date.parse(a.approvedAt)) || Date.parse(a.approvedAt) > now ||
      !Number.isFinite(Date.parse(a.expiresAt)) || Date.parse(a.expiresAt) <= now || Date.parse(a.expiresAt) <= Date.parse(a.approvedAt) ||
      Date.parse(a.expiresAt)-Date.parse(a.approvedAt) > p.limits.minutes*60000 ||
      (p.caseId === "C02B" && (now < Date.parse(p.cleanupReference!.notBefore)||Date.parse(a.approvedAt)<Date.parse(p.cleanupReference!.notBefore)))) throw new LiveGuardError("approval_required");
  return { packet: p, approval: structuredClone(a) };
}

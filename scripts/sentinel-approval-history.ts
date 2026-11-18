import { createHash } from "node:crypto";
import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import {
  auditApprovalMetadata,
  auditApprovalName,
  auditKind,
} from "./sentinel-readonly-audit-contract";

export const historicalApprovalDirectory =
  "s04-h04c-b2-885a62c2-c4f2-4372-8aa2-a743ffe92ebc";
// An inventory pin, never an exclusion list or a mutation glob.
export const staleApprovalPins: Record<string, string> = {
  "app-approval.json":
    "a18bde60017ee2614d80237d264081b53dfbbc2e9e7cbdf6b74ff70b8fdf6676",
  "diag-w-approval.json":
    "8242073fca7d072f00d818e6e72693cce96b8956a75c55eee72cdcf3cc4d379f",
  "dup-approval.json":
    "0a0b2e5feaa46f2017520dee7999a353c3179f81b0c8b94cb0a9aadc86a3275d",
  "preflight-approval.json":
    "4486be06d986c6f7c3592268d5ed804bc5e72e1fb63423b6c14788095c31bc9d",
  "provision-approval.json":
    "de28240ebf10456ac3e57e91261dce1ca843f26fb2a9318bc59925cfa209d24d",
  "seal1-approval.json":
    "a787f42b787c36b3238bf41947012fdf36013754db72a2aa8470a27756f7edbb",
  "seal2-approval.json":
    "5331bce6bdc6f843109b1564174ff4405496304030fee35d5fff1c2ec715978d",
  "worker1-approval.json":
    "970558dd404b64b2afea3e443bd71a7113d06769fea522e84412c73bb7b92ea6",
  "worker2-approval.json":
    "3972e6d5da36b7c289497ef37afae9c6f1207365d3d7f43c610c01ee34ef0996",
};
const phases = new Set([
  "preflight",
  "contain-rule",
  "provision-ingest",
  "seal-worker",
  "worker-run",
  "ingest-duplicate",
  "verify-incidents",
  "ui-verify",
  "negative-matrix",
  "cleanup",
  "postflight",
]);
const reviewedClosedStatuses = new Set([
  "CLOSED",
  "CLOSED_H04C_B2_READONLY_PREFLIGHT",
  "CLOSED_AFTER_H04C_B2",
]);
const target = {
  host: "127.0.0.1",
  port: 55432,
  database: "wetscan_dev",
  marker: "wetscan-s01:26b6b537-c016-4dc7-8007-4e839e8b838f",
};
export class ApprovalHistoryError extends Error {
  constructor(code: string) {
    super(code);
  }
}
function requireHistory(ok: unknown, code: string): asserts ok {
  if (!ok) throw new ApprovalHistoryError(code);
}
function object(value: unknown): Record<string, unknown> {
  requireHistory(
    value && typeof value === "object" && !Array.isArray(value),
    "history_metadata",
  );
  return value as Record<string, unknown>;
}
function timestamp(value: unknown): string {
  requireHistory(
    typeof value === "string" &&
      /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,7})?(?:Z|[+-]\d\d:\d\d)$/.test(
        value,
      ) &&
      Number.isFinite(Date.parse(value)),
    "history_timestamp",
  );
  return value;
}
export function historicalMetadata(value: unknown) {
  const a = object(value);
  if (
    a.kind === auditKind ||
    (a.phase === "preservation-audit" && ("actions" in a || "approvedAt" in a))
  ) {
    try {
      return auditApprovalMetadata(value);
    } catch {
      throw new ApprovalHistoryError("history_metadata");
    }
  }
  const scope = object(a.target),
    meta = object(a.h04cB2);
  requireHistory(
    a.schemaVersion === 1 &&
      typeof a.status === "string" &&
      (a.status === "APPROVED" || reviewedClosedStatuses.has(a.status)) &&
      typeof a.approvedBy === "string" &&
      a.approvedBy.trim() &&
      Array.isArray(a.actions) &&
      a.actions.every(
        (v) =>
          typeof v === "string" &&
          [
            "runtime",
            "migrate_up",
            "migrate_down",
            "integration_test",
          ].includes(v),
      ) &&
      new Set(a.actions).size === a.actions.length &&
      a.migrationPlanSha256 ===
        "3438a56e778b30afdd6acf03600638fe31e26c55c2ae5bf63d224f909c429ae7" &&
      Object.entries(target).every(([k, v]) => scope[k] === v) &&
      typeof meta.phase === "string" &&
      phases.has(meta.phase) &&
      Object.keys(meta).every((k) => ["phase", "expiresAt"].includes(k)),
    "history_metadata",
  );
  const approvedAt = timestamp(a.approvedAt),
    expiresAt = timestamp(meta.expiresAt);
  requireHistory(
    Date.parse(expiresAt) > Date.parse(approvedAt),
    "history_timestamp",
  );
  const closedAt = a.closedAt === undefined ? null : timestamp(a.closedAt);
  return {
    status: a.status,
    actions: a.actions as string[],
    phase: meta.phase,
    approvedAt,
    expiresAt,
    closedAt,
  };
}
export type HistoricalApproval = ReturnType<typeof historicalMetadata> & {
  path: string;
  sha256: string;
  createdAt: string;
  modifiedAt: string;
};
export function requireHistoricalClosed(
  records: readonly HistoricalApproval[],
) {
  for (const a of records)
    requireHistory(
      reviewedClosedStatuses.has(a.status) &&
        a.actions.length === 0 &&
        a.closedAt !== null,
      "prior_approval_not_closed",
    );
}
export interface HistoryOptions {
  root: string;
  verifyBoundary: (path: string) => void | Promise<unknown>;
  verifyDirectory: (path: string) => void | Promise<unknown>;
  requiredPaths?: readonly string[];
}
function parseHistoricalJson(text: string): unknown {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new ApprovalHistoryError("history_json_malformed");
  }
  const stack: ({ keys: Set<string>; keyExpected: boolean } | null)[] = [];
  for (const token of text.matchAll(
    /"(?:[^"\\]|\\.)*"|[{}\[\],:]|true|false|null|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g,
  )) {
    const t = token[0],
      top = stack.at(-1);
    if (t === "{") stack.push({ keys: new Set(), keyExpected: true });
    else if (t === "[") stack.push(null);
    else if (t === "}" || t === "]") stack.pop();
    else if (t === "," && top) top.keyExpected = true;
    else if (t.startsWith('"') && top?.keyExpected) {
      const key = JSON.parse(t) as string;
      requireHistory(!top.keys.has(key), "history_json_duplicate_key");
      top.keys.add(key);
      top.keyExpected = false;
    }
  }
  return value;
}

// Closure evidence is not another executable approval. Recognize only the exact
// controller-generated pair, and only after validating the complete linked proof.
async function verifyClosureArtifact(path: string, options: HistoryOptions) {
  const name = path.slice(dirname(path).length + 1);
  const match =
    /^(web-runtime-approval\.json|controller-runtime-approval\.json)(?:\.closure\.sanitized\.json|\.before-[a-f0-9]{32}\.bin)$/.exec(
      name,
    );
  if (!match) return false;
  const directory = dirname(path),
    approvalName = match[1];
  async function evidence(name: string) {
    const file = join(directory, name);
    await options.verifyBoundary(file);
    const before = await lstat(file);
    requireHistory(
      before.isFile() &&
        !before.isSymbolicLink() &&
        before.nlink === 1 &&
        before.size <= 4 * 1024 * 1024 &&
        (await realpath(file)) === file,
      "history_closure_evidence",
    );
    const bytes = await readFile(file),
      after = await lstat(file);
    requireHistory(
      before.ino === after.ino &&
        before.size === after.size &&
        before.mtimeMs === after.mtimeMs &&
        after.nlink === 1,
      "history_changed_during_read",
    );
    return {
      bytes,
      value: object(
        parseHistoricalJson(bytes.toString("utf8").replace(/^\uFEFF/, "")),
      ),
    };
  }
  const { value: receipt } = await evidence(
    approvalName + ".closure.sanitized.json",
  );
  requireHistory(
    Object.keys(receipt).sort().join() ===
      [
        "status",
        "outputDirectory",
        "approvalFile",
        "beforeFile",
        "beforeSha256",
        "afterSha256",
        "closedAt",
      ]
        .sort()
        .join() &&
      receipt.status === "CLOSED" &&
      receipt.outputDirectory === directory &&
      receipt.approvalFile === approvalName &&
      typeof receipt.beforeFile === "string" &&
      new RegExp(
        "^" +
          approvalName.replaceAll(".", "\\.") +
          "\\.before-[a-f0-9]{32}\\.bin$",
      ).test(receipt.beforeFile) &&
      [receipt.beforeSha256, receipt.afterSha256].every(
        (v) => typeof v === "string" && /^[a-f0-9]{64}$/.test(v),
      ) &&
      (name.endsWith(".closure.sanitized.json") || name === receipt.beforeFile),
    "history_closure_evidence",
  );
  const before = await evidence(receipt.beforeFile as string),
    after = await evidence(approvalName);
  requireHistory(
    createHash("sha256").update(before.bytes).digest("hex") ===
      receipt.beforeSha256 &&
      createHash("sha256").update(after.bytes).digest("hex") ===
        receipt.afterSha256,
    "history_closure_evidence",
  );
  const bm = historicalMetadata(before.value),
    am = historicalMetadata(after.value);
  const unchanged = (value: Record<string, unknown>) =>
    Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !["status", "actions", "closedAt"].includes(key))
        .sort(([a], [b]) => a.localeCompare(b)),
    );
  function canonical(value: unknown): string {
    if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
    if (value && typeof value === "object")
      return (
        "{" +
        Object.entries(value)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, v]) => JSON.stringify(k) + ":" + canonical(v))
          .join(",") +
        "}"
      );
    return JSON.stringify(value);
  }
  requireHistory(
    bm.status === "APPROVED" &&
      bm.phase === "provision-ingest" &&
      bm.actions.length === 1 &&
      bm.actions[0] === "runtime" &&
      bm.closedAt === null &&
      am.status === "CLOSED" &&
      am.actions.length === 0 &&
      am.closedAt === receipt.closedAt &&
      canonical(unchanged(before.value)) === canonical(unchanged(after.value)),
    "history_closure_evidence",
  );
  return true;
}
function verifyJournalArtifact(path: string, text: string) {
  const name = path.slice(dirname(path).length + 1);
  if (
    !["owned-processes.jsonl", "resource-journal.private.jsonl"].includes(name)
  )
    return false;
  for (const line of text.split(/\r?\n/).filter((s) => s.trim())) {
    const row = object(parseHistoricalJson(line));
    if (name === "owned-processes.jsonl") {
      requireHistory(
        Object.keys(row).sort().join() === "pid,startTicks" &&
          Number.isSafeInteger(row.pid) &&
          Number(row.pid) > 0 &&
          typeof row.startTicks === "string" &&
          /^[1-9][0-9]{0,19}$/.test(row.startTicks),
        "history_journal_evidence",
      );
    } else {
      requireHistory(
        Object.keys(row).every((k) =>
          ["type", "operation", "ids", "httpStatus", "at"].includes(k),
        ) &&
          ["intent", "response", "ack", "uncertain", "failure"].includes(
            String(row.type),
          ) &&
          typeof row.operation === "string" &&
          /^[a-z0-9_-]{1,80}$/.test(row.operation) &&
          (row.httpStatus === undefined ||
            (Number.isInteger(row.httpStatus) &&
              Number(row.httpStatus) >= 100 &&
              Number(row.httpStatus) <= 599)),
        "history_journal_evidence",
      );
      timestamp(row.at);
      const ids = object(row.ids);
      requireHistory(
        Object.entries(ids).every(
          ([k, v]) =>
            [
              "sourceId",
              "credentialId",
              "ruleId",
              "batchId",
              "eventId",
            ].includes(k) &&
            typeof v === "string" &&
            /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(
              v,
            ),
        ),
        "history_journal_evidence",
      );
    }
  }
  return true;
}
/** Filesystem-only. Never follows approval references or mutates any file. */
export async function discoverHistoricalApprovals(
  options: HistoryOptions,
): Promise<HistoricalApproval[]> {
  try {
    const root = resolve(options.root);
    requireHistory(isAbsolute(options.root), "history_boundary");
    await options.verifyBoundary(root);
    const rootStat = await lstat(root);
    requireHistory(
      rootStat.isDirectory() &&
        !rootStat.isSymbolicLink() &&
        (await realpath(root)) === root,
      "history_boundary",
    );
    const seenPaths = new Set<string>(),
      identities = new Set<string>();
    const records: HistoricalApproval[] = [];
    async function visit(path: string, managedTree: boolean) {
      const rel = relative(root, path);
      requireHistory(
        rel !== "" &&
          !isAbsolute(rel) &&
          rel !== ".." &&
          !rel.startsWith(".." + sep),
        "history_boundary",
      );
      await options.verifyBoundary(path);
      const s = await lstat(path);
      requireHistory(
        !s.isSymbolicLink() && (await realpath(path)) === path,
        "history_boundary",
      );
      const key = process.platform === "win32" ? path.toLowerCase() : path;
      requireHistory(!seenPaths.has(key), "history_duplicate_reference");
      seenPaths.add(key);
      if (s.isDirectory()) {
        await options.verifyDirectory(path);
        for (const name of (await readdir(path)).sort())
          await visit(join(path, name), managedTree);
        return;
      }
      requireHistory(
        s.isFile() && s.nlink === 1,
        "history_duplicate_reference",
      );
      // NTFS file IDs can exceed Number.MAX_SAFE_INTEGER. Number coercion can
      // make distinct historical artifacts appear to be the same file.
      const fileId = await lstat(path, { bigint: true });
      const identity = `${fileId.dev}:${fileId.ino}`;
      requireHistory(!identities.has(identity), "history_duplicate_reference");
      identities.add(identity);
      if (await verifyClosureArtifact(path, options)) return;
      // Read JSON regardless of filename. Binary backups, secrets and logs are
      // not interpreted as approvals; approval-named files always require JSON.
      const named = /approval/i.test(path.slice(dirname(path).length + 1));
      if (!managedTree && !named && !/\.json$/i.test(path)) return;
      if (!named && /\.(?:log|dump|bin|secret)$/i.test(path)) return;
      if (s.size > 4 * 1024 * 1024) {
        requireHistory(!named && !/\.json$/i.test(path), "history_json_size");
        return;
      }
      const bytes = await readFile(path);
      const text = bytes.toString("utf8").replace(/^\uFEFF/, "");
      if (verifyJournalArtifact(path, text)) {
        const after = await lstat(path);
        requireHistory(
          after.ino === s.ino &&
            after.size === s.size &&
            after.mtimeMs === s.mtimeMs &&
            after.nlink === 1 &&
            !after.isSymbolicLink(),
          "history_changed_during_read",
        );
        return;
      }
      if (!named && !/\.json$/i.test(path) && !text.trimStart().startsWith("{"))
        return;
      const value = parseHistoricalJson(text);
      const a =
        value && typeof value === "object" && !Array.isArray(value)
          ? (value as Record<string, unknown>)
          : {};
      // Reports containing nested approval evidence are not approval files.
      const knownRuntimeName = [
        "web-runtime-approval.json",
        "controller-runtime-approval.json",
        "dev-contain-rule-approval.json",
      ].includes(path.slice(dirname(path).length + 1));
      const auditCandidate =
        a.kind === auditKind ||
        (a.phase === "preservation-audit" &&
          ("actions" in a || "approvedAt" in a)) ||
        path.slice(dirname(path).length + 1) === auditApprovalName;
      if (
        !managedTree &&
        !("h04cB2" in a) &&
        !knownRuntimeName &&
        !auditCandidate
      )
        return;
      if (
        !named &&
        !("h04cB2" in a) &&
        !("actions" in a || ("target" in a && "approvedAt" in a)) &&
        a.status !== "APPROVED" &&
        !(typeof a.status === "string" && a.status.startsWith("CLOSED"))
      )
        return;
      const metadata = historicalMetadata(value);
      if (auditCandidate)
        requireHistory(
          "outputDirectory" in metadata &&
            metadata.outputDirectory === dirname(path),
          "history_metadata",
        );
      const after = await lstat(path);
      requireHistory(
        after.ino === s.ino &&
          after.size === s.size &&
          after.mtimeMs === s.mtimeMs &&
          after.nlink === 1 &&
          !after.isSymbolicLink(),
        "history_changed_during_read",
      );
      records.push({
        ...metadata,
        path,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        createdAt: s.birthtime.toISOString(),
        modifiedAt: s.mtime.toISOString(),
      });
    }
    for (const name of (await readdir(root)).sort())
      await visit(join(root, name), /^s04-h04c-b2(?:-|$)/i.test(name));
    const required =
      options.requiredPaths ??
      Object.keys(staleApprovalPins).map((name) =>
        join(root, historicalApprovalDirectory, name),
      );
    requireHistory(
      new Set(required.map((p) => resolve(p).toLowerCase())).size ===
        required.length,
      "history_duplicate_reference",
    );
    for (const path of required) {
      const resolved = resolve(path),
        rel = relative(root, resolved);
      requireHistory(
        rel !== ".." && !rel.startsWith(".." + sep) && !isAbsolute(rel),
        "history_boundary",
      );
      requireHistory(
        records.some((a) => a.path === resolved),
        "history_required_missing",
      );
    }
    return records;
  } catch (error) {
    if (error instanceof ApprovalHistoryError) throw error;
    throw new ApprovalHistoryError("history_unreadable");
  }
}

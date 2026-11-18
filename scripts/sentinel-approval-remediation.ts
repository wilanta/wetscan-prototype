// OFFLINE INVENTORY / DRY RUN ONLY. There is deliberately no apply operation.
import { createHash } from "node:crypto";
import { lstat, readFile, readdir } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseApproval, type ApprovedAction } from "../src/platform/config";
import {
  historicalApprovalDirectory,
  historicalMetadata,
  staleApprovalPins,
} from "./sentinel-approval-history";
import {
  assertPrivateAcl,
  exclusiveJson,
  inspectApprovalHistory,
  privatePath,
} from "./sentinel-provision-owner";

const digest = (bytes: Buffer) =>
  createHash("sha256").update(bytes).digest("hex");
export function previewHistoricalClosure(
  bytes: Buffer,
  expectedSha256: string,
) {
  if (digest(bytes) !== expectedSha256) throw new Error("closure_pin_mismatch");
  const text = bytes.toString("utf8"),
    before = JSON.parse(text.replace(/^\uFEFF/, ""));
  const meta = historicalMetadata(before);
  if (
    meta.status !== "APPROVED" ||
    meta.actions.length !== 0 ||
    meta.closedAt === null ||
    Date.parse(meta.expiresAt) >= Date.now()
  )
    throw new Error("closure_precondition");
  // Preserve every byte except the single status value. Retain the original
  // closedAt and all phase/worker evidence. A separate receipt dates remediation.
  if ([...text.matchAll(/"status"\s*:\s*"APPROVED"/g)].length !== 1)
    throw new Error("closure_status_ambiguous");
  const proposed = Buffer.from(
    text.replace(/("status"\s*:\s*)"APPROVED"/, '$1"CLOSED"'),
    "utf8",
  );
  const after = JSON.parse(proposed.toString("utf8").replace(/^\uFEFF/, ""));
  if (
    JSON.stringify({ ...after, status: before.status }) !==
    JSON.stringify(before)
  )
    throw new Error("closure_delta");
  historicalMetadata(after);
  return {
    beforeSha256: expectedSha256,
    proposedAfterSha256: digest(proposed),
    proposed,
  };
}

export async function inventoryAndPreview(output: string) {
  output = await privatePath(output);
  assertPrivateAcl(output);
  const root = "C:/Users/sheil/.wetscan-sentinel",
    repo = fileURLToPath(new URL("..", import.meta.url));
  const staleDir = join(root, historicalApprovalDirectory);
  assertPrivateAcl(staleDir);
  const history = await inspectApprovalHistory();
  const nine = history.filter((a) =>
    Object.keys(staleApprovalPins).some((n) => a.path === join(staleDir, n)),
  );
  if (nine.length !== 9) throw new Error("closure_exact_nine");
  const protectedRoots = [
    (
      await readFile(
        join(repo, ".local/sentinel/s04-h04c-a-private-directory.txt"),
        "utf8",
      )
    )
      .replace(/^\uFEFF/, "")
      .trim(),
    join(root, "s04-h04c-b2-recovery-b3ecaac2-a04c-417f-83e9-64fcdd3cab41"),
    join(root, "s04-h04c-b2-contain-codex-f1862fad0fd1475d86cd39b2badba1cb"),
    join(root, "s04-h04c-b2-contain-retry-14ad56d619ca4c9d859ba5e734dfb715"),
  ];
  const files: string[] = [],
    preserved: Record<string, string> = {};
  async function scan(path: string, isProtected = false) {
    const s = await lstat(path);
    if (s.isSymbolicLink()) throw new Error("reference_reparse");
    if (s.isDirectory()) {
      for (const name of await readdir(path))
        await scan(join(path, name), isProtected);
    } else {
      if (isProtected || path.startsWith(resolve(staleDir)))
        preserved[path] = digest(await readFile(path));
      if (
        s.size <= 8 * 1024 * 1024 &&
        /\.(?:json|txt|md|ps1|ts|log)$/i.test(path)
      )
        files.push(path);
    }
  }
  await privatePath(root);
  await scan(root);
  for (const p of protectedRoots) {
    await privatePath(p);
    await scan(p, true);
  }
  for (const p of ["docs", "scripts", ".local"]) await scan(join(repo, p));
  const refs: Record<
    string,
    { path: string; kind: string[]; protectedInput: boolean }[]
  > = {};
  for (const a of nine) refs[a.path] = [];
  for (const path of [...new Set(files)]) {
    if (path.startsWith(output)) continue;
    const bytes = await readFile(path),
      text = bytes.toString("utf8");
    for (const a of nine) {
      if (path === a.path) continue;
      const raw = await readFile(a.path),
        kind: string[] = [];
      if (text.includes(a.sha256)) kind.push("exact_sha256");
      if (bytes.includes(raw)) kind.push("exact_bytes");
      if (
        [
          a.path,
          a.path.replaceAll("\\", "/"),
          JSON.stringify(a.path).slice(1, -1),
        ].some((v) => text.includes(v))
      )
        kind.push("exact_path");
      if (text.includes(basename(a.path))) kind.push("filename_only");
      if (kind.length)
        refs[a.path].push({
          path,
          kind,
          protectedInput: protectedRoots.some((p) =>
            path.startsWith(resolve(p) + "\\"),
          ),
        });
    }
  }
  const previews = [],
    inventory = [];
  for (const a of nine) {
    const bytes = await readFile(a.path),
      preview = previewHistoricalClosure(
        bytes,
        staleApprovalPins[basename(a.path)],
      );
    const value = JSON.parse(bytes.toString("utf8"));
    const acceptedActions: string[] = [];
    for (const action of [
      "runtime",
      "migrate_up",
      "migrate_down",
      "integration_test",
    ] as ApprovedAction[])
      try {
        parseApproval(value, value.target, action, value.migrationPlanSha256);
        acceptedActions.push(action);
      } catch {
        /* Pure parser only. */
      }
    inventory.push({
      ...a,
      purposeField:
        "ABSENT: purpose is supplied by caller, not encoded by this schema",
      inferredPurpose:
        a.phase === "worker-run"
          ? "worker (phase and s04RuntimeAcceptance metadata; actual invocation not re-run)"
          : basename(a.path) === "app-approval.json"
            ? "app (filename hint only; invocation purpose is not encoded)"
            : basename(a.path) === "diag-w-approval.json"
              ? "NOT_VERIFIED: worker-diagnostic filename hint; preflight phase alone does not prove caller role"
              : "controller/migration role inferred from CLI phase contract; actual caller purpose is not encoded",
      expired: Date.now() >= Date.parse(a.expiresAt),
      acceptedActions,
      currentRuntimeWorkerMigrationAcceptance: acceptedActions.length > 0,
      hashProtectedByCurrentRecoveryOrContainmentManifest: refs[a.path].some(
        (r) => r.protectedInput && r.kind.includes("exact_sha256"),
      ),
      references: refs[a.path],
      proposedAfterSha256: preview.proposedAfterSha256,
    });
    previews.push({
      path: a.path,
      beforeSha256: a.sha256,
      proposedAfterSha256: preview.proposedAfterSha256,
      beforeBytesBase64: bytes.toString("base64"),
      proposedAfterBytesBase64: preview.proposed.toString("base64"),
    });
  }
  await exclusiveJson(join(output, "inventory.sanitized.json"), {
    status: "OFFLINE_REVIEW",
    recordedAt: new Date().toISOString(),
    databaseConnections: 0,
    approvalsModified: 0,
    historicalApprovalsFound: history.length,
    unresolved: history.filter((a) => !a.status.startsWith("CLOSED")).length,
    referenceSearch: {
      fileCount: new Set(files).size,
      roots: [root, ...["docs", "scripts", ".local"].map((p) => join(repo, p))],
      limitations:
        "Local textual/binary-exact/hash references only. External archives and prior chat transcripts were not searched. Filename-only references do not pin contents.",
    },
    inventory,
  });
  await exclusiveJson(join(output, "closure-preview.private.json"), {
    mode: "DRY_RUN_ONLY",
    approvalsModified: 0,
    previews,
  });
  await exclusiveJson(join(output, "protected-before.private.json"), preserved);
  console.log(
    JSON.stringify({
      status: "OFFLINE_REVIEW",
      approvalsModified: 0,
      databaseConnections: 0,
      count: inventory.length,
      outputDirectory: output,
    }),
  );
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const output = process.argv.find((v) => v.startsWith("--output="))?.slice(9);
  if (process.argv[2] !== "dry-run" || !output) throw new Error("dry_run_only");
  inventoryAndPreview(output).catch(() => {
    console.error("offline_inventory_failed");
    process.exitCode = 1;
  });
}

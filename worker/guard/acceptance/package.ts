import { readFile, lstat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { caseLimits, type CaseId } from "./catalog";
import {
  validatePacket,
  validateExecution,
  hash,
  type ExecutionApproval,
} from "./approval";
import { verifyArtifacts } from "./integrity";
import { privateAcceptanceRoot } from "./private-root";
import { LiveGuardError } from "../../../src/features/guard/live/model";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
/** Actual local metadata only; no Git writes or credential export. */
export async function reviewWorkspace() {
  const run = promisify(execFile),
    options = {
      cwd: process.cwd(),
      windowsHide: true,
      timeout: 5000,
      maxBuffer: 4096,
    };
  const branch = (
      await run("git", ["branch", "--show-current"], options)
    ).stdout.trim(),
    head = (await run("git", ["rev-parse", "HEAD"], options)).stdout.trim();
  if (
    branch !== "feat/guard-g01-s03-integration" ||
    !/^[a-f0-9]{40}$/.test(head)
  )
    throw new LiveGuardError("approval_required");
  return { branch, head };
}
export const packageRoot = resolve(
  "docs/acceptance/guard-g01/remaining-gates-v2",
);
export async function regularJson(path: string) {
  const s = await lstat(path);
  if (!s.isFile() || s.isSymbolicLink() || s.size > 1000000)
    throw new LiveGuardError("approval_required");
  return JSON.parse(await readFile(path, "utf8"));
}
export async function reviewPacket(caseId: string, digest: string) {
  if (!Object.hasOwn(caseLimits, caseId) || !/^[a-f0-9]{64}$/.test(digest))
    throw new LiveGuardError("approval_required");
  const packet = validatePacket(
    await regularJson(join(packageRoot, "packets", caseId + ".json")),
  );
  await reviewWorkspace();
  if (hash(JSON.stringify(packet)) !== digest || packet.caseId !== caseId)
    throw new LiveGuardError("approval_required");
  await verifyArtifacts(packet);
  return packet;
}
export async function approvedCase(caseId: CaseId, digest: string) {
  const packet = await reviewPacket(caseId, digest),
    root = await privateAcceptanceRoot(),
    approval = (await regularJson(
      join(root, `approval.${packet.runId}.json`),
    )) as ExecutionApproval;
  validateExecution(packet, approval);
  return { packet, approval, root };
}

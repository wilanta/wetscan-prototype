import { lstat, readFile, realpath } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { LiveGuardError } from "../../../src/features/guard/live/model";
import { validatePacket, hash, type ExecutionPacket } from "./approval";
/** Source-code allowlist only. Never accepts credential, arbitrary file or directory reads. */
export async function verifyArtifacts(packet: ExecutionPacket, root = process.cwd()) {
  const p = validatePacket(packet), canonical = await realpath(root);
  for (const artifact of p.artifacts) {
    const path = resolve(canonical,artifact.file), actual=await realpath(path), stat=await lstat(path);
    if (!actual.toLowerCase().startsWith((canonical+sep).toLowerCase()) || stat.isSymbolicLink() || !stat.isFile() || stat.size>2000000 || hash(await readFile(path))!==artifact.sha256) throw new LiveGuardError("approval_required");
  }
  return {artifactsVerified:p.artifacts.length};
}

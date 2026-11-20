import { join } from "node:path";
import { fingerprint } from "../../../src/platform/identity";
import { operatorSandboxEvidence } from "../sandbox-evidence";
import { LiveGuardError } from "../../../src/features/guard/live/model";
import { regularJson } from "./package";
import { caseSpecs } from "./case-specs";
import { probeProgram } from "./probe-spec";
import {
  validateExecution,
  hash,
  type ExecutionPacket,
  type ExecutionApproval,
} from "./approval";
import { sameDaemon, measureDaemon } from "./daemon";
/** Required BEFORE enqueue as well as launch, so missing qualification cannot spend a real job. */
export async function admitProbeCase(
  p: ExecutionPacket,
  a: ExecutionApproval,
  root: string,
) {
  validateExecution(p, a);
  const program = await probeProgram(),
    specs = caseSpecs(p.caseId, program);
  if (
    p.programSha256 !== hash(program) ||
    JSON.stringify(specs.map(fingerprint)) !== JSON.stringify(p.specDigests)
  )
    throw new LiveGuardError("approval_required");
  if (!p.limits.containers) return;
  const daemon = await measureDaemon(specs[0]);
  sameDaemon(p.daemon, daemon);
  for (const spec of specs) {
    const evidence = operatorSandboxEvidence(
      await regularJson(join(root, `evidence.${fingerprint(spec)}.json`)),
    );
    const proof = await evidence.verify({
      specDigest: fingerprint(spec),
      daemonVersion: daemon.version,
      daemonId: daemon.id,
      kernelVersion: daemon.kernel,
      imageId: daemon.imageId,
      image: spec.image,
    });
    if (!proof || proof.expiresAt < Date.now() + 180000)
      throw new LiveGuardError("execution_not_ready");
  }
}

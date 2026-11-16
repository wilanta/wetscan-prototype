import { writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  reviewPacket,
  approvedCase,
  packageRoot,
  regularJson,
  reviewWorkspace,
} from "./package";
import {
  validateExecution,
  validatePacket,
  hash,
  type ExecutionApproval,
} from "./approval";
import { privateAcceptanceRoot } from "./private-root";
import type { CaseId } from "./catalog";
import { caseLimits } from "./catalog";
import { verifyArtifacts } from "./integrity";
import { qualify } from "./qualification";
import { denyEnforcementEvidence } from "./deny-evidence";
import { schemaCase, cleanupSourceCase } from "./operator-cases";
import { LiveGuardError } from "../../../src/features/guard/live/model";
import { DaemonObservationFailure } from "./daemon";
import { materializeWindowB } from "./window-b";
import {
  publicProjection,
  requireBeforeProjection,
  preserved,
  type PreservationProjection,
} from "./preservation";
import type { ExecutionPacket } from "./approval";
async function stdinJson(limit = 1000000) {
  let text = "";
  for await (const chunk of process.stdin) {
    text += chunk.toString();
    if (Buffer.byteLength(text) > limit)
      throw new LiveGuardError("invalid_input");
  }
  return JSON.parse(text);
}
/** No dotenv, automatic approval timestamps, server launch, enqueue or worker CLI fallback. */
async function main() {
  const args = process.argv.slice(2),
    caseId = args.find((v) => v.startsWith("--case="))?.slice(7) as CaseId,
    digest =
      args.find((v) => v.startsWith("--packet-sha256="))?.slice(16) ?? "";
  if (args.includes("--measure")) {
    if (args.length !== 1) throw new LiveGuardError("invalid_input");
    const { measureDaemon } = await import("./daemon"),
      { probeProgram, makeProbeSpec } = await import("./probe-spec");
    console.log(
      JSON.stringify({
        classification: "READONLY_DAEMON_IMAGE_OBSERVATION",
        observedAt: new Date().toISOString(),
        daemon: await measureDaemon(
          makeProbeSpec(await probeProgram(), { mode: "manifest", holdMs: 0 }),
        ),
        mutations: 0,
      }),
    );
    return;
  }
  if (args.includes("--materialize-daemon")) {
    if (
      args.length !== 3 ||
      !Object.hasOwn(caseLimits, caseId) ||
      !/^[a-f0-9]{64}$/.test(digest)
    )
      throw new LiveGuardError("invalid_input");
    await reviewWorkspace();
    const template = (await regularJson(
      join(packageRoot, "templates", caseId + ".json"),
    )) as ExecutionPacket;
    if (
      hash(JSON.stringify(template)) !== digest ||
      template.caseId !== caseId ||
      (!template.limits.containers && caseId !== "N00") ||
      template.daemon !== null
    )
      throw new LiveGuardError("approval_required");
    const { measureDaemon } = await import("./daemon"),
      { caseSpecs } = await import("./case-specs"),
      { probeProgram } = await import("./probe-spec");
    const packet = validatePacket({
      ...template,
      daemon: await measureDaemon(caseSpecs(caseId, await probeProgram())[0]),
    });
    await verifyArtifacts(packet);
    await writeFile(
      join(packageRoot, "packets", caseId + ".json"),
      JSON.stringify(packet, null, 2) + "\n",
      { flag: "wx", mode: 0o600 },
    );
    console.log(
      JSON.stringify({
        caseId,
        packetSha256: hash(JSON.stringify(packet)),
        daemon: packet.daemon,
        status: "MATERIALIZED_NEW_APPROVAL_REQUIRED",
        runtimeOperations: 0,
      }),
    );
    return;
  }
  if (
    args.some(
      (v) =>
        !v.startsWith("--case=") &&
        !v.startsWith("--packet-sha256=") &&
        ![
          "--approve-stdin",
          "--run",
          "--review",
          "--record-before",
          "--record-after",
          "--complete-standalone",
          "--prepare-window-b",
        ].includes(v),
    ) ||
    args.filter((v) =>
      [
        "--approve-stdin",
        "--run",
        "--review",
        "--record-before",
        "--record-after",
        "--complete-standalone",
        "--prepare-window-b",
      ].includes(v),
    ).length > 1
  )
    throw new LiveGuardError("invalid_input");
  const packet = await reviewPacket(caseId, digest);
  if (args.includes("--prepare-window-b")) {
    if (caseId !== "C02A") throw new LiveGuardError("invalid_input");
    const root = await privateAcceptanceRoot(),
      registration = join(root, packet.containerNames[0] + ".created.json");
    await regularJson(registration);
    const removed = await regularJson(
      join(root, packet.containerNames[0] + ".removed.json"),
    );
    if (removed.absent !== true || removed.name !== packet.containerNames[0])
      throw new LiveGuardError("execution_not_ready");
    const prepared = await materializeWindowB(
      packet,
      (await regularJson(
        join(packageRoot, "templates", "C02B.json"),
      )) as ExecutionPacket,
      await readFile(registration),
      await regularJson(join(root, packet.runId + ".case-result.json")),
    );
    await writeFile(
      join(packageRoot, "packets", "C02B.json"),
      JSON.stringify(prepared.packet, null, 2) + "\n",
      { flag: "wx", mode: 0o600 },
    );
    console.log(
      JSON.stringify({
        caseId: "C02B",
        packetSha256: prepared.packetSha256,
        actualAgeMs: prepared.actualAgeMs,
        activation: prepared.activation,
        sourceRootSha256: prepared.sourceRootSha256,
        runtimeOperations: 0,
      }),
    );
    return;
  }
  if (args.includes("--approve-stdin")) {
    let text = "";
    for await (const chunk of process.stdin) {
      text += chunk.toString();
      if (Buffer.byteLength(text) > 4096)
        throw new LiveGuardError("approval_required");
    }
    const approval = JSON.parse(text) as ExecutionApproval;
    validateExecution(packet, approval);
    const root = await privateAcceptanceRoot(true);
    await writeFile(
      join(root, `approval.${packet.runId}.json`),
      JSON.stringify(approval, null, 2) + "\n",
      { flag: "wx", mode: 0o600 },
    );
    console.log(
      JSON.stringify({
        status: "APPROVAL_STAGED",
        caseId,
        packetSha256: digest,
        runtimeOperations: 0,
      }),
    );
    return;
  }
  if (
    !args.some((v) =>
      [
        "--run",
        "--record-before",
        "--record-after",
        "--complete-standalone",
      ].includes(v),
    )
  ) {
    console.log(
      JSON.stringify({
        status: "REVIEWED_NOT_AUTHORIZED",
        caseId,
        packetSha256: hash(JSON.stringify(packet)),
        runtimeOperations: 0,
      }),
    );
    return;
  }
  const { approval, root } = await approvedCase(caseId, digest);
  if (args.includes("--record-before") || args.includes("--record-after")) {
    const phase = args.includes("--record-before") ? "before" : "after",
      projection = publicProjection(
        (await stdinJson()) as PreservationProjection,
        packet,
      );
    if (
      phase === "before" &&
      (projection.guard.currentCaseJobs !== 0 ||
        projection.guard.currentCaseScans !== 0)
    )
      throw new LiveGuardError("execution_not_ready");
    await writeFile(
      join(root, packet.runId + ".preservation." + phase + ".json"),
      JSON.stringify(projection, null, 2) + "\n",
      { flag: "wx", mode: 0o600 },
    );
    console.log(
      JSON.stringify({
        caseId,
        phase,
        status: "PRESERVATION_METADATA_RECORDED",
        runtimeOperations: 0,
      }),
    );
    return;
  }
  if (args.includes("--complete-standalone")) {
    if (!["Q00", "N00", "L01", "C02B"].includes(caseId))
      throw new LiveGuardError("invalid_input");
    const before = await requireBeforeProjection(packet, approval, root),
      after = publicProjection(
        (await regularJson(
          join(root, packet.runId + ".preservation.after.json"),
        )) as PreservationProjection,
        packet,
      ),
      preservation = preserved(before, after, caseId, null, packet.workerIds),
      probe = await regularJson(
        join(root, packet.runId + ".probe-result.json"),
      );
    if (probe.packetSha256 !== digest || probe.caseId !== caseId)
      throw new LiveGuardError("execution_not_ready");
    const r = probe.report;
    if (
      caseId === "Q00" &&
      !(
        r.status === "PASS" &&
        r.productionAttestation === "NOT_ISSUED" &&
        r.results?.length === 6 &&
        r.results.every(
          (v: { inspectVerified: boolean; containerAbsent: boolean }) =>
            v.inspectVerified && v.containerAbsent,
        ) &&
        r.privateHostSourceVerified &&
        r.sourceUnchanged &&
        r.syntheticFixtureRetained
      )
    )
      throw new LiveGuardError("execution_not_ready");
    if (
      caseId === "N00" &&
      !(
        r.status === "PASS" &&
        r.results?.length === 3 &&
        r.containersCreated === 0 &&
        r.results.every(
          (v: { status: string; createCalls: number; startCalls: number }) =>
            v.status === "DENIED" && v.createCalls === 0 && v.startCalls === 0,
        )
      )
    )
      throw new LiveGuardError("execution_not_ready");
    if (
      caseId === "L01" &&
      !(
        r.status === "already_applied" &&
        r.ddlStatements === 0 &&
        r.defaultReadOnly === true
      )
    )
      throw new LiveGuardError("execution_not_ready");
    if (
      caseId === "C02B" &&
      !(
        r.sourceAbsent === true &&
        r.markerUnchanged === true &&
        r.actualAgeMs >= 3600000
      )
    )
      throw new LiveGuardError("execution_not_ready");
    const result = {
      caseId,
      status: "PASS",
      packetSha256: digest,
      classification: "LIVE_VERIFIED_FOUNDATION_ACCEPTANCE",
      scannerExecution: "NOT_RUN",
      overallG01: "PARTIALLY_COMPLETE",
      report: r,
      preservation,
    };
    await writeFile(
      join(root, packet.runId + ".case-result.json"),
      JSON.stringify(result, null, 2) + "\n",
      { flag: "wx", mode: 0o600 },
    );
    console.log(JSON.stringify(result));
    return;
  }
  await requireBeforeProjection(packet, approval, root);
  let result: unknown;
  if (caseId === "Q00") result = await qualify(packet, approval, root);
  else if (caseId === "N00")
    result = await denyEnforcementEvidence(packet, approval, root);
  else if (caseId === "L01")
    result = await schemaCase(packet, approval, root, process.env);
  else if (caseId === "C02B")
    result = await cleanupSourceCase(packet, approval, root);
  else if (caseId === "L02") throw new LiveGuardError("approval_required");
  else {
    console.log(
      JSON.stringify({
        status: "OWNER_AUTH_SESSION_REQUIRED",
        caseId,
        scannerExecution: "NOT_RUN",
        runtimeOperations: 0,
      }),
    );
    return;
  }
  await writeFile(
    join(root, `${packet.runId}.probe-result.json`),
    JSON.stringify({ caseId, packetSha256: digest, report: result }, null, 2) +
      "\n",
    { flag: "wx", mode: 0o600 },
  );
  console.log(
    JSON.stringify({
      caseId,
      phase: "probe_result",
      report: result,
      caseAcceptance: "AWAITING_POST_PRESERVATION",
      scannerExecution: "NOT_RUN",
    }),
  );
}
main().catch((error) => {
  console.error(
    JSON.stringify({
      status: "BLOCKED_OR_FAILED",
      reason:
        error instanceof LiveGuardError ? error.code : "acceptance_unavailable",
      scannerExecution: "NOT_RUN",
      noAutomaticRetry: true,
      failedReadonlyStage:
        error instanceof DaemonObservationFailure ? error.stage : undefined,
      packageRoot,
    }),
  );
  process.exitCode = 2;
});

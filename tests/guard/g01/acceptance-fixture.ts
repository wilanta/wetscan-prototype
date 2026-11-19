import { randomUUID } from "node:crypto";
import {
  caseLimits,
  fixtureTarget,
  type CaseId,
} from "../../../worker/guard/acceptance/catalog";
import {
  hash,
  currentHostRuntime,
  type ExecutionPacket,
  type ExecutionApproval,
} from "../../../worker/guard/acceptance/approval";
import { brokerFixture } from "./broker-fixture";
export async function acceptanceFixture(caseId: CaseId = "I01") {
  const f = await brokerFixture(),
    limits = caseLimits[caseId],
    key = "g01-remain-v1-" + caseId.toLowerCase();
  const binding = {
    ...f.binding,
    idempotencyKey: key,
    jobId: hash(
      JSON.stringify([f.binding.workspaceId, f.binding.projectId, "live", key]),
    ),
  };
  const packet: ExecutionPacket = {
    schemaVersion: 2,
    module: "guard-g01-acceptance",
    caseId,
    execution:
      caseId === "Q00" || caseId === "N00"
        ? "qualification"
        : caseId === "C02B"
          ? "cleanup_only"
          : caseId.startsWith("L")
            ? "schema_readonly"
            : "foundation_probe",
    runId: randomUUID(),
    target: fixtureTarget,
    hostRuntime: currentHostRuntime(),
    binding: limits[0] ? binding : null,
    repositoryName: limits[0] ? "fixture/repo" : null,
    workerIds: Array.from(
      { length: limits[1] },
      (_, i) => `g01-rgv2-${caseId.toLowerCase()}-${i}`,
    ),
    containerNames: Array.from(
      { length: limits[3] },
      () => "wetscan-guard-" + randomUUID(),
    ),
    limits: {
      enqueues: limits[0],
      launches: limits[1],
      snapshots: limits[2],
      containers: limits[3],
      cancels: limits[4],
      minutes: limits[5],
    },
    artifacts: ["approval", "catalog", "probe-spec", "registry"].map((n) => ({
      file: `worker/guard/acceptance/${n}.ts`,
      sha256: "a".repeat(64),
    })),
    specDigests: ["b".repeat(64)],
    migrationPlanSha256: "a".repeat(64),
    programSha256: "c".repeat(64),
    daemon:
      limits[3] || caseId === "N00"
        ? {
            endpoint: "npipe:////./pipe/dockerDesktopLinuxEngine",
            id: "unit-daemon",
            version: "unit-version",
            kernel: "unit-kernel",
            imageId: "sha256:" + "d".repeat(64),
          }
        : null,
    cleanupReference:
      caseId === "C02B"
        ? {
            jobId: binding.jobId,
            registrySha256: "e".repeat(64),
            notBefore: new Date(Date.now() - 10000).toISOString(),
          }
        : null,
  };
  const approve = (): ExecutionApproval => ({
    schemaVersion: 2,
    module: "guard-g01-acceptance-approval",
    status: "APPROVED",
    packetSha256: hash(JSON.stringify(packet)),
    approvedBy: "SYNTHETIC_OFFLINE_TEST_NOT_RUNTIME_PERMISSION",
    approvedAt: new Date(Date.now() - 1000).toISOString(),
    expiresAt: new Date(Date.now() + 60000).toISOString(),
  });
  return { ...f, packet, approve, binding };
}

import { join } from "node:path";
import { tmpdir } from "node:os";
import { createJob } from "../../../src/features/guard/pipeline";
import { fingerprint } from "../../../src/platform/identity";
import type { ProductDeployment } from "../../../src/features/guard/live/product-deployment";
import { sandboxControls } from "../../../worker/guard/sandbox";
export const scope = {
  mode: "live" as const,
  workspaceId: "github-user-7:fixture",
  projectId: "github-123",
};
export const authority = {
  grant: {
    ...scope,
    actorId: "github-user-7",
    operations: ["read", "scan", "report", "triage"] as const,
    expiresAt: Date.now() + 60000,
  },
  repositoryId: "123",
  repositoryName: "fixture/repository",
  branch: "main",
  installationId: 9,
  userId: 7,
};
export function deploymentFixture(): ProductDeployment {
  const spec = {
    docker: join(tmpdir(), "docker.exe"),
    endpoint: "npipe:////./pipe/docker_engine",
    image: "ghcr.io/test/scanner@sha256:" + "a".repeat(64),
    executable: "/usr/local/bin/opengrep",
    args: ["--json", "/source"],
    cpu: 1 as const,
    memoryMb: 256 as const,
    pids: 64 as const,
    timeoutMs: 1000,
    outputBytes: 64000,
  };
  return {
    version: 1,
    module: "guard-product-runtime",
    hosting: "self_hosted_node",
    privateRoot: join(tmpdir(), "wetscan-g02-runtime-unit"),
    target: {
      host: "localhost",
      port: 5432,
      database: "wetscan_dev_guardg02",
      marker: "wetscan-s01:00000000-0000-4000-8000-000000000001",
    },
    policies: [
      {
        version: 1,
        id: "OFFLINE_UNIT_ONLY",
        ...scope,
        repositoryId: "123",
        branches: ["main"],
        engines: ["sast"],
        scannerTimeoutMs: 1000,
        jobTimeoutMs: 120000,
        maxAttempts: 1,
      },
    ],
    deployments: [
      {
        engine: "sast",
        spec,
        qualification: {
          version: 1,
          classification: "LIVE_VERIFIED_SANDBOX",
          engine: "sast",
          specDigest: fingerprint(spec),
          imageId: "sha256:" + "b".repeat(64),
          scannerVersion: "unit-v1",
          rulePack: "unit-rules",
          rulePackSha256: "c".repeat(64),
          installationArtifactSha256: "d".repeat(64),
          verifiedAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 60000).toISOString(),
          evidenceSha256: "e".repeat(64),
          daemonId: "unit-daemon",
          daemonVersion: "unit-version",
          kernelVersion: "unit-kernel",
          controls: sandboxControls,
        },
      },
    ],
  };
}
export async function operationalJobFixture() {
  const job = await createJob(authority.grant, {
    ...scope,
    repository: {
      provider: "github",
      repositoryId: "123",
      branch: "main",
      commit: "a".repeat(40),
    },
    profile: "quick",
    engines: ["sast"],
    idempotencyKey: "g02-live-session-unit-0001",
  });
  job.audit.push({
    action: "repository_scan_requested",
    actorId: authority.grant.actorId,
    subjectId: job.id,
    at: new Date().toISOString(),
    reason: "OFFLINE_UNIT_ONLY",
  });
  return job;
}

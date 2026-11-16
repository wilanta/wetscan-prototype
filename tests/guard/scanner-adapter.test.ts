import { it, expect, vi } from "vitest";
import { mkdtemp, writeFile, rm, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { randomUUID, createHash } from "node:crypto";
import {
  isolatedRepositoryScanner,
  type RepositoryEngine,
  type ScannerExecutionPermit,
} from "../../worker/guard/scanner-adapter";
import { sandboxControls, type SandboxSpec } from "../../worker/guard/sandbox";
import { ResourceRegistry } from "../../worker/guard/acceptance/registry";
import { fixtureTarget } from "../../worker/guard/acceptance/catalog";
import { fingerprint } from "../../src/platform/identity";
import { createJob } from "../../src/features/guard/pipeline";
import { bindGuardJob } from "../../worker/guard/approval";
import { brokerFixture } from "./g01/broker-fixture";
import { offlineDocker } from "./g01/acceptance-docker-fixture";
import type { AuthorizedSnapshot } from "../../src/features/guard/contracts";
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
async function fixture(engine: RepositoryEngine) {
  const f = await brokerFixture(),
    job = await createJob(f.grant, {
      ...f.request,
      engines: [engine],
      idempotencyKey: "g02-offline-" + engine,
    }),
    binding = bindGuardJob(job),
    runId = randomUUID();
  const path = {
      sast: "fixture.ts",
      sca: "package-lock.json",
      secrets: "fixture.js",
      iac: "main.tf",
    }[engine],
    content = "OFFLINE_SYNTHETIC_ONLY",
    source = await mkdtemp(
      join(tmpdir(), "wetscan-g01-snapshot-offline-g02-source-"),
    ),
    root = await mkdtemp(
      join(tmpdir(), "wetscan-g01-snapshot-offline-g02-registry-"),
    );
  await writeFile(join(source, path), content);
  await writeFile(
    source + ".lease",
    JSON.stringify({
      version: 1,
      kind: "guard-source",
      rootName: basename(source),
      createdAt: Date.now(),
      expiresAt: Date.now() + 60000,
    }),
  );
  const snapshot: AuthorizedSnapshot = {
    ...f.snapshot,
    files: [{ path, sha256: sha(content), size: content.length }],
  };
  const spec: SandboxSpec = {
    docker: "C:/tools/docker.exe",
    endpoint: "npipe:////./pipe/dockerDesktopLinuxEngine",
    image: "ghcr.io/offline/unit-scanner@sha256:" + "a".repeat(64),
    executable:
      "/usr/local/bin/" +
      {
        sast: "opengrep",
        sca: "osv-scanner",
        secrets: "gitleaks",
        iac: "trivy",
      }[engine],
    args: ["--json", "/source"],
    cpu: 1,
    memoryMb: 256,
    pids: 64,
    timeoutMs: 1000,
    outputBytes: 64000,
  };
  const permit: ScannerExecutionPermit = {
    schemaVersion: 1,
    module: "guard-scanner-execution",
    status: "APPROVED",
    approvedBy: "OFFLINE_SYNTHETIC_TEST_NOT_RUNTIME_AUTHORITY",
    approvedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 60000).toISOString(),
    runId,
    target: fixtureTarget,
    binding,
    engine,
    containerName: "wetscan-guard-" + runId,
    specDigest: fingerprint(spec),
    imageId: "sha256:" + "d".repeat(64),
    scannerVersion: "unit-v1",
    rulePack: "unit-rules",
    rulePackSha256: "b".repeat(64),
    installationArtifactSha256: "e".repeat(64),
  };
  const installation = JSON.stringify({
    schemaVersion: 1,
    module: "guard-scanner-installation",
    classification: "LIVE_VERIFIED_INSTALLATION",
    status: "PASS",
    verifiedBy: "SYNTHETIC_UNIT_FIXTURE_NOT_RUNTIME_EVIDENCE",
    verifiedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 60000).toISOString(),
    engine,
    specDigest: permit.specDigest,
    imageId: permit.imageId,
    scannerVersion: permit.scannerVersion,
    rulePack: permit.rulePack,
    rulePackSha256: permit.rulePackSha256,
  });
  permit.installationArtifactSha256 = sha(installation);
  await writeFile(
    join(root, `installation.${permit.installationArtifactSha256}.json`),
    installation,
  );
  let output: unknown = {
    sast: {
      results: [
        {
          check_id: "UNIT-RULE",
          path: "/source/" + path,
          start: { line: 1 },
          extra: {
            severity: "ERROR",
            message: "UNIT_SOURCE_FRAGMENT_MUST_NOT_SURVIVE",
          },
        },
      ],
      errors: [],
    },
    sca: {
      results: [
        {
          source: { path: "/source/" + path },
          packages: [
            {
              package: {
                name: "synthetic-package",
                version: "1.0.0",
                ecosystem: "npm",
              },
              vulnerabilities: [{ id: "SYNTHETIC-ADVISORY" }],
            },
          ],
        },
      ],
    },
    secrets: [
      {
        RuleID: "UNIT-SECRET",
        File: "/source/" + path,
        StartLine: 1,
        Secret: "UNIT_MATCH_MUST_NOT_SURVIVE",
        Match: "UNIT_MATCH_MUST_NOT_SURVIVE",
      },
    ],
    iac: {
      Results: [
        {
          Target: "/source/" + path,
          Misconfigurations: [
            { ID: "UNIT-IAC", Severity: "HIGH", Title: "Synthetic unit rule" },
          ],
        },
      ],
    },
  }[engine];
  const driver = offlineDocker(spec.image),
    original = driver.call.getMockImplementation()!;
  driver.call.mockImplementation(async (args, input) => {
    if (args[0] === "start") {
      expect(input.acceptedExitCodes).toContain(1);
      const v = driver.entries.get(args.at(-1)!)!;
      v.State = {
        Running: false,
        ExitCode: engine === "sca" || engine === "secrets" ? 1 : 0,
        OOMKilled: false,
        Status: "exited",
      };
      return JSON.stringify(output);
    }
    return original(args, input);
  });
  const directory = vi.fn(async () => source),
    verifyLease = vi.fn(async () => {}),
    freshGrant = vi.fn(async () => f.grant),
    evidence = {
      verify: vi.fn(async () => ({
        expiresAt: Date.now() + 60000,
        verified: sandboxControls,
        artifactRef: "OFFLINE_DRIVER_DOUBLE_NOT_A_REAL_ATTESTATION",
      })),
    };
  const input = {
    engine,
    binding,
    permit,
    spec,
    evidence,
    sourceOwner: { directory },
    registry: new ResourceRegistry(root),
    privateRoot: root,
    freshGrant,
    verifyLease,
    driver,
  };
  const cleanup = async () => {
    for (const target of [source, root]) {
      const actual = await realpath(target);
      if (
        dirname(actual).toLowerCase() !==
          (await realpath(tmpdir())).toLowerCase() ||
        !basename(actual).startsWith("wetscan-g01-snapshot-offline-g02-")
      )
        throw Error("unsafe fixture cleanup");
      await rm(actual, { recursive: true, force: true });
    }
    await rm(source + ".lease");
  };
  return {
    ...f,
    input,
    driver,
    snapshot,
    cleanup,
    directory,
    verifyLease,
    freshGrant,
    setOutput: (value: unknown) => {
      output = value;
    },
  };
}
it.each(["sast", "sca", "secrets", "iac"] as RepositoryEngine[])(
  "G02 %s offline: actual sandbox/registry/normalizer code with a Docker DOUBLE; manifest-bound redacted findings and one-shot quota",
  async (engine) => {
    const f = await fixture(engine);
    try {
      const scanner = isolatedRepositoryScanner(f.input),
        result = await scanner.execute(
          f.snapshot,
          new AbortController().signal,
        );
      expect(result.run.status).toBe("completed");
      expect(result.findings).toHaveLength(1);
      expect(result.findings[0].evidence[0].commit).toBe(
        f.snapshot.repository.commit,
      );
      expect(result.findings[0].location.path).toBe(f.snapshot.files[0].path);
      expect(JSON.stringify(result)).not.toMatch(
        /UNIT_SOURCE_FRAGMENT_MUST_NOT_SURVIVE|UNIT_MATCH_MUST_NOT_SURVIVE/,
      );
      expect(f.verifyLease).toHaveBeenCalledTimes(2);
      expect(f.freshGrant).toHaveBeenCalledTimes(2);
      expect(f.driver.entries.size).toBe(0);
      await expect(
        scanner.execute(f.snapshot, new AbortController().signal),
      ).rejects.toThrow();
      expect(f.driver.createdCount()).toBe(1);
    } finally {
      await f.cleanup();
    }
  },
);
it("G02 offline: old preparation authority and changed/expired engine scopes fail before source/driver access", async () => {
  const f = await fixture("sast");
  try {
    for (const permit of [
      f.permit,
      { ...f.input.permit, expiresAt: new Date(Date.now() - 1).toISOString() },
      { ...f.input.permit, specDigest: "0".repeat(64) },
    ])
      expect(() => isolatedRepositoryScanner({ ...f.input, permit })).toThrow();
    expect(f.directory).not.toHaveBeenCalled();
    expect(f.driver.call).not.toHaveBeenCalled();
  } finally {
    await f.cleanup();
  }
});
it("G02 offline: a scanner location outside the authorized manifest is rejected after exact container cleanup", async () => {
  const f = await fixture("sast");
  try {
    f.setOutput({
      results: [
        {
          check_id: "UNIT",
          path: "/source/unlisted.ts",
          start: { line: 1 },
          extra: { severity: "ERROR", message: "unit" },
        },
      ],
      errors: [],
    });
    await expect(
      isolatedRepositoryScanner(f.input).execute(
        f.snapshot,
        new AbortController().signal,
      ),
    ).rejects.toThrow("authorized manifest");
    expect(f.driver.entries.size).toBe(0);
  } finally {
    await f.cleanup();
  }
});
it("G02 offline: findings exit 1 with an empty report cannot claim successful coverage", async () => {
  const f = await fixture("secrets");
  try {
    f.setOutput([]);
    await expect(
      isolatedRepositoryScanner(f.input).execute(
        f.snapshot,
        new AbortController().signal,
      ),
    ).rejects.toThrow("source_integrity");
    expect(f.driver.entries.size).toBe(0);
  } finally {
    await f.cleanup();
  }
});
it("G02 offline: permission loss after execution blocks results while keeping owned container cleanup complete", async () => {
  const f = await fixture("sast");
  try {
    f.freshGrant
      .mockResolvedValueOnce(f.grant)
      .mockRejectedValue(new Error("synthetic revoked"));
    await expect(
      isolatedRepositoryScanner(f.input).execute(
        f.snapshot,
        new AbortController().signal,
      ),
    ).rejects.toThrow("revoked");
    expect(f.driver.entries.size).toBe(0);
  } finally {
    await f.cleanup();
  }
});

import { it, expect } from "vitest";
import { measuredDeployments } from "../../../worker/guard/installation/measured";
import {
  scannerCommands,
  installedScope,
} from "../../../worker/guard/installation/commands";
import { deploymentFixture } from "./operational-fixture";
function fixture() {
  return {
    classification: "REAL_CLI_CONTROLLED_INSTALLATION_NOT_OWNER_SCAN",
    completedAt: new Date().toISOString(),
    imageId: "sha256:" + "a".repeat(64),
    ownerRepositoryAccessed: false,
    databaseConnected: false,
    cleanupVerified: true,
    hardware: {
      daemonId: "unit",
      daemonVersion: "unit",
      kernelVersion: "unit",
    },
    tests: Object.fromEntries(
      ["controls", "output", "timeout", "cancel", "oom", "orphan"].map((k) => [
        k,
        {
          status: "PASS",
          ...(k === "controls"
            ? {
                controls: Object.fromEntries(
                  [
                    "non_root",
                    "read_only_root",
                    "read_only_source",
                    "source_readable",
                    "no_socket",
                    "no_network",
                    "no_privileges",
                    "seccomp",
                    "pids",
                    "tmp_noexec",
                    "no_secret_env",
                  ].map((k) => [k, true]),
                ),
              }
            : {}),
        },
      ]),
    ),
    scanners: Object.fromEntries(
      Object.keys(scannerCommands).map((cli) => [
        cli,
        {
          versionStatus: "PASS",
          scanStatus: "PASS",
          scope: installedScope[cli as keyof typeof installedScope],
          spec: {
            ...deploymentFixture().deployments[0].spec,
            image: "sha256:" + "a".repeat(64),
            executable: "/usr/local/bin/" + cli,
            args: scannerCommands[cli as keyof typeof scannerCommands],
            timeoutMs: 45000,
          },
          elapsedMs: 1000,
          findings: 1,
          versionOutput: "version 1.0.0",
        },
      ]),
    ),
  };
}
const digests = Object.fromEntries(
  Object.keys(scannerCommands).map((k) => [k, "b".repeat(64)]),
);
it("derives installation records only, with bounded freshness and exact measured specs", () => {
  const r = fixture(),
    d = measuredDeployments(r, digests, "c".repeat(64));
  expect(d).toHaveLength(4);
  expect(
    Date.parse(d[0].qualification.expiresAt) - Date.parse(r.completedAt),
  ).toBe(3600000);
  expect(JSON.parse(d[0].installationBytes).ownerRepositoryScan).toBe(false);
});
it.each(["cleanup", "expiry", "test", "scanner", "command", "timeout"])(
  "fails closed for incomplete %s measurement",
  (mode) => {
    const r = fixture();
    if (mode === "cleanup") r.cleanupVerified = false;
    if (mode === "expiry")
      r.completedAt = new Date(Date.now() - 3600001).toISOString();
    if (mode === "test") r.tests.oom.status = "FAIL";
    if (mode === "scanner") r.scanners.trivy.scanStatus = "BLOCKED";
    if (mode === "command")
      r.scanners.trivy.spec = {
        ...r.scanners.trivy.spec,
        args: ["--unsafe"] as unknown as typeof r.scanners.trivy.spec.args,
      };
    if (mode === "timeout") r.scanners.trivy.elapsedMs = 45000;
    expect(() => measuredDeployments(r, digests, "c".repeat(64))).toThrow();
  },
);

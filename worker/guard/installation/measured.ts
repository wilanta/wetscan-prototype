/** Installation records derived from a completed physical controlled-source run. No job authority. */
import { readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";
import { fingerprint } from "../../../src/platform/identity";
import {
  assertPrivateRuntimeRoot,
  verifyPhysical,
} from "../../../src/features/guard/live/product-preflight";
import {
  sandboxControls,
  validateOperationalSandboxSpec,
  type SandboxSpec,
} from "../sandbox";
import { scannerCommands } from "./commands";
const measuredControlKeys = [
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
] as const;
const sha = (x: string | Buffer) =>
  createHash("sha256").update(x).digest("hex");
interface Measurement {
  classification: string;
  completedAt: string;
  imageId: string;
  ownerRepositoryAccessed: boolean;
  databaseConnected: boolean;
  cleanupVerified: boolean;
  hardware: { daemonId: string; daemonVersion: string; kernelVersion: string };
  tests: Record<string, { status: string; controls?: Record<string, boolean> }>;
  scanners: Record<
    string,
    {
      versionStatus: string;
      scanStatus: string;
      scope: string;
      spec: SandboxSpec;
      elapsedMs: number;
      findings: number;
      versionOutput: string;
    }
  >;
}
export function measuredDeployments(
  r: Measurement,
  ruleDigests: Record<string, string>,
  reportSha256: string,
  now = Date.now(),
) {
  const verified = Date.parse(r.completedAt);
  if (
    r.classification !== "REAL_CLI_CONTROLLED_INSTALLATION_NOT_OWNER_SCAN" ||
    r.ownerRepositoryAccessed ||
    r.databaseConnected ||
    !r.cleanupVerified ||
    !Number.isFinite(verified) ||
    verified > now ||
    now - verified >= 3600000 ||
    !["controls", "output", "timeout", "cancel", "oom", "orphan"].every(
      (k) => r.tests[k]?.status === "PASS",
    ) ||
    !r.tests.controls.controls ||
    measuredControlKeys.some((k) => r.tests.controls.controls?.[k] !== true) ||
    !Object.keys(r.tests.controls.controls).length
  )
    throw Error("physical_measurement_incomplete");
  const verifiedAt = new Date(verified).toISOString(),
    expiresAt = new Date(verified + 3600000).toISOString();
  return (
    [
      ["opengrep", "sast"],
      ["osv-scanner", "sca"],
      ["gitleaks", "secrets"],
      ["trivy", "iac"],
    ] as const
  ).map(([cli, engine]) => {
    const s = r.scanners[cli];
    if (
      !s ||
      s.scanStatus !== "PASS" ||
      s.versionStatus !== "PASS" ||
      !s.spec ||
      s.spec.image !== r.imageId ||
      s.spec.executable !== "/usr/local/bin/" + cli ||
      s.spec.timeoutMs !== 45000 ||
      !Number.isFinite(s.elapsedMs) ||
      s.elapsedMs <= 0 ||
      s.elapsedMs >= 45000 ||
      s.findings < 1 ||
      fingerprint(s.spec.args) !== fingerprint(scannerCommands[cli]) ||
      !/^[a-f0-9]{64}$/.test(ruleDigests[cli] ?? "")
    )
      throw Error("scanner_measurement_incomplete");
    validateOperationalSandboxSpec(s.spec);
    const scannerVersion = s.versionOutput.match(
      /(?:version: |Version: )?(\d+\.\d+\.\d+)/,
    )?.[1];
    if (!scannerVersion) throw Error("version_missing");
    const common = {
      engine,
      specDigest: fingerprint(s.spec),
      imageId: r.imageId,
      scannerVersion,
      rulePack: s.scope,
      rulePackSha256: ruleDigests[cli],
      verifiedAt,
      expiresAt,
    };
    const installation = {
      ...common,
      schemaVersion: 1,
      module: "guard-scanner-installation",
      classification: "LIVE_VERIFIED_INSTALLATION",
      status: "PASS",
      verifiedBy: "controlled-installation-runner",
      measurementSha256: reportSha256,
      ownerRepositoryScan: false,
    };
    const installationBytes = JSON.stringify(installation),
      installationArtifactSha256 = sha(installationBytes);
    const evidence = {
      ...common,
      ...r.hardware,
      version: 1,
      module: "guard-sandbox-qualification",
      classification: "LIVE_VERIFIED_SANDBOX",
      verifiedBy: "controlled-installation-runner",
      controls: sandboxControls,
      tests: {
        controls: "PASS",
        timeout: "PASS",
        output: "PASS",
        cancellation: "PASS",
        cleanup: "PASS",
      },
      measurementSha256: reportSha256,
    };
    const evidenceBytes = JSON.stringify(evidence),
      evidenceSha256 = sha(evidenceBytes);
    const qualification = {
      ...common,
      ...r.hardware,
      version: 1 as const,
      classification: "LIVE_VERIFIED_SANDBOX" as const,
      installationArtifactSha256,
      evidenceSha256,
      controls: sandboxControls,
    };
    return {
      engine,
      spec: s.spec,
      qualification,
      installationBytes,
      evidenceBytes,
    };
  });
}
async function main() {
  const reportFile = resolve(process.argv[2] ?? ""),
    root = resolve(process.argv[3] ?? "");
  await assertPrivateRuntimeRoot(root);
  const bytes = await readFile(reportFile),
    r = JSON.parse(bytes.toString()) as Measurement;
  const context = resolve(".local/g02-install/context");
  const rules = await readFile(join(context, "rules-manifest.json")),
    osv = await readFile(join(context, "osv-db-manifest.json"));
  const digests = {
    opengrep: sha(rules),
    "osv-scanner": sha(osv),
    gitleaks: sha(await readFile(join(context, "config/gitleaks.toml"))),
    trivy: sha(r.imageId + ":embedded-IaC-v0.76.2"),
  };
  const records = measuredDeployments(r, digests, sha(bytes));
  const deployments = [];
  for (const { installationBytes, evidenceBytes, ...d } of records) {
    await writeFile(
      join(
        root,
        "installation." + d.qualification.installationArtifactSha256 + ".json",
      ),
      installationBytes,
      { flag: "wx", mode: 0o600 },
    );
    await writeFile(
      join(root, "qualification." + d.qualification.evidenceSha256 + ".json"),
      evidenceBytes,
      { flag: "wx", mode: 0o600 },
    );
    await verifyPhysical(d, root);
    deployments.push(d);
  }
  await writeFile(
    join(root, "deployments.measured.json"),
    JSON.stringify(
      {
        classification: "SCANNER_SETUP_ONLY_NOT_SCAN_APPROVAL",
        privateRoot: root,
        measurementSha256: sha(bytes),
        deployments,
      },
      null,
      2,
    ),
    { flag: "wx", mode: 0o600 },
  );
  console.log(
    JSON.stringify({
      scannerSetup: "PHYSICAL_METADATA_RECHECK_PASS",
      engines: deployments.map((d) => d.engine),
      privateRoot: root,
      imageId: r.imageId,
      expiresAt: records[0].qualification.expiresAt,
      ownerScan: false,
      databaseConnected: false,
    }),
  );
}
if (process.argv[1]?.replaceAll("\\", "/").endsWith("/measured.ts"))
  main().catch(() => {
    console.error(
      "MEASURED_SETUP_STOP: preserve files, do not invent or overwrite evidence.",
    );
    process.exitCode = 1;
  });

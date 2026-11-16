import { open, readFile, lstat } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import type {
  AuthorizedSnapshot,
  Grant,
  ScannerPort,
} from "../../src/features/guard/contracts";
import {
  authorize,
  safePath,
  record,
  array,
  GuardError,
} from "../../src/features/guard/security";
import {
  normalizeOpengrep,
  normalizeOSV,
  normalizeGitleaks,
  normalizeTrivy,
  type NormalizationContext,
} from "../../src/features/guard/evidence";
import { fingerprint } from "../../src/platform/identity";
import { LiveGuardError } from "../../src/features/guard/live/model";
import type { GuardSnapshotAdapter } from "../../src/features/guard/live/snapshot";
import type { GuardJobBinding } from "./approval";
import {
  validateSandboxSpec,
  type SandboxSpec,
  type SandboxAttestation,
  type DockerDriver,
} from "./sandbox";
import {
  ResourceRegistry,
  confinedSource,
  type ResourceRecord,
} from "./acceptance/registry";
import { scopedOwnedSandbox } from "./acceptance/scoped-sandbox";
import { fixtureTarget, spentJob } from "./acceptance/catalog";
export type RepositoryEngine = "sast" | "sca" | "secrets" | "iac";
const executables = {
  sast: "/usr/local/bin/opengrep",
  sca: "/usr/local/bin/osv-scanner",
  secrets: "/usr/local/bin/gitleaks",
  iac: "/usr/local/bin/trivy",
} as const;
const scanners = {
  sast: "opengrep",
  sca: "osv-scanner",
  secrets: "gitleaks",
  iac: "trivy",
} as const;
const digest = (data: string | Buffer) =>
  createHash("sha256").update(data).digest("hex");
export interface ScannerExecutionPermit {
  schemaVersion: 1;
  module: "guard-scanner-execution";
  status: "APPROVED";
  approvedBy: string;
  approvedAt: string;
  expiresAt: string;
  runId: string;
  target: typeof fixtureTarget;
  binding: GuardJobBinding;
  engine: RepositoryEngine;
  containerName: string;
  specDigest: string;
  imageId: string;
  scannerVersion: string;
  rulePack: string;
  rulePackSha256: string;
  installationArtifactSha256: string;
}
export interface ScannerInstallationEvidence {
  schemaVersion: 1;
  module: "guard-scanner-installation";
  classification: "LIVE_VERIFIED_INSTALLATION";
  status: "PASS";
  verifiedBy: string;
  verifiedAt: string;
  expiresAt: string;
  engine: RepositoryEngine;
  specDigest: string;
  imageId: string;
  scannerVersion: string;
  rulePack: string;
  rulePackSha256: string;
}
/** Independently measured installation/rules artifact; an arbitrary hash or config version is insufficient. */
export async function verifyScannerInstallation(
  p: ScannerExecutionPermit,
  root: string,
) {
  const file = join(root, `installation.${p.installationArtifactSha256}.json`),
    stat = await lstat(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 65536)
    throw new LiveGuardError("execution_not_ready");
  const bytes = await readFile(file);
  if (digest(bytes) !== p.installationArtifactSha256)
    throw new LiveGuardError("approval_required");
  const r = JSON.parse(bytes.toString()) as ScannerInstallationEvidence;
  if (
    r.schemaVersion !== 1 ||
    r.module !== "guard-scanner-installation" ||
    r.classification !== "LIVE_VERIFIED_INSTALLATION" ||
    r.status !== "PASS" ||
    typeof r.verifiedBy !== "string" ||
    !r.verifiedBy.trim() ||
    !Number.isFinite(Date.parse(r.verifiedAt)) ||
    Date.parse(r.verifiedAt) > Date.now() ||
    !Number.isFinite(Date.parse(r.expiresAt)) ||
    Date.parse(r.expiresAt) <= Date.now() ||
    Date.parse(r.expiresAt) - Date.parse(r.verifiedAt) > 3600000 ||
    r.engine !== p.engine ||
    r.specDigest !== p.specDigest ||
    r.imageId !== p.imageId ||
    r.scannerVersion !== p.scannerVersion ||
    r.rulePack !== p.rulePack ||
    r.rulePackSha256 !== p.rulePackSha256
  )
    throw new LiveGuardError("execution_not_ready");
  return r;
}
/** New exact engine/job authority; prepare_only/foundation_probe and any completed G01 job are rejected. */
export function validateScannerPermit(
  value: unknown,
  binding: GuardJobBinding,
  engine: RepositoryEngine,
  spec: SandboxSpec,
  now = Date.now(),
) {
  const p = value as ScannerExecutionPermit;
  validateSandboxSpec(spec);
  if (
    !p ||
    Object.keys(p).sort().join() !==
      [
        "schemaVersion",
        "module",
        "status",
        "approvedBy",
        "approvedAt",
        "expiresAt",
        "runId",
        "target",
        "binding",
        "engine",
        "containerName",
        "specDigest",
        "imageId",
        "scannerVersion",
        "rulePack",
        "rulePackSha256",
        "installationArtifactSha256",
      ]
        .sort()
        .join() ||
    p.schemaVersion !== 1 ||
    p.module !== "guard-scanner-execution" ||
    p.status !== "APPROVED" ||
    typeof p.approvedBy !== "string" ||
    !p.approvedBy.trim() ||
    !Number.isFinite(Date.parse(p.approvedAt)) ||
    Date.parse(p.approvedAt) > now ||
    !Number.isFinite(Date.parse(p.expiresAt)) ||
    Date.parse(p.expiresAt) <= now ||
    Date.parse(p.expiresAt) - Date.parse(p.approvedAt) > 55 * 60000 ||
    p.engine !== engine ||
    fingerprint(p.target) !== fingerprint(fixtureTarget) ||
    fingerprint(p.binding) !== fingerprint(binding) ||
    binding.mode !== "live" ||
    binding.jobId === spentJob ||
    !binding.idempotencyKey.startsWith("g02-") ||
    !binding.engines.includes(engine) ||
    binding.jobId !==
      digest(
        JSON.stringify([
          binding.workspaceId,
          binding.projectId,
          binding.mode,
          binding.idempotencyKey,
        ]),
      ) ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(
      p.runId,
    ) ||
    p.containerName !== "wetscan-guard-" + p.runId ||
    p.specDigest !== fingerprint(spec) ||
    spec.executable !== executables[engine] ||
    !/^sha256:[a-f0-9]{64}$/.test(p.imageId) ||
    typeof p.scannerVersion !== "string" ||
    !p.scannerVersion ||
    p.scannerVersion.length > 100 ||
    /[\r\n\0]/.test(p.scannerVersion) ||
    ["not_configured", "unavailable", "fixture"].includes(p.scannerVersion) ||
    typeof p.rulePack !== "string" ||
    !p.rulePack ||
    p.rulePack.length > 200 ||
    /[\r\n\0]/.test(p.rulePack) ||
    !/^[a-f0-9]{64}$/.test(p.rulePackSha256) ||
    !/^[a-f0-9]{64}$/.test(p.installationArtifactSha256)
  )
    throw new LiveGuardError("approval_required");
  return structuredClone(p);
}
function relativeSourcePath(value: unknown, snapshot: AuthorizedSnapshot) {
  if (typeof value !== "string")
    throw new GuardError("invalid_input", "Scanner location is missing.");
  const path = safePath(value.startsWith("/source/") ? value.slice(8) : value);
  if (!snapshot.files.some((f) => f.path === path))
    throw new GuardError(
      "forbidden",
      "Scanner location is outside the authorized manifest.",
    );
  return path;
}
/** Only known output fields are converted. Absolute host paths, traversal and unlisted files fail closed. */
function canonicalOutput(
  input: unknown,
  engine: RepositoryEngine,
  snapshot: AuthorizedSnapshot,
) {
  const data = structuredClone(input);
  if (engine === "secrets")
    for (const value of array(data)) {
      const r = record(value);
      r.File = relativeSourcePath(r.File, snapshot);
    }
  else if (engine === "sast")
    for (const value of array(record(data).results)) {
      const r = record(value);
      r.path = relativeSourcePath(r.path, snapshot);
      record(r.extra).message =
        "Static analysis rule match; inspect the recorded rule and authorized location.";
    }
  else if (engine === "sca")
    for (const value of array(record(data).results)) {
      const r = record(record(value).source);
      r.path = relativeSourcePath(r.path, snapshot);
    }
  else
    for (const value of array(record(data).Results)) {
      const r = record(value);
      r.Target = relativeSourcePath(r.Target, snapshot);
    }
  return data;
}
/** Real Docker execution in the source-owning parent only. No default image, host runner or Demo-to-live fallback. */
export function isolatedRepositoryScanner(input: {
  engine: RepositoryEngine;
  binding: GuardJobBinding;
  permit: unknown;
  spec: SandboxSpec;
  evidence: SandboxAttestation;
  sourceOwner: Pick<GuardSnapshotAdapter, "directory">;
  registry: ResourceRegistry;
  privateRoot: string;
  freshGrant(): Promise<Grant>;
  verifyLease(): Promise<void>;
  driver?: DockerDriver;
}): ScannerPort {
  const permit = validateScannerPermit(
    input.permit,
    input.binding,
    input.engine,
    input.spec,
  );
  const check = () =>
    validateScannerPermit(permit, input.binding, input.engine, input.spec);
  return {
    engine: input.engine,
    async execute(snapshot, signal) {
      check();
      const grant = await input.freshGrant();
      authorize(grant, input.binding, "scan");
      authorize(grant, snapshot, "scan");
      if (
        grant.actorId !== input.binding.actorId ||
        snapshot.mode !== "live" ||
        snapshot.expiresAt <= Date.now() ||
        fingerprint(snapshot.repository) !==
          fingerprint(input.binding.repository) ||
        signal.aborted
      )
        throw new LiveGuardError("not_found", 404);
      await input.verifyLease();
      await verifyScannerInstallation(permit, input.privateRoot);
      const source = await confinedSource(
          await input.sourceOwner.directory(snapshot),
        ),
        marker = JSON.parse(await readFile(source + ".lease", "utf8"));
      const receipt = await open(
        join(input.privateRoot, `${permit.runId}.scanner.${input.engine}.used`),
        "wx",
        0o600,
      );
      try {
        await receipt.writeFile(
          JSON.stringify({
            jobId: input.binding.jobId,
            engine: input.engine,
            specDigest: permit.specDigest,
            at: Date.now(),
          }),
        );
        await receipt.sync();
      } finally {
        await receipt.close();
      }
      const resource: ResourceRecord = {
        version: 2,
        caseId: "G02",
        runId: permit.runId,
        jobId: input.binding.jobId,
        specDigest: permit.specDigest,
        image: input.spec.image,
        imageId: permit.imageId,
        name: permit.containerName,
        containerId: null,
        deadline: Date.now() + input.spec.timeoutMs,
        source,
        createdAt: marker.createdAt,
        sourceExpiresAt: marker.expiresAt,
      };
      let exitCode: number | undefined;
      const bounded = AbortSignal.any([
        signal,
        AbortSignal.timeout(
          Math.max(
            1,
            Math.min(
              snapshot.expiresAt,
              grant.expiresAt,
              Date.parse(permit.expiresAt),
            ) - Date.now(),
          ),
        ),
      ]);
      const sandbox = scopedOwnedSandbox(
        input.spec,
        input.evidence,
        input.registry,
        resource,
        (actual) => {
          check();
          if (fingerprint(actual) !== permit.specDigest)
            throw new LiveGuardError("approval_required");
          validateSandboxSpec(actual);
        },
        input.driver,
        undefined,
        {
          acceptedExitCodes: [0, 1],
          completed: async (_out, state) => {
            exitCode = state.ExitCode;
          },
        },
      );
      const raw = await sandbox.execute(source, bounded);
      check();
      await verifyScannerInstallation(permit, input.privateRoot);
      if (signal.aborted || snapshot.expiresAt <= Date.now())
        throw new LiveGuardError("source_unavailable");
      await input.verifyLease();
      const fresh = await input.freshGrant();
      authorize(fresh, snapshot, "scan");
      if (fresh.actorId !== input.binding.actorId)
        throw new LiveGuardError("not_found", 404);
      if (Buffer.byteLength(raw) > input.spec.outputBytes)
        throw new LiveGuardError("source_limit");
      const ctx: NormalizationContext = {
        mode: "live",
        workspaceId: snapshot.workspaceId,
        projectId: snapshot.projectId,
        commit: snapshot.repository.commit,
        recordedAt: new Date().toISOString(),
        artifactDigest: digest(raw),
        synthetic: false,
        scannerVersion: permit.scannerVersion,
        rulePack: permit.rulePack,
      };
      const data = canonicalOutput(JSON.parse(raw), input.engine, snapshot),
        findings = await (input.engine === "sast"
          ? normalizeOpengrep(data, ctx)
          : input.engine === "sca"
            ? normalizeOSV(data, ctx)
            : input.engine === "secrets"
              ? normalizeGitleaks(data, ctx)
              : normalizeTrivy(data, ctx, "iac"));
      if (exitCode === undefined || (exitCode === 1 && !findings.length))
        throw new LiveGuardError("source_integrity");
      return {
        run: {
          engine: input.engine,
          status: "completed",
          scanner: scanners[input.engine],
          version: permit.scannerVersion,
          rulePack: permit.rulePack,
          reason:
            "Exact approved scanner ran in its attested, inspected container; source was not executed.",
        },
        findings,
      };
    },
  };
}

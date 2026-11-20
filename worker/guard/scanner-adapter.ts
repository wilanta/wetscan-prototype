import { ImageArtifactOwner } from "./image-artifact";
import { repositorySbom } from "../../src/features/guard/sbom";
import { tagFailure } from "./source-failure";
import { open, readFile, lstat } from "node:fs/promises";
import { join } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import {
  validateQualification,
  validateProductPolicy,
  type RepositoryScanPolicy,
  type ScannerQualification,
} from "../../src/features/guard/live/product-policy";
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
  normalizeOSVInventory,
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
  validateOperationalSandboxSpec,
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
export type RepositoryEngine = "sast" | "sca" | "secrets" | "iac" | "sbom" | "container";
const executables = {
  sast: "/usr/local/bin/opengrep",
  sca: "/usr/local/bin/osv-scanner",
  sbom: "/usr/local/bin/osv-scanner",
  secrets: "/usr/local/bin/gitleaks",
  iac: "/usr/local/bin/trivy",
  container: "/usr/local/bin/trivy",
} as const;
const scanners = {
  sast: "opengrep",
  sca: "osv-scanner",
  sbom: "osv-scanner",
  secrets: "gitleaks",
  iac: "trivy",
  container: "trivy",
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
  p: Pick<
    ScannerExecutionPermit,
    | "installationArtifactSha256"
    | "engine"
    | "specDigest"
    | "imageId"
    | "scannerVersion"
    | "rulePack"
    | "rulePackSha256"
  >,
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
export function canonicalOutput(
  input: unknown,
  engine: RepositoryEngine,
  snapshot: AuthorizedSnapshot,
) {
  const data = structuredClone(input);
  if (engine === "container") {
    const image = snapshot.image;
    if (!image || record(record(data).Metadata).ImageID !== image.configDigest) throw new LiveGuardError("source_integrity");
    for (const value of array(record(data).Results)) { const row=record(value); row.Target=safePath(String(row.Target).replace(/^\//,"")); }
  }
  else if (engine === "secrets")
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
  else if (engine === "sca" || engine === "sbom")
    for (const value of array(record(data).results)) {
      const r = record(record(value).source);
      r.path = relativeSourcePath(r.path, snapshot);
    }
  else {
    // Trivy emits a per-module directory summary (".", "infra", ...) even when it has no findings. It is not a
    // source location. Remove only an explicitly clean summary whose target is a DIRECTORY of the authorized manifest
    // (never a file); findings on a directory target, traversal, or any other unbound target still fail closed.
    const summaryDirectory = (target: unknown) => {
      if (target === ".") return true;
      if (typeof target !== "string") return false;
      let dir: string;
      try {
        dir = safePath(target);
      } catch {
        return false;
      }
      return (
        !snapshot.files.some((f) => f.path === dir) &&
        snapshot.files.some((f) => f.path.startsWith(dir + "/"))
      );
    };
    record(data).Results = array(record(data).Results).filter((value) => {
      const r = record(value);
      if (
        summaryDirectory(r.Target) &&
        r.Class === "config" &&
        record(r.MisconfSummary).Failures === 0 &&
        (r.Misconfigurations == null ||
          array(r.Misconfigurations).length === 0) &&
        (r.Vulnerabilities == null || array(r.Vulnerabilities).length === 0)
      )
        return false;
      r.Target = relativeSourcePath(r.Target, snapshot);
      return true;
    });
  }
  return data;
}
/** Successful CLI exit alone never proves SAST coverage. */
export function operationalSastCoverage(
  data: unknown,
  snapshot: AuthorizedSnapshot,
) {
  const output = record(data),
    scanned = record(output.paths).scanned;
  if (!Array.isArray(scanned) || scanned.length > snapshot.files.length)
    throw new LiveGuardError("source_integrity");
  const paths = new Set(
    scanned.map((path) => relativeSourcePath(path, snapshot)),
  );
  if (paths.size !== scanned.length)
    throw new LiveGuardError("source_integrity");
  for (const value of array(output.results))
    if (!paths.has(relativeSourcePath(record(value).path, snapshot)))
      throw new LiveGuardError("source_integrity");
  const eligible = snapshot.files.filter((f) =>
    /\.(?:[cm]?[jt]sx?|py)$/.test(f.path),
  ).length;
  const partial =
    paths.size < eligible || array(output.errors ?? []).length > 0;
  return {
    coverage: {
      status: !paths.size
        ? ("not_applicable" as const)
        : partial
          ? ("partial" as const)
          : ("complete" as const),
      scannedFiles: paths.size,
      eligibleFiles: eligible,
      scope: "Configured Opengrep JS/TS/Python rule subset only",
    },
    status: paths.size ? ("completed" as const) : ("not_applicable" as const),
    reason: paths.size
      ? "Opengrep scanned " +
        paths.size +
        " authorized manifest file(s); source was not executed."
      : "Opengrep scanned zero files; no supported-file coverage or clean result is claimed.",
  };
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
  return executeQualifiedScanner(input, permit, () =>
    validateScannerPermit(permit, input.binding, input.engine, input.spec),
  );
}
type ScannerResources = Omit<
  Parameters<typeof isolatedRepositoryScanner>[0],
  "permit"
>;
type ScannerAuthority = Pick<
  ScannerExecutionPermit,
  | "runId"
  | "containerName"
  | "expiresAt"
  | "installationArtifactSha256"
  | "engine"
  | "specDigest"
  | "imageId"
  | "scannerVersion"
  | "rulePack"
  | "rulePackSha256"
>;
function executeQualifiedScanner(
  input: ScannerResources,
  permit: ScannerAuthority,
  check: () => unknown,
  validate: (spec: SandboxSpec) => void = validateSandboxSpec,
): ScannerPort {
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
          validate(actual);
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
      const raw = await sandbox.execute(source, bounded).catch((error) => {
        throw tagFailure(error, "sandbox");
      });
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
          : input.engine === "sca" || input.engine === "sbom"
            ? normalizeOSV(data, ctx)
            : input.engine === "secrets"
              ? normalizeGitleaks(data, ctx)
              : normalizeTrivy(data, ctx, input.engine === "container" ? "container" : "iac"));
      if (exitCode === undefined || (exitCode === 1 && !findings.length))
        throw new LiveGuardError("source_integrity");
      const coverage =
        input.engine === "sast" && validate === validateOperationalSandboxSpec
          ? operationalSastCoverage(data, snapshot)
          : undefined;
      const dependencyEngine =
        input.engine === "sca" || input.engine === "sbom";
      const inventory = dependencyEngine
        ? normalizeOSVInventory(data)
        : undefined;
      const dependencyFiles = dependencyEngine
        ? new Set(
            array(record(data).results).map((r) =>
              String(record(record(r).source).path),
            ),
          )
        : new Set<string>();
      const manifests = snapshot.files.filter((f) =>
        /(?:^|\/)(?:package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|poetry\.lock|Pipfile\.lock|requirements[^/]*\.txt|Cargo\.lock|go\.mod|pom\.xml|Gemfile\.lock|composer\.lock)$/.test(
          f.path,
        ),
      );
      const dependencyCoverage = dependencyEngine
        ? {
            status: !inventory?.length
              ? ("not_applicable" as const)
              : manifests.some((f) => !dependencyFiles.has(f.path))
                ? ("partial" as const)
                : ("complete" as const),
            scannedFiles: dependencyFiles.size,
            eligibleFiles: manifests.length,
            scope:
              "npm lockfiles in the authorized snapshot; unsupported or unreported manifests remain partial; no reachability analysis",
          }
        : undefined;
      const iacFiles =
        input.engine === "iac"
          ? new Set(
              array(record(data).Results).map((r) => String(record(r).Target)),
            )
          : undefined;
      const iacEligible = snapshot.files.filter((f) =>
        /(?:\.(?:tf|tfvars|ya?ml)|(?:^|\/)Dockerfile)$/.test(f.path),
      ).length;
      const iacCoverage = iacFiles
        ? {
            status: !iacFiles.size
              ? ("not_applicable" as const)
              : iacFiles.size < iacEligible
                ? ("partial" as const)
                : ("complete" as const),
            scannedFiles: iacFiles.size,
            eligibleFiles: iacEligible,
            scope:
              "Trivy reported manifest-bound IaC targets only; unreported/unsupported files are not clean coverage",
          }
        : undefined;
      return {
        ...(input.engine === "sca" || input.engine === "sbom"
          ? {
              inventory: normalizeOSVInventory(data),
              ...(input.engine === "sbom"
                ? {
                    sbom: repositorySbom(
                      normalizeOSVInventory(data),
                      snapshot.repository,
                      ctx.artifactDigest,
                    ),
                  }
                : {}),
            }
          : {}),
        run: {
          engine: input.engine,
          ...(snapshot.image ? { image: snapshot.image } : {}),
          artifactDigest: ctx.artifactDigest,
          executionEvidence: {
            version: 1,
            runId: permit.runId,
            imageId: permit.imageId,
            specDigest: permit.specDigest,
            installationArtifactSha256: permit.installationArtifactSha256,
            cleanup: "VERIFIED",
          },
          coverage: coverage?.coverage ?? dependencyCoverage ?? iacCoverage,
          status:
            coverage?.status ??
            ((dependencyCoverage ?? iacCoverage)?.status === "not_applicable"
              ? "not_applicable"
              : "completed"),
          scanner: scanners[input.engine],
          version: permit.scannerVersion,
          rulePack: permit.rulePack,
          reason:
            coverage?.reason ??
            (dependencyCoverage ? dependencyCoverage.scope + "; " : "") +
              "Exact approved scanner ran in its attested, inspected container; source was not executed.",
        },
        findings: input.engine === "sbom" ? [] : snapshot.image ? findings.map(f=>({...f,location:{...f.location,artifactKind:"image",imageDigest:snapshot.image!.digest},evidence:f.evidence.map(e=>({...e,imageDigest:snapshot.image!.digest}))})) : findings,
      };
    },
  };
}

/** Normal website worker authority: no acceptance job, target or approval window is accepted. */
export function operationalRepositoryScanner(
  input: ScannerResources & {
    policy: RepositoryScanPolicy;
    qualification: ScannerQualification;
  },
): ScannerPort {
  const policy = structuredClone(input.policy),
    q = structuredClone(input.qualification),
    runId = randomUUID();
  const check = () => {
    validateProductPolicy(policy, {
      ...input.binding,
      idempotencyKey: input.binding.idempotencyKey,
      requestedEngines: input.binding.engines,
    });
    validateQualification(q, input.engine, input.spec);
    if (input.spec.timeoutMs > policy.scannerTimeoutMs)
      throw new LiveGuardError("execution_not_ready");
  };
  check();
  const authority: ScannerAuthority = {
    ...q,
    runId,
    containerName: "wetscan-guard-" + runId,
  };
  const attestation: SandboxAttestation = {
    verify: async (measurement) => {
      check();
      if (
        measurement.specDigest !== q.specDigest ||
        measurement.imageId !== q.imageId ||
        measurement.image !== input.spec.image ||
        measurement.daemonId !== q.daemonId ||
        measurement.daemonVersion !== q.daemonVersion ||
        measurement.kernelVersion !== q.kernelVersion
      )
        throw new LiveGuardError("execution_not_ready");
      const measured = await input.evidence.verify(measurement);
      if (
        !measured ||
        measured.expiresAt > Date.parse(q.expiresAt) ||
        !measured.artifactRef
      )
        throw new LiveGuardError("execution_not_ready");
      return measured;
    },
  };
  const imageOwner = new ImageArtifactOwner();
  const port = executeQualifiedScanner(
    { ...input, evidence: attestation, sourceOwner: input.engine === "container" ? imageOwner : input.sourceOwner },
    authority,
    check,
    validateOperationalSandboxSpec,
  );
  return {
    engine: port.engine,
    execute: async (snapshot, signal) => {
      let image: AuthorizedSnapshot | undefined, cleanupUnknown=false;
      try {
        if(input.engine === "container") { await input.verifyLease(); image=await imageOwner.acquire(snapshot,await input.freshGrant(),policy.image!,signal); }
        return await port.execute(image ?? snapshot, signal);
      } catch (error) {
        cleanupUnknown=(error as {code?:string})?.code==="cleanup_failed";
        throw tagFailure(error, "scanner");
      } finally { if(image&&!cleanupUnknown) await imageOwner.dispose(image); }
    },
  };
}

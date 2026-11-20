import { mkdtemp, writeFile, readFile, realpath, rm } from "node:fs/promises";
import { join, dirname, basename } from "node:path";
import { tmpdir } from "node:os";
import { setTimeout as delay } from "node:timers/promises";
import { fingerprint } from "../../../src/platform/identity";
import { secureSnapshotDirectory } from "../../../src/features/guard/live/snapshot-directory";
import { LiveGuardError } from "../../../src/features/guard/live/model";
import { dockerDriver, sandboxCreateArgs, type DockerDriver } from "../sandbox";
import {
  validateExecution,
  hash,
  type ExecutionPacket,
  type ExecutionApproval,
} from "./approval";
import { caseSpecs } from "./case-specs";
import { probeProgram, probePolicy } from "./probe-spec";
import { measureDaemon, sameDaemon } from "./daemon";
import { ResourceRegistry, type ResourceRecord } from "./registry";
import { inspectedBoundary } from "./inspection";
import { CaseJournal } from "./journal";
import { reapRegisteredContainer } from "./reaper";
import { verifyArtifacts } from "./integrity";
const fixture = "guard-g01-synthetic-only\n";
/** Six actual bounded synthetic probes. No PASS attestation is minted; owner reviews the raw result. */
export async function qualify(
  packet: ExecutionPacket,
  approval: ExecutionApproval,
  privateRoot: string,
  driverOverride?: DockerDriver,
) {
  const { packet: p, approval: a } = validateExecution(packet, approval);
  if (p.caseId !== "Q00") throw new LiveGuardError("approval_required");
  await verifyArtifacts(p);
  const program = await probeProgram(),
    specs = caseSpecs("Q00", program);
  if (
    hash(program) !== p.programSha256 ||
    JSON.stringify(specs.map(fingerprint)) !== JSON.stringify(p.specDigests)
  )
    throw new LiveGuardError("approval_required");
  const driver =
      driverOverride ?? dockerDriver(specs[0].docker, specs[0].endpoint),
    journal = new CaseJournal(privateRoot, p, a),
    registry = new ResourceRegistry(privateRoot);
  sameDaemon(p.daemon, await measureDaemon(specs[0], driver));
  const firstReceipt = await journal.reserve("qualification", 0);
  const source = await mkdtemp(join(tmpdir(), "wetscan-g01-snapshot-"));
  await secureSnapshotDirectory(source);
  await writeFile(join(source, "fixture.txt"), fixture, {
    flag: "wx",
    mode: 0o400,
  });
  const actualSource = await realpath(source),
    config = await mkdtemp(join(tmpdir(), "wetscan-g01-docker-"));
  const results: {
    case: string;
    inspectVerified: boolean;
    actualElapsedMs: number;
    output?: unknown;
    fault?: string;
    containerAbsent: boolean;
  }[] = [];
  const call = (
    args: string[],
    timeoutMs = 5000,
    maxBytes = 65536,
    signal?: AbortSignal,
  ) =>
    driver.call(args, { configDirectory: config, timeoutMs, maxBytes, signal });
  try {
    for (let slot = 0; slot < 6; slot++) {
      validateExecution(p, a);
      const receipt =
          slot === 0
            ? firstReceipt
            : await journal.reserve("qualification", slot),
        spec = specs[slot],
        name = p.containerNames[slot];
      const record: ResourceRecord = {
        version: 2,
        runId: p.runId,
        caseId: p.caseId,
        jobId: hash("qualification:" + p.runId),
        specDigest: fingerprint(spec),
        image: spec.image,
        imageId: p.daemon!.imageId,
        name,
        containerId: null,
        deadline: Date.now() + spec.timeoutMs,
        source: actualSource,
        createdAt: Date.now(),
        sourceExpiresAt: Date.now() + 300000,
      };
      const labels = {
        "wetscan.run": p.runId,
        "wetscan.job": record.jobId,
        "wetscan.spec": record.specDigest,
      };
      await registry.reserve(record);
      let created: ResourceRecord | undefined,
        absent = false;
      const row = {
        case: [
          "controls",
          "output",
          "timeout",
          "cancellation",
          "memory",
          "orphan_cleanup",
        ][slot],
        inspectVerified: false,
        actualElapsedMs: 0,
        containerAbsent: false,
      } as (typeof results)[number];
      results.push(row);
      try {
        validateExecution(p, a);
        await call(
          sandboxCreateArgs(
            spec,
            actualSource,
            name,
            probePolicy(spec),
            labels,
            record.deadline,
          ),
        );
        const metadata = JSON.parse(
          await call(["inspect", "--format", "{{json .}}", name]),
        );
        inspectedBoundary(metadata, spec, record, actualSource);
        created = await registry.inspect(record, metadata);
        row.inspectVerified = true;
        const abort = new AbortController();
        const timer =
          slot === 3 ? setTimeout(() => abort.abort(), 500) : undefined;
        let output = "",
          caught: unknown;
        const started = Date.now();
        try {
          validateExecution(p, a);
          output = await call(
            ["start", ...(slot === 5 ? [] : ["--attach"]), name],
            spec.timeoutMs,
            spec.outputBytes,
            abort.signal,
          );
        } catch (e) {
          caught = e;
        } finally {
          if (timer) clearTimeout(timer);
        }
        row.actualElapsedMs = Date.now() - started;
        const state = JSON.parse(
          await call(["inspect", "--format", "{{json .State}}", name]),
        );
        if (slot === 0) {
          const result = JSON.parse(output);
          if (
            caught ||
            state.Running ||
            state.ExitCode !== 0 ||
            Object.keys(result.checks ?? {}).length !== 10 ||
            Object.values(result.checks).some((v) => v !== true) ||
            result.files !== 1 ||
            result.bytes !== Buffer.byteLength(fixture) ||
            result.manifest !==
              hash(
                JSON.stringify([
                  ["fixture.txt", hash(fixture), Buffer.byteLength(fixture)],
                ]),
              )
          )
            throw new LiveGuardError("execution_not_ready");
          row.output = result;
        } else if (slot === 1) {
          if (
            !(caught instanceof LiveGuardError) ||
            caught.code !== "source_limit"
          )
            throw new LiveGuardError("execution_not_ready");
          row.fault = "output_bound";
        } else if (slot === 2 || slot === 3) {
          if (
            !caught ||
            !state.Running ||
            (slot === 2 && row.actualElapsedMs < 1400) ||
            (slot === 3 && !abort.signal.aborted)
          )
            throw new LiveGuardError("execution_not_ready");
          row.fault = slot === 2 ? "timeout" : "cancellation";
        } else if (slot === 4) {
          if (state.Running || state.ExitCode === 0 || !state.OOMKilled)
            throw new LiveGuardError("execution_not_ready");
          row.fault = "memory_oom";
        } else {
          if (caught || !state.Running)
            throw new LiveGuardError("execution_not_ready");
          await delay(Math.max(0, created.deadline - Date.now() + 5));
          await reapRegisteredContainer(created, registry, driver, config);
          absent = true;
        }
      } finally {
        if (!absent) {
          const m = JSON.parse(
            await call(["inspect", "--format", "{{json .}}", name]),
          );
          if (
            m.Name !== "/" + name ||
            m.Image !== record.imageId ||
            Object.entries(labels).some(([k, v]) => m.Config?.Labels?.[k] !== v)
          )
            throw new LiveGuardError("cleanup_failed");
          await call(["rm", "--force", created?.containerId ?? name]);
          if (
            (
              await call([
                "ps",
                "--all",
                "--filter",
                "name=^/" + name + "$",
                "--format",
                "{{.ID}}",
              ])
            ).trim()
          )
            throw new LiveGuardError("cleanup_failed");
          await registry.release(record, true);
          absent = true;
        }
        row.containerAbsent = absent;
        await journal.result(receipt, row);
      }
    }
    if (hash(await readFile(join(source, "fixture.txt"))) !== hash(fixture))
      throw new LiveGuardError("source_integrity");
    sameDaemon(p.daemon, await measureDaemon(specs[0], driver));
    return {
      caseId: "Q00",
      status: "PASS",
      productionAttestation: "NOT_ISSUED",
      classification: "LIVE_CONTROL_PROBES",
      daemon: p.daemon,
      programSha256: p.programSha256,
      results,
      syntheticFixtureRetained: true,
      fixtureSha256: hash(fixture),
      sourceUnchanged: true,
      privateHostSourceVerified: true,
    };
  } finally {
    // Synthetic fixture and every journal stay retained. Only our new empty CLI config is removed.
    const target = await realpath(config),
      parent = await realpath(tmpdir());
    if (
      dirname(target).toLowerCase() !== parent.toLowerCase() ||
      !basename(target).startsWith("wetscan-g01-docker-")
    )
      throw new LiveGuardError("cleanup_failed");
    await rm(target, { recursive: true, force: true });
  }
}

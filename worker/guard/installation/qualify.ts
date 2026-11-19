/** Explicit installation qualification only: never Auth, PostgreSQL, queue or owner source. */
import { spawn } from "node:child_process";
import { mkdtemp, readFile, writeFile, rm, realpath } from "node:fs/promises";
import { join, resolve, dirname, basename, isAbsolute } from "node:path";
import { tmpdir } from "node:os";
import { createHash, randomUUID } from "node:crypto";
import { fingerprint } from "../../../src/platform/identity";
import { secureSnapshotDirectory } from "../../../src/features/guard/live/snapshot-directory";
import {
  sandboxCreateArgs,
  validateOperationalSandboxSpec,
  type SandboxSpec,
} from "../sandbox";
import { inspectedBoundary } from "../acceptance/inspection";
import { eligibleContainer, type ResourceRecord } from "../acceptance/registry";
import { scannerCommands, installedScope } from "./commands";
import { canonicalOutput } from "../scanner-adapter";
import {
  normalizeOpengrep,
  normalizeOSV,
  normalizeGitleaks,
  normalizeTrivy,
} from "../../../src/features/guard/evidence";
import type { AuthorizedSnapshot } from "../../../src/features/guard/contracts";
const hash = (x: string | Buffer) =>
  createHash("sha256").update(x).digest("hex");
export interface InstallDocker {
  call(
    args: string[],
    options?: { signal?: AbortSignal; limit?: number; accepted?: number[] },
  ): Promise<string>;
}
export function installationDocker(
  executable: string,
  endpoint: string,
  configDirectory: string,
): InstallDocker {
  if (
    !isAbsolute(executable) ||
    !isAbsolute(configDirectory) ||
    !/^docker(?:\.exe)?$/i.test(basename(executable)) ||
    !/^npipe:\/\/\/\/\.\/pipe\/[A-Za-z0-9_.-]+$|^unix:\/\/\/[A-Za-z0-9_./-]+$/.test(
      endpoint,
    )
  )
    throw Error("invalid_docker_reference");
  return {
    call: (args, o = {}) =>
      new Promise((done, fail) => {
        const p = spawn(
          executable,
          ["--config", configDirectory, "--host", endpoint, ...args],
          {
            windowsHide: true,
            shell: false,
            signal: o.signal,
            env: {
              NODE_ENV: "production",
              SystemRoot: process.env.SystemRoot,
              WINDIR: process.env.WINDIR,
              TEMP: configDirectory,
              TMP: configDirectory,
              HOME: configDirectory,
              DOCKER_CONFIG: configDirectory,
            },
            stdio: ["ignore", "pipe", "pipe"],
          },
        );
        let stdout = "",
          stderr = "",
          size = 0,
          limited = false;
        const timer = setTimeout(() => p.kill(), 125000);
        p.stdout.on("data", (b) => {
          size += b.length;
          if (size > (o.limit ?? 2000000)) {
            limited = true;
            p.kill();
          } else stdout += b.toString();
        });
        p.stderr.on("data", (b) => {
          size += b.length;
          if (size > (o.limit ?? 2000000)) {
            limited = true;
            p.kill();
          } else stderr += b.toString();
        });
        p.once("error", (e) => {
          clearTimeout(timer);
          fail(e);
        });
        p.once("close", (code) => {
          clearTimeout(timer);
          if (limited)
            fail(Object.assign(Error("output_limit"), { outputLimit: true }));
          else if (!(o.accepted ?? [0]).includes(code ?? -1))
            fail(
              Object.assign(Error("cli_exit"), {
                exitCode: code,
                safeDiagnostic: stderr.slice(-4000),
              }),
            );
          else done(stdout);
        });
      }),
  };
}
export async function removeInstallationContainer(
  d: InstallDocker,
  name: string,
  id: string,
  imageId: string,
  runId: string,
) {
  const v = JSON.parse(
    await d.call(["inspect", "--format", "{{json .}}", name]),
  );
  if (
    v.Id !== id ||
    v.Name !== "/" + name ||
    v.Image !== imageId ||
    v.Config?.Labels?.["wetscan.run"] !== runId
  )
    throw Error("owned_cleanup_identity_mismatch");
  await d.call(["rm", "--force", name]);
  if (
    (
      await d.call([
        "ps",
        "--all",
        "--filter",
        "name=^/" + name + "$",
        "--format",
        "{{.ID}}",
      ])
    ).trim()
  )
    throw Error("owned_cleanup_absence_unknown");
}
async function main() {
  const root = resolve(process.argv[2] ?? "");
  if (!root.endsWith(join(".local", "g02-install")))
    throw Error("installation_root_required");
  const image = JSON.parse(
      await readFile(join(root, "built-image.json"), "utf8"),
    ),
    base = JSON.parse(
      (await readFile(join(root, "base-image.json"), "utf8")).replace(
        /^\uFEFF/,
        "",
      ),
    );
  if (!process.env.G02_INSTALL_DOCKER)
    throw Error("G02_INSTALL_DOCKER_reference_required");
  const docker = installationDocker(
    process.env.G02_INSTALL_DOCKER,
    "npipe:////./pipe/docker_engine",
    join(root, "docker-config"),
  );
  const initial = JSON.parse(
      await docker.call(["info", "--format", "{{json .}}"]),
    ),
    version = JSON.parse(
      await docker.call(["version", "--format", "{{json .Server}}"]),
    );
  const source = await mkdtemp(
    join(tmpdir(), "wetscan-g01-snapshot-g02-install-"),
  );
  await secureSnapshotDirectory(source);
  const contents: Record<string, string> = {
    "probe-control.txt": "CONTROLLED_G02_INSTALLATION_ONLY",
    "test.js": "const userInput = process.env.UNTRUSTED; eval(userInput);\n",
    "sample-token.txt":
      "token = ghp_" +
      Array.from(
        { length: 36 },
        (_, i) => "abcdefghijklmnopqrstuvwxyz0123456789"[(i * 7 + 3) % 36],
      ).join("") +
      "\n",
    "main.tf":
      'resource "aws_security_group" "qualification" {\n  name = "qualification"\n  ingress {\n    from_port = 0\n    to_port = 0\n    protocol = "-1"\n    cidr_blocks = ["0.0.0.0/0"]\n  }\n}\n',
    "package-lock.json": JSON.stringify({
      name: "controlled-installation-only",
      version: "1.0.0",
      lockfileVersion: 3,
      requires: true,
      packages: {
        "": {
          name: "controlled-installation-only",
          version: "1.0.0",
          dependencies: { lodash: "4.17.15" },
        },
        "node_modules/lodash": {
          version: "4.17.15",
          resolved: "https://registry.npmjs.org/lodash/-/lodash-4.17.15.tgz",
        },
      },
    }),
  };
  for (const [name, bytes] of Object.entries(contents))
    await writeFile(join(source, name), bytes, { flag: "wx" });
  const report: {
    completedAt?: string;
    classification: string;
    imageId: string;
    ownerRepositoryAccessed: boolean;
    databaseConnected: boolean;
    sourceFixtureDigest: string;
    hardware: unknown;
    tests: Record<string, unknown>;
    scanners: Record<string, unknown>;
    cleanupVerified: boolean;
    installationRunId: string;
  } = {
    installationRunId: randomUUID(),
    classification: "REAL_CLI_CONTROLLED_INSTALLATION_NOT_OWNER_SCAN",
    imageId: image.imageId,
    ownerRepositoryAccessed: false,
    databaseConnected: false,
    sourceFixtureDigest: fingerprint(
      Object.entries(contents).map(([path, content]) => ({
        path,
        sha256: hash(content),
      })),
    ),
    hardware: {
      daemonId: initial.ID,
      daemonVersion: version.Version,
      kernelVersion: initial.KernelVersion,
      sourceBase: base.reference,
    },
    tests: {},
    scanners: {},
    cleanupVerified: false,
  };
  let unknownCleanup = false;
  const execute = async (
    engine: string,
    args: string[],
    mode = "normal",
    ms = 15000,
  ) => {
    const runId = randomUUID(),
      name = "wetscan-guard-" + runId;
    const spec: SandboxSpec = {
      docker: process.env.G02_INSTALL_DOCKER!,
      endpoint: "npipe:////./pipe/docker_engine",
      image: image.imageId,
      executable: "/usr/local/bin/" + engine,
      args,
      cpu: 1,
      memoryMb: engine === "osv-scanner" ? 2048 : 256,
      pids: 64,
      timeoutMs: ms,
      outputBytes: 2000000,
    };
    const record: ResourceRecord = {
      version: 2,
      caseId: "G02_INSTALL",
      jobId: hash(runId),
      runId,
      specDigest: fingerprint(spec),
      image: spec.image,
      imageId: image.imageId,
      name,
      containerId: null,
      deadline: Date.now() + ms,
      source,
      createdAt: Date.now(),
      sourceExpiresAt: Date.now() + ms,
    };
    const labels = {
      "wetscan.run": runId,
      "wetscan.job": record.jobId,
      "wetscan.spec": record.specDigest,
    };
    let id: string | undefined;
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await writeFile(
        join(root, "intent-" + runId + ".json"),
        JSON.stringify({
          record,
          phase: "BEFORE_CREATE",
          classification: "CONTROLLED_INSTALLATION_ONLY",
        }),
        { flag: "wx" },
      );
      try {
        id = (
          await docker.call(
            sandboxCreateArgs(
              spec,
              source,
              name,
              validateOperationalSandboxSpec,
              labels,
              record.deadline,
            ),
          )
        ).trim();
      } catch (error) {
        unknownCleanup = true;
        throw Object.assign(Error("create_unknown_STOP"), { cause: error });
      }
      if (!/^[a-f0-9]{64}$/.test(id)) {
        unknownCleanup = true;
        throw Error("create_id_unknown_STOP");
      }
      const m = JSON.parse(
        await docker.call(["inspect", "--format", "{{json .}}", name]),
      );
      inspectedBoundary(m, spec, record, source);
      if (m.Id !== id) throw Error("container_id_mismatch");
      if (mode === "orphan") {
        await docker.call(["start", name]);
        await new Promise((r) => setTimeout(r, ms + 100));
        const state = JSON.parse(
          await docker.call(["inspect", "--format", "{{json .}}", name]),
        );
        const owned = { ...record, containerId: id };
        if (
          !eligibleContainer(owned, state) ||
          eligibleContainer({ ...owned, jobId: "f".repeat(64) }, state)
        )
          throw Error("orphan_identity_or_expiry");
        return {
          output: "",
          state: state.State,
          inspected: true,
          orphanVerified: true,
        };
      }
      timer = setTimeout(
        () => abort.abort(),
        mode === "cancel" ? 250 : mode === "timeout" ? 700 : ms,
      );
      const startedAt = Date.now();
      try {
        const output = await docker.call(["start", "--attach", name], {
          signal: abort.signal,
          limit: mode === "output" ? 1024 : 2000000,
          accepted: mode === "oom" ? [137] : mode === "scan" ? [0, 1] : [0],
        });
        const state = JSON.parse(
          await docker.call(["inspect", "--format", "{{json .State}}", name]),
        );
        return {
          output,
          state,
          inspected: true,
          spec,
          elapsedMs: Date.now() - startedAt,
        };
      } catch (e) {
        if ((mode === "cancel" || mode === "timeout") && abort.signal.aborted)
          return { output: "", state: null, inspected: true, aborted: true };
        if (mode === "output" && (e as { outputLimit?: boolean }).outputLimit)
          return {
            output: "",
            state: null,
            inspected: true,
            outputLimited: true,
          };
        throw e;
      }
    } finally {
      clearTimeout(timer);
      if (id)
        try {
          await removeInstallationContainer(
            docker,
            name,
            id,
            image.imageId,
            runId,
          );
          await writeFile(
            join(root, "removed-" + runId + ".json"),
            JSON.stringify({
              name,
              id,
              absent: true,
              at: new Date().toISOString(),
            }),
            { flag: "wx" },
          );
        } catch {
          unknownCleanup = true;
          throw Error("cleanup_unknown_STOP");
        }
    }
  };
  let phase = "controls";
  try {
    if (process.argv[3] === "--subcommand-help") {
      for (const [engine, args] of [
        ["opengrep", ["scan", "--help"]],
        ["osv-scanner", ["scan", "source", "--help"]],
        ["trivy", ["config", "--help"]],
      ] as const) {
        phase = "help_" + engine;
        const r = await execute(engine, [...args]);
        await writeFile(join(root, engine + ".scan-help.txt"), r.output);
        report.tests[phase] = { status: "PASS", exitCode: r.state.ExitCode };
      }
    } else {
      const controls = await execute("opengrep", [
        "--guard-control",
        "controls",
      ]);
      report.tests.controls = {
        status: "PASS",
        ...JSON.parse(controls.output),
      };
      for (const [mode, arg, ms] of [
        ["output", "output", 5000],
        ["timeout", "sleep", 5000],
        ["cancel", "sleep", 5000],
        ["oom", "oom", 10000],
        ["orphan", "sleep", 1000],
      ] as const) {
        phase = mode;
        const r = await execute("opengrep", ["--guard-control", arg], mode, ms);
        if (mode === "oom" && !r.state?.OOMKilled)
          throw Error("OOM_not_observed");
        report.tests[mode] = { status: "PASS", ...r, output: undefined };
      }
      for (const engine of ["opengrep", "osv-scanner", "gitleaks", "trivy"]) {
        try {
          const v = await execute(engine, ["--version"]);
          report.scanners[engine] = {
            versionStatus: "PASS",
            versionOutput: v.output.trim(),
          };
          console.log(
            JSON.stringify({
              phase: "scanner_version",
              engine,
              output: v.output.trim(),
            }),
          );
          if (engine === "gitleaks") continue;
          const help = await execute(engine, ["--help"]);
          await writeFile(join(root, engine + ".help.txt"), help.output);
        } catch (e) {
          report.scanners[engine] = {
            versionStatus: "BLOCKED",
            reason: (e as Error).message,
            exitCode: (e as { exitCode?: number }).exitCode,
            safeDiagnostic: (e as { safeDiagnostic?: string }).safeDiagnostic,
          };
        }
        if (unknownCleanup) throw Error("cleanup_unknown_STOP");
      }
    }
    if (
      process.argv[3] === "--full" ||
      process.argv[3] === "--scanner-fixture"
    ) {
      const snapshot: AuthorizedSnapshot = {
        mode: "demo",
        workspaceId: "controlled-installation",
        projectId: "controlled-installation",
        repository: {
          provider: "github",
          repositoryId: "controlled-fixture",
          branch: "fixture",
          commit: "0".repeat(40),
        },
        digest: report.sourceFixtureDigest,
        expiresAt: Date.now() + 300000,
        files: Object.entries(contents).map(([path, text]) => ({
          path,
          size: Buffer.byteLength(text),
          sha256: hash(text),
        })),
      };
      const ctx = {
        mode: "demo" as const,
        workspaceId: snapshot.workspaceId,
        projectId: snapshot.projectId,
        commit: snapshot.repository.commit,
        recordedAt: new Date().toISOString(),
        synthetic: true,
        scannerVersion: "",
        rulePack: "controlled-official-installation",
        artifactDigest: "",
      };
      for (const engine of [
        "opengrep",
        "osv-scanner",
        "gitleaks",
        "trivy",
      ] as const) {
        phase = "scan_" + engine;
        try {
          const r = await execute(
            engine,
            [...scannerCommands[engine]],
            "scan",
            45000,
          );
          const kind = (
            {
              opengrep: "sast",
              "osv-scanner": "sca",
              gitleaks: "secrets",
              trivy: "iac",
            } as const
          )[engine];
          await writeFile(
            join(root, report.installationRunId + "." + engine + ".raw.json"),
            r.output,
            { flag: "wx" },
          );
          const raw = canonicalOutput(JSON.parse(r.output), kind, snapshot),
            context = {
              ...ctx,
              artifactDigest: hash(r.output),
              scannerVersion: engine,
            };
          const findings = await (engine === "opengrep"
            ? normalizeOpengrep(raw, context)
            : engine === "osv-scanner"
              ? normalizeOSV(raw, context)
              : engine === "gitleaks"
                ? normalizeGitleaks(raw, context)
                : normalizeTrivy(raw, context, "iac"));
          if (!findings.length)
            throw Error("known_fixture_finding_not_observed");
          await writeFile(
            join(root, report.installationRunId + "." + engine + ".scan.json"),
            r.output,
            { flag: "wx" },
          );
          report.scanners[engine] = {
            ...((report.scanners[engine] as object) ?? {}),
            scanStatus: "PASS",
            spec: r.spec,
            elapsedMs: r.elapsedMs,
            findings: findings.length,
            outputSha256: context.artifactDigest,
            exitCode: r.state.ExitCode,
            scope: installedScope[engine],
            specArgs: scannerCommands[engine],
            classification:
              "REAL_CLI_ON_CONTROLLED_SYNTHETIC_SOURCE_NOT_OWNER_SCAN",
          };
        } catch (error) {
          report.scanners[engine] = {
            ...((report.scanners[engine] as object) ?? {}),
            scanStatus: "BLOCKED",
            reason: (error as Error).message,
            exitCode: (error as { exitCode?: number }).exitCode,
            safeDiagnostic: (error as { safeDiagnostic?: string })
              .safeDiagnostic,
          };
          if (unknownCleanup) throw error;
        }
        console.log(
          JSON.stringify({
            phase: "scanner_fixture",
            engine,
            ...(report.scanners[engine] as object),
          }),
        );
      }
    }
    phase = "daemon_recheck";
    const final = JSON.parse(
      await docker.call(["info", "--format", "{{json .}}"]),
    );
    if (
      final.ID !== initial.ID ||
      final.KernelVersion !== initial.KernelVersion
    )
      throw Error("daemon_drift");
    report.cleanupVerified = true;
  } catch (error) {
    report.tests[phase] = {
      status: unknownCleanup ? "UNKNOWN_STOP" : "FAIL",
      reason: (error as Error).message,
    };
    throw error;
  } finally {
    if (!unknownCleanup) {
      const actual = await realpath(source),
        parent = await realpath(tmpdir());
      if (
        dirname(actual).toLowerCase() !== parent.toLowerCase() ||
        !basename(actual).startsWith("wetscan-g01-snapshot-g02-install-")
      )
        throw Error("fixture_boundary");
      await rm(actual, { recursive: true, force: true });
      report.cleanupVerified = true;
    }
    report.completedAt = new Date().toISOString();
    await writeFile(
      join(
        root,
        "physical-installation-report." + report.installationRunId + ".json",
      ),
      JSON.stringify(report, null, 2),
      { flag: "wx" },
    );
    console.log(
      JSON.stringify({
        phase: "installation_report",
        imageId: report.imageId,
        tests: report.tests,
        scanners: report.scanners,
        cleanupVerified: report.cleanupVerified,
        ownerRepositoryAccessed: false,
        databaseConnected: false,
      }),
    );
  }
}
if (process.argv[1]?.replaceAll("\\", "/").endsWith("/qualify.ts"))
  main().catch((e) => {
    console.log(
      JSON.stringify({
        phase: "installation_STOP",
        reason: e.message,
        exitCode: e.exitCode,
        safeDiagnostic: e.safeDiagnostic,
      }),
    );
    process.exitCode = 1;
  });

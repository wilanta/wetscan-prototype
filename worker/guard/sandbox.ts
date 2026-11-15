import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, realpath, lstat } from "node:fs/promises";
import { isAbsolute, join, resolve, basename, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fingerprint } from "../../src/platform/identity";
import { LiveGuardError } from "../../src/features/guard/live/model";
export const sandboxControls = [
  "non_root",
  "read_only_root",
  "read_only_source",
  "source_readable",
  "private_host_source",
  "no_host_secrets",
  "no_socket",
  "no_network",
  "cpu",
  "memory",
  "pids",
  "timeout",
  "output",
  "cancellation",
  "orphan_cleanup",
] as const;
export interface SandboxSpec {
  docker: string;
  endpoint: string;
  image: string;
  executable: string;
  args: readonly string[];
  cpu: 1;
  memoryMb: 256;
  pids: 64;
  timeoutMs: number;
  outputBytes: number;
}
export interface SandboxAttestation {
  verify(input: {
    specDigest: string;
    daemonVersion: string;
    daemonId: string;
    kernelVersion: string;
    imageId: string;
    image: string;
  }): Promise<{
    expiresAt: number;
    verified: readonly (typeof sandboxControls)[number][];
    artifactRef: string;
  } | null>;
}
export interface DockerDriver {
  call(
    args: readonly string[],
    input: {
      signal?: AbortSignal;
      timeoutMs: number;
      maxBytes: number;
      configDirectory: string;
    },
  ): Promise<string>;
}
export function dockerDriver(
  executable: string,
  endpoint: string,
): DockerDriver {
  if (
    !validEndpoint(endpoint) ||
    !isAbsolute(executable) ||
    !/^docker(?:\.exe)?$/i.test(basename(executable))
  )
    throw new LiveGuardError("not_configured");
  return {
    call: (args, input) =>
      new Promise((done, fail) => {
        if (input.signal?.aborted) {
          fail(new LiveGuardError("source_unavailable"));
          return;
        }
        let settled = false,
          bytes = 0,
          output = "";
        const child = spawn(executable, ["--host", endpoint, ...args], {
          windowsHide: true,
          shell: false,
          signal: input.signal,
          stdio: ["ignore", "pipe", "pipe"],
          env: {
            NODE_ENV: "production",
            SystemRoot: process.env.SystemRoot,
            WINDIR: process.env.WINDIR,
            TEMP: input.configDirectory,
            TMP: input.configDirectory,
            HOME: input.configDirectory,
            DOCKER_CONFIG: input.configDirectory,
          },
        });
        const timer = setTimeout(
          () => finish(new LiveGuardError("source_unavailable")),
          input.timeoutMs,
        );
        const finish = (error?: Error) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          if (error) {
            child.kill();
            fail(error);
          } else done(output);
        };
        child.stdout.on("data", (chunk: Buffer) => {
          bytes += chunk.length;
          if (bytes > input.maxBytes)
            finish(new LiveGuardError("source_limit", 413));
          else output += chunk.toString("utf8");
        });
        child.stderr.on("data", (chunk: Buffer) => {
          bytes += chunk.length;
          if (bytes > input.maxBytes)
            finish(new LiveGuardError("source_limit", 413));
        });
        child.once("error", () =>
          finish(new LiveGuardError("source_unavailable")),
        );
        child.once("close", (code) =>
          finish(
            code === 0 ? undefined : new LiveGuardError("source_unavailable"),
          ),
        );
      }),
  };
}
function validEndpoint(value: string) {
  return (
    typeof value === "string" &&
    (/^unix:\/\/\/[A-Za-z0-9_./-]+$/.test(value) ||
      /^npipe:\/\/\/\/\.\/pipe\/[A-Za-z0-9_.-]+$/.test(value))
  );
}
export function validateSandboxSpec(spec: SandboxSpec) {
  if (
    !validEndpoint(spec.endpoint) ||
    !isAbsolute(spec.docker) ||
    !/^docker(?:\.exe)?$/i.test(basename(spec.docker)) ||
    !/^ghcr\.io\/[a-z0-9._/-]+@sha256:[a-f0-9]{64}$/.test(spec.image) ||
    !/^\/usr\/local\/bin\/(?:guard-g01-probe|opengrep|gitleaks|osv-scanner|trivy)$/.test(
      spec.executable,
    ) ||
    spec.cpu !== 1 ||
    spec.memoryMb !== 256 ||
    spec.pids !== 64 ||
    !Number.isInteger(spec.timeoutMs) ||
    spec.timeoutMs < 100 ||
    spec.timeoutMs > 120000 ||
    !Number.isInteger(spec.outputBytes) ||
    spec.outputBytes < 1024 ||
    spec.outputBytes > 2000000 ||
    spec.args.length > 32 ||
    spec.args.some((a) => a.length > 256 || /[\r\n\0]/.test(a))
  )
    throw new LiveGuardError("not_configured");
}
/** Arguments are server-reviewed spec, never source scripts, Dockerfiles, package hooks or client input. */
export function sandboxCreateArgs(
  spec: SandboxSpec,
  source: string,
  name: string,
) {
  validateSandboxSpec(spec);
  if (
    !isAbsolute(source) ||
    /[\r\n,\0]/.test(source) ||
    !/^wetscan-guard-[a-f0-9-]{36}$/.test(name)
  )
    throw new LiveGuardError("invalid_input", 400);
  return [
    "create",
    "--name",
    name,
    "--label",
    "wetscan.module=guard",
    "--label",
    `wetscan.deadline=${Date.now() + spec.timeoutMs}`,
    "--pull=never",
    "--network=none",
    "--read-only",
    "--user",
    "65532:65532",
    "--cap-drop=ALL",
    "--security-opt=no-new-privileges",
    "--pids-limit",
    String(spec.pids),
    "--memory",
    `${spec.memoryMb}m`,
    "--memory-swap",
    `${spec.memoryMb}m`,
    "--cpus",
    String(spec.cpu),
    "--ipc=none",
    "--tmpfs",
    "/tmp:rw,noexec,nosuid,nodev,size=16777216",
    "--mount",
    `type=bind,src=${source},dst=/source,readonly`,
    "--workdir",
    "/tmp",
    "--entrypoint",
    spec.executable,
    spec.image,
    ...spec.args,
  ];
}
export class DockerGuardSandbox {
  constructor(
    private readonly spec: SandboxSpec,
    private readonly driver: DockerDriver,
    private readonly evidence: SandboxAttestation,
  ) {
    validateSandboxSpec(spec);
  }
  private async ready(configDirectory: string) {
    const version = JSON.parse(
      await this.driver.call(["version", "--format", "{{json .Server}}"], {
        configDirectory,
        timeoutMs: 5000,
        maxBytes: 32000,
      }),
    ) as { Os?: string; Version?: string };
    if (version.Os !== "linux" || !version.Version)
      throw new LiveGuardError("execution_not_ready");
    const daemon = JSON.parse(
      await this.driver.call(["info", "--format", "{{json .}}"], {
        configDirectory,
        timeoutMs: 5000,
        maxBytes: 64000,
      }),
    ) as { ID?: string; KernelVersion?: string };
    const image = JSON.parse(
      await this.driver.call(
        ["image", "inspect", "--format", "{{json .}}", this.spec.image],
        { configDirectory, timeoutMs: 5000, maxBytes: 32000 },
      ),
    ) as { Id?: string; RepoDigests?: string[] };
    if (
      !daemon.ID ||
      !daemon.KernelVersion ||
      !/^sha256:[a-f0-9]{64}$/.test(image.Id ?? "") ||
      !Array.isArray(image.RepoDigests) ||
      !image.RepoDigests.includes(this.spec.image)
    )
      throw new LiveGuardError("execution_not_ready");
    const proof = await this.evidence.verify({
      specDigest: fingerprint(this.spec),
      daemonVersion: version.Version,
      daemonId: daemon.ID,
      kernelVersion: daemon.KernelVersion,
      imageId: image.Id!,
      image: this.spec.image,
    });
    if (
      !proof ||
      proof.expiresAt <= Date.now() ||
      !proof.artifactRef ||
      sandboxControls.some((c) => !proof.verified.includes(c))
    )
      throw new LiveGuardError("execution_not_ready");
    return image.Id!;
  }
  async execute(source: string, signal: AbortSignal): Promise<string> {
    if (signal.aborted) throw new LiveGuardError("execution_not_ready");
    const config = await mkdtemp(join(tmpdir(), "wetscan-g01-docker-")),
      name = `wetscan-guard-${randomUUID()}`;
    let created = false;
    try {
      const imageId = await this.ready(config);
      if (signal.aborted) throw new LiveGuardError("execution_not_ready");
      const actual = await realpath(source);
      const equalPath = (a: string, b: string) =>
        process.platform === "win32"
          ? a.toLowerCase() === b.toLowerCase()
          : a === b;
      if (
        !equalPath(dirname(actual), await realpath(tmpdir())) ||
        !basename(actual).startsWith("wetscan-g01-snapshot-") ||
        (await lstat(source)).isSymbolicLink()
      )
        throw new LiveGuardError("invalid_input", 400);
      created = true; // Name is owned before create; even a timed-out create may have created the container.
      await this.driver.call(sandboxCreateArgs(this.spec, actual, name), {
        configDirectory: config,
        timeoutMs: 5000,
        maxBytes: 32000,
      });
      created = true;
      const enforced = JSON.parse(
        await this.driver.call(["inspect", "--format", "{{json .}}", name], {
          configDirectory: config,
          timeoutMs: 5000,
          maxBytes: 64000,
        }),
      ) as {
        Image: string;
        Config: { User: string };
        HostConfig: {
          Privileged: boolean;
          ReadonlyRootfs: boolean;
          NetworkMode: string;
          Memory: number;
          MemorySwap: number;
          PidsLimit: number;
          NanoCpus: number;
          CapDrop: string[];
          SecurityOpt: string[];
        };
        Mounts: { Source: string; Destination: string; RW: boolean }[];
      };
      const host = enforced.HostConfig;
      if (
        enforced.Image !== imageId ||
        enforced.Config.User !== "65532:65532" ||
        host.Privileged ||
        !host.ReadonlyRootfs ||
        host.NetworkMode !== "none" ||
        host.Memory !== 256 * 1024 * 1024 ||
        host.MemorySwap !== host.Memory ||
        host.PidsLimit !== 64 ||
        host.NanoCpus !== 1e9 ||
        !host.CapDrop.includes("ALL") ||
        !host.SecurityOpt.some((v) => v.startsWith("no-new-privileges")) ||
        enforced.Mounts.length !== 1 ||
        enforced.Mounts[0].Destination !== "/source" ||
        enforced.Mounts[0].RW ||
        !equalPath(enforced.Mounts[0].Source, actual)
      )
        throw new LiveGuardError("execution_not_ready");
      const output = await this.driver.call(["start", "--attach", name], {
        configDirectory: config,
        signal,
        timeoutMs: this.spec.timeoutMs,
        maxBytes: this.spec.outputBytes,
      });
      const state = JSON.parse(
        await this.driver.call(
          ["inspect", "--format", "{{json .State}}", name],
          { configDirectory: config, timeoutMs: 5000, maxBytes: 16000 },
        ),
      ) as { Running: boolean; ExitCode: number; OOMKilled: boolean };
      if (state.Running || state.ExitCode !== 0 || state.OOMKilled)
        throw new LiveGuardError("source_unavailable");
      return output;
    } finally {
      let failed = false;
      if (created)
        try {
          await this.driver.call(["rm", "--force", name], {
            configDirectory: config,
            timeoutMs: 5000,
            maxBytes: 32000,
          });
        } catch {
          failed = true;
        }
      const target = resolve(config);
      if (
        dirname(target) !== resolve(tmpdir()) ||
        !basename(target).startsWith("wetscan-g01-docker-")
      )
        throw new LiveGuardError("cleanup_failed");
      await rm(target, { recursive: true, force: true });
      if (failed) throw new LiveGuardError("cleanup_failed");
    }
  }
  async cleanupExpiredOwnedContainers(now = Date.now()): Promise<number> {
    const config = await mkdtemp(join(tmpdir(), "wetscan-g01-docker-"));
    let count = 0;
    try {
      await this.ready(config);
      const ids = (
        await this.driver.call(
          [
            "ps",
            "--all",
            "--filter",
            "label=wetscan.module=guard",
            "--format",
            "{{.ID}}",
          ],
          { configDirectory: config, timeoutMs: 5000, maxBytes: 16000 },
        )
      )
        .trim()
        .split(/\s+/)
        .filter(Boolean);
      if (ids.length > 100 || ids.some((id) => !/^[a-f0-9]{12,64}$/.test(id)))
        throw new LiveGuardError("cleanup_failed");
      for (const id of ids) {
        const metadata = JSON.parse(
          await this.driver.call(["inspect", "--format", "{{json .}}", id], {
            configDirectory: config,
            timeoutMs: 5000,
            maxBytes: 64000,
          }),
        ) as {
          Name: string;
          Config: { Image: string; Labels: Record<string, string> };
        };
        const labels = metadata.Config.Labels,
          deadline = Number(labels["wetscan.deadline"]);
        if (
          metadata.Config.Image !== this.spec.image ||
          labels["wetscan.module"] !== "guard" ||
          !/^\/wetscan-guard-[a-f0-9-]{36}$/.test(metadata.Name) ||
          !Number.isFinite(deadline) ||
          deadline > now
        )
          continue;
        await this.driver.call(["rm", "--force", id], {
          configDirectory: config,
          timeoutMs: 5000,
          maxBytes: 32000,
        });
        count++;
      }
      return count;
    } finally {
      const target = resolve(config);
      if (
        dirname(target) !== resolve(tmpdir()) ||
        !basename(target).startsWith("wetscan-g01-docker-")
      )
        throw new LiveGuardError("cleanup_failed");
      await rm(target, { recursive: true, force: true });
    }
  }
  async readiness() {
    const config = await mkdtemp(join(tmpdir(), "wetscan-g01-docker-"));
    try {
      await this.ready(config);
      return { status: "verified" as const };
    } catch {
      return {
        status: "BLOCKED" as const,
        reason: "runtime_image_or_enforcement_acceptance_missing",
      };
    } finally {
      const target = resolve(config);
      if (
        dirname(target) !== resolve(tmpdir()) ||
        !basename(target).startsWith("wetscan-g01-docker-")
      )
        throw new LiveGuardError("cleanup_failed");
      await rm(target, { recursive: true, force: true });
    }
  }
}
// No default image, attestation or host-execution fallback. A config/flag is never enforcement evidence.
export const unavailableSandbox = {
  status: "BLOCKED" as const,
  reason: "runtime_image_and_real_isolation_acceptance_required",
};

/** Production factory always pins the CLI to the reviewed local daemon; ambient Docker contexts are ignored. */
export function createDockerGuardSandbox(
  spec: SandboxSpec,
  evidence: SandboxAttestation,
) {
  validateSandboxSpec(spec);
  return new DockerGuardSandbox(
    spec,
    dockerDriver(spec.docker, spec.endpoint),
    evidence,
  );
}

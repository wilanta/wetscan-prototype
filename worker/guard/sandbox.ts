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
  memoryMb: 256 | 2048;
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
      acceptedExitCodes?: readonly number[];
    },
  ): Promise<string>;
}
/** Docker reports official-library references without a docker.io prefix on some versions. */
export function pinnedImagePresent(
  reference: string,
  repoDigests: readonly string[],
) {
  if (repoDigests.includes(reference)) return true;
  const official = reference.match(
    /^docker\.io\/library\/([a-z0-9_-]+)(@sha256:[a-f0-9]{64})$/,
  );
  return (
    !!official &&
    [official[1], "library/" + official[1]].some((name) =>
      repoDigests.includes(name + official[2]),
    )
  );
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
            code === 0 ||
              (args[0] === "start" &&
                args[1] === "--attach" &&
                code === 1 &&
                input.acceptedExitCodes?.includes(1))
              ? undefined
              : new LiveGuardError("source_unavailable"),
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
/** Operational-only local build identity. Legacy G01 validator remains registry-digest-only. */
export function validateOperationalSandboxSpec(spec: SandboxSpec) {
  const local = /^sha256:[a-f0-9]{64}$/.test(spec.image);
  if (
    spec.memoryMb !== 256 &&
    !(
      spec.memoryMb === 2048 && spec.executable === "/usr/local/bin/osv-scanner"
    )
  )
    throw new LiveGuardError("not_configured");
  validateSandboxSpec({
    ...spec,
    memoryMb: 256,
    image: local
      ? "ghcr.io/wetscan-local/content-addressed@" + spec.image
      : spec.image,
  });
}
/** Arguments are server-reviewed spec, never source scripts, Dockerfiles, package hooks or client input. */
export function sandboxCreateArgs(
  spec: SandboxSpec,
  source: string,
  name: string,
  policy: (spec: SandboxSpec) => void = validateSandboxSpec,
  labels: Readonly<Record<string, string>> = {},
  deadline = Date.now() + spec.timeoutMs,
) {
  policy(spec);
  if (
    !isAbsolute(source) ||
    /[\r\n,\0]/.test(source) ||
    !/^wetscan-guard-[a-f0-9-]{36}$/.test(name) ||
    !Number.isFinite(deadline) ||
    deadline <= Date.now() ||
    deadline > Date.now() + spec.timeoutMs ||
    Object.entries(labels).some(
      ([k, v]) =>
        !["wetscan.run", "wetscan.job", "wetscan.spec"].includes(k) ||
        !/^[a-zA-Z0-9_-]{1,100}$/.test(v),
    )
  )
    throw new LiveGuardError("invalid_input", 400);
  return [
    "create",
    "--name",
    name,
    "--label",
    "wetscan.module=guard",
    ...Object.entries(labels).flatMap(([k, v]) => ["--label", `${k}=${v}`]),
    "--label",
    `wetscan.deadline=${deadline}`,
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
    private readonly extension?: {
      validate(spec: SandboxSpec): void;
      name: string;
      labels: Readonly<Record<string, string>>;
      deadline?: number;
      acceptedExitCodes?: readonly number[];
      completed?(
        output: string,
        state: { Running: boolean; ExitCode: number; OOMKilled: boolean },
      ): Promise<void>;
      reserve(): Promise<void>;
      inspect(metadata: unknown): Promise<void>;
      started?(configDirectory: string, signal: AbortSignal): Promise<void>;
      beforeRemove(configDirectory: string): Promise<void>;
      removed(configDirectory: string): Promise<void>;
    },
  ) {
    (extension?.validate ?? validateSandboxSpec)(spec);
    if (extension?.acceptedExitCodes?.some((code) => code !== 0 && code !== 1))
      throw new LiveGuardError("not_configured");
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
      !(this.extension && /^sha256:[a-f0-9]{64}$/.test(this.spec.image)
        ? this.spec.image === image.Id
        : pinnedImagePresent(this.spec.image, image.RepoDigests))
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
      name = this.extension?.name ?? `wetscan-guard-${randomUUID()}`;
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
      await this.extension?.reserve();
      created = true; // Name is owned before create; even a timed-out create may have created the container.
      await this.driver.call(
        sandboxCreateArgs(
          this.spec,
          actual,
          name,
          this.extension?.validate,
          this.extension?.labels,
          this.extension?.deadline,
        ),
        {
          configDirectory: config,
          timeoutMs: 5000,
          maxBytes: 32000,
        },
      );
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
          IpcMode: string;
          Tmpfs: Record<string, string>;
        };
        Mounts: {
          Type: string;
          Source: string;
          Destination: string;
          RW: boolean;
        }[];
      };
      const host = enforced.HostConfig;
      const binds = enforced.Mounts.filter((m) => m.Type === "bind");
      await this.extension?.inspect(enforced);
      if (
        enforced.Image !== imageId ||
        enforced.Config.User !== "65532:65532" ||
        host.Privileged ||
        !host.ReadonlyRootfs ||
        host.NetworkMode !== "none" ||
        host.IpcMode !== "none" ||
        host.Tmpfs?.["/tmp"] !== "rw,noexec,nosuid,nodev,size=16777216" ||
        host.Memory !== this.spec.memoryMb * 1024 * 1024 ||
        host.MemorySwap !== host.Memory ||
        host.PidsLimit !== 64 ||
        host.NanoCpus !== 1e9 ||
        !host.CapDrop.includes("ALL") ||
        !host.SecurityOpt.some((v) => v.startsWith("no-new-privileges")) ||
        binds.length !== 1 ||
        binds[0].Destination !== "/source" ||
        binds[0].RW ||
        !equalPath(binds[0].Source, actual) ||
        enforced.Mounts.some(
          (m) =>
            m.Type !== "bind" &&
            !(m.Type === "tmpfs" && m.Destination === "/tmp"),
        )
      )
        throw new LiveGuardError("execution_not_ready");
      const running = new AbortController();
      const runSignal = AbortSignal.any([signal, running.signal]);
      const attached = this.driver.call(["start", "--attach", name], {
        configDirectory: config,
        signal: runSignal,
        timeoutMs: this.spec.timeoutMs,
        maxBytes: this.spec.outputBytes,
        acceptedExitCodes: this.extension?.acceptedExitCodes,
      });
      let output: string;
      try {
        const results = await Promise.all([
          attached,
          this.extension?.started?.(config, runSignal),
        ]);
        output = results[0];
      } catch (error) {
        running.abort();
        await attached.catch(() => undefined);
        throw error;
      }
      const state = JSON.parse(
        await this.driver.call(
          ["inspect", "--format", "{{json .State}}", name],
          { configDirectory: config, timeoutMs: 5000, maxBytes: 16000 },
        ),
      ) as { Running: boolean; ExitCode: number; OOMKilled: boolean };
      if (
        state.Running ||
        !(this.extension?.acceptedExitCodes ?? [0]).includes(state.ExitCode) ||
        state.OOMKilled
      )
        throw new LiveGuardError("source_unavailable");
      await this.extension?.completed?.(output, state);
      return output;
    } finally {
      let failed = false;
      if (created)
        try {
          await this.extension?.beforeRemove(config);
          await this.driver.call(["rm", "--force", name], {
            configDirectory: config,
            timeoutMs: 5000,
            maxBytes: 32000,
          });
          await this.extension?.removed(config);
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

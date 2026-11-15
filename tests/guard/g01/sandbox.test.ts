import { expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import {
  DockerGuardSandbox,
  sandboxControls,
  sandboxCreateArgs,
  type DockerDriver,
  type SandboxSpec,
} from "../../../worker/guard/sandbox";
const spec: SandboxSpec = {
  docker:
    process.platform === "win32" ? "C:/tools/docker.exe" : "/usr/bin/docker",
  endpoint: "npipe:////./pipe/fixture-unit-only",
  image: "ghcr.io/fixture/guard@sha256:" + "a".repeat(64),
  executable: "/usr/local/bin/guard-g01-probe",
  args: ["/source"],
  cpu: 1,
  memoryMb: 256,
  pids: 64,
  timeoutMs: 1000,
  outputBytes: 64000,
};
function driver(unsafe = false) {
  let source = "fixture";
  return {
    call: vi.fn<DockerDriver["call"]>(async (args) => {
      if (args[0] === "create") {
        source = args
          .find((a) => a.startsWith("type=bind,"))!
          .split(",src=")[1]
          .split(",dst=")[0];
      }
      if (args[0] === "version")
        return JSON.stringify({ Os: "linux", Version: "fixture-only" });
      if (args[0] === "info")
        return JSON.stringify({
          ID: "unit-daemon",
          KernelVersion: "unit-kernel",
        });
      if (args[0] === "image")
        return JSON.stringify({
          Id: "sha256:" + "b".repeat(64),
          RepoDigests: [spec.image],
        });
      if (args[0] === "inspect" && args.includes("{{json .State}}"))
        return JSON.stringify({
          Running: false,
          ExitCode: 0,
          OOMKilled: false,
        });
      if (args[0] === "inspect")
        return JSON.stringify({
          Image: "sha256:" + "b".repeat(64),
          Config: { User: unsafe ? "0" : "65532:65532" },
          HostConfig: {
            Privileged: false,
            ReadonlyRootfs: true,
            NetworkMode: "none",
            Memory: 268435456,
            MemorySwap: 268435456,
            PidsLimit: 64,
            NanoCpus: 1e9,
            CapDrop: ["ALL"],
            SecurityOpt: ["no-new-privileges"],
          },
          Mounts: [{ Source: source, Destination: "/source", RW: false }],
        });
      return "fixture output";
    }),
  };
}
const proof = {
  verify: async () => ({
    expiresAt: Date.now() + 60000,
    verified: sandboxControls,
    artifactRef: "unit-double-not-real-isolation",
  }),
};
it("builds no-network non-root readonly bounded commands without privileged mounts/credentials", () => {
  const args = sandboxCreateArgs(
    spec,
    resolve("test-results"),
    "wetscan-guard-11111111-1111-1111-1111-111111111111",
  );
  expect(args).toContain("--network=none");
  expect(args).toContain("65532:65532");
  expect(args).toContain("--pull=never");
  expect(args).toContain("--cap-drop=ALL");
  expect(args.some((a) => a.includes("docker.sock"))).toBe(false);
  expect(args).not.toContain("--privileged");
  expect(args).not.toContain("--env-file");
  expect(args).not.toContain("--env");
});
it("is blocked by missing daemon/image/enforcement proof and never creates a container", async () => {
  const call = vi.fn(async () => {
      throw new Error("not a daemon");
    }),
    sandbox = new DockerGuardSandbox(spec, { call }, proof);
  expect((await sandbox.readiness()).status).toBe("BLOCKED");
  const d = driver(),
    noProof = new DockerGuardSandbox(spec, d, { verify: async () => null });
  await expect(
    noProof.execute(resolve("test-results"), new AbortController().signal),
  ).rejects.toThrow("execution_not_ready");
  expect(d.call.mock.calls.some(([args]) => args[0] === "create")).toBe(false);
});
it("rejects mutable images, client-like commands and unbounded limits", () => {
  for (const bad of [
    { ...spec, image: "ghcr.io/fixture/guard:latest" },
    { ...spec, cpu: 2 },
    { ...spec, args: ["bad\nargument"] },
    { ...spec, memoryMb: 0 },
  ])
    expect(
      () => new DockerGuardSandbox(bad as SandboxSpec, driver(), proof),
    ).toThrow();
});
it("validates actual container settings and force-cleans only its owned container on failure", async () => {
  const root = await mkdtemp(join(tmpdir(), "wetscan-g01-snapshot-"));
  try {
    const d = driver(true);
    await expect(
      new DockerGuardSandbox(spec, d, proof).execute(
        root,
        new AbortController().signal,
      ),
    ).rejects.toThrow();
    expect(d.call.mock.calls.some(([args]) => args[0] === "start")).toBe(false);
    expect(
      d.call.mock.calls.some(
        ([args]) =>
          args[0] === "rm" &&
          args[1] === "--force" &&
          args[2].startsWith("wetscan-guard-"),
      ),
    ).toBe(true);
  } finally {
    const path = resolve(root);
    if (
      dirname(path) !== resolve(tmpdir()) ||
      !basename(path).startsWith("wetscan-g01-snapshot-")
    )
      throw new Error("unsafe cleanup");
    await rm(path, { recursive: true, force: true });
  }
});
it("does not claim execution success if stop/cleanup fails", async () => {
  const root = await mkdtemp(join(tmpdir(), "wetscan-g01-snapshot-"));
  try {
    const d = driver();
    const original = d.call.getMockImplementation()!;
    d.call.mockImplementation(async (args, input) => {
      if (args[0] === "rm") throw new Error("synthetic cleanup fail");
      return original(args, input);
    });
    await expect(
      new DockerGuardSandbox(spec, d, proof).execute(
        root,
        new AbortController().signal,
      ),
    ).rejects.toThrow("cleanup_failed");
  } finally {
    const path = resolve(root);
    if (
      dirname(path) !== resolve(tmpdir()) ||
      !basename(path).startsWith("wetscan-g01-snapshot-")
    )
      throw new Error("unsafe cleanup");
    await rm(path, { recursive: true, force: true });
  }
});

it("reaps only expired Guard-owned containers and never a Sentinel-labelled container", async () => {
  const d = driver(),
    original = d.call.getMockImplementation()!;
  d.call.mockImplementation(async (args, input) => {
    if (args[0] === "ps") return "aaaaaaaaaaaa\nbbbbbbbbbbbb";
    if (args[0] === "inspect")
      return JSON.stringify({
        Name: "/wetscan-guard-11111111-1111-1111-1111-111111111111",
        Config: {
          Image: spec.image,
          Labels: {
            "wetscan.module":
              args.at(-1) === "aaaaaaaaaaaa" ? "guard" : "sentinel",
            "wetscan.deadline": "1",
          },
        },
      });
    return original(args, input);
  });
  expect(
    await new DockerGuardSandbox(
      spec,
      d,
      proof,
    ).cleanupExpiredOwnedContainers(),
  ).toBe(1);
  expect(
    d.call.mock.calls
      .filter(([args]) => args[0] === "rm")
      .map(([args]) => args.at(-1)),
  ).toEqual(["aaaaaaaaaaaa"]);
});

it("rejects ambient/remote daemon targets and already-cancelled work without driver calls", async () => {
  for (const endpoint of [
    "",
    "tcp://127.0.0.1:2375",
    "ssh://fixture",
    "default",
  ]) {
    expect(
      () => new DockerGuardSandbox({ ...spec, endpoint }, driver(), proof),
    ).toThrow();
  }
  const d = driver();
  await expect(
    new DockerGuardSandbox(spec, d, proof).execute(
      resolve("test-results"),
      AbortSignal.abort(),
    ),
  ).rejects.toThrow();
  expect(d.call).not.toHaveBeenCalled();
});
it("rejects an image identity mismatch even when the image label is correct", async () => {
  const root = await mkdtemp(join(tmpdir(), "wetscan-g01-snapshot-"));
  try {
    const d = driver(),
      original = d.call.getMockImplementation()!;
    d.call.mockImplementation(async (args, input) => {
      const result = await original(args, input);
      if (args[0] === "inspect" && args.includes("{{json .}}")) {
        return JSON.stringify({
          ...JSON.parse(result),
          Image: "sha256:" + "c".repeat(64),
        });
      }
      return result;
    });
    await expect(
      new DockerGuardSandbox(spec, d, proof).execute(
        root,
        new AbortController().signal,
      ),
    ).rejects.toThrow("execution_not_ready");
    expect(d.call.mock.calls.some(([a]) => a[0] === "start")).toBe(false);
  } finally {
    const target = resolve(root);
    if (
      dirname(target) !== resolve(tmpdir()) ||
      !basename(target).startsWith("wetscan-g01-snapshot-")
    )
      throw new Error("unsafe cleanup");
    await rm(target, { recursive: true, force: true });
  }
});

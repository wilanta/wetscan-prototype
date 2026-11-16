import { vi } from "vitest";
import type { DockerDriver, SandboxSpec } from "../../../worker/guard/sandbox";
import { LiveGuardError } from "../../../src/features/guard/live/model";
export function offlineDocker(image: string) {
  const entries = new Map<
    string,
    {
      Id: string;
      Name: string;
      Image: string;
      Config: Record<string, unknown>;
      HostConfig: Record<string, unknown>;
      Mounts: unknown[];
      State: {
        Running: boolean;
        ExitCode: number;
        OOMKilled: boolean;
        Status: string;
      };
    }
  >();
  let count = 0;
  const call = vi.fn<DockerDriver["call"]>(async (args, input) => {
    if (args[0] === "version")
      return JSON.stringify({ Os: "linux", Version: "unit-version" });
    if (args[0] === "info")
      return JSON.stringify({
        ID: "unit-daemon",
        KernelVersion: "unit-kernel",
      });
    if (args[0] === "image")
      return JSON.stringify({
        Id: "sha256:" + "d".repeat(64),
        RepoDigests: [image],
        Os: "linux",
        Architecture: "amd64",
      });
    if (args[0] === "create") {
      const get = (flag: string) => args[args.indexOf(flag) + 1],
        name = get("--name"),
        labels: Record<string, string> = {};
      args.forEach((a, i) => {
        if (a === "--label") {
          const text = args[i + 1],
            p = text.indexOf("=");
          labels[text.slice(0, p)] = text.slice(p + 1);
        }
      });
      const source = args
        .find((a) => a.startsWith("type=bind,"))!
        .split(",src=")[1]
        .split(",dst=")[0];
      entries.set(name, {
        Id: (++count).toString(16).padStart(64, "0"),
        Name: "/" + name,
        Image: "sha256:" + "d".repeat(64),
        Config: {
          Image: image,
          User: "65532:65532",
          Labels: labels,
          Entrypoint: [get("--entrypoint")],
          Cmd: args.slice(args.indexOf(image) + 1),
          Env: [],
        },
        HostConfig: {
          Privileged: false,
          ReadonlyRootfs: true,
          NetworkMode: "none",
          IpcMode: "none",
          Memory: 268435456,
          MemorySwap: 268435456,
          PidsLimit: 64,
          NanoCpus: 1e9,
          CapDrop: ["ALL"],
          CapAdd: null,
          SecurityOpt: ["no-new-privileges"],
          Tmpfs: { "/tmp": "rw,noexec,nosuid,nodev,size=16777216" },
          Binds: null,
          Devices: [],
        },
        Mounts: [
          { Source: source, Destination: "/source", Type: "bind", RW: false },
        ],
        State: {
          Running: false,
          ExitCode: 0,
          OOMKilled: false,
          Status: "created",
        },
      });
      return entries.get(name)!.Id;
    }
    if (args[0] === "inspect") {
      const v =
        entries.get(args.at(-1)!) ??
        [...entries.values()].find((v) => v.Id === args.at(-1));
      if (!v) throw new LiveGuardError("source_unavailable");
      return JSON.stringify(args.includes("{{json .State}}") ? v.State : v);
    }
    if (args[0] === "ps") {
      const f = args[args.indexOf("--filter") + 1];
      const list = [...entries.values()].filter((v) =>
        f.startsWith("id=")
          ? v.Id === f.slice(3)
          : v.Name === "/" + f.slice("name=^/".length, -1),
      );
      return list.map((v) => v.Id).join("\n");
    }
    if (args[0] === "rm") {
      const key = [...entries].find(
        ([name, v]) => name === args.at(-1) || v.Id === args.at(-1),
      )?.[0];
      if (!key) throw new LiveGuardError("source_unavailable");
      entries.delete(key);
      return "";
    }
    if (args[0] === "start") {
      const v = entries.get(args.at(-1)!)!;
      v.State = { ...v.State, Running: true, Status: "running" };
      if (!args.includes("--attach")) return "";
      const control = JSON.parse((v.Config.Cmd as string[]).at(-1)!);
      if (control.mode === "output") throw new LiveGuardError("source_limit");
      if (control.mode === "memory") {
        v.State = {
          Running: false,
          ExitCode: 137,
          OOMKilled: true,
          Status: "exited",
        };
        throw new LiveGuardError("source_unavailable");
      }
      if (control.mode === "hold")
        await new Promise<void>((done, fail) => {
          const end = setTimeout(
            () => fail(new LiveGuardError("source_unavailable")),
            input.timeoutMs,
          );
          const normal = setTimeout(done, control.holdMs);
          input.signal?.addEventListener(
            "abort",
            () => {
              clearTimeout(end);
              clearTimeout(normal);
              fail(new LiveGuardError("source_unavailable"));
            },
            { once: true },
          );
        });
      v.State = {
        Running: false,
        ExitCode: 0,
        OOMKilled: false,
        Status: "exited",
      };
      return "OFFLINE_DRIVER_REQUIRES_OUTPUT";
    }
    throw new LiveGuardError("invalid_input");
  });
  return {
    call,
    entries,
    createdCount: () => count,
    mutate: (
      name: string,
      change: (
        entry: typeof entries extends Map<string, infer T> ? T : never,
      ) => void,
    ) => change(entries.get(name)!),
  };
}
export function daemonFixture() {
  return {
    endpoint: "npipe:////./pipe/dockerDesktopLinuxEngine",
    id: "unit-daemon",
    version: "unit-version",
    kernel: "unit-kernel",
    imageId: "sha256:" + "d".repeat(64),
  };
}
export type OfflineSpec = SandboxSpec;

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fingerprint } from "../../../src/platform/identity";
import { LiveGuardError } from "../../../src/features/guard/live/model";
import type { AuthorizedSnapshot } from "../../../src/features/guard/contracts";
import type { SandboxSpec } from "../sandbox";
import { hash } from "./approval";
export const probeImage =
  "docker.io/library/python@sha256:d76f585fb0d5107dd47143da5e61554fd9cae656a30f3470f815cb8475769b6a";
export interface ProbeControl {
  mode: "manifest" | "controls" | "hold" | "output" | "memory";
  holdMs: number;
}
export async function probeProgram() {
  return (
    await readFile(resolve("worker/guard/acceptance/probe.py"), "utf8")
  ).replace(/\r\n/g, "\n");
}
export function probeArgs(program: string, control: ProbeControl): string[] {
  if (
    !["manifest", "controls", "hold", "output", "memory"].includes(
      control.mode,
    ) ||
    !Number.isInteger(control.holdMs) ||
    control.holdMs < 0 ||
    control.holdMs > 120000 ||
    Object.keys(control).sort().join() !== "holdMs,mode"
  )
    throw new LiveGuardError("invalid_input");
  const loader = `import sys,hashlib,json as j;c=''.join(sys.argv[1:-1]);hashlib.sha256(c.encode()).hexdigest()=='${hash(program)}'or sys.exit(3);CONTROL=j.loads(sys.argv[-1]);exec(compile(c,'<g01>','exec'))`;
  const chunks = program.match(/[\s\S]{1,220}/g) ?? [];
  const args = [
    "-I",
    "-B",
    "-c",
    loader,
    ...chunks.map((s) => Buffer.from(s).toString("base64")),
    JSON.stringify(control),
  ];
  // Base64 chunks keep argv free of newlines; decoding happens only in this fixed reviewed loader.
  args[3] = args[3].replace(
    "c=''.join(sys.argv[1:-1])",
    "import base64 as b;c=b''.join(map(b.b64decode,sys.argv[1:-1])).decode()",
  );
  if (
    args.length > 32 ||
    args.some((a) => a.length > 512 || /[\r\n\0]/.test(a))
  )
    throw new LiveGuardError("source_limit");
  return args;
}
export function makeProbeSpec(
  program: string,
  control: ProbeControl,
  timeoutMs = 5000,
): SandboxSpec {
  return {
    docker:
      "C:/Users/HP VICTUS/AppData/Local/Programs/DockerDesktop/resources/bin/docker.exe",
    endpoint: "npipe:////./pipe/dockerDesktopLinuxEngine",
    image: probeImage,
    executable: "/usr/local/bin/python3",
    args: probeArgs(program, control),
    cpu: 1,
    memoryMb: 256,
    pids: 64,
    timeoutMs,
    outputBytes: 65536,
  };
}
/** Default scanner sandbox validation is unchanged. Only this fixed program/argv can use Python. */
export function probePolicy(expected: SandboxSpec) {
  const digest = fingerprint(expected);
  return (actual: SandboxSpec) => {
    if (
      fingerprint(actual) !== digest ||
      actual.image !== probeImage ||
      actual.executable !== "/usr/local/bin/python3" ||
      actual.endpoint !== "npipe:////./pipe/dockerDesktopLinuxEngine" ||
      actual.cpu !== 1 ||
      actual.memoryMb !== 256 ||
      actual.pids !== 64 ||
      actual.timeoutMs < 100 ||
      actual.timeoutMs > 120000 ||
      actual.outputBytes !== 65536
    )
      throw new LiveGuardError("not_configured");
  };
}
export function expectedManifest(snapshot: AuthorizedSnapshot) {
  const entries = snapshot.files
    .map((f) => [f.path, f.sha256, f.size])
    .sort((a, b) =>
      Buffer.compare(Buffer.from(String(a[0])), Buffer.from(String(b[0]))),
    );
  return hash(JSON.stringify(entries));
}
export function verifyProbeOutput(
  output: string,
  snapshot: AuthorizedSnapshot,
) {
  const result = JSON.parse(output);
  if (
    result.version !== 1 ||
    result.manifest !== expectedManifest(snapshot) ||
    result.files !== snapshot.files.length ||
    result.bytes !== snapshot.files.reduce((n, f) => n + f.size, 0) ||
    !result.checks ||
    Object.values(result.checks).some((v) => v !== true) ||
    ![
      "non_root",
      "read_only_root",
      "read_only_source",
      "source_readable",
      "no_socket",
      "no_host_secrets",
    ].every((k) => result.checks[k] === true)
  )
    throw new LiveGuardError("source_integrity");
  return {
    manifest: result.manifest as string,
    files: result.files as number,
    bytes: result.bytes as number,
  };
}

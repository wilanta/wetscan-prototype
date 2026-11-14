/** Trusted synthetic verification only. NOT a customer-code sandbox or API worker. */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  lstat,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { safePath, GuardError } from "../../src/features/guard/security";
export const pin = {
  version: "1.33.1",
  sha256: "132e606e071bdd3928286fddc893198a6106a90820d46e21197e0ace1a23e0c1",
  url: "https://github.com/opengrep/opengrep/releases/download/v1.33.1/opengrep_windows_x86.exe",
  license: "LGPL-2.1",
  rulePack: "wetscan-synthetic-eval-v1",
} as const;
const fixtureRoot = resolve("tests/guard/fixtures/sast");
/** Validate every path component before reading. A real snapshot reader additionally enforces authorization. */
export async function readFixtureFile(
  root: string,
  input: string,
  maxBytes = 65536,
): Promise<Buffer> {
  const clean = safePath(input),
    absoluteRoot = await realpath(root);
  let path = absoluteRoot;
  for (const part of clean.split("/")) {
    path = join(path, part);
    if ((await lstat(path)).isSymbolicLink())
      throw new GuardError("forbidden", "Symlink in fixture snapshot.");
  }
  const resolved = await realpath(path),
    within = relative(absoluteRoot, resolved);
  if (
    within.startsWith(".." + sep) ||
    within === ".." ||
    resolve(absoluteRoot, within) !== resolved
  )
    throw new GuardError("forbidden", "Snapshot path escaped root.");
  const stat = await lstat(resolved);
  if (!stat.isFile() || stat.size > maxBytes)
    throw new GuardError("invalid_input", "Fixture size/type limit exceeded.");
  const contents = await readFile(resolved);
  if (contents.length > maxBytes || contents.includes(0))
    throw new GuardError("invalid_input", "Binary fixture excluded.");
  return contents;
}
export interface FixtureExecution {
  output: unknown;
  binarySha256: string;
  ruleSha256: string;
  targetSha256: string;
  durationMs: number;
  exitCode: number;
  scannerVersion: string;
}
export async function runOpengrepFixture(
  target: "vulnerable.js" | "fixed.js",
  signal?: AbortSignal,
): Promise<FixtureExecution> {
  if (process.platform !== "win32")
    throw new GuardError(
      "not_configured",
      "This verification pin is Windows-only.",
    );
  if (!["vulnerable.js", "fixed.js"].includes(target))
    throw new GuardError(
      "forbidden",
      "Only reviewed fixture targets are permitted.",
    );
  const executable = join(
    tmpdir(),
    "wetscan-guard-tools-v1.33.1",
    "opengrep.exe",
  );
  const binaryHash = createHash("sha256")
    .update(await readFile(executable))
    .digest("hex");
  if (binaryHash !== pin.sha256)
    throw new GuardError("forbidden", "Pinned scanner checksum mismatch.");
  const targetBytes = await readFixtureFile(fixtureRoot, target),
    ruleBytes = await readFixtureFile(fixtureRoot, "rules.yml");
  const working = await mkdtemp(join(tmpdir(), "wetscan-guard-sast-"));
  try {
    await writeFile(join(working, target), targetBytes);
    await writeFile(join(working, "rules.yml"), ruleBytes);
    const started = performance.now();
    const { output, exitCode } = await new Promise<{
      output: string;
      exitCode: number;
    }>((resolveRun, reject) => {
      let bytes = 0,
        out = "",
        settled = false;
      const child = spawn(
        executable,
        [
          "scan",
          "--jobs",
          "1",
          "--max-memory",
          "256",
          "--timeout",
          "5",
          "--json",
          "--config",
          "rules.yml",
          "--disable-version-check",
          "--no-git-ignore",
          target,
        ],
        {
          cwd: working,
          shell: false,
          windowsHide: true,
          signal,
          env: {
            NODE_ENV: "test",
            NUMBER_OF_PROCESSORS: "1",
            SystemDrive: "C:",
            ComSpec: join(
              process.env.SystemRoot ?? "C:/Windows",
              "System32",
              "cmd.exe",
            ),
            LOCALAPPDATA: working,
            APPDATA: working,
            SystemRoot: process.env.SystemRoot,
            WINDIR: process.env.WINDIR,
            TEMP: working,
            TMP: working,
            HOME: working,
            PATH:
              dirname(executable) +
              ";" +
              join(process.env.SystemRoot ?? "C:/Windows", "System32"),
            OPENGREP_ENABLE_VERSION_CHECK: "0",
            SEMGREP_SEND_METRICS: "off",
            OPENGREP_SEND_METRICS: "off",
            SEMGREP_ENABLE_VERSION_CHECK: "0",
          },
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      const fail = (error: Error) => {
        if (settled) return;
        settled = true;
        child.kill();
        clearTimeout(timer);
        reject(error);
      };
      const timer = setTimeout(
        () => fail(new Error("Trusted fixture scanner timed out.")),
        60000,
      );
      child.stdout.on("data", (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > 2 * 1024 * 1024)
          fail(new Error("Scanner output limit exceeded."));
        else out += chunk.toString("utf8");
      });
      child.stderr.on("data", (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > 2 * 1024 * 1024)
          fail(new Error("Scanner output limit exceeded."));
      });
      child.once("error", () =>
        fail(new Error("Trusted fixture scanner process failed.")),
      );
      child.once("close", (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (code !== 0 && code !== 1)
          reject(
            new Error(
              "Trusted fixture scanner returned non-success status: " + code,
            ),
          );
        else resolveRun({ output: out, exitCode: code });
      });
    });
    return {
      output: JSON.parse(output) as unknown,
      binarySha256: binaryHash,
      ruleSha256: createHash("sha256").update(ruleBytes).digest("hex"),
      targetSha256: createHash("sha256").update(targetBytes).digest("hex"),
      durationMs: Math.round(performance.now() - started),
      exitCode,
      scannerVersion: pin.version,
    };
  } finally {
    const location = resolve(working);
    if (
      dirname(location) !== resolve(tmpdir()) ||
      !basename(location).startsWith("wetscan-guard-sast-")
    )
      throw new Error("Unsafe fixture cleanup.");
    await rm(location, { recursive: true, force: true });
  }
}

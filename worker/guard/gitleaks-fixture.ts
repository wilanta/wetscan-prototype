/** Trusted fixtures only; no customer paths, git history or host credential inheritance. */
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { readFixtureFile } from "./fixture-runner";
import { GuardError } from "../../src/features/guard/security";
export const gitleaksPin = {
  version: "8.30.1",
  archiveSha256:
    "d29144deff3a68aa93ced33dddf84b7fdc26070add4aa0f4513094c8332afc4e",
  binarySha256:
    "17157e2ee8b76fc8b1d8bee607a250e34b8a8023c8bc81822d4b5ee4d78fcb7c",
  url: "https://github.com/gitleaks/gitleaks/releases/download/v8.30.1/gitleaks_8.30.1_windows_x64.zip",
  license: "MIT",
  rulePack: "wetscan-synthetic-credential-v1",
} as const;
export async function runGitleaksFixture(
  target: "exposed.js" | "clean.js",
  signal?: AbortSignal,
) {
  if (
    process.platform !== "win32" ||
    !["exposed.js", "clean.js"].includes(target)
  )
    throw new GuardError(
      "not_configured",
      "Only pinned Windows synthetic fixtures are permitted.",
    );
  const executable = join(
    tmpdir(),
    "wetscan-guard-tools-gitleaks-8.30.1",
    "gitleaks.exe",
  );
  if (
    createHash("sha256")
      .update(await readFile(executable))
      .digest("hex") !== gitleaksPin.binarySha256
  )
    throw new GuardError("forbidden", "Gitleaks checksum mismatch.");
  const fixture = resolve("tests/guard/fixtures/gitleaks"),
    source = await readFixtureFile(fixture, target),
    rules = await readFixtureFile(fixture, "rules.toml");
  const working = await mkdtemp(join(tmpdir(), "wetscan-guard-gitleaks-"));
  try {
    await writeFile(join(working, target), source);
    await writeFile(join(working, "rules.toml"), rules);
    const started = performance.now();
    const exitCode = await new Promise<number>((resolveRun, reject) => {
      execFile(
        executable,
        [
          "dir",
          target,
          "--config",
          "rules.toml",
          "--redact=100",
          "--report-format",
          "json",
          "--report-path",
          "report.json",
          "--no-banner",
        ],
        {
          cwd: working,
          shell: false,
          windowsHide: true,
          signal,
          timeout: 30000,
          maxBuffer: 1024 * 1024,
          env: {
            NODE_ENV: "test",
            SystemRoot: process.env.SystemRoot,
            WINDIR: process.env.WINDIR,
            TEMP: working,
            TMP: working,
            HOME: working,
            APPDATA: working,
            LOCALAPPDATA: working,
          },
        },
        (error) => {
          if (!error) resolveRun(0);
          else if (error.code === 1) resolveRun(1);
          else
            reject(
              new Error(
                "Trusted Gitleaks fixture failed, timed out or was cancelled.",
              ),
            );
        },
      );
    });
    const bytes = await readFile(join(working, "report.json"));
    if (bytes.length > 1024 * 1024)
      throw new Error("Gitleaks report limit exceeded.");
    return {
      output: JSON.parse(bytes.toString("utf8")) as unknown,
      exitCode,
      durationMs: Math.round(performance.now() - started),
      artifactDigest: createHash("sha256").update(bytes).digest("hex"),
      targetSha256: createHash("sha256").update(source).digest("hex"),
      ruleSha256: createHash("sha256").update(rules).digest("hex"),
    };
  } finally {
    const location = resolve(working);
    if (
      dirname(location) !== resolve(tmpdir()) ||
      !basename(location).startsWith("wetscan-guard-gitleaks-")
    )
      throw new Error("Unsafe Gitleaks fixture cleanup.");
    await rm(location, { recursive: true, force: true });
  }
}

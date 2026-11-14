/** Additional trusted-fixture verification only. Not a production sandbox. */
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { readFixtureFile } from "./fixture-runner";
import { array, GuardError, record } from "../../src/features/guard/security";
export const additionalPins = {
  osv: {
    version: "2.7.1",
    binarySha256:
      "7121dcf420aefbbf89a7f0050c4d3094e079ff93afd334dfc96f16b02ec85800",
    url: "https://github.com/google/osv-scanner/releases/download/v2.7.1/osv-scanner_windows_amd64.exe",
    license: "Apache-2.0",
    folder: "wetscan-guard-tools-osv-2.7.1",
    filename: "osv-scanner.exe",
  },
  trivy: {
    version: "0.76.2",
    binarySha256:
      "dd07adf881a72b54d1a922191d62fa939938df2155be85a727da93b67b24e617",
    archiveSha256:
      "691f737a7e5566a673c3a74dab9160552ec32101e953b659e5c77443d16dddb6",
    url: "https://github.com/aquasecurity/trivy/releases/download/v0.76.2/trivy_0.76.2_windows-64bit.zip",
    license: "Apache-2.0",
    folder: "wetscan-guard-tools-trivy-0.76.2",
    filename: "trivy.exe",
  },
} as const;
export async function runAdditionalFixture(
  tool: keyof typeof additionalPins,
  variant: "vulnerable" | "fixed",
) {
  if (
    process.platform !== "win32" ||
    !["osv", "trivy"].includes(tool) ||
    !["vulnerable", "fixed"].includes(variant)
  )
    throw new GuardError("forbidden", "Reviewed Windows fixtures only.");
  const pin = additionalPins[tool],
    executable = join(tmpdir(), pin.folder, pin.filename);
  if (
    createHash("sha256")
      .update(await readFile(executable))
      .digest("hex") !== pin.binarySha256
  )
    throw new GuardError("forbidden", "Scanner binary checksum mismatch.");
  const filename = tool === "osv" ? "package-lock.json" : "main.tf";
  const bytes = await readFixtureFile(
    resolve("tests/guard/fixtures", tool),
    `${variant}/${filename}`,
  );
  const working = await mkdtemp(join(tmpdir(), "wetscan-guard-additional-"));
  try {
    await writeFile(join(working, filename), bytes);
    const args =
      tool === "osv"
        ? [
            "scan",
            "source",
            "--lockfile",
            filename,
            "--format",
            "json",
            "--output-file",
            "report.json",
            "--all-packages",
            "--no-resolve",
            "--no-call-analysis",
            "all",
          ]
        : [
            "config",
            "--format",
            "json",
            "--output",
            "report.json",
            "--skip-check-update",
            "--timeout",
            "30s",
            "--cache-dir",
            join(working, "cache"),
            filename,
          ];
    const start = performance.now();
    const exitCode = await new Promise<number>((resolveRun, reject) => {
      execFile(
        executable,
        args,
        {
          cwd: working,
          shell: false,
          windowsHide: true,
          timeout: 60000,
          maxBuffer: 2 * 1024 * 1024,
          env: {
            NODE_ENV: "test",
            SystemRoot: process.env.SystemRoot,
            WINDIR: process.env.WINDIR,
            TEMP: working,
            TMP: working,
            HOME: working,
            LOCALAPPDATA: working,
            APPDATA: working,
          },
        },
        (error) => {
          if (!error) resolveRun(0);
          else if (error.code === 1 && tool === "osv") resolveRun(1);
          else
            reject(
              new Error(
                `${tool} controlled fixture failed, timed out or could not query approved advisory data.`,
              ),
            );
        },
      );
    });
    const artifact = await readFile(join(working, "report.json"));
    if (artifact.length > 2 * 1024 * 1024)
      throw new Error("Scanner report exceeds fixture bound.");
    const output: unknown = JSON.parse(artifact.toString("utf8"));
    // OSV emits absolute source paths. Convert only an exact match to this known fixture.
    if (tool === "osv")
      for (const item of array(record(output).results)) {
        const source = record(record(item).source);
        if (
          typeof source.path !== "string" ||
          resolve(working, source.path) !== join(working, filename)
        )
          throw new GuardError(
            "forbidden",
            "OSV source is outside the reviewed fixture.",
          );
        source.path = filename;
      }
    if (tool === "trivy")
      for (const value of array(record(output).Results)) {
        const row = record(value);
        const label =
          typeof row.Target === "string"
            ? row.Target.replace(/ \(terraform\)$/, "")
            : "";
        if (![".", filename, working, join(working, filename)].includes(label))
          throw new GuardError(
            "forbidden",
            "Trivy target is outside the single-file reviewed fixture.",
          );
        row.Target = filename;
      }
    return {
      output,
      exitCode,
      durationMs: Math.round(performance.now() - start),
      artifactDigest: createHash("sha256").update(artifact).digest("hex"),
      targetSha256: createHash("sha256").update(bytes).digest("hex"),
      provenance:
        tool === "osv"
          ? "Actual official OSV advisory query for a synthetic lockfile; no package installation, resolution or call analysis"
          : "Embedded Trivy checks from checksum-pinned binary; policy update disabled; no Terraform execution",
    };
  } finally {
    const path = resolve(working);
    if (
      dirname(path) !== resolve(tmpdir()) ||
      !basename(path).startsWith("wetscan-guard-additional-")
    )
      throw new Error("Unsafe scanner fixture cleanup.");
    await rm(path, { recursive: true, force: true });
  }
}

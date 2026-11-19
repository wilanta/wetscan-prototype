import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

/**
 * S11 repository secret scan. Scans every git-tracked text file (or the files given as arguments) for
 * high-confidence credential shapes and for tracked dotenv files that are not `*.example`.
 *
 * Completeness is part of the result: a file that cannot be inspected (unreadable, missing, larger than the hard cap)
 * is reported as `incomplete` and fails the run, long lines are scanned in overlapping windows instead of skipped, and
 * binary files are counted, never silently ignored. Findings print file, line and rule only, NEVER the matched value
 * or any hash of it, so the output is safe to retain as a CI artifact.
 */
export interface Finding {
  file: string;
  line: number;
  rule: string;
}
export interface Incomplete {
  file: string;
  reason: "unreadable" | "too_large";
}
export interface ScanReport {
  findings: Finding[];
  incomplete: Incomplete[];
  scanned: number;
  skippedBinary: number;
  ok: boolean;
}
const RULES: [string, RegExp][] = [
  ["private-key-block", /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/g],
  [
    "github-token",
    /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{50,})\b/g,
  ],
  ["aws-access-key-id", /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g],
  ["slack-token", /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g],
  ["telegram-bot-token", /\b\d{8,10}:[A-Za-z0-9_-]{35}\b/g],
  ["resend-api-key", /\bre_[A-Za-z0-9]{24,}\b/g],
  ["anthropic-or-openai-key", /\bsk-(?:ant-)?[A-Za-z0-9_-]{32,}\b/g],
  ["google-api-key", /\bAIza[0-9A-Za-z_-]{35}\b/g],
  [
    "database-url-with-password",
    /\bpostgres(?:ql)?:\/\/[^\s:/@'"`]+:(?!\$|<|\*|%|\{|password|changeme|xxx|pw\b)[^\s@'"`]{6,}@(?!localhost|127\.0\.0\.1|\[::1\])[A-Za-z0-9.-]+/gi,
  ],
];
/**
 * Reviewed synthetic fixtures. An entry allows ONE exact line of ONE file: `sha256` is the SHA-256 of that line with
 * surrounding whitespace trimmed (`printf %s '<trimmed line>' | sha256sum`). Editing the line, adding another
 * credential-shaped line to the same file, or copying the line to another file produces a finding, so a real key can
 * never ride in on an existing exception. Reviewed 2026-11-19 (S11 post-merge F4); all values are fake test canaries.
 */
export const ALLOW: {
  file: string;
  rule: string;
  sha256: string;
  reason: string;
}[] = [
  {
    file: "tests/canvas/github-reader.test.ts",
    rule: "database-url-with-password",
    sha256: "10729c88f1aaafdd2365eb7a12acc2e3e11eceee240b0b49c42114e635916db5",
    reason: "fake URL proving error redaction",
  },
  {
    file: "tests/sentinel/telemetry-http.test.ts",
    rule: "database-url-with-password",
    sha256: "586359d4f3bde12ce4ad36b6060cd29b494c2afd91b29841a56c9ea8e5147ff9",
    reason: "fake URL proving error redaction",
  },
  {
    file: "tests/github-app-key.test.ts",
    rule: "private-key-block",
    sha256: "d620e58a8c69fcfe7af431811e46d016550d5b572bfbe18900b95f78a7b046c5",
    reason: "header-only fake key for PEM parsing tests",
  },
  {
    file: "tests/github-app-key.test.ts",
    rule: "private-key-block",
    sha256: "e05b6b29f46265b2776a0ddfd46de047bea59bffb5969ee999ef7fb4f05456a4",
    reason: "header-only fake key for PEM parsing tests",
  },
  {
    file: "tests/github-app-key.test.ts",
    rule: "private-key-block",
    sha256: "64ce5051ee524368228cc473ef7cb23cd30c1a63f90a635bf4365b6f1e393eca",
    reason: "header-only fake key for PEM parsing tests",
  },
  {
    file: "tests/github-app-key.test.ts",
    rule: "private-key-block",
    sha256: "74e594f77f5eb6319b0dbe4d0b4ce8f79762cbcf6eaf7f6e26da8e50cd7a0ce4",
    reason: "header-only fake key for PEM parsing tests",
  },
  {
    file: "tests/guard/core.test.ts",
    rule: "private-key-block",
    sha256: "9e5693d5f7b69e3d366ea60e10521bbfa2a336c1d70c134f9ae2e3bde1284274",
    reason: "synthetic key canary for redaction",
  },
  {
    file: "tests/sentinel/notification-model.test.ts",
    rule: "github-token",
    sha256: "26c08fc80e381fc3bfb85069dfd5ff2c052ffcda6c2ab83365b8e3f4d7191da6",
    reason: "fake token canary for redaction",
  },
];
const MAX_BYTES = 64 * 1024 * 1024; // hard cap; above it the run is reported incomplete, never skipped
const WINDOW = 4096;
const OVERLAP = 512; // longer than any single credential shape above
const BINARY_EXT =
  /\.(png|jpe?g|gif|webp|ico|woff2?|ttf|otf|pdf|zip|gz|tgz|7z|mp4|mov|dump)$/i;
const DOTENV = /(^|\/)\.env(\.|$)/;
const sha256 = (value: string) =>
  createHash("sha256").update(value).digest("hex");

export function scanText(
  file: string,
  text: string,
  allow: typeof ALLOW = ALLOW,
): Finding[] {
  const out: Finding[] = [];
  const seen = new Set<string>();
  text.split(/\r?\n/).forEach((line, i) => {
    const lineHash = sha256(line.trim());
    // Long lines are scanned in overlapping windows, so a token past character 4000 is still found.
    for (let at = 0; ; at += WINDOW - OVERLAP) {
      const chunk = line.slice(at, at + WINDOW);
      for (const [rule, re] of RULES) {
        if (!chunk.match(new RegExp(re.source, re.flags.replace("g", ""))))
          continue;
        const key = `${i}:${rule}`;
        if (seen.has(key)) continue;
        if (
          allow.some(
            (a) => a.file === file && a.rule === rule && a.sha256 === lineHash,
          )
        )
          continue;
        seen.add(key);
        out.push({ file, line: i + 1, rule });
      }
      if (at + WINDOW >= line.length) break;
    }
  });
  return out;
}

export interface ScanOptions {
  maxBytes?: number;
  read?: (file: string) => Buffer;
  allow?: typeof ALLOW;
}
export function scanFiles(
  files: string[],
  options: ScanOptions = {},
): ScanReport {
  const { maxBytes = MAX_BYTES, read = readFileSync, allow = ALLOW } = options;
  const findings: Finding[] = [];
  const incomplete: Incomplete[] = [];
  let scanned = 0;
  let skippedBinary = 0;
  for (const file of files) {
    if (DOTENV.test(file) && !/\.example$/.test(file))
      findings.push({ file, line: 0, rule: "tracked-dotenv-file" });
    if (BINARY_EXT.test(file)) {
      skippedBinary++;
      continue;
    }
    let data: Buffer;
    try {
      data = read(file);
    } catch {
      incomplete.push({ file, reason: "unreadable" });
      continue;
    }
    if (data.length > maxBytes) {
      incomplete.push({ file, reason: "too_large" });
      continue;
    }
    if (data.subarray(0, 8192).includes(0)) {
      skippedBinary++;
      continue;
    }
    scanned++;
    findings.push(...scanText(file, data.toString("utf8"), allow));
  }
  return {
    findings,
    incomplete,
    scanned,
    skippedBinary,
    ok: !findings.length && !incomplete.length,
  };
}

if (process.argv[1]?.endsWith("sentinel-secret-scan.ts")) {
  const args = process.argv.slice(2);
  const files = args.length
    ? args
    : execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
        .split("\0")
        .filter(Boolean);
  const report = scanFiles(files);
  for (const f of report.findings) console.log(`${f.file}:${f.line} ${f.rule}`);
  for (const i of report.incomplete)
    console.log(`${i.file} INCOMPLETE ${i.reason}`);
  console.log(
    `secret-scan: ${files.length} files, ${report.scanned} scanned, ${report.skippedBinary} binary skipped, ` +
      `${report.findings.length} finding(s), ${report.incomplete.length} incomplete${report.ok ? "" : " - FAILED"}`,
  );
  process.exit(report.ok ? 0 : 1);
}

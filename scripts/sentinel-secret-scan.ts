import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";

/**
 * S11 repository secret scan. Scans every git-tracked text file (or the files given as arguments) for
 * high-confidence credential shapes and for tracked dotenv files that are not `*.example`. Findings print the
 * file, line and rule only, NEVER the matched value, so the scan output itself is safe to retain as a CI artifact.
 */
export interface Finding {
  file: string;
  line: number;
  rule: string;
}
const RULES: [string, RegExp][] = [
  ["private-key-block", /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/],
  [
    "github-token",
    /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{50,})\b/,
  ],
  ["aws-access-key-id", /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/],
  ["slack-token", /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/],
  ["telegram-bot-token", /\b\d{8,10}:[A-Za-z0-9_-]{35}\b/],
  ["resend-api-key", /\bre_[A-Za-z0-9]{24,}\b/],
  ["anthropic-or-openai-key", /\bsk-(?:ant-)?[A-Za-z0-9_-]{32,}\b/],
  ["google-api-key", /\bAIza[0-9A-Za-z_-]{35}\b/],
  [
    "database-url-with-password",
    /\bpostgres(?:ql)?:\/\/[^\s:/@'"`]+:(?!\$|<|\*|%|\{|password|changeme|xxx|pw\b)[^\s@'"`]{6,}@(?!localhost|127\.0\.0\.1|\[::1\])[A-Za-z0-9.-]+/i,
  ],
];
/** Reviewed synthetic fixtures (S11, 2026-11-19): fake values that exist to prove redaction/validation. Exact file+rule only. */
export const ALLOW: { file: string; rule: string; reason: string }[] = [
  [
    "tests/canvas/github-reader.test.ts",
    "database-url-with-password",
    "fake URL proving error redaction",
  ],
  [
    "tests/sentinel/telemetry-http.test.ts",
    "database-url-with-password",
    "fake URL proving error redaction",
  ],
  [
    "tests/github-app-key.test.ts",
    "private-key-block",
    "header-only fake key for PEM parsing tests",
  ],
  [
    "tests/guard/core.test.ts",
    "private-key-block",
    "synthetic key canary for redaction",
  ],
  [
    "tests/sentinel/notification-model.test.ts",
    "github-token",
    "fake token canary for redaction",
  ],
].map(([file, rule, reason]) => ({ file, rule, reason }));
const SKIP =
  /\.(png|jpe?g|gif|webp|ico|woff2?|pdf|zip|gz|lock)$|package-lock\.json$/i;
const DOTENV = /(^|\/)\.env(\.|$)/;

export function scanText(file: string, text: string): Finding[] {
  const out: Finding[] = [];
  text.split(/\r?\n/).forEach((line, i) => {
    if (line.length > 4000) return; // minified bundles are not hand-written secrets
    for (const [rule, re] of RULES)
      if (re.test(line)) out.push({ file, line: i + 1, rule });
  });
  return out;
}
export function scanFiles(files: string[]): Finding[] {
  const out: Finding[] = [];
  const allowed = (f: Finding) =>
    ALLOW.some((a) => a.file === f.file && a.rule === f.rule);
  for (const file of files) {
    if (DOTENV.test(file) && !/\.example$/.test(file))
      out.push({ file, line: 0, rule: "tracked-dotenv-file" });
    if (SKIP.test(file)) continue;
    try {
      if (statSync(file).size > 2_000_000) continue;
      out.push(
        ...scanText(file, readFileSync(file, "utf8")).filter(
          (f) => !allowed(f),
        ),
      );
    } catch {
      /* deleted or unreadable path: nothing to scan */
    }
  }
  return out;
}

if (process.argv[1]?.endsWith("sentinel-secret-scan.ts")) {
  const args = process.argv.slice(2);
  const files = args.length
    ? args
    : execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
        .split("\0")
        .filter(Boolean);
  const findings = scanFiles(files);
  for (const f of findings) console.log(`${f.file}:${f.line} ${f.rule}`);
  console.log(
    `secret-scan: ${files.length} files, ${findings.length} finding(s)`,
  );
  process.exit(findings.length ? 1 : 0);
}

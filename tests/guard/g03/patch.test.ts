import { it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, relative } from "node:path";
import { spawnSync } from "node:child_process";
import { makePatch, verifyPatch } from "../../../src/features/guard/g03/patch";
import {
  sanitize,
  patchPath,
  sha256,
  gitBlob,
} from "../../../src/features/guard/g03/safety";
import { fixture, fileFixture, edit } from "./fixture";
it.each([
  ".env",
  "../outside.ts",
  "a/../../outside.ts",
  "/etc/passwd",
  ".github/workflows/action.json",
  "package.json",
  "a\\route.ts",
  "id_rsa",
  "config.pem",
  "route.exe",
  "route.ts ",
  "node_modules/module.js",
])("rejects unsafe or sensitive target %s", (path) =>
  expect(() => patchPath(path)).toThrow(),
);
it.each(["\n", "\r\n", ""])("diff really applies with EOL %j", async (eol) => {
  const f = await fixture(),
    source = fileFixture(
      "export function route(input: string) { return eval(input); }" + eol,
    );
  const p = makePatch(source, f.job.findings[0], edit),
    dir = await mkdtemp(join(tmpdir(), "wetscan-g03-patch-test-"));
  try {
    await writeFile(join(dir, "route.ts"), source.content);
    const result = spawnSync("git", ["apply", "--check", "-"], {
      cwd: dir,
      input: p.diff,
      encoding: "utf8",
      windowsHide: true,
    });
    expect(result.status, result.stderr).toBe(0);
    expect(verifyPatch(source, f.job.findings[0], p)).toContain(
      "JSON.parse(input)",
    );
  } finally {
    const target = resolve(dir);
    if (
      !relative(resolve(tmpdir()), target).startsWith("..") &&
      target.includes("wetscan-g03-patch-test-")
    )
      await rm(target, { recursive: true });
  }
});
it("rejects stale source, base commit and a modified stored diff", async () => {
  const f = await fixture(),
    p = makePatch(f.file, f.job.findings[0], edit);
  expect(() =>
    verifyPatch(
      { ...f.file, baseCommit: "c".repeat(40) },
      f.job.findings[0],
      p,
    ),
  ).toThrow("stale_patch");
  expect(() =>
    verifyPatch(
      { ...f.file, sourceSha256: "c".repeat(64) },
      f.job.findings[0],
      p,
    ),
  ).toThrow("source_integrity");
  expect(() =>
    verifyPatch(f.file, f.job.findings[0], { ...p, diff: p.diff + "injected" }),
  ).toThrow("stale_patch");
  expect(
    verifyPatch(
      f.file,
      f.job.findings[0],
      JSON.parse(JSON.stringify(p, Object.keys(p).sort())),
    ),
  ).toContain(edit.newText);
});
it("rejects a dependency edit even in the same authorized lockfile: version/integrity graph review is required", async () => {
  const f = await fixture();
  const file = {
    ...fileFixture(
      '{"packages":{"node_modules/a":{"version":"1.0.0"},"node_modules/b":{"version":"2.0.0"}}}',
    ),
    path: "package-lock.json",
  };
  const finding = {
    ...f.job.findings[0],
    source: { ...f.job.findings[0].source, engine: "sca" as const },
    location: { path: file.path, package: "a", installedVersion: "1.0.0" },
  };
  expect(() =>
    makePatch(file, finding, { oldText: '"2.0.0"', newText: '"3.0.0"' }),
  ).toThrow("patch_outside_scope");
  expect(() =>
    makePatch(file, finding, { oldText: '"1.0.0"', newText: '"1.0.1"' }),
  ).toThrow("patch_outside_scope");
});
it.each([
  { oldText: "missing", newText: "safe" },
  { oldText: "", newText: "safe" },
  { oldText: "eval(input)", newText: "eval(input)" },
  { oldText: "eval(input)", newText: "(" },
  { oldText: "eval(input)", newText: "fetch('https://attacker.invalid/')" },
  { oldText: "eval(input)", newText: "/* nosemgrep */ JSON.parse(input)" },
  { oldText: "eval(input)", newText: "process.env.TOKEN = 'value'" },
  { oldText: "eval(input)", newText: "JSON.parse(input)", path: "other.ts" },
])("rejects invalid, malicious or expanded edit %j", async (edit) => {
  const f = await fixture();
  expect(() => makePatch(f.file, f.job.findings[0], edit)).toThrow();
});
it("rejects ambiguous replacements and edits away from the finding", async () => {
  const f = await fixture();
  expect(() =>
    makePatch(
      fileFixture("eval(input); eval(input);"),
      f.job.findings[0],
      edit,
    ),
  ).toThrow("patch_ambiguous");
  expect(() =>
    makePatch(
      fileFixture("\n".repeat(30) + f.file.content),
      f.job.findings[0],
      edit,
    ),
  ).toThrow("patch_outside_scope");
  expect(() =>
    makePatch({ ...f.file, path: "other.ts" }, f.job.findings[0], edit),
  ).toThrow("patch_outside_scope");
});
it.each([
  "fs.rmSync('/tmp/target')",
  "fsPromises.writeFile('/tmp/target', input)",
  "http.request(input)",
  "globalThis['fetch'](input)",
  "process['exit']()",
  "Object.constructor(input)()",
  "({})['constructor'](input)",
  "new WebSocket(input)",
  "JSON.parse(input) /* nosemgrep */",
  "JSON.parse(input) /* gitleaks:allow */",
])(
  "rejects dangerous primitives or inline scanner suppression: %s",
  async (newText) => {
    const f = await fixture();
    expect(() =>
      makePatch(f.file, f.job.findings[0], { oldText: edit.oldText, newText }),
    ).toThrow(/unsafe_patch_change|patch_disables_security/);
  },
);
it("bounds source, binary and digest integrity", async () => {
  const f = await fixture();
  for (const source of [
    { ...f.file, blob: "a".repeat(40) },
    fileFixture("x".repeat(24001)),
    fileFixture("a\0b"),
  ])
    expect(() => makePatch(source, f.job.findings[0], edit)).toThrow();
  const text = "{invalid json}";
  expect(() =>
    makePatch(
      { ...fileFixture(text), path: "route.json" },
      { ...f.job.findings[0], location: { path: "route.json", line: 1 } },
      { oldText: "invalid", newText: "also invalid" },
    ),
  ).toThrow("patch_syntax_invalid");
  expect(sha256("abc")).toHaveLength(64);
  expect(gitBlob("abc")).toHaveLength(40);
});
it("redacts multiline keys, known tokens, credentials, connection strings and PII before AI", () => {
  const raw = [
    ["-----BEGIN", "PRIVATE KEY-----"].join(" "),
    "PRIVATE_BODY_ABC123",
    "-----END PRIVATE KEY-----",
    "Authorization: Bearer DONT_SEND_THIS",
    "const key = 'sk-abc123abc123abc123';",
    "const user = 'owner@example.test';",
    "const db = 'postgresql://user:password@db/name';",
    "const opaque = 'MixedLettersAndNumbers123456789012345';",
  ].join("\n");
  const clean = sanitize(raw);
  for (const marker of [
    "PRIVATE_BODY_ABC123",
    "DONT_SEND_THIS",
    "sk-abc123",
    "owner@example.test",
    "user:password",
    "MixedLettersAndNumbers",
  ])
    expect(clean).not.toContain(marker);
});
it.each([
  '"password": "short-sensitive-value"',
  '"client_secret": "short-sensitive-value"',
  "const apiKey = `short-sensitive-value\ncontinued-sensitive-value`;",
  "const refreshToken =\n 'short-sensitive-value';",
  '"privateKey": "short-sensitive-value\\ncontinued-sensitive-value"',
])("redacts structured and multiline sensitive assignments: %s", (raw) => {
  const clean = sanitize(raw);
  expect(clean).not.toContain("short-sensitive-value");
  expect(clean).not.toContain("continued-sensitive-value");
  expect(clean).toContain("[REDACTED]");
  expect(sanitize(clean)).toBe(clean);
});

import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ALLOW, scanFiles, scanText } from "../../scripts/sentinel-secret-scan";

// Credential-shaped strings are assembled at runtime so this file never contains a scannable secret.
const fake = {
  gh: "gh" + "p_" + "a".repeat(36),
  aws: "AKIA" + "ABCDEFGHIJKLMNOP",
  key: "-----BEGIN " + "PRIVATE KEY-----",
  db: "postgres://app:" + "Sup3rS3cretPw" + "@db.prod.example.com:5432/x",
  tg: "123456789:" + "A".repeat(35),
};
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const tmp = () => mkdtempSync(join(tmpdir(), "wetscan-secret-scan-"));

describe("S11 secret scan: detection", () => {
  it.each(Object.entries(fake))("detects a %s-shaped credential", (_n, v) =>
    expect(scanText("x.ts", `const v = "${v}"`)).toHaveLength(1),
  );
  it("does not flag loopback/placeholder connection strings or ordinary text", () => {
    for (const ok of [
      "postgres://wetscan_app:s05_local_only_pw@127.0.0.1:55432/db",
      "postgres://user:${PASSWORD}@db/x",
      "postgres://user:<password>@db/x",
      "the quick brown fox",
    ])
      expect(scanText("x.ts", ok)).toEqual([]);
  });
  it("never echoes the matched value or any hash of it", () => {
    const report = scanFiles(["x.txt"], { read: () => Buffer.from(fake.gh) });
    const text = JSON.stringify(report);
    expect(report.findings).toHaveLength(1);
    expect(text).not.toContain(fake.gh);
    expect(text).not.toContain(sha(fake.gh));
  });
  it("flags a tracked dotenv file but not *.example", () => {
    expect(
      scanFiles([".env.local"], { read: () => Buffer.from("") }).findings.map(
        (f) => f.rule,
      ),
    ).toContain("tracked-dotenv-file");
    expect(
      scanFiles([".env.sentinel.example"], { read: () => Buffer.from("") })
        .findings,
    ).toEqual([]);
  });
});

describe("S11 secret scan: no blind spots", () => {
  it("finds a token that starts after character 4000 of a single long line", () => {
    const line = "x".repeat(5000) + " " + fake.gh;
    expect(scanText("long.json", line)).toEqual([
      { file: "long.json", line: 1, rule: "github-token" },
    ]);
  });
  it("finds a token that straddles a scan-window boundary", () => {
    for (const offset of [4096 - 5, 4096 - 20, 4096 - 36, 8000]) {
      const line = "y".repeat(offset) + " " + fake.gh + " " + "y".repeat(300);
      expect(scanText("w.json", line), `offset ${offset}`).toHaveLength(1);
    }
  });
  it("scans a file larger than the old 2 MB limit and reports the right line", () => {
    const dir = tmp();
    try {
      const file = join(dir, "big.log");
      writeFileSync(
        file,
        ("a".repeat(99) + "\n").repeat(30_000) + fake.aws + "\n", // ~3 MB
      );
      const report = scanFiles([file]);
      expect(report.findings).toEqual([
        { file, line: 30_001, rule: "aws-access-key-id" },
      ]);
      expect(report.ok).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  it("fails closed (incomplete) for a file above the hard cap, an unreadable file and a missing file", () => {
    const dir = tmp();
    try {
      mkdirSync(join(dir, "adir"));
      writeFileSync(join(dir, "big.txt"), "z".repeat(2000));
      const report = scanFiles(
        [join(dir, "big.txt"), join(dir, "adir"), join(dir, "missing.txt")],
        { maxBytes: 1000 },
      );
      expect(report.incomplete.map((i) => i.reason).sort()).toEqual([
        "too_large",
        "unreadable",
        "unreadable",
      ]);
      expect(report.ok).toBe(false);
      expect(report.scanned).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  it("counts binary files explicitly instead of skipping them silently", () => {
    const report = scanFiles(["a.png", "b.bin"], {
      read: (f) =>
        f === "b.bin" ? Buffer.from([1, 0, 2, 0]) : Buffer.from(""),
    });
    expect(report).toMatchObject({ skippedBinary: 2, scanned: 0, ok: true });
  });
  it("a clean scan is ok", () => {
    expect(
      scanFiles(["a.ts"], { read: () => Buffer.from("const a = 1;\n") }),
    ).toMatchObject({ ok: true, scanned: 1, findings: [], incomplete: [] });
  });
});

describe("S11 secret scan: exact reviewed-content exceptions", () => {
  const file = "tests/fixture.test.ts";
  const line = `const k = "${fake.gh}";`;
  const allow = [
    {
      file,
      rule: "github-token",
      sha256: sha(line.trim()),
      reason: "test canary",
    },
  ];
  it("allows exactly the reviewed line", () => {
    expect(scanText(file, line, allow)).toEqual([]);
    expect(scanText(file, `   ${line}   `, allow)).toEqual([]); // whitespace only
  });
  it("rejects changed content in an allowlisted file", () => {
    const changed = `const k = "ghp_${"b".repeat(36)}";`;
    expect(scanText(file, changed, allow)).toHaveLength(1);
  });
  it("rejects a NEW credential-shaped line added to an allowlisted file", () => {
    const text = `${line}\nconst real = "${fake.aws}";\nconst again = "${fake.gh}"; // extra`;
    expect(
      scanText(file, text, allow).map((f) => `${f.line}:${f.rule}`),
    ).toEqual(["2:aws-access-key-id", "3:github-token"]);
  });
  it("rejects the same reviewed line copied into another file", () => {
    expect(scanText("src/other.ts", line, allow)).toHaveLength(1);
  });
  it("appending anything to a reviewed line invalidates its exception", () => {
    const mixed = `${line} ${fake.aws}`;
    expect(
      scanText(file, mixed, allow)
        .map((f) => f.rule)
        .sort(),
    ).toEqual(["aws-access-key-id", "github-token"]);
  });
});

describe("S11 secret scan: the repository", () => {
  const files = () =>
    execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
      .split("\0")
      .filter(Boolean);
  it("every shipped exception is justified, unique and still needed", () => {
    expect(new Set(ALLOW.map((a) => a.file + a.rule + a.sha256)).size).toBe(
      ALLOW.length,
    );
    for (const a of ALLOW) {
      expect(a.reason.length).toBeGreaterThan(10);
      expect(a.sha256).toMatch(/^[a-f0-9]{64}$/);
      // Still needed: with the exception removed the scan must report this file, i.e. the content has not changed away.
      const without = scanFiles([a.file], {
        allow: ALLOW.filter((x) => x !== a),
      });
      const withIt = scanFiles([a.file]);
      expect(withIt.findings.length, a.file).toBeLessThan(
        without.findings.length,
      );
    }
  });
  it("the tracked repository has no credential-shaped secret, no tracked dotenv and nothing it could not inspect", () => {
    const report = scanFiles(files());
    expect({
      findings: report.findings,
      incomplete: report.incomplete,
    }).toEqual({
      findings: [],
      incomplete: [],
    });
    expect(report.scanned).toBeGreaterThan(500);
  });
});

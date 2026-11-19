import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";

/**
 * Hash-pinned files must have the same bytes on every checkout. The repository pins some scripts by SHA-256 (for example
 * Invoke-S04AuditProcedure.ps1 pins sentinel-provision-common.ps1). This test finds every 64-hex literal in executable
 * repository code that equals the hash of another tracked file, works out whether the pin is over LF or CRLF bytes, and
 * requires `.gitattributes` to make every checkout produce exactly those bytes. Historical review documents and recorded
 * evidence JSON are descriptive, not enforced, and are excluded.
 */
const tracked = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
  .split("\0")
  .filter(Boolean);
const TEXT = /\.(ps1|mjs|cjs|ts|tsx|js|json|sql|yml|yaml)$/;
const sha = (b: Buffer | string) =>
  createHash("sha256").update(b).digest("hex");
const lfBytes = (file: string) =>
  Buffer.from(
    readFileSync(file).toString("latin1").replace(/\r\n/g, "\n"),
    "latin1",
  );
const crlfBytes = (b: Buffer) =>
  Buffer.from(b.toString("latin1").replace(/\n/g, "\r\n"), "latin1");
const targets = tracked.filter(
  (f) =>
    /^(scripts|worker|src|infra)\//.test(f) &&
    TEXT.test(f) &&
    statSync(f).size < 2_000_000,
);
const byHash = new Map<string, { file: string; form: "LF" | "CRLF" }>();
for (const f of targets) {
  const lf = lfBytes(f);
  const lfHash = sha(lf);
  const crlfHash = sha(crlfBytes(lf));
  byHash.set(lfHash, { file: f, form: "LF" });
  if (crlfHash !== lfHash) byHash.set(crlfHash, { file: f, form: "CRLF" });
}
const sources = tracked.filter(
  (f) =>
    /^(scripts|src|worker|tests)\//.test(f) &&
    TEXT.test(f) &&
    !f.startsWith("tests/guard/evidence/") &&
    f !== "tests/sentinel/s11-pinned-script-bytes.test.ts",
);
const pins: { source: string; target: string; form: "LF" | "CRLF" }[] = [];
for (const f of sources) {
  const text = readFileSync(f, "latin1");
  for (const m of text.matchAll(/\b[a-f0-9]{64}\b/g)) {
    const hit = byHash.get(m[0]);
    if (hit && hit.file !== f)
      pins.push({ source: f, target: hit.file, form: hit.form });
  }
}
const eol = (files: string[]) => {
  const out = execFileSync("git", ["check-attr", "eol", "--", ...files], {
    encoding: "utf8",
  });
  return Object.fromEntries(
    out
      .trim()
      .split(/\r?\n/)
      .map((l) => {
        const [, file, value] = /^(.*): eol: (.*)$/.exec(l)!;
        return [file, value];
      }),
  );
};

describe("S11 hash-pinned scripts keep their bytes on every checkout", () => {
  it("finds the known repository pins (the scan is not vacuous)", () => {
    const pairs = pins.map((p) => `${p.source} -> ${p.target}`);
    expect(pairs).toContain(
      "scripts/Invoke-S04AuditProcedure.ps1 -> scripts/sentinel-provision-common.ps1",
    );
    expect(pairs).toContain(
      "scripts/Invoke-S04OwnerSessionArchiveAudit.ps1 -> scripts/sentinel-provision-private.ps1",
    );
    expect(pairs).toContain(
      "scripts/Invoke-S04OwnerSessionArchiveAudit.ps1 -> scripts/sentinel-owner-session-audit.ts",
    );
  });
  it("no repository code pins a file by its CRLF bytes", () => {
    expect(pins.filter((p) => p.form === "CRLF")).toEqual([]);
  });
  it("every file pinned over LF bytes is forced to LF by .gitattributes", () => {
    const targetsLf = [
      ...new Set(pins.filter((p) => p.form === "LF").map((p) => p.target)),
    ];
    expect(targetsLf.length).toBeGreaterThan(0);
    const attr = eol(targetsLf);
    expect(Object.entries(attr).filter(([, value]) => value !== "lf")).toEqual(
      [],
    );
  });
  it("all PowerShell scripts are LF except the one pinned in CRLF form by the private S04 provision-package manifest", () => {
    const ps1 = tracked.filter((f) => f.endsWith(".ps1"));
    const attr = eol(ps1);
    const notLf = Object.entries(attr)
      .filter(([, value]) => value !== "lf")
      .map(([file, value]) => `${file}=${value}`);
    expect(notLf).toEqual(["scripts/Invoke-S04ProvisionPackage.ps1=crlf"]);
  });
});

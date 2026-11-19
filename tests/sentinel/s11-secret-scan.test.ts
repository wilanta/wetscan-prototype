import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { ALLOW, scanFiles, scanText } from "../../scripts/sentinel-secret-scan";

// Credential-shaped strings are assembled at runtime so this file never contains a scannable secret.
const fake = {
  gh: "gh" + "p_" + "a".repeat(36),
  aws: "AKIA" + "ABCDEFGHIJKLMNOP",
  key: "-----BEGIN " + "PRIVATE KEY-----",
  db: "postgres://app:" + "Sup3rS3cretPw" + "@db.prod.example.com:5432/x",
  tg: "123456789:" + "A".repeat(35),
};

describe("S11 secret scan", () => {
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
  it("never echoes the matched value", () => {
    const f = scanText("x.ts", fake.gh);
    expect(JSON.stringify(f)).not.toContain(fake.gh);
  });
  it("flags a tracked dotenv file but not *.example", () => {
    expect(scanFiles([".env.local"]).map((f) => f.rule)).toContain(
      "tracked-dotenv-file",
    );
    expect(scanFiles([".env.sentinel.example"])).toEqual([]);
  });
  it("every allowlisted fixture is exact, justified and still needed", () => {
    for (const a of ALLOW) expect(a.reason.length).toBeGreaterThan(10);
    expect(new Set(ALLOW.map((a) => a.file + a.rule)).size).toBe(ALLOW.length);
  });
  it("the tracked repository contains no credential-shaped secret and no tracked dotenv", () => {
    const files = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
      .split("\0")
      .filter(Boolean);
    expect(scanFiles(files)).toEqual([]);
  });
});

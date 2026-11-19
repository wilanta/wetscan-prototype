import { describe, expect, it } from "vitest";
import {
  compareVersions,
  ghsaRange,
  osvRanges,
  validInstalledVersion,
  versionMatches,
} from "../../src/features/sentinel/external/versions";

describe("S09 per-ecosystem version semantics", () => {
  it("compares semver numerically, never lexicographically", () => {
    expect(compareVersions("npm", "1.10.0", "1.9.0")).toBe(1);
    expect(compareVersions("npm", "1.2.3", "1.2.3")).toBe(0);
    expect(compareVersions("npm", "10.0.0", "9.99.99")).toBe(1);
    expect("1.10.0" < "1.9.0").toBe(true); // the trap generic string comparison would fall into
  });
  it("orders semver pre-releases and ignores build metadata", () => {
    expect(compareVersions("npm", "1.0.0-alpha", "1.0.0")).toBe(-1);
    expect(compareVersions("npm", "1.0.0-alpha.2", "1.0.0-alpha.10")).toBe(-1);
    expect(compareVersions("npm", "1.0.0-alpha.1", "1.0.0-alpha")).toBe(1);
    expect(compareVersions("npm", "1.0.0-1", "1.0.0-alpha")).toBe(-1);
    expect(compareVersions("npm", "1.0.0+build.5", "1.0.0")).toBe(0);
    expect(compareVersions("go", "v1.2.3", "1.2.4")).toBe(-1);
  });
  it("compares PEP 440 versions (epochs, pre/post/dev, zero padding)", () => {
    expect(compareVersions("pypi", "1.0", "1.0.0")).toBe(0);
    expect(compareVersions("pypi", "1.0rc1", "1.0")).toBe(-1);
    expect(compareVersions("pypi", "1.0.dev1", "1.0a1")).toBe(-1);
    expect(compareVersions("pypi", "1.0.post1", "1.0")).toBe(1);
    expect(compareVersions("pypi", "1!0.5", "9.9")).toBe(1);
    expect(compareVersions("pypi", "2.10", "2.9")).toBe(1);
    expect(compareVersions("pypi", "1.0+abc", "1.0")).toBe(1);
  });
  it("returns null for unparsable or unsupported input instead of guessing", () => {
    expect(compareVersions("npm", "not-a-version", "1.0.0")).toBeNull();
    expect(compareVersions("pypi", "x.y", "1.0")).toBeNull();
    expect(compareVersions("maven", "1.0", "1.1")).toBeNull();
    expect(validInstalledVersion("npm", "1.2")).toBe(false);
    expect(validInstalledVersion("npm", "1.2.3")).toBe(true);
    expect(validInstalledVersion("rubygems", "1.2.3")).toBe(false);
  });
});

describe("S09 range construction", () => {
  it("parses GHSA comparator strings", () => {
    expect(ghsaRange("< 4.17.21")).toEqual({
      ranges: [{ introduced: "0", fixed: "4.17.21", lastAffected: null }],
      versions: [],
      certain: true,
    });
    expect(ghsaRange(">= 1.0.0, <= 1.4.2").ranges[0]).toEqual({
      introduced: "1.0.0",
      fixed: null,
      lastAffected: "1.4.2",
    });
    expect(ghsaRange("= 2.0.0")).toEqual({
      ranges: [],
      versions: ["2.0.0"],
      certain: true,
    });
    expect(ghsaRange(">= 4.0")).toMatchObject({ certain: true });
  });
  it("refuses constraints it cannot express (exclusive lower bounds, junk)", () => {
    expect(ghsaRange("> 1.0.0").certain).toBe(false);
    expect(ghsaRange(">= 1.0.0, >= 2.0.0").certain).toBe(false);
    expect(ghsaRange("").certain).toBe(false);
    expect(ghsaRange(null).certain).toBe(false);
    expect(ghsaRange(">= 1.0, = 1.5").certain).toBe(false);
  });
  it("turns OSV events into ranges, including repeated introduced/fixed pairs", () => {
    const r = osvRanges("npm", [
      {
        type: "SEMVER",
        events: [
          { introduced: "0" },
          { fixed: "1.2.0" },
          { introduced: "2.0.0" },
          { last_affected: "2.3.0" },
        ],
      },
    ]);
    expect(r.certain).toBe(true);
    expect(r.ranges).toEqual([
      { introduced: "0", fixed: "1.2.0", lastAffected: null },
      { introduced: "2.0.0", fixed: null, lastAffected: "2.3.0" },
    ]);
    expect(
      osvRanges("npm", [
        { type: "SEMVER", events: [{ fixed: "2.0.0" }, { introduced: "0" }] },
      ]).ranges,
    ).toEqual([{ introduced: "0", fixed: "2.0.0", lastAffected: null }]);
    expect(
      osvRanges("npm", [{ type: "SEMVER", events: [{ introduced: "1.0.0" }] }])
        .ranges,
    ).toEqual([{ introduced: "1.0.0", fixed: null, lastAffected: null }]);
  });
  it("marks GIT commit ranges uncertain", () => {
    const r = osvRanges("npm", [
      {
        type: "GIT",
        repo: "https://example.invalid/x",
        events: [{ introduced: "abc" }],
      },
    ]);
    expect(r.certain).toBe(false);
    expect(r.ranges).toEqual([]);
  });
});

describe("S09 version matching at the boundaries", () => {
  const entry = (text: string) => ({ ...ghsaRange(text) });
  it("matches inside and rejects at/after the fixed version", () => {
    const e = entry("< 4.17.21");
    expect(versionMatches("npm", "4.17.20", e).matched).toBe(true);
    expect(versionMatches("npm", "4.17.21", e).matched).toBe(false);
    expect(versionMatches("npm", "4.17.22", e).matched).toBe(false);
    expect(versionMatches("npm", "4.9.0", e).matched).toBe(true);
    expect(versionMatches("npm", "4.100.0", e).matched).toBe(false);
  });
  it("honours inclusive lower and last_affected bounds", () => {
    const e = entry(">= 1.0.0, <= 1.4.2");
    expect(versionMatches("npm", "0.9.9", e).matched).toBe(false);
    expect(versionMatches("npm", "1.0.0", e).matched).toBe(true);
    expect(versionMatches("npm", "1.4.2", e).matched).toBe(true);
    expect(versionMatches("npm", "1.4.3", e).matched).toBe(false);
  });
  it("matches explicit affected versions and pre-releases correctly", () => {
    expect(versionMatches("npm", "2.0.0", entry("= 2.0.0")).matched).toBe(true);
    expect(versionMatches("npm", "2.0.1", entry("= 2.0.0")).matched).toBe(
      false,
    );
    expect(
      versionMatches("npm", "4.17.21-beta.1", entry("< 4.17.21")).matched,
    ).toBe(true);
  });
  it("evaluates PyPI ranges with PEP 440 order", () => {
    const e = {
      ranges: [{ introduced: "0", fixed: "2.0", lastAffected: null }],
      versions: [],
      certain: true,
    };
    expect(versionMatches("pypi", "2.0rc1", e).matched).toBe(true);
    expect(versionMatches("pypi", "2.0", e).matched).toBe(false);
    expect(versionMatches("pypi", "1.10", e).matched).toBe(true);
  });
  it("never reports not-affected when it cannot decide", () => {
    expect(versionMatches("npm", "1.0.0", entry("> 0.5.0")).matched).toBeNull(); // uncertain constraint
    expect(versionMatches("maven", "1.0", entry("< 2.0")).matched).toBeNull(); // no semantics
    expect(versionMatches("npm", "weird", entry("< 2.0.0")).matched).toBeNull(); // invalid installed version
    expect(
      versionMatches("npm", "1.0.0", {
        ranges: [{ introduced: "junk", fixed: "2.0.0", lastAffected: null }],
        versions: [],
        certain: true,
      }).matched,
    ).toBeNull();
  });
});

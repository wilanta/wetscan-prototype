import { describe, expect, it } from "vitest";
import {
  identSet,
  normId,
  normalizeGhsa,
  normalizeKev,
  normalizeOsv,
  normalizePackage,
  pickCanonical,
} from "../../src/features/sentinel/external/normalize";
import {
  GHSA_LODASH,
  ghsaLodash,
  ghsaRange,
  kevSnapshot,
  osvLodash,
} from "./external-fixtures";

describe("S09-A1 deterministic normalization", () => {
  it("normalizes KEV entries with provenance and never attaches packages", () => {
    const n = normalizeKev(kevSnapshot());
    expect(n.feedVersion).toBe("2026.11.18");
    expect(n.records.map((r) => r.sourceId)).toEqual([
      "CVE-2021-23337",
      "CVE-2020-0001",
    ]);
    const r = n.records[0];
    expect(r).toMatchObject({
      provider: "cisa_kev",
      status: "active",
      severity: "unknown",
      affected: [],
      ident: ["CVE-2021-23337"],
      sourceUrl: "https://www.cisa.gov/known-exploited-vulnerabilities-catalog",
    });
    expect(r.kev).toMatchObject({
      dateAdded: "2026-11-10T00:00:00.000Z",
      knownRansomwareCampaignUse: "Unknown",
    });
    expect(r.rawSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(normalizeKev(kevSnapshot()).records).toEqual(n.records); // deterministic
  });
  it("rejects malformed/duplicate KEV records individually and a malformed document wholesale", () => {
    const n = normalizeKev(
      kevSnapshot([
        { cveID: "not-a-cve", dateAdded: "2026-11-01" },
        { cveID: "CVE-2021-23337", dateAdded: "2026-11-10" },
        { cveID: "CVE-2022-1111" },
      ]),
    );
    expect(n.records).toHaveLength(2);
    expect(n.rejected).toBe(3);
    expect(() => normalizeKev({ vulnerabilities: "x" })).toThrow(
      "malformed_payload",
    );
    expect(() => normalizeKev(null)).toThrow();
  });
  it("normalizes a GHSA advisory with aliases, ranges and the patched version", () => {
    const r = normalizeGhsa(ghsaLodash())!;
    expect(r).toMatchObject({
      provider: "ghsa",
      sourceId: GHSA_LODASH,
      severity: "high",
      status: "active",
      cvssScore: 7.2,
      ident: ["CVE-2021-23337", GHSA_LODASH].sort(),
    });
    expect(r.affected).toEqual([
      {
        ecosystem: "npm",
        packageName: "lodash",
        ranges: [{ introduced: "0", fixed: "4.17.21", lastAffected: null }],
        versions: [],
        fixed: ["4.17.21"],
        certainty: "verified",
      },
    ]);
  });
  it("treats withdrawn GHSA advisories as withdrawn and refuses unreviewed/malformed ones", () => {
    expect(
      normalizeGhsa(ghsaLodash({ withdrawn_at: "2026-11-15T00:00:00Z" }))!
        .status,
    ).toBe("withdrawn");
    expect(normalizeGhsa(ghsaLodash({ type: "unreviewed" }))).toBeNull();
    expect(normalizeGhsa(ghsaLodash({ type: "malware" }))).toBeNull();
    expect(normalizeGhsa(ghsaLodash({ ghsa_id: "GHSA-xxxx" }))).toBeNull();
    expect(normalizeGhsa(null)).toBeNull();
  });
  it("marks unparsable GHSA constraints and unknown ecosystems uncertain", () => {
    expect(
      normalizeGhsa(
        ghsaRange(
          "GHSA-aaaa-bbbb-cccc".replace(/a|b/g, "c"),
          "left-pad",
          "> 1.0.0",
        ),
      )!.affected[0].certainty,
    ).toBe("uncertain");
    const exotic = ghsaLodash({
      vulnerabilities: [
        {
          package: { ecosystem: "someos", name: "x" },
          vulnerable_version_range: "< 1.0.0",
        },
      ],
    });
    expect(normalizeGhsa(exotic)!.affected[0]).toMatchObject({
      ecosystem: "other",
      certainty: "uncertain",
    });
  });
  it("normalizes OSV records with aliases and ranges", () => {
    const r = normalizeOsv(osvLodash())!;
    expect(r).toMatchObject({
      provider: "osv",
      sourceId: GHSA_LODASH,
      severity: "high",
      sourceUrl: `https://osv.dev/vulnerability/${GHSA_LODASH}`,
    });
    expect(r.ident).toEqual(["CVE-2021-23337", GHSA_LODASH].sort());
    expect(r.affected[0]).toMatchObject({
      ecosystem: "npm",
      packageName: "lodash",
      certainty: "verified",
      fixed: ["4.17.21"],
    });
    expect(r.cvssVector).toMatch(/^CVSS:3\.1/);
    expect(
      normalizeOsv(osvLodash("4.17.21", { withdrawn: "2026-11-15T00:00:00Z" }))!
        .status,
    ).toBe("withdrawn");
    expect(normalizeOsv({ id: "bad id with spaces" })).toBeNull();
  });
  it("keeps GIT-only OSV ranges uncertain and never invents versions", () => {
    const r = normalizeOsv({
      id: "OSV-2026-1",
      affected: [
        {
          package: { ecosystem: "npm", name: "x" },
          ranges: [{ type: "GIT", events: [{ introduced: "abc" }] }],
        },
      ],
    })!;
    expect(r.affected[0]).toMatchObject({
      certainty: "uncertain",
      ranges: [],
      versions: [],
    });
  });
});

describe("S09 identifiers and canonical identity", () => {
  it("canonicalizes identifier spelling and rejects implausible ones", () => {
    expect(normId("cve-2021-23337")).toBe("CVE-2021-23337");
    expect(normId("ghsa-35JH-R3H4-6JHM")).toBe(GHSA_LODASH);
    expect(normId("PYSEC-2021-1")).toBe("PYSEC-2021-1");
    for (const bad of ["", "x", "CVE-1", "a".repeat(80), "<script>", 5, null])
      expect(normId(bad)).toBeNull();
  });
  it("picks CVE before GHSA before other, then lexicographically — independent of input order", () => {
    const ids = [
      "PYSEC-2021-1",
      GHSA_LODASH,
      "CVE-2021-23337",
      "CVE-2021-1000",
    ];
    expect(pickCanonical(ids)).toBe("CVE-2021-1000");
    expect(pickCanonical([...ids].reverse())).toBe("CVE-2021-1000");
    expect(pickCanonical(["PYSEC-2021-1", GHSA_LODASH])).toBe(GHSA_LODASH);
    expect(
      identSet("b", "CVE-2021-1000", ["CVE-2021-1000", "ghsa-35jh-r3h4-6jhm"]),
    ).toEqual(["CVE-2021-1000", GHSA_LODASH]);
  });
  it("normalizes package names per ecosystem", () => {
    expect(normalizePackage("npm", "@Scope/Pkg")).toBe("@scope/pkg");
    expect(normalizePackage("pypi", "Django_Rest.Framework")).toBe(
      "django-rest-framework",
    );
    expect(normalizePackage("crates.io", "Serde_Json")).toBe("serde-json");
    expect(normalizePackage("maven", "org.Foo:Bar")).toBe("org.Foo:Bar");
  });
});

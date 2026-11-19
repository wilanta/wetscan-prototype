/** Mocked provider snapshots (S09-A1). Shaped like the documented provider payloads; clearly fixtures, never fetched. */
export const kevSnapshot = (extra: Record<string, unknown>[] = []) => ({
  title: "CISA Catalog of Known Exploited Vulnerabilities",
  catalogVersion: "2026.11.18",
  dateReleased: "2026-11-18T14:00:00.000Z",
  count: 2 + extra.length,
  vulnerabilities: [
    {
      cveID: "CVE-2021-23337",
      vendorProject: "Lodash",
      product: "lodash",
      vulnerabilityName: "Lodash Command Injection Vulnerability",
      dateAdded: "2026-11-10",
      shortDescription: "Fixture: lodash template command injection.",
      requiredAction: "Apply updates per vendor instructions.",
      dueDate: "2026-12-01",
      knownRansomwareCampaignUse: "Unknown",
      notes: "",
      cwes: ["CWE-77"],
    },
    {
      cveID: "CVE-2020-0001",
      vendorProject: "Example",
      product: "Widget",
      vulnerabilityName: "Example Widget RCE",
      dateAdded: "2026-11-11",
      shortDescription: "Fixture: package-less vendor entry.",
      requiredAction: "Apply updates.",
      dueDate: "2026-12-02",
      knownRansomwareCampaignUse: "Known",
      notes: "",
      cwes: [],
    },
    ...extra,
  ],
});
export const GHSA_LODASH = "GHSA-35jh-r3h4-6jhm";
export const ghsaLodash = (over: Record<string, unknown> = {}) => ({
  ghsa_id: GHSA_LODASH,
  cve_id: "CVE-2021-23337",
  url: `https://api.github.com/advisories/${GHSA_LODASH}`,
  html_url: `https://github.com/advisories/${GHSA_LODASH}`,
  summary: "Command Injection in lodash",
  description: "Fixture description.",
  type: "reviewed",
  severity: "high",
  identifiers: [
    { type: "GHSA", value: GHSA_LODASH },
    { type: "CVE", value: "CVE-2021-23337" },
  ],
  published_at: "2021-05-06T16:05:51Z",
  updated_at: "2026-11-12T00:00:00Z",
  withdrawn_at: null,
  vulnerabilities: [
    {
      package: { ecosystem: "npm", name: "lodash" },
      vulnerable_version_range: "< 4.17.21",
      first_patched_version: "4.17.21",
    },
  ],
  cvss: {
    vector_string: "CVSS:3.1/AV:N/AC:L/PR:H/UI:N/S:U/C:H/I:H/A:H",
    score: 7.2,
  },
  ...over,
});
export const ghsaRange = (
  id: string,
  name: string,
  range: string,
  over: Record<string, unknown> = {},
) =>
  ghsaLodash({
    ghsa_id: id,
    cve_id: null,
    identifiers: [{ type: "GHSA", value: id }],
    html_url: `https://github.com/advisories/${id}`,
    summary: `Fixture advisory for ${name}`,
    vulnerabilities: [
      {
        package: { ecosystem: "npm", name },
        vulnerable_version_range: range,
        first_patched_version: null,
      },
    ],
    ...over,
  });
export const osvLodash = (
  fixed = "4.17.21",
  over: Record<string, unknown> = {},
) => ({
  id: GHSA_LODASH,
  modified: "2026-11-12T00:00:00Z",
  published: "2021-05-06T16:05:51Z",
  aliases: ["CVE-2021-23337"],
  summary: "Command Injection in lodash",
  details: "Fixture OSV details.",
  affected: [
    {
      package: { ecosystem: "npm", name: "lodash" },
      ranges: [{ type: "SEMVER", events: [{ introduced: "0" }, { fixed }] }],
    },
  ],
  database_specific: { severity: "HIGH" },
  severity: [
    { type: "CVSS_V3", score: "CVSS:3.1/AV:N/AC:L/PR:H/UI:N/S:U/C:H/I:H/A:H" },
  ],
  ...over,
});
export const packageLock = (
  packages: Record<string, Record<string, unknown>>,
  lockfileVersion = 3,
) =>
  JSON.stringify({
    name: "fixture-app",
    lockfileVersion,
    packages: { "": { name: "fixture-app", version: "1.0.0" }, ...packages },
  });

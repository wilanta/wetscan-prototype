import { fingerprint } from "../../../platform/identity";
import { FeedError } from "./feeds";
import {
  type AffectedPackage,
  type Ecosystem,
  type NormalizedAdvisory,
  type Severity,
} from "./model";
import { ghsaRange, osvRanges } from "./versions";

const CVE = /^CVE-\d{4}-\d{4,19}$/;
const GHSA = /^GHSA(-[2-9cfghjmpqrvwx]{4}){3}$/;
const GENERIC = /^[A-Z][A-Z0-9]{1,15}(-[A-Za-z0-9._:]+){1,6}$/;
/** Canonical spelling of an advisory identifier, or null when it is not a plausible one. */
export function normId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  let s = value.trim();
  if (/^cve-/i.test(s)) s = s.toUpperCase();
  else if (/^ghsa-/i.test(s)) s = "GHSA-" + s.slice(5).toLowerCase();
  if (s.length > 64) return null;
  // Reserved prefixes must be well-formed; they never fall through to the generic pattern.
  if (s.startsWith("CVE-")) return CVE.test(s) ? s : null;
  if (s.startsWith("GHSA-")) return GHSA.test(s) ? s : null;
  return GENERIC.test(s) ? s : null;
}
const idRank = (id: string) => (CVE.test(id) ? 0 : GHSA.test(id) ? 1 : 2);
/** Deterministic canonical identity: CVE before GHSA before anything else, then lexicographic. */
export const pickCanonical = (ids: readonly string[]) =>
  [...ids].sort(
    (a, b) => idRank(a) - idRank(b) || (a < b ? -1 : a > b ? 1 : 0),
  )[0];
export const identSet = (...ids: unknown[]) =>
  [
    ...new Set(
      ids
        .flat()
        .map(normId)
        .filter((x): x is string => !!x),
    ),
  ]
    .sort()
    .slice(0, 40);

const clip = (v: unknown, max: number) =>
  typeof v === "string"
    ? v
        .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "")
        .trim()
        .slice(0, max)
    : "";
function iso(v: unknown): string | null {
  if (typeof v !== "string" || v.length > 40) return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}
const ghsaEco: Record<string, Ecosystem> = {
  npm: "npm",
  pip: "pypi",
  go: "go",
  rust: "crates.io",
  maven: "maven",
  nuget: "nuget",
  rubygems: "rubygems",
  composer: "packagist",
  pub: "pub",
  erlang: "hex",
  swift: "swift",
  actions: "actions",
};
const osvEco: Record<string, Ecosystem> = {
  npm: "npm",
  pypi: "pypi",
  go: "go",
  "crates.io": "crates.io",
  maven: "maven",
  nuget: "nuget",
  rubygems: "rubygems",
  packagist: "packagist",
  pub: "pub",
  hex: "hex",
  swifturl: "swift",
  "github actions": "actions",
};
export function normalizePackage(ecosystem: Ecosystem, name: string) {
  const n = name.trim();
  if (ecosystem === "pypi") return n.toLowerCase().replace(/[-_.]+/g, "-");
  if (ecosystem === "crates.io") return n.toLowerCase().replace(/_/g, "-");
  return ecosystem === "npm" ? n.toLowerCase() : n;
}
function severityOf(v: unknown): Severity {
  const s = typeof v === "string" ? v.toLowerCase() : "";
  if (s === "moderate") return "medium";
  return (
    (["low", "medium", "high", "critical"] as const).find((x) => x === s) ??
    "unknown"
  );
}
export const contentHash = (
  a: Omit<NormalizedAdvisory, "rawSha256" | "feedVersion">,
) => fingerprint(a);
const rawHash = (v: unknown) => fingerprint(v);
const cvssScore = (v: unknown) =>
  typeof v === "number" && v >= 0 && v <= 10 ? Math.round(v * 10) / 10 : null;
const url = (v: unknown, prefix: string, fallback: string) =>
  typeof v === "string" && v.startsWith(prefix) && v.length <= 500
    ? v
    : fallback;

export interface Normalized {
  records: NormalizedAdvisory[];
  rejected: number;
  feedVersion: string | null;
}
/** CISA KEV catalog: package-less by design, so it can never produce a repository exposure. */
export function normalizeKev(payload: unknown): Normalized {
  const root = payload as Record<string, unknown> | null;
  const list = root?.vulnerabilities;
  if (
    !root ||
    typeof root !== "object" ||
    !Array.isArray(list) ||
    list.length > 20000
  )
    throw new FeedError("malformed_payload");
  const feedVersion = clip(root.catalogVersion, 64) || null;
  const records: NormalizedAdvisory[] = [];
  let rejected = 0;
  const seen = new Set<string>();
  for (const v of list as Record<string, unknown>[]) {
    const id = normId(v?.cveID);
    const added = iso(
      typeof v?.dateAdded === "string"
        ? `${v.dateAdded}T00:00:00Z`
        : v?.dateAdded,
    );
    if (!id || !CVE.test(id) || !added || seen.has(id)) {
      rejected++;
      continue;
    }
    seen.add(id);
    const due =
      typeof v.dueDate === "string" ? iso(`${v.dueDate}T00:00:00Z`) : null;
    records.push({
      provider: "cisa_kev",
      sourceId: id,
      ident: [id],
      status: "active",
      title: clip(v.vulnerabilityName, 300) || id,
      summary: clip(v.shortDescription, 2000) || null,
      severity: "unknown", // KEV states exploitation, not severity
      cvssVector: null,
      cvssScore: null,
      kev: {
        dateAdded: added,
        dueDate: due,
        knownRansomwareCampaignUse:
          clip(v.knownRansomwareCampaignUse, 16) || "Unknown",
        requiredAction: clip(v.requiredAction, 500),
        vendorProject: clip(v.vendorProject, 120),
        product: clip(v.product, 120),
      },
      publishedAt: null,
      modifiedAt: added,
      withdrawnAt: null,
      sourceUrl: "https://www.cisa.gov/known-exploited-vulnerabilities-catalog",
      feedVersion,
      rawSha256: rawHash(v),
      affected: [],
    });
  }
  return { records, rejected, feedVersion };
}
export function normalizeGhsa(item: unknown): NormalizedAdvisory | null {
  const a = item as Record<string, unknown> | null;
  const id = normId(a?.ghsa_id);
  if (!a || !id || !GHSA.test(id) || a.type !== "reviewed") return null;
  const identifiers = Array.isArray(a.identifiers)
    ? (a.identifiers as { value?: unknown }[]).map((i) => i?.value)
    : [];
  const ident = identSet(id, a.cve_id, identifiers);
  const affected: AffectedPackage[] = [];
  for (const vuln of (Array.isArray(a.vulnerabilities)
    ? a.vulnerabilities
    : []
  ).slice(0, 200) as Record<string, unknown>[]) {
    const pkg = vuln?.package as { ecosystem?: unknown; name?: unknown } | null;
    if (
      !pkg ||
      typeof pkg.name !== "string" ||
      typeof pkg.ecosystem !== "string"
    )
      continue;
    const eco = ghsaEco[pkg.ecosystem.toLowerCase()] ?? "other";
    const range = ghsaRange(vuln.vulnerable_version_range);
    const patched = vuln.first_patched_version;
    const fixed =
      typeof patched === "string"
        ? patched
        : (patched as { identifier?: unknown } | null)?.identifier;
    affected.push({
      ecosystem: eco,
      packageName: normalizePackage(eco, clip(pkg.name, 300)),
      ranges: range.ranges,
      versions: range.versions.slice(0, 200),
      fixed: typeof fixed === "string" && fixed.length <= 128 ? [fixed] : [],
      certainty: range.certain && eco !== "other" ? "verified" : "uncertain",
    });
  }
  const cvss = a.cvss as { vector_string?: unknown; score?: unknown } | null;
  const withdrawn = iso(a.withdrawn_at);
  return {
    provider: "ghsa",
    sourceId: id,
    ident,
    status: withdrawn ? "withdrawn" : "active",
    title: clip(a.summary, 300) || id,
    summary: clip(a.description, 2000) || null,
    severity: severityOf(a.severity),
    cvssVector: clip(cvss?.vector_string, 200) || null,
    cvssScore: cvssScore(cvss?.score),
    kev: null,
    publishedAt: iso(a.published_at),
    modifiedAt: iso(a.updated_at),
    withdrawnAt: withdrawn,
    sourceUrl: url(
      a.html_url,
      "https://github.com/advisories/",
      `https://github.com/advisories/${id}`,
    ),
    feedVersion: null,
    rawSha256: rawHash(a),
    affected,
  };
}
export function normalizeOsv(record: unknown): NormalizedAdvisory | null {
  const r = record as Record<string, unknown> | null;
  const id = normId(r?.id);
  if (!r || !id) return null;
  const withdrawn = iso(r.withdrawn);
  const affected: AffectedPackage[] = [];
  for (const af of (Array.isArray(r.affected) ? r.affected : []).slice(
    0,
    200,
  ) as Record<string, unknown>[]) {
    const pkg = af?.package as { ecosystem?: unknown; name?: unknown } | null;
    if (
      !pkg ||
      typeof pkg.name !== "string" ||
      typeof pkg.ecosystem !== "string"
    )
      continue;
    const eco = osvEco[pkg.ecosystem.toLowerCase()] ?? "other";
    const { ranges, certain } = osvRanges(eco, af.ranges);
    const versions = Array.isArray(af.versions)
      ? (af.versions as unknown[]).filter(
          (v): v is string => typeof v === "string" && v.length <= 128,
        )
      : [];
    const fixed = ranges.flatMap((x) => (x.fixed ? [x.fixed] : []));
    affected.push({
      ecosystem: eco,
      packageName: normalizePackage(eco, clip(pkg.name, 300)),
      ranges,
      versions: versions.slice(0, 200),
      fixed: [...new Set(fixed)].slice(0, 50),
      certainty:
        certain &&
        versions.length <= 200 &&
        eco !== "other" &&
        (ranges.length || versions.length)
          ? "verified"
          : "uncertain",
    });
  }
  const sev = (Array.isArray(r.severity) ? r.severity : []) as {
    type?: unknown;
    score?: unknown;
  }[];
  const vector = sev.find(
    (s) => typeof s?.score === "string" && s.score.startsWith("CVSS:"),
  )?.score;
  const ds = r.database_specific as { severity?: unknown } | null;
  return {
    provider: "osv",
    sourceId: id,
    ident: identSet(id, r.aliases),
    status: withdrawn ? "withdrawn" : "active",
    title: clip(r.summary, 300) || id,
    summary: clip(r.details, 2000) || null,
    severity: severityOf(ds?.severity),
    cvssVector: typeof vector === "string" ? clip(vector, 200) : null,
    cvssScore: null,
    kev: null,
    publishedAt: iso(r.published),
    modifiedAt: iso(r.modified),
    withdrawnAt: withdrawn,
    sourceUrl: `https://osv.dev/vulnerability/${id}`,
    feedVersion: null,
    rawSha256: rawHash(r),
    affected,
  };
}

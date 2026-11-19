import type { SentinelScope } from "../types";

export const providers = ["cisa_kev", "ghsa", "osv"] as const;
export type Provider = (typeof providers)[number];
export const providerInfo: Record<
  Provider,
  { label: string; officialUrl: string; maxAgeHours: number }
> = {
  cisa_kev: {
    label: "CISA Known Exploited Vulnerabilities",
    officialUrl: "https://www.cisa.gov/known-exploited-vulnerabilities-catalog",
    maxAgeHours: 48,
  },
  ghsa: {
    label: "GitHub Global Security Advisories (reviewed)",
    officialUrl: "https://github.com/advisories",
    maxAgeHours: 48,
  },
  osv: {
    label: "OSV (Open Source Vulnerabilities)",
    officialUrl: "https://osv.dev",
    maxAgeHours: 168,
  },
};
export const ecosystems = [
  "npm",
  "pypi",
  "go",
  "crates.io",
  "maven",
  "nuget",
  "rubygems",
  "packagist",
  "pub",
  "hex",
  "swift",
  "actions",
  "other",
] as const;
export type Ecosystem = (typeof ecosystems)[number];
/** Ecosystems with implemented, tested version semantics. Everything else is `cannot_assess`, never `safe`. */
export const matchableEcosystems: readonly Ecosystem[] = [
  "npm",
  "crates.io",
  "go",
  "pypi",
];
export const severities = [
  "unknown",
  "low",
  "medium",
  "high",
  "critical",
] as const;
export type Severity = (typeof severities)[number];
export type AdvisoryStatus = "active" | "withdrawn" | "removed_from_source";
export type SourceStatus =
  "never_run" | "ok" | "partial" | "degraded" | "failed" | "rate_limited";
export type Freshness = "fresh" | "stale" | "never_synced";

/** Normalized affected range. `introduced` "0" = from the first release; both bounds are source assertions. */
export interface VersionRange {
  introduced: string | null;
  fixed: string | null;
  lastAffected: string | null;
}
export interface AffectedPackage {
  ecosystem: Ecosystem;
  packageName: string;
  ranges: VersionRange[];
  versions: string[];
  fixed: string[];
  /** `uncertain`: the source constraint could not be parsed or is unbounded-by-design; never used to claim exposure. */
  certainty: "verified" | "uncertain";
}
/** One provider's normalized assertion plus its provenance. */
export interface NormalizedAdvisory {
  provider: Provider;
  sourceId: string;
  ident: string[];
  status: AdvisoryStatus;
  title: string;
  summary: string | null;
  severity: Severity;
  cvssVector: string | null;
  cvssScore: number | null;
  kev: {
    dateAdded: string;
    dueDate: string | null;
    knownRansomwareCampaignUse: string;
    requiredAction: string;
    vendorProject: string;
    product: string;
  } | null;
  publishedAt: string | null;
  modifiedAt: string | null;
  withdrawnAt: string | null;
  sourceUrl: string;
  feedVersion: string | null;
  rawSha256: string;
  affected: AffectedPackage[];
}
export const catalogLimits = {
  maxAdvisories: 300000,
  pageSize: 25,
  maxOffset: 2000,
  chunk: 100,
  historyKeep: 10,
  runsKeep: 200,
  inventoryItems: 10000,
  inventoryKeep: 5,
  inventoryMaxAgeHours: 168,
  exposures: 500,
} as const;

export interface SourceView {
  provider: Provider;
  label: string;
  officialUrl: string;
  status: SourceStatus;
  freshness: Freshness;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastErrorCode: string | null;
  consecutiveFailures: number;
  feedVersion: string | null;
  recordCount: number;
  blockedUntil: string | null;
}
export interface RunView {
  runId: string;
  provider: Provider;
  trigger: "manual" | "scheduled";
  status: string;
  startedAt: string;
  finishedAt: string | null;
  httpStatus: number | null;
  requests: number;
  bytes: number;
  recordsSeen: number;
  recordsChanged: number;
  recordsRejected: number;
  errorCode: string | null;
}
export interface AdvisoryAssertion {
  provider: Provider;
  sourceId: string;
  status: AdvisoryStatus;
  title: string;
  summary: string | null;
  severity: Severity;
  cvssVector: string | null;
  cvssScore: number | null;
  kev: NormalizedAdvisory["kev"];
  publishedAt: string | null;
  modifiedAt: string | null;
  withdrawnAt: string | null;
  sourceUrl: string;
  retrievedAt: string;
  feedVersion: string | null;
  rawSha256: string;
  revision: number;
  affected: AffectedPackage[];
  ident: string[];
}
export interface CanonicalAdvisory {
  canonicalId: string;
  aliases: string[];
  kev: boolean;
  topSeverity: Severity;
  modifiedAt: string | null;
  assertions: AdvisoryAssertion[];
  /** True when two providers assert different ranges for the same package: shown, never merged. */
  conflicting: boolean;
}
export interface AdvisoryPage {
  items: CanonicalAdvisory[];
  nextOffset: number | null;
  disclaimer: string;
}
export const ADVISORY_DISCLAIMER =
  "A public advisory describes a vulnerability in a package. It is not evidence that this project is affected, that the package is deployed, or that anyone attempted exploitation.";

export interface InventoryItem {
  ecosystem: Ecosystem;
  name: string;
  version: string;
  scope?: "runtime" | "dev" | "optional" | "unknown";
}
export interface InventorySnapshot extends SentinelScope {
  snapshotId: string;
  sourceKind: "repository_lockfile";
  repositoryId: string;
  commitSha: string;
  lockfilePath: string;
  lockfileSha256: string;
  lockfileVersion: number;
  itemCount: number;
  ecosystems: string[];
  collectedBy: string;
  collectedAt: string;
  expiresAt: string;
}
/**
 * Dependency inventory seam. `repository_lockfile` is implemented here (declared dependencies only).
 * The Guard GRD-020 producer stays `not_integrated`: nothing writes a guard-sourced snapshot.
 */
export interface DependencyInventoryPort {
  readonly source: "repository_lockfile" | "guard_grd020";
  readonly configured: boolean;
  latest(scope: SentinelScope): Promise<InventorySnapshot | null>;
}
export type CannotAssessReason =
  | "no_inventory"
  | "inventory_expired"
  | "inventory_empty"
  | "no_assessable_ecosystem"
  | "advisory_data_unavailable";
export interface ExposureSource {
  provider: Provider;
  sourceId: string;
  severity: Severity;
  matched: boolean;
  matchedRange: VersionRange | null;
  matchedVersion: string | null;
  fixedVersions: string[];
  sourceUrl: string;
  modifiedAt: string | null;
}
export interface Exposure {
  canonicalId: string;
  ecosystem: Ecosystem;
  packageName: string;
  installedVersion: string;
  dependencyScope: string;
  kev: boolean;
  topSeverity: Severity;
  /** At least one provider asserts the installed version is affected while another does not. */
  conflicting: boolean;
  sources: ExposureSource[];
}
export interface ExposureReport {
  assessment:
    "potential_exposure" | "no_match_within_coverage" | "cannot_assess";
  reason: CannotAssessReason | null;
  message: string;
  coverage: {
    snapshot: InventorySnapshot | null;
    snapshotExpired: boolean;
    itemsTotal: number;
    itemsAssessable: number;
    unsupportedEcosystems: string[];
    uncertainAdvisories: number;
    assessedAt: string;
    catalogSources: { provider: Provider; freshness: Freshness }[];
  };
  exposures: Exposure[];
  truncated: boolean;
  disclaimer: string;
}
export const EXPOSURE_DISCLAIMER =
  "Potential repository exposure compares DECLARED lockfile dependencies with public advisories. It is not proof of deployment, exploitability, compromise or an observed attack, and 'no match' is not a security guarantee.";
export interface ExternalOverview {
  schemaVersion: 1;
  sources: SourceView[];
  runs: RunView[];
  catalog: { advisories: number; kev: number; withdrawn: number };
  pendingSyncRequests: number;
  inventory: {
    configured: true;
    guardProducer: "not_integrated";
    snapshot: InventorySnapshot | null;
    expired: boolean;
  };
  disclaimer: string;
}

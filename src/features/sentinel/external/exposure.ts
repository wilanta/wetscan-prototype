import type { PlatformDatabase } from "../../../platform/database";
import type { SentinelScope } from "../types";
import { CatalogStore } from "./catalog-store";
import { freshnessOf } from "./status";
import {
  catalogLimits,
  EXPOSURE_DISCLAIMER,
  matchableEcosystems,
  severities,
  type CannotAssessReason,
  type Ecosystem,
  type Exposure,
  type ExposureReport,
  type ExposureSource,
  type InventorySnapshot,
  type Provider,
  type Severity,
  type VersionRange,
} from "./model";
import { InventoryStore } from "./inventory-store";
import { validInstalledVersion, versionMatches } from "./versions";

const CANDIDATE_CAP = 20000;
const cannot = (
  reason: CannotAssessReason,
  message: string,
  coverage: ExposureReport["coverage"],
): ExposureReport => ({
  assessment: "cannot_assess",
  reason,
  message: `Cannot assess project exposure: ${message}`,
  coverage,
  exposures: [],
  truncated: false,
  disclaimer: EXPOSURE_DISCLAIMER,
});
/**
 * Read-time exposure assessment (never persisted, so it cannot go stale). Every claim cites the exact advisory
 * assertion(s) and inventory snapshot. Missing/expired/unsupported evidence is `cannot_assess`, never "safe".
 */
export async function assessExposure(
  db: PlatformDatabase,
  scope: SentinelScope,
  now = new Date(),
): Promise<ExposureReport> {
  const inventory = new InventoryStore(db);
  const catalog = new CatalogStore(db);
  const snapshot = await inventory.latest(scope);
  const sources = (await catalog.sources()).map((s) => ({
    provider: s.provider as Provider,
    freshness: freshnessOf(s.provider, s.last_success_at, now),
  }));
  const coverageBase = (
    snap: InventorySnapshot | null,
    total = 0,
    assessable = 0,
    unsupported: string[] = [],
    uncertain = 0,
  ) => ({
    snapshot: snap,
    snapshotExpired: snap ? Date.parse(snap.expiresAt) <= now.getTime() : false,
    itemsTotal: total,
    itemsAssessable: assessable,
    unsupportedEcosystems: unsupported,
    uncertainAdvisories: uncertain,
    assessedAt: now.toISOString(),
    catalogSources: sources,
  });
  if (!snapshot)
    return cannot(
      "no_inventory",
      "no verified dependency inventory has been collected for this project. Collect a lockfile snapshot first.",
      coverageBase(null),
    );
  if (Date.parse(snapshot.expiresAt) <= now.getTime())
    return cannot(
      "inventory_expired",
      "the last inventory snapshot has expired. Collect a fresh lockfile snapshot.",
      coverageBase(snapshot, snapshot.itemCount),
    );
  if (!snapshot.itemCount)
    return cannot(
      "inventory_empty",
      "the inventory snapshot contains no dependencies.",
      coverageBase(snapshot),
    );
  const items = (await inventory.items(scope, snapshot.snapshotId)) as {
    ecosystem: Ecosystem;
    package_name: string;
    version: string;
    dep_scope: string;
  }[];
  const assessable = items.filter(
    (i) =>
      matchableEcosystems.includes(i.ecosystem) &&
      validInstalledVersion(i.ecosystem, i.version),
  );
  const unsupported = [
    ...new Set(
      items
        .filter((i) => !matchableEcosystems.includes(i.ecosystem))
        .map((i) => i.ecosystem),
    ),
  ];
  if (!assessable.length)
    return cannot(
      "no_assessable_ecosystem",
      "no declared dependency uses an ecosystem with supported version semantics.",
      coverageBase(snapshot, items.length, 0, unsupported),
    );
  if (
    !sources.some(
      (s) => s.provider !== "cisa_kev" && s.freshness !== "never_synced",
    )
  )
    return cannot(
      "advisory_data_unavailable",
      "no package-level advisory feed (GHSA/OSV) has synchronized yet.",
      coverageBase(snapshot, items.length, assessable.length, unsupported),
    );
  const candidates = await db.scoped(
    scope,
    async (tx) =>
      (
        await db.query(
          tx,
          `SELECT i.ecosystem,i.package_name,i.version,i.dep_scope,f.provider,f.source_id,f.ranges,f.versions,f.fixed,f.certainty,
          a.canonical_id,a.severity,a.source_url,a.modified_at,
          EXISTS(SELECT 1 FROM sentinel.ext_advisories k WHERE k.canonical_id=a.canonical_id AND k.provider='cisa_kev' AND k.status='active') AS kev
         FROM sentinel.ext_inventory_items i
         JOIN sentinel.ext_affected f ON f.ecosystem=i.ecosystem AND f.package_name=i.package_name
         JOIN sentinel.ext_advisories a ON a.provider=f.provider AND a.source_id=f.source_id AND a.status='active'
         WHERE i.mode=$1 AND i.workspace_id=$2 AND i.project_id=$3 AND i.snapshot_id=$4
         ORDER BY a.canonical_id,i.package_name,i.version,f.provider LIMIT ${CANDIDATE_CAP + 1}`,
          [scope.mode, scope.workspaceId, scope.projectId, snapshot.snapshotId],
        )
      ).rows,
  );
  const truncated = candidates.length > CANDIDATE_CAP;
  const groups = new Map<string, Exposure & { decided: (boolean | null)[] }>();
  for (const c of candidates.slice(0, CANDIDATE_CAP)) {
    if (
      !matchableEcosystems.includes(c.ecosystem) ||
      !validInstalledVersion(c.ecosystem, c.version)
    )
      continue;
    const m = versionMatches(c.ecosystem, c.version, {
      ranges: c.ranges as VersionRange[],
      versions: c.versions,
      certain: c.certainty === "verified",
    });
    const key = `${c.canonical_id}|${c.ecosystem}|${c.package_name}|${c.version}`;
    const g = groups.get(key) ?? {
      canonicalId: c.canonical_id,
      ecosystem: c.ecosystem,
      packageName: c.package_name,
      installedVersion: c.version,
      dependencyScope: c.dep_scope,
      kev: c.kev,
      topSeverity: "unknown" as Severity,
      conflicting: false,
      sources: [] as ExposureSource[],
      decided: [] as (boolean | null)[],
    };
    g.sources.push({
      provider: c.provider,
      sourceId: c.source_id,
      severity: c.severity,
      matched: m.matched === true,
      matchedRange: m.range,
      matchedVersion: m.matched === true ? c.version : null,
      fixedVersions: c.fixed,
      sourceUrl: c.source_url,
      modifiedAt: c.modified_at ? new Date(c.modified_at).toISOString() : null,
    });
    g.decided.push(m.matched);
    if (severities.indexOf(c.severity) > severities.indexOf(g.topSeverity))
      g.topSeverity = c.severity;
    groups.set(key, g);
  }
  const all = [...groups.values()];
  const exposures: Exposure[] = all
    .filter((g) => g.decided.includes(true))
    .map(({ decided, ...e }) => ({
      ...e,
      conflicting: decided.includes(false),
    }))
    .slice(0, catalogLimits.exposures);
  const uncertain = new Set(
    all
      .filter((g) => !g.decided.includes(true) && g.decided.includes(null))
      .map((g) => g.canonicalId),
  ).size;
  const coverage = coverageBase(
    snapshot,
    items.length,
    assessable.length,
    unsupported,
    uncertain,
  );
  const stale = sources.some(
    (s) => s.provider !== "cisa_kev" && s.freshness === "stale",
  );
  const caveat = [
    stale ? "Some advisory data is stale." : "",
    uncertain
      ? `${uncertain} advisory(ies) for installed packages have constraints that cannot be evaluated.`
      : "",
    unsupported.length ? `Not assessed: ${unsupported.join(", ")}.` : "",
  ]
    .filter(Boolean)
    .join(" ");
  return exposures.length
    ? {
        assessment: "potential_exposure",
        reason: null,
        message:
          `${exposures.length} potential repository exposure(s): declared lockfile dependencies match public advisories. ${caveat}`.trim(),
        coverage,
        exposures,
        truncated:
          truncated ||
          all.filter((g) => g.decided.includes(true)).length > exposures.length,
        disclaimer: EXPOSURE_DISCLAIMER,
      }
    : {
        assessment: "no_match_within_coverage",
        reason: null,
        message:
          `No synced advisory matches the declared dependencies of this snapshot. This is not a security guarantee. ${caveat}`.trim(),
        coverage,
        exposures: [],
        truncated,
        disclaimer: EXPOSURE_DISCLAIMER,
      };
}

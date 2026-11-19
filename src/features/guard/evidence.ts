import type {
  Engine,
  Evidence,
  Finding,
  Location,
  Provenance,
  RetestResult,
  Scope,
  Severity,
} from "./contracts";
import {
  array,
  digest,
  GuardError,
  positiveInteger,
  record,
  redact,
  safePath,
  text,
} from "./security";
export interface NormalizationContext extends Scope {
  commit: string;
  recordedAt: string;
  artifactDigest: string;
  synthetic: boolean;
  scannerVersion: string;
  rulePack: string;
}
async function finding(
  ctx: NormalizationContext,
  engine: Engine,
  ruleId: string,
  severity: Severity,
  location: Location,
  title: string,
  summary: string,
): Promise<Finding> {
  const source: Provenance = {
    engine,
    scanner: {
      sast: "opengrep",
      sca: "osv-scanner",
      secrets: "gitleaks",
      iac: "trivy",
      container: "trivy",
      sbom: "trivy",
      dast: "zap",
      api: "api",
      integrity: "integrity",
    }[engine],
    version: ctx.scannerVersion,
    ruleId: redact(ruleId),
    rulePack: ctx.rulePack,
  };
  const id = await digest(
    JSON.stringify([
      ctx.workspaceId,
      ctx.projectId,
      ctx.mode,
      engine,
      ruleId,
      location.path ?? "",
      location.line ?? "",
      location.package ?? "",
      location.endpoint ?? "",
    ]),
  );
  const evidence: Evidence = {
    id: await digest(JSON.stringify([id, ctx.commit, ctx.artifactDigest])),
    commit: ctx.commit,
    recordedAt: ctx.recordedAt,
    summary: redact(summary),
    artifactDigest: ctx.artifactDigest,
    synthetic: ctx.synthetic,
  };
  return {
    workspaceId: ctx.workspaceId,
    projectId: ctx.projectId,
    mode: ctx.mode,
    id,
    title: redact(title),
    severity,
    confidence: "medium",
    status: "potential",
    source,
    location,
    evidence: [evidence],
  };
}
function severity(input: unknown): Severity {
  switch (text(input).toUpperCase()) {
    case "CRITICAL":
      return "critical";
    case "ERROR":
    case "HIGH":
      return "high";
    case "WARNING":
    case "MEDIUM":
      return "medium";
    case "LOW":
      return "low";
    case "INFO":
    case "INFORMATIONAL":
      return "info";
    default:
      throw new GuardError("invalid_input", "Unrecognized severity.");
  }
}
/** External JSON boundary. Never retain source excerpts or matched secrets. */
export async function normalizeOpengrep(
  input: unknown,
  ctx: NormalizationContext,
): Promise<Finding[]> {
  const root = record(input),
    results = array(root.results);
  if (root.errors !== undefined && array(root.errors).length)
    throw new GuardError(
      "invalid_input",
      "Scanner reported parse or execution errors; coverage is incomplete.",
    );
  return Promise.all(
    results.map(async (value) => {
      const row = record(value),
        extra = record(row.extra),
        start = record(row.start);
      return finding(
        ctx,
        "sast",
        text(row.check_id),
        severity(extra.severity),
        { path: safePath(text(row.path)), line: positiveInteger(start.line) },
        text(extra.message, 4000),
        "Static rule matched this location. Review code and reachability; exploitation is not verified.",
      );
    }),
  );
}
export async function normalizeGitleaks(
  input: unknown,
  ctx: NormalizationContext,
): Promise<Finding[]> {
  return Promise.all(
    array(input).map((value) => {
      const row = record(value);
      return finding(
        ctx,
        "secrets",
        text(row.RuleID),
        "high",
        {
          path: safePath(text(row.File)),
          line: positiveInteger(row.StartLine),
        },
        "Potential exposed credential",
        "Matched value intentionally omitted. Rotate any real credential and review history.",
      );
    }),
  );
}
export async function normalizeOSV(
  input: unknown,
  ctx: NormalizationContext,
): Promise<Finding[]> {
  const findings: Finding[] = [];
  for (const resultValue of array(record(input).results)) {
    const result = record(resultValue),
      source = record(result.source),
      path = safePath(text(source.path));
    for (const packageValue of array(result.packages)) {
      const pkg = record(packageValue),
        info = record(pkg.package);
      for (const vulnerability of array(pkg.vulnerabilities ?? [])) {
        const vuln = record(vulnerability);
        findings.push({
          ...(await finding(
            ctx,
            "sca",
            text(vuln.id),
            "medium",
            {
              path,
              package: text(info.name),
              installedVersion: text(info.version),
            },
            "Dependency advisory: " + text(vuln.id),
            "OSV advisory matched an installed package. Severity is conservative pending advisory/CVSS review; reachability is not verified.",
          )),
          severityKnown: false,
          advisory: {
            id: redact(text(vuln.id)),
            ecosystem:
              info.ecosystem == null ? "UNKNOWN" : redact(text(info.ecosystem)),
            aliases: [
              ...new Set(
                array(vuln.aliases ?? [])
                  .slice(0, 50)
                  .map((v) => redact(text(v, 200))),
              ),
            ],
            fixedVersions: [
              ...new Set(
                array(vuln.affected ?? []).flatMap((a) => {
                  const affected = record(a),
                    p = record(affected.package ?? {});
                  if (p.name !== info.name || p.ecosystem !== info.ecosystem)
                    return [];
                  return array(affected.ranges ?? []).flatMap((r) =>
                    array(record(r).events ?? []).flatMap((e) => {
                      const fixed = record(e).fixed;
                      return typeof fixed === "string" && fixed !== "0"
                        ? [redact(text(fixed, 128))]
                        : [];
                    }),
                  );
                }),
              ),
            ].slice(0, 50),
            cvss: array(vuln.severity ?? [])
              .slice(0, 10)
              .flatMap((v) => {
                const row = record(v);
                return typeof row.type === "string" &&
                  /^CVSS_V[234]$/.test(row.type) &&
                  typeof row.score === "string" &&
                  /^CVSS:[234]\.[0-9]\//.test(row.score)
                  ? [{ type: row.type, vector: redact(text(row.score, 500)) }]
                  : [];
              }),
          },
        });
      }
    }
  }
  return findings;
}
export async function normalizeTrivy(
  input: unknown,
  ctx: NormalizationContext,
  engine: "iac" | "container",
): Promise<Finding[]> {
  const findings: Finding[] = [];
  for (const resultValue of array(record(input).Results)) {
    const row = record(resultValue),
      path = safePath(text(row.Target));
    for (const entry of array(
      engine === "iac"
        ? (row.Misconfigurations ?? [])
        : (row.Vulnerabilities ?? []),
    )) {
      const item = record(entry);
      findings.push(
        await finding(
          ctx,
          engine,
          text(engine === "iac" ? item.ID : item.VulnerabilityID),
          severity(item.Severity),
          {
            path,
            ...(engine === "container"
              ? {
                  package: text(item.PkgName),
                  installedVersion: text(item.InstalledVersion),
                }
              : {}),
          },
          item.Title === undefined
            ? "Scanner configuration/advisory match"
            : text(item.Title, 4000),
          "Review this scanner finding in the authorized scope. No exploit was executed.",
        ),
      );
    }
  }
  return findings;
}
/** Preserve scanner provenance, locations and severity conflicts. */
export function deduplicate(findings: Finding[]): Finding[] {
  const rows = new Map<string, Finding>();
  for (const f of findings) {
    const key = JSON.stringify([
      f.workspaceId,
      f.projectId,
      f.mode,
      f.id,
      f.source,
      f.severity,
      f.location,
    ]);
    const previous = rows.get(key);
    rows.set(
      key,
      previous
        ? {
            ...previous,
            evidence: [
              ...new Map(
                [...previous.evidence, ...f.evidence].map((e) => [e.id, e]),
              ).values(),
            ],
          }
        : structuredClone(f),
    );
  }
  return [...rows.values()];
}
export function applyRetest(finding: Finding, result: RetestResult): Finding {
  if (
    result.findingId !== finding.id ||
    !finding.evidence.some((e) => e.commit === result.beforeCommit)
  )
    throw new GuardError(
      "evidence_required",
      "Retest must reference the original finding and version.",
    );
  if (result.outcome !== "verified_fixed") return finding;
  if (
    !result.engineCompleted ||
    !result.targeted ||
    !result.expected ||
    result.expected !== result.observed ||
    !result.evidence ||
    !result.evidence.artifactDigest ||
    result.evidence.commit !== result.afterCommit ||
    !result.afterCommit ||
    result.afterCommit === result.beforeCommit ||
    result.evidence.synthetic !== finding.evidence[0]?.synthetic
  )
    throw new GuardError(
      "evidence_required",
      "Targeted before/after evidence is required to verify a fix.",
    );
  return {
    ...finding,
    status: "verified_fixed",
    evidence: [...finding.evidence, result.evidence],
  };
}
export function guidance(finding: Finding): string {
  return finding.source.engine === "secrets"
    ? "Revoke and rotate the credential. Remove it from source/history after assessing exposure. Retest without displaying the matched value."
    : finding.source.engine === "sca"
      ? "Review the advisory and compatible fixed version. Update the lockfile, test behavior, and run a scoped dependency retest."
      : "Review the scanner rule and affected location. Validate authorization/input handling in a controlled test, propose a minimal patch, then record a targeted retest.";
}

/** Inventory comes from scanner output, not a fabricated dependency catalogue. */
export function normalizeOSVInventory(
  input: unknown,
): import("./contracts").InventoryItem[] {
  const rows = new Map<string, import("./contracts").InventoryItem>();
  for (const resultValue of array(record(input).results)) {
    const result = record(resultValue),
      sourcePath = safePath(text(record(result.source).path));
    for (const packageValue of array(result.packages)) {
      const pkg = record(packageValue),
        info = record(pkg.package);
      const licenses =
        pkg.licenses == null
          ? []
          : array(pkg.licenses).map((value) => text(value));
      const item = {
        name: text(info.name),
        version: text(info.version),
        ecosystem: text(info.ecosystem),
        license: licenses.length ? licenses.join(" AND ") : null,
        sourcePath,
      };
      rows.set(
        JSON.stringify([item.name, item.version, item.ecosystem, sourcePath]),
        item,
      );
    }
  }
  return [...rows.values()];
}

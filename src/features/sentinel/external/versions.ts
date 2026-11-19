import type { Ecosystem, VersionRange } from "./model";

/**
 * Per-ecosystem version semantics. Every comparator returns `null` for an unparsable operand so callers can
 * report `cannot_assess` instead of guessing. Generic string comparison is never used.
 */
type Cmp = (a: string, b: string) => number | null;

// ---- SemVer 2.0 (npm, crates.io, Go modules) ----
interface Semver {
  core: [number, number, number];
  pre: string[];
}
const semverRe =
  /^v?(\d{1,15})(?:\.(\d{1,15}))?(?:\.(\d{1,15}))?(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
function parseSemver(v: string, padBound: boolean): Semver | null {
  const m = semverRe.exec(v.trim());
  if (!m) return null;
  // Installed versions must be complete; only range bounds may omit minor/patch (">= 4.0" = 4.0.0).
  if (!padBound && (m[2] === undefined || m[3] === undefined)) return null;
  const pre = m[4]?.split(".") ?? [];
  if (pre.some((p) => /^\d+$/.test(p) && p.length > 1 && p.startsWith("0")))
    return null;
  return { core: [Number(m[1]), Number(m[2] ?? 0), Number(m[3] ?? 0)], pre };
}
function cmpSemver(a: Semver, b: Semver) {
  for (let i = 0; i < 3; i++)
    if (a.core[i] !== b.core[i]) return a.core[i] < b.core[i] ? -1 : 1;
  if (!a.pre.length || !b.pre.length)
    return a.pre.length === b.pre.length ? 0 : a.pre.length ? -1 : 1;
  for (let i = 0; i < Math.max(a.pre.length, b.pre.length); i++) {
    const x = a.pre[i],
      y = b.pre[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    if (x === y) continue;
    const xn = /^\d+$/.test(x),
      yn = /^\d+$/.test(y);
    if (xn && yn) return Number(x) < Number(y) ? -1 : 1;
    if (xn !== yn) return xn ? -1 : 1;
    return x < y ? -1 : 1;
  }
  return 0;
}
const semver: Cmp = (a, b) => {
  const x = parseSemver(a, true),
    y = parseSemver(b, true);
  return x && y ? cmpSemver(x, y) : null;
};

// ---- PEP 440 (PyPI) ----
const pepRe =
  /^v?(?:(\d+)!)?(\d+(?:\.\d+)*)(?:[-_.]?(alpha|beta|preview|pre|rc|a|b|c)[-_.]?(\d+)?)?(?:-(\d+)|[-_.]?(post|rev|r)[-_.]?(\d+)?)?(?:[-_.]?(dev)[-_.]?(\d+)?)?(?:\+([a-z0-9]+(?:[-_.][a-z0-9]+)*))?$/i;
const preRank: Record<string, number> = { a: 0, b: 1, c: 2 };
const preName = (s: string) => {
  const l = s.toLowerCase();
  return l === "alpha"
    ? "a"
    : l === "beta"
      ? "b"
      : ["rc", "c", "pre", "preview"].includes(l)
        ? "c"
        : l;
};
interface Pep {
  epoch: number;
  release: number[];
  pre: [number, number] | null;
  post: number | null;
  dev: number | null;
  local: (number | string)[] | null;
}
function parsePep(v: string): Pep | null {
  const m = pepRe.exec(v.trim());
  if (!m) return null;
  const release = m[2].split(".").map(Number);
  if (release.some((n) => !Number.isSafeInteger(n))) return null;
  while (release.length > 1 && release.at(-1) === 0) release.pop();
  return {
    epoch: Number(m[1] ?? 0),
    release,
    pre: m[3] ? [preRank[preName(m[3])], Number(m[4] ?? 0)] : null,
    post: m[5] !== undefined ? Number(m[5]) : m[6] ? Number(m[7] ?? 0) : null,
    dev: m[8] ? Number(m[9] ?? 0) : null,
    local: m[10]
      ? m[10]
          .split(/[-_.]/)
          .map((s) => (/^\d+$/.test(s) ? Number(s) : s.toLowerCase()))
      : null,
  };
}
const num = (a: number, b: number) => (a === b ? 0 : a < b ? -1 : 1);
function cmpPep(a: Pep, b: Pep) {
  let r = num(a.epoch, b.epoch);
  if (r) return r;
  for (let i = 0; i < Math.max(a.release.length, b.release.length); i++)
    if ((r = num(a.release[i] ?? 0, b.release[i] ?? 0))) return r;
  // A bare .devN sorts before any pre-release; no pre-release sorts after every pre-release.
  const preKey = (p: Pep): [number, number] =>
    !p.pre && p.post === null && p.dev !== null
      ? [-1, 0]
      : !p.pre
        ? [9, 0]
        : p.pre;
  const pa = preKey(a),
    pb = preKey(b);
  if ((r = num(pa[0], pb[0])) || (r = num(pa[1], pb[1]))) return r;
  if ((r = num(a.post ?? -1, b.post ?? -1))) return r;
  if ((r = num(a.dev ?? Infinity, b.dev ?? Infinity))) return r;
  if (!a.local || !b.local) return a.local === b.local ? 0 : a.local ? 1 : -1;
  for (let i = 0; i < Math.max(a.local.length, b.local.length); i++) {
    const x = a.local[i],
      y = b.local[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    if (x === y) continue;
    if (typeof x === typeof y) return x < y ? -1 : 1;
    return typeof x === "number" ? 1 : -1;
  }
  return 0;
}
const pep440: Cmp = (a, b) => {
  const x = parsePep(a),
    y = parsePep(b);
  return x && y ? cmpPep(x, y) : null;
};

const comparators: Partial<Record<Ecosystem, Cmp>> = {
  npm: semver,
  "crates.io": semver,
  go: semver,
  pypi: pep440,
};
export const hasVersionSemantics = (e: Ecosystem) => e in comparators;
export function compareVersions(
  ecosystem: Ecosystem,
  a: string,
  b: string,
): number | null {
  return comparators[ecosystem]?.(a, b) ?? null;
}
/** Installed versions must be complete and valid for their ecosystem (stricter than range bounds). */
export function validInstalledVersion(ecosystem: Ecosystem, v: string) {
  if (ecosystem === "pypi") return parsePep(v) !== null;
  return hasVersionSemantics(ecosystem) && parseSemver(v, false) !== null;
}

// ---- Range construction ----
const zero = (v: string | null) => v === null || v === "0" || v === "0.0.0";
export function osvRanges(
  ecosystem: Ecosystem,
  ranges: unknown,
): { ranges: VersionRange[]; certain: boolean } {
  const out: VersionRange[] = [];
  let certain = true;
  if (!Array.isArray(ranges)) return { ranges: out, certain: false };
  for (const r of ranges) {
    const type = (r as { type?: unknown })?.type;
    const events = (r as { events?: unknown })?.events;
    if (
      !["SEMVER", "ECOSYSTEM"].includes(type as string) ||
      !Array.isArray(events)
    ) {
      certain = false; // GIT commit ranges cannot be compared against package versions.
      continue;
    }
    const parsed: { kind: string; v: string }[] = [];
    for (const e of events) {
      const entry = Object.entries((e ?? {}) as Record<string, unknown>)[0];
      if (!entry || typeof entry[1] !== "string" || entry[1].length > 128) {
        certain = false;
        continue;
      }
      if (entry[0] === "limit") continue;
      if (!["introduced", "fixed", "last_affected"].includes(entry[0])) {
        certain = false;
        continue;
      }
      parsed.push({ kind: entry[0], v: entry[1] });
    }
    // Stable sort by the ecosystem comparator ("0" first); an incomparable event makes the whole range uncertain.
    let comparable = true;
    const rank = (v: string) => (zero(v) ? -1 : 0);
    parsed.sort((x, y) => {
      if (zero(x.v) || zero(y.v)) return rank(x.v) - rank(y.v);
      const c = compareVersions(ecosystem, x.v, y.v);
      if (c === null) comparable = false;
      return c ?? 0;
    });
    if (!comparable && hasVersionSemantics(ecosystem)) {
      certain = false;
      continue;
    }
    let open: string | null | undefined;
    for (const e of parsed) {
      if (e.kind === "introduced") open = e.v;
      else if (open !== undefined) {
        out.push({
          introduced: open,
          fixed: e.kind === "fixed" ? e.v : null,
          lastAffected: e.kind === "last_affected" ? e.v : null,
        });
        open = undefined;
      }
    }
    if (open !== undefined)
      out.push({ introduced: open, fixed: null, lastAffected: null });
  }
  return { ranges: out.slice(0, 50), certain };
}
/** GHSA `vulnerable_version_range`: comma-separated comparators. Unsupported shapes are reported, never guessed. */
export function ghsaRange(text: unknown): {
  ranges: VersionRange[];
  versions: string[];
  certain: boolean;
} {
  const bad = { ranges: [], versions: [], certain: false };
  if (typeof text !== "string" || !text.trim() || text.length > 200) return bad;
  let introduced: string | null = null,
    fixed: string | null = null,
    last: string | null = null;
  const versions: string[] = [];
  for (const part of text.split(",")) {
    const m = /^\s*(>=|<=|>|<|=)?\s*(\S+)\s*$/.exec(part);
    if (!m) return bad;
    const [, op = "=", v] = m;
    if (op === "=") versions.push(v);
    else if (op === ">=" && introduced === null) introduced = v;
    else if (op === "<" && fixed === null && last === null) fixed = v;
    else if (op === "<=" && fixed === null && last === null) last = v;
    else return bad; // exclusive lower bound or duplicated bound is not expressible
  }
  if (versions.length && (introduced || fixed || last)) return bad;
  return {
    ranges:
      introduced || fixed || last
        ? [{ introduced: introduced ?? "0", fixed, lastAffected: last }]
        : [],
    versions,
    certain: true,
  };
}
/** `true` affected, `false` not affected, `null` cannot decide (unparsable or unsupported). */
export function versionMatches(
  ecosystem: Ecosystem,
  version: string,
  entry: { ranges: VersionRange[]; versions: string[]; certain: boolean },
): { matched: boolean | null; range: VersionRange | null } {
  if (
    !hasVersionSemantics(ecosystem) ||
    !validInstalledVersion(ecosystem, version)
  )
    return { matched: null, range: null };
  let undecided = false;
  for (const v of entry.versions) {
    const c = compareVersions(ecosystem, version, v);
    if (c === 0) return { matched: true, range: null };
    if (c === null) undecided = true;
  }
  for (const r of entry.ranges) {
    const lower = zero(r.introduced)
      ? 0
      : compareVersions(ecosystem, version, r.introduced!);
    const upperBound = r.fixed ?? r.lastAffected;
    const upper =
      upperBound === null
        ? -1
        : compareVersions(ecosystem, version, upperBound);
    if (lower === null || upper === null) {
      undecided = true;
      continue;
    }
    if (
      lower >= 0 &&
      (r.fixed !== null
        ? upper < 0
        : r.lastAffected !== null
          ? upper <= 0
          : true)
    )
      return { matched: true, range: r };
  }
  // Incomplete knowledge (undecided comparisons or an unparsed constraint) never becomes "not affected".
  return { matched: undecided || !entry.certain ? null : false, range: null };
}

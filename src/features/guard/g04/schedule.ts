/** Bounded schedule maths (UTC). No scheduler framework: a durable row + a bounded poll in the dispatcher is enough. */
export const MIN_INTERVAL_MINUTES = 60;
export const MAX_INTERVAL_MINUTES = 10080;
export type Cadence = { kind: "interval"; minutes: number } | { kind: "cron"; expr: string };
export class ScheduleError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}
const fieldRanges: [number, number][] = [[0, 59], [0, 23], [1, 31], [1, 12], [0, 6]];
function field(src: string, [lo, hi]: [number, number]): Set<number> {
  const out = new Set<number>();
  for (const part of src.split(",")) {
    const m = /^(?:\*|(\d{1,2})(?:-(\d{1,2}))?)(?:\/(\d{1,2}))?$/.exec(part);
    if (!m) throw new ScheduleError("cron_invalid");
    const step = m[3] === undefined ? 1 : Number(m[3]);
    const a = m[1] === undefined ? lo : Number(m[1]),
      b = m[2] !== undefined ? Number(m[2]) : m[1] !== undefined && m[3] === undefined ? a : hi;
    if (step < 1 || a < lo || b > hi || a > b) throw new ScheduleError("cron_invalid");
    for (let v = a; v <= b; v += step) out.add(v);
  }
  return out;
}
/** 5 fields (minute hour day-of-month month day-of-week), numbers/ranges/lists/steps only, UTC. */
export function parseCron(expr: string) {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5 || expr.length > 100) throw new ScheduleError("cron_invalid");
  const f = parts.map((p, i) => field(p, fieldRanges[i]));
  const sets = { min: f[0], hour: f[1], dom: f[2], mon: f[3], dow: f[4], domStar: parts[2] === "*", dowStar: parts[4] === "*" };
  return sets;
}
export function validateCadence(c: unknown): Cadence {
  if (!c || typeof c !== "object") throw new ScheduleError("cadence_invalid");
  const v = c as Record<string, unknown>;
  if (v.kind === "interval" && Object.keys(v).length === 2 && Number.isInteger(v.minutes) && (v.minutes as number) >= MIN_INTERVAL_MINUTES && (v.minutes as number) <= MAX_INTERVAL_MINUTES) return { kind: "interval", minutes: v.minutes as number };
  if (v.kind === "cron" && Object.keys(v).length === 2 && typeof v.expr === "string") {
    const cadence: Cadence = { kind: "cron", expr: v.expr.trim().replace(/\s+/g, " ") };
    // Same floor as intervals: sample consecutive runs from fixed anchors; any gap under the floor is a scan-storm risk.
    for (const anchor of [Date.UTC(2026, 0, 1), Date.UTC(2026, 5, 15, 13, 7)]) {
      let prev = nextRun(cadence, anchor);
      for (let i = 0; i < 48; i++) {
        const n = nextRun(cadence, prev);
        if (n - prev < MIN_INTERVAL_MINUTES * 60000) throw new ScheduleError("cron_too_frequent");
        prev = n;
      }
    }
    return cadence;
  }
  throw new ScheduleError("cadence_invalid");
}
/** Next run strictly after `after` (epoch ms). Cron search is bounded to one year so a bad expression cannot loop. */
export function nextRun(c: Cadence, after: number): number {
  if (c.kind === "interval") return after + c.minutes * 60000;
  const s = parseCron(c.expr),
    t = new Date(Math.floor(after / 60000) * 60000 + 60000);
  for (let i = 0; i < 366 * 24 * 60; i++, t.setUTCMinutes(t.getUTCMinutes() + 1)) {
    if (!s.mon.has(t.getUTCMonth() + 1) || !s.hour.has(t.getUTCHours()) || !s.min.has(t.getUTCMinutes())) continue;
    const dom = s.dom.has(t.getUTCDate()),
      dow = s.dow.has(t.getUTCDay());
    // Standard cron: when both day fields are restricted either may match.
    if (s.domStar && s.dowStar ? true : s.domStar ? dow : s.dowStar ? dom : dom || dow) return t.getTime();
  }
  throw new ScheduleError("cron_never_fires");
}

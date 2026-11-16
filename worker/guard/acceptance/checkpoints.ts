import { LiveGuardError } from "../../../src/features/guard/live/model";
import type { CaseId } from "./catalog";
export type Checkpoint =
  | "resolved"
  | "partial_source"
  | "acquired"
  | "container_started"
  | "container_remove"
  | "source_remove"
  | "claimed"
  | "before_write";
const allowed: Partial<Record<CaseId, Checkpoint[]>> = {
  N01: ["acquired"],
  N02: ["container_started"],
  N03: ["container_started"],
  N04: ["resolved"],
  N06: ["partial_source"],
  N07: ["container_remove"],
  N08: ["source_remove"],
  C01: ["container_started", "claimed", "before_write"],
  C02A: ["container_started", "claimed"],
};
/** One-shot private coordinator; no browser-provided code/path/delay, no fake clock at runtime. */
export class Checkpoints {
  private readonly fired = new Set<Checkpoint>();
  constructor(
    readonly caseId: CaseId,
    private readonly effect: (
      point: Checkpoint,
      signal: AbortSignal,
    ) => Promise<void>,
  ) {}
  enabled(point: Checkpoint) {
    return !!allowed[this.caseId]?.includes(point);
  }
  async reach(point: Checkpoint, signal: AbortSignal) {
    if (signal.aborted) throw new LiveGuardError("source_unavailable");
    if (!allowed[this.caseId]?.includes(point) || this.fired.has(point)) return;
    this.fired.add(point);
    await this.effect(point, signal);
    if (signal.aborted) throw new LiveGuardError("source_unavailable");
  }
}
export function waitForAbort(signal: AbortSignal) {
  return new Promise<never>((_, reject) => {
    const stop = () => reject(new LiveGuardError("source_unavailable"));
    if (signal.aborted) stop();
    else signal.addEventListener("abort", stop, { once: true });
  });
}

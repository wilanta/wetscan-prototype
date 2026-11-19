import { LiveGuardError } from "../../src/features/guard/live/model";
/** Volatile authorization capabilities, durable jobs. No session/token is serialized or logged. */
export class ProductScheduler {
  private active = new Map<string, Promise<void>>();
  private waiting = new Set<string>();
  private tail: Promise<void> = Promise.resolve();
  private quarantined = false;
  assertReady() {
    if (this.quarantined || this.waiting.size >= 32)
      throw new LiveGuardError("execution_not_ready");
  }
  schedule(
    key: string,
    work: () => Promise<void>,
    defer: (task: () => Promise<void>) => void,
  ) {
    this.assertReady();
    if (this.waiting.has(key) || this.active.has(key)) return;
    this.waiting.add(key);
    try {
      defer(async () => {
        const prior = this.tail;
        let release!: () => void;
        this.tail = new Promise<void>((r) => {
          release = r;
        });
        const task = (async () => {
          await prior;
          this.waiting.delete(key);
          try {
            if (this.quarantined) throw new LiveGuardError("cleanup_failed");
            await work();
          } catch (error) {
            if (
              error instanceof LiveGuardError &&
              error.code === "cleanup_failed"
            )
              this.quarantined = true;
            throw error;
          } finally {
            release();
          }
        })();
        this.active.set(key, task);
        try {
          await task;
        } catch {
          /* Fixed health only; never print session, source, SQL or driver errors. */
        } finally {
          this.active.delete(key);
        }
      });
    } catch (error) {
      this.waiting.delete(key);
      throw error;
    }
  }
  status() {
    return {
      pending: this.waiting.size,
      running: this.active.size,
      quarantined: this.quarantined,
    };
  }
}

import pg from "pg";

/**
 * Disposable-database harnesses drop their database with `DROP DATABASE ... WITH (FORCE)`, which makes the server
 * terminate any idle pooled connection (SQLSTATE 57P01). pg emits that as an 'error' event on the pool; with no
 * listener Node treats it as an uncaught exception and vitest fails an otherwise green run (observed on the first
 * GitHub-hosted run). Only teardown-class errors are tolerated here; every other pool error still throws.
 */
const TEARDOWN = new Set(["57P01", "ECONNRESET", "EPIPE"]);
const Original = pg.Pool;
class GuardedPool extends Original {
  constructor(config?: ConstructorParameters<typeof Original>[0]) {
    super(config);
    this.on("error", (error: Error & { code?: string }) => {
      if (!TEARDOWN.has(error.code ?? "")) throw error;
    });
  }
}
(pg as { Pool: typeof Original }).Pool = GuardedPool as typeof Original;

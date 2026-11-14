import { randomUUID } from "node:crypto";
import pg from "pg";
import type { QueryResultRow } from "pg";
import type {
  PlatformModule,
  TransactionContext,
  TransactionPort,
} from "../features/sentinel/platform-contracts";
import type { SentinelScope } from "../features/sentinel/types";
import { assertSameScope, scopeKey } from "../features/sentinel/scope";
import { PlatformError, type ApprovedDatabaseConfig } from "./config";

export interface SqlClient {
  query<R extends QueryResultRow = QueryResultRow>(
    sql: string,
    values?: unknown[],
  ): Promise<{ rows: R[]; rowCount: number | null }>;
  release(destroy?: boolean): void;
}
export interface SqlPool {
  connect(): Promise<SqlClient>;
  end(): Promise<void>;
}
export class ApprovedPool implements SqlPool {
  private readonly pool: pg.Pool;
  constructor(private readonly config: ApprovedDatabaseConfig) {
    this.pool = new pg.Pool({
      host: config.target.host,
      port: config.target.port,
      database: config.target.database,
      user: config.user,
      password: config.password,
      ssl: false,
      max: config.max,
      connectionTimeoutMillis: 3000,
      idleTimeoutMillis: 10000,
      statement_timeout: 5000,
      query_timeout: 8000,
      idle_in_transaction_session_timeout: 10000,
      application_name: `wetscan-sentinel-${config.purpose}`,
      allowExitOnIdle: true,
    });
    this.pool.on("error", () => {
      /* Checked-out operations/health report errors without secret-bearing driver messages. */
    });
  }
  async connect(): Promise<SqlClient> {
    const client = await this.pool.connect();
    try {
      const result =
        await client.query(`SELECT current_database() AS database, current_user AS username,
        shobj_description(d.oid, 'pg_database') AS marker, r.rolsuper, r.rolbypassrls,
        current_setting('server_version_num')::int AS version FROM pg_database d JOIN pg_roles r ON r.rolname=current_user
        WHERE d.datname=current_database()`);
      const row = result.rows[0];
      if (
        !row ||
        row.database !== this.config.target.database ||
        row.username !== this.config.user ||
        row.marker !== this.config.target.marker ||
        row.rolsuper ||
        row.rolbypassrls ||
        row.version < 170000
      )
        throw new PlatformError("target_denied");
      return client as SqlClient;
    } catch {
      client.release(true);
      throw new PlatformError("target_denied");
    }
  }
  end() {
    return this.pool.end();
  }
}
type Active = { client: SqlClient; scope?: SentinelScope; worker: boolean };
export class PlatformDatabase implements TransactionPort {
  private readonly active = new WeakMap<TransactionContext, Active>();
  constructor(
    readonly pool: SqlPool,
    readonly worker = false,
    readonly module: PlatformModule = "sentinel",
  ) {}
  transaction<T>(work: (tx: TransactionContext) => Promise<T>): Promise<T> {
    return this.run(undefined, work);
  }
  scoped<T>(
    scope: SentinelScope,
    work: (tx: TransactionContext) => Promise<T>,
  ): Promise<T> {
    scopeKey(scope);
    if (scope.mode !== "live") throw new PlatformError("scope_denied");
    return this.run({ ...scope }, work);
  }
  private async run<T>(
    scope: SentinelScope | undefined,
    work: (tx: TransactionContext) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    const tx = Object.freeze({ transactionId: randomUUID() });
    let destroy = false;
    try {
      await client.query("BEGIN");
      await client.query(
        `SELECT set_config('wetscan.workspace', $1, true), set_config('wetscan.project', $2, true),
        set_config('wetscan.mode', $3, true), set_config('wetscan.module', $4, true)`,
        [
          scope?.workspaceId ?? "",
          scope?.projectId ?? "",
          scope?.mode ?? "",
          this.module,
        ],
      );
      this.active.set(tx, { client, scope, worker: this.worker });
      const value = await work(tx);
      await client.query("COMMIT");
      return value;
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {
        destroy = true;
      }
      throw error;
    } finally {
      this.active.delete(tx);
      client.release(destroy);
    }
  }
  private context(tx: TransactionContext) {
    const context = this.active.get(tx);
    if (!context) throw new PlatformError("scope_denied");
    return context;
  }
  requireScope(tx: TransactionContext, scope: SentinelScope) {
    const actual = this.context(tx).scope;
    if (!actual) throw new PlatformError("scope_denied");
    assertSameScope(actual, scope);
  }
  requireWorker(tx: TransactionContext) {
    if (!this.context(tx).worker) throw new PlatformError("scope_denied");
  }
  query<R extends QueryResultRow = QueryResultRow>(
    tx: TransactionContext,
    sql: string,
    values: unknown[] = [],
  ) {
    return this.context(tx).client.query<R>(sql, values);
  }
}

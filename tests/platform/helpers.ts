import type { QueryResultRow } from "pg";
import type { SqlClient, SqlPool } from "../../src/platform/database";
import { vi } from "vitest";
export class RecordingClient implements SqlClient {
  authorizedProject?: string;
  calls: { sql: string; values: unknown[] }[] = [];
  release = vi.fn();
  respond: (
    sql: string,
    values: unknown[],
  ) => Promise<{ rows: QueryResultRow[]; rowCount: number | null }> =
    async () => ({ rows: [], rowCount: 0 });
  async query<R extends QueryResultRow = QueryResultRow>(
    sql: string,
    values: unknown[] = [],
  ) {
    this.calls.push({ sql, values });
    if (
      this.authorizedProject &&
      sql.startsWith("SELECT project_id FROM sentinel.project_bindings") &&
      sql.includes("FOR UPDATE")
    )
      return {
        rows: [{ project_id: this.authorizedProject }] as unknown as R[],
        rowCount: 1,
      };
    return (await this.respond(sql, values)) as {
      rows: R[];
      rowCount: number | null;
    };
  }
}
export function fakePool(client: RecordingClient): SqlPool {
  return { connect: vi.fn(async () => client), end: vi.fn(async () => {}) };
}
export const scope = {
  mode: "live" as const,
  workspaceId: "github-user-7:fixture",
  projectId: "github-123",
};
export const job = () => ({
  ...scope,
  schemaVersion: 1 as const,
  module: "sentinel" as const,
  jobId: "job-1",
  kind: "sentinel.maintenance",
  subjectRef: "project-maintenance",
  idempotencyKey: "request-1",
  revision: 1,
  attempts: 0,
  maxAttempts: 3,
  availableAt: "2026-11-14T00:00:00Z",
  cancelRequested: false,
});
export const lease = () => ({
  job: { ...job(), revision: 2, attempts: 1 },
  workerId: "worker-test",
  leaseToken: "1:fixture-token",
  expiresAt: new Date(Date.now() + 30000).toISOString(),
});

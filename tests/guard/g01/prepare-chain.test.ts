import { EventEmitter } from "node:events";
import { createHash } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import { expect, it, vi } from "vitest";
import {
  GuardSessionBroker,
  ipcWorkerResolver,
} from "../../../worker/guard/auth-broker";
import {
  attachGuardBroker,
  type GuardIpcPort,
} from "../../../worker/guard/ipc";
import { prepareGuardJob } from "../../../worker/guard/prepare";
import { GuardSnapshotAdapter } from "../../../src/features/guard/live/snapshot";
import { PostgresGuardStore } from "../../../src/features/guard/live/persistence";
import { PlatformDatabase } from "../../../src/platform/database";
import { fingerprint } from "../../../src/platform/identity";
import type { SourceAccess } from "../../../src/features/guard/live/model";
import type { ScanJob } from "../../../src/features/guard/contracts";
import { RecordingClient, fakePool } from "../../platform/helpers";
import { brokerFixture } from "./broker-fixture";
function pair() {
  const a = new EventEmitter(),
    b = new EventEmitter();
  const port = (own: EventEmitter, remote: EventEmitter): GuardIpcPort => ({
    async send(value) {
      queueMicrotask(() => remote.emit("message", structuredClone(value)));
    },
    message(fn) {
      own.on("message", fn);
      return () => {
        own.off("message", fn);
      };
    },
    disconnect(fn) {
      own.on("disconnect", fn);
      return () => {
        own.off("disconnect", fn);
      };
    },
  });
  return { parent: port(a, b), child: port(b, a) };
}
/** Real Guard prepare/broker/IPC/snapshot/store code; synthetic GitHub/Auth/SQL, real private temporary source. */
async function chain() {
  const f = await brokerFixture(),
    client = new RecordingClient();
  const store = new PostgresGuardStore(
    new PlatformDatabase(fakePool(client), true, "guard"),
  );
  const digest = fingerprint({
    scope: [f.job.mode, f.job.workspaceId, f.job.projectId],
    repository: f.job.repository,
    profile: f.job.profile,
    engines: f.job.requestedEngines,
    idempotencyKey: f.job.idempotencyKey,
  });
  let row = {
    job: structuredClone(f.job),
    revision: 1,
    coverage: null as unknown,
    fingerprint: digest,
  };
  client.respond = async (sql, values) => {
    if (sql.startsWith("SELECT job_id FROM platform.jobs"))
      return { rows: [{ job_id: f.job.id }], rowCount: 1 };
    if (sql.startsWith("SELECT job,revision"))
      return { rows: [structuredClone(row)], rowCount: 1 };
    if (sql.startsWith("UPDATE guard.scans")) {
      row = {
        ...row,
        job: JSON.parse(String(values[5])) as ScanJob,
        revision: row.revision + 1,
        coverage: values[7] ? JSON.parse(String(values[7])) : row.coverage,
      };
      return { rows: [structuredClone(row)], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  };
  const bytes = Buffer.from("export const trustedFixture = 1");
  const sha = createHash("sha1")
    .update(`blob ${bytes.length}\0`)
    .update(bytes)
    .digest("hex");
  const close = vi.fn(async () => {});
  const source: SourceAccess = {
    authorize: f.deps.current,
    open: vi.fn(async () => ({
      head: async () => ({
        commit: f.job.repository.commit,
        tree: "c".repeat(40),
      }),
      tree: async () => ({
        sha: "c".repeat(40),
        truncated: false,
        entries: [
          {
            path: "safe.ts",
            mode: "100644",
            type: "blob" as const,
            sha,
            size: bytes.length,
          },
        ],
      }),
      blob: async () => ({
        sha,
        size: bytes.length,
        encoding: "base64",
        content: bytes.toString("base64"),
      }),
      close,
    })),
  };
  const snapshots = new GuardSnapshotAdapter(source);
  let directory = "";
  const original = snapshots.acquire.bind(snapshots);
  const acquire = vi.spyOn(snapshots, "acquire");
  acquire.mockImplementation(async (...args) => {
    const snapshot = await original(...args);
    directory = await snapshots.directory(snapshot);
    expect(await readFile(directory + "/safe.ts", "utf8")).toBe(
      bytes.toString(),
    );
    return snapshot;
  });
  const broker = new GuardSessionBroker(f.permit, {
    ...f.deps,
    snapshots,
    load: () => store.get(f.grant, f.job, f.job.id),
  });
  const ports = pair(),
    detach = attachGuardBroker(ports.parent, (packet, signal) =>
      broker.handle(packet, signal),
    );
  const remote = ipcWorkerResolver(ports.child);
  return {
    ...f,
    store,
    client,
    source,
    acquire,
    close,
    remote,
    directory: () => directory,
    row: () => row,
    cleanup: async () => {
      remote.close();
      await detach();
      await broker.close();
    },
  };
}
it("prepares through private IPC with exact request fields, persists coverage, never executes a scanner, and removes source", async () => {
  const f = await chain();
  try {
    await prepareGuardJob(
      f.store,
      f.remote.resolver,
      f.lease,
      new AbortController().signal,
    );
    expect(f.acquire).toHaveBeenCalledOnce();
    expect(f.acquire.mock.calls[0][1]).toEqual(f.request);
    expect(f.row().job.status).toBe("failed");
    expect(f.row().job.audit.at(-1)?.action).toBe("foundation_prepared");
    expect(f.row().job.runs.every((r) => r.status !== "completed")).toBe(true);
    expect(f.row().coverage).toMatchObject({
      status: "complete",
      retrievedFiles: 1,
    });
    expect(f.row().revision).toBe(3);
    await expect(access(f.directory())).rejects.toThrow();
    expect(f.close).toHaveBeenCalledOnce();
    expect(
      f.client.calls.filter((c) => c.sql.startsWith("UPDATE guard.scans")),
    ).toHaveLength(2);
    expect(f.client.calls.some((c) => c.sql.includes("sentinel."))).toBe(false);
  } finally {
    await f.cleanup();
  }
});
it("uses renewed leases for post-snapshot authorization and blocks revoked authority with cleanup", async () => {
  const f = await chain();
  let resolutions = 0;
  const resolver = {
    resolve: vi.fn(
      async (...args: Parameters<typeof f.remote.resolver.resolve>) => {
        if (++resolutions === 2)
          f.deps.current.mockRejectedValue(
            new Error("revoked synthetic session"),
          );
        return f.remote.resolver.resolve(...args);
      },
    ),
  };
  let latest = f.lease;
  const original = f.acquire.getMockImplementation()!;
  f.acquire.mockImplementation(async (...args) => {
    const snapshot = await original(...args);
    latest = {
      ...f.lease,
      job: { ...f.lease.job, revision: 3 },
      expiresAt: new Date(Date.now() + 45000).toISOString(),
    };
    return snapshot;
  });
  try {
    await expect(
      prepareGuardJob(
        f.store,
        resolver,
        f.lease,
        new AbortController().signal,
        () => latest,
      ),
    ).rejects.toThrow();
    expect(resolver.resolve.mock.calls.at(-1)?.[0]).toEqual(latest);
    expect(
      f.row().job.audit.some((a) => a.action === "foundation_prepared"),
    ).toBe(false);
    await expect(access(f.directory())).rejects.toThrow();
    expect(f.close).toHaveBeenCalledOnce();
  } finally {
    await f.cleanup();
  }
});
it("rejects cancellation or a replaced lease before snapshot access", async () => {
  const f = await chain();
  try {
    await expect(
      prepareGuardJob(f.store, f.remote.resolver, f.lease, AbortSignal.abort()),
    ).rejects.toThrow("lease_lost");
    await expect(
      prepareGuardJob(
        f.store,
        f.remote.resolver,
        f.lease,
        new AbortController().signal,
        () => ({ ...f.lease, leaseToken: "replacement" }),
      ),
    ).rejects.toThrow("lease_lost");
    expect(f.acquire).not.toHaveBeenCalled();
  } finally {
    await f.cleanup();
  }
});

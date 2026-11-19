import { beforeEach, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({
  deployment: null as unknown,
  digest: "unit-digest",
  physicalFailure: false,
  unclaimed: true,
  clients: [] as unknown[],
  run: vi.fn(),
  source: vi.fn(),
  config: vi.fn(),
  physical: vi.fn(),
}));
vi.mock(
  "../../../src/features/guard/live/product-deployment",
  async (original) => ({
    ...(await original<
      typeof import("../../../src/features/guard/live/product-deployment")
    >()),
    loadDeployment: vi.fn(async () => ({
      value: state.deployment,
      digest: state.digest,
    })),
    loadProductTarget: vi.fn(
      async () => (state.deployment as { target: unknown }).target,
    ),
  }),
);
vi.mock("node:fs/promises", async (original) => ({
  ...(await original<typeof import("node:fs/promises")>()),
  readFile: vi.fn(async () => "{}"),
}));
vi.mock("../../../src/features/guard/live/migrations", () => ({
  guardMigrationPlan: async () => ({ sha256: "a".repeat(64) }),
}));
vi.mock("../../../src/features/guard/live/database-config", () => ({
  guardDatabaseConfig: async (_env: unknown, purpose: string) => {
    state.config(purpose);
    return { purpose };
  },
  validateGuardApproval: () => ({
    target: (state.deployment as { target: unknown }).target,
  }),
}));
vi.mock("../../../src/platform/database", async (original) => {
  const real =
    await original<typeof import("../../../src/platform/database")>();
  const { RecordingClient } = await import("../../platform/helpers");
  return {
    ...real,
    ApprovedPool: class {
      c = new RecordingClient();
      constructor() {
        state.clients.push(this.c);
        this.c.respond = async (sql, values) =>
          sql.startsWith("SELECT job_id FROM platform.jobs")
            ? {
                rowCount: state.unclaimed ? 1 : 0,
                rows: [{ job_id: values[3] }],
              }
            : { rowCount: 0, rows: [] };
      }
      connect = async () => this.c;
      end = async () => {};
    },
  };
});
vi.mock("../../../src/features/guard/live/product-preflight", () => ({
  assertPrivateRuntimeRoot: async () => {},
  verifyPhysical: async () => {
    state.physical();
    if (state.physicalFailure) throw Error("unqualified");
  },
  qualificationAttestation: async () => ({ verify: async () => null }),
  verifyProductDatabase: async () => {},
}));
vi.mock("../../../src/features/guard/live/product-composition", () => ({
  qualifiedProductService: async (input: unknown) => input,
}));
vi.mock("../../../src/features/guard/live/github-source", () => ({
  githubSourceAccess: (...args: unknown[]) => {
    state.source(...args);
    return { authorize: async () => authority, open: vi.fn() };
  },
}));
vi.mock("../../../worker/guard/product-runtime", () => ({
  runRepositoryWorkerOnce: (...args: unknown[]) => state.run(...args),
}));
import {
  deploymentFixture,
  operationalJobFixture,
  authority,
} from "./operational-fixture";
import type { ScanJob } from "../../../src/features/guard/contracts";
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  state.deployment = deploymentFixture();
  state.digest = "unit-digest";
  state.physicalFailure = false;
  state.unclaimed = true;
  state.clients = [];
  state.run.mockResolvedValue({ status: "no_claim" });
});
const env = {
  NODE_ENV: "test" as const,
  GUARD_PRODUCT_CONFIG_FILE: "UNIT_CONFIG_REFERENCE",
  GUARD_DB_APP_APPROVAL_FILE: "UNIT_APP_APPROVAL",
  GUARD_DB_WORKER_APPROVAL_FILE: "UNIT_WORKER_APPROVAL",
  GUARD_DB_APP_PASSWORD_FILE: "UNIT_APP_REFERENCE",
  GUARD_DB_WORKER_PASSWORD_FILE: "UNIT_WORKER_REFERENCE",
};
it("actual host factory registers after-response work only after durable unclaimed-job verification, then wires original Auth to a bound worker", async () => {
  const { productHostService } =
      await import("../../../src/features/guard/live/product-host"),
    tasks: (() => Promise<void>)[] = [];
  const service = (await productHostService(
    {
      token: "OFFLINE_SESSION_REFERENCE",
      authority,
      defer: (t) => tasks.push(t),
    },
    env,
  )) as unknown as { onQueued(j: ScanJob): Promise<void> };
  const job = await operationalJobFixture();
  await service.onQueued(job);
  expect(state.run).not.toHaveBeenCalled();
  expect(tasks).toHaveLength(1);
  await tasks[0]();
  expect(state.run).toHaveBeenCalledOnce();
  const input = state.run.mock.calls[0][0];
  expect(input).toMatchObject({
    jobId: job.id,
    scope: job,
    timeoutMs: 120000,
    db: { worker: true, module: "guard" },
  });
  expect(typeof input.handler).toBe("function");
  expect(JSON.stringify(job)).not.toContain("OFFLINE_SESSION_REFERENCE");
  expect(state.config.mock.calls.map((c) => c[0])).toEqual(["app", "worker"]);
});
it("does not schedule historical/used queue state and never launches it", async () => {
  const { productHostService } =
      await import("../../../src/features/guard/live/product-host"),
    defer = vi.fn();
  const service = (await productHostService(
    { token: "OFFLINE_SESSION_REFERENCE", authority, defer },
    env,
  )) as unknown as { onQueued(j: ScanJob): Promise<void> };
  state.unclaimed = false;
  await expect(service.onQueued(await operationalJobFixture())).rejects.toThrow(
    "execution_not_ready",
  );
  expect(defer).not.toHaveBeenCalled();
  expect(state.run).not.toHaveBeenCalled();
});
it("physical verification failure precedes credential configuration and scheduling", async () => {
  state.physicalFailure = true;
  const { productHostService } =
    await import("../../../src/features/guard/live/product-host");
  await expect(
    productHostService(
      { token: "OFFLINE_SESSION_REFERENCE", authority, defer: vi.fn() },
      env,
    ),
  ).rejects.toThrow("unqualified");
  expect(state.config).not.toHaveBeenCalled();
  expect(state.run).not.toHaveBeenCalled();
});
it("configuration drift cannot reuse the previously cached host", async () => {
  const { productHostService } =
      await import("../../../src/features/guard/live/product-host"),
    context = { token: "OFFLINE_SESSION_REFERENCE", authority, defer: vi.fn() };
  await productHostService(context, env);
  state.digest = "drift";
  await expect(productHostService(context, env)).rejects.toThrow(
    "execution_not_ready",
  );
  expect(state.run).not.toHaveBeenCalled();
});
it("stored results reader needs only app role and does not require scanner/worker readiness", async () => {
  state.physicalFailure = true;
  const { productReadService } =
    await import("../../../src/features/guard/live/product-host");
  const service = await productReadService(env);
  expect(service.capabilities().repositoryScanning).toBe("BLOCKED");
  expect(state.config.mock.calls.map((c) => c[0])).toEqual(["app"]);
  expect(state.physical).not.toHaveBeenCalled();
  expect(state.run).not.toHaveBeenCalled();
});

it("early worker/broker failure emits only allowlisted operational diagnostic, not raw errors", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  try {
    const { productHostService } =
      await import("../../../src/features/guard/live/product-host");
    const tasks: (() => Promise<void>)[] = [];
    const service = (await productHostService(
      {
        token: "OFFLINE_SESSION_REFERENCE",
        authority,
        defer: (t) => tasks.push(t),
      },
      env,
    )) as unknown as { onQueued(j: ScanJob): Promise<void> };
    state.run.mockRejectedValue(
      Object.assign(Error("PRIVATE_SOURCE_TOKEN"), { code: "forbidden" }),
    );
    await service.onQueued(await operationalJobFixture());
    await tasks[0]();
    expect(warn).toHaveBeenCalled();
    const text = JSON.stringify(warn.mock.calls);
    expect(text).toContain("repository_worker_failed");
    expect(text).toContain("broker");
    expect(text).not.toContain("PRIVATE_SOURCE_TOKEN");
  } finally {
    warn.mockRestore();
  }
});

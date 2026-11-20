import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ScannerPort } from "../../../src/features/guard/g03/service";
vi.mock("server-only", () => ({}));
const ports = vi.hoisted(() => ({
  verify: vi.fn(async () => {}),
  target: vi.fn(async () => ({ classification: "offline-target" })),
  authorize: vi.fn(),
  live: vi.fn(),
  create: vi.fn(async () => ({ scanId: "d".repeat(64) })),
  get: vi.fn(),
  wiring: undefined as
    { scanner: ScannerPort; revalidate(): Promise<unknown> } | undefined,
}));
vi.mock("../../../src/platform/database", () => ({
  ApprovedPool: class {
    async end() {}
  },
  PlatformDatabase: class {},
}));
vi.mock("../../../src/features/guard/live/database-config", () => ({
  guardDatabaseConfig: vi.fn(async () => ({})),
}));
vi.mock("../../../src/features/guard/live/migrations", () => ({
  guardMigrationPlan: vi.fn(async () => ({ sha256: "a".repeat(64) })),
}));
vi.mock("../../../src/features/guard/live/product-deployment", () => ({
  loadProductTarget: ports.target,
}));
vi.mock("../../../src/features/guard/live/product-preflight", () => ({
  verifyProductDatabase: ports.verify,
}));
vi.mock("../../../src/features/guard/live/project", () => ({
  authorizeGuardProject: ports.authorize,
}));
vi.mock("../../../src/features/guard/live/runtime", () => ({
  guardLiveService: ports.live,
}));
vi.mock("../../../src/features/guard/g03/store", () => ({
  PostgresG03Store: class {},
}));
vi.mock("../../../src/features/guard/g03/source", () => ({
  githubRemediationSource: vi.fn(() => ({})),
}));
vi.mock("../../../src/features/guard/g03/provider", () => ({
  remediationAi: vi.fn(() => ({})),
}));
vi.mock("../../../src/features/guard/g03/github", () => ({
  githubPullRequests: vi.fn(() => ({})),
}));
vi.mock("../../../src/features/guard/g03/service", () => ({
  G03Service: class {
    constructor(wiring: typeof ports.wiring) {
      ports.wiring = wiring;
    }
  },
}));
import { g03Runtime } from "../../../src/features/guard/g03/runtime";
import type { ProjectAuthority } from "../../../src/features/guard/live/model";
const authority = {
  repositoryId: "123",
  repositoryName: "fixture/repository",
  branch: "main",
  installationId: 9,
  userId: 7,
  grant: {
    mode: "live",
    workspaceId: "fixture-workspace",
    projectId: "github-123",
    actorId: "fixture-actor",
    operations: ["read", "triage", "report", "scan"],
    expiresAt: Date.now() + 3600000,
  },
} as ProjectAuthority;
const defer = vi.fn();
const input = {
  branch: "approved-branch",
  commit: "b".repeat(40),
  engine: "sast" as const,
  idempotencyKey: "g03-fixture-retest",
};
beforeEach(() => {
  vi.clearAllMocks();
  ports.wiring = undefined;
  ports.verify.mockResolvedValue();
  ports.authorize.mockResolvedValue(authority);
  ports.live.mockResolvedValue({ create: ports.create, get: ports.get });
  vi.stubEnv("GUARD_G03_ENABLED", "1");
  vi.stubEnv("GUARD_PRODUCT_ENABLED", "0");
  vi.stubEnv("GUARD_PRODUCT_CONFIG_FILE", "offline-reference-only");
});
afterEach(() => vi.unstubAllEnvs());
it("G03 stays off before loading any target/database", async () => {
  vi.stubEnv("GUARD_G03_ENABLED", "0");
  await expect(g03Runtime("fixture-session", authority, defer)).rejects.toThrow(
    "g03_not_configured",
  );
  expect(ports.target).not.toHaveBeenCalled();
});
it("verifies the existing application database before composing G03 without starting a scan", async () => {
  await g03Runtime("fixture-session", authority, defer);
  expect(ports.verify).toHaveBeenCalledWith(
    expect.anything(),
    "app",
    expect.anything(),
    expect.objectContaining({ sha256: "a".repeat(64) }),
  );
  expect(ports.live).not.toHaveBeenCalled();
  expect(ports.create).not.toHaveBeenCalled();
});
it("rejects retest while the existing G02 product gate is disabled", async () => {
  await g03Runtime("fixture-session", authority, defer);
  await expect(
    ports.wiring!.scanner.enqueue(
      authority,
      input,
      new AbortController().signal,
    ),
  ).rejects.toThrow("scanner_not_configured");
  expect(ports.live).not.toHaveBeenCalled();
});
it("passes only the consented branch/commit/engine to the existing G02 admission and defer path", async () => {
  vi.stubEnv("GUARD_PRODUCT_ENABLED", "1");
  await g03Runtime("fixture-session", authority, defer);
  const signal = new AbortController().signal;
  await expect(
    ports.wiring!.scanner.enqueue(authority, input, signal),
  ).resolves.toEqual({ scanId: "d".repeat(64) });
  expect(ports.live).toHaveBeenCalledWith({
    token: "fixture-session",
    authority,
    access: "scan",
    defer,
  });
  expect(ports.create).toHaveBeenCalledWith(
    authority,
    {
      branch: input.branch,
      commit: input.commit,
      profile: "quick",
      engines: ["sast"],
      idempotencyKey: input.idempotencyKey,
    },
    signal,
  );
});
it("reads real persisted jobs through G02 read access and reuses existing project authorization", async () => {
  const job = { classification: "offline-stored-job" };
  ports.get.mockResolvedValue({ job });
  await g03Runtime("fixture-session", authority, defer);
  await expect(
    ports.wiring!.scanner.get(authority, "d".repeat(64)),
  ).resolves.toEqual(job);
  expect(ports.live).toHaveBeenCalledWith({
    token: "fixture-session",
    authority,
    access: "read",
    defer,
  });
  await ports.wiring!.revalidate();
  expect(ports.authorize).toHaveBeenCalledWith("fixture-session", "github-123");
});
it("fails closed on an unqualified database without composing services", async () => {
  ports.verify.mockRejectedValueOnce(Error("fixture-unqualified-db"));
  await expect(g03Runtime("fixture-session", authority, defer)).rejects.toThrow(
    "fixture-unqualified-db",
  );
  expect(ports.wiring).toBeUndefined();
  expect(ports.create).not.toHaveBeenCalled();
});

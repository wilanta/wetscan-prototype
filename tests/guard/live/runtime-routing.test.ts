import { afterEach, beforeEach, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
const calls = vi.hoisted(() => ({
  host: vi.fn(),
  read: vi.fn(),
  credential: vi.fn(),
}));
vi.mock("../../../src/features/guard/live/product-host", () => ({
  productHostService: (...args: unknown[]) => calls.host(...args),
  productReadService: (...args: unknown[]) => calls.read(...args),
}));
vi.mock("../../../src/features/guard/live/database-config", () => ({
  guardDatabaseConfig: (...args: unknown[]) => calls.credential(...args),
}));
import { guardLiveService } from "../../../src/features/guard/live/runtime";
import { GuardLiveService } from "../../../src/features/guard/live/service";
import { authority } from "./operational-fixture";
const context = {
  token: "OFFLINE_REFERENCE",
  authority,
  access: "scan" as const,
  defer: vi.fn(),
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("GUARD_PRODUCT_CONFIG_FILE", undefined);
  vi.stubEnv("GUARD_PRODUCT_ENABLED", undefined);
  vi.stubEnv("GUARD_LIVE_READ_ENABLED", "1");
  calls.host.mockResolvedValue(new GuardLiveService(undefined));
  calls.read.mockResolvedValue(new GuardLiveService(undefined));
});
afterEach(() => vi.unstubAllEnvs());
it("normal website never falls back to historical G01 database even if legacy read flag is set", async () => {
  expect(
    (await guardLiveService(context)).capabilities().repositoryScanning,
  ).toBe("BLOCKED");
  expect(calls.credential).not.toHaveBeenCalled();
  expect(calls.host).not.toHaveBeenCalled();
  expect(calls.read).not.toHaveBeenCalled();
});
it("deployment target can be read before scanning is enabled, without constructing a worker", async () => {
  vi.stubEnv("GUARD_PRODUCT_CONFIG_FILE", "UNIT_CONFIG_REFERENCE");
  await guardLiveService(context);
  expect(calls.read).toHaveBeenCalledOnce();
  expect(calls.host).not.toHaveBeenCalled();
  expect(calls.credential).not.toHaveBeenCalled();
});
it("stored findings remain on the reader path even with operational scanning enabled", async () => {
  vi.stubEnv("GUARD_PRODUCT_ENABLED", "1");
  await guardLiveService({ ...context, access: "read" });
  expect(calls.read).toHaveBeenCalledOnce();
  expect(calls.host).not.toHaveBeenCalled();
});
it("only an explicitly enabled scan request receives the original owner-session host context", async () => {
  vi.stubEnv("GUARD_PRODUCT_ENABLED", "1");
  await guardLiveService(context);
  expect(calls.host).toHaveBeenCalledWith(context);
  expect(calls.read).not.toHaveBeenCalled();
});

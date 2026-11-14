import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { randomBytes } from "node:crypto";
import { mkdtemp, rm, rename } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, relative, resolve } from "node:path";
vi.mock("server-only", () => ({}));
vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return { ...actual, rename: vi.fn(actual.rename) };
});
import { readRecord, writeRecord } from "../src/lib/auth/store";
let directory: string;
const native =
  await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "wetscan-auth-store-test-"));
  vi.stubEnv("APP_URL", "http://localhost:3110");
  vi.stubEnv("AUTH_DATA_DIR", directory);
  vi.stubEnv("AUTH_SECRET", randomBytes(32).toString("hex"));
});
afterEach(() =>
  vi.mocked(rename).mockReset().mockImplementation(native.rename),
);
afterAll(async () => {
  vi.unstubAllEnvs();
  const target = resolve(directory);
  if (
    !basename(target).startsWith("wetscan-auth-store-test-") ||
    relative(resolve(tmpdir()), target).startsWith("..")
  )
    throw new Error("Unsafe fixture cleanup");
  await rm(target, { recursive: true, force: true });
});
describe("Windows Auth record atomic replacement", () => {
  it.runIf(process.platform === "win32")(
    "retries a transient EPERM and preserves encrypted data",
    async () => {
      await writeRecord("user-1", { workspace: "old" });
      vi.mocked(rename)
        .mockClear()
        .mockRejectedValueOnce(
          Object.assign(new Error("fixture-only"), { code: "EPERM" }),
        );
      await writeRecord("user-1", { workspace: "updated" });
      expect(rename).toHaveBeenCalledTimes(2);
      expect(await readRecord("user-1")).toEqual({ workspace: "updated" });
    },
  );
  it.runIf(process.platform === "win32")(
    "bounds retries and keeps the original record on permanent denial",
    async () => {
      await writeRecord("user-2", { workspace: "original" });
      vi.mocked(rename)
        .mockClear()
        .mockRejectedValue(
          Object.assign(new Error("fixture-only"), { code: "EACCES" }),
        );
      await expect(
        writeRecord("user-2", { workspace: "unsaved" }),
      ).rejects.toMatchObject({ code: "EACCES" });
      expect(rename).toHaveBeenCalledTimes(6);
      expect(await readRecord("user-2")).toEqual({ workspace: "original" });
    },
  );
  it("does not retry unrelated filesystem failures", async () => {
    vi.mocked(rename).mockRejectedValueOnce(
      Object.assign(new Error("fixture-only"), { code: "EINVAL" }),
    );
    await expect(writeRecord("user-3", {})).rejects.toMatchObject({
      code: "EINVAL",
    });
    expect(rename).toHaveBeenCalledTimes(1);
  });
});

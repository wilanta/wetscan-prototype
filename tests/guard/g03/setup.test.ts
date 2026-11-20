import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("node:fs/promises", () => ({ lstat: vi.fn(), readFile: vi.fn() }));
vi.mock("../../../src/features/guard/live/product-preflight", () => ({
  assertPrivateRuntimeRoot: vi.fn(),
}));
import { lstat, readFile } from "node:fs/promises";
import { assertPrivateRuntimeRoot } from "../../../src/features/guard/live/product-preflight";
import { join } from "node:path";
import { tmpdir } from "node:os";
import candidate from "../../../docs/config/guard-g03.provider.example.json";
import {
  providerSettings,
  settingsEnvironment,
  settingsPlan,
} from "../../../src/features/guard/g03/setup";
import { providerConfiguration } from "../../../src/features/guard/g03/provider";
import { inspectProviderReference } from "../../../scripts/guard-g03-setup";
it("prepares the exact snapshot and bounded cost without approval, key or activation", () => {
  const s = providerSettings(candidate);
  expect(settingsPlan(s)).toMatchObject({
    model: "gpt-5.4-mini-2026-03-17",
    reservedMicroUsd: 16500,
    retries: 0,
    timeoutMs: 20000,
  });
  expect(settingsEnvironment(s)).toMatchObject({
    GUARD_G03_AI_ENABLED: "0",
    GUARD_G03_DATA_POLICY_APPROVED: "0",
  });
  expect(settingsEnvironment(s)).not.toHaveProperty("GUARD_G03_API_KEY_FILE");
  expect(settingsEnvironment(s)).not.toHaveProperty("GUARD_G03_ENABLED");
  expect(settingsEnvironment(s)).not.toHaveProperty(
    "GUARD_G03_GITHUB_WRITES_ENABLED",
  );
  expect(() => providerConfiguration(settingsEnvironment(s))).toThrow(
    "provider_not_configured",
  );
});
it("maps approved settings to the existing backend provider contract without a call", () => {
  const s = providerSettings({
    ...candidate,
    enabled: true,
    dataPolicyApproved: true,
    keyFile: join(tmpdir(), "offline-key-reference"),
  });
  expect(providerConfiguration(settingsEnvironment(s))).toMatchObject({
    model: s.model,
    reservedMicroUsd: settingsPlan(s).reservedMicroUsd,
  });
});
it("rejects credential-shaped strings in public model/policy metadata", () => {
  const token = ["sk", "proj" + "X7".repeat(25)].join("-");
  for (const field of ["model", "dataPolicyVersion"])
    expect(() => providerSettings({ ...candidate, [field]: token })).toThrow(
      "sensitive_content",
    );
});
it.each([
  { apiKey: "must-never-be-accepted" },
  { enabled: true },
  { keyFile: "relative.key" },
  { keyFile: join(tmpdir(), ".env.production") },
  { inputMicroUsdPerMillion: 1.5 },
  { outputMicroUsdPerMillion: 1000000000 },
  { model: "untrusted\nmodel" },
  { dataPolicyApproved: "yes" },
])("rejects invalid, unapproved or secret-bearing settings %j", (change) => {
  expect(() => providerSettings({ ...candidate, ...change })).toThrow();
});
it("checks key reference metadata without reading its contents", async () => {
  vi.mocked(lstat).mockResolvedValue({
    isFile: () => true,
    isSymbolicLink: () => false,
    size: 40,
  } as Awaited<ReturnType<typeof lstat>>);
  await expect(
    inspectProviderReference(join(tmpdir(), "offline-key-reference")),
  ).resolves.toMatchObject({
    keyContentsRead: false,
    status: "PRIVATE_REFERENCE_METADATA_VERIFIED",
  });
  expect(assertPrivateRuntimeRoot).toHaveBeenCalled();
  expect(readFile).not.toHaveBeenCalled();
});
it("refuses a symlink reference and does not read a missing key", async () => {
  vi.mocked(lstat).mockResolvedValue({
    isFile: () => true,
    isSymbolicLink: () => true,
    size: 40,
  } as Awaited<ReturnType<typeof lstat>>);
  await expect(
    inspectProviderReference(join(tmpdir(), "offline-key-reference")),
  ).rejects.toThrow();
  await expect(inspectProviderReference(null)).resolves.toMatchObject({
    status: "NOT_PROVISIONED",
    keyContentsRead: false,
  });
  expect(readFile).not.toHaveBeenCalled();
});
it.each(["relative.key", join(tmpdir(), ".env.production")])(
  "rejects unsafe metadata reference %s",
  async (path) => {
    await expect(inspectProviderReference(path)).rejects.toThrow(
      "provider_reference_invalid",
    );
    expect(readFile).not.toHaveBeenCalled();
  },
);

import { it, expect, vi } from "vitest";
import {
  validateSandboxSpec,
  validateOperationalSandboxSpec,
} from "../../../worker/guard/sandbox";
import {
  removeInstallationContainer,
  installationDocker,
} from "../../../worker/guard/installation/qualify";
import { deploymentFixture } from "./operational-fixture";
it("operational local images require a full immutable content ID; G01 remains registry-digest-only", () => {
  const spec = {
    ...deploymentFixture().deployments[0].spec,
    image: "sha256:" + "a".repeat(64),
  };
  expect(() => validateOperationalSandboxSpec(spec)).not.toThrow();
  expect(() => validateSandboxSpec(spec)).toThrow();
  expect(() =>
    validateOperationalSandboxSpec({ ...spec, image: "wetscan:latest" }),
  ).toThrow();
  expect(() =>
    validateOperationalSandboxSpec({ ...spec, image: "sha256:short" }),
  ).toThrow();
});
it.each(["id", "image", "owner"])(
  "installation cleanup refuses changed %s before rm",
  async (mode) => {
    const name = "wetscan-guard-00000000-0000-4000-8000-000000000001",
      run = "unit-run",
      id = "a".repeat(64),
      image = "sha256:" + "b".repeat(64);
    const call = vi.fn(async () =>
      JSON.stringify({
        Id: mode === "id" ? "other" : id,
        Name: "/" + name,
        Image: mode === "image" ? "other" : image,
        Config: { Labels: { "wetscan.run": mode === "owner" ? "other" : run } },
      }),
    );
    await expect(
      removeInstallationContainer({ call }, name, id, image, run),
    ).rejects.toThrow("identity_mismatch");
    expect(call).toHaveBeenCalledOnce();
  },
);
it("removal requires measured owned ID and verifies absence", async () => {
  const call = vi
    .fn()
    .mockResolvedValueOnce(
      JSON.stringify({
        Id: "a".repeat(64),
        Name: "/unit-owned",
        Image: "sha256:" + "b".repeat(64),
        Config: { Labels: { "wetscan.run": "unit" } },
      }),
    )
    .mockResolvedValueOnce("")
    .mockResolvedValueOnce("");
  await removeInstallationContainer(
    { call },
    "unit-owned",
    "a".repeat(64),
    "sha256:" + "b".repeat(64),
    "unit",
  );
  expect(call.mock.calls.map((c) => c[0][0])).toEqual(["inspect", "rm", "ps"]);
});
it("installation driver rejects PATH resolution and remote Docker endpoints", () => {
  expect(() =>
    installationDocker(
      "docker.exe",
      "npipe:////./pipe/docker_engine",
      "C:/unit",
    ),
  ).toThrow();
  expect(() =>
    installationDocker(
      "C:/tools/docker.exe",
      "tcp://example.com:2375",
      "C:/unit",
    ),
  ).toThrow();
});

it("only operational OSV may use the explicit 2 GiB offline database budget", () => {
  const spec = {
    ...deploymentFixture().deployments[0].spec,
    executable: "/usr/local/bin/osv-scanner",
    memoryMb: 2048 as const,
  };
  expect(() => validateOperationalSandboxSpec(spec)).not.toThrow();
  expect(() => validateSandboxSpec(spec)).toThrow();
  expect(() =>
    validateOperationalSandboxSpec({
      ...spec,
      executable: "/usr/local/bin/opengrep",
    }),
  ).toThrow();
  expect(() =>
    validateOperationalSandboxSpec({ ...spec, memoryMb: 1024 as 256 }),
  ).toThrow();
});

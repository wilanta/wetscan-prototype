import { readFile, rm, unlink, writeFile } from "node:fs/promises";
import { basename, join, relative, resolve } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  packageFixture as fixture,
  fixtureGuards,
  syntheticSecret,
} from "./provision-package-fixture";
import {
  initialArchiveCheck,
  loadPackageManifest,
  selectCandidate,
  validatePackageGrant,
  verifyAuthBoundary,
  verifyPackageFiles,
} from "../../scripts/sentinel-provision-package";
import { assertProvisionPackageBoundary } from "../../scripts/sentinel-provision-enforcement";
import { runProvisionOperation } from "../../scripts/sentinel-provision-owner";
import { executeProvision } from "../../scripts/sentinel-provision-safety";
import { provisionFixture } from "./provision-fixtures";

const mock = vi.hoisted(() => ({
  validate: undefined as undefined | (() => Promise<void>),
  receipt: {} as Record<string, unknown>,
  checks: 0,
  pools: 0,
}));
vi.mock("node:child_process", async (original) => ({
  ...(await original<typeof import("node:child_process")>()),
  execFile: vi.fn(
    (
      _file,
      args: string[],
      _options,
      callback: (error: Error | null, stdout: string, stderr: string) => void,
    ) => {
      mock.checks++;
      Promise.resolve()
        .then(async () => {
          await mock.validate?.();
          const sha = args.find((arg) => arg.startsWith("--sha="))?.slice(6);
          callback(
            null,
            JSON.stringify({
              status: "PACKAGE_BOUNDARY_PASS",
              mode: "check",
              manifestSha256: sha,
              separateOwnerGrantValidated: true,
              historicalAuthPreserved: true,
              archiveOnlyRecords: 1,
              completeHistoricalActiveFilePreservation: false,
              semanticContentsUnchanged: true,
              tokenMinutesRemaining: 60,
              databaseConnections: 0,
              providerRequests: 0,
              authWrites: 0,
              liveAuthorizationFromChecker: false,
              ...mock.receipt,
            }),
            "",
          );
        })
        .catch(() => callback(Error("SYNTHETIC_VALIDATION_FAILED"), "", ""));
      return {};
    },
  ),
}));
vi.mock("../../src/platform/database", async (original) => ({
  ...(await original<typeof import("../../src/platform/database")>()),
  ApprovedPool: class {
    constructor() {
      mock.pools++;
      throw Error("SIMULATED_POOL_REACHED");
    }
  },
}));

const savedArgv = [...process.argv];
const roots: string[] = [];
let f: Awaited<ReturnType<typeof fixture>>;
const prefix = "SENTINEL_PROVISION_PACKAGE_";
const savedContext = Object.fromEntries(
  Object.entries(process.env).filter(([k]) => k.startsWith(prefix)),
);
function clearContext() {
  for (const k of Object.keys(process.env))
    if (k.startsWith(prefix)) delete process.env[k];
}
beforeEach(() => {
  clearContext();
  mock.validate = undefined;
  mock.receipt = {};
  mock.checks = 0;
  mock.pools = 0;
});
afterEach(async () => {
  clearContext();
  Object.assign(process.env, savedContext);
  process.argv = [...savedArgv];
  for (const path of roots.splice(0)) {
    if (
      !basename(path).startsWith("wetscan-provision-package-test-") ||
      relative(resolve(tmpdir()), path).startsWith("..")
    )
      throw Error("unsafe_fixture_cleanup");
    await rm(path, { recursive: true, force: true });
  }
});
async function prepare() {
  f = await fixture();
  roots.push(f.base);
  const ctx = {
    MANIFEST: f.manifestFile,
    SHA: f.manifestSha,
    COOKIE: f.policy.archive.candidateFile,
    GRANT: join(f.base, "SYNTHETIC_GRANT"),
    GRANT_SHA: "a".repeat(64),
    OUTPUT: f.grant.outputDirectory,
    OWNER: f.grant.approvedBy,
  };
  for (const [key, value] of Object.entries(ctx))
    process.env[prefix + key] = value;
  process.argv = [
    process.execPath,
    resolve("scripts/sentinel-provision-owner.ts"),
    "execute",
    "--cookie-file=" + ctx.COOKIE,
    "--artifact-dir=" + ctx.OUTPUT,
    "--origin=http://localhost:3000",
  ];
  mock.validate = async () => {
    selectCandidate(process.env[prefix + "COOKIE"]!, f.policy);
    const manifest = await loadPackageManifest(
      f.manifestFile,
      process.env[prefix + "SHA"]!,
      f.policy,
      fixtureGuards,
    );
    validatePackageGrant(
      f.grant,
      f.manifestSha,
      f.grant.runnerSha256,
      process.env[prefix + "COOKIE"]!,
      f.grant.outputDirectory,
      f.now,
    );
    await verifyPackageFiles(manifest, f.policy);
    await initialArchiveCheck(
      f.policy,
      fixtureGuards,
      syntheticSecret,
      f.policy.archive.authDir,
      "http://localhost:3000",
      {},
    );
    const result = await verifyAuthBoundary(
      manifest,
      f.policy,
      fixtureGuards,
      syntheticSecret,
      f.candidateBefore,
      f.now,
    );
    if (result.tokenMinutesRemaining < 40)
      throw Error("SYNTHETIC_ENTRY_HEADROOM");
  };
}

describe(
  "mandatory shared entrypoint enforcement (synthetic only)",
  { timeout: 20000 },
  () => {
    it.each([
      "audit-start",
      "execute",
      "recover",
      "audit-end",
      "audit-failure-end",
    ])(
      "blocks %s before a pool without context, even with an extra no-op callback",
      async (mode) => {
        let callbacks = 0;
        await expect(
          Reflect.apply(runProvisionOperation, undefined, [
            mode,
            undefined,
            () => {
              callbacks++;
            },
          ]),
        ).rejects.toThrow();
        expect(mock.pools).toBe(0);
        expect(mock.checks).toBe(0);
        expect(callbacks).toBe(0);
      },
    );
    it.each([
      "missing authorization",
      "stale authorization",
      "invalid phase",
      "original cookie",
      "expired candidate",
      "insufficient lifetime",
      "missing exception",
      "manifest mismatch",
      "reappearing archive",
      "unexpected auth change",
    ])("%s cannot reach simulated provider/pool/writes", async (kind) => {
      await prepare();
      if (kind === "missing authorization")
        delete process.env[prefix + "GRANT"];
      if (kind === "stale authorization")
        f.grant.expiresAt = new Date(f.now - 1).toISOString();
      if (kind === "invalid phase") f.grant.phase = "preservation-audit";
      if (kind === "original cookie") {
        process.env[prefix + "COOKIE"] = f.policy.archive.oldCookieFile;
        process.argv[3] = "--cookie-file=" + f.policy.archive.oldCookieFile;
      }
      if (kind === "expired candidate" || kind === "insufficient lifetime") {
        // Advance only the synthetic clock; immutable candidate pins still pass.
        f.now =
          Number(f.session.tokenExpiresAt) +
          (kind === "expired candidate" ? 1 : -29 * 60000);
        f.grant.notBefore = new Date(f.now - 1000).toISOString();
        f.grant.expiresAt = new Date(f.now + 599000).toISOString();
      }
      if (kind === "missing exception") await unlink(f.policy.descriptor);
      if (kind === "manifest mismatch")
        process.env[prefix + "SHA"] = "0".repeat(64);
      if (kind === "reappearing archive")
        await writeFile(
          f.policy.archive.absentSessionFile,
          "SYNTHETIC_REAPPEARANCE",
        );
      if (kind === "unexpected auth change")
        await writeFile(
          join(f.policy.archive.authDir, "unexpected.bin"),
          "SYNTHETIC",
        );
      const effects = { provider: 0, pool: 0, writes: 0 };
      await expect(
        (async () => {
          await assertProvisionPackageBoundary();
          effects.provider++;
          effects.pool++;
          effects.writes++;
        })(),
      ).rejects.toThrow();
      await expect(runProvisionOperation("execute")).rejects.toThrow();
      expect(effects).toEqual({ provider: 0, pool: 0, writes: 0 });
      expect(mock.pools).toBe(0);
    });
    it.each([
      "status",
      "separateOwnerGrantValidated",
      "historicalAuthPreserved",
      "archiveOnlyRecords",
      "semanticContentsUnchanged",
      "tokenMinutesRemaining",
    ])("rejects missing or invalid checker proof: %s", async (field) => {
      await prepare();
      mock.receipt[field] = undefined;
      await expect(assertProvisionPackageBoundary()).rejects.toThrow(
        "provision_package_failed",
      );
    });
    it("rejects unknown environment switches and duplicate/mismatched CLI cookie selection", async () => {
      await prepare();
      process.env[prefix + "SKIP"] = "1";
      await expect(assertProvisionPackageBoundary()).rejects.toThrow();
      delete process.env[prefix + "SKIP"];
      process.argv.push(process.argv[3]);
      await expect(assertProvisionPackageBoundary()).rejects.toThrow();
      process.argv.pop();
      process.argv[3] = "--cookie-file=SYNTHETIC_DIFFERENT";
      await expect(assertProvisionPackageBoundary()).rejects.toThrow();
    });
    it("detects environment and CLI drift while the checker is running", async () => {
      await prepare();
      mock.validate = async () => {
        process.env[prefix + "OWNER"] = "SYNTHETIC_CHANGED";
      };
      await expect(assertProvisionPackageBoundary()).rejects.toThrow();
      await prepare();
      mock.validate = async () => {
        process.argv.push("--skip=yes");
      };
      await expect(assertProvisionPackageBoundary()).rejects.toThrow();
    });
    // Aggregate synthetic phase: many full filesystem checks under suite-wide
    // CPU/IO contention. Production still limits each checker to 20 seconds.
    it(
      "runs an authorized synthetic provisioning path with repeated mandatory boundaries",
      { timeout: 60000 },
      async () => {
        await prepare();
        const d = provisionFixture();
        const request = d.deps.request;
        d.deps.request = async (...args) => {
          await assertProvisionPackageBoundary();
          const result = await request(...args);
          await assertProvisionPackageBoundary();
          return result;
        };
        await assertProvisionPackageBoundary();
        const result = await executeProvision(d.deps);
        expect(result.ids.sourceId).toBe(d.sid);
        expect(mock.checks).toBeGreaterThan(10);
        expect(mock.pools).toBe(0);
      },
    );
    it("stops a later boundary when historical evidence changes after a successful check", async () => {
      await prepare();
      await assertProvisionPackageBoundary();
      await writeFile(f.policy.archive.archiveFile, "SYNTHETIC_DRIFT");
      await expect(assertProvisionPackageBoundary()).rejects.toThrow();
    });
    it("retains one shared gate for adapters and rejects legacy PowerShell live mode before side effects", async () => {
      const adapter = await readFile(
        "scripts/sentinel-provision-package-owner.ts",
        "utf8",
      );
      const owner = await readFile(
        "scripts/sentinel-provision-owner.ts",
        "utf8",
      );
      const alias = await readFile(
        "scripts/sentinel-dev-acceptance.ts",
        "utf8",
      );
      expect(adapter).toContain("runProvisionOperation(mode, diagnostic)");
      expect(alias).toContain('return runProvisionOperation("execute")');
      expect(owner).not.toContain("packageBoundary?");
      expect(
        owner.indexOf(
          "await assertProvisionPackageBoundary();",
          owner.indexOf("export async function runProvisionOperation"),
        ),
      ).toBeLessThan(
        owner.indexOf(
          "const pool = new ApprovedPool",
          owner.indexOf("export async function runProvisionOperation"),
        ),
      );
    });
  },
);

import { readFile, rm, unlink, writeFile } from "node:fs/promises";
import { basename, join, relative, resolve } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  bytesAt,
  candidateSemantics,
  initialArchiveCheck,
  loadPackageManifest,
  packageBudget,
  parseObject,
  selectCandidate,
  validatePackageGrant,
  verifyAuthBoundary,
  verifyPackageFiles,
} from "../../scripts/sentinel-provision-package";
import {
  executeProvision,
  verifyProvisionDelta,
} from "../../scripts/sentinel-provision-safety";
import { fixtureState, provisionFixture, refresh } from "./provision-fixtures";
import {
  encrypt,
  fixtureGuards,
  packageFixture,
  syntheticSecret,
} from "./provision-package-fixture";

const roots: string[] = [];
async function fixture() {
  const f = await packageFixture();
  roots.push(f.base);
  return f;
}
afterEach(async () => {
  for (const path of roots.splice(0)) {
    if (
      !basename(path).startsWith("wetscan-provision-package-test-") ||
      relative(resolve(tmpdir()), path).startsWith("..")
    )
      throw Error("unsafe_fixture_cleanup");
    await rm(path, { recursive: true, force: true });
  }
});
describe(
  "phase-specific filesystem execution guard (synthetic only)",
  { timeout: 15000 },
  () => {
    it("reuses the unchanged archive validator and verifies the complete explicit package", async () => {
      const f = await fixture();
      const result = await initialArchiveCheck(
        f.policy,
        fixtureGuards,
        syntheticSecret,
        f.policy.archive.authDir,
        "http://localhost:3000",
        {},
      );
      expect(result.status).toBe("PASS_WITH_APPROVED_AUTH_ARCHIVE_EXCEPTION");
      const m = await loadPackageManifest(
        f.manifestFile,
        f.manifestSha,
        f.policy,
        fixtureGuards,
      );
      await verifyPackageFiles(m, f.policy);
      expect(
        (
          await verifyAuthBoundary(
            m,
            f.policy,
            fixtureGuards,
            syntheticSecret,
            f.candidateBefore,
            f.now,
          )
        ).historicalAuthPreserved,
      ).toBe(true);
    }, 15000); // Bounded filesystem integration; Windows startup IO may exceed 5s.
    it.each(["", "old"])(
      "rejects absent/stale cookie selection %s",
      async (v) => {
        const f = await fixture();
        expect(() =>
          selectCandidate(v ? f.policy.archive.oldCookieFile : v, f.policy),
        ).toThrow("provision_package_failed");
      },
    );
    it("rejects manifest digest drift", async () => {
      const f = await fixture();
      await writeFile(f.manifestFile, "{}");
      await expect(
        loadPackageManifest(
          f.manifestFile,
          f.manifestSha,
          f.policy,
          fixtureGuards,
        ),
      ).rejects.toThrow();
    });
    it("rejects dropped historical/required evidence despite a new manifest hash", async () => {
      const f = await fixture();
      delete f.manifest.files[f.policy.archive.archiveFile];
      const digest = await f.saveManifest();
      await expect(
        loadPackageManifest(f.manifestFile, digest, f.policy, fixtureGuards),
      ).rejects.toThrow();
    });
    it("rejects missing immutable evidence", async () => {
      const f = await fixture();
      await unlink(f.policy.archive.archiveFile);
      await expect(verifyPackageFiles(f.manifest, f.policy)).rejects.toThrow();
    });
    it("rejects a mismatched candidate record binding", async () => {
      const f = await fixture();
      f.manifest.candidateRecord = join(
        f.policy.archive.authDir,
        "session-" + "f".repeat(64) + ".bin",
      );
      await expect(
        verifyAuthBoundary(
          f.manifest,
          f.policy,
          fixtureGuards,
          syntheticSecret,
          f.candidateBefore,
          f.now,
        ),
      ).rejects.toThrow();
    });
    it("permits only candidate ciphertext re-encryption with exactly identical plaintext", async () => {
      const f = await fixture();
      await writeFile(
        f.manifest.candidateRecord,
        encrypt(f.session, basename(f.manifest.candidateRecord).slice(0, -4)),
      );
      await expect(verifyPackageFiles(f.manifest, f.policy)).rejects.toThrow();
      await verifyPackageFiles(f.manifest, f.policy, f.candidateBefore);
      expect(
        await verifyAuthBoundary(
          f.manifest,
          f.policy,
          fixtureGuards,
          syntheticSecret,
          f.candidateBefore,
          f.now,
        ),
      ).toMatchObject({
        semanticContentsUnchanged: true,
        candidateCiphertextChanged: true,
      });
    });
    it.each([
      "githubId",
      "workspace",
      "expiresAt",
      "tokenExpiresAt",
      "userToken",
      "refreshToken",
      "flow",
      "unexpected",
    ])("rejects changed candidate semantic field %s", async (field) => {
      const f = await fixture(),
        name = basename(f.manifest.candidateRecord).slice(0, -4);
      expect(() =>
        candidateSemantics(
          f.candidateBefore,
          encrypt({ ...f.session, [field]: "SYNTHETIC_CHANGED" }, name),
          name,
          syntheticSecret,
          f.now,
        ),
      ).toThrow();
    });
    it.each([29, -1])(
      "rejects insufficient/expired token lifetime %s",
      async (minutes) => {
        const f = await fixture(),
          name = basename(f.manifest.candidateRecord).slice(0, -4),
          bytes = encrypt(
            { ...f.session, tokenExpiresAt: f.now + minutes * 60000 },
            name,
          );
        expect(() =>
          candidateSemantics(bytes, bytes, name, syntheticSecret, f.now),
        ).toThrow();
      },
    );
    it("rejects an expired local session", async () => {
      const f = await fixture(),
        name = basename(f.manifest.candidateRecord).slice(0, -4),
        bytes = encrypt({ ...f.session, expiresAt: f.now - 1 }, name);
      expect(() =>
        candidateSemantics(bytes, bytes, name, syntheticSecret, f.now),
      ).toThrow();
    });
    it("rejects a reappearing archived session", async () => {
      const f = await fixture();
      await writeFile(
        f.policy.archive.absentSessionFile,
        await readFile(f.policy.archive.archiveFile),
      );
      await expect(
        verifyPackageFiles(f.manifest, f.policy, f.candidateBefore),
      ).rejects.toThrow();
    });
    it("rejects a second missing historical session", async () => {
      const f = await fixture();
      const old = Object.keys(f.manifest.files).find(
        (p) =>
          p.startsWith(f.policy.archive.authDir) &&
          basename(p).startsWith("session-") &&
          p !== f.manifest.candidateRecord,
      )!;
      await unlink(old);
      await expect(
        verifyPackageFiles(f.manifest, f.policy, f.candidateBefore),
      ).rejects.toThrow();
    });
    it("rejects unacknowledged temporary auth writes", async () => {
      const f = await fixture();
      await writeFile(f.manifest.candidateRecord + ".tmp", "SYNTHETIC");
      await expect(
        verifyAuthBoundary(
          f.manifest,
          f.policy,
          fixtureGuards,
          syntheticSecret,
          f.candidateBefore,
          f.now,
        ),
      ).rejects.toThrow();
    });
    it.each(["user-187839747.bin", "canvas-graphs-v1"])(
      "rejects profile/cache mutation %s",
      async (name) => {
        const f = await fixture();
        const file = Object.keys(f.manifest.files).find((p) =>
          p.startsWith(join(f.policy.archive.authDir, name)),
        )!;
        await writeFile(file, "SYNTHETIC_CHANGED");
        await expect(
          verifyPackageFiles(f.manifest, f.policy, f.candidateBefore),
        ).rejects.toThrow();
      },
    );
    it("detects time-of-check/time-of-use drift instead of trusting a previous PASS", async () => {
      const f = await fixture();
      await verifyPackageFiles(f.manifest, f.policy);
      await writeFile(f.policy.archive.candidateFile + ".meta.json", "{}");
      await expect(
        verifyPackageFiles(f.manifest, f.policy, f.candidateBefore),
      ).rejects.toThrow();
    });
    it("rejects private ACL failure", async () => {
      const f = await fixture();
      await expect(
        loadPackageManifest(f.manifestFile, f.manifestSha, f.policy, {
          ...fixtureGuards,
          assertPrivateAcl() {
            throw Error("SYNTHETIC_ACL");
          },
        }),
      ).rejects.toThrow();
    });
    it("emits no credentials or raw records in successful boundary evidence", async () => {
      const f = await fixture();
      const text = JSON.stringify(
        await verifyAuthBoundary(
          f.manifest,
          f.policy,
          fixtureGuards,
          syntheticSecret,
          f.candidateBefore,
          f.now,
        ),
      );
      for (const secret of [
        syntheticSecret,
        "SYNTHETIC_ACCESS",
        "SYNTHETIC_REFRESH",
        "wetscan_session=",
      ])
        expect(text).not.toContain(secret);
    });
    it("accepts only a fresh one-attempt manifest-bound owner grant", async () => {
      const f = await fixture();
      expect(
        validatePackageGrant(
          f.grant,
          f.manifestSha,
          f.grant.runnerSha256,
          f.policy.archive.candidateFile,
          f.grant.outputDirectory,
          f.now,
        ),
      ).toBe(Date.parse(f.grant.expiresAt));
    });
    it.each([
      { phase: "preservation-audit" },
      { status: "CLOSED" },
      { attempts: 2 },
      { allowRefresh: true },
      { allowCandidatePersistence: false },
      { allowProviderReads: false },
      { allowActiveHandoff: false },
      { allowEmergencyContainment: false },
      { normalNewRows: 11 },
      { emergencyNewRows: 13 },
      { historicalRowsModified: 1 },
      { manifestSha256: "0".repeat(64) },
      { candidateFile: "other" },
      { workspace: "other" },
    ])("rejects invalid live scope %j", async (change) => {
      const f = await fixture();
      expect(() =>
        validatePackageGrant(
          { ...f.grant, ...change },
          f.manifestSha,
          f.grant.runnerSha256,
          f.policy.archive.candidateFile,
          f.grant.outputDirectory,
          f.now,
        ),
      ).toThrow();
    });
    it("rejects missing, future, expired and overlong live authorization", async () => {
      const f = await fixture();
      for (const g of [
        undefined,
        { ...f.grant, notBefore: new Date(f.now + 1).toISOString() },
        { ...f.grant, expiresAt: new Date(f.now - 1).toISOString() },
        { ...f.grant, expiresAt: new Date(f.now + 600001).toISOString() },
      ])
        expect(() =>
          validatePackageGrant(
            g!,
            f.manifestSha,
            f.grant.runnerSha256,
            f.policy.archive.candidateFile,
            f.grant.outputDirectory,
            f.now,
          ),
        ).toThrow();
    });
    it("rechecks grant expiry at every later boundary", async () => {
      const f = await fixture();
      validatePackageGrant(
        f.grant,
        f.manifestSha,
        f.grant.runnerSha256,
        f.policy.archive.candidateFile,
        f.grant.outputDirectory,
        f.now,
      );
      expect(() =>
        validatePackageGrant(
          f.grant,
          f.manifestSha,
          f.grant.runnerSha256,
          f.policy.archive.candidateFile,
          f.grant.outputDirectory,
          f.now + 600000,
        ),
      ).toThrow();
    });
    it("distinguishes persisted row budgets from conflict-guarded statement counts", () => {
      expect(packageBudget).toMatchObject({
        normalNewRows: 10,
        emergencyNewRows: 12,
        normalInsertStatements: 11,
        projectBindingRowsModified: 0,
        historicalRowsModified: 0,
      });
    });
    it("rejects unauthorized existing binding modification and excess persisted rows", async () => {
      const d = provisionFixture();
      const result = await executeProvision(d.deps);
      const changed = structuredClone(d.state);
      changed.rowsByTable["sentinel.project_bindings"][0].row.revision = 999;
      refresh(changed);
      expect(() =>
        verifyProvisionDelta(d.start, changed, result.ids, { allowApp: true }),
      ).toThrow();
      const excess = structuredClone(d.state);
      excess.rowsByTable["platform.jobs"].push(
        structuredClone(excess.rowsByTable["platform.jobs"].at(-1)!),
      );
      refresh(excess);
      expect(() =>
        verifyProvisionDelta(d.start, excess, result.ids, { allowApp: true }),
      ).toThrow();
    });
    it("has no permissive fallback for an incomplete database snapshot", () => {
      const start = fixtureState(),
        end = structuredClone(start);
      delete end.rowHashesByTable["platform.jobs"];
      expect(() =>
        verifyProvisionDelta(start, end, {}, { partial: true }),
      ).toThrow();
    });
    it("rejects duplicate JSON authority fields and ambiguous grant timestamps", async () => {
      expect(() =>
        parseObject(Buffer.from('{"attempts":1,"attempts":2}')),
      ).toThrow();
      const f = await fixture();
      expect(() =>
        validatePackageGrant(
          { ...f.grant, notBefore: "11/16/2026 01:00:00" },
          f.manifestSha,
          f.grant.runnerSha256,
          f.policy.archive.candidateFile,
          f.grant.outputDirectory,
          f.now,
        ),
      ).toThrow();
      expect(() =>
        validatePackageGrant(
          { ...f.grant, allowMigrations: true } as typeof f.grant,
          f.manifestSha,
          f.grant.runnerSha256,
          f.policy.archive.candidateFile,
          f.grant.outputDirectory,
          f.now,
        ),
      ).toThrow();
    });
    it("rejects altered candidate cookies even when ciphertext allowance is active", async () => {
      const f = await fixture();
      await writeFile(
        f.policy.archive.candidateFile,
        "wetscan_session=" + "f".repeat(64),
      );
      await expect(
        verifyAuthBoundary(
          f.manifest,
          f.policy,
          fixtureGuards,
          syntheticSecret,
          f.candidateBefore,
          f.now,
        ),
      ).rejects.toThrow();
    });
    it("rejects missing before-state evidence", async () => {
      const f = await fixture();
      await expect(
        bytesAt(join(f.policy.root, "missing.bin")),
      ).rejects.toThrow();
    });
  },
);

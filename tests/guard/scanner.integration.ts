import { expect, it } from "vitest";
import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { runOpengrepFixture, pin } from "../../worker/guard/fixture-runner";
import { normalizeOpengrep } from "../../src/features/guard/evidence";
it("runs pinned Opengrep on reviewed vulnerable/fixed fixtures and records redacted evidence", async () => {
  const results = [];
  for (const target of ["vulnerable.js", "fixed.js"] as const) {
    const result = await runOpengrepFixture(target);
    const findings = await normalizeOpengrep(result.output, {
      workspaceId: "synthetic-verification",
      projectId: "sast-fixture",
      mode: "demo",
      commit: result.targetSha256,
      artifactDigest: createHash("sha256")
        .update(JSON.stringify(result.output))
        .digest("hex"),
      recordedAt: new Date().toISOString(),
      scannerVersion: result.scannerVersion,
      rulePack: result.ruleSha256,
      synthetic: true,
    });
    expect(findings).toHaveLength(target === "vulnerable.js" ? 1 : 0);
    results.push({
      target,
      ...result,
      output: undefined,
      findings,
      purpose: "Actual CLI execution against reviewed synthetic fixture only",
    });
  }
  await mkdir("tests/guard/evidence", { recursive: true });
  await writeFile(
    "tests/guard/evidence/opengrep-verification.json",
    JSON.stringify(
      {
        pin,
        results,
        limitations: [
          "No customer code scanned",
          "Host fixture harness is not a production sandbox",
          "Clean static output is not verified_fixed",
          "Fixture source SHA256 is a content version, not a Git commit",
        ],
      },
      null,
      2,
    ) + "\n",
  );
});

it("runs pinned Gitleaks on a synthetic marker and clean control without storing matched values", async () => {
  const { runGitleaksFixture, gitleaksPin } =
    await import("../../worker/guard/gitleaks-fixture");
  const { normalizeGitleaks } =
    await import("../../src/features/guard/evidence");
  const results = [];
  for (const target of ["exposed.js", "clean.js"] as const) {
    const result = await runGitleaksFixture(target);
    const findings = await normalizeGitleaks(result.output, {
      workspaceId: "synthetic-verification",
      projectId: "secret-fixture",
      mode: "demo",
      commit: result.targetSha256,
      artifactDigest: result.artifactDigest,
      recordedAt: new Date().toISOString(),
      scannerVersion: gitleaksPin.version,
      rulePack: result.ruleSha256,
      synthetic: true,
    });
    expect(findings).toHaveLength(target === "exposed.js" ? 1 : 0);
    expect(JSON.stringify(findings)).not.toContain("ABCDEFGHIJKLMNOPQRSTUVWX");
    results.push({
      target,
      ...result,
      output: undefined,
      findings,
      purpose:
        "Actual Gitleaks CLI against nonfunctional synthetic marker only",
    });
  }
  await mkdir("tests/guard/evidence", { recursive: true });
  await writeFile(
    "tests/guard/evidence/gitleaks-verification.json",
    JSON.stringify(
      {
        pin: gitleaksPin,
        results,
        limitations: [
          "Synthetic custom rule only; not a production provider rule-pack test",
          "No customer code or history scanned",
          "Fixture source SHA256 is used as evidence version, not a Git commit",
        ],
      },
      null,
      2,
    ) + "\n",
  );
});

it.each(["osv", "trivy"] as const)(
  "runs pinned %s on controlled vulnerable/fixed static fixtures",
  async (tool) => {
    const { additionalPins, runAdditionalFixture } =
      await import("../../worker/guard/additional-fixtures");
    const { normalizeOSV, normalizeTrivy, normalizeOSVInventory } =
      await import("../../src/features/guard/evidence");
    const pin = additionalPins[tool],
      results = [];
    for (const variant of ["vulnerable", "fixed"] as const) {
      const result = await runAdditionalFixture(tool, variant);
      const context = {
        workspaceId: "synthetic-verification",
        projectId: tool + "-fixture",
        mode: "demo" as const,
        commit: result.targetSha256,
        artifactDigest: result.artifactDigest,
        recordedAt: new Date().toISOString(),
        scannerVersion: pin.version,
        rulePack:
          tool === "trivy"
            ? "embedded-" + pin.binarySha256
            : "OSV advisory service queried at recordedAt",
        synthetic: true,
      };
      const findings =
        tool === "osv"
          ? await normalizeOSV(result.output, context)
          : await normalizeTrivy(result.output, context, "iac");
      // Trivy controls only the four public-access checks. Retain unrelated findings honestly.
      const targeted =
        tool === "trivy"
          ? findings.filter((f) => /public|ACL/i.test(f.title))
          : findings;
      if (variant === "vulnerable") expect(targeted.length).toBeGreaterThan(0);
      else expect(targeted).toHaveLength(0);
      results.push({
        variant,
        ...result,
        output: undefined,
        findings,
        targetedFindingCount: targeted.length,
        inventory:
          tool === "osv" ? normalizeOSVInventory(result.output) : undefined,
      });
    }
    await writeFile(
      "tests/guard/evidence/" + tool + "-verification.json",
      JSON.stringify(
        {
          pin,
          results,
          limitations: [
            "Controlled static fixture only; no customer scan",
            "No code/package/Terraform execution",
            "No production sandbox or egress enforcement",
            "Fixture source SHA256 is a content version, not a Git commit",
            ...(tool === "osv"
              ? [
                  "Advisory dataset is online/time-varying; recorded normalized advisories are evidence for this run only",
                  "OSV fallback severity is medium pending CVSS review",
                ]
              : []),
          ],
        },
        null,
        2,
      ) + "\n",
    );
  },
);

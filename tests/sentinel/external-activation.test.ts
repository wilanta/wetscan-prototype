import { describe, expect, it } from "vitest";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseApproval } from "../../src/platform/config";
import { externalActivation } from "../../src/features/sentinel/external/activation";

const block = (over: Record<string, unknown> = {}) => ({
  mode: "live",
  workspaceId: "github-user-7:fixture",
  projectId: "github-123",
  notBefore: "2026-11-19T00:00:00.000Z",
  providers: ["cisa_kev", "ghsa", "osv"],
  approvedUse: "public_advisory_feeds",
  ...over,
});
const approval = (externalIntel?: unknown) =>
  ({
    schemaVersion: 1,
    status: "APPROVED",
    approvedBy: "owner",
    approvedAt: "2026-11-18T00:00:00.000Z",
    target: {
      host: "127.0.0.1",
      port: 55432,
      database: "wetscan_dev",
      marker: "wetscan-s01:x",
    },
    actions: ["runtime"],
    migrationPlanSha256: "a".repeat(64),
    ...(externalIntel === undefined ? {} : { externalIntel }),
  }) as unknown as DatabaseApproval;
const ON = { SENTINEL_EXTERNAL_INTEL_ENABLED: "1" };
const denied = (p: Promise<unknown>) =>
  p.then(
    () => "resolved",
    (e) => (e as { code: string }).code,
  );

describe("S09 outbound-network gate (fail closed)", () => {
  it("is off unless BOTH the flag and an owner approval block exist", async () => {
    expect(await externalActivation(approval(block()), {})).toBeUndefined();
    expect(
      await externalActivation(approval(block()), {
        SENTINEL_EXTERNAL_INTEL_ENABLED: "true",
      }),
    ).toBeUndefined();
    expect(await denied(externalActivation(approval(), ON))).toBe(
      "approval_required",
    ); // flag alone enables nothing
  });
  it("binds the activation to one live project scope, named providers and a fixed approved use", async () => {
    const a = await externalActivation(approval(block()), ON);
    expect(a).toMatchObject({
      scope: {
        mode: "live",
        workspaceId: "github-user-7:fixture",
        projectId: "github-123",
      },
      providers: ["cisa_kev", "ghsa", "osv"],
      intervalMs: 6 * 3_600_000,
      budgetMs: 40_000,
    });
    expect(
      (await externalActivation(
        approval(block({ providers: ["ghsa", "ghsa"] })),
        ON,
      ))!.providers,
    ).toEqual(["ghsa"]);
  });
  it.each([
    ["demo mode", { mode: "demo" }],
    ["another use", { approvedUse: "scan_third_parties" }],
    ["unknown provider (NVD is not implemented)", { providers: ["nvd"] }],
    ["no providers", { providers: [] }],
    ["malformed project", { projectId: "orderly-demo" }],
    ["missing workspace", { workspaceId: "" }],
    [
      "notBefore earlier than the approval",
      { notBefore: "2026-01-01T00:00:00.000Z" },
    ],
    ["unexpected key", { url: "https://evil.example" }],
  ])("refuses %s", async (_name, over) => {
    expect(await denied(externalActivation(approval(block(over)), ON))).toBe(
      "approval_required",
    );
  });
  it("bounds the schedule and sync budget", async () => {
    expect(
      await denied(
        externalActivation(approval(block()), {
          ...ON,
          SENTINEL_FEED_INTERVAL_MS: "1000",
        }),
      ),
    ).toBe("approval_required");
    expect(
      await denied(
        externalActivation(approval(block()), {
          ...ON,
          SENTINEL_FEED_SYNC_BUDGET_MS: "999999",
        }),
      ),
    ).toBe("approval_required");
    expect(
      (await externalActivation(approval(block()), {
        ...ON,
        SENTINEL_FEED_INTERVAL_MS: "900000",
      }))!.intervalMs,
    ).toBe(900000);
  });
  it("reads the optional GHSA token from an absolute file only, never from the environment", async () => {
    const dir = await mkdtemp(join(tmpdir(), "s09-token-"));
    const good = join(dir, "t");
    await writeFile(good, "ghp_" + "x".repeat(36) + "\n");
    expect(
      (await externalActivation(approval(block()), {
        ...ON,
        SENTINEL_FEED_GHSA_TOKEN_FILE: good,
      }))!.ghsaToken,
    ).toBe("ghp_" + "x".repeat(36));
    expect(
      await denied(
        externalActivation(approval(block()), {
          ...ON,
          SENTINEL_FEED_GHSA_TOKEN_FILE: "relative/token",
        }),
      ),
    ).toBe("approval_required");
    expect(
      await denied(
        externalActivation(approval(block()), {
          ...ON,
          SENTINEL_FEED_GHSA_TOKEN_FILE: join(dir, "missing"),
        }),
      ),
    ).toBe("approval_required");
    const short = join(dir, "s");
    await writeFile(short, "tiny");
    expect(
      await denied(
        externalActivation(approval(block()), {
          ...ON,
          SENTINEL_FEED_GHSA_TOKEN_FILE: short,
        }),
      ),
    ).toBe("approval_required");
    // A token placed in the environment is simply ignored.
    expect(
      (await externalActivation(approval(block()), {
        ...ON,
        GITHUB_TOKEN: "ghp_" + "y".repeat(36),
      }))!.ghsaToken,
    ).toBeUndefined();
  });
});

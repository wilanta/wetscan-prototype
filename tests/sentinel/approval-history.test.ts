import { createHash } from "node:crypto";
import {
  link,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, relative, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  discoverHistoricalApprovals,
  historicalApprovalDirectory,
  historicalMetadata,
  requireHistoricalClosed,
  staleApprovalPins,
  type HistoryOptions,
} from "../../scripts/sentinel-approval-history";
import { previewHistoricalClosure } from "../../scripts/sentinel-approval-remediation";
import { parseApproval, type ApprovedAction } from "../../src/platform/config";
import { s04DevBaseline, s04DevTarget } from "./dev-acceptance-safety";
import {
  auditKind,
  auditPhase,
  auditAction,
  auditPlan,
} from "../../scripts/sentinel-readonly-audit-contract";

const approval = () => ({
  schemaVersion: 1,
  status: "CLOSED",
  approvedBy: "invalid-offline-fixture",
  approvedAt: "2020-01-01T00:00:00.000Z",
  target: s04DevTarget,
  migrationPlanSha256: s04DevBaseline.planSha256,
  actions: [] as string[],
  h04cB2: { phase: "provision-ingest", expiresAt: "2020-01-01T00:10:00.000Z" },
  closedAt: "2020-01-01T00:01:00.000Z",
});
const hash = (bytes: Buffer) =>
  createHash("sha256").update(bytes).digest("hex");
describe("offline historical H04C-B2 approval discovery (no DB or runtime)", () => {
  let fixtureRoot: string,
    seq = 0;
  beforeAll(async () => {
    fixtureRoot = await mkdtemp(join(tmpdir(), "wetscan-approval-history-"));
  });
  afterAll(async () => {
    if (
      !basename(fixtureRoot).startsWith("wetscan-approval-history-") ||
      relative(resolve(tmpdir()), resolve(fixtureRoot)).startsWith("..")
    )
      throw new Error("fixture_cleanup");
    await rm(fixtureRoot, { recursive: true, force: true });
  });
  async function fixture(
    name = "app-approval.json",
    value: unknown = approval(),
  ) {
    const root = join(fixtureRoot, `case-${seq++}`),
      dir = join(root, historicalApprovalDirectory);
    await mkdir(dir, { recursive: true });
    const path = join(dir, name);
    await writeFile(
      path,
      typeof value === "string" ? value : JSON.stringify(value),
    );
    const options: HistoryOptions = {
      root,
      verifyBoundary: () => {},
      verifyDirectory: () => {},
      requiredPaths: [path],
    };
    return { root, dir, path, options };
  }
  it("discovers audit-only metadata under unexpected names and blocks unresolved audit approvals", async () => {
    const f = await fixture("unexpected-audit.json");
    const a = {
      schemaVersion: 1,
      kind: auditKind,
      phase: auditPhase,
      status: "APPROVED",
      approvedBy: "EXPIRED_OFFLINE_FIXTURE",
      approvedAt: "2020-01-01T00:00:00.000Z",
      expiresAt: "2020-01-01T00:02:00.000Z",
      actions: [auditAction],
      target: s04DevTarget,
      migrationPlanSha256: auditPlan,
      inputManifestSha256: "f".repeat(64),
      runId: "a".repeat(32),
      outputDirectory: f.dir,
    };
    await writeFile(f.path, JSON.stringify(a));
    const open = await discoverHistoricalApprovals(f.options);
    expect(open).toHaveLength(1);
    expect(() => requireHistoricalClosed(open)).toThrow(
      "prior_approval_not_closed",
    );
    await writeFile(
      f.path,
      JSON.stringify({
        ...a,
        status: "CLOSED",
        actions: [],
        closedAt: "2020-01-01T00:03:00.000Z",
      }),
    );
    expect(() => requireHistoricalClosed(open)).toThrow();
    const closed = await discoverHistoricalApprovals(f.options);
    expect(() => requireHistoricalClosed(closed)).not.toThrow();
    const reports = join(f.root, "s04-dev-preservation-report");
    await mkdir(reports);
    await writeFile(
      join(reports, "audit-result.sanitized.json"),
      JSON.stringify({
        status: "PASS",
        phase: "preservation-audit",
        databaseMutations: 0,
      }),
    );
    expect(await discoverHistoricalApprovals(f.options)).toHaveLength(1);
    await writeFile(
      f.path,
      JSON.stringify({
        ...a,
        status: "CLOSED",
        actions: [],
        closedAt: "2020-01-01T00:03:00.000Z",
        outputDirectory: reports,
      }),
    );
    await expect(discoverHistoricalApprovals(f.options)).rejects.toThrow(
      "history_metadata",
    );
  });
  it.each(Object.keys(staleApprovalPins))(
    "discovers historical filename %s",
    async (name) => {
      const f = await fixture(name);
      const records = await discoverHistoricalApprovals(f.options);
      expect(records.map((a) => a.path)).toEqual([f.path]);
      expect(() => requireHistoricalClosed(records)).not.toThrow();
    },
  );
  it.each([
    "CLOSED",
    "CLOSED_H04C_B2_READONLY_PREFLIGHT",
    "CLOSED_AFTER_H04C_B2",
  ])("preserves reviewed terminal status %s", async (status) => {
    const f = await fixture("app-approval.json", { ...approval(), status });
    const found = await discoverHistoricalApprovals(f.options);
    expect(() => requireHistoricalClosed(found)).not.toThrow();
  });
  async function runtimeClosure(
    dir: string,
    name = "controller-runtime-approval.json",
  ) {
    const beforeFile = name + ".before-" + "a".repeat(32) + ".bin";
    const before = Buffer.from(
      JSON.stringify({
        ...approval(),
        status: "APPROVED",
        actions: ["runtime"],
        closedAt: undefined,
      }),
    );
    const after = Buffer.from(JSON.stringify(approval()));
    const receipt = {
      status: "CLOSED",
      outputDirectory: dir,
      approvalFile: name,
      beforeFile,
      beforeSha256: hash(before),
      afterSha256: hash(after),
      closedAt: approval().closedAt,
    };
    await writeFile(join(dir, beforeFile), before);
    await writeFile(join(dir, name), after);
    await writeFile(
      join(dir, name + ".closure.sanitized.json"),
      JSON.stringify(receipt),
    );
    return { receipt, before, after };
  }
  it("discovers both runtime approvals before and after closure without treating verified receipts/backups/journals as new approvals", async () => {
    const f = await fixture();
    for (const name of [
      "web-runtime-approval.json",
      "controller-runtime-approval.json",
    ])
      await writeFile(
        join(f.dir, name),
        JSON.stringify({
          ...approval(),
          status: "APPROVED",
          actions: ["runtime"],
        }),
      );
    const open = await discoverHistoricalApprovals(f.options);
    expect(open).toHaveLength(3);
    expect(() => requireHistoricalClosed(open)).toThrow();
    for (const name of [
      "web-runtime-approval.json",
      "controller-runtime-approval.json",
    ])
      await runtimeClosure(f.dir, name);
    await writeFile(
      join(f.dir, "owned-processes.jsonl"),
      '{"pid":1,"startTicks":"1234"}\n{"pid":2,"startTicks":"2345"}\n',
    );
    await writeFile(
      join(f.dir, "resource-journal.private.jsonl"),
      ["intent", "response"]
        .map((type) =>
          JSON.stringify({
            type,
            operation: "source-create",
            ids: {},
            at: "2020-01-01T00:00:00Z",
          }),
        )
        .join("\n"),
    );
    const original = await readFile(f.path);
    const closed = await discoverHistoricalApprovals(f.options);
    expect(closed).toHaveLength(3);
    expect(() => requireHistoricalClosed(closed)).not.toThrow();
    expect(await readFile(f.path)).toEqual(original);
  });
  it.each([
    "hash",
    "path",
    "untrackedBackup",
    "changedField",
    "extraAction",
    "missingReceipt",
    "forgedReceipt",
  ])("fails closed for %s closure evidence", async (fault) => {
    const f = await fixture();
    const { receipt } = await runtimeClosure(f.dir);
    const receiptPath = join(
      f.dir,
      "controller-runtime-approval.json.closure.sanitized.json",
    );
    if (fault === "hash") receipt.beforeSha256 = "0".repeat(64);
    if (fault === "path") receipt.beforeFile = "../outside.bin";
    if (fault === "untrackedBackup")
      await writeFile(
        join(
          f.dir,
          "controller-runtime-approval.json.before-" + "b".repeat(32) + ".bin",
        ),
        "{}",
      );
    if (["changedField", "extraAction"].includes(fault)) {
      const after = Buffer.from(
        JSON.stringify({
          ...approval(),
          ...(fault === "changedField"
            ? { approvedBy: "changed" }
            : { actions: ["runtime"] }),
        }),
      );
      receipt.afterSha256 = hash(after);
      await writeFile(join(f.dir, "controller-runtime-approval.json"), after);
    }
    await writeFile(
      receiptPath,
      fault === "forgedReceipt"
        ? JSON.stringify(approval())
        : JSON.stringify(receipt),
    );
    if (fault === "missingReceipt") await rm(receiptPath);
    await expect(discoverHistoricalApprovals(f.options)).rejects.toThrow(
      /history_/,
    );
  });
  it.each(["owned-processes.jsonl", "resource-journal.private.jsonl"])(
    "rejects approval metadata hidden in %s",
    async (name) => {
      const f = await fixture();
      await writeFile(
        join(f.dir, name),
        JSON.stringify({ ...approval(), status: "APPROVED" }),
      );
      await expect(discoverHistoricalApprovals(f.options)).rejects.toThrow(
        /history_/,
      );
      await writeFile(join(f.dir, name), "{malformed\n{}");
      await expect(discoverHistoricalApprovals(f.options)).rejects.toThrow(
        /history_/,
      );
    },
  );
  it.each(["unexpected-name.json", "unexpected.data", "no-extension"])(
    "discovers metadata in %s without a filename allowlist",
    async (name) => {
      const f = await fixture(name, { ...approval(), status: "APPROVED" });
      const found = await discoverHistoricalApprovals(f.options);
      expect(found).toHaveLength(1);
      expect(() => requireHistoricalClosed(found)).toThrow(
        "prior_approval_not_closed",
      );
    },
  );
  it.each([
    ["APPROVED", []],
    ["APPROVED", ["runtime"]],
    ["CLOSED", ["runtime"]],
  ])("blocks %s with actions %j", async (status, actions) => {
    const f = await fixture("app-approval.json", {
      ...approval(),
      status,
      actions,
    });
    const found = await discoverHistoricalApprovals(f.options);
    expect(() => requireHistoricalClosed(found)).toThrow(
      "prior_approval_not_closed",
    );
  });
  it("one unresolved approval blocks the other eight closed approvals", async () => {
    const f = await fixture();
    for (const name of Object.keys(staleApprovalPins))
      await writeFile(
        join(f.dir, name),
        JSON.stringify({
          ...approval(),
          status: name === "worker2-approval.json" ? "APPROVED" : "CLOSED",
        }),
      );
    const found = await discoverHistoricalApprovals(f.options);
    expect(found).toHaveLength(9);
    expect(() => requireHistoricalClosed(found)).toThrow(
      "prior_approval_not_closed",
    );
  });
  it("finds H04C-B2 metadata under an unexpected directory name within the verified private root", async () => {
    const f = await fixture(),
      other = join(f.root, "unexpected-history");
    await mkdir(other);
    await writeFile(
      join(other, "state.data.json"),
      JSON.stringify({ ...approval(), status: "APPROVED" }),
    );
    const records = await discoverHistoricalApprovals(f.options);
    expect(records).toHaveLength(2);
    expect(() => requireHistoricalClosed(records)).toThrow(
      "prior_approval_not_closed",
    );
  });
  it("rejects duplicate JSON approval keys rather than accepting the last status", async () => {
    const raw = JSON.stringify(approval()).replace(
      '"status":"CLOSED"',
      '"status":"APPROVED","status":"CLOSED"',
    );
    const f = await fixture("app-approval.json", raw);
    await expect(discoverHistoricalApprovals(f.options)).rejects.toThrow(
      "history_json_duplicate_key",
    );
  });
  it.each([
    "schemaVersion",
    "status",
    "actions",
    "approvedBy",
    "approvedAt",
    "target",
    "migrationPlanSha256",
    "h04cB2",
  ])("fails closed on missing %s", async (field) => {
    const a: Record<string, unknown> = approval();
    delete a[field];
    const f = await fixture("worker1-approval.json", a);
    await expect(discoverHistoricalApprovals(f.options)).rejects.toThrow(
      /history_/,
    );
  });
  it.each([
    { h04cB2: {} },
    { h04cB2: { phase: "unknown", expiresAt: "2020-01-01T00:10:00Z" } },
    { actions: "" },
    { actions: ["runtime", "runtime"] },
    { actions: ["unrestricted"] },
    { target: { ...s04DevTarget, database: "wetscan_s01_test" } },
    { approvedAt: "yesterday" },
    { closedAt: "invalid" },
    { status: "CLOSEDISH" },
    { status: "CLOSED_UNREVIEWED" },
  ])("fails closed on malformed approval metadata %j", async (delta) => {
    const f = await fixture("mystery.json", { ...approval(), ...delta });
    await expect(discoverHistoricalApprovals(f.options)).rejects.toThrow(
      /history_/,
    );
  });
  it("CLOSED without closedAt does not satisfy lifecycle closure", async () => {
    const a: Record<string, unknown> = approval();
    delete a.closedAt;
    const f = await fixture("app-approval.json", a);
    expect(() => historicalMetadata(a)).not.toThrow();
    expect(() =>
      requireHistoricalClosed([
        {
          ...historicalMetadata(a),
          path: f.path,
          sha256: "",
          createdAt: "",
          modifiedAt: "",
        },
      ]),
    ).toThrow("prior_approval_not_closed");
  });
  it.each(["{", "null", "[]"])(
    "rejects malformed/empty approval JSON %s",
    async (value) => {
      const f = await fixture("app-approval.json", value);
      await expect(discoverHistoricalApprovals(f.options)).rejects.toThrow(
        /history_/,
      );
    },
  );
  it("requires all nine known files instead of ignoring a missing approval", async () => {
    const f = await fixture();
    delete f.options.requiredPaths;
    await expect(discoverHistoricalApprovals(f.options)).rejects.toThrow(
      "history_required_missing",
    );
  });
  it("fails closed on an unreadable boundary", async () => {
    const f = await fixture();
    f.options.verifyBoundary = () => {
      throw new Error("EACCES");
    };
    await expect(discoverHistoricalApprovals(f.options)).rejects.toThrow(
      "history_unreadable",
    );
  });
  it("fails closed on an inaccessible file, without leaking an OS message", async () => {
    const f = await fixture();
    f.options.verifyBoundary = (path) => {
      if (path === f.path) throw new Error("fixture confidential path EACCES");
    };
    await expect(discoverHistoricalApprovals(f.options)).rejects.toThrow(
      "history_unreadable",
    );
  });
  it("rejects duplicate required references", async () => {
    const f = await fixture();
    f.options.requiredPaths = [f.path, f.path];
    await expect(discoverHistoricalApprovals(f.options)).rejects.toThrow(
      "history_duplicate_reference",
    );
  });
  it("never follows an outside required reference", async () => {
    const f = await fixture();
    f.options.requiredPaths = [join(fixtureRoot, "outside.json")];
    await expect(discoverHistoricalApprovals(f.options)).rejects.toThrow(
      "history_boundary",
    );
  });
  it("does not follow a directory junction/symlink outside the approved root", async () => {
    const f = await fixture(),
      external = join(fixtureRoot, `external-${seq++}`);
    await mkdir(external);
    await writeFile(
      join(external, "approval.json"),
      "{never parse this outside file",
    );
    await symlink(
      external,
      join(f.dir, "external-link"),
      process.platform === "win32" ? "junction" : "dir",
    );
    await expect(discoverHistoricalApprovals(f.options)).rejects.toThrow(
      "history_boundary",
    );
  });
  it("rejects hardlinked duplicate approval identities", async () => {
    const f = await fixture();
    await link(f.path, join(f.dir, "alias.json"));
    await expect(discoverHistoricalApprovals(f.options)).rejects.toThrow(
      "history_duplicate_reference",
    );
  });
  it("normalizes legacy PowerShell seven-digit UTC offset timestamps without rewriting", () => {
    expect(
      historicalMetadata({
        ...approval(),
        approvedAt: "2020-01-01T00:00:00.1234567+00:00",
      }).approvedAt,
    ).toContain("+00:00");
  });
  it("dry run changes only status bytes and leaves the file, closedAt and worker metadata untouched", async () => {
    const a = {
      ...approval(),
      status: "APPROVED",
      s04RuntimeAcceptance: { fixture: true },
    };
    const f = await fixture("worker1-approval.json", a),
      bytes = await readFile(f.path);
    const preview = previewHistoricalClosure(bytes, hash(bytes)),
      proposed = JSON.parse(preview.proposed.toString());
    expect(proposed).toEqual({ ...a, status: "CLOSED" });
    expect(preview.proposedAfterSha256).not.toBe(hash(bytes));
    expect(await readFile(f.path)).toEqual(bytes);
  });
  it("dry run rejects hash drift without applying closure", () => {
    const bytes = Buffer.from(
      JSON.stringify({ ...approval(), status: "APPROVED" }),
    );
    expect(() => previewHistoricalClosure(bytes, "0".repeat(64))).toThrow(
      "closure_pin_mismatch",
    );
  });
  it("dry run cannot widen or clear any action", () => {
    const bytes = Buffer.from(
      JSON.stringify({
        ...approval(),
        status: "APPROVED",
        actions: ["runtime"],
      }),
    );
    expect(() => previewHistoricalClosure(bytes, hash(bytes))).toThrow(
      "closure_precondition",
    );
  });
  it.each([
    "runtime",
    "migrate_up",
    "migrate_down",
    "integration_test",
  ] as ApprovedAction[])(
    "current empty actions block real parser action %s without database connections",
    (action) => {
      expect(() =>
        parseApproval(
          { ...approval(), status: "APPROVED" },
          s04DevTarget,
          action,
          s04DevBaseline.planSha256,
        ),
      ).toThrow();
    },
  );
});

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  emergencyContain,
  executeProvision,
  hash,
  provisionContext,
  validateProvisionApprovals,
  verifyProvisionDelta,
  verifyProvisionStart,
  type JournalEntry,
  type ResourceIds,
} from "../../scripts/sentinel-provision-safety";
import {
  baselineFixture,
  fixedNow,
  fixtureState,
  provisionFixture,
  refresh,
  scopeRow,
} from "./provision-fixtures";
import { s04DevBaseline, s04DevTarget } from "./dev-acceptance-safety";

function known(entries: JournalEntry[]) {
  const ids: ResourceIds = {};
  for (const e of entries) if (e.type === "ack") Object.assign(ids, e.ids);
  return ids;
}
function approvals() {
  const a = {
    schemaVersion: 1,
    status: "APPROVED",
    approvedBy: "fixture-owner",
    approvedAt: new Date(fixedNow - 1000).toISOString(),
    target: s04DevTarget,
    actions: ["runtime"],
    migrationPlanSha256: s04DevBaseline.planSha256,
    h04cB2: {
      phase: "provision-ingest",
      expiresAt: new Date(fixedNow + 599000).toISOString(),
    },
  };
  return [structuredClone(a), structuredClone(a)];
}

describe("S04 provision-only exact state and lifecycle controls (in-memory, zero PG/HTTP)", () => {
  it("accepts only the completed containment baseline, preserving 91 original rows and all 16 jobs", () => {
    const start = fixtureState(),
      b = baselineFixture(start);
    expect(() =>
      verifyProvisionStart(start, b.pre, b.historical),
    ).not.toThrow();
  });
  it("verifies a failure-end snapshot before the first mutation using the same preservation algorithm", () => {
    const start = fixtureState();
    const audit = verifyProvisionDelta(
      start,
      structuredClone(start),
      {},
      {
        partial: true,
        emergency: true,
      },
    );
    expect(audit.status).toBe("PASS");
    expect(audit.inserts).toBe(0);
    expect(audit.newQueuedJobIds).toEqual([]);
    const changed = structuredClone(start);
    changed.rowsByTable["platform.jobs"][0].row.attempts = 999;
    refresh(changed);
    expect(() =>
      verifyProvisionDelta(
        start,
        changed,
        {},
        {
          partial: true,
          emergency: true,
        },
      ),
    ).toThrow();
  });
  it.each([
    "sentinel.project_bindings",
    "sentinel.incident_evidence",
    "platform.worker_heartbeats",
    "platform.jobs",
    "sentinel.detection_rules",
  ])("rejects changed pre-existing %s before provisioning", (table) => {
    const start = fixtureState(),
      b = baselineFixture(start);
    start.rowsByTable[table][0].row.unexpected = true;
    refresh(start);
    expect(() => verifyProvisionStart(start, b.pre, b.historical)).toThrow();
  });
  it("executes exactly ten inserts and one queued job; explicit replay is idempotent", async () => {
    const f = provisionFixture(),
      result = await executeProvision(f.deps),
      end = await f.deps.capture();
    const audit = verifyProvisionDelta(f.start, end, result.ids, {
      credentialHash: result.credentialHash,
      preIngestAt: result.preIngestAt,
      expectedEvent: result.expectedEvent,
    });
    expect(audit.inserts).toBe(10);
    expect(audit.newQueuedJobIds).toEqual([f.jid]);
    expect(end.jobsInventory.length).toBe(17);
    expect(
      f.calls.filter((c) => c.path === "ingest" && c.kind === "bearer"),
    ).toHaveLength(2);
    expect(
      f.calls.filter((c) => c.path === "ingest" && c.kind === "bearer")[0].body,
    ).toEqual(
      f.calls.filter((c) => c.path === "ingest" && c.kind === "bearer")[1].body,
    );
    expect(
      end.rowsByTable["sentinel.telemetry_events"].length -
        f.start.rowsByTable["sentinel.telemetry_events"].length,
    ).toBe(1);
    expect(
      f.entries.findIndex(
        (e) => e.operation === "create-source" && e.type === "ack",
      ),
    ).toBeLessThan(f.entries.findIndex((e) => e.operation === "create-rule"));
    expect(
      f.entries.findIndex((e) => e.operation === "allocate-batch-event"),
    ).toBeLessThan(f.entries.findIndex((e) => e.operation === "ingest"));
    expect(f.secrets.length).toBe(1);
    expect(hash(f.secrets[0])).toBe(result.credentialHash);
    expect(JSON.stringify(f.entries).includes(f.token)).toBe(false);
  });
  it("resumes a deadline-stopped run: adopts audited ids, creates nothing, still ends with exactly ten inserts", async () => {
    const f = provisionFixture();
    const stopped = {
      ...f.deps,
      request: async (...a: Parameters<typeof f.deps.request>) => {
        if (a[0] === "ingest" && a[3] === "invalid")
          throw new Error("deadline");
        return f.deps.request(...a);
      },
    };
    await expect(executeProvision(stopped)).rejects.toThrow();
    const ids = known(f.entries),
      secret = f.secrets[0],
      before = f.calls.length;
    expect(ids.batchId).toBeUndefined();
    const result = await executeProvision(f.deps, { ids, credential: secret });
    const after = f.calls.slice(before);
    expect(
      after.filter((c) => c.path === "sources" || c.path === "rules"),
    ).toHaveLength(0);
    expect(after.filter((c) => c.kind === "bearer")).toHaveLength(2);
    const audit = verifyProvisionDelta(
      f.start,
      await f.deps.capture(),
      result.ids,
      {
        credentialHash: result.credentialHash,
        preIngestAt: result.preIngestAt,
        expectedEvent: result.expectedEvent,
      },
    );
    expect(audit.inserts).toBe(10);
    expect(f.secrets).toEqual([secret, secret]);
    await expect(
      executeProvision(f.deps, {
        ids: { ...ids, eventId: "x" },
        credential: secret,
      }),
    ).rejects.toThrow("resume_ingest_started");
  });
  it("context references one private secret file without duplicating the bearer or claiming jobs", async () => {
    const f = provisionFixture(),
      r = await executeProvision(f.deps),
      b = baselineFixture(f.start);
    const ctx = provisionContext(
      "C:/private/fixture",
      b.pre,
      {
        recovery: "C:/private/pre.json",
        containment: "C:/private/contain.json",
      },
      r,
    );
    expect(ctx.credentialFile).toBe(
      "C:/private/fixture/h04c-b2-ingest-credential.secret",
    );
    expect(JSON.stringify(ctx).includes(f.token)).toBe(false);
    expect(ctx.admittedJobIds).toEqual([]);
    expect(ctx.workerIds).toEqual([]);
  });
  it.each(["sourceId", "credentialId", "showOnce", "credential"])(
    "rejects incorrect source response field %s without creating a rule",
    async (field) => {
      const f = provisionFixture(),
        real = f.deps.request;
      f.deps.request = async (...a) => {
        const r = await real(...a);
        if (a[0] === "sources") {
          (r.json as Record<string, unknown>)[field] = null;
        }
        return r;
      };
      await expect(executeProvision(f.deps)).rejects.toThrow();
      expect(f.calls.some((c) => c.path === "rules")).toBe(false);
    },
  );
  it.each(["create", "enable"])(
    "rejects incorrect rule %s revision without ingest",
    async (action) => {
      const f = provisionFixture(),
        real = f.deps.request;
      f.deps.request = async (...a) => {
        const r = await real(...a);
        if (a[0] === "rules" && (a[2] as { action: string })?.action === action)
          (r.json as { revision: number }).revision = 9;
        return r;
      };
      await expect(executeProvision(f.deps)).rejects.toThrow();
      expect(f.calls.some((c) => c.path === "ingest")).toBe(false);
    },
  );
  it.each([
    "create-source",
    "create-rule",
    "enable-rule",
    "ingest",
    "batch-replay",
  ])(
    "records lost response after committed %s and never automatically retries",
    async (operation) => {
      const f = provisionFixture(),
        real = f.deps.request;
      let validIngest = 0;
      let lost = false;
      f.deps.request = async (...a) => {
        const r = await real(...a);
        const body = a[2] as { action?: string } | undefined;
        const name =
          a[0] === "sources"
            ? "create-source"
            : a[0] === "rules"
              ? body?.action === "create"
                ? "create-rule"
                : "enable-rule"
              : a[0] === "ingest" && a[3] === "bearer"
                ? ++validIngest === 1
                  ? "ingest"
                  : "batch-replay"
                : "";
        if (name === operation && !lost) {
          lost = true;
          throw new Error("synthetic_lost_response");
        }
        return r;
      };
      await expect(executeProvision(f.deps)).rejects.toThrow(
        "http_outcome_unknown",
      );
      expect(
        f.entries.filter(
          (e) => e.type === "uncertain" && e.operation === operation,
        ),
      ).toHaveLength(1);
      expect(
        f.entries.filter(
          (e) => e.type === "intent" && e.operation === operation,
        ),
      ).toHaveLength(1);
      if (operation === "create-source") {
        const before = f.calls.length;
        await expect(
          emergencyContain(f.deps, f.start, known(f.entries)),
        ).rejects.toThrow("new_source_identity");
        expect(f.calls.length).toBe(before);
      }
      if (
        operation === "enable-rule" ||
        operation === "ingest" ||
        operation === "batch-replay"
      ) {
        const result = await emergencyContain(
          f.deps,
          f.start,
          known(f.entries),
        );
        expect(result.inserts).toBeLessThanOrEqual(12);
        expect(
          f.calls
            .filter((c) => c.body?.action === "disable" && c.path === "rules")
            .every((c) => c.body?.expectedRevision === 2),
        ).toBe(true);
        expect(
          (await f.deps.capture()).sources.find((s) => s.source_id === f.sid)
            ?.active_credentials,
        ).toBe(0);
      }
    },
  );
  it("contains acknowledged new resources after full provisioning within the twelve-insert ceiling", async () => {
    const f = provisionFixture(),
      r = await executeProvision(f.deps);
    const audit = await emergencyContain(f.deps, f.start, r.ids);
    expect(audit.inserts).toBe(12);
    expect(f.calls.filter((c) => c.body?.action === "revoke")).toHaveLength(1);
    expect(
      f.calls
        .filter((c) => c.body?.action === "disable")
        .map((c) => c.body?.sourceId ?? c.body?.ruleId)
        .sort(),
    ).toEqual([f.sid, f.rid].sort());
    expect(
      (await f.deps.capture()).jobsInventory.find((j) => j.job_id === f.jid)
        ?.state,
    ).toBe("queued");
  });
  it("never guesses a rule ID after lost creation response, preserving unknown-commit evidence", async () => {
    const f = provisionFixture(),
      real = f.deps.request;
    f.deps.request = async (...a) => {
      const r = await real(...a);
      if (a[0] === "rules") throw new Error("lost");
      return r;
    };
    await expect(executeProvision(f.deps)).rejects.toThrow();
    const before = f.calls.length;
    await expect(
      emergencyContain(f.deps, f.start, known(f.entries)),
    ).rejects.toThrow();
    expect(f.calls.length).toBe(before);
  });
  it.each([
    "platform.jobs",
    "sentinel.incident_evidence",
    "platform.worker_heartbeats",
    "sentinel.project_bindings",
  ])("rejects historical changes in %s after provisioning", async (table) => {
    const f = provisionFixture(),
      r = await executeProvision(f.deps);
    f.state.rowsByTable[table][0].row.changed = true;
    expect(() =>
      verifyProvisionDelta(f.start, (refresh(f.state), f.state), r.ids),
    ).toThrow("historical_row_changed");
  });
  it.each([
    "platform.jobs",
    "sentinel.detection_alerts",
    "sentinel.detection_evaluations",
    "sentinel.incidents",
    "platform.job_attempts",
  ])("rejects an extra %s record", async (table) => {
    const f = provisionFixture(),
      r = await executeProvision(f.deps);
    f.state.rowsByTable[table].push({
      hash: "",
      row: { ...scopeRow, id: "unauthorized" },
    });
    refresh(f.state);
    expect(() => verifyProvisionDelta(f.start, f.state, r.ids)).toThrow(
      "mutation_budget",
    );
  });
  it.each([
    "attempts",
    "state",
    "subject_ref",
    "idempotency_key",
    "lease_owner",
  ])("rejects incorrect new job %s", async (field) => {
    const f = provisionFixture(),
      r = await executeProvision(f.deps);
    f.state.rowsByTable["platform.jobs"].find(
      (j) => j.row.job_id === f.jid,
    )!.row[field] = "unauthorized";
    refresh(f.state);
    expect(() => verifyProvisionDelta(f.start, f.state, r.ids)).toThrow(
      "job_attribution",
    );
  });
  it("worker activity prevents the next operation before any mutation", async () => {
    const f = provisionFixture();
    f.deps.guard = async () => {
      throw new Error("worker_activity");
    };
    await expect(executeProvision(f.deps)).rejects.toThrow("worker_activity");
    expect(f.calls.length).toBe(0);
  });
  it("deadline expiry prevents both normal operations and emergency mutations", async () => {
    const f = provisionFixture();
    f.deps.now = () => f.deps.deadlineMs;
    await expect(executeProvision(f.deps)).rejects.toThrow("deadline_expired");
    await expect(emergencyContain(f.deps, f.start, {})).rejects.toThrow(
      "deadline_expired",
    );
    expect(f.calls.length).toBe(0);
  });
  it("expiry after source acknowledgement retains its journal but prevents rule creation", async () => {
    const f = provisionFixture(),
      real = f.deps.saveSecret;
    f.deps.saveSecret = async (v) => {
      await real(v);
      f.deps.now = () => f.deps.deadlineMs;
    };
    await expect(executeProvision(f.deps)).rejects.toThrow("deadline_expired");
    expect(known(f.entries).sourceId).toBe(f.sid);
    expect(f.calls.some((c) => c.path === "rules")).toBe(false);
  });
  it("does not retry failed emergency POSTs", async () => {
    const f = provisionFixture(),
      r = await executeProvision(f.deps),
      real = f.deps.request;
    f.deps.request = async (...a) => {
      if ((a[2] as { action?: string })?.action === "revoke") {
        await real(...a);
        throw new Error("lost_emergency_response");
      }
      return real(...a);
    };
    await expect(emergencyContain(f.deps, f.start, r.ids)).rejects.toThrow(
      "emergency_outcome_unknown",
    );
    expect(f.calls.filter((c) => c.body?.action === "revoke")).toHaveLength(1);
  });
  it.each(["batchId", "duplicate", "events"])(
    "rejects an incorrect initial ingest receipt %s before replay",
    async (field) => {
      const f = provisionFixture(),
        real = f.deps.request;
      f.deps.request = async (...args) => {
        const r = await real(...args);
        if (args[0] === "ingest" && args[3] === "bearer")
          (r.json as Record<string, unknown>)[field] = null;
        return r;
      };
      await expect(executeProvision(f.deps)).rejects.toThrow("ingest_receipt");
      expect(
        f.calls.filter((c) => c.path === "ingest" && c.kind === "bearer"),
      ).toHaveLength(1);
    },
  );
  it("worker appearance after source creation blocks the next write", async () => {
    const f = provisionFixture(),
      original = f.deps.journal;
    f.deps.journal = async (entry) => {
      await original(entry);
      if (entry.type === "ack" && entry.operation === "create-source")
        f.deps.guard = async () => {
          throw new Error("worker_activity");
        };
    };
    await expect(executeProvision(f.deps)).rejects.toThrow("worker_activity");
    expect(f.calls.some((c) => c.path === "rules")).toBe(false);
  });
  it.each(["source", "rule"])(
    "emergency rejects an unreviewed new %s revision without a write",
    async (which) => {
      const f = provisionFixture(),
        r = await executeProvision(f.deps);
      if (which === "source")
        f.state.rowsByTable["sentinel.telemetry_sources"].find(
          (x) => x.row.source_id === f.sid,
        )!.row.revision = 4;
      else
        f.state.rowsByTable["sentinel.detection_rules"].find(
          (x) => x.row.rule_id === f.rid,
        )!.row.current_version = 4;
      const count = f.calls.length;
      await expect(emergencyContain(f.deps, f.start, r.ids)).rejects.toThrow();
      expect(f.calls.length).toBe(count);
    },
  );
});

describe("provision-specific bounded approvals", () => {
  beforeAll(() => {
    vi.spyOn(Date, "now").mockReturnValue(fixedNow);
  });
  afterAll(() => vi.restoreAllMocks());
  it("requires two fresh provision-ingest runtime-only approvals", () =>
    expect(validateProvisionApprovals(approvals(), fixedNow)).toBe(
      fixedNow + 599000,
    ));
  it.each([
    "missing",
    "closed",
    "expired",
    "ttl",
    "phase",
    "worker",
    "action",
    "target",
  ])("rejects %s approvals", (kind) => {
    const a = approvals() as Record<string, unknown>[];
    if (kind === "missing") a.pop();
    if (kind === "closed") a[0].status = "CLOSED";
    if (kind === "expired")
      (a[0].h04cB2 as Record<string, unknown>).expiresAt = new Date(
        fixedNow,
      ).toISOString();
    if (kind === "ttl")
      (a[0].h04cB2 as Record<string, unknown>).expiresAt = new Date(
        fixedNow + 600001,
      ).toISOString();
    if (kind === "phase")
      (a[0].h04cB2 as Record<string, unknown>).phase = "provision-and-ingest";
    if (kind === "worker") a[0].s04RuntimeAcceptance = {};
    if (kind === "action") a[0].actions = ["runtime", "migrate_up"];
    if (kind === "target")
      a[0].target = { ...s04DevTarget, database: "wetscan_s01_test" };
    expect(() => validateProvisionApprovals(a, fixedNow)).toThrow();
  });
});

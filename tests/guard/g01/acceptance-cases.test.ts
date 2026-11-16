import { expect, it, vi } from "vitest";
import { caseLimits } from "../../../worker/guard/acceptance/catalog";
import {
  runCase,
  assertCase,
  type CaseObservation,
  type CasePorts,
} from "../../../worker/guard/acceptance/case-runner";
import { acceptanceFixture } from "./acceptance-fixture";
function observation(): CaseObservation {
  return {
    bindingMatches: true,
    scanCount: 1,
    queueCount: 1,
    scanState: "failed",
    queueState: "completed",
    attempts: 1,
    fence: 1,
    leaseActive: false,
    hasLeaseOwner: false,
    heartbeat: "stopped",
    foundation: true,
    sandboxAudit: true,
    coverage: true,
    sourceAbsent: true,
    containerAbsent: true,
    sentinelPreserved: true,
    originalRowsPreserved: true,
  };
}
it.each(Object.keys(caseLimits) as (keyof typeof caseLimits)[])(
  "%s executes its real runner sequence against explicitly OFFLINE ports and independently asserts outcome",
  async (id) => {
    const f = await acceptanceFixture(id),
      o = observation(),
      events: string[] = [];
    let reads = 0;
    if (id === "Q00") {
      o.controlsComplete = true;
      o.syntheticFixtureRetained = true;
      o.sourceAbsent = false;
    }
    if (id === "N00") {
      o.scanCount = 0;
      o.queueCount = 0;
      o.fault = "evidence_denied";
    }
    if (id === "L01" || id === "L02") {
      o.ddlStatements = 0;
      o.fault =
        id === "L01"
          ? "already_applied"
          : "guard_rollback_requires_empty_inactive_scope";
    }
    if (id === "C02B") {
      o.actualAgeMs = 3600000;
      o.markerUnchanged = true;
    }
    if (id === "C01") {
      o.attempts = 2;
      o.fence = 2;
      o.staleWriteDenied = true;
    }
    if (id === "C02A") {
      o.attempts = 3;
      o.fence = 3;
      o.physicalOverlapDenied = true;
      o.sourceAbsent = false;
      o.deferredSourceOrphan = true;
    }
    if (
      id === "N01" ||
      id === "N02" ||
      id === "N03" ||
      id === "N04" ||
      id === "N05" ||
      id === "N06" ||
      id === "N07" ||
      id === "N08"
    ) {
      o.foundation = false;
      o.sandboxAudit = false;
      o.scanState = "cancelled";
      o.queueState = "cancelled";
      o.fault = {
        N01: "session_revoked",
        N02: "cancelled",
        N03: "permit_expired",
        N04: "grant_expired",
        N05: "container_timeout",
        N06: "source_timeout",
        N07: "container_cleanup_failed_then_rescued",
        N08: "source_cleanup_failed_then_rescued",
      }[id];
      o.realExpiryReached = true;
      o.actualElapsedMs = 61000;
    }
    const mark = (s: string) => async () => {
      events.push(s);
    };
    const ports: CasePorts = {
      qualify: async () => o,
      denyEvidence: async () => o,
      reapSource: async () => o,
      schema: async () => o,
      enqueue: mark("enqueue"),
      launch: async (slot, claimed) => {
        events.push("launch" + slot);
        await claimed?.();
      },
      cancel: mark("cancel"),
      fault: mark("fault"),
      waitLeaseExpiry: mark("natural_expiry"),
      staleWrite: mark("stale_write"),
      cleanupContainer: mark("owned_cleanup"),
      observe: async () => {
        reads++;
        return reads === 1
          ? { ...o, scanCount: 0, queueCount: 0 }
          : reads === 2
            ? { ...o, attempts: 0, queueState: "queued" }
            : o;
      },
    };
    expect((await runCase(f.packet, f.approve(), ports)).status).toBe("PASS");
    expect(events.filter((e) => e === "enqueue").length).toBe(
      f.packet.limits.enqueues,
    );
    expect(events.filter((e) => e.startsWith("launch")).length).toBe(
      f.packet.limits.launches,
    );
    expect(() =>
      assertCase(f.packet, { ...o, sentinelPreserved: false }),
    ).toThrow();
    if (f.packet.limits.enqueues)
      expect(() => assertCase(f.packet, { ...o, scanCount: 2 })).toThrow();
    if (id === "C02B")
      expect(() =>
        assertCase(f.packet, { ...o, actualAgeMs: 3599999 }),
      ).toThrow();
    if (id === "C01")
      expect(() =>
        assertCase(f.packet, { ...o, staleWriteDenied: false }),
      ).toThrow();
    if (id === "C01")
      expect(events.indexOf("stale_write")).toBeGreaterThan(
        events.indexOf("launch1"),
      );
    if (id === "C02A")
      expect(() =>
        assertCase(f.packet, { ...o, physicalOverlapDenied: false }),
      ).toThrow();
  },
);
it("unexpected failure stops before any later launch/cancel and never converts an HTTP error to pass", async () => {
  const f = await acceptanceFixture("N02"),
    launch = vi.fn(async () => {
      throw Error("unexpected");
    }),
    cancel = vi.fn();
  let n = 0;
  const noop = async () => {};
  const o = observation();
  const ports = {
    enqueue: noop,
    launch,
    cancel,
    fault: noop,
    observe: async () =>
      ++n === 1 ? { ...o, scanCount: 0, queueCount: 0 } : { ...o, attempts: 0 },
    qualify: async () => o,
    denyEvidence: async () => o,
    reapSource: async () => o,
    schema: async () => o,
    waitLeaseExpiry: noop,
    staleWrite: noop,
    cleanupContainer: noop,
  };
  await expect(runCase(f.packet, f.approve(), ports)).rejects.toThrow(
    "unexpected",
  );
  expect(cancel).not.toHaveBeenCalled();
  expect(launch).toHaveBeenCalledOnce();
});

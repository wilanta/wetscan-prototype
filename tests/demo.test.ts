import { describe, expect, it } from "vitest";
import { initialState } from "../src/data/demo";
import { demoReducer as reduce } from "../src/domain/demo";
import type { DemoState } from "../src/domain/types";
function detect() {
  return reduce(initialState(), { type: "detect", source: "api" });
}
function pending() {
  let s = detect();
  s = reduce(s, { type: "advance", id: "INC-1042" });
  return reduce(s, { type: "advance", id: "INC-1042" });
}
describe("truthful deterministic incident pipeline", () => {
  it("detection produces an open case and detection-only previews", () => {
    const s = detect();
    expect(s.incidents[0].responseState).toBe("evaluating");
    expect(s.notifications).toHaveLength(2);
    expect(
      s.notifications.every(
        (n) =>
          n.trigger === "attack_detected" &&
          n.status === "preview" &&
          n.deliveredAt === null,
      ),
    ).toBe(true);
  });
  it("does not infer neutralization from an accepted action or pending check", () => {
    const s = pending();
    expect(s.incidents[0].responseState).toBe("verification_pending");
    expect(
      s.notifications.some((n) => n.trigger === "neutralization_verified"),
    ).toBe(false);
    expect(
      reduce(s, { type: "advance", id: "INC-1042", outcome: "pending" }),
    ).toEqual(s);
  });
  it("requires a distinct verification event, with deduplicated outcome previews", () => {
    let s = pending();
    s = reduce(s, { type: "advance", id: "INC-1042", outcome: "pass" });
    expect(s.incidents[0].timeline.at(-1)?.evidenceId).toBe("EV-VERIFY");
    expect(
      s.notifications.filter((n) => n.trigger === "neutralization_verified"),
    ).toHaveLength(2);
    expect(
      reduce(s, { type: "advance", id: "INC-1042", outcome: "pass" }),
    ).toEqual(s);
  });
  it("failed verification emits failure previews and never successful ones", () => {
    const s = reduce(pending(), {
      type: "advance",
      id: "INC-1042",
      outcome: "fail",
    });
    expect(s.incidents[0].responseState).toBe("failed");
    expect(
      s.notifications.filter((n) => n.trigger === "response_failed"),
    ).toHaveLength(2);
    expect(
      s.notifications.some((n) => n.trigger === "neutralization_verified"),
    ).toBe(false);
  });
  it("respects disabled channels and trigger preferences", () => {
    let s = initialState();
    s = reduce(s, {
      type: "channel",
      config: { ...s.channels[0], enabled: false },
    });
    s = reduce(s, {
      type: "channel",
      config: { ...s.channels[1], triggers: ["response_failed"] },
    });
    s = reduce(s, { type: "detect", source: "api" });
    expect(s.notifications).toHaveLength(0);
  });
  it("requires explicit decoy setup and links the event to a case", () => {
    let s = initialState();
    expect(reduce(s, { type: "detect", source: "ghost" })).toEqual(s);
    s = reduce(s, { type: "ghost", enabled: true });
    s = reduce(s, { type: "detect", source: "ghost" });
    expect(s.incidents[0].source).toBe("ghost");
    expect(s.incidents[0].timeline[0].explanation).toContain("GHOST-03");
  });
  it("archiving proposes a draft and never activates it implicitly", () => {
    let s = detect();
    s = reduce(s, { type: "archive", id: "INC-1042" });
    expect(s.incidents[0].archived).toBe(true);
    expect(s.rule).toBe("draft");
    expect(
      reduce(initialState(), { type: "rule", status: "approved" }).rule,
    ).toBe("none");
  });
  it("rollback removes current response claim; closure does not verify", () => {
    let s = reduce(pending(), {
      type: "advance",
      id: "INC-1042",
      outcome: "pass",
    });
    s = reduce(s, { type: "rollback", id: "INC-1042" });
    expect(s.incidents[0].responseState).toBe("rolled_back");
    s = reduce(detect(), { type: "close", id: "INC-1042" });
    expect(s.incidents[0].status).toBe("closed");
    expect(s.incidents[0].responseState).toBe("evaluating");
    expect(reduce(s, { type: "advance", id: "INC-1042" })).toEqual(s);
  });
  it("reset returns every mutable domain value to deterministic defaults", () => {
    let s: DemoState = reduce(pending(), { type: "archive", id: "INC-1042" });
    s = reduce(s, { type: "ghost", enabled: true });
    s = reduce(s, { type: "finding", status: "verified_fixed" });
    s = reduce(s, { type: "preferences", quietHours: true, retention: "90" });
    expect(reduce(s, { type: "reset" })).toEqual(initialState());
  });
});

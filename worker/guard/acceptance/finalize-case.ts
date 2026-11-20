import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { regularJson } from "./package";
import { preserved, type PreservationProjection } from "./preservation";
import { assertCase, type CaseObservation } from "./case-runner";
import { hash, type ExecutionPacket } from "./approval";
import { LiveGuardError } from "../../../src/features/guard/live/model";
import { validN04Evidence } from "./n04-evidence";
const check = (v: unknown) => {
  if (!v) throw new LiveGuardError("execution_not_ready");
};
/** Called only after the actual SQL/queue/resource observers. No unit result or HTTP status is sufficient. */
export async function finalizeObservedCase(
  p: ExecutionPacket,
  root: string,
  rows: Omit<CaseObservation, "sentinelPreserved" | "originalRowsPreserved"> & {
    attemptHistory?: { attempt: number; outcome: string; finished: boolean }[];
  },
) {
  const load = (suffix: string) =>
    regularJson(join(/* turbopackIgnore: true */ root, p.runId + "." + suffix));
  const preservation = preserved(
    (await load("preservation.before.json")) as PreservationProjection,
    (await load("preservation.after.json")) as PreservationProjection,
    p.caseId,
    p.binding!.jobId,
    p.workerIds,
  );
  const o: CaseObservation = {
    ...rows,
    sentinelPreserved: preservation.sentinelPreserved,
    originalRowsPreserved: preservation.originalRowsPreserved,
  };
  const checkpoint = (point: string, slot = 0) =>
    load(p.workerIds[slot] + "." + point + ".json");
  if (p.caseId === "N01") {
    check((await load("revocation.json")).oldSessionRejected === true);
    await checkpoint("acquired");
    o.fault = "session_revoked";
  }
  if (p.caseId === "N02") {
    const running = await checkpoint("container_started"),
      cancel = await load("cancel.0.used.result.json"),
      source = await load("acquired-source.0.json");
    check(
      cancel.status === "cancelled" &&
        cancel.at >= Date.parse(running.at) &&
        cancel.at < Date.parse(running.at) + 9000 &&
        cancel.at < source.marker.expiresAt,
    );
    o.fault = "cancelled";
  }
  if (p.caseId === "N03" || p.caseId === "N04") {
    const boundary = await load("boundary.json");
    check(
      boundary.realExpiryReached === true &&
        boundary.observedAt >= boundary.expiresAt &&
        boundary.boundary ===
          (p.caseId === "N03" ? "permit_expired" : "grant_expired"),
    );
    o.realExpiryReached = true;
    o.fault = boundary.boundary;
    o.actualElapsedMs = boundary.actualElapsedMs;
    if (p.caseId === "N04") {
      check(
        validN04Evidence(
          p,
          boundary,
          await load("retry-guard.json"),
          await load("launch.0.used.result.json"),
        ),
      );
      check(
        rows.attemptHistory?.length === 1 &&
          rows.attemptHistory[0].attempt === 1 &&
          rows.attemptHistory[0].outcome === "cancelled" &&
          rows.attemptHistory[0].finished === true,
      );
      o.authorizationDenied = true;
      o.retryScheduled = false;
    }
    if (p.caseId === "N03") await checkpoint("container_started");
    if (p.caseId === "N03") {
      const failure = await load("start-failure.0.json");
      check(failure.running === true && failure.signalAborted === true);
    }
  }
  if (p.caseId === "N05") {
    const failed = await load("start-failure.0.json");
    check(
      failed.running === true &&
        failed.signalAborted === false &&
        failed.code === "source_unavailable" &&
        failed.elapsedMs >= 1400,
    );
    o.fault = "container_timeout";
  }
  if (p.caseId === "N06") {
    await checkpoint("partial_source");
    const failure = await load("snapshot.0.used.result.json");
    check(failure.status === "failed" && failure.code === "source_unavailable");
    o.actualElapsedMs = failure.elapsedMs;
    o.fault = "source_timeout";
  }
  if (p.caseId === "N07") {
    await checkpoint("container_remove");
    check((await load("reap.0.used.result.json")).containerAbsent === true);
    o.fault = "container_cleanup_failed_then_rescued";
  }
  if (p.caseId === "N08") {
    await checkpoint("source_remove");
    check((await load("dispose-failure.0.json")).code === "cleanup_failed");
    const rescue = await load("reap.0.used.result.json");
    check(rescue.sourceAbsent === true && rescue.ownedHelperReleased === true);
    o.fault = "source_cleanup_failed_then_rescued";
  }
  if (p.caseId === "C01") {
    const fence = await load("stale-fence.json");
    check(
      fence.status === "DENIED_ALL_FOUR" &&
        fence.rowUnchanged === true &&
        fence.results.length === 4 &&
        fence.results.every((v: { denied: boolean }) => v.denied === true),
    );
    o.staleWriteDenied = true;
  }
  if (p.caseId === "C02A") {
    await checkpoint("claimed", 1);
    check((await load("reap.0.used.result.json")).containerAbsent === true);
    o.physicalOverlapDenied = true;
  }
  if (p.caseId === "I01" || p.caseId === "C01" || p.caseId === "C02A") {
    const history = rows.attemptHistory;
    check(
      history?.length === rows.attempts &&
        history.every((a) => a.finished) &&
        history.at(-1)?.outcome === "completed",
    );
    if (p.caseId !== "I01") check(history![0].outcome === "lease_expired");
    if (p.caseId === "C02A") check(history![1].outcome === "handler_failed");
  }
  assertCase(p, o);
  const result = {
    caseId: p.caseId,
    status: "PASS",
    packetSha256: hash(JSON.stringify(p)),
    classification: "LIVE_VERIFIED_FOUNDATION_ACCEPTANCE",
    scannerExecution: "NOT_RUN",
    overallG01: "PARTIALLY_COMPLETE",
    sourceOrphanGate:
      p.caseId === "C02A" ? "WINDOW_B_PENDING" : "not_applicable",
    observation: o,
    preservation,
  };
  await writeFile(
    join(root, p.runId + ".case-result.json"),
    JSON.stringify(result, null, 2) + "\n",
    { flag: "wx", mode: 0o600 },
  );
  return result;
}

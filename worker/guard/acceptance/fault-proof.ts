import { join } from "node:path";
import { regularJson } from "./package";
import type { ExecutionPacket } from "./approval";
/** Only the declared expected boundary permits follow-on cancellation/rescue; other failures require new review. */
export async function expectedFaultObserved(p: ExecutionPacket, root: string) {
  const load = async (suffix: string) => {
    try {
      return await regularJson(
        join(/* turbopackIgnore: true */ root, p.runId + "." + suffix),
      );
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw e;
    }
  };
  const point = (name: string, slot = 0) =>
    load(p.workerIds[slot] + "." + name + ".json");
  switch (p.caseId) {
    case "N01":
      return (
        !!(await point("acquired")) &&
        (await load("revocation.json"))?.oldSessionRejected === true
      );
    case "N02":
      return !!(await point("container_started"));
    case "N03":
    case "N04": {
      const b = await load("boundary.json");
      const failure =
        p.caseId === "N03" ? await load("start-failure.0.json") : null;
      return (
        b?.realExpiryReached === true &&
        b.boundary ===
          (p.caseId === "N03" ? "permit_expired" : "grant_expired") &&
        b.observedAt >= b.expiresAt &&
        (p.caseId === "N03"
          ? !!(await point("container_started")) &&
            failure?.running === true &&
            failure.signalAborted === true
          : b.actualElapsedMs >= 60000)
      );
    }
    case "N05": {
      const f = await load("start-failure.0.json");
      return (
        f?.running === true && f.signalAborted === false && f.elapsedMs >= 1400
      );
    }
    case "N06": {
      const f = await load("snapshot.0.used.result.json");
      return (
        !!(await point("partial_source")) &&
        f?.status === "failed" &&
        f.code === "source_unavailable" &&
        f.elapsedMs >= 45000
      );
    }
    case "N07":
      return !!(await point("container_remove"));
    case "N08":
      return (
        !!(await point("source_remove")) &&
        (await load("dispose-failure.0.json"))?.code === "cleanup_failed"
      );
    case "C02A":
      return (
        !!(await point("claimed", 1)) &&
        (await load("launch.1.used.result.json"))?.exitCode === 0
      );
    default:
      return false;
  }
}

import type { CanvasGraphSource, RepositorySnapshot } from "../contracts";
import { analyzeSnapshot } from "../discovery/analyzer";
/** Server/CLI analysis. Serialize graph through the authorized host; no browser tokens (CAN-001). */
export function SnapshotCanvasSource(
  snapshot: RepositorySnapshot,
): CanvasGraphSource {
  return {
    mode: snapshot.sourceKind === "local_test" ? "snapshot" : "live",
    async loadGraph({ projectRef, revision }) {
      if (
        projectRef !== snapshot.repositoryRef ||
        (revision && revision !== snapshot.revision)
      )
        throw new Error("Snapshot scope or revision mismatch");
      return analyzeSnapshot(snapshot);
    },
  };
}

import type { ArchitectureGraph } from "./types";
export interface CanvasCacheIdentity {
  workspace: string;
  userId: number;
  provider: "github";
  installationId: number;
  repositoryId: number;
  repositoryName: string;
}
export interface CachedCanvas {
  graph: ArchitectureGraph;
  repositoryName: string;
  scope: string;
}
export interface CanvasGraphStore {
  latest(
    identity: CanvasCacheIdentity,
    revision?: string,
  ): Promise<CachedCanvas | null>;
  put(
    identity: CanvasCacheIdentity,
    graph: ArchitectureGraph,
  ): Promise<CachedCanvas>;
  purge(
    identity: Pick<
      CanvasCacheIdentity,
      "userId" | "workspace" | "repositoryId"
    >,
  ): Promise<void>;
}
export type CanvasLoadResult =
  | { state: "ready"; entry: CachedCanvas; cached: boolean }
  | { state: "up_to_date"; revision: string }
  | { state: "new_revision"; revision: string }
  | { state: "refresh_failed"; message: string };

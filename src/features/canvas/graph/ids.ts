/** Semantic, project-scoped and collision-free for the supplied identity. Never array-order IDs. */
export function stableId(
  project: string,
  kind: string,
  identity: string,
): string {
  return [project, kind, identity.replaceAll("\\", "/")]
    .map(encodeURIComponent)
    .join(":");
}

import type { InventoryItem, RepositoryRef } from "./contracts";
import { redact, safePath } from "./security";
/** CycloneDX dependency inventory, not an image SBOM or proof of vulnerability absence. */
export function repositorySbom(
  inventory: InventoryItem[],
  repository: RepositoryRef,
  artifactDigest: string,
) {
  return {
    bomFormat: "CycloneDX" as const,
    specVersion: "1.6" as const,
    version: 1,
    metadata: {
      properties: [
        { name: "wetscan:repository-id", value: repository.repositoryId },
        { name: "wetscan:commit", value: repository.commit },
        { name: "wetscan:scanner-artifact-sha256", value: artifactDigest },
        {
          name: "wetscan:scope",
          value:
            "npm scanner inventory in the authorized snapshot; not an image SBOM; unknown licenses remain absent",
        },
      ],
    },
    components: inventory.map((p, i) => ({
      type: "library" as const,
      "bom-ref": "dependency-" + i,
      name: redact(p.name),
      version: redact(p.version),
      ...(p.license
        ? { licenses: [{ license: { name: redact(p.license) } }] }
        : {}),
      properties: [
        { name: "wetscan:ecosystem", value: p.ecosystem },
        { name: "wetscan:source-path", value: safePath(p.sourcePath) },
      ],
    })),
  };
}
export type RepositorySbom = ReturnType<typeof repositorySbom>;

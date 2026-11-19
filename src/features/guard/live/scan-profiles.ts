import type { Engine, ScanJob } from "../contracts";
/** Operational repository profiles. Demo and target-authorized DAST profiles are separate. */
export const repositoryProfiles: Record<ScanJob["profile"], readonly Engine[]> =
  {
    quick: ["sast", "sca", "secrets"],
    standard: ["sast", "sca", "secrets", "iac", "sbom"],
    full: ["sast", "sca", "secrets", "iac", "sbom", "container"],
  };
export function orderedRepositoryEngines(engines: readonly Engine[]) {
  return repositoryProfiles.full.filter((e) => engines.includes(e));
}

import { fingerprint } from "../../src/platform/identity";
import { sandboxControls, type SandboxAttestation } from "./sandbox";
/** Operator-owned acceptance evidence, supplied by a trusted server composition only.
 * No browser input, config flag or unit fixture is proof of actual enforcement.
 * Artifact content/hashes and issuance must be reviewed by the sandbox operator.
 */
export interface SandboxEvidenceRecord {
  schemaVersion: 1;
  module: "guard-sandbox";
  status: "PASS";
  verifiedBy: string;
  verifiedAt: string;
  expiresAt: string;
  binding: Parameters<SandboxAttestation["verify"]>[0];
  controls: {
    control: (typeof sandboxControls)[number];
    status: "PASS";
    artifactSha256: string;
  }[];
}
export function operatorSandboxEvidence(record: unknown): SandboxAttestation {
  const frozen: unknown = structuredClone(record);
  return {
    async verify(input) {
      const r = frozen as SandboxEvidenceRecord;
      const now = Date.now();
      if (
        !r ||
        r.schemaVersion !== 1 ||
        r.module !== "guard-sandbox" ||
        r.status !== "PASS" ||
        typeof r.verifiedBy !== "string" ||
        !r.verifiedBy.trim() ||
        !Number.isFinite(Date.parse(r.verifiedAt)) ||
        Date.parse(r.verifiedAt) > now ||
        !Number.isFinite(Date.parse(r.expiresAt)) ||
        Date.parse(r.expiresAt) <= now ||
        Date.parse(r.expiresAt) - Date.parse(r.verifiedAt) > 3600000 ||
        fingerprint(r.binding) !== fingerprint(input) ||
        !Array.isArray(r.controls) ||
        r.controls.length !== sandboxControls.length ||
        new Set(r.controls.map((c) => c.control)).size !==
          sandboxControls.length ||
        sandboxControls.some(
          (c) =>
            !r.controls.some(
              (row) =>
                row.control === c &&
                row.status === "PASS" &&
                /^[a-f0-9]{64}$/.test(row.artifactSha256),
            ),
        )
      )
        return null;
      return {
        expiresAt: Date.parse(r.expiresAt),
        verified: [...sandboxControls],
        artifactRef: "sha256:" + fingerprint(r),
      };
    },
  };
}

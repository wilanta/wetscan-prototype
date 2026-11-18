import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ArchiveSessionPolicy } from "./sentinel-owner-session-exception";
import type { PackagePolicy } from "./sentinel-provision-package";
const repo = fileURLToPath(new URL("..", import.meta.url));
const root = "C:/Users/sheil/.wetscan-sentinel";
const run = join(root, "s04-owner-login-0080a5fca3db4995be94fd55139bc58d");
// Original archive evidence stays bound to `run`; the 2026-11-18 owner re-login
// (`recoveryRun`, second login 2026-11-18T19:3x after the first token expired) supplies the current candidate. Descriptor rebinding approved by owner.
const recoveryRun = join(
  root,
  "s04-owner-reauth-3b5201e0110648a38c58df6b814bbde1",
);
const descriptorFile = join(
  root,
  "s04-recovery-descriptor-63553591ee99f0951cc1e70abcb10ae4/recovery-descriptor.private.json",
);
const oldName =
  "session-f3c7b6eddeff1ea869f12c075adb438e92023dedd4e817adb2fded17fb63b17e.bin";
const archivePolicy: ArchiveSessionPolicy = Object.freeze({
  descriptorSha256:
    "fc40604533b203d2cfe7b9375466693835fc7d4c8b39c7b55fdaa2809a605b88",
  proposalSha256:
    "2b29c5f4c41a89ca663a3f3a5e282ba2d6f92ee7db5b8a086e2bb546c4a37152",
  designSha256:
    "932f11cbdb0dc37cb09aa421fe7cecf22245867e064381014cbbce2d18670509",
  baselineSha256:
    "4636a00c2b3aa82d23efe215cec3d42131f79549c37f5617022599c8c896780a",
  archiveSha256:
    "44af3d9ea05ba53ed1592d96e064a400f4c811dc86a17aa882947eb556f7e945",
  proposalFile: join(
    root,
    "s04-post-oauth-diagnosis-a22c77ec2c2846e6b204270909bcce48/missing-session-recovery-review.private.json",
  ),
  designFile: join(
    root,
    "s04-session-final-review-05cb0eb1640f4a4c93055416bbde022d/archive-only-exception.design.private.json",
  ),
  baselineFile: join(run, "auth-before.private.json"),
  archiveFile: join(run, "archive/auth-store", oldName),
  absentSessionFile: join("C:/Users/sheil/.wetscan-auth", oldName),
  authDir: "C:/Users/sheil/.wetscan-auth",
  run,
  candidateFile: join(recoveryRun, "candidate/owner-session.cookie"),
  recovery: Object.freeze({
    baselineFile: join(recoveryRun, "auth-before.private.json"),
    baselineSha256:
      "c6026959e41064b5a532a4b0f524dc6951e795b3e9b57ef0192a53f6b666b89c",

    // First re-login candidate (token expired): present in the baseline, must stay unchanged.
    knownRecords: Object.freeze({
      "session-3fee03dfa88b7d10d198dcd619ba7b1154f36f5e03b4258f7be6caf71a682861.bin":
        "4fce201247e407ce4e8632df147e1836184b3c09d0f7cb6e3403931e94255569",
    }),
  }),
  oldCookieFile: join(root, "s01-20261114/secrets/owner-session.cookie"),
});

export const packagePolicy: PackagePolicy = Object.freeze({
  repo,
  root,
  archive: archivePolicy,
  descriptor: descriptorFile,
  parentManifest: join(
    root,
    "s04-auth-archive-exception-9c53ab2d86a94d0aa219d5a5535422e0/reviewed-archive-exception-input-pins.private.json",
  ),
  parentSha256:
    "6eeded66be6f140a097bde816f6cb28a1d2e6b951f22e18f6bf6108f1d714717",
  historicalInventory: join(
    root,
    "s04-provision-package-5972a96c0c7f4b9bb66fa13bcca466d0/historical-before.private.json",
  ),
  historicalSha256:
    "8f41aeac0bbb3e76e26b52f4ac590700d5bd699e494637f90148d083e4bcc8f4",
  ownerDecision: join(
    root,
    "s04-offline-owner-acceptance-2c2af5c6769f4f9c90efbde1d418765a/owner-decision.sanitized.json",
  ),
  ownerDecisionSha256:
    "b63c31876b43b19ca035968ff52dd0e0014c7ae6999564a2b4edf9072a6b70a5",
});

import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ArchiveSessionPolicy } from "./sentinel-owner-session-exception";
import type { PackagePolicy } from "./sentinel-provision-package";
const repo = fileURLToPath(new URL("..", import.meta.url));
const root = "C:/Users/sheil/.wetscan-sentinel";
const run = join(root, "s04-owner-login-0080a5fca3db4995be94fd55139bc58d");
const descriptorFile = join(
  root,
  "s04-auth-archive-exception-9c53ab2d86a94d0aa219d5a5535422e0/archive-only-exception.descriptor.private.json",
);
const oldName =
  "session-f3c7b6eddeff1ea869f12c075adb438e92023dedd4e817adb2fded17fb63b17e.bin";
const archivePolicy: ArchiveSessionPolicy = Object.freeze({
  descriptorSha256:
    "f847fbab8bbfd48f78089170c3e764a0da121236aa43e1e9299267b5dffad147",
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
  candidateFile: join(run, "candidate/owner-session.cookie"),
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

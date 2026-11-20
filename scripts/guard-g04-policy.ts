/**
 * Demo helper: switch the sandbox project's G04 policy between named presets (each is a normal, audited policy revision).
 *   default  critical+high block, medium warns, all five engines required
 *   warn     only critical blocks; high+medium warn; unknown severity warns   (demonstrates WARN -> neutral check)
 *   node --conditions=react-server --import ./scripts/server-only-stub.mjs --import tsx scripts/guard-g04-policy.ts default|warn
 */
import { openG04 } from "../src/features/guard/g04/db";
import type { SecurityPolicy } from "../src/features/guard/g04/policy";
const S = { workspaceId: process.env.G04_DEMO_WORKSPACE ?? "github-user-187839747:test", projectId: process.env.G04_DEMO_PROJECT ?? "github-1464294716" };
const presets: Record<string, Partial<SecurityPolicy>> = {
  default: { requiredEngines: ["sast", "sca", "secrets", "iac", "sbom"], blockSeverities: ["critical", "high"], warnSeverities: ["medium"], onUnknownSeverity: "incomplete", onNotApplicable: "incomplete" },
  warn: { requiredEngines: ["sast", "sca", "secrets", "iac", "sbom"], blockSeverities: ["critical"], warnSeverities: ["high", "medium"], onUnknownSeverity: "warn", onNotApplicable: "incomplete" },
};
const name = process.argv[2] ?? "";
if (!(name in presets)) throw new Error("USAGE: default|warn");
const rt = await openG04();
try {
  const cur = (await rt.appStore.getPolicy(S))!;
  const rev = await rt.appStore.savePolicy(
    S,
    { repositoryId: cur.repositoryId, repositoryName: cur.repositoryName, installationId: cur.installationId, ownerActor: cur.ownerActor, ownerUserId: cur.ownerUserId },
    { ...cur.policy, ...presets[name] },
    cur.revision,
    cur.ownerActor,
    "demo preset: " + name,
  );
  console.log(JSON.stringify({ policy: name, revision: rev }));
} finally {
  await rt.close();
}

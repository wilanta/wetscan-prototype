/** Writes the server-owned product runtime config for the isolated G04 environment (one repository; branches chosen here, never by requests). */
process.env.GUARD_LOCAL_ENV = "g04";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { productConfig } from "./guard-g02-local-env";

const [root, workspaceId, repositoryId, ...branches] = process.argv.slice(2);
if (!root || !workspaceId || !repositoryId || !branches.length) throw new Error("USAGE: <runtimeRoot> <workspaceId> <repositoryId> <branch|prefix/*>...");
const pointer = JSON.parse(await readFile(join(process.env.LOCALAPPDATA ?? ".", "WetScanGuardG04", "current.json"), "utf8"));
const measured = JSON.parse(await readFile(join(resolve(root), "deployments.measured.json"), "utf8"));
const cfg = productConfig(pointer.target, resolve(root), measured, { workspaceId, repositoryId, branch: branches[0], engines: ["sast", "sca", "secrets", "iac", "sbom"] });
cfg.policies[0].branches = branches;
await writeFile(join(resolve(root), "product.runtime.json"), JSON.stringify(cfg, null, 2) + "\n", { flag: "wx", mode: 0o600 });
console.log(JSON.stringify({ configured: true, projectId: "github-" + repositoryId, branches, qualificationExpiresAt: cfg.deployments[0].qualification.expiresAt }));

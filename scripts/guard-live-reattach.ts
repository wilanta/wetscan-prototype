/** Owner-only reference reattachment. No password reads, file writes, DB or runtime operations. */
import { readdir, lstat, realpath, readFile } from "node:fs/promises";
import { resolve, join, dirname } from "node:path";
import type { Target } from "../src/platform/config";
import { validateGuardApproval } from "../src/features/guard/live/database-config";
import { assertPrivateRuntimeRoot } from "../src/features/guard/live/product-preflight";
import { guardMigrationPlan } from "../src/features/guard/live/migrations";
import { loadProductTarget } from "../src/features/guard/live/product-deployment";
import { probeReferences } from "./guard-live-references";
const same = (a: string, b: string) =>
  process.platform === "win32"
    ? resolve(a).replaceAll("\\", "/").toLowerCase() ===
      resolve(b).replaceAll("\\", "/").toLowerCase()
    : resolve(a) === resolve(b);
export async function existingG02References(
  project: string,
  plan: string,
  target: Target,
  verifyRoot = assertPrivateRuntimeRoot,
) {
  const parent = join(await realpath(project), ".local");
  if (
    (await lstat(parent)).isSymbolicLink() ||
    !same(await realpath(parent), parent)
  )
    throw Error("REFERENCE_PARENT_STOP");
  const candidates = (await readdir(parent, { withFileTypes: true })).filter(
    (d) => /^wetscan-g02-runtime-db-[a-f0-9-]{36}$/.test(d.name),
  );
  if (
    candidates.length !== 1 ||
    !candidates[0].isDirectory() ||
    candidates[0].isSymbolicLink()
  )
    throw Error("EXISTING_REFERENCE_ROOT_MISSING_OR_AMBIGUOUS");
  const root = join(parent, candidates[0].name);
  await verifyRoot(root);
  const refs: Record<string, string> = {};
  for (const purpose of ["app", "worker"] as const) {
    for (const kind of ["database.json", "password"] as const) {
      const file = join(root, purpose + "." + kind),
        stat = await lstat(file);
      if (
        !stat.isFile() ||
        stat.isSymbolicLink() ||
        stat.size < 1 ||
        stat.size > (kind === "password" ? 1024 : 131072) ||
        !same(dirname(await realpath(file)), await realpath(root))
      )
        throw Error("REFERENCE_FILE_METADATA_STOP");
      if (kind === "database.json") {
        // Read only the non-secret purpose/target approval, NEVER the password file.
        const approval = validateGuardApproval(
          JSON.parse(await readFile(file, "utf8")),
          purpose,
          plan,
        );
        if (
          (["host", "port", "database", "marker"] as const).some(
            (k) => approval.target[k] !== target[k],
          )
        )
          throw Error("REFERENCE_TARGET_STOP");
      }
      refs[
        "GUARD_DB_" +
          purpose.toUpperCase() +
          "_" +
          (kind === "password" ? "PASSWORD" : "APPROVAL") +
          "_FILE"
      ] = file;
    }
  }
  return refs;
}
if (
  process.argv[1]?.replaceAll("\\", "/").endsWith("/guard-live-reattach.ts")
) {
  void (async () => {
    if (process.argv.length !== 2) throw Error("NO_ARGUMENTS_ACCEPTED");
    if (process.env.GUARD_PRODUCT_ENABLED !== "0")
      throw Error("SCANNING_MUST_REMAIN_DISABLED");
    const target = await loadProductTarget(
        process.env.GUARD_PRODUCT_CONFIG_FILE,
      ),
      plan = await guardMigrationPlan();
    const refs = await existingG02References(
      process.cwd(),
      plan.sha256,
      target,
    );
    const metadata = await probeReferences({ ...process.env, ...refs });
    if (
      metadata.processReadiness !== "REFERENCE_METADATA_READY_DB_NOT_CONNECTED"
    )
      throw Error("REFERENCE_METADATA_STOP");
    console.log(
      JSON.stringify({
        refs,
        safe: {
          ...metadata,
          classification: "EXISTING_G02_REFERENCES_REATTACHED_METADATA_ONLY",
          passwordFilesRead: false,
          filesWritten: 0,
          configurationChanged: false,
          scanningEnabled: false,
        },
      }),
    );
  })().catch(() => {
    console.log(
      JSON.stringify({
        error: "EXISTING_G02_REFERENCE_REATTACH_STOP_NO_RETRY",
        credentialValuesExposed: false,
        databaseConnected: false,
      }),
    );
    process.exitCode = 1;
  });
}

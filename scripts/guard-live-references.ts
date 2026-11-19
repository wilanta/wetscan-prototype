import { lstat, realpath } from "node:fs/promises";
import { isAbsolute, basename } from "node:path";
// Metadata only: no readFile, credential copy, DB, process launch or environment mutation.
export const referenceNames = [
  "GUARD_DB_APP_APPROVAL_FILE",
  "GUARD_DB_APP_PASSWORD_FILE",
  "GUARD_DB_WORKER_APPROVAL_FILE",
  "GUARD_DB_WORKER_PASSWORD_FILE",
  "GUARD_PRODUCT_CONFIG_FILE",
] as const;
export async function probeReferences(
  env: Readonly<Record<string, string | undefined>>,
) {
  const result: Record<string, { present: boolean; metadataValid: boolean }> =
    {};
  for (const name of referenceNames) {
    const value = env[name];
    let valid = false;
    if (
      value &&
      isAbsolute(value) &&
      !/^\.env(?:\.|$)/i.test(basename(value)) &&
      !/guard-g01|guardg01|acceptance|terminalization/i.test(value)
    ) {
      try {
        const st = await lstat(value),
          actual = await realpath(value);
        valid =
          st.isFile() &&
          !st.isSymbolicLink() &&
          st.size > 0 &&
          st.size <= (name.includes("PASSWORD") ? 1024 : 131072) &&
          !/guard-g01|guardg01|acceptance|terminalization/i.test(actual);
      } catch {
        /* Path metadata unavailable; never reveal it. */
      }
    }
    result[name] = { present: !!value, metadataValid: valid };
  }
  const distinct =
    !!env.GUARD_DB_APP_PASSWORD_FILE &&
    !!env.GUARD_DB_WORKER_PASSWORD_FILE &&
    env.GUARD_DB_APP_PASSWORD_FILE.toLowerCase() !==
      env.GUARD_DB_WORKER_PASSWORD_FILE.toLowerCase();
  return {
    classification: "PROCESS_REFERENCE_METADATA_ONLY_NOT_RUNTIME_AUTHORITY",
    processScope: "THIS_NODE_PROCESS",
    references: result,
    distinctRoleReferences: distinct,
    processReadiness:
      Object.values(result).every((v) => v.metadataValid) && distinct
        ? "REFERENCE_METADATA_READY_DB_NOT_CONNECTED"
        : "REFERENCE_MISSING_OR_METADATA_INVALID",
    credentialContentsRead: false,
    databaseConnected: false,
    roleAuthenticationVerified: false,
    runtimeOperations: 0,
  };
}
if (
  process.argv[1]?.replaceAll("\\", "/").endsWith("/guard-live-references.ts")
) {
  if (process.argv.length !== 2) {
    console.log(
      JSON.stringify({
        error: "NO_ARGUMENTS_ACCEPTED_REFERENCE_METADATA_ONLY",
      }),
    );
    process.exitCode = 1;
  } else console.log(JSON.stringify(await probeReferences(process.env)));
}

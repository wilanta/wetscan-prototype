/** Non-secret plan/reference checks only. No network, key read, server launch or activation. */
import { readFile, lstat } from "node:fs/promises";
import { resolve, basename, isAbsolute } from "node:path";
import {
  providerSettings,
  settingsPlan,
  settingsEnvironment,
} from "../src/features/guard/g03/setup";
import { assertPrivateRuntimeRoot } from "../src/features/guard/live/product-preflight";
import { dirname } from "node:path";

export async function inspectProviderReference(keyFile: string | null) {
  if (!keyFile)
    return { status: "NOT_PROVISIONED" as const, keyContentsRead: false };
  if (
    !isAbsolute(keyFile) ||
    /^\.env(?:\.|$)/i.test(basename(keyFile)) ||
    /[\r\n\0]/.test(keyFile)
  )
    throw Error("provider_reference_invalid");
  await assertPrivateRuntimeRoot(dirname(keyFile));
  const s = await lstat(keyFile);
  if (
    !s.isFile() ||
    s.isSymbolicLink() ||
    !Number.isSafeInteger(s.size) ||
    s.size < 20 ||
    s.size > 512
  )
    throw Error("provider_reference_invalid");
  return {
    status: "PRIVATE_REFERENCE_METADATA_VERIFIED" as const,
    keyContentsRead: false,
  };
}
async function main() {
  const [command, file, ...extra] = process.argv.slice(2);
  if (command === "check-root") {
    if (!file || extra.length || !isAbsolute(file)) throw Error("usage");
    await assertPrivateRuntimeRoot(file);
    process.stdout.write(
      JSON.stringify({
        classification: "PRIVATE_ROOT_METADATA_ONLY",
        privateRootVerified: true,
        keyContentsRead: false,
        providerRequestPerformed: false,
      }) + "\n",
    );
    return;
  }
  if (
    !["plan", "check-reference"].includes(command) ||
    !file ||
    extra.length ||
    !/\.json$/i.test(file) ||
    /^\.env(?:\.|$)/i.test(basename(file))
  )
    throw Error("usage");
  const path = resolve(file),
    info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink() || info.size > 8192)
    throw Error("settings_file_invalid");
  const s = providerSettings(JSON.parse(await readFile(path, "utf8")));
  const output = {
    classification: "NON_SECRET_PLAN_NO_PROVIDER_CALL_NO_ACTIVATION",
    plan: settingsPlan(s),
    aiEnabledInSettings: s.enabled,
    policyApproved: s.dataPolicyApproved,
    keyReferencePresent: !!s.keyFile,
    reference:
      command === "check-reference"
        ? await inspectProviderReference(s.keyFile)
        : { status: "NOT_INSPECTED", keyContentsRead: false },
    environmentVariableNames: Object.keys(settingsEnvironment(s)),
    providerRequestPerformed: false,
    githubWritePerformed: false,
    scannerRun: false,
    providerAcceptance: "NOT_RUN",
    environmentApplied: false,
  };
  process.stdout.write(JSON.stringify(output, null, 2) + "\n");
}
if (process.argv[1]?.replaceAll("\\", "/").endsWith("/guard-g03-setup.ts"))
  main().catch(() => {
    // Never echo rejected settings, filesystem errors or private paths.
    process.stderr.write(
      "G03 setup rejected: review non-secret settings and private reference locally. No operation started.\n",
    );
    process.exitCode = 1;
  });

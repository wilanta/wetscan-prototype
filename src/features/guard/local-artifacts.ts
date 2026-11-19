import type { InventoryItem } from "./contracts";
import { digest, GuardError, record, safePath } from "./security";

export const MAX_LOCK_BYTES = 512 * 1024;
export interface LocalInventory {
  classification: "LOCAL_DOCUMENT_INVENTORY";
  sourceSha256: string;
  sourcePath: "package-lock.json";
  items: InventoryItem[];
  warnings: string[];
  advisoryStatus: "NOT_QUERIED";
}
/** Reads only supplied JSON in memory; never follows resolved URLs or executes packages. */
export async function inspectPackageLock(
  contents: string,
): Promise<LocalInventory> {
  if (new TextEncoder().encode(contents).length > MAX_LOCK_BYTES)
    throw new GuardError("invalid_input", "Lockfile exceeds 512 KiB.");
  const root = record(JSON.parse(contents));
  if (root.lockfileVersion !== 2 && root.lockfileVersion !== 3)
    throw new GuardError(
      "invalid_input",
      "Only npm lockfile versions 2 and 3 are supported.",
    );
  const packages = Object.entries(record(root.packages));
  if (packages.length > 5000)
    throw new GuardError("invalid_input", "Too many lockfile entries.");
  const items: InventoryItem[] = [],
    warnings: string[] = [];
  for (const [path, value] of packages) {
    if (!path) continue;
    safePath(path.replaceAll("node_modules/", "packages/"));
    const pkg = record(value);
    const name = path.split("node_modules/").at(-1) ?? "";
    if (!path.startsWith("node_modules/") || pkg.link === true) {
      warnings.push(
        "Workspace/link entry excluded from npm package inventory.",
      );
      continue;
    }
    if (
      !/^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/i.test(name) ||
      name.includes("..")
    )
      throw new GuardError("invalid_input", "Invalid package name.");
    if (
      typeof pkg.version !== "string" ||
      !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(
        pkg.version,
      )
    ) {
      warnings.push("Non-exact package version excluded.");
      continue;
    }
    // Ignore all resolved URLs, integrity material, scripts and arbitrary metadata.
    const license =
      typeof pkg.license === "string" &&
      /^[a-z0-9 .()+-]{1,128}$/i.test(pkg.license)
        ? pkg.license
        : null;
    items.push({
      name,
      version: pkg.version,
      ecosystem: "npm",
      license,
      sourcePath: "package-lock.json",
    });
  }
  return {
    classification: "LOCAL_DOCUMENT_INVENTORY",
    sourceSha256: await digest(contents),
    sourcePath: "package-lock.json",
    items: [
      ...new Map(
        items.map((item) => [JSON.stringify([item.name, item.version]), item]),
      ).values(),
    ].sort(
      (a, b) =>
        a.name.localeCompare(b.name) || a.version.localeCompare(b.version),
    ),
    warnings: [...new Set(warnings)],
    advisoryStatus: "NOT_QUERIED",
  };
}

export interface PatchInput {
  findingId: string;
  baseCommit: string;
  path: string;
  original: string;
  expectedSha256: string;
  search: string;
  replacement: string;
}
/** Proposal only. No filesystem, shell, provider calls, or verified_fixed status. */
export async function previewReplacement(input: PatchInput) {
  const path = safePath(input.path);
  if (
    !/\.(?:[cm]?[jt]sx?|json|ya?ml|tf|md)$/.test(path) ||
    path.startsWith(".github/") ||
    /(?:^|\/)(?:auth|session|credentials)(?:\/|\.)/i.test(path)
  )
    throw new GuardError("forbidden", "Sensitive or unsupported patch path.");
  if (
    !/^[a-f0-9]{40,64}$/.test(input.baseCommit) ||
    !input.findingId ||
    input.findingId.length > 128
  )
    throw new GuardError(
      "invalid_input",
      "Finding and exact base commit required.",
    );
  if (
    [input.original, input.search, input.replacement].some(
      (value) =>
        value.includes("\0") || new TextEncoder().encode(value).length > 65536,
    )
  )
    throw new GuardError(
      "invalid_input",
      "Patch text exceeds limits or is binary.",
    );
  if ((await digest(input.original)) !== input.expectedSha256)
    throw new GuardError("evidence_required", "Source digest mismatch.");
  if (
    !input.search ||
    input.search === input.replacement ||
    input.original.split(input.search).length !== 2
  )
    throw new GuardError(
      "invalid_input",
      "Replacement must match exactly one location and change its content.",
    );
  const after = input.original.replace(input.search, () => input.replacement);
  return {
    classification: "LOCAL_PATCH_PREVIEW" as const,
    findingId: input.findingId,
    baseCommit: input.baseCommit,
    path,
    beforeSha256: input.expectedSha256,
    afterSha256: await digest(after),
    after,
    validation: "TEXT_REPLACEMENT_ONLY_SYNTAX_AND_TESTS_NOT_RUN" as const,
    applied: false as const,
    retest: "NOT_EXECUTED" as const,
  };
}

import { catalogLimits, type InventoryItem } from "./model";
import { normalizePackage } from "./normalize";
import { validInstalledVersion } from "./versions";

export class LockfileError extends Error {
  constructor(
    readonly code:
      "unsupported_lockfile" | "malformed_lockfile" | "inventory_too_large",
  ) {
    super(code);
  }
}
export const LOCKFILE_MAX_BYTES = 5 * 1024 * 1024;
const order = { runtime: 0, optional: 1, dev: 2, unknown: 3 } as const;
/**
 * package-lock.json v2/v3 only (`packages` map). Declared dependencies, not deployed ones. v1 trees, git/file/link
 * entries and non-semver versions are skipped and counted so coverage is reported honestly rather than silently dropped.
 */
export function parsePackageLock(text: string) {
  if (text.length > LOCKFILE_MAX_BYTES)
    throw new LockfileError("inventory_too_large");
  let root: Record<string, unknown>;
  try {
    root = JSON.parse(text);
  } catch {
    throw new LockfileError("malformed_lockfile");
  }
  const version = root?.lockfileVersion;
  if (!root || typeof root !== "object" || typeof version !== "number")
    throw new LockfileError("malformed_lockfile");
  const packages = root.packages as
    Record<string, Record<string, unknown>> | undefined;
  if (![2, 3].includes(version) || !packages || typeof packages !== "object")
    throw new LockfileError("unsupported_lockfile");
  const items = new Map<string, InventoryItem>();
  let skipped = 0;
  for (const [key, entry] of Object.entries(packages)) {
    if (key === "") continue;
    const marker = key.lastIndexOf("node_modules/");
    if (marker === -1 || (marker > 0 && key[marker - 1] !== "/")) {
      skipped++; // workspace member paths are the project's own code, not dependencies
      continue;
    }
    const name = key.slice(marker + "node_modules/".length);
    const v = entry?.version;
    if (
      !entry ||
      entry.link === true ||
      typeof v !== "string" ||
      !/^(?:@[a-z0-9~][a-z0-9._~-]*\/)?[a-z0-9~][a-z0-9._~-]*$/i.test(name) ||
      !validInstalledVersion("npm", v)
    ) {
      skipped++;
      continue;
    }
    const scope =
      entry.dev === true
        ? "dev"
        : entry.optional === true
          ? "optional"
          : "runtime";
    const pkg = normalizePackage("npm", name);
    const id = `${pkg}@${v}`;
    const prev = items.get(id);
    if (!prev || order[scope] < order[prev.scope ?? "unknown"])
      items.set(id, { ecosystem: "npm", name: pkg, version: v, scope });
    if (items.size > catalogLimits.inventoryItems)
      throw new LockfileError("inventory_too_large");
  }
  return { lockfileVersion: version, items: [...items.values()], skipped };
}

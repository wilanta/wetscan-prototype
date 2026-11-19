import { describe, expect, it } from "vitest";
import {
  LockfileError,
  parsePackageLock,
} from "../../src/features/sentinel/external/lockfile";
import { packageLock } from "./external-fixtures";

describe("S09 package-lock inventory parsing (declared dependencies only)", () => {
  it("extracts name/version/scope from v3 lockfiles, including scoped and nested packages", () => {
    const r = parsePackageLock(
      packageLock({
        "node_modules/lodash": {
          version: "4.17.20",
          resolved: "x",
          integrity: "y",
        },
        "node_modules/@Types/Node": { version: "20.1.0", dev: true },
        "node_modules/a/node_modules/lodash": { version: "4.17.21" },
        "node_modules/fsevents": { version: "2.3.3", optional: true },
        "node_modules/Left-Pad": { version: "1.3.0" },
      }),
    );
    expect(r.lockfileVersion).toBe(3);
    expect(r.items).toEqual(
      expect.arrayContaining([
        {
          ecosystem: "npm",
          name: "lodash",
          version: "4.17.20",
          scope: "runtime",
        },
        {
          ecosystem: "npm",
          name: "lodash",
          version: "4.17.21",
          scope: "runtime",
        },
        {
          ecosystem: "npm",
          name: "@types/node",
          version: "20.1.0",
          scope: "dev",
        },
        {
          ecosystem: "npm",
          name: "fsevents",
          version: "2.3.3",
          scope: "optional",
        },
        {
          ecosystem: "npm",
          name: "left-pad",
          version: "1.3.0",
          scope: "runtime",
        },
      ]),
    );
    expect(r.items).toHaveLength(5);
  });
  it("de-duplicates identical name@version, preferring runtime over dev", () => {
    const r = parsePackageLock(
      packageLock({
        "node_modules/x": { version: "1.0.0", dev: true },
        "node_modules/a/node_modules/x": { version: "1.0.0" },
      }),
    );
    expect(r.items).toEqual([
      { ecosystem: "npm", name: "x", version: "1.0.0", scope: "runtime" },
    ]);
  });
  it("skips and counts links, workspace members, git/file refs and non-semver versions", () => {
    const r = parsePackageLock(
      packageLock({
        "node_modules/ws": { resolved: "packages/ws", link: true },
        "packages/app": { version: "1.0.0" },
        "node_modules/gitdep": { version: "github:foo/bar#abc" },
        "node_modules/weird": { version: "1.2" },
        "node_modules/ok": { version: "1.2.3" },
      }),
    );
    expect(r.items).toHaveLength(1);
    expect(r.skipped).toBe(4);
  });
  it("rejects v1 trees, malformed JSON and oversized inventories instead of guessing", () => {
    const code = (f: () => unknown) => {
      try {
        f();
      } catch (e) {
        return (e as LockfileError).code;
      }
    };
    expect(
      code(() =>
        parsePackageLock(
          JSON.stringify({ lockfileVersion: 1, dependencies: {} }),
        ),
      ),
    ).toBe("unsupported_lockfile");
    expect(code(() => parsePackageLock("{nope"))).toBe("malformed_lockfile");
    expect(code(() => parsePackageLock("[]"))).toBe("malformed_lockfile");
    const many: Record<string, Record<string, unknown>> = {};
    for (let i = 0; i < 10001; i++)
      many[`node_modules/p${i}`] = { version: "1.0.0" };
    expect(code(() => parsePackageLock(packageLock(many)))).toBe(
      "inventory_too_large",
    );
    expect(code(() => parsePackageLock(" ".repeat(5 * 1024 * 1024 + 1)))).toBe(
      "inventory_too_large",
    );
  });
});

import { it, expect, vi } from "vitest";
import * as fs from "node:fs/promises";
import { join, relative } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
vi.mock("server-only", () => ({}));
vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...actual,
    readFile: vi.fn(actual.readFile),
    writeFile: vi.fn(actual.writeFile),
  };
});
import { existingG02References } from "../../../scripts/guard-live-reattach";
import {
  referenceDocuments,
  g02Target,
} from "../../../scripts/guard-live-setup";
async function fixture() {
  const project = await fs.realpath(
    await fs.mkdtemp(join(tmpdir(), "wetscan-reference-attach-")),
  );
  await fs.mkdir(join(project, ".local"));
  const root = join(
    project,
    ".local",
    "wetscan-g02-runtime-db-" + randomUUID(),
  );
  await fs.mkdir(root);
  const docs = referenceDocuments(
    "a".repeat(64),
    new Date(Date.now() + 86400000).toISOString(),
  );
  for (const purpose of ["app", "worker"] as const) {
    await fs.writeFile(
      join(root, purpose + ".database.json"),
      JSON.stringify(docs[purpose]),
    );
    await fs.writeFile(
      join(root, purpose + ".password"),
      "SYNTHETIC_FIXTURE_NOT_A_PASSWORD_VALUE",
    );
  }
  return {
    project,
    root,
    docs,
    close: async () => {
      if (
        relative(
          await fs.realpath(tmpdir()),
          await fs.realpath(project),
        ).startsWith("..")
      )
        throw Error("fixture_boundary");
      await fs.rm(project, { recursive: true, force: true });
    },
  };
}
it("reattaches only exact-role existing G02 references, reads approval JSON only and never writes/reads password bytes", async () => {
  const f = await fixture();
  const read = vi.mocked(fs.readFile),
    write = vi.mocked(fs.writeFile);
  read.mockClear();
  write.mockClear();
  try {
    const verify = vi.fn(async () => {});
    const refs = await existingG02References(
      f.project,
      "a".repeat(64),
      g02Target,
      verify,
    );
    expect(Object.keys(refs)).toHaveLength(4);
    expect(verify).toHaveBeenCalledWith(f.root);
    expect(read.mock.calls.map((c) => String(c[0]))).toEqual([
      join(f.root, "app.database.json"),
      join(f.root, "worker.database.json"),
    ]);
    expect(write).not.toHaveBeenCalled();
    expect(refs.GUARD_DB_APP_PASSWORD_FILE).not.toBe(
      refs.GUARD_DB_WORKER_PASSWORD_FILE,
    );
  } finally {
    read.mockClear();
    write.mockClear();
    await f.close();
  }
});
it.each(["absent", "multiple", "wrong-role", "expired", "wrong-target", "acl"])(
  "refuses %s without substituting credentials or resetting anything",
  async (mode) => {
    const f = await fixture();
    try {
      if (mode === "absent") await fs.rm(f.root, { recursive: true });
      if (mode === "multiple")
        await fs.mkdir(
          join(f.project, ".local", "wetscan-g02-runtime-db-" + randomUUID()),
        );
      if (mode === "wrong-role") {
        f.docs.app.role = "postgres";
        await fs.writeFile(
          join(f.root, "app.database.json"),
          JSON.stringify(f.docs.app),
        );
      }
      if (mode === "expired") {
        f.docs.app.expiresAt = new Date(Date.now() - 1000).toISOString();
        await fs.writeFile(
          join(f.root, "app.database.json"),
          JSON.stringify(f.docs.app),
        );
      }
      const verify = async () => {
        if (mode === "acl") throw Error("ACL_NOT_VERIFIED");
      };
      await expect(
        existingG02References(
          f.project,
          "a".repeat(64),
          mode === "wrong-target"
            ? { ...g02Target, marker: "wetscan-s01:" + randomUUID() }
            : g02Target,
          verify,
        ),
      ).rejects.toThrow(
        mode === "absent" || mode === "multiple"
          ? "EXISTING_REFERENCE_ROOT_MISSING_OR_AMBIGUOUS"
          : mode === "acl"
            ? "ACL_NOT_VERIFIED"
            : mode === "wrong-target"
              ? "REFERENCE_TARGET_STOP"
              : "approval_required",
      );
    } finally {
      await f.close();
    }
  },
);

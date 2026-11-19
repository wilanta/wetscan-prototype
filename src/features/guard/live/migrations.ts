import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { migrationPlan, type Migration } from "../../../platform/migrations";
/**
 * Guard depends only on the platform baseline it was provisioned and approved against (S01-S03). Later Sentinel
 * migrations (0004+) are Sentinel-owned and must not change the Guard plan hash that existing approvals bind to.
 */
export const GUARD_PLATFORM_BASELINE = "0003_detection";
/** Fixed Guard-owned artifacts and frozen platform baseline; hashing is not mutation approval. */
export async function guardMigrationPlan() {
  const root = join(process.cwd(), "migrations", "guard"),
    files = [
      "roles.proposed.sql",
      "platform-access.proposed.sql",
      "platform-access.rollback.proposed.sql",
      "0001_guard.up.sql",
      "0001_guard.down.sql",
    ];
  const artifacts = await Promise.all(
    files.map(async (name) => {
      const sql = (await readFile(join(root, name), "utf8")).replace(
        /\r\n/g,
        "\n",
      );
      return {
        name,
        sql,
        sha256: createHash("sha256").update(sql).digest("hex"),
      };
    }),
  );
  const up = artifacts.find((a) => a.name === "0001_guard.up.sql")!.sql,
    down = artifacts.find((a) => a.name === "0001_guard.down.sql")!.sql;
  const migration: Migration = {
    version: "0001_guard",
    up,
    down,
    checksum: createHash("sha256")
      .update(up + "\0" + down)
      .digest("hex"),
  };
  const platform = await migrationPlan(GUARD_PLATFORM_BASELINE);
  return {
    migration,
    artifacts,
    platformVersions: platform.migrations.map(({ version, checksum }) => ({
      version,
      checksum,
    })),
    platformPlanSha256: platform.sha256,
    sha256: createHash("sha256")
      .update(
        JSON.stringify(artifacts.map(({ name, sha256 }) => ({ name, sha256 }))),
      )
      .update(platform.sha256)
      .digest("hex"),
  };
}

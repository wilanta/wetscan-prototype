/** Run with Node 22's TypeScript stripping. No repository scripts, network or credentials. */
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { analyzeSnapshot } from "./discovery/analyzer";
import { memorySnapshot } from "./discovery/snapshot";
import { fixtures } from "./discovery/fixtures";
import { localSnapshot } from "./adapters/local-snapshot";
const args = process.argv.slice(2);
if (args[0] === "--generate-fixtures") {
  const graphs = Object.fromEntries(
    await Promise.all(
      Object.entries(fixtures).map(async ([key, fixture]) => [
        key,
        await analyzeSnapshot(
          memorySnapshot(fixture.files, {
            repositoryRef: `internal:${key}`,
            revision: `example-${key}-v1`,
            branch: "example",
          }),
          { analyzedAt: "2026-11-14T00:00:00.000Z" },
        ),
      ]),
    ),
  );
  await writeFile(
    fileURLToPath(new URL("./adapters/fixture-graphs.json", import.meta.url)),
    JSON.stringify(graphs, null, 2) + "\n",
  );
  process.stdout.write(
    "Sanitized internal fixture graphs generated from source.\n",
  );
} else {
  const fixture = fixtures[args[0] ?? "a"];
  const snapshot =
    args[0] === "--local" && args[1]
      ? await localSnapshot(args[1], {
          repositoryRef: "internal:local",
          revision: args[2] ?? "unversioned-local",
          branch: "local-test",
        })
      : fixture
        ? memorySnapshot(fixture.files, {
            repositoryRef: `internal:${args[0] ?? "a"}`,
            revision: "example-v1",
          })
        : null;
  if (!snapshot)
    throw new Error(
      "Usage: node --experimental-strip-types src/features/canvas/run.mjs [a|b|c|d|e|--local <trusted-root> <revision>|--generate-fixtures]",
    );
  process.stdout.write(
    JSON.stringify(await analyzeSnapshot(snapshot), null, 2) + "\n",
  );
}

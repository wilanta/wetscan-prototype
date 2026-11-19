"use client";
import { useState } from "react";
import { Button, Card, Notice } from "@/components/ui";
import {
  inspectPackageLock,
  MAX_LOCK_BYTES,
  previewReplacement,
  type LocalInventory,
} from "./local-artifacts";
import { digest } from "./security";
import styles from "./workbench.module.css";
const exampleLock = JSON.stringify(
  {
    name: "reviewed-fixture",
    lockfileVersion: 3,
    packages: {
      "": { name: "reviewed-fixture" },
      "node_modules/fixture-dependency": { version: "1.0.0", license: "MIT" },
    },
  },
  null,
  2,
);
const exampleSource = "export const greeting = 'Hello';\n";
function download(value: unknown, name: string) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function LocalArtifactTools({ section }: { section: string }) {
  const [input, setInput] = useState(exampleLock),
    [inventory, setInventory] = useState<LocalInventory | null>(null);
  const [source, setSource] = useState(exampleSource),
    [search, setSearch] = useState("'Hello'"),
    [replacement, setReplacement] = useState("'Hello, WetScan'");
  const [path, setPath] = useState("src/greeting.ts"),
    [commit, setCommit] = useState("a".repeat(40)),
    [findingId, setFindingId] = useState("demo-review");
  const [patch, setPatch] = useState<Awaited<
      ReturnType<typeof previewReplacement>
    > | null>(null),
    [error, setError] = useState("");
  const clearPatch = () => {
    setPatch(null);
    setError("");
  };
  return (
    <Card className={styles.panel}>
      {section === "/inventory" ? (
        <div className={styles.stack}>
          <h2>Inspect npm lockfile — real local processing</h2>
          <Notice>
            Starts with a labelled example. Paste or select your own
            package-lock.json to inspect exact inventory. Content stays in this
            browser tab; no advisory query, scan finding, or Intelligence
            delivery is implied. License may be unknown.
          </Notice>
          <label className="field">
            Select package-lock.json (maximum 512 KiB)
            <input
              type="file"
              accept=".json,application/json"
              onChange={async (e) => {
                setInventory(null);
                setError("");
                const file = e.target.files?.[0];
                if (!file) return;
                if (
                  file.name !== "package-lock.json" ||
                  file.size > MAX_LOCK_BYTES
                ) {
                  setError("Select package-lock.json of at most 512 KiB.");
                  return;
                }
                try {
                  setInput(await file.text());
                } catch {
                  setError("File could not be read.");
                }
              }}
            />
          </label>
          <label className="field">
            Lockfile JSON
            <textarea
              rows={10}
              maxLength={MAX_LOCK_BYTES}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                setInventory(null);
                setError("");
              }}
            />
          </label>
          <Button
            onClick={async () => {
              setError("");
              setInventory(null);
              try {
                setInventory(await inspectPackageLock(input));
              } catch {
                setError(
                  "Invalid or unsupported lockfile. No inventory was promoted.",
                );
              }
            }}
          >
            Inspect inventory
          </Button>
          {inventory && (
            <>
              <p role="status" className={styles.meta}>
                {inventory.items.length} exact package versions. Advisories:{" "}
                {inventory.advisoryStatus}. Source SHA256:{" "}
                {inventory.sourceSha256}
              </p>
              {inventory.warnings.map((w) => (
                <p key={w}>{w}</p>
              ))}
              <div className={styles.scroll}>
                <table>
                  <caption>
                    Inventory from supplied document, not vulnerability findings
                  </caption>
                  <thead>
                    <tr>
                      <th>Package</th>
                      <th>Version</th>
                      <th>License</th>
                      <th>Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inventory.items.map((item) => (
                      <tr key={item.name + "@" + item.version}>
                        <td>{item.name}</td>
                        <td>{item.version}</td>
                        <td>{item.license ?? "UNKNOWN"}</td>
                        <td>{item.sourcePath}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Button
                variant="secondary"
                onClick={() =>
                  download(inventory, "guard-local-inventory.json")
                }
              >
                Download inventory JSON
              </Button>
            </>
          )}
        </div>
      ) : (
        <div className={styles.stack}>
          <h2>Review a local patch proposal</h2>
          <Notice>
            Deterministic text replacement only, with exact source digest. No
            AI, source execution, file write, syntax test, PR, or retest. Enter
            only non-sensitive text. A preview cannot mark a finding
            verified_fixed.
          </Notice>
          <label className="field">
            Finding reference
            <input
              value={findingId}
              maxLength={128}
              onChange={(e) => {
                setFindingId(e.target.value);
                clearPatch();
              }}
            />
          </label>
          <label className="field">
            Base commit
            <input
              value={commit}
              maxLength={64}
              onChange={(e) => {
                setCommit(e.target.value);
                clearPatch();
              }}
            />
          </label>
          <label className="field">
            Relative file path
            <input
              value={path}
              onChange={(e) => {
                setPath(e.target.value);
                clearPatch();
              }}
            />
          </label>
          <label className="field">
            Original text
            <textarea
              rows={6}
              maxLength={65536}
              value={source}
              onChange={(e) => {
                setSource(e.target.value);
                clearPatch();
              }}
            />
          </label>
          <label className="field">
            Replace exactly once
            <textarea
              rows={2}
              maxLength={65536}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                clearPatch();
              }}
            />
          </label>
          <label className="field">
            Replacement
            <textarea
              rows={2}
              maxLength={65536}
              value={replacement}
              onChange={(e) => {
                setReplacement(e.target.value);
                clearPatch();
              }}
            />
          </label>
          <Button
            onClick={async () => {
              clearPatch();
              try {
                setPatch(
                  await previewReplacement({
                    findingId,
                    baseCommit: commit,
                    path,
                    original: source,
                    expectedSha256: await digest(source),
                    search,
                    replacement,
                  }),
                );
              } catch {
                setError(
                  "Preview refused: check source, path, base commit, size, and unique replacement.",
                );
              }
            }}
          >
            Validate text proposal
          </Button>
          {patch && (
            <>
              <p role="status" className={styles.meta}>
                Text replacement validated. Syntax and tests have not run.
                Retest: {patch.retest}. Nothing applied.
              </p>
              <pre>{patch.after}</pre>
              <Button
                variant="secondary"
                onClick={() =>
                  download(patch, "guard-local-patch-preview.json")
                }
              >
                Download review proposal JSON
              </Button>
            </>
          )}
        </div>
      )}
      {error && <p role="alert">{error}</p>}
    </Card>
  );
}

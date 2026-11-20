import { describe, expect, it } from "vitest";
import { access, mkdtemp, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { reapOrphanLock, type DockerRun } from "../../../src/features/guard/g04/orphan";

const NAME = "wetscan-guard-1d99065a-4d56-4879-a3a4-4c8d04556c71",
  RUN = "1d99065a-4d56-4879-a3a4-4c8d04556c71",
  JOB = "8".repeat(64);
const record = (deadline: number) => ({ name: NAME, runId: RUN, jobId: JOB, specDigest: "9".repeat(64), image: "x", imageId: "sha256:" + "a".repeat(64), source: "x", deadline });
async function rootWithLock(deadline: number) {
  const root = await mkdtemp(join(tmpdir(), "wetscan-g02-runtime-orphan-"));
  await writeFile(join(root, "active-container.lock"), JSON.stringify(record(deadline)));
  return root;
}
const labels = { "wetscan.module": "guard", "wetscan.run": RUN, "wetscan.job": JOB };
/** Fake Docker with one container in a given state (or none). `rm` really removes it. */
function docker(state: "none" | "created" | "running" | "foreign") {
  const calls: string[][] = [];
  let present = state !== "none";
  const run: DockerRun = async (args) => {
    calls.push(args);
    if (args[0] === "inspect") return present ? { code: 0, stdout: JSON.stringify({ State: { Status: state === "running" ? "running" : "created" }, Config: { Labels: state === "foreign" ? { "wetscan.module": "guard", "wetscan.run": "other" } : labels } }) } : { code: 1, stdout: "" };
    if (args[0] === "rm") present = false;
    return { code: 0, stdout: "" };
  };
  return { run, calls };
}
const old = Date.now() - 3_600_000;

describe("G02 container-lock orphan recovery (uses G02's own ResourceRegistry.release)", () => {
  it("no lock: nothing to do", async () => {
    const root = await mkdtemp(join(tmpdir(), "wetscan-g02-runtime-orphan-"));
    expect(await reapOrphanLock({ root, docker: docker("none").run })).toEqual({ action: "none", reason: "no_lock" });
  });
  it("a lock whose deadline has not passed is never touched (a scan may be live)", async () => {
    const root = await rootWithLock(Date.now() + 60_000),
      d = docker("created");
    expect(await reapOrphanLock({ root, docker: d.run })).toMatchObject({ action: "blocked", reason: "deadline_not_reached" });
    expect(d.calls).toHaveLength(0);
    await access(join(root, "active-container.lock"));
  });
  it("past the deadline, container already gone: lock released through G02 and a removal record written", async () => {
    const root = await rootWithLock(old);
    expect(await reapOrphanLock({ root, docker: docker("none").run })).toEqual({ action: "released", name: NAME, removed: false });
    expect(await readdir(root)).toContain(NAME + ".removed.json");
    await expect(access(join(root, "active-container.lock"))).rejects.toThrow();
  });
  it("past the deadline, owned never-started container: removed by exact name, absence verified, lock released", async () => {
    const root = await rootWithLock(old),
      d = docker("created");
    expect(await reapOrphanLock({ root, docker: d.run })).toEqual({ action: "released", name: NAME, removed: true });
    expect(d.calls.filter((c) => c[0] === "rm")).toEqual([["rm", "--force", NAME]]);
  });
  it("a container with someone else's ownership labels is never removed", async () => {
    const root = await rootWithLock(old),
      d = docker("foreign");
    expect(await reapOrphanLock({ root, docker: d.run })).toMatchObject({ action: "blocked", reason: "not_owned" });
    expect(d.calls.some((c) => c[0] === "rm")).toBe(false);
    await access(join(root, "active-container.lock"));
  });
  it("a still-running scanner just past its deadline is left alone; far past it, it is removed", async () => {
    const root = await rootWithLock(Date.now() - 130_000),
      d = docker("running");
    expect(await reapOrphanLock({ root, docker: d.run })).toMatchObject({ action: "blocked", reason: "container_running" });
    expect(d.calls.some((c) => c[0] === "rm")).toBe(false);
    const root2 = await rootWithLock(old);
    expect(await reapOrphanLock({ root: root2, docker: docker("running").run })).toMatchObject({ action: "released", removed: true });
  });
  it("an unreadable lock is reported, not guessed at", async () => {
    const root = await mkdtemp(join(tmpdir(), "wetscan-g02-runtime-orphan-"));
    await writeFile(join(root, "active-container.lock"), "{not json");
    expect(await reapOrphanLock({ root, docker: docker("none").run })).toMatchObject({ action: "blocked", reason: "record_unreadable" });
  });
});

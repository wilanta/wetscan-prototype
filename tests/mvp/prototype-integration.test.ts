import { afterEach, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import {
  runGuardDemo,
  resetGuardDemo,
  onGuardDemoCompleted,
  getGuardDemoSnapshot,
  reviewDemo,
} from "../../src/features/guard/demo-session";
afterEach(() => {
  resetGuardDemo();
  vi.unstubAllEnvs();
});
it("one completed Guard demo updates existing prototype state once; triage is not another scan", async () => {
  vi.stubEnv("NODE_ENV", "development");
  let completed = 0;
  const off = onGuardDemoCompleted(() => completed++);
  try {
    await runGuardDemo("quick", ["sast", "sca", "secrets"], false, true);
    const job = getGuardDemoSnapshot().jobs[0];
    expect(job.findings).toHaveLength(3);
    expect(completed).toBe(1);
    reviewDemo(
      job.findings[0].id,
      "under_review",
      "Review inside existing prototype only",
    );
    expect(completed).toBe(1);
    resetGuardDemo();
    expect(getGuardDemoSnapshot().jobs).toEqual([]);
  } finally {
    off();
  }
});
it("production keeps expanded fixtures disabled even if a caller supplies the development flag", async () => {
  vi.stubEnv("NODE_ENV", "production");
  await runGuardDemo("quick", ["sast", "sca", "secrets"], false, true);
  const job = getGuardDemoSnapshot().jobs[0];
  expect(job.findings).toHaveLength(1);
  expect(job.runs.find((r) => r.engine === "sca")?.status).toBe(
    "not_configured",
  );
  expect(job.status).toBe("completed_partial");
  expect(job.findings[0].mode).toBe("demo");
});
it("legacy URL contains a redirect only and production Auth middleware remains enforced", async () => {
  const route = await readFile(
    "src/app/local-demo/guard/[[...section]]/page.tsx",
    "utf8",
  );
  expect(route).toContain("redirect(");
  expect(route).not.toContain("<main");
  expect(route).not.toContain("GuardWorkbench");
  const proxy = await readFile("src/proxy.ts", "utf8");
  expect(proxy).toContain('"/app/:path*"');
  expect(proxy).not.toContain("WETSCAN_LOCAL_DEMO");
});

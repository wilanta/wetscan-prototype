import { expect, it } from "vitest";
import { fork } from "node:child_process";
import { once } from "node:events";
import { resolve } from "node:path";
it("runs two real isolated Node fixture processes with Guard-only private IPC shutdown and clean restart", async () => {
  const ids: number[] = [];
  for (let index = 0; index < 2; index++) {
    const child = fork(
      resolve("tests/guard/g01/worker-process.fixture.ts"),
      [],
      {
        execArgv: ["--import", "tsx"],
        stdio: ["ignore", "ignore", "ignore", "ipc"],
        windowsHide: true,
        env: {
          NODE_ENV: "test",
          SystemRoot: process.env.SystemRoot,
          WINDIR: process.env.WINDIR,
        },
      },
    );
    const timer = setTimeout(() => child.kill(), 8000);
    try {
      const [message] = await once(child, "message");
      expect(message).toEqual({ phase: "started" });
      ids.push(child.pid!);
      child.send({ type: "sentinel.shutdown", version: 1 });
      await new Promise((done) => setTimeout(done, 40));
      expect(child.exitCode).toBeNull();
      const exiting = once(child, "exit"),
        closed = once(child, "message");
      child.send({ type: "guard.shutdown", version: 1 });
      expect((await closed)[0]).toEqual({ phase: "closed" });
      expect((await exiting)[0]).toBe(0);
    } finally {
      clearTimeout(timer);
      if (child.exitCode === null) {
        const closing = once(child, "exit");
        child.kill();
        await closing;
      }
    }
  }
  expect(ids[0]).not.toBe(ids[1]);
}, 20000);

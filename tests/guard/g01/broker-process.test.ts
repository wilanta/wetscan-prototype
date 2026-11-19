import { fork } from "node:child_process";
import { once } from "node:events";
import { resolve } from "node:path";
import { expect, it } from "vitest";
import { attachGuardBroker, privateIpcPort } from "../../../worker/guard/ipc";
import { GuardSessionBroker } from "../../../worker/guard/auth-broker";
import { brokerFixture } from "./broker-fixture";
const cleanEnvironment: NodeJS.ProcessEnv = {
  NODE_ENV: "test",
  SystemRoot: process.env.SystemRoot,
  WINDIR: process.env.WINDIR,
};
it("uses a real inherited child IPC channel for fresh authority/snapshot metadata/disposal without Auth credentials", async () => {
  const f = await brokerFixture(),
    broker = new GuardSessionBroker(f.permit, f.deps);
  const child = fork(resolve("tests/guard/g01/broker-process.fixture.ts"), [], {
    execArgv: ["--import", "tsx"],
    env: cleanEnvironment,
    stdio: ["ignore", "ignore", "ignore", "ipc"],
    windowsHide: true,
  });
  const port = privateIpcPort(child),
    detach = attachGuardBroker(port, (packet, signal) =>
      broker.handle(packet, signal),
    );
  const timer = setTimeout(() => child.kill(), 8000),
    exiting = once(child, "exit");
  try {
    expect((await once(child, "message"))[0]).toEqual({
      type: "guard.fixture.ready",
    });
    const result = new Promise<unknown>((done) => {
      const off = port.message((value) => {
        if (
          value &&
          typeof value === "object" &&
          "type" in value &&
          value.type === "guard.fixture.result"
        ) {
          off();
          done(value);
        }
      });
    });
    await port.send({
      type: "guard.fixture.run",
      lease: f.lease,
      request: f.request,
    });
    expect(await result).toEqual({
      type: "guard.fixture.result",
      digest: f.snapshot.digest,
      privateEnvironment: true,
    });
    expect((await exiting)[0]).toBe(0);
    expect(f.deps.snapshots.dispose).toHaveBeenCalledOnce();
  } finally {
    clearTimeout(timer);
    if (child.exitCode === null) {
      child.kill();
      await exiting;
    }
    await detach();
    await broker.close();
  }
}, 15000);
it.each([false, true])(
  "production entry rejects missing or general approval before any target configuration (boot=%s)",
  async (boot) => {
    const child = fork(resolve("worker/guard/main.ts"), [], {
      execArgv: ["--import", "tsx"],
      env: {
        ...cleanEnvironment,
        ...(boot ? { GUARD_WORKER_LAUNCH: "1" } : {}),
      },
      stdio: ["ignore", "ignore", "ignore", "ipc"],
      windowsHide: true,
    });
    const exiting = once(child, "exit"),
      timer = setTimeout(() => child.kill(), 8000);
    try {
      if (boot) {
        expect((await once(child, "message"))[0]).toEqual({
          type: "guard.worker.boot_ready",
          version: 1,
        });
        child.send({
          type: "guard.worker.boot",
          version: 1,
          approval: "Approve mas, aman.",
        });
      }
      expect((await exiting)[0]).toBe(2);
    } finally {
      clearTimeout(timer);
      if (child.exitCode === null) {
        child.kill();
        await exiting;
      }
    }
  },
  15000,
);

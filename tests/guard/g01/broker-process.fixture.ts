// Trusted fixture only: no pool, Auth store, credentials, provider or scanner.
import { privateIpcPort } from "../../../worker/guard/ipc";
import { ipcWorkerResolver } from "../../../worker/guard/auth-broker";
import type { JobLease } from "../../../src/features/sentinel/platform-contracts";
import type { ScanRequest } from "../../../src/features/guard/contracts";
const port = privateIpcPort(process),
  remote = ipcWorkerResolver(port);
const off = port.message((value) => {
  if (
    !value ||
    typeof value !== "object" ||
    !("type" in value) ||
    value.type !== "guard.fixture.run"
  )
    return;
  off();
  const input = value as unknown as { lease: JobLease; request: ScanRequest };
  void (async () => {
    try {
      const { grant, snapshots } = await remote.resolver.resolve(input.lease);
      const snapshot = await snapshots.acquire(grant, input.request);
      await snapshots.dispose(snapshot);
      await port.send({
        type: "guard.fixture.result",
        digest: snapshot.digest,
        privateEnvironment: !Object.keys(process.env).some((k) =>
          /^(AUTH_|GITHUB_|SENTINEL_|GUARD_DB_|DATABASE_URL|PG)/.test(k),
        ),
      });
    } finally {
      remote.close();
      process.disconnect?.();
    }
  })().catch(() => {
    process.exitCode = 2;
  });
});
void port.send({ type: "guard.fixture.ready" });

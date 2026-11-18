import { describe, expect, it } from "vitest";
import { infrastructureStages } from "../../scripts/sentinel-audit-infrastructure.mjs";
import { AuditStageError, runAuditStages } from "../../scripts/sentinel-audit-diagnostics.mjs";
import { auditPackageTarget } from "../../scripts/sentinel-audit-package";
import { s04DevContainer } from "./dev-acceptance-safety";

const oldId = "0220e86e719aa43c30dfd3ba371e290de0fe9141d8d1fe7f7fc6a58accb8961f";
const apotekId = "5de4f048db99a8d8ceae4e5a6042eac3510f82c5743252387441c69f268f89ca";
function fixture() {
  const t = auditPackageTarget;
  const ports = { "5432/tcp": [{ HostIp: "127.0.0.1", HostPort: "55432" }] };
  const mounts = [{ Type: "volume", Name: String(t.volume), Source: `/var/lib/docker/volumes/${t.volume}/_data`, Destination: "/var/lib/postgresql/data", RW: true }];
  const container = { Id: String(t.containerId), Name: "/" + t.containerName, Image: String(t.imageId), Config: { Image: t.imageId, Labels: {} }, State: { Running: true, Status: "running", Health: { Status: "healthy" }, StartedAt: "new" }, HostConfig: { RestartPolicy: { Name: "no", MaximumRetryCount: 0 }, PortBindings: structuredClone(ports) }, NetworkSettings: { Ports: structuredClone(ports) }, Mounts: structuredClone(mounts) };
  const apotek = { ...structuredClone(container), Id: apotekId, Name: "/apotek-nginx", Image: "apotek-image", Config: { Image: "nginx", Labels: {} }, HostConfig: { ...structuredClone(container.HostConfig), RestartPolicy: { Name: "unless-stopped", MaximumRetryCount: 0 } } };
  const original = { ...structuredClone(container), Id: oldId, Name: "/wetscan-sentinel-local-postgres-1", State: { ...container.State, Running: false, StartedAt: "historical" } };
  const rows = [container, apotek, original];
  const inventory = rows.map(c => ({ id: c.Id, name: c.Name, imageId: c.Image, restartPolicy: c.HostConfig.RestartPolicy.Name, running: c.State.Running, startedAt: c.State.StartedAt }));
  const volume = { Name: String(t.volume), Driver: "local", CreatedAt: "cloned", Mountpoint: `/var/lib/docker/volumes/${t.volume}/_data`, Scope: "local" };
  const prior = { container: { image: t.imageId, bindings: ports, mounts }, volume: { name: volume.Name, driver: volume.Driver, createdAt: volume.CreatedAt, mountpoint: volume.Mountpoint, scope: volume.Scope } };
  let clock = 0, calls = 0, failures = 0;
  let fail: ((n: number) => unknown) | undefined;
  const timeouts: number[] = [];
  const native = async (_exe: string, args: string[], timeout: number) => {
    calls++; timeouts.push(timeout);
    const error = fail?.(calls); if (error) { failures++; throw error; }
    if (args.includes("volume")) return { stdout: JSON.stringify([volume]) };
    if (args.includes("ps")) return { stdout: rows.map(c => c.Id).join("\n") };
    if (args.includes("--format")) return { stdout: rows.map(c => JSON.stringify(c)).join("\n") };
    if (args.includes("inspect")) return { stdout: JSON.stringify([container]) };
    return { stdout: "0" };
  };
  return { container, apotek, original, volume, inventory, timeouts,
    failWith: (f: (n: number) => unknown) => { fail = f; },
    result: async () => runAuditStages(infrastructureStages({ target: t }, prior, inventory, native, () => clock, async (ms: number) => { clock += ms; }), async () => {}),
    observed: () => ({ clock, calls, failures }) };
}
describe("reviewed isolated S04 infrastructure rebaseline", () => {
  it("binds both entrypoints to the same exact approved replacement", async () => {
    expect(auditPackageTarget.containerId).toBe("178eef261a5e1a7163bd4943dafd4b8bc8bdc77dfcc80be9270517c60b21a4f4");
    expect(s04DevContainer.containerId).toBe(auditPackageTarget.containerId);
    expect(s04DevContainer.containerName).toBe(auditPackageTarget.containerName);
    expect(s04DevContainer.volume).toBe(auditPackageTarget.volume);
    expect(s04DevContainer.image).toBe(auditPackageTarget.imageId);
    expect((await fixture().result()).status).toBe("PASS");
  });
  it("ignores only unrelated Apotek running state and startup time", async () => {
    const f = fixture(); f.apotek.State.Running = false; f.apotek.State.StartedAt = "different";
    expect((await f.result()).status).toBe("PASS");
  });
  it.each(["old_container", "image", "volume", "mount", "port", "published_port", "apotek_identity", "apotek_policy", "original_started", "original_running"])("rejects %s without polling an integrity mismatch", async kind => {
    const f = fixture();
    if (kind === "old_container") f.container.Id = oldId;
    if (kind === "image") f.container.Image = "wrong";
    if (kind === "volume") f.volume.Name = "wrong";
    if (kind === "mount") f.container.Mounts[0].Name = "wrong";
    if (kind === "port") f.container.HostConfig.PortBindings["5432/tcp"][0].HostIp = "0.0.0.0";
    if (kind === "published_port") f.container.NetworkSettings.Ports["5432/tcp"][0].HostPort = "55433";
    if (kind === "apotek_identity") f.apotek.Image = "wrong";
    if (kind === "apotek_policy") f.apotek.HostConfig.RestartPolicy.Name = "always";
    if (kind === "original_started") f.original.State.StartedAt = "changed";
    if (kind === "original_running") f.original.State.Running = true;
    expect((await f.result()).status).toBe("NOT_VERIFIED");
    expect(f.observed().clock).toBe(0);
  });
  it("recovers a transient Docker probe within the shared bound", async () => {
    const f = fixture(); f.failWith(n => n < 3 ? new AuditStageError("native_exit", { exitCode: 1 }) : null);
    expect((await f.result()).status).toBe("PASS");
    expect(f.observed().failures).toBe(2); expect(f.observed().clock).toBe(2000);
    expect(f.timeouts.every(ms => ms > 0 && ms <= 20000)).toBe(true);
  });
  it.each(["native_exit", "native_timeout"])("bounds persistent %s to 120 seconds", async code => {
    const f = fixture(); f.failWith(() => new AuditStageError(code, { exitCode: 1 }));
    expect((await f.result()).status).toBe("NOT_VERIFIED");
    expect(f.observed().clock).toBeLessThanOrEqual(120000);
    expect(f.observed().calls).toBe(120);
    expect(f.timeouts.at(-1)).toBe(1000);
  });
  it.each(["native_cleanup", "native_output_limit", "native_stderr", "native_start"])("never retries %s", async code => {
    const f = fixture(); f.failWith(() => new AuditStageError(code));
    expect((await f.result()).status).toBe("NOT_VERIFIED"); expect(f.observed().calls).toBe(1);
  });
  it("does not retry a positively missing container", async () => {
    const f = fixture(); f.failWith(() => new AuditStageError("native_exit", { nativeDiagnostic: "docker_container_not_found" }));
    expect((await f.result()).status).toBe("NOT_VERIFIED"); expect(f.observed().calls).toBe(1);
  });
});

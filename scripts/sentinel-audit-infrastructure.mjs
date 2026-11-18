// Read-only metadata checks. No Docker call happens on module import.
import { performance } from "node:perf_hooks";
import { AuditStageError, commandTimeout, requireAudit } from "./sentinel-audit-diagnostics.mjs";
// Immutable identities remain checked; these unrelated services may auto-start.
const apotekIds = new Set([
  "5de4f048db99a8d8ceae4e5a6042eac3510f82c5743252387441c69f268f89ca",
  "44c8783134184517adfd7399c9a4437146c2b352e68315be80d3ccd137a5c94e",
  "6429e8770f266e6adae411a1557bfb3bc661c94282a00a963ba95a155c6cb911",
  "08b40fd30cb7fbdd1694708802ba55de90d443586f433c2a017785207c73d9dc",
]);
export function infrastructureStages(
  b,
  prior,
  originalInventory,
  native,
  now = () => performance.now(),
  pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  observationMs = 120000,
) {
  requireAudit(Number.isSafeInteger(observationMs) && observationMs >= 0 && observationMs <= 120000, "invalid_evidence");
  const start = now();
  const docker =
    "C:/Users/sheil/AppData/Local/Programs/DockerDesktop/resources/bin/docker.exe";
  let container, inventory;
  async function run(exe, args) {
    // Retry only failed read-only Docker probes, never parsed evidence mismatches.
    for (let probe = 0; ; probe++) {
      try {
        return (await native(exe, args, commandTimeout(start, now(), 20000, observationMs))).stdout.trim();
      } catch (error) {
        const retryable = exe === docker && error instanceof AuditStageError &&
          ["native_exit", "native_timeout"].includes(error.code) &&
          error.details.nativeDiagnostic !== "docker_container_not_found";
        const remaining = observationMs - (now() - start);
        if (!retryable || remaining <= 0 || probe >= 119) throw error;
        await pause(Math.min(1000, remaining));
        if (now() - start >= observationMs) throw error;
      }
    }
  }
  async function inspect(args) {
    return JSON.parse(
      await run(docker, ["--context", "desktop-linux", ...args]),
    );
  }
  const t = b.target;
  return [
    {
      name: "container_identity",
      run: async () => {
        const rows = await inspect(["inspect", t.containerId]);
        requireAudit(rows.length === 1);
        container = rows[0];
        requireAudit(
          container.Id === t.containerId &&
            container.Name === "/" + t.containerName &&
            container.Image === t.imageId &&
            container.Config.Image === prior.container.image,
        );
      },
    },
    {
      name: "container_health",
      run: async () =>
        requireAudit(
          container.State.Running === true &&
            container.State.Status === "running" &&
            container.State.Health?.Status === "healthy" &&
            container.HostConfig.RestartPolicy.Name === "no" &&
            container.HostConfig.RestartPolicy.MaximumRetryCount === 0,
        ),
    },
    {
      name: "container_storage_port",
      run: async () => {
        requireAudit(
          JSON.stringify(container.HostConfig.PortBindings) ===
            JSON.stringify(prior.container.bindings),
        );
        requireAudit(
          JSON.stringify(container.NetworkSettings.Ports["5432/tcp"]) ===
            JSON.stringify([{ HostIp: "127.0.0.1", HostPort: "55432" }]),
        );
        const normalize = (m) => ({
          Type: m.Type,
          Name: m.Name ?? null,
          Source: m.Source,
          Destination: m.Destination,
          RW: m.RW,
        });
        const sorted = (ms) =>
          ms
            .map(normalize)
            .sort((a, b) => a.Destination.localeCompare(b.Destination));
        requireAudit(
          JSON.stringify(sorted(container.Mounts)) ===
            JSON.stringify(sorted(prior.container.mounts)),
        );
        const vs = await inspect(["volume", "inspect", t.volume]),
          v = vs[0],
          p = prior.volume;
        requireAudit(
          vs.length === 1 &&
            v.Name === p.name &&
            v.Driver === p.driver &&
            v.CreatedAt === p.createdAt &&
            v.Mountpoint === p.mountpoint &&
            v.Scope === p.scope,
        );
      },
    },
    {
      name: "container_inventory",
      run: async () => {
        const ids = (
          await run(docker, [
            "--context",
            "desktop-linux",
            "ps",
            "-aq",
            "--no-trunc",
          ])
        )
          .split(/\r?\n/)
          .filter(Boolean);
        requireAudit(
          JSON.stringify([...ids].sort()) ===
            JSON.stringify(originalInventory.map((x) => x.id).sort()),
        );
        // Keep inventory within the native output bound; omit unrelated config.
        const format = '{"Id":{{json .Id}},"Name":{{json .Name}},"Image":{{json .Image}},"Config":{"Image":{{json .Config.Image}},"Labels":{{json .Config.Labels}}},"State":{"Running":{{json .State.Running}},"StartedAt":{{json .State.StartedAt}}},"HostConfig":{"RestartPolicy":{"Name":{{json .HostConfig.RestartPolicy.Name}}}}}';
        const rows = await run(docker, ["--context", "desktop-linux", "inspect", "--format", format, ...ids]);
        inventory = rows.split(/\r?\n/).map((row) => JSON.parse(row));
        requireAudit(inventory.length === ids.length && new Set(inventory.map((x) => x.Id)).size === ids.length);
        for (const original of originalInventory) {
          const c = inventory.find((x) => x.Id === original.id);
          requireAudit(
            c &&
              c.Name === original.name &&
              c.Image === original.imageId &&
              c.HostConfig.RestartPolicy.Name === original.restartPolicy,
          );
          if (c.Id !== t.containerId && !apotekIds.has(c.Id))
            requireAudit(
              c.State.Running === original.running &&
                c.State.StartedAt === original.startedAt,
            );
        }
        requireAudit(
          !inventory.some(
            (x) =>
              x.State.Running &&
              x.Id !== t.containerId &&
              (/wetscan/i.test(x.Name + " " + x.Config.Image) ||
                x.Config.Labels?.["com.docker.compose.project"] ===
                  "wetscan-sentinel-local"),
          ),
        );
      },
    },
    {
      name: "runtime_conflicts",
      run: async () => {
        const command =
          "$ErrorActionPreference='Stop'; $p=@(Get-CimInstance Win32_Process | Where-Object { $_.Name -match 'node|tsx' -and $_.CommandLine -match 'next[\\/]dist[\\/]bin[\\/]next|next-server|worker[\\/]sentinel|sentinel-worker|sentinel-dev-acceptance|sentinel-provision-owner' }); $l=@(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object LocalPort -eq 3000); Write-Output ($p.Count+$l.Count)";
        requireAudit(
          (await run(
            "C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe",
            ["-NoProfile", "-NonInteractive", "-Command", command],
          )) === "0",
        );
      },
    },
  ];
}

import {
  DockerGuardSandbox,
  dockerDriver,
  type SandboxSpec,
  type SandboxAttestation,
  type DockerDriver,
} from "../sandbox";
import { probePolicy } from "./probe-spec";
import { ResourceRegistry, type ResourceRecord } from "./registry";
import { LiveGuardError } from "../../../src/features/guard/live/model";
import { setTimeout as delay } from "node:timers/promises";
import type { Checkpoints } from "./checkpoints";
import { inspectedBoundary } from "./inspection";
/** The production factory fixes a real shell-free Docker driver; tests inject a driver at this seam. */
export function scopedProbeSandbox(
  spec: SandboxSpec,
  evidence: SandboxAttestation,
  registry: ResourceRegistry,
  record: ResourceRecord,
  driver: DockerDriver = dockerDriver(spec.docker, spec.endpoint),
  checkpoints?: Checkpoints,
) {
  return scopedOwnedSandbox(
    spec,
    evidence,
    registry,
    record,
    probePolicy(spec),
    driver,
    checkpoints,
  );
}
/** Shared physical ownership/inspection fence. Only trusted server compositions supply a bound policy. */
export function scopedOwnedSandbox(
  spec: SandboxSpec,
  evidence: SandboxAttestation,
  registry: ResourceRegistry,
  record: ResourceRecord,
  policy: (spec: SandboxSpec) => void,
  driver: DockerDriver = dockerDriver(spec.docker, spec.endpoint),
  checkpoints?: Checkpoints,
  scanner?: {
    acceptedExitCodes: readonly number[];
    completed(
      output: string,
      state: { Running: boolean; ExitCode: number; OOMKilled: boolean },
    ): Promise<void>;
  },
) {
  const labels = {
    "wetscan.run": record.runId,
    "wetscan.job": record.jobId,
    "wetscan.spec": record.specDigest,
  };
  const call = (args: string[], configDirectory: string) =>
    driver.call(args, { configDirectory, timeoutMs: 5000, maxBytes: 32000 });
  return new DockerGuardSandbox(spec, driver, evidence, {
    validate: policy,
    name: record.name,
    labels,
    deadline: record.deadline,
    ...scanner,
    reserve: () => registry.reserve(record),
    inspect: async (m) => {
      inspectedBoundary(m, spec, record, record.source);
      await registry.inspect(record, m);
    },
    started: checkpoints?.enabled("container_started")
      ? async (configDirectory, signal) => {
          const until = Date.now() + 4000;
          while (!signal.aborted && Date.now() < until) {
            const state = JSON.parse(
              await call(
                ["inspect", "--format", "{{json .State}}", record.name],
                configDirectory,
              ),
            );
            if (state.Running) {
              await checkpoints.reach("container_started", signal);
              return;
            }
            if (state.Status === "exited" || state.Status === "dead")
              throw new LiveGuardError("source_unavailable");
            await delay(25, undefined, { signal });
          }
          throw new LiveGuardError("source_unavailable");
        }
      : undefined,
    beforeRemove: async (configDirectory) => {
      await registry.assertOwner(record);
      // Exact name filter also handles a create that failed before assigning a container ID.
      const ids = (
        await call(
          [
            "ps",
            "--all",
            "--filter",
            "name=^/" + record.name + "$",
            "--format",
            "{{.ID}}",
          ],
          configDirectory,
        )
      ).trim();
      if (!ids) return;
      const m = JSON.parse(
        await call(
          ["inspect", "--format", "{{json .}}", record.name],
          configDirectory,
        ),
      );
      if (
        m.Name !== "/" + record.name ||
        m.Image !== record.imageId ||
        Object.entries(labels).some(([k, v]) => m.Config?.Labels?.[k] !== v)
      )
        throw new LiveGuardError("cleanup_failed");
      await checkpoints?.reach(
        "container_remove",
        new AbortController().signal,
      );
    },
    removed: async (configDirectory) => {
      const found = (
        await call(
          [
            "ps",
            "--all",
            "--filter",
            "name=^/" + record.name + "$",
            "--format",
            "{{.ID}}",
          ],
          configDirectory,
        )
      ).trim();
      await registry.release(record, !found);
    },
  });
}

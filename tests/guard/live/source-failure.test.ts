import { it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { AuthError } from "../../../src/lib/auth/config";
import { LiveGuardError } from "../../../src/features/guard/live/model";
import {
  executeScopedJob,
  type WorkerPorts,
} from "../../../worker/guard/orchestrator";
import {
  pipelineFailureReason,
  sourceFailureMetadata,
  tagFailure,
} from "../../../worker/guard/source-failure";
import { operationalJobFixture, authority, scope } from "./operational-fixture";
async function fail(error: unknown) {
  let current = await operationalJobFixture();
  const scanner = vi.fn(),
    dispose = vi.fn();
  const ports: WorkerPorts = {
    storage: {
      create: async (_g, j) => structuredClone(j),
      get: async () => structuredClone(current),
      save: async (_g, j) => {
        current = structuredClone(j);
      },
    },
    snapshots: {
      acquire: vi.fn(async () => {
        throw error;
      }),
      dispose,
    },
    scanners: [{ engine: "sast", execute: scanner }],
    sandbox: {
      ready: true,
      readOnly: true,
      nonRoot: true,
      egressControlled: true,
      cpuLimit: 1,
      memoryMb: 256,
      pidsLimit: 64,
      timeoutMs: 45000,
    },
  };
  const work = executeScopedJob(
    ports,
    authority.grant,
    scope,
    current.id,
    new AbortController().signal,
  );
  return { work, current: () => current, scanner, dispose };
}
it.each(["source_unavailable", "source_integrity", "not_found"] as const)(
  "keeps safe LiveGuardError %s at snapshot_acquire; not falsely not_configured",
  async (code) => {
    const f = await fail(new LiveGuardError(code));
    const r = await f.work;
    expect(r.status).toBe("failed");
    expect(f.scanner).not.toHaveBeenCalled();
    expect(JSON.parse(r.audit.at(-1)!.reason)).toMatchObject({
      stage: "snapshot_acquire",
      code,
    });
    expect(r.runs.find((x) => x.engine === "sast")).toMatchObject({
      status: "failed",
      scanner: "unavailable",
    });
    expect(r.runs.find((x) => x.engine === "sast")?.startedAt).toBeUndefined();
    expect(r.runs.find((x) => x.engine === "sast")?.reason).toContain(
      "Scanner not started",
    );
  },
);
it("preserves sanitized provider timeout/deadline/count/cleanup proof without secrets or paths", async () => {
  const error = Object.assign(new AuthError("source_timeout", 502), {
    message: "PRIVATE_SOURCE_AND_TOKEN",
    githubDiagnostic: {
      boundary: "github_source",
      reason: "TIMEOUT",
      token: "DO_NOT_KEEP",
    },
    guardSourceDiagnostic: {
      version: 1,
      phase: "blob",
      elapsedMs: 45001,
      retrievedFiles: 64,
      eligibleFiles: 65,
      timedOut: true,
      parentCancelled: false,
      cleanup: "NOT_CREATED",
      concurrency: 3,
      path: "PRIVATE_SOURCE_AND_TOKEN",
    },
  });
  const f = await fail(error),
    r = await f.work,
    reason = r.audit.at(-1)!.reason;
  expect(JSON.parse(reason)).toMatchObject({
    stage: "snapshot_acquire",
    code: "source_timeout",
    provider: { reason: "TIMEOUT" },
    source: {
      phase: "blob",
      timedOut: true,
      retrievedFiles: 64,
      cleanup: "NOT_CREATED",
    },
  });
  expect(reason).not.toMatch(/PRIVATE_SOURCE_AND_TOKEN|DO_NOT_KEEP/);
  expect(sourceFailureMetadata(error)).not.toHaveProperty("path");
});
it("unknown failure remains failed/unknown rather than leaking text or passing", async () => {
  const f = await fail(
      Object.assign(Error("PRIVATE_STACK"), { code: "token=SECRET" }),
    ),
    r = await f.work;
  expect(r.status).toBe("failed");
  expect(JSON.parse(r.audit.at(-1)!.reason).code).toBe("unknown");
  expect(r.audit.at(-1)!.reason).not.toMatch(/SECRET|PRIVATE_STACK/);
  expect(f.scanner).not.toHaveBeenCalled();
});
it("cleanup_failed still propagates for quarantine without an invented terminal success", async () => {
  const f = await fail(new LiveGuardError("cleanup_failed"));
  await expect(f.work).rejects.toMatchObject({ code: "cleanup_failed" });
  expect(f.current().status).toBe("preparing");
  expect(f.scanner).not.toHaveBeenCalled();
});
it("malformed diagnostic fields are discarded; arbitrary error metadata is never serialized", () => {
  const error = {
    code: "source_timeout",
    guardSourceDiagnostic: {
      version: 1,
      phase: "blob",
      elapsedMs: -1,
      token: "SECRET",
    },
  };
  expect(sourceFailureMetadata(error)).toBeUndefined();
  expect(pipelineFailureReason(error, "snapshot_acquire")).not.toContain(
    "SECRET",
  );
});

it.each(["source", "broker", "sandbox", "scanner"] as const)(
  "reports component %s using an allowlist, with no raw detail",
  (component) => {
    const e = tagFailure(
      Object.assign(Error("SECRET_MESSAGE"), { code: "source_integrity" }),
      component,
    );
    expect(JSON.parse(pipelineFailureReason(e, "scanner"))).toMatchObject({
      component,
      code: "source_integrity",
    });
    expect(pipelineFailureReason(e, "scanner")).not.toContain("SECRET_MESSAGE");
  },
);
it("frozen cleanup error cannot lose its quarantine discriminator when tagged", () => {
  const e = tagFailure(
    Object.freeze(new LiveGuardError("cleanup_failed")),
    "sandbox",
  );
  expect(e).toBeInstanceOf(LiveGuardError);
  expect(e).toMatchObject({ code: "cleanup_failed" });
});

import { it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { mkdtemp, writeFile, mkdir, rm, realpath } from "node:fs/promises";
import { join, dirname, basename } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { installationDocker } from "../../../worker/guard/installation/qualify";
import {
  sandboxCreateArgs,
  validateOperationalSandboxSpec,
  type SandboxSpec,
} from "../../../worker/guard/sandbox";
import { scannerCommands } from "../../../worker/guard/installation/commands";
import {
  canonicalOutput,
  operationalSastCoverage,
} from "../../../worker/guard/scanner-adapter";
import { secureSnapshotDirectory } from "../../../src/features/guard/live/snapshot-directory";
import { normalizeOpengrep } from "../../../src/features/guard/evidence";
import { fingerprint } from "../../../src/platform/identity";
import { sha256, gitBlob } from "../../../src/features/guard/g03/safety";
import { compareTargeted } from "../../../src/features/guard/g03/retest";
import { makePatch } from "../../../src/features/guard/g03/patch";
import { evidenceIdentity } from "../../../src/features/guard/live/product-remediation";
import type {
  AuthorizedSnapshot,
  EngineRun,
} from "../../../src/features/guard/contracts";
import type {
  Proposal,
  Retest,
  SourceFile,
} from "../../../src/features/guard/g03/contracts";
import { fixture, content, edit, plan } from "./fixture";
import { nativePostgres } from "./native-postgres";
import { PostgresG03Store } from "../../../src/features/guard/g03/store";
import { G03Service } from "../../../src/features/guard/g03/service";

it("real G02 Opengrep image + official rules: source-bound patch retest fixes finding; partial/error/changed revision remain unverified", async () => {
  const executable = process.env.G03_TEST_DOCKER_BINARY,
    image = process.env.G03_TEST_SCANNER_IMAGE;
  if (!executable || !image?.match(/^sha256:[a-f0-9]{64}$/))
    throw Error("explicit_controlled_scanner_references_required");
  const root = await mkdtemp(
    join(tmpdir(), "wetscan-g01-snapshot-g03-retest-"),
  );
  await secureSnapshotDirectory(root);
  const config = join(root, "docker-config");
  await mkdir(config);
  const docker = installationDocker(
      executable,
      "npipe:////./pipe/docker_engine",
      config,
    ),
    runId = randomUUID();
  const identity = JSON.parse(
    await docker.call(["image", "inspect", image, "--format", "{{json .Id}}"]),
  );
  expect(identity).toBe(image);
  const records: {
    variant: string;
    imageId: string;
    specDigest: string;
    artifactDigest: string;
    findings: number;
    coverage: unknown;
    cleanup: boolean;
  }[] = [];
  let active: string | undefined, activeId: string | undefined;
  const spec: SandboxSpec = {
    docker: executable,
    endpoint: "npipe:////./pipe/docker_engine",
    image,
    executable: "/usr/local/bin/opengrep",
    args: [...scannerCommands.opengrep],
    cpu: 1,
    memoryMb: 256,
    pids: 64,
    timeoutMs: 45000,
    outputBytes: 2000000,
  };
  const versionSpec = { ...spec, args: ["--version"] };
  async function execute(spec: SandboxSpec, source: string) {
    const name = "wetscan-guard-" + randomUUID();
    active = name;
    activeId = (
      await docker.call(
        sandboxCreateArgs(spec, source, name, validateOperationalSandboxSpec, {
          "wetscan.run": runId,
          "wetscan.spec": fingerprint(spec),
        }),
      )
    ).trim();
    const observed = JSON.parse(
      await docker.call(["inspect", name, "--format", "{{json .}}"]),
    );
    expect(observed.Id).toBe(activeId);
    expect(observed.Config.Labels["wetscan.run"]).toBe(runId);
    expect(observed.Image).toBe(image);
    expect(observed.Config.User).toBe("65532:65532");
    expect(observed.HostConfig.ReadonlyRootfs).toBe(true);
    expect(observed.HostConfig.NetworkMode).toBe("none");
    expect(observed.HostConfig.CapDrop).toContain("ALL");
    expect(observed.HostConfig.PidsLimit).toBe(64);
    expect(observed.HostConfig.Memory).toBe(256 * 1024 * 1024);
    expect(
      observed.Mounts.find(
        (m: { Destination: string }) => m.Destination === "/source",
      ).RW,
    ).toBe(false);
    expect(
      observed.Config.Env.every(
        (e: string) => !/^(?:AUTH_|GUARD_|PGPASSWORD|GITHUB_|AWS_)/.test(e),
      ),
    ).toBe(true);
    let output: string;
    try {
      output = await docker.call(["start", "--attach", name], {
        signal: AbortSignal.timeout(45000),
        limit: 2000000,
        accepted: [0, 1],
      });
    } finally {
      const state = JSON.parse(
        await docker.call(["inspect", name, "--format", "{{json .}}"]),
      );
      expect(state.Id).toBe(activeId);
      expect(state.Config.Labels["wetscan.run"]).toBe(runId);
      expect(state.State.Running).toBe(false);
      expect(state.State.OOMKilled).toBe(false);
      expect([0, 1]).toContain(state.State.ExitCode);
      await docker.call(["rm", name]);
      const left = await docker.call([
        "ps",
        "-aq",
        "--filter",
        "name=^/" + name + "$",
        "--filter",
        "label=wetscan.run=" + runId,
      ]);
      expect(left.trim()).toBe("");
      active = undefined;
      activeId = undefined;
    }
    return output;
  }
  try {
    const source = join(root, "source");
    await mkdir(source);
    await writeFile(join(source, "route.ts"), content);
    const version = (await execute(versionSpec, source)).trim();
    expect(version).toContain("2.0.0");
    const rulePack = fingerprint({ image, command: spec.args }); // immutable image + fixed command binds the actual installed rule set.
    const f = await fixture(),
      before = structuredClone(f.job),
      after = structuredClone(f.after);
    const scans = [before, after],
      texts = [content, content.replace(edit.oldText, edit.newText)];
    for (let i = 0; i < 2; i++) {
      const job = scans[i],
        text = texts[i],
        commit = sha256(text).slice(0, 40);
      job.repository.commit = commit;
      await writeFile(join(source, "route.ts"), text);
      const manifest: AuthorizedSnapshot = {
        ...f.grant,
        repository: job.repository,
        digest: sha256(text),
        files: [
          {
            path: "route.ts",
            size: Buffer.byteLength(text),
            sha256: sha256(text),
          },
        ],
        expiresAt: Date.now() + 60000,
      };
      const raw = await execute(spec, source),
        parsed = JSON.parse(raw),
        canonical = canonicalOutput(parsed, "sast", manifest),
        coverage = operationalSastCoverage(parsed, manifest),
        artifactDigest = sha256(raw);
      expect(parsed.errors).toEqual([]);
      expect(coverage.coverage.status).toBe("complete");
      job.findings = await normalizeOpengrep(canonical, {
        ...f.grant,
        commit,
        recordedAt: new Date().toISOString(),
        artifactDigest,
        synthetic: false,
        scannerVersion: version,
        rulePack,
      });
      const run: EngineRun = {
        engine: "sast",
        status: "completed",
        scanner: "opengrep",
        version,
        rulePack,
        artifactDigest,
        reason:
          "Real G02 command in isolated controlled-source fixture; NOT owner/live acceptance",
        coverage: coverage.coverage,
        executionEvidence: {
          version: 1,
          runId,
          imageId: image,
          specDigest: fingerprint(spec),
          installationArtifactSha256: fingerprint({
            image,
            version,
            rulePack,
            inspectedControls: true,
          }),
          cleanup: "VERIFIED",
        },
      };
      job.runs = job.runs.map((r) => (r.engine === "sast" ? run : r));
      records.push({
        variant: i ? "fixed" : "vulnerable",
        imageId: image,
        specDigest: fingerprint(spec),
        artifactDigest,
        findings: job.findings.length,
        coverage: coverage.coverage,
        cleanup: true,
      });
    }
    expect(before.findings.length).toBeGreaterThan(0);
    expect(after.findings).toEqual([]);
    const original = before.findings[0],
      base: SourceFile = {
        repositoryId: "123",
        branch: "main",
        baseCommit: before.repository.commit,
        tree: "b".repeat(40),
        path: "route.ts",
        blob: gitBlob(content),
        sourceSha256: sha256(content),
        content,
      };
    const patch = makePatch(base, original, edit),
      proposal: Proposal = {
        version: 1,
        id: "d".repeat(64),
        requestKey: "g03-controlled-retest",
        requestSha256: "f".repeat(64),
        findingId: original.id,
        evidenceSha256: evidenceIdentity(original),
        binding: base,
        baseCommit: base.baseCommit,
        actorId: f.grant.actorId,
        createdAt: new Date().toISOString(),
        state: "completed",
        consent: {
          ai: false,
          source: false,
          path: null,
          at: new Date().toISOString(),
          plan: null,
        },
        patch,
        review: {
          decision: "approved",
          actorId: f.grant.actorId,
          at: new Date().toISOString(),
          reason: "Controlled test patch only",
          patchDigest: patch.digest,
        },
      };
    // This controlled patch is created by the test, not an AI provider. The test cannot claim real AI success.
    const t: Retest = {
      id: "e".repeat(64),
      proposalId: proposal.id,
      findingId: original.id,
      actorId: f.grant.actorId,
      beforeCommit: base.baseCommit,
      afterCommit: after.repository.commit,
      targetBranch: "main",
      engine: "sast",
      createdAt: new Date().toISOString(),
      state: "queued",
      outcome: "not_verified",
      evidenceOutcome: "not_verified",
      verifiedFixed: false,
      reason: "controlled fixture",
    };
    const fixedText = texts[1],
      fixed: SourceFile = {
        ...base,
        baseCommit: after.repository.commit,
        blob: gitBlob(fixedText),
        sourceSha256: sha256(fixedText),
        content: fixedText,
      };
    const comparison = compareTargeted(before, after, proposal, t, fixed);
    expect(comparison).toMatchObject({
      outcome: "fixed",
      evidenceOutcome: "verified_fixed",
      verifiedFixed: true,
    });
    const partial = structuredClone(after);
    partial.runs[0].coverage!.status = "partial";
    expect(
      compareTargeted(before, partial, proposal, t, fixed).verifiedFixed,
    ).toBe(false);
    // Also feed the ACTUAL normalized scanner findings through PostgreSQL and the G03 service.
    // Provider, source transport, PR transport and enqueue are explicit test doubles here.
    const pg = await nativePostgres();
    let persistedFlow: Record<string, unknown>;
    try {
      after.idempotencyKey = "g02-live-controlled-after-" + runId;
      for (const job of [before, after]) {
        await pg.admin.query(
          "INSERT INTO guard.scans(mode,workspace_id,project_id,scan_id,idempotency_key,fingerprint,repository_id,commit_sha,status,job,revision,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,1,$11)",
          [
            job.mode,
            job.workspaceId,
            job.projectId,
            job.id,
            job.idempotencyKey,
            fingerprint(job),
            job.repository.repositoryId,
            job.repository.commit,
            job.status,
            JSON.stringify(job),
            job.createdAt,
          ],
        );
        await pg.admin.query(
          "INSERT INTO platform.jobs(module,mode,workspace_id,project_id,job_id,kind,subject_ref,idempotency_key,available_at,max_attempts,state,fingerprint,finished_at) VALUES('guard',$1,$2,$3,$4,'guard.scan.repository',$4,$5,clock_timestamp(),1,'completed',$6,clock_timestamp())",
          [
            job.mode,
            job.workspaceId,
            job.projectId,
            job.id,
            job.idempotencyKey,
            fingerprint(job),
          ],
        );
      }
      let store = new PostgresG03Store(pg.db());
      const service = new G03Service({
        store,
        source: {
          read: async (_a, branch, commit, path) => {
            expect(branch).toBe("main");
            expect(path).toBe("route.ts");
            if (commit === base.baseCommit) return base;
            if (commit === fixed.baseCommit) return fixed;
            throw Error("fixture_revision_denied");
          },
        },
        provider: f.provider,
        github: f.github,
        scanner: {
          enqueue: async () => ({ scanId: after.id }),
          get: async (a, id) => (await store.get(a, id)).job,
        },
        revalidate: f.revalidate,
      });
      await service.generate(
        f.authority,
        before.id,
        {
          revision: 1,
          findingId: original.id,
          requestKey: "g03-real-scanner-pg-fixture",
          aiConsent: true,
          sourceConsent: true,
          path: base.path,
          baseCommit: base.baseCommit,
          sourceSha256: base.sourceSha256,
          planDigest: fingerprint(plan),
        },
        new AbortController().signal,
      );
      let state = await service.state(f.authority, before.id);
      const p = state.proposals[0];
      expect(p.patch?.digest).toBe(patch.digest);
      await service.review(
        f.authority,
        before.id,
        {
          revision: state.revision,
          proposalId: p.id,
          patchDigest: p.patch!.digest,
          decision: "approved",
          reason: "Controlled source reviewed; real scanner proof is required",
        },
        new AbortController().signal,
      );
      state = await service.state(f.authority, before.id);
      await service.publish(
        f.authority,
        before.id,
        {
          revision: state.revision,
          proposalId: p.id,
          patchDigest: p.patch!.digest,
          repositoryId: "123",
          baseCommit: base.baseCommit,
          writeConsent: true,
        },
        new AbortController().signal,
      );
      state = await service.state(f.authority, before.id);
      await service.startRetest(
        f.authority,
        before.id,
        {
          revision: state.revision,
          proposalId: p.id,
          afterCommit: fixed.baseCommit,
          branch: "main",
          retestConsent: true,
        },
        new AbortController().signal,
      );
      state = await service.state(f.authority, before.id);
      const result = await service.compareRetest(
        f.authority,
        before.id,
        { revision: state.revision, retestId: state.retests[0].id },
        new AbortController().signal,
      );
      expect(result.value.verifiedFixed).toBe(true);
      await service.createReport(f.authority, before.id, {
        revision: result.revision,
      });
      const beforeRestart = await store.get(f.authority, before.id);
      expect(beforeRestart.job.findings).toEqual(before.findings);
      await pg.restart();
      store = new PostgresG03Store(pg.db());
      const durable = await store.get(f.authority, before.id);
      expect(durable).toEqual(beforeRestart);
      persistedFlow = {
        actualScannerFindingsPersisted: before.findings.length,
        proposalPersisted: true,
        reviewPersisted: true,
        prTestDoubleLinked: true,
        realScannerRetestPersisted: durable.job.guardG03!.retests[0],
        reportPersisted: true,
        restartVerified: true,
        originalFindingHistoryPreserved: true,
        sourceAndProviderAndPrAndEnqueueAreTestDoubles: true,
      };
    } finally {
      await pg.stop();
    }
    await mkdir("test-results/guard-g03", { recursive: true });
    await writeFile(
      "test-results/guard-g03/real-scanner-evidence.json",
      JSON.stringify(
        {
          classification:
            "REAL_G02_SCANNER_CONTROLLED_SOURCE_NOT_LIVE_REPOSITORY_OR_AI_ACCEPTANCE",
          runId,
          scannerVersion: version,
          imageId: image,
          records,
          patchDigest: patch.digest,
          comparison,
          persistedFlow,
          ownerRepositoryAccessed: false,
          ownerDatabaseAccessed: false,
          aiProviderCalled: false,
          githubWritten: false,
          allOwnedContainersRemoved: true,
        },
        null,
        2,
      ),
    );
  } finally {
    if (active) {
      const observed = JSON.parse(
        await docker.call(["inspect", active, "--format", "{{json .}}"]),
      );
      if (
        observed.Id !== activeId ||
        observed.Config.Labels["wetscan.run"] !== runId
      )
        throw Error("fixture_cleanup_identity_unknown");
      await docker.call(["rm", "--force", active]);
    }
    const actual = await realpath(root);
    if (
      dirname(actual).toLowerCase() !==
        (await realpath(tmpdir())).toLowerCase() ||
      !basename(actual).startsWith("wetscan-g01-snapshot-g03-retest-")
    )
      throw Error("fixture_cleanup_boundary");
    await rm(actual, { recursive: true });
  }
});

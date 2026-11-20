import { vi } from "vitest";
import { analysisFixture, afterScan } from "../live/analysis-fixture";
import { G03Service } from "../../../src/features/guard/g03/service";
import { PostgresG03Store } from "../../../src/features/guard/g03/store";
import { PlatformDatabase } from "../../../src/platform/database";
import { fakePool } from "../../platform/helpers";
import { fingerprint } from "../../../src/platform/identity";
import { gitBlob, sha256 } from "../../../src/features/guard/g03/safety";
import type {
  SourceFile,
  ProviderPlan,
  G03Job,
  Snapshot,
} from "../../../src/features/guard/g03/contracts";
import type { ProjectAuthority } from "../../../src/features/guard/live/model";
import { authorize } from "../../../src/features/guard/security";
import type { StorePort } from "../../../src/features/guard/g03/store";
export const plan: ProviderPlan = {
  provider: "unit_provider",
  model: "unit_model",
  promptVersion: "unit_prompt",
  policyVersion: "unit_policy",
  maxInputTokens: 10000,
  maxOutputTokens: 2000,
  reservedMicroUsd: 10000,
};
export const advice = {
  explanation: "Untrusted input reaches evaluation.",
  rootCause: "Dynamic evaluation of input.",
  recommendation: "Parse a JSON value instead.",
  securityConsequences: "Input must not execute as code.",
  compatibilityRisks: "Inputs must be valid JSON.",
  verification: "Real scanner on the exact patch revision.",
  alternative: "Remove the evaluation feature.",
};
export const content =
  "export function route(input: string) { return eval(input); }\n";
export const edit = { oldText: "eval(input)", newText: "JSON.parse(input)" };
export function fileFixture(
  text = content,
  commit = "a".repeat(40),
): SourceFile {
  return {
    repositoryId: "123",
    branch: "main",
    baseCommit: commit,
    tree: "b".repeat(40),
    path: "route.ts",
    blob: gitBlob(text),
    sourceSha256: sha256(text),
    content: text,
  };
}
export async function fixture() {
  const f = await analysisFixture();
  f.job.runs[0].scanner = "opengrep";
  const authority: ProjectAuthority = {
    grant: f.grant,
    repositoryId: "123",
    repositoryName: "fixture/repository",
    branch: "main",
    installationId: 9,
    userId: 7,
  };
  // Stateful SQL double, explicitly NOT a real PostgreSQL or scanner acceptance.
  let snapshot: Snapshot = {
    job: f.job,
    revision: 1,
    retentionUntil: new Date(Date.now() + 86400000).toISOString(),
  };
  const queue = {
    kind: "guard.scan.repository",
    state: "completed",
    lease_owner: null,
    lease_token: null,
  };
  let usage = { requests: 0, cost: "0", recent: 0 };
  const client = f.c;
  client.respond = async (sql, values) => {
    if (sql.startsWith("SELECT kind")) return { rowCount: 1, rows: [queue] };
    if (sql.startsWith("SELECT job,revision"))
      return {
        rowCount: 1,
        rows: [
          {
            job: structuredClone(snapshot.job),
            revision: snapshot.revision,
            retention_until: snapshot.retentionUntil,
          },
        ],
      };
    if (sql.startsWith("SELECT count(*)"))
      return { rowCount: 1, rows: [usage] };
    if (sql.startsWith("UPDATE guard.scans")) {
      snapshot.job.guardG03 = JSON.parse(values[5] as string);
      snapshot.revision++;
      return { rowCount: 1, rows: [] };
    }
    return { rowCount: 0, rows: [] };
  };
  const store = new PostgresG03Store(
    new PlatformDatabase(fakePool(client), false, "guard"),
  );
  const file = fileFixture(),
    source = { read: vi.fn(async () => structuredClone(file)) };
  const provider = {
    plan: vi.fn(() => plan),
    generate: vi.fn(async () => ({
      advice,
      edit,
      responseId: "unit_response",
      inputTokens: 300,
      outputTokens: 400,
    })),
  };
  const github = {
    enabled: true,
    permission: vi.fn(async () => {}),
    publish: vi.fn(async () => ({
      state: "open" as const,
      number: 1,
      url: "https://github.com/fixture/repository/pull/1",
      headCommit: "c".repeat(40),
    })),
    status: vi.fn(async () => ({
      state: "open" as const,
      number: 1,
      url: "https://github.com/fixture/repository/pull/1",
      headCommit: "c".repeat(40),
    })),
  };
  const after = afterScan(f.job);
  after.runs[0].coverage = {
    status: "complete",
    scannedFiles: 1,
    eligibleFiles: 1,
    scope: "unit_fixture",
  };
  const scanner = {
    enqueue: vi.fn(async () => ({ scanId: after.id })),
    get: vi.fn(async () => after),
  };
  const revalidate = vi.fn(async () => authority);
  const service = new G03Service({
    store,
    source,
    provider,
    github,
    scanner,
    revalidate,
  });
  const generate = (extras: Record<string, unknown> = {}) => ({
    revision: snapshot.revision,
    findingId: f.job.findings[0].id,
    requestKey: "g03-unit-request01",
    aiConsent: true,
    sourceConsent: true,
    path: file.path,
    baseCommit: file.baseCommit,
    sourceSha256: file.sourceSha256,
    planDigest: fingerprint(plan),
    ...extras,
  });
  const context = () => ({
    revision: snapshot.revision,
    findingId: f.job.findings[0].id,
    path: file.path,
    baseCommit: file.baseCommit,
    sourceConsent: true,
  });
  async function proposed() {
    await service.generate(
      authority,
      f.job.id,
      generate(),
      new AbortController().signal,
    );
    return snapshot.job.guardG03!.proposals[0];
  }
  async function approved() {
    const p = await proposed();
    await service.review(
      authority,
      f.job.id,
      {
        revision: snapshot.revision,
        proposalId: p.id,
        patchDigest: p.patch!.digest,
        decision: "approved",
        reason: "Human reviewed the exact patch and compatibility risk",
      },
      new AbortController().signal,
    );
    return snapshot.job.guardG03!.proposals[0];
  }
  return {
    ...f,
    authority,
    store,
    source,
    provider,
    github,
    scanner,
    revalidate,
    service,
    file,
    after,
    queue,
    client,
    generate,
    context,
    proposed,
    approved,
    get: () => snapshot,
    set: (s: Snapshot) => {
      snapshot = s;
    },
    setUsage: (v: typeof usage) => {
      usage = v;
    },
  };
}
/** Storage seam for optional native-PostgreSQL acceptance fixtures; no host database configuration. */
export function memoryStore(snapshot: Snapshot): StorePort {
  return {
    get: async (a) => {
      authorize(a.grant, snapshot.job, "read");
      return structuredClone(snapshot);
    },
    change: async <T>(
      a: ProjectAuthority,
      _id: string,
      revision: number | null,
      op: "triage" | "report",
      apply: (snapshot: Snapshot, state: NonNullable<G03Job["guardG03"]>) => T,
    ) => {
      authorize(a.grant, snapshot.job, op);
      if (revision !== null && revision !== snapshot.revision)
        throw Error("revision_conflict");
      const { emptyState } =
        await import("../../../src/features/guard/g03/contracts");
      const state = snapshot.job.guardG03 ?? emptyState();
      const value = apply(snapshot, state);
      snapshot.job.guardG03 = state;
      snapshot.revision++;
      return { value, revision: snapshot.revision };
    },
  };
}

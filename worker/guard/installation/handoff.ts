/** Explicit local controlled-fixture qualification: no real provider, database, queue claim or credentials. */
import { readFile, writeFile, access } from "node:fs/promises";
import { resolve, join } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import type { ProductDeployment } from "../../../src/features/guard/live/product-deployment";
import type { RepositoryScanPolicy } from "../../../src/features/guard/live/product-policy";
import type { Grant, ScanJob } from "../../../src/features/guard/contracts";
import type {
  SourceAccess,
  SourceEntry,
} from "../../../src/features/guard/live/model";
import { createJob } from "../../../src/features/guard/pipeline";
import {
  qualificationAttestation,
  assertPrivateRuntimeRoot,
} from "../../../src/features/guard/live/product-preflight";
import { ProductSessionBroker } from "../product-broker";
import { operationalRepositoryScanner } from "../scanner-adapter";
import { executeScopedJob } from "../orchestrator";
import { bindGuardJob } from "../approval";
import { ResourceRegistry } from "../acceptance/registry";
import { dockerDriver } from "../sandbox";
import { installationDocker } from "./qualify";
const hash = (s: string | Buffer) =>
  createHash("sha256").update(s).digest("hex");
const root = resolve(process.argv[2] ?? "");
const reportId = randomUUID();
const report: {
  classification: string;
  ownerRepositoryAccessed: boolean;
  databaseConnected: boolean;
  cases: unknown[];
  status: string;
} = {
  classification:
    "REAL_DOCKER_BROKER_HANDOFF_CONTROLLED_FIXTURES_NOT_GITHUB_OR_POSTGRES_ACCEPTANCE",
  ownerRepositoryAccessed: false,
  databaseConnected: false,
  cases: [],
  status: "RUNNING",
};
async function main() {
  await assertPrivateRuntimeRoot(root);
  const measured = JSON.parse(
    await readFile(join(root, "deployments.measured.json"), "utf8"),
  ) as { deployments: ProductDeployment["deployments"] };
  if (!measured.deployments.length || measured.deployments.length > 5)
    throw Error("measurement_missing");
  const scope = {
    mode: "live" as const,
    workspaceId: "github-user-7:controlled-fixture",
    projectId: "github-123",
  };
  for (const variant of ["vulnerable", "clean"] as const) {
    for (const d of measured.deployments) {
      const grant = (): Grant => ({
        ...scope,
        actorId: "github-user-7",
        operations: ["scan", "read", "report", "triage"],
        issuedAt: Date.now(),
        expiresAt: Date.now() + 60000,
      });
      const bad = variant === "vulnerable";
      const secret =
        "ghp_" +
        Array.from(
          { length: 36 },
          (_, i) => "abcdefghijklmnopqrstuvwxyz0123456789"[(i * 7 + 3) % 36],
        ).join("");
      const name = bad ? "lodash" : "is-number",
        version = bad ? "4.17.15" : "7.0.0";
      const files: Record<string, string> = {
        "test.js": bad
          ? "function route(input) { return eval(input); }"
          : "function sum(a,b) { return a + b; }",
        "test.ts": bad
          ? "export function route(input: string) { return eval(input); }"
          : "export function sum(a: number, b: number): number { return a + b; }",
        "view.tsx": bad
          ? "export function Page({value}: {value:string}) { return <div>{eval(value)}</div>; }"
          : "export function Page() { return <div>Controlled fixture</div>; }",
        "token.txt": bad
          ? "token = " + secret
          : "NO_CREDENTIALS_IN_CLEAN_FIXTURE",
        "main.tf": bad
          ? 'resource "aws_security_group" "fixture" {\n  name = "fixture"\n  ingress {\n    from_port = 0\n    to_port = 0\n    protocol = "-1"\n    cidr_blocks = ["0.0.0.0/0"]\n  }\n}\n'
          : 'locals { fixture = "safe-static-value" }',
        "packages/app/package-lock.json": JSON.stringify({
          name: "controlled-fixture",
          version: "1.0.0",
          lockfileVersion: 3,
          packages: {
            "": {
              name: "controlled-fixture",
              version: "1.0.0",
              dependencies: { [name]: version },
            },
            ["node_modules/" + name]: { version },
          },
        }),
      };
      const contents = new Map<string, Buffer>(),
        entries: SourceEntry[] = Object.entries(files).map(([path, text]) => {
          const b = Buffer.from(text),
            sha = createHash("sha1")
              .update("blob " + b.length + "\0")
              .update(b)
              .digest("hex");
          contents.set(sha, b);
          return { path, sha, mode: "100644", type: "blob", size: b.length };
        });
      const commit = hash(JSON.stringify(files)).slice(0, 40),
        tree = hash("tree" + commit).slice(0, 40);
      const source: SourceAccess = {
        authorize: async () => ({
          grant: grant(),
          repositoryId: "123",
          repositoryName: "controlled/fixture",
          branch: "main",
          installationId: 9,
          userId: 7,
        }),
        open: async () => ({
          head: async () => ({ commit, tree }),
          tree: async () => ({ sha: tree, truncated: false, entries }),
          blob: async (sha) => {
            const b = contents.get(sha);
            if (!b) throw Error("controlled_blob_missing");
            return {
              sha,
              size: b.length,
              encoding: "base64",
              content: b.toString("base64"),
            };
          },
          close: async () => {},
        }),
      };
      const request = {
        ...scope,
        repository: {
          provider: "github" as const,
          repositoryId: "123",
          branch: "main",
          commit,
        },
        profile: "standard" as const,
        engines: [d.engine],
        idempotencyKey: "g02-live-controlled-" + randomUUID(),
      };
      let stored: ScanJob = await createJob(grant(), request);
      stored.audit.push({
        actorId: grant().actorId,
        at: new Date().toISOString(),
        action: "repository_scan_requested",
        subjectId: stored.id,
        reason: "CONTROLLED_FIXTURE_NO_PROVIDER_OR_DATABASE",
      });
      const policy: RepositoryScanPolicy = {
        version: 1,
        id: "controlled-fixture",
        workspaceId: scope.workspaceId,
        projectId: scope.projectId,
        repositoryId: "123",
        branches: ["main"],
        engines: [d.engine],
        scannerTimeoutMs: 45000,
        jobTimeoutMs: 120000,
        maxAttempts: 1,
      };
      const broker = new ProductSessionBroker(stored, policy, source),
        paths: string[] = [];
      const scanner = operationalRepositoryScanner({
        engine: d.engine,
        binding: bindGuardJob(stored),
        spec: d.spec,
        qualification: d.qualification,
        policy,
        evidence: await qualificationAttestation(root, d),
        sourceOwner: broker.owner,
        registry: new ResourceRegistry(root),
        privateRoot: root,
        freshGrant: () => broker.freshGrant(),
        verifyLease: async () => {},
        driver: dockerDriver(d.spec.docker, d.spec.endpoint),
      });
      const execute = scanner.execute.bind(scanner);
      scanner.execute = async (s, signal) => {
        paths.push(await broker.owner.directory(s));
        return execute(s, signal);
      };
      const started = Date.now();
      try {
        const result = await executeScopedJob(
          {
            freshGrant: () => broker.freshGrant(),
            storage: {
              create: async (_g, j) => structuredClone(j),
              get: async () => structuredClone(stored),
              save: async (_g, j) => {
                stored = structuredClone(j);
              },
            },
            snapshots: broker.snapshots,
            scanners: [scanner],
            sandbox: {
              ready: true,
              readOnly: true,
              nonRoot: true,
              egressControlled: true,
              cpuLimit: 1,
              memoryMb: d.spec.memoryMb,
              pidsLimit: 64,
              timeoutMs: 45000,
            },
          },
          grant(),
          stored,
          stored.id,
          new AbortController().signal,
        );
        await broker.close();
        const run = result.runs.find((r) => r.engine === d.engine)!;
        const expectedFindings = bad && d.engine !== "sbom";
        if (
          !["completed", "completed_partial"].includes(result.status) ||
          !["completed", ...(bad ? [] : ["not_applicable"])].includes(
            run.status,
          ) ||
          run.executionEvidence?.cleanup !== "VERIFIED" ||
          !run.artifactDigest ||
          (expectedFindings
            ? result.findings.length < 1
            : result.findings.length !== 0)
        )
          throw Error("controlled_result_incomplete_" + run.status);
        if (
          bad &&
          d.engine === "sast" &&
          !["test.js", "test.ts", "view.tsx"].every((p) =>
            result.findings.some((f) => f.location.path === p),
          )
        )
          throw Error("controlled_js_ts_tsx_match_missing");
        if (
          result.findings.some((f) =>
            f.evidence.some((e) => e.commit !== commit || e.synthetic),
          ) ||
          JSON.stringify(result).includes(secret)
        )
          throw Error("controlled_provenance_or_redaction_failed");
        if (
          ["sca", "sbom"].includes(d.engine) &&
          result.inventory?.length !== 1
        )
          throw Error("controlled_inventory_missing");
        if (d.engine === "sbom" && result.sbom?.components.length !== 1)
          throw Error("controlled_sbom_missing");
        for (const p of paths) {
          try {
            await access(p);
            throw Error("controlled_source_still_present");
          } catch (e) {
            if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
          }
        }
        const docker = installationDocker(
          d.spec.docker,
          d.spec.endpoint,
          join(root, "docker-config"),
        );
        const left = (
          await docker.call([
            "ps",
            "--all",
            "--filter",
            "label=wetscan.job=" + stored.id,
            "--format",
            "{{.ID}}",
          ])
        ).trim();
        if (left) throw Error("controlled_container_still_present");
        report.cases.push({
          variant,
          engine: d.engine,
          status: "PASS",
          jobId: stored.id,
          commit,
          files: result.sourceCoverage?.retrievedFiles,
          engineStatus: run.status,
          coverage: run.coverage,
          findings: result.findings.length,
          inventory: result.inventory?.length ?? 0,
          sbomComponents: result.sbom?.components.length ?? 0,
          artifactSha256: run.artifactDigest,
          imageId: run.executionEvidence.imageId,
          elapsedMs: Date.now() - started,
          sourceAbsent: true,
          containerAbsent: true,
          cleanup: "VERIFIED",
          authProvider: "EXPLICIT_DOUBLE",
          storage: "MEMORY_ONLY",
          leaseVerification: "EXPLICIT_DOUBLE",
        });
      } catch (e) {
        report.cases.push({
          variant,
          engine: d.engine,
          status: "STOP",
          reason: e instanceof Error ? e.message : "unknown",
          engineState: stored.runs.find((r) => r.engine === d.engine)?.status,
          diagnostic: stored.runs.find((r) => r.engine === d.engine)?.reason,
        });
        throw e;
      }
    }
  }
  report.status = "PASS";
}
main()
  .catch(() => {
    report.status = "STOP";
    process.exitCode = 1;
  })
  .finally(async () => {
    await writeFile(
      join(root, "controlled-handoff." + reportId + ".json"),
      JSON.stringify(report, null, 2),
      { flag: "wx", mode: 0o600 },
    );
    console.log(JSON.stringify(report));
  });

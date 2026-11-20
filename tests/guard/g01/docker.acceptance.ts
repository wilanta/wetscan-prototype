/** Opt-in TRUSTED synthetic Docker control probes, never customer source or a production attestation issuer. */
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile, mkdir, lstat, realpath } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { dockerDriver } from "../../../worker/guard/sandbox";
import { LiveGuardError } from "../../../src/features/guard/live/model";
const exec = promisify(execFile);
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const packageRoot = resolve("docs/acceptance/guard-g01");
interface Plan {
  endpoint: string;
  docker: string;
  daemonId: string;
  daemonVersion: string;
  kernelVersion: string;
  image: string;
  platform: string;
  source: string;
  runId: string;
  containerNames: string[];
  cases: string[];
  harnessSha256: string;
  sourceFiles: Record<string, string>;
  allowedActions: string[];
}
async function main() {
  const document = JSON.parse(
    await readFile(join(packageRoot, "sandbox-plan.json"), "utf8"),
  );
  const plan: Plan = document.plan;
  const planHash = hash(JSON.stringify(plan));
  if (
    planHash !== document.planSha256 ||
    hash(
      (
        await readFile(resolve("tests/guard/g01/docker.acceptance.ts"), "utf8")
      ).replace(/\r\n/g, "\n"),
    ) !== plan.harnessSha256
  )
    throw new Error("package_integrity_failure");
  const run = process.argv.find((a) => a.startsWith("--run="));
  if (!run) {
    console.log(
      JSON.stringify({
        status: "WAITING_USER",
        planSha256: planHash,
        dockerOperations: 0,
        source: "trusted synthetic fixture only",
        connectedWorker: "NOT_TESTED",
      }),
    );
    return;
  }
  const approvalPath = run.slice(6);
  if (
    !isAbsolute(approvalPath) ||
    resolve(approvalPath) !==
      resolve(`.local/sentinel/guard-g01-unblock/sandbox-approval.${plan.runId}.json`)
  )
    throw new Error("approval_required");
  const stat = await lstat(approvalPath);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 32000)
    throw new Error("approval_required");
  const approval = JSON.parse(await readFile(approvalPath, "utf8"));
  const now = Date.now(),
    at = Date.parse(approval.approvedAt),
    expiry = Date.parse(approval.expiresAt);
  if (
    approval.module !== "guard-g01-sandbox-controls" ||
    approval.status !== "APPROVED" ||
    approval.planSha256 !== planHash ||
    typeof approval.approvedBy !== "string" ||
    !approval.approvedBy.trim() ||
    !Number.isFinite(at) ||
    !Number.isFinite(expiry) ||
    at > now ||
    expiry <= now ||
    expiry - at > 3600000 ||
    expiry <= at ||
    JSON.stringify(approval.actions) !== JSON.stringify(plan.allowedActions)
  )
    throw new Error("approval_required");
  if (
    !/^docker\.io\/library\/python@sha256:[a-f0-9]{64}$/.test(plan.image) ||
    plan.platform !== "linux/amd64" ||
    (await realpath(dirname(resolve(plan.source)))).toLowerCase() !==
      (await realpath(tmpdir())).toLowerCase() ||
    basename(plan.source) !== "wetscan-g01-snapshot-" + plan.runId ||
    plan.containerNames.length !== 6 ||
    new Set(plan.containerNames).size !== 6 ||
    plan.containerNames.some((n) => !/^wetscan-guard-[a-f0-9-]{36}$/.test(n)) ||
    JSON.stringify(plan.cases) !==
      JSON.stringify([
        "controls",
        "output",
        "timeout",
        "cancellation",
        "memory",
        "orphan_cleanup",
      ])
  )
    throw new Error("plan_denied");
  const probe = (
    await readFile(join(packageRoot, "sandbox-probe.py"), "utf8")
  ).replace(/\r\n/g, "\n");
  if (
    hash(probe) !== plan.sourceFiles["probe.py"] ||
    hash("guard-g01-synthetic-only\n") !== plan.sourceFiles["fixture.txt"]
  )
    throw new Error("fixture_integrity_failure");
  // Atomic one-attempt reservation. Never rewrite an operator record or silently retry a partial run.
  await writeFile(
    approvalPath + ".used",
    JSON.stringify({
      planSha256: planHash,
      startedAt: new Date().toISOString(),
    }),
    { flag: "wx", mode: 0o600 },
  );
  const config = join(tmpdir(), "wetscan-g01-docker-" + plan.runId);
  await mkdir(config, { mode: 0o700 });
  const driver = dockerDriver(plan.docker, plan.endpoint);
  const call = (
    args: string[],
    timeoutMs = 5000,
    maxBytes = 65536,
    signal?: AbortSignal,
  ) => {
    if (["pull", "create", "start"].includes(args[0]) && Date.now() >= expiry)
      throw new Error("approval_expired");
    return driver.call(args, {
      configDirectory: config,
      timeoutMs,
      maxBytes,
      signal,
    });
  };
  const report: Record<string, unknown> = {
    planSha256: planHash,
    startedAt: new Date().toISOString(),
    classification: "LIVE_CONTROL_PROBES",
    connectedWorker: "NOT_TESTED",
    productionAttestation: "NOT_ISSUED",
    source: plan.source,
    cases: [],
  };
  const cases: Record<string, unknown>[] = [];
  report.cases = cases;
  let failed = false;
  try {
    const server = JSON.parse(
      await call(["version", "--format", "{{json .Server}}"]),
    );
    const daemon = JSON.parse(
      await call([
        "info",
        "--format",
        '{"ID":{{json .ID}},"KernelVersion":{{json .KernelVersion}}}',
      ]),
    );
    if (
      server.Os !== "linux" ||
      server.Version !== plan.daemonVersion ||
      daemon.ID !== plan.daemonId ||
      daemon.KernelVersion !== plan.kernelVersion
    )
      throw new Error("daemon_identity_mismatch");
    await call(
      ["pull", "--platform", plan.platform, plan.image],
      120000,
      262144,
    );
    const image = JSON.parse(
      await call([
        "image",
        "inspect",
        "--format",
        '{"Id":{{json .Id}},"RepoDigests":{{json .RepoDigests}}}',
        plan.image,
      ]),
    );
    const digest = plan.image.split("@")[1];
    const aliases = [
      "python",
      "library/python",
      "docker.io/library/python",
    ].map((name) => name + "@" + digest);
    if (
      !/^sha256:[a-f0-9]{64}$/.test(image.Id) ||
      !Array.isArray(image.RepoDigests) ||
      !image.RepoDigests.some((d: string) => aliases.includes(d))
    )
      throw new Error("image_identity_mismatch");
    report.image = {
      reference: plan.image,
      imageId: image.Id,
      repoDigests: image.RepoDigests,
    };
    report.daemon = { ...daemon, ...{ version: server.Version } };
    await mkdir(plan.source, { mode: 0o700 }); // Existing source is a collision, never reused/overwritten.
    if (process.platform !== "win32")
      throw new Error("windows_acl_plan_required");
    const systemRoot = process.env.SystemRoot;
    if (!systemRoot) throw new Error("os_metadata_missing");
    const osEnv = {
      NODE_ENV: "production" as const,
      SystemRoot: systemRoot,
      WINDIR: systemRoot,
      TEMP: config,
      TMP: config,
    };
    const identity = await exec(
      join(systemRoot, "System32/whoami.exe"),
      ["/user", "/fo", "csv", "/nh"],
      { env: osEnv, windowsHide: true, timeout: 5000 },
    );
    const sid = identity.stdout.match(/S-1-5-21-[\d-]+/)?.[0];
    if (!sid) throw new Error("fixture_acl_unverified");
    await exec(
      join(systemRoot, "System32/icacls.exe"),
      [
        plan.source,
        "/inheritance:r",
        "/grant:r",
        `*${sid}:(OI)(CI)F`,
        "*S-1-5-18:(OI)(CI)F",
      ],
      { env: osEnv, windowsHide: true, timeout: 5000 },
    );
    const literal = "'" + plan.source.replaceAll("'", "''") + "'";
    const aclCommand = `$a=Get-Acl -LiteralPath ${literal}; [pscustomobject]@{protected=$a.AreAccessRulesProtected;owner=$a.GetOwner([System.Security.Principal.SecurityIdentifier]).Value;rules=@($a.GetAccessRules($true,$true,[System.Security.Principal.SecurityIdentifier]) | ForEach-Object { [pscustomobject]@{sid=$_.IdentityReference.Value;inherited=$_.IsInherited;type=[string]$_.AccessControlType;rights=[int]$_.FileSystemRights} })} | ConvertTo-Json -Depth 4 -Compress`;
    const acl = JSON.parse(
      (
        await exec(
          join(systemRoot, "System32/WindowsPowerShell/v1.0/powershell.exe"),
          ["-NoProfile", "-NonInteractive", "-Command", aclCommand],
          { env: osEnv, windowsHide: true, timeout: 10000 },
        )
      ).stdout,
    );
    if (
      !acl.protected ||
      acl.owner !== sid ||
      !Array.isArray(acl.rules) ||
      acl.rules.length !== 2 ||
      new Set(acl.rules.map((r: { sid: string }) => r.sid)).size !== 2 ||
      acl.rules.some(
        (r: {
          sid: string;
          type: string;
          rights: number;
          inherited: boolean;
        }) =>
          ![sid, "S-1-5-18"].includes(r.sid) ||
          r.type !== "Allow" ||
          r.inherited ||
          r.rights !== 2032127,
      )
    )
      throw new Error("fixture_acl_unverified");
    report.privateHostSource = {
      verified: true,
      aclSha256: hash(JSON.stringify(acl)),
      scope: "new synthetic fixture only",
    };
    await writeFile(join(plan.source, "probe.py"), probe, {
      flag: "wx",
      mode: 0o400,
    });
    await writeFile(
      join(plan.source, "fixture.txt"),
      "guard-g01-synthetic-only\n",
      { flag: "wx", mode: 0o400 },
    );
    for (let i = 0; i < plan.cases.length; i++) {
      if (Date.now() >= expiry) throw new Error("approval_expired");
      const test = plan.cases[i],
        name = plan.containerNames[i];
      const mode = ["timeout", "cancellation", "orphan_cleanup"].includes(test)
        ? "sleep"
        : test;
      const args = [
        "create",
        "--name",
        name,
        "--label",
        "wetscan.module=guard",
        "--label",
        "wetscan.acceptance=" + plan.runId,
        "--pull=never",
        "--network=none",
        "--read-only",
        "--user",
        "65532:65532",
        "--cap-drop=ALL",
        "--security-opt=no-new-privileges",
        "--pids-limit",
        "64",
        "--memory",
        "256m",
        "--memory-swap",
        "256m",
        "--cpus",
        "1",
        "--ipc=none",
        "--tmpfs",
        "/tmp:rw,noexec,nosuid,nodev,size=16777216",
        "--mount",
        `type=bind,src=${plan.source},dst=/source,readonly`,
        "--workdir",
        "/tmp",
        "--entrypoint",
        "/usr/local/bin/python3",
        plan.image,
        "-I",
        "-S",
        "/source/probe.py",
        mode,
      ];
      const row: Record<string, unknown> = {
        case: test,
        container: name,
        startedAt: new Date().toISOString(),
        status: "FAILED",
      };
      cases.push(row);
      try {
        await call(args);
        const state = JSON.parse(
          await call(["inspect", "--format", "{{json .}}", name]),
        );
        const h = state.HostConfig,
          mounts = state.Mounts;
        const sourceEqual = (s: string) =>
          resolve(s).toLowerCase() === resolve(plan.source).toLowerCase();
        const binds = mounts.filter((m: { Type: string }) => m.Type === "bind");
        if (
          state.Image !== image.Id ||
          state.Config.User !== "65532:65532" ||
          h.Privileged ||
          !h.ReadonlyRootfs ||
          h.NetworkMode !== "none" ||
          h.IpcMode !== "none" ||
          h.Memory !== 268435456 ||
          h.MemorySwap !== 268435456 ||
          h.PidsLimit !== 64 ||
          h.NanoCpus !== 1e9 ||
          !h.CapDrop.includes("ALL") ||
          !h.SecurityOpt.some((s: string) =>
            s.startsWith("no-new-privileges"),
          ) ||
          binds.length !== 1 ||
          binds[0].Destination !== "/source" ||
          binds[0].RW ||
          !sourceEqual(binds[0].Source) ||
          mounts.some(
            (m: { Type: string; Destination: string }) =>
              m.Type !== "bind" &&
              !(m.Type === "tmpfs" && m.Destination === "/tmp"),
          ) ||
          h.Tmpfs?.["/tmp"] !== "rw,noexec,nosuid,nodev,size=16777216" ||
          state.Config.Labels?.["wetscan.acceptance"] !== plan.runId
        )
          throw new Error("container_boundary_mismatch");
        row.inspectVerified = true;
        let output = "",
          caught: unknown;
        const abort = new AbortController();
        const timer =
          test === "cancellation"
            ? setTimeout(() => abort.abort(), 500)
            : undefined;
        const start = Date.now();
        try {
          output = await call(
            ["start", ...(test === "orphan_cleanup" ? [] : ["--attach"]), name],
            test === "timeout" ? 1500 : 5000,
            test === "output" ? 65536 : 32000,
            abort.signal,
          );
        } catch (e) {
          caught = e;
        } finally {
          if (timer) clearTimeout(timer);
        }
        row.durationMs = Date.now() - start;
        const after = JSON.parse(
          await call(["inspect", "--format", "{{json .State}}", name]),
        );
        if (test === "controls") {
          const checks = JSON.parse(output);
          if (
            caught ||
            after.Running ||
            after.ExitCode !== 0 ||
            Object.keys(checks).length !== 12 ||
            Object.values(checks).some((v) => v !== true)
          )
            throw new Error("control_probe_failure");
          row.controls = checks;
        } else if (test === "output") {
          if (
            !(caught instanceof LiveGuardError) ||
            caught.code !== "source_limit"
          )
            throw new Error("output_bound_not_enforced");
          row.outputLimitBytes = 65536;
        } else if (test === "timeout" || test === "cancellation") {
          if (
            !caught ||
            !after.Running ||
            (test === "cancellation" && !abort.signal.aborted) ||
            (test === "timeout" && Date.now() - start < 1400)
          )
            throw new Error("termination_probe_failure");
        } else if (test === "memory") {
          if (after.Running || after.ExitCode === 0 || !after.OOMKilled)
            throw new Error("memory_bound_not_enforced");
          row.oomKilled = true;
        } else if (caught || !after.Running)
          throw new Error("orphan_probe_failure");
        row.status = "PASS";
      } catch (e) {
        row.status = "FAILED";
        row.reason =
          e instanceof LiveGuardError
            ? e.code
            : e instanceof Error && /^[a-z_]+$/.test(e.message)
              ? e.message
              : "probe_failure";
        failed = true;
      } finally {
        // This exact name was reserved by this run; a timed-out create may also have created it.
        try {
          const owned = JSON.parse(
            await call([
              "inspect",
              "--format",
              '{"Name":{{json .Name}},"Image":{{json .Config.Image}},"Labels":{{json .Config.Labels}}}',
              name,
            ]),
          );
          if (
            owned.Name !== "/" + name ||
            owned.Image !== plan.image ||
            owned.Labels?.["wetscan.acceptance"] !== plan.runId ||
            owned.Labels?.["wetscan.module"] !== "guard"
          )
            throw new Error("cleanup_ownership_mismatch");
          await call(["rm", "--force", name]);
          row.cleanup = "REMOVED_OWNED_CONTAINER";
        } catch {
          row.cleanup = "FAILED_REQUIRES_OPERATOR_REVIEW";
          failed = true;
        }
        row.endedAt = new Date().toISOString();
      }
      if (failed) break; // Preserve evidence and stop; do not continue on uncertain cleanup/enforcement.
    }
    const hashes = {
      "probe.py": hash(await readFile(join(plan.source, "probe.py"), "utf8")),
      "fixture.txt": hash(
        await readFile(join(plan.source, "fixture.txt"), "utf8"),
      ),
    };
    if (JSON.stringify(hashes) !== JSON.stringify(plan.sourceFiles))
      throw new Error("source_changed");
    report.sourceUnchanged = true;
  } catch (e) {
    failed = true;
    report.reason =
      e instanceof LiveGuardError
        ? e.code
        : e instanceof Error && /^[a-z_]+$/.test(e.message)
          ? e.message
          : "runtime_probe_failure";
  } finally {
    report.status = failed ? "FAILED" : "PASS";
    report.endedAt = new Date().toISOString();
    report.retainedFixtures = true;
    const artifact = join(
      dirname(approvalPath),
      "sandbox-result-" + plan.runId + ".json",
    );
    await writeFile(artifact, JSON.stringify(report, null, 2) + "\n", {
      flag: "wx",
      mode: 0o600,
    });
    console.log(
      JSON.stringify({
        status: report.status,
        artifact,
        planSha256: planHash,
        connectedWorker: "NOT_TESTED",
        productionAttestation: "NOT_ISSUED",
      }),
    );
    if (failed) process.exitCode = 2;
  }
}
main().catch(() => {
  console.error(
    JSON.stringify({
      status: "BLOCKED_OR_FAILED",
      reason: "approval_package_or_runtime_setup_failure",
      secretsLogged: false,
    }),
  );
  process.exitCode = 2;
});

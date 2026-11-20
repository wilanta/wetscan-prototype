# Current G01 decision: connected Worker/Auth PASS prepare_only; overall PARTIALLY COMPLETE

Verified15November2026: two owner-authenticated enqueue HTTP200 responses produce exactly one durable job; one real worker attempt42.005s completed with fence1, observed lease renewals, running?stopped heartbeat, released lease, matching foundation_prepared audit/coverage and fresh final Auth response. Coverage82/90files,175159bytes, partial; scan failed is the truthful G02-unconfigured result, scanner/sandbox NOT_RUN. Post-run SQL18 preservation passes with matching45e7...1095d hashes, differences[],3retained scans/0active leases; actual full target marker independently verified. Old permit bytes/markers and staging preserved. Runtime budget2enqueue+1launch is consumed; no additional action is authorized. Overall G01 remains PARTIALLY COMPLETE: integrated sandbox, live security-negative and real crash/restart/recovery gates remain open.

Read [final Worker/Auth report](WORKER_AUTH_ACCEPTANCE_2c18db66.md) and [Will handoff](../../agent-handoffs/HANDOFF_WILL_G02_G06.md) for exact evidence, provenance/cleanup limits and remaining work. All conflicting older pending/unknown statements below are retained historical checkpoints.

---

# Current checkpoint: installed deadline repair; new-job approval pending

G01 remains **PARTIALLY COMPLETE**. Source-only acceptance is verified from matching owner-supplied HTTP200 and recovery journal carried forward in CONTINUE_G01.md; no source-only repeat. Deadline v3 is installed in the writable candidate; typecheck/lint/798 units/build/Guard7/Auth21/Canvas17 pass. Latest job is 2c18db662dcf8fec6052e05d02ed1362802facd839fca81a71a888c37b09ee18. New review packet SHA256 7f014b026d5e83634f4a2f07b17ffc9a27aabfe5a50f6c7dd029c7d977a2145a is NOT APPROVED; old permits expired and cannot authorize this different job. No enqueue/live worker/permit activation performed. See [worker recovery checkpoint](WORKER_RECOVERY_2c18db66.md) for actual hashes, validation, provenance, retained history and the concrete approval scope. All older statuses and old execution/UI steps below are historical and superseded where they conflict.

---

# Active exact-job execution approval - SOURCE PAUSED

SOURCE PAUSED: owner reported503 approval_required; matching .used reservation exists21:41:26WIB. No success is inferred. Do not retry/enqueue/launch until the first request outcome is correlated with sanitized Network/route evidence. See worker-source-attempt.json.

Owner explicitly approved packet 5b67e6ddeb0354447e199288bb028e4029c5241c7532d0034eb6e1c6f05f4960 for 55 minutes. Five permits activated at21:40:34WIB, expire22:35:34WIB on2026-11-15. No source/enqueue/worker started by activation. Current evidence and safe UI procedure: [WORKER_AUTH_UI_STEPS.md](WORKER_AUTH_UI_STEPS.md). Earlier NOT AUTHORIZED / WAITING_USER paragraphs below describe historical preparation and are superseded only for this exact job/window.

---

# Current exact-job approval request - 2026-11-15T21:35:25.270158+07:00

Existing app startup is confirmed by owner. Draft2 is exported AFTER successful startup. Active pending-file paths remain unchanged; the server reads approvals per operation, so activation requires no restart/reverification. Do not click Verify again or reload/reexport a different draft during this acceptance window. Exact current job**904d08f2a392f1f9d75b48309f9e270bfbf9e2e6e3ebcb7c322d415aa18f96ba**, idempotency**19015d9d-9513-4307-9f85-3fb2f421ae6b**. Request SHA256**5b67e6ddeb0354447e199288bb028e4029c5241c7532d0034eb6e1c6f05f4960**. All5 permits still WAITING_USER; no source snapshot/enqueue/worker has run. Older draft1 packet and pending records are preserved as history; they are not approved.

Prepared a SELECT READ ONLY exact-job observer using existing guarded app/worker pools. It checks durable binding/audit/coverage/queue/attempt/heartbeat without selecting lease tokens or creating an Auth grant. Backend response after fresh Auth is a separate required proof. Includes one unauthenticated GET protection probe with no cookie/token. Scope remains1source-only attempt,2identical enqueue calls=>1job,1prepare_only worker, scoped observer/owned cleanup,55minutes after explicit approval; no Docker/scanner/production/Sentinel/schema/password operation. Test/lint/typecheck for observer passed. Full existing affected checks782/build/Guard7/Auth21/Canvas17 already passed; canonical migration hash unchanged.

## Safe owner UI sequence after approval

1. Do not reverify the repository; retain draft2 verified state and current session. Click **Verify approved source snapshot** once; copy only response/status/metadata (no headers/cookies/source).
2. Click **Queue approved preparation** once. The UI disables it after success; the second identical request uses the bounded existing-session browser request in [WORKER_AUTH_UI_STEPS.md](WORKER_AUTH_UI_STEPS.md), only when instructed. Both responses must return this exact job ID. No launch until the READ ONLY observer confirms one matching queued record.
3. Click the existing approved preparation worker button once when instructed. Backend must finish fresh Auth+persisted audit/coverage checks; HTTP/exit0 alone is not accepted. Expected scannerExecution NOT_RUN and scan statusfailed for G02-not-configured remain truthful.
4. Operator observer plus isolated Sentinel18 comparison after work; retain evidence and2previous cancelled test fixtures. Stop on a mismatch/error; do not reset or automatically retry/erase.used markers.

The user will perform UI clicks through their normal authenticated browser, as computer control is prohibited for this task. Only the agreed exact worker is launched by the existing backend action. Full G01 remains incomplete until other mandatory live gates/integrated sandbox are genuinely proven.

---

# G01 connected worker/Auth acceptance plan - NOT AUTHORIZED TO EXECUTE

Prepared from owner-exported actual UI draft `C:\laragon\www\wetscan-2\guard-preparation-request (1).json`. This document is a concrete preparation, not approval or runtime evidence. The owner explicitly requires a separate approval before worker execution. No worker, source snapshot or live job has been started/enqueued here.

## Validated draft and target

- Repository: inkAja/wdu; backend-selected repository ID839286157, projectgithub-839286157.
- Branch main; exact commit41861b14dbb3f329fe3b20aed59a008390ef0e2b.
- Actor github-user-145520313; workspace github-user-145520313:testing.
- Job 904d08f2a392f1f9d75b48309f9e270bfbf9e2e6e3ebcb7c322d415aa18f96ba; idempotency 19015d9d-9513-4307-9f85-3fb2f421ae6b; profilequick; requested engines["sast"] are metadata only. No SAST engine executes in G01 prepare_only.
- Job ID was independently recomputed from the existing createJob SHA256 formula (workspace/project/mode/idempotency). Request/binding fields match; current actual Auth ownership must still be verified by backend at runtime. No mock grant/session/token or hardcoded installation ID is created.
- PostgreSQL ONLY localhost:5432/wetscan_s01_test_guardg01, markerwetscan-s01:aa8b15a6-7ed3-4f19-81f0-07d9759ec62f; Guard migration hashb63e1e8568babcf8d7811fe0fa735ecbec11ade64df19bdea78deb030a85869d.
- Worker IDg01-acceptance-49f2240c-10eb-47c8-9d08-2d8d06cc81a7; exact-job claim only. Current2 cancelled synthetic test scans remain intact. No Sentinel worker/scheduler.
- Proposed packet SHA256 **5b67e6ddeb0354447e199288bb028e4029c5241c7532d0034eb6e1c6f05f4960** ([worker-auth-request.json](worker-auth-request.json)). Source draft raw SHA2561bcd7847fc69ef7b58f1f1a3c3ee8fa85ead019708e6f4f4f7844780525fc918. All five proposed permits remain WAITING_USER, blank approver/timestamps. Final binding must be refreshed if UI verification regenerates idempotency/job ID.

## Safe preparation before execution approval

1. Finish current private snapshot security checks. Default Windows temp preflight proved a different account SID inherited read access. Guard now secures ONLY its newly created empty snapshot root to owner+SYSTEM BEFORE the first source file write and verifies actual ACL.24 targeted filesystem/broker/snapshot tests passed after canonical Windows8.3 path handling was corrected. Final affected checks passed: typecheck, lint,782/782 units, production build,Guard7/Auth21/Canvas17 E2E. The Windows helper lazily loads OS execution only when securing a new Windows root, preserving all old launcher assertions. No source/worker execution approval follows from passing checks.
2. Sidecar `.env.guard-g01.worker-49f2240c.local` is ignored Git, contains ONLY the existing Guard path/flag keys and points at WAITING_USER permits. Existing.env.local/keys/Auth store remain unread/unmodified. Do not copy credentials to a second system. Enabling a flag alone is not authorization; existing guards reject WAITING_USER before opening pools/snapshots.
3. Owner should stop the existing candidate localhost app normally before restarting it with this non-secret sidecar, maintaining the same existing Auth configuration/data directory and origin. Never run two Auth writers. No automatic process kill/start is performed by the agent.

```powershell
cd C:\laragon\www\wetscan-2\wetscan-guard-g01-s03-candidate
node -e "process.loadEnvFile('.env.guard-g01.worker-49f2240c.local');const r=require('node:child_process').spawnSync('cmd.exe',['/d','/s','/c','npm.cmd run dev -- --hostname 127.0.0.1 --port 3000'],{stdio:'inherit',env:process.env});process.exit(r.status??1)"
```

Normal Next startup may consume its existing Auth credential configuration internally; the agent never inspects.env contents or exported cookies/tokens. No OAuth/onboarding/picker replacement. While permits wait, do not click source/enqueue/launch. Metadata verification through normal Auth UI is allowed preparation. A restart/page reload may discard the React verified draft. If so, verify the SAME selected branch/commit again and export a new preparation request; supply its non-secret path, and regenerate the bound pending permits/request hash BEFORE seeking final execution approval. Never silently substitute a new job under an old approval.

## Exact proposed execution scope (requires future approval)

After final app readiness/current draft verification and explicit approval, stamp real approvedAt/expiresAt for no more than55minutes:

- Independent Guard app/worker role runtime permits for the exact target above, using the existing private purpose files. Prior25-check approval is scoped to test runners and is not reused for app/worker job execution.
- One source-only snapshot operation through existing same-origin `/api/guard/projects/github-839286157/source-acceptance`, with current Auth session, exact actor/workspace/repo/branch/SHA/origin, max1000files/65536bytes per file/20MBtotal/45s. Backend alone verifies current GitHub user/App installation and branch membership; repository-limited metadata:read+contents:read token mint/revoke is internal, with no token/private-key output and no GitHub repository/settings write. Temporary owned source only; cleanup required. One-attempt.used guard retained even on failure.
- Enqueue the single job through existing `/api/guard/projects/github-839286157/preparation` with bodyaction=enqueue plus this draft request. Repeat identical enqueue once to prove idempotency; expect one scan/job, no duplicate scope. No other repository/job/source permissions.
- Launch only that job through existing same-origin action=launch/scanId. Broker resolves current real Auth in the single parent process; child receives grants/metadata via inherited private IPC and only worker credential-file paths. It does not receive Auth files/cookies/OAuth/App tokens or a Docker socket. Verify active lease before/after acquisition, actor/repo/installation/branch/SHA binding, bounded grant, handler20s/lease30s/heartbeat5s, cancellation/cleanup code paths; do not widen limits to conceal failure.
- Operator may inspect ONLY the exact job/queue/audit/coverage/lease/worker heartbeat in the G01 DB. Stop/drain only the owned child through existing launcher. No production worker, migration, schema/role/password mutation, other DB, GitHub write, container/scanner or G02. Retain job/audit/evidence. Compare isolated Sentinel observer18 after job activity.

## Required evidence and honest expected behavior

A303/HTTP200/child exit0 is insufficient. Require fresh Auth verification plus persisted exact-job `foundation_prepared` audit and actual source coverage; cleanup verified and no owned temporary root/child/lease left. Current handler deliberately ends scan statusfailed with G02-not-configured reason; it must not claim SAST completion. Source-only result must include actual commit/tree/digest/count/coverage and cleanup, not raw source. Report excluded sensitive/binary/symlink/submodule/limit paths as partial coverage; never claim complete when truncated.

This prepare_only flow does NOT execute Docker. The real6/6 synthetic Docker probes are separate enforcing-control evidence. Full G01 foundation flow still needs reviewed composition to the existing enforcing Docker adapter with an approved command/image/spec-bound operator attestation and source mapping; do not relabel prepare_only as sandbox execution. Production adapter currently accepts reviewed ghcr scanner/probe specs; the Docker Official Python control harness is trusted synthetic infrastructure acceptance, not automatically a production supported spec/attestation.

Live user-session revocation/worker crash-restart/lease renewal timing and timeout/cancel under actual load need their own controlled phase/job if not observed in the positive attempt. Do not mutate GitHub permissions or logout the real user mid-job without the exact test approval. Existing unit/fixture tests cover these dependencies but are not Live proof. Any session expiry, repository removal, wrong actor/job/spec/target/hash/marker/lease must deny safely, preserve audit and clean owned source. No broad retry/reset/marker deletion.

## Current decision

Ready for owner REVIEW of the plan, subject to affected local security checks and final app/draft readiness. **Execution approval NOT granted.** G01 overall PARTIALLY COMPLETE; G02 remains gated. See../../GUARD_G01_FINAL_ACCEPTANCE.md for actual PostgreSQL25-check and Docker6-case evidence; do not overwrite that success with stale UNKNOWN statuses.

## Verified Windows startup correction

See [STARTUP_CMD.md](STARTUP_CMD.md). Direct node --env-file next dev caused the installed Next dev child to receive a forbidden NODE_OPTIONS flag. API loadEnvFile + unchanged npm run dev was validated through CMD --help with exit0. No.env/dependency change or worker execution.

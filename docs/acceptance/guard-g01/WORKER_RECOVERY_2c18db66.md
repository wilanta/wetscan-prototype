# Current G01 decision: connected Worker/Auth PASS prepare_only; overall PARTIALLY COMPLETE

Verified15November2026: two owner-authenticated enqueue HTTP200 responses produce exactly one durable job; one real worker attempt42.005s completed with fence1, observed lease renewals, running?stopped heartbeat, released lease, matching foundation_prepared audit/coverage and fresh final Auth response. Coverage82/90files,175159bytes, partial; scan failed is the truthful G02-unconfigured result, scanner/sandbox NOT_RUN. Post-run SQL18 preservation passes with matching45e7...1095d hashes, differences[],3retained scans/0active leases; actual full target marker independently verified. Old permit bytes/markers and staging preserved. Runtime budget2enqueue+1launch is consumed; no additional action is authorized. Overall G01 remains PARTIALLY COMPLETE: integrated sandbox, live security-negative and real crash/restart/recovery gates remain open.

Read [final Worker/Auth report](WORKER_AUTH_ACCEPTANCE_2c18db66.md) and [Will handoff](../../agent-handoffs/HANDOFF_WILL_G02_G06.md) for exact evidence, provenance/cleanup limits and remaining work. All conflicting older pending/unknown statements below are retained historical checkpoints.

---

# G01 deadline repair and new exact-job review

G01 remains **PARTIALLY COMPLETE**. The installed deadline repair and local regressions are verified. Connected prepare_only worker acceptance is pending a new explicit approval; scanner, integrated sandbox and crash/restart gates remain open. This checkpoint supersedes historical source-pending and old-job approval instructions.

## Verified candidate

- Cwd and session writable root: C:/laragon/www/wetscan-2/wetscan-guard-g01-s03-candidate.
- Branch: feat/guard-g01-s03-integration; HEAD: 1b28fb88ae65a29902e0f1f314efdce44ed3c643.
- User index SHA256 preserved: 40d77c02186b074dacfd2fe3a6f2816d89a7e59d5f279cbe8be8c75c9c716c4f. Existing staged and unstaged work retained; no commit, push, reset, stash, merge or deploy.
- Exact v3 patch SHA256: f8836520118e7a44ed57e2f562ff29a31e6f776532eb951f863bd9628e2f5326. Before-file hashes matched and git apply --check passed before application. Git wrote CRLF; normalized LF content matches all four proposed after hashes. Actual normalized runtime hashes are in the approval packet; raw and normalized repair hashes are in worker-deadlines-evidence.json.
- An initial git write-tree inspection failed creating a worktree metadata lock. It was replaced with read-only index hashing; no index/master mutation followed.

## Source proof and draft binding

CONTINUE_G01.md carries forward owner-supplied matching actual HTTP200 and protected recovery journal for attempt c5ca98b2-40ec-4561-b60c-fb430eae82dc, approvalDigest 2fcce4dd8c25520093aebeb3a7c0c825706295c6f80ea7383a532710c5cdd84f. Work ran 2026-11-15T15:04:19.593Z to 15:05:00.178Z (40.585s). Repository 839286157 / inkAja/wdu / main / 41861b14dbb3f329fe3b20aed59a008390ef0e2b; tree 6742145fe7c45640fa9b5d1d2666ca9d45966c57; snapshotDigest 1e60da8781c233b4d352e09d305340002b1368331a275f645404bfd2a5ab543e. Retrieved 82 files / 175159 bytes; eligible 90; partial coverage, treeTruncated false; exclusions 1 sensitive + 4 size + 4 binary; cleanup verified. Scanner NOT_RUN, scanAccepted false. This agent did not reread the private journal or repeat source acquisition; preserve all legacy and per-attempt used/result records.

Latest draft C:/laragon/www/wetscan-2/guard-preparation-request1.json was read and its raw SHA256 independently rechecked: fa36fdb116870de6fea0538bdd9fbc9ff6c802691bbaec9c818706145f04472e. Its nonce fd1ddd5a-1b8a-4b02-9be7-6bf4eee71eda independently hashes under the existing job identity algorithm to **2c18db662dcf8fec6052e05d02ed1362802facd839fca81a71a888c37b09ee18**. Actor github-user-145520313; workspace github-user-145520313:testing; project github-839286157; quick / sast metadata. The old 904d08f2...18f96ba permit does not authorize this job. Owner-reported preparation 404 occurs on binding mismatch before pool creation; no successful enqueue/worker is evidenced. Each verification generates a UUID; the event that changed this UI draft is unproven. Do not infer manual duplicate clicks or HMR causality.

## Installed repair

RPC 25s -> 55s, handler 20s -> 60s, request wait 45s -> 90s. Shared immutable timing constants cover the three call sites. Snapshot policy 45s, Auth grant 60s, lease 30s and heartbeat 5s are unchanged. Fresh authorization, expiry, lease fencing, cancellation and owned cleanup remain authoritative.

Seven additive unit assertions preserve all prior tests: observed 40.585s completion with eight heartbeats and latest fenced lease; 60s handler abort/redacted retry; immediate lease-loss abort; RPC observed-duration success and default deadline cancellation; request completion beyond 45s with fresh Auth and persisted audit/coverage; request deadline stop at 90s. Synthetic queue/time/launcher dependencies do not launch a live worker.

## Validation

See worker-deadlines-evidence.json for command results. Typecheck, full lint, 22 focused tests, 798/798 full units (64 files), production build, Guard 7/7, Auth 21/21 and Canvas 17/17 pass with exit0. Canvas first passed all 17 assertions but stalled during restricted-run teardown; only its verified owned fixture process tree was stopped. A separately approved normal rerun with a distinct output directory completed 17/17 and clean teardown; both outcomes are retained. Full units first failed 11 child-process assertions in the restricted sandbox (787/798); a separately approved normal execution passed 798/798. The sandbox failure is retained, not overwritten. A direct offline tsx plan also hit uv_os_get_passwd ENOMEM inside the sandbox; approved normal execution verified unchanged migration plan b63e1e8568babcf8d7811fe0fa735ecbec11ade64df19bdea78deb030a85869d with zero DB operations. Temp overlay evidence is historical and is not installed-runtime or live proof.

## Concrete approval packet

[Current review packet](worker-auth-request.json) and [retained new-job copy](worker-auth-request.job-2c18db66.json) have canonical request SHA256 **7f014b026d5e83634f4a2f07b17ffc9a27aabfe5a50f6c7dd029c7d977a2145a** and 41 actual implementation hashes (UTF-8, LF-normalized). [Previous packet](worker-auth-request.job-904d08f2.json) retains its exact prior bytes and original hash. Existing execution approval files still refer only to their old requests.

The four new purpose templates remain WAITING_USER with blank approvedBy/approvedAt/expiresAt. No private permit, credential, marker or .env was changed. Original approval expiry 2026-11-15T22:35:34.180+07:00 is not extended or reused. The separate source-only permit is excluded from this request.

Approval scope: at most 55 minutes from actual approval; two identical enqueue calls for exactly one durable job, one prepare_only worker, existing purpose credential loader, exact scoped read-only observers, and owned temporary snapshot cleanup. Target localhost:5432/wetscan_s01_test_guardg01, marker wetscan-s01:aa8b15a6-7ed3-4f19-81f0-07d9759ec62f. No migration/schema/role changes, external Sentinel mutation, Docker/scanner, G02, GitHub writes, credential resets or publication.

Only after explicit new approval may the four permits at existing app-configured paths be activated with actual timestamps after preserving old permit bytes and all historical records. Do not touch source-only permit/markers, read secrets, change .env, reverify/reload/reexport the retained UI draft, or enqueue/launch before approval. No implicit rebind: if the UI draft changes, stop and prepare another exact review. Current Auth and branch/SHA checks remain mandatory at operation time.

## Sequence after fresh approval only

1. Activate only the reviewed four purpose permits after preserving old permit bytes and markers. Keep the existing Auth session/store and single app. The agent must not use browser control or export cookies/tokens.
2. Run the exact-job observer before enqueue, confirming zero records. The owner clicks Queue approved preparation once in the retained UI/session. After its successful exact-job response, perform the single identical replay below only when instructed. Both responses must identify job 2c18db66...b09ee18. Stop on errors; no automatic retry. If browser console protections block the replay, do not bypass them; record live replay as untested.
3. Observer must show exactly one matching durable queued job before the owner launches the existing approved preparation action once with action launch and the full exact scanId.
4. Require fresh authenticated backend response AND stored foundation_prepared audit, coverage, exact queue/lease/fence/attempt/heartbeat and owned cleanup evidence. HTTP200/child exit0 alone is insufficient. A G02-unconfigured failed scan is not scanner success; scannerExecution stays NOT_RUN.
5. Run the scoped observer after activity and existing operator SQL18 preservation comparison. Retain every row/artifact/marker; do not erase fixtures. Isolated fixture preservation does not prove unobserved external Sentinel preservation.

Observer offline readiness already returned READY_PENDING_EXECUTION_APPROVAL for this packet with databaseConnections 0, authSessionCreated false, workerStarted false. Live observer command is intentionally not executed here:

```text
node --require ./tests/auth/skip-dotenv.cjs --import tsx tests/guard/g01/worker-observer.acceptance.ts --observe --request-sha=7f014b026d5e83634f4a2f07b17ffc9a27aabfe5a50f6c7dd029c7d977a2145a
```

Requested owner approval must explicitly identify this packet hash and exact job for the scope/window above. Actual approvedAt and expiresAt are recorded only after that response. No runtime action has been authorized by preparing this packet.

Exact second enqueue, for the owner's existing same-origin localhost browser only after fresh approval and a successful first enqueue. It uses the existing normal session without reading or exporting cookies/tokens:

```javascript
void fetch('/api/guard/projects/github-839286157/preparation', {
  method: 'POST', credentials: 'same-origin', cache: 'no-store',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    action: 'enqueue',
    branch: 'main',
    commit: '41861b14dbb3f329fe3b20aed59a008390ef0e2b',
    profile: 'quick',
    engines: ['sast'],
    idempotencyKey: 'fd1ddd5a-1b8a-4b02-9be7-6bf4eee71eda'
  })
}).then(async response => {
  const value = await response.json();
  console.log(JSON.stringify({
    httpStatus: response.status, scanId: value.scanId, status: value.status,
    execution: value.execution, scannerExecution: value.scannerExecution,
    exactJobMatches: value.scanId === '2c18db662dcf8fec6052e05d02ed1362802facd839fca81a71a888c37b09ee18',
    error: /^[a-z_]{1,64}$/.test(value.error ?? '') ? value.error : undefined
  }));
}).catch(() => console.log('enqueue_response_unavailable; stop without retry'));
```

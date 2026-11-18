# S04 historical approval audit and proposed closure

16 November 2026. **OFFLINE HARDENING ONLY; CLOSURE NOT APPLIED.** S04 remains **IMPLEMENTED_PENDING_ACCEPTANCE**. No DEV/TEST connection, live approval, Next.js, worker, ingestion, migration, or Git publication occurred. The preceding live request stopped before execution; this task does not resume it.

## Inventory

Exact parent directory: `C:\Users\sheil\.wetscan-sentinel\s04-h04c-b2-885a62c2-c4f2-4372-8aa2-a743ffe92ebc`.

All nine files have `status=APPROVED`, `actions=[]`, a pre-existing `closedAt`, and expired `h04cB2.expiresAt`. All times below are **2026-11-15 UTC**. Creation is filesystem birth time at millisecond resolution; approvedAt and the other timestamps are separately preserved in the inventory.

| File                      | Metadata phase     | Created UTC  | Expires UTC  | SHA-256 before                                                     |
| ------------------------- | ------------------ | ------------ | ------------ | ------------------------------------------------------------------ |
| `app-approval.json`       | `ui-verify`        | 11:54:53.458 | 12:47:50.926 | `a18bde60017ee2614d80237d264081b53dfbbc2e9e7cbdf6b74ff70b8fdf6676` |
| `diag-w-approval.json`    | `preflight`        | 12:33:33.421 | 12:37:09.977 | `8242073fca7d072f00d818e6e72693cce96b8956a75c55eee72cdcf3cc4d379f` |
| `dup-approval.json`       | `provision-ingest` | 12:28:07.432 | 12:33:30.793 | `0a0b2e5feaa46f2017520dee7999a353c3179f81b0c8b94cb0a9aadc86a3275d` |
| `preflight-approval.json` | `postflight`       | 11:49:24.979 | 12:41:49.292 | `4486be06d986c6f7c3592268d5ed804bc5e72e1fb63423b6c14788095c31bc9d` |
| `provision-approval.json` | `provision-ingest` | 12:22:19.449 | 12:37:19.445 | `de28240ebf10456ac3e57e91261dce1ca843f26fb2a9318bc59925cfa209d24d` |
| `seal1-approval.json`     | `seal-worker`      | 12:23:00.713 | 12:28:00.713 | `a787f42b787c36b3238bf41947012fdf36013754db72a2aa8470a27756f7edbb` |
| `seal2-approval.json`     | `seal-worker`      | 12:28:46.661 | 12:33:46.661 | `5331bce6bdc6f843109b1564174ff4405496304030fee35d5fff1c2ec715978d` |
| `worker1-approval.json`   | `worker-run`       | 12:23:02.052 | 12:28:02.046 | `970558dd404b64b2afea3e443bd71a7113d06769fea522e84412c73bb7b92ea6` |
| `worker2-approval.json`   | `worker-run`       | 12:28:47.787 | 12:33:47.780 | `3972e6d5da36b7c289497ef37afae9c6f1207365d3d7f43c610c01ee34ef0996` |

No file has a `purpose` property: the caller supplies its PostgreSQL role. The app filename suggests APP. The worker files additionally carry `s04RuntimeAcceptance`, detection and incident metadata. Provision/seal/postflight CLI contracts use the migration/controller role for read-only checks. The `diag-w` filename suggests a worker diagnostic, but its actual caller purpose is **NOT_VERIFIED**. Filename hints grant no authority and do not prove an operation occurred.

Full paths, hashes, timestamps, purpose caveats, parser results, exact local references and proposed after hashes are in:

`C:\Users\sheil\.wetscan-sentinel\s04-h04c-b2-approval-review-c032c84db9b04f0c82b1976a90ed3daa\inventory.sanitized.json`

Inventory SHA-256: `c229e32391793f7ddd2044277d277d69eb8ef521ab82de0d7cd499cfd3423b70`.

## Acceptance and cause

The real pure `parseApproval` in `src/platform/config.ts` rejected **all four actions on every file**: runtime, migrate-up, migrate-down and integration-test. It requires the requested action to be present. Worker startup and CLI phase entrypoints obtain database configuration through this gate. Thus these current files cannot authorize a new supported runtime/worker/migration/database entrypoint. No password was read and no connection was made by these parser checks.

Expiry alone is not universal revocation: the generic parser does not enforce `h04cB2.expiresAt`; the phase validator does. `ApprovedPool` receives validated configuration and does not reread an approval on every operation. File closure therefore cannot prove that an already running connection was revoked. No DB-session audit was performed in this offline task; OS process absence is a separate observation.

These are stale lifecycle artifacts with an incomplete historical closure across nine files: actions were cleared and closedAt set, but status remained APPROVED. The original writer/command was not recovered, so its precise failure mechanism is **NOT_VERIFIED**. Current general `cleanup --close-approvals` code would set `CLOSED_AFTER_H04C_B2`, but only for the supplied list; it is not exhaustive discovery or a universal finally handler. It was neither executed nor modified here.

The missed discovery has a confirmed, separate cause: `verifyAllPriorApprovals` recognized only three basenames: web-runtime, controller-runtime and dev-contain-rule approval JSON. None matched these nine. Its status-prefix check did not validate complete approval metadata. Earlier default-off/unit fixtures did not exercise the historical nine-file naming scheme.

## Implemented guard and changed files

- `scripts/Invoke-H04CB2ProvisionAndIngest.ps1`: read-only `approvals-check` before readiness, directory creation, approvals or live gates.
- New `scripts/sentinel-approval-history.ts`: walks the established private root, verifies canonical path boundaries and inspects H04C-B2 metadata under unexpected directory/file names. Approval-named files in H04C-B2 directories must validate, and all nine exact known paths must exist. Original runtime filenames remain covered elsewhere under the verified root.
- Missing/malformed metadata or JSON, duplicate JSON keys, unknown phases/statuses, incorrect target/plan, unreadable files, reparse points, aliases/hardlinks, duplicate references and changes during reading fail closed. NTFS IDs use BigInt to avoid precision collisions. Approval references are never followed outside the root.
- Accepted statuses are exactly CLOSED, CLOSED_H04C_B2_READONLY_PREFLIGHT and CLOSED_AFTER_H04C_B2, with empty actions and valid closedAt. APPROVED is always blocked, including expired/actionless files. Binary archives/secrets/runtime logs are not treated as JSON approval documents; nested evidence and encoded snapshots are not active approvals.
- `scripts/sentinel-provision-owner.ts`: shared discovery for offline checks and live input loading; only the exact two newly gated approvals owned by a live output can be excluded from historical closure checks. All historical approval hashes enter the next phase's preservation manifest. No such live exception was used here.
- New `scripts/sentinel-approval-remediation.ts`: **dry-run only**, with no apply mode. It verifies the nine before hashes, computes a status-only byte delta, and saves original/proposed bytes privately.
- New `tests/sentinel/approval-history.test.ts`; updated `tests/sentinel/provision-runner.test.ts`: historical names, metadata discovery, closure states, malformed/missing/unreadable input, duplicates, outside-boundary links and single-unresolved blocking, plus dry-run integrity and PowerShell early-stop/default-off tests.

Historical ACLs were not rewritten. Read-only discovery verifies directory boundaries; the nine-file directory and new outputs have owner/SYSTEM-only ACLs. Strict ACL checks for new live secrets/outputs are retained. No application authentication, worker, migration or historical artifact was changed. Existing unrelated tracked/untracked work remains intact.

New runner SHA-256: `a5f68ca53da1e74d2a48098846f131727d75663f328d368f98367dee0f9d52bc`.

## Integrity and closure plan

The reference audit searched 612 local text artifacts under the private root and repository docs/scripts/.local, plus the protected H04C-A, original canonical recovery, successful containment and failed containment input trees. It found **no nine-file hash reference in existing pinned recovery/containment inputs**. Their canonical checksums and pinned files need no change.

The previous immutable blocker report does record all nine before hashes, as do the new inventory and preservation snapshots. Keep those reports unchanged as before-state evidence. Closing a source file changes its current hash; never claim it still matches the old record. Resolve this with a new approved before-to-after receipt and exact byte backups, not by editing old reports, replacing their expected hashes or exempting APPROVED files. External archives and prior chat transcripts were not searched. Any newly found active immutable verifier pin is an additional stop condition.

Proposed changes: **exactly nine replacements of the status value APPROVED with CLOSED; no other field or formatting changes**. Preserve existing empty actions and each original closedAt, approvedAt, expiry, phase, target, actor, plan and worker metadata. Record actual remediation time in a separate receipt. No wildcard, deletion, reset, reactivation, action widening or runtime operation.

Private preview: `closure-preview.private.json` in the inventory directory, SHA-256 `6d8e4538b56c009f6fb47e2dce7b89c409f4df11374bb9b54cf70b73b41d81d0`. It holds exact original/proposed byte encodings and per-file hashes. Do not print it. Proposed after hashes are also in the sanitized inventory.

After separate owner authorization:

1. Revalidate inventory/preview hashes, all nine original hashes, expired APPROVED/actions-empty metadata, original closedAt, canonical paths, distinct identities and owner/SYSTEM ACLs. Require no worker/Next process. Stop on any drift.
2. Create a fresh protected directory outside repo/OneDrive with exclusive-create backups, intent journal and receipt. Snapshot every file in the protected evidence roots and entire original nine-file directory, including non-approval files. Preserve byte backups and the immutable audit/preview records.
3. Obtain exclusive access and revalidate all nine hashes. Prepare only the already previewed buffers. Use a reviewed atomic per-file replacement on the same volume, preserving target ACLs, with exclusive temporary files in the new private output. Journal before each replacement and fsync its verified after hash. Nine files are not one atomic transaction: stop on uncertain replacement, preserve partial evidence, and never restore APPROVED over a CLOSED file or automatically retry.
4. Read back every file; require previewed after hashes, CLOSED/actions-empty state and unchanged non-status fields/ACL. Require every other historical file unchanged and no additional artifacts in old directories. Preserve all old reports, backups, canonical checksums and containment pins.
5. Write a new transition receipt with authorization, per-file before/after and backup hashes, original closedAt, actual remediation timestamps and outcome. A verifier must reconstruct both versions and prove the status-only change. If a current immutable verifier unexpectedly pins old bytes, stop for an approved versioned transition verifier rather than rewriting or bypassing it.
6. Rerun read-only discovery and default-off diagnostics only. All 16 known H04C-B2 approvals must satisfy closure. Do not enter ExecuteLive, create approvals, connect PostgreSQL, start servers/workers or provision anything under a closure grant.

No apply operation has been implemented or executed; the exact proposed bytes are available for review before approval.

## Requested separate authorization

Authorize **one offline closure operation only** for the nine exact paths and before hashes in this inventory (inventory SHA `c229e32391793f7ddd2044277d277d69eb8ef521ab82de0d7cd499cfd3423b70`; preview SHA `6d8e4538b56c009f6fb47e2dce7b89c409f4df11374bb9b54cf70b73b41d81d0`). Permit only the previewed status-value replacements to CLOSED, preserving empty actions, original closedAt, all other bytes/metadata/ACLs and historical artifacts. Permit fresh protected backups, a durable journal, transition receipt and offline verification. Stop on drift or uncertain replacement; no reactivation or automatic retry. Exclude provision-and-ingest, live approvals, PostgreSQL, Next.js, workers, migrations, later phases and Git publication. Task C explicitly requires this separate owner approval; closure stays unapplied pending that approval.

## Verification boundary

| Check                                               | Result                                          |
| --------------------------------------------------- | ----------------------------------------------- |
| Typecheck / lint                                    | PASS / PASS                                     |
| Focused regression tests                            | 153/153 PASS, 5 files                           |
| Full Vitest suite                                   | 898/898 PASS, 58 files                          |
| Actual default-off runner                           | Expected fail-closed: prior_approval_not_closed |
| Offline acceptance plan                             | PASS, zero connections, unchanged plan hash     |
| PowerShell parser / Git whitespace                  | Zero errors / PASS                              |
| Historical files compared                           | 35 unchanged, including all nine approvals      |
| Port 3000 / conflicting Next.js or worker processes | 0 / 0                                           |

The actual default-off runner must reject these unchanged nine approvals with `prior_approval_not_closed`; OFFLINE_READY would be incorrect. Temporary fixtures exercise the all-CLOSED success path. Test/check results and unchanged-input hashes are recorded in `verification.sanitized.json` in the private inventory directory. S04 remains **IMPLEMENTED_PENDING_ACCEPTANCE**.

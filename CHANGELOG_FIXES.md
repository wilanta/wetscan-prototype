# CHANGELOG_FIXES

### Fix #5 — S05 controlled response, independent verification and TTL rollback (DEV accepted on isolated PostgreSQL 2026-11-19; not deployed)

| Field | Detail |
|---|---|
| Tanggal | 2026-11-19 |
| File | `migrations/sentinel/0005_response.*`, `src/features/sentinel/response/**`, `worker/sentinel/{response-handlers,runtime,main}.ts`, `scripts/sentinel-response-fixture.ts`, `server/response-http.ts` + `/responses` route, `components/live-responses.tsx` (+1 mount in `views/sentinel.tsx`), `incidents/retention.ts` (pin), `platform/migrations.ts` (0005 down branch, `migrationPlan(through?)`), `contracts.ts` (optional `ResponsePort.inspect`), docs |
| Masalah | S04 had only demo/contract responses; no consented, reversible, independently verified response existed. |
| Akar | `0004` CHECKs/grants (timeline event types, `verification_status='not_requested'`) make the incident record unusable for response history; `queue.ts` isolation guard is telemetry-only. |
| Fix | Separate additive tables (targets / actions / append-only audit), revision-fenced `ResponseStore`, worker jobs apply/verify/expire/reconcile, loopback adapter, credential-less verifier with pre-apply baseline, fixture-side self-expiry, fail-closed activation block, Responses API + UI, retention pin. |
| Verifikasi | 1482/1482 unit (82 files); 23/23 PostgreSQL acceptance on a throwaway container (`postgres:17.12`, random DB dropped afterwards) incl. real `runSentinelWorker` loop, RLS isolation, append-only audit, 0005 down refusal/reversal; S05 browser 3/3 and S04 incident browser 3/3; typecheck, eslint, `next build` clean. `applied` and `verified` stay distinct (A2/A3); outage/collateral/unclean-baseline never `verified` (A4); TTL, manual rollback, crash adoption, orphan cleanup restore the fixture (A5); stale revision/duplicate/cross-project/demo-mode denied (A6); Orderly Demo makes 0 live calls (A7). |
| Pelajaran | Two real defects were caught only by PostgreSQL tests and fixed before merge: (1) the `expire` job called the target DELETE *before* checking the TTL was due, so an early job would drop enforcement while the DB still said active; (2) reconcile job fingerprint included `now`, so the loop's `ensureReconcile` and the handler's next-bucket job collided (`idempotency_conflict`) and aborted the worker pass. Also: adding a migration changes the plan hash, so S04 review tests must pin the 0001-0004 prefix and worker approvals must be re-issued. |
| Log Keyword | `sentinel.response.apply`, `response_audit`, `approval_invalid`, `not_due_yet`, `reconcile_cleanup`, `response_not_configured`, `H03-RESPONSE` |
| Deploy | NOT deployed. `live tested` against a real application: NOT_RUN. Production/WAF/CDN/cloud: not integrated. Worker use needs a new owner DB approval (plan hash changed) with a `response` block. Retention: response records pin their incident (local-test policy; production archive policy documented in `docs/SENTINEL_S05_ARCHITECTURE.md`). |

### Fix #4 — S04 acceptance completed in one pass (✅ LIVE 2026-11-18 20:40Z; owner accepted)

| Field | Detail |
|---|---|
| Tanggal | 2026-11-18 |
| File | `scripts/sentinel-acceptance-run.ts` (new one-pass driver), `scripts/sentinel-dev-acceptance.ts`, `tests/sentinel/dev-acceptance-safety.ts` (+ tests) |
| Masalah | Fix #3 left second-event coalescing, worker pass 2, negative PostgreSQL matrix and an end-to-end worker-run unproven. |
| Akar | (1) Sealed approvals and the 10-min correlation bucket force the whole chain into ~10 min: needs a single driver. (2) `worker-run` called `captureReadOnlyDevState` with the worker role (no SELECT on telemetry_credentials) -> `permission denied`. (3) Negative matrix expected worker DELETE on incident tables to fail 42501, but migration 0004 grants it on purpose (retention; MIGRATION_REVIEW line 87). (4) Postflight admitted only one cycle's jobs; earlier final jobs raised scope_denied. |
| Fix | One-pass driver (new source/credential/rule via owner-session API, bucket-aligned event 1, seal/worker x2, verify, negative, ui, cleanup, postflight); `captureWorkerSafeState`; worker UPDATE denials only (DELETE left to retention-pin rollback check); earlier cycles' jobs pinned as prior attempts in postflight; `isKnownDegradedWorkerHealth` extracted + tested. |
| Verifikasi | Cycle `5f4d9831…`: worker1 + worker2 PASS (health degraded only by the preserved failed job), ingest-duplicate PASS, verify-incidents PASS (incident c56df69f…, 1 alert, 2 evidence, 5 timeline, investigating rev 4), negative-matrix PASS (RLS app/worker, app least privilege, worker append-only UPDATE, fencing, rolled-back retention pins), ui-verify PASS (demo 0 API calls, canaries redacted, UI close/reopen), cleanup PASS (0 enabled sources, 0 active credentials, all rules DISABLED), postflight PASS (re-run after the postflight fix), 68 approvals CLOSED, no processes/port. 275 targeted tests pass. |
| Pelajaran | Two failed cycles left extra disabled sources/rules and completed jobs (cycle A job c047aa72 was drained by a dedicated seal+worker). Dev DB now has 5 extra disabled synthetic sources/rules and 5 extra completed jobs. Worker role DELETE on incident tables is by design. |
| Log Keyword | s04-provision-rebind, permission denied telemetry_credentials, unexpected_sql_error_worker_delete_incident_timeline:23503, scope_denied |
| Deploy | Committed on feat/sentinel-s04-incidents; nothing deployed. |

### Fix #3 — Acceptance harness: worker-run health/worker-id checks could never pass (PARTIAL acceptance)

| Field | Detail |
|---|---|
| Tanggal | 2026-11-18 |
| File | `scripts/sentinel-dev-acceptance.ts` (runSealedWorker) |
| Masalah | `worker-run` reported `worker_acceptance_timeout_or_health_failed` although the sealed job completed and the worker stopped cleanly. |
| Akar | (1) `platformHealth` returns 503/degraded while ANY failed job exists; the preserved prior-attempt job 0610c6d6 (failed, 5 attempts) makes health permanently degraded. (2) harness checked a locally generated worker id while `worker/sentinel/main.ts` uses `randomUUID()`. |
| Fix | Accept 503 only if status=degraded, worker=running, expired=0, failed == preserved failed count; derive the new worker id from the single new heartbeat row. |
| Verifikasi | After fix: ui-verify PASS, postflight PASS (workerIds stopped). worker-run itself was NOT re-run end-to-end with the fix (worker 1 ran before the fix; bookkeeping adopted by hand). 16 harness tests pass. |
| Pelajaran | Whole acceptance chain must run within ~10 min of the provisioning ingest (sealed approvals expire at cutoff+10 min; ingest-duplicate event must stay in the first event's window). |
| Log Keyword | s04-provision-rebind, worker_acceptance_timeout_or_health_failed, ingest2_failed:400 |
| Deploy | Not committed. |

### Fix #2 — Provision-and-ingest live attempt: deadline_expired mid-execute (✅ resolved 2026-11-18 via resume mode, Fix #2b)

| Field | Detail |
|---|---|
| Tanggal | 2026-11-18 |
| File | `scripts/sentinel-provision-package-check.ts`, `scripts/sentinel-provision-enforcement.ts` (timeouts), manifest v4 |
| Masalah | Live run NOT_VERIFIED at `execute`, `deadline_expired`; source+credential+rule created and rule enabled, event ingest never ran; failure audit not verified. |
| Akar | Checker spawns ~42 powershell ACL probes (~0.7 s each, 35 s CPU in spawnSync) per invocation, run 6-7x per live run, plus Next dev API calls of 30-70 s on a machine at ~87% CPU; 10-min grant exhausted. Earlier pre-DB failures: ACL probe timeout 5 s, boundary check timeout 20 s (both flaky/too short). |
| Fix | Timeouts raised (30 s / 120 s), per-process ACL memo, manifest v4. These did NOT prevent the deadline. |
| Verifikasi | Journal acks: create-source 201, create-rule 201, enable-rule 200; no event. DB not audited (PENDING). |
| Pelajaran | Do not attempt live runs on a loaded machine; the 10-min window needs ~<=25 s per checker call. Don't retry a consumed grant. |
| Log Keyword | s04-provision-rebind, deadline_expired, private_acl |
| Deploy | Not committed. |

**Follow-up (Fix #2b, VERIFIED 2026-11-18):** resume run `s04-h04c-b2-provision-package-9ac15f9b…` PASS: 10 inserts, 1 queued job, ingest 202 / replay 200, 0 cleanup errors. Detail of the path: resume mode implemented + tested offline (149 tests); 2 live resume attempts stopped in preflight with 0 DB connections: parent-pin allow-list (fixed) and expired candidate session/token (8 h lifetime, expired ~18:36Z). Needs fresh OAuth login before the resume run; see handoffs/s04-provision-rebind.md.

### Fix #1 — Owner-auth host: Next.js dev startup fetches aborted OAuth window (`provider_fetch / other`)

| Field | Detail |
|---|---|
| Tanggal | 2026-11-18 |
| File | `scripts/sentinel-owner-reauth-app.mjs`, `tests/sentinel/owner-auth-host-fetch.test.ts` |
| Masalah | Auth host died before READY: `provider_fetch / other`, 1 blocked op, 0 OAuth starts. |
| Akar | Next 16.4.6 `prepare()` makes 3 optional fetches (npm advisories POST, npm dist-tags GET, telemetry POST w/ retries). Old code exempted only the dist-tags URL; advisories fires first and tripped `AuthWindowPolicy.provider()`. Confirmed by offline repro with logged stubbed fetch. |
| Fix | Before `server.listen` no OAuth request can exist, so every fetch in that phase gets a local 503 (no network, window not invalidated); `preparingNext` flips off right after listen; `NEXT_TELEMETRY_DISABLED=1`. After listen only the reviewed exchange/identity calls pass. |
| Verifikasi | Real Next startup smoke: `/login` 200, 0 failures over 15 s, 0 network touches, 2 offline answers. 14 host-fetch tests + 96 auth tests pass. LIVE: real OAuth window run `s04-owner-reauth-ec169622…` -> CALLBACK_COMPLETE (1 start/1 callback/1 exchange/1 identity, 0 blocked), `PASS_LOCAL_AUTH_RECOVERY`, 476 token min, 0 DB connections. |
| Pelajaran | Identify the exact blocked operation before exempting; prefer a phase rule (pre-listen) over per-URL exceptions. Runner stages are silent ~90 s (pin verification) — launch via `supervise-owner-login.ps1 -AutoAnswer` in the package dir so prompts are relayed and failures are visible. Owner typing in the console during the relay corrupts the prompt (`AUTH_AUTH_TABS_CLOSED`). |
| Log Keyword | provider_fetch, auth_window_operation_denied, NEXT_TELEMETRY_DISABLED, owner-auth-host-fetch |
| Deploy | DEV only; not committed. |

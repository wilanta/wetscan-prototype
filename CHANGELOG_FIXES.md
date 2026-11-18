# CHANGELOG_FIXES

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

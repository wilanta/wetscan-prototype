# S04 provision-and-ingest: rebind package to the NEW candidate
Status: DITUNDA · Service: sentinel S04 · Diperbarui: 2026-11-18 22:45

## Sedang dikerjakan
Auth recovery is DONE (Fix #1). Provision-and-ingest cannot start: the provision package policy/validators are bound to the OLD run.

## Status terakhir
- New candidate: `C:\Users\sheil\.wetscan-sentinel\s04-owner-reauth-ec169622a7f6449bb887e259c7541820\candidate\owner-session.cookie` (+ .meta.json); new session `session-3fee03df…bin`; verify = PASS_LOCAL_SESSION_WITH_APPROVED_ARCHIVE_DISPOSITION, 476 min token (as of 2026-11-18 ~17:37 local; needs >=40 at provision entry).
- Auth pkg: `s04-login-flow-repair-41e311106792f5725e9151aef0351bbe` (manifest 0004c417…, consumed grants).
- Docker Desktop engine was NOT running (npipe missing) at 2026-11-18 ~17:45; PG clone `wetscan-sentinel-s04-postgres-792151c53653` untouched.

## Keputusan penting
- `scripts/sentinel-provision-package-policy.ts` pins run=`s04-owner-login-0080a5fc…`, candidateFile, baselineSha256 4636a00c…, descriptor (candidateSha256 5ba22b80…). `sentinel-owner-session-exception.ts` requires `policy.archiveFile == run/archive/auth-store/<oldName>` and design.baselineSha256 == baseline hash. The new run's before-state/archive differ, so the checker will reject the new candidate as is.
- Needs an owner-reviewed rebind (new descriptor/policy/design binding for run ec169622…, same single archived record f3c7b6ed…, archive bytes sha 44af3d9e…), then new provision manifest + fresh 10-min owner grant file (template in `s04-provision-package-5972…/future-owner-grant.template.txt`), then `Invoke-S04ProvisionPackage.ps1 -ExecuteLive`.

## Rebind SELESAI (offline, owner-approved 2026-11-18)
- policy.ts: recovery{baseline ec169622…, sha 1a7a0a38…}, new descriptor `s04-recovery-descriptor-a24567a6…` (sha 7b671fc5…), candidate = ec169622… run. exception.ts: optional `recovery` chain; package.ts: 7 auth files, replacement list; approval-history.ts: skip >4MiB `*-auth-input-pins*.private.json`.
- Manifest: `s04-provision-package-a91b2f02…/candidate-package-v2.private.json` sha df655a55…; `Invoke-S04ProvisionPackage.ps1` offline = OFFLINE_READY, 155 targeted tests pass.

## LIVE ATTEMPT 2026-11-18 (grant f8bb1578…, output s04-h04c-b2-provision-package-f8bb15786407cb7f343acf8142d2d7ba) = NOT_VERIFIED, PARTIAL WRITES
- Reached execute; deadline_expired at 13:54:56Z (grant 13:44:56Z..13:54:56Z) before event ingest. Machine CPU ~87% => each Next dev API call took 30-70 s.
- Journal (acked): source c129dc20-52ea-449d-bf31-15b22533e184 + credential 7f79c5ff-8631-47f4-b343-239d65d71c44 (201), rule 781c44f1-9011-4324-a34c-0085270d576d created (201) and enable-rule response 200 (13:54:30Z, no ack line). NO ingest event/batch/job attempted.
- Cleanup: approvals closed, port 3000 free, no node/next left. NOT verified: failure audit (audit-failure-end), candidate persistence, watchdog cleanup. DB state therefore UNAUDITED; expected new rows = source, credential, rule (+ revision/audit rows).
- Grant consumed. DO NOT retry/auto-recover. Needs owner decision: audit-failure-end/recover path vs. accept partial and ingest only the missing event.
- Earlier same day: 3 pre-DB failures (grant/ACL probe timeouts 5 s; boundary check 20 s) -> 0 DB connections.
- UNREVIEWED code edits to make this faster: package-check.ts ACL probe timeout 5s->30s + per-process memo; enforcement.ts boundary timeout 20s->120s; manifest v4 sha d60d4884… Machine load (ChatGPT/Chrome) is the real cause; close them before any retry.
- 2026-11-19 READ-ONLY audit (docker exec psql, no writes): source c129dc20 (enabled, rev 1), credential 7f79c5ff (not revoked), rule 781c44f1 current_version 2 (versions 1,2), 0 events for new source; totals unchanged otherwise (sources 4, credentials 5, rules 4, events 16, jobs 16). => state = provision complete up to rule-enable; ONLY ingest + replay missing. Credential secret still in output dir h04c-b2-ingest-credential.secret.
- Blocker: runner/audit-start/execute all require the clean pre-state (verifyProvisionStart) and a fresh output dir, so the sealed machinery cannot resume. A resume mode (skip creates, validate delta with verifyProvisionDelta partial, ingest 202 + replay 200) needs changes in Invoke-S04ProvisionPackage.ps1, sentinel-provision-owner.ts, sentinel-provision-safety.ts + tests + new manifest/grant => owner design decision.

## RESUME MODE built (owner-approved "resume mode"), blocked by EXPIRED GitHub token
- Code: `executeProvision(d, resume?)` (createResources/adoptResources split) in sentinel-provision-safety.ts; `loadResume` + resume branches in audit-start/execute in sentinel-provision-owner.ts (only from the deadline-stopped f8bb1578… dir; tolerates only an uncertain `invalid-bearer`); `--resume-from` allowed in enforcement.ts; `-ResumeFrom` in Invoke-S04ProvisionPackage.ps1; replacements list extended (package.ts). New test in provision-hardening.test.ts; 149 provision tests pass. Manifest v6 sha b70817f2… ; wrapper script `scratchpad/rp3.ps1` (builds 10-min grant with notBefore +40 s, passes -ResumeFrom).
- Live resume attempts 1-2: both failed in PREFLIGHT, 0 DB connections: (1) parent_pin_dropped_or_changed (fixed), (2) candidate_identity: candidate session/token expired (recordedAt 10:36Z, 8 h token, now 19:30Z). Grants consumed/deleted.
- NEXT: fresh owner OAuth (manual GitHub MFA + hidden cookie paste) -> rebind policy/descriptor/manifest to the new run (recovery chain now has a 2nd login: previous candidate session 3fee03df… becomes an extra auth record to account for) -> resume run (rp3.ps1) must start within ~7 h of login. DB state unchanged since audit 2026-11-19 (source/credential/rule rev 2, 0 events).

## PROVISION-AND-INGEST DONE (2026-11-18 ~19:50Z) = PASS
- 2nd owner login run s04-owner-reauth-3b5201e0… (PASS_LOCAL_AUTH_RECOVERY); policy/descriptor(63553591…)/manifest v7 (4f5d8118…) rebound; exception.ts `recovery.knownRecords` added for the first candidate session 3fee03df….
- Resume run output s04-h04c-b2-provision-package-9ac15f9b4af75d161047cc02a6418e75: PASS, 10 inserts total vs original start, job b798cae5-e891-48ed-a80a-aaf0b8056f3b queued (0 attempts), ingest 202 + replay 200 acked, cleanup errors none, approvals closed.
- Active handoff: source c129dc20 enabled, credential 7f79c5ff active, rule 781c44f1 rev 2 ENABLED. Credential file in the 9ac15f9b… dir.
- NEXT (Task Three): separate worker grant -> scripts/sentinel-dev-acceptance.ts stages (worker seal/exec, S03 alert, S04 incident/evidence/timeline, status transitions, authenticated API/UI, negatives, cleanup/containment). Note acceptance script line ~484 expects a clean (disabled/no credential) source start: verify before running.

## WORKER/INCIDENT ACCEPTANCE 2026-11-18 (partial) — S04 STILL IMPLEMENTED_PENDING_ACCEPTANCE
- PASS: seal1; worker pass 1 processed job b798cae5 (completed, 1 attempt; new alert 562a3f9c, incident eba0a811-11ef-5d60-a0b1-f390d0a8e074; timeline alert_created, incident_opened); API investigate/close/reopen + 400 secret-note + 409 stale revision all worked (rev 4, investigating, timeline 5); UI verify PASS (demo 0 API calls, redaction, close/reopen via UI); cleanup (credential revoked, source disabled rev 3, rule disabled); postflight PASS (25 tables, 0 leases, 0 orphans, 8 historical heartbeats, backup intact); all 41 approvals CLOSED.
- NOT DONE: ingest-duplicate (400: harness backdates event2 into event1's 10-min window, already past), worker pass 2, evidence>=2 coalescing check in verify-incidents, negative PostgreSQL matrix (needs a sealed worker approval valid <=10 min after job creation; expired). Both need a NEW provisioning cycle with the whole acceptance sequence run inside ~10 min of ingest.
- Harness fixes (sentinel-dev-acceptance.ts runSealedWorker): accept degraded 503 health only when queue.failed == preserved historical failed jobs; identify the worker's random heartbeat id as the single new row (was a never-matching id). Unreviewed. Context bookkeeping edited by hand: workerIds=[8a2b0b12-…], incidentId/alertIds set.
- Driver: scratchpad accept.mts (not in repo). Nothing committed.

## Langkah berikutnya (sisa)
1. Owner decision: approve rebinding the archive-exception descriptor to run ec169622… (do NOT edit old descriptor/receipts; create new ones).
2. Repoint policy.ts + descriptor; targeted tests only (tests/sentinel/provision-package-*.test.ts, owner-session-exception).
3. Start Docker Desktop + PG clone container (bounded-start procedure in s04-postgres-bounded-start-*).
4. New manifest (adapt `reconcile-package-manifest.mjs`), fresh grant, run provision-and-ingest, then worker grant + `sentinel-dev-acceptance.ts`.

## Jangan lakukan
- Do not reuse consumed grants; do not restore archived session f3c7b6ed…; do not run a worker during provisioning; no standalone Phase 0 audit.

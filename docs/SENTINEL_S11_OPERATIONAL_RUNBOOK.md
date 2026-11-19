# Sentinel operational runbook (S11)

Status: **DEV/STAGING procedures verified on the owner development machine; PRODUCTION procedures are DOCUMENTED, NOT_RUN.**
Everything here reflects the repository at the S11 release candidate. Secret *values* never appear in this document;
only variable names, file roles and public identifiers. "Verified" means executed during S11 (see
[evidence register](SENTINEL_S11_EVIDENCE_REGISTER.md)); everything else is a procedure to follow, not a claim.

## 1. Supported runtime

| Component | Version / constraint | Source of truth |
| --- | --- | --- |
| Node.js | 22.x (CI pins 22.20.0) | `.github/workflows/ci.yml` |
| PostgreSQL | 17.12 (Debian bookworm image, digest-pinned in `SENTINEL_POSTGRES_IMAGE`) | `infra/sentinel/compose.yaml` |
| Next.js / React | 16.4.6 / 19.3.1, modular monolith + separate worker processes | `package.json` |
| OS | Windows 11 (dev), Linux (CI build/PG/browser), Windows runner for the unit suite | CI |

Processes (each its own OS process and credential domain):

| Process | Start | DB role | Health | Default port |
| --- | --- | --- | --- | --- |
| Web app | `npm run build && npm start` | `wetscan_app` | `/login` 200 | 3000 |
| Sentinel worker | `npm run sentinel:worker` (`--once` for one cycle) | `wetscan_sentinel_worker` | `GET 127.0.0.1:<SENTINEL_WORKER_HEALTH_PORT>` | 3112 |
| Notifier | `npm run sentinel:notifier` | `wetscan_sentinel_notifier` | `GET 127.0.0.1:<SENTINEL_NOTIFIER_HEALTH_PORT>` | 3113 |
| Migrator (manual only) | `npm run sentinel:db -- up --approve-plan=<sha>` | `wetscan_migrator` | n/a | n/a |

Nothing migrates, activates or sends automatically. Every capability below is **off until an approval block AND an
environment flag both exist**.

## 2. Installation and configuration (development / staging)

1. **PostgreSQL**: `infra/sentinel/compose.yaml` (loopback port, `log_statement=none`, 1 GB / 2 CPU / 128 pids). Create a NEW
   external volume per environment. Bootstrap superuser is `wetscan_bootstrap`; it is used only for provisioning/backup,
   never by an application process.
2. **Database identity**: `COMMENT ON DATABASE <db> IS 'wetscan-s01:<uuid>'`. The approval verifier refuses any target whose host,
   port, database name (`wetscan_dev|wetscan_s01_test…`) or marker differs from the approval.
3. **Roles** (review, then run manually as bootstrap): `infra/sentinel/provision-roles.sql` (migrator/app/worker) and
   `infra/sentinel/provision-roles-s06.sql` (notifier). Each role has its own password file (>= 20 chars, one line).
   **Gap found in S11:** the reviewed SQL does not grant database `CONNECT`; on a database where `CONNECT` was revoked from
   `PUBLIC` the notifier cannot log in. Run once per environment:
   `GRANT CONNECT ON DATABASE <db> TO wetscan_sentinel_notifier;` The SQL files are hashed into the migration plan, so the
   fix is documentation, not an edit of those files.
4. **Environment variable names** (values live in ignored files; never commit):
   - App: `APP_URL`, `AUTH_SECRET`, `AUTH_DATA_DIR` (absolute, outside the repo), `GITHUB_APP_ID`, `GITHUB_APP_SLUG`,
     `GITHUB_APP_CLIENT_ID`, `GITHUB_APP_CLIENT_SECRET`, `GITHUB_APP_PRIVATE_KEY`.
   - Database: `SENTINEL_DB_HOST`, `SENTINEL_DB_PORT`, `SENTINEL_DB_NAME`, `SENTINEL_DB_MARKER`, `SENTINEL_DB_APPROVAL_FILE`,
     `SENTINEL_DB_{APP,WORKER,MIGRATION,NOTIFIER,BOOTSTRAP}_PASSWORD_FILE`.
   - Worker tuning: `SENTINEL_WORKER_CONCURRENCY` (1-2), `SENTINEL_WORKER_POLL_MS`, `SENTINEL_JOB_LEASE_MS`,
     `SENTINEL_WORKER_HEARTBEAT_MS`, `SENTINEL_JOB_TIMEOUT_MS`, `SENTINEL_WORKER_HEALTH_PORT`, `SENTINEL_PLATFORM_RETENTION_DAYS`.
   - Activation flags (all default off): `SENTINEL_DETECTION_ENABLED`, `SENTINEL_INCIDENTS_ENABLED`,
     `SENTINEL_RESPONSE_ENABLED`, `SENTINEL_EXTERNAL_INTEL_ENABLED`, `SENTINEL_NOTIFIER_ENABLED`, `SENTINEL_ACCEPTANCE_ISOLATION`.
   - Providers (notifier process only): `TELEGRAM_BOT_TOKEN_FILE`, `RESEND_API_KEY_FILE`, `NOTIFICATION_FROM_EMAIL`,
     `SENTINEL_RESPONSE_BASE_URL`, `SENTINEL_RESPONSE_TOKEN`, `SENTINEL_FEED_GHSA_TOKEN_FILE`.
5. **Approval file** (`infra/sentinel/approval.example.json`): JSON with `status: "APPROVED"`, `approvedBy` (who and where the
   decision was recorded), exact `target`, `actions` (`runtime`, `migrate_up`, `migrate_down`, `integration_test`) and the exact
   `migrationPlanSha256`. Activation blocks (`detection`, `incidents`, `response`, `externalIntel`, `notifications`) are added
   per project only when the owner decides. A migration approval and a runtime approval are **separate files**.
   **Authorship convention:** an approval file that an agent wrote must say so (`approvedBy` = "Recorded by Claude Code ... under
   the owner's <package> authorization (<date>)", plus `authoredBy` / `authorizedBy`); it must never read as the owner's own
   signature. When correcting an existing file keep the old text in `previousApprovedBy` and record `provenanceCorrectedAt`;
   the verifier ignores these extra fields, so the plan hash and the approval stay valid.
6. **Project binding**: projects come from the existing Auth/Canvas GitHub identity (`github-<repoId>`). Telemetry sources are
   created in the UI/API after the owner confirms the application is theirs; sources, credentials and projects can each be
   disabled or revoked independently.

## 3. Operations

### 3.1 Health and status
- `npm run sentinel:health` (worker role): `schema` is the **latest applied ledger version** and `schemaStatus` is
  `current | behind | checksum_mismatch | ahead_compatible | ahead_unverified | unverified`. The worker health endpoint returns
  503 for everything except `current`, `unverified` (caller gave no plan) and `ahead_compatible` (S11 fix; before it the field
  was hard-coded to `0001_foundation`). Overlapping versions are compared FIRST: a checksum difference is `checksum_mismatch`
  and a required migration missing from the database is `behind`, whatever else the ledger contains.
- **Database newer than the running build (rollback / staggered rollout).** The extra versions are `ahead_compatible` only when
  ALL hold: every migration this build knows is present with an identical checksum; the extras are a gap-free, well-formed
  suffix that starts right after this build's last migration; and the operator has attested them by setting
  `SENTINEL_SCHEMA_AHEAD_ACCEPTED_THROUGH=<highest accepted version>` for the worker (and `npm run sentinel:health`). The worker
  then stays `ready` and the response carries `warnings: ["schema_ahead_of_code:<versions>"]`. Without the attestation, or with
  a gap / out-of-order / malformed extra, the state is `ahead_unverified` and the worker is `degraded` (503): the code cannot
  know a migration it has never seen is additive, so a human must say so. Never set the variable for a migration you have not
  reviewed as additive and backward compatible; remove it once the build catches up.
- `status: degraded` is truthful when no worker heartbeat in 30 s, expired leases or failed jobs exist. On the development
  database it currently reports 8 queued + 1 failed historical `sentinel.telemetry.accepted` jobs from S02-S04 acceptance
  (about 4 days old) because detection is not activated; they are preserved, not purged.
- `telemetry: "not_implemented"` in that JSON is a stale S01 label. Telemetry IS implemented (S02); do not rely on the string.
- `npm run sentinel:db -- status` (needs a `runtime` approval): prints the ledger.

### 3.2 Worker lifecycle
Start with an approval that has **no** activation blocks to prove compatibility: it heartbeats, claims nothing it is not
activated for, and `--once` exits 0 (`started -> shutdown_requested(completed) -> stopped`). Verified 2026-11-19 on
`wetscan_dev` at `0009` with the job table byte-identical before and after. Stop with SIGINT/SIGTERM (or IPC disconnect);
leases of a killed worker expire after `SENTINEL_JOB_LEASE_MS` and are re-claimed with a fencing token, so a stale holder
cannot complete a job. Poison jobs end in `failed`/dead-letter after `max_attempts`; they are never silently dropped.

### 3.3 Queue, outbox and notifications
- Provider acceptance is **not** delivery. `accepted` means the provider API accepted the request; `unknown` marks an ambiguous
  end and is never shown as `failed` or `delivered`. Delivery is at-least-once: a crash after the durable `attempted` mark
  re-sends once (documented duplicate risk).
- Quiet hours, severity floor, throttle, consent and a provider-accepted test to the *current* destination are checked at
  enqueue **and** at send time. Revoking a token or destination stops sends immediately.

### 3.4 Backups and restore rehearsal (verified 2026-11-19)
```
docker exec <pg-container> pg_dump -U wetscan_bootstrap -d <db> -Fc -f /tmp/pre.dump
docker cp <pg-container>:/tmp/pre.dump <private-dir>\pre.dump        # Windows path form; verify sha256 on both sides
docker exec <rehearsal-container> pg_restore -U postgres -d <fresh-db> /tmp/rehearsal.dump
```
Compare per-table `count(*)` and `md5(string_agg(x::text,'' order by x::text))` between source and restored copy. The S11
rehearsal restored all 25 pre-migration tables identically. Keep backups in a private directory outside the repo and OneDrive
sync scope when possible; the dump contains tenant data and credential hashes. On Git Bash set `MSYS_NO_PATHCONV=1` for every
`docker exec`/`cp` that names a container path (it silently rewrites `/tmp/...`).

### 3.5 Migrations
- Order: backup -> `npm run sentinel:db -- plan` (review hash) -> write a **new** approval (never edit a historical one) ->
  `up --approve-plan=<sha>` -> `status` -> health -> app/worker restart. Migrations are additive and idempotent (second `up`
  is a no-op, verified). `down` refuses once data exists; data rollback means **restore from the backup**, never `down`.
- Never run the destructive commands listed in the global safety policy without fresh, explicit owner approval.

### 3.6 Retention, exports, rotation
- Platform retention: `SENTINEL_PLATFORM_RETENTION_DAYS` (1-90) for jobs/outbox/heartbeats; incidents are pinned while a case
  or response exists. Audit/timeline tables are append-only to every runtime role.
- Export: authorized `GET /api/sentinel/projects/<id>/report?days=1|7|30&format=json|csv&download=1` (no-store, nosniff).
- Telemetry credential rotation/revocation: `POST /api/sentinel/projects/<id>/sources` `{action: rotate|revoke|disable|enable}`;
  the old credential is invalid immediately. Role passwords: write a new password file, `ALTER ROLE ... PASSWORD` over stdin,
  restart that one process. Never reuse one role's password for another.

### 3.7 Failure playbooks
| Symptom | Meaning | Action |
| --- | --- | --- |
| `schemaStatus: behind` | code newer than DB | backup, new approval, `up`. Do not start the worker meanwhile. |
| `schemaStatus: checksum_mismatch` | migration file edited, or a different branch's migration with the same version | stop; do not apply; compare ledger with `plan`; deploy matching code |
| `schemaStatus: ahead_unverified` | DB newer than this build and not attested (or gap / odd suffix) | roll the build forward, or review the extra migrations as additive and set `SENTINEL_SCHEMA_AHEAD_ACCEPTED_THROUGH` |
| `schemaStatus: ahead_compatible` (warning) | attested rollback window | expected during a rollback; plan the roll-forward and remove the attestation afterwards |
| `approval_required` / `target_denied` | wrong plan hash, action, host, db or marker | correct the approval; never loosen the verifier |
| Provider outage | notifier retries with bounded jittered backoff, then dead-letters (`unknown`) | check provider status; manual retry creates ONE linked intent |
| Source stops sending | coverage turns `stale/disconnected` in Overview/Canvas | rotate or re-enable source; never read as "safe" |
| Response verification failed | action stays `failed`/`inconclusive`, never `verified` | roll back manually; TTL expiry also rolls back |
| Worker crash | leases expire, jobs re-claimed once; duplicates are idempotent | restart; check `queue.expired` returns to 0 |

## 4. Deployment and release

1. Freeze the candidate SHA; CI (`.github/workflows/ci.yml`) must be green: `static` (typecheck, lint, unit, secret scan,
   `npm audit`), `build`, `postgres` (S01/S05-S11 suites on two disposable service containers), `browser`. Hosted-runner notes: the Windows unit
   job pins `PSModulePath` and `TEMP` (S04 owner-runner suites); `.gitattributes` keeps `*.ps1` on LF (their SHA-256 pins); the S01
   suite gets a CI-generated approval (`scripts/sentinel-ci-s01-fixture.ts`) that names itself a CI fixture and cannot reach any
   persistent database. The browser job also runs the production-build E2E (`node tests/auth/run-github-e2e.mjs`: `next build` +
   `next start` on 3107-3109 with stubbed GitHub fixtures, no real credentials; 15-minute step timeout; failure screenshots/traces
   are kept for 7 days). Make the four jobs **required** in branch protection (owner O-5). The optional dependency-review job
   runs only when GitHub Advanced Security is on and the repository variable `GHAS_ENABLED=true` is set; otherwise it is skipped
   (no predictable red check) and `npm audit --audit-level=high` in the static job remains the enforced dependency gate.
   `npm run sentinel:secret-scan` fails when it finds a credential-shaped value, a tracked dotenv file, OR any tracked text it
   could not inspect (unreadable, over the 64 MiB cap); long lines are scanned in overlapping windows, binary files are counted.
   Reviewed fake fixtures are exempted by the SHA-256 of their exact line, not by file name. `.gitattributes` pins line endings
   of hash-pinned scripts; `tests/sentinel/s11-pinned-script-bytes.test.ts` fails if a new pin needs an attribute it lacks.
2. Staging promotion criteria: the above + owner UAT of the original Orderly Demo, a real-session login on a test repository,
   migrations applied to a **staging clone** first, worker started without activation blocks, health `ready`.
3. Rollout order: DB backup -> migrate -> worker (no activation) -> app -> activation blocks one capability at a time
   (detection -> incidents -> notifications -> response -> external intelligence), smoke test after each.
4. Rollback: stop worker/notifier -> deploy previous build. If the database already carries a newer additive migration, the
   rolled-back worker reports `ahead_unverified` (503) until you attest the migrations: review them, then start the worker with
   `SENTINEL_SCHEMA_AHEAD_ACCEPTED_THROUGH=<newest accepted version>` and expect `ahead_compatible` plus a warning. Restore the
   backup only if data (not just schema) must go back, never with `down` on a populated database.
5. Required production monitoring (**NOT_RUN / not provisioned**): alert on health 503, `queue.failed > 0`, `queue.expired > 0`,
   `lagSeconds` growth, outbox `pending` growth, no worker heartbeat for 60 s, disk growth, backup age.
6. Costs: private-repo CI runs one Windows job (billed at a multiplier) plus three Linux jobs; the worker is capped at 256 MB,
   the notifier at 192 MB, PostgreSQL at 1 GB / 2 CPU in the reference compose file.

## 5. Known unsupported / deferred
WhatsApp, Guard live scans (GRD-020/021 stay `not_integrated`), NVD feed, AI explanations (disabled port), multi-region,
hosted/production database, real-provider delivery confirmation, a script-restricting CSP (needs nonces), HSTS (set at the
edge), per-IP pre-authentication rate limiting for `/api/sentinel/ingest` (process-wide 1500/min admission only).

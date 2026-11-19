# Sentinel human actions

## S02 final review and publication authorization - 15 November 2026

The owner explicitly approved final S02 review, commit, push and a PR targeting master in this conversation. No merge, migration, deployment, production change, worker activation or S03 is authorized. All55reviewed files remain in approved S02 scope: authenticated telemetry/source lifecycle, strict ingestion/redaction/idempotency, additive0002SQL, isolated maintenance retention, opt-in sender, existing-UI integration and scoped test/documentation evidence. Existing Auth/Guard/Canvas, frozen contracts, original shared dispatcher and Demo body remain unchanged; the reviewed AppShell links and Sentinel wrapper are the narrow S02 integration. Latest origin/master fetched at e39b01da167052b8ef9b0ebe369a757fdea729bf, identical to branch base; no conflict or unrelated change found. No dependency/lockfile change.

Fresh finalization checks: typecheck PASS; ESLint PASS; complete unit/contract suite489/489PASS in33files,10.27s; production build PASS with private dotenv loading disabled; unchanged original browser regressions6/6PASS in one standalone3.3minute run; unchanged mocked-transport telemetry browser suite5/5PASS in23.1s. All exits0; no retries, timeout changes or assertion weakening. Original first case59.1s against60s remains a timing limitation; Next reported slow OneDrive filesystem. Browser evidence is fixture-based and separate from prior genuine H02. Existing PostgreSQL TEST suites, H02 HTTP/DB/UI/credential/restart and worker lifecycle were NOT RERUN. No DB connection/migration or main worker/emitter/scanner started in finalization. Existing H02 keys remain revoked/source disabled/runtime approvals closed.

Review corrected one documentation overstatement: the production Load older events button has not been browser-tested; actual API cursor pagination passed and remains distinct. No implementation, migration SQL or permission change, so prior PostgreSQL/H02 acceptance remains applicable. Retained helper/date-input failures stay visible. No raw private database snapshots, credentials, passwords, tokens, local approval/env files or runtime artifacts are included. Final private-argument scans and staged-manifest/whitespace checks precede commit; raw evidence remains ignored.

GitHub read-only checks: master unprotected, protection endpoint404, active branch rules empty; no configured required status checks. No GitHub Actions workflow directory exists in this checkout. Available PR/commit checks will be queried after push/PR; do not interpret absence of enforced checks as independent review approval. No manual Vercel deployment or cloud PostgreSQL configuration is permitted. Commit SHA/PR URL and live check results are reported in the final publication response and PR, not invented in this pre-commit document.

## Prior H02 acceptance and approval-gate record (historical)

**Current H02, 15 November 2026 (Asia/Jakarta): COMPLETE for bounded local controlled-test integration.** Owner explicitly changed the approved target from wilanta/wetscan-prototype to owned wilanta/portfolio (github-998736528). Real interactive GitHub login and fresh existing Auth/Canvas authority verified; workspace github-user-187839747:test. Exact approved wetscan_dev/marker/plan and unchanged prior catalog/data/roles verified before activation. One local/controlled_test source,8persisted events,6receipts and8queued accepted-job references retained. Real HTTP, PostgreSQL, Event Explorer, credential lifecycle, isolation and app-restart evidence passed. Both keys revoked, source disabled, emitter opt-ins zero, runtime approval consumed/closed; app/main-worker/emitter/capture/scanner processes stopped, listeners3000/3112/3113 zero. No migrations, TEST access, production, S03 or publication. Prior489units/typecheck/lint/build,6original-browser/5telemetry-browser and PG-suite evidence are historical, NOT RERUN. S02 is ready for final review; commit/push/PR requires separate owner approval. [Actual H02 evidence](SENTINEL_S02_VALIDATION.md), [handoff](agent-handoffs/HANDOFF_S02.md).

## Earlier status and preparation evidence (historical)

**Current S02,15 November2026:** Owner-approved development0002 migration and identical second up PASS(exit0/0), exact wetscan_dev target/marker and combined plan verified. Four empty telemetry tables,7indexes,8FORCERLS policies and approved privileges verified; S01 schema/data/heartbeats and existing role grants unchanged. No TEST connection or runtime activation. Separate migrate_up-only record consumed/closed; previous approvals untouched. H02 actual owned-app/configuration/web-emitter activation and PR publication remain WAITING_USER; S02 not complete. Prior TEST/static/browser passes preserved, not rerun. [Actual migration and acceptance](SENTINEL_S02_POSTGRES_ACCEPTANCE.md), [handoff](agent-handoffs/HANDOFF_S02.md).

## Historical preparation and initial acceptance record

**Current S02, 15 November 2026:** Owner explicitly APPROVED existing TEST-only acceptance after successful preflight for `127.0.0.1:55432/wetscan_s01_test`, marker `wetscan-s01:9f3560a6-127f-42a6-abaf-9f45951e6bd5`, plan `9ceabe57b696fbe59bd51fb5939a197a378abed9c3084802850c4e9d632270f9`; actions runtime(legacy precheck only), integration_test, migrate_up, test-only migrate_down. A separate ignored S02 record preserved the original S01 records. Actual results:14 S01 PASS;14 S02 PASS,1 pagination FAIL,3 NOT RUN; exit 2, stopped without fix/retry. The new one-run record is closed after failure, preserving the owner APPROVED decision in audit fields. Next WAITING_USER: narrow pagination-fix/data-preserving-retest authorization; populated test fixtures must not be cleared to rerun empty reversal. Development0002, app runtime and H02 owned-app acceptance remain separately WAITING_USER. No main worker/emitter, roles/markers/credentials/volume changes, commit/merge/deploy or S03. [Full approval/evidence](SENTINEL_S02_POSTGRES_ACCEPTANCE.md), [H02](SENTINEL_H02_SETUP.md), [handoff](agent-handoffs/HANDOFF_S02.md). Historical entries below are not fresh permissions.

**Current finalization status, 14 November 2026:** H01 is **TESTED** for the approved local foundation: 14/14 real PostgreSQL acceptance on `wetscan_s01_test`, development migration/up-up idempotency on `wetscan_dev`, and worker startup/idle/private-IPC shutdown/restart. The two graceful shutdowns took 22/20 ms, both exit 0. The worker is stopped; runtime-only smoke approvals are closed and the existing dev approval remains migration-only. Final review/commit/push/PR publication are now explicitly authorized by the owner's **S01 Final Review, Commit & Pull Request** request. No merge, new migrations, infrastructure changes, worker startup, Guard activation, deployment or S02. [Actual approval/acceptance history](SENTINEL_H01_ACCEPTANCE.md); [final validation](SENTINEL_S01_VALIDATION.md). The dated acceptance-only/preparation entries below are historical and retain their original gate context.

**Current H01 status, 14 November 2026:** owner Phase B approval authorized the exact new PostgreSQL instance and acceptance-only migrations; the subsequent explicit bug-fix request authorized the one-line shared-comment reader correction, regressions and unchanged test-target rerun. Typecheck/lint and **69 platform unit tests** passed; real PostgreSQL acceptance now passes **all 14 cases**, exit 0, with up/up/down/up completed only on `wetscan_s01_test`. See [approval, exact source checksum, ledger and all case results](SENTINEL_H01_ACCEPTANCE.md). H01 is **TESTED for the approved acceptance database only**. `wetscan_dev` remains unmigrated; main Sentinel worker activation and development migration remain **WAITING_USER**. No container/volume/role/marker/credential or approval record changed during the fix. Historical S00/S01 preparation statements below are retained for provenance and must not be read as current database state.

Updated for S01 preparation, 14 November 2026 (Asia/Jakarta). S00 merged through PR #2 at `ec6838b77cf14a126cb3c4d1a7f8d86d70d85665`. The subsequent explicit S01 task authorizes implementation, Compose/config templates and SQL preparation only. No Sentinel provider, database or worker is configured/activated. Existing auth and GitHub configuration are preserved. Status vocabulary: `NOT_NEEDED | WAITING_USER | CONFIGURED | TESTED | DEFERRED`; H10 additionally uses `WAITING_DAUD | APPROVED`. H01 names now have implemented readers in `.env.sentinel.example`; later-packet env names remain proposals. Keep real values in ignored private files or a secret store, never chat, tracked files, logs or `NEXT_PUBLIC_*`.

## H10 - identity/storage/worker contract sign-off

**Status: APPROVED. Owner: APPROVED, 14 November 2026 (Asia/Jakarta), amendments: None. Daud: APPROVED, 14 November 2026 (Asia/Jakarta), owner-reported; amendments: None, confirmed by owner.**

### Recorded owner approval

Source: the owner's explicit response in this conversation, titled **H10 Architecture Approval - 14 November 2026 (Asia/Jakarta)**:

> I approve all H10 architecture and compatibility decisions documented in docs/SENTINEL_COMPATIBILITY.md.

Amendments: **None**. Approved scope:

1. Existing Canvas/Auth workspace and project identity mapping.
2. Current workspace rename limitations.
3. One local PostgreSQL instance with separate `sentinel` and `platform` schemas.
4. Reusable transaction, durable-job and outbox primitives.
5. Separate Sentinel and Guard worker processes, permissions and resource budgets.
6. Distinct telemetry, Guard audit events and inventory provenance.
7. Existing Auth, Canvas, Guard and Demo Mode ownership boundaries.

### Recorded Daud approval (owner-reported)

Source: **Owner-reported confirmation of Daud's approval.** The owner reported Daud APPROVED on **14 November 2026 (Asia/Jakarta)** and, in response to the amendment clarification, explicitly confirmed: **"Daud approved with no amendments"**. Amendments: **None, confirmed by owner**. This is not a directly or independently verified message from Daud; decision/date/amendments are recorded from the owner's confirmation, as expressly authorized. See the matching [compatibility approval record](SENTINEL_COMPATIBILITY.md#h10-approval-record).

Both approval records are sufficient, with their provenance preserved; H10 is **APPROVED**. The reviewed S00 packet subsequently merged as PR #2. The owner's new explicit S01 request authorizes preparation of code/configuration/SQL files, superseding the earlier S00-only prohibition on creating migration files. **H01 still blocks provisioning, database connections and migration application**; H10 does not approve a local database target. No merge or deployment of S01 is authorized.

### Sign-off checklist

1. Review the [one-page compatibility sheet](SENTINEL_COMPATIBILITY.md) and [architecture](SENTINEL_ARCHITECTURE.md). Confirm exact Canvas-derived workspace/project/graph-ref mapping; current user-plus-workspace scoping and rename behavior; no new repository/OAuth registry. A future team-wide workspace ID would be a separately agreed migration.
2. Approve one local Postgres instance, module-owned Sentinel records and module-neutral transaction/jobs/outbox; leave auth files and Canvas cache untouched. No Guard tables/migrations or scanner enrollment. Future Guard persistence/queue adapters require Guard owner tests/review.
3. Approve separate Sentinel/Guard worker entrypoints, module-isolated claims/roles and proposed Sentinel budgets. Sentinel never executes Guard scanners or supplies SandboxPort.
4. Approve reserved telemetry vs pipeline audit vs inventory names, v1 handoff provenance, mode isolation and no-touch ownership list. Review denial tests, explicitly noting provider/producer fixtures are not live acceptance.
5. Record both approvers, date and any amendments in review or this document. Only then request S01; H01 separately covers local DB configuration and authorization to apply migrations.

Env: none. No new third-party account, cloud setting, provider send or deployment is required. Expected result: explicit shared architecture acceptance **before creating database migration files**. No approval is inferred from test success or silence. This gate comes from the user-supplied playbook section 4, H10: "required before S01" and the user's S00-only request.

## H01 - local PostgreSQL: completed acceptance; historical setup gate below

**Current: TESTED**, as recorded above. New targets, changed SQL/permissions or future runtime activation require their own explicit approval. Do not repeat provisioning, apply down, reset databases or delete volumes. The original setup requirements below remain reference material, not authorization to rerun them.

**Status: WAITING_USER. Who: owner/local platform operator + Codex. H10 APPROVED; S01 preparation explicitly authorized; target/initial migration application NOT APPROVED.**

Prepared: dedicated PostgreSQL 17 Compose, external-volume configuration, safe env/approval templates, reversible versioned SQL and gated runner, typed transaction/queue/outbox adapters, isolated worker/health and offline plus opt-in PostgreSQL tests. Review [exact setup choices and commands](SENTINEL_H01_SETUP.md), [migration plan/hash and reverse limits](SENTINEL_S01_MIGRATION_REVIEW.md), [implementation architecture](SENTINEL_S01_ARCHITECTURE.md) and [validation](SENTINEL_S01_VALIDATION.md).

Required owner decisions: approve a NEW dedicated loopback instance on proposed 55432, reviewed PostgreSQL 17 image digest, unused external volume name, `wetscan_dev`, three isolated runtime/migration roles plus bootstrap principal, exact database marker, private secret/approval file locations, resource budgets and 30-day terminal infrastructure retention. Explicitly approve initial migration application with the reviewed plan SHA-256. Do not connect to an unknown existing database or reuse/overwrite existing volumes. Separate empty `wetscan_s01_test` target approval must cover test fixtures and up/down acceptance. No database/volume drop is provided.

Implemented env: `SENTINEL_DB_HOST`, `SENTINEL_DB_PORT`, `SENTINEL_DB_NAME`, `SENTINEL_DB_MARKER`, `SENTINEL_DB_APPROVAL_FILE`, purpose-specific `SENTINEL_DB_APP_PASSWORD_FILE`, `SENTINEL_DB_WORKER_PASSWORD_FILE`, `SENTINEL_DB_MIGRATION_PASSWORD_FILE`, bootstrap password-file path, image/volume and bounded worker/retention settings. No connection URL or password value is tracked. Development approval permits only the actions actually authorized, normally runtime/up; the separate test target needs runtime/integration_test/up/down. Actual PostgreSQL migrations, app/worker access, RLS, durable restart/concurrency/fencing/retention and worker health are **BLOCKED_H01 / NOT RUN**, not established by offline doubles.

## H02 - authorized runtime telemetry

**Status: TESTED for bounded local H02, 15 November 2026.** Owner approved wilanta/portfolio after real login/selection. All12requested areas passed; source disabled, both keys revoked and temporary processes stopped. No ongoing runtime or production integration is authorized. The setup prerequisites below are historical reference.

Prerequisites: S01 operational; select exactly one owned local/staging app, environment, event allowlist and retention. Decide middleware/SDK installation; no automatic instrumentation. Codex supplies secure scoped credential creation/rotation and controlled emitter. Human enables the sender server-side, enters the ingest key in ignored env and restarts the selected app. External staging needs separately permitted HTTPS exposure; localhost tests need no public tunnel.

Implemented S02 emitter env: `SENTINEL_EMITTER_ENABLED`, `SENTINEL_EMITTER_OWNED_APP_CONFIRMED`, `SENTINEL_INGEST_ENDPOINT`, `SENTINEL_INGEST_CREDENTIAL_FILE`. No plaintext-key environment variable is used. [Exact setup/permissions/acceptance actions](SENTINEL_H02_SETUP.md). Expected proof: an actual authorized GitHub project -> source registration -> show-once credential -> owned-app controlled events -> approved PostgreSQL persistence -> Event Explorer, with source/timestamps and no password/token/body/raw sensitive identifier. The prepared offline/UI fixtures and future gated DB tests cannot establish this full flow. Runtime provenance needs actual runtime evidence; repository connection never establishes telemetry. This proof has now been obtained for the bounded local controlled-test scope above; future production/runtime instrumentation remains separately gated.

## H03 - controlled response scope

**Status: GRANTED for S05 local development only (owner, 19 Nov 2026): in-repo loopback fixture on `127.0.0.1`, max TTL 600 s, self-approval permitted for the controlled fixture with full audit, isolated throwaway database. No real application, WAF/CDN/cloud or production target is approved; those stay `NO-OP / NOT_CONFIGURED` until a new H03 record names them.** Who: owner of the exact response target and per-action reviewer. See [SENTINEL_S05_ARCHITECTURE.md](SENTINEL_S05_ARCHITECTURE.md).

Prerequisites: S04 incident evidence; choose an owned reversible local rate-limit target, operation, permitted actor scope, max TTL (propose 600 s), rollback and benign control. Record approval proof and per-action consent before applying live changes. Codex first supplies unavailable/NO-OP behavior, then the approved local adapter and independent verifier. No cloud/WAF/firewall/deployment change is approved by this document.

Proposed env: `SENTINEL_RESPONSE_BASE_URL`, `SENTINEL_RESPONSE_TOKEN`, `SENTINEL_RESPONSE_MAX_TTL_SECONDS`; target scope and approvals in authenticated records, not solely env. Expected proof: apply acceptance, malicious replay blocked AND benign control succeeds, independent evidence, rollback/expiry restores state; failed/inconclusive remain explicit.

## H04 - Telegram

**Status: ADAPTER READY (S06 `fixture-tested`, `DEV accepted`); live test send `NOT_RUN` - no bot token or approved destination exists locally. The owner authorized one controlled test send to a bot/destination they own once these exist (19 Nov 2026). Who: owner of a dedicated test bot and approved destination.**

S06 procedure (secrets never enter chat, Git, the browser or the main worker): (1) create the bot in @BotFather privately; (2) save the token in an ignored file and set `TELEGRAM_BOT_TOKEN_FILE` **only** for the notifier process (`infra/sentinel/notifier.env.example`); (3) start the bot chat and obtain the numeric chat ID; (4) in the project UI **Sentinel > Notifications**, enter the chat ID, tick the consent box, **Save**, then **Send one test message**; (5) the message arriving + a ledger row `provider_accepted` with the provider message id is the proof. Acceptance is _not_ a read receipt. `TELEGRAM_CHAT_ID`/`SENTINEL_TEST_*` env names are not used: the destination is per-project, consented data in PostgreSQL.

Prerequisites: S04 + transactional outbox, explicit permission for one real test send. In Telegram, open @BotFather, create a dedicated bot, privately retain token, start a private bot chat or authorize a test group; obtain the intended chat ID through the supported bot update flow. Enter token/destination server-side, review destination in the future channel UI and explicitly request a test send. Codex implements official `sendMessage`, destination consent, timeout/retries and redacted ledger. It does not register the bot or send during S00.

Proposed env: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`. Expected proof: actual message at approved destination plus recorded provider ID/acceptance; recipient delivery/read is not established solely by acceptance. No inbound webhook required for basic send.

## H05 - email

**Status: ADAPTER READY (optional; `fixture-tested`); live send `NOT_RUN` - no Resend key, verified sender domain or approved recipient exists locally. Who: owner of sending domain/provider account.**

S06 uses `RESEND_API_KEY`/`RESEND_API_KEY_FILE` and `NOTIFICATION_FROM_EMAIL` on the notifier only; the recipient is entered as the project's email destination. No delivery webhook is implemented, so email can reach `provider_accepted` but never `delivered`.

Prerequisites: choose provider and authorize test recipient/send. If using Resend, create transactional account, add controlled sending subdomain, apply provider-provided SPF/DKIM records in DNS, wait for verification, create sending-only key; enter server env and sender, then authorize one test. Codex adds a portable email adapter and verified delivery callbacks only if configured; no DNS/account mutations here.

Proposed env: `RESEND_API_KEY`, `NOTIFICATION_FROM_EMAIL`, `SENTINEL_TEST_EMAIL_TO`; optional callback secret defined only with the selected provider implementation. Expected proof: approved recipient sees controlled message; accepted/delivered/failed remain separate with redacted evidence.

## H06 - WhatsApp

**Status: DEFERRED (S06 ships only the unavailable state `Requires business setup / Not configured`; DB CHECKs make enabling WhatsApp impossible and the activation block rejects it). Not a core vertical-slice blocker. Who: business/number owner.**

Prerequisites: select official WhatsApp Business Platform, permitted business phone, recipient opt-in, approved template and costs/usage scope. Human completes Meta Business setup, creates scoped credentials and records phone-number ID/template/consent. A real callback requires separately approved public HTTPS and signature verification. Until then show `Requires business setup` and previews only; no unofficial session/browser automation.

Proposed env: `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_APP_SECRET`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN`; per-project consent/template/destination stored securely in S06, never a generic recipient broadcast. Expected proof: opt-in test recipient receives approved template and verified callback records delivery independently of API acceptance.

## H-S06-ROLE - notifier database role, migration 0005/0006 and approvals (new, S06)

**Status: PENDING (owner). Not performed against the owner development database.** The notifier is a separate credential domain, so before it (or the new app/worker code) can run on a real database the owner must: review `infra/sentinel/provision-roles-s06.sql` and create `wetscan_sentinel_notifier` with its own password file (`SENTINEL_DB_NOTIFIER_PASSWORD_FILE`); back up the target (`pg_dump`); apply `0005_response` (if absent) and `0006_notifications` as `wetscan_migrator` after plan review (full plan sha256 `82e20396...1e8c`, see [SENTINEL_S06_MIGRATION_REVIEW.md](SENTINEL_S06_MIGRATION_REVIEW.md)); issue **new** app and worker approvals bound to that plan hash, and a sender approval containing a `notifications` block for exactly one project (channels `telegram` and/or `email`). Until then the existing dev app/worker, sealed to the older hash, are intentionally unaffected.

## H07 - Ghost Lite placement

**Status: DEV_ACCEPTED for H07 local loopback fixture (`127.0.0.1` `/__wetscan/ghost-decoy`) on isolated PostgreSQL 17.12 (owner-authorized, 19 Nov 2026). External staging target: NOT_RUN (no external staging app configured). Persistent dev database `wetscan_dev` migration (`0005`–`0007`): NOT_RUN pending `H-S06-ROLE`. Who: owner of the selected harmless local/staging decoy.**

Implemented: `createGhostDecoyHandler` / `startGhostFixture` (`src/features/sentinel/ghost/decoy.ts`), CLI `scripts/sentinel-ghost-fixture.ts` (`npm run sentinel:ghost:fixture`), template `infra/sentinel/ghost.env.example` (uses `SENTINEL_GHOST_ENABLED`, `SENTINEL_GHOST_OWNED_APP_CONFIRMED`, `SENTINEL_GHOST_PORT`, `SENTINEL_GHOST_DECOY_PATH`, `SENTINEL_GHOST_RESPONSE_STATUS`, `SENTINEL_GHOST_RATE_LIMIT`, `SENTINEL_INGEST_ENDPOINT`, `SENTINEL_INGEST_CREDENTIAL_FILE`), additive migration `0007_ghost` (default-disabled `ghost_decoys`, append-only `ghost_audit`), Ghost API/UI (`/sentinel/ghost`), and `controlled-decoy-v1` preserved as `DRAFT` by default. Observed proof on isolated PostgreSQL + loopback fixtures: harmless `200` on `/__wetscan/ghost-decoy` -> `ghost.decoy_triggered` (redacted, no secrets/IPs/cookies/bodies) -> `controlled-decoy-v1` -> alert -> incident + evidence; duplicate/replay coalesced; benign crawler classified safely without automatic blocking; disabled/revoked/cross-tenant denied; Orderly Demo isolated. See [SENTINEL_S07_ARCHITECTURE.md](SENTINEL_S07_ARCHITECTURE.md) and [SENTINEL_S07_VALIDATION.md](SENTINEL_S07_VALIDATION.md).

Prerequisites: S02/S04; approve safe non-sensitive path/honeytoken, app, allowed metadata and expected false positives. Human installs/enables only the reviewed endpoint on that app and requests one controlled hit. Codex routes it through the same source/event/rule/incident pipeline. No real credential, public lure, adaptive diversion or session isolation.

Proposed env: reuse H02 sender variables; `SENTINEL_GHOST_DECOY_PATH` (`/__wetscan/ghost-decoy`). Expected proof: actual labeled test hit -> `ghost.decoy_triggered` -> evidence/incident; legitimate scanners may trigger it, so no breach inference.

## H-S08-AI - optional AI explanation provider (new gate, S08)

**Status: NOT_CONFIGURED / DEFERRED (optional; does not block S08). Who: owner.**

S08 ships only the disabled `AIExplanationPort` default (`disabledAIExplanation`). No provider, key, model call or data egress exists. Before any adapter is written the owner must decide and record: provider and region, cost budget, privacy/consent (what, if anything, may leave the system), retention at the provider, and per-project opt-in. The maximum input is fixed by `redactedGroupSummary` (indicator labels and counts only: no ids, titles, notes, actors, sources or evidence). Output must remain labelled untrusted/draft-only and can never create, approve, validate or enable a rule. Proposed env names only: `SENTINEL_AI_EXPLAIN_ENABLED`, `SENTINEL_AI_PROVIDER`, `SENTINEL_AI_API_KEY` (server-only). Expected proof: opt-in test project, redacted payload captured and reviewed before the first call.

## H-S08-DEVDB - persistent `wetscan_dev` upgrade to `0008` (new, S08)

**Status: PENDING (owner). `NOT_RUN` - the persistent development database was not inspected or changed.** Follow `H-S06-ROLE`, then apply `0005`-`0008` after a verified backup and issue new sealed `app`/`worker` approvals bound to plan sha256 `7ac3e11c4f1fc3caf30e782f2e8e3b73d1a6cdf19438d722bf3cb1d805733012` (details in `SENTINEL_S08_MIGRATION_REVIEW.md`). No backfill: the case library starts empty and humans archive incidents explicitly.

## H08 - public advisories and actual inventory

**Status: PARTIALLY APPROVED (19 Nov 2026, owner instruction for S09): controlled development/staging reads of the official CISA KEV, GitHub Global Security Advisories and OSV endpoints were authorized and exercised once as a bounded smoke test on a throwaway database (`S09-A7`, see `SENTINEL_S09_VALIDATION.md`). STILL OPEN (owner): enabling the worker lane in any persistent environment (`SENTINEL_EXTERNAL_INTEL_ENABLED=1` + the `externalIntel` approval block, see `infra/sentinel/external.env.example`), sync cadence/retention, optional GHSA token file. NVD: DEFERRED/NOT_CONFIGURED (not implemented). Guard GRD-020: not_integrated. Who: owner + Guard/inventory owner.**

Implemented as proposed below: lockfile-sourced repository-only inventory (declared dependencies, never proof of deployment) was chosen over waiting for GRD-020; GRD-020 stays unavailable.

Prerequisites: S01; choose feed enablement/network budget/cadence and approve external synchronization when needed. Codex can implement CISA/GHSA/OSV adapters against fixtures first; no feeds are contacted in S00. If NVD selected, human requests/activates API key and enters server env. For project exposure, Guard owner must provide genuinely observed inventory with scan/commit/package/version/ecosystem/sourcePath/license evidence through GRD-020, or separately approve authorized lockfile reads with repository-only labels. Do not run customer scans from Sentinel.

Proposed env: `SENTINEL_ADVISORY_FEEDS_ENABLED`, `NVD_API_KEY` (optional). No new GitHub OAuth or mandatory API key for initial public-feed design. Expected proof: timestamped normalized advisory, real matching inventory, potential repository exposure only; absent inventory displays `Cannot assess project exposure`. External advisory is never attack evidence.

## H09 - final acceptance / merge and deployment decisions

**Status: DEFERRED to S11. Who: owner/reviewer.**

Prerequisites: active packets tested; inspect original-vs-integrated UI, two-project isolation, restart/retry, retained limitations and evidence. Human chooses permitted local/staging deployment scope and enabled channels, performs UAT and explicitly accepts/rejects any merge/deployment. Codex supplies reports and PR description; no auto-merge or deployment. Env: none for acceptance; deployment-specific settings require their own later review. Expected proof: recorded owner decision, separate from fixture/technical checks.

## Additional decisions retained for future packets

| Decision                                                                             | Owner / status                                    | Required choice                                                                                                                                                                              |
| ------------------------------------------------------------------------------------ | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Database driver/migration tool, PostgreSQL version, port/roles/budgets and retention | Owner/platform, WAITING_USER H01                  | S01 prepares pg/custom checksummed runner, dedicated PG17/55432 and isolated roles; approve exact target/image/volume/marker and application. Event/evidence retention remains future scope. |
| Team/shared workspace identity, rename/transfer                                      | H10 APPROVED; Daud owner-reported                 | Both approvals dated 14 November 2026 (Asia/Jakarta), no amendments; Daud's source is owner-reported. Future immutable team ID requires explicit migration.                                  |
| Guard actual producer, repository permission recheck and source-to-node mapping      | Guard/Canvas owners; **CAN-008 narrow seam authorized by the owner for S10 (2026-11-19)**, GRD-020/021 DEFERRED | Narrow S04/S10 router/UI/Canvas-overlay seams were exercised in S10 and are reviewed in the PR. GRD-020/021 still need a real Guard producer (scan + immutable commit + grant/provenance) before any adapter is approved; until then both stay `not_integrated`. |
| AI provider/privacy/budget                                                           | Owner, DEFERRED optional (gate `H-S08-AI`)        | No AI env/key selected; require opt-in/redaction, explanatory drafts only. Never publish rules or apply responses automatically.                                                             |
| Public exposure/tunnel/provider callbacks                                            | Target owner, DEFERRED                            | Not required for S00 or localhost ingest tests; explicit allowed HTTPS endpoint and signatures before enabling later.                                                                        |

No entry is CONFIGURED/TESTED merely because a contract or mock exists. Existing user provider setup was not inspected, so this file does not assert it is missing globally.

## H-S09-DEVDB - persistent `wetscan_dev` upgrade to `0009` (new, S09)

**Status: PENDING (owner). `NOT_RUN` - the persistent development database was not inspected or changed.** Follow `H-S06-ROLE` and `H-S08-DEVDB`, then apply `0005`-`0009` after a verified backup and issue new sealed `app`/`worker` approvals bound to plan sha256 `94f99d996e08bec042aa11a2295087dd69cd35a64d2fc48211292817b287831c` (details in `SENTINEL_S09_MIGRATION_REVIEW.md`). No backfill: the catalog starts empty and is filled only by worker syncs; inventory is collected by an explicit user action.

## H-S09-OSV-QUERY - send project package versions to OSV (new, S09)

**Status: NOT_APPROVED (default off, owner decision).** S09 enriches OSV only by already-known public GHSA ids, so no private dependency data leaves the system. An OSV `querybatch` over a project's lockfile (broader coverage than GHSA-seeded enrichment) discloses package names/versions of a private repository to a third party; implement only after the owner records approval, scope and retention.

## S10 operational prerequisites (owner actions; none were performed by the agent)

| ID | Action | Status | Fail-closed default |
| --- | --- | --- | --- |
| H-S10-DEVDB | Upgrade the persistent `wetscan_dev` to `0005`-`0009` (backup first; sealed approvals bound to the current plan hash; `H-S06-ROLE`). S10 itself needs **no** new migration. | `NOT_RUN` | Live Overview/Reports/Canvas overlay show `not_configured`/`Monitoring not connected`; nothing is shown healthy. |
| H-S10-E2E | Authenticated real-GitHub-session UAT on an owner-controlled repository with a connected telemetry source: open Canvas -> Security lens, confirm an actual controlled event is placed (or listed as "not placed"), export a report, check revoke behaviour. | `NOT_RUN` | Mocked-transport + isolated-PostgreSQL acceptance only; no `LIVE_TESTED` claim. |
| H-S10-GUARD | A real Guard producer for GRD-020 (inventory) / GRD-021 (pipeline audit) before any adapter is enabled. | `DEFERRED` | `not_integrated`, no fabricated findings or pipeline events. |

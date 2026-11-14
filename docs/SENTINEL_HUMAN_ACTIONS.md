# Sentinel human actions

S00 only, 14 November 2026 (Asia/Jakarta). No Sentinel provider, database or worker is configured by this packet. Existing auth and GitHub configuration are preserved and were not read from dotenv. Status vocabulary: `NOT_NEEDED | WAITING_USER | CONFIGURED | TESTED | DEFERRED`; H10 additionally uses `WAITING_DAUD | APPROVED` per the owner's explicit approval-record instruction. Future env names below are **proposals**, not implemented configuration readers. Keep real values in ignored server environment files or a secret store, never chat, tracked files, logs or `NEXT_PUBLIC_*`.

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

Both approval records are sufficient, with their provenance preserved; H10 is **APPROVED**. Commit the 14 S00 files, verify latest `master` compatibility, run the requested validation and publish the PR to `master` without merging. **S01 and creation/application of PostgreSQL migrations remain unstarted and unauthorized** pending the separate instance/database configuration and initial migration approval; H10 does not approve the local H01 proposal.

### Sign-off checklist

1. Review the [one-page compatibility sheet](SENTINEL_COMPATIBILITY.md) and [architecture](SENTINEL_ARCHITECTURE.md). Confirm exact Canvas-derived workspace/project/graph-ref mapping; current user-plus-workspace scoping and rename behavior; no new repository/OAuth registry. A future team-wide workspace ID would be a separately agreed migration.
2. Approve one local Postgres instance, module-owned Sentinel records and module-neutral transaction/jobs/outbox; leave auth files and Canvas cache untouched. No Guard tables/migrations or scanner enrollment. Future Guard persistence/queue adapters require Guard owner tests/review.
3. Approve separate Sentinel/Guard worker entrypoints, module-isolated claims/roles and proposed Sentinel budgets. Sentinel never executes Guard scanners or supplies SandboxPort.
4. Approve reserved telemetry vs pipeline audit vs inventory names, v1 handoff provenance, mode isolation and no-touch ownership list. Review denial tests, explicitly noting provider/producer fixtures are not live acceptance.
5. Record both approvers, date and any amendments in review or this document. Only then request S01; H01 separately covers local DB configuration and authorization to apply migrations.

Env: none. No new third-party account, cloud setting, provider send or deployment is required. Expected result: explicit shared architecture acceptance **before creating database migration files**. No approval is inferred from test success or silence. This gate comes from the user-supplied playbook section 4, H10: "required before S01" and the user's S00-only request.

## H01 - local PostgreSQL

**Status: DEFERRED to S01 after H10. Who: owner/local platform operator + Codex.**

Prerequisites: explicit S01 task, H10 accepted. Choose Docker Desktop/WSL2 or existing local Postgres, dev port/database and nonproduction role/password; approve retention and local resource limits. Codex then provides dev Compose (if selected), health checks, typed SQL/migrations, ignored env template and exact run commands. Human copies the future `.env.example` to ignored env, enters credentials locally, starts DB and explicitly authorizes initial migration application. No existing volume/schema may be deleted or overwritten.

Proposed env: `DATABASE_URL`, `SENTINEL_WORKER_CONCURRENCY`, `SENTINEL_WORKER_POLL_MS`, `SENTINEL_JOB_LEASE_MS`, `SENTINEL_EVENT_RETENTION_DAYS`, `SENTINEL_EVIDENCE_RETENTION_DAYS`; separate future `SENTINEL_WORKER_DATABASE_URL` role if approved. Final names/readers arrive in S01. Expected proof: idempotent migration runs, real app/worker DB access, denied other-project/module queries, durable restart/retry/fencing and redacted logs. None tested/configured in S00.

## H02 - authorized runtime telemetry

**Status: DEFERRED to S02. Who: owner of one test app.**

Prerequisites: S01 operational; select exactly one owned local/staging app, environment, event allowlist and retention. Decide middleware/SDK installation; no automatic instrumentation. Codex supplies secure scoped credential creation/rotation and controlled emitter. Human enables the sender server-side, enters the ingest key in ignored env and restarts the selected app. External staging needs separately permitted HTTPS exposure; localhost tests need no public tunnel.

Proposed emitter env: `SENTINEL_INGEST_URL`, `SENTINEL_INGEST_KEY`. Expected proof: controlled failed-auth event stored in the correct project/source as **controlled_test**, with source/timestamp and no password/token/body/raw sensitive identifier. Production runtime needs actual runtime evidence; repository connection never establishes telemetry.

## H03 - controlled response scope

**Status: DEFERRED to S05. Who: owner of the exact response target and per-action reviewer.**

Prerequisites: S04 incident evidence; choose an owned reversible local rate-limit target, operation, permitted actor scope, max TTL (propose 600 s), rollback and benign control. Record approval proof and per-action consent before applying live changes. Codex first supplies unavailable/NO-OP behavior, then the approved local adapter and independent verifier. No cloud/WAF/firewall/deployment change is approved by this document.

Proposed env: `SENTINEL_RESPONSE_BASE_URL`, `SENTINEL_RESPONSE_TOKEN`, `SENTINEL_RESPONSE_MAX_TTL_SECONDS`; target scope and approvals in authenticated records, not solely env. Expected proof: apply acceptance, malicious replay blocked AND benign control succeeds, independent evidence, rollback/expiry restores state; failed/inconclusive remain explicit.

## H04 - Telegram

**Status: DEFERRED to S06. Who: owner of a dedicated test bot and approved destination.**

Prerequisites: S04 + transactional outbox, explicit permission for one real test send. In Telegram, open @BotFather, create a dedicated bot, privately retain token, start a private bot chat or authorize a test group; obtain the intended chat ID through the supported bot update flow. Enter token/destination server-side, review destination in the future channel UI and explicitly request a test send. Codex implements official `sendMessage`, destination consent, timeout/retries and redacted ledger. It does not register the bot or send during S00.

Proposed env: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`. Expected proof: actual message at approved destination plus recorded provider ID/acceptance; recipient delivery/read is not established solely by acceptance. No inbound webhook required for basic send.

## H05 - email

**Status: DEFERRED (optional S06). Who: owner of sending domain/provider account.**

Prerequisites: choose provider and authorize test recipient/send. If using Resend, create transactional account, add controlled sending subdomain, apply provider-provided SPF/DKIM records in DNS, wait for verification, create sending-only key; enter server env and sender, then authorize one test. Codex adds a portable email adapter and verified delivery callbacks only if configured; no DNS/account mutations here.

Proposed env: `RESEND_API_KEY`, `NOTIFICATION_FROM_EMAIL`, `SENTINEL_TEST_EMAIL_TO`; optional callback secret defined only with the selected provider implementation. Expected proof: approved recipient sees controlled message; accepted/delivered/failed remain separate with redacted evidence.

## H06 - WhatsApp

**Status: DEFERRED, not a core vertical-slice blocker. Who: business/number owner.**

Prerequisites: select official WhatsApp Business Platform, permitted business phone, recipient opt-in, approved template and costs/usage scope. Human completes Meta Business setup, creates scoped credentials and records phone-number ID/template/consent. A real callback requires separately approved public HTTPS and signature verification. Until then show `Requires business setup` and previews only; no unofficial session/browser automation.

Proposed env: `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_APP_SECRET`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN`; per-project consent/template/destination stored securely in S06, never a generic recipient broadcast. Expected proof: opt-in test recipient receives approved template and verified callback records delivery independently of API acceptance.

## H07 - Ghost Lite placement

**Status: DEFERRED to S07. Who: owner of the selected harmless local/staging decoy.**

Prerequisites: S02/S04; approve safe non-sensitive path/honeytoken, app, allowed metadata and expected false positives. Human installs/enables only the reviewed endpoint on that app and requests one controlled hit. Codex routes it through the same source/event/rule/incident pipeline. No real credential, public lure, adaptive diversion or session isolation.

Proposed env: reuse H02 sender variables; optional `SENTINEL_GHOST_DECOY_PATH`. Expected proof: actual labeled test hit -> `ghost.decoy_triggered` -> evidence/incident; legitimate scanners may trigger it, so no breach inference.

## H08 - public advisories and actual inventory

**Status: DEFERRED to S09; NVD optional. Who: owner + Guard/inventory owner.**

Prerequisites: S01; choose feed enablement/network budget/cadence and approve external synchronization when needed. Codex can implement CISA/GHSA/OSV adapters against fixtures first; no feeds are contacted in S00. If NVD selected, human requests/activates API key and enters server env. For project exposure, Guard owner must provide genuinely observed inventory with scan/commit/package/version/ecosystem/sourcePath/license evidence through GRD-020, or separately approve authorized lockfile reads with repository-only labels. Do not run customer scans from Sentinel.

Proposed env: `SENTINEL_ADVISORY_FEEDS_ENABLED`, `NVD_API_KEY` (optional). No new GitHub OAuth or mandatory API key for initial public-feed design. Expected proof: timestamped normalized advisory, real matching inventory, potential repository exposure only; absent inventory displays `Cannot assess project exposure`. External advisory is never attack evidence.

## H09 - final acceptance / merge and deployment decisions

**Status: DEFERRED to S11. Who: owner/reviewer.**

Prerequisites: active packets tested; inspect original-vs-integrated UI, two-project isolation, restart/retry, retained limitations and evidence. Human chooses permitted local/staging deployment scope and enabled channels, performs UAT and explicitly accepts/rejects any merge/deployment. Codex supplies reports and PR description; no auto-merge or deployment. Env: none for acceptance; deployment-specific settings require their own later review. Expected proof: recorded owner decision, separate from fixture/technical checks.

## Additional decisions retained for future packets

| Decision                                                                             | Owner / status                                    | Required choice                                                                                                                                             |
| ------------------------------------------------------------------------------------ | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Database driver/migration tool, PostgreSQL version, port/roles/budgets and retention | Owner/platform, DEFERRED H10/H01                  | Review small `pg` proposal/current versions in S01; no package added now. Confirm event/evidence retention and open-incident holds.                         |
| Team/shared workspace identity, rename/transfer                                      | H10 APPROVED; Daud owner-reported                 | Both approvals dated 14 November 2026 (Asia/Jakarta), no amendments; Daud's source is owner-reported. Future immutable team ID requires explicit migration. |
| Guard actual producer, repository permission recheck and source-to-node mapping      | Guard/Canvas owners, DEFERRED GRD-020/021/CAN-008 | Approve future adapters after producer evidence; approve narrow S04/S10 router/UI handoff.                                                                  |
| AI provider/privacy/budget                                                           | Owner, DEFERRED optional                          | No AI env/key selected; require opt-in/redaction, explanatory drafts only. Never publish rules or apply responses automatically.                            |
| Public exposure/tunnel/provider callbacks                                            | Target owner, DEFERRED                            | Not required for S00 or localhost ingest tests; explicit allowed HTTPS endpoint and signatures before enabling later.                                       |

No entry is CONFIGURED/TESTED merely because a contract or mock exists. Existing user provider setup was not inspected, so this file does not assert it is missing globally.

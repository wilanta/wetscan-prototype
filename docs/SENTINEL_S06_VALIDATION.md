# Sentinel S06 — Validation & Acceptance Evidence

Date: 19 Nov 2026 · Branch `feat/sentinel-s06-notifications` · Environment: Windows 11, Node 22, throwaway **PostgreSQL 17.12** container (`127.0.0.1:55441`, tmpfs data, random databases dropped by the harness, owner dev database untouched) · Providers: in-process mocks and loopback HTTP mock servers only. **No external network call, no real credential, no real message was sent.**

Status vocabulary: `PASS` = executed and passed here · `NOT_RUN` = not executed (reason given) · `DEV accepted` = passed on the throwaway DB; **not** `live tested`.

## Commands and results
| Command | Result |
|---|---|
| `npx tsc --noEmit` | PASS |
| `npx eslint .` | PASS (0 errors, 0 warnings) |
| `npx vitest run` | 1544 / 1545 passed (86 files). The single failure `tests/sentinel/audit-deadline.test.ts › rejects … deadline 211000` is **pre-existing**: it fails identically on the base commit `9b8b718` in a full run (1481/1482 there) and passes in isolation (30/30) — it spawns PowerShell under a tight timeout and is load-sensitive. Not related to S06; not modified. |
| `npx next build` | PASS (`/api/sentinel/projects/[projectId]/notifications` registered) |
| `npx vitest run -c tests/sentinel/notification-postgres.config.ts` (`SENTINEL_S05_PG_ADMIN_URL` → throwaway container) | PASS 22/22 (21 integration + 1 process-level file with 2 tests; see matrix) |
| `npm run test:sentinel:response:postgres` (S05 regression, same container) | PASS 23/23 (after updating two S05 assertions that assumed 0005 was the newest migration) |
| Playwright `notification.playwright.config.ts` | PASS 6/6 |
| Playwright S05 `response`, S04 `incident`, S03 `detection`, original walkthrough/interaction (`playwright.config.ts`) | PASS 3/3, 3/3, 6/6, 6/6 (no demo/live regression) |

## Defects found by the acceptance tests and fixed before merge
1. `retainNotifications` used `FOR UPDATE SKIP LOCKED`; the worker role has no UPDATE on the ledger ⇒ **every worker pass would have thrown and logged `degraded`**. Caught by the real S05 worker-loop test. Fixed (no row lock), regression test added (`S06 retention`).
2. `requestRetry` locked the ledger row `FOR UPDATE` (app role has no UPDATE) ⇒ permission denied. Fixed (the project-binding lock already serializes commands).
3. Editing `provision-roles.sql` would have invalidated the accepted S04 plan hash (`reviewedS04Plan`). Role moved to `provision-roles-s06.sql`, hashed only into plans containing 0006.
4. (S05, incidental) the live project route guard rejected `/sentinel/responses` ⇒ allowed.

## Acceptance matrix
| ID | Level | Scenario (Given/When/Then, abbreviated) | Result | Evidence |
|---|---|---|---|---|
| S06-A1 | Postgres + worker | Given an enabled, verified Telegram channel, when one incident is produced, re-produced 3× concurrently, re-correlated and the outbox entry re-appended, then exactly 1 ledger row, 1 outbox row, 1 job and 1 provider call | **PASS** | `notification.postgres.integration.ts` › S06-A1 |
| S06-A2 | Postgres + worker | 429(retry-after) → 5xx → ambiguous timeout → accepted: backoff holds (no immediate retry), 4 attempt rows, final `provider_accepted`, no earlier acceptance; 5×5xx ⇒ exactly 5 calls, `failed` + dead letter + job failed; ambiguous exhaustion ⇒ `unknown`; permanent 403 ⇒ 1 call; missing provider ⇒ `provider_not_configured`; crash after `attempted` ⇒ reclaim, `attempt_count=2`, 1 resend; lease-exhaustion poison ⇒ swept to `unknown` | **PASS** | same file › S06-A2 (6 tests) |
| S06-A3 | Postgres | quiet hours (explicit tz) defer and are re-checked at send time; disabled / missing consent / severity floor / controlled-test exclusion / throttle ⇒ `suppressed` with exact reason and **no outbox/job**; runtime origin needs no opt-in; project B never sees or receives project A's intents/destination | **PASS** | › S06-A3 (4 tests) |
| S06-A4 | unit + process | Telegram 200/429/5xx/401/403/400/404/418/malformed/oversize/network → correct outcome, never `delivered`; token never in outcomes, request body, ledger, outbox, attempts, process output; loopback round trip 429→200 | **PASS** | `notification-providers.test.ts` (25), process test |
| S06-A5 | controlled live | One H04-authorized Telegram test send to the owner destination with provider receipt | **NOT_RUN** — no `TELEGRAM_BOT_TOKEN`/approved chat ID exists locally; adapter is `fixture-tested`, not `configured`/`live tested`. Runbook: [SENTINEL_HUMAN_ACTIONS.md](SENTINEL_HUMAN_ACTIONS.md) H04 |
| S06-A5e | controlled live | Optional H05 Resend controlled email | **NOT_RUN** — no key / verified sender domain / approved recipient. Adapter `fixture-tested` (mapping, idempotency header, CRLF refusal). |
| S06-A6 | browser + HTTP | Demo previews: zero `/api/sentinel/*`, Telegram, Resend or Meta requests; `orderly-demo`/malformed ids rejected before auth or storage; demo/fixture/observed-scan origins never produce intents | **PASS** | `notification.spec.ts` › S06-A6, `notification-http.test.ts`, `incidents/store.ts` guard |
| S06-A7 | unit + Postgres + process | Revocation (token file removed ⇒ `provider_not_configured`, no request), rotation (new token used by manual retry, no restart), provider 401 ⇒ permanent, consent revoked / destination changed after enqueue ⇒ suppressed and provider not called, invalid/injected destinations rejected, cross-project/cross-scope reads and writes denied | **PASS** | process test, `notification-providers.test.ts`, › S06-A7 |
| N-RLS | Postgres | wrong/unset scope sees 0 rows; notifier sees only `sentinel.outbox` jobs; cross-scope UPDATE affects 0 rows; notifier cannot write channels/consent, cannot change `module_limits`; app cannot forge `provider_accepted`/incident intents or edit/delete audit; worker cannot advance state; `delivered` without evidence, enabled WhatsApp, enabled-without-consent rejected by CHECK even for the owner role | **PASS** | › S06-A7 role/RLS tests |
| N-MIG | Postgres | 0006 up; down refused while rows exist; clean down/up when empty; S05 plan prefix and S04 hash unchanged; S05 acceptance 23/23 | **PASS** | `response.postgres.integration.ts`, `notification…` |
| N-LANE | worker | Real `runNotifier` loop: claims, sends once, clean start/stop (`started→shutdown_requested→stopped`); refuses to start without an approval block (exit 2, no connection) | **PASS** | lane + process tests |
| N-PROC | process | Real `worker/notifier/main.ts` (approval gate: DB name + marker + plan hash + `notifications` block) against loopback mock: session identity `wetscan_sentinel_notifier`, health endpoint secret-free, graceful IPC shutdown (exit 0) | **PASS** | `notification-process.postgres.integration.ts` |
| N-ISO | static | Main worker still strips `TELEGRAM_/RESEND_/WHATSAPP_`; only `worker/notifier/main.ts` imports the providers; no UI/API/worker import of sender code; no credential-shaped literal in source; `provision-roles.sql` untouched | **PASS** | `notification-isolation.test.ts` |
| N-API | API | Auth 401/403/404 before storage, same-origin on POST, strict keys/limits, NOT_CONFIGURED 503 on missing tables, server-derived scope | **PASS** | `notification-http.test.ts` (8) |
| N-UI | browser | Unconfigured state, WhatsApp "Requires business setup · Not configured", enable blocked until a provider-accepted test, minimal payloads, acceptance never shown as delivery, stale-pending hint, retry, NOT_CONFIGURED shown honestly | **PASS** | `notification.spec.ts` (6) |
| N-DEV | dev database | Apply 0005+0006 to the owner dev DB (`127.0.0.1:55432`) and run the notifier there | **NOT_RUN** — would change the existing database's migration hash and invalidate its current approvals; needs the owner's role provisioning + fresh approval (H-S06-ROLE). Throwaway DB used instead. |
| N-LIVE-APP | live application | End-to-end with a real authenticated app session, real GitHub project and real worker/notifier on the owner dev DB | **NOT_RUN** (same reason; S05 live-app testing also still `NOT_RUN`). |

## State semantics actually produced by code
`pending` (queued) → `attempted` → `provider_accepted` | `failed` (+dead letter) | `unknown`; `suppressed` for deliberate non-sends; `delivered` is **never** written by S06 (no provider receipt channel is implemented); `preview` exists only in the demo UI.

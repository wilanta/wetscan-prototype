# Sentinel S06 — Migration Review (`0006_notifications`)

**Status: reviewed + applied/reversed only on throwaway PostgreSQL 17.12. NOT applied to any owner development or production database.**

| Item | Value |
|---|---|
| Migration | `migrations/sentinel/0006_notifications.{up,down}.sql` (additive, no backfill, no replay, no role creation, no password) |
| 0006 checksum | `b9827a692c5a8a0e2e5b12fa7239d702dbbd072c30a89749e35adc99b4592cb8` |
| Full plan sha256 (0001–0006 + both role files) | `82e203965623b099fdd835bff62f94a06ce296c93cb07ea1b5583ede75c11e8c` |
| Reviewed S05 prefix (0001–0005) | `0433347677b0a752cc56966bdb923bfd499241d51bf8b6aceb81fe4a736d9056` (unchanged by S06) |
| Reviewed S04 prefix (0001–0004) | `3438a56e778b30afdd6acf03600638fe31e26c55c2ae5bf63d224f909c429ae7` (unchanged; `provision-roles.sql` was **not** edited) |

## Why the plan hash moved
`migrationPlan()` hashes all migrations **and** `infra/sentinel/provision-roles.sql`. Editing that file would have silently invalidated the accepted S04 review hash, so the new role lives in `infra/sentinel/provision-roles-s06.sql`, which is hashed **only** into plans that contain `0006_notifications`. Existing approvals sealed to the 0001–0005 plan therefore stop matching the *current* repository plan (as S05 already documented): the app and worker need a fresh owner approval before running the new code.

## What it creates
Tables `notification_channels`, `notification_deliveries`, `notification_audit` (FORCE RLS, `mode='live'`); least-privilege GRANTs for `wetscan_app`, `wetscan_sentinel_worker` and the new `wetscan_sentinel_notifier`; RLS policies `notifier_scope`/`notifier_read`/`notifier_lock` on `platform.{jobs,job_attempts,notification_outbox,notification_attempts,module_limits}` and `sentinel.project_bindings` (notifier only; existing policies untouched). It **fails closed** (transaction rolls back) if `wetscan_sentinel_notifier` does not exist.

## Reversal
`down` is refused by the runner (`applyMigrations`) while **any** row exists in the three tables (ACCESS EXCLUSIVE lock first); no CASCADE or force flag. Verified: refusal with data, clean reversal when empty, re-apply, S01–S05 tables survive.

## Owner steps before a dev/staging database can use S06 (human gate H-S06-ROLE)
1. Review `provision-roles-s06.sql`; as the bootstrap admin create `wetscan_sentinel_notifier`, set its **own** password interactively, store it in an ignored file (`SENTINEL_DB_NOTIFIER_PASSWORD_FILE`).
2. Back up the database (`pg_dump`), run `npm run sentinel:db` plan, apply 0005 (if not yet) and 0006 as `wetscan_migrator` against the **approved** target.
3. Issue new `app`/`worker` approvals bound to the new plan hash; for the sender add the `notifications` block (see architecture doc).
4. Never reuse an existing role password for the notifier.

## Verification evidence (throwaway DB, this change set)
See [SENTINEL_S06_VALIDATION.md](SENTINEL_S06_VALIDATION.md): up/down/up cycle, ledger/RLS/role-boundary tests (`tests/sentinel/notification.postgres.integration.ts`), S05 PostgreSQL regression 23/23.

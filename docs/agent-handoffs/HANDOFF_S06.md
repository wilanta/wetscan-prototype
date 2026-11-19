# Handoff — S06 notifications (19 Nov 2026)

**State:** implemented and `DEV accepted` on a throwaway PostgreSQL + loopback mocks. Read [SENTINEL_S06_ARCHITECTURE.md](../SENTINEL_S06_ARCHITECTURE.md) first, then [SENTINEL_S06_VALIDATION.md](../SENTINEL_S06_VALIDATION.md).

## Entry points
- Producer: `src/features/sentinel/notifications/store.ts` (`produceIncidentOpened`, called from `correlateAlertIncident`); app commands: `NotificationStore.command`.
- Sender: `worker/notifier/{main,runtime,handler}.ts` + `notifications/sender-store.ts`; adapters `notifications/providers.ts` (only `notifier/main.ts` may import it — enforced by `notification-isolation.test.ts`).
- Tests: `tests/sentinel/notification*.{test,spec,integration}.ts`. PostgreSQL tests need `SENTINEL_S05_PG_ADMIN_URL=postgres://<admin>@127.0.0.1:<port>/postgres` of a **disposable** server; run `npm run test:sentinel:notifications:postgres`.

## Open owner actions (nothing here was performed)
1. **H-S06-ROLE** — provision `wetscan_sentinel_notifier`, back up, apply 0005/0006 to the dev DB, issue new approvals.
2. **H04** — bot token file + chat ID via the UI, then one test message (A5 `NOT_RUN`).
3. **H05** — optional Resend key/domain/recipient. **H06** — WhatsApp stays unavailable.
4. S05 live-application testing is still `NOT_RUN`; the live `/sentinel/responses` route guard was fixed in this change.

## Do not
- Add provider env to `worker/sentinel/**` or relax its env strip; never import `notifications/providers` elsewhere.
- Write `delivered` without a verified provider receipt (DB CHECK requires `delivery_evidence_ref`).
- Edit `infra/sentinel/provision-roles.sql` (changes the accepted S04 plan hash) or `0006` after review (changes its checksum).
- Use `FOR UPDATE` on the ledger from the app/worker roles (no UPDATE privilege by design).

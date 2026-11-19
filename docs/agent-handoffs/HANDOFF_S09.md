# Handoff — S09 External Intelligence (19 Nov 2026)

**State:** `IMPLEMENTED` and `DEV_ACCEPTED` on an isolated throwaway PostgreSQL 17.12 container + mocked-API Playwright fixtures + a **bounded real-feed smoke test** (`S09-A7`, official CISA/GitHub/OSV endpoints, throwaway DB). **Not** `LIVE_TESTED` against a persistent environment. Persistent `wetscan_dev` upgrade, authenticated real-GitHub-session lockfile collection, worker activation in the owner's environment, scheduled-sync soak, NVD and Guard GRD-020: `NOT_RUN` / `NOT_CONFIGURED` / `DEFERRED`. Read [SENTINEL_S09_ARCHITECTURE.md](../SENTINEL_S09_ARCHITECTURE.md), [SENTINEL_S09_MIGRATION_REVIEW.md](../SENTINEL_S09_MIGRATION_REVIEW.md) and [SENTINEL_S09_VALIDATION.md](../SENTINEL_S09_VALIDATION.md).

## Entry points

- Migration: `migrations/sentinel/0009_external_intelligence.{up,down}.sql` (plan sha256 `94f99d996e08bec042aa11a2295087dd69cd35a64d2fc48211292817b287831c`; migration checksum `0eabf8a6…4f7a`).
- Domain: `src/features/sentinel/external/{model,versions,normalize,feeds,sync,catalog-store,inventory-store,exposure,lockfile,activation,service,status,validation}.ts`.
- Worker: `worker/sentinel/external-sync.ts` (the **only** outbound lane; started from `runtime.ts` only with `SENTINEL_EXTERNAL_INTEL_ENABLED=1` + an `externalIntel` approval block, see `infra/sentinel/external.env.example`).
- API/UI: `src/features/sentinel/server/external-http.ts` + `lockfile-reader.ts`, `/api/sentinel/projects/[projectId]/external`, `components/live-external.tsx` (switch inside the existing `/sentinel/intelligence` page; the S08 case library is unchanged).
- Tests: `tests/sentinel/external-*.test.ts` (unit/API/static), `external.postgres.integration.ts` (`npm run test:sentinel:external:postgres`, needs `SENTINEL_S09_PG_ADMIN_URL` for a **throwaway local** server), `external-live-smoke.live.integration.ts` (`npm run test:sentinel:external:live`, **opt-in** `SENTINEL_S09_LIVE_SMOKE=1`, bounded real network + throwaway DB), `external.spec.ts` (`npx playwright test -c tests/sentinel/external.playwright.config.ts --retries=0`).

## Open operational items

1. Persistent `wetscan_dev` (`127.0.0.1:55432`) was **not inspected or changed** (no approval files/role passwords available to the agent). Likely at S04. Needs backup, `H-S06-ROLE`, `0005`–`0009`, new sealed approvals bound to the plan hash above (`H-S09-DEVDB`).
2. Turning the worker lane on in any real environment requires the owner's `H08` decisions (cadence, retention, optional token file) and the `externalIntel` approval block. Until then manual `POST {action:"sync"}` only queues jobs that nothing executes — the UI says so and shows the queued count.
3. S01–S04 approval-bound PostgreSQL scripts (`test:platform:postgres`, `test:sentinel:postgres`) stay `NOT_RUN` (sealed approvals are bound to the plan hash, which changed).
4. **Activation scope:** like S05, the worker lane claims manual sync jobs only for the single approved `externalIntel` project scope. Sync requests queued by any other project are never executed (the catalog is global, so they are redundant) and their "queued" counter in that project's UI does not drain; per-project queue cap is 1000. Choose the owner's primary project as the approved scope (`H08`).
5. GRD-020: `not_integrated`. When a producer exists, write snapshots through a new `source_kind` (needs a migration to widen the CHECK) and map Guard `InventoryItem` ecosystems to `model.ts#Ecosystem`; `exposure.ts` already treats a snapshot as the unit of evidence.
6. Open questions for the owner: GHSA token (raises 60→5000 req/h), cadence (default 6 h), whether OSV `querybatch` with project package versions is acceptable (`H-S09-OSV-QUERY`, default **no**), retention of withdrawn/removed advisories (kept forever today, bounded by the 300 000 cap).

## Do not

- Import `external/feeds.ts` or `external/sync.ts` from anything that runs in the web process, or call `fetch` from a route/page for advisory data (`external-http.test.ts` static guards fail).
- Persist exposures, or let the API say "safe", "clean", "no vulnerabilities", "exploited", "compromised", or imply deployment. Missing/expired/unsupported evidence is `cannot_assess` / "not assessed".
- Merge two providers' ranges into one assertion, or drop a provider's row when another disagrees.
- Add a Guard-sourced `source_kind`, fixture inventory, or an NVD key path without a new `HUMAN_REQUIRED` gate and a proven producer.
- Create telemetry events/alerts/incidents/responses/notifications from advisory data (S10 may _link_ potential exposure to incidents, never auto-create them).
- Widen `allowedProvider` casually: every new endpoint is an SSRF decision (exact host + path, no redirects, bounded size/time).
- Reuse migration number `0009`; S10+ must use `0010_*` and re-run the plan-hash review. Do not edit `0009` after release (the file is hashed into every plan).
- Use `TRUNCATE`/`DROP`/`migrate:*` against `wetscan_dev`; the PG suites only ever touch disposable `s09_<random>` databases on a local throwaway container.

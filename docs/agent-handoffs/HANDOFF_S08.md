# Handoff — S08 Internal Intelligence (19 Nov 2026)

**State:** `IMPLEMENTED` and `DEV_ACCEPTED` on an isolated throwaway PostgreSQL 17 container + mocked-API Playwright fixtures. Persistent `wetscan_dev` upgrade, authenticated browser E2E against real GitHub sessions, and any AI provider: `NOT_RUN` / `NOT_CONFIGURED`. Read [SENTINEL_S08_ARCHITECTURE.md](../SENTINEL_S08_ARCHITECTURE.md), [SENTINEL_S08_MIGRATION_REVIEW.md](../SENTINEL_S08_MIGRATION_REVIEW.md) and [SENTINEL_S08_VALIDATION.md](../SENTINEL_S08_VALIDATION.md).

## Entry points

- Migration: `migrations/sentinel/0008_internal_intelligence.{up,down}.sql` (plan sha256 `7ac3e11c4f1fc3caf30e782f2e8e3b73d1a6cdf19438d722bf3cb1d805733012`).
- Domain: `src/features/sentinel/intelligence/{model,grouping,validation,store,case-library}.ts`.
- API/UI: `src/features/sentinel/server/intelligence-http.ts`, `/api/sentinel/projects/[projectId]/intelligence` (GET overview / `?caseId=` detail with filters `status,shelf,tag,category,origin,q`; POST commands `archive, tag, annotate, set_status, set_shelf, propose, review, validate, promote`), `components/live-intelligence.tsx` at `/app/projects/github-<id>/sentinel/intelligence`.
- S07 seam now implemented: `createCaseLibraryPort(store)` implements `CaseLibraryPort` (the DB incident is authoritative; source/category/origin/evidence/Ghost-hit ids must match). `unavailableCaseLibrary` is intentionally left in place as S07 history.
- Tests: `tests/sentinel/intelligence-{grouping,validation,migrations,http,port}.test.ts`, `intelligence.postgres.integration.ts` (`npm run test:sentinel:intelligence:postgres`, needs `SENTINEL_S08_PG_ADMIN_URL` for a **throwaway local** server), `intelligence.spec.ts` (`npx playwright test -c tests/sentinel/intelligence.playwright.config.ts --retries=0`).

## Open operational items

1. Persistent `wetscan_dev` (`127.0.0.1:55432`) was **not inspected or changed**. Likely still at S04. Needs backup, `H-S06-ROLE`, `0005`–`0008`, new sealed approvals (see migration review).
2. S01–S04 approval-bound PostgreSQL scripts (`test:platform:postgres`, `test:sentinel:postgres`) were `NOT_RUN`: they require owner-sealed approvals bound to the plan hash, which changed with `0008`. Their behavior is covered indirectly by the S05/S06/S07/S08 PostgreSQL suites (which migrate the full plan from scratch) and the unit suites.
3. Case-expiry/retention policy for cases themselves is deferred (cases are kept; bounded 1000/project).
4. If an AI provider is ever wanted: new `HUMAN_REQUIRED` gate first; implement `AIExplanationPort` behind `redactedGroupSummary`; keep output "untrusted, draft-only".

## Do not

- Add a code path from S08 to `DetectionStore.command({action:"enable"})`, or let a candidate/AI output set a rule `ENABLED`.
- Add FKs from case tables to `incidents`/`telemetry_events` (breaks S04/S02 retention) or copy raw telemetry/actor data into cases.
- Group across `origin` or across projects; persist groups; widen a proposal to cover indicators it cannot express.
- Treat `archive`/`shelve`/`dismiss` as resolved, mitigated or neutralized anywhere in UI or docs.
- Touch `src/domain/demo.ts`, the Orderly Demo Intelligence screen, or give demo state a path to the live API.
- Reuse migration number `0008` for S09; use `0009_*` and re-run the plan-hash review.

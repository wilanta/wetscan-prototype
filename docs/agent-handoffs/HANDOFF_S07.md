# Handoff — S07 Ghost Lite (19 Nov 2026)

**State:** `IMPLEMENTED` and `DEV_ACCEPTED` on isolated PostgreSQL 17.12 + loopback decoy/ingest fixtures + real worker + real CLI process + Playwright UI fixtures. External staging & persistent `wetscan_dev` upgrade: `NOT_RUN`. Read [SENTINEL_S07_ARCHITECTURE.md](../SENTINEL_S07_ARCHITECTURE.md), [SENTINEL_S07_MIGRATION_REVIEW.md](../SENTINEL_S07_MIGRATION_REVIEW.md), and [SENTINEL_S07_VALIDATION.md](../SENTINEL_S07_VALIDATION.md).

## Entry points

- Migration: `migrations/sentinel/0007_ghost.{up,down}.sql` (plan SHA-256 `338db7cafabbb54304ff2944048b3f3c7b21ca78cabbc704a2c61117e2a82038`).
- Decoy module & loopback CLI: `src/features/sentinel/ghost/decoy.ts`, `scripts/sentinel-ghost-fixture.ts` (`npm run sentinel:ghost:fixture`), env template `infra/sentinel/ghost.env.example`.
- Store & validation: `src/features/sentinel/ghost/{model,validation,store}.ts`.
- API & UI: `src/features/sentinel/server/ghost-http.ts`, `src/app/api/sentinel/projects/[projectId]/ghost/route.ts`, `src/features/sentinel/components/live-ghost.tsx`, mounted at `/app/projects/github-<id>/sentinel/ghost`.
- Future S08 typed seam: `CaseLibraryPort` / `CaseLibraryArchiveCandidateV1` / `GhostDecoyHitSummaryV1` in `src/features/sentinel/contracts.ts`, `unavailableCaseLibrary` in `src/features/sentinel/integrations.ts`.
- Tests: `tests/sentinel/ghost*.test.ts`, `tests/sentinel/ghost.postgres.integration.ts` (`npm run test:sentinel:ghost:postgres`), `tests/sentinel/ghost.spec.ts` (`npx playwright test -c tests/sentinel/ghost.playwright.config.ts --retries=0`).

## Open operational items (not performed on persistent `wetscan_dev`)

1. Persistent `wetscan_dev` on `127.0.0.1:55432` remains untouched at S04 until owner executes `H-S06-ROLE` (`wetscan_sentinel_notifier` creation + backup + `0005`–`0007` migrations + new sealed approvals for plan `338db7cafabbb54304ff2944048b3f3c7b21ca78cabbc704a2c61117e2a82038`).
2. External staging decoy testing requires owner-approved HTTPS exposure and target configuration (`G-STAGING` `NOT_RUN`).

## Do not

- Auto-enable `controlled-decoy-v1` globally or in migrations/worker startup.
- Auto-enable `sentinel.ghost_decoys.enabled` on creation or store raw IPs, cookies, passwords, tokens, authorization headers, or request bodies.
- Allow Ghost decoy hits to automatically trigger S05 response actions or bypass S06 notification consent/origin policies.
- Modify `src/domain/demo.ts` or Demo `Ghost()` network behavior.

# Handoff — S10 UI / Canvas / Reports integration (19 Nov 2026)

**State:** `IMPLEMENTED` and `DEV_ACCEPTED` on mocked-transport Playwright fixtures + an isolated throwaway PostgreSQL 17.12 container. **No migration** (head stays `0009_external_intelligence`). **Not** `LIVE_TESTED`: authenticated real-GitHub-session E2E, persistent `wetscan_dev` upgrade and owner-environment worker activation are `NOT_RUN`. GRD-020/021: `not_integrated`. Read [SENTINEL_S10_ARCHITECTURE.md](../SENTINEL_S10_ARCHITECTURE.md), [SENTINEL_S10_ROUTE_MATRIX.md](../SENTINEL_S10_ROUTE_MATRIX.md), [SENTINEL_S10_INTEGRATION_MATRIX.md](../SENTINEL_S10_INTEGRATION_MATRIX.md), [SENTINEL_S10_VALIDATION.md](../SENTINEL_S10_VALIDATION.md).

## Entry points

- CAN-008: `src/features/sentinel/canvas/{mapping,overlay-store}.ts`, `server/canvas-overlay-http.ts`, `GET /api/sentinel/projects/[projectId]/canvas?revision=`, client `src/features/canvas/adapters/sentinel-overlay.ts`, UI `canvas/components/sentinel-coverage.tsx` + `inspector.tsx`/`views/canvas.tsx` edits, wiring in `canvas/components/live-canvas.tsx` (`ports.overlays`). Additive optional fields on `IncidentSummary`/`SecurityOverlay` (`canvas/types.ts`).
- Reports: `src/features/sentinel/reports/{live-report,collect}.ts`, `server/report-http.ts`, `GET /api/sentinel/projects/[projectId]/report`.
- UI: `components/live-nav.tsx` (single tab strip), `components/live-overview.tsx` (`LiveOverview`, `LiveReports`), dispatcher `views/sentinel.tsx`, allow-list in `sentinel/[[...section]]/page.tsx` (`reports`), project-aware `components/app-shell.tsx`, print CSS in `globals.css`.
- Tests: `tests/sentinel/{canvas-mapping,canvas-overlay-http,canvas-overlay-client,live-report}.test.ts`, `s10.spec.ts` (+ `s10.playwright.config.ts`, fixtures `tests/canvas/fixture/s10-graph.ts` and `app/app/projects/github-123/{canvas,sentinel}`), `s10.postgres.integration.ts` (`npm run test:sentinel:s10:postgres`, needs `SENTINEL_S08_PG_ADMIN_URL` for a **throwaway local** server).

## Do not

- Place an incident on a node without a unique route-evidence match, use inferred/manual nodes as targets, or cache an overlay across revisions. Missing/failed data is never "available".
- Add demo links, demo counts or demo reset to real-project chrome; never fetch `/api/sentinel*` from a demo route.
- Copy raw store rows into the report: extend the whitelist builders in `reports/collect.ts` and add a canary to `live-report.test.ts`.
- Edit `0009` or reuse its number; S11+ migrations start at `0010`.
- Run the PG suites against `127.0.0.1:55432` (persistent dev DB).

## Open items for the owner

1. `H-S10-DEVDB`, `H-S10-E2E`, `H-S10-GUARD` in [SENTINEL_HUMAN_ACTIONS.md](../SENTINEL_HUMAN_ACTIONS.md).
2. If route coverage is too low in practice, consider SDK-supplied component ids (ADR-1 option B; needs a migration and an attestation design).
3. The legacy `Integrations` and `Guard` pages remain demo pages (badged DEMO) on real projects.

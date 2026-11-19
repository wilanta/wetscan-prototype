# Sentinel S07 — Ghost Lite Authorized Decoy & Evidence Pipeline

**Status: DEV accepted on an isolated throwaway PostgreSQL 17.12 + real loopback decoy fixture (`127.0.0.1`) + real `runSentinelWorker` + real CLI process (`scripts/sentinel-ghost-fixture.ts`) (19 Nov 2026). External staging target: NOT_RUN (no external staging host configured). Persistent dev DB (`wetscan_dev`) migration: NOT_RUN (awaiting `H-S06-ROLE` + 0005–0007 upgrade and fresh owner approvals).**

## Architecture summary

Ghost Lite reuses the existing S02 telemetry ingestion pipeline, S03 deterministic detection engine (`controlled-decoy-v1`), and S04 correlated incident/evidence store rather than introducing a second deception platform, ingestion route, or detection engine:

```mermaid
sequenceDiagram
  participant C as Caller / Controlled Hit
  participant D as Loopback Decoy (127.0.0.1 /__wetscan/ghost-decoy)
  participant I as S02 Ingest (/api/sentinel/ingest)
  participant W as Sentinel Worker (controlled-decoy-v1)
  participant UI as Live Ghost UI (/sentinel/ghost)

  C->>D: HTTP request (no body/secrets stored)
  Note over D: Default-disabled; bounded rate limit & correlation-ID dedupe
  D->>I: referenceEmitter -> SentinelEventV1 (kind=ghost.decoy_triggered)
  I->>I: Schema validation, route/attribute redaction, replay dedupe, enqueue job
  W->>W: Evaluate controlled-decoy-v1 (explicitly ENABLED for project)
  W->>W: Create/dedupe alert & correlate S04 incident + timeline + evidence
  UI->>I: GET /api/sentinel/projects/[projectId]/ghost (GhostStore.overview)
```

### Why this design was chosen

1. **Isolated decoy boundary + S02 emitter reuse (`src/features/sentinel/ghost/decoy.ts`)**: Exposes a reusable Node HTTP handler (`createGhostDecoyHandler`) and loopback-only fixture (`startGhostFixture`, CLI `scripts/sentinel-ghost-fixture.ts`) bound strictly to `127.0.0.1` instead of registering a public route inside the main Next.js production app.
2. **Additive configuration & audit only (`migrations/sentinel/0007_ghost.{up,down}.sql`)**: Stores per-project decoy configuration (`sentinel.ghost_decoys`, `enabled DEFAULT false`) and append-only lifecycle audit (`sentinel.ghost_audit`) with `FORCE ROW LEVEL SECURITY` and foreign keys to `sentinel.telemetry_sources` and `sentinel.project_bindings`. All events, alerts, and incidents live in existing S02–S04 tables with zero duplication.
3. **Rule reuse (`controlled-decoy-v1`)**: Preserves `controlled-decoy-v1` as an opt-in `DRAFT` seed in `src/features/sentinel/detection/seeds.ts`. Only explicit owner/operator rule enablement in a specific project activates detection; production and unrelated projects remain in `DRAFT`.

## Safety & privacy controls

- **Safe default-disabled state**: `createGhostDecoyHandler` defaults to `enabled: false`, `sentinel.ghost_decoys.enabled` defaults to `false`, and `scripts/sentinel-ghost-fixture.ts` exits `2` (`ghost_opt_in_required`) unless both `SENTINEL_GHOST_ENABLED=1` and `SENTINEL_GHOST_OWNED_APP_CONFIRMED=1` are set alongside an absolute `SENTINEL_INGEST_CREDENTIAL_FILE` and loopback `SENTINEL_INGEST_ENDPOINT`.
- **Forbidden metadata never retained**: Decoy handler immediately drains/discards request bodies (`req.resume()`), never reads/forwards `Authorization`, `Cookie`, `X-Forwarded-For`, `Forwarded`, query strings, or `socket.remoteAddress`, and never returns secrets or credentials in HTTP responses.
- **Strict route and attribute allowlist (`src/features/sentinel/telemetry/validation.ts`)**: `staticSegments` includes `__wetscan`, `ghost-decoy`, and `.well-known` so `/__wetscan/ghost-decoy` stays legible while trailing segments, queries, and fragments still redact to `:redacted`. Optional Ghost attributes (`decoyPathCategory`, `signalClassification`, `correlationId` UUID) reject non-allowlisted values.
- **Crawler & false-positive handling**: Known scanner/bot `User-Agent` headers map in-memory to `signalClassification: "automated_crawler_or_scanner"` without storing the raw header. Decoy hits are explicitly labeled as suspicious signals, never proof of compromise, and never trigger automated blocking, S05 responses, or S06 notifications.
- **Replay & flood protection**: Correlation IDs (`x-wetscan-correlation-id` UUID) are deduplicated at the decoy boundary (`dedupeWindowMs`, bounded cache), S02 batch/event IDs deduplicate at ingestion, S03 `windowSeconds: 60` + `cooldownSeconds: 60` coalesce hits into a single alert/incident without incident spam, and per-decoy `rateLimitPerMinute` (`1..120`, default `30`) plus `maxInFlight` (`8`) bound decoy traffic.

## API, UI & module boundaries

- **API**: `GET` / `POST /api/sentinel/projects/[projectId]/ghost` (`src/features/sentinel/server/ghost-http.ts`) — server-derived scope, same-origin CSRF check on `POST`, `orderly-demo` and malformed project IDs rejected `404` before auth/storage, `42P01` mapped to `503 ghost_not_configured`, unique conflicts mapped to `409 decoy_conflict`.
- **Live UI**: `src/features/sentinel/components/live-ghost.tsx` mounted at `/app/projects/github-<id>/sentinel/ghost` via `src/app/app/projects/[projectId]/sentinel/[[...section]]/page.tsx` and `src/components/views/sentinel.tsx`. Displays decoy/source connectivity, enabled/disabled state, `controlled-decoy-v1` rule status, hit history with redacted payload inspection, evidence-backed alerts, linked incidents, false-positive notices, and honest `NOT_CONFIGURED` / unconfigured / error states.
- **Demo isolation**: `src/domain/demo.ts`, `src/components/demo-provider.tsx`, and `Ghost()` in `src/components/views/sentinel.tsx` remain untouched and perform zero `/api/sentinel/*` or external requests.
- **Future S08 typed seam**: `GhostDecoyHitSummaryV1`, `CaseLibraryArchiveCandidateV1`, and `CaseLibraryPort` in `src/features/sentinel/contracts.ts` plus `unavailableCaseLibrary` in `src/features/sentinel/integrations.ts` (`status: "not_integrated", backlogId: "S08"`). S08 is not implemented in S07.

## Known limitations

1. **Loopback-only reference emitter**: `referenceEmitter` and `startGhostFixture` enforce `127.0.0.1` / `localhost` HTTP ingestion; external staging deployments require a separately approved HTTPS transport configuration.
2. **In-memory decoy boundary dedupe/rate-limit**: Per-process correlation-ID dedupe cache and minute rate-limit reset if the fixture process restarts; durable deduplication and rate limiting remain enforced in PostgreSQL by S02 `telemetry_batches`/`telemetry_events`/`telemetry_sources` and S03 `detection_alerts`/`detection_cooldowns`.
3. **False positives**: Any HTTP client, health check, or crawler hitting `/__wetscan/ghost-decoy` emits `ghost.decoy_triggered`; operators must review provenance (`controlled_test` vs `runtime`) and evidence before acting.
4. **Persistent dev DB**: `wetscan_dev` on `127.0.0.1:55432` was not modified because S06 `H-S06-ROLE` (`0005` + `0006` + `wetscan_sentinel_notifier` + new sealed approval hashes) is still pending owner execution.

# S10 Architecture — UI / Canvas / Reports integration

Status: `IMPLEMENTED`, `DEV_ACCEPTED` (isolated PostgreSQL 17.12 + mocked-transport browser fixtures). **No migration** (0009 remains the head). **Not** `LIVE_TESTED`: authenticated real-GitHub-session E2E, persistent `wetscan_dev`, and owner-environment worker activation are `NOT_RUN`.

## Principle

Every live visual claim is derived on the server from persisted, scope-authorized records, or it is shown as unavailable. The browser never supplies scope, project, revision authority or evidence; it only *pins* the revision it is displaying and the server verifies that pin against the authorized Canvas cache.

## What S10 adds (reuse first)

| Concern | Reused unchanged | Added (S10) |
| --- | --- | --- |
| AuthN/Z | `authorizeSentinelProject`, `canvasIdentity`, Canvas grant re-validation | — |
| Storage | `telemetryStore().db` (forced RLS, `wetscan_app`), existing stores | `canvas/overlay-store.ts` (one scoped read), `reports/collect.ts` (bounded `GROUP BY` + existing store reads) |
| Canvas | graph cache, `SentinelIncidentOverlaySource`-shaped seam, `validateSecurityOverlay`, `scopeSecurity`, renderer, inspector | `sentinel/canvas/mapping.ts`, `server/canvas-overlay-http.ts`, route `…/canvas`, `canvas/adapters/sentinel-overlay.ts`, `components/sentinel-coverage.tsx`; additive optional fields on `IncidentSummary`/`SecurityOverlay` |
| UI shell | `AppShell`, `Sentinel` dispatcher, live components, design system | `components/live-nav.tsx`, `live-overview.tsx` (Overview + Reports), project-aware sidebar/topbar |
| Reports | demo `Reports` (untouched) | `reports/live-report.ts`, `server/report-http.ts`, route `…/report` |

No second queue, database, OAuth store, graph engine, Sentinel shell or demo reducer change. `src/domain/demo.ts` and `demo-provider.tsx` are untouched.

## Answer to the owner's architecture question

*How can S05–S09 be integrated into the existing Sentinel/Canvas UI with minimal changes and without presenting demo information as live evidence?* — S05–S09 already had live components behind the existing dispatcher; the gap was (1) discoverability (six inconsistent tab lists, no live Overview/Reports, demo links in the real-project chrome), (2) Canvas never receiving an overlay source, and (3) no cross-module summary. S10 therefore: keeps one dispatcher keyed on `projectId` (live) vs absent (demo); replaces the tab lists by one component; aggregates module state server-side into a single whitelisted report that both Overview and Reports consume; and passes a Sentinel-backed `CanvasOverlaySource` into the existing `LiveCanvas → Canvas` `ports.overlays` seam. Demo isolation is structural (different components, no shared fetch path) and test-proven (zero `/api/sentinel`/`/api/canvas` calls from demo routes).

## ADR-1 — Where incidents are mapped to graph nodes

| Option | Trade-offs |
| --- | --- |
| **A (chosen): server-side, route-evidence matching against the pinned authorized graph** | Uses only persisted evidence (`routeTemplate`, method) and source-observed `api` nodes; deterministic, explainable (`basis`), fail-closed (ambiguity → not placed); no new schema. Limited coverage: only incidents whose events carry a route, and redaction makes some matches weaker/ambiguous. |
| B: let producers/SDK emit a node id | Higher fidelity but a producer-controlled claim; needs a schema change (migration), an attestation story, and would trust the sender with graph identity. Rejected for S10; revisit if SDK sends an authenticated component id. |
| C: client-side mapping | Would hand evidence to the browser and trust browser state. Rejected. |

Impact: S01–S04 unchanged (read-only SQL); interface to Canvas is the existing `SecurityOverlay` + optional additive fields.

## ADR-2 — Overview/Reports data path

| Option | Trade-offs |
| --- | --- |
| **A (chosen): one server aggregate (`/report`) reused by Overview and Reports** | One authorization + one bounded transaction for counts; each module section fails independently (`not_configured`/`unavailable`), never as zero; fixed whitelist = redaction by construction; same payload powers export. Cost: Overview shows the 24 h window; module detail stays in module views. |
| B: Overview fires N client fetches to existing module APIs | No new code server-side but a fetch waterfall, N authorizations, and per-module raw shapes (actor ids, destinations) reach the browser. Rejected. |

## Threat model (S10-specific)

| Threat | Control | Test |
| --- | --- | --- |
| Cross-project/workspace read via crafted ids | scope only from session; route id regex; forced RLS; overlay graph `projectRef` must equal the authorized context | `canvas-overlay-http.test.ts`, `s10.postgres.integration.ts` (3 scopes + unscoped connection) |
| Revoked access between auth and read | Canvas cache read re-authorizes; revocation → 404, no storage touched | "revocation between authorization and graph read" |
| Stale/foreign mapping shown as current | pinned `revision`; server compares to cached graph; client rejects mismatched `sourceRevision`/`projectRef`/mode | `canvas-overlay-client.test.ts`, browser tests |
| Fabricated or guessed placement | single-candidate rule; inferred nodes excluded; unmapped listed separately | `canvas-mapping.test.ts` |
| False green | `available` needs all enabled sources connected + runtime source + nothing unplaced; empty/failed ≠ safe; per-section state | mapping + report + browser tests |
| Sensitive data in reports/exports | whitelist builders; canary tests for destination/actor/provider ids; no raw events | `live-report.test.ts`, PG test |
| CSV formula injection | quote all, `'`-prefix `= + - @ TAB CR` | `live-report.test.ts` |
| Demo contamination | separate components/fetch paths; project-aware chrome; demo project id rejected by APIs | `s10.spec.ts` S10-A1 |
| Resource exhaustion | ≤100 incidents, ≤50 evidence/incident, ≤5000 evidence rows, ≤2000 CSV rows, window ∈ {1,7,30}; single shared aggregate; 20–30 s client timeouts; no polling | unit + PG |
| Crash/retry/idempotency | read-only endpoints; no writes, no jobs, no migration → nothing to replay | PG "read-only" test |
| Concurrent agents | additive files; small edits to shared seams (`app-shell`, `sentinel.tsx`, `canvas.tsx`, `inspector.tsx`, `live-canvas.tsx`, five `live-*` nav blocks); rollback = revert the S10 commits | git |

## Known limitations (honest)

1. CAN-008 places only route-bearing incidents; redacted route segments can make a match weaker or ambiguous (reported, not guessed). Decoy/Ghost incidents (decoy paths are not graph nodes) appear as "not placed".
2. The overlay is computed per request from the cached graph; there is no persistence of mappings (by design, no migration).
3. Report counts reflect each module's retention limits and the "most recent N" caps stated per section (notifications 100, responses 50).
4. Exports are JSON/CSV plus the browser print view; no PDF renderer was added.
5. The Overview issues one request, but `Telemetry`, `Alerts` and `Incidents` sections share a single aggregate transaction; other sections read their own stores (≈ 8 scoped reads per page view). Acceptable for the current scale; cache if it ever matters.
6. `Integrations`/`Guard` sidebar entries for real projects remain demo pages (badged **DEMO**).

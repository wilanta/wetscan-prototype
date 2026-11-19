# S10 Route / Navigation / Producer Matrix

Status: `IMPLEMENTED`, `DEV_ACCEPTED` on mocked-transport browser fixtures + isolated PostgreSQL (see [SENTINEL_S10_VALIDATION.md](SENTINEL_S10_VALIDATION.md)). Authenticated real-session E2E: `NOT_RUN`.

Dispatcher: `src/app/app/projects/[projectId]/sentinel/[[...section]]/page.tsx` (authorization + allow-list) → `src/components/views/sentinel.tsx#Sentinel`. A `projectId` prop selects a **live** view; no `projectId` selects the preserved **demo** view. The two never share data: demo views read `DemoProvider`, live views only call `/api/sentinel/projects/<projectId>/…` and `/api/canvas/<projectId>`.

## Live project (`/app/projects/github-<id>/…`) — mode `live`

| Route | Component | Producer / endpoint | Scope source | Actions | Evidence & provenance | Failure / empty states | Missing / deferred |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `/sentinel` (Overview) | `LiveOverview` (new) | `GET …/report?days=1` (aggregates of S02–S09 stores) | session → `authorizeSentinelProject` | read; links to modules | per-section `asOf`, origin counts (runtime vs controlled test) | loading, error + retry, per-section `not_configured` / `unavailable`; "no connected source" banner | none |
| `/sentinel/activity` | `LiveTelemetry` | `…/events`, `…/sources` | same | filter, page, inspect redacted event | origin, source, ingest time | error text per status, empty | — |
| `/sentinel/sources` | `LiveTelemetry` | `…/sources` (GET/POST) | same | create/rotate/disable source (existing) | origin/environment | — | — |
| `/sentinel/rules`, `/alerts` | `LiveDetection` | `…/rules`, `…/alerts` | same | existing rule lifecycle | rule version, evidence | — | — |
| `/sentinel/incidents[/<uuid>]` | `LiveIncidents` | `…/incidents` | same | triage/close (existing) | evidence timeline | — | verification stays `not_requested` |
| `/sentinel/responses` | `LiveResponses` | `…/responses` | same | propose/approve/rollback (existing) | `applied` ≠ `verified` | `response_not_configured` | enforcement needs owner H03 |
| `/sentinel/notifications` | `LiveNotifications` | `…/notifications` | same | channel config (existing) | provider acceptance ≠ delivery | `notifications_not_configured` | sender process needs owner approval |
| `/sentinel/ghost` | `LiveGhost` | `…/ghost` | same | decoy config (existing) | origin, FP notice | `ghost_not_configured` | decoy activation is owner-gated |
| `/sentinel/intelligence` | `LiveIntelligence` (+`LiveExternal`) | `…/intelligence`, `…/external` | same | archive/review (S08), manual sync request (S09) | case/advisory provenance | `*_not_configured` | NVD, Guard GRD-020 |
| `/sentinel/reports` | `LiveReports` (new) | `GET …/report?days=1\|7\|30[&format=json\|csv&download=1]` | same | window filter, JSON/CSV export, print | scope, generatedAt, per-section state, limitations | error + retry | PDF (not needed) |
| `/canvas` (+ Security lens) | `LiveCanvas` → `Canvas` | `/api/canvas/<id>` (graph) + `GET …/canvas?revision=` (CAN-008 overlay) | session; revision pinned | select node, open incident | route evidence → API node; unmapped listed | `not_monitored`/`partial`/`stale`/`failed`/`unavailable` labels | Guard trust/workflow lenses `not_integrated` |
| Integrations (sidebar) | global `/app/integrations` | demo fixtures | n/a | — | **DEMO** badge on real projects | — | live status is in Overview/Reports (CAN-008, GRD-020/021) |
| Guard (sidebar) | demo | — | — | — | **DEMO** badge | — | GRD-020/021 producers |

Sidebar (real project): Sentinel children `Incidents · Responses · Ghost · Intelligence`; MANAGE `Notifications`, `Reports` are project-aware (they link to the live views above, never to the demo pages). Topbar bell links to live Notifications and shows **no** demo preview count. The demo "Reset demo" button is hidden on real projects. One shared tab strip (`components/live-nav.tsx#LiveSentinelNav`) replaced six divergent hard-coded lists; it sets the `active` class and `aria-current`.

## Orderly Demo (`/app/projects/orderly-demo/…`, `/app/notifications`, `/app/integrations`, `/app/reports`) — mode `demo`

| Route | Component | Producer | Notes |
| --- | --- | --- | --- |
| `/sentinel`, `/activity`, `/incidents`, `/responses` | `DemoSentinel` | `DemoProvider` reducer | unchanged; "Demo simulation only" notice |
| `/sentinel/incidents/INC-n`, `/ghost`, `/intelligence` | `IncidentDetail`, `Ghost`, `Intelligence` | `DemoProvider` | unchanged |
| `/canvas` | `Canvas` (demo source) | demo overlay source | unchanged |
| `/app/notifications`, `/app/integrations`, `/app/reports` | `manage.tsx` | demo fixtures | unchanged; demo Reports stays synthetic |

Isolation proof: `s10.spec.ts` "demo routes issue zero Sentinel/Canvas live API calls" and `/api/sentinel/projects/orderly-demo/report` → 404.

## Unknown / forbidden / revoked

`page.tsx` allow-lists sections (404 otherwise), authorizes with the existing GitHub/Canvas grant, and shows no telemetry on any failure. Every API route re-runs `authorizeSentinelProject`; the overlay route additionally re-authorizes the Canvas graph read. Responses never distinguish forbidden from missing (404).

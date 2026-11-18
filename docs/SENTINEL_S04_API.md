# S04 authenticated incident and investigation timeline API

All S04 endpoints are mounted under `/api/sentinel/projects/github-<repositoryId>/incidents` (`src/app/api/sentinel/projects/[projectId]/incidents/route.ts` and `src/features/sentinel/server/incident-http.ts`).

---

## 1. Authentication, Authorization, and Wire Guards

1. **Project Format & Demo Separation**:
   - Only `^github-[1-9]\d{0,15}$` route parameters are accepted. `orderly-demo`, `github-0`, and malformed IDs return `404 { error: "not_found" }` before any authority or database call.
2. **Server-Derived Scope**:
   - Every request resolves the current session token (`requestToken`), verifies GitHub/Canvas identity (`canvasIdentity`), and authorizes repository access via `authorizeSentinelProject(token, { mode: "live", workspaceId: workspaceScope(profile), projectId })`.
   - Unauthenticated requests return `401 { error: "unauthenticated" }`. Unauthorized or non-existent projects return `404 { error: "not_found" }` (preventing project enumeration).
   - `mode`, `workspaceId`, `projectId`, and `actorId` are never accepted from query parameters, headers, or JSON request bodies.
3. **CSRF & Payload Bounds**:
   - `POST` requests enforce `requireOrigin(request)` before session or database calls; cross-origin writes return `403 { error: "invalid_origin" }`.
   - `POST` requests forbid query parameters (`400 { error: "invalid_query" }`) and stream at most `8192` bytes (`413 { error: "payload_too_large" }`) with `Content-Type: application/json` and a 5-second body read timeout.
   - Unsupported HTTP methods (`PUT`, `PATCH`, `DELETE`, etc.) return `405 { error: "method_not_allowed" }`.
   - All responses set `Cache-Control: no-store`, `Referrer-Policy: no-referrer`, and `X-Content-Type-Options: nosniff`. Database or configuration unavailability returns a sanitized `503 { error: "not_configured" | "service_unavailable" }`.

---

## 2. Endpoints

### `GET /api/sentinel/projects/[projectId]/incidents` (List Incidents)

Returns a cursor-paginated page of persisted incidents in descending `(last_observed_at, incident_id)` order:

```json
{
  "items": [
    {
      "mode": "live",
      "workspaceId": "github-user-7:fixture",
      "projectId": "github-123",
      "schemaVersion": 1,
      "incidentId": "00000000-0000-5000-a000-000000000001",
      "sourceId": "00000000-0000-4000-8000-000000000001",
      "primaryAlertId": "00000000-0000-4000-8000-000000000003",
      "ruleId": "00000000-0000-4000-8000-000000000002",
      "ruleVersion": 2,
      "ruleName": "HTTP error burst",
      "title": "HTTP error burst (Controlled test)",
      "summary": "Repeated 500 responses Matched 5 http event(s) on source 00000000-0000-4000-8000-000000000001.",
      "category": "http",
      "severity": "high",
      "status": "open",
      "verificationStatus": "not_requested",
      "archived": false,
      "origin": "controlled_test",
      "correlationKey": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "deduplicationKey": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      "alertIds": ["00000000-0000-4000-8000-000000000003"],
      "evidenceIds": ["telemetry:00000000-0000-4000-8000-000000000001:00000000-0000-4000-8000-000000000011"],
      "evidenceRefs": [
        {
          "id": "telemetry:00000000-0000-4000-8000-000000000001:00000000-0000-4000-8000-000000000011",
          "sourceId": "00000000-0000-4000-8000-000000000001",
          "origin": "controlled_test",
          "occurredAt": "2026-11-15T00:00:00.000Z",
          "recordedAt": "2026-11-15T00:00:00.000Z"
        }
      ],
      "occurredAt": "2026-11-15T00:00:00.000Z",
      "firstObservedAt": "2026-11-15T00:00:00.000Z",
      "lastObservedAt": "2026-11-15T00:00:00.000Z",
      "openedAt": "2026-11-15T00:00:00.000Z",
      "updatedAt": "2026-11-15T00:00:00.000Z",
      "closedAt": null,
      "closedBy": null,
      "closeReason": null,
      "lastActorId": "system:sentinel-worker",
      "revision": 1
    }
  ],
  "nextCursor": null,
  "window": {
    "from": "2026-11-14T00:10:00.000000Z",
    "to": "2026-11-15T00:10:00.000000Z"
  }
}
```

#### Supported Query Parameters (Single-Valued Only)

- `status`: `"open" | "investigating" | "closed"`
- `severity`: `"low" | "medium" | "high"`
- `origin`: `"runtime" | "controlled_test"`
- `sourceId`: UUID
- `ruleId`: UUID
- `from`, `to`: ISO-8601 UTC timestamps (default 24-hour window ending at PostgreSQL `clock_timestamp()`; maximum window span 31 days; microsecond precision preserved)
- `limit`: integer `1..100` (default `50`)
- `cursor`: base64url-encoded `{ at, id, from, to, filter }` bound to the exact scope, filter fingerprint, and window bounds. Unknown or duplicate query parameters return `400 { error: "invalid_filter" }`.

---

### `GET /api/sentinel/projects/[projectId]/incidents?incidentId=<UUID>` (Incident Detail & Subviews)

Fetches a single scoped incident by UUID. Cannot be combined with list filter parameters (`400 { error: "invalid_query" }`).

Optional `view` parameter:

- `view=full` (or omitted): Returns `{ incident, alerts, evidence, timeline }` (`IncidentDetailRecord`).
- `view=timeline`: Returns `{ incidentId, timeline: IncidentTimelineRecord[] }` ordered by `sequence ASC, occurred_at ASC, timeline_id ASC` (up to 1,000 entries).
- `view=alerts`: Returns `{ incidentId, alerts: SecurityAlert[] }` ordered by `detected_at DESC, alert_id DESC` (up to 100 alerts).
- `view=evidence`: Returns `{ incidentId, evidence: StoredSecurityEvent[] }` ordered by `occurred_at ASC, source_id ASC, event_id ASC` (up to 500 redacted events).

If the incident does not exist in the caller's `(mode, workspaceId, projectId)` scope, returns `404 { error: "not_found" }`.

---

### `POST /api/sentinel/projects/[projectId]/incidents` (Investigation Status Transitions)

Transitions an incident's investigation status with optimistic concurrency (`expectedRevision`) and appends an immutable `sentinel.incident_timeline` entry.

#### Supported Command Payloads

1. **Start Investigation (`open -> investigating`)**:
   ```json
   {
     "action": "investigate",
     "incidentId": "<UUID>",
     "expectedRevision": 1,
     "note": "Optional operator triage note (3..280 chars)"
   }
   ```
   *(Also accepts `{ "action": "transition_status", "status": "investigating", "incidentId": "<UUID>", "expectedRevision": 1, "note": "..." }`.)*

2. **Close Investigation (`open | investigating -> closed`)**:
   ```json
   {
     "action": "close",
     "incidentId": "<UUID>",
     "expectedRevision": 2,
     "reason": "Required close reason (3..280 chars, no HTML or secrets)"
   }
   ```
   *(Also accepts `{ "action": "transition_status", "status": "closed", "incidentId": "<UUID>", "expectedRevision": 2, "reason": "..." }`.)*

3. **Reopen Investigation (`closed -> investigating`)**:
   ```json
   {
     "action": "reopen",
     "incidentId": "<UUID>",
     "expectedRevision": 3,
     "reason": "Required reopen reason (3..280 chars, no HTML or secrets)"
   }
   ```
   *(Also accepts `{ "action": "transition_status", "status": "investigating", "incidentId": "<UUID>", "expectedRevision": 3, "reason": "..." }`.)*

#### Response (`200 OK`)

```json
{
  "incidentId": "00000000-0000-5000-a000-000000000001",
  "status": "investigating",
  "revision": 2,
  "verificationStatus": "not_requested",
  "timelineId": "00000000-0000-5000-a000-000000000099"
}
```

#### Error Codes

| HTTP Status | `error` Code | Cause |
| --- | --- | --- |
| `400` | `invalid_action` / `invalid_input` | Unknown action, extra/forbidden fields (such as `workspaceId`), or incompatible `note`/`reason` fields |
| `400` | `invalid_incident_note` | `note` outside `3..280` chars, contains control chars / `<` / `>`, or matches secret/token patterns |
| `400` | `invalid_close_reason` | Missing or invalid `reason` (`3..280` chars, no control chars / `<` / `>`, no secret/token patterns) |
| `401` | `unauthenticated` | Missing or invalid session cookie |
| `403` | `invalid_origin` | Missing or mismatched `Origin` header on `POST` |
| `404` | `not_found` | Invalid project ID, `orderly-demo`, unauthorized repository, or incident not in project scope |
| `405` | `method_not_allowed` | HTTP method other than `GET` or `POST` |
| `409` | `revision_conflict` | `expectedRevision` does not match current persisted `incident.revision` |
| `409` | `invalid_transition` | Disallowed state transition (e.g., `open -> reopen`, `closed -> investigate`, `closed -> close`) |
| `409` | `project_not_registered` | Project binding missing or disabled in `sentinel.project_bindings` |
| `409` | `revision_capacity` / `timeline_capacity` | Incident reached 1,000 revisions or 1,000 timeline entries |
| `413` | `payload_too_large` | Request body exceeds `8192` bytes |
| `503` | `not_configured` / `service_unavailable` | Database not configured, unapproved, or unreachable |

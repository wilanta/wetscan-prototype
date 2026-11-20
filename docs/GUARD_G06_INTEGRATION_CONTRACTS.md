# WetScan Guard G06 Integration Contracts

## 1. GRD-013: Guard → Canvas Overlay Contract (`guard.canvas.v1`)

- **Endpoint:** `GET|POST /api/guard/projects/[projectId]/g06/canvas?revision=<graphRevision>`
- **Port Adapter:** `G06CanvasAdapter implements CanvasPort` (`src/features/guard/g06/canvas-overlay.ts`)
- **Attribution Rules:**
  - `evidence_source_path`: Exact normalized file path match against `graph.nodes[].evidenceIds -> graph.evidence[].sourcePath`. If multiple downstream infrastructure nodes (`database`, `cache`, `queue`, `external_service`, etc.) share an importing file path with a unique application owner node (`api`, `frontend`, `backend`, `auth`), attribute to that unique owner; multiple application owners remain `ambiguous_nodes`.
  - `manifest_package_root`: Lockfile/manifest findings fall back only when an explicit single `repository` or package root owns that manifest path.
  - `api_route_exact`: G05 DAST/Integrity findings map strictly when a unique `observed_in_source` `api`/`auth` node carries a matching route template (no wildcard `[...slug]` guessing).
  - **Stale guard:** Scan commit SHA != graph `evidence[].sourceRevision` triggers `coverageStatus: "stale"` and `reason: "stale_commit"` without false node placement.

## 2. GRD-020: Guard → Intelligence Inventory Contract (`guard.inventory.v1`)

- **Outbox Topic:** `intelligence_inventory` (`GuardInventoryV1` in `src/features/sentinel/contracts.ts`)
- **Port Adapter:** `G06IntelligenceAdapter implements IntelligencePort` (`src/features/guard/g06/intelligence-bridge.ts`)
- **Consumer:** `SentinelS09IntelligenceConsumer` delivers normalized `npm` inventory items to Sentinel S09's `InventoryStore.save` + `assessExposure` under `(mode='live', workspace_id, project_id)`, preserving non-`npm` ecosystems as explicit `unsupportedCount` and absent licenses as `null` (`unknownLicenseCount`).
- **Consumer Outcomes:**
  - Bound project + synced catalog → `syncStatus: "acknowledged"`, real `sentinelSnapshotId`, real `exposureAssessment` (`potential_exposure | no_match_within_coverage | cannot_assess`).
  - Missing `sentinel.project_bindings` → `syncStatus: "project_not_registered"` (`retry_scheduled`).
  - Missing `SENTINEL_DB_*` → `syncStatus: "consumer_unavailable"`.

## 3. GRD-021: Guard → Sentinel Pipeline Event Contract (`guard.pipeline.v1`)

- **Outbox Topic:** `sentinel_pipeline` (`GuardPipelineEventV1` in `src/features/sentinel/contracts.ts`)
- **Port Adapter:** `G06SentinelAdapter implements SentinelPort` (`src/features/guard/g06/sentinel-bridge.ts`)
- **HTTP Consumer Wire Contract (`GUARD_G06_SENTINEL_CONSUMER_URL`):**
  - Method: `POST`, timeout `5000ms` (`https://` enforced for non-loopback hosts)
  - Headers: `Content-Type: application/json`, `X-WetScan-Schema: guard-pipeline-v1`, `X-WetScan-Idempotency-Key`, optional `X-WetScan-Signature-256: sha256=<hmac-sha256>`
  - Payload: Validated `GuardPipelineEventV1` + `securityIncident: false` (never creates runtime telemetry or intrusion incidents)
  - Expected Ack (`2xx`): JSON `{ accepted: true, acknowledgmentId: string, status?: string }`
  - `409 Conflict` → transitions delivery immediately to `conflict` (halted)
  - `400/403/422` → `failed` (permanent rejection)
  - `429/5xx/timeout/network` → `retry_scheduled` (exponential backoff up to `maxAttempts`)
  - Missing `GUARD_G06_SENTINEL_CONSUMER_URL` → `consumer_unavailable` (`retry_scheduled`, zero fabricated ack).

## 4. Unified Guard Security Report Contract (`guard.unified-report.v1`)

- **Endpoints:**
  - `GET /api/guard/projects/[projectId]/g06/overview`
  - `POST /api/guard/projects/[projectId]/g06/reports`
  - `GET /api/guard/projects/[projectId]/g06/reports?reportId=<id>&format=json|html&download=1`
- **Status Taxonomy:** `VERIFIED | PARTIAL | INCOMPLETE | BLOCKED | NOT_CONFIGURED | STALE | FAILED` across source, static/SBOM, G03 boundary (`NOT_CONNECTED`), G04 CI/CD (`enforced` explicit), G05 DAST/Integrity, Canvas, Intelligence, and Sentinel sections, with download auditing in `guard.g06_audit`.

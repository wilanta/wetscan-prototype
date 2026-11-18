# Sentinel S04 Context Reconstruction & Architecture Audit

Status: **CONTEXT_VERIFIED** (Pre-implementation context reconstruction completed on 15 November 2026).

---

## 1. Current Master SHA and Merged Packet History

Verified directly against local Git repository and `origin/master` before any S04 code changes:

- **Repository**: `wilanta/wetscan-prototype`
- **Verified `master` / `origin/master` HEAD**: `f7bfeef29488c3f997e9444555039514f55fa0a3`
- **Current S04 Working Branch**: `feat/sentinel-s04-incidents` branched directly from `f7bfeef29488c3f997e9444555039514f55fa0a3`
- **Other Worktrees Preserved**: `C:/Users/sheil/OneDrive/Dokumen/Wildhan/projects/wetscan-canvas-full` (`0696879 [feat/canvas-full-module]`) inspected by identity only and left untouched.

### Merged Packet History on `master`

| Packet | Merge Commit | Implementation Commit | PR | Summary |
| --- | --- | --- | --- | --- |
| **S00** | `ec6838b` | `aa84457` | PR #2 | Sentinel contract alignment (`src/features/sentinel/{types,contracts,platform-contracts,scope,integrations}.ts`, live route wrapper, compatibility fixtures). |
| **S01** | `e39b01d` | `cc45bc0` | PR #3 | PostgreSQL connection approval, migration runner (`0001_foundation`), composite project bindings, durable queue with lease/fencing, worker runtime, outbox skeleton. |
| **S02** | `cd313ce` | `ba951c9` | PR #4 | Authenticated telemetry ingestion (`0002_telemetry`), durable sources/credentials/events/batches, redaction & bounds validation, Event Explorer API and Live UI. |
| **Guard G01** | `12b843e` | `7207a16` | PR #5 | Guard G01 live persistence, queue subclass, worker, and proposed SQL (`migrations/guard/**`). |
| **S03** | `f7bfeef29488c3f997e9444555039514f55fa0a3` | `a7a0998d110a2abf46d7d123d2140eb9a77879fb` | PR #6 | Deterministic detection rules, immutable versioning, durable alerts & evidence (`0003_detection`), worker detection integration, Rules/Alerts API and Live UI. |

### Historical Documentation Reconciliation

`docs/agent-handoffs/HANDOFF_S03.md` was written immediately before committing `a7a0998d110a2abf46d7d123d2140eb9a77879fb` and merging PR #6 (`f7bfeef29488c3f997e9444555039514f55fa0a3`), so its pre-commit statements ("no merge, S04... is authorized", "this pre-commit handoff cannot name its own future commit SHA") are historical records of that pre-publication step. The repository commit graph confirms PR #6 was merged cleanly to `master` at `f7bfeef29488c3f997e9444555039514f55fa0a3`. No security-critical discrepancy exists between `HANDOFF_S03.md` and the merged source tree. Historical handoff records are preserved verbatim.

---

## 2. Current Feature and Infrastructure Inventory

- **Platform (`src/platform/**`)**:
  - `config.ts`: Explicit target/marker/plan-hash/purpose approval gate (`approvedDatabaseConfig`), `PlatformError` taxonomy, pool bounds, worker limits.
  - `database.ts`: Role-specific connection pools (`createApprovedPool`), `withProjectTransaction` setting `SET LOCAL app.mode`, `app.workspace_id`, `app.project_id`, `statement_timeout`, `lock_timeout`, and `idle_in_transaction_session_timeout`.
  - `migrations.ts`: Deterministic `migrationPlan()` over `migrations/sentinel/*.up.sql`, ` *.down.sql`, and `infra/sentinel/provision-roles.sql`; `applyMigrations()` with advisory lock `7342001`, checksum verification, and empty-only rollback refusal for `0001_foundation`, `0002_telemetry`, and `0003_detection`.
  - `queue.ts`: `PostgresJobQueue` with `enqueueInTransaction`, `claimNext`, `heartbeat`, `complete`, `retry`, `cancel`, `validateActiveLease`, `fencedExec`, and optional `SentinelAcceptanceAdmission` historical-job isolation.
  - `job-admission.ts`: `readSentinelAcceptanceAdmission` enforcing bounded opt-in acceptance job ID allowlists (`1..12` new IDs, disjoint from 8 protected historical S02 job IDs, `<= 10` minute TTL).
  - `identity.ts`, `health.ts`, `outbox.ts`, `retention.ts`: Deterministic SHA-256 ID helper, structured health reporting, transactional notification outbox skeleton, and retention schedules.
- **Sentinel Storage (`src/features/sentinel/storage/projects.ts`)**:
  - `PostgresProjectBindingStore` validating and upserting `(mode, workspace_id, project_id)` bindings and checking table readiness (`telemetryReady`, `detectionReady`).
- **Sentinel Telemetry (`src/features/sentinel/telemetry/**`)**:
  - `validation.ts`: Strict source/credential/batch validation, secret/header/cookie/token stripping, payload bounds, SHA-256 credential hashing.
  - `store.ts`: `TelemetryStore` for sources, credentials, batch ingestion + atomic `telemetry.batch` job enqueue, cursor pagination, and `retainTelemetry` (which preserves events referenced by `sentinel.detection_evidence`).
- **Sentinel Detection (`src/features/sentinel/detection/**`)**:
  - `model.ts`, `seeds.ts`, `time.ts`, `validation.ts`, `evaluator.ts`, `store.ts`, `retention.ts`, `activation.ts`: Deterministic rule definitions (`threshold`, `sequence`, `exact_match`), immutable `detection_rule_versions`, evaluation ledger, cooldowns, suppressions, durable `detection_alerts` + `detection_evidence`, and `retainDetection`.
- **Sentinel HTTP Server (`src/features/sentinel/server/**` & `src/app/api/sentinel/**`)**:
  - `project-context.ts`: Resolves authenticated GitHub session and Canvas project authorization (`resolveAuthorizedSentinelProject`).
  - `telemetry-http.ts`, `telemetry-runtime.ts`, `detection-http.ts`: Authenticated handlers for sources, events, ingest, rules, and alerts.
- **Sentinel Worker (`worker/sentinel/**`)**:
  - `main.ts`, `runtime.ts`, `executor.ts`, `lifecycle.ts`, `acceptance.ts`: Poll loop, lease heartbeat & abort controller, fenced `telemetry.batch` handler (recording receipt + running `evaluateJobEvents` when `detectionActivation` permits), and periodic retention maintenance.

---

## 3. Existing Auth/GitHub/Canvas Authorization Model

- Located in `src/features/sentinel/server/project-context.ts` (`resolveAuthorizedSentinelProject(projectId)`):
  1. Rejects `"orderly-demo"` and any non-`github-<numericId>` project ID with `404 { error: "not_found" }`.
  2. Resolves the current session via `getCurrentAppContext()` (`src/lib/auth/session.ts`). Unauthenticated sessions return `401 { error: "unauthenticated" }`.
  3. Verifies live repository access via `resolveAuthorizedRepositoryProject(context, projectId)` (`src/features/canvas/server/source-Context.ts`), ensuring the current session owns/is authorized for the GitHub repository backing the project. Unauthorized or unknown projects return `404 { error: "not_found" }` (preventing project ID enumeration).
  4. Derives the canonical workspace ID strictly on the server: `github-user-${context.session.account.githubUserId}${process.env.WETSCAN_WORKSPACE_NAMESPACE_SUFFIX ?? ""}`.
  5. Never accepts `workspaceId`, `projectId`, or `mode` overrides from request bodies, headers, or query parameters for authorization.

---

## 4. Exact Workspace/Project/Mode Scope

- Defined in `src/features/sentinel/scope.ts` (`assertScope`):
  - `mode`: `"live" | "demo"` (`liveScope` forces `mode: "live"`).
  - `workspaceId`: Matches `/^[a-zA-Z0-9][a-zA-Z0-9._:-]{1,95}$/`, rejects `"demo"`, `"default"`, `"global"`, `"shared"`, `"system"`, `"*"`, and rejects `orderly-demo` when `mode === "live"`.
  - `projectId`: Matches `/^[a-zA-Z0-9][a-zA-Z0-9._-]{1,95}$/`, rejects `"orderly-demo"` in `"live"` mode and requires `"orderly-demo"` in `"demo"` mode.
- Every PostgreSQL transaction in `withProjectTransaction` sets:
  - `SET LOCAL app.mode = $1`
  - `SET LOCAL app.workspace_id = $2`
  - `SET LOCAL app.project_id = $3`
- Every `sentinel.*` and `platform.*` table enforces `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY` using `wetscan.Scope_match(mode, workspace_id, project_id)`.

---

## 5. S02 Ingestion and Telemetry Storage Flow

1. Client or emitter sends `POST /api/sentinel/ingest` with `Authorization: Bearer wst_<tokenId>.<secret>` and `X-WetScan-Project` / `X-WetScan-Source`.
2. `TelemetryStore.ingestBatch`:
   - Parses and hashes token secret, looks up active `sentinel.telemetry_credentials` and enabled `sentinel.telemetry_sources` inside a scoped transaction (`withProjectTransaction`).
   - Validates and redacts event batch (`validateTelemetryBatch`), enforcing 64 KiB body limit, <= 25 events/batch, strict field allowlists, and secret redaction.
   - Inserts idempotent batch receipt into `sentinel.telemetry_batches` (`ON CONFLICT DO NOTHING`) and events into `sentinel.telemetry_events` (`ON CONFLICT DO NOTHING`).
   - Enqueues a `telemetry.batch` job in `platform.jobs` in the same database transaction with `deduplicationKey: telemetry-batch:<batchId>` and `payload: { batchId, sourceId, eventCount, controlledTest, eventIds }`.
3. Worker claims `telemetry.batch`, verifies lease token (`validateActiveLease`), marks `sentinel.telemetry_batches.last_job_id` (`fencedExec`), and invokes S03 detection when enabled.

---

## 6. S03 Detection, Worker, Alert and Evidence Flow

1. During a claimed `telemetry.batch` job, if `detectionActivation.enabled` is true and `bindings.detectionReady(scope)` is true, `DetectionStore.evaluateJobEvents` executes inside a single `withProjectTransaction`.
2. `evaluateJobEvents` locks the project binding (`FOR KEY SHARE`), validates the active worker lease (`validateActiveLease`), loads the batch events from `sentinel.telemetry_events` (excluding `origin = 'guard'`), and loads enabled rules + current rule versions from `sentinel.detection_rules` / `sentinel.detection_rule_versions`.
3. For each enabled rule, source, origin (`runtime` vs `controlled_test`), and fixed UTC window (`windowBoundsForEvent`), it queries window events (`occurred_at >= windowStart AND occurred_at < windowEnd AND ingested_at <= windowEnd + 300s`) and calls pure `evaluateRuleWindow`.
4. `DetectionStore.persistMatch` records the evaluation in `sentinel.detection_evaluations`:
   - If not matched -> `outcome = 'no_match'`.
   - If matched and suppressed by rule suppression window -> `outcome = 'alert_suppressed'`, links `sentinel.detection_suppressed_evidence` (no alert created).
   - If matched and within active cooldown -> `outcome = 'cooldown_suppressed'`, links `sentinel.detection_suppressed_evidence` (no alert created).
   - If matched and eligible -> `outcome = 'alert_created'` (or `'alert_deduplicated'` if `deduplication_key` already exists in `sentinel.detection_alerts`), upserts `sentinel.detection_alerts` and links all matched window events in `sentinel.detection_evidence`, then updates `sentinel.detection_cooldowns`.
5. Before committing, `evaluateJobEvents` re-validates the active lease (`validateActiveLease`), ensuring expired or replaced leases roll back all writes.

---

## 7. Actual Persisted S03 Database Objects

- **S01 (`0001_foundation`)**:
  - Schemas: `platform`, `sentinel`, `wetscan`
  - Functions: `wetscan.current_setting_text(text)`, `wetscan.scope_match(text, text, text)`
  - Tables: `platform.schema_migrations`, `platform.module_limits`, `sentinel.project_bindings`, `platform.jobs`, `platform.job_attempts`, `platform.notification_outbox`, `platform.notification_attempts`, `platform.worker_heartbeats`
- **S02 (`0002_telemetry`)**:
  - Tables: `sentinel.telemetry_sources`, `sentinel.telemetry_credentials`, `sentinel.telemetry_events`, `sentinel.telemetry_batches`
- **S03 (`0003_detection`)**:
  - Tables: `sentinel.detection_rules`, `sentinel.detection_rule_versions`, `sentinel.detection_audit`, `sentinel.detection_alerts`, `sentinel.detection_evidence`, `sentinel.detection_evaluations`, `sentinel.detection_cooldowns`, `sentinel.detection_suppressed_evidence`
- No `sentinel.incidents*` tables exist yet in `0001`–`0003`.

---

## 8. Existing Migrations and Their Ordering

| Order | Version | Up Checksum (Normalized LF) | Down Checksum (Normalized LF) | Pair Checksum (`Migration.checksum`) |
| --- | --- | --- | --- | --- |
| 1 | `0001_foundation` | `d47e257ee8905a8fd24de1e93de259d83864ce6531a763099459dcf9e3f9d2ac` | `fd96ddb7f06c1461ebc7737cff123488d47c62af6efaf435587aad4e95d564f4` | `dd061a60b123284882f154c438de3a171d60967b7b07a4e07200b6693f4eb778` |
| 2 | `0002_telemetry` | `a2352cd01396467e917bbbbe0dc51d9f187ba6292e7f971f0752c2b429b7acb6` | `7c667f112025ad4789f330ce9e1a362a0e78a98ddb46f0f7a72af744770dcafa` | `d1b67dc680f5bf3c2cbe585dca2427abf9d7ba9f29479c69b851f66b91c1f5a3` |
| 3 | `0003_detection` | `25c2820e7b50501c3358486bb6c4520a2d17fb5343635ee3a173424bcb01a83e` | `bfe2857310b8f7d1c6f1743cfc99c5bbfc28a110159c43510e73736671423234` | `4f0ee1cebdbdc81b835f719ef13c9cb703dfb5f440193765dfa0a61635fb6168` |

- Provisioning script (`infra/sentinel/provision-roles.sql`) normalized LF SHA-256: `7c531cf4165f7fa4eb4a4b65aff4ad409360f6a3cd08f3af8932c48d91829299` (CRLF raw file SHA-256: `df521303f529dbccdded1933bf2052095f445158c3db9be6d2a49bf35116220a`).
- Combined S03 plan hash (`0001`..`0003`): `c3e39f6fd43ee6eb2fbf5b244778955aab4cabb8a11ed3c66d791cf99a252a94`.
- Adding `0004_incidents` will append the 4th migration in lexicographical order while keeping `0001_foundation`, `0002_telemetry`, and `0003_detection` byte-for-byte identical.

---

## 9. Existing Queue, Lease, Fencing and Worker Guarantees

- **Lease Acquisition (`claimNext`)**: Atomically selects an eligible `queued` or `retry_wait` job (`FOR UPDATE SKIP LOCKED`), increments `attempts`, mints a fresh random UUID `lease_token`, sets `lease_owner` and `lease_expires_at`, and records a `running` row in `platform.job_attempts`.
- **Fencing (`validateActiveLease`, `fencedExec`, `complete`, `retry`)**: Every worker side effect and job state transition checks `job_id`, `status = 'running'`, `lease_owner`, `lease_token`, `lease_expires_at > NOW()`, and `cancel_requested_at IS NULL`.
- **Lease Renewal (`executeLease`)**: Renews the lease at `leaseSeconds * 500ms` intervals and exposes `currentLease()` to `LeaseAwareJobHandler`. If heartbeat or cancellation fails, it aborts the `AbortController` and throws `lease_lost` or `job_cancelled`.
- **Historical Job Isolation (`SentinelAcceptanceAdmission`)**: Prevents workers from claiming historical S02/S03 queued jobs during bounded acceptance runs and enforces exact target, marker, plan hash, project scope, and expiry constraints.

---

## 10. Current Live and Demo Routing Ownership

- **Orderly Demo Mode (`/app/projects/orderly-demo/sentinel/**`)**:
  - Handled by `src/app/app/projects/[projectId]/sentinel/[[...section]]/page.tsx` when `projectId === "orderly-demo"`, or by the shared dispatcher `src/app/app/[...path]/page.tsx`.
  - Renders `SentinelModuleView` (`src/components/views/sentinel.tsx`) with `liveProjectId` undefined, preserving 100% of the in-memory `demoReducer` and `initialSentinelState` fixtures.
- **Live Mode (`/app/projects/github-<id>/sentinel/[[...section]]`)**:
  - Handled by `src/app/app/projects/[projectId]/sentinel/[[...section]]/page.tsx`.
  - Currently checks `if (first === "sources" || first === "events" || first === "rules" || first === "alerts")` and passes `liveProjectId={projectId}` and `liveSection={first}` to `SentinelModuleView`.
  - For other sections (including `"incidents"` currently), it renders `LiveSentinelPlaceholder` showing `"Planned in S04–S06"` while still rendering the top section switch bar (`Overview`, `Sources`, `Event Explorer`, `Rules`, `Alerts`).

---

## 11. Existing Incident-Related Domain Types and UI

- **Frozen Public Types (`src/features/sentinel/types.ts`)**:
  - `Incident extends VersionedRecord`:
    ```ts
    export interface Incident extends VersionedRecord {
      incidentId: string;
      sourceId: string;
      alertIds: string[];
      evidenceIds: string[];
      status: "open" | "investigating" | "closed";
      verificationStatus: VerificationStatus;
      archived: boolean;
      occurredAt: string;
    }
    ```
  - `TimelineEntry extends VersionedRecord`:
    ```ts
    export interface TimelineEntry extends VersionedRecord {
      timelineId: string;
      incidentId: string;
      type: LifecycleEvent;
      actorId: string;
      occurredAt: string;
      evidenceIds: string[];
    }
    ```
  - `LifecycleEvent`:
    `"ingested" | "normalized" | "rule_matched" | "alert_created" | "incident_opened" | "policy_evaluating" | "response_proposed" | "human_approved" | "mitigation_applied" | "verification_pending" | "neutralization_verified" | "verification_failed" | "verification_inconclusive" | "rollback" | "expiry" | "incident_closed"`
  - `VerificationStatus`:
    `"not_requested" | "pending" | "verified" | "failed" | "inconclusive"`
- **Existing Demo Incident UI (`src/components/views/sentinel.tsx`)**:
  - `IncidentsView` and `IncidentDetailView` exist in `src/components/views/sentinel.tsx` for Orderly Demo state (`state.sentinel.incidents`), alongside Demo response/verification tabs. These Demo components must remain untouched for `orderly-demo`.

---

## 12. Existing Incident or Timeline Implementations, If Any

- **Live Persistence / Store / API / Live UI**: **None.**
- Only the frozen S00 TypeScript interfaces (`Incident`, `TimelineEntry`, `LifecycleEvent`, `VerificationStatus`, `EvidenceRef`) in `src/features/sentinel/types.ts` and the in-memory Orderly Demo views in `src/components/views/sentinel.tsx` exist today.

---

## 13. Capabilities S04 Can Reuse Directly

1. **Scope & Identity (`src/features/sentinel/scope.ts`, `src/platform/identity.ts`)**: `assertScope`, `liveScope`, `deterministicId`.
2. **Database & Transactions (`src/platform/database.ts`, `src/platform/config.ts`)**: `withProjectTransaction`, `createApprovedPool`, `approvedDatabaseConfig`, `PlatformError`.
3. **Project Bindings (`src/features/sentinel/storage/projects.ts`)**: `PostgresProjectBindingStore` (extend with narrow `incidentsReady(scope)` check).
4. **Auth & Project Context (`src/features/sentinel/server/project-context.ts`)**: `resolveAuthorizedSentinelProject`, same-origin check pattern, strict JSON reader and error mapping from `src/features/sentinel/server/detection-http.ts`.
5. **Detection Persistence & Worker (`src/features/sentinel/detection/store.ts`, `worker/sentinel/runtime.ts`)**: Fenced `evaluateJobEvents` transaction and `persistMatch` alert creation/deduplication hook, worker lease validation, and periodic retention scheduling.
6. **Pagination & Validation Patterns (`src/features/sentinel/detection/validation.ts`, `src/features/sentinel/telemetry/store.ts`)**: Base64url cursor encoding/decoding, strict unknown-field rejection, payload size caps.

---

## 14. Gaps That S04 Actually Needs to Implement

1. **Additive S04 Migration (`migrations/sentinel/0004_incidents.up.sql` & `0004_incidents.down.sql`)**:
   - Scoped tables with composite keys, `FORCE ROW LEVEL SECURITY`, and least-privilege grants:
     - `sentinel.incidents`
     - `sentinel.incident_alerts`
     - `sentinel.incident_evidence`
     - `sentinel.incident_timeline` (append-only: `SELECT, INSERT` only for `wetscan_app` and `wetscan_sentinel_worker`)
     - `sentinel.incident_timeline_evidence` (append-only: `SELECT, INSERT` only for `wetscan_app` and `wetscan_sentinel_worker`)
   - Empty-only rollback refusal in `src/platform/migrations.ts` for `0004_incidents`.
2. **Incident Domain Model, Store, Correlation & Timeline (`src/features/sentinel/incidents/**`)**:
   - Concrete persisted models extending frozen `Incident` and `TimelineEntry` (`PersistedIncident`, `PersistedTimelineEntry`, `IncidentDetailRecord`).
   - Deterministic, idempotent 1-to-1 alert-to-incident correlation from eligible persisted S03 alerts inside the fenced transaction (`IncidentStore.correlateAlertInTransaction` / `ensureIncidentForAlert`), linking alert and evidence events, and appending idempotent `alert_created` and `incident_opened` timeline entries.
   - Explicit audited investigation status transitions (`open -> investigating`, `open -> closed`, `investigating -> closed`, and explicit audited reopen `closed -> investigating`) with `expectedRevision` optimistic concurrency, appending immutable timeline entries (`incident_opened` with `from_status`/`to_status` and `metadata.action` `"investigate"` or `"reopen"` for active investigation transitions, and `incident_closed` for closing—never using S05 `policy_evaluating` or fabricating mitigation/verification events) while preserving `verificationStatus = "not_requested"`.
3. **Retention Preservation Pins**:
   - `retainIncidents` / retention integration ensuring open/investigating incidents and incident-linked alerts (`sentinel.incident_alerts`) and telemetry events (`sentinel.incident_evidence`, `sentinel.incident_timeline_evidence`) are never deleted by `retainDetection` or `retainTelemetry`.
4. **Authenticated Incident HTTP APIs**:
   - `src/features/sentinel/server/incident-http.ts` and `src/app/api/sentinel/projects/[projectId]/incidents/route.ts` supporting list incidents (with filters & cursor pagination), get incident detail (with linked alerts, linked redacted evidence events, and ordered timeline), and `POST` commands (`transition_status`, `close_incident`) with same-origin enforcement, 8 KiB body cap, strict field validation, and `expectedRevision` conflict checks.
5. **Live Sentinel Incidents UI**:
   - `src/features/sentinel/components/live-incidents.tsx` and narrow integration into `src/app/app/projects/[projectId]/sentinel/[[...section]]/page.tsx`, `src/components/views/sentinel.tsx`, `src/features/sentinel/components/live-detection.tsx`, and `src/features/sentinel/components/live-telemetry.tsx` supporting `/app/projects/github-<id>/sentinel/incidents` and `/app/projects/github-<id>/sentinel/incidents/<incidentId>`.
6. **Worker & Preflight/Acceptance Scripts + Comprehensive Tests**:
   - Worker health/retention integration (`worker/sentinel/runtime.ts`), `scripts/sentinel-incident-preflight.ts`, `scripts/sentinel-incident-test.ts`, `infra/sentinel/incident.env.example`, unit/migration/store/HTTP/acceptance-safety tests, skip-gated PostgreSQL integration tests, and Playwright browser tests.

---

## 15. Security and Compatibility Risks

1. **Migration Plan Hash & Existing S02/S03 Scripts/Tests**:
   - Adding `0004_incidents` updates `migrationPlan().sha256`. Existing `tests/platform/migrations.test.ts` and `tests/sentinel/detection-migrations.test.ts` inspect `migrationPlan()`. S03 handled S02's tests by slicing `plan.migrations.slice(0, 2)` for S02-specific rollback tests; S04 must similarly keep `tests/sentinel/detection-migrations.test.ts` testing S03's 3-migration slice (`slice(0, 3)`) while `tests/sentinel/incident-migrations.test.ts` tests the full 4-migration plan.
   - `scripts/sentinel-detection-preflight.ts` and `scripts/sentinel-detection-test.ts` must check `approvedDatabaseConfig` before checking the S03 plan hash so unconfigured runs continue returning `not_configured` (`exit 2`) in `detection-acceptance-safety.test.ts`.
2. **Retention Pinning Across S02, S03, and S04**:
   - `retainDetection` deletes expired `sentinel.detection_alerts` (which cascades to `sentinel.detection_evidence`), and `retainTelemetry` deletes expired `sentinel.telemetry_events` not in `sentinel.detection_evidence`.
   - With `sentinel.incident_alerts` (`ON DELETE RESTRICT` to `sentinel.detection_alerts`) and `sentinel.incident_evidence` (`ON DELETE RESTRICT` to `sentinel.telemetry_events`), `retainDetection` and `retainTelemetry` would fail with FK violation or delete needed evidence unless `retainDetection` excludes alerts linked in `sentinel.incident_alerts` (when `0004_incidents` is applied) and `retainTelemetry` excludes events linked in `sentinel.incident_evidence` / `sentinel.incident_timeline_evidence`!
3. **Timeline Immutability**:
   - `sentinel.incident_timeline` and `sentinel.incident_timeline_evidence` must be append-only: neither `wetscan_app` nor `wetscan_sentinel_worker` may receive `UPDATE` privileges on those tables, and duplicate retries must be absorbed idempotently via `(mode, workspace_id, project_id, incident_id, idempotency_key)`.
4. **No False Mitigation / Verification Claims**:
   - Closing an incident (`status = "closed"`) only closes the investigation workflow; `verificationStatus` remains `"not_requested"` and no `mitigation_applied` or `neutralization_verified` timeline event may be fabricated.
5. **Historical Alert & Queue Boundary**:
   - Historical S03 alerts in TEST/DEV must never be auto-backfilled on migration or worker startup. Incident creation happens only when an eligible S03 alert is persisted during an authorized, fenced evaluation (and only when `0004_incidents` tables exist and incident processing is active).

---

## 16. Existing Acceptance Evidence and Remaining Approval Gates

- **Historical Verified Evidence (Not Rerun in S04 Context Phase)**:
  - S01: PostgreSQL foundation & queue reversibility passed on local Docker target `127.0.0.1:55432/wetscan_s01_test`.
  - S02: PostgreSQL telemetry & retention suites and bounded DEV ingestion -> Event Explorer UI passed on `github-998736528` (`wilanta/portfolio`).
  - S03: 680/680 unit tests, 60/60 browser regressions, 24/24 PostgreSQL TEST acceptance cases (`H03B`), and bounded DEV HTTP -> PostgreSQL -> worker -> alert -> UI acceptance (`H03C-2`) passed and were merged in PR #6 (`f7bfeef29488c3f997e9444555039514f55fa0a3`).
- **Remaining Approval Gates for S04**:
  1. **Database Preflight & Migration Approval**: Separate owner authorization required before connecting to TEST or DEV PostgreSQL, running `scripts/sentinel-incident-preflight.ts`, or applying `0004_incidents`.
  2. **Mutating PostgreSQL Acceptance Suite (`H04B`)**: Separate owner authorization required before running `scripts/sentinel-incident-test.ts` against `127.0.0.1:55432/wetscan_s01_test`.
  3. **Bounded Live DEV Runtime Acceptance (`H04C`)**: Separate owner authorization required before starting the worker, emitting controlled telemetry, or creating live DEV incidents.
  4. **Git Publication Approval**: Separate owner authorization required before staging, committing, pushing, or opening a PR.

---

## 17. Component Inventory Matrix (`EXISTING / REUSABLE / MISSING / BLOCKED`)

| Component / Capability | Status | Location / Notes |
| --- | --- | --- |
| Frozen `Incident`, `TimelineEntry`, `LifecycleEvent`, `VerificationStatus` contracts | **EXISTING / REUSABLE** | `src/features/sentinel/types.ts` |
| Scope validation (`assertScope`, `liveScope`) & deterministic IDs | **EXISTING / REUSABLE** | `src/features/sentinel/scope.ts`, `src/platform/identity.ts` |
| PostgreSQL approval gate, role pools & `withProjectTransaction` | **EXISTING / REUSABLE** | `src/platform/config.ts`, `src/platform/database.ts` |
| Migration planner, advisory lock runner & empty-only rollback guard | **EXISTING / REUSABLE** | `src/platform/migrations.ts` (needs narrow `0004_incidents` down guard) |
| Queue leasing, fencing (`validateActiveLease`, `fencedExec`) & admission | **EXISTING / REUSABLE** | `src/platform/queue.ts`, `src/platform/job-admission.ts` |
| Auth + GitHub + Canvas project authorization (`resolveAuthorizedSentinelProject`) | **EXISTING / REUSABLE** | `src/features/sentinel/server/project-context.ts` |
| S02 Telemetry ingestion, redaction, store & retention | **EXISTING / REUSABLE** | `src/features/sentinel/telemetry/{validation,store}.ts` (needs incident retention pin) |
| S03 Detection rules, evaluator, alert/evidence persistence & retention | **EXISTING / REUSABLE** | `src/features/sentinel/detection/{evaluator,store,retention}.ts` (needs incident hook & pin) |
| Orderly Demo Incident List & Detail UI | **EXISTING / REUSABLE** | `src/components/views/sentinel.tsx` (preserved untouched for Demo mode) |
| Additive `0004_incidents` up/down SQL migration | **MISSING** | To be implemented in `migrations/sentinel/0004_incidents.{up,down}.sql` |
| Persisted incident domain model, validation & `IncidentStore` | **MISSING** | To be implemented in `src/features/sentinel/incidents/{model,validation,store,retention}.ts` |
| Transactional alert-to-incident correlation & append-only timeline | **MISSING** | To be implemented in `src/features/sentinel/incidents/store.ts` + `detection/store.ts` hook |
| Authenticated Incidents API (`/api/sentinel/projects/[projectId]/incidents`) | **MISSING** | To be implemented in `src/features/sentinel/server/incident-http.ts` & route handler |
| Live Sentinel Incidents UI (list, detail, timeline, filters, status transitions) | **MISSING** | To be implemented in `src/features/sentinel/components/live-incidents.tsx` & route seam |
| S04 unit, migration, store, HTTP, safety & Playwright fixture suites | **MISSING** | To be implemented in `tests/sentinel/incident*` |
| Real PostgreSQL `0004_incidents` application & mutating TEST/DEV acceptance | **BLOCKED** | Blocked by mandatory owner approval gate; preflight/test runners prepared and gated |

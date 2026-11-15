# G01 live foundation - pre-implementation audit

Date: 15 November 2026 (Asia/Jakarta). Main working tree: master cd313ce, clean. Isolated worktree: C:/laragon/www/wetscan-2/wetscan-guard-g01, branch feat/guard-g01-live-integration, same baseline. S02 is already merged; historical uncommitted Sentinel work is not present. No G02 file is read or started. No commit, push, PR, database connection, migration, worker activation or real GitHub acceptance is authorized by G01.

| Component | Existing implementation | Classification/reuse | Missing / minimum change | Security risk |
| --- | --- | --- | --- | --- |
| Auth/session | lib/auth/session, http, encrypted store | EXISTING_AND_REUSABLE | Import existing server APIs, no identity/store/OAuth rewrite | Never trust browser scope or expose cookies |
| GitHub App | lib/auth/github | EXISTING_AND_REUSABLE | Reuse installation verification/token primitives | Existence alone is not user access |
| Repository reader | Canvas github-reader/github-api | EXISTING_REQUIRES_ADAPTER | Reuse authorizer and bounded fixed-origin transport, Guard file policy | Canvas filters/200 files/8MB would hide scanner coverage |
| Project authorization | authorizeCanvasProject/workspaceScope | EXISTING_AND_REUSABLE | Backend grants, exact existing identity | Rename changes namespace; do not silently migrate |
| PostgreSQL | PlatformDatabase, ApprovedPool | EXISTING_REQUIRES_ADAPTER | Guard role/approval configuration on existing SQL pool/transactions | Existing config names/roles are Sentinel-specific |
| Roles/RLS | Sentinel-only policies on platform.* | PARTIALLY_IMPLEMENTED | Proposed additive Guard-only roles/policies, no Sentinel migration edits | Sharing existing app/worker roles would violate isolation |
| Durable queue | PostgresQueue and DurableJobPort | EXISTING_REQUIRES_ADAPTER | Narrow enqueue/claim adapter; inherit fencing/heartbeat/complete/retry/cancel | claim hardcodes sentinel; enqueue reads sentinel.project_bindings |
| Worker lifecycle | S01 executeLease/lifecycle | EXISTING_REQUIRES_ADAPTER | Reuse lease executor/backoff; separate Guard IPC/process and scheduler | Sentinel IPC/registered scopes cannot be reused as Guard authority |
| Guard orchestrator | worker/guard/orchestrator | PARTIALLY_IMPLEMENTED | Durable lease-bound persistence wrapper and fresh authorization seam | Old worker must not overwrite new results |
| Scanner sandbox | trusted-fixture harnesses only | MISSING | Enforcing Docker adapter, readiness, operator acceptance seam | Docker daemon absent; never host fallback |
| Guard persistence | DemoMemoryStore only | MISSING | Guard schema + PostgreSQL PersistencePort, CAS/revision | Demo state is not durable Live data |
| Guard API | none | MISSING | Scoped authenticated service/routes; default unavailable | Must not accept jobs before approved queue/sandbox/resolver |
| Guard UI | existing workbench + Demo | EXISTING_AND_REUSABLE | No redesign or G02 engine activation | Never show synthetic results as Live |

## Compatibility decisions before implementation

- Imports only from Auth/Canvas/Sentinel/platform; no changes to their implementations, migrations, routing or UI.
- PlatformDatabase already accepts module guard. Shared queue contracts include guard but concrete enqueue/claim and RLS are Sentinel-specific. Reuse compatible lease methods and transaction/identity/backoff primitives; override only Guard enqueue/claim behind separate roles.
- Keep platform.schema_migrations unchanged. S01/S02 runtime asserts its exact ledger; adding a Guard version there would break readiness. Guard uses its own ledger, version/checksum convention and advisory transaction lock. Existing applyMigrations is incompatible with Guard (fixed Sentinel directory/bootstrap/destructive down checks); do not call it.
- Proposed additive platform policies/grants require platform-owner approval and exact-target migration authorization. Guard schema changes are separate; no Sentinel table/row/policy is changed. Application never uses a migrator/admin role.
- Do not persist a raw session/OAuth/installation token for worker restart. A future trusted worker-authorization resolver is a separate explicit readiness prerequisite. Default runtime remains unavailable until that resolver, DB approval/migrations, sandbox acceptance and G02 execution are available.
- Actual Docker daemon probe failed: docker_engine pipe absent. No image pull, daemon start, DB test or worker start performed.

## Implemented design (15 November 2026)

The final state is PARTIALLY_VERIFIED. See GUARD_G01_VALIDATION.md for evidence and HANDOFF_GUARD_G01.md for remaining G01 gates. The audit table above records the pre-implementation state; it is intentionally preserved.

### Trust and source flow

Existing requestToken/requireOrigin -> authorizeCanvasProject -> existing workspaceScope -> short-lived server Grant -> GuardSnapshotAdapter -> existing GitHub App JWT/Canvas bounded fixed-origin sourceRequest. Both current user and installation access are checked by the existing authorizer. No browser-supplied workspace, grant, token or installation identity is accepted. The snapshot authorizes again after retrieval; no scripts, git hooks, builds or package installation run.

The repository is bound to its current authorized default-branch head (40-character SHA), GitHub ID, tree SHA and existing project identity. This deliberately rejects an old pinned commit after HEAD moves; arbitrary historical commit selection is not implemented. Git blobs are checked with Git SHA-1 and file SHA-256; the snapshot has a versioned policy and SHA-256 digest. The limits are 1,000 retrieved files, 65,536 bytes/file, 20,000,000 total bytes, depth 16, 10,000 tree entries, and 45 seconds. UTF-8 text is supported; binary, symlink, submodule, sensitive paths, truncated trees and bounded retrieval failures produce explicit partial coverage with hashed path references. If no eligible content can be read, acquisition fails. Coverage exclusions are never interpreted as a passing Live scan. Canvas graph snapshots/file filters are not used.

Source files exist only in a private owned temporary directory; the public snapshot contains metadata, never absolute host paths or tokens. Same-instance capability handles protect disposal. A sidecar expiry marker supports explicitly enumerated orphan cleanup after a one-hour grace period. The reaper is implemented and fixture-tested but no production scheduler currently invokes it. POSIX modes do not establish Windows ACL isolation: real service-account ACL/mount acceptance remains required. Existing token revocation is best effort, not proof of immediate revocation.

### Persistence and queue

PostgresGuardStore reuses PlatformDatabase transactions and scoped GUCs with module guard. Proposed guard.scans retains bounded job JSON (profile, engines/results, findings/evidence references, triage/retest fields, audit, timestamps/provenance), immutable repository identity/idempotency fingerprint, source coverage, revision and 30-day access retention. Scan admission and platform queue insert share one transaction; a scoped advisory lock serializes project admission. Worker writes lock the active lease and compare revisions in the same transaction; audit prefixes and existing evidence references cannot be rewritten. Cancellation locks queue then scan and updates queue/attempt/scan atomically. No automatic retention deletion or physical evidence-object storage/encryption service is implemented; raw source and matched secrets must not be persisted.

GuardPostgresQueue imports the frozen DurableJob contracts, existing queue base methods, lease conversion and identity helpers. Only Guard admission/claim differ because the S01 concrete methods hardcode Sentinel bindings/claim. It restricts module/kind, serializes claims on the Guard budget row, reuses attempt/fence tokens and SKIP LOCKED, and uses a narrow aggregate function for a module-wide lease count. Budget is one logical active lease across projects; kernel-level overlap during old-worker cleanup remains a real acceptance gate. Terminal exhaustion persists failed metadata and appends a fixed queue_failed Guard audit event without replacing the prior audit prefix. Outbox table access is scoped; no cross-module delivery or notification producer is activated.

### Worker and authorization handoff

runGuardWorker has a separate guard.shutdown IPC channel, one-at-a-time claim, bounded polling, reused S01 executeLease heartbeat/retry/backoff/timeout and bounded cleanup. Storage health and pending-scope pagination are Guard-owned. Real child-process tests start and restart this lifecycle with queue doubles. They do not prove a durable worker restart.

prepareGuardJob requires a fresh WorkerAuthorizationResolver on each attempt and revalidates after snapshot retrieval. It emits an explicit prepare-only failure when G02 execution is unavailable. worker/guard/main.ts intentionally exits approval_required; it is not a connected production launcher. A concrete authenticated broker/resolver, process bindings and real queue recovery remain NOT_IMPLEMENTED/UNVERIFIED respectively. Existing Auth exclusive locks are process-local. Reading or refreshing its filesystem tokens directly in a second process would race logout/refresh and is rejected. No session or OAuth/installation token is persisted in jobs; a compatible cross-owner resolver design needs Auth/platform review. New Auth is not authorized.

### API and activation

Guard-only routes under /api/guard/projects/[projectId] authenticate using existing Auth, revalidate selected GitHub repository access, derive scope server-side, enforce same-origin mutations, 4 KiB/5s JSON limits and limit<=50 pagination. Every response is private/no-store; unknown failures return fixed safe codes. Routes provide readiness, list/status/findings/evidence/coverage/cancel and a strict create contract. Default readiness reports BLOCKED. POST scans returns 503 approval_required or execution_not_ready, never a synthetic accepted Live scan. G02 must supply an approved executor before public creation can be enabled.

GUARD_LIVE_READ_ENABLED=1 is a future opt-in, with a new exact Guard app approval and its own role credential. It verifies both exact ledgers and enables reads/cancellation only. It is not enabled here. No ambient Sentinel/PG connection strings are consumed. The inherited ApprovedPool application_name diagnostic still uses a wetscan-sentinel prefix; this does not choose ownership, credentials or queue routing. A neutral diagnostic name would be a separate shared-owner extension.

POST source-acceptance is an optional one-attempt, exact repository/commit/operator-approved snapshot-only acceptance boundary. It uses the existing session, consumes an approval-path .used reservation before source reads, returns bounded metadata and verified local cleanup, and does not enqueue/scan or touch the database. No approval file is configured/read here, and the missing-approval path is unit/browser-tested. This route is not a Live Scan shortcut.

### Sandbox and compatibility

DockerGuardSandbox requires an absolute Docker CLI, a digest-pinned reviewed image/spec, explicit server executable allowlist, and an unexpired external attestation for every required control. It validates actual container configuration before execution. Nonroot 65532, read-only root/source, dedicated noexec tmpfs, network none, no capabilities/new privileges, PID64, memory256MiB, CPU1, time/output bounds, sanitized CLI environment and owned-container cleanup are requested and inspected. No credentials, host Docker socket, host fallback, repository command or build is passed. Egress is entirely denied; an outbound DNS/IP policy adapter is not implemented/activated.

A real Docker daemon is unavailable. No image is pulled and no container/scanner is run. There is no production attestation issuer. POSIX source files are owner-read-only and may be unreadable by UID65532; a private readable service UID/ACL arrangement must be verified without widening host access. Docker Desktop mount path translation, daemon identity binding, host-secret denial, network/resource/OOM/cancel/orphan enforcement all remain live acceptance requirements. Driver-double tests demonstrate checks, not enforced isolation.

All shared Auth, Canvas, platform, Sentinel, UI, package and lock files remain unchanged. Additions to contracts/source coverage are backward compatible; Demo behavior and original tests remain intact. Shared SQL extension artifacts are proposals only, requiring platform-owner review and separate target authorization. No G02 input has been read or assumed.


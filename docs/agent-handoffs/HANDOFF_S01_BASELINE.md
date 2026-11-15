# Verified S01 baseline for S02

Repository: `wilanta/wetscan-prototype`. Remote master fetched and verified at `e39b01da167052b8ef9b0ebe369a757fdea729bf` (PR #3 merge), including S01 commit `60182d08d3d59c4b4d1da420df2dab8eeae0c2e0`. The initial working tree was clean. Existing master was fast-forwarded; S02 branch `feat/sentinel-s02-telemetry` was created without clone/worktree/application creation.

## Evidence preserved, not rerun

S01 reports record 14/14 genuine PostgreSQL acceptance cases on the separately approved `wetscan_s01_test`, initial development `wetscan_dev` up/up idempotency, and two private-parent IPC worker lifecycle cycles (22/20 ms shutdown, exits 0, stopped heartbeat, no worker session/listener afterward). Final publication recorded 397/397 unit/contract tests and production build/typecheck/lint; the browser suite had one brief-loading-state failure followed by an unchanged 6/6 standalone rerun. Sources: `docs/SENTINEL_H01_ACCEPTANCE.md`, `docs/SENTINEL_S01_VALIDATION.md`, PR #3. These are historical S01 results, not S02 acceptance or fresh database queries.

## Approved foundation

One local Docker Desktop Linux PostgreSQL 17.12 instance, loopback `127.0.0.1:55432`, dedicated volume, dev/test databases with different comment markers. Passwords live outside repository/OneDrive; local env/approval/evidence files are ignored. Never print or commit them. S01 migration `0001_foundation` pair checksum `dd061a60b123284882f154c438de3a171d60967b7b07a4e07200b6693f4eb778`; prior plan `7dac33cd59f2373d6ef87a94d6f588c723a8ce34f3115c47676d7353f7d61e43`. New SQL requires a new exact-plan review and target approval; old S01 approvals do not approve S02.

Shared `src/platform/` supplies gated purpose-specific pools, scoped transactions, durable jobs (lease/revision/fence, retries, cancellation, idempotency), outbox, health, bounded retention and migration runner. Existing schemas/ledger/runtime records must survive S02. App role `wetscan_app` is project/workspace scoped through forced RLS; `wetscan_sentinel_worker` is a trusted cross-project Sentinel service, not a per-project raw-SQL principal. Migrator owns schema objects. Sentinel and Guard worker processes remain separate. Only Sentinel maintenance is installed; no Guard enrollment/scanner/provider is enabled.

## Frozen integration boundaries

- Do not rewrite `src/features/sentinel/{types,contracts,platform-contracts,scope,integrations}.ts` S00 contracts. `SentinelScope` reuses Guard Scope. Four v1 event kinds: `auth.failed`, `http.suspicious_path`, `http.request`, `ghost.decoy_triggered`. Stored events carry server-bound source/scope and evidence provenance.
- Reuse existing Auth session and Canvas fresh repository authorization (`authorizeSentinelProject` / `authorizeCanvasProject` / `workspaceScope`). A project string, source ID or producer body is not authorization. Identity remains `github-user-<id>:<workspace>` / `github-<repository id>`.
- Auth encrypted files and Canvas storage/analysis remain owned by their modules. Guard audit/inventory adapters remain unavailable; scanner fixtures are not live producer evidence.
- Existing Orderly Demo routes/state/reset remain demo. Live Sentinel telemetry must use actual persisted records and explicit controlled-test/runtime labels. New telemetry UI must preserve existing visual components and navigation semantics. No S03 detection, alerts or incidents in S02.

## Limits and approval state

Windows tool/PTY Ctrl+C propagation is unreliable even for bare Node. Private inherited IPC is the verified worker shutdown route; Linux signal delivery is untested. Worker old-space 256 MiB is not a hard RSS/CPU limit. Existing mutable workspace names require a future rename/transfer policy; no hidden identity migration. At-least-once processing requires fenced/idempotent future effects. S01 runtime-only test approvals are closed; keep worker stopped absent fresh permission.

The owner explicitly authorized full S02 implementation, UI, controlled emitter and tests, with no development migration until exact-plan/target approval. H02 still needs an explicitly owned project/application/environment and emitter configuration for genuine integration acceptance. Prepare all code/SQL/tests and the S02 handoff at the approval gate; never mark S02 complete from fixtures or unit tests.

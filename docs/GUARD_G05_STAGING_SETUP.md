# WetScan Guard G05 Local Environment & Synthetic Staging Setup

> Preserves G02 (`127.0.0.1:55434`, `wetscan-g02-local-pg`) and G04 (`127.0.0.1:55435`, `wetscan-g04-local-pg`) completely untouched.

## 1. Provision Isolated G05 PostgreSQL 18 (`127.0.0.1:55436`)

```bash
node --conditions=react-server --import tsx scripts/guard-g05-local-env.ts provision --port 55436
node --conditions=react-server --import tsx scripts/guard-g05-local-env.ts verify
```

This creates:
- Docker container `wetscan-g05-local-pg` (`postgres:18.3-alpine` pinned by digest) on `127.0.0.1:55436` with volume `wetscan-g05-local-pg-data` and database `wetscan_dev_guardg05`.
- Private runtime credential directory under `%LOCALAPPDATA%\WetScanGuardG05\` (or `~/.local/share/WetScanGuardG05`) containing role password/approval files for `wetscan_guard_app`, `wetscan_guard_worker`, `wetscan_guard_migrator`, plus a 256-bit `vault.key`. None of these files are tracked in Git.
- Base platform & Guard `0001_guard` migrations plus additive G05 `0002_g05` migrations logged in `guard.g05_schema_migrations`.

Print exportable environment variables:

```bash
node --conditions=react-server --import tsx scripts/guard-g05-local-env.ts env
```

## 2. Provision Isolated Docker Synthetic Staging Target (`127.0.0.1:4115`)

```bash
node --import tsx scripts/guard-g05-staging.ts start
```

This builds `wetscan-g05-staging:local` from `worker/guard/g05-staging/Dockerfile` and launches container `wetscan-g05-synthetic-staging` with:
- Read-only root filesystem (`--read-only`), `--cap-drop ALL`, `--security-opt no-new-privileges`, `--cpus 0.5`, `--memory 256m`, `--pids-limit 64`, non-root `staging` user.
- Ephemeral synthetic credentials (`user_a`, `user_b`, `privileged`) saved to `%LOCALAPPDATA%\WetScanGuardG05\staging-runtime.json`.
- Target authorization pin file written to `%LOCALAPPDATA%\WetScanGuardG05\synthetic-target-pin.json` (`GUARD_G05_SYNTHETIC_TARGET_FILE`), pinning `http://127.0.0.1:4115` and `wetscan-g05-synthetic-staging-v1`.

Check status or stop cleanly:

```bash
node --import tsx scripts/guard-g05-staging.ts status
node --import tsx scripts/guard-g05-staging.ts stop
```

## 3. Synthetic Staging Application Behavior & Fault Toggles

The synthetic target (`worker/guard/g05-staging/server.ts`) implements authenticated endpoints (`/api/auth/login`, `/api/auth/logout`, `/api/auth/whoami`), public catalog (`/api/public/catalog`), redirect probe (`/api/redirect-probe`), admin summary (`/api/admin/audit-summary`), and stateful workflow resources (`/api/orders`, `/api/orders/:id`, `/approve`, `/lock`, `/edit`, `/submit`).

By default all protections are **ON** (hardened baseline). Authorized tests can toggle explicit fault flags via `POST /api/synthetic/faults` with header `x-wetscan-control-secret` (or reset cleanly via `POST /api/synthetic/reset`):
- `ownershipBypass` — lets User B read User A's orders.
- `workflowBypass` — allows `draft -> locked` bypassing approval.
- `stateTransitionBypass` — permits editing locked orders.
- `replayBypass` — permits duplicate submission without idempotency enforcement.
- `unauthorizedModBypass` — allows User B to modify User A's orders.
- `falseErrorWithMutation` — returns HTTP 403 while mutating the underlying persisted record (detectable via Integrity pre/post state comparison).
- `weakHeaders`, `permissiveCors`, `brokenAdminAuth`, `ignoreSessionExpiry`, `ignoreSessionRevocation`, `openRedirectTarget`.

## 4. Run Isolated G05 Worker & Dev App

Start the standalone G05 worker alongside your configured environment (`GUARD_G05_ENABLED=1` and env variables from step 1 + step 2 `pin-env`):

```bash
node --import tsx scripts/guard-g05-worker.ts --loop
```

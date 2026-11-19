# HANDOFF_S11 - hardening, regression, operational readiness, H09

Branch `feat/sentinel-s11-hardening-handoff` from `master@0ab9256`; code candidate `1e446cd`. No migration. Plan hash unchanged
(`94f99d99...831c`). Next migration number would be `0010`.

## What changed (code)
`.github/workflows/ci.yml` (new) - `scripts/sentinel-secret-scan.ts` (new, `npm run sentinel:secret-scan`) -
`src/platform/health.ts` (`schemaStatus`, optional `expected` plan) + call sites `worker/sentinel/runtime.ts`,
`scripts/sentinel-health.ts` - `next.config.ts` (security headers) - tests: `tests/sentinel/s11-{route-matrix,secret-scan,security-headers}.test.ts`,
`tests/sentinel/s11-hardening.postgres.integration.ts` + `s11-postgres.config.ts` (`npm run test:sentinel:s11:postgres`),
`tests/platform/schema-status.test.ts`.

## Where things are
Docs: `docs/SENTINEL_S11_*.md` (architecture, test matrix, validation, security review, evidence register, runbook, release
readiness, H09). Receipts: `docs/evidence/s11/`. Dev DB private material (backup dump + hash, snapshots, new approvals,
notifier password file) lives in `C:\Users\sheil\.wetscan-sentinel\s11-20261119-134511-2134\` - **outside the repo; never commit**.

## State of `wetscan_dev` (127.0.0.1:55432)
At `0009_external_intelligence`, notifier role exists (+`CONNECT`), runtime approval at the private path above bound to plan
`94f99d99...831c`. **Nothing is activated.** 8 queued + 1 failed historical `sentinel.telemetry.accepted` jobs remain.
Restore path: the dump in the private directory (sha256 `b65c8793...a8f4`); restore into a fresh database, do not `down`.

## Do not
- Edit `infra/sentinel/provision-roles*.sql` or any migration (hashed into the plan; invalidates every approval).
- Point any test harness at `127.0.0.1:55432` (harnesses only check the hostname).
- Run prettier over `src/features/sentinel/components`; run Canvas Playwright without `git checkout -- evidence` afterwards.
- Junction/symlink `node_modules` into a worktree.
- Treat `telemetry: "not_implemented"` or a green Vercel badge as signal.

## Next steps (owner)
O-1 real-session E2E, O-2 consented provider test, O-3 role SQL plan decision, O-4 original dev volume, O-5 Actions + branch
protection, O-6 record H09 (see `SENTINEL_S11_H09_DECISION.md`). First engineering follow-ups: nonce-based CSP, pre-auth ingest
bucket, activate detection on dev DB for one project after deciding what to do with the historical queued jobs.

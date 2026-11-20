# Handoff: Guard G04 (CI/CD security gate)

Agent-neutral. Written for: the next engineer continuing G04 or starting G05. Status **`G04 PARTIALLY_VERIFIED`** (see [validation](../GUARD_G04_VALIDATION.md), [readiness](../GUARD_G04_RELEASE_READINESS.md)).

## Git

* Repository `wilanta/wetscan-prototype`, branch `feat/guard-g04-cicd`, worktree `../wetscan-guard-g04` (separate from the G02 and Canvas worktrees).
* Base: `origin/master` `5e52ac2` (G02 PR #19 merged; verified with `git merge-base --is-ancestor`). No dependency on an unmerged branch. No G03 branch existed on the remote; G03 files were not read or changed.
* Commits: `1132a50` core modules, `6ea2ea9` migration/store, `93b3185` service, `ce5f4d6` HTTP/runtime/seams, `26fbaa0` UI, `82c905a` real-run fixes + harness, `03a4205` browser hygiene + docs, then the docs/handoff commit. Draft PR: see the pull request for this branch. Do not merge automatically.

## What exists

Architecture and semantics: [GUARD_G04_ARCHITECTURE.md](../GUARD_G04_ARCHITECTURE.md). Owner setup: [GUARD_G04_PROVIDER_SETUP.md](../GUARD_G04_PROVIDER_SETUP.md).

API (authenticated and project-scoped except the webhook; non-GET needs same-origin):

| Route | Purpose |
| --- | --- |
| `POST /api/guard/webhooks/github` | signed GitHub deliveries; only enqueues |
| `GET /api/guard/projects/{id}/g04/overview` | policy, triggers, checks, evaluations, deployments, schedules, deliveries, audit, readiness |
| `GET/PUT .../g04/policy` | policy + immutable history; optimistic `expectedRevision`; enabling re-verifies GitHub App access |
| `GET/POST .../g04/triggers` | list / queue a manual scan (exact commit optional) |
| `GET/POST .../g04/checks` | list / re-publish a stuck check (no rescan) |
| `GET .../g04/access` | live App permission + required-check-rule observation |
| `GET/PUT .../g04/mapping` | Vercel project mapping (identity verified before storing) |
| `GET/POST .../g04/deployments` | list / read-only provider verification |
| `POST .../g04/gate` | the ONLY provider write (register Vercel Deployment Check); needs typed confirmation |
| `GET/PUT .../g04/schedules` | bounded schedules |

Database: `migrations/guard/g04/0002_g04.{up,down}.sql`, own ledger `guard.g04_schema_migrations` (checksum `fbfdd7f171f15ec3d6ca35678d9559266dd678cd57b9ff6c544f33fc7da04195`), applied with `npm run guard:g04:migrate` as the migrator role. Guard 0001 plan hash `b63e1e85…869d` is unchanged, so G02 approvals stay valid.

## The G04 development environment (created by this work; not G02's, not G03's)

| Item | Value |
| --- | --- |
| Container / volume | `wetscan-g04-local-pg` / `wetscan-g04-local-pg-data` (labels `wetscan.env=g04-local`) |
| Listener | `127.0.0.1:55435` (G02 uses 55434) |
| Database | `wetscan_dev_guardg02` on that server (name pinned by G02 validators), new marker `wetscan-s01:8e8e18f9-ff0b-49cf-afb5-2ce606da2c0e` |
| Private files | `%LOCALAPPDATA%/WetScanGuardG04/` (`current.json` pointer; passwords/approvals ACL-protected; never printed) |
| Create | `GUARD_LOCAL_ENV=g04 node --conditions=react-server --import tsx scripts/guard-g02-local-env.ts provision --port 55435`, then `GUARD_LOCAL_ENV=g04 npm run guard:g04:migrate` |
| Stop / start | `docker stop` / `docker start wetscan-g04-local-pg` |
| Teardown (owner approval required: destroys data) | remove that container, that volume, the `WetScanGuardG04` directory, and the throwaway `g04_migtest_*` databases left by the migration test |

The scanner image `wetscan-g02-scanners:local` is shared (read-only use). The real run used a runtime config written by `scripts/guard-g04-config.ts` (repository `wilanta/wetscan-g02-acceptance`, branches `main`, `g04/*`). A branch `g04/vulnerable` (at the vulnerable commit) was created in that owner repository for the real run. A copy of the repository's `.env.local` was placed in this worktree (git-ignored) for the real run; delete it when done.

## How to run it

```
npx vitest run tests/guard/g04                  # offline (64)
npm run test:guard:g04:postgres                 # real PostgreSQL (32)
node tests/guard/g04/browser/run.mjs            # build + fixture-login browser acceptance (13); G04_SKIP_BUILD=1 reuses a build
# real pipeline: needs a scanner measurement < 1 h old; run nothing else meanwhile (OSV is load sensitive)
npm run guard:dev   and   npm run guard:g04:dispatcher        # with GUARD_G04_ENABLED=1 and the G02 GUARD_* references
node --conditions=react-server --env-file=.env.local --import ./scripts/server-only-stub.mjs --import tsx scripts/guard-g04-e2e.ts seed|send|rerun|state
```

`server-only` has no Node package; standalone scripts load `scripts/server-only-stub.mjs`.

## Decisions worth knowing

* Policy decision is not enforcement: `assessEnforcement` is the only place `enforced` can become true.
* No scanner in HTTP handlers; the dispatcher is the only worker, the webhook handler only writes rows.
* Automation authority is the stored owner identity re-verified against GitHub on every use; no browser session and no personal token.
* One check run per (project, commit); the intent is stored before the GitHub call.
* A missing Checks permission does not stop scanning; it fails check publication visibly.
* G02 seams: `githubSourceAccess(..., authorizer?)`, `productHostService(..., automationSource?)`, `branchAllowed` (trailing `/*`), `GUARD_LOCAL_ENV` in `scripts/guard-g02-local-env.ts`.

## Sandbox objects created for the merge-gate acceptance (visible to the owner, in `wilanta/wetscan-g02-acceptance`)

Ruleset `27707416` (active, only `refs/heads/g04/gate-test-target`); branches `g04/gate-test-target`, `g04/gate-vuln`, `g04/gate-clean`, `g04/gate-warn`, `g04/vulnerable`, `g04/webhook-probe`; open PRs #2 (BLOCK), #3 (clean), #4 (WARN), all unmerged and titled do-not-merge; PR #1 closed. To remove: `gh api -X DELETE repos/wilanta/wetscan-g02-acceptance/rulesets/27707416`, close the PRs, delete the branches (needs your approval; nothing here deletes them).

Helper scripts (git-ignored, in `.local/`): `manual.ts` (queue a manual trigger), `setpolicy.ts` (policy revision), `rerequest.ts` (GitHub check re-request with the App token), `cancel.ts` (G02 cancel of one stranded scan). The G04 policy history shows each acceptance revision (2 satisfy, 3 reduced engines, 4 warn, 5 unknown severity warns, 6 restored to defaults).

## Do not

Change GitHub App settings, repository rules or Vercel projects silently; call `gate` (the Vercel write) without owner approval; reuse the G02 database for G04; enable `GUARD_G04_ENABLED` globally; restart the dispatcher mid-scan (it strands the G02 job); touch G03 files.

## Next steps

1. Owner actions in the readiness table (Checks permission, webhook, optional ruleset on a test branch, Vercel test project and token).
2. With those, run the real acceptance (GitHub-originated delivery, check run id and commit recorded, merge blocked and permitted on the test branch, Vercel held and released) and store the identifiers under `docs/acceptance/guard-g04/`.
3. Re-run the fixed-commit scan on a quiet machine to obtain a real PASS/WARN/INCOMPLETE verdict.
4. A small G03 adapter that only displays G03's published retest status beside an evaluation, once G03's contract is merged.
5. Optional: a CI job for `test:guard:g04:postgres` (needs the Docker provisioning helper on the runner).

## Changed-file manifest (vs `5e52ac2`)

- `CHANGELOG_FIXES.md` (modified)
- `docs/INTEGRATION_BACKLOG.md` (modified)
- `migrations/guard/g04/0002_g04.down.sql` (new)
- `migrations/guard/g04/0002_g04.up.sql` (new)
- `package.json` (modified)
- `scripts/guard-g02-local-env.ts` (modified)
- `scripts/guard-g04-config.ts` (new)
- `scripts/guard-g04-dispatcher.ts` (new)
- `scripts/guard-g04-e2e.ts` (new)
- `scripts/guard-g04-env.ts` (new)
- `scripts/server-only-stub.mjs` (new)
- `src/app/api/guard/projects/[projectId]/g04/[resource]/route.ts` (new)
- `src/app/api/guard/webhooks/github/route.ts` (new)
- `src/app/app/projects/[projectId]/guard/[[...section]]/page.tsx` (modified)
- `src/features/guard/g04/checks.ts` (new)
- `src/features/guard/g04/db.ts` (new)
- `src/features/guard/g04/g02-port.ts` (new)
- `src/features/guard/g04/github.ts` (new)
- `src/features/guard/g04/http.ts` (new)
- `src/features/guard/g04/migrations.ts` (new)
- `src/features/guard/g04/panel.tsx` (new)
- `src/features/guard/g04/policy.ts` (new)
- `src/features/guard/g04/provider.ts` (new)
- `src/features/guard/g04/runtime.ts` (new)
- `src/features/guard/g04/schedule.ts` (new)
- `src/features/guard/g04/service.ts` (new)
- `src/features/guard/g04/store.ts` (new)
- `src/features/guard/g04/vercel.ts` (new)
- `src/features/guard/g04/webhook.ts` (new)
- `src/features/guard/live/github-source.ts` (modified)
- `src/features/guard/live/live-workspace.tsx` (modified)
- `src/features/guard/live/product-host.ts` (modified)
- `src/features/guard/live/product-policy.ts` (modified)
- `tests/guard/g04/browser/cleanup.mjs` (new)
- `tests/guard/g04/browser/fixture.mjs` (new)
- `tests/guard/g04/browser/g04.spec.ts` (new)
- `tests/guard/g04/browser/playwright.config.ts` (new)
- `tests/guard/g04/browser/run.mjs` (new)
- `tests/guard/g04/checks-schedule.test.ts` (new)
- `tests/guard/g04/fixtures.ts` (new)
- `tests/guard/g04/migration.postgres.integration.ts` (new)
- `tests/guard/g04/pg-env.ts` (new)
- `tests/guard/g04/policy.test.ts` (new)
- `tests/guard/g04/postgres.config.ts` (new)
- `tests/guard/g04/service.postgres.integration.ts` (new)
- `tests/guard/g04/store.postgres.integration.ts` (new)
- `tests/guard/g04/vercel.test.ts` (new)
- `tests/guard/g04/webhook-route.test.ts` (new)
- `tests/guard/g04/webhook.test.ts` (new)
- `tests/guard/live/live-ui.spec.ts` (modified)
- `docs/GUARD_G04_ARCHITECTURE.md`, `docs/GUARD_G04_VALIDATION.md`, `docs/GUARD_G04_RELEASE_READINESS.md`, `docs/GUARD_G04_PROVIDER_SETUP.md`, `docs/agent-handoffs/HANDOFF_GUARD_G04.md` (new); `docs/GUARD_IMPLEMENTATION_STATUS.md`, `docs/INTEGRATION_BACKLOG.md`, `CHANGELOG_FIXES.md` (modified)

## Copy-ready G05 continuation prompt (do not start G05 automatically)

> Continue WetScan Guard after G04. Read AGENTS.md, docs/agent-handoffs/HANDOFF_GUARD_G04.md, docs/GUARD_G04_RELEASE_READINESS.md and docs/specs/guard/G05.md. First confirm which G04 owner gates are closed (GitHub App Checks permission and webhook, required-check ruleset on a test branch, Vercel test project). Do not claim any enforcement without the provider evidence described there. Keep Guard disabled by default, never read or print credentials, keep the G04 and G02 migrations immutable, and implement G05 only on its own branch and worktree.

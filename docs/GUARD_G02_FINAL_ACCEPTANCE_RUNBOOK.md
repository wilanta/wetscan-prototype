# G02 final acceptance and Vercel recovery — owner runbook (20 November 2026)

Written for: the owner, who must perform the two steps an agent cannot (an interactive GitHub login in the app, and a look at one Vercel log), and for the engineer who verifies the result afterwards.

**Status on `master` `f4a54f8`: G02 PARTIAL, `VERCEL_DEPLOYMENT_VERIFIED` not met.** An agent session on 20 November found neither gate reachable from the development machine. Nothing below was executed against the product path; no receipt in this file is a result.

## Why the agent could not finish

| Gate | What was checked (names/existence only, no secret read) | Result |
|---|---|---|
| Owner GitHub session in the app (G02-C1) | The app's login is a browser OAuth redirect for the owner; no session cookie, token or `.local` Guard config is available to an agent, and borrowing a browser profile is not acceptable. | Needs the owner. |
| Operational database `wetscan_dev_guardg02` (G02-C4/C6/C7) | No `GUARD_*` environment, no `GUARD_PRODUCT_CONFIG_FILE`, no app/worker password references, no `product.runtime.json` on this machine (they were provisioned on another machine). PostgreSQL on 5432 is the Sentinel dev server; a Sentinel credential must not be used to look at another database. | Needs the owner's process and references. |
| Vercel log (VERCEL-C1) | No Vercel CLI, no `~/.vercel`/`com.vercel.cli` auth, no `.vercel` project link. | Needs the owner's Vercel login. |

## Fixed targets (verified against GitHub on 20 November)

- Repository `wilanta/wetscan-g02-acceptance`, id `1464294716`, private, owner `wilanta`, default branch `main`.
- Vulnerable commit `c1330c63ef9bbe7fc0dcf435c6653488f269b827` ("Add vulnerable acceptance fixture (synthetic)").
- Fixed commit `3c6a99ec42b8259ab659a24c2f0d94822b389872` ("Fix acceptance fixture").
- Historical comparison only (isolated PostgreSQL, 19 November): vulnerable 34 findings (SAST 3, SCA 5, Secrets 1, IaC 25), fixed 0 (`completed_partial`, IaC coverage partial). Not assertions.
- Scope: exactly two NEW scans, profile Standard (SAST, SCA, Secrets, IaC, SBOM), no container. Job `e3025169…` is historical and is never replayed.

## A. Product-path acceptance (owner present, ≈30 minutes)

Keep `GUARD_PRODUCT_ENABLED=0` until step 4 and return it to `0` in step 9. Never enable it globally.

1. Start the app in the owner's normal process (`npm run guard:dev`, existing Auth config, existing non-secret `GUARD_PRODUCT_CONFIG_FILE` and app/worker references). Do not re-provision the database, reset passwords, or copy credential files.
2. Log in with GitHub as `wilanta`; open `/app/projects/github-1464294716/guard`. Run the existing read-only preflight (button, or the Console snippet in `docs/GUARD_G02_LIVE_OPERATOR.md`). Expected: provider authorization verified, target configuration verified, policy binding verified, sandbox qualified, both database role/schema/RLS probes verified, `runtimeOperations=0`. Any "unknown" stops the run.
3. Read-only database identity (owner, `BEGIN READ ONLY … ROLLBACK`): `current_database()` = `wetscan_dev_guardg02`, the target marker, owner `wetscan_guard_migrator`, platform ledger = 3 versions (`0001`–`0003`), `guard.schema_migrations` = 1, forced RLS on, existing `guard.scans`/`platform.jobs` rows listed and left untouched. Take a backup (`pg_dump`) before any configuration change; none should be needed.
4. Ensure the runtime policy names exactly this repository, branch `main`, engines `sast,sca,secrets,iac,sbom`, `maxAttempts=1`, and a validity window of at most two hours; measured scanner qualification must be fresh (it expires one hour after measurement: rerun `qualify.ts --full` + `measured.ts` per `worker/guard/installation/README.md` and run nothing else during the physical runs). Then set the flag to `1` for this process only.
5. Scan A: Guard Live → resolve the pinned commit → confirm it equals `c1330c63ef9b…b827` → Start repository scan. Wait for a terminal state. Do not click Retry/Resume.
6. Scan B: same with `3c6a99ec42b8…9872`.
7. Verify (record scan ids, job ids, image digest, versions): API record = PostgreSQL record for both scans (commit, status, revision, engine runs, finding count, evidence digests); `platform.jobs` has exactly two new jobs, `attempts=1`, `state=completed`, no lease owner/token; findings for scan A all carry commit A and none appear on scan B; the synthetic canary appears redacted nowhere unredacted; report download works; Guard Live Findings/Scan history/Releases show the stored rows (screenshots of the Live UI for both scans); cross-project request to another project id is refused.
8. Restart the app and the worker; reopen both scans (still there, same revision); confirm `docker ps -a --filter label=wetscan.module=guard` is empty and no `wetscan-g01-snapshot-*` source directory remains in `%TEMP%`.
9. Set `GUARD_PRODUCT_ENABLED=0`, restart, run the preflight/GET once and record the actual process value as the deactivation receipt. Commit only metadata-only evidence under `docs/acceptance/guard-g02/<date>/` (no cookies, tokens, passwords, approval files, raw secrets).

Mapping: C1 step 2; C2 steps 5–6; C3 steps 5–8; C4 step 7 (scan A); C5 step 7 (scan B); C6 step 7 screenshots; C7 steps 7–8; C8 steps 8–9; C9 CI; C10 evidence. If counts differ from the historical comparison, investigate scanner versions/rules/coverage; never adjust expectations to fit.

## B. Vercel (owner, one command)

```
npx vercel login
npx vercel inspect dpl_2hGjinoL3BWSQvHa2uzuH2mgtKr6 --logs
```

(or open the deployment's build log from the Vercel check on PR #17 / `master`). Paste the error lines. What is already known:

- Green on throwaway probes (each = `master` plus a subset of this change): master + empty commit; docs/CI/attributes only; config only (`package.json`, `next.config.ts`, `.gitignore`, migrations); shared auth files; components + non-live Guard code; everything except `worker/guard/installation/**`; variants missing only `build-context.ts` or only `github-acceptance.ts` + `acceptance-fixtures.ts`.
- Red: every state that contains the whole `worker/guard/installation/**` tooling, including with master's `next.config.ts`, with Turbopack or webpack as the build script, with Next's type-check scoped to `src` (`tsconfig.build.json`, now on `master`), and with `.vercelignore` listing `worker/guard/installation/` (probe on 20 November; either not honored for Git deployments or not the cause).
- Locally and on GitHub Actions the same sources build (webpack and Turbopack, `VERCEL=1 CI=1`), the tooling is in no function trace (`.next` 198 MB, 356 files), and the traces are small (≤ 22 MB).

Do not guess a fix beyond this without the log: the next probes should follow the actual error (size/limit, memory/time, a specific file, or a Vercel project setting).

## What stays unchanged

Guard disabled by default; historical evidence and the failed `e3025169` job untouched; no Sentinel migration; Guard Demo, Auth, Canvas and S11 headers unchanged; G03–G06 not started.

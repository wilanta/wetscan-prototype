# Guard G04: CI/CD security gate, GitHub Checks, Vercel verification, schedules

Written for: engineers who will operate, review or extend G04. Status and evidence are in [GUARD_G04_VALIDATION.md](GUARD_G04_VALIDATION.md); readiness and blockers in [GUARD_G04_RELEASE_READINESS.md](GUARD_G04_RELEASE_READINESS.md); owner setup in [GUARD_G04_PROVIDER_SETUP.md](GUARD_G04_PROVIDER_SETUP.md).

## Flow

```
GitHub event ──► POST /api/guard/webhooks/github   (raw-byte HMAC, size/event allowlist, delivery-id dedupe)
                   │  route by repository → stored project policy → installation must match → branch/trigger must match
                   ▼
            guard.g04_triggers  (durable queue; exact commit SHA; supersedes older revisions of the same PR/branch)
            guard.g04_check_runs (intent "queued" – visible on GitHub as soon as the dispatcher publishes it)
                   │
                   ▼   (separate process: scripts/guard-g04-dispatcher.ts — the webhook handler never scans)
   dispatcher: claim trigger (lease) → re-verify GitHub App access + permissions → branch head == commit?
               → ensure ONE G02 scan for (commit, branch, profile, engines) through the existing G02 product host
               → read stored scan → evaluatePolicy(scan, policy, expectedCommit) → guard.g04_evaluations
               → plan + publish GitHub Check Run (create/update, idempotent) → read-only provider verification
                   │
                   ▼
   GitHub check "WetScan Guard / Security gate"  ·  Vercel deployment evidence  ·  Guard UI (CI/CD Gate tab)
```

There is no second scanner and no second queue for scans: scanning is the unchanged G02 pipeline (qualified Docker sandbox, source broker, PostgreSQL job lease). G04 adds a durable *trigger* queue in front of it and a policy/check/deployment layer behind it.

## Modules (`src/features/guard/g04/`)

| File | Responsibility |
| --- | --- |
| `policy.ts` | `SecurityPolicy` (strict closed schema), defaults, `evaluatePolicy` (pure, deterministic), branch/trigger matching |
| `webhook.ts` | raw-body read with hard limit, `X-Hub-Signature-256` verification (constant time, rotation secret), envelope, event normalization |
| `github.ts` | GitHub transport (fixed origin, no redirects, fixed error classes) and App installation tokens (repository-scoped, revoked after use) |
| `checks.ts` | decision → conclusion mapping, check output, idempotent create/update, read-only required-check observation |
| `provider.ts` | provider-neutral `DeploymentProvider` interface and `assessEnforcement` (policy decision vs enforcement evidence) |
| `vercel.ts` | the only provider adapter (read-only by default; one explicit write: register the Deployment Check) |
| `schedule.ts` | interval/cron validation (floor: 60 min) and next-run maths |
| `store.ts` | PostgreSQL persistence (scoped RLS transactions, atomic claims, supersession) |
| `service.ts` | `G04Service`: ingest, dispatch, schedule, publish, enforcement refresh |
| `g02-port.ts` | the real `ScanPort`: automation authority + G02 product host |
| `runtime.ts`, `db.ts` | server composition (off unless `GUARD_G04_ENABLED=1`) |
| `http.ts` | webhook handler and project-scoped API |
| `panel.tsx` | UI tab inside the existing Guard Live workspace |

## Decision semantics

`PASS | WARN | BLOCK | INCOMPLETE`, produced only by `evaluatePolicy(scanJob, policy, {expectedCommit, policyRevision})`.

* Defaults: critical/high **BLOCK**, medium **WARN**, low/info non-blocking; every default is configurable per project.
* Findings below `minBlockConfidence` and (optionally) `potential` findings downgrade to WARN instead of blocking.
* Missing, failed or partially-covering required engines, partial/unverified source coverage, an unfinished/failed/cancelled scan, unknown severity (default) → **INCOMPLETE**. There is deliberately no option that turns missing coverage into PASS (`onMissingCoverage` is `incomplete | block`).
* A scan of a different commit than the one gated never decides the result (`stale_commit` → INCOMPLETE; its findings are not counted).
* BLOCK outranks INCOMPLETE (both fail the check; the blocker is the more useful fact).
* Each evaluation stores the policy revision, policy digest, commit SHA, scan id and a digest over every decisive input.

## GitHub Checks mapping

| Decision | Conclusion (default) | Passes a *required* check? |
| --- | --- | --- |
| PASS | `success` | yes |
| WARN | `neutral` (configurable `success`) | yes — WARN never blocks a merge |
| BLOCK | `failure` | no |
| INCOMPLETE | `action_required` (configurable `failure`) | no |
| superseded / cancelled revision | `cancelled` | no |

One check run per (project, commit), found again by `external_id = g04:<sha>` so retries and reruns never duplicate it. In-flight states (`queued`, `in_progress`) have no conclusion. A late `in_progress` can never overwrite a `completed` row (enforced in SQL). The intent is stored *before* the GitHub call (`published=false`), so a crash between GitHub and the database is retried with exponential backoff (and `Retry-After` for rate limits), never lost.

Writes use only a GitHub App installation token scoped to the one repository with `checks: write` + `metadata: read`; the response permissions are verified (a silently narrowed token is refused) and the token is revoked right after. No personal token exists anywhere in G04.

## Enforcement is separate from the decision

`assessEnforcement` returns `enforced: true` **only** with provider evidence: a registered Vercel Deployment Check, a production deployment *of this commit* that is `READY`, not promoted, with checks not succeeded, while the decision is not PASS. Three distinct claims are reported and never merged:

1. **GitHub merge enforcement** — true only if a required-status-check rule naming the Guard check is *observed* (rulesets, then classic protection; read-only; Guard never changes repository rules). A published check alone is reported as "not a required branch rule".
2. **Vercel production promotion** — Vercel *Deployment Checks* hold the **alias/promotion** step of production deployments until required checks pass (Vercel docs, `blocks: deployment-alias|deployment-promotion`). Team members can still Force Promote; Guard reports what the provider shows.
3. **Deployment creation / build** — never claimed. A Guard check cannot stop Vercel from creating or building a deployment.

Wrong commit, stale deployment (newer commit on the branch), provider outage/permission errors and missing commit metadata all produce `enforced: false` with a note; none of them releases anything.

## Persistence (`migrations/guard/g04/0002_g04.up.sql`)

Own ledger `guard.g04_schema_migrations`, so the frozen Guard 0001 plan hash and every G02 approval stay valid. Tables: `g04_policies`, `g04_policy_revisions`, `g04_deliveries`, `g04_audit`, `g04_triggers`, `g04_evaluations`, `g04_check_runs`, `g04_provider_mappings`, `g04_deployments`, `g04_schedules`.

* FORCE row-level security with the same scope contract as `guard.scans` (`wetscan.workspace/project/mode/module` settings, roles `wetscan_guard_app` / `wetscan_guard_worker` only). Deliveries and audit also allow the *unscoped* intake transaction (a webhook arrives before a project is resolved); scoped transactions see only their own project.
* Routing uses three `SECURITY DEFINER` lookups that return only routing keys (`g04_route`, `g04_installation_scopes`, `g04_work`); `g04_work` is executable by the worker role only.
* No `DELETE` grant anywhere (retention is operator-owned, as in G02). Unique partial index: at most one workspace may automate a repository.
* Provider mappings reject credential-looking content; Vercel/GitHub secrets live only in the process environment or private files.
* `down.sql` refuses to run over retained rows and never cascades.

## Webhook handling

Checked in this order, each failing closed: configured secret (else 503) → declared/actual size ≤ 1 MiB (413) → `application/json` (415) → event allowlist + delivery GUID format (400) → HMAC-SHA256 over the **raw** bytes, constant time, current or previous secret (401) → JSON parse. Then: delivery id recorded (a repeat is a no-op; the same id with different bytes is a 409 conflict and is audited; a delivery that crashed mid-way or failed is processed again idempotently) → repository → stored policy → installation id must equal the connected one → installation state `active` → trigger allowed for the (base) branch → admission bound (≤ 50 open triggers, ≤ 200/hour; else 429 + `Retry-After`).

Handled: `push`, `pull_request` (`opened`, `reopened`, `synchronize`, `ready_for_review`, `closed`), `check_run.rerequested` for **Guard's own app only**, `installation` (`suspend`, `deleted`, `unsuspend`…), `installation_repositories`, `ping`. Guard's own `check_run` created/completed events are ignored, so publishing a check can never start a scan. Fork pull requests are never fetched (the installation cannot read the fork): they get an immediate INCOMPLETE check.

## Ordering, staleness, concurrency

* A new trigger supersedes older pending/running triggers of the same PR (or branch) at a different commit; their checks become `cancelled`.
* At dispatch the branch head is re-read from GitHub: a trigger whose commit is no longer the head is skipped (`not_branch_head`), never scanned.
* A late result for a trigger that was superseded/cancelled meanwhile is stored but not published (`finishTrigger` only succeeds while `running`).
* Leases (10 min) are claimed atomically; a dead worker's trigger is reclaimed; one that died on its last attempt is failed closed as INCOMPLETE.
* Attempts ≤ 5 with exponential backoff; exhausted → INCOMPLETE check, never silence or success.

## Schedules

Rows in `g04_schedules` (≤ 5 per project, interval 60–10080 min or a 5-field UTC cron that is never more frequent than hourly). The dispatcher *atomically advances* `next_run_at` before enqueueing, so concurrent dispatchers fire a slot at most once and a crash skips a slot instead of storming. Each run re-checks policy enabled, installation active and live GitHub access; the trigger key `sched-<id>-<slot>` is idempotent. Five consecutive failures, a suspended installation, a removed repository or a disabled policy disable the schedule. No second scheduler framework was added.

## Automation authority (how a webhook may start a G02 scan)

G02 authorizes from a browser session. For automation the stored policy records the owner identity (`owner_actor`, `owner_user_id`, installation id) from the authenticated user who enabled the policy. Every scan builds a short-lived grant from that record **after** a fresh GitHub check (App installation token, repository id + full name must match, `contents`+`metadata` read present). Source reads still use repository-scoped installation tokens. Three narrow, backward-compatible seams were added to G02 code: an optional `authorizer` on `githubSourceAccess`, an optional `automationSource` on `productHostService`, and `branchAllowed` (exact or one trailing `/*` wildcard, chosen by the *server-owned* runtime config). Nothing from a request chooses a branch pattern, image, command or credential.

## G03 boundary

G04 neither generates nor fakes remediation or retest evidence. The UI and API report `remediation.g03 = NOT_CONNECTED`. When G03 publishes verified retest results, the intended hook is a new commit (the remediation PR/branch) that flows through the same webhook → trigger → evaluation path; a narrow adapter reading G03's published contract would only *display* its status next to the evaluation. No G03 file was read from, merged into or modified by this branch.

## Operating it

```
GUARD_G04_ENABLED=1 GUARD_PRODUCT_ENABLED=1 … npm run guard:dev            # app (webhook + API + UI)
GUARD_G04_ENABLED=1 GUARD_PRODUCT_ENABLED=1 … npm run guard:g04:dispatcher # the only place that does work
```

Environment: `GITHUB_APP_WEBHOOK_SECRET` (+ optional `GITHUB_APP_WEBHOOK_SECRET_PREVIOUS`), `GUARD_VERCEL_TOKEN` or `GUARD_VERCEL_TOKEN_FILE`, plus the existing G02 `GUARD_*` references. See the provider setup guide.

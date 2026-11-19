# Sentinel S05 — Controlled Response, Independent Verification & TTL Rollback

**Status: DEV accepted on an isolated throwaway PostgreSQL + real loopback fixture (19 Nov 2026). `live tested` against a real application: NOT_RUN. Production/WAF/CDN/cloud enforcement: not integrated by design.**
Plan: [docs/superpowers/plans/2026-11-19-sentinel-s05-controlled-response.md](superpowers/plans/2026-11-19-sentinel-s05-controlled-response.md).

## What S05 is — and is not
- One reversible operation, `temporary_rate_limit`, on an owner-approved **loopback fixture** (`http://127.0.0.1:<port>` / `[::1]`), proposed → human-approved → applied by the worker → **independently verified** → rolled back / expired.
- No production IP block, CDN/WAF/firewall/cloud change, no autonomous or AI enforcement. Severity (any level) never authorizes anything: only a target-specific approval does.
- `applied` is the target's receipt (`action_applied`). It is **never** "verified". `verified` exists only after the verifier recorded *blocked attack AND allowed benign control*. The S04 incident's `verificationStatus` stays `not_requested` (0004 CHECK/grants forbid advancing it; S05 never touches S04 tables).

## Data model (`migrations/sentinel/0005_response.{up,down}.sql`, additive)
| Table | Role |
|---|---|
| `response_targets` | Owner-provisioned H03 scope: origin (loopback regex CHECK), max TTL ≤ 600, approver actor ids, `allow_self_approval`, proof id, `enabled`. **app/worker cannot write it** (only `wetscan_migrator` policy). |
| `response_actions` | State machine row, revision-fenced, `UNIQUE(scope, idempotency_key)`, partial unique index = one active limit per target. |
| `response_audit` | **Append-only** (INSERT+SELECT only for app and worker): actor, from/to status, summary, ≤2 KB metadata incl. verifier evidence (baseline/attack/benign statuses). |
All three: `mode='live'` CHECK, `FORCE ROW LEVEL SECURITY`, scope policy copied from 0004. Down refuses while any response row or queued `sentinel.response.*` job exists (runner branch in `src/platform/migrations.ts`). `migrationPlan(through?)` gained an optional prefix so the accepted S04 review hash (`reviewedS04Plan`) still validates the 0001–0004 prefix.

## State machine
`awaiting_approval → approved → applying → applied → verification_pending → verified | failed | inconclusive`; exits `denied`, `apply_failed`, `rolled_back`, `expired`. Legality lives in `response/model.ts` (`transitions`) and is asserted on every move; `verified` is reachable only from `verification_pending`. `failed`/`inconclusive` still count as active (limit may still be on the target) until rolled back/expired.

## Roles and rules
| Step | Who | Rule |
|---|---|---|
| propose | any authorized project actor | `evaluatePolicy` (no severity input): target configured+enabled, TTL ≤ min(target, 600), incident not closed, evidence ≥ 1, no other active action on target |
| approve / deny | actor ∈ `approver_actor_ids` | proposer = approver only if `allow_self_approval` (approved for the local fixture; recorded as `selfApproved` in the audit). Approval window 15 min, re-evaluated at approve time, **re-checked in the worker at apply** (expired, disabled target, or forged approver ⇒ `expired`, target untouched) |
| apply / verify / expire / reconcile | worker only | No HTTP apply endpoint exists |
| rollback | approver | Idempotent; before apply it is terminal without touching the target; after apply a durable `expire` job removes the limit |

## Components
- `response/{model,policy,validation,store,activation}.ts` — pure rules + `ResponseStore` (same lock order as `IncidentStore`: binding → row `FOR UPDATE` → `expectedRevision`).
- `response/local-rate-limit-adapter.ts` — `ResponsePort` adapter. Loopback-literal origin only, exact equality with the DB target and `SENTINEL_RESPONSE_BASE_URL`, `redirect:"error"`, 3 s timeout, 4 KB cap, fixed error codes (no URL/token in errors). Unconfigured ⇒ `not_configured` without any request (NO-OP).
- `response/verifier.ts` — holds **no admin credential** and imports nothing from the adapter. Baseline probe is recorded *before* apply. Decision: clean baseline + attack 429 + benign 200 ⇒ `verified`; attack not blocked or benign blocked ⇒ `failed`; unclean baseline, timeout or outage ⇒ `inconclusive`.
- `worker/sentinel/response-handlers.ts` — `sentinel.response.{apply,verify,expire,reconcile}` jobs on the existing `PostgresQueue`; every handler re-reads durable state under a row lock and no-ops if done. TTL = durable `expire` job at `expires_at` (never a browser timer) **plus** fixture-side self-expiry; reconcile (30 s self-rescheduling) adopts a PUT that landed before a crash, closes rows whose target stopped enforcing, and removes orphan limits.
- `scripts/sentinel-response-fixture.ts` — in-repo Node fixture bound to `127.0.0.1` (`npm run sentinel:response:fixture`).
- API `GET/POST /api/sentinel/projects/[projectId]/responses` (`server/response-http.ts`); UI `components/live-responses.tsx` mounted at `/responses` for live projects only. **Orderly Demo is unchanged** and makes zero live API calls.

## Activation (fail-closed)
Worker starts the response queue only when `SENTINEL_RESPONSE_ENABLED=1` **and** the owner approval file has a `response` block `{mode:"live", workspaceId, projectId, notBefore, targetId, approvedUse:"local_fixture_rate_limit"}` matching the active incident scope; otherwise `approval_required` or the queue is never created. Env names: `SENTINEL_RESPONSE_ENABLED`, `SENTINEL_RESPONSE_BASE_URL`, `SENTINEL_RESPONSE_TOKEN`, `SENTINEL_RESPONSE_MAX_TTL_SECONDS` (documented; the 600 s cap is enforced in code/DB), `SENTINEL_FIXTURE_PORT`. **Operational note:** worker approvals are bound to the migration-plan hash, so adding `0005` requires a fresh owner approval before a worker with the new plan starts.

## API (strict wire)
POST bodies ≤ 8 KB, same-origin required, scope/URL fields rejected: `propose {incidentId,targetId,ttlSeconds,idempotencyKey}`, `approve|deny|rollback {actionId,expectedRevision,note?}`. GET: list, `?incidentId=`, `?actionId=` (with audit), `?view=targets`. Policy denial = `422 {error:"policy_denied",reasons[]}`; missing tables = `503 response_not_configured`.

## Retention (local-test policy and the eventual production policy)
Incidents with any response record are **pinned** (`retainIncidents` skips them): the audit is append-only and FK-RESTRICTed, so response rows and their incident live until an owner-approved archive. Production policy to decide before real targets: export-then-archive audit after N days with a signed manifest, then allow incident retention. Local test records may remain pinned.

## Residual risks
1. Verifier independence is **code-path/credential independence in the same worker process and DB role**, not a separate trust domain (ADR-2A). A separate restricted process is the documented upgrade.
2. The app DB role can write `response_actions` (needed for approve/rollback). A compromised app role could forge an approval; the worker re-validates approver, expiry and target but cannot detect a fully consistent forgery. Same trust boundary as S04 incident status.
3. If the worker is down at TTL the fixture self-expires, but the DB row stays active until the worker (or reconcile) closes it; the partial unique index then blocks new actions on that target.
4. Fixture ≠ a real application: the proof is of the mechanism, not of a real service's behavior.
5. No role model in Sentinel: approvers are a per-target list from H03 data.

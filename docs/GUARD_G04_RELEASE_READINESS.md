# Guard G04 release readiness

Written for: the owner. Decision as of 20 November 2026: **`G04 PARTIALLY_VERIFIED` — not production-ready, not "enforced"**. Guard stays disabled by default (`GUARD_G04_ENABLED` unset ⇒ webhook 503, UI "disabled", no scanning, no checks).

## What is safe to say

* Signed deliveries that reach the endpoint are verified over the raw bytes, deduplicated, authorized against the stored project policy and the connected installation, and turned into durable, commit-pinned triggers; nothing scans inside the HTTP request.
* The same triggers run through the unchanged G02 scanner pipeline; findings persisted by G02 decide a deterministic policy result bound to the exact commit and policy revision. Missing or partial coverage is never PASS.
* State survives restarts of the app, the dispatcher and PostgreSQL.
* No decision is labelled *enforced* without provider/repository evidence.

## What is NOT established (and why)

| Gap | Blocker | Exact owner action |
| --- | --- | --- |
| ~~Real GitHub Check Runs~~ | **CLOSED 20 Nov:** permission accepted; real check run `136130925467` published and completed (`failure`, BLOCK) | none |
| ~~Deliveries originating from GitHub~~ | **CLOSED 20 Nov** for ping, push, pull_request (and check_run/check_suite acknowledgements) via the Cloudflare quick tunnel. The tunnel URL is temporary: update the App webhook URL if it changes | none |
| ~~Required-check enforcement on a test branch~~ | **CLOSED 20 Nov (BLOCK case):** ruleset `27707416` on `g04/gate-test-target`; PR #2 (BLOCK) was refused with HTTP 405 "Required status check ... is failing". PASS and WARN PRs were `CLEAN` (not merged). Default/production branches untouched | Decide whether to keep or delete the ruleset and sandbox branches/PRs |
| Vercel verification, hold/release evidence | No Vercel token/team/project supplied; plan eligibility for Deployment Checks not confirmed from public docs | Provide a token for a **dedicated preview/staging project**, then run read-only verification; approve registration of the Deployment Check only if you want to test promotion holding |
| Real PASS under the FULL five-engine policy (real BLOCK, real WARN and a reduced-policy PASS exist) | SCA (OSV) hung/timed out under this machine's load in G02's sandbox (documented 2 GB/45 s budget) | Re-run on a quiet machine inside the one-hour scanner qualification window; do nothing else on it meanwhile |
| Real-login browser acceptance | An agent cannot complete a GitHub OAuth login | Owner logs in at `http://localhost:3000` against the G04 environment and opens Guard → CI/CD Gate; optional |
| Staging / production / Vercel-hosted acceptance | Out of scope; production not touched | Separate owner-approved window |

## Scanner host capacity (important)

OSV (SCA/SBOM) needs a 2 GB container inside a 3.9 GB Docker VM. With the host at 100-800 MB free RAM it timed out on most scans and sometimes hung container cleanup, which latches G02's quarantine (see Fix #24). Run acceptance scans on a host with several GB free (browsers and IDE closed) and restart the dispatcher with a freshly measured private root after any `cleanup_failed`.

## Known limitations

* **Branch allowlist:** G02's server-owned runtime config decides which branches may be scanned (now exact names or one trailing `/*`). A pull-request head branch outside it is not scanned (INCOMPLETE).
* **Fork pull requests** are never fetched; they receive an immediate INCOMPLETE check.
* **Stranded G02 jobs:** a worker killed mid-scan leaves a G02 job `leased` with `max_attempts 1`; the G04 trigger fails closed (INCOMPLETE) at 45 minutes. G02 has no reaper; a new deliberate recheck creates a new scan.
* **Qualification expiry:** G02 scanner qualifications last one hour, so an unattended deployment needs a re-qualification routine (not part of G04).
* **Vercel `source.kind` and plan:** the request shape for importing a GitHub check into a Vercel Deployment Check is taken from the public API reference and is *unverified against a real project*. Force Promote bypasses Deployment Checks by design.
* Per-project concurrency is bounded by admission limits (50 open / 200 per hour) and G02's single-job scheduler; no cross-project fairness beyond oldest-due-first.
* Retention: rows carry `retention_until`; deletion is operator-owned (no DELETE grants).
* The database name `wetscan_dev_guardg02` is reused in the G04 environment only because G02's validators pin it.

## Approval gates (nothing below was done)

Changing GitHub App settings or repository rules, adding provider credentials, registering a Vercel Deployment Check, promoting/redeploying anything, merging, production deployment, dropping the throwaway migration-test databases (`g04_migtest_*`) or the G04 volume.

## Merge ordering

G04 is based on `origin/master` (G02 merged). It touches three small G02 seams (`github-source.ts` optional `authorizer`, `product-host.ts` optional `automationSource`, `product-policy.ts` `branchAllowed`) and the shared `scripts/guard-g02-local-env.ts` (env-selectable environment name), one UI file (`live-workspace.tsx`, +7 lines) and one existing test (`live-ui.spec.ts`: six tabs → seven). A G03 branch touching those files should be rebased onto G04 or vice versa; no G03 code was consulted.

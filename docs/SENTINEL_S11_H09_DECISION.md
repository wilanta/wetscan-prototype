# H09 - final acceptance decision package (S11)

**Owner decision status: `H09_OWNER_DECISION_PENDING`.** This document is the agent's *technical assessment* and the evidence
that supports it. It is **not** an owner signature, **not** a UAT sign-off and **not** a release authorization. The four
things below are kept apart on purpose:

| Layer | State |
| --- | --- |
| Agent technical assessment | this document |
| Executed UAT evidence | [evidence register](SENTINEL_S11_EVIDENCE_REGISTER.md) (fixture, disposable and development-database evidence only) |
| Actual human owner decision | **not recorded** -> `H09_OWNER_DECISION_PENDING` |
| Environment-specific release authorization | **none**; production deployment remains disabled |

## 1. Technical recommendation

| Question | Recommendation |
| --- | --- |
| Merge S11 into `master` | `GO` (engineering gates passed; nothing enabled by default; no migration) - authorized by the owner's S11 instruction |
| Controlled staging (owner's own test repository, owner-controlled destinations) | **`DEFER` until O-1/O-2** below: a real-session E2E and a consented provider test have not been run, so staging could only exercise fixtures |
| Production users | **`NO_GO`** |

`NO_GO` for production is a statement about missing evidence, not about a known defect: no Critical/High finding is open.

## 2. The twelve questions

1. **Fully implemented (S01-S10)?** All ten are implemented and merged; none is `LIVE_TESTED`. Deferred and absent: Guard
   GRD-020/021 (`NOT_INTEGRATED`), WhatsApp, NVD, AI explanations, production deployment.
2. **Only fixture-tested?** S05 (response target is a loopback fixture), S06 (providers are loopback mocks), S07 (loopback decoy),
   S09 (offline feed fixtures), S10 (mocked transport), plus the whole browser layer.
3. **Passed authenticated real-project E2E?** None. Provider-substituted production-build E2E passed (register E-A5-11). Real GitHub session: `NOT_RUN`.
4. **Tested on the persistent dev database?** Platform only: backup, restore rehearsal, migration 0004 -> 0009 with data preserved,
   least-privilege roles, fail-closed approvals, idle worker start/stop, ledger-verified health. No feature was *activated* there.
5. **Real providers with verified acceptance evidence?** None in S11. (S09 had one bounded real-feed smoke on a throwaway DB.)
6. **Absent or deferred?** See 1; plus staging, monitoring/alerting, edge rate limiting, script-restricting CSP, HSTS.
7. **Security requirements proven?** Tenant isolation and least privilege across all tenant tables, route authentication/CSRF/
   enumeration/error hygiene, append-only audit, fail-closed activation, replay/forgery rejection, no secrets/vulnerable deps in
   the repository, baseline response headers. See the [security review](SENTINEL_S11_SECURITY_REVIEW.md).
8. **Still `NOT_RUN`?** Register section E (N-1..N-10).
9. **Unresolved risks?** R-1..R-8 below.
10. **Release blockers (production)?** B-1..B-6 below.
11. **Ready for controlled staging?** Technically yes after O-1/O-2/O-5; today only with fixtures.
12. **Ready for production users?** **No.**

## 2A. Mandatory release-gate matrix

The minimal set of gates that actually establishes Sentinel reliability and security, and which missing gate forces `NO_GO`.
`VERIFIED` = executed and passed (evidence ID in the [register](SENTINEL_S11_EVIDENCE_REGISTER.md)); `NOT_RUN`,
`NOT_CONFIGURED`, `BLOCKED`, `PENDING` are literal. "Blocks" means: while the gate is not VERIFIED for that environment, that
environment must not go ahead. Counts live only in the register.

| # | Gate | Required evidence | Status today | Blocks staging | Blocks production | Owner action |
| --- | --- | --- | --- | --- | --- | --- |
| G1 | CI `static`: typecheck, lint, unit/contract, secret scan (incl. completeness), `npm audit` | green hosted run on the exact release SHA | VERIFIED (register F, H) | yes | yes | none |
| G2 | CI `build`: production build | green hosted run | VERIFIED (register F, H) | yes | yes | none |
| G3 | CI `postgres`: S01 and S05-S11 suites on disposable services, incl. the catalog-driven RLS / privilege / two-project matrix | green hosted run | VERIFIED (register F, H) | yes | yes | none |
| G4 | CI `browser`: mocked-transport suites, accessibility, original Demo, production-build E2E with stubbed GitHub | green hosted run | VERIFIED for the PR run; the production-build E2E step on Linux: see register H | yes | yes | none |
| G5 | Required status checks + branch protection on `master` | repository settings show G1-G4 required | NOT_CONFIGURED | no (advised) | **yes** | O-5 |
| G6 | Database safety on the TARGET environment: identity marker, backup, restore rehearsal, additive migration, least-privilege roles, fail-closed approvals | receipts like register section C for that target | VERIFIED on `wetscan_dev` only; target environments NOT_RUN | **yes** | **yes** | run the runbook sections 3.4-3.5 there |
| G7 | Authenticated real-GitHub-session E2E on an owned repository | UAT record: login, project, telemetry, incident, Canvas overlay, report | NOT_RUN (fixture identities only) | **yes** | **yes** | O-1 |
| G8 | Consented real notification delivery (Telegram / Resend), accepted vs delivered recorded separately | owner-approved test send + provider receipt | NOT_RUN | no (keep notifications off) | **yes if notifications are in scope** | O-2 |
| G9 | Controlled response against an owner-approved real or staging target (apply, independent verify, TTL rollback) | receipts from the target, never production traffic | NOT_RUN (loopback fixture only) | no (keep response off) | **yes if response is in scope** | H03 decision |
| G10 | Worker health + monitoring + alerting (health 503, `queue.failed/expired`, lag, heartbeat, outbox, backup age) | alert rules firing in a drill | NOT_CONFIGURED | no (manual checks acceptable) | **yes** | provision monitoring |
| G11 | Rollback rehearsal on the target including the schema-ahead path (`ahead_unverified` -> attestation -> `ahead_compatible`) | rehearsal record | logic VERIFIED (unit + real ledger PG test); rehearsal NOT_RUN | yes (once) | **yes** | rehearse on staging |
| G12 | Backups on a schedule and a tested restore time | schedule + last restore evidence | NOT_CONFIGURED (one-off rehearsal verified on dev) | no | **yes** | schedule backups |
| G13 | Credential lifecycle rehearsal: rotate/revoke telemetry key, notifier password, provider tokens | rehearsal record | partly (creation verified; rotation NOT_RUN) | no | **yes** | rehearse |
| G14 | Edge controls: TLS + HSTS, pre-authentication ingest rate limiting (R-4), optional nonce CSP | edge configuration evidence | NOT_CONFIGURED | no | **yes** | edge / WAF |
| G15 | A staging environment that mirrors production topology | environment exists, G6/G7/G11 run there | NOT_RUN (none exists) | **yes** | **yes** | provision |
| G16 | Independent security review of the release candidate | reviewer sign-off | NOT_RUN | no | owner decision | O-6 |
| G17 | Optional dependency review (needs GitHub Advanced Security) | job green with `GHAS_ENABLED=true` | not enabled; job skipped | no | no | enable if wanted |
| G18 | Deferred features (Guard GRD-020/021, WhatsApp, NVD, AI port) are not represented as live | UI/docs audit | VERIFIED (`not_integrated` states) | yes | yes | none |
| G19 | Owner UAT and the recorded H09 decision | section 6 below filled in | `H09_OWNER_DECISION_PENDING` | **yes** | **yes** | O-6 |

Reading the matrix: **staging** is blocked today by G6 (target), G7, G11, G15 and G19. **Production** is additionally blocked by
G5, G8/G9 (if in scope), G10, G12, G13, G14 and the open owner decision on G16, so production stays `NO_GO` and staging `DEFER`.
A gate may only move to VERIFIED with new executed evidence in the register.

## 3. Hard release blockers (production)

| ID | Blocker | Needed to clear |
| --- | --- | --- |
| B-1 | No authenticated real-GitHub-session E2E (`H-S10-E2E`) | owner runs/approves the session test on an owned repository |
| B-2 | No real notification delivery evidence (`H04`/`H05`) | consented Telegram/Resend destination + owner-approved test; remember accepted != delivered |
| B-3 | No staging environment, no production database/monitoring/alerting/backup schedule | provision, then rerun the runbook section 4 promotion criteria there |
| B-4 | No real response target exercise (`H03`); production blocking is unverified | owner-approved staging target only |
| B-5 | CI is green on the PR (register F) but **no branch protection / required checks** exist and dependency review is blocked by repository settings | owner enables required checks (O-5) and GHAS/dependency graph if wanted |
| B-6 | Feature activation was never exercised on a persistent database | owner approves activation blocks for one project and a smoke run |

## 4. Residual risks and accountable owner

| ID | Risk | Owner |
| --- | --- | --- |
| R-1 | Dev DB is a clone-volume container; the original container claims the same port (S11-F9) | repository owner |
| R-2 | 8 queued + 1 failed historical jobs on dev DB; activating detection will drain them | repository owner (decide purge vs process) |
| R-3 | Notifier role provisioning needs a manual `CONNECT` grant (S11-F3) | owner (O-3: new reviewed plan hash if the SQL should change) |
| R-4 | Ingest admission is process-wide before authentication (S11-F4) | owner (edge rate limit) |
| R-5 | At-least-once notification delivery can duplicate on crash | accepted design |
| R-6 | No script-restricting CSP / HSTS | owner (nonce-CSP package, edge HSTS) |
| R-7 | Windows CI minutes cost on a private repository | owner |
| R-8 | Health JSON still says `telemetry: not_implemented` | maintainers |

## 5. Owner questions and actions (only what is genuinely needed)

| ID | Decision / action | Why only the owner |
| --- | --- | --- |
| O-1 | Run `H-S10-E2E`: real session on an owned repository (or approve the agent doing it with your login) | needs a real credential |
| O-2 | Provide/approve a consented notification destination for a test send | recipient consent |
| O-3 | Approve a new plan hash if `provision-roles-s06.sql` should include the `CONNECT` grant | changes the reviewed migration plan |
| O-4 | Decide the fate of the original dev container/volume (keep, retire) | data ownership |
| O-5 | Enable GitHub Actions and branch protection with the four required checks | repository settings |
| O-6 | Record the H09 decision: `GO` / `NO_GO` / `DEFER`, release scope, environments, accepted risks, UAT result | the decision is yours |

## 6. Record the decision here (to be completed by the owner)

```
H09 decision: ______  (GO | NO_GO | DEFER)      Date: ________   Recorded by: ________
Scope / environments permitted: ______________________________
Accepted risks (IDs): ______    Deferred features acknowledged: ______
Production deployment authorized: NO (default) / YES for target: ______
```
Until this block is filled by the owner the status stays `H09_OWNER_DECISION_PENDING`.

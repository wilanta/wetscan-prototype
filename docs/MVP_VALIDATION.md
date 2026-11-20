# Current integration validation

See [GUARD_INTEGRATION_CHECKPOINT.md](GUARD_INTEGRATION_CHECKPOINT.md) for current branch, validation and publication scope. Dated records below are retained as historical development results.

# Latest G02 measured scanner setup - 18 November 2026

This update supersedes the earlier environment observations below. Work remains uncommitted on feat/guard-mvp-local-demo, HEAD d13de08aa54ed6dd317a37357a149969c781ef41. No owner repository, PostgreSQL or historical G01 runtime was accessed.

| Check | Actual result |
|---|---|
| Canonical Live/MVP regression | PASS279/279,24 files |
| Additional foundation-boundary slice | PASS248/248,23 files; overlaps canonical suite, not an additive count |
| Production typecheck | PASS after scanner/setup changes |
| Browser Live | PASS4/4 after test-only cold-navigation auto-wait fix; initial3/4 retained |
| Production Webpack build | PASS; final typecheck PASS after build |
| Production boundary smoke | PASS;6 protected Live routes, API401,36 trace manifests,0 private references |
| Lint | PASS,0 warnings after unused setup imports/destructuring corrected |
| Real CLI installation | PASS4/4 on controlled synthetic source only; findings1/5/1/3 |
| Physical Docker controls | PASS restrictions, output limit, timeout, cancellation, OOM137, exact-owned container cleanup/absence |
| Final image | sha256:3608834fae5f966e6380af0c7b2acf71a46af2ac2bac8591be2b0851d501fa51 |
| Installation artifact recheck | PASS4/4, owner/SYSTEM-only new G02 directory; measurement expiry17:53:26 WIB18Nov |
| Operational DB/Auth | NOT_VERIFIED in actual owner MVP process; no legitimate DB connection reference available to agent |
| Actual GitHub -> CLI -> PostgreSQL -> UI | NOT_RUN |
| G01 preservation |398/398 hashed manifest paths unchanged; index unchanged |

The scanner recipe uses only verified public releases, pinned official rule blobs, the official npm advisory object generation and a digest-pinned Python base. Builds used network=none after download. Qualification source contained only deliberately vulnerable JS, fake token text, a Terraform test and tiny lodash lockfile. Production path policies were not relaxed. CLI wrappers disable source config overrides/resolution/call-analysis/updates and have no network. Spec/commands/limits and measured durations are persisted; OSV16.3s uses explicit2048MiB, the other engines256MiB. Every scan passed the45s bound and normalizers. Trivy's exact clean '.' summary is dropped; missing/unbound/root finding evidence still refuses execution. No fixture finding enters Live storage.

Initial installation failures were retained: CRLF shebang, OSV256MiB OOM137, excluded fixture filename, and clean Trivy root aggregate. The final image/normalizer resolves those specific failures. This does not close additional G01 gates or prove source orphan cleanup's one-hour condition. All owned test containers and synthetic source directories were removed only after identity checks; no global cleanup/prune or historical job resource was touched.

A read-only pgAdmin catalog file and offline SQL proposal for new wetscan_dev_guardg02 are prepared. The proposal reuses existing roles/passwords and immutable baseline checksums. It creates inert shared Sentinel namespaces only inside the NEW isolated DB if separately approved, with no connection to existing Sentinel DB. Schema bootstrap RESET ROLE before Guard platform-budget setup was corrected offline; no SQL was run.

G01 publication was stopped under the owner's material-blocker rule. Four-file build/tool export: typecheck/lint/build PASS;351/352 Guard tests. Failure: existing evidence-retention test references ignored test-results/guard-g01-unblock/deadlines-candidate-unit.json absent in a clean export. The earlier export-only CRLF conversion of tracked acceptance text was diagnosed and corrected in the temporary export from raw HEAD blobs; original candidate evidence was never changed. No artifact was smuggled into Git. The known full3 regression failures and390/391 mismatch remain. No commit SHA/push exists for this work; PR7 was not changed by this session.

Final browser/build/typecheck and production boundary smoke all PASS. An initial browser run was3/4: successful preference save remained on onboarding past its5s URL assertion during cold compile. The test-only auto-wait was aligned to20s; no production Auth/session behavior changed. Its failed artifacts were preserved under test-results/guard-live/browser-attempt-1.

---

# Latest G02 operational wiring validation - 18 November 2026

Branch feat/guard-mvp-local-demo, HEAD d13de08aa54ed6dd317a37357a149969c781ef41. Uncommitted. This section supersedes the previous slice's counts and missing-wiring statement below.

| Check | Actual result |
|
Preflight was additionally audited against the actual proposed grants/RLS SQL: the READ ONLY transaction sets only local Guard module/mode context and rolls it back; worker scan permissions do not require app-only INSERT. All required table/column privileges are checked individually with bool_and. PostgreSQL comma-separated privilege arguments mean ANY, as documented in [PostgreSQL18 privilege inquiry functions](https://www.postgresql.org/docs/18/functions-info.html); they cannot prove ALL privileges. Two added regressions cover app/worker separation and missing required privilege. All .local runtime state is now ignored in Git on the MVP branch; no private file was deleted.

---|---|
| Unit / isolated integration | PASS - 261/261, 21 files |
| Browser E2E | PASS - 4/4, isolated existing Auth fixture on owned port3109 |
| Typecheck | PASS |
| ESLint | PASS - no warnings |
| Production Webpack build | PASS - includes preflight and operational scan/resume routes |
| Production Auth/trace smoke | PASS - six Live pages require login; API HTTP401; 36 traces, zero excluded private references |
| G01 protection | 398/398 hashed manifest paths unchanged; self-hash intentionally excluded |
| Real repository scan | NOT_RUN |
| Real PostgreSQL app/worker connection | NOT_CONNECTED_THIS_SESSION |

The actual request path now reaches server-owned product deployment -> transactional admission -> Next after-response registration -> serialized scheduler -> original-session broker -> dedicated worker-role executor -> leased/fenced persistence and existing Docker scanner adapters. A fresh Auth/provider callback is used during source/engine/write boundaries. No session/token enters job JSON, browser configuration or container env. Both worker and source-owned scanner work remain trusted orchestration; untrusted repository bytes are only parsed by qualified containers.

New tests cover the actual host factory's context/defer handoff, unclaimed-only scheduling, physical/config drift before credential use, safe stored-result reads when scanner readiness is unavailable, no fallback to G01 DB, bounded/serialized/deduplicated scheduler and quarantine, fresh-owner broker capabilities and failed cleanup, separate database identity/policy validation, independent READ ONLY app/worker probes with mandatory ROLLBACK, changed daemon/artifact rejection, and explicit resume without enqueue or historical/used attempt adoption. Existing source coverage/persistence/scanner tests remain doubles. These are not actual PostgreSQL/CLI success evidence.

Browser tests cover six stored-data tabs/review, refusal of normal actions on historical records, fail-closed empty/unavailable storage, and a real request to the new authenticated preflight endpoint in the local fixture process. Provider requests and stored scan records are test substitutes. Two initial browser checks hit their5-second assertions during cold route/provider-fixture compilation; targeted auto-waits now allow20 seconds without sleep or automatic runtime retries. The rerun passed4/4. A test-only host mock originally omitted the password-reference field required by its successful configuration mock; it was corrected to reflect that contract. No runtime evidence was invented.

Actual environment READ ONLY observation: Docker Server Linux29.7.2 is reachable,16CPU,8153628672 memory bytes, seccomp/default and cgroupns. Metadata lists2 images, zero known scanner-name matches; differently named image contents remain unknown. No container/pull/build/scan ran. Scanner installation/rules/physical control qualification remains NOT_VERIFIED. Tool Process/User/Machine reference metadata is absent for Guard app/worker. This does not establish reference absence in the separate owner app process, which remains unobserved. No .env, credential content, token, cookie or private runtime state was opened by the agent.

Normal website requests cannot use the historical fixture reader, even when its legacy flag is set. Operational configuration only accepts isolated wetscan_dev_guardg02. No such DB was created, altered or queried; its actual provisioning state is NOT_VERIFIED. Legacy G01 acceptance composition without a normal request context remains unchanged. All N01 resources, evidence, old permits and ambiguous transaction remain untouched.

The current implementation is self-hosted Node after-response work, not a separately deployed worker service. PostgreSQL keeps durable queued jobs; an in-memory owner capability is never restored automatically after restart. Explicit normal login/resume requires queued state/attempt0 and the same authorized owner/pin. Used attempts and historical jobs require separate investigation; unknown cleanup stops further scheduling. Actual normal source/container cleanup and application-process shutdown remain prerequisites to qualified live use, not inferred from tests.

[Owner setup/preflight/first-test procedure](GUARD_G02_LIVE_OPERATOR.md) contains the single concrete prerequisites list. Runtime scanning remains off. Infrastructure provisioning and the selected real-repository scan require separate explicit approval. G02 is PARTIAL until one actual GitHub -> CLI -> PostgreSQL -> Live UI run is verified. G03-G06 live integrations remain pending.

No owner port3000 process was switched. No database connection/mutation, source acquisition, scanner/container/pull/build, owner logout, cancellation, N01 recovery or manual/orphan cleanup occurred. Only read-only Docker metadata and isolated owned test fixtures were used. No G01 evidence, master/staging/Sentinel/PR7, Git index, commit/push/merge or deployment changed. G01 remains2/16 PASS; N01 STOP / window-2 transaction UNKNOWN.

---

## Previous Live code slice

# Latest Guard Live code validation - 18 November 2026

Branch `feat/guard-mvp-local-demo`, HEAD `d13de08aa54ed6dd317a37357a149969c781ef41`; changes remain uncommitted. This section supersedes the earlier test counts below. It records offline/local verification, not actual GitHub/scanner/database acceptance.

| Check | Final result |
|---|---|
| Unit / port-integration regression | PASS - 211/211 across 14 files |
| Live browser | PASS - 3/3 on the existing isolated Auth fixture, local server 3109 |
| Typecheck | PASS |
| ESLint | PASS - no warnings |
| Production Webpack build | PASS - includes normal revision route and all six Live tabs |
| Production Auth boundaries | PASS - six Live routes redirect unauthenticated requests to login; readiness API HTTP401 |
| Trace exclusion | PASS - 35 manifests, zero non-node_modules .env/.local references |
| Existing demo boundaries | PASS - legacy redirect HTTP307, canonical unauthenticated route HTTP307 |
| G01 preservation check | 398/398 hashed manifest paths unchanged; manifest deliberately excludes its own hash |

The 211 tests exercise repository/actor/commit admission binding, atomic job+queue calls, operational kind isolation from historical jobs, four existing scanner adapters via Docker doubles, cross-scope/synthetic result refusal, cleanup/provenance gating, manifest-owned snapshot renewal without extending the old grant, stored report/review transactions via database doubles, stale revision, report scope, expiry and revocation. Cleanup timeout tests confirm that source disposal waits for scanner-owned cleanup and preserves source when cleanup is rejected/unknown. Unknown advisory severity cannot produce a Live release PASS. New resource APIs reject unauthenticated and cross-origin requests before storage/provider activation. Normal revision lookup returns metadata without an acceptance nonce or draft.

Browser tests use real application routing/Auth/onboarding and a dedicated test-only Auth store. Stored scan APIs are intercepted with explicit test data for UI assertions. They cover all six tabs and review, prevent normal actions on historical jobs, and keep an unavailable backend blocked with no fake findings. This is NOT actual scanner/DB evidence. Production smoke uses only its own sanitized loopback server on 3119, without owner cookies or provider access. The port-3000 owner process was not replaced.

An intermediate typecheck was mistakenly started concurrently with Next build and saw TS6053 while `.next/types` was regenerated. Final typecheck was run after build completion and passes. Future build/typecheck/browser tasks must be sequential. Two initial test-only type mismatches and a React initial-load effect lint error were corrected and retested. The Live view aborts pending loads on unmount and never falls back to demo.

Default normal scanning remains **BLOCKED**. `qualifiedProductService` and the server worker composition are implemented but not mounted into a running session broker/scheduler. No database, source-provider or physical sandbox qualification has been performed this session. Docker executable metadata is present; daemon/image/rules/offline advisory data/installation artifacts are unverified. No actual CLI is claimed configured or tested. Container/SBOM, AI/patch/retest, external Checks/Vercel, HTTP DAST, Canvas/Intelligence/Sentinel delivery, GitLab and ZIP execution remain incomplete.

No runtime scanner, database connection/query, owner logout, enqueue, worker, cancellation, recovery, Docker command, provider write or manual/orphan cleanup occurred. Owned offline tests create/remove their own temporary fixtures only. No old permit or fixture baseline was used as production authority. G01 remains PARTIALLY_COMPLETE 2/16; N01 remains historical STOP, old terminalization transaction outcome UNKNOWN, and the full G01 checkpoint remains HOLD. No G01 historical file was repaired/refrozen. No commit/push, master/staging/Sentinel/PR7 change, merge or deployment occurred.

Reproduce via `node scripts/guard-live-check.mjs unit`, then `browser`, `build`, `typecheck`, `lint` (one task per invocation). After build, `node scripts/mvp-check.mjs prod-smoke`. Sanitized runner records under ignored `test-results/guard-live`; no formal acceptance packet was generated for this code iteration.

---

## Previous prototype integration validation

# Latest prototype integration validation — 18 November 2026

This section supersedes the standalone-preview routing/startup claims in the historical first-slice record below.

| Check | Actual final result |
|---|---|
| Unit/regression | PASS — 90/90, 4 files |
| Browser integration | PASS — 5/5 through existing Auth/onboarding/AppShell/DemoProvider |
| Typecheck | PASS |
| ESLint | PASS |
| Production Webpack build | PASS |
| Legacy URL | HTTP307 to /app/projects/orderly-demo/guard; no separate UI |
| Canonical production route without Auth | HTTP307 to existing login, even with the old local-demo flag present |
| Private trace exclusion | 34 manifests, 0 non-node_modules .env/.local references |
| G01 checkpoint integrity | 399 proposed paths unchanged since review; 38/38 protected evidence hashes unchanged |
| G01 regression | 687/690 PASS, 3 FAIL — distinct from MVP result; full checkpoint HOLD |

The canonical demo is /app/projects/orderly-demo/guard with Inventory, Findings/triage, Remediation preview, Integrity, history, policy and reports in the existing navigation. Shared completed-scan notifications increment the existing count exactly once; global Reset demo clears the Guard session and controls. The preserved original example scan delegates to the same session. Examples remain synthetic and extra scanner-format fixtures retain their production guard/default=false.

The browser tests use the repository's existing Auth provider fixture, an ephemeral fixture-only Auth store and owned loopback port 3109. They do not use the owner's session, external providers, database, G01 permits or real repository acquisition. Tests cover:
- Legacy redirect cannot reveal an unauthenticated second demo.
- Scan/review/policy/JSON report, real bounded local inventory, proposal preview, history and global reset.
- Unsupported/failed engines remain partial/INCOMPLETE; invalid documents clear prior success.
- Real-project navigation uses Live Guard and never inherits demo findings.
- The original FIND-102 model walkthrough remains usable; its simulated retest is not a real verified fix. The mobile inventory page has no document overflow.

An initial disclosure test found that native example controls could receive clicks before hydration; the example adapter now waits for browser readiness. This and the earlier form hydration fix were verified by the final browser suite.

No G01 frozen packet or evidence was repaired/refrozen. The pre-existing historical observer ROLLBACK/hash drift remains documented on the G01 branch; N01 remains STOP and the old window-2 transaction remains UNKNOWN. No live acceptance or recovery was performed.

No Git index/staging, commit, push, cherry-pick, merge, PR metadata, master/staging, Sentinel implementation/database or deployment was changed. The owner's port-3000 process was not switched. The obsolete owned port-3118 standalone preview was stopped after verifying its identity; it is not a second active demo. Normal owner startup on the MVP branch still requires the existing legitimate Auth configuration; no credential/private state was copied.

---

## Historical initial local slice (preserved)


# MVP validation — 18 November 2026

Branch: feat/guard-mvp-local-demo
Base/HEAD: d13de08aa54ed6dd317a37357a149969c781ef41
Worktree: C:/laragon/www/wetscan-2/wetscan-guard-mvp-local-demo

This is offline/local product validation. It is not G01 acceptance, a real repository scan, provider enforcement, or verified remediation.

| Check | Final result |
|---|---|
| Targeted unit/regression | PASS — 87/87, 3 test files. Includes 36 new local boundary/inventory/patch/workflow tests plus existing Guard core/adapters. |
| Browser end-to-end | PASS — 3/3, installed Edge in isolated temporary browser context, loopback port 3118. |
| Typecheck | PASS — exit 0 |
| Lint | PASS — exit 0, no final warnings |
| Production Webpack build | PASS — exit 0 |
| Production route boundary | PASS — HTTP404 for /local-demo/guard even with WETSCAN_LOCAL_DEMO=1 |
| Build tracing | PASS — 34 trace manifests checked; 0 non-node_modules .env/.local references |
| Diff whitespace | PASS — git diff --check |
| Official specifications | Five byte-identical copies, SHA256 provenance in specs/guard/SOURCES.json |
| G01 metadata | Original branch feat/guard-g01-s03-integration and HEAD d13de08 unchanged |

## What was exercised

- Real bounded parsing of supplied npm v2/v3 lockfiles, nested/scoped exact versions, unknown licenses, skipped unresolved/link entries, malformed/oversized/traversal input.
- Text proposal binding to original SHA256, base commit and finding reference; refusal of sensitive/unsafe paths, binary/oversized input, missing or repeated matches and stale digests. Output remains unapplied and retest NOT_EXECUTED.
- Four fixed synthetic scanner-format fixtures through existing production normalizers; synthetic evidence/provenance preserved.
- In-memory job progress/history, finding review/audit reason, policy evaluation, JSON download, inventory workflow and patch preview in the website.
- Unsupported engines and injected SAST failure remain completed_partial / INCOMPLETE; no absent SAST finding is treated as a clean real scan.
- Reload clears browser-only jobs. Invalid new inventory input removes prior successful display.
- Primary browser workflow rejected any external or /api/ request and observed none.

## Issues found and resolved during validation

The initial default Playwright browser binary was absent; no browser was downloaded. The tests use existing Edge, without the owner profile/session.

A browser test exposed an actual pre-hydration input loss: editing SSR controls before handlers became ready could concatenate/reset the lockfile text. The local workspace now exposes editable controls only after browser hydration. The regression passes with immediate interaction.

Test harness corrections covered web-server cwd, report scope.mode assertion, accessible combobox selection and the distinction between the form alert and Next route-announcer alert. These were not scanner/G01 runtime failures. Final commands above pass.

Next dev generated the untracked AGENTS.md framework guide; no existing user changes were removed. No new dependency/version was added; npm ci used the offline cache with lifecycle scripts disabled.

## Scope preserved

No database connection/query/mutation, permit, scanner, repository acquisition, Docker, paid AI, logout, enqueue, worker, cancellation, G01 recovery or provider write was performed. Browser simulation cancellation is not a durable/live job operation. Only owned ephemeral test servers were started/stopped.

No G01 evidence/acceptance implementation, Auth, Canvas implementation, Sentinel implementation/database, master/staging, PR #7, commit, push, merge or deployment was changed. G01 remains PARTIALLY_COMPLETE (2/16 PASS), N01 historical STOP and old transaction outcome unresolved. The new worktree deliberately excludes uncommitted G01/private runtime state.

G02–G06 remain partial. Live scanner isolation, durable integration, real AI/retest, staging DAST, GitHub/Vercel enforcement, GitLab/ZIP execution and actual cross-module delivery are not verified by these tests.

## Preview availability

The initial non-elevated listener inventory incorrectly reported port 3000 free; the actual bind returned EADDRINUSE. No existing process was stopped, restarted, queried for session data, or replaced. This was a local startup limitation, not a scanner or G01 acceptance event.

The sanitized preview runner is now available as `node scripts/mvp-check.mjs preview` on loopback port 3118. The running preview returned HTTP200 for /local-demo/guard. The owner can use http://localhost:3118/local-demo/guard now; exposing the MVP on port 3000 requires coordinating the existing process separately. The new preview task passed targeted ESLint; no application-bundle change was made after the final production build.
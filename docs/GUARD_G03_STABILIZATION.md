# G03 final stabilization — 20 November 2026

**PARTIAL / NOT COMPLETE.** Offline implementation and stabilization checks are complete subject to the inherited regression blockers below. No successful real AI-provider call, actual remediation PR or retest on `wilanta/wetscan-prototype` is evidenced. These are live acceptance blockers, not successes inferred from fixture tests.

## Preserved work and integration

Branch remains `feat/guard-g03-ai-remediation`, HEAD/base master `5e52ac2d9df641eebef5cb4818c4efb7887c0c5c`. Read-only `git ls-remote` verified remote master still has that SHA and PR #17 head is `4bc4d92eab10735c2ff3ee0b25cf9def1d13843c`. Merge `f4a54f8` includes PR #17 as its second parent; the final base also includes PR #19. No checkout, fetch, merge, stash, reset, clean, new worktree, commit, push, PR write or deployment occurred in this stabilization task.

All **52** initial dirty files were copied to `.local/g03-stabilization-ffc91caa-d7fb-46c1-8cb6-8e9b20c3a66c`, with each source/copy SHA256 checked before edits. `tracked.patch` and `snapshot.json` retain the checkpoint. No initial file was removed. Original G03 acceptance JSON, G01/G02 artifacts, Auth/N01, Sentinel, platform/migrations and workers remain unchanged. New G03 evidence has a separate directory. See [preservation evidence](acceptance/guard-g03/20261120-stabilization/preservation.json) and the [final file manifest](acceptance/guard-g03/20261120-stabilization/changed-files.json).

PR #19's reported G02 DEV_ACCEPTED product path on its new local environment is preserved, including Will's existing-Auth repository-selection fix. No scanner/evidence/queue/RLS/admission contract changed between merged PR #17 and this base. Six new runtime composition tests check G03's existing app database qualification, project/session reuse, default-off gates, exact retest branch/commit/engine, G02 `access:"scan"` admission/defer and persisted-job `access:"read"`. They are composition tests with doubles, not a live scanner/authorization acceptance.

## Corrections made

- Redact quoted JSON keys, camel-case credential names and multiline string assignments before sharing context. Tests cover short secrets that entropy-based patterns would miss, and redaction idempotency.
- Apply the same redaction to source-path metadata sent to the provider, including email-shaped path segments; exact local patch bindings retain the original authorized path.
- Preserve UTF-8 BOM bytes during source decoding so Git blob/SHA256 binding stays exact.
- Report provider metadata as `requestEnabled`; `successfulResponseRecorded` requires a completed response for the exact model/prompt/policy plan in this scan. UI explicitly labels settings without a successful recorded response. No real provider readiness is claimed.
- Reject cross-scope original findings and mismatched proposal/finding/before-revision/engine/after-scan retest identities. Require versioned execution evidence and a positive, integral retrieved-source count before `verified_fixed`.
- Reject report envelope changes to expiration, creation time or source revision when they disagree with the hashed report body.
- Reject inline scanner-suppression directives and known destructive filesystem/network, indirect global/process and constructor/prototype primitives in proposed replacements. These static filters do not prove arbitrary code safe; human review and repository behavioral validation remain necessary.
- Dependency findings are guidance-only: reject package/lockfile edits until package-manager, transitive graph and integrity validation exist. An edit to another dependency in the same file cannot masquerade as a source-bound fix.
- Add provider credential-reference failure tests, runtime G02 composition tests and actual PostgreSQL cross-scan cost/request-cap tests. The two concurrent reservations use separate actors/scans to prove the project cost lock, rather than merely hitting the per-actor minute limit. Exactly one reservation reaches the $0.50 project ceiling; the other fails before mutation. Twenty older low-cost attempts prove the independent daily request cap.

No repository scripts are executed from model output. Patch support remains one bounded replacement in one regular allowlisted JS/TS/JSX/TSX/JSON file ≤24 KB. Syntax and actual `git apply --check` tests pass; repository behavioral tests remain explicitly `NOT_RUN`, and PRs are drafts pending human/CI review.

## Regression classification

The original **136** failures remain fully classified:

| Classification | Failures | Evidence / disposition |
| --- | ---: | --- |
| G03-caused | 0 | All G03 unit/integration tests pass; no failing assertion was weakened |
| G03 integration regression | 0 | Existing Guard/Auth/G02 suites pass except the preserved historical artifact check |
| Existing Windows/Sentinel — PowerShell | 108 | Effective policy is `Restricted`; a harmless owned script is blocked before its body executes. Unchanged tests invoke the same script mechanism; some fail on expected downstream output rather than printing the policy error directly. No policy bypass/change |
| Existing Windows/Sentinel — TEMP boundary | 27 | `fs.promises.realpath` expands the short TEMP alias; Sentinel's strict equality rejects the fixture path. Rerunning the unchanged entire suite with canonical TEMP gives **69/69 PASS**. Production boundary checks and assertions remain intact |
| Historical G01 raw-byte mismatch | 1 | Retained artifact is CRLF while its historical digest is LF. In-memory LF normalization exactly matches the expected digest. Archive remains untouched |

One earlier stabilization run additionally hit the unchanged Canvas graph-cache refresh test (137 failures total in that run); the final full regression passes it. The mtime-based disk-entry selection is a possible timing cause, an inference rather than a proven G03 defect. The initial observation is retained separately and is not hidden by a retry assertion or test edit. See the per-file counts/test names and supporting probes in [regression classification](acceptance/guard-g03/20261120-stabilization/regression-classification.json).

G01 raw SHA256: `4d34ff620fc783e76fc5d5b3a7cdffc1558210660b7efc67ced4f54a05092cfe`; retained expected/in-memory-LF SHA256: `7dbce306308728a6e573ba27431cfcd3491f7de86fe658522169b70c72d54303`. No normalization was written to the archive. Full repository regression cannot be called green until its owners resolve the inherited environment/archive conditions.

## Validation and limits

Final exact results and timestamps are in [the validation summary](acceptance/guard-g03/20261120-stabilization/validation-summary.json), with per-file G03 counts in [G03 tests](acceptance/guard-g03/20261120-stabilization/g03-tests.json).

- G03 unit/integration: **144/144 PASS**, nine files; explicit positive/negative consent, source scopes, redaction/prompt-injection/tool denial, budgets, credential configuration, stale commits, patch validation, human review, PR permission/unknown-outcome gates, retest evidence, reports/authorization/retention.
- Real isolated PostgreSQL 18: **2/2 PASS**. Persistence/restart, FORCE RLS/cross-workspace denial, CAS/concurrent review, actual SQL rate/cost/request budgets, report retention and unchanged original G02 JSON/migration ledger. Synthetic provider/source/PR ports; no owner DB.
- Actual G02 Opengrep 2.0.0 scanner on controlled source + isolated PostgreSQL: **1/1 PASS**, one finding → zero, exact proposed bytes, matching image/spec/rules, complete coverage and verified cleanup. Content-derived fixture revisions are not GitHub commits. Source/AI/PR/enqueue seams remain doubles; this cannot prove the original repository live chain.
- Browser E2E: **11/11 PASS**, existing Auth fixture and mocked Guard transport, including Findings → Remediation → consent → review → PR/retest/report UI and AI-off denial.

The final browser Node runner returned exit 0. Its outer PowerShell capture returned 1 because Playwright's stderr color warning became a `NativeCommandError`; this is recorded in `browser-shell-note.json`. All 11 browser assertions passed and the Node runner finished normally. This wrapper observation is separate from the 136 failing unit assertions above.
- Typecheck, lint, production build and production smoke: **PASS**. Lint has zero errors and two pre-existing unused-variable warnings in `worker/guard/installation/persistence-fixture.ts`.

The runner strips owner service namespaces and disables dotenv loading. Native tests used approved tool execution because the Windows sandbox blocks required child-process APIs. Fixture PostgreSQL clusters/containers/local smoke and browser servers are stopped; existing dev servers, Docker daemon and user resources are preserved. No Execution Policy bypass was used.

## Owner actions remaining

Use the single [inactive live acceptance proposal](GUARD_G03_LIVE_ACCEPTANCE.md). It contains the exact server setting names, safe credential-reference provisioning, bounded cost/actions, source/review/write/retest approval gates and the required selection record. Owner must provide the existing authenticated/approved local runtime and select one actual persisted finding whose scan revision equals its current authorized branch HEAD. Browser inspection here stopped because the current URL could not be verified; no real finding/revision tuple was guessed. If there is no suitable existing finding, one baseline scan needs separate permission.

Then approve one redacted AI request (≤$0.10), review its actual diff, authorize at most one draft PR, and authorize one relevant G02 retest on its exact after-commit. Establish G02 admission for that remediation branch before repository write; G03 cannot broaden the branch policy or merge. Owner must separately address existing Sentinel environment and G01 artifact disposition for a green full regression. No credential value is needed in chat, no second OAuth is needed, and no deployment or implementation-branch publication is requested by these documents.

Coordinate additive `guardG03` JSONB and shared scan CAS revision with Will before integration. He should review the four existing tracked integration files; all other runtime/test additions are under G03-owned paths. No external message was sent and G04–G06 work was not started.

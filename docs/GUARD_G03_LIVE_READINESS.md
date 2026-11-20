# G03 live acceptance readiness — 20 November 2026

**Current owner decision (20 November 2026): ACTIVE MANUAL OWNER SETUP.** Use the existing four-file baseline ZIP for a new **Private** personal-account repository named **wetscan-g03-acceptance**, branch **g03/acceptance-base**. The owner will create the repository and upload the baseline manually. Do not use the fixed reference. After the owner supplies the repository URL and full commit SHA, continue metadata READ ONLY using the existing WetScan GitHub App. Source acquisition, scans, paid AI, GitHub writes/PRs and retests remain NOT_APPROVED. Prototype targeting is cancelled. No G03 code or package was changed for this decision. G03 remains PARTIAL.

**Owner scope update:** a separate owner-owned GitHub test repository is now the chosen Live Acceptance target. `inkAja/wdu` and `wilanta/wetscan-prototype` are excluded as patch/PR targets without separate permission. See [current design and minimum owner setup](GUARD_G03_OWNER_TARGET_DESIGN.md). The supplied `github-839286157` export identified `inkAja/wdu` and unavailable storage; it is not a current campaign finding. No further export/action on that old project is requested.

**PARTIAL. Live stage A is blocked on authenticated finding observation and subsequent specific owner approval.** No paid provider request, source preview, new GitHub scan, repository write/PR, commit/push/merge, deployment or operational restart was performed. All independently executable setup, implementation and offline validation work is recorded below; no fixture is called live acceptance.

## Checkpoint and source preservation

Branch/HEAD remains `feat/guard-g03-ai-remediation` / `5e52ac2d9df641eebef5cb4818c4efb7887c0c5c`. Read-only remote verification still matches master and merged PR #17 head `4bc4d92eab10735c2ff3ee0b25cf9def1d13843c`; PR #19 is included. No G02 engine/evidence/queue/RLS/admission contract changes were needed. Initial 75 paths exactly matched the frozen manifest; all 74 indexed SHA256 values matched, and all 75 files were copied/hash-verified at `.local/g03-live-checkpoint-loJ0Bs`. No initial file was removed. Intentional subsequent G03 edits are listed in the new [manifest](acceptance/guard-g03/20261120-live-readiness/changed-files.json).

Read the [proposed checkpoint commit](GUARD_G03_CHECKPOINT.md). Implementation, tests, non-secret configuration, docs and evidence are grouped for review. There is no staging or commit permission, and none was performed. Private state, dotenv/credential files, dumps, raw test logs and optional vulnerable source bundles are excluded. Will's changes, G01/N01, Sentinel, Auth, G02 workers/policy/migrations and historical database/evidence remain unchanged. Only G03-owned code and the existing G03 Live integration are edited.

## Actual finding selection

Owner supplied `http://localhost:3000/app/projects/github-839286157/guard`. Read-only listener inspection identifies this worktree's Next process. Anonymous requests return **307** for the page and **401** for scan API, without reading response bodies or extracting cookies. Browser host reports unavailable; no authenticated API/PostgreSQL observation was possible and no session bypass/second Auth was attempted.

Existing sanitized G02 evidence reports three SAST findings on `wilanta/wetscan-g02-acceptance`, vulnerable commit `c1330c63ef9bbe7fc0dcf435c6653488f269b827`, followed by fixed commit `3c6a99ec42b8259ab659a24c2f0d94822b389872`. That historical different-repository result cannot be selected for a patch on current prototype master or silently replayed. **No current prototype finding ID/evidence/source tuple is selected. This does not establish absence of suitable findings.**

The existing Findings UI now offers **Export G03 selection metadata** using data already loaded by G02's authenticated view. It makes no fetch/POST, scanner/source/provider call or database mutation. It exports a fixed allowlist of SAST IDs, before revision, path/provenance/artifact/coverage metadata; source, evidence summaries, titles, advice and unknown backend fields are excluded. Invalid/synthetic/triaged/unsupported metadata is marked with blockers. Storage unavailable/no loaded scan is exported distinctly, never called clean. Current HEAD and fresh authorization are explicitly unverified; actual G03 operations always revalidate the original server record, existing Auth and source binding.

If there is no suitable real finding after authorized observation, the [separate owner-repository option](GUARD_G03_OWNER_REPOSITORY_OPTION.md) is prepared locally. It contains reviewed vulnerable/fixed source and unchanged behavioral tests (3 PASS / 2 expected FAIL before; 5 PASS after), with file hashes. No Git repository/commit/remote/scanner finding was created for that option. It requires explicit owner target/write/scan approval and a distinct evidence classification.

## Provider and privacy readiness

[Non-secret settings](config/guard-g03.provider.example.json) and `scripts/guard-g03-setup.ts` prepare the existing OpenAI Responses adapter: exact snapshot `gpt-5.4-mini-2026-03-17`, documented input/output prices $0.75/$4.50 per million, maximum reservation **$0.0165**, below $0.10. Rates, snapshot and structured-output/Responses support were verified from the [official model documentation](https://developers.openai.com/api/docs/models/gpt-5.4-mini). AI and data-policy approval remain false; the template key reference is null. This is candidate settings readiness, not proof of a configured account or successful model call.

The [owner-only provisioning procedure](GUARD_G03_PROVIDER_SETUP.md) uses masked input and a fresh private directory outside Git, owner/SYSTEM-only ACL verification and create-new file semantics. The helper can inspect root/key-reference metadata but never reads key contents or emits private paths/key hashes. Its PowerShell instructions were syntax-parsed without executing provisioning. No real credential was created, read, copied or displayed by this work.

Prompt version `guard-source-remediation-v2` fixes a privacy boundary: sensitive multiline spans are redacted from the full authorized file **before** selecting the 25-line/6,000-character neighborhood. Original LF/CRLF line identities are preserved. Even if a private-key BEGIN marker is outside the neighborhood, its body is absent. Edits are rejected when the shown neighborhood is redacted, and diff context is compared with full-file redaction so tail lines cannot leak into persisted proposals. Model/prompt/consent/cost/source provenance remains durable. No whole repository is sent to AI.

Default safeguards remain server-side key reference, explicit opt-in, strict structured output/no tools, 20-second timeout, 10,000/2,000 token reservation, zero retries, $0.50/20-attempt daily project limits and one actor request per minute with real PostgreSQL serialization. `store:false` is not Zero Data Retention; the owner must review the [account data policy](https://developers.openai.com/api/docs/guides/your-data) before approval. Unknown attempts are observed read-only, never automatically repeated.

## PR, retest and persistence

Existing review/write gates, current owner/App checks, exact base/blob/source/diff digest binding, dedicated remediation branch, draft PR and read-only reconciliation remain intact. No real PR/write permission was exercised. The actual base/head and diff must be approved; the optional test campaign proposes non-default `g03/acceptance-base` and `wetscan/g03-*` branches. No default branch push, auto-merge, workflow permission change or deployment is included.

Retest still enters real G02 admission/queue/worker with one engine and exact branch/commit; G03 cannot broaden policy or reuse expired scanner qualification. It compares exact reviewed after-bytes, original rule/target, complete coverage, scanner/image/spec/rules and cleanup. Current verification is invalidated when a checked target moves, with history preserved. Original-repository behavioral tests and live PostgreSQL/UI/report/restart acceptance remain NOT_RUN. Patch scope remains one regular JS/TS/JSX/TSX/JSON file ≤24 KB; SCA is guidance-only.

## Validation

Exact fresh results/timestamps, failure classification, secret scan, checkpoint preservation, dry-run plan and scanner/PostgreSQL evidence are in [validation summary](acceptance/guard-g03/20261120-live-readiness/validation-summary.json) and its evidence index. The prior 75-file checkpoint/evidence is retained.

| Check | Final result |
| --- | --- |
| G03 unit/integration/security | **177/177 PASS**, 13 files |
| PostgreSQL isolated persistence/RLS/budgets | **2/2 PASS** |
| Real G02 scanner on controlled source | **1/1 PASS**, not original-repository acceptance |
| Browser E2E | **12/12 PASS**, Auth fixture/mocked Guard transport |
| Typecheck / lint / production build / smoke | **PASS**, zero lint errors/two existing warnings |
| Full regression | **2,733 PASS / 136 FAIL**, zero G03/integration failures |

The original 136 failures remain classified as 108 PowerShell-policy failures, 27 TEMP canonical-path boundary failures and one historical G01 CRLF/LF digest mismatch. A heavily parallel run additionally hit unchanged G01 snapshot lease-file I/O (`cleanup_failed`); the same unchanged suite passed **17/17** in isolation, and the final full run reproduced only the original 136 failures. Both observations are retained; no assertion was weakened or G01 altered to hide it. No G01 source/test or archive was edited, and no Execution Policy was changed.

## One next owner action

Prepare the separate private test repository using the reviewed local baseline ZIP from [the owner design](GUARD_G03_OWNER_TARGET_DESIGN.md), select it in the existing GitHub App/WetScan flow, and return its URL, baseline branch and full commit SHA. The design includes an optional metadata-only authorization message. Do not start source acquisition, scan or AI; no write approval is inferred from this setup request.

After that observation, present one exact source/context/model/cost approval for phase A, the actual diff plus one specific draft-PR write approval for B, and one exact after-commit scanner/behavioral-test/restart approval for C/D. These approvals are not assumed or requested blindly now. **COMPLETE requires all actual results, durable operational evidence and accepted scope; none can be inferred from the offline tests.**

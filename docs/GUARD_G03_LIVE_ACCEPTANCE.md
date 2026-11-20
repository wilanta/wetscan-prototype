# Current gate - 21 November 2026

Status **PARTIAL**. Owner approved publication of the audited G03 implementation branch, not Live Acceptance operations. Use the existing private target `inkAja/wetscan-g03-acceptance` at owner-confirmed `g03/acceptance-base@6eb920a5573c39105fa0390d464d271fb1c7b5bf`. No target finding is available yet; history was empty in the owner reader. No paid AI, GitHub write/PR, source acquisition, repository scan or retest is authorized.

The latest image diagnostic confirms compatible pin inspection only. Recovery/setup/qualification remain halted; do not retry them for the implementation commit. The next owner decision after checkpoint publication must separately authorize a reviewed local recovery procedure before scanner qualification and runtime readiness can progress. Thereafter source acquisition/baseline SAST, one budgeted AI request (maximum USD 0.10), patch review/draft PR write, and real revision-bound retest each require their specific approval. Existing staged plan below remains gated.

---

# G03 live acceptance — separate owner test repository, inactive

**Current owner recovery STOP (20 November 2026): operation 93cfd652-307c-43dc-bb10-3cd45f0987d9 ended IMAGE_PIN/IMAGE_PIN_STOP, known outcome, exit 1/no Node stderr, zero create attempts. New Temp preparation occurred, but no container/copy/sidecar/qualification. V1 discarded Docker stderr; IMAGE_PIN_STOP alone does not prove image absence. Docker 29 optional empty Config fields expose a concrete helper compatibility defect, not yet correlated to this owner run. See [the same-image READ ONLY diagnostic and separate V2 fix](GUARD_G03_IMAGE_PIN_STOP.md). Do not retry V1 or run V2; V2 recovery requires new approval after diagnostic. G03 PARTIAL.**


**Current owner diagnosis (20 November 2026): 70 references checked, 69 regular files; INSTALL_TRIVY_MANIFEST (.local/g02-install/context/trivy-db-manifest.json) FILE_MISSING_AT_CHECK. This is the concrete current prerequisite blocker; other file content/hash semantics remain unverified by metadata alone. Setup/qualification has not been retried. See [the proposed pinned-image cache metadata recovery into a NEW G03 sidecar](GUARD_G03_TRIVY_MANIFEST_RECOVERY.md); one never-started container/new local artifacts require NEW approval, NOT_EXECUTED. Existing installation/V1 artifacts remain unchanged. No owner source/scan/AI/PR/retest. G03 PARTIAL.**


**Current owner STOP (20 November 2026): the one approved setup attempt returned REFERENCES/ENOENT, STOP_BEFORE_QUALIFICATION, exit 1/no stderr, qualificationAttempted=false and localArtifactMutationAttempted=false. Do NOT retry setup, qualifier, export, proof or inventory. No runtime artifacts/config were created by setup; missing reference is not yet localized. See [the reference diagnosis and same-scope metadata-only observation](GUARD_G03_QUALIFICATION_REFERENCE_STOP.md). V1 artifacts remain frozen; V2 observability source is a non-operational proposal. Recovery/qualification retry requires new approval after diagnosis. G03 remains PARTIAL.**


**Current owner proof (20 November 2026): worker exact-target READ ONLY proof and pinned-image metadata verified; one DB connection rolled back/closed, three Docker metadata calls, Linux daemon 29.7.2, exit 0/no stderr, zero containers created. Do not repeat proof. Qualification and website worker attachment remain NOT_RUN. See [the controlled multi-CLI qualification plus NEW SAST configuration proposal](GUARD_G03_CONTROLLED_QUALIFICATION_SETUP.md); NEW approval required, NOT_EXECUTED. No owner source/scan/AI/GitHub write/retest. G03 remains PARTIAL.**


**Current owner inventory (20 November 2026): scanner non-secret inventory completed; g02-install image ID and rules manifest hash recorded, completion image manifest not projected, product.runtime.json not projected and Temp measurement NOT_READ. These are not Docker/qualification proof or target mismatch evidence. Reader remains verified; no source/scan/AI/GitHub write/retest. Do not repeat inventory. See [the bounded worker-role plus pinned-image READ ONLY proposal](GUARD_G03_WORKER_IMAGE_PREFLIGHT.md); NEW approval required, NOT_EXECUTED. G03 PARTIAL.**


**Current owner receipt (20 November 2026): one approved metadata POST completed, HTTP 200; TARGET_VERIFIED, app READONLY_TARGET_ROLE_SCHEMA_RLS_VERIFIED; policy NOT_VERIFIED, sandbox not ready, worker references missing. runtimeOperations=0. Do not repeat POST. Binding remains only in owner browser memory. No source/scan/AI/GitHub write/retest occurred. See [the current scanner setup prerequisites and non-secret inventory proposal](GUARD_G03_SCANNER_SETUP_NEXT.md). Inventory requires new approval and is NOT_EXECUTED. G03 remains PARTIAL.**


**Website reader verified from owner receipts (20 November 2026):** three app references attached; onboarding/readiness/history all GET 200; both repositories retained; database approved/schema verified; project scan history empty (not a clean scan). Scanner remains disabled by design. Owner separately confirmed g03/acceptance-base HEAD equals baseline 6eb920a5573c39105fa0390d464d271fb1c7b5bf; tree/blob unverified. See [next metadata/runtime prerequisites](GUARD_G03_READER_VERIFIED_NEXT_METADATA.md). A single POST metadata preflight is proposed but requires new approval beyond prior GET-only scope; no source/scan/AI/GitHub write/retest. G03 remains PARTIAL.

**Actual owner app-role proof received (20 November 2026): READONLY_PROOF_VERIFIED**, one connection to localhost:5432/wetscan_dev_guardg02 marker f0927e49-0e70-4b90-913f-6cd6984df9d8, schema/catalog RLS verified, rollback/pool close true, exit 0, no stderr. No website attachment/restart occurred. See [the next three-reference reader-only proposal](GUARD_G03_PROVEN_READER_ATTACH.md); NEW approval is required for process reference changes/local startup. No helper retry, worker credential, source/scan/AI/GitHub write/retest is authorized. G03 remains PARTIAL.

**Owner inventory received (20 November 2026):** worktree root ordinal 1 has consistent app/worker/target-only metadata for localhost:5432/wetscan_dev_guardg02, marker f0927e49-0e70-4b90-913f-6cd6984df9d8, expiry 22 November 2026 00:00 WIB. This differs from the old assumed 55434/d9058dd4 binding. No target is selected automatically and authentication is unverified. See [the new exact-target app-role read-only proof proposal](GUARD_G03_EXISTING_TARGET_PROOF.md). It requires NEW approval for one connection/internal app credential use; no helper retry, environment attachment/restart or database mutation is authorized.

**Owner metadata received (20 November 2026):** PowerShell 5.1/Node 24.17; server-only root package missing, LOCALAPPDATA pointer NOT_FOUND, all five Guard references absent, NODE_OPTIONS/NODE_PATH absent. Port status UNAVAILABLE and error signals empty do not prove a database failure. STOP remains in force. See [confirmed findings and the new non-secret inventory proposal](GUARD_G03_ENVIRONMENT_RECOVERY_PLAN.md). The approved presence-only diagnostic is complete; reading existing approval/config JSON is a NEW proposed scope, not yet authorized. No helper retry/install/DB connection/restart.

**STOP UPDATE (20 November 2026):** owner reader attempt stopped at G03_EXISTING_TARGET_VERIFY_STOP_NO_RETRY before reference attachment/npm startup. Do NOT rerun verify, env or the old attach block; do NOT restart/reset/provision. Prior reader approval is halted; any recovery needs NEW approval. See [the read-only diagnosis and metadata-only recovery proposal](GUARD_G03_VERIFY_STOP_DIAGNOSIS.md). Agent has not executed the helper or connected to the database. Owner-run internal phase remains UNKNOWN.

**Latest preflight receipt (20 November 2026):** owner GET confirms both selected IDs (839286157,1465216209), completed profile and target Private. Guard readiness is the default BLOCKED projection; history GET is 503 approval_required, not an empty result. Product reader is not configured/available in the observed website runtime; actual database absence/expiry is not proven. Follow [the reader-runtime diagnosis and owner-operated proposal](GUARD_G03_READER_RUNTIME_SETUP.md). Existing G02 reference attachment/local website restart is prepared but NOT_EXECUTED; all scanning/source/AI/GitHub-write/retest gates remain closed.

**Latest owner confirmation (20 November 2026):** the owner successfully added repository **1465216209** (inkAja/wetscan-g03-acceptance) and retained **839286157** (wdu), using the existing local browser session. This is OWNER_REPORTED_SUCCESS, not an independent agent API/UI observation. Agent sent zero POST requests; do not repeat the selection snippet. Continue with [GET-only baseline preflight](GUARD_G03_BASELINE_PREFLIGHT.md). Source acquisition, scans, paid AI, GitHub writes/PRs and retests remain unapproved; HEAD/tree/blob still unverified. Earlier missing-selection observations below are historical.

**Latest metadata update (20 November 2026):** owner created **inkAja/wetscan-g03-acceptance** (Private) and supplied baseline **g03/acceptance-base@6eb920a5573c39105fa0390d464d271fb1c7b5bf**. Existing discovery returned repository ID **1465216209**, default branch **main**; derived project **github-1465216209**. Branch HEAD/tree/blob identity remains unverified. Discovery succeeded; completed-onboarding selection UI has a confirmed access gap. Owner confirmed step=complete with only saved ID 839286157; target ID 1465216209 is absent. Proposed local selection union [839286157,1465216209] has NOT been submitted. Follow [the read-only diagnosis](GUARD_G03_REPOSITORY_DISCOVERY.md). No selection POST, source acquisition, scan, AI, GitHub write/PR or retest is authorized/performed by this update.

**Current authorization boundary:** owner setup is reported complete. Use only the existing four-file baseline and WetScan GitHub App. Metadata READ ONLY is approved; local repository-selection writes, source acquisition, scanning, paid AI, GitHub writes/PRs and retests remain unapproved. No G03 code or package change is needed.

Status: **PARTIAL - existing discovery confirmed; local selection update and HEAD/tree verification pending. Only metadata checks approved.**

**Latest owner decision:** use a separate owner-owned GitHub test repository. Neither `inkAja/wdu` nor `wilanta/wetscan-prototype` is approved as patch/PR target. The authoritative package, minimum owner setup and staged permission forms are in [the owner target design](GUARD_G03_OWNER_TARGET_DESIGN.md). Repository URL/ID/HEAD are pending; do not acquire source, scan, call AI or write to GitHub before specific authorization.

Latest continuation: [live readiness/checkpoint results](GUARD_G03_LIVE_READINESS.md), [checkpoint commit proposal](GUARD_G03_CHECKPOINT.md), [non-secret provider preparation](GUARD_G03_PROVIDER_SETUP.md), and [optional separate owner test repository](GUARD_G03_OWNER_REPOSITORY_OPTION.md).

The owner-exported `github-839286157` receipt identifies `inkAja/wdu`, with `storageStatus:UNAVAILABLE`, no loaded scan and no current-HEAD proof. It does not prove no findings exist. That URL was not the development repository's project and is no longer a campaign target. Do not continue operations on it. Metadata export now retains only fixed public error/status/configuration diagnostics; old exports cannot establish the cause of unavailability.

The concrete non-secret provider candidate is `gpt-5.4-mini-2026-03-17`, reservation $0.0165 (10,000 input / 2,000 output at $0.75/$4.50 per million). AI/policy flags remain false and the template has no key reference. Prompt version is `guard-source-remediation-v2`: redact the full authorized file before choosing a line-preserving neighborhood, reject edits to redacted neighborhoods, and reject private material in diff context. No real key, account access or response is verified. Real phase A still requires a valid finding, approved exact context and a separate paid-call approval.

Development repository: `wilanta/wetscan-prototype`, feature branch `feat/guard-g03-ai-remediation`, verified integration base `5e52ac2d9df641eebef5cb4818c4efb7887c0c5c`. Live source target: a separate owner test repository, proposed `<personal-owner>/wetscan-g03-acceptance`, branch `g03/acceptance-base`; actual URL/ID/HEAD are pending. The development base is not a live finding revision.

The target repository is not yet provisioned/authorized. No operational scan ID, finding ID, evidence identity or source digest is available for it. Do not substitute G01/G02 historical data, local fixture identities or an old vulnerable ancestor. First complete owner setup and metadata authorization from the current design, then request a separate one-shot source acquisition/baseline SAST scan approval.

## Server preparation without activation

Use the existing approved G02 local environment, PostgreSQL application role/FORCE RLS, GitHub session and GitHub App. Do not introduce a database, migration, OAuth flow or credential copy for live G03. No `.env` file is needed or inspected by this workflow.

Provision these settings in the **server process**, never `NEXT_PUBLIC_*`, a committed file or browser storage:

| Setting | Owner-supplied value / control |
| --- | --- |
| `GUARD_G03_ENABLED` | `0` during preparation; `1` only in the approved local runtime |
| `GUARD_G03_AI_ENABLED` | `0` during preparation; enable for the one approved request |
| `GUARD_G03_PROVIDER` | `openai_responses` |
| `GUARD_G03_MODEL` | Exact available snapshot model identifier; aliases returning a different identifier are rejected |
| `GUARD_G03_API_KEY_FILE` | Absolute reference to an owner-provisioned file outside source/worktree, inside an approved private runtime directory; no symlink, `.env`, or credential value in chat |
| `GUARD_G03_DATA_POLICY_APPROVED` | `1` only after owner/account policy review |
| `GUARD_G03_DATA_POLICY_VERSION` | Owner's auditable policy version, 1–120 letters/digits/dot/underscore/hyphen |
| `GUARD_G03_INPUT_MICRO_USD_PER_MILLION` | Current exact input price in micro-USD per million tokens, positive integer |
| `GUARD_G03_OUTPUT_MICRO_USD_PER_MILLION` | Current exact output price in the same units |
| `GUARD_G03_GITHUB_WRITES_ENABLED` | `0` until the actual diff and repository-write operation are approved |

No key/model/account configuration is claimed ready here. The adapter checks its private reference before calling its fixed endpoint. UI `requestEnabled` means settings metadata passed validation; `successfulResponseRecorded` requires a completed persisted response for that exact model/prompt/policy plan in that scan. Neither flag proves the complete live acceptance chain. Missing/invalid configuration fails closed; AI-off guidance stays available.

Request bound: one attempt, no retries, 20-second provider timeout, ≤10,000 reserved input tokens, ≤2,000 output tokens, ≤32 KB response and ≤$0.10 reservation. Project caps: $0.50 and 20 attempts per rolling 24 hours, one actor request per minute, serialized in PostgreSQL across scans. Failed/unknown attempts consume their reservation. `store:false` and no tools are set; account retention/training settings require the owner's documented policy review.

## One bounded acceptance sequence

Select a **SAST** finding for this acceptance. SCA findings support guidance only: dependency graph/lockfile/integrity changes are rejected by the bounded patch validator and require a manual package-manager workflow.

1. **Owner setup and read-only preflight.** Owner prepares the private target/branch from the reviewed package, selects it in existing Auth/App and returns its URL/full HEAD with metadata-only authorization. Verify identity, permissions and file tree against the package. Then obtain a separate approval for source acquisition and exactly one baseline G02 SAST scan at that SHA. Only its actual persisted finding may populate the tuple below. Stop on unknown files, stale HEAD, absent finding or incomplete evidence; no scan/source operation is authorized by this document.
2. **Source preview and one AI request.** Owner explicitly authorizes the one finding file read, reviews the redacted 25-line/6,000-character neighborhood and approves the exact model/policy/price plan shown in the UI. Send once, maximum $0.10; no automatic retry or second candidate. Save actual response ID/model/prompt/consent/source provenance. A provider error or unsafe edit remains a truthful failure.
3. **Human patch review and one draft PR.** Inspect the exact minimal diff, source digest, base commit and risks. Syntax and patch-apply checks must pass. Repository behavioral tests are `NOT_RUN` by G03; review/run the appropriate existing tests or CI before accepting behavior. Review approval alone permits no repository write. The owner then separately authorizes this repository/base/patch digest and the new `wetscan/g03-<proposal-id-prefix>` branch. Verify current owner admin/push and existing App contents/pull-request write permissions. If permission expansion is needed, owner handles it separately; no second Auth. Create at most one draft PR. Unknown outcome → read-only reconciliation, no republish.
4. **One actual targeted retest.** Before writing, establish how G02 can admit the exact remediation branch. An owner-approved G02 target must permit that branch; G03 cannot widen the policy. If it cannot, stop the acceptance chain before repository write (a later human merge would require separate authorization). After the PR commit exists, record its SHA and verify the finding file equals the approved patch bytes. Owner separately approves one relevant engine retest for that exact after-commit/branch. G02 performs the actual sandboxed scan. Compare the stored before/after artifacts, coverage, image/spec/scanner/rules and cleanup. Reproduced → `still_present`; missing coverage/error → `inconclusive`; changed bytes/target or unsupported proof → `not_verified`; only complete matching scanner absence → `fixed` / `verified_fixed`.
5. **Durable evidence.** Check the actual session UI, persisted proposal/review/PR/retest observations and JSON/HTML report, including expiration/download audit. Verify persistence after an approved local restart. Refresh branch/PR status to invalidate moved revisions. Disable temporary AI/write/runtime flags after acceptance. No merge, implementation-branch commit/push, deployment or archive modification is included.

## Selection record required before paid/write approval

| Binding | Current value |
| --- | --- |
| Repository | Separate owner-owned test repository; actual URL/ID pending, proposed `<personal-owner>/wetscan-g03-acceptance` |
| Workspace / project / actor | NOT_SELECTED — derive, do not guess |
| G02 scan ID / finding ID / evidence identity | NOT_SELECTED |
| Before branch / current HEAD / artifact digest | NOT_SELECTED |
| File path / Git blob / source SHA256 | NOT_SELECTED |
| Scanner / version / rule pack / image / spec | NOT_SELECTED |
| Exact model / policy / displayed reservation | NOT_PROVISIONED / NOT_APPROVED |
| Approved patch digest / dedicated PR branch | NOT_GENERATED / NOT_APPROVED |
| After commit / retest scan / comparison artifacts | NOT_RUN |

This is one reviewable procedure with bounded actions, not an approval request for unknown source or a future diff. The actual preview, diff and after-commit must be presented at their respective approval gates. **COMPLETE remains unavailable until the real repository chain is evidenced.**

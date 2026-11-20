# Authorized G03 checkpoint - 21 November 2026

The owner authorized one audited implementation commit and push to `feat/guard-g03-ai-remediation` with message `feat(guard): add consented G03 remediation and verified retest workflow`. Publication is conditional on all selected checks passing; this notice is recorded before publication. No PR, merge or deployment is authorized. G03 remains **PARTIAL**.

Final candidate inventory: **210 files** (the initial 207 plus three new sanitized evidence/manifest files). Current checks: G03 **194/194**, Auth/G02 **112/112**, browser **12/12**, typecheck, lint, isolated production build and smoke **PASS**. Lint retains two existing G02 fixture warnings. The final credential audit scanned all 210 files with zero findings/incomplete reads. PostgreSQL, real scanner fixture and the full regression were not rerun; their historical evidence remains separate.

Initial inventory: **207 files** (4 tracked modifications, 203 untracked), no staged files. All initial hashes and the original 46 implementation/tool/test hashes were preserved. The existing credential scanner found zero findings in all 207 files; the three fixture actor fields match the original G02 controlled fixture. Private `.local`, dotenv, credential, temporary output and owner state are excluded. The new dated manifest records the final candidate set; historical manifests remain frozen.

Verified local base: `5e52ac2d9df641eebef5cb4818c4efb7887c0c5c`, containing merged G02 PRs #17/#19. Remote metadata now reports master `ad0f7c25b60be9016f5de7a3746820013d0eae2a` and no remote G03 feature branch. No new master synchronization is part of this checkpoint. Review shared Live UI/CAS integration against newer master separately before integration.

Latest owner Docker diagnosis confirms the optional-field template incompatibility and compatible image pin; recovery, setup, qualification and repository scans remain stopped. See [current sanitized evidence](acceptance/guard-g03/20261121-checkpoint/checks.json) and [owner diagnostic receipt](acceptance/guard-g03/20261121-checkpoint/owner-image-pin-diagnostic.json). The proposal and prior counts below are historical.

---

# G03 checkpoint proposal — not committed

**Current owner decision (20 November 2026): ACTIVE MANUAL OWNER SETUP.** Use the existing four-file baseline ZIP for a new **Private** personal-account repository named **wetscan-g03-acceptance**, branch **g03/acceptance-base**. The owner will create the repository and upload the baseline manually. Do not use the fixed reference. After the owner supplies the repository URL and full commit SHA, continue metadata READ ONLY using the existing WetScan GitHub App. Source acquisition, scans, paid AI, GitHub writes/PRs and retests remain NOT_APPROVED. Prototype targeting is cancelled. No G03 code or package was changed for this decision. G03 remains PARTIAL.

Current campaign scope is the [separate owner test repository design](GUARD_G03_OWNER_TARGET_DESIGN.md). No patch/PR target is approved on `inkAja/wdu` or the development repository. Latest design/checkpoint hashes are in `docs/acceptance/guard-g03/20261120-owner-target-design/`; the older 75/109-file evidence remains frozen. This does not change the pending commit proposal or grant execution permission.

Branch: `feat/guard-g03-ai-remediation`; verified base/HEAD `5e52ac2d9df641eebef5cb4818c4efb7887c0c5c`. No new worktree, checkout, stash/reset/clean, staging, commit, push or merge.

The initial **75 files** exactly matched the [frozen stabilization manifest](acceptance/guard-g03/20261120-stabilization/changed-files.json). All 74 entries in its evidence index matched SHA256; its self-index is excluded by design. A new byte-verified full copy is `.local/g03-live-checkpoint-loJ0Bs/checkpoint.json`. Subsequent G03 edits are preserved separately in the new live-readiness manifest. No original file is removed, and prior evidence JSON is not regenerated.

## Proposed single atomic commit

```text
feat(guard): add consented G03 remediation and verified retest workflow

Integrate server-side AI advice, source-bound patch review, explicitly authorized
draft PR publication, targeted G02 retest evidence, PostgreSQL persistence and
the existing Guard Live UI. Add non-secret provider planning and local export of
stored SAST selection metadata without source reads or network mutations.

Cover consent, redaction/injection, budgets, stale revisions, patch scope,
authorization/RLS, PR gates, retest provenance and report integrity.

Live provider/PR/original-repository retest acceptance remains NOT_RUN.
G03 status remains PARTIAL; do not describe this checkpoint as live completion.
```

Recommended grouping for review (one commit after explicit approval):

| Group | Paths |
| --- | --- |
| Implementation | `src/features/guard/g03/`, G03 API route, existing Guard page/Live workspace integration |
| Non-secret configuration/tooling | `scripts/guard-g03-setup.ts`, `docs/config/guard-g03.provider.example.json` |
| Tests/check runner | `tests/guard/g03/`, G03 browser spec, existing browser config, `scripts/guard-g03-check.mjs`, default-inert Next test build isolation |
| Documentation | G03 validation, handoff, stabilization, staged live plan, provider setup, optional owner repository recipe and this proposal |
| Evidence | Existing G03 evidence plus the new non-secret checkpoint/test/readiness records; no raw failure logs or private state |

Do not stage `.local/`, `test-results/`, dotenv files, key/password files, Auth state, database dumps, copied source bundles or credential references. The intentionally vulnerable optional owner-repository bundle stays ignored and is not part of this implementation commit. Review the new manifest, full diff and secret-scan report before approval; stage an explicit file list only after approval. No `git add -A` or publication command was run here.

G01/N01, Auth, Sentinel, G02 scanner/worker/policy/database contracts and historical evidence are excluded from edits. Will should review shared Live UI integration and the additive `guardG03`/scan revision CAS contract before integration. This checkpoint proposal does not authorize that integration or any live operation.

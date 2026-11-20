# Owner test repository — selected strategy, not authorized for execution

**Current owner decision (20 November 2026): ACTIVE MANUAL OWNER SETUP.** Use the existing four-file baseline ZIP for a new **Private** personal-account repository named **wetscan-g03-acceptance**, branch **g03/acceptance-base**. The owner will create the repository and upload the baseline manually. Do not use the fixed reference. After the owner supplies the repository URL and full commit SHA, continue metadata READ ONLY using the existing WetScan GitHub App. Source acquisition, scans, paid AI, GitHub writes/PRs and retests remain NOT_APPROVED. Prototype targeting is cancelled. No G03 code or package was changed for this decision. G03 remains PARTIAL.

The owner has now selected a separate owner-owned test repository as the Live Acceptance strategy. Use [the current owner target design](GUARD_G03_OWNER_TARGET_DESIGN.md) and its four-file baseline ZIP. The earlier three-file bundle below is a retained local reference, not the upload package. No repository creation, source acquisition, scan, AI or write permission has been granted. `inkAja/wdu` and `wilanta/wetscan-prototype` are not campaign patch/PR targets.

Proposed new **private** repository: `<personal-owner>/wetscan-g03-acceptance` (owner namespace, name availability and repository creation are unverified). Do not modify the existing G02 acceptance repository or its historical branches/evidence. No GitHub repository, branch, commit, PR or scan was created for this option.

The prepared local bundle is `.local/g03-owner-option-B22JY3`, outside the commit manifest. Its `manifest.json` contains exact file SHA256 values. Two variants contain only:

- A private dependency-free ESM `package.json`.
- `src/parse-json.js`: vulnerable `eval(text)` versus the expected manual alternative `JSON.parse(text)`.
- Five `node:test` assertions using hard-coded scalar/array/object literals. No HTTP route, listener, deployment, network, credential or arbitrary input is involved.

The trusted local behavioral run produced **3 PASS / 2 expected FAIL** for the vulnerable variant and **5 PASS / 0 FAIL** for the fixed variant. The unchanged tests require parsing valid JSON objects and rejecting JavaScript object syntax outside JSON. No assertion was changed between variants. This is **local preparation**, not a GitHub source revision, a scanner finding or live AI acceptance. Never expose/deploy the deliberately vulnerable module or execute unreviewed input through it.

## Proposed campaign after separate owner approval

1. Owner approves this exact private repository, existing GitHub App selection and the reviewed bundle hashes. Create a non-default baseline branch `g03/acceptance-base`; leave the default branch untouched by this campaign. These source writes/commits are a separate approval from the G03 implementation checkpoint and from the later remediation PR.
2. Bind the existing G02 target/policy to the approved repository ID/workspace and baseline branch. Obtain fresh scanner qualification. Authorize exactly one baseline SAST scan at its actual branch HEAD. Select the real persisted finding for `src/parse-json.js`; record real job/finding IDs, artifact, image/spec/rules, cleanup and source commit. Do not seed database findings or reuse content-derived fixture revisions.
3. Approve one source preview and one actual AI request, with the displayed snapshot/policy/cost (candidate reservation $0.0165, ceiling $0.10). The bundle's fixed variant is a behavioral reference; **do not substitute it for the actual AI response** or fabricate a proposal if the model fails/refuses.
4. Review the actual generated diff and behavioral implications. Approve one dedicated remediation head `wetscan/g03-*`, with draft PR base `g03/acceptance-base` (both branches non-default). Confirm the current owner/App permissions and establish G02 admission for that exact remediation branch before repository write. No merge, force push or default-branch update.
5. Approve one G02 targeted retest at the actual PR head commit and the five reviewed behavioral tests against that exact file revision in an isolated environment. Expected manual behavior is 5/5, but store the actual result. Compare real artifacts, source bytes, coverage, cleanup and revisions; inconclusive/error/stale results remain unverified.
6. Verify the existing Guard Live UI, PostgreSQL persistence/report/audit and an approved local restart. Deactivate the temporary flags. Label evidence `LIVE_CONTROLLED_OWNER_TEST_REPOSITORY`; it proves the approved product workflow on that target, not a vulnerability/fix in `wilanta/wetscan-prototype`. The owner must accept that scope before it can satisfy the relevant G03 live acceptance gate.

All GitHub writes, new scans, AI calls, behavioral execution against a live revision and restart actions above remain **NOT_APPROVED / NOT_RUN**. Existing G01/G02 data, Sentinel and production source remain untouched.

# G02 operational Live startup and first real scan

Integration branch: `feat/guard-g02-g06-integration`. The existing worktree directory retains its original name; there is one prototype application. Use `npm run guard:dev` for the normal full website, with the owner's legitimate configuration. The sanitized `scripts/mvp-check.mjs` remains a test/demo harness and must not be used as Live startup.

Status: code wired, actual repository scan NOT_RUN. This is an operational setup note, not a G01 acceptance packet or runtime approval. G01 remains 2/16 PASS; N01 historical STOP / window-2 transaction UNKNOWN.

## What is connected

POST revision resolves an authorized pin without an acceptance draft. Normal POST scans creates scan+queue atomically, then registers Next `after` work. A bounded process scheduler serializes source-owning brokers. The original owner session is held only in an in-memory closure; current GitHub user/App/repository authorization is checked again before claim/source/scanner/writes. No cookie, session token or GitHub installation token is written into a job or passed to a container.

The worker uses the dedicated worker database role, the existing leased executor, heartbeat/fencing and maxAttempts=1. Every result update requires the current DB lease token/owner in the same transaction. Four existing Docker scanner adapters normalize real CLI stdout into findings/provenance and OSV inventory. Full source coverage is saved with the scan. Normal source/container cleanup precedes success. Unknown cleanup quarantines scheduler execution; no background orphan sweep is installed. Scanner commands never execute repository scripts, package hooks or Dockerfiles on the API host.

The host composition is for a self-hosted Node process (localhost). It is not a serverless worker service. Next after-response work does not block the initial HTTP202 response but must remain alive until the bounded job/cleanup completes. A process exit loses only the volatile owner capability, not the PostgreSQL job. After normal login, an owner can explicitly Resume unclaimed scan. The backend requires queued state, zero attempts, the same actor/repository/pin and normal kind before scheduling it. It never re-enqueues or resumes a historical/used attempt.

## Verified scanner installation - 18 November

The official release assets were downloaded and SHA256-checked before extraction: [Opengrep2.0.0](https://github.com/opengrep/opengrep/releases/tag/v2.0.0), [OSV2.7.1](https://github.com/google/osv-scanner/releases/tag/v2.7.1), [Gitleaks8.30.1](https://github.com/gitleaks/gitleaks/releases/tag/v8.30.1), [Trivy0.76.2](https://github.com/aquasecurity/trivy/releases/tag/v0.76.2). The image was built locally with build network disabled, a digest-pinned official Python base and public trusted components only. Its immutable local image ID is `sha256:3608834fae5f966e6380af0c7b2acf71a46af2ac2bac8591be2b0851d501fa51`; no registry push was made.

| CLI | Actual controlled-source result | Installed scope |
|---|---|---|
| Opengrep2.0.0 | PASS; 1 finding;933ms | Six pinned official JS/Python rules, not the complete rule library |
| OSV2.7.1 | PASS;5 findings;16332ms | npm package-lock, full official npm offline snapshot; no network/resolution/call analysis |
| Gitleaks8.30.1 | PASS;1 finding;1539ms | Explicit trusted official config, redaction100; fake test token only |
| Trivy0.76.2 | PASS;3 findings;2303ms | Embedded IaC checks, no check update or repository config override |

These are real CLI/normalizer installation checks on **controlled synthetic files**, not a GitHub repository scan or PostgreSQL success. Docker resource inspection and physical checks passed: UID65532, readonly root/source, source readability, no host credentials/socket/network/capabilities, seccomp/no-new-privileges,1CPU,64PIDs,16MiB noexec tmpfs,2MB output bound, timeout, cancellation, actual OOM137 and exact-owned container removal/absence. Other scanner memory=256MiB; only operational OSV permits an explicit2048MiB budget for its offline advisory database. Legacy G01 validation remains256MiB. This is not a claim that G01 source-orphan age>=one hour acceptance passed.

All failed installation attempts are retained under ignored `.local/g02-install`, including CRLF entrypoint failures and the original OSV256MiB OOM. The image recipe normalizes trusted entrypoint line endings during build. Trivy's explicitly clean root aggregate is omitted; root findings, traversal and targets absent from the authorized manifest are still refused. The first Gitleaks test accidentally used an excluded fixture filename; the controlled file was renamed, without relaxing the production sensitive-path policy.

Measured installation/qualification files and Docker metadata recheck PASS are available in `.local/wetscan-g02-runtime-install-20261118/deployments.measured.json`, protected by current-user/SYSTEM-only ACL. They contain no job/DB authority. Their measured validity ends **18 November2026,17:53:26 WIB**. Qualification freshness remains a separate safety check, not a30-minute website usage limit. Do not extend/re-date stale evidence. Once infrastructure is ready, the same installation runner can refresh measurements against the same controlled files; no owner repository is accessed:

```powershell
$env:G02_INSTALL_DOCKER=(Get-Command docker.exe).Source
node --import tsx worker/guard/installation/qualify.ts .local/g02-install --full
# Export the exact successful report with measured.ts into a new ACL-protected
# G02 runtime directory. Existing evidence is exclusive-created, never overwritten.
```

## Remaining owner inputs - one setup list

1. **Database catalog result, then provisioning approval if absent.** On a NEW pgAdmin maintenance connection to `localhost:5432/postgres`, run the WHOLE `migrations/guard/g02-target.READONLY.sql` once. It selects catalog metadata only, includes ROLLBACK, and never uses the old N01 tab. Send `g02_catalog_metadata` and whether ROLLBACK succeeded, without credentials. It distinguishes an absent target from an existing one; no database connection/reference was available to the agent, so target existence is not assumed.
2. **Review the prepared, NOT_APPROVED SQL if a new target is needed.** `.local/g02-install/database-proposed/01-create-database.NOT_APPROVED.sql` and `02-schema.NOT_APPROVED.sql` propose ONLY a new `wetscan_dev_guardg02`, owner `wetscan_guard_migrator`, marker `wetscan-s01:f0927e49-0e70-4b90-913f-6cd6984df9d8`, and Guard max_running=1. Reuse existing Guard roles; no role/password creation/reset. The immutable shared platform baseline creates inert Sentinel namespaces/tables ONLY inside this NEW isolated database; existing Sentinel databases/rows and role membership are untouched. Existing shared `wetscan_app`/`wetscan_sentinel_worker` role names are prerequisites of that baseline. PUBLIC CONNECT is revoked, and only existing Guard roles receive CONNECT. Canonical schema ownership uses migrator, with an explicit RESET ROLE to the bootstrap operator for the platform-access/RLS budget bootstrap. The files have NOT been executed. Do not run either before separate owner database-mutation approval, and do not apply them to an existing nonempty target. If target already exists, inspect its metadata/schema read-only instead of recreating it.
   Owner catalog evidence received at18Nov2026 17:50:21 WIB: maintenance database postgres, READ ONLY, targetExists=false, all three Guard login roles present without superuser/bypassRLS/CREATE ROLE/CREATE DB, ROLLBACK confirmed. This is owner-reported catalog evidence; no agent DB connection occurred.

   Before provisioning approval, the offline proposal was corrected for PostgreSQL's single-statement CREATE DATABASE requirement. The first file now contains ONLY CREATE DATABASE; execute it as a whole with pgAdmin Auto-commit ON on the maintenance connection, with no open transaction. After confirmed CREATE DATABASE success, the second file runs as a whole on a NEW connection to wetscan_dev_guardg02: one guarded transaction for marker/CONNECT ACL and immutable schema baseline. It verifies exact target/port/owner, a null initial marker, empty target schemas, bootstrap operator and existing roles before any writes. The two shared baseline role names are checked by that guard; the supplied catalog JSON only covered Guard roles. Old unapproved proposals are preserved as pre-single-statement.NOT_APPROVED.sql files and must not be executed.

   Current SHA256:01-create-database.NOT_APPROVED.sql = a2cae1d2448f3927e777c8c2732fd3c60aa143593391ff606075d583fa2f9942;02-schema.NOT_APPROVED.sql =12dd6d4a73ab84ba495849d7a79674987c01685209491b1716f894da50750df4. No file is authorized yet. After CREATE and schema COMMIT are both confirmed,03-verify.READONLY.sql is ready on the new G02 connection and includes ROLLBACK. Expected: exact marker/owner, canonical platform3/Guard1 ledgers, Guard budget1, forcedRlsCount3, scanRows0/guardJobRows0, app/worker privileges+CONNECT true. This metadata does not prove password authentication by app/worker; the normal process preflight still does that.

   CREATE DATABASE is not rolled back if the second file fails. On mismatch/error/unknown, STOP and report existing evidence; do not rerun, drop/reset the DB, change roles or improvise grants. Schema/metadata changes in the second transaction require confirmed COMMIT. All provisioning is still awaiting separate owner approval.

3. **Legitimate MVP process and target-specific references.** Start this worktree using the owner's normal Auth/GitHub configuration; do not copy G01 .env, credential files or Auth stores. App/worker reference names were absent only in the agent's Process/User/Machine metadata; this says nothing about the separate existing owner process. Use normal app/worker password references if legitimately provided by the owner, plus NEW target-bound configuration approval files for the operational DB. No historical G01 permit or fixture-target approval is accepted. Required names: GUARD_DB_APP_APPROVAL_FILE, GUARD_DB_APP_PASSWORD_FILE, GUARD_DB_WORKER_APPROVAL_FILE, GUARD_DB_WORKER_PASSWORD_FILE, GUARD_PRODUCT_CONFIG_FILE. Never send the values/paths/passwords through chat. The deployment JSON combines the measured deployments with the actual owner workspace/project/repository/allowed branch policy and the approved operational target; it is not a scanner execution permit.

The remaining missing evidence is the actual operational DB catalog/role/schema/RLS connection and authenticated provider/repository selection in the MVP process. These cannot be inferred from tests or another process. No role/database mutation, owner logout, owner source acquisition or scanner activation has occurred.

## Minimum application action before any scan approval

Use the MVP worktree with the legitimate existing Auth/provider configuration. Do not copy .env, Auth stores or private state. The existing port3000 owner process was not stopped/replaced; coordinate its normal switch separately. Do not operate the unresolved pgAdmin recovery transaction as part of this switch.

In the correctly configured owner terminal, keep `GUARD_PRODUCT_ENABLED=0` during preflight. Set the non-secret deployment file reference locally, then run the normal Node development server from the MVP root with Webpack:

```powershell
Set-Location 'C:\laragon\www\wetscan-2\wetscan-guard-mvp-local-demo'
$env:GUARD_PRODUCT_ENABLED = '0'
# Set GUARD_PRODUCT_CONFIG_FILE to your existing reviewed non-secret deployment JSON locally.
npm run guard:dev
```

Do not start a second process on an occupied port or kill an unknown process. Do not create a second demo. Use normal GitHub login and the authorized selected repository in this same application.

On the selected real project's page, run this READ ONLY request once in its existing authenticated Console (the project ID is taken from the selected real Guard page). This reads process reference metadata, current provider authorization and configured DB/sandbox observations. It does not enqueue, launch, snapshot or enable a permit. It does not read raw credential values into the response. If Console blocks or output is unknown, report that; do not bypass.

```javascript
void(async()=>{
 const projectId=location.pathname.match(/^\/app\/projects\/(github-[1-9]\d*)\/guard(?:\/|$)/)?.[1];
 if(!projectId)throw Error('Open the selected real Guard project first; STOP');
 const r=await fetch('/api/guard/projects/'+encodeURIComponent(projectId)+'/preflight',{
  method:'POST',credentials:'same-origin',cache:'no-store',redirect:'error',
  headers:{'Content-Type':'application/json'},body:'{}'
 });
 console.log(JSON.stringify({httpStatus:r.status,...await r.json()}));
})();
```

Expected readiness: authenticated=true; providerAuthorizationVerified=true; configuration=TARGET_VERIFIED; policyBinding=VERIFIED; sandbox=METADATA_AND_QUALIFICATION_VERIFIED; both database fields READONLY_TARGET_ROLE_SCHEMA_RLS_VERIFIED; runtimeOperations=0. Each DB probe opens BEGIN READ ONLY, sets only transaction-local Guard RLS context, and closes ROLLBACK, verifies target/marker/owner/current role/no superuser/no bypassRLS/schema/forced RLS/permissions/Guard budget. DB checks are independent of scanner availability. `pinnedCommitVerified=false` is truthful: this endpoint did not resolve a commit or acquire a snapshot.

## First real scan proposal - only after readiness is actually verified

No target or scan approval is implied by this note. Record one selected repository ID/name, workspace/project, branch and resolved40-character commit, selected engine(s), pinned image/spec/rules/qualification digests, and the actual operational database target. Use Resolve pinned commit in Guard Live to obtain current metadata without a source snapshot. Request the owner's explicit approval for that target/operation before enabling scanning.

Suggested first test: one authorized test repository, one pinned commit, one supported engine (then expand to the other engines). One enqueue/idempotency identity, one durable job/attempt, one immutable snapshot, qualified readonly container execution and normal owned cleanup; no push, deployment, AI/DAST or orphan cleanup. The normal job timeout/resource limits remain enforced. No G01 acceptance window/permit is used.

Only after that approval, enable the reviewed operational runtime in the configured process and use Start repository scan once. The UI opens the actual returned scan ID and polls GET state. It must show stored actual coverage/provenance/findings, not synthetic content. If interrupted before claim, Resume unclaimed scan is explicit and performs no enqueue. Errors/unknown evidence never imply PASS. Do not retry a used attempt; investigate it separately.

Verify PostgreSQL and UI agree on exact commit/scan ID, terminal state, engine status/version/rules/output digest, normalized findings/evidence, source coverage and cleanup. An empty finding list alone is insufficient. Release evaluation remains enforced=false; G03 AI/retest, G04 provider checks, G05 HTTP invariants and G06 consumer delivery stay visibly unavailable until separately implemented/verified. G02 remains PARTIAL until actual real-repository E2E evidence exists.

These operator instructions grant no database/scanner/provider authority. The separate 19 November owner authorization permits a verified integration commit/push only to feat/guard-g02-g06-integration. Merge, PR7 changes, deployment, Sentinel/staging/master mutation and N01 recovery remain prohibited.

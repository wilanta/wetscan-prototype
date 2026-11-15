# S03 migration review — DEV migration PASS / bounded H03C-2 acceptance PASS

Final offline review identity (LF-normalized UTF-8; independently reproduced with Python and the existing Node plan command; **zero database connections for offline hashing**; subsequent authorized read-only H03A observations are below):

| Item                                                     | SHA-256                                                            |
| -------------------------------------------------------- | ------------------------------------------------------------------ |
| Combined 0001+0002+0003+unchanged role provisioning plan | `c3e39f6fd43ee6eb2fbf5b244778955aab4cabb8a11ed3c66d791cf99a252a94` |
| 0003 up-NUL-down pair                                    | `4f0ee1cebdbdc81b835f719ef13c9cb703dfb5f440193765dfa0a61635fb6168` |
| 0003 up SQL                                              | `25c2820e7b50501c3358486bb6c4520a2d17fb5343635ee3a173424bcb01a83e` |
| 0003 down SQL                                            | `bfe2857310b8f7d1c6f1743cfc99c5bbfc28a110159c43510e73736671423234` |

SQL review added explicit PUBLIC revocation before narrow runtime grants. No previously applied migration was changed. Earlier unpublished draft S03 hashes are not the final plan. At preparation time SQL execution/DDL validation on PostgreSQL was NOT RUN; subsequent H03B TEST execution passed below.

Preparation made no S03 PostgreSQL connection. H03A subsequently performed the authorized read-only TEST preflight/backup below; that H03A phase made no database writes. Subsequent H03B TEST migration and acceptance writes passed below; DEV was untouched during H03B; subsequent H03C-1 DEV migration passed below. This proposal does not activate historical H01/H02 approvals. Version `0003_detection` is additive. Complete SQL: `migrations/sentinel/0003_detection.up.sql` and `.down.sql`; the offline existing `sentinel:db plan` command reproduces the final checksums recorded here after validation. Historical 0001/0002 SQL remains unchanged.

## Proposed target history (fresh TEST-only H03A observations below)

Existing local Docker context desktop-linux; container wetscan-sentinel-local-postgres-1; volume wetscan_sentinel_s01_dev_20261114; PostgreSQL17.12 at127.0.0.1:55432. No provisioning or existing volume modification proposed.

Historical approved image: `docker.io/library/postgres:17.12-bookworm@sha256:99d1a998c76487d3abb48b141505bda5dcf8089c0c4cd7be40f75de314fa32f0`, linux/amd64. Recheck actual Docker context/container/image/volume/loopback mapping read-only before a later migration; this preparation did not pull, start, inspect or modify Docker. Current presence/health is not freshly claimed.

TEST proposal: `wetscan_s01_test`, marker `wetscan-s01:9f3560a6-127f-42a6-abaf-9f45951e6bd5`. DEV later/separate: `wetscan_dev`, marker `wetscan-s01:26b6b537-c016-4dc7-8007-4e839e8b838f`. DEV/H02 runtime and historical queued-job replay are **not** included in TEST acceptance approval.

Historical ledgers contain exactly 0001_foundation checksum `dd061a60b123284882f154c438de3a171d60967b7b07a4e07200b6693f4eb778` and 0002_telemetry checksum `d1b67dc680f5bf3c2cbe585dca2427abf9d7ba9f29479c69b851f66b91c1f5a3`. Their actual current application times/rows must be verified read-only before any new writes. Old combined plan `9ceabe57b696fbe59bd51fb5939a197a378abed9c3084802850c4e9d632270f9` is superseded for S03; never upgrade a consumed approval in place.

## Proposed operations

Existing advisory-locked migration transaction applies only pending 0003 and inserts its ledger row; second up verifies all checksums without replaying SQL. Eight new Sentinel tables, their constraints/indexes, one additive event-time query index on S02 events, FORCE RLS and narrow grants to existing roles. No role/password/marker/database/volume changes, seed rows, telemetry rewrite, queued-job consumption or new schema. Runtime app can append immutable versions/audit and update only current-version metadata; worker can write only derived detection state, never rule definitions or source credentials. New detection RLS requires exact transaction mode/workspace/project/module for both runtime roles; existing broader trusted maintenance role policies are unchanged.

Reversal refuses **any** S03 rows under dependency table locks, preserves S02 objects/data and uses no CASCADE/force. Existing0002 populated-state/job refusal and0001 refusal remain independently tested. Populated S03 uses forward correction/backup, not down. No development down is proposed. No reset, truncate or old empty-suite replay against populated TEST.

## Preservation and preflight

Before mutating acceptance: fresh separate private approval/env; verify all three principal identities, marker, exact endpoint, role attributes, version, expected two-row ledger/checksums, absent S03 objects and unused fixture scope. Take repeatable-read read-only row fingerprints of **all** existing platform/Sentinel rows, existing role/grant/policy/catalog evidence, and a private restore-capable PostgreSQL backup before applying DDL (operator-approved output outside repository/OneDrive). Stop on mismatch or unavailable backup. Baseline evidence is private; never publish raw rows, hashes of credentials or credentials. Preserve all existing TEST fixtures and H02 DEV eight events/six receipts/eight jobs.

Only approved TEST operations:0003 up/up; create fresh UUID-isolated controlled fixtures; use app/worker transactions to evaluate only new jobs; verify read-only old-row preservation, exact grants/RLS and fresh-pool restart evidence. New fixture rollback can use deliberately failed transactions; leave committed acceptance records intact. Populated-down verification must use a SQL allowlist that prevents DDL/ledger DML from ever being sent. Retention tests require a separately listed disposable fixture scope and deletion approval; do not infer deletion permission from general testing.

Separate decisions required: (1) fresh read-only exact-target preflight/backup and TEST migration/acceptance including fixture budget/operations; (2) DEV0003 up/up after TEST passes; (3) new real authenticated project/source/key and bounded app/worker/emitter runtime, precise cutoff and historical-job preservation; (4) publication. Historical revoked keys stay revoked. S03 completion waits for genuine database and HTTP→worker→alert→UI acceptance.

## Concrete next approval and commands

**First request: read-only TEST preflight and private backup only.** New ignored approval file must bind the exact TEST target above, the final plan, `actions:["runtime"]` and `s03ReadOnlyPreflight:true`. The owner subsequently supplied this explicit H03A decision; the fresh private record was used and closed after the successful observations below. This paragraph preserves the original preflight proposal; it grants no repeat access or mutation approval. No database write or main-worker activation is authorized by this record. Proposed new files: `.local/sentinel/s03-readonly-approval.json`, `.env.sentinel.s03.preflight.local`; prior files remain untouched.

After that explicit approval, `node --env-file=.env.sentinel.s03.preflight.local --import tsx scripts/sentinel-detection-preflight.ts --read-only` verifies the exact marker/principal, PostgreSQL170012, migrator ownership,40connections, restricted roles/no memberships/default-ACL overrides, expected two-version ledger/12tables and no detection objects/index. It writes a NEW ignored baseline/fixture proposal file and prints only sanitized identity/counts/ledger/aggregate digest. It does not create a backup itself. A restore-capable `pg_dump` custom-format backup must then be created/read-verified through separately approved read-only access, outside this checkout/OneDrive, with restricted ACLs. Backup format/content integrity and restore suitability require operator verification; a matching file hash alone does not establish a restorable backup.

**Then request TEST mutation acceptance** with the actual fresh baseline, backup checksum/location, proposed fixture UUID and same plan. New private approval needs `integration_test`, `migrate_up`, and `migrate_down` strictly for the guarded refusal probe; runtime is not necessary for this harness. Its `s03Acceptance` extension requires exactly `{fixtureId,baselineSha256,backupFile,backupSha256,operations}`. Operations in order: `up_up`, `new_fixtures`, `process_fixture_jobs`, `expire_fixture_lease`, `fixture_hold_transitions`, `negative_dml_rollback`, `populated_down_refusal`.

Proposed isolated workspace: `github-user-7:s03-<approved fresh fixture UUID>`, projects `github-123`/`github-456`; `-other` workspace is a read-denial probe. Conservative budget: <=20 new sources/credentials, <=25 new events/receipts/jobs, <=25 rules, <=100 versions per rule, derived rows within documented caps. New binding/source rate counters, new rule revisions, new job leases/attempts/retries/cancellation/completion and new derived evidence may change; **every pre-existing row must retain its exact fingerprint**. Actual other-project evidence is used for FK denial. The harness ages only one new fixture lease, toggles only its fresh binding hold, and runs negative DML inside rollback. It never approves expiration cleanup, resets or successful down on populated TEST. New fixture credential hashes/rows remain retained; plaintext keys stay in process memory and are not printed.

After mutation approval: `node --env-file=.env.sentinel.s03.test.local --import tsx scripts/sentinel-detection-test.ts`. It revalidates target/hash/actions/backup/baseline, unused scopes and no active leases/unexpected ACL/index before up/up.24fail-fast real PostgreSQL cases are prepared; all are currently skipped/not executed. Original S01/S02 full runners are not invoked because their empty-reversal fixtures are unsafe on populated TEST. No main Sentinel worker, sender, new live source or DEV connection occurs through this test harness.

Role/grant proposal: app SELECT/INSERT rules/versions/audit and UPDATE only `detection_rules(current_version,updated_at)`; app SELECT-only derived tables. Worker SELECT-only rules/versions/audit, SELECT/INSERT/UPDATE/DELETE alerts/cooldowns, SELECT/INSERT/DELETE evidence/evaluations/suppressed evidence. PUBLIC revoked. Eight tables,16policies,18new indexes (including constraints and the one additive telemetry event-time index). No credential-table grants or role attribute changes. The trusted worker still has its pre-existing module-wide maintenance access to S01/S02 tables; new detection tables additionally require exact transaction scope. This is not a tenant-facing database credential.

DEV, actual app/worker runtime and historical-job replay remain separate later decisions even if TEST passes. No automatic fixture deletion or approval reuse.

## H03A observed result — PASS, 15 November 2026

Owner authorization: **Read-Only PostgreSQL Preflight and Private Backup**, attachment `a76f930b-6dd6-4477-a23d-bfc14cea0f0e`. This permitted only exact-TEST read-only verification and a private logical backup. It did not authorize migration, fixture writes, a restore, DEV access, worker startup, historical-job processing or publication. The new private runtime-action record also required `s03ReadOnlyPreflight:true` and separately recorded backup permission; it is now **COMPLETED_H03A_READONLY_BACKUP**, with no active actions. Earlier approvals/configuration/password files were preserved. No mutation approval has been created.

### Fresh target and preservation evidence

Verified branch `feat/sentinel-s03-detection-alerts`, HEAD/base `cd313ce29aeac865e15cea9abd9c412cb9c2c3cc`, all 46 public S03 files preserved and0 staged. Existing second worktree was not modified. No main Sentinel/Guard worker, emitter or migration process was running; no app/worker/helper listener on3000/3112/3113/3214. Only approved PostgreSQL loopback55432 was present.

Exact connected TEST target: **127.0.0.1:55432 / wetscan_s01_test**, shared-object marker **wetscan-s01:9f3560a6-127f-42a6-abaf-9f45951e6bd5**. Actual PostgreSQL **17.12 (Debian17.12-1.pgdg12+1),170012**. Database owner and baseline/dump role **wetscan_migrator**. Actual read-only identity connections for all 3 roles succeeded; all are LOGIN/NOSUPERUSER/NOCREATEDB/NOCREATEROLE/NOBYPASSRLS with no memberships. PUBLIC has no database privileges; runtime roles have CONNECT only at database level and no CREATE in platform/sentinel. Effective table/column privileges and existing ACLs were captured privately and matched the retained S02 evidence. No role/password/grant/marker was changed. Runtime RLS remains active even for the migrator; its existing SELECT policies allow complete read coverage, without BYPASSRLS.

Docker context **desktop-linux**; unchanged container **wetscan-sentinel-local-postgres-1**, ID `0220e86e719aa43c30dfd3ba371e290de0fe9141d8d1fe7f7fc6a58accb8961f`; data volume **wetscan_sentinel_s01_dev_20261114** at `/var/lib/postgresql/data`; only mapping 127.0.0.1:55432→5432/tcp. Image digest `sha256:99d1a998c76487d3abb48b141505bda5dcf8089c0c4cd7be40f75de314fa32f0`, PostgreSQL17.12 Bookworm/linux-amd64. Limits remain 1 GiB / 2 CPUs / 128 PIDs / 40 connections. No Docker object was created, started, deleted or reconfigured.

| Applied migration | Exact pair checksum | Actual applied_at (UTC) |
| --- | --- | --- |
| 0001_foundation | `dd061a60b123284882f154c438de3a171d60967b7b07a4e07200b6693f4eb778` | 2026-11-14 12:24:59.556942+00 |
| 0002_telemetry | `d1b67dc680f5bf3c2cbe585dca2427abf9d7ba9f29479c69b851f66b91c1f5a3` | 2026-11-14 20:03:28.380091+00 |

Exactly these 2 ledger entries; **no 0003 entry, detection table or telemetry_detection_window index**. User schema inventory platform/public/sentinel; 12 tables, 21 indexes, 11 ENABLE + FORCE RLS tables and 22 policies. Public has no application objects; no extra user tables/views/sequences/foreign tables or large objects. Existing migrator default-ACL overrides 0.

| Retained TEST records | Before | After |
| --- | ---: | ---: |
| Migration ledger / module limits | 2 / 1 | 2 / 1 |
| Project bindings / sources / credential hashes | 7 / 21 / 22 | 7 / 21 / 22 |
| Events / batch receipts | 26 / 20 | 26 / 20 |
| Jobs queued / leased / completed / failed / cancelled | 18 / 1 / 0 / 0 / 0 | 18 / 1 / 0 / 0 / 0 |
| Job attempts / outbox / notification attempts / worker heartbeats | 0 each | 0 each |

The one leased historical fixture is expired, not an active worker; active leases 0. It was not renewed, reclaimed, processed or repaired. Original retained S02 post-retention snapshot exactly matches the fresh snapshot, including every row fingerprint, ledger timestamp, catalog, roles, grants and policies. Canonical 12-table baseline digest before/after: **`15d09c6bf16415d8115b9034faf42cdf73d93eb0ebd29012fa3cd7cdb217601a`**. Extended inventory digest before/after: **`29939a832862d8c4683e8c453a25e9e34955b987cbf72150ba5bb5f7763933c3`**, including index/constraint/schema/column-ACL/effective-privilege inventories, role identity observations and job status counts. Both comparisons were exact; 0 database mutation statements. Separate DEV and its H02 records were **not accessed**.

### Private backup and archive inspection

Actual dump UTC **2026-11-15T03:31:26.996Z–03:31:27.988Z** (10:31WIB). Full unfiltered PostgreSQL custom archive, **66,522 bytes**. SHA-256, independently equal under Node and PowerShell Get-FileHash: **`a98a5c2ffced1d88e5012c2cd63658ee7e0aa7cc445871b5dea9b659a0003678`**.

No host pg_dump executable was available. Existing approved container's **pg_dump 17.12** connected with the unchanged migrator password-file credential to the same TEST database over container-local TCP 127.0.0.1:5432, behind the reverified host 127.0.0.1:55432 mapping. Explicit username/database and default_transaction_read_only=on; no bootstrap/superuser/role switching. Password entered only private child stdin, never command arguments, environment files, output or archive. Docker stdout streamed binary directly to a newly exclusively created private host file; no container filesystem dump copy, new container or network was used.

Dump options: `--format=custom --inserts --enable-row-security --no-password --lock-wait-timeout=5s`, explicit host/port/user/database. **RLS stayed ON**. All 11 protected tables have an existing unrestricted migrator SELECT policy and no restrictive policy; SELECT privilege exists for every table. No filter, exclusion, --clean, --create, role elevation or bypass option. [PostgreSQL17 documentation](https://www.postgresql.org/docs/17/app-pgdump.html) explains that this RLS option preserves access policies and recommends INSERT output for subsequent RLS-aware loading. All 12 archive INSERT counts were independently compared in memory with the complete baseline counts above, not merely assumed from policy names.

Dump exit 0, stderr 0 bytes. PGDMP magic/nonempty file verified. Matching **pg_restore 17.12 --list** exit 0: 12 table definitions and 12 TABLE DATA entries, platform/sentinel schemas,22 policies, 11 row-security entries, 17 ACL entries, 7 standalone indexes (the other 14 indexes are constraint-backed). All table data, schema definitions and relevant owner/privilege references are covered; no unexplained exclusion. Complete offline `pg_restore --file=-` decode exit 0, no database connection or SQL execution; INSERT counts exactly match every baseline table. No decoded rows/payloads/credential hashes were printed or written to public files.

Archive, TOC, before/after redacted fingerprints, readiness evidence and backup report are in a new ACL-restricted private local directory **outside the checkout and OneDrive**, no reparse point. Directory inheritance disabled; only current operator and SYSTEM have access; every artifact's effective ACL was checked. Resolve its location through ignored `.local/sentinel/s03-h03a-private-directory.txt`; do not publish the archive, TOC or private inventories. The separately ignored env contains file paths only; new read-only approval is private and closed.

**Not restore-tested.** Archive listing and full offline decode do not prove a successful restore. Cluster roles/passwords/tablespaces are outside a database-level dump; role names must exist for owner/ACL replay. The installed plpgsql extension definition/version reference is included, not its server binaries. Without --create, database creation, database-level marker/ACL/settings need separately reviewed provisioning. A restore rehearsal requires a new explicit target-specific approval for a fresh isolated disposable database; neither existing TEST nor DEV may be used for that rehearsal.

### Static migration readiness and next approval

The existing Node offline plan and an independent Python implementation reproduced **`c3e39f6fd43ee6eb2fbf5b244778955aab4cabb8a11ed3c66d791cf99a252a94`**. Both historical SQL pairs and role provisioning match HEAD exactly. 0003 up/down/pair identities remain the reviewed hashes above. No SQL, runner, source, tests or configuration template changed during H03A.

Final static review: 8 additive Sentinel tables; immutable runtime version/audit grants; deferred current-version FK; exact versioned alerts and real event/source evidence; scoped composite PK/FKs; deduplication/correlation uniqueness; 7 explicit indexes plus 11 constraint-backed new indexes; 16 FORCE RLS policies; PUBLIC revoked and narrow app/worker grants. Versions/audit have no runtime UPDATE/DELETE, app cannot write derived alerts, worker cannot write rules or read credentials. This is runtime-role immutability, not protection against the trusted database owner altering its own schema. S02 retention gains scoped evidence pins and restrictive FKs; derived retention preserves hold/pending references. Default-off scoped activation and new-job cutoff preserve historical queues. Ordered advisory-locked up/up checksums and empty-only down refusal were inspected; no applied ledger rewrite, destructive SQL or historical data mutation is proposed. Additive event index/DDL can acquire locks during future acceptance. Actual PostgreSQL DDL/constraint behavior remains unexecuted, and 24 acceptance cases remain **NOT RUN**.

**Ready to request separate TEST migration/acceptance approval**, not permission to execute it now. Proposed new unused fixture UUID **`237b6b3d-da98-4b38-8b14-6b7c15811be6`**; workspace `github-user-7:s03-237b6b3d-da98-4b38-8b14-6b7c15811be6`, projects github-123/github-456; -other workspace only a read-denial probe. Fresh read-only absence confirmed, active leases 0 and other Sentinel sessions 0. Future execution must recheck identity, baseline, exact archive bytes/ACL and unused scope immediately; stop on drift. New approval binds actual baseline/backup/fixture, exact plan and actions integration_test/migrate_up/migrate_down **only for a firewall-protected populated-down refusal**, never successful reversal. Explicit operations: up_up,new_fixtures,process_fixture_jobs,expire_fixture_lease,fixture_hold_transitions,negative_dml_rollback,populated_down_refusal. Budget <=20 new sources/credentials, <=25 events/receipts/jobs, <=25 rules with <=100 versions/rule and documented derived caps. Preserve every old row and retain new committed fixtures; no successful deletes/cleanup, old-suite reset or main worker. DEV up/up, actual app/worker/emitter integration, historical replay, restore rehearsal, publication and S04 each remain outside this approval.

One supplemental read-only inventory helper initially referenced jobs.status instead of the existing jobs.state (SQLSTATE42703). Transaction rolled back; no snapshot or backup was produced by that attempt. Correcting only its private SELECT to state/lease_until yielded the passing inventory above. This was a helper error, not migration/schema drift; application/SQL/checks unchanged. Unit/typecheck/lint/build/browser counts elsewhere are prior verified preparation evidence, **not rerun for H03A**. The 24 mutating cases were not launched, even as a skipped suite.

H03A final Git/security audit: exactly 46 public changed/new files, 0 staged; only this migration review, S03 validation and HANDOFF_S03 changed during H03A. The other 43 public candidates remain byte-identical to the initial H03A manifest. Nine actual private secret values (including escaped/normalized forms) were checked in memory: 0 matches in public files; credential-pattern, protected Auth/Guard/Canvas/Demo/frozen-contract/historical-SQL and whitespace checks PASS. Ignored evidence: .local/sentinel/s03-h03a-final-review-*.json. No source/SQL/test edit, broad-suite rerun or publication occurred.

## H03B observed result — PASS, 15 November 2026

Owner source: **H03B: TEST Migration and PostgreSQL Acceptance**, attachment `23eaad65-6bbb-4dba-9432-c008f9aadb12`. This separately authorized exact-TEST 0003 up/up, the previously reviewed 24 cases/new fixture scope, private evidence and independent read-only preservation checks. No DEV connection, main worker, historical-job processing, runtime activation, publication or S04 permission. A NEW outside-repository/OneDrive private approval/env bound the existing H03A fixture/baseline/archive and exact operation allowlist; earlier consumed records were not reopened. The H03B record is now **COMPLETED_H03B_TEST_ACCEPTANCE**, original owner decision/actions retained, active actions empty. Never rerun using it.

### Immediate preflight and backup — PASS

Exact target **PostgreSQL 17.12 / 170012, 127.0.0.1:55432/wetscan_s01_test**, shared marker **wetscan-s01:9f3560a6-127f-42a6-abaf-9f45951e6bd5**. Identity connections for `wetscan_app`, `wetscan_sentinel_worker`, `wetscan_migrator` passed using existing password files; all remain restricted LOGIN/NOSUPERUSER/NOCREATEDB/NOCREATEROLE/NOBYPASSRLS, no memberships. Database owner/migrator unchanged. Docker context desktop-linux, existing container wetscan-sentinel-local-postgres-1 / ID 0220e86e719aa43c30dfd3ba371e290de0fe9141d8d1fe7f7fc6a58accb8961f, volume wetscan_sentinel_s01_dev_20261114, immutable image sha256:99d1a998c76487d3abb48b141505bda5dcf8089c0c4cd7be40f75de314fa32f0 and loopback mapping unchanged.

Ledger before writes was exactly 0001/0002 with H03A checksums/timestamps. No 0003 objects/index; fixture UUID `237b6b3d-da98-4b38-8b14-6b7c15811be6` and its approved workspace/projects unused. Active leases 0, other TEST sessions 0; historical expired lease preserved. Entire H03A row/catalog/role/grant/policy snapshot matched, not just counts: canonical baseline **15d09c6bf16415d8115b9034faf42cdf73d93eb0ebd29012fa3cd7cdb217601a**, extended baseline **29939a832862d8c4683e8c453a25e9e34955b987cbf72150ba5bb5f7763933c3**. Independent Python hashing and existing offline Node plan both reproduced **c3e39f6fd43ee6eb2fbf5b244778955aab4cabb8a11ed3c66d791cf99a252a94**. Historical migration SQL/provisioning matched HEAD byte-equivalently after newline normalization.

Existing H03A archive, resolved from the real private report, remained **66,522 bytes**, SHA-256 **a98a5c2ffced1d88e5012c2cd63658ee7e0aa7cc445871b5dea9b659a0003678**. Outside repository/OneDrive, no reparse point, protected directory with only operator/SYSTEM access. File hash/size/magic and matching pg_restore 17.12 --list reverified, exit 0; all 12 expected table-data entries present. No substitute, copy into checkout, upload or restore. Prior full offline decode evidence preserved; no restore rehearsal claimed. Archive covers pre-S03TEST, not DEV or current post-H03B fixtures.

### Actual reviewed runner — one execution, exit 0

Command: `node --env-file=.env.sentinel.s03.test.local --import tsx scripts/sentinel-detection-test.ts`.

Actual wall window **2026-11-15T10:44:07.0143277+07:00–10:44:12.3268115+07:00**. Vitest reported **3.72s**,1 passed file, **24PASS / 0FAIL / 0SKIPPED**. Runner code, assertions, configuration, SQL and expectations were unchanged. No retry/cleanup/reset or old S01/S02 runner. The reviewed manifest performs migration checks as01–02, schema/grant check03, and begins fixture writes at04; it was not preceded by a replacement migration runner that would invalidate its two-entry baseline.

| Migration check | Actual result |
| --- | --- |
| Case01 first up | PASS; existing gated/advisory-locked transaction applies only pending 0003; old rows/catalog/grants/ledger prefix preserved |
| Case02 second up | PASS; no duplicate migration, same three-entry ledger including exact applied_at; no replay of SQL |
| Case02 altered-checksum probe | Expected target_denied; transaction rollback, no edited ledger or persistent SQL change |
| Case03 schema/least-privilege check | PASS; eight new FORCE-RLS tables verified; prohibited runtime grants absent |

Current ledger after both runs and after all 24 cases:

| Migration | Pair checksum | applied_at (UTC) |
| --- | --- | --- |
| 0001_foundation | `dd061a60b123284882f154c438de3a171d60967b7b07a4e07200b6693f4eb778` | 2026-11-14 12:24:59.556942+00 |
| 0002_telemetry | `d1b67dc680f5bf3c2cbe585dca2427abf9d7ba9f29479c69b851f66b91c1f5a3` | 2026-11-14 20:03:28.380091+00 |
| 0003_detection | `4f0ee1cebdbdc81b835f719ef13c9cb703dfb5f440193765dfa0a61635fb6168` | 2026-11-15 03:44:09.392677+00 |

0003 up SHA 25c2820e7b50501c3358486bb6c4520a2d17fb5343635ee3a173424bcb01a83e; down SHA bfe2857310b8f7d1c6f1743cfc99c5bbfc28a110159c43510e73736671423234; final combined plan unchanged. No actual down executed: case19's SQL allowlist allowed only lock/read/rollback and verified refusal before any destructive statement.

### Actual 24-case manifest

| Case | Reviewed case | Result |
| --- | --- | --- |
| 01 | applies only additive0003 to the approved populated TEST | PASS |
| 02 | second up is idempotent and checksum-enforced | PASS |
| 03 | verifies eight FORCE-RLS tables, narrow grants and immutable versions | PASS |
| 04 | creates only opt-in drafts and rejects actor-rule enable | PASS |
| 05 | persists immutable rule history and rejects optimistic conflicts | PASS |
| 06 | processes actual stored events into real referenced alerts | PASS |
| 07 | duplicate delivery and crash-after-persistence do not duplicate alerts | PASS |
| 08 | concurrent claims/evaluations produce one threshold alert | PASS |
| 09 | active cancellation refuses stale effects | PASS |
| 10 | expired/reclaimed fencing rejects the old worker | PASS |
| 11 | injected post-alert driver failure rolls back actual PostgreSQL effects | PASS |
| 12 | fresh pools preserve alerts and acknowledged processing | PASS |
| 13 | wrong project and workspace cannot read real alert rows | PASS |
| 14 | actual other-project event cannot link to this project's alert | PASS |
| 15 | disabled rules yield no new alert and no-match jobs complete | PASS |
| 16 | legal hold and real evidence links prevent S02 retention deletion | PASS |
| 17 | Guard/unregistered job kinds cannot be claimed | PASS |
| 18 | scoped new-job cutoff preserves earlier fixture jobs | PASS |
| 19 | populated0003 reversal is refused before any destructive statement | PASS |
| 20 | all original S01/S02 rows, roles, policies and ledger prefix survive | PASS |
| 21 | explicit suppression retains real match evidence without an alert | PASS |
| 22 | database cooldown suppresses a second distinct event-time window | PASS |
| 23 | nonmatching normalized statuses complete without a fabricated alert | PASS |
| 24 | real alert cursor traversal uses stable filters and rejects foreign cursors | PASS |

These are **real PostgreSQL controlled fixture results**, with scoped executor/queue functions rather than the persistent daemon. Case12 proves fresh-pool persistence, not a real worker-process restart. Injected driver failure in11 is deliberate; actual PostgreSQL effects roll back and the reviewed new-fixture retry completes. Actor rule enable correctly refuses unavailable identity. Existing 599 unit/contract and 17 browser results plus typecheck/lint/build are historical preparation evidence, **not rerun for H03B**. No actual authenticated HTTP→worker→alert→UI E2E, signal/lifecycle test, production telemetry or provider integration occurred.

### Independent postflight and retained fixtures — PASS

Independent read-only audit at **2026-11-15T03:46:20.590Z** verified every pre-existing row fingerprint, old 0001/0002 ledger timestamps, roles, memberships, policies, owner/ACL/column-grant/effective-privilege inventory, indexes and constraints unchanged. The only addition on an old table is the reviewed sentinel.telemetry_detection_window index. New schema: 20 total tables, 39 indexes, 38 policies; eight new owner-correct ENABLE+FORCERLS tables and 14 validated composite FKs starting mode/workspace/project. App has only approved rule inserts/metadata-column updates and derived SELECT; worker has approved derived writes, no rule-version mutation or credential SELECT; neither runtime role gains schema CREATE/TRUNCATE. No default-ACL/role changes, other consumers or main-worker heartbeat.

All persistent new rows are confined to the approved workspace `github-user-7:s03-237b6b3d-da98-4b38-8b14-6b7c15811be6`, projects github-123/github-456; -other workspace remains a read-denial probe with no rows. Individual generated source/key/event/batch/job/rule identities are saved privately. No existing UUID was substituted or historical row targeted. All 14 new sources have controlled_test provenance. Actual fixture additions remain under reviewed caps (20 sources/credentials, 25 events/receipts/jobs/rules, 100 versions/rule and derived caps).

| Historical table group | H03A before | Approved additions retained | H03B total |
| --- | ---: | ---: | ---: |
| Bindings | 7 | 2 | 9 |
| Sources | 21 | 14 | 35 |
| Credential hashes | 22 | 14 | 36 |
| Events | 26 | 15 | 41 |
| Batch receipts | 20 | 13 | 33 |
| Jobs | 19 | 15 | 34 |
| Job attempts | 0 | 16 | 16 |
| Outbox / notification attempts / heartbeats | 0 each | 0 each | 0 each |

The 19 historical jobs remain 18 queued / 1 expired-leased, exact old lease fields retained. New jobs: 13 completed / 1 cancelled / 1 queued (secondary-project isolation witness);0 new leased/failed. New derived state retained: 14 rules, 26 versions, 26 audit rows, 33 alerts, 41 alert-evidence links, 130 evaluations, 33 cooldowns, 6 suppressed-evidence links. Credential plaintext lived only in the test process; hash-only fixture credential records remain as reviewed. Nothing was deleted/revoked/reset as post-test cleanup. No DEV/H02 access or modification.

Two independent audit-helper errors were preserved privately: initial object filtering omitted historical indexes; after correcting the filter, an inventory query wrongly assumed project-scope columns on module-wide worker_heartbeats (42703). Both READ ONLY transactions rolled back. Correct only the private audit comparison/query, then complete the independent read-only audit successfully. These were not acceptance failures or application/schema fixes; no test expectation or mutating suite rerun. Original failed helper versions/diagnostics retained.

Private evidence outside repository/OneDrive: locate through ignored `.local/sentinel/s03-h03b-private-directory.txt`; contains closed test-approval.json, backup-verification.json, before.json, acceptance.log, execution.json, case-results.json, after.json, fixture-identities.json and preserved comparator failures. Passwords/raw payloads/hash maps are not public report content. Ignored `.env.sentinel.s03.test.local` has paths/config only; do not reopen the consumed record. The 46-file manifest remains preserved,0 staged, HEAD cd313ce29aeac865e15cea9abd9c412cb9c2c3cc. Only the three requested docs changed during H03B; source/SQL/tests unchanged.

**H03B complete; overall S03 remains IMPLEMENTED_PENDING_ACCEPTANCE.** Separate exact-target DEV up/up and bounded actual authenticated HTTP/worker/alert/UI approval are still required. The original TEST runner now intentionally refuses its populated/applied target and reused fixture scope; no repeat, cleanup, down, fresh mutation fixture or source fix without renewed review. Do not declare S03 complete from PostgreSQL fixtures alone. No commit/push/PR/merge/deploy/S04.

H03B final safety audit: all 46 public changed/new files remain preserved and unstaged; only the three requested S03 reports changed during this phase, with the other 43 candidates byte-identical to the initial H03B manifest. Nine real private secret values and normalized/escaped forms had 0 public matches; protected ownership/Demo, credential patterns, whitespace and private-artifact tracing checks PASS. All 15 H03B private evidence files retain operator/SYSTEM-only ACLs. Final process/listener check: 0 main-worker/emitter/acceptance processes and 0 application/worker/helper listeners. Evidence: ignored .local/sentinel/s03-h03b-final-review-*.json. No publication occurred.

## H03C-1 observed result — PASS, 15 November 2026

Owner source: **DEV Database Preflight, Private Backup and Controlled Migration**, attachment `5673c6d7-4d39-413f-ab8a-635d54d82744`. Authorized only exact DEV read-only preflight/backup, reviewed 0003 up/up and read-only postflight/documentation. A NEW private approval bound exact DEV/plan, actions **migrate_up only**, plus the bounded read-only/backup operations; no runtime, integration_test or migrate_down permission. It is now **COMPLETED_H03C1_DEV_MIGRATION**, original decision/actions retained, active actions empty. No consumed H02/H03 approval was reopened. No TEST connection, fixture execution, main worker, emitter, queue processing, cleanup or publication occurred.

### Exact DEV identity and baseline — PASS

Verified **PostgreSQL 17.12 / 170012, 127.0.0.1:55432 / wetscan_dev**, shared-object marker **wetscan-s01:26b6b537-c016-4dc7-8007-4e839e8b838f**. Current observer/migrator and database owner wetscan_migrator; app/worker identity checks used their existing dedicated roles in READ ONLY transactions. All 3 principals remain LOGIN/NOSUPERUSER/NOCREATEDB/NOCREATEROLE/NOBYPASSRLS, existing memberships/grants unchanged. RLS active on old runtime tables; no role/grant/credential escalation.

Docker desktop-linux; unchanged container **wetscan-sentinel-local-postgres-1**, ID `0220e86e719aa43c30dfd3ba371e290de0fe9141d8d1fe7f7fc6a58accb8961f`; unchanged volume **wetscan_sentinel_s01_dev_20261114** at /var/lib/postgresql/data; only host 127.0.0.1:55432→5432 mapping; approved PG 17.12 Bookworm image digest **sha256:99d1a998c76487d3abb48b141505bda5dcf8089c0c4cd7be40f75de314fa32f0**. No Docker lifecycle/configuration operation. PostgreSQL max_connections 40; existing container budgets retained. Other DEV sessions 0; no interfering consumer/migration.

Before backup and immediately before up, complete historical H02 audit matched **ac02318931e86e10807362ba20f65e7819da663a5cdf7c53c7073f82737b6f38** exactly, including all row fingerprints, OIDs/columns/constraints/indexes/policies/ACLs/grants/memberships/roles, ledger times, source/credential states and historical heartbeats. Not merely aggregate counts. Initial ledger exactly 0001+0002; no 0003 table/index/ledger entry. Original S01 module seed 1 and three historical heartbeats retained, including the stale running label (not an active worker).

Protected H02 evidence: live / github-user-187839747:test / github-998736528, owner-approved historical wilanta/portfolio. One controlled_test source **3b67f63a-f67e-4fa4-96b9-2fecd9a6feba** remains disabled; 2 credential hashes retain exact revocation times; 8 events / 6 receipts / 8 queued accepted-job rows unchanged. Actual job IDs/full lease/revision/attempt/fence/timestamp metadata captured privately. No actor/source identity invented or old approval reused.

### New DEV backup — VERIFIED ARCHIVE, NOT RESTORE-TESTED

Separate full custom-format DEV archive, UTC **2026-11-15T04:01:49.368Z–04:01:50.199Z** (11:01WIB), **59,222 bytes**. SHA-256, independently equal under Node and PowerShell Get-FileHash:

`ecfc51029a680a8d7b96b78f4f43c68fa09c9bb783b2a1431bebc28a241952e9`

Stored outside repository/OneDrive in a new non-reparse private directory, inheritance disabled, only operator/SYSTEM ACLs. Existing approved container's pg_dump 17.12 used explicit DEV/migrator/TCP5432 behind the verified host55432 mapping; unchanged password-file credential entered child stdin only, never arguments/output. Direct binary stdout to exclusive new private host file. default_transaction_read_only=on, RLS ON (`--enable-row-security --inserts`), no filter/exclusion/--clean/--create/privilege bypass. Existing unconditional migrator SELECT policies on all 11 protected tables and SELECT privileges were verified before dumping.

Dump exit 0, stderr 0 bytes; PGDMP header/nonempty file verified. Matching pg_restore 17.12 --list exit 0: all 12 table definitions/data entries, expected schemas, 22 policies, 11 row-security and 17 ACL entries. Full offline decode exit 0; all 12 INSERT row counts independently match the pre-migration baseline. No restore/database connection was made by archive inspection. Coverage is complete for current DEV database objects/data under existing RLS read coverage, including historical credential hashes privately. No archive/raw rows/hash maps/TOC uploaded or included in public source.

Limitations: no restore rehearsal, hence no claim of proven restoration. Database-level dumps do not create global roles/passwords/tablespaces; ownership/ACL replay needs the existing role names. Extension definitions refer to installed server extensions, not binaries. Without --create, database provisioning/marker/database ACL/settings require separately reviewed provisioning. Archive is pre-0003 DEV, not the populated TEST backup and not a post-migration archive.

### Actual migration commands and ledger — PASS

Independent Python SHA-256 and existing Node plan command reproduce combined plan **c3e39f6fd43ee6eb2fbf5b244778955aab4cabb8a11ed3c66d791cf99a252a94**. Historical 0001/0002 SQL and role provisioning match HEAD unchanged; no S03 SQL/runner/test edits. 0003 up SHA 25c2820e7b50501c3358486bb6c4520a2d17fb5343635ee3a173424bcb01a83e; down SHA bfe2857310b8f7d1c6f1743cfc99c5bbfc28a110159c43510e73736671423234.

Actual command, executed exactly twice with independent first postflight before second:

```text
node --env-file=.env.sentinel.s03.dev.local --import tsx scripts/sentinel-db.ts up --approve-plan=c3e39f6fd43ee6eb2fbf5b244778955aab4cabb8a11ed3c66d791cf99a252a94
```

First up **exit 0**: existing advisory-locked gated runner applies only pending 0003 and one ledger row. Independent fresh-pool READ ONLY audit passed before second up. Second identical command **exit 0**: no new migration/duplicate objects/replayed SQL; complete snapshot byte-equivalent under canonical hashing to first result, including 0003 applied_at. No down/reset/repair/retry/fixtures.

| Version | Pair checksum | DEV applied_at (UTC) |
| --- | --- | --- |
| 0001_foundation | `dd061a60b123284882f154c438de3a171d60967b7b07a4e07200b6693f4eb778` | 2026-11-14 12:36:51.243758+00 |
| 0002_telemetry | `d1b67dc680f5bf3c2cbe585dca2427abf9d7ba9f29479c69b851f66b91c1f5a3` | 2026-11-14 22:17:24.288225+00 |
| 0003_detection | `4f0ee1cebdbdc81b835f719ef13c9cb703dfb5f440193765dfa0a61635fb6168` | 2026-11-15 04:02:14.211905+00 |

First/second complete audit digest **4b288c9def842b52c577f44f640a2848993cd3e660d417139c722d3a013f4f8b**. Original 0001/0002 checksums/application times and every historical row remain exact. Approved differences ONLY: new 0003 ledger entry, eight empty S03 tables and their reviewed constraints/indexes/RLS/grants, plus telemetry_detection_window on old events. Tables 12→20; indexes 21→39; policies 22→38. New 14 validated composite FKs all begin mode/workspace/project; eight owner-correct ENABLE+FORCERLS tables. Runtime app derived writes/rule-version UPDATE/DELETE and worker rule mutations/credential SELECT stay forbidden by exact effective/column privilege inspection. Only app rule metadata columns current_version/updated_at have UPDATE. No runtime schema CREATE/TRUNCATE. Actual active RLS observed on all 8 new tables under all 3 principals: 24 read-only checks. No mutating RLS denial fixtures were run on DEV.

### Full historical preservation — PASS

| DEV data | Before | After first | After second |
| --- | ---: | ---: | ---: |
| Migration ledger | 2 | 3 | 3 |
| Module limits / old heartbeats | 1 / 3 | 1 / 3 | 1 / 3 |
| Project binding / source | 1 / 1 | 1 / 1 | 1 / 1 |
| Revoked credential hashes | 2 | 2 | 2 |
| Telemetry events / receipts | 8 / 6 | 8 / 6 | 8 / 6 |
| Queued historical jobs | 8 | 8 | 8 |
| Attempts / outbox / notification attempts | 0 each | 0 each | 0 each |
| Each of eight new detection tables | absent | 0 | 0 |

Independent original-row/structure comparisons were performed in new read-only sessions after both commands, not inferred from successful DDL. Old table definitions/OIDs/indexes/constraints/policies/privileges remain unchanged, excluding the explicitly approved new event index. No historical lease field, state, timestamp, source setting, revoked hash or heartbeat changed. Backup interval snapshot also matched baseline exactly.

### H03C-2 static readiness and required controls

No worker startup/claim/queue function/emitter/API write took place. Static code review: worker/main uses only dedicated worker credential, exact target/ledger checks and detectionActivation. A new runtime approval must bind mode/live workspace/project, processNewTelemetry=true and notBefore>=its actual approvedAt; flag alone fails. Runtime enumerates only the approved detection scope, uses module sentinel/kind sentinel.telemetry.accepted, passes notBefore into PostgresQueue; both claim and expired-job/attempt/outbox housekeeping filter creation cutoff and scope. Guard module is rejected. Read-only observation: 8 old queued jobs, latest old creation before observation, 0 jobs created at/after observation, 0 other sessions. Thus a fresh future cutoff strictly later than every historical created_at excludes all 8 old jobs. Source selection alone is insufficient, and no source/job-ID allowlist currently exists. Future activation must verify no unrelated eligible jobs/producers and inspect exact processed IDs afterward.

**Maintenance caveat:** runtime.ts also calls module-wide retainWorkerHeartbeats and scoped retainInfrastructure/retainDetection/retainTelemetry before claim. Claim cutoff does not cover those calls. retainInfrastructure can update the existing binding's last_cleanup_at even when deleting 0 rows; receipt cleanup can later expire historical receipts. Current old binding last_cleanup_at is NULL, so default startup could alter it. No queued old job is terminal-retention eligible, but full historical evidence preservation requires more than a claim cutoff. Do not activate default worker and silently accept this change.

Smallest proposed strict-preservation change for separately approved H03C-2: an explicit, expiring private runtime-approval extension (for example s03RuntimeAcceptance.skipMaintenance=true) bound to exact DEV/plan/detection scope/cutoff; skip the global heartbeat-retention call and all three scoped retention calls during that bounded acceptance run. Keep normal worker defaults, per-lease fences/retries, new worker heartbeat writes/stopped state, health and dedicated role unchanged; expose paused retention honestly in health. An environment flag alone must not bypass approval. Gate expiry/deadline and add meaningful offline regressions for unchanged defaults, missing approval, skipped maintenance, exact scope/cutoff/Guard denial. No such source change was made or approved under H03C-1.

Alternative requires an explicit owner-reviewed allowance for exact metadata/retention effects or a separately approved isolated environment; never change holds/binding timestamps/job states to manufacture safety. Before actual runtime, fresh Auth/Canvas must still authorize wilanta/portfolio/github-998736528/github-user-187839747:test; mismatch requires a new exact identity decision, not spoofing or renaming. New controlled_test source/key only; old disabled source and revoked keys remain untouched. Propose max 2 rules, 12 unique controlled events/jobs, 2 active jobs, 2 worker starts within 10 minutes, loopback web 3000 / health 3112 and optional temporary capture 3113, 256 MiB V8 old-space limit (not RSS). Record final source/eligible-job identities/cutoff, no concurrent producers; stop on unexpected eligible work. Future approved restart/health/UI observations must preserve all8historical job IDs, old event/receipt/source/credential/binding fingerprints,3 old heartbeat rows, 0 old attempts. New acceptance heartbeats are expected, historical deletion is not.

### Evidence, validation and stop state

No failures occurred in H03C-1 commands/audits/backup verification. Independent plan, exact historical baseline, archive TOC/full offline decode, both gated CLI up operations, first/second read-only audits and 24 active-RLS checks PASS. Existing 599 unit/contracts, 17 browser cases/typecheck/lint/build and H03B 24/24 are **previously verified, not rerun**. H03B evidence was read only from private files; no TEST connection or TEST suite ran. No actual HTTP→worker→alert→UI acceptance, new daemon/lifecycle test or production operational claim.

Private evidence outside checkout/OneDrive: resolve ignored .local/sentinel/s03-h03c1-private-directory.txt; contains closed dev-approval.json, before/premigration/first/second.json, DEVdump/archive.toc.txt, backup-report/independent verification, first/second-up logs/execution records and runtime-readiness.json (including protected job identities). All use restrictive local storage; no passwords/raw rows/hash maps/backup content in public docs. Ignored .env.sentinel.s03.dev.local contains target and file paths only. Branch feat/sentinel-s03-detection-alerts, HEAD cd313ce29aeac865e15cea9abd9c412cb9c2c3cc, 46 uncommitted / 0 staged; only the three required reports changed this phase. Source/SQL/tests remain byte-identical to the H03B audit. No other worktree/Guard/Auth/Canvas/Demo work altered, no commit/push/PR/merge/deploy/S04. **H03C-1 complete; stop for H03C-2 review/authorization.**

H03C-1 final safety audit: 46 public changed/new files preserved, 0 staged; only these three requested reports changed during this phase, and all 43 other candidates remain byte-identical to the initial H03C-1 manifest. Nine actual private secret values/normalized forms had 0 public matches; credential-pattern, protected Auth/Guard/Canvas/Demo/frozen-contract/SQL, whitespace and private-artifact build-trace checks PASS. All 17 new private evidence files have operator/SYSTEM-only ACLs; DEV approval closed with no active actions. Final main-worker/emitter/acceptance processes0 and app/worker/helper listeners0. Container remains healthy at unchanged1GiB/2CPU/128PID budgets. Evidence: ignored .local/sentinel/s03-h03c1-final-review-*.json. No TEST connection, new fixture, runtime activation or publication occurred.

## H03C-2 runtime review addendum — no migration executed

On 15 November 2026, independent offline Node/Python hashing reproduced the same approved combined plan c3e39f6fd43ee6eb2fbf5b244778955aab4cabb8a11ed3c66d791cf99a252a94. All SQL/role provisioning remained unchanged. Actual read-only DEV preflight and independent post-runtime audits verified all three ledger entries/checksums/timestamps, 20 tables, 39 indexes, 38 policies, roles/grants and constraints unchanged. Existing 59,222-byte DEV backup and its reviewed SHA matched, offline archive listing passed; no restore, TEST connection or migration occurred.

The narrowly authorized runtime implementation changed only opt-in queue/maintenance admission and Sentinel identical-identity binding enrollment behavior. Exact new IDs plus DB-clock expiry fence queue claim/mutation paths; normal mode retains maintenance, no RLS/grants are weakened. H03C-2 processed six NEW admitted jobs and persisted two controlled_test alerts while preserving all 33 historical rows. All temporary runtime approvals are now closed. The 24/24 H03B TEST result remains prior evidence, not freshly rerun. Source modifications do not change any migration checksum. Full current evidence and private helper failures are in the validation report/handoff. Future database operations still need a fresh explicit target/plan/scope approval.

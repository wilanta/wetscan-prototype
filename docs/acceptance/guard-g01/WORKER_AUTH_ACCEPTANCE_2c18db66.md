# Connected Worker/Auth Acceptance G01 ? verified prepare_only

**Decision: PASS for the connected positive Worker/Auth prepare_only acceptance. Overall G01 remains PARTIALLY COMPLETE.** No scanner or Docker ran, and G02?G06 have not started. This report supersedes historical pending/recovery checkpoints, which remain in their evidence artifacts.

## Approved target and operation budget

- Candidate cwd/writable root: C:/laragon/www/wetscan-2/wetscan-guard-g01-s03-candidate.
- Branch feat/guard-g01-s03-integration; HEAD 1b28fb88ae65a29902e0f1f314efdce44ed3c643.
- Staged index SHA256 remains 40d77c02186b074dacfd2fe3a6f2816d89a7e59d5f279cbe8be8c75c9c716c4f. No commit/push/reset/stash/merge/deploy or master change.
- Request SHA256: 7f014b026d5e83634f4a2f07b17ffc9a27aabfe5a50f6c7dd029c7d977a2145a.
- Job: 2c18db662dcf8fec6052e05d02ed1362802facd839fca81a71a888c37b09ee18; idempotencyKey fd1ddd5a-1b8a-4b02-9be7-6bf4eee71eda.
- Actor github-user-145520313; workspace github-user-145520313:testing; project github-839286157.
- Repository inkAja/wdu / repository839286157 / main / commit41861b14dbb3f329fe3b20aed59a008390ef0e2b; quick / sast metadata.
- DB localhost:5432/wetscan_s01_test_guardg01; marker wetscan-s01:aa8b15a6-7ed3-4f19-81f0-07d9759ec62f.
- Approval first observed 15 November 2026 23:00:19 WIB; conservative expiry23:54:19 WIB (54 minutes, below the authorized maximum 55). No extension or rebind.
- Approved and used: TWO identical enqueue calls, ONE durable scan/queue job, ONE prepare_only worker launch/attempt. The runtime operation budget is consumed; no more enqueue/replay/launch is authorized under this approval, even before expiry. Do not rerun the retained owner snippets.

Four non-secret purpose permits were activated only after explicit owner approval. Old bytes were archived first; their hashes and 19 other preexisting files/marker metadata were verified unchanged after the run. The private source-only permit and legacy/per-attempt used/result records remain untouched. A restricted-sandbox directory access failed before any activation write; reviewed normal execution performed the activation once. Credentials were consumed only internally through the existing purpose loader, never read/displayed by the agent. No .env or Auth session-store inspection/change.

## Actual operation evidence

| Gate | Actual result | Evidence |
|---|---|---|
|Fresh Auth/readiness|Owner existing browser/session returned HTTP200, database approved/schema verified; final launch endpoint rechecked Auth before returning preparation verified|[Launch response](worker-auth-launch-response.job-2c18db66.json)|
|First enqueue|HTTP200, exact scanId, queued; independently one scan revision1 and one queue row|[First response](worker-auth-first-enqueue-response.job-2c18db66.json)|
|Identical replay|HTTP200, same exact scanId; scan/queue/queued audit unchanged; still one durable job|[Second response](worker-auth-second-enqueue-response.job-2c18db66.json)|
|Worker claim/fencing|One actual attempt, fence1; seven leased samples and seven distinct lease expiries, at least six observed renewal advances|[Live observations](worker-auth-live-observation.job-2c18db66.json)|
|Heartbeat/lifecycle|Actual worker running heartbeat advanced during work, then stopped; final lease owner/until null and attempt completed|[Final observer](worker-auth-observer-final.job-2c18db66.json)|
|Preparation/audit|Persisted queued?preparing?failed plus foundation_prepared audit, all matching actor/subject; final scan revision3|[Final observer](worker-auth-observer-final.job-2c18db66.json)|
|Coverage|Partial:82 retrieved/90 eligible,175159 bytes, treeTruncatedfalse; exclusions sensitive_path1/file_size4/binary4; HTTP result matches stored coverage|[Machine result](worker-auth-acceptance-result.job-2c18db66.json)|
|Cleanup|Successful enforced snapshot disposal before foundation_prepared, parent broker/IPC/pool cleanup before completion; actual authenticated preparation verified response, completed attempt, released lease and stopped heartbeat|[Result and cleanup basis](worker-auth-acceptance-result.job-2c18db66.json)|
|Post-run isolated preservation|SQL18 owner actual pgAdmin result: preservedtrue, before/after45e7...1095d identical, differentSections[],3 retained scans/0 active leases; ROLLBACK confirmed|[Post-run SQL18](worker-auth-sql18-postrun.job-2c18db66.json)|
|Retention/target|Old permit hashes and 19 preexisting other-file metadata unchanged; actual full DB marker independently confirmed read-only with non-super/non-bypass app role|[Retention](worker-auth-retention-check.job-2c18db66.json), [target](worker-auth-postrun-target-check.job-2c18db66.json)|

All times below are15November 2026 WIB (UTC+7). The first queued audit is23:12:37.120. First/replay independent observer checkpoints are23:14:19.379 and23:16:47.578. Owner launch request started23:19:19.596. Attempt ran23:19:21.342?23:20:03.347: **42.005 seconds**. Preparing?foundation_prepared interval was41.517 seconds. Heartbeat stopped23:20:03.352; independent final observer23:21:18.933.

Observed lease expiries progressed from23:19:51.338 through23:20:26.487 with the same exact job/worker/fence1. The lease was cleared on successful queue completion. This is actual live evidence that work lasting beyond the old 20s handler budget completed with renewed fencing; no simulated time or overlay is used for this run.

The scan's final status failed is intentional: the prepare_only handler records that G02 execution is not configured after successful source preparation/disposal. Queue completed and foundation_prepared do not mean a successful vulnerability scan. scannerExecution and sandboxExecution remain NOT_RUN.

## Evidence limits

HTTP responses are owner-supplied actual safe Console JSON, correlated with independent read-only database observations; the agent did not access browser cookies/tokens or control the browser. The source snapshot root stays a private runtime capability. Cleanup is verified through the installed hashed enforcement path and actual completion/audit evidence; the observer did not independently enumerate the private root or unrelated temp directories.

Owner's SQL18 chat copy shortened marker to wetscan-s01 and contained Markdown-corrupted XML for the scan count. The normalized report explicitly retains those limitations; it is not labeled a raw valid JSON export. A separate actual read-only app-role metadata query verified the full exact marker, owner, role and port. Hashes, empty differences and the visible scan count3 are retained with owner provenance. The compared initial/final projection is the isolated G01 fixture/catalog, not an unobserved external Sentinel database.

Post-run preservation hash before and after: **45e7cfe26767e26ad96ceda0dd2a53649a10ea7a5453844ac50ee30867e1095d**. Original observer artifact SHA 184ee7bff8e22b308ffac213ce28ff554d7b87a1d6b47f0cb6d7145caa8fea80; Guard migration checksum 8bdea256cdd5ab79b1525f43bd40508acf25e57502a72162ae6b5233dd55693b; Guard/Sentinel budgets 1/2, policies 7, grants 24, FORCE RLS true. No migrations, resets, fixture deletion or Sentinel writes were performed.

## G01 gates still open

1. Compose and verify the actual job/snapshot with the enforcing sandbox adapter, exact pinned image/command/spec/provenance and required operator evidence. Earlier6/6 real synthetic Docker control probes establish controls only; they do not prove worker-to-sandbox integration. Docker/scanner execution was excluded from this approval.
2. Complete remaining live security-negative cases: revocation/access changes, cancellation/expiry/timeout and failure cleanup not demonstrated by this positive run. Existing unit/fixture evidence is retained and must not be relabeled live.
3. Prove actual DB-backed worker crash, lease expiry, restart/recovery, fencing and orphan cleanup. Existing synthetic process tests/fresh-pool retrieval are not this proof. Future phases/jobs require separate exact approvals; preserve this terminal job.

Additional limits: external Sentinel preservation is unobserved; full schema-down/lifecycle/recovery beyond tested transaction rollback is not demonstrated. Any additional target or destructive schema/cleanup test needs its own approval. Scanner execution belongs to later authorized stages and remains unconfigured; it is not inferred from this positive preparation run.

## Validation and handoff

Installed timeout v3 retained: source 45s, RPC 55s, handler 60s, request 90s; Auth grant 60s, lease 30s/heartbeat 5s unchanged. All 41 approved implementation hashes remain identical. Latest implementation checks before live execution: typecheck/lint/build PASS; 798/798 units; Guard 7/Auth 21/Canvas 17 E2E PASS. Earlier restricted unit failures and Canvas teardown interruption are preserved alongside the successful reviewed normal runs; no failed evidence is hidden and no tests/assertions were weakened. No application implementation changed during acceptance; only evidence/operator snippets were added.

[Will handoff for G02?G06](../../agent-handoffs/HANDOFF_WILL_G02_G06.md) carries this verified foundation and the explicit open gates. It authorizes no stage execution, publication, scanner/container run, new job, approval extension or destructive cleanup. Overall G01 is not COMPLETE.

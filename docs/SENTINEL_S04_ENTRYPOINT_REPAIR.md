# S04 direct-entrypoint enforcement repair and separate recovery gates

Prepared offline on 17 November 2026. The archive-only milestone remains
`ACCEPTED_OFFLINE_WITH_DOCUMENTED_RESIDUAL_RISKS`; overall S04 remains
`IMPLEMENTED_PENDING_ACCEPTANCE`. This document grants no live authority.

## Confirmed defect and repair

Previously, `runProvisionOperation` accepted an optional package callback. Only
the package adapter supplied it. The owner CLI and the older acceptance alias
could omit it while retaining the older database approval gates.

`scripts/sentinel-provision-enforcement.ts` is now the single mandatory live
boundary called inside the shared owner function. Callers cannot supply or omit
the enforcement implementation. Before output handling or pool construction,
every supported live operation must pass the fixed filesystem-only checker in
`check` mode. It requires all seven package-context fields and explicitly binds
CLI CookieFile, output and localhost origin to that context. Missing, duplicate,
unknown or mismatched arguments and unknown package switches fail closed.
The checker script, repository, mode and timeout are fixed in source. No CLI or
environment option selects a different checker or disables checks.

The child must exit successfully and produce the complete expected current
receipt: matching manifest, validated separate owner grant, exact archive-only
disposition, historical preservation, unchanged candidate semantics, sufficient
remaining lifetime, and zero checker provider/database/auth operations. Context
and CLI arguments are reread after the child returns to detect intervening drift.
No child error body, cookie, secret or authentication record is printed.

| Executable path                                    | Enforcement                                                                           |
| -------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `sentinel-provision-owner.ts` live modes           | Mandatory shared boundary before pool construction                                    |
| `sentinel-provision-package-owner.ts`              | Adapter to that same owner; no injected callback                                      |
| `sentinel-dev-acceptance.ts provision-and-ingest`  | Existing alias to the same guarded owner                                              |
| `Invoke-S04ProvisionPackage.ps1 -ExecuteLive`      | Full initial preflight/begin plus guarded owner and checks around CookieContainer GET |
| `Invoke-H04CB2ProvisionAndIngest.ps1 -ExecuteLive` | Retired; STOP before input reads, approvals, output or process creation               |

The filesystem-only `offline`, `approvals-check`, and no-argument PowerShell
diagnostics remain available; none grants live authority. Unknown owner modes
stop. Live checks repeat before and after management/ingest HTTP responses and
on each audit/recovery invocation. HTTP bodies are consumed before the response
boundary; an unverified response is not acknowledged as a known resource.

Existing archive, preservation, budget, approval and authentication algorithms
are reused. No production auth-store behavior is changed. Pure dependency-driven
synthetic harness functions do not open real pools or make requests themselves;
they are not additional executable owner entrypoints. This is application-level
enforcement for the supported source paths, not an OS sandbox against an owner
who edits code, installs a hostile loader or executes arbitrary database tools.

## Preserved evidence and remaining limits

Historical manifests, failed receipts, approvals, recovery baselines, eight auth
backups, original cookies and encrypted authentication data are never rewritten.
Before-state evidence for changed source is stored separately. Old hashes remain
valid descriptions of old artifacts; they cannot authorize this repaired source.

No new live-ready manifest is produced here. The previous candidate is expired.
Normal success still permits 10 new persisted rows, at most 12 with bounded
compensating containment, and zero historical-row mutations. The 11/13 INSERT
figures remain reviewed source-path counts, not database-enforced statement
quotas. Containment remains restricted to positively acknowledged new IDs and
unchanged expected revisions while all guards and the deadline remain valid.
Ambiguous writes or guard failures may prevent containment; preserve evidence,
close approvals, stop owned processes and report NOT_VERIFIED without retry.

## Authentication recovery: preparation only

Separate owner permission is required for one bounded owner-controlled OAuth
window. Do not refresh this expired candidate or overwrite its cookie, metadata,
session, receipts or accepted descriptor. The previous one-record exception is
not permission for another missing historical record.

Before a new window, prepare and review a hash-guarded, default-off procedure:

1. Inventory and back up all current authentication/cache files, cookies,
   metadata, exact absent-session path and old evidence into a fresh private,
   owner/SYSTEM-protected, create-only directory. Preserve eight original backups.
2. Confirm WetScan tabs are closed without signing out and no auth writer runs.
   Start only the authentication application without PostgreSQL credentials or
   runtime approvals, under an independently enforced maximum 15-minute window.
   This startup is not authorized by the present offline repair.
3. The owner manually signs in once through a clean private browser window at
   `http://localhost:3000/login`. Capture the new cookie into a fresh protected
   candidate file; preserve every old candidate. No automatic OAuth retries.
4. Stop the owned application, then validate offline: new unique session identity,
   owner 187839747, workspace `test`, project/repository `github-998736528`,
   localhost origin/callback, no pending flow, valid encryption and at least
   40 access-token minutes for provisioning entry. Require at least 30 minutes
   at every subsequent provisioning boundary. Provider access remains unverified.
5. Require the archived historical session to remain absent and all other
   historical auth records to retain exact hashes. Account explicitly for the
   new session and legitimate owner-profile update. An additional missing or
   modified historical session is STOP, not another exception.
6. Review a new descriptor/design and fixed package candidate binding for that
   exact new candidate and complete expected inventory. Preserve the accepted
   descriptor unchanged. This is separately reviewed additive rebinding, not
   silent replacement of the accepted historical contract.
7. During later provisioning only that selected candidate may be re-encrypted
   with complete plaintext equality. AES-GCM IV/ciphertext and filesystem metadata
   can change; token, expiry, identity, profile, cache and other semantic changes
   cannot be waived. Transient atomic-store temporary files must be gone at checks.

STOP on backup failure, unexpected state, callback failure, insufficient lifetime,
wrong identity/repository/origin, reappearing archive, extra deletion, deadline,
or cleanup uncertainty. Never restore the archived session to obtain PASS.

The refresh-persistence defect remains unresolved: the application can rotate
credentials in memory before later GitHub checks fail, without saving the rotated
credentials. A new login does not repair it. Long-lived credentials and the
bounded no-refresh policy reduce exposure; they do not prove a permanent fix.
A repair to production refresh behavior requires separate defect review,
authorization and tests. This task changes no production authentication logic.

All four previously accepted residual risks remain documented: the historical
deletion cause is unknown; current GitHub access is unverified; no permanent
session-revocation ledger exists; and refresh persistence remains unresolved.
Filesystem absence checks are boundary observations, not permanent revocation.
Keep auth writers quiescent and never restore the archived record. These scoped
risks do not authorize an expired token or waive any new preservation failure.

## Infrastructure recovery: preparation only

The last read-only observation found `desktop-linux` configured with endpoint
`npipe:////./pipe/dockerDesktopLinuxEngine`, an inaccessible daemon pipe and no
55432 listener. That observation does not establish data loss or container state.

Use bounded read-only host diagnostics before asking to change infrastructure:

```powershell
Get-Process -Name 'Docker Desktop','com.docker.backend' -ErrorAction SilentlyContinue
Get-Service -Name com.docker.service -ErrorAction SilentlyContinue
docker context show
docker context inspect desktop-linux --format '{{.Endpoints.docker.Host}}'
wsl --list --verbose
Get-NetTCPConnection -LocalPort 3000,55432 -State Listen -ErrorAction SilentlyContinue
```

Do not print Docker container environment variables or secret-bearing process
command lines. If the daemon is unavailable, do not switch engines or infer that
containers or volumes are absent. Verify the existing Desktop installation and
review its previous guarded startup procedure before proposing exactly one
launch. Owner approval must acknowledge possible automatic restart of unrelated
containers, including Apotek. Do not stop those containers under engine approval.

After separately authorized engine recovery, read the complete existing inventory
and compare historical IDs/restart policies. The expected DEV container is:

- Name: `wetscan-sentinel-local-postgres-1`
- ID: `0220e86e719aa43c30dfd3ba371e290de0fe9141d8d1fe7f7fc6a58accb8961f`
- PostgreSQL: 17.12; image `docker.io/library/postgres:17.12-bookworm@sha256:99d1a998c76487d3abb48b141505bda5dcf8089c0c4cd7be40f75de314fa32f0`.
- Named volume: `wetscan_sentinel_s01_dev_20261114`, mounted at `/var/lib/postgresql/data`.
- Existing volume provenance: local driver, created `2026-11-14T11:55:03Z`.
- Existing bootstrap password bind remains read-only at `/run/secrets/bootstrap_password`.
- Binding: `127.0.0.1:55432 -> 5432/tcp`; restart policy `no`.

Inspect only selected non-secret Docker fields. Require the exact existing ID,
image digest, named volume existence/mount, binding, restart policy, exited state,
free port and no WetScan app/worker conflict. On any mismatch STOP. Only after
separate targeted startup permission may the owner execute once:

```powershell
docker start 0220e86e719aa43c30dfd3ba371e290de0fe9141d8d1fe7f7fc6a58accb8961f
```

The command above is not a standalone guarded procedure or present authorization.
Revalidate every prerequisite immediately before it. Never compose-up, recreate,
initialize, reset, delete volumes, restore snapshots or retry automatically.
Then verify the same ID, health status, port, volume and unchanged other-container
inventory. Container health alone proves no application-row preservation.

A separately authorized independent read-only DEV audit must subsequently verify
`127.0.0.1:55432/wetscan_dev`, marker
`wetscan-s01:26b6b537-c016-4dc7-8007-4e839e8b838f`, the approved role, migration
checksums, schema/index state, 91 original rows, 16 prior jobs, eight heartbeats,
Incident #1/evidence/timeline, all contained sources/credentials and three disabled
rules (the contained rule remains DISABLED revision 3), with no leases, orphan
evidence or unexplained deltas. Use exact row hashes and the existing reviewed
semantic containment delta. Apply no migrations. The audit's old manifest must
also be reconciled with authorized source changes before any execution.

## Draft manifest reconciliation, not live readiness

Preserve the 1,918-entry package manifest, original parent manifests, completion
receipt and all prior pins. Do not rewrite hashes in historical receipts.
After separately authorized recoveries, prepare a new phase-specific manifest:

1. Explicitly reconcile each changed source/test/runner pin, including the new
   mandatory enforcement module, retired live runner, adapter, shared owner and
   new regression cases. Retain original validators, SQL, migration and historical
   private pins; retain separate before-source copies for authorized replacements.
2. Bind new candidate cookie/metadata/session, reviewed additive descriptor/design,
   legitimate OAuth profile changes, complete auth/cache inventory, existing
   archive/provenance and exact required-absent old session. Old candidates and
   old descriptors remain historical evidence, never runtime selection fallbacks.
3. Reverify all four dotenv presence/hash bindings, fixed private credential-file
   protections, build inputs and configuration. No token, secret or encrypted
   record appears in sanitized output. A build/source mismatch requires its own
   reviewed resolution, never a silent build or source substitution.
4. Bind new recovery receipts, infrastructure identity and fresh read-only audit
   results. Preserve previous database baselines and containment evidence.
5. Hash a newly reviewed owner procedure and inert grant template with the actual
   repaired runner hash. Keep the manifest/procedure relationship acyclic; final
   outputs and completion receipts cannot be self-referential manifest inputs.
6. Review parent-pin reconciliation explicitly. The old fixed policy permits only
   two replacement paths; additional repaired sources and new auth bindings need
   a separately reviewed narrow policy/manifest revision. Do not broaden the
   replacement allowance or drop original pins merely to get OFFLINE_READY.
7. Run current offline preflight/tests and independent pin verification. Require
   a final owner review and a new separately hash-bound, single-attempt live grant.
   No consumed authorization or previous token-lifetime receipt may be reused.

Exact future permissions are separate: (a) offline recovery-procedure and binding
preparation; (b) one owner OAuth window with enumerated auth-file changes;
(c) one Docker Desktop launch with restart-policy acknowledgement;
(d) one existing-container startup; (e) one bounded read-only preservation audit;
(f) final offline package reconciliation/review; and only then (g) one explicitly
bounded provisioning attempt including provider reads, candidate-only persistence,
active-resource handoff and acknowledged containment limitations. None is granted
by completion of this offline repair.

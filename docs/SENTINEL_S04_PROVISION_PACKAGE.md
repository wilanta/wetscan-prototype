# S04 phase-specific provision-and-ingest execution package

Prepared offline on 16 November 2026. The archive exception remains
**ACCEPTED_OFFLINE_WITH_DOCUMENTED_RESIDUAL_RISKS**. Overall S04 remains
**IMPLEMENTED_PENDING_ACCEPTANCE**. This package grants no live authority.

## Entrypoints and preserved code

- `scripts/Invoke-S04ProvisionPackage.ps1`: new default-off owner procedure.
- `scripts/sentinel-provision-package-check.ts`: independent filesystem checker.
- `scripts/sentinel-provision-package.ts`: manifest, grant, authentication and
  candidate-persistence policy; no database, provider or auth-store API imports.
- `scripts/sentinel-provision-package-policy.ts`: frozen exact owner/evidence scope.
- `scripts/sentinel-provision-package-owner.ts`: invokes the existing phase with
  mandatory checker callbacks before pool construction and around HTTP requests.

The original provision, read-only audit, OAuth and archive-audit PowerShell
runners, original authentication/exception validators, application authentication,
SQL and preservation algorithms remain unchanged. The existing provisioning owner
module has additive optional boundary callbacks and a response-reader extraction
that consumes the body before the filesystem check; its original gates, row
verification, operation sequence, diagnostics and cleanup are retained. The new
package entrypoint supplies the mandatory callback; legacy entrypoints are not
approved substitutes for this package. Before-state source bytes are preserved.

No arguments to the new PowerShell procedure return
`OFFLINE_ONLY_INPUTS_REQUIRED`, with no Node checker, output, approval, application,
provider or database operation. An explicit offline preflight requires the reviewed
manifest path/SHA and exact candidate CookieFile. `-ExecuteLive` additionally
requires a fresh separately pinned owner-grant file, exact output binding, owner
reference and explicit handoff/emergency switches. There is no default cookie.
Recovery, containment and APP/migrator credential-file paths are fixed to the
reviewed inputs; substituted paths are rejected.

## Manifest and initial validation

The new schema-2 manifest is for `provision-ingest`, not a runtime approval. It
retains every path from the original 1,782-entry archive manifest and independently
verifies that immutable parent's SHA. Only the accepted exception-document pin
and the provisioning owner module's additive-hook pin may be reconciled. Original
validator, archive, baseline, secret-file and other parent pins cannot be dropped
or changed. A pinned before-inventory additionally preserves all 856 previously
existing private files. New evidence, code, tests, procedure and documentation are
separate additions. The previously reported 1,848 count was a reconciliation
snapshot; the actual final manifest count/hash is recorded in the private package
receipt, not assumed here.

Coverage includes the explicit candidate cookie and metadata; all six auth/cache
files; the old cookie and eight backups; exact required-absent old session;
proposal, design, original baseline and approved exception descriptor; all four
dotenv presence/hash bindings; recovery/containment and previous approvals;
provisioning dependencies; the existing compiled Next.js server/build metadata;
owner acceptance and independent validation receipts; and the new package code.
No historical manifest is rewritten or silently filtered.

At preflight/authorization/begin, the unchanged archive verifier must pass its
full fixed one-record contract. The candidate must be the exact descriptor-pinned
file, map to the unique selected session, match expected owner/workspace/repository
and localhost origin, and have no pending flow. The new package requires at least
40 token minutes at entry (30 required plus the maximum ten-minute window).
Every runtime boundary still requires at least 30 minutes. No refresh is performed
by these checks, and no prior PASS receipt substitutes for current reads.

Private boundary, symbolic-link/alias, hard-link and regular-file checks apply.
Manifest/grant/new output/before-state protections use the existing Windows
owner/SYSTEM ACL helpers. The historical approval scanner is reused; only this
attempt's two exact runtime approvals are excluded from historical-closure checks.
The four reviewed terminal preflight statuses remain valid. Unknown/invalid
approvals remain blocking.

## Candidate-only persistence

During a separately authorized future live attempt, `begin` exclusively stores
the original encrypted candidate bytes and a manifest/grant/output-bound checkpoint
in the fresh protected output. No plaintext auth record or credential is written
to a receipt. A create-only consumption marker and output-directory binding
prevent reuse of a grant or partially completed output.

Runtime verification permits changed ciphertext at exactly the derived candidate
session path. It decrypts both the original pinned bytes and current bytes with
the existing secret and exact associated record identity, and requires equality
of the complete canonical JSON values, including every token, expiry, identity,
flow and unknown field. There is no credentials/expiry extension exception.
Different ciphertext with identical plaintext passes; token rotation, identity
change, changed expiration, extra fields, or invalid encryption fails closed.

All other historical sessions, profile, cache, old/new cookies and metadata,
archives, configuration and immutable inputs retain their byte hashes. The exact
auth file/directory inventory must match; an extra temporary file or reappearing
old session fails. Transient candidate `.tmp` files created by the existing atomic
store must be gone before a completed-request boundary. The checker never creates
or removes an active auth file and never calls `getSession`, OAuth or refresh.

The checker runs in its own process: it loads auth configuration privately and
does not send the secret to the controller. Package-control variables are removed
from the web process. Fresh filesystem checks occur before each phase operation,
before each management/ingest request, and after each received response, followed
by a final check after the web process is stopped. Auth inventories and critical
inputs are reread to detect intervening changes. Checks establish state at these
boundaries; they add no permanent runtime revocation ledger.

## Mutation-budget semantics

| Quantity                                            | Normal complete success | Including bounded containment          |
| --------------------------------------------------- | ----------------------- | -------------------------------------- |
| Newly persisted rows                                | 10 exactly              | At most 12; partial prefixes permitted |
| INSERT SQL statements in the reviewed complete path | 11                      | At most 13                             |
| Historical rows modified                            | 0                       | 0                                      |
| Existing project-binding rows changed               | 0                       | 0                                      |
| UPDATE statements on newly created rows             | 4                       | At most 8                              |

Normal rows: one source, one credential, one rule pointer, two immutable rule
versions, two rule audits, one event, one batch, one queued job. The additional
INSERT statement is the existing conflict-guarded project-binding upsert. Start
validation requires the matching enabled owner binding, making its UPDATE
predicate false; it must leave the historical row unchanged. Snapshot row hashes
enforce that result. SQL statement counts here are reviewed source-path counts,
not a claim of a runtime SQL trace or database-enforced per-statement quota.

Normal UPDATEs are the new rule pointer, two new-source rate-accounting updates
(including the explicit duplicate replay), and new-source contact timestamps.
Emergency containment may update only the new credential's revocation, new
source revision/enabled fields, and new rule pointer; it may add only the new
rule's DISABLED version 3 and its disable audit. No source/credential rotation,
historical-row modification, deletion, job retry/requeue, or migration is allowed.
The existing comprehensive preservation/delta validator is reused unchanged.

## Future execution sequence - not executed

The owner must first close WetScan browser tabs/private windows **without signing
out** and ensure no other auth-store writer or local client uses the temporary
application. Do not open the UI during this phase. This quiescence confirmation
belongs in the separate owner authorization; the checker verifies drift at each
boundary and does not control or inspect browser tabs. Unexpected writes cause
STOP and an evidence-preserving report, never silent restoration.

1. Independently verify the new procedure, manifest SHA/count and all input pins.
   Run default-off preflight using the explicit candidate. Stop on stale lifetime,
   changed scope, missing evidence or unresolved approval. The operator supplies
   a fresh, narrowly scoped owner-grant file after separate owner authorization;
   its hash, runner, manifest, candidate and fresh output must all agree.
2. Create only the fresh owner/SYSTEM-protected output. Start the existing
   independent watchdog before the tracked `begin` checker. Consume the grant
   once, preserve encrypted before-state, and create two fresh runtime-only DB
   approvals for phase `provision-ingest`, sharing the grant's deadline of at
   most ten minutes. Never reopen old approvals.
3. Through the existing gated migrator, capture a repeatable-read read-only DEV
   snapshot. Enforce `127.0.0.1:55432/wetscan_dev`, exact marker
   `wetscan-s01:26b6b537-c016-4dc7-8007-4e839e8b838f`, expected role/permissions,
   PostgreSQL version, migration checksums and schema. Require all 91 original
   rows, 16 jobs, eight heartbeats, Incident #1/evidence and prior contained
   resources, allowing only the already completed semantic containment delta.
   File integrity or a historical audit is not fresh database-state proof.
4. Start only owned APP-credential Next.js at `http://localhost:3000`. Require the
   CookieContainer GET to identify the old target rule as DISABLED revision/version 3. Management auth uses the existing GitHub identity, installation membership,
   installation permissions and repository-read checks; these external reads and
   candidate persistence require explicit future authorization. No OAuth flow,
   refresh, source-code scan or unrelated GitHub operation is included.
5. Run the existing no-cookie/foreign-project/bad-origin/demo denial probes.
   Create the controlled local source and show-once credential, then the DRAFT
   rule at revision 1; enable only that rule using expectedRevision=1, requiring
   ENABLED revision 2. Durably journal intents, positive IDs and responses before
   any subsequent mutation. Store the credential only in its protected file.
6. Check the pre-ingest delta and clock. Reject the invalid bearer, then submit
   exactly one normalized synthetic GET/403 event/batch, requiring 202. Perform
   only the explicitly planned identical-batch replay, requiring 200 duplicate.
   Require one distinct event/batch/job and no additional processing records.
   Attribute the job by exact new source/event, subject reference, idempotency
   key, scope, creation cutoff and disjoint historical ID sets. Context
   `admittedJobIds` remains empty; no worker authority is issued.
7. Stop the owned application before the final read-only preservation audit.
   Verify every old row hash and exact new-row bounds, zero new alerts,
   evaluations, incidents/timeline/outbox/attempts, leases or orphan evidence.
   Close both DB approvals independently of process/auth errors. Run tracked final
   candidate-only verification, verify owned-process/pool/watchdog cleanup and
   empty approval actions. Keep all evidence create-only. Later worker processing,
   incident/UI/negative-matrix verification and final revocation require separate
   acceptance phases.

The source, bearer and new ENABLED-r2 rule remain active only if the fresh grant
explicitly approves that handoff and every final check passes. The bearer has no
automatic TTL. This package does not authorize a subsequent phase.

## Failure, containment and STOP policy

First failure stops normal execution. Never retry a POST, substitute a revision,
restart the application, retry an attempt or switch targets. Before/after
candidate semantics and all historical guards remain mandatory during recovery;
a failed boundary cannot be bypassed to contain resources.

Only pre-authorized, positively acknowledged new IDs may be contained while time
remains: revoke the new credential, disable its source, and disable its new rule
only at expectedRevision=2. This is compensating containment, not destructive
rollback. Preserve partial events/jobs unprocessed. Unknown IDs, an ambiguous
commit/response, drift, expired deadline or failed verification require STOP,
independent approval closure and owned-process shutdown, then a precise
NOT_VERIFIED report. Do not delete data, restore database/auth snapshots, restore
the archived session or guess a broader cleanup scope. No silent rollback or
automatic additional attempt is permitted.

## Owner command and fresh grant contract

The private package directory contains `reviewed-owner-procedure.ps1` and an
inert `future-owner-grant.template.txt`, both pinned by the new manifest. The
procedure checks its runner and every manifest file before invoking it. Its
manifest SHA is supplied explicitly; it is not embedded inside a file pinned by
that same manifest, avoiding a self-referential checksum.

The template is not an approval. A future grant must bind its exact reviewed
runner/manifest hashes, explicit candidate, new output, owner reference, DEV
scope and a fresh maximum-ten-minute validity window; allow only one attempt,
candidate-only persistence, required provider reads, active handoff and bounded
emergency containment; prohibit refresh and historical mutations; and state the
10/12 newly persisted-row limits. The two DB runtime approvals remain separate.
Consumed output cannot be reused. No grant is created or exercised by this task.

Four residual risks remain unchanged: unexplained historical deletion, current
GitHub access NOT_TESTED, no permanent revocation ledger, and unresolved
refresh-persistence hazard. Minimum lifetime and exact no-rotation checks reduce
exposure in this bounded phase; they do not repair application refresh behavior.
Prior offline acceptance remains archive-only, not complete in-place preservation.
No database, provider, application, worker, authentication mutation or publication
was executed during package preparation. Fresh live owner authorization remains
mandatory even if all offline tests and checks pass.

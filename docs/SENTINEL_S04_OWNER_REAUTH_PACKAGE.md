# S04 auth-only recovery package

Prepared offline on 17 November 2026. Default mode performs read-only filesystem
validation and never starts an app, provider request, authentication write or DB
connection. Live execution needs a separate explicit owner grant for the final
hash-bound package.

Phase 0 remains **ACCEPTED_BY_OWNER_ADJUDICATION_WITH_DIAGNOSTIC_EXCEPTION** under
[the additive decision](SENTINEL_S04_PHASE0_OWNER_ADJUDICATION.md). The original
audit remains NOT_VERIFIED and its lost stderr contents remain NOT_CONFIRMED.
Overall S04 remains **IMPLEMENTED_PENDING_ACCEPTANCE**; offline authentication
remains **ACCEPTED_OFFLINE_WITH_DOCUMENTED_RESIDUAL_RISKS**.

## Implementation and preservation

- `scripts/Invoke-S04OwnerReauth.ps1`: the default-off procedure. Checks manifest
  and bootstrap dependencies, snapshots before state, owns the app/watchdog,
  captures a fresh candidate through hidden input and runs offline verification.
- `scripts/sentinel-owner-reauth.ts`: additive read-only validator. Reuses the
  existing snapshot/inventory, private file checks and frozen archive descriptor
  validation. Never imports the mutating auth store, token-refresh API or PG.
- `scripts/sentinel-owner-reauth-app.mjs`: limited hosting of the existing Next
  login/start/callback routes. `/app` is a static completion page, not the full
  shell. `/api/onboarding` returns an anonymous fixed result. Logout, Sentinel and
  unrelated APIs are denied. Only login/static assets and HMR are admitted.
- `scripts/sentinel-owner-reauth-watchdog.ps1`: maximum 15-minute app window,
  including app preparation; stops only journaled owned processes.

The limited host prevents old-cookie session reads/deletion, unrelated app-shell
requests and refresh during recovery. Its fetch policy admits exactly one OAuth
authorization-code exchange and one GitHub `/user` identity GET. It rejects wrong
owner responses before profile persistence, refresh grants, retries, repository
probes and unrelated URLs. This is a procedure-only control, not a production
authentication change or permanent revocation ledger.

Before app startup, exclusively back up the canonical cookie, its metadata and
all active session/profile/cache records. Verify source hashes again after copy
and every backup hash. Partial backups remain preserved; no overwrite or retry.
Check all eight original archives, the frozen one-record exception descriptor,
proposal/design/baseline/archive hashes, original cookie binding and owner.
The archived session must remain absent. Every active encrypted session/profile
must decrypt and validate; unreadable or malformed records cannot be skipped.

Canonical cookie/metadata, all prior candidates, historical receipts, backups,
and every non-exempt historical session/cache remain byte-identical. The only
normal-success authentication-store changes allowed in a future window are:

1. One new anonymous flow session is created and saved. A valid callback consumes
   state once. Normal rotation deletes only that new flow record.
2. Exactly one unique new authenticated owner session remains, created during the
   window and mapped to the manually captured candidate, with no pending flow or
   installation choices. No additional record may remain.
3. `user-187839747.bin` may be resealed. AES-GCM random IVs change ciphertext even
   for identical values. All decrypted fields except `login` must equal the
   before-state profile. No incidental timestamp field is added by `writeRecord`.

Fresh candidate cookie/metadata are exclusively created in the new private run;
the canonical files are never moved/replaced. Output and backups use owner/SYSTEM
ACLs, outside the repo/OneDrive. Wrong candidate, extra missing/modified/new record,
archived-record reappearance, wrong identity/scope/origin/callback, incomplete
evidence or cleanup error fails closed. Archive-only disposition is not complete
in-place preservation. No rollback or partial-state deletion happens automatically.

## Configuration, source and diagnostics

Exact origin: `http://localhost:3000`; callback:
`http://localhost:3000/api/auth/github/callback`. Owner `187839747`, workspace
`github-user-187839747:test`, repository `998736528`, project `github-998736528`.
Retain AUTH_SECRET and AUTH_DATA_DIR. Reject ambient auth/GitHub overrides,
NODE_OPTIONS, PG/DATABASE/DB/POSTGRES/SENTINEL variables and runtime approvals.
Bind all six production/development dotenv file-presence/hash slots.

The existing production BUILD_ID dates from 15 November and does not independently
prove equality with current source. The future host compiles pinned current
development source with webpack; it never serves the old production build. The
validator loads the same development dotenv configuration. `.next/dev` and Next's
incidental generated type/cache outputs may change only during the future window;
they are not historical authentication/database evidence. No build/server runs
during offline preparation.

Framework logs can contain callback URLs or provider bodies; raw stdout/stderr
are not retained. Fixed-category app/window receipts and counters, validator
classifications, checker exit codes, failed/completed stage identifiers and
cleanup errors are preserved. A forbidden operation after callback completion
creates a separate failure marker. No missing/failed evidence becomes success;
cleanup failure preserves the primary failure and produces a nonzero exit.

## Separate lifetime gates and residual risks

Recovery requires an unexpired session and **30 minutes** of remaining access-token
validity at final offline verification. Future provisioning needs **40 minutes at
entry** and **30 minutes at later mandatory boundaries**. The receipt reports
entry lifetime eligibility separately and always marks provisioning unauthorized.
Old lifetime measurements are not reused; offline inspection never refreshes.

Four risks remain: unknown historical deletion cause; unverified current GitHub
repository access; missing permanent revocation ledger; unresolved production
refresh-persistence hazard. This window avoids refresh and does not repair that
hazard. OAuth `/user` verification does not prove current repository access.

The existing encrypted store retains its inherited Windows ACL, including the
Codex tooling-group read grant; no permission change is performed. The private
package records its exact SDDL hash. The future hash-guarded command must require
that same ACL and the owner grant must explicitly acknowledge retaining it.
Owner/SYSTEM-only ACL enforcement remains required for new private backups and
the plaintext candidate. This does not waive any original validator condition.

## Review and future owner execution

Manifest, completion receipt, independent verification, proposed single-use grant
and exact hash-guarded command are under:

`C:\Users\sheil\.wetscan-sentinel\s04-auth-recovery-package-8eac13b7d5d0406fbb9b8c35c5d062c2`

Read final hashes from the completion receipt; do not use historical helper pins.
After separate approval of this exact package:

1. Run the default-off check. STOP on changed input/configuration, bad archives,
   authentication drift, missing evidence or runtime conflict.
2. Use the hash-guarded command's explicit live switch and fresh owner grant.
   Close existing WetScan tabs/private windows WITHOUT signing out; confirm
   `AUTH_TABS_CLOSED`. This prevents old-cookie background requests.
3. Open a clean private window at `http://localhost:3000/login`, click Continue
   with GitHub once and use the owner account. Do not alter onboarding, settings,
   installations or repository selection. Stop on error; no OAuth retry.
4. At the static completion page, return to PowerShell and type DONE. The app and
   watchdog must stop and cleanup must verify before cookie capture.
5. Keep the browser open. Copy only the cookie Value through DevTools into the
   hidden local prompt, never chat. Offline verification checks the candidate and
   entire allowed delta. Then close the private window WITHOUT signing out.
6. STOP after validation or failure. Preserve all receipts/partial artifacts;
   no automatic refresh, retry, rollback or subsequent phase.

No PostgreSQL, Docker, database audit, runtime DB approval, worker, ingestion,
migration, provisioning, Git publication or acceptance-state change is authorized
by preparation. Real browser/provider integration is NOT_RUN; synthetic tests do
not claim a successful login. The later provisioning manifest must bind the
actual new candidate and reviewed recovery delta; it is not finalized here.

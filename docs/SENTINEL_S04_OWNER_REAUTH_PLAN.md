# S04 owner-controlled GitHub reauthentication plan

**PREPARED, NOT EXECUTED.** S04 remains IMPLEMENTED_PENDING_ACCEPTANCE. This
preparation does not authorize OAuth, startup, a DEV GET, a database connection,
or another provision-and-ingest attempt. The prior grant is consumed.

Private reviewed procedure and offline evidence:

`C:\Users\sheil\.wetscan-sentinel\s04-owner-reauth-review-8ec04da264d04310bf0750ca16923d34`

The current provisioning runner independently matches
`95a8c786c7dac4b94f74bc9bf655d720eee536665d63837a5a280de7568471da`.
All 1600 entries of the existing reviewed manifest match; manifest SHA-256 is
`c916b536139083745ae280e07206f7242b8ce05caf742b8228cc55e7196eaab6`.
That existing manifest and all historical receipts are preserved, not repinned.

## Why a genuinely new browser session is required

`src/components/auth/login.tsx` reads `/api/onboarding` and redirects an already
authenticated user. `/api/auth/github/start` also immediately returns `/app` for
a completed profile. Opening `/login` in the old browser session will therefore
not necessarily reauthenticate GitHub.

Close all old private windows first: private windows can share one cookie jar.
Also close every existing WetScan/localhost tab and HTTP automation without
signing out, so background requests cannot refresh the old session during this
window. The controller requires the owner to acknowledge this before startup.
Open a new InPrivate/Incognito window (or a fresh Guest browser profile), with no
`wetscan_session` for localhost. Do not sign out of the existing regular-window
session: logout deletes its server-side file, which we want to preserve.

Clicking Continue with GitHub in that clean window creates an anonymous local
session and a new state/PKCE login flow. The callback consumes state once,
exchanges a new authorization code, verifies the GitHub identity, loads the
existing completed owner profile, and rotates to a new random 64-lowercase-hex
session token. It deletes only the temporary anonymous flow record. This flow
does not obtain credentials by refreshing the old stored user token. The
existing installation and repository selection do not need to be changed.

The exact historical HTTP 400 remains NOT_CONFIRMED. A fresh login is a bounded
recovery procedure, not proof of which historical OAuth error occurred.

## Auth-only startup and safeguards

The auth start/callback/onboarding routes, encrypted store and `/app` proxy use
filesystem sessions. They do not call telemetryStore, ApprovedPool or migrations.
The overview's account query is `/api/onboarding`, not a Sentinel management API.
No PostgreSQL role, password or database runtime approval is required for this
auth-only route set. Never create a provisioning approval to sign in.

Keep APP_URL exactly `http://localhost:3000`, with callback
`http://localhost:3000/api/auth/github/callback`. Keep the existing AUTH_SECRET
and `AUTH_DATA_DIR=C:/Users/sheil/.wetscan-auth`; do not generate a new key or
directory. AES-256-GCM decrypts existing records with that key and the record
name as associated data. Changing AUTH_SECRET is not a session recovery method.
The offline check confirms the current key decrypts the existing owner profile,
the owner/test/repository binding, required GitHub configuration and RSA key, and
absence of database configuration in the effective production environment.

The proposed controller:

- Independently guards the old 1600-entry manifest, production dotenv file
  presence/hashes, and the inspector/common/timer/cookie-helper hashes.
- Rejects port 3000 or competing Next/worker/acceptance processes. It never stops
  an unrelated process or container. Use a clean Windows PowerShell 5.1 console;
  inherited NODE_OPTIONS is rejected for the live opt-in.
- Clears AUTH_/GITHUB_ overrides and all SENTINEL_/PG/DATABASE_ settings in its
  own process. Next loads the pinned production dotenv. The inspector rejects
  database settings in dotenv too; clearing inherited variables alone is not
  sufficient. No APP/migrator/worker credential or approval is provided.
- Creates a fresh owner/SYSTEM private directory outside the repo and OneDrive,
  using create-only artifacts. It starts one existing `next start -H localhost
-p 3000` build, without rebuilding or starting another service.
- Uses a separate 15-minute process-only deadline, a 30-second listener bound,
  retained handles and PID/start-time-scoped shutdown. It reuses only the
  functions-only ACL/process primitives from sentinel-provision-common.ps1;
  no approval-creation/closure or provisioning function is invoked.
- Stops the owned app before cookie capture. Logs remain private and are not
  copied to chat; OAuth callback URLs and browser network exports may contain
  codes. No live readiness GET is added to this preparation.

The older Antigravity `Invoke-S04OwnerReauth.ps1` is preserved. Do not use its
canonical-cookie `archive` stage or delete files to satisfy the old save helper.
The new procedure below uses a fresh candidate path instead.

## Exact future owner-side command

**Do not execute until the owner separately approves this procedure.** Run from
an interactive Windows PowerShell console; the owner operates the browser and
hidden credential prompt locally. No cookie or token belongs in chat.

```powershell
$ErrorActionPreference = 'Stop'
$script = 'C:\Users\sheil\.wetscan-sentinel\s04-owner-reauth-review-8ec04da264d04310bf0750ca16923d34\Invoke-OwnerGitHubLogin.ps1'
if ((Get-FileHash -LiteralPath $script -Algorithm SHA256).Hash.ToLowerInvariant() -cne '95b6336a1085f3f6fd6143a60b6c5fe0a1d2380647579d208e2f12d7dc403266') { throw 'reauth_procedure_hash_changed_STOP' }
& powershell.exe -NoProfile -File $script -ExecuteOwnerLogin -OwnerAuthorization 'OWNER APPROVED ONE AUTH ONLY LOGIN WITH PRIVATE BACKUPS AND NEW COOKIE'
if ($LASTEXITCODE -ne 0) { throw 'auth_recovery_NOT_VERIFIED_STOP_NO_RETRY' }
```

The same command is saved as `proposed-owner-command.ps1.txt` in the private
preparation directory. Without ExecuteOwnerLogin the controller only verifies
filesystem prerequisites and returns AUTH_PREPARED; it creates no run directory,
backups, approval, server or session.

When prompted:

1. Open the clean private window and visit `http://localhost:3000/login`, using
   localhost throughout, not 127.0.0.1. Ensure there was no old localhost cookie.
2. Click **Continue with GitHub**. Manually sign in as the existing owner
   `github-user-187839747`. GitHub may recognize its own browser login; a new
   WetScan authorization-code exchange is still required. Do not revoke or
   reinstall the GitHub App or change repository access.
3. Expect `/app` and the existing completed `test` workspace. Do not enter
   Sentinel, refresh repositories or alter onboarding. If a wrong account,
   callback error, onboarding prompt or installation screen appears, type ABORT
   in PowerShell. Preserve evidence; do not automatically repeat the flow.
4. Type DONE in the owner console only after successful return to `/app`. Keep
   the private browser window open; do not click Sign out. The controller stops
   its app and timer and verifies process/port cleanup.
5. In the still-open browser, use F12 -> Application -> Storage -> Cookies ->
   `http://localhost:3000` -> `wetscan_session` -> Value. Copy only the
   64-lowercase-hex value and paste into the hidden local Read-Host prompt.
   Never copy request headers, raw session records or tokens into chat. The save
   helper clears the clipboard when it finishes.
6. Require PASS_LOCAL_SESSION from the offline verifier. Close the private
   window without signing out. STOP: no Sentinel GET, provisioning or worker.

The app deadline is 15 minutes; OAuth state itself expires after 10 minutes from
flow creation. A timeout is a stop, not permission for an automatic retry.

## Cookie compatibility, archival and validation

The existing `Save-WetScanOwnerSessionCookie.ps1` understands the current session
format: it takes a hidden 64-hex value and writes `wetscan_session=<value>` plus
schemaVersion/origin/callbackUrl/recordedAt metadata in UTF-8 without BOM. Its SHA
is `e9945e45ddcd2bd2762f2afc10bba147d5b30875228bf695885ee1bbfdd67924`.

It is not a general-purpose safe replacement tool: it refuses existing targets,
uses check-then-WriteAllText instead of atomic create-new, sets file ACLs after
writing, and its case-insensitive PowerShell regex also accepts uppercase.
The procedure confines it to a newly created protected candidate directory,
after the server has stopped, with no existing targets or concurrent writer.
The new validator requires lowercase and exact bindings. Do not use the helper
against an existing/default target or follow its suggestion to remove old files.

Before startup, snapshot mode copies the previous cookie, origin metadata and
all existing encrypted auth-store files into a fresh protected archive, using
COPYFILE_EXCL and immediate hash checks. It also records their original hashes
and production dotenv hashes. Plaintext AUTH_SECRET or decrypted records are
not copied to evidence. The old canonical cookie and metadata remain in place
and byte-identical throughout; nothing is renamed, deleted or overwritten.

The replacement is a **new candidate file**, not an overwrite:

`C:\Users\sheil\.wetscan-sentinel\s04-owner-login-<fresh-id>\candidate\owner-session.cookie`

The controller calls the unchanged save helper with explicit RepoRoot and
CookieFile arguments for that candidate. Future provisioning must explicitly
use that new CookieFile path after review; its real runner interface supports
this parameter. The old default path intentionally remains historical.

`inspect-owner-session.mjs --mode=verify --run=<owned-run-directory>` reads and
decrypts directly; it never calls getSession, which can delete expired records.
It performs no HTTP or database operation and consumes no provisioning attempt.
It requires:

- A new cookie mapping to a session absent from the before-inventory, with
  creation during the login window, no pending flow and unexpired local session.
- Expected GitHub owner, completed profile, test workspace and repository
  998736528; access/refresh token presence and at least 30 minutes of access-token
  lifetime remaining. It never prints token values or session-record identifiers.
- Exact origin metadata and capture time; unchanged dotenv, old cookie/metadata,
  backups and all historical session files.
- Exactly one added final session file. The existing owner profile can be
  reencrypted; its fields must remain equal except a provider-updated login name.

The sanitized result proves local session identity/freshness and archival
integrity. It does not claim current GitHub repository/installation access or
DEV rule state. The OAuth callback verifies identity during the approved login;
any later project/API check is a distinct live action needing authorization.

## Refresh-token rotation risk and separate fix proposal

The existing deterministic test in tests/sentinel/provision-get-400.test.ts
models a successful refresh followed by a GitHub installation/API failure.
userToken mutates the in-memory Session in src/lib/auth/github.ts, while
authorizeCanvasProject saves it only after Promise.all succeeds. On that error
the stored old credentials remain. This is a demonstrated persistence defect;
it does not prove the historical provider rotated a token in either failed run.

A separate application fix is recommended before depending on refresh again:
thread a secure persistence capability/session identity through the refresh
path; atomically persist a successfully rotated credential set in the encrypted
store before returning it or making any subsequent GitHub API call. Keep
authorization checks and per-session serialization; a later repository denial
must still deny access. A persistence failure must stop before further API use,
not retry refresh or fall back to app-only authorization. Test successful refresh
followed by denial, write failure, concurrency, timeout/abort and secret-free
diagnostics. A process crash between provider rotation and local persistence
cannot be made into a cross-system atomic transaction; keep that limitation.

No production authentication change is made in this preparation. Fresh login
does not use the old refresh token and the 30-minute minimum limits near-expiry
validation. It does not repair refresh for future long-lived use. If the new
token is too near expiry, stop instead of deliberately exercising refresh.

## Expected files and next manifest review

Expected auth writes during the separately approved flow are only:

- A temporary anonymous encrypted flow record, then its normal rotation/deletion.
- One new final encrypted session under AUTH_DATA_DIR.
- The existing encrypted `user-187839747.bin`, rewritten by the callback; the
  profile binding and selected repositories must be preserved.
- New archive/hash, candidate-cookie/metadata, private logs, process journal and
  sanitized verification artifacts inside this attempt's fresh directory.

Old session files, canonical cookie/metadata, .env files, AUTH_SECRET, GitHub App
settings, database rows, recovery/containment artifacts and acceptance approvals
must remain unchanged. Wrong-account or extra auth records are a failure to
report, not an invitation to delete or repair them silently.

Important coverage gap: the current 1600-entry manifest contains **zero
AUTH_DATA_DIR entries and zero dotenv entries**. Its unchanged hashes alone
cannot attest to the auth store/configuration. The new preparation pins dotenv
file presence/hashes, and the future snapshot explicitly inventories auth files.

After successful reauthentication, perform an offline review, not a blind rehash:
verify archive before-hashes; verify only the expected auth changes; retain the
old manifest and receipts; preserve all recovery/containment/source/compiled
pins; add the actual new cookie and metadata path, auth-store hashes and dotenv
hashes/presence checks to a fresh manifest. Review private auth hashes without
publishing credentials. Record the new manifest SHA/count and exact future
CookieFile argument. Reauthentication is not database preservation evidence;
the next provision attempt must still run its mandatory phase-start audit.

## Required separate authorization

Before running the proposed command, authorize **one owner-operated auth-only
Next.js window, maximum 15 minutes**, manual GitHub sign-in as the existing owner,
private byte-preserving backups, the expected encrypted profile/session writes,
new candidate cookie and origin metadata, local read-only verification and
owned-process shutdown. This includes GitHub OAuth/network interaction and
local auth-file writes, but no database approval/connection, Sentinel live GET,
provisioning, worker, migration or publication. A later provisioning attempt
needs another independently reviewed manifest and a separate live grant.

The private preparation receipt records current pin verification, offline
configuration check, 55 focused auth/transport tests, eight synthetic inspector
cases, parser/default-off results and historical-file integrity. These checks
do not claim a successful live login. STOP after preparation.

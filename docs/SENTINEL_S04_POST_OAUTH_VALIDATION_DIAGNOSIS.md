# S04 post-OAuth offline validation diagnosis

Overall S04 status: **IMPLEMENTED_PENDING_ACCEPTANCE**.
This work is offline diagnosis and regression validation only. No OAuth, live
authenticated request, database connection, application/worker startup, approval,
or provisioning was performed. Existing evidence and authentication files are
read-only inputs.

## Confirmed validation failure

Reviewed procedure SHA-256 remains unchanged:

`3f063cd6a49fdd7b87cb35f71494c5b4fc91d13498dc965b8ff9193a8337ccc8`

Execution evidence:

`C:\Users\sheil\.wetscan-sentinel\s04-owner-login-0080a5fca3db4995be94fd55139bc58d`

The inspector processes the historical preservation loop before examining the
candidate cookie. One historical encrypted session is absent from AUTH_DATA_DIR.
This is the session referenced by the original canonical cookie. Its archived
copy matches the pre-login hash.

The exact failing operation is:

```javascript
if (file !== profileName)
  check(hash(await readFile(join(authDir, file))) === digest,
        'historical_auth_record_changed');
```

`readFile` throws an Error with code **ENOENT** before the equality/check can
evaluate. The inspector catches it and emits the generic
`reauth_offline_validation_failed / offline_validation_failed` result; Node exits
1 and the controller raises `new_session_NOT_VERIFIED_STOP`. Configuration,
profile binding, config hashes, old-cookie hashes and preceding archive/source
checks had already succeeded. Candidate validation had not yet been reached.

This is a genuine preservation failure, not a demonstrated false rejection by
the validator. No historical guard or identity/expiry/origin check is relaxed.
The reviewed controller and inspector are unchanged.

## Independent read-only findings

The diagnostic decrypts records directly using the existing key. It never calls
getSession, which can delete expired records, or any provider/database API.

- All eight backup files match the snapshot hashes.
- The original cookie and origin metadata remain byte-identical.
- Three other historical sessions and the existing Canvas cache are unchanged.
- The old canonical cookie's active session file is missing. Its archived local
  session had approximately 7013 minutes left at snapshot time and was also
  unexpired at capture time; normal expiry does not explain the deletion.
- The owner confirms neither signing out nor manually deleting auth files.
- The owner profile ciphertext changed as expected. Profile fields, owner,
  workspace `test`, installation binding and repository 998736528 are preserved.
- Exactly one new final session exists. The candidate cookie maps to it and has
  the required protected ACL. Its identity is absent from the before-inventory,
  the record mtime is during the login window, its local session is unexpired,
  it has no pending flow, and access/refresh credentials and finite expiry exist.
- Candidate origin/callback metadata and capture time are consistent with the
  expected localhost origin and post-snapshot capture.
- AUTH_DATA_DIR and production dotenv hashes/presence remain unchanged; the
  same AUTH_SECRET decrypts archived and current records.

The new access token had **473 whole minutes remaining at capture**. The first
completed diagnostic at 2026-11-16T09:26:31.065Z observed **468 minutes** remaining;
the later check observed 465. There is no receipt with the exact original failed
validator timestamp. Capture and post-failure checks bound its lifetime well
above 30 minutes throughout that interval, assuming no unrecorded wall-clock
jump. No timestamp inconsistency was observed. These are local expiry checks,
not a new proof of current provider/repository access.

## Deletion attribution remains NOT_CONFIRMED

Source has three session-deletion paths: expired getSession cleanup, explicit
logout, and rotation of the callback's prior session. A clean login normally
rotates/deletes only its new anonymous flow session. Source and compiled input
pins remain unchanged. The available Next/timer logs contain startup output and
no callback/logout/deletion trace. Neither a particular route nor a process that
removed the old record can be established from these artifacts. Do not blame
owner action, infer a random token collision, or claim callback deletion as fact.

The historical record's absence and the exact validation failure are CONFIRMED;
the actor/mechanism behind the disappearance is NOT_CONFIRMED.

## Regression and evidence

Fresh private evidence directory:

`C:\Users\sheil\.wetscan-sentinel\s04-post-oauth-diagnosis-a22c77ec2c2846e6b204270909bcce48`

The new private regression fixture reuses the unchanged inspector in a synthetic
temporary workspace. It reproduces eight-file archival and a valid fresh
candidate with one missing historical session, asserts ENOENT rejection while
the backup/new session/cookie remain intact, and demonstrates success only after
restoring that synthetic fixture record. It also covers missing backup, exact
origin, old/uppercase cookies, token expiry, owner/repository drift, cache drift,
repeat snapshot rejection and Windows ACL failure. No real session is restored
or edited. All temporary cleanup is bounded to the synthetic fixture root.

The private sanitized diagnostics contain booleans, counts and relative lifetime
only. No cookies, tokens, decrypted records, secret keys or session identifiers
are published. Hash/allowlist evidence remains private. Validation and final
preservation results are recorded in verification.sanitized.json.

## Next owner action

Do not repeat OAuth merely to replace this locally valid candidate. An offline
validator fix alone cannot resolve the missing historical source file; silently
ignoring it would violate the reviewed preservation contract.

Review the single-file discrepancy and separately authorize a bounded recovery
decision. The private missing-session-recovery-review.private.json pins exactly
one missing destination, its verified archive and before-hash. A possible
create-only, byte-exact restoration requires explicit owner approval: it would
reactivate an old still-unexpired local session. That operation is **not
authorized or executed here**. Further deletion forensics may be selected before
any recovery. Never overwrite a file that reappears, restore multiple records,
or relax the validator to make the result pass.

Keep the candidate, all backups and failed receipts unchanged. Any authorized
recovery must be followed by separately scoped offline preservation/session
verification. Recheck token lifetime at that time; a future login is needed only
if the candidate then fails freshness requirements. Provisioning remains blocked
and needs a separately reviewed manifest and authorization.

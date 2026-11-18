# S04 missing historical auth session: final review

Status: **REVIEW COMPLETE, ACCEPTANCE BLOCKED**.
S04 remains **IMPLEMENTED_PENDING_ACCEPTANCE**. This is offline review only.
No session, cookie, existing receipt, application validator or manifest changed.

## Recommendation and current contract

Keep the missing historical session absent. Seek separate owner authorization
for OFFLINE implementation and regression testing of a single-record,
hash-pinned, archive-only preservation exception. This recommendation does not
authorize or implement an exception. The existing validator must continue to
fail until an explicitly reviewed recovery decision is implemented and verified.

The current contract requires the active original files to match the pre-login
hashes, except the permitted semantic profile update and one new final session.
It has no archive-only exception interface. Exact restoration is the way to
satisfy that contract as written; a documented exception alone does not make the
current validator pass. Do not invent a skip flag or claim existing support.

Security favors archive-only treatment because deletion is the application's
invalidation mechanism and its origin remains unknown. Absence of an audit
record is not evidence that reactivation is safe. The new candidate already
passes local session checks and does not require restoration of the old session
to authenticate as the owner.

| Approach | Security effect | Acceptance effect |
| --- | --- | --- |
| Exact one-file restoration | Reactivates local access for the original cookie until its existing expiry; provider API access still depends on GitHub credentials | Can satisfy the unchanged historical-file guard after full offline revalidation; cannot explain the deletion |
| Explicit archive-only exception | Leaves the old cookie unusable; keeps the verified archived bytes and new candidate | Unsupported today; needs an approved contract amendment, narrowly constrained validator/runner changes, tests, an explicit exception result and new manifest review |

Do not restore and then change expiry, revoke it again, or silently omit it. Those
would be different mutations and would not establish exact preservation.

## Verified identity and metadata

Original proposal:

`C:\Users\sheil\.wetscan-sentinel\s04-post-oauth-diagnosis-a22c77ec2c2846e6b204270909bcce48\missing-session-recovery-review.private.json`

SHA-256:
`2b29c5f4c41a89ca663a3f3a5e282ba2d6f92ee7db5b8a086e2bb546c4a37152`

The one archived encrypted record has SHA-256:
`44af3d9ea05ba53ed1592d96e064a400f4c811dc86a17aa882947eb556f7e945`

It is 279 bytes, matches the independently reviewed pre-login auth inventory
and exact snapshot record pin, has protected owner/SYSTEM archive ACLs and no
reparse boundary, decrypts with the current unchanged key and expected associated
record identity, and maps to the original canonical cookie. The active target
remains absent. Exact target/archive paths remain in the private allowlist.

The archive's recorded modification time is 16 November 2026 00:09:58.941 WIB;
archive creation is 16 November 2026 16:13:46.512 WIB. These are filesystem
metadata, not proof of the original session's creation event or deletion actor.
The pre-login auth-before.private.json SHA-256 is:
`4636a00c2b3aa82d23efe215cec3d42131f79549c37f5617022599c8c896780a`.

At 16:42:35 WIB the archived old session was still unexpired, with approximately
6985 local-session minutes remaining, expected owner identity and no pending
flow. No embedded revocation marker was found. The new candidate still passed
the local owner/workspace/repository/origin/freshness checks and had 452 access
token minutes remaining. This is a local expiry assertion; no GitHub call was
made to verify current provider access.

All eight backups and original cookie/metadata were rechecked intact.

## Legitimate invalidation paths and evidence limitations

src/lib/auth/session.ts deletes expired records from getSession and deletes the
old token's record during rotateSession. src/app/api/auth/logout/route.ts deletes
the submitted cookie's record explicitly. Normal clean-login rotation should
remove only the newly created anonymous flow session.

The missing record was unexpired before and after login, so ordinary expiry
cleanup does not account for the observed window. The owner reports no logout
or manual file deletion. Available Next/timer logs have no callback/logout/
deletion audit trail. There is no independent session revocation ledger or
tombstone in the reviewed store/types; a successful logout does not leave one.
The backup is a pre-deletion snapshot, so lack of a marker inside it cannot
exclude subsequent intended invalidation.

No evidence of credential compromise or intended revocation was identified in
the reviewed artifacts. Neither can be excluded from those artifacts. The
deletion actor/mechanism remains NOT_CONFIRMED. Do not undo an unexplained
invalidation merely to obtain a PASS.

Restoration would cause getSession to accept the old cookie again while the
archived expiry remains in the future, and profileFor/onboarding would recognize
the expected owner. It would not recreate a cookie in a browser that has removed
it, but anyone retaining the old cookie could present it again. Provider token
validity and refresh behavior are separate and remain untested.

## Recommended exception design: not implemented

New private review:

`C:\Users\sheil\.wetscan-sentinel\s04-session-final-review-05cb0eb1640f4a4c93055416bbde022d`

archive-only-exception.design.private.json pins the exact absent old record,
original proposal, snapshot, archive, and all six currently existing auth/cache
files. A future approved implementation must:

1. Allow exactly that one record to remain absent; require its archived bytes,
   original cookie binding, owner identity, immutable baseline and disposition.
2. Reject any reappearance of that old active record, another missing record,
   changed backup, widened path, duplicate exception, profile/candidate exception,
   wrong owner, or unreviewed disposition.
3. Preserve all current candidate identity, expiry/minimum 30-minute lifetime,
   origin, workspace/repository, config and other historical-file checks.
4. Emit an explicitly distinct result such as
   PASS_WITH_APPROVED_AUTH_ARCHIVE_EXCEPTION, with one archive-only record. Never
   report all historical active files as byte-preserved in place.
5. Preserve every historical failed receipt. Pin the new disposition and reviewed
   code/output in a fresh manifest. Do not retroactively rewrite the baseline or
   treat this as a database-preservation exception.

Expected auth/cookie/profile writes: **zero**. Future implementation would create
new reviewed validator/test files or versions, a private approved disposition
and verification receipt, and a fresh manifest. None is approved or performed by
this review. No production authentication behavior needs to change.

## Conditional restoration alternative: not recommended or authorized

restoration-alternative.design.private.json records the exact one-file allowlist
and verified hash. If the owner explicitly chooses restoration and accepts old
session reactivation despite unknown deletion origin, the procedure is:

1. Reverify exact proposal/archive/snapshot pins, canonical boundaries and ACLs,
   original-cookie binding, absence of the destination and no conflicting auth
   application/writer. Stop if the target reappears or any pin changes.
2. Create fresh protected output outside repo/OneDrive. Durably journal the absent
   destination and hashes/metadata of archives, cookie/candidate, current auth
   files and historical evidence before writing anything to AUTH_DATA_DIR.
3. Preserve the original archive. Create and hash-check an exclusive additional
   backup and a staging copy in protected output; flush it and verify ACL/hash.
   Never change encrypted payload, embedded expiry or any existing auth file.
4. Journal publication intent and atomically move the staging file, on the same
   verified volume, to only the allowlisted absent target using no-overwrite
   File.Move semantics. Do not publish directly from the sole original archive.
5. Immediately verify target hash and private ACL, all eight original backups,
   original cookie/metadata, new candidate/profile/cache/other-session hashes and
   historical receipts. Exactly one active auth file may have been created.
   Record restoration time separately: original NTFS creation time cannot be
   claimed preserved by recreating a missing file.
6. Stop on any partial/ambiguous write. No retry, silent widening, automatic
   deletion or rollback. Keep staging, journal and any published file as evidence.

Rollback guidance: removing a published restored session would invalidate it
again and needs separate explicit owner authorization. Verify identity/hash and
quiescence first; never delete an unexpectedly changed file. There is no
automatic rollback in this review or proposal.

## Offline validation and subsequent provisioning

offline-validation-command.ps1.txt contains a parser-checked hash-guarded command
for the existing inspector, actual --mode=verify / --run interface, and unchanged
new candidate. It performs no OAuth, refresh, HTTP, database or application
startup. It creates one new receipt only if absent, preserving failed receipts.
It was not executed in this review.

That command currently fails on the missing historical file. It can pass after
separately authorized exact restoration and all unchanged checks. The recommended
archive-only approach instead needs a NEW explicitly reviewed validator and
interface; no current exception execution command exists. Do not substitute flags.

After an approved recovery decision, offline PASS with accurate disposition,
freshness recheck and manifest review, the existing new candidate can be supplied
through the provision runner's actual -CookieFile parameter. Never fall back to
the old default cookie. The manifest must include new candidate/metadata, actual
auth/config state, disposition if applicable and immutable evidence/code pins.
The mandatory DEV phase-start preservation audit and separate single-attempt
provisioning authorization still apply. No new OAuth is needed solely because
the old historical session is absent; token lifetime must be rechecked later.

## Authorization request

Authorize OFFLINE implementation and regression testing of the exact one-record
archive-only exception design, with zero auth/cookie/database mutations and no
provisioning. Review its tests, status/interface and manifest changes before
separately authorizing use in acceptance. Alternatively, restoration requires a
different explicit one-file authorization acknowledging old-session reactivation.
Neither choice is authorized by this review request.

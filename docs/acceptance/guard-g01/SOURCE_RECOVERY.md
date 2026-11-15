# Source acceptance recovery - explicit approval required

Request SHA256 **982844af1801dc5ad254be2d4fe903101f6f2fb2f13109c061d19fa50d597c1d**. Attempt ID **c5ca98b2-40ec-4561-b60c-fb430eae82dc**. Original .used marker and approved permit remain unchanged; the pending template is NOT ACTIVE. No source/enqueue/worker has run during preparation.

## Evidence and limitation

Owner-provided Resource Timing puts the503 request at2026-11-15T14:49:40.473Z (21:49:40.473WIB), duration973ms. The matching marker was already created at14:41:26.648Z (21:41:26.648WIB),493.825seconds earlier. Therefore the reported503 request did not create that reservation; the existing permit cannot admit another attempt. We cannot establish the original request outcome or infer a duplicate user click from the available evidence. No successful snapshot is claimed.

## Safe implementation repair

Only operator-owned approval JSON can specify a validated UUIDv4 attemptId. Legacy approvals without it retain the original .used path/behavior. A new explicit attempt writes .used.UUID exclusively; same UUID replay or concurrency cannot reset it, including if other approval fields change. Client input remains branch/commit only. The original marker is preserved. A terminal .result.json records only safe outcome/digests/counts/error codes; no raw source, file paths, cookies, tokens or arbitrary provider messages. Completed is recorded only after source cleanup; failure to persist completion fails closed. Existing Auth/Canvas GitHub permissions and snapshot limits are unchanged.

## Exact proposed operation

- Same inkAja/wdu, branchmain, commit41861b14dbb3f329fe3b20aed59a008390ef0e2b, actorgithub-user-145520313, workspacegithub-user-145520313:testing, projectgithub-839286157, job904d08f2a392f1f9d75b48309f9e270bfbf9e2e6e3ebcb7c322d415aa18f96ba.
- Activate ONLY the new source approval in the existing configured path, after preserving the previous permit in a new archive. No.env edit, restart, OAuth/picker or old-marker reset.
- One UI source-only snapshot; existing backend revalidates identity/installation/repository/branch/SHA and mints/revokes repository-limited metadata:read/contents:read token internally. Max1000files,65536bytes/file,20MB,45seconds, temporary owned source cleanup and sanitized result artifact. Stop on failure; no retry.
- Only AFTER source result AND journal prove success/cleanup, resume the already-approved original two identical enqueue calls=>one job and one prepare_only worker. Exact original DB/app/worker target and roles/operations remain unchanged. No new schema/role/password/Sentinel operations.
- All new source and remaining original job operations expire at **22:35:34.180WIB on2026-11-15**, no extension. No Docker/scanner/GitHub repository writes/production worker/G02/commit/push/deploy.
- Keep rows, audit, marker, old permit, pending template and outcome evidence. Cleanup only owned temporary source/process resources through existing implementation.

## Verification before approval

Typecheck PASS; full lint PASS; unit 791/791PASS; isolated production build and Guard E2E7/7PASS (fixture services, not Live). Original tests retained. Commands/times/exitcodes/source hashes are bound in source-recovery-request.json. Other existing acceptance remains honestly separate; connected source/worker proof is still pending.

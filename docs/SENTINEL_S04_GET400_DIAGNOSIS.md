# S04 provisioning authenticated GET HTTP 400 diagnosis

Status: **IMPLEMENTED_PENDING_ACCEPTANCE**. This work is offline diagnosis,
one diagnostics-only helper change and regression testing. The previous
one-attempt authorization is consumed. No DEV/TEST connection, live GET,
Next.js, worker, approval, provisioning or contain-rule replay was performed.

Evidence of the failed attempt (unchanged):
`C:\Users\sheil\.wetscan-sentinel\s04-h04c-b2-provision-live-4f1d7a92c3b84e6fa0e15d7b8c2a9e31`

New private offline evidence:
`C:\Users\sheil\.wetscan-sentinel\s04-get400-diagnosis-5c2e9b1d7a4f4e08b3a6d91f0c7e2a54`

## Root cause: NOT_CONFIRMED (narrowed to one code path)

The live request is `GET http://localhost:3000/api/sentinel/projects/github-998736528/rules?ruleId=7ad1deb8-e555-44ec-be98-b7def574781d`
(`scripts/sentinel-provision-auth.ps1`), sent by `scripts/sentinel-session-get.ps1`
with `HttpWebRequest`, `AllowAutoRedirect=false`, and the `wetscan_session`
cookie from a `CookieContainer` (path `/`, scoped to the request URI). No
Origin, Content-Type or custom headers are sent; Host is `localhost:3000`.
The route is `src/app/api/sentinel/projects/[projectId]/rules/route.ts`
-> `detectionRoute`. `src/proxy.ts` only matches `/app/*` and `/account/*`, so
no middleware touches `/api/sentinel/*`. A GET performs no Origin check.

For this exact (valid) request the route can return HTTP 400 only through the
`AuthError` default status of 400 reached from `authorizeCanvasProject`:

| Code (`failure()` body) | Source |
| --- | --- |
| `github_oauth_error` | `tokenRequest`: GitHub's token endpoint answered the refresh with an `error` body or no `access_token` |
| `github_invalid_request` | `githubHttpError`: GitHub answered HTTP 400 to the token or API call |

Malformed query, bad rule UUID and the other TelemetryError 400s
(`invalid_query`, `invalid_id`) are impossible for the fixed query, which the
new test feeds through the actual route and which succeeds. A 401 is the
status for missing, unknown or malformed cookies, so this was not an invalid
cookie. The route swallows server-side errors without logging, and Next.js
stdout/stderr held only the Ready banner, so no server-side record of the
specific code exists. The response body was not retained. Therefore the exact
code, and why GitHub rejected the refresh, are **not confirmed**.

## What differs from the successful contain-rule request

The request is identical: same path, query, helper cookie transport, origin and
local environment. The one material difference found is token age. The only
stored session record was last written at 2026-11-16 00:09:58 (the successful
contain-rule run, using a token issued by the 23:21 sign-in). At 12:59 and
13:56 the stored GitHub user token had expired (auth-state diagnosis: user token
expired at attempt time, refresh token present). The contain-rule GET
therefore never exercised the refresh path; both provisioning GETs did. The
record has not been rewritten since, so neither provisioning attempt persisted a
refreshed token.

## Offline reproduction

`tests/sentinel/provision-get-400.test.ts` drives the real `detectionRoute`,
session store, `authorizeCanvasProject` and `userToken`. Only global `fetch`
(GitHub), the app-installation JWT call and the DB store are doubled; no network
is used.

- The exact URL parsed from the runner passes with a fresh token and makes no refresh call.
- A foreign Origin or forwarded-host header does not affect a GET.
- Missing/unknown/malformed cookies: 401 `unauthenticated`.
- Malformed queries: 400 `invalid_id` / `invalid_query` (not the provisioning request).
- Expired token + refresh answered with an OAuth error body: **400 `github_oauth_error`** for the valid request; nothing persisted.
- Expired token + refresh answered with HTTP 400: **400 `github_invalid_request`**.
- Expired token + good refresh: 200 and rotated tokens are persisted.
- Expired token + refresh without a refresh token: 401 `github_expired`.
- Hazard demonstration: a successful refresh followed by any later GitHub failure
  persists nothing, so GitHub's single-use rotated refresh token is lost and the
  stored old one is stale.

This reproduces a valid-request HTTP 400 deterministically through the actual
code. It cannot establish that this is what happened live.

## Change made

Only `scripts/sentinel-session-get.ps1` (diagnostics). On an HTTP >= 400
response it reads at most 2048 bytes once, parses JSON, and records `errorCode`
only if the `error` string is in a fixed allowlist of route error codes;
otherwise `unlisted_error_code` or `unavailable_error_code`. Raw bodies, HTML,
headers, cookies and exception text are never retained. Status, strict scope
checks, CookieContainer transport, redirect refusal and the no-retry rule are
unchanged. `tests/sentinel/session-powershell.test.ts` covers allowlisted,
unlisted, HTML, empty, oversized and non-string bodies, 401/403 codes, exact
key set, no body or cookie leakage, one request per call, and no code for
redirect/parse failures.

The approved runner `Invoke-H04CB2ProvisionAndIngest.ps1` is unchanged (SHA-256
`95a8c786c7dac4b94f74bc9bf655d720eee536665d63837a5a280de7568471da`).
The helper is part of the reviewed input manifest, so a new review manifest
was generated; the previous manifest (`365d1080...`) is preserved unmodified and
must not be used with the changed helper.

No application authentication code, database mutation budget, approval gate or
historical preservation check was altered.

## Not fixed deliberately

- Refreshed tokens are persisted only at the end of `authorizeCanvasProject`; a
  failure or process stop after a successful refresh loses a single-use refresh
  token. This is a real application hazard but was not shown to have occurred,
  and changing authentication code is outside this minimal fix.
- The helper's 5-second client timeout could end a request while a refresh is
  in flight, after which the runner stops the server. Not shown to have
  occurred (the live request answered in 2.3 s).

## Next safest action

Do not rerun provisioning. Owner re-authentication (a fresh interactive sign-in
that writes a new session and cookie) removes the need for any token refresh
and is the most likely remedy if the stored refresh token is dead. It changes
the pinned cookie/session files, so it needs a new review manifest. A
separately authorized, read-only authentication diagnostic (temporary APP-only
Next.js and the same single GET using the improved helper) would reveal the
`errorCode` but performs a GitHub refresh itself; it is not run here. S04
remains IMPLEMENTED_PENDING_ACCEPTANCE.

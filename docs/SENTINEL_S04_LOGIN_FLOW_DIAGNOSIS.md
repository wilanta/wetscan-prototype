# S04 login initiation diagnosis and targeted offline repair

Prepared 17 November 2026. No OAuth, provider request, authentication write,
application startup, database connection or runtime approval was performed.

## Confirmed defect and historical limits

`Login.login` in `src/components/auth/login.tsx` calls `authFetch` with the
relative URL `/api/auth/github/start` and JSON `{intent: "login"}`. The helper
uses POST, JSON content type and same-origin credentials. The real start route
requires the configured origin, creates a new flow, saves it, sets the cookie
and returns JSON `{url}`. The client then navigates using
`window.location.assign`; it does not fetch the GitHub authorization page.
`startFlow` binds the callback to `APP_URL`, creates state and PKCE, and requires
no GitHub API request for initial login. The reviewed origin and callback are
`http://localhost:3000` and `http://localhost:3000/api/auth/github/callback`.
Cross-origin CORS permission is not required for this same-origin request.

The installed Next webpack dev server calls `getVersionInfo` during preparation.
That function unconditionally attempts a fetch of
`https://registry.npmjs.org/-/package/next/dist-tags`, catches failure and normally
continues with version staleness `unknown`. The restricted host installed its
OAuth-only fetch guard before preparation. With no callback yet, this request
was rejected and the host durably marked the entire OAuth window failed.
Disabling telemetry does not disable this separate version-information check.

An offline call to the actual installed `getVersionInfo`, with fetch replaced
by the original policy behavior, reproduces exactly one blocked operation,
zero OAuth starts/callbacks/exchanges/identity calls, and a failed-window event.
No network or Next server is involved. Historical filesystem timestamps also
place the failed-window receipt before the READY receipt. This confirms the
startup integration defect. Historical receipts did not retain the triggering
URL or request trace; this reproduction is not a recovered historical trace.

The frontend also exposed native fetch errors directly and assumed every HTTP
response was JSON, while the restricted host returned plain-text rejections.
A stopped/unreachable server can therefore display `Failed to fetch`; a
plain-text rejection can produce a JSON parsing error. The exact browser request
and transport condition behind each historical click remain NOT_CONFIRMED.
The preserved READY receipt identifies the reviewed host PID and origin; no
browser network trace independently proves which instance served each click.

## Minimal correction

- During Next preparation only, answer the first exact, default-options npm
  version-information fetch with a local HTTP 503 response. Nothing is sent to
  npm. Next uses its existing `unknown` fallback. The exemption does not accept
  other URLs, options, methods, subsequent probes or probes after preparation.
  Its receipt counter is `offlineVersionProbes`; unrelated operations still
  fail closed. OAuth exchange and owner checks retain their original behavior.
- Extract the existing fetch adapter into `createAuthWindowFetch` for offline
  integration tests. Keep the real network call behind the same OAuth policy.
- Latch a real policy failure, reject subsequent flow admission, and stop
  preparation if another forbidden operation occurred. Record fixed source and
  operation categories without URLs, queries, headers, bodies or raw errors.
- Return JSON `auth_window_stopped` for host rejections. Map transport failures
  and unreadable responses to sanitized, actionable UI messages without retry.

The login handler, OAuth routes, state/PKCE checks, cookie attributes, encrypted
store, session rotation, archive exception, validators, ACL requirements and
15-minute deadline are unchanged. The two production source changes are the
restricted host and frontend error handling; no authentication records change.

## Offline evidence and next authorization

Evidence is in
`C:\Users\sheil\.wetscan-sentinel\s04-login-flow-repair-902d1328b49747a4bd70dc2a896fd420`.
`startup-reproduction.sanitized.json` records the original failure reproduction.
Affected tests exercise the actual login onClick, real start route and installed
Next version-information function with mocked network and in-memory session
dependencies. They cover redirect/callback/PKCE, origin rejection, denied
providers/refresh/repeats, owner/token checks, redaction and actionable errors.
Static-check and test receipts record actual results separately.

Preserve the consumed window's NOT_VERIFIED receipts and original manifest.
Any successor manifest must explicitly account for the two authorized source
changes and the already permitted Next-generated `next-env.d.ts` change. Do not
use the former manifest as if it still matches current source. No manifest
reconciliation or source repair authorizes another OAuth attempt.

Before a fresh owner-controlled window, bind the reconciled procedure, host,
validator, candidate selection and configuration; repeat the same historical,
ACL, no-runtime, archive-absence and before-state backup guards. A new explicit
single-use OAuth grant remains necessary. Real browser/provider behavior is
NOT_RUN by this repair. The four residual risks remain: unknown deletion cause,
unverified repository access, no permanent revocation ledger, and the unresolved
refresh-persistence hazard. Refresh remains prohibited in this recovery window.

Overall S04 remains IMPLEMENTED_PENDING_ACCEPTANCE. Offline authentication remains
ACCEPTED_OFFLINE_WITH_DOCUMENTED_RESIDUAL_RISKS, and Phase 0 remains
ACCEPTED_BY_OWNER_ADJUDICATION_WITH_DIAGNOSTIC_EXCEPTION.

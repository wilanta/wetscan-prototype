# Authentication and onboarding

The implementation follows the existing Next.js App Router, React, internal UI components and CSS. No dependencies, database schema, dashboard components, git branches, commits or remotes are changed.

## Server configuration

Set these variables in your deployment's secret manager or local environment. No example values or credentials are included in the repository.

| Variable                 | Requirement                                                                                                             |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| APP_URL                  | Exact public application origin; HTTPS in production; localhost HTTP allowed for development.                           |
| AUTH_SECRET              | At least 32 random bytes/characters of high entropy, stable across restarts. Used for AES-256-GCM encryption at rest.   |
| AUTH_DATA_DIR            | Absolute writable directory outside the project, outside any public web root; private to the app OS user and backed up. |
| GITHUB_APP_ID            | Numeric GitHub App ID.                                                                                                  |
| GITHUB_APP_SLUG          | App slug from github.com/apps/<slug>.                                                                                   |
| GITHUB_APP_CLIENT_ID     | GitHub App client ID (not an OAuth App).                                                                                |
| GITHUB_APP_CLIENT_SECRET | GitHub App client secret; server only.                                                                                  |
| GITHUB_APP_PRIVATE_KEY   | RSA PEM from the GitHub App; literal newlines or escaped backslash-n accepted; server only.                             |

Never prefix these with NEXT_PUBLIC_. Use HTTPS and restrictive directory ACLs on Windows. Do not put AUTH_DATA_DIR under a Laragon or other public web root.

## GitHub App settings

1. Create a GitHub App with repository permissions Metadata read and Contents read. The installation token explicitly requests both at read level, including when the app has broader grants. Existing installations must approve permission changes.
2. Set **Setup URL** to APP_URL/api/auth/github/callback.
3. Set **User authorization callback URL** to the same APP_URL/api/auth/github/callback.
4. Leave **Request user authorization (OAuth) during installation** OFF. Setup first redirects to WetScan; WetScan then explicitly requests GitHub App user authorization with a fresh state and PKCE. Do not register a separate OAuth App.
5. Enable expiring user access tokens (supported with refresh tokens). Choose account installation availability according to your deployment. Enable Redirect on update so changes to an existing installation or its repository selection also return to WetScan.
6. Webhooks are not consumed by this implementation; disable webhook delivery unless a separate backend already handles it.
7. Install on a test account and explicitly select test repositories. Organization installations may require owner approval.

Installation flow: workspace -> verify configured App ID/slug/client ID and permissions using GET /app -> GitHub App installation -> setup callback (state, installation ID and setup_action=install/update) -> verify app installation using App JWT -> GitHub App user authorization -> OAuth callback -> verify the installation belongs to this app and is accessible to this user -> mint short-lived installation token using an RS256 App JWT -> list installation repositories and intersect with user-accessible repositories -> revoke temporary installation token -> select repositories -> email/preferences -> existing /app dashboard.

An untrusted installation_id alone is never accepted as authorization. Token exchange, private key signing, API calls and token refresh run exclusively on the server. No tokens are sent to the browser. GitHub errors are mapped to fixed messages without logging upstream secrets.

## Sessions, progress and route protection

Opaque 256-bit session IDs are stored in HttpOnly, SameSite=Lax, host-only cookies (Secure over HTTPS). Only a SHA-256 digest indexes session records. Sessions expire after seven days; callback success rotates IDs; POST logout deletes the server record and cookie. State expires after ten minutes and is consumed once. Mutations require the exact configured Origin. There is no arbitrary return URL. Starting a flow extends an active session to cover the new state lifetime, and the installation-to-OAuth response reissues the same HttpOnly/Lax cookie.

Encrypted per-user records retain workspace, GitHub identity, verified installation ID, selected repositories, email and preferences after logout/restart. Anonymous drafts use the session record. Steps are saved on Continue; partial account input autosaves after 600 ms. Refresh resumes the last saved step. Existing users who completed onboarding go directly to /app after login.

src/proxy.ts protects all /app and /account routes, including deep links and RSC requests. Every protected API handler separately validates sessions and permissions. /onboarding and /login are public entry points; /account provides sign out without modifying dashboard UI. Landing links to the account page. /demo still redirects to the existing /app and therefore now requires authentication.

## Storage and operating limits

Because the project has no database or auth provider, this implementation uses encrypted files in an explicitly configured external directory. No existing database schema is changed. Writes are atomic and auth operations are serialized within one Node process. Run ONE persistent Node server with durable storage; this store does not coordinate multiple processes/replicas or serverless ephemeral disks. Production scale needs a shared transactional auth store, which requires a separate approved architecture/schema change.

Session expiry is enforced on every read, and expired records are removed when accessed. Schedule separate operational cleanup of old session files if required; idle expired files are not automatically swept. Losing AUTH_SECRET prevents decrypting existing records; key rotation requires a migration. User tokens are encrypted at rest, refreshed on use, and installation access is revalidated for repository listing/selection/completion. Logout removes the local session; it does not uninstall or revoke the GitHub App grant.

Email is a notification preference, not a verified login identity. Email verification, delivery, scans, webhooks, team invitations, multiple-workspace membership, and connecting repository selections to the existing demo dashboard are outside this Auth/Onboarding implementation. Dashboard content remains unchanged and explicitly demo data.

## Verification

Run npm run typecheck, npm run lint, npm test, npm run build and the focused tests/e2e/auth-onboarding.spec.ts plus tests/e2e/github-installation.spec.ts browser suites with a running local server. Security tests stub GitHub responses only inside tests; no runtime mock integration exists.

Local validation: TypeScript, ESLint and production build passed; 40 unit tests passed; 4 focused browser tests passed in installed Microsoft Edge, with no axe accessibility violations at 1440 and 390 pixels. Browser tests accept AUTH_TEST_BROWSER_CHANNEL=msedge, AUTH_TEST_BASE_URL (default 3107) and AUTH_GITHUB_TEST_BASE_URL (default 3108). Production validation used tests/auth/skip-dotenv.cjs in NODE_OPTIONS to prevent reading .env files, including in Next workers.

The legacy dashboard E2E suite was not run: it assumes public /app routes and the old GitLab/demo onboarding. It needs authenticated fixtures and updated onboarding expectations before use against the protected app. Dashboard source remains unchanged.

Live verification still requires real GitHub App credentials and installation. Check both new and existing installations, cancellation, owner approval, denied/revoked grants, private repositories, pagination, user-token expiry/refresh, logout, restart persistence and a returning completed user.

## Diagnosing a redirect back to GitHub

The installation URL is https://github.com/apps/<GITHUB_APP_SLUG>/installations/new?state=<one-time-state>. GitHub chooses its post-install redirect from the registered App settings. Adding redirect_uri to this installation URL is not a replacement for a Setup URL; redirect_uri is sent only for OAuth authorization and token exchange.

Check GitHub App settings manually (they cannot be verified from local source or the GET /app response):

- Setup URL: <APP_URL>/api/auth/github/callback. Use the WetScan URL, not the GitHub App public page or Homepage URL.
- User authorization Callback URL: exactly the same WetScan callback.
- Request user authorization (OAuth) during installation: OFF for this explicit setup-then-OAuth implementation.
- Redirect on update: ON, including when reconnecting an already-installed app or changing repository grants.
- APP_URL must match the browser origin, including scheme, hostname and port. Do not switch localhost and 127.0.0.1 mid-flow. HTTP is supported only on local development hosts; production must use HTTPS.
- All App ID, slug and client ID values must belong to the same GitHub App, and the actual installation must grant Metadata Read and Contents Read.

A browser staying on GitHub without ever requesting the WetScan callback points to App settings, an update without Redirect on update, or a different App slug. These are configuration hypotheses until the actual redirect chain is inspected. The supplied settings report Setup URL and Callback URL both http://localhost:3000/api/auth/github/callback, OAuth during installation OFF, and Redirect on update ON; those reported settings match this flow. The runtime APP_URL, browser origin and registered App identity have not been inspected through .env or secrets, and no live GitHub configuration has been changed.

Server-side callback warnings contain only a fixed reason, stage (session/state/installation/authorization/identity/repositories/session_rotation), flow kind and parameter-presence booleans. They deliberately omit the full error object, message/stack, request URL, query values, code, state, cookie, user identity, installation ID, access tokens and secrets. A session-stage invalid_state with cookiePresent=false indicates cookie/origin continuity must be checked; state-stage failures indicate expired/mismatched state. Warnings are emitted for failures only; absence of a warning does not prove the handler was not reached. Use HTTP request logs (path only) to distinguish no callback from a successful callback.

The incompatible automatic OAuth-on-install callback is reported as github_setup_misconfigured instead of discarding its code. Wrong App configuration is rejected before redirect; inaccessible/suspended installations and missing Contents permission are rejected before OAuth. The verified user's access is checked again after OAuth before binding the installation to the account.

Regression coverage includes setup_action=install/update, app ownership, exact OAuth callback URL and PKCE verifier, session renewal and rotation, replay/malformed/cookie-less callbacks, read permissions and safe error logging. tests/auth/github-fixture.mjs is an explicitly gated, test-only preload used on the isolated 127.0.0.1:3108 server; it replaces GitHub network responses only for E2E. The browser test inspects the actual setup handler OAuth redirect and substitutes only the provider consent result while preserving the response session cookie. Production application source does not import it, and E2E success does not prove a live GitHub installation.

Sources:

- https://www.aikido.dev/
- https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/about-the-setup-url
- https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app
- https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-an-installation-access-token-for-a-github-app
- https://docs.github.com/en/rest/apps/installations

## Existing installation discovery

The onboarding Install GitHub App action first verifies any stored installation with both the App JWT and the current GitHub user token. Without a valid user authorization it starts OAuth with a fresh state and PKCE verifier, then calls GET /user/installations (paginated). One accessible installation is verified and linked automatically. Multiple installations are displayed as choices; their display metadata is kept in the encrypted session so a reload preserves the choice screen. Every submitted ID is revalidated with the App and user APIs, including IDs that were not in the displayed list. Zero installations proceeds to the new-installation URL with a separate one-time state.

The Setup URL handles both setup_action=install and setup_action=update. It verifies the installation against the App, issues fresh OAuth state, checks the user identity and installation membership, and then links the installation. A 303 alone is not proof of connection: tests also assert persisted connected progress and the actual repository selection UI/API. Existing installations never require navigating to GitHub settings or using browser Back. If a user separately edits repository access in GitHub settings and GitHub does not invoke the Setup URL, WetScan cannot turn that Save into a callback. Existing connections can refresh repository grants from the existing Refresh repositories control; no Back-based completion logic was added.

GitHub errors distinguish expired user authorization, invalid App authentication, permission denial, rate limiting, missing resources, validation failures, invalid provider responses and OAuth errors. Callback diagnostics retain only fixed error codes and presence flags. No provider response bodies, authorization headers, codes, state values or credentials are logged.

Run the focused browser regression suite with:

```sh
node tests/auth/run-github-e2e.mjs
```

The runner disables dotenv loading with tests/auth/skip-dotenv.cjs, builds the application, starts isolated production servers on 127.0.0.1 ports 3107, 3108 and 3109, and runs auth-onboarding.spec.ts, github-installation.spec.ts and github-existing-installation.spec.ts through Playwright. The ports must be unused. Microsoft Edge is the default installed browser; AUTH_TEST_BROWSER_CHANNEL can select another installed Playwright channel. Each server has a separate temporary encrypted Auth store and generated test-only configuration, removed on exit.

Only the 3109 server preloads tests/auth/github-existing-fixture.mjs via Node --import, guarded by WETSCAN_GITHUB_EXISTING_E2E=1, the exact test origin and a temporary-store path. It cannot affect the previous E2E suites on ports 3107/3108. The previous installation regression retains its assertions and uses an isolated pre-install OAuth identity before exercising the existing setup callback. These are provider-substituted E2E tests, not proof of a successful live GitHub installation. No new deployment environment variables, dependencies or database schema are required.

The Windows Auth store retries only transient EPERM/EACCES errors during atomic rename, with five bounded backoffs (380 ms total). It never deletes the prior record to replace it; permanent failures leave that record intact and still return a server error. Internal request diagnostics expose only fixed route/error categories and allowlisted filesystem operation/error codes.

## GitHub App signing-key failures

A local OpenSSL ERR_OSSL_UNSUPPORTED from appJwt occurs before GET /app, OAuth, or installation discovery: the configured key cannot be decoded for JWT signing. It previously escaped as HTTP 500 server_error. The backend now parses a PEM RSA private key explicitly and maps unsupported, malformed, encrypted-without-passphrase, or non-RSA keys to HTTP 503 github_app_key_invalid. Callback errors preserve the same safe configuration code. Raw OpenSSL exceptions and key material are never returned or logged.

GITHUB_APP_PRIVATE_KEY supports PEM with actual LF/CRLF line breaks, escaped \n, or escaped \r\n. Whitespace around the PEM and one matching pair of transport quotes are removed; double-escaped newline sequences are normalized before parsing. Base64 blobs, file paths, and placeholders are not valid values for this variable; there is no implicit private-key file loading. Correct invalid key material through the local secret configuration and restart the server. Do not paste credentials into diagnostics or reports. Existing state, PKCE, session cookies, and installation/user-access verification are unchanged.

The fixed signing diagnostics distinguish missing_pem_header, missing_pem_footer, unsupported_key_type and pem_decode_failed without printing any key input. A header-only value is incomplete and must not be repaired by inventing key bytes or skipping verification. For multiline dotenv configuration, enclose the entire PEM (including matching BEGIN and END lines) in one pair of double quotes, or use escaped newlines inside a quoted value. See https://nextjs.org/docs/app/guides/environment-variables#loading-environment-variables. Check configuration precedence locally if an edited value is not the value used by the server; do not paste key contents into diagnostics.

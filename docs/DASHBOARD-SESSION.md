# Dashboard session integration

The dashboard shell consumes the existing GET /api/onboarding public profile. It does not add an auth provider, endpoint, database schema, credential storage, or GitHub request. The existing proxy remains authoritative for /app and its deep links.

The workspace switch displays the saved workspace and selected-repository count. The existing sidebar profile and topbar avatar open an account dialog containing the saved GitHub username, email, workspace, and repository selection. The profile does not store a full display name or avatar URL: the username is used as the account name and initials are explicitly labeled as an avatar placeholder. No avatar service or generated image URL is used. Existing dashboard projects, findings, scans, notifications, and demo behavior remain unchanged.

Missing or malformed public-profile fields are projected into explicit placeholders. If the display request fails, the protected dashboard remains usable with unavailable account details and a retry control. A confirmed unauthenticated/incomplete response redirects to login/onboarding. A browser history restoration or window focus rechecks the same endpoint; display fallback never bypasses server route authorization.

Logout calls the existing POST /api/auth/logout, whose server-side session deletion and cookie clearing are unchanged. Its successful response redirects to HTML and is not parsed as JSON. After success, a full navigation replaces the current page with /login and clears in-memory dashboard state. Failed logout leaves the account intact, shows a safe error, and permits retry.

Validation:

```sh
npm test
npm run typecheck
npm run lint
node tests/auth/run-github-e2e.mjs
```

The existing runner builds with dotenv disabled and runs Auth/Onboarding plus dashboard-session.spec.ts on isolated local servers with generated fixture credentials. Dashboard browser cases complete the real onboarding endpoints against the isolated GitHub provider substitute. They cover saved profile data, mobile layout and accessibility, unavailable fields, failed display requests and retry, failed/successful logout, revoked-cookie replay, deep-link protection, and history restoration. No production data is mocked by dashboard application code.

## Shared repository state in Overview

AppShell calls useDashboardAccount once and passes its existing account/status/actions to main content through DashboardAccountProvider. This is a React presentation context, not a second Auth provider, repository store, or request source. Overview consumes useDashboardAccountView; both its repository count and the sidebar use the same normalized account.repositories array.

For an available nonempty selection, Overview displays the actual count and first saved fullName, plus the number of additional entries. View repositories and View list open the existing account dialog containing all saved repository names. Long names are truncated visually with their full value in the title and dialog. For an available empty selection, Overview shows 00 and the existing Connect repository link. Loading, failed, or missing repository data displays -- and a loading/retry action rather than assuming an empty selection. Retry refreshes the shared state for both sidebar and Overview.

The existing Connect repository destination remains /onboarding. This patch does not add an additional-repository flow for completed accounts, change onboarding redirects, or relabel the demo project/map as a real repository. Findings, incidents, demo controls and other dashboard features remain unchanged.

Browser coverage includes one saved repository through the real isolated onboarding endpoints, controlled empty/multiple view fixtures, loading, malformed/missing repository data, shared retry updates, and responsive handling of long names. Fixtures exist only in tests; production repository names always come from the existing profile endpoint.

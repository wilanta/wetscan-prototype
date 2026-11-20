# Guard G04 provider setup (owner actions)

Written for: the repository owner. Everything here changes settings that only an owner can change (GitHub App, repository rules, Vercel project). G04 code never changes them silently, and no step below was performed by an agent. Observed state on 20 November 2026 is in [GUARD_G04_VALIDATION.md](GUARD_G04_VALIDATION.md).

## 1. GitHub App (`wetscan-local` or the production App)

Observed through the App JWT (read-only) on 20 Nov 2026: permissions `contents: read`, `metadata: read`; **no** `checks`; subscribed events **none**; webhook **not configured** (`GET /app/hook/config` → 404); one installation (`wilanta`, selected repositories).

Required for G04:

| Setting | Value | Why |
| --- | --- | --- |
| Repository permissions → **Checks** | Read and write | publish/update Check Runs (only a GitHub App can) |
| Repository permissions → Contents / Metadata | Read-only (already set) | source snapshots, repo identity |
| Repository permissions → Administration | Read-only (optional) | lets Guard *observe* classic branch-protection required checks. Rulesets are observable with Metadata alone |
| Subscribe to events | **Push**, **Pull request**, **Check run** | `installation` / `installation_repositories` are delivered to Apps automatically |
| Webhook → URL | `https://<public host>/api/guard/webhooks/github` | must be reachable from GitHub; localhost needs a tunnel you control |
| Webhook → Content type | `application/json` | `x-www-form-urlencoded` is rejected (415) |
| Webhook → Secret | a random value ≥ 32 bytes | same value in `GITHUB_APP_WEBHOOK_SECRET` |
| Webhook → SSL verification | enabled | |

After saving, the **installation owner must accept the new permission request** (GitHub → Settings → Applications → Installed GitHub Apps → *Review request*). Until then GitHub keeps issuing tokens without `checks: write`; Guard detects this (`permissions_missing`, check `INCOMPLETE`) and never falls back to a personal token.

Rotation: put the new secret in `GITHUB_APP_WEBHOOK_SECRET`, the old one in `GITHUB_APP_WEBHOOK_SECRET_PREVIOUS`, update GitHub, then drop the previous value.

Verify after setup (all read-only): *Guard Live → CI/CD Gate → Re-verify GitHub App access* shows `checks:write true`; GitHub's App page → *Advanced* → *Recent deliveries* shows `200/202` for a `ping`.

## 2. Required-check rule (merge enforcement) — owner decision

Publishing a check blocks nothing. To make GitHub refuse merges until Guard passes, an owner must add a **ruleset** (or classic branch protection) on the protected branch requiring the status check **`WetScan Guard / Security gate`**. Do this first on a dedicated test branch/repository, never on production. Guard will *observe* the rule (CI/CD Gate tab → "Required-check rule on protected branch") and report `NOT required` until it exists. G04 never creates or edits rules.

Verification of actual blocking: open a pull request into the protected test branch with a vulnerable commit, confirm the merge button is disabled with the failed required check, then push the fixed commit and confirm it becomes mergeable.

## 3. Runtime environment

```
GUARD_G04_ENABLED=1                       # off by default; off = webhook 503, UI "disabled", nothing scans
GITHUB_APP_WEBHOOK_SECRET=<secret>        # never committed
GUARD_VERCEL_TOKEN_FILE=<abs path>        # or GUARD_VERCEL_TOKEN; never in the database or the UI
APP_URL=https://<public host>             # used for check "details" links
# plus the existing G02 runtime: GUARD_PRODUCT_ENABLED=1, GUARD_PRODUCT_CONFIG_FILE, GUARD_DB_{APP,WORKER}_{APPROVAL,PASSWORD}_FILE
```

The product runtime config (server-owned, `GUARD_PRODUCT_CONFIG_FILE`) must list every branch G04 may scan, exactly or with one trailing wildcard (`"main"`, `"release/*"`, `"feat/*"`). A pull-request head branch that is not allowed there is **not scanned** and the check is INCOMPLETE. Database: run `npm run guard:g04:migrate` as the migrator role once (own ledger, idempotent).

Start the dispatcher beside the app: `npm run guard:g04:dispatcher`. It is the only process that scans, evaluates and publishes.

## 4. Vercel

Read-only verification works with any token that can read the project and deployments. Docs checked on 20 Nov 2026:

* Deployment Checks "hold each production deployment until all required checks pass before assigning it to your custom production domains" (`/docs/deployment-checks`). They gate **alias/promotion of production**, not deployment creation or the build, and **Force Promote bypasses them**.
* Creating a project check: `POST /v2/projects/{id}/checks` with `blocks: deployment-alias | deployment-promotion | build-start | deployment-start | none`, `targets`, and `source: {kind: git-provider, provider: github, externalCheckName}` to import a GitHub check run.
* **Not confirmed from the public docs:** which Vercel plans include Deployment Checks and whether the git-provider `source.kind` string matches the request schema exactly. G04 therefore does not assume either: the registration endpoint is only ever called after explicit confirmation, and any 4xx is reported as a provider limitation, not as enforcement.

Steps: (1) create a Vercel token (team scope) and expose it as above; (2) CI/CD Gate → Deployments → enter the Vercel project id (`prj_…`) and team id; Guard refuses a project linked to a different GitHub repository; (3) use *Verify deployment (read-only)*; (4) **only after you approve**, type `REGISTER_VERCEL_DEPLOYMENT_CHECK` to register the check (`deployment-alias`, production). Use a dedicated test project, never the production project for demonstrations.

## 5. Approval gates that G04 will not cross

Changing App permissions/events/webhook, creating repository rules, adding provider credentials, registering a Vercel check, promoting/rolling back/redeploying anything, merging, deploying to production.

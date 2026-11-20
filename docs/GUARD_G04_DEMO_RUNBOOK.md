# Guard G04 demo runbook

Written for: the presenter on 21 November 2026. Everything below was rehearsed on 20 November 2026 against the real sandbox repository `wilanta/wetscan-g02-acceptance` (rehearsal log in section 11). Never run it against anything but that sandbox. Nothing here merges a pull request or touches `main`.

## 0. What the audience sees

```
push vulnerable code ─► GitHub webhook ─► WetScan (HMAC check) ─► durable trigger ─► 5 scanners in sandboxed containers
        ─► policy decision BLOCK ─► GitHub Check Run "WetScan Guard / Security gate" = failure ─► GitHub ruleset refuses the merge
push clean code      ─► ... ─► PASS ─► Check Run success ─► GitHub allows the merge
(optional) WARN      ─► ... ─► Check Run neutral ─► GitHub allows the merge, findings stay visible
```

Real time from push to verdict: **about 4-5 minutes** (five engines, OSV is the slow one). Plan the talk around that, or use the pre-built PRs (section 8).

## 1. Fixed demo objects (do not delete)

| What | Where |
| --- | --- |
| Sandbox repo | https://github.com/wilanta/wetscan-g02-acceptance |
| Ruleset (only `g04/gate-test-target`) | https://github.com/wilanta/wetscan-g02-acceptance/rules/27707416 |
| PR #2 **VULNERABLE** (`g04/gate-vuln`) | https://github.com/wilanta/wetscan-g02-acceptance/pull/2 |
| PR #3 **CLEAN** (`g04/gate-clean`) | https://github.com/wilanta/wetscan-g02-acceptance/pull/3 |
| PR #4 **WARN** (`g04/gate-warn`) | https://github.com/wilanta/wetscan-g02-acceptance/pull/4 |
| G04 pull request | https://github.com/wilanta/wetscan-prototype/pull/20 |
| Recorded evidence (real GitHub, not a live scan) | `docs/acceptance/guard-g04/demo-evidence.json` |

PR #2/#3/#4 are titled "do not merge". The demo never merges them: GitHub's own merge state is the proof.

## 2. Start everything (T-20 min)

Run in the G04 worktree (`c:\Users\sheil\OneDrive\Dokumen\Wildhan\projects\wetscan-guard-g04`, branch `feat/guard-g04-cicd`). **Close browsers/IDE you do not need first**: the scanners need ~2 GB of free RAM headroom (the readiness check prints it).

```bash
# 2.1 database (already running if `docker ps` lists wetscan-g04-local-pg)
docker start wetscan-g04-local-pg

# 2.2 environment references (no secrets printed) + app (production build, light on RAM)
source scripts/guard-g04-env.sh
npx next build --webpack                      # only if the code changed since the last build (about 1-2 min)
npx next start --hostname 127.0.0.1 --port 3000 &       # webhook route: POST /api/guard/webhooks/github

# 2.3 dispatcher under the supervisor (restarts itself and repairs a wedged scanner lock)
npm run guard:g04:dispatcher:supervised &

# 2.4 tunnel (skip if the cloudflared window is already running)
cloudflared tunnel --url http://localhost:3000
```

**Tunnel URL check (it changes every time the tunnel restarts).** Compare the `https://…trycloudflare.com` URL that cloudflared prints with the GitHub App webhook URL:

```bash
node --conditions=react-server --env-file=.env.local --import ./scripts/server-only-stub.mjs --import tsx scripts/guard-g04-hook-info.ts   # prints the configured URL
```

If they differ, set the new one (GitHub → Settings → Developer settings → GitHub Apps → wetscan-local → General → Webhook URL = `https://<new>.trycloudflare.com/api/guard/webhooks/github`; keep the secret). Then `set G04_TUNNEL=https://<new>.trycloudflare.com` for the helper below.

## 3. Scanner qualification (valid for ONE hour)

G02 only runs scanners whose sandbox was measured in the last hour. Renew whenever the readiness check shows < 20 minutes (about 4 minutes, quiet machine):

```bash
node scripts/guard-g04-requalify.mjs          # writes a new private runtime root + config
# then restart the dispatcher so it picks up the new root:
#   stop the supervisor window (Ctrl+C), `source scripts/guard-g04-env.sh`, `npm run guard:g04:dispatcher:supervised`
```

## 4. Readiness check (T-10 min and again T-2 min)

```bash
node scripts/guard-g04-demo.mjs check
```

Every line must be `OK`. Expected `FAIL`s you can live with: none. If `free RAM` fails (< 600 MB), close applications (the most common cause of scanner timeouts; 1500+ MB is comfortable). Expected PR lines: `#2 failure / BLOCKED`, `#3 success / CLEAN`, `#4 neutral / CLEAN`.

## 5. Demo A - BLOCK (the proof that matters)

1. `node scripts/guard-g04-demo.mjs push vuln` - a real commit lands on `g04/gate-vuln` (PR #2 head moves). Show the PR #2 page: the check `WetScan Guard / Security gate` is **in progress** and the merge box says merging is blocked.
2. Optional, while waiting: `node scripts/guard-g04-demo.mjs try-merge` - GitHub answers HTTP 405 *"Required status check … is in progress"* (even pending checks block).
3. After ~5 min refresh PR #2: check = **failure** (`BLOCK: 6 blocking, 8 warning`), merge box red. Click the check → *Details*: decision, exact commit, engines completed, counts, link to the evidence. 
4. `node scripts/guard-g04-demo.mjs try-merge` - GitHub answers HTTP 405 *"Repository rule violations found. Required status check "WetScan Guard / Security gate" is failing."* and `merged: false`. That sentence is the proof of enforcement.

## 6. Demo B - PASS

`node scripts/guard-g04-demo.mjs push clean` (or open PR #3, which already holds a completed real PASS). After ~5 min: check = **success** (`PASS: 0 blocking, 0 warning`, all five engines completed), merge box green ("Merging is allowed"). **Do not click Merge.**

## 7. Demo C - WARN (optional)

```bash
node --conditions=react-server --import ./scripts/server-only-stub.mjs --import tsx scripts/guard-g04-policy.ts warn      # only critical blocks
node scripts/guard-g04-demo.mjs push warn
# ~5 min later: check = neutral (WARN), merge allowed
node --conditions=react-server --import ./scripts/server-only-stub.mjs --import tsx scripts/guard-g04-policy.ts default   # ALWAYS restore
```

Each policy change is an audited revision. Or simply open PR #4 (a completed real WARN).

## 8. Check re-request (optional, 5 min)

On any PR page: Checks tab → `WetScan Guard / Security gate` → **Re-run**. GitHub sends `check_run.rerequested`; WetScan queues a re-scan and updates the SAME check run. Clicking several times while one is queued is coalesced into one scan.

## 9. Three-to-five-minute sequence (live)

| Min | Say / do |
| --- | --- |
| 0:00 | Start `push vuln` (section 5.1). Show PR #2: check in progress, merge blocked. |
| 0:30 | Whiteboard the pipeline from section 0: signed webhook → durable queue → 5 sandboxed scanners → policy → Check Run → GitHub ruleset. Stress: *scanners never run inside the HTTP request; missing coverage is INCOMPLETE, never PASS*. |
| 2:30 | Show PR #3 (CLEAN, success, mergeable) and PR #4 (WARN, neutral, mergeable) as completed real runs from earlier today. |
| 4:00 | Refresh PR #2: failure. Run `try-merge`: the 405 refusal text. |
| 4:30 | One honest limit: enforcement of *merging* is GitHub's ruleset; a published check alone blocks nothing. Vercel production hold is built but not yet verified (no provider token). |

## 10. Sixty-second emergency sequence (no scanning needed)

```bash
node scripts/guard-g04-demo.mjs status        # the three PRs: failure/BLOCKED, success/CLEAN, neutral/CLEAN
node scripts/guard-g04-demo.mjs try-merge     # GitHub refuses the vulnerable PR
```

Open PR #2 (red), PR #3 (green), PR #4 (grey/neutral). Then open `docs/acceptance/guard-g04/demo-evidence.json` and say: *"This file is the recorded evidence read from GitHub at <capturedAt>; it is a recording, not a live scan."* Refresh it any time with `node scripts/guard-g04-demo.mjs evidence`.

## 11. Fallback material (clearly recorded, not live)

* `docs/acceptance/guard-g04/demo-evidence.json` - check run ids, conclusions, merge states of PR #2/#3/#4 read from GitHub.
* `docs/GUARD_G04_VALIDATION.md` - every verdict with scan ids, commits and timestamps from 20 November 2026.
* The PR pages themselves persist on GitHub (real runs from 20 November 2026).

Rehearsal on 20 November 2026: `push vuln` at 09:59:48Z → check `failure` at about 10:04Z (about 5 min) → `try-merge` refused with HTTP 405; while the check was still `in_progress` GitHub already refused the merge ("is in progress"). Same day: full-policy PASS (PR #3) and WARN (PR #4) from real pushes, a GitHub "Re-run" that reached a final verdict, and a dispatcher killed mid-scan that recovered by itself (VALIDATION).

## 12. Likely failures and recovery

| Symptom | Cause | Fix |
| --- | --- | --- |
| Check stays `queued`/`in progress` > 8 min | dispatcher not running, or scanner qualification expired | `node scripts/guard-g04-demo.mjs check`; start/restart the supervised dispatcher; renew qualification (section 3) |
| Check ends `INCOMPLETE` (action_required) | scanner timeout or wedged host. G04 already retried once; the verdict is honestly incomplete | close other apps, renew qualification, click **Re-run** on the check |
| Webhook deliveries show 404/502 in GitHub (App → Advanced → Recent deliveries) | wrong app on :3000, app down, or tunnel URL changed | section 2: start from THIS worktree; compare tunnel URL; redeliver the failed delivery from GitHub |
| 401 on deliveries | webhook secret mismatch | the secret lives in `.env.local` (`GITHUB_APP_WEBHOOK_SECRET`); it must equal the App's; do not export another |
| Scans fail instantly with `execution_not_ready` | G02 latched a quarantine / left a container lock | the supervised dispatcher repairs the lock and restarts itself within ~1-3 min; otherwise renew qualification and restart the dispatcher |
| `free RAM` FAIL | machine short of memory | close browsers/IDE; the scanners (OSV) need ~2 GB headroom |
| Everything is dead 10 min before the talk | - | use section 10 (no scanning needed) |

## 13. Safe shutdown

```bash
# stop the supervisor / dispatcher and app windows with Ctrl+C (or: Get-CimInstance Win32_Process ... guard-g04), then
docker stop wetscan-g04-local-pg          # optional; data is kept on its volume
```

Leave the ruleset, the PRs and the branches in place. Do **not** run `docker rm`/volume removal. Nothing in the demo needs `main` or production Vercel.

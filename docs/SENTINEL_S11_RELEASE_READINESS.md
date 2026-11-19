# Sentinel release readiness matrix (S01-S10, authored in S11)

One authoritative table. Vocabulary (never mixed): `IMPLEMENTED`, `FIXTURE_TESTED`, `DEV_ACCEPTED`, `CONFIGURED`, `LIVE_TESTED`,
`DEFERRED`, `NOT_INTEGRATED`, `NOT_RUN`, `BLOCKED`. **No package is `LIVE_TESTED`.** `CONFIGURED` means a real, owner-bound
configuration exists and was exercised; none of the activation blocks exist on `wetscan_dev`, so no capability is `CONFIGURED`
except the database platform itself (roles, migrations, approvals for runtime). Evidence IDs: see the
[register](SENTINEL_S11_EVIDENCE_REGISTER.md).

| Pkg | Capability | Status now | Re-executed in S11 | DB | Roles | Runtime activation needs | Not proven / blockers |
| --- | --- | --- | --- | --- | --- | --- | --- |
| S01 | PostgreSQL platform: queue, leases + fencing, outbox, approvals, health | `DEV_ACCEPTED` + **`CONFIGURED` on `wetscan_dev`** (migrated to 0009, runtime approvals, worker `--once` clean) | PG 14/14 (disposable), unit, DEV-PG E-DB-09..13 | 0001 | migrator/app/worker | approval file + marker + password files | health string `telemetry: not_implemented` stale; no production monitoring |
| S02 | Telemetry ingest, sources, credentials, replay | `DEV_ACCEPTED` (H02 controlled test on owner repo, historical) | S11 PG pipeline, replay/forgery, 12-route matrix, browser 5/5 | 0002 | app | owner-owned source + credential | historical live H02 not re-run; flood protection is process-wide pre-auth (R-4) |
| S03 | Detection rules, alerts, deterministic evaluation | `DEV_ACCEPTED` | pipeline A3-1/2, browser 6/6 | 0003 | worker | `SENTINEL_DETECTION_ENABLED` + approval block | not activated on dev DB |
| S04 | Incidents, append-only timeline, retention pins | `DEV_ACCEPTED` (owner acceptance 2026-11-18) | A3-1/2, A2-10, browser 3/3 | 0004 | worker | `SENTINEL_INCIDENTS_ENABLED` + block | historical gated PG suites not re-run (N-5) |
| S05 | Response: approval, apply, independent verify, TTL, rollback | `DEV_ACCEPTED` | PG 23/23 incl. real worker loop, browser 3/3 | 0005 | app/worker | `SENTINEL_RESPONSE_ENABLED` + block + adapter | **no real target**; `action_applied != neutralization_verified` honoured; production traffic blocking never exercised |
| S06 | Notifications: consent, isolated sender, retries, quiet hours | `DEV_ACCEPTED` | PG 22/22 + real notifier process, browser 6/6 | 0006 | notifier (+`CONNECT` grant, S11-F3) | notifier approval with one project, provider token files | **no real Telegram/Resend**; accepted != delivered; at-least-once duplicate risk documented |
| S07 | Ghost Lite controlled decoy, false-positive handling | `DEV_ACCEPTED` | PG 8/8 incl. real CLI process, browser 4/4 | 0007 | app | owner-controlled decoy + enabled rule | external staging target NOT_RUN |
| S08 | Case Library, provenance, DRAFT candidates, human review | `DEV_ACCEPTED` | PG 15/15, browser 8/8 | 0008 | app | none beyond migration | AI explanation port disabled (`NOT_CONFIGURED`) |
| S09 | Public advisories (CISA KEV, GHSA, OSV), lockfile inventory, potential exposure | `DEV_ACCEPTED` | PG 41/41 (offline), browser 10/10 | 0009 | worker | `SENTINEL_EXTERNAL_INTEL_ENABLED` + `externalIntel` block | **no live feed in S11** (one bounded smoke in S09 only); NVD `DEFERRED`; GRD-020 `NOT_INTEGRATED`; advisory != exploitation |
| S10 | Canvas CAN-008 overlay, live Overview, Reports/export, shared nav | `DEV_ACCEPTED` | PG 6/6, browser 26/26 (3 viewports, dark, keyboard, axe, print), Auth E2E 21/21 | none | app | project bound to a real GitHub repo | **real-session E2E NOT_RUN**; GRD-021 `NOT_INTEGRATED` |
| S11 | CI, matrices, secret scan, health fix, headers, runbook | `IMPLEMENTED` + `FIXTURE_TESTED` + `DEV_ACCEPTED` (database upgrade) | all of the above | none | - | - | CI execution status in register section F; H09 owner decision pending |

Cross-cutting:

| Topic | State |
| --- | --- |
| Original Orderly Demo | unchanged; 6/6 original walkthroughs + zero live API calls from demo routes |
| DEMO / LIVE / CONTROLLED_TEST | separated in routes (404 before identity), DB (`mode` scope), provenance (`origin`), UI (honest labels) |
| Guard live (GRD-020/021), WhatsApp, NVD, AI | `NOT_INTEGRATED` / `DEFERRED`; never presented as live |
| Persistent dev DB | upgraded and verified (E-DB); **not activated**; 8 queued + 1 failed historical jobs retained |
| Staging / production | do not exist; every production claim is `NOT_RUN` |

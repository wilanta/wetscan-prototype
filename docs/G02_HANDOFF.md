# G02 handoff — 19 November 2026 (continuation session)

Status: **PARTIAL — not COMPLETE.** Everything testable offline is now proven on real scanner CLIs; the one remaining acceptance gate (authorized real GitHub repository, vulnerable + fixed revisions, positive findings in Guard Live) needs a new owner approval. `GUARD_PRODUCT_ENABLED=0` untouched. No real GitHub scan, no replay of job `e3025169…`, no operational DB access, no commit/push.

## What this session did (all on branch `feat/guard-g02-g06-integration`, uncommitted)

The "uncommitted" work named in the previous handoff was already committed as `b7e740e`; the tree was clean at start. This machine had no scanner image, no `.local` build context, and no Docker daemon, so the physical evidence was rebuilt from public, checksum-pinned sources.

| File | Change |
|---|---|
| `worker/guard/installation/build-context.ts` (new) | Reproducible image build: 4 official release binaries (SHA256 vs `SOURCES.json`), official Opengrep JS/TS security rules at pinned commit `f1d2b562` (74 files), official Gitleaks config (pinned SHA), OSV npm snapshot, Trivy vulnerability DB (fetched by the pinned Trivy in a throwaway container), `docker build --network none`. Output only under ignored `.local/g02-install`. |
| `worker/guard/installation/Dockerfile` | Aligned with `commands.ts`: rules → `/opt/g02/rules`, Trivy DB → `/opt/g02/trivy-cache`. |
| `worker/guard/installation/commands.ts` | Removed the unverifiable "180 rules" claim (actual: 74, listed in `rules-manifest.json`). |
| `worker/guard/installation/measured.ts` | Reads manifests from the build context instead of a non-existent `.local/g02-completion-public`. |
| `worker/guard/installation/postgres-fixture.ts` | Docker path no longer hardcoded to another machine; uses `G02_INSTALL_DOCKER`. |
| `worker/guard/installation/persistence-fixture.ts` | Measured root via `G02_MEASURED_ROOT`; waits for PostgreSQL after restart (was ECONNREFUSED). |
| `tests/guard/live/measured.test.ts` | Real regression from `b7e740e`: fixture had `trivy-image` with the wrong executable and expected 5 deployments (now 6 incl. container). |
| `eslint.config.mjs` | Ignore all of `.local/**` (downloaded third-party rule clones produced 442 false errors). |

## Scanner evidence (real CLIs in the hardened sandbox, controlled synthetic files — not an owner repository)

Image `sha256:27c08e6ecaedb73fc2cfb2161fb34760606be7eedf3d08d81cd3e14247fc1f96` (python:3.13-slim-bookworm base digest `a5a7017e…`), report `.local/g02-install/physical-installation-report.9c174633-….json`. Sandbox controls all PASS: non-root, read-only root/source, no network, no capabilities/socket/secret env, seccomp, PID cap, noexec tmp; output-limit, timeout, cancel, OOM (137) and orphan identity tests PASS; owned cleanup verified.

| Engine | Version | Result |
|---|---|---|
| Opengrep SAST | 2.0.0 | 1 finding |
| OSV SCA / SBOM | 2.7.1 | 5 advisory matches (lodash 4.17.15); inventory 1; CycloneDX SBOM |
| Gitleaks | 8.30.1 | 1 finding, redacted |
| Trivy IaC | 0.76.2 | 3 findings |
| Trivy Container (digest-bound OCI archive, offline DB) | 0.76.2 | 6 findings |

Container/OCI: the verified blobs are staged as a directory `image.oci` and Trivy reads it with `image --input`; this works end to end. (The staging problem flagged as in-progress is resolved.)

## PostgreSQL + Live persistence (isolated PostgreSQL 18 container on a random port; never host 5432)

`node --import tsx worker/guard/installation/persistence-fixture.ts` (needs `G02_INSTALL_DOCKER`, `G02_MEASURED_ROOT`). Real broker → real Docker scanners → worker role → RLS-forced tables:

| Profile | Scan | Status | Findings | Engines |
|---|---|---|---|---|
| quick | 014c033b… | completed, rev 13 | 7 | sast, sca, secrets |
| standard | d98629e8… | completed, rev 17 | 10 | + iac, sbom |
| full | e85619fa… | completed, rev 19 | 16 | + container |

Also verified: durable queue state completed with attempt 1 and cleared lease; duplicate create coalesced; cross-workspace read returns null (RLS); triage + stale-revision rejection; report persisted; raw secret absent; records identical after PostgreSQL restart; fixture container/volume removed. Evidence: `test-results/g02-controlled-persistence.3f08a7d6-….json`.

## Quality gates (this machine, run serially)

- Guard unit/integration `guard-live-check unit`: **408/408**. Contracts: **516/516**.
- Lint **0 errors** (2 old warnings). Typecheck and production Webpack build **PASS** (after deleting a stale, gitignored `.next` built from another branch).
- Live browser (Edge, mocked API fixtures): **8/8** on rerun (first run 7/8; the one failure was a 60 s cold-start `goto` timeout).
- Full `vitest run` under load showed 8 failures; 7 are I/O-load flakiness (all pass in isolation), 1 is environmental: `tests/guard/evidence-retention.test.ts` fails here because `core.autocrlf=true` rewrites historical evidence files to CRLF (blob content in git is correct; `tr -d '\r'` reproduces the expected SHA256). Historical evidence was not modified. A `.gitattributes` `docs/acceptance/** -text` would remove this class of failure, but needs a re-checkout of those files, so it was not done unattended.

## Requirement status

| Requirement | Status |
|---|---|
| GRD-006 SAST | PARTIAL — 74 official JS/TS rules, positive + clean proven; real repo vulnerable/fixed pair not yet |
| GRD-007 SCA | PARTIAL — npm only; 5 real advisories; alias/fix metadata preserved |
| GRD-008 Secrets | PARTIAL — working tree only (no git history scan) |
| GRD-009 IaC | PARTIAL — Terraform proven; Kubernetes/Dockerfile cases untested |
| GRD-010 SBOM | PARTIAL — repository SBOM done |
| GRD-010 Container | PARTIAL (was BLOCKED) — digest-bound OCI path proven offline with a controlled fixture; no owner-authorized real image |
| Profiles / orchestration / limits / cancel / cleanup | DONE offline |
| Queue, RLS, persistence, restart | DONE on isolated PostgreSQL |
| Guard Live UI | DONE offline (mocked API browser tests) |
| Real GitHub → scanner → PostgreSQL → UI with positive findings | **BLOCKED on owner approval** |
| Transient auto-retry / authorized failed-job retry UI | NOT DONE (policy `maxAttempts=1`) |

## Remaining work and owner actions

1. Owner: approve one limited real run on the authorized test repository with a vulnerable and a fixed revision (SAST+SCA+Secrets+IaC), in the owner's legitimate process with real Auth and operational DB. This session could not do it: no owner OAuth session, no operational DB credentials, and the task forbids it without fresh approval.
2. Owner: if Container acceptance is wanted, supply a digest-pinned OCI archive + `image` scope in policy.
3. Engineering: transient-failure retry and authorized retry UI; Kubernetes/Dockerfile IaC fixtures; wider rule coverage; Trivy/OSV DB refresh procedure (databases are time-dependent; hashes are recorded in the manifests).
4. Rebuild on a new machine: `node --import tsx worker/guard/installation/build-context.ts .local/g02-install` (≈20 min, needs network; Trivy DB download is slow), then `qualify.ts … --full`, then `measured.ts <report> <private-root-under-%TEMP%>`. `secureSnapshotDirectory` only accepts new empty directories directly under `%TEMP%` (named `wetscan-g01-snapshot-*`); it failed once transiently on the slow machine (5 s icacls/PowerShell budget), succeeded on retry. Measurements expire after 1 hour.

## Known limits of the evidence

Controlled synthetic files, auth/provider/lease verification are explicit doubles in the fixture, and PostgreSQL is a throwaway container — none of this is owner-repository acceptance. The `handoff.ts` runner (single-engine Docker/broker path) still caps deployments at 5 and has no container case; the persistence fixture covers the container path instead. Do not start G03 from this evidence.

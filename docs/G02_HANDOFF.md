# G02 handoff — 19 November 2026 (completion campaign)

Written for: the engineer or owner who continues Guard after this PR, and who must know exactly what is proven and what is not.

**Status: PARTIAL — not COMPLETE.** Everything that can be proven without the owner's interactive GitHub login and the operational database is now `REAL_SCANNER_VERIFIED`. One acceptance gate is `NOT_RUN`: a scan started through the product (owner Auth session, operational `wetscan_dev_guardg02`, Live UI showing the stored result). `GUARD_PRODUCT_ENABLED` stays `0` by default; nothing in this work enables it.

## What changed in this package (branch `feat/guard-g02-completion`, based on master `8aa17b1`)

The old `feat/guard-g02-g06-integration` branch was 47 commits behind master. Only its 7 own commits (G01 foundation, scoped scanner adapter, operational integration, G02 engines) were ported, in order; two conflicts were resolved by keeping both sides (`next.config.ts`: S11 security headers + Guard file-tracing exclusions; `app-shell.tsx`: S10/S11 Sentinel navigation + Guard Live navigation). The local uncommitted work of the previous engineer was preserved first as a patch (`.local/snapshots/`) and a local commit (`snapshot/g02-continuation-20261119`).

| Area | Change |
|---|---|
| Master reconciliation | `GUARD_PLATFORM_BASELINE = "0003_detection"`: the Guard plan hash pins platform migrations through 0003. Without it Sentinel 0004–0009 changed the Guard plan hash, which would invalidate every existing Guard approval and the provisioned `wetscan_dev_guardg02` ledger (3 platform + 1 Guard). Fixture and plan script use the same baseline. Sentinel migrations are untouched. |
| IaC (found by the real GitHub run) | Trivy emits a clean per-module directory summary (`infra`). Only `.` was dropped, so any repository with Terraform below the root failed the whole IaC engine closed. Now any clean summary whose target is a *directory of the authorized manifest* is dropped; files, unknown/traversal targets and finding-bearing rows still fail closed. |
| Retry | New authorized **Retry** = a *new linked scan* of the same pinned commit (details below). Queue invariants unchanged. |
| Scanner image | `worker/guard/installation/build-context.ts` rebuilds the pinned scanner image reproducibly (checksum-verified binaries, 74 official JS/TS rules at commit `f1d2b562`, OSV npm snapshot, Trivy DB, `--network none` build). Dockerfile aligned with `commands.ts`. |
| Evidence/EOL | `.gitattributes`: `docs/acceptance/** -text` (historical evidence is hash-verified over exact bytes). `evidence-retention` verifies every tracked artifact byte for byte and tolerates at most 3 gitignored local-only artifacts. |
| Tests | `measured.test.ts` (6 engines, trivy-image executable), `s11-secret-scan` explicit 30 s budget (1.6 s alone, >5 s under worker contention), `retry.test.ts`, directory-summary test, Retry browser test. |
| CI | Browser job also runs Guard Live UI (mocked transport) and the Guard Demo regression. Required S11 jobs untouched. |
| Portability | `postgres-fixture.ts` no longer hardcodes another machine's Docker path; persistence fixture waits for PostgreSQL after restart. ESLint ignores `.local/**`. |

## Retry design (and what was deliberately not done)

The queue and every Guard layer assert `maxAttempts = 1` because the owner's GitHub authorization lives only in process memory: a second attempt of the *same* job cannot be reauthorized after a restart, and re-running a used attempt would blur lease fencing and cleanup evidence. Retry is therefore a **new job** created through the normal admission path:

- eligible: `failed`, no engine result, recorded diagnostic is transient (`source_timeout`, `source_unavailable`, `github_unavailable`, `github_rate_limited`, `execution_not_ready`), cleanup not `UNKNOWN`, depth ≤ 3, backoff elapsed (exponential, deterministic jitter, ≤ 60 s), same actor as the original request;
- fresh Auth/provider authorization + pinned-commit check + policy validation, exactly as for a normal scan; fixed idempotency key (`g02-live-retry-<scan id>`) so repeated clicks coalesce onto one retry;
- the failed job, its audit and its attempt rows are never modified; the new scan records `retry_of:<id>;depth:<n>`;
- terminal causes (authorization, integrity, limits, moved pin, unverified cleanup, unknown cause) are never retryable.

Not done: automatic background re-queueing of the same job (would need a durable, re-authorizable owner capability); this is a design limit, not an oversight.

## Evidence (all under `docs/acceptance/guard-g02/20261119/`)

| File | Proves | Does not prove |
|---|---|---|
| `scanner-installation.json` | Real CLIs in the hardened sandbox: image `sha256:27c08e6e…`, Opengrep 2.0.0 (1), OSV 2.7.1 (5), Gitleaks 8.30.1 (1), Trivy IaC 0.76.2 (3), Trivy Container 0.76.2 on a digest-bound OCI archive (6); non-root, read-only, no network/capabilities/socket/secrets, seccomp, PID cap, output/timeout/cancel/OOM/orphan, cleanup. | Owner repository scanning. |
| `physical-broker-handoff.json` | Real broker → Docker → parsers for SAST/SCA/SBOM/Secrets/IaC, vulnerable and clean (10/10); IaC covers Terraform + Kubernetes + Dockerfile (25 findings) and clean = 0. | Container (covered by next row); GitHub; PostgreSQL. |
| `postgres-persistence.json` | Isolated PostgreSQL 18, real scanners, Quick 7 / Standard 10 / Full 16 findings (Full = 6 engines incl. container), queue completed/attempt 1, duplicate coalesced, cross-workspace RLS read = null, triage, report, persistence after restart. | Real GitHub source. |
| `github-acceptance.json` | **Real GitHub source** (private repo `wilanta/wetscan-g02-acceptance`, id 1464294716), pinned vulnerable commit `c1330c63` → 34 findings (SAST 3, SCA 5, Secrets 1, IaC 25, inventory 1, CycloneDX SBOM), 5/5 engines completed, evidence commit = pin; fixed commit `3c6a99ec` → 0 findings (IaC coverage honestly `partial`, job `completed_partial`); none of the vulnerable finding ids survives the fix; real worker lease/fence, persistence across PostgreSQL restart, raw canary absent. | Product Auth session, operational database, Live UI showing this data. |

Container evidence uses a harmless controlled OCI fixture bound by digest; no owner-authorized real image exists.

## Not run / blocked (do not claim these)

1. **LIVE_REPOSITORY_VERIFIED through the product** — `NOT_RUN`. It needs the owner's interactive GitHub OAuth session in the app process and the operational DB password references (neither exists on the machine used here; they must not be fabricated). The earlier owner run `e3025169` proved the product pipeline up to zero findings; positive findings through that path are still unproven. The acceptance repository and harness are ready: `worker/guard/installation/github-acceptance.ts prepare|run`, and the repo is in the owner's account.
2. Live UI over real stored data — only mocked-transport browser tests exist.
3. Real container image acceptance, Kubernetes/Docker Compose beyond the fixtures, other ecosystems than npm, Git-history secret scanning (the authorized snapshot has no history; not attempted).
4. Staging/production: nothing executed.

## Rebuild on another machine

```
node --import tsx worker/guard/installation/build-context.ts .local/g02-install        # ~20 min, network, Docker
G02_INSTALL_DOCKER=<docker.exe> node --import tsx worker/guard/installation/qualify.ts .local/g02-install --full
# private root must be a NEW empty dir directly under %TEMP% named wetscan-g01-snapshot-*, ACL-secured by secureSnapshotDirectory
node --import tsx worker/guard/installation/measured.ts <report.json> <private-root>
G02_MEASURED_ROOT=<private-root> node --import tsx worker/guard/installation/persistence-fixture.ts
G02_MEASURED_ROOT=<private-root> node --import tsx worker/guard/installation/github-acceptance.ts run
```

Measurements expire after one hour. OSV (2 GB budget) is load-sensitive: a clean-variant SBOM run timed out at 45 s once while other processes ran; it passed alone. Do not run other work during physical runs.

## Next owner actions

1. Start the app in the owner process with the existing reviewed config, `GUARD_PRODUCT_ENABLED=0` during preflight; select `wilanta/wetscan-g02-acceptance` and pin `c1330c63…`, then `3c6a99ec…`; approve exactly those two runs; deactivate afterwards.
2. Decide whether container acceptance is wanted (needs an owner OCI archive + `image` scope).

Do not start G03 from this evidence; G03 must use real persisted findings from step 1. Continuation prompt: see `docs/agent-handoffs/HANDOFF_GUARD_G02.md`.

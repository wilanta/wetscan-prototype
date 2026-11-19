# Guard G02 release readiness — 19 November 2026

Written for: the owner deciding whether to enable Guard anywhere. Status vocabulary: IMPLEMENTED, FIXTURE_VERIFIED, REAL_SCANNER_VERIFIED, DEV_ACCEPTED, LIVE_REPOSITORY_VERIFIED, PARTIAL, NOT_RUN, NOT_CONFIGURED, BLOCKED.

**G02 overall: PARTIAL.** Merge of this package keeps Guard disabled (`GUARD_PRODUCT_ENABLED=0`, no scan route reachable without the flag and a qualified deployment).

| Requirement | Status | Basis |
|---|---|---|
| GRD-006 Opengrep SAST (JS/TS/TSX) | REAL_SCANNER_VERIFIED | Opengrep 2.0.0, 74 official JS/TS security rules (commit `f1d2b562`, hashes in `rules-manifest`); real GitHub revision → 3 findings with path/line/rule; fixed revision → 0. Not comprehensive Next.js coverage. |
| GRD-007 OSV SCA | REAL_SCANNER_VERIFIED | OSV 2.7.1 offline npm snapshot; lodash 4.17.15 → 5 advisories with aliases/fixed versions, inventory separate; 4.17.21/is-number → 0. Only npm. No reachability. |
| GRD-008 Gitleaks | REAL_SCANNER_VERIFIED | 8.30.1, redacted; canary found on real GitHub revision, absent on fix; raw value in no DB row/response. Working tree only (no git history). |
| GRD-009 Trivy IaC | REAL_SCANNER_VERIFIED | Terraform + Kubernetes + Dockerfile, vulnerable 25 findings / clean 0; nested-module bug found and fixed. No apply/build/cloud call. |
| GRD-010 SBOM | REAL_SCANNER_VERIFIED | CycloneDX from OSV inventory, bound to repo/commit/digest. npm only. |
| GRD-010 Container | FIXTURE_VERIFIED | Digest-bound OCI archive, Trivy image offline DB, 6 findings, Full profile persists them. No owner-authorized real image: NOT_RUN for a real artifact. |
| Quick / Standard / Full | REAL_SCANNER_VERIFIED | Isolated PostgreSQL 18: 7 / 10 / 16 findings; Full refuses to claim complete without container. |
| Durable queue, lease fencing, restart | REAL_SCANNER_VERIFIED | Real worker lease/fence/cleanup on PostgreSQL 18, state survives a database restart. |
| Retry | IMPLEMENTED + FIXTURE_VERIFIED | Unit + admission + browser tests; no real transient failure was induced against a live provider. |
| RLS / workspace isolation | REAL_SCANNER_VERIFIED | Cross-workspace read returns null on real tables with forced RLS. |
| Sandbox isolation | REAL_SCANNER_VERIFIED (controlled) | Non-root, read-only, no network, caps dropped, seccomp, PID/mem/CPU/output limits, timeout, cancel, OOM, orphan identity, owned cleanup. A container is not proof of safety for hostile multi-tenant code. |
| Guard Live UI | FIXTURE_VERIFIED | 9 browser tests with mocked API transport. Not evidence of a live scan. |
| Real GitHub source → scanner → PostgreSQL | REAL_SCANNER_VERIFIED | Private repo `wilanta/wetscan-g02-acceptance`, read-only REST, vulnerable `c1330c63` vs fixed `3c6a99ec`. Isolated PostgreSQL, not the operational DB; source access via the owner's `gh` login, not the product Auth/session broker. |
| Product session → operational DB → Live UI with a positive finding | NOT_RUN | Needs the owner's interactive login and operational DB credentials. |
| Staging / production | NOT_RUN | |

## Safe to enable?

- **One controlled development project, owner present:** yes after the NOT_RUN step above is performed once under the existing approval procedure (flag 0 → preflight → pin → exactly two scans → flag 0). The code path is the same one exercised by the acceptance campaign except the Auth/session broker and the database target.
- **Staging or production:** no. No evidence exists for the hosted topology, a serverless or multi-instance worker, real-image scanning, hostile-source isolation beyond the container controls, or data-retention at scale.

## Known limits

Rules are a reviewed subset; OSV/Trivy databases are point-in-time (hashes recorded) and need a refresh procedure; SAST, SCA and SBOM cover JS/TS and npm only; Kubernetes checks are Trivy's embedded ones; `Dockerfile` detection is by exact name; one scanner image build takes ≈20 minutes and a fresh measurement expires in one hour.

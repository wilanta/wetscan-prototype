# Guard worker boundary

fixture-runner.ts is a LOCAL TRUSTED FIXTURE harness, not a production worker. It only accepts two reviewed filenames, copies them to a verified temporary directory, verifies a pinned official binary checksum, disables metrics/version requests, uses a scrubbed environment, shell=false, time/output caps, abort and finally cleanup. It never executes target JavaScript. It cannot enforce Windows host network/CPU/memory/PID isolation and MUST NOT accept customer repositories or be invoked from Next routes.

Production adapter uses the typed SnapshotPort / ScannerPort / QueuePort / SandboxPort only after GRD-001/003/004/005. Strong isolation and egress control are mandatory. No dependency installation or automatic runtime binary download is implemented.

Opengrep binary provenance: https://github.com/opengrep/opengrep/releases/tag/v1.33.1 (LGPL-2.1; review distribution obligations before deployment). Synthetic rule pack below is project-owned and not an external mutable ruleset.

Additional trusted fixture adapters: gitleaks-fixture.ts and additional-fixtures.ts. OSV explicitly disables resolution/call analysis and queries official public advisory data for synthetic package metadata only. Trivy uses embedded checks with updates disabled; no Terraform execution. Neither has production outbound isolation. See docs/GUARD_TESTING.md for pins, evidence, licensing and exact setup/test commands.

orchestrator.ts composes already-authorized snapshot/storage/scanner/sandbox ports and is tested with injected fixture adapters. It does not start a daemon, create production queue leases, implement a sandbox, perform automatic retry or expose a management endpoint. Before production, the platform must enforce hard process-tree cancellation, CPU/memory/PID/egress budgets, crash-safe cleanup, global concurrency, idempotency leases, attempt/backoff limits and retention. These are GRD-003/004/005/022 dependencies, not implied by a ready boolean.

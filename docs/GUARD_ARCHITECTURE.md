# Guard architecture

Baseline: 1ed8457, clean master; implementation branch modul-guard. Scope is module-owned contracts, normalization, policy/evidence, controlled synthetic fixtures and minimal existing Guard presentation integration. Existing Auth, onboarding, dashboard, route dispatcher, Canvas and Sentinel remain unchanged.

The baseline has authenticated GitHub repository selection, but no authorized immutable snapshot, project/job grants, durable Guard storage, queue or isolated scanner worker. No public Guard API is exposed until those dependencies exist. A selected repository is not permission to execute its code.

Flow: trusted server grant -> authorized GitHub/GitLab snapshot port -> durable job/queue -> isolated worker -> validated/redacted normalization -> evidence storage -> policy/report -> optional Canvas/Intelligence/Sentinel ports. Demo memory refuses live scope. Missing integrations never count as completed coverage. Mode is part of grants, jobs, findings and evidence identity.

AI is disabled with deterministic guidance. No installation scripts, automatic patches/PRs, deployment enforcement or live DAST run from the web UI. No ZIP, arbitrary URL or user filesystem scan route exists. Reports evaluate only recorded scope and are not certification.

Production worker requirements: non-root, read-only source/root, dedicated credential-free process, pinned/checksummed tools and rule packs, CPU/memory/PID/time/output limits, DNS/IP/redirect enforcing egress, no host socket/cloud metadata/DB credentials, cancellation/cleanup and retention. Hostile multi-tenant source requires stronger VM/microVM isolation. Docker daemon is unavailable in this environment.

Trusted synthetic CLI verification is separate from customer jobs. The local harness may analyze only reviewed fixtures. It is not a production sandbox and is never exposed through Next routes. Unavailable integrations are tracked in INTEGRATION_BACKLOG.md.

Source product document: https://docs.google.com/document/d/1fYMWvxEhbuOlc4aAn8oEgVwX84RHmeD3jjyiw_TiO_E/edit

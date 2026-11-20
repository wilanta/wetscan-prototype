# WetScan Guard G05 Security Boundaries & Abuse Defenses

## 1. Outbound Network & SSRF / DNS Rebinding Controls

Implemented in `src/features/guard/g05/egress.ts`:
- **Protocol & domain enforcement:** External `staging` targets must use `https://`, must not specify an IP literal or URL credentials, and reject reserved/internal host suffixes (`localhost`, `.local`, `.internal`, `.test`, `.invalid`).
- **Pre-connect DNS & IP filtering:** Resolves all A/AAAA records via `dns.lookup(..., { all: true, verbatim: true })` and denies connection if **any** returned IP falls into loopback (`127.0.0.0/8`, `::1`), RFC1918 (`10/8`, `172.16/12`, `192.168/16`), CGNAT (`100.64/10`), link-local / cloud metadata (`169.254.0.0/16`, `100.100.100.200`, `fe80::/10`, `fd00:ec2::254`), benchmark/multicast/reserved ranges, NAT64 (`64:ff9b::`), 6to4 (`2002::`), or IPv4-mapped IPv6 (`::ffff:...`).
- **DNS rebinding defense:** Socket creation passes a custom `lookup` function bound to the single validated IP address and verifies `socket.remoteAddress === pinned.address` before reading response streams (`dns_rebinding_detected` on mismatch).
- **No proxy bypass:** Node `http`/`https` requests execute directly with pinned lookup and `connection: close`, ignoring implicit proxy hijacks.
- **Manual redirect inspection:** HTTP redirects are never auto-followed across origins or to private/metadata IPs; unvalidated `3xx Location` headers are recorded verbatim as DAST findings (`redirectOutOfScope`).
- **Local synthetic staging isolation (`local_synthetic`):** Arbitrary `127.0.0.1` scanning is forbidden by default. Loopback scanning requires `GUARD_G05_SYNTHETIC_TARGET_FILE` (or explicit pin env) matching both `allowedOrigin` (`http://127.0.0.1:4115`) **and** an authenticated `GET /healthz` response emitting the matching `x-wetscan-synthetic-target` identity header. Connecting to database ports such as `127.0.0.1:55436` fails before socket dispatch.
- **Runtime caps:** Enforces target `allowedMethods`, glob-checked `allowedRoutes`, `maxRequests`, `maxConcurrency`, token/spacing `rateLimitRps`, `maxResponseBytes`, per-request `timeoutMs`, overall run timeout, and `AbortSignal` cancellation.

## 2. Authorization, Grants & Fail-Closed Execution

- **Immutable revision & digest binding:** Updating a target increments `target.revision`, appends to `guard.g05_target_revisions`, and recomputes `targetDigest`. Prior grants referencing superseded revisions fail `verifyTargetAuthorization`.
- **Execution grant verification at enqueue & mid-flight:** `G05Service.enqueueRun` validates active status, future expiry (`<= 30 days`), category intersection, and local/HTTPS eligibility. The worker re-verifies the grant and run cancellation status **before every outbound HTTP request**.
- **No blind state-changing retries:** Any `TestPlan` containing state-changing cases (`stateChanging: true`, including all Integrity invariants) is admitted with `maxAttempts = 1` so expired/crashed workers fail closed (`worker_lease_expired_no_auto_retry`) rather than replaying mutations.
- **Default disabled:** When `GUARD_G05_ENABLED !== "1"`, mutating API routes fail closed with HTTP `503` (`g05_disabled`) and the UI renders an explicit `NOT CONFIGURED` banner.

## 3. Authenticated Accounts, Vault Sealing & Redaction

- **Synthetic accounts only:** Account usernames/labels matching production indicators (`production`, `prod.`, `live-customer`) are rejected.
- **AES-256-GCM credential sealing:** `sealCredential` encrypts credentials with a 256-bit key (`GUARD_G05_VAULT_KEY_FILE`) and context AAD `workspaceId|projectId|targetId|accountId`. Cross-project or cross-target unsealing fails GCM authentication (`vault_corrupt_envelope`).
- **Least-privilege DB separation:** `wetscan_guard_app` has no worker-queue functions and application handlers never call `loadSealedAccountsForWorker` or return ciphertexts. `G05TestAccountView` exposes only `credentialConfigured` and `credentialFingerprint`.
- **Secret stripping:** `redactG05Text`, `redactHeaders`, and `redactG05JsonValue` scrub bearer tokens, cookies, set-cookie headers, session IDs, passwords, and runtime account secrets across case evidence, findings, audit entries, and persisted JSON/HTML reports.

## 4. Database Tenant Isolation & Anti- Tampering

- Every G05 table in schema `guard` enforces `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY` with dual `USING`/`WITH CHECK` policies requiring `wetscan.module = 'guard'`, `wetscan.mode = 'live'`, `wetscan.workspace`, and `wetscan.project`.
- Neither `wetscan_guard_app` nor `wetscan_guard_worker` holds `DELETE`, DDL, `SUPERUSER`, or `BYPASSRLS` privileges.
- Next.js Route Handlers validate `authorizeGuardProject` (session + GitHub installation/repo ownership) and `requireOrigin` (CSRF) on every mutation, cap JSON requests at 128 KiB, and escape all HTML report output against XSS with strict `Content-Security-Policy: default-src 'none'`.

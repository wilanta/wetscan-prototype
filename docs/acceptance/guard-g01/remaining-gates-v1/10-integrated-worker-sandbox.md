# Plan 1 - integrated worker plus enforcing sandbox

Review-only cases Q00/I01; no runtime was executed. [Code gaps](code-gap-audit.json) GAP-01 through GAP-05 are local work, not external infrastructure failures.

## Minimum composition

Existing normal owner session -> fresh Auth/Canvas project authority -> strict new exact-job foundation_probe authorization -> real Guard queue/lease/fence -> source owner creates its immutable snapshot -> private capability invokes actual createDockerGuardSandbox for the same snapshot -> fresh authority/lease check -> owned container/root absence -> fenced audit and coverage. The child never receives a host source path, provider token or Auth-store access. No scanner, repository script/Dockerfile/build/package hook or G02 code executes.

Current prepareGuardJob never calls the sandbox and IPC only exposes resolve/acquire/dispose. Approval only recognizes prepare_only. Those are genuine missing composition/authority boundaries; a flag or a call to fixture-runner is not a repair. A new separately reviewed foundation_probe mode/capability must fail closed for every old prepare_only permit. It must be operator-only, hash-bound and exact-case scoped, without enabling public full-scan creation. Add only a truthful foundation_sandbox_verified preparation audit; do not mark any engine completed.

## Exact image and trusted program decision

The only real recorded image is docker.io/library/python@sha256:d76f585fb0d5107dd47143da5e61554fd9cae656a30f3470f815cb8475769b6a. Current production validation accepts ghcr.io references and fixed /usr/local/bin/guard-g01-probe or scanner binaries, so the old standalone Python harness cannot pass it. Preferred implementation proposal is a narrow G01-only exact-digest Python probe contract with /usr/local/bin/python3, -I/-B and a fixed server-reviewed program treated as data, never a general command/registry allowlist. Program bytes, argv, image executable existence, image ID/RepoDigest and every spec digest must be frozen before final approval. No image build/tag/push is proposed. An actually supplied compatible ghcr probe image would require a different exact review; no such image/digest is invented here.

The trusted probe reads only bounded /source files as bytes and emits counts plus a deterministic manifest digest, no source snippets/paths/secrets/findings. Parent compares that result with the same authorized snapshot manifest. No extra script may be inserted into or executed from the repository snapshot. Container source mount stays one read-only mount. Every root must be owner/SYSTEM-only (or verified POSIX owner permissions) before source writes and proven readable by UID65532 without broadening host access.

## Controls and attestation

Endpoint proposal is the previously observed explicit npipe:////./pipe/dockerDesktopLinuxEngine and absolute Docker CLI; current daemon ID/version/kernel are NOT revalidated in this planning pass. No ambient context or remote TCP/SSH daemon. On final materialization measure only selected version/ID/kernel and exact image identity. If unavailable, retain exact bounded probe result and stop; do not restart daemon or change contexts automatically.

Maintain CPU1, RAM/swap256MiB, PID64, user65532:65532, read-only root/source, network/IPC none, cap-dropALL, no-new-privileges, 16MiB noexec/nosuid/nodev tmpfs, scrubbed env, no socket or credential mounts, bounded output/time and owned cleanup. Verify actual inspect configuration before start and actual enforcement from the trusted program. Improve any missing runtime inspect/ownership checks before approval; driver doubles are not evidence.

Q00 is at most six trusted synthetic control containers. It is a technically justified qualification of the CHANGED production spec/program binding, not a repeat of the old accepted run. Preserve the old six results. Build an explicit applicability matrix for all15 sandboxControls and every final specDigest/daemon/image tuple. Reuse an old artifact only with an explicit valid applicability/age rationale; no restamping an expired record or converting synthetic unit evidence to PASS. If six probes cannot cover the new exact specs, stop and revise the scope/count packet instead of silently expanding it. Owner reviews actual artifacts before operatorSandboxEvidence is issued. It expires under its existing one-hour rule; do not manufacture a positive attestation in advance.

I01 then creates one NEW real job, one worker and one actual owned container, using the Q00-qualified spec on actual immutable GitHub source. This does not repeat the completed old job; it adds the previously absent container boundary. Prove same job/snapshot/spec/container linkage, fresh authority before/after, real leases/heartbeats and a fenced stored audit/coverage plus authenticated response. Physical absence of this exact registered container and root/own .lease is independently checked; public artifacts contain hashes/booleans only.

Budgets must be frozen as a new acceptance-profile contract, not silently change v3: suggested positive profile source45s/acquireRPC55s/probeRPC60s/handler120s/request180s, lease30s/heartbeat5s and Auth grant60s remain authoritative. Reauthorize at phase boundaries; longer outer budgets never prolong an old grant. Publish actual measured overhead before final approval; a timeout is a failure, not a reason to extend permits.

Packets: [Q00](approval-intents/Q00.json), [I01](approval-intents/I01.json). Both are NOT EXECUTABLE until code/program/spec/control artifacts are completed, tested, measured and included in NEW final execution packets with explicit owner approval.

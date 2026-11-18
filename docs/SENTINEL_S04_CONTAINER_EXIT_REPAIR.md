# S04 container inspection and exit-code repair

Prepared offline on 17 November 2026. Overall status remains
`IMPLEMENTED_PENDING_ACCEPTANCE`; the authentication milestone remains
`ACCEPTED_OFFLINE_WITH_DOCUMENTED_RESIDUAL_RISKS`.

The last preservation-audit procedure remains NOT_VERIFIED. It attempted no
database connection and created no audit approval. Its historical receipts and
all previous manifests remain unchanged.

## Infrastructure diagnosis

One explicitly authorized read-only diagnostic sequence completed in 2.186
seconds, with a five-second per-command limit and twenty-second shared budget.
The exact pinned Docker CLI and argument array reproduced inspect exit 1,
three stdout bytes and 224 stderr bytes. The retained sanitized signatures show
an error connecting to `dockerDesktopLinuxEngine` because Windows cannot find
the pipe. A separate read-only server-version command produced the same error
fingerprint. The current context is `desktop-linux`, its endpoint is the
expected Linux Engine named pipe, the executable matches its reviewed hash,
and neither DOCKER_HOST nor DOCKER_CONTEXT overrides is present.

WSL lists the Docker Desktop distribution as stopped. Host metadata observed
no Desktop/backend process, but that host command also emitted stderr; its
service/pipe fields are supporting, incomplete evidence, not an independent
successful health check. Docker's own error and the successful WSL/context
checks establish the current inaccessible engine endpoint. They do not prove
why Docker Desktop stopped, the container's current identity, or storage loss.
The historical inspection is consistent with this reproduction; its discarded
stderr cannot retrospectively establish that the same condition caused it.

No engine, container, service or distribution was started or stopped. No further
Docker diagnostics run during regression testing or default-off validation.

## Exit-code defect and repair

An offline fixture used the exact historical owner procedure with only its
entrypoint path/hash replaced by a synthetic script returning NOT_VERIFIED and
exit 1. Windows PowerShell 5.1 returned exit 0 for the enclosing `-File` process.
A nested script's `exit` sets LASTEXITCODE but the owner procedure had no
explicit final failure exit. The coordinator correctly returned 1; durable
receipts correctly remained NOT_VERIFIED. Receipt writing did not cause PASS.

The existing launcher now explicitly exits 0 on verified success and retains
its explicit failure exit. A new pinned owner-procedure template captures the
nested exit immediately, checks the expected status and failure fields, and
explicitly exits nonzero on any failure, missing output or contradictory
evidence. A new pinned outer-command template independently checks the native
exit and PASS evidence, rejecting even a child that incorrectly returns zero
with NOT_VERIFIED. Both templates preserve secret redaction and do not retry.
The package validator requires both templates as pinned dependencies.

Native diagnostics retain bounded stderr only in memory and emit only fixed
classifications for the pinned Docker executable: missing Linux Engine pipe or
container-not-found. Actual native exit code and byte counts remain distinct.
Raw stderr, messages, environment values and arbitrary classification strings
are never persisted. Primary failures remain separate from cleanup failures.

## Verification and authorization boundary

Synthetic infrastructure and real child PowerShell fixtures cover correct
identity, inspect failures with/without stderr, unavailable engine, wrong ID,
mount, volume or port, timeout, coordinator failure, receipt failure, cleanup
failure, and false-success outer exits. They make no database/provider call or
runtime approval. Tests use temporary fixtures; production has no mock flag.

The database audit runner/core, read-only session/transaction, fixed SQL,
one-connection limit, 120-second audit deadline, preservation algorithms,
archive-only exception, approval lifecycle and cleanup remain unchanged.
The existing five/twenty-second infrastructure bounds, thirty-second offline
validation and 210-second outer coordinator wait remain unchanged.

A new phase-specific manifest explicitly reconciles changed source hashes.
Historical private inputs and authentication records are verified before and
after. Original manifests and failed test/execution receipts are preserved.

Infrastructure recovery needs a separate bounded owner grant acknowledging
automatic container restart policies. After recovery, verify the exact existing
container/image/volume/binding against historical evidence without recreating
anything. A new database-audit execution grant is required afterward; no
consumed grant may be reused. This repair authorizes neither recovery nor a
live audit, authentication, provisioning, workers, migrations or publication.

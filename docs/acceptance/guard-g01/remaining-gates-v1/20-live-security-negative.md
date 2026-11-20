# Plan 2 - live security-negative acceptance

Cases N00-N08 are independent exact prospective scopes. All current test doubles/units remain useful; these cases add real Auth/DB/process/resource failure boundaries and are explicitly not yet executed. [Registry](case-registry.json) fixes ceilings; [approval index](approval-index.json) binds each review intent. A failed negative assertion is not a PASS merely because an HTTP error appeared.

## Deterministic control, without authority bypass

Implement private case/job/checkpoint-bound barriers and one-shot fault operands only in a separately authorized acceptance composition. No client-supplied scripts/paths/delays, global fake clocks, forged grants, disabled Auth, global heartbeat suppression or SQL lease editing. Each case uses an actual fresh existing owner grant and real clock. Preserve v3 and normal prepare_only behavior. Freeze helper binaries/programs and case resource registry before final approval. Log only safe phase/time/identity hashes; never log lease tokens/provider tokens or source bytes.

## Cases and pass evidence

|Case|Controlled trigger|Required independent result|
|---|---|---|
|N00|Missing/expired/mismatched control evidence against actual selected daemon|Three readiness denials before create; zero jobs/containers. Invalid evidence is a named negative operand, never positive authority.|
|N01|Owner normal logout after acquisition, before probe admission|Fresh resolver denial, no container/foundation success, source disposed. After normal owner re-login, one explicitly budgeted cancel may terminalize only this case residue. Never read/edit Auth files or uninstall the GitHub App.|
|N02|Normal same-origin cancel after exact owned container starts|Scan/queue/attempt cancelled, lease released, heartbeat stopped, no foundation success and actual owned absence.|
|N03|Real worker subpermit expires after90s during approved hold|No forward write after actual expiry; shutdown/cancellation and bounded owned cleanup under independently valid outer control/role authority. No edited expiry or auto-renewal.|
|N04|Actual minted60s grant held for>=61s before protected next action|authorize rejects the original expired grant before source/probe/write. No remint/substitute grant to force the negative result.|
|N05|Trusted hold exceeds exact1500ms container deadline|Actual native bounded stop/remove and safe error, no accepted foundation result; observer verifies lease/attempt/cleanup.|
|N06|Private source checkpoint waits for real45s AbortSignal after a partial write|Actual partial-root cleanup and source close, zero containers and no foundation success. Label LIVE_INJECTED_SOURCE_TIMEOUT, not an actual GitHub outage.|
|N07|One scoped container-removal boundary fails once|cleanup_failed must surface; no success. Only preapproved rescue on registered ID may remove it; never replay work or prune. Label the deliberate boundary injection.|
|N08|Actual owned-file handle denies delete sharing on Windows|Real filesystem deletion refusal surfaces; release only that handle and perform declared exact-root rescue. No content read, ACL change or marker rewrite.|

N01/N04 may leave a queued/preparing row after a safe denial; that is not silently considered terminal success. Preserve the failed attempt, then use only the one separately listed authenticated exact-job cancel if needed. Every case retains its rows and evidence, including deliberate failures. Expected codes/state/audit prefixes and absence criteria must be materialized from actual installed boundary behavior before final approval. Do not accept an arbitrary401/503 as sufficient proof or silently broaden the expected set after a surprise.

N01 affects the owner's current local session and may temporarily block other UI actions: the new approval must name normal logout/restoration explicitly. Normal user login restoration remains manual; no second Auth writer or credential export. Session revocation does not prove real GitHub App permission revocation. Provider-permission mutation is excluded by the no-GitHub-writes constraint; any requirement for it stays NOT_VERIFIED/BLOCKED_BY_SCOPE unless an already-denied authorized test target or new explicit scope is supplied.

For N03 the valid OUTER case control window is at most25minutes, while a declared worker subpermit is shortened on the real clock to90s from its actual activation, capped by the outer expiry. Begin only with sufficient remaining time. Work expiry prevents new source/probe/audit success. Independently explicit cleanup-only authority (maximum30s grace, owned resources only) may settle the case; it must never refresh grants or extend work. DB role/observer approvals remain separately valid so the test does not accidentally become a credential-reset exercise. This requires code review first, not editing old permits.

N04 can use the current120/180s acceptance outer budgets while actual grant TTL stays60s. N03 hold/timeout variants may require probeRPC90s/handler180s/request240s; exact values/argv/specs are review operands to freeze, never ambient flags. Negative branches must not create a successful scanner or foundation audit after authorization/cancellation/expiry loss. Source/root/container ownership and claim fences are checked before every effect.

Stop on the first unexpected fault/mismatch and capture scoped read-only evidence. Only declared expected failures plus their preapproved bounded rescue count as case execution. If rescue fails, retain the registered objects and report the concrete blocker; do not silently retry cleanup, delete historical records or continue later cases. New wall-clock windows need new approvals. There is no blanket approval for the eight new jobs.

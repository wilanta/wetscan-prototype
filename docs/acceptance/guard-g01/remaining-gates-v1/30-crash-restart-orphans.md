# Plan 3 - real crash/restart, fencing and orphan cleanup

Cases C01, C02A and C02B add actual process/DB/resource recovery. Existing queue tests and synthetic no-work process fixture must not be relabeled as real crash proof. All existing completed rows, including old job2c18db66, remain immutable acceptance references. Use only the registry's NEW case jobs and fresh normal owner authority on every start.

## C01: worker child crash

One enqueue, at most two worker launches/source acquisitions/containers, sequential. Register worker A PID, process creation identity, inherited IPC parent, exact job/case/worker ID and actual owned resource IDs privately. Abruptly terminate only that matching child at the approved post-acquisition checkpoint. Never kill by process name or touch Next/Auth parent, PostgreSQL, Docker daemon, Sentinel or unrelated Node processes.

Capture the interrupted attempt, final parent cleanup and actual last lease deadline. Wait past the REAL deadline; do not UPDATE lease_until, change clock or reuse a stale grant. A newly authorized B on this same NEW case job must claim with fence2. Before its work, replay one old opaque private lease capability at a fenced write boundary: actual DB must reject it and audit/revision hashes must stay unchanged. Lease tokens never leave the private controller. Observe the recovered attempt, heartbeats, physical non-overlap, truthful no-scanner outcome, exact owned cleanup and before/after preservation.

## C02A: owner app-parent crash and physical overlap denial

One enqueue, at most three declared starts A/B/C and two containers. This case requires explicit approval of owner-controlled downtime for only the verified sole candidate app process tree on port3000. Owner stops/restores it manually using the existing startup command; there is never a second Auth writer, session-store edit, daemon/service restart or unrelated process termination. Capture PID/creation/entry/cwd identity at execution, not invented now.

A begins a registered trusted hold container with a reviewed real deadline (at most120s) and owner-private snapshot registry, then parent dies abruptly. Source root/own .lease and container survive as registered case orphans. Restore the same single app with fresh existing-session authorization. After actual lease expiry, B attempts admission while the first container is still actually running: the enforcing composition must deny a second container even though SQL lease capacity is free. Manual sequencing alone is NOT physical-concurrency proof. Record B's denial/retry without foundation success. Then wait for the first container's actual deadline and use only approved case-ID/image/name/resource-ID verified cleanup; C may reclaim with fence3 and complete normally, with no overlap or stale writes. Three starts are a hard ceiling, not an automatic retry loop.

Recommended A-only outer ceilings are source45s/acquireRPC55s/probeRPC180s/handler240s/request300s, with real source45/grant60/lease30/heartbeat5 unchanged. A is intentionally killed before its old grant can justify any later success; B/C must reauthorize. C uses a short normal probe, not A's hold. Freeze timings in its own final packet; do not globally enlarge v3 or fake auth expiry.

The current module-wide reaper cannot be used directly. Before approval add a real case/job/run/spec/image/actual-ID registry and restrictive cleanup admission. No scan/delete of all Guard containers or all temp roots. Do not remove a container before its declared reaper deadline just to force the expiry test through; emergency rescue must be explicitly different and cannot close the expiry/reaper assertion.

## C02B: new window for actual-aged source orphan

The real source reaper checks both expiry and createdAt <= now-3600000. Keep one exact C02A source orphan in owner/SYSTEM-only private custody; raw source is not an evidence export. Record createdAt/expiry/root-name hash and ownership in a dedicated private case registry before the crash. Never edit an existing Auth store/private source journal or historical marker. Container orphan cleanup happens within A; source reaping remains pending.

Wait actual wall time until that root is at least one hour old. Window A is at most55minutes, so it cannot authorize the aged-source removal. Obtain NEW cleanup-only C02B approval (at most20minutes) binding the actual root registry digest, marker metadata, case/job and approved root. Revalidate metadata untouched, canonical temp parent, exact generated name, no symlink and private ACL. Invoke existing reapExpired on only that explicit root list; independently confirm root and its own .lease absent. No enqueue/worker/container, grant minting, backdating, fake Date.now, broad temp enumeration or historical .used deletion. If the age gate is unmet, return NOT_ELIGIBLE_YET, not PASS or an excuse to weaken the check.

This one-hour policy is a demonstrated code/time constraint, not evidence of a broken external service. Actual execution blockers must retain their concrete command/result, affected scope and permitted recovery, with no fabricated runs. [C01](approval-intents/C01.json), [C02A](approval-intents/C02A.json), [C02B](approval-intents/C02B.json) remain non-executable review intents until artifacts and fresh per-window permissions are ready.

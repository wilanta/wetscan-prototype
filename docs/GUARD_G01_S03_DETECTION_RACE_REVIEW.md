# G01 integration - S03 validation race review

## Current finalization status - 15 November 2026

See [GUARD_G01_FINALIZATION.md](GUARD_G01_FINALIZATION.md) for the current audit, implementation, test results and exact remaining approval checklist. Overall **PARTIALLY COMPLETE**, real acceptance **BLOCKED**. Latest user explicitly authorizes candidate commit/push despite the known baseline Sentinel failure; the earlier publication hold below is historical and superseded. No Sentinel fix/assertion edit, G02, real SQL/provider/worker/container operation, merge or deploy is performed. Current old Guard HEAD is92ee6fa, preserved; do not restore historical7207a16 state. New producer is prepare_only, lease getter is now forwarded, snapshot request mismatch/concurrency and sandbox identity/evidence boundaries are fixed; earlier descriptions of missing implementations describe their historical phase.


## Current user decision - NOT APPLIED

User explicitly chose: "Jangan ubah Sentinel; tahan commit/push dan laporkan blocker." The proposed patch below is retained for owner review only, not applied/staged. Deterministic synthetic diagnostic confirmed the race: validation error appears, initial loading clears it, invalid input remains, zeroPOST.1/1diagnostic PASS demonstrates the bug; it does not turn the original regression gate green. Original browser result59/60PASS,1FAIL; no publication. See GUARD_G01_S03_INTEGRATION_VALIDATION.md.


Status: PROPOSED ONLY / NOT APPLIED. First combined pass:59/60 E2E passed; S03 invalid-JSON error check failed. Original trace/context preserved outside Git before any rerun. No commit/push until the gate is resolved.

Source evidence: LiveDetection initial load is delayed150ms and calls setError(""); form JSON parse errors use that same error state. Submitting invalid JSON before initial loading runs can display then erase the validation message, despite unchanged invalid input and no POST. Guard source does not appear in this fixture path; the Sentinel component matches pinned master.

The proposed minimal change separates form validation state from request/load errors, keeps one accessible alert, and clears form validation on submit/edit/cancel. It does not change API, rule logic, Auth, schema, queue, assertions or deadlines. Add a Guard-owned ordering regression using the existing browser fixture. Original six Sentinel E2E cases stay unchanged. The deterministic ordering diagnostic is being run separately and is not counted as a regression PASS.

G01-Versi dari Will.md says: "Do not modify Sentinel implementation or its migration files." User approval for this one Sentinel UI exception is required before application. No Sentinel source has been written.

## Full proposed unified diff

```diff
--- a/src/features/sentinel/components/live-detection.tsx
+++ b/src/features/sentinel/components/live-detection.tsx
@@ -82,6 +82,7 @@
   const [rules, setRules] = useState<DetectionRule[]>([]),
     [page, setPage] = useState<AlertPage | null>(null),
     [error, setError] = useState(""),
+    [formError, setFormError] = useState(""),
     [loading, setLoading] = useState(true),
     [busy, setBusy] = useState(false),
     [refresh, setRefresh] = useState(0);
@@ -196,6 +197,7 @@
     }
   }
   function edit(rule: DetectionRule) {
+    setFormError("");
     setEditing(rule);
     setDraft(rule.definition);
     setConditions(JSON.stringify(rule.definition.conditions));
@@ -229,7 +231,7 @@
         labelled. A matched rule does not establish that an attack succeeded.
         Worker activation requires owner approval.
       </Notice>
-      {error && <p role="alert">{error}</p>}
+      {(error || formError) && <p role="alert">{[error, formError].filter(Boolean).join(" ")}</p>}
       <Button
         variant="secondary"
         disabled={busy || loading}
@@ -311,6 +313,7 @@
             <form
               onSubmit={(e) => {
                 e.preventDefault();
+                setFormError("");
                 try {
                   const config = {
                     ...draft,
@@ -328,7 +331,7 @@
                       : { action: "create", definition: config },
                   );
                 } catch {
-                  setError(
+                  setFormError(
                     "Conditions and suppression windows must be valid JSON.",
                   );
                 }
@@ -485,6 +488,7 @@
                   type="button"
                   variant="secondary"
                   onClick={() => {
+                    setFormError("");
                     setEditing(null);
                     setDraft(initial);
                     setConditions(JSON.stringify(initial.conditions));
```

# G02 final deactivation / persisted-record check

The one approved scan is terminal and resource cleanup is verified. No new scan authority remains. Qualification expired19November19:20:33; do not renew it to replay this job. Read-only history verification does not require scanner qualification.

The latest owner reply explicitly left actual flag0, Ready and post-restart verification unknown. Do not treat its template0 as a confirmed process value.

If flag0 and server Ready are already ACTUALLY verified, send that existing output and do not restart again. Otherwise, in the SAME legitimate owner terminal, stop only the known integration server normally with Ctrl+C (skip Ctrl+C if already stopped), then run:

```powershell
$env:GUARD_PRODUCT_ENABLED='0'
node -e "console.log(JSON.stringify({phase:'g02_owner_shutdown_flag',productEnabled:process.env.GUARD_PRODUCT_ENABLED==='0'?0:'UNKNOWN'}))"
npm.cmd run guard:dev
```

Preserve current directory/config/four DB references. Do not kill an unknown port3000 process. Send only the actual flag JSON and whether Ready appeared. No passwords, references/paths, headers or cookies.

Only after Ready, run once in the existing owner browser Console:

```javascript
void(async()=>{
 const r=await fetch('/api/guard/projects/github-839286157/scans/e30251691f7c628804b1cdce99fe9afbc87c121ba6fa83131ec92ef13d366e5b/view',{credentials:'same-origin',cache:'no-store',redirect:'error'});
 const b=await r.json();
 console.log(JSON.stringify({phase:'g02_post_deactivation_record',httpStatus:r.status,scanId:b.scanId,status:b.status,revision:b.revision,recordedFindingCount:b.findings?.length,sast:b.engines?.filter(e=>e.engine==='sast').map(e=>({status:e.status,scannedFiles:e.coverage?.scannedFiles})),releaseDecision:b.release?.decision,error:b.error}));
})().catch(()=>console.log(JSON.stringify({phase:'g02_post_deactivation_STOP',status:'UNKNOWN_NO_RETRY'})));
```

Expected stored result: completed_partial/revision7, Opengrep completed/11files,0 findings, release INCOMPLETE. If error/unknown report actual result; no scan retry or credential reset. No Start/Resume, cancellation, report/triage/database mutation, manual cleanup, G01/N01 actions or code changes.

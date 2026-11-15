import type { SqlPool } from "../../../src/platform/database";
import { bindGuardJob,type GuardJobBinding } from "../approval";
import { fingerprint } from "../../../src/platform/identity";
import type { StoredScan } from "../../../src/features/guard/live/model";
/** Independent actual row observer, dedicated READ ONLY transaction, no capability tokens in output. */
export async function observeCase(pool:SqlPool,b:GuardJobBinding,workers:string[]){
 const client=await pool.connect();try{
  await client.query("BEGIN READ ONLY");
  await client.query("SELECT set_config('wetscan.workspace',$1,true),set_config('wetscan.project',$2,true),set_config('wetscan.mode',$3,true),set_config('wetscan.module','guard',true)",[b.workspaceId,b.projectId,b.mode]);
  const key=[b.mode,b.workspaceId,b.projectId,b.jobId];
  const scans=(await client.query("SELECT job,revision,coverage FROM guard.scans WHERE mode=$1 AND workspace_id=$2 AND project_id=$3 AND scan_id=$4",key)).rows;
  const queues=(await client.query("SELECT state,attempts,fence,lease_until>clock_timestamp() AS lease_active,lease_owner IS NOT NULL AS has_owner,cancel_requested FROM platform.jobs WHERE module='guard' AND mode=$1 AND workspace_id=$2 AND project_id=$3 AND job_id=$4",key)).rows;
  const attempts=(await client.query("SELECT attempt,outcome,finished_at IS NOT NULL AS finished FROM platform.job_attempts WHERE module='guard' AND mode=$1 AND workspace_id=$2 AND project_id=$3 AND job_id=$4 ORDER BY attempt",key)).rows;
  const pulses=(await client.query("SELECT worker_id,status,last_seen_at>clock_timestamp()-interval '30 seconds' AS fresh FROM platform.worker_heartbeats WHERE module='guard' AND worker_id=ANY($1::text[])",[workers])).rows;
  const scan=scans[0] as StoredScan|undefined,queue=queues[0],latest=pulses.find(v=>v.worker_id===workers[Math.max(0,Number(queue?.attempts??1)-1)]);
  const bindingMatches=!!scan&&fingerprint(bindGuardJob(scan.job))===fingerprint(b);
  await client.query("ROLLBACK");
  return{bindingMatches,scanCount:scans.length,queueCount:queues.length,scanState:scan?.job.status??null,queueState:queue?.state??null,attempts:Number(queue?.attempts??0),fence:Number(queue?.fence??0),leaseActive:queue?.lease_active===true,hasLeaseOwner:queue?.has_owner===true,heartbeat:latest?.status??null,foundation:!!scan?.job.audit.some(v=>v.action==="foundation_prepared"),sandboxAudit:!!scan?.job.audit.some(v=>v.action==="foundation_sandbox_verified"),coverage:!!scan?.coverage,attemptHistory:attempts,heartbeats:pulses};
 }finally{try{await client.query("ROLLBACK");}finally{client.release(true);}}
}

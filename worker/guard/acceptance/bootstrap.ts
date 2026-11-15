import { ApprovedPool,PlatformDatabase } from "../../../src/platform/database";
import { guardMigrationPlan } from "../../../src/features/guard/live/migrations";
import { verifyGuardSchema } from "../../../src/features/guard/live/schema-readiness";
import { PostgresGuardStore } from "../../../src/features/guard/live/persistence";
import { GuardPostgresQueue } from "../../../src/features/guard/live/queue";
import { LiveGuardError } from "../../../src/features/guard/live/model";
import type { DurableJobPort,JobLease } from "../../../src/features/sentinel/platform-contracts";
import { validateWorkerApproval,type GuardWorkerApproval } from "../approval";
import { privateIpcPort } from "../ipc";
import { guardWorkerStorage } from "../storage";
import { runGuardWorker } from "../runtime";
import { prepareGuardJob } from "../prepare";
import { foundationResolver } from "./resolver";
import { validateExecution,type ExecutionPacket,type ExecutionApproval } from "./approval";
import { verifyArtifacts } from "./integrity";
import { caseDatabaseConfig } from "./database";
export interface AcceptanceBoot {packet:ExecutionPacket;approval:ExecutionApproval;permit:GuardWorkerApproval;slot:number;launchedAt:string}
export function validateBoot(boot:AcceptanceBoot){
 const {packet:p,approval:a}=validateExecution(boot?.packet,boot?.approval),permit=validateWorkerApproval(boot.permit,p.binding!,p.migrationPlanSha256);
 if(!p.binding||p.execution!=="foundation_probe"||!Number.isInteger(boot.slot)||p.workerIds[boot.slot]!==permit.workerId||permit.repositoryName!==p.repositoryName||JSON.stringify(permit.target)!==JSON.stringify(p.target)||Date.parse(permit.expiresAt)>Date.parse(a.expiresAt)||!Number.isFinite(Date.parse(boot.launchedAt))||Date.parse(boot.launchedAt)>Date.now()||(p.caseId==="N03"&&Date.parse(permit.expiresAt)>Date.parse(boot.launchedAt)+55000))throw new LiveGuardError("approval_required");
 return{p,a,permit};
}
/** Separate trusted child. Only purpose-worker credential loader; source paths/Auth stay in its parent. */
export async function startFoundationWorker(input:{boot:AcceptanceBoot;environment:Readonly<Record<string,string|undefined>>;control:NodeJS.Process}){
 const {p,a,permit}=validateBoot(input.boot);
 if(!input.control.connected||!input.control.send||input.environment.GUARD_ACCEPTANCE_LAUNCH!=="2")throw new LiveGuardError("approval_required");
 await verifyArtifacts(p);
 const plan=await guardMigrationPlan();if(plan.sha256!==p.migrationPlanSha256)throw new LiveGuardError("approval_required");
 const config=await caseDatabaseConfig(p,a,input.environment,"worker");
 const check=()=>{validateExecution(p,a);validateWorkerApproval(permit,permit.binding,plan.sha256);if(Date.parse(config.approval.expiresAt)<=Date.now())throw new LiveGuardError("approval_required");};
 check();const pool=new ApprovedPool(config),db=new PlatformDatabase(pool,true,"guard"),store=new PostgresGuardStore(db),queue=new GuardPostgresQueue(db,p.binding!,p.binding!.jobId),storage=guardWorkerStorage(db,permit.workerId),port=privateIpcPort(input.control);
 let initial:JobLease|undefined,current=()=>initial!,pulse:ReturnType<typeof setInterval>|undefined,pending=Promise.resolve(),ready=false;
 const remote=foundationResolver(port,()=>current(),p.caseId);
 const stop=()=>input.control.emit("message",{type:"guard.shutdown",version:1});
 const expiry=setTimeout(()=>{if(p.caseId==="N03")void port.send({type:"guard.acceptance.boundary",version:2,boundary:"permit_expired",expiresAt:Date.parse(permit.expiresAt),observedAt:Date.now()}).finally(stop);else stop();},Math.max(1,Math.min(Date.parse(permit.expiresAt),Date.parse(config.approval.expiresAt))-Date.now()));
 // Deliberate parent-crash case must not gracefully retry/release on lost IPC, masking lease expiry.
 const hardDisconnect=()=>input.control.exit(74);
 if(p.caseId==="C02A"&&input.boot.slot===0)input.control.prependOnceListener("disconnect",hardDisconnect);
 const gated:DurableJobPort={enqueue:async()=>{throw new LiveGuardError("approval_required");},cancel:async()=>{throw new LiveGuardError("approval_required");},claim:async v=>{check();const leases=await queue.claim(v);if(leases.length!==1)throw new LiveGuardError("execution_not_ready");initial=leases[0];return leases;},heartbeat:async l=>{check();return queue.heartbeat(l);},complete:async l=>{check();return queue.complete(l);},retry:async(l,f)=>{check();return queue.retry(l,f);}};
 try{await runGuardWorker({workerId:permit.workerId,control:input.control,once:true,handlerTimeoutMs:120000,scopes:async()=>{check();return[p.binding!];},queue:()=>gated,handler:async(_job,signal,getCurrent)=>{check();if(!initial)throw new LiveGuardError("lease_lost",409);current=getCurrent;await remote.claimed(signal);await prepareGuardJob(store,remote.resolver,initial,signal,getCurrent,p.limits.containers?remote.probe:undefined);},verifyReady:async()=>{check();await verifyGuardSchema(db,plan);await storage.heartbeat("running");ready=true;pulse=setInterval(()=>{pending=pending.then(async()=>{check();await storage.heartbeat("running");}).catch(()=>{stop();});},10000);},close:async()=>{if(pulse)clearInterval(pulse);try{await pending;if(ready)await storage.heartbeat("stopped");}finally{remote.close();await pool.end();}},report:event=>{void port.send({type:"guard.acceptance.event",version:2,phase:event.phase}).catch(()=>undefined);}});
 }finally{clearTimeout(expiry);if(pulse)clearInterval(pulse);input.control.removeListener("disconnect",hardDisconnect);remote.close();}
}

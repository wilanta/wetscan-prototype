import { readdir,readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ApprovedPool } from '../../../src/platform/database';
import { guardMigrationPlan } from '../../../src/features/guard/live/migrations';
import { GuardSnapshotAdapter } from '../../../src/features/guard/live/snapshot';
import { LiveGuardError } from '../../../src/features/guard/live/model';
import { CaseJournal } from './journal';
import { validateExecution,hash,type ExecutionPacket,type ExecutionApproval } from './approval';
import { regularJson } from './package';
import { caseDatabaseConfig } from './database';
import { alreadyAppliedOnly } from './schema';
import { reapRegisteredSource } from './reaper';
const check=(v:unknown)=>{if(!v)throw new LiveGuardError('execution_not_ready');};
export async function schemaCase(p:ExecutionPacket,a:ExecutionApproval,root:string,env:Readonly<Record<string,string|undefined>>){
 validateExecution(p,a);check(p.caseId==="L01");const journal=new CaseJournal(root,p,a),receipt=await journal.reserve("schema"),plan=await guardMigrationPlan();check(plan.sha256===p.migrationPlanSha256);
 const config=await caseDatabaseConfig(p,a,env,"migration"),pool=new ApprovedPool(config);
 try{const result=await alreadyAppliedOnly(pool,plan,config.approval);await journal.result(receipt,result);return result;}catch(e){await journal.result(receipt,{status:"failed_no_retry"});throw e;}
}
export async function cleanupSourceCase(p:ExecutionPacket,a:ExecutionApproval,root:string){
 validateExecution(p,a);check(p.caseId==="C02B");const files=(await readdir(root)).filter(n=>/^wetscan-guard-[a-f0-9-]{36}\.created\.json$/.test(n));check(files.length<=64);let bytes:Buffer|undefined;
 for(const file of files){await regularJson(join(root,file));const data=await readFile(join(root,file));if(hash(data)===p.cleanupReference!.registrySha256){check(!bytes);bytes=data;}}
 check(bytes);const journal=new CaseJournal(root,p,a),receipt=await journal.reserve("reap");
 const unavailable={authorize:async()=>{throw new LiveGuardError("approval_required");},open:async()=>{throw new LiveGuardError("approval_required");}};
 try{const result=await reapRegisteredSource(p,a,bytes!,new GuardSnapshotAdapter(unavailable));await journal.result(receipt,result);return result;}catch(e){await journal.result(receipt,{status:"failed_no_retry"});throw e;}
}

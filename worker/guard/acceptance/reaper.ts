import{readFile,lstat,realpath}from"node:fs/promises";import{join,dirname,basename,resolve}from"node:path";import{tmpdir}from"node:os";
import{GuardSnapshotAdapter}from"../../../src/features/guard/live/snapshot";
import{LiveGuardError}from"../../../src/features/guard/live/model";
import{eligibleSource,eligibleContainer,type ResourceRecord,ResourceRegistry,confinedSource}from"./registry";
import{validateExecution,hash,type ExecutionPacket,type ExecutionApproval}from"./approval";
import type{DockerDriver}from"../sandbox";
/** Window B accepts only actual immutable registration from window A, never caller-supplied roots. */
export async function reapRegisteredSource(packet:ExecutionPacket,approval:ExecutionApproval,registryBytes:Buffer,adapter:GuardSnapshotAdapter){
 const {packet:p}=validateExecution(packet,approval);
 if(p.caseId!=="C02B"||hash(registryBytes)!==p.cleanupReference?.registrySha256)throw new LiveGuardError("approval_required");
 const record=JSON.parse(registryBytes.toString()) as ResourceRecord;
 if(record.caseId!=="C02A"||record.jobId!==p.cleanupReference.jobId)throw new LiveGuardError("approval_required");
 const canonical=await confinedSource(record.source),adapterRoot=join(tmpdir(),basename(canonical));
 if((await realpath(adapterRoot)).toLowerCase()!==canonical.toLowerCase())throw new LiveGuardError("cleanup_failed");
 const path=record.source+".lease",s=await lstat(path);if(!s.isFile()||s.isSymbolicLink()||s.size>2048)throw new LiveGuardError("cleanup_failed");
 const marker=JSON.parse(await readFile(path,"utf8")),now=Date.now();
 if(!eligibleSource(record,marker,now))throw new LiveGuardError("execution_not_ready");
 const removed=await adapter.reapExpired([adapterRoot]);
 if(removed!==1)throw new LiveGuardError("cleanup_failed");
 for(const target of [record.source,path]){try{await lstat(target);throw new LiveGuardError("cleanup_failed");}catch(e){if((e as NodeJS.ErrnoException).code!=="ENOENT")throw e;}}
 return{sourceAbsent:true,actualAgeMs:now-record.createdAt,markerUnchanged:true};
}
export async function reapRegisteredContainer(record:ResourceRecord,registry:ResourceRegistry,driver:DockerDriver,configDirectory:string){
 const actual=await realpath(configDirectory),parent=await realpath(tmpdir());if(dirname(actual).toLowerCase()!==parent.toLowerCase()||!basename(actual).startsWith("wetscan-g01-docker-")||(await lstat(configDirectory)).isSymbolicLink())throw new LiveGuardError("cleanup_failed");
 const call=(args:string[])=>driver.call(args,{configDirectory:resolve(configDirectory),timeoutMs:5000,maxBytes:64000});
 const m=JSON.parse(await call(["inspect","--format","{{json .}}",record.name]));
 if(!eligibleContainer(record,m))throw new LiveGuardError("cleanup_failed");
 await call(["rm","--force",record.containerId!]);
 const left=(await call(["ps","--all","--filter","id="+record.containerId,"--format","{{.ID}}"])).trim();
 if(left)throw new LiveGuardError("cleanup_failed");
 const intent=await registry.current();if(intent.name!==record.name||intent.jobId!==record.jobId||intent.runId!==record.runId)throw new LiveGuardError("cleanup_failed");
 await registry.release(intent,true);return{containerAbsent:true};
}

import { readFile,lstat } from "node:fs/promises";
import { basename } from "node:path";
import { fingerprint } from "../../../src/platform/identity";
import { LiveGuardError } from "../../../src/features/guard/live/model";
import { validatePacket,hash,type ExecutionPacket } from "./approval";
import { eligibleSource,confinedSource,type ResourceRecord } from "./registry";
/** Preparation only: actual immutable window-A record and real hour must exist before a B approval is requested. */
export async function materializeWindowB(windowA:ExecutionPacket,template:ExecutionPacket,registration:Buffer,windowAResult:unknown){
 const a=validatePacket(windowA),record=JSON.parse(registration.toString()) as ResourceRecord,r=windowAResult as {caseId:string;status:string;packetSha256:string;observation:{deferredSourceOrphan:boolean;containerAbsent:boolean;leaseActive:boolean}};
 if(a.caseId!=="C02A"||template.caseId!=="C02B"||template.runId===a.runId||record.caseId!=="C02A"||record.runId!==a.runId||record.jobId!==a.binding!.jobId||record.name!==a.containerNames[0]||record.specDigest!==a.specDigests[0]||record.imageId!==a.daemon!.imageId||!record.containerId||!r||r.caseId!=="C02A"||r.status!=="PASS"||r.packetSha256!==hash(JSON.stringify(a))||!r.observation.deferredSourceOrphan||!r.observation.containerAbsent||r.observation.leaseActive)throw new LiveGuardError("approval_required");
 await confinedSource(record.source);const s=await lstat(record.source+".lease");if(!s.isFile()||s.isSymbolicLink()||s.size>2048)throw new LiveGuardError("cleanup_failed");const marker=JSON.parse(await readFile(record.source+".lease","utf8"));
 if(marker.rootName!==basename(record.source)||!eligibleSource(record,marker))throw new LiveGuardError("execution_not_ready");
 const packet=validatePacket({...template,cleanupReference:{jobId:record.jobId,registrySha256:hash(registration),notBefore:new Date(record.createdAt+3600000).toISOString()}});
 if(fingerprint(packet.artifacts)!==fingerprint(template.artifacts))throw new LiveGuardError("approval_required");
 return{packet,packetSha256:hash(JSON.stringify(packet)),actualAgeMs:Date.now()-record.createdAt,activation:"NEW_OWNER_APPROVAL_REQUIRED",sourceRootSha256:hash(record.source)};
}

import { readFile,lstat } from "node:fs/promises";
import { join,resolve } from "node:path";
import { caseLimits,type CaseId } from "./catalog";
import { validatePacket,validateExecution,hash,type ExecutionApproval } from "./approval";
import { verifyArtifacts } from "./integrity";
import { privateAcceptanceRoot } from "./private-root";
import { LiveGuardError } from "../../../src/features/guard/live/model";
export const packageRoot=resolve("docs/acceptance/guard-g01/remaining-gates-v2");
export async function regularJson(path:string){const s=await lstat(path);if(!s.isFile()||s.isSymbolicLink()||s.size>1000000)throw new LiveGuardError("approval_required");return JSON.parse(await readFile(path,"utf8"));}
export async function reviewPacket(caseId:string,digest:string){
 if(!Object.hasOwn(caseLimits,caseId)||!/^[a-f0-9]{64}$/.test(digest))throw new LiveGuardError("approval_required");
 const packet=validatePacket(await regularJson(join(packageRoot,"packets",caseId+".json")));
 if(hash(JSON.stringify(packet))!==digest||packet.caseId!==caseId)throw new LiveGuardError("approval_required");await verifyArtifacts(packet);return packet;
}
export async function approvedCase(caseId:CaseId,digest:string){
 const packet=await reviewPacket(caseId,digest),root=await privateAcceptanceRoot(),approval=await regularJson(join(root,`approval.${packet.runId}.json`)) as ExecutionApproval;
 validateExecution(packet,approval);return{packet,approval,root};
}

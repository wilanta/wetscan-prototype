import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { reviewPacket,approvedCase,packageRoot } from "./package";
import { validateExecution,hash,type ExecutionApproval } from "./approval";
import { privateAcceptanceRoot } from "./private-root";
import type { CaseId } from "./catalog";
import { qualify } from "./qualification";
import { denyEnforcementEvidence } from "./deny-evidence";
import { schemaCase,cleanupSourceCase } from "./operator-cases";
import { LiveGuardError } from "../../../src/features/guard/live/model";
/** No dotenv, automatic approval timestamps, server launch, enqueue or worker CLI fallback. */
async function main(){
 const args=process.argv.slice(2),caseId=args.find(v=>v.startsWith("--case="))?.slice(7) as CaseId,digest=args.find(v=>v.startsWith("--packet-sha256="))?.slice(16)??"";
 if(args.includes("--measure")){
  if(args.length!==1)throw new LiveGuardError("invalid_input");const {measureDaemon}=await import("./daemon"),{probeProgram,makeProbeSpec}=await import("./probe-spec");
  console.log(JSON.stringify({classification:"READONLY_DAEMON_IMAGE_OBSERVATION",observedAt:new Date().toISOString(),daemon:await measureDaemon(makeProbeSpec(await probeProgram(),{mode:"manifest",holdMs:0})),mutations:0}));return;
 }
 if(args.some(v=>!v.startsWith("--case=")&&!v.startsWith("--packet-sha256=")&&!["--approve-stdin","--run","--review"].includes(v))||args.includes("--run")&&args.includes("--approve-stdin"))throw new LiveGuardError("invalid_input");
 const packet=await reviewPacket(caseId,digest);
 if(args.includes("--approve-stdin")){
  let text="";for await(const chunk of process.stdin){text+=chunk.toString();if(Buffer.byteLength(text)>4096)throw new LiveGuardError("approval_required");}
  const approval=JSON.parse(text) as ExecutionApproval;validateExecution(packet,approval);
  const root=await privateAcceptanceRoot(true);await writeFile(join(root,`approval.${packet.runId}.json`),JSON.stringify(approval,null,2)+"\n",{flag:"wx",mode:0o600});
  console.log(JSON.stringify({status:"APPROVAL_STAGED",caseId,packetSha256:digest,runtimeOperations:0}));return;
 }
 if(!args.includes("--run")){console.log(JSON.stringify({status:"REVIEWED_NOT_AUTHORIZED",caseId,packetSha256:hash(JSON.stringify(packet)),runtimeOperations:0}));return;}
 const {approval,root}=await approvedCase(caseId,digest);let result:unknown;
 if(caseId==="Q00")result=await qualify(packet,approval,root);
 else if(caseId==="N00")result=await denyEnforcementEvidence(packet,approval,root);
 else if(caseId==="L01")result=await schemaCase(packet,approval,root,process.env);
 else if(caseId==="C02B")result=await cleanupSourceCase(packet,approval,root);
 else if(caseId==="L02")throw new LiveGuardError("approval_required");
 else{console.log(JSON.stringify({status:"OWNER_AUTH_SESSION_REQUIRED",caseId,scannerExecution:"NOT_RUN",runtimeOperations:0}));return;}
 await writeFile(join(root,`${packet.runId}.case-result.json`),JSON.stringify(result,null,2)+"\n",{flag:"wx",mode:0o600});console.log(JSON.stringify(result));
}
main().catch(error=>{console.error(JSON.stringify({status:"BLOCKED_OR_FAILED",reason:error instanceof LiveGuardError?error.code:"acceptance_unavailable",scannerExecution:"NOT_RUN",noAutomaticRetry:true,packageRoot}));process.exitCode=2;});

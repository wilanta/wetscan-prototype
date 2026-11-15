import { DockerGuardSandbox,dockerDriver,sandboxControls,type DockerDriver } from "../sandbox";
import { operatorSandboxEvidence } from "../sandbox-evidence";
import { fingerprint } from "../../../src/platform/identity";
import { LiveGuardError } from "../../../src/features/guard/live/model";
import { validateExecution,hash,type ExecutionPacket,type ExecutionApproval } from "./approval";
import { probeProgram,probePolicy } from "./probe-spec";
import { caseSpecs } from "./case-specs";
import { measureDaemon,sameDaemon } from "./daemon";
import { CaseJournal } from "./journal";
import { verifyArtifacts } from "./integrity";
/** Invalid evidence only. A readonly driver wrapper makes accidental create/start impossible. */
export async function denyEnforcementEvidence(packet:ExecutionPacket,approval:ExecutionApproval,root:string,driverOverride?:DockerDriver){
 const {packet:p,approval:a}=validateExecution(packet,approval);if(p.caseId!=="N00")throw new LiveGuardError("approval_required");await verifyArtifacts(p);
 const program=await probeProgram(),spec=caseSpecs("N00",program)[0];if(p.programSha256!==hash(program)||p.specDigests[0]!==fingerprint(spec))throw new LiveGuardError("approval_required");
 const underlying=driverOverride??dockerDriver(spec.docker,spec.endpoint),calls:string[]=[];
 const driver: DockerDriver={call:async(args,input)=>{if(!["version","info","image"].includes(args[0])||(args[0]==="image"&&args[1]!=="inspect"))throw new LiveGuardError("approval_required");calls.push(args[0]);return underlying.call(args,input);}};
 sameDaemon(p.daemon,await measureDaemon(spec,driver));const journal=new CaseJournal(root,p,a),results=[];
 const invalid={schemaVersion:1,module:"guard-sandbox",status:"PASS",verifiedBy:"INVALID_NEGATIVE_TEST_DATA_NOT_ATTESTATION",verifiedAt:new Date(Date.now()-1000).toISOString(),expiresAt:new Date(Date.now()+30000).toISOString(),binding:{specDigest:fingerprint(spec),daemonVersion:p.daemon!.version,daemonId:p.daemon!.id,kernelVersion:p.daemon!.kernel,imageId:p.daemon!.imageId,image:spec.image},controls:sandboxControls.map(control=>({control,status:"PASS",artifactSha256:"0".repeat(64)}))};
 const fixtures=[null,{...invalid,expiresAt:new Date(Date.now()-1).toISOString()},{...invalid,binding:{...invalid.binding,specDigest:"0".repeat(64)}}];
 for(let slot=0;slot<fixtures.length;slot++){
  validateExecution(p,a);const receipt=await journal.reserve("qualification",slot);
  const sandbox=new DockerGuardSandbox(spec,driver,operatorSandboxEvidence(fixtures[slot]),{name:"unused",labels:{},validate:probePolicy(spec),reserve:async()=>{throw new LiveGuardError("approval_required");},inspect:async()=>{throw new LiveGuardError("approval_required");},beforeRemove:async()=>{throw new LiveGuardError("approval_required");},removed:async()=>{throw new LiveGuardError("approval_required");}});
  const result=await sandbox.readiness();if(result.status!=="BLOCKED")throw new LiveGuardError("execution_not_ready");
  const row={kind:["missing","expired","binding_mismatch"][slot],status:"DENIED",createCalls:0,startCalls:0};await journal.result(receipt,row);results.push(row);
 }
 return{caseId:"N00",status:"PASS",classification:"LIVE_READONLY_ADMISSION_NEGATIVES",results,readonlyCalls:calls.length,containersCreated:0,scannerExecution:"NOT_RUN"};
}

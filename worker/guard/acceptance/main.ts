import { privateIpcPort } from "../ipc";
import { within } from "../../sentinel/lifecycle";
import { startFoundationWorker,type AcceptanceBoot } from "./bootstrap";
import { LiveGuardError } from "../../../src/features/guard/live/model";
async function main(){
 if(process.env.GUARD_ACCEPTANCE_LAUNCH!=="2"||!process.connected||!process.send)throw new LiveGuardError("approval_required");
 const port=privateIpcPort(process);let off=()=>{},disconnect=()=>{};
 try{const boot=await within(new Promise<AcceptanceBoot>((done,fail)=>{
 off=port.message(value=>{if(value&&typeof value==="object"&&"type"in value&&value.type==="guard.acceptance.boot"&&"version"in value&&value.version===2&&"boot"in value)done(value.boot as AcceptanceBoot);});
 disconnect=port.disconnect(()=>fail(new LiveGuardError("approval_required")));
 void port.send({type:"guard.acceptance.boot_ready",version:2}).catch(fail);
 }),5000);off();disconnect();await startFoundationWorker({boot,environment:process.env,control:process});}finally{off();disconnect();}
}
main().catch(()=>{console.error(JSON.stringify({module:"guard-g01-acceptance",status:"not_started_or_failed",scannerExecution:"NOT_RUN"}));process.exitCode=2;if(process.connected)process.disconnect?.();});

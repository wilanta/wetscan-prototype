import { GuardSessionBroker, type BrokerDependencies } from "../auth-broker";
import type { GuardWorkerApproval } from "../approval";
import { boundedPacket } from "../ipc";
import { fingerprint } from "../../../src/platform/identity";
import { LiveGuardError } from "../../../src/features/guard/live/model";
import type { GuardSnapshot } from "../../../src/features/guard/live/model";
import type { JobLease } from "../../../src/features/sentinel/platform-contracts";
import type { SandboxSpec } from "../sandbox";
import { validateExecution, type ExecutionPacket, type ExecutionApproval } from "./approval";
import { verifyProbeOutput } from "./probe-spec";
import type { Checkpoints } from "./checkpoints";
/** Composition owns paths only in the Auth process. Existing broker still gates source operations. */
export class FoundationBroker {
  private readonly broker: GuardSessionBroker;
  private readonly handles = new Map<string,{snapshot:GuardSnapshot;leaseToken:string}>();
  constructor(private readonly packet:ExecutionPacket,private readonly approval:ExecutionApproval, permit:GuardWorkerApproval, deps:BrokerDependencies,
    private readonly spec:SandboxSpec|null,private readonly execute:(snapshot:GuardSnapshot,signal:AbortSignal)=>Promise<string>, private readonly checkpoints?:Checkpoints) {
    const {packet:p}=validateExecution(packet,approval);
    if (!p.binding || fingerprint(p.binding)!==fingerprint(permit.binding) || p.execution!=="foundation_probe" || (spec ? !p.specDigests.includes(fingerprint(spec)) : p.limits.containers!==0)) throw new LiveGuardError("approval_required");
    this.broker=new GuardSessionBroker(permit,deps);
  }
  async handle(value:Record<string,unknown>,signal:AbortSignal):Promise<unknown> {
    const packet=boundedPacket(value),lease=packet.lease as JobLease;
    if(packet.op==="dispose") {
      const result=await this.broker.handle(packet,signal);
      this.handles.delete(String(packet.handle));return result;
    }
    validateExecution(this.packet,this.approval);
    if(packet.op==="checkpoint") {
      if(packet.point!=="claimed" || Object.keys(packet).some(k=>!["type","version","id","op","lease","point"].includes(k)))throw new LiveGuardError("invalid_input");
      await this.broker.handle({op:"resolve",lease},signal);
      await this.checkpoints?.reach("claimed",signal);
      return {observed:true};
    }
    if(packet.op!=="probe") {
      const result=await this.broker.handle(packet,signal);
      if(packet.op==="acquire") {
        const r=boundedPacket(result);this.handles.set(String(r.handle),{snapshot:r.snapshot as GuardSnapshot,leaseToken:lease.leaseToken});
        await this.checkpoints?.reach("acquired",signal);
      }
      return result;
    }
    if(!this.spec || Object.keys(packet).some(k=>!["type","version","id","op","lease","handle"].includes(k)))throw new LiveGuardError("invalid_input");
    const entry=this.handles.get(String(packet.handle));
    if(!entry||entry.leaseToken!==lease?.leaseToken)throw new LiveGuardError("not_found",404);
    await this.broker.handle({op:"resolve",lease},signal);
    const deadline=Math.min(entry.snapshot.expiresAt,Date.parse(this.approval.expiresAt));
    if(deadline<=Date.now())throw new LiveGuardError("approval_required");
    const bounded=AbortSignal.any([signal,AbortSignal.timeout(Math.max(1,deadline-Date.now()))]);
    const output=await this.execute(entry.snapshot,bounded);
    const proof=verifyProbeOutput(output,entry.snapshot);
    validateExecution(this.packet,this.approval);
    await this.broker.handle({op:"resolve",lease},signal);
    return {manifest:proof.manifest,specDigest:fingerprint(this.spec)};
  }
  admission(){return this.broker.admission();}
  async close(){await this.broker.close();this.handles.clear();}
}

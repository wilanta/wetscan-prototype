import { LiveGuardError } from "../../../src/features/guard/live/model";
import { Checkpoints, waitForAbort, type Checkpoint } from "./checkpoints";
import type { CaseId } from "./catalog";
import { lockOwnedFile } from "./owned-lock";
export interface FaultActions {
  event(point:Checkpoint):Promise<void>;
  cancel():Promise<void>;
  /** Normal owner logout is external. This returns only after the actual old session is rejected. */
  revoked(signal:AbortSignal):Promise<void>;
  crashChild():Promise<void>;
  /** Record a checkpoint and await the owner's separately approved app-process termination. */
  parentCrashReady(signal:AbortSignal):Promise<never>;
}
/** Fixed server-side faults, enabled only by a fresh exact case packet and first attempt. */
export class CaseFaults {
  readonly checkpoints:Checkpoints;
  private locked?:Awaited<ReturnType<typeof lockOwnedFile>>;
  private firstFile?:{root:string;relative:string};
  private held=false;
  constructor(readonly caseId:CaseId,private readonly actions:FaultActions,firstAttempt=true){
    this.checkpoints=new Checkpoints(caseId,async(point,signal)=>{
      if(!firstAttempt)return;
      await actions.event(point);
      switch(caseId){
        case "N01":if(point==="acquired"){await actions.revoked(signal);throw new LiveGuardError("not_found",404);}break;
        case "N02":if(point==="container_started"){await actions.cancel();await waitForAbort(signal);}break;
        case "N03":if(point==="container_started")await waitForAbort(signal);break;
        case "N06":if(point==="partial_source")await waitForAbort(signal);break;
        case "N07":if(point==="container_remove")throw new LiveGuardError("cleanup_failed");break;
        case "C01":if(point==="container_started"){await actions.crashChild();await waitForAbort(signal);}break;
        case "C02A":if(point==="container_started")await actions.parentCrashReady(signal);break;
      }
    });
  }
  snapshotHooks(){return{
    afterWrite:async(root:string,relative:string,written:number,signal:AbortSignal)=>{
      if(written!==1)return;this.firstFile={root,relative};
      await this.checkpoints.reach("partial_source",signal);
    },
    beforeCleanup:async(root:string)=>{
      if(this.caseId!=="N08"||this.held||!this.firstFile||this.firstFile.root!==root)return;
      this.held=true;
      this.locked=await lockOwnedFile(root,this.firstFile.relative);
      await this.actions.event("source_remove");
    },
  };}
  async releaseOwnedLock(){if(!this.locked)throw new LiveGuardError("cleanup_failed");await this.locked.release();}
}

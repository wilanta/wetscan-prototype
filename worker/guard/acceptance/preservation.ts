import { fixtureTarget } from "./catalog";
import { LiveGuardError } from "../../../src/features/guard/live/model";
export const initialSentinelProjection="45e7cfe26767e26ad96ceda0dd2a53649a10ea7a5453844ac50ee30867e1095d";
export interface PreservationProjection {
 sentinel:{scope:string;preserved:boolean;beforeSha256:string;afterSha256:string;differentSections:unknown[];state:{database:string;serverPort:number;owner:string;marker:string}};
 guard:{caseId:string;database:string;port:number;marker:string;owner:string;projectionSha256:string;excludedJob:string|null;excludedWorkers:string[];currentCaseScans:number;currentCaseJobs:number};
}
/** Operator-supplied results from the frozen target-checked READ ONLY SQL, never a config ready flag. */
export function preserved(before:PreservationProjection,after:PreservationProjection,caseId:string,jobId:string|null,workers:readonly string[]){
 for(const p of [before,after]){
  const s=p?.sentinel,g=p?.guard;if(!s||!g||s.scope!=="isolated G01 database; external Sentinel database not observed"||!s.preserved||s.beforeSha256!==initialSentinelProjection||s.afterSha256!==initialSentinelProjection||!Array.isArray(s.differentSections)||s.differentSections.length||s.state.database!==fixtureTarget.database||s.state.serverPort!==fixtureTarget.port||s.state.owner!=="wetscan_guard_migrator"||s.state.marker!==fixtureTarget.marker||g.caseId!==caseId||g.database!==fixtureTarget.database||g.port!==fixtureTarget.port||g.marker!==fixtureTarget.marker||g.owner!=="wetscan_guard_migrator"||!/^[a-f0-9]{64}$/.test(g.projectionSha256)||g.excludedJob!==jobId||JSON.stringify(g.excludedWorkers)!==JSON.stringify(workers))throw new LiveGuardError("execution_not_ready");
 }
 if(before.guard.projectionSha256!==after.guard.projectionSha256||before.guard.currentCaseScans!==0||before.guard.currentCaseJobs!==0||after.guard.currentCaseScans!==(jobId?1:0)||after.guard.currentCaseJobs!==(jobId?1:0))throw new LiveGuardError("execution_not_ready");
 return{sentinelPreserved:true,originalRowsPreserved:true,scope:"G01_FIXTURE_ONLY",externalSentinel:"NOT_VERIFIED",externalReason:"TARGET_NOT_IDENTIFIED"};
}

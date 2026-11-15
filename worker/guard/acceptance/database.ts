import { readFile,lstat } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { guardRoles,type GuardDatabaseApproval } from "../../../src/features/guard/live/database-config";
import type { ApprovedDatabaseConfig } from "../../../src/platform/config";
import { LiveGuardError } from "../../../src/features/guard/live/model";
import { validateExecution,type ExecutionPacket,type ExecutionApproval } from "./approval";
import { verifyArtifacts } from "./integrity";
/** Same purpose-specific credential references, activated by the new exact case authority only.
 * No broad migrate_up permit file is issued. L01's internal migrator capability is session-readonly.
 * Never call this while preparing/reviewing packages or in offline tests with actual credentials.
 */
export async function caseDatabaseConfig(packet:ExecutionPacket,approval:ExecutionApproval,environment:Readonly<Record<string,string|undefined>>,purpose:keyof typeof guardRoles):Promise<ApprovedDatabaseConfig & {approval:GuardDatabaseApproval}>{
 const {packet:p,approval:a}=validateExecution(packet,approval);await verifyArtifacts(p);
 if(purpose==="migration" ? p.caseId!=="L01" : !p.binding)throw new LiveGuardError("approval_required");
 const path=environment[`GUARD_DB_${purpose.toUpperCase()}_PASSWORD_FILE`];
 if(!path||!isAbsolute(path))throw new LiveGuardError("not_configured");
 const stat=await lstat(path);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>1024)throw new LiveGuardError("approval_required");
 validateExecution(p,a);
 const password=(await readFile(path,"utf8")).trim();
 if(password.length<20||password.length>512||/[\r\n\0]/.test(password))throw new LiveGuardError("not_configured");
 return{target:p.target,purpose,user:guardRoles[purpose],password,max:purpose==="migration"?1:purpose==="worker"?2:3,
 approval:{schemaVersion:1,status:"APPROVED",module:"guard",purpose,role:guardRoles[purpose],approvedBy:a.approvedBy,approvedAt:a.approvedAt,expiresAt:a.expiresAt,target:p.target,actions:[purpose==="migration"?"migrate_up":"runtime"],migrationPlanSha256:p.migrationPlanSha256}};
}

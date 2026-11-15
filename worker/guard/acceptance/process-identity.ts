import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { join } from "node:path";
import { LiveGuardError } from "../../../src/features/guard/live/model";
/** Read only the current app PID's creation identity; no process enumeration or command-line dump. */
export async function currentProcessIdentity(){
 const os=process.env.SystemRoot;if(process.platform!=="win32"||!os)throw new LiveGuardError("not_configured");
 const result=await promisify(execFile)(join(os,"System32/WindowsPowerShell/v1.0/powershell.exe"),["-NoProfile","-NonInteractive","-Command","$p=[System.Diagnostics.Process]::GetProcessById([int]$env:G01_OWNER_PID);[pscustomobject]@{pid=$p.Id;creationTicks=[string]$p.StartTime.ToUniversalTime().Ticks}|ConvertTo-Json -Compress"],{env:{NODE_ENV:"production",SystemRoot:os,WINDIR:os,G01_OWNER_PID:String(process.pid)},windowsHide:true,timeout:5000,maxBuffer:2048});
 const identity=JSON.parse(result.stdout);if(identity.pid!==process.pid||!/^\d+$/.test(identity.creationTicks))throw new LiveGuardError("execution_not_ready");return{pid:process.pid,creationTicks:String(identity.creationTicks)};
}

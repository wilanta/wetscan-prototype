import { mkdtemp,rm,realpath } from "node:fs/promises";
import { join,basename,dirname } from "node:path";
import { tmpdir } from "node:os";
import { dockerDriver,type DockerDriver } from "../sandbox";
import type { ExecutionPacket } from "./approval";
import { probeProgram } from "./probe-spec";
import { caseSpecs } from "./case-specs";
import { measureDaemon,sameDaemon } from "./daemon";
import { LiveGuardError } from "../../../src/features/guard/live/model";
/** Absence comes from the actual daemon, never just a deleted local lock file. */
export async function physicalContainerAbsence(p:ExecutionPacket,driverOverride?:DockerDriver){
 if(!p.containerNames.length)return true;
 const spec=caseSpecs(p.caseId,await probeProgram())[0],driver=driverOverride??dockerDriver(spec.docker,spec.endpoint);
 sameDaemon(p.daemon,await measureDaemon(spec,driver));
 const config=await mkdtemp(join(tmpdir(),"wetscan-g01-docker-"));try{
  for(const name of p.containerNames){const text=(await driver.call(["ps","--all","--filter","name=^/"+name+"$","--format","{{.ID}}"],{configDirectory:config,timeoutMs:5000,maxBytes:32000})).trim();if(text)return false;}
  return true;
 }finally{const actual=await realpath(config),parent=await realpath(tmpdir());if(dirname(actual).toLowerCase()!==parent.toLowerCase()||!basename(actual).startsWith("wetscan-g01-docker-"))throw new LiveGuardError("cleanup_failed");await rm(actual,{recursive:true,force:true});}
}

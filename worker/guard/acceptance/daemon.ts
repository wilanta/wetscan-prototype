import { mkdtemp,rm,realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename,dirname,join } from "node:path";
import { dockerDriver,pinnedImagePresent,type DockerDriver,type SandboxSpec } from "../sandbox";
import { LiveGuardError } from "../../../src/features/guard/live/model";
import type { ExecutionPacket } from "./approval";
/** Read-only selected fields, explicit local daemon; never pull/build/start/create or use ambient config. */
export async function measureDaemon(spec:SandboxSpec,driver:DockerDriver=dockerDriver(spec.docker,spec.endpoint)){
 const config=await mkdtemp(join(tmpdir(),"wetscan-g01-docker-"));
 const call=(args:string[])=>driver.call(args,{configDirectory:config,timeoutMs:5000,maxBytes:32000});
 try{
  const server=JSON.parse(await call(["version","--format",'{{json .Server}}']));
  const info=JSON.parse(await call(["info","--format",'{"ID":{{json .ID}},"KernelVersion":{{json .KernelVersion}}}']));
  const image=JSON.parse(await call(["image","inspect","--format",'{"Id":{{json .Id}},"RepoDigests":{{json .RepoDigests}},"Architecture":{{json .Architecture}},"Os":{{json .Os}}}',spec.image]));
  if(server.Os!=="linux"||!server.Version||!info.ID||!info.KernelVersion||image.Os!=="linux"||image.Architecture!=="amd64"||!/^sha256:[a-f0-9]{64}$/.test(image.Id)||!Array.isArray(image.RepoDigests)||!pinnedImagePresent(spec.image,image.RepoDigests))throw new LiveGuardError("execution_not_ready");
  return{endpoint:spec.endpoint,id:String(info.ID),version:String(server.Version),kernel:String(info.KernelVersion),imageId:String(image.Id)};
 }finally{const target=await realpath(config),parent=await realpath(tmpdir());if(dirname(target).toLowerCase()!==parent.toLowerCase()||!basename(target).startsWith("wetscan-g01-docker-"))throw new LiveGuardError("cleanup_failed");await rm(target,{recursive:true,force:true});}
}
export function sameDaemon(expected:ExecutionPacket["daemon"],actual:NonNullable<ExecutionPacket["daemon"]>){if(!expected||Object.keys(actual).some(k=>actual[k as keyof typeof actual]!==expected[k as keyof typeof actual]))throw new LiveGuardError("execution_not_ready");}

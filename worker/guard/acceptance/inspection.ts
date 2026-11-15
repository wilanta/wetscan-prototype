import type { SandboxSpec } from "../sandbox";
import type { ResourceRecord } from "./registry";
import { LiveGuardError } from "../../../src/features/guard/live/model";
/** Same immutable controls for qualification and integrated execution; no ready flags. */
export function inspectedBoundary(m:unknown,spec:SandboxSpec,record:ResourceRecord,source:string){
 const v=m as {Image:string;Config:{User:string;Image:string;Entrypoint:string[];Cmd:string[];Labels:Record<string,string>;Env:string[]};HostConfig:{Privileged:boolean;ReadonlyRootfs:boolean;NetworkMode:string;IpcMode:string;Memory:number;MemorySwap:number;PidsLimit:number;NanoCpus:number;CapDrop:string[];CapAdd:string[]|null;SecurityOpt:string[];Tmpfs:Record<string,string>;Binds:unknown;Devices:unknown[]};Mounts:{Source:string;Destination:string;RW:boolean;Type:string}[]};
 const h=v.HostConfig,c=v.Config,mounts=v.Mounts;
 const fail=()=>{throw new LiveGuardError("execution_not_ready");};
 if(!h||!c||!Array.isArray(mounts)||v.Image!==record.imageId||c.Image!==spec.image||c.User!=="65532:65532"||JSON.stringify(c.Entrypoint)!==JSON.stringify([spec.executable])||JSON.stringify(c.Cmd)!==JSON.stringify(spec.args)||h.Privileged||!h.ReadonlyRootfs||h.NetworkMode!=="none"||h.IpcMode!=="none"||h.Memory!==268435456||h.MemorySwap!==268435456||h.PidsLimit!==64||h.NanoCpus!==1e9||!h.CapDrop?.includes("ALL")||h.CapAdd?.length||!h.SecurityOpt?.some(v=>v.startsWith("no-new-privileges"))||h.Tmpfs?.["/tmp"]!=="rw,noexec,nosuid,nodev,size=16777216"||h.Devices?.length||h.Binds||mounts.filter(m=>m.Type==="bind").length!==1||mounts.some(m=>m.Type!=="bind"&&!(m.Type==="tmpfs"&&m.Destination==="/tmp")))fail();
 const bind=mounts.find(m=>m.Type==="bind");if(!bind||bind.RW||bind.Destination!=="/source"||bind.Source.toLowerCase()!==source.toLowerCase()||c.Env?.some(v=>/^(?:AUTH_|GITHUB_|PG|DATABASE_URL=)/.test(v)))fail();
}

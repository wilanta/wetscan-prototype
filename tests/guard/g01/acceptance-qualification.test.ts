import { readFile,mkdtemp,rm,readdir,realpath } from "node:fs/promises";
import { join,dirname,basename,resolve } from "node:path";
import { tmpdir } from "node:os";
import { expect,it } from "vitest";
import { hash } from "../../../worker/guard/acceptance/approval";
import { fingerprint } from "../../../src/platform/identity";
import { probeProgram } from "../../../worker/guard/acceptance/probe-spec";
import { caseSpecs } from "../../../worker/guard/acceptance/case-specs";
import { qualify } from "../../../worker/guard/acceptance/qualification";
import { denyEnforcementEvidence } from "../../../worker/guard/acceptance/deny-evidence";
import { acceptanceFixture } from "./acceptance-fixture";
import { offlineDocker } from "./acceptance-docker-fixture";
async function fixture(id:"Q00"|"N00"){
 const f=await acceptanceFixture(id),program=await probeProgram(),specs=caseSpecs(id,program);f.packet.programSha256=hash(program);f.packet.specDigests=specs.map(fingerprint);
 for(const a of f.packet.artifacts)a.sha256=hash(await readFile(a.file));
 const root=await mkdtemp(join(tmpdir(),"wetscan-g01-snapshot-offline-qualification-")),driver=offlineDocker(specs[0].image);
 const original=driver.call.getMockImplementation()!;
 driver.call.mockImplementation(async(args,input)=>{const output=await original(args,input);if(output!=="OFFLINE_DRIVER_REQUIRES_OUTPUT")return output;const content="guard-g01-synthetic-only\n";return JSON.stringify({version:1,files:1,bytes:Buffer.byteLength(content),manifest:hash(JSON.stringify([["fixture.txt",hash(content),Buffer.byteLength(content)]])),checks:Object.fromEntries(["non_root","read_only_root","read_only_source","source_readable","no_socket","no_host_secrets","no_network","cpu","memory","pids"].map(c=>[c,true]))});});
 const clean=async()=>{
  for(const file of (await readdir(root)).filter(v=>v.endsWith(".intent.json"))){const record=JSON.parse(await readFile(join(root,file),"utf8"));const path=resolve(record.source);if(dirname(path).toLowerCase()!==(await realpath(tmpdir())).toLowerCase()||!basename(path).startsWith("wetscan-g01-snapshot-"))throw Error("unsafe offline fixture cleanup");await rm(path,{recursive:true,force:true});}
  const path=await realpath(root);if(dirname(path).toLowerCase()!==(await realpath(tmpdir())).toLowerCase()||!basename(path).startsWith("wetscan-g01-snapshot-offline-qualification-"))throw Error("unsafe");await rm(path,{recursive:true,force:true});
 };
 return{...f,root,driver,clean};
}
it("Q00 offline: runs the real six-probe runner with an explicit Docker DOUBLE; retained synthetic source, exact quotas and complete cleanup receipts",async()=>{
 const f=await fixture("Q00");try{const result=await qualify(f.packet,f.approve(),f.root,f.driver);expect(result.status).toBe("PASS");expect(result.productionAttestation).toBe("NOT_ISSUED");expect(result.results).toHaveLength(6);expect(result.results.every(v=>v.inspectVerified&&v.containerAbsent)).toBe(true);expect(f.driver.createdCount()).toBe(6);expect(f.driver.entries.size).toBe(0);expect((await readdir(f.root)).filter(v=>v.endsWith(".used"))).toHaveLength(6);await expect(qualify(f.packet,f.approve(),f.root,f.driver)).rejects.toThrow("approval_required");expect(f.driver.createdCount()).toBe(6);}finally{await f.clean();}
},20000);
it("N00 offline: real negative-admission runner rejects all three invalid evidence fixtures without create/start",async()=>{
 const f=await fixture("N00");try{expect((await denyEnforcementEvidence(f.packet,f.approve(),f.root,f.driver)).results).toHaveLength(3);expect(f.driver.createdCount()).toBe(0);expect(f.driver.call.mock.calls.every(([a])=>["version","info","image"].includes(a[0]))).toBe(true);}finally{await f.clean();}
},10000);

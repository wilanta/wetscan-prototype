import{expect,it}from"vitest";
import{probeProgram,probeArgs,makeProbeSpec,probePolicy,expectedManifest,verifyProbeOutput}from"../../../worker/guard/acceptance/probe-spec";
import{validateSandboxSpec}from"../../../worker/guard/sandbox";
import{brokerFixture}from"./broker-fixture";
it("freezes an isolated stdlib-only fixed program, bounded argv and exact official image policy",async()=>{
 const p=await probeProgram(),args=probeArgs(p,{mode:"manifest",holdMs:0}),s=makeProbeSpec(p,{mode:"manifest",holdMs:0});
 expect(args.length).toBeLessThanOrEqual(32);expect(args.every(a=>a.length<=512&&!/[\r\n\0]/.test(a))).toBe(true);
 expect(args.slice(0,3)).toEqual(["-I","-B","-c"]);expect(()=>validateSandboxSpec(s)).toThrow();expect(()=>probePolicy(s)(s)).not.toThrow();
 expect(()=>probePolicy(s)({...s,args:["-c","arbitrary"]})).toThrow();
 expect(p).not.toContain("subprocess");expect(p).not.toContain("importlib");
});
it("only accepts same snapshot manifest, sizes and positive actual control booleans",async()=>{
 const f=await brokerFixture(),value={version:1,manifest:expectedManifest(f.snapshot),files:1,bytes:7,checks:Object.fromEntries(["non_root","read_only_root","read_only_source","source_readable","no_socket","no_host_secrets"].map(k=>[k,true]))};
 expect(verifyProbeOutput(JSON.stringify(value),f.snapshot)).toMatchObject({files:1,bytes:7});
 for(const bad of [{...value,bytes:8},{...value,manifest:"f".repeat(64)},{...value,checks:{...value.checks,no_socket:false}},{...value,checks:{non_root:true}}])expect(()=>verifyProbeOutput(JSON.stringify(bad),f.snapshot)).toThrow();
});

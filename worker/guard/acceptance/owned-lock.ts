import{spawn}from"node:child_process";import{lstat,realpath}from"node:fs/promises";import{join,sep}from"node:path";
import{LiveGuardError}from"../../../src/features/guard/live/model";import{confinedSource}from"./registry";import{within}from"../../sentinel/lifecycle";
/** Real Windows delete-sharing fault on one owned file. No file content is read. */
export async function lockOwnedFile(root:string,relative:string){
 if(process.platform!=="win32"||!process.env.SystemRoot||relative.split(/[\\/]/).some(v=>!v||v===".."||v==="."))throw new LiveGuardError("not_configured");
 const canonical=await confinedSource(root),path=await realpath(join(canonical,relative)),stat=await lstat(join(canonical,relative));
 if(!path.toLowerCase().startsWith((canonical+sep).toLowerCase())||!stat.isFile()||stat.isSymbolicLink())throw new LiveGuardError("invalid_input");
 const script="$ErrorActionPreference='Stop';$h=[System.IO.File]::Open($env:G01_OWNED_FILE,[System.IO.FileMode]::Open,[System.IO.FileAccess]::Read,[System.IO.FileShare]::Read);try{[Console]::WriteLine('READY:'+$PID+':'+[System.Diagnostics.Process]::GetCurrentProcess().StartTime.ToUniversalTime().Ticks);[Console]::Out.Flush();[void][Console]::ReadLine()}finally{$h.Dispose()}";
 const child=spawn(join(process.env.SystemRoot,"System32/WindowsPowerShell/v1.0/powershell.exe"),["-NoProfile","-NonInteractive","-EncodedCommand",Buffer.from(script,"utf16le").toString("base64")],{windowsHide:true,shell:false,stdio:["pipe","pipe","ignore"],env:{NODE_ENV:"test",SystemRoot:process.env.SystemRoot,WINDIR:process.env.SystemRoot,G01_OWNED_FILE:path}});
 const exited=new Promise<number>(done=>{child.once("exit",code=>done(code??2));child.once("error",()=>done(2));});
 try{
  const identity=await within(new Promise<{pid:number;creationTicks:string}>((done,fail)=>{
   let text="";child.stdout.on("data",chunk=>{text+=chunk.toString();if(text.length>1024)return fail(new LiveGuardError("cleanup_failed"));const m=text.match(/^READY:(\d+):(\d+)\r?\n/);if(m&&Number(m[1])===child.pid)done({pid:Number(m[1]),creationTicks:m[2]});});void exited.then(()=>fail(new LiveGuardError("cleanup_failed")));
  }),5000);
  let released=false;
  return{identity,release:async()=>{if(released)return;released=true;child.stdin.end("release\n");try{if(await within(exited,5000)!==0)throw new LiveGuardError("cleanup_failed");}catch{child.kill();throw new LiveGuardError("cleanup_failed");}}};
 }catch{child.kill();await within(exited,5000).catch(()=>undefined);throw new LiveGuardError("cleanup_failed");}
}

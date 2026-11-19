// Owner-operated input bootstrap for EXISTING Guard password-file mechanism. No database/password mutation, dotenv or existing-secret read.
import {emitKeypressEvents} from "node:readline";
import {writeFile,lstat} from "node:fs/promises";
import {execFileSync} from "node:child_process";
import {resolve,join} from "node:path";
const root=resolve(".local/sentinel/guard-g01-unblock");
if(!process.argv.includes("--interactive")){
 console.log(JSON.stringify({status:"OWNER_INTERACTIVE_INPUT_REQUIRED",existingSecretsRead:0,databaseOperations:0,purposeFiles:[join(root,"app.password"),join(root,"worker.password")],instructions:"Set distinct role passwords through normal PostgreSQL UI first, then run this helper with --interactive in your own terminal. Never send secrets in chat."}));process.exit(0);
}
if(!process.stdin.isTTY || !process.stdout.isTTY || process.platform!=="win32")throw Error("owner_windows_terminal_required");
const os=process.env.SystemRoot;if(!os)throw Error("os_metadata_missing");
const env={SystemRoot:os,WINDIR:os,TEMP:process.env.TEMP,TMP:process.env.TMP};
const literal="'"+root.replaceAll("'","''")+"'";
const cmd=`$a=Get-Acl -LiteralPath ${literal}; [pscustomobject]@{owner=$a.GetOwner([System.Security.Principal.SecurityIdentifier]).Value;current=[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value;protected=$a.AreAccessRulesProtected;rules=@($a.GetAccessRules($true,$true,[System.Security.Principal.SecurityIdentifier]) | ForEach-Object {[pscustomobject]@{sid=$_.IdentityReference.Value;inherited=$_.IsInherited;type=[string]$_.AccessControlType;rights=[int]$_.FileSystemRights}})} | ConvertTo-Json -Depth 4 -Compress`;
const acl=JSON.parse(execFileSync(join(os,"System32/WindowsPowerShell/v1.0/powershell.exe"),["-NoProfile","-NonInteractive","-Command",cmd],{env,encoding:"utf8",windowsHide:true,timeout:10000}));
if(!acl.protected || acl.owner!==acl.current || acl.rules.length!==2 || new Set(acl.rules.map(r=>r.sid)).size!==2 || acl.rules.some(r=>![acl.current,"S-1-5-18"].includes(r.sid)||r.inherited||r.type!=="Allow"||r.rights!==2032127))throw Error("private_directory_acl_required");
emitKeypressEvents(process.stdin);
async function hidden(label){
 process.stdout.write(label+": ");process.stdin.setRawMode(true);process.stdin.resume();
 return new Promise((done,fail)=>{
  let value="";
  const finish=(error)=>{process.stdin.off("keypress",key);process.stdin.setRawMode(false);process.stdin.pause();process.stdout.write("\n");if(error){value="";fail(error);}else done(value);};
  const key=(str,k={})=>{
   if(k.ctrl&&k.name==="c")return finish(Error("owner_cancelled"));
   if(k.name==="return"||k.name==="enter")return finish();
   if(k.name==="backspace"){if(value){value=[...value].slice(0,-1).join("");process.stdout.write("\b \b");}return;}
   if(k.ctrl||k.meta||!str||/[\r\n\0\x1b]/.test(str)||value.length+str.length>512)return;
   value+=str;process.stdout.write("*".repeat([...str].length));
  };
  process.stdin.on("keypress",key);
 });
}
try{
 for(const role of ["app","worker"]){
  const path=join(root,role+".password");
  try{await lstat(path);console.log(role+": existing file preserved without reading; not overwritten.");continue;}catch(e){if(e.code!=="ENOENT")throw e;}
  let value=await hidden("Password role wetscan_guard_"+role),confirm=await hidden("Repeat password role wetscan_guard_"+role);
  if(value!==confirm || value.length<20 || value.length>512 || /[\r\n\0]/.test(value))throw Error("password_confirmation_or_format_invalid");
  await writeFile(path,value,{flag:"wx",mode:0o600});value="";confirm="";console.log(role+": private purpose file created. Value never displayed.");
 }
 console.log("Done. No DB mutation was performed. Confirm readiness without sharing values.");
}catch(e){console.error(e instanceof Error&&/^[a-z_]+$/.test(e.message)?e.message:"private_file_setup_failed");process.exitCode=2;}

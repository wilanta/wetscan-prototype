/** Static OCI verification and owned archive staging. Never extracts/runs an image on the host. */
import {open,lstat,realpath,mkdtemp,writeFile,rm,unlink,mkdir} from "node:fs/promises";
import {constants} from "node:fs";
import {join,basename,dirname,resolve} from "node:path";
import {tmpdir} from "node:os";
import {createHash} from "node:crypto";
import type {AuthorizedSnapshot,Grant} from "../../src/features/guard/contracts";
import {authorize} from "../../src/features/guard/security";
import {LiveGuardError} from "../../src/features/guard/live/model";
import {assertPrivateRuntimeRoot} from "../../src/features/guard/live/product-preflight";
import {secureSnapshotDirectory} from "../../src/features/guard/live/snapshot-directory";
export interface ImageScope { reference:string; archiveSha256:string; archiveBytes:number; artifactRoot:string; }
const sha=(b:Buffer)=>createHash("sha256").update(b).digest("hex");
const refPattern=/^[a-z0-9][a-z0-9._:/-]{0,240}@sha256:[a-f0-9]{64}$/;
export function validateImageScope(s:ImageScope) {
 if(!s||!refPattern.test(s.reference)||s.reference.includes("..")||! /^[a-f0-9]{64}$/.test(s.archiveSha256)||!Number.isSafeInteger(s.archiveBytes)||s.archiveBytes<1024||s.archiveBytes>268435456||!/^wetscan-g02-image-artifacts-[a-f0-9-]{36}$/.test(basename(s.artifactRoot??""))||resolve(s.artifactRoot)!==s.artifactRoot||/guard-g01|guardg01|acceptance|terminalization/i.test(s.artifactRoot))throw new LiveGuardError("execution_not_ready");
 return s;
}
/** A deliberately narrow OCI tar dialect: regular blobs only, no links/PAX, bounded count/JSON/size. */
function ociEntries(bytes:Buffer) {
 const files=new Map<string,Buffer>();let offset=0,count=0;
 while(offset+512<=bytes.length){
  const h=bytes.subarray(offset,offset+512);if(h.every(b=>b===0))break;
  const str=(a:number,b:number)=>h.subarray(a,b).toString("utf8").replace(/\0.*$/s,"");
  const name=(str(345,500)?str(345,500)+"/":"")+str(0,100),type=str(156,157);
  const sizeText=str(124,136).trim();if(!/^[0-7]+$/.test(sizeText))throw new LiveGuardError("source_integrity");
  const size=parseInt(sizeText,8),check=parseInt(str(148,156).trim(),8);
  const sum=h.reduce((n,b,i)=>n+(i>=148&&i<156?32:b),0);
  if(sum!==check||!Number.isSafeInteger(size)||size<0||offset+512+size>bytes.length||++count>2048||files.has(name)||! ["","0"].includes(type)||! /^(?:oci-layout|index\.json|blobs\/sha256\/[a-f0-9]{64})$/.test(name))throw new LiveGuardError("source_integrity");
  files.set(name,bytes.subarray(offset+512,offset+512+size));offset+=512+Math.ceil(size/512)*512;
 }
 return files;
}
export function ociArchiveFiles(bytes:Buffer,scope:Pick<ImageScope,"reference"|"archiveSha256"|"archiveBytes">) { inspectOciArchive(bytes,scope);return ociEntries(bytes); }
export function inspectOciArchive(bytes:Buffer,scope:Pick<ImageScope,"reference"|"archiveSha256"|"archiveBytes">) {
 if(bytes.length!==scope.archiveBytes||sha(bytes)!==scope.archiveSha256||!refPattern.test(scope.reference))throw new LiveGuardError("source_integrity");
 const files=ociEntries(bytes);
 const json=(name:string)=>{const b=files.get(name);if(!b||b.length>65536)throw new LiveGuardError("source_integrity");return JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(b));};
 if(json("oci-layout").imageLayoutVersion!=="1.0.0")throw new LiveGuardError("source_integrity");
 const index=json("index.json"),digest=scope.reference.split("@")[1];
 if(index.schemaVersion!==2||!Array.isArray(index.manifests)||index.manifests.length!==1||index.manifests[0].digest!==digest)throw new LiveGuardError("source_integrity");
 const blob=(d:{digest:string;size:number})=>{if(!/^sha256:[a-f0-9]{64}$/.test(d?.digest))throw new LiveGuardError("source_integrity");const b=files.get("blobs/sha256/"+d.digest.slice(7));if(!b||b.length!==d.size||sha(b)!==d.digest.slice(7))throw new LiveGuardError("source_integrity");return b;};
 if(index.manifests[0].size>65536)throw new LiveGuardError("source_integrity");
 const manifest=JSON.parse(blob(index.manifests[0]).toString("utf8"));
 if(manifest.schemaVersion!==2||manifest.mediaType!=="application/vnd.oci.image.manifest.v1+json"||!Array.isArray(manifest.layers)||manifest.layers.length<1||manifest.layers.length>64)throw new LiveGuardError("source_integrity");
 if(manifest.config.size>65536)throw new LiveGuardError("source_integrity");
 const config=JSON.parse(blob(manifest.config).toString("utf8"));if(config.os!=="linux"||config.architecture!=="amd64"||manifest.config.size>65536)throw new LiveGuardError("source_integrity");
 for(const d of manifest.layers){if(!["application/vnd.oci.image.layer.v1.tar","application/vnd.oci.image.layer.v1.tar+gzip"].includes(d.mediaType))throw new LiveGuardError("source_integrity");blob(d);}
 if(files.size!==4+manifest.layers.length)throw new LiveGuardError("source_integrity");
 return {reference:scope.reference,digest,configDigest:manifest.config.digest,archiveSha256:scope.archiveSha256,archiveBytes:scope.archiveBytes,commitAssociation:"OPERATOR_POLICY_NOT_BUILD_ATTESTATION" as const};
}
export class ImageArtifactOwner {
 private owned=new WeakMap<AuthorizedSnapshot,string>();
 async acquire(source:AuthorizedSnapshot,grant:Grant,scope:ImageScope,signal:AbortSignal){
  authorize(grant,source,"scan");validateImageScope(scope);await assertPrivateRuntimeRoot(scope.artifactRoot);
  const file=join(scope.artifactRoot,scope.archiveSha256+".oci.tar"),st=await lstat(file);
  if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1||st.size!==scope.archiveBytes||dirname(await realpath(file)).toLowerCase()!==(await realpath(scope.artifactRoot)).toLowerCase())throw new LiveGuardError("source_integrity");
  const f=await open(file,constants.O_RDONLY|constants.O_NOFOLLOW);let bytes:Buffer;
  try {const chunks:Buffer[]=[];let size=0;for(;;){if(signal.aborted||grant.expiresAt<=Date.now())throw new LiveGuardError("source_unavailable");const b=Buffer.alloc(1048576),n=(await f.read(b)).bytesRead;if(!n)break;size+=n;if(size>scope.archiveBytes)throw new LiveGuardError("source_limit");chunks.push(b.subarray(0,n));}bytes=Buffer.concat(chunks);if((await f.stat()).size!==st.size)throw new LiveGuardError("source_integrity");}finally{await f.close();}
  const image=inspectOciArchive(bytes,scope);authorize(grant,source,"scan");
  const root=await mkdtemp(join(tmpdir(),"wetscan-g01-snapshot-g02-image-"));await secureSnapshotDirectory(root);
  try {const entries=ociArchiveFiles(bytes,scope);await mkdir(join(root,"image.oci","blobs","sha256"),{recursive:true});
   for(const [name,value] of entries)await writeFile(join(root,"image.oci",name),value,{flag:"wx",mode:0o600});
   const now=Date.now(),expiresAt=Math.min(source.expiresAt,grant.expiresAt);
   await writeFile(root+".lease",JSON.stringify({version:1,kind:"guard-source",rootName:basename(root),createdAt:now,expiresAt}),{flag:"wx",mode:0o600});
   const snapshot:AuthorizedSnapshot={...source,image,digest:sha(bytes),files:[...entries].map(([path,b])=>({path:"image.oci/"+path,size:b.length,sha256:sha(b)})),expiresAt};this.owned.set(snapshot,root);return snapshot;
  }catch(e){try {await rm(root,{recursive:true,force:false});await unlink(root+".lease").catch(error=>{if(error.code!=="ENOENT")throw error;});}catch{throw new LiveGuardError("cleanup_failed");}throw e;}
 }
 async directory(s:AuthorizedSnapshot){const root=this.owned.get(s);if(!root||!s.image)throw new LiveGuardError("source_integrity");for(const item of s.files){const path=join(root,item.path),st=await lstat(path);if(st.isSymbolicLink()||!st.isFile()||st.nlink!==1||st.size!==item.size)throw new LiveGuardError("source_integrity");const f=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);try{if(sha(await f.readFile())!==item.sha256)throw new LiveGuardError("source_integrity");}finally{await f.close();}}return root;}
 async dispose(s:AuthorizedSnapshot){const root=this.owned.get(s);if(!root)throw new LiveGuardError("cleanup_failed");if((await lstat(root)).isSymbolicLink()||dirname(await realpath(root)).toLowerCase()!==(await realpath(tmpdir())).toLowerCase()||!basename(root).startsWith("wetscan-g01-snapshot-g02-image-"))throw new LiveGuardError("cleanup_failed");
  try{await rm(root,{recursive:true,force:false});await unlink(root+".lease");}catch{throw new LiveGuardError("cleanup_failed");}this.owned.delete(s);}
}

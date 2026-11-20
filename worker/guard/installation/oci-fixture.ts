/** Controlled OCI archive: creates data only. Never builds, imports or runs an image. */
import { createHash } from "node:crypto";
const sha=(b:Buffer)=>createHash("sha256").update(b).digest("hex");
export function fixtureTar(files:Record<string,Buffer|string>) {
 const parts:Buffer[]=[];
 for(const [name,value] of Object.entries(files)) {
  if(!/^[A-Za-z0-9._/-]{1,100}$/.test(name)||name.includes("..")||name.startsWith("/"))throw Error("fixture_path");
  const b=Buffer.isBuffer(value)?value:Buffer.from(value),h=Buffer.alloc(512);
  const field=(s:string,o:number,n:number)=>h.write(s,o,n,"ascii");
  field(name,0,100);field("0000644\0",100,8);field("0000000\0",108,8);field("0000000\0",116,8);
  field(b.length.toString(8).padStart(11,"0")+"\0",124,12);field("00000000000\0",136,12);
  h.fill(32,148,156);field("0",156,1);field("ustar\0",257,6);field("00",263,2);
  field(h.reduce((n,x)=>n+x,0).toString(8).padStart(6,"0")+"\0 ",148,8);
  parts.push(h,b,Buffer.alloc((512-b.length%512)%512));
 }
 return Buffer.concat([...parts,Buffer.alloc(1024)]);
}
export function controlledOciFixture(vulnerable=true) {
 const version=vulnerable?"4.17.15":"4.17.21";
 const lock=JSON.stringify({name:"controlled-g02-image",version:"1.0.0",lockfileVersion:3,requires:true,packages:{"":{name:"controlled-g02-image",version:"1.0.0",dependencies:{lodash:version}},"node_modules/lodash":{version,resolved:`https://registry.npmjs.org/lodash/-/lodash-${version}.tgz`}}});
 const layer=fixtureTar({"app/package-lock.json":lock,"app/node_modules/lodash/package.json":JSON.stringify({name:"lodash",version,license:"MIT"}),"etc/os-release":'NAME="Controlled fixture"\nID=controlled\nVERSION_ID="1"\n'});
 const json=(v:unknown)=>Buffer.from(JSON.stringify(v));
 const config=json({architecture:"amd64",os:"linux",rootfs:{type:"layers",diff_ids:["sha256:"+sha(layer)]},config:{User:"65532:65532"}});
 const descriptor=(b:Buffer,mediaType:string)=>({mediaType,size:b.length,digest:"sha256:"+sha(b)});
 const manifest=json({schemaVersion:2,mediaType:"application/vnd.oci.image.manifest.v1+json",config:descriptor(config,"application/vnd.oci.image.config.v1+json"),layers:[descriptor(layer,"application/vnd.oci.image.layer.v1.tar")]});
 const archive=fixtureTar({"oci-layout":json({imageLayoutVersion:"1.0.0"}),"index.json":json({schemaVersion:2,manifests:[descriptor(manifest,"application/vnd.oci.image.manifest.v1+json")]}),["blobs/sha256/"+sha(manifest)]:manifest,["blobs/sha256/"+sha(config)]:config,["blobs/sha256/"+sha(layer)]:layer});
 return {archive,scope:{reference:"wetscan-controlled/reviewed@sha256:"+sha(manifest),archiveSha256:sha(archive),archiveBytes:archive.length}};
}

import {expect,it,vi} from "vitest";
import {createHash} from "node:crypto";
import {inspectOciArchive,validateImageScope} from "../../../worker/guard/image-artifact";
import {controlledOciFixture,fixtureTar} from "../../../worker/guard/installation/oci-fixture";
vi.mock("server-only",()=>({}));
it("verifies all OCI blobs and binds target image separately from repository commit",()=>{
 const f=controlledOciFixture();const image=inspectOciArchive(f.archive,f.scope);
 expect(image.reference).toBe(f.scope.reference);expect(image.configDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
 expect(image.commitAssociation).toBe("OPERATOR_POLICY_NOT_BUILD_ATTESTATION");
 expect(controlledOciFixture(false).scope.reference).not.toBe(image.reference);
});
it.each(["archive","reference","length","blob"])("fails closed on tampered %s",kind=>{
 const f=controlledOciFixture();const bytes=Buffer.from(f.archive);const scope={...f.scope};
 if(kind==="archive")bytes[600]^=1;
 if(kind==="reference")scope.reference="wetscan-controlled/reviewed@sha256:"+"f".repeat(64);
 if(kind==="length")scope.archiveBytes++;
 if(kind==="blob"){bytes[bytes.length-1500]^=1;scope.archiveSha256=createHash("sha256").update(bytes).digest("hex");}
 expect(()=>inspectOciArchive(bytes,scope)).toThrow();
});
it("rejects paths, oversized scope and unpinned image references",()=>{
 expect(()=>fixtureTar({"../escape":"x"})).toThrow();
 expect(()=>validateImageScope({...controlledOciFixture().scope,reference:"alpine:latest",artifactRoot:"/tmp/wetscan-g02-image-artifacts-00000000-0000-0000-0000-000000000000"})).toThrow();
 expect(()=>validateImageScope({...controlledOciFixture().scope,archiveBytes:268435457,artifactRoot:"/tmp/wetscan-g02-image-artifacts-00000000-0000-0000-0000-000000000000"})).toThrow();
});

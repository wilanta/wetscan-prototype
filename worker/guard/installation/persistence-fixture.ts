/** Explicit real scanner + isolated PostgreSQL integration. Owner source/DB/credentials are never accessed. */
import {readFile,writeFile,mkdtemp,rename,realpath} from "node:fs/promises";
import {resolve,join} from "node:path";
import {tmpdir} from "node:os";
import {randomUUID,createHash} from "node:crypto";
import assert from "node:assert/strict";
import {createPostgresFixture} from "./postgres-fixture";
import {controlledOciFixture} from "./oci-fixture";
import {secureSnapshotDirectory} from "../../../src/features/guard/live/snapshot-directory";
import {createJob} from "../../../src/features/guard/pipeline";
import type {Grant,Engine} from "../../../src/features/guard/contracts";
import type {SourceAccess} from "../../../src/features/guard/live/model";
import {repositoryProfiles} from "../../../src/features/guard/live/scan-profiles";
import {repositoryScanKind,type RepositoryScanPolicy} from "../../../src/features/guard/live/product-policy";
import {PostgresGuardStore} from "../../../src/features/guard/live/persistence";
import {ProductSessionBroker} from "../product-broker";
import {repositoryJobHandler} from "../product-handler";
import {runRepositoryWorkerOnce} from "../product-runtime";
import {operationalRepositoryScanner} from "../scanner-adapter";
import {bindGuardJob} from "../approval";
import {ResourceRegistry} from "../acceptance/registry";
import {qualificationAttestation,verifyProductDatabase} from "../../../src/features/guard/live/product-preflight";
import {guardMigrationPlan} from "../../../src/features/guard/live/migrations";
import {PostgresGuardArtifacts} from "../../../src/features/guard/live/product-artifacts";
import {ApprovedPool,PlatformDatabase} from "../../../src/platform/database";
import type {ProductDeployment} from "../../../src/features/guard/live/product-deployment";
const sha=(b:string|Buffer)=>createHash("sha256").update(b).digest("hex");
export async function controlledPersistenceFixture() {
 const installation=JSON.parse(await readFile(resolve(".local/g02-completion-install/deployments.measured.json"),"utf8"));
 const f=await createPostgresFixture();
 const scope={mode:"live" as const,workspaceId:"github-user-79991:Controlled scanner persistence",projectId:"github-101"};
 const grant=():Grant=>({...scope,actorId:"github-user-79991",operations:["read","scan","triage","report"],issuedAt:Date.now(),expiresAt:Date.now()+60000});
 const commit="c".repeat(40),tree="d".repeat(40);
 const secret="ghp_"+Array.from({length:36},(_,i)=>"abcdefghijklmnopqrstuvwxyz0123456789"[(i*7+3)%36]).join("");
 const contents={"test.js":"const value = process.env.UNTRUSTED; eval(value);\n","test.tsx":"export default function View(p: {value:string}) { return <div dangerouslySetInnerHTML={{__html:p.value}}/>; }","sample-token.txt":"token = "+secret,"main.tf":'resource "aws_security_group" "fixture" {\n name="controlled"\n ingress {\n from_port=0\n to_port=0\n protocol="-1"\n cidr_blocks=["0.0.0.0/0"]\n }\n}\n',"package-lock.json":JSON.stringify({name:"controlled",version:"1.0.0",lockfileVersion:3,requires:true,packages:{"":{name:"controlled",version:"1.0.0",dependencies:{lodash:"4.17.15"}},"node_modules/lodash":{version:"4.17.15",resolved:"https://registry.npmjs.org/lodash/-/lodash-4.17.15.tgz"}}})};
 const entries=Object.entries(contents).map(([path,text])=>({path,size:Buffer.byteLength(text),type:"blob" as const,mode:"100644",sha:createHash("sha1").update("blob "+Buffer.byteLength(text)+"\0").update(text).digest("hex")}));
 const source:SourceAccess={authorize:async()=>({grant:grant(),repositoryId:"101",repositoryName:"fixture/wetscan-web",branch:"main",installationId:77,userId:79991}),open:async()=>({head:async()=>({commit,tree}),tree:async()=>({sha:tree,truncated:false,entries}),blob:async(hash)=>{const e=entries.find(e=>e.sha===hash)!;return {sha:hash,size:e.size,encoding:"base64",content:Buffer.from(contents[e.path as keyof typeof contents]).toString("base64")};},close:async()=>{}})};
 const imageFixture=controlledOciFixture(), staging=await mkdtemp(join(tmpdir(),"wetscan-g01-snapshot-image-staging-"));await secureSnapshotDirectory(staging);
 const artifactName=join(tmpdir(),"wetscan-g02-image-artifacts-"+randomUUID());await rename(staging,artifactName);const artifactRoot=await realpath(artifactName);await writeFile(join(artifactRoot,imageFixture.scope.archiveSha256+".oci.tar"),imageFixture.archive,{flag:"wx",mode:0o600});
 const store=new PostgresGuardStore(f.db.app,repositoryScanKind),workerStore=new PostgresGuardStore(f.db.worker,repositoryScanKind);
 const plan=await guardMigrationPlan();await verifyProductDatabase(f.pools.app,"app",{target:f.target},plan);await verifyProductDatabase(f.pools.worker,"worker",{target:f.target},plan);
 const results=[];
 for(const profile of ["quick","standard","full"] as const){
  const engines=[...repositoryProfiles[profile]],job=await createJob(grant(),{...scope,repository:{provider:"github",repositoryId:"101",branch:"main",commit},profile,engines,idempotencyKey:"g02-live-controlled-"+randomUUID()});
  job.audit.push({actorId:grant().actorId,at:new Date().toISOString(),action:"repository_scan_requested",subjectId:job.id,reason:"CONTROLLED_LOCAL_SOURCE_PROVIDER_NOT_OWNER_GITHUB_ACCEPTANCE"});
  const policy:RepositoryScanPolicy={version:1,id:"controlled-postgres-fixture",...scope,repositoryId:"101",branches:["main"],engines:engines as RepositoryScanPolicy["engines"],scannerTimeoutMs:45000,jobTimeoutMs:420000,maxAttempts:1,image:{...imageFixture.scope,artifactRoot}};
  const created=await store.create(grant(),job);assert.equal((await store.create(grant(),job)).job.id,created.job.id);
  const broker=new ProductSessionBroker(job,policy,source);
  const verifyLease=async(l:import("../../../src/features/sentinel/platform-contracts").JobLease)=>f.db.worker.scoped(job,async tx=>{const r=await f.db.worker.query(tx,"SELECT job_id FROM platform.jobs WHERE module='guard' AND job_id=$1 AND lease_token=$2 AND lease_owner=$3 AND state='leased' AND lease_until>clock_timestamp()",[job.id,l.leaseToken,l.workerId]);assert.equal(r.rowCount,1);});
  const handler=repositoryJobHandler({storage:workerStore,resolve:async(_j,l,current)=>({policy,freshGrant:()=>broker.freshGrant(),verifyLease,ports:{storage:workerStore.persistence({workerId:l.workerId,leaseToken:l.leaseToken},()=>broker.sourceCoverage()),snapshots:broker.snapshots,scanners:await Promise.all(engines.map(async engine=>{const d=installation.deployments.find((d: {engine:Engine})=>d.engine===engine);assert(d);return operationalRepositoryScanner({engine:d.engine,binding:bindGuardJob(job),policy,qualification:d.qualification,spec:d.spec,evidence:await qualificationAttestation(installation.privateRoot,d),sourceOwner:broker.owner,registry:new ResourceRegistry(installation.privateRoot),privateRoot:installation.privateRoot,freshGrant:()=>broker.freshGrant(),verifyLease:()=>verifyLease(current())});})),sandbox:{ready:true,readOnly:true,nonRoot:true,egressControlled:true,cpuLimit:1,memoryMb:256,pidsLimit:64,timeoutMs:45000}}})});
  const outcome=await runRepositoryWorkerOnce({db:f.db.worker,scope:job,jobId:job.id,workerId:"controlled-"+randomUUID(),handler,verifyReady:async()=>{},signal:new AbortController().signal,timeoutMs:policy.jobTimeoutMs});
  await broker.close();const stored=(await store.get(grant(),job,job.id))!;
  assert.equal(outcome.executorOutcome,"completed");assert(["completed","completed_partial"].includes(stored.job.status),JSON.stringify(stored.job.audit));
  for(const engine of engines)assert.equal(stored.job.runs.find(r=>r.engine===engine)?.status,"completed",JSON.stringify(stored.job.runs));
  assert(stored.job.findings.length>0);assert(!JSON.stringify(stored).includes(secret));
  assert.equal(await store.get({...grant(),workspaceId:"other"},{...scope,workspaceId:"other"},job.id),null);
  const queue=await f.admin.query("SELECT attempts,state,lease_owner,lease_token,lease_until FROM platform.jobs WHERE job_id=$1",[job.id]);assert.equal(queue.rows.length,1);assert.equal(queue.rows[0].attempts,1);assert.equal(queue.rows[0].state,"completed");assert.equal(queue.rows[0].lease_token,null);
  const artifacts=new PostgresGuardArtifacts(f.db.app),input={revision:stored.revision,findingId:stored.job.findings[0].id,status:"under_review",reason:"Controlled scanner persistence verification"};await artifacts.triage(grant(),scope,job.id,input);
  await assert.rejects(()=>artifacts.triage(grant(),scope,job.id,input));
  const updated=(await store.get(grant(),scope,job.id))!;await artifacts.createReport(grant(),scope,job.id,{revision:updated.revision});assert.equal((await artifacts.reports(grant(),scope,job.id)).length,1);
  const final=(await store.get(grant(),scope,job.id))!;
  const record={profile,scanId:job.id,status:final.job.status,revision:final.revision,findings:final.job.findings.length,engines:final.job.runs.filter(r=>engines.includes(r.engine)).map(r=>({engine:r.engine,status:r.status,artifactDigest:r.artifactDigest,cleanup:r.executionEvidence?.cleanup,coverage:r.coverage})),inventory:final.job.inventory?.length??0,sbom:!!final.job.sbom,triagePersisted:final.job.findings[0].status==="under_review",reportPersisted:true,duplicateCoalesced:true,crossWorkspaceRlsVerified:true,rawSecretAbsent:true};results.push(record);console.log(JSON.stringify({phase:"controlled_pg_scanner_profile",...record}));
 }
 // A separate pool after PostgreSQL restart proves persistence, not process memory.
 const config=f.config("app");await f.restart();const pool=new ApprovedPool(config),db=new PlatformDatabase(pool,false,"guard"),freshStore=new PostgresGuardStore(db,repositoryScanKind);
 for(const r of results){const read=await freshStore.get(grant(),scope,r.scanId);assert.equal(read?.revision,r.revision);assert.equal(read?.job.findings.length,r.findings);}
 await pool.end();
 const readConfig={version:1,module:"guard-product-runtime",hosting:"self_hosted_node",target:f.target};await writeFile(join(f.root,"product.readonly.json"),JSON.stringify(readConfig),{flag:"wx",mode:0o600});
 for(const purpose of ["app","worker"] as const){const c=f.config(purpose);await writeFile(join(f.root,purpose+".password"),c.password,{flag:"wx",mode:0o600});await writeFile(join(f.root,purpose+".approval.json"),JSON.stringify({...c.approval,module:"guard",purpose,role:c.user,expiresAt:new Date(Date.now()+3600000).toISOString()}),{flag:"wx",mode:0o600});}
 const result={classification:"REAL_SCANNERS_ISOLATED_POSTGRES_CONTROLLED_SOURCE_NOT_OWNER_ACCEPTANCE",fixtureDatabaseOnly:true,ownerRepositoryAccessed:false,ownerDatabaseAccessed:false,postgresRestartVerified:true,profiles:results};
 await writeFile(join(f.root,"result.json"),JSON.stringify(result,null,2),{flag:"wx"});
 return {fixture:f,scope,grant,results,result};
}
if(process.argv[1]?.replaceAll("\\","/").endsWith("/persistence-fixture.ts"))controlledPersistenceFixture().then(async r=>{await writeFile("test-results/g02-controlled-persistence."+r.fixture.runId+".json",JSON.stringify(r.result,null,2),{flag:"wx"});await r.fixture.destroy();console.log(JSON.stringify({phase:"controlled_fixture_closed",cleanupVerified:true}));}).catch(e=>{console.error(JSON.stringify({phase:"controlled_persistence_STOP",name:e.name,reason:e.message}));process.exitCode=1;});

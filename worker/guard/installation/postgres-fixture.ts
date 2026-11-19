/** Test-only isolated PostgreSQL. Never connects to host5432 or uses owner credential references. */
import pg from "pg";
import {createServer} from "node:net";
import {mkdtemp,writeFile,readFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {randomUUID,randomBytes} from "node:crypto";
import {secureSnapshotDirectory} from "../../../src/features/guard/live/snapshot-directory";
import {migrationPlan} from "../../../src/platform/migrations";
import {guardMigrationPlan} from "../../../src/features/guard/live/migrations";
import {ApprovedPool,PlatformDatabase} from "../../../src/platform/database";
import {installationDocker} from "./qualify";
export async function createPostgresFixture() {
 const root=await mkdtemp(join(tmpdir(),"wetscan-g01-snapshot-pg-fixture-"));await secureSnapshotDirectory(root);
 const runId=randomUUID(),name="wetscan-g02-pg-fixture-"+runId,volume=name+"-data";
 const image="docker.io/library/postgres@sha256:12060a1464f232e4f8c721538b342687c6f17cead32a389586cd683262b1d848";
 const docker=installationDocker(process.env.G02_INSTALL_DOCKER??"","npipe:////./pipe/docker_engine",resolve(".local/g02-install/docker-config"));
 const port=await new Promise<number>((done,fail)=>{const s=createServer();s.on("error",fail);s.listen(0,"127.0.0.1",()=>{const n=(s.address() as {port:number}).port;s.close(()=>done(n));});});
 if(port===5432||port<1024)throw Error("fixture_port_denied");
 const target={host:"127.0.0.1",port,database:"wetscan_dev_guardg02",marker:"wetscan-s01:"+randomUUID()};
 const bootstrap=randomBytes(32).toString("hex"),passwords={app:randomBytes(32).toString("hex"),worker:randomBytes(32).toString("hex"),migration:randomBytes(32).toString("hex")};
 await writeFile(join(root,"bootstrap.password"),bootstrap,{flag:"wx",mode:0o600});
 await docker.call(["volume","create","--label","wetscan.fixture="+runId,volume]);
 const id=(await docker.call(["create","--name",name,"--label","wetscan.fixture="+runId,"--read-only","--cap-drop","ALL","--security-opt","no-new-privileges","--user","postgres","--cpus","1","--memory","512m","--pids-limit","128","--tmpfs","/tmp:rw,noexec,nosuid,size=32m","--tmpfs","/var/run/postgresql:rw,noexec,nosuid,size=8m","--mount",`type=volume,source=${volume},target=/var/lib/postgresql`,"--mount",`type=bind,source=${join(root,"bootstrap.password")},target=/run/fixture.password,readonly`,"--publish",`127.0.0.1:${port}:${port}`,"--env","POSTGRES_PASSWORD_FILE=/run/fixture.password","--env","POSTGRES_DB="+target.database,"--env","PGPORT="+port,"--env","PGDATA=/var/lib/postgresql/18/docker",image])).trim();
 const inspect=async()=>{const v=JSON.parse(await docker.call(["inspect","--format","{{json .}}",name]));if(v.Id!==id||v.Config.Labels["wetscan.fixture"]!==runId||v.HostConfig.PortBindings[port+"/tcp"]?.[0]?.HostIp!=="127.0.0.1"||v.HostConfig.PortBindings[port+"/tcp"][0].HostPort!==String(port))throw Error("fixture_identity_unknown");return v;};
 await inspect();await docker.call(["start",name]);
 const admin=new pg.Pool({host:target.host,port,database:target.database,user:"postgres",password:bootstrap,connectionTimeoutMillis:1000,max:1});
 let ready=false;for(let n=0;n<30;n++){try{await admin.query("SELECT 1");ready=true;break;}catch{await new Promise(r=>setTimeout(r,500));}}if(!ready)throw Error("fixture_database_not_ready");
 await inspect();const c=await admin.connect();
 try{await c.query("BEGIN");
  for(const role of ["wetscan_app","wetscan_sentinel_worker","wetscan_migrator"])await c.query(`CREATE ROLE ${role} NOLOGIN NOSUPERUSER NOBYPASSRLS`);
  for(const purpose of ["app","worker","migration"] as const){const role=purpose==="migration"?"wetscan_guard_migrator":"wetscan_guard_"+purpose;await c.query(`CREATE ROLE ${role} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD '${passwords[purpose]}'`);}
  await c.query(`ALTER DATABASE wetscan_dev_guardg02 OWNER TO wetscan_guard_migrator`);
  await c.query(`COMMENT ON DATABASE wetscan_dev_guardg02 IS '${target.marker}'`);
  await c.query("REVOKE ALL ON DATABASE wetscan_dev_guardg02 FROM PUBLIC");await c.query("GRANT CONNECT ON DATABASE wetscan_dev_guardg02 TO wetscan_guard_app,wetscan_guard_worker,wetscan_guard_migrator");
  await c.query("SET LOCAL ROLE wetscan_guard_migrator; CREATE SCHEMA platform; CREATE TABLE platform.schema_migrations(version text PRIMARY KEY,checksum char(64) NOT NULL,applied_at timestamptz NOT NULL DEFAULT clock_timestamp()); REVOKE ALL ON SCHEMA platform FROM PUBLIC");
  for(const m of (await migrationPlan()).migrations){await c.query(m.up);await c.query("INSERT INTO platform.schema_migrations(version,checksum) VALUES($1,$2)",[m.version,m.checksum]);}
  const plan=await guardMigrationPlan();await c.query(plan.migration.up);await c.query("INSERT INTO guard.schema_migrations(version,checksum) VALUES($1,$2)",[plan.migration.version,plan.migration.checksum]);
  await c.query("RESET ROLE");await c.query(await readFile("migrations/guard/platform-access.proposed.sql","utf8"));await c.query("COMMIT");
 }catch(e){await c.query("ROLLBACK");throw e;}finally{c.release();}
 const plan=await guardMigrationPlan();
 const config=(purpose:"app"|"worker")=>({target,purpose,user:"wetscan_guard_"+purpose,password:passwords[purpose],max:3,approval:{schemaVersion:1 as const,status:"APPROVED" as const,approvedBy:"isolated-controlled-fixture",approvedAt:new Date().toISOString(),target,actions:["runtime" as const],migrationPlanSha256:plan.sha256}});
 const pools={app:new ApprovedPool(config("app")),worker:new ApprovedPool(config("worker"))};
 const db={app:new PlatformDatabase(pools.app,false,"guard"),worker:new PlatformDatabase(pools.worker,true,"guard")};
 return {root,runId,target,db,pools,admin,config,async restart(){await pools.app.end();await pools.worker.end();await admin.end();await inspect();await docker.call(["restart",name]);},async destroy(){await pools.app.end().catch(()=>{});await pools.worker.end().catch(()=>{});await admin.end().catch(()=>{});await inspect();await docker.call(["rm","--force",name]);const v=JSON.parse(await docker.call(["volume","inspect",volume,"--format","{{json .}}"]));if(v.Labels["wetscan.fixture"]!==runId)throw Error("fixture_volume_identity");await docker.call(["volume","rm",volume]);}};
}

// Read-only recovery evidence. No marker removal, retry, CREATE, ALTER, INSERT, UPDATE or DELETE.
import {spawnSync} from "node:child_process";
import {readFile,writeFile,open} from "node:fs/promises";
import {createHash,randomUUID} from "node:crypto";
import {join,resolve} from "node:path";
const sql=resolve("docs/acceptance/guard-g01/13-recovery-readonly-state.sql");
const sha=s=>createHash("sha256").update(s).digest("hex");
if(sha((await readFile(sql,"utf8")).replace(/\r\n/g,"\n"))!=="5d836b7d379a6b54955a0e6125a17465d704c68e5de36e3bf64d88eca552e710")throw Error("state_sql_integrity_failure");
if(!process.argv.includes("--execute")){console.log(JSON.stringify({status:"READONLY_READY_FOR_OWNER_LOGIN",databaseConnections:0}));process.exit(0);}
const root=resolve(".local/sentinel/guard-g01-unblock"),id=randomUUID();
const file=join(root,"postgres-readonly-state-"+id+".txt"),output=await open(file,"wx");
const env={};for(const k of ["SystemRoot","WINDIR","TEMP","TMP"])if(process.env[k])env[k]=process.env[k];
env.PGPASSFILE=join(root,"intentionally-absent-pgpass");env.PGSERVICEFILE=join(root,"intentionally-absent-pgservice");env.PGSYSCONFDIR=join(root,"no-system-pg-config");env.PGCONNECT_TIMEOUT="5";env.PGAPPNAME="wetscan-guard-g01-readonly-recovery";
console.log("READ ONLY target G01. Isi login postgres hanya pada prompt terminal; password tidak direkam.");
const startedAt=new Date().toISOString();
const r=spawnSync("C:/Program Files/PostgreSQL/18/bin/psql.exe",["--no-psqlrc","--password","--host=localhost","--port=5432","--username=postgres","--dbname=wetscan_s01_test_guardg01","--set=ON_ERROR_STOP=1","--quiet","--tuples-only","--no-align","--file="+sql],{env,stdio:["inherit",output.fd,"inherit"],windowsHide:false});
await output.close();
const metadata={startedAt,endedAt:new Date().toISOString(),exitCode:r.status,spawnError:r.error?.code,output:file,sqlSha256:"5d836b7d379a6b54955a0e6125a17465d704c68e5de36e3bf64d88eca552e710",databaseMutation:false,priorMarkers:"PRESERVED"};
const evidence=join(root,"postgres-readonly-state-"+id+".json");await writeFile(evidence,JSON.stringify(metadata,null,2)+"\n",{flag:"wx"});
console.log(JSON.stringify({status:r.status===0?"READONLY_COMPLETED":"READONLY_CONNECTION_OR_QUERY_FAILED",evidence,output:file,exitCode:r.status}));process.exitCode=r.status??2;

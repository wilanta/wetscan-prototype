// Owner-run interactive psql only. Never captures credentials or reads dotenv/pgpass.
import {spawnSync} from "node:child_process";
import {readFile,writeFile,lstat} from "node:fs/promises";
import {createHash} from "node:crypto";
import {resolve,join} from "node:path";
const expectedBundle="e6f3b28cd49ac8c875a20b034338645dc4e14a8f81036e200f453f0337a05f01";
const expectedWrapper="3dafe7badf1c553121ba4299db63f1b6195de5fbf42d0fdccf37a84d6d8529c6";
const sha=s=>createHash("sha256").update(s).digest("hex");
const packageRoot=resolve("docs/acceptance/guard-g01");
const local=resolve(".local/sentinel/guard-g01-unblock");
const plan=JSON.parse(await readFile(join(packageRoot,"manifest.json"),"utf8"));
if(plan.bundleSha256!==expectedBundle || sha(JSON.stringify(plan.binding))!==expectedBundle)throw Error("package_integrity_failure");
for(const a of plan.binding.artifacts){
 const p=a.file.startsWith("tests/")?resolve(a.file):join(packageRoot,a.file);
 if(!/^(?:tests\/guard\/g01\/postgres\.acceptance\.ts|[0-9][0-9]-[a-zA-Z0-9.-]+\.sql)$/.test(a.file) || sha((await readFile(p,"utf8")).replace(/\r\n/g,"\n"))!==a.sha256)throw Error("artifact_integrity_failure");
}
const wrapper=join(packageRoot,"operator-bootstrap.psql");
if(sha((await readFile(wrapper,"utf8")).replace(/\r\n/g,"\n"))!==expectedWrapper)throw Error("wrapper_integrity_failure");
if(!process.argv.includes("--execute")){
 console.log(JSON.stringify({status:"READY_FOR_OWNER_LOGIN",bundleSha256:expectedBundle,databaseConnections:0,command:"node tests/guard/g01/postgres-launcher.mjs --execute"}));process.exit(0);
}
const permission=JSON.parse(await readFile(join(local,"owner-approval-record.json"),"utf8"));
if(permission.status!=="APPROVED" || permission.databaseBundleSha256!==expectedBundle || Date.parse(permission.expiresAt)<=Date.now() || permission.target?.database!=="wetscan_s01_test_guardg01" || permission.target?.port!==5432 || permission.target?.host!=="localhost")throw Error("approval_required_or_expired");
const logs=["C:/laragon/www/wetscan-2/wetscan-guard-g01-s03-candidate/.local/sentinel/guard-g01-unblock/postgres-bootstrap-00.txt", "C:/laragon/www/wetscan-2/wetscan-guard-g01-s03-candidate/.local/sentinel/guard-g01-unblock/postgres-bootstrap-01.txt", "C:/laragon/www/wetscan-2/wetscan-guard-g01-s03-candidate/.local/sentinel/guard-g01-unblock/postgres-bootstrap-02.txt", "C:/laragon/www/wetscan-2/wetscan-guard-g01-s03-candidate/.local/sentinel/guard-g01-unblock/postgres-bootstrap-03.txt", "C:/laragon/www/wetscan-2/wetscan-guard-g01-s03-candidate/.local/sentinel/guard-g01-unblock/postgres-bootstrap-04.txt", "C:/laragon/www/wetscan-2/wetscan-guard-g01-s03-candidate/.local/sentinel/guard-g01-unblock/postgres-bootstrap-05.txt", "C:/laragon/www/wetscan-2/wetscan-guard-g01-s03-candidate/.local/sentinel/guard-g01-unblock/postgres-bootstrap-06-before.txt", "C:/laragon/www/wetscan-2/wetscan-guard-g01-s03-candidate/.local/sentinel/guard-g01-unblock/postgres-bootstrap-07.txt", "C:/laragon/www/wetscan-2/wetscan-guard-g01-s03-candidate/.local/sentinel/guard-g01-unblock/postgres-bootstrap-08.txt", "C:/laragon/www/wetscan-2/wetscan-guard-g01-s03-candidate/.local/sentinel/guard-g01-unblock/postgres-bootstrap-09.txt", "C:/laragon/www/wetscan-2/wetscan-guard-g01-s03-candidate/.local/sentinel/guard-g01-unblock/postgres-bootstrap-06-after-schema.txt"];
for(const file of logs){try{await lstat(file);throw Error("existing_evidence_refuse_overwrite");}catch(e){if(e.code!=="ENOENT")throw e;}}
await writeFile(join(local,"postgres-bootstrap.started.json"),JSON.stringify({bundleSha256:expectedBundle,startedAt:new Date().toISOString()})+"\n",{flag:"wx"});
const env={};
for(const k of ["SystemRoot","WINDIR","TEMP","TMP"])if(process.env[k])env[k]=process.env[k];
env.PGPASSFILE=join(local,"intentionally-absent-pgpass");env.PGSERVICEFILE=join(local,"intentionally-absent-pgservice");env.PGSYSCONFDIR=join(local,"no-system-pg-config");env.PGCONNECT_TIMEOUT="5";env.PGAPPNAME="wetscan-guard-g01-owner-bootstrap";
const args=["--no-psqlrc","--password","--host=localhost","--port=5432","--username=postgres","--dbname=postgres","--set=ON_ERROR_STOP=1","--file="+wrapper];
console.log("Login operator postgres menggunakan prompt password tersembunyi. Jangan kirim password ke chat. SQL hanya pada target G01 yang telah disetujui.");
const result=spawnSync("C:/Program Files/PostgreSQL/18/bin/psql.exe",args,{env,stdio:"inherit",windowsHide:false});
await writeFile(join(local,"postgres-bootstrap.exit.json"),JSON.stringify({bundleSha256:expectedBundle,endedAt:new Date().toISOString(),exitCode:result.status,spawnError:result.error?.code,sqlAcceptance:"REQUIRES_OUTPUT_REVIEW"})+"\n",{flag:"wx"});
process.exitCode=result.status??2;

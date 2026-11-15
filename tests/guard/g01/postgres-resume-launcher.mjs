// Owner-run interactive psql only. Never captures credentials or reads dotenv/pgpass.
import {spawnSync} from "node:child_process";
import {readFile,writeFile,lstat} from "node:fs/promises";
import {createHash} from "node:crypto";
import {resolve,join} from "node:path";
const expectedBundle="fab43564e7c93293fa7d1149b7da980a33e7a526974e53e46772d98c695a3bfb";
const expectedWrapper="9e44e008c8377a46cc8e3d922089b838f8ffd828b6598055dfabdc0abbd39ea7";
const sha=s=>createHash("sha256").update(s).digest("hex");
const packageRoot=resolve("docs/acceptance/guard-g01");
const local=resolve(".local/sentinel/guard-g01-unblock");
const plan=JSON.parse(await readFile(join(packageRoot,"resume-manifest.json"),"utf8"));
if(plan.bundleSha256!==expectedBundle || sha(JSON.stringify(plan.binding))!==expectedBundle)throw Error("package_integrity_failure");
for(const a of plan.binding.artifacts){
 const p=a.file.startsWith("tests/")?resolve(a.file):join(packageRoot,a.file);
 if(!/^(?:tests\/guard\/g01\/postgres\.acceptance\.ts|[0-9][0-9]-[a-zA-Z0-9.-]+\.sql)$/.test(a.file) || sha((await readFile(p,"utf8")).replace(/\r\n/g,"\n"))!==a.sha256)throw Error("artifact_integrity_failure");
}
const wrapper=join(packageRoot,"operator-resume.psql");
if(sha((await readFile(wrapper,"utf8")).replace(/\r\n/g,"\n"))!==expectedWrapper)throw Error("wrapper_integrity_failure");
if(!process.argv.includes("--execute")){
 console.log(JSON.stringify({status:"READY_FOR_OWNER_LOGIN",bundleSha256:expectedBundle,databaseConnections:0,command:"node tests/guard/g01/postgres-resume-launcher.mjs --execute"}));process.exit(0);
}
const permission=JSON.parse(await readFile(join(local,"postgres-resume-approval.json"),"utf8"));
if(permission.status!=="APPROVED" || permission.databaseBundleSha256!==expectedBundle || Date.parse(permission.expiresAt)<=Date.now() || permission.target?.database!=="wetscan_s01_test_guardg01" || permission.target?.port!==5432 || permission.target?.host!=="localhost")throw Error("approval_required_or_expired");
const logs=["C:/laragon/www/wetscan-2/wetscan-guard-g01-s03-candidate/.local/sentinel/guard-g01-unblock/postgres-resume-11-resume-readonly-preflight.txt", "C:/laragon/www/wetscan-2/wetscan-guard-g01-s03-candidate/.local/sentinel/guard-g01-unblock/postgres-resume-10-resume-guard-platform-access.txt", "C:/laragon/www/wetscan-2/wetscan-guard-g01-s03-candidate/.local/sentinel/guard-g01-unblock/postgres-resume-08-guard-schema.txt", "C:/laragon/www/wetscan-2/wetscan-guard-g01-s03-candidate/.local/sentinel/guard-g01-unblock/postgres-resume-09-readonly-security-verification.txt", "C:/laragon/www/wetscan-2/wetscan-guard-g01-s03-candidate/.local/sentinel/guard-g01-unblock/postgres-resume-12-post-resume-readonly-verification.txt", "C:/laragon/www/wetscan-2/wetscan-guard-g01-s03-candidate/.local/sentinel/guard-g01-unblock/postgres-resume-06-preservation-observer.txt"];
for(const file of logs){try{await lstat(file);throw Error("existing_evidence_refuse_overwrite");}catch(e){if(e.code!=="ENOENT")throw e;}}
await writeFile(join(local,"postgres-resume.started.json"),JSON.stringify({bundleSha256:expectedBundle,startedAt:new Date().toISOString()})+"\n",{flag:"wx"});
const env={};
for(const k of ["SystemRoot","WINDIR","TEMP","TMP"])if(process.env[k])env[k]=process.env[k];
env.PGPASSFILE=join(local,"intentionally-absent-pgpass");env.PGSERVICEFILE=join(local,"intentionally-absent-pgservice");env.PGSYSCONFDIR=join(local,"no-system-pg-config");env.PGCONNECT_TIMEOUT="5";env.PGAPPNAME="wetscan-guard-g01-owner-bootstrap";
const args=["--no-psqlrc","--password","--host=localhost","--port=5432","--username=postgres","--dbname=wetscan_s01_test_guardg01","--set=ON_ERROR_STOP=1","--file="+wrapper];
console.log("Login operator postgres menggunakan prompt password tersembunyi. Jangan kirim password ke chat. SQL hanya pada target G01 yang telah disetujui.");
const result=spawnSync("C:/Program Files/PostgreSQL/18/bin/psql.exe",args,{env,stdio:"inherit",windowsHide:false});
await writeFile(join(local,"postgres-resume.exit.json"),JSON.stringify({bundleSha256:expectedBundle,endedAt:new Date().toISOString(),exitCode:result.status,spawnError:result.error?.code,sqlAcceptance:"REQUIRES_OUTPUT_REVIEW"})+"\n",{flag:"wx"});
process.exitCode=result.status??2;

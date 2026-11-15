import type{SqlPool,SqlClient}from"../../../src/platform/database";
import{applyGuardSchema}from"../../../src/features/guard/live/schema-runner";
import type{guardMigrationPlan}from"../../../src/features/guard/live/migrations";
import{LiveGuardError}from"../../../src/features/guard/live/model";
/** A dedicated connection only; never change a shared app/worker session's defaults. */
export async function alreadyAppliedOnly(pool:SqlPool,plan:Awaited<ReturnType<typeof guardMigrationPlan>>,approval:unknown){
 const client=await pool.connect();let released=false;
 try{
  await client.query("SET default_transaction_read_only=on");
  const before=await client.query("SELECT version,checksum FROM guard.schema_migrations ORDER BY version");
  if(before.rows.length!==1||before.rows[0].version!==plan.migration.version||before.rows[0].checksum!==plan.migration.checksum)throw new LiveGuardError("revision_conflict",409);
  const bounded:SqlClient={query:(sql,values)=>{if(/\b(?:CREATE|ALTER|DROP|INSERT|UPDATE|DELETE|TRUNCATE)\b/i.test(sql))throw new LiveGuardError("approval_required");return client.query(sql,values);},release:()=>{released=true;}};
  const result=await applyGuardSchema({connect:async()=>bounded,end:async()=>{}},plan,approval);
  if(result.status!=="already_applied")throw new LiveGuardError("execution_not_ready");
  return{status:"already_applied",ddlStatements:0,defaultReadOnly:true};
 }finally{
  // Always destroy this private session: no modified default leaks into a shared pool.
  try{if(!released)await client.query("ROLLBACK");}finally{client.release(true);await pool.end();}
 }
}

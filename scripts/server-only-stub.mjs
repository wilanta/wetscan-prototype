/** Node has no `server-only` package (Next aliases it at build time). Standalone G04 workers/scripts resolve it to an empty module. */
import { register } from "node:module";
register("data:text/javascript," + encodeURIComponent(`export async function resolve(s,c,n){return s==="server-only"?{url:"data:text/javascript,",shortCircuit:true}:n(s,c)}`));

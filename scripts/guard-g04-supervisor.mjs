// Restarts the G04 dispatcher when it asks for it (exit 75: G02 host quarantined) or crashes; bounded so a hard fault does not spin.
//   node scripts/guard-g04-supervisor.mjs      (same environment as `npm run guard:g04:dispatcher`)
import { spawn } from "node:child_process";
const args = ["--conditions=react-server", "--env-file-if-exists=.env.local", "--import", "./scripts/server-only-stub.mjs", "--import", "tsx", "scripts/guard-g04-dispatcher.ts"];
const starts = [];
let child, stopping = false;
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => { stopping = true; child?.kill(); });
async function loop() {
  while (!stopping) {
    const now = Date.now();
    while (starts.length && now - starts[0] > 600000) starts.shift();
    if (starts.length >= 6) { console.error(JSON.stringify({ event: "g04_supervisor_giving_up", restartsIn10Min: starts.length })); process.exit(1); }
    starts.push(now);
    const code = await new Promise((resolve) => { child = spawn(process.execPath, args, { stdio: "inherit", windowsHide: true }); child.once("exit", (c) => resolve(c)); });
    if (stopping) break;
    console.log(JSON.stringify({ event: "g04_supervisor_restart", exitCode: code, afterMs: Date.now() - now }));
    await new Promise((r) => setTimeout(r, code === 75 ? 2000 : 8000));
  }
}
loop();

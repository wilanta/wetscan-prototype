# Existing Next dev startup from Windows CMD

Verified 2026-11-15T21:12:03.145528+07:00. No environment/dependency/source configuration is changed by this correction. No worker, enqueue or actual server startup occurred during validation.

Installed Node24.17.0 supports the sidecar flag, but installed Next forwards initial process.execArgv through formatted NODE_OPTIONS when spawning its dev child. Its execArgv-only exclusion list omits env-file. The resulting child rejects --env-file= in NODE_OPTIONS, even when the parent variable was cleared. Reproduced exit9 with the actual Next formatter. This is not evidence of invalid G01 credentials or a need to edit.env.

Use the unchanged npm dev script, loading G01 through Node's API before spawning a NORMAL new npm/Node process. That child inherits G01 environment values, without inheriting the CLI env-file flag. Existing Auth config remains loaded by normal Next startup.

```bat
cd /d C:\laragon\www\wetscan-2\wetscan-guard-g01-s03-candidate
node -e "process.loadEnvFile('.env.guard-g01.worker-49f2240c.local');const r=require('node:child_process').spawnSync('cmd.exe',['/d','/s','/c','npm.cmd run dev -- --hostname 127.0.0.1 --port 3000'],{stdio:'inherit',env:process.env});process.exit(r.status??1)"
```

Only one existing app process should own the actual Auth store; stop the prior app normally if running. Do not kill unrelated Node processes. The appended hostname overrides package.json's0.0.0.0 with loopback127.0.0.1; confirmed using the actual installed Commander parser. No package.json modification.

Dry-run used the same CMD/npm command with --help and exited0, Guard/source/worker path-presence checks true, NODE_OPTIONS absent. No values printed, no.env contents inspected by agent, no.env changes, no Next app/worker/enqueue started by the agent. Actual UI readiness must be verified by owner after the command. Operator permits still WAITING_USER. Verify metadata only; source/enqueue/launch require explicit exact-binding execution approval. Reexport draft if UI state changes; never reuse an approval for a new job ID.

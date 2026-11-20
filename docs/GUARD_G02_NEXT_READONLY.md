# Next owner-process check ? no scan authority

G02 code and real controlled Docker handoff are verified. The active owner config was not changed. Use this one reference-only switch because old sandbox qualification expired; it is not DB/password setup. Keep existing Auth and four DB references in the same legitimate owner terminal. No credential contents or paths need to be sent to chat.

1. Stop only your known integration server normally with Ctrl+C, keeping its terminal and references. Run this whole block:

```powershell
Set-Location 'C:\laragon\www\wetscan-2\wetscan-guard-mvp-local-demo'
$g02NextConfig = Join-Path (Get-Location).Path '.local\wetscan-g02-runtime-fixture-773d49fc3fb046839cd7a5d216920026\product.sast-preflight.json'
if (-not (Test-Path -LiteralPath $g02NextConfig -PathType Leaf)) { throw 'G02_CONFIG_NOT_VISIBLE_STOP' }
if ((Get-FileHash -LiteralPath $g02NextConfig -Algorithm SHA256).Hash.ToLowerInvariant() -ne '77e007dbcac3be120f61d9df25f6aa36bcb437da1cd0fcd4579df4c5c92a7635') { throw 'G02_CONFIG_HASH_STOP' }
$env:GUARD_PRODUCT_CONFIG_FILE = (Get-Item -LiteralPath $g02NextConfig).FullName
$env:GUARD_PRODUCT_ENABLED = '0'
npm.cmd run guard:dev
```

2. In the existing owner session localhost:3000, run the ENTIRE `test-results/g02-next-preflight.READONLY.js` once. It collects preflight then, only when ready, pinned revision metadata. Send its actual safe JSON lines. If blocked/error/unknown, STOP without bypass/retry/login reset. No Start/Resume/worker/scanner/snapshot/cancellation or DB mutation.

Config is SAST-only, same target/project policy and immutable scanner image. Qualification expires **19 November 2026, 19:20:33 WIB**; if expired, sandbox readiness must fail closed. Expiry does not require reprovisioning or password setup. Successful output is metadata, never runtime scan authority. A new explicit live approval is still required. The first failed job is preserved and cannot be replayed under this procedure.

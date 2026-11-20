# G03 — metadata preflight berhasil; prasyarat runtime SAST

**Current owner proof (20 November 2026): worker exact-target READ ONLY proof and pinned-image metadata verified; one DB connection rolled back/closed, three Docker metadata calls, Linux daemon 29.7.2, exit 0/no stderr, zero containers created. Do not repeat proof. Qualification and website worker attachment remain NOT_RUN. See [the controlled multi-CLI qualification plus NEW SAST configuration proposal](GUARD_G03_CONTROLLED_QUALIFICATION_SETUP.md); NEW approval required, NOT_EXECUTED. No owner source/scan/AI/GitHub write/retest. G03 remains PARTIAL.**


**Current owner inventory (20 November 2026): scanner non-secret inventory completed; g02-install image ID and rules manifest hash recorded, completion image manifest not projected, product.runtime.json not projected and Temp measurement NOT_READ. These are not Docker/qualification proof or target mismatch evidence. Reader remains verified; no source/scan/AI/GitHub write/retest. Do not repeat inventory. See [the bounded worker-role plus pinned-image READ ONLY proposal](GUARD_G03_WORKER_IMAGE_PREFLIGHT.md); NEW approval required, NOT_EXECUTED. G03 PARTIAL.**


20 November 2026, Asia/Jakarta. **METADATA_PREFLIGHT_OBSERVED / SCANNER_DISABLED / G03 PARTIAL.** Dokumen ini memperbarui status proposal POST pada dokumen reader sebelumnya. Receipt berasal dari owner; agent tidak mengirim request atau membaca credential. Jangan mengulang POST yang telah selesai.

## Bukti yang sudah tersedia

Satu POST existing `/api/guard/projects/github-1465216209/preflight` menghasilkan HTTP 200. Collector memvalidasi authorization dan exact repository/project binding sebelum menyimpan workspace/actor binding di memory browser owner. Receipt aman ada di [received-owner-preflight.json](acceptance/guard-g03/20261120-runtime-metadata-verified/received-owner-preflight.json).

| Komponen | Hasil aktual | Batas kesimpulan |
| --- | --- | --- |
| Configuration | TARGET_VERIFIED | Endpoint tidak mengekspor target; continuity exact target berasal dari app proof dan attachment sebelumnya |
| App DB | READONLY_TARGET_ROLE_SCHEMA_RLS_VERIFIED | Reader berhasil; tidak memberikan izin menulis DB atau enqueue |
| Policy | NOT_VERIFIED | Policy untuk workspace/project acceptance belum terbukti; jangan mengaktifkan policy wdu |
| Sandbox | CONFIGURATION_QUALIFICATION_OR_IMAGE_NOT_READY | Pesan gabungan; tidak menentukan apakah image hilang, qualification kedaluwarsa, atau deployment belum dikonfigurasi |
| Worker | REFERENCE_MISSING_IN_THIS_PROCESS; dua presence flags false | Belum ada percobaan autentikasi worker pada request ini; bukan bukti salah password atau kerusakan DB |
| Operasi | runtimeOperations=0; source/scanner/AI/GitHub write false | Metadata preflight, bukan Live Acceptance |

Binding hanya ada di `globalThis.__wetscanG03OwnerRuntimeBinding` pada browser owner. Jangan kirim object itu ke chat atau menyalinnya ke cookie/localStorage. Pertahankan tab tersebut untuk persiapan policy lokal berikutnya. Jika binding hilang karena tab ditutup/reload, laporkan; jangan mengulang POST tanpa meninjau scope persetujuan satu request yang telah terpakai.

Baseline tetap `inkAja/wetscan-g03-acceptance`, repository `1465216209`, project `github-1465216209`, Private, branch `g03/acceptance-base`, SHA `6eb920a5573c39105fa0390d464d271fb1c7b5bf`. Owner telah mengonfirmasi SHA pada baris branch; tree/blob/source belum diperoleh atau diverifikasi. Riwayat project yang dibaca sebelumnya kosong, sehingga belum ada finding G02 nyata untuk menjalankan G03.

## Proposal satu inventory non-secret — belum diizinkan/dijalankan

Review `.local/g03-owner-selection/inventory-scanner-metadata.ps1`. Approval POST metadata yang sudah dipakai tidak mencakup pembacaan JSON instalasi lokal ini; diperlukan approval baru. Blok ditinjau lalu ditempel di console PowerShell owner terpisah pada worktree existing. Jangan menghentikan server website atau mengubah execution policy.

Scope hanya:

- Dua direktori instalasi existing `.local/g02-install` dan `.local/g02-completion-install`: membaca `built-image.json` dan `context/rules-manifest.json`, bukan binary, rule source, database scanner atau Docker config.
- Immediate directory metadata `.local/wetscan-g02-runtime-db-<UUID>` (maksimal delapan kandidat), hanya `product.runtime.json`. Tidak membaca approval/password/bootstrap/target-only atau pointer kembali. Tidak membuka `.env` atau Auth state.
- Jika JSON runtime memiliki target yang sama dengan reader terbukti, ikuti hanya `privateRoot` yang merupakan immediate child `%TEMP%` bernama `wetscan-g02-runtime-*` selain `db-*`, hanya membaca `deployments.measured.json`. Tidak melakukan pencarian Temp rekursif, memilih target otomatis atau membaca raw scanner output/history.

Symlink/reparse pada file dan parent ditolak. File dibatasi 128 KiB. Output hanya ordinal, status, image ID berformat SHA256, hash manifest, engine, waktu qualification dan boolean expiry. Workspace, actor, path privat, raw exception dan unknown fields tidak dicetak. Presence dan expiry bukan bukti physical qualification; `selectedForUse` selalu false. Missing/invalid/denied diproyeksikan sebagai status, tanpa retry atau fallback path.

Tidak menjalankan Node/helper, Docker, scanner, qualification, SQL, network, install, credential loader, environment change, file write, startup/restart, AI, GitHub write atau retest. Ini hanya inventory yang memungkinkan proposal setup berikutnya tepat terhadap instalasi existing, bukan izin memakai instalasi atau menyalin qualification lama.

Pemeriksaan saat persiapan: AST PowerShell tanpa menjalankan script; hasil parse dicatat pada evidence proposal. Belum functional tested pada lingkungan owner dan belum ada receipt inventory aktual. Jangan menafsirkan syntax PASS sebagai runtime PASS.

## Rancangan runtime yang sudah dapat ditentukan secara offline

Gunakan konfigurasi G03 baru yang terpisah pada tahap setup yang kelak diizinkan. Pertahankan byte policy/config Will/wdu, credential existing, database historis, dan evidence qualification lama. Jangan menjalankan helper G02 `verify`, provisioning, default `config`, reset atau migrasi.

Policy harus mengikuti kontrak existing `RepositoryScanPolicy`:

```json
{
  "version": 1,
  "id": "g03-acceptance-sast-only-v1",
  "workspaceId": "<exact binding di memory browser owner; jangan ditebak>",
  "projectId": "github-1465216209",
  "repositoryId": "1465216209",
  "branches": ["g03/acceptance-base"],
  "engines": ["sast"],
  "scannerTimeoutMs": 45000,
  "jobTimeoutMs": 120000,
  "maxAttempts": 1
}
```

Ini **template belum operasional**; bukan file deployment valid atau scan approval. Kontrak policy tidak mempunyai field commit/path allowlist. Exact baseline pin, empat file baseline dan batas 1.374 byte harus diverifikasi dan dibatasi pada source acquisition/job admission terpisah; jangan menambahkan field fiktif lalu mengklaim enforcement. Default branch `main` tidak dipakai.

Worker credential existing hanya boleh dipakai melalui loader existing untuk target `localhost:5432/wetscan_dev_guardg02`, marker `wetscan-s01:f0927e49-0e70-4b90-913f-6cd6984df9d8`, role `wetscan_guard_worker`, plan `b63e1e8568babcf8d7811fe0fa735ecbec11ade64df19bdea78deb030a85869d`, dengan approval tahap berikutnya. Ref worker belum dipasang dan app-only keberhasilan bukan proof worker. Expiry metadata approval terdahulu adalah 21 November 2026 17:00 UTC (22 November 2026 00:00 WIB); loader tetap harus memvalidasi expiry aktual saat dipakai. Jangan renew/membuat credential diam-diam.

Qualification yang dapat dipakai harus fresh, dengan image/spec/rules digest yang cocok dan actual isolation/output/timeout/cancel/OOM/owned-cleanup evidence. Kontrak membatasi validity satu jam sejak measurement; jangan menyalin atau mengubah timestamp. Dokumentasi G02 mencatat measurement 19 November; itu tidak berlaku sebagai qualification fresh pada 20 November. Inventory berikutnya akan memeriksa apakah ada record existing lain tanpa menganggapnya tersedia.

Tool existing `qualify.ts --full` dan `measured.ts` mengukur/mewajibkan beberapa scanner, bukan hanya SAST. Jika digunakan, approval controlled qualification harus menyebut scope multi-CLI yang sebenarnya, terpisah dari baseline repository scan SAST-only. Jangan mengklaim tersedia flag `--sast-only`, menjalankan tool broad di bawah izin sempit, atau mengubah fondasi G02. Pertahankan batas sandbox dan resource serta owned cleanup. CLI standalone yang memiliki import `server-only` juga harus disiapkan dan diperiksa offline sebelum diajukan untuk eksekusi, tanpa stub/alias bypass.

Sesudah inventory: siapkan satu proposal setup konkret berdasarkan image/root/expiry aktual, mencakup worker read-only proof, qualification yang tepat bila diperlukan, konfigurasi SAST G03 baru, serta environment attachment yang terpisah. Jangan menjalankan tahap-tahap itu otomatis. Setelah setup terbukti, baru ajukan satu baseline G02 SAST pada pin dan empat file yang diotorisasi. AI maksimal US$0,10, patch review, GitHub draft PR, behavioral execution dan verified retest tetap memerlukan persetujuan tahap masing-masing.

Tidak ada perubahan kode G03/G02, Auth, Sentinel atau ZIP baseline pada tahap ini. AI provider nyata, PR nyata dan verified retest repository asli belum terbukti. **G03 tetap PARTIAL.**

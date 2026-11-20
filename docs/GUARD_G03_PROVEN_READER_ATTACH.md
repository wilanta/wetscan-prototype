# G03 - memasang reader website setelah proof app-role

**Website reader verified from owner receipts (20 November 2026):** three app references attached; onboarding/readiness/history all GET 200; both repositories retained; database approved/schema verified; project scan history empty (not a clean scan). Scanner remains disabled by design. Owner separately confirmed g03/acceptance-base HEAD equals baseline 6eb920a5573c39105fa0390d464d271fb1c7b5bf; tree/blob unverified. See [next metadata/runtime prerequisites](GUARD_G03_READER_VERIFIED_NEXT_METADATA.md). A single POST metadata preflight is proposed but requires new approval beyond prior GET-only scope; no source/scan/AI/GitHub write/retest. G03 remains PARTIAL.

20 November 2026. **APP_ROLE_PROOF_VERIFIED / WEBSITE_READER_PENDING / G03 PARTIAL.** Proof dan pemasangan website adalah dua tahap berbeda.

## Bukti owner yang diterima

Receipt `guard-g03-existing-app-proof-v1` menyatakan **READONLY_PROOF_VERIFIED**, native exit 0, tanpa stderr:

- exact target `localhost:5432/wetscan_dev_guardg02`, marker `wetscan-s01:f0927e49-0e70-4b90-913f-6cd6984df9d8`;
- `wetscan_guard_app`, satu connection attempt;
- transaction read-only, identity, schema dan metadata FORCE RLS lolos;
- rollback dan pool close sukses;
- tanpa bootstrap/helper lama, perubahan file/environment, restart, scan atau source acquisition.

Ini bukti nyata **owner-operated app-role read-only metadata proof**, bukan hasil double, tetapi tetap bukan Live Acceptance remediation. Tidak membuktikan worker authentication, cross-project data isolation, kesiapan scanner, finding repository, AI, PR atau retest. `phase:COMPLETE` pada receipt hanya phase probe, bukan status G03 COMPLETE.

## Proposal berikutnya yang konkret - NEW approval diperlukan

File review: `.local/g03-owner-selection/attach-proven-reader.ps1`. **Belum dijalankan.** Approval satu proof sebelumnya melarang perubahan environment dan restart; tidak dipakai untuk langkah ini.

Scope yang diusulkan, owner-operated pada console yang sama:

1. Gunakan root ordinal **1** dari inventory dan hasil proof sukses yang masih berada di memory console. Bila map/proof hilang, STOP; jangan membuat map, menebak path atau mengulangi SQL proof otomatis.
2. Periksa ulang private ACL, path non-symlink, metadata file, exact target, app approval, expiry/plan serta `target-only.json` yang tetap tanpa policies/deployments. Tidak menulis file/approval atau membaca password dari PowerShell.
3. Pasang **hanya tiga referensi process-local** existing: `GUARD_DB_APP_APPROVAL_FILE`, `GUARD_DB_APP_PASSWORD_FILE`, `GUARD_PRODUCT_CONFIG_FILE`. **Tidak memasang worker references** atau memakai worker/bootstrap credential. Auth/App existing dipertahankan, tidak membuat flow baru.
4. Tetapkan `GUARD_PRODUCT_ENABLED=0`, `GUARD_G03_ENABLED=0`, `GUARD_G03_AI_ENABLED=0`, `GUARD_G03_GITHUB_WRITES_ENABLED=0` pada process owner. Tidak mengedit `.env` atau setting persistent/machine.
5. Jalankan website integration existing di foreground melalui perintah npm existing. Bila ada server yang diketahui masih berjalan, hentikan hanya server itu secara normal di console owner; jangan kill proses/port yang tidak dikenal. Kalau port 3000 occupied/startup gagal, STOP tanpa retry atau fallback port.
6. Backend website memakai app credential loader existing secara internal untuk membaca exact database Guard yang telah dibuktikan. Owner kemudian menjalankan GET-only preflight; tidak ada request mutasi DB yang diizinkan. Tidak membaca G01/Sentinel database, mengubah role, schema, password atau data historis.

Tidak ada install, bootstrap helper, pointer baru atau credential baru. Next menangani server-only secara internal; standalone helper yang sebelumnya gagal tidak dijalankan. Tidak ada source GitHub, queue/enqueue, scanner qualification/scanning, AI, GitHub write/PR atau retest.

## Error handling dan batas reader

Metadata/config checks tetap fail-closed dan mengeluarkan fixed code tanpa private path/raw error. Jumlah reference yang sempat terpasang dilaporkan bila ada kegagalan parsial; jangan reset/retry sendiri. Safe completion `REFERENCES_ATTACHED_WEBSITE_PROOF_PENDING` hanya berarti refs dipasang, bukan database website sudah lulus verifikasi.

Startup npm berlangsung biasa dengan output terlihat pada console owner. `ErrorActionPreference` sementara Continue hanya selama native server berjalan agar stderr warning tidak menjadi hidden terminating error PowerShell 5.1; preference dipulihkan ketika command selesai. ExecutionPolicy tidak diubah. Seluruh configuration/authorization gate selesai sebelum startup dan native exit diamati. Jangan kirim log startup mentah ke chat.

Scanner OFF bukan switch global database-read-only. Existing reader service juga mendukung beberapa aksi review/cancel melalui API lain. Karena scope tahap ini hanya GET, **jangan memanggil triage/review/report/cancel, Open Canvas, source/revision, Start/Resume atau endpoint mutasi apa pun**. Tidak ada privilege database yang dicabut/ditambah untuk memaksakan mode tersebut; preservasi existing dipertahankan.

## Verifikasi website yang diizinkan dalam proposal

Setelah server siap, jalankan `.local/g03-owner-selection/read-only-preflight.js` satu kali pada sesi localhost existing. Helper yang sudah direview hanya memakai GET onboarding, readiness dan scan summaries project `github-1465216209`, tidak membuka finding contents atau source. Ini observasi website setelah attachment baru, bukan retry operasi scan/SQL proof sebelumnya.

Kirim hanya:

- safe completion JSON PowerShell;
- JSON preflight GET-only.

Expected: kedua repository tetap dipilih; database approved/schema verified; history GET 200 dengan actual project-scoped rows. Scanner tetap BLOCKED, worker/queue belum configured, allowed engines kosong dan scanAccepted false **memang benar** untuk target-only reader. Empty history tidak membuktikan clean scan. Full website preflight memeriksa tambahan grants/budget di luar probe app-role; jika gagal, laporkan fixed output dan STOP tanpa memperbaiki database.

## Validasi/preservasi

Script baru hanya AST parsed: 0 errors; belum dieksekusi pada state owner. Tidak ada code produk/package/lockfile atau ZIP baseline diubah. Proof 12/12 offline cases dan native bundle import PASS tetap evidence terpisah dari proof database actual owner yang baru diterima.

Setelah website reader terverifikasi, metadata revision/tree exact baseline dan persetujuan satu baseline SAST tetap tahap berikutnya. Izin reader ini belum mencakup penulisan baseline/finding/proposal ke database. G03 tetap **PARTIAL** sampai real AI/review/PR/retest/persistence chain dibuktikan.

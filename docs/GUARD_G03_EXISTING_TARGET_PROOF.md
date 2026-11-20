# G03 - proposal satu proof app-role pada target existing

**Website reader verified from owner receipts (20 November 2026):** three app references attached; onboarding/readiness/history all GET 200; both repositories retained; database approved/schema verified; project scan history empty (not a clean scan). Scanner remains disabled by design. Owner separately confirmed g03/acceptance-base HEAD equals baseline 6eb920a5573c39105fa0390d464d271fb1c7b5bf; tree/blob unverified. See [next metadata/runtime prerequisites](GUARD_G03_READER_VERIFIED_NEXT_METADATA.md). A single POST metadata preflight is proposed but requires new approval beyond prior GET-only scope; no source/scan/AI/GitHub write/retest. G03 remains PARTIAL.

**Actual owner app-role proof received (20 November 2026): READONLY_PROOF_VERIFIED**, one connection to localhost:5432/wetscan_dev_guardg02 marker f0927e49-0e70-4b90-913f-6cd6984df9d8, schema/catalog RLS verified, rollback/pool close true, exit 0, no stderr. No website attachment/restart occurred. See [the next three-reference reader-only proposal](GUARD_G03_PROVEN_READER_ATTACH.md); NEW approval is required for process reference changes/local startup. No helper retry, worker credential, source/scan/AI/GitHub write/retest is authorized. G03 remains PARTIAL.

20 November 2026. **PARTIAL / PROPOSAL BELUM DIJALANKAN.** Inventory owner menemukan root ordinal 1 di worktree. Ini mengubah pengetahuan target, bukan otomatis mengubah izin koneksi.

## Bukti owner terbaru

Satu kandidat worktree mempunyai app/worker approval dan target-only JSON yang konsisten:

| Binding | Metadata owner |
| --- | --- |
| Host / port | `localhost:5432` |
| Database | `wetscan_dev_guardg02` |
| Marker | `wetscan-s01:f0927e49-0e70-4b90-913f-6cd6984df9d8` |
| Roles | `wetscan_guard_app`, `wetscan_guard_worker` |
| Migration plan | `b63e1e8568babcf8d7811fe0fa735ecbec11ade64df19bdea78deb030a85869d` |
| Expiry kedua approval | `2026-11-21T17:00:00Z` = **22 November 2026, 00.00 WIB**; receipt menyatakan masih di masa depan |
| Scanner config | Target-only, nol policy/deployment scanner |
| Koneksi/authentication | Belum dilakukan / belum diverifikasi |

Parent LocalAppData absent-or-unreadable; ini bukan bukti database tidak ada. Metadata worktree tersebut cocok dengan kontrak setup existing-password lama, bukan lingkungan baru port 55434/marker d9058dd4... yang diasumsikan wrapper pertama. Tidak ada credential/path privat yang dikirim owner.

**Jangan menggunakan izin 55434 untuk target 5432 ini.** Root belum dipilih untuk runtime; actual DB marker, user, schema dan RLS belum terbukti. `expiryInFuture` dan pasangan JSON yang cocok bukan proof authentication. Tidak ada pointer/credential yang dibuat atau diperbaiki.

## Langkah minimum yang konkret - approval baru

Usulan: **satu probe owner-operated memakai app role saja** pada exact tuple di atas. Bukan attach/restart dan bukan retry helper `guard-g02-local-env.ts verify` yang gagal.

- PowerShell: `.local/g03-owner-selection/prove-existing-app-readonly.ps1`.
- Implementasi yang dapat direview: `.local/g03-owner-selection/prove-existing-app-readonly.mjs`.
- Artifact executable lokal: `.local/g03-owner-selection/prove-existing-app-readonly.bundle.mjs`; wrapper memverifikasi SHA256 artifact sebelum menjalankannya.

Setelah approval baru, owner meninjau file, menempelkan PowerShell di console yang menyimpan `$g03RefInventoryMap` dari inventory, lalu menjalankan **sekali**. Jangan kirim map/path ke chat dan jangan membuat map pengganti bila variable hilang. Tidak perlu mematikan server yang sedang berjalan.

Scope yang perlu disetujui secara eksplisit:

1. Memakai root ordinal **1**, di bawah `.local` worktree yang sesuai nama UUID; memverifikasi tipe file, batas path dan private ACL owner/SYSTEM. Tidak mengubah ACL.
2. Child Node memakai **validator Guard existing** untuk exact target, role app, expiry, action runtime dan current migration plan. Hanya setelah validation lolos, loader membaca **app.password existing secara internal**. Password tidak dicetak/disalin/dikirim melalui argv/stdin/env. Agent tidak membacanya. Worker, bootstrap/superuser, G01 dan credential Sentinel tidak dipakai.
3. Maksimal **satu logical connection attempt** sebagai `wetscan_guard_app`, timeout connection dari ApprovedPool existing. ApprovedPool melakukan SELECT identitas awal; probe kemudian **BEGIN READ ONLY**, SELECT identitas/owner/marker/read-only flag, ledger schema Guard/platform dan metadata FORCE RLS, **ROLLBACK**, release dan close.
4. Tidak membaca isi scans/jobs/findings historis. Tidak ada DML, DDL, migrasi, reset, provision, role/grant change, commit transaksi data, scheduler/worker atau code repository GitHub.
5. Child environment dibersihkan dari service credentials/config yang tidak diperlukan; parent environment tetap utuh. Referensi app diberikan melalui stdin lokal, bukan nilai password. Tidak membaca `.env` atau isi pointer. Tidak ada Auth/App/provider kedua.
6. Tidak ada pemasangan referensi website, file baru, dependency install, restart, source acquisition, scanner, AI, GitHub write/PR atau retest. Bahkan jika proof sukses, **STOP setelah observasi**; tahap berikut tidak dijalankan otomatis.

Koneksi menuju database bernama **wetscan_dev_guardg02**, bukan database G01/Sentinel walaupun PostgreSQL cluster dapat berbagi port 5432. Jika actual identity berbeda, stop tanpa fallback, memperbaiki marker, mengganti credential atau mencoba target lain.

## Error handling yang diperbaiki

Wrapper memakai ProcessStartInfo dengan stdout/stderr ditangkap terpisah, bukan native PowerShell `2>$null`. JSON hasil dibaca juga ketika exit code nonzero. Fase, exit code, fixed reason dan cleanup flags tetap tersedia; pesan/stack/raw stderr/reference input tidak dicetak.

Node probe hanya mengeluarkan reason allowlist seperti approval_required, target_denied, 28P01, ECONNREFUSED, schema_mismatch atau cleanup UNKNOWN. Timeout wrapper 90 detik menghasilkan UNKNOWN_NO_RETRY; tidak membunuh proses atau mengirim koneksi baru. Gagal/UNKNOWN selalu dihentikan tanpa retry. Jangan menyalin raw log ke chat.

Sukses mensyaratkan seluruh check, rollback, release dan pool close berhasil; output **READONLY_PROOF_VERIFIED** belum berarti reader website sudah terpasang, isolation antar-project terbukti, atau G03 selesai.

## Validasi offline yang sudah selesai

- **12/12 kasus transport doubles PASS** pada executable bundle: target/role exact, readonly queries dan cleanup; penolakan reference/plan/approval/target sebelum connect; auth/marker/role/schema/RLS/rollback/close failure tanpa retry atau false success. Tidak memakai credential/DB owner.
- Import graph bundle lewat native Node **PASS** tanpa memanggil fungsi probe/config loader atau membuat koneksi. Tidak bergantung pada missing `server-only` maupun loader `tsx` saat operator menjalankan proof.
- Check import source melalui tsx pada sandbox agent sempat gagal `uv_os_get_passwd ENOMEM`, sebelum fungsi probe. Itu bukan bukti run owner pertama gagal karena alasan yang sama. Artifact kemudian dikompilasi offline dari delapan source files untuk menghilangkan dependency loader pada tahap operator; actual runnable bundle diuji ulang.
- PowerShell AST **0 parse errors**. Wrapper belum dijalankan pada state owner. Tidak ada claim functional/live proof.

Bundle hanya mengemas validator/config/pool/plan existing untuk tool diagnostic lokal; kode produk G03/G02/Auth/Sentinel dan package/lockfile tidak diubah. Tidak membuat credential, App, server atau scanner baru.

## Tindak lanjut setelah hasil aktual

Jika proof lolos, siapkan approval reader attachment/restart terpisah untuk exact target tersebut dan scope GET-only. Jika auth, target, plan, schema/RLS atau cleanup gagal, simpan fixed output dan stop; jangan mengubah database atau password. Jika expiry lewat, jangan memperpanjang sendiri. Keputusan memakai target lain/provision environment tetap memerlukan scope baru.

Live Acceptance target GitHub tetap `inkAja/wetscan-g03-acceptance`, `g03/acceptance-base@6eb920a5573c39105fa0390d464d271fb1c7b5bf`. Pilihan project sudah tersimpan; HEAD/tree/blob, baseline SAST, real AI, review/PR dan verified retest masih belum terbukti. **G03 PARTIAL.**

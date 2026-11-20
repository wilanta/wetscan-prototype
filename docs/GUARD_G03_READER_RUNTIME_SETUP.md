# G03 - memasang runtime pembaca Guard existing

**Actual owner app-role proof received (20 November 2026): READONLY_PROOF_VERIFIED**, one connection to localhost:5432/wetscan_dev_guardg02 marker f0927e49-0e70-4b90-913f-6cd6984df9d8, schema/catalog RLS verified, rollback/pool close true, exit 0, no stderr. No website attachment/restart occurred. See [the next three-reference reader-only proposal](GUARD_G03_PROVEN_READER_ATTACH.md); NEW approval is required for process reference changes/local startup. No helper retry, worker credential, source/scan/AI/GitHub write/retest is authorized. G03 remains PARTIAL.

**Owner inventory received (20 November 2026):** worktree root ordinal 1 has consistent app/worker/target-only metadata for localhost:5432/wetscan_dev_guardg02, marker f0927e49-0e70-4b90-913f-6cd6984df9d8, expiry 22 November 2026 00:00 WIB. This differs from the old assumed 55434/d9058dd4 binding. No target is selected automatically and authentication is unverified. See [the new exact-target app-role read-only proof proposal](GUARD_G03_EXISTING_TARGET_PROOF.md). It requires NEW approval for one connection/internal app credential use; no helper retry, environment attachment/restart or database mutation is authorized.

**Owner metadata received (20 November 2026):** PowerShell 5.1/Node 24.17; server-only root package missing, LOCALAPPDATA pointer NOT_FOUND, all five Guard references absent, NODE_OPTIONS/NODE_PATH absent. Port status UNAVAILABLE and error signals empty do not prove a database failure. STOP remains in force. See [confirmed findings and the new non-secret inventory proposal](GUARD_G03_ENVIRONMENT_RECOVERY_PLAN.md). The approved presence-only diagnostic is complete; reading existing approval/config JSON is a NEW proposed scope, not yet authorized. No helper retry/install/DB connection/restart.

**STOP UPDATE (20 November 2026):** owner reader attempt stopped at G03_EXISTING_TARGET_VERIFY_STOP_NO_RETRY before reference attachment/npm startup. Do NOT rerun verify, env or the old attach block; do NOT restart/reset/provision. Prior reader approval is halted; any recovery needs NEW approval. See [the read-only diagnosis and metadata-only recovery proposal](GUARD_G03_VERIFY_STOP_DIAGNOSIS.md). Agent has not executed the helper or connected to the database. Owner-run internal phase remains UNKNOWN.

**Owner approval received (20 November 2026): reader-only owner-operated attachment and local website restart are APPROVED.** Execute the prepared block only in the existing owner server terminal. Execution is still PENDING_OWNER_EXECUTION; no DB connection/restart was performed by the agent. The earlier description of approval being pending below is historical. All source/scanner/AI/GitHub-write/retest restrictions remain in effect.

20 November 2026. **PROSEDUR SIAP / BELUM DIJALANKAN / G03 PARTIAL.** Ini langkah untuk membuat database Guard existing dapat dibaca dari website, bukan izin scanner atau Live Acceptance.

## Bukti terbaru dan diagnosis

Receipt owner `guard-g03-owner-preflight-v1` memberikan:

- `GET /api/onboarding`: 200; authenticated/connected completed; IDs **839286157** dan **1465216209**, target Private. Masalah pemilihan repository telah selesai pada proyeksi API owner.
- `GET .../readiness`: 200; status BLOCKED, database approval_required, schema/queue unverified, sandbox BLOCKED, worker not_configured, execution G02_NOT_CONFIGURED, no allowed engines, scanAccepted false.
- `GET .../scans?limit=50`: **503 approval_required**. History tidak dapat dibaca, bukan terbukti kosong/bersih.
- Source, scanner, provider, GitHub writes dan selection writes pada helper semuanya false. HEAD/tree/blob tetap belum diverifikasi.

Pada kode yang diaudit, kombinasi respons itu cocok dengan `guardLiveService(context)` yang mengembalikan `new GuardLiveService(undefined, defaultReadiness)` ketika proses website tidak mendapat `GUARD_PRODUCT_CONFIG_FILE` dan scanning tidak enabled. Jalur ini bahkan tidak memanggil loader credential/database. `store()` kemudian mengembalikan approval_required karena tidak ada storage service. Sebaliknya, `productReadService()` yang berhasil menghubungkan target akan memberi database approved/schema verified, walaupun scanner tetap BLOCKED.

**Kesimpulan:** konfigurasi pembaca product Guard belum terpasang/terjangkau pada proses website yang diuji. Ini inferensi kontrak kode dan receipt owner, bukan pembacaan environment proses. Tidak ada bukti bahwa database rusak, belum dibuat, approval expired, atau bahwa password/worker sebenarnya tidak ada. Jangan membuat database/password/approval baru dari label default tersebut. Flag legacy `GUARD_LIVE_READ_ENABLED` bukan fallback yang boleh dipakai website; kontrak sengaja mencegah perpindahan ke database G01 historis.

## Proposal tindakan owner berikutnya - belum termasuk izin sebelumnya

Approval sebelumnya mencakup pemilihan repository dan metadata read-only. Langkah berikut berdampak **referensi proses + restart website lokal**, serta kemungkinan pembuatan satu file konfigurasi target-only oleh helper existing; belum dilakukan oleh agent. Source acquisition, scanner qualification/scanning, AI, PR/write dan retest tetap tidak diizinkan.

Gunakan hanya lingkungan Guard G02 terisolasi yang sudah terdokumentasi pada [setup G02 terbaru](GUARD_G02_NEW_LOCAL_ENV_SETUP.md):

| Binding existing yang wajib cocok | Nilai |
| --- | --- |
| Database | `wetscan_dev_guardg02` |
| Endpoint | loopback, port **55434** |
| Marker | `wetscan-s01:d9058dd4-2823-4582-9721-4a1a56557664` |
| Roles | existing `wetscan_guard_app`, `wetscan_guard_worker` dan approval role-bound yang valid |
| State | data/migrasi/approval/password existing dipertahankan |

Tabel adalah binding dari evidence G02, bukan bukti bahwa lingkungan itu masih tersedia sekarang. **Jika helper tidak menemukan atau tidak memverifikasi exact target, STOP.** Jangan memakai target lama port 5432, Sentinel 55432, marker lama f0927e49..., membuat target pengganti atau memperbarui expiry sendiri. Dokumen `GUARD_G02_NEXT_READONLY.md` adalah prosedur lama dengan qualification 19 November yang expired; jangan dipakai sebagai launcher campaign ini. `guard-live-reattach.ts` juga mengacu pada workflow root/target lama, jadi bukan alternatif otomatis untuk lingkungan baru.

## Artefak owner-operated yang konkret

File lokal untuk ditinjau: `.local/g03-owner-selection/attach-readonly-runtime.ps1`.

Setelah owner menyetujui scope di atas:

1. Gunakan **terminal owner asli yang menjalankan website integration** dan masih mempunyai Auth/App existing. Stop hanya server yang diketahui itu dengan Ctrl+C. Jangan mematikan proses port 3000 yang tidak dikenal, worker Sentinel, database, atau Docker. Jangan memakai terminal baru tanpa konfigurasi Auth lalu menyalin credential.
2. Tinjau seluruh file, lalu salin bloknya ke console PowerShell owner. Jangan menjalankan unsigned PS1 dengan bypass ExecutionPolicy. Agent tidak menjalankan file ini.
3. Blok memakai dua perintah existing yang sudah diperiksa, `guard-g02-local-env.ts verify` dan `env`. `verify` memakai approval/ACL/target checks serta **BEGIN READ ONLY / ROLLBACK** untuk metadata database; helper mengakses credential bootstrap existing secara internal tanpa mencetak/meminta nilainya. Tidak ada provision/start/reset/migrate/role mutation.
4. `env` hanya mengeluarkan lima referensi file. Ia dapat membuat `target-only.json` dengan CreateNew di private root existing jika belum ada; tidak menimpa file existing. Output ditangkap lokal dan diparse allowlist, **tanpa Invoke-Expression/eval**. Blok memverifikasi path/root/file non-symlink dan target-only config dengan nol policies/deployments. Tidak membaca password file atau dotenv secara langsung. Jangan kirim raw refs/private paths ke chat.
5. Setelah semua check lolos, pasang refs pada **Process** saja; `GUARD_PRODUCT_ENABLED`, `GUARD_G03_ENABLED`, `GUARD_G03_AI_ENABLED`, `GUARD_G03_GITHUB_WRITES_ENABLED` semuanya **0**. Jalankan normal website existing dengan `npm.cmd run guard:dev`. Tidak ada Auth/App kedua atau perubahan credential. Normal startup tetap menggunakan konfigurasi Auth existing; agent tidak menginspeksi isinya.

Blok gagal tertutup pada target/approval/ACL/path/schema/connection yang tidak cocok. Jika port 3000 masih occupied, startup gagal atau hasil UNKNOWN: **STOP tanpa retry, kill, penghapusan lock, fallback, reset atau reprovision**. Semua dokumen/data lama dipertahankan. Blok tidak menjalankan scanner, paid provider, source/Canvas/revision atau worker.

## Verifikasi sesudah restart, tetap read-only

Pada sesi owner browser yang sama, jalankan **GET-only preflight** `.local/g03-owner-selection/read-only-preflight.js` satu kali setelah proses baru siap. Ini observasi baru setelah perubahan referensi, bukan pengulangan POST atau scan. Kirim hanya JSON aman tersebut dan safe completion JSON dari blok PowerShell; jangan kirim raw console startup/refs/credential.

Hasil yang diharapkan bila lingkungan memang cocok:

- Kedua ID profile tetap ada; tidak perlu POST onboarding lagi.
- Readiness database **approved**, schema **verified**.
- History GET **200** dan hasil project-scoped aktual, mungkin array kosong. Jangan mengasumsikan nol findings dari empty history.
- Scanner tetap **BLOCKED**, queue/worker belum configured, allowedEngines kosong, scanAccepted false: **ini benar untuk tahap pembaca saja**.

Jika database masih approval_required/not_configured atau route error, simpan receipt dan hentikan. Jangan melanjutkan qualification, source read atau baseline scan untuk mencoba memperbaiki konfigurasi.

## Pengujian dan batas proof

Existing tests **24/24 PASS**: runtime-routing 4, host-wiring 6, preflight-diagnostics 8, local-env 6. Tests memakai doubles/temp fixture, tidak membaca `.env` owner atau menghubungkan database operasional. Membuktikan website tidak fallback G01, reader tanpa worker, pemisahan target/approval, dan error projection. Script PowerShell hanya diperiksa AST: **0 parse errors**, **belum dieksekusi terhadap state owner**. Tidak diklaim functional/live tested.

Kode G03/G02/Auth/Sentinel dan ZIP baseline tidak diubah. Setelah reader siap, pekerjaan tersisa tetap: metadata HEAD/tree/blob exact baseline; fresh scanner qualification dan policy SAST-only pada target/project/branch yang diizinkan; satu baseline G02 setelah approval; finding nyata; consent AI; review/write approval; PR/retest/persistence. Tidak ada tahap tersebut yang dianggap diizinkan oleh proposal reader ini.

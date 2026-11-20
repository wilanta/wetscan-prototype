# G03 - prasyarat environment owner terkonfirmasi

**Actual owner app-role proof received (20 November 2026): READONLY_PROOF_VERIFIED**, one connection to localhost:5432/wetscan_dev_guardg02 marker f0927e49-0e70-4b90-913f-6cd6984df9d8, schema/catalog RLS verified, rollback/pool close true, exit 0, no stderr. No website attachment/restart occurred. See [the next three-reference reader-only proposal](GUARD_G03_PROVEN_READER_ATTACH.md); NEW approval is required for process reference changes/local startup. No helper retry, worker credential, source/scan/AI/GitHub write/retest is authorized. G03 remains PARTIAL.

**Owner inventory received (20 November 2026):** worktree root ordinal 1 has consistent app/worker/target-only metadata for localhost:5432/wetscan_dev_guardg02, marker f0927e49-0e70-4b90-913f-6cd6984df9d8, expiry 22 November 2026 00:00 WIB. This differs from the old assumed 55434/d9058dd4 binding. No target is selected automatically and authentication is unverified. See [the new exact-target app-role read-only proof proposal](GUARD_G03_EXISTING_TARGET_PROOF.md). It requires NEW approval for one connection/internal app credential use; no helper retry, environment attachment/restart or database mutation is authorized.

20 November 2026. **PARTIAL / STOP TETAP BERLAKU.** Hasil diagnostic metadata owner diterima. Tidak ada retry helper, restart, install, credential read/create, koneksi DB, source acquisition atau scanner dijalankan oleh agent.

## Kesimpulan dari receipt owner

| Komponen | Bukti owner | Kesimpulan yang sah |
| --- | --- | --- |
| PowerShell | 5.1.26100.7705 | Sama dengan konteks uji sintetis yang menunjukkan native stderr bisa masuk catch walaupun child exit 0 |
| Node | Application, 24.17.0 | Node tersedia; memenuhi engine range dependency yang diperiksa. Tidak ada bukti perlu downgrade |
| Dependency | tsx/pg/@next/env/next ada; root server-only **tidak ada** | Menguatkan blocker import CLI standalone yang sudah dibuktikan resolver agent pada worktree ini |
| Runtime hooks | NODE_OPTIONS=false, NODE_PATH=false | Tidak ada indikasi preload/module search tambahan pada terminal owner yang dapat menyediakan alias dependency itu |
| Pointer | **NOT_FOUND**, LOCALAPPDATA ada | Instalasi yang diasumsikan helper di `%LOCALAPPDATA%/WetScanGuardG02/current.json` tidak tersedia di konteks owner. Bukan bukti semua database G02 tidak ada |
| Referensi website | Product config dan keempat DB approval/password references semuanya false | Reader tidak terpasang pada terminal ini; cocok dengan respons website default BLOCKED sebelumnya |
| Port 55434 | **UNAVAILABLE** | Hasil probe tidak tersedia; jangan menyatakan port mati, database tidak ada, atau container stopped |
| Error memory | kosong | Penyebab native run pertama tidak dapat dipulihkan dari receipt ini; jangan retry untuk menciptakan ulang error |

**Diagnosis:** prosedur attach lama tidak mempunyai prasyarat untuk berhasil. Pada resolusi Node normal yang telah diperiksa, dependency `server-only` menghalangi startup CLI sebelum `verify()`; bila import tersebut ditangani pun, pointer yang tidak ada menjadi blocker berikutnya. Raw error/exit run owner tetap tidak diketahui karena wrapper menghilangkan diagnosis. Tidak ada bukti kerusakan database, salah password, expiry approval atau mismatch marker aktual.

Binding 55434/marker d9058dd4... berasal dari evidence lingkungan G02 terdahulu, bukan bukti instalasi sekarang. Saya tidak akan membuat pointer, menyalin credential, mengubah `.env` atau memakai marker/port lain untuk membuat check lolos. Pemilihan repository GitHub tetap selesai; kegagalan CLI ini tidak membatalkan repository yang sudah dipilih.

## Mengapa tidak langsung memasang server-only

Memasang dependency hanya menangani startup CLI, **bukan pointer/referensi yang hilang**. Build Next juga bukan bukti bahwa CLI standalone siap: guide Next yang terpasang (`node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`) menjelaskan bahwa Next menangani import server-only secara internal dan pemasangan paket opsional di dalam Next. Alias tersebut tidak otomatis tersedia bagi helper Node standalone.

Jika referensi reader existing yang valid ditemukan, pembaca website mungkin dapat dipasang tanpa menggunakan helper CLI yang gagal itu dan tanpa mengubah dependency G03. Ini masih rencana, bukan keputusan untuk memakai target lama. Dependency/lockfile repair tersendiri tetap dapat direview dengan Will bila CLI memang diperlukan; tidak ada package install atau stub/alias bypass sekarang.

## Proposal minimum berikutnya: inventory non-secret existing

File untuk review: `.local/g03-owner-selection/inventory-g02-reference-metadata.ps1`. **BELUM DIJALANKAN / MEMERLUKAN APPROVAL BARU** karena memperluas scope dari pemeriksaan keberadaan file menjadi pembacaan isi JSON metadata approval/config.

Owner menjalankan di console existing setelah review dan approval. Blok hanya memeriksa dua parent yang diketahui dari kontrak repository:

- `.local/` pada worktree existing, hanya immediate children bernama `wetscan-g02-runtime-db-<UUID>`;
- `%LOCALAPPDATA%/WetScanGuardG02/`, hanya immediate children dengan pola yang sama.

Tidak ada pencarian rekursif seluruh disk atau pembukaan direktori Auth/G01/scanner. Root symlink ditolak; lebih dari delapan kandidat pada satu parent dihentikan. Agent tidak membuka root ACL-protected atau meminta eskalasi untuk membacanya.

Dalam kandidat tersebut, hanya tiga jenis file non-secret yang boleh dibaca:

1. `app.database.json`;
2. `worker.database.json`;
3. `target-only.json`.

Output hanya root ordinal/source category, exact target host/port/database/marker, role/purpose, expiry dan migration-plan digest yang lolos proyeksi ketat, serta status policy kosong. Path privat, approvedBy, unknown fields dan raw errors tidak dicetak. Jika metadata tidak cocok dengan schema/target Guard, file unreadable atau ambiguous, laporkan status tersebut tanpa memilih target atau mengubah ACL.

**Tidak membaca `.password`, bootstrap credential, `.env`, Auth state atau isi pointer. Tidak menjalankan Node/helper, SQL, Docker, install, perubahan environment/file, restart, source acquisition, scan, AI, GitHub write atau retest.** AST script telah diperiksa: 0 parse errors; belum functional/live tested dan tidak diklaim demikian.

Hasil inventory hanya metadata, bukan bukti authentication/RLS atau izin runtime. Expiry di masa depan juga bukan pengganti validation target/role/plan yang sesungguhnya.

## Keputusan sesudah inventory

| Hasil | Langkah yang baru boleh diusulkan, bukan dijalankan otomatis |
| --- | --- |
| Ada referensi existing cocok dengan target yang telah disetujui | Review exact binding/approval/ref metadata, lalu susun reader-only attachment tanpa bootstrap helper jika kontrak memungkinkan. Memerlukan approval environment/restart baru |
| Ada target lain, termasuk 5432 atau marker historis | Laporkan perbedaan dan minta keputusan owner terhadap exact target. Jangan fallback, menyalin credential atau memakai izin 55434 untuk target itu |
| Tidak ada kandidat atau tidak dapat dibaca | Laporkan blocker. Jangan membuat ulang environment atau credential dalam scope read-only; provisioning baru adalah keputusan dan approval terpisah |
| Perlu standalone CLI | Review dependency declaration/lockfile dan capture error yang mempertahankan phase/exit/fixed codes. Tidak menghapus server-only guard, tidak memalsukan approval dan tidak mengendurkan assertion |

Dengan demikian approval terdekat yang diperlukan hanya **inventory tiga JSON non-secret existing**. Izin itu tidak mencakup pemulihan server, pemasangan dependency, koneksi database, source read, baseline scan atau operasi Live G03 lain. Langkah lain baru dibuat konkret setelah metadata target diketahui.

Core G03 tetap utuh; masalah saat ini adalah prasyarat environment/packaging CLI dan observability wrapper owner, bukan bukti kegagalan scanner atau persistence G03. Live Acceptance masih belum dijalankan dan G03 belum COMPLETE.

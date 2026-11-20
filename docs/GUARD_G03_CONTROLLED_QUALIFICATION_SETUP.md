# G03 — proof worker/image berhasil; proposal qualification dan konfigurasi SAST

**Current owner diagnosis (20 November 2026): 70 references checked, 69 regular files; INSTALL_TRIVY_MANIFEST (.local/g02-install/context/trivy-db-manifest.json) FILE_MISSING_AT_CHECK. This is the concrete current prerequisite blocker; other file content/hash semantics remain unverified by metadata alone. Setup/qualification has not been retried. See [the proposed pinned-image cache metadata recovery into a NEW G03 sidecar](GUARD_G03_TRIVY_MANIFEST_RECOVERY.md); one never-started container/new local artifacts require NEW approval, NOT_EXECUTED. Existing installation/V1 artifacts remain unchanged. No owner source/scan/AI/PR/retest. G03 PARTIAL.**


**Current owner STOP (20 November 2026): the one approved setup attempt returned REFERENCES/ENOENT, STOP_BEFORE_QUALIFICATION, exit 1/no stderr, qualificationAttempted=false and localArtifactMutationAttempted=false. Do NOT retry setup, qualifier, export, proof or inventory. No runtime artifacts/config were created by setup; missing reference is not yet localized. See [the reference diagnosis and same-scope metadata-only observation](GUARD_G03_QUALIFICATION_REFERENCE_STOP.md). V1 artifacts remain frozen; V2 observability source is a non-operational proposal. Recovery/qualification retry requires new approval after diagnosis. G03 remains PARTIAL.**


20 November 2026, Asia/Jakarta. **WORKER_AND_IMAGE_METADATA_VERIFIED / SCANNER_DISABLED / G03 PARTIAL.** Receipt owner: [received-owner-proof.json](acceptance/guard-g03/20261120-worker-image-verified/received-owner-proof.json). Jangan mengulang worker proof, metadata Docker, inventory atau POST yang sudah selesai.

## Bukti aktual

Owner melaporkan satu koneksi `wetscan_guard_worker` ke `localhost:5432/wetscan_dev_guardg02`, marker `wetscan-s01:f0927e49-0e70-4b90-913f-6cd6984df9d8`; identity/schema/catalog RLS valid, explicit read-only transaction, rollback dan pool close berhasil. Tiga metadata commands Docker membuktikan daemon Linux versi 29.7.2, pinned image `sha256:3608834fae5f966e6380af0c7b2acf71a46af2ac2bac8591be2b0851d501fa51` tersedia, user `65532:65532` dan entrypoint Opengrep sesuai. Exit 0, tanpa stderr, nol container dibuat.

`COMPLETE` pada inner proof hanya menandai proof selesai. Ini bukan proof privilege queue/lease, sandbox execution atau G03 COMPLETE. Worker references belum dipasang ke website; target-only reader dan Auth/App existing tetap berlaku. Source/tree/blob repository belum diambil, belum ada baseline finding G02 nyata, AI/PR/retest belum dijalankan.

## Proposal tahap berikut — memerlukan approval baru

Approval sebelumnya hanya satu koneksi dan metadata Docker; ia melarang container execution, qualification dan file/config mutation. Proposal berikut memperluas scope secara spesifik ke **controlled qualification existing G02 dan file lokal baru**, tanpa scan repository owner atau koneksi DB.

Artifact review:

- `.local/g03-owner-selection/export-owner-scope.js`: export binding non-secret dari memory browser ke satu file lokal; **zero network request**.
- `.local/g03-owner-selection/setup-qualified-sast.ps1`: owner wrapper, maksimal satu setup attempt, belum dijalankan.
- `.local/g03-owner-selection/setup-qualified-sast.mjs` dan `qualification-model.mjs`: adapter setup dan strict model; production G02/G03 tidak diedit.
- `qualification-original.bundle.mjs`: bundle entry `worker/guard/installation/qualify.ts` **tanpa perubahan source/logic**. Entry runner mengisi argv sesuai CLI original sebelum import; tidak mengubah sandbox, men-stub server-only atau mengaktifkan tool lain.
- `qualification-build-manifest.json`: hash 47 file source/helper/bundle; wrapper mem-pin manifest dan setup bundle, lalu child menolak drift sebelum membuat runtime.

### Yang boleh dilakukan jika tahap ini disetujui

1. Owner menyimpan binding `workspaceId`/`actorId` dari authorizer existing sebagai `.local/g03-owner-selection/g03-owner-scope.json`. Jangan mengirim isi file ke chat. Metadata ini bukan cookie/token/password, tidak menambah Auth dan bukan runtime authority. Exact project/repository/branch/baseline divalidasi. Jika memory binding hilang, STOP; jangan ulang POST yang telah terpakai.
2. Membaca hanya JSON non-secret `app.database.json` dan `worker.database.json` pada satu root yang sudah dibuktikan, memvalidasi purpose/role/target/plan/expiry dengan validator existing. Tidak membaca password, pointer, `.env`, Auth state atau findings historis. Tidak membuka koneksi DB. Approval harus masih berlaku setidaknya 20 menit sebelum qualification dimulai; tidak ada renewal otomatis.
3. Memvalidasi metadata instalasi existing `.local/g02-install`: `built-image.json`, `base-image.json`, `context/rules-manifest.json`, `context/osv-db-manifest.json`, `context/trivy-db-manifest.json`, serta official pinned `context/config/gitleaks.toml`. Tidak membaca rule source, binary atau database scanner host. Image dan hash manifest rules harus tetap cocok dengan inventory; Gitleaks config harus cocok dengan official digest yang sudah tercatat. Tidak fallback ke completion image atau download/build/pull asset baru.
4. Membuat **satu root baru** pada Temp. Root dibuat kosong dengan prefix snapshot yang diwajibkan validator existing, di-ACL owner+SYSTEM melalui `secureSnapshotDirectory`, lalu dipindah secara native ke sibling baru `wetscan-g02-runtime-g03-<UUID>`. Kedua absolute endpoints dibatasi immediate Temp children milik run ini; destination wajib belum ada. Ini tidak memindah root lama atau mengubah ACL folder existing. Semua artifact/run staging ada di root baru; tidak menimpa file Will/wdu, pointer, target-only reader, baseline ZIP atau evidence historis. Jika ACL/move gagal, STOP dan pertahankan partial artifacts.
5. Menjalankan **satu `qualify.ts --full` G02 original** menggunakan staging `.local/g02-install` baru di dalam root tersebut, fresh empty Docker config dan image pin yang sama. Hanya source literal/OCI fixture milik G02 dibuat di Temp, bukan source `inkAja/wetscan-g03-acceptance` atau repository lain.
6. Qualification menjalankan **lima CLI**: Opengrep, OSV Scanner, Gitleaks, Trivy IaC dan Trivy OCI-image. Termasuk control, output limit, timeout, cancellation, OOM serta **owned** orphan/cleanup tests. Maksimal 20 container baru, sequential, UUID/labels milik run ini. Tidak ada tindakan terhadap container/job G01/N01/Sentinel existing atau global prune/sweep. Cleanup yang diizinkan hanya cleanup fixture dan container baru yang identitas kepemilikannya dibuktikan original G02 runner.
7. Per container: 1 CPU, 64 PIDs, readonly root/source, no network/socket/privileges, 16 MiB noexec tmpfs. Memory 256 MiB; OSV dan Trivy OCI-image mendapat limit existing 2.048 MiB. Scanner timeout 45 detik; kontrol/version memakai batas original yang lebih pendek. Tidak menjalankan npm/package hooks, behavioral tests repository, source scripts atau host scanner binary. Docker memakai local named pipe; tidak ada GitHub/provider/network acquisition.
8. Mempertahankan raw controlled reports/stdout/stderr hanya di root lokal baru ber-ACL. Menggunakan **`measuredDeployments` G02 original**, dengan seluruh kontrol dan CLI full-run wajib PASS; jika Trivy OCI atau engine lain gagal, **tidak menghapus kegagalan atau mengekspor PASS SAST**. Mengambil hanya record `sast` setelah derivation seluruh run valid, menulis exclusive hash-named installation/qualification evidence dan melakukan `verifyPhysical` metadata recheck existing.
9. Menulis deployment measured SAST dan **konfigurasi baru** `g03.product.runtime.json` dalam root baru. Policy hanya workspace authorizer owner, project `github-1465216209`, repository `1465216209`, branch `g03/acceptance-base`, engine `sast`, scanner timeout 45 detik, job timeout 120 detik dan maxAttempts=1. Tidak memasang reference ke website, mengubah parent environment, restart atau mengaktifkan flag scan/G03/AI/PR.

Qualification full-run ini memang lebih luas dari engine policy SAST. Scope itu harus tercantum dalam approval; tidak ada flag SAST-only yang diklaim tersedia. Kelengkapan CLI pada image lama tetap perlu dibuktikan oleh run, bukan dijanjikan dari metadata.

### Batas dan hasil

Tidak ada bootstrap/migration credential, install dependency, provisioning/reset/migrasi database, SQL/DB write, source acquisition repository, scan GitHub, paid AI, GitHub write/PR, behavioral test repository atau retest pada tahap ini. Kode produk G03/G02/Auth/Sentinel tidak diedit. Artefak fixture qualification tidak dipromosikan sebagai finding/evidence Live G03.

Hasil sukses yang diperbolehkan: `QUALIFIED_SAST_CONFIGURATION_WRITTEN_NOT_ATTACHED`. Path private hanya disimpan di `$g03QualifiedSetupPrivateReferences` pada console owner; JSON yang dikirim ke chat berisi status, safe phase/reason, kontrol/CLI status, version, expiry dan config hash. Jangan mengirim raw stdout/stderr, scope file, private reference map atau workspace/actor.

Qualification berlaku satu jam sejak **actual measurement completedAt**, bukan sejak export atau approval. Jangan re-date atau copy qualification lama. `RepositoryScanPolicy` tidak memiliki commit/path field: baseline pin `6eb920a5573c39105fa0390d464d271fb1c7b5bf` dan empat file/1.374 byte tetap memerlukan independent current-head/tree/blob check serta source/scan approval berikutnya. Config file sendiri tidak membuktikan pin atau mengizinkan scan.

Wrapper menunggu paling lama 15 menit. Jika UNKNOWN/timeout/STOP, jangan retry, membunuh proses atau membersihkan resource sendiri; raw artifacts dan intent/owned cleanup records harus diobservasi read-only dahulu. Pada sukses pun STOP sebelum attachment/restart/scan. Jika helper gagal sebelum qualification, jangan menyalin credential atau memakai root/engine lain sebagai fallback.

## Langkah owner setelah approval diberikan

1. Biarkan server dan tab browser existing tetap berjalan. Tinjau dan jalankan `export-owner-scope.js` sekali sebagai DevTools Snippet pada `http://localhost:3000`; tidak ada HTTP request. Simpan satu file `g03-owner-scope.json`, lalu letakkan secara manual pada `.local/g03-owner-selection/` dengan nama tersebut. Jika file destination sudah ada atau browser binding hilang, STOP tanpa overwrite atau POST baru.
2. Pada **console terpisah yang tadi mengembalikan proof worker/image sukses**, tinjau lalu paste seluruh `setup-qualified-sast.ps1` sekali. Script membutuhkan `$g03ProofResult` dan `$g03ProofRoot` dari proof tadi; jika hilang, STOP tanpa mengulang proof/inventory otomatis. Tidak mengubah execution policy.
3. Tunggu hasil dan kirim hanya JSON projection. Jangan kirim file scope atau `$g03QualifiedSetupPrivateReferences`.

Instruksi ini belum merupakan izin eksekusi: proposal tetap NOT_APPROVED/NOT_EXECUTED sampai owner memberikan approval tahap yang tepat.

## Pengujian persiapan

**31/31 offline model/browser-double checks PASS**: scope repository/project/branch/pin/actor/control-character/unknown-field denial; actual original measurement validator menolak expired/future/wrong-image/rules/cleanup/controls/engine/command/resource/coverage failure; konfigurasi hanya SAST; exporter zero-network dan tanpa private projection. Fixture unit hanya digunakan untuk pengujian validator, bukan qualification PASS atau Live Acceptance.

Kedua bundle berhasil dikompilasi tanpa server-only alias/stub atau package install. PowerShell wrapper: 0 AST parse errors. `setup()` tidak dipanggil dalam pengujian, tidak ada credential/file owner yang dibaca, Docker/SQL/qualification tidak dijalankan. Wrapper/orchestration belum functional tested di lingkungan owner; offline PASS tidak membuktikan physical qualification. `git diff --check` dan integrity audit dilakukan terpisah; semua 46 file implementasi dan ZIP baseline tetap identik.

Setelah receipt qualification sukses tersedia, tahap berikutnya adalah proposal attachment konfigurasi baru dan references existing, dengan scan/AI/GitHub-write tetap OFF, lalu readiness normal. Baseline G02 SAST, satu paid AI request ≤US$0,10, human patch review, authorized draft PR dan verified retest tetap membutuhkan persetujuan masing-masing. **G03 tetap PARTIAL.**

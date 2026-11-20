# G03 — inventory diterima; proposal proof worker dan metadata image

**Current owner STOP (20 November 2026): the one approved setup attempt returned REFERENCES/ENOENT, STOP_BEFORE_QUALIFICATION, exit 1/no stderr, qualificationAttempted=false and localArtifactMutationAttempted=false. Do NOT retry setup, qualifier, export, proof or inventory. No runtime artifacts/config were created by setup; missing reference is not yet localized. See [the reference diagnosis and same-scope metadata-only observation](GUARD_G03_QUALIFICATION_REFERENCE_STOP.md). V1 artifacts remain frozen; V2 observability source is a non-operational proposal. Recovery/qualification retry requires new approval after diagnosis. G03 remains PARTIAL.**


**Current owner proof (20 November 2026): worker exact-target READ ONLY proof and pinned-image metadata verified; one DB connection rolled back/closed, three Docker metadata calls, Linux daemon 29.7.2, exit 0/no stderr, zero containers created. Do not repeat proof. Qualification and website worker attachment remain NOT_RUN. See [the controlled multi-CLI qualification plus NEW SAST configuration proposal](GUARD_G03_CONTROLLED_QUALIFICATION_SETUP.md); NEW approval required, NOT_EXECUTED. No owner source/scan/AI/GitHub write/retest. G03 remains PARTIAL.**


20 November 2026, Asia/Jakarta. **INVENTORY_OBSERVED / READER_VERIFIED / SCANNER_DISABLED / G03 PARTIAL.** Receipt owner disimpan pada [received-owner-inventory.json](acceptance/guard-g03/20261120-scanner-inventory-observed/received-owner-inventory.json). Jangan mengulang inventory atau POST metadata yang sudah selesai.

## Kesimpulan yang didukung bukti

- `g02-install` mencatat image `sha256:3608834fae5f966e6380af0c7b2acf71a46af2ac2bac8591be2b0851d501fa51` dan manifest rules hash `695eeec6470e526192fa1e3d599fd132ede000fd492a753d6225ef2c00544c1d`. Ini kandidat untuk pemeriksaan berikutnya; belum merupakan observasi image di daemon atau verifikasi rule content.
- `g02-completion-install` mencatat image berbeda `sha256:5b9751ba8b8fe60ddd266b2b8e9caa9812255702ac84c547911d3822ec147080`, tetapi manifest rules tidak berhasil diproyeksikan. Penyebab spesifik missing/denied/format/size belum dibedakan. Jangan fallback ke image tersebut atau mengasumsikan manifest kedua sama dengan yang pertama.
- Satu root DB existing ditemukan, tetapi `product.runtime.json` tidak berhasil diproyeksikan. Karena pembacaan gagal, nilai default `targetMatchesProvenReader:false` dan `targetProjectPolicyRecorded:false` **bukan bukti target mismatch atau tidak ada policy di seluruh host**. `measuredStatus:NOT_READ` berarti referensi Temp tidak diikuti. Tidak ada record qualification fresh yang diperoleh melalui inventory ini.
- Website app reader tetap mempunyai bukti aktual HTTP 200, target configuration dan app-role/schema/RLS verified. Reader memakai target-only config yang terpisah; gagal membaca `product.runtime.json` tidak membatalkan keberhasilan reader tersebut.
- Worker belum dibuktikan. Tidak ada Docker/Node/helper, SQL, qualification, scan, perubahan file/environment atau restart pada receipt inventory. Belum ada finding SAST nyata pada project acceptance untuk AI.

## Satu proposal gabungan READ ONLY — belum disetujui/dijalankan

Review `.local/g03-owner-selection/prove-existing-worker-image-readonly.ps1`. Persetujuan inventory sebelumnya melarang credential loader, koneksi DB, Node dan Docker; proposal ini memerlukan **approval baru** untuk tindakan berikut saja:

1. Satu koneksi menggunakan **role `wetscan_guard_worker`** ke exact target `localhost:5432/wetscan_dev_guardg02`, marker `wetscan-s01:f0927e49-0e70-4b90-913f-6cd6984df9d8`, plan `b63e1e8568babcf8d7811fe0fa735ecbec11ade64df19bdea78deb030a85869d`.
2. Loader Guard existing membaca `worker.database.json` dan, hanya setelah purpose/role/target/plan/expiry valid, `worker.password` secara internal. Agent dan PowerShell tidak membaca/mencetak/menyalin nilai password. Tidak memakai app/bootstrap/migration credential atau pointer.
3. `ApprovedPool` existing melakukan SELECT identitas awal pada koneksi yang sama sebelum mengembalikan client. Sesudah itu proof menjalankan `BEGIN READ ONLY`, SELECT identitas/schema ledger/catalog RLS, kemudian `ROLLBACK`, release dan pool close. Semua SQL merupakan observasi; SELECT awal pool berada sebelum transaksi eksplisit, bukan diklaim di dalamnya. Tidak membaca findings/scans/jobs historis atau menulis DB. Hasil hanya membuktikan identitas/schema/catalog RLS; belum membuktikan operasional queue, worker lease atau keseluruhan privilege contract readiness.
4. **Hanya bila proof worker berhasil**, jalankan paling banyak tiga perintah metadata Docker pada local named pipe existing: `version`, `info`, serta `image inspect` untuk image pin `3608834f...`. Respons template dibatasi pada versi/OS, image ID/OS/User/Entrypoint. Tidak meminta daftar container/image, Config.Env, mounts atau Docker credentials.

Docker memakai factory existing `dockerDriver`, executable `docker.exe` dari `Get-Command` sebagai Application, tanpa shell, timeout 5 detik dan batas output 8 KiB per command. `DOCKER_CONFIG`/HOME/TEMP child diarahkan ke path khusus yang wajib **belum ada**; helper menolak path yang sudah ada. Tidak membuat directory tersebut atau membaca Docker config owner. Tidak ada create/start/exec/pull/build/kill/remove/prune atau scanner invocation.

Wrapper harus dijalankan setelah review/approval pada **console terpisah yang tadi menjalankan inventory scanner**. Ia memakai satu candidate metadata `$g03ScannerCandidates` yang sudah ada di memory owner, memvalidasi path/root ACL dan file metadata. Jika variable hilang, kandidat bukan satu, symlink/ACL berubah, code hash berbeda atau dependency command tidak tersedia, STOP tanpa memilih direktori lain, mengubah ACL atau mengulang inventory otomatis. Jangan menutup server atau me-reload tab browser dengan binding owner.

Child Node memakai bundled source Guard existing dan adapter owner lokal; tidak menjalankan helper G02 `verify` yang sebelumnya berhenti. Import graph dibundel offline, tanpa install, stub/alias `server-only` atau perubahan production code. Environment child hanya SystemRoot/WINDIR/TEMP/TMP dan NODE_ENV; parent references tidak diubah. Output/stdout/stderr ditangkap terpisah, hanya fixed projection dicetak. Parent timeout 90 detik, outcome UNKNOWN tidak diulang atau di-recover otomatis. Tidak ada file/evidence runtime yang ditulis helper.

Hasil yang diharapkan jika keduanya berhasil: `READONLY_WORKER_AND_IMAGE_METADATA_VERIFIED`. Status tersebut tetap **bukan qualification atau scan authority**. Jika worker verified tetapi image metadata gagal, pertahankan dua hasil itu terpisah dan jangan mengulang koneksi worker otomatis.

## Persiapan dan pengujian offline

- Bundle dibangun dari 11 input, termasuk validator/pool/migration plan, sandbox Docker metadata driver dan adapter lokal. Tidak memanggil fungsi proof/driver dengan dependency nyata.
- **21/21 offline checks PASS**, memakai dependency doubles: 12 kasus proof worker (exact purpose/target/plan, before-connect denials, connection error, role/marker/schema/RLS, rollback/close), dan 9 kasus metadata image (pin, OS, user, entrypoint, reference, version, transport/JSON errors, safe projection).
- PowerShell wrapper **0 AST parse errors**; scalar reference expression diperiksa tanpa mengakses metadata owner. Wrapper belum dijalankan atau functional tested pada proses owner. Syntax/offline PASS tidak diklaim sebagai autentikasi worker atau Docker readiness.
- Code/helper hashes dan compile metadata dicatat pada evidence proposal. Kode G03/G02/Auth/Sentinel, ZIP baseline dan credential tetap utuh. Tidak menjalankan ulang seluruh regresi karena perubahan tahap ini hanya dokumentasi dan ignored owner helpers.

## Setelah proof — tetap proposal, bukan izin otomatis

Jika exact worker dan image metadata terbukti, susun setup G03 pada **direktori/config baru** dengan policy workspace dari memory authorizer owner, exact project `github-1465216209`, branch `g03/acceptance-base`, `engines:["sast"]`, maxAttempts=1. Jangan menimpa target-only reader, runtime Will/wdu atau qualification historis. Jangan memperluas scope ke repository lain.

Fresh qualification memerlukan persetujuan terpisah untuk controlled container/source fixtures, local report artifacts dan owned cleanup. Jadwalkan setelah prasyarat worker/policy siap agar validity satu jam tidak terpakai untuk diagnosis. Existing `qualify.ts --full` menjalankan Opengrep, OSV, Gitleaks, Trivy IaC dan Trivy image, termasuk controls/output/timeout/cancel/OOM/owned-orphan cleanup; bukan SAST-only. Jangan menjalankan broad tool di bawah izin SAST-only atau menyalin hasil lama. Kelengkapan image lama untuk seluruh CLI tersebut belum terbukti dari ID/manifest dan harus dipertimbangkan dalam proposal qualification; jangan menjanjikan PASS.

Konfigurasi non-secret yang hilang/tidak terbaca tidak boleh dipulihkan dengan provisioning/reset/migrasi atau penyalinan credential. Setup berikutnya harus memakai role approvals existing yang masih valid dan pemeriksaan scope baru; expiry lama tidak boleh diperpanjang diam-diam. Tidak ada alasan saat ini untuk mengubah Auth/App, dependency produk atau database historis.

Setelah setup terbukti, baseline G02 SAST tetap membutuhkan approval source acquisition/scan tersendiri untuk empat file baseline 1.374 byte pada `6eb920a5573c39105fa0390d464d271fb1c7b5bf`, dengan tree/blob/current head verified. AI berbayar ≤US$0,10, patch review, GitHub draft PR, behavioral tests dan verified retest tetap tahap masing-masing. **G03 tetap PARTIAL** sampai rantai acceptance nyata tersebut terbukti.

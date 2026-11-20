# G03 — STOP ENOENT sebelum qualification

**Current owner recovery STOP (20 November 2026): operation 93cfd652-307c-43dc-bb10-3cd45f0987d9 ended IMAGE_PIN/IMAGE_PIN_STOP, known outcome, exit 1/no Node stderr, zero create attempts. New Temp preparation occurred, but no container/copy/sidecar/qualification. V1 discarded Docker stderr; IMAGE_PIN_STOP alone does not prove image absence. Docker 29 optional empty Config fields expose a concrete helper compatibility defect, not yet correlated to this owner run. See [the same-image READ ONLY diagnostic and separate V2 fix](GUARD_G03_IMAGE_PIN_STOP.md). Do not retry V1 or run V2; V2 recovery requires new approval after diagnostic. G03 PARTIAL.**


**Current owner diagnosis (20 November 2026): 70 references checked, 69 regular files; INSTALL_TRIVY_MANIFEST (.local/g02-install/context/trivy-db-manifest.json) FILE_MISSING_AT_CHECK. This is the concrete current prerequisite blocker; other file content/hash semantics remain unverified by metadata alone. Setup/qualification has not been retried. See [the proposed pinned-image cache metadata recovery into a NEW G03 sidecar](GUARD_G03_TRIVY_MANIFEST_RECOVERY.md); one never-started container/new local artifacts require NEW approval, NOT_EXECUTED. Existing installation/V1 artifacts remain unchanged. No owner source/scan/AI/PR/retest. G03 PARTIAL.**


20 November 2026, Asia/Jakarta. **SETUP_STOP_BEFORE_QUALIFICATION / G03 PARTIAL.** Receipt owner: [received-owner-stop.json](acceptance/guard-g03/20261120-qualification-reference-stop/received-owner-stop.json). Jangan mengulang `setup-qualified-sast.ps1`, qualifier, proof worker/image, inventory, POST atau exporter.

## Diagnosis yang dapat dibuktikan

- Child Node berjalan dan mengembalikan JSON terstruktur, exit 1, stderr tidak ada. Ini bukan kegagalan startup PowerShell/Node yang hanya menghasilkan wrapper UNKNOWN.
- `phase:REFERENCES`, `reason:ENOENT`, `qualificationAttempted:false`, `localArtifactMutationAttempted:false`: reference gate berhenti sebelum jalur pembuatan root/artifact runtime dan sebelum pemanggilan qualification. Setup belum membuat container atau memanggil scanner; tidak ada DB/source repository/AI/GitHub write pada receipt ini. File export scope owner dari langkah browser terpisah boleh sudah ada; jangan menghapus atau mengekspor ulang file tersebut.
- **ENOENT belum menunjuk file tertentu.** V1 memakai satu phase REFERENCES untuk Docker executable metadata, build manifest dan 47 file integrity inputs, scope JSON, migration-plan source, role approval JSON serta metadata instalasi. Salah satu path/file/ancestor pada operasi tersebut tidak ditemukan saat run. Catch membuang raw path/error; receipt tidak menyimpan subphase yang lebih spesifik.
- Integrity audit agent pada source/helper publik yang sudah ada: semua **47 manifest inputs tersedia dan hash cocok**, wrapper/bundle/manifest yang dijalankan tetap cocok dengan approval. Ini observasi workspace agent sesudah STOP, bukan pembuktian file privat atau kondisi semua path saat proses owner berjalan.
- Scope file telah melewati Get-Item di wrapper sebelum child dimulai, tetapi itu bukan bukti scope JSON sudah dibaca/valid di child. Sebagian pembacaan non-secret reference boleh sudah selesai sebelum ENOENT; urutan kegagalan belum diketahui. Agent tidak membuka scope/approval/installation privat untuk mencari jawabannya.
- Tidak ada bukti password salah/expired, kerusakan DB, GitHub authorization gagal, Docker image hilang, scanner gagal, atau vulnerability repository. Proof app/worker/image sebelumnya tetap merupakan bukti pada saat proof tersebut dilakukan; belum ada qualification PASS atau Live G03 finding.

Kekurangan observability ini berasal dari helper G03 yang disiapkan agent: phase reference terlalu luas. Unit persiapan 31/31 sebelumnya menguji model/validator/exporter, **bukan reference IO actual owner atau keseluruhan orchestration**. Hasil STOP ini tidak ditutupi dengan perubahan assertion atau evidence lama.

## Satu pemeriksaan owner berikutnya — metadata referensi yang sama

File siap review: `.local/g03-owner-selection/diagnose-setup-references.ps1`.

Pemeriksaan ini hanya mengobservasi metadata dari daftar referensi yang sudah diizinkan pada tahap setup; **bukan retry setup/qualification** dan tidak memerlukan credential atau tambahan scope source. Tidak memperluas target, membaca file privat baru atau membuka DB. Jalankan setelah review pada console terpisah yang baru mengembalikan STOP; script membutuhkan `$g03SetupResult`, `$g03SetupDbRoot` dan `$g03SetupDocker` dari attempt tersebut. Jika state tidak ada/berubah, STOP; tidak ada fallback, enumeration root, login atau setup ulang otomatis.

Scope diagnostik:

1. Membaca **hanya public pinned build manifest** (hash harus tetap `f9e381d7959162e23ca5348c495aa201939075a1d300bd424a148fa9b29f33a3`) untuk 47 nama file source/helper. Manifest dan parent reparse/size diperiksa sebelum dibaca.
2. Get-Item metadata saja pada 70 referensi: Docker executable existing; manifest dan 47 inputs; owner scope; Guard/platform migration-plan source files yang sudah dipakai Guard; app/worker approval JSON; enam installation/config metadata files. Pemeriksaan source SQL hanya metadata kode dalam worktree, **bukan database atau arsip Sentinel/G01**.
3. Scope/approval/installation content, password, `.env`, Auth state, pointer, rule/binary/database scanner dan report historis **tidak dibaca**. Tidak menjalankan helper/Node/Docker, migration-plan function, SQL, network, export, qualification atau source acquisition. Tidak mengubah file/environment/ACL, restart atau cleanup.
4. Output hanya `checked`, `regularFilesPresent` dan array `issues` berisi **label tetap** serta status. BUILD_INPUT ordinal dapat dipetakan agent ke manifest publik yang hash-nya sama. Tidak mencetak path, workspace/actor, raw exception atau unknown fields. `FILE_MISSING_AT_CHECK` hanya membuktikan kondisi pada waktu diagnosis, bukan memulihkan raw exception run pertama.

Tinjau lalu paste seluruh block **sekali** pada console owner tersebut. Kirim hanya JSON projection; jangan kirim isi scope, approval, config, private reference map atau raw error. Jika seluruh metadata kini tersedia, hasil harus `ALL_FILE_METADATA_PRESENT_CAUSE_UNRESOLVED`; jangan menganggap masalah hilang atau mengulang setup. Jika variable/prasyarat diagnosis hilang, laporkan fixed STOP tanpa mengulang tahap lama.

AST PowerShell: **0 parse errors**. Static command review hanya Get-Item/Get-Location/Get-FileHash/Get-Content public manifest/Join-Path/JSON conversion. Diagnostic belum dijalankan di proses owner; syntax PASS tidak diklaim sebagai hasil metadata aktual.

## Perbaikan observability yang disiapkan offline

V1 wrapper, source, bundle, manifest, proposal dan approval **dibekukan pada hash yang sama**. Tidak ada overwrite artifact yang dipakai owner.

Source proposal baru `.local/g03-owner-selection/setup-qualified-sast-v2.mjs` memakai label tetap untuk setiap kelas reference, termasuk `BUILD_INPUT_01..47`, scope, plan, approval dan masing-masing metadata instalasi. `.local/g03-owner-selection/observed-reference.mjs` mempertahankan code ENOENT/EACCES/EPERM/EEXIST dan phase tanpa menyimpan raw error path/message/cause. Ia tidak menambahkan retry atau mengendurkan validator/path/digest/expiry.

Default V2 hanya **references-only**, kembali sebelum mutation boundary. Qualification memerlukan mode eksplisit terpisah. **29/29 offline phase/error-redaction tests PASS**; source V2 berhasil dikompilasi secara in-memory tanpa mengeksekusi fungsi. Tidak ada manifest/bundle/wrapper V2 operasional atau recovery run yang disiapkan sebagai instruksi eksekusi. Jangan menjalankan source proposal ini sekarang.

Setelah metadata owner mengidentifikasi blocker, siapkan recovery konkret: gunakan provenance existing yang benar untuk reference yang hilang, tanpa fabricate/copy credential, re-date qualification, menghapus engine gagal atau mengubah baseline/Will. Jika file metadata instalasi tidak tersedia, jangan menganggap public digest/image ID saja cukup untuk membuat isi file pengganti. Diagnosis harus membedakan file hilang vs path salah vs artifact provenance belum tersedia sebelum mengusulkan tindakan pemulihan.

Satu setup attempt yang disetujui telah dipakai. **Recovery atau qualification attempt baru memerlukan approval baru** terhadap artifact dan tindakan yang sudah bisa ditinjau, setelah blocker diketahui. Tidak ada izin retry implisit dari perbaikan observability. AI, scan repository, PR, retest dan website attachment/restart tetap belum diizinkan.

Kode produk G03/G02/Auth/Sentinel, database historis, 46 implementation hashes dan ZIP baseline tetap utuh. G03 **PARTIAL**, belum COMPLETE.

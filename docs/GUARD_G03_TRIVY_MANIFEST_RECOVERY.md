# G03 — manifest Trivy hilang; proposal recovery metadata dari image

**Current owner recovery STOP (20 November 2026): operation 93cfd652-307c-43dc-bb10-3cd45f0987d9 ended IMAGE_PIN/IMAGE_PIN_STOP, known outcome, exit 1/no Node stderr, zero create attempts. New Temp preparation occurred, but no container/copy/sidecar/qualification. V1 discarded Docker stderr; IMAGE_PIN_STOP alone does not prove image absence. Docker 29 optional empty Config fields expose a concrete helper compatibility defect, not yet correlated to this owner run. See [the same-image READ ONLY diagnostic and separate V2 fix](GUARD_G03_IMAGE_PIN_STOP.md). Do not retry V1 or run V2; V2 recovery requires new approval after diagnostic. G03 PARTIAL.**


20 November 2026, Asia/Jakarta. **INSTALL_TRIVY_MANIFEST_MISSING / QUALIFICATION_NOT_RUN / G03 PARTIAL.** Receipt: [received-owner-reference-diagnosis.json](acceptance/guard-g03/20261120-trivy-manifest-missing/received-owner-reference-diagnosis.json).

## Blocker yang terbukti

Owner memeriksa 70 reference metadata: 69 regular files tersedia; satu file **`.local/g02-install/context/trivy-db-manifest.json`** berstatus FILE_MISSING_AT_CHECK. Ini reference konkret yang menghalangi setup. Kondisinya konsisten dengan ENOENT sebelum qualification; raw exception attempt pertama tetap tidak disimpan, sehingga diagnosis bukan rekonstruksi timestamp/error pertama.

69 file metadata tersedia tidak membuktikan JSON, hash, expiry atau semantic validation semuanya lulus. Jangan menjanjikan qualification PASS hanya setelah file ini diperoleh. Tidak ada koneksi/scanner/container/helper yang dijalankan oleh diagnosis. Proof reader, worker dan image sebelumnya tetap mempunyai receipt masing-masing; belum ada Live G03 finding.

## Kontrak asal manifest dan pilihan recovery

Source G02 `worker/guard/installation/build-context.ts` membaca `context/trivy-cache/db/metadata.json`, lalu menulis `JSON.stringify(meta, null, 1)` sebagai `trivy-db-manifest.json`. Dockerfile menyalin cache ke `/opt/g02/trivy-cache/` dan manifest ke `/opt/guard/`. `measured.ts` dan helper setup menggunakan hash manifest untuk record Trivy OCI; derivation full-run yang dipertahankan tidak mengabaikan engine ini.

Proposisi recovery: ambil **metadata cache aktual** dari image immutable yang telah dibuktikan owner, image ID `sha256:3608834fae5f966e6380af0c7b2acf71a46af2ac2bac8591be2b0851d501fa51`. Lokasi tunggal yang boleh dibaca adalah **`/opt/g02/trivy-cache/db/metadata.json`**. Keberadaan file di dalam image belum diklaim terbukti; jika tidak tersedia, STOP tanpa fallback image/download/build atau file rekaan.

Docker `create` menyediakan container tanpa memulainya, sedangkan `cp` mendukung container yang berhenti dan stream tar ke stdout. Karena itu metadata dapat diperoleh tanpa menjalankan entrypoint/scanner. [Docker create](https://docs.docker.com/reference/cli/docker/container/create/), [Docker cp](https://docs.docker.com/reference/cli/docker/container/cp/).

## Satu proposal owner-operated — belum disetujui/dijalankan

Review `.local/g03-owner-selection/recover-trivy-manifest.ps1`, bundled source `recover-trivy-manifest.bundle.mjs`, source `recover-trivy-manifest.mjs`, dan parser `trivy-manifest-recovery-model.mjs`.

Approval baru diperlukan: satu setup attempt terdahulu telah terpakai dan berhenti; diagnosis hanya metadata. Recovery ini membuat **satu container sementara yang tidak pernah dijalankan**, mengambil satu file metadata image, serta menulis artifact lokal baru. Ini tidak mengulang setup atau qualification dan tidak memakai approval lama untuk tindakan baru.

Jika disetujui, helper hanya:

1. Memakai console owner yang sama, memastikan receipt STOP dan diagnosis 70/69/satu INSTALL_TRIVY_MANIFEST masih ada di memory. Jika state berubah/hilang atau original host path kini ada, STOP tanpa menimpa, mengulang inventory/export/proof atau memilih root lain.
2. Membuat root Temp baru ber-ACL owner+SYSTEM melalui validator snapshot existing. Prefix legacy snapshot hanya namespace yang disyaratkan validator; root baru dibuat oleh run ini dan tidak terkait arsip G01/N01. Membuat empty Docker config baru; tidak membaca config/credential Docker owner, scope file, approval/password, `.env`, Auth state atau DB.
3. Memeriksa pin/image Linux/user dan menolak image yang mendeklarasikan volume. Membuat intent sebelum **maksimal satu `docker create`**, `--pull never`, user 65532:65532, readonly/no-network/no-IPC/no-privilege, tanpa mounts/volumes, 1 CPU/256 MiB/64 PIDs. Container tetap `created`, tidak ada `start`, `run`, `exec`, scanner command, image build/pull atau GitHub operation.
4. Memverifikasi ID, name, image, run label, security controls, zero mounts dan State.created/Running=false/StartedAt=zero. Mengharuskan `docker diff` kosong sebelum dan sesudah copy; ini memeriksa perubahan filesystem container, bukan attestation seluruh database scanner. [Docker diff](https://docs.docker.com/reference/cli/docker/container/diff/).
5. Satu `docker cp <owned-id>:/opt/g02/trivy-cache/db/metadata.json -`, tanpa `-L`, melalui binary-safe stdout, maksimal archive 128 KiB dan payload JSON 64 KiB. Tidak mengekstrak archive ke filesystem. Parser hanya menerima satu regular `metadata.json`, checksum/header/length valid, bounded PAX timestamps/path yang tepat; menolak links, traversal, duplicate/extra files, sparse/size overrides dan trailing data. JSON memakai shape sempit Version dan optional date metadata; shape tak didukung dihentikan, bukan diinterpretasikan sebagai qualification failure.
6. Memeriksa kembali container **yang sama** dan writable layer, lalu `rm <exact-id>` tanpa force/volume flag hanya jika identitas/state masih sesuai dan tidak ada outcome UNKNOWN. Memverifikasi absence dengan filter exact ID; tidak ada global listing/prune/sweep, tidak menyentuh container existing. Perubahan identitas/layer/state, timeout, create/copy/cleanup UNKNOWN: STOP, pertahankan intent, tanpa retry atau mutating recovery otomatis.
7. Hanya setelah metadata valid **dan cleanup terverifikasi**, menulis file baru dalam root G03 tersebut: original metadata archive/bytes, derived `trivy-db-manifest.json` dan provenance berisi image/source path/run/container identity serta source/canonical SHA256. Serializer sama dengan builder G02, tanggal/nilai metadata asli dipertahankan. Tidak mengklaim byte identity dengan host manifest lama yang hilang atau full database integrity/freshness. Artifact ini **G03 sidecar baru**, bukan penggantian original instalasi.

**Tidak ada penulisan ke `.local/g02-install` atau direktori Will.** Tidak ada code produk/G02/G03/Auth/Sentinel, database, config website, environment references, baseline ZIP, source repository, scanner/qualification, AI, GitHub PR/write atau retest yang diubah/dijalankan.

Timeout Docker CLI 20 detik per operasi, batas wrapper 5 menit. Maksimal satu create, satu fixed-file copy, dua identity inspections, dua filesystem-diff observations, satu owned removal dan satu exact-ID absence check, plus initial pinned-image inspect. Cleanup yang diizinkan hanya container baru milik run ini; root Temp/evidence tetap disimpan untuk provenance. Jika response UNKNOWN, jangan mencoba cleanup atau mengulang sendiri.

## Hasil dan langkah sesudah recovery

Status sukses yang diperbolehkan adalah `SIDECAR_RECOVERED_FROM_IMAGE_CACHE_NOT_QUALIFICATION`. Output aman hanya status/phase/failurePhase, operation ID, verification booleans, image/source/canonical hashes dan metadata Version. Private paths disimpan hanya sebagai `$g03RecoveredTrivyReferences` pada console owner; jangan kirim object itu, raw archive/metadata atau raw stdout/stderr ke chat.

Sesudah approval, owner meninjau lalu paste seluruh `recover-trivy-manifest.ps1` **sekali** pada console diagnosis yang sama dan mengirim JSON projection. Jangan menjalankan sekarang sebelum approval. Tidak perlu browser request/login/export ulang; tetap pertahankan tab existing dengan binding owner untuk setup berikutnya.

Jika sukses, gunakan hash/provenance sidecar tersebut untuk menyiapkan reference V2 yang eksplisit pada konfigurasi G03 baru. Jangan mengubah original path atau menghapus pemeriksaan Trivy dari original derivation. V2 references-only gate harus lulus sebelum satu controlled qualification retry yang disetujui secara spesifik. Recovery ini **tidak memberikan izin qualification retry**, attachment, restart atau baseline scan.

Jika file cache tidak ada/shape tidak didukung/cleanup tidak terbukti, laporkan hasil sebenarnya. Alternatif berikut harus memakai provenance instalasi existing dari owner/Will atau rebuild terpisah yang ditinjau; jangan mengarang isi manifest atau mengganti image diam-diam. Agent tidak mengirim pesan ke Will.

## Validasi offline

**45/45 offline checks PASS**: bounded tar/PAX/checksum/UTF-8/JSON, path/link/duplicate/oversize rejection; exact identity/security/never-started checks; volume/image rejection; single-create/single-copy; transport/create/copy/cleanup UNKNOWN tanpa retry/mutating cleanup; writable-layer drift; safe failure phase/projection; sidecar hanya setelah owned cleanup dan tanpa overwrite original. Test doubles tidak menjalankan Docker atau menulis file owner.

Bundle hanya empat input (adapter/parser dan validator snapshot/model existing), tanpa dependency baru. PowerShell wrapper: 0 AST parse errors. Helper default/CLI belum functional tested pada owner dan tidak dijalankan oleh agent. V1 artifacts tetap frozen, 46 implementation hashes serta ZIP baseline tetap identik. Offline PASS bukan qualification atau Live Acceptance. **G03 tetap PARTIAL.**

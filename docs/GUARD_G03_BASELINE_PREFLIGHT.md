# G03 - preflight setelah pemilihan repository berhasil

**Website reader verified from owner receipts (20 November 2026):** three app references attached; onboarding/readiness/history all GET 200; both repositories retained; database approved/schema verified; project scan history empty (not a clean scan). Scanner remains disabled by design. Owner separately confirmed g03/acceptance-base HEAD equals baseline 6eb920a5573c39105fa0390d464d271fb1c7b5bf; tree/blob unverified. See [next metadata/runtime prerequisites](GUARD_G03_READER_VERIFIED_NEXT_METADATA.md). A single POST metadata preflight is proposed but requires new approval beyond prior GET-only scope; no source/scan/AI/GitHub write/retest. G03 remains PARTIAL.

**STOP UPDATE (20 November 2026):** owner reader attempt stopped at G03_EXISTING_TARGET_VERIFY_STOP_NO_RETRY before reference attachment/npm startup. Do NOT rerun verify, env or the old attach block; do NOT restart/reset/provision. Prior reader approval is halted; any recovery needs NEW approval. See [the read-only diagnosis and metadata-only recovery proposal](GUARD_G03_VERIFY_STOP_DIAGNOSIS.md). Agent has not executed the helper or connected to the database. Owner-run internal phase remains UNKNOWN.

**Latest preflight receipt (20 November 2026):** owner GET confirms both selected IDs (839286157,1465216209), completed profile and target Private. Guard readiness is the default BLOCKED projection; history GET is 503 approval_required, not an empty result. Product reader is not configured/available in the observed website runtime; actual database absence/expiry is not proven. Follow [the reader-runtime diagnosis and owner-operated proposal](GUARD_G03_READER_RUNTIME_SETUP.md). Existing G02 reference attachment/local website restart is prepared but NOT_EXECUTED; all scanning/source/AI/GitHub-write/retest gates remain closed.

20 November 2026. **PARTIAL**. Owner melaporkan `inkAja/wetscan-g03-acceptance` berhasil ditambahkan dan `inkAja/wdu` dipertahankan. Pemilihan dilakukan owner melalui sesi browser existing; agent mengirim **nol POST**. Jangan ulangi snippet penambahan repository.

## Target tetap

| Binding | Nilai / bukti |
| --- | --- |
| Repository | `inkAja/wetscan-g03-acceptance`, ID `1465216209`, Private; receipt discovery existing |
| Project | `github-1465216209` |
| Pilihan lama | `839286157` (`inkAja/wdu`), dipertahankan menurut owner |
| Branch acceptance | `g03/acceptance-base`, bukan default `main` |
| Baseline owner | `6eb920a5573c39105fa0390d464d271fb1c7b5bf`; HEAD belum diverifikasi dari provider |
| Paket | ZIP baseline existing empat file, total 1.374 byte, tidak diregenerasi/diganti versi fixed |
| Finding / AI / PR / retest | Belum tersedia / NOT_RUN |

Konfirmasi owner adalah bukti owner-reported. Jangan menyebutnya observasi independen agent atau hasil scanner. Receipt JSON API setelah penyimpanan dan observasi readiness tetap akan dicatat terpisah.

## Satu tindakan owner berikutnya: GET-only preflight

File lokal: `.local/g03-owner-selection/read-only-preflight.js`. Tinjau lalu jalankan **sekali** melalui DevTools **Sources -> Snippets** pada sesi `http://localhost:3000` existing; kirim JSON yang dicetak, bukan raw API response. Tidak perlu membuka `.env`, cookie, token, profile lengkap atau login baru.

Kontrak yang benar-benar ada di kode dan satu-satunya request yang diizinkan helper:

1. `GET /api/onboarding`: verifikasi sesi completed, kedua ID terpilih, exact target name dan Private; export hanya IDs/step.
2. `GET /api/guard/projects/github-1465216209/readiness`: verifikasi proyeksi enum database/schema/queue/sandbox/worker/repositoryScanning dan `scanAccepted:false`.
3. `GET /api/guard/projects/github-1465216209/scans?limit=50`: baca riwayat project yang diotorisasi; export hanya scan IDs/status dan boolean kecocokan baseline. Tidak membuka view/source/finding summary. Batas 50 dicatat, bukan klaim seluruh history.

Helper hanya GET same-origin; origin/path dibatasi, paling banyak tiga request, timeout 60 detik/request, tanpa redirect atau retry. Error hanya fixed code/status; profil, nama akun, source, receipt privat dan unknown fields tidak dicetak. Stop pada perubahan selection, authorization/error atau binding yang tidak cocok. BLOCKED adalah observasi konfigurasi, bukan alasan mengaktifkan flag/memulai scan. Empty/inaccessible history tidak membuktikan target bersih.

Ini pembacaan normal melalui Auth/App existing: backend dapat menjalankan lifecycle token read-only dan menyimpan sesi. Helper tidak mengekstrak atau mengedit credential. Tidak ada perubahan pilihan profile, source acquisition, queue/enqueue, scanner, AI atau GitHub repository write.

## Batas metadata revision yang ditemukan

Jangan memakai `POST .../revision` atau `.../repository`, Open Canvas, atau source preview sebagai pengganti preflight GET-only ini. Dalam implementasi G02 existing, `githubSourceAccess().head()` memanggil REST `/repos/{owner}/{repo}/commits/{ref}` dengan JSON media type; endpoint itu dapat membawa `files[].patch`. Helper revision hanya mengembalikan SHA/tree kepada client, tetapi transport upstream tetap dapat memperoleh diff. [Dokumentasi Get a commit](https://docs.github.com/en/rest/commits/commits#get-a-commit) menjelaskan respons file/diff tersebut.

Karena izin source acquisition masih belum ada, jalur itu **tidak dijalankan**. G02/Will tidak diubah. Verifikasi HEAD/tree/blob yang benar-benar metadata-only memerlukan observasi provider terbatas pada branch/ref, Git commit object dan tree entries tanpa blob/diff; atau tahap source acquisition terpisah yang secara eksplisit disetujui. Respons `sourceRead:false` saja tidak cukup membuktikan transport tidak membawa source. Belum ada verifikasi HEAD/tree baru yang diklaim.

## Rancangan satu baseline SAST - belum diizinkan

Setelah observasi metadata/runtime siap, siapkan permintaan owner konkret untuk **satu** baseline, tanpa mengeksekusi sekarang:

- Scope hanya project/repository di atas, branch `g03/acceptance-base`, exact SHA baseline. HEAD harus masih cocok; stop jika stale atau identitas berubah. Jangan memilih `main` otomatis.
- Review tree terhadap empat path/blob/size pada manifest baseline. Hanya empat regular `100644` files; reject file tambahan, symlink, submodule, file besar, perubahan hash atau versi fixed. Jangan membaca seluruh repository lain.
- Gunakan target PostgreSQL Guard/G02 terisolasi yang memang disetujui dan existing App. Runtime policy harus secara eksplisit cocok dengan workspace/project/branch serta fresh scanner qualification. Readiness enum saja tidak membuktikan marker database atau policy tersebut. Jangan mereset/migrasi database historis, mengubah credential atau mengendurkan sandbox.
- Source acquisition hanya empat file yang direview pada SHA tersebut, maksimal total 1.374 byte bila bytes sesuai manifest. Jalankan **satu engine `sast`, quick**, melalui G02 admission/queue/worker yang nyata. Jangan mengeksekusi package scripts/behavioral tests pada tahap ini, memperluas engine atau melakukan retry otomatis.
- Simpan actual scan/finding IDs, rule/severity/lokasi, commit, artifact/image/spec/rule pack, coverage dan cleanup. Jika tidak ada finding valid, stop dan laporkan; jangan membuat finding sintetis atau mengulang scan sendiri.
- AI berbayar, human patch approval, GitHub write/draft PR, behavioral execution dan retest tetap tahap terpisah. UNKNOWN hanya diobservasi, tidak diulang.

Ini masih rancangan karena HEAD/tree dan kesiapan target operasional belum terbukti. Persetujuan penambahan repository yang sudah selesai tidak mengizinkan baseline scan ini.

## Pekerjaan lokal yang selesai

Tidak ada perubahan kode G03/G02/Auth/Sentinel atau ZIP baseline. Helper GET-only lulus **11/11** skenario offline transport doubles: scope/path/method, kedua repository, target identity, Auth/error/timeout, redaksi projection, readiness tak terduga, storage, malformed JSON, dan history binding. **Nol request owner dikirim agent**. Core G03 194/194 dan pemeriksaan Auth/discovery 56/56 dari tahap sebelumnya tidak diulang/diakui sebagai acceptance live.

Status: pemilihan repository **OWNER_REPORTED_SUCCESS**; preflight runtime **PENDING_OWNER_GET_RECEIPT**; HEAD/tree/blob **NOT_VERIFIED**; finding baseline, AI nyata, PR nyata dan retest repository asli **NOT_RUN**. G03 belum COMPLETE.

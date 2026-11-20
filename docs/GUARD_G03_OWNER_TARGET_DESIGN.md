# G03 — rancangan target Live Acceptance milik owner

**Website reader verified from owner receipts (20 November 2026):** three app references attached; onboarding/readiness/history all GET 200; both repositories retained; database approved/schema verified; project scan history empty (not a clean scan). Scanner remains disabled by design. Owner separately confirmed g03/acceptance-base HEAD equals baseline 6eb920a5573c39105fa0390d464d271fb1c7b5bf; tree/blob unverified. See [next metadata/runtime prerequisites](GUARD_G03_READER_VERIFIED_NEXT_METADATA.md). A single POST metadata preflight is proposed but requires new approval beyond prior GET-only scope; no source/scan/AI/GitHub write/retest. G03 remains PARTIAL.

**Actual owner app-role proof received (20 November 2026): READONLY_PROOF_VERIFIED**, one connection to localhost:5432/wetscan_dev_guardg02 marker f0927e49-0e70-4b90-913f-6cd6984df9d8, schema/catalog RLS verified, rollback/pool close true, exit 0, no stderr. No website attachment/restart occurred. See [the next three-reference reader-only proposal](GUARD_G03_PROVEN_READER_ATTACH.md); NEW approval is required for process reference changes/local startup. No helper retry, worker credential, source/scan/AI/GitHub write/retest is authorized. G03 remains PARTIAL.

**Owner inventory received (20 November 2026):** worktree root ordinal 1 has consistent app/worker/target-only metadata for localhost:5432/wetscan_dev_guardg02, marker f0927e49-0e70-4b90-913f-6cd6984df9d8, expiry 22 November 2026 00:00 WIB. This differs from the old assumed 55434/d9058dd4 binding. No target is selected automatically and authentication is unverified. See [the new exact-target app-role read-only proof proposal](GUARD_G03_EXISTING_TARGET_PROOF.md). It requires NEW approval for one connection/internal app credential use; no helper retry, environment attachment/restart or database mutation is authorized.

**Owner metadata received (20 November 2026):** PowerShell 5.1/Node 24.17; server-only root package missing, LOCALAPPDATA pointer NOT_FOUND, all five Guard references absent, NODE_OPTIONS/NODE_PATH absent. Port status UNAVAILABLE and error signals empty do not prove a database failure. STOP remains in force. See [confirmed findings and the new non-secret inventory proposal](GUARD_G03_ENVIRONMENT_RECOVERY_PLAN.md). The approved presence-only diagnostic is complete; reading existing approval/config JSON is a NEW proposed scope, not yet authorized. No helper retry/install/DB connection/restart.

**STOP UPDATE (20 November 2026):** owner reader attempt stopped at G03_EXISTING_TARGET_VERIFY_STOP_NO_RETRY before reference attachment/npm startup. Do NOT rerun verify, env or the old attach block; do NOT restart/reset/provision. Prior reader approval is halted; any recovery needs NEW approval. See [the read-only diagnosis and metadata-only recovery proposal](GUARD_G03_VERIFY_STOP_DIAGNOSIS.md). Agent has not executed the helper or connected to the database. Owner-run internal phase remains UNKNOWN.

**Latest preflight receipt (20 November 2026):** owner GET confirms both selected IDs (839286157,1465216209), completed profile and target Private. Guard readiness is the default BLOCKED projection; history GET is 503 approval_required, not an empty result. Product reader is not configured/available in the observed website runtime; actual database absence/expiry is not proven. Follow [the reader-runtime diagnosis and owner-operated proposal](GUARD_G03_READER_RUNTIME_SETUP.md). Existing G02 reference attachment/local website restart is prepared but NOT_EXECUTED; all scanning/source/AI/GitHub-write/retest gates remain closed.

**Latest owner confirmation (20 November 2026):** the owner successfully added repository **1465216209** (inkAja/wetscan-g03-acceptance) and retained **839286157** (wdu), using the existing local browser session. This is OWNER_REPORTED_SUCCESS, not an independent agent API/UI observation. Agent sent zero POST requests; do not repeat the selection snippet. Continue with [GET-only baseline preflight](GUARD_G03_BASELINE_PREFLIGHT.md). Source acquisition, scans, paid AI, GitHub writes/PRs and retests remain unapproved; HEAD/tree/blob still unverified. Earlier missing-selection observations below are historical.

**Latest metadata update (20 November 2026):** owner created **inkAja/wetscan-g03-acceptance** (Private) and supplied baseline **g03/acceptance-base@6eb920a5573c39105fa0390d464d271fb1c7b5bf**. Existing discovery returned repository ID **1465216209**, default branch **main**; derived project **github-1465216209**. Branch HEAD/tree/blob identity remains unverified. Discovery succeeded; completed-onboarding selection UI has a confirmed access gap. Owner confirmed step=complete with only saved ID 839286157; target ID 1465216209 is absent. Proposed local selection union [839286157,1465216209] has NOT been submitted. Follow [the read-only diagnosis](GUARD_G03_REPOSITORY_DISCOVERY.md). No selection POST, source acquisition, scan, AI, GitHub write/PR or retest is authorized/performed by this update.

**Current authorization boundary:** owner setup is reported complete. Use only the existing four-file baseline and WetScan GitHub App. Metadata READ ONLY is approved; local repository-selection writes, source acquisition, scanning, paid AI, GitHub writes/PRs and retests remain unapproved. No G03 code or package change is needed.

**OWNER_REPORTED_CREATED / DISCOVERY_LOLOS / OWNER_REPORTED_SELECTION_SUCCESS. G03 tetap PARTIAL.**

Keputusan owner, 20 November 2026: gunakan repository pengujian GitHub terpisah milik owner. `inkAja/wdu` dan `wilanta/wetscan-prototype` **bukan target patch/PR** tanpa persetujuan terpisah. `wilanta/wetscan-prototype` tetap repository pengembangan implementasi G03, bukan sumber finding campaign ini.

Owner melaporkan repository Private `https://github.com/inkAja/wetscan-g03-acceptance` sudah dibuat dan baseline diunggah pada `g03/acceptance-base@6eb920a5573c39105fa0390d464d271fb1c7b5bf`. Receipt discovery existing mengembalikan ID `1465216209`, Private, default branch `main`. Project yang benar `github-1465216209`. Setelah approval perubahan profile, owner melaporkan target berhasil ditambahkan dan ID lama `839286157` dipertahankan. Jangan ulangi POST. Lanjutkan [preflight GET-only](GUARD_G03_BASELINE_PREFLIGHT.md). HEAD/tree/blob dan finding aktual belum diverifikasi. Agent tidak membuat repository, mengunggah source atau mengubah pilihan/credential.

## Paket yang sudah disiapkan

Target yang ditetapkan: **`inkAja/wetscan-g03-acceptance`**, visibility **Private**, branch **`g03/acceptance-base`**. Discovery Metadata/Contents read sudah lolos pada receipt owner; ini belum memverifikasi admin/push atau PR write. Workflow PR G03 tetap memerlukan pemilik repository personal dengan izin admin/push; organisasi/delegated ownership belum didukung.

Paket lokal: `.local/g03-owner-design-FpPMaO/g03-owner-baseline-portable.zip`. Keempat entry ZIP sudah diperiksa ulang terhadap hash manifest dan memakai separator path portabel. Ekstrak dahulu; **upload empat file/folder hasil ekstraksi, bukan file ZIP**. Source sengaja rentan hanya berada dalam paket ignored ini, tidak ditambahkan ke source aplikasi WetScan atau commit implementasi G03.

| File baseline | Fungsi |
| --- | --- |
| `package.json` | ESM, `private:true`, tanpa dependencies; perintah test memakai `node:test` bawaan |
| `src/parse-json.js` | Parser sengaja menggunakan `eval(text)` sebagai kandidat finding SAST |
| `test/parse-json.test.js` | Lima assertion dengan input literal terkontrol; tidak menjalankan input dari luar |
| `README.md` | Batas campaign, hasil baseline yang diharapkan dan larangan deployment |

Total source **1.374 byte**. Manifest review memuat SHA256 setiap file dan ZIP serta Git blob SHA1 untuk pemeriksaan pohon file sebelum source acquisition. Hash file/blob ini **bukan commit GitHub**. Lihat [manifest paket](acceptance/guard-g03/20261120-owner-target-design/package-manifest.json).

Containment: tidak ada HTTP listener, route publik, deployment, workflow Actions, dependency eksternal, credential atau data nyata. `eval` tetap sengaja tidak aman; jangan deploy modul atau memberinya input eksternal. Scanner nanti membaca source dalam sandbox G02, bukan mengeksekusi aplikasi ini.

Behavioral test lokal yang sudah dijalankan dengan lima literal saja:

- Baseline rentan: **3 PASS / 2 expected FAIL**. Parsing JSON object belum benar dan ekspresi object JavaScript di luar JSON masih diterima.
- Referensi manual `JSON.parse(text)`, dengan test identik: **5 PASS / 0 FAIL**.

Referensi perubahan yang diharapkan secara manual:

```diff
-export function parseJson(text) { return eval(text); }
+export function parseJson(text) { return JSON.parse(text); }
```

Referensi ini bukan hasil AI. Jangan mengunggah versi fixed ke baseline, memasukkannya sebagai respons model, atau mengubah assertion agar baseline terlihat lulus. Finding G02 dan proposal AI harus benar-benar dihasilkan nanti dari repository/commit aktual. Belum ada scan SAST terhadap target baru; jika scanner nyata tidak menghasilkan finding yang valid, hentikan campaign dan evaluasi penyebabnya, jangan membuat finding sendiri.

## Langkah minimum owner untuk menyiapkan target

Owner melaporkan pembuatan/upload, pemberian akses App, dan pemilihan repository di WetScan sudah selesai. Tidak perlu mengulangnya. Langkah di bawah adalah prosedur **owner sendiri** yang dipertahankan sebagai referensi, bukan izin agent melakukan write:

1. Buat repository **Private** pada akun personal owner. Boleh inisialisasi default branch `main` dengan README; jangan aktifkan Pages/deployment atau menambahkan workflow.
2. Buat branch non-default **`g03/acceptance-base`**. Pada branch itu, upload isi paket baseline empat file di atas dan commit. Jangan menaruh source rentan di default branch. Hindari edit isi/line ending setelah ekstraksi supaya hash cocok; bila perlu perubahan, review ulang manifest terlebih dahulu.
3. Berikan akses **hanya repository ini** kepada GitHub App WetScan existing, lalu tambahkan/pilih repo melalui pemilihan repository WetScan existing. Jangan membuat OAuth/App/Auth kedua. Jangan mengubah akses repository lama. Jika App masih read-only untuk Contents/Pull requests, laporkan sebagai blocker; ekspansi izin membutuhkan persetujuan owner terpisah sebelum AI/PR acceptance.
4. Kirim **URL repository, nama branch dan full SHA commit baseline** dari GitHub. Jangan kirim credential/cookie/key. ID project WetScan baru harus diturunkan dari repository actual, bukan menyalin `github-839286157`.

Owner dapat mengirim pesan berikut setelah setup selesai, bila ingin mengizinkan tahap metadata saja:

```text
Repository uji milik saya: https://github.com/<owner>/<repo>
Branch baseline: g03/acceptance-base
Commit baseline: <SHA GitHub 40 karakter>
Repository sudah dipilih pada GitHub App/WetScan existing.

Saya mengizinkan pemeriksaan metadata READ ONLY pada repository ini saja:
identitas/ownership, izin App existing, HEAD dan pohon file/blob ID.
Belum mengizinkan pembacaan isi blob/source acquisition, scan, AI request,
GitHub write, commit/push/merge atau deployment oleh agent.
```

Jangan menjalankan scan atau memasang credential AI hanya untuk menyelesaikan langkah setup ini. Metadata awal akan diperiksa sebelum permintaan izin berikutnya dibuat.

## Persetujuan bertahap setelah repository tersedia

| Tahap | Batas tindakan yang harus direview dan diizinkan secara spesifik |
| --- | --- |
| 1 — metadata read-only | URL/ID owner-repo, visibility Private, existing Auth/App, HEAD baseline dan tree/blob ID cocok dengan manifest; tanpa membaca isi source. Stop jika file tak terduga, symlink/submodule, branch berpindah atau ownership tidak cocok |
| 2 — baseline G02 | Konfigurasi exact project/branch dan scanner qualification segar pada target Guard terisolasi yang disetujui; source acquisition hanya repository kecil yang direview pada SHA tersebut; **satu scan SAST**. Tanpa AI/PR/write source. Simpan job/finding ID, artifact/rules/image/spec/cleanup/coverage aktual |
| 3a — source preview G03 | Satu finding SAST nyata dari tahap 2; baca ulang hanya file finding pada pinned HEAD setelah consent. Tampilkan source digest dan cuplikan teredaksi; stop pada stale revision, redaksi yang mencegah patch aman atau evidence invalid |
| 3b — satu AI request | Setelah preview direview, setujui model/policy/cost dan kirim maksimal satu request server-side. Kandidat snapshot `gpt-5.4-mini-2026-03-17`, reservasi $0,0165; ceiling owner $0,10. Credential dipasang owner secara privat, tidak melalui chat. Tidak ada retry otomatis |
| 4 — review dan satu draft PR | Review diff aktual, risiko dan implikasi behavioral test; setujui patch digest dan izin GitHub write terpisah. Base `g03/acceptance-base`, head baru `wetscan/g03-<proposal>`, keduanya non-default. Pastikan policy G02 mengizinkan exact head untuk retest sebelum write; jangan memperluas policy/izin tanpa approval |
| 5 — retest dan behavioral tests | Setujui satu scanner SAST G02 pada SHA head PR aktual dan lima test yang direview pada source revision yang sama dalam lingkungan terisolasi. Test file harus tetap sesuai manifest. Jangan pakai output fixture sebagai evidence live |
| 6 — durability/UI | Verifikasi actual PostgreSQL dan Guard Live: finding → proposal → review → PR → retest → report/audit, akses/RLS dan persistence setelah restart lokal yang disetujui. Tidak ada reset/deletion database historis |

Semua operasi runtime memakai G02/App/database authorization existing. Gunakan target Guard terisolasi yang disetujui; jangan menyentuh database G01/N01/Sentinel atau mengganti historical rows. Simpan hasil lama dan revision CAS. Qualification yang kedaluwarsa harus diperbarui melalui prosedur G02 yang disetujui; jangan memalsukan timestamp atau mengendurkan sandbox.

Jika respons operasi live **UNKNOWN**, lakukan observasi read-only terhadap job/PR/reservasi existing; jangan mengirim ulang. `verified_fixed` hanya boleh muncul dari evidence scanner aktual yang cocok dengan rule/target, source bytes, before/after commits, image/spec/rules, coverage dan cleanup. Hasil reproduced tetap `still_present`; coverage/error meragukan `inconclusive`; proof tidak memenuhi syarat `not_verified`. Behavioral test harus dilaporkan apa adanya.

## Kriteria COMPLETE untuk scope ini

Label evidence **`LIVE_CONTROLLED_OWNER_TEST_REPOSITORY`**. COMPLETE memerlukan source GitHub dan finding G02 aktual pada pinned commit, satu respons AI nyata, review manusia/draft PR diotorisasi, scanner retest dan behavioral tests pada revision yang benar, serta persistence/audit/UI/restart yang terbukti. Itu membuktikan workflow G03 pada target uji yang owner pilih, bukan vulnerability/fix pada `inkAja/wdu`, `wilanta/wetscan-prototype`, deployment enforcement atau kesiapan produksi.

Status sekarang: target sudah dibuat, discovery lolos, dan penambahan target ke pilihan WetScan **OWNER_OPERATED / OWNER_REPORTED_SUCCESS** dengan wdu dipertahankan. Preflight GET-only dan verifikasi HEAD/tree/blob masih pending; source acquisition, scan, AI, PR dan retest tetap **NOT_RUN / NOT_APPROVED**.

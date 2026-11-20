# G03 - diagnosis discovery repository existing

**Latest owner confirmation (20 November 2026):** the owner successfully added repository **1465216209** (inkAja/wetscan-g03-acceptance) and retained **839286157** (wdu), using the existing local browser session. This is OWNER_REPORTED_SUCCESS, not an independent agent API/UI observation. Agent sent zero POST requests; do not repeat the selection snippet. Continue with [GET-only baseline preflight](GUARD_G03_BASELINE_PREFLIGHT.md). Source acquisition, scans, paid AI, GitHub writes/PRs and retests remain unapproved; HEAD/tree/blob still unverified. Earlier missing-selection observations below are historical.

20 November 2026. Scope: metadata READ ONLY; tanpa perubahan Auth, credential, kode G03, source acquisition, scan, AI atau GitHub repository write.

## Target dan bukti yang diterima

Owner menetapkan `https://github.com/inkAja/wetscan-g03-acceptance`, Private, branch `g03/acceptance-base`, baseline `6eb920a5573c39105fa0390d464d271fb1c7b5bf`, memakai GitHub App WetScan existing. Repository/paket tidak dibuat ulang oleh agent.

Owner membuka `GET http://localhost:3000/api/onboarding/repositories` pada sesi login existing dan mengirim proyeksi berikut:

```json
{"id":1465216209,"fullName":"inkAja/wetscan-g03-acceptance","private":true,"defaultBranch":"main"}
```

Klasifikasi: **OWNER_EXPORTED_EXISTING_DISCOVERY_METADATA_NOT_LIVE_ACCEPTANCE**. Project yang diturunkan dari ID aktual adalah **`github-1465216209`**, bukan project wdu `github-839286157`. Respons owner membuktikan target dikembalikan jalur discovery existing pada sesi tersebut. Ini belum membuktikan bahwa repository sudah disimpan dalam pilihan WetScan, bahwa branch HEAD cocok dengan SHA baseline, atau bahwa ada finding scanner.

Agent tidak memperoleh sesi browser: browser access host unavailable. Tidak ada pembacaan cookie/token/Auth state privat atau `.env.local` untuk melewati keterbatasan itu. Metadata private GitHub tidak tersedia melalui browser web anonim; hasil itu tidak membantah receipt owner. Full SHA baseline masih **OWNER_REPORTED / HEAD_NOT_VERIFIED**; tree/blob IDs dan empat file pada GitHub belum diverifikasi.

## Diagnosis per lapisan

| Dugaan | Hasil pemeriksaan kontrak dan batas bukti |
| --- | --- |
| Cache discovery GitHub | `authFetch`, `githubRequest` dan respons Auth memakai `no-store`. Endpoint discovery mengenumerasi ulang dengan pagination 100/page. Receipt terbaru sudah mengandung target; stale discovery bukan blocker pada observasi itu. Refresh dashboard hanya membaca pilihan tersimpan, bukan menambah repository baru |
| Discovery | **LOLOS pada receipt owner**. `GET /api/onboarding/repositories` memakai installation yang tersimpan pada profile, memverifikasi membership user, lalu mengiris daftar App dan user berdasarkan numeric repository ID. Hasilnya hanya metadata repository |
| OAuth vs App installation | Dua pemeriksaan dalam Auth existing yang sama: user authorization dan App installation. Ini bukan alasan membuat OAuth/App baru. Target dalam hasil irisan berarti kedua sisi discovery sudah memasukkannya. Profile tetap menunjuk satu installation; tidak ada auto-switch ke installation akun lain |
| Izin private repository | **LOLOS pada discovery**: `private:true` diteruskan apa adanya, tidak difilter. Discovery meminta Metadata/Contents read. Bukti ini bukan bukti izin PR write/admin, yang masih harus diperiksa pada tahap terpisah |
| Filter daftar proyek | Dashboard membaca `GET /api/onboarding` lalu `profile.repositories`, yaitu **pilihan yang sudah disimpan**. `dashboardAccount` hanya memvalidasi id/fullName dan deduplikasi; `RepositoryProjects` menampilkan semuanya, termasuk private. Tidak ada filter branch, vulnerability atau hasil scan untuk masuk daftar. Daftar connected repositories muncul pada directory projects (`hub=false`), bukan panel demo project |
| Pemilihan setelah onboarding selesai | **Celah UI terkonfirmasi dari kode**: Connect repository menuju `/onboarding`, tetapi `Onboarding` mengalihkan `step=complete` langsung ke `/app`. Tombol Refresh repositories tidak terjangkau lewat jalur tersebut bagi akun selesai. `/account` juga tidak menyediakan editor pilihan. Backend sudah mendukung perubahan pilihan untuk profile completed dengan verifikasi grants |

Kontrak paling relevan: [onboarding GET/POST](../src/app/api/onboarding/route.ts), [discovery GET](../src/app/api/onboarding/repositories/route.ts), [GitHub intersection](../src/lib/auth/github.ts), [redirect UI](../src/components/auth/onboarding.tsx), [dashboard loader](../src/components/dashboard-account.tsx), [project list](../src/components/repository-projects.tsx).

GitHub membedakan daftar installation dan daftar repository yang dapat diakses user di dalam installation. User harus memiliki akses repository yang sesuai. Lihat [API installation resmi](https://docs.github.com/en/rest/apps/installations#list-repositories-accessible-to-the-user-access-token). Implementasi WetScan mempertahankan pemeriksaan kedua sisi tersebut; jangan menggantinya dengan enumerasi App saja atau PAT baru.

## Pemeriksaan pilihan tersimpan dan tindakan minimum

Owner kemudian membuka `GET /api/onboarding` pada sesi yang sama dan mengirim hanya `step:complete` dengan satu repository ID, **839286157**. Proyeksi yang dinormalisasi:

```json
{"step":"complete","repositoryIds":[839286157]}
```

**Penyebab terkonfirmasi:** target **1465216209 belum masuk pilihan tersimpan**, meskipun discovery sudah mengembalikannya. Ini menjelaskan daftar proyek yang belum memuat target; celah redirect UI completed-profile menghalangi pemilihan ulang melalui tombol Connect repository. Bukan filter private/default branch atau kegagalan discovery pada receipt tersebut. Tidak perlu mengubah credential untuk menyelesaikan penyimpanan pilihan ini.

Operasi minimum berikutnya adalah **satu perubahan pilihan profile melalui backend existing**, bukan reinstall App, reset onboarding, clear database/cache, logout/login atau perubahan credential. Payload konkret berdasarkan kedua receipt owner:

```text
POST http://localhost:3000/api/onboarding
Content-Type: application/json

{"action":"repositories","repositoryIds":[839286157,1465216209]}
```

Ini **rancangan saja, BELUM DIJALANKAN dan memerlukan persetujuan perubahan pilihan lokal di luar diagnosis read-only ini**. ID lama dipertahankan. Endpoint mengganti seluruh array, jadi jangan mengirim `[1465216209]` saja. Jalankan hanya melalui sesi aplikasi existing, tanpa cookie/token yang disalin. Baca ulang pilihan tepat sebelum submit; jika ada ID tambahan, susun ulang union dan review dahulu, jangan menimpanya dengan payload lama. Server memverifikasi ulang grants. Simpan sekali, lalu cek GET, `completedAt`/step tetap complete, dan directory `/app/projects`; target harus muncul bersama repository lama. Batas existing 100 repository tetap berlaku. Respons UNKNOWN harus diobservasi dahulu lewat GET, bukan diulang otomatis.

Backend completed-profile selection sudah menerima `action:repositories`, menolak ID palsu/ungranted, mempertahankan `completedAt`, dan tidak mengubah workspace melalui aksi lain. Membuka atau me-refresh `/onboarding` saja tidak mengatasi celah UI completed-profile. Tidak ada perubahan UI/Auth yang dilakukan dalam diagnosis ini.

Catatan batas READ ONLY: endpoint discovery membaca metadata dan tidak menyimpan **pilihan repository**, tetapi workflow Auth existing secara internal membuat/mencabut token installation read-only, dapat melakukan refresh user token, dan menyimpan sesi. Agent tidak mengekstrak/mengedit credential atau memanggil alur itu secara langsung. Receipt yang dipakai berasal dari request normal owner melalui aplikasi existing. Jangan menyamakan GET ini dengan operasi tanpa lifecycle Auth sama sekali.

## Branch dan kelanjutan G03

`defaultBranch:main` adalah label metadata repository, bukan branch acceptance. Tidak perlu mengganti default branch agar proyek muncul. Target acceptance tetap **`g03/acceptance-base@6eb920a5573c39105fa0390d464d271fb1c7b5bf`** dan harus diverifikasi pada branch tersebut, bukan pada main. Jangan klik Open Canvas sebagai preflight metadata: jalur Canvas dapat memperoleh source/analyze graph; source acquisition belum diizinkan.

Setelah pemilihan tersedia dan metadata branch/tree/blob diperiksa tanpa isi source, baru susun persetujuan terpisah untuk satu baseline SAST G02. Belum ada finding nyata pada target baru, patch, AI request, draft PR, retest atau bukti durability live. Jangan memakai fixture atau finding repository lain sebagai penggantinya.

## Validasi dan preservasi

Tests existing dijalankan dengan GitHub/Auth doubles dan direktori fixture terisolasi, tanpa dotenv owner: `tests/auth-onboarding.test.ts` **16/16**, `tests/github-existing.test.ts` **31/31**, `tests/dashboard-account.test.ts` **9/9**; total **56/56 PASS**. Meliputi irisan grant, private repository, token tidak masuk respons, pilihan profile completed, penolakan ID palsu, installation discovery dan dashboard projection. Ini bukan bukti live scanner atau PR.

Tidak ada source produk/test, paket baseline, branch Git, state Auth operasional atau database historis yang diubah. Tidak ada scanner/AI/PR/retest dijalankan. Status G03 tetap **PARTIAL**; blocker awal adalah pilihan proyek/UI, sementara HEAD/tree/evidence acceptance masih perlu verifikasi.

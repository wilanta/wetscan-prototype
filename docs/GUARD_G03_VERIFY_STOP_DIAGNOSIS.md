# G03 - diagnosis STOP pada helper verify

**Owner inventory received (20 November 2026):** worktree root ordinal 1 has consistent app/worker/target-only metadata for localhost:5432/wetscan_dev_guardg02, marker f0927e49-0e70-4b90-913f-6cd6984df9d8, expiry 22 November 2026 00:00 WIB. This differs from the old assumed 55434/d9058dd4 binding. No target is selected automatically and authentication is unverified. See [the new exact-target app-role read-only proof proposal](GUARD_G03_EXISTING_TARGET_PROOF.md). It requires NEW approval for one connection/internal app credential use; no helper retry, environment attachment/restart or database mutation is authorized.

**Owner metadata received (20 November 2026):** PowerShell 5.1/Node 24.17; server-only root package missing, LOCALAPPDATA pointer NOT_FOUND, all five Guard references absent, NODE_OPTIONS/NODE_PATH absent. Port status UNAVAILABLE and error signals empty do not prove a database failure. STOP remains in force. See [confirmed findings and the new non-secret inventory proposal](GUARD_G03_ENVIRONMENT_RECOVERY_PLAN.md). The approved presence-only diagnostic is complete; reading existing approval/config JSON is a NEW proposed scope, not yet authorized. No helper retry/install/DB connection/restart.

20 November 2026. **PARTIAL / HALTED / RECOVERY MEMERLUKAN APPROVAL BARU.** Helper tidak dijalankan ulang. Tidak ada restart, koneksi SQL oleh agent, reset/migrasi, instalasi dependency, pembuatan credential atau perubahan database.

## Laporan owner yang tersedia

Owner menjalankan blok reader satu kali dan menerima `G03_EXISTING_TARGET_VERIFY_STOP_NO_RETRY` pada catch pemanggilan `verify`, sebelum pemasangan lima referensi environment dan sebelum `npm.cmd run guard:dev`. Tidak ada raw stdout/stderr, native exit code atau hasil JSON helper yang tersedia dari run tersebut. Agent tidak mengambil log/konten credential atau `.env` untuk menggantikannya.

Blok lama dipertahankan utuh: SHA256 `efc309993c39c938dc255a3d66cff607e4d3f8d6646d3869fa73425b0f2d77d2`, sama dengan receipt approval. **Jangan menjalankan ulang blok tersebut.** Approval sebelumnya tidak dipakai untuk recovery otomatis setelah STOP terbaru.

## Temuan yang dapat dibuktikan

| Temuan | Bukti / batas kepastian |
| --- | --- |
| Dependency CLI `server-only` tidak ter-resolve | Pada konteks agent/worktree ini, `createRequire` dari exact importing file `src/features/guard/live/product-preflight.ts` menghasilkan **MODULE_NOT_FOUND**, termasuk dengan `--conditions=react-server`. Tidak ada root package, deklarasi dependencies/devDependencies atau lock entry `node_modules/server-only`. Tidak mengimpor/mengeksekusi helper |
| Rantai import nyata | `guard-g02-local-env.ts` mengimpor `assertPrivateRuntimeRoot` dari `product-preflight.ts`, yang mengimpor `server-only`. Kegagalan import dapat terjadi **sebelum `main().catch()`**. `react-server` memilih conditional export package yang ada, bukan memasang dependency yang hilang |
| Mengapa website/tests dapat lulus | Next memiliki alias internal `server-only` ke `next/dist/compiled/server-only/...`; Node CLI standalone tidak otomatis mendapat alias compiler. Tes terkait memock `server-only`. Hasil unit/build sebelumnya tidak membuktikan CLI ini dapat startup pada instalasi owner |
| Pointer G02 tidak ditemukan | `Get-Item` metadata-only pada `%LOCALAPPDATA%/WetScanGuardG02/current.json` menghasilkan **ObjectNotFound / ItemNotFoundException** dalam konteks agent. Isi pointer/credential tidak dibaca. Ini belum membuktikan lokasi/profile/environment terminal owner sama |
| Port dan container | Tidak ada listener 55434 yang teramati lewat metadata probe agent. Docker inspect metadata tidak tersedia, sehingga **ketiadaan container/database tidak terbukti**. Tidak ada port-connect/SQL yang dilakukan agent |
| Runtime dependency lain | Agent menggunakan Node **v24.17.0**; `tsx` 4.23.15, `pg` 8.23.1, Next/@next/env 16.4.6 hadir dan dapat di-resolve. Node memenuhi engine ranges yang tertera. Perbedaan dari record G02 Node 22.20 bukan bukti incompatibility; versi/PATH owner belum diamati |
| Root cause run owner | **BELUM PASTI.** Missing dependency adalah blocker startup konkret pada konteks yang diperiksa; missing pointer adalah blocker berikutnya bila konteks sama dan import berhasil. Tanpa exit/stderr/JSON asli atau metadata owner, jangan menetapkan salah satunya sebagai penyebab final run owner |

Sumber lokal: `scripts/guard-g02-local-env.ts` (imports, pointer, verify, main catch), `src/features/guard/live/product-preflight.ts` (server-only/ACL), `node_modules/next/dist/build/create-compiler-aliases.js` (alias internal), `tests/guard/live/local-env.test.ts` dan `host-wiring.test.ts` (mock boundary). Resolver hanya memakai built-in `node:module`; tidak ada application/helper import, bootstrap read atau database connection.

## Error handling yang menghilangkan diagnosis

Wrapper agent mempunyai tiga lapisan:

1. Native Node dipanggil dengan `2>$null` dan `$ErrorActionPreference='Stop'`. Stderr hilang dari output. Pada Windows PowerShell 5.1, penulisan stderr dapat menjadi `NativeCommandError` yang memicu catch, bahkan ketika exit code proses sebenarnya 0.
2. Native nonzero exit diubah menjadi `G03_EXISTING_HELPER_STOP_NO_RETRY` **sebelum** stdout JSON diinterpretasi. Helper yang sudah menghasilkan `{error:...}` lewat stdout tetap kehilangan kode diagnosis itu.
3. Catch luar membungkus command failure, stderr exception, nonzero exit dan `ConvertFrom-Json` failure menjadi pesan sama: `G03_EXISTING_TARGET_VERIFY_STOP_NO_RETRY`.

Ini dibuktikan dengan **empat proses Node sintetis**, bukan helper: JSON valid/exit 0 berhasil; JSON error/exit 1, stderr-only/exit 0, dan JSON malformed/exit 0 semuanya berujung surface STOP generik yang sama. Uji berada di PowerShell agent **5.1.26100.7705**; versi/semantik owner masih perlu metadata. Tidak ada helper/DB pada uji ini.

`G03_EXISTING_TARGET_MISMATCH_STOP` di guard setelah parsing adalah pesan **berbeda**, dan tidak dilaporkan owner. Karena itu belum ada bukti guard perbandingan port/marker akhir tercapai atau gagal. Error STOP juga tidak membuktikan helper sama sekali belum sempat melakukan read-only DB connection: warning native dapat mengaburkan proses yang sebenarnya terus berjalan. Agent tidak mengklaim phase SQL dari run owner.

**Koreksi tanggung jawab:** wrapper yang saya siapkan terlalu menyamarkan penyebab dan saya belum memeriksa prasyarat dependency/pointer sebelum meminta penghentian server. Pemeriksaan AST sebelumnya hanya membuktikan sintaks. Blok lama tidak diedit agar evidence run tetap dapat dicocokkan; prosedur diagnosis terpisah disiapkan.

## Kontrak environment helper yang sebenarnya

Urutan `verify()`:

1. Baca pointer **dari process LOCALAPPDATA**, bukan dari `GUARD_DB_*`/dotenv website. Fallback HOME hanya dipakai bila LOCALAPPDATA tidak ada. Pointer memuat root/target/port.
2. Hitung migration plan dari file source lokal; periksa ACL dan realpath private root menggunakan SystemRoot/whoami/PowerShell. Salah root, ACL, user atau OS metadata dapat menggagalkan fase ini.
3. Baca dan validasi **tiga** approval JSON: app, worker **dan migration**, terikat role, target, plan dan expiry. Reader website sebenarnya hanya memerlukan app role; helper administrasi ini mensyaratkan instalasi G02 lengkap.
4. Baca **bootstrap.password existing** secara internal untuk koneksi `postgres`, bukan memakai `GUARD_DB_APP_PASSWORD_FILE` atau worker password. Menambah empat env reference website tidak memperbaiki pointer/bootstrap yang tidak ada.
5. Koneksi ke host/database/port dari pointer, lalu BEGIN READ ONLY, SELECT metadata owner/marker/schema/RLS/grants/counts, ROLLBACK; tidak menjalankan migrasi/reset/DDL. Connection refused, auth rejection, missing database/schema dan query errors masih dapat menghasilkan catch generik di wrapper.
6. Helper menilai hasil; outer wrapper baru mencocokkan target yang diharapkan. Native `main().catch()` menulis JSON `{error: message.slice(0,80)}` ke stdout dan exit 1; startup/import failure di luar main hanya dapat muncul di stderr.

`NODE_OPTIONS` dan `NODE_PATH` diwariskan dari terminal owner. Preload skip-dotenv mencegah Next loadEnvConfig membaca dotenv; ia tidak menghapus preload/alias/runtime flags yang sudah diwariskan. Jangan membaca/menampilkan nilai raw variabel itu atau mengubahnya sebagai tebakan recovery.

Binding yang pernah didokumentasikan G02 adalah loopback:55434 / `wetscan_dev_guardg02` / marker `wetscan-s01:d9058dd4-2823-4582-9721-4a1a56557664`. Itu **evidence historis lingkungan G02**, bukan bukti instalasi tersedia dalam profile mesin owner sekarang. Marker/database/port aktual belum diverifikasi lewat SQL atau isi pointer. Jangan memindahkan ke 5432, 55432/Sentinel, root lama `.local`, atau marker lain agar check lolos.

## Proposal recovery owner-operated, approval baru dahulu

**Langkah berikut yang konkret hanya diagnosis metadata owner**, file `.local/g03-owner-selection/diagnose-stop-readonly.ps1`. Belum dijalankan. AST parse: 0 error. Setelah approval baru, owner meninjau dan menempelkan blok di console existing, bukan memakai ExecutionPolicy Bypass.

Blok tersebut tidak memanggil Node/helper sama sekali, tidak membaca isi pointer/password/approval/dotenv, dan tidak mengubah environment atau file. Ia mengeluarkan hanya:

- versi PowerShell dan metadata executable Node dari PATH (tanpa mencetak path);
- presence boolean variabel runtime, tanpa nilai;
- metadata package dependency root/versi;
- status keberadaan pointer dan listener port 55434, tanpa koneksi SQL;
- kategori tetap dari maksimal 12 error record owner-local, tanpa pesan/stack/stdout/stderr raw. Kategori ini adalah hints yang tidak otomatis membuktikan asal error tersebut.

Ini menghindari pengulangan `verify`, `env`, restart, install, reset atau koneksi database. Jika tidak ada sinyal tersisa dari run lama, laporkan UNKNOWN; jangan mencoba menciptakan ulang error.

Setelah metadata owner tersedia, susun satu recovery konkret berdasarkan hasilnya untuk approval berikutnya:

- Bila dependency benar-benar hilang: review perbaikan dependency/lockfile atau isolasi dependency CLI yang tepat dengan Will. **Jangan** memasang paket otomatis, menghapus guard, memock/stub `server-only`, atau memakai alias dadakan untuk memaksa helper lolos.
- Bila pointer/instalasi G02 tidak tersedia: identifikasi lingkungan existing yang benar dengan owner. Jangan membuat pointer palsu, merekonstruksi approval/password, menggunakan target historis lain atau melakukan provision/reset baru di bawah izin read-only.
- Jika prasyarat sudah terbukti lengkap dan exact target disetujui: usulkan satu verifier attempt yang **diinstrumentasi aman** dengan stdout/stderr ditangkap terpisah, stage/exit code/fixed error classification dipertahankan dan raw data tetap lokal. Ini tetap memerlukan approval baru; tidak otomatis attach/restart setelahnya.

Jangan sekadar menghapus `2>$null` lalu mengirim raw error ke chat: helper/native errors dapat memuat private paths, usernames atau connection metadata. Jangan menjalankan ulang blok reader lama. Approval reader sebelumnya dicatat sebagai **STOPPED_OWNER_EXECUTION / REAPPROVAL_REQUIRED**, bukan izin retry.

Status G03 tetap **PARTIAL**. Profile selection berhasil, tetapi reader runtime belum terpasang/terverifikasi; HEAD/tree, finding SAST, AI nyata, PR dan retest belum terbukti. Kode produk G03/G02/Auth/Sentinel, credential dan database historis tidak diubah selama diagnosis ini.

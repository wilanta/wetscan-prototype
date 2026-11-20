# G03 - reader website terverifikasi, prasyarat scanner berikutnya

**Current owner receipt (20 November 2026): one approved metadata POST completed, HTTP 200; TARGET_VERIFIED, app READONLY_TARGET_ROLE_SCHEMA_RLS_VERIFIED; policy NOT_VERIFIED, sandbox not ready, worker references missing. runtimeOperations=0. Do not repeat POST. Binding remains only in owner browser memory. No source/scan/AI/GitHub write/retest occurred. See [the current scanner setup prerequisites and non-secret inventory proposal](GUARD_G03_SCANNER_SETUP_NEXT.md). Inventory requires new approval and is NOT_EXECUTED. G03 remains PARTIAL.**


20 November 2026. **WEBSITE_READER_VERIFIED / SCANNER_DISABLED / G03 PARTIAL.** Semua pernyataan aktual di sini berasal dari receipt owner; agent tidak mengambil cookie/credential, menghubungkan DB atau mengirim request website.

## Hasil aktual yang selesai

- Owner memasang **3 app-reader references** untuk exact target `localhost:5432/wetscan_dev_guardg02`, marker `wetscan-s01:f0927e49-0e70-4b90-913f-6cd6984df9d8`; tidak memasang worker references, membuat file, atau mengubah DB pada blok attachment.
- Website menerima session existing; kedua project IDs **839286157** dan **1465216209** tetap terpilih; target acceptance Private.
- GET onboarding, Guard readiness, dan scan history project baru semuanya **200**. Database **approved**, schema **verified**.
- History yang tersedia kosong dan tidak terpotong oleh batas halaman. Ini berarti tidak ada retained scan record yang dikembalikan pada scope tersebut, **bukan bukti tidak ada vulnerability**.
- Scanner tetap BLOCKED, queue unverified, worker not_configured, allowedEngines kosong, scanAccepted false. Ini hasil yang benar untuk target-only reader, bukan reader gagal.

Owner juga memeriksa baris branch GitHub dan melaporkan current SHA **6eb920a5573c39105fa0390d464d271fb1c7b5bf** untuk `inkAja/wetscan-g03-acceptance`, branch **g03/acceptance-base**. SHA 40 karakter tersebut **identik** dengan baseline yang ditetapkan. Klasifikasi **OWNER_OBSERVED_BRANCH_METADATA_MATCH**; belum merupakan request provider independen dari agent. Tree/blob/source belum diperoleh atau diverifikasi. Tidak membuka commit/diff untuk pencocokan ini. Baseline tetap berbeda dari default branch `main`.

## Scope yang belum siap

Worker-role authentication, policy workspace/project/branch SAST-only dan qualification sandbox segar belum dibuktikan. Tidak ada finding SAST nyata pada project baru untuk AI. Reader PASS tidak mengaktifkan queue/scanner atau memberi izin menulis scan/proposal/retest/report. Tidak perlu mengulang perbaikan profile, inventory, proof app-role atau attachment yang sudah berhasil.

## Proposal metadata runtime berikutnya - approval POST read-only baru

Kontrak existing pada `src/features/guard/live/http.ts` menyediakan:

```text
POST /api/guard/projects/github-1465216209/preflight
Content-Type: application/json

{}
```

Ini bukan `POST /scans`. Handler hanya menjalankan authorizer existing dan `probeProductReadiness`, tidak memanggil admission/create/enqueue/worker/source acquisition. Ia mengembalikan authoritative scope binding yang diperlukan untuk membuat policy yang benar. Tidak menebak workspace dari nama repository atau memakai workspace G02 Will.

File owner-operated siap review: `.local/g03-owner-selection/runtime-binding-preflight.js`. **BELUM DIJALANKAN / MEMERLUKAN APPROVAL BARU** karena izin website sebelumnya hanya GET.

Setelah approval, owner menjalankan sekali pada session localhost existing. Maksimal satu POST, body kosong, timeout 90 detik, no redirect/no retry. Source/Canvas/revision/scans/triage/report/cancel tidak dipanggil. Binding repository/project/actor/workspace dan runtimeOperations=0 divalidasi sebelum dipakai. Error/status hanya fixed projection. UNKNOWN tidak diulang, termasuk setelah refresh.

### Data dan credential boundary

- Hanya enum readiness, presence booleans dan safe error categories dicetak untuk dikirim ke agent; tidak ada nama workspace, actor ID, email, private path, cookie/token/header, raw exception atau unknown fields.
- Exact workspace/actor binding hanya disimpan sementara pada **memory owner browser** sebagai `globalThis.__wetscanG03OwnerRuntimeBinding`. Jangan kirim object itu ke chat, jangan simpan di localStorage/cookie, dan jangan memakainya untuk mengaktifkan policy tanpa approval tahap berikutnya.
- Endpoint memeriksa app database dan **dapat memeriksa worker database jika refs worker sudah ada pada server**. Existing loaders membatasi purpose/role/target/plan dan metadata DB verification memakai BEGIN READ ONLY/ROLLBACK. Tidak memasang worker refs, membuat/reset password, menjalankan worker atau melakukan data mutation. Scope ini perlu dicakup oleh persetujuan metadata POST; jangan mengasumsikan absence worker ref pada parent selalu sama dengan environment website setelah normal startup.
- Target database tidak diekspor oleh endpoint tersebut. Continuity exact target bersandar pada app-role proof dan attachment yang sudah direview; jangan membuat field target baru seolah-olah respons mengonfirmasinya.
- Auth/provider calls hanya normal current-user/App authorization metadata dan lifecycle session existing. Tidak ada Auth/App kedua atau repository write.

Expected pada target-only sekarang: configuration TARGET_VERIFIED, app DB READONLY_TARGET_ROLE_SCHEMA_RLS_VERIFIED, policy NOT_VERIFIED, sandbox CONFIGURATION_QUALIFICATION_OR_IMAGE_NOT_READY, worker reference missing bila memang tidak ada. Itu tetap metadata, bukan otorisasi scan. Unknown/null field tidak dianggap siap. Jika endpoint mengembalikan error, simpan projection dan STOP.

## Rencana sesudah scope metadata tersedia

1. Buat proposal runtime **SAST-only** untuk exact project `github-1465216209`, workspace dari authorizer, branch `g03/acceptance-base`, maxAttempts=1 dan baseline pin yang sama. Jangan mengubah policy project Will/wdu.
2. Inventory/physical metadata scanner image/rules/config existing, lalu minta izin qualification segar bila diperlukan. Qualification controlled source memakai resource baru/owned dan bukan scan repository owner. Tidak memakai timestamp/qualification expired sebagai bukti.
3. Cocokkan approval qualification dengan tindakan tool yang sebenarnya: `qualify.ts --full` existing mengukur beberapa CLI, bukan SAST saja. Jangan menjalankannya di bawah izin yang menyebut SAST-only qualification; scope harus direview tepat. CLI config G02 default juga memilih beberapa engines, jadi jangan otomatis memakainya untuk policy SAST-only.
4. Metadata tree/blob baseline harus cocok dengan manifest empat file sebelum pembacaan source yang terotorisasi. Existing helper revision memakai REST commits/compare yang dapat membawa diff, sehingga **tidak dipanggil dalam scope metadata-only** ini.
5. Setelah prasyarat nyata siap, ajukan **satu baseline G02 SAST** dengan source acquisition hanya file yang disetujui pada pinned commit. Itu izin baru untuk source/scan dan append-only scan evidence pada target DB yang tepat; bukan perpanjangan otomatis dari reader approval.

AI berbayar, context consent, patch review, draft PR, behavioral execution, retest dan persistence/UI chain tetap tahap terpisah. Jangan menggunakan fixture/manual fixed variant sebagai respons AI atau finding live.

## Validasi dan status

Collector metadata baru: **10/10 offline transport-double checks PASS** (single correct POST/body, origin/cancel, Auth, repository/scope mismatch, runtime operations, HTTP/network/JSON failure, private projection, no retry). Tidak ada request owner dikirim agent atau worker credential dibaca agent. Kode produk/package/lockfile dan ZIP baseline tetap utuh.

App-role SQL proof dan website reader sekarang mempunyai receipt nyata owner. Full G03 AI/proposal/PR/retest/report durability belum dibuktikan. **G03 tetap PARTIAL.**

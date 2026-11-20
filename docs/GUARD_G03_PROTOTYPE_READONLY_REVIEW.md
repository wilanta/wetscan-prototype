# SUPERSEDED - prototype target cancelled

The owner cancelled prototype targeting and restored manual setup of the separate Private wetscan-g03-acceptance repository. Do not run the prototype collector or follow its pending owner step. Preserve this review as history only. Current procedure: [owner target design](GUARD_G03_OWNER_TARGET_DESIGN.md). No finding was selected or live action performed.

---

# G03 — pemeriksaan read-only wilanta/wetscan-prototype

20 November 2026, Asia/Jakarta. **PARTIAL — finding target belum dapat diverifikasi.**

Keputusan owner terbaru menetapkan `wilanta/wetscan-prototype` untuk pemeriksaan Live Acceptance. Rencana repository uji baru **ditangguhkan**, bukan dijalankan. Paket dan evidence rencana sebelumnya tetap disimpan. Instruksi ini mengizinkan pemeriksaan read-only, bukan scan baru, pengiriman konteks ke AI atau perubahan GitHub.

## Hasil yang benar-benar tersedia

| Pemeriksaan | Hasil / batas bukti |
| --- | --- |
| Worktree implementasi | Existing worktree, branch `feat/guard-g03-ai-remediation`, HEAD `5e52ac2d9df641eebef5cb4818c4efb7887c0c5c`; perubahan G03 tetap uncommitted |
| Remote default target yang diperiksa | `git ls-remote origin refs/heads/master` mengembalikan SHA yang sama; ini metadata ref, bukan source acquisition atau bukti finding |
| Metadata GitHub anonim | API metadata mengembalikan HTTP 404; repository private/tidak terakses anonim masih mungkin. Bukan bukti repository tidak ada |
| Sesi aplikasi existing | URL owner sebelumnya adalah project `github-839286157`. Receipt owner mengidentifikasinya sebagai **inkAja/wdu**, scan belum dimuat, storage UNAVAILABLE. Jangan menggunakannya sebagai project prototype |
| Evidence G02 yang terdokumentasi | Receipt lama `inkAja/wdu`: commit `41861b14dbb3f329fe3b20aed59a008390ef0e2b`, 0 findings. Acceptance G02 terbaru: **wilanta/wetscan-g02-acceptance**, 34/0 findings, bukan prototype. Keduanya bukan kandidat campaign ini |
| Finding SAST prototype | **UNAVAILABLE TO REVIEW**: belum ada scan ID, finding ID, rule, severity, evidence digest, lokasi atau commit yang bisa diikat ke prototype dari data yang tersedia |
| Relevansi finding terhadap HEAD | **NOT_VERIFIED**; HEAD diketahui tetapi finding/source tuple belum ada. Jangan menggunakan vulnerable ancestor atau finding dari repo lain |
| Kandidat terpilih / behavioral tests | **NOT_SELECTED / NOT_ASSESSED**. Tidak ada klaim bahwa repository tidak memiliki findings, atau bahwa findings existing invalid |

Agent tidak dapat mengakses sesi browser owner: browser host tidak tersedia. Request tanpa sesi tidak memberi akses hasil Guard. Tidak ada pembacaan cookie/token atau file Auth privat sebagai jalan pintas. Pemeriksaan ini tidak membaca `.env`, memulai scan, memanggil provider atau menulis GitHub.

## Satu tindakan owner untuk melanjutkan

Buka WetScan pada **http://localhost:3000** dengan sesi login existing. Jalankan seluruh isi [collector read-only](../scripts/guard-g03-prototype-readonly.js) sebagai browser DevTools **Sources → Snippets**, kemudian kirim file unduhan **`guard-g03-prototype-readonly.json`**. Jangan kirim credential, isi `.env`, screenshot sesi atau raw API response. Jangan menonaktifkan proteksi browser/paste warning untuk melakukannya.

Collector ini sudah diuji offline dengan transport double; **belum dijalankan pada sesi owner**. Ia:

- Menentukan project dari exact nama `wilanta/wetscan-prototype` pada pilihan repository existing; berhenti jika tidak dipilih/ambigu. Tidak mengubah pemilihan repository.
- Menggunakan paling banyak **8 GET** same-origin: onboarding public projection, readiness, maksimal dua halaman history (100 records), lalu maksimal empat scan terminal. Setiap request timeout 30 detik, tanpa retry atau redirect.
- Memprioritaskan scan pada HEAD persiapan di atas, lalu tanggal terbaru. History/view yang dibatasi tidak membuktikan ketiadaan vulnerability.
- Mengunduh hanya metadata scan/SAST, rule/severity/lokasi dan digest/provenance/coverage; menghilangkan title, evidence summary, source snippet, account details dan unknown fields. Raw error tidak diekspor.
- Tidak membaca source/blob, tidak menjalankan scan/provider, tidak melakukan POST, GitHub write, login/reset atau pengambilan cookie.

Jika status `TARGET_NOT_SELECTED_OR_AMBIGUOUS`, cukup kirim JSON tersebut dahulu; jangan menambah akses App atau mengganti pilihan repository secara otomatis. Jika `SCAN_HISTORY_UNAVAILABLE`, HTTP/status error yang tetap aman membantu membedakan readiness/Auth/storage. Jangan reset database, memulai scanner, mengaktifkan runtime atau memakai approval G02 lama untuk mengatasi kegagalan baca. Data private yang tidak tersedia bukan alasan menyimpulkan tidak ada findings.

## Gerbang pemilihan satu finding

Setelah metadata tersedia, verifikasi exact project/repository ID dan scope server; execution `repository_scan`; run SAST `completed`; finding bukan sintetis/false-positive/risk-accepted; seluruh evidence terikat commit dan artifact run; scanner/version/rule pack cocok; image/spec/installation digest valid dan cleanup `VERIFIED`. Catat coverage dan keterbatasan. Truncation atau run ambigu membutuhkan observasi read-only tambahan, bukan approval otomatis.

Finding harus pada branch yang ditentukan owner dan commit yang sama dengan HEAD saat ini. Bila commit berbeda, **belum eligible**: jangan mengklaim masih relevan berdasarkan nomor baris atau ancestry saja. Setelah izin source terbatas, bandingkan file Git blob dan source SHA256 pada commit finding dan current HEAD; bila tidak dapat dibuktikan, hentikan pemilihan dan laporkan kebutuhan baseline baru secara terpisah. Jangan menjalankannya sekarang.

Prioritaskan satu regular JS/TS/JSX/TSX/JSON file ≤24 KB, satu edit unik dekat lokasi finding, maksimal 3.000 karakter/40 baris per sisi. Baca hanya file finding dan test terkait pada pinned revision setelah scope disetujui; jangan upload seluruh repository. Evaluasi test yang sudah ada dari revision itu sebelum mengeksekusinya. Hindari Auth/authorization, billing, scanner sandbox/worker, Sentinel, G01/N01, migrasi, `.env`, workflow, package script/lockfile dan fondasi shared G02 Will. Jika hanya kandidat berisiko tinggi/unsupported tersedia, tidak ada kandidat aman untuk campaign kecil ini.

## Rancangan branch dan Draft PR — belum dibuat

| Item | Rancangan |
| --- | --- |
| Repository | `wilanta/wetscan-prototype`; numeric repository/project ID masih perlu dibaca dari sesi existing |
| Base | Usulan `master`; SHA persiapan `5e52ac2…`, wajib verifikasi ulang saat review/write. Tidak ada push ke master |
| Head terpisah | `wetscan/g03-<32 karakter awal proposal ID aktual>`; dibuat hanya oleh workflow G03 setelah review dan izin write, bukan checkout dirty worktree implementasi |
| Judul | `fix: remediate <rule aktual> in <path aktual>` — placeholder sampai finding/proposal tersedia |
| Body | Finding/scan/evidence ID; before commit/blob/SHA256; model/prompt/policy/consent; diff digest; risiko; actual test results; after commit dan rencana retest; batas proof scanner |
| State | **Draft**, satu PR maksimum, tanpa auto-merge/force-push/default-branch write/deploy |
| Status saat ini | Branch, patch, proposal, consent dan PR **NOT_CREATED / NOT_APPROVED** |

Sebelum write: current personal owner admin/push dan izin existing App Contents/Pull requests write harus diverifikasi; jangan menambah Auth/App. Pastikan G02 admission mengizinkan exact head untuk retest tanpa mengendurkan policy. Jika izin, policy atau evidence tidak cocok, stop sebelum write. Respons UNKNOWN hanya diobservasi read-only, tidak diulang.

## Risiko operasional dan batas tahap berikutnya

Perubahan kecil pada repository aplikasi WetScan dapat mengubah parsing/validasi input, status HTTP, error handling dan kompatibilitas UI; jumlah baris bukan ukuran keamanan. Patch Auth/sandbox/data migration dapat memengaruhi isolasi atau akses data dan tidak cocok sebagai kandidat pertama. File shared Live UI/G02 berisiko konflik dengan Will; perubahan G03 uncommitted lokal juga bukan source master yang boleh dijadikan patch live. Diff harus berasal dari immutable GitHub base/blob, lalu diperiksa terhadap pekerjaan Will yang berjalan sebelum PR ditulis.

Tanpa kandidat dan source/test yang cocok, risiko patch spesifik **belum dinilai**. Pengurangan risiko: satu file/function, kontrak input/output dipertahankan, tests positif/negatif existing pada pinned revision, syntax/diff validation, human review, draft PR tanpa merge/deploy. Scanner absence hanya membuktikan rule/target tersebut dalam cakupan scanner, bukan tidak adanya exploit atau keamanan operasional keseluruhan.

Tahap berikut tetap terpisah: **(1)** metadata valid → izin baca exact finding file dan test terkait; **(2)** review konteks teredaksi → consent satu AI request server-side ≤US$0,10; **(3)** review actual diff/digest dan behavioral implications → izin satu draft PR; **(4)** exact after-commit → izin satu retest scanner G02 serta tests yang direview; **(5)** verifikasi PostgreSQL/UI/report/audit dan restart lokal yang disetujui. Belum ada izin untuk tahap-tahap itu.

Jika hasil existing akhirnya terbukti stale/tidak lengkap, alternatif pertama adalah meminta izin satu baseline SAST pada exact HEAD repository ini. Jika kandidat valid tetapi tidak aman/unsupported, pilih finding existing lain hanya setelah evaluasi read-only. Repository uji terpisah tetap opsi tersimpan yang **ditangguhkan** dan hanya diaktifkan lagi atas instruksi owner.

## Validasi lokal dan preservasi

Checkpoint sebelum penyesuaian dokumen: `.local/g03-prototype-readonly-checkpoint-yDlfL8`, salinan byte-verified **125 file**. Seluruh **123** hash nonrekursif cocok dengan manifest sebelumnya; dua indeks tercantum dalam `recursiveHashExclusions`. Evidence historis tidak diregenerasi.

G03 targeted unit/integration terbaru **194/194 PASS** (termasuk 10 test collector: GET-only, pemilihan target, projection field privat, binding, origin, Auth/storage/parse/network failure, truncation/request budget). Typecheck **PASS**, lint **PASS** dengan dua warning unused-variable existing pada fixture G02, dan `git diff --check` **PASS**. Ini bukti offline, bukan finding/AI/PR/retest live. Hasil PG isolated, scanner fixture, browser/build/smoke dan full regression sebelumnya tetap historis sebagaimana [validation](GUARD_G03_VALIDATION.md); tidak diklaim diulang untuk perubahan dokumen/collector ini. Tidak ada perubahan runtime produk pada pemeriksaan ini.

Status G03 tetap **PARTIAL**: jalur real AI, PR dan scanner retest repository asli belum terbukti. Blocker pembacaan saat ini ialah akses metadata target melalui sesi existing; belum ada bukti yang cukup untuk menilai finding invalid atau menyatakan COMPLETE.

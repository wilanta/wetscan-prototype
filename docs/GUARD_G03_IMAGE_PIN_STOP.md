# Owner diagnostic received - 21 November 2026

[Owner-operated diagnostic receipt](acceptance/guard-g03/20261121-checkpoint/owner-image-pin-diagnostic.json): legacy template exited 1 with `TEMPLATE_OPTIONAL_VOLUMES_FIELD`; compatible template exited 0, pin/Linux/user matched, and volumes normalized to none. This confirms the current Docker optional-field compatibility issue. It does not prove recovery, copied metadata or qualification. Zero containers were created.

Recovery V1/V2, setup, qualification and scans must **not** be repeated under the current commit/push approval. The missing installation manifest and incomplete qualification remain live-readiness blockers. Preserve the stopped run and Will's installation. Historical diagnosis/proposals below do not grant execution authority.

---

# G03 — IMAGE_PIN_STOP sebelum create; kompatibilitas Docker 29

20 November 2026, Asia/Jakarta. **RECOVERY_STOP_BEFORE_CONTAINER_CREATE / G03 PARTIAL.** Receipt: [received-owner-recovery-stop.json](acceptance/guard-g03/20261120-image-pin-stop/received-owner-recovery-stop.json). Jangan mengulang recovery V1, qualification, setup, export, proof atau inventory.

## Bukti aktual dan batas diagnosis

Operation `93cfd652-307c-43dc-bb10-3cd45f0987d9` selesai dengan Node exit 1, `IMAGE_PIN_STOP`, `outcomeUnknown:false`. `containerCreateAttempts:0`: tidak ada container dibuat oleh attempt ini, tidak ada copy metadata, sidecar atau qualification. `cleanupVerified:false` bukan kegagalan container cleanup; cleanup belum berlaku karena create tidak dicoba dan `cleanupFailure:false`.

Alur V1 menyiapkan root Temp baru ber-ACL dan empty Docker config sebelum image gate, lalu mengisi operation ID/private references. Karena itu artifact lokal awal sudah dapat ada; jangan mengklaim nol file/directory mutation global. Tidak ada original installation change, DB/source repository/AI/GitHub write atau website restart. Root/private references dipertahankan untuk observasi, tanpa cleanup manual.

`imageId:null` pada receipt tidak membuktikan image hilang: V1 baru mengisi field itu setelah sukses menulis sidecar. `IMAGE_PIN_STOP` menyatukan nonzero Docker exit, invalid/empty JSON, Id/Os/User mismatch dan Volumes check failure. Driver V1 menghitung lalu membuang stderr Docker; `stderrPresent:false` pada wrapper hanya menggambarkan stderr **child Node**, bukan stderr CLI Docker. Raw penyebab attempt pertama tidak bisa dipulihkan dari receipt ini.

## Bug konkret pada helper dan hipotesis attempt owner

Dokumentasi resmi menyatakan Docker 29/API v1.52 menghilangkan field image Config yang tidak diset/kosong, termasuk `Volumes`; consumer harus memperlakukan field tersebut sebagai nilai default/empty. [Engine API version history](https://docs.docker.com/reference/api/engine/version-history/), [Docker deprecated fields](https://docs.docker.com/engine/deprecated/).

V1 memakai template:

```text
"Volumes":{{json .Config.Volumes}}
```

Akses ini menganggap optional key selalu tersedia. Inspector Docker CLI dapat beralih dari typed response ke raw JSON map dan memakai `missingkey=error`; pada kondisi key tidak ada, template dapat gagal sebelum parser/gate melihat JSON yang valid. [Inspector implementation v29.7.2](https://github.com/docker/cli/blob/v29.7.2/cli/command/inspect/inspector.go).

Itu **bug kompatibilitas helper G03 operator**, bukan alasan menyalahkan Windows/Sentinel atau mengganti image. Owner sebelumnya membuktikan daemon Linux 29.7.2 dan image/User sesuai, sehingga kondisi ini relevan. Versi daemon bukan proof versi CLI; exact branch/error attempt owner tetap **belum dikonfirmasi** karena exit/stderr Docker V1 tidak diekspor.

Perbaikan source terpisah menggunakan lookup map untuk optional fields:

```text
"User":{{json (index .Config "User")}},"Volumes":{{json (index .Config "Volumes")}}
```

Builtin `index` pada map mengembalikan zero value saat key tidak ada, sehingga `json` dapat mengeluarkan null yang eksplisit. [Go template index implementation](https://go.dev/src/text/template/funcs.go).

Perbaikan tidak menghapus volume security gate: output harus JSON valid, explicit normalized Volumes null/empty map, exact image ID/Linux/user. Non-empty declarations, missing projection fields, wrong identity atau malformed shape tetap ditolak. Tidak menurunkan API version, mengubah sandbox atau menyuplai Id/User default yang tidak diamati.

## Satu diagnostic READ ONLY pada image yang sama

Review `.local/g03-owner-selection/diagnose-image-pin.ps1`. Ini observasi metadata image yang sudah diotorisasi, **bukan recovery retry**. Root/image/permission target tetap sama; tidak memakai jatah recovery lama untuk create/copy lagi.

Tinjau lalu paste seluruh block sekali pada console terpisah yang menghasilkan IMAGE_PIN_STOP. Ia membutuhkan `$g03RecoveryResult`, `$g03RecoveredTrivyReferences` dan `$g03SetupDocker` dari attempt tersebut. Exact stopped operation dan zero-create/known outcome dicek. Jika state hilang, path/ACL berubah atau Docker config directory tidak kosong, STOP tanpa membuat root/config pengganti, membaca credential atau mengulang recovery.

Diagnostic hanya:

1. Memeriksa metadata/ACL root Temp **existing** milik attempt tersebut; config directory harus existing, non-link dan kosong. Tidak membaca isi file scope/approval/credential, vendor metadata atau Docker config.
2. Maksimal **dua** `docker image inspect` untuk exact pin yang sama: format V1, kemudian format kompatibel. Keduanya hanya memproyeksikan Id/Os/User/Volumes; tidak membaca Config.Env, seluruh config, source/cache file atau daftar container.
3. Menangkap exit code serta stdout/stderr CLI **hanya di memory lokal**, mencetak JSON booleans dan kategori tetap: optional-field template error, other template error, image-not-found, access-denied, daemon-connectivity atau redacted other. Tidak mencetak message/path/payload raw, token, workspace atau actor. Node stderr ditandai terpisah dari stderr setiap CLI probe.
4. UNKNOWN/timeout/output cap/driver rejection langsung STOP tanpa probe kedua atau retry. Tidak memanggil `recover()`, create/start/run/exec/cp/rm/diff, qualification, SQL, network provider/GitHub, file/env/ACL mutation, export, restart atau cleanup. Semua default IO saat diagnosis read-only; field `filesWritten:0` merujuk helper ini, bukan artifact attempt sebelumnya.

Docker CLI timeout 20 detik/probe, stdout cap 128 KiB/stderr 8 KiB; wrapper 90 detik. Existing local named pipe dan fresh empty config dari attempt owner dipakai kembali; tidak membaca Auth/config Docker owner atau membuat Auth/App baru.

Kirim **hanya JSON projection**. Jangan kirim private reference object, raw Docker stderr atau file metadata. Jika `optionalFieldCompatibilityObserved:true`, error key Volumes pada format legacy dan keberhasilan pin pada format kompatibel telah diamati pada image/operator saat diagnostic. Itu belum sidecar recovery, qualification atau source verification. Jika hasil lain, gunakan kategorinya untuk diagnosis tanpa menganggap image valid/hilang secara otomatis.

## V2 disiapkan, belum berizin eksekusi

V1 wrapper/source/bundle/proposal/approval tetap frozen. Source/bundle dan wrapper `recover-trivy-manifest-v2.*` disiapkan terpisah: format optional-key diperbaiki, Docker exit/stderr categories dicatat aman, archive/identity/layer/owned-cleanup controls dipertahankan. Parser/model recovery V1 tidak diubah. Wrapper V2 menuntut diagnostic kompatibilitas terkonfirmasi sebelum tindakan; itu tetap **tidak menggantikan approval baru**.

**Jangan menjalankan V2 sekarang**, meskipun diagnostic pin berhasil. Satu recovery attempt sebelumnya sudah dipakai. Setelah receipt diagnostic tersedia, ajukan satu recovery retry V2 dengan artifact hashes yang sudah bisa ditinjau. Tidak ada izin qualification retry/website attachment/scan/AI/PR/retest dari diagnostic maupun persiapan V2.

Pengujian baru: **31/31 projection/transport/diagnostic doubles PASS**, termasuk missing/invalid projection, volume denial, safe categories, secret-free projection dan stop setelah UNKNOWN; **45/45 V2 archive/identity/cleanup doubles PASS** dengan assertion yang sama, tanpa mengubah suite V1. Wrapper diagnostic dan V2 recovery masing-masing 0 AST parse errors. Tidak menjalankan Go template engine/Docker secara nyata pada tes offline; primary-source contract review bukan proof bahwa rendering actual owner telah berhasil. Diagnostic owner diperlukan untuk itu.

Kode produk G03/G02/Auth/Sentinel, database historis, 46 implementation hashes dan ZIP baseline tetap utuh. Manifest Trivy host masih belum pulih, sidecar belum ada dan qualification belum dijalankan. **G03 tetap PARTIAL.**

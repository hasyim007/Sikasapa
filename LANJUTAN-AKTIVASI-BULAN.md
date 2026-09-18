# SELESAI — Fitur "Aktivasi Bulan & Libur" + Rombak Informasi Pembayaran Publik

**Status: semua item di bawah sudah dikerjakan** (lihat bagian "Sudah
selesai (lanjutan sesi ini)" di paling bawah file ini). File ini
dipertahankan sebagai riwayat/konteks kalau perlu debug lebih lanjut.
Sudah lolos `node --check` di kedua file JS dan div-balance seimbang.
Belum di-deploy — ikuti langkah migrasi & deploy di paling bawah.

## Permintaan asli (dari pengguna)

> Setelah mencari nama anaknya, hasil Informasi Pembayaran (halaman
> publik wali murid) TIDAK PERLU mencantumkan nominal dan total —
> cukup: nama anak, nama ekstra, total terbayar, dan belum bayar,
> bulan Januari–Desember dengan stempel "terbayar" atau "belum
> terbayar". Bisa aktivasi bulan dari Januari–Desember — misalnya
> kalau tidak diaktivasi, alasannya apa (mis. "bulan ini libur"),
> alasan itu juga tertampil di Informasi Pembayaran. Untuk
> "Aktivasi Bulan", tambahkan MENU BARU. "Hari Libur Ekstra" yang
> sebelumnya ada di menu Pengaturan, PINDAHKAN ke menu baru itu juga
> — menu baru ini mengatur aktivasi bulan DAN hari libur, keduanya
> per jenis ekstrakurikuler (bukan satu pengaturan global lagi).

## Sudah selesai (aman, sudah lolos `node --check` & div-balance check)

1. **`schema.sql`** — tabel `ekskul` punya 2 kolom baru:
   - `bulan_aktif TEXT DEFAULT '{}'` — JSON object, HANYA berisi entri
     bulan yang **dinonaktifkan**: `{"7":{"aktif":false,"alasan":"Libur Semester"}}`.
     Bulan tanpa entri = aktif (default).
   - `hari_libur TEXT DEFAULT '[]'` — JSON array `{"tanggal":"YYYY-MM-DD","keterangan":"..."}`,
     PENGGANTI `pengaturan.hari_libur` yang dulu global. Kolom
     `pengaturan.hari_libur` lama dibiarkan ada di DB (tidak dihapus,
     supaya tidak perlu migrasi turun) tapi sudah TIDAK dibaca UI mana pun.
2. **`migrasi-aktivasi-bulan-ekskul.sql`** — file migrasi baru (`ALTER TABLE`)
   untuk database yang sudah pernah di-deploy sebelum fitur ini ada.
   Jalankan lewat **D1 Console** di Cloudflare Dashboard (Workers & Pages
   → D1 → database → tab Console), bukan CLI.
3. **`src/index.js`**:
   - `getAppData()` — ekskul sekarang kirim `bulanAktif` & `hariLibur`.
   - `getPublicData()` — ekskul (untuk halaman publik) juga kirim `bulanAktif` & `hariLibur`.
   - `getPublicRiwayat()` — TIDAK LAGI mengirim kolom `nominal` sama sekali (sudah dihapus dari SELECT & response).
   - `saveAll()` & `restoreBackup()` — ekskul upsert sekarang menyimpan `bulan_aktif` & `hari_libur`, lewat fungsi sanitasi baru `sanitasiBulanAktif()` & `sanitasiHariLiburEkskul()` (dekat `sanitasiHariLibur()` lama).
4. **`public/script_core.js`**:
   - `normalizeDB()` — tiap `ek` di `db.ekskul` sekarang dinormalisasi punya `bulanAktif` (object) & `hariLibur` (array of `{tanggal,keterangan}`, tervalidasi format tanggal).
   - `tanggalPertemuanBulan(hariJadwal, ym, ekskulId)` — signature berubah, parameter ke-3 `ekskulId` BARU. Sekarang pakai `ekskulById(ekskulId).hariLibur` (per ekstra), bukan `DB.pengaturan.hariLibur` (global) lagi. **Semua 5 titik pemanggilan sudah diperbarui** untuk mengirim `ek.id` (cek dengan `grep -n "tanggalPertemuanBulan(ek" public/script_core.js` — harus ada 5 hasil).
   - Panel "Hari Libur Ekstra" di `renderPengaturan()` (menu Pengaturan) SUDAH DIHAPUS, begitu juga fungsi `tambahHariLibur()`/`hapusHariLibur()`. **Struktur `<div>` di sekitar `formPenanggungJawab` sudah diperbaiki** (form itu sekarang punya pembungkus div sendiri lagi, div count sudah seimbang 42/42 — jangan sampai pecah lagi kalau menambahkan/mengubah panel di file ini).

## ⚠️ Status sementara — regresi yang harus segera ditutup

Karena "Hari Libur Ekstra" sudah dihapus dari menu Pengaturan tapi menu
BARU-nya **belum dibuat**, saat ini **Bendahara tidak punya cara mengatur
hari libur maupun aktivasi bulan lewat UI sama sekali** (walau kolom
datanya sudah siap di database & sudah disinkronkan penuh). Ini harus
jadi prioritas #1 di sesi lanjutan — jangan deploy ke production sebelum
menu barunya jadi, supaya tidak ada jendela waktu di mana admin sekolah
kehilangan fitur yang sebelumnya ada.

## Yang masih harus dikerjakan

### 1. Menu admin baru "Aktivasi Bulan & Libur"

Di `public/script_core.js`:

- Tambahkan entri baru ke array `MENUS` (sekitar baris 676), contoh:
  ```js
  { id:'kalenderEkstra', label:'Aktivasi Bulan & Libur', icon:'calendar-clock',
    subtitle:'Atur bulan aktif pembayaran & hari libur, per jenis ekstrakurikuler', bendaharaOnly:true },
  ```
  Taruh sesudah `ekskul` atau sebelum `pengaturan` di daftar menu — bebas,
  yang penting logis (dekat "Data Ekstrakurikuler").
- Daftarkan di object `renderers` dalam `renderView()`: `kalenderEkstra: renderKalenderEkstra,`.
- Buat `let window._kalenderEkstraState = { ekskulId:'' };` (pola sama
  seperti `window._presensiState` untuk Cetak Presensi).
- Buat fungsi `renderKalenderEkstra()`:
  - Dropdown pilih ekstrakurikuler (kalau `DB.ekskul` kosong, tampilkan pesan kosong seperti di `renderCetakPresensi()`).
  - Grid 12 bulan (`Januari`..`Desember`, tahun berjalan — `hariIniDate().getFullYear()`), tiap sel:
    - Kalau aktif: tombol "Nonaktifkan" → saat diklik, tampilkan input teks alasan + tombol "Simpan" (inline, munculkan lewat `window._kalenderEkstraState.bulanSedangDiedit = bulan` lalu `renderView('kalenderEkstra')`).
    - Kalau nonaktif: tampilkan badge alasan + tombol "Aktifkan Lagi".
  - Fungsi-fungsi baru yang perlu dibuat:
    - `nonaktifkanBulan(ekskulId, bulan)` — baca input alasan, `ek.bulanAktif[String(bulan)] = {aktif:false, alasan}`, `catatAktivitas(...)`, `saveDB(DB)`, `renderView('kalenderEkstra')`.
    - `aktifkanBulan(ekskulId, bulan)` — `delete ek.bulanAktif[String(bulan)]`, sisanya sama.
  - Panel "Hari Libur Ekstra" (PINDAHAN dari Pengaturan, sekarang per-ekskul):
    - Input tanggal + input keterangan (BARU — dulu tidak ada keterangan, sekarang tambahkan supaya alasan liburnya jelas) + tombol "Tandai Libur".
    - List tanggal libur ekstra ini beserta keterangan & tombol hapus.
    - Fungsi baru: `tambahHariLiburEkskul(ekskulId)` dan `hapusHariLiburEkskul(ekskulId, tanggal)` — pola sama seperti `tambahHariLibur()`/`hapusHariLibur()` yang lama (lihat riwayat git/file asli di atas untuk contoh), tapi menulis ke `ek.hariLibur` (array of object), bukan `pg.hariLibur` (array of string).

### 2. Rombak "Informasi Pembayaran" di halaman publik

File: `public/script_core.js`, fungsi `cariInfoPembayaranPublik()`
(sekitar baris 5522 sebelum perubahan ini — cari dengan
`grep -n "function cariInfoPembayaranPublik"`).

Untuk `ek.jenisPembayaran === 'bulanan'`:
- Hilangkan section `pub-summary` yang berisi "Total Dibayar" (Rp) & "Tarif / Bulan" (Rp) — GANTI dengan ringkasan non-uang: "Bulan Lunas" (hitung), "Belum Dibayar" (hitung), "Jadwal Latihan" (tetap).
- Hilangkan section "Riwayat Pembayaran" (`pub-txn`, yang menampilkan nominal per transaksi) SEPENUHNYA untuk tipe bulanan — ganti dengan grid 12 bulan (lihat CSS baru di bawah).
- Logika grid, per bulan 1–12 tahun berjalan (`hariIniDate().getFullYear()`):
  ```js
  const periodeKey = tahun + '-' + String(bulanKe).padStart(2,'0');
  const nonaktif = ek.bulanAktif[String(bulanKe)] && ek.bulanAktif[String(bulanKe)].aktif === false;
  if (nonaktif) { /* tampilkan badge alasan, TIDAK dihitung lunas/belum */ }
  else if (riwayat.some(p => p.periode === periodeKey)) { /* stempel "Sudah Dibayar", totalLunas++ */ }
  else { /* stempel "Belum Dibayar", totalBelum++ */ }
  ```
- Stempel ringkasan di kanan-atas kartu (yang sekarang `${riwayat.length} BULAN LUNAS`) — ganti pakai `totalLunas` hasil hitungan grid di atas, bukan `riwayat.length` mentah (supaya konsisten dengan bulan yang memang aktif tahun ini).

Untuk `ek.jenisPembayaran === 'pertemuan'` (TIDAK memakai grid bulan — konsepnya beda, per pertemuan bukan per bulan):
- Cukup hilangkan nominal (`rupiah(p.nominal)`) dari tiap baris riwayat & hilangkan `rupiah(totalDibayar)` dari summary "Total Dibayar" dan "Tarif / Pertemuan". Sisanya (daftar tanggal hadir, "Kehadiran", "Jadwal Latihan") boleh tetap seperti semula, karena itu bukan angka uang.

### 3. CSS baru untuk grid bulan

File: `public/index.html`, tambahkan dekat class `.pub-txn`/`.pub-empty` (sekitar baris 286), misalnya:

```css
#publicScreen .pub-month-grid{ display:grid; grid-template-columns:repeat(2,1fr); gap:10px; margin:20px 0 4px; }
@media(min-width:640px){ #publicScreen .pub-month-grid{ grid-template-columns:repeat(3,1fr); } }
@media(min-width:900px){ #publicScreen .pub-month-grid{ grid-template-columns:repeat(4,1fr); } }
#publicScreen .pub-month-cell{ border-radius:16px; padding:12px 14px; background:rgba(255,255,255,0.55); border:1px solid rgba(255,255,255,0.85); }
#publicScreen .pub-month-name{ font-size:12.5px; font-weight:700; color:var(--pub-ink); margin-bottom:8px; }
#publicScreen .pub-month-stamp{ display:inline-flex; align-items:center; gap:5px; font-size:10.5px; font-weight:800; letter-spacing:.03em; padding:4px 10px; border-radius:999px; }
#publicScreen .pub-month-stamp.paid{ background:rgba(13,148,136,0.12); color:#0D766E; }
#publicScreen .pub-month-stamp.unpaid{ background:rgba(217,119,6,0.12); color:#B45309; }
#publicScreen .pub-month-stamp.holiday{ background:rgba(15,23,42,0.06); color:rgba(15,23,42,0.5); }
```
(Nama kelas boleh disesuaikan, ini cuma titik awal — pastikan konsisten dengan gaya `pub-*` yang sudah ada, lihat sekitar baris 160–291 di `public/index.html`.)

### 4. Sanity check sebelum kirim ke pengguna lagi

```bash
node --check public/script_core.js
node --check src/index.js
```
dan cek keseimbangan `<div>`/`</div>` di fungsi manapun yang diedit (lihat
teknik Python di riwayat kerja — hitung `<div\b` vs `</div>` dalam
potongan fungsi terkait), karena semua HTML digenerate sebagai template
string, jadi tidak ada validator HTML otomatis.

## Cara migrasi & deploy (ikuti preferensi pengguna: TANPA CLI)

1. **Migrasi database** (kalau database sudah pernah dideploy sebelumnya):
   buka Cloudflare Dashboard → Workers & Pages → D1 → database
   `sikasapa-db` → tab **Console** → tempel isi `migrasi-aktivasi-bulan-ekskul.sql` → Execute.
   (Kalau ini instalasi baru dari nol, cukup jalankan `schema.sql` yang sudah menyertakan kolom ini — tidak perlu file migrasi.)
2. **Deploy kode**: sesuai kebiasaan proyek ini, upload/commit perubahan
   lewat GitHub web interface ke repo yang terhubung ke Cloudflare
   Workers (Workers & Pages → project → Settings → Builds, kalau pakai
   Git integration akan auto-deploy setelah push). Kalau belum pernah
   disambungkan ke Git, beri tahu pengguna supaya menyambungkan dulu
   lewat Cloudflare Dashboard, karena `wrangler deploy` butuh CLI.

## Sudah selesai (lanjutan sesi ini)

Semua poin di "Yang masih harus dikerjakan" di atas sudah dikerjakan:

1. **Menu admin baru "Aktivasi Bulan & Libur"** (`kalenderEkstra`) di
   `public/script_core.js`:
   - Entri baru di `MENUS` (setelah `ekskul`), didaftarkan di `renderers`.
   - `window._kalenderEkstraState = { ekskulId:'', bulanSedangDiedit:null }`.
   - `renderKalenderEkstra()` — dropdown ekstrakurikuler, grid 12 bulan
     (badge Aktif/Nonaktif + tombol, alasan lewat input inline saat
     menonaktifkan), panel "Hari Libur Latihan" per-ekskul (input
     tanggal + keterangan + list + hapus).
   - Fungsi baru: `updateKalenderEkstraState()`, `mulaiEditBulanKalender()`,
     `batalEditBulanKalender()`, `nonaktifkanBulan()`, `aktifkanBulan()`,
     `tambahHariLiburEkskul()`, `hapusHariLiburEkskul()`. Semua memanggil
     `catatAktivitas()` + `saveDB(DB)` + `renderView('kalenderEkstra')`,
     mengikuti pola `tambahKategori()`/`hapusKategori()` yang sudah ada.
   - Ditaruh tepat sebelum bagian "LOG AKTIVITAS" di file (dekat
     `renderCetakPresensi`/`cetakPresensi`, sebelum fungsi lama itu berakhir).

2. **Rombak "Informasi Pembayaran" publik** — `cariInfoPembayaranPublik()`:
   - Untuk `jenisPembayaran==='bulanan'`: section nominal (`pub-summary`
     lama & `pub-txn` riwayat nominal) diganti grid 12 bulan
     (`pub-month-grid`) dengan stempel Sudah Dibayar/Belum Dibayar/Libur
     (+ alasan), dihitung dari `ek.bulanAktif` & `riwayat` (tahun berjalan).
     Ringkasan atas pakai `totalLunas` dari hasil hitungan grid, bukan
     `riwayat.length` mentah.
   - Untuk `jenisPembayaran==='pertemuan'`: nominal dihapus dari tiap
     baris riwayat & ringkasan; sisanya (tanggal hadir, kehadiran,
     jadwal latihan) tetap tampil seperti semula.

3. **CSS grid bulan** — ditambahkan di `public/index.html` dekat
   `.pub-empty` (kelas `pub-month-grid`, `pub-month-cell`,
   `pub-month-name`, `pub-month-stamp` [`.paid`/`.unpaid`/`.holiday`],
   `pub-month-note` untuk teks alasan libur).

4. **Sanity check**: `node --check public/script_core.js` &
   `node --check src/index.js` lolos. Div-balance keseluruhan file
   `script_core.js` seimbang (411/411), dan khusus fungsi yang diedit/
   ditambah (`renderKalenderEkstra` 14/14, `cariInfoPembayaranPublik`
   25/25) sudah dicek terpisah.

Belum dikerjakan / perlu dicek manual oleh pengguna setelah deploy:
- Uji manual di browser (klik-klik menu baru, cek grid publik) — sesi
  ini hanya mengecek sintaks & keseimbangan tag, bukan menjalankan UI
  sungguhan di browser.
- `hariLibur` per-ekskul sekarang punya `keterangan` (dulu tidak ada di
  versi global lama) — kalau ada data lama dari sebelum migrasi ini,
  keterangannya akan kosong sampai Bendahara mengisi ulang lewat menu baru.

---

## ADENDUM — `bulan_aktif` sekarang terikat tahun (perbaikan gotcha #4)

Dulu key JSON di `bulan_aktif`/`bulanAktif` cuma nomor bulan (`"7"`), jadi
menonaktifkan Juli 2026 otomatis ikut menonaktifkan Juli di SEMUA tahun
lain juga, selamanya, sampai diaktifkan manual lagi. Sudah diperbaiki:

- **Key baru: `"YYYY-MM"`** (persis sama format dengan `periode`, mis.
  `"2026-07"`), bukan `"7"` lagi. Contoh isi kolom sekarang:
  `{"2026-07":{"aktif":false,"alasan":"Libur Semester"}}`.
- `src/index.js` — `sanitasiBulanAktif()` sekarang validasi key dengan
  regex `BULAN_AKTIF_KEY_RE = /^\d{4}-(0[1-9]|1[0-2])$/`, bukan loop
  `"1".."12"` lagi.
- `public/script_core.js`:
  - `bulanNonaktifUntukPeriode(ek, periode)` — sekarang tinggal
    `ek.bulanAktif[periode]` langsung (periode sudah dalam format
    `"YYYY-MM"`), tidak perlu `parseInt` nomor bulan lagi.
  - `renderKalenderEkstra()` — menu "Aktivasi Bulan & Libur" sekarang
    punya **navigasi tahun** (tombol ‹ › di atas grid 12 bulan), state
    `window._kalenderEkstraState.tahun` (default tahun berjalan). Fungsi
    baru `gantiTahunKalenderEkstra(delta)`.
  - `nonaktifkanBulan(ekskulId, bulan)` / `aktifkanBulan(ekskulId, bulan)`
    — sekarang baca `window._kalenderEkstraState.tahun` dan pakai key
    `${tahun}-${String(bulan).padStart(2,'0')}`.
  - Grid Informasi Pembayaran publik (`cariInfoPembayaranPublik`, sekitar
    baris ~5740) — sudah pakai `periodeKey` (`tahun + '-' + bulan padded`)
    yang sudah dihitung di situ, tinggal dipakai juga untuk lookup
    `ek.bulanAktif`.

**TIDAK ADA migrasi data lama** (key bernomor bulan saja, mis. `"7"`) —
atas keputusan pengguna, entri lama diabaikan begitu saja oleh regex key
baru (`BULAN_AKTIF_KEY_RE` menolak key yang bukan `"YYYY-MM"`), dianggap
fitur baru dari nol. Kalau sebelumnya ada bulan yang dinonaktifkan lewat
menu lama, itu perlu di-set ulang manual lewat menu (sekarang dengan
pemilihan tahun juga).

Sudah lolos `node --check` di kedua file.

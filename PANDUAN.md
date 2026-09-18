# PANDUAN SIKasapa — Cloudflare Workers + D1 (satu proyek, dari nol)

SIKasapa versi ini adalah **satu proyek Cloudflare Worker saja** —
frontend (folder `public/`) dan backend (`src/index.js` + database D1)
di-deploy BERSAMAAN lewat satu perintah `npx wrangler deploy`. Tidak
ada lagi hosting terpisah (Cloudflare Pages/Netlify/dll), tidak ada
`config.js`/`WORKER_URL`, dan **tidak ada R2/object storage** — logo &
bukti pengeluaran dikecilkan di browser lalu disimpan langsung sebagai
data URL base64 di D1.

Struktur folder:
```
SIKasapa/
├── public/                ← frontend statis, disajikan otomatis oleh Worker
│   ├── index.html          (halaman publik wali murid, alias dari public.html)
│   ├── public.html         (redirect lama -> index.html, boleh dihapus kalau mau)
│   ├── login.html          (form login Bendahara/Kepala Sekolah)
│   ├── admin.html          (dashboard utama)
│   └── script_core.js      (logic bersama semua halaman)
├── src/
│   └── index.js            (Worker API: rute /rpc/<nama> & /health)
├── schema.sql               (jalankan sekali di awal — bikin semua tabel + akun default)
├── drop-schema.sql          (opsional — hapus semua tabel untuk reset bersih)
├── package.json
├── wrangler.toml             (konfigurasi Worker + D1 + folder assets)
└── PANDUAN.md               (file ini)
```

---

## Prasyarat

1. **Akun Cloudflare** (gratis) — [dash.cloudflare.com](https://dash.cloudflare.com/sign-up).
2. **Node.js** versi 18 ke atas.
3. Buka terminal di folder `SIKasapa/` ini (root proyek, tempat `wrangler.toml` berada):
   ```
   npm install
   npx wrangler login
   ```
   (`wrangler login` membuka browser untuk menghubungkan akun Cloudflare — sekali saja.)

---

## Langkah 1 — Buat database D1

```
npx wrangler d1 create sikasapa-db
```

Perintah ini menampilkan blok konfigurasi mirip:
```toml
[[d1_databases]]
binding = "DB"
database_name = "sikasapa-db"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

Buka `wrangler.toml`, **ganti** nilai `database_id` di blok
`[[d1_databases]]` yang sudah ada dengan `database_id` yang baru saja
ditampilkan (jangan tambah blok baru, cukup ganti nilainya).

Lalu jalankan skema (bikin semua tabel + akun login default + kategori default):
```
npm run db:schema:remote
```
Kalau berhasil akan muncul ringkasan jumlah query yang dijalankan, tanpa error merah.

> Akun login default yang otomatis terbuat:
> - Bendahara: `bendahara` / `sikasapa123`
> - Kepala Sekolah: `kepsek` / `kepsek123`
>
> **Segera ganti kedua password ini** lewat menu Pengaturan di aplikasi
> admin setelah deploy selesai (Langkah 2).

---

## Langkah 2 — Deploy (satu perintah, frontend + backend sekaligus)

```
npm run deploy
```

Wrangler otomatis mengunggah folder `public/` sebagai file statis
DAN men-deploy `src/index.js` sebagai Worker-nya, jadi terminal akan
menampilkan satu URL untuk KEDUANYA, bentuknya:
```
https://sikasapa.<nama-akun-anda>.workers.dev
```

Buka URL itu langsung — halaman publik (`index.html`) akan tampil.
Tambahkan `/login.html` untuk masuk sebagai Bendahara/Kepala Sekolah,
lalu `/admin.html` untuk dashboard setelah login.

Tidak ada langkah upload file frontend terpisah, tidak ada
`config.js` yang perlu diisi — semuanya sudah satu domain yang sama.

> **Soal biaya/batas pemakaian**: paket gratis Cloudflare Workers
> (Workers Free) sudah cukup untuk aplikasi skala satu sekolah — D1
> gratis sampai 5 juta baris dibaca & 100 ribu baris ditulis per hari,
> dengan kuota penyimpanan 5 GB, dan static assets tidak dikenai biaya
> permintaan tambahan. Kalau nanti butuh kuota lebih besar, paket
> Workers Paid ($5/bulan) jauh melebihi kebutuhan aplikasi seukuran ini.

---

## (Opsional) Pakai domain sendiri, bukan `*.workers.dev`

Buka dashboard Cloudflare → Workers & Pages → pilih Worker `sikasapa`
→ Settings → Domains & Routes → Add → hubungkan domain/subdomain Anda
(mis. `kas.sekolah-anda.com`). Tidak perlu ubah kode apa pun — karena
frontend & API satu Worker yang sama, domain baru otomatis berlaku
untuk keduanya sekaligus.

---

## Checklist deploy cepat (ikuti urutan ini persis)

- [ ] 1. `npm install` & `npx wrangler login`
- [ ] 2. `npx wrangler d1 create sikasapa-db`, salin `database_id` ke `wrangler.toml`
- [ ] 3. `npm run db:schema:remote` — pastikan tidak ada error merah
- [ ] 4. `npm run deploy` — salin URL yang ditampilkan
- [ ] 5. Buka URL tadi — halaman publik harus tampil (bukan error/kosong)
- [ ] 6. Buka `/login.html`, login pakai akun default, langsung ganti password Bendahara & Kepala Sekolah di menu Pengaturan
- [ ] 7. Coba unggah logo sekolah lalu tekan "Simpan" — ini menguji alur kompres gambar + simpan ke D1
- [ ] 8. (Opsional) Hubungkan domain sendiri lewat dashboard Cloudflare

---

## Kalau setup di awal berantakan dan ingin mulai ulang dari nol

```
npm run db:reset:remote
```
Perintah ini menjalankan `drop-schema.sql` (hapus semua tabel) lalu
`schema.sql` lagi (buat ulang tabel + akun default). **Seluruh data
hilang** — hanya untuk tahap setup awal, bukan untuk dipakai setelah
sekolah mulai memakai datanya sungguhan.

---

## Sudah pernah deploy sebelumnya? (migrasi kolom baru)

Kalau database Anda sudah dibuat SEBELUM fitur "Hari Libur Ekstra" (menu
Pengaturan) ada, jalankan sekali saja:
```
npx wrangler d1 execute sikasapa-db --remote --file=./migrasi-hari-libur.sql
```
Ini cuma menambah satu kolom baru (`hari_libur`, default array kosong) ke
tabel `pengaturan` — **tidak menghapus data apa pun**. Kalau baru deploy dari
nol dengan `schema.sql` versi terbaru, langkah ini tidak perlu (kolomnya
sudah ada dari awal).

Kalau database Anda sudah dibuat SEBELUM fitur "Guru Ekstra wajib Absen
Guru Pembina dulu sebelum mengisi absensi siswa" ada, jalankan sekali saja:
```
npx wrangler d1 execute sikasapa-db --remote --file=./migrasi-absensi-guru.sql
```
Ini cuma MENAMBAH satu tabel baru (`absensi_guru`) — **tidak menghapus/mengubah
data yang sudah ada sama sekali**. Kalau baru deploy dari nol dengan
`schema.sql` versi terbaru, langkah ini tidak perlu (tabelnya sudah ikut
dibuat otomatis).

---

## Perbedaan teknis yang perlu diketahui (tidak memengaruhi pemakaian sehari-hari)

1. **Satu Worker untuk frontend + backend**: dikonfigurasi lewat blok
   `[assets]` di `wrangler.toml` (folder `public/`, binding `ASSETS`).
   Permintaan ke `/rpc/*` dan `/health` SELALU diproses oleh
   `src/index.js` (diatur lewat `run_worker_first`); permintaan
   lainnya dicoba sebagai file statis di `public/` dulu.
2. **Tanpa CORS**: karena frontend & API sekarang satu origin yang
   sama, browser tidak perlu preflight CORS sama sekali — `rpc()` di
   `script_core.js` cukup memanggil path relatif `/rpc/<nama>`.
3. **Hash password**: PBKDF2-SHA256 (100.000 iterasi, lewat Web Crypto
   native) — jauh lebih ramah batas CPU time Cloudflare Workers
   dibanding bcrypt, dengan ketahanan brute-force offline yang
   sebanding pada iterasi setinggi ini.
4. **Nomor dokumen (Laporan/Kwitansi)**: atomik lewat satu statement
   `UPDATE ... RETURNING` dengan fungsi JSON bawaan SQLite
   (`json_set`/`json_extract`), mencegah nomor dobel walau dipanggil
   bersamaan dari beberapa sesi.
5. **Gambar (logo, bukti pengeluaran) — TANPA R2**: browser mengecilkan
   gambar (resize ke maksimal ~500–1000px sisi terpanjang + kompres
   JPEG) lewat `kompresGambar()`/`siapkanGambarUntukDisimpan()` di
   `script_core.js` sebelum disimpan sebagai data URL base64 langsung
   di kolom TEXT D1 yang sama dengan data lain. Worker menolak (dengan
   pesan jelas) kalau ada gambar yang masih lebih dari ~1,5 MB setelah
   dikompres, supaya tidak melanggar batas 2 MB per baris/kolom di D1.

---

## Fitur: Tunggakan & Pengingat Pembayaran (WhatsApp) — SINKRON

Menu **Tunggakan** dan menu **Pengingat Pembayaran** memakai perhitungan
yang PERSIS SAMA (`hitungTunggakanBulananGabungan()` untuk skema Bulanan,
`hitungEstimasiTunggakanPertemuan()` untuk skema Per Pertemuan) — siswa
dan rincian yang tampil di kedua menu selalu sinkron.

- **Bulanan**: ditarik mundur sampai **6 bulan terakhir** (bukan cuma
  bulan berjalan). Siswa yang baru gabung (belum pernah tercatat bayar
  sama sekali di ekskul itu) hanya dicek bulan berjalan saja, supaya
  tidak salah tagih bulan sebelum dia jadi anggota. Bulan yang
  dinonaktifkan lewat menu "Aktivasi Bulan & Libur" tidak ikut dihitung.
- **Per Pertemuan**: tiap siswa dirinci sampai ke tanggal pertemuan
  spesifik yang belum dibayar — lengkap dengan nama bulan, pertemuan
  ke berapa dalam bulan itu, minggu ke berapa (tanggal 1–7 = minggu
  ke-1, 8–14 = ke-2, dst.), dan hari apa. Jendelanya tetap 3 bulan
  terakhir seperti sebelumnya.
- Kartu skema Bulanan dan Per Pertemuan tampil **bersebelahan** (satu
  grid yang sama) di kedua menu, dibedakan lewat label jenisnya.

Menu **Pengingat Pembayaran** (khusus Bendahara) menyusun pesan pengingat
otomatis dari template yang bisa Anda atur, untuk wali murid yang belum
membayar iuran — baik ekstrakurikuler skema Bulanan maupun Per Pertemuan.

**Penting untuk dipahami**: aplikasi ini TIDAK terhubung ke WhatsApp
Business API berbayar. Tombol "Kirim" membuka WhatsApp (lewat tautan
`wa.me`) dengan pesan yang SUDAH TERISI OTOMATIS sesuai template —
Anda tinggal menekan tombol kirim di WhatsApp untuk tiap wali murid.
Ini bukan "kirim massal tanpa disentuh", tapi jauh lebih cepat daripada
mengetik pesan satu-satu.

- Nomor WA wali murid diisi/dikoreksi langsung di menu ini (tersimpan
  ke data siswa yang sama dipakai di menu Data Siswa).
- Template pesan bisa diubah bebas lewat panel "Atur Template Pesan" —
  ada placeholder seperti `{namaSiswa}`, `{daftarBulan}`,
  `{totalTunggakan}`, dst yang otomatis diganti data sebenarnya. Untuk
  template **Bulanan**, `{daftarBulan}` otomatis berisi SEMUA bulan yang
  belum dibayar (bisa lebih dari satu, mis. "Mei 2026, Juni 2026,
  Agustus 2026"). Untuk template **Per Pertemuan**, `{daftarBulan}`
  otomatis berisi rincian lengkap per bulan: pertemuan ke berapa, minggu
  ke berapa, dan hari apa (mis. "September 2026: pertemuan ke-2 (Rabu,
  minggu ke-2), ke-3 (Rabu, minggu ke-3)").
- Setiap pesan yang dikirim tercatat di Log Aktivitas.

## Fitur: Kelola Absensi (Guru Ekstrakurikuler)

Menu **Kelola Absensi** untuk mencatat kehadiran siswa di ekstrakurikuler
yang TIDAK selalu berkaitan dengan iuran/kas (terpisah dari data
Ekstrakurikuler & Pemasukan yang sudah ada).

Alur pemakaian:
1. Bendahara menambahkan **jenis ekstrakurikuler absensi** (mis. Pramuka,
   Rebana) di menu Kelola Absensi, mengisi **jadwal hari latihannya**
   (dipakai untuk Cetak Presensi di langkah 5), lalu mendaftarkan siswa
   pesertanya lewat tombol "Kelola Peserta".
2. Bendahara membuat **akun login untuk guru ekstra** di menu
   Pengaturan → "Akun Login — Guru Ekstrakurikuler", dan menugaskan guru
   itu ke satu atau beberapa jenis ekstrakurikuler.
3. Guru login memakai akun tersebut di halaman yang sama
   (`login.html`) — begitu masuk, **satu-satunya menu yang tampil untuk
   guru ekstra adalah "Kelola Absensi"**, dan cuma untuk ekstrakurikuler
   yang ditugaskan ke dia. Guru tidak bisa melihat data keuangan sekolah
   sama sekali (server memang tidak pernah mengirim data itu ke akun
   guru — lihat `getGuruData()` di `src/index.js`).
4. Guru mengikuti alur 3 langkah di layar: (1) pilih ekstrakurikuler &
   tanggal, (2) **Absen Guru Pembina** — guru WAJIB menandai kehadiran
   dirinya sendiri (Hadir/Izin/Sakit/Alpa) dulu untuk tanggal itu; form
   absensi siswa di langkah 3 tetap TERKUNCI (server menolak
   penyimpanannya, bukan cuma disembunyikan di layar) sampai langkah ini
   diisi, (3) tandai status tiap siswa lewat tombol Hadir/Izin/Sakit/
   Alpa (ada tombol "Tandai semua Hadir" untuk mempercepat, dan ringkasan
   jumlah tiap status langsung terlihat), lalu Simpan. Mengisi ulang
   tanggal yang sama (baik absen guru maupun absensi siswa) akan menimpa
   data sebelumnya (bukan dobel).
5. **Cetak Presensi** (tombol di atas daftar siswa) mencetak lembar
   presensi bulanan yang tanggalnya otomatis mengikuti jadwal hari
   latihan, dengan baris **"Guru Pembina"** di baris paling atas (H/I/S/A
   kehadiran guru per tanggal) diikuti baris tiap siswa — semuanya
   SUDAH terisi langsung dari absensi yang diisi guru di langkah 4, bukan
   lembar kosong yang harus ditulis ulang manual. Tersedia untuk
   Bendahara, Kepala Sekolah, maupun Guru Ekstra sendiri.

**Kalau database Anda sudah dibuat sebelum fitur ini ada**, jalankan
migrasi sekali saja:
```
npx wrangler d1 execute sikasapa-db --remote --file=./migrasi-absensi-pengingat.sql
npx wrangler d1 execute sikasapa-db --remote --file=./migrasi-jadwal-absensi.sql
npx wrangler d1 execute sikasapa-db --remote --file=./migrasi-absensi-guru.sql
```
Migrasi kedua menambahkan kolom jadwal hari latihan yang dipakai fitur
Cetak Presensi di atas. Migrasi ketiga menambahkan tabel `absensi_guru`
yang dipakai fitur "Absen Guru Pembina" (langkah 4 di atas). Untuk
instalasi baru dari nol, `schema.sql` sudah termasuk semua tabel & kolom
di atas — ketiga migrasi ini tidak perlu dijalankan.

---

## Fitur: Tautan Data Ekstrakurikuler ↔ Kelola Absensi

Sebelum fitur ini ada, **Data Ekstrakurikuler** (yang ada iurannya) dan
**Kelola Absensi** (yang ada kehadirannya) adalah dua data yang sama
sekali terpisah — nama, jadwal hari, dan daftar peserta harus diisi
ulang di dua tempat, dan estimasi Tunggakan untuk skema Per Pertemuan
murni menebak dari jadwal hari (dianggap semua pertemuan terjadi),
tanpa tahu siswa mana yang sebenarnya izin/sakit/alpa.

Sekarang, saat menambah/mengubah data di **Data Ekstrakurikuler**, ada
kolom opsional **"Tautkan ke Kelola Absensi"**:

- **— Tidak ditautkan (seperti biasa) —**: perilaku lama, dua data
  tetap terpisah.
- **+ Buat jenis absensi baru dengan nama & jadwal yang sama**: otomatis
  membuat jenis absensi baru di Kelola Absensi (nama & jadwal hari
  disalin dari ekstrakurikuler ini) lalu langsung menautkannya.
- **(nama jenis absensi yang sudah ada)**: menautkan ke jenis absensi
  yang sudah dibuat sebelumnya. Satu jenis absensi hanya bisa ditautkan
  dari satu Data Ekstrakurikuler (pilihan yang sudah ditautkan ke
  ekstrakurikuler lain tidak muncul di daftar).

Begitu ditautkan:
1. **Peserta otomatis sinkron** — siapa pun yang terdaftar sebagai
   peserta ekstrakurikuler ini otomatis jadi peserta absensinya juga di
   Kelola Absensi (tidak perlu dicentang dua kali). Menambah/menghapus
   peserta cukup dilakukan lewat Data Ekstrakurikuler atau Data Siswa —
   daftar peserta di Kelola Absensi untuk jenis yang tertaut ini
   otomatis mengikuti dan tidak bisa diedit manual lagi di sana selama
   masih tertaut.
2. **Jadwal hari disamakan** — jadwal hari latihan di sisi absensi
   otomatis disamakan dengan jadwal Data Ekstrakurikuler setiap kali
   disimpan, supaya tanggal pertemuan yang dipakai untuk Tunggakan &
   Cetak Presensi tidak pernah berbeda antara sisi keuangan dan sisi
   absensi.
3. **Estimasi Tunggakan (skema Per Pertemuan) memakai kehadiran asli**
   — tanggal yang guru catat **izin/sakit/alpa** di Kelola Absensi
   TIDAK ikut ditagih lagi (sebelumnya semua tanggal jadwal dianggap
   terjadi). Kalau guru belum sempat mengisi absensi untuk tanggal
   tertentu, sistem tetap fallback menganggap pertemuan itu terjadi
   (supaya tunggakan tidak "hilang" begitu saja) — tapi kartu
   ekstrakurikuler yang tertaut menandai jumlah tanggal yang belum
   diisi guru, supaya bendahara tahu angkanya masih sementara.
4. Ekstrakurikuler yang tertaut ditandai badge **"Tertaut Absensi"** di
   Data Ekstrakurikuler maupun Tunggakan.

Melepas tautan (pilih "— Tidak ditautkan —" lagi) mengembalikan
Kelola Absensi ke perilaku lama untuk jenis itu — peserta & jadwalnya
bisa diedit manual lagi seperti biasa, dan Tunggakan kembali murni
menebak dari jadwal.

**Jadwal hari dikunci selama tertaut.** Selama sebuah jenis absensi
tertaut ke suatu ekstrakurikuler, jadwal harinya **tidak bisa diedit
lagi lewat menu Kelola Absensi** — hanya lewat Data Ekstrakurikuler,
lalu otomatis disamakan ke sisi absensi. Ini mencegah dua lembar Cetak
Presensi (satu di Data Ekstrakurikuler, satu di Kelola Absensi) untuk
ekstra "yang sama" menghasilkan jumlah pertemuan yang berbeda karena
jadwalnya diam-diam menyimpang.

**Tanggal di luar jadwal tetap tercetak, tidak pernah hilang.** Kolom
tanggal di Cetak Presensi (Kelola Absensi) mengikuti jadwal hari
latihan seperti biasa, TAPI kalau ada absensi yang tersimpan untuk
tanggal di luar jadwal itu (guru tidak sengaja memilih tanggal yang
salah, atau memang ada pertemuan pengganti/tambahan), tanggal itu tetap
ikut dicetak sebagai kolom tambahan — ditandai bintang (*) dan warna
kuning pada judul kolom, plus keterangan di legenda. Saat guru memilih
tanggal yang bukan hari jadwal di form Isi Kehadiran, aplikasi juga
menampilkan peringatan (tidak memblokir, karena pertemuan pengganti itu
sah) supaya salah pilih tanggal ketahuan sebelum disimpan, bukan baru
ketahuan nanti saat dicetak.

**Kalau database Anda sudah dibuat sebelum fitur ini ada**, jalankan
migrasi sekali saja:
```
npx wrangler d1 execute sikasapa-db --remote --file=./migrasi-tautan-ekskul-absensi.sql
```
Ini cuma menambah satu kolom (`ekstra_absensi_id`, default kosong) ke
tabel `ekskul` — **tidak menghapus data apa pun**, dan semua
ekstrakurikuler yang sudah ada otomatis dianggap "tidak ditautkan"
sampai diatur manual. Kalau perintah ini gagal dengan pesan "duplicate
column name", berarti migrasi ini sudah pernah dijalankan — aman
diabaikan. Untuk instalasi baru dari nol, `schema.sql` sudah termasuk
kolom ini, migrasi ini tidak perlu dijalankan.

---

## Pemecahan masalah (troubleshooting)

**Halaman kosong/putih setelah deploy**
→ Buka Console browser (klik kanan → Inspect → Console). Kalau ada
error "Failed to fetch" ke `/rpc/...`, cek dulu apakah `schema.sql`
sudah dijalankan (Langkah 1) — Worker butuh tabel `pengaturan` terisi
untuk merespons `get_public_data`.

**Login selalu gagal padahal password benar**
→ Pastikan `schema.sql` sudah dijalankan sekali penuh tanpa error.
Cek isinya lewat:
```
npx wrangler d1 execute sikasapa-db --remote --command "SELECT username, username_kepsek FROM pengaturan"
```

**Data tersimpan di aplikasi tapi tidak muncul setelah refresh**
→ Buka dashboard Cloudflare → Workers & Pages → Worker `sikasapa` →
Logs (real-time), coba simpan data lagi dari aplikasi sambil melihat
log — pesan error dari `save_all` akan muncul di sana. Penyebab paling
umum: sesi sudah kedaluwarsa (login ulang) atau login sebagai Kepala
Sekolah (memang tidak boleh menyimpan).

**"... terlalu besar (... KB). Gunakan gambar yang lebih kecil."**
→ Muncul dari Worker kalau ada gambar yang masih lebih dari ~1,5 MB
setelah dikompres otomatis di browser (jarang terjadi, biasanya karena
foto aslinya sangat besar/detail). Coba pakai foto lain, atau kompres
manual dulu sebelum diunggah.

**Ubah kode Worker/frontend lalu deploy lagi**
→ Cukup `npm run deploy` lagi kapan pun ada perubahan di `public/`
atau `src/index.js` — keduanya selalu ikut ter-upload bersamaan.

---

Kalau ada menu/fitur yang mau ditambah lagi setelah ini (misalnya
notifikasi WhatsApp/email otomatis saat ada pembayaran baru,
multi-sekolah, dsb.), tinggal lanjutkan dari sini kapan saja.

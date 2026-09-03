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

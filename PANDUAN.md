# PANDUAN SIKasapa — Versi Supabase

SIKasapa sekarang memakai **Supabase** (database Postgres + Storage)
sebagai pengganti Google Spreadsheet + Apps Script. Struktur 3 halaman
(`index.html`, `login.html`, `admin.html`) dan seluruh fitur/menunya
**tetap sama persis** — yang berubah hanya lapisan penyimpanan data.

Halaman publik sekarang bernama `index.html` (bukan `public.html`),
supaya saat orang membuka domain Anda langsung (mis. `kas.sikasapa.com`
tanpa embel-embel nama file), yang tampil otomatis halaman publik ini —
lebih profesional. File `public.html` masih ada tapi cuma pengalih
otomatis ke `index.html`, buat jaga-jaga kalau ada link lama.

Ringkasan keputusan arsitektur yang dipakai:
- **Login**: tetap sistem sendiri (bukan Supabase Auth) — username/password
  Bendahara & Kepala Sekolah disimpan di tabel `pengaturan`, password di-hash.
- **File** (logo, bukti pengeluaran): disimpan di **Supabase Storage**
  (bucket `lampiran`), bukan Google Drive lagi.
- **Logic backend**: dijalankan lewat **fungsi RPC di database** (bukan
  Edge Function terpisah) — browser memanggilnya langsung lewat
  `supabase-js`. Tabel aslinya dikunci total (RLS tanpa policy), satu-satunya
  jalan masuk/keluar data adalah 6 fungsi RPC yang sudah divalidasi
  token & role-nya di sisi server.

---

## Bagian 1 — Membuat project Supabase

1. Buka [supabase.com](https://supabase.com) → **Sign in** / buat akun →
   **New project**.
2. Isi nama project (misal "SIKasapa"), buat password database (simpan
   baik-baik, jarang dipakai langsung tapi penting), pilih region
   terdekat (misal Singapore), klik **Create new project**. Tunggu ± 2 menit
   sampai project selesai disiapkan.

## Bagian 2 — Menjalankan skema database

1. Di dashboard project, buka menu **SQL Editor** (ikon `</>` di sidebar kiri).
2. Klik **New query**.
3. Buka file `supabase-schema.sql` dari paket ini, salin **seluruh isinya**,
   tempel ke editor SQL tadi.
4. Klik **Run** (atau `Ctrl+Enter`). Kalau berhasil akan muncul
   "Success. No rows returned" — ini artinya seluruh tabel, fungsi, akun
   login default, dan bucket Storage sudah dibuat otomatis.
5. Akun login default yang otomatis terbuat (sama seperti versi lama):
   - Bendahara: `bendahara` / `sikasapa123`
   - Kepala Sekolah: `kepsek` / `kepsek123`

   **Segera ganti kedua password ini** lewat menu Pengaturan di aplikasi
   admin setelah langkah deploy di bawah selesai.

> Kalau suatu saat perlu menjalankan ulang / reset skema, file SQL ini
> aman dijalankan berkali-kali untuk bagian tabel & fungsi (pakai
> `create or replace` / `if not exists`) — kecuali baris `insert into
> storage.buckets` dan dua `create policy` di bagian Storage paling
> bawah, yang akan gagal kalau dijalankan dua kali (karena sudah ada).
> Itu aman diabaikan/dihapus saat menjalankan ulang.

## Bagian 3 — Mengambil URL & anon key

1. Di dashboard project, buka **Settings** (ikon gerigi) → **API**.
2. Salin dua nilai ini:
   - **Project URL** (bentuknya `https://xxxxxxxx.supabase.co`)
   - **anon public** key (teks panjang di bagian "Project API keys")
3. Buka `config.js` dari paket ini dengan text editor, isi:
   ```js
   const SUPABASE_URL = 'https://xxxxxxxx.supabase.co';
   const SUPABASE_ANON_KEY = 'eyJhbGciOiJI....(panjang)....';
   ```
   Simpan filenya.

> `anon key` ini **bukan rahasia** — memang didesain aman ditaruh di
> file publik seperti ini. Keamanan sesungguhnya dijaga oleh RLS +
> fungsi RPC (lihat `supabase-schema.sql`), bukan oleh kerahasiaan key ini.

## Bagian 4 — Mengunggah ke hosting

Paket ini berisi:
```
index.html              ← halaman publik — INI yang tampil kalau domain dibuka tanpa nama file
public.html              ← pengalih otomatis ke index.html (jaga-jaga link lama)
login.html               ← halaman login
admin.html               ← halaman admin (aplikasi utama)
config.js                ← isi URL & anon key Supabase di sini
script_core.js            ← logika aplikasi (JANGAN diganti nama filenya)
supabase-schema.sql       ← sudah dijalankan sekali di Bagian 2
PANDUAN.md                ← file ini
```

Keenam file `index.html`, `public.html`, `login.html`, `admin.html`,
`config.js`, `script_core.js` harus berada **di folder yang sama** pada
hosting Anda (GitHub Pages, Cloudflare Pages, Netlify, dll — sama
seperti sebelumnya).

Setelah live, buka `https://domain-anda/` untuk uji coba (tanpa perlu
ketik nama file apa pun).

---

## Checklist deploy cepat (ikuti urutan ini persis)

Sebagian besar masalah "kok tidak jalan" muncul karena urutannya
kebalik atau ada langkah yang kelewat. Ikuti urutan ini:

- [ ] 1. Buat project Supabase (Bagian 1), **tunggu sampai selesai**
      (status berubah dari "Setting up project" ke dashboard normal)
- [ ] 2. Jalankan `supabase-schema.sql` **sekali penuh** di SQL Editor
      (Bagian 2) — pastikan muncul "Success", bukan pesan error merah
- [ ] 3. Cek di **Table Editor**: tabel `pengaturan` sudah ada 1 baris,
      dan **Storage** sudah ada bucket `lampiran`
- [ ] 4. Isi `config.js` dengan URL + anon key yang **baru disalin ulang**
      dari Settings → API (jangan pakai punya project lama kalau pernah
      bikin lebih dari satu project)
- [ ] 5. Upload 6 file (`index.html`, `public.html`, `login.html`,
      `admin.html`, `config.js`, `script_core.js`) ke **folder yang
      sama** di hosting
- [ ] 6. Buka domain Anda langsung (`https://domain-anda/`, tanpa nama
      file) dulu untuk tes paling ringan — kalau ini sudah
      kosong-tapi-tidak-error, koneksi ke Supabase sudah benar
- [ ] 7. Baru login lewat `login.html` pakai akun default, lalu ganti
      password Bendahara & Kepala Sekolah di menu Pengaturan
- [ ] 8. Coba satu kali unggah logo sekolah — ini sekaligus menguji
      Storage + RPC tiket upload jalan dengan benar

Kalau ada langkah yang gagal, cek bagian **Pemecahan masalah** di
bawah — pesan errornya biasanya menunjuk persis ke langkah mana yang
belum selesai.

---



1. **Buka `index.html`** (atau domain Anda langsung) → pilih ekstrakurikuler & nama siswa dummy
   (kalau belum ada data, akan kosong — wajar, database masih baru).
2. Klik ikon **Masuk** → masuk ke `login.html`.
3. Login pakai `bendahara` / `sikasapa123`.
4. Anda diarahkan ke `admin.html` — coba tambah data Ekstrakurikuler,
   Siswa, Pemasukan, dll. **Buka tab Table Editor di dashboard Supabase**
   dan refresh — data baru akan langsung terlihat di tabel yang sesuai.
5. Klik **Keluar** → kembali ke `index.html`. Coba cari siswa yang tadi
   ditambahkan → riwayat pembayarannya (kalau sudah diinput) akan tampil.
6. Buka menu **Pengaturan** di admin → ganti password Bendahara & Kepala
   Sekolah dari nilai default → coba unggah logo sekolah, cek muncul di
   `index.html` dan di PDF laporan.

---

## Apa yang berubah dari versi Google Spreadsheet

| Hal | Versi Spreadsheet | Versi ini (Supabase) |
|---|---|---|
| Penyimpanan data | Google Spreadsheet | Database Postgres (Supabase) |
| Backend logic | Apps Script (`Code.gs`), dipanggil lewat URL Web App | Fungsi RPC di database, dipanggil lewat `supabase-js` langsung dari browser |
| Login | Dicek di Apps Script, password hash | Dicek di fungsi RPC `login()`, password tetap di-hash (SHA-256 + salt) |
| Logo & bukti pengeluaran | Google Drive | Supabase Storage (bucket `lampiran`, publik untuk dibaca) |
| Sesi login | Token di sheet `Sessions`, 12 jam | Token di tabel `sessions`, 12 jam (sama) |

Semua 7 menu, seluruh fitur (dashboard, filter, cetak laporan PDF, cetak
presensi, ekspor CSV, kelola siswa massal, backup/restore `.json`, dll.)
**tetap ada dan berfungsi sama seperti sebelumnya** — hanya lapisan
penyimpanan datanya yang diganti.

---

## Catatan keamanan (baca sebelum dipakai produksi)

1. **Password di-hash** (SHA-256 + username sebagai penggaram sederhana),
   sama seperti versi lama — cukup untuk skala aplikasi sekolah, tapi
   bukan standar keamanan perbankan. Jangan pakai password yang sama
   dengan akun penting lain.
2. **Sesi login** berlaku 12 jam sejak login (bisa diubah lewat angka
   `43200000` di fungsi `login()` pada `supabase-schema.sql`, lalu
   dijalankan ulang), lalu wajib login ulang.
3. **Kepala Sekolah = mode lihat saja** — aturan ini ditegakkan ulang di
   fungsi RPC `save_all()` di server (bukan cuma disembunyikan di
   tampilan), sama seperti versi lama.
4. **Tabel database dikunci total** dari akses langsung (RLS tanpa
   policy) — satu-satunya jalan masuk/keluar data adalah 6 fungsi RPC
   yang sudah divalidasi. Anon key yang "bocor" tidak otomatis membuka
   akses ke data, karena anon key hanya bisa memanggil fungsi RPC yang
   memang sudah dirancang aman dipanggil publik.5. **Bucket Storage `lampiran`** — upload tetap tervalidasi di server:
   Bendahara yang login minta "tiket" lewat RPC `request_upload_ticket`
   (server cek dulu token & role di situ), baru boleh unggah file ke
   folder bernama tiket tsb (berlaku 5 menit, sekali pakai secara
   praktis). Jadi bukan cuma disembunyikan di tampilan — anon key yang
   bocor tetap tidak bisa upload tanpa lolos cek role Bendahara dulu.

---

## Pemecahan masalah (troubleshooting)

**Halaman putih kosong / "Gagal memuat data dari server"**
→ Cek `config.js`, pastikan `SUPABASE_URL` dan `SUPABASE_ANON_KEY` sudah
diisi dengan benar (bukan teks placeholder). Buka Console browser
(klik kanan → Inspect → Console) untuk lihat pesan error detailnya.

**Login selalu gagal padahal password benar**
→ Pastikan `supabase-schema.sql` sudah dijalankan sekali penuh tanpa
error di SQL Editor (Bagian 2). Cek tabel `pengaturan` di Table Editor,
pastikan ada satu baris dengan `username = bendahara`.

**Data tersimpan di aplikasi tapi tidak muncul di Table Editor**
→ Buka dashboard Supabase → menu **Logs** → **Postgres Logs**, cari
error terkait fungsi `save_all`. Penyebab paling umum: sesi sudah
kedaluwarsa (login ulang) atau login sebagai Kepala Sekolah (memang
tidak boleh menyimpan).

**Gambar/logo tidak muncul di PDF laporan**
→ Pastikan bucket `lampiran` masih ada dan berstatus publik (Storage →
klik bucket `lampiran` → pastikan toggle "Public bucket" menyala).

**Error CORS / "Failed to fetch" di console browser**
→ Biasanya karena `SUPABASE_URL` salah ketik atau ada spasi tersisa.
Coba salin ulang persis dari Settings → API.

---

Kalau ada menu/fitur yang mau ditambah lagi setelah ini (misalnya
notifikasi WhatsApp/email otomatis saat ada pembayaran baru, penguncian
upload file yang lebih ketat pakai Edge Function, atau multi-sekolah),
tinggal lanjutkan dari sini kapan saja.

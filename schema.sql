-- =========================================================
-- SIKasapa — Skema database Cloudflare D1 (SQLite)
-- Jalankan sekali (setelah `npx wrangler d1 create sikasapa-db` &
-- database_id sudah diisi di wrangler.toml) lewat:
--   npx wrangler d1 execute sikasapa-db --remote --file=./schema.sql
-- (atau: npm run db:schema:remote)
--
-- ARSITEKTUR — SATU proyek Cloudflare Worker untuk semuanya:
-- Frontend statis (folder public/) & backend (src/index.js) di-deploy
-- bersamaan lewat satu `npx wrangler deploy`. Semua akses data dari
-- browser HANYA lewat rute /rpc/<nama> di src/index.js (9 fungsi:
-- login, logout, get_app_data, get_public_data, get_public_riwayat,
-- save_all, restore_backup, ambil_nomor_dokumen, catat_log_cetak).
-- D1 sendiri tidak pernah diakses langsung dari browser — hanya
-- Worker yang punya binding ke database ini.
--
-- FILE (logo, bukti pengeluaran): TIDAK PAKAI R2/object storage sama
-- sekali. Gambar disimpan LANGSUNG sebagai data URL base64 di kolom
-- TEXT (pengaturan.logo, pengaturan.publik_logo, pengeluaran.bukti),
-- dikirim & diterima sebagai bagian dari save_all()/restore_backup()
-- biasa. Browser mengecilkan gambar (resize + kompres JPEG) dulu
-- sebelum disimpan, supaya tetap di bawah batas ukuran 1 baris D1
-- (2.000.000 byte) — lihat kompresGambar() di public/script_core.js.
--
-- Mau reset bersih dari nol (bukan migrasi dari versi lain)? Jalankan
-- drop-schema.sql dulu, baru file ini lagi (atau: npm run db:reset:remote).
-- =========================================================

CREATE TABLE IF NOT EXISTS ekskul (
  id TEXT PRIMARY KEY,
  nama TEXT NOT NULL,
  pembina TEXT DEFAULT '',
  jenis_pembayaran TEXT DEFAULT 'pertemuan',
  tarif REAL DEFAULT 0,
  hari_jadwal TEXT DEFAULT '[]',
  warna TEXT DEFAULT '#1769D1'
);

CREATE TABLE IF NOT EXISTS siswa (
  id TEXT PRIMARY KEY,
  nama TEXT NOT NULL,
  kelas TEXT DEFAULT '',
  ekskul_ids TEXT DEFAULT '[]',
  aktif INTEGER DEFAULT 1,
  wali_nama TEXT DEFAULT '',
  wali_hp TEXT DEFAULT ''
);

-- siswa_id sengaja ON DELETE SET NULL (bukan CASCADE) — riwayat
-- pembayaran harus TETAP ADA (untuk Total Saldo & laporan) walau
-- siswanya sudah dihapus dari data induk, cuma namanya jadi "-".
-- Lihat deleteSiswa()/tandaiHapus() di script_core.js dan bug
-- terkait yang dijelaskan panjang lebar di CATATAN-PERBAIKAN.md
-- (bug itu sudah diperbaiki di skema Supabase yang jadi dasar file
-- ini, jadi versi D1 ini langsung memakai desain yang sudah benar).
CREATE TABLE IF NOT EXISTS pemasukan (
  id TEXT PRIMARY KEY,
  siswa_id TEXT REFERENCES siswa(id) ON DELETE SET NULL,
  ekskul_id TEXT REFERENCES ekskul(id) ON DELETE CASCADE,
  jenis TEXT DEFAULT 'pertemuan',
  periode TEXT DEFAULT '',
  nominal REAL DEFAULT 0,
  tanggal_bayar TEXT DEFAULT '',
  keterangan TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS pengeluaran (
  id TEXT PRIMARY KEY,
  ekskul_id TEXT REFERENCES ekskul(id) ON DELETE CASCADE,
  kategori TEXT DEFAULT '',
  nominal REAL DEFAULT 0,
  tanggal TEXT DEFAULT '',
  keterangan TEXT DEFAULT '',
  bukti TEXT
);

CREATE TABLE IF NOT EXISTS kategori_pengeluaran (
  kategori TEXT PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS aktivitas (
  id TEXT PRIMARY KEY,
  waktu TEXT NOT NULL,
  user TEXT DEFAULT '',
  role TEXT DEFAULT '',
  aksi TEXT DEFAULT '',
  detail TEXT DEFAULT ''
);

-- Satu baris saja (id selalu 1) — setara tabel pengaturan Supabase.
CREATE TABLE IF NOT EXISTS pengaturan (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  tahun_ajaran TEXT DEFAULT '2026/2027',
  logo TEXT,
  kepala_sekolah TEXT DEFAULT '',
  nip_kepsek TEXT DEFAULT '',
  bendahara TEXT DEFAULT '',
  nip_bendahara TEXT DEFAULT '',
  username TEXT DEFAULT 'bendahara',
  password_hash TEXT,
  nama_kepsek_akun TEXT DEFAULT '',
  username_kepsek TEXT DEFAULT 'kepsek',
  password_kepsek_hash TEXT,
  publik_nama_web TEXT DEFAULT 'SIKAPASA',
  publik_logo TEXT,
  publik_tagline TEXT DEFAULT 'Sistem Informasi Keuangan Ekstrakurikuler',
  kop_lines TEXT DEFAULT '[{"text":"SDN 01 Papahan","size":14,"bold":true}]',
  -- Nomor urut dokumen resmi (Laporan & Kwitansi), per tahun,
  -- format JSON mis. {"2026": 7} — lihat ambilNomorDokumen() di
  -- src/index.js.
  nomor_laporan_counter TEXT DEFAULT '{}',
  nomor_kwitansi_counter TEXT DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  role TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

-- Rate-limit login di server: kunci akun 12 menit setelah 5x gagal
-- berturut-turut (sama seperti versi Supabase yang sudah diperbaiki).
CREATE TABLE IF NOT EXISTS login_fails (
  username TEXT PRIMARY KEY,
  fails INTEGER NOT NULL DEFAULT 0,
  locked_until INTEGER NOT NULL DEFAULT 0
);

-- ---------------------------------------------------------
-- ISI AWAL (akun default + kategori default) — hanya kalau
-- tabel memang masih kosong.
--
-- Password di bawah SUDAH di-hash pakai PBKDF2-SHA256 (100.000 iterasi,
-- format "pbkdf2$iterasi$salt-base64$hash-base64") untuk 'sikasapa123'
-- (bendahara) dan 'kepsek123' (kepsek). PBKDF2 dipakai (bukan bcrypt)
-- karena dijalankan lewat Web Crypto native di Worker (src/index.js),
-- jauh lebih cepat & ramah batas CPU time Cloudflare Workers dibanding
-- bcrypt murni-JS, dengan ketahanan brute-force offline yang sebanding
-- kalau iterasinya cukup tinggi. GANTI KEDUA PASSWORD DEFAULT INI lewat
-- menu Pengaturan di aplikasi admin segera setelah deploy selesai.
-- ---------------------------------------------------------
INSERT INTO pengaturan (id, username, password_hash, username_kepsek, password_kepsek_hash, bendahara, nama_kepsek_akun)
SELECT 1,
  'bendahara', 'pbkdf2$100000$O/C/kjaF2GVjr/Y4uSRz7g==$WX7EGTciSAuQNf293MlVnKK8sH/6hlL284EVJBqJvTg=',
  'kepsek', 'pbkdf2$100000$67f+qkF9ktApKVoBmlMZvA==$Y/y4r4ejA76xlb2odqqZVR7M/3KRTFmosC8bdVGJ680=',
  'Bendahara', 'Kepala Sekolah'
WHERE NOT EXISTS (SELECT 1 FROM pengaturan WHERE id = 1);

INSERT INTO kategori_pengeluaran (kategori)
SELECT k FROM (
  SELECT 'Peralatan' AS k UNION ALL SELECT 'Transport Lomba' UNION ALL SELECT 'Konsumsi'
  UNION ALL SELECT 'Seragam' UNION ALL SELECT 'Piala/Penghargaan' UNION ALL SELECT 'Lainnya'
)
WHERE NOT EXISTS (SELECT 1 FROM kategori_pengeluaran LIMIT 1);

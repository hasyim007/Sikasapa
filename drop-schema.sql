-- =========================================================
-- SIKasapa — Hapus SEMUA tabel (reset bersih).
-- Dipakai kalau setup awal salah/berantakan dan mau mulai dari nol
-- lagi, TANPA harus bikin database D1 baru. SELURUH DATA HILANG.
--
-- Jalankan lewat:
--   npx wrangler d1 execute sikasapa-db --remote --file=./drop-schema.sql
-- lalu jalankan ulang schema.sql:
--   npx wrangler d1 execute sikasapa-db --remote --file=./schema.sql
-- (atau langsung: npm run db:reset:remote, yang menjalankan dua
-- perintah di atas berurutan)
-- =========================================================

DROP TABLE IF EXISTS aktivitas;
DROP TABLE IF EXISTS pengeluaran;
DROP TABLE IF EXISTS pemasukan;
DROP TABLE IF EXISTS kategori_pengeluaran;
DROP TABLE IF EXISTS siswa;
DROP TABLE IF EXISTS ekskul;
DROP TABLE IF EXISTS login_fails;
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS pengaturan;

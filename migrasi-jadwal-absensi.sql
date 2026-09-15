-- =========================================================
-- Migrasi: tambah kolom jadwal hari latihan ke ekstra_absensi
--
-- Diperlukan supaya menu "Kelola Absensi" (guru ekstra) bisa mencetak
-- lembar presensi bulanan yang tanggalnya otomatis mengikuti hari
-- latihan ekstrakurikuler tsb — SINKRON dengan status kehadiran yang
-- sudah diisi guru lewat "Kelola Absensi" (bukan lembar kosong lagi
-- seperti "Cetak Presensi" untuk ekskul berbayar).
--
-- Jalankan SEKALI setelah update kode ini, lewat:
--   npx wrangler d1 execute sikasapa-db --remote --file=./migrasi-jadwal-absensi.sql
-- (aman dijalankan berkali-kali — IF NOT EXISTS tidak didukung untuk
-- ADD COLUMN di SQLite, jadi migrasi ini dibungkus supaya tidak error
-- kalau kolomnya sudah pernah ditambahkan).
-- =========================================================

ALTER TABLE ekstra_absensi ADD COLUMN hari_jadwal TEXT DEFAULT '[]';

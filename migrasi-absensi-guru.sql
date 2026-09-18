-- =========================================================
-- MIGRASI: tabel `absensi_guru` (fitur "Guru Ekstra wajib absen dulu
-- sebelum mengisi absensi siswa" + tercetak di lembar Presensi).
--
-- Jalankan SEKALI SAJA kalau database Anda sudah dibuat SEBELUM fitur
-- ini ada:
--   npx wrangler d1 execute sikasapa-db --remote --file=./migrasi-absensi-guru.sql
--
-- Ini cuma MENAMBAH satu tabel baru — tidak mengubah/menghapus data
-- yang sudah ada sama sekali. Kalau baru deploy dari nol dengan
-- schema.sql versi terbaru, migrasi ini tidak perlu (tabelnya sudah
-- otomatis ikut dibuat oleh schema.sql).
-- =========================================================

CREATE TABLE IF NOT EXISTS absensi_guru (
  id TEXT PRIMARY KEY,
  ekstra_id TEXT REFERENCES ekstra_absensi(id) ON DELETE CASCADE,
  guru_id TEXT REFERENCES guru_ekstra(id) ON DELETE SET NULL,
  guru_nama TEXT DEFAULT '',
  tanggal TEXT NOT NULL,
  status TEXT DEFAULT 'hadir',
  catatan TEXT DEFAULT ''
);

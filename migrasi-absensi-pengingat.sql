-- =========================================================
-- MIGRASI — Fitur "Pengingat Pembayaran (WhatsApp)" & "Kelola Absensi"
-- (guru ekstrakurikuler). Jalankan SEKALI SAJA kalau database Anda
-- sudah dibuat SEBELUM fitur ini ada:
--   npx wrangler d1 execute sikasapa-db --remote --file=./migrasi-absensi-pengingat.sql
-- Tidak menghapus data apa pun — hanya menambah kolom & tabel baru.
-- Kalau baru deploy dari nol dengan schema.sql versi terbaru, migrasi
-- ini TIDAK PERLU dijalankan (semua sudah ada dari awal).
-- =========================================================

ALTER TABLE siswa ADD COLUMN ekstra_absensi_ids TEXT DEFAULT '[]';

ALTER TABLE pengaturan ADD COLUMN template_wa_bulanan TEXT DEFAULT 'Assalamu''alaikum Bapak/Ibu wali dari ananda {namaSiswa} ({kelas}), mohon izin mengingatkan bahwa iuran ekstrakurikuler {ekskul} untuk bulan {daftarBulan} sebesar {totalTunggakan} belum kami terima. Kami mohon kesediaan Bapak/Ibu untuk berkenan melakukan pembayaran secepatnya. Atas perhatian dan kerja samanya, kami ucapkan terima kasih. Wassalamu''alaikum warahmatullahi wabarakatuh.';
ALTER TABLE pengaturan ADD COLUMN template_wa_pertemuan TEXT DEFAULT 'Assalamu''alaikum Bapak/Ibu wali dari ananda {namaSiswa} ({kelas}), mohon izin mengingatkan bahwa iuran ekstrakurikuler {ekskul} per pertemuan masih kurang {jumlahPertemuanKurang}x pertemuan (estimasi {totalTunggakan}) pada bulan {daftarBulan}. Kami mohon kesediaan Bapak/Ibu untuk berkenan melakukan pembayaran secepatnya. Atas perhatian dan kerja samanya, kami ucapkan terima kasih. Wassalamu''alaikum warahmatullahi wabarakatuh.';

ALTER TABLE sessions ADD COLUMN ref_id TEXT;

CREATE TABLE IF NOT EXISTS ekstra_absensi (
  id TEXT PRIMARY KEY,
  nama TEXT NOT NULL,
  keterangan TEXT DEFAULT '',
  warna TEXT DEFAULT '#1769D1'
);

CREATE TABLE IF NOT EXISTS guru_ekstra (
  id TEXT PRIMARY KEY,
  nama TEXT NOT NULL,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT,
  ekstra_ids TEXT DEFAULT '[]',
  aktif INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS absensi (
  id TEXT PRIMARY KEY,
  ekstra_id TEXT REFERENCES ekstra_absensi(id) ON DELETE CASCADE,
  siswa_id TEXT REFERENCES siswa(id) ON DELETE SET NULL,
  tanggal TEXT NOT NULL,
  status TEXT DEFAULT 'hadir',
  catatan TEXT DEFAULT '',
  dicatat_oleh TEXT DEFAULT ''
);

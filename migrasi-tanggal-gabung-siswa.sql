-- Migrasi: tambah kolom "Tanggal Gabung" per siswa, dipakai sebagai
-- fallback penentu sejak kapan siswa wajib bayar iuran kalau dia
-- belum pernah punya riwayat pembayaran/absensi sama sekali di suatu
-- ekskul (lihat menu Tunggakan & Data Siswa > form siswa). Jalankan
-- SEKALI di database yang sudah ada (database baru sudah dapat kolom
-- ini otomatis lewat schema.sql). Aman dijalankan ulang: D1/SQLite
-- akan menolak dengan error "duplicate column name" kalau sudah
-- pernah dijalankan — abaikan saja error itu.
ALTER TABLE siswa ADD COLUMN tanggal_gabung TEXT DEFAULT NULL;

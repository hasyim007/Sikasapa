-- Migrasi: konten hero halaman publik jadi bisa diubah lewat menu admin
-- "Halaman Publik", bukan hardcode lagi di public/index.html. Jalankan
-- SEKALI di database yang sudah ada (database baru sudah dapat kolom ini
-- otomatis lewat schema.sql). Aman dijalankan ulang: D1/SQLite akan
-- menolak dengan error "duplicate column name" kalau sudah pernah
-- dijalankan — abaikan saja error itu.
ALTER TABLE pengaturan ADD COLUMN publik_eyebrow TEXT DEFAULT 'Layanan Wali Murid';
ALTER TABLE pengaturan ADD COLUMN publik_headline1 TEXT DEFAULT 'Pembayaran';
ALTER TABLE pengaturan ADD COLUMN publik_headline2 TEXT DEFAULT 'Ekstrakurikuler';
ALTER TABLE pengaturan ADD COLUMN publik_deskripsi TEXT DEFAULT '';
ALTER TABLE pengaturan ADD COLUMN publik_chip1 TEXT DEFAULT 'Data Aman & Resmi Sekolah';
ALTER TABLE pengaturan ADD COLUMN publik_chip2 TEXT DEFAULT 'Hasil Real-time';
ALTER TABLE pengaturan ADD COLUMN publik_chip3 TEXT DEFAULT 'Tanpa Perlu Aplikasi';

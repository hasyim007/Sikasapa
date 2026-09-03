/* =========================================================
   SIKasapa — Cloudflare Worker (backend API + penyaji frontend)

   SATU proyek Worker untuk semuanya:
   - Folder public/ (index.html/login.html/admin.html/script_core.js)
     disajikan otomatis oleh Cloudflare lewat konfigurasi [assets] di
     wrangler.toml — Worker ini TIDAK perlu kode khusus untuk itu.
   - File ini (src/index.js) HANYA menangani API-nya: rute /rpc/<nama>
     (9 fungsi, pengganti PERSIS RPC yang dulu di Postgres/Supabase:
     login, logout, get_app_data, get_public_data, get_public_riwayat,
     save_all, restore_backup, ambil_nomor_dokumen, catat_log_cetak)
     dan /health. wrangler.toml men-set run_worker_first untuk kedua
     rute itu supaya selalu masuk ke sini duluan, bukan dicoba sebagai
     file statis dulu.
   - Karena public/ & Worker ini di-deploy BERSAMAAN (satu domain
     workers.dev/custom domain yang sama), browser cukup fetch('/rpc/...')
     dengan path relatif — tidak perlu CORS atau URL server terpisah.
   - Database asli (D1) hanya bisa diakses lewat binding `env.DB`,
     yang cuma dipunyai Worker ini — jadi secara desain tertutup
     total dari browser, sama seperti RLS-tanpa-policy di versi
     Supabase. Validasi token & role tetap terjadi di sini (di
     "server"), sama seperti prinsip SECURITY DEFINER di Postgres.
   - TIDAK ADA R2/object storage sama sekali. File (logo, bukti
     pengeluaran) disimpan LANGSUNG sebagai data URL base64 di
     kolom TEXT lewat save_all()/restore_backup() biasa — lihat
     cekUkuranGambar() di bawah. Browser sudah mengecilkan
     gambarnya dulu (lihat kompresGambar() di script_core.js).
   ========================================================= */

/* D1 membatasi ukuran 1 baris/kolom TEXT ke 2.000.000 byte. Batasi
   tiap data URL gambar jauh di bawah itu (lewat request body JSON
   yang bawa SELURUH data tiap kali save_all dipanggil, bukan cuma
   yang berubah), supaya satu foto bukti yang kebesaran tidak bikin
   permintaan gagal membingungkan di tengah jalan. */
const MAX_GAMBAR_BYTES = 1500000; // ~1.5 MB data URL (base64)
function cekUkuranGambar(dataUrl, label) {
  if (!dataUrl) return null;
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) return null; // URL lama (mis. hasil migrasi) dibiarkan
  if (dataUrl.length > MAX_GAMBAR_BYTES) {
    return `${label} terlalu besar (${Math.round(dataUrl.length / 1024)} KB). Gunakan gambar yang lebih kecil.`;
  }
  return null;
}

const ROLE_BENDAHARA = 'bendahara';
const ROLE_KEPSEK = 'kepsek';
const PBKDF2_ITERATIONS = 100000;
const SESSION_MS_DEFAULT = 43200000; // 12 jam, sama seperti versi Supabase
const LOCK_MS = 720000; // 12 menit, sama seperti versi Supabase
const MAX_FAILS = 5;
const AKTIVITAS_LIMIT = 500;

/* =========================================================
   UTIL — password (PBKDF2-SHA256 lewat Web Crypto native).
   PBKDF2 dipakai (bukan bcrypt) karena Web Crypto berjalan native
   di Worker (bukan JS murni), jauh lebih ramah batas CPU time
   Cloudflare Workers dibanding bcrypt, dengan ketahanan brute-force
   offline yang sebanding pada iterasi tinggi.
   ========================================================= */
function bytesToB64(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}
function b64ToBytes(str) {
  return Uint8Array.from(atob(str), (c) => c.charCodeAt(0));
}
async function pbkdf2(password, saltBytes, iterations) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), { name: 'PBKDF2' }, false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: saltBytes, iterations, hash: 'SHA-256' }, keyMaterial, 256);
  return new Uint8Array(bits);
}
async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${bytesToB64(salt)}$${bytesToB64(hash)}`;
}
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
async function verifyPassword(password, stored) {
  if (!password || !stored) return false;
  const parts = String(stored).split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
  const iterations = parseInt(parts[1], 10);
  const salt = b64ToBytes(parts[2]);
  const expected = b64ToBytes(parts[3]);
  const actual = await pbkdf2(password, salt, iterations);
  return timingSafeEqual(actual, expected);
}

/* Tahun berjalan di zona waktu Asia/Jakarta (WIB) — dipakai untuk
   nomor dokumen (Laporan/Kwitansi), supaya selalu konsisten dengan
   bagian "bulan" (romawi) yang diformat di browser dari jam lokal
   pengguna sekolah. Tanpa ini ada jendela singkat tiap akhir tahun
   di mana UTC & WIB beda tahun. Lihat CATATAN-PERBAIKAN.md. */
function tahunJakarta() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric' }).format(new Date());
}
function waktuIso() {
  return new Date().toISOString();
}
function safeJsonParse(text, fallback) {
  if (text === null || text === undefined) return fallback;
  try { return JSON.parse(text); } catch (e) { return fallback; }
}

/* =========================================================
   SESI
   ========================================================= */
async function cekSesi(db, token) {
  const now = Date.now();
  await db.prepare('DELETE FROM sessions WHERE expires_at <= ?').bind(now).run();
  if (!token) return null;
  const row = await db.prepare('SELECT role FROM sessions WHERE token = ?').bind(token).first();
  return row ? row.role : null;
}

async function catatAktivitas(db, user, role, aksi, detail) {
  await db.prepare('INSERT INTO aktivitas(id, waktu, user, role, aksi, detail) VALUES (?,?,?,?,?,?)')
    .bind(crypto.randomUUID(), waktuIso(), user || '', role || '', aksi || '', detail || '').run();
}

async function trimAktivitas(db) {
  await db.prepare(`DELETE FROM aktivitas WHERE id NOT IN (SELECT id FROM aktivitas ORDER BY waktu DESC LIMIT ${AKTIVITAS_LIMIT})`).run();
}

/* =========================================================
   LOGIN / LOGOUT
   Rate-limit login di server: kunci akun 12 menit setelah 5x gagal
   berturut-turut — sama seperti versi Supabase (login_fails).
   ========================================================= */
async function login(env, username, password) {
  const db = env.DB;
  if (!username || !password) {
    return { ok: false, error: 'Username dan password wajib diisi.' };
  }
  const now = Date.now();
  const lf = await db.prepare('SELECT * FROM login_fails WHERE username = ?').bind(username).first();
  if (lf && lf.locked_until > now) {
    const menit = Math.ceil((lf.locked_until - now) / 60000);
    return { ok: false, error: `Terlalu banyak percobaan gagal untuk akun ini. Coba lagi dalam ${menit} menit.` };
  }

  const pg = await db.prepare('SELECT * FROM pengaturan WHERE id = 1').first();
  let role = null, nama = null, ok = false;
  if (pg) {
    if (username === pg.username && pg.password_hash && await verifyPassword(password, pg.password_hash)) {
      role = ROLE_BENDAHARA; nama = pg.bendahara || 'Bendahara'; ok = true;
    } else if (username === pg.username_kepsek && pg.password_kepsek_hash && await verifyPassword(password, pg.password_kepsek_hash)) {
      role = ROLE_KEPSEK; nama = pg.nama_kepsek_akun || 'Kepala Sekolah'; ok = true;
    }
  }

  if (!ok) {
    let failsBefore = 0;
    if (lf && !(lf.locked_until > 0 && lf.locked_until <= now)) failsBefore = lf.fails;
    const newFails = failsBefore + 1;
    const fails = newFails >= MAX_FAILS ? 0 : newFails;
    const lockedUntil = newFails >= MAX_FAILS ? now + LOCK_MS : 0;
    await db.prepare(`INSERT INTO login_fails(username, fails, locked_until) VALUES (?,?,?)
      ON CONFLICT(username) DO UPDATE SET fails=excluded.fails, locked_until=excluded.locked_until`)
      .bind(username, fails, lockedUntil).run();
    return { ok: false, error: 'Username atau password salah.' };
  }

  await db.prepare('DELETE FROM login_fails WHERE username = ?').bind(username).run();

  const token = crypto.randomUUID() + '-' + crypto.randomUUID();
  const sessionMs = Number(env.SESI_LAMA_MS) || SESSION_MS_DEFAULT;
  await db.prepare('INSERT INTO sessions(token, role, created_at, expires_at) VALUES (?,?,?,?)')
    .bind(token, role, now, now + sessionMs).run();
  await catatAktivitas(db, nama, role, 'Login',
    (role === ROLE_KEPSEK ? 'Kepala Sekolah' : 'Bendahara Sekolah') + ' masuk ke aplikasi.');

  return { ok: true, role, token, nama };
}

async function logout(env, token) {
  const db = env.DB;
  const row = await db.prepare('SELECT role FROM sessions WHERE token = ?').bind(token).first();
  if (row) {
    await db.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
    const label = row.role === ROLE_KEPSEK ? 'Kepala Sekolah' : 'Bendahara Sekolah';
    await catatAktivitas(db, '-', row.role, 'Logout', label + ' keluar dari aplikasi.');
  }
  return { ok: true };
}

/* =========================================================
   BACA DATA — DASHBOARD ADMIN (butuh token, role apa saja)
   ========================================================= */
async function getAppData(env, token) {
  const db = env.DB;
  const role = await cekSesi(db, token);
  if (!role) return { ok: false, error: 'Sesi tidak valid atau sudah kedaluwarsa. Silakan login ulang.' };

  const pg = await db.prepare('SELECT * FROM pengaturan WHERE id = 1').first();
  const [ekskul, siswa, pemasukan, pengeluaran, kategori, aktivitas] = await Promise.all([
    db.prepare('SELECT * FROM ekskul').all(),
    db.prepare('SELECT * FROM siswa').all(),
    db.prepare('SELECT * FROM pemasukan').all(),
    db.prepare('SELECT * FROM pengeluaran').all(),
    db.prepare('SELECT kategori FROM kategori_pengeluaran').all(),
    db.prepare('SELECT * FROM aktivitas ORDER BY waktu DESC').all(),
  ]);

  return {
    ok: true,
    db: {
      ekskul: ekskul.results.map((r) => ({
        id: r.id, nama: r.nama, pembina: r.pembina, jenisPembayaran: r.jenis_pembayaran,
        tarif: r.tarif, hariJadwal: safeJsonParse(r.hari_jadwal, []), warna: r.warna,
      })),
      siswa: siswa.results.map((r) => ({
        id: r.id, nama: r.nama, kelas: r.kelas, ekskulIds: safeJsonParse(r.ekskul_ids, []),
        aktif: !!r.aktif, waliNama: r.wali_nama, waliHp: r.wali_hp,
      })),
      pemasukan: pemasukan.results.map((r) => ({
        id: r.id, siswaId: r.siswa_id, ekskulId: r.ekskul_id, jenis: r.jenis, periode: r.periode,
        nominal: r.nominal, tanggalBayar: r.tanggal_bayar, keterangan: r.keterangan,
      })),
      pengeluaran: pengeluaran.results.map((r) => ({
        id: r.id, ekskulId: r.ekskul_id, kategori: r.kategori, nominal: r.nominal,
        tanggal: r.tanggal, keterangan: r.keterangan, bukti: r.bukti,
      })),
      kategoriPengeluaran: kategori.results.map((r) => r.kategori),
      aktivitas: aktivitas.results.map((r) => ({
        id: r.id, waktu: r.waktu, user: r.user, role: r.role, aksi: r.aksi, detail: r.detail,
      })),
      pengaturan: {
        tahunAjaran: pg.tahun_ajaran, logo: pg.logo, kepalaSekolah: pg.kepala_sekolah,
        nipKepsek: pg.nip_kepsek, bendahara: pg.bendahara, nipBendahara: pg.nip_bendahara,
        username: pg.username, usernameKepsek: pg.username_kepsek, namaKepsekAkun: pg.nama_kepsek_akun,
        publikNamaWeb: pg.publik_nama_web, publikLogo: pg.publik_logo, publikTagline: pg.publik_tagline,
        kopLines: safeJsonParse(pg.kop_lines, []),
        nomorLaporanCounter: safeJsonParse(pg.nomor_laporan_counter, {}),
        nomorKwitansiCounter: safeJsonParse(pg.nomor_kwitansi_counter, {}),
      },
    },
  };
}

/* =========================================================
   BACA DATA — HALAMAN PUBLIK (tanpa login)
   ========================================================= */
async function getPublicData(env) {
  const db = env.DB;
  const pg = await db.prepare('SELECT * FROM pengaturan WHERE id = 1').first();
  const [ekskul, siswa] = await Promise.all([
    db.prepare('SELECT * FROM ekskul').all(),
    db.prepare('SELECT * FROM siswa WHERE aktif = 1').all(),
  ]);
  return {
    ok: true,
    db: {
      ekskul: ekskul.results.map((r) => ({
        id: r.id, nama: r.nama, jenisPembayaran: r.jenis_pembayaran, tarif: r.tarif,
        hariJadwal: safeJsonParse(r.hari_jadwal, []),
      })),
      siswa: siswa.results.map((r) => ({
        id: r.id, nama: r.nama, kelas: r.kelas, ekskulIds: safeJsonParse(r.ekskul_ids, []), aktif: true,
      })),
      pemasukan: [], pengeluaran: [], kategoriPengeluaran: [], aktivitas: [],
      pengaturan: {
        kopLines: safeJsonParse(pg.kop_lines, []), publikNamaWeb: pg.publik_nama_web,
        publikLogo: pg.publik_logo, publikTagline: pg.publik_tagline,
      },
    },
  };
}

async function getPublicRiwayat(env, siswaId, ekskulId) {
  if (!siswaId || !ekskulId) return { ok: false, error: 'Data tidak lengkap.' };
  const rows = await env.DB.prepare(
    'SELECT periode, nominal, tanggal_bayar, keterangan FROM pemasukan WHERE siswa_id = ? AND ekskul_id = ?'
  ).bind(siswaId, ekskulId).all();
  return {
    ok: true,
    riwayat: rows.results.map((r) => ({
      periode: r.periode, nominal: r.nominal, tanggalBayar: r.tanggal_bayar, keterangan: r.keterangan,
    })),
  };
}

/* =========================================================
   Helper bersama save_all() & restore_backup(): update baris
   pengaturan dari objek `pg` yang dikirim browser, TANPA PERNAH
   menyentuh nomor_laporan_counter/nomor_kwitansi_counter (itu
   HANYA boleh diubah oleh ambilNomorDokumen(), lihat catatan di
   CATATAN-PERBAIKAN.md — mencegah nomor dokumen dobel).
   ========================================================= */
async function updatePengaturanDariClient(db, pg, cur) {
  pg = pg || {};
  const errLogo = cekUkuranGambar(pg.logo, 'Logo laporan');
  if (errLogo) throw new Error(errLogo);
  const errPublikLogo = cekUkuranGambar(pg.publikLogo, 'Logo halaman publik');
  if (errPublikLogo) throw new Error(errPublikLogo);

  let passwordHash = cur.password_hash;
  if (pg.password) passwordHash = await hashPassword(pg.password);
  let passwordKepsekHash = cur.password_kepsek_hash;
  if (pg.passwordKepsek) passwordKepsekHash = await hashPassword(pg.passwordKepsek);

  await db.prepare(`UPDATE pengaturan SET
      tahun_ajaran=?, logo=?, kepala_sekolah=?, nip_kepsek=?, bendahara=?, nip_bendahara=?,
      username=?, password_hash=?, nama_kepsek_akun=?, username_kepsek=?, password_kepsek_hash=?,
      publik_nama_web=?, publik_logo=?, publik_tagline=?, kop_lines=?
    WHERE id = 1`).bind(
    pg.tahunAjaran || '', pg.logo || null, pg.kepalaSekolah || '', pg.nipKepsek || '',
    pg.bendahara || '', pg.nipBendahara || '',
    pg.username || cur.username, passwordHash,
    pg.namaKepsekAkun || '', pg.usernameKepsek || cur.username_kepsek, passwordKepsekHash,
    pg.publikNamaWeb || 'SIKAPASA', pg.publikLogo || null,
    pg.publikTagline || 'Sistem Informasi Keuangan Ekstrakurikuler',
    JSON.stringify(pg.kopLines || safeJsonParse(cur.kop_lines, [])),
  ).run();
}

/* =========================================================
   SIMPAN PERUBAHAN DATA — UPSERT per baris, hanya role bendahara.
   Penghapusan HANYA untuk id yang eksplisit ada di p_data.hapus
   (diisi oleh tandaiHapus() di script_core.js). Tabel aktivitas
   TIDAK PERNAH dihapus di sini (insert-if-not-exists saja), lalu
   dipangkas ke 500 baris terbaru. Lihat penjelasan panjang di
   CATATAN-PERBAIKAN.md ("Bug akar dari semuanya").
   ========================================================= */
async function saveAll(env, token, data) {
  const db = env.DB;
  const role = await cekSesi(db, token);
  if (!role) return { ok: false, error: 'Sesi tidak valid, silakan login ulang.' };
  if (role !== ROLE_BENDAHARA) return { ok: false, error: 'Hanya akun Bendahara yang bisa menyimpan perubahan.' };
  if (!data) return { ok: false, error: 'Data tidak valid.' };

  const hapus = data.hapus || {};

  // Validasi ukuran SEMUA gambar dulu, SEBELUM batch tulis apa pun
  // dijalankan — supaya satu foto kebesaran gagal dengan bersih tanpa
  // menyisakan sebagian perubahan lain sudah tersimpan.
  const errPengaturanLogo = cekUkuranGambar((data.pengaturan || {}).logo, 'Logo laporan');
  if (errPengaturanLogo) return { ok: false, error: errPengaturanLogo };
  const errPengaturanPublikLogo = cekUkuranGambar((data.pengaturan || {}).publikLogo, 'Logo halaman publik');
  if (errPengaturanPublikLogo) return { ok: false, error: errPengaturanPublikLogo };
  for (const r of (data.pengeluaran || [])) {
    const errBukti = cekUkuranGambar(r.bukti, `Bukti pengeluaran "${r.keterangan || r.id}"`);
    if (errBukti) return { ok: false, error: errBukti };
  }

  // 1) EKSKUL & SISWA dulu (supaya pemasukan/pengeluaran bisa dicek
  //    rujukannya terhadap data TERBARU, bukan array yang mungkin basi).
  const batch1 = [];
  for (const r of (data.ekskul || [])) {
    batch1.push(db.prepare(`INSERT INTO ekskul(id,nama,pembina,jenis_pembayaran,tarif,hari_jadwal,warna) VALUES (?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET nama=excluded.nama, pembina=excluded.pembina, jenis_pembayaran=excluded.jenis_pembayaran,
        tarif=excluded.tarif, hari_jadwal=excluded.hari_jadwal, warna=excluded.warna`)
      .bind(r.id, r.nama, r.pembina || '', r.jenisPembayaran || 'pertemuan', Number(r.tarif) || 0,
        JSON.stringify(r.hariJadwal || []), r.warna || '#1769D1'));
  }
  // Menghapus ekskul ikut menghapus pemasukan/pengeluaran-nya (FK ON DELETE CASCADE),
  // sama seperti versi Supabase — tidak perlu didaftar terpisah di hapus.pemasukan/pengeluaran.
  for (const id of (hapus.ekskul || [])) batch1.push(db.prepare('DELETE FROM ekskul WHERE id = ?').bind(id));

  for (const r of (data.siswa || [])) {
    batch1.push(db.prepare(`INSERT INTO siswa(id,nama,kelas,ekskul_ids,aktif,wali_nama,wali_hp) VALUES (?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET nama=excluded.nama, kelas=excluded.kelas, ekskul_ids=excluded.ekskul_ids,
        aktif=excluded.aktif, wali_nama=excluded.wali_nama, wali_hp=excluded.wali_hp`)
      .bind(r.id, r.nama, r.kelas || '', JSON.stringify(r.ekskulIds || []),
        r.aktif === false ? 0 : 1, r.waliNama || '', r.waliHp || ''));
  }
  // siswa_id di pemasukan ON DELETE SET NULL — riwayat pembayaran siswa yang
  // dihapus TETAP ADA, cuma siswa_id-nya jadi null (lihat skema).
  for (const id of (hapus.siswa || [])) batch1.push(db.prepare('DELETE FROM siswa WHERE id = ?').bind(id));

  if (batch1.length) await db.batch(batch1);

  // 2) PEMASUKAN & PENGELUARAN — siswa_id/ekskul_id di-null-kan kalau
  //    rujukannya sudah tidak ada SAMA SEKALI di database (dicek terhadap
  //    tabel yang baru saja di-upsert di atas).
  const batch2 = [];
  for (const r of (data.pemasukan || [])) {
    const siswaAda = r.siswaId ? await db.prepare('SELECT 1 FROM siswa WHERE id = ?').bind(r.siswaId).first() : null;
    const ekskulAda = r.ekskulId ? await db.prepare('SELECT 1 FROM ekskul WHERE id = ?').bind(r.ekskulId).first() : null;
    batch2.push(db.prepare(`INSERT INTO pemasukan(id,siswa_id,ekskul_id,jenis,periode,nominal,tanggal_bayar,keterangan) VALUES (?,?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET siswa_id=excluded.siswa_id, ekskul_id=excluded.ekskul_id, jenis=excluded.jenis,
        periode=excluded.periode, nominal=excluded.nominal, tanggal_bayar=excluded.tanggal_bayar, keterangan=excluded.keterangan`)
      .bind(r.id, siswaAda ? r.siswaId : null, ekskulAda ? r.ekskulId : null, r.jenis || 'pertemuan',
        r.periode || '', Number(r.nominal) || 0, r.tanggalBayar || '', r.keterangan || ''));
  }
  for (const id of (hapus.pemasukan || [])) batch2.push(db.prepare('DELETE FROM pemasukan WHERE id = ?').bind(id));

  for (const r of (data.pengeluaran || [])) {
    const ekskulAda = r.ekskulId ? await db.prepare('SELECT 1 FROM ekskul WHERE id = ?').bind(r.ekskulId).first() : null;
    batch2.push(db.prepare(`INSERT INTO pengeluaran(id,ekskul_id,kategori,nominal,tanggal,keterangan,bukti) VALUES (?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET ekskul_id=excluded.ekskul_id, kategori=excluded.kategori, nominal=excluded.nominal,
        tanggal=excluded.tanggal, keterangan=excluded.keterangan, bukti=excluded.bukti`)
      .bind(r.id, ekskulAda ? r.ekskulId : null, r.kategori || '', Number(r.nominal) || 0,
        r.tanggal || '', r.keterangan || '', r.bukti || null));
  }
  for (const id of (hapus.pengeluaran || [])) batch2.push(db.prepare('DELETE FROM pengeluaran WHERE id = ?').bind(id));

  for (const k of (data.kategoriPengeluaran || [])) {
    batch2.push(db.prepare('INSERT INTO kategori_pengeluaran(kategori) VALUES (?) ON CONFLICT(kategori) DO NOTHING').bind(k));
  }
  for (const k of (hapus.kategoriPengeluaran || [])) {
    batch2.push(db.prepare('DELETE FROM kategori_pengeluaran WHERE kategori = ?').bind(k));
  }

  // AKTIVITAS: insert-kalau-belum-ada saja — TIDAK PERNAH dihapus di sini,
  // supaya log dari sesi lain (mis. catat_log_cetak dari Kepsek) tidak
  // ikut terhapus oleh simpanan yang salinan lokalnya belum tahu soal itu.
  for (const r of (data.aktivitas || [])) {
    batch2.push(db.prepare('INSERT INTO aktivitas(id,waktu,user,role,aksi,detail) VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING')
      .bind(r.id, r.waktu, r.user || '', r.role || '', r.aksi || '', r.detail || ''));
  }

  if (batch2.length) await db.batch(batch2);
  await trimAktivitas(db);

  // Pengaturan — password hanya diganti kalau field 'password'/'passwordKepsek'
  // benar-benar dikirim. Counter nomor dokumen SENGAJA tidak disentuh di sini.
  const cur = await db.prepare('SELECT * FROM pengaturan WHERE id = 1').first();
  await updatePengaturanDariClient(db, data.pengaturan, cur);

  return { ok: true };
}

/* =========================================================
   PULIHKAN DARI BACKUP — hapus-lalu-tulis-ulang (sengaja beda dari
   save_all yang UPSERT-saja), dipanggil hanya lewat restoreDB() di
   script_core.js setelah konfirmasi eksplisit pengguna.
   ========================================================= */
async function restoreBackup(env, token, data) {
  const db = env.DB;
  const role = await cekSesi(db, token);
  if (!role) return { ok: false, error: 'Sesi tidak valid, silakan login ulang.' };
  if (role !== ROLE_BENDAHARA) return { ok: false, error: 'Hanya akun Bendahara yang bisa memulihkan backup.' };
  if (!data) return { ok: false, error: 'Data tidak valid.' };

  // Validasi ukuran SEMUA gambar dulu, SEBELUM tabel dikosongkan —
  // supaya backup yang punya satu foto kebesaran gagal dengan bersih
  // (data lama tetap utuh), bukan malah mengosongkan tabel duluan lalu
  // baru ketahuan gagal di tengah jalan.
  const errPengaturanLogo = cekUkuranGambar((data.pengaturan || {}).logo, 'Logo laporan');
  if (errPengaturanLogo) return { ok: false, error: errPengaturanLogo };
  const errPengaturanPublikLogo = cekUkuranGambar((data.pengaturan || {}).publikLogo, 'Logo halaman publik');
  if (errPengaturanPublikLogo) return { ok: false, error: errPengaturanPublikLogo };
  for (const r of (data.pengeluaran || [])) {
    const errBukti = cekUkuranGambar(r.bukti, `Bukti pengeluaran "${r.keterangan || r.id}"`);
    if (errBukti) return { ok: false, error: errBukti };
  }

  await db.batch([
    db.prepare('DELETE FROM ekskul'),
    db.prepare('DELETE FROM siswa'),
    db.prepare('DELETE FROM pemasukan'),
    db.prepare('DELETE FROM pengeluaran'),
    db.prepare('DELETE FROM kategori_pengeluaran'),
    db.prepare('DELETE FROM aktivitas'),
  ]);

  const batch1 = [];
  for (const r of (data.ekskul || [])) {
    batch1.push(db.prepare('INSERT INTO ekskul(id,nama,pembina,jenis_pembayaran,tarif,hari_jadwal,warna) VALUES (?,?,?,?,?,?,?)')
      .bind(r.id, r.nama, r.pembina || '', r.jenisPembayaran || 'pertemuan', Number(r.tarif) || 0,
        JSON.stringify(r.hariJadwal || []), r.warna || '#1769D1'));
  }
  for (const r of (data.siswa || [])) {
    batch1.push(db.prepare('INSERT INTO siswa(id,nama,kelas,ekskul_ids,aktif,wali_nama,wali_hp) VALUES (?,?,?,?,?,?,?)')
      .bind(r.id, r.nama, r.kelas || '', JSON.stringify(r.ekskulIds || []),
        r.aktif === false ? 0 : 1, r.waliNama || '', r.waliHp || ''));
  }
  if (batch1.length) await db.batch(batch1);

  const batch2 = [];
  for (const r of (data.pemasukan || [])) {
    const siswaAda = r.siswaId ? await db.prepare('SELECT 1 FROM siswa WHERE id = ?').bind(r.siswaId).first() : null;
    const ekskulAda = r.ekskulId ? await db.prepare('SELECT 1 FROM ekskul WHERE id = ?').bind(r.ekskulId).first() : null;
    batch2.push(db.prepare('INSERT INTO pemasukan(id,siswa_id,ekskul_id,jenis,periode,nominal,tanggal_bayar,keterangan) VALUES (?,?,?,?,?,?,?,?)')
      .bind(r.id, siswaAda ? r.siswaId : null, ekskulAda ? r.ekskulId : null, r.jenis || 'pertemuan',
        r.periode || '', Number(r.nominal) || 0, r.tanggalBayar || '', r.keterangan || ''));
  }
  for (const r of (data.pengeluaran || [])) {
    const ekskulAda = r.ekskulId ? await db.prepare('SELECT 1 FROM ekskul WHERE id = ?').bind(r.ekskulId).first() : null;
    batch2.push(db.prepare('INSERT INTO pengeluaran(id,ekskul_id,kategori,nominal,tanggal,keterangan,bukti) VALUES (?,?,?,?,?,?,?)')
      .bind(r.id, ekskulAda ? r.ekskulId : null, r.kategori || '', Number(r.nominal) || 0,
        r.tanggal || '', r.keterangan || '', r.bukti || null));
  }
  for (const k of (data.kategoriPengeluaran || [])) {
    batch2.push(db.prepare('INSERT INTO kategori_pengeluaran(kategori) VALUES (?) ON CONFLICT(kategori) DO NOTHING').bind(k));
  }
  for (const r of (data.aktivitas || [])) {
    batch2.push(db.prepare('INSERT INTO aktivitas(id,waktu,user,role,aksi,detail) VALUES (?,?,?,?,?,?)')
      .bind(r.id, r.waktu, r.user || '', r.role || '', r.aksi || '', r.detail || ''));
  }
  const namaPelaku = role === ROLE_KEPSEK ? 'Kepala Sekolah' : 'Bendahara';
  batch2.push(db.prepare('INSERT INTO aktivitas(id,waktu,user,role,aksi,detail) VALUES (?,?,?,?,?,?)')
    .bind(crypto.randomUUID(), waktuIso(), namaPelaku, role, 'Pulihkan dari Backup', 'Seluruh data ditimpa dari file backup.'));
  if (batch2.length) await db.batch(batch2);

  await trimAktivitas(db);

  const cur = await db.prepare('SELECT * FROM pengaturan WHERE id = 1').first();
  await updatePengaturanDariClient(db, data.pengaturan, cur);

  return { ok: true };
}

/* =========================================================
   NOMOR DOKUMEN (Laporan/Kwitansi) — increment ATOMIK lewat SATU
   statement UPDATE...RETURNING (D1/SQLite menjalankan tiap statement
   secara utuh & berurutan per database, jadi panggilan bersamaan
   dari sesi/tab mana pun tidak akan pernah menghasilkan nomor
   dobel) — padanan langsung dari UPDATE ... RETURNING yang dikunci
   Postgres per baris di versi Supabase.
   ========================================================= */
async function ambilNomorDokumen(env, token, tipe) {
  const db = env.DB;
  const role = await cekSesi(db, token);
  if (!role) return { ok: false, error: 'Sesi tidak valid, silakan login ulang.' };
  if (role !== ROLE_BENDAHARA && role !== ROLE_KEPSEK) return { ok: false, error: 'Role tidak dikenali.' };
  if (tipe !== 'laporan' && tipe !== 'kwitansi') return { ok: false, error: 'Tipe nomor dokumen tidak dikenali.' };

  const tahun = tahunJakarta();
  const kolom = tipe === 'laporan' ? 'nomor_laporan_counter' : 'nomor_kwitansi_counter';
  const path = `$."${tahun}"`;

  const row = await db.prepare(
    `UPDATE pengaturan SET ${kolom} = json_set(coalesce(${kolom}, '{}'), ?, coalesce(json_extract(${kolom}, ?), 0) + 1)
     WHERE id = 1
     RETURNING json_extract(${kolom}, ?) AS urut`
  ).bind(path, path, path).first();

  if (!row) return { ok: false, error: 'Gagal mengambil nomor dokumen dari server.' };
  return { ok: true, urut: row.urut, tahun };
}

/* Log aktivitas ringan untuk aksi cetak/unduh — boleh dipanggil
   kedua role (bukan aksi mengubah data keuangan), TIDAK lewat
   save_all(). Lihat CATATAN-PERBAIKAN.md untuk kronologi bug ini. */
async function catatLogCetak(env, token, aksi, detail) {
  const db = env.DB;
  const role = await cekSesi(db, token);
  if (!role) return { ok: false, error: 'Sesi tidak valid, silakan login ulang.' };
  if (role !== ROLE_BENDAHARA && role !== ROLE_KEPSEK) return { ok: false, error: 'Role tidak dikenali.' };
  if (!aksi) return { ok: false, error: 'Aksi tidak valid.' };

  const pg = await db.prepare('SELECT * FROM pengaturan WHERE id = 1').first();
  const nama = role === ROLE_KEPSEK ? (pg.nama_kepsek_akun || 'Kepala Sekolah') : (pg.bendahara || 'Bendahara');
  await catatAktivitas(db, nama, role, aksi, detail || '');
  await trimAktivitas(db);
  return { ok: true };
}

/* =========================================================
   ROUTING RPC
   ========================================================= */
async function dispatchRpc(name, body, env) {
  body = body || {};
  switch (name) {
    case 'login': return login(env, body.p_username, body.p_password);
    case 'logout': return logout(env, body.p_token);
    case 'get_app_data': return getAppData(env, body.p_token);
    case 'get_public_data': return getPublicData(env);
    case 'get_public_riwayat': return getPublicRiwayat(env, body.p_siswa_id, body.p_ekskul_id);
    case 'save_all': return saveAll(env, body.p_token, body.p_data);
    case 'restore_backup': return restoreBackup(env, body.p_token, body.p_data);
    case 'ambil_nomor_dokumen': return ambilNomorDokumen(env, body.p_token, body.p_tipe);
    case 'catat_log_cetak': return catatLogCetak(env, body.p_token, body.p_aksi, body.p_detail);
    default: return null;
  }
}

/* =========================================================
   CORS & RESPONSE HELPERS
   ========================================================= */
function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}
function jsonResponse(data, status, env) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders(env && env.CORS_ORIGIN) },
  });
}

/* =========================================================
   ENTRYPOINT
   ========================================================= */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders(env.CORS_ORIGIN) });
    }

    try {
      const rpcMatch = url.pathname.match(/^\/rpc\/([a-zA-Z_]+)$/);
      if (rpcMatch && request.method === 'POST') {
        let body = {};
        try { body = await request.json(); } catch (e) { /* body kosong dianggap {} */ }
        const result = await dispatchRpc(rpcMatch[1], body, env);
        if (result === null) return jsonResponse({ ok: false, error: 'Fungsi tidak dikenali: ' + rpcMatch[1] }, 404, env);
        return jsonResponse(result, 200, env);
      }

      if (url.pathname === '/' || url.pathname === '/health') {
        return jsonResponse({ ok: true, service: 'sikasapa-api' }, 200, env);
      }

      return jsonResponse({ ok: false, error: 'Not found' }, 404, env);
    } catch (err) {
      console.error(err);
      return jsonResponse({ ok: false, error: 'Kesalahan server: ' + (err && err.message ? err.message : String(err)) }, 500, env);
    }
  },
};

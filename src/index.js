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
const ROLE_GURU = 'guru';
const ABSENSI_RETENSI_HARI = 200; // buang catatan absensi lebih tua dari ini (housekeeping ringan)
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
   di mana UTC & WIB beda tahun. */
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
/* Mengembalikan { role, refId } atau null. refId hanya terisi untuk sesi
   guru ekstra (id baris guru_ekstra yang login) — dipakai untuk
   memvalidasi guru itu cuma boleh menulis absensi untuk ekstra yang
   memang ditugaskan ke dia (lihat simpanAbsensiGuru()). */
async function cekSesi(db, token) {
  const now = Date.now();
  await db.prepare('DELETE FROM sessions WHERE expires_at <= ?').bind(now).run();
  if (!token) return null;
  const row = await db.prepare('SELECT role, ref_id FROM sessions WHERE token = ?').bind(token).first();
  return row ? { role: row.role, refId: row.ref_id || null } : null;
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
  let role = null, nama = null, ok = false, refId = null;
  if (pg) {
    if (username === pg.username && pg.password_hash && await verifyPassword(password, pg.password_hash)) {
      role = ROLE_BENDAHARA; nama = pg.bendahara || 'Bendahara'; ok = true;
    } else if (username === pg.username_kepsek && pg.password_kepsek_hash && await verifyPassword(password, pg.password_kepsek_hash)) {
      role = ROLE_KEPSEK; nama = pg.nama_kepsek_akun || 'Kepala Sekolah'; ok = true;
    }
  }
  if (!ok) {
    const g = await db.prepare('SELECT * FROM guru_ekstra WHERE username = ? AND aktif = 1').bind(username).first();
    if (g && g.password_hash && await verifyPassword(password, g.password_hash)) {
      role = ROLE_GURU; nama = g.nama || 'Guru Ekstrakurikuler'; ok = true; refId = g.id;
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
  await db.prepare('INSERT INTO sessions(token, role, ref_id, created_at, expires_at) VALUES (?,?,?,?,?)')
    .bind(token, role, refId, now, now + sessionMs).run();
  const labelRole = role === ROLE_KEPSEK ? 'Kepala Sekolah' : (role === ROLE_GURU ? `Guru Ekstra (${nama})` : 'Bendahara Sekolah');
  await catatAktivitas(db, nama, role, 'Login', labelRole + ' masuk ke aplikasi.');

  return { ok: true, role, token, nama };
}

async function logout(env, token) {
  const db = env.DB;
  const row = await db.prepare('SELECT role FROM sessions WHERE token = ?').bind(token).first();
  if (row) {
    await db.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
    const label = row.role === ROLE_KEPSEK ? 'Kepala Sekolah' : (row.role === ROLE_GURU ? 'Guru Ekstra' : 'Bendahara Sekolah');
    await catatAktivitas(db, '-', row.role, 'Logout', label + ' keluar dari aplikasi.');
  }
  return { ok: true };
}

/* =========================================================
   BACA DATA — DASHBOARD ADMIN (butuh token, role apa saja)
   ========================================================= */
async function getAppData(env, token) {
  const db = env.DB;
  const sesi = await cekSesi(db, token);
  if (!sesi) return { ok: false, error: 'Sesi tidak valid atau sudah kedaluwarsa. Silakan login ulang.' };

  if (sesi.role === ROLE_GURU) return getGuruData(db, sesi.refId);

  const pg = await db.prepare('SELECT * FROM pengaturan WHERE id = 1').first();
  const [ekskul, siswa, pemasukan, pengeluaran, kategori, aktivitas, ekstraAbsensi, guru, absensi, absensiGuru] = await Promise.all([
    db.prepare('SELECT * FROM ekskul').all(),
    db.prepare('SELECT * FROM siswa').all(),
    db.prepare('SELECT * FROM pemasukan').all(),
    db.prepare('SELECT * FROM pengeluaran').all(),
    db.prepare('SELECT kategori FROM kategori_pengeluaran').all(),
    db.prepare('SELECT * FROM aktivitas ORDER BY waktu DESC').all(),
    db.prepare('SELECT * FROM ekstra_absensi').all(),
    db.prepare('SELECT * FROM guru_ekstra').all(),
    db.prepare('SELECT * FROM absensi ORDER BY tanggal DESC').all(),
    db.prepare('SELECT * FROM absensi_guru ORDER BY tanggal DESC').all(),
  ]);

  return {
    ok: true,
    db: {
      ekskul: ekskul.results.map((r) => ({
        id: r.id, nama: r.nama, pembina: r.pembina, jenisPembayaran: r.jenis_pembayaran,
        tarif: r.tarif, hariJadwal: safeJsonParse(r.hari_jadwal, []), warna: r.warna,
        ekstraAbsensiId: r.ekstra_absensi_id || null,
        bulanAktif: safeJsonParse(r.bulan_aktif, {}), hariLibur: safeJsonParse(r.hari_libur, []),
      })),
      siswa: siswa.results.map((r) => ({
        id: r.id, nama: r.nama, kelas: r.kelas, ekskulIds: safeJsonParse(r.ekskul_ids, []),
        aktif: !!r.aktif, waliNama: r.wali_nama, waliHp: r.wali_hp,
        ekstraAbsensiIds: safeJsonParse(r.ekstra_absensi_ids, []),
        tanggalGabung: r.tanggal_gabung || null,
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
      // Guru: id, nama, username, ekstraIds, aktif SAJA — password_hash TIDAK
      // PERNAH dikirim ke browser mana pun (lihat juga simpanGuruDariClient()).
      guru: guru.results.map((r) => ({
        id: r.id, nama: r.nama, username: r.username, ekstraIds: safeJsonParse(r.ekstra_ids, []), aktif: !!r.aktif,
      })),
      ekstraAbsensi: ekstraAbsensi.results.map((r) => ({
        id: r.id, nama: r.nama, keterangan: r.keterangan, warna: r.warna,
        hariJadwal: safeJsonParse(r.hari_jadwal, []),
      })),
      absensi: absensi.results.map((r) => ({
        id: r.id, ekstraId: r.ekstra_id, siswaId: r.siswa_id, tanggal: r.tanggal,
        status: r.status, catatan: r.catatan, dicatatOleh: r.dicatat_oleh,
      })),
      // Kehadiran GURU EKSTRA itu sendiri — lihat catatan di schema.sql
      // (tabel absensi_guru) & simpanAbsensiGuruSendiri() di bawah.
      absensiGuru: absensiGuru.results.map((r) => ({
        id: r.id, ekstraId: r.ekstra_id, guruId: r.guru_id, guruNama: r.guru_nama,
        tanggal: r.tanggal, status: r.status, catatan: r.catatan,
      })),
      pengaturan: {
        tahunAjaran: pg.tahun_ajaran, logo: pg.logo, kepalaSekolah: pg.kepala_sekolah,
        nipKepsek: pg.nip_kepsek, bendahara: pg.bendahara, nipBendahara: pg.nip_bendahara,
        username: pg.username, usernameKepsek: pg.username_kepsek, namaKepsekAkun: pg.nama_kepsek_akun,
        publikNamaWeb: pg.publik_nama_web, publikLogo: pg.publik_logo, publikTagline: pg.publik_tagline,
        publikEyebrow: pg.publik_eyebrow, publikHeadline1: pg.publik_headline1, publikHeadline2: pg.publik_headline2,
        publikDeskripsi: pg.publik_deskripsi, publikChip1: pg.publik_chip1, publikChip2: pg.publik_chip2, publikChip3: pg.publik_chip3,
        kopLines: safeJsonParse(pg.kop_lines, []),
        nomorLaporanCounter: safeJsonParse(pg.nomor_laporan_counter, {}),
        nomorKwitansiCounter: safeJsonParse(pg.nomor_kwitansi_counter, {}),
        hariLibur: safeJsonParse(pg.hari_libur, []),
        templateWaBulanan: pg.template_wa_bulanan || '',
        templateWaPertemuan: pg.template_wa_pertemuan || '',
      },
    },
  };
}

/* =========================================================
   BACA DATA — HALAMAN GURU EKSTRA (role 'guru' SAJA)
   Sengaja dibuat TERPISAH dari getAppData() di atas (bukan cuma
   menyaring hasilnya): guru ekstra TIDAK PERNAH boleh menerima data
   keuangan (pemasukan/pengeluaran/pengaturan akun bendahara/dll) dari
   server sama sekali, bukan cuma disembunyikan di tampilan — supaya
   tidak ada data sensitif yang sempat mampir ke memori browser guru.
   Hanya berisi: ekstra_absensi & siswa yang DITUGASKAN ke guru itu,
   dan absensi miliknya sendiri.
   ========================================================= */
async function getGuruData(db, guruId) {
  const g = guruId ? await db.prepare('SELECT * FROM guru_ekstra WHERE id = ?').bind(guruId).first() : null;
  if (!g || !g.aktif) return { ok: false, error: 'Akun guru ini tidak ditemukan atau sudah dinonaktifkan. Silakan hubungi Bendahara.' };
  const ekstraIds = safeJsonParse(g.ekstra_ids, []);

  const [ekstraAbsensiSemua, siswaSemua, absensiSemua, absensiGuruSemua] = await Promise.all([
    db.prepare('SELECT * FROM ekstra_absensi').all(),
    db.prepare('SELECT * FROM siswa WHERE aktif = 1').all(),
    db.prepare('SELECT * FROM absensi').all(),
    db.prepare('SELECT * FROM absensi_guru').all(),
  ]);

  const ekstraAbsensi = ekstraAbsensiSemua.results.filter((r) => ekstraIds.includes(r.id));
  const siswa = siswaSemua.results
    .map((r) => ({ ...r, ekstra_absensi_ids_parsed: safeJsonParse(r.ekstra_absensi_ids, []) }))
    .filter((r) => r.ekstra_absensi_ids_parsed.some((id) => ekstraIds.includes(id)));
  const absensi = absensiSemua.results.filter((r) => ekstraIds.includes(r.ekstra_id));
  // Guru cuma perlu lihat catatan absen dirinya sendiri untuk ekstra yang
  // ditugaskan ke dia (dipakai frontend untuk mengunci form absensi siswa
  // sampai baris ini ada — lihat renderFormAmbilAbsensiHtml() di
  // script_core.js) — TIDAK perlu dibatasi per guruId karena satu ekstra
  // memang boleh punya lebih dari satu guru pembina bergantian.
  const absensiGuru = absensiGuruSemua.results.filter((r) => ekstraIds.includes(r.ekstra_id));

  return {
    ok: true,
    db: {
      ekskul: [], pemasukan: [], pengeluaran: [], kategoriPengeluaran: [], aktivitas: [], guru: [],
      ekstraAbsensi: ekstraAbsensi.map((r) => ({
        id: r.id, nama: r.nama, keterangan: r.keterangan, warna: r.warna,
        hariJadwal: safeJsonParse(r.hari_jadwal, []),
      })),
      siswa: siswa.map((r) => ({
        id: r.id, nama: r.nama, kelas: r.kelas, ekskulIds: [], aktif: true,
        waliNama: '', waliHp: '', ekstraAbsensiIds: r.ekstra_absensi_ids_parsed,
      })),
      absensi: absensi.map((r) => ({
        id: r.id, ekstraId: r.ekstra_id, siswaId: r.siswa_id, tanggal: r.tanggal,
        status: r.status, catatan: r.catatan, dicatatOleh: r.dicatat_oleh,
      })),
      absensiGuru: absensiGuru.map((r) => ({
        id: r.id, ekstraId: r.ekstra_id, guruId: r.guru_id, guruNama: r.guru_nama,
        tanggal: r.tanggal, status: r.status, catatan: r.catatan,
      })),
      pengaturan: { kopLines: [], publikNamaWeb: 'SIKASAPA', hariLibur: [] },
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
        id: r.id, nama: r.nama, jenisPembayaran: r.jenis_pembayaran, tarif: r.tarif, warna: r.warna,
        hariJadwal: safeJsonParse(r.hari_jadwal, []),
        bulanAktif: safeJsonParse(r.bulan_aktif, {}), hariLibur: safeJsonParse(r.hari_libur, []),
      })),
      siswa: siswa.results.map((r) => ({
        id: r.id, nama: r.nama, kelas: r.kelas, ekskulIds: safeJsonParse(r.ekskul_ids, []), aktif: true,
      })),
      pemasukan: [], pengeluaran: [], kategoriPengeluaran: [], aktivitas: [],
      pengaturan: {
        kopLines: safeJsonParse(pg.kop_lines, []), publikNamaWeb: pg.publik_nama_web,
        publikLogo: pg.publik_logo, publikTagline: pg.publik_tagline,
        // Konten hero (menu admin Halaman Publik) — HARUS ikut dikirim di
        // sini juga (bukan cuma getAppData()), karena halaman publik yang
        // diakses wali murid TANPA login memuat datanya lewat get_public_data,
        // bukan get_app_data.
        publikEyebrow: pg.publik_eyebrow, publikHeadline1: pg.publik_headline1, publikHeadline2: pg.publik_headline2,
        publikDeskripsi: pg.publik_deskripsi, publikChip1: pg.publik_chip1, publikChip2: pg.publik_chip2, publikChip3: pg.publik_chip3,
      },
    },
  };
}

/* Sengaja TIDAK mengirim kolom nominal ke halaman publik — Informasi
   Pembayaran wali murid hanya menampilkan status LUNAS/BELUM per
   bulan (lihat cariInfoPembayaranPublik() di script_core.js), bukan
   nominal/total rupiah. */
async function getPublicRiwayat(env, siswaId, ekskulId) {
  if (!siswaId || !ekskulId) return { ok: false, error: 'Data tidak lengkap.' };
  // Validasi pasangan siswa↔ekskul dulu — tanpa ini, endpoint publik ini mau
  // mengembalikan riwayat pembayaran untuk kombinasi siswaId+ekskulId APA PUN
  // yang punya baris pemasukan cocok, walau siswa itu sudah tidak (lagi)
  // terdaftar di ekskul tersebut (mis. sudah keluar/dipindahkan). Risikonya
  // kecil (perlu tahu UUID asli keduanya), tapi tetap best practice ditolak.
  const siswa = await env.DB.prepare('SELECT ekskul_ids FROM siswa WHERE id = ? AND aktif = 1').bind(siswaId).first();
  const ekskulIds = siswa ? safeJsonParse(siswa.ekskul_ids, []) : [];
  if (!Array.isArray(ekskulIds) || !ekskulIds.includes(ekskulId)) {
    return { ok: false, error: 'Data tidak ditemukan.' };
  }
  const rows = await env.DB.prepare(
    'SELECT periode, tanggal_bayar, keterangan FROM pemasukan WHERE siswa_id = ? AND ekskul_id = ?'
  ).bind(siswaId, ekskulId).all();
  return {
    ok: true,
    riwayat: rows.results.map((r) => ({
      periode: r.periode, tanggalBayar: r.tanggal_bayar, keterangan: r.keterangan,
    })),
  };
}

/* =========================================================
   Helper bersama save_all() & restore_backup(): update baris
   pengaturan dari objek `pg` yang dikirim browser, TANPA PERNAH
   menyentuh nomor_laporan_counter/nomor_kwitansi_counter (itu
   HANYA boleh diubah oleh ambilNomorDokumen() — mencegah nomor dokumen dobel).
   ========================================================= */
/* Validasi ini tadinya HANYA ada di client (script_core.js/simpanPengaturan),
   jadi bisa dilewati kalau /rpc/save_all atau /rpc/restore_backup dipanggil
   langsung (mis. lewat curl) dengan token bendahara yang sah. Dipanggil DUA
   kali dengan sengaja: sekali di awal saveAll()/restoreBackup() (SEBELUM
   batch tulis apa pun, sama seperti cekUkuranGambar(), supaya gagal dengan
   bersih tanpa menyisakan perubahan lain yang sudah kadung tersimpan), dan
   sekali lagi di dalam updatePengaturanDariClient() sebagai jaring pengaman
   kalau suatu saat ada pemanggil baru yang lupa memvalidasi di awal. */
async function validasiPengaturanInput(db, pg, cur) {
  pg = pg || {};
  cur = cur || {};
  const errLogo = cekUkuranGambar(pg.logo, 'Logo laporan');
  if (errLogo) throw new Error(errLogo);
  const errPublikLogo = cekUkuranGambar(pg.publikLogo, 'Logo halaman publik');
  if (errPublikLogo) throw new Error(errPublikLogo);

  const usernameBaru = (pg.username || cur.username || '').trim();
  const usernameKepsekBaru = (pg.usernameKepsek || cur.username_kepsek || '').trim();
  if (!usernameBaru || !usernameKepsekBaru) {
    throw new Error('Username Bendahara dan Kepala Sekolah wajib diisi.');
  }
  if (usernameBaru === usernameKepsekBaru) {
    throw new Error('Username Bendahara dan Kepala Sekolah tidak boleh sama.');
  }
  // Username Bendahara/Kepsek juga wajib unik terhadap akun Guru Ekstra yang
  // sudah ada — arah sebaliknya (guru vs bendahara/kepsek) sudah dicek di
  // saveAll(). Tanpa ini, mengganti username Bendahara/Kepsek jadi sama
  // dengan username guru yang sudah ada bisa lolos di sini.
  const konflikGuru = await db.prepare('SELECT username FROM guru_ekstra WHERE username = ? OR username = ?')
    .bind(usernameBaru, usernameKepsekBaru).first();
  if (konflikGuru) {
    throw new Error(`Username "${konflikGuru.username}" sudah dipakai akun Guru Ekstra. Gunakan username lain.`);
  }
  if (pg.password && pg.password.length < 6) {
    throw new Error('Password Bendahara baru minimal 6 karakter.');
  }
  if (pg.passwordKepsek && pg.passwordKepsek.length < 6) {
    throw new Error('Password Kepala Sekolah baru minimal 6 karakter.');
  }
  // Konten hero halaman publik — batas panjang sama seperti yang dipaksa
  // lewat atribut maxlength di form-nya (renderHalamanPublik() di
  // script_core.js), dicek ULANG di sini supaya /rpc/save_all* yang
  // dipanggil langsung (tanpa lewat UI) tidak bisa menyimpan teks yang
  // bisa merusak tata letak hero (lihat cekPanjangTeks() di bawah).
  cekPanjangTeks(pg.publikEyebrow, 'Label kecil (eyebrow)', 40);
  cekPanjangTeks(pg.publikHeadline1, 'Judul baris pertama', 30);
  cekPanjangTeks(pg.publikHeadline2, 'Judul baris kedua (aksen)', 30);
  cekPanjangTeks(pg.publikDeskripsi, 'Deskripsi hero', 240);
  cekPanjangTeks(pg.publikChip1, 'Label keunggulan #1', 40);
  cekPanjangTeks(pg.publikChip2, 'Label keunggulan #2', 40);
  cekPanjangTeks(pg.publikChip3, 'Label keunggulan #3', 40);
}

function cekPanjangTeks(nilai, label, maks) {
  if (typeof nilai === 'string' && nilai.length > maks) {
    throw new Error(`${label} maksimal ${maks} karakter.`);
  }
}

async function updatePengaturanDariClient(db, pg, cur) {
  pg = pg || {};
  await validasiPengaturanInput(db, pg, cur);

  let passwordHash = cur.password_hash;
  if (pg.password) passwordHash = await hashPassword(pg.password);
  let passwordKepsekHash = cur.password_kepsek_hash;
  if (pg.passwordKepsek) passwordKepsekHash = await hashPassword(pg.passwordKepsek);

  await db.prepare(`UPDATE pengaturan SET
      tahun_ajaran=?, logo=?, kepala_sekolah=?, nip_kepsek=?, bendahara=?, nip_bendahara=?,
      username=?, password_hash=?, nama_kepsek_akun=?, username_kepsek=?, password_kepsek_hash=?,
      publik_nama_web=?, publik_logo=?, publik_tagline=?, kop_lines=?, hari_libur=?,
      template_wa_bulanan=?, template_wa_pertemuan=?,
      publik_eyebrow=?, publik_headline1=?, publik_headline2=?, publik_deskripsi=?,
      publik_chip1=?, publik_chip2=?, publik_chip3=?
    WHERE id = 1`).bind(
    pg.tahunAjaran || '', pg.logo || null, pg.kepalaSekolah || '', pg.nipKepsek || '',
    pg.bendahara || '', pg.nipBendahara || '',
    pg.username || cur.username, passwordHash,
    pg.namaKepsekAkun || '', pg.usernameKepsek || cur.username_kepsek, passwordKepsekHash,
    pg.publikNamaWeb || 'SIKASAPA', pg.publikLogo || null,
    pg.publikTagline || 'Sistem Informasi Keuangan Ekstrakurikuler',
    JSON.stringify(pg.kopLines || safeJsonParse(cur.kop_lines, [])),
    JSON.stringify(sanitasiHariLibur(pg.hariLibur, cur.hari_libur)),
    (typeof pg.templateWaBulanan === 'string' && pg.templateWaBulanan.trim()) ? pg.templateWaBulanan : cur.template_wa_bulanan,
    (typeof pg.templateWaPertemuan === 'string' && pg.templateWaPertemuan.trim()) ? pg.templateWaPertemuan : cur.template_wa_pertemuan,
    (typeof pg.publikEyebrow === 'string' && pg.publikEyebrow.trim()) ? pg.publikEyebrow.trim() : (cur.publik_eyebrow || 'Layanan Wali Murid'),
    (typeof pg.publikHeadline1 === 'string' && pg.publikHeadline1.trim()) ? pg.publikHeadline1.trim() : (cur.publik_headline1 || 'Pembayaran'),
    (typeof pg.publikHeadline2 === 'string' && pg.publikHeadline2.trim()) ? pg.publikHeadline2.trim() : (cur.publik_headline2 || 'Ekstrakurikuler'),
    typeof pg.publikDeskripsi === 'string' ? pg.publikDeskripsi.trim() : (cur.publik_deskripsi || ''),
    (typeof pg.publikChip1 === 'string' && pg.publikChip1.trim()) ? pg.publikChip1.trim() : (cur.publik_chip1 || 'Data Aman & Resmi Sekolah'),
    (typeof pg.publikChip2 === 'string' && pg.publikChip2.trim()) ? pg.publikChip2.trim() : (cur.publik_chip2 || 'Hasil Real-time'),
    (typeof pg.publikChip3 === 'string' && pg.publikChip3.trim()) ? pg.publikChip3.trim() : (cur.publik_chip3 || 'Tanpa Perlu Aplikasi'),
  ).run();
}

/* Terima hanya string tanggal berformat YYYY-MM-DD yang valid, buang
   duplikat, urutkan — supaya isi kolom hari_libur selalu bersih walau
   /rpc/save_all dipanggil langsung tanpa lewat UI Pengaturan. */
const TANGGAL_ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
function sanitasiHariLibur(daftarBaru, jsonLama) {
  const sumber = Array.isArray(daftarBaru) ? daftarBaru : safeJsonParse(jsonLama, []);
  if (!Array.isArray(sumber)) return [];
  const bersih = new Set();
  for (const t of sumber) {
    if (typeof t === 'string' && TANGGAL_ISO_RE.test(t)) bersih.add(t);
  }
  return Array.from(bersih).sort();
}

/* =========================================================
   AKTIVASI BULAN & HARI LIBUR PER EKSTRAKURIKULER (menu "Aktivasi
   Bulan & Libur") — dua helper di bawah membersihkan input dari
   client sebelum disimpan ke kolom ekskul.bulan_aktif/hari_libur,
   sama alasannya seperti sanitasiHariLibur() di atas: supaya
   /rpc/save_all yang dipanggil langsung (bukan lewat UI) tidak bisa
   menyimpan bentuk data yang rusak.
   ========================================================= */
/* bulanAktif: object, HANYA berisi entri untuk bulan-TAHUN yang
   dinonaktifkan — key format "YYYY-MM" (SAMA persis dengan format
   `periode` yang dipakai di Tunggakan/Riwayat/Informasi Pembayaran
   publik, mis. "2026-07"), BUKAN cuma nomor bulan seperti sebelumnya
   ("7"). PERBAIKAN #4: dulu key-nya cuma nomor bulan, jadi menonaktifkan
   Juli 2026 (mis. karena "Libur Semester") otomatis ikut menonaktifkan
   Juli di SEMUA tahun lain juga, selamanya, sampai diaktifkan manual.
   Sekarang terikat ke tahun tertentu — Juli tahun berikutnya default
   aktif lagi kalau tidak dinonaktifkan eksplisit untuk tahun itu.
   Bulan tanpa entri = aktif (default). Kunci di luar format "YYYY-MM"
   atau entri aktif:true dibuang (tidak perlu disimpan, itu sudah
   default). TIDAK ADA migrasi data lama (key bernomor bulan saja) —
   entri lama diabaikan begitu saja oleh regex ini, dianggap fitur baru. */
const BULAN_AKTIF_KEY_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
function sanitasiBulanAktif(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return {};
  const bersih = {};
  for (const key of Object.keys(obj)) {
    if (!BULAN_AKTIF_KEY_RE.test(key)) continue;
    const v = obj[key];
    if (v && typeof v === 'object' && v.aktif === false) {
      bersih[key] = { aktif: false, alasan: typeof v.alasan === 'string' ? v.alasan.trim().slice(0, 200) : '' };
    }
  }
  return bersih;
}
/* hariLibur per-ekskul: array objek {tanggal, keterangan} — pengganti
   pengaturan.hari_libur global yang lama (lihat catatan di schema.sql). */
function sanitasiHariLiburEkskul(arr) {
  if (!Array.isArray(arr)) return [];
  const seen = new Set();
  const bersih = [];
  for (const it of arr) {
    if (!it || typeof it !== 'object') continue;
    const t = it.tanggal;
    if (typeof t !== 'string' || !TANGGAL_ISO_RE.test(t) || seen.has(t)) continue;
    seen.add(t);
    bersih.push({ tanggal: t, keterangan: typeof it.keterangan === 'string' ? it.keterangan.trim().slice(0, 200) : '' });
  }
  bersih.sort((a, b) => a.tanggal.localeCompare(b.tanggal));
  return bersih;
}

/* =========================================================
   SIMPAN PERUBAHAN DATA — UPSERT per baris, hanya role bendahara.
   Penghapusan HANYA untuk id yang eksplisit ada di p_data.hapus
   (diisi oleh tandaiHapus() di script_core.js). Tabel aktivitas
   TIDAK PERNAH dihapus di sini (insert-if-not-exists saja), lalu
   dipangkas ke 500 baris terbaru.
   ========================================================= */
async function saveAll(env, token, data) {
  const db = env.DB;
  const sesi = await cekSesi(db, token);
  if (!sesi) return { ok: false, error: 'Sesi tidak valid, silakan login ulang.' };
  const role = sesi.role;
  if (role !== ROLE_BENDAHARA) return { ok: false, error: 'Hanya akun Bendahara yang bisa menyimpan perubahan.' };
  if (!data) return { ok: false, error: 'Data tidak valid.' };

  const hapus = data.hapus || {};

  // Validasi ukuran SEMUA gambar + username/password dulu, SEBELUM batch
  // tulis apa pun dijalankan — supaya satu input tidak valid gagal dengan
  // bersih tanpa menyisakan sebagian perubahan lain sudah tersimpan.
  const errPengaturanLogo = cekUkuranGambar((data.pengaturan || {}).logo, 'Logo laporan');
  if (errPengaturanLogo) return { ok: false, error: errPengaturanLogo };
  const errPengaturanPublikLogo = cekUkuranGambar((data.pengaturan || {}).publikLogo, 'Logo halaman publik');
  if (errPengaturanPublikLogo) return { ok: false, error: errPengaturanPublikLogo };
  for (const r of (data.pengeluaran || [])) {
    const errBukti = cekUkuranGambar(r.bukti, `Bukti pengeluaran "${r.keterangan || r.id}"`);
    if (errBukti) return { ok: false, error: errBukti };
  }
  try {
    const curAwal = await db.prepare('SELECT * FROM pengaturan WHERE id = 1').first();
    await validasiPengaturanInput(db, data.pengaturan, curAwal);
  } catch (e) {
    return { ok: false, error: e.message };
  }

  // AKUN GURU EKSTRA — validasi username/password dilakukan DI SINI, SEBELUM
  // batch1 (ekskul/siswa) DIJALANKAN. Dulu validasi ini ada di tengah fungsi
  // ini (setelah batch1 sudah commit ke database) — jadi kalau validasi
  // username guru gagal, perubahan Ekskul/Siswa yang menyertainya di request
  // yang sama sudah kadung tersimpan, walau aplikasi menampilkan pesan error
  // seolah seluruh penyimpanan gagal. Hasil validasi/persiapan di sini
  // (passwordHash per baris guru) disimpan ke guruPrepared supaya blok
  // penulisan batch2 di bawah tidak perlu query ulang.
  const curPg = await db.prepare('SELECT username, username_kepsek FROM pengaturan WHERE id = 1').first();
  const guruList = data.guru || [];
  // Pakai username Bendahara/Kepsek yang BARU (dari data.pengaturan di
  // request yang sama) kalau memang sedang diganti, bukan cuma nilai lama
  // di DB — supaya mengganti username Bendahara/Kepsek berbarengan dengan
  // menambah akun Guru di username yang sama (dalam satu kali "Simpan")
  // tetap terdeteksi sebagai tabrakan.
  const pgBaru = data.pengaturan || {};
  const usernameBendaharaBaru = (pgBaru.username || curPg.username || '').trim();
  const usernameKepsekBaru = (pgBaru.usernameKepsek || curPg.username_kepsek || '').trim();
  const usernamePakai = new Set([usernameBendaharaBaru, usernameKepsekBaru]);
  const guruPrepared = [];
  for (const r of guruList) {
    const uname = (r.username || '').trim();
    if (!uname) return { ok: false, error: `Username untuk guru "${r.nama || '-'}" wajib diisi.` };
    if (usernamePakai.has(uname)) return { ok: false, error: `Username "${uname}" sudah dipakai akun lain. Gunakan username lain.` };
    // BUG DITEMUKAN & DIPERBAIKI lewat testing (bukan dari laporan awal):
    // usernamePakai di atas cuma berisi username Bendahara/Kepsek + baris
    // guru LAIN yang ikut dikirim di request YANG SAMA — jadi kalau
    // username baru ini bentrok dengan guru_ekstra LAIN yang SUDAH ADA di
    // database tapi TIDAK ikut dikirim di request ini (mis. Bendahara cuma
    // menambah satu guru baru, guru2 lain yang sudah ada tidak disertakan),
    // itu lolos di sini lalu baru gagal saat db.batch(batch2) dijalankan
    // (constraint UNIQUE mentah dari SQLite) — pada titik itu batch1
    // (ekskul/siswa) SUDAH TERLANJUR COMMIT, persis masalah atomik yang
    // saveAll() ini coba dicegah. Makanya query DB langsung juga di sini.
    const konflikGuruLain = await db.prepare('SELECT id FROM guru_ekstra WHERE username = ? AND id != ?')
      .bind(uname, r.id || '').first();
    if (konflikGuruLain) return { ok: false, error: `Username "${uname}" sudah dipakai akun Guru Ekstra lain. Gunakan username lain.` };
    usernamePakai.add(uname);
    let passwordHash = null;
    if (r.id) {
      const lama = await db.prepare('SELECT password_hash FROM guru_ekstra WHERE id = ?').bind(r.id).first();
      passwordHash = lama ? lama.password_hash : null;
    }
    if (r.password) {
      if (r.password.length < 6) return { ok: false, error: `Password guru "${r.nama || '-'}" minimal 6 karakter.` };
      passwordHash = await hashPassword(r.password);
    }
    if (!passwordHash) return { ok: false, error: `Guru "${r.nama || '-'}" belum punya password. Isi password saat membuat akun baru.` };
    guruPrepared.push({ r, uname, passwordHash });
  }

  // 1) EKSKUL & SISWA dulu (supaya pemasukan/pengeluaran bisa dicek
  //    rujukannya terhadap data TERBARU, bukan array yang mungkin basi).
  const batch1 = [];
  for (const r of (data.ekskul || [])) {
    batch1.push(db.prepare(`INSERT INTO ekskul(id,nama,pembina,jenis_pembayaran,tarif,hari_jadwal,warna,ekstra_absensi_id,bulan_aktif,hari_libur) VALUES (?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET nama=excluded.nama, pembina=excluded.pembina, jenis_pembayaran=excluded.jenis_pembayaran,
        tarif=excluded.tarif, hari_jadwal=excluded.hari_jadwal, warna=excluded.warna, ekstra_absensi_id=excluded.ekstra_absensi_id,
        bulan_aktif=excluded.bulan_aktif, hari_libur=excluded.hari_libur`)
      .bind(r.id, r.nama, r.pembina || '', r.jenisPembayaran || 'pertemuan', Number(r.tarif) || 0,
        JSON.stringify(r.hariJadwal || []), r.warna || '#1769D1', r.ekstraAbsensiId || null,
        JSON.stringify(sanitasiBulanAktif(r.bulanAktif)), JSON.stringify(sanitasiHariLiburEkskul(r.hariLibur))));
  }
  // Menghapus ekskul ikut menghapus pemasukan/pengeluaran-nya (FK ON DELETE CASCADE),
  // sama seperti versi Supabase — tidak perlu didaftar terpisah di hapus.pemasukan/pengeluaran.
  for (const id of (hapus.ekskul || [])) batch1.push(db.prepare('DELETE FROM ekskul WHERE id = ?').bind(id));

  for (const r of (data.siswa || [])) {
    batch1.push(db.prepare(`INSERT INTO siswa(id,nama,kelas,ekskul_ids,aktif,wali_nama,wali_hp,ekstra_absensi_ids,tanggal_gabung) VALUES (?,?,?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET nama=excluded.nama, kelas=excluded.kelas, ekskul_ids=excluded.ekskul_ids,
        aktif=excluded.aktif, wali_nama=excluded.wali_nama, wali_hp=excluded.wali_hp, ekstra_absensi_ids=excluded.ekstra_absensi_ids,
        tanggal_gabung=excluded.tanggal_gabung`)
      .bind(r.id, r.nama, r.kelas || '', JSON.stringify(r.ekskulIds || []),
        r.aktif === false ? 0 : 1, r.waliNama || '', r.waliHp || '', JSON.stringify(r.ekstraAbsensiIds || []),
        r.tanggalGabung || null));
  }
  // siswa_id di pemasukan ON DELETE SET NULL — riwayat pembayaran siswa yang
  // dihapus TETAP ADA, cuma siswa_id-nya jadi null (lihat skema).
  for (const id of (hapus.siswa || [])) batch1.push(db.prepare('DELETE FROM siswa WHERE id = ?').bind(id));

  // EKSTRA ABSENSI (jenis ekstrakurikuler untuk absensi guru — lihat menu
  // "Kelola Absensi") — sengaja di batch1 yang sama supaya sudah ada
  // sebelum baris `absensi`/`guru` di batch2 mengacu ke id-nya.
  for (const r of (data.ekstraAbsensi || [])) {
    batch1.push(db.prepare(`INSERT INTO ekstra_absensi(id,nama,keterangan,warna,hari_jadwal) VALUES (?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET nama=excluded.nama, keterangan=excluded.keterangan, warna=excluded.warna,
        hari_jadwal=excluded.hari_jadwal`)
      .bind(r.id, r.nama, r.keterangan || '', r.warna || '#1769D1', JSON.stringify(r.hariJadwal || [])));
  }
  for (const id of (hapus.ekstraAbsensi || [])) batch1.push(db.prepare('DELETE FROM ekstra_absensi WHERE id = ?').bind(id));

  // AKUN GURU EKSTRA — SENGAJA di batch1 (bukan batch2), sama alasannya
  // dengan ekskul/siswa di atas: batch2 di bawah memeriksa "apakah guru
  // ini ada di database" (guruAda, untuk baris absensiGuru) terhadap DB
  // LIVE sebelum batch2 dieksekusi. Kalau guru barunya masih menunggu di
  // batch2 juga, guru yang BARU dibuat di request yang sama belum
  // "terlihat" oleh pengecekan itu — guru_id di absensi_guru jadi
  // ter-null-kan diam-diam walau akun gurunya sendiri berhasil tersimpan
  // (bug ditemukan lewat testing, lihat test-live/run-tests.mjs).
  for (const { r, uname, passwordHash } of guruPrepared) {
    batch1.push(db.prepare(`INSERT INTO guru_ekstra(id,nama,username,password_hash,ekstra_ids,aktif) VALUES (?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET nama=excluded.nama, username=excluded.username, password_hash=excluded.password_hash,
        ekstra_ids=excluded.ekstra_ids, aktif=excluded.aktif`)
      .bind(r.id, r.nama || '', uname, passwordHash, JSON.stringify(r.ekstraIds || []), r.aktif === false ? 0 : 1));
  }
  for (const id of (hapus.guru || [])) batch1.push(db.prepare('DELETE FROM guru_ekstra WHERE id = ?').bind(id));

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

  // ABSENSI — Bendahara boleh menambah/mengoreksi langsung dari sini
  // (mis. lupa dicatat guru). Guru ekstra menulis lewat RPC terpisah
  // simpan_absensi_guru() (lihat di bawah), bukan lewat save_all ini.
  for (const r of (data.absensi || [])) {
    const ekstraAda = r.ekstraId ? await db.prepare('SELECT 1 FROM ekstra_absensi WHERE id = ?').bind(r.ekstraId).first() : null;
    const siswaAda = r.siswaId ? await db.prepare('SELECT 1 FROM siswa WHERE id = ?').bind(r.siswaId).first() : null;
    batch2.push(db.prepare(`INSERT INTO absensi(id,ekstra_id,siswa_id,tanggal,status,catatan,dicatat_oleh) VALUES (?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET ekstra_id=excluded.ekstra_id, siswa_id=excluded.siswa_id, tanggal=excluded.tanggal,
        status=excluded.status, catatan=excluded.catatan, dicatat_oleh=excluded.dicatat_oleh`)
      .bind(r.id, ekstraAda ? r.ekstraId : null, siswaAda ? r.siswaId : null, r.tanggal || '',
        r.status || 'hadir', r.catatan || '', r.dicatatOleh || ''));
  }
  for (const id of (hapus.absensi || [])) batch2.push(db.prepare('DELETE FROM absensi WHERE id = ?').bind(id));

  // ABSENSI GURU (kehadiran guru pembina sendiri) — sama seperti
  // `absensi` siswa di atas, Bendahara boleh menambah/mengoreksi
  // langsung dari sini kalau perlu; guru menulis lewat RPC terpisah
  // simpan_absensi_guru_sendiri() (lihat di atas).
  for (const r of (data.absensiGuru || [])) {
    const ekstraAda = r.ekstraId ? await db.prepare('SELECT 1 FROM ekstra_absensi WHERE id = ?').bind(r.ekstraId).first() : null;
    const guruAda = r.guruId ? await db.prepare('SELECT 1 FROM guru_ekstra WHERE id = ?').bind(r.guruId).first() : null;
    batch2.push(db.prepare(`INSERT INTO absensi_guru(id,ekstra_id,guru_id,guru_nama,tanggal,status,catatan) VALUES (?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET ekstra_id=excluded.ekstra_id, guru_id=excluded.guru_id, guru_nama=excluded.guru_nama,
        tanggal=excluded.tanggal, status=excluded.status, catatan=excluded.catatan`)
      .bind(r.id, ekstraAda ? r.ekstraId : null, guruAda ? r.guruId : null, r.guruNama || '',
        r.tanggal || '', r.status || 'hadir', r.catatan || ''));
  }
  for (const id of (hapus.absensiGuru || [])) batch2.push(db.prepare('DELETE FROM absensi_guru WHERE id = ?').bind(id));

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
  await trimAbsensi(db);

  // Pengaturan — password hanya diganti kalau field 'password'/'passwordKepsek'
  // benar-benar dikirim. Counter nomor dokumen SENGAJA tidak disentuh di sini.
  const cur = await db.prepare('SELECT * FROM pengaturan WHERE id = 1').first();
  await updatePengaturanDariClient(db, data.pengaturan, cur);

  return { ok: true };
}

/* Buang catatan absensi yang sudah sangat lama (lihat ABSENSI_RETENSI_HARI)
   — housekeeping ringan supaya tabel ini tidak membengkak tanpa batas,
   karena tidak ada UI untuk menghapusnya manual satu-satu. Dipanggil
   setelah saveAll() & simpanAbsensiGuru(), sama seperti trimAktivitas(). */
async function trimAbsensi(db) {
  const batas = new Date(Date.now() - ABSENSI_RETENSI_HARI * 86400000).toISOString().slice(0, 10);
  await db.prepare('DELETE FROM absensi WHERE tanggal < ?').bind(batas).run();
  await db.prepare('DELETE FROM absensi_guru WHERE tanggal < ?').bind(batas).run();
}

/* =========================================================
   PULIHKAN DARI BACKUP — hapus-lalu-tulis-ulang (sengaja beda dari
   save_all yang UPSERT-saja), dipanggil hanya lewat restoreDB() di
   script_core.js setelah konfirmasi eksplisit pengguna.
   ========================================================= */
async function restoreBackup(env, token, data) {
  const db = env.DB;
  const sesi = await cekSesi(db, token);
  if (!sesi) return { ok: false, error: 'Sesi tidak valid, silakan login ulang.' };
  const role = sesi.role;
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
  try {
    const curAwal = await db.prepare('SELECT * FROM pengaturan WHERE id = 1').first();
    await validasiPengaturanInput(db, data.pengaturan, curAwal);
  } catch (e) {
    return { ok: false, error: e.message };
  }

  await db.batch([
    db.prepare('DELETE FROM ekskul'),
    db.prepare('DELETE FROM siswa'),
    db.prepare('DELETE FROM pemasukan'),
    db.prepare('DELETE FROM pengeluaran'),
    db.prepare('DELETE FROM kategori_pengeluaran'),
    db.prepare('DELETE FROM aktivitas'),
    db.prepare('DELETE FROM ekstra_absensi'),
    db.prepare('DELETE FROM absensi'),
    db.prepare('DELETE FROM absensi_guru'),
    // guru_ekstra SENGAJA TIDAK dihapus di sini — akun login guru ekstra
    // diperlakukan sama seperti akun Bendahara/Kepsek (lihat
    // updatePengaturanDariClient()): sebuah restore data keuangan tidak
    // boleh diam-diam mencabut akses login siapa pun. Data guru dari
    // backup tetap di-upsert di batch2 di bawah.
  ]);

  const batch1 = [];
  for (const r of (data.ekskul || [])) {
    batch1.push(db.prepare('INSERT INTO ekskul(id,nama,pembina,jenis_pembayaran,tarif,hari_jadwal,warna,ekstra_absensi_id,bulan_aktif,hari_libur) VALUES (?,?,?,?,?,?,?,?,?,?)')
      .bind(r.id, r.nama, r.pembina || '', r.jenisPembayaran || 'pertemuan', Number(r.tarif) || 0,
        JSON.stringify(r.hariJadwal || []), r.warna || '#1769D1', r.ekstraAbsensiId || null,
        JSON.stringify(sanitasiBulanAktif(r.bulanAktif)), JSON.stringify(sanitasiHariLiburEkskul(r.hariLibur))));
  }
  for (const r of (data.siswa || [])) {
    batch1.push(db.prepare('INSERT INTO siswa(id,nama,kelas,ekskul_ids,aktif,wali_nama,wali_hp,ekstra_absensi_ids,tanggal_gabung) VALUES (?,?,?,?,?,?,?,?,?)')
      .bind(r.id, r.nama, r.kelas || '', JSON.stringify(r.ekskulIds || []),
        r.aktif === false ? 0 : 1, r.waliNama || '', r.waliHp || '', JSON.stringify(r.ekstraAbsensiIds || []),
        r.tanggalGabung || null));
  }
  for (const r of (data.ekstraAbsensi || [])) {
    batch1.push(db.prepare('INSERT INTO ekstra_absensi(id,nama,keterangan,warna,hari_jadwal) VALUES (?,?,?,?,?)')
      .bind(r.id, r.nama, r.keterangan || '', r.warna || '#1769D1', JSON.stringify(r.hariJadwal || [])));
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
  for (const r of (data.absensi || [])) {
    batch2.push(db.prepare('INSERT INTO absensi(id,ekstra_id,siswa_id,tanggal,status,catatan,dicatat_oleh) VALUES (?,?,?,?,?,?,?)')
      .bind(r.id, r.ekstraId || null, r.siswaId || null, r.tanggal || '', r.status || 'hadir', r.catatan || '', r.dicatatOleh || ''));
  }
  for (const r of (data.absensiGuru || [])) {
    batch2.push(db.prepare('INSERT INTO absensi_guru(id,ekstra_id,guru_id,guru_nama,tanggal,status,catatan) VALUES (?,?,?,?,?,?,?)')
      .bind(r.id, r.ekstraId || null, r.guruId || null, r.guruNama || '', r.tanggal || '', r.status || 'hadir', r.catatan || ''));
  }
  // Akun guru: upsert kalau id-nya sudah ada (lihat catatan di atas kenapa
  // tabelnya tidak ikut dikosongkan) — nama/username/ekstraIds/aktif
  // disinkronkan, password TIDAK diubah dari backup (backup export tidak
  // pernah menyertakan password_hash sama sekali).
  //
  // Guru BARU (id belum ada di database, mis. restore ke database kosong
  // saat disaster recovery) TETAP DIBUAT baris akunnya di sini supaya
  // datanya tidak hilang — tapi dengan password_hash NULL, ditandai lewat
  // guruBelumSetPassword di bawah supaya UI bisa memberi tahu Bendahara
  // akun-akun ini wajib diset password dulu sebelum bisa login (lihat
  // login(): akun dengan password_hash NULL memang otomatis ditolak
  // login-nya, bukan celah keamanan). Username tetap wajib unik — kalau
  // bentrok dengan akun lain (Bendahara/Kepsek/guru lain), baris ini
  // DILEWATI (bukan bikin seluruh restore gagal) dan dicatat di
  // guruUsernameBentrok supaya pengguna tahu ada akun yang perlu
  // diberi username baru secara manual lewat menu Pengaturan.
  const curPgUname = await db.prepare('SELECT username, username_kepsek FROM pengaturan WHERE id = 1').first();
  const usernameDipakai = new Set([
    (data.pengaturan && data.pengaturan.username) || curPgUname.username,
    (data.pengaturan && data.pengaturan.usernameKepsek) || curPgUname.username_kepsek,
  ]);
  const guruBelumSetPassword = [];
  const guruUsernameBentrok = [];
  for (const r of (data.guru || [])) {
    const ada = await db.prepare('SELECT 1 FROM guru_ekstra WHERE id = ?').bind(r.id).first();
    if (ada) {
      batch2.push(db.prepare('UPDATE guru_ekstra SET nama=?, ekstra_ids=?, aktif=? WHERE id = ?')
        .bind(r.nama || '', JSON.stringify(r.ekstraIds || []), r.aktif === false ? 0 : 1, r.id));
      continue;
    }
    const uname = (r.username || '').trim();
    if (!uname) continue;
    const konflik = usernameDipakai.has(uname) ||
      await db.prepare('SELECT 1 FROM guru_ekstra WHERE username = ?').bind(uname).first();
    if (konflik) { guruUsernameBentrok.push(r.nama || uname); continue; }
    usernameDipakai.add(uname);
    guruBelumSetPassword.push(r.nama || uname);
    batch2.push(db.prepare('INSERT INTO guru_ekstra(id,nama,username,password_hash,ekstra_ids,aktif) VALUES (?,?,?,NULL,?,?)')
      .bind(r.id, r.nama || '', uname, JSON.stringify(r.ekstraIds || []), r.aktif === false ? 0 : 1));
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
  await trimAbsensi(db);

  const cur = await db.prepare('SELECT * FROM pengaturan WHERE id = 1').first();
  await updatePengaturanDariClient(db, data.pengaturan, cur);

  // Nomor dokumen (laporan/kwitansi): updatePengaturanDariClient() SENGAJA
  // tidak menyentuh kolom ini (lihat catatan di helper itu) — restore backup
  // TIDAK BOLEH menimpanya mentah-mentah, karena kalau restore dilakukan ke
  // database yang masih dipakai (bukan disaster recovery ke database
  // kosong), nomor dokumen bisa MUNDUR dan bertabrakan dengan dokumen yang
  // sudah terlanjur dicetak setelah tanggal backup. Sebagai gantinya, per
  // tahun, ambil nilai TERBESAR antara counter yang ada sekarang dengan
  // yang ada di file backup — jadi restore ke database kosong tetap
  // membawa nomor lanjut dari backup, sementara restore ke database yang
  // masih berjalan tidak akan pernah membuat nomor mundur/dobel.
  const pgBackup = data.pengaturan || {};
  await gabungkanCounterDokumen(db, 'nomor_laporan_counter', cur.nomor_laporan_counter, pgBackup.nomorLaporanCounter);
  await gabungkanCounterDokumen(db, 'nomor_kwitansi_counter', cur.nomor_kwitansi_counter, pgBackup.nomorKwitansiCounter);

  return { ok: true, guruBelumSetPassword, guruUsernameBentrok };
}

/* Gabungkan counter nomor dokumen {tahun: urutan} dengan mengambil nilai
   TERBESAR per tahun — lihat catatan panggilannya di restoreBackup(). */
async function gabungkanCounterDokumen(db, kolom, jsonLama, objBackup) {
  if (!objBackup || typeof objBackup !== 'object') return;
  const lama = safeJsonParse(jsonLama, {});
  const gabungan = { ...lama };
  for (const tahun of Object.keys(objBackup)) {
    const nilaiBackup = Number(objBackup[tahun]) || 0;
    const nilaiLama = Number(lama[tahun]) || 0;
    gabungan[tahun] = Math.max(nilaiBackup, nilaiLama);
  }
  await db.prepare(`UPDATE pengaturan SET ${kolom} = ? WHERE id = 1`).bind(JSON.stringify(gabungan)).run();
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
  const sesi = await cekSesi(db, token);
  if (!sesi) return { ok: false, error: 'Sesi tidak valid, silakan login ulang.' };
  const role = sesi.role;
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
   save_all(). Alasannya: aktivitas dari sini harus tetap aman dari
   salinan lokal sesi lain yang belum tahu soal log ini — lihat
   catatan "AKTIVITAS: insert-kalau-belum-ada saja" di saveAll(). */
async function catatLogCetak(env, token, aksi, detail) {
  const db = env.DB;
  const sesi = await cekSesi(db, token);
  if (!sesi) return { ok: false, error: 'Sesi tidak valid, silakan login ulang.' };
  const role = sesi.role;
  if (role !== ROLE_BENDAHARA && role !== ROLE_KEPSEK && role !== ROLE_GURU) return { ok: false, error: 'Role tidak dikenali.' };
  if (!aksi) return { ok: false, error: 'Aksi tidak valid.' };

  let nama;
  if (role === ROLE_GURU) {
    // Guru ekstra hanya boleh mencatat log cetak (mis. Cetak Presensi
    // Absensi) untuk dirinya sendiri — nama diambil dari sesi (refId),
    // BUKAN dari input client, sama seperti simpanAbsensiGuru().
    const g = sesi.refId ? await db.prepare('SELECT nama FROM guru_ekstra WHERE id = ?').bind(sesi.refId).first() : null;
    nama = (g && g.nama) || 'Guru Ekstrakurikuler';
  } else {
    const pg = await db.prepare('SELECT * FROM pengaturan WHERE id = 1').first();
    nama = role === ROLE_KEPSEK ? (pg.nama_kepsek_akun || 'Kepala Sekolah') : (pg.bendahara || 'Bendahara');
  }
  await catatAktivitas(db, nama, role, aksi, detail || '');
  await trimAktivitas(db);
  return { ok: true };
}

/* =========================================================
   SIMPAN ABSENSI GURU SENDIRI (role 'guru') — guru mencatat
   kehadiran DIRINYA di satu ekstra, satu tanggal. Ini LANGKAH
   PERTAMA yang wajib dilakukan guru sebelum server mengizinkan dia
   menyimpan absensi siswa untuk ekstra & tanggal yang sama (dicek di
   simpanAbsensiGuru() di bawah — lihat komentar di sana). id baris
   DIBUAT DETERMINISTIK dari (ekstraId, tanggal) — bukan per guru,
   supaya kalau satu ekstra punya beberapa guru pembina bergantian,
   siapa pun dari mereka yang absen duluan tercatat, dan mengisi ulang
   tanggal yang sama otomatis MENIMPA (upsert), bukan dobel.
   ========================================================= */
async function simpanAbsensiGuruSendiri(env, token, ekstraId, tanggal, status, catatan) {
  const db = env.DB;
  const sesi = await cekSesi(db, token);
  if (!sesi) return { ok: false, error: 'Sesi tidak valid, silakan login ulang.' };
  if (sesi.role !== ROLE_GURU) return { ok: false, error: 'Hanya akun Guru Ekstra yang bisa mengisi absensi lewat rute ini.' };
  if (!ekstraId || !tanggal) return { ok: false, error: 'Ekstrakurikuler & tanggal wajib diisi.' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) return { ok: false, error: 'Format tanggal tidak valid.' };

  const g = await db.prepare('SELECT * FROM guru_ekstra WHERE id = ? AND aktif = 1').bind(sesi.refId).first();
  if (!g) return { ok: false, error: 'Akun guru ini tidak ditemukan atau sudah dinonaktifkan. Silakan hubungi Bendahara.' };
  const ekstraIds = safeJsonParse(g.ekstra_ids, []);
  if (!ekstraIds.includes(ekstraId)) return { ok: false, error: 'Anda tidak ditugaskan untuk mengisi absensi ekstrakurikuler ini.' };

  const STATUS_VALID = ['hadir', 'izin', 'sakit', 'alpa'];
  const statusPakai = STATUS_VALID.includes(status) ? status : 'hadir';
  const id = `abg_${ekstraId}_${tanggal}`;
  await db.prepare(`INSERT INTO absensi_guru(id,ekstra_id,guru_id,guru_nama,tanggal,status,catatan) VALUES (?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET guru_id=excluded.guru_id, guru_nama=excluded.guru_nama,
      status=excluded.status, catatan=excluded.catatan`)
    .bind(id, ekstraId, g.id, g.nama || '', tanggal, statusPakai, String(catatan || '').slice(0, 300)).run();
  await catatAktivitas(db, g.nama || 'Guru Ekstra', ROLE_GURU, 'Absen Guru Pembina', `${tanggal} — ${statusPakai}`);
  await trimAktivitas(db);
  return { ok: true };
}

/* =========================================================
   SIMPAN ABSENSI — GURU EKSTRA SAJA (role 'guru').
   Sengaja RPC TERSENDIRI (bukan lewat save_all() yang bendahara-only):
   guru ekstra bukan Bendahara jadi tidak boleh lewat save_all, tapi
   tetap harus bisa menulis absensi murid yang jadi tugasnya. Otorisasi
   diperiksa di server (guru cuma boleh menulis untuk ekstraId yang
   memang ada di guru_ekstra.ekstra_ids miliknya — refId dari sessions,
   BUKAN dari input client, supaya tidak bisa dipalsukan lewat curl).
   id baris absensi DIBUAT DETERMINISTIK dari (ekstraId, tanggal, siswaId)
   supaya mengisi ulang tanggal yang sama otomatis MENIMPA, bukan dobel.

   WAJIB ABSEN GURU DULU: sebelum baris ini menulis absensi SISWA,
   dicek dulu apakah sudah ada baris absensi_guru untuk (ekstraId,
   tanggal) yang sama — kalau belum, ditolak dengan pesan jelas. Ini
   SENGAJA dicek di server (bukan cuma disembunyikan di UI lewat
   renderFormAmbilAbsensiHtml() di script_core.js) supaya urutannya
   benar-benar ditegakkan, tidak bisa dilewati lewat curl/DevTools.
   ========================================================= */
async function simpanAbsensiGuru(env, token, ekstraId, tanggal, catatan) {
  const db = env.DB;
  const sesi = await cekSesi(db, token);
  if (!sesi) return { ok: false, error: 'Sesi tidak valid, silakan login ulang.' };
  if (sesi.role !== ROLE_GURU) return { ok: false, error: 'Hanya akun Guru Ekstra yang bisa mengisi absensi lewat rute ini.' };
  if (!ekstraId || !tanggal) return { ok: false, error: 'Ekstrakurikuler & tanggal wajib diisi.' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) return { ok: false, error: 'Format tanggal tidak valid.' };
  if (!Array.isArray(catatan) || !catatan.length) return { ok: false, error: 'Belum ada data kehadiran siswa untuk disimpan.' };

  const g = await db.prepare('SELECT * FROM guru_ekstra WHERE id = ? AND aktif = 1').bind(sesi.refId).first();
  if (!g) return { ok: false, error: 'Akun guru ini tidak ditemukan atau sudah dinonaktifkan. Silakan hubungi Bendahara.' };
  const ekstraIds = safeJsonParse(g.ekstra_ids, []);
  if (!ekstraIds.includes(ekstraId)) return { ok: false, error: 'Anda tidak ditugaskan untuk mengisi absensi ekstrakurikuler ini.' };

  const absenGuruAda = await db.prepare('SELECT 1 FROM absensi_guru WHERE id = ?').bind(`abg_${ekstraId}_${tanggal}`).first();
  if (!absenGuruAda) {
    return { ok: false, error: 'Isi absensi Anda sendiri (Guru Pembina) untuk tanggal ini dulu, sebelum mengisi absensi siswa.' };
  }

  const STATUS_VALID = ['hadir', 'izin', 'sakit', 'alpa'];
  const batch = [];
  for (const it of catatan) {
    if (!it || !it.siswaId) continue;
    const status = STATUS_VALID.includes(it.status) ? it.status : 'hadir';
    const id = `ab_${ekstraId}_${tanggal}_${it.siswaId}`;
    batch.push(db.prepare(`INSERT INTO absensi(id,ekstra_id,siswa_id,tanggal,status,catatan,dicatat_oleh) VALUES (?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET status=excluded.status, catatan=excluded.catatan, dicatat_oleh=excluded.dicatat_oleh`)
      .bind(id, ekstraId, it.siswaId, tanggal, status, String(it.catatan || '').slice(0, 300), g.nama || ''));
  }
  if (!batch.length) return { ok: false, error: 'Tidak ada data kehadiran siswa yang valid untuk disimpan.' };
  await db.batch(batch);
  await trimAbsensi(db);
  await catatAktivitas(db, g.nama || 'Guru Ekstra', ROLE_GURU, 'Catat Absensi', `${batch.length} siswa dicatat — ${tanggal}`);
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
    case 'simpan_absensi_guru': return simpanAbsensiGuru(env, body.p_token, body.p_ekstra_id, body.p_tanggal, body.p_catatan);
    case 'simpan_absensi_guru_sendiri': return simpanAbsensiGuruSendiri(env, body.p_token, body.p_ekstra_id, body.p_tanggal, body.p_status, body.p_catatan);
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

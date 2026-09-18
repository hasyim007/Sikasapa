/* =========================================================
   SIKasapa — inti aplikasi (dipakai bersama oleh index.html,
   login.html, admin.html). SATU proyek Cloudflare Worker: frontend
   (folder public/, file ini termasuk) dan backend (src/index.js)
   di-deploy bersamaan lewat "wrangler deploy", jadi keduanya SELALU
   satu origin yang sama — panggilan API cukup path relatif /rpc/<nama>,
   tidak perlu URL server terpisah (tidak ada lagi config.js/WORKER_URL).
   Database: D1 (SQLite) SAJA, tidak ada R2/object storage — gambar
   (logo, bukti pengeluaran) disimpan langsung sebagai data URL base64
   di kolom D1, lihat kompresGambar() di bawah.
   ========================================================= */
function seedDB(){
  return {
    ekskul: [
      { id:'ek1', nama:'Futsal', pembina:'Pak Andi Wijaya', jenisPembayaran:'pertemuan', tarif:5000, hariJadwal:['Kamis','Sabtu'], warna:'#1769D1' },
      { id:'ek2', nama:'Pramuka', pembina:'Bu Siti Rahma', jenisPembayaran:'bulanan', tarif:20000, hariJadwal:['Jumat'], warna:'#10B981' },
      { id:'ek3', nama:'Tari Tradisional', pembina:'Bu Dewi Lestari', jenisPembayaran:'bulanan', tarif:25000, hariJadwal:['Selasa'], warna:'#6366F1' },
      { id:'ek4', nama:'Silat', pembina:'Pak Budi Santoso', jenisPembayaran:'pertemuan', tarif:7000, hariJadwal:['Rabu','Sabtu'], warna:'#F43F5E' },
    ],
    siswa: [
      { id:'sw1', nama:'Ahmad Rizki', kelas:'V A', ekskulIds:['ek1','ek2'], aktif:true, ekstraAbsensiIds:[] },
      { id:'sw2', nama:'Bunga Citra', kelas:'IV B', ekskulIds:['ek3'], aktif:true, ekstraAbsensiIds:[] },
      { id:'sw3', nama:'Candra Kirana', kelas:'VI A', ekskulIds:['ek1','ek4'], aktif:true, ekstraAbsensiIds:[] },
      { id:'sw4', nama:'Dewi Anggraini', kelas:'V B', ekskulIds:['ek2'], aktif:true, ekstraAbsensiIds:[] },
      { id:'sw5', nama:'Eko Prasetyo', kelas:'IV A', ekskulIds:['ek4'], aktif:true, ekstraAbsensiIds:[] },
      { id:'sw6', nama:'Fitri Handayani', kelas:'VI B', ekskulIds:['ek3','ek2'], aktif:true, ekstraAbsensiIds:[] },
    ],
    pemasukan: [
      { id:'pm1', siswaId:'sw1', ekskulId:'ek1', jenis:'pertemuan', periode:'2026-08-06', nominal:5000, tanggalBayar:'2026-08-06', keterangan:'' },
      { id:'pm2', siswaId:'sw3', ekskulId:'ek1', jenis:'pertemuan', periode:'2026-08-06', nominal:5000, tanggalBayar:'2026-08-06', keterangan:'' },
      { id:'pm3', siswaId:'sw2', ekskulId:'ek3', jenis:'bulanan', periode:'2026-08', nominal:25000, tanggalBayar:'2026-08-03', keterangan:'' },
      { id:'pm4', siswaId:'sw4', ekskulId:'ek2', jenis:'bulanan', periode:'2026-08', nominal:20000, tanggalBayar:'2026-08-04', keterangan:'' },
      { id:'pm5', siswaId:'sw5', ekskulId:'ek4', jenis:'pertemuan', periode:'2026-08-08', nominal:7000, tanggalBayar:'2026-08-08', keterangan:'' },
      { id:'pm6', siswaId:'sw1', ekskulId:'ek2', jenis:'bulanan', periode:'2026-07', nominal:20000, tanggalBayar:'2026-07-05', keterangan:'' },
    ],
    pengeluaran: [
      { id:'px1', ekskulId:'ek1', kategori:'Peralatan', nominal:150000, tanggal:'2026-08-05', keterangan:'Beli bola futsal baru', bukti:null },
      { id:'px2', ekskulId:'ek2', kategori:'Konsumsi', nominal:80000, tanggal:'2026-08-02', keterangan:'Snack kegiatan camping mini', bukti:null },
      { id:'px3', ekskulId:'ek4', kategori:'Transport Lomba', nominal:250000, tanggal:'2026-07-28', keterangan:'Transport lomba silat kecamatan', bukti:null },
    ],
    kategoriPengeluaran: ['Peralatan','Transport Lomba','Konsumsi','Seragam','Piala/Penghargaan','Lainnya'],
    aktivitas: [],
    // Jenis ekstrakurikuler UNTUK ABSENSI (menu "Kelola Absensi") — SENGAJA
    // terpisah dari `ekskul` di atas (yang ada iurannya), supaya sekolah
    // bisa punya ekstra yang cuma perlu absensi tanpa kas.
    ekstraAbsensi: [],
    // Akun login guru ekstra (dibuat Bendahara lewat menu Pengaturan).
    // password HANYA terisi kalau memang sedang diset/diganti (sama
    // seperti pola pg.password di bawah) — tidak pernah berisi hash.
    guru: [],
    // Catatan kehadiran per (ekstraId, tanggal, siswaId).
    absensi: [],
    // Catatan kehadiran GURU EKSTRA sendiri per (ekstraId, tanggal) — wajib
    // diisi guru dulu sebelum mengisi absensi siswa di atas.
    absensiGuru: [],
    // PERBAIKAN: daftar id yang HARUS dihapus di server saat saveDB()
    // berikutnya — lihat tandaiHapus() & CATATAN PERBAIKAN BESAR di
    // save_all(). save_all() sekarang cuma UPSERT
    // dari array ekskul/siswa/pemasukan/dst di atas (tidak pernah
    // menghapus baris hanya karena baris itu tidak ada di array), supaya
    // salinan lokal yang basi (tab lama, sesi lain) tidak bisa diam-diam
    // menghapus balik data yang ditambahkan sesi lain. Penghapusan yang
    // BENAR-BENAR dimaksud pengguna (klik "Hapus") harus didaftarkan di
    // sini secara eksplisit supaya tetap tersampaikan ke server.
    hapus: { ekskul:[], siswa:[], pemasukan:[], pengeluaran:[], kategoriPengeluaran:[], ekstraAbsensi:[], guru:[], absensi:[], absensiGuru:[] },
    pengaturan: {
      kopLines:[
        {text:'SDN 01 Papahan', size:14, bold:true},
        {text:'Jl. Papahan, Tasikmadu, Karanganyar, Jawa Tengah', size:10, bold:false}
      ],
      tahunAjaran:'2026/2027',
      logo:null,
      kepalaSekolah:'',
      nipKepsek:'',
      bendahara:'',
      nipBendahara:'',
      username:'bendahara',
      password:'sikasapa123',
      namaKepsekAkun:'',
      usernameKepsek:'kepsek',
      passwordKepsek:'kepsek123',
      publikNamaWeb:'SIKASAPA',
      publikLogo:null,
      publikTagline:'Sistem Informasi Keuangan Ekstrakurikuler',
      // Konten hero halaman publik (menu admin "Halaman Publik") — lihat
      // renderPublicScreenContent(). publikDeskripsi KOSONG = pakai
      // kalimat bawaan yang otomatis menyisipkan nama sekolah.
      publikEyebrow:'Layanan Wali Murid',
      publikHeadline1:'Pembayaran',
      publikHeadline2:'Ekstrakurikuler',
      publikDeskripsi:'',
      publikChip1:'Data Aman & Resmi Sekolah',
      publikChip2:'Hasil Real-time',
      publikChip3:'Tanpa Perlu Aplikasi',
      nomorLaporanCounter:{},
      nomorKwitansiCounter:{},
      hariLibur:[],
      // Template pesan WhatsApp menu "Pengingat Pembayaran" — placeholder
      // yang dikenali: {namaSiswa} {waliNama} {kelas} {ekskul} {daftarBulan}
      // {totalTunggakan} {jumlahPertemuanKurang} {namaSekolah}. Lihat
      // susunPesanPengingat().
      templateWaBulanan: `Assalamu'alaikum Bapak/Ibu wali dari ananda {namaSiswa} ({kelas}), mohon izin mengingatkan bahwa iuran ekstrakurikuler {ekskul} untuk bulan {daftarBulan} sebesar {totalTunggakan} belum kami terima. Kami mohon kesediaan Bapak/Ibu untuk berkenan melakukan pembayaran secepatnya. Atas perhatian dan kerja samanya, kami ucapkan terima kasih. Wassalamu'alaikum warahmatullahi wabarakatuh.`,
      templateWaPertemuan: `Assalamu'alaikum Bapak/Ibu wali dari ananda {namaSiswa} ({kelas}), mohon izin mengingatkan bahwa iuran ekstrakurikuler {ekskul} per pertemuan masih kurang {jumlahPertemuanKurang}x pertemuan (estimasi {totalTunggakan}) pada bulan {daftarBulan}. Kami mohon kesediaan Bapak/Ibu untuk berkenan melakukan pembayaran secepatnya. Atas perhatian dan kerja samanya, kami ucapkan terima kasih. Wassalamu'alaikum warahmatullahi wabarakatuh.`
    }
  };
}

/* Menjaga kompatibilitas ke belakang: DB lama (backup lama / sebelum fitur
   role & log aktivitas ada) mungkin belum punya field-field baru ini. */
function normalizeDB(db){
  if(!db || typeof db !== 'object') return seedDB();
  if(!Array.isArray(db.aktivitas)) db.aktivitas = [];
  if(!db.pengaturan) db.pengaturan = seedDB().pengaturan;
  const pg = db.pengaturan;
  /* Migrasi kop surat lama (field terpisah namaSekolah/alamatSekolah) ke
     format baru kopLines (satu kolom isian, per baris punya gaya sendiri). */
  if(!Array.isArray(pg.kopLines) || !pg.kopLines.length){
    const migrasi = [];
    if(pg.namaSekolah) migrasi.push({text:pg.namaSekolah, size:14, bold:true});
    if(pg.alamatSekolah) migrasi.push({text:pg.alamatSekolah, size:10, bold:false});
    pg.kopLines = migrasi.length ? migrasi : [{text:'SDN 01 Papahan', size:14, bold:true}];
  }
  pg.kopLines = pg.kopLines.map(l=> (l && typeof l === 'object') ? {text:String(l.text||''), size:parseInt(l.size,10)||12, bold:!!l.bold} : {text:String(l||''), size:12, bold:false});
  delete pg.namaSekolah; delete pg.alamatSekolah;
  if(typeof pg.usernameKepsek !== 'string' || !pg.usernameKepsek) pg.usernameKepsek = 'kepsek';
  /* Catatan: password/passwordKepsek SENGAJA tidak diberi nilai
     default di sini. Password disimpan sebagai hash di server dan
     tidak pernah dikirim ke client — field ini hanya terisi kalau
     admin benar-benar mengetik password baru di form Pengaturan
     (lihat simpanPengaturan()). Kalau di-default-kan di sini,
     setiap kali data disimpan (termasuk saat mengubah data lain,
     bukan akun) password akan ikut ter-reset ke nilai default. */
  if(typeof pg.namaKepsekAkun !== 'string') pg.namaKepsekAkun = '';
  if(typeof pg.publikNamaWeb !== 'string' || !pg.publikNamaWeb) pg.publikNamaWeb = 'SIKASAPA';
  if(typeof pg.publikTagline !== 'string') pg.publikTagline = 'Sistem Informasi Keuangan Ekstrakurikuler';
  if(typeof pg.publikLogo !== 'string') pg.publikLogo = null;
  if(typeof pg.publikEyebrow !== 'string' || !pg.publikEyebrow) pg.publikEyebrow = 'Layanan Wali Murid';
  if(typeof pg.publikHeadline1 !== 'string' || !pg.publikHeadline1) pg.publikHeadline1 = 'Pembayaran';
  if(typeof pg.publikHeadline2 !== 'string' || !pg.publikHeadline2) pg.publikHeadline2 = 'Ekstrakurikuler';
  if(typeof pg.publikDeskripsi !== 'string') pg.publikDeskripsi = '';
  if(typeof pg.publikChip1 !== 'string' || !pg.publikChip1) pg.publikChip1 = 'Data Aman & Resmi Sekolah';
  if(typeof pg.publikChip2 !== 'string' || !pg.publikChip2) pg.publikChip2 = 'Hasil Real-time';
  if(typeof pg.publikChip3 !== 'string' || !pg.publikChip3) pg.publikChip3 = 'Tanpa Perlu Aplikasi';
  /* Nomor urut untuk dokumen resmi (Laporan & Kwitansi), disimpan per tahun
     supaya nomornya reset ke 001 tiap tahun ajaran baru tapi tetap urut
     (tidak pernah "001" berulang-ulang) selama tahun berjalan. Sebelumnya
     nomor laporan hardcode "001" untuk setiap kali cetak — diperbaiki di sini. */
  if(!pg.nomorLaporanCounter || typeof pg.nomorLaporanCounter !== 'object') pg.nomorLaporanCounter = {};
  if(!pg.nomorKwitansiCounter || typeof pg.nomorKwitansiCounter !== 'object') pg.nomorKwitansiCounter = {};
  /* Hari libur ekstra (di luar akhir pekan) — tanggal-tanggal ini
     dikecualikan dari Estimasi Tunggakan Per Pertemuan & Cetak Presensi.
     Lihat tanggalPertemuanBulan(). Backup lama (sebelum fitur ini ada)
     tidak punya field ini sama sekali, jadi default ke array kosong. */
  if(!Array.isArray(pg.hariLibur)) pg.hariLibur = [];
  pg.hariLibur = Array.from(new Set(pg.hariLibur.filter(t=>typeof t==='string' && /^\d{4}-\d{2}-\d{2}$/.test(t)))).sort();
  /* Template pesan WhatsApp (menu Pengingat Pembayaran) — backup lama
     belum punya field ini sama sekali, default ke teks bawaan yang sopan. */
  if(typeof pg.templateWaBulanan !== 'string' || !pg.templateWaBulanan.trim()){
    pg.templateWaBulanan = `Assalamu'alaikum Bapak/Ibu wali dari ananda {namaSiswa} ({kelas}), mohon izin mengingatkan bahwa iuran ekstrakurikuler {ekskul} untuk bulan {daftarBulan} sebesar {totalTunggakan} belum kami terima. Kami mohon kesediaan Bapak/Ibu untuk berkenan melakukan pembayaran secepatnya. Atas perhatian dan kerja samanya, kami ucapkan terima kasih. Wassalamu'alaikum warahmatullahi wabarakatuh.`;
  }
  if(typeof pg.templateWaPertemuan !== 'string' || !pg.templateWaPertemuan.trim()){
    pg.templateWaPertemuan = `Assalamu'alaikum Bapak/Ibu wali dari ananda {namaSiswa} ({kelas}), mohon izin mengingatkan bahwa iuran ekstrakurikuler {ekskul} per pertemuan masih kurang {jumlahPertemuanKurang}x pertemuan (estimasi {totalTunggakan}) pada bulan {daftarBulan}. Kami mohon kesediaan Bapak/Ibu untuk berkenan melakukan pembayaran secepatnya. Atas perhatian dan kerja samanya, kami ucapkan terima kasih. Wassalamu'alaikum warahmatullahi wabarakatuh.`;
  }
  if(!Array.isArray(db.ekskul)) db.ekskul = [];
  /* Tautan opsional ke ekstra_absensi (menu "Kelola Absensi") — backup
     lama / data sebelum fitur ini belum punya field ini sama sekali. */
  db.ekskul.forEach(ek=>{
    if(typeof ek.ekstraAbsensiId !== 'string' || !ek.ekstraAbsensiId) ek.ekstraAbsensiId = null;
    /* Aktivasi Bulan & Hari Libur per ekstrakurikuler (menu "Aktivasi
       Bulan & Libur") — backup lama / data dari sebelum fitur ini ada
       belum punya field ini sama sekali, default ke "semua bulan
       aktif, belum ada libur khusus". */
    if(!ek.bulanAktif || typeof ek.bulanAktif !== 'object' || Array.isArray(ek.bulanAktif)) ek.bulanAktif = {};
    /* Buang key yang bukan format "YYYY-MM" (mis. peninggalan format lama
       "7") — sama persis regex BULAN_AKTIF_KEY_RE di server, supaya data
       sampah tidak nyangkut selamanya di client walau belum pernah disimpan
       ulang lewat menu Aktivasi Bulan & Libur sejak migrasi format ini. */
    Object.keys(ek.bulanAktif).forEach(key=>{
      if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(key)) delete ek.bulanAktif[key];
    });
    if(!Array.isArray(ek.hariLibur)) ek.hariLibur = [];
    ek.hariLibur = ek.hariLibur
      .filter(t=> t && typeof t==='object' && typeof t.tanggal==='string' && /^\d{4}-\d{2}-\d{2}$/.test(t.tanggal))
      .map(t=>({ tanggal:t.tanggal, keterangan: typeof t.keterangan==='string' ? t.keterangan : '' }))
      .sort((a,b)=>a.tanggal.localeCompare(b.tanggal));
  });
  if(!Array.isArray(db.siswa)) db.siswa = [];
  db.siswa.forEach(s=>{
    if(typeof s.waliNama !== 'string') s.waliNama = '';
    if(typeof s.waliHp !== 'string') s.waliHp = '';
    if(typeof s.aktif !== 'boolean') s.aktif = true;
    if(!Array.isArray(s.ekstraAbsensiIds)) s.ekstraAbsensiIds = [];
  });
  if(!Array.isArray(db.pemasukan)) db.pemasukan = [];
  if(!Array.isArray(db.pengeluaran)) db.pengeluaran = [];
  if(!Array.isArray(db.kategoriPengeluaran)) db.kategoriPengeluaran = [];
  /* Modul Absensi Ekstrakurikuler (guru ekstra) — lihat "Kelola Absensi".
     Backup lama / DB seed lama belum punya array-array ini sama sekali. */
  if(!Array.isArray(db.ekstraAbsensi)) db.ekstraAbsensi = [];
  db.ekstraAbsensi.forEach(e=>{
    if(typeof e.keterangan !== 'string') e.keterangan = '';
    if(typeof e.warna !== 'string' || !e.warna) e.warna = '#1769D1';
  });
  if(!Array.isArray(db.guru)) db.guru = [];
  db.guru.forEach(g=>{
    if(!Array.isArray(g.ekstraIds)) g.ekstraIds = [];
    if(typeof g.aktif !== 'boolean') g.aktif = true;
  });
  if(!Array.isArray(db.absensi)) db.absensi = [];
  /* Kehadiran GURU EKSTRA itu sendiri (menu "Kelola Absensi" — guru wajib
     mengisi ini dulu sebelum mengisi absensi siswa). Backup lama / data
     dari sebelum fitur ini ada belum punya array ini sama sekali. */
  if(!Array.isArray(db.absensiGuru)) db.absensiGuru = [];
  /* Backup lama / data langsung dari get_app_data() tidak punya field
     hapus sama sekali (server tidak pernah mengirimkannya balik — itu
     murni penanda sisi klien) — selalu inisialisasi supaya tandaiHapus()
     & saveDB() aman dipanggil kapan pun. */
  if(!db.hapus || typeof db.hapus !== 'object') db.hapus = {};
  ['ekskul','siswa','pemasukan','pengeluaran','kategoriPengeluaran','ekstraAbsensi','guru','absensi','absensiGuru'].forEach(k=>{
    if(!Array.isArray(db.hapus[k])) db.hapus[k] = [];
  });
  return db;
}

/* Menandai 1 id sebagai "harus dihapus di server" pada saveDB() berikutnya
   — lihat CATATAN PERBAIKAN BESAR di save_all().
   Dipanggil oleh deleteEkskul()/deleteSiswa()/deletePemasukan()/
   deletePengeluaran()/hapusKategori() SEBELUM/SESUDAH memfilter array
   lokal DB.x — sekadar memfilter array lokal saja TIDAK LAGI cukup untuk
   membuat server ikut menghapusnya, karena save_all() sekarang tidak
   pernah menyimpulkan penghapusan dari "id ini tidak ada di array yang
   dikirim". Daftar ini sengaja tidak dikosongkan setelah terkirim
   (idempotent — menghapus id yang sudah tidak ada lagi di server bukan
   masalah), supaya aman walau saveDB() sempat gagal terkirim. */
function tandaiHapus(tipe, id){
  if(!DB || !DB.hapus) return;
  if(!Array.isArray(DB.hapus[tipe])) DB.hapus[tipe] = [];
  if(!DB.hapus[tipe].includes(id)) DB.hapus[tipe].push(id);
}

/* =========================================================
   SIKasapa — DATA LAYER (Cloudflare Worker + D1 + R2)
   Ganti dari localStorage: DB sekarang dimuat & disimpan lewat
   Worker Cloudflare (satu origin yang sama, lihat rpc() di bawah).
   ========================================================= */
const SESSION_KEY = 'sikasapa_session';

function getSession(){
  try{ const raw = localStorage.getItem(SESSION_KEY); return raw ? JSON.parse(raw) : null; }
  catch(e){ return null; }
}
function getToken(){ const s = getSession(); return s ? s.token : null; }
function setSession(sess){ localStorage.setItem(SESSION_KEY, JSON.stringify(sess)); }
function clearSession(){ localStorage.removeItem(SESSION_KEY); }

/* Data layer: Cloudflare Worker di satu origin yang sama dengan
   halaman ini (lihat src/index.js di root proyek) — semua akses data
   HANYA lewat rute /rpc/<nama> (path relatif, tidak perlu URL absolut
   lagi karena frontend & backend satu deploy). Nama & bentuk argumen
   (p_token, p_data, dst.) sengaja dipertahankan sama seperti versi
   Supabase lama, jadi seluruh titik pemanggilan rpc(...) di file ini
   TIDAK berubah. */
async function rpc(name, args){
  const res = await fetch(`/rpc/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(args || {}),
  });
  let json = null;
  try{ json = await res.json(); }catch(e){ /* respons bukan JSON */ }
  if(!res.ok && (!json || json.ok !== false)){
    throw new Error((json && json.error) || `Permintaan ke server gagal (${res.status}).`);
  }
  return json;
}

/* Dipanggil oleh halaman admin (admin.html) — butuh token valid.
   PERBAIKAN: dulu fungsi ini mengembalikan boolean tunggal, jadi
   initAdminPage() tidak bisa membedakan "token memang tidak valid"
   (server menjawab ok:false, mis. sesi kedaluwarsa) dari "server/
   jaringan sedang bermasalah" (fetch gagal/timeout — lihat rpc()).
   Akibatnya gangguan koneksi sesaat (mis. wifi sekolah putus-nyambung)
   membuat pengguna yang sebenarnya masih login SAH ikut ter-logout
   paksa (clearSession() dipanggil) hanya karena satu request gagal —
   padahal bagian lain aplikasi (saveDB(), restoreDB(), dst.) sengaja
   TIDAK memperlakukan gagal-konek sebagai sesi tidak valid. Sekarang
   mengembalikan objek { ok, invalidSession, error } supaya pemanggil
   bisa membedakan dua kasus itu. Pemanggil lama yang cuma
   `await fetchDBFromServer()` tanpa memeriksa nilai baliknya (lihat
   simpanAbsensi() & importBackup()) tetap aman karena tidak berubah
   perilakunya. */
async function fetchDBFromServer(){
  try{
    const json = await rpc('get_app_data', { p_token: getToken()||'' });
    if(json.ok){ DB = normalizeDB(json.db); return { ok:true }; }
    // Server menjawab dengan jelas (bukan gagal konek) tapi ok:false —
    // ini SELALU berarti sesi tidak valid/kedaluwarsa (lihat getAppData()
    // di src/index.js, satu-satunya jalur ok:false di RPC ini).
    return { ok:false, invalidSession:true, error: json.error };
  }catch(e){
    console.error(e);
    // rpc() melempar Error di sini kalau request gagal terkirim/dibalas
    // (offline, timeout, error 5xx) — BUKAN sesi tidak valid.
    return { ok:false, invalidSession:false, error: e.message };
  }
}

/* Dipanggil oleh halaman publik (index.html) — tanpa login,
   hanya berisi field yang aman ditampilkan ke wali murid. */
async function fetchPublicDB(){
  try{
    const json = await rpc('get_public_data', {});
    if(json.ok){ DB = normalizeDB(json.db); return true; }
    return false;
  }catch(e){ console.error(e); return false; }
}

/* saveDB tetap SINKRON dari sisi pemanggil (mengikuti ratusan titik
   pemanggilan di kode asli): DB lokal sudah dianggap tersimpan dan
   langsung dipakai untuk render ulang, sementara penyimpanan ke
   Worker berjalan di background lewat RPC save_all.
   PERBAIKAN: save_all() di server sekarang UPSERT-saja per baris — TIDAK PERNAH lagi
   menghapus data hanya karena data itu tidak ada di array DB yang
   dikirim. Penghapusan yang benar-benar dimaksud pengguna dikirim lewat
   DB.hapus (lihat tandaiHapus()), yang otomatis ikut terkirim di sini
   karena bagian dari objek db yang sama.
   PERBAIKAN (advisory: potensi lost update): save_all() di server
   meng-UPSERT tiap baris TANPA nomor versi/urutan, jadi kalau dua
   panggilan saveDB() terjadi berturut-turut dalam hitungan detik dan
   request jaringannya tiba di server dengan urutan TERBALIK (network
   reordering — mis. request pertama sempat retry/lambat), nilai yang
   lebih baru bisa tertimpa balik oleh nilai yang lebih lama. Server
   tidak (dan sengaja tidak diubah di sini) diberi version-check,
   supaya tidak perlu migrasi skema. Sebagai gantinya, request save_all
   di-SERIALISASI di sini: panggilan baru menunggu panggilan sebelumnya
   benar-benar selesai (respons diterima) sebelum benar-benar dikirim,
   jadi tidak pernah ada dua request save_all yang "in-flight"
   bersamaan — urutan kedatangan di server selalu sama dengan urutan
   pemanggilan di klien, dan karena `db` dikirim sebagai referensi
   (bukan snapshot beku), request yang tertunda di antrean otomatis
   ikut membawa perubahan terbaru saat akhirnya dikirim. */
let _saveDBQueue = Promise.resolve();
function saveDB(db){
  try{
    const token = getToken();
    _saveDBQueue = _saveDBQueue
      .catch(()=>{}) // 1 request gagal tidak boleh menghentikan antrean berikutnya
      .then(()=> rpc('save_all', { p_token: token, p_data: db }))
      .then(res=>{
        if(!res || !res.ok){
          showToast('Gagal menyimpan ke database: ' + (res && res.error ? res.error : 'tidak diketahui'), 'error');
        }
      })
      .catch(err=>{
        console.error('Gagal menyimpan ke server:', err);
        showToast('Tidak bisa terhubung ke server. Periksa koneksi internet.', 'error');
      });
    return true;
  }catch(e){
    console.error('Gagal menyimpan data:', e);
    showToast('Gagal menyimpan data.', 'error');
    return false;
  }
}

/* Dipakai HANYA oleh importBackup() (menu Pengaturan > Pulihkan dari
   Backup) — memanggil RPC restore_backup(), BUKAN save_all(). Berbeda
   dari saveDB(): restore memang secara sengaja harus MENGHAPUS data yang
   dibuat setelah tanggal backup, jadi tidak bisa lewat save_all() yang
   sekarang upsert-saja. Lihat catatan di restore_backup()
   dan di pemanggil importBackup() di atas. */
/* Mengembalikan Promise<boolean> (beda dari saveDB() yang fire-and-forget)
   supaya importBackup() bisa MENUNGGU hasilnya sebelum menyegarkan DB dari
   server — lihat catatan di importBackup() kenapa itu penting. */
/* Mengembalikan objek res dari server (bukan cuma boolean) supaya
   importBackup() bisa menampilkan catatan guruBelumSetPassword /
   guruUsernameBentrok dari restoreBackup() di src/index.js — lihat
   catatan di sana. false = gagal total (RPC error/koneksi). */
async function restoreDB(db){
  try{
    const token = getToken();
    const res = await rpc('restore_backup', { p_token: token, p_data: db });
    if(!res || !res.ok){
      showToast('Gagal memulihkan backup ke database: ' + (res && res.error ? res.error : 'tidak diketahui'), 'error');
      return false;
    }
    return res;
  }catch(e){
    console.error('Gagal memulihkan backup ke server:', e);
    showToast('Tidak bisa terhubung ke server. Periksa koneksi internet.', 'error');
    return false;
  }
}

/* =========================================================
   CETAK/UNDUH DOKUMEN — nomor urut & log aktivitas
   PERBAIKAN: dulu cetakLaporan()/unduhLaporanPdf()/cetakPresensi()/
   cetakKwitansi()/cetakLaporanGabungan() semuanya memanggil
   saveDB(DB) tanpa syarat untuk mencatat log aktivitas. saveDB()
   memanggil RPC save_all(), yang di server DITOLAK untuk role selain
   bendahara — padahal menu Laporan & Cetak Presensi memang sengaja
   tidak dikunci bendaharaOnly (Kepsek boleh lihat/cetak). Akibatnya
   Kepsek selalu dapat toast error palsu "Gagal menyimpan ke
   database" walau dokumennya sendiri berhasil tercetak.
   Ini juga mengungkap bug kedua: nomor laporan/kwitansi di-increment
   di memori browser lalu baru tersimpan lewat saveDB() — kalau yang
   mencetak Kepsek, nomornya naik di layar tapi gagal tersimpan ke
   server, jadi cetakan berikutnya oleh siapa pun dapat nomor yang
   sama lagi (nomor ganda). Dua tab bendahara yang cetak nyaris
   bersamaan juga bisa dapat nomor sama (race condition), karena
   masing-masing tab punya salinan counter sendiri di memori.
   Diperbaiki dengan memindahkan increment nomor & pencatatan log
   cetak ke dua RPC ringan di server (ambil_nomor_dokumen &
   catat_log_cetak) yang: (a) atomik
   (increment dilakukan lewat satu statement UPDATE, atomik di level
   SQLite (Cloudflare D1) per baris, jadi aman dipanggil bersamaan dari tab mana
   pun), dan (b) boleh dipanggil kedua role, karena mencetak/melihat
   laporan bukan aksi mengubah data keuangan. */

/* Meminta nomor urut BARU (atomik) dari server untuk dokumen resmi
   (Laporan/Kwitansi). Melempar error kalau gagal — pemanggil WAJIB
   membatalkan proses cetak (jangan sampai dokumen tercetak dengan
   nomor yang salah/tidak tercatat di server). */
async function ambilNomorServer(tipe){
  const res = await rpc('ambil_nomor_dokumen', { p_token: getToken()||'', p_tipe: tipe });
  if(!res || !res.ok) throw new Error((res && res.error) || 'Gagal mengambil nomor dokumen dari server.');
  // Sinkronkan salinan lokal juga, supaya tetap konsisten kalau ada kode lain yang membacanya.
  const pg = DB.pengaturan;
  const key = tipe === 'laporan' ? 'nomorLaporanCounter' : 'nomorKwitansiCounter';
  if(!pg[key] || typeof pg[key] !== 'object') pg[key] = {};
  pg[key][res.tahun] = res.urut;
  return res; // {ok:true, urut, tahun}
}

/* Mencatat 1 baris log aktivitas untuk aksi cetak/unduh dokumen lewat
   RPC catat_log_cetak — BUKAN lewat saveDB()/save_all() yang khusus
   bendahara. Sama seperti saveDB(), ini "fire-and-forget": UI sudah
   menampilkan aksinya (lewat catatAktivitas() secara lokal), jadi
   kegagalan di sini hanya dicatat ke console, tidak perlu toast yang
   mengganggu — dokumennya sendiri tetap berhasil tercetak/terunduh. */
function logCetak(aksi, detail){
  try{
    rpc('catat_log_cetak', { p_token: getToken()||'', p_aksi: aksi, p_detail: detail || '' })
      .then(res=>{
        if(!res || !res.ok) console.error('Gagal mencatat log cetak:', res && res.error);
      })
      .catch(err=> console.error('Gagal mencatat log cetak:', err));
  }catch(e){ console.error('Gagal mencatat log cetak:', e); }
}

/* Kecilkan gambar (logo / bukti pengeluaran) di BROWSER, lalu simpan
   sebagai data URL base64 LANGSUNG di kolom D1 (lewat save_all()
   biasa) — tidak ada lagi upload terpisah ke R2/object storage.
   Resize ke maksimal `maxDim` piksel di sisi terpanjang + re-encode
   JPEG, supaya data URL-nya jauh di bawah batas 1 baris D1 (2 MB) dan
   tidak bikin tiap penyimpanan (save_all mengirim SELURUH data setiap
   kali) jadi berat. */
function kompresGambar(dataUrl, maxDim, kualitas){
  return new Promise((resolve, reject)=>{
    const img = new Image();
    img.onload = ()=>{
      let { width, height } = img;
      const sisiTerpanjang = Math.max(width, height);
      if(sisiTerpanjang > (maxDim||1000)){
        const skala = (maxDim||1000) / sisiTerpanjang;
        width = Math.round(width * skala);
        height = Math.round(height * skala);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff'; // dasar putih (JPEG tidak dukung transparan)
      ctx.fillRect(0,0,width,height);
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', kualitas||0.75));
    };
    img.onerror = ()=> reject(new Error('Gagal membaca gambar.'));
    img.src = dataUrl;
  });
}
/* Batas aman di sisi browser, harus SELALU lebih kecil dari batas
   server (MAX_GAMBAR_BYTES di cloudflare-worker/src/index.js). */
const BATAS_GAMBAR_BYTES = 1200000;
async function siapkanGambarUntukDisimpan(dataUrl, maxDim){
  if(!dataUrl) throw new Error('File kosong.');
  let hasil = await kompresGambar(dataUrl, maxDim||1000, 0.75);
  // Kalau masih kebesaran (foto sangat besar/detail), coba kompres ulang
  // lebih agresif sebelum menyerah.
  if(hasil.length > BATAS_GAMBAR_BYTES) hasil = await kompresGambar(dataUrl, 700, 0.6);
  if(hasil.length > BATAS_GAMBAR_BYTES) hasil = await kompresGambar(dataUrl, 500, 0.5);
  if(hasil.length > BATAS_GAMBAR_BYTES) throw new Error('Gambar masih terlalu besar setelah dikompres. Gunakan foto lain.');
  return hasil;
}

let DB = null;

/* Helpers */
function uid(prefix){ return prefix + Math.random().toString(36).slice(2,9); }
function rupiah(n){ return 'Rp ' + Math.round(n||0).toLocaleString('id-ID'); }
function ekskulById(id){ return DB.ekskul.find(e=>e.id===id); }
function siswaById(id){ return DB.siswa.find(s=>s.id===id); }
function ekstraAbsensiById(id){ return (DB.ekstraAbsensi||[]).find(e=>e.id===id); }

/* Cari ekskul (Data Ekstrakurikuler) yang ditautkan ke satu ekstra_absensi
   tertentu (menu Kelola Absensi) — dipakai untuk tahu apakah peserta
   ekstra itu "dikunci" mengikuti peserta ekskul, atau bebas dikelola
   sendiri. Satu ekstra_absensi hanya boleh ditautkan dari SATU ekskul
   (dijaga di submitEkskul()). */
function ekskulTertautKe(ekstraAbsensiId){
  return DB.ekskul.find(e=>e.ekstraAbsensiId===ekstraAbsensiId);
}

/* Sinkronkan siswa.ekstraAbsensiIds SATU siswa supaya konsisten dengan
   keikutsertaannya di ekskul yang ditautkan (ek.ekstraAbsensiId) —
   INI SUMBER KEBENARAN TUNGGAL untuk pasangan ekskul<->ekstra_absensi
   yang tertaut, supaya "Data Ekstrakurikuler" dan "Kelola Absensi"
   tidak bisa lagi punya 2 daftar peserta yang beda tanpa ketahuan.
   Ekstra_absensi yang TIDAK ditautkan ke ekskul mana pun tetap dikelola
   manual seperti biasa lewat openPesertaAbsensiManage() — baris
   ekstraAbsensiIds untuk id-id itu tidak disentuh di sini. */
function syncPesertaAbsensiDariEkskul(s){
  const ekstraTertaut = new Set(DB.ekskul.filter(e=>e.ekstraAbsensiId).map(e=>e.ekstraAbsensiId));
  const set = new Set((s.ekstraAbsensiIds||[]).filter(id=>!ekstraTertaut.has(id)));
  DB.ekskul.forEach(ek=>{
    if(ek.ekstraAbsensiId && (s.ekskulIds||[]).includes(ek.id)) set.add(ek.ekstraAbsensiId);
  });
  s.ekstraAbsensiIds = Array.from(set);
}

/* Jalankan syncPesertaAbsensiDariEkskul() untuk SEMUA siswa — dipanggil
   tiap kali pemetaan ekskul<->ekstra_absensi berubah (tautan baru/lepas
   di submitEkskul(), atau ekstra_absensi-nya dihapus). */
function syncSemuaPesertaAbsensiDariEkskul(){
  DB.siswa.forEach(syncPesertaAbsensiDariEkskul);
}
function guruById(id){ return (DB.guru||[]).find(g=>g.id===id); }
/* Siswa aktif yang terdaftar di satu jenis ekstra absensi tertentu. */
function pesertaAbsensi(ekstraId){ return DB.siswa.filter(s=>s.aktif!==false && (s.ekstraAbsensiIds||[]).includes(ekstraId)); }
function bulanNama(ym){
  if(!ym) return '-';
  const [y,m] = ym.split('-');
  const names=['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
  return names[parseInt(m,10)-1] + ' ' + y;
}
function tanggalIndo(d){
  if(!d) return '-';
  const dt = new Date(d+'T00:00:00');
  return dt.toLocaleDateString('id-ID',{day:'numeric', month:'long', year:'numeric'});
}
function escapeHtml(s){
  return String(s==null?'':s)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
}
/* Sama seperti JSON.stringify(), tapi khusus untuk disisipkan ke dalam
   atribut HTML yang dibungkus kutip SATU (onclick='...'). JSON.stringify()
   sendiri cuma meng-escape kutip DUA ("), bukan kutip satu ('), jadi
   kalau isinya (mis. nama siswa/wali/kategori) kebetulan mengandung kutip
   satu (mis. "Sya'ban", "Ma'ruf", "Al-Qur'an" — umum di sekolah tahfidz),
   atribut onclick-nya jadi tertutup lebih awal: tombolnya rusak, dan
   celah itu bisa disalahgunakan untuk menyelipkan HTML/atribut lain.
   Kutip satu di-escape jadi entitas HTML &#39; (BUKAN \' ala JS) karena
   ini konteks atribut HTML — browser mengurai entitas HTML dulu sebelum
   menyerahkan isinya ke parser JS saat onclick dieksekusi. */
function jsAttr(v){
  return JSON.stringify(v).replace(/'/g,'&#39;');
}
/* Sumber tunggal untuk "hari ini" di seluruh aplikasi — dulu beberapa
   fungsi memakai tanggal hardcode (sisa saat development/testing), yang
   menyebabkan fitur seperti Tunggakan, grafik tren, dan nomor laporan
   "beku" di satu tanggal tertentu. Sekarang semua mengacu ke sini. */
function hariIniDate(){ return new Date(); }
/* PENTING: jangan pakai .toISOString() di sini — itu selalu memakai UTC,
   sementara sekolah ini beroperasi di WIB (UTC+7), sehingga tanggal akan
   mundur 1 hari setiap jam 00:00–06:59 WIB. Gunakan Intl.DateTimeFormat
   dengan timeZone Asia/Jakarta (sama seperti tahunJakarta() di backend)
   supaya hasilnya selalu tanggal WIB yang benar, dalam format YYYY-MM-DD. */
function hariIniStr(){
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(hariIniDate());
}
function tanggalFileNow(){ return hariIniStr(); }
/* Ekspor CSV generik: rows = array-of-array, baris pertama dianggap header.
   Diberi BOM UTF-8 agar karakter non-ASCII tampil benar saat dibuka di Excel. */
function csvEscape(v){
  let s = String(v==null?'':v);
  /* Cegah CSV Formula Injection: field teks bebas (keterangan, nama, dll)
     yang diawali =, +, -, @, atau tab bisa dieksekusi sebagai formula kalau
     file CSV dibuka di Excel/Google Sheets (mis. "=HYPERLINK(...)" atau
     "=cmd|'/c calc'!A1"). Prefix dengan kutip tunggal supaya sel selalu
     dibaca sebagai teks, bukan formula. */
  if(/^[=+\-@\t\r]/.test(s)) s = "'"+s;
  return /[",\n\r]/.test(s) ? '"'+s.replace(/"/g,'""')+'"' : s;
}
function downloadCSV(filename, rows){
  const csv = rows.map(r=>r.map(csvEscape).join(',')).join('\r\n');
  const blob = new Blob(['\ufeff'+csv], { type:'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  showToast('Ekspor CSV berhasil diunduh.');
}
/* Kop surat disimpan sebagai daftar baris (kopLines), tiap baris punya
   ukuran huruf & status tebal sendiri, supaya admin cukup tempel teks kop
   sekali lalu atur tampilannya per baris di halaman Pengaturan. */
function kopLinesSafe(pg){
  const lines = (pg && Array.isArray(pg.kopLines)) ? pg.kopLines.filter(l=>l && String(l.text||'').length) : [];
  return lines.length ? lines : [{text:'SDN 01 Papahan', size:14, bold:true}];
}
function kopHtml(pg){
  return kopLinesSafe(pg).map(l=>`<div style="margin:1px 0; line-height:1.25; font-size:${l.size||12}px; font-weight:${l.bold?700:400};">${escapeHtml(l.text)}</div>`).join('');
}
function totalPemasukan(){ return DB.pemasukan.reduce((s,p)=>s+p.nominal,0); }
function totalPengeluaran(){ return DB.pengeluaran.reduce((s,p)=>s+p.nominal,0); }

/* =========================================================
   PAGINASI TABEL (untuk data yang bisa jadi panjang)
   ========================================================= */
const PAGE_SIZE = 15;
function paginateList(list, page){
  const totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  const p = Math.min(Math.max(1, page||1), totalPages);
  const start = (p-1) * PAGE_SIZE;
  return { items: list.slice(start, start+PAGE_SIZE), page:p, totalPages, total:list.length, start };
}
function paginationBar(pg, setPageExpr, viewId){
  if(pg.totalPages<=1) return '';
  const dari = pg.total===0 ? 0 : pg.start+1;
  const sampai = Math.min(pg.start+PAGE_SIZE, pg.total);
  return `
    <div class="flex items-center justify-between px-5 py-3.5 border-t border-slate-100 flex-wrap gap-2">
      <span class="text-xs text-slate-500">Menampilkan ${dari}–${sampai} dari ${pg.total} data</span>
      <div class="flex items-center gap-1.5">
        <button onclick="${setPageExpr}(${pg.page-1}); renderView('${viewId}')" ${pg.page<=1?'disabled':''} title="Halaman sebelumnya" aria-label="Halaman sebelumnya" class="w-8 h-8 rounded-lg glass text-slate-600 flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed"><i data-lucide="chevron-left" class="w-4 h-4"></i></button>
        <span class="text-xs font-semibold text-slate-600 px-2">Hal ${pg.page}/${pg.totalPages}</span>
        <button onclick="${setPageExpr}(${pg.page+1}); renderView('${viewId}')" ${pg.page>=pg.totalPages?'disabled':''} title="Halaman berikutnya" aria-label="Halaman berikutnya" class="w-8 h-8 rounded-lg glass text-slate-600 flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed"><i data-lucide="chevron-right" class="w-4 h-4"></i></button>
      </div>
    </div>`;
}
function saldoEkskul(ekskulId){
  const masuk = DB.pemasukan.filter(p=>p.ekskulId===ekskulId).reduce((s,p)=>s+p.nominal,0);
  const keluar = DB.pengeluaran.filter(p=>p.ekskulId===ekskulId).reduce((s,p)=>s+p.nominal,0);
  return masuk - keluar;
}

/* =========================================================
   ROLE & HAK AKSES
   ========================================================= */
let currentRole = 'bendahara'; // 'bendahara' (penuh), 'kepsek' (hanya lihat), atau 'guru' (guru ekstra — hanya menu Absensi)
let currentGuruNama = ''; // diisi dari respons login() untuk sesi role 'guru' — lihat initAdminPage()

function canEdit(){ return currentRole === 'bendahara'; }

/* Kelola Absensi: Bendahara mengelola semuanya (jenis ekstra, peserta,
   akun guru); Guru Ekstra hanya boleh mengisi absensi untuk ekstra yang
   ditugaskan ke dia (dibatasi lagi di server — lihat simpan_absensi_guru
   di src/index.js); Kepsek hanya boleh melihat. */
function canManageAbsensi(){ return canEdit(); }
function canInputAbsensi(){ return currentRole === 'bendahara' || currentRole === 'guru'; }

function roleLabel(role){
  if(role === 'kepsek') return 'Kepala Sekolah';
  if(role === 'guru') return 'Guru Ekstrakurikuler';
  return 'Bendahara Sekolah';
}

function currentUserName(){
  if(currentRole === 'guru') return currentGuruNama || 'Guru Ekstrakurikuler';
  const pg = DB.pengaturan;
  return currentRole === 'kepsek' ? (pg.namaKepsekAkun || 'Kepala Sekolah') : (pg.bendahara || 'Bendahara');
}

/* Blokir tombol/aksi untuk peran yang tidak berwenang — dipanggil di awal
   setiap fungsi yang mengubah data, selain tombolnya sendiri disembunyikan. */
function requireEdit(){
  if(canEdit()) return true;
  showToast('Anda login sebagai Kepala Sekolah (mode lihat saja). Aksi ini hanya untuk Bendahara.', 'error');
  return false;
}

/* =========================================================
   JEJAK AKTIVITAS (AUDIT LOG)
   ========================================================= */
function catatAktivitas(aksi, detail){
  if(!Array.isArray(DB.aktivitas)) DB.aktivitas = [];
  DB.aktivitas.unshift({
    id: uid('log'),
    waktu: new Date().toISOString(),
    user: currentUserName(),
    role: currentRole,
    aksi,
    detail: detail || ''
  });
  // Batasi log maksimal 500 entri terbaru agar ukuran data tetap wajar
  if(DB.aktivitas.length > 500) DB.aktivitas.length = 500;
}

function waktuIndo(iso){
  if(!iso) return '-';
  try{
    const d = new Date(iso);
    return d.toLocaleDateString('id-ID',{day:'numeric',month:'long',year:'numeric'}) + ', ' + d.toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'});
  }catch(e){ return '-'; }
}

function showToast(msg, type='success'){
  const el = document.getElementById('toast');
  const color = type==='success' ? 'var(--emerald-500)' : (type==='error' ? 'var(--rose-500)' : 'var(--amber-400)');
  const icon = type==='success' ? 'check-circle' : (type==='error' ? 'x-circle' : 'info');
  el.innerHTML = `<div class="glass-strong rounded-2xl px-4 py-3 flex items-center gap-2.5 shadow-2xl view-enter" style="border-color:${color}55">
      <i data-lucide="${icon}" class="w-4 h-4" style="color:${color}"></i>
      <span class="text-sm font-medium">${msg}</span>
    </div>`;
  el.classList.remove('hidden');
  safeIcons();
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(()=>{ el.classList.add('hidden'); }, 2600);
}

/* =========================================================
   NAVIGASI / SIDEBAR
   ========================================================= */
const MENUS = [
  { id:'dashboard', label:'Dashboard', icon:'layout-dashboard', subtitle:'Ringkasan keuangan seluruh ekstrakurikuler' },
  { id:'pemasukan', label:'Pemasukan', icon:'arrow-down-circle', subtitle:'Catat pembayaran iuran siswa per ekstrakurikuler' },
  { id:'pengeluaran', label:'Pengeluaran', icon:'arrow-up-circle', subtitle:'Catat pengeluaran kas per ekstrakurikuler' },
  { id:'tunggakan', label:'Tunggakan', icon:'alert-circle', subtitle:'Rekap siswa yang belum membayar iuran bulan berjalan' },
  { id:'pengingat', label:'Pengingat Pembayaran', icon:'send', subtitle:'Kirim pesan WhatsApp pengingat pembayaran ke wali murid yang menunggak', bendaharaOnly:true },
  { id:'ekskul', label:'Data Ekstrakurikuler', icon:'shapes', subtitle:'Kelola jenis, tarif, dan jadwal ekstrakurikuler' },
  { id:'kalenderEkstra', label:'Aktivasi Bulan & Libur', icon:'calendar-clock',
    subtitle:'Atur bulan aktif pembayaran & hari libur, per jenis ekstrakurikuler', bendaharaOnly:true },
  { id:'siswa', label:'Data Siswa', icon:'users', subtitle:'Kelola siswa peserta tiap ekstrakurikuler' },
  { id:'laporan', label:'Laporan', icon:'file-bar-chart-2', subtitle:'Cetak laporan keuangan lengkap per ekstrakurikuler' },
  { id:'cetakPresensi', label:'Cetak Presensi', icon:'clipboard-check', subtitle:'Cetak lembar presensi bertanda tangan per bulan, sesuai jadwal tiap ekstrakurikuler' },
  { id:'absensi', label:'Kelola Absensi', icon:'clipboard-list', subtitle:'Absensi ekstrakurikuler oleh guru ekstra, bisa langsung dicetak sinkron', roles:['bendahara','kepsek','guru'] },
  { id:'aktivitas', label:'Log Aktivitas', icon:'history', subtitle:'Jejak audit — siapa mengubah data apa dan kapan' },
  { id:'halamanPublik', label:'Halaman Publik', icon:'globe', subtitle:'Atur logo, nama, dan tagline web yang tampil di halaman publik wali murid', bendaharaOnly:true },
  { id:'pengaturan', label:'Pengaturan', icon:'settings', subtitle:'Kop laporan, akun, akun guru ekstra, dan kategori pengeluaran', bendaharaOnly:true },
];

let currentView = 'dashboard';

/* Menu dengan `roles` eksplisit tampil untuk role yang disebut saja
   (dipakai 'absensi' — satu-satunya menu yang boleh dilihat guru ekstra).
   Menu tanpa `roles` (mayoritas) memakai aturan lama: bendaharaOnly
   membatasi ke Bendahara, selain itu tampil untuk Bendahara & Kepsek —
   TAPI TIDAK untuk guru ekstra, supaya "halaman guru ekstra cukup
   absensi saja" seperti yang diminta. */
function menusForRole(){
  return MENUS.filter(m=>{
    if(Array.isArray(m.roles)) return m.roles.includes(currentRole);
    if(currentRole === 'guru') return false;
    return !m.bendaharaOnly || canEdit();
  });
}

function renderNav(){
  const nav = document.getElementById('navMenu');
  nav.innerHTML = menusForRole().map(m => `
    <button onclick="navigate('${m.id}')" class="nav-item ${currentView===m.id?'active':''} w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-left group">
      <span class="nav-dot w-1.5 h-1.5 rounded-full absolute left-0 -translate-x-2" style="background:var(--amber-400)"></span>
      <i data-lucide="${m.icon}" class="nav-icon w-[18px] h-[18px] ${currentView===m.id?'text-blue-600':'text-slate-500 group-hover:text-slate-700'}"></i>
      <span class="text-sm font-medium ${currentView===m.id?'text-slate-900':'text-slate-600 group-hover:text-slate-900'}">${m.label}</span>
    </button>
  `).join('');
  safeIcons();
}

function toggleSidebar(open){
  const sb = document.getElementById('sidebar');
  const ov = document.getElementById('sidebarOverlay');
  if(open){
    sb.classList.remove('-translate-x-full');
    ov.classList.remove('opacity-0','pointer-events-none');
  } else {
    sb.classList.add('-translate-x-full');
    ov.classList.add('opacity-0','pointer-events-none');
  }
}

function navigate(viewId){
  const allowed = menusForRole();
  if(!allowed.some(m=>m.id===viewId)) viewId = allowed.length ? allowed[0].id : 'dashboard';
  currentView = viewId;
  const menu = MENUS.find(m=>m.id===viewId);
  document.getElementById('pageTitle').textContent = menu.label;
  document.getElementById('pageSubtitle').textContent = menu.subtitle;
  renderNav();
  toggleSidebar(false);
  renderView(viewId);
}

function renderView(viewId){
  const main = document.getElementById('mainContent');
  main.classList.remove('view-enter');
  void main.offsetWidth; // reflow untuk restart animasi
  main.classList.add('view-enter');

  const renderers = {
    dashboard: renderDashboard,
    pemasukan: renderPemasukan,
    pengeluaran: renderPengeluaran,
    tunggakan: renderTunggakan,
    pengingat: renderPengingat,
    ekskul: renderEkskul,
    kalenderEkstra: renderKalenderEkstra,
    siswa: renderSiswa,
    laporan: renderLaporan,
    cetakPresensi: renderCetakPresensi,
    absensi: renderAbsensi,
    aktivitas: renderLogAktivitas,
    halamanPublik: renderHalamanPublik,
    pengaturan: renderPengaturan,
  };
  (renderers[viewId] || renderDashboard)();
  safeIcons();
}

/* =========================================================
   DASHBOARD
   ========================================================= */
let dashboardFilterEkskul = 'all';
let dashboardDariTanggal = '';
let dashboardSampaiTanggal = '';

function dalamRentangTanggal(tgl){
  if(!tgl) return false;
  if(dashboardDariTanggal && tgl < dashboardDariTanggal) return false;
  if(dashboardSampaiTanggal && tgl > dashboardSampaiTanggal) return false;
  return true;
}

function terapkanFilterTanggalDashboard(){
  dashboardDariTanggal = document.getElementById('dashDari').value || '';
  dashboardSampaiTanggal = document.getElementById('dashSampai').value || '';
  renderView('dashboard');
}
function resetFilterTanggalDashboard(){
  dashboardDariTanggal = ''; dashboardSampaiTanggal = '';
  renderView('dashboard');
}

function persenPerubahan(now, prev){
  if(prev === 0) return now === 0 ? { teks:'Tidak ada perubahan dari bulan lalu', arah:'flat' } : { teks:'Baru mulai bulan ini', arah:'up' };
  const pct = Math.round(((now-prev)/Math.abs(prev))*100);
  if(pct === 0) return { teks:'Sama seperti bulan lalu', arah:'flat' };
  return { teks:`${pct>0?'+':''}${pct}% dari bulan lalu`, arah: pct>0 ? 'up':'down' };
}
function badgePerubahan(info, baikNaik){
  const warna = info.arah==='flat' ? 'text-slate-400' : ((info.arah==='up')===baikNaik ? 'text-emerald-600' : 'text-rose-500');
  const ikon = info.arah==='up' ? 'trending-up' : (info.arah==='down' ? 'trending-down' : 'minus');
  return `<span class="text-[11px] font-semibold ${warna} inline-flex items-center gap-1 mt-1"><i data-lucide="${ikon}" class="w-3 h-3"></i>${info.teks}</span>`;
}

function statusKasEkskul(ekId){
  const saldo = saldoEkskul(ekId);
  const bulan3 = lastNMonths(3);
  const totalKeluar3Bulan = DB.pengeluaran.filter(p=>p.ekskulId===ekId && bulan3.some(b=>(p.tanggal||'').startsWith(b))).reduce((s,p)=>s+p.nominal,0);
  const rataBulanan = totalKeluar3Bulan / 3;
  if(saldo < 0) return { label:'Minus', warna:'rose' };
  if(rataBulanan > 0 && saldo < rataBulanan) return { label:'Menipis', warna:'amber' };
  return { label:'Sehat', warna:'emerald' };
}

function renderDashboard(){
  const main = document.getElementById('mainContent');
  const filterId = dashboardFilterEkskul;
  const pemasukanEk = DB.pemasukan.filter(p=> filterId==='all' || p.ekskulId===filterId);
  const pengeluaranEk = DB.pengeluaran.filter(p=> filterId==='all' || p.ekskulId===filterId);
  const adaFilterTanggal = !!(dashboardDariTanggal || dashboardSampaiTanggal);
  const pemasukanF = pemasukanEk.filter(p=> !adaFilterTanggal || dalamRentangTanggal(p.tanggalBayar));
  const pengeluaranF = pengeluaranEk.filter(p=> !adaFilterTanggal || dalamRentangTanggal(p.tanggal));
  const masuk = pemasukanF.reduce((s,p)=>s+p.nominal,0);
  const keluar = pengeluaranF.reduce((s,p)=>s+p.nominal,0);
  const saldo = masuk - keluar;
  const ekTerpilih = filterId==='all' ? null : ekskulById(filterId);

  // Perbandingan bulan ini vs bulan lalu (mengikuti filter ekskul, tidak mengikuti filter tanggal custom)
  const [bulanLalu, bulanIni] = lastNMonths(2);
  const mBulan = (list, field, b) => list.filter(x=>(x[field]||'').startsWith(b)).reduce((s,x)=>s+x.nominal,0);
  const masukIni = mBulan(pemasukanEk,'tanggalBayar',bulanIni), masukLalu = mBulan(pemasukanEk,'tanggalBayar',bulanLalu);
  const keluarIni = mBulan(pengeluaranEk,'tanggal',bulanIni), keluarLalu = mBulan(pengeluaranEk,'tanggal',bulanLalu);
  const infoSaldo = persenPerubahan(masukIni-keluarIni, masukLalu-keluarLalu);
  const infoMasuk = persenPerubahan(masukIni, masukLalu);
  const infoKeluar = persenPerubahan(keluarIni, keluarLalu);

  const recentTx = [
    ...pemasukanF.map(p=>({...p, tipe:'masuk', tanggal:p.tanggalBayar})),
    ...pengeluaranF.map(p=>({...p, tipe:'keluar'}))
  ].sort((a,b)=> new Date(b.tanggal) - new Date(a.tanggal)).slice(0,6);

  const totalBelumBayar = hitungTunggakan().reduce((s,r)=>s+r.belum.length,0);

  // Ringkasan pengeluaran per kategori (mengikuti filter aktif)
  const perKategoriMap = {};
  pengeluaranF.forEach(p=>{ perKategoriMap[p.kategori] = (perKategoriMap[p.kategori]||0) + p.nominal; });
  const kategoriSorted = Object.entries(perKategoriMap).sort((a,b)=>b[1]-a[1]);
  const totalKategoriPengeluaran = kategoriSorted.reduce((s,[,v])=>s+v,0);

  // Aktivitas terbaru
  const logTerbaru = (DB.aktivitas||[]).slice(0,5);
  const hariIni = hariIniStr();
  const jumlahLogHariIni = (DB.aktivitas||[]).filter(l=>(l.waktu||'').startsWith(hariIni)).length;

  main.innerHTML = `
    ${totalBelumBayar > 0 ? `
    <button onclick="navigate('tunggakan')" class="w-full text-left glass-strong rounded-2xl p-4 mb-5 flex items-center gap-3 card-hover" style="border-color:rgba(225,29,72,.3)">
      <div class="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style="background:rgba(225,29,72,.12)">
        <i data-lucide="alert-circle" class="w-4 h-4" style="color:var(--rose-500)"></i>
      </div>
      <p class="text-sm flex-1"><b>${totalBelumBayar} siswa</b> belum bayar iuran bulanan bulan ini. <span class="text-blue-600 font-semibold">Lihat rekap tunggakan →</span></p>
    </button>` : ''}

    <div class="flex items-center gap-2 overflow-x-auto pb-1 mb-3">
      <button onclick="dashboardFilterEkskul='all'; renderView('dashboard')" class="shrink-0 px-3.5 py-2 rounded-xl text-xs font-semibold ${filterId==='all'?'btn-primary':'glass text-slate-600'}">Semua Ekskul</button>
      ${DB.ekskul.map(e=>`<button onclick="dashboardFilterEkskul='${e.id}'; renderView('dashboard')" class="shrink-0 px-3.5 py-2 rounded-xl text-xs font-semibold ${filterId===e.id?'btn-primary':'glass text-slate-600'}">${escapeHtml(e.nama)}</button>`).join('')}
    </div>

    <div class="flex flex-wrap items-center gap-2 mb-5">
      <span class="text-xs text-slate-500 font-medium">Rentang tanggal:</span>
      <input id="dashDari" type="date" value="${dashboardDariTanggal}" class="input-glass rounded-xl px-3 py-1.5 text-xs">
      <span class="text-xs text-slate-400">s/d</span>
      <input id="dashSampai" type="date" value="${dashboardSampaiTanggal}" class="input-glass rounded-xl px-3 py-1.5 text-xs">
      <button onclick="terapkanFilterTanggalDashboard()" class="btn-primary px-3.5 py-1.5 rounded-xl text-xs font-semibold">Terapkan</button>
      ${adaFilterTanggal ? `<button onclick="resetFilterTanggalDashboard()" class="glass px-3.5 py-1.5 rounded-xl text-xs font-semibold text-slate-600">Reset</button>` : ''}
      ${adaFilterTanggal ? `<span class="text-[11px] text-blue-600 font-medium">Kartu & transaksi di bawah mengikuti rentang ini</span>` : ''}
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 stagger">
      <div class="glass-strong rounded-3xl p-5 card-hover">
        <div class="flex items-center justify-between mb-3">
          <span class="text-xs text-slate-500 font-medium">Total Saldo</span>
          <div class="w-9 h-9 rounded-xl flex items-center justify-center" style="background:rgba(217,169,60,.15)">
            <i data-lucide="wallet" class="w-4 h-4" style="color:var(--amber-400)"></i>
          </div>
        </div>
        <p class="text-2xl font-extrabold tracking-tight">${rupiah(saldo)}</p>
        <p class="text-xs text-slate-500 mt-1">${ekTerpilih ? ekTerpilih.nama : 'Seluruh ekstrakurikuler'}</p>
        ${badgePerubahan(infoSaldo, true)}
      </div>
      <div class="glass-strong rounded-3xl p-5 card-hover">
        <div class="flex items-center justify-between mb-3">
          <span class="text-xs text-slate-500 font-medium">Total Pemasukan</span>
          <div class="w-9 h-9 rounded-xl flex items-center justify-center" style="background:rgba(16,185,129,.15)">
            <i data-lucide="arrow-down-circle" class="w-4 h-4" style="color:var(--emerald-400)"></i>
          </div>
        </div>
        <p class="text-2xl font-extrabold tracking-tight text-emerald-600">${rupiah(masuk)}</p>
        <p class="text-xs text-slate-500 mt-1">${pemasukanF.length} transaksi</p>
        ${badgePerubahan(infoMasuk, true)}
      </div>
      <div class="glass-strong rounded-3xl p-5 card-hover">
        <div class="flex items-center justify-between mb-3">
          <span class="text-xs text-slate-500 font-medium">Total Pengeluaran</span>
          <div class="w-9 h-9 rounded-xl flex items-center justify-center" style="background:rgba(244,63,94,.15)">
            <i data-lucide="arrow-up-circle" class="w-4 h-4" style="color:var(--rose-500)"></i>
          </div>
        </div>
        <p class="text-2xl font-extrabold tracking-tight" style="color:var(--rose-500)">${rupiah(keluar)}</p>
        <p class="text-xs text-slate-500 mt-1">${pengeluaranF.length} transaksi</p>
        ${badgePerubahan(infoKeluar, false)}
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-5 mt-6">
      <div class="lg:col-span-2 glass-strong rounded-3xl p-5">
        <div class="flex items-center justify-between mb-4">
          <h3 class="font-bold text-sm">Tren Kas Bulanan${ekTerpilih ? ' — ' + ekTerpilih.nama : ''}</h3>
          <span class="badge px-2.5 py-1 rounded-full glass text-slate-600">6 Bulan Terakhir</span>
        </div>
        <div style="position:relative; height:270px;">
          <canvas id="chartTren"></canvas>
        </div>
      </div>
      <div class="glass-strong rounded-3xl p-5">
        <h3 class="font-bold text-sm mb-4">${ekTerpilih ? 'Komposisi Pengeluaran' : 'Saldo per Ekstrakurikuler'}</h3>
        <canvas id="chartSaldo" height="180"></canvas>
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-6">
      <div class="glass-strong rounded-3xl p-5">
        <h3 class="font-bold text-sm mb-4">Ringkasan Pengeluaran per Kategori${adaFilterTanggal||ekTerpilih ? ' (sesuai filter)' : ''}</h3>
        ${kategoriSorted.length===0 ? '<p class="text-sm text-slate-500 text-center py-6">Belum ada data pengeluaran</p>' : `
        <div class="space-y-3">
          ${kategoriSorted.slice(0,6).map(([kat,val])=>{
            const pct = totalKategoriPengeluaran > 0 ? Math.round((val/totalKategoriPengeluaran)*100) : 0;
            return `<div>
              <div class="flex items-center justify-between text-xs mb-1">
                <span class="font-medium text-slate-700">${kat}</span>
                <span class="text-slate-500">${rupiah(val)} <span class="text-slate-400">(${pct}%)</span></span>
              </div>
              <div class="w-full h-2 rounded-full" style="background:rgba(15,23,42,.06)">
                <div class="h-2 rounded-full" style="width:${pct}%; background:var(--rose-500)"></div>
              </div>
            </div>`;
          }).join('')}
        </div>`}
      </div>
      <div class="glass-strong rounded-3xl p-5">
        <h3 class="font-bold text-sm mb-4">Kesehatan Kas per Ekstrakurikuler</h3>
        <div class="space-y-2">
          ${DB.ekskul.map(ek=>{
            const st = statusKasEkskul(ek.id);
            const warnaMap = { rose:'background:rgba(244,63,94,.12); color:var(--rose-500)', amber:'background:rgba(217,169,60,.15); color:var(--amber-400)', emerald:'background:rgba(16,185,129,.15); color:#059669' };
            return `<div class="flex items-center justify-between px-3 py-2.5 rounded-xl table-row">
              <div class="flex items-center gap-2.5 min-w-0">
                <span class="w-2 h-2 rounded-full shrink-0" style="background:${ek.warna}"></span>
                <span class="text-sm font-medium truncate">${escapeHtml(ek.nama)}</span>
              </div>
              <div class="flex items-center gap-2 shrink-0">
                <span class="text-xs text-slate-500">${rupiah(saldoEkskul(ek.id))}</span>
                <span class="badge px-2 py-0.5 rounded-full text-[10px] font-semibold" style="${warnaMap[st.warna]}">${st.label}</span>
              </div>
            </div>`;
          }).join('') || '<p class="text-sm text-slate-500 text-center py-6">Belum ada ekstrakurikuler</p>'}
        </div>
        <p class="text-[10px] text-slate-400 mt-3">Status "Menipis" berarti saldo di bawah rata-rata pengeluaran 3 bulan terakhir ekskul tsb.</p>
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-5 mt-6">
      <div class="lg:col-span-2 glass-strong rounded-3xl p-5">
        <div class="flex items-center justify-between mb-4">
          <h3 class="font-bold text-sm">Transaksi Terbaru${ekTerpilih ? ' — ' + ekTerpilih.nama : ''}</h3>
          <button onclick="navigate('pemasukan')" class="text-xs text-blue-600 hover:text-blue-500 font-semibold flex items-center gap-1">Lihat semua <i data-lucide="arrow-right" class="w-3.5 h-3.5"></i></button>
        </div>
        <div class="divide-y divide-slate-100">
          ${recentTx.map(tx => {
            const isMasuk = tx.tipe==='masuk';
            const judul = isMasuk ? (siswaById(tx.siswaId)?.nama || '-') : tx.kategori;
            const ekNama = ekskulById(tx.ekskulId)?.nama;
            const subjudul = ekNama ? `${ekNama} · ${tanggalIndo(tx.tanggal)}` : tanggalIndo(tx.tanggal);
            const warna = isMasuk ? '#059669' : '#E11D48';
            return `
            <div class="tx-row flex items-center gap-3 px-2.5 py-3 rounded-xl">
              <div class="w-10 h-10 rounded-full flex items-center justify-center shrink-0" style="background:${isMasuk?'rgba(5,150,105,.10)':'rgba(225,29,72,.10)'}; box-shadow: inset 0 0 0 1.5px ${isMasuk?'rgba(5,150,105,.22)':'rgba(225,29,72,.22)'};">
                <i data-lucide="${isMasuk?'arrow-down':'arrow-up'}" class="w-4 h-4" style="color:${warna}"></i>
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-sm font-semibold text-slate-800 truncate">${judul}</p>
                <p class="text-xs text-slate-400 truncate mt-0.5">${subjudul}</p>
              </div>
              <span class="text-sm font-bold shrink-0 whitespace-nowrap tabular-nums" style="color:${warna}">${isMasuk?'+':'-'}${rupiah(tx.nominal)}</span>
            </div>`;
          }).join('') || '<p class="text-sm text-slate-500 text-center py-6">Belum ada transaksi</p>'}
        </div>
      </div>
      <div class="glass-strong rounded-3xl p-5">
        <div class="flex items-center justify-between mb-4">
          <h3 class="font-bold text-sm">Aktivitas Terbaru</h3>
          <button onclick="navigate('aktivitas')" class="text-xs text-blue-600 hover:text-blue-500 font-semibold flex items-center gap-1">Log <i data-lucide="arrow-right" class="w-3.5 h-3.5"></i></button>
        </div>
        <p class="text-[11px] text-slate-500 mb-3">${jumlahLogHariIni} aktivitas hari ini</p>
        <div class="space-y-2.5">
          ${logTerbaru.map(l=>`
            <div class="text-xs border-l-2 pl-2.5" style="border-color:rgba(15,23,42,.1)">
              <p class="font-medium text-slate-700 truncate">${escapeHtml(l.aksi)}</p>
              <p class="text-slate-400 truncate">${escapeHtml(l.user)} · ${waktuIndo(l.waktu)}</p>
            </div>
          `).join('') || '<p class="text-xs text-slate-400 text-center py-4">Belum ada aktivitas tercatat</p>'}
        </div>
      </div>
    </div>
  `;

  setTimeout(()=>{
    const months = lastNMonths(6);
    const dataMasuk = months.map(m => pemasukanEk.filter(p=>(p.tanggalBayar||'').startsWith(m)).reduce((s,p)=>s+p.nominal,0));
    const dataKeluar = months.map(m => pengeluaranEk.filter(p=>(p.tanggal||'').startsWith(m)).reduce((s,p)=>s+p.nominal,0));

    const trenCtx = document.getElementById('chartTren').getContext('2d');
    const gradMasuk = trenCtx.createLinearGradient(0, 0, 0, 260);
    gradMasuk.addColorStop(0, 'rgba(5,150,105,.28)');
    gradMasuk.addColorStop(1, 'rgba(5,150,105,0)');
    const gradKeluar = trenCtx.createLinearGradient(0, 0, 0, 260);
    gradKeluar.addColorStop(0, 'rgba(225,29,72,.22)');
    gradKeluar.addColorStop(1, 'rgba(225,29,72,0)');

    const formatRibu = (v)=>{
      if(v>=1000000) return (v/1000000).toFixed(v%1000000===0?0:1)+'jt';
      if(v>=1000) return (v/1000).toFixed(v%1000===0?0:1)+'rb';
      return String(v);
    };

    new Chart(trenCtx, {
      type:'line',
      data:{
        labels: months.map(m=>bulanNama(m).split(' ')[0].slice(0,3)),
        datasets:[
          {
            label:'Pemasukan', data:dataMasuk,
            borderColor:'#059669', backgroundColor:gradMasuk,
            borderWidth:2.5, tension:.4, fill:true,
            pointRadius:0, pointHoverRadius:6, pointHitRadius:14,
            pointBackgroundColor:'#FFFFFF', pointBorderColor:'#059669', pointBorderWidth:2.5,
            pointHoverBackgroundColor:'#059669', pointHoverBorderColor:'#FFFFFF', pointHoverBorderWidth:2,
          },
          {
            label:'Pengeluaran', data:dataKeluar,
            borderColor:'#E11D48', backgroundColor:gradKeluar,
            borderWidth:2.5, tension:.4, fill:true,
            pointRadius:0, pointHoverRadius:6, pointHitRadius:14,
            pointBackgroundColor:'#FFFFFF', pointBorderColor:'#E11D48', pointBorderWidth:2.5,
            pointHoverBackgroundColor:'#E11D48', pointHoverBorderColor:'#FFFFFF', pointHoverBorderWidth:2,
          },
        ]
      },
      options:{
        responsive:true, maintainAspectRatio:false,
        interaction:{ mode:'index', intersect:false },
        plugins:{
          legend:{
            position:'top', align:'end',
            labels:{ color:'#334155', font:{size:11.5, weight:'600', family:"'Plus Jakarta Sans',sans-serif"}, usePointStyle:true, pointStyle:'circle', boxWidth:8, boxHeight:8, padding:18 }
          },
          tooltip:{
            backgroundColor:'#0B1E3D', titleColor:'#EAF1FF', bodyColor:'#DCEBFF',
            titleFont:{size:12, weight:'700', family:"'Plus Jakarta Sans',sans-serif"},
            bodyFont:{size:11.5, family:"'Plus Jakarta Sans',sans-serif"},
            padding:12, cornerRadius:10, displayColors:true, usePointStyle:true, boxPadding:4,
            callbacks:{ label:(ctx)=> `${ctx.dataset.label}: ${rupiah(ctx.parsed.y)}` }
          }
        },
        scales:{
          x:{
            border:{ display:false },
            ticks:{ color:'#64748B', font:{size:11, family:"'Plus Jakarta Sans',sans-serif"} },
            grid:{ display:false }
          },
          y:{
            beginAtZero:true,
            border:{ display:false },
            ticks:{ color:'#64748B', font:{size:11, family:"'Plus Jakarta Sans',sans-serif"}, callback:(v)=> formatRibu(v), padding:8 },
            grid:{ color:'rgba(15,23,42,.055)', drawTicks:false }
          }
        }
      }
    });

    let saldoLabels, saldoData, saldoColors;
    if(ekTerpilih){
      const perKategori = {};
      pengeluaranF.forEach(p=>{ perKategori[p.kategori] = (perKategori[p.kategori]||0) + p.nominal; });
      saldoLabels = Object.keys(perKategori);
      saldoData = Object.values(perKategori);
      const palette = ['#0284C7','#1769D1','#0D9488','#F43F5E','#6366F1','#F59E0B'];
      saldoColors = saldoLabels.map((_,i)=>palette[i % palette.length]);
      if(saldoLabels.length===0){ saldoLabels=['Belum ada pengeluaran']; saldoData=[1]; saldoColors=['#CBD5E1']; }
    } else {
      saldoLabels = DB.ekskul.map(e=>e.nama);
      saldoData = DB.ekskul.map(e=>Math.max(saldoEkskul(e.id),0));
      saldoColors = DB.ekskul.map(e=>e.warna);
      if(saldoLabels.length===0 || saldoData.every(v=>v===0)){ saldoLabels=['Belum ada data']; saldoData=[1]; saldoColors=['#CBD5E1']; }
    }

    new Chart(document.getElementById('chartSaldo'), {
      type:'doughnut',
      data:{ labels: saldoLabels, datasets:[{ data: saldoData, backgroundColor: saldoColors, borderWidth:3, borderColor:'#FFFFFF', hoverBorderWidth:0, hoverOffset:6 }] },
      options:{
        plugins:{
          legend:{
            position:'bottom',
            labels:{ color:'#334155', font:{size:11, weight:'600', family:"'Plus Jakarta Sans',sans-serif"}, usePointStyle:true, pointStyle:'circle', boxWidth:8, boxHeight:8, padding:14 }
          },
          tooltip:{
            backgroundColor:'#0B1E3D', titleColor:'#EAF1FF', bodyColor:'#DCEBFF',
            titleFont:{size:12, weight:'700', family:"'Plus Jakarta Sans',sans-serif"},
            bodyFont:{size:11.5, family:"'Plus Jakarta Sans',sans-serif"},
            padding:12, cornerRadius:10, displayColors:true, usePointStyle:true, boxPadding:4,
            callbacks:{ label:(ctx)=> ` ${ctx.label}: ${rupiah(ctx.parsed)}` }
          }
        },
        cutout:'68%',
        animation:{ animateRotate:true, animateScale:true }
      }
    });
    safeIcons();
  }, 30);
}

function lastNMonths(n){
  const arr=[];
  const now = hariIniDate();
  for(let i=n-1;i>=0;i--){
    const d = new Date(now.getFullYear(), now.getMonth()-i, 1);
    arr.push(d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'));
  }
  return arr;
}

/* Filter transaksi berdasarkan rentang BULAN custom di halaman Laporan
   (dipakai saat Print / Unduh PDF). Kosong = tidak difilter. Perbandingan
   dilakukan di level bulan (YYYY-MM), bukan tanggal persis, karena filter
   di halaman Laporan sekarang input type="month" (lihat renderLaporan). */
function filterRentangLaporan(list, field){
  if(!laporanBulanAwal && !laporanBulanAkhir) return list;
  return list.filter(x=>{
    const tgl = x[field];
    if(!tgl) return false;
    const ym = String(tgl).slice(0,7);
    if(laporanBulanAwal && ym < laporanBulanAwal) return false;
    if(laporanBulanAkhir && ym > laporanBulanAkhir) return false;
    return true;
  });
}
function labelPeriodeLaporan(){
  if(!laporanBulanAwal && !laporanBulanAkhir) return 'Seluruh Riwayat Transaksi';
  if(laporanBulanAwal && laporanBulanAkhir && laporanBulanAwal===laporanBulanAkhir) return `Periode ${bulanNama(laporanBulanAwal)}`;
  const awal = laporanBulanAwal ? bulanNama(laporanBulanAwal) : 'Awal';
  const akhir = laporanBulanAkhir ? bulanNama(laporanBulanAkhir) : 'Sekarang';
  return `Periode ${awal} – ${akhir}`;
}
/* Tag rentang bulan yang aman dipakai di nama file, mengikuti filter
   laporanBulanAwal/laporanBulanAkhir yang sebenarnya dipilih di halaman
   Laporan — dulu nama file PDF selalu memakai currentPeriodeBulan() (bulan
   kalender saat ini), jadi menyesatkan kalau yang diunduh laporan periode
   lampau. */
function periodeLaporanFileTag(){
  if(!laporanBulanAwal && !laporanBulanAkhir) return 'semua-periode';
  const awal = laporanBulanAwal || 'awal';
  const akhir = laporanBulanAkhir || currentPeriodeBulan();
  return awal===akhir ? awal : `${awal}_sd_${akhir}`;
}
/* Daftar bulan (YYYY-MM) inklusif dari awal..akhir (awal harus <= akhir). */
function daftarBulanRentang(awal, akhir){
  if(!awal || !akhir) return [];
  const [ya,ma] = awal.split('-').map(Number);
  const [yb,mb] = akhir.split('-').map(Number);
  if(!ya||!ma||!yb||!mb) return [];
  let idx = ya*12 + (ma-1);
  const end = yb*12 + (mb-1);
  const hasil = [];
  while(idx<=end){
    const y = Math.floor(idx/12), m = (idx%12)+1;
    hasil.push(y+'-'+String(m).padStart(2,'0'));
    idx++;
  }
  return hasil;
}
/* Rentang bulan EFEKTIF untuk matriks Rincian Pemasukan & Rekap Status
   Pembayaran: kalau admin sudah pilih Dari Bulan/Sampai Bulan, pakai itu
   (satu sisi kosong = dianggap sama dengan sisi yang terisi, jadi tetap 1
   bulan). Kalau filter dikosongkan semua ("Seluruh Riwayat Transaksi"),
   kolom matriks diturunkan dari bulan-bulan yang BENAR-BENAR ada transaksi
   `field`-nya di `list` — supaya tidak meledak jadi puluhan/ratusan kolom
   untuk histori bertahun-tahun. */
function rentangBulanEfektif(list, field){
  if(laporanBulanAwal || laporanBulanAkhir){
    const a = laporanBulanAwal || laporanBulanAkhir;
    const b = laporanBulanAkhir || laporanBulanAwal;
    return a<=b ? {awal:a, akhir:b} : {awal:b, akhir:a};
  }
  const bulanList = list.map(x=>String(x[field]||'').slice(0,7)).filter(Boolean).sort();
  if(bulanList.length===0) return null;
  return { awal: bulanList[0], akhir: bulanList[bulanList.length-1] };
}
/* Format tanggal pendek untuk anotasi kecil di bawah nominal pada sel
   matriks (mis. "12/09/26"), sesuai contoh yang diminta. */
function tglPendek(iso){
  if(!iso) return '-';
  const d = new Date(iso+'T00:00:00');
  return String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0')+'/'+String(d.getFullYear()).slice(-2);
}

/* =========================================================
   MODAL SYSTEM
   ========================================================= */
function openModal(title, bodyHtml, footerHtml){
  const existing = document.getElementById('modalRoot');
  if(existing) existing.remove();
  const root = document.createElement('div');
  root.id = 'modalRoot';
  root.setAttribute('data-modal','');
  root.className = 'fixed inset-0 z-50 flex items-center justify-center p-4';
  root.innerHTML = `
    <div class="absolute inset-0 bg-slate-900/45" onclick="closeModal()"></div>
    <div class="modal-panel glass-strong rounded-3xl w-full max-w-lg max-h-[88vh] overflow-y-auto relative view-enter">
      <div class="modal-header flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 rounded-t-3xl">
        <h3 class="font-bold text-[15px] tracking-tight text-slate-800">${title}</h3>
        <button onclick="closeModal()" title="Tutup" aria-label="Tutup dialog" class="modal-close-btn w-8 h-8 rounded-full flex items-center justify-center text-slate-400"><i data-lucide="x" class="w-4 h-4"></i></button>
      </div>
      <div class="px-6 py-5">${bodyHtml}</div>
      ${footerHtml ? `<div class="px-6 py-4 border-t border-slate-100 flex justify-end gap-2.5 bg-slate-50/50 rounded-b-3xl">${footerHtml}</div>` : ''}
    </div>`;
  document.body.appendChild(root);
  safeIcons();
}
function closeModal(){
  const el = document.getElementById('modalRoot');
  if(el) el.remove();
}
function fieldLabel(text){ return `<label class="text-[13px] font-semibold text-slate-600 mb-1.5 block tracking-tight">${text}</label>`; }

/* =========================================================
   SLIDE-OVER DRAWER — form Tambah/Ubah data (CRUD modern)
   Menggantikan openModal() khusus untuk form entitas utama
   (Pemasukan, Pengeluaran, Ekskul, Siswa) supaya terasa lebih
   modern & fokus dibanding modal tengah layar.
   ========================================================= */
function openDrawer({ icon = 'file-edit', accent = 'var(--blue-600)', title, subtitle = '', bodyHtml, footerHtml }){
  const existing = document.getElementById('drawerRoot');
  if(existing) existing.remove();
  const root = document.createElement('div');
  root.id = 'drawerRoot';
  root.setAttribute('data-modal','');
  root.className = 'fixed inset-0 z-50';
  root.innerHTML = `
    <div id="drawerBackdrop" class="absolute inset-0 bg-slate-900/45 opacity-0" onclick="closeDrawer()"></div>
    <div id="drawerPanel" class="fixed top-0 right-0 h-screen w-full sm:w-[460px] bg-white flex flex-col" style="transform:translateX(100%)">
      <div class="flex items-start gap-3 px-6 py-5 border-b border-slate-100 shrink-0">
        <div class="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0" style="background:color-mix(in srgb, ${accent} 16%, white)">
          <i data-lucide="${icon}" class="w-5 h-5" style="color:${accent}"></i>
        </div>
        <div class="flex-1 min-w-0 pt-0.5">
          <h3 class="font-bold text-[15px] tracking-tight text-slate-800">${title}</h3>
          ${subtitle ? `<p class="text-xs text-slate-500 mt-0.5">${subtitle}</p>` : ''}
        </div>
        <button onclick="closeDrawer()" title="Tutup" aria-label="Tutup panel" class="modal-close-btn w-8 h-8 rounded-full flex items-center justify-center text-slate-400 shrink-0"><i data-lucide="x" class="w-4 h-4"></i></button>
      </div>
      <div class="flex-1 overflow-y-auto px-6 py-5">${bodyHtml}</div>
      ${footerHtml ? `<div class="px-6 py-4 border-t border-slate-100 flex justify-end gap-2.5 bg-slate-50/60 shrink-0">${footerHtml}</div>` : ''}
    </div>`;
  document.body.appendChild(root);
  safeIcons();
  requestAnimationFrame(()=>{
    requestAnimationFrame(()=>{
      document.getElementById('drawerBackdrop').classList.remove('opacity-0');
      document.getElementById('drawerPanel').style.transform = 'translateX(0)';
    });
  });
  document.addEventListener('keydown', _drawerEscHandler);
}
function _drawerEscHandler(e){ if(e.key==='Escape') closeDrawer(); }
function closeDrawer(){
  const root = document.getElementById('drawerRoot');
  document.removeEventListener('keydown', _drawerEscHandler);
  if(!root) return;
  const panel = document.getElementById('drawerPanel');
  const backdrop = document.getElementById('drawerBackdrop');
  if(panel) panel.style.transform = 'translateX(100%)';
  if(backdrop) backdrop.classList.add('opacity-0');
  setTimeout(()=>{ root.remove(); }, 300);
}

/* Validasi inline pada field form — dipakai bersamaan dengan
   showToast() supaya jelas field mana yang bermasalah, bukan
   cuma pesan generik di pojok layar. */
function markInvalid(id, msg){
  const el = document.getElementById(id);
  if(!el) return;
  el.classList.add('field-invalid');
  let err = el.parentElement.querySelector('.field-error-msg');
  if(!err){
    err = document.createElement('p');
    err.className = 'field-error-msg text-[11px] mt-1.5';
    el.insertAdjacentElement('afterend', err);
  }
  err.textContent = msg;
  el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake');
  el.focus({preventScroll:false});
  const clear = ()=>{ clearInvalid(id); };
  el.addEventListener('input', clear, { once:true });
  el.addEventListener('change', clear, { once:true });
}
function clearInvalid(id){
  const el = document.getElementById(id);
  if(!el) return;
  el.classList.remove('field-invalid');
  const err = el.parentElement.querySelector('.field-error-msg');
  if(err) err.remove();
}

/* Strip statistik kecil di atas tabel/daftar CRUD — memberi
   konteks angka yang ikut berubah sesuai filter/pencarian aktif. */
function statBar(items){
  const cols = items.length;
  return `<div class="grid grid-cols-2 sm:grid-cols-${cols} gap-3 mb-5">
    ${items.map(it=>`
      <div class="stat-chip${it.onclick?' cursor-pointer hover:opacity-80 transition-opacity':''}" ${it.onclick?`onclick="${it.onclick}"`:''}>
        <p class="text-[11px] text-slate-500 font-medium">${it.label}</p>
        <p class="text-lg font-extrabold tracking-tight" style="${it.accent?`color:${it.accent}`:''}">${it.value}</p>
      </div>`).join('')}
  </div>`;
}

/* State kosong yang mengarahkan aksi, dipakai menggantikan baris
   teks polos "Belum ada data ..." di tabel/daftar CRUD. */
function emptyState({ icon = 'inbox', title, desc = '', ctaHtml = '' }){
  return `<div class="flex flex-col items-center justify-center text-center py-12 px-4">
    <div class="w-14 h-14 rounded-2xl flex items-center justify-center mb-3" style="background:rgba(37,99,235,.08)">
      <i data-lucide="${icon}" class="w-6 h-6" style="color:var(--blue-600)"></i>
    </div>
    <p class="font-semibold text-sm text-slate-700 mb-1">${title}</p>
    ${desc ? `<p class="text-xs text-slate-400 max-w-xs">${desc}</p>` : ''}
    ${ctaHtml ? `<div class="mt-4">${ctaHtml}</div>` : ''}
  </div>`;
}

/* =========================================================
   DIALOG KONFIRMASI (pengganti confirm() bawaan browser)
   ========================================================= */
function showConfirm(opts){
  const {
    title = 'Konfirmasi',
    message = '',
    confirmText = 'Ya, Lanjutkan',
    cancelText = 'Batal',
    danger = false,
    onConfirm = ()=>{},
    onCancel = ()=>{}
  } = opts;

  const existing = document.getElementById('confirmModalRoot');
  if(existing) existing.remove();

  const accent = danger ? 'var(--rose-500)' : 'var(--blue-600)';
  const iconBg = danger ? 'rgba(225,29,72,.12)' : 'rgba(37,99,235,.12)';
  const icon = danger ? 'trash-2' : 'help-circle';
  const okBtnStyle = danger
    ? 'background:linear-gradient(135deg,#E11D48,#BE123C); color:#FFFFFF;'
    : 'background:linear-gradient(135deg,var(--blue-600),var(--blue-400)); color:#FFFFFF;';

  const root = document.createElement('div');
  root.id = 'confirmModalRoot';
  root.setAttribute('data-modal','');
  root.className = 'fixed inset-0 z-[60] flex items-center justify-center p-4';
  root.innerHTML = `
    <div class="absolute inset-0 bg-slate-900/45" data-confirm-cancel></div>
    <div class="modal-panel glass-strong rounded-3xl w-full max-w-sm relative view-enter p-6">
      <div class="flex items-start gap-3.5">
        <div class="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0" style="background:${iconBg}">
          <i data-lucide="${icon}" class="w-5 h-5" style="color:${accent}"></i>
        </div>
        <div class="flex-1 pt-1 min-w-0">
          <h3 class="font-bold text-base leading-tight mb-1.5">${title}</h3>
          <p class="text-sm text-slate-600 leading-relaxed whitespace-pre-line">${message}</p>
        </div>
      </div>
      <div class="flex justify-end gap-2 mt-6">
        <button data-confirm-cancel class="btn-secondary px-4 py-2.5 rounded-xl text-sm transition-transform hover:-translate-y-px">${cancelText}</button>
        <button id="confirmModalOkBtn" class="px-4 py-2.5 rounded-xl text-sm font-bold transition-all hover:brightness-110 hover:-translate-y-px" style="${okBtnStyle}">${confirmText}</button>
      </div>
    </div>`;
  document.body.appendChild(root);
  safeIcons();

  const cleanup = (fn)=>{
    root.remove();
    document.removeEventListener('keydown', onKeydown);
    fn && fn();
  };
  const onKeydown = (e)=>{ if(e.key==='Escape') cleanup(onCancel); };
  document.addEventListener('keydown', onKeydown);

  root.querySelectorAll('[data-confirm-cancel]').forEach(el=>{
    el.addEventListener('click', ()=>cleanup(onCancel));
  });
  document.getElementById('confirmModalOkBtn').addEventListener('click', ()=>cleanup(onConfirm));
}

/* Konfirmasi versi "ketik ulang kata sandi kata" — dipakai untuk aksi yang
   jauh lebih destruktif & tidak bisa dibatalkan (mis. Reset Semua Data),
   supaya tidak bisa terhapus tidak sengaja hanya dengan satu klik. */
function showTypedConfirm(opts){
  const {
    title = 'Konfirmasi',
    message = '',
    confirmText = 'Ya, Lanjutkan',
    cancelText = 'Batal',
    confirmWord = 'HAPUS',
    onConfirm = ()=>{},
    onCancel = ()=>{}
  } = opts;

  const existing = document.getElementById('confirmModalRoot');
  if(existing) existing.remove();

  const root = document.createElement('div');
  root.id = 'confirmModalRoot';
  root.setAttribute('data-modal','');
  root.className = 'fixed inset-0 z-[60] flex items-center justify-center p-4';
  root.innerHTML = `
    <div class="absolute inset-0 bg-slate-900/45" data-confirm-cancel></div>
    <div class="modal-panel glass-strong rounded-3xl w-full max-w-sm relative view-enter p-6">
      <div class="flex items-start gap-3.5">
        <div class="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0" style="background:rgba(225,29,72,.12)">
          <i data-lucide="alert-triangle" class="w-5 h-5" style="color:var(--rose-500)"></i>
        </div>
        <div class="flex-1 pt-1 min-w-0">
          <h3 class="font-bold text-base leading-tight mb-1.5">${title}</h3>
          <p class="text-sm text-slate-600 leading-relaxed whitespace-pre-line">${message}</p>
        </div>
      </div>
      <div class="mt-4">
        <label class="text-xs font-semibold text-slate-500 mb-1.5 block">Ketik <b>${confirmWord}</b> untuk mengaktifkan tombol konfirmasi</label>
        <input id="typedConfirmInput" type="text" autocomplete="off" spellcheck="false" class="input-glass w-full rounded-xl px-3.5 py-2.5 text-sm" placeholder="${confirmWord}">
      </div>
      <div class="flex justify-end gap-2 mt-6">
        <button data-confirm-cancel class="btn-secondary px-4 py-2.5 rounded-xl text-sm transition-transform hover:-translate-y-px">${cancelText}</button>
        <button id="confirmModalOkBtn" disabled class="px-4 py-2.5 rounded-xl text-sm font-bold transition-all opacity-40 cursor-not-allowed" style="background:linear-gradient(135deg,#E11D48,#BE123C); color:#FFFFFF;">${confirmText}</button>
      </div>
    </div>`;
  document.body.appendChild(root);
  safeIcons();

  const cleanup = (fn)=>{
    root.remove();
    document.removeEventListener('keydown', onKeydown);
    fn && fn();
  };
  const onKeydown = (e)=>{ if(e.key==='Escape') cleanup(onCancel); };
  document.addEventListener('keydown', onKeydown);

  root.querySelectorAll('[data-confirm-cancel]').forEach(el=>{
    el.addEventListener('click', ()=>cleanup(onCancel));
  });

  const input = document.getElementById('typedConfirmInput');
  const okBtn = document.getElementById('confirmModalOkBtn');
  const syncBtnState = ()=>{
    const match = input.value.trim() === confirmWord;
    okBtn.disabled = !match;
    okBtn.classList.toggle('opacity-40', !match);
    okBtn.classList.toggle('cursor-not-allowed', !match);
    okBtn.classList.toggle('hover:brightness-110', match);
    okBtn.classList.toggle('hover:-translate-y-px', match);
  };
  input.addEventListener('input', syncBtnState);
  input.addEventListener('keydown', (e)=>{
    if(e.key==='Enter' && input.value.trim()===confirmWord) cleanup(onConfirm);
  });
  okBtn.addEventListener('click', ()=>{
    if(input.value.trim() !== confirmWord) return;
    cleanup(onConfirm);
  });
  input.focus();
}

/* Reset Semua Data — menghapus data transaksional (ekskul, siswa, pemasukan,
   pengeluaran, log aktivitas) secara permanen. Akun login, kop laporan, &
   kategori pengeluaran SENGAJA tidak dihapus, supaya admin tidak langsung
   terkunci dari akunnya sendiri / kehilangan identitas laporan setelah reset. */
function resetSemuaData(){
  if(!requireEdit()) return;
  showTypedConfirm({
    title: 'Reset Semua Data',
    message: 'Tindakan ini akan MENGHAPUS PERMANEN seluruh data Ekstrakurikuler, Siswa, Pemasukan, Pengeluaran, dan Log Aktivitas dari database.\n\nAkun login, kop laporan, dan kategori pengeluaran tidak ikut terhapus. Sebaiknya unduh Backup (.json) dulu. Tindakan ini tidak bisa dibatalkan.',
    confirmText: 'Ya, Reset Semua Data',
    confirmWord: 'RESET',
    onConfirm: ()=>{
      DB.ekskul = [];
      DB.siswa = [];
      DB.pemasukan = [];
      DB.pengeluaran = [];
      DB.aktivitas = [];
      catatAktivitas('Reset Semua Data', 'Seluruh data ekskul, siswa, pemasukan, pengeluaran & log aktivitas dihapus permanen.');
      saveDB(DB);
      showToast('Semua data berhasil direset.');
      const namaEl = document.getElementById('sidebarUserName');
      if(namaEl) namaEl.textContent = currentUserName();
      renderNav();
      renderView('pengaturan');
    }
  });
}

/* =========================================================
   PEMASUKAN
   ========================================================= */
let pemasukanFilterEkskul = 'all';
let pemasukanSearchQuery = '';
let pemasukanPage = 1;
function setPemasukanPage(p){ pemasukanPage = p; }

function renderPemasukan(){
  const main = document.getElementById('mainContent');
  const q = pemasukanSearchQuery.trim().toLowerCase();
  const listAll = DB.pemasukan
    .filter(p => pemasukanFilterEkskul==='all' || p.ekskulId===pemasukanFilterEkskul)
    .filter(p => {
      if(!q) return true;
      const siswaNama = (siswaById(p.siswaId)?.nama || '').toLowerCase();
      const ekNama = (ekskulById(p.ekskulId)?.nama || '').toLowerCase();
      const ket = (p.keterangan || '').toLowerCase();
      return siswaNama.includes(q) || ekNama.includes(q) || ket.includes(q);
    })
    .sort((a,b)=> new Date(b.tanggalBayar) - new Date(a.tanggalBayar));
  const pg = paginateList(listAll, pemasukanPage);
  const list = pg.items;
  const totalNominalF = listAll.reduce((s,p)=>s+p.nominal,0);
  const rataRataF = listAll.length ? totalNominalF/listAll.length : 0;

  main.innerHTML = `
    ${statBar([
      { label:'Transaksi Ditemukan', value: listAll.length },
      { label:'Total Nominal', value: rupiah(totalNominalF), accent:'#059669' },
      { label:'Rata-rata / Transaksi', value: rupiah(rataRataF) },
    ])}
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
      <div class="flex items-center gap-2 overflow-x-auto pb-1">
        <button onclick="pemasukanFilterEkskul='all'; pemasukanPage=1; renderView('pemasukan')" class="shrink-0 px-3.5 py-2 rounded-xl text-xs font-semibold ${pemasukanFilterEkskul==='all'?'btn-primary':'glass text-slate-600'}">Semua Ekskul</button>
        ${DB.ekskul.map(e=>`<button onclick="pemasukanFilterEkskul='${e.id}'; pemasukanPage=1; renderView('pemasukan')" class="shrink-0 px-3.5 py-2 rounded-xl text-xs font-semibold ${pemasukanFilterEkskul===e.id?'btn-primary':'glass text-slate-600'}">${escapeHtml(e.nama)}</button>`).join('')}
      </div>
      ${canEdit() ? `<button onclick="openPemasukanForm()" class="btn-primary shrink-0 px-4 py-2.5 rounded-xl text-sm flex items-center gap-2"><i data-lucide="plus" class="w-4 h-4"></i>Catat Pembayaran</button>` : ''}
    </div>

    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
      <div class="relative flex-1 max-w-sm">
        <i data-lucide="search" class="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2"></i>
        <input id="pemasukanSearchInput" type="text" value="${escapeHtml(pemasukanSearchQuery)}" placeholder="Cari nama siswa, ekskul, atau keterangan..." class="input-glass w-full rounded-xl pl-10 pr-3.5 py-2.5 text-sm">
      </div>
      <button onclick="exportPemasukanCSV()" class="glass shrink-0 px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-600 flex items-center justify-center gap-2"><i data-lucide="file-down" class="w-4 h-4"></i>Ekspor CSV</button>
    </div>

    <div class="glass-strong rounded-3xl overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left text-xs text-slate-500 border-b border-slate-200/80">
              <th class="px-5 py-3 font-medium">Siswa</th>
              <th class="px-5 py-3 font-medium">Ekskul</th>
              <th class="px-5 py-3 font-medium">Periode</th>
              <th class="px-5 py-3 font-medium">Tgl Bayar</th>
              <th class="px-5 py-3 font-medium text-right">Nominal</th>
              <th class="px-5 py-3 font-medium text-right">Aksi</th>
            </tr>
          </thead>
          <tbody>
            ${list.map(p => {
              const ek = ekskulById(p.ekskulId);
              const periodeLabel = p.jenis==='bulanan' ? bulanNama(p.periode) : tanggalIndo(p.periode);
              return `<tr class="table-row border-b border-slate-100">
                <td class="px-5 py-3 font-medium">${escapeHtml(siswaById(p.siswaId)?.nama || '-')}</td>
                <td class="px-5 py-3"><span class="badge px-2 py-1 rounded-full" style="background:${ek?.warna}22; color:${ek?.warna}">${escapeHtml(ek?.nama || '-')}</span></td>
                <td class="px-5 py-3 text-slate-600">${periodeLabel} <span class="text-[10px] text-slate-400">(${p.jenis==='bulanan'?'Bulanan':'Per Pertemuan'})</span></td>
                <td class="px-5 py-3 text-slate-600">${tanggalIndo(p.tanggalBayar)}</td>
                <td class="px-5 py-3 text-right font-bold text-emerald-600">${rupiah(p.nominal)}</td>
                <td class="px-5 py-3 text-right">
                  <div class="flex items-center justify-end gap-1">
                    <button onclick="cetakKwitansi('${p.id}')" title="Cetak kwitansi" aria-label="Cetak kwitansi ${escapeHtml(siswaById(p.siswaId)?.nama||'')}" class="text-slate-500 hover:text-emerald-600 p-1.5 rounded-lg hover:bg-emerald-50 transition-colors"><i data-lucide="receipt" class="w-4 h-4"></i></button>
                    ${canEdit() ? `
                    <button onclick="openPemasukanForm(null,'${p.id}')" title="Edit pembayaran" aria-label="Edit pembayaran ${escapeHtml(siswaById(p.siswaId)?.nama||'')}" class="text-slate-500 hover:text-blue-600 p-1.5 rounded-lg hover:bg-blue-50 transition-colors"><i data-lucide="pencil" class="w-4 h-4"></i></button>
                    <button onclick="deletePemasukan('${p.id}')" title="Hapus pembayaran" aria-label="Hapus pembayaran ${escapeHtml(siswaById(p.siswaId)?.nama||'')}" class="text-slate-500 hover:text-rose-500 p-1.5 rounded-lg hover:bg-rose-50 transition-colors"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                    ` : ''}
                  </div>
                </td>
              </tr>`;
            }).join('') || `<tr><td colspan="6" class="p-0">${emptyState({
              icon:'wallet',
              title: q || pemasukanFilterEkskul!=='all' ? 'Tidak ada transaksi yang cocok' : 'Belum ada data pemasukan',
              desc: q || pemasukanFilterEkskul!=='all' ? 'Coba ubah kata kunci atau filter ekstrakurikuler.' : 'Catat pembayaran iuran siswa pertama untuk mulai mengisi laporan keuangan.',
              ctaHtml: canEdit() && !q && pemasukanFilterEkskul==='all' ? `<button onclick="openPemasukanForm()" class="btn-primary px-4 py-2.5 rounded-xl text-sm flex items-center gap-2"><i data-lucide="plus" class="w-4 h-4"></i>Catat Pembayaran</button>` : ''
            })}</td></tr>`}
          </tbody>
        </table>
      </div>
      ${paginationBar(pg, 'setPemasukanPage', 'pemasukan')}
    </div>
  `;

  const searchEl = document.getElementById('pemasukanSearchInput');
  searchEl.addEventListener('input', (e)=>{
    pemasukanSearchQuery = e.target.value;
    pemasukanPage = 1;
    const pos = e.target.selectionStart;
    renderView('pemasukan');
    const newInput = document.getElementById('pemasukanSearchInput');
    newInput.focus();
    newInput.setSelectionRange(pos, pos);
  });
}

function exportPemasukanCSV(){
  const q = pemasukanSearchQuery.trim().toLowerCase();
  const rows = [['Siswa','Kelas','Ekskul','Jenis','Periode','Tanggal Bayar','Nominal','Keterangan']];
  DB.pemasukan
    .filter(p => pemasukanFilterEkskul==='all' || p.ekskulId===pemasukanFilterEkskul)
    .filter(p => {
      if(!q) return true;
      const siswaNama = (siswaById(p.siswaId)?.nama || '').toLowerCase();
      const ekNama = (ekskulById(p.ekskulId)?.nama || '').toLowerCase();
      const ket = (p.keterangan || '').toLowerCase();
      return siswaNama.includes(q) || ekNama.includes(q) || ket.includes(q);
    })
    .sort((a,b)=> new Date(b.tanggalBayar) - new Date(a.tanggalBayar))
    .forEach(p=>{
      const s = siswaById(p.siswaId);
      const ek = ekskulById(p.ekskulId);
      const periodeLabel = p.jenis==='bulanan' ? bulanNama(p.periode) : tanggalIndo(p.periode);
      rows.push([s?.nama||'-', s?.kelas||'-', ek?.nama||'-', p.jenis==='bulanan'?'Bulanan':'Per Pertemuan', periodeLabel, tanggalIndo(p.tanggalBayar), p.nominal, p.keterangan||'']);
    });
  downloadCSV(`sikasapa-pemasukan-${tanggalFileNow()}.csv`, rows);
  catatAktivitas('Ekspor CSV', `Pemasukan — ${rows.length-1} baris`);
}

function openPemasukanForm(prefill, editId){
  if(!requireEdit()) return;
  const editing = editId ? DB.pemasukan.find(p=>p.id===editId) : null;
  const ekOptions = DB.ekskul.map(e=>`<option value="${e.id}">${escapeHtml(e.nama)} (${e.jenisPembayaran==='bulanan'?'Bulanan':'Per Pertemuan'} · ${rupiah(e.tarif)})</option>`).join('');
  openDrawer({
    icon: editing ? 'pencil' : 'arrow-down-circle',
    accent: 'var(--emerald-400)',
    title: editing ? 'Edit Pembayaran Iuran' : 'Catat Pembayaran Iuran',
    subtitle: editing ? 'Perbarui detail transaksi pemasukan' : 'Catat pembayaran iuran dari seorang siswa',
    bodyHtml: `
    <form id="formPemasukan" class="space-y-4">
      <div>${fieldLabel('Ekstrakurikuler')}
        <select id="pmEkskul" onchange="onPmEkskulChange()" required class="input-glass w-full rounded-xl px-3.5 py-2.5 text-sm">
          <option value="">Pilih ekstrakurikuler</option>${ekOptions}
        </select>
      </div>
      <div>${fieldLabel('Siswa')}
        <select id="pmSiswa" required class="input-glass w-full rounded-xl px-3.5 py-2.5 text-sm">
          <option value="">Pilih ekstrakurikuler dahulu</option>
        </select>
      </div>
      <div id="pmPeriodeWrap"></div>
      <div>${fieldLabel('Nominal (Rp)')}
        <input id="pmNominal" type="number" required class="input-glass w-full rounded-xl px-3.5 py-2.5 text-sm" placeholder="0">
      </div>
      <div>${fieldLabel('Tanggal Bayar')}
        <input id="pmTanggalBayar" type="date" required value="${hariIniStr()}" class="input-glass w-full rounded-xl px-3.5 py-2.5 text-sm">
      </div>
      <div>${fieldLabel('Keterangan (opsional)')}
        <input id="pmKeterangan" type="text" class="input-glass w-full rounded-xl px-3.5 py-2.5 text-sm" placeholder="Catatan tambahan">
      </div>
    </form>
  `, footerHtml: `
    <button onclick="closeDrawer()" class="btn-secondary px-4 py-2.5 rounded-xl text-sm">Batal</button>
    <button id="btnSimpanPemasukan" onclick="submitPemasukan(${editing ? `'${editId}'` : 'null'})" class="btn-primary px-4 py-2.5 rounded-xl text-sm flex items-center gap-2"><i data-lucide="check" class="w-4 h-4"></i>Simpan</button>
  `});

  if(editing){
    document.getElementById('pmEkskul').value = editing.ekskulId;
    onPmEkskulChange(editing.siswaId, editing.periode);
    document.getElementById('pmSiswa').value = editing.siswaId;
    const pEl = document.getElementById('pmPeriode'); if(pEl) pEl.value = editing.periode;
    document.getElementById('pmNominal').value = editing.nominal;
    document.getElementById('pmTanggalBayar').value = editing.tanggalBayar;
    document.getElementById('pmKeterangan').value = editing.keterangan || '';
  } else if(prefill && prefill.ekskulId){
    document.getElementById('pmEkskul').value = prefill.ekskulId;
    onPmEkskulChange(prefill.siswaId, prefill.periode);
    if(prefill.siswaId){ document.getElementById('pmSiswa').value = prefill.siswaId; }
    if(prefill.periode){ const pEl = document.getElementById('pmPeriode'); if(pEl) pEl.value = prefill.periode; }
  }
}

/* keepSiswaId (opsional): siswa yang HARUS tetap muncul di daftar walau
   sudah nonaktif — dipakai saat membuka form dalam mode edit/prefill supaya
   pembayaran lama milik siswa yang sudah keluar/pindah tetap bisa dibuka &
   disunting (PERBAIKAN: sebelumnya daftar ini tidak menyaring siswa
   nonaktif sama sekali, jadi pembayaran baru bisa tidak sengaja dicatat
   atas nama siswa yang sudah tidak aktif). */
function onPmEkskulChange(keepSiswaId, keepPeriode){
  const ekId = document.getElementById('pmEkskul').value;
  const ek = ekskulById(ekId);
  const siswaSel = document.getElementById('pmSiswa');
  const periodeWrap = document.getElementById('pmPeriodeWrap');
  if(!ek){
    siswaSel.innerHTML = '<option value="">Pilih ekstrakurikuler dahulu</option>';
    periodeWrap.innerHTML = '';
    return;
  }
  let anggota = DB.siswa.filter(s=>s.ekskulIds.includes(ekId) && s.aktif!==false);
  if(keepSiswaId && !anggota.some(s=>s.id===keepSiswaId)){
    const s = siswaById(keepSiswaId);
    if(s && s.ekskulIds.includes(ekId)) anggota = [...anggota, s];
  }
  siswaSel.innerHTML = '<option value="">Pilih siswa</option>' + anggota.map(s=>`<option value="${s.id}">${escapeHtml(s.nama)} (${escapeHtml(s.kelas)})${s.aktif===false?' — nonaktif':''}</option>`).join('');
  document.getElementById('pmNominal').value = ek.tarif;

  if(ek.jenisPembayaran === 'bulanan'){
    periodeWrap.innerHTML = `${fieldLabel('Bulan Pembayaran')}
      <input id="pmPeriode" type="month" required value="${defaultBulanIni()}" class="input-glass w-full rounded-xl px-3.5 py-2.5 text-sm">`;
  } else {
    /* PERBAIKAN LOGIKA TAGIHAN: sebelumnya field ini input tanggal BEBAS
       (bisa pilih tanggal mana pun, bahkan yang bukan hari jadwal — variabel
       `opts` dari hariJadwal dibuat tapi tidak pernah dipakai). Padahal
       hitungEstimasiTunggakanPertemuan() menghitung wajibBayar HANYA dari
       tanggal jadwal resmi (tanggalPertemuanBulan), sementara sudahBayar
       cuma menghitung jumlah baris pemasukan dalam bulan itu tanpa
       mencocokkan ke tanggal jadwal yang valid. Akibatnya pembayaran yang
       tercatat di tanggal di luar jadwal tetap dihitung "sudah bayar" dan
       diam-diam mengecilkan tunggakan yang sebenarnya.
       Sekarang dibatasi jadi pilihan tanggal jadwal resmi (bulan ini &
       bulan lalu, hari libur sudah dikeluarkan) — pakai fungsi yang sama
       dengan perhitungan tunggakan supaya keduanya selalu sinkron.
       keepPeriode: tanggal lama (mode edit) tetap disisipkan sebagai opsi
       walau di luar jadwal, supaya data lama yang sudah kadung salah tidak
       hilang/berubah diam-diam saat dibuka untuk diedit. */
    /* PERBAIKAN LOGIKA TAGIHAN: dibatasi ke tanggal jadwal resmi saja
       (lihat catatan panjang di atas). Jendela dipakai SAMA dengan
       hitungEstimasiTunggakanPertemuan() (JENDELA_BULAN_TUNGGAKAN bulan
       termasuk bulan ini) supaya bendahara selalu bisa mengejar
       tunggakan sejauh yang memang masih dihitung sistem. */
    const hariIniOnly = hariIniStr();
    const bulanIni = currentPeriodeBulan();
    const daftarBulanPm = Array.from({length: JENDELA_BULAN_TUNGGAKAN}, (_, i) => bulanMundur(bulanIni, i));
    const isoDate = d => d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
    let tanggalValid = daftarBulanPm
      .flatMap(ym => tanggalPertemuanBulan(ek.hariJadwal, ym, ek.id))
      .map(isoDate)
      .filter(iso => iso <= hariIniOnly);
    if(keepPeriode && !tanggalValid.includes(keepPeriode)) tanggalValid.push(keepPeriode);
    tanggalValid.sort((a,b)=> b.localeCompare(a));
    const opts = tanggalValid.map(iso=>`<option value="${iso}">${tanggalIndo(iso)}${keepPeriode===iso && !hariJadwalCocok(ek,iso) ? ' (di luar jadwal)' : ''}</option>`).join('');
    periodeWrap.innerHTML = `${fieldLabel('Tanggal Pertemuan')}
      <select id="pmPeriode" required class="input-glass w-full rounded-xl px-3.5 py-2.5 text-sm">
        ${opts || '<option value="">Belum ada tanggal jadwal yang berlaku</option>'}
      </select>
      <p class="text-[11px] text-slate-400 mt-1.5">Jadwal ${escapeHtml(ek.nama)}: ${ek.hariJadwal.join(' & ')} — hanya tanggal pertemuan resmi (${JENDELA_BULAN_TUNGGAKAN} bulan terakhir) yang bisa dipilih, supaya tetap sinkron dengan perhitungan tunggakan.</p>`;
  }
}

/* Helper kecil untuk penanda "(di luar jadwal)" pada opsi keepPeriode lama. */
function hariJadwalCocok(ek, iso){
  const [y,m,d] = iso.split('-').map(Number);
  const hari = new Date(y, m-1, d).getDay();
  return (ek.hariJadwal||[]).some(h=>HARI_MAP[h]===hari);
}

function submitPemasukan(editId){
  if(!requireEdit()) return;
  const ekskulId = document.getElementById('pmEkskul').value;
  const siswaId = document.getElementById('pmSiswa').value;
  const periodeEl = document.getElementById('pmPeriode');
  const nominal = parseFloat(document.getElementById('pmNominal').value);
  const tanggalBayar = document.getElementById('pmTanggalBayar').value;
  const keterangan = document.getElementById('pmKeterangan').value;
  if(!ekskulId){ markInvalid('pmEkskul','Pilih ekstrakurikuler dahulu'); showToast('Lengkapi semua data yang wajib diisi.', 'error'); return; }
  if(!siswaId){ markInvalid('pmSiswa','Pilih siswa'); showToast('Lengkapi semua data yang wajib diisi.', 'error'); return; }
  if(!periodeEl || !periodeEl.value){ if(periodeEl) markInvalid(periodeEl.id,'Wajib diisi'); showToast('Lengkapi semua data yang wajib diisi.', 'error'); return; }
  if(!tanggalBayar){ markInvalid('pmTanggalBayar','Wajib diisi'); showToast('Lengkapi semua data yang wajib diisi.', 'error'); return; }
  if(isNaN(nominal) || nominal <= 0){
    markInvalid('pmNominal','Nominal harus lebih dari 0');
    showToast('Nominal pembayaran harus lebih dari 0.', 'error'); return;
  }
  const ek = ekskulById(ekskulId);

  if(editId){
    simpanPemasukanEdit(editId, siswaId, ekskulId, ek, periodeEl.value, nominal, tanggalBayar, keterangan);
    return;
  }

  const duplikat = DB.pemasukan.find(p => p.ekskulId===ekskulId && p.siswaId===siswaId && p.periode===periodeEl.value);
  if(duplikat){
    const label = ek.jenisPembayaran==='bulanan' ? bulanNama(duplikat.periode) : tanggalIndo(duplikat.periode);
    showConfirm({
      title: 'Pembayaran Serupa Sudah Ada',
      message: `${escapeHtml(siswaById(siswaId)?.nama||'')} sudah tercatat bayar untuk periode ${label} sebesar ${rupiah(duplikat.nominal)} pada ${tanggalIndo(duplikat.tanggalBayar)}.\n\nTetap simpan sebagai pembayaran tambahan?`,
      confirmText: 'Tetap Simpan',
      onConfirm: ()=> simpanPemasukan(siswaId, ekskulId, ek, periodeEl.value, nominal, tanggalBayar, keterangan)
    });
    return;
  }
  simpanPemasukan(siswaId, ekskulId, ek, periodeEl.value, nominal, tanggalBayar, keterangan);
}

function simpanPemasukanEdit(id, siswaId, ekskulId, ek, periode, nominal, tanggalBayar, keterangan){
  const idx = DB.pemasukan.findIndex(p=>p.id===id);
  if(idx===-1){ showToast('Data pembayaran tidak ditemukan.', 'error'); return; }
  DB.pemasukan[idx] = { ...DB.pemasukan[idx], siswaId, ekskulId, jenis:ek.jenisPembayaran, periode, nominal, tanggalBayar, keterangan };
  catatAktivitas('Ubah Pemasukan', `${siswaById(siswaId)?.nama||'-'} — ${ek.nama} — ${rupiah(nominal)}`);
  saveDB(DB);
  closeDrawer();
  showToast('Pembayaran berhasil diperbarui.');
  renderView('pemasukan');
}

function simpanPemasukan(siswaId, ekskulId, ek, periode, nominal, tanggalBayar, keterangan){
  DB.pemasukan.push({ id:uid('pm'), siswaId, ekskulId, jenis:ek.jenisPembayaran, periode, nominal, tanggalBayar, keterangan });
  catatAktivitas('Tambah Pemasukan', `${siswaById(siswaId)?.nama||'-'} — ${ek.nama} — ${rupiah(nominal)}`);
  saveDB(DB);
  closeDrawer();
  showToast('Pembayaran berhasil dicatat.');
  renderView('pemasukan');
}

function deletePemasukan(id){
  if(!requireEdit()) return;
  const p = DB.pemasukan.find(x=>x.id===id);
  showConfirm({
    title: 'Hapus Data Pemasukan',
    message: 'Data pembayaran ini akan dihapus secara permanen. Tindakan ini tidak bisa dibatalkan.',
    confirmText: 'Ya, Hapus',
    danger: true,
    onConfirm: ()=>{
      DB.pemasukan = DB.pemasukan.filter(p=>p.id!==id);
      tandaiHapus('pemasukan', id);
      if(p) catatAktivitas('Hapus Pemasukan', `${siswaById(p.siswaId)?.nama||'-'} — ${ekskulById(p.ekskulId)?.nama||'-'} — ${rupiah(p.nominal)}`);
      saveDB(DB);
      showToast('Data pemasukan dihapus.', 'info');
      renderView('pemasukan');
    }
  });
}

/* Kwitansi kecil per transaksi pemasukan — untuk diserahkan langsung ke
   siswa/wali saat bayar tunai. Sebelumnya dokumen cetak/PDF cuma ada di
   level rekap per ekskul (Laporan), tidak ada bukti serah-terima per
   transaksi. Dibuka lewat tombol ikon struk di daftar Pemasukan, tersedia
   untuk kedua role (kepsek & bendahara) karena murni mencetak ulang bukti,
   bukan mengubah data — jadi tidak perlu requireEdit(). */
async function cetakKwitansi(pemasukanId){
  const p = DB.pemasukan.find(x=>x.id===pemasukanId);
  if(!p){ showToast('Data pembayaran tidak ditemukan.', 'error'); return; }
  const s = siswaById(p.siswaId);
  const ek = ekskulById(p.ekskulId);
  const pg = DB.pengaturan;
  const periodeLabel = p.jenis==='bulanan' ? bulanNama(p.periode) : tanggalIndo(p.periode);

  // Jendela dibuka DULUAN, sebelum await — lihat catatan di cetakLaporan().
  const w = window.open('', '_blank');
  let nomor;
  try{
    nomor = await nomorKwitansiBaru();
  }catch(e){
    console.error(e);
    if(w && !w.closed) w.close();
    showToast('Gagal mengambil nomor kwitansi dari server. Coba lagi.', 'error');
    return;
  }
  w.document.write(`
    <html><head><title>Kwitansi - ${escapeHtml(s?.nama||'-')}</title>
    <style>
      @page{ size: A5; margin: 12mm; }
      body{font-family:Arial, sans-serif; padding:14px; color:#111;}
      .header{display:flex; align-items:center; gap:10px; border-bottom:2px solid #123B78; padding-bottom:10px; margin-bottom:14px;}
      .header img{width:42px; height:42px; object-fit:contain;}
      h2{font-size:14px; margin:0 0 2px; letter-spacing:.4px; text-align:center;}
      .nomor{text-align:center; font-size:11px; color:#555; margin-bottom:16px;}
      table{width:100%; font-size:12.5px; border-collapse:collapse; margin-bottom:16px;}
      td{padding:4px 4px; vertical-align:top;}
      td.label{width:130px; color:#555;}
      .nominal-box{border:1.5px solid #123B78; border-radius:8px; padding:10px 14px; text-align:center; margin:14px 0 22px; font-size:18px; font-weight:700; color:#123B78;}
      .ttd{display:flex; justify-content:flex-end; margin-top:26px; font-size:12px;}
      .ttd div{text-align:center; width:180px;}
      p.foot{font-size:8.5px; color:#888; margin-top:16px;}
    </style></head>
    <body>
      <div class="header">
        ${pg.logo ? `<img src="${pg.logo}">` : ''}
        <div>${kopHtml(pg)}</div>
      </div>
      <h2>KWITANSI PEMBAYARAN IURAN EKSTRAKURIKULER</h2>
      <p class="nomor">No. ${nomor}</p>
      <table>
        <tr><td class="label">Nama Siswa</td><td>: ${escapeHtml(s?.nama||'-')}</td></tr>
        <tr><td class="label">Kelas</td><td>: ${escapeHtml(s?.kelas||'-')}</td></tr>
        <tr><td class="label">Ekstrakurikuler</td><td>: ${escapeHtml(ek?.nama||'-')}</td></tr>
        <tr><td class="label">Untuk Pembayaran</td><td>: ${escapeHtml(periodeLabel)} (${p.jenis==='bulanan'?'Bulanan':'Per Pertemuan'})</td></tr>
        <tr><td class="label">Tanggal Bayar</td><td>: ${tanggalIndo(p.tanggalBayar)}</td></tr>
        ${p.keterangan ? `<tr><td class="label">Keterangan</td><td>: ${escapeHtml(p.keterangan)}</td></tr>` : ''}
      </table>
      <div class="nominal-box">${rupiah(p.nominal)}</div>
      <div class="ttd">
        <div>Karanganyar, ${hariIniDate().toLocaleDateString('id-ID',{day:'numeric',month:'long',year:'numeric'})}<br>Diterima oleh,<br><br><br><br><strong>${pg.bendahara||'..........................'}</strong><br>Bendahara Sekolah</div>
      </div>
      <p class="foot">Dicetak oleh ${currentUserName()} (${roleLabel(currentRole)}) pada ${waktuIndo(new Date().toISOString())} melalui SIKasapa. Kwitansi ini sah sebagai bukti pembayaran meski tanpa cap/tanda tangan basah.</p>
    </body></html>
  `);
  w.document.close();
  catatAktivitas('Cetak Kwitansi', `${nomor} — ${s?.nama||'-'} — ${ek?.nama||'-'} — ${rupiah(p.nominal)}`);
  logCetak('Cetak Kwitansi', `${nomor} — ${s?.nama||'-'} — ${ek?.nama||'-'} — ${rupiah(p.nominal)}`);
  setTimeout(()=>{ w.print(); }, 300);
}

/* =========================================================
   PENGELUARAN
   ========================================================= */
let pengeluaranFilterEkskul = 'all';
let pengeluaranSearchQuery = '';
let pengeluaranPage = 1;
function setPengeluaranPage(p){ pengeluaranPage = p; }

function renderPengeluaran(){
  const main = document.getElementById('mainContent');
  const q = pengeluaranSearchQuery.trim().toLowerCase();
  const listAll = DB.pengeluaran
    .filter(p => pengeluaranFilterEkskul==='all' || p.ekskulId===pengeluaranFilterEkskul)
    .filter(p => {
      if(!q) return true;
      const ekNama = (ekskulById(p.ekskulId)?.nama || '').toLowerCase();
      const kategori = (p.kategori || '').toLowerCase();
      const ket = (p.keterangan || '').toLowerCase();
      return ekNama.includes(q) || kategori.includes(q) || ket.includes(q);
    })
    .sort((a,b)=> new Date(b.tanggal) - new Date(a.tanggal));
  const pg = paginateList(listAll, pengeluaranPage);
  const list = pg.items;
  const totalNominalF = listAll.reduce((s,p)=>s+p.nominal,0);
  const rataRataF = listAll.length ? totalNominalF/listAll.length : 0;

  main.innerHTML = `
    ${statBar([
      { label:'Transaksi Ditemukan', value: listAll.length },
      { label:'Total Nominal', value: rupiah(totalNominalF), accent:'var(--rose-500)' },
      { label:'Rata-rata / Transaksi', value: rupiah(rataRataF) },
    ])}
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
      <div class="flex items-center gap-2 overflow-x-auto pb-1">
        <button onclick="pengeluaranFilterEkskul='all'; pengeluaranPage=1; renderView('pengeluaran')" class="shrink-0 px-3.5 py-2 rounded-xl text-xs font-semibold ${pengeluaranFilterEkskul==='all'?'btn-primary':'glass text-slate-600'}">Semua Ekskul</button>
        ${DB.ekskul.map(e=>`<button onclick="pengeluaranFilterEkskul='${e.id}'; pengeluaranPage=1; renderView('pengeluaran')" class="shrink-0 px-3.5 py-2 rounded-xl text-xs font-semibold ${pengeluaranFilterEkskul===e.id?'btn-primary':'glass text-slate-600'}">${escapeHtml(e.nama)}</button>`).join('')}
      </div>
      ${canEdit() ? `<button onclick="openPengeluaranForm()" class="btn-primary shrink-0 px-4 py-2.5 rounded-xl text-sm flex items-center gap-2"><i data-lucide="plus" class="w-4 h-4"></i>Catat Pengeluaran</button>` : ''}
    </div>

    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
      <div class="relative flex-1 max-w-sm">
        <i data-lucide="search" class="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2"></i>
        <input id="pengeluaranSearchInput" type="text" value="${escapeHtml(pengeluaranSearchQuery)}" placeholder="Cari ekskul, kategori, atau keterangan..." class="input-glass w-full rounded-xl pl-10 pr-3.5 py-2.5 text-sm">
      </div>
      <button onclick="exportPengeluaranCSV()" class="glass shrink-0 px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-600 flex items-center justify-center gap-2"><i data-lucide="file-down" class="w-4 h-4"></i>Ekspor CSV</button>
    </div>

    <div class="glass-strong rounded-3xl overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left text-xs text-slate-500 border-b border-slate-200/80">
              <th class="px-5 py-3 font-medium">Ekskul</th>
              <th class="px-5 py-3 font-medium">Kategori</th>
              <th class="px-5 py-3 font-medium">Keterangan</th>
              <th class="px-5 py-3 font-medium">Tanggal</th>
              <th class="px-5 py-3 font-medium text-center">Bukti</th>
              <th class="px-5 py-3 font-medium text-right">Nominal</th>
              ${canEdit() ? '<th class="px-5 py-3 font-medium text-right">Aksi</th>' : ''}
            </tr>
          </thead>
          <tbody>
            ${list.map(p => {
              const ek = ekskulById(p.ekskulId);
              return `<tr class="table-row border-b border-slate-100">
                <td class="px-5 py-3"><span class="badge px-2 py-1 rounded-full" style="background:${ek?.warna}22; color:${ek?.warna}">${escapeHtml(ek?.nama || '-')}</span></td>
                <td class="px-5 py-3 font-medium">${escapeHtml(p.kategori)}</td>
                <td class="px-5 py-3 text-slate-600 max-w-[220px] truncate">${escapeHtml(p.keterangan || '-')}</td>
                <td class="px-5 py-3 text-slate-600">${tanggalIndo(p.tanggal)}</td>
                <td class="px-5 py-3 text-center">
                  ${p.bukti ? `<button onclick="lihatBukti('${p.id}')" title="Lihat bukti/nota" aria-label="Lihat bukti pengeluaran ${escapeHtml(p.kategori)}" class="text-blue-600 hover:text-blue-500 inline-flex"><i data-lucide="image" class="w-4 h-4"></i></button>` : `<span class="text-slate-300">—</span>`}
                </td>
                <td class="px-5 py-3 text-right font-bold" style="color:var(--rose-500)">${rupiah(p.nominal)}</td>
                ${canEdit() ? `<td class="px-5 py-3 text-right">
                  <div class="flex items-center justify-end gap-1">
                    <button onclick="openPengeluaranForm('${p.id}')" title="Edit pengeluaran" aria-label="Edit pengeluaran ${escapeHtml(p.kategori)}" class="text-slate-500 hover:text-blue-600 p-1.5 rounded-lg hover:bg-blue-50 transition-colors"><i data-lucide="pencil" class="w-4 h-4"></i></button>
                    <button onclick="deletePengeluaran('${p.id}')" title="Hapus pengeluaran" aria-label="Hapus pengeluaran ${escapeHtml(p.kategori)}" class="text-slate-500 hover:text-rose-500 p-1.5 rounded-lg hover:bg-rose-50 transition-colors"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                  </div>
                </td>` : ''}
              </tr>`;
            }).join('') || `<tr><td colspan="7" class="p-0">${emptyState({
              icon:'receipt',
              title: q || pengeluaranFilterEkskul!=='all' ? 'Tidak ada transaksi yang cocok' : 'Belum ada data pengeluaran',
              desc: q || pengeluaranFilterEkskul!=='all' ? 'Coba ubah kata kunci atau filter ekstrakurikuler.' : 'Catat pengeluaran kas pertama untuk mulai mengisi laporan keuangan.',
              ctaHtml: canEdit() && !q && pengeluaranFilterEkskul==='all' ? `<button onclick="openPengeluaranForm()" class="btn-primary px-4 py-2.5 rounded-xl text-sm flex items-center gap-2"><i data-lucide="plus" class="w-4 h-4"></i>Catat Pengeluaran</button>` : ''
            })}</td></tr>`}
          </tbody>
        </table>
      </div>
      ${paginationBar(pg, 'setPengeluaranPage', 'pengeluaran')}
    </div>
  `;

  const searchEl = document.getElementById('pengeluaranSearchInput');
  searchEl.addEventListener('input', (e)=>{
    pengeluaranSearchQuery = e.target.value;
    pengeluaranPage = 1;
    const pos = e.target.selectionStart;
    renderView('pengeluaran');
    const newInput = document.getElementById('pengeluaranSearchInput');
    newInput.focus();
    newInput.setSelectionRange(pos, pos);
  });
}

function exportPengeluaranCSV(){
  const q = pengeluaranSearchQuery.trim().toLowerCase();
  const rows = [['Ekskul','Kategori','Keterangan','Tanggal','Nominal']];
  DB.pengeluaran
    .filter(p => pengeluaranFilterEkskul==='all' || p.ekskulId===pengeluaranFilterEkskul)
    .filter(p => {
      if(!q) return true;
      const ekNama = (ekskulById(p.ekskulId)?.nama || '').toLowerCase();
      const kategori = (p.kategori || '').toLowerCase();
      const ket = (p.keterangan || '').toLowerCase();
      return ekNama.includes(q) || kategori.includes(q) || ket.includes(q);
    })
    .sort((a,b)=> new Date(b.tanggal) - new Date(a.tanggal))
    .forEach(p=>{
      const ek = ekskulById(p.ekskulId);
      rows.push([ek?.nama||'-', p.kategori, p.keterangan||'', tanggalIndo(p.tanggal), p.nominal]);
    });
  downloadCSV(`sikasapa-pengeluaran-${tanggalFileNow()}.csv`, rows);
  catatAktivitas('Ekspor CSV', `Pengeluaran — ${rows.length-1} baris`);
}

function openPengeluaranForm(editId){
  if(!requireEdit()) return;
  const editing = editId ? DB.pengeluaran.find(p=>p.id===editId) : null;
  const ekOptions = DB.ekskul.map(e=>`<option value="${e.id}">${escapeHtml(e.nama)} (Saldo: ${rupiah(saldoEkskul(e.id))})</option>`).join('');
  const katOptions = DB.kategoriPengeluaran.map(k=>`<option value="${escapeHtml(k)}">${escapeHtml(k)}</option>`).join('');
  openDrawer({
    icon: editing ? 'pencil' : 'arrow-up-circle',
    accent: 'var(--rose-500)',
    title: editing ? 'Edit Pengeluaran' : 'Catat Pengeluaran',
    subtitle: editing ? 'Perbarui detail transaksi pengeluaran' : 'Catat pengeluaran kas ekstrakurikuler',
    bodyHtml: `
    <form id="formPengeluaran" class="space-y-4">
      <div>${fieldLabel('Ekstrakurikuler')}
        <select id="pxEkskul" required class="input-glass w-full rounded-xl px-3.5 py-2.5 text-sm">
          <option value="">Pilih ekstrakurikuler</option>${ekOptions}
        </select>
      </div>
      <div>${fieldLabel('Kategori')}
        <select id="pxKategori" required class="input-glass w-full rounded-xl px-3.5 py-2.5 text-sm">
          <option value="">Pilih kategori</option>${katOptions}
        </select>
      </div>
      <div>${fieldLabel('Nominal (Rp)')}
        <input id="pxNominal" type="number" required class="input-glass w-full rounded-xl px-3.5 py-2.5 text-sm" placeholder="0">
      </div>
      <div>${fieldLabel('Tanggal')}
        <input id="pxTanggal" type="date" required value="${hariIniStr()}" class="input-glass w-full rounded-xl px-3.5 py-2.5 text-sm">
      </div>
      <div>${fieldLabel('Keterangan')}
        <textarea id="pxKeterangan" rows="2" class="input-glass w-full rounded-xl px-3.5 py-2.5 text-sm" placeholder="Contoh: Beli bola futsal baru"></textarea>
      </div>
      <div>${fieldLabel('Bukti / Nota (opsional)')}
        <input id="pxBukti" type="file" accept="image/*" class="hidden">
        <div id="pxBuktiDropzone" class="cursor-pointer rounded-xl border-2 border-dashed border-slate-300/80 hover:border-blue-400 bg-white/40 hover:bg-blue-50/40 transition-colors p-3 flex items-center gap-3">
          <div id="pxBuktiPreview" class="shrink-0"></div>
          <div id="pxBuktiHint" class="flex-1 min-w-0"></div>
        </div>
      </div>
    </form>
  `, footerHtml: `
    <button onclick="closeDrawer()" class="btn-secondary px-4 py-2.5 rounded-xl text-sm">Batal</button>
    <button onclick="submitPengeluaran(${editing ? `'${editId}'` : 'null'})" class="btn-primary px-4 py-2.5 rounded-xl text-sm flex items-center gap-2"><i data-lucide="check" class="w-4 h-4"></i>Simpan</button>
  `});

  _pxBuktiData = editing ? (editing.bukti || null) : null;
  updatePxBuktiUI();

  const pxBuktiInput = document.getElementById('pxBukti');
  const pxBuktiZone = document.getElementById('pxBuktiDropzone');
  pxBuktiZone.addEventListener('click', ()=> pxBuktiInput.click());
  pxBuktiInput.addEventListener('change', function(e){
    const file = e.target.files[0];
    if(file) bacaPxBuktiFile(file);
  });
  ['dragover','dragenter'].forEach(evt=> pxBuktiZone.addEventListener(evt, (e)=>{
    e.preventDefault();
    pxBuktiZone.classList.add('border-blue-400','bg-blue-50/40');
  }));
  ['dragleave','dragend'].forEach(evt=> pxBuktiZone.addEventListener(evt, ()=>{
    pxBuktiZone.classList.remove('border-blue-400','bg-blue-50/40');
  }));
  pxBuktiZone.addEventListener('drop', (e)=>{
    e.preventDefault();
    pxBuktiZone.classList.remove('border-blue-400','bg-blue-50/40');
    const file = e.dataTransfer.files[0];
    if(file) bacaPxBuktiFile(file);
  });

  if(editing){
    document.getElementById('pxEkskul').value = editing.ekskulId;
    document.getElementById('pxKategori').value = editing.kategori;
    document.getElementById('pxNominal').value = editing.nominal;
    document.getElementById('pxTanggal').value = editing.tanggal;
    document.getElementById('pxKeterangan').value = editing.keterangan || '';
  }
}

let _pxBuktiData = null;

function bacaPxBuktiFile(file){
  if(!file.type || !file.type.startsWith('image/')){ showToast('File harus berupa gambar (PNG/JPG).', 'error'); return; }
  const reader = new FileReader();
  reader.onload = async ()=>{
    _pxBuktiData = reader.result; // preview lokal instan (sebelum dikompres)
    updatePxBuktiUI();
    try{
      // Dikompres di browser lalu disimpan langsung sebagai data URL di D1
      // (lewat save_all saat "Simpan" ditekan) — tidak ada upload terpisah.
      _pxBuktiData = await siapkanGambarUntukDisimpan(reader.result, 1000);
      updatePxBuktiUI();
    }catch(err){
      console.error(err);
      showToast(err.message || 'Gagal memproses gambar, coba lagi.', 'error');
      _pxBuktiData = null;
      updatePxBuktiUI();
    }
  };
  reader.readAsDataURL(file);
}

function hapusPxBukti(){
  _pxBuktiData = null;
  updatePxBuktiUI();
}

function updatePxBuktiUI(){
  const preview = document.getElementById('pxBuktiPreview');
  const hint = document.getElementById('pxBuktiHint');
  if(!preview || !hint) return;
  if(_pxBuktiData){
    preview.innerHTML = `<img src="${_pxBuktiData}" class="w-11 h-11 object-cover rounded-lg border border-slate-200/80">`;
    hint.innerHTML = `<p class="text-xs font-semibold text-slate-700">Bukti terlampir</p><p class="text-[11px] text-slate-400">Klik untuk ganti, atau <button type="button" onclick="event.stopPropagation(); hapusPxBukti()" class="text-rose-500 hover:underline font-medium">hapus</button></p>`;
  } else {
    preview.innerHTML = `<div class="w-10 h-10 rounded-lg flex items-center justify-center" style="background:rgba(37,99,235,.10)"><i data-lucide="image-plus" class="w-4 h-4" style="color:var(--blue-600)"></i></div>`;
    hint.innerHTML = `<p class="text-xs font-semibold text-slate-600">Klik atau seret foto nota ke sini</p><p class="text-[11px] text-slate-400">PNG atau JPG</p>`;
  }
  safeIcons();
}

function submitPengeluaran(editId){
  if(!requireEdit()) return;
  const ekskulId = document.getElementById('pxEkskul').value;
  const kategori = document.getElementById('pxKategori').value;
  const nominal = parseFloat(document.getElementById('pxNominal').value);
  const tanggal = document.getElementById('pxTanggal').value;
  const keterangan = document.getElementById('pxKeterangan').value;
  if(!ekskulId){ markInvalid('pxEkskul','Pilih ekstrakurikuler'); showToast('Lengkapi semua data yang wajib diisi.', 'error'); return; }
  if(!kategori){ markInvalid('pxKategori','Pilih kategori'); showToast('Lengkapi semua data yang wajib diisi.', 'error'); return; }
  if(!tanggal){ markInvalid('pxTanggal','Wajib diisi'); showToast('Lengkapi semua data yang wajib diisi.', 'error'); return; }
  if(isNaN(nominal) || nominal <= 0){
    markInvalid('pxNominal','Nominal harus lebih dari 0');
    showToast('Nominal pengeluaran harus lebih dari 0.', 'error'); return;
  }

  if(editId){
    const existing = DB.pengeluaran.find(p=>p.id===editId);
    const saldoTanpaIni = saldoEkskul(ekskulId) + (existing && existing.ekskulId===ekskulId ? existing.nominal : 0);
    if(nominal > saldoTanpaIni){
      showConfirm({
        title: 'Saldo Tidak Mencukupi',
        message: `Saldo kas ${escapeHtml(ekskulById(ekskulId)?.nama||'-')} (tanpa transaksi ini) ${rupiah(saldoTanpaIni)}, sedangkan pengeluaran ini ${rupiah(nominal)}. Saldo akan menjadi minus.\n\nTetap simpan?`,
        confirmText: 'Tetap Simpan',
        danger: true,
        onConfirm: ()=> simpanPengeluaranEdit(editId, ekskulId, kategori, nominal, tanggal, keterangan)
      });
      return;
    }
    simpanPengeluaranEdit(editId, ekskulId, kategori, nominal, tanggal, keterangan);
    return;
  }

  const saldoSaatIni = saldoEkskul(ekskulId);
  if(nominal > saldoSaatIni){
    showConfirm({
      title: 'Saldo Tidak Mencukupi',
      message: `Saldo kas ${escapeHtml(ekskulById(ekskulId)?.nama||'-')} saat ini ${rupiah(saldoSaatIni)}, sedangkan pengeluaran ini ${rupiah(nominal)}. Saldo akan menjadi minus.\n\nTetap simpan?`,
      confirmText: 'Tetap Simpan',
      danger: true,
      onConfirm: ()=> simpanPengeluaran(ekskulId, kategori, nominal, tanggal, keterangan)
    });
    return;
  }
  simpanPengeluaran(ekskulId, kategori, nominal, tanggal, keterangan);
}

function simpanPengeluaranEdit(id, ekskulId, kategori, nominal, tanggal, keterangan){
  const idx = DB.pengeluaran.findIndex(p=>p.id===id);
  if(idx===-1){ showToast('Data pengeluaran tidak ditemukan.', 'error'); return; }
  DB.pengeluaran[idx] = { ...DB.pengeluaran[idx], ekskulId, kategori, nominal, tanggal, keterangan, bukti:_pxBuktiData };
  catatAktivitas('Ubah Pengeluaran', `${ekskulById(ekskulId)?.nama||'-'} — ${kategori} — ${rupiah(nominal)}`);
  saveDB(DB);
  closeDrawer();
  showToast('Pengeluaran berhasil diperbarui.');
  renderView('pengeluaran');
}

function simpanPengeluaran(ekskulId, kategori, nominal, tanggal, keterangan){
  DB.pengeluaran.push({ id:uid('px'), ekskulId, kategori, nominal, tanggal, keterangan, bukti:_pxBuktiData });
  catatAktivitas('Tambah Pengeluaran', `${ekskulById(ekskulId)?.nama||'-'} — ${kategori} — ${rupiah(nominal)}`);
  saveDB(DB);
  closeDrawer();
  showToast('Pengeluaran berhasil dicatat.');
  renderView('pengeluaran');
}

function deletePengeluaran(id){
  if(!requireEdit()) return;
  const p = DB.pengeluaran.find(x=>x.id===id);
  showConfirm({
    title: 'Hapus Data Pengeluaran',
    message: 'Data pengeluaran ini akan dihapus secara permanen. Tindakan ini tidak bisa dibatalkan.',
    confirmText: 'Ya, Hapus',
    danger: true,
    onConfirm: ()=>{
      DB.pengeluaran = DB.pengeluaran.filter(p=>p.id!==id);
      tandaiHapus('pengeluaran', id);
      if(p) catatAktivitas('Hapus Pengeluaran', `${ekskulById(p.ekskulId)?.nama||'-'} — ${p.kategori} — ${rupiah(p.nominal)}`);
      saveDB(DB);
      showToast('Data pengeluaran dihapus.', 'info');
      renderView('pengeluaran');
    }
  });
}

function lihatBukti(id){
  const p = DB.pengeluaran.find(x=>x.id===id);
  if(!p || !p.bukti) return;
  openModal('Bukti Pengeluaran', `
    <img src="${p.bukti}" class="w-full rounded-xl border border-slate-200/80">
    <p class="text-xs text-slate-500 mt-3">${escapeHtml(p.kategori)} · ${tanggalIndo(p.tanggal)} · ${rupiah(p.nominal)}</p>
  `, `<button onclick="closeModal()" class="btn-secondary px-4 py-2.5 rounded-xl text-sm">Tutup</button>`);
}

/* =========================================================
   TUNGGAKAN / PIUTANG (khusus ekskul bulanan)
   ========================================================= */
function currentPeriodeBulan(){
  const now = hariIniDate();
  return now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0');
}

/* Bulan (dari string periode "YYYY-MM") nonaktif untuk ekskul ini? —
   dipakai Tunggakan & Pengingat Pembayaran supaya konsisten dengan
   Informasi Pembayaran publik: bulan yang dinonaktifkan (mis. libur
   semester) TIDAK dihitung sebagai "belum bayar" dan tidak boleh
   memicu pengingat WhatsApp. PERBAIKAN #4: ek.bulanAktif sekarang
   di-key langsung pakai `periode` ("YYYY-MM"), bukan cuma nomor bulan
   — jadi menonaktifkan Juli 2026 tidak lagi ikut menonaktifkan Juli
   di tahun-tahun lain. */
function bulanNonaktifUntukPeriode(ek, periode){
  const entri = ek.bulanAktif && ek.bulanAktif[periode];
  return !!(entri && entri.aktif === false);
}

function hitungTunggakan(){
  const periode = currentPeriodeBulan();
  const ekBulanan = DB.ekskul.filter(e=>e.jenisPembayaran==='bulanan' && !bulanNonaktifUntukPeriode(e, periode));
  return ekBulanan.map(ek=>{
    // Siswa nonaktif (sudah keluar/pindah) tidak dianggap "belum bayar" —
    // konsisten dengan Presensi & pencarian publik wali murid.
    const anggota = DB.siswa.filter(s=>s.ekskulIds.includes(ek.id) && s.aktif!==false);
    const sudah = [], belum = [];
    anggota.forEach(s=>{
      const bayar = DB.pemasukan.some(p=>p.ekskulId===ek.id && p.siswaId===s.id && p.jenis==='bulanan' && p.periode===periode);
      (bayar ? sudah : belum).push(s);
    });
    return { ek, periode, anggota, sudah, belum };
  });
}

/* Jejak paling awal siswa ini di ekskul BULANAN — dipakai supaya
   penarikan mundur JENDELA_BULAN_TUNGGAKAN_BULANAN bulan tidak salah
   menagih periode SEBELUM siswa ini benar-benar jadi anggota (data
   siswa tidak mencatat "tanggal gabung" per ekskul, jadi dipakai
   pembayaran pertama yang tercatat sebagai perkiraan). Sama pola
   dengan tanggalMulaiTerdeteksi() untuk skema Per Pertemuan di bawah. */
function tanggalMulaiTerdeteksiBulanan(ek, siswaId){
  const periodeBayar = DB.pemasukan
    .filter(p=>p.ekskulId===ek.id && p.siswaId===siswaId && p.jenis==='bulanan')
    .map(p=>p.periode).filter(Boolean).sort();
  if(periodeBayar[0]) return periodeBayar[0];
  // Belum pernah bayar sama sekali di ekskul ini — sebelum menyerah ke
  // "cuma cek bulan berjalan", coba pakai Tanggal Gabung siswa (diisi
  // manual/otomatis di form Data Siswa, lihat submitSiswa()) sebagai
  // perkiraan sejak kapan dia wajib bayar. Kalau itu juga kosong,
  // baru fallback ke null (cuma bulan berjalan) seperti sebelumnya.
  const siswa = siswaById(siswaId);
  return (siswa && siswa.tanggalGabung) ? siswa.tanggalGabung.slice(0,7) : null;
}

/* Rekap tunggakan BULANAN, ditarik mundur sampai
   JENDELA_BULAN_TUNGGAKAN_BULANAN bulan (termasuk bulan berjalan) —
   dipakai bersama oleh menu Tunggakan & menu Pengingat Pembayaran
   supaya keduanya selalu SINKRON (sama-sama pakai fungsi ini, bukan
   dua perhitungan terpisah yang bisa berbeda hasil). Beda dengan
   hitungTunggakan() (di atas) yang cuma bulan berjalan — itu tetap
   dipertahankan apa adanya untuk ringkasan cepat di Dashboard. */
const JENDELA_BULAN_TUNGGAKAN_BULANAN = 6;
function hitungTunggakanBulananGabungan(){
  const bulanIni = currentPeriodeBulan();
  const daftarBulan = Array.from({length: JENDELA_BULAN_TUNGGAKAN_BULANAN}, (_, i) => bulanMundur(bulanIni, i)).sort();
  const ekBulanan = DB.ekskul.filter(e=>e.jenisPembayaran==='bulanan');
  return ekBulanan.map(ek=>{
    const anggota = DB.siswa.filter(s=>s.ekskulIds.includes(ek.id) && s.aktif!==false);
    const rincian = anggota.map(s=>{
      const mulai = tanggalMulaiTerdeteksiBulanan(ek, s.id);
      // Bulan nonaktif (libur, dst) dikecualikan; siswa yang belum
      // pernah punya jejak bayar SAMA SEKALI dan Tanggal Gabung-nya juga
      // belum diisi cuma dicek bulan berjalan saja (jangan sampai siswa
      // baru gabung dituduh nunggak bulan lama) — lihat
      // tanggalMulaiTerdeteksiBulanan() untuk urutan fallback-nya.
      const bulanRelevan = daftarBulan.filter(ym=>{
        if(bulanNonaktifUntukPeriode(ek, ym)) return false;
        return mulai ? ym>=mulai : ym===bulanIni;
      });
      const belumBulan = bulanRelevan.filter(ym=>!DB.pemasukan.some(p=>p.ekskulId===ek.id && p.siswaId===s.id && p.jenis==='bulanan' && p.periode===ym));
      return { siswa:s, belumBulan, kurangRp: belumBulan.length * ek.tarif };
    }).filter(r=>r.belumBulan.length>0).sort((a,b)=>b.belumBulan.length-a.belumBulan.length);
    return { ek, rincian };
  }).filter(r=>r.rincian.length>0);
}

/* Estimasi tunggakan untuk ekskul skema PER PERTEMUAN (mis. Futsal, Silat).

   Ada 2 mode, tergantung apakah ekskul ini ditautkan ke Kelola Absensi
   (ek.ekstraAbsensiId — lihat submitEkskul()):

   1) TERTAUT (ada data kehadiran asli di tabel absensi): jumlah
      pertemuan yang WAJIB dibayar tiap siswa dihitung dari kehadiran
      sebenarnya — cuma tanggal yang guru catat status 'hadir' yang
      dihitung. Tanggal yang tercatat izin/sakit/alpa TIDAK ikut
      ditagih. Kalau guru belum sempat mengisi absensi untuk tanggal
      itu sama sekali, fallback ke asumsi lama (dianggap terjadi) —
      supaya tunggakan tidak "hilang" sementara menunggu guru mengisi
      — tapi ditandai belumDiisi supaya tetap kelihatan bedanya.
   2) TIDAK TERTAUT: perilaku lama — murni ESTIMASI dari jadwal hari
      latihan (hariJadwal), dianggap semua pertemuan terjadi. Bisa
      meleset kalau siswa izin/sakit/alpa, karena sistem memang tidak
      tahu kehadiran sebenarnya untuk ekskul yang belum ditautkan.
   Baik tertaut maupun tidak, ini tetap titik awal bendahara menagih,
   bukan angka final — selalu cek dulu sebelum mengirim pengingat.

   JENDELA 3 BULAN: sebelumnya cuma menghitung bulan berjalan, jadi
   tunggakan bulan lalu yang belum lunas "hilang" begitu bulan
   berganti walau uangnya belum tentu sudah dibayar. Sekarang dihitung
   mundur sampai JENDELA_BULAN_TUNGGAKAN bulan (termasuk bulan ini).

   PENGAMAN siswa baru: karena data siswa tidak mencatat "tanggal
   gabung" per ekskul, penarikan mundur 3 bulan itu TIDAK BOLEH
   menagih periode sebelum siswa ini punya jejak nyata (pernah bayar
   atau pernah diabsen) di ekskul ini — kalau tidak, siswa yang baru
   gabung bulan ini bisa salah dituduh berutang pertemuan 2 bulan lalu
   sebelum dia jadi anggota. Lihat tanggalMulaiTerdeteksi(). Siswa yang
   belum punya jejak sama sekali cuma dihitung dari bulan berjalan. */
const JENDELA_BULAN_TUNGGAKAN = 3;
function bulanMundur(ym, n){
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m-1-n, 1);
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
}
function tanggalMulaiTerdeteksi(ek, siswaId){
  const tglBayar = DB.pemasukan.filter(p=>p.ekskulId===ek.id && p.siswaId===siswaId && p.jenis==='pertemuan').map(p=>p.periode);
  const tglAbsen = ek.ekstraAbsensiId ? DB.absensi.filter(a=>a.ekstraId===ek.ekstraAbsensiId && a.siswaId===siswaId).map(a=>a.tanggal) : [];
  const semua = [...tglBayar, ...tglAbsen].filter(Boolean).sort();
  if(semua[0]) return semua[0];
  // Sama seperti tanggalMulaiTerdeteksiBulanan() di atas — fallback ke
  // Tanggal Gabung siswa sebelum menyerah ke null (cuma bulan berjalan).
  const siswa = siswaById(siswaId);
  return (siswa && siswa.tanggalGabung) ? siswa.tanggalGabung : null;
}
/* "Minggu ke berapa DALAM BULAN itu" — heuristik sederhana berdasar
   tanggal (1-7 = minggu ke-1, 8-14 = ke-2, dst), bukan minggu ISO
   kalender. Dipilih supaya gampang dipahami wali murid awam ("minggu
   ke-2 bulan ini"), bukan angka minggu ISO yang lebih rumit. */
function mingguKeDalamBulan(tanggal){ return Math.ceil(tanggal/7); }

/* Rangkai rincian pertemuan yang belum dibayar (detailBelum dari
   hitungEstimasiTunggakanPertemuan()) jadi teks siap-baca, dikelompokkan
   per bulan: "Agustus 2026: pertemuan ke-1 (Kamis, minggu ke-1), ke-3
   (Kamis, minggu ke-3); September 2026: pertemuan ke-1 (Rabu, minggu
   ke-1)". Dipakai baik untuk placeholder {daftarBulan} di pesan WA
   Per Pertemuan maupun untuk tampilan kartu Tunggakan, supaya kedua
   menu selalu menampilkan rincian yang SAMA PERSIS (sinkron). */
function daftarPertemuanBelumTeks(detailBelum){
  const perBulan = {};
  const urutanBulan = [];
  (detailBelum||[]).forEach(d=>{
    const key = d.bulanLabel + ' ' + d.tahun;
    if(!perBulan[key]){ perBulan[key] = []; urutanBulan.push(key); }
    perBulan[key].push(`ke-${d.pertemuanKe} (${d.hari}, minggu ke-${d.minggu})`);
  });
  return urutanBulan.map(bln => `${bln}: pertemuan ${perBulan[bln].join(', ')}`).join('; ');
}

function hitungEstimasiTunggakanPertemuan(){
  const bulanIni = currentPeriodeBulan();
  const hariIniOnly = hariIniStr();
  const daftarBulan = Array.from({length: JENDELA_BULAN_TUNGGAKAN}, (_, i) => bulanMundur(bulanIni, i));
  const ekPertemuan = DB.ekskul.filter(e=>e.jenisPembayaran==='pertemuan');
  return ekPertemuan.map(ek=>{
    // Jadwal resmi per bulan (SATU kali dihitung, dipakai bareng semua
    // siswa ekskul ini) — dipakai untuk menentukan "pertemuan keberapa
    // dalam bulan itu" (urutan tanggal jadwal resmi, 1-based).
    const jadwalPerBulan = {};
    daftarBulan.forEach(ym=>{
      jadwalPerBulan[ym] = tanggalPertemuanBulan(ek.hariJadwal, ym, ek.id)
        .map(d=> d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'))
        .sort();
    });
    const tanggalLewat = daftarBulan.flatMap(ym=>jadwalPerBulan[ym]).filter(s=> s <= hariIniOnly).sort();
    const anggota = DB.siswa.filter(s=>s.ekskulIds.includes(ek.id) && s.aktif!==false);
    const rincian = anggota.map(s=>{
      const mulai = tanggalMulaiTerdeteksi(ek, s.id);
      // Tanpa jejak sama sekali -> jangan tarik mundur, cuma bulan berjalan.
      const tanggalRelevan = mulai ? tanggalLewat.filter(tgl=>tgl>=mulai) : tanggalLewat.filter(tgl=>tgl.startsWith(bulanIni));
      let wajibBayar = 0, belumDiisiCount = 0;
      const detailBelum = []; // {iso, tahun, bulanKe, bulanLabel, pertemuanKe, minggu, hari, belumDiisi}
      tanggalRelevan.forEach(tgl=>{
        let wajib, belumDiisi = false;
        if(ek.ekstraAbsensiId){
          const a = DB.absensi.find(x=>x.ekstraId===ek.ekstraAbsensiId && x.siswaId===s.id && x.tanggal===tgl);
          if(!a){ wajib = true; belumDiisi = true; } // belum diisi guru -> fallback, asumsi terjadi
          else wajib = (a.status==='hadir'); // izin/sakit/alpa -> tidak dihitung, tidak ditagih
        } else {
          wajib = true;
        }
        if(!wajib) return;
        wajibBayar++;
        if(belumDiisi) belumDiisiCount++;
        // PERBAIKAN: dulu kurang dihitung dari selisih JUMLAH (wajibBayar -
        // sudahBayar), jadi tidak pernah ketahuan tanggal SPESIFIK mana yang
        // belum dibayar. Sekarang dicocokkan LANGSUNG per tanggal — pembayaran
        // pertemuan memang selalu dicatat atas tanggal jadwal resmi tertentu
        // (lihat onPmEkskulChange()), jadi pencocokan persis ini valid & lebih
        // akurat, sekaligus menghasilkan rincian tanggal yang belum dibayar.
        const sudahBayarTgl = DB.pemasukan.some(p=>p.ekskulId===ek.id && p.siswaId===s.id && p.jenis==='pertemuan' && p.periode===tgl);
        if(sudahBayarTgl) return;
        const [y,m,d] = tgl.split('-').map(Number);
        const ym = tgl.slice(0,7);
        const pertemuanKe = jadwalPerBulan[ym].indexOf(tgl) + 1;
        const dow = new Date(y, m-1, d).getDay();
        detailBelum.push({ iso:tgl, tahun:y, bulanKe:m, bulanLabel:NAMA_BULAN_PENDEK[m-1], pertemuanKe, minggu: mingguKeDalamBulan(d), hari: HARI_DARI_INDEX[dow], belumDiisi });
      });
      const sudahBayar = wajibBayar - detailBelum.length;
      const kurang = detailBelum.length;
      return { siswa:s, sudahBayar, kurang, wajibBayar, belumDiisiCount, detailBelum };
    }).filter(r=>r.kurang>0).sort((a,b)=>b.kurang-a.kurang);
    return { ek, jumlahPertemuanLewat: tanggalLewat.length, rincian };
  }).filter(r=>r.jumlahPertemuanLewat>0 && r.rincian.length>0);
}

function renderTunggakan(){
  const main = document.getElementById('mainContent');
  const rekap = hitungTunggakanBulananGabungan();
  const totalBulanan = rekap.reduce((s,r)=>s+r.rincian.length,0);
  const rekapPertemuan = hitungEstimasiTunggakanPertemuan();
  const totalPertemuan = rekapPertemuan.reduce((s,r)=>s+r.rincian.length,0);
  const adaEkPertemuan = DB.ekskul.some(e=>e.jenisPembayaran==='pertemuan');

  // Rincian nama ekskul per skema, supaya banner tidak cuma bilang
  // "nunggak Bulanan" (itu skema, bukan nama ekskul) — kalau ada 2+
  // ekskul dengan skema sama (mis. rebana kelas 4&5 DAN rebana kelas 3,
  // sama-sama Bulanan), keduanya harus kelihatan terpisah di sini,
  // bukan cuma dilebur jadi satu angka total.
  const rincianBulananTeks = rekap.map(r=>`${escapeHtml(r.ek.nama)} (${r.rincian.length})`).join(', ');
  const rincianPertemuanTeks = rekapPertemuan.map(r=>`${escapeHtml(r.ek.nama)} (${r.rincian.length})`).join(', ');

  main.innerHTML = `
    <div class="glass-strong rounded-3xl p-5 mb-5 flex items-center gap-4">
      <div class="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0" style="background:rgba(225,29,72,.12)">
        <i data-lucide="alert-circle" class="w-5 h-5" style="color:var(--rose-500)"></i>
      </div>
      <div>
        <p class="font-bold text-sm">${totalBulanan} siswa nunggak Bulanan${rekap.length ? ` di ${rekap.length} ekstrakurikuler — ${rincianBulananTeks}` : ''}${adaEkPertemuan ? `; ${totalPertemuan} siswa berpotensi kurang bayar Per Pertemuan${rekapPertemuan.length ? ` di ${rekapPertemuan.length} ekstrakurikuler — ${rincianPertemuanTeks}` : ''}` : ''}</p>
        <p class="text-xs text-slate-500">Dicek ${JENDELA_BULAN_TUNGGAKAN_BULANAN} bulan terakhir untuk skema Bulanan. "Bulanan"/"Per Pertemuan" di atas dan di label tiap kartu adalah nama <strong>skema pembayarannya</strong>, bukan nama ekstrakurikulernya — nama ekstrakurikulernya ada di judul tiap kartu &amp; rincian di atas.</p>
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 stagger">
      ${rekap.map(r=>kartuTunggakanBulananHtml(r)).join('')}
      ${rekapPertemuan.map(r=>kartuTunggakanPertemuanHtml(r)).join('')}
      ${(rekap.length===0 && rekapPertemuan.length===0) ? `<p class="text-sm text-slate-500 col-span-full text-center py-10">${adaEkPertemuan ? 'Belum ada tunggakan Bulanan maupun Per Pertemuan yang terdeteksi.' : 'Belum ada ekstrakurikuler dengan skema pembayaran Bulanan.'}</p>` : ''}
    </div>

    <p class="text-[11px] text-slate-400 mt-4 max-w-3xl">
      <i data-lucide="info" class="w-3 h-3 inline -mt-0.5"></i>
      Kartu <strong>Bulanan</strong> ditarik mundur sampai ${JENDELA_BULAN_TUNGGAKAN_BULANAN} bulan terakhir (dari bulan pembayaran pertama tercatat kalau siswanya baru gabung, supaya tidak salah tagih bulan sebelum dia jadi anggota) — bulan yang dinonaktifkan lewat menu Aktivasi Bulan & Libur tidak ikut dihitung.
      ${adaEkPertemuan ? ` Kartu <strong>Per Pertemuan</strong>: untuk ekstrakurikuler yang <strong>tertaut ke Kelola Absensi</strong> (label "Tertaut Absensi"), angkanya memakai data kehadiran asli — izin/sakit/alpa tidak ikut ditagih. Yang <strong>belum</strong> ditautkan masih murni estimasi dari jadwal hari latihan (dianggap semua pertemuan terjadi) dan bisa meleset — mohon cek manual sebelum menagih, atau tautkan ekstrakurikulernya ke Kelola Absensi lewat menu edit. Ekskul Per Pertemuan yang semua pesertanya sudah lunas TIDAK ditampilkan kartunya di sini.` : ''}
    </p>
  `;
}

function kartuTunggakanBulananHtml(r){
  return `
    <div class="glass-strong rounded-3xl p-5 border-t-4" style="border-top-color:${r.ek.warna}">
      <div class="flex items-center justify-between mb-3">
        <div>
          <h3 class="font-bold text-base flex items-center gap-1.5">${escapeHtml(r.ek.nama)} <span class="badge px-2 py-0.5 rounded-full text-[10px]" style="background:rgba(100,116,139,.12); color:#475569">Bulanan</span></h3>
          <p class="text-xs text-slate-500">Tarif: ${rupiah(r.ek.tarif)}/bulan · dicek ${JENDELA_BULAN_TUNGGAKAN_BULANAN} bulan terakhir</p>
        </div>
        <span class="badge px-2.5 py-1 rounded-full" style="background:rgba(225,29,72,.12); color:var(--rose-500)">${r.rincian.length} belum bayar</span>
      </div>
      <div class="max-h-72 overflow-y-auto divide-y divide-slate-100">
        ${r.rincian.map(item=>{
          const daftarBulanTeks = item.belumBulan.map(bulanNama).join(', ');
          return `
          <div class="tx-row flex items-center gap-3 px-2 py-2.5 rounded-xl">
            <div class="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-[11px] font-bold" style="background:rgba(225,29,72,.10); color:var(--rose-500); box-shadow: inset 0 0 0 1.5px rgba(225,29,72,.20);">${(item.siswa.nama.trim()[0]||'?').toUpperCase()}</div>
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium text-slate-800 truncate">${escapeHtml(item.siswa.nama)}</p>
              <p class="text-xs text-slate-400 truncate">${escapeHtml(item.siswa.kelas)}</p>
              <p class="text-[11px] text-rose-500 mt-0.5" title="${escapeHtml(daftarBulanTeks)}">Belum bayar: <strong>${escapeHtml(daftarBulanTeks)}</strong> · kurang ${rupiah(item.kurangRp)}</p>
            </div>
            ${canEdit() ? `<button onclick="openPemasukanForm({ekskulId:'${r.ek.id}', siswaId:'${item.siswa.id}', periode:'${item.belumBulan[0]}'})" title="Catat pembayaran ${escapeHtml(item.siswa.nama)}" aria-label="Catat pembayaran ${escapeHtml(item.siswa.nama)}" class="text-xs font-semibold text-blue-600 hover:text-blue-500 flex items-center gap-1 shrink-0">Catat <i data-lucide="arrow-right" class="w-3 h-3"></i></button>` : ''}
          </div>`;
        }).join('')}
      </div>
    </div>
  `;
}

function kartuTunggakanPertemuanHtml(r){
  return `
    <div class="glass-strong rounded-3xl p-5 border-t-4" style="border-top-color:${r.ek.warna}">
      <div class="flex items-center justify-between mb-3">
        <div>
          <h3 class="font-bold text-base flex items-center gap-1.5 flex-wrap">${escapeHtml(r.ek.nama)} <span class="badge px-2 py-0.5 rounded-full text-[10px]" style="background:rgba(245,158,11,.14); color:var(--amber-400)">Per Pertemuan</span> ${r.ek.ekstraAbsensiId ? `<span class="badge px-2 py-0.5 rounded-full text-[10px] flex items-center gap-1" style="background:rgba(23,105,209,.12); color:var(--blue-600,#1769D1)" title="Memakai data kehadiran asli"><i data-lucide="link-2" class="w-2.5 h-2.5"></i>Tertaut Absensi</span>` : ''}</h3>
          <p class="text-xs text-slate-500">Tarif: ${rupiah(r.ek.tarif)}/pertemuan · ${r.jumlahPertemuanLewat}x jadwal sudah lewat (${JENDELA_BULAN_TUNGGAKAN} bulan terakhir)</p>
        </div>
        <span class="badge px-2.5 py-1 rounded-full" style="background:rgba(245,158,11,.14); color:var(--amber-400)">${r.rincian.length} berpotensi kurang bayar</span>
      </div>
      <div class="max-h-72 overflow-y-auto divide-y divide-slate-100">
        ${r.rincian.map(item=>{
          const daftarPertemuanTeks = daftarPertemuanBelumTeks(item.detailBelum);
          return `
          <div class="tx-row flex items-center gap-3 px-2 py-2.5 rounded-xl">
            <div class="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-[11px] font-bold" style="background:rgba(245,158,11,.12); color:var(--amber-400); box-shadow: inset 0 0 0 1.5px rgba(245,158,11,.25);">${(item.siswa.nama.trim()[0]||'?').toUpperCase()}</div>
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium text-slate-800 truncate">${escapeHtml(item.siswa.nama)}</p>
              <p class="text-xs text-slate-400 truncate">${escapeHtml(item.siswa.kelas)} · sudah bayar ${item.sudahBayar}x dari ${item.wajibBayar}x wajib · kurang ${item.kurang}x${r.ek.ekstraAbsensiId && item.belumDiisiCount>0 ? ` <span title="Sebagian tanggal belum diisi guru di Kelola Absensi, masih dihitung sebagai asumsi terjadi">(${item.belumDiisiCount}x absensi belum diisi guru)</span>` : ''}</p>
              <p class="text-[11px] text-amber-500 mt-0.5" title="${escapeHtml(daftarPertemuanTeks)}">Belum bayar: <strong>${escapeHtml(daftarPertemuanTeks)}</strong></p>
            </div>
            ${canEdit() ? `<button onclick="openPemasukanForm({ekskulId:'${r.ek.id}', siswaId:'${item.siswa.id}'})" title="Catat pembayaran ${escapeHtml(item.siswa.nama)}" aria-label="Catat pembayaran ${escapeHtml(item.siswa.nama)}" class="text-xs font-semibold text-blue-600 hover:text-blue-500 flex items-center gap-1 shrink-0">Catat <i data-lucide="arrow-right" class="w-3 h-3"></i></button>` : ''}
          </div>`;
        }).join('')}
      </div>
    </div>
  `;
}

/* =========================================================
   PENGINGAT PEMBAYARAN (WhatsApp)
   Bukan "kirim otomatis tanpa disentuh" (aplikasi ini tidak terhubung ke
   WhatsApp Business API berbayar) — melainkan pesan tersusun otomatis
   dari template yang bisa diatur, lalu dibuka lewat wa.me supaya
   Bendahara tinggal menekan tombol Kirim di WhatsApp untuk tiap wali
   murid. Nomor WA diinput/diedit manual oleh Bendahara di sini.
   ========================================================= */
/* Sama seperti hitungTunggakan() tapi bisa untuk bulan mana pun yang
   dipilih Bendahara — sengaja fungsi terpisah, currentPeriodeBulan()
   dipakai di banyak tempat lain jadi tidak diubah jadi bisa-override.
   CATATAN: sejak menu Pengingat disinkronkan dengan menu Tunggakan
   (memakai hitungTunggakanBulananGabungan() yang menghitung 6 bulan
   sekaligus), fungsi single-bulan ini TIDAK DIPAKAI lagi di menu
   manapun — dipertahankan apa adanya (bukan dihapus) karena masih
   dites langsung oleh test-live/frontend-test.mjs. */
function hitungTunggakanBulan(periode){
  const ekBulanan = DB.ekskul.filter(e=>e.jenisPembayaran==='bulanan' && !bulanNonaktifUntukPeriode(e, periode));
  return ekBulanan.map(ek=>{
    const anggota = DB.siswa.filter(s=>s.ekskulIds.includes(ek.id) && s.aktif!==false);
    const belum = anggota.filter(s=>!DB.pemasukan.some(p=>p.ekskulId===ek.id && p.siswaId===s.id && p.jenis==='bulanan' && p.periode===periode));
    return { ek, periode, belum };
  }).filter(r=>r.belum.length>0);
}

/* Ganti nomor 08xx / +62xx / 62xx jadi format 62xx tanpa simbol apa pun
   — format yang dikenali wa.me. Mengembalikan '' kalau nomornya kosong
   atau kelihatan tidak valid (terlalu pendek). */
function normalizeNomorWa(nomor){
  let n = String(nomor||'').replace(/[^\d]/g,'');
  if(!n) return '';
  if(n.startsWith('0')) n = '62' + n.slice(1);
  else if(!n.startsWith('62')) n = '62' + n;
  return n.length >= 9 ? n : '';
}

function buildWaLink(nomor, pesan){
  const n = normalizeNomorWa(nomor);
  if(!n) return null;
  return `https://wa.me/${n}?text=${encodeURIComponent(pesan)}`;
}

/* Ganti placeholder {namaSiswa} dst di template dengan data siswa yang
   sebenarnya. Placeholder yang tidak dikenali/tidak relevan (mis.
   {jumlahPertemuanKurang} di template bulanan) dibiarkan kosong, bukan
   error, supaya Bendahara bebas menyusun ulang template tanpa was-was. */
function susunPesanPengingat(template, vars){
  return String(template||'').replace(/\{(\w+)\}/g, (m,key)=> (key in vars) ? String(vars[key]) : '');
}

function namaSekolahSingkat(){
  const baris = (DB.pengaturan.kopLines||[]).find(l=>l.text);
  return baris ? baris.text : (DB.pengaturan.publikNamaWeb || 'Sekolah');
}

/* Update nomor WA wali murid langsung dari menu Pengingat (dipanggil
   onBlur input) — cuma menyentuh field waliHp, bukan form siswa penuh,
   supaya alurnya cepat: lihat siapa nunggak, isi/betulkan nomornya,
   langsung kirim. */
function updateWaliHpDariPengingat(siswaId, nilai){
  if(!requireEdit()) return;
  const s = siswaById(siswaId);
  if(!s) return;
  const lama = s.waliHp || '';
  const baru = nilai.trim();
  if(lama === baru) return;
  s.waliHp = baru;
  catatAktivitas('Ubah No. WA Wali', `${s.nama} — ${baru || '(dikosongkan)'}`);
  saveDB(DB);
  showToast('Nomor WA disimpan.');
  kedipkanInputTersimpan(siswaId);
}

/* Sengaja TIDAK pakai tombol "Simpan" terpisah untuk nomor HP di menu
   Pengingat (auto-save on-blur sudah cukup & lebih ringkas di baris
   kartu yang sempit) — sebagai gantinya, beri kepastian visual bahwa
   nomor beneran tersimpan lewat kedipan border hijau sesaat di kotak
   inputnya sendiri, supaya Bendahara tidak cuma mengandalkan toast
   kecil yang gampang kelewat kalau lagi isi banyak nomor berturut-turut. */
function kedipkanInputTersimpan(siswaId){
  const input = document.getElementById('pengingatHp_' + siswaId);
  if(!input) return;
  input.style.transition = 'border-color .2s ease';
  input.style.borderColor = 'var(--emerald-500)';
  setTimeout(()=>{ input.style.borderColor = ''; }, 900);
}

function simpanTemplatePengingat(field, textareaId){
  if(!requireEdit()) return;
  const val = document.getElementById(textareaId).value;
  DB.pengaturan[field] = val;
  catatAktivitas('Ubah Template Pengingat WA', field==='templateWaBulanan' ? 'Template bulanan' : 'Template per pertemuan');
  saveDB(DB);
  showToast('Template pesan disimpan.');
}

/* PERBAIKAN: sebelumnya nomor HP di-"bekukan" ke dalam atribut onclick
   SAAT KARTU DIRENDER (dari item.siswa.waliHp) — jadi kalau Bendahara
   ketik/ubah nomor di kotak input lalu langsung klik "Kirim" TANPA
   kartu ini di-render ulang, pesan terkirim memakai nomor LAMA (atau
   kosong), bukan yang baru saja diketik. Efeknya kerasa seolah nomor
   "tidak tersimpan" dan harus diinput ulang tiap mau mengingatkan.
   Sekarang kirimPengingatWa() menerima siswaId (bukan nomor mentah),
   lalu membaca nomor LANGSUNG dari kotak input saat tombol diklik
   (selalu nilai terbaru, walau blur belum sempat terjadi), dan
   memastikan nomor itu ikut tersimpan ke database lewat
   updateWaliHpDariPengingat() sebelum link WA dibuka. */
function kirimPengingatWa(siswaId, pesan, namaSiswa){
  const input = document.getElementById('pengingatHp_' + siswaId);
  const nomor = input ? input.value : '';
  updateWaliHpDariPengingat(siswaId, nomor);
  const link = buildWaLink(nomor, pesan);
  if(!link){ showToast('Nomor WA belum diisi atau tidak valid untuk ' + namaSiswa + '.', 'error'); return; }
  window.open(link, '_blank');
  logCetak('Kirim Pengingat WA', namaSiswa);
}

/* Kartu Bulanan di menu Pengingat — memakai hitungTunggakanBulananGabungan()
   YANG SAMA dengan menu Tunggakan (bukan hitung ulang terpisah), supaya
   dua menu ini selalu sinkron: siswa & bulan yang tampil di sini persis
   sama dengan yang tampil di kartu Tunggakan. */
function kartuPengingatBulananHtml(r){
  const pg = DB.pengaturan;
  return `
    <div class="glass-strong rounded-3xl p-5 border-t-4" style="border-top-color:${r.ek.warna}">
      <div class="flex items-center justify-between mb-3">
        <h4 class="font-bold text-base flex items-center gap-1.5">${escapeHtml(r.ek.nama)} <span class="badge px-2 py-0.5 rounded-full text-[10px]" style="background:rgba(100,116,139,.12); color:#475569">Bulanan</span></h4>
        <span class="badge px-2.5 py-1 rounded-full" style="background:rgba(225,29,72,.12); color:var(--rose-500)">${r.rincian.length} siswa</span>
      </div>
      <div class="max-h-72 overflow-y-auto divide-y divide-slate-100">
        ${r.rincian.map(item=>{
          const daftarBulanTeks = item.belumBulan.map(bulanNama).join(', ');
          const pesan = susunPesanPengingat(pg.templateWaBulanan, {
            namaSiswa:item.siswa.nama, waliNama:item.siswa.waliNama||'Bapak/Ibu', kelas:item.siswa.kelas,
            ekskul:r.ek.nama, daftarBulan:daftarBulanTeks, totalTunggakan:rupiah(item.kurangRp),
            jumlahPertemuanKurang:'', namaSekolah:namaSekolahSingkat(),
          });
          return `
          <div class="py-2.5 flex items-center gap-2.5 flex-wrap sm:flex-nowrap">
            <div class="flex-1 min-w-[160px]">
              <p class="text-sm font-medium text-slate-800 truncate">${escapeHtml(item.siswa.nama)}</p>
              <p class="text-xs text-slate-400 truncate">${escapeHtml(item.siswa.kelas)}</p>
              <p class="text-[11px] text-rose-500 mt-0.5 truncate" title="${escapeHtml(daftarBulanTeks)}">Belum: ${escapeHtml(daftarBulanTeks)}</p>
            </div>
            <input type="tel" id="pengingatHp_${item.siswa.id}" placeholder="08xxxxxxxxxx" value="${escapeHtml(item.siswa.waliHp||'')}" ${canEdit()?'':'disabled'}
              onblur="updateWaliHpDariPengingat('${item.siswa.id}', this.value)"
              class="glass rounded-lg px-2.5 py-1.5 text-xs w-32 shrink-0" title="Nomor WA wali murid ${escapeHtml(item.siswa.nama)}">
            ${canEdit() ? `<button onclick='kirimPengingatWa(${jsAttr(item.siswa.id)}, ${jsAttr(pesan)}, ${jsAttr(item.siswa.nama)})' class="btn-primary px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5 shrink-0"><i data-lucide="send" class="w-3.5 h-3.5"></i>Kirim</button>` : ''}
          </div>`;
        }).join('')}
      </div>
    </div>
  `;
}

/* Kartu Per Pertemuan di menu Pengingat — memakai hitungEstimasiTunggakanPertemuan()
   YANG SAMA dengan menu Tunggakan, dan pesan WA-nya memakai
   daftarPertemuanBelumTeks() yang sama juga untuk placeholder
   {daftarBulan}, supaya rincian bulan/minggu/hari yang dikirim ke wali
   murid persis sama dengan yang tampil di kartu Tunggakan. */
function kartuPengingatPertemuanHtml(r){
  const pg = DB.pengaturan;
  return `
    <div class="glass-strong rounded-3xl p-5 border-t-4" style="border-top-color:${r.ek.warna}">
      <div class="flex items-center justify-between mb-3">
        <h4 class="font-bold text-base flex items-center gap-1.5 flex-wrap">${escapeHtml(r.ek.nama)} <span class="badge px-2 py-0.5 rounded-full text-[10px]" style="background:rgba(245,158,11,.14); color:var(--amber-400)">Per Pertemuan</span></h4>
        <span class="badge px-2.5 py-1 rounded-full" style="background:rgba(245,158,11,.14); color:var(--amber-400)">${r.rincian.length} siswa</span>
      </div>
      <div class="max-h-72 overflow-y-auto divide-y divide-slate-100">
        ${r.rincian.map(item=>{
          const daftarPertemuanTeks = daftarPertemuanBelumTeks(item.detailBelum);
          const pesan = susunPesanPengingat(pg.templateWaPertemuan, {
            namaSiswa:item.siswa.nama, waliNama:item.siswa.waliNama||'Bapak/Ibu', kelas:item.siswa.kelas,
            ekskul:r.ek.nama, daftarBulan:daftarPertemuanTeks,
            totalTunggakan:rupiah(item.kurang*r.ek.tarif), jumlahPertemuanKurang:item.kurang,
            namaSekolah:namaSekolahSingkat(),
          });
          return `
          <div class="py-2.5 flex items-center gap-2.5 flex-wrap sm:flex-nowrap">
            <div class="flex-1 min-w-[160px]">
              <p class="text-sm font-medium text-slate-800 truncate">${escapeHtml(item.siswa.nama)}</p>
              <p class="text-xs text-slate-400 truncate">${escapeHtml(item.siswa.kelas)} · kurang ${item.kurang}x</p>
              <p class="text-[11px] text-amber-500 mt-0.5 truncate" title="${escapeHtml(daftarPertemuanTeks)}">Belum: ${escapeHtml(daftarPertemuanTeks)}</p>
            </div>
            <input type="tel" id="pengingatHp_${item.siswa.id}" placeholder="08xxxxxxxxxx" value="${escapeHtml(item.siswa.waliHp||'')}" ${canEdit()?'':'disabled'}
              onblur="updateWaliHpDariPengingat('${item.siswa.id}', this.value)"
              class="glass rounded-lg px-2.5 py-1.5 text-xs w-32 shrink-0" title="Nomor WA wali murid ${escapeHtml(item.siswa.nama)}">
            ${canEdit() ? `<button onclick='kirimPengingatWa(${jsAttr(item.siswa.id)}, ${jsAttr(pesan)}, ${jsAttr(item.siswa.nama)})' class="btn-primary px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5 shrink-0"><i data-lucide="send" class="w-3.5 h-3.5"></i>Kirim</button>` : ''}
          </div>`;
        }).join('')}
      </div>
    </div>
  `;
}

function renderPengingat(){
  const main = document.getElementById('mainContent');
  const pg = DB.pengaturan;

  // Sengaja pakai FUNGSI YANG SAMA dengan menu Tunggakan (bukan hitung
  // ulang terpisah) supaya kedua menu selalu sinkron — lihat catatan
  // di hitungTunggakanBulananGabungan() & hitungEstimasiTunggakanPertemuan().
  const rekapBulanan = hitungTunggakanBulananGabungan();
  const totalBulanan = rekapBulanan.reduce((s,r)=>s+r.rincian.length,0);
  const rekapPertemuan = hitungEstimasiTunggakanPertemuan();
  const totalPertemuan = rekapPertemuan.reduce((s,r)=>s+r.rincian.length,0);
  const adaEkPertemuan = DB.ekskul.some(e=>e.jenisPembayaran==='pertemuan');

  main.innerHTML = `
    <div class="glass-strong rounded-3xl p-5 mb-5 flex items-start gap-4">
      <div class="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0" style="background:rgba(23,105,209,.12)">
        <i data-lucide="send" class="w-5 h-5" style="color:var(--blue-600, #1769D1)"></i>
      </div>
      <div class="flex-1 min-w-0">
        <p class="font-bold text-sm">Pengingat pembayaran lewat WhatsApp</p>
        <p class="text-xs text-slate-500 mt-1">${totalBulanan} siswa nunggak Bulanan (dicek ${JENDELA_BULAN_TUNGGAKAN_BULANAN} bulan terakhir)${adaEkPertemuan ? `, ${totalPertemuan} siswa berpotensi kurang bayar Per Pertemuan` : ''}. Pesan disusun otomatis dari template di bawah — lengkap dengan rincian bulan (Bulanan) atau bulan/minggu/hari pertemuan (Per Pertemuan) yang belum dibayar — tapi tetap perlu Anda tekan tombol Kirim di WhatsApp untuk tiap wali murid (aplikasi tidak terhubung ke WhatsApp Business API). Nomor WA diisi/dikoreksi manual di sini.</p>
      </div>
    </div>

    <details class="glass-strong rounded-3xl p-5 mb-5">
      <summary class="text-sm font-bold cursor-pointer flex items-center gap-2"><i data-lucide="message-square-text" class="w-4 h-4"></i>Atur Template Pesan</summary>
      <div class="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div>
          <label class="text-xs font-semibold text-slate-500 mb-1.5 block">Template — Ekstrakurikuler Bulanan</label>
          <textarea id="tplWaBulanan" rows="7" class="w-full glass rounded-xl px-3 py-2.5 text-sm">${escapeHtml(pg.templateWaBulanan)}</textarea>
          ${canEdit() ? `<button onclick="simpanTemplatePengingat('templateWaBulanan','tplWaBulanan')" class="btn-primary mt-2 px-3 py-1.5 rounded-lg text-xs">Simpan Template</button>` : ''}
        </div>
        <div>
          <label class="text-xs font-semibold text-slate-500 mb-1.5 block">Template — Ekstrakurikuler Per Pertemuan</label>
          <textarea id="tplWaPertemuan" rows="7" class="w-full glass rounded-xl px-3 py-2.5 text-sm">${escapeHtml(pg.templateWaPertemuan)}</textarea>
          ${canEdit() ? `<button onclick="simpanTemplatePengingat('templateWaPertemuan','tplWaPertemuan')" class="btn-primary mt-2 px-3 py-1.5 rounded-lg text-xs">Simpan Template</button>` : ''}
        </div>
      </div>
      <p class="text-xs text-slate-400 mt-3">Placeholder yang bisa dipakai: <code>{namaSiswa}</code> <code>{waliNama}</code> <code>{kelas}</code> <code>{ekskul}</code> <code>{daftarBulan}</code> <code>{totalTunggakan}</code> <code>{jumlahPertemuanKurang}</code> <code>{namaSekolah}</code>. Untuk template <strong>Bulanan</strong>, <code>{daftarBulan}</code> otomatis berisi daftar SEMUA bulan yang belum dibayar (bisa lebih dari satu). Untuk template <strong>Per Pertemuan</strong>, <code>{daftarBulan}</code> otomatis berisi rincian lengkap bulan, pertemuan ke berapa, minggu ke berapa, dan hari apa saja yang belum dibayar.</p>
    </details>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 stagger">
      ${rekapBulanan.map(r=>kartuPengingatBulananHtml(r)).join('')}
      ${rekapPertemuan.map(r=>kartuPengingatPertemuanHtml(r)).join('')}
      ${(rekapBulanan.length===0 && rekapPertemuan.length===0) ? `<p class="text-sm text-slate-500 col-span-full text-center py-10">Tidak ada tunggakan Bulanan maupun Per Pertemuan yang terdeteksi.</p>` : ''}
    </div>
  `;
}

/* =========================================================
   KELOLA ABSENSI (ekstrakurikuler guru ekstra)
   Sengaja pakai daftar ekstrakurikuler SENDIRI (DB.ekstraAbsensi),
   terpisah dari DB.ekskul yang berbayar — lihat catatan skema di
   schema.sql. Guru ekstra login lewat akun yang dibuat Bendahara di
   menu Pengaturan (lihat renderAkunGuruDiPengaturan()), dan cuma bisa
   melihat/mengisi absensi untuk ekstra yang ditugaskan ke dia.
   ========================================================= */
let absensiEkstraTerpilih = null;
let absensiTanggalTerpilih = null;
const STATUS_ABSENSI = [
  { v:'hadir', label:'Hadir', color:'#059669' },
  { v:'izin', label:'Izin', color:'#1769D1' },
  { v:'sakit', label:'Sakit', color:'#F59E0B' },
  { v:'alpa', label:'Alpa', color:'#E11D48' },
];
function labelStatusAbsensi(v){ return (STATUS_ABSENSI.find(s=>s.v===v) || STATUS_ABSENSI[0]).label; }
function warnaStatusAbsensi(v){ return (STATUS_ABSENSI.find(s=>s.v===v) || STATUS_ABSENSI[0]).color; }
/* Ekstra yang boleh dipilih di dropdown "Ambil Absensi": Bendahara/Kepsek
   melihat semua jenis; Guru Ekstra otomatis hanya melihat yang memang
   ditugaskan ke dia (server sudah menyaring DB.ekstraAbsensi untuk role
   'guru' — lihat getGuruData() di src/index.js — jadi di sini tinggal
   pakai DB.ekstraAbsensi apa adanya untuk role apa pun). */
function opsiEkstraAbsensiUntukSaya(){ return DB.ekstraAbsensi; }

/* =========================================================
   ABSEN GURU PEMBINA SENDIRI — langkah WAJIB sebelum guru ekstra bisa
   mengisi absensi siswa (dicek juga di server, lihat simpanAbsensiGuru()
   di src/index.js). Satu baris per (ekstraId, tanggal) — lihat catatan
   di schema.sql (tabel absensi_guru).
   ========================================================= */
function absensiGuruUntuk(ekstraId, tanggal){
  return (DB.absensiGuru||[]).find(a=>a.ekstraId===ekstraId && a.tanggal===tanggal) || null;
}

function renderAbsenGuruHtml(ekstraId, tanggal){
  const rec = absensiGuruUntuk(ekstraId, tanggal);
  const bolehIsi = canInputAbsensi();
  const curStatus = rec ? rec.status : 'hadir';
  const curCatatan = rec ? (rec.catatan||'') : '';
  const wajibTapiBelum = currentRole === 'guru' && !rec;
  return `
    <div class="rounded-2xl p-4 mb-4" style="border:1px solid rgba(23,105,209,.25); background:rgba(23,105,209,.05)">
      <p class="text-xs font-semibold mb-2 flex items-center gap-1.5" style="color:var(--blue-600)">
        <i data-lucide="user-check" class="w-3.5 h-3.5"></i>
        Absen Guru Pembina ${rec ? `— tercatat: ${escapeHtml(rec.guruNama||'-')} (${labelStatusAbsensi(rec.status)})` : '— belum diisi'}
      </p>
      <div class="flex items-center gap-1 flex-wrap mb-2" id="absenGuruStatusWrap" data-absen-guru-status="${curStatus}">
        ${STATUS_ABSENSI.map(st=>`
          <button type="button" data-absen-guru-btn="${st.v}" ${bolehIsi?'':'disabled'} onclick="setAbsenGuruStatus('${st.v}')"
            class="rounded-lg px-2.5 py-1.5 text-[11px] font-semibold border-0 outline-none transition ${bolehIsi?'cursor-pointer':'cursor-default'} ${curStatus===st.v?'':'bg-slate-100 text-slate-500'}"
            style="${curStatus===st.v ? `background:${st.color};color:#fff` : ''}">${st.label}</button>
        `).join('')}
      </div>
      ${bolehIsi ? `
        <div class="flex items-center gap-2 flex-wrap">
          <input type="text" id="absenGuruCatatan" placeholder="Catatan (opsional)" value="${escapeHtml(curCatatan)}" class="glass rounded-lg px-2.5 py-1.5 text-xs w-48">
          <button onclick="simpanAbsenGuruSendiri('${ekstraId}','${tanggal}')" class="btn-primary px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5"><i data-lucide="check" class="w-3.5 h-3.5"></i>${rec?'Perbarui':'Simpan'} Absen Guru</button>
        </div>
      ` : ''}
      ${wajibTapiBelum ? `<p class="text-[11px] mt-2 font-medium" style="color:var(--amber-400)"><i data-lucide="alert-triangle" class="w-3 h-3 inline -mt-0.5"></i> Isi absen Anda dulu di atas — form absensi siswa di bawah masih terkunci.</p>` : ''}
    </div>
  `;
}

function setAbsenGuruStatus(status){
  const wrap = document.getElementById('absenGuruStatusWrap');
  if(!wrap) return;
  wrap.dataset.absenGuruStatus = status;
  wrap.querySelectorAll('[data-absen-guru-btn]').forEach(btn=>{
    const st = STATUS_ABSENSI.find(x=>x.v===btn.dataset.absenGuruBtn);
    const aktif = btn.dataset.absenGuruBtn === status;
    btn.classList.toggle('bg-slate-100', !aktif);
    btn.classList.toggle('text-slate-500', !aktif);
    btn.style.background = aktif ? st.color : '';
    btn.style.color = aktif ? '#fff' : '';
  });
}

async function simpanAbsenGuruSendiri(ekstraId, tanggal){
  if(!canInputAbsensi()){ showToast('Anda tidak berwenang mengisi absensi.', 'error'); return; }
  const wrap = document.getElementById('absenGuruStatusWrap');
  const status = wrap ? wrap.dataset.absenGuruStatus : 'hadir';
  const catatanEl = document.getElementById('absenGuruCatatan');
  const catatan = catatanEl ? catatanEl.value.trim() : '';

  if(currentRole === 'guru'){
    try{
      const res = await rpc('simpan_absensi_guru_sendiri', { p_token:getToken()||'', p_ekstra_id:ekstraId, p_tanggal:tanggal, p_status:status, p_catatan:catatan });
      if(!res || !res.ok){ showToast('Gagal menyimpan absen guru: ' + (res && res.error || 'tidak diketahui'), 'error'); return; }
      showToast('Absen Guru Pembina tersimpan.');
      await fetchDBFromServer();
      renderView('absensi');
    }catch(e){ console.error(e); showToast('Tidak bisa terhubung ke server.', 'error'); }
    return;
  }

  if(!requireEdit()) return;
  const id = `abg_${ekstraId}_${tanggal}`;
  const idx = DB.absensiGuru.findIndex(a=>a.id===id);
  const rec = { id, ekstraId, guruId: idx>=0 ? DB.absensiGuru[idx].guruId : null, guruNama: currentUserName(), tanggal, status, catatan };
  if(idx>=0) DB.absensiGuru[idx] = rec; else DB.absensiGuru.push(rec);
  catatAktivitas('Absen Guru Pembina', `${tanggalIndo(tanggal)} — ${labelStatusAbsensi(status)}`);
  saveDB(DB);
  showToast('Absen Guru Pembina tersimpan.');
  renderView('absensi');
}

function renderAbsensi(){
  const main = document.getElementById('mainContent');
  const opsiEkstra = opsiEkstraAbsensiUntukSaya();
  if(!absensiEkstraTerpilih || !opsiEkstra.some(e=>e.id===absensiEkstraTerpilih)) absensiEkstraTerpilih = opsiEkstra[0]?.id || null;
  if(!absensiTanggalTerpilih) absensiTanggalTerpilih = hariIniStr();
  const ekTerpilih = absensiEkstraTerpilih ? ekstraAbsensiById(absensiEkstraTerpilih) : null;

  main.innerHTML = `
    ${canManageAbsensi() ? renderKelolaJenisEkstraAbsensiHtml() : ''}
    ${opsiEkstra.length===0 ? `
      <div class="glass-strong rounded-3xl p-8 text-center">
        <i data-lucide="clipboard-list" class="w-8 h-8 mx-auto mb-2 text-slate-300"></i>
        <p class="text-sm text-slate-500">${currentRole==='guru' ? 'Anda belum ditugaskan ke ekstrakurikuler mana pun. Hubungi Bendahara.' : 'Belum ada jenis ekstrakurikuler absensi. Tambahkan dulu di atas.'}</p>
      </div>
    ` : `
      <div class="glass-strong rounded-3xl p-5 mb-5">
        <div class="flex items-center gap-2 mb-4 text-xs font-semibold" style="color:var(--blue-600)">
          <span class="w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px]" style="background:var(--blue-600)">1</span>
          Pilih ekstrakurikuler &amp; tanggal
        </div>
        <div class="flex items-center gap-3 flex-wrap mb-2">
          <select onchange="absensiEkstraTerpilih=this.value; renderView('absensi')" title="Pilih ekstrakurikuler" class="glass rounded-xl px-3 py-2 text-sm font-medium">
            ${opsiEkstra.map(e=>`<option value="${e.id}" ${e.id===absensiEkstraTerpilih?'selected':''}>${escapeHtml(e.nama)}</option>`).join('')}
          </select>
          <input type="date" value="${absensiTanggalTerpilih}" max="${hariIniStr()}" onchange="absensiTanggalTerpilih=this.value; renderView('absensi')" title="Pilih tanggal" class="glass rounded-xl px-3 py-2 text-sm font-medium">
          <button onclick="bukaCetakPresensiAbsensi()" class="btn-secondary px-3 py-2 rounded-xl text-xs flex items-center gap-1.5"><i data-lucide="printer" class="w-3.5 h-3.5"></i>Cetak Presensi</button>
          ${canManageAbsensi() ? `<button onclick="openPesertaAbsensiManage('${absensiEkstraTerpilih}')" class="btn-secondary px-3 py-2 rounded-xl text-xs flex items-center gap-1.5 ml-auto"><i data-lucide="user-plus" class="w-3.5 h-3.5"></i>Kelola Peserta</button>` : ''}
        </div>
        ${ekTerpilih && (!ekTerpilih.hariJadwal || ekTerpilih.hariJadwal.length===0) ? `<p class="text-[11px] mb-3" style="color:var(--amber-400)"><i data-lucide="alert-triangle" class="w-3 h-3 inline -mt-0.5"></i> Jadwal hari latihan belum diatur untuk ekstrakurikuler ini, jadi Cetak Presensi belum bisa dipakai. ${canManageAbsensi() ? 'Atur lewat tombol edit di atas.' : 'Minta Bendahara mengaturnya.'}</p>` : ''}
        ${ekTerpilih && (ekTerpilih.hariJadwal||[]).length>0 && !ekTerpilih.hariJadwal.includes(namaHariDariTanggalStr(absensiTanggalTerpilih)) ? `<p class="text-[11px] mb-3" style="color:var(--amber-400)"><i data-lucide="alert-triangle" class="w-3 h-3 inline -mt-0.5"></i> ${tanggalIndo(absensiTanggalTerpilih)} jatuh hari <strong>${namaHariDariTanggalStr(absensiTanggalTerpilih)}</strong>, bukan hari jadwal latihan (${ekTerpilih.hariJadwal.join(' & ')}). Kalau ini memang pertemuan pengganti/tambahan, lanjutkan saja mengisi seperti biasa — tetap akan ikut muncul saat Cetak Presensi. Kalau salah pilih tanggal, ganti dulu tanggalnya di atas.</p>` : ''}
        ${ekTerpilih ? `
        <div class="flex items-center gap-2 mb-2 text-xs font-semibold mt-3" style="color:var(--blue-600)">
          <span class="w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px]" style="background:var(--blue-600)">2</span>
          Absen Guru Pembina dulu
        </div>
        ${renderAbsenGuruHtml(absensiEkstraTerpilih, absensiTanggalTerpilih)}
        ` : ''}
        <div class="flex items-center gap-2 mb-4 text-xs font-semibold mt-3" style="color:var(--blue-600)">
          <span class="w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px]" style="background:var(--blue-600)">3</span>
          Isi kehadiran siswa — ${escapeHtml(ekTerpilih?.nama||'-')}, ${tanggalIndo(absensiTanggalTerpilih)}
        </div>
        ${renderFormAmbilAbsensiHtml(absensiEkstraTerpilih, absensiTanggalTerpilih)}
      </div>
      ${renderRekapAbsensiHtml(opsiEkstra)}
    `}
  `;
  safeIcons();
}

function renderKelolaJenisEkstraAbsensiHtml(){
  return `
    <details class="glass-strong rounded-3xl p-5 mb-5">
      <summary class="text-sm font-bold cursor-pointer flex items-center justify-between gap-2">
        <span class="flex items-center gap-2"><i data-lucide="shapes" class="w-4 h-4"></i>Jenis Ekstrakurikuler Absensi (${DB.ekstraAbsensi.length})</span>
      </summary>
      <div class="mt-4">
        <div class="flex justify-end mb-3">
          <button onclick="openEkstraAbsensiForm()" class="btn-primary px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5"><i data-lucide="plus" class="w-3.5 h-3.5"></i>Tambah Jenis</button>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          ${DB.ekstraAbsensi.map(e=>{
            const ekTertaut = ekskulTertautKe(e.id);
            return `
            <div class="glass rounded-2xl p-4 border-l-4" style="border-left-color:${e.warna}">
              <div class="flex items-start justify-between gap-2">
                <div class="min-w-0">
                  <p class="font-semibold text-sm truncate">${escapeHtml(e.nama)}</p>
                  <p class="text-xs text-slate-400 truncate">${escapeHtml(e.keterangan||'-')} · ${pesertaAbsensi(e.id).length} peserta</p>
                  <p class="text-[11px] mt-0.5 ${(e.hariJadwal||[]).length ? 'text-slate-400' : 'font-medium'}" style="${(e.hariJadwal||[]).length ? '' : 'color:var(--amber-400)'}">
                    ${(e.hariJadwal||[]).length ? 'Jadwal: ' + e.hariJadwal.join(' & ') : 'Jadwal belum diatur — Cetak Presensi tidak bisa dipakai'}
                  </p>
                  ${ekTertaut ? `<p class="text-[11px] mt-0.5 flex items-center gap-1" style="color:var(--blue-600,#1769D1)"><i data-lucide="link-2" class="w-3 h-3"></i>Tertaut ke "${escapeHtml(ekTertaut.nama)}"</p>` : ''}
                </div>
                <div class="flex items-center gap-1 shrink-0">
                  <button onclick='openEkstraAbsensiForm(${JSON.stringify(e.id)})' title="Edit" aria-label="Edit ${escapeHtml(e.nama)}" class="text-slate-500 hover:text-blue-600 p-1"><i data-lucide="pencil" class="w-3.5 h-3.5"></i></button>
                  <button onclick="deleteEkstraAbsensi('${e.id}')" title="Hapus" aria-label="Hapus ${escapeHtml(e.nama)}" class="text-slate-500 hover:text-rose-500 p-1"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>
                </div>
              </div>
            </div>
          `;}).join('') || `<p class="text-sm text-slate-500 col-span-full text-center py-4">Belum ada jenis ekstrakurikuler absensi.</p>`}
        </div>
      </div>
    </details>
  `;
}

function renderFormAmbilAbsensiHtml(ekstraId, tanggal){
  const peserta = pesertaAbsensi(ekstraId);
  if(peserta.length===0) return `<p class="text-sm text-slate-500 text-center py-6">Belum ada siswa terdaftar di ekstrakurikuler ini. ${canManageAbsensi() ? 'Klik "Kelola Peserta" untuk menambahkan.' : 'Hubungi Bendahara untuk mendaftarkan siswa.'}</p>`;
  // Guru ekstra WAJIB absen dirinya dulu (lihat renderAbsenGuruHtml() &
  // simpanAbsensiGuru() di src/index.js yang menegakkan ini di server
  // juga) — form absensi siswa terkunci sampai baris absensi_guru ada
  // untuk ekstra+tanggal ini. Bendahara/Kepsek tidak terkena kunci ini.
  if(currentRole === 'guru' && !absensiGuruUntuk(ekstraId, tanggal)){
    return `<p class="text-sm text-center py-6" style="color:var(--amber-400)"><i data-lucide="lock" class="w-4 h-4 inline -mt-0.5"></i> Isi dulu "Absen Guru Pembina" di atas untuk membuka form absensi siswa.</p>`;
  }
  const sudahAda = DB.absensi.filter(a=>a.ekstraId===ekstraId && a.tanggal===tanggal);
  const statusMap = {}; sudahAda.forEach(a=>{ statusMap[a.siswaId] = { status:a.status, catatan:a.catatan||'' }; });
  const bolehIsi = canInputAbsensi();
  const sudahTersimpan = sudahAda.length > 0;

  return `
    <div class="flex items-center justify-between gap-2 mb-2 flex-wrap">
      <p id="absensiTallyText" class="text-xs text-slate-500">${teksTallyAbsensi(peserta, statusMap)}</p>
      ${bolehIsi ? `<button type="button" onclick="tandaiSemuaAbsensi('hadir')" class="text-xs font-medium" style="color:var(--blue-600)">Tandai semua Hadir</button>` : ''}
    </div>
    <div class="rounded-2xl overflow-hidden" style="border:1px solid rgba(148,163,184,.18)">
      <div class="divide-y divide-slate-100">
        ${peserta.map(s=>{
          const cur = statusMap[s.id] || { status:'hadir', catatan:'' };
          return `
          <div class="flex items-center gap-3 px-4 py-3 flex-wrap" data-absensi-row="${s.id}" data-absensi-status="${cur.status}">
            <div class="flex-1 min-w-[140px]">
              <p class="text-sm font-medium text-slate-800">${escapeHtml(s.nama)}</p>
              <p class="text-xs text-slate-400">${escapeHtml(s.kelas)}</p>
            </div>
            <div class="flex items-center gap-1 shrink-0 flex-wrap">
              ${STATUS_ABSENSI.map(st=>`
                <button type="button" data-status-btn="${s.id}" data-status-value="${st.v}" ${bolehIsi?'':'disabled'}
                  onclick="setAbsensiStatus('${s.id}','${st.v}')"
                  class="rounded-lg px-2.5 py-1.5 text-[11px] font-semibold border-0 outline-none transition ${bolehIsi ? 'cursor-pointer' : 'cursor-default'} ${cur.status===st.v ? '' : 'bg-slate-100 text-slate-500'}"
                  style="${cur.status===st.v ? `background:${st.color};color:#fff` : ''}">${st.label}</button>
              `).join('')}
            </div>
            <input type="text" placeholder="Catatan (opsional)" value="${escapeHtml(cur.catatan)}" ${bolehIsi?'':'disabled'}
              data-catatan="${s.id}" class="glass rounded-lg px-2.5 py-1.5 text-xs w-36 shrink-0">
          </div>`;
        }).join('')}
      </div>
    </div>
    ${bolehIsi ? `
      <div class="flex items-center justify-between gap-2 mt-4 flex-wrap">
        <p class="text-[11px] text-slate-400">${sudahTersimpan ? 'Absensi tanggal ini sudah pernah disimpan — menyimpan lagi akan menimpa isian sebelumnya.' : 'Absensi tanggal ini belum pernah disimpan.'}</p>
        <button onclick="simpanAbsensi('${ekstraId}','${tanggal}')" class="btn-primary px-4 py-2.5 rounded-xl text-sm flex items-center gap-2"><i data-lucide="check" class="w-4 h-4"></i>Simpan Absensi</button>
      </div>
    ` : `<p class="text-xs text-slate-400 mt-3">Mode lihat saja.</p>`}
  `;
}

/* Ringkasan kecil "X Hadir · Y Izin · ..." di atas daftar siswa, dihitung
   ulang tiap kali status diklik (lihat setAbsensiStatus()) supaya guru
   langsung lihat rekap tanpa harus simpan dulu. */
function teksTallyAbsensi(peserta, statusMap){
  const hitung = { hadir:0, izin:0, sakit:0, alpa:0 };
  peserta.forEach(s=>{ const st = (statusMap[s.id]||{status:'hadir'}).status; if(hitung[st]!==undefined) hitung[st]++; });
  return `${peserta.length} siswa · ${STATUS_ABSENSI.map(st=>`${hitung[st.v]} ${st.label}`).join(' · ')}`;
}

/* Ganti status kehadiran satu siswa lewat tombol (bukan <select> lagi,
   supaya lebih jelas & sekali tap di layar sentuh guru). Diupdate
   langsung di DOM (tanpa render ulang seluruh daftar) supaya fokus
   input catatan yang sedang diketik tidak hilang. */
function setAbsensiStatus(siswaId, status){
  const row = document.querySelector(`[data-absensi-row="${siswaId}"]`);
  if(!row) return;
  row.dataset.absensiStatus = status;
  row.querySelectorAll(`[data-status-btn="${siswaId}"]`).forEach(btn=>{
    const st = STATUS_ABSENSI.find(x=>x.v===btn.dataset.statusValue);
    const aktif = btn.dataset.statusValue === status;
    btn.classList.toggle('bg-slate-100', !aktif);
    btn.classList.toggle('text-slate-500', !aktif);
    btn.style.background = aktif ? st.color : '';
    btn.style.color = aktif ? '#fff' : '';
  });
  perbaruiTallyAbsensi();
}

function tandaiSemuaAbsensi(status){
  document.querySelectorAll('[data-absensi-row]').forEach(row=>setAbsensiStatus(row.dataset.absensiRow, status));
  showToast('Semua siswa ditandai ' + labelStatusAbsensi(status) + '.', 'info');
}

function perbaruiTallyAbsensi(){
  const el = document.getElementById('absensiTallyText');
  if(!el) return;
  const peserta = pesertaAbsensi(absensiEkstraTerpilih);
  const statusMap = {};
  document.querySelectorAll('[data-absensi-row]').forEach(row=>{ statusMap[row.dataset.absensiRow] = { status: row.dataset.absensiStatus }; });
  el.textContent = teksTallyAbsensi(peserta, statusMap);
}

function renderRekapAbsensiHtml(opsiEkstra){
  // Kelompokkan catatan absensi jadi daftar sesi unik (ekstra+tanggal),
  // diurutkan terbaru dulu, tampilkan ringkasan jumlah tiap status.
  const sesi = {};
  DB.absensi.forEach(a=>{
    const key = a.ekstraId+'|'+a.tanggal;
    if(!sesi[key]) sesi[key] = { ekstraId:a.ekstraId, tanggal:a.tanggal, hadir:0, izin:0, sakit:0, alpa:0 };
    if(sesi[key][a.status]!==undefined) sesi[key][a.status]++;
  });
  const daftar = Object.values(sesi).sort((a,b)=> b.tanggal.localeCompare(a.tanggal)).slice(0,20);
  if(daftar.length===0) return '';
  return `
    <div class="glass-strong rounded-3xl overflow-hidden">
      <div class="px-5 py-4 border-b border-slate-100">
        <h3 class="text-sm font-bold flex items-center gap-2"><i data-lucide="history" class="w-4 h-4"></i>Riwayat Absensi Terbaru</h3>
      </div>
      <div class="divide-y divide-slate-100 max-h-96 overflow-y-auto">
        ${daftar.map(s=>{
          const ek = ekstraAbsensiById(s.ekstraId);
          if(!ek) return '';
          return `
          <button onclick="absensiEkstraTerpilih='${s.ekstraId}'; absensiTanggalTerpilih='${s.tanggal}'; renderView('absensi'); window.scrollTo({top:0,behavior:'smooth'})" class="w-full text-left px-5 py-3 flex items-center gap-3 hover:bg-slate-50 transition">
            <div class="w-2 h-2 rounded-full shrink-0" style="background:${ek.warna}"></div>
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium text-slate-800 truncate">${escapeHtml(ek.nama)}</p>
              <p class="text-xs text-slate-400">${tanggalIndo(s.tanggal)}</p>
            </div>
            <div class="flex items-center gap-2 text-[11px] shrink-0">
              <span style="color:#059669">${s.hadir} hadir</span>
              ${s.izin?`<span style="color:#1769D1">${s.izin} izin</span>`:''}
              ${s.sakit?`<span style="color:#F59E0B">${s.sakit} sakit</span>`:''}
              ${s.alpa?`<span style="color:#E11D48">${s.alpa} alpa</span>`:''}
            </div>
          </button>`;
        }).join('')}
      </div>
    </div>
  `;
}

/* Simpan hasil isian absensi (radio status + catatan) untuk satu
   ekstra+tanggal. Bendahara menulis langsung ke DB.absensi lalu
   saveDB() seperti data lain; Guru Ekstra TIDAK bisa lewat saveDB()
   (bukan role bendahara), jadi pakai RPC simpan_absensi_guru sendiri,
   lalu tarik ulang data terbaru dari server. */
async function simpanAbsensi(ekstraId, tanggal){
  if(!canInputAbsensi()){ showToast('Anda tidak berwenang mengisi absensi.', 'error'); return; }
  const peserta = pesertaAbsensi(ekstraId);
  const catatan = peserta.map(s=>{
    const row = document.querySelector(`[data-absensi-row="${s.id}"]`);
    const catatanEl = document.querySelector(`input[data-catatan="${s.id}"]`);
    return { siswaId:s.id, status: row ? row.dataset.absensiStatus : 'hadir', catatan: catatanEl ? catatanEl.value.trim() : '' };
  });
  const ek = ekstraAbsensiById(ekstraId);

  if(currentRole === 'guru'){
    try{
      const res = await rpc('simpan_absensi_guru', { p_token:getToken()||'', p_ekstra_id:ekstraId, p_tanggal:tanggal, p_catatan:catatan });
      if(!res || !res.ok){ showToast('Gagal menyimpan absensi: ' + (res && res.error || 'tidak diketahui'), 'error'); return; }
      showToast('Absensi tersimpan.');
      await fetchDBFromServer();
      renderView('absensi');
    }catch(e){ console.error(e); showToast('Tidak bisa terhubung ke server.', 'error'); }
    return;
  }

  if(!requireEdit()) return;
  catatan.forEach(item=>{
    const id = `ab_${ekstraId}_${tanggal}_${item.siswaId}`;
    const idx = DB.absensi.findIndex(a=>a.id===id);
    const rec = { id, ekstraId, siswaId:item.siswaId, tanggal, status:item.status, catatan:item.catatan, dicatatOleh:currentUserName() };
    if(idx>=0) DB.absensi[idx] = rec; else DB.absensi.push(rec);
  });
  catatAktivitas('Catat Absensi', `${ek?.nama||'-'} — ${tanggalIndo(tanggal)} (${catatan.length} siswa)`);
  saveDB(DB);
  showToast('Absensi tersimpan.');
  renderView('absensi');
}

/* =========================================================
   CETAK PRESENSI ABSENSI — beda dari cetakPresensi() (untuk DB.ekskul
   yang lembarnya SENGAJA kosong untuk ditandatangani manual). Yang ini
   untuk DB.ekstraAbsensi: kolom tanggal tetap otomatis dari hariJadwal,
   tapi tiap sel diisi H/I/S/A dari DB.absensi yang SUDAH diisi guru
   lewat "Kelola Absensi" — jadi hasil cetak SELALU sinkron dengan
   isian digital, tanpa perlu isi ulang manual di kertas. Tersedia
   untuk Bendahara/Kepsek maupun Guru Ekstra sendiri (guru cuma lihat
   ekstra yang ditugaskan ke dia, lihat opsiEkstraAbsensiUntukSaya()).
   ========================================================= */
function bukaCetakPresensiAbsensi(){
  const opsiEkstra = opsiEkstraAbsensiUntukSaya();
  if(opsiEkstra.length===0){ showToast('Belum ada jenis ekstrakurikuler absensi.', 'error'); return; }
  const ekstraDefault = (absensiEkstraTerpilih && opsiEkstra.some(e=>e.id===absensiEkstraTerpilih)) ? absensiEkstraTerpilih : opsiEkstra[0].id;
  const bulanDefault = (absensiTanggalTerpilih || hariIniStr()).slice(0,7);
  openModal('Cetak Presensi Absensi', `
    <div class="space-y-4">
      <div>${fieldLabel('Ekstrakurikuler')}
        <select id="cpaEkstra" class="input-glass w-full rounded-xl px-3.5 py-2.5 text-sm">
          ${opsiEkstra.map(e=>`<option value="${e.id}" ${e.id===ekstraDefault?'selected':''}>${escapeHtml(e.nama)}</option>`).join('')}
        </select>
      </div>
      <div>${fieldLabel('Bulan')}
        <input id="cpaBulan" type="month" value="${bulanDefault}" class="input-glass w-full rounded-xl px-3.5 py-2.5 text-sm">
      </div>
      <p class="text-[11px] text-slate-400">Kolom tanggal mengikuti jadwal hari latihan ekstrakurikuler ini. Tanggal yang absensinya sudah diisi guru akan tercetak otomatis (H/I/S/A); yang belum diisi akan kosong.</p>
    </div>
  `, `
    <button onclick="closeModal()" class="btn-secondary px-4 py-2.5 rounded-xl text-sm">Batal</button>
    <button onclick="unduhPresensiAbsensiPdf()" class="glass px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-700 flex items-center gap-2"><i data-lucide="file-down" class="w-4 h-4"></i>Unduh PDF</button>
    <button onclick="cetakPresensiAbsensiJalankan()" class="btn-primary px-4 py-2.5 rounded-xl text-sm flex items-center gap-2"><i data-lucide="printer" class="w-4 h-4"></i>Cetak</button>
  `);
}

/* Kumpulkan semua data untuk Lembar Presensi Ekstrakurikuler (DB.ekstraAbsensi)
   — dipakai BERSAMA oleh cetakPresensiAbsensiJalankan() (Print) & baru:
   unduhPresensiAbsensiPdf() (PDF), supaya kedua versi selalu sinkron persis
   sama alasannya seperti buildMatriksPemasukan() untuk Laporan Keuangan. */
function buildDataPresensiAbsensi(ekstraId, bulan){
  const ek = ekstraAbsensiById(ekstraId);
  if(!ek) return { error: 'Ekstrakurikuler tidak ditemukan.' };
  if(!Array.isArray(ek.hariJadwal) || ek.hariJadwal.length===0){
    return { error: 'Jadwal hari latihan belum diatur untuk ekstrakurikuler ini.' };
  }
  const peserta = pesertaAbsensi(ekstraId).slice().sort((a,b)=>a.nama.localeCompare(b.nama,'id'));

  const isoDari = d => d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  const tanggalJadwal = tanggalPertemuanBulan(ek.hariJadwal, bulan, ek.id);
  const isoJadwalSet = new Set(tanggalJadwal.map(isoDari));
  const isoTambahan = Array.from(new Set(
    DB.absensi.filter(a=>a.ekstraId===ekstraId && (a.tanggal||'').startsWith(bulan) && !isoJadwalSet.has(a.tanggal)).map(a=>a.tanggal)
  )).sort();
  const tanggalList = tanggalJadwal
    .map(d=>({ iso: isoDari(d), dow: d.getDay(), tgl: d.getDate(), bln: d.getMonth()+1, diLuarJadwal:false }))
    .concat(isoTambahan.map(iso=>{
      const [y,m,dd] = iso.split('-').map(Number);
      const d = new Date(y, m-1, dd);
      return { iso, dow: d.getDay(), tgl: dd, bln: m, diLuarJadwal:true };
    }))
    .sort((a,b)=>a.iso.localeCompare(b.iso));

  if(tanggalList.length===0) return { error: 'Tidak ada tanggal pertemuan pada bulan yang dipilih.' };
  if(peserta.length===0) return { error: 'Belum ada siswa terdaftar di ekstrakurikuler ini.' };

  const absensiMap = {};
  DB.absensi.filter(a=>a.ekstraId===ekstraId).forEach(a=>{ absensiMap[a.tanggal+'|'+a.siswaId] = a; });
  const absensiGuruMap = {};
  DB.absensiGuru.filter(a=>a.ekstraId===ekstraId).forEach(a=>{ absensiGuruMap[a.tanggal] = a; });
  const namaGuruTercatat = Array.from(new Set(Object.values(absensiGuruMap).map(a=>a.guruNama).filter(Boolean)));
  const jumlahDiLuarJadwal = tanggalList.filter(t=>t.diLuarJadwal).length;

  return { ek, peserta, tanggalList, absensiMap, absensiGuruMap, namaGuruTercatat, jumlahDiLuarJadwal };
}

function cetakPresensiAbsensiJalankan(){
  const ekstraId = document.getElementById('cpaEkstra').value;
  const bulan = document.getElementById('cpaBulan').value;
  const pg = DB.pengaturan;
  const d = buildDataPresensiAbsensi(ekstraId, bulan);
  if(d.error){ showToast(d.error, 'error'); return; }
  const { ek, peserta, tanggalList, absensiMap, absensiGuruMap, namaGuruTercatat, jumlahDiLuarJadwal } = d;

  const statusSingkat = { hadir:'H', izin:'I', sakit:'S', alpa:'A' };
  const pctFix = 3 + 20 + 9; // No + Nama Siswa + Kelas
  const pctTanggal = tanggalList.length ? (100 - pctFix) / tanggalList.length : 0;
  const kolomTanggal = tanggalList.map(t=>`<th style="width:${pctTanggal.toFixed(2)}%;${t.diLuarJadwal?'background:#FEF3C7':''}" title="${t.diLuarJadwal?'Di luar hari jadwal latihan':''}">${HARI_PENDEK[t.dow]}<br>${String(t.tgl).padStart(2,'0')}/${String(t.bln).padStart(2,'0')}${t.diLuarJadwal?' *':''}</th>`).join('');
  const barisGuru = `
    <tr style="background:#EFF6FF">
      <td class="text-center">-</td>
      <td colspan="2" style="font-weight:700">Guru Pembina${namaGuruTercatat.length ? ' (' + escapeHtml(namaGuruTercatat.join(', ')) + ')' : ''}</td>
      ${tanggalList.map(t=>{
        const a = absensiGuruMap[t.iso];
        if(!a) return '<td>&nbsp;</td>';
        return `<td class="text-center" style="font-weight:700;color:${warnaStatusAbsensi(a.status)}" title="${labelStatusAbsensi(a.status)}${a.catatan?': '+escapeHtml(a.catatan):''}">${statusSingkat[a.status]||'-'}</td>`;
      }).join('')}
    </tr>`;
  const baris = peserta.map((s,i)=>`
    <tr>
      <td class="text-center">${i+1}</td>
      <td>${escapeHtml(s.nama)}</td>
      <td class="text-center">${escapeHtml(s.kelas)}</td>
      ${tanggalList.map(t=>{
        const a = absensiMap[t.iso+'|'+s.id];
        if(!a) return '<td>&nbsp;</td>';
        return `<td class="text-center" style="font-weight:700;color:${warnaStatusAbsensi(a.status)}" title="${labelStatusAbsensi(a.status)}${a.catatan?': '+escapeHtml(a.catatan):''}">${statusSingkat[a.status]||'-'}</td>`;
      }).join('')}
    </tr>`).join('');

  const w = window.open('', '_blank');
  w.document.write(`
    <html><head><title>Presensi ${escapeHtml(ek.nama)} - ${bulanNama(bulan)}</title>
    <style>
      @page{ size: landscape; margin: 14mm; }
      body{font-family:Arial, sans-serif; padding:24px; color:#111;}
      h1{font-size:17px; margin:0;} h2{font-size:14px; margin:14px 0 4px; text-align:justify;}
      .header{display:flex; align-items:center; gap:14px; border-bottom:2px solid #123B78; padding-bottom:12px; margin-bottom:12px;}
      .header img{width:50px; height:50px; object-fit:contain;}
      .header > div{text-align:justify;}
      .meta{font-size:11.5px; color:#333; margin-bottom:14px; text-align:justify;}
      .meta span{margin-right:18px;}
      .legenda{font-size:10.5px; color:#555; margin-bottom:10px; text-align:justify;}
      .legenda span{margin-right:14px;}
      table{width:100%; border-collapse:collapse; font-size:11px; margin-bottom:16px; table-layout:fixed;}
      th,td{border:1px solid #999; padding:6px 5px; text-align:left; word-break:break-word;}
      th{background:#f1f5f9; text-align:center; font-size:10.5px;}
      td.text-center{text-align:center;}
      td:not(.text-center):not(:nth-child(2)){text-align:center;}
      th:nth-child(1), td:nth-child(1){width:3%;}
      th:nth-child(2), td:nth-child(2){width:20%;}
      th:nth-child(3), td:nth-child(3){width:9%;}
      .foot{font-size:9px; color:#888; margin-top:20px;}
      @media print{ .no-print{display:none;} }
    </style></head>
    <body>
      <div class="header">
        ${pg.logo ? `<img src="${pg.logo}">` : ''}
        <div>
          ${kopHtml(pg)}
          <p style="margin:3px 0 0; font-size:11px;">Tahun Ajaran ${pg.tahunAjaran||'-'}</p>
        </div>
      </div>
      <h2>Lembar Presensi Ekstrakurikuler: ${escapeHtml(ek.nama)}</h2>
      <div class="meta">
        <span><strong>Bulan:</strong> ${bulanNama(bulan)}</span>
        <span><strong>Hari Latihan:</strong> ${ek.hariJadwal.join(' & ')}</span>
        <span><strong>Jumlah Pertemuan:</strong> ${tanggalList.length}x${jumlahDiLuarJadwal>0 ? ` (${jumlahDiLuarJadwal}x di luar jadwal, ditandai *)` : ''}</span>
      </div>
      <div class="legenda">
        <span><strong>H</strong> = Hadir</span><span><strong>I</strong> = Izin</span><span><strong>S</strong> = Sakit</span><span><strong>A</strong> = Alpa</span><span>(kosong = belum diisi guru)</span><span>Baris "Guru Pembina" = kehadiran guru sendiri, wajib diisi sebelum absensi siswa</span>${jumlahDiLuarJadwal>0 ? `<span><strong>*</strong> = tanggal di luar hari jadwal latihan (tetap dicetak supaya tidak ada data hilang)</span>` : ''}
      </div>
      <table>
        <thead>
          <tr><th rowspan="1">No</th><th>Nama Siswa</th><th>Kelas</th>${kolomTanggal}</tr>
        </thead>
        <tbody>
          ${barisGuru}
          ${baris}
        </tbody>
      </table>
      <p class="foot">Dicetak oleh ${currentUserName()} (${roleLabel(currentRole)}) pada ${waktuIndo(new Date().toISOString())} melalui SIKasapa — data diambil langsung dari isian "Kelola Absensi", bukan lembar manual.</p>
    </body></html>
  `);
  w.document.close();
  closeModal();
  catatAktivitas('Cetak Presensi Absensi', `${ek.nama} — ${bulanNama(bulan)} (${tanggalList.length}x pertemuan)`);
  logCetak('Cetak Presensi Absensi', `${ek.nama} — ${bulanNama(bulan)} (${tanggalList.length}x pertemuan)`);
  setTimeout(()=>{ w.print(); }, 300);
}

/* Versi PDF dari Lembar Presensi Ekstrakurikuler — pakai
   buildDataPresensiAbsensi() yang SAMA dengan versi Print di atas, supaya
   isi kolom & status H/I/S/A selalu identik antara kedua format (sama
   alasannya seperti unduhLaporanPdf() vs cetakLaporan() untuk laporan
   keuangan). */
async function unduhPresensiAbsensiPdf(){
  if(!window.jspdf){ showToast('Pustaka PDF gagal dimuat. Periksa koneksi internet lalu coba lagi.', 'error'); return; }
  const { jsPDF } = window.jspdf;
  const ekstraId = document.getElementById('cpaEkstra').value;
  const bulan = document.getElementById('cpaBulan').value;
  const pg = DB.pengaturan;
  const d = buildDataPresensiAbsensi(ekstraId, bulan);
  if(d.error){ showToast(d.error, 'error'); return; }
  const { ek, peserta, tanggalList, absensiMap, absensiGuruMap, namaGuruTercatat, jumlahDiLuarJadwal } = d;
  const statusSingkat = { hadir:'H', izin:'I', sakit:'S', alpa:'A' };
  const logoDataUrl = await resolveImageDataUrl(pg.logo);

  const doc = new jsPDF({ orientation:'landscape' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageCenterX = pageWidth/2;
  let y = 18;

  const logoFmt = imgFormatFromDataUrl(logoDataUrl);
  if(logoDataUrl && logoFmt){
    try{ doc.addImage(logoDataUrl, logoFmt, 14, 10, 18, 18); }catch(e){}
  }
  const textX = (logoDataUrl && logoFmt) ? 38 : 14;
  let ky = y;
  kopLinesSafe(pg).forEach(l=>{
    const sz = l.size || 12;
    doc.setFontSize(sz);
    doc.setFont(undefined, l.bold ? 'bold' : 'normal');
    doc.text(l.text || '', textX, ky);
    ky += Math.max(sz * 0.42, 4.6);
  });
  doc.setFontSize(9); doc.setFont(undefined,'normal');
  doc.text(`Tahun Ajaran ${pg.tahunAjaran || '-'}`, textX, ky);
  ky += 5;
  y = Math.max(ky, 34);
  doc.setDrawColor(23,105,209); doc.setLineWidth(0.6);
  doc.line(14, y, pageWidth-14, y);
  y += 9;

  doc.setFontSize(12); doc.setFont(undefined,'bold');
  doc.text(`Lembar Presensi Ekstrakurikuler: ${ek.nama}`, pageCenterX, y, {align:'center'});
  y += 6;
  doc.setFontSize(9); doc.setFont(undefined,'normal'); doc.setTextColor(60);
  const metaLine = `Bulan: ${bulanNama(bulan)}   |   Hari Latihan: ${ek.hariJadwal.join(' & ')}   |   Jumlah Pertemuan: ${tanggalList.length}x${jumlahDiLuarJadwal>0 ? ` (${jumlahDiLuarJadwal}x di luar jadwal, ditandai *)` : ''}`;
  doc.text(metaLine, pageCenterX, y, {align:'center'});
  doc.setTextColor(0);
  y += 7;
  doc.setFontSize(7.5);
  doc.text('H = Hadir   I = Izin   S = Sakit   A = Alpa   (kosong = belum diisi guru)   Baris "Guru Pembina" = kehadiran guru sendiri', pageCenterX, y, {align:'center'});
  y += 8;

  const head = [['No','Nama Siswa','Kelas', ...tanggalList.map(t=>`${HARI_PENDEK[t.dow]} ${String(t.tgl).padStart(2,'0')}/${String(t.bln).padStart(2,'0')}${t.diLuarJadwal?'*':''}`)]];
  const rowGuru = ['-', `Guru Pembina${namaGuruTercatat.length ? ' (' + namaGuruTercatat.join(', ') + ')' : ''}`, '', ...tanggalList.map(t=>{
    const a = absensiGuruMap[t.iso];
    return a ? (statusSingkat[a.status]||'-') : '';
  })];
  const rowsSiswa = peserta.map((s,i)=>[i+1, s.nama, s.kelas, ...tanggalList.map(t=>{
    const a = absensiMap[t.iso+'|'+s.id];
    return a ? (statusSingkat[a.status]||'-') : '';
  })]);
  const columnStyles = { 1:{halign:'left'} };
  for(let i=2;i<=tanggalList.length+2;i++) columnStyles[i] = { halign:'center' };
  doc.autoTable({
    startY: y, margin:{left:14, right:14},
    head, body: [rowGuru, ...rowsSiswa],
    styles:{fontSize:7.5, cellPadding:2},
    headStyles:{fillColor:[23,105,209]},
    columnStyles, horizontalPageBreak:true,
    didParseCell: data=>{
      if(data.row.index===0 && data.section==='body') data.cell.styles.fillColor = [239,246,255];
    }
  });

  doc.setFontSize(7); doc.setTextColor(140);
  const footY = doc.internal.pageSize.getHeight() - 8;
  doc.text(`Dicetak oleh ${currentUserName()} (${roleLabel(currentRole)}) pada ${waktuIndo(new Date().toISOString())} melalui SIKasapa — data diambil langsung dari isian "Kelola Absensi".`, 14, footY);
  doc.setTextColor(0);

  doc.save(`Presensi-${ek.nama.replace(/\s+/g,'-')}-${bulan}.pdf`);
  closeModal();
  catatAktivitas('Unduh Presensi Absensi PDF', `${ek.nama} — ${bulanNama(bulan)} (${tanggalList.length}x pertemuan)`);
  logCetak('Unduh Presensi Absensi PDF', `${ek.nama} — ${bulanNama(bulan)} (${tanggalList.length}x pertemuan)`);
  showToast('Presensi PDF berhasil diunduh.');
}

/* =========================================================
   JENIS EKSTRAKURIKULER ABSENSI — CRUD (Bendahara saja)
   ========================================================= */
function openEkstraAbsensiForm(id){
  if(!requireEdit()) return;
  const e = id ? ekstraAbsensiById(id) : null;
  const hariAll = ['Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
  // Kalau ekstra ini tertaut ke suatu ekskul (Data Ekstrakurikuler), jadwal
  // hari WAJIB dikunci mengikuti ekskul itu — kalau dibiarkan bisa diedit
  // bebas di sini, jadwal di dua sisi (Data Ekstrakurikuler vs Kelola
  // Absensi) bisa jadi tidak identik lagi, dan kedua lembar Cetak Presensi
  // bisa menghasilkan jumlah pertemuan yang berbeda untuk ekstra "yang sama"
  // (lihat submitEkskul() untuk arah sinkronisasi sebaliknya).
  const ekTertaut = id ? ekskulTertautKe(id) : null;
  openModal(e ? 'Ubah Jenis Ekstrakurikuler' : 'Tambah Jenis Ekstrakurikuler', `
    <form id="formEkstraAbsensi" class="space-y-4">
      <div>${fieldLabel('Nama Ekstrakurikuler')}
        <input id="eaNama" type="text" required value="${escapeHtml(e?.nama||'')}" class="input-glass w-full rounded-xl px-3.5 py-2.5 text-sm" placeholder="Contoh: Pramuka">
      </div>
      <div>${fieldLabel('Keterangan (opsional)')}
        <input id="eaKeterangan" type="text" value="${escapeHtml(e?.keterangan||'')}" class="input-glass w-full rounded-xl px-3.5 py-2.5 text-sm" placeholder="Contoh: Setiap Jumat sore">
      </div>
      <div>${fieldLabel('Jadwal Hari Latihan')}
        ${ekTertaut ? `
          <div class="glass rounded-xl p-3 mb-2 flex items-start gap-2.5">
            <i data-lucide="link-2" class="w-4 h-4 shrink-0 mt-0.5" style="color:var(--blue-600,#1769D1)"></i>
            <p class="text-xs text-slate-600">Ekstra ini tertaut ke ekstrakurikuler <strong>${escapeHtml(ekTertaut.nama)}</strong> — jadwal hari mengikuti ekstrakurikuler itu. Ubah lewat menu <strong>Data Ekstrakurikuler</strong>, bukan di sini.</p>
          </div>
        ` : ''}
        <div class="flex flex-wrap gap-2">
          ${hariAll.map(h=>`<label class="flex items-center gap-1.5 glass px-3 py-1.5 rounded-lg text-xs ${ekTertaut?'opacity-70':'cursor-pointer'}">
            <input type="checkbox" value="${h}" ${(e?.hariJadwal||[]).includes(h)?'checked':''} ${ekTertaut?'disabled':''} class="ea-hari accent-blue-600"> ${h}
          </label>`).join('')}
        </div>
        <p class="text-[11px] text-slate-400 mt-1.5">Dipakai supaya guru bisa mencetak Presensi bulanan yang tanggalnya otomatis, sinkron dengan absensi yang sudah diisi.</p>
      </div>
      <div>${fieldLabel('Warna Label')}
        <input id="eaWarna" type="color" value="${e?.warna||'#1769D1'}" class="w-14 h-10 rounded-lg bg-transparent cursor-pointer">
      </div>
    </form>
  `, `
    <button onclick="closeModal()" class="btn-secondary px-4 py-2.5 rounded-xl text-sm">Batal</button>
    <button onclick="submitEkstraAbsensi(${id ? `'${id}'` : 'null'})" class="btn-primary px-4 py-2.5 rounded-xl text-sm flex items-center gap-2"><i data-lucide="check" class="w-4 h-4"></i>Simpan</button>
  `);
}

function submitEkstraAbsensi(id){
  if(!requireEdit()) return;
  const nama = document.getElementById('eaNama').value.trim();
  const keterangan = document.getElementById('eaKeterangan').value.trim();
  const warna = document.getElementById('eaWarna').value;
  const ekTertaut = id ? ekskulTertautKe(id) : null;
  // Jaring pengaman — checkbox jadwal sudah di-disable di UI saat tertaut
  // (lihat openEkstraAbsensiForm()), tapi tetap dipaksa ulang di sini
  // supaya submit manual/lewat console tidak bisa membuat jadwal dua sisi
  // jadi berbeda diam-diam.
  const hariJadwal = ekTertaut ? ekTertaut.hariJadwal.slice() : Array.from(document.querySelectorAll('.ea-hari:checked')).map(c=>c.value);
  if(!nama){ markInvalid('eaNama','Wajib diisi'); showToast('Nama wajib diisi.', 'error'); return; }
  const duplikat = DB.ekstraAbsensi.find(e=>e.nama.toLowerCase()===nama.toLowerCase() && e.id!==id);
  if(duplikat){ markInvalid('eaNama','Nama ini sudah dipakai'); showToast('Nama ini sudah dipakai.', 'error'); return; }
  if(id){
    Object.assign(ekstraAbsensiById(id), { nama, keterangan, warna, hariJadwal });
    catatAktivitas('Ubah Jenis Ekstrakurikuler Absensi', nama);
  } else {
    const baru = { id:uid('ea'), nama, keterangan, warna, hariJadwal };
    DB.ekstraAbsensi.push(baru);
    absensiEkstraTerpilih = baru.id;
    catatAktivitas('Tambah Jenis Ekstrakurikuler Absensi', nama);
  }
  saveDB(DB);
  closeModal();
  showToast('Jenis ekstrakurikuler tersimpan.');
  renderView('absensi');
}

function deleteEkstraAbsensi(id){
  if(!requireEdit()) return;
  const nama = ekstraAbsensiById(id)?.nama || '-';
  const jumlahPeserta = pesertaAbsensi(id).length;
  const jumlahAbsensi = DB.absensi.filter(a=>a.ekstraId===id).length;
  const ekTertaut = ekskulTertautKe(id);
  showConfirm({
    title:'Hapus Jenis Ekstrakurikuler',
    message: `"${escapeHtml(nama)}" akan dihapus beserta ${jumlahPeserta} keanggotaan siswa dan ${jumlahAbsensi} catatan absensi terkait. Guru yang ditugaskan ke ekstra ini juga akan kehilangan penugasannya.${ekTertaut ? ` Ekstra ini tertaut ke ekstrakurikuler "${escapeHtml(ekTertaut.nama)}" (Data Ekstrakurikuler) — tautannya akan ikut dilepas, tapi ekstrakurikuler & iurannya sendiri TIDAK ikut terhapus.` : ''} Tindakan ini tidak bisa dibatalkan.`,
    confirmText:'Ya, Hapus', danger:true,
    onConfirm:()=>{
      DB.ekstraAbsensi = DB.ekstraAbsensi.filter(e=>e.id!==id);
      DB.siswa.forEach(s=>{ s.ekstraAbsensiIds = (s.ekstraAbsensiIds||[]).filter(eid=>eid!==id); });
      // Lepas tautan dari sisi ekskul juga, kalau ada yang menautkan ke ekstra ini.
      DB.ekskul.forEach(ek=>{ if(ek.ekstraAbsensiId===id) ek.ekstraAbsensiId = null; });
      DB.absensi.filter(a=>a.ekstraId===id).forEach(a=>tandaiHapus('absensi', a.id));
      DB.absensi = DB.absensi.filter(a=>a.ekstraId!==id);
      DB.guru.forEach(g=>{ g.ekstraIds = (g.ekstraIds||[]).filter(eid=>eid!==id); });
      tandaiHapus('ekstraAbsensi', id);
      catatAktivitas('Hapus Jenis Ekstrakurikuler Absensi', nama);
      if(absensiEkstraTerpilih===id) absensiEkstraTerpilih = null;
      saveDB(DB);
      showToast('Jenis ekstrakurikuler dihapus.', 'info');
      renderView('absensi');
    }
  });
}

/* Kelola peserta (siswa) satu jenis ekstra absensi — checklist siswa
   aktif, sama pola dengan openSiswaEkskulManage() untuk ekskul
   berbayar, tapi menyunting s.ekstraAbsensiIds. */
function openPesertaAbsensiManage(ekstraId){
  if(!requireEdit()) return;
  const ek = ekstraAbsensiById(ekstraId);
  if(!ek) return;
  const ekTertaut = ekskulTertautKe(ekstraId);
  const siswaAktif = DB.siswa.filter(s=>s.aktif!==false).sort((a,b)=>a.nama.localeCompare(b.nama));
  // Kalau ekstra ini tertaut ke suatu ekskul (Data Ekstrakurikuler),
  // peserta WAJIB dikelola dari sana saja — supaya tidak ada lagi 2
  // daftar peserta yang bisa nyasar diam-diam tanpa ketahuan (lihat
  // syncPesertaAbsensiDariEkskul()). Di sini hanya ditampilkan read-only.
  openModal(`Peserta — ${escapeHtml(ek.nama)}`, `
    ${ekTertaut ? `
      <div class="glass rounded-xl p-3 mb-3 flex items-start gap-2.5">
        <i data-lucide="link-2" class="w-4 h-4 shrink-0 mt-0.5" style="color:var(--blue-600,#1769D1)"></i>
        <p class="text-xs text-slate-600">Ekstra ini tertaut ke ekstrakurikuler <strong>${escapeHtml(ekTertaut.nama)}</strong> — daftar peserta di bawah otomatis mengikuti peserta ekstrakurikuler itu. Kelola peserta lewat menu <strong>Data Ekstrakurikuler → Data Siswa</strong>, bukan di sini.</p>
      </div>
    ` : ''}
    <div class="max-h-96 overflow-y-auto space-y-1.5">
      ${siswaAktif.map(s=>`
        <label class="flex items-center gap-2.5 px-2 py-2 rounded-lg ${ekTertaut?'opacity-70':'hover:bg-slate-50 cursor-pointer'}">
          <input type="checkbox" class="peserta-absensi-chk accent-blue-600" value="${s.id}" ${(s.ekstraAbsensiIds||[]).includes(ekstraId)?'checked':''} ${ekTertaut?'disabled':''}>
          <span class="text-sm">${escapeHtml(s.nama)} <span class="text-slate-400 text-xs">(${escapeHtml(s.kelas)})</span></span>
        </label>
      `).join('') || `<p class="text-sm text-slate-500 text-center py-4">Belum ada data siswa.</p>`}
    </div>
  `, `
    <button onclick="closeModal()" class="btn-secondary px-4 py-2.5 rounded-xl text-sm">${ekTertaut?'Tutup':'Batal'}</button>
    ${ekTertaut ? '' : `<button onclick="submitPesertaAbsensi('${ekstraId}')" class="btn-primary px-4 py-2.5 rounded-xl text-sm flex items-center gap-2"><i data-lucide="check" class="w-4 h-4"></i>Simpan</button>`}
  `);
}

function submitPesertaAbsensi(ekstraId){
  if(!requireEdit()) return;
  if(ekskulTertautKe(ekstraId)){
    // Jaring pengaman — tombol Simpan seharusnya tidak dirender sama
    // sekali untuk ekstra yang tertaut (lihat openPesertaAbsensiManage()).
    showToast('Peserta ekstra ini mengikuti ekstrakurikuler yang tertaut, kelola dari menu Data Siswa.', 'error');
    return;
  }
  const terpilih = new Set(Array.from(document.querySelectorAll('.peserta-absensi-chk:checked')).map(c=>c.value));
  DB.siswa.forEach(s=>{
    const ikut = terpilih.has(s.id);
    const sudahIkut = (s.ekstraAbsensiIds||[]).includes(ekstraId);
    if(ikut && !sudahIkut) s.ekstraAbsensiIds = [...(s.ekstraAbsensiIds||[]), ekstraId];
    else if(!ikut && sudahIkut) s.ekstraAbsensiIds = s.ekstraAbsensiIds.filter(id=>id!==ekstraId);
  });
  catatAktivitas('Ubah Peserta Absensi', `${ekstraAbsensiById(ekstraId)?.nama||'-'} — ${terpilih.size} peserta`);
  saveDB(DB);
  closeModal();
  showToast('Daftar peserta tersimpan.');
  renderView('absensi');
}

/* =========================================================
   DATA EKSTRAKURIKULER
   ========================================================= */
function renderEkskul(){
  const main = document.getElementById('mainContent');
  const totalPesertaUnik = new Set(DB.siswa.filter(s=>(s.ekskulIds||[]).length>0).map(s=>s.id)).size;
  const totalSaldoSemua = DB.ekskul.reduce((s,e)=>s+saldoEkskul(e.id),0);
  main.innerHTML = `
    ${DB.ekskul.length ? statBar([
      { label:'Total Ekstrakurikuler', value: DB.ekskul.length },
      { label:'Total Peserta Terdaftar', value: totalPesertaUnik },
      { label:'Total Saldo Kas', value: rupiah(totalSaldoSemua), accent: totalSaldoSemua>=0 ? '#059669' : 'var(--rose-500)' },
    ]) : ''}
    <div class="flex justify-end mb-5">
      ${canEdit() ? `<button onclick="openEkskulForm()" class="btn-primary px-4 py-2.5 rounded-xl text-sm flex items-center gap-2"><i data-lucide="plus" class="w-4 h-4"></i>Tambah Ekstrakurikuler</button>` : ''}
    </div>
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 stagger">
      ${DB.ekskul.map(ek => {
        const jumlahSiswa = DB.siswa.filter(s=>s.ekskulIds.includes(ek.id)).length;
        return `
        <div class="glass-strong rounded-3xl p-5 card-hover border-t-4" style="border-top-color:${ek.warna}">
          <div class="flex items-start justify-between mb-3">
            <div>
              <h3 class="font-bold text-base">${escapeHtml(ek.nama)}</h3>
              <p class="text-xs text-slate-500">Pembina: ${escapeHtml(ek.pembina)}</p>
            </div>
            ${canEdit() ? `<div class="flex items-center gap-1">
              <button onclick='openEkskulForm(${JSON.stringify(ek.id)})' title="Edit ekstrakurikuler" aria-label="Edit ${escapeHtml(ek.nama)}" class="text-slate-500 hover:text-blue-600 p-1"><i data-lucide="pencil" class="w-4 h-4"></i></button>
              <button onclick="deleteEkskul('${ek.id}')" title="Hapus ekstrakurikuler" aria-label="Hapus ${escapeHtml(ek.nama)}" class="text-slate-500 hover:text-rose-500 p-1"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
            </div>` : ''}
          </div>
          <div class="flex items-center gap-2 mb-3 flex-wrap">
            <span class="badge px-2.5 py-1 rounded-full" style="background:${ek.warna}22; color:${ek.warna}">${ek.jenisPembayaran==='bulanan'?'Bulanan':'Per Pertemuan'}</span>
            <span class="badge px-2.5 py-1 rounded-full glass text-slate-600">${ek.hariJadwal.join(' & ')}</span>
            ${ek.ekstraAbsensiId ? `<span class="badge px-2.5 py-1 rounded-full flex items-center gap-1" style="background:rgba(23,105,209,.12); color:var(--blue-600,#1769D1)" title="Peserta &amp; kehadiran tertaut ke Kelola Absensi"><i data-lucide="link-2" class="w-3 h-3"></i>Tertaut Absensi</span>` : ''}
          </div>
          <div class="flex items-center justify-between text-sm border-t border-slate-200/80 pt-3">
            <div>
              <p class="text-slate-500 text-xs">Tarif</p>
              <p class="font-bold">${rupiah(ek.tarif)}</p>
            </div>
            <div class="text-right">
              <p class="text-slate-500 text-xs">Siswa</p>
              <p class="font-bold">${jumlahSiswa} anak</p>
            </div>
            <div class="text-right">
              <p class="text-slate-500 text-xs">Saldo</p>
              <p class="font-bold ${saldoEkskul(ek.id)>=0?'text-emerald-600':''}" style="${saldoEkskul(ek.id)<0?'color:var(--rose-500)':''}">${rupiah(saldoEkskul(ek.id))}</p>
            </div>
          </div>
        </div>`;
      }).join('') || `<div class="col-span-full">${emptyState({
        icon:'shapes',
        title:'Belum ada ekstrakurikuler',
        desc:'Tambahkan jenis ekstrakurikuler beserta tarif dan jadwalnya untuk mulai mengelola keuangan dan peserta.',
        ctaHtml: canEdit() ? `<button onclick="openEkskulForm()" class="btn-primary px-4 py-2.5 rounded-xl text-sm flex items-center gap-2"><i data-lucide="plus" class="w-4 h-4"></i>Tambah Ekstrakurikuler</button>` : ''
      })}</div>`}
    </div>
  `;
  safeIcons();
}

function openEkskulForm(id){
  if(!requireEdit()) return;
  const ek = id ? ekskulById(id) : null;
  const hariAll = ['Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
  openDrawer({
    icon: ek ? 'pencil' : 'shapes',
    accent: ek?.warna || 'var(--blue-600)',
    title: ek ? 'Ubah Ekstrakurikuler' : 'Tambah Ekstrakurikuler',
    subtitle: ek ? 'Perbarui detail ekstrakurikuler' : 'Buat jenis ekstrakurikuler baru',
    bodyHtml: `
    <form id="formEkskul" class="space-y-4">
      <div>${fieldLabel('Nama Ekstrakurikuler')}
        <input id="ekNama" type="text" required value="${escapeHtml(ek?.nama||'')}" class="input-glass w-full rounded-xl px-3.5 py-2.5 text-sm" placeholder="Contoh: Futsal">
      </div>
      <div>${fieldLabel('Nama Pembina')}
        <input id="ekPembina" type="text" required value="${escapeHtml(ek?.pembina||'')}" class="input-glass w-full rounded-xl px-3.5 py-2.5 text-sm" placeholder="Nama pembina">
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div>${fieldLabel('Jenis Pembayaran')}
          <select id="ekJenis" required class="input-glass w-full rounded-xl px-3.5 py-2.5 text-sm">
            <option value="bulanan" ${ek?.jenisPembayaran==='bulanan'?'selected':''}>Bulanan</option>
            <option value="pertemuan" ${ek?.jenisPembayaran==='pertemuan'?'selected':''}>Per Pertemuan</option>
          </select>
        </div>
        <div>${fieldLabel('Tarif (Rp)')}
          <input id="ekTarif" type="number" required value="${ek?.tarif||''}" class="input-glass w-full rounded-xl px-3.5 py-2.5 text-sm" placeholder="0">
        </div>
      </div>
      <div>${fieldLabel('Jadwal Hari Latihan')}
        <div class="flex flex-wrap gap-2">
          ${hariAll.map(h=>`<label class="flex items-center gap-1.5 glass px-3 py-1.5 rounded-lg text-xs cursor-pointer">
            <input type="checkbox" value="${h}" ${ek?.hariJadwal.includes(h)?'checked':''} class="ek-hari accent-blue-600"> ${h}
          </label>`).join('')}
        </div>
      </div>
      <div>${fieldLabel('Warna Label')}
        <div class="flex items-center gap-3">
          <input id="ekWarna" type="color" value="${ek?.warna||'#1769D1'}" class="w-14 h-10 rounded-lg bg-transparent cursor-pointer">
          <p class="text-[11px] text-slate-400">Dipakai sebagai warna label & aksen kartu ekstrakurikuler ini.</p>
        </div>
      </div>
      <div class="border-t border-slate-200/80 pt-4">${fieldLabel('Tautkan ke Kelola Absensi (opsional)')}
        <select id="ekTautAbsensi" class="input-glass w-full rounded-xl px-3.5 py-2.5 text-sm">
          <option value="">— Tidak ditautkan (seperti biasa) —</option>
          <option value="__buat_baru__">+ Buat jenis absensi baru dengan nama & jadwal yang sama</option>
          ${DB.ekstraAbsensi.filter(e=>!ekskulTertautKe(e.id) || e.id===ek?.ekstraAbsensiId).map(e=>`
            <option value="${e.id}" ${ek?.ekstraAbsensiId===e.id?'selected':''}>${escapeHtml(e.nama)}</option>
          `).join('')}
        </select>
        <p class="text-[11px] text-slate-400 mt-1.5">Kalau ditautkan: (1) peserta ekstrakurikuler ini otomatis jadi peserta absensinya juga — tidak perlu dicentang 2x di menu Kelola Absensi, dan (2) untuk skema Per Pertemuan, estimasi Tunggakan memakai kehadiran asli (izin/sakit/alpa tidak ikut ditagih), bukan cuma tebakan dari jadwal. <strong>Peserta yang sudah ada di Kelola Absensi untuk jenis ini akan ditimpa</strong> mengikuti peserta ekstrakurikuler ini.</p>
      </div>
    </form>
  `, footerHtml: `
    <button onclick="closeDrawer()" class="btn-secondary px-4 py-2.5 rounded-xl text-sm">Batal</button>
    <button onclick="submitEkskul(${id ? `'${id}'` : 'null'})" class="btn-primary px-4 py-2.5 rounded-xl text-sm flex items-center gap-2"><i data-lucide="check" class="w-4 h-4"></i>Simpan</button>
  `});
}

function submitEkskul(id){
  if(!requireEdit()) return;
  const nama = document.getElementById('ekNama').value.trim();
  const pembina = document.getElementById('ekPembina').value.trim();
  const jenisPembayaran = document.getElementById('ekJenis').value;
  const tarif = parseFloat(document.getElementById('ekTarif').value);
  const warna = document.getElementById('ekWarna').value;
  const hariJadwal = Array.from(document.querySelectorAll('.ek-hari:checked')).map(c=>c.value);
  const tautAbsensiPilihan = document.getElementById('ekTautAbsensi').value;
  if(!nama){ markInvalid('ekNama','Wajib diisi'); showToast('Lengkapi semua data yang wajib diisi.', 'error'); return; }
  if(!pembina){ markInvalid('ekPembina','Wajib diisi'); showToast('Lengkapi semua data yang wajib diisi.', 'error'); return; }
  if(hariJadwal.length===0){ showToast('Pilih minimal 1 hari jadwal.', 'error'); return; }
  if(isNaN(tarif) || tarif <= 0){
    markInvalid('ekTarif','Tarif harus lebih dari 0');
    showToast('Tarif harus lebih dari 0.', 'error'); return;
  }
  const duplikatNama = DB.ekskul.find(e => e.nama.toLowerCase()===nama.toLowerCase() && e.id!==id);
  if(duplikatNama){
    markInvalid('ekNama','Nama ini sudah dipakai');
    showToast('Nama ekstrakurikuler ini sudah ada.', 'error'); return;
  }
  // Tautan ke Kelola Absensi: "" = lepas tautan, "__buat_baru__" = buat
  // jenis ekstra_absensi baru (nama & jadwal ikut ekskul ini) lalu
  // tautkan, selain itu = id ekstra_absensi yang sudah ada.
  let ekstraAbsensiId = null;
  if(tautAbsensiPilihan === '__buat_baru__'){
    const baru = { id:uid('ea'), nama, keterangan:'', warna, hariJadwal: hariJadwal.slice() };
    DB.ekstraAbsensi.push(baru);
    ekstraAbsensiId = baru.id;
  } else if(tautAbsensiPilihan){
    ekstraAbsensiId = tautAbsensiPilihan;
    // Jadwal absensi disamakan dengan jadwal ekskul ini supaya tanggal
    // pertemuan yang dipakai Tunggakan & Cetak Presensi tidak lagi bisa
    // berbeda antara sisi keuangan dan sisi absensi.
    const eaTertaut = ekstraAbsensiById(ekstraAbsensiId);
    if(eaTertaut) eaTertaut.hariJadwal = hariJadwal.slice();
  }
  if(id){
    const ek = ekskulById(id);
    Object.assign(ek, { nama, pembina, jenisPembayaran, tarif, warna, hariJadwal, ekstraAbsensiId });
    catatAktivitas('Ubah Ekstrakurikuler', nama);
  } else {
    /* PERBAIKAN: bulanAktif/hariLibur WAJIB diinisialisasi di sini (bukan
       dibiarkan undefined lalu menunggu normalizeDB() saat reload berikutnya)
       — kalau tidak, memilih ekstrakurikuler yang BARU dibuat di menu
       "Aktivasi Bulan & Libur" pada sesi yang sama (sebelum reload) akan
       menyebabkan error (ek.bulanAktif[...] dipanggil pada undefined). */
    DB.ekskul.push({ id:uid('ek'), nama, pembina, jenisPembayaran, tarif, warna, hariJadwal, ekstraAbsensiId, bulanAktif:{}, hariLibur:[] });
    catatAktivitas('Tambah Ekstrakurikuler', nama);
  }
  syncSemuaPesertaAbsensiDariEkskul();
  saveDB(DB);
  closeDrawer();
  showToast('Data ekstrakurikuler tersimpan.');
  renderView('ekskul');
}

function deleteEkskul(id){
  if(!requireEdit()) return;
  const namaEk = ekskulById(id)?.nama || '-';
  const jumlahSiswa = DB.siswa.filter(s=>(s.ekskulIds||[]).includes(id)).length;
  const pemasukanTerkait = DB.pemasukan.filter(p=>p.ekskulId===id);
  const pengeluaranTerkait = DB.pengeluaran.filter(p=>p.ekskulId===id);
  const dipakai = jumlahSiswa>0 || pemasukanTerkait.length>0 || pengeluaranTerkait.length>0;
  const saldoTerkait = pemasukanTerkait.reduce((s,p)=>s+p.nominal,0) - pengeluaranTerkait.reduce((s,p)=>s+p.nominal,0);

  const doDelete = ()=>{
    DB.ekskul = DB.ekskul.filter(e=>e.id!==id);
    // Lepas tautan ekstrakurikuler ini dari data siswa.
    DB.siswa.forEach(s=>{ s.ekskulIds = (s.ekskulIds||[]).filter(eid=>eid!==id); });
    // Kalau ekskul ini tadinya tertaut ke suatu ekstra_absensi, lepaskan
    // "kuncian" peserta otomatisnya — daftar peserta ekstra itu berhenti
    // mengikuti ekskul (yang sudah tidak ada) dan bisa dikelola manual lagi.
    syncSemuaPesertaAbsensiDariEkskul();
    // Ikut hapus seluruh riwayat pemasukan & pengeluaran ekstrakurikuler ini,
    // supaya tidak ada transaksi "yatim" yang tetap mempengaruhi Total Saldo
    // keseluruhan tapi sudah tidak bisa dilihat/dilaporkan di mana pun.
    DB.pemasukan = DB.pemasukan.filter(p=>p.ekskulId!==id);
    DB.pengeluaran = DB.pengeluaran.filter(p=>p.ekskulId!==id);
    tandaiHapus('ekskul', id);
    // Menghapus ekskul-nya saja sudah cukup — server ikut menghapus riwayat
    // pemasukan/pengeluaran terkait lewat FK ON DELETE CASCADE (lihat
    // schema.sql). Tetap didaftarkan eksplisit di sini juga
    // (idempotent, tidak berbahaya) sebagai jaring pengaman kalau suatu
    // saat constraint cascade itu berubah.
    pemasukanTerkait.forEach(p=>tandaiHapus('pemasukan', p.id));
    pengeluaranTerkait.forEach(p=>tandaiHapus('pengeluaran', p.id));
    catatAktivitas('Hapus Ekstrakurikuler', `${namaEk} (ikut menghapus ${pemasukanTerkait.length} data pemasukan & ${pengeluaranTerkait.length} data pengeluaran terkait)`);
    saveDB(DB);
    showToast('Ekstrakurikuler beserta seluruh transaksinya dihapus.', 'info');
    renderView('ekskul');
  };
  showConfirm({
    title: 'Hapus Ekstrakurikuler',
    message: dipakai
      ? `Ekstrakurikuler "${escapeHtml(namaEk)}" masih memiliki ${jumlahSiswa} siswa terdaftar, ${pemasukanTerkait.length} data pemasukan, dan ${pengeluaranTerkait.length} data pengeluaran (saldo terkait ${rupiah(saldoTerkait)}).\n\nJika dilanjutkan, tautan siswa ke ekskul ini akan dilepas, DAN SELURUH riwayat pemasukan/pengeluaran ekskul ini akan ikut terhapus permanen (tidak lagi masuk hitungan Total Saldo). Tindakan ini tidak bisa dibatalkan.\n\nTetap hapus?`
      : 'Ekstrakurikuler ini akan dihapus secara permanen. Tindakan ini tidak bisa dibatalkan.',
    confirmText: 'Ya, Hapus Semua',
    danger: true,
    onConfirm: doDelete
  });
}

/* =========================================================
   DATA SISWA (per kartu ekstrakurikuler + bulk paste peserta)
   ========================================================= */
let siswaSearchQuery = '';

function renderSiswa(){
  const main = document.getElementById('mainContent');
  const q = siswaSearchQuery.trim().toLowerCase();
  const matchesQuery = s => !q || s.nama.toLowerCase().includes(q) || s.kelas.toLowerCase().includes(q);

  const jumlahAktif = DB.siswa.filter(s=>s.aktif!==false).length;
  // Siswa yang ekskul_ids-nya kosong -> terdaftar tapi tidak numpang di
  // kartu ekskul manapun di bawah, sumber selisih antara "Total Siswa
  // Terdaftar" dengan hasil jumlah semua kartu "X peserta" dijumlahkan
  // (yang MEMANG tidak harus sama — 1 siswa bisa 0 atau 2+ ekskul).
  const belumIkutEkskul = DB.siswa.filter(s=>!s.ekskulIds.length);

  main.innerHTML = `
    ${DB.siswa.length ? statBar([
      { label:'Total Siswa Terdaftar', value: DB.siswa.length },
      { label:'Siswa Aktif', value: jumlahAktif, accent:'#059669' },
      { label:'Ekstrakurikuler', value: DB.ekskul.length },
      { label:'Belum Ikut Ekskul', value: belumIkutEkskul.length, accent: belumIkutEkskul.length ? '#E11D48' : undefined, onclick: belumIkutEkskul.length ? 'openSemuaSiswaModal(true)' : '' },
    ]) : ''}
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
      <div class="relative flex-1 max-w-sm">
        <i data-lucide="search" class="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2"></i>
        <input id="siswaSearchInput" type="text" value="${escapeHtml(siswaSearchQuery)}" placeholder="Cari nama atau kelas siswa..." class="input-glass w-full rounded-xl pl-10 pr-3.5 py-2.5 text-sm">
      </div>
      <div class="flex items-center gap-2 shrink-0">
        <button onclick="exportSiswaCSV()" class="glass px-3.5 py-2.5 rounded-xl text-xs font-semibold text-slate-600 flex items-center gap-2"><i data-lucide="file-down" class="w-4 h-4"></i>Ekspor CSV</button>
        <button onclick="openSemuaSiswaModal()" class="${canEdit()?'btn-primary':'glass text-slate-600'} px-3.5 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2"><i data-lucide="list" class="w-4 h-4"></i>${canEdit()?'Kelola':'Lihat'} Semua Siswa</button>
      </div>
    </div>
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 stagger">
      ${DB.ekskul.map(ek => {
        const semuaAnggota = DB.siswa.filter(s=>s.ekskulIds.includes(ek.id));
        const anggota = semuaAnggota.filter(matchesQuery);
        if(q && anggota.length === 0) return '';
        return `
        <div class="glass-strong rounded-3xl p-5 card-hover border-t-4" style="border-top-color:${ek.warna}">
          <div class="flex items-start justify-between mb-3">
            <div>
              <h3 class="font-bold text-base">${escapeHtml(ek.nama)}</h3>
              <p class="text-xs text-slate-500">Pembina: ${escapeHtml(ek.pembina)}</p>
            </div>
            <span class="badge px-2.5 py-1 rounded-full" style="background:${ek.warna}22; color:${ek.warna}">${q ? anggota.length+' / '+semuaAnggota.length : semuaAnggota.length} peserta</span>
          </div>
          <div class="max-h-32 overflow-y-auto space-y-1 mb-4 pr-1">
            ${anggota.slice(0,5).map(s=>`<div class="text-xs text-slate-600 flex items-center justify-between"><span class="truncate">${escapeHtml(s.nama)}</span><span class="text-slate-400 shrink-0 ml-2">${s.kelas}</span></div>`).join('') || '<p class="text-xs text-slate-400">Belum ada peserta</p>'}
            ${anggota.length > 5 ? `<p class="text-[11px] text-slate-400">+${anggota.length-5} lainnya</p>` : ''}
          </div>
          <button onclick="openSiswaEkskulManage('${ek.id}')" class="${canEdit()?'btn-primary':'glass text-slate-700 font-semibold'} w-full py-2.5 rounded-xl text-sm flex items-center justify-center gap-2"><i data-lucide="${canEdit()?'users':'eye'}" class="w-4 h-4"></i>${canEdit()?'Kelola Peserta':'Lihat Peserta'}</button>
        </div>`;
      }).join('') || `<div class="col-span-full">${q ? emptyState({
        icon:'search-x',
        title:'Tidak ada siswa yang cocok',
        desc:'Coba kata kunci lain, atau reset pencarian.'
      }) : emptyState({
        icon:'shapes',
        title:'Belum ada ekstrakurikuler',
        desc:'Buat data ekstrakurikuler dahulu di menu Data Ekstrakurikuler, lalu peserta bisa ditambahkan di sini.',
        ctaHtml: canEdit() ? `<button onclick="navigate('ekskul')" class="btn-primary px-4 py-2.5 rounded-xl text-sm flex items-center gap-2"><i data-lucide="arrow-right" class="w-4 h-4"></i>Buka Data Ekstrakurikuler</button>` : ''
      })}</div>`}
    </div>
  `;

  const input = document.getElementById('siswaSearchInput');
  input.addEventListener('input', (e)=>{
    siswaSearchQuery = e.target.value;
    const pos = e.target.selectionStart;
    renderView('siswa');
    const newInput = document.getElementById('siswaSearchInput');
    newInput.focus();
    newInput.setSelectionRange(pos, pos);
  });
}

let semuaSiswaQuery = '';
let semuaSiswaHanyaTanpaEkskul = false;

function daftarSiswaTersaring(){
  const q = semuaSiswaQuery.trim().toLowerCase();
  return DB.siswa
    .filter(s => !q || s.nama.toLowerCase().includes(q) || s.kelas.toLowerCase().includes(q))
    .filter(s => !semuaSiswaHanyaTanpaEkskul || !s.ekskulIds.length)
    .sort((a,b)=>a.nama.localeCompare(b.nama));
}

function openSemuaSiswaModal(hanyaTanpaEkskul){
  const edit = canEdit();
  semuaSiswaHanyaTanpaEkskul = !!hanyaTanpaEkskul;
  const renderBody = ()=>{
    const list = daftarSiswaTersaring();
    const toolbar = document.getElementById('semuaSiswaToolbar');
    if(toolbar){
      const adaFilter = semuaSiswaQuery.trim() || semuaSiswaHanyaTanpaEkskul;
      toolbar.innerHTML = list.length ? `
        <div class="flex items-center justify-between gap-2 mb-2 px-0.5">
          <p class="text-[11px] text-slate-500">${list.length} siswa ${adaFilter ? 'cocok dengan penyaringan' : 'total'}</p>
          ${edit ? `<button onclick="hapusSemuaSiswaTersaring()" class="text-[11px] font-semibold text-rose-500 hover:text-rose-600 flex items-center gap-1"><i data-lucide="trash-2" class="w-3 h-3"></i>Hapus Semua (${list.length})</button>` : ''}
        </div>` : '';
    }
    const body = document.getElementById('semuaSiswaBody');
    if(!body) return;
    body.innerHTML = list.map(s=>{
      const ekNama = s.ekskulIds.map(id=>ekskulById(id)?.nama).filter(Boolean);
      const kontak = (s.waliNama || s.waliHp) ? `<p class="text-[11px] text-slate-400 mt-1">Wali: ${escapeHtml(s.waliNama||'-')}${s.waliHp?' · '+escapeHtml(s.waliHp):''}</p>` : '';
      return `
        <div class="flex items-start justify-between gap-3 px-2.5 py-2.5 rounded-xl table-row ${s.aktif===false?'opacity-60':''}">
          <div class="min-w-0 flex-1">
            <p class="text-sm font-medium truncate">${escapeHtml(s.nama)} <span class="text-slate-400 font-normal">· ${s.kelas}</span>${s.aktif===false?' <span class="badge px-2 py-0.5 rounded-full text-[10px] glass text-slate-500">Nonaktif</span>':''}</p>
            <div class="flex flex-wrap gap-1 mt-1.5">
              ${ekNama.length ? ekNama.map(n=>`<span class="badge px-2 py-0.5 rounded-full glass text-slate-600 text-[10px]">${n}</span>`).join('') : `<span class="badge px-2 py-0.5 rounded-full text-[10px]" style="background:rgba(225,29,72,.12); color:var(--rose-500)">Tidak ikut ekskul</span>`}
            </div>
            ${kontak}
          </div>
          ${edit ? `<div class="flex items-center gap-0.5 shrink-0">
            <button onclick="openSiswaForm('${s.id}')" title="Edit siswa" aria-label="Edit ${escapeHtml(s.nama)}" class="text-slate-500 hover:text-blue-600 p-1.5 rounded-lg hover:bg-blue-50"><i data-lucide="pencil" class="w-4 h-4"></i></button>
            <button onclick="deleteSiswa('${s.id}')" title="Hapus siswa" aria-label="Hapus ${escapeHtml(s.nama)}" class="text-slate-500 hover:text-rose-500 p-1.5 rounded-lg hover:bg-rose-50"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
          </div>` : ''}
        </div>`;
    }).join('') || `<p class="text-xs text-slate-400 text-center py-6">${semuaSiswaHanyaTanpaEkskul ? 'Semua siswa sudah ikut ekskul.' : 'Tidak ada siswa yang cocok.'}</p>`;
    safeIcons();
  };

  openModal('Semua Data Siswa', `
    <div class="relative mb-3">
      <i data-lucide="search" class="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2"></i>
      <input id="semuaSiswaSearch" type="text" value="${escapeHtml(semuaSiswaQuery)}" placeholder="Cari nama atau kelas..." class="input-glass w-full rounded-xl pl-10 pr-3.5 py-2.5 text-sm">
    </div>
    <label class="flex items-center gap-2 mb-3 text-xs text-slate-600 cursor-pointer">
      <input id="semuaSiswaTanpaEkskulToggle" type="checkbox" ${semuaSiswaHanyaTanpaEkskul?'checked':''} class="accent-blue-600">
      <span>Tampilkan hanya yang belum ikut ekskul manapun</span>
    </label>
    <div id="semuaSiswaToolbar"></div>
    <div id="semuaSiswaBody" class="max-h-80 overflow-y-auto divide-y divide-slate-100"></div>
  `, `
    <button onclick="closeModal()" class="btn-secondary px-4 py-2.5 rounded-xl text-sm">Tutup</button>
    ${edit ? `<button onclick="openIsiTanggalGabungMassal()" class="glass px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-600 flex items-center gap-2"><i data-lucide="calendar-check" class="w-4 h-4"></i>Isi Tanggal Gabung Massal</button>` : ''}
    ${edit ? `<button onclick="openSiswaForm()" class="btn-primary px-4 py-2.5 rounded-xl text-sm flex items-center gap-2"><i data-lucide="plus" class="w-4 h-4"></i>Tambah Siswa</button>` : ''}
  `);
  renderBody();
  document.getElementById('semuaSiswaTanpaEkskulToggle').addEventListener('change', (e)=>{
    semuaSiswaHanyaTanpaEkskul = e.target.checked;
    renderBody();
  });
  document.getElementById('semuaSiswaSearch').addEventListener('input', (e)=>{
    semuaSiswaQuery = e.target.value;
    renderBody();
  });
}

/* Hapus banyak siswa sekaligus — SENGAJA cuma menghapus siswa yang lagi
   TERSARING/tampil di modal saat ini (sesuai kotak pencarian & centang
   "belum ikut ekskul"), BUKAN selalu semua siswa di database. Supaya
   tombol "Hapus Semua" aman dipakai untuk membersihkan sebagian data
   (mis. cuma yang belum ikut ekskul) tanpa risiko menghapus semua 71
   siswa secara tidak sengaja kalau lupa filter masih aktif. */
function hapusSemuaSiswaTersaring(){
  if(!requireEdit()) return;
  const list = daftarSiswaTersaring();
  if(!list.length){ showToast('Tidak ada siswa yang bisa dihapus.', 'info'); return; }
  const idSet = new Set(list.map(s=>s.id));
  const riwayatTerkait = DB.pemasukan.filter(p=>idSet.has(p.siswaId));
  const totalDibayar = riwayatTerkait.reduce((sum,p)=>sum+p.nominal,0);
  const adaFilter = semuaSiswaQuery.trim() || semuaSiswaHanyaTanpaEkskul;

  const doDelete = ()=>{
    DB.siswa = DB.siswa.filter(s=>!idSet.has(s.id));
    idSet.forEach(id=>tandaiHapus('siswa', id));
    catatAktivitas('Hapus Semua Siswa (Massal)', `${list.length} siswa${adaFilter ? ' (hasil penyaringan)' : ''}${riwayatTerkait.length ? ` — ${riwayatTerkait.length} riwayat pembayaran (${rupiah(totalDibayar)}) jadi tanpa nama siswa` : ''}`);
    saveDB(DB);
    showToast(`${list.length} siswa dihapus.`, 'info');
    semuaSiswaHanyaTanpaEkskul = false;
    openSemuaSiswaModal();
    renderView('siswa');
  };

  showConfirm({
    title: `Hapus ${list.length} Siswa Sekaligus`,
    message: `${adaFilter ? `Ini akan menghapus ${list.length} siswa yang cocok dengan penyaringan saat ini (bukan seluruh 71 siswa)` : `Ini akan menghapus SEMUA ${list.length} siswa`}, beserta keikutsertaan ekstrakurikulernya, secara PERMANEN.${riwayatTerkait.length ? `\n\n${riwayatTerkait.length} riwayat pembayaran (total ${rupiah(totalDibayar)}) milik siswa-siswa ini TIDAK ikut terhapus (uangnya tetap terhitung di saldo & laporan), tapi nama siswanya tidak akan bisa ditampilkan lagi di riwayat itu.` : ''}\n\nTindakan ini tidak bisa dibatalkan. Lanjutkan?`,
    confirmText: `Ya, Hapus ${list.length} Siswa`,
    danger: true,
    onConfirm: doDelete
  });
}

/* Isi cepat kolom Tanggal Gabung untuk banyak siswa sekaligus — dibuat
   khusus untuk data siswa LAMA (sudah ada sebelum kolom ini ditambah)
   yang kalau diisi satu-satu lewat form edit akan makan waktu lama.
   Default: cuma isi siswa yang kolomnya masih KOSONG (tidak menimpa
   yang sudah pernah diisi manual/otomatis) — centang "Timpa juga yang
   sudah terisi" kalau memang mau menyamakan semua siswa jadi satu
   tanggal (misal semua dianggap gabung sejak awal tahun ajaran ini). */
function openIsiTanggalGabungMassal(){
  const kosong = DB.siswa.filter(s=>!s.tanggalGabung).length;
  openModal('Isi Tanggal Gabung Massal', `
    <p class="text-sm text-slate-600 mb-4">Terapkan satu tanggal yang sama ke banyak siswa sekaligus — cocok untuk siswa lama yang belum pernah diisi Tanggal Gabung-nya satu per satu. Total siswa saat ini: <strong>${DB.siswa.length}</strong>, yang kolomnya masih kosong: <strong>${kosong}</strong>.</p>
    <div class="space-y-4">
      <div>${fieldLabel('Tanggal Gabung')}
        <input id="itgTanggal" type="date" value="${hariIniStr()}" class="input-glass w-full rounded-xl px-3.5 py-2.5 text-sm">
      </div>
      <label class="flex items-center gap-2 glass px-3.5 py-2.5 rounded-xl text-sm cursor-pointer">
        <input id="itgTimpaSemua" type="checkbox" class="accent-blue-600">
        <span>Timpa juga yang sudah terisi (semua ${DB.siswa.length} siswa akan disamakan jadi tanggal ini)</span>
      </label>
      <p class="text-[11px] text-amber-500"><i data-lucide="alert-triangle" class="w-3 h-3 inline -mt-0.5"></i> Tanpa dicentang, hanya ${kosong} siswa yang kolomnya masih kosong yang akan diisi.</p>
    </div>
  `, `
    <button onclick="closeModal()" class="btn-secondary px-4 py-2.5 rounded-xl text-sm">Batal</button>
    <button onclick="submitIsiTanggalGabungMassal()" class="btn-primary px-4 py-2.5 rounded-xl text-sm flex items-center gap-2"><i data-lucide="check" class="w-4 h-4"></i>Terapkan</button>
  `);
}
function submitIsiTanggalGabungMassal(){
  if(!requireEdit()) return;
  const tanggal = document.getElementById('itgTanggal').value.trim();
  const timpaSemua = document.getElementById('itgTimpaSemua').checked;
  if(!tanggal){ showToast('Tanggal wajib diisi.', 'error'); return; }
  const target = timpaSemua ? DB.siswa : DB.siswa.filter(s=>!s.tanggalGabung);
  if(!target.length){ showToast('Tidak ada siswa yang perlu diisi.', 'info'); return; }
  target.forEach(s=> s.tanggalGabung = tanggal);
  catatAktivitas('Isi Tanggal Gabung Massal', `${target.length} siswa → ${tanggal}${timpaSemua ? ' (menimpa yang sudah terisi)' : ''}`);
  saveDB(DB);
  closeModal();
  showToast(`Tanggal Gabung diisi untuk ${target.length} siswa.`);
  openSemuaSiswaModal();
}

function exportSiswaCSV(){
  const rows = [['Nama','Kelas','Ekstrakurikuler Diikuti','Nama Wali','No. HP Wali','Tanggal Gabung']];
  DB.siswa.slice().sort((a,b)=>a.nama.localeCompare(b.nama)).forEach(s=>{
    const ekNama = s.ekskulIds.map(id=>ekskulById(id)?.nama).filter(Boolean).join(' & ') || '-';
    rows.push([s.nama, s.kelas, ekNama, s.waliNama||'', s.waliHp||'', s.tanggalGabung||'']);
  });
  downloadCSV(`sikasapa-data-siswa-${tanggalFileNow()}.csv`, rows);
  catatAktivitas('Ekspor CSV', `Data Siswa — ${rows.length-1} baris`);
}

function openSiswaEkskulManage(ekId){
  const ek = ekskulById(ekId);
  const anggota = DB.siswa.filter(s=>s.ekskulIds.includes(ekId)).sort((a,b)=>a.nama.localeCompare(b.nama));
  const edit = canEdit();
  openModal(`Peserta ${escapeHtml(ek.nama)}`, `
    <div class="mb-5">
      <p class="text-xs font-medium text-slate-600 mb-2">Peserta Saat Ini (${anggota.length})</p>
      <div class="max-h-44 overflow-y-auto space-y-1 glass rounded-xl p-2">
        ${anggota.map(s=>`
          <div class="flex items-center justify-between px-2.5 py-1.5 rounded-lg table-row ${s.aktif===false?'opacity-60':''}">
            <span class="text-sm">${escapeHtml(s.nama)} <span class="text-slate-400 text-xs">· ${s.kelas}</span>${s.aktif===false?' <span class="badge px-1.5 py-0.5 rounded-full text-[9px] glass text-slate-500">Nonaktif</span>':''}</span>
            ${edit ? `<div class="flex items-center gap-0.5 shrink-0">
              <button onclick="openSiswaForm('${s.id}')" title="Edit data siswa" aria-label="Edit ${escapeHtml(s.nama)}" class="text-slate-500 hover:text-blue-600 p-1"><i data-lucide="pencil" class="w-3.5 h-3.5"></i></button>
              <button onclick="removeSiswaFromEkskul('${s.id}','${ekId}')" title="Keluarkan dari ekskul" aria-label="Keluarkan ${escapeHtml(s.nama)} dari ekskul" class="text-slate-500 hover:text-rose-500 p-1"><i data-lucide="x" class="w-3.5 h-3.5"></i></button>
            </div>` : ''}
          </div>
        `).join('') || '<p class="text-xs text-slate-400 text-center py-3">Belum ada peserta</p>'}
      </div>
    </div>
    ${edit ? `
    <div class="border-t border-slate-200/80 pt-4">
      <p class="text-xs font-medium text-slate-600 mb-1.5">Tambah Peserta (Copy-Paste Massal)</p>
      <p class="text-[11px] text-slate-400 mb-2">Satu siswa per baris, format: <code class="text-blue-600">Nama, Kelas</code>. Contoh:<br>Ahmad Rizki, V A<br>Bunga Citra, IV B</p>
      <textarea id="bulkSiswaText" rows="6" class="input-glass w-full rounded-xl px-3.5 py-2.5 text-sm font-mono" placeholder="Ahmad Rizki, V A&#10;Bunga Citra, IV B"></textarea>
      <p id="bulkSiswaPreview" class="text-[11px] text-slate-400 mt-1.5"></p>
    </div>` : ''}
  `, `
    <button onclick="closeModal()" class="btn-secondary px-4 py-2.5 rounded-xl text-sm">Tutup</button>
    ${edit ? `<button onclick="prosesBulkSiswa('${ekId}')" class="btn-primary px-4 py-2.5 rounded-xl text-sm flex items-center gap-2"><i data-lucide="upload" class="w-4 h-4"></i>Proses & Tambahkan</button>` : ''}
  `);
  if(edit){
    document.getElementById('bulkSiswaText').addEventListener('input', (e)=>{
      const n = parseBulkSiswaLines(e.target.value).length;
      document.getElementById('bulkSiswaPreview').textContent = n > 0 ? `${n} baris siswa terdeteksi.` : '';
    });
  }
}

function parseBulkSiswaLines(text){
  return text.split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .map(line => {
      const parts = line.split(',').map(p=>p.trim());
      return { nama: parts[0] || '', kelas: parts[1] || '-' };
    })
    .filter(row => row.nama.length > 0);
}

function prosesBulkSiswa(ekId){
  if(!requireEdit()) return;
  const text = document.getElementById('bulkSiswaText').value;
  const rows = parseBulkSiswaLines(text);
  if(rows.length === 0){ showToast('Belum ada baris siswa yang valid untuk diproses.', 'error'); return; }

  let ditambah = 0, diperbarui = 0;
  rows.forEach(row => {
    const existing = DB.siswa.find(s => s.nama.toLowerCase() === row.nama.toLowerCase() && s.kelas.toLowerCase() === row.kelas.toLowerCase());
    if(existing){
      if(!existing.ekskulIds.includes(ekId)){ existing.ekskulIds.push(ekId); diperbarui++; }
    } else {
      DB.siswa.push({ id:uid('sw'), nama:row.nama, kelas:row.kelas, ekskulIds:[ekId], aktif:true, ekstraAbsensiIds:[] });
      ditambah++;
    }
  });
  // Ekstra_absensi tertaut (kalau ada) ikut disinkronkan peserta barunya.
  syncSemuaPesertaAbsensiDariEkskul();
  catatAktivitas('Tambah Peserta Massal', `${ditambah} baru, ${diperbarui} diikutkan ke ${ekskulById(ekId)?.nama||'-'}`);
  saveDB(DB);
  showToast(`${ditambah} siswa baru ditambahkan, ${diperbarui} siswa lama diikutkan ke ekskul ini.`);
  closeModal();
  renderView('siswa');
}

function removeSiswaFromEkskul(siswaId, ekId){
  if(!requireEdit()) return;
  const s = siswaById(siswaId);
  if(!s) return;
  s.ekskulIds = s.ekskulIds.filter(id => id !== ekId);
  syncPesertaAbsensiDariEkskul(s);
  catatAktivitas('Keluarkan Peserta', `${s.nama} dari ${ekskulById(ekId)?.nama||'-'}`);
  saveDB(DB);
  showToast('Peserta dikeluarkan dari ekstrakurikuler.', 'info');
  openSiswaEkskulManage(ekId);
  renderNav();
}

function openSiswaForm(id){
  if(!requireEdit()) return;
  closeModal(); // tutup modal "Kelola Peserta" (jika terbuka) supaya tidak menumpuk di belakang drawer
  const s = id ? siswaById(id) : null;
  openDrawer({
    icon: s ? 'pencil' : 'user-plus',
    accent: 'var(--blue-600)',
    title: s ? 'Ubah Data Siswa' : 'Tambah Siswa',
    subtitle: s ? 'Perbarui data & keikutsertaan ekstrakurikuler' : 'Daftarkan siswa baru',
    bodyHtml: `
    <form id="formSiswa" class="space-y-4">
      <div>${fieldLabel('Nama Siswa')}
        <input id="swNama" type="text" required value="${escapeHtml(s?.nama||'')}" class="input-glass w-full rounded-xl px-3.5 py-2.5 text-sm" placeholder="Nama lengkap">
      </div>
      <div>${fieldLabel('Kelas')}
        <input id="swKelas" type="text" required value="${escapeHtml(s?.kelas||'')}" class="input-glass w-full rounded-xl px-3.5 py-2.5 text-sm" placeholder="Contoh: V A">
      </div>
      <div>${fieldLabel('Nama Wali (opsional)')}
        <input id="swWaliNama" type="text" value="${escapeHtml(s?.waliNama||'')}" class="input-glass w-full rounded-xl px-3.5 py-2.5 text-sm" placeholder="Nama orang tua/wali">
      </div>
      <div>${fieldLabel('No. HP Wali (opsional)')}
        <input id="swWaliHp" type="text" value="${escapeHtml(s?.waliHp||'')}" class="input-glass w-full rounded-xl px-3.5 py-2.5 text-sm" placeholder="Contoh: 0812xxxxxxxx">
      </div>
      <div>${fieldLabel('Tanggal Gabung')}
        <input id="swTanggalGabung" type="date" value="${escapeHtml(s ? (s.tanggalGabung||'') : hariIniStr())}" class="input-glass w-full rounded-xl px-3.5 py-2.5 text-sm">
        <p class="text-[11px] text-slate-400 mt-1.5">Sejak kapan siswa ini mulai wajib bayar iuran (dipakai perhitungan Tunggakan &amp; Pengingat Pembayaran). ${s ? 'Kosongkan kalau tidak tahu pastinya — sistem hanya akan menagih bulan berjalan sampai diisi.' : 'Otomatis terisi hari ini; ubah kalau siswa ini sebenarnya sudah lebih dulu ikut ekskul (misal input data siswa lama).'}</p>
      </div>
      <div>${fieldLabel('Ekstrakurikuler yang Diikuti')}
        <div class="flex flex-wrap gap-2">
          ${DB.ekskul.map(ek=>`<label class="flex items-center gap-1.5 glass px-3 py-1.5 rounded-lg text-xs cursor-pointer">
            <input type="checkbox" value="${ek.id}" ${s?.ekskulIds.includes(ek.id)?'checked':''} class="sw-ekskul accent-blue-600"> ${escapeHtml(ek.nama)}
          </label>`).join('') || '<span class="text-xs text-slate-500">Belum ada data ekstrakurikuler</span>'}
        </div>
      </div>
      <div>
        <label class="flex items-center gap-2 glass px-3.5 py-2.5 rounded-xl text-sm cursor-pointer">
          <input id="swAktif" type="checkbox" ${(s ? s.aktif!==false : true) ? 'checked' : ''} class="accent-blue-600">
          <span>Siswa masih aktif</span>
        </label>
        <p class="text-[11px] text-slate-400 mt-1.5">Nonaktifkan (jangan dihapus) untuk siswa yang sudah keluar/pindah, supaya riwayat pembayarannya tetap tersimpan tapi tidak lagi muncul di rekap Tunggakan, Presensi, atau pencarian publik wali murid.</p>
      </div>
    </form>
  `, footerHtml: `
    <button onclick="closeDrawer()" class="btn-secondary px-4 py-2.5 rounded-xl text-sm">Batal</button>
    <button onclick="submitSiswa(${id ? `'${id}'` : 'null'})" class="btn-primary px-4 py-2.5 rounded-xl text-sm flex items-center gap-2"><i data-lucide="check" class="w-4 h-4"></i>Simpan</button>
  `});
}

function submitSiswa(id){
  if(!requireEdit()) return;
  const nama = document.getElementById('swNama').value.trim();
  const kelas = document.getElementById('swKelas').value.trim();
  const waliNama = document.getElementById('swWaliNama').value.trim();
  const waliHp = document.getElementById('swWaliHp').value.trim();
  const tanggalGabung = document.getElementById('swTanggalGabung').value.trim() || null;
  const ekskulIds = Array.from(document.querySelectorAll('.sw-ekskul:checked')).map(c=>c.value);
  const aktif = document.getElementById('swAktif').checked;
  if(!nama){ markInvalid('swNama','Wajib diisi'); showToast('Nama dan kelas wajib diisi.', 'error'); return; }
  if(!kelas){ markInvalid('swKelas','Wajib diisi'); showToast('Nama dan kelas wajib diisi.', 'error'); return; }
  const duplikat = DB.siswa.find(s => s.nama.toLowerCase()===nama.toLowerCase() && s.kelas.toLowerCase()===kelas.toLowerCase() && s.id!==id);
  if(duplikat){ markInvalid('swNama','Nama & kelas ini sudah terdaftar'); showToast('Siswa dengan nama dan kelas yang sama sudah terdaftar.', 'error'); return; }
  let siswaTersimpan;
  if(id){
    const sebelumnya = siswaById(id);
    const statusBerubah = sebelumnya && (sebelumnya.aktif!==false) !== aktif;
    Object.assign(sebelumnya, { nama, kelas, waliNama, waliHp, tanggalGabung, ekskulIds, aktif });
    siswaTersimpan = sebelumnya;
    catatAktivitas('Ubah Data Siswa', `${nama} (${kelas})${statusBerubah ? ` — status jadi ${aktif?'Aktif':'Nonaktif'}` : ''}`);
  } else {
    siswaTersimpan = { id:uid('sw'), nama, kelas, waliNama, waliHp, tanggalGabung, ekskulIds, aktif, ekstraAbsensiIds:[] };
    DB.siswa.push(siswaTersimpan);
    catatAktivitas('Tambah Siswa', `${nama} (${kelas})`);
  }
  // Kalau salah satu ekskul yang dicentang tertaut ke ekstra_absensi
  // (menu Kelola Absensi), keikutsertaan absensinya ikut disinkronkan
  // di sini — supaya tidak perlu dicentang ulang di tempat terpisah.
  syncPesertaAbsensiDariEkskul(siswaTersimpan);
  saveDB(DB);
  closeDrawer();
  showToast('Data siswa tersimpan.');
  renderView('siswa');
}

function deleteSiswa(id){
  if(!requireEdit()) return;
  const s = siswaById(id);
  const riwayatBayar = DB.pemasukan.filter(p=>p.siswaId===id);
  const totalDibayar = riwayatBayar.reduce((sum,p)=>sum+p.nominal,0);
  const punyaRiwayat = riwayatBayar.length > 0;

  const doDelete = ()=>{
    DB.siswa = DB.siswa.filter(s=>s.id!==id);
    tandaiHapus('siswa', id);
    if(s) catatAktivitas('Hapus Siswa', `${s.nama} (${s.kelas})${punyaRiwayat ? ` — ${riwayatBayar.length} riwayat pembayaran (${rupiah(totalDibayar)}) jadi tanpa nama siswa` : ''}`);
    saveDB(DB);
    showToast('Data siswa dihapus.', 'info');
    renderView('siswa');
    // deleteSiswa() SATU-SATUNYA dipanggil dari dalam modal "Kelola Semua
    // Siswa" (tombol tempat sampah per baris) — renderView('siswa') di
    // atas cuma me-refresh halaman DI BELAKANG modal (kartu ekskul,
    // statistik), modalnya sendiri TIDAK otomatis ikut ter-render ulang.
    // Refresh modalnya juga di sini (kalau memang lagi terbuka) supaya
    // baris siswa yang baru dihapus langsung hilang dari daftar, tanpa
    // perlu tutup-buka modal manual — sama seperti pola yang sudah
    // dipakai removeSiswaFromEkskul() & hapusSemuaSiswaTersaring().
    if(document.getElementById('semuaSiswaBody')) openSemuaSiswaModal(semuaSiswaHanyaTanpaEkskul);
  };

  showConfirm({
    title: 'Hapus Data Siswa',
    message: punyaRiwayat
      ? `Siswa "${escapeHtml(s?.nama||'-')}" sudah punya ${riwayatBayar.length} riwayat pembayaran (total ${rupiah(totalDibayar)}). Riwayat pembayaran itu TIDAK akan ikut terhapus (uangnya tetap terhitung di saldo & laporan), tapi setelah siswa dihapus, nama siswa pada riwayat itu tidak akan bisa ditampilkan lagi (muncul sebagai "-").\n\nTetap hapus data siswa ini?`
      : 'Data siswa ini beserta riwayat keikutsertaan ekstrakurikulernya akan dihapus secara permanen. Tindakan ini tidak bisa dibatalkan.',
    confirmText: 'Ya, Hapus',
    danger: true,
    onConfirm: doDelete
  });
}

/* =========================================================
   LAPORAN
   ========================================================= */
let laporanBulanAwal = '';
let laporanBulanAkhir = '';

function renderLaporan(){
  const main = document.getElementById('mainContent');

  main.innerHTML = `
    <div class="glass-strong rounded-3xl p-5 mb-5">
      <h3 class="font-bold text-sm mb-1">Rentang Bulan Laporan</h3>
      <p class="text-xs text-slate-500 mb-4">Berlaku untuk tombol Print & Unduh PDF di bawah (termasuk Laporan Gabungan). Pilih satu bulan saja, atau rentang beberapa bulan. Kosongkan keduanya untuk mencetak seluruh riwayat transaksi.</p>
      <div class="flex flex-col sm:flex-row gap-3 items-end">
        <div class="flex-1 w-full">
          ${fieldLabel('Dari Bulan')}
          <input id="laporanBulanAwalInput" type="month" value="${laporanBulanAwal}" class="input-glass w-full rounded-xl px-3.5 py-2.5 text-sm">
        </div>
        <div class="flex-1 w-full">
          ${fieldLabel('Sampai Bulan')}
          <input id="laporanBulanAkhirInput" type="month" value="${laporanBulanAkhir}" class="input-glass w-full rounded-xl px-3.5 py-2.5 text-sm">
        </div>
        ${(laporanBulanAwal||laporanBulanAkhir) ? `<button onclick="laporanBulanAwal='';laporanBulanAkhir='';renderView('laporan')" class="glass shrink-0 px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-600 flex items-center justify-center gap-2 w-full sm:w-auto"><i data-lucide="x" class="w-4 h-4"></i>Reset</button>` : ''}
      </div>
    </div>

    <div class="glass-strong rounded-3xl p-5 mb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div>
        <h3 class="font-bold text-sm mb-1 flex items-center gap-2"><i data-lucide="layers" class="w-4 h-4 text-slate-500"></i>Laporan Gabungan Seluruh Ekstrakurikuler</h3>
        <p class="text-xs text-slate-500">Rekap total pemasukan, pengeluaran & saldo semua ekskul dalam satu laporan — cocok untuk permintaan rekap kas dari Kepala Sekolah. Ikut mengikuti rentang tanggal di atas.</p>
      </div>
      <div class="flex gap-2 shrink-0">
        <button onclick="cetakLaporanGabungan()" class="glass px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-700 flex items-center justify-center gap-2"><i data-lucide="printer" class="w-4 h-4"></i>Print Gabungan</button>
        <button onclick="unduhLaporanGabunganPdf()" class="btn-primary px-4 py-2.5 rounded-xl text-sm flex items-center justify-center gap-2"><i data-lucide="file-down" class="w-4 h-4"></i>Unduh PDF Gabungan</button>
      </div>
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 stagger">
      ${DB.ekskul.map(ek => {
        const masuk = DB.pemasukan.filter(p=>p.ekskulId===ek.id).reduce((s,p)=>s+p.nominal,0);
        const keluar = DB.pengeluaran.filter(p=>p.ekskulId===ek.id).reduce((s,p)=>s+p.nominal,0);
        return `
        <div class="glass-strong rounded-3xl p-5 card-hover border-t-4" style="border-top-color:${ek.warna}">
          <h3 class="font-bold text-base mb-1">${escapeHtml(ek.nama)}</h3>
          <p class="text-xs text-slate-500 mb-4">Pembina: ${escapeHtml(ek.pembina)}</p>
          <div class="space-y-2 text-sm mb-4">
            <div class="flex justify-between"><span class="text-slate-500">Pemasukan</span><span class="font-semibold text-emerald-600">${rupiah(masuk)}</span></div>
            <div class="flex justify-between"><span class="text-slate-500">Pengeluaran</span><span class="font-semibold" style="color:var(--rose-500)">${rupiah(keluar)}</span></div>
            <div class="flex justify-between border-t border-slate-200/80 pt-2"><span class="text-slate-600 font-medium">Saldo Akhir</span><span class="font-bold">${rupiah(masuk-keluar)}</span></div>
          </div>
          <div class="flex gap-2">
            <button onclick="cetakLaporan('${ek.id}')" class="glass flex-1 py-2.5 rounded-xl text-sm font-semibold text-slate-700 flex items-center justify-center gap-2"><i data-lucide="printer" class="w-4 h-4"></i>Print</button>
            <button onclick="unduhLaporanPdf('${ek.id}')" class="btn-primary flex-1 py-2.5 rounded-xl text-sm flex items-center justify-center gap-2"><i data-lucide="file-down" class="w-4 h-4"></i>Unduh PDF</button>
          </div>
        </div>`;
      }).join('') || '<p class="text-sm text-slate-500 col-span-full text-center py-10">Belum ada ekstrakurikuler</p>'}
    </div>
  `;

  document.getElementById('laporanBulanAwalInput').addEventListener('change', (e)=>{ laporanBulanAwal = e.target.value; });
  document.getElementById('laporanBulanAkhirInput').addEventListener('change', (e)=>{ laporanBulanAkhir = e.target.value; });
}

function romawiBulan(m){
  const r = ['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII'];
  return r[m-1] || '-';
}

function kodeEkskulLaporan(ek){
  return (ek?.nama||'EK').toUpperCase().replace(/[^A-Z]/g,'').slice(0,4) || 'EK';
}

/* Menghasilkan nomor laporan BARU yang urut & permanen — setiap kali
   dipanggil, nomor urut di server (kolom pengaturan.nomor_laporan_counter,
   per tahun) bertambah 1 secara ATOMIK lewat RPC ambil_nomor_dokumen,
   lalu diformat di sini. SEBELUMNYA nomor laporan
   hardcode "001" untuk setiap laporan, kapan pun dicetak — lalu counter-nya
   sempat disimpan di memori browser (bermasalah: nomor ganda kalau yang
   mencetak Kepsek, atau race condition dua tab bendahara) — sekarang
   nomornya benar-benar urut & konsisten dari server, per tahun berjalan,
   lalu reset ke 001 di tahun berikutnya (lazim untuk dokumen arsip resmi
   sekolah). Melempar error kalau server gagal — pemanggil WAJIB membatalkan
   proses cetak, jangan sampai dokumen tercetak dengan nomor yang tidak
   benar-benar tercatat di server.
   PENTING: panggil fungsi ini HANYA SEKALI per aksi cetak/unduh, simpan
   hasilnya ke variabel lokal, lalu pakai variabel itu berulang kali —
   supaya nomor yang ditampilkan di dokumen sama dengan nomor yang dicatat
   di log aktivitas (tidak memanggil fungsi ini dua kali untuk 1 dokumen). */
async function nomorLaporanBaru(kode){
  const res = await ambilNomorServer('laporan');
  const now = hariIniDate();
  return `${String(res.urut).padStart(3,'0')}/SIKASAPA-${kode}/${romawiBulan(now.getMonth()+1)}/${res.tahun}`;
}

/* Nomor kwitansi pembayaran per transaksi — urut per tahun, sekuens
   terpisah dari nomor laporan, juga diambil atomik dari server (lihat
   catatan di nomorLaporanBaru di atas). Dipakai oleh cetakKwitansi(). */
async function nomorKwitansiBaru(){
  const res = await ambilNomorServer('kwitansi');
  return `KWT-${res.tahun}-${String(res.urut).padStart(4,'0')}`;
}

/* =========================================================
   MATRIKS RINCIAN PEMASUKAN (Print, PDF) — baris = siswa, kolom =
   tiap pertemuan (jenis 'pertemuan') atau tiap bulan (jenis 'bulanan')
   dalam rentang laporan, sel = nominal + tanggal bayar, Total di kanan.
   Dipakai bersama oleh cetakLaporan() & unduhLaporanPdf() supaya
   logikanya selalu sinkron antara versi Print dan versi PDF.
   ========================================================= */
function buildMatriksPemasukan(ek, masukList, anggota){
  const rentang = rentangBulanEfektif(masukList, 'tanggalBayar');
  if(!rentang) return null; // tidak ada data & tidak ada filter -> tidak ada kolom
  const bulanList = daftarBulanRentang(rentang.awal, rentang.akhir);
  if(bulanList.length===0) return null;

  let kolomPerBulan; // [{ ym, kolom:[{key,label1,label2}] }]
  if(ek.jenisPembayaran === 'bulanan'){
    // Bulan yang ditandai nonaktif (fitur Aktivasi Bulan & Libur) normalnya
    // dibuang dari matriks. TAPI kalau ternyata sudah ada pembayaran
    // tercatat untuk bulan itu (misalnya dibayar sebelum bulan tsb
    // ditandai nonaktif), kolomnya tetap harus tampil — uang yang sudah
    // masuk ke Total Pemasukan di header tidak boleh "menghilang" dari
    // rincian di bawahnya.
    kolomPerBulan = bulanList
      .filter(ym => !bulanNonaktifUntukPeriode(ek, ym) || masukList.some(p=>p.periode===ym))
      .map(ym => {
        // Kolom ini tampil hanya karena ada pembayaran tercatat meski
        // bulannya sekarang ditandai nonaktif -> beri label kecil supaya
        // pembina tidak bingung lihat kolom di luar bulan aktif.
        const nonaktif = bulanNonaktifUntukPeriode(ek, ym);
        const alasan = nonaktif ? (ek.bulanAktif[ym].alasan || 'Nonaktif') : '';
        return { ym, kolom: [{ key: ym, label1: bulanNama(ym), label2: nonaktif ? `(${alasan})` : '' }] };
      });
  } else {
    kolomPerBulan = bulanList.map(ym => {
      const tgl = tanggalPertemuanBulan(ek.hariJadwal, ym, ek.id);
      return {
        ym,
        kolom: tgl.map(d=>{
          const iso = d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
          return { key: iso, label1: HARI_PENDEK[d.getDay()], label2: String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0') };
        })
      };
    });
  }
  const totalKolom = kolomPerBulan.reduce((s,b)=>s+b.kolom.length,0);
  // Header 2-baris (grup nama bulan membentang) HANYA relevan untuk jenis
  // per-pertemuan, karena di situ satu bulan bisa punya banyak kolom
  // tanggal yang perlu "dipayungi" nama bulannya. Untuk jenis bulanan,
  // setiap bulan SELALU cuma 1 kolom (kolom.length===1) — kalau syarat ini
  // tidak menyertakan jenisPembayaran, laporan bulanan dgn rentang >1 bulan
  // dulu ikut kepicu header 2-baris yang redundan (nama bulan tercetak
  // dobel: sekali di baris grup, sekali lagi di baris kolom itu sendiri).
  const berkelompok = ek.jenisPembayaran === 'pertemuan'
    && kolomPerBulan.filter(b=>b.kolom.length>0).length > 1;
  const kolomFlat = kolomPerBulan.flatMap(b=>b.kolom);

  const baris = anggota.map(s=>{
    let total = 0;
    const sel = kolomFlat.map(k=>{
      const cocok = masukList.filter(p=>p.siswaId===s.id && p.periode===k.key);
      const nominal = cocok.reduce((sum,p)=>sum+p.nominal,0);
      total += nominal;
      const tglBayarTerakhir = cocok.length ? cocok.map(p=>p.tanggalBayar).sort().slice(-1)[0] : null;
      return { bayar: cocok.length>0, nominal, tanggalBayar: tglBayarTerakhir };
    });
    return { siswa: s, sel, total };
  });

  return { kolomPerBulan, kolomFlat, totalKolom, berkelompok, baris };
}

/* Rekap Status Pembayaran Siswa — target jumlah pertemuan/bulan dihitung
   dari rentang bulan efektif yang SAMA dengan matriks Rincian Pemasukan,
   supaya keduanya selalu konsisten dalam satu laporan.

   "sudah" WAJIB diturunkan dari `matriks` yang SUDAH dibangun (bukan
   dihitung ulang dari masukList.length) — bug ditemukan lewat testing:
   menghitung mentah jumlah baris pemasukan meremehkan tunggakan kalau ada
   siswa yang mencicil satu periode jadi beberapa transaksi (mis. bayar
   Juli 2x karena dicicil) — 2 transaksi di 1 bulan yang sama dulu terhitung
   "sudah 2", padahal cuma 1 periode yang benar-benar lunas, jadi bulan lain
   yang sebenarnya masih nunggak ikut tertutup keliru oleh kelebihan hitung
   ini. Sekarang "sudah" = jumlah KOLOM (periode) yang matriks tandai lunas
   (sel.bayar === true) untuk siswa itu, persis logika yang sama dipakai
   matriks & hitungTunggakanBulan() di tempat lain. */
function buildRekapStatusPembayaran(ek, masukList, anggota, matriks){
  const rentang = rentangBulanEfektif(masukList, 'tanggalBayar');
  const bulanList = rentang ? daftarBulanRentang(rentang.awal, rentang.akhir) : [];
  let target;
  if(ek.jenisPembayaran === 'bulanan'){
    target = bulanList.filter(ym=>!bulanNonaktifUntukPeriode(ek, ym)).length;
  } else {
    target = bulanList.reduce((s,ym)=> s + tanggalPertemuanBulan(ek.hariJadwal, ym, ek.id).length, 0);
  }
  const labelSatuan = ek.jenisPembayaran==='bulanan' ? 'Jumlah Bulan' : 'Jumlah Pertemuan';
  const rows = anggota.map(s=>{
    const barisMatriks = matriks ? matriks.baris.find(b=>b.siswa.id===s.id) : null;
    const sudah = barisMatriks ? barisMatriks.sel.filter(sel=>sel.bayar).length : 0;
    const belum = Math.max(target - sudah, 0);
    const status = belum<=0 ? 'Lunas' : `Kurang ${belum}x (${rupiah(belum*ek.tarif)})`;
    return { nama:s.nama, kelas:s.kelas, target, sudah, belum, status };
  });
  return { labelSatuan, rows };
}

/* CSS bersama untuk halaman cetak laporan (per-ekskul & gabungan) —
   disatukan supaya perubahan tata letak (lebar kolom, header di-center,
   dsb) tidak perlu diulang-ulang di beberapa tempat. Dicetak landscape
   karena matriks Rincian Pemasukan bisa punya banyak kolom (per
   pertemuan/bulan). */
/* Palet warna resmi laporan — dipakai bersama oleh versi cetak HTML
   (CSS_LAPORAN) & versi unduh PDF (jsPDF) supaya kedua versi selalu
   konsisten secara visual. */
const WARNA_LAPORAN = {
  navy: [18,59,120],       // #123B78 — warna utama kop & header tabel
  navyMuda: [29,78,216],   // #1D4ED8 — gradasi kop
  hijau: [5,150,105],      // #059669 — kartu Pemasukan
  merah: [225,29,72],      // #E11D48 — kartu/tabel Pengeluaran
  abuGelap: [15,23,42],    // #0F172A — teks judul
  abuTeks: [71,85,105],    // #475569 — teks sekunder
  abuMuted: [148,163,184], // #94A3B8 — footer/caption
  abuBorder: [226,232,240],// #E2E8F0 — garis & border tabel
  abuLatar: [248,250,252]  // #F8FAFC — latar kartu/baris genap
};

function CSS_LAPORAN(){
  return `
    @page{ size: landscape; margin: 13mm; }
    *{ box-sizing:border-box; }
    body{font-family:'Segoe UI', Arial, sans-serif; padding:22px 26px 26px; color:#1e293b; font-size:12px; -webkit-print-color-adjust:exact; print-color-adjust:exact;}
    h1{font-size:18px; margin:0;}
    h2.section-title{font-size:12.5px; margin:22px 0 9px; padding-left:11px; border-left:4px solid #123B78; color:#123B78; letter-spacing:.3px; text-transform:uppercase;}
    .header-band{background:linear-gradient(120deg,#123B78,#1D4ED8); color:#fff; display:flex; align-items:center; gap:16px; padding:14px 22px; border-radius:10px; margin-bottom:20px;}
    .header-band img{width:50px; height:50px; object-fit:contain; background:#fff; border-radius:8px; padding:4px;}
    .header-band .kop{flex:1;}
    .header-band .kop div{line-height:1.28;}
    .header-band .tahun-ajaran{font-size:10px; background:rgba(255,255,255,.16); padding:5px 12px; border-radius:20px; white-space:nowrap;}
    .laporan-head{text-align:center; margin:0 0 18px; padding-bottom:14px; border-bottom:1px solid #e2e8f0;}
    .laporan-head h2{margin:0 0 5px; font-size:16px; color:#0f172a; font-weight:700;}
    .laporan-head .nomor{font-size:10px; color:#64748b; margin:0 0 4px;}
    .laporan-head .meta{font-size:10.5px; color:#475569; margin:0;}
    .summary{display:flex; justify-content:center; gap:14px; margin:16px 0 4px;}
    .summary .card{flex:1; max-width:230px; border:1px solid #e2e8f0; border-top:3px solid #123B78; border-radius:8px; padding:9px 14px; text-align:center; background:#f8fafc;}
    .summary .card.masuk{border-top-color:#059669;}
    .summary .card.keluar{border-top-color:#e11d48;}
    .summary .card.saldo{border-top-color:#123B78; background:#eff6ff;}
    .summary .card .label{font-size:8.5px; color:#64748b; text-transform:uppercase; letter-spacing:.4px; margin-bottom:3px;}
    .summary .card .value{font-size:13px; font-weight:700; color:#0f172a;}
    table{width:100%; border-collapse:collapse; font-size:10.5px; margin-bottom:6px;}
    th,td{border:1px solid #e2e8f0; padding:6px 7px; text-align:left; vertical-align:middle;}
    th{background:#123B78; color:#fff; text-align:center; font-weight:600; font-size:9.5px; letter-spacing:.2px;}
    tbody tr:nth-child(even){background:#f8fafc;}
    .text-right{text-align:right;}
    .text-center{text-align:center;}
    .cell-bayar{text-align:center; white-space:nowrap; color:#0f172a;}
    .tgl-kecil{font-size:9px; color:#64748b;}
    .ttd{display:flex; justify-content:space-between; margin-top:54px; font-size:11px;}
    .ttd div{text-align:center; width:220px;}
    .ttd .garis{border-bottom:1px solid #334155; margin:46px auto 4px; width:180px;}
    .footer-note{font-size:8.5px; color:#94a3b8; margin-top:24px; border-top:1px solid #e2e8f0; padding-top:7px;}
    .tbl-list th:nth-child(1), .tbl-list td:nth-child(1){width:4%; text-align:center;}
    .tbl-list th:nth-child(4), .tbl-list td:nth-child(4){width:13%; white-space:nowrap; text-align:center;}
    .tbl-list th:nth-child(5), .tbl-list td:nth-child(5){width:15%;}
    .tbl-rekap th:nth-child(1), .tbl-rekap td:nth-child(1){width:4%; text-align:center;}
    .tbl-rekap th:nth-child(3), .tbl-rekap td:nth-child(3){width:9%; text-align:center;}
    .tbl-rekap th:nth-child(4), .tbl-rekap td:nth-child(4){width:11%; text-align:center;}
    .tbl-rekap th:nth-child(5), .tbl-rekap td:nth-child(5){width:11%; text-align:center;}
    .tbl-rekap th:nth-child(6), .tbl-rekap td:nth-child(6){width:11%; text-align:center;}
    .total-row td{font-weight:700; background:#eef2ff !important;}
    .tbl-gab th:nth-child(1), .tbl-gab td:nth-child(1){width:4%; text-align:center;}
  `;
}

/* Render tabel matriks Rincian Pemasukan (No, Nama, kolom per pertemuan/
   bulan, Total). Kalau rentangnya >1 bulan & jenisnya per-pertemuan, kolom
   dikelompokkan pakai header bulan membentang (rowspan/colspan). */
function renderMatriksPemasukanHTML(matriks){
  if(!matriks || matriks.totalKolom===0){
    return `<table class="tbl-list"><tr><th>No</th><th>Nama Siswa</th><th class="text-right">Total</th></tr><tr><td colspan="3">Belum ada data</td></tr></table>`;
  }
  const kolomBerisi = matriks.kolomPerBulan.filter(b=>b.kolom.length>0);
  const thead = matriks.berkelompok
    ? `<tr>
         <th rowspan="2">No</th><th rowspan="2">Nama Siswa</th>
         ${kolomBerisi.map(b=>`<th colspan="${b.kolom.length}">${bulanNama(b.ym)}</th>`).join('')}
         <th rowspan="2" class="text-right">Total</th>
       </tr>
       <tr>${matriks.kolomFlat.map(k=>`<th>${k.label1}${k.label2?'<br>'+k.label2:''}</th>`).join('')}</tr>`
    : `<tr><th>No</th><th>Nama Siswa</th>${matriks.kolomFlat.map(k=>`<th>${k.label1}${k.label2?'<br>'+k.label2:''}</th>`).join('')}<th class="text-right">Total</th></tr>`;
  const tbody = matriks.baris.map((b,i)=>`
    <tr>
      <td class="text-center">${i+1}</td>
      <td>${escapeHtml(b.siswa.nama)}</td>
      ${b.sel.map(s=> s.bayar
          ? `<td class="cell-bayar">${rupiah(s.nominal)}<br><span class="tgl-kecil">${tglPendek(s.tanggalBayar)}</span></td>`
          : `<td class="text-center">–</td>`
        ).join('')}
      <td class="text-right">${rupiah(b.total)}</td>
    </tr>`).join('') || `<tr><td colspan="${matriks.totalKolom+3}">Belum ada siswa</td></tr>`;
  return `<table>${thead}<tbody>${tbody}</tbody></table>`;
}

/* Render tabel Rekap Status Pembayaran Siswa. */
function renderRekapStatusHTML(rekap){
  return `
    <table class="tbl-rekap">
      <tr><th>No</th><th>Nama Siswa</th><th>Kelas</th><th>${rekap.labelSatuan}</th><th>Jumlah Bayar</th><th>Belum Terbayar</th><th>Status</th></tr>
      ${rekap.rows.map((r,i)=>`<tr><td>${i+1}</td><td>${escapeHtml(r.nama)}</td><td class="text-center">${escapeHtml(r.kelas)}</td><td>${r.target}</td><td>${r.sudah}x</td><td>${r.belum}x</td><td>${escapeHtml(r.status)}</td></tr>`).join('') || '<tr><td colspan="7">Belum ada siswa</td></tr>'}
    </table>`;
}

async function cetakLaporan(ekskulId){
  const ek = ekskulById(ekskulId);
  const pg = DB.pengaturan;
  const masukList = filterRentangLaporan(DB.pemasukan.filter(p=>p.ekskulId===ekskulId), 'tanggalBayar').sort((a,b)=> new Date(a.tanggalBayar)-new Date(b.tanggalBayar));
  const keluarList = filterRentangLaporan(DB.pengeluaran.filter(p=>p.ekskulId===ekskulId), 'tanggal').sort((a,b)=> new Date(a.tanggal)-new Date(b.tanggal));
  const totalMasuk = masukList.reduce((s,p)=>s+p.nominal,0);
  const totalKeluar = keluarList.reduce((s,p)=>s+p.nominal,0);

  const anggota = DB.siswa.filter(s=>s.ekskulIds.includes(ekskulId) && s.aktif!==false).sort((a,b)=>a.nama.localeCompare(b.nama,'id'));
  const matriks = buildMatriksPemasukan(ek, masukList, anggota);
  const rekap = buildRekapStatusPembayaran(ek, masukList, anggota, matriks);

  // Jendela dibuka DULUAN, sebelum await, supaya tetap dianggap browser
  // sebagai respons langsung ke klik pengguna (kalau tidak, popup blocker
  // di sebagian browser bisa memblokirnya karena ada jeda async di tengah).
  const w = window.open('', '_blank');
  let nomor;
  try{
    nomor = await nomorLaporanBaru(kodeEkskulLaporan(ek));
  }catch(e){
    console.error(e);
    if(w && !w.closed) w.close();
    showToast('Gagal mengambil nomor laporan dari server. Coba lagi.', 'error');
    return;
  }
  w.document.write(`
    <html><head><title>Laporan Keuangan - ${escapeHtml(ek.nama)}</title>
    <style>${CSS_LAPORAN()}</style></head>
    <body>
      <div class="header-band">
        ${pg.logo ? `<img src="${pg.logo}">` : ''}
        <div class="kop">${kopHtml(pg)}</div>
        <div class="tahun-ajaran">Tahun Ajaran ${pg.tahunAjaran||'-'}</div>
      </div>
      <div class="laporan-head">
        <h2>Laporan Keuangan Ekstrakurikuler: ${escapeHtml(ek.nama)}</h2>
        <p class="nomor">Nomor Laporan: ${nomor} &middot; ${escapeHtml(labelPeriodeLaporan())}</p>
        <p class="meta">Pembina: ${escapeHtml(ek.pembina)} &middot; Jenis Pembayaran: ${ek.jenisPembayaran==='bulanan'?'Bulanan':'Per Pertemuan'} &middot; Tarif: ${rupiah(ek.tarif)}</p>
        <div class="summary">
          <div class="card masuk"><div class="label">Total Pemasukan</div><div class="value">${rupiah(totalMasuk)}</div></div>
          <div class="card keluar"><div class="label">Total Pengeluaran</div><div class="value">${rupiah(totalKeluar)}</div></div>
          <div class="card saldo"><div class="label">Saldo Akhir</div><div class="value">${rupiah(totalMasuk-totalKeluar)}</div></div>
        </div>
      </div>

      <h2 class="section-title">Rekap Status Pembayaran Siswa</h2>
      ${renderRekapStatusHTML(rekap)}

      <h2 class="section-title">Rincian Pemasukan</h2>
      ${renderMatriksPemasukanHTML(matriks)}

      <h2 class="section-title">Rincian Pengeluaran</h2>
      <table class="tbl-list">
        <tr><th>No</th><th>Kategori</th><th>Keterangan</th><th>Tanggal</th><th class="text-right">Nominal</th></tr>
        ${keluarList.map((p,i)=>`<tr><td class="text-center">${i+1}</td><td>${escapeHtml(p.kategori)}</td><td>${escapeHtml(p.keterangan||'-')}</td><td>${tanggalIndo(p.tanggal)}</td><td class="text-right">${rupiah(p.nominal)}</td></tr>`).join('') || '<tr><td colspan="5">Belum ada data</td></tr>'}
      </table>

      <div class="ttd">
        <div>Mengetahui,<br>Kepala Sekolah<div class="garis"></div><strong>${pg.kepalaSekolah||'..........................'}</strong><br>NIP. ${pg.nipKepsek||'-'}</div>
        <div>Karanganyar, ${hariIniDate().toLocaleDateString('id-ID',{day:'numeric',month:'long',year:'numeric'})}<br>Bendahara<div class="garis"></div><strong>${pg.bendahara||'..........................'}</strong><br>NIP. ${pg.nipBendahara||'-'}</div>
      </div>
      <p class="footer-note">Dicetak oleh ${currentUserName()} (${roleLabel(currentRole)}) pada ${waktuIndo(new Date().toISOString())} melalui SIKasapa.</p>
    </body></html>
  `);
  w.document.close();
  catatAktivitas('Cetak Laporan', `${ek.nama} — ${nomor} — ${labelPeriodeLaporan()}`);
  logCetak('Cetak Laporan', `${ek.nama} — ${nomor} — ${labelPeriodeLaporan()}`);
  setTimeout(()=>{ w.print(); }, 300);
}

function imgFormatFromDataUrl(dataUrl){
  if(!dataUrl) return null;
  const m = /^data:image\/(png|jpe?g|webp);/i.exec(dataUrl);
  if(!m) return null;
  const ext = m[1].toLowerCase();
  return ext==='jpg' ? 'JPEG' : ext.toUpperCase();
}

/* jsPDF butuh gambar dalam bentuk data URL (base64). Logo/bukti kini
   tersimpan langsung sebagai data URL base64 di D1, jadi biasanya
   sudah bisa dipakai apa adanya. Fallback fetch() di bawah ini
   hanya jaga-jaga kalau nilainya berupa URL biasa (mis. data lama). */
async function resolveImageDataUrl(urlOrDataUrl){
  if(!urlOrDataUrl) return null;
  if(String(urlOrDataUrl).startsWith('data:')) return urlOrDataUrl;
  try{
    const res = await fetch(urlOrDataUrl);
    if(!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve, reject)=>{
      const reader = new FileReader();
      reader.onload = ()=> resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }catch(e){ console.error(e); return null; }
}

/* Susun head/body untuk doc.autoTable() dari matriks Rincian Pemasukan
   (dipakai bersama dgn versi Print HTML lewat buildMatriksPemasukan()). */
function matriksPemasukanAutoTable(matriks){
  if(!matriks || matriks.totalKolom===0){
    return { head: [['No','Nama Siswa','Total']], body: [['-','Belum ada data','-']], columnStyles:{} };
  }
  const kolomBerisi = matriks.kolomPerBulan.filter(b=>b.kolom.length>0);
  let head;
  if(matriks.berkelompok){
    const row1 = [
      { content:'No', rowSpan:2 },
      { content:'Nama Siswa', rowSpan:2 },
      ...kolomBerisi.map(b=>({ content:bulanNama(b.ym), colSpan:b.kolom.length })),
      { content:'Total', rowSpan:2 }
    ];
    const row2 = matriks.kolomFlat.map(k=> k.label2 ? `${k.label1} ${k.label2}` : k.label1);
    head = [row1, row2];
  } else {
    head = [['No','Nama Siswa', ...matriks.kolomFlat.map(k=> k.label2 ? `${k.label1} ${k.label2}` : k.label1), 'Total']];
  }
  const body = matriks.baris.map((b,i)=> [
    i+1, b.siswa.nama,
    ...b.sel.map(s=> s.bayar ? `${rupiah(s.nominal)}\n${tglPendek(s.tanggalBayar)}` : '–'),
    rupiah(b.total)
  ]);
  const columnStyles = {};
  const lastIdx = matriks.kolomFlat.length + 2;
  columnStyles[lastIdx] = { halign:'right' };
  for(let i=2;i<=matriks.kolomFlat.length+1;i++) columnStyles[i] = { halign:'center' };
  return { head, body, columnStyles };
}

/* Susun head/body untuk doc.autoTable() dari Rekap Status Pembayaran. */
function rekapStatusAutoTable(rekap){
  return {
    head: [['No','Nama Siswa','Kelas', rekap.labelSatuan, 'Jumlah Bayar', 'Belum Terbayar', 'Status']],
    body: rekap.rows.length ? rekap.rows.map((r,i)=>[i+1, r.nama, r.kelas, r.target, r.sudah+'x', r.belum+'x', r.status]) : [['-','Belum ada siswa','-','-','-','-','-']]
  };
}

/* =========================================================
   HELPER TAMPILAN PDF (jsPDF) — dipakai bersama oleh unduhLaporanPdf()
   & unduhLaporanGabunganPdf() supaya kop, kartu ringkasan, judul seksi,
   tabel & footer selalu konsisten & terlihat profesional di semua
   laporan. Palet warna diambil dari WARNA_LAPORAN (lihat CSS_LAPORAN).
   ========================================================= */

/* Kop bergaya "band" biru gradasi (didekati solid navy, jsPDF tak
   dukung gradient) di bagian atas halaman + judul & nomor laporan di
   bawahnya, center. Mengembalikan koordinat Y siap dipakai konten
   berikutnya. */
function gambarHeaderLaporanPdf(doc, pg, logoDataUrl, judul, nomor, subInfo){
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageCenterX = pageWidth/2;
  const W = WARNA_LAPORAN;

  doc.setFillColor(...W.navy);
  doc.rect(0, 0, pageWidth, 25, 'F');

  const logoFmt = imgFormatFromDataUrl(logoDataUrl);
  const textX = (logoDataUrl && logoFmt) ? 34 : 14;
  if(logoDataUrl && logoFmt){
    doc.setFillColor(255,255,255);
    doc.roundedRect(12, 4, 17, 17, 2, 2, 'F');
    try{ doc.addImage(logoDataUrl, logoFmt, 13.3, 5.3, 14.4, 14.4); }catch(e){}
  }
  doc.setTextColor(255,255,255);
  let ky = 9.5;
  kopLinesSafe(pg).forEach(l=>{
    const sz = Math.min(l.size || 12, 13);
    doc.setFontSize(sz);
    doc.setFont(undefined, l.bold ? 'bold' : 'normal');
    doc.text(l.text || '', textX, ky);
    ky += Math.max(sz * 0.4, 4.2);
  });
  doc.setFontSize(8); doc.setFont(undefined,'normal');
  doc.text(`Tahun Ajaran ${pg.tahunAjaran || '-'}`, pageWidth-14, 9.5, {align:'right'});
  doc.text(labelPeriodeLaporan(), pageWidth-14, 14.5, {align:'right'}, );
  doc.setTextColor(0);

  let y = 34;
  doc.setFontSize(13); doc.setFont(undefined,'bold'); doc.setTextColor(...W.abuGelap);
  doc.text(judul, pageCenterX, y, {align:'center'});
  y += 5.5;
  doc.setFontSize(8); doc.setFont(undefined,'normal'); doc.setTextColor(...W.abuTeks);
  doc.text(`Nomor Laporan: ${nomor}`, pageCenterX, y, {align:'center'});
  y += 4.8;
  if(subInfo){
    doc.setFontSize(9); doc.setTextColor(51,65,85);
    doc.text(subInfo, pageCenterX, y, {align:'center'});
    y += 5;
  }
  doc.setTextColor(0);
  doc.setDrawColor(...W.abuBorder); doc.setLineWidth(0.3);
  doc.line(14, y, pageWidth-14, y);
  return y + 7;
}

/* Deret kartu ringkasan (Pemasukan/Pengeluaran/Saldo, dst) dengan aksen
   garis berwarna di sisi atas — versi PDF dari .summary .card di CSS
   cetak. `kartu` = [{label, nilai, warna:[r,g,b]}]. */
function gambarKartuRingkasanPdf(doc, y, kartu){
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14, gap = 6, tinggi = 16;
  const lebar = (pageWidth - margin*2 - gap*(kartu.length-1)) / kartu.length;
  kartu.forEach((k,i)=>{
    const x = margin + i*(lebar+gap);
    doc.setFillColor(...WARNA_LAPORAN.abuLatar);
    doc.setDrawColor(...WARNA_LAPORAN.abuBorder); doc.setLineWidth(0.25);
    doc.roundedRect(x, y, lebar, tinggi, 1.4, 1.4, 'FD');
    doc.setFillColor(...k.warna);
    doc.rect(x, y, lebar, 1.3, 'F');
    doc.setFontSize(7); doc.setFont(undefined,'normal'); doc.setTextColor(...WARNA_LAPORAN.abuTeks);
    doc.text(k.label.toUpperCase(), x+lebar/2, y+6.2, {align:'center'});
    doc.setFontSize(10.5); doc.setFont(undefined,'bold'); doc.setTextColor(...WARNA_LAPORAN.abuGelap);
    doc.text(k.nilai, x+lebar/2, y+12.3, {align:'center'});
  });
  doc.setTextColor(0);
  return y + tinggi + 8;
}

/* Judul seksi dengan aksen bar kecil berwarna, versi PDF dari
   h2.section-title di CSS cetak. */
function gambarJudulSeksiPdf(doc, y, teks, warna){
  doc.setFillColor(...(warna || WARNA_LAPORAN.navy));
  doc.rect(14, y-3.3, 1.4, 4.6, 'F');
  doc.setFontSize(10); doc.setFont(undefined,'bold'); doc.setTextColor(...WARNA_LAPORAN.abuGelap);
  doc.text(teks, 18, y);
  doc.setTextColor(0);
  return y + 4;
}

/* Opsi styling bersama untuk doc.autoTable() supaya seluruh tabel
   laporan (rekap, matriks, rincian pengeluaran, gabungan) punya
   tampilan konsisten: header navy, garis tipis abu-abu, baris genap
   sedikit lebih terang (zebra). */
function gayaTabelLaporan(headFill){
  return {
    theme: 'grid',
    styles:{ fontSize:8, cellPadding:2.6, textColor:[30,41,59], lineColor:WARNA_LAPORAN.abuBorder, lineWidth:0.15 },
    headStyles:{ fillColor: headFill || WARNA_LAPORAN.navy, textColor:255, fontStyle:'bold', halign:'center', fontSize:8 },
    alternateRowStyles:{ fillColor: WARNA_LAPORAN.abuLatar },
    margin:{left:14, right:14}
  };
}

/* Blok tanda tangan (Kepala Sekolah & Bendahara) dengan garis tanda
   tangan, pindah halaman otomatis kalau tak cukup ruang. Mengembalikan
   Y akhir. */
function gambarTtdPdf(doc, y, pg){
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  if(y > pageHeight - 46){ doc.addPage(); y = 24; }
  const xKiri = 26, xKanan = pageWidth - 96;

  doc.setFontSize(9); doc.setFont(undefined,'normal'); doc.setTextColor(30,41,59);
  doc.text('Mengetahui,', xKiri, y);
  doc.text('Kepala Sekolah', xKiri, y+5);
  doc.setDrawColor(51,65,85); doc.setLineWidth(0.25);
  doc.line(xKiri, y+27, xKiri+70, y+27);
  doc.setFont(undefined,'bold'); doc.setFontSize(9);
  doc.text(pg.kepalaSekolah || '..........................', xKiri+35, y+25, {align:'center'});
  doc.setFont(undefined,'normal'); doc.setFontSize(8);
  doc.text(`NIP. ${pg.nipKepsek || '-'}`, xKiri+35, y+32, {align:'center'});

  const tglLaporan = hariIniDate().toLocaleDateString('id-ID',{day:'numeric',month:'long',year:'numeric'});
  doc.setFontSize(9);
  doc.text(`Karanganyar, ${tglLaporan}`, xKanan, y);
  doc.text('Bendahara', xKanan, y+5);
  doc.line(xKanan, y+27, xKanan+70, y+27);
  doc.setFont(undefined,'bold');
  doc.text(pg.bendahara || '..........................', xKanan+35, y+25, {align:'center'});
  doc.setFont(undefined,'normal'); doc.setFontSize(8);
  doc.text(`NIP. ${pg.nipBendahara || '-'}`, xKanan+35, y+32, {align:'center'});
  doc.setTextColor(0);
  return y + 36;
}

/* Footer & nomor halaman di SEMUA halaman dokumen (tabel panjang bisa
   memicu lebih dari 1 halaman lewat autoTable). Dipanggil PALING
   TERAKHIR, setelah seluruh konten (termasuk tanda tangan) selesai
   digambar, supaya jumlah halaman yang dihitung sudah final. */
function gambarFooterSemuaHalamanPdf(doc, nomor){
  const totalHalaman = doc.internal.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  for(let i=1;i<=totalHalaman;i++){
    doc.setPage(i);
    doc.setDrawColor(...WARNA_LAPORAN.abuBorder); doc.setLineWidth(0.25);
    doc.line(14, pageHeight-13, pageWidth-14, pageHeight-13);
    doc.setFontSize(7); doc.setFont(undefined,'normal'); doc.setTextColor(...WARNA_LAPORAN.abuMuted);
    doc.text(`Dicetak oleh ${currentUserName()} (${roleLabel(currentRole)}) pada ${waktuIndo(new Date().toISOString())} melalui SIKasapa`, 14, pageHeight-8);
    doc.text(`${nomor}  ·  Halaman ${i} dari ${totalHalaman}`, pageWidth-14, pageHeight-8, {align:'right'});
    doc.setTextColor(0);
  }
}

async function unduhLaporanPdf(ekskulId){
  if(!window.jspdf){ showToast('Pustaka PDF gagal dimuat. Periksa koneksi internet lalu coba lagi.', 'error'); return; }
  const { jsPDF } = window.jspdf;
  const ek = ekskulById(ekskulId);
  const pg = DB.pengaturan;
  const logoDataUrl = await resolveImageDataUrl(pg.logo);
  const masukList = filterRentangLaporan(DB.pemasukan.filter(p=>p.ekskulId===ekskulId), 'tanggalBayar').sort((a,b)=> new Date(a.tanggalBayar)-new Date(b.tanggalBayar));
  const keluarList = filterRentangLaporan(DB.pengeluaran.filter(p=>p.ekskulId===ekskulId), 'tanggal').sort((a,b)=> new Date(a.tanggal)-new Date(b.tanggal));
  const totalMasuk = masukList.reduce((s,p)=>s+p.nominal,0);
  const totalKeluar = keluarList.reduce((s,p)=>s+p.nominal,0);
  const anggota = DB.siswa.filter(s=>s.ekskulIds.includes(ekskulId) && s.aktif!==false).sort((a,b)=>a.nama.localeCompare(b.nama,'id'));
  const matriks = buildMatriksPemasukan(ek, masukList, anggota);
  const rekap = buildRekapStatusPembayaran(ek, masukList, anggota, matriks);
  let nomor;
  try{
    nomor = await nomorLaporanBaru(kodeEkskulLaporan(ek));
  }catch(e){
    console.error(e);
    showToast('Gagal mengambil nomor laporan dari server. Coba lagi.', 'error');
    return;
  }

  // Landscape: matriks Rincian Pemasukan bisa punya banyak kolom
  // (per pertemuan/bulan), jadi butuh lebar halaman ekstra.
  const doc = new jsPDF({ orientation:'landscape' });
  const W = WARNA_LAPORAN;

  const subInfo = `Pembina: ${ek.pembina}   |   Jenis Pembayaran: ${ek.jenisPembayaran==='bulanan'?'Bulanan':'Per Pertemuan'}   |   Tarif: ${rupiah(ek.tarif)}`;
  let y = gambarHeaderLaporanPdf(doc, pg, logoDataUrl, `Laporan Keuangan Ekstrakurikuler: ${ek.nama}`, nomor, subInfo);

  y = gambarKartuRingkasanPdf(doc, y, [
    { label:'Total Pemasukan', nilai: rupiah(totalMasuk), warna: W.hijau },
    { label:'Total Pengeluaran', nilai: rupiah(totalKeluar), warna: W.merah },
    { label:'Saldo Akhir', nilai: rupiah(totalMasuk-totalKeluar), warna: W.navy }
  ]);

  // Rekap Status Pembayaran Siswa — dipindah ke atas, sebelum Rincian
  // Pemasukan/Pengeluaran (ringkasan dulu, baru detail).
  y = gambarJudulSeksiPdf(doc, y, 'Rekap Status Pembayaran Siswa');
  const rekapTbl = rekapStatusAutoTable(rekap);
  doc.autoTable({ startY: y, head: rekapTbl.head, body: rekapTbl.body, ...gayaTabelLaporan() });

  let y1 = doc.lastAutoTable.finalY + 9;
  y1 = gambarJudulSeksiPdf(doc, y1, 'Rincian Pemasukan');
  const matriksTbl = matriksPemasukanAutoTable(matriks);
  doc.autoTable({
    startY: y1, head: matriksTbl.head, body: matriksTbl.body,
    ...gayaTabelLaporan(), styles:{...gayaTabelLaporan().styles, fontSize:7, cellPadding:2},
    columnStyles: matriksTbl.columnStyles, horizontalPageBreak:true
  });

  let y2 = doc.lastAutoTable.finalY + 9;
  y2 = gambarJudulSeksiPdf(doc, y2, 'Rincian Pengeluaran', W.merah);
  doc.autoTable({
    startY: y2,
    head: [['No','Kategori','Keterangan','Tanggal','Nominal']],
    body: keluarList.length ? keluarList.map((p,i)=>[i+1, p.kategori, p.keterangan||'-', tanggalIndo(p.tanggal), rupiah(p.nominal)]) : [['-','Belum ada data','-','-','-']],
    ...gayaTabelLaporan(W.merah), columnStyles:{4:{halign:'right'}}
  });

  let y4 = doc.lastAutoTable.finalY + 18;
  gambarTtdPdf(doc, y4, pg);
  gambarFooterSemuaHalamanPdf(doc, nomor);

  doc.save(`Laporan-${ek.nama.replace(/\s+/g,'-')}-${periodeLaporanFileTag()}.pdf`);
  catatAktivitas('Unduh Laporan PDF', `${ek.nama} — ${nomor} — ${labelPeriodeLaporan()}`);
  logCetak('Unduh Laporan PDF', `${ek.nama} — ${nomor} — ${labelPeriodeLaporan()}`);
  showToast('Laporan PDF berhasil diunduh.');
}

/* =========================================================
   LAPORAN GABUNGAN — rekap ringkas SEMUA ekstrakurikuler dalam
   satu dokumen (total pemasukan/pengeluaran/saldo per ekskul +
   grand total), untuk kebutuhan Kepala Sekolah yang minta rekap
   total kas ekskul satu periode tanpa harus buka satu-satu.
   Mengikuti rentang tanggal yang sama dengan laporan per-ekskul.
   ========================================================= */
function rekapGabunganEkskul(){
  return DB.ekskul.map(ek=>{
    const masuk = filterRentangLaporan(DB.pemasukan.filter(p=>p.ekskulId===ek.id), 'tanggalBayar').reduce((s,p)=>s+p.nominal,0);
    const keluar = filterRentangLaporan(DB.pengeluaran.filter(p=>p.ekskulId===ek.id), 'tanggal').reduce((s,p)=>s+p.nominal,0);
    return { ek, masuk, keluar, saldo: masuk-keluar };
  });
}

async function cetakLaporanGabungan(){
  if(DB.ekskul.length===0){ showToast('Belum ada data ekstrakurikuler.', 'error'); return; }
  const pg = DB.pengaturan;
  const baris = rekapGabunganEkskul();
  const totalMasuk = baris.reduce((s,b)=>s+b.masuk,0);
  const totalKeluar = baris.reduce((s,b)=>s+b.keluar,0);

  // Jendela dibuka DULUAN, sebelum await — lihat catatan di cetakLaporan().
  const w = window.open('', '_blank');
  let nomor;
  try{
    nomor = await nomorLaporanBaru('GAB');
  }catch(e){
    console.error(e);
    if(w && !w.closed) w.close();
    showToast('Gagal mengambil nomor laporan dari server. Coba lagi.', 'error');
    return;
  }
  w.document.write(`
    <html><head><title>Laporan Gabungan Ekstrakurikuler</title>
    <style>${CSS_LAPORAN()}</style></head>
    <body>
      <div class="header-band">
        ${pg.logo ? `<img src="${pg.logo}">` : ''}
        <div class="kop">${kopHtml(pg)}</div>
        <div class="tahun-ajaran">Tahun Ajaran ${pg.tahunAjaran||'-'}</div>
      </div>
      <div class="laporan-head">
        <h2>Laporan Gabungan Kas Seluruh Ekstrakurikuler</h2>
        <p class="nomor">Nomor Laporan: ${nomor} &middot; ${escapeHtml(labelPeriodeLaporan())}</p>
        <div class="summary">
          <div class="card masuk"><div class="label">Total Pemasukan</div><div class="value">${rupiah(totalMasuk)}</div></div>
          <div class="card keluar"><div class="label">Total Pengeluaran</div><div class="value">${rupiah(totalKeluar)}</div></div>
          <div class="card saldo"><div class="label">Saldo Akhir Seluruh Ekskul</div><div class="value">${rupiah(totalMasuk-totalKeluar)}</div></div>
        </div>
      </div>

      <table class="tbl-gab">
        <tr><th>No</th><th>Ekstrakurikuler</th><th>Pembina</th><th class="text-right">Pemasukan</th><th class="text-right">Pengeluaran</th><th class="text-right">Saldo</th></tr>
        ${baris.map((b,i)=>`<tr><td>${i+1}</td><td>${escapeHtml(b.ek.nama)}</td><td>${escapeHtml(b.ek.pembina)}</td><td class="text-right">${rupiah(b.masuk)}</td><td class="text-right">${rupiah(b.keluar)}</td><td class="text-right">${rupiah(b.saldo)}</td></tr>`).join('') || '<tr><td colspan="6">Belum ada ekstrakurikuler</td></tr>'}
        <tr class="total-row"><td colspan="3">TOTAL</td><td class="text-right">${rupiah(totalMasuk)}</td><td class="text-right">${rupiah(totalKeluar)}</td><td class="text-right">${rupiah(totalMasuk-totalKeluar)}</td></tr>
      </table>

      <div class="ttd">
        <div>Mengetahui,<br>Kepala Sekolah<div class="garis"></div><strong>${pg.kepalaSekolah||'..........................'}</strong><br>NIP. ${pg.nipKepsek||'-'}</div>
        <div>Karanganyar, ${hariIniDate().toLocaleDateString('id-ID',{day:'numeric',month:'long',year:'numeric'})}<br>Bendahara<div class="garis"></div><strong>${pg.bendahara||'..........................'}</strong><br>NIP. ${pg.nipBendahara||'-'}</div>
      </div>
      <p class="footer-note">Dicetak oleh ${currentUserName()} (${roleLabel(currentRole)}) pada ${waktuIndo(new Date().toISOString())} melalui SIKasapa.</p>
    </body></html>
  `);
  w.document.close();
  catatAktivitas('Cetak Laporan Gabungan', `${nomor} — ${labelPeriodeLaporan()}`);
  logCetak('Cetak Laporan Gabungan', `${nomor} — ${labelPeriodeLaporan()}`);
  setTimeout(()=>{ w.print(); }, 300);
}

async function unduhLaporanGabunganPdf(){
  if(DB.ekskul.length===0){ showToast('Belum ada data ekstrakurikuler.', 'error'); return; }
  if(!window.jspdf){ showToast('Pustaka PDF gagal dimuat. Periksa koneksi internet lalu coba lagi.', 'error'); return; }
  const { jsPDF } = window.jspdf;
  const pg = DB.pengaturan;
  const logoDataUrl = await resolveImageDataUrl(pg.logo);
  let nomor;
  try{
    nomor = await nomorLaporanBaru('GAB');
  }catch(e){
    console.error(e);
    showToast('Gagal mengambil nomor laporan dari server. Coba lagi.', 'error');
    return;
  }
  const baris = rekapGabunganEkskul();
  const totalMasuk = baris.reduce((s,b)=>s+b.masuk,0);
  const totalKeluar = baris.reduce((s,b)=>s+b.keluar,0);

  const doc = new jsPDF({ orientation:'landscape' });
  const W = WARNA_LAPORAN;

  let y = gambarHeaderLaporanPdf(doc, pg, logoDataUrl, 'Laporan Gabungan Kas Seluruh Ekstrakurikuler', nomor);

  y = gambarKartuRingkasanPdf(doc, y, [
    { label:'Total Pemasukan', nilai: rupiah(totalMasuk), warna: W.hijau },
    { label:'Total Pengeluaran', nilai: rupiah(totalKeluar), warna: W.merah },
    { label:'Saldo Akhir Seluruh Ekskul', nilai: rupiah(totalMasuk-totalKeluar), warna: W.navy }
  ]);

  doc.autoTable({
    startY: y,
    head: [['No','Ekstrakurikuler','Pembina','Pemasukan','Pengeluaran','Saldo']],
    body: baris.length ? baris.map((b,i)=>[i+1, b.ek.nama, b.ek.pembina, rupiah(b.masuk), rupiah(b.keluar), rupiah(b.saldo)]) : [['-','Belum ada data','-','-','-','-']],
    foot: [['','','TOTAL', rupiah(totalMasuk), rupiah(totalKeluar), rupiah(totalMasuk-totalKeluar)]],
    ...gayaTabelLaporan(),
    footStyles:{ fillColor:[238,242,255], textColor:[15,23,42], fontStyle:'bold', halign:'right', fontSize:8.5 },
    columnStyles:{3:{halign:'right'}, 4:{halign:'right'}, 5:{halign:'right'}}
  });

  let y4 = doc.lastAutoTable.finalY + 18;
  gambarTtdPdf(doc, y4, pg);
  gambarFooterSemuaHalamanPdf(doc, nomor);

  doc.save(`Laporan-Gabungan-${periodeLaporanFileTag()}.pdf`);
  catatAktivitas('Unduh Laporan Gabungan PDF', `${nomor} — ${labelPeriodeLaporan()}`);
  logCetak('Unduh Laporan Gabungan PDF', `${nomor} — ${labelPeriodeLaporan()}`);
  showToast('Laporan gabungan PDF berhasil diunduh.');
}

/* =========================================================
   CETAK PRESENSI
   Lembar presensi kosong (untuk tanda tangan manual) per
   ekstrakurikuler & per bulan. Tanggal pertemuan dihitung
   otomatis dari hari latihan (hariJadwal) ekskul tsb yang
   jatuh pada bulan terpilih — karena tiap bulan jumlah &
   tanggal pertemuannya berbeda-beda.
   ========================================================= */
const HARI_MAP = { 'Minggu':0, 'Senin':1, 'Selasa':2, 'Rabu':3, 'Kamis':4, 'Jumat':5, 'Sabtu':6 };
const HARI_PENDEK = ['Min','Sen','Sel','Rab','Kam','Jum','Sab'];
const HARI_DARI_INDEX = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];

/* Konversi tanggal 'YYYY-MM-DD' ke nama hari Indonesia. Dibangun manual dari
   komponen (bukan `new Date(str)`) supaya tidak salah geser sehari akibat
   parsing UTC — sama alasannya seperti hariIniStr(). Dipakai untuk
   memperingatkan guru saat tanggal yang dipilih di form absensi bukan hari
   jadwal latihan (lihat renderAbsensi()), supaya tanggal keliru ketahuan
   SEBELUM disimpan, bukan baru ketahuan "hilang" saat Cetak Presensi. */
function namaHariDariTanggalStr(tanggalStr){
  if(!tanggalStr) return null;
  const [y, m, d] = tanggalStr.split('-').map(Number);
  if(!y || !m || !d) return null;
  return HARI_DARI_INDEX[new Date(y, m-1, d).getDay()];
}

function defaultBulanIni(){
  const d = hariIniDate();
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0');
}

/* Menghasilkan array objek Date untuk setiap tanggal di bulan `ym` (format
   'YYYY-MM') yang jatuh pada salah satu hari di `hariJadwal` (array nama hari),
   DIKURANGI tanggal-tanggal yang ditandai admin sebagai hari libur ekstra
   KHUSUS ekstrakurikuler `ekskulId` (ek.hariLibur, diatur di menu "Aktivasi
   Bulan & Libur" — lihat renderKalenderEkstra()) — dipakai bersama oleh
   Estimasi Tunggakan Per Pertemuan & Cetak Presensi supaya keduanya
   konsisten: hari libur tidak dihitung sebagai pertemuan yang "seharusnya
   ada", jadi tidak ikut menagih & tidak muncul di lembar presensi.
   ekskulId bersifat OPSIONAL (dilewati kosong = tidak ada libur yang
   dikecualikan) supaya pemanggil lama yang belum sempat diperbarui tetap
   tidak error, walau seluruh pemanggil di file ini sudah mengirim ekskulId. */
function tanggalPertemuanBulan(hariJadwal, ym, ekskulId){
  if(!ym || !Array.isArray(hariJadwal) || hariJadwal.length===0) return [];
  const [y, m] = ym.split('-').map(Number);
  if(!y || !m) return [];
  const targetHari = hariJadwal.map(h=>HARI_MAP[h]).filter(v=>v!==undefined);
  const ek = ekskulId ? ekskulById(ekskulId) : null;
  const libur = new Set((ek && Array.isArray(ek.hariLibur)) ? ek.hariLibur.map(t=>t.tanggal) : []);
  const jumlahHari = new Date(y, m, 0).getDate();
  const hasil = [];
  for(let tgl=1; tgl<=jumlahHari; tgl++){
    const dt = new Date(y, m-1, tgl);
    if(!targetHari.includes(dt.getDay())) continue;
    const iso = y+'-'+String(m).padStart(2,'0')+'-'+String(tgl).padStart(2,'0');
    if(libur.has(iso)) continue;
    hasil.push(dt);
  }
  return hasil;
}

window._presensiState = { ekskulId: '', bulan: defaultBulanIni() };

function renderCetakPresensi(){
  const main = document.getElementById('mainContent');
  const st = window._presensiState;
  if(!st.ekskulId || !ekskulById(st.ekskulId)) st.ekskulId = DB.ekskul[0]?.id || '';

  main.innerHTML = `
    <div class="glass-strong rounded-3xl p-6 max-w-2xl stagger mb-5">
      <div class="flex items-start gap-3 mb-5">
        <div class="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style="background:linear-gradient(135deg,var(--blue-600),var(--blue-400));">
          <i data-lucide="clipboard-check" class="w-5 h-5" style="color:#FFFFFF"></i>
        </div>
        <div>
          <h3 class="font-bold text-base">Cetak Presensi Ekstrakurikuler</h3>
          <p class="text-xs text-slate-500 mt-0.5">Kolom tanggal pertemuan otomatis mengikuti hari latihan tiap ekstrakurikuler pada bulan yang dipilih.</p>
        </div>
      </div>

      ${DB.ekskul.length===0 ? `
        <p class="text-sm text-slate-500 text-center py-8">Belum ada data ekstrakurikuler. Tambahkan dulu di menu Data Ekstrakurikuler.</p>
      ` : `
        <div class="grid sm:grid-cols-2 gap-4 mb-5">
          <div>
            <label class="text-xs font-medium text-slate-600 mb-1.5 block">Ekstrakurikuler</label>
            <select id="presensiEkskul" onchange="updatePresensiState()" class="input-glass w-full rounded-xl px-3.5 py-2.5 text-sm">
              ${DB.ekskul.map(ek=>`<option value="${ek.id}" ${ek.id===st.ekskulId?'selected':''}>${escapeHtml(ek.nama)}</option>`).join('')}
            </select>
          </div>
          <div>
            <label class="text-xs font-medium text-slate-600 mb-1.5 block">Bulan</label>
            <input type="month" id="presensiBulanInput" value="${st.bulan}" onchange="updatePresensiState()" class="input-glass w-full rounded-xl px-3.5 py-2.5 text-sm">
          </div>
        </div>

        <div id="presensiRingkasan"></div>

        <button onclick="cetakPresensi()" class="btn-primary w-full sm:w-auto px-6 py-2.5 rounded-xl text-sm flex items-center justify-center gap-2 mt-4">
          <i data-lucide="printer" class="w-4 h-4"></i>Cetak Presensi
        </button>
      `}
    </div>
    ${DB.ekskul.length>0 ? `
    <div class="glass-strong rounded-3xl p-6 stagger">
      <h3 class="font-bold text-sm mb-1 flex items-center gap-2"><i data-lucide="table" class="w-4 h-4 text-slate-500"></i>Pratinjau Tabel Presensi</h3>
      <p class="text-xs text-slate-500 mb-4">Persis seperti yang akan tercetak — cek dulu daftar & urutan siswanya di sini sebelum klik Cetak Presensi.</p>
      <div id="presensiPreview" class="overflow-x-auto -mx-1 px-1"></div>
    </div>` : ''}
  `;
  safeIcons();
  if(DB.ekskul.length>0) renderPresensiPreview();
}

function updatePresensiState(){
  const st = window._presensiState;
  st.ekskulId = document.getElementById('presensiEkskul').value;
  st.bulan = document.getElementById('presensiBulanInput').value;
  renderPresensiPreview();
}

function renderPresensiPreview(){
  const st = window._presensiState;
  const ek = ekskulById(st.ekskulId);
  const ringkasan = document.getElementById('presensiRingkasan');
  const preview = document.getElementById('presensiPreview');
  if(!ek){ if(ringkasan) ringkasan.innerHTML = ''; if(preview) preview.innerHTML = ''; return; }

  const tanggalList = tanggalPertemuanBulan(ek.hariJadwal, st.bulan, ek.id);
  // Urutan & isi SENGAJA disamakan persis dengan cetakPresensi() di bawah
  // (baris Pembina di atas, siswa diurutkan alfabet id-ID) supaya
  // pratinjau ini benar-benar mencerminkan hasil cetaknya, bukan cuma
  // ringkasan angka.
  const anggota = DB.siswa.filter(s=>s.ekskulIds.includes(ek.id) && s.aktif!==false).sort((a,b)=>a.nama.localeCompare(b.nama,'id'));

  if(ringkasan) ringkasan.innerHTML = `
    <div class="glass rounded-2xl p-4 text-sm space-y-2">
      <div class="flex justify-between"><span class="text-slate-500">Hari Latihan</span><span class="font-semibold">${ek.hariJadwal.join(' & ')}</span></div>
      <div class="flex justify-between"><span class="text-slate-500">Pertemuan Bulan Ini</span><span class="font-semibold">${tanggalList.length ? tanggalList.length + 'x (' + tanggalList.map(d=>String(d.getDate()).padStart(2,'0')).join(', ') + ')' : '0'}</span></div>
      <div class="flex justify-between"><span class="text-slate-500">Siswa Aktif</span><span class="font-semibold">${anggota.length} siswa</span></div>
      ${tanggalList.length===0 ? '<p class="text-xs font-medium" style="color:var(--rose-500)">Tidak ada tanggal pertemuan pada bulan ini untuk hari latihan ekstrakurikuler ini.</p>' : ''}
      ${anggota.length===0 ? '<p class="text-xs font-medium" style="color:var(--rose-500)">Belum ada siswa aktif pada ekstrakurikuler ini.</p>' : ''}
    </div>
  `;

  if(!preview) return;
  if(tanggalList.length===0 || anggota.length===0){
    preview.innerHTML = `<p class="text-xs text-slate-400 text-center py-8">Belum bisa ditampilkan — lengkapi dulu tanggal pertemuan &amp; siswa aktif di atas.</p>`;
    return;
  }

  const kolomTanggal = tanggalList.map(d=>`<th class="px-2 py-2 text-center font-semibold text-slate-600 whitespace-nowrap">${HARI_PENDEK[d.getDay()]}<br>${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}</th>`).join('');
  const baris = anggota.map((s,i)=>`
    <tr class="border-t border-slate-100">
      <td class="px-2 py-2 text-center text-slate-500">${i+1}</td>
      <td class="px-2 py-2">${escapeHtml(s.nama)}</td>
      <td class="px-2 py-2 text-center text-slate-500">${escapeHtml(s.kelas)}</td>
      ${tanggalList.map(()=>'<td class="px-2 py-2"></td>').join('')}
    </tr>`).join('');
  const barisPembina = `
    <tr class="border-t border-slate-100" style="background:rgba(37,99,235,.06)">
      <td class="px-2 py-2 text-center text-slate-500">1</td>
      <td class="px-2 py-2 font-semibold">${escapeHtml(ek.pembina || '-')}</td>
      <td class="px-2 py-2 text-center text-slate-500">Pembina Ekskul</td>
      ${tanggalList.map(()=>'<td class="px-2 py-2"></td>').join('')}
    </tr>`;

  preview.innerHTML = `
    <table class="text-xs" style="min-width:${520 + tanggalList.length*56}px">
      <thead>
        <tr class="bg-slate-50">
          <th class="px-2 py-2 text-center font-semibold text-slate-600">No</th>
          <th class="px-2 py-2 text-left font-semibold text-slate-600">Nama Siswa / Pembina</th>
          <th class="px-2 py-2 text-center font-semibold text-slate-600">Kelas / Peran</th>
          ${kolomTanggal}
        </tr>
      </thead>
      <tbody>${barisPembina}${baris}</tbody>
    </table>
  `;
}

function cetakPresensi(){
  const st = window._presensiState;
  const ek = ekskulById(st.ekskulId);
  const pg = DB.pengaturan;
  if(!ek){ showToast('Pilih ekstrakurikuler terlebih dahulu.', 'error'); return; }

  const tanggalList = tanggalPertemuanBulan(ek.hariJadwal, st.bulan, ek.id);
  const anggota = DB.siswa.filter(s=>s.ekskulIds.includes(ek.id) && s.aktif!==false).sort((a,b)=>a.nama.localeCompare(b.nama,'id'));

  if(tanggalList.length===0){ showToast('Tidak ada tanggal pertemuan pada bulan yang dipilih untuk ekstrakurikuler ini.', 'error'); return; }
  if(anggota.length===0){ showToast('Belum ada siswa aktif pada ekstrakurikuler ini.', 'error'); return; }

  const pctFix4 = 3 + 20 + 9; // No + Nama Siswa/Pembina + Kelas/Peran
  const pctTanggal4 = tanggalList.length ? (100 - pctFix4) / tanggalList.length : 0;
  const kolomTanggal = tanggalList.map(d=>`<th style="width:${pctTanggal4.toFixed(2)}%">${HARI_PENDEK[d.getDay()]}<br>${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}</th>`).join('');
  const baris = anggota.map((s,i)=>`
    <tr>
      <td class="text-center">${i+1}</td>
      <td>${escapeHtml(s.nama)}</td>
      <td class="text-center">${escapeHtml(s.kelas)}</td>
      ${tanggalList.map(()=>'<td>&nbsp;</td>').join('')}
    </tr>`).join('');
  const barisPembina = `
    <tr class="row-pembina">
      <td class="text-center">1</td>
      <td><strong>${escapeHtml(ek.pembina || '-')}</strong></td>
      <td class="text-center">Pembina Ekskul</td>
      ${tanggalList.map(()=>'<td>&nbsp;</td>').join('')}
    </tr>`;

  const w = window.open('', '_blank');
  w.document.write(`
    <html><head><title>Presensi ${escapeHtml(ek.nama)} - ${bulanNama(st.bulan)}</title>
    <style>
      @page{ size: landscape; margin: 14mm; }
      body{font-family:Arial, sans-serif; padding:24px; color:#111;}
      h1{font-size:17px; margin:0;} h2{font-size:14px; margin:14px 0 4px; text-align:justify;}
      h3.section-title{font-size:12.5px; margin:18px 0 6px; padding-top:10px; border-top:1px dashed #ccc; color:#123B78;}
      .header{display:flex; align-items:center; gap:14px; border-bottom:2px solid #123B78; padding-bottom:12px; margin-bottom:12px;}
      .header img{width:50px; height:50px; object-fit:contain;}
      .header > div{text-align:justify;}
      .meta{font-size:11.5px; color:#333; margin-bottom:14px; text-align:justify;}
      .meta span{margin-right:18px;}
      table{width:100%; border-collapse:collapse; font-size:11px; margin-bottom:16px; table-layout:fixed;}
      th,td{border:1px solid #999; padding:6px 5px; text-align:left; word-break:break-word;}
      th{background:#f1f5f9; text-align:center; font-size:10.5px;}
      td.text-center{text-align:center;}
      td:not(.text-center):not(:nth-child(2)){text-align:center;}
      th:nth-child(1), td:nth-child(1){width:3%;}
      th:nth-child(2), td:nth-child(2){width:20%;}
      th:nth-child(3), td:nth-child(3){width:9%;}
      .row-pembina td{background:#EAF1FF; font-weight:600;}
      .ttd{display:flex; justify-content:space-between; margin-top:50px; font-size:12px;}
      .ttd div{text-align:center; width:220px;}
      @media print{ .no-print{display:none;} }
    </style></head>
    <body>
      <div class="header">
        ${pg.logo ? `<img src="${pg.logo}">` : ''}
        <div>
          ${kopHtml(pg)}
          <p style="margin:3px 0 0; font-size:11px;">Tahun Ajaran ${pg.tahunAjaran||'-'}</p>
        </div>
      </div>
      <h2>Lembar Presensi Ekstrakurikuler: ${escapeHtml(ek.nama)}</h2>
      <div class="meta">
        <span><strong>Bulan:</strong> ${bulanNama(st.bulan)}</span>
        <span><strong>Pembina:</strong> ${escapeHtml(ek.pembina)}</span>
        <span><strong>Hari Latihan:</strong> ${ek.hariJadwal.join(' & ')}</span>
        <span><strong>Jumlah Pertemuan:</strong> ${tanggalList.length}x</span>
      </div>

      <h3 class="section-title" style="border-top:none; margin-top:0; padding-top:0;">Presensi Siswa</h3>
      <table>
        <thead>
          <tr><th rowspan="1">No</th><th>Nama Siswa</th><th>Kelas</th>${kolomTanggal}</tr>
        </thead>
        <tbody>
          ${baris}
        </tbody>
      </table>

      <h3 class="section-title">Presensi Pembina / Guru Pengajar</h3>
      <table>
        <thead>
          <tr><th>No</th><th>Nama Pembina</th><th>Peran</th>${kolomTanggal}</tr>
        </thead>
        <tbody>
          ${barisPembina}
        </tbody>
      </table>

      <div class="ttd">
        <div>Mengetahui,<br>Kepala Sekolah<br><br><br><br><strong>${pg.kepalaSekolah||'..........................'}</strong><br>NIP. ${pg.nipKepsek||'-'}</div>
        <div>Karanganyar, ${hariIniDate().toLocaleDateString('id-ID',{day:'numeric',month:'long',year:'numeric'})}<br>Pembina Ekstrakurikuler<br><br><br><br><strong>${ek.pembina||'..........................'}</strong></div>
      </div>
      <p style="font-size:9px; color:#888; margin-top:20px;">Dicetak oleh ${currentUserName()} (${roleLabel(currentRole)}) pada ${waktuIndo(new Date().toISOString())} melalui SIKasapa.</p>
    </body></html>
  `);
  w.document.close();
  catatAktivitas('Cetak Presensi', `${ek.nama} — ${bulanNama(st.bulan)} (${tanggalList.length}x pertemuan)`);
  logCetak('Cetak Presensi', `${ek.nama} — ${bulanNama(st.bulan)} (${tanggalList.length}x pertemuan)`);
  setTimeout(()=>{ w.print(); }, 300);
}

/* =========================================================
   AKTIVASI BULAN & LIBUR (per ekstrakurikuler)
   Menggantikan panel "Hari Libur Ekstra" lama di menu Pengaturan
   (yang global untuk semua ekstra). Sekarang dua hal diatur per
   ekstrakurikuler: bulan mana yang aktif untuk pembayaran bulanan
   (ek.bulanAktif) dan hari libur latihan (ek.hariLibur, dipakai
   tanggalPertemuanBulan() untuk Cetak Presensi & estimasi tunggakan).
   ========================================================= */
const NAMA_BULAN_PENDEK = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];

window._kalenderEkstraState = { ekskulId:'', tahun: hariIniDate().getFullYear(), bulanSedangDiedit:null };

function renderKalenderEkstra(){
  const main = document.getElementById('mainContent');
  const st = window._kalenderEkstraState;
  if(!st.ekskulId || !ekskulById(st.ekskulId)) st.ekskulId = DB.ekskul[0]?.id || '';

  if(DB.ekskul.length===0){
    main.innerHTML = `
      <div class="glass-strong rounded-3xl p-8 text-center max-w-md mx-auto">
        <i data-lucide="calendar-clock" class="w-8 h-8 mx-auto mb-3 text-slate-400"></i>
        <h3 class="font-bold text-base mb-1">Belum Ada Ekstrakurikuler</h3>
        <p class="text-sm text-slate-500">Tambahkan dulu data ekstrakurikuler di menu Data Ekstrakurikuler sebelum mengatur aktivasi bulan & hari libur.</p>
      </div>`;
    return;
  }

  const ek = ekskulById(st.ekskulId);
  const tahun = st.tahun;

  main.innerHTML = `
    <div class="glass-strong rounded-3xl p-6 max-w-3xl stagger mb-5">
      <div class="flex items-start gap-3 mb-5">
        <div class="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style="background:linear-gradient(135deg,var(--blue-600),var(--blue-400));">
          <i data-lucide="calendar-clock" class="w-5 h-5" style="color:#FFFFFF"></i>
        </div>
        <div>
          <h3 class="font-bold text-base">Aktivasi Bulan & Hari Libur</h3>
          <p class="text-xs text-slate-500 mt-0.5">Nonaktifkan bulan yang tidak dipungut iuran (mis. libur semester), dan tandai hari libur latihan — semua diatur per ekstrakurikuler DAN per tahun.</p>
        </div>
      </div>

      <div class="mb-5">
        <label class="text-xs font-medium text-slate-600 mb-1.5 block">Ekstrakurikuler</label>
        <select id="kalenderEkstraEkskul" onchange="updateKalenderEkstraState()" class="input-glass w-full sm:w-80 rounded-xl px-3.5 py-2.5 text-sm">
          ${DB.ekskul.map(e=>`<option value="${e.id}" ${e.id===st.ekskulId?'selected':''}>${escapeHtml(e.nama)}</option>`).join('')}
        </select>
      </div>

      <div class="flex items-center gap-2 mb-2.5">
        <p class="text-xs font-semibold text-slate-500 flex-1">Aktivasi Bulan ${tahun}</p>
        <button onclick="gantiTahunKalenderEkstra(-1)" title="Tahun sebelumnya" class="glass w-7 h-7 rounded-lg flex items-center justify-center text-slate-600"><i data-lucide="chevron-left" class="w-4 h-4"></i></button>
        <button onclick="gantiTahunKalenderEkstra(1)" title="Tahun berikutnya" class="glass w-7 h-7 rounded-lg flex items-center justify-center text-slate-600"><i data-lucide="chevron-right" class="w-4 h-4"></i></button>
      </div>
      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-2">
        ${NAMA_BULAN_PENDEK.map((nama,i)=>{
          const bulan = i+1;
          const periodeKey = tahun + '-' + String(bulan).padStart(2,'0');
          const entri = ek.bulanAktif[periodeKey];
          const nonaktif = entri && entri.aktif === false;
          const sedangEdit = st.bulanSedangDiedit === bulan;
          return `
            <div class="glass rounded-2xl p-3.5 ${nonaktif && !sedangEdit ? 'opacity-90' : ''}">
              <p class="text-xs font-bold text-slate-700 mb-2">${nama}</p>
              ${sedangEdit ? `
                <input id="kalenderAlasanInput" type="text" placeholder="Alasan (mis. Libur Semester)" value="${escapeHtml((entri&&entri.alasan)||'')}" class="input-glass w-full rounded-lg px-2.5 py-1.5 text-xs mb-2">
                <div class="flex gap-1.5">
                  <button onclick="nonaktifkanBulan('${ek.id}', ${bulan})" class="btn-primary flex-1 px-2 py-1.5 rounded-lg text-[11px] font-semibold">Simpan</button>
                  <button onclick="batalEditBulanKalender()" class="glass px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-slate-600">Batal</button>
                </div>
              ` : nonaktif ? `
                <span class="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10.5px] font-bold mb-2" style="background:rgba(217,119,6,0.12); color:#B45309;">
                  <i data-lucide="calendar-x" class="w-3 h-3"></i>${escapeHtml(entri.alasan || 'Nonaktif')}
                </span>
                <button onclick="aktifkanBulan('${ek.id}', ${bulan})" class="glass w-full px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-slate-700">Aktifkan Lagi</button>
              ` : `
                <span class="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10.5px] font-bold mb-2" style="background:rgba(13,148,136,0.12); color:#0D766E;">
                  <i data-lucide="calendar-check" class="w-3 h-3"></i>Aktif
                </span>
                <button onclick="mulaiEditBulanKalender(${bulan})" class="glass w-full px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-slate-700">Nonaktifkan</button>
              `}
            </div>
          `;
        }).join('')}
      </div>
      <p class="text-[11px] text-slate-400">Bulan nonaktif tidak dihitung "belum bayar" pada Tunggakan & Informasi Pembayaran publik — alasannya ikut tertampil ke wali murid. Aktivasi ini terikat ke tahun ${tahun} saja; tahun lain diatur terpisah.</p>
    </div>

    <div class="glass-strong rounded-3xl p-6 max-w-3xl stagger">
      <h3 class="font-bold text-sm mb-1 flex items-center gap-2"><i data-lucide="calendar-off" class="w-4 h-4" style="color:var(--amber-400)"></i>Hari Libur Latihan — ${escapeHtml(ek.nama)}</h3>
      <p class="text-xs text-slate-500 mb-4">Tanggal di sini dikecualikan dari Cetak Presensi & estimasi tunggakan per pertemuan untuk ekstrakurikuler ini saja.</p>
      <div class="grid sm:grid-cols-[auto_1fr_auto] gap-2 mb-4">
        <input id="kalenderLiburTanggal" type="date" class="input-glass rounded-xl px-3.5 py-2.5 text-sm">
        <input id="kalenderLiburKeterangan" type="text" placeholder="Keterangan (mis. Libur Nasional)" class="input-glass rounded-xl px-3.5 py-2.5 text-sm">
        <button onclick="tambahHariLiburEkskul('${ek.id}')" class="btn-primary px-4 py-2.5 rounded-xl text-sm flex items-center justify-center gap-2"><i data-lucide="plus" class="w-4 h-4"></i>Tandai Libur</button>
      </div>
      <div class="divide-y divide-slate-100">
        ${ek.hariLibur.map(h=>`
          <div class="flex items-center gap-3 py-2.5">
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium text-slate-800">${tanggalIndo(h.tanggal)}</p>
              ${h.keterangan ? `<p class="text-xs text-slate-400">${escapeHtml(h.keterangan)}</p>` : ''}
            </div>
            <button onclick="hapusHariLiburEkskul('${ek.id}', '${h.tanggal}')" title="Hapus" aria-label="Hapus hari libur ${tanggalIndo(h.tanggal)}" class="text-slate-500 hover:text-rose-500 p-1.5"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
          </div>
        `).join('') || `<p class="text-sm text-slate-500 text-center py-4">Belum ada hari libur khusus untuk ekstrakurikuler ini.</p>`}
      </div>
    </div>
  `;
  safeIcons();
}

function updateKalenderEkstraState(){
  const st = window._kalenderEkstraState;
  st.ekskulId = document.getElementById('kalenderEkstraEkskul').value;
  st.bulanSedangDiedit = null;
  renderView('kalenderEkstra');
}

/* Dibatasi 2000-2099 supaya tahun tidak bisa "kabur" ke 0/negatif atau
   5 digit kalau tombol ‹ › diklik berkali-kali — di luar rentang itu
   key "YYYY-MM" yang dihasilkan (mis. "0-07" atau "10000-07") akan
   ditolak diam-diam oleh BULAN_AKTIF_KEY_RE di server saat disimpan
   (lihat src/index.js), jadi perubahan yang sempat diklik di UI bisa
   hilang tanpa pesan error yang jelas ke bendahara. */
function gantiTahunKalenderEkstra(delta){
  const st = window._kalenderEkstraState;
  st.tahun = Math.max(2000, Math.min(2099, st.tahun + delta));
  st.bulanSedangDiedit = null;
  renderView('kalenderEkstra');
}

function mulaiEditBulanKalender(bulan){
  window._kalenderEkstraState.bulanSedangDiedit = bulan;
  renderView('kalenderEkstra');
}
function batalEditBulanKalender(){
  window._kalenderEkstraState.bulanSedangDiedit = null;
  renderView('kalenderEkstra');
}

function nonaktifkanBulan(ekskulId, bulan){
  if(!requireEdit()) return;
  const ek = ekskulById(ekskulId);
  if(!ek) return;
  const tahun = window._kalenderEkstraState.tahun;
  const alasan = (document.getElementById('kalenderAlasanInput')?.value || '').trim();
  ek.bulanAktif[tahun + '-' + String(bulan).padStart(2,'0')] = { aktif:false, alasan };
  window._kalenderEkstraState.bulanSedangDiedit = null;
  catatAktivitas('Nonaktifkan Bulan', `${ek.nama} — ${NAMA_BULAN_PENDEK[bulan-1]} ${tahun}${alasan?' ('+alasan+')':''}`);
  saveDB(DB);
  renderView('kalenderEkstra');
}

function aktifkanBulan(ekskulId, bulan){
  if(!requireEdit()) return;
  const ek = ekskulById(ekskulId);
  if(!ek) return;
  const tahun = window._kalenderEkstraState.tahun;
  delete ek.bulanAktif[tahun + '-' + String(bulan).padStart(2,'0')];
  catatAktivitas('Aktifkan Kembali Bulan', `${ek.nama} — ${NAMA_BULAN_PENDEK[bulan-1]} ${tahun}`);
  saveDB(DB);
  renderView('kalenderEkstra');
}

function tambahHariLiburEkskul(ekskulId){
  if(!requireEdit()) return;
  const ek = ekskulById(ekskulId);
  if(!ek) return;
  const tanggal = document.getElementById('kalenderLiburTanggal').value;
  const keterangan = document.getElementById('kalenderLiburKeterangan').value.trim();
  if(!tanggal){ showToast('Pilih tanggal terlebih dahulu.', 'error'); return; }
  if(ek.hariLibur.some(h=>h.tanggal===tanggal)){ showToast('Tanggal ini sudah ditandai libur.', 'error'); return; }
  ek.hariLibur.push({ tanggal, keterangan });
  ek.hariLibur.sort((a,b)=>a.tanggal.localeCompare(b.tanggal));
  catatAktivitas('Tandai Hari Libur Ekstra', `${ek.nama} — ${tanggalIndo(tanggal)}${keterangan?' ('+keterangan+')':''}`);
  saveDB(DB);
  renderView('kalenderEkstra');
}

function hapusHariLiburEkskul(ekskulId, tanggal){
  if(!requireEdit()) return;
  const ek = ekskulById(ekskulId);
  if(!ek) return;
  showConfirm({
    title:'Hapus Hari Libur',
    message: `Tanggal ${tanggalIndo(tanggal)} akan dilepas dari daftar hari libur "${escapeHtml(ek.nama)}". Tindakan ini tidak bisa dibatalkan.`,
    confirmText:'Ya, Hapus', danger:true,
    onConfirm:()=>{
      ek.hariLibur = ek.hariLibur.filter(h=>h.tanggal!==tanggal);
      catatAktivitas('Hapus Hari Libur Ekstra', `${ek.nama} — ${tanggalIndo(tanggal)}`);
      saveDB(DB);
      renderView('kalenderEkstra');
    }
  });
}

/* =========================================================
   LOG AKTIVITAS (AUDIT TRAIL)
   ========================================================= */
let aktivitasFilterAksi = 'all';
let aktivitasFilterQuery = '';
let aktivitasPage = 1;
function setAktivitasPage(p){ aktivitasPage = p; }

function renderLogAktivitas(){
  const main = document.getElementById('mainContent');
  const semuaLog = Array.isArray(DB.aktivitas) ? DB.aktivitas : [];
  const daftarAksi = Array.from(new Set(semuaLog.map(l=>l.aksi))).sort();
  const q = aktivitasFilterQuery.trim().toLowerCase();

  const listAll = semuaLog
    .filter(l => aktivitasFilterAksi==='all' || l.aksi===aktivitasFilterAksi)
    .filter(l => !q || l.user.toLowerCase().includes(q) || (l.detail||'').toLowerCase().includes(q) || l.aksi.toLowerCase().includes(q));
  const pg = paginateList(listAll, aktivitasPage);
  const list = pg.items;

  main.innerHTML = `
    <div class="glass-strong rounded-3xl p-5 mb-5 flex items-start gap-4">
      <div class="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0" style="background:rgba(37,99,235,.12)">
        <i data-lucide="history" class="w-5 h-5" style="color:var(--blue-600)"></i>
      </div>
      <div>
        <p class="font-bold text-sm">${semuaLog.length} catatan aktivitas tersimpan</p>
        <p class="text-xs text-slate-500">Menampilkan maksimal 500 aktivitas terbaru untuk menjaga ukuran data tetap ringan. Log ini mencatat siapa menambah, mengubah, atau menghapus data — kapan, dan apa yang dilakukan.</p>
      </div>
    </div>

    <div class="flex flex-col sm:flex-row sm:items-center gap-3 mb-5">
      <div class="relative flex-1 max-w-sm">
        <i data-lucide="search" class="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2"></i>
        <input id="aktivitasSearchInput" type="text" value="${escapeHtml(aktivitasFilterQuery)}" placeholder="Cari pengguna, aksi, atau detail..." class="input-glass w-full rounded-xl pl-10 pr-3.5 py-2.5 text-sm">
      </div>
      <select id="aktivitasFilterSelect" class="input-glass rounded-xl px-3.5 py-2.5 text-sm w-full sm:w-auto">
        <option value="all" ${aktivitasFilterAksi==='all'?'selected':''}>Semua Jenis Aksi</option>
        ${daftarAksi.map(a=>`<option value="${a}" ${aktivitasFilterAksi===a?'selected':''}>${a}</option>`).join('')}
      </select>
      ${canEdit() ? `<button onclick="bersihkanLogAktivitas()" class="glass px-4 py-2.5 rounded-xl text-sm font-semibold text-rose-600 flex items-center justify-center gap-2 shrink-0"><i data-lucide="trash-2" class="w-4 h-4"></i>Bersihkan Log</button>` : ''}
    </div>

    <div class="glass-strong rounded-3xl overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left text-xs text-slate-500 border-b border-slate-200/80">
              <th class="px-5 py-3 font-medium">Waktu</th>
              <th class="px-5 py-3 font-medium">Pengguna</th>
              <th class="px-5 py-3 font-medium">Peran</th>
              <th class="px-5 py-3 font-medium">Aksi</th>
              <th class="px-5 py-3 font-medium">Detail</th>
            </tr>
          </thead>
          <tbody>
            ${list.map(l => `<tr class="table-row border-b border-slate-100">
                <td class="px-5 py-3 text-slate-600 whitespace-nowrap">${waktuIndo(l.waktu)}</td>
                <td class="px-5 py-3 font-medium">${escapeHtml(l.user)}</td>
                <td class="px-5 py-3"><span class="badge px-2 py-1 rounded-full glass text-slate-600">${roleLabel(l.role)}</span></td>
                <td class="px-5 py-3 text-slate-700">${escapeHtml(l.aksi)}</td>
                <td class="px-5 py-3 text-slate-500 max-w-[280px] truncate" title="${escapeHtml(l.detail||'')}">${escapeHtml(l.detail || '-')}</td>
              </tr>`).join('') || `<tr><td colspan="5" class="text-center py-10 text-slate-500">${semuaLog.length===0 ? 'Belum ada aktivitas tercatat.' : 'Tidak ada aktivitas yang cocok dengan filter.'}</td></tr>`}
          </tbody>
        </table>
      </div>
      ${paginationBar(pg, 'setAktivitasPage', 'aktivitas')}
    </div>
  `;

  const searchEl = document.getElementById('aktivitasSearchInput');
  searchEl.addEventListener('input', (e)=>{
    aktivitasFilterQuery = e.target.value;
    aktivitasPage = 1;
    const pos = e.target.selectionStart;
    renderView('aktivitas');
    const el = document.getElementById('aktivitasSearchInput');
    el.focus();
    el.setSelectionRange(pos, pos);
  });
  document.getElementById('aktivitasFilterSelect').addEventListener('change', (e)=>{
    aktivitasFilterAksi = e.target.value;
    aktivitasPage = 1;
    renderView('aktivitas');
  });
}

function bersihkanLogAktivitas(){
  if(!requireEdit()) return;
  showConfirm({
    title: 'Bersihkan Log Aktivitas',
    message: 'Seluruh riwayat log aktivitas akan dihapus secara permanen. Tindakan ini tidak bisa dibatalkan.',
    confirmText: 'Ya, Bersihkan',
    danger: true,
    onConfirm: ()=>{
      DB.aktivitas = [];
      catatAktivitas('Bersihkan Log Aktivitas', 'Seluruh riwayat log sebelumnya dihapus.');
      saveDB(DB);
      showToast('Log aktivitas berhasil dibersihkan.', 'info');
      renderView('aktivitas');
    }
  });
}

function simpanLogoFile(file){
  if(!requireEdit()) return;
  if(!file.type || !file.type.startsWith('image/')){ showToast('File harus berupa gambar (PNG/JPG).', 'error'); return; }
  const reader = new FileReader();
  reader.onload = async ()=>{
    try{
      DB.pengaturan.logo = await siapkanGambarUntukDisimpan(reader.result, 500);
      saveDB(DB);
      showToast('Logo diperbarui.');
      renderView('pengaturan');
    }catch(err){
      console.error(err);
      showToast(err.message || 'Gagal memproses logo.', 'error');
    }
  };
  reader.readAsDataURL(file);
}

function hapusLogoLaporan(){
  if(!requireEdit()) return;
  DB.pengaturan.logo = null;
  saveDB(DB);
  showToast('Logo dihapus.', 'info');
  renderView('pengaturan');
}

/* =========================================================
   HALAMAN PUBLIK (identitas web yang tampil ke wali murid —
   terpisah dari Kop Laporan yang dipakai untuk cetak/PDF)
   ========================================================= */
function simpanLogoWebFile(file){
  if(!requireEdit()) return;
  if(!file.type || !file.type.startsWith('image/')){ showToast('File harus berupa gambar (PNG/JPG).', 'error'); return; }
  const reader = new FileReader();
  reader.onload = async ()=>{
    try{
      DB.pengaturan.publikLogo = await siapkanGambarUntukDisimpan(reader.result, 500);
      catatAktivitas('Ubah Halaman Publik', 'Logo web diperbarui.');
      saveDB(DB);
      showToast('Logo web diperbarui.');
      renderView('halamanPublik');
    }catch(err){
      console.error(err);
      showToast(err.message || 'Gagal memproses logo web.', 'error');
    }
  };
  reader.readAsDataURL(file);
}

function hapusLogoWeb(){
  if(!requireEdit()) return;
  DB.pengaturan.publikLogo = null;
  catatAktivitas('Ubah Halaman Publik', 'Logo web dihapus.');
  saveDB(DB);
  showToast('Logo web dihapus.', 'info');
  renderView('halamanPublik');
}

/* Ganti placeholder {sekolah} di deskripsi hero dengan nama sekolah asli
   (baris pertama Kop Laporan) — dipakai bersama oleh preview di menu admin
   ini & tampilan asli di renderPublicScreenContent() supaya keduanya selalu
   konsisten. deskripsi KOSONG = pakai kalimat bawaan. */
function susunDeskripsiHeroPublik(deskripsiMentah, namaSekolah){
  const teks = (typeof deskripsiMentah === 'string' && deskripsiMentah.trim())
    ? deskripsiMentah
    : 'Selamat datang Bapak/Ibu Wali Murid {sekolah}. Pilih ekstrakurikuler dan nama putra/putri Anda untuk memeriksa status serta riwayat pembayaran.';
  return teks.split('{sekolah}').join(namaSekolah || 'Sekolah');
}

function updateHalamanPublikPreview(){
  const val = (id, fallback)=>{ const el = document.getElementById(id); return (el ? el.value : fallback) || fallback; };
  const preview = document.getElementById('hpPreview');
  const previewFooter = document.getElementById('hpPreviewFooter');
  if(!preview) return;
  const pg = DB.pengaturan;
  const nama = val('hpNamaWeb', pg.publikNamaWeb) || 'SIKASAPA';
  const tagline = val('hpTagline', pg.publikTagline) || 'Sistem Informasi Keuangan Ekstrakurikuler';
  const logoHtml = pg.publikLogo
    ? `<img src="${pg.publikLogo}" class="w-full h-full object-contain rounded-[10px]">`
    : `<svg width="19" height="19" viewBox="0 0 24 24" fill="none"><path d="M12 3L2 8l10 5 8-4v6" stroke="#FFFFFF" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M6 10.5V16c0 1.4 2.7 3 6 3s6-1.6 6-3v-5.5" stroke="#FFFFFF" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  preview.innerHTML = `
    <div class="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 overflow-hidden" style="background:linear-gradient(135deg,#0E6B58,#14A085)">${logoHtml}</div>
    <div class="min-w-0">
      <p class="font-extrabold text-sm truncate">${escapeHtml(nama)}</p>
      <p class="text-[11px] text-slate-500 truncate">Nama sekolah tampil di sini (dari Kop Laporan)</p>
    </div>`;
  if(previewFooter) previewFooter.textContent = `${nama} — ${tagline}`;

  const eyebrowEl = document.getElementById('hpPreviewEyebrow');
  if(eyebrowEl){
    const namaSekolah = (pg.kopLines && pg.kopLines[0] && pg.kopLines[0].text) ? pg.kopLines[0].text : 'Sekolah';
    eyebrowEl.textContent = val('hpEyebrow', pg.publikEyebrow) || 'Layanan Wali Murid';
    document.getElementById('hpPreviewHeadline').innerHTML =
      `${escapeHtml(val('hpHeadline1', pg.publikHeadline1) || 'Pembayaran')} <span class="text-blue-600">${escapeHtml(val('hpHeadline2', pg.publikHeadline2) || 'Ekstrakurikuler')}</span>`;
    const deskEl = document.getElementById('hpDeskripsi');
    document.getElementById('hpPreviewDesc').textContent = susunDeskripsiHeroPublik(deskEl ? deskEl.value : pg.publikDeskripsi, namaSekolah);
    const chips = [
      val('hpChip1', pg.publikChip1) || 'Data Aman & Resmi Sekolah',
      val('hpChip2', pg.publikChip2) || 'Hasil Real-time',
      val('hpChip3', pg.publikChip3) || 'Tanpa Perlu Aplikasi',
    ];
    document.getElementById('hpPreviewChips').innerHTML = chips.map(c=>
      `<span class="text-[10.5px] font-semibold text-slate-600 bg-white/80 ring-1 ring-slate-200 rounded-full px-2.5 py-1">${escapeHtml(c)}</span>`
    ).join('');
  }
}

function simpanHalamanPublik(){
  if(!requireEdit()) return;
  const namaWeb = document.getElementById('hpNamaWeb').value.trim();
  const tagline = document.getElementById('hpTagline').value.trim();
  const eyebrow = document.getElementById('hpEyebrow').value.trim();
  const headline1 = document.getElementById('hpHeadline1').value.trim();
  const headline2 = document.getElementById('hpHeadline2').value.trim();
  const deskripsi = document.getElementById('hpDeskripsi').value.trim();
  const chip1 = document.getElementById('hpChip1').value.trim();
  const chip2 = document.getElementById('hpChip2').value.trim();
  const chip3 = document.getElementById('hpChip3').value.trim();
  if(!namaWeb){ showToast('Nama web tidak boleh kosong.', 'error'); return; }
  if(!eyebrow || !headline1 || !headline2 || !chip1 || !chip2 || !chip3){
    showToast('Label kecil, judul, dan ke-3 label keunggulan tidak boleh kosong (deskripsi boleh dikosongkan).', 'error');
    return;
  }
  DB.pengaturan.publikNamaWeb = namaWeb;
  DB.pengaturan.publikTagline = tagline;
  DB.pengaturan.publikEyebrow = eyebrow;
  DB.pengaturan.publikHeadline1 = headline1;
  DB.pengaturan.publikHeadline2 = headline2;
  DB.pengaturan.publikDeskripsi = deskripsi;
  DB.pengaturan.publikChip1 = chip1;
  DB.pengaturan.publikChip2 = chip2;
  DB.pengaturan.publikChip3 = chip3;
  catatAktivitas('Ubah Halaman Publik', `Nama web: "${namaWeb}"`);
  saveDB(DB);
  showToast('Pengaturan halaman publik disimpan.');
  renderView('halamanPublik');
}

function renderHalamanPublik(){
  const main = document.getElementById('mainContent');
  if(!canEdit()){
    main.innerHTML = `
      <div class="glass-strong rounded-3xl p-8 text-center max-w-md mx-auto">
        <i data-lucide="lock" class="w-8 h-8 mx-auto mb-3 text-slate-400"></i>
        <h3 class="font-bold text-base mb-1">Akses Terbatas</h3>
        <p class="text-sm text-slate-500">Halaman ini hanya bisa diakses oleh akun Bendahara.</p>
      </div>`;
    return;
  }
  const pg = DB.pengaturan;
  main.innerHTML = `
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <div class="space-y-5">
        <div class="glass-strong rounded-3xl p-6">
          <h3 class="font-bold text-sm mb-1 flex items-center gap-2"><i data-lucide="globe" class="w-4 h-4" style="color:var(--amber-400)"></i>Identitas Web Publik</h3>
          <p class="text-xs text-slate-500 mb-4">Logo, nama, dan tagline ini tampil di header &amp; footer halaman publik yang diakses wali murid (tanpa login) — beda dari "Kop Laporan" yang dipakai khusus untuk cetak/PDF.</p>
          <div class="space-y-4">
            <div>${fieldLabel('Logo Web')}
              <input id="hpLogo" type="file" accept="image/*" class="hidden">
              <div id="hpLogoDropzone" class="cursor-pointer rounded-2xl border-2 border-dashed border-slate-300/80 hover:border-blue-400 bg-white/40 hover:bg-blue-50/40 transition-colors p-4 flex items-center gap-4">
                ${pg.publikLogo ? `
                  <img src="${pg.publikLogo}" class="w-14 h-14 object-contain rounded-xl bg-white ring-1 ring-slate-200/80 p-1.5 shrink-0">
                  <div class="flex-1 min-w-0">
                    <p class="text-sm font-semibold text-slate-700">Logo tersimpan</p>
                    <p class="text-[11px] text-slate-400">Klik atau seret gambar baru untuk mengganti</p>
                  </div>
                  <button onclick="event.stopPropagation(); hapusLogoWeb()" title="Hapus logo web" aria-label="Hapus logo web" class="text-slate-400 hover:text-rose-500 p-1.5 rounded-lg hover:bg-rose-50 shrink-0"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                ` : `
                  <div class="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style="background:rgba(37,99,235,.10)">
                    <i data-lucide="image-plus" class="w-5 h-5" style="color:var(--blue-600)"></i>
                  </div>
                  <div class="flex-1 min-w-0">
                    <p class="text-sm font-semibold text-slate-700">Klik atau seret logo ke sini</p>
                    <p class="text-[11px] text-slate-400">Format PNG atau JPG, disarankan bentuk persegi. Kosongkan untuk pakai ikon bawaan.</p>
                  </div>
                `}
              </div>
            </div>
            <div>${fieldLabel('Nama Web')}
              <input id="hpNamaWeb" type="text" value="${escapeHtml(pg.publikNamaWeb||'')}" maxlength="40" oninput="updateHalamanPublikPreview()" class="input-glass w-full rounded-xl px-3.5 py-2.5 text-sm" placeholder="Contoh: SIKASAPA">
            </div>
            <div>${fieldLabel('Tagline / Deskripsi Singkat')}
              <input id="hpTagline" type="text" value="${escapeHtml(pg.publikTagline||'')}" maxlength="100" oninput="updateHalamanPublikPreview()" class="input-glass w-full rounded-xl px-3.5 py-2.5 text-sm" placeholder="Contoh: Sistem Informasi Keuangan Ekstrakurikuler">
              <p class="text-[11px] text-slate-400 mt-1.5">Ditampilkan di footer halaman publik, di samping nama web.</p>
            </div>
          </div>
        </div>

        <div class="glass-strong rounded-3xl p-6">
          <h3 class="font-bold text-sm mb-1 flex items-center gap-2"><i data-lucide="layout-template" class="w-4 h-4" style="color:var(--amber-400)"></i>Konten Hero (Bagian Atas Halaman Publik)</h3>
          <p class="text-xs text-slate-500 mb-4">Judul, deskripsi, dan 3 label keunggulan yang tampil besar di bagian paling atas halaman publik — sebelumnya teks ini tetap (tidak bisa diubah), sekarang bebas disesuaikan.</p>
          <div class="space-y-4">
            <div>${fieldLabel('Label Kecil (Eyebrow)')}
              <input id="hpEyebrow" type="text" value="${escapeHtml(pg.publikEyebrow||'')}" maxlength="40" oninput="updateHalamanPublikPreview()" class="input-glass w-full rounded-xl px-3.5 py-2.5 text-sm" placeholder="Contoh: Layanan Wali Murid">
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>${fieldLabel('Judul Baris 1')}
                <input id="hpHeadline1" type="text" value="${escapeHtml(pg.publikHeadline1||'')}" maxlength="30" oninput="updateHalamanPublikPreview()" class="input-glass w-full rounded-xl px-3.5 py-2.5 text-sm" placeholder="Pembayaran">
              </div>
              <div>${fieldLabel('Judul Baris 2 (Aksen Warna)')}
                <input id="hpHeadline2" type="text" value="${escapeHtml(pg.publikHeadline2||'')}" maxlength="30" oninput="updateHalamanPublikPreview()" class="input-glass w-full rounded-xl px-3.5 py-2.5 text-sm" placeholder="Ekstrakurikuler">
              </div>
            </div>
            <div>${fieldLabel('Deskripsi Hero')}
              <textarea id="hpDeskripsi" rows="3" maxlength="240" oninput="updateHalamanPublikPreview()" class="input-glass w-full rounded-xl px-3.5 py-2.5 text-sm resize-none" placeholder="Selamat datang Bapak/Ibu Wali Murid {sekolah}. Pilih ekstrakurikuler dan nama putra/putri Anda untuk memeriksa status serta riwayat pembayaran.">${escapeHtml(pg.publikDeskripsi||'')}</textarea>
              <p class="text-[11px] text-slate-400 mt-1.5">Kosongkan untuk pakai kalimat bawaan. Tulis <code class="px-1 py-0.5 rounded bg-slate-100">{sekolah}</code> di mana pun untuk otomatis diganti nama sekolah (dari Kop Laporan).</p>
            </div>
            <div>${fieldLabel('3 Label Keunggulan')}
              <div class="space-y-2">
                <input id="hpChip1" type="text" value="${escapeHtml(pg.publikChip1||'')}" maxlength="40" oninput="updateHalamanPublikPreview()" class="input-glass w-full rounded-xl px-3.5 py-2.5 text-sm" placeholder="Data Aman & Resmi Sekolah">
                <input id="hpChip2" type="text" value="${escapeHtml(pg.publikChip2||'')}" maxlength="40" oninput="updateHalamanPublikPreview()" class="input-glass w-full rounded-xl px-3.5 py-2.5 text-sm" placeholder="Hasil Real-time">
                <input id="hpChip3" type="text" value="${escapeHtml(pg.publikChip3||'')}" maxlength="40" oninput="updateHalamanPublikPreview()" class="input-glass w-full rounded-xl px-3.5 py-2.5 text-sm" placeholder="Tanpa Perlu Aplikasi">
              </div>
              <p class="text-[11px] text-slate-400 mt-1.5">Ikonnya tetap (perisai, petir, ponsel) — hanya teksnya yang bisa diganti.</p>
            </div>
          </div>
        </div>

        <div class="flex justify-end">
          <button onclick="simpanHalamanPublik()" class="btn-primary px-5 py-2.5 rounded-xl text-sm flex items-center gap-2"><i data-lucide="save" class="w-4 h-4"></i>Simpan Semua Perubahan</button>
        </div>
      </div>

      <div class="glass-strong rounded-3xl p-6 lg:sticky lg:top-5 self-start">
        <p class="text-xs font-semibold text-slate-500 mb-3">Pratinjau Header</p>
        <div class="rounded-2xl border border-dashed border-slate-300 bg-white/70 p-4">
          <div id="hpPreview" class="flex items-center gap-3"></div>
        </div>
        <p class="text-xs font-semibold text-slate-500 mb-3 mt-5">Pratinjau Hero</p>
        <div class="rounded-2xl border border-dashed border-slate-300 p-5" style="background:linear-gradient(180deg,#EEF4FF,#FFFFFF)">
          <p id="hpPreviewEyebrow" class="inline-block text-[10px] font-bold uppercase tracking-wider text-blue-700 bg-blue-100/80 rounded-full px-2.5 py-1 mb-2.5"></p>
          <p id="hpPreviewHeadline" class="font-extrabold text-xl leading-tight mb-2"></p>
          <p id="hpPreviewDesc" class="text-xs text-slate-500 leading-relaxed mb-3"></p>
          <div id="hpPreviewChips" class="flex flex-wrap gap-1.5"></div>
        </div>
        <p class="text-xs font-semibold text-slate-500 mb-3 mt-5">Pratinjau Footer</p>
        <div class="rounded-2xl border border-dashed border-slate-300 bg-white/70 p-4">
          <p id="hpPreviewFooter" class="text-xs text-slate-500"></p>
        </div>
        <p class="text-[11px] text-slate-400 mt-4">Nama sekolah yang tampil di bawah logo (bukan "Nama Web") diatur di menu <button onclick="navigate('pengaturan')" class="text-blue-600 font-semibold hover:underline">Pengaturan → Kop Laporan</button>, baris pertama.</p>
      </div>
    </div>
  `;

  const hpLogoInput = document.getElementById('hpLogo');
  const hpLogoZone = document.getElementById('hpLogoDropzone');
  hpLogoZone.addEventListener('click', ()=> hpLogoInput.click());
  hpLogoInput.addEventListener('change', function(e){
    const file = e.target.files[0];
    if(file) simpanLogoWebFile(file);
  });
  ['dragover','dragenter'].forEach(evt=> hpLogoZone.addEventListener(evt, (e)=>{
    e.preventDefault();
    hpLogoZone.classList.add('border-blue-400','bg-blue-50/40');
  }));
  ['dragleave','dragend'].forEach(evt=> hpLogoZone.addEventListener(evt, ()=>{
    hpLogoZone.classList.remove('border-blue-400','bg-blue-50/40');
  }));
  hpLogoZone.addEventListener('drop', (e)=>{
    e.preventDefault();
    hpLogoZone.classList.remove('border-blue-400','bg-blue-50/40');
    const file = e.dataTransfer.files[0];
    if(file) simpanLogoWebFile(file);
  });

  updateHalamanPublikPreview();
}

/* =========================================================
   PENGATURAN
   ========================================================= */
function renderPengaturan(){
  const main = document.getElementById('mainContent');
  if(!canEdit()){
    main.innerHTML = `
      <div class="glass-strong rounded-3xl p-8 text-center max-w-md mx-auto">
        <i data-lucide="lock" class="w-8 h-8 mx-auto mb-3 text-slate-400"></i>
        <h3 class="font-bold text-base mb-1">Akses Terbatas</h3>
        <p class="text-sm text-slate-500">Halaman Pengaturan hanya bisa diakses oleh akun Bendahara.</p>
      </div>`;
    return;
  }
  const pg = DB.pengaturan;
  window._kopEdit = kopLinesSafe(pg).map(l=>({size:l.size||12, bold:!!l.bold}));
  main.innerHTML = `
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <div class="glass-strong rounded-3xl p-6 lg:col-span-2">
        <h3 class="font-bold text-sm mb-4 flex items-center gap-2"><i data-lucide="file-text" class="w-4 h-4" style="color:var(--amber-400)"></i>Kop Laporan</h3>
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div class="space-y-4">
            <div>
              ${fieldLabel('Teks Kop Surat')}
              <textarea id="pgKopText" rows="4" placeholder="Tempel atau ketik teks kop surat, satu baris untuk satu baris teks. Contoh:&#10;PEMERINTAH KABUPATEN KARANGANYAR&#10;DINAS PENDIDIKAN&#10;SDN 01 PAPAHAN&#10;Jl. Papahan, Tasikmadu, Karanganyar, Jawa Tengah" class="input-glass w-full rounded-xl px-3.5 py-2.5 text-sm leading-relaxed">${escapeHtml(kopLinesSafe(pg).map(l=>l.text).join('\n'))}</textarea>
              <p class="text-[11px] text-slate-400 mt-1.5">Cukup tempel/ketik sekali di sini. Ukuran huruf & cetak tebal tiap baris diatur di bawah.</p>
            </div>
            <div>
              <p class="text-xs font-semibold text-slate-500 mb-1.5">Ukuran & Tebal per Baris</p>
              <div id="pgKopStyleRows" class="space-y-2"></div>
            </div>
            <div>${fieldLabel('Tahun Ajaran')}<input id="pgTahunAjaran" type="text" value="${escapeHtml(pg.tahunAjaran)}" class="input-glass w-full rounded-xl px-3.5 py-2.5 text-sm" placeholder="2026/2027"></div>
            <div>${fieldLabel('Logo Laporan')}
              <input id="pgLogo" type="file" accept="image/*" class="hidden">
              <div id="pgLogoDropzone" class="cursor-pointer rounded-2xl border-2 border-dashed border-slate-300/80 hover:border-blue-400 bg-white/40 hover:bg-blue-50/40 transition-colors p-4 flex items-center gap-4">
                ${pg.logo ? `
                  <img src="${pg.logo}" class="w-14 h-14 object-contain rounded-xl bg-white ring-1 ring-slate-200/80 p-1.5 shrink-0">
                  <div class="flex-1 min-w-0">
                    <p class="text-sm font-semibold text-slate-700">Logo tersimpan</p>
                    <p class="text-[11px] text-slate-400">Klik atau seret gambar baru untuk mengganti</p>
                  </div>
                  <button onclick="event.stopPropagation(); hapusLogoLaporan()" title="Hapus logo" aria-label="Hapus logo laporan" class="text-slate-400 hover:text-rose-500 p-1.5 rounded-lg hover:bg-rose-50 shrink-0"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                ` : `
                  <div class="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style="background:rgba(37,99,235,.10)">
                    <i data-lucide="image-plus" class="w-5 h-5" style="color:var(--blue-600)"></i>
                  </div>
                  <div class="flex-1 min-w-0">
                    <p class="text-sm font-semibold text-slate-700">Klik atau seret logo ke sini</p>
                    <p class="text-[11px] text-slate-400">Format PNG atau JPG, disarankan bentuk persegi</p>
                  </div>
                `}
              </div>
            </div>
          </div>
          <div>
            <p class="text-xs font-semibold text-slate-500 mb-1.5">Pratinjau</p>
            <div id="pgKopPreview" class="rounded-xl border border-dashed border-slate-300 bg-white/70 p-4 min-h-[120px]"></div>
          </div>
        </div>
      </div>

      <div class="glass-strong rounded-3xl p-6 lg:col-span-2">
        <form id="formPenanggungJawab" class="space-y-4">
          <div>${fieldLabel('Nama Kepala Sekolah')}<input id="pgKepsek" type="text" value="${escapeHtml(pg.kepalaSekolah)}" class="input-glass w-full rounded-xl px-3.5 py-2.5 text-sm"></div>
          <div>${fieldLabel('NIP Kepala Sekolah')}<input id="pgNipKepsek" type="text" value="${escapeHtml(pg.nipKepsek)}" class="input-glass w-full rounded-xl px-3.5 py-2.5 text-sm"></div>
          <div>${fieldLabel('Nama Bendahara')}<input id="pgBendahara" type="text" value="${escapeHtml(pg.bendahara)}" class="input-glass w-full rounded-xl px-3.5 py-2.5 text-sm"></div>
          <div>${fieldLabel('NIP Bendahara')}<input id="pgNipBendahara" type="text" value="${escapeHtml(pg.nipBendahara)}" class="input-glass w-full rounded-xl px-3.5 py-2.5 text-sm"></div>
        </form>
      </div>

      <div class="glass-strong rounded-3xl p-6">
        <h3 class="font-bold text-sm mb-4 flex items-center gap-2"><i data-lucide="lock" class="w-4 h-4" style="color:var(--amber-400)"></i>Akun Login — Bendahara</h3>
        <form id="formAkun" class="space-y-4">
          <div>${fieldLabel('Username')}<input id="pgUsername" type="text" value="${escapeHtml(pg.username)}" class="input-glass w-full rounded-xl px-3.5 py-2.5 text-sm"></div>
          <div>${fieldLabel('Password Baru (kosongkan jika tidak diubah, min. 6 karakter)')}<input id="pgPassword" type="password" class="input-glass w-full rounded-xl px-3.5 py-2.5 text-sm" placeholder="••••••••"></div>
        </form>
      </div>

      <div class="glass-strong rounded-3xl p-6">
        <h3 class="font-bold text-sm mb-4 flex items-center gap-2"><i data-lucide="shield-check" class="w-4 h-4" style="color:var(--amber-400)"></i>Akun Login — Kepala Sekolah (Lihat Saja)</h3>
        <form id="formAkunKepsek" class="space-y-4">
          <div>${fieldLabel('Nama Kepala Sekolah (untuk log aktivitas)')}<input id="pgNamaKepsekAkun" type="text" value="${escapeHtml(pg.namaKepsekAkun||'')}" class="input-glass w-full rounded-xl px-3.5 py-2.5 text-sm"></div>
          <div>${fieldLabel('Username')}<input id="pgUsernameKepsek" type="text" value="${escapeHtml(pg.usernameKepsek)}" class="input-glass w-full rounded-xl px-3.5 py-2.5 text-sm"></div>
          <div>${fieldLabel('Password Baru (kosongkan jika tidak diubah, min. 6 karakter)')}<input id="pgPasswordKepsek" type="password" class="input-glass w-full rounded-xl px-3.5 py-2.5 text-sm" placeholder="••••••••"></div>
          <p class="text-[11px] text-slate-400">Akun ini hanya bisa melihat data (Dashboard, Laporan, Tunggakan, Log Aktivitas, dll) — tidak bisa menambah, mengubah, atau menghapus data.</p>
        </form>
      </div>

      <div class="glass-strong rounded-3xl p-6 lg:col-span-2">
        <div class="flex items-center justify-between mb-4">
          <h3 class="font-bold text-sm flex items-center gap-2"><i data-lucide="user-cog" class="w-4 h-4" style="color:var(--amber-400)"></i>Akun Login — Guru Ekstrakurikuler</h3>
          <button onclick="openGuruForm()" class="btn-primary px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5"><i data-lucide="plus" class="w-3.5 h-3.5"></i>Tambah Guru</button>
        </div>
        <p class="text-xs text-slate-500 mb-4">Akun ini hanya bisa membuka menu <b>Kelola Absensi</b> — untuk ekstrakurikuler yang ditugaskan ke masing-masing guru saja, dan sama sekali tidak melihat data keuangan.</p>
        <div class="divide-y divide-slate-100">
          ${DB.guru.map(g=>`
            <div class="flex items-center gap-3 py-3 flex-wrap">
              <div class="w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-xs font-bold" style="background:rgba(23,105,209,.10); color:#1769D1">${(g.nama.trim()[0]||'?').toUpperCase()}</div>
              <div class="flex-1 min-w-[160px]">
                <p class="text-sm font-medium text-slate-800">${escapeHtml(g.nama)} ${g.aktif===false?'<span class="text-[10px] text-rose-500 font-semibold">(nonaktif)</span>':''}</p>
                <p class="text-xs text-slate-400">@${escapeHtml(g.username)} · ${(g.ekstraIds||[]).map(id=>ekstraAbsensiById(id)?.nama).filter(Boolean).join(', ') || 'belum ditugaskan ke ekstra mana pun'}</p>
              </div>
              <div class="flex items-center gap-1 shrink-0">
                <button onclick='openGuruForm(${JSON.stringify(g.id)})' title="Edit" aria-label="Edit akun ${escapeHtml(g.nama)}" class="text-slate-500 hover:text-blue-600 p-1.5"><i data-lucide="pencil" class="w-4 h-4"></i></button>
                <button onclick="deleteGuru('${g.id}')" title="Hapus akun" aria-label="Hapus akun ${escapeHtml(g.nama)}" class="text-slate-500 hover:text-rose-500 p-1.5"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
              </div>
            </div>
          `).join('') || `<p class="text-sm text-slate-500 text-center py-4">Belum ada akun guru ekstrakurikuler.</p>`}
        </div>
      </div>

      <div class="glass-strong rounded-3xl p-6">
        <h3 class="font-bold text-sm mb-4 flex items-center gap-2"><i data-lucide="database-backup" class="w-4 h-4" style="color:var(--amber-400)"></i>Backup & Pemulihan Data</h3>
        <p class="text-xs text-slate-500 mb-4">Data utama sudah tersimpan di database Cloudflare D1. Unduh backup .json sesekali sebagai cadangan tambahan, terutama sebelum melakukan perubahan besar.</p>
        <div class="flex flex-col sm:flex-row gap-2">
          <button onclick="exportBackup()" class="btn-primary flex-1 px-4 py-2.5 rounded-xl text-sm flex items-center justify-center gap-2"><i data-lucide="download" class="w-4 h-4"></i>Unduh Backup (.json)</button>
          <button onclick="document.getElementById('importBackupInput').click()" class="glass flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-700 flex items-center justify-center gap-2"><i data-lucide="upload" class="w-4 h-4"></i>Pulihkan dari Backup</button>
          <input id="importBackupInput" type="file" accept="application/json,.json" class="hidden">
        </div>
        <p class="text-[11px] text-slate-400 mt-2.5">Memulihkan backup akan <b>menimpa seluruh data saat ini</b> di database.</p>
      </div>

      <div class="glass-strong rounded-3xl p-6 border border-rose-200/70">
        <h3 class="font-bold text-sm mb-4 flex items-center gap-2" style="color:var(--rose-500)"><i data-lucide="alert-triangle" class="w-4 h-4"></i>Zona Berbahaya</h3>
        <p class="text-xs text-slate-500 mb-4">Menghapus <b>permanen</b> seluruh data Ekstrakurikuler, Siswa, Pemasukan, Pengeluaran, dan Log Aktivitas dari database. Akun login, kop laporan, dan kategori pengeluaran tidak ikut terhapus. Sebaiknya unduh Backup (.json) di atas dulu sebelum melanjutkan.</p>
        <button onclick="resetSemuaData()" class="w-full px-4 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all hover:brightness-110" style="background:linear-gradient(135deg,#E11D48,#BE123C); color:#FFFFFF;"><i data-lucide="trash-2" class="w-4 h-4"></i>Reset Semua Data</button>
      </div>

      <div class="glass-strong rounded-3xl p-6">
        <h3 class="font-bold text-sm mb-4 flex items-center gap-2"><i data-lucide="tags" class="w-4 h-4" style="color:var(--amber-400)"></i>Kategori Pengeluaran</h3>
        <div id="kategoriList" class="flex flex-wrap gap-2 mb-4">
          ${DB.kategoriPengeluaran.map(k=>`<span class="badge px-2.5 py-1.5 rounded-full glass flex items-center gap-1.5">${escapeHtml(k)} <button onclick='hapusKategori(${jsAttr(k)})' title="Hapus kategori" aria-label="Hapus kategori ${escapeHtml(k)}" class="text-slate-500 hover:text-rose-500"><i data-lucide="x" class="w-3 h-3"></i></button></span>`).join('')}
        </div>
        <div class="flex gap-2">
          <input id="kategoriBaru" type="text" placeholder="Tambah kategori baru" class="input-glass flex-1 rounded-xl px-3.5 py-2.5 text-sm">
          <button onclick="tambahKategori()" class="btn-primary px-4 py-2.5 rounded-xl text-sm">Tambah</button>
        </div>
      </div>
    </div>

    <div class="flex justify-end mt-6">
      <button onclick="simpanPengaturan()" class="btn-primary px-6 py-3 rounded-xl text-sm flex items-center gap-2"><i data-lucide="save" class="w-4 h-4"></i>Simpan Semua Pengaturan</button>
    </div>
  `;

  const pgLogoInput = document.getElementById('pgLogo');
  const pgLogoZone = document.getElementById('pgLogoDropzone');
  pgLogoZone.addEventListener('click', ()=> pgLogoInput.click());
  pgLogoInput.addEventListener('change', function(e){
    const file = e.target.files[0];
    if(file) simpanLogoFile(file);
  });
  ['dragover','dragenter'].forEach(evt=> pgLogoZone.addEventListener(evt, (e)=>{
    e.preventDefault();
    pgLogoZone.classList.add('border-blue-400','bg-blue-50/40');
  }));
  ['dragleave','dragend'].forEach(evt=> pgLogoZone.addEventListener(evt, ()=>{
    pgLogoZone.classList.remove('border-blue-400','bg-blue-50/40');
  }));
  pgLogoZone.addEventListener('drop', (e)=>{
    e.preventDefault();
    pgLogoZone.classList.remove('border-blue-400','bg-blue-50/40');
    const file = e.dataTransfer.files[0];
    if(file) simpanLogoFile(file);
  });

  initKopEditor();

  document.getElementById('importBackupInput').addEventListener('change', function(e){
    const file = e.target.files[0];
    if(!file) return;
    importBackup(file);
    e.target.value = '';
  });
}

function exportBackup(){
  if(!requireEdit()) return;
  const payload = {
    _meta: { app:'SIKasapa', exportedAt: new Date().toISOString(), version:1 },
    data: DB
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type:'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const tanggalFile = hariIniStr();
  a.href = url;
  a.download = `sikasapa-backup-${tanggalFile}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  catatAktivitas('Unduh Backup', `sikasapa-backup-${tanggalFile}.json`);
  saveDB(DB);
  showToast('Backup berhasil diunduh.');
}

function importBackup(file){
  if(!requireEdit()) return;
  if(!file || !/\.json$/i.test(file.name)){
    showToast('Pilih file backup berformat .json.', 'error'); return;
  }
  const reader = new FileReader();
  reader.onerror = ()=> showToast('Gagal membaca file backup.', 'error');
  reader.onload = ()=>{
    let parsed;
    try{ parsed = JSON.parse(reader.result); }
    catch(err){ showToast('File backup tidak valid (bukan JSON).', 'error'); return; }
    const candidate = parsed && parsed.data ? parsed.data : parsed;
    const requiredKeys = ['ekskul','siswa','pemasukan','pengeluaran','kategoriPengeluaran','pengaturan'];
    const valid = candidate && typeof candidate === 'object' && requiredKeys.every(k => k in candidate);
    if(!valid){ showToast('Struktur file backup tidak dikenali oleh SIKasapa.', 'error'); return; }
    showConfirm({
      title: 'Pulihkan dari Backup',
      message: 'Memulihkan backup ini akan MENIMPA seluruh data yang ada sekarang di database. Tindakan ini tidak bisa dibatalkan.',
      confirmText: 'Ya, Timpa Data',
      danger: true,
      onConfirm: async ()=>{
        DB = normalizeDB(candidate);
        // PERBAIKAN: dulu pakai saveDB(DB) → RPC save_all(), yang sekarang
        // cuma UPSERT (lihat CATATAN PERBAIKAN BESAR di save_all()) dan
        // TIDAK PERNAH menghapus data yang tidak eksplisit diminta — cocok
        // untuk simpanan normal, tapi SALAH untuk restore backup, yang
        // secara definisi memang harus menghapus data yang dibuat setelah
        // tanggal backup itu. restoreDB() memanggil RPC terpisah,
        // restore_backup(), yang memakai logika hapus-lalu-tulis-ulang
        // — hanya dipanggil di sini, setelah
        // konfirmasi eksplisit dari pengguna di atas.
        //
        // PERBAIKAN: sebelumnya di sini juga dipanggil catatAktivitas()
        // untuk mencatat log "Pulihkan dari Backup" di sisi client SEBELUM
        // restoreDB() — padahal restore_backup() di server SUDAH otomatis
        // menyisipkan satu baris log yang sama (lihat restoreBackup() di
        // src/index.js). Akibatnya log "Pulihkan dari Backup" selalu
        // tercatat DUA KALI. Sekarang ditunggu (await) sampai restore
        // benar-benar tersimpan, baru DB disegarkan langsung dari server
        // (fetchDBFromServer()) — otomatis membawa SATU log yang server
        // buat, sekaligus memastikan tampilan persis sama dengan yang
        // benar-benar tersimpan di database.
        const res = await restoreDB(DB);
        if(res){
          showToast('Data berhasil dipulihkan dari backup.');
          // Guru baru yang dibuat dari backup TIDAK ikut punya password
          // (backup memang tidak pernah menyimpan password_hash) — beri
          // tahu Bendahara akun mana saja yang wajib diset password dulu
          // lewat menu Pengaturan > Akun Guru sebelum guru itu bisa login.
          if(res.guruBelumSetPassword && res.guruBelumSetPassword.length){
            showToast('Akun guru baru dari backup wajib diset password dulu: ' + res.guruBelumSetPassword.join(', '), 'error');
          }
          if(res.guruUsernameBentrok && res.guruUsernameBentrok.length){
            showToast('Sejumlah akun guru dari backup DILEWATI karena username sudah dipakai: ' + res.guruUsernameBentrok.join(', '), 'error');
          }
          await fetchDBFromServer();
        }
        document.getElementById('sidebarUserName').textContent = currentUserName();
        renderNav();
        renderView('pengaturan');
      }
    });
  };
  reader.readAsText(file);
}

function tambahKategori(){
  if(!requireEdit()) return;
  const input = document.getElementById('kategoriBaru');
  const val = input.value.trim();
  if(!val) return;
  if(DB.kategoriPengeluaran.some(k=>k.toLowerCase()===val.toLowerCase())){ showToast('Kategori sudah ada.', 'error'); return; }
  DB.kategoriPengeluaran.push(val);
  catatAktivitas('Tambah Kategori Pengeluaran', val);
  saveDB(DB);
  renderView('pengaturan');
}
function hapusKategori(k){
  if(!requireEdit()) return;
  const dipakai = DB.pengeluaran.some(p=>p.kategori===k);
  const doDelete = ()=>{
    DB.kategoriPengeluaran = DB.kategoriPengeluaran.filter(x=>x!==k);
    tandaiHapus('kategoriPengeluaran', k);
    catatAktivitas('Hapus Kategori Pengeluaran', k);
    saveDB(DB);
    renderView('pengaturan');
  };
  if(dipakai){
    showConfirm({
      title:'Kategori Masih Dipakai',
      message:`Kategori "${escapeHtml(k)}" masih dipakai pada data pengeluaran yang sudah tercatat. Data lama tidak akan berubah, tapi kategori ini tidak akan muncul lagi di pilihan baru. Tetap hapus?`,
      confirmText:'Ya, Hapus', danger:true, onConfirm:doDelete
    });
  } else {
    doDelete();
  }
}

/* =========================================================
   HARI LIBUR EKSTRA — PINDAH ke menu "Aktivasi Bulan & Libur"
   (per ekstrakurikuler, bukan satu daftar global lagi). Lihat
   renderKalenderEkstra(), tambahHariLiburEkskul(), hapusHariLiburEkskul()
   di bagian KALENDER EKSTRA di bawah.
   ========================================================= */

/* =========================================================
   EDITOR KOP SURAT (satu kolom teks, gaya per baris)
   ========================================================= */
function getKopTextLines(){
  const ta = document.getElementById('pgKopText');
  if(!ta) return [];
  const lines = ta.value.replace(/\r\n/g,'\n').split('\n').map(l=>l.replace(/\s+$/,''));
  while(lines.length && lines[lines.length-1].trim()===''){ lines.pop(); }
  return lines;
}

function syncKopEditState(){
  const lines = getKopTextLines();
  if(!window._kopEdit) window._kopEdit = [];
  while(window._kopEdit.length < lines.length) window._kopEdit.push({size:12, bold:false});
  window._kopEdit.length = lines.length;
  return lines;
}

function renderKopEditorUI(){
  const lines = syncKopEditState();
  const wrap = document.getElementById('pgKopStyleRows');
  if(wrap){
    wrap.innerHTML = lines.length ? lines.map((text,i)=>{
      const st = window._kopEdit[i];
      const label = text.trim() ? escapeHtml(text) : '<i>(baris kosong)</i>';
      return `
        <div class="flex items-center gap-2 glass rounded-xl px-3 py-2">
          <span class="text-xs text-slate-600 flex-1 truncate" title="${escapeHtml(text)}">${label}</span>
          <input type="number" min="8" max="36" value="${st.size}" onchange="updateKopLineStyle(${i},'size',this.value)" class="input-glass w-16 rounded-lg px-2 py-1.5 text-xs text-center" title="Ukuran huruf (px)">
          <button type="button" onclick="toggleKopLineBold(${i})" class="w-9 h-9 rounded-lg text-sm font-bold flex items-center justify-center shrink-0 ${st.bold ? 'btn-primary' : 'glass text-slate-500'}" title="Cetak tebal">B</button>
        </div>`;
    }).join('') : `<p class="text-[11px] text-slate-400 italic">Ketik teks kop surat di kolom atas untuk mengatur ukuran & tebal per baris.</p>`;
  }
  updateKopPreview();
}

function updateKopLineStyle(i, key, value){
  if(!window._kopEdit || !window._kopEdit[i]) return;
  window._kopEdit[i][key] = key==='size' ? (parseInt(value,10) || 12) : value;
  updateKopPreview();
}

function toggleKopLineBold(i){
  if(!window._kopEdit || !window._kopEdit[i]) return;
  window._kopEdit[i].bold = !window._kopEdit[i].bold;
  renderKopEditorUI();
}

function updateKopPreview(){
  const lines = getKopTextLines();
  const prev = document.getElementById('pgKopPreview');
  if(!prev) return;
  const tahunInput = document.getElementById('pgTahunAjaran');
  const tahun = tahunInput ? tahunInput.value.trim() : (DB.pengaturan.tahunAjaran||'');
  if(!lines.length){
    prev.innerHTML = `<p class="text-xs text-slate-400 italic">Belum ada teks kop surat.</p>`;
    return;
  }
  const linesHtml = lines.map((text,i)=>{
    const st = (window._kopEdit && window._kopEdit[i]) || {size:12, bold:false};
    return `<div style="margin:1px 0; line-height:1.25; font-family:Arial, sans-serif; font-size:${st.size}px; font-weight:${st.bold?700:400}; color:#0F1E3D;">${text.trim() ? escapeHtml(text) : '&nbsp;'}</div>`;
  }).join('');
  prev.innerHTML = `${linesHtml}<div style="margin-top:5px; font-size:11px; font-family:Arial, sans-serif; color:#334155;">Tahun Ajaran ${escapeHtml(tahun||'-')}</div>`;
}

function initKopEditor(){
  const ta = document.getElementById('pgKopText');
  if(!ta) return;
  ta.addEventListener('input', renderKopEditorUI);
  const tahunInput = document.getElementById('pgTahunAjaran');
  if(tahunInput) tahunInput.addEventListener('input', updateKopPreview);
  renderKopEditorUI();
}

function simpanPengaturan(){
  if(!requireEdit()) return;
  const pg = DB.pengaturan;

  const username = document.getElementById('pgUsername').value.trim();
  const usernameKepsek = document.getElementById('pgUsernameKepsek').value.trim();
  const newPass = document.getElementById('pgPassword').value;
  const newPassKepsek = document.getElementById('pgPasswordKepsek').value;

  if(!username || !usernameKepsek){
    showToast('Username Bendahara dan Kepala Sekolah wajib diisi.', 'error'); return;
  }
  if(username === usernameKepsek){
    showToast('Username Bendahara dan Kepala Sekolah tidak boleh sama.', 'error'); return;
  }
  if(newPass && newPass.length < 6){
    showToast('Password Bendahara baru minimal 6 karakter.', 'error'); return;
  }
  if(newPassKepsek && newPassKepsek.length < 6){
    showToast('Password Kepala Sekolah baru minimal 6 karakter.', 'error'); return;
  }

  const kopTextLines = getKopTextLines();
  pg.kopLines = kopTextLines.map((text,i)=>({
    text,
    size: (window._kopEdit && window._kopEdit[i] && window._kopEdit[i].size) || 12,
    bold: !!(window._kopEdit && window._kopEdit[i] && window._kopEdit[i].bold)
  }));
  if(!pg.kopLines.length) pg.kopLines = [{text:'SDN 01 Papahan', size:14, bold:true}];
  pg.tahunAjaran = document.getElementById('pgTahunAjaran').value.trim();
  pg.kepalaSekolah = document.getElementById('pgKepsek').value.trim();
  pg.nipKepsek = document.getElementById('pgNipKepsek').value.trim();
  pg.bendahara = document.getElementById('pgBendahara').value.trim();
  pg.nipBendahara = document.getElementById('pgNipBendahara').value.trim();
  pg.namaKepsekAkun = document.getElementById('pgNamaKepsekAkun').value.trim();
  pg.username = username;
  pg.usernameKepsek = usernameKepsek;
  if(newPass) pg.password = newPass;
  if(newPassKepsek) pg.passwordKepsek = newPassKepsek;

  catatAktivitas('Ubah Pengaturan', 'Kop laporan / penanggung jawab / akun login diperbarui.');
  saveDB(DB);
  document.getElementById('sidebarUserName').textContent = currentUserName();
  showToast('Pengaturan berhasil disimpan.');
  renderView('pengaturan');
}

/* =========================================================
   AKUN GURU EKSTRAKURIKULER — CRUD (Bendahara saja)
   Password HANYA dikirim ke server saat memang sedang diset/diganti
   (field g.password terisi) — sama seperti pola akun Bendahara/Kepsek
   di atas. Server yang menghitung hash-nya (lihat saveAll() di
   src/index.js), tidak pernah disimpan sebagai teks polos.
   ========================================================= */
function openGuruForm(id){
  if(!requireEdit()) return;
  const g = id ? guruById(id) : null;
  openModal(g ? 'Ubah Akun Guru Ekstra' : 'Tambah Akun Guru Ekstra', `
    <form id="formGuru" class="space-y-4">
      <div>${fieldLabel('Nama Guru')}
        <input id="guNama" type="text" required value="${escapeHtml(g?.nama||'')}" class="input-glass w-full rounded-xl px-3.5 py-2.5 text-sm" placeholder="Nama lengkap guru ekstra">
      </div>
      <div>${fieldLabel('Username')}
        <input id="guUsername" type="text" required value="${escapeHtml(g?.username||'')}" class="input-glass w-full rounded-xl px-3.5 py-2.5 text-sm" placeholder="username login">
      </div>
      <div>${fieldLabel(g ? 'Password Baru (kosongkan jika tidak diubah, min. 6 karakter)' : 'Password (min. 6 karakter)')}
        <input id="guPassword" type="password" class="input-glass w-full rounded-xl px-3.5 py-2.5 text-sm" placeholder="••••••••">
      </div>
      <div>${fieldLabel('Ditugaskan ke Ekstrakurikuler')}
        <div class="flex flex-wrap gap-2">
          ${DB.ekstraAbsensi.map(e=>`<label class="flex items-center gap-1.5 glass px-3 py-1.5 rounded-lg text-xs cursor-pointer">
            <input type="checkbox" value="${e.id}" ${(g?.ekstraIds||[]).includes(e.id)?'checked':''} class="gu-ekstra accent-blue-600"> ${escapeHtml(e.nama)}
          </label>`).join('') || `
          <div class="w-full glass rounded-xl px-3.5 py-3 text-xs text-slate-500 space-y-2">
            <p>Belum ada <b>Jenis Ekstrakurikuler Absensi</b>. Ini daftar terpisah dari "Data Ekstrakurikuler" (menu keuangan) — meski sudah membuat ekskul di sana, guru baru bisa ditugaskan setelah jenisnya juga dibuat di menu <b>Kelola Absensi</b>.</p>
            <button type="button" onclick="closeModal(); renderView('absensi')" class="btn-secondary px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5"><i data-lucide="arrow-right" class="w-3.5 h-3.5"></i>Buka menu Kelola Absensi</button>
          </div>`}
        </div>
      </div>
      ${g ? `<label class="flex items-center gap-2 text-sm"><input id="guAktif" type="checkbox" ${g.aktif!==false?'checked':''} class="accent-blue-600"> Akun aktif (bisa login)</label>` : ''}
    </form>
  `, `
    <button onclick="closeModal()" class="btn-secondary px-4 py-2.5 rounded-xl text-sm">Batal</button>
    <button onclick="submitGuru(${id ? `'${id}'` : 'null'})" class="btn-primary px-4 py-2.5 rounded-xl text-sm flex items-center gap-2"><i data-lucide="check" class="w-4 h-4"></i>Simpan</button>
  `);
}

function submitGuru(id){
  if(!requireEdit()) return;
  const nama = document.getElementById('guNama').value.trim();
  const username = document.getElementById('guUsername').value.trim();
  const password = document.getElementById('guPassword').value;
  const ekstraIds = Array.from(document.querySelectorAll('.gu-ekstra:checked')).map(c=>c.value);
  const aktifEl = document.getElementById('guAktif');
  if(!nama){ markInvalid('guNama','Wajib diisi'); showToast('Nama wajib diisi.', 'error'); return; }
  if(!username){ markInvalid('guUsername','Wajib diisi'); showToast('Username wajib diisi.', 'error'); return; }
  if(!id && !password){ markInvalid('guPassword','Wajib diisi untuk akun baru'); showToast('Password wajib diisi untuk akun baru.', 'error'); return; }
  if(password && password.length < 6){ markInvalid('guPassword','Minimal 6 karakter'); showToast('Password minimal 6 karakter.', 'error'); return; }
  const duplikatUsername = DB.guru.find(g=>g.username.toLowerCase()===username.toLowerCase() && g.id!==id)
    || DB.pengaturan.username?.toLowerCase()===username.toLowerCase()
    || DB.pengaturan.usernameKepsek?.toLowerCase()===username.toLowerCase();
  if(duplikatUsername){ markInvalid('guUsername','Username ini sudah dipakai'); showToast('Username ini sudah dipakai akun lain.', 'error'); return; }

  if(id){
    const g = guruById(id);
    Object.assign(g, { nama, username, ekstraIds, aktif: aktifEl ? aktifEl.checked : true });
    if(password) g.password = password; else delete g.password;
    catatAktivitas('Ubah Akun Guru Ekstra', nama);
  } else {
    DB.guru.push({ id:uid('gu'), nama, username, password, ekstraIds, aktif:true });
    catatAktivitas('Tambah Akun Guru Ekstra', nama);
  }
  saveDB(DB);
  closeModal();
  showToast('Akun guru tersimpan.');
  renderView('pengaturan');
}

function deleteGuru(id){
  if(!requireEdit()) return;
  const nama = guruById(id)?.nama || '-';
  showConfirm({
    title:'Hapus Akun Guru',
    message:`Akun login guru "${escapeHtml(nama)}" akan dihapus permanen. Catatan absensi yang sudah pernah dia isi TETAP tersimpan. Tindakan ini tidak bisa dibatalkan.`,
    confirmText:'Ya, Hapus', danger:true,
    onConfirm:()=>{
      DB.guru = DB.guru.filter(g=>g.id!==id);
      tandaiHapus('guru', id);
      catatAktivitas('Hapus Akun Guru Ekstra', nama);
      saveDB(DB);
      showToast('Akun guru dihapus.', 'info');
      renderView('pengaturan');
    }
  });
}

/* =========================================================
   AUTENTIKASI
   Login diverifikasi di server (Code.gs) terhadap sheet
   Pengaturan (password disimpan dalam bentuk hash, bukan teks
   polos). Server mengeluarkan token acak yang disimpan di
   localStorage perangkat ini dan dikirim ulang di setiap
   permintaan baca/tulis data admin (lihat DATA LAYER di atas).
   ========================================================= */
const LOGIN_LOCK_KEY = 'sikasapa_login_lock';
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_LOCK_MS = 60000; // 1 menit

/* loginAttempts & loginLockedUntil hanya proteksi UX di sisi
   perangkat ini (supaya tidak spam klik) — bukan pengganti rate
   limit di server. */
function loadLoginLockState(){
  try{
    const raw = localStorage.getItem(LOGIN_LOCK_KEY);
    if(!raw) return { attempts:0, lockedUntil:0 };
    const st = JSON.parse(raw);
    return { attempts: st.attempts||0, lockedUntil: st.lockedUntil||0 };
  }catch(e){ return { attempts:0, lockedUntil:0 }; }
}
function saveLoginLockState(){
  try{ localStorage.setItem(LOGIN_LOCK_KEY, JSON.stringify({ attempts:loginAttempts, lockedUntil:loginLockedUntil })); }
  catch(e){}
}
const _loginLockInit = loadLoginLockState();
let loginAttempts = _loginLockInit.attempts;
let loginLockedUntil = _loginLockInit.lockedUntil;

/* =========================================================
   HALAMAN PUBLIK — Wali Murid cek info pembayaran (tanpa login)
   ========================================================= */
function renderPublicScreenContent(){
  document.getElementById('publicFooterYear').textContent = hariIniDate().getFullYear();
  const pg = DB.pengaturan || {};
  const namaSekolah = (pg.kopLines && pg.kopLines[0] && pg.kopLines[0].text) ? pg.kopLines[0].text : 'Sekolah';
  document.getElementById('publicSchoolLine').textContent = namaSekolah;

  // Konten hero (eyebrow, judul 2 baris, deskripsi, 3 label keunggulan) —
  // semuanya diatur di menu admin Halaman Publik, lihat renderHalamanPublik()
  // & susunDeskripsiHeroPublik(). Ikon ke-3 label keunggulan tetap (fixed di
  // HTML), cuma teksnya yang dari pengaturan.
  document.getElementById('publicEyebrow').textContent = pg.publikEyebrow || 'Layanan Wali Murid';
  document.getElementById('publicHeadline1').textContent = (pg.publikHeadline1 || 'Pembayaran') + '';
  document.getElementById('publicHeadline2').textContent = pg.publikHeadline2 || 'Ekstrakurikuler';
  document.getElementById('publicHeroDesc').textContent = susunDeskripsiHeroPublik(pg.publikDeskripsi, namaSekolah);
  document.getElementById('publicChip1').textContent = pg.publikChip1 || 'Data Aman & Resmi Sekolah';
  document.getElementById('publicChip2').textContent = pg.publikChip2 || 'Hasil Real-time';
  document.getElementById('publicChip3').textContent = pg.publikChip3 || 'Tanpa Perlu Aplikasi';

  // Identitas web publik (logo, nama, tagline) — diatur di menu admin Halaman Publik.
  const namaWeb = pg.publikNamaWeb || 'SIKASAPA';
  const tagline = pg.publikTagline || 'Sistem Informasi Keuangan Ekstrakurikuler';
  document.getElementById('publicBrandName').textContent = namaWeb;
  document.getElementById('publicFooterBrand').textContent = `${namaWeb} — ${tagline}`;
  const crest = document.getElementById('publicCrest');
  crest.innerHTML = pg.publikLogo
    ? `<img src="${pg.publikLogo}" class="w-full h-full object-contain rounded-[10px]">`
    : `<svg width="19" height="19" viewBox="0 0 24 24" fill="none"><path d="M12 3L2 8l10 5 8-4v6" stroke="#FFFFFF" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M6 10.5V16c0 1.4 2.7 3 6 3s6-1.6 6-3v-5.5" stroke="#FFFFFF" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

  // Daftar ekstrakurikuler yang tersedia — mengisi ruang kosong di samping
  // teks hero (kolom kiri lebar di layar besar sebelumnya kosong di bawah
  // label keunggulan) SEKALIGUS berguna: wali murid langsung tahu pilihan
  // ekstrakurikuler yang ada tanpa perlu buka dropdown dulu.
  const daftarEkEl = document.getElementById('publicDaftarEkskul');
  if(daftarEkEl){
    const daftar = DB.ekskul || [];
    daftarEkEl.innerHTML = daftar.length ? daftar.map(e=>
      `<span class="pub-ekskul-pill" style="--dot:${e.warna||'#1769D1'}">${escapeHtml(e.nama)}</span>`
    ).join('') : '';
    daftarEkEl.parentElement.classList.toggle('hidden', !daftar.length);
  }

  renderPublicEkskulOptions();
  resetPencarianPublik();
}

function renderPublicEkskulOptions(){
  const sel = document.getElementById('publicEkskulSelect');
  const daftar = DB.ekskul || [];
  sel.innerHTML = daftar.map(e=>`<option value="${e.id}">${escapeHtml(e.nama)}</option>`).join('');
  onPublicEkskulChange();
}

function onPublicEkskulChange(){
  const ekskulId = document.getElementById('publicEkskulSelect').value;
  const sel = document.getElementById('publicSiswaSelect');
  const daftarSiswa = (DB.siswa || []).filter(s=> s.aktif!==false && (s.ekskulIds||[]).includes(ekskulId)).sort((a,b)=>a.nama.localeCompare(b.nama));
  if(!daftarSiswa.length){
    sel.innerHTML = `<option value="">Belum ada siswa terdaftar</option>`;
    return;
  }
  sel.innerHTML = daftarSiswa.map(s=>`<option value="${s.id}">${escapeHtml(s.nama)} — Kelas ${escapeHtml(s.kelas)}</option>`).join('');
}

function resetPencarianPublik(){
  document.getElementById('publicResultSection').classList.add('hidden');
  document.getElementById('publicResultCard').innerHTML = '';
  document.getElementById('publicSearchError').classList.add('hidden');
  window.scrollTo({top:0, behavior:'smooth'});
}

async function cariInfoPembayaranPublik(){
  const errEl = document.getElementById('publicSearchError');
  errEl.classList.add('hidden');
  const ekskulId = document.getElementById('publicEkskulSelect').value;
  const siswaId = document.getElementById('publicSiswaSelect').value;
  const ek = ekskulById(ekskulId);
  const sw = siswaById(siswaId);
  if(!ek || !sw){
    errEl.textContent = 'Silakan pilih ekstrakurikuler dan nama siswa terlebih dahulu.';
    errEl.classList.remove('hidden');
    return;
  }

  const btn = document.getElementById('publicSearchBtn');
  if(btn){ btn.disabled = true; btn.style.opacity = '.6'; }

  let riwayat = [];
  try{
    const json = await rpc('get_public_riwayat', { p_siswa_id: sw.id, p_ekskul_id: ek.id });
    if(json.ok) riwayat = json.riwayat || [];
    else { errEl.textContent = json.error || 'Gagal mengambil data dari server.'; errEl.classList.remove('hidden'); if(btn){btn.disabled=false; btn.style.opacity='1';} return; }
  }catch(err){
    console.error(err);
    errEl.textContent = 'Tidak bisa terhubung ke server. Periksa koneksi internet.';
    errEl.classList.remove('hidden');
    if(btn){ btn.disabled = false; btn.style.opacity = '1'; }
    return;
  }
  if(btn){ btn.disabled = false; btn.style.opacity = '1'; }
  riwayat.sort((a,b)=> (b.tanggalBayar||'').localeCompare(a.tanggalBayar||''));

  const jenisBulanan = ek.jenisPembayaran === 'bulanan';
  const labelSatuan = jenisBulanan ? 'bulan' : 'pertemuan';
  const initial = (sw.nama.trim()[0] || '?').toUpperCase();
  const jadwal = (ek.hariJadwal||[]).join(' & ') || '-';

  let html;

  if(jenisBulanan){
    /* Untuk ekstra bulanan: tidak ada lagi nominal/total rupiah yang
       tertampil ke publik — hanya grid 12 bulan berstempel Lunas/Belum/
       alasan libur, dihitung dari ek.bulanAktif (nonaktif = tidak
       dihitung lunas/belum sama sekali, tapi alasannya tetap tertampil
       supaya wali murid tahu kenapa bulan itu tidak ditagih). */
    const tahun = hariIniDate().getFullYear();
    let totalLunas = 0, totalBelum = 0;
    const selBulan = [];
    for(let bulanKe=1; bulanKe<=12; bulanKe++){
      const periodeKey = tahun + '-' + String(bulanKe).padStart(2,'0');
      const entriNonaktif = ek.bulanAktif[periodeKey];
      const nonaktif = entriNonaktif && entriNonaktif.aktif === false;
      let stampClass, stampLabel, keterangan = '';
      if(nonaktif){
        stampClass = 'holiday'; stampLabel = 'Libur';
        keterangan = entriNonaktif.alasan || 'Bulan ini tidak aktif';
      } else if(riwayat.some(p=>p.periode===periodeKey)){
        stampClass = 'paid'; stampLabel = 'Sudah Dibayar'; totalLunas++;
      } else {
        stampClass = 'unpaid'; stampLabel = 'Belum Dibayar'; totalBelum++;
      }
      selBulan.push(`
        <div class="pub-month-cell">
          <p class="pub-month-name">${NAMA_BULAN_PENDEK[bulanKe-1]} ${tahun}</p>
          <span class="pub-month-stamp ${stampClass}">${stampLabel}</span>
          ${keterangan ? `<p class="pub-month-note">${escapeHtml(keterangan)}</p>` : ''}
        </div>
      `);
    }

    html = `
      <div class="pub-receipt pub-glass-strong pub-anim">
        <div class="pub-receipt-head">
          <div style="display:flex; align-items:center; gap:14px;">
            <div class="pub-avatar">${escapeHtml(initial)}</div>
            <div>
              <p class="pub-student-name">${escapeHtml(sw.nama)}</p>
              <div class="pub-tag-row">
                <span class="pub-tag">Kelas ${escapeHtml(sw.kelas)}</span>
                <span class="pub-tag-pill">${escapeHtml(ek.nama)}</span>
                <span class="pub-tag-pill">Bulanan</span>
              </div>
            </div>
          </div>
          ${totalLunas
            ? `<span class="pub-stamp"><span class="pub-stamp-dot"></span>${totalLunas} BULAN LUNAS</span>`
            : `<span class="pub-stamp pub-stamp-muted"><span class="pub-stamp-dot"></span>BELUM ADA PEMBAYARAN</span>`}
        </div>

        <div class="pub-summary">
          <div>
            <p class="pub-summary-label">Bulan Lunas</p>
            <p class="pub-summary-value pub-accent">${totalLunas} bulan</p>
          </div>
          <div>
            <p class="pub-summary-label">Belum Dibayar</p>
            <p class="pub-summary-value">${totalBelum} bulan</p>
          </div>
          <div>
            <p class="pub-summary-label">Jadwal Latihan</p>
            <p class="pub-summary-value" style="font-size:14px;">${escapeHtml(jadwal)}</p>
          </div>
        </div>

        <p class="pub-history-title">Status Pembayaran ${tahun}</p>
        <div class="pub-month-grid">${selBulan.join('')}</div>
      </div>
    `;
  } else {
    /* Ekstra per pertemuan: konsepnya beda (per tanggal hadir, bukan
       per bulan), jadi grid bulan tidak dipakai — cukup hilangkan
       nominal dari tiap baris riwayat & dari ringkasan. */
    html = `
      <div class="pub-receipt pub-glass-strong pub-anim">
        <div class="pub-receipt-head">
          <div style="display:flex; align-items:center; gap:14px;">
            <div class="pub-avatar">${escapeHtml(initial)}</div>
            <div>
              <p class="pub-student-name">${escapeHtml(sw.nama)}</p>
              <div class="pub-tag-row">
                <span class="pub-tag">Kelas ${escapeHtml(sw.kelas)}</span>
                <span class="pub-tag-pill">${escapeHtml(ek.nama)}</span>
                <span class="pub-tag-pill">Per Pertemuan</span>
              </div>
            </div>
          </div>
          ${riwayat.length
            ? `<span class="pub-stamp"><span class="pub-stamp-dot"></span>${riwayat.length} PERTEMUAN LUNAS</span>`
            : `<span class="pub-stamp pub-stamp-muted"><span class="pub-stamp-dot"></span>BELUM ADA PEMBAYARAN</span>`}
        </div>

        <div class="pub-summary">
          <div>
            <p class="pub-summary-label">Kehadiran</p>
            <p class="pub-summary-value pub-accent">${riwayat.length} ${labelSatuan}</p>
          </div>
          <div>
            <p class="pub-summary-label">Jadwal Latihan</p>
            <p class="pub-summary-value" style="font-size:14px;">${escapeHtml(jadwal)}</p>
          </div>
        </div>

        <div>
          <p class="pub-history-title">Riwayat Kehadiran</p>
          ${riwayat.length ? riwayat.map(p=>`
            <div class="pub-txn">
              <div style="display:flex; align-items:center; gap:12px; min-width:0;">
                <span class="pub-txn-check">✓</span>
                <div style="min-width:0;">
                  <p class="pub-txn-date">${tanggalIndo(p.periode)}</p>
                  <p class="pub-txn-sub">Dibayar ${tanggalIndo(p.tanggalBayar)}</p>
                </div>
              </div>
              <p class="pub-txn-amount"><span>LUNAS</span></p>
            </div>
          `).join('') : `<p class="pub-empty">Belum ada riwayat pembayaran untuk ekstrakurikuler ini.</p>`}
        </div>
      </div>
    `;
  }

  document.getElementById('publicResultCard').innerHTML = html;
  document.getElementById('publicResultSection').classList.remove('hidden');
  setTimeout(()=>{
    document.getElementById('publicResultSection').scrollIntoView({behavior:'smooth', block:'start'});
  }, 60);
}

async function handleLoginSubmit(e){
  e.preventDefault();
  const errEl = document.getElementById('loginError');
  const btn = document.querySelector('#formLogin button[type=submit]');

  if(Date.now() < loginLockedUntil){
    const sisa = Math.ceil((loginLockedUntil - Date.now())/1000);
    errEl.textContent = `Terlalu banyak percobaan gagal. Coba lagi dalam ${sisa} detik.`;
    errEl.classList.remove('hidden');
    return;
  }

  const u = document.getElementById('loginUsername').value.trim();
  const p = document.getElementById('loginPassword').value;
  errEl.classList.add('hidden');
  if(btn){ btn.disabled = true; btn.style.opacity = '.6'; }

  let json;
  try{
    json = await rpc('login', { p_username:u, p_password:p });
  }catch(err){
    console.error(err);
    errEl.textContent = 'Tidak bisa terhubung ke server. Periksa koneksi internet, lalu muat ulang halaman.';
    errEl.classList.remove('hidden');
    if(btn){ btn.disabled = false; btn.style.opacity = '1'; }
    return;
  }
  if(btn){ btn.disabled = false; btn.style.opacity = '1'; }

  if(json && json.ok){
    loginAttempts = 0;
    loginLockedUntil = 0;
    saveLoginLockState();
    setSession({ role: json.role, token: json.token, nama: json.nama || '', loginAt: new Date().toISOString() });
    document.getElementById('formLogin').reset();
    window.location.href = 'admin.html';
  } else {
    loginAttempts++;
    if(loginAttempts >= MAX_LOGIN_ATTEMPTS){
      loginLockedUntil = Date.now() + LOGIN_LOCK_MS;
      loginAttempts = 0;
      errEl.textContent = `Terlalu banyak percobaan gagal. Coba lagi dalam ${LOGIN_LOCK_MS/1000} detik.`;
    } else {
      errEl.textContent = (json && json.error) ? json.error : 'Username atau password salah.';
    }
    saveLoginLockState();
    errEl.classList.remove('hidden');
  }
}

function logout(){
  showConfirm({
    title: 'Keluar dari SIKasapa',
    message: 'Anda akan keluar dari sesi ini dan perlu login kembali untuk mengakses aplikasi.',
    confirmText: 'Ya, Keluar',
    onConfirm: ()=>{
      const token = getToken();
      rpc('logout', { p_token: token }).catch(()=>{});
      clearSession();
      window.location.href = 'index.html';
    }
  });
}

/* =========================================================
   PENANGANAN ERROR GLOBAL
   Menangkap error JS tak terduga supaya aplikasi tidak "diam saja"
   dan pengguna tahu ada yang salah, alih-alih layar putih/kosong.
   ========================================================= */
window.addEventListener('error', function(e){
  console.error('Kesalahan tak terduga:', e.error || e.message);
  try{ showToast('Terjadi kesalahan tak terduga. Coba muat ulang halaman.', 'error'); }catch(_){}
});
window.addEventListener('unhandledrejection', function(e){
  console.error('Kesalahan proses (promise):', e.reason);
  try{ showToast('Terjadi kesalahan saat memproses data.', 'error'); }catch(_){}
});

function safeIcons(){ try{ if(typeof lucide !== 'undefined') lucide.createIcons(); }catch(e){} }

/* =========================================================
   INISIALISASI PER HALAMAN
   Tiga file terpisah (index.html, login.html, admin.html)
   memuat script_core.js yang sama, tapi masing-masing hanya
   memanggil salah satu fungsi init di bawah ini.
   ========================================================= */

/* ---- index.html : tidak perlu login ---- */
async function initPublicPage(){
  safeIcons();
  const ok = await fetchPublicDB();
  if(!ok){
    document.getElementById('publicScreen').innerHTML =
      '<div class="p-10 text-center text-sm text-slate-500">Gagal memuat data dari server. Periksa koneksi internet, lalu muat ulang halaman.</div>';
    return;
  }
  renderPublicScreenContent();
}

/* ---- login.html ---- */
function initLoginPage(){
  safeIcons();
  document.getElementById('formLogin').addEventListener('submit', handleLoginSubmit);
  setTimeout(()=>document.getElementById('loginUsername')?.focus(), 50);
  // Sudah login & token masih ada -> langsung ke admin.
  if(getToken()){ window.location.href = 'admin.html'; return; }
  // Tampilkan form login (disembunyikan dulu di HTML agar tidak "berkedip"
  // sebelum pengecekan token di atas selesai).
  document.getElementById('loginScreen').style.display = '';
}

/* ---- admin.html : wajib token valid ---- */
async function initAdminPage(){
  safeIcons();
  document.getElementById('topbarDate').textContent = hariIniDate().toLocaleDateString('id-ID',{weekday:'long', day:'numeric', month:'long', year:'numeric'});
  const sess = getSession();
  if(!sess || !sess.token){ window.location.href = 'login.html'; return; }
  currentRole = sess.role;
  currentGuruNama = sess.nama || '';

  const res = await fetchDBFromServer();
  if(!res.ok){
    if(res.invalidSession){
      // Sesi memang tidak valid/kedaluwarsa menurut server -> login ulang.
      clearSession();
      window.location.href = 'login.html';
    } else {
      // Gagal konek ke server (bukan sesi tidak valid) — JANGAN hapus
      // sesi yang mungkin masih sah, cukup beri tahu & biarkan pengguna
      // memuat ulang setelah koneksi pulih (sama seperti pola di
      // saveDB()/restoreDB()).
      showToast('Tidak bisa terhubung ke server. Periksa koneksi internet, lalu muat ulang halaman.', 'error');
    }
    return;
  }

  document.getElementById('sidebarUserName').textContent = currentUserName();
  document.getElementById('sidebarUserRole').textContent = roleLabel(currentRole);
  document.getElementById('sidebarUserAvatar').textContent = (currentUserName().trim()[0] || (currentRole==='kepsek'?'K':(currentRole==='guru'?'G':'B'))).toUpperCase();
  renderNav();
  // Guru ekstra cuma punya menu "Kelola Absensi" — arahkan ke situ,
  // bukan ke dashboard yang memang tidak ada di menunya.
  const menuAwal = menusForRole()[0];
  navigate(menuAwal ? menuAwal.id : 'dashboard');
  // Tampilkan aplikasi (disembunyikan dulu di HTML agar tidak "berkedip"
  // sebelum data & sesi selesai divalidasi di atas).
  document.getElementById('app').style.display = '';
}
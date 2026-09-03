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
      { id:'sw1', nama:'Ahmad Rizki', kelas:'V A', ekskulIds:['ek1','ek2'], aktif:true },
      { id:'sw2', nama:'Bunga Citra', kelas:'IV B', ekskulIds:['ek3'], aktif:true },
      { id:'sw3', nama:'Candra Kirana', kelas:'VI A', ekskulIds:['ek1','ek4'], aktif:true },
      { id:'sw4', nama:'Dewi Anggraini', kelas:'V B', ekskulIds:['ek2'], aktif:true },
      { id:'sw5', nama:'Eko Prasetyo', kelas:'IV A', ekskulIds:['ek4'], aktif:true },
      { id:'sw6', nama:'Fitri Handayani', kelas:'VI B', ekskulIds:['ek3','ek2'], aktif:true },
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
    // PERBAIKAN: daftar id yang HARUS dihapus di server saat saveDB()
    // berikutnya — lihat tandaiHapus() & CATATAN PERBAIKAN BESAR di
    // save_all() (supabase-schema.sql). save_all() sekarang cuma UPSERT
    // dari array ekskul/siswa/pemasukan/dst di atas (tidak pernah
    // menghapus baris hanya karena baris itu tidak ada di array), supaya
    // salinan lokal yang basi (tab lama, sesi lain) tidak bisa diam-diam
    // menghapus balik data yang ditambahkan sesi lain. Penghapusan yang
    // BENAR-BENAR dimaksud pengguna (klik "Hapus") harus didaftarkan di
    // sini secara eksplisit supaya tetap tersampaikan ke server.
    hapus: { ekskul:[], siswa:[], pemasukan:[], pengeluaran:[], kategoriPengeluaran:[] },
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
      publikNamaWeb:'SIKAPASA',
      publikLogo:null,
      publikTagline:'Sistem Informasi Keuangan Ekstrakurikuler',
      nomorLaporanCounter:{},
      nomorKwitansiCounter:{}
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
  if(typeof pg.publikNamaWeb !== 'string' || !pg.publikNamaWeb) pg.publikNamaWeb = 'SIKAPASA';
  if(typeof pg.publikTagline !== 'string') pg.publikTagline = 'Sistem Informasi Keuangan Ekstrakurikuler';
  if(typeof pg.publikLogo !== 'string') pg.publikLogo = null;
  /* Nomor urut untuk dokumen resmi (Laporan & Kwitansi), disimpan per tahun
     supaya nomornya reset ke 001 tiap tahun ajaran baru tapi tetap urut
     (tidak pernah "001" berulang-ulang) selama tahun berjalan. Sebelumnya
     nomor laporan hardcode "001" untuk setiap kali cetak — diperbaiki di sini. */
  if(!pg.nomorLaporanCounter || typeof pg.nomorLaporanCounter !== 'object') pg.nomorLaporanCounter = {};
  if(!pg.nomorKwitansiCounter || typeof pg.nomorKwitansiCounter !== 'object') pg.nomorKwitansiCounter = {};
  if(!Array.isArray(db.ekskul)) db.ekskul = [];
  if(!Array.isArray(db.siswa)) db.siswa = [];
  db.siswa.forEach(s=>{
    if(typeof s.waliNama !== 'string') s.waliNama = '';
    if(typeof s.waliHp !== 'string') s.waliHp = '';
    if(typeof s.aktif !== 'boolean') s.aktif = true;
  });
  if(!Array.isArray(db.pemasukan)) db.pemasukan = [];
  if(!Array.isArray(db.pengeluaran)) db.pengeluaran = [];
  if(!Array.isArray(db.kategoriPengeluaran)) db.kategoriPengeluaran = [];
  /* Backup lama / data langsung dari get_app_data() tidak punya field
     hapus sama sekali (server tidak pernah mengirimkannya balik — itu
     murni penanda sisi klien) — selalu inisialisasi supaya tandaiHapus()
     & saveDB() aman dipanggil kapan pun. */
  if(!db.hapus || typeof db.hapus !== 'object') db.hapus = {};
  ['ekskul','siswa','pemasukan','pengeluaran','kategoriPengeluaran'].forEach(k=>{
    if(!Array.isArray(db.hapus[k])) db.hapus[k] = [];
  });
  return db;
}

/* Menandai 1 id sebagai "harus dihapus di server" pada saveDB() berikutnya
   — lihat CATATAN PERBAIKAN BESAR di save_all() (supabase-schema.sql).
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

/* Dipanggil oleh halaman admin (admin.html) — butuh token valid. */
async function fetchDBFromServer(){
  try{
    const json = await rpc('get_app_data', { p_token: getToken()||'' });
    if(json.ok){ DB = normalizeDB(json.db); return true; }
    return false;
  }catch(e){ console.error(e); return false; }
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
   PERBAIKAN: save_all() di server sekarang UPSERT-saja per baris (lihat
   CATATAN PERBAIKAN BESAR di supabase-schema.sql) — TIDAK PERNAH lagi
   menghapus data hanya karena data itu tidak ada di array DB yang
   dikirim. Penghapusan yang benar-benar dimaksud pengguna dikirim lewat
   DB.hapus (lihat tandaiHapus()), yang otomatis ikut terkirim di sini
   karena bagian dari objek db yang sama. */
function saveDB(db){
  try{
    const token = getToken();
    rpc('save_all', { p_token: token, p_data: db })
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
   (supabase-schema.sql) dan di pemanggil importBackup() di atas. */
function restoreDB(db){
  try{
    const token = getToken();
    rpc('restore_backup', { p_token: token, p_data: db })
      .then(res=>{
        if(!res || !res.ok){
          showToast('Gagal memulihkan backup ke database: ' + (res && res.error ? res.error : 'tidak diketahui'), 'error');
        }
      })
      .catch(err=>{
        console.error('Gagal memulihkan backup ke server:', err);
        showToast('Tidak bisa terhubung ke server. Periksa koneksi internet.', 'error');
      });
    return true;
  }catch(e){
    console.error('Gagal memulihkan backup:', e);
    showToast('Gagal memulihkan backup.', 'error');
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
   catat_log_cetak — lihat supabase-schema.sql) yang: (a) atomik
   (increment dilakukan lewat satu statement UPDATE, dikunci
   Postgres per baris, jadi aman dipanggil bersamaan dari tab mana
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
/* Sumber tunggal untuk "hari ini" di seluruh aplikasi — dulu beberapa
   fungsi memakai tanggal hardcode (sisa saat development/testing), yang
   menyebabkan fitur seperti Tunggakan, grafik tren, dan nomor laporan
   "beku" di satu tanggal tertentu. Sekarang semua mengacu ke sini. */
function hariIniDate(){ return new Date(); }
function hariIniStr(){ return hariIniDate().toISOString().slice(0,10); }
function tanggalFileNow(){ return hariIniStr(); }
/* Ekspor CSV generik: rows = array-of-array, baris pertama dianggap header.
   Diberi BOM UTF-8 agar karakter non-ASCII tampil benar saat dibuka di Excel. */
function csvEscape(v){
  const s = String(v==null?'':v);
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
let currentRole = 'bendahara'; // 'bendahara' (penuh) atau 'kepsek' (hanya lihat)

function canEdit(){ return currentRole === 'bendahara'; }

function roleLabel(role){ return role === 'kepsek' ? 'Kepala Sekolah' : 'Bendahara Sekolah'; }

function currentUserName(){
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
  { id:'ekskul', label:'Data Ekstrakurikuler', icon:'shapes', subtitle:'Kelola jenis, tarif, dan jadwal ekstrakurikuler' },
  { id:'siswa', label:'Data Siswa', icon:'users', subtitle:'Kelola siswa peserta tiap ekstrakurikuler' },
  { id:'laporan', label:'Laporan', icon:'file-bar-chart-2', subtitle:'Cetak laporan keuangan lengkap per ekstrakurikuler' },
  { id:'cetakPresensi', label:'Cetak Presensi', icon:'clipboard-check', subtitle:'Cetak lembar presensi bertanda tangan per bulan, sesuai jadwal tiap ekstrakurikuler' },
  { id:'aktivitas', label:'Log Aktivitas', icon:'history', subtitle:'Jejak audit — siapa mengubah data apa dan kapan' },
  { id:'halamanPublik', label:'Halaman Publik', icon:'globe', subtitle:'Atur logo, nama, dan tagline web yang tampil di halaman publik wali murid', bendaharaOnly:true },
  { id:'pengaturan', label:'Pengaturan', icon:'settings', subtitle:'Kop laporan, akun, dan kategori pengeluaran', bendaharaOnly:true },
];

let currentView = 'dashboard';

function menusForRole(){
  return MENUS.filter(m => !m.bendaharaOnly || canEdit());
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
  if(!allowed.some(m=>m.id===viewId)) viewId = 'dashboard';
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
    ekskul: renderEkskul,
    siswa: renderSiswa,
    laporan: renderLaporan,
    cetakPresensi: renderCetakPresensi,
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

/* Filter transaksi berdasarkan rentang tanggal custom di halaman Laporan
   (dipakai saat Print / Unduh PDF). Kosong = tidak difilter. */
function filterRentangLaporan(list, field){
  if(!laporanTglAwal && !laporanTglAkhir) return list;
  return list.filter(x=>{
    const tgl = x[field];
    if(!tgl) return false;
    if(laporanTglAwal && tgl < laporanTglAwal) return false;
    if(laporanTglAkhir && tgl > laporanTglAkhir) return false;
    return true;
  });
}
function labelPeriodeLaporan(){
  if(!laporanTglAwal && !laporanTglAkhir) return 'Seluruh Riwayat Transaksi';
  const awal = laporanTglAwal ? tanggalIndo(laporanTglAwal) : 'Awal';
  const akhir = laporanTglAkhir ? tanggalIndo(laporanTglAkhir) : 'Sekarang';
  return `Periode ${awal} – ${akhir}`;
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

  main.innerHTML = `
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
        <input id="pemasukanSearchInput" type="text" value="${pemasukanSearchQuery}" placeholder="Cari nama siswa, ekskul, atau keterangan..." class="input-glass w-full rounded-xl pl-10 pr-3.5 py-2.5 text-sm">
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
            }).join('') || `<tr><td colspan="6" class="text-center py-10 text-slate-500">Belum ada data pemasukan</td></tr>`}
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
  openModal(editing ? 'Edit Pembayaran Iuran' : 'Catat Pembayaran Iuran', `
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
  `, `
    <button onclick="closeModal()" class="btn-secondary px-4 py-2.5 rounded-xl text-sm">Batal</button>
    <button onclick="submitPemasukan(${editing ? `'${editId}'` : 'null'})" class="btn-primary px-4 py-2.5 rounded-xl text-sm">Simpan</button>
  `);

  if(editing){
    document.getElementById('pmEkskul').value = editing.ekskulId;
    onPmEkskulChange();
    document.getElementById('pmSiswa').value = editing.siswaId;
    const pEl = document.getElementById('pmPeriode'); if(pEl) pEl.value = editing.periode;
    document.getElementById('pmNominal').value = editing.nominal;
    document.getElementById('pmTanggalBayar').value = editing.tanggalBayar;
    document.getElementById('pmKeterangan').value = editing.keterangan || '';
  } else if(prefill && prefill.ekskulId){
    document.getElementById('pmEkskul').value = prefill.ekskulId;
    onPmEkskulChange();
    if(prefill.siswaId){ document.getElementById('pmSiswa').value = prefill.siswaId; }
    if(prefill.periode){ const pEl = document.getElementById('pmPeriode'); if(pEl) pEl.value = prefill.periode; }
  }
}

function onPmEkskulChange(){
  const ekId = document.getElementById('pmEkskul').value;
  const ek = ekskulById(ekId);
  const siswaSel = document.getElementById('pmSiswa');
  const periodeWrap = document.getElementById('pmPeriodeWrap');
  if(!ek){
    siswaSel.innerHTML = '<option value="">Pilih ekstrakurikuler dahulu</option>';
    periodeWrap.innerHTML = '';
    return;
  }
  const anggota = DB.siswa.filter(s=>s.ekskulIds.includes(ekId));
  siswaSel.innerHTML = '<option value="">Pilih siswa</option>' + anggota.map(s=>`<option value="${s.id}">${escapeHtml(s.nama)} (${escapeHtml(s.kelas)})</option>`).join('');
  document.getElementById('pmNominal').value = ek.tarif;

  if(ek.jenisPembayaran === 'bulanan'){
    periodeWrap.innerHTML = `${fieldLabel('Bulan Pembayaran')}
      <input id="pmPeriode" type="month" required value="${defaultBulanIni()}" class="input-glass w-full rounded-xl px-3.5 py-2.5 text-sm">`;
  } else {
    const opts = ek.hariJadwal.map(h=>`<option value="${h}">${h}</option>`).join('');
    periodeWrap.innerHTML = `${fieldLabel('Tanggal Pertemuan')}
      <input id="pmPeriode" type="date" required value="${hariIniStr()}" class="input-glass w-full rounded-xl px-3.5 py-2.5 text-sm">
      <p class="text-[11px] text-slate-400 mt-1.5">Jadwal ${escapeHtml(ek.nama)}: ${ek.hariJadwal.join(' & ')}</p>`;
  }
}

function submitPemasukan(editId){
  if(!requireEdit()) return;
  const ekskulId = document.getElementById('pmEkskul').value;
  const siswaId = document.getElementById('pmSiswa').value;
  const periodeEl = document.getElementById('pmPeriode');
  const nominal = parseFloat(document.getElementById('pmNominal').value);
  const tanggalBayar = document.getElementById('pmTanggalBayar').value;
  const keterangan = document.getElementById('pmKeterangan').value;
  if(!ekskulId || !siswaId || !periodeEl || !periodeEl.value || !tanggalBayar){
    showToast('Lengkapi semua data yang wajib diisi.', 'error'); return;
  }
  if(isNaN(nominal) || nominal <= 0){
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
  closeModal();
  showToast('Pembayaran berhasil diperbarui.');
  renderView('pemasukan');
}

function simpanPemasukan(siswaId, ekskulId, ek, periode, nominal, tanggalBayar, keterangan){
  DB.pemasukan.push({ id:uid('pm'), siswaId, ekskulId, jenis:ek.jenisPembayaran, periode, nominal, tanggalBayar, keterangan });
  catatAktivitas('Tambah Pemasukan', `${siswaById(siswaId)?.nama||'-'} — ${ek.nama} — ${rupiah(nominal)}`);
  saveDB(DB);
  closeModal();
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

  main.innerHTML = `
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
        <input id="pengeluaranSearchInput" type="text" value="${pengeluaranSearchQuery}" placeholder="Cari ekskul, kategori, atau keterangan..." class="input-glass w-full rounded-xl pl-10 pr-3.5 py-2.5 text-sm">
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
            }).join('') || `<tr><td colspan="7" class="text-center py-10 text-slate-500">Belum ada data pengeluaran</td></tr>`}
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
  openModal(editing ? 'Edit Pengeluaran' : 'Catat Pengeluaran', `
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
  `, `
    <button onclick="closeModal()" class="btn-secondary px-4 py-2.5 rounded-xl text-sm">Batal</button>
    <button onclick="submitPengeluaran(${editing ? `'${editId}'` : 'null'})" class="btn-primary px-4 py-2.5 rounded-xl text-sm">Simpan</button>
  `);

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
  if(!ekskulId || !kategori || !tanggal){
    showToast('Lengkapi semua data yang wajib diisi.', 'error'); return;
  }
  if(isNaN(nominal) || nominal <= 0){
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
  closeModal();
  showToast('Pengeluaran berhasil diperbarui.');
  renderView('pengeluaran');
}

function simpanPengeluaran(ekskulId, kategori, nominal, tanggal, keterangan){
  DB.pengeluaran.push({ id:uid('px'), ekskulId, kategori, nominal, tanggal, keterangan, bukti:_pxBuktiData });
  catatAktivitas('Tambah Pengeluaran', `${ekskulById(ekskulId)?.nama||'-'} — ${kategori} — ${rupiah(nominal)}`);
  saveDB(DB);
  closeModal();
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

function hitungTunggakan(){
  const periode = currentPeriodeBulan();
  const ekBulanan = DB.ekskul.filter(e=>e.jenisPembayaran==='bulanan');
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

/* Estimasi tunggakan untuk ekskul skema PER PERTEMUAN (mis. Futsal, Silat).
   CATATAN PENTING — ini BUKAN data presensi digital (aplikasi ini tidak
   mencatat kehadiran; Cetak Presensi cuma menghasilkan lembar kosong untuk
   tanda tangan manual di kertas). Yang dihitung di sini murni ESTIMASI:
   jumlah pertemuan yang SEHARUSNYA sudah lewat bulan ini menurut jadwal
   hari latihan (hariJadwal) ekskul tsb, dibandingkan dengan berapa kali
   siswa itu SUDAH tercatat bayar bulan ini. Selisihnya ditampilkan sebagai
   "potensi belum lunas" — bisa saja meleset kalau siswa izin/sakit/absen
   pada beberapa pertemuan, karena sistem tidak tahu kehadiran sebenarnya.
   Tetap berguna sebagai titik awal bendahara menagih, bukan angka pasti. */
function hitungEstimasiTunggakanPertemuan(){
  const bulanIni = currentPeriodeBulan();
  const hariIniOnly = hariIniStr();
  const ekPertemuan = DB.ekskul.filter(e=>e.jenisPembayaran==='pertemuan');
  return ekPertemuan.map(ek=>{
    const semuaTanggalBulan = tanggalPertemuanBulan(ek.hariJadwal, bulanIni);
    const tanggalLewat = semuaTanggalBulan.filter(d=>{
      const s = d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
      return s <= hariIniOnly;
    });
    const anggota = DB.siswa.filter(s=>s.ekskulIds.includes(ek.id) && s.aktif!==false);
    const rincian = anggota.map(s=>{
      const sudahBayar = DB.pemasukan.filter(p=>
        p.ekskulId===ek.id && p.siswaId===s.id && p.jenis==='pertemuan' &&
        (p.periode||'').startsWith(bulanIni) && p.periode <= hariIniOnly
      ).length;
      const kurang = Math.max(0, tanggalLewat.length - sudahBayar);
      return { siswa:s, sudahBayar, kurang };
    }).filter(r=>r.kurang>0).sort((a,b)=>b.kurang-a.kurang);
    return { ek, jumlahPertemuanLewat: tanggalLewat.length, rincian };
  }).filter(r=>r.jumlahPertemuanLewat>0 && r.rincian.length>0);
}

function renderTunggakan(){
  const main = document.getElementById('mainContent');
  const rekap = hitungTunggakan();
  const totalBelum = rekap.reduce((s,r)=>s+r.belum.length,0);

  main.innerHTML = `
    <div class="glass-strong rounded-3xl p-5 mb-5 flex items-center gap-4">
      <div class="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0" style="background:rgba(225,29,72,.12)">
        <i data-lucide="alert-circle" class="w-5 h-5" style="color:var(--rose-500)"></i>
      </div>
      <div>
        <p class="font-bold text-sm">${totalBelum} siswa belum membayar iuran bulanan periode ${bulanNama(currentPeriodeBulan())}</p>
        <p class="text-xs text-slate-500">Rekap di atas untuk ekstrakurikuler skema Bulanan. Untuk ekskul skema Per Pertemuan, lihat estimasi di bagian bawah halaman ini.</p>
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 stagger">
      ${rekap.map(r=>`
        <div class="glass-strong rounded-3xl p-5 border-t-4" style="border-top-color:${r.ek.warna}">
          <div class="flex items-center justify-between mb-3">
            <div>
              <h3 class="font-bold text-base">${escapeHtml(r.ek.nama)}</h3>
              <p class="text-xs text-slate-500">Tarif: ${rupiah(r.ek.tarif)}/bulan · ${r.anggota.length} peserta</p>
            </div>
            <span class="badge px-2.5 py-1 rounded-full" style="background:rgba(225,29,72,.12); color:var(--rose-500)">${r.belum.length} belum bayar</span>
          </div>
          ${r.belum.length===0 ? `
            <p class="text-xs text-slate-500 py-3 flex items-center gap-1.5"><i data-lucide="check-circle-2" class="w-3.5 h-3.5" style="color:var(--emerald-500)"></i>Semua peserta sudah membayar bulan ini.</p>
          ` : `
            <div class="max-h-56 overflow-y-auto divide-y divide-slate-100">
              ${r.belum.map(s=>`
                <div class="tx-row flex items-center gap-3 px-2 py-2.5 rounded-xl">
                  <div class="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-[11px] font-bold" style="background:rgba(225,29,72,.10); color:var(--rose-500); box-shadow: inset 0 0 0 1.5px rgba(225,29,72,.20);">${(s.nama.trim()[0]||'?').toUpperCase()}</div>
                  <div class="flex-1 min-w-0">
                    <p class="text-sm font-medium text-slate-800 truncate">${escapeHtml(s.nama)}</p>
                    <p class="text-xs text-slate-400 truncate">${escapeHtml(s.kelas)}</p>
                  </div>
                  ${canEdit() ? `<button onclick="openPemasukanForm({ekskulId:'${r.ek.id}', siswaId:'${s.id}', periode:'${r.periode}'})" title="Catat pembayaran ${escapeHtml(s.nama)}" aria-label="Catat pembayaran ${escapeHtml(s.nama)}" class="text-xs font-semibold text-blue-600 hover:text-blue-500 flex items-center gap-1 shrink-0">Catat <i data-lucide="arrow-right" class="w-3 h-3"></i></button>` : ''}
                </div>
              `).join('')}
            </div>
          `}
        </div>
      `).join('') || '<p class="text-sm text-slate-500 col-span-full text-center py-10">Belum ada ekstrakurikuler dengan skema pembayaran bulanan.</p>'}
    </div>

    ${renderEstimasiTunggakanPertemuanHtml()}
  `;
}

function renderEstimasiTunggakanPertemuanHtml(){
  const rekapPertemuan = hitungEstimasiTunggakanPertemuan();
  const adaEkPertemuan = DB.ekskul.some(e=>e.jenisPembayaran==='pertemuan');
  if(!adaEkPertemuan) return '';

  return `
    <div class="mt-8">
      <div class="glass-strong rounded-3xl p-5 mb-5 flex items-start gap-4">
        <div class="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0" style="background:rgba(245,158,11,.14)">
          <i data-lucide="calendar-clock" class="w-5 h-5" style="color:var(--amber-400)"></i>
        </div>
        <div>
          <p class="font-bold text-sm">Estimasi Tunggakan Per Pertemuan (${bulanNama(currentPeriodeBulan())})</p>
          <p class="text-xs text-slate-500 mt-1">Ini <strong>estimasi</strong> berdasarkan jadwal hari latihan, <strong>bukan</strong> data kehadiran sebenarnya — aplikasi belum mencatat presensi secara digital. Angka dihitung dari jumlah pertemuan yang sudah lewat bulan ini menurut jadwal, dibandingkan jumlah bayar yang tercatat. Bisa meleset kalau siswa izin/sakit/absen — mohon cek manual sebelum menagih.</p>
        </div>
      </div>

      ${rekapPertemuan.length===0 ? `
        <p class="text-sm text-slate-500 text-center py-6">Belum ada estimasi tunggakan — semua siswa di ekskul per pertemuan sudah bayar sesuai jumlah pertemuan yang lewat, atau belum ada pertemuan yang lewat bulan ini.</p>
      ` : `
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 stagger">
          ${rekapPertemuan.map(r=>`
            <div class="glass-strong rounded-3xl p-5 border-t-4" style="border-top-color:${r.ek.warna}">
              <div class="flex items-center justify-between mb-3">
                <div>
                  <h3 class="font-bold text-base">${escapeHtml(r.ek.nama)}</h3>
                  <p class="text-xs text-slate-500">Tarif: ${rupiah(r.ek.tarif)}/pertemuan · ${r.jumlahPertemuanLewat}x pertemuan sudah lewat bulan ini</p>
                </div>
                <span class="badge px-2.5 py-1 rounded-full" style="background:rgba(245,158,11,.14); color:var(--amber-400)">${r.rincian.length} berpotensi kurang bayar</span>
              </div>
              <div class="max-h-56 overflow-y-auto divide-y divide-slate-100">
                ${r.rincian.map(item=>`
                  <div class="tx-row flex items-center gap-3 px-2 py-2.5 rounded-xl">
                    <div class="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-[11px] font-bold" style="background:rgba(245,158,11,.12); color:var(--amber-400); box-shadow: inset 0 0 0 1.5px rgba(245,158,11,.25);">${(item.siswa.nama.trim()[0]||'?').toUpperCase()}</div>
                    <div class="flex-1 min-w-0">
                      <p class="text-sm font-medium text-slate-800 truncate">${escapeHtml(item.siswa.nama)}</p>
                      <p class="text-xs text-slate-400 truncate">${escapeHtml(item.siswa.kelas)} · sudah bayar ${item.sudahBayar}x dari estimasi ${r.jumlahPertemuanLewat}x · kurang ${item.kurang}x</p>
                    </div>
                    ${canEdit() ? `<button onclick="openPemasukanForm({ekskulId:'${r.ek.id}', siswaId:'${item.siswa.id}'})" title="Catat pembayaran ${escapeHtml(item.siswa.nama)}" aria-label="Catat pembayaran ${escapeHtml(item.siswa.nama)}" class="text-xs font-semibold text-blue-600 hover:text-blue-500 flex items-center gap-1 shrink-0">Catat <i data-lucide="arrow-right" class="w-3 h-3"></i></button>` : ''}
                  </div>
                `).join('')}
              </div>
            </div>
          `).join('')}
        </div>
      `}
    </div>
  `;
}

/* =========================================================
   DATA EKSTRAKURIKULER
   ========================================================= */
function renderEkskul(){
  const main = document.getElementById('mainContent');
  main.innerHTML = `
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
          <div class="flex items-center gap-2 mb-3">
            <span class="badge px-2.5 py-1 rounded-full" style="background:${ek.warna}22; color:${ek.warna}">${ek.jenisPembayaran==='bulanan'?'Bulanan':'Per Pertemuan'}</span>
            <span class="badge px-2.5 py-1 rounded-full glass text-slate-600">${ek.hariJadwal.join(' & ')}</span>
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
      }).join('') || '<p class="text-sm text-slate-500 col-span-full text-center py-10">Belum ada ekstrakurikuler</p>'}
    </div>
  `;
}

function openEkskulForm(id){
  if(!requireEdit()) return;
  const ek = id ? ekskulById(id) : null;
  const hariAll = ['Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
  openModal(ek ? 'Ubah Ekstrakurikuler' : 'Tambah Ekstrakurikuler', `
    <form id="formEkskul" class="space-y-4">
      <div>${fieldLabel('Nama Ekstrakurikuler')}
        <input id="ekNama" type="text" required value="${escapeHtml(ek?.nama||'')}" class="input-glass w-full rounded-xl px-3.5 py-2.5 text-sm" placeholder="Contoh: Futsal">
      </div>
      <div>${fieldLabel('Nama Pembina')}
        <input id="ekPembina" type="text" required value="${escapeHtml(ek?.pembina||'')}" class="input-glass w-full rounded-xl px-3.5 py-2.5 text-sm" placeholder="Nama pembina">
      </div>
      <div>${fieldLabel('Jenis Pembayaran')}
        <select id="ekJenis" required class="input-glass w-full rounded-xl px-3.5 py-2.5 text-sm">
          <option value="bulanan" ${ek?.jenisPembayaran==='bulanan'?'selected':''}>Bulanan</option>
          <option value="pertemuan" ${ek?.jenisPembayaran==='pertemuan'?'selected':''}>Per Pertemuan</option>
        </select>
      </div>
      <div>${fieldLabel('Tarif (Rp)')}
        <input id="ekTarif" type="number" required value="${ek?.tarif||''}" class="input-glass w-full rounded-xl px-3.5 py-2.5 text-sm" placeholder="0">
      </div>
      <div>${fieldLabel('Jadwal Hari Latihan')}
        <div class="flex flex-wrap gap-2">
          ${hariAll.map(h=>`<label class="flex items-center gap-1.5 glass px-3 py-1.5 rounded-lg text-xs cursor-pointer">
            <input type="checkbox" value="${h}" ${ek?.hariJadwal.includes(h)?'checked':''} class="ek-hari accent-blue-600"> ${h}
          </label>`).join('')}
        </div>
      </div>
      <div>${fieldLabel('Warna Label')}
        <input id="ekWarna" type="color" value="${ek?.warna||'#1769D1'}" class="w-16 h-10 rounded-lg bg-transparent">
      </div>
    </form>
  `, `
    <button onclick="closeModal()" class="btn-secondary px-4 py-2.5 rounded-xl text-sm">Batal</button>
    <button onclick="submitEkskul(${id ? `'${id}'` : 'null'})" class="btn-primary px-4 py-2.5 rounded-xl text-sm">Simpan</button>
  `);
}

function submitEkskul(id){
  if(!requireEdit()) return;
  const nama = document.getElementById('ekNama').value.trim();
  const pembina = document.getElementById('ekPembina').value.trim();
  const jenisPembayaran = document.getElementById('ekJenis').value;
  const tarif = parseFloat(document.getElementById('ekTarif').value);
  const warna = document.getElementById('ekWarna').value;
  const hariJadwal = Array.from(document.querySelectorAll('.ek-hari:checked')).map(c=>c.value);
  if(!nama || !pembina || hariJadwal.length===0){
    showToast('Lengkapi semua data, minimal pilih 1 hari jadwal.', 'error'); return;
  }
  if(isNaN(tarif) || tarif <= 0){
    showToast('Tarif harus lebih dari 0.', 'error'); return;
  }
  const duplikatNama = DB.ekskul.find(e => e.nama.toLowerCase()===nama.toLowerCase() && e.id!==id);
  if(duplikatNama){
    showToast('Nama ekstrakurikuler ini sudah ada.', 'error'); return;
  }
  if(id){
    const ek = ekskulById(id);
    Object.assign(ek, { nama, pembina, jenisPembayaran, tarif, warna, hariJadwal });
    catatAktivitas('Ubah Ekstrakurikuler', nama);
  } else {
    DB.ekskul.push({ id:uid('ek'), nama, pembina, jenisPembayaran, tarif, warna, hariJadwal });
    catatAktivitas('Tambah Ekstrakurikuler', nama);
  }
  saveDB(DB);
  closeModal();
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
    // Ikut hapus seluruh riwayat pemasukan & pengeluaran ekstrakurikuler ini,
    // supaya tidak ada transaksi "yatim" yang tetap mempengaruhi Total Saldo
    // keseluruhan tapi sudah tidak bisa dilihat/dilaporkan di mana pun.
    DB.pemasukan = DB.pemasukan.filter(p=>p.ekskulId!==id);
    DB.pengeluaran = DB.pengeluaran.filter(p=>p.ekskulId!==id);
    tandaiHapus('ekskul', id);
    // Menghapus ekskul-nya saja sudah cukup — server ikut menghapus riwayat
    // pemasukan/pengeluaran terkait lewat FK ON DELETE CASCADE (lihat
    // supabase-schema.sql). Tetap didaftarkan eksplisit di sini juga
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

  main.innerHTML = `
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
      <div class="relative flex-1 max-w-sm">
        <i data-lucide="search" class="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2"></i>
        <input id="siswaSearchInput" type="text" value="${siswaSearchQuery}" placeholder="Cari nama atau kelas siswa..." class="input-glass w-full rounded-xl pl-10 pr-3.5 py-2.5 text-sm">
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
      }).join('') || (q ? '<p class="text-sm text-slate-500 col-span-full text-center py-10">Tidak ada siswa yang cocok dengan pencarian.</p>' : '<p class="text-sm text-slate-500 col-span-full text-center py-10">Buat data ekstrakurikuler dahulu di menu Data Ekstrakurikuler, lalu peserta bisa ditambahkan di sini.</p>')}
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

function openSemuaSiswaModal(){
  const edit = canEdit();
  const renderBody = ()=>{
    const q = semuaSiswaQuery.trim().toLowerCase();
    const list = DB.siswa
      .filter(s => !q || s.nama.toLowerCase().includes(q) || s.kelas.toLowerCase().includes(q))
      .sort((a,b)=>a.nama.localeCompare(b.nama));
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
    }).join('') || '<p class="text-xs text-slate-400 text-center py-6">Tidak ada siswa yang cocok.</p>';
    safeIcons();
  };

  openModal('Semua Data Siswa', `
    <div class="relative mb-3">
      <i data-lucide="search" class="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2"></i>
      <input id="semuaSiswaSearch" type="text" value="${semuaSiswaQuery}" placeholder="Cari nama atau kelas..." class="input-glass w-full rounded-xl pl-10 pr-3.5 py-2.5 text-sm">
    </div>
    <div id="semuaSiswaBody" class="max-h-80 overflow-y-auto divide-y divide-slate-100"></div>
  `, `
    <button onclick="closeModal()" class="btn-secondary px-4 py-2.5 rounded-xl text-sm">Tutup</button>
    ${edit ? `<button onclick="openSiswaForm()" class="btn-primary px-4 py-2.5 rounded-xl text-sm flex items-center gap-2"><i data-lucide="plus" class="w-4 h-4"></i>Tambah Siswa</button>` : ''}
  `);
  renderBody();
  document.getElementById('semuaSiswaSearch').addEventListener('input', (e)=>{
    semuaSiswaQuery = e.target.value;
    renderBody();
  });
}

function exportSiswaCSV(){
  const rows = [['Nama','Kelas','Ekstrakurikuler Diikuti','Nama Wali','No. HP Wali']];
  DB.siswa.slice().sort((a,b)=>a.nama.localeCompare(b.nama)).forEach(s=>{
    const ekNama = s.ekskulIds.map(id=>ekskulById(id)?.nama).filter(Boolean).join(' & ') || '-';
    rows.push([s.nama, s.kelas, ekNama, s.waliNama||'', s.waliHp||'']);
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
      DB.siswa.push({ id:uid('sw'), nama:row.nama, kelas:row.kelas, ekskulIds:[ekId], aktif:true });
      ditambah++;
    }
  });
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
  catatAktivitas('Keluarkan Peserta', `${s.nama} dari ${ekskulById(ekId)?.nama||'-'}`);
  saveDB(DB);
  showToast('Peserta dikeluarkan dari ekstrakurikuler.', 'info');
  openSiswaEkskulManage(ekId);
  renderNav();
}

function openSiswaForm(id){
  if(!requireEdit()) return;
  const s = id ? siswaById(id) : null;
  openModal(s ? 'Ubah Data Siswa' : 'Tambah Siswa', `
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
  `, `
    <button onclick="closeModal()" class="btn-secondary px-4 py-2.5 rounded-xl text-sm">Batal</button>
    <button onclick="submitSiswa(${id ? `'${id}'` : 'null'})" class="btn-primary px-4 py-2.5 rounded-xl text-sm">Simpan</button>
  `);
}

function submitSiswa(id){
  if(!requireEdit()) return;
  const nama = document.getElementById('swNama').value.trim();
  const kelas = document.getElementById('swKelas').value.trim();
  const waliNama = document.getElementById('swWaliNama').value.trim();
  const waliHp = document.getElementById('swWaliHp').value.trim();
  const ekskulIds = Array.from(document.querySelectorAll('.sw-ekskul:checked')).map(c=>c.value);
  const aktif = document.getElementById('swAktif').checked;
  if(!nama || !kelas){ showToast('Nama dan kelas wajib diisi.', 'error'); return; }
  const duplikat = DB.siswa.find(s => s.nama.toLowerCase()===nama.toLowerCase() && s.kelas.toLowerCase()===kelas.toLowerCase() && s.id!==id);
  if(duplikat){ showToast('Siswa dengan nama dan kelas yang sama sudah terdaftar.', 'error'); return; }
  if(id){
    const sebelumnya = siswaById(id);
    const statusBerubah = sebelumnya && (sebelumnya.aktif!==false) !== aktif;
    Object.assign(sebelumnya, { nama, kelas, waliNama, waliHp, ekskulIds, aktif });
    catatAktivitas('Ubah Data Siswa', `${nama} (${kelas})${statusBerubah ? ` — status jadi ${aktif?'Aktif':'Nonaktif'}` : ''}`);
  } else {
    DB.siswa.push({ id:uid('sw'), nama, kelas, waliNama, waliHp, ekskulIds, aktif });
    catatAktivitas('Tambah Siswa', `${nama} (${kelas})`);
  }
  saveDB(DB);
  closeModal();
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
let laporanTglAwal = '';
let laporanTglAkhir = '';

function renderLaporan(){
  const main = document.getElementById('mainContent');

  main.innerHTML = `
    <div class="glass-strong rounded-3xl p-5 mb-5">
      <h3 class="font-bold text-sm mb-1">Rentang Tanggal Laporan</h3>
      <p class="text-xs text-slate-500 mb-4">Berlaku untuk tombol Print & Unduh PDF di bawah. Kosongkan salah satu atau kedua untuk mencetak seluruh riwayat transaksi.</p>
      <div class="flex flex-col sm:flex-row gap-3 items-end">
        <div class="flex-1 w-full">
          ${fieldLabel('Dari Tanggal')}
          <input id="laporanTglAwalInput" type="date" value="${laporanTglAwal}" class="input-glass w-full rounded-xl px-3.5 py-2.5 text-sm">
        </div>
        <div class="flex-1 w-full">
          ${fieldLabel('Sampai Tanggal')}
          <input id="laporanTglAkhirInput" type="date" value="${laporanTglAkhir}" class="input-glass w-full rounded-xl px-3.5 py-2.5 text-sm">
        </div>
        ${(laporanTglAwal||laporanTglAkhir) ? `<button onclick="laporanTglAwal='';laporanTglAkhir='';renderView('laporan')" class="glass shrink-0 px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-600 flex items-center justify-center gap-2 w-full sm:w-auto"><i data-lucide="x" class="w-4 h-4"></i>Reset</button>` : ''}
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

  document.getElementById('laporanTglAwalInput').addEventListener('change', (e)=>{ laporanTglAwal = e.target.value; });
  document.getElementById('laporanTglAkhirInput').addEventListener('change', (e)=>{ laporanTglAkhir = e.target.value; });
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
   per tahun) bertambah 1 secara ATOMIK lewat RPC ambil_nomor_dokumen (lihat
   supabase-schema.sql), lalu diformat di sini. SEBELUMNYA nomor laporan
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

async function cetakLaporan(ekskulId){
  const ek = ekskulById(ekskulId);
  const pg = DB.pengaturan;
  const masukList = filterRentangLaporan(DB.pemasukan.filter(p=>p.ekskulId===ekskulId), 'tanggalBayar').sort((a,b)=> new Date(a.tanggalBayar)-new Date(b.tanggalBayar));
  const keluarList = filterRentangLaporan(DB.pengeluaran.filter(p=>p.ekskulId===ekskulId), 'tanggal').sort((a,b)=> new Date(a.tanggal)-new Date(b.tanggal));
  const totalMasuk = masukList.reduce((s,p)=>s+p.nominal,0);
  const totalKeluar = keluarList.reduce((s,p)=>s+p.nominal,0);

  const anggota = DB.siswa.filter(s=>s.ekskulIds.includes(ekskulId));
  const rekapBayar = anggota.map(s=>{
    const sudah = masukList.filter(p=>p.siswaId===s.id).length; // ikut filter rentang tanggal laporan
    return { nama:s.nama, kelas:s.kelas, jumlahBayar:sudah, status: sudah>0 ? 'Sudah Bayar' : 'Belum Bayar' };
  });

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
    <style>
      body{font-family:Arial, sans-serif; padding:32px; color:#111;}
      h1{font-size:18px; margin:0;} h2{font-size:15px; margin:18px 0 8px;}
      .header{display:flex; align-items:center; gap:14px; border-bottom:2px solid #123B78; padding-bottom:14px; margin-bottom:16px;}
      .header img{width:56px; height:56px; object-fit:contain;}
      table{width:100%; border-collapse:collapse; font-size:12px; margin-bottom:16px;}
      th,td{border:1px solid #ccc; padding:6px 8px; text-align:left;}
      th{background:#f1f5f9;}
      .text-right{text-align:right;}
      .summary{display:flex; gap:24px; margin-bottom:16px; font-size:13px;}
      .ttd{display:flex; justify-content:space-between; margin-top:60px; font-size:12px;}
      .ttd div{text-align:center; width:220px;}
    </style></head>
    <body>
      <div class="header">
        ${pg.logo ? `<img src="${pg.logo}">` : ''}
        <div>
          ${kopHtml(pg)}
          <p style="margin:3px 0 0; font-size:11px;">Tahun Ajaran ${pg.tahunAjaran||'-'}</p>
        </div>
      </div>
      <h2>Laporan Keuangan Ekstrakurikuler: ${escapeHtml(ek.nama)}</h2>
      <p style="font-size:11px; color:#555;">Nomor Laporan: ${nomor} · ${escapeHtml(labelPeriodeLaporan())}</p>
      <p style="font-size:12px;">Pembina: ${escapeHtml(ek.pembina)} · Jenis Pembayaran: ${ek.jenisPembayaran==='bulanan'?'Bulanan':'Per Pertemuan'} · Tarif: ${rupiah(ek.tarif)}</p>

      <div class="summary">
        <div><strong>Total Pemasukan:</strong> ${rupiah(totalMasuk)}</div>
        <div><strong>Total Pengeluaran:</strong> ${rupiah(totalKeluar)}</div>
        <div><strong>Saldo Akhir:</strong> ${rupiah(totalMasuk-totalKeluar)}</div>
      </div>

      <h2>Rincian Pemasukan</h2>
      <table>
        <tr><th>No</th><th>Nama Siswa</th><th>Periode</th><th>Tgl Bayar</th><th class="text-right">Nominal</th></tr>
        ${masukList.map((p,i)=>`<tr><td>${i+1}</td><td>${escapeHtml(siswaById(p.siswaId)?.nama||'-')}</td><td>${p.jenis==='bulanan'?bulanNama(p.periode):tanggalIndo(p.periode)}</td><td>${tanggalIndo(p.tanggalBayar)}</td><td class="text-right">${rupiah(p.nominal)}</td></tr>`).join('') || '<tr><td colspan="5">Belum ada data</td></tr>'}
      </table>

      <h2>Rincian Pengeluaran</h2>
      <table>
        <tr><th>No</th><th>Kategori</th><th>Keterangan</th><th>Tanggal</th><th class="text-right">Nominal</th></tr>
        ${keluarList.map((p,i)=>`<tr><td>${i+1}</td><td>${escapeHtml(p.kategori)}</td><td>${escapeHtml(p.keterangan||'-')}</td><td>${tanggalIndo(p.tanggal)}</td><td class="text-right">${rupiah(p.nominal)}</td></tr>`).join('') || '<tr><td colspan="5">Belum ada data</td></tr>'}
      </table>

      <h2>Rekap Status Pembayaran Siswa</h2>
      <table>
        <tr><th>No</th><th>Nama Siswa</th><th>Kelas</th><th>Jumlah Bayar</th><th>Status</th></tr>
        ${rekapBayar.map((r,i)=>`<tr><td>${i+1}</td><td>${escapeHtml(r.nama)}</td><td>${escapeHtml(r.kelas)}</td><td>${r.jumlahBayar}x</td><td>${r.status}</td></tr>`).join('') || '<tr><td colspan="5">Belum ada siswa</td></tr>'}
      </table>

      <div class="ttd">
        <div>Mengetahui,<br>Kepala Sekolah<br><br><br><br><strong>${pg.kepalaSekolah||'..........................'}</strong><br>NIP. ${pg.nipKepsek||'-'}</div>
        <div>Karanganyar, ${hariIniDate().toLocaleDateString('id-ID',{day:'numeric',month:'long',year:'numeric'})}<br>Bendahara<br><br><br><br><strong>${pg.bendahara||'..........................'}</strong><br>NIP. ${pg.nipBendahara||'-'}</div>
      </div>
      <p style="font-size:9px; color:#888; margin-top:24px;">Dicetak oleh ${currentUserName()} (${roleLabel(currentRole)}) pada ${waktuIndo(new Date().toISOString())} melalui SIKasapa.</p>
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
   tersimpan sebagai URL publik R2 (lewat Worker), yang mengizinkan
   CORS secara default untuk bucket publik — jadi bisa diambil
   langsung dari browser tanpa lewat server. */
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
  const anggota = DB.siswa.filter(s=>s.ekskulIds.includes(ekskulId));
  const rekapBayar = anggota.map(s=>{
    const sudah = masukList.filter(p=>p.siswaId===s.id).length; // ikut filter rentang tanggal laporan
    return { nama:s.nama, kelas:s.kelas, jumlahBayar:sudah, status: sudah>0 ? 'Sudah Bayar' : 'Belum Bayar' };
  });
  let nomor;
  try{
    nomor = await nomorLaporanBaru(kodeEkskulLaporan(ek));
  }catch(e){
    console.error(e);
    showToast('Gagal mengambil nomor laporan dari server. Coba lagi.', 'error');
    return;
  }

  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
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
  y += 8;
  doc.setFont(undefined,'normal');

  doc.setFontSize(12); doc.setFont(undefined,'bold');
  doc.text(`Laporan Keuangan Ekstrakurikuler: ${ek.nama}`, 14, y);
  y += 5;
  doc.setFontSize(8); doc.setFont(undefined,'normal'); doc.setTextColor(100);
  doc.text(`Nomor Laporan: ${nomor}  ·  ${labelPeriodeLaporan()}`, 14, y);
  doc.setTextColor(0);
  y += 5;
  doc.setFontSize(9);
  doc.text(`Pembina: ${ek.pembina}  |  Jenis Pembayaran: ${ek.jenisPembayaran==='bulanan'?'Bulanan':'Per Pertemuan'}  |  Tarif: ${rupiah(ek.tarif)}`, 14, y);
  y += 8;

  doc.setFontSize(10);
  doc.text(`Total Pemasukan: ${rupiah(totalMasuk)}`, 14, y);
  doc.text(`Total Pengeluaran: ${rupiah(totalKeluar)}`, 88, y);
  doc.text(`Saldo Akhir: ${rupiah(totalMasuk-totalKeluar)}`, 162, y);
  y += 6;

  doc.autoTable({
    startY: y, margin:{left:14, right:14},
    head: [['No','Nama Siswa','Periode','Tgl Bayar','Nominal']],
    body: masukList.length ? masukList.map((p,i)=>[i+1, siswaById(p.siswaId)?.nama||'-', p.jenis==='bulanan'?bulanNama(p.periode):tanggalIndo(p.periode), tanggalIndo(p.tanggalBayar), rupiah(p.nominal)]) : [['-','Belum ada data','-','-','-']],
    styles:{fontSize:8, cellPadding:2.5}, headStyles:{fillColor:[23,105,209]}, columnStyles:{4:{halign:'right'}},
    didDrawPage: (data)=>{ if(data.pageNumber===1){ doc.setFontSize(10); doc.setFont(undefined,'bold'); doc.text('Rincian Pemasukan', 14, y-2); } }
  });

  let y2 = doc.lastAutoTable.finalY + 10;
  doc.setFontSize(10); doc.setFont(undefined,'bold');
  doc.text('Rincian Pengeluaran', 14, y2-2);
  doc.autoTable({
    startY: y2, margin:{left:14, right:14},
    head: [['No','Kategori','Keterangan','Tanggal','Nominal']],
    body: keluarList.length ? keluarList.map((p,i)=>[i+1, p.kategori, p.keterangan||'-', tanggalIndo(p.tanggal), rupiah(p.nominal)]) : [['-','Belum ada data','-','-','-']],
    styles:{fontSize:8, cellPadding:2.5}, headStyles:{fillColor:[225,29,72]}, columnStyles:{4:{halign:'right'}}
  });

  let y3 = doc.lastAutoTable.finalY + 10;
  doc.setFontSize(10); doc.setFont(undefined,'bold');
  doc.text('Rekap Status Pembayaran Siswa', 14, y3-2);
  doc.autoTable({
    startY: y3, margin:{left:14, right:14},
    head: [['No','Nama Siswa','Kelas','Jumlah Bayar','Status']],
    body: rekapBayar.length ? rekapBayar.map((r,i)=>[i+1, r.nama, r.kelas, r.jumlahBayar+'x', r.status]) : [['-','Belum ada siswa','-','-','-']],
    styles:{fontSize:8, cellPadding:2.5}, headStyles:{fillColor:[13,148,136]}
  });

  let y4 = doc.lastAutoTable.finalY + 24;
  if(y4 > doc.internal.pageSize.getHeight() - 30){ doc.addPage(); y4 = 24; }
  doc.setFontSize(9); doc.setFont(undefined,'normal');
  doc.text('Mengetahui,', 30, y4);
  doc.text('Kepala Sekolah', 30, y4+5);
  doc.setFont(undefined,'bold');
  doc.text(pg.kepalaSekolah || '..........................', 30, y4+25);
  doc.setFont(undefined,'normal');
  doc.text(`NIP. ${pg.nipKepsek || '-'}`, 30, y4+30);

  const tglLaporan = hariIniDate().toLocaleDateString('id-ID',{day:'numeric',month:'long',year:'numeric'});
  doc.text(`Karanganyar, ${tglLaporan}`, pageWidth-70, y4);
  doc.text('Bendahara', pageWidth-70, y4+5);
  doc.setFont(undefined,'bold');
  doc.text(pg.bendahara || '..........................', pageWidth-70, y4+25);
  doc.setFont(undefined,'normal');
  doc.text(`NIP. ${pg.nipBendahara || '-'}`, pageWidth-70, y4+30);

  doc.setFontSize(7); doc.setTextColor(140);
  const footY = doc.internal.pageSize.getHeight() - 8;
  doc.text(`Dicetak oleh ${currentUserName()} (${roleLabel(currentRole)}) pada ${waktuIndo(new Date().toISOString())} melalui SIKasapa.`, 14, footY);
  doc.setTextColor(0);

  doc.save(`Laporan-${ek.nama.replace(/\s+/g,'-')}-${currentPeriodeBulan()}.pdf`);
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
    <style>
      body{font-family:Arial, sans-serif; padding:32px; color:#111;}
      h1{font-size:18px; margin:0;} h2{font-size:15px; margin:18px 0 8px;}
      .header{display:flex; align-items:center; gap:14px; border-bottom:2px solid #123B78; padding-bottom:14px; margin-bottom:16px;}
      .header img{width:56px; height:56px; object-fit:contain;}
      table{width:100%; border-collapse:collapse; font-size:12px; margin-bottom:16px;}
      th,td{border:1px solid #ccc; padding:6px 8px; text-align:left;}
      th{background:#f1f5f9;}
      .text-right{text-align:right;}
      .total-row td{font-weight:700; background:#eef2ff;}
      .summary{display:flex; gap:24px; margin-bottom:16px; font-size:13px;}
      .ttd{display:flex; justify-content:space-between; margin-top:60px; font-size:12px;}
      .ttd div{text-align:center; width:220px;}
    </style></head>
    <body>
      <div class="header">
        ${pg.logo ? `<img src="${pg.logo}">` : ''}
        <div>
          ${kopHtml(pg)}
          <p style="margin:3px 0 0; font-size:11px;">Tahun Ajaran ${pg.tahunAjaran||'-'}</p>
        </div>
      </div>
      <h2>Laporan Gabungan Kas Seluruh Ekstrakurikuler</h2>
      <p style="font-size:11px; color:#555;">Nomor Laporan: ${nomor} · ${escapeHtml(labelPeriodeLaporan())}</p>

      <div class="summary">
        <div><strong>Total Pemasukan:</strong> ${rupiah(totalMasuk)}</div>
        <div><strong>Total Pengeluaran:</strong> ${rupiah(totalKeluar)}</div>
        <div><strong>Saldo Akhir Seluruh Ekskul:</strong> ${rupiah(totalMasuk-totalKeluar)}</div>
      </div>

      <table>
        <tr><th>No</th><th>Ekstrakurikuler</th><th>Pembina</th><th class="text-right">Pemasukan</th><th class="text-right">Pengeluaran</th><th class="text-right">Saldo</th></tr>
        ${baris.map((b,i)=>`<tr><td>${i+1}</td><td>${escapeHtml(b.ek.nama)}</td><td>${escapeHtml(b.ek.pembina)}</td><td class="text-right">${rupiah(b.masuk)}</td><td class="text-right">${rupiah(b.keluar)}</td><td class="text-right">${rupiah(b.saldo)}</td></tr>`).join('') || '<tr><td colspan="6">Belum ada ekstrakurikuler</td></tr>'}
        <tr class="total-row"><td colspan="3">TOTAL</td><td class="text-right">${rupiah(totalMasuk)}</td><td class="text-right">${rupiah(totalKeluar)}</td><td class="text-right">${rupiah(totalMasuk-totalKeluar)}</td></tr>
      </table>

      <div class="ttd">
        <div>Mengetahui,<br>Kepala Sekolah<br><br><br><br><strong>${pg.kepalaSekolah||'..........................'}</strong><br>NIP. ${pg.nipKepsek||'-'}</div>
        <div>Karanganyar, ${hariIniDate().toLocaleDateString('id-ID',{day:'numeric',month:'long',year:'numeric'})}<br>Bendahara<br><br><br><br><strong>${pg.bendahara||'..........................'}</strong><br>NIP. ${pg.nipBendahara||'-'}</div>
      </div>
      <p style="font-size:9px; color:#888; margin-top:24px;">Dicetak oleh ${currentUserName()} (${roleLabel(currentRole)}) pada ${waktuIndo(new Date().toISOString())} melalui SIKasapa.</p>
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

  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
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
  y += 8;

  doc.setFontSize(12); doc.setFont(undefined,'bold');
  doc.text('Laporan Gabungan Kas Seluruh Ekstrakurikuler', 14, y);
  y += 5;
  doc.setFontSize(8); doc.setFont(undefined,'normal'); doc.setTextColor(100);
  doc.text(`Nomor Laporan: ${nomor}  ·  ${labelPeriodeLaporan()}`, 14, y);
  doc.setTextColor(0);
  y += 7;

  doc.setFontSize(10);
  doc.text(`Total Pemasukan: ${rupiah(totalMasuk)}`, 14, y);
  doc.text(`Total Pengeluaran: ${rupiah(totalKeluar)}`, 88, y);
  doc.text(`Saldo Akhir: ${rupiah(totalMasuk-totalKeluar)}`, 162, y);
  y += 6;

  doc.autoTable({
    startY: y, margin:{left:14, right:14},
    head: [['No','Ekstrakurikuler','Pembina','Pemasukan','Pengeluaran','Saldo']],
    body: baris.length ? baris.map((b,i)=>[i+1, b.ek.nama, b.ek.pembina, rupiah(b.masuk), rupiah(b.keluar), rupiah(b.saldo)]) : [['-','Belum ada data','-','-','-','-']],
    foot: [['','','TOTAL', rupiah(totalMasuk), rupiah(totalKeluar), rupiah(totalMasuk-totalKeluar)]],
    styles:{fontSize:8, cellPadding:2.5}, headStyles:{fillColor:[23,105,209]}, footStyles:{fillColor:[238,242,255], textColor:20, fontStyle:'bold'},
    columnStyles:{3:{halign:'right'}, 4:{halign:'right'}, 5:{halign:'right'}}
  });

  let y4 = doc.lastAutoTable.finalY + 24;
  if(y4 > doc.internal.pageSize.getHeight() - 30){ doc.addPage(); y4 = 24; }
  doc.setFontSize(9); doc.setFont(undefined,'normal');
  doc.text('Mengetahui,', 30, y4);
  doc.text('Kepala Sekolah', 30, y4+5);
  doc.setFont(undefined,'bold');
  doc.text(pg.kepalaSekolah || '..........................', 30, y4+25);
  doc.setFont(undefined,'normal');
  doc.text(`NIP. ${pg.nipKepsek || '-'}`, 30, y4+30);

  const tglLaporan = hariIniDate().toLocaleDateString('id-ID',{day:'numeric',month:'long',year:'numeric'});
  doc.text(`Karanganyar, ${tglLaporan}`, pageWidth-70, y4);
  doc.text('Bendahara', pageWidth-70, y4+5);
  doc.setFont(undefined,'bold');
  doc.text(pg.bendahara || '..........................', pageWidth-70, y4+25);
  doc.setFont(undefined,'normal');
  doc.text(`NIP. ${pg.nipBendahara || '-'}`, pageWidth-70, y4+30);

  doc.setFontSize(7); doc.setTextColor(140);
  const footY = doc.internal.pageSize.getHeight() - 8;
  doc.text(`Dicetak oleh ${currentUserName()} (${roleLabel(currentRole)}) pada ${waktuIndo(new Date().toISOString())} melalui SIKasapa.`, 14, footY);
  doc.setTextColor(0);

  doc.save(`Laporan-Gabungan-${currentPeriodeBulan()}.pdf`);
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

function defaultBulanIni(){
  const d = hariIniDate();
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0');
}

/* Menghasilkan array objek Date untuk setiap tanggal di bulan `ym` (format
   'YYYY-MM') yang jatuh pada salah satu hari di `hariJadwal` (array nama hari). */
function tanggalPertemuanBulan(hariJadwal, ym){
  if(!ym || !Array.isArray(hariJadwal) || hariJadwal.length===0) return [];
  const [y, m] = ym.split('-').map(Number);
  if(!y || !m) return [];
  const targetHari = hariJadwal.map(h=>HARI_MAP[h]).filter(v=>v!==undefined);
  const jumlahHari = new Date(y, m, 0).getDate();
  const hasil = [];
  for(let tgl=1; tgl<=jumlahHari; tgl++){
    const dt = new Date(y, m-1, tgl);
    if(targetHari.includes(dt.getDay())) hasil.push(dt);
  }
  return hasil;
}

window._presensiState = { ekskulId: '', bulan: defaultBulanIni() };

function renderCetakPresensi(){
  const main = document.getElementById('mainContent');
  const st = window._presensiState;
  if(!st.ekskulId || !ekskulById(st.ekskulId)) st.ekskulId = DB.ekskul[0]?.id || '';

  main.innerHTML = `
    <div class="glass-strong rounded-3xl p-6 max-w-2xl stagger">
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

        <div id="presensiPreview"></div>

        <button onclick="cetakPresensi()" class="btn-primary w-full sm:w-auto px-6 py-2.5 rounded-xl text-sm flex items-center justify-center gap-2 mt-4">
          <i data-lucide="printer" class="w-4 h-4"></i>Cetak Presensi
        </button>
      `}
    </div>
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
  const preview = document.getElementById('presensiPreview');
  if(!preview) return;
  if(!ek){ preview.innerHTML = ''; return; }

  const tanggalList = tanggalPertemuanBulan(ek.hariJadwal, st.bulan);
  const anggota = DB.siswa.filter(s=>s.ekskulIds.includes(ek.id) && s.aktif!==false);

  preview.innerHTML = `
    <div class="glass rounded-2xl p-4 text-sm space-y-2">
      <div class="flex justify-between"><span class="text-slate-500">Hari Latihan</span><span class="font-semibold">${ek.hariJadwal.join(' & ')}</span></div>
      <div class="flex justify-between"><span class="text-slate-500">Pertemuan Bulan Ini</span><span class="font-semibold">${tanggalList.length ? tanggalList.length + 'x (' + tanggalList.map(d=>String(d.getDate()).padStart(2,'0')).join(', ') + ')' : '0'}</span></div>
      <div class="flex justify-between"><span class="text-slate-500">Siswa Aktif</span><span class="font-semibold">${anggota.length} siswa</span></div>
      ${tanggalList.length===0 ? '<p class="text-xs font-medium" style="color:var(--rose-500)">Tidak ada tanggal pertemuan pada bulan ini untuk hari latihan ekstrakurikuler ini.</p>' : ''}
      ${anggota.length===0 ? '<p class="text-xs font-medium" style="color:var(--rose-500)">Belum ada siswa aktif pada ekstrakurikuler ini.</p>' : ''}
    </div>
  `;
}

function cetakPresensi(){
  const st = window._presensiState;
  const ek = ekskulById(st.ekskulId);
  const pg = DB.pengaturan;
  if(!ek){ showToast('Pilih ekstrakurikuler terlebih dahulu.', 'error'); return; }

  const tanggalList = tanggalPertemuanBulan(ek.hariJadwal, st.bulan);
  const anggota = DB.siswa.filter(s=>s.ekskulIds.includes(ek.id) && s.aktif!==false).sort((a,b)=>a.nama.localeCompare(b.nama,'id'));

  if(tanggalList.length===0){ showToast('Tidak ada tanggal pertemuan pada bulan yang dipilih untuk ekstrakurikuler ini.', 'error'); return; }
  if(anggota.length===0){ showToast('Belum ada siswa aktif pada ekstrakurikuler ini.', 'error'); return; }

  const kolomTanggal = tanggalList.map(d=>`<th>${HARI_PENDEK[d.getDay()]}<br>${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}</th>`).join('');
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
      h1{font-size:17px; margin:0;} h2{font-size:14px; margin:14px 0 4px;}
      h3.section-title{font-size:12.5px; margin:18px 0 6px; padding-top:10px; border-top:1px dashed #ccc; color:#123B78;}
      .header{display:flex; align-items:center; gap:14px; border-bottom:2px solid #123B78; padding-bottom:12px; margin-bottom:12px;}
      .header img{width:50px; height:50px; object-fit:contain;}
      .meta{font-size:11.5px; color:#333; margin-bottom:14px;}
      .meta span{margin-right:18px;}
      table{width:100%; border-collapse:collapse; font-size:11px; margin-bottom:16px;}
      th,td{border:1px solid #999; padding:6px 5px; text-align:left;}
      th{background:#f1f5f9; text-align:center; font-size:10.5px;}
      td.text-center{text-align:center;}
      td:not(.text-center):not(:nth-child(2)){text-align:center;}
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
        <input id="aktivitasSearchInput" type="text" value="${aktivitasFilterQuery}" placeholder="Cari pengguna, aksi, atau detail..." class="input-glass w-full rounded-xl pl-10 pr-3.5 py-2.5 text-sm">
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

function updateHalamanPublikPreview(){
  const namaEl = document.getElementById('hpNamaWeb');
  const taglineEl = document.getElementById('hpTagline');
  const preview = document.getElementById('hpPreview');
  const previewFooter = document.getElementById('hpPreviewFooter');
  if(!preview) return;
  const nama = (namaEl ? namaEl.value : DB.pengaturan.publikNamaWeb) || 'SIKAPASA';
  const tagline = (taglineEl ? taglineEl.value : DB.pengaturan.publikTagline) || 'Sistem Informasi Keuangan Ekstrakurikuler';
  const logoHtml = DB.pengaturan.publikLogo
    ? `<img src="${DB.pengaturan.publikLogo}" class="w-full h-full object-contain rounded-[10px]">`
    : `<svg width="19" height="19" viewBox="0 0 24 24" fill="none"><path d="M12 3L2 8l10 5 8-4v6" stroke="#FFFFFF" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M6 10.5V16c0 1.4 2.7 3 6 3s6-1.6 6-3v-5.5" stroke="#FFFFFF" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  preview.innerHTML = `
    <div class="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 overflow-hidden" style="background:linear-gradient(135deg,#0E6B58,#14A085)">${logoHtml}</div>
    <div class="min-w-0">
      <p class="font-extrabold text-sm truncate">${escapeHtml(nama)}</p>
      <p class="text-[11px] text-slate-500 truncate">Nama sekolah tampil di sini (dari Kop Laporan)</p>
    </div>`;
  if(previewFooter) previewFooter.textContent = `${nama} — ${tagline}`;
}

function simpanHalamanPublik(){
  if(!requireEdit()) return;
  const namaWeb = document.getElementById('hpNamaWeb').value.trim();
  const tagline = document.getElementById('hpTagline').value.trim();
  if(!namaWeb){ showToast('Nama web tidak boleh kosong.', 'error'); return; }
  DB.pengaturan.publikNamaWeb = namaWeb;
  DB.pengaturan.publikTagline = tagline;
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
            <input id="hpNamaWeb" type="text" value="${escapeHtml(pg.publikNamaWeb||'')}" maxlength="40" class="input-glass w-full rounded-xl px-3.5 py-2.5 text-sm" placeholder="Contoh: SIKAPASA">
          </div>
          <div>${fieldLabel('Tagline / Deskripsi Singkat')}
            <input id="hpTagline" type="text" value="${escapeHtml(pg.publikTagline||'')}" maxlength="100" class="input-glass w-full rounded-xl px-3.5 py-2.5 text-sm" placeholder="Contoh: Sistem Informasi Keuangan Ekstrakurikuler">
            <p class="text-[11px] text-slate-400 mt-1.5">Ditampilkan di footer halaman publik, di samping nama web.</p>
          </div>
        </div>
        <div class="flex justify-end mt-5">
          <button onclick="simpanHalamanPublik()" class="btn-primary px-5 py-2.5 rounded-xl text-sm flex items-center gap-2"><i data-lucide="save" class="w-4 h-4"></i>Simpan</button>
        </div>
      </div>

      <div class="glass-strong rounded-3xl p-6">
        <p class="text-xs font-semibold text-slate-500 mb-3">Pratinjau Header Halaman Publik</p>
        <div class="rounded-2xl border border-dashed border-slate-300 bg-white/70 p-4">
          <div id="hpPreview" class="flex items-center gap-3"></div>
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

  document.getElementById('hpNamaWeb').addEventListener('input', updateHalamanPublikPreview);
  document.getElementById('hpTagline').addEventListener('input', updateHalamanPublikPreview);
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

      <div class="glass-strong rounded-3xl p-6">
        <h3 class="font-bold text-sm mb-4 flex items-center gap-2"><i data-lucide="badge-check" class="w-4 h-4" style="color:var(--amber-400)"></i>Penanggung Jawab</h3>
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
          ${DB.kategoriPengeluaran.map(k=>`<span class="badge px-2.5 py-1.5 rounded-full glass flex items-center gap-1.5">${escapeHtml(k)} <button onclick='hapusKategori(${JSON.stringify(k)})' title="Hapus kategori" aria-label="Hapus kategori ${escapeHtml(k)}" class="text-slate-500 hover:text-rose-500"><i data-lucide="x" class="w-3 h-3"></i></button></span>`).join('')}
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
  const tanggalFile = hariIniDate().toISOString().slice(0,10);
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
      onConfirm: ()=>{
        const namaFileBackup = file.name;
        DB = normalizeDB(candidate);
        catatAktivitas('Pulihkan dari Backup', namaFileBackup);
        // PERBAIKAN: dulu pakai saveDB(DB) → RPC save_all(), yang sekarang
        // cuma UPSERT (lihat CATATAN PERBAIKAN BESAR di save_all()) dan
        // TIDAK PERNAH menghapus data yang tidak eksplisit diminta — cocok
        // untuk simpanan normal, tapi SALAH untuk restore backup, yang
        // secara definisi memang harus menghapus data yang dibuat setelah
        // tanggal backup itu. restoreDB() memanggil RPC terpisah,
        // restore_backup(), yang memakai logika hapus-lalu-tulis-ulang
        // (lihat supabase-schema.sql) — hanya dipanggil di sini, setelah
        // konfirmasi eksplisit dari pengguna di atas.
        restoreDB(DB);
        showToast('Data berhasil dipulihkan dari backup.');
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
  document.getElementById('publicHeroDesc').innerHTML = `Selamat datang Bapak/Ibu Wali Murid <b>${escapeHtml(namaSekolah)}</b>. Pilih ekstrakurikuler dan nama putra/putri Anda untuk memeriksa status serta riwayat pembayaran.`;

  // Identitas web publik (logo, nama, tagline) — diatur di menu admin Halaman Publik.
  const namaWeb = pg.publikNamaWeb || 'SIKAPASA';
  const tagline = pg.publikTagline || 'Sistem Informasi Keuangan Ekstrakurikuler';
  document.getElementById('publicBrandName').textContent = namaWeb;
  document.getElementById('publicFooterBrand').textContent = `${namaWeb} — ${tagline}`;
  const crest = document.getElementById('publicCrest');
  crest.innerHTML = pg.publikLogo
    ? `<img src="${pg.publikLogo}" class="w-full h-full object-contain rounded-[10px]">`
    : `<svg width="19" height="19" viewBox="0 0 24 24" fill="none"><path d="M12 3L2 8l10 5 8-4v6" stroke="#FFFFFF" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M6 10.5V16c0 1.4 2.7 3 6 3s6-1.6 6-3v-5.5" stroke="#FFFFFF" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

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

  const totalDibayar = riwayat.reduce((s,p)=> s + (p.nominal||0), 0);
  const jenisBulanan = ek.jenisPembayaran === 'bulanan';
  const labelSatuan = jenisBulanan ? 'bulan' : 'pertemuan';
  const labelSatuanCap = jenisBulanan ? 'BULAN' : 'PERTEMUAN';
  const initial = (sw.nama.trim()[0] || '?').toUpperCase();
  const jadwal = (ek.hariJadwal||[]).join(' & ') || '-';

  const html = `
    <div class="pub-receipt pub-glass-strong pub-anim">
      <div class="pub-receipt-head">
        <div style="display:flex; align-items:center; gap:14px;">
          <div class="pub-avatar">${escapeHtml(initial)}</div>
          <div>
            <p class="pub-student-name">${escapeHtml(sw.nama)}</p>
            <div class="pub-tag-row">
              <span class="pub-tag">Kelas ${escapeHtml(sw.kelas)}</span>
              <span class="pub-tag-pill">${escapeHtml(ek.nama)}</span>
              <span class="pub-tag-pill">${jenisBulanan?'Bulanan':'Per Pertemuan'}</span>
            </div>
          </div>
        </div>
        <span class="pub-stamp"><span class="pub-stamp-dot"></span>${riwayat.length} ${labelSatuanCap} LUNAS</span>
      </div>

      <div class="pub-summary">
        <div>
          <p class="pub-summary-label">Total Dibayar</p>
          <p class="pub-summary-value pub-accent">${rupiah(totalDibayar)}</p>
        </div>
        <div>
          <p class="pub-summary-label">Kehadiran</p>
          <p class="pub-summary-value">${riwayat.length} ${labelSatuan}</p>
        </div>
        <div>
          <p class="pub-summary-label">Tarif / ${jenisBulanan?'Bulan':'Pertemuan'}</p>
          <p class="pub-summary-value">${rupiah(ek.tarif)}</p>
        </div>
        <div>
          <p class="pub-summary-label">Jadwal Latihan</p>
          <p class="pub-summary-value" style="font-size:14px;">${escapeHtml(jadwal)}</p>
        </div>
      </div>

      <div>
        <p class="pub-history-title">Riwayat Pembayaran</p>
        ${riwayat.length ? riwayat.map(p=>`
          <div class="pub-txn">
            <div style="display:flex; align-items:center; gap:12px; min-width:0;">
              <span class="pub-txn-check">✓</span>
              <div style="min-width:0;">
                <p class="pub-txn-date">${jenisBulanan ? bulanNama(p.periode) : tanggalIndo(p.periode)}</p>
                <p class="pub-txn-sub">Dibayar ${tanggalIndo(p.tanggalBayar)}</p>
              </div>
            </div>
            <p class="pub-txn-amount">${rupiah(p.nominal)}<span>LUNAS</span></p>
          </div>
        `).join('') : `<p class="pub-empty">Belum ada riwayat pembayaran untuk ekstrakurikuler ini.</p>`}
      </div>
    </div>
  `;

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

  const ok = await fetchDBFromServer();
  if(!ok){
    clearSession();
    window.location.href = 'login.html';
    return;
  }

  document.getElementById('sidebarUserName').textContent = currentUserName();
  document.getElementById('sidebarUserRole').textContent = roleLabel(currentRole);
  document.getElementById('sidebarUserAvatar').textContent = (currentUserName().trim()[0] || (currentRole==='kepsek'?'K':'B')).toUpperCase();
  renderNav();
  navigate('dashboard');
  // Tampilkan aplikasi (disembunyikan dulu di HTML agar tidak "berkedip"
  // sebelum data & sesi selesai divalidasi di atas).
  document.getElementById('app').style.display = '';
}
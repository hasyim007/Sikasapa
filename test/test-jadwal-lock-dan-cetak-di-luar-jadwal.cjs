const fs = require('fs');
const vm = require('vm');
const src = fs.readFileSync('public/script_core.js', 'utf8');

// --- Fake DOM cukup lengkap supaya fungsi UI ASLI (submitEkstraAbsensi,
// cetakPresensiAbsensiJalankan, dst) bisa dipanggil langsung tanpa crash,
// tanpa perlu reimplementasi manual logicnya. ---
function fakeEl(overrides){
  const base = {
    value: '', innerHTML: '', textContent: '', style: {}, dataset: {},
    classList: { add(){}, remove(){}, toggle(){} },
    appendChild(){}, remove(){}, focus(){}, querySelector(){ return null; },
    querySelectorAll(){ return []; }, insertAdjacentElement(){},
    addEventListener(){}, removeEventListener(){},
    parentElement: null,
  };
  const el = Object.assign(base, overrides || {});
  el.parentElement = el.parentElement || base;
  return el;
}
global.fakeEl = fakeEl;

global.byId = {}; // diisi tiap test sebelum memanggil fungsi UI
global.qsAll = {}; // diisi tiap test untuk querySelectorAll(selector)
const byId = global.byId, qsAll = global.qsAll;

global.window = global;
global.addEventListener = function(){};
global.document = {
  addEventListener(){}, removeEventListener(){},
  getElementById(id){ return byId[id] || fakeEl(); },
  querySelectorAll(sel){ return qsAll[sel] || []; },
  createElement(){ return fakeEl(); },
  body: { appendChild(){} },
};
global.navigator = { userAgent: 'node' };
global.localStorage = { getItem(){return null;}, setItem(){}, removeItem(){} };
global.fetch = async () => { throw new Error('fetch not available in test'); };
// window.open() dipakai oleh cetakPresensiAbsensiJalankan() untuk membuka
// tab cetak baru — kita tangkap HTML yang ditulis supaya bisa diperiksa.
global.__lastPrintedHtml = null;
global.open = function(){
  return {
    document: { write(html){ global.__lastPrintedHtml = html; }, close(){} },
    print(){},
  };
};

const testScript = `
hariIniDate = function(){ return new Date(2026, 8, 15); }; // Selasa, 15 Sep 2026

function assert(cond, msg){
  if(!cond){ console.error('FAIL:', msg); global.__failed = true; }
  else console.log('OK:', msg);
}

DB = {
  ekskul: [], siswa: [], pemasukan: [], pengeluaran: [], kategoriPengeluaran: [],
  ekstraAbsensi: [], guru: [], absensi: [], aktivitas: [],
  pengaturan: { hariLibur: [], logo: null, tahunAjaran: '2026/2027' },
};

// ============================================================
// Setup: ekskul "Tahfidz" tertaut ke ekstraAbsensi, jadwal Kamis & Sabtu.
// ============================================================
const hariJadwal = ['Kamis','Sabtu'];
const ea = { id: uid('ea'), nama: 'Tahfidz', keterangan: '', warna: '#1769D1', hariJadwal: hariJadwal.slice() };
DB.ekstraAbsensi.push(ea);
const ek = { id: uid('ek'), nama: 'Tahfidz', pembina: 'Bu Sari', jenisPembayaran: 'bulanan', tarif: 20000, warna: '#1769D1', hariJadwal: hariJadwal.slice(), ekstraAbsensiId: ea.id };
DB.ekskul.push(ek);

const siswa = { id: uid('sw'), nama: 'Ahmad Rizki', kelas: 'V A', ekskulIds: [ek.id], aktif: true, ekstraAbsensiIds: [] };
DB.siswa.push(siswa);
syncPesertaAbsensiDariEkskul(siswa);

// ============================================================
// TEST #4: jadwal ekstraAbsensi yang TERTAUT tidak boleh bisa diubah
// menyimpang dari jadwal ekskul, walau checkbox yang di-submit beda.
// ============================================================
byId['eaNama'] = fakeEl({ value: 'Tahfidz' });
byId['eaKeterangan'] = fakeEl({ value: '' });
byId['eaWarna'] = fakeEl({ value: '#1769D1' });
// Guru/bendahara "curang" mencentang Senin & Rabu saja (beda dari jadwal
// ekskul Kamis & Sabtu) — mensimulasikan submit manual/bypass UI, karena
// checkbox-nya seharusnya sudah di-disable di layar.
qsAll['.ea-hari:checked'] = [{ value: 'Senin' }, { value: 'Rabu' }];

submitEkstraAbsensi(ea.id);

assert(JSON.stringify(ea.hariJadwal) === JSON.stringify(hariJadwal),
  'jadwal ekstraAbsensi yang tertaut TETAP ikut jadwal ekskul (Kamis & Sabtu), walau checkbox yang disubmit beda (Senin & Rabu)');

// Lepas tautan, sekarang jadwal harus bisa diubah bebas lagi.
ek.ekstraAbsensiId = null;
qsAll['.ea-hari:checked'] = [{ value: 'Senin' }];
submitEkstraAbsensi(ea.id);
assert(JSON.stringify(ea.hariJadwal) === JSON.stringify(['Senin']),
  'setelah tautan dilepas, jadwal ekstraAbsensi kembali bisa diubah bebas (Senin)');

// Pasang lagi tautannya untuk test berikutnya, kembalikan jadwal semula.
ek.ekstraAbsensiId = ea.id;
ea.hariJadwal = hariJadwal.slice();

// ============================================================
// TEST #3: tanggal absensi di luar jadwal TIDAK hilang saat Cetak Presensi.
// ============================================================
// Tanggal jadwal Sept 2026 untuk Kamis&Sabtu s.d. sekarang: 3,5,10,12 Sept
// (dan seterusnya). Guru salah pilih / pertemuan pengganti di Senin 14 Sept
// (BUKAN hari jadwal) dan tetap mengisi absensi untuk tanggal itu.
DB.absensi.push({ id: uid('ab'), ekstraId: ea.id, siswaId: siswa.id, tanggal: '2026-09-03', status: 'hadir' });
DB.absensi.push({ id: uid('ab'), ekstraId: ea.id, siswaId: siswa.id, tanggal: '2026-09-14', status: 'hadir' }); // Senin, di luar jadwal!

byId['cpaEkstra'] = fakeEl({ value: ea.id });
byId['cpaBulan'] = fakeEl({ value: '2026-09' });
currentUserName = function(){ return 'Bendahara Test'; };
roleLabel = typeof roleLabel === 'function' ? roleLabel : function(){ return 'Bendahara'; };

cetakPresensiAbsensiJalankan();

const html = global.__lastPrintedHtml || '';
assert(!!html, 'cetakPresensiAbsensiJalankan() berhasil menulis HTML cetak (tidak error)');
assert(html.includes('14/09'), 'tanggal 14 Sept (di luar jadwal, tapi ADA data absensi) tetap muncul sebagai kolom di lembar cetak — tidak hilang');
assert(html.includes('03/09'), 'tanggal 03 Sept (sesuai jadwal) tetap muncul seperti biasa');
assert(html.includes('di luar jadwal'), 'legenda/penanda "di luar jadwal" muncul di lembar cetak untuk transparansi ke bendahara/guru');

console.log(global.__failed ? '\\n=== ADA YANG GAGAL ===' : '\\n=== SEMUA CEK LULUS ===');
if(global.__failed) process.exitCode = 1;
`;

const context = vm.createContext(global);
vm.runInContext(src + '\n' + testScript, context, { filename: 'script_core.js+test' });

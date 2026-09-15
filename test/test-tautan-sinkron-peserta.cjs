const fs = require('fs');
const vm = require('vm');
const src = fs.readFileSync('public/script_core.js', 'utf8');

global.window = global;
global.addEventListener = function(){};
global.document = {
  addEventListener(){}, getElementById(){ return null; }, querySelectorAll(){ return []; },
  createElement(){ return { style:{}, classList:{add(){},remove(){}} }; },
};
global.navigator = { userAgent: 'node' };
global.localStorage = { getItem(){return null;}, setItem(){}, removeItem(){} };
global.fetch = async () => { throw new Error('fetch not available in test'); };

const testScript = `
// override hariIniDate supaya deterministik: Selasa, 15 Sep 2026
hariIniDate = function(){ return new Date(2026, 8, 15); };

function assert(cond, msg){
  if(!cond){ console.error('FAIL:', msg); global.__failed = true; }
  else console.log('OK:', msg);
}

DB = {
  ekskul: [], siswa: [], pemasukan: [], pengeluaran: [], kategoriPengeluaran: [],
  ekstraAbsensi: [], guru: [], absensi: [], aktivitas: [],
  pengaturan: { hariLibur: [] },
};

// LANGKAH 1: buat ekskul baru dengan tautan "buat jenis absensi baru"
const hariJadwal = ['Selasa'];
const nama = 'Futsal';
let ekstraAbsensiId = null;
{
  const baru = { id: uid('ea'), nama, keterangan: '', warna: '#1769D1', hariJadwal: hariJadwal.slice() };
  DB.ekstraAbsensi.push(baru);
  ekstraAbsensiId = baru.id;
}
const ek = { id: uid('ek'), nama, pembina: 'Pak Budi', jenisPembayaran: 'pertemuan', tarif: 5000, warna: '#1769D1', hariJadwal, ekstraAbsensiId };
DB.ekskul.push(ek);
syncSemuaPesertaAbsensiDariEkskul();

assert(DB.ekstraAbsensi.length === 1, 'jenis absensi baru otomatis terbuat saat ekskul dibuat dengan tautan "buat baru"');
assert(ekskulTertautKe(ekstraAbsensiId) === ek, 'ekskulTertautKe() mengenali ekskul sebagai pemilik tautan');

// LANGKAH 2: tambah siswa baru, ikut ekskul ini
const siswa = { id: uid('sw'), nama: 'Ahmad Rizki', kelas: 'V A', ekskulIds: [ek.id], aktif: true, ekstraAbsensiIds: [] };
DB.siswa.push(siswa);
syncPesertaAbsensiDariEkskul(siswa);

// LANGKAH 3: cek otomatis muncul sebagai peserta Kelola Absensi
assert(siswa.ekstraAbsensiIds.includes(ekstraAbsensiId), 'siswa baru otomatis jadi peserta Kelola Absensi tanpa didaftar manual');
assert(pesertaAbsensi(ekstraAbsensiId).some(s => s.id === siswa.id), 'pesertaAbsensi() menampilkan siswa ini untuk jenis absensi tertaut');

// LANGKAH 4: isi absensi 3 tanggal pertemuan s.d. hari ini: hadir, izin, sakit
// tanggalPertemuanBulan() sengaja mengembalikan SEMUA tanggal sebulan penuh
// (dipakai juga oleh Cetak Presensi); yang "sudah lewat" difilter terpisah
// oleh hitungEstimasiTunggakanPertemuan() lewat hariIniOnly. Test ini hanya
// perlu 3 tanggal PERTAMA (1,8,15 Sept - s.d. hari ini) untuk diisi absensi.
const semuaTanggalBulan = tanggalPertemuanBulan(hariJadwal, currentPeriodeBulan())
  .map(d => d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'));
console.log('Semua tanggal pertemuan bulan ini:', semuaTanggalBulan);
assert(semuaTanggalBulan.length === 5, 'tanggalPertemuanBulan() -> 5 tanggal Selasa di September 2026 (1,8,15,22,29), belum difilter "sudah lewat"');
const tanggalPertemuan = semuaTanggalBulan.filter(s => s <= '2026-09-15');
assert(tanggalPertemuan.length === 3, 'tanggal yang sudah lewat s.d. 15 Sept ada 3 (1,8,15) — sama seperti tanggalLewat di hitungEstimasiTunggakanPertemuan()');

DB.absensi.push({ id: uid('ab'), ekstraId: ekstraAbsensiId, siswaId: siswa.id, tanggal: tanggalPertemuan[0], status: 'hadir' });
DB.absensi.push({ id: uid('ab'), ekstraId: ekstraAbsensiId, siswaId: siswa.id, tanggal: tanggalPertemuan[1], status: 'izin' });
DB.absensi.push({ id: uid('ab'), ekstraId: ekstraAbsensiId, siswaId: siswa.id, tanggal: tanggalPertemuan[2], status: 'sakit' });

// LANGKAH 5: cek Tunggakan tidak ikut menagih tanggal izin/sakit
const est = hitungEstimasiTunggakanPertemuan();
const rekapEk = est.find(r => r.ek.id === ek.id);
assert(!!rekapEk, 'ekskul muncul di rekap Estimasi Tunggakan Per Pertemuan');
const rincianSiswa = rekapEk.rincian.find(r => r.siswa.id === siswa.id);
console.log('Rincian siswa:', rincianSiswa);
assert(!!rincianSiswa, 'siswa muncul di rincian tunggakan (kurang > 0)');
assert(rincianSiswa.wajibBayar === 1, 'wajibBayar cuma 1 (tanggal hadir) — 2 tanggal izin/sakit TIDAK ikut ditagih');
assert(rincianSiswa.belumDiisiCount === 0, 'belumDiisiCount 0 karena ketiga tanggal sudah diisi guru');
assert(rincianSiswa.kurang === 1, 'kurang = wajibBayar(1) - sudahBayar(0) = 1, bukan 3');

// LANGKAH 6 (tambahan): lepas tautan -> peserta absensi tidak lagi auto-sync
ek.ekstraAbsensiId = null;
syncSemuaPesertaAbsensiDariEkskul();
assert(siswa.ekstraAbsensiIds.includes(ekstraAbsensiId), 'setelah tautan dilepas, peserta yang sudah ada TETAP ada di Kelola Absensi (tidak hilang otomatis)');
assert(ekskulTertautKe(ekstraAbsensiId) === undefined, 'setelah dilepas, tidak ada ekskul lain yang mengklaim tautan ke jenis absensi ini');

console.log(global.__failed ? '\\n=== ADA YANG GAGAL ===' : '\\n=== SEMUA CEK LULUS ===');
if(global.__failed) process.exitCode = 1;
`;

const context = vm.createContext(global);
vm.runInContext(src + '\n' + testScript, context, { filename: 'script_core.js+test' });

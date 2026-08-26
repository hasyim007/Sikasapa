-- =========================================================
-- SIKasapa — Skema Supabase (Postgres)
-- Pengganti Google Spreadsheet + Code.gs.
-- Jalankan seluruh file ini sekali lewat Supabase SQL Editor.
--
-- ARSITEKTUR:
-- Semua akses dari browser (public.html/login.html/admin.html)
-- HANYA lewat 6 fungsi RPC di bawah (login, logout, get_app_data,
-- get_public_data, get_public_riwayat, save_all, request_upload_ok).
-- Tabel aslinya TIDAK bisa diakses langsung dari browser (RLS
-- menutup semuanya) — jadi tidak perlu Edge Function terpisah,
-- tapi validasi token & password tetap terjadi di sisi server
-- (dalam database), bukan di browser.
-- =========================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------
-- TABEL
-- ---------------------------------------------------------

create table if not exists ekskul (
  id text primary key,
  nama text not null,
  pembina text default '',
  jenis_pembayaran text default 'pertemuan',
  tarif numeric default 0,
  hari_jadwal jsonb default '[]'::jsonb,
  warna text default '#1769D1'
);

create table if not exists siswa (
  id text primary key,
  nama text not null,
  kelas text default '',
  ekskul_ids jsonb default '[]'::jsonb,
  aktif boolean default true,
  wali_nama text default '',
  wali_hp text default ''
);

create table if not exists pemasukan (
  id text primary key,
  siswa_id text references siswa(id) on delete cascade,
  ekskul_id text references ekskul(id) on delete cascade,
  jenis text default 'pertemuan',
  periode text default '',
  nominal numeric default 0,
  tanggal_bayar text default '',
  keterangan text default ''
);

create table if not exists pengeluaran (
  id text primary key,
  ekskul_id text references ekskul(id) on delete cascade,
  kategori text default '',
  nominal numeric default 0,
  tanggal text default '',
  keterangan text default '',
  bukti text
);

create table if not exists kategori_pengeluaran (
  kategori text primary key
);

create table if not exists aktivitas (
  id text primary key,
  waktu text not null,
  "user" text default '',
  role text default '',
  aksi text default '',
  detail text default ''
);

-- Satu baris saja (id selalu 1) — setara sheet Pengaturan lama.
create table if not exists pengaturan (
  id int primary key default 1,
  tahun_ajaran text default '2026/2027',
  logo text,
  kepala_sekolah text default '',
  nip_kepsek text default '',
  bendahara text default '',
  nip_bendahara text default '',
  username text default 'bendahara',
  password_hash text,
  nama_kepsek_akun text default '',
  username_kepsek text default 'kepsek',
  password_kepsek_hash text,
  publik_nama_web text default 'SIKAPASA',
  publik_logo text,
  publik_tagline text default 'Sistem Informasi Keuangan Ekstrakurikuler',
  kop_lines jsonb default '[{"text":"SDN 01 Papahan","size":14,"bold":true}]'::jsonb,
  constraint pengaturan_single_row check (id = 1)
);

create table if not exists sessions (
  token text primary key,
  role text not null,
  created_at bigint not null,
  expires_at bigint not null
);

-- Sesi berlaku 12 jam, sama seperti versi Apps Script.
-- Ubah angka di bawah (dalam milidetik) kalau mau diganti.
-- 12 jam = 43200000 ms

-- ---------------------------------------------------------
-- ISI AWAL (akun default + kategori default) — hanya jalan
-- kalau tabel memang masih kosong.
-- ---------------------------------------------------------
insert into pengaturan (id, username, password_hash, username_kepsek, password_kepsek_hash, bendahara, nama_kepsek_akun)
select 1,
  'bendahara', encode(digest('bendahara:sikasapa123:sikasapa-v1', 'sha256'), 'hex'),
  'kepsek', encode(digest('kepsek:kepsek123:sikasapa-v1', 'sha256'), 'hex'),
  'Bendahara', 'Kepala Sekolah'
where not exists (select 1 from pengaturan where id = 1);

insert into kategori_pengeluaran (kategori)
select k from unnest(array['Peralatan','Transport Lomba','Konsumsi','Seragam','Piala/Penghargaan','Lainnya']) as k
where not exists (select 1 from kategori_pengeluaran limit 1);

-- ---------------------------------------------------------
-- KUNCI SEMUA TABEL DARI AKSES LANGSUNG (RLS aktif, tanpa
-- policy = tanpa akses sama sekali dari anon/authenticated).
-- Satu-satunya jalan masuk adalah lewat fungsi RPC di bawah,
-- yang jalan sebagai SECURITY DEFINER (hak akses "pemilik").
-- ---------------------------------------------------------
alter table ekskul enable row level security;
alter table siswa enable row level security;
alter table pemasukan enable row level security;
alter table pengeluaran enable row level security;
alter table kategori_pengeluaran enable row level security;
alter table aktivitas enable row level security;
alter table pengaturan enable row level security;
alter table sessions enable row level security;

-- ---------------------------------------------------------
-- FUNGSI BANTU
-- ---------------------------------------------------------

-- Cek token & kembalikan role ('bendahara'/'kepsek') kalau valid,
-- sekalian hapus sesi yang sudah lewat masa berlaku.
create or replace function _cek_sesi(p_token text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_now bigint := (extract(epoch from now()) * 1000)::bigint;
begin
  delete from sessions where expires_at <= v_now;
  if p_token is null or p_token = '' then
    return null;
  end if;
  select role into v_role from sessions where token = p_token;
  return v_role;
end;
$$;

-- ---------------------------------------------------------
-- LOGIN / LOGOUT
-- ---------------------------------------------------------
create or replace function login(p_username text, p_password text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  pg record;
  v_role text;
  v_nama text;
  v_token text;
  v_now bigint := (extract(epoch from now()) * 1000)::bigint;
begin
  if p_username is null or p_username = '' or p_password is null or p_password = '' then
    return jsonb_build_object('ok', false, 'error', 'Username dan password wajib diisi.');
  end if;

  select * into pg from pengaturan where id = 1;

  if p_username = pg.username and encode(digest(p_username || ':' || p_password || ':sikasapa-v1', 'sha256'), 'hex') = pg.password_hash then
    v_role := 'bendahara'; v_nama := coalesce(pg.bendahara, 'Bendahara');
  elsif p_username = pg.username_kepsek and encode(digest(p_username || ':' || p_password || ':sikasapa-v1', 'sha256'), 'hex') = pg.password_kepsek_hash then
    v_role := 'kepsek'; v_nama := coalesce(pg.nama_kepsek_akun, 'Kepala Sekolah');
  end if;

  if v_role is null then
    return jsonb_build_object('ok', false, 'error', 'Username atau password salah.');
  end if;

  v_token := gen_random_uuid()::text || '-' || gen_random_uuid()::text;
  insert into sessions(token, role, created_at, expires_at) values (v_token, v_role, v_now, v_now + 43200000);
  insert into aktivitas(id, waktu, "user", role, aksi, detail)
    values (gen_random_uuid()::text, now()::text, v_nama, v_role, 'Login',
      (case when v_role = 'kepsek' then 'Kepala Sekolah' else 'Bendahara Sekolah' end) || ' masuk ke aplikasi.');

  return jsonb_build_object('ok', true, 'role', v_role, 'token', v_token, 'nama', v_nama);
end;
$$;

create or replace function logout(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  select role into v_role from sessions where token = p_token;
  if v_role is not null then
    delete from sessions where token = p_token;
    insert into aktivitas(id, waktu, "user", role, aksi, detail)
      values (gen_random_uuid()::text, now()::text, '-', v_role, 'Logout',
        (case when v_role = 'kepsek' then 'Kepala Sekolah' else 'Bendahara Sekolah' end) || ' keluar dari aplikasi.');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------
-- BACA DATA — DASHBOARD ADMIN (butuh token, role apa saja)
-- ---------------------------------------------------------
create or replace function get_app_data(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := _cek_sesi(p_token);
  pg record;
begin
  if v_role is null then
    return jsonb_build_object('ok', false, 'error', 'Sesi tidak valid atau sudah kedaluwarsa. Silakan login ulang.');
  end if;

  select * into pg from pengaturan where id = 1;

  return jsonb_build_object('ok', true, 'db', jsonb_build_object(
    'ekskul', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', id, 'nama', nama, 'pembina', pembina, 'jenisPembayaran', jenis_pembayaran,
        'tarif', tarif, 'hariJadwal', hari_jadwal, 'warna', warna)), '[]'::jsonb) from ekskul),
    'siswa', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', id, 'nama', nama, 'kelas', kelas, 'ekskulIds', ekskul_ids,
        'aktif', aktif, 'waliNama', wali_nama, 'waliHp', wali_hp)), '[]'::jsonb) from siswa),
    'pemasukan', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', id, 'siswaId', siswa_id, 'ekskulId', ekskul_id, 'jenis', jenis, 'periode', periode,
        'nominal', nominal, 'tanggalBayar', tanggal_bayar, 'keterangan', keterangan)), '[]'::jsonb) from pemasukan),
    'pengeluaran', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', id, 'ekskulId', ekskul_id, 'kategori', kategori, 'nominal', nominal,
        'tanggal', tanggal, 'keterangan', keterangan, 'bukti', bukti)), '[]'::jsonb) from pengeluaran),
    'kategoriPengeluaran', (select coalesce(jsonb_agg(kategori), '[]'::jsonb) from kategori_pengeluaran),
    'aktivitas', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', id, 'waktu', waktu, 'user', "user", 'role', role, 'aksi', aksi, 'detail', detail)
        order by waktu desc), '[]'::jsonb) from aktivitas),
    'pengaturan', jsonb_build_object(
        'tahunAjaran', pg.tahun_ajaran, 'logo', pg.logo, 'kepalaSekolah', pg.kepala_sekolah,
        'nipKepsek', pg.nip_kepsek, 'bendahara', pg.bendahara, 'nipBendahara', pg.nip_bendahara,
        'username', pg.username, 'usernameKepsek', pg.username_kepsek, 'namaKepsekAkun', pg.nama_kepsek_akun,
        'publikNamaWeb', pg.publik_nama_web, 'publikLogo', pg.publik_logo, 'publikTagline', pg.publik_tagline,
        'kopLines', pg.kop_lines)
  ));
end;
$$;

-- ---------------------------------------------------------
-- BACA DATA — HALAMAN PUBLIK (tanpa login)
-- ---------------------------------------------------------
create or replace function get_public_data()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  pg record;
begin
  select * into pg from pengaturan where id = 1;
  return jsonb_build_object('ok', true, 'db', jsonb_build_object(
    'ekskul', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', id, 'nama', nama, 'jenisPembayaran', jenis_pembayaran,
        'tarif', tarif, 'hariJadwal', hari_jadwal)), '[]'::jsonb) from ekskul),
    'siswa', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', id, 'nama', nama, 'kelas', kelas, 'ekskulIds', ekskul_ids, 'aktif', true)), '[]'::jsonb)
        from siswa where aktif = true),
    'pemasukan', '[]'::jsonb, 'pengeluaran', '[]'::jsonb, 'kategoriPengeluaran', '[]'::jsonb, 'aktivitas', '[]'::jsonb,
    'pengaturan', jsonb_build_object(
        'kopLines', pg.kop_lines, 'publikNamaWeb', pg.publik_nama_web,
        'publikLogo', pg.publik_logo, 'publikTagline', pg.publik_tagline)
  ));
end;
$$;

create or replace function get_public_riwayat(p_siswa_id text, p_ekskul_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_siswa_id is null or p_ekskul_id is null then
    return jsonb_build_object('ok', false, 'error', 'Data tidak lengkap.');
  end if;
  return jsonb_build_object('ok', true, 'riwayat', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'periode', periode, 'nominal', nominal, 'tanggalBayar', tanggal_bayar, 'keterangan', keterangan)), '[]'::jsonb)
    from pemasukan where siswa_id = p_siswa_id and ekskul_id = p_ekskul_id));
end;
$$;

-- ---------------------------------------------------------
-- SIMPAN SELURUH DB (dipanggil tiap kali admin ubah data) —
-- hanya role bendahara yang boleh, sama seperti versi lama.
-- ---------------------------------------------------------
create or replace function save_all(p_token text, p_data jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := _cek_sesi(p_token);
  r jsonb;
  pg jsonb;
  cur record;
begin
  if v_role is null then
    return jsonb_build_object('ok', false, 'error', 'Sesi tidak valid, silakan login ulang.');
  end if;
  if v_role <> 'bendahara' then
    return jsonb_build_object('ok', false, 'error', 'Hanya akun Bendahara yang bisa menyimpan perubahan.');
  end if;
  if p_data is null then
    return jsonb_build_object('ok', false, 'error', 'Data tidak valid.');
  end if;

  delete from ekskul; delete from siswa; delete from pemasukan;
  delete from pengeluaran; delete from kategori_pengeluaran; delete from aktivitas;

  for r in select * from jsonb_array_elements(coalesce(p_data->'ekskul', '[]'::jsonb)) loop
    insert into ekskul(id, nama, pembina, jenis_pembayaran, tarif, hari_jadwal, warna)
      values (r->>'id', r->>'nama', r->>'pembina', r->>'jenisPembayaran',
              coalesce((r->>'tarif')::numeric, 0), coalesce(r->'hariJadwal', '[]'::jsonb), r->>'warna');
  end loop;

  for r in select * from jsonb_array_elements(coalesce(p_data->'siswa', '[]'::jsonb)) loop
    insert into siswa(id, nama, kelas, ekskul_ids, aktif, wali_nama, wali_hp)
      values (r->>'id', r->>'nama', r->>'kelas', coalesce(r->'ekskulIds', '[]'::jsonb),
              coalesce((r->>'aktif')::boolean, true), coalesce(r->>'waliNama',''), coalesce(r->>'waliHp',''));
  end loop;

  for r in select * from jsonb_array_elements(coalesce(p_data->'pemasukan', '[]'::jsonb)) loop
    insert into pemasukan(id, siswa_id, ekskul_id, jenis, periode, nominal, tanggal_bayar, keterangan)
      values (r->>'id', r->>'siswaId', r->>'ekskulId', r->>'jenis', r->>'periode',
              coalesce((r->>'nominal')::numeric, 0), r->>'tanggalBayar', coalesce(r->>'keterangan',''));
  end loop;

  for r in select * from jsonb_array_elements(coalesce(p_data->'pengeluaran', '[]'::jsonb)) loop
    insert into pengeluaran(id, ekskul_id, kategori, nominal, tanggal, keterangan, bukti)
      values (r->>'id', r->>'ekskulId', r->>'kategori', coalesce((r->>'nominal')::numeric, 0),
              r->>'tanggal', coalesce(r->>'keterangan',''), r->>'bukti');
  end loop;

  for r in select * from jsonb_array_elements_text(coalesce(p_data->'kategoriPengeluaran', '[]'::jsonb)) loop
    insert into kategori_pengeluaran(kategori) values (r) on conflict do nothing;
  end loop;

  for r in select * from jsonb_array_elements(coalesce(p_data->'aktivitas', '[]'::jsonb)) loop
    insert into aktivitas(id, waktu, "user", role, aksi, detail)
      values (r->>'id', r->>'waktu', r->>'user', r->>'role', r->>'aksi', coalesce(r->>'detail',''));
  end loop;

  -- Pengaturan: password HANYA diganti kalau field 'password'/'passwordKepsek'
  -- benar-benar dikirim (diisi admin di form) — sama seperti writePengaturan_ lama.
  pg := coalesce(p_data->'pengaturan', '{}'::jsonb);
  select * into cur from pengaturan where id = 1;

  update pengaturan set
    tahun_ajaran = coalesce(pg->>'tahunAjaran', ''),
    logo = pg->>'logo',
    kepala_sekolah = coalesce(pg->>'kepalaSekolah', ''),
    nip_kepsek = coalesce(pg->>'nipKepsek', ''),
    bendahara = coalesce(pg->>'bendahara', ''),
    nip_bendahara = coalesce(pg->>'nipBendahara', ''),
    username = coalesce(nullif(pg->>'username',''), cur.username),
    password_hash = case when pg->>'password' is not null and pg->>'password' <> ''
                      then encode(digest(coalesce(nullif(pg->>'username',''), cur.username) || ':' || (pg->>'password') || ':sikasapa-v1', 'sha256'), 'hex')
                      else cur.password_hash end,
    nama_kepsek_akun = coalesce(pg->>'namaKepsekAkun', ''),
    username_kepsek = coalesce(nullif(pg->>'usernameKepsek',''), cur.username_kepsek),
    password_kepsek_hash = case when pg->>'passwordKepsek' is not null and pg->>'passwordKepsek' <> ''
                      then encode(digest(coalesce(nullif(pg->>'usernameKepsek',''), cur.username_kepsek) || ':' || (pg->>'passwordKepsek') || ':sikasapa-v1', 'sha256'), 'hex')
                      else cur.password_kepsek_hash end,
    publik_nama_web = coalesce(nullif(pg->>'publikNamaWeb',''), 'SIKAPASA'),
    publik_logo = pg->>'publikLogo',
    publik_tagline = coalesce(pg->>'publikTagline', 'Sistem Informasi Keuangan Ekstrakurikuler'),
    kop_lines = coalesce(pg->'kopLines', cur.kop_lines)
  where id = 1;

  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------
-- IZIN: hanya fungsi RPC di atas yang boleh dipanggil publik
-- (role anon = pengunjung belum login, dipakai oleh anon key).
-- Tabel aslinya tidak diberi izin apa pun ke anon/authenticated,
-- jadi tetap tertutup meski RLS-nya "kosong".
-- ---------------------------------------------------------
grant execute on function login(text, text) to anon;
grant execute on function logout(text) to anon;
grant execute on function get_app_data(text) to anon;
grant execute on function get_public_data() to anon;
grant execute on function get_public_riwayat(text, text) to anon;
grant execute on function save_all(text, jsonb) to anon;

-- ---------------------------------------------------------
-- TIKET UPLOAD — supaya upload file ke Storage tetap tervalidasi
-- token/role di server (bukan cuma disembunyikan di tampilan),
-- tanpa perlu Edge Function terpisah. Alurnya:
--   1. Browser minta tiket lewat request_upload_ticket(token) —
--      fungsi ini cek token & role='bendahara' di server dulu.
--   2. Tiket (acak, berlaku 5 menit) dipakai sebagai nama folder
--      tujuan upload di Storage.
--   3. Policy Storage di bawah hanya izinkan upload kalau folder
--      tujuannya cocok dengan tiket yang masih berlaku.
-- ---------------------------------------------------------
create table if not exists upload_tickets (
  ticket text primary key,
  expires_at bigint not null
);
alter table upload_tickets enable row level security;

create or replace function request_upload_ticket(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := _cek_sesi(p_token);
  v_ticket text;
  v_now bigint := (extract(epoch from now()) * 1000)::bigint;
begin
  delete from upload_tickets where expires_at <= v_now;
  if v_role is null then
    return jsonb_build_object('ok', false, 'error', 'Sesi tidak valid, silakan login ulang.');
  end if;
  if v_role <> 'bendahara' then
    return jsonb_build_object('ok', false, 'error', 'Hanya akun Bendahara yang bisa mengunggah file.');
  end if;
  v_ticket := replace(gen_random_uuid()::text, '-', '');
  insert into upload_tickets(ticket, expires_at) values (v_ticket, v_now + 300000); -- berlaku 5 menit
  return jsonb_build_object('ok', true, 'ticket', v_ticket);
end;
$$;

grant execute on function request_upload_ticket(text) to anon;

-- ---------------------------------------------------------
-- STORAGE — bucket untuk logo & bukti pengeluaran (pengganti
-- folder Google Drive). Publik untuk DIBACA (supaya tampil di
-- halaman publik & PDF); UNGGAH hanya diizinkan ke dalam folder
-- bernama tiket yang masih berlaku (lihat request_upload_ticket
-- di atas) — jadi tetap tervalidasi role Bendahara di server,
-- meski tanpa Edge Function.
-- ---------------------------------------------------------
insert into storage.buckets (id, name, public)
  values ('lampiran', 'lampiran', true)
  on conflict (id) do nothing;

create policy "lampiran_public_read" on storage.objects
  for select using (bucket_id = 'lampiran');

create policy "lampiran_ticket_upload" on storage.objects
  for insert
  with check (
    bucket_id = 'lampiran'
    and exists (
      select 1 from upload_tickets
      where ticket = (storage.foldername(name))[1]
        and expires_at > (extract(epoch from now()) * 1000)::bigint
    )
  );

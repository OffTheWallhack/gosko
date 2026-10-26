-- =====================================================================
-- Admin správa spotov a skateparkov (2026-10-26)
-- Na živej databáze už spustené (migrácie spots_admin_columns, spot_photos_table, spots_admin_policies,
-- spots_public_view_photos). Tu pre prehľad a novú inštaláciu. Spúšťať až po supabase-setup.sql a supabase-ghoskate.sql.
-- Admin stránka: #/admin/spoty (pridať, upraviť, skryť, zmazať spot; pridať, zmazať fotky, zmeniť hlavnú fotku).
-- =====================================================================

alter table public.spots
  add column if not exists area text check (char_length(area) <= 60),
  add column if not exists tag text check (char_length(tag) <= 20),
  add column if not exists updated_at timestamptz not null default now();

-- Viac fotiek k spotu (poradie `sort`, prvá je hlavná)
create table if not exists public.spot_photos (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  spot_id uuid not null references public.spots(id) on delete cascade,
  url text not null check (char_length(url) <= 500),
  path text check (char_length(path) <= 300),           -- cesta v úložisku 'spots' (NULL pri fotkách z repozitára)
  sort integer not null default 0
);
create index if not exists spot_photos_spot_idx on public.spot_photos (spot_id, sort);
alter table public.spot_photos enable row level security;
create policy "Fotky schválených spotov vidí každý" on public.spot_photos for select to anon, authenticated
  using (exists (select 1 from public.spots s where s.id = spot_id and s.approved));
create policy "Admin vidí fotky spotov" on public.spot_photos for select to authenticated using (public.is_admin());
create policy "Admin pridáva fotky spotov" on public.spot_photos for insert to authenticated with check (public.is_admin());
create policy "Admin upravuje fotky spotov" on public.spot_photos for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Admin maže fotky spotov" on public.spot_photos for delete to authenticated using (public.is_admin());
grant select on public.spot_photos to anon, authenticated;
grant insert, update, delete on public.spot_photos to authenticated;

-- Admin môže spot rovno pridať (schválený) a zmazať súbory v úložisku
create policy "Admin pridáva spoty" on public.spots for insert to authenticated with check (public.is_admin());
create policy "Admin maže fotky spotov v úložisku" on storage.objects for delete to authenticated using (bucket_id = 'spots' and public.is_admin());

-- Verejný pohľad: spoty s plochou `photos` (zoradené)
create or replace view public.spots_public as
  select s.id, s.created_at, s.name, s.city, s.kind, s.description, s.lat, s.lng, s.photo_url, s.difficulty, s.bust, s.features, s.area, s.tag,
    coalesce((select json_agg(json_build_object('url', p.url) order by p.sort, p.created_at) from public.spot_photos p where p.spot_id = s.id), '[]'::json) as photos
  from public.spots s where s.approved;
grant select on public.spots_public to anon, authenticated;

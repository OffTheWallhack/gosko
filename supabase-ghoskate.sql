-- =====================================================================
-- Spoločný účet GOSko web + Ghoskate (2026-10-17)
-- Na živej databáze už spustené (migrácie ghoskate_*). Tu pre prehľad a novú inštaláciu.
-- Jeden človek = jeden auth účet = jeden profil (prezývka, duch, doska) + inventár (loot).
-- =====================================================================

-- ---------- Inventár (loot). Veci dáva len systém (triggery) alebo admin. ----------
create table public.inventory (
  user_id uuid not null references auth.users(id) on delete cascade,
  item text not null check (char_length(item) between 1 and 60),   -- napr. 'skin:founder', 'sticker:founder-2026'
  source text check (char_length(source) <= 40),                   -- 'founder', 'spot', 'event', 'partner'…
  created_at timestamptz not null default now(),
  primary key (user_id, item)
);
alter table public.inventory enable row level security;
create policy "Vidím svoj inventár" on public.inventory for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy "Admin spravuje inventár" on public.inventory for all to authenticated using (public.is_admin()) with check (public.is_admin());
revoke all on public.inventory from anon;
grant select on public.inventory to authenticated;
grant insert, update, delete on public.inventory to authenticated;

-- ---------- Profil skejtera ----------
create table public.profiles (
  id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  nickname text not null check (char_length(nickname) between 2 and 24 and nickname ~ '^[A-Za-z0-9ÁÄČĎÉĚÍĹĽŇÓÔŔŘŠŤÚŮÝŽáäčďéěíĺľňóôŕřšťúůýž _.\-]+$'),
  city text check (char_length(city) <= 40),
  country text check (country in ('SK', 'CZ', 'other')),
  lang text not null default 'sk' check (lang in ('sk', 'cs', 'en')),
  age_group text not null default 'adult' check (age_group in ('adult', 'u16')),
  parent_consent boolean not null default false,
  ghost jsonb not null default '{"skin":"classic"}'::jsonb,       -- skin ducha (assets/profile.js GHOST_SKINS)
  loadout jsonb not null default '{"deck":"cream","grip":"black","wheels":"cream","trucks":"silver"}'::jsonb,  -- doska (board.js)
  crew_name text check (char_length(crew_name) <= 40),
  beta boolean not null default false,                            -- chce testovať Ghoskate pred spustením
  source text check (source in ('ghoskate', 'gosko')),            -- kde si účet založil
  check (age_group <> 'u16' or parent_consent)
);
create unique index profiles_nickname_key on public.profiles (lower(nickname));
alter table public.profiles enable row level security;
create policy "Vidím svoj profil" on public.profiles for select to authenticated using (id = auth.uid() or public.is_admin());
create policy "Založím si profil" on public.profiles for insert to authenticated with check (id = auth.uid());
create policy "Upravím svoj profil" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy "Admin spravuje profily skejterov" on public.profiles for all to authenticated using (public.is_admin()) with check (public.is_admin());
revoke all on public.profiles from anon;
grant select, insert, update, delete on public.profiles to authenticated;

-- Strážca: Founder loot pri založení profilu do 1. 4. 2027; zamknutý skin len s vecou v inventári.
create or replace function public.profile_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then new.id := old.id; new.created_at := old.created_at; new.source := coalesce(old.source, new.source); end if;
  new.updated_at := now();
  if tg_op = 'INSERT' and now() < '2027-04-01'::timestamptz then
    insert into public.inventory (user_id, item, source) values
      (new.id, 'skin:founder', 'founder'), (new.id, 'sticker:founder-2026', 'founder'), (new.id, 'badge:founder', 'founder')
    on conflict do nothing;
  end if;
  if coalesce(new.ghost->>'skin', 'classic') not in ('classic', 'red', 'mint', 'ice', 'violet')
     and not exists (select 1 from public.inventory i where i.user_id = new.id and i.item = 'skin:' || (new.ghost->>'skin')) then
    new.ghost := jsonb_set(new.ghost, '{skin}', '"classic"');
  end if;
  return new;
end $$;
revoke execute on function public.profile_guard() from public, anon, authenticated;
create trigger profile_guard before insert or update on public.profiles for each row execute function public.profile_guard();

-- ---------- Spoty: polia pre Ghoskate ----------
alter table public.spots
  add column source text not null default 'gosko' check (source in ('gosko', 'ghoskate')),
  add column difficulty smallint check (difficulty between 1 and 5),   -- náročnosť
  add column bust smallint check (bust between 1 and 5),               -- Bustmeter (SBS, polícia, ochranka)
  add column features text[] not null default '{}' check (cardinality(features) <= 12);
create or replace view public.spots_public as
  select id, created_at, name, city, kind, description, lat, lng, photo_url, difficulty, bust, features
  from public.spots where approved;
grant select on public.spots_public to anon, authenticated;
create policy "Vidím svoje spoty" on public.spots for select to authenticated using (user_id = auth.uid());

-- Loot za reálnu aktivitu: prvý schválený spot = nálepka Spot hunter
create or replace function public.spot_loot() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.approved and not coalesce(old.approved, false) then
    insert into public.inventory (user_id, item, source) values (new.user_id, 'sticker:spot-hunter', 'spot') on conflict do nothing;
  end if;
  return new;
end $$;
revoke execute on function public.spot_loot() from public, anon, authenticated;
create trigger spot_loot after update of approved on public.spots for each row execute function public.spot_loot();

-- ---------- Verejné počty a kontrola prezývky ----------
create or replace function public.ghoskate_stats() returns json
language sql stable security definer set search_path = public as $$
  select json_build_object('founders', (select count(*) from public.profiles), 'spots', (select count(*) from public.spots), 'spots_live', (select count(*) from public.spots where approved))
$$;
create or replace function public.nickname_free(nick text) returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (select 1 from public.profiles where lower(nickname) = lower(trim(nick)) and id is distinct from auth.uid())
$$;
revoke execute on function public.ghoskate_stats(), public.nickname_free(text) from public;
grant execute on function public.ghoskate_stats(), public.nickname_free(text) to anon, authenticated;

-- =====================================================================
-- 015_main_sync2: databázové zmeny z Robovej vetvy main (PR #6–#9, 5. 10. 2026) nad 001–014.
-- Poradie: supabase-setup.sql -> 001 … 006 -> 010 … 014 -> 015. Opakovateľné.
--
-- Robo pridal komunitu: profil jazdca („Som to ja“), trik týždňa s hlasovaním,
-- hodnotenie skateparkov a spotov, XP (my_activity) a články priradené k eventu.
-- V supabase-setup.sql sú len holé tabuľky („na živej databáze už spustené“);
-- RLS, granty a funkcie tu dopĺňame rovnako prísne ako 001/006/014:
--   * RLS na každej tabuľke, anon iba SELECT verejných stĺpcov (cez view alebo granty po stĺpcoch),
--   * jazdec mení len svoj riadok, schvaľuje admin (trigger rider_profile_guard),
--   * klip do triku týždňa len prihlásený a len kým je zadanie otvorené; hlas len za finalistu
--     a len vo fáze hlasovania, jeden hlas na účet,
--   * URL iba http(s), dĺžky textov obmedzené,
--   * my_activity() je SECURITY DEFINER bez EXECUTE pre PUBLIC a anon.
--
-- POZOR, prekrytie s hrou: public.spot_ratings je v master-gosko hodnotenie spotov v hre
-- (010_game_core.sql, „lebky“ 1–5 na spot podľa spot_id). Robova tabuľka s rovnakým menom
-- (hviezdičky + štítky podľa spot_key 'park:…' / 'spot:…') sa tu volá public.spot_reviews
-- a web (assets/store.js) ju tak volá. Viac v docs/ZLUCENIE-MAIN.md.
-- =====================================================================
begin;

-- ---------- 1) Novinky: článok patrí k eventu ----------
alter table public.posts add column if not exists event_id text;
alter table public.posts drop constraint if exists posts_event_id_format;
alter table public.posts add constraint posts_event_id_format
  check (event_id is null or event_id ~ '^[a-z0-9-]{1,60}$');
grant select (event_id) on public.posts to anon;
grant insert (event_id), update (event_id) on public.posts to authenticated;

-- ---------- 2) Profil jazdca ----------
create table if not exists public.rider_profiles (
  slug text primary key, user_id uuid references auth.users on delete set null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  photo_url text, photo_path text, instagram text, city text, stance text check (stance in ('regular','goofy')),
  fav_trick text, home_spot text, crew text, bio text check (char_length(bio) <= 400), note text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());

alter table public.rider_profiles drop constraint if exists rider_profiles_limits;
alter table public.rider_profiles add constraint rider_profiles_limits check (
  slug ~ '^[a-z0-9-]{1,80}$'
  and (photo_url is null or (char_length(photo_url) <= 500 and photo_url ~* '^https?://'))
  and (photo_path is null or char_length(photo_path) <= 300)
  and (instagram is null or char_length(instagram) <= 40)
  and (city is null or char_length(city) <= 60)
  and (fav_trick is null or char_length(fav_trick) <= 60)
  and (home_spot is null or char_length(home_spot) <= 80)
  and (crew is null or crew ~ '^[a-z0-9-]{1,40}$')
  and (note is null or char_length(note) <= 300));
-- user_id dopĺňa databáza (auth.uid()), klient ho neposiela (ako všade od 001)
alter table public.rider_profiles alter column user_id set default auth.uid();
-- jeden účet = jeden profil jazdca
create unique index if not exists rider_profiles_user_once on public.rider_profiles (user_id) where user_id is not null;

create or replace trigger rider_profiles_updated_at before update on public.rider_profiles
  for each row execute function public.set_updated_at();

-- jazdec si nemôže sám schváliť profil, prepísať cudzí slug ani ho previesť na iný účet
-- (SECURITY INVOKER: current_user je rola volajúceho, nie vlastník funkcie)
create or replace function public.rider_profile_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  -- obmedzuje len roly z API (anon, authenticated); service_role, SQL editor a migrácie nie
  if current_user not in ('anon', 'authenticated') then return new; end if;
  if public.is_admin() then
    -- admin zakladá schválený profil za jazdca (napr. fotka z odovzdávania cien): nepatrí adminovi
    if tg_op = 'INSERT' and new.status <> 'pending' and new.user_id = auth.uid() then new.user_id := null; end if;
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.status <> 'pending' or new.user_id is distinct from auth.uid() then
      raise exception 'rider profile: claim must be pending and yours' using errcode = '42501';
    end if;
  elsif new.status is distinct from old.status or new.user_id is distinct from old.user_id or new.slug is distinct from old.slug then
    raise exception 'rider profile: status, owner and slug are set by an admin' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists rider_profile_guard on public.rider_profiles;
create trigger rider_profile_guard before insert or update on public.rider_profiles
  for each row execute function public.rider_profile_guard();

alter table public.rider_profiles enable row level security;
drop policy if exists "Jazdec vidí svoj profil" on public.rider_profiles;
create policy "Jazdec vidí svoj profil" on public.rider_profiles for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
drop policy if exists "Jazdec si nárokuje profil" on public.rider_profiles;
create policy "Jazdec si nárokuje profil" on public.rider_profiles for insert to authenticated
  with check (user_id = auth.uid() and status = 'pending');
drop policy if exists "Jazdec upraví svoj profil" on public.rider_profiles;
create policy "Jazdec upraví svoj profil" on public.rider_profiles for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "Admin spravuje profily" on public.rider_profiles;
create policy "Admin spravuje profily" on public.rider_profiles for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- verejne len schválené profily, bez user_id, poznámky k overeniu a cesty k súboru;
-- claimed = profil už niekto prevzal (web vtedy neukáže „Som to ja“)
create or replace view public.rider_profiles_public with (security_barrier = true) as
  select slug, status, photo_url, instagram, city, stance, fav_trick, home_spot, crew, bio, (user_id is not null) as claimed, updated_at
  from public.rider_profiles where status = 'approved';

revoke all on public.rider_profiles, public.rider_profiles_public from anon, authenticated;
grant select on public.rider_profiles_public to anon, authenticated;
grant select on public.rider_profiles to authenticated;   -- RLS: len vlastný riadok, admin všetko
grant insert (slug, status, instagram, city, stance, fav_trick, home_spot, crew, bio, note, photo_url, photo_path),
      update (slug, user_id, status, instagram, city, stance, fav_trick, home_spot, crew, bio, note, photo_url, photo_path),
      delete
  on public.rider_profiles to authenticated;
grant all on public.rider_profiles to service_role;

-- ---------- 3) Trik týždňa ----------
create table if not exists public.trick_challenges (id uuid primary key default gen_random_uuid(), created_at timestamptz default now(), title text not null, description text, status text not null default 'open' check (status in ('open','voting','closed')), ends_on date);
create table if not exists public.trick_entries (id uuid primary key default gen_random_uuid(), created_at timestamptz default now(), challenge_id uuid references public.trick_challenges on delete cascade, user_id uuid default auth.uid(), name text not null, instagram text, clip_url text, video_url text, video_path text, finalist boolean not null default false);
create table if not exists public.trick_votes (challenge_id uuid references public.trick_challenges on delete cascade, entry_id uuid references public.trick_entries on delete cascade, user_id uuid default auth.uid(), created_at timestamptz default now(), primary key (challenge_id, user_id));

alter table public.trick_challenges drop constraint if exists trick_challenges_limits;
alter table public.trick_challenges add constraint trick_challenges_limits
  check (char_length(title) between 1 and 80 and (description is null or char_length(description) <= 600));
alter table public.trick_entries alter column challenge_id set not null;
alter table public.trick_entries drop constraint if exists trick_entries_limits;
alter table public.trick_entries add constraint trick_entries_limits check (
  char_length(name) between 1 and 60
  and (instagram is null or char_length(instagram) <= 40)
  and (clip_url is null or (char_length(clip_url) <= 400 and clip_url ~* '^https?://'))
  and (video_url is null or (char_length(video_url) <= 500 and video_url ~* '^https?://'))
  and (video_path is null or char_length(video_path) <= 300)
  and (clip_url is not null or video_url is not null));
alter table public.trick_votes alter column entry_id set not null;

alter table public.trick_challenges enable row level security;
drop policy if exists "Trik týždňa vidí každý" on public.trick_challenges;
create policy "Trik týždňa vidí každý" on public.trick_challenges for select using (true);
drop policy if exists "Admin spravuje trik týždňa" on public.trick_challenges;
create policy "Admin spravuje trik týždňa" on public.trick_challenges for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

alter table public.trick_entries enable row level security;
drop policy if exists "Jazdec vidí svoje pokusy" on public.trick_entries;
create policy "Jazdec vidí svoje pokusy" on public.trick_entries for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
drop policy if exists "Prihlásený pošle pokus" on public.trick_entries;
create policy "Prihlásený pošle pokus" on public.trick_entries for insert to authenticated
  with check (user_id = auth.uid() and not finalist
    and exists (select 1 from public.trick_challenges c where c.id = challenge_id and c.status = 'open'));
drop policy if exists "Admin vyberá finalistov" on public.trick_entries;
create policy "Admin vyberá finalistov" on public.trick_entries for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- finalisti a počet hlasov (bez user_id a cesty k videu)
create or replace view public.trick_results with (security_barrier = true) as
  select e.id, e.challenge_id, e.created_at, e.name, e.instagram, e.clip_url, e.video_url, e.finalist,
         (select count(*) from public.trick_votes v where v.entry_id = e.id)::int as votes
  from public.trick_entries e where e.finalist;

alter table public.trick_votes enable row level security;
drop policy if exists "Hlasujúci vidí svoj hlas" on public.trick_votes;
create policy "Hlasujúci vidí svoj hlas" on public.trick_votes for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
drop policy if exists "Hlas za finalistu počas hlasovania" on public.trick_votes;
create policy "Hlas za finalistu počas hlasovania" on public.trick_votes for insert to authenticated
  with check (user_id = auth.uid()
    -- trick_results (view) vidí finalistov aj cudzích jazdcov; trick_entries by cez RLS ukázal len vlastné pokusy
    and exists (select 1 from public.trick_results r join public.trick_challenges c on c.id = r.challenge_id
                where r.id = entry_id and r.challenge_id = trick_votes.challenge_id and c.status = 'voting'));
drop policy if exists "Hlas sa dá zmeniť počas hlasovania" on public.trick_votes;
create policy "Hlas sa dá zmeniť počas hlasovania" on public.trick_votes for delete to authenticated
  using (user_id = auth.uid() and exists (select 1 from public.trick_challenges c where c.id = challenge_id and c.status = 'voting'));

revoke all on public.trick_challenges, public.trick_entries, public.trick_votes, public.trick_results from anon, authenticated;
grant select on public.trick_challenges, public.trick_results to anon, authenticated;
grant insert (title, description, status, ends_on), update (title, description, status, ends_on), delete on public.trick_challenges to authenticated;
grant select on public.trick_entries to authenticated;   -- RLS: len vlastné pokusy, admin všetky
grant insert (challenge_id, name, instagram, clip_url, video_url, video_path), update (finalist), delete on public.trick_entries to authenticated;
grant select, delete on public.trick_votes to authenticated;
grant insert (challenge_id, entry_id) on public.trick_votes to authenticated;
grant all on public.trick_challenges, public.trick_entries, public.trick_votes to service_role;

-- ---------- 4) Hodnotenie skateparkov a spotov na webe (Robova spot_ratings) ----------
create table if not exists public.spot_reviews (spot_key text not null, user_id uuid not null default auth.uid(), stars smallint not null check (stars between 1 and 5), tags text[] not null default '{}', created_at timestamptz default now(), primary key (spot_key, user_id));
alter table public.spot_reviews drop constraint if exists spot_reviews_limits;
alter table public.spot_reviews add constraint spot_reviews_limits check (
  spot_key ~ '^(park|spot):[a-z0-9-]{1,80}$' and cardinality(tags) <= 8 and char_length(array_to_string(tags, '')) <= 320);
alter table public.spot_reviews enable row level security;
drop policy if exists "Hodnotenia vidí každý" on public.spot_reviews;
create policy "Hodnotenia vidí každý" on public.spot_reviews for select using (true);
drop policy if exists "Prihlásený hodnotí za seba" on public.spot_reviews;
create policy "Prihlásený hodnotí za seba" on public.spot_reviews for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "Prihlásený mení svoje hodnotenie" on public.spot_reviews;
create policy "Prihlásený mení svoje hodnotenie" on public.spot_reviews for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "Prihlásený zmaže svoje hodnotenie" on public.spot_reviews;
create policy "Prihlásený zmaže svoje hodnotenie" on public.spot_reviews for delete to authenticated using (user_id = auth.uid() or public.is_admin());
revoke all on public.spot_reviews from anon, authenticated;
grant select (spot_key, stars, tags, created_at) on public.spot_reviews to anon;   -- anon bez user_id
grant select on public.spot_reviews to authenticated;
-- upsert z webu (on_conflict=spot_key,user_id) posiela spot_key, stars a tags; user_id = auth.uid() z defaultu
grant insert (spot_key, stars, tags), update (spot_key, stars, tags), delete on public.spot_reviews to authenticated;
grant all on public.spot_reviews to service_role;

-- ---------- 5) XP: počty aktivít prihláseného ----------
-- checkins = 0: registrácie v2 nie sú naviazané na prihlasovací účet (registrácia ide e-mailom cez /api/register).
create or replace function public.my_activity() returns json
language sql stable security definer set search_path = public as $$
  select case when auth.uid() is null then null else json_build_object(
    'photos',      (select count(*) from public.event_photos where user_id = auth.uid()),
    'spots',       (select count(*) from public.spots where user_id = auth.uid()),
    'parks',       (select count(*) from public.parks where user_id = auth.uid()),
    'park_votes',  (select count(*) from public.votes where user_id = auth.uid()),
    'tricks',      (select count(*) from public.trick_entries where user_id = auth.uid()),
    'finalist',    (select count(*) from public.trick_entries where user_id = auth.uid() and finalist),
    'trick_votes', (select count(*) from public.trick_votes where user_id = auth.uid()),
    'ratings',     (select count(*) from public.spot_reviews where user_id = auth.uid()),
    'rider',       (select count(*) from public.rider_profiles where user_id = auth.uid() and status = 'approved'),
    'checkins',    0) end
$$;
revoke all on function public.my_activity(), public.rider_profile_guard() from public, anon, authenticated;
grant execute on function public.my_activity() to authenticated;

-- ---------- 6) Úložisko: videá trikov, fotky jazdcov ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('clips', 'clips', true, 31457280, array['video/mp4', 'video/quicktime', 'video/webm'])
  on conflict (id) do update set file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists "Prihlásený nahrá klip triku" on storage.objects;
create policy "Prihlásený nahrá klip triku" on storage.objects for insert to authenticated
  with check (bucket_id = 'clips' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "Admin maže klipy" on storage.objects;
create policy "Admin maže klipy" on storage.objects for delete to authenticated using (bucket_id = 'clips' and public.is_admin());
-- admin nahrá fotku jazdcovi (photos/riders/<slug>-….jpg), mimo svojho priečinka
drop policy if exists "Admin nahrá fotku jazdca" on storage.objects;
create policy "Admin nahrá fotku jazdca" on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = 'riders' and public.is_admin());

-- PostgREST (Supabase API) načíta zmenenú schému
notify pgrst, 'reload schema';

commit;

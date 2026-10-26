-- =====================================================================
-- 010_game_core: Ghoskate jadro: hráči, spoty, check-iny, klipy, hlásenia (Task 1).
-- Poradie: supabase-setup.sql -> 001 … 006 -> 010 -> 011 -> 012. Opakovateľné.
-- Plán: ~/.claude/plans/gosko-master-ghoskate.md, Task 1.
--
-- Identita: hráč = auth.users (players.id = auth.uid()) a k nemu presne jeden
-- jazdec (players.rider_id, 1:1). Hráča zakladá iba service_role (API po
-- prihlásení e-mailom), takže každý hráč má rider_private s dátumom narodenia.
--
-- U16: hráč mladší ako 16 rokov (dnes, z rider_private.birth_date) môže
-- zapisovať, až keď rodič potvrdil hru (players.guardian_confirmed_at cez
-- confirm_player_guardian) alebo ktorúkoľvek GOSko registráciu tohto jazdca
-- (registrations.guardian_confirmed_at, plán: „súhlas rodiča platí pre všetko“).
-- Inak NEED_GUARDIAN. Bez rider_private (výmaz údajov) hráč nezapisuje.
--
-- Body, gear a loot sa zapisujú iba cez SECURITY DEFINER RPC s pevným
-- search_path. Chyby: výnimka so správou = kód (TOO_FAR, NEED_GUARDIAN, …),
-- PostgREST vráti HTTP 400 a {message: kód, details: JSON alebo null}.
-- =====================================================================
begin;

-- ---------- herné čísla (jediný zdroj, číta ich aj klient) ----------
create or replace function public.game_cfg() returns jsonb
language sql immutable parallel safe set search_path = '' as $$
  select jsonb_build_object(
    'checkin_radius_m', 150,       -- check-in max 150 m od spotu
    'checkin_max_minutes', 120,    -- ráta sa max 120 min, potom je check-in neaktívny
    'points_per_minute', 1,
    'clip_base_points', 50,        -- overený klip 50 × (1 + 0,1 × lajky)
    'clip_like_bonus', 0.1,
    'clip_like_cap', 20,
    'clip_verify_hours', 3,        -- overený = autor bol na spote checknutý v posledných 3 h
    'control_window_days', 30,
    'control_min_points', 100,
    'crew_max', 10,
    'spots_per_day', 5,            -- kĺzavých 24 h
    'report_ttl_hours', 6,
    'guardian_age', 16,
    'video_max_seconds', 60,
    'video_max_mb', 50
  )
$$;

-- ---------- spoty: existujúca tabuľka zo setupu je aj herný svet ----------
-- Seed a systémové spoty nemajú autora; nové spoty z hry sú hneď schválené
-- (admin ich vie skryť cez approved), na obmedzenie slúži limit 5 za deň.
alter table public.spots alter column user_id drop not null;
alter table public.spots add column if not exists needs_verification boolean not null default false;
create index if not exists spots_user_created_idx on public.spots (user_id, created_at);

-- ---------- players ----------
create table if not exists public.players (
  id uuid primary key references auth.users(id) on delete cascade,
  rider_id uuid not null unique references public.riders(id) on delete cascade,
  username text not null check (username ~ '^[A-Za-z0-9_.]{3,20}$'),
  city text check (char_length(city) <= 60),
  stance text check (stance in ('regular', 'goofy')),
  board_config jsonb not null default '{}'::jsonb
    check (jsonb_typeof(board_config) = 'object' and pg_column_size(board_config) <= 8192),
  guardian_confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists players_username_key on public.players (lower(username));
create or replace trigger players_updated_at before update on public.players
  for each row execute function public.set_updated_at();

-- Rodič pre hru: token z e-mailu. Oddelené od players, aby hráč nevedel
-- prečítať vlastný token a potvrdiť sa sám. Číta a zapisuje iba service_role.
create table if not exists public.player_guardian (
  player_id uuid primary key references public.players(id) on delete cascade,
  guardian_name text check (char_length(guardian_name) <= 120),
  guardian_email text not null check (char_length(guardian_email) <= 254 and guardian_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  token uuid unique,
  token_expires_at timestamptz,
  requested_at timestamptz not null default now()
);

-- ---------- check-iny (súkromné: vidí ich iba autor) ----------
-- Poloha hráča sa neukladá, iba vzdialenosť od spotu v čase check-inu.
-- crew_id je snímka crew v čase check-inu (FK a trigger v 011).
create table if not exists public.check_ins (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  spot_id uuid not null references public.spots(id) on delete cascade,
  crew_id uuid,
  distance_m int not null check (distance_m >= 0),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  check (ended_at is null or ended_at >= started_at)
);
create unique index if not exists check_ins_one_open_key on public.check_ins (player_id) where ended_at is null;
create index if not exists check_ins_spot_idx on public.check_ins (spot_id, started_at);

-- ---------- hodnotenie (lebky 1 až 5) a hlásenia stavu ----------
create table if not exists public.spot_ratings (
  spot_id uuid not null references public.spots(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  skulls smallint not null check (skulls between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (spot_id, player_id)
);
create or replace trigger spot_ratings_updated_at before update on public.spot_ratings
  for each row execute function public.set_updated_at();

-- status: Mokré, Plné, Chill, Prázdne, Zatvorené; bust = „vyhadzujú tu?“ (nie hlásenie polície). Platí 6 h.
create table if not exists public.spot_reports (
  id uuid primary key default gen_random_uuid(),
  spot_id uuid not null references public.spots(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  status text check (status in ('mokre', 'plne', 'chill', 'prazdne', 'zatvorene')),
  bust text check (bust in ('low', 'medium', 'high')),
  created_at timestamptz not null default now(),
  check (status is not null or bust is not null)
);
create index if not exists spot_reports_spot_idx on public.spot_reports (spot_id, created_at desc);

-- ---------- klipy a lajky ----------
create table if not exists public.clips (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  spot_id uuid not null references public.spots(id) on delete cascade,
  crew_id uuid,
  media_url text not null check (char_length(media_url) <= 500 and media_url ~* '^https?://'),
  media_kind text not null check (media_kind in ('video', 'photo', 'embed')),
  trick text check (char_length(trick) <= 60),
  verified boolean not null default false,
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists clips_spot_idx on public.clips (spot_id, created_at desc);
create index if not exists clips_player_idx on public.clips (player_id, created_at desc);

create table if not exists public.clip_likes (
  clip_id uuid not null references public.clips(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (clip_id, player_id)
);

-- ---------- pomocné funkcie (nie sú pre klienta) ----------
create or replace function public.game_distance_m(lat1 double precision, lng1 double precision,
                                                  lat2 double precision, lng2 double precision) returns double precision
language sql immutable parallel safe set search_path = '' as $$
  select 2 * 6371000 * asin(sqrt(
    power(sin(radians($3 - $1) / 2), 2) + cos(radians($1)) * cos(radians($3)) * power(sin(radians($4 - $2) / 2), 2)))
$$;

-- Body za check-in: celé minúty, najviac checkin_max_minutes. Otvorený sa ráta do teraz.
create or replace function public.checkin_points(p_started timestamptz, p_ended timestamptz) returns int
language sql stable set search_path = '' as $$
  select (greatest(0, least(floor(extract(epoch from (coalesce(p_ended, now()) - p_started)) / 60),
                             (public.game_cfg() ->> 'checkin_max_minutes')::int))
          * (public.game_cfg() ->> 'points_per_minute')::int)::int
$$;

-- Hráči, ktorí môžu zapisovať (check-in, klip, crew, loot). Pravidlo U16 je v hlavičke súboru.
-- Pohľad bez grantov: verejné pohľady ho používajú s právami vlastníka (funkciu by anon
-- musel smieť volať sám, a tak by zistil, kto je U16 bez súhlasu).
create or replace view public.game_writers with (security_barrier = true) as
  select p.id as player_id
  from public.players p
  join public.rider_private rp on rp.rider_id = p.rider_id
  where rp.birth_date <= current_date - make_interval(years => (public.game_cfg() ->> 'guardian_age')::int)
     or p.guardian_confirmed_at is not null
     or exists (select 1 from public.registrations g
                where g.rider_id = p.rider_id and g.guardian_confirmed_at is not null);

create or replace function public.game_can_write(p_player uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.game_writers w where w.player_id = p_player)
$$;

-- Prihlásený hráč (auth.uid()); bez profilu FORBIDDEN, pri zápise U16 bez súhlasu NEED_GUARDIAN.
create or replace function public.game_require_player(p_write boolean) returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null or not exists (select 1 from public.players where id = uid) then
    raise exception using message = 'FORBIDDEN';
  end if;
  if p_write and not public.game_can_write(uid) then
    raise exception using message = 'NEED_GUARDIAN';
  end if;
  return uid;
end $$;

-- Aktívny check-in hráča na spote (otvorený a mladší ako checkin_max_minutes).
create or replace function public.game_active_checkin(p_player uuid, p_spot uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select id from public.check_ins
  where player_id = p_player and (p_spot is null or spot_id = p_spot) and ended_at is null
    and started_at > now() - make_interval(mins => (public.game_cfg() ->> 'checkin_max_minutes')::int)
$$;

-- ---------- RPC: profil ----------
-- Vráti vlastný profil a či môže hráč zapisovať; bez profilu null (onboarding).
create or replace function public.game_me() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', p.id, 'username', p.username, 'city', p.city, 'stance', p.stance, 'board_config', p.board_config,
    'can_write', public.game_can_write(p.id), 'needs_guardian', not public.game_can_write(p.id))
  from public.players p where p.id = auth.uid()
$$;

-- Potvrdenie rodiča pre hru (API /api/consent). Neplatný, použitý alebo prepadnutý token = PT404.
create or replace function public.confirm_player_guardian(p_token uuid) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  pid uuid;
begin
  update public.player_guardian
     set token = null
   where token = p_token and (token_expires_at is null or token_expires_at > now())
  returning player_id into pid;
  if not found then
    raise exception 'invalid_token' using errcode = 'PT404';
  end if;
  update public.players set guardian_confirmed_at = now() where id = pid;
  return jsonb_build_object('player_id', pid);
end $$;

-- ---------- RPC: check-in a check-out ----------
create or replace function public.check_in(p_spot uuid, p_lat double precision, p_lng double precision) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.game_require_player(true);
  s public.spots;
  d double precision;
  max_m int := (public.game_cfg() ->> 'checkin_radius_m')::int;
  r public.check_ins;
begin
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception using message = 'BAD_INPUT';
  end if;
  select * into s from public.spots where id = p_spot and approved;
  if not found then
    raise exception using message = 'SPOT_NOT_FOUND';
  end if;
  d := public.game_distance_m(p_lat, p_lng, s.lat, s.lng);
  if d > max_m then
    raise exception using message = 'TOO_FAR',
      detail = jsonb_build_object('distance_m', round(d)::int, 'max_m', max_m)::text;
  end if;
  update public.check_ins set ended_at = now() where player_id = uid and ended_at is null;
  insert into public.check_ins (player_id, spot_id, distance_m) values (uid, p_spot, round(d)::int)
  returning * into r;
  return jsonb_build_object('id', r.id, 'spot_id', r.spot_id, 'started_at', r.started_at, 'distance_m', r.distance_m);
end $$;

-- Ukončenie nevyžaduje súhlas rodiča (iba ukončí, nič nepridá).
create or replace function public.check_out() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.game_require_player(false);
  r public.check_ins;
begin
  update public.check_ins set ended_at = now() where player_id = uid and ended_at is null
  returning * into r;
  if not found then
    raise exception using message = 'NEED_CHECKIN';
  end if;
  return jsonb_build_object('id', r.id, 'spot_id', r.spot_id,
    'minutes', least(floor(extract(epoch from (r.ended_at - r.started_at)) / 60)::int, (public.game_cfg() ->> 'checkin_max_minutes')::int),
    'points', public.checkin_points(r.started_at, r.ended_at));
end $$;

-- ---------- RPC: nový spot (max spots_per_day za kĺzavých 24 h) ----------
create or replace function public.add_spot(p_name text, p_city text, p_kind text, p_lat double precision, p_lng double precision,
                                           p_description text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.game_require_player(true);
  n int;
  sid uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('gosko:add_spot:' || uid::text, 0));
  select count(*) into n from public.spots where user_id = uid and created_at > now() - interval '24 hours';
  if n >= (public.game_cfg() ->> 'spots_per_day')::int then
    raise exception using message = 'SPOT_LIMIT';
  end if;
  insert into public.spots (user_id, name, city, kind, description, lat, lng, approved)
  values (uid, btrim(p_name), btrim(p_city), nullif(btrim(p_kind), ''), nullif(btrim(p_description), ''), p_lat, p_lng, true)
  returning id into sid;
  return jsonb_build_object('id', sid);
end $$;

-- ---------- RPC: hodnotenie a hlásenie ----------
create or replace function public.rate_spot(p_spot uuid, p_skulls int) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.game_require_player(true);
begin
  if not exists (select 1 from public.spots where id = p_spot and approved) then
    raise exception using message = 'SPOT_NOT_FOUND';
  end if;
  if p_skulls is null or p_skulls not between 1 and 5 then
    raise exception using message = 'BAD_INPUT';
  end if;
  insert into public.spot_ratings as r (spot_id, player_id, skulls) values (p_spot, uid, p_skulls)
  on conflict (spot_id, player_id) do update set skulls = excluded.skulls;
  return jsonb_build_object('spot_id', p_spot, 'skulls', p_skulls);
end $$;

-- Hlásenie stavu iba z miesta: vyžaduje aktívny check-in na spote (proti trollovaniu na diaľku).
create or replace function public.report_spot(p_spot uuid, p_status text, p_bust text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.game_require_player(true);
  rid uuid;
begin
  if public.game_active_checkin(uid, p_spot) is null then
    raise exception using message = 'NEED_CHECKIN';
  end if;
  insert into public.spot_reports (spot_id, player_id, status, bust) values (p_spot, uid, p_status, p_bust)
  returning id into rid;
  return jsonb_build_object('id', rid);
end $$;

-- ---------- RPC: klipy a lajky ----------
-- Overený klip: autor mal check-in na spote, ktorý trval v posledných clip_verify_hours
-- (check-in sa ráta najviac checkin_max_minutes od začiatku).
create or replace function public.add_clip(p_spot uuid, p_media_url text, p_media_kind text, p_trick text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.game_require_player(true);
  v boolean;
  c public.clips;
begin
  if not exists (select 1 from public.spots where id = p_spot and approved) then
    raise exception using message = 'SPOT_NOT_FOUND';
  end if;
  select exists (
    select 1 from public.check_ins ci
    where ci.player_id = uid and ci.spot_id = p_spot
      and least(coalesce(ci.ended_at, now()), ci.started_at + make_interval(mins => (public.game_cfg() ->> 'checkin_max_minutes')::int))
          >= now() - make_interval(hours => (public.game_cfg() ->> 'clip_verify_hours')::int)
  ) into v;
  insert into public.clips (player_id, spot_id, media_url, media_kind, trick, verified)
  values (uid, p_spot, btrim(p_media_url), p_media_kind, nullif(btrim(p_trick), ''), v)
  returning * into c;
  return jsonb_build_object('id', c.id, 'spot_id', c.spot_id, 'verified', c.verified, 'created_at', c.created_at);
end $$;

create or replace function public.like_clip(p_clip uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.game_require_player(true);
  author uuid;
begin
  select player_id into author from public.clips where id = p_clip and not hidden;
  if not found then
    raise exception using message = 'CLIP_NOT_FOUND';
  end if;
  if author = uid then
    raise exception using message = 'FORBIDDEN';
  end if;
  insert into public.clip_likes (clip_id, player_id) values (p_clip, uid) on conflict do nothing;
  return jsonb_build_object('clip_id', p_clip, 'likes', (select count(*) from public.clip_likes where clip_id = p_clip));
end $$;

create or replace function public.unlike_clip(p_clip uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.game_require_player(false);
begin
  delete from public.clip_likes where clip_id = p_clip and player_id = uid;
  return jsonb_build_object('clip_id', p_clip, 'likes', (select count(*) from public.clip_likes where clip_id = p_clip));
end $$;

-- ---------- RLS ----------
alter table public.players enable row level security;
alter table public.player_guardian enable row level security;
alter table public.check_ins enable row level security;
alter table public.spot_ratings enable row level security;
alter table public.spot_reports enable row level security;
alter table public.clips enable row level security;
alter table public.clip_likes enable row level security;

drop policy if exists "Hráč vidí seba" on public.players;
create policy "Hráč vidí seba" on public.players for select to authenticated using (id = auth.uid() or public.is_admin());
drop policy if exists "Hráč mení svoj profil" on public.players;
create policy "Hráč mení svoj profil" on public.players for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
drop policy if exists "Hráč vidí svoje check-iny" on public.check_ins;
create policy "Hráč vidí svoje check-iny" on public.check_ins for select to authenticated using (player_id = auth.uid());
drop policy if exists "Hráč vidí svoje hodnotenia" on public.spot_ratings;
create policy "Hráč vidí svoje hodnotenia" on public.spot_ratings for select to authenticated using (player_id = auth.uid());
drop policy if exists "Hráč vidí svoje hlásenia" on public.spot_reports;
create policy "Hráč vidí svoje hlásenia" on public.spot_reports for select to authenticated using (player_id = auth.uid());
drop policy if exists "Hráč vidí svoje klipy" on public.clips;
create policy "Hráč vidí svoje klipy" on public.clips for select to authenticated using (player_id = auth.uid() or public.is_admin());
drop policy if exists "Admin skrýva klipy" on public.clips;
create policy "Admin skrýva klipy" on public.clips for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "Hráč vidí svoje lajky" on public.clip_likes;
create policy "Hráč vidí svoje lajky" on public.clip_likes for select to authenticated using (player_id = auth.uid());
-- player_guardian: žiadna politika = iba service_role

revoke all on public.game_writers from anon, authenticated;
revoke all on public.players, public.player_guardian, public.check_ins, public.spot_ratings, public.spot_reports,
  public.clips, public.clip_likes from anon, authenticated;
grant select on public.players, public.check_ins, public.spot_ratings, public.spot_reports, public.clips, public.clip_likes
  to authenticated;
grant update (username, city, stance, board_config) on public.players to authenticated;
grant update (hidden) on public.clips to authenticated;
grant select, insert, update, delete on public.players, public.player_guardian, public.check_ins, public.spot_ratings,
  public.spot_reports, public.clips, public.clip_likes to service_role;

-- ---------- verejné pohľady (iba SELECT, bez osobných údajov) ----------
-- Hráč je verejný (meno v hre), iba ak môže hrať: U16 bez súhlasu rodiča nikde nevidno.
create or replace view public.players_public with (security_barrier = true) as
  select p.id, p.username, p.stance
  from public.players p
  join public.game_writers w on w.player_id = p.id;

create or replace view public.clips_public with (security_barrier = true) as
  select c.id, c.spot_id, p.username, c.media_url, c.media_kind, c.trick, c.verified,
         (select count(*) from public.clip_likes l where l.clip_id = c.id)::int as likes, c.created_at
  from public.clips c
  join public.players p on p.id = c.player_id
  join public.game_writers w on w.player_id = c.player_id
  where not c.hidden;

-- Spot na mape: lebky, aktuálny stav a bust (posledné hlásenie do report_ttl_hours),
-- počet ľudí s aktívnym check-inom. Nikdy nie kto.
-- drop: opätovný beh po 011/012, ktoré pohľad rozširujú (stĺpce sa cez replace odobrať nedajú)
drop view if exists public.spot_summary;
create view public.spot_summary with (security_barrier = true) as
  select s.id, s.name, s.city, s.kind, s.description, s.lat, s.lng, s.photo_url, s.needs_verification,
         rt.skulls, coalesce(rt.ratings, 0) as ratings,
         coalesce(ci.people_now, 0) as people_now,
         st.status, bu.bust
  from public.spots s
  left join lateral (select round(avg(r.skulls)::numeric, 1) as skulls, count(*)::int as ratings
                     from public.spot_ratings r where r.spot_id = s.id) rt on true
  left join lateral (select count(*)::int as people_now from public.check_ins c
                     where c.spot_id = s.id and c.ended_at is null
                       and c.started_at > now() - make_interval(mins => (public.game_cfg() ->> 'checkin_max_minutes')::int)) ci on true
  left join lateral (select r.status from public.spot_reports r
                     where r.spot_id = s.id and r.status is not null
                       and r.created_at > now() - make_interval(hours => (public.game_cfg() ->> 'report_ttl_hours')::int)
                     order by r.created_at desc limit 1) st on true
  left join lateral (select r.bust from public.spot_reports r
                     where r.spot_id = s.id and r.bust is not null
                       and r.created_at > now() - make_interval(hours => (public.game_cfg() ->> 'report_ttl_hours')::int)
                     order by r.created_at desc limit 1) bu on true
  where s.approved;

revoke all on public.players_public, public.clips_public, public.spot_summary from anon, authenticated;
grant select on public.players_public, public.clips_public, public.spot_summary to anon, authenticated, service_role;

-- ---------- práva na funkcie ----------
revoke all on function public.game_cfg(), public.game_distance_m(double precision, double precision, double precision, double precision),
  public.checkin_points(timestamptz, timestamptz), public.game_can_write(uuid), public.game_require_player(boolean),
  public.game_active_checkin(uuid, uuid), public.game_me(), public.confirm_player_guardian(uuid),
  public.check_in(uuid, double precision, double precision), public.check_out(),
  public.add_spot(text, text, text, double precision, double precision, text), public.rate_spot(uuid, int),
  public.report_spot(uuid, text, text), public.add_clip(uuid, text, text, text), public.like_clip(uuid), public.unlike_clip(uuid)
  from public, anon, authenticated;
-- game_cfg a checkin_points sú čistý výpočet; volajú ich aj verejné pohľady (011) s právami volajúceho.
grant execute on function public.game_cfg(), public.checkin_points(timestamptz, timestamptz) to anon, authenticated, service_role;
grant execute on function public.game_me(), public.check_in(uuid, double precision, double precision), public.check_out(),
  public.add_spot(text, text, text, double precision, double precision, text), public.rate_spot(uuid, int),
  public.report_spot(uuid, text, text), public.add_clip(uuid, text, text, text), public.like_clip(uuid), public.unlike_clip(uuid)
  to authenticated;
grant execute on function public.confirm_player_guardian(uuid) to service_role;

-- PostgREST (Supabase API) načíta zmenenú schému
notify pgrst, 'reload schema';

commit;

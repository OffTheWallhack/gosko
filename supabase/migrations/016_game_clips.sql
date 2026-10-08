-- =====================================================================
-- 016_game_clips: klipy a feed hry Ghoskate (plán Ghoskate, Task 4). Opakovateľné.
-- Poradie: … -> 013 -> 014 -> 015 -> 016.
--
-- Súhlasy: klip (video, fotka aj odkaz) zverejní hráč, ktorý môže zapisovať (010/013:
-- 16+ alebo súhlas rodiča s hrou) a zároveň je 16+ alebo má súhlas rodiča s fotkami
-- a videami (players.media_consent_at). Ten dáva iba rodič cez /api/consent
-- (confirm_player_guardian(p_token, p_media)). Hráč ho vie odvolať sám
-- (withdraw_media_consent), jeho klipy hneď zmiznú z verejného feedu. Inak NEED_MEDIA_CONSENT.
--
-- Úložisko: vlastný súkromný bucket `media`, nie Robov verejný `clips` (015, trik týždňa):
--   * iné pravidlá: video do 50 MB a 60 s aj fotky, nahrá iba hráč so súhlasmi,
--   * súkromný: súbor číta každý iba kým je jeho klip verejný (skrytý adminom alebo po odvolaní
--     súhlasu už nie), autor a admin vždy; prehrávač dostane podpísanú URL (createSignedUrls),
--   * politiky na storage.objects sú viazané na bucket_id = 'media', Robove na 'clips', nekrížia sa.
-- Cesta súboru: {player_id}/{uuid}.{mp4|mov|webm|jpg|webp}. add_clip overí, že súbor existuje,
-- patrí hráčovi a nie je použitý v inom klipe.
--
-- Odkazy: iba https IG (p, reel, tv), TikTok (video, vm/vt skratka) a YouTube (watch, shorts,
-- youtu.be) cez game_embed_url, uložené v normalizovanom tvare bez parametrov.
-- Dĺžku videa hlási klient (prehliadač ju zistí pred nahratím); server ju overí len číslom.
-- =====================================================================
begin;

-- ---------- herné čísla: + limity klipov ----------
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
    'video_max_mb', 50,
    'photo_max_mb', 10,
    'clips_per_day', 20            -- kĺzavých 24 h
  )
$$;

-- ---------- súhlas s fotkami a videami (U16: iba rodič) ----------
alter table public.players add column if not exists media_consent_at timestamptz;

-- Hráči, ktorí smú zverejniť klip. Bez grantov, ako game_writers.
create or replace view public.game_publishers with (security_barrier = true) as
  select w.player_id
  from public.game_writers w
  join public.players p on p.id = w.player_id
  join public.rider_private rp on rp.rider_id = p.rider_id
  where rp.birth_date <= current_date - make_interval(years => (public.game_cfg() ->> 'guardian_age')::int)
     or p.media_consent_at is not null;
revoke all on public.game_publishers from anon, authenticated;

create or replace function public.game_can_publish(p_player uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.game_publishers g where g.player_id = p_player)
$$;

-- Potvrdenie rodiča: hra vždy, fotky a videá iba so zaškrtnutým p_media. Opakované potvrdenie
-- (nový odkaz) súhlas s fotkami len pridá, neodoberie.
drop function if exists public.confirm_player_guardian(uuid);
create or replace function public.confirm_player_guardian(p_token uuid, p_media boolean default false) returns jsonb
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
  update public.players
     set guardian_confirmed_at = coalesce(guardian_confirmed_at, now()),
         media_consent_at = case when coalesce(p_media, false) then coalesce(media_consent_at, now()) else media_consent_at end
   where id = pid;
  return jsonb_build_object('player_id', pid, 'media', coalesce(p_media, false));
end $$;

create or replace function public.withdraw_media_consent() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.game_require_player(false);
begin
  update public.players set media_consent_at = null where id = uid;
  return jsonb_build_object('can_publish', public.game_can_publish(uid));
end $$;

create or replace function public.game_me() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', p.id, 'username', p.username, 'city', p.city, 'stance', p.stance, 'board_config', p.board_config,
    'can_write', public.game_can_write(p.id), 'needs_guardian', not public.game_can_write(p.id),
    'can_publish', public.game_can_publish(p.id), 'media_consent', p.media_consent_at is not null)
  from public.players p where p.id = auth.uid()
$$;

-- ---------- klipy: súbor v úložisku alebo odkaz ----------
alter table public.clips alter column media_url drop not null;
alter table public.clips add column if not exists media_path text;
alter table public.clips add column if not exists duration_s smallint;
alter table public.clips drop constraint if exists clips_duration_s_check;
alter table public.clips add constraint clips_duration_s_check check (duration_s is null or duration_s between 1 and 60);
-- staré riadky (pred 016) mali video ako URL; nové musia mať zdroj podľa druhu
alter table public.clips drop constraint if exists clips_media_source;
alter table public.clips add constraint clips_media_source check (
  (media_kind = 'embed' and media_url is not null and media_path is null)
  or (media_kind in ('video', 'photo') and media_url is null
      and media_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(mp4|mov|webm|jpg|webp)$')) not valid;
create unique index if not exists clips_media_path_key on public.clips (media_path) where media_path is not null;

-- Odkaz na klip -> normalizovaný tvar, alebo null (neplatný). Prípady: tests/helpers/embed-cases.js.
create or replace function public.game_embed_url(p_url text) returns text
language plpgsql immutable parallel safe set search_path = '' as $$
declare
  u text := btrim(p_url);
  q constant text := '(?:[?&#][A-Za-z0-9_=&%.+-]*)?$';   -- voliteľné parametre, zahodia sa
  m text[];
begin
  if u is null or char_length(u) > 300 then
    return null;
  end if;
  m := regexp_match(u, '^https://(?:www\.|m\.)?youtube\.com/(?:watch\?v=|shorts/)([A-Za-z0-9_-]{11})' || q);
  if m is null then m := regexp_match(u, '^https://youtu\.be/([A-Za-z0-9_-]{11})' || q); end if;
  if m is not null then
    return 'https://www.youtube.com/watch?v=' || m[1];
  end if;
  m := regexp_match(u, '^https://(?:www\.)?instagram\.com/(?:[A-Za-z0-9._]{1,30}/)?(p|reels?|tv)/([A-Za-z0-9_-]{5,40})/?' || q);
  if m is not null then
    return 'https://www.instagram.com/' || case when m[1] = 'reels' then 'reel' else m[1] end || '/' || m[2] || '/';
  end if;
  m := regexp_match(u, '^https://(?:www\.|m\.)?tiktok\.com/@([A-Za-z0-9._]{2,24})/video/([0-9]{8,25})/?' || q);
  if m is not null then
    return 'https://www.tiktok.com/@' || m[1] || '/video/' || m[2];
  end if;
  m := regexp_match(u, '^https://(?:vm|vt)\.tiktok\.com/([A-Za-z0-9]{5,20})/?$');
  if m is not null then
    return 'https://vm.tiktok.com/' || m[1] || '/';
  end if;
  return null;
end $$;

-- Starý add_clip (ľubovoľná URL, bez súhlasu s fotkami) zaniká.
drop function if exists public.add_clip(uuid, text, text, text);

-- Nový klip. p_kind: 'video' | 'photo' (p_media_path z bucketu media, video s p_duration_s)
-- alebo 'embed' (p_embed_url). Overený = autor mal check-in na spote, ktorý trval
-- v posledných clip_verify_hours (check-in sa ráta najviac checkin_max_minutes).
create or replace function public.add_clip(p_spot uuid, p_kind text, p_media_path text default null, p_embed_url text default null,
                                           p_trick text default null, p_duration_s int default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.game_require_player(true);
  cfg jsonb := public.game_cfg();
  url text;
  path text;
  obj_size bigint;
  v boolean;
  c public.clips;
begin
  if not public.game_can_publish(uid) then
    raise exception using message = 'NEED_MEDIA_CONSENT';
  end if;
  if not exists (select 1 from public.spots where id = p_spot and approved) then
    raise exception using message = 'SPOT_NOT_FOUND';
  end if;
  if char_length(btrim(coalesce(p_trick, ''))) > 60 then
    raise exception using message = 'BAD_INPUT';
  end if;

  if p_kind = 'embed' then
    url := public.game_embed_url(p_embed_url);
    if url is null then
      raise exception using message = 'BAD_EMBED';
    end if;
  elsif p_kind in ('video', 'photo') then
    path := btrim(coalesce(p_media_path, ''));
    if path !~ ('^' || uid::text || '/[0-9a-f-]{36}\.' || case p_kind when 'video' then '(mp4|mov|webm)' else '(jpg|webp)' end || '$') then
      raise exception using message = 'BAD_MEDIA';
    end if;
    select coalesce((o.metadata ->> 'size')::bigint, 0) into obj_size
    from storage.objects o where o.bucket_id = 'media' and o.name = path;
    if not found or exists (select 1 from public.clips where media_path = path) then
      raise exception using message = 'BAD_MEDIA';
    end if;
    if obj_size > (cfg ->> case p_kind when 'video' then 'video_max_mb' else 'photo_max_mb' end)::bigint * 1024 * 1024 then
      raise exception using message = 'MEDIA_TOO_BIG';
    end if;
    if p_kind = 'video' then
      if p_duration_s is null or p_duration_s < 1 then
        raise exception using message = 'BAD_INPUT';
      end if;
      if p_duration_s > (cfg ->> 'video_max_seconds')::int then
        raise exception using message = 'VIDEO_TOO_LONG';
      end if;
    end if;
  else
    raise exception using message = 'BAD_INPUT';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('gosko:add_clip:' || uid::text, 0));
  if (select count(*) from public.clips where player_id = uid and created_at > now() - interval '24 hours')
     >= (cfg ->> 'clips_per_day')::int then
    raise exception using message = 'CLIP_LIMIT';
  end if;

  select exists (
    select 1 from public.check_ins ci
    where ci.player_id = uid and ci.spot_id = p_spot
      and least(coalesce(ci.ended_at, now()), ci.started_at + make_interval(mins => (cfg ->> 'checkin_max_minutes')::int))
          >= now() - make_interval(hours => (cfg ->> 'clip_verify_hours')::int)
  ) into v;
  begin
    insert into public.clips (player_id, spot_id, media_url, media_path, media_kind, trick, duration_s, verified)
    values (uid, p_spot, url, path, p_kind, nullif(btrim(p_trick), ''), case when p_kind = 'video' then p_duration_s end, v)
    returning * into c;
  exception when unique_violation then
    raise exception using message = 'BAD_MEDIA';
  end;
  return jsonb_build_object('id', c.id, 'spot_id', c.spot_id, 'verified', c.verified, 'created_at', c.created_at);
end $$;

-- Autor zmaže svoj klip; vráti cestu súboru, klient ho zmaže z úložiska (politika vlastného priečinka).
create or replace function public.delete_clip(p_clip uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.game_require_player(false);
  c public.clips;
begin
  delete from public.clips where id = p_clip and player_id = uid returning * into c;
  if not found then
    raise exception using message = 'FORBIDDEN';
  end if;
  return jsonb_build_object('id', c.id, 'media_path', c.media_path);
end $$;

-- Nahratie do media: hráč so súhlasmi, iba do vlastného priečinka, názov {uuid}.{prípona},
-- najviac 2 × clips_per_day súborov za 24 h (aj nepoužité).
create or replace function public.game_media_upload_ok(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null
     and p_name ~ ('^' || auth.uid()::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(mp4|mov|webm|jpg|webp)$')
     and public.game_can_write(auth.uid())
     and public.game_can_publish(auth.uid())
     and (select count(*) from storage.objects o
          where o.bucket_id = 'media' and o.name like auth.uid()::text || '/%'
            and o.created_at > now() - interval '24 hours') < 2 * (public.game_cfg() ->> 'clips_per_day')::int
$$;

-- ---------- úložisko: bucket media ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('media', 'media', false, 52428800, array['video/mp4', 'video/quicktime', 'video/webm', 'image/jpeg', 'image/webp'])
  on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Ghoskate: hráč nahrá klip" on storage.objects;
create policy "Ghoskate: hráč nahrá klip" on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and public.game_media_upload_ok(name));
-- čítanie súborov (politika nad clips_public) je pod pohľadom nižšie
drop policy if exists "Ghoskate: autor a admin mažú súbor" on storage.objects;
create policy "Ghoskate: autor a admin mažú súbor" on storage.objects for delete to authenticated
  using (bucket_id = 'media' and ((storage.foldername(name))[1] = (select auth.uid()::text) or public.is_admin()));

-- ---------- verejný feed ----------
-- Iba klipy hráčov, ktorí smú zverejňovať (U16 bez súhlasu s fotkami tu nie je), na schválených spotoch,
-- bez skrytých. Bez player_id. crew = snímka crew v čase klipu.
-- Politika čítania súborov číta tento pohľad, preto ide dole a pred drop view sa zhodí.
drop policy if exists "Ghoskate: verejný klip, autor a admin čítajú súbor" on storage.objects;
drop view if exists public.clips_public;
create view public.clips_public with (security_barrier = true) as
  select c.id, c.spot_id, s.name as spot_name, p.username, c.crew_id, cr.tag as crew_tag, cr.color as crew_color,
         c.media_kind, c.media_path, case when c.media_kind = 'embed' then c.media_url end as embed_url,
         c.trick, c.duration_s, c.verified,
         (select count(*) from public.clip_likes l where l.clip_id = c.id)::int as likes, c.created_at
  from public.clips c
  join public.players p on p.id = c.player_id
  join public.game_publishers g on g.player_id = c.player_id
  join public.spots s on s.id = c.spot_id and s.approved
  left join public.crews cr on cr.id = c.crew_id
  where not c.hidden;
create policy "Ghoskate: verejný klip, autor a admin čítajú súbor" on storage.objects for select to anon, authenticated
  using (bucket_id = 'media' and (
    exists (select 1 from public.clips_public cp where cp.media_path = storage.objects.name)
    or (storage.foldername(name))[1] = (select auth.uid()::text)
    or public.is_admin()));

revoke all on public.clips_public from anon, authenticated;
grant select on public.clips_public to anon, authenticated, service_role;

-- Admin: zoznam klipov s prezývkou (aj skrytých) cez clips?select=…,players(username); skrýva cez update(hidden) z 010.
-- media_consent_at mení iba rodič (service_role) a withdraw_media_consent, nie priamy update hráča.

-- ---------- práva na funkcie ----------
revoke all on function public.game_can_publish(uuid), public.confirm_player_guardian(uuid, boolean),
  public.withdraw_media_consent(), public.game_me(), public.game_embed_url(text),
  public.add_clip(uuid, text, text, text, text, int), public.delete_clip(uuid), public.game_media_upload_ok(text)
  from public, anon, authenticated;
grant execute on function public.game_me(), public.withdraw_media_consent(), public.add_clip(uuid, text, text, text, text, int),
  public.delete_clip(uuid), public.game_media_upload_ok(text) to authenticated;
grant execute on function public.confirm_player_guardian(uuid, boolean) to service_role;
grant execute on function public.game_embed_url(text) to authenticated, service_role;

-- PostgREST (Supabase API) načíta zmenenú schému
notify pgrst, 'reload schema';

commit;

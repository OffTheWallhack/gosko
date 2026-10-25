-- =====================================================================
-- 002_registration_v2: jazdci, registrácie v2, výsledky s bodmi, NFT, audit (Task 7)
-- Poradie: supabase-setup.sql -> 001 -> 002 -> 003. Opakovateľné.
-- Kontrakt: docs/KONTRAKT-REGISTRACIA.md, sekcia 2.
-- Anon nemá prístup k riders, rider_private, registrations, nft_tokens,
-- audit_log ani rate_limits. Admin ich číta, zapisuje iba service_role (API).
-- =====================================================================
begin;

-- ---------- pomocné funkcie ----------
create or replace function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- Body podľa umiestnenia, zhodné s POINTS v data.js.
create or replace function public.points_for(place int) returns int
language sql immutable parallel safe set search_path = '' as $$
  select case
    when $1 is null or $1 < 1 then 0
    when $1 = 1 then 100
    when $1 = 2 then 80
    when $1 <= 4 then 60
    when $1 <= 8 then 40
    when $1 <= 16 then 20
    else 5
  end
$$;

-- Verejné meno: full = celé, short = „Marek K.“, nick = prezývka (inak ako short).
create or replace function public.public_name(display_name text, nickname text, mode text) returns text
language sql immutable parallel safe set search_path = '' as $$
  select case
    when $3 = 'full' then btrim($1)
    when $3 = 'nick' and nullif(btrim($2), '') is not null then btrim($2)
    when cardinality(w) <= 1 then w[1]
    else w[1] || ' ' || upper(left(w[cardinality(w)], 1)) || '.'
  end
  from (select regexp_split_to_array(btrim(coalesce($1, '')), '\s+') as w) s
$$;

-- ---------- events ----------
create table if not exists public.events (
  id text primary key check (id ~ '^[a-z0-9][a-z0-9-]{0,59}$'),
  name text not null check (char_length(name) between 1 and 80),
  city text check (char_length(city) <= 60),
  country char(2) not null default 'SK' check (country ~ '^[A-Z]{2}$'),
  date date,
  season int check (season between 2000 and 2100),
  status text not null default 'planned' check (status in ('planned', 'open', 'done', 'cancelled')),
  registration_open boolean not null default false,
  capacity int check (capacity > 0),
  created_at timestamptz not null default now()
);

-- ---------- riders (verejná časť jazdca) ----------
create table if not exists public.riders (
  id uuid primary key default gen_random_uuid(),
  rider_ref text not null unique check (rider_ref ~ '^0x[0-9a-f]{64}$'),   -- náhodné, ide na chain
  display_name text not null check (char_length(btrim(display_name)) between 1 and 60),
  nickname text check (char_length(btrim(nickname)) between 1 and 40),
  country char(2) not null default 'SK' check (country ~ '^[A-Z]{2}$'),
  city text check (char_length(city) <= 60),
  public_name_mode text not null default 'full' check (public_name_mode in ('full', 'short', 'nick')),
  is_founder boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------- rider_private (osobné údaje, iba admin a service_role) ----------
create table if not exists public.rider_private (
  rider_id uuid primary key references public.riders(id) on delete cascade,
  legal_name text not null check (char_length(btrim(legal_name)) between 1 and 120),
  birth_date date not null check (birth_date > date '1900-01-01'),
  email text not null check (char_length(email) <= 254 and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone text check (char_length(phone) <= 40),
  instagram text check (char_length(instagram) <= 60),
  guardian_name text check (char_length(guardian_name) <= 120),
  guardian_email text check (char_length(guardian_email) <= 254 and guardian_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists rider_private_email_birth_key on public.rider_private (lower(email), birth_date);
create or replace trigger rider_private_updated_at before update on public.rider_private
  for each row execute function public.set_updated_at();

-- ---------- registrations: pôvodná tabuľka -> registrations_legacy ----------
do $$
declare
  c record;
begin
  if to_regclass('public.registrations_legacy') is null and exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'registrations' and column_name = 'parent_consent'
  ) then
    alter table public.registrations rename to registrations_legacy;
    -- názvy indexov sú v schéme jedinečné, nová tabuľka by s nimi kolidovala
    for c in select conname from pg_constraint
             where conrelid = 'public.registrations_legacy'::regclass and conname like 'registrations\_%'
               and conname not like 'registrations\_legacy\_%'
    loop
      execute format('alter table public.registrations_legacy rename constraint %I to %I',
                     c.conname, 'registrations_legacy_' || substr(c.conname, char_length('registrations_') + 1));
    end loop;
  end if;
end $$;

-- starý formulár sa vypína: iba admin SELECT
drop policy if exists "Ktokoľvek sa registruje" on public.registrations_legacy;
drop policy if exists "Admin zapisuje príchod" on public.registrations_legacy;
revoke all on public.registrations_legacy from anon, authenticated;
grant select on public.registrations_legacy to authenticated;

-- ---------- registrations v2 ----------
create table if not exists public.registrations (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid not null references public.riders(id) on delete cascade,
  event_id text not null references public.events(id),
  category text not null check (category in ('open', 'u16', 'women')),
  status text not null check (status in ('pending_guardian', 'confirmed', 'checked_in', 'no_show', 'cancelled')),
  token uuid not null unique default gen_random_uuid(),          -- obsah QR passu
  consent_version text not null check (char_length(consent_version) between 1 and 40),
  consent_at timestamptz not null,
  photo_consent boolean not null default false,
  nft_consent boolean not null default false,
  guardian_token uuid unique,                                     -- jednorazový odkaz pre rodiča
  guardian_confirmed_at timestamptz,
  checked_in_at timestamptz,
  created_at timestamptz not null default now(),
  unique (rider_id, event_id)
);
create index if not exists registrations_event_idx on public.registrations (event_id);

-- ---------- event_results: väzba na registráciu a body ----------
alter table public.event_results add column if not exists registration_id uuid
  references public.registrations(id) on delete set null;
alter table public.event_results add column if not exists points int not null default 0;

-- Dvaja rovnako menovaní jazdci sú dva riadky: unikátnosť mena len pre staršie
-- výsledky bez registrácie, pre registrovaných podľa registration_id.
do $$
declare
  c record;
begin
  for c in
    select con.conname from pg_constraint con
    where con.conrelid = 'public.event_results'::regclass and con.contype = 'u'
      and (select array_agg(a.attname::text order by a.attname) from pg_attribute a
           where a.attrelid = con.conrelid and a.attnum = any (con.conkey)) = array['category', 'event_id', 'rider_name']
  loop
    execute format('alter table public.event_results drop constraint %I', c.conname);
  end loop;
end $$;
create unique index if not exists event_results_legacy_name_key on public.event_results (event_id, category, rider_name)
  where registration_id is null and rider_name <> 'GOSko jazdec';
create unique index if not exists event_results_registration_key on public.event_results (event_id, category, registration_id)
  where registration_id is not null;
create index if not exists event_results_registration_idx on public.event_results (registration_id);

-- Body z miesta; registrácia musí patriť k tomu istému eventu; pri výmaze
-- jazdca (registration_id -> NULL) sa meno nahradí, ostane miesto a body.
create or replace function public.event_results_before() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  reg_event text;
begin
  new.points := public.points_for(new.place);
  if new.registration_id is not null then
    select g.event_id into reg_event from public.registrations g where g.id = new.registration_id;
    if found and reg_event <> new.event_id then
      raise exception 'registration_event_mismatch'
        using errcode = '22023', detail = format('registration %s belongs to %s', new.registration_id, reg_event);
    end if;
  end if;
  if tg_op = 'UPDATE' and old.registration_id is not null and new.registration_id is null then
    new.rider_name := 'GOSko jazdec';
  end if;
  return new;
end $$;
revoke all on function public.event_results_before() from public, anon, authenticated;

create or replace trigger event_results_before before insert or update on public.event_results
  for each row execute function public.event_results_before();

update public.event_results set points = public.points_for(place) where points is distinct from public.points_for(place);

-- Anon číta z event_results priamo len staršie výsledky bez registrácie.
-- Registrovaní jazdci sú verejne iba cez results_public (podľa public_name_mode).
drop policy if exists "Výsledky vidí každý" on public.event_results;
drop policy if exists "Výsledky bez registrácie vidí každý" on public.event_results;
create policy "Výsledky bez registrácie vidí každý" on public.event_results for select
  using (registration_id is null or public.is_admin());

-- ---------- nft_tokens ----------
create table if not exists public.nft_tokens (
  registration_id uuid primary key references public.registrations(id) on delete cascade,
  chain_id int not null,
  contract text not null check (contract ~ '^0x[0-9a-fA-F]{40}$'),
  token_id numeric check (token_id >= 1),
  status text not null check (status in ('pending', 'minted', 'result_pending', 'result_set', 'failed', 'revoked')),
  mint_tx text check (mint_tx ~ '^0x[0-9a-fA-F]{64}$'),
  result_tx text check (result_tx ~ '^0x[0-9a-fA-F]{64}$'),
  error text,
  attempts int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists nft_tokens_token_key on public.nft_tokens (chain_id, lower(contract), token_id)
  where token_id is not null;
create index if not exists nft_tokens_status_idx on public.nft_tokens (status);
create or replace trigger nft_tokens_updated_at before update on public.nft_tokens
  for each row execute function public.set_updated_at();

-- ---------- audit_log ----------
create table if not exists public.audit_log (
  id bigserial primary key,
  at timestamptz not null default now(),
  actor uuid,
  action text not null check (char_length(action) between 1 and 80),
  entity text,
  entity_id text,
  data jsonb
);
create index if not exists audit_log_entity_idx on public.audit_log (entity, entity_id);

-- ---------- rate_limits ----------
create table if not exists public.rate_limits (
  key text not null check (char_length(key) between 1 and 200),
  window_start timestamptz not null,
  count int not null default 0,
  primary key (key, window_start)
);
create index if not exists rate_limits_window_idx on public.rate_limits (window_start);

-- Atomicky započíta pokus; true = limit prekročený. Okná sú pevné (date_bin).
create or replace function public.rate_limit_hit(p_key text, p_limit int, p_window_minutes int) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  w timestamptz;
  c int;
begin
  if p_key is null or p_limit is null or p_limit < 0
     or p_window_minutes is null or p_window_minutes < 1 or p_window_minutes > 1440 then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  w := date_bin(make_interval(mins => p_window_minutes), now(), timestamptz '2000-01-01 00:00:00+00');
  insert into public.rate_limits as r (key, window_start, count) values (p_key, w, 1)
  on conflict (key, window_start) do update set count = r.count + 1
  returning r.count into c;
  if c = 1 then
    delete from public.rate_limits where window_start < now() - interval '2 days';
  end if;
  return c > p_limit;
end $$;
revoke all on function public.rate_limit_hit(text, int, int) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, int, int) to service_role;

-- Potvrdenie rodiča: pending_guardian -> confirmed. Neplatný alebo použitý token = PT404 (HTTP 404).
create or replace function public.confirm_guardian(p_token uuid) returns public.registrations
language plpgsql security invoker set search_path = '' as $$
declare
  r public.registrations;
begin
  update public.registrations
     set status = 'confirmed', guardian_confirmed_at = now(), guardian_token = null
   where guardian_token = p_token and status = 'pending_guardian'
  returning * into r;
  if not found then
    raise exception 'invalid_token' using errcode = 'PT404';  -- PostgREST: HTTP 404
  end if;
  return r;
end $$;
revoke all on function public.confirm_guardian(uuid) from public, anon, authenticated;
grant execute on function public.confirm_guardian(uuid) to service_role;

-- ---------- RLS a granty pre nové tabuľky ----------
alter table public.events enable row level security;
alter table public.riders enable row level security;
alter table public.rider_private enable row level security;
alter table public.registrations enable row level security;
alter table public.nft_tokens enable row level security;
alter table public.audit_log enable row level security;
alter table public.rate_limits enable row level security;

drop policy if exists "Admin vidí eventy v2" on public.events;
create policy "Admin vidí eventy v2" on public.events for select to authenticated using (public.is_admin());
drop policy if exists "Admin vidí jazdcov" on public.riders;
create policy "Admin vidí jazdcov" on public.riders for select to authenticated using (public.is_admin());
drop policy if exists "Admin vidí osobné údaje" on public.rider_private;
create policy "Admin vidí osobné údaje" on public.rider_private for select to authenticated using (public.is_admin());
drop policy if exists "Admin vidí registrácie" on public.registrations;
create policy "Admin vidí registrácie" on public.registrations for select to authenticated using (public.is_admin());
drop policy if exists "Admin vidí NFT" on public.nft_tokens;
create policy "Admin vidí NFT" on public.nft_tokens for select to authenticated using (public.is_admin());
drop policy if exists "Admin vidí audit" on public.audit_log;
create policy "Admin vidí audit" on public.audit_log for select to authenticated using (public.is_admin());
drop policy if exists "Admin vidí limity" on public.rate_limits;
create policy "Admin vidí limity" on public.rate_limits for select to authenticated using (public.is_admin());

revoke all on public.events, public.riders, public.rider_private, public.registrations,
  public.nft_tokens, public.audit_log, public.rate_limits from anon, authenticated;
revoke all on sequence public.audit_log_id_seq from anon, authenticated;
grant select on public.events, public.riders, public.rider_private, public.registrations,
  public.nft_tokens, public.audit_log, public.rate_limits to authenticated;
grant select, insert, update, delete on public.events, public.riders, public.rider_private, public.registrations,
  public.nft_tokens, public.audit_log, public.rate_limits, public.event_results to service_role;
grant usage, select on sequence public.audit_log_id_seq to service_role;

-- ---------- verejné pohľady (iba SELECT, bez osobných údajov) ----------
-- Verejný je jazdec s aspoň jednou platnou registráciou; jazdec do 16 rokov až
-- po potvrdení rodiča. Inak sa jeho meno nikde verejne neukáže.
-- 006 pohľad zúžil (bez city); opätovný beh 002 ho preto vytvára nanovo
drop view if exists public.riders_public;
create view public.riders_public with (security_barrier = true) as
  select r.id, public.public_name(r.display_name, r.nickname, r.public_name_mode) as public_name,
         r.country, r.city, r.is_founder
  from public.riders r
  where exists (
    select 1 from public.registrations g
    where g.rider_id = r.id
      and g.status in ('confirmed', 'checked_in', 'no_show')
      and (g.category <> 'u16' or g.guardian_confirmed_at is not null)
  );

create or replace view public.results_public with (security_barrier = true) as
  select er.event_id, er.category, er.place, er.points,
         rd.id as rider_id,
         case
           when er.registration_id is null then er.rider_name
           when g.status in ('confirmed', 'checked_in', 'no_show')
                and (g.category <> 'u16' or g.guardian_confirmed_at is not null)
             then public.public_name(rd.display_name, rd.nickname, rd.public_name_mode)
           else 'GOSko jazdec'
         end as public_name,
         n.chain_id, n.token_id, n.status as nft_status
  from public.event_results er
  left join public.registrations g on g.id = er.registration_id
  left join public.riders rd on rd.id = g.rider_id
  left join public.nft_tokens n on n.registration_id = er.registration_id;

create or replace view public.events_public as
  select id, name, city, country, date, season, status, registration_open, capacity, created_at
  from public.events;

revoke all on public.riders_public, public.results_public, public.events_public from anon, authenticated;
grant select on public.riders_public, public.results_public, public.events_public to anon, authenticated;
grant select on public.riders_public, public.results_public, public.events_public to service_role;

-- PostgREST (Supabase API) načíta zmenenú schému
notify pgrst, 'reload schema';

commit;

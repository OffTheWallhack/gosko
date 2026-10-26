-- =====================================================================
-- 012_game_loot: gear (nálepky a výbava), loot dropy s tiermi, tajné kódy odmien,
-- nálepka za GOSko event po check-ine posádkou (Task 1). Opakovateľné.
-- Poradie: … -> 010 -> 011 -> 012.
--
-- Loot drop: admin alebo partner (cez service_role) položí drop na spot s tiermi,
-- napr. tier 1 up_to 3 = prví traja, tier 2 up_to 50 = 4. až 50. Hráč ho získa takto:
-- aktívny check-in na spote -> overený klip na spote od začiatku dropu -> claim_loot
-- vráti kód odmeny. Kódy sú v loot_drop_secrets, ktoré nečíta nikto okrem service_role;
-- hráč vidí kód iba vlastného claimu (claim_loot, my_loot). Bez vstupného a bez
-- peňažných výhier (zákon 30/2019): odmeny sú zľavy a vecné ceny.
-- =====================================================================
begin;

-- ---------- gear ----------
create table if not exists public.gear (
  id text primary key check (id ~ '^[a-z0-9][a-z0-9-]{1,59}$'),
  name text not null check (char_length(btrim(name)) between 1 and 60),
  kind text not null check (kind in ('sticker', 'griptape', 'deck', 'wheels', 'trucks', 'badge', 'other')),
  description text check (char_length(description) <= 400),
  how_to_unlock text check (char_length(how_to_unlock) <= 200),
  image_url text check (char_length(image_url) <= 500 and image_url ~* '^https?://'),
  event_id text references public.events(id) on delete set null,   -- odmena za check-in na evente
  created_at timestamptz not null default now()
);
create index if not exists gear_event_idx on public.gear (event_id) where event_id is not null;

create table if not exists public.unlocked_gear (
  player_id uuid not null references public.players(id) on delete cascade,
  gear_id text not null references public.gear(id) on delete cascade,
  source text not null check (source in ('event', 'loot', 'admin', 'starter')),
  source_ref text check (char_length(source_ref) <= 100),
  unlocked_at timestamptz not null default now(),
  primary key (player_id, gear_id)
);

-- ---------- loot ----------
create table if not exists public.loot_drops (
  id uuid primary key default gen_random_uuid(),
  spot_id uuid not null references public.spots(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 80),
  description text check (char_length(description) <= 400),
  partner text check (char_length(partner) <= 80),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check (ends_at is null or ends_at > starts_at)
);
create index if not exists loot_drops_spot_idx on public.loot_drops (spot_id);

-- Tier platí pre poradie claimu 1 … up_to (prvý tier s najmenším up_to >= poradie).
create table if not exists public.loot_tiers (
  drop_id uuid not null references public.loot_drops(id) on delete cascade,
  tier smallint not null check (tier between 1 and 20),
  label text not null check (char_length(btrim(label)) between 1 and 40),
  up_to int not null check (up_to between 1 and 100000),
  reward text check (char_length(reward) <= 200),          -- verejný popis odmeny
  gear_id text references public.gear(id) on delete set null,
  primary key (drop_id, tier),
  unique (drop_id, up_to)
);

-- Kódy odmien: nikdy čitateľné pre anon, authenticated ani admina.
create table if not exists public.loot_drop_secrets (
  drop_id uuid not null,
  tier smallint not null,
  reward_code text not null check (char_length(reward_code) between 1 and 100),
  primary key (drop_id, tier),
  foreign key (drop_id, tier) references public.loot_tiers(drop_id, tier) on delete cascade
);

create table if not exists public.loot_claims (
  id uuid primary key default gen_random_uuid(),
  drop_id uuid not null references public.loot_drops(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  tier smallint not null,
  rank int not null check (rank >= 1),
  claimed_at timestamptz not null default now(),
  unique (drop_id, player_id),
  unique (drop_id, rank)
);
create index if not exists loot_claims_player_idx on public.loot_claims (player_id);

-- ---------- RPC: loot ----------
create or replace function public.claim_loot(p_drop uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.game_require_player(true);
  d public.loot_drops;
  c public.loot_claims;
  t public.loot_tiers;
  n int;
begin
  -- zámok dropu: súbežné claimy dostanú poradie po jednom
  select * into d from public.loot_drops where id = p_drop for update;
  if not found or not d.active or now() < d.starts_at or (d.ends_at is not null and now() >= d.ends_at) then
    raise exception using message = 'DROP_INACTIVE';
  end if;

  select * into c from public.loot_claims where drop_id = d.id and player_id = uid;
  if not found then
    if public.game_active_checkin(uid, d.spot_id) is null then
      raise exception using message = 'NEED_CHECKIN';
    end if;
    if not exists (select 1 from public.clips cl
                   where cl.player_id = uid and cl.spot_id = d.spot_id and cl.verified and not cl.hidden
                     and cl.created_at >= d.starts_at) then
      raise exception using message = 'NEED_CLIP_ON_SPOT';
    end if;
    select count(*) + 1 into n from public.loot_claims where drop_id = d.id;
    select * into t from public.loot_tiers where drop_id = d.id and up_to >= n order by up_to limit 1;
    if not found then
      raise exception using message = 'DROP_EMPTY';
    end if;
    insert into public.loot_claims (drop_id, player_id, tier, rank) values (d.id, uid, t.tier, n)
    returning * into c;
    if t.gear_id is not null then
      insert into public.unlocked_gear (player_id, gear_id, source, source_ref)
      values (uid, t.gear_id, 'loot', d.id::text) on conflict do nothing;
    end if;
  else
    select * into t from public.loot_tiers where drop_id = d.id and tier = c.tier;
  end if;

  return jsonb_build_object('drop_id', d.id, 'tier', c.tier, 'rank', c.rank, 'label', t.label, 'reward', t.reward,
    'gear_id', t.gear_id, 'claimed_at', c.claimed_at,
    'reward_code', (select s.reward_code from public.loot_drop_secrets s where s.drop_id = d.id and s.tier = c.tier));
end $$;

create or replace function public.my_loot()
returns table (drop_id uuid, spot_id uuid, title text, partner text, tier smallint, label text, reward text,
               reward_code text, rank int, claimed_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select c.drop_id, d.spot_id, d.title, d.partner, c.tier, t.label, t.reward, s.reward_code, c.rank, c.claimed_at
  from public.loot_claims c
  join public.loot_drops d on d.id = c.drop_id
  left join public.loot_tiers t on t.drop_id = c.drop_id and t.tier = c.tier
  left join public.loot_drop_secrets s on s.drop_id = c.drop_id and s.tier = c.tier
  where c.player_id = public.game_require_player(false)
  order by c.claimed_at desc
$$;

-- ---------- nálepka za GOSko event ----------
-- Check-in posádkou (registrations.status -> checked_in) udelí gear eventu prepojenému hráčovi.
-- Rovnako pri neskoršom prepojení hráča s jazdcom a pri gear pridanom po evente.
create or replace function public.grant_event_gear() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'registrations' then
    if new.status = 'checked_in' and (tg_op = 'INSERT' or old.status is distinct from 'checked_in') then
      insert into public.unlocked_gear (player_id, gear_id, source, source_ref)
      select p.id, g.id, 'event', new.event_id
      from public.players p join public.gear g on g.event_id = new.event_id
      where p.rider_id = new.rider_id
      on conflict do nothing;
    end if;
  elsif tg_table_name = 'players' then
    insert into public.unlocked_gear (player_id, gear_id, source, source_ref)
    select new.id, g.id, 'event', r.event_id
    from public.registrations r join public.gear g on g.event_id = r.event_id
    where r.rider_id = new.rider_id and r.status = 'checked_in'
    on conflict do nothing;
  elsif tg_table_name = 'gear' and new.event_id is not null then
    insert into public.unlocked_gear (player_id, gear_id, source, source_ref)
    select p.id, new.id, 'event', new.event_id
    from public.registrations r join public.players p on p.rider_id = r.rider_id
    where r.event_id = new.event_id and r.status = 'checked_in'
    on conflict do nothing;
  end if;
  return null;
end $$;

create or replace trigger registrations_grant_event_gear after insert or update of status on public.registrations
  for each row execute function public.grant_event_gear();
create or replace trigger players_grant_event_gear after insert or update of rider_id on public.players
  for each row execute function public.grant_event_gear();
create or replace trigger gear_grant_event_gear after insert or update of event_id on public.gear
  for each row execute function public.grant_event_gear();

-- ---------- RLS a granty ----------
alter table public.gear enable row level security;
alter table public.unlocked_gear enable row level security;
alter table public.loot_drops enable row level security;
alter table public.loot_tiers enable row level security;
alter table public.loot_drop_secrets enable row level security;
alter table public.loot_claims enable row level security;

drop policy if exists "Gear vidí každý" on public.gear;
create policy "Gear vidí každý" on public.gear for select using (true);
drop policy if exists "Hráč vidí svoj gear" on public.unlocked_gear;
create policy "Hráč vidí svoj gear" on public.unlocked_gear for select to authenticated using (player_id = auth.uid());
drop policy if exists "Hráč vidí svoje claimy" on public.loot_claims;
create policy "Hráč vidí svoje claimy" on public.loot_claims for select to authenticated using (player_id = auth.uid());
-- loot_drops, loot_tiers: verejne iba cez loot_public; loot_drop_secrets: žiadna politika

revoke all on public.gear, public.unlocked_gear, public.loot_drops, public.loot_tiers, public.loot_drop_secrets,
  public.loot_claims from anon, authenticated;
grant select on public.gear to anon, authenticated;
grant select on public.unlocked_gear, public.loot_claims to authenticated;
grant select, insert, update, delete on public.gear, public.unlocked_gear, public.loot_drops, public.loot_tiers,
  public.loot_drop_secrets, public.loot_claims to service_role;

-- ---------- verejné pohľady ----------
-- Aktívne a pripravované dropy s tiermi a počtom zostávajúcich odmien. Bez kódov a bez hráčov.
create or replace view public.loot_public with (security_barrier = true) as
  select d.id, d.spot_id, d.title, d.description, d.partner, d.starts_at, d.ends_at,
         coalesce(t.tiers, '[]'::jsonb) as tiers,
         coalesce(t.capacity, 0) as capacity,
         coalesce(cl.claimed, 0) as claimed,
         greatest(coalesce(t.capacity, 0) - coalesce(cl.claimed, 0), 0) as remaining
  from public.loot_drops d
  left join lateral (select jsonb_agg(jsonb_build_object('tier', x.tier, 'label', x.label, 'up_to', x.up_to,
                                                         'reward', x.reward, 'gear_id', x.gear_id) order by x.up_to) as tiers,
                            max(x.up_to)::int as capacity
                     from public.loot_tiers x where x.drop_id = d.id) t on true
  left join lateral (select count(*)::int as claimed from public.loot_claims c where c.drop_id = d.id) cl on true
  where d.active and (d.ends_at is null or d.ends_at > now());

-- spot_summary z 011 + či je na spote práve aktívny loot so zostávajúcou odmenou
create or replace view public.spot_summary with (security_barrier = true) as
  select s.id, s.name, s.city, s.kind, s.description, s.lat, s.lng, s.photo_url, s.needs_verification,
         rt.skulls, coalesce(rt.ratings, 0) as ratings,
         coalesce(ci.people_now, 0) as people_now,
         st.status, bu.bust,
         ctl.crew_id as control_crew_id, ctl.tag as control_tag, ctl.color as control_color, ctl.points as control_points,
         exists (select 1 from public.loot_public l
                 where l.spot_id = s.id and l.starts_at <= now() and l.remaining > 0) as loot_active
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
  left join public.spot_control ctl on ctl.spot_id = s.id
  where s.approved;

revoke all on public.loot_public, public.spot_summary from anon, authenticated;
grant select on public.loot_public, public.spot_summary to anon, authenticated, service_role;

-- ---------- práva na funkcie ----------
revoke all on function public.claim_loot(uuid), public.my_loot(), public.grant_event_gear() from public, anon, authenticated;
grant execute on function public.claim_loot(uuid), public.my_loot() to authenticated;

-- PostgREST (Supabase API) načíta zmenenú schému
notify pgrst, 'reload schema';

commit;

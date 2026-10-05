-- =====================================================================
-- 011_game_crews: crews, pozývacie kódy, Turf Wars skóre a kontrola spotov (Task 1).
-- Poradie: … -> 010 -> 011 -> 012. Opakovateľné.
--
-- Skóre crew na spote za control_window_days (30 dní):
--   check-in: 1 bod za minútu, najviac 120 min (checkin_points z 010)
--   overený klip: 50 × (1 + 0,1 × min(lajky, 20))
-- Body patria crew, v ktorej bol hráč v čase check-inu alebo klipu (snímka crew_id),
-- takže prechod do inej crew body nepresunie. Spot ovláda crew s najvyšším skóre,
-- ak má aspoň control_min_points (100) a nie je s inou crew na rovnakom skóre.
-- Pozývací kód (8 znakov, ~40 bitov) číta iba člen cez get_invite_code().
-- =====================================================================
begin;

-- ---------- crews ----------
-- Kód: 8 znakov z abecedy bez 0/O/1/I. Bajty z gen_random_uuid() mimo verzie a variantu.
create or replace function public.crew_invite_code() returns text
language sql volatile set search_path = '' as $$
  select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + get_byte(b, i) % 32, 1), '' order by i)
  from (select uuid_send(gen_random_uuid()) as b) x, unnest(array[0, 1, 2, 3, 4, 5, 10, 11]) as i
$$;

create table if not exists public.crews (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 30),
  tag text not null check (tag ~ '^[A-Z0-9]{2,4}$'),
  color text not null check (color ~ '^#[0-9a-fA-F]{6}$'),
  invite_code text not null unique default public.crew_invite_code() check (invite_code ~ '^[A-Z0-9]{8}$'),
  created_by uuid references public.players(id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index if not exists crews_name_key on public.crews (lower(btrim(name)));
create unique index if not exists crews_tag_key on public.crews (tag);

-- Jeden hráč = najviac jedna crew (PK na player_id). Práve jeden owner na crew.
create table if not exists public.crew_members (
  player_id uuid primary key references public.players(id) on delete cascade,
  crew_id uuid not null references public.crews(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now()
);
create index if not exists crew_members_crew_idx on public.crew_members (crew_id);
create unique index if not exists crew_members_one_owner_key on public.crew_members (crew_id) where role = 'owner';

-- ---------- snímka crew pri check-ine a klipe ----------
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'check_ins_crew_id_fkey') then
    alter table public.check_ins add constraint check_ins_crew_id_fkey
      foreign key (crew_id) references public.crews(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'clips_crew_id_fkey') then
    alter table public.clips add constraint clips_crew_id_fkey
      foreign key (crew_id) references public.crews(id) on delete set null;
  end if;
end $$;
create index if not exists check_ins_crew_idx on public.check_ins (crew_id, started_at) where crew_id is not null;
create index if not exists clips_crew_idx on public.clips (crew_id, created_at) where crew_id is not null;

create or replace function public.game_snapshot_crew() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.crew_id is null then
    select m.crew_id into new.crew_id from public.crew_members m where m.player_id = new.player_id;
  end if;
  return new;
end $$;

create or replace trigger check_ins_snapshot_crew before insert on public.check_ins
  for each row execute function public.game_snapshot_crew();
create or replace trigger clips_snapshot_crew before insert on public.clips
  for each row execute function public.game_snapshot_crew();

-- ---------- RPC ----------
create or replace function public.create_crew(p_name text, p_tag text, p_color text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.game_require_player(true);
  c public.crews;
begin
  perform pg_advisory_xact_lock(hashtextextended('gosko:crew_member:' || uid::text, 0));
  if exists (select 1 from public.crew_members where player_id = uid) then
    raise exception using message = 'ALREADY_IN_CREW';
  end if;
  begin
    insert into public.crews (name, tag, color, created_by)
    values (btrim(p_name), upper(btrim(p_tag)), p_color, uid)
    returning * into c;
  exception when unique_violation then
    raise exception using message = 'CREW_TAKEN';
  end;
  insert into public.crew_members (player_id, crew_id, role) values (uid, c.id, 'owner');
  return jsonb_build_object('id', c.id, 'name', c.name, 'tag', c.tag, 'color', c.color);
end $$;

create or replace function public.join_crew(p_code text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.game_require_player(true);
  c public.crews;
begin
  perform pg_advisory_xact_lock(hashtextextended('gosko:crew_member:' || uid::text, 0));
  if exists (select 1 from public.crew_members where player_id = uid) then
    raise exception using message = 'ALREADY_IN_CREW';
  end if;
  -- zámok riadku crew: súbežné pripojenia sa zoradia, limit crew_max platí
  select * into c from public.crews where invite_code = upper(btrim(p_code)) for update;
  if not found then
    raise exception using message = 'BAD_CODE';
  end if;
  if (select count(*) from public.crew_members where crew_id = c.id) >= (public.game_cfg() ->> 'crew_max')::int then
    raise exception using message = 'CREW_FULL';
  end if;
  insert into public.crew_members (player_id, crew_id) values (uid, c.id);
  return jsonb_build_object('id', c.id, 'name', c.name, 'tag', c.tag, 'color', c.color);
end $$;

-- Odchod bez súhlasu rodiča je dovolený. Owner odovzdá crew najstaršiemu členovi;
-- posledný člen crew zruší (body crew zaniknú, check-iny ostanú bez crew).
create or replace function public.leave_crew() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.game_require_player(false);
  m public.crew_members;
begin
  select * into m from public.crew_members where player_id = uid;
  if not found then
    raise exception using message = 'FORBIDDEN';
  end if;
  perform 1 from public.crews where id = m.crew_id for update;
  delete from public.crew_members where player_id = uid;
  if m.role = 'owner' then
    update public.crew_members set role = 'owner'
     where player_id = (select player_id from public.crew_members where crew_id = m.crew_id
                        order by joined_at, player_id limit 1);
  end if;
  if not exists (select 1 from public.crew_members where crew_id = m.crew_id) then
    delete from public.crews where id = m.crew_id;
  end if;
  return jsonb_build_object('crew_id', m.crew_id);
end $$;

-- Owner vyhodí člena; kód sa zmení, aby sa vyhodený nevrátil so starým.
create or replace function public.kick_crew_member(p_player uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.game_require_player(false);
  cid uuid;
begin
  select crew_id into cid from public.crew_members where player_id = uid and role = 'owner';
  if not found or p_player = uid
     or not exists (select 1 from public.crew_members where player_id = p_player and crew_id = cid) then
    raise exception using message = 'FORBIDDEN';
  end if;
  delete from public.crew_members where player_id = p_player and crew_id = cid;
  update public.crews set invite_code = public.crew_invite_code() where id = cid;
  return jsonb_build_object('crew_id', cid, 'player_id', p_player);
end $$;

create or replace function public.get_invite_code() returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := public.game_require_player(false);
  code text;
begin
  select c.invite_code into code
  from public.crew_members m join public.crews c on c.id = m.crew_id
  where m.player_id = uid;
  if not found then
    raise exception using message = 'FORBIDDEN';
  end if;
  return code;
end $$;

-- ---------- RLS: tabuľky crews číta iba service_role, verejne iba pohľady ----------
alter table public.crews enable row level security;
alter table public.crew_members enable row level security;
revoke all on public.crews, public.crew_members from anon, authenticated;
grant select, insert, update, delete on public.crews, public.crew_members to service_role;

-- ---------- verejné pohľady ----------
create or replace view public.crews_public with (security_barrier = true) as
  select c.id, c.name, c.tag, c.color,
         (select count(*) from public.crew_members m where m.crew_id = c.id)::int as members,
         c.created_at
  from public.crews c;

-- Zoznam členov iba pre členov tej istej crew.
create or replace view public.crew_roster with (security_barrier = true) as
  select m.crew_id, p.username, m.role, m.joined_at
  from public.crew_members m
  join public.players p on p.id = m.player_id
  where m.crew_id = (select me.crew_id from public.crew_members me where me.player_id = auth.uid());

create or replace view public.spot_crew_scores with (security_barrier = true) as
  with pts as (
    select ci.spot_id, ci.crew_id, public.checkin_points(ci.started_at, ci.ended_at) as points
    from public.check_ins ci
    where ci.crew_id is not null
      and ci.started_at > now() - make_interval(days => (public.game_cfg() ->> 'control_window_days')::int)
    union all
    select cl.spot_id, cl.crew_id,
           round((public.game_cfg() ->> 'clip_base_points')::numeric
                 * (1 + (public.game_cfg() ->> 'clip_like_bonus')::numeric
                        * least((select count(*) from public.clip_likes l where l.clip_id = cl.id),
                                (public.game_cfg() ->> 'clip_like_cap')::int)))::int
    from public.clips cl
    where cl.crew_id is not null and cl.verified and not cl.hidden
      and cl.created_at > now() - make_interval(days => (public.game_cfg() ->> 'control_window_days')::int)
  )
  select pts.spot_id, pts.crew_id, c.tag, c.color, sum(pts.points)::int as points
  from pts join public.crews c on c.id = pts.crew_id
  group by pts.spot_id, pts.crew_id, c.tag, c.color;

create or replace view public.spot_control with (security_barrier = true) as
  select x.spot_id, x.crew_id, x.tag, x.color, x.points
  from (select s.*,
               rank() over (partition by s.spot_id order by s.points desc) as rk,
               count(*) over (partition by s.spot_id, s.points) as same
        from public.spot_crew_scores s) x
  where x.rk = 1 and x.same = 1 and x.points >= (public.game_cfg() ->> 'control_min_points')::int;

create or replace view public.crew_leaderboard with (security_barrier = true) as
  select c.id as crew_id, c.name, c.tag, c.color,
         (select count(*) from public.crew_members m where m.crew_id = c.id)::int as members,
         coalesce(sc.points, 0)::int as points,
         coalesce(ctl.spots, 0)::int as spots_controlled,
         rank() over (order by coalesce(sc.points, 0) desc)::int as rank
  from public.crews c
  left join (select crew_id, sum(points) as points from public.spot_crew_scores group by crew_id) sc on sc.crew_id = c.id
  left join (select crew_id, count(*) as spots from public.spot_control group by crew_id) ctl on ctl.crew_id = c.id;

-- spot_summary z 010 + crew, ktorá spot ovláda (stĺpce pribúdajú na koniec)
-- drop: opätovný beh po 011/012, ktoré pohľad rozširujú (stĺpce sa cez replace odobrať nedajú)
drop view if exists public.spot_summary;
create view public.spot_summary with (security_barrier = true) as
  select s.id, s.name, s.city, s.kind, s.description, s.lat, s.lng, s.photo_url, s.needs_verification,
         rt.skulls, coalesce(rt.ratings, 0) as ratings,
         coalesce(ci.people_now, 0) as people_now,
         st.status, bu.bust,
         ctl.crew_id as control_crew_id, ctl.tag as control_tag, ctl.color as control_color, ctl.points as control_points
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

revoke all on public.crews_public, public.crew_roster, public.spot_crew_scores, public.spot_control,
  public.crew_leaderboard, public.spot_summary from anon, authenticated;
grant select on public.crews_public, public.spot_crew_scores, public.spot_control, public.crew_leaderboard, public.spot_summary
  to anon, authenticated, service_role;
grant select on public.crew_roster to authenticated, service_role;

-- ---------- práva na funkcie ----------
revoke all on function public.crew_invite_code(), public.game_snapshot_crew(), public.create_crew(text, text, text),
  public.join_crew(text), public.leave_crew(), public.kick_crew_member(uuid), public.get_invite_code()
  from public, anon, authenticated;
grant execute on function public.create_crew(text, text, text), public.join_crew(text), public.leave_crew(),
  public.kick_crew_member(uuid), public.get_invite_code() to authenticated;
grant execute on function public.crew_invite_code() to service_role;  -- default stĺpca invite_code

-- PostgREST (Supabase API) načíta zmenenú schému
notify pgrst, 'reload schema';

commit;

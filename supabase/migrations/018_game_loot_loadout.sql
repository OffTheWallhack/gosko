-- =====================================================================
-- 018_game_loot_loadout: loot drop od admina, loadout s nálepkami, súhlas s NFT a evidencia
-- mintu GoskoLoot (plán Ghoskate, Task 6). Opakovateľné. Poradie: … -> 017 -> 018.
--
-- Loot drop: admin ho zakladá v hre (/hra/admin) cez /api/admin/loot (requireAdmin), API volá
-- admin_create_loot_drop ako service_role. Drop, tiery a kódy vzniknú naraz alebo vôbec. Kódy
-- odmien sa už nikdy nedajú prečítať späť (ani adminom), hráč vidí iba kód vlastného claimu
-- (claim_loot, my_loot z 012). Získanie ostáva podľa 012: aktívny check-in na spote -> overený
-- klip na spote od začiatku dropu -> kód; jeden hráč najviac raz; vyčerpaný drop DROP_EMPTY.
--
-- Loadout: katalóg gearu (nálepky hry) a štartovná nálepka každému hráčovi. Doska hráča
-- (players.board_config) sa mení iba cez set_loadout: vzhľad z povolených kľúčov a najviac
-- 8 nálepiek, ktoré hráč naozaj má (inak GEAR_LOCKED). Priamy update board_config sa ruší.
--
-- NFT (GoskoLoot, soulbound ERC-1155): mint iba so súhlasom hráča (players.nft_consent_at).
-- 16+ ho dáva sám (set_nft_consent), U16 zatiaľ nie (súhlas rodiča s NFT v hre nie je, otvorená
-- otázka). Mint robí API (api/game/loot-nft.js) a je vypnutý, kým nie je nastavená
-- LOOT_CONTRACT_ADDRESS. loot_nft je evidencia mintu bez osobných údajov, číta iba service_role.
-- loot_drops.nft_type = typ tokenu GoskoLoot (1 ghost drop, 2 park pass, 3 trick card,
-- 4 crew/founder, 5 partner stamp), null = drop bez NFT.
-- =====================================================================
begin;

-- ---------- katalóg gearu pre hru ----------
insert into public.gear (id, name, kind, description, how_to_unlock) values
  ('gosko-ghost', 'Duch GOSko', 'sticker', 'Prvá nálepka na tvoju dosku.', 'Máš ju od začiatku.'),
  ('ghost-drop', 'Ghost drop', 'sticker', 'Nálepka z loot dropu na spote.', 'Vyjazdi loot drop: check-in, overený klip na spote a kód odmeny.'),
  ('skull-king', 'Skull king', 'sticker', 'Pre najrýchlejších v loot drope.', 'Buď medzi prvými v loot drope, ktorý ju má v odmenách.'),
  ('spray-tag', 'Spray tag', 'sticker', 'Nálepka od partnerov GOSko.', 'Vyjazdi loot drop partnera, ktorý ju dáva.')
on conflict (id) do update set name = excluded.name, kind = excluded.kind, description = excluded.description, how_to_unlock = excluded.how_to_unlock;

-- štartovná nálepka: každý nový hráč a spätne všetci existujúci
create or replace function public.grant_starter_gear() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.unlocked_gear (player_id, gear_id, source) values (new.id, 'gosko-ghost', 'starter')
  on conflict do nothing;
  return null;
end $$;
create or replace trigger players_grant_starter_gear after insert on public.players
  for each row execute function public.grant_starter_gear();
insert into public.unlocked_gear (player_id, gear_id, source)
  select id, 'gosko-ghost', 'starter' from public.players on conflict do nothing;

-- ---------- loadout ----------
-- p_config: { deck?, grip?, wheels?, trucks? (kľúče z assets/board.js), stickers?: [gear_id, …] najviac 8 }
create or replace function public.set_loadout(p_config jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.game_require_player(false);
  k text;
  stickers jsonb := coalesce(p_config -> 'stickers', '[]'::jsonb);
  out jsonb := '{}'::jsonb;
begin
  if p_config is null or jsonb_typeof(p_config) <> 'object' or jsonb_typeof(stickers) <> 'array'
     or jsonb_array_length(stickers) > 8
     or exists (select 1 from jsonb_object_keys(p_config) x where x not in ('deck', 'grip', 'wheels', 'trucks', 'stickers')) then
    raise exception using message = 'BAD_INPUT';
  end if;
  foreach k in array array['deck', 'grip', 'wheels', 'trucks'] loop
    if p_config ? k then
      if jsonb_typeof(p_config -> k) <> 'string' or (p_config ->> k) !~ '^[a-z]{1,20}$' then
        raise exception using message = 'BAD_INPUT';
      end if;
      out := out || jsonb_build_object(k, p_config ->> k);
    end if;
  end loop;
  if exists (select 1 from jsonb_array_elements(stickers) e where jsonb_typeof(e) <> 'string')
     or (select count(distinct e) from jsonb_array_elements_text(stickers) e) <> jsonb_array_length(stickers) then
    raise exception using message = 'BAD_INPUT';
  end if;
  if exists (select 1 from jsonb_array_elements_text(stickers) e
             where not exists (select 1 from public.unlocked_gear u where u.player_id = uid and u.gear_id = e)) then
    raise exception using message = 'GEAR_LOCKED';
  end if;
  out := out || jsonb_build_object('stickers', stickers);
  update public.players set board_config = out where id = uid;
  return out;
end $$;

revoke update (board_config) on public.players from authenticated;

-- ---------- súhlas s NFT ----------
alter table public.players add column if not exists nft_consent_at timestamptz;

create or replace function public.set_nft_consent(p_on boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.game_require_player(false);
  adult boolean;
begin
  if coalesce(p_on, false) then
    select rp.birth_date <= current_date - make_interval(years => (public.game_cfg() ->> 'guardian_age')::int) into adult
    from public.players p join public.rider_private rp on rp.rider_id = p.rider_id where p.id = uid;
    if not coalesce(adult, false) then
      raise exception using message = 'NEED_GUARDIAN';
    end if;
    update public.players set nft_consent_at = coalesce(nft_consent_at, now()) where id = uid;
  else
    update public.players set nft_consent_at = null where id = uid;
  end if;
  return jsonb_build_object('nft_consent', coalesce(p_on, false));
end $$;

create or replace function public.game_me() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', p.id, 'username', p.username, 'city', p.city, 'stance', p.stance, 'board_config', p.board_config,
    'can_write', public.game_can_write(p.id), 'needs_guardian', not public.game_can_write(p.id),
    'can_publish', public.game_can_publish(p.id), 'media_consent', p.media_consent_at is not null,
    'nft_consent', p.nft_consent_at is not null)
  from public.players p where p.id = auth.uid()
$$;

-- ---------- loot drop: typ NFT, evidencia mintu ----------
alter table public.loot_drops add column if not exists nft_type smallint;
alter table public.loot_drops drop constraint if exists loot_drops_nft_type_check;
alter table public.loot_drops add constraint loot_drops_nft_type_check check (nft_type is null or nft_type between 1 and 255);

create table if not exists public.loot_nft (
  claim_id uuid primary key references public.loot_claims(id) on delete cascade,
  chain_id int not null,
  contract text not null check (contract ~ '^0x[0-9a-f]{40}$'),
  token_type smallint not null check (token_type between 1 and 255),
  status text not null check (status in ('pending', 'minted', 'failed', 'revoked')),
  tx_hash text check (tx_hash ~ '^0x[0-9a-f]{64}$'),
  error text check (char_length(error) <= 500),
  attempts int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.loot_nft enable row level security;
revoke all on public.loot_nft from anon, authenticated;
grant select, insert, update, delete on public.loot_nft to service_role;

-- my_loot z 012 + claim_id, gear_id, typ a stav NFT
drop function if exists public.my_loot();
create function public.my_loot()
returns table (claim_id uuid, drop_id uuid, spot_id uuid, title text, partner text, tier smallint, label text, reward text,
               reward_code text, gear_id text, rank int, claimed_at timestamptz, nft_type smallint, nft_status text)
language sql stable security definer set search_path = '' as $$
  select c.id, c.drop_id, d.spot_id, d.title, d.partner, c.tier, t.label, t.reward, s.reward_code, t.gear_id, c.rank, c.claimed_at,
         d.nft_type, n.status
  from public.loot_claims c
  join public.loot_drops d on d.id = c.drop_id
  left join public.loot_tiers t on t.drop_id = c.drop_id and t.tier = c.tier
  left join public.loot_drop_secrets s on s.drop_id = c.drop_id and s.tier = c.tier
  left join public.loot_nft n on n.claim_id = c.id
  where c.player_id = public.game_require_player(false)
  order by c.claimed_at desc
$$;

-- ---------- admin: založenie, zoznam a vypnutie dropu (iba service_role, volá /api/admin/loot) ----------
-- p_tiers: [{label, up_to, reward?, code, gear_id?}, …] 1 až 10 tierov, up_to rastie (1 až 100000).
create or replace function public.admin_create_loot_drop(p_actor uuid, p_spot uuid, p_title text, p_tiers jsonb,
  p_description text default null, p_partner text default null, p_starts timestamptz default null, p_ends timestamptz default null,
  p_nft_type int default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  did uuid;
  t jsonb;
  i int := 0;
  prev int := 0;
  up int;
  starts timestamptz := coalesce(p_starts, now());
begin
  if not exists (select 1 from public.spots where id = p_spot and approved) then
    raise exception using message = 'SPOT_NOT_FOUND';
  end if;
  if char_length(btrim(coalesce(p_title, ''))) not between 1 and 80
     or char_length(coalesce(p_description, '')) > 400 or char_length(coalesce(p_partner, '')) > 80
     or (p_ends is not null and p_ends <= greatest(starts, now()))
     or (p_nft_type is not null and p_nft_type not between 1 and 255)
     or p_tiers is null or jsonb_typeof(p_tiers) <> 'array' or jsonb_array_length(p_tiers) not between 1 and 10 then
    raise exception using message = 'BAD_INPUT';
  end if;
  insert into public.loot_drops (spot_id, title, description, partner, starts_at, ends_at, nft_type)
  values (p_spot, btrim(p_title), nullif(btrim(p_description), ''), nullif(btrim(p_partner), ''), starts, p_ends, p_nft_type)
  returning id into did;
  for t in select value from jsonb_array_elements(p_tiers) loop
    i := i + 1;
    up := case when jsonb_typeof(t -> 'up_to') = 'number' and (t ->> 'up_to') ~ '^\d{1,6}$' then (t ->> 'up_to')::int end;
    if jsonb_typeof(t) <> 'object' or up is null or up <= prev or up > 100000
       or char_length(btrim(coalesce(t ->> 'label', ''))) not between 1 and 40
       or char_length(btrim(coalesce(t ->> 'code', ''))) not between 1 and 100
       or char_length(coalesce(t ->> 'reward', '')) > 200
       or (t ->> 'gear_id' is not null and not exists (select 1 from public.gear g where g.id = t ->> 'gear_id')) then
      raise exception using message = 'BAD_INPUT';   -- celá transakcia (drop aj tiery) sa vráti
    end if;
    insert into public.loot_tiers (drop_id, tier, label, up_to, reward, gear_id)
    values (did, i, btrim(t ->> 'label'), up, nullif(btrim(t ->> 'reward'), ''), t ->> 'gear_id');
    insert into public.loot_drop_secrets (drop_id, tier, reward_code) values (did, i, btrim(t ->> 'code'));
    prev := up;
  end loop;
  insert into public.audit_log (actor, action, entity, entity_id, data)
  values (p_actor, 'loot.create', 'loot_drop', did::text, jsonb_build_object('spot_id', p_spot, 'tiers', i, 'capacity', prev, 'nft_type', p_nft_type));
  return jsonb_build_object('id', did, 'capacity', prev);
end $$;

create or replace function public.admin_set_loot_drop_active(p_actor uuid, p_drop uuid, p_active boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  update public.loot_drops set active = coalesce(p_active, false) where id = p_drop;
  if not found then
    raise exception using message = 'DROP_INACTIVE';
  end if;
  insert into public.audit_log (actor, action, entity, entity_id, data)
  values (p_actor, case when p_active then 'loot.activate' else 'loot.deactivate' end, 'loot_drop', p_drop::text, null);
  return jsonb_build_object('id', p_drop, 'active', coalesce(p_active, false));
end $$;

-- Zoznam pre admina: dropy (aj vypnuté a skončené) s tiermi a počtom claimov, bez kódov a bez hráčov.
create or replace function public.admin_loot_drops() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(x order by x ->> 'created_at' desc), '[]'::jsonb) from (
    select jsonb_build_object('id', d.id, 'spot_id', d.spot_id, 'spot_name', s.name, 'title', d.title, 'partner', d.partner,
      'starts_at', d.starts_at, 'ends_at', d.ends_at, 'active', d.active, 'nft_type', d.nft_type, 'created_at', d.created_at,
      'tiers', coalesce((select jsonb_agg(jsonb_build_object('tier', t.tier, 'label', t.label, 'up_to', t.up_to, 'reward', t.reward, 'gear_id', t.gear_id) order by t.up_to)
                         from public.loot_tiers t where t.drop_id = d.id), '[]'::jsonb),
      'claimed', (select count(*) from public.loot_claims c where c.drop_id = d.id)) as x
    from public.loot_drops d join public.spots s on s.id = d.spot_id
    order by d.created_at desc limit 200) q
$$;

-- ---------- práva na funkcie ----------
revoke all on function public.grant_starter_gear(), public.set_loadout(jsonb), public.set_nft_consent(boolean), public.game_me(),
  public.my_loot(), public.admin_create_loot_drop(uuid, uuid, text, jsonb, text, text, timestamptz, timestamptz, int),
  public.admin_set_loot_drop_active(uuid, uuid, boolean), public.admin_loot_drops()
  from public, anon, authenticated;
grant execute on function public.set_loadout(jsonb), public.set_nft_consent(boolean), public.game_me(), public.my_loot() to authenticated;
grant execute on function public.admin_create_loot_drop(uuid, uuid, text, jsonb, text, text, timestamptz, timestamptz, int),
  public.admin_set_loot_drop_active(uuid, uuid, boolean), public.admin_loot_drops() to service_role;

-- PostgREST (Supabase API) načíta zmenenú schému
notify pgrst, 'reload schema';

commit;

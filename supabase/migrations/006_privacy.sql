-- =====================================================================
-- 006_privacy: opravy z bezpečnostného auditu (Task 16). Opakovateľné.
-- Poradie: supabase-setup.sql -> 001 -> 002 -> 003 -> 004 -> 005 -> 006.
--
--  M1  kontakt na rodiča patrí k registrácii (registrations.guardian_*), nie k jazdcovi:
--      cudzia registrácia s rovnakým e-mailom a dátumom narodenia ho už neprepíše
--  L6  odkaz pre rodiča platí do guardian_token_expires_at
--  M2  nft_tokens.rider_ref: náhodný riderRef pre každý token zvlášť (passy jazdca sa
--      na chaine nedajú pospájať); results_public pri zástupnom mene nevracia
--      rider_id ani token
--  L1  riders_public bez mesta
--  H1  registrations_admin: registrácie eventu s verejným menom pre admin (pavúk, ocenenia,
--      výsledky); U16 bez súhlasu rodiča má public_name NULL
--  L8  nové funkcie v public už nedostanú EXECUTE pre PUBLIC, anon ani authenticated
-- =====================================================================
begin;

-- ---------- M1 + L6: rodič a platnosť odkazu pri registrácii ----------
alter table public.registrations add column if not exists guardian_name text
  check (char_length(guardian_name) <= 120);
alter table public.registrations add column if not exists guardian_email text
  check (char_length(guardian_email) <= 254 and guardian_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$');
alter table public.registrations add column if not exists guardian_token_expires_at timestamptz;

-- staré U16 registrácie: kontakt z rider_private, platnosť 7 dní po evente (bez dátumu 60 dní)
update public.registrations g
   set guardian_name = p.guardian_name, guardian_email = p.guardian_email
  from public.rider_private p
 where p.rider_id = g.rider_id and g.category = 'u16' and g.guardian_email is null and p.guardian_email is not null;
update public.registrations g
   set guardian_token_expires_at = coalesce((e.date + 7)::timestamptz, now() + interval '60 days')
  from public.events e
 where e.id = g.event_id and g.guardian_token is not null and g.guardian_token_expires_at is null;

-- Neplatný, použitý alebo prepadnutý token = PT404 (HTTP 404). Inak ako 004.
create or replace function public.confirm_guardian(p_token uuid) returns public.registrations
language plpgsql security invoker set search_path = '' as $$
declare
  r public.registrations;
begin
  update public.registrations
     set status = case when status = 'pending_guardian' then 'confirmed' else status end,
         guardian_confirmed_at = now(),
         guardian_token = null
   where guardian_token = p_token
     and (guardian_token_expires_at is null or guardian_token_expires_at > now())
     and (status = 'pending_guardian' or (status = 'checked_in' and guardian_confirmed_at is null))
  returning * into r;
  if not found then
    raise exception 'invalid_token' using errcode = 'PT404';  -- PostgREST: HTTP 404
  end if;
  return r;
end $$;
revoke all on function public.confirm_guardian(uuid) from public, anon, authenticated;
grant execute on function public.confirm_guardian(uuid) to service_role;

-- ---------- M2: riderRef pre každý token ----------
alter table public.nft_tokens add column if not exists rider_ref text check (rider_ref ~ '^0x[0-9a-f]{64}$');
create unique index if not exists nft_tokens_rider_ref_key on public.nft_tokens (rider_ref) where rider_ref is not null;

-- ---------- L1: riders_public bez mesta (stĺpec sa z pohľadu nedá odobrať cez replace) ----------
drop view if exists public.riders_public;
create view public.riders_public with (security_barrier = true) as
  select r.id, public.public_name(r.display_name, r.nickname, r.public_name_mode) as public_name,
         r.country, r.is_founder
  from public.riders r
  where exists (
    select 1 from public.registrations g
    where g.rider_id = r.id
      and g.status in ('confirmed', 'checked_in', 'no_show')
      and (g.category <> 'u16' or g.guardian_confirmed_at is not null)
  );

-- ---------- M2: results_public pri zástupnom mene bez rider_id a tokenu ----------
create or replace view public.results_public with (security_barrier = true) as
  select er.event_id, er.category, er.place, er.points,
         case when v.visible then rd.id end as rider_id,
         case
           when er.registration_id is null then er.rider_name
           when v.visible then public.public_name(rd.display_name, rd.nickname, rd.public_name_mode)
           else 'GOSko jazdec'
         end as public_name,
         case when v.visible then n.chain_id end as chain_id,
         case when v.visible then n.token_id end as token_id,
         case when v.visible then n.status end as nft_status
  from public.event_results er
  left join public.registrations g on g.id = er.registration_id
  left join public.riders rd on rd.id = g.rider_id
  left join public.nft_tokens n on n.registration_id = er.registration_id
  cross join lateral (select coalesce(g.status in ('confirmed', 'checked_in', 'no_show')
                                      and (g.category <> 'u16' or g.guardian_confirmed_at is not null), false) as visible) v;

-- ---------- H1: registrácie eventu s verejným menom (iba admin) ----------
create or replace view public.registrations_admin with (security_barrier = true) as
  select g.id, g.event_id, g.category, g.status, g.checked_in_at,
         case when g.category = 'u16' and g.guardian_confirmed_at is null then null
              else public.public_name(r.display_name, r.nickname, r.public_name_mode) end as public_name
  from public.registrations g
  join public.riders r on r.id = g.rider_id
  where public.is_admin();

revoke all on public.riders_public, public.results_public, public.registrations_admin from anon, authenticated;
grant select on public.riders_public, public.results_public to anon, authenticated;
grant select on public.registrations_admin to authenticated;
grant select on public.riders_public, public.results_public, public.registrations_admin to service_role;

-- ---------- L8: predvolené práva na funkcie ----------
-- Globálny default (EXECUTE pre PUBLIC) sa per-schema odobrať nedá, preto oba riadky.
alter default privileges revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

-- PostgREST (Supabase API) načíta zmenenú schému
notify pgrst, 'reload schema';

commit;

-- =====================================================================
-- 004_guardian_after_checkin: rodič môže potvrdiť aj po check-ine U16 jazdca.
-- Poradie: supabase-setup.sql -> 001 -> 002 -> 003 -> 004. Opakovateľné.
--   pending_guardian            -> confirmed (ako doteraz)
--   checked_in bez potvrdenia   -> ostáva checked_in, doplní sa guardian_confirmed_at
-- V oboch prípadoch sa token vynuluje. Neplatný alebo použitý token = PT404 (HTTP 404).
-- riders_public a results_public jazdca ukážu, keď má guardian_confirmed_at (pravidlo z 002).
-- =====================================================================
begin;

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
     and (status = 'pending_guardian' or (status = 'checked_in' and guardian_confirmed_at is null))
  returning * into r;
  if not found then
    raise exception 'invalid_token' using errcode = 'PT404';  -- PostgREST: HTTP 404
  end if;
  return r;
end $$;
revoke all on function public.confirm_guardian(uuid) from public, anon, authenticated;
grant execute on function public.confirm_guardian(uuid) to service_role;

-- PostgREST (Supabase API) načíta zmenenú schému
notify pgrst, 'reload schema';

commit;

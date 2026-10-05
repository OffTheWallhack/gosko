-- =====================================================================
-- 013_game_consent: súhlas rodiča s hrou je oddelený od súhlasu s eventom.
-- Poradie: … -> 010 -> 011 -> 012 -> 013. Opakovateľné.
--
-- Rozhodnutie 5. 10. 2026: súhlas rodiča s registráciou na GOSko event NEodomyká
-- hru s polohou (check-iny na spotoch, klipy s fotkami a videami, crew). Rodič o tom
-- rozhoduje zvlášť cez player_guardian (e-mail z api/game/link-rider.js, potvrdenie
-- v /api/consent -> confirm_player_guardian). Zapisovať môže iba hráč, ktorý má dnes 16+,
-- alebo má players.guardian_confirmed_at. Mení sa iba pohľad game_writers z 010;
-- verejné pohľady (players_public, clips_public, …) ho používajú, takže sa zmena
-- prejaví všade naraz.
-- =====================================================================
begin;

create or replace view public.game_writers with (security_barrier = true) as
  select p.id as player_id
  from public.players p
  join public.rider_private rp on rp.rider_id = p.rider_id
  where rp.birth_date <= current_date - make_interval(years => (public.game_cfg() ->> 'guardian_age')::int)
     or p.guardian_confirmed_at is not null;

revoke all on public.game_writers from anon, authenticated;

-- PostgREST (Supabase API) načíta zmenenú schému
notify pgrst, 'reload schema';

commit;

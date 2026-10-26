-- =====================================================================
-- 017_game_crews_page: stránka crew v hre /hra/crew (plán Ghoskate, Task 5). Opakovateľné.
-- Poradie: … -> 016 -> 017.
--
-- Pravidlá crew (max 10, jedna crew na hráča, pozývací kód, odchod, vyhodenie, Turf Wars skóre
-- a rebríček za 30 dní) sú v 011 a ostávajú. Pribúda len to, čo stránka potrebuje:
--   my_crew()              vlastná crew jedným volaním (členovia s player_id pre vyhodenie, kód, body, poradie)
--   crew_preview(p_code)   náhľad pozvánky z odkazu /hra/crew/pridat/<KÓD> (iba prihlásený)
--   rotate_invite_code()   owner vymení kód, starý odkaz prestane platiť
-- Všetko SECURITY DEFINER s auth.uid(); tabuľky crews a crew_members klient priamo nečíta.
-- =====================================================================
begin;

create or replace function public.my_crew() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', c.id, 'name', c.name, 'tag', c.tag, 'color', c.color, 'role', me.role, 'invite_code', c.invite_code,
    'max', (public.game_cfg() ->> 'crew_max')::int,
    'points', coalesce(lb.points, 0), 'rank', lb.rank, 'spots_controlled', coalesce(lb.spots_controlled, 0),
    'members', (select jsonb_agg(jsonb_build_object('player_id', m.player_id, 'username', p.username, 'role', m.role, 'joined_at', m.joined_at)
                                 order by (m.role = 'owner') desc, m.joined_at, m.player_id)
                from public.crew_members m join public.players p on p.id = m.player_id
                where m.crew_id = c.id))
  from public.crew_members me
  join public.crews c on c.id = me.crew_id
  left join public.crew_leaderboard lb on lb.crew_id = c.id
  where me.player_id = public.game_require_player(false)
$$;

create or replace function public.crew_preview(p_code text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := public.game_require_player(false);
  c public.crews;
  n int;
  max_n int := (public.game_cfg() ->> 'crew_max')::int;
begin
  select * into c from public.crews where invite_code = upper(btrim(coalesce(p_code, '')));
  if not found then
    raise exception using message = 'BAD_CODE';
  end if;
  select count(*) into n from public.crew_members where crew_id = c.id;
  return jsonb_build_object('id', c.id, 'name', c.name, 'tag', c.tag, 'color', c.color, 'members', n, 'max', max_n, 'full', n >= max_n);
end $$;

create or replace function public.rotate_invite_code() returns text
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.game_require_player(false);
  cid uuid;
  code text;
begin
  select crew_id into cid from public.crew_members where player_id = uid and role = 'owner';
  if not found then
    raise exception using message = 'FORBIDDEN';
  end if;
  update public.crews set invite_code = public.crew_invite_code() where id = cid returning invite_code into code;
  return code;
end $$;

revoke all on function public.my_crew(), public.crew_preview(text), public.rotate_invite_code() from public, anon, authenticated;
grant execute on function public.my_crew(), public.crew_preview(text), public.rotate_invite_code() to authenticated;

-- PostgREST (Supabase API) načíta zmenenú schému
notify pgrst, 'reload schema';

commit;

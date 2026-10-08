-- =====================================================================
-- 019_game_profile: úprava herného profilu na /hra/profil (prezývka, mesto, stance, avatar a farba).
-- Opakovateľné. Poradie: … -> 018 -> 019.
--
-- Avatar je jeden z pevných motívov hry (nie nahraná fotka), farba z palety: nezbierame nové osobné
-- údaje. Verejne (players_public, clips_public) je prezývka, stance, avatar a farba; mesto nie.
-- update_profile overí vstup a vráti kód (USERNAME_TAKEN, BAD_INPUT); priamy update stĺpcov
-- z 010 ostáva, CHECK pravidlá platia aj tam.
-- =====================================================================
begin;

alter table public.players add column if not exists avatar text not null default 'ghost';
alter table public.players add column if not exists color text not null default '#FF3DA5';
alter table public.players drop constraint if exists players_avatar_check;
alter table public.players add constraint players_avatar_check check (avatar in ('ghost', 'skull', 'wheel', 'spray', 'crown', 'bolt'));
alter table public.players drop constraint if exists players_color_check;
alter table public.players add constraint players_color_check check (color ~ '^#[0-9A-Fa-f]{6}$');
grant update (avatar, color) on public.players to authenticated;

create or replace function public.update_profile(p_username text, p_city text, p_stance text, p_avatar text, p_color text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.game_require_player(false);
  nick text := btrim(coalesce(p_username, ''));
  town text := nullif(regexp_replace(btrim(coalesce(p_city, '')), '\s+', ' ', 'g'), '');
begin
  if nick !~ '^[A-Za-z0-9_.]{3,20}$' or char_length(coalesce(town, '')) > 60
     or (p_stance is not null and p_stance not in ('regular', 'goofy'))
     or coalesce(p_avatar, '') not in ('ghost', 'skull', 'wheel', 'spray', 'crown', 'bolt')
     or coalesce(p_color, '') !~ '^#[0-9A-Fa-f]{6}$' then
    raise exception using message = 'BAD_INPUT';
  end if;
  if exists (select 1 from public.players where lower(username) = lower(nick) and id <> uid) then
    raise exception using message = 'USERNAME_TAKEN';
  end if;
  begin
    update public.players set username = nick, city = town, stance = p_stance, avatar = p_avatar, color = p_color where id = uid;
  exception when unique_violation then
    raise exception using message = 'USERNAME_TAKEN';
  end;
  return jsonb_build_object('username', nick, 'city', town, 'stance', p_stance, 'avatar', p_avatar, 'color', p_color);
end $$;

create or replace function public.game_me() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', p.id, 'username', p.username, 'city', p.city, 'stance', p.stance, 'board_config', p.board_config,
    'avatar', p.avatar, 'color', p.color,
    'can_write', public.game_can_write(p.id), 'needs_guardian', not public.game_can_write(p.id),
    'can_publish', public.game_can_publish(p.id), 'media_consent', p.media_consent_at is not null,
    'nft_consent', p.nft_consent_at is not null)
  from public.players p where p.id = auth.uid()
$$;

-- verejné pohľady: + avatar a farba (nové stĺpce na konci)
create or replace view public.players_public with (security_barrier = true) as
  select p.id, p.username, p.stance, p.avatar, p.color
  from public.players p
  join public.game_writers w on w.player_id = p.id;

create or replace view public.clips_public with (security_barrier = true) as
  select c.id, c.spot_id, s.name as spot_name, p.username, c.crew_id, cr.tag as crew_tag, cr.color as crew_color,
         c.media_kind, c.media_path, case when c.media_kind = 'embed' then c.media_url end as embed_url,
         c.trick, c.duration_s, c.verified,
         (select count(*) from public.clip_likes l where l.clip_id = c.id)::int as likes, c.created_at,
         p.avatar, p.color
  from public.clips c
  join public.players p on p.id = c.player_id
  join public.game_publishers g on g.player_id = c.player_id
  join public.spots s on s.id = c.spot_id and s.approved
  left join public.crews cr on cr.id = c.crew_id
  where not c.hidden;

revoke all on public.players_public, public.clips_public from anon, authenticated;
grant select on public.players_public, public.clips_public to anon, authenticated, service_role;

revoke all on function public.update_profile(text, text, text, text, text), public.game_me() from public, anon, authenticated;
grant execute on function public.update_profile(text, text, text, text, text), public.game_me() to authenticated;

-- PostgREST (Supabase API) načíta zmenenú schému
notify pgrst, 'reload schema';

commit;

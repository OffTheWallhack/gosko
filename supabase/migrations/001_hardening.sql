-- =====================================================================
-- 001_hardening: bezpečnostná oprava grantov (Task 1)
-- Poradie: supabase-setup.sql -> 001 -> 002 -> 003. Opakovateľné, ale po
-- opätovnom spustení 001 treba znova spustiť aj 002 a 003 (001 odoberá všetko).
--
-- Problém: Supabase dáva rolám anon a authenticated predvolene ALL na každú
-- tabuľku a pohľad v public. Pohľady *_public bežia s právami vlastníka, takže
-- obchádzajú RLS: anon cez ne vedel meniť a mazať schválené riadky.
-- =====================================================================
begin;

-- ---------- 1) Nové objekty v public už nedostanú prístup automaticky ----------
-- Platí pre objekty, ktoré odteraz vytvorí rola spúšťajúca túto migráciu (postgres).
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;

-- ---------- 2) Odobrať všetko (aj stĺpcové granty) ----------
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

-- ---------- 3) Verejné pohľady: iba SELECT ----------
-- Zostávajú pohľady s právami vlastníka (security_invoker by vyžadoval SELECT
-- na základné tabuľky so stĺpcami contact/user_id). security_barrier zabráni,
-- aby filter z požiadavky videl neschválené riadky.
alter view public.community_events_public set (security_barrier = true);
alter view public.spots_public set (security_barrier = true);
alter view public.event_photos_public set (security_barrier = true);
alter view public.parks_ranked set (security_barrier = true);
grant select on public.community_events_public, public.spots_public, public.event_photos_public, public.parks_ranked
  to anon, authenticated;

-- Výsledky, ocenenia a pavúky sú verejné na čítanie; zapisuje admin (RLS is_admin()).
grant select on public.event_results, public.event_awards, public.brackets to anon, authenticated;
grant insert, update, delete on public.event_results, public.event_awards, public.brackets to authenticated;

-- ---------- 4) Formuláre: INSERT iba vybraných stĺpcov ----------
-- Bez id, created_at, approved (a pri registráciách bez checked_in_at).
grant insert (name, date, city, place, country, kind, link, organizer, contact)
  on public.community_events to anon, authenticated;
grant insert (email, source, consent) on public.newsletter_subscribers to anon, authenticated;
grant insert (org_type, org_name, city, what, when_text, contact, message) on public.bookings to anon, authenticated;
grant insert (product, size, contact) on public.shop_interest to anon, authenticated;
grant insert (what, target, contact, guardian) on public.privacy_requests to anon, authenticated;

-- Pôvodný registračný formulár, kým nebeží 002 (potom sa tabuľka premenuje na
-- registrations_legacy a anon stratí INSERT úplne). token ostáva, lebo ho
-- generuje klient pre QR pass; checked_in_at, id a created_at nie.
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'registrations' and column_name = 'parent_consent') then
    grant insert (event_id, name, instagram, city, category, contact, parent_consent, token)
      on public.registrations to anon, authenticated;
    grant select, update (checked_in_at) on public.registrations to authenticated;
  end if;
end $$;

-- ---------- 5) Prihlásení používatelia: parky, hlasy, spoty, fotky ----------
-- user_id dopĺňa default auth.uid(); approved nastavuje iba admin.
grant insert (name, author, location, place, layout, thumb) on public.parks to authenticated;
grant insert (park_id) on public.votes to authenticated;
grant insert (name, city, kind, description, lat, lng, photo_url) on public.spots to authenticated;
grant insert (event_id, author, caption, photo_url, photo_path, clip_url) on public.event_photos to authenticated;

-- ---------- 6) Admin: čítanie, schvaľovanie, mazanie (riadky obmedzuje RLS) ----------
grant select on public.parks, public.votes, public.community_events, public.spots, public.event_photos,
  public.newsletter_subscribers, public.bookings, public.shop_interest, public.privacy_requests
  to authenticated;
grant update (approved) on public.parks, public.community_events, public.spots, public.event_photos to authenticated;
grant delete on public.parks, public.votes, public.community_events, public.spots, public.event_photos to authenticated;

grant execute on function public.is_admin(), public.park_is_approved(uuid) to anon, authenticated;

-- ---------- 7) URL iba http(s) alebo NULL ----------
-- Staré riadky: odkaz bez schémy dostane https://, iná schéma (javascript:, data:) sa zmaže.
update public.community_events set link = 'https://' || link
  where link is not null and link !~* '^[a-z][a-z0-9+.-]*:' and char_length(link) <= 292;
update public.community_events set link = null where link is not null and link !~* '^https?://';
update public.spots set photo_url = null where photo_url is not null and photo_url !~* '^https?://';

alter table public.community_events drop constraint if exists community_events_link_url;
alter table public.community_events add constraint community_events_link_url
  check (link is null or link ~* '^https?://');
alter table public.spots drop constraint if exists spots_photo_url_url;
alter table public.spots add constraint spots_photo_url_url
  check (photo_url is null or photo_url ~* '^https?://');
-- event_photos už má prísnejšie kontroly zo setupu; pomenované kontroly pre audit.
alter table public.event_photos drop constraint if exists event_photos_photo_url_url;
alter table public.event_photos add constraint event_photos_photo_url_url
  check (photo_url is null or photo_url ~* '^https?://');
alter table public.event_photos drop constraint if exists event_photos_clip_url_url;
alter table public.event_photos add constraint event_photos_clip_url_url
  check (clip_url is null or clip_url ~* '^https?://');

-- ---------- 8) Storage: admin vidí súbory, aby remove() vedel zmazať ----------
-- remove() robí DELETE s podmienkou na name; bez SELECT politiky nevidí žiadny riadok.
drop policy if exists "Admin vidí súbory" on storage.objects;
create policy "Admin vidí súbory" on storage.objects for select to authenticated
  using (bucket_id in ('photos', 'spots') and public.is_admin());

-- PostgREST (Supabase API) načíta zmenenú schému
notify pgrst, 'reload schema';

commit;

-- =====================================================================
-- 014_main_sync: databázové zmeny z Robovej vetvy main (5. 10. 2026) nad 001–013.
-- Poradie: supabase-setup.sql -> 001 … 006 -> 010 … 013 -> 014. Opakovateľné.
--
-- Robo ich pridal do supabase-setup.sql (kalendár: end_date, prize, fotka eventu;
-- novinky posts; pozvánky adminov admin_invites). Databáza, na ktorej už bežia
-- 001–013, ich nemá, a 001 by pri čerstvej inštalácii aj tak odobrala Robove granty.
-- Táto migrácia ich doplní a utiahne rovnako ako 001/006:
--   * RLS na každej tabuľke, anon iba SELECT na verejné stĺpce a INSERT stĺpcov formulára,
--   * zápis noviniek a fotiek eventov len admin (RLS is_admin()), bez id/created_at/user_id,
--   * URL iba http(s) (alebo #/… pri odkaze novinky na stránku webu),
--   * admin_invites len pre service_role, funkcia triggera bez EXECUTE pre klientov,
--   * admin z pozvánky až po POTVRDENÍ e-mailu (Robova verzia dávala admina už pri
--     vytvorení účtu, teda aj neovereným e-mailom, ak Supabase nevyžaduje potvrdenie).
-- =====================================================================
begin;

-- ---------- 1) Kalendár: posledný deň, prize pool, fotka eventu ----------
alter table public.community_events
  add column if not exists end_date date,
  add column if not exists prize text,
  add column if not exists image_url text;

alter table public.community_events drop constraint if exists community_events_end_after_start;
alter table public.community_events add constraint community_events_end_after_start
  check (end_date is null or end_date >= date);
alter table public.community_events drop constraint if exists community_events_prize_len;
alter table public.community_events add constraint community_events_prize_len
  check (prize is null or char_length(prize) <= 60);
alter table public.community_events drop constraint if exists community_events_image_url_url;
alter table public.community_events add constraint community_events_image_url_url
  check (image_url is null or (char_length(image_url) <= 500 and image_url ~* '^https?://'));

-- nové stĺpce idú na koniec, preto stačí create or replace (bez contact a approved)
create or replace view public.community_events_public with (security_barrier = true) as
  select id, created_at, name, date, city, place, country, kind, link, organizer, end_date, prize, image_url
  from public.community_events where approved;
revoke all on public.community_events_public from anon, authenticated;
grant select on public.community_events_public to anon, authenticated;

-- formulár „Pridať event“ posiela aj end_date a prize; fotku (image_url) mení len admin
grant insert (end_date, prize) on public.community_events to anon, authenticated;
grant update (image_url) on public.community_events to authenticated;

-- ---------- 2) Novinky a články ----------
create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid default auth.uid(),
  title text not null check (char_length(title) between 1 and 120),
  summary text check (char_length(summary) <= 300),
  body text check (char_length(body) <= 20000),
  image_url text check (char_length(image_url) <= 500),
  image_path text check (char_length(image_path) <= 300),
  link text check (char_length(link) <= 300),
  link_label text check (char_length(link_label) <= 40),
  author text check (char_length(author) <= 60),
  pinned boolean not null default false,
  published boolean not null default true
);
alter table public.posts drop constraint if exists posts_image_url_url;
alter table public.posts add constraint posts_image_url_url
  check (image_url is null or image_url ~* '^https?://');
alter table public.posts drop constraint if exists posts_link_url;
alter table public.posts add constraint posts_link_url
  check (link is null or link ~* '^(https?://|#/)');

alter table public.posts enable row level security;
drop policy if exists "Novinky vidí každý" on public.posts;
create policy "Novinky vidí každý" on public.posts for select using (published or public.is_admin());
drop policy if exists "Admin spravuje novinky" on public.posts;
create policy "Admin spravuje novinky" on public.posts for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- anon a ne-admin vidia len zverejnené novinky (RLS) a bez user_id a image_path;
-- admin číta všetko, zapisuje len obsahové stĺpce (id, created_at a user_id dopĺňa databáza)
revoke all on public.posts from anon, authenticated;
grant select (id, created_at, title, summary, body, image_url, link, link_label, author, pinned, published)
  on public.posts to anon;
grant select on public.posts to authenticated;
grant insert (title, summary, body, image_url, image_path, link, link_label, author, pinned, published),
      update (title, summary, body, image_url, image_path, link, link_label, author, pinned, published),
      delete
  on public.posts to authenticated;
grant all on public.posts to service_role;

-- ---------- 3) Pozvánky pre adminov ----------
-- Pridanie admina (SQL editor alebo service_role): insert into public.admin_invites (email) values ('meno@example.com');
-- Admin práva dostane účet s týmto e-mailom, keď ho potvrdí (prihlásenie, potvrdzovací odkaz),
-- alebo hneď, ak už potvrdený účet existuje.
create table if not exists public.admin_invites (email text primary key, created_at timestamptz default now());
alter table public.admin_invites enable row level security;
revoke all on public.admin_invites from anon, authenticated;
grant all on public.admin_invites to service_role;

create or replace function public.grant_invited_admin() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.email_confirmed_at is not null
     and exists (select 1 from public.admin_invites i where lower(i.email) = lower(new.email)) then
    insert into public.admins (user_id) values (new.id) on conflict do nothing;
  end if;
  return new;
end $$;

drop trigger if exists on_auth_user_invited_admin on auth.users;
create trigger on_auth_user_invited_admin after insert or update of email_confirmed_at, email on auth.users
  for each row execute function public.grant_invited_admin();

-- pozvánka pre e-mail, ktorý už má potvrdený účet
create or replace function public.admin_invite_existing() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.admins (user_id)
    select u.id from auth.users u
    where lower(u.email) = lower(new.email) and u.email_confirmed_at is not null
  on conflict do nothing;
  return new;
end $$;

drop trigger if exists admin_invites_existing on public.admin_invites;
create trigger admin_invites_existing after insert on public.admin_invites
  for each row execute function public.admin_invite_existing();

revoke all on function public.grant_invited_admin(), public.admin_invite_existing() from public, anon, authenticated;

-- PostgREST (Supabase API) načíta zmenenú schému
notify pgrst, 'reload schema';

commit;

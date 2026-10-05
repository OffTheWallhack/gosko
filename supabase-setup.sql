-- =====================================================================
-- GOSko web: databáza
-- Spusti celý súbor raz v Supabase: SQL Editor -> New query -> vlož -> Run
-- =====================================================================

-- Admini (pridáš sa sám, postup je v README)
create table public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.admins enable row level security;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid())
$$;

-- ---------- Parky a hlasovanie ----------
create table public.parks (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  author text not null check (char_length(author) between 1 and 30),
  location text not null check (location in ('Bratislava', 'Slovensko', 'Česko')),
  place text check (char_length(place) <= 60),
  layout jsonb not null,
  thumb text check (char_length(thumb) < 200000),
  approved boolean not null default false
);
create table public.votes (
  park_id uuid not null references public.parks(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (park_id, user_id)
);
alter table public.parks enable row level security;
alter table public.votes enable row level security;

create or replace function public.park_is_approved(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.parks where id = pid and approved)
$$;

create policy "Prihlásený pošle park" on public.parks for insert to authenticated
  with check (user_id = auth.uid() and approved = false);
create policy "Admin vidí parky" on public.parks for select using (public.is_admin());
create policy "Admin schvaľuje parky" on public.parks for update using (public.is_admin());

create policy "Vidím svoje hlasy" on public.votes for select to authenticated using (user_id = auth.uid());
create policy "Hlas za schválený park" on public.votes for insert to authenticated
  with check (user_id = auth.uid() and public.park_is_approved(park_id));
create policy "Zruším svoj hlas" on public.votes for delete to authenticated using (user_id = auth.uid());

create view public.parks_ranked as
  select p.id, p.created_at, p.name, p.author, p.location, p.place, p.layout, p.thumb,
         count(v.park_id)::int as votes
  from public.parks p left join public.votes v on v.park_id = p.id
  where p.approved
  group by p.id;

-- ---------- Kalendár: eventy od komunity ----------
create table public.community_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null check (char_length(name) between 1 and 80),
  date date not null,
  city text not null check (char_length(city) between 1 and 40),
  place text check (char_length(place) <= 60),
  country text not null check (char_length(country) <= 20),
  kind text check (char_length(kind) <= 30),
  link text check (char_length(link) <= 300),
  organizer text check (char_length(organizer) <= 60),
  contact text check (char_length(contact) <= 120),   -- nezverejňuje sa
  end_date date,                                      -- posledný deň viacdňového eventu
  prize text check (char_length(prize) <= 60),        -- prize pool, napr. '500 € + ceny'
  approved boolean not null default false,
  check (end_date is null or end_date >= date)
);
alter table public.community_events enable row level security;
create policy "Ktokoľvek pošle event" on public.community_events for insert to anon, authenticated with check (approved = false);
create policy "Admin vidí eventy" on public.community_events for select using (public.is_admin());
create policy "Admin schvaľuje eventy" on public.community_events for update using (public.is_admin());

create view public.community_events_public as
  select id, created_at, name, date, city, place, country, kind, link, organizer, end_date, prize
  from public.community_events where approved;

-- ---------- Formuláre ----------
create table public.registrations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  event_id text not null check (char_length(event_id) <= 60),
  name text not null check (char_length(name) between 1 and 40),
  instagram text check (char_length(instagram) <= 40),
  city text check (char_length(city) <= 40),
  category text not null check (category in ('open', 'u16', 'women')),
  contact text not null check (char_length(contact) between 3 and 120),
  parent_consent boolean not null default false,
  token uuid not null unique,                 -- obsah QR kódu na check-in
  checked_in_at timestamptz,                  -- kedy prišiel na event
  check (category <> 'u16' or parent_consent)
);
create table public.newsletter_subscribers (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  email text not null unique check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(email) <= 120),
  source text check (char_length(source) <= 30),
  consent boolean not null check (consent)
);
create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  org_type text check (char_length(org_type) <= 40),
  org_name text not null check (char_length(org_name) between 1 and 80),
  city text not null check (char_length(city) between 1 and 40),
  what text check (char_length(what) <= 40),
  when_text text check (char_length(when_text) <= 60),
  contact text not null check (char_length(contact) between 3 and 120),
  message text check (char_length(message) <= 600)
);
create table public.shop_interest (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  product text not null check (char_length(product) <= 40),
  size text check (char_length(size) <= 10),
  contact text not null check (char_length(contact) between 3 and 120)
);
alter table public.registrations enable row level security;
alter table public.newsletter_subscribers enable row level security;
alter table public.bookings enable row level security;
alter table public.shop_interest enable row level security;
create policy "Ktokoľvek sa registruje" on public.registrations for insert to anon, authenticated with check (true);
create policy "Admin vidí registrácie" on public.registrations for select using (public.is_admin());
create policy "Admin zapisuje príchod" on public.registrations for update using (public.is_admin());
create policy "Ktokoľvek sa prihlási na odber" on public.newsletter_subscribers for insert to anon, authenticated with check (consent);
create policy "Admin vidí odberateľov" on public.newsletter_subscribers for select using (public.is_admin());
create policy "Ktokoľvek napíše" on public.bookings for insert to anon, authenticated with check (true);
create policy "Admin vidí objednávky" on public.bookings for select using (public.is_admin());
create policy "Ktokoľvek prejaví záujem" on public.shop_interest for insert to anon, authenticated with check (true);
create policy "Admin vidí záujem" on public.shop_interest for select using (public.is_admin());

-- ---------- Mapa spotov ----------
create table public.spots (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  city text not null check (char_length(city) between 1 and 40),
  kind text check (char_length(kind) <= 30),
  description text check (char_length(description) <= 400),
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  photo_url text check (char_length(photo_url) <= 500),
  approved boolean not null default false
);
alter table public.spots enable row level security;
create policy "Prihlásený pošle spot" on public.spots for insert to authenticated with check (user_id = auth.uid() and approved = false);
create policy "Admin vidí spoty" on public.spots for select using (public.is_admin());
create policy "Admin schvaľuje spoty" on public.spots for update using (public.is_admin());
create view public.spots_public as
  select id, created_at, name, city, kind, description, lat, lng, photo_url from public.spots where approved;

-- fotky spotov (max 3 MB, len obrázky)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('spots', 'spots', true, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
create policy "Prihlásený nahrá fotku spotu" on storage.objects for insert to authenticated
  with check (bucket_id = 'spots' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------- Výsledky, pavúky, ocenenia ----------
-- Výsledky sú verejné. Zapisovať ich môže len admin. Všetko z data.js ostáva,
-- databáza má prednosť pri tej istej kategórii eventu.
create table public.event_results (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  event_id text not null check (char_length(event_id) <= 60),
  category text not null check (char_length(category) <= 20),
  rider_name text not null check (char_length(rider_name) between 1 and 60),
  place int not null check (place between 1 and 200),
  unique (event_id, category, rider_name)
);
create table public.event_awards (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  event_id text not null check (char_length(event_id) <= 60),
  name text not null check (char_length(name) between 1 and 40),
  rider_name text not null check (char_length(rider_name) between 1 and 60)
);
create table public.brackets (
  event_id text not null check (char_length(event_id) <= 60),
  category text not null check (char_length(category) <= 20),
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (event_id, category)
);
alter table public.event_results enable row level security;
alter table public.event_awards enable row level security;
alter table public.brackets enable row level security;
create policy "Výsledky vidí každý" on public.event_results for select using (true);
create policy "Ocenenia vidí každý" on public.event_awards for select using (true);
create policy "Pavúky vidí každý" on public.brackets for select using (true);
create policy "Admin zapisuje výsledky" on public.event_results for all using (public.is_admin()) with check (public.is_admin());
create policy "Admin zapisuje ocenenia" on public.event_awards for all using (public.is_admin()) with check (public.is_admin());
create policy "Admin zapisuje pavúky" on public.brackets for all using (public.is_admin()) with check (public.is_admin());

-- ---------- Fotky a klipy od komunity ----------
create table public.event_photos (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  event_id text not null check (char_length(event_id) <= 60),
  author text not null check (char_length(author) between 1 and 40),
  caption text check (char_length(caption) <= 120),
  photo_url text check (char_length(photo_url) <= 500 and photo_url ~ '^https://'),
  photo_path text check (char_length(photo_path) <= 300),
  clip_url text check (char_length(clip_url) <= 300 and clip_url ~* '^https?://'),
  approved boolean not null default false,
  check (photo_url is not null or clip_url is not null)
);
alter table public.event_photos enable row level security;
create policy "Prihlásený pošle fotku" on public.event_photos for insert to authenticated with check (user_id = auth.uid() and approved = false);
create policy "Admin vidí fotky" on public.event_photos for select using (public.is_admin());
create policy "Admin schvaľuje fotky" on public.event_photos for update using (public.is_admin());
create policy "Admin maže fotky" on public.event_photos for delete using (public.is_admin());
create view public.event_photos_public as
  select id, created_at, event_id, author, caption, photo_url, clip_url from public.event_photos where approved;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', true, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
create policy "Prihlásený nahrá fotku z eventu" on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Admin maže fotky z eventu" on storage.objects for delete using (bucket_id = 'photos' and public.is_admin());

-- ---------- Žiadosti o súkromie ----------
create table public.privacy_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  what text not null check (char_length(what) <= 80),
  target text not null check (char_length(target) <= 200),
  contact text not null check (char_length(contact) between 3 and 120),
  guardian boolean not null default false
);
alter table public.privacy_requests enable row level security;
create policy "Ktokoľvek pošle žiadosť" on public.privacy_requests for insert to anon, authenticated with check (true);
create policy "Admin vidí žiadosti" on public.privacy_requests for select using (public.is_admin());

-- ---------- Admin môže zamietnuť (zmazať) čakajúce položky ----------
create policy "Admin maže parky" on public.parks for delete using (public.is_admin());
create policy "Admin maže spoty" on public.spots for delete using (public.is_admin());
create policy "Admin maže eventy" on public.community_events for delete using (public.is_admin());

-- ---------- Prístupy ----------
grant select on public.parks_ranked, public.community_events_public, public.spots_public to anon, authenticated;
grant insert on public.community_events, public.registrations, public.bookings, public.shop_interest, public.newsletter_subscribers to anon, authenticated;
grant select, insert, update on public.spots to authenticated;
grant update on public.registrations to authenticated;
grant select on public.event_results, public.event_awards, public.brackets to anon, authenticated;
grant insert, update, delete on public.event_results, public.event_awards, public.brackets to authenticated;
grant select on public.event_photos_public to anon, authenticated;
grant select, insert, update, delete on public.event_photos to authenticated;
grant insert on public.privacy_requests to anon, authenticated;
grant select on public.privacy_requests to authenticated;
grant delete on public.parks, public.spots, public.community_events to authenticated;
grant select on public.newsletter_subscribers to authenticated;
grant select, insert, update on public.parks to authenticated;
grant select, insert, delete on public.votes to authenticated;
grant select, update on public.community_events to authenticated;
grant select on public.registrations, public.bookings, public.shop_interest to authenticated;
grant execute on function public.is_admin(), public.park_is_approved(uuid) to anon, authenticated;

-- ---------- Novinky a články (spravuje admin na webe) ----------
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
alter table public.posts enable row level security;
create policy "Novinky vidí každý" on public.posts for select using (published or public.is_admin());
create policy "Admin spravuje novinky" on public.posts for all to authenticated using (public.is_admin()) with check (public.is_admin());
revoke all on public.posts from anon;
grant select on public.posts to anon;
grant select, insert, update, delete on public.posts to authenticated;

-- ---------- Pozvánky pre adminov (admin práva hneď po prvom prihlásení) ----------
create table if not exists public.admin_invites (email text primary key, created_at timestamptz default now());
alter table public.admin_invites enable row level security;
create or replace function public.grant_invited_admin() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.admin_invites i where lower(i.email) = lower(new.email)) then
    insert into public.admins (user_id) values (new.id) on conflict do nothing;
  end if;
  return new;
end $$;
revoke execute on function public.grant_invited_admin() from public, anon, authenticated;
drop trigger if exists on_auth_user_invited_admin on auth.users;
create trigger on_auth_user_invited_admin after insert on auth.users for each row execute function public.grant_invited_admin();
-- Pridanie nového admina: insert into public.admin_invites (email) values ('meno@example.com');

-- =====================================================================
-- Komunita (2026-10): profily jazdcov, trik týždňa, hodnotenie spotov, XP
-- (na živej databáze už spustené; tu pre prehľad a novú inštaláciu)
-- =====================================================================
create table if not exists public.rider_profiles (
 slug text primary key, user_id uuid references auth.users on delete set null,
 status text not null default 'pending' check (status in ('pending','approved','rejected')),
 photo_url text, photo_path text, instagram text, city text, stance text check (stance in ('regular','goofy')),
 fav_trick text, home_spot text, crew text, bio text check (char_length(bio) <= 400), note text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now());
-- RLS: verejne len schválené; jazdec si nárokuje (pending) a upravuje svoj riadok; trigger rider_profile_guard mu nedovolí zmeniť status; admin všetko.
create table if not exists public.trick_challenges (id uuid primary key default gen_random_uuid(), created_at timestamptz default now(), title text not null, description text, status text not null default 'open' check (status in ('open','voting','closed')), ends_on date);
create table if not exists public.trick_entries (id uuid primary key default gen_random_uuid(), created_at timestamptz default now(), challenge_id uuid references public.trick_challenges on delete cascade, user_id uuid default auth.uid(), name text not null, instagram text, clip_url text, video_url text, video_path text, finalist boolean not null default false);
create table if not exists public.trick_votes (challenge_id uuid references public.trick_challenges on delete cascade, entry_id uuid references public.trick_entries on delete cascade, user_id uuid default auth.uid(), created_at timestamptz default now(), primary key (challenge_id, user_id));
-- view trick_results = finalisti + počet hlasov (anon môže čítať). Bucket 'clips' (video do 30 MB).
create table if not exists public.spot_ratings (spot_key text not null, user_id uuid not null default auth.uid(), stars smallint not null check (stars between 1 and 5), tags text[] not null default '{}', created_at timestamptz default now(), primary key (spot_key, user_id));
-- funkcia my_activity(): počty aktivít prihláseného používateľa pre XP a odznaky.

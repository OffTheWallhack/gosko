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
  approved boolean not null default false
);
alter table public.community_events enable row level security;
create policy "Ktokoľvek pošle event" on public.community_events for insert to anon, authenticated with check (approved = false);
create policy "Admin vidí eventy" on public.community_events for select using (public.is_admin());
create policy "Admin schvaľuje eventy" on public.community_events for update using (public.is_admin());

create view public.community_events_public as
  select id, created_at, name, date, city, place, country, kind, link, organizer
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

-- ---------- Prístupy ----------
grant select on public.parks_ranked, public.community_events_public, public.spots_public to anon, authenticated;
grant insert on public.community_events, public.registrations, public.bookings, public.shop_interest, public.newsletter_subscribers to anon, authenticated;
grant select, insert, update on public.spots to authenticated;
grant update on public.registrations to authenticated;
grant select on public.newsletter_subscribers to authenticated;
grant select, insert, update on public.parks to authenticated;
grant select, insert, delete on public.votes to authenticated;
grant select, update on public.community_events to authenticated;
grant select on public.registrations, public.bookings, public.shop_interest to authenticated;
grant execute on function public.is_admin(), public.park_is_approved(uuid) to anon, authenticated;

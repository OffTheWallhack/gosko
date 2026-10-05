-- =====================================================================
-- Lokálny shim Supabase pre testy (gosko_test). NIKDY nespúšťať v produkcii.
-- Napodobňuje to, čo Supabase vytvorí sám: roly, schému auth a storage
-- a predvolené granty v public (práve tie sú dôvodom migrácie 001).
-- =====================================================================

-- Roly sú spoločné pre celý klaster, preto sa zakladajú idempotentne.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then
    create role authenticator login noinherit;
  end if;
  -- PostgREST robí SET ROLE, preto členstvo s voľbou SET.
  if not exists (
    select 1 from pg_auth_members m
    join pg_roles r on r.oid = m.roleid
    join pg_roles a on a.oid = m.member
    where a.rolname = 'authenticator' and r.rolname = 'anon'
  ) then grant anon to authenticator; end if;
  if not exists (
    select 1 from pg_auth_members m
    join pg_roles r on r.oid = m.roleid
    join pg_roles a on a.oid = m.member
    where a.rolname = 'authenticator' and r.rolname = 'authenticated'
  ) then grant authenticated to authenticator; end if;
  if not exists (
    select 1 from pg_auth_members m
    join pg_roles r on r.oid = m.roleid
    join pg_roles a on a.oid = m.member
    where a.rolname = 'authenticator' and r.rolname = 'service_role'
  ) then grant service_role to authenticator; end if;
end $$;

-- ---------- schéma public: rovnaké predvolené granty ako Supabase ----------
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;

-- ---------- auth ----------
create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role;

create table if not exists auth.users (
  id uuid primary key,
  email text,
  created_at timestamptz not null default now()
);

create or replace function auth.uid() returns uuid
language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
  )::uuid
$$;

create or replace function auth.role() returns text
language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
  )
$$;

create or replace function auth.jwt() returns jsonb
language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;

grant execute on all functions in schema auth to anon, authenticated, service_role;

-- ---------- storage ----------
create schema if not exists storage;
grant usage on schema storage to anon, authenticated, service_role;

create table if not exists storage.buckets (
  id text primary key,
  name text not null unique,
  owner uuid,
  public boolean default false,
  file_size_limit bigint,
  allowed_mime_types text[],
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name text,
  owner uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  last_accessed_at timestamptz default now(),
  metadata jsonb,
  unique (bucket_id, name)
);

alter table storage.buckets enable row level security;
alter table storage.objects enable row level security;

create or replace function storage.foldername(name text) returns text[]
language plpgsql immutable as $$
declare
  _parts text[];
begin
  select string_to_array(name, '/') into _parts;
  return _parts[1:array_length(_parts, 1) - 1];
end
$$;

grant all on storage.buckets, storage.objects to anon, authenticated, service_role;
grant execute on function storage.foldername(text) to anon, authenticated, service_role;

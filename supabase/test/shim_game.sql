-- =====================================================================
-- Lokálny shim Supabase pre hernú časť (gosko_test). NIKDY nespúšťať v produkcii.
-- Dopĺňa shim.sql o to, čo má Supabase Auth a hra potrebuje: overený e-mail
-- v auth.users a auth.email() z JWT prihláseného hráča. auth.uid() z shim.sql
-- už berie sub z request.jwt.claims, takže hráč = auth.users.id = players.id.
-- =====================================================================

alter table auth.users add column if not exists email_confirmed_at timestamptz;

create or replace function auth.email() returns text
language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.email', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email'
  )
$$;

grant execute on function auth.email() to anon, authenticated, service_role;

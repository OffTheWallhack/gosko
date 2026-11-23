-- 020: správa adminov len pre majiteľa (rdurica1995@gmail.com).
-- Ostatní admini túto správu nemajú: funkcie vrátia chybu, ak volajúci nie je majiteľ.
begin;

create or replace function public._is_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from auth.users u where u.id = auth.uid() and lower(u.email) = 'rdurica1995@gmail.com'
                 and u.email_confirmed_at is not null)
$$;

create or replace function public.owner_list_admins() returns table(email text, pending boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public._is_owner() then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
    select u.email::text, false from public.admins a join auth.users u on u.id = a.user_id
    union
    select i.email, true from public.admin_invites i
      where not exists (select 1 from public.admins a join auth.users u on u.id = a.user_id where lower(u.email) = lower(i.email))
    order by 1;
end $$;

create or replace function public.owner_add_admin(p_email text) returns void
language plpgsql security definer set search_path = public as $$
declare e text := lower(trim(p_email));
begin
  if not public._is_owner() then raise exception 'forbidden' using errcode = '42501'; end if;
  if e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(e) > 254 then raise exception 'bad_email'; end if;
  insert into public.admin_invites (email) values (e) on conflict do nothing;
  -- účet s potvrdeným e-mailom dostane admina hneď (trigger na admin_invites)
  insert into public.admins (user_id) select u.id from auth.users u
    where lower(u.email) = e and u.email_confirmed_at is not null on conflict do nothing;
end $$;

create or replace function public.owner_remove_admin(p_email text) returns void
language plpgsql security definer set search_path = public as $$
declare e text := lower(trim(p_email));
begin
  if not public._is_owner() then raise exception 'forbidden' using errcode = '42501'; end if;
  if e = 'rdurica1995@gmail.com' then raise exception 'owner_protected'; end if;
  delete from public.admin_invites where lower(email) = e;
  delete from public.admins where user_id in (select id from auth.users where lower(email) = e);
end $$;

revoke all on function public._is_owner(), public.owner_list_admins(), public.owner_add_admin(text), public.owner_remove_admin(text) from public, anon;
grant execute on function public._is_owner(), public.owner_list_admins(), public.owner_add_admin(text), public.owner_remove_admin(text) to authenticated;
notify pgrst, 'reload schema';
commit;

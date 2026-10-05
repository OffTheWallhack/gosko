-- =====================================================================
-- Audit: všetky práva, ktoré majú anon, authenticated a PUBLIC na objekty v public.
-- Spusti v Supabase SQL editore (iba čítanie, nič nemení) a pošli výsledok.
-- Stĺpec risk:
--   KRITICKÉ  = zápis cez pohľad (obchádza RLS) alebo prístup anon k tabuľke s osobnými údajmi
--   POZOR     = zápis do tabuľky (chráni ho len RLS) alebo SECURITY DEFINER funkcia pre anon
--   ok        = očakávané
-- Pred migráciou 001 tu uvidíš KRITICKÉ riadky pre *_public pohľady, ak ich Supabase pridal.
-- =====================================================================
with rel as (
  select c.oid, c.relname, c.relkind, c.relowner, c.relacl, c.relrowsecurity
  from pg_class c
  where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'v', 'm', 'S', 'f', 'p')
),
pii as (
  select unnest(array['riders', 'rider_private', 'registrations', 'registrations_legacy', 'nft_tokens', 'audit_log',
    'rate_limits', 'admins', 'newsletter_subscribers', 'bookings', 'shop_interest', 'privacy_requests',
    'community_events', 'spots', 'event_photos', 'parks', 'votes']) as relname
),
table_acl as (
  select r.relname, r.relkind, r.relrowsecurity, a.grantee, a.privilege_type
  from rel r, aclexplode(coalesce(r.relacl, acldefault((case when r.relkind = 'S' then 's' else 'r' end)::"char", r.relowner))) a
),
column_acl as (
  select r.relname, r.relkind, r.relrowsecurity, att.attname, a.grantee, a.privilege_type
  from rel r
  join pg_attribute att on att.attrelid = r.oid and att.attnum > 0 and not att.attisdropped and att.attacl is not null
  , aclexplode(att.attacl) a
),
func_acl as (
  select p.proname, p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as name, p.prosecdef, a.grantee, a.privilege_type
  from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f'::"char", p.proowner))) a
  where p.pronamespace = 'public'::regnamespace
),
roles as (
  select 0::oid as oid, 'PUBLIC' as rolname
  union all select oid, rolname from pg_roles where rolname in ('anon', 'authenticated')
),
acl_rows as (
  select case t.relkind when 'v' then 'view' when 'm' then 'matview' when 'S' then 'sequence' else 'table' end as object_type,
         t.relname as object_name, null::text as column_name, ro.rolname as grantee, t.privilege_type as privilege,
         case
           when t.relkind in ('v', 'm') and t.privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')
             then 'KRITICKÉ: zápis cez pohľad obchádza RLS'
           when t.relname in (select relname from pii) and ro.rolname in ('anon', 'PUBLIC')
             then 'KRITICKÉ: anon má prístup k tabuľke s osobnými údajmi'
           when t.privilege_type = 'TRUNCATE' then 'KRITICKÉ: TRUNCATE obchádza RLS'
           when t.relkind = 'r' and not t.relrowsecurity then 'KRITICKÉ: tabuľka bez RLS'
           when t.privilege_type in ('INSERT', 'UPDATE', 'DELETE') then 'POZOR: zápis chráni len RLS'
           else 'ok'
         end as risk
  from table_acl t join roles ro on ro.oid = t.grantee
  union all
  select case c.relkind when 'v' then 'view' else 'table' end, c.relname, c.attname, ro.rolname, c.privilege_type,
         case
           when c.relkind in ('v', 'm') and c.privilege_type in ('INSERT', 'UPDATE') then 'KRITICKÉ: zápis cez pohľad obchádza RLS'
           when c.relname in (select relname from pii) and ro.rolname in ('anon', 'PUBLIC') and c.privilege_type <> 'INSERT'
             then 'KRITICKÉ: anon má prístup k tabuľke s osobnými údajmi'
           when c.attname in ('id', 'created_at', 'approved', 'checked_in_at', 'user_id') and c.privilege_type = 'INSERT'
             then 'POZOR: klient si nastaví ' || c.attname
           else 'ok'
         end
  from column_acl c join roles ro on ro.oid = c.grantee
  union all
  select 'function', f.name, null, ro.rolname, f.privilege_type,
         case
           when f.prosecdef and ro.rolname in ('anon', 'PUBLIC') and f.proname not in ('is_admin', 'park_is_approved')
             then 'POZOR: SECURITY DEFINER pre anon'
           else 'ok'
         end
  from func_acl f join roles ro on ro.oid = f.grantee
)
select object_type, object_name, column_name, grantee, privilege, risk
from acl_rows
order by (risk like 'KRITICK%') desc, (risk like 'POZOR%') desc, object_type, object_name, column_name nulls first, grantee, privilege;

-- =====================================================================
-- 005_results_clear_nft: zmazaný výsledok sa vynuluje aj na chaine.
-- Poradie: supabase-setup.sql -> 001 -> 002 -> 003 -> 004 -> 005. Opakovateľné.
--
-- Do 003 save_results prepínal na result_pending iba tokeny jazdcov, ktorí vo
-- výsledkoch ostali. Jazdec, ktorého admin z kategórie vyhodil (alebo celú
-- kategóriu zmazal prázdnym zoznamom), mal na chaine ďalej staré umiestnenie
-- a body (status result_set). Teraz sa result_pending nastaví aj tokenom
-- registrácií, ktoré mali výsledok pred uložením; API (api/_lib/nft.js) im
-- pošle setResult(tokenId, 0, 0) a vráti ich do stavu minted.
-- Signatúra, chyby a granty sú rovnaké ako v 003 (EXECUTE iba service_role).
-- =====================================================================
begin;

create or replace function public.save_results(p_event_id text, p_category text, p_rows jsonb, p_actor uuid)
returns int
language plpgsql security invoker set search_path = '' as $$
declare
  n_deleted int;
  n_saved int;
  n_nft int;
  logged jsonb;
  previous uuid[];
begin
  if p_category is null or p_category not in ('open', 'u16', 'women') then
    raise exception 'invalid_category' using errcode = '22023';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'invalid_rows' using errcode = '22023', detail = 'p_rows must be a JSON array';
  end if;
  if exists (select 1 from jsonb_array_elements(p_rows) e where jsonb_typeof(e) <> 'object') then
    raise exception 'invalid_rows' using errcode = '22023', detail = 'every row must be an object';
  end if;
  if not exists (select 1 from public.events where id = p_event_id) then
    raise exception 'event_not_found' using errcode = 'PT404';  -- PostgREST: HTTP 404
  end if;

  -- súbežné uloženie tej istej kategórie ide jedno po druhom
  perform pg_advisory_xact_lock(hashtextextended('save_results:' || p_event_id || ':' || p_category, 0));

  select coalesce(array_agg(er.registration_id), '{}') into previous
    from public.event_results er
   where er.event_id = p_event_id and er.category = p_category and er.registration_id is not null;

  delete from public.event_results where event_id = p_event_id and category = p_category;
  get diagnostics n_deleted = row_count;

  insert into public.event_results (event_id, category, rider_name, place, registration_id)
  select p_event_id, p_category,
         coalesce(nullif(btrim(r.rider_name), ''),
                  (select rd.display_name from public.registrations g
                     join public.riders rd on rd.id = g.rider_id where g.id = r.registration_id)),
         r.place, r.registration_id
  from jsonb_to_recordset(p_rows) as r(registration_id uuid, rider_name text, place int);
  get diagnostics n_saved = row_count;

  -- nové výsledky: minted aj result_set; vyhodení jazdci: len tí, čo výsledok na chaine majú
  update public.nft_tokens t
     set status = 'result_pending'
   where (t.status in ('minted', 'result_set')
          and t.registration_id in (
            select er.registration_id from public.event_results er
            where er.event_id = p_event_id and er.category = p_category and er.registration_id is not null))
      or (t.status = 'result_set' and t.registration_id = any (previous));
  get diagnostics n_nft = row_count;

  -- do auditu ide registrovaný jazdec len cez registration_id (bez mena)
  select coalesce(jsonb_agg(case when er.registration_id is null
                                 then jsonb_build_object('rider_name', er.rider_name, 'place', er.place)
                                 else jsonb_build_object('registration_id', er.registration_id, 'place', er.place) end
                            order by er.place, er.rider_name), '[]'::jsonb)
    into logged
    from public.event_results er
   where er.event_id = p_event_id and er.category = p_category;

  insert into public.audit_log (actor, action, entity, entity_id, data)
  values (p_actor, 'results.save', 'event_results', p_event_id || '/' || p_category,
          jsonb_build_object('event_id', p_event_id, 'category', p_category, 'deleted', n_deleted,
                             'saved', n_saved, 'nft_updates', n_nft, 'rows', logged));

  return n_saved;
end $$;

revoke all on function public.save_results(text, text, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.save_results(text, text, jsonb, uuid) to service_role;

-- PostgREST (Supabase API) načíta zmenenú schému
notify pgrst, 'reload schema';

commit;

-- =====================================================================
-- Seed: eventy sezóny 2026 a výsledky Bratislavy z data.js. Po migrácii 002.
-- Opakovateľné:
--   - event sa vloží, pri opakovaní sa obnoví názov, mesto, krajina a sezóna;
--     dátum sa doplní, len ak chýba; status a registration_open sa už nemenia
--     (prevádzkový stav, napr. uzavretú registráciu, seed neprepíše).
--   - výsledky kategórie sa vložia, len ak kategória v DB ešte nemá žiadne
--     (výsledky uložené adminom majú prednosť).
-- =====================================================================
begin;

insert into public.events as e (id, name, city, country, date, season, status, registration_open) values
  ('bratislava-2026-05', 'GOSko Bratislava', 'Bratislava', 'SK', date '2026-05-31', 2026, 'done', false),
  ('zilina-2026', 'GOSko Žilina', 'Žilina', 'SK', null, 2026, 'done', false),
  ('bratislava-2', 'GOSko Bratislava', 'Bratislava', 'SK', null, 2026, 'open', true)
on conflict (id) do update set
  name = excluded.name,
  city = excluded.city,
  country = excluded.country,
  season = excluded.season,
  date = coalesce(e.date, excluded.date);

-- GOSko Bratislava 31. 5. 2026 (data.js: poradie mien = umiestnenie)
insert into public.event_results (event_id, category, rider_name, place)
select s.event_id, s.category, s.rider_name, s.place
from (values
  ('bratislava-2026-05', 'open', 'Sebastian Kozmann', 1),
  ('bratislava-2026-05', 'open', 'Tomáš Čekovský', 2),
  ('bratislava-2026-05', 'open', 'Lukáš Ďuraj', 3),
  ('bratislava-2026-05', 'u16', 'Marek Kupkovič', 1),
  ('bratislava-2026-05', 'u16', 'Andrej Jaško', 2),
  ('bratislava-2026-05', 'u16', 'Tomáš Matel', 3),
  ('bratislava-2026-05', 'women', 'Júlia Dubovská', 1)
) as s(event_id, category, rider_name, place)
where not exists (
  select 1 from public.event_results r where r.event_id = s.event_id and r.category = s.category
);

commit;

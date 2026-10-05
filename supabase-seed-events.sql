-- =====================================================================
-- GOSko: skate eventy doma a vo svete (sezóna 2026) do kalendára
-- Dáta z verejných zdrojov (organizátori, Street League, World Skate,
-- Česká asociace skateboardingu, Slovak Skate, boardriding.com).
-- Pri každom evente je odkaz na zdroj. Dá sa spustiť aj viackrát,
-- rovnaký event (názov + dátum) sa druhýkrát nevloží.
-- =====================================================================

insert into public.community_events (name, date, city, place, country, kind, link, organizer, approved)
select v.name, v.date::date, v.city, v.place, v.country, v.kind, v.link, v.organizer, true
from (values
  -- Slovensko
  ('Bratislava Skate Cup 2026', '2026-04-25', 'Bratislava', 'Skatepark Janka Kráľa', 'Slovensko', 'Contest', 'https://www.bkis.sk/udalost/bratislava-skate-cup/69ce61da011dac3bdfa11664/53279/', 'Slovenská skateboardová asociácia'),
  ('Majstrovstvá SR v skateboardingu 2026', '2026-08-29', 'Košice', 'Skatepark KVP', 'Slovensko', 'Contest', 'https://www.slovakskate.sk/2026/08/25/majstrovstva-sr-v-skateboardingu-2026/', 'Zväz slovenského kolieskového korčuľovania'),
  -- Česko (Český skateboardový pohár a ďalšie)
  ('Skate Local Contest vol. 17 (ČSP)', '2026-05-02', 'Jihlava', null, 'Česko', 'Contest', 'https://www.czechskateboarding.cz/cesky-skateboardovy-pohar/csp-2026', 'Česká asociace skateboardingu'),
  ('Refresh Contest 19 (ČSP)', '2026-05-09', 'Štětí', null, 'Česko', 'Contest', 'https://www.czechskateboarding.cz/cesky-skateboardovy-pohar/csp-2026', 'Česká asociace skateboardingu'),
  ('Mistrovství ČR na minirampě (ČSP)', '2026-05-23', 'Hradec Králové', null, 'Česko', 'Contest', 'https://www.czechskateboarding.cz/cesky-skateboardovy-pohar/csp-2026', 'Česká asociace skateboardingu'),
  ('Český skateboardový pohár Plzeň', '2026-06-13', 'Plzeň', null, 'Česko', 'Contest', 'https://akce.plzen.eu/akce/cesky-skateboardovy-pohar-plzen-2026-u1780399091980/', 'Česká asociace skateboardingu'),
  ('Mystic Sk8 Cup 2026', '2026-06-26', 'Praha', 'Mystic Skatepark Štvanice', 'Česko', 'Contest', 'https://prague.eu/cs/akce/mystic-sk8-cup/', 'Mystic Skatepark'),
  ('Český skateboardový pohár Milovice', '2026-08-15', 'Milovice', null, 'Česko', 'Contest', 'https://www.czechskateboarding.cz/cesky-skateboardovy-pohar/csp-2026', 'Česká asociace skateboardingu'),
  ('Český skateboardový pohár Havířov', '2026-08-28', 'Havířov', null, 'Česko', 'Contest', 'https://www.czechskateboarding.cz/cesky-skateboardovy-pohar/csp-2026', 'Česká asociace skateboardingu'),
  ('Český skateboardový pohár Mladá Boleslav', '2026-09-05', 'Mladá Boleslav', null, 'Česko', 'Contest', 'https://www.czechskateboarding.cz/cesky-skateboardovy-pohar/csp-2026', 'Česká asociace skateboardingu'),
  ('Mistrovství ČR ve skateboardingu 2026', '2026-09-19', 'Praha', 'Mystic Skatepark Štvanice', 'Česko', 'Contest', 'https://www.kudyznudy.cz/akce/mistrovstvi-cr-ve-skateboardingu', 'Česká asociace skateboardingu'),
  -- Rakúsko a zvyšok Európy
  ('Red Bull LEDGEnds 2026', '2026-06-20', 'Innsbruck', null, 'Rakúsko', 'Contest', 'https://www.redbull.com/at-de/events/red-bull-ledgends', 'Red Bull'),
  ('Helsinki HELride 2026', '2026-07-03', 'Helsinki', null, 'Fínsko', 'Contest', 'https://www.boardriding.com/events/helsinki-helride-2026', null),
  ('O Marisquiño – World Cup Skateboarding 2026', '2026-08-07', 'Vigo', null, 'Španielsko', 'Contest', 'https://www.boardriding.com/events/omarisquino-world-cup-skateboarding-2026', null),
  ('World Freestyle 2026', '2026-08-08', 'Kassel', null, 'Nemecko', 'Contest', 'https://wfsafreestyle.org/events/category/competition/', 'WFSA'),
  ('Red Bull Bowl Rippers 2026', '2026-08-27', 'Marseille', 'Bowl du Prado', 'Francúzsko', 'Contest', 'https://www.redbull.com/int-en/events/red-bull-bowl-rippers', 'Red Bull'),
  ('SLS Championship Tour Paríž', '2026-10-03', 'Paríž', 'Stade Roland-Garros', 'Francúzsko', 'Contest', 'https://www.streetleague.com/post/how-to-watch-sls-paris-2026', 'Street League Skateboarding'),
  -- Svet
  ('Street & Park Skateboarding World Championships', '2026-03-01', 'São Paulo', 'Parque Cândido Portinari', 'Brazília', 'Contest', 'https://www.worldskate.org/news/3857-brazil-to-host-street-and-park-skateboarding-world-championships.html', 'World Skate'),
  ('Lair King of the Groms 2026', '2026-03-05', 'Golden Valley', 'The Lair', 'USA', 'Contest', 'https://www.boardriding.com/events/3rd-lair-king-of-the-groms-2026', null),
  ('SLS Championship Tour Sydney', '2026-02-14', 'Sydney', 'Ken Rosewall Arena', 'Austrália', 'Contest', 'https://www.streetleague.com/sydney', 'Street League Skateboarding'),
  ('SLS Championship Tour Los Angeles', '2026-04-04', 'Los Angeles', 'Ace Mission Studios', 'USA', 'Contest', 'https://www.streetleague.com/post/street-league-skateboarding-downtown-los-angeles-2026-event-schedule', 'Street League Skateboarding'),
  ('Tampa Pro 2026', '2026-04-10', 'Tampa', 'Skatepark of Tampa', 'USA', 'Contest', 'https://www.redbull.com/us-en/tampa-pro-guide', 'Skatepark of Tampa'),
  ('SLS Championship Tour Rio de Janeiro', '2026-08-09', 'Rio de Janeiro', null, 'Brazília', 'Contest', 'https://www.streetleague.com/', 'Street League Skateboarding'),
  ('Tony Hawk''s Vert Alert 2026', '2026-08-20', 'Salt Lake City', null, 'USA', 'Contest', 'https://theboardr.com/events/4350/Tony_Hawk`s_Vert_Alert', null),
  ('Damn Am San Diego 2026', '2026-08-28', 'San Diego', null, 'USA', 'Contest', 'https://theboardr.com/events', 'Skatepark of Tampa'),
  ('SLS Championship Tour Tempe', '2026-08-29', 'Tempe', 'Mullett Arena', 'USA', 'Contest', 'https://mullettarena.com/event/sls/', 'Street League Skateboarding'),
  ('Red Bull Origin NYC 2026', '2026-09-17', 'New York', null, 'USA', 'Contest', 'https://theboardr.com/events', 'Red Bull'),
  ('Damn Am Louisville 2026', '2026-09-18', 'Louisville', null, 'USA', 'Contest', 'https://theboardr.com/events', 'Skatepark of Tampa'),
  ('World Skate Games: MS v park skateboardingu', '2026-10-11', 'Asunción', null, 'Paraguaj', 'Contest', 'https://www.worldskate.org/events/upcoming-events.html', 'World Skate'),
  ('World Skate Games: MS v street skateboardingu', '2026-10-14', 'Asunción', null, 'Paraguaj', 'Contest', 'https://www.worldskate.org/events/upcoming-events.html', 'World Skate'),
  ('Tampa Am 2026', '2026-10-15', 'Tampa', 'Skatepark of Tampa', 'USA', 'Contest', 'https://skateparkoftampa.com/blogs/events/32nd-annual-tampa-am', 'Skatepark of Tampa'),
  ('Exposure 2026', '2026-11-06', 'Encinitas', null, 'USA', 'Contest', 'https://theboardr.com/events', 'Exposure Skate'),
  ('SLS Championship Tour Tokio', '2026-11-14', 'Tokio', 'Ariake Arena', 'Japonsko', 'Contest', 'https://metropolisjapan.com/events/sls-tokyo-street-skateboarding/', 'Street League Skateboarding'),
  ('WST Utsunomiya Street 2026', '2026-11-16', 'Utsunomiya', null, 'Japonsko', 'Contest', 'https://www.worldskate.org/events/upcoming-events.html', 'World Skate')
) as v(name, date, city, place, country, kind, link, organizer)
where not exists (
  select 1 from public.community_events e where e.name = v.name and e.date = v.date::date
);

-- ---------- Dátum konca a prize pool (spusti aj na staršej databáze) ----------
alter table public.community_events
  add column if not exists end_date date,
  add column if not exists prize text check (char_length(prize) <= 60);
alter table public.community_events drop constraint if exists community_events_end_after_start;
alter table public.community_events add constraint community_events_end_after_start check (end_date is null or end_date >= date);
-- Pohľad sa mení len na staršej databáze bez end_date. Po migrácii 014 už pohľad má end_date, prize aj image_url
-- (a security_barrier), takže sa nechá tak (create or replace by stĺpec image_url nevedel odobrať).
do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'community_events_public' and column_name = 'end_date') then
    create or replace view public.community_events_public with (security_barrier = true) as
      select id, created_at, name, date, city, place, country, kind, link, organizer, end_date, prize
      from public.community_events where approved;
  end if;
end $$;
grant select on public.community_events_public to anon, authenticated;

update public.community_events e set end_date = v.end_date::date, prize = coalesce(v.prize, e.prize)
from (values
  ('Mystic Sk8 Cup 2026','2026-06-28',null),
  ('SLS Championship Tour Sydney','2026-02-15',null),
  ('Tampa Pro 2026','2026-04-12','25 000 $+'),
  ('Helsinki HELride 2026','2026-07-05',null),
  ('O Marisquiño – World Cup Skateboarding 2026','2026-08-09',null),
  ('Red Bull Bowl Rippers 2026','2026-08-30',null),
  ('Tony Hawk''s Vert Alert 2026','2026-08-22',null),
  ('Damn Am San Diego 2026','2026-08-30',null),
  ('Damn Am Louisville 2026','2026-09-20',null),
  ('Red Bull Origin NYC 2026','2026-09-19',null),
  ('World Skate Games: MS v park skateboardingu','2026-10-18',null),
  ('World Skate Games: MS v street skateboardingu','2026-10-17',null),
  ('Tampa Am 2026','2026-10-18',null),
  ('Exposure 2026','2026-11-08',null),
  ('WST Utsunomiya Street 2026','2026-11-23',null),
  ('Lair King of the Groms 2026','2026-03-08',null),
  ('Street & Park Skateboarding World Championships','2026-03-08',null),
  ('Český skateboardový pohár Havířov','2026-08-29',null),
  ('Bratislava Skate Cup 2026','2026-04-26',null)
) as v(name, end_date, prize)
where e.name = v.name;

insert into public.community_events (name, date, end_date, city, place, country, kind, link, organizer, prize, approved)
select v.*, true from (values
  ('Cube Skate Day Vol. 3', '2026-09-19'::date, null::date, 'Sládkovičovo', 'Sketon Skatepark', 'Slovensko', 'Contest', 'https://www.slovakskate.sk/2026/09/03/cube-skate-day-vol-3-prinesie-do-sladkovicova-den-plny-skateboardingu/', 'CubeSkateshop.sk', '500 € + ceny'),
  ('Cassovia Skate Cup 2026', '2026-06-06'::date, null::date, 'Košice', null, 'Slovensko', 'Contest', 'https://collosseum.sk/2026/05/11/cassovia-skate-cup-2026-afterparty/', null, null)
) as v(name, date, end_date, city, place, country, kind, link, organizer, prize)
where not exists (select 1 from public.community_events e where e.name = v.name and e.date = v.date);

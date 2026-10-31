-- Duch verzia 3 + špeciálne veci (assets/ghost.js): zamknuté voľby podľa inventára, dve nálepky (mark, mark2),
-- automatické odomykanie špeciálnych situácií (Halloween, Vianoce, Silvester, 7 dní v kuse).
-- Nahrádza starší v3 (ten mal chybu v syntaxi). Spusti v Supabase SQL editore po supabase-ghoskate.sql. Dá sa spustiť opakovane.
-- Ostatné špeciálne veci dáva admin do inventára: win:gosko (víťaz), win:podium (bedňa), win:trick (trik týždňa),
-- crew:founder (zakladateľ crew), bug:hunter (nahlásená chyba). Eventy ako doteraz: event:winter, event:after, event:night, event:ba3.

-- 1) Strážca profilu: founder loot pri založení do 1. 4. 2027; každá zamknutá voľba potrebuje vec v inventári, inak padne na základ.
--    Zoznam zámkov je vygenerovaný z assets/ghost.js (CATS + FLAG_ITEMS).
create or replace function public.profile_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  lk record;
  dflt jsonb := '{"pattern":"none","finish":"vinyl","eyes":"ink","eyeShape":"logo","mouth":"logo","faceExtra":"none","head":"none","extra":"none","mark":"none","mark2":"none","buddy":"none","scene":"night","effect":"none","shoes":"none","boardExtra":"none"}'::jsonb;
begin
  if tg_op = 'UPDATE' then new.id := old.id; new.created_at := old.created_at; new.source := coalesce(old.source, new.source); end if;
  new.updated_at := now();
  if tg_op = 'INSERT' and now() < '2027-04-01'::timestamptz then
    insert into public.inventory (user_id, item, source) values
      (new.id, 'skin:founder', 'founder'), (new.id, 'sticker:founder-2026', 'founder'), (new.id, 'badge:founder', 'founder')
    on conflict do nothing;
  end if;
  -- starý zápis { skin }: zamknutý skin len s vecou v inventári
  if coalesce(new.ghost->>'skin', 'classic') not in ('classic', 'red', 'mint', 'ice', 'violet')
     and not exists (select 1 from public.inventory i where i.user_id = new.id and i.item = 'skin:' || (new.ghost->>'skin')) then
    new.ghost := jsonb_set(new.ghost, '{skin}', '"classic"');
  end if;
  for lk in select * from (values
      ('pattern', 'split', 'event:ba3'), ('pattern', 'bones', 'event:halloween'), ('pattern', 'sweater', 'event:xmas'), ('pattern', 'vhs', 'win:trick'),
      ('finish', 'holo', 'skin:founder'), ('eyes', 'neon', 'event:after'), ('mouth', 'fangs', 'event:after'), ('head', 'bandana', 'event:ba3'),
      ('head', 'horns', 'skin:founder'), ('head', 'pumpkin', 'event:halloween'), ('head', 'santa', 'event:xmas'), ('head', 'partyhat', 'event:newyear'),
      ('extra', 'chain', 'event:night'), ('extra', 'halo', 'skin:founder'), ('extra', 'flag', 'crew:founder'), ('mark', 'number', 'skin:founder'),
      ('mark', 'pumpkin', 'event:halloween'), ('mark', 'snowflake', 'event:xmas'), ('mark', 'seven', 'streak:7'), ('mark', 'trophy', 'win:gosko'),
      ('mark', 'podium', 'win:podium'), ('mark', 'cassette', 'win:trick'), ('mark', 'bug', 'bug:hunter'), ('mark2', 'number', 'skin:founder'),
      ('mark2', 'pumpkin', 'event:halloween'), ('mark2', 'snowflake', 'event:xmas'), ('mark2', 'seven', 'streak:7'), ('mark2', 'trophy', 'win:gosko'),
      ('mark2', 'podium', 'win:podium'), ('mark2', 'cassette', 'win:trick'), ('mark2', 'bug', 'bug:hunter'), ('buddy', 'rat', 'event:night'),
      ('buddy', 'mini', 'skin:founder'), ('buddy', 'bug', 'bug:hunter'), ('scene', 'snow', 'event:winter'), ('effect', 'souls', 'event:halloween'),
      ('effect', 'snowfall', 'event:xmas'), ('effect', 'fireworks', 'event:newyear'), ('effect', 'orbit', 'streak:7'), ('effect', 'spotlight', 'win:gosko'),
      ('effect', 'flashes', 'win:podium')
    ) as t(field, val, item)
  loop
    if new.ghost->>lk.field = lk.val and not exists (select 1 from public.inventory i where i.user_id = new.id and i.item = lk.item) then
      new.ghost := jsonb_set(new.ghost, array[lk.field], dflt->lk.field);
    end if;
  end loop;
  return new;
end $$;
revoke execute on function public.profile_guard() from public, anon, authenticated;

-- 2) Dni, keď človek otvoril profil (pre „7 dní v kuse“). Číta a píše len funkcia nižšie.
create table if not exists public.ghost_days (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  primary key (user_id, day)
);
alter table public.ghost_days enable row level security;
revoke all on public.ghost_days from anon, authenticated;

-- 3) Web a Ghoskate ju zavolajú pri otvorení profilu. Pridá veci podľa dátumu (čas Bratislava) a série dní. Vráti novo pridané veci.
create or replace function public.claim_ghost_specials() returns text[]
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  d date := (now() at time zone 'Europe/Bratislava')::date;
  m int := extract(month from d)::int;
  dd int := extract(day from d)::int;
  want text[] := '{}';
  got text[] := '{}';
  it text;
  n int;
begin
  if uid is null or not exists (select 1 from public.profiles where id = uid) then return got; end if;
  insert into public.ghost_days (user_id, day) values (uid, d) on conflict do nothing;
  delete from public.ghost_days where user_id = uid and day < d - 30;
  if (m = 10 and dd >= 30) or (m = 11 and dd <= 2) then want := array_append(want, 'event:halloween'); end if;
  if m = 12 and dd between 23 and 27 then want := array_append(want, 'event:xmas'); end if;
  if (m = 12 and dd = 31) or (m = 1 and dd <= 2) then want := array_append(want, 'event:newyear'); end if;
  select count(*) into n from public.ghost_days where user_id = uid and day > d - 7 and day <= d;
  if n >= 7 then want := array_append(want, 'streak:7'); end if;
  foreach it in array want loop
    insert into public.inventory (user_id, item, source) values (uid, it, 'special') on conflict do nothing;
    if found then got := array_append(got, it); end if;
  end loop;
  return got;
end $$;
revoke execute on function public.claim_ghost_specials() from public, anon;
grant execute on function public.claim_ghost_specials() to authenticated;

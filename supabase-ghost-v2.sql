-- Duch verzia 2 (assets/ghost.js): viac nastavení v profiles.ghost + zamknuté veci podľa inventára.
-- Spusti v Supabase SQL editore po supabase-ghoskate.sql. Dá sa spustiť opakovane.

-- Founder loot (prvá vlna do 1. 4. 2027) dostane aj veci pre ducha z prvej vlny.
create or replace function public.profile_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  lk record;
  dflt jsonb := '{"pattern":"none","finish":"vinyl","eyes":"ink","eyeShape":"logo","mouth":"logo","head":"none","extra":"none","mark":"none","buddy":"none","scene":"night","effect":"none"}'::jsonb;
begin
  if tg_op = 'UPDATE' then new.id := old.id; new.created_at := old.created_at; new.source := coalesce(old.source, new.source); end if;
  new.updated_at := now();
  if tg_op = 'INSERT' and now() < '2027-04-01'::timestamptz then
    insert into public.inventory (user_id, item, source) values
      (new.id, 'skin:founder', 'founder'), (new.id, 'sticker:founder-2026', 'founder'), (new.id, 'badge:founder', 'founder'),
      (new.id, 'head:horns', 'founder'), (new.id, 'extra:halo', 'founder'), (new.id, 'mark:number', 'founder'), (new.id, 'buddy:mini', 'founder')
    on conflict do nothing;
  end if;
  -- starý zápis { skin }: zamknutý skin len s vecou v inventári
  if coalesce(new.ghost->>'skin', 'classic') not in ('classic', 'red', 'mint', 'ice', 'violet')
     and not exists (select 1 from public.inventory i where i.user_id = new.id and i.item = 'skin:' || (new.ghost->>'skin')) then
    new.ghost := jsonb_set(new.ghost, '{skin}', '"classic"');
  end if;
  -- nový zápis (v2): každá zamknutá voľba potrebuje vec v inventári, inak padne na základ
  for lk in select * from (values
      ('pattern', 'split', 'pattern:split'), ('finish', 'chrome', 'finish:chrome'), ('finish', 'holo', 'skin:founder'), ('finish', 'glow', 'finish:glow'),
      ('eyes', 'neon', 'eyes:neon'), ('eyes', 'gold', 'eyes:gold'), ('eyeShape', 'slits', 'face:slits'), ('mouth', 'fangs', 'face:fangs'),
      ('head', 'bandana', 'head:bandana'), ('head', 'horns', 'head:horns'), ('head', 'crown', 'head:crown'),
      ('extra', 'chain', 'extra:chain'), ('extra', 'halo', 'extra:halo'), ('mark', 'star', 'mark:star'), ('mark', 'number', 'mark:number'),
      ('buddy', 'rat', 'buddy:rat'), ('buddy', 'mini', 'buddy:mini'), ('scene', 'snow', 'scene:winter'), ('effect', 'flames', 'fx:flames')
    ) as t(field, val, item)
  loop
    if new.ghost->>lk.field = lk.val and not exists (select 1 from public.inventory i where i.user_id = new.id and i.item = lk.item) then
      new.ghost := jsonb_set(new.ghost, array[lk.field], dflt->lk.field);
    end if;
  end loop;
  return new;
end $$;

-- Existujúcim founderom (profil založený pred spustením) dopln veci z prvej vlny.
insert into public.inventory (user_id, item, source)
select p.id, v.item, 'founder' from public.profiles p
  cross join (values ('head:horns'), ('extra:halo'), ('mark:number'), ('buddy:mini')) as v(item)
  where exists (select 1 from public.inventory i where i.user_id = p.id and i.item = 'skin:founder')
on conflict do nothing;

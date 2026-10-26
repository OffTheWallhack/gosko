// Robova admin správa spotov (#/admin/spoty, supabase-spots-admin.sql) potrebuje práva na
// spots a spot_photos. Migrácia 001 najprv odoberie všetky práva, preto ich musí vrátiť,
// inak by po jej spustení admin spotov prestal ukladať, mazať a pridávať fotky.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..');
const sql = readFileSync(join(ROOT, 'supabase/migrations/001_hardening.sql'), 'utf8');
const store = readFileSync(join(ROOT, 'assets/store.js'), 'utf8');

test('001 vráti práva na spot_photos (čítanie pre všetkých, zápis pre prihláseného admina cez RLS)', () => {
  assert.match(sql, /grant select on public\.spot_photos to anon, authenticated/);
  assert.match(sql, /grant insert, update, delete on public\.spot_photos to authenticated/);
});

test('001 povolí adminovi upraviť a pridať spot so všetkými stĺpcami z adminSaveSpot', () => {
  const row = store.match(/async adminSaveSpot\(s\) \{\s*const row = \{([\s\S]*?)\};/)[1];
  const cols = [...row.matchAll(/(\w+):/g)].map(m => m[1]);
  assert.ok(cols.includes('area') && cols.includes('tag'), 'adminSaveSpot sa zmenil, uprav test');
  const listed = sql.match(/spot_admin_cols text\[\] := array\[([^\]]*)\]/)[1];
  for (const c of [...cols, 'photo_url']) assert.ok(listed.includes(`'${c}'`), `stĺpec ${c} chýba v 001`);
});

// Import zakladateľov proti lokálnemu PostgRESTu: syntetické CSV (3 vymyslení jazdci),
// idempotencia a prepojenie event_results s registráciou. Na produkciu sa nepripája.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { readEnv } from '../../../api/_lib/env.js';
import { createDb, eq } from '../../../api/_lib/db.js';
import { main } from '../../../scripts/import-founders.js';

const STACK = new URL('../../helpers/stack.js', import.meta.url);
const EVENT = 'synt-founders-int';
const sleep = ms => new Promise(r => setTimeout(r, ms));

const CSV = [
  'Timestamp,Meno,Priezvisko,Prezývka:,Dátum narodenia:,"Mesto, z ktorého pochádzaš:",Sociálna sieť,Stance,sponzori,Máš záujem,Mesto / Lokalita,V ktorom skateshope,Mailová adresa,Telefónne číslo',
  '5/20/2026 18:01:02,Testo,Fiktívny,Fikto,1.2.2000,Bratislava,@fikto.sk,regular,,Áno,,,Testo.Fiktivny@Example.test,+421900000001',
  '5/21/2026 9:15:00,Anka,Vymyslená,,15.8.2012,Trnava,,goofy,,Áno,,,anka@example.test,',
  '5/22/2026 10:00:00,Traktora,Dominatora,TD,3.3.1999,Nitra,,regular,,Nie,,,td@example.test,',
].join('\n');

if (!existsSync(STACK)) {
  test('import zakladateľov (preskočené)', { skip: 'chýba tests/helpers/stack.js' }, () => {});
} else {
  const stack = await import(STACK.href);
  let db;
  let dir;
  const quiet = { info() {} };

  before(async () => {
    const deadline = Date.now() + 120_000;
    for (;;) {
      try { await stack.startStack(); break; } catch (err) {
        if (!/busy/i.test(err.message) || Date.now() > deadline) throw err;
        await sleep(2000);
      }
    }
    const env = readEnv({ SUPABASE_URL: stack.REST_URL, SUPABASE_SERVICE_ROLE_KEY: stack.jwt('service_role') });
    db = createDb({ url: env.SUPABASE_REST_URL, key: env.SUPABASE_SERVICE_ROLE_KEY });
    await db.insert('events', { id: EVENT, name: 'Syntetický event', city: 'Bratislava', date: '2026-05-31', season: 2026, status: 'done' });
    await db.insert('event_results', [
      { event_id: EVENT, category: 'open', rider_name: 'Testo Fiktivny', place: 1 },
      { event_id: EVENT, category: 'u16', rider_name: 'anka  vymyslena', place: 1 },
      { event_id: EVENT, category: 'open', rider_name: 'Neznámy Hosť', place: 2 },
    ]);
    dir = await mkdtemp(`${tmpdir()}/gosko-founders-int-`);
    await writeFile(`${dir}/synt.csv`, CSV);
  }, { timeout: 180_000 });

  after(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
    await stack.stopStack().catch(() => {});
  });

  const snapshot = async () => ({
    riders: await db.select('riders', {}, { select: 'id,display_name,is_founder,public_name_mode', order: 'display_name.asc' }),
    regs: await db.select('registrations', { event_id: eq(EVENT) }, { select: 'id,rider_id,category,status,nft_consent,consent_version,checked_in_at', order: 'id.asc' }),
    results: await db.select('event_results', { event_id: eq(EVENT) }, { select: 'rider_name,category,place,points,registration_id', order: 'rider_name.asc' }),
  });

  test('dry-run nič nezapíše', async () => {
    const { out } = await main([`${dir}/synt.csv`, '--event', EVENT, '--dry-run'], { db, log: quiet });
    assert.equal(out.ridersCreated, 3);
    assert.equal((await db.select('registrations', { event_id: eq(EVENT) })).length, 0);
  });

  test('import založí jazdcov a registrácie a prepojí výsledky podľa mena', async () => {
    const { out } = await main([`${dir}/synt.csv`, '--event', EVENT], { db, log: quiet });
    assert.deepEqual([out.ridersCreated, out.registrationsCreated, out.resultsLinked], [3, 3, 2]);
    assert.deepEqual(out.unmatched, ['Neznámy Hosť']);
    const s = await snapshot();
    assert.equal(s.regs.length, 3);
    assert.ok(s.regs.every(r => r.status === 'checked_in' && r.nft_consent === false && r.consent_version === 'import-2026-05'));
    const byName = Object.fromEntries(s.riders.map(r => [r.display_name, r]));
    assert.equal(byName['Anka Vymyslená'].public_name_mode, 'short');
    assert.ok(Object.values(byName).every(r => r.is_founder));
    const ankaReg = s.regs.find(r => r.rider_id === byName['Anka Vymyslená'].id);
    assert.equal(ankaReg.category, 'u16');
    const linkedAnka = s.results.find(r => r.category === 'u16');
    assert.equal(linkedAnka.registration_id, ankaReg.id);
    assert.equal(linkedAnka.points, 100);
    const [priv] = await db.select('rider_private', { rider_id: eq(byName['Testo Fiktívny'].id) });
    assert.equal(priv.email, 'testo.fiktivny@example.test');
    assert.equal(priv.birth_date, '2000-02-01');
    assert.equal(priv.instagram, 'fikto.sk');
  });

  test('druhý beh je idempotentný: nič sa nezmení', async () => {
    const before = await snapshot();
    const { out } = await main([`${dir}/synt.csv`, '--event', EVENT], { db, log: quiet });
    assert.deepEqual([out.ridersCreated, out.ridersFlagged, out.registrationsCreated, out.resultsLinked], [0, 0, 0, 0]);
    assert.deepEqual(await snapshot(), before);
  });
}

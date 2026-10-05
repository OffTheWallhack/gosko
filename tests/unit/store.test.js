import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { getStore } from '../../assets/store.js';
import { UserError } from '../../assets/util.js';

/* V Node nie je document, takže načítanie supabase-js zlyhá rovnako ako pri výpadku knižnice v prehliadači. */
const quiet = async fn => { const e = console.error; console.error = () => {}; try { return await fn(); } finally { console.error = e; } };

describe('getStore', () => {
  test('prázdny CONFIG = výslovná lokálna ukážka', async () => {
    const s = await getStore({ SUPABASE_URL: '', SUPABASE_ANON_KEY: '' });
    assert.equal(s.mode, 'demo');
  });

  test('vyplnený CONFIG a zlyhaná knižnica: offline, nie demo', async () => {
    const s = await quiet(() => getStore({ SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'sb_publishable_x' }));
    assert.equal(s.mode, 'offline');
    assert.equal(await s.isAdmin(), false, 'offline nesmie pustiť do adminu');
    assert.equal(await s.signedIn(), false);
  });

  test('offline: registrácia ani iný zápis neprejde, chyba má text pre človeka', async () => {
    const s = await quiet(() => getStore({ SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'k' }));
    await assert.rejects(s.send('registrations', { name: 'Eva' }), err => err instanceof UserError && /server/i.test(err.message));
    for (const k of ['submitEvent', 'subscribe', 'submitSpot', 'submitPark', 'saveResults', 'checkIn', 'approve', 'login'])
      await assert.rejects(s[k](), UserError, k);
    await assert.rejects(s.listResults(), UserError, 'čítanie tiež priznáva výpadok');
  });

  test('offline store má všetky metódy live store', async () => {
    const s = await quiet(() => getStore({ SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'k' }));
    const demo = await getStore({});
    for (const k of Object.keys(demo)) assert.ok(k in s, `chýba ${k}`);
  });

  test('pomalé načítanie skončí offline po časovom limite', async () => {
    const t0 = Date.now();
    const s = await quiet(() => getStore({ SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'k' }, { timeout: 30, connect: () => new Promise(() => {}) }));
    assert.equal(s.mode, 'offline');
    assert.ok(Date.now() - t0 < 2000);
  });

  test('úspešné spojenie vráti live store', async () => {
    const live = { mode: 'live' };
    assert.equal(await getStore({ SUPABASE_URL: 'u', SUPABASE_ANON_KEY: 'k' }, { connect: async () => live }), live);
  });
});

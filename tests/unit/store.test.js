import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { getStore } from '../../assets/store.js';
import { UserError } from '../../assets/util.js';

/* V Node nie je document, takže načítanie supabase-js zlyhá rovnako ako pri výpadku knižnice v prehliadači. */
const V2 = { BACKEND_V2: true };
const quiet = async fn => { const e = console.error; console.error = () => {}; try { return await fn(); } finally { console.error = e; } };

/* Robov web (BACKEND_V2 vypnuté) sa správa ako doteraz: výpadok Supabase = ukážkový režim v prehliadači. */
describe('getStore bez BACKEND_V2 (ako doteraz na GitHub Pages)', () => {
  test('prázdny CONFIG = výslovná lokálna ukážka', async () => {
    const s = await getStore({ SUPABASE_URL: '', SUPABASE_ANON_KEY: '' });
    assert.equal(s.mode, 'demo');
  });
  test('zlyhaná knižnica: ukážkový režim, nie offline', async () => {
    const s = await quiet(() => getStore({ SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'k' }));
    assert.equal(s.mode, 'demo');
  });
  test('úspešné spojenie vráti live store', async () => {
    const live = { mode: 'live' };
    assert.equal(await getStore({ SUPABASE_URL: 'u', SUPABASE_ANON_KEY: 'k' }, { connect: async () => live }), live);
  });
  test('demo store má doplnky pre registráciu v2 a hru (prázdne, nič nepredstierajú)', async () => {
    const s = await getStore({});
    assert.deepEqual(await s.listOfficialEvents(), []);
    assert.deepEqual(await s.eventRegistrations('e'), []);
    await assert.rejects(s.adminCheckin({ token: 't' }), UserError);
    assert.equal(s.client, null);
  });
});

describe('getStore s BACKEND_V2', () => {

  test('vyplnený CONFIG a zlyhaná knižnica: offline, nie demo', async () => {
    const s = await quiet(() => getStore({ ...V2, SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'sb_publishable_x' }));
    assert.equal(s.mode, 'offline');
    assert.equal(await s.isAdmin(), false, 'offline nesmie pustiť do adminu');
    assert.equal(await s.signedIn(), false);
  });

  test('offline: registrácia ani iný zápis neprejde, chyba má text pre človeka', async () => {
    const s = await quiet(() => getStore({ ...V2, SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'k' }));
    await assert.rejects(s.send('registrations', { name: 'Eva' }), err => err instanceof UserError && /server/i.test(err.message));
    for (const k of ['submitEvent', 'subscribe', 'submitSpot', 'submitPark', 'saveResults', 'checkIn', 'approve', 'login'])
      await assert.rejects(s[k](), UserError, k);
    await assert.rejects(s.listResults(), UserError, 'čítanie tiež priznáva výpadok');
  });

  test('offline store má všetky metódy live store', async () => {
    const s = await quiet(() => getStore({ ...V2, SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'k' }));
    const demo = await getStore({});
    for (const k of Object.keys(demo)) assert.ok(k in s, `chýba ${k}`);
  });

  test('pomalé načítanie skončí offline po časovom limite', async () => {
    const t0 = Date.now();
    const s = await quiet(() => getStore({ ...V2, SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'k' }, { timeout: 30, connect: () => new Promise(() => {}) }));
    assert.equal(s.mode, 'offline');
    assert.ok(Date.now() - t0 < 2000);
  });

  test('úspešné spojenie vráti live store', async () => {
    const live = { mode: 'live' };
    assert.equal(await getStore({ ...V2, SUPABASE_URL: 'u', SUPABASE_ANON_KEY: 'k' }, { connect: async () => live }), live);
  });
});

import { mapPublicResults, adminRegistrations } from '../../assets/store.js';
describe('mapPublicResults (results_public + riders_public)', () => {
  test('riadok výsledku pre ranking.js: public_name ako rider_name, rider_id, krajina z riders_public, NFT', () => {
    const rows = [
      { event_id: 'e1', category: 'open', place: 1, points: 100, rider_id: 'r1', public_name: 'Marek K.', chain_id: 8453, token_id: '12', nft_status: 'result_set' },
      { event_id: 'e1', category: 'u16', place: 2, points: 80, rider_id: null, public_name: 'Starý Jazdec', chain_id: null, token_id: null, nft_status: null },
    ];
    const riders = [{ id: 'r1', public_name: 'Marek K.', country: 'CZ', city: null, is_founder: true }];
    assert.deepEqual(mapPublicResults(rows, riders), [
      { event_id: 'e1', category: 'open', rider_name: 'Marek K.', place: 1, rider_id: 'r1', country: 'CZ', nft: { chain_id: 8453, token_id: '12', status: 'result_set' } },
      { event_id: 'e1', category: 'u16', rider_name: 'Starý Jazdec', place: 2, rider_id: null },
    ]);
  });
  test('jazdec bez riadku v riders_public nemá krajinu (dopočíta sa z eventu)', () => {
    const [r] = mapPublicResults([{ event_id: 'e', category: 'open', place: 3, rider_id: 'rx', public_name: 'GOSko jazdec' }], []);
    assert.equal(r.country, undefined);
    assert.equal(r.rider_id, 'rx');
  });
});

describe('adminRegistrations (registrations_admin, audit H1)', () => {
  test('verejné meno ide ďalej, U16 bez súhlasu rodiča dostane zástupné meno podľa ID', () => {
    const rows = [
      { id: 'aaaa1111-0000', category: 'open', status: 'confirmed', checked_in_at: null, public_name: 'Marek K.' },
      { id: 'bbbb2222-0000', category: 'u16', status: 'pending_guardian', checked_in_at: null, public_name: null },
    ];
    assert.deepEqual(adminRegistrations(rows).map(r => [r.id, r.name]), [['aaaa1111-0000', 'Marek K.'], ['bbbb2222-0000', 'Jazdec U16 #bbbb']]);
  });
});

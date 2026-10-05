// POST /api/admin/checkin a POST /api/admin/results.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHandler as checkinHandler } from '../../api/admin/checkin.js';
import { createHandler as resultsHandler } from '../../api/admin/results.js';
import { DbError } from '../../api/_lib/db.js';
import { FakeDb, fakeAuth, fakeChain, testEnv, silentLog, fixedNow, baseEvent, call, ADMIN_ID } from './_support/fakes.js';

const EV = 'bratislava-2026-11';
const R1 = 'bbbbbbbb-0000-4000-8000-000000000001';
const R2 = 'bbbbbbbb-0000-4000-8000-000000000002';
const R3 = 'bbbbbbbb-0000-4000-8000-000000000003';
const G1 = 'aaaaaaaa-0000-4000-8000-000000000001';
const G2 = 'aaaaaaaa-0000-4000-8000-000000000002';
const G3 = 'aaaaaaaa-0000-4000-8000-000000000003';
const T1 = 'dddddddd-0000-4000-8000-000000000001';
const T2 = 'dddddddd-0000-4000-8000-000000000002';
const T3 = 'dddddddd-0000-4000-8000-000000000003';
const AUTH = { authorization: 'Bearer admin-jwt' };

function seed({ r1 = {}, r2 = {}, r3 = {} } = {}) {
  return new FakeDb({
    events: [baseEvent()],
    riders: [
      { id: R1, rider_ref: '0x' + '1'.repeat(64), display_name: 'Marek Kováč', nickname: 'Kovo', public_name_mode: 'short' },
      { id: R2, rider_ref: '0x' + '2'.repeat(64), display_name: 'Peter Malý', public_name_mode: 'full' },
      { id: R3, rider_ref: '0x' + '3'.repeat(64), display_name: 'Ján Novák', public_name_mode: 'full' },
    ],
    rider_private: [
      { rider_id: R1, legal_name: 'Marek Kováč', birth_date: '2000-04-10', email: 'marek@example.sk' },
      { rider_id: R2, legal_name: 'Peter Malý', birth_date: '2012-05-01', email: 'peto@example.sk', guardian_email: 'mama@example.sk' },
      { rider_id: R3, legal_name: 'Ján Novák', birth_date: '1999-01-01', email: 'jan@example.sk' },
    ],
    registrations: [
      { id: G1, rider_id: R1, event_id: EV, category: 'open', status: 'confirmed', token: T1, nft_consent: true, ...r1 },
      { id: G2, rider_id: R2, event_id: EV, category: 'u16', status: 'pending_guardian', token: T2, nft_consent: true, guardian_token: 'eeeeeeee-0000-4000-8000-000000000002', ...r2 },
      { id: G3, rider_id: R3, event_id: EV, category: 'open', status: 'confirmed', token: T3, nft_consent: false, ...r3 },
    ],
  });
}

const checkin = (db, chain = fakeChain(), env = {}) => checkinHandler({ env: testEnv(env), db, chain, auth: fakeAuth(), log: silentLog, now: fixedNow('2026-11-21T09:00:00Z') });
const results = (db, chain = fakeChain(), env = {}) => resultsHandler({ env: testEnv(env), db, chain, auth: fakeAuth(), log: silentLog, now: fixedNow('2026-11-21T18:00:00Z') });
const post = (h, body, headers = AUTH) => call(h, { method: 'POST', body, headers });

/* ---------- auth ---------- */
test('checkin aj results: bez prihlásenia 401, neadmin 403, nič sa nezmení', async () => {
  for (const make of [checkin, results]) {
    const db = seed();
    const chain = fakeChain();
    const h = make(db, chain);
    const r401 = await post(h, { token: T1 }, {});
    assert.equal(r401.statusCode, 401);
    const r403 = await post(h, { token: T1, event_id: EV, category: 'open', rows: [] }, { authorization: 'Bearer user-jwt' });
    assert.equal(r403.statusCode, 403);
    assert.equal(r403.json.error, 'forbidden');
    assert.equal(db.calls.filter(c => c.op !== 'select').length, 0);
    assert.equal(chain.mintCalls.length, 0);
  }
});

/* ---------- checkin ---------- */
test('checkin tokenom: checked_in, odpoveď podľa kontraktu a mint', async () => {
  const db = seed();
  const chain = fakeChain();
  const res = await post(checkin(db, chain), { token: T1 });
  assert.equal(res.statusCode, 200, res.body);
  assert.deepEqual(res.json, {
    ok: true,
    registration: { id: G1, status: 'checked_in', public_name: 'Marek K.', category: 'open', guardian_ok: true },
    nft: { status: 'minted' },
  });
  const reg = db.t('registrations').find(r => r.id === G1);
  assert.equal(reg.status, 'checked_in');
  assert.equal(reg.checked_in_at, '2026-11-21T09:00:00.000Z');
  assert.equal(chain.mintCalls.length, 1);
  assert.ok(db.t('audit_log').some(a => a.action === 'checkin' && a.actor === ADMIN_ID && a.entity_id === G1));
  for (const leak of ['marek@', '2000-04-10', 'Kováč']) assert.ok(!res.body.includes(leak), leak);
});

test('checkin je idempotentný: druhý check-in nemení čas a nemintuje znova', async () => {
  const db = seed();
  const chain = fakeChain();
  const h = checkin(db, chain);
  await post(h, { token: T1 });
  const again = await post(h, { registration_id: G1 });
  assert.equal(again.statusCode, 200);
  assert.equal(again.json.registration.status, 'checked_in');
  assert.equal(again.json.nft.status, 'minted');
  assert.equal(chain.writeCalls, 1, 'práve jeden mint');
  assert.equal(chain.state.byReg.size, 1);
  assert.equal(db.t('nft_tokens').length, 1);
  assert.equal(db.t('audit_log').filter(a => a.action === 'checkin').length, 1);
});

test('súbežné check-iny tej istej registrácie vyrobia jeden token', async () => {
  const db = seed();
  const chain = fakeChain();
  const h = checkin(db, chain);
  const [a, b] = await Promise.all([post(h, { token: T1 }), post(h, { token: T1 })]);
  assert.equal(a.statusCode, 200);
  assert.equal(b.statusCode, 200);
  assert.equal(chain.writeCalls, 1);
  assert.equal(db.t('nft_tokens').length, 1);
});

test('chyba mintu: check-in prejde (200), nft failed; opakovaný check-in mint dorobí bez duplikátu', async () => {
  const db = seed();
  const chain = fakeChain({ failMint: 1, landThenFail: true });
  const h = checkin(db, chain);
  const first = await post(h, { token: T1 });
  assert.equal(first.statusCode, 200);
  assert.equal(first.json.registration.status, 'checked_in');
  assert.equal(first.json.nft.status, 'failed');
  assert.equal(db.t('nft_tokens')[0].status, 'failed');
  assert.match(db.t('nft_tokens')[0].error, /RPC timeout/);
  const retry = await post(h, { token: T1 });
  assert.equal(retry.json.nft.status, 'minted');
  assert.equal(chain.writeCalls, 1, 'retry nemintoval druhýkrát');
  assert.equal(chain.state.byReg.size, 1);
});

test('chyba mintu bez dopadu na chain: status failed, check-in 200', async () => {
  const db = seed();
  const res = await post(checkin(db, fakeChain({ failMint: 5 })), { token: T1 });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json.nft.status, 'failed');
  assert.equal(db.t('registrations').find(r => r.id === G1).status, 'checked_in');
});

test('bez nft_consent sa nemintuje; vypnuté NFT hlási disabled', async () => {
  const chain = fakeChain();
  const r1 = await post(checkin(seed(), chain), { token: T3 });
  assert.equal(r1.json.nft.status, 'no_consent');
  assert.equal(chain.mintCalls.length, 0);
  const r2 = await post(checkin(seed(), { enabled: false }, { NFT_CONTRACT_ADDRESS: '' }), { token: T1 });
  assert.equal(r2.statusCode, 200);
  assert.equal(r2.json.nft.status, 'disabled');
});

test('U16 bez súhlasu rodiča: check-in prejde, guardian_ok false, žiadny mint', async () => {
  const chain = fakeChain();
  const res = await post(checkin(seed(), chain), { token: T2 });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json.registration.guardian_ok, false);
  assert.equal(res.json.registration.category, 'u16');
  assert.equal(res.json.nft.status, 'guardian_pending');
  assert.equal(chain.mintCalls.length, 0);
});

test('U16 so súhlasom rodiča: guardian_ok true a mint', async () => {
  const chain = fakeChain();
  const res = await post(checkin(seed({ r2: { status: 'confirmed', guardian_confirmed_at: '2026-10-06T08:00:00Z', guardian_token: null } }), chain), { token: T2 });
  assert.equal(res.json.registration.guardian_ok, true);
  assert.equal(res.json.nft.status, 'minted');
  assert.equal(chain.mintCalls[0].category, 'u16');
});

test('ručný check-in podľa mena (bez diakritiky, aj podľa prezývky)', async () => {
  const db = seed();
  const res = await post(checkin(db), { event_id: EV, rider_name: '  marek kovac ' });
  assert.equal(res.statusCode, 200, res.body);
  assert.equal(res.json.registration.id, G1);
  const byNick = await post(checkin(seed()), { event_id: EV, rider_name: 'KOVO' });
  assert.equal(byNick.json.registration.id, G1);
});

test('ručný check-in: nejednoznačné meno 409 so zoznamom, neznáme 404', async () => {
  const db = seed({ r3: { rider_id: R3 } });
  db.t('riders').find(r => r.id === R3).display_name = 'Marek Kováč';
  db.t('rider_private').find(r => r.rider_id === R3).legal_name = 'Marek Kováč';
  const amb = await post(checkin(db), { event_id: EV, rider_name: 'Marek Kováč' });
  assert.equal(amb.statusCode, 409);
  assert.equal(amb.json.error, 'ambiguous');
  assert.equal(amb.json.candidates.length, 2);
  assert.deepEqual(Object.keys(amb.json.candidates[0]).sort(), ['category', 'id', 'public_name', 'status']);
  assert.ok(!amb.body.includes('@'));
  const none = await post(checkin(seed()), { event_id: EV, rider_name: 'Nikto Neznámy' });
  assert.equal(none.statusCode, 404);
});

test('checkin: neznámy token 404, zrušená registrácia 409, zlý vstup 400', async () => {
  const r404 = await post(checkin(seed()), { token: 'dddddddd-0000-4000-8000-00000000ffff' });
  assert.equal(r404.statusCode, 404);
  assert.equal(r404.json.error, 'not_found');
  const r409 = await post(checkin(seed({ r1: { status: 'cancelled' } })), { token: T1 });
  assert.equal(r409.statusCode, 409);
  assert.equal(r409.json.error, 'registration_cancelled');
  const r400 = await post(checkin(seed()), { token: 'nie' });
  assert.equal(r400.statusCode, 400);
  assert.equal(r400.json.error, 'invalid_input');
  assert.equal((await call(checkin(seed()), { method: 'GET', headers: AUTH })).statusCode, 405);
});

/* ---------- results ---------- */
async function mintedSeed() {
  const db = seed({ r2: { status: 'confirmed', guardian_confirmed_at: '2026-10-06T08:00:00Z' } });
  const chain = fakeChain();
  const h = checkin(db, chain);
  await post(h, { token: T1 });
  await post(h, { token: T2 });
  await post(h, { token: T3 }); // bez NFT súhlasu
  return { db, chain };
}

test('results: volá save_results a setResult pre každý token s miestom', async () => {
  const { db, chain } = await mintedSeed();
  const res = await post(results(db, chain), {
    event_id: EV, category: 'open',
    rows: [
      { registration_id: G1, rider_name: 'Marek K.', place: 1 },
      { registration_id: G3, rider_name: 'Ján Novák', place: 2 },
      { rider_name: 'Hosť Bez Registrácie', place: 3 },
    ],
  });
  assert.equal(res.statusCode, 200, res.body);
  assert.deepEqual(res.json, { ok: true, saved: 3, nft_updates: 1, nft_failed: 0 });
  const rpc = db.callsOf('rpc', 'save_results')[0].args;
  assert.equal(rpc.p_event_id, EV);
  assert.equal(rpc.p_category, 'open');
  assert.equal(rpc.p_actor, ADMIN_ID);
  assert.deepEqual(rpc.p_rows, [
    { registration_id: G1, rider_name: 'Marek K.', place: 1 },
    { registration_id: G3, rider_name: 'Ján Novák', place: 2 },
    { registration_id: null, rider_name: 'Hosť Bez Registrácie', place: 3 },
  ]);
  const tokenOfG1 = db.t('nft_tokens').find(t => t.registration_id === G1).token_id;
  assert.deepEqual(chain.resultCalls, [{ tokenId: String(tokenOfG1), placement: 1, points: 100 }]);
  assert.equal(db.t('nft_tokens').find(t => t.registration_id === G1).status, 'result_set');
});

test('results: viac kategórií, každý token dostane svoje body', async () => {
  const { db, chain } = await mintedSeed();
  const h = results(db, chain);
  await post(h, { event_id: EV, category: 'open', rows: [{ registration_id: G1, rider_name: 'Marek K.', place: 5 }] });
  const r = await post(h, { event_id: EV, category: 'u16', rows: [{ registration_id: G2, rider_name: 'Peter Malý', place: 2 }] });
  assert.equal(r.json.nft_updates, 1);
  assert.deepEqual(chain.resultCalls.map(c => [c.placement, c.points]), [[5, 40], [2, 80]]);
});

test('results: oprava výsledku pošle setResult znova', async () => {
  const { db, chain } = await mintedSeed();
  const h = results(db, chain);
  await post(h, { event_id: EV, category: 'open', rows: [{ registration_id: G1, rider_name: 'Marek K.', place: 2 }] });
  await post(h, { event_id: EV, category: 'open', rows: [{ registration_id: G1, rider_name: 'Marek K.', place: 1 }] });
  assert.deepEqual(chain.resultCalls.map(c => c.placement), [2, 1]);
});

test('results: chyba setResult nezhodí uloženie (200, nft_failed)', async () => {
  const { db } = await mintedSeed();
  const res = await post(results(db, fakeChain({ failResult: 1 })), { event_id: EV, category: 'open', rows: [{ registration_id: G1, rider_name: 'Marek K.', place: 1 }] });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json.saved, 1);
  assert.equal(res.json.nft_failed, 1);
  assert.equal(db.t('nft_tokens').find(t => t.registration_id === G1).status, 'failed');
});

test('results: chýbajúce rider_name sa doplní verejným menom z registrácie', async () => {
  const { db, chain } = await mintedSeed();
  await post(results(db, chain), { event_id: EV, category: 'open', rows: [{ registration_id: G1, place: 1 }] });
  assert.equal(db.callsOf('rpc', 'save_results')[0].args.p_rows[0].rider_name, 'Marek K.');
});

test('results: validácia (kategória, miesto, duplicity, cudzia registrácia, neznámy event)', async () => {
  const db = seed();
  db.t('registrations').push({ id: 'ffffffff-0000-4000-8000-000000000009', rider_id: R1, event_id: 'iny-event', category: 'open', status: 'confirmed' });
  const h = results(db);
  const cases = [
    [{ event_id: EV, category: 'pro', rows: [] }, 400],
    [{ event_id: EV, category: 'open', rows: [{ rider_name: 'A', place: 0 }] }, 400],
    [{ event_id: EV, category: 'open', rows: [{ rider_name: 'A', place: 1.5 }] }, 400],
    [{ event_id: EV, category: 'open', rows: [{ rider_name: '', place: 1 }] }, 400],
    [{ event_id: EV, category: 'open', rows: [{ rider_name: 'A', place: 1 }, { rider_name: 'a', place: 2 }] }, 400],
    [{ event_id: EV, category: 'open', rows: [{ registration_id: G1, rider_name: 'A', place: 1 }, { registration_id: G1, rider_name: 'B', place: 2 }] }, 400],
    [{ event_id: EV, category: 'open', rows: [{ registration_id: 'ffffffff-0000-4000-8000-000000000009', rider_name: 'A', place: 1 }] }, 400],
    [{ event_id: EV, category: 'open', rows: [{ registration_id: 'ffffffff-0000-4000-8000-00000000aaaa', rider_name: 'A', place: 1 }] }, 400],
    [{ event_id: EV, category: 'open', rows: 'nie' }, 400],
    [{ event_id: 'neznamy-event', category: 'open', rows: [] }, 404],
  ];
  for (const [body, status] of cases) {
    const r = await post(h, body);
    assert.equal(r.statusCode, status, JSON.stringify(body) + ' ' + r.body);
  }
  assert.equal(db.callsOf('rpc', 'save_results').length, 0);
});

test('results: prázdne rows vymaže kategóriu (saved 0)', async () => {
  const db = seed();
  db.t('event_results').push({ event_id: EV, category: 'open', rider_name: 'X', place: 1, points: 100 });
  const r = await post(results(db), { event_id: EV, category: 'open', rows: [] });
  assert.deepEqual(r.json, { ok: true, saved: 0, nft_updates: 0, nft_failed: 0 });
  assert.equal(db.t('event_results').length, 0);
});

test('results: chyba z DB funkcie (4xx) je 400, výpadok 500', async () => {
  const db = seed();
  db.failNext['rpc:save_results'] = new DbError({ status: 400, code: 'P0001', message: 'registration does not belong to event' });
  const r = await post(results(db), { event_id: EV, category: 'open', rows: [{ rider_name: 'A', place: 1 }] });
  assert.equal(r.statusCode, 400);
  assert.equal(r.json.error, 'invalid_input');
  db.failNext['rpc:save_results'] = new DbError({ status: 503, code: 'network', message: 'down' });
  const r2 = await post(results(db), { event_id: EV, category: 'open', rows: [{ rider_name: 'A', place: 1 }] });
  assert.equal(r2.statusCode, 500);
});

test('results: PT404 z DB je 404 event_not_found, 23503/23505 (HTTP 409) je 409 conflict', async () => {
  const db = seed();
  const row = { event_id: EV, category: 'open', rows: [{ rider_name: 'A', place: 1 }] };
  db.failNext['rpc:save_results'] = new DbError({ status: 404, code: 'PT404', message: 'event_not_found' });
  const r404 = await post(results(db), row);
  assert.equal(r404.statusCode, 404);
  assert.equal(r404.json.error, 'event_not_found');
  for (const code of ['23503', '23505']) {
    db.failNext['rpc:save_results'] = new DbError({ status: 409, code, message: 'x' });
    const r = await post(results(db), row);
    assert.equal(r.statusCode, 409, code);
    assert.equal(r.json.error, 'conflict');
  }
});

test('results s vypnutým NFT: uloží, nft_updates 0', async () => {
  const db = seed();
  const r = await post(results(db, { enabled: false }, { NFT_CONTRACT_ADDRESS: '' }), { event_id: EV, category: 'open', rows: [{ registration_id: G1, rider_name: 'M', place: 1 }] });
  assert.deepEqual(r.json, { ok: true, saved: 1, nft_updates: 0, nft_failed: 0 });
});

// Orchestrácia NFT: ensureMinted, pushResults, retryAll. Chain je falošný kontrakt.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNft, MAX_ATTEMPTS } from '../../../api/_lib/nft.js';
import { FakeDb, fakeChain, testEnv, silentLog, fixedNow } from '../_support/fakes.js';

const REG = 'aaaaaaaa-0000-4000-8000-000000000001';
const REG2 = 'aaaaaaaa-0000-4000-8000-000000000002';
const RIDER = 'bbbbbbbb-0000-4000-8000-000000000001';

function seed(over = {}) {
  return new FakeDb({
    riders: [{ id: RIDER, rider_ref: '0x' + 'cd'.repeat(32), display_name: 'Marek Kováč' }],
    registrations: [
      { id: REG, rider_id: RIDER, event_id: 'ev-1', category: 'open', status: 'checked_in', nft_consent: true, ...over },
    ],
  });
}
const make = (db, chain, now = fixedNow()) => createNft({ env: testEnv(), db, chain: { address: '0x5FbDB2315678afecb367f032d93F642f64180aa3', ...chain }, log: silentLog, now });

test('ensureMinted: vypnutý chain nič nerobí', async () => {
  const db = seed();
  const nft = createNft({ env: testEnv(), db, chain: { enabled: false }, log: silentLog });
  assert.deepEqual(await nft.ensureMinted(REG), { status: 'disabled' });
  assert.equal(db.t('nft_tokens').length, 0);
});

test('ensureMinted: bez nft_consent, bez súhlasu rodiča a bez check-inu sa nemintuje', async () => {
  for (const [over, status] of [[{ nft_consent: false }, 'no_consent'], [{ category: 'u16', guardian_confirmed_at: null }, 'guardian_pending'], [{ status: 'confirmed' }, 'not_checked_in']]) {
    const chain = fakeChain();
    const r = await make(seed(over), chain).ensureMinted(REG);
    assert.equal(r.status, status);
    assert.equal(chain.mintCalls.length, 0);
  }
});

test('ensureMinted: mint zapíše minted, token_id, mint_tx a správne argumenty', async () => {
  const db = seed();
  const chain = fakeChain();
  const r = await make(db, chain).ensureMinted(REG);
  assert.equal(r.status, 'minted');
  assert.equal(r.tokenId, '1');
  const row = db.t('nft_tokens')[0];
  assert.equal(row.status, 'minted');
  assert.equal(row.token_id, '1');
  assert.equal(row.mint_tx, '0x' + 'ab'.repeat(32));
  assert.equal(row.chain_id, 31337);
  assert.equal(row.contract, '0x5fbdb2315678afecb367f032d93f642f64180aa3');
  // 006 (audit M2): riderRef je náhodný pre každý token a uloží sa k nemu, nie riders.rider_ref
  assert.match(row.rider_ref, /^0x[0-9a-f]{64}$/);
  assert.notEqual(row.rider_ref, '0x' + 'cd'.repeat(32));
  assert.deepEqual(chain.mintCalls[0], { registrationId: REG, eventId: 'ev-1', riderRef: row.rider_ref, category: 'open' });
});

test('ensureMinted: dva passy toho istého jazdca majú rôzny riderRef; opakovanie po chybe použije ten istý', async () => {
  const db = seed();
  db.t('registrations').push({ id: REG2, rider_id: RIDER, event_id: 'ev-2', category: 'open', status: 'checked_in', nft_consent: true });
  const chain = fakeChain({ failMint: 1 });
  const nft = make(db, chain);
  assert.equal((await nft.ensureMinted(REG)).status, 'failed');
  const firstRef = db.t('nft_tokens')[0].rider_ref;
  assert.equal((await nft.ensureMinted(REG)).status, 'minted');
  await nft.ensureMinted(REG2);
  const refs = chain.mintCalls.map(c => c.riderRef);
  assert.deepEqual(refs.slice(0, 2), [firstRef, firstRef], 'retry rovnaký riderRef');
  assert.notEqual(refs[2], firstRef);
});

test('ensureMinted dvakrát: druhé volanie chain vôbec nevolá', async () => {
  const db = seed();
  const chain = fakeChain();
  const nft = make(db, chain);
  await nft.ensureMinted(REG);
  const r2 = await nft.ensureMinted(REG);
  assert.equal(r2.status, 'minted');
  assert.equal(chain.mintCalls.length, 1);
  assert.equal(chain.writeCalls, 1);
});

test('ensureMinted: chyba mintu zapíše failed s chybou a nehádže', async () => {
  const db = seed();
  const chain = fakeChain({ failMint: 1 });
  const r = await make(db, chain).ensureMinted(REG);
  assert.equal(r.status, 'failed');
  assert.match(r.error, /RPC timeout/);
  const row = db.t('nft_tokens')[0];
  assert.equal(row.status, 'failed');
  assert.equal(row.attempts, 1);
  assert.match(row.error, /RPC timeout/);
});

test('ensureMinted: výpadok DB pri čítaní registrácie nehádže', async () => {
  const db = seed();
  db.failNext['select:registrations'] = new Error('db down');
  const r = await make(db, fakeChain()).ensureMinted(REG);
  assert.equal(r.status, 'failed');
});

test('ensureMinted: transakcia prešla, odpoveď nie; opakovanie nevyrobí druhý token', async () => {
  const db = seed();
  const chain = fakeChain({ failMint: 1, landThenFail: true });
  const nft = make(db, chain);
  assert.equal((await nft.ensureMinted(REG)).status, 'failed');
  const r = await nft.ensureMinted(REG);
  assert.equal(r.status, 'minted');
  assert.equal(r.tokenId, '1');
  assert.equal(chain.writeCalls, 1, 'na chain išiel len jeden mint');
  assert.equal(chain.state.byReg.size, 1);
  assert.equal(db.t('nft_tokens')[0].attempts, 0);
});

test('ensureMinted: ak už existuje výsledok, stav je result_pending', async () => {
  const db = seed();
  db.t('event_results').push({ event_id: 'ev-1', category: 'open', registration_id: REG, rider_name: 'x', place: 2, points: 80 });
  const r = await make(db, fakeChain()).ensureMinted(REG);
  assert.equal(r.status, 'result_pending');
});

test('pushResults: setResult pre každý token result_pending eventu', async () => {
  const db = new FakeDb({
    nft_tokens: [
      { registration_id: REG, token_id: '1', status: 'result_pending', chain_id: 31337, contract: 'x' },
      { registration_id: REG2, token_id: '2', status: 'result_pending', chain_id: 31337, contract: 'x' },
    ],
    event_results: [
      { event_id: 'ev-1', category: 'open', registration_id: REG, rider_name: 'A', place: 1, points: 100 },
      { event_id: 'ev-1', category: 'open', registration_id: REG2, rider_name: 'B', place: 3, points: 60 },
      { event_id: 'ev-1', category: 'open', registration_id: null, rider_name: 'C', place: 4, points: 60 },
    ],
  });
  const chain = fakeChain();
  const r = await make(db, chain).pushResults('ev-1');
  assert.deepEqual(r, { updated: 2, failed: 0 });
  assert.deepEqual(chain.resultCalls.sort((a, b) => a.tokenId.localeCompare(b.tokenId)), [
    { tokenId: '1', placement: 1, points: 100 },
    { tokenId: '2', placement: 3, points: 60 },
  ]);
  assert.ok(db.t('nft_tokens').every(t => t.status === 'result_set' && t.result_tx));
});

test('pushResults: chyba setResult zapíše failed, ostatné prejdú', async () => {
  const db = new FakeDb({
    nft_tokens: [
      { registration_id: REG, token_id: '1', status: 'result_pending' },
      { registration_id: REG2, token_id: '2', status: 'result_pending' },
    ],
    event_results: [
      { event_id: 'ev-1', registration_id: REG, place: 1, points: 100 },
      { event_id: 'ev-1', registration_id: REG2, place: 2, points: 80 },
    ],
  });
  const r = await make(db, fakeChain({ failResult: 1 })).pushResults('ev-1');
  assert.deepEqual(r, { updated: 1, failed: 1 });
  assert.deepEqual(db.t('nft_tokens').map(t => t.status).sort(), ['failed', 'result_set']);
});

test('pushResults: token, ktorému zmizol výsledok, sa na chaine vynuluje (0, 0) a vráti do minted', async () => {
  const db = new FakeDb({
    registrations: [{ id: REG, rider_id: RIDER, event_id: 'ev-1', category: 'open', status: 'checked_in', nft_consent: true }],
    nft_tokens: [{ registration_id: REG, token_id: '7', status: 'result_pending' }],
    event_results: [],
  });
  const chain = fakeChain();
  const r = await make(db, chain).pushResults('ev-1');
  assert.deepEqual(r, { updated: 1, failed: 0 });
  assert.deepEqual(chain.resultCalls, [{ tokenId: '7', placement: 0, points: 0 }]);
  assert.equal(db.t('nft_tokens')[0].status, 'minted');
  assert.ok(db.t('nft_tokens')[0].result_tx);
});

test('pushResults: tokeny iného eventu sa nevynulujú', async () => {
  const db = new FakeDb({
    registrations: [{ id: REG2, rider_id: RIDER, event_id: 'ev-2', category: 'open', status: 'checked_in', nft_consent: true }],
    nft_tokens: [{ registration_id: REG2, token_id: '8', status: 'result_pending' }],
  });
  const chain = fakeChain();
  assert.deepEqual(await make(db, chain).pushResults('ev-1'), { updated: 0, failed: 0 });
  assert.equal(chain.resultCalls.length, 0);
});

test('retryAll: dorobí failed mint, zaseknutý pending a čakajúce výsledky', async () => {
  const db = seed();
  db.t('registrations').push({ id: REG2, rider_id: RIDER, event_id: 'ev-1', category: 'open', status: 'checked_in', nft_consent: true });
  db.t('nft_tokens').push(
    { registration_id: REG, status: 'failed', attempts: 2, token_id: null, updated_at: '2026-10-05T09:00:00Z' },
    { registration_id: REG2, status: 'pending', attempts: 1, token_id: null, updated_at: '2026-10-05T09:00:00Z' },
  );
  db.t('event_results').push({ event_id: 'ev-1', registration_id: REG2, place: 5, points: 40 });
  const chain = fakeChain();
  const out = await make(db, chain).retryAll();
  assert.deepEqual(out, { minted: 2, results: 1, failed: 0 });
  const byReg = Object.fromEntries(db.t('nft_tokens').map(t => [t.registration_id, t.status]));
  assert.deepEqual(byReg, { [REG]: 'minted', [REG2]: 'result_set' });
  assert.deepEqual(chain.resultCalls, [{ tokenId: '2', placement: 5, points: 40 }]);
});

test('retryAll: čerstvý pending (mint práve beží) sa nechá tak', async () => {
  const db = seed();
  db.t('nft_tokens').push({ registration_id: REG, status: 'pending', attempts: 1, token_id: null, updated_at: '2026-10-05T09:58:00Z' });
  const chain = fakeChain();
  await make(db, chain).retryAll();
  assert.equal(chain.mintCalls.length, 0);
});

test('retryAll: po MAX_ATTEMPTS sa už neskúša a preskočené riadky sa posúvajú', async () => {
  const db = seed({ nft_consent: false });
  db.t('nft_tokens').push({ registration_id: REG, status: 'failed', attempts: MAX_ATTEMPTS - 1, token_id: null, updated_at: '2026-10-05T09:00:00Z' });
  const chain = fakeChain();
  const nft = make(db, chain);
  await nft.retryAll();
  assert.equal(db.t('nft_tokens')[0].attempts, MAX_ATTEMPTS);
  assert.match(db.t('nft_tokens')[0].error, /no_consent/);
  await nft.retryAll();
  assert.equal(db.t('nft_tokens')[0].attempts, MAX_ATTEMPTS, 'nad limit sa už nevyberie');
  assert.equal(chain.mintCalls.length, 0);
});

test('retryAll: failed po zlyhanom setResult sa vráti do result_pending a dopíše', async () => {
  const db = seed();
  db.t('nft_tokens').push({ registration_id: REG, status: 'failed', attempts: 1, token_id: '1', updated_at: '2026-10-05T09:00:00Z' });
  db.t('event_results').push({ event_id: 'ev-1', registration_id: REG, place: 1, points: 100 });
  const chain = fakeChain();
  chain.state.byReg.set(REG, 1n);
  const out = await make(db, chain).retryAll();
  assert.equal(chain.writeCalls, 0, 'žiadny nový mint');
  assert.deepEqual(chain.resultCalls, [{ tokenId: '1', placement: 1, points: 100 }]);
  assert.equal(db.t('nft_tokens')[0].status, 'result_set');
  assert.deepEqual(out, { minted: 0, results: 1, failed: 0 });
});

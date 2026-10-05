// GET /api/nft/metadata/:id, GET /api/nft/image/:id, GET /api/cron/nft-retry.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHandler as metadataHandler } from '../../api/nft/metadata/[id].js';
import { createHandler as imageHandler } from '../../api/nft/image/[id].js';
import { createHandler as cronHandler } from '../../api/cron/nft-retry.js';
import { FakeDb, fakeChain, testEnv, silentLog, fixedNow, call } from './_support/fakes.js';

const CONTRACT = '0x5fbdb2315678afecb367f032d93f642f64180aa3';
const R1 = 'bbbbbbbb-0000-4000-8000-000000000001';
const G1 = 'aaaaaaaa-0000-4000-8000-000000000001';
const G2 = 'aaaaaaaa-0000-4000-8000-000000000002';
// rozlíšiteľné osobné údaje, ktoré sa nesmú objaviť v metadátach
const PII = { legal: 'Zuzana Tajomná', display: 'Zuzka Verejná', nick: 'ZuziNick', email: 'zuzana.tajna@example.sk', birth: '2001-02-03' };

function seed({ founder = true, eventId = 'bratislava-2026-05', status = 'result_set', result = true } = {}) {
  return new FakeDb({
    events: [
      { id: 'bratislava-2026-05', name: 'GOSko Bratislava', city: 'Bratislava', date: '2026-05-31', season: 2026, status: 'done' },
      { id: 'zilina-2026', name: 'GOSko Žilina', city: 'Žilina', date: null, season: 2026, status: 'done' },
    ],
    riders: [{ id: R1, rider_ref: '0x' + '1'.repeat(64), display_name: PII.display, nickname: PII.nick, public_name_mode: 'full', is_founder: founder }],
    rider_private: [{ rider_id: R1, legal_name: PII.legal, birth_date: PII.birth, email: PII.email }],
    registrations: [{ id: G1, rider_id: R1, event_id: eventId, category: 'open', status: 'checked_in', nft_consent: true }],
    nft_tokens: [{ registration_id: G1, chain_id: 31337, contract: CONTRACT, token_id: '12', status }],
    event_results: result ? [{ event_id: eventId, category: 'open', registration_id: G1, rider_name: PII.display, place: 1, points: 100 }] : [],
  });
}
const meta = (db, env = {}) => metadataHandler({ env: testEnv(env), db, log: silentLog });
const image = (db, env = {}) => imageHandler({ env: testEnv(env), db, log: silentLog });

/* ---------- metadata ---------- */
test('metadáta: ERC-721 JSON podľa kontraktu §5', async () => {
  const res = await call(meta(seed()), { url: '/api/nft/metadata/12', query: { id: '12' } });
  assert.equal(res.statusCode, 200, res.body);
  assert.match(res.headers['content-type'], /application\/json/);
  assert.match(res.headers['cache-control'], /public/);
  assert.deepEqual(res.json, {
    name: 'GOSko Pass #12 · GOSko Bratislava 2026',
    description: 'Záznam o účasti a výsledku v sérii Game of S.K.A.T.E. GOSko. Neprenosný.',
    image: 'https://gosko.test/api/nft/image/12',
    external_url: 'https://gosko.test/#/event/bratislava-2026-05',
    attributes: [
      { trait_type: 'Event', value: 'GOSko Bratislava' },
      { trait_type: 'Dátum', value: '2026-05-31' },
      { trait_type: 'Kategória', value: 'Open' },
      { trait_type: 'Umiestnenie', value: 1, display_type: 'number' },
      { trait_type: 'Body', value: 100, display_type: 'number' },
      { trait_type: 'Zakladateľ', value: 'Áno' },
    ],
  });
});

test('metadáta neobsahujú legal_name, email, birth_date, nickname ani display_name', async () => {
  const db = seed();
  const res = await call(meta(db), { query: { id: '12' } });
  for (const v of Object.values(PII)) assert.ok(!res.body.includes(v), `metadáta prezradili ${v}`);
  for (const k of ['legal_name', 'email', 'birth_date', 'nickname', 'display_name']) assert.ok(!res.body.includes(k), k);
  // a ani ich nečítajú z DB
  assert.equal(db.calls.filter(c => c.table === 'rider_private').length, 0);
  for (const c of db.calls.filter(c => c.table === 'riders')) assert.equal(c.opts.select, 'is_founder');
});

test('metadáta: bez výsledku chýba umiestnenie a body; zakladateľ len v zakladajúcom kole', async () => {
  const res = await call(meta(seed({ eventId: 'zilina-2026', result: false })), { query: { id: '12' } });
  const traits = res.json.attributes.map(a => a.trait_type);
  assert.deepEqual(traits, ['Event', 'Kategória']);
  assert.equal(res.json.name, 'GOSko Pass #12 · GOSko Žilina 2026');
  const nf = await call(meta(seed({ founder: false })), { query: { id: '12' } });
  assert.ok(!nf.json.attributes.some(a => a.trait_type === 'Zakladateľ'));
});

test('metadáta: neznámy, neplatný, nezmintovaný token, iný kontrakt alebo vypnuté NFT je 404', async () => {
  assert.equal((await call(meta(seed()), { query: { id: '13' } })).statusCode, 404);
  for (const id of ['0', '-1', 'abc', '1e3', '12.0', '99999999999999999999']) {
    const db = seed();
    assert.equal((await call(meta(db), { query: { id } })).statusCode, 404, id);
    assert.equal(db.calls.length, 0);
  }
  assert.equal((await call(meta(seed({ status: 'pending' })), { query: { id: '12' } })).statusCode, 404);
  assert.equal((await call(meta(seed({ status: 'revoked' })), { query: { id: '12' } })).statusCode, 404);
  assert.equal((await call(meta(seed(), { NFT_CONTRACT_ADDRESS: '0x' + '9'.repeat(40) }), { query: { id: '12' } })).statusCode, 404);
  assert.equal((await call(meta(seed(), { CHAIN_ID: 8453 }), { query: { id: '12' } })).statusCode, 404);
  assert.equal((await call(meta(seed(), { NFT_CONTRACT_ADDRESS: '' }), { query: { id: '12' } })).statusCode, 404);
});

test('metadáta: id z cesty bez req.query (čistý Node)', async () => {
  const res = await call(meta(seed()), { url: '/api/nft/metadata/12' });
  assert.equal(res.statusCode, 200);
});

/* ---------- image ---------- */
test('obrázok: SVG nálepka s mestom, kategóriou, miestom a pásom ZAKLADATEĽ', async () => {
  const res = await call(image(seed()), { query: { id: '12' } });
  assert.equal(res.statusCode, 200);
  assert.match(res.headers['content-type'], /^image\/svg\+xml/);
  assert.match(res.headers['content-security-policy'], /default-src 'none'/);
  assert.match(res.body, /^<\?xml[\s\S]*<svg [^>]*xmlns="http:\/\/www.w3.org\/2000\/svg"/);
  for (const s of ['BRATISLAVA', 'OPEN', '1.', '100 B', 'ZAKLADATEĽ', '#12', '#A01D21', '31. 5. 2026']) assert.ok(res.body.includes(s), s);
  for (const v of Object.values(PII)) assert.ok(!res.body.includes(v), v);
  assert.ok(!res.body.includes('<script'));
});

test('obrázok: bez výsledku ÚČASŤ, bez zakladateľa bez pásu, text sa escapuje', async () => {
  const db = seed({ founder: false, result: false });
  db.t('events')[0].city = 'Rača <&> "x"';
  const res = await call(image(db), { query: { id: '12' } });
  assert.ok(res.body.includes('ÚČASŤ'));
  assert.ok(!res.body.includes('ZAKLADATEĽ'));
  assert.ok(res.body.includes('RAČA &lt;&amp;&gt; &quot;X&quot;'));
});

test('obrázok: neznámy token je 404', async () => {
  assert.equal((await call(image(seed()), { query: { id: '77' } })).statusCode, 404);
});

/* ---------- cron ---------- */
const cron = (db, chain, env = {}) => cronHandler({ env: testEnv(env), db, chain, log: silentLog, now: fixedNow('2026-11-21T20:00:00Z') });

test('cron vyžaduje CRON_SECRET: bez hlavičky, zlý kľúč aj prázdny secret sú 401', async () => {
  const chain = fakeChain();
  const db = new FakeDb();
  assert.equal((await call(cron(db, chain), {})).statusCode, 401);
  assert.equal((await call(cron(db, chain), { headers: { authorization: 'Bearer zly' } })).statusCode, 401);
  assert.equal((await call(cron(db, chain, { CRON_SECRET: '' }), { headers: { authorization: 'Bearer ' } })).statusCode, 401);
  assert.equal((await call(cron(db, chain, { CRON_SECRET: '' }), { headers: { authorization: 'Bearer undefined' } })).statusCode, 401);
  assert.equal(db.calls.length, 0);
  assert.equal((await call(cron(db, chain), { method: 'POST', headers: { authorization: 'Bearer cron-secret' } })).statusCode, 405);
});

test('cron so správnym kľúčom dorobí failed mint a čakajúci výsledok', async () => {
  const db = new FakeDb({
    riders: [{ id: R1, rider_ref: '0x' + '1'.repeat(64), display_name: 'X' }],
    registrations: [
      { id: G1, rider_id: R1, event_id: 'ev', category: 'open', status: 'checked_in', nft_consent: true },
      { id: G2, rider_id: R1, event_id: 'ev2', category: 'open', status: 'checked_in', nft_consent: true },
    ],
    nft_tokens: [
      { registration_id: G1, chain_id: 31337, contract: CONTRACT, status: 'failed', attempts: 1, token_id: null, updated_at: '2026-11-21T19:00:00Z' },
      { registration_id: G2, chain_id: 31337, contract: CONTRACT, status: 'result_pending', attempts: 0, token_id: '5', updated_at: '2026-11-21T19:00:00Z' },
    ],
    event_results: [{ event_id: 'ev2', category: 'open', registration_id: G2, rider_name: 'X', place: 3, points: 60 }],
  });
  const chain = fakeChain();
  const res = await call(cron(db, chain), { headers: { authorization: 'Bearer cron-secret' } });
  assert.equal(res.statusCode, 200, res.body);
  assert.deepEqual(res.json, { ok: true, minted: 1, results: 1, failed: 0 });
  assert.equal(chain.writeCalls, 1);
  assert.deepEqual(chain.resultCalls, [{ tokenId: '5', placement: 3, points: 60 }]);
});

test('cron pri vypnutom NFT vráti nuly', async () => {
  const res = await call(cron(new FakeDb(), { enabled: false }), { headers: { authorization: 'Bearer cron-secret' } });
  assert.deepEqual(res.json, { ok: true, minted: 0, results: 0, failed: 0 });
});

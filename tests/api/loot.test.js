// Loot a GoskoLoot (Task 6): /api/admin/loot (admin zakladá drop), /api/game/loot-nft (mint so súhlasom,
// vypnutý bez LOOT_CONTRACT_ADDRESS), /api/nft/loot/:id (metadáta typu, bez osobných údajov).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHandler as adminLoot, parseDropInput } from '../../api/admin/loot.js';
import { createHandler as lootNft } from '../../api/game/loot-nft.js';
import { createHandler as lootMeta, LOOT_TYPES } from '../../api/nft/loot/[id].js';
import { readEnv, validateEnv } from '../../api/_lib/env.js';
import { DbError } from '../../api/_lib/db.js';
import { FakeDb, fakeAuth, fakeUserAuth, testEnv, silentLog, fixedNow, call, ADMIN_ID } from './_support/fakes.js';

const AUTH = { authorization: 'Bearer admin-jwt' };
const SPOT = '5a000000-0000-4000-8000-000000000001';
const DROP = 'd0000000-0000-4000-8000-000000000001';
const PLAYER = { id: 'aaaa0000-0000-4000-8000-000000000001', email: 'jano@example.sk' };
const CLAIM = 'cccc0000-0000-4000-8000-000000000001';
const LOOT_ADDR = '0xe7f1725e7734ce288f8367e1bb143e90bb3f0512';
const TIERS = [{ label: 'Top 3', up_to: 3, reward: 'Doska', code: 'TOP3' }, { label: 'Top 50', up_to: 50, reward: 'Zľava 10 %', code: 'TOP50', gear_id: 'ghost-drop' }];
const VALID = { spot_id: SPOT, title: 'Ghost drop', partner: 'Skateshop', starts_at: '2026-10-08T10:00:00Z', ends_at: '2026-10-09T10:00:00Z', nft_type: 1, tiers: TIERS };

/* ---------- /api/admin/loot ---------- */
function adminDb() {
  const db = new FakeDb();
  db.rpcs.admin_create_loot_drop = args => ({ id: DROP, capacity: args.p_tiers.at(-1).up_to });
  db.rpcs.admin_loot_drops = () => [{ id: DROP, title: 'Ghost drop', claimed: 2, tiers: [] }];
  db.rpcs.admin_set_loot_drop_active = ({ p_drop, p_active }) => ({ id: p_drop, active: p_active });
  return db;
}
const admin = db => adminLoot({ env: testEnv(), db, auth: fakeAuth(), log: silentLog, now: fixedNow('2026-10-08T12:00:00Z') });

test('admin/loot: bez admina 401/403, iné metódy 405', async () => {
  const h = admin(adminDb());
  assert.equal((await call(h, { method: 'GET' })).statusCode, 401);
  assert.equal((await call(h, { method: 'GET', headers: { authorization: 'Bearer user' } })).statusCode, 403);
  assert.equal((await call(h, { method: 'DELETE', headers: AUTH })).statusCode, 405);
});

test('admin/loot POST: drop s tiermi ide jedným RPC s adminom ako p_actor; kódy sa nevracajú', async () => {
  const db = adminDb();
  const res = await call(admin(db), { method: 'POST', headers: AUTH, body: VALID });
  assert.equal(res.statusCode, 201, res.body);
  assert.deepEqual(res.json, { ok: true, id: DROP, capacity: 50 });
  const [c] = db.callsOf('rpc', 'admin_create_loot_drop');
  assert.equal(c.args.p_actor, ADMIN_ID);
  assert.equal(c.args.p_spot, SPOT);
  assert.equal(c.args.p_nft_type, 1);
  assert.deepEqual(c.args.p_tiers.map(t => [t.label, t.up_to, t.code, t.gear_id ?? null]), [['Top 3', 3, 'TOP3', null], ['Top 50', 50, 'TOP50', 'ghost-drop']]);
  assert.ok(!res.body.includes('TOP3'));
});

test('admin/loot POST: zlé vstupy majú slovenské chyby po poliach a do DB nejdú', async () => {
  const db = adminDb();
  const bad = { ...VALID, spot_id: 'x', title: '', ends_at: '2026-10-01T00:00:00Z', nft_type: 9,
    tiers: [{ label: '', up_to: 5, code: 'A' }, { label: 'B', up_to: 2, code: '' }] };
  const res = await call(admin(db), { method: 'POST', headers: AUTH, body: bad });
  assert.equal(res.statusCode, 400);
  for (const k of ['spot_id', 'title', 'ends_at', 'nft_type', 'tiers.0.label', 'tiers.1.up_to', 'tiers.1.code']) assert.ok(res.json.errors[k], k);
  assert.equal(db.callsOf('rpc', 'admin_create_loot_drop').length, 0);
  assert.equal(parseDropInput({ ...VALID, tiers: [] }).errors.tiers, 'Pridaj aspoň jeden tier (najviac 10).');
});

test('admin/loot POST: SPOT_NOT_FOUND z DB je 404', async () => {
  const db = adminDb();
  db.failNext['rpc:admin_create_loot_drop'] = new DbError({ status: 400, code: 'P0001', message: 'SPOT_NOT_FOUND' });
  const res = await call(admin(db), { method: 'POST', headers: AUTH, body: VALID });
  assert.equal(res.statusCode, 404);
});

test('admin/loot GET zoznam, PATCH vypne drop', async () => {
  const db = adminDb();
  const list = await call(admin(db), { method: 'GET', headers: AUTH });
  assert.equal(list.statusCode, 200);
  assert.equal(list.json.drops[0].claimed, 2);
  const off = await call(admin(db), { method: 'PATCH', headers: AUTH, body: { id: DROP, active: false } });
  assert.equal(off.statusCode, 200, off.body);
  assert.deepEqual(db.callsOf('rpc', 'admin_set_loot_drop_active')[0].args, { p_actor: ADMIN_ID, p_drop: DROP, p_active: false });
  assert.equal((await call(admin(db), { method: 'PATCH', headers: AUTH, body: { id: 'x', active: 'no' } })).statusCode, 400);
});

/* ---------- /api/game/loot-nft ---------- */
function nftDb({ consent = true, nftType = 1, claim = true } = {}) {
  return new FakeDb({
    players: [{ id: PLAYER.id, rider_id: 'r1', username: 'jano', nft_consent_at: consent ? '2026-10-05T10:00:00Z' : null }],
    loot_drops: [{ id: DROP, spot_id: SPOT, title: 'Ghost drop', nft_type: nftType }],
    loot_claims: claim ? [{ id: CLAIM, drop_id: DROP, player_id: PLAYER.id, tier: 1, rank: 1 }] : [],
  });
}
function fakeLootChain({ fail = 0 } = {}) {
  const c = { enabled: true, address: LOOT_ADDR, mints: [], minted: new Set(), fail,
    async mintLoot({ claimId, tokenType }) {
      c.mints.push({ claimId, tokenType });
      if (c.minted.has(claimId)) return { txHash: null, existing: true };
      if (c.fail > 0) { c.fail -= 1; throw new Error('RPC timeout'); }
      c.minted.add(claimId);
      return { txHash: '0x' + 'ef'.repeat(32), existing: false };
    } };
  return c;
}
const nftHandler = (db, { chain = fakeLootChain(), env = {} } = {}) =>
  lootNft({ env: testEnv({ LOOT_CONTRACT_ADDRESS: LOOT_ADDR, ...env }), db, auth: fakeUserAuth({ 'jwt-jano': PLAYER }), lootChain: chain, log: silentLog, now: fixedNow() });
const mint = (h, body = { drop_id: DROP }) => call(h, { method: 'POST', headers: { authorization: 'Bearer jwt-jano', 'content-type': 'application/json' }, body });

test('loot-nft: bez LOOT_CONTRACT_ADDRESS je mint vypnutý a chain sa nevolá', async () => {
  const chain = fakeLootChain();
  const db = nftDb();
  const res = await call(lootNft({ env: testEnv({ LOOT_CONTRACT_ADDRESS: '' }), db, auth: fakeUserAuth({ 'jwt-jano': PLAYER }), log: silentLog }),
    { method: 'POST', headers: { authorization: 'Bearer jwt-jano' }, body: { drop_id: DROP } });
  assert.equal(res.statusCode, 200, res.body);
  assert.equal(res.json.status, 'disabled');
  assert.equal(chain.mints.length, 0);
  assert.equal(db.t('loot_nft').length, 0);
});

test('loot-nft: bez súhlasu s NFT sa nemintuje; drop bez NFT tiež nie; cudzí alebo chýbajúci claim 404', async () => {
  const chain = fakeLootChain();
  assert.equal((await mint(nftHandler(nftDb({ consent: false }), { chain }))).json.status, 'no_consent');
  assert.equal((await mint(nftHandler(nftDb({ nftType: null }), { chain }))).json.status, 'no_nft');
  assert.equal((await mint(nftHandler(nftDb({ claim: false }), { chain }))).statusCode, 404);
  assert.equal((await mint(nftHandler(nftDb(), { chain }), { drop_id: 'x' })).statusCode, 400);
  assert.equal(chain.mints.length, 0);
});

test('loot-nft: so súhlasom mint na custody, evidencia v loot_nft bez osobných údajov, opakovanie nemintuje znova', async () => {
  const chain = fakeLootChain();
  const db = nftDb();
  const h = nftHandler(db, { chain });
  const res = await mint(h);
  assert.equal(res.statusCode, 200, res.body);
  assert.equal(res.json.status, 'minted');
  assert.deepEqual(chain.mints, [{ claimId: CLAIM, tokenType: 1 }]);
  const [row] = db.t('loot_nft');
  assert.equal(row.claim_id, CLAIM);
  assert.equal(row.status, 'minted');
  assert.equal(row.contract, LOOT_ADDR);
  for (const k of Object.keys(row)) assert.ok(!['player_id', 'email', 'username'].includes(k), k);
  const again = await mint(h);
  assert.equal(again.json.status, 'minted');
  assert.equal(chain.mints.length, 1, 'hotový mint sa neopakuje');
});

test('loot-nft: chyba chainu sa zapíše ako failed, ďalší pokus prejde', async () => {
  const chain = fakeLootChain({ fail: 1 });
  const db = nftDb();
  const h = nftHandler(db, { chain });
  const first = await mint(h);
  assert.equal(first.statusCode, 200);
  assert.equal(first.json.status, 'failed');
  assert.equal(db.t('loot_nft')[0].status, 'failed');
  assert.equal(db.t('loot_nft')[0].attempts, 1);
  assert.equal((await mint(h)).json.status, 'minted');
  assert.equal(db.t('loot_nft')[0].attempts, 2);
});

test('env: LOOT_CONTRACT_ADDRESS musí byť adresa a potrebuje minter kľúč a RPC', () => {
  const env = readEnv({ SUPABASE_URL: 'http://x', SUPABASE_SERVICE_ROLE_KEY: 'k', LOOT_CONTRACT_ADDRESS: 'zle' });
  assert.ok(validateEnv(env).some(p => /LOOT_CONTRACT_ADDRESS/.test(p)));
  assert.equal(readEnv({}).LOOT_CONTRACT_ADDRESS, '');
});

/* ---------- /api/nft/loot/:id ---------- */
const meta = () => lootMeta({ env: testEnv(), log: silentLog });

test('nft/loot: metadáta typov 1 až 5 (desiatkovo aj ERC-1155 hex {id}), bez osobných údajov, neznámy 404', async () => {
  assert.equal(Object.keys(LOOT_TYPES).length, 5);
  const res = await call(meta(), { method: 'GET', url: '/api/nft/loot/1', query: { id: '1' } });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json.name, 'Ghost drop');
  assert.match(res.json.image, /^https:\/\/gosko\.test\//);
  assert.ok(res.json.attributes.some(a => a.trait_type === 'Neprenosné' && a.value === 'Áno'));
  assert.equal(res.headers['access-control-allow-origin'], '*');
  const hex = await call(meta(), { method: 'GET', query: { id: '0000000000000000000000000000000000000000000000000000000000000005' } });
  assert.equal(hex.json.name, 'Partner stamp');
  for (const id of ['0', '6', 'abc', '-1', '1.5']) assert.equal((await call(meta(), { method: 'GET', query: { id } })).statusCode, 404, id);
  for (const t of Object.values(LOOT_TYPES)) assert.ok(!/@|meno|rider/i.test(JSON.stringify(t)));
});

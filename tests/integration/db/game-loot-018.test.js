// Migrácia 018: loot drop od admina, loadout (katalóg gearu, štartovná nálepka), súhlas s NFT, evidencia mintu (Task 6).
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { startStack, stopStack, rest, sql, sqlRows, seedUsers, ADMIN_ID } from '../../helpers/stack.js';
import { DENIED, lit } from './_fixtures.js';
import { createPlayer, createSpot, rpc, insertCheckIn, SPOT } from './_game.js';

const svc = (fn, body) => rest(`/rpc/${fn}`, { method: 'POST', as: 'service_role', body });
const TIERS = [
  { label: 'Top 3', up_to: 3, reward: 'Doska od partnera', code: 'TOP3-XYZ', gear_id: 'skull-king' },
  { label: 'Top 5', up_to: 5, reward: 'Zľava 20 %', code: 'TOP5-ABC' },
];
async function createDrop(spot, over = {}) {
  const res = await svc('admin_create_loot_drop', {
    p_actor: ADMIN_ID, p_spot: spot, p_title: 'Ghost drop', p_description: 'Prvý drop', p_partner: 'Test shop',
    p_starts: new Date(Date.now() - 3600_000).toISOString(), p_ends: new Date(Date.now() + 86400_000).toISOString(),
    p_nft_type: 1, p_tiers: TIERS, ...over,
  });
  return res;
}
const embed = (player, spot) => rpc('add_clip', player, { p_spot: spot, p_kind: 'embed', p_embed_url: 'https://youtu.be/dQw4w9WgXcQ' });
const checkIn = (player, spot) => rpc('check_in', player, { p_spot: spot, p_lat: SPOT.lat, p_lng: SPOT.lng });

before(async () => {
  await startStack();
  seedUsers();
});

after(stopStack);

describe('admin creates a loot drop', () => {
  test('only service_role (API /api/admin/loot) can create drops; nobody reads codes back', async () => {
    const spot = createSpot();
    for (const [as, sub] of [['anon'], ['authenticated', createPlayer().id], ['admin']]) {
      const res = await rest('/rpc/admin_create_loot_drop', { method: 'POST', as, sub, body: { p_actor: ADMIN_ID, p_spot: spot, p_title: 'x', p_tiers: TIERS } });
      assert.ok(DENIED.includes(res.status), `${as}: ${res.status}`);
    }
    const res = await createDrop(spot);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const id = res.body.id;
    const pub = (await rest(`/loot_public?id=eq.${id}`, { as: 'anon' })).body[0];
    assert.equal(pub.capacity, 5);
    assert.equal(pub.remaining, 5);
    assert.deepEqual(pub.tiers.map(t => [t.label, t.up_to, t.gear_id]), [['Top 3', 3, 'skull-king'], ['Top 5', 5, null]]);
    assert.ok(!JSON.stringify(pub).includes('TOP3-XYZ'));
    assert.equal(sql(`select nft_type from public.loot_drops where id = ${lit(id)}`), '1');
    assert.equal(sql(`select count(*) from public.loot_drop_secrets where drop_id = ${lit(id)}`), '2');
    assert.equal(sql(`select actor from public.audit_log where action = 'loot.create' and entity_id = ${lit(id)}`), ADMIN_ID);
    const list = await svc('admin_loot_drops', {});
    assert.equal(list.status, 200, JSON.stringify(list.body));
    const row = list.body.find(d => d.id === id);
    assert.equal(row.claimed, 0);
    assert.ok(!JSON.stringify(list.body).includes('TOP3-XYZ'), 'admin list without codes');
  });

  test('bad input: unknown spot, unsorted or empty tiers, missing code, unknown gear, end before start', async () => {
    const spot = createSpot();
    assert.equal((await createDrop(randomUUID())).body.message, 'SPOT_NOT_FOUND');
    const bad = [
      { p_tiers: [] },
      { p_tiers: [{ label: 'A', up_to: 5, code: 'A' }, { label: 'B', up_to: 3, code: 'B' }] },
      { p_tiers: [{ label: 'A', up_to: 3, code: '' }] },
      { p_tiers: [{ label: 'A', up_to: 3, code: 'A', gear_id: 'nie-je' }] },
      { p_tiers: Array.from({ length: 11 }, (_, i) => ({ label: `T${i}`, up_to: i + 1, code: `C${i}` })) },
      { p_tiers: [{ label: 'A', up_to: 0, code: 'A' }] },
      { p_ends: new Date(Date.now() - 7200_000).toISOString() },
      { p_title: '' },
      { p_nft_type: 0 },
    ];
    for (const over of bad) {
      const res = await createDrop(spot, over);
      assert.equal(res.status, 400, JSON.stringify(over));
      assert.equal(res.body.message, 'BAD_INPUT', JSON.stringify(over));
    }
    assert.equal(sql(`select count(*) from public.loot_drops where spot_id = ${lit(spot)}`), '0', 'nothing half-written');
  });

  test('deactivated drop disappears from the map and cannot be claimed', async () => {
    const spot = createSpot();
    const id = (await createDrop(spot)).body.id;
    assert.equal((await rest(`/spot_summary?id=eq.${spot}`)).body[0].loot_active, true);
    assert.equal((await svc('admin_set_loot_drop_active', { p_actor: ADMIN_ID, p_drop: id, p_active: false })).status, 200);
    assert.equal((await rest(`/loot_public?id=eq.${id}`)).body.length, 0);
    assert.equal((await rest(`/spot_summary?id=eq.${spot}`)).body[0].loot_active, false);
    const p = createPlayer();
    insertCheckIn({ player: p, spot, startedMinAgo: 5 });
    assert.equal((await rpc('claim_loot', p, { p_drop: id })).body.message, 'DROP_INACTIVE');
  });
});

describe('claim: check-in -> verified clip -> code', () => {
  test('the full path through the real RPCs, the tier gear lands in the loadout, then DROP_EMPTY', async () => {
    const spot = createSpot();
    const id = (await createDrop(spot, { p_tiers: [{ label: 'Jediný', up_to: 1, reward: 'Nálepka', code: 'ONE-1', gear_id: 'ghost-drop' }] })).body.id;
    const p = createPlayer();
    assert.equal((await rpc('claim_loot', p, { p_drop: id })).body.message, 'NEED_CHECKIN');
    assert.equal((await checkIn(p, spot)).status, 200);
    assert.equal((await rpc('claim_loot', p, { p_drop: id })).body.message, 'NEED_CLIP_ON_SPOT');
    assert.equal((await embed(p, spot)).body.verified, true);
    const res = await rpc('claim_loot', p, { p_drop: id });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.reward_code, 'ONE-1');
    assert.equal(res.body.gear_id, 'ghost-drop');
    assert.equal((await rpc('claim_loot', p, { p_drop: id })).body.rank, 1, 'same player, same claim');
    const gear = await rest('/unlocked_gear?select=gear_id,source', { as: 'authenticated', sub: p.id });
    assert.ok(gear.body.some(g => g.gear_id === 'ghost-drop' && g.source === 'loot'));

    const late = createPlayer();
    await checkIn(late, spot);
    await embed(late, spot);
    assert.equal((await rpc('claim_loot', late, { p_drop: id })).body.message, 'DROP_EMPTY');

    const mine = await rpc('my_loot', p);
    assert.equal(mine.status, 200, JSON.stringify(mine.body));
    assert.equal(mine.body.length, 1);
    assert.match(mine.body[0].claim_id, /^[0-9a-f-]{36}$/);
    assert.equal(mine.body[0].nft_type, 1);
    assert.equal(mine.body[0].nft_status, null);
    assert.equal(mine.body[0].gear_id, 'ghost-drop');
  });
});

describe('loadout: gear catalog and starter sticker', () => {
  test('catalog has the game stickers with unlock hints; every player has the starter sticker', async () => {
    const cat = await rest('/gear?select=id,kind,how_to_unlock&order=id', { as: 'anon' });
    const ids = cat.body.map(g => g.id);
    for (const id of ['gosko-ghost', 'ghost-drop', 'skull-king', 'spray-tag']) assert.ok(ids.includes(id), id);
    assert.ok(cat.body.every(g => g.how_to_unlock), 'every sticker says how to get it');
    const p = createPlayer();
    const gear = await rest('/unlocked_gear?select=gear_id,source', { as: 'authenticated', sub: p.id });
    assert.deepEqual(gear.body, [{ gear_id: 'gosko-ghost', source: 'starter' }]);
  });

  test('board_config keeps only a look and up to 8 owned stickers (set_loadout)', async () => {
    const p = createPlayer();
    const ok = await rpc('set_loadout', p, { p_config: { deck: 'ghosts', grip: 'red', wheels: 'black', trucks: 'red', stickers: ['gosko-ghost'] } });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.deepEqual((await rpc('game_me', p)).body.board_config, { deck: 'ghosts', grip: 'red', wheels: 'black', trucks: 'red', stickers: ['gosko-ghost'] });
    const locked = await rpc('set_loadout', p, { p_config: { stickers: ['skull-king'] } });
    assert.equal(locked.body.message, 'GEAR_LOCKED');
    const junk = await rpc('set_loadout', p, { p_config: { deck: 'x'.repeat(40), stickers: Array(9).fill('gosko-ghost') } });
    assert.equal(junk.body.message, 'BAD_INPUT');
  });
});

describe('NFT consent and mint records', () => {
  test('16+ turns NFT consent on and off; U16 cannot give it himself', async () => {
    const adult = createPlayer();
    assert.equal((await rpc('game_me', adult)).body.nft_consent, false);
    assert.equal((await rpc('set_nft_consent', adult, { p_on: true })).status, 200);
    assert.equal((await rpc('game_me', adult)).body.nft_consent, true);
    assert.equal((await rpc('set_nft_consent', adult, { p_on: false })).status, 200);
    assert.equal((await rpc('game_me', adult)).body.nft_consent, false);
    const kid = createPlayer({ age: 14, guardian: true });
    assert.equal((await rpc('set_nft_consent', kid, { p_on: true })).body.message, 'NEED_GUARDIAN');
    assert.equal((await rpc('set_nft_consent', kid, { p_on: false })).status, 200, 'withdrawing is always allowed');
  });

  test('loot_nft is service_role only', async () => {
    for (const [as, sub] of [['anon'], ['authenticated', createPlayer().id], ['admin']]) {
      const res = await rest('/loot_nft?select=*', { as, sub });
      assert.ok(DENIED.includes(res.status), `${as}: ${res.status}`);
    }
    assert.equal((await rest('/loot_nft?select=*', { as: 'service_role' })).status, 200);
    assert.deepEqual(sqlRows(`select column_name from information_schema.columns where table_schema = 'public' and table_name = 'loot_nft' and column_name in ('player_id','email','username')`), []);
  });
});

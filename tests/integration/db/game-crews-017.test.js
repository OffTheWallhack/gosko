// Migrácia 017: stránka crew v hre (Task 5). my_crew, náhľad pozvánky, nový kód, súbežné pripojenie.
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startStack, stopStack, rest, sql } from '../../helpers/stack.js';
import { DENIED } from './_fixtures.js';
import { createPlayer, createSpot, rpc, makeCrew, insertCheckIn } from './_game.js';

const code = async player => (await rpc('get_invite_code', player)).body;
const join = (player, c) => rpc('join_crew', player, { p_code: c });

before(async () => {
  await startStack();
});

after(stopStack);

describe('my_crew', () => {
  test('null without a crew; a member sees name, role, members, invite code, 30-day points and rank', async () => {
    const owner = createPlayer({ username: 'sef_rr' });
    assert.equal((await rpc('my_crew', owner)).body, null);
    const crew = await makeCrew(owner, { name: 'Ružinov Rats', tag: 'RRX' });
    const m = createPlayer({ username: 'clen_rr' });
    assert.equal((await join(m, await code(owner))).status, 200);
    const spot = createSpot();
    insertCheckIn({ player: m, spot, crew, startedMinAgo: 60, endedMinAgo: 0 });
    const res = await rpc('my_crew', m);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const c = res.body;
    assert.equal(c.id, crew);
    assert.equal(c.name, 'Ružinov Rats');
    assert.equal(c.tag, 'RRX');
    assert.equal(c.role, 'member');
    assert.equal(c.max, 10);
    assert.match(c.invite_code, /^[A-Z0-9]{8}$/);
    assert.equal(c.points, 60);
    assert.ok(Number.isInteger(c.rank) && c.rank >= 1);
    assert.deepEqual(c.members.map(x => [x.username, x.role]), [['sef_rr', 'owner'], ['clen_rr', 'member']]);
    assert.equal(c.members[0].player_id, owner.id, 'owner needs player ids to kick');
    for (const x of c.members) assert.deepEqual(Object.keys(x).sort(), ['joined_at', 'player_id', 'role', 'username']);
  });

  test('U16 without consent still sees his crew (read only)', async () => {
    const kid = createPlayer({ age: 13 });
    assert.equal((await rpc('my_crew', kid)).status, 200);
  });
});

describe('invite preview and new code', () => {
  test('crew_preview shows the crew for a valid code, BAD_CODE otherwise, never to anon', async () => {
    const owner = createPlayer();
    await makeCrew(owner, { name: 'Náhľad Crew', tag: 'NHL' });
    const c = await code(owner);
    const res = await rpc('crew_preview', createPlayer(), { p_code: c.toLowerCase() });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.deepEqual({ ...res.body, id: undefined }, { id: undefined, name: 'Náhľad Crew', tag: 'NHL', color: '#ff3366', members: 1, max: 10, full: false });
    assert.equal((await rpc('crew_preview', createPlayer(), { p_code: 'ZZZZ2222' })).body.message, 'BAD_CODE');
    const anon = await rest('/rpc/crew_preview', { method: 'POST', as: 'anon', body: { p_code: c } });
    assert.ok(DENIED.includes(anon.status), `${anon.status}`);
  });

  test('rotate_invite_code: only the owner, the old code stops working', async () => {
    const owner = createPlayer();
    await makeCrew(owner);
    const old = await code(owner);
    const m = createPlayer();
    await join(m, old);
    assert.equal((await rpc('rotate_invite_code', m)).body.message, 'FORBIDDEN');
    const res = await rpc('rotate_invite_code', owner);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.match(res.body, /^[A-Z0-9]{8}$/);
    assert.notEqual(res.body, old);
    assert.equal((await join(createPlayer(), old)).body.message, 'BAD_CODE');
    assert.equal((await join(createPlayer(), res.body)).status, 200);
  });

  test('full crew: preview says full, concurrent joins never exceed 10 members', async () => {
    const owner = createPlayer();
    const crew = await makeCrew(owner);
    const c = await code(owner);
    for (let i = 0; i < 7; i++) assert.equal((await join(createPlayer(), c)).status, 200);
    const results = await Promise.all(Array.from({ length: 6 }, () => join(createPlayer(), c)));
    assert.equal(results.filter(r => r.status === 200).length, 2);
    assert.deepEqual([...new Set(results.filter(r => r.status !== 200).map(r => r.body.message))], ['CREW_FULL']);
    assert.equal(sql(`select count(*) from public.crew_members where crew_id = '${crew}'`), '10');
    assert.equal((await rpc('crew_preview', createPlayer(), { p_code: c })).body.full, true);
  });
});

describe('spot turf on the spot card', () => {
  test('spot_crew_scores lists crews on a spot ordered by points (e.g. RR leads 145 : 90)', async () => {
    const a = createPlayer();
    const b = createPlayer();
    const ca = await makeCrew(a, { tag: 'TFA' });
    const cb = await makeCrew(b, { tag: 'TFB' });
    const spot = createSpot();
    insertCheckIn({ player: a, spot, crew: ca, startedMinAgo: 145, endedMinAgo: 0 });   // max 120
    insertCheckIn({ player: a, spot, crew: ca, startedMinAgo: 25, endedMinAgo: 0 });
    insertCheckIn({ player: b, spot, crew: cb, startedMinAgo: 90, endedMinAgo: 0 });
    const res = await rest(`/spot_crew_scores?spot_id=eq.${spot}&order=points.desc`, { as: 'anon' });
    assert.deepEqual(res.body.map(r => [r.tag, r.points]), [['TFA', 145], ['TFB', 90]]);
  });
});

// Migrácia 011: crews, pozývacie kódy, skóre spotov, kontrola spotu, leaderboard (Task 1).
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startStack, stopStack, rest, sql } from '../../helpers/stack.js';
import { DENIED } from './_fixtures.js';
import { createPlayer, createSpot, rpc, makeCrew, insertCheckIn, insertClip } from './_game.js';

const code = async player => (await rpc('get_invite_code', player)).body;
const join = (player, c) => rpc('join_crew', player, { p_code: c });
const score = async (spot, crew) => {
  const res = await rest(`/spot_crew_scores?spot_id=eq.${spot}&crew_id=eq.${crew}`, { as: 'anon' });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return res.body[0] ? Number(res.body[0].points) : 0;
};
const control = async spot => (await rest(`/spot_control?spot_id=eq.${spot}`, { as: 'anon' })).body[0] ?? null;

before(async () => {
  await startStack();
});

after(stopStack);

describe('crews and invite codes', () => {
  test('create_crew makes the creator the owner; tag is 2–4 chars', async () => {
    const owner = createPlayer();
    const crew = await makeCrew(owner, { name: 'Ružinov Rats', tag: 'RR' });
    assert.equal(sql(`select role from public.crew_members where player_id = '${owner.id}' and crew_id = '${crew}'`), 'owner');
    const bad = await rpc('create_crew', createPlayer(), { p_name: 'Zlý tag', p_tag: 'TOOLONG', p_color: '#000000' });
    assert.equal(bad.status, 400);
  });

  test('only members read the invite code; the crews table is not readable directly', async () => {
    const owner = createPlayer();
    const crew = await makeCrew(owner);
    const c = await code(owner);
    assert.match(c, /^[A-Z0-9]{8}$/);
    const stranger = await rpc('get_invite_code', createPlayer());
    assert.equal(stranger.body.message, 'FORBIDDEN');
    for (const as of ['anon', 'authenticated']) {
      const res = await rest('/crews?select=invite_code', { as, sub: as === 'authenticated' ? owner.id : undefined });
      assert.ok(DENIED.includes(res.status), `${as}: ${res.status}`);
    }
    const pub = await rest(`/crews_public?id=eq.${crew}`, { as: 'anon' });
    assert.equal(pub.status, 200);
    assert.equal(pub.body.length, 1);
    assert.ok(!('invite_code' in pub.body[0]));
    assert.equal(pub.body[0].members, 1);
  });

  test('wrong code is BAD_CODE; member of another crew gets ALREADY_IN_CREW', async () => {
    const a = createPlayer();
    await makeCrew(a);
    const b = createPlayer();
    await makeCrew(b);
    assert.equal((await join(createPlayer(), 'NOPE1234')).body.message, 'BAD_CODE');
    const res = await join(b, await code(a));
    assert.equal(res.status, 400);
    assert.equal(res.body.message, 'ALREADY_IN_CREW');
    assert.equal((await rpc('create_crew', a, { p_name: 'Druhá', p_tag: 'DR', p_color: '#112233' })).body.message, 'ALREADY_IN_CREW');
  });

  test('the 11th member gets CREW_FULL', async () => {
    const owner = createPlayer();
    const crew = await makeCrew(owner);
    const c = await code(owner);
    for (let i = 0; i < 9; i++) {
      const res = await join(createPlayer(), c);
      assert.equal(res.status, 200, `${i}: ${JSON.stringify(res.body)}`);
    }
    assert.equal(sql(`select count(*) from public.crew_members where crew_id = '${crew}'`), '10');
    const eleventh = await join(createPlayer(), c);
    assert.equal(eleventh.status, 400);
    assert.equal(eleventh.body.message, 'CREW_FULL');
  });

  test('leave_crew: owner leaving hands the crew over, the last one out deletes it', async () => {
    const owner = createPlayer();
    const crew = await makeCrew(owner);
    const m = createPlayer();
    assert.equal((await join(m, await code(owner))).status, 200);
    assert.equal((await rpc('leave_crew', owner)).status, 200);
    assert.equal(sql(`select role from public.crew_members where player_id = '${m.id}'`), 'owner');
    assert.equal((await rpc('leave_crew', m)).status, 200);
    assert.equal(sql(`select count(*) from public.crews where id = '${crew}'`), '0');
    assert.equal((await rpc('leave_crew', m)).body.message, 'FORBIDDEN');
  });

  test('owner can kick a member, which also changes the invite code', async () => {
    const owner = createPlayer();
    await makeCrew(owner);
    const before = await code(owner);
    const m = createPlayer();
    await join(m, before);
    assert.equal((await rpc('kick_crew_member', m, { p_player: owner.id })).body.message, 'FORBIDDEN');
    const res = await rpc('kick_crew_member', owner, { p_player: m.id });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(sql(`select count(*) from public.crew_members where player_id = '${m.id}'`), '0');
    assert.notEqual(await code(owner), before);
    assert.equal((await join(m, before)).body.message, 'BAD_CODE');
  });

  test('U16 without guardian consent cannot create or join a crew', async () => {
    const owner = createPlayer();
    await makeCrew(owner);
    const kid = createPlayer({ age: 13 });
    assert.equal((await join(kid, await code(owner))).body.message, 'NEED_GUARDIAN');
    assert.equal((await rpc('create_crew', kid, { p_name: 'Decká', p_tag: 'DK', p_color: '#123456' })).body.message, 'NEED_GUARDIAN');
  });

  test('crew_roster shows usernames only to members of the same crew', async () => {
    const owner = createPlayer({ username: 'sef_crew' });
    const crew = await makeCrew(owner);
    const mine = await rest('/crew_roster?select=username,role', { as: 'authenticated', sub: owner.id });
    assert.equal(mine.status, 200, JSON.stringify(mine.body));
    assert.deepEqual(mine.body, [{ username: 'sef_crew', role: 'owner' }]);
    const other = await rest(`/crew_roster?crew_id=eq.${crew}`, { as: 'authenticated', sub: createPlayer().id });
    assert.deepEqual(other.body, []);
  });
});

describe('scoring and spot control', () => {
  test('a crew with 99 points does not control the spot, with 100 it does', async () => {
    const p = createPlayer();
    const crew = await makeCrew(p);
    const spot = createSpot();
    insertCheckIn({ player: p, spot, crew, startedMinAgo: 99, endedMinAgo: 0 });
    assert.equal(await score(spot, crew), 99);
    assert.equal(await control(spot), null);
    insertCheckIn({ player: p, spot, crew, startedMinAgo: 1, endedMinAgo: 0 });
    assert.equal(await score(spot, crew), 100);
    const c = await control(spot);
    assert.equal(c.crew_id, crew);
    assert.equal(Number(c.points), 100);
  });

  test('a check-in counts at most 120 minutes; older than 30 days does not count', async () => {
    const p = createPlayer();
    const crew = await makeCrew(p);
    const spot = createSpot();
    insertCheckIn({ player: p, spot, crew, startedMinAgo: 500, endedMinAgo: 10 });
    insertCheckIn({ player: p, spot, crew, startedMinAgo: 31 * 24 * 60, endedMinAgo: 31 * 24 * 60 - 60 });
    assert.equal(await score(spot, crew), 120);
  });

  test('verified clip = 50 × (1 + 0.1 × likes), likes capped at 20; unverified clip = 0', async () => {
    const p = createPlayer();
    const crew = await makeCrew(p);
    const spot = createSpot();
    insertClip({ player: p, spot, crew, likes: 3 });
    assert.equal(await score(spot, crew), 65);
    insertClip({ player: p, spot, crew, verified: false, likes: 2 });
    assert.equal(await score(spot, crew), 65);
    insertClip({ player: p, spot, crew, likes: 25 });
    assert.equal(await score(spot, crew), 65 + 150);
  });

  test('points stay with the crew the player was in at check-in time', async () => {
    const firstOwner = createPlayer();
    const first = await makeCrew(firstOwner);
    const p = createPlayer();
    assert.equal((await join(p, await code(firstOwner))).status, 200);
    const spot = createSpot();
    insertCheckIn({ player: p, spot, crew: null, startedMinAgo: 50, endedMinAgo: 0 }); // crew doplní snímka
    assert.equal(await score(spot, first), 50);
    assert.equal((await rpc('leave_crew', p)).status, 200);
    const owner = createPlayer();
    const second = await makeCrew(owner);
    assert.equal((await join(p, await code(owner))).status, 200);
    assert.equal(await score(spot, first), 50);
    assert.equal(await score(spot, second), 0);
  });

  test('check_in snapshots the current crew', async () => {
    const p = createPlayer();
    const crew = await makeCrew(p);
    const spot = createSpot();
    const res = await rpc('check_in', p, { p_spot: spot, p_lat: 48.15, p_lng: 17.15 });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(sql(`select crew_id from public.check_ins where id = '${res.body.id}'`), crew);
  });

  test('crew_leaderboard is ordered by 30-day points and counts controlled spots', async () => {
    const a = createPlayer();
    const b = createPlayer();
    const ca = await makeCrew(a, { tag: 'LBA' });
    const cb = await makeCrew(b, { tag: 'LBB' });
    const s1 = createSpot();
    const s2 = createSpot();
    insertClip({ player: a, spot: s1, crew: ca, likes: 0 });       // 50
    insertCheckIn({ player: a, spot: s1, crew: ca, startedMinAgo: 120, endedMinAgo: 0 }); // 120
    insertCheckIn({ player: b, spot: s2, crew: cb, startedMinAgo: 110, endedMinAgo: 0 }); // 110
    const res = await rest(`/crew_leaderboard?crew_id=in.(${ca},${cb})&order=rank`, { as: 'anon' });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.deepEqual(res.body.map(r => [r.tag, Number(r.points), Number(r.spots_controlled)]), [['LBA', 170, 1], ['LBB', 110, 1]]);
    assert.ok(res.body[0].rank < res.body[1].rank);
  });
});

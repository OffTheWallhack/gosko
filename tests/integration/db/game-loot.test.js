// Migrácia 012: gear, loot dropy s tiermi, tajné kódy odmien, nálepka za event (Task 1).
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { startStack, stopStack, rest, sql, sqlRows } from '../../helpers/stack.js';
import { DENIED, lit } from './_fixtures.js';
import { createPlayer, createSpot, createRegistration, rpc, insertCheckIn, insertClip } from './_game.js';

/** Loot drop na spote s tiermi [{up_to, code}], aktívny od teraz na deň. */
function createDrop({ spot, tiers = [{ up_to: 3, code: 'TOP3-SECRET' }, { up_to: 5, code: 'TOP5-SECRET' }], starts = "now() - interval '1 hour'", ends = "now() + interval '1 day'", active = true }) {
  const id = randomUUID();
  sql(`insert into public.loot_drops (id, spot_id, title, partner, starts_at, ends_at, active)
         values (${lit(id)}, ${lit(spot)}, 'Ghost drop', 'Test shop', ${starts}, ${ends}, ${active});
       ${tiers.map((t, i) => `insert into public.loot_tiers (drop_id, tier, label, up_to, reward) values (${lit(id)}, ${i + 1}, ${lit(`Top ${t.up_to}`)}, ${t.up_to}, 'Zľava');
         insert into public.loot_drop_secrets (drop_id, tier, reward_code) values (${lit(id)}, ${i + 1}, ${lit(t.code)});`).join('\n')}`);
  return id;
}

/** Hráč, ktorý splnil podmienky: aktívny check-in a overený klip na spote. */
function eligible(spot) {
  const p = createPlayer();
  insertCheckIn({ player: p, spot, startedMinAgo: 10 });
  insertClip({ player: p, spot, minAgo: 5 });
  return p;
}

const claim = (player, drop) => rpc('claim_loot', player, { p_drop: drop });

before(async () => {
  await startStack();
});

after(stopStack);

describe('loot secrets', () => {
  test('reward codes are never readable, not even by the admin role or through loot_public', async () => {
    const spot = createSpot();
    const drop = createDrop({ spot });
    const p = createPlayer();
    for (const [as, sub] of [['anon'], ['authenticated', p.id], ['admin']]) {
      const res = await rest('/loot_drop_secrets?select=*', { as, sub });
      assert.ok(DENIED.includes(res.status), `${as}: ${res.status}`);
    }
    const pub = await rest(`/loot_public?id=eq.${drop}`, { as: 'anon' });
    assert.equal(pub.status, 200, JSON.stringify(pub.body));
    assert.equal(pub.body.length, 1);
    assert.ok(!JSON.stringify(pub.body).includes('SECRET'));
    assert.equal(pub.body[0].remaining, 5);
  });

  test('claims of other players are not readable', async () => {
    const spot = createSpot();
    const drop = createDrop({ spot });
    const winner = eligible(spot);
    assert.equal((await claim(winner, drop)).status, 200);
    const other = await rest('/loot_claims?select=*', { as: 'authenticated', sub: createPlayer().id });
    assert.equal(other.status, 200);
    assert.deepEqual(other.body.filter(r => r.drop_id === drop), []);
    const mine = await rpc('my_loot', createPlayer());
    assert.deepEqual(mine.body, []);
  });
});

describe('claim_loot', () => {
  test('without an active check-in NEED_CHECKIN; with a check-in but no verified clip NEED_CLIP_ON_SPOT', async () => {
    const spot = createSpot();
    const drop = createDrop({ spot });
    const p = createPlayer();
    assert.equal((await claim(p, drop)).body.message, 'NEED_CHECKIN');
    insertCheckIn({ player: p, spot, startedMinAgo: 5 });
    assert.equal((await claim(p, drop)).body.message, 'NEED_CLIP_ON_SPOT');
    insertClip({ player: p, spot: createSpot(), minAgo: 1 });          // klip na inom spote
    insertClip({ player: p, spot, verified: false, minAgo: 1 });        // neoverený klip
    insertClip({ player: p, spot, minAgo: 120 });                       // pred začiatkom dropu
    assert.equal((await claim(p, drop)).body.message, 'NEED_CLIP_ON_SPOT');
  });

  test('check-in on another spot is not enough', async () => {
    const spot = createSpot();
    const drop = createDrop({ spot });
    const p = createPlayer();
    insertCheckIn({ player: p, spot: createSpot(), startedMinAgo: 5 });
    insertClip({ player: p, spot, minAgo: 1 });
    assert.equal((await claim(p, drop)).body.message, 'NEED_CHECKIN');
  });

  test('the full path check-in → verified clip → code, tiers by order, then DROP_EMPTY', async () => {
    const spot = createSpot();
    const drop = createDrop({ spot });
    const results = [];
    for (let i = 0; i < 5; i++) {
      const res = await claim(eligible(spot), drop);
      assert.equal(res.status, 200, `${i}: ${JSON.stringify(res.body)}`);
      results.push(res.body);
    }
    assert.deepEqual(results.map(r => [r.rank, r.tier, r.reward_code]), [
      [1, 1, 'TOP3-SECRET'], [2, 1, 'TOP3-SECRET'], [3, 1, 'TOP3-SECRET'], [4, 2, 'TOP5-SECRET'], [5, 2, 'TOP5-SECRET'],
    ]);
    const sixth = await claim(eligible(spot), drop);
    assert.equal(sixth.status, 400);
    assert.equal(sixth.body.message, 'DROP_EMPTY');
    assert.equal((await rest(`/loot_public?id=eq.${drop}`)).body[0].remaining, 0);
  });

  test('the same player does not get a drop twice', async () => {
    const spot = createSpot();
    const drop = createDrop({ spot });
    const p = eligible(spot);
    const first = await claim(p, drop);
    const second = await claim(p, drop);
    assert.equal(second.status, 200, JSON.stringify(second.body));
    assert.equal(second.body.rank, first.body.rank);
    assert.equal(sql(`select count(*) from public.loot_claims where drop_id = '${drop}'`), '1');
  });

  test('inactive, expired or not yet started drop is DROP_INACTIVE', async () => {
    const spot = createSpot();
    const p = eligible(spot);
    for (const opts of [{ active: false }, { ends: "now() - interval '1 minute'" }, { starts: "now() + interval '1 hour'" }]) {
      const res = await claim(p, createDrop({ spot, ...opts }));
      assert.equal(res.body.message, 'DROP_INACTIVE', JSON.stringify(opts));
    }
    assert.equal((await claim(p, randomUUID())).body.message, 'DROP_INACTIVE');
  });

  test('U16 without guardian consent gets NEED_GUARDIAN', async () => {
    const spot = createSpot();
    const drop = createDrop({ spot });
    const kid = createPlayer({ age: 14 });
    insertCheckIn({ player: kid, spot, startedMinAgo: 5 });
    insertClip({ player: kid, spot, minAgo: 1 });
    assert.equal((await claim(kid, drop)).body.message, 'NEED_GUARDIAN');
  });

  test('my_loot lists own claims with codes; a tier with gear unlocks it', async () => {
    const spot = createSpot();
    const gear = `sticker-${randomUUID().slice(0, 8)}`;
    sql(`insert into public.gear (id, name, kind) values ('${gear}', 'Ghost nálepka', 'sticker')`);
    const drop = createDrop({ spot, tiers: [{ up_to: 10, code: 'GEAR-SECRET' }] });
    sql(`update public.loot_tiers set gear_id = '${gear}' where drop_id = '${drop}'`);
    const p = eligible(spot);
    assert.equal((await claim(p, drop)).status, 200);
    const mine = await rpc('my_loot', p);
    assert.equal(mine.status, 200, JSON.stringify(mine.body));
    assert.equal(mine.body.length, 1);
    assert.equal(mine.body[0].drop_id, drop);
    assert.equal(mine.body[0].reward_code, 'GEAR-SECRET');
    const unlocked = await rest('/unlocked_gear?select=gear_id,source&source=neq.starter', { as: 'authenticated', sub: p.id });
    assert.deepEqual(unlocked.body, [{ gear_id: gear, source: 'loot' }]);
  });
});

describe('gear', () => {
  test('gear catalogue is public; unlocked gear is visible only to its owner and never written directly', async () => {
    const gear = `g-${randomUUID().slice(0, 8)}`;
    sql(`insert into public.gear (id, name, kind, how_to_unlock) values ('${gear}', 'Test gear', 'sticker', 'Príď na event')`);
    const pub = await rest(`/gear?id=eq.${gear}`, { as: 'anon' });
    assert.equal(pub.status, 200, JSON.stringify(pub.body));
    assert.equal(pub.body.length, 1);
    const p = createPlayer();
    const write = await rest('/unlocked_gear', { method: 'POST', as: 'authenticated', sub: p.id, body: { player_id: p.id, gear_id: gear, source: 'admin' } });
    assert.ok(DENIED.includes(write.status), `${write.status}`);
    sql(`insert into public.unlocked_gear (player_id, gear_id, source) values ('${p.id}', '${gear}', 'admin')`);
    const other = await rest(`/unlocked_gear?player_id=eq.${p.id}`, { as: 'authenticated', sub: createPlayer().id });
    assert.deepEqual(other.body, []);
    const anon = await rest('/unlocked_gear', { as: 'anon' });
    assert.ok(DENIED.includes(anon.status), `${anon.status}`);
  });
});

describe('grant_event_gear', () => {
  function eventWithGear() {
    const event = `ev-${randomUUID().slice(0, 8)}`;
    const gear = `nalepka-${event}`;
    sql(`insert into public.events (id, name, status, registration_open) values ('${event}', 'GOSko Test', 'open', true);
         insert into public.gear (id, name, kind, event_id) values ('${gear}', 'Nálepka za event', 'sticker', '${event}');`);
    return { event, gear };
  }
  // štartovnú nálepku (018) má každý hráč, tu ide len o nálepky za event
  const gearOf = player => sqlRows(`select gear_id, source from public.unlocked_gear where player_id = '${player.id}' and source <> 'starter' order by gear_id`);

  test('check-in at a GOSko event grants the event sticker to the linked player', () => {
    const { event, gear } = eventWithGear();
    const p = createPlayer();
    const reg = createRegistration({ rider_id: p.rider_id, event_id: event, status: 'confirmed' });
    assert.deepEqual(gearOf(p), []);
    sql(`update public.registrations set status = 'checked_in', checked_in_at = now() where id = '${reg}'`);
    assert.deepEqual(gearOf(p), [{ gear_id: gear, source: 'event' }]);
    sql(`update public.registrations set status = 'checked_in' where id = '${reg}'`); // opakovaný check-in nič nezdvojí
    assert.equal(gearOf(p).length, 1);
  });

  test('a player linked after the event check-in also gets the sticker; other events give nothing', () => {
    const { event, gear } = eventWithGear();
    eventWithGear();
    const rider = createPlayer(); // hráč s iným jazdcom, aby sme mali rider bez hráča:
    const lateRider = sqlRows(`select gen_random_uuid() as id`)[0].id;
    sql(`insert into public.riders (id, rider_ref, display_name) values ('${lateRider}', '0x${'cd'.repeat(32)}', 'Neskorý Hráč');
         insert into public.rider_private (rider_id, legal_name, birth_date, email) values ('${lateRider}', 'Neskorý Hráč', '2000-01-01', 'late@test.local');`);
    createRegistration({ rider_id: lateRider, event_id: event, status: 'checked_in' });
    const uid = randomUUID();
    sql(`insert into auth.users (id, email) values ('${uid}', 'late@test.local');
         insert into public.players (id, rider_id, username) values ('${uid}', '${lateRider}', 'neskory');`);
    assert.deepEqual(gearOf({ id: uid }), [{ gear_id: gear, source: 'event' }]);
    assert.deepEqual(gearOf(rider), []);
  });
});

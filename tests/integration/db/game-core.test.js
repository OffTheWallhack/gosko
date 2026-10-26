// Migrácia 010: hráči, spoty, check-iny, klipy, hlásenia, game_cfg (Task 1).
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { startStack, stopStack, rest, sql, sqlRows } from '../../helpers/stack.js';
import { DENIED } from './_fixtures.js';
import { SPOT, createPlayer, createSpot, createRegistration, north, rpc, insertCheckIn } from './_game.js';

const checkIn = (player, spot, at = SPOT) => rpc('check_in', player, { p_spot: spot, p_lat: at.lat, p_lng: at.lng });
const addClip = (player, spot) => rpc('add_clip', player, { p_spot: spot, p_kind: 'embed', p_embed_url: 'https://youtu.be/dQw4w9WgXcQ', p_trick: 'kickflip' });
const addSpot = (player, i = 0) => rpc('add_spot', player, {
  p_name: `Nový spot ${i}`, p_city: 'Bratislava', p_kind: 'street', p_lat: 48.14 + i / 1000, p_lng: 17.10, p_description: null,
});

before(async () => {
  await startStack();
});

after(stopStack);

describe('game_cfg', () => {
  test('anyone can read the game numbers', async () => {
    const res = await rest('/rpc/game_cfg', { method: 'POST', as: 'anon', body: {} });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.checkin_radius_m, 150);
    assert.equal(res.body.checkin_max_minutes, 120);
    assert.equal(res.body.points_per_minute, 1);
    assert.equal(res.body.clip_base_points, 50);
    assert.equal(res.body.clip_like_cap, 20);
    assert.equal(res.body.control_window_days, 30);
    assert.equal(res.body.control_min_points, 100);
    assert.equal(res.body.crew_max, 10);
    assert.equal(res.body.spots_per_day, 5);
    assert.equal(res.body.report_ttl_hours, 6);
    assert.equal(res.body.clip_verify_hours, 3);
  });
});

describe('check_in / check_out', () => {
  test('check-in 340 m from the spot returns TOO_FAR with the distance', async () => {
    const p = createPlayer();
    const spot = createSpot();
    const res = await checkIn(p, spot, north(340));
    assert.equal(res.status, 400, JSON.stringify(res.body));
    assert.equal(res.body.message, 'TOO_FAR');
    const d = JSON.parse(res.body.details);
    assert.ok(d.distance_m >= 335 && d.distance_m <= 345, res.body.details);
    assert.equal(d.max_m, 150);
    assert.equal(sql(`select count(*) from public.check_ins where player_id = '${p.id}'`), '0');
  });

  test('check-in 100 m away works and stores only the distance, not the position', async () => {
    const p = createPlayer();
    const spot = createSpot();
    const res = await checkIn(p, spot, north(100));
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.spot_id, spot);
    const cols = sqlRows(`select column_name from information_schema.columns where table_schema = 'public' and table_name = 'check_ins'`)
      .map(r => r.column_name);
    assert.ok(!cols.includes('lat') && !cols.includes('lng'), cols.join(','));
  });

  test('unknown or unapproved spot is SPOT_NOT_FOUND', async () => {
    const p = createPlayer();
    const res = await checkIn(p, createSpot({ approved: false }));
    assert.equal(res.body.message, 'SPOT_NOT_FOUND');
    assert.equal((await checkIn(p, randomUUID())).body.message, 'SPOT_NOT_FOUND');
  });

  test('a second check-in ends the first one; points are capped at 120 minutes', async () => {
    const p = createPlayer();
    const a = createSpot();
    const b = createSpot();
    const first = insertCheckIn({ player: p, spot: a, startedMinAgo: 200 });
    const res = await checkIn(p, b);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const rows = sqlRows(`select id, spot_id, ended_at is not null as ended, public.checkin_points(started_at, ended_at) as points
                          from public.check_ins where player_id = '${p.id}' order by started_at`);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].id, first);
    assert.equal(rows[0].ended, true);
    assert.equal(rows[0].points, 120);
    assert.equal(rows[1].ended, false);
    assert.equal(sql(`select count(*) from public.check_ins where player_id = '${p.id}' and ended_at is null`), '1');
  });

  test('check_out ends the active check-in and returns the points; without one it is NEED_CHECKIN', async () => {
    const p = createPlayer();
    const spot = createSpot();
    insertCheckIn({ player: p, spot, startedMinAgo: 30 });
    const res = await rpc('check_out', p);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.points, 30);
    const again = await rpc('check_out', p);
    assert.equal(again.status, 400);
    assert.equal(again.body.message, 'NEED_CHECKIN');
  });

  test('a logged-in user without a player profile gets FORBIDDEN; anon cannot call at all', async () => {
    const res = await checkIn(randomUUID(), createSpot());
    assert.equal(res.body.message, 'FORBIDDEN');
    const anon = await rest('/rpc/check_in', { method: 'POST', as: 'anon', body: { p_spot: createSpot(), p_lat: SPOT.lat, p_lng: SPOT.lng } });
    assert.ok(DENIED.includes(anon.status), `${anon.status}`);
  });
});

describe('check-ins are private', () => {
  test('the author sees own check-ins, another player sees none, anon is denied', async () => {
    const a = createPlayer();
    const b = createPlayer();
    const spot = createSpot();
    assert.equal((await checkIn(a, spot)).status, 200);
    const own = await rest('/check_ins?select=id,spot_id', { as: 'authenticated', sub: a.id });
    assert.equal(own.status, 200, JSON.stringify(own.body));
    assert.equal(own.body.length, 1);
    const other = await rest(`/check_ins?select=id&player_id=eq.${a.id}`, { as: 'authenticated', sub: b.id });
    assert.equal(other.status, 200);
    assert.deepEqual(other.body, []);
    const anon = await rest('/check_ins?select=id', { as: 'anon' });
    assert.ok(DENIED.includes(anon.status), `${anon.status}`);
  });

  test('nobody writes check-ins, clips or likes directly', async () => {
    const p = createPlayer();
    const spot = createSpot();
    const ci = await rest('/check_ins', { method: 'POST', as: 'authenticated', sub: p.id, body: { player_id: p.id, spot_id: spot, distance_m: 0 } });
    assert.ok(DENIED.includes(ci.status), `${ci.status}`);
    const clip = await rest('/clips', { method: 'POST', as: 'authenticated', sub: p.id,
      body: { player_id: p.id, spot_id: spot, media_url: 'https://x.y/z.mp4', media_kind: 'video', verified: true } });
    assert.ok(DENIED.includes(clip.status), `${clip.status}`);
    const like = await rest('/clip_likes', { method: 'POST', as: 'authenticated', sub: p.id, body: { clip_id: randomUUID(), player_id: p.id } });
    assert.ok(DENIED.includes(like.status), `${like.status}`);
  });
});

describe('spot_summary: only public counts', () => {
  test('shows how many people are on the spot, never who', async () => {
    const spot = createSpot({ name: 'Počítaný spot' });
    const a = createPlayer();
    const b = createPlayer();
    assert.equal((await checkIn(a, spot)).status, 200);
    assert.equal((await checkIn(b, spot)).status, 200);
    insertCheckIn({ player: createPlayer(), spot, startedMinAgo: 300 }); // starý, nikdy neukončený: už sa neráta
    const res = await rest(`/spot_summary?id=eq.${spot}`, { as: 'anon' });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.length, 1);
    assert.equal(res.body[0].people_now, 2);
    const keys = Object.keys(res.body[0]);
    for (const k of keys) assert.ok(!/player|user|email|username|rider/.test(k), `unexpected column ${k}`);
  });

  test('anon cannot read players, clips or ratings tables directly; nobody reads guardian tokens', async () => {
    const kid = createPlayer({ age: 13 });
    sql(`insert into public.player_guardian (player_id, guardian_email, token) values ('${kid.id}', 'rodic@test.local', gen_random_uuid())`);
    const own = await rest('/player_guardian?select=*', { as: 'authenticated', sub: kid.id });
    assert.ok(DENIED.includes(own.status), `player_guardian: ${own.status}`);
    for (const t of ['players', 'clips', 'clip_likes', 'spot_ratings', 'spot_reports', 'player_guardian']) {
      const res = await rest(`/${t}?select=*`, { as: 'anon' });
      assert.ok(DENIED.includes(res.status), `${t}: ${res.status}`);
    }
  });

  test('players_public has no personal data and hides U16 players without guardian consent', async () => {
    const adult = createPlayer({ username: 'dospely_hrac' });
    const kid = createPlayer({ age: 13, username: 'male_decko' });
    const res = await rest(`/players_public?id=in.(${adult.id},${kid.id})`, { as: 'anon' });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.deepEqual(res.body.map(r => r.username), ['dospely_hrac']);
    for (const k of Object.keys(res.body[0])) assert.ok(!/rider|city|birth|email|guardian|board/.test(k), `unexpected column ${k}`);
  });
});

describe('add_spot', () => {
  test('the 6th new spot in a day returns SPOT_LIMIT', async () => {
    const p = createPlayer();
    for (let i = 0; i < 5; i++) {
      const res = await addSpot(p, i);
      assert.equal(res.status, 200, `${i}: ${JSON.stringify(res.body)}`);
    }
    const sixth = await addSpot(p, 5);
    assert.equal(sixth.status, 400);
    assert.equal(sixth.body.message, 'SPOT_LIMIT');
    assert.equal(sql(`select count(*) from public.spots where user_id = '${p.id}'`), '5');
  });

  test('spots from yesterday do not count; a new spot is on the map at once', async () => {
    const p = createPlayer();
    for (let i = 0; i < 5; i++) assert.equal((await addSpot(p, i)).status, 200);
    sql(`update public.spots set created_at = now() - interval '25 hours' where user_id = '${p.id}'`);
    const res = await addSpot(p, 9);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const sum = await rest(`/spot_summary?id=eq.${res.body.id}`, { as: 'anon' });
    assert.equal(sum.body.length, 1);
  });
});

describe('U16 gating', () => {
  test('U16 without guardian consent cannot check in, post a clip, add a spot, report or rate', async () => {
    const kid = createPlayer({ age: 14 });
    const spot = createSpot();
    for (const res of [
      await checkIn(kid, spot),
      await addClip(kid, spot),
      await addSpot(kid),
      await rpc('report_spot', kid, { p_spot: spot, p_status: 'chill', p_bust: null }),
      await rpc('rate_spot', kid, { p_spot: spot, p_skulls: 3 }),
    ]) {
      assert.equal(res.status, 400, JSON.stringify(res.body));
      assert.equal(res.body.message, 'NEED_GUARDIAN');
    }
    assert.equal(sql(`select count(*) from public.check_ins where player_id = '${kid.id}'`), '0');
    assert.equal(sql(`select count(*) from public.clips where player_id = '${kid.id}'`), '0');
  });

  test('U16 can play after the guardian confirmed the game; 16+ needs nothing', async () => {
    const spot = createSpot();
    const gameOk = createPlayer({ age: 14, guardian: true });
    assert.equal((await checkIn(gameOk, spot)).status, 200);

    const sixteen = createPlayer({ age: 16 });
    assert.equal((await checkIn(sixteen, spot)).status, 200);
  });

  // 013: súhlas rodiča s eventom nepokrýva hru s polohou (rozhodnutie 5. 10. 2026)
  test('a guardian-confirmed event registration does not unlock the game', async () => {
    const spot = createSpot();
    const eventOnly = createPlayer({ age: 14, username: 'len_event' });
    createRegistration({ rider_id: eventOnly.rider_id, category: 'u16', status: 'confirmed', guardian_confirmed_at: '2026-09-01T10:00:00Z' });
    const res = await checkIn(eventOnly, spot);
    assert.equal(res.status, 400, JSON.stringify(res.body));
    assert.equal(res.body.message, 'NEED_GUARDIAN');
    const me = await rpc('game_me', eventOnly);
    assert.equal(me.body.can_write, false);
    assert.equal(me.body.needs_guardian, true);
    const pub = await rest(`/players_public?id=eq.${eventOnly.id}`, { as: 'anon' });
    assert.deepEqual(pub.body, []);
  });

  test('game_me tells the client whether the player can write', async () => {
    const kid = createPlayer({ age: 12 });
    const res = await rpc('game_me', kid);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.can_write, false);
    assert.equal(res.body.needs_guardian, true);
    assert.equal(res.body.username, kid.username);
    const adult = await rpc('game_me', createPlayer());
    assert.equal(adult.body.can_write, true);
  });

  test('confirm_player_guardian (service_role) unlocks the game; used or expired token is PT404', async () => {
    const kid = createPlayer({ age: 13 });
    const token = randomUUID();
    sql(`insert into public.player_guardian (player_id, guardian_email, token, token_expires_at)
         values ('${kid.id}', 'rodic@test.local', '${token}', now() + interval '7 days')`);
    const asUser = await rest('/rpc/confirm_player_guardian', { method: 'POST', as: 'authenticated', sub: kid.id, body: { p_token: token } });
    assert.ok(DENIED.includes(asUser.status), `${asUser.status}`);
    const ok = await rest('/rpc/confirm_player_guardian', { method: 'POST', as: 'service_role', body: { p_token: token } });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.equal((await checkIn(kid, createSpot())).status, 200);
    const again = await rest('/rpc/confirm_player_guardian', { method: 'POST', as: 'service_role', body: { p_token: token } });
    assert.equal(again.status, 404);

    const late = createPlayer({ age: 13 });
    const t2 = randomUUID();
    sql(`insert into public.player_guardian (player_id, guardian_email, token, token_expires_at)
         values ('${late.id}', 'rodic@test.local', '${t2}', now() - interval '1 minute')`);
    const expired = await rest('/rpc/confirm_player_guardian', { method: 'POST', as: 'service_role', body: { p_token: t2 } });
    assert.equal(expired.status, 404);
  });
});

describe('clips and likes', () => {
  test('a clip is verified only if the author was checked in on the spot within 3 hours', async () => {
    const p = createPlayer();
    const spot = createSpot();
    const cold = await addClip(p, spot);
    assert.equal(cold.status, 200, JSON.stringify(cold.body));
    assert.equal(cold.body.verified, false);

    insertCheckIn({ player: p, spot, startedMinAgo: 240, endedMinAgo: 200 });
    assert.equal((await addClip(p, spot)).body.verified, false);

    insertCheckIn({ player: p, spot, startedMinAgo: 100, endedMinAgo: 60 });
    assert.equal((await addClip(p, spot)).body.verified, true);
  });

  test('a clip link must be http(s) (016: only IG, TikTok, YouTube, game-clips.test.js)', async () => {
    const p = createPlayer();
    const res = await rpc('add_clip', p, { p_spot: createSpot(), p_kind: 'embed', p_embed_url: 'javascript:alert(1)', p_trick: null });
    assert.equal(res.status, 400);
    assert.equal(res.body.message, 'BAD_EMBED');
  });

  test('like once per player, not your own clip, unlike works', async () => {
    const author = createPlayer();
    const fan = createPlayer();
    const clip = (await addClip(author, createSpot())).body.id;
    assert.equal((await rpc('like_clip', fan, { p_clip: clip })).status, 200);
    assert.equal((await rpc('like_clip', fan, { p_clip: clip })).status, 200);
    assert.equal(sql(`select count(*) from public.clip_likes where clip_id = '${clip}'`), '1');
    const self = await rpc('like_clip', author, { p_clip: clip });
    assert.equal(self.body.message, 'FORBIDDEN');
    assert.equal((await rpc('unlike_clip', fan, { p_clip: clip })).status, 200);
    assert.equal(sql(`select count(*) from public.clip_likes where clip_id = '${clip}'`), '0');
  });

  test('clips_public shows likes and username but no hidden clips', async () => {
    const author = createPlayer({ username: 'klipar' });
    const spot = createSpot();
    const shown = (await addClip(author, spot)).body.id;
    const hidden = (await addClip(author, spot)).body.id;
    sql(`update public.clips set hidden = true where id = '${hidden}'`);
    const res = await rest(`/clips_public?spot_id=eq.${spot}`, { as: 'anon' });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.deepEqual(res.body.map(r => r.id), [shown]);
    assert.equal(res.body[0].username, 'klipar');
    assert.equal(res.body[0].likes, 0);
  });
});

describe('spot reports and ratings', () => {
  test('a report needs a check-in on the spot and is shown for 6 hours', async () => {
    const p = createPlayer();
    const spot = createSpot();
    const noCi = await rpc('report_spot', p, { p_spot: spot, p_status: 'mokre', p_bust: 'high' });
    assert.equal(noCi.body.message, 'NEED_CHECKIN');
    assert.equal((await checkIn(p, spot)).status, 200);
    const res = await rpc('report_spot', p, { p_spot: spot, p_status: 'mokre', p_bust: 'high' });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    let sum = (await rest(`/spot_summary?id=eq.${spot}`)).body[0];
    assert.equal(sum.status, 'mokre');
    assert.equal(sum.bust, 'high');
    sql(`update public.spot_reports set created_at = now() - interval '7 hours' where spot_id = '${spot}'`);
    sum = (await rest(`/spot_summary?id=eq.${spot}`)).body[0];
    assert.equal(sum.status, null);
    assert.equal(sum.bust, null);
  });

  test('bad status or bust value is rejected', async () => {
    const p = createPlayer();
    const spot = createSpot();
    await checkIn(p, spot);
    const res = await rpc('report_spot', p, { p_spot: spot, p_status: 'policia', p_bust: null });
    assert.equal(res.status, 400);
  });

  test('skulls 1–5, one rating per player (re-rating replaces), average in the summary', async () => {
    const a = createPlayer();
    const b = createPlayer();
    const spot = createSpot();
    assert.equal((await rpc('rate_spot', a, { p_spot: spot, p_skulls: 2 })).status, 200);
    assert.equal((await rpc('rate_spot', a, { p_spot: spot, p_skulls: 5 })).status, 200);
    assert.equal((await rpc('rate_spot', b, { p_spot: spot, p_skulls: 4 })).status, 200);
    assert.equal((await rpc('rate_spot', b, { p_spot: spot, p_skulls: 6 })).status, 400);
    const sum = (await rest(`/spot_summary?id=eq.${spot}`)).body[0];
    assert.equal(sum.ratings, 2);
    assert.equal(Number(sum.skulls), 4.5);
  });
});

describe('grants', () => {
  test('internal helpers are not callable by anon or authenticated', () => {
    for (const fn of ['public.game_can_write(uuid)', 'public.game_require_player(boolean)']) {
      for (const role of ['anon', 'authenticated']) {
        assert.equal(sql(`select has_function_privilege('${role}', '${fn}', 'EXECUTE')`), 'f', `${role} ${fn}`);
      }
    }
  });

  test('every SECURITY DEFINER game function has a fixed search_path', () => {
    const bad = sqlRows(`select p.proname from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prosecdef
                          and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')`);
    assert.deepEqual(bad, []);
  });
});

describe('seed spots_ba', () => {
  test('Bratislava starter spots are on the map and flagged for verification', async () => {
    const res = await rest('/spot_summary?select=name,needs_verification&needs_verification=is.true', { as: 'anon' });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.ok(res.body.length >= 10, `${res.body.length}`);
    assert.ok(res.body.some(r => r.name === 'Námestie slobody'));
    assert.equal(sql(`select count(*) from public.spots where id::text like '5b0a0000-%' and not needs_verification`), '0');
  });
});

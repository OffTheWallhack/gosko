// Migrácia 016: klipy a feed (Task 4). Súhlasy U16 (rodič + fotky a videá), úložisko `media`,
// odkazy IG/TikTok/YouTube, overený klip, limit, moderácia, verejný feed bez osobných údajov.
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { startStack, stopStack, rest, sql, sqlAs, seedUsers, ADMIN_ID, USER_ID as USER_NOT_PLAYER } from '../../helpers/stack.js';
import { EMBED_OK, EMBED_BAD } from '../../helpers/embed-cases.js';
import { DENIED, lit } from './_fixtures.js';
import { createPlayer, createSpot, rpc, insertCheckIn, makeCrew } from './_game.js';

const YT = 'https://youtu.be/dQw4w9WgXcQ';
const embed = (player, spot, url = YT, extra = {}) => rpc('add_clip', player, { p_spot: spot, p_kind: 'embed', p_embed_url: url, ...extra });

/** Súbor v buckete media (superuser, ako po nahratí cez Storage API). */
function putObject(player, { ext = 'mp4', size = 1_000_000, mime = 'video/mp4', folder } = {}) {
  const name = `${folder || player.id}/${randomUUID()}.${ext}`;
  sql(`insert into storage.objects (bucket_id, name, owner, metadata)
         values ('media', ${lit(name)}, ${lit(player.id)}, ${lit(JSON.stringify({ size, mimetype: mime }))}::jsonb)`);
  return name;
}
const video = (player, spot, path, duration = 30) => rpc('add_clip', player, { p_spot: spot, p_kind: 'video', p_media_path: path, p_duration_s: duration });

/** Nahratie ako hráč (RLS storage.objects). Vráti true/false. */
function uploadAs(sub, name, bucket = 'media') {
  try {
    sqlAs('authenticated', sub, `insert into storage.objects (bucket_id, name, owner) values (${lit(bucket)}, ${lit(name)}, ${lit(sub)})`);
    return true;
  } catch (err) {
    if (/row-level security/.test(err.message)) return false;
    throw err;
  }
}
const visibleTo = (role, sub, name) => sqlAs(role, sub, `select count(*) from storage.objects where bucket_id = 'media' and name = ${lit(name)}`).split('\n').at(-1) === '1';

function guardianToken(player) {
  const token = randomUUID();
  sql(`insert into public.player_guardian (player_id, guardian_email, token, token_expires_at)
       values (${lit(player.id)}, 'rodic@test.local', ${lit(token)}, now() + interval '7 days')
       on conflict (player_id) do update set token = excluded.token, token_expires_at = excluded.token_expires_at`);
  return token;
}
const confirm = (token, media) => rest('/rpc/confirm_player_guardian', { method: 'POST', as: 'service_role', body: { p_token: token, ...(media === undefined ? {} : { p_media: media }) } });

before(async () => {
  await startStack();
  seedUsers();
});

after(stopStack);

describe('U16: parent consent and photo/video consent', () => {
  test('U16 without any consent gets NEED_GUARDIAN', async () => {
    const kid = createPlayer({ age: 13 });
    const res = await embed(kid, createSpot());
    assert.equal(res.body.message, 'NEED_GUARDIAN');
  });

  test('U16 with game consent but without photo consent gets NEED_MEDIA_CONSENT and cannot upload', async () => {
    const kid = createPlayer({ age: 13 });
    assert.equal((await confirm(guardianToken(kid), false)).status, 200);
    const spot = createSpot();
    assert.equal((await rpc('check_in', kid, { p_spot: spot, p_lat: 48.15, p_lng: 17.15 })).status, 200, 'game consent unlocks check-in');
    const res = await embed(kid, spot);
    assert.equal(res.status, 400);
    assert.equal(res.body.message, 'NEED_MEDIA_CONSENT');
    assert.equal(uploadAs(kid.id, `${kid.id}/${randomUUID()}.mp4`), false);
    const me = await rpc('game_me', kid);
    assert.equal(me.body.can_write, true);
    assert.equal(me.body.can_publish, false);
  });

  test('parent confirming photos too unlocks clips; a second link can add photo consent later', async () => {
    const kid = createPlayer({ age: 12 });
    assert.equal((await confirm(guardianToken(kid))).status, 200, 'p_media is optional (default no photos)');
    assert.equal((await embed(kid, createSpot())).body.message, 'NEED_MEDIA_CONSENT');
    assert.equal((await confirm(guardianToken(kid), true)).status, 200);
    const ok = await embed(kid, createSpot());
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.equal(uploadAs(kid.id, `${kid.id}/${randomUUID()}.mp4`), true);
    assert.equal((await rpc('game_me', kid)).body.can_publish, true);
  });

  test('16+ publishes without extra consent; withdraw is for U16 and hides their clips at once', async () => {
    const adult = createPlayer();
    assert.equal((await rpc('game_me', adult)).body.can_publish, true);
    const kid = createPlayer({ age: 14 });
    await confirm(guardianToken(kid), true);
    const spot = createSpot();
    const clip = (await embed(kid, spot)).body.id;
    assert.equal((await rest(`/clips_public?id=eq.${clip}`)).body.length, 1);
    const w = await rpc('withdraw_media_consent', kid);
    assert.equal(w.status, 200, JSON.stringify(w.body));
    assert.equal((await rest(`/clips_public?id=eq.${clip}`)).body.length, 0);
    assert.equal((await embed(kid, spot)).body.message, 'NEED_MEDIA_CONSENT');
  });

  test('a player cannot grant photo consent to himself', async () => {
    const kid = createPlayer({ age: 13 });
    const res = await rest(`/players?id=eq.${kid.id}`, { method: 'PATCH', as: 'authenticated', sub: kid.id, body: { media_consent_at: new Date().toISOString() } });
    assert.ok(res.status >= 400, `${res.status}`);
    assert.equal(sql(`select media_consent_at is null from public.players where id = ${lit(kid.id)}`), 't');
  });
});

describe('embed links', () => {
  test('only IG, TikTok and YouTube links, normalized', async () => {
    const p = createPlayer();
    const spot = createSpot();
    for (const [input, out] of EMBED_OK) {
      const res = await embed(p, spot, input);
      assert.equal(res.status, 200, `${input}: ${JSON.stringify(res.body)}`);
      const row = (await rest(`/clips_public?id=eq.${res.body.id}`)).body[0];
      assert.equal(row.embed_url, out, input);
    }
    sql(`delete from public.clips where player_id = ${lit(p.id)}`);   // limit 20 za deň
    for (const input of EMBED_BAD) {
      const res = await embed(p, spot, input);
      assert.equal(res.status, 400, input);
      assert.equal(res.body.message, 'BAD_EMBED', input);
    }
    assert.equal(sql(`select public.game_embed_url('https://youtu.be/dQw4w9WgXcQ')`), 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  });
});

describe('uploaded media', () => {
  test('the file must be the player\'s own, exist in the media bucket and be used once', async () => {
    const p = createPlayer();
    const other = createPlayer();
    const spot = createSpot();
    assert.equal((await video(p, spot, `${p.id}/${randomUUID()}.mp4`)).body.message, 'BAD_MEDIA', 'missing file');
    assert.equal((await video(p, spot, putObject(other))).body.message, 'BAD_MEDIA', 'someone else\'s file');
    assert.equal((await video(p, spot, '../x.mp4')).body.message, 'BAD_MEDIA');
    const path = putObject(p);
    const ok = await video(p, spot, path);
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.equal((await video(p, spot, path)).body.message, 'BAD_MEDIA', 'same file twice');
    const photo = await rpc('add_clip', p, { p_spot: spot, p_kind: 'photo', p_media_path: putObject(p, { ext: 'jpg', mime: 'image/jpeg', size: 300_000 }) });
    assert.equal(photo.status, 200, JSON.stringify(photo.body));
    const wrongKind = await rpc('add_clip', p, { p_spot: spot, p_kind: 'photo', p_media_path: putObject(p) });
    assert.equal(wrongKind.body.message, 'BAD_MEDIA', 'video file as a photo');
  });

  test('a video over 60 s or over 50 MB is rejected; a photo over 10 MB too', async () => {
    const p = createPlayer();
    const spot = createSpot();
    assert.equal((await video(p, spot, putObject(p), 61)).body.message, 'VIDEO_TOO_LONG');
    assert.equal((await video(p, spot, putObject(p), null)).body.message, 'BAD_INPUT');
    assert.equal((await video(p, spot, putObject(p, { size: 50 * 1024 * 1024 + 1 }))).body.message, 'MEDIA_TOO_BIG');
    const bigPhoto = putObject(p, { ext: 'jpg', mime: 'image/jpeg', size: 10 * 1024 * 1024 + 1 });
    assert.equal((await rpc('add_clip', p, { p_spot: spot, p_kind: 'photo', p_media_path: bigPhoto })).body.message, 'MEDIA_TOO_BIG');
    assert.equal((await video(p, spot, putObject(p), 60)).status, 200);
  });

  test('max 20 clips in 24 hours', async () => {
    const p = createPlayer();
    const spot = createSpot();
    sql(`insert into public.clips (player_id, spot_id, media_url, media_kind)
         select ${lit(p.id)}, ${lit(spot)}, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'embed' from generate_series(1, 20)`);
    assert.equal((await embed(p, spot)).body.message, 'CLIP_LIMIT');
    sql(`update public.clips set created_at = now() - interval '25 hours' where player_id = ${lit(p.id)}`);
    assert.equal((await embed(p, spot)).status, 200);
  });
});

describe('verified clip', () => {
  test('verified only after a check-in on that spot within 3 hours', async () => {
    const p = createPlayer();
    const spot = createSpot();
    assert.equal((await embed(p, spot)).body.verified, false, 'no check-in');
    insertCheckIn({ player: p, spot: createSpot(), startedMinAgo: 30 });
    assert.equal((await embed(p, spot)).body.verified, false, 'check-in on another spot');
    insertCheckIn({ player: p, spot, startedMinAgo: 240, endedMinAgo: 200 });
    assert.equal((await embed(p, spot)).body.verified, false, 'check-in ended 200 min ago');
    insertCheckIn({ player: p, spot, startedMinAgo: 100, endedMinAgo: 60 });
    assert.equal((await embed(p, spot)).body.verified, true, 'check-in ended 60 min ago');
  });
});

describe('storage bucket media', () => {
  test('private bucket; upload only into your own folder with the right file name; Robo\'s bucket clips is untouched', async () => {
    assert.equal(sql(`select public from storage.buckets where id = 'media'`), 'f');
    assert.equal(sql(`select file_size_limit from storage.buckets where id = 'media'`), String(50 * 1024 * 1024));
    assert.equal(sql(`select file_size_limit from storage.buckets where id = 'clips'`), String(30 * 1024 * 1024));
    const p = createPlayer();
    const other = createPlayer();
    assert.equal(uploadAs(p.id, `${p.id}/${randomUUID()}.webm`), true);
    assert.equal(uploadAs(p.id, `${other.id}/${randomUUID()}.mp4`), false, 'foreign folder');
    assert.equal(uploadAs(p.id, `${p.id}/clip.mp4`), false, 'name must be a uuid');
    assert.equal(uploadAs(p.id, `${p.id}/${randomUUID()}.html`), false, 'extension');
    assert.equal(uploadAs(p.id, `${p.id}/sub/${randomUUID()}.mp4`), false, 'no subfolders');
    assert.equal(uploadAs(USER_NOT_PLAYER, `${USER_NOT_PLAYER}/${randomUUID()}.mp4`), false, 'not a player');
    // Robova politika pre bucket clips ostáva: vlastný priečinok, bez herných pravidiel
    assert.equal(uploadAs(p.id, `${p.id}/trik.mp4`, 'clips'), true);
  });

  test('a file is readable by anyone only while its clip is public; the owner and the admin always', async () => {
    const p = createPlayer();
    const spot = createSpot();
    const loose = putObject(p);
    const path = putObject(p);
    const clip = (await video(p, spot, path)).body.id;
    const stranger = createPlayer();
    assert.equal(visibleTo('anon', null, path), true);
    assert.equal(visibleTo('anon', null, loose), false, 'file without a clip');
    assert.equal(visibleTo('authenticated', stranger.id, loose), false);
    assert.equal(visibleTo('authenticated', p.id, loose), true, 'owner');
    sql(`update public.clips set hidden = true where id = ${lit(clip)}`);
    assert.equal(visibleTo('anon', null, path), false, 'hidden clip');
    assert.equal(visibleTo('authenticated', ADMIN_ID, path), true, 'admin');
  });

  test('a player deletes only files in his own folder', () => {
    const p = createPlayer();
    const other = createPlayer();
    const mine = putObject(p);
    const theirs = putObject(other);
    sqlAs('authenticated', p.id, `delete from storage.objects where bucket_id = 'media' and name in (${lit(mine)}, ${lit(theirs)})`);
    assert.equal(sql(`select count(*) from storage.objects where name = ${lit(mine)}`), '0');
    assert.equal(sql(`select count(*) from storage.objects where name = ${lit(theirs)}`), '1');
  });
});

describe('feed and moderation', () => {
  test('clips_public: newest first, spot name, crew tag, likes; no player id, no hidden clips', async () => {
    const p = createPlayer({ username: 'feedjazdec' });
    const crew = await makeCrew(p, { tag: 'FDJ' });
    const spot = createSpot({ name: 'Feed spot' });
    const first = (await embed(p, spot)).body.id;
    const second = (await video(p, spot, putObject(p), 12)).body.id;
    const hidden = (await embed(p, spot)).body.id;
    sql(`update public.clips set hidden = true where id = ${lit(hidden)}`);
    const res = await rest(`/clips_public?spot_id=eq.${spot}&order=created_at.desc,id.desc`, { as: 'anon' });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.deepEqual(res.body.map(r => r.id).sort(), [first, second].sort());
    const row = res.body.find(r => r.id === second);
    assert.equal(row.username, 'feedjazdec');
    assert.equal(row.spot_name, 'Feed spot');
    assert.equal(row.crew_tag, 'FDJ');
    assert.equal(row.crew_id, crew);
    assert.equal(row.media_kind, 'video');
    assert.equal(row.duration_s, 12);
    assert.equal(row.likes, 0);
    for (const k of ['player_id', 'hidden', 'rider_id']) assert.ok(!(k in row), k);
  });

  test('admin hides and unhides a clip; a player cannot hide someone else\'s', async () => {
    const author = createPlayer();
    const troll = createPlayer();
    const clip = (await embed(author, createSpot())).body.id;
    const t = await rest(`/clips?id=eq.${clip}`, { method: 'PATCH', as: 'authenticated', sub: troll.id, body: { hidden: true }, headers: { Prefer: 'return=representation' } });
    assert.ok(t.status === 200 ? t.body.length === 0 : DENIED.includes(t.status), `${t.status} ${JSON.stringify(t.body)}`);
    assert.equal(sql(`select hidden from public.clips where id = ${lit(clip)}`), 'f');
    const a = await rest(`/clips?id=eq.${clip}`, { method: 'PATCH', as: 'admin', body: { hidden: true }, headers: { Prefer: 'return=representation' } });
    assert.equal(a.status, 200, JSON.stringify(a.body));
    assert.equal(a.body.length, 1);
    assert.equal((await rest(`/clips_public?id=eq.${clip}`)).body.length, 0);
    const adminList = await rest(`/clips?select=id,hidden,player:players!clips_player_id_fkey(username)&id=eq.${clip}`, { as: 'admin' });
    assert.equal(adminList.status, 200, JSON.stringify(adminList.body));
    assert.equal(adminList.body[0].player.username, author.username);
    assert.equal(adminList.body[0].hidden, true);
    assert.equal((await rest(`/clips?id=eq.${clip}`, { method: 'PATCH', as: 'admin', body: { hidden: false } })).status, 204);
    assert.equal((await rest(`/clips_public?id=eq.${clip}`)).body.length, 1);
  });

  test('delete_clip: the author removes his clip and gets the file path back; others get FORBIDDEN', async () => {
    const p = createPlayer();
    const path = putObject(p);
    const clip = (await video(p, createSpot(), path)).body.id;
    assert.equal((await rpc('delete_clip', createPlayer(), { p_clip: clip })).body.message, 'FORBIDDEN');
    const res = await rpc('delete_clip', p, { p_clip: clip });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.media_path, path);
    assert.equal(sql(`select count(*) from public.clips where id = ${lit(clip)}`), '0');
  });

  test('the old add_clip signature (without the photo consent check) is gone', async () => {
    const old = await rpc('add_clip', createPlayer(), { p_spot: createSpot(), p_media_url: 'https://example.com/v.mp4', p_media_kind: 'video' });
    assert.equal(old.status, 404, JSON.stringify(old.body));
  });
});


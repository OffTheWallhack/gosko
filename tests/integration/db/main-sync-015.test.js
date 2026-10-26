// Migrácia 015: Robova komunita z main (profil jazdca, trik týždňa, hodnotenie spotov, XP, článok k eventu)
// nad 001–014 a rovnaké utiahnutie ako 001/006/014 (RLS, granty po stĺpcoch, view bez user_id, EXECUTE).
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { ROOT, startStack, stopStack, rest, sql, sqlFile, seedUsers, USER_ID } from '../../helpers/stack.js';
import { DENIED } from './_fixtures.js';

const minimal = { Prefer: 'return=minimal' };
const OTHER_ID = '00000000-0000-4000-8000-00000000c001';
const CH_OPEN = '15151515-0000-4000-8000-000000000001';
const CH_VOTE = '15151515-0000-4000-8000-000000000002';
const E_FINAL = '15151515-0000-4000-8000-0000000000e1';
const E_OTHER = '15151515-0000-4000-8000-0000000000e2';
const E_PLAIN = '15151515-0000-4000-8000-0000000000e3';

before(async () => {
  await startStack();
  seedUsers();
  sql(`insert into auth.users (id, email) values ('${OTHER_ID}', 'other@test.local') on conflict do nothing;
       insert into public.rider_profiles (slug, user_id, status, instagram, note) values
         ('marek-kupkovic', '${OTHER_ID}', 'approved', 'marek', 'tajná poznámka k overeniu'),
         ('jan-horvath', null, 'pending', null, null);
       insert into public.trick_challenges (id, title, status) values ('${CH_OPEN}', 'Kickflip', 'open'), ('${CH_VOTE}', 'Heelflip', 'voting');
       insert into public.trick_entries (id, challenge_id, user_id, name, clip_url, finalist) values
         ('${E_FINAL}', '${CH_VOTE}', '${OTHER_ID}', 'Finalista', 'https://youtu.be/abcdefghijk', true),
         ('${E_OTHER}', '${CH_VOTE}', '${OTHER_ID}', 'Finalista 2', 'https://youtu.be/abcdefghijl', true),
         ('${E_PLAIN}', '${CH_VOTE}', '${OTHER_ID}', 'Nevybraný', 'https://youtu.be/abcdefghijm', false);
       insert into public.spot_reviews (spot_key, user_id, stars, tags) values ('park:petrzalka', '${OTHER_ID}', 4, '{street}');`);
});

after(stopStack);

describe('015: posts.event_id', () => {
  test('anon reads event_id, admin sets it, bad format is rejected', async () => {
    const ins = await rest('/posts', { method: 'POST', as: 'admin', headers: minimal, body: { title: 'K eventu', event_id: 'bratislava-2' } });
    assert.equal(ins.status, 201, JSON.stringify(ins.body));
    const res = await rest('/posts?select=id,title,event_id&event_id=eq.bratislava-2');
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body[0].title, 'K eventu');
    const bad = await rest('/posts', { method: 'POST', as: 'admin', headers: minimal, body: { title: 'Zlé', event_id: '../x' } });
    assert.equal(bad.status, 400, JSON.stringify(bad.body));
  });
});

describe('015: rider_profiles', () => {
  test('anon sees approved profiles through the view, without user_id or note; the table is closed', async () => {
    const res = await rest('/rider_profiles_public?select=*');
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.deepEqual(res.body.map(r => r.slug), ['marek-kupkovic']);
    assert.equal(res.body[0].claimed, true);
    for (const k of ['user_id', 'note', 'photo_path']) assert.ok(!(k in res.body[0]), k);
    assert.ok(DENIED.includes((await rest('/rider_profiles?select=slug')).status));
  });

  test('a signed-in user does not see other people’s rows in the table', async () => {
    const res = await rest('/rider_profiles?select=slug,note', { as: 'authenticated' });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, []);
  });

  test('claim is pending and own; cannot approve itself, claim for someone else or change slug', async () => {
    const claim = { slug: 'tomas-matel', status: 'pending', instagram: '@tomas', note: 'napíšem z IG' };
    assert.equal((await rest('/rider_profiles', { method: 'POST', as: 'authenticated', headers: minimal, body: claim })).status, 201);
    assert.equal(sql(`select user_id from public.rider_profiles where slug = 'tomas-matel'`), USER_ID, 'user_id = auth.uid()');
    for (const bad of [{ ...claim, slug: 'x-approved', status: 'approved' }, { ...claim, slug: 'x-foreign', user_id: OTHER_ID }]) {
      const r = await rest('/rider_profiles', { method: 'POST', as: 'authenticated', headers: minimal, body: bad });
      assert.ok(DENIED.includes(r.status), `${JSON.stringify(bad)}: ${r.status}`);
    }
    // druhý profil tým istým účtom nejde
    const twice = await rest('/rider_profiles', { method: 'POST', as: 'authenticated', headers: minimal, body: { ...claim, slug: 'druhy-profil' } });
    assert.equal(twice.status, 409, JSON.stringify(twice.body));
    for (const patch of [{ status: 'approved' }, { slug: 'iny-jazdec' }, { user_id: OTHER_ID }]) {
      const r = await rest('/rider_profiles?slug=eq.tomas-matel', { method: 'PATCH', as: 'authenticated', body: patch });
      assert.ok(DENIED.includes(r.status), `${JSON.stringify(patch)}: ${r.status}`);
    }
    assert.equal(sql(`select status from public.rider_profiles where slug = 'tomas-matel'`), 'pending');
  });

  test('owner edits own details; cannot touch someone else’s profile', async () => {
    const own = await rest('/rider_profiles?slug=eq.tomas-matel', { method: 'PATCH', as: 'authenticated', body: { city: 'Nitra', stance: 'goofy', bio: 'ahoj' } });
    assert.equal(own.status, 204, JSON.stringify(own.body));
    assert.equal(sql(`select city from public.rider_profiles where slug = 'tomas-matel'`), 'Nitra');
    await rest('/rider_profiles?slug=eq.marek-kupkovic', { method: 'PATCH', as: 'authenticated', body: { bio: 'hacked' } });
    assert.equal(sql(`select coalesce(bio, '') from public.rider_profiles where slug = 'marek-kupkovic'`), '');
  });

  test('photo_url must be http(s)', async () => {
    const r = await rest('/rider_profiles?slug=eq.tomas-matel', { method: 'PATCH', as: 'authenticated', body: { photo_url: 'javascript:alert(1)' } });
    assert.equal(r.status, 400, JSON.stringify(r.body));
  });

  test('admin photo upload for someone else does not make the profile admin’s', async () => {
    const r = await rest('/rider_profiles', { method: 'POST', as: 'admin', headers: minimal, body: { slug: 'andrej-jasko', status: 'approved', photo_url: 'https://x.supabase.co/a.jpg' } });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(sql(`select coalesce(user_id::text, 'null') from public.rider_profiles where slug = 'andrej-jasko'`), 'null');
  });

  test('admin approves, uploads a photo for an unclaimed rider (upsert) and sees pending claims', async () => {
    assert.equal((await rest('/rider_profiles?slug=eq.tomas-matel', { method: 'PATCH', as: 'admin', body: { status: 'approved' } })).status, 204);
    const up = await rest('/rider_profiles?on_conflict=slug', { method: 'POST', as: 'admin', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: { slug: 'jan-horvath', photo_url: 'https://x.supabase.co/storage/v1/object/public/photos/riders/jan.jpg', photo_path: 'riders/jan.jpg', status: 'approved' } });
    assert.ok([200, 201].includes(up.status), JSON.stringify(up.body));
    const pub = (await rest('/rider_profiles_public?select=slug,claimed&order=slug')).body;
    assert.deepEqual(pub, [{ slug: 'andrej-jasko', claimed: false }, { slug: 'jan-horvath', claimed: false }, { slug: 'marek-kupkovic', claimed: true }, { slug: 'tomas-matel', claimed: true }]);
  });
});

describe('015: trick of the week', () => {
  const entry = (challenge_id, extra = {}) => ({ challenge_id, name: 'Ja', clip_url: 'https://youtu.be/abcdefghijk', ...extra });

  test('anon reads challenges and finalists with votes, never entries or user_id', async () => {
    assert.equal((await rest('/trick_challenges?select=id')).body.length, 2);
    const res = await rest(`/trick_results?select=*&challenge_id=eq.${CH_VOTE}&order=name`);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.deepEqual(res.body.map(e => e.name), ['Finalista', 'Finalista 2']);
    assert.ok(!('user_id' in res.body[0]) && !('video_path' in res.body[0]));
    assert.ok(DENIED.includes((await rest('/trick_entries?select=id')).status));
    assert.ok(DENIED.includes((await rest('/trick_entries', { method: 'POST', headers: minimal, body: entry(CH_OPEN) })).status));
  });

  test('signed-in user sends a clip only while open, never as finalist, and sees only own entries', async () => {
    assert.equal((await rest('/trick_entries', { method: 'POST', as: 'authenticated', headers: minimal, body: entry(CH_OPEN) })).status, 201);
    for (const bad of [entry(CH_VOTE), entry(CH_OPEN, { finalist: true }), entry(CH_OPEN, { user_id: OTHER_ID })]) {
      const r = await rest('/trick_entries', { method: 'POST', as: 'authenticated', headers: minimal, body: bad });
      assert.ok(DENIED.includes(r.status), `${JSON.stringify(bad)}: ${r.status}`);
    }
    const bad = await rest('/trick_entries', { method: 'POST', as: 'authenticated', headers: minimal, body: entry(CH_OPEN, { clip_url: 'javascript:alert(1)' }) });
    assert.equal(bad.status, 400);
    const mine = await rest('/trick_entries?select=name,user_id', { as: 'authenticated' });
    assert.deepEqual(mine.body.map(e => e.user_id), [USER_ID]);
    await rest(`/trick_entries?id=eq.${E_PLAIN}`, { method: 'PATCH', as: 'authenticated', body: { finalist: true } });
    assert.equal(sql(`select finalist from public.trick_entries where id = '${E_PLAIN}'`), 'f');
  });

  test('one vote per account, only for a finalist and only while voting; vote can be changed', async () => {
    const vote = entry_id => rest('/trick_votes', { method: 'POST', as: 'authenticated', headers: minimal, body: { challenge_id: CH_VOTE, entry_id } });
    assert.ok(DENIED.includes((await vote(E_PLAIN)).status), 'non-finalist');
    assert.equal((await vote(E_FINAL)).status, 201);
    assert.equal((await vote(E_OTHER)).status, 409, 'second vote');
    assert.equal((await rest(`/trick_votes?challenge_id=eq.${CH_VOTE}`, { method: 'DELETE', as: 'authenticated' })).status, 204);
    assert.equal((await vote(E_OTHER)).status, 201);
    const res = await rest(`/trick_results?select=id,votes&challenge_id=eq.${CH_VOTE}`);
    assert.deepEqual(Object.fromEntries(res.body.map(e => [e.id, e.votes])), { [E_FINAL]: 0, [E_OTHER]: 1 });
    const open = await rest('/trick_votes', { method: 'POST', as: 'authenticated', sub: OTHER_ID, headers: minimal, body: { challenge_id: CH_OPEN, entry_id: E_FINAL } });
    assert.ok(DENIED.includes(open.status), 'entry from another challenge / not voting');
  });

  test('only admin manages challenges and finalists', async () => {
    assert.ok(DENIED.includes((await rest('/trick_challenges', { method: 'POST', as: 'authenticated', headers: minimal, body: { title: 'Hack' } })).status));
    assert.equal((await rest('/trick_challenges', { method: 'POST', as: 'admin', headers: minimal, body: { title: 'Nový', status: 'open' } })).status, 201);
    assert.equal((await rest(`/trick_entries?id=eq.${E_PLAIN}`, { method: 'PATCH', as: 'admin', body: { finalist: true } })).status, 204);
    assert.equal(sql(`select finalist from public.trick_entries where id = '${E_PLAIN}'`), 't');
  });
});

describe('015: spot_reviews (web) next to the game spot_ratings', () => {
  test('game table spot_ratings keeps its own shape', () => {
    assert.equal(sql(`select string_agg(column_name, ',' order by column_name) from information_schema.columns where table_schema = 'public' and table_name = 'spot_ratings'`),
      'created_at,player_id,skulls,spot_id,updated_at');
  });

  test('anon reads stars and tags but not user_id', async () => {
    const res = await rest('/spot_reviews?select=spot_key,stars,tags');
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.deepEqual(res.body, [{ spot_key: 'park:petrzalka', stars: 4, tags: ['street'] }]);
    assert.ok(DENIED.includes((await rest('/spot_reviews?select=user_id')).status));
  });

  test('signed-in user upserts only own rating with a valid key', async () => {
    const up = body => rest('/spot_reviews?on_conflict=spot_key,user_id', { method: 'POST', as: 'authenticated', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body });
    assert.equal((await up({ spot_key: 'park:petrzalka', stars: 5, tags: ['bowl'] })).status, 201);
    assert.ok([200, 201].includes((await up({ spot_key: 'park:petrzalka', stars: 3, tags: [] })).status));
    assert.equal(sql(`select stars from public.spot_reviews where user_id = '${USER_ID}'`), '3');
    // za iného hodnotiť nejde: user_id klient vôbec nesmie poslať (grant), dopĺňa ho databáza
    assert.ok(DENIED.includes((await up({ spot_key: 'park:petrzalka', stars: 1, tags: [], user_id: OTHER_ID })).status));
    assert.equal(sql(`select stars from public.spot_reviews where user_id = '${OTHER_ID}'`), '4');
    for (const bad of [{ spot_key: 'evil', stars: 5 }, { spot_key: 'spot:x', stars: 9 }]) assert.equal((await up({ ...bad, tags: [] })).status, 400);
  });
});

describe('015: my_activity and storage', () => {
  test('my_activity counts the caller’s activity, anon cannot call it', async () => {
    const res = await rest('/rpc/my_activity', { method: 'POST', as: 'authenticated', body: {} });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.tricks, 1);
    assert.equal(res.body.trick_votes, 1);
    assert.equal(res.body.ratings, 1);
    assert.equal(res.body.rider, 1);
    assert.ok(DENIED.includes((await rest('/rpc/my_activity', { method: 'POST', body: {} })).status));
  });

  test('SECURITY DEFINER my_activity has no EXECUTE for PUBLIC or anon; guard trigger is invoker', () => {
    assert.equal(sql(`select prosecdef from pg_proc where oid = 'public.my_activity()'::regprocedure`), 't');
    assert.equal(sql(`select has_function_privilege('anon', 'public.my_activity()', 'execute')`), 'f');
    assert.equal(sql(`select prosecdef from pg_proc where oid = 'public.rider_profile_guard()'::regprocedure`), 'f');
    for (const t of ['rider_profiles', 'trick_challenges', 'trick_entries', 'trick_votes', 'spot_reviews'])
      assert.equal(sql(`select relrowsecurity from pg_class where oid = 'public.${t}'::regclass`), 't', t);
  });

  test('clips bucket: 30 MB, video only; users upload only into their own folder', () => {
    assert.equal(sql(`select file_size_limit || ' ' || array_to_string(allowed_mime_types, ',') from storage.buckets where id = 'clips'`), '31457280 video/mp4,video/quicktime,video/webm');
    assert.match(sql(`select with_check from pg_policies where schemaname = 'storage' and policyname = 'Prihlásený nahrá klip triku'`), /foldername/);
  });

  test('015 is re-runnable and keeps data', () => {
    const before = sql(`select count(*) from public.rider_profiles`);
    sqlFile(join(ROOT, 'supabase', 'migrations', '015_main_sync2.sql'));
    assert.equal(sql(`select count(*) from public.rider_profiles`), before);
  });
});

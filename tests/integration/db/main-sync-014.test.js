// Migrácia 014: Robove zmeny z main (kalendár end_date/prize/fotka, novinky posts, pozvánky adminov)
// nad 001–013 a rovnaké utiahnutie ako 001/006 (RLS, granty po stĺpcoch, URL kontroly, EXECUTE).
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { ROOT, startStack, stopStack, rest, sql, sqlFile, sqlRows, seedUsers } from '../../helpers/stack.js';
import { DENIED } from './_fixtures.js';

const minimal = { Prefer: 'return=minimal' };
const CE_OK = '14141414-0000-4000-8000-000000000001';
const POST_PUB = '14141414-0000-4000-8000-0000000000a1';
const POST_HIDDEN = '14141414-0000-4000-8000-0000000000a2';
const isAdmin = id => sql(`select count(*) from public.admins where user_id = '${id}'`) === '1';

before(async () => {
  await startStack();
  seedUsers();
  sql(`insert into public.community_events (id, name, date, end_date, prize, city, country, contact, approved, image_url)
         values ('${CE_OK}', 'Viacdňový jam', '2026-11-01', '2026-11-02', '500 € + ceny', 'Bratislava', 'Slovensko', 'tajny@kontakt.sk', true, 'https://x.supabase.co/p/e.jpg');
       insert into public.posts (id, title, summary, published, user_id, image_path) values
         ('${POST_PUB}', 'Verejná novinka', 'krátko', true, '00000000-0000-4000-8000-00000000a001', 'a/news.jpg'),
         ('${POST_HIDDEN}', 'Skrytá novinka', null, false, '00000000-0000-4000-8000-00000000a001', null);`);
});

after(stopStack);

describe('014: calendar columns', () => {
  test('anon reads end_date, prize and image_url through the public view, never contact', async () => {
    const res = await rest(`/community_events_public?id=eq.${CE_OK}&select=*`);
    assert.equal(res.status, 200);
    assert.deepEqual(Object.keys(res.body[0]).sort(),
      ['city', 'country', 'created_at', 'date', 'end_date', 'id', 'image_url', 'kind', 'link', 'name', 'organizer', 'place', 'prize'].sort());
    assert.equal(res.body[0].end_date, '2026-11-02');
    assert.equal(res.body[0].prize, '500 € + ceny');
  });

  test('public view keeps security_barrier', () => {
    assert.match(sql(`select array_to_string(reloptions, ',') from pg_class where oid = 'public.community_events_public'::regclass`), /security_barrier=true/);
  });

  test('anon submits a multi-day event with prize, but cannot set image_url or approved', async () => {
    const row = { name: 'Formulár 014', date: '2026-12-01', end_date: '2026-12-03', prize: '100 €', city: 'Nitra', country: 'Slovensko', contact: 'org@test.local' };
    assert.equal((await rest('/community_events', { method: 'POST', headers: minimal, body: row })).status, 201);
    for (const extra of [{ image_url: 'https://x.supabase.co/p/hack.jpg' }, { approved: true }]) {
      const res = await rest('/community_events', { method: 'POST', headers: minimal, body: { ...row, name: 'Hack 014', ...extra } });
      assert.ok(DENIED.includes(res.status), `${JSON.stringify(extra)}: ${res.status}`);
    }
    assert.equal(sql(`select count(*) from public.community_events where name = 'Hack 014'`), '0');
  });

  test('end_date before date and too long prize are rejected', async () => {
    for (const bad of [{ end_date: '2026-11-30' }, { prize: 'x'.repeat(61) }]) {
      const res = await rest('/community_events', { method: 'POST', headers: minimal,
        body: { name: 'Zlé dáta', date: '2026-12-01', city: 'BA', country: 'Slovensko', contact: 'a@b.sk', ...bad } });
      assert.equal(res.status, 400, JSON.stringify(res.body));
      assert.equal(res.body.code, '23514');
    }
  });

  test('image_url must be http(s); only admin can set it', async () => {
    assert.throws(() => sql(`update public.community_events set image_url = 'javascript:alert(1)' where id = '${CE_OK}'`), /check constraint/);
    const r1 = await rest(`/community_events?id=eq.${CE_OK}`, { method: 'PATCH', as: 'authenticated', body: { image_url: 'https://evil.example/x.jpg' } });
    assert.ok([204, 200, 404, ...DENIED].includes(r1.status), String(r1.status));
    assert.equal(sql(`select image_url from public.community_events where id = '${CE_OK}'`), 'https://x.supabase.co/p/e.jpg');
    const r2 = await rest(`/community_events?id=eq.${CE_OK}`, { method: 'PATCH', as: 'admin', body: { image_url: 'https://x.supabase.co/p/new.jpg' } });
    assert.equal(r2.status, 204, JSON.stringify(r2.body));
    assert.equal(sql(`select image_url from public.community_events where id = '${CE_OK}'`), 'https://x.supabase.co/p/new.jpg');
    // admin nemení cez PATCH nič iné než approved a image_url (napr. kontakt)
    const r3 = await rest(`/community_events?id=eq.${CE_OK}`, { method: 'PATCH', as: 'admin', body: { contact: 'zmeneny@test.local' } });
    assert.ok(DENIED.includes(r3.status), String(r3.status));
  });
});

describe('014: posts (novinky)', () => {
  const COLS = 'id,title,summary,published,pinned';

  test('anon sees only published posts and only public columns', async () => {
    const res = await rest(`/posts?select=${COLS}`);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.deepEqual(res.body.map(p => p.id), [POST_PUB]);
    for (const col of ['user_id', 'image_path', '*']) {
      const r = await rest(`/posts?select=${col}`);
      assert.ok(DENIED.includes(r.status), `${col}: ${r.status} ${JSON.stringify(r.body)}`);
    }
  });

  test('non-admin authenticated sees only published posts, admin sees all', async () => {
    assert.deepEqual((await rest('/posts?select=id', { as: 'authenticated' })).body.map(p => p.id), [POST_PUB]);
    assert.deepEqual((await rest('/posts?select=id&order=title', { as: 'admin' })).body.map(p => p.id).sort(), [POST_HIDDEN, POST_PUB].sort());
  });

  test('anon and non-admin cannot create, change or delete posts', async () => {
    for (const as of ['anon', 'authenticated']) {
      const ins = await rest('/posts', { method: 'POST', as, headers: minimal, body: { title: 'Hack' } });
      assert.ok(DENIED.includes(ins.status), `${as} insert ${ins.status}`);
      await rest(`/posts?id=eq.${POST_PUB}`, { method: 'PATCH', as, body: { title: 'Hacked' } });
      await rest(`/posts?id=eq.${POST_PUB}`, { method: 'DELETE', as });
    }
    assert.equal(sql(`select title from public.posts where id = '${POST_PUB}'`), 'Verejná novinka');
    assert.equal(sql(`select count(*) from public.posts where title = 'Hack'`), '0');
  });

  test('admin creates, edits and deletes a post (as the web does)', async () => {
    const body = { title: 'Nová novinka', summary: 'pár viet', body: null, link: '#/eventy', link_label: 'Eventy', author: 'GOSko crew',
      pinned: true, published: true, image_url: 'https://x.supabase.co/storage/v1/object/public/photos/a/news.jpg', image_path: 'a/news.jpg' };
    const ins = await rest('/posts', { method: 'POST', as: 'admin', headers: minimal, body });
    assert.equal(ins.status, 201, JSON.stringify(ins.body));
    const id = sql(`select id from public.posts where title = 'Nová novinka'`);
    assert.equal(sql(`select user_id from public.posts where id = '${id}'`), '00000000-0000-4000-8000-00000000a001', 'user_id = auth.uid()');
    const up = await rest(`/posts?id=eq.${id}`, { method: 'PATCH', as: 'admin', body: { title: 'Upravená', published: false } });
    assert.equal(up.status, 204, JSON.stringify(up.body));
    assert.equal((await rest(`/posts?id=eq.${id}&select=id`)).body.length, 0, 'hidden post is not public');
    const del = await rest(`/posts?id=eq.${id}`, { method: 'DELETE', as: 'admin' });
    assert.equal(del.status, 204);
    assert.equal(sql(`select count(*) from public.posts where id = '${id}'`), '0');
  });

  test('admin cannot set id, created_at or user_id', async () => {
    for (const extra of [{ id: randomUUID() }, { created_at: '2000-01-01T00:00:00Z' }, { user_id: randomUUID() }]) {
      const res = await rest('/posts', { method: 'POST', as: 'admin', headers: minimal, body: { title: 'Podvrh', ...extra } });
      assert.ok(DENIED.includes(res.status), `${JSON.stringify(extra)}: ${res.status}`);
    }
  });

  test('links are http(s) or a page of the web (#/…), images http(s)', async () => {
    for (const bad of [{ link: 'javascript:alert(1)' }, { link: 'data:text/html,x' }, { image_url: 'javascript:alert(1)' }]) {
      const res = await rest('/posts', { method: 'POST', as: 'admin', headers: minimal, body: { title: 'XSS', ...bad } });
      assert.equal(res.status, 400, JSON.stringify(res.body));
      assert.equal(res.body.code, '23514');
    }
    for (const link of ['https://gosko.sk', '#/novinky']) {
      assert.equal((await rest('/posts', { method: 'POST', as: 'admin', headers: minimal, body: { title: 'OK odkaz', link } })).status, 201);
    }
  });
});

describe('014: admin invites', () => {
  const user = (email, confirmed) => {
    const id = randomUUID();
    sql(`insert into auth.users (id, email, email_confirmed_at) values ('${id}', '${email}', ${confirmed ? 'now()' : 'null'})`);
    return id;
  };

  test('anon and authenticated have no access to admin_invites', async () => {
    sql(`insert into public.admin_invites (email) values ('pozvany@test.local') on conflict do nothing`);
    for (const as of ['anon', 'authenticated', 'admin']) {
      assert.ok(DENIED.includes((await rest('/admin_invites?select=*', { as })).status), `${as} read`);
      const ins = await rest('/admin_invites', { method: 'POST', as, headers: minimal, body: { email: 'ja@test.local' } });
      assert.ok(DENIED.includes(ins.status), `${as} insert ${ins.status}`);
    }
    const privs = sqlRows(`select r, p from unnest(array['anon', 'authenticated']) r, unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) p
      where has_table_privilege(r, 'public.admin_invites', p)`);
    assert.deepEqual(privs, []);
    assert.equal(sql(`select relrowsecurity from pg_class where oid = 'public.admin_invites'::regclass`), 't');
  });

  test('invited e-mail becomes admin only after the e-mail is confirmed', () => {
    sql(`insert into public.admin_invites (email) values ('Nova.Adminka@test.local') on conflict do nothing`);
    const id = user('nova.adminka@test.local', false);
    assert.equal(isAdmin(id), false, 'unconfirmed sign-up must not get admin');
    sql(`update auth.users set email_confirmed_at = now() where id = '${id}'`);
    assert.equal(isAdmin(id), true, 'confirmed -> admin (case-insensitive e-mail)');
  });

  test('confirmed account created with an invited e-mail is admin at once (dashboard user)', () => {
    sql(`insert into public.admin_invites (email) values ('dashboard@test.local') on conflict do nothing`);
    assert.equal(isAdmin(user('dashboard@test.local', true)), true);
  });

  test('inviting an existing confirmed account makes it admin; unconfirmed or other e-mails do not', () => {
    const confirmed = user('existujuci@test.local', true), pending = user('neovereny@test.local', false), other = user('iny@test.local', true);
    sql(`insert into public.admin_invites (email) values ('EXISTUJUCI@test.local'), ('neovereny@test.local')`);
    assert.equal(isAdmin(confirmed), true);
    assert.equal(isAdmin(pending), false);
    assert.equal(isAdmin(other), false);
  });

  test('trigger functions are not executable by clients', () => {
    for (const fn of ['public.grant_invited_admin()', 'public.admin_invite_existing()']) {
      for (const role of ['anon', 'authenticated']) {
        assert.equal(sql(`select has_function_privilege('${role}', '${fn}', 'EXECUTE')`), 'f', `${role} ${fn}`);
      }
      assert.equal(sql(`select prosecdef from pg_proc where oid = '${fn}'::regprocedure`), 't');
    }
  });
});

describe('014: re-runs and the calendar seed', () => {
  test('014 runs again without changes to data or grants', () => {
    const before = sql(`select md5(string_agg(x, '|' order by x)) from (
      select 'ce' || id || coalesce(image_url, '') || coalesce(prize, '') as x from public.community_events
      union all select 'po' || id || title from public.posts
      union all select 'ad' || user_id from public.admins
      union all select 'g' || grantee || table_name || privilege_type from information_schema.role_table_grants
        where table_schema = 'public' and grantee in ('anon', 'authenticated')) s`);
    sqlFile(join(ROOT, 'supabase', 'migrations', '014_main_sync.sql'));
    const after = sql(`select md5(string_agg(x, '|' order by x)) from (
      select 'ce' || id || coalesce(image_url, '') || coalesce(prize, '') as x from public.community_events
      union all select 'po' || id || title from public.posts
      union all select 'ad' || user_id from public.admins
      union all select 'g' || grantee || table_name || privilege_type from information_schema.role_table_grants
        where table_schema = 'public' and grantee in ('anon', 'authenticated')) s`);
    assert.equal(after, before);
  });

  test('supabase-seed-events.sql applies after 014 (twice, no duplicates) and keeps the view', async () => {
    sqlFile(join(ROOT, 'supabase-seed-events.sql'));
    const n = sql(`select count(*) from public.community_events where approved`);
    assert.ok(Number(n) > 20, n);
    sqlFile(join(ROOT, 'supabase-seed-events.sql'));
    assert.equal(sql(`select count(*) from public.community_events where approved`), n);
    assert.match(sql(`select array_to_string(reloptions, ',') from pg_class where oid = 'public.community_events_public'::regclass`), /security_barrier=true/);
    const res = await rest(`/community_events_public?name=eq.${encodeURIComponent('Cube Skate Day Vol. 3')}&select=prize,image_url`);
    assert.deepEqual(res.body, [{ prize: '500 € + ceny', image_url: null }]);
  });
});

describe('014 on a database that already ran 001–013 (master Supabase)', () => {
  // Stav pred zlúčením s main: setup bez end_date, prize, posts a admin_invites, potom 001–013.
  test('upgrade adds the calendar columns, posts and invites with the same grants', async () => {
    sql(`drop trigger if exists on_auth_user_invited_admin on auth.users;
         drop table public.posts; drop table public.admin_invites cascade;
         drop function public.grant_invited_admin(); drop function public.admin_invite_existing();
         drop view public.community_events_public;
         alter table public.community_events drop column end_date, drop column prize, drop column image_url;
         create view public.community_events_public with (security_barrier = true) as
           select id, created_at, name, date, city, place, country, kind, link, organizer from public.community_events where approved;
         grant select on public.community_events_public to anon, authenticated;`);
    assert.equal((await rest('/posts?select=id')).status === 200, false);
    sqlFile(join(ROOT, 'supabase', 'migrations', '014_main_sync.sql'));
    sql(`notify pgrst, 'reload schema'`);
    await new Promise(r => setTimeout(r, 500));
    const ce = await rest('/community_events_public?select=end_date,prize,image_url&limit=1');
    assert.equal(ce.status, 200, JSON.stringify(ce.body));
    assert.equal((await rest('/posts?select=id,title')).status, 200);
    assert.ok(DENIED.includes((await rest('/posts?select=user_id')).status));
    assert.ok(DENIED.includes((await rest('/admin_invites?select=*')).status));
    sql(`insert into public.admin_invites (email) values ('po-upgrade@test.local')`);
    const id = randomUUID();
    sql(`insert into auth.users (id, email, email_confirmed_at) values ('${id}', 'po-upgrade@test.local', now())`);
    assert.equal(isAdmin(id), true);
  });
});

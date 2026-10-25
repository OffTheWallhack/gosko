// Task 1 / migrácia 001: granty, pohľady iba na čítanie, stĺpcové INSERT granty, URL CHECK, storage.
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, startStack, stopStack, rest, sql, sqlRows, sqlAs, seedUsers, USER_ID } from '../../helpers/stack.js';
import { DENIED } from './_fixtures.js';

const CE_OK = '11111111-0000-4000-8000-000000000001';
const CE_PENDING = '11111111-0000-4000-8000-000000000002';
const SPOT_OK = '22222222-0000-4000-8000-000000000001';
const SPOT_PENDING = '22222222-0000-4000-8000-000000000002';
const PHOTO_OK = '33333333-0000-4000-8000-000000000001';
const PHOTO_PENDING = '33333333-0000-4000-8000-000000000002';
const PARK_OK = '44444444-0000-4000-8000-000000000001';
const PARK_PENDING = '44444444-0000-4000-8000-000000000002';

before(async () => {
  await startStack();
  seedUsers();
  sql(`
    insert into public.community_events (id, name, date, city, country, contact, link, approved) values
      ('${CE_OK}', 'Schválený jam', '2026-11-01', 'Bratislava', 'SK', 'tajny@kontakt.sk', 'https://gosko.sk', true),
      ('${CE_PENDING}', 'Čakajúci jam', '2026-11-02', 'Žilina', 'SK', 'iny@kontakt.sk', null, false);
    insert into public.spots (id, user_id, name, city, lat, lng, approved) values
      ('${SPOT_OK}', '${USER_ID}', 'Schválený spot', 'Bratislava', 48.1, 17.1, true),
      ('${SPOT_PENDING}', '${USER_ID}', 'Čakajúci spot', 'Bratislava', 48.2, 17.2, false);
    insert into public.event_photos (id, user_id, event_id, author, caption, photo_url, photo_path, approved) values
      ('${PHOTO_OK}', '${USER_ID}', 'bratislava-2026-05', 'Fotograf', 'ok', 'https://x.supabase.co/p/a.jpg', '${USER_ID}/a.jpg', true),
      ('${PHOTO_PENDING}', '${USER_ID}', 'bratislava-2026-05', 'Fotograf', 'pending', 'https://x.supabase.co/p/b.jpg', '${USER_ID}/b.jpg', false);
    insert into public.parks (id, user_id, name, author, location, layout, approved) values
      ('${PARK_OK}', '${USER_ID}', 'Park A', 'Autor', 'Bratislava', '{}', true),
      ('${PARK_PENDING}', '${USER_ID}', 'Park B', 'Autor', 'Bratislava', '{}', false);
    insert into public.votes (park_id, user_id) values ('${PARK_OK}', '${USER_ID}');
    insert into public.newsletter_subscribers (email, consent) values ('odber@test.local', true);
    insert into public.bookings (org_name, city, contact) values ('Škola', 'Trnava', 'booking@test.local');
    insert into public.shop_interest (product, contact) values ('tee', 'shop@test.local');
    insert into public.privacy_requests (what, target, contact) values ('výmaz', 'Marek', 'privacy@test.local');
    insert into public.registrations_legacy (event_id, name, category, contact, token)
      values ('bratislava-2', 'Starý Jazdec', 'open', 'stary@test.local', gen_random_uuid());
    insert into storage.objects (bucket_id, name) values ('photos', '${USER_ID}/a.jpg'), ('spots', '${USER_ID}/s.jpg');
  `);
});

after(stopStack);

// pohľad -> stĺpec, ktorý v ňom existuje (aby PATCH nezlyhal na neznámom stĺpci)
const VIEWS = {
  community_events_public: { col: 'name', filter: 'id=not.is.null' },
  spots_public: { col: 'name', filter: 'id=not.is.null' },
  event_photos_public: { col: 'caption', filter: 'id=not.is.null' },
  parks_ranked: { col: 'name', filter: 'id=not.is.null' },
  riders_public: { col: 'country', filter: 'id=not.is.null' },
  results_public: { col: 'category', filter: 'place=gte.0' },
  events_public: { col: 'name', filter: 'id=not.is.null' },
};

const snapshot = () => sql(`select md5(string_agg(x, '|' order by x)) from (
  select 'ce' || id || name || approved as x from public.community_events
  union all select 'sp' || id || name || approved from public.spots
  union all select 'ph' || id || coalesce(caption, '') || approved from public.event_photos
  union all select 'pk' || id || name || approved from public.parks
  union all select 'ev' || id || name from public.events
  union all select 'er' || id || category || place from public.event_results) s`);

describe('public views are SELECT-only', () => {
  test('anon reads public views and sees only approved rows', async () => {
    const ce = await rest('/community_events_public?select=*');
    assert.equal(ce.status, 200);
    assert.deepEqual(ce.body.map(r => r.id), [CE_OK]);
    assert.ok(!('contact' in ce.body[0]), 'contact must not be public');
    const sp = await rest('/spots_public?select=*');
    assert.equal(sp.status, 200);
    // seed spots_ba (012) pridáva schválené spoty 5b0a0000-…; tu sa overujú iba spoty z tohto testu
    assert.deepEqual(sp.body.map(r => r.id).filter(id => id.startsWith('22222222')), [SPOT_OK]);
    assert.ok(!('user_id' in sp.body[0]));
    const ph = await rest('/event_photos_public?select=*');
    assert.equal(ph.status, 200);
    assert.deepEqual(ph.body.map(r => r.id), [PHOTO_OK]);
    assert.ok(!('user_id' in ph.body[0]) && !('photo_path' in ph.body[0]));
    const pk = await rest('/parks_ranked?select=id,votes');
    assert.equal(pk.status, 200);
    assert.deepEqual(pk.body, [{ id: PARK_OK, votes: 1 }]);
    for (const v of ['riders_public', 'results_public', 'events_public']) {
      assert.equal((await rest(`/${v}?select=*`)).status, 200, v);
    }
  });

  // parks_ranked (GROUP BY) a results_public (JOIN) nie sú automaticky zapisovateľné:
  // Postgres ich odmietne ešte pred kontrolou práv (55000). Aj tak sa nič nezmení
  // a nižšie sa práva overujú priamo v katalógu.
  const denied = (view, res) => DENIED.includes(res.status)
    || (['parks_ranked', 'results_public'].includes(view) && res.body?.code === '55000');

  for (const [view, { col, filter }] of Object.entries(VIEWS)) {
    test(`anon and authenticated hold only SELECT on ${view}`, () => {
      const privs = sqlRows(`select r as role, p as privilege, has_table_privilege(r, 'public.${view}', p) as granted
        from unnest(array['anon', 'authenticated']) r, unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) p`);
      for (const { role, privilege, granted } of privs) {
        assert.equal(granted, privilege === 'SELECT', `${role} ${privilege} on ${view}`);
      }
    });

    for (const as of ['anon', 'authenticated']) {
      test(`${as} PATCH on ${view} is denied`, async () => {
        const before = snapshot();
        const res = await rest(`/${view}?${filter}`, { method: 'PATCH', as, body: { [col]: 'hacked' } });
        assert.ok(denied(view, res), `PATCH ${view} as ${as} -> ${res.status} ${JSON.stringify(res.body)}`);
        assert.equal(snapshot(), before, 'data must not change');
      });

      test(`${as} DELETE on ${view} is denied`, async () => {
        const before = snapshot();
        const res = await rest(`/${view}?${filter}`, { method: 'DELETE', as });
        assert.ok(denied(view, res), `DELETE ${view} as ${as} -> ${res.status} ${JSON.stringify(res.body)}`);
        assert.equal(snapshot(), before, 'data must not change');
      });

      test(`${as} INSERT into ${view} is denied`, async () => {
        const before = snapshot();
        const res = await rest(`/${view}`, { method: 'POST', as, body: { [col]: 'hacked' } });
        assert.ok(denied(view, res), `POST ${view} as ${as} -> ${res.status} ${JSON.stringify(res.body)}`);
        assert.equal(snapshot(), before, 'data must not change');
      });
    }
  }
});

describe('base tables with personal data are not readable', () => {
  const TABLES = ['community_events', 'spots', 'event_photos', 'parks', 'votes', 'newsletter_subscribers', 'bookings',
    'shop_interest', 'privacy_requests', 'registrations_legacy', 'admins'];
  for (const t of TABLES) {
    test(`anon cannot read ${t}`, async () => {
      assert.ok(Number(sql(`select count(*) from public.${t}`)) > 0, `fixture row missing in ${t}`);
      const res = await rest(`/${t}?select=*`);
      assert.ok(DENIED.includes(res.status) || (res.status === 200 && res.body.length === 0), `${t}: ${res.status} ${JSON.stringify(res.body)}`);
    });
  }
  for (const t of ['community_events', 'spots', 'event_photos', 'parks', 'newsletter_subscribers', 'bookings',
    'shop_interest', 'privacy_requests', 'registrations_legacy', 'admins']) {
    test(`non-admin authenticated cannot read ${t}`, async () => {
      const res = await rest(`/${t}?select=*`, { as: 'authenticated' });
      assert.ok(DENIED.includes(res.status) || (res.status === 200 && res.body.length === 0), `${t}: ${res.status} ${JSON.stringify(res.body)}`);
    });
  }
});

describe('form tables: column-level INSERT', () => {
  const FORMS = {
    community_events: { name: 'Jam', date: '2026-12-01', city: 'Nitra', country: 'SK', contact: 'org@test.local' },
    newsletter_subscribers: { email: 'novy@test.local', source: 'web', consent: true },
    bookings: { org_name: 'Klub', city: 'Košice', contact: 'klub@test.local' },
    shop_interest: { product: 'tee', size: 'M', contact: 'kupec@test.local' },
    privacy_requests: { what: 'výmaz', target: 'moje meno', contact: 'ja@test.local', guardian: false },
  };
  const prefer = { Prefer: 'return=minimal' };

  for (const [t, row] of Object.entries(FORMS)) {
    test(`anon can submit ${t}`, async () => {
      const res = await rest(`/${t}`, { method: 'POST', body: row, headers: prefer });
      assert.equal(res.status, 201, `${t}: ${JSON.stringify(res.body)}`);
    });

    for (const [col, val] of [['id', '99999999-0000-4000-8000-000000000001'], ['created_at', '2000-01-01T00:00:00Z']]) {
      test(`anon cannot set ${col} on ${t}`, async () => {
        const n = sql(`select count(*) from public.${t}`);
        const body = { ...row, [col]: val };
        if (t === 'newsletter_subscribers') body.email = `x-${col}@test.local`;
        const res = await rest(`/${t}`, { method: 'POST', body, headers: prefer });
        assert.ok(DENIED.includes(res.status), `${t}.${col}: ${res.status} ${JSON.stringify(res.body)}`);
        assert.equal(sql(`select count(*) from public.${t}`), n);
      });
    }
  }

  test('anon cannot set approved on community_events', async () => {
    const res = await rest('/community_events', { method: 'POST', headers: prefer,
      body: { ...FORMS.community_events, name: 'Samoschválený', approved: true } });
    assert.ok(DENIED.includes(res.status), `${res.status} ${JSON.stringify(res.body)}`);
    assert.equal(sql(`select count(*) from public.community_events where name = 'Samoschválený'`), '0');
  });

  test('anon cannot insert into legacy registrations (nor set checked_in_at)', async () => {
    for (const body of [
      { event_id: 'bratislava-2', name: 'X', category: 'open', contact: 'x@test.local', token: '99999999-0000-4000-8000-0000000000aa' },
      { event_id: 'bratislava-2', name: 'X', category: 'open', contact: 'x@test.local', token: '99999999-0000-4000-8000-0000000000ab', checked_in_at: '2026-01-01T00:00:00Z' },
    ]) {
      const res = await rest('/registrations_legacy', { method: 'POST', body, headers: prefer });
      assert.ok(DENIED.includes(res.status), `${res.status} ${JSON.stringify(res.body)}`);
    }
    assert.equal(sql(`select count(*) from public.registrations_legacy where name = 'X'`), '0');
  });

  test('authenticated can submit a spot, park, photo and vote, but not pre-approved', async () => {
    const as = 'authenticated';
    assert.equal((await rest('/spots', { method: 'POST', as, headers: prefer, body: { name: 'Nový spot', city: 'BA', lat: 48, lng: 17 } })).status, 201);
    assert.equal((await rest('/parks', { method: 'POST', as, headers: prefer, body: { name: 'P', author: 'A', location: 'Bratislava', layout: {} } })).status, 201);
    assert.equal((await rest('/event_photos', { method: 'POST', as, headers: prefer, body: { event_id: 'bratislava-2026-05', author: 'A', clip_url: 'https://youtu.be/x' } })).status, 201);
    assert.equal((await rest('/votes', { method: 'POST', as, headers: prefer, body: { park_id: PARK_OK } })).status, 409, 'duplicate vote -> unique violation');
    for (const [t, body] of [
      ['spots', { name: 'Hack', city: 'BA', lat: 48, lng: 17, approved: true }],
      ['parks', { name: 'Hack', author: 'A', location: 'Bratislava', layout: {}, approved: true }],
      ['event_photos', { event_id: 'x', author: 'A', clip_url: 'https://youtu.be/y', approved: true }],
    ]) {
      const res = await rest(`/${t}`, { method: 'POST', as, headers: prefer, body });
      assert.ok(DENIED.includes(res.status), `${t}: ${res.status} ${JSON.stringify(res.body)}`);
    }
    assert.equal(sql(`select count(*) from public.spots where name = 'Hack'`), '0');
    assert.equal(sql(`select count(*) from public.spots where name = 'Nový spot' and user_id = '${USER_ID}' and not approved`), '1');
  });
});

describe('URL CHECK constraints', () => {
  const bad = ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,<script>alert(1)</script>', ' https://lead-space.sk', 'www.bez-schemy.sk'];

  for (const link of bad) {
    test(`community_events.link rejects ${JSON.stringify(link)}`, async () => {
      const res = await rest('/community_events', { method: 'POST', headers: { Prefer: 'return=minimal' },
        body: { name: 'XSS', date: '2026-12-01', city: 'BA', country: 'SK', contact: 'a@b.sk', link } });
      assert.equal(res.status, 400, JSON.stringify(res.body));
      assert.equal(res.body.code, '23514');
    });
  }

  test('community_events.link accepts http(s) and NULL', async () => {
    for (const link of ['https://gosko.sk/x', 'http://example.com', null]) {
      const res = await rest('/community_events', { method: 'POST', headers: { Prefer: 'return=minimal' },
        body: { name: 'OK link', date: '2026-12-01', city: 'BA', country: 'SK', contact: 'a@b.sk', link } });
      assert.equal(res.status, 201, `${link}: ${JSON.stringify(res.body)}`);
    }
  });

  test('spots.photo_url and event_photos.photo_url/clip_url reject javascript:', () => {
    const attempts = [
      `insert into public.spots (user_id, name, city, lat, lng, photo_url) values ('${USER_ID}', 'X', 'BA', 1, 1, 'javascript:alert(1)')`,
      `insert into public.event_photos (user_id, event_id, author, photo_url) values ('${USER_ID}', 'e', 'A', 'javascript:alert(1)')`,
      `insert into public.event_photos (user_id, event_id, author, clip_url) values ('${USER_ID}', 'e', 'A', 'javascript:alert(1)')`,
    ];
    for (const q of attempts) {
      assert.throws(() => sql(q), err => /check constraint/.test(err.message), q);
    }
    sql(`insert into public.spots (user_id, name, city, lat, lng, photo_url) values ('${USER_ID}', 'Fotka', 'BA', 1, 1, 'https://x.supabase.co/s.jpg')`);
    sql(`insert into public.spots (user_id, name, city, lat, lng, photo_url) values ('${USER_ID}', 'Bez fotky', 'BA', 1, 1, null)`);
  });

  test('named URL constraints exist', () => {
    const names = sqlRows(`select conname from pg_constraint where conname in
      ('community_events_link_url', 'spots_photo_url_url', 'event_photos_photo_url_url', 'event_photos_clip_url_url')`).map(r => r.conname).sort();
    assert.deepEqual(names, ['community_events_link_url', 'event_photos_clip_url_url', 'event_photos_photo_url_url', 'spots_photo_url_url']);
  });
});

describe('admin moderation still works', () => {
  test('admin sees pending items including contact', async () => {
    const res = await rest(`/community_events?select=id,contact&approved=eq.false&id=eq.${CE_PENDING}`, { as: 'admin' });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, [{ id: CE_PENDING, contact: 'iny@kontakt.sk' }]);
  });

  test('non-admin cannot approve, admin can', async () => {
    const r1 = await rest(`/community_events?id=eq.${CE_PENDING}`, { method: 'PATCH', as: 'authenticated', body: { approved: true } });
    assert.ok([204, 200, 404, ...DENIED].includes(r1.status), String(r1.status));
    assert.equal(sql(`select approved from public.community_events where id = '${CE_PENDING}'`), 'f');
    const r2 = await rest(`/community_events?id=eq.${CE_PENDING}`, { method: 'PATCH', as: 'admin', body: { approved: true } });
    assert.equal(r2.status, 204, JSON.stringify(r2.body));
    assert.equal(sql(`select approved from public.community_events where id = '${CE_PENDING}'`), 't');
    for (const [t, id] of [['spots', SPOT_PENDING], ['event_photos', PHOTO_PENDING], ['parks', PARK_PENDING]]) {
      const r = await rest(`/${t}?id=eq.${id}`, { method: 'PATCH', as: 'admin', body: { approved: true } });
      assert.equal(r.status, 204, `${t}: ${JSON.stringify(r.body)}`);
      assert.equal(sql(`select approved from public.${t} where id = '${id}'`), 't');
    }
  });

  test('admin can reject (delete) a pending spot', async () => {
    const id = sql(`insert into public.spots (user_id, name, city, lat, lng) values ('${USER_ID}', 'Zamietnuť', 'BA', 1, 1) returning id`);
    const r = await rest(`/spots?id=eq.${id}`, { method: 'DELETE', as: 'admin' });
    assert.equal(r.status, 204);
    assert.equal(sql(`select count(*) from public.spots where id = '${id}'`), '0');
  });

  test('admin can remove storage objects (needs SELECT policy); non-admin cannot', () => {
    const del = (sub, bucket, name) => sqlAs('authenticated', sub,
      `with d as (delete from storage.objects where bucket_id = '${bucket}' and name = '${name}' returning 1) select count(*) from d`);
    assert.equal(del(USER_ID, 'photos', `${USER_ID}/a.jpg`), '0');
    assert.equal(sql(`select count(*) from storage.objects where name = '${USER_ID}/a.jpg'`), '1');
    assert.equal(del('00000000-0000-4000-8000-00000000a001', 'photos', `${USER_ID}/a.jpg`), '1');
    assert.equal(sql(`select count(*) from storage.objects where name = '${USER_ID}/a.jpg'`), '0');
    // admin vidí súbory v oboch bucketoch, bežný používateľ nie
    assert.equal(sqlAs('authenticated', '00000000-0000-4000-8000-00000000a001', `select count(*) from storage.objects where bucket_id = 'spots'`), '1');
    assert.equal(sqlAs('authenticated', USER_ID, `select count(*) from storage.objects`), '0');
  });
});

describe('grants audit (supabase/checks/grants.sql)', () => {
  test('audit query runs and flags nothing critical', () => {
    const q = readFileSync(join(ROOT, 'supabase', 'checks', 'grants.sql'), 'utf8').trim().replace(/;\s*$/, '');
    const rows = sqlRows(q);
    assert.ok(rows.length > 0, 'audit should list the remaining grants');
    for (const k of ['object_type', 'object_name', 'column_name', 'grantee', 'privilege', 'risk']) assert.ok(k in rows[0], k);
    const critical = rows.filter(r => /^KRITICK/.test(r.risk || ''));
    assert.deepEqual(critical, []);
  });

  test('anon holds only the minimum privileges', () => {
    const tableGrants = sqlRows(`select table_name, privilege_type from information_schema.role_table_grants
      where grantee = 'anon' and table_schema = 'public' order by 1, 2`);
    const allowedSelect = ['brackets', 'community_events_public', 'event_awards', 'event_photos_public', 'event_results',
      'events_public', 'parks_ranked', 'results_public', 'riders_public', 'spots_public'];
    // hra (010–012): verejné pohľady bez osobných údajov a katalóg gearu
    const gameSelect = ['clips_public', 'crew_leaderboard', 'crews_public', 'gear', 'loot_public', 'players_public',
      'spot_control', 'spot_crew_scores', 'spot_summary'];
    // 015 (Robova komunita): schválené profily jazdcov bez user_id, zadania a finalisti triku týždňa
    const communitySelect = ['rider_profiles_public', 'trick_challenges', 'trick_results'];
    assert.deepEqual(tableGrants, [...allowedSelect, ...gameSelect, ...communitySelect].sort().map(t => ({ table_name: t, privilege_type: 'SELECT' })));

    const colGrants = sqlRows(`select table_name, string_agg(distinct privilege_type, ',') as p
      from information_schema.column_privileges
      where grantee = 'anon' and table_schema = 'public'
        and table_name not in (select table_name from information_schema.role_table_grants where grantee = 'anon' and table_schema = 'public')
      group by 1 order by 1`);
    // 014: novinky (posts) číta anon len po stĺpcoch, bez user_id a image_path; riadky obmedzuje RLS (published)
    assert.deepEqual(colGrants, [...['bookings', 'community_events', 'newsletter_subscribers', 'privacy_requests', 'shop_interest']
      .map(t => ({ table_name: t, p: 'INSERT' })), { table_name: 'posts', p: 'SELECT' }, { table_name: 'spot_reviews', p: 'SELECT' }].sort((a, b) => a.table_name.localeCompare(b.table_name)));
    const postCols = sqlRows(`select column_name from information_schema.column_privileges
      where grantee = 'anon' and table_schema = 'public' and table_name = 'posts' order by 1`).map(r => r.column_name);
    assert.deepEqual(postCols, ['author', 'body', 'created_at', 'event_id', 'id', 'image_url', 'link', 'link_label', 'pinned', 'published', 'summary', 'title']);
    // 015: hodnotenia spotov (web) číta anon bez user_id
    const reviewCols = sqlRows(`select column_name from information_schema.column_privileges
      where grantee = 'anon' and table_schema = 'public' and table_name = 'spot_reviews' order by 1`).map(r => r.column_name);
    assert.deepEqual(reviewCols, ['created_at', 'spot_key', 'stars', 'tags']);
    const ceCols = sqlRows(`select column_name from information_schema.column_privileges
      where grantee = 'anon' and table_schema = 'public' and table_name = 'community_events' order by 1`).map(r => r.column_name);
    assert.deepEqual(ceCols, ['city', 'contact', 'country', 'date', 'end_date', 'kind', 'link', 'name', 'organizer', 'place', 'prize']);

    const forbiddenCols = sqlRows(`select table_name, column_name from information_schema.column_privileges
      where grantee in ('anon', 'authenticated') and table_schema = 'public' and privilege_type = 'INSERT'
        and column_name in ('id', 'created_at', 'approved', 'checked_in_at', 'user_id')
        and table_name not in ('event_results', 'event_awards', 'brackets')`);
    assert.deepEqual(forbiddenCols, []);
  });
});

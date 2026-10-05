// Task 7 / migrácia 002: jazdci, registrácie v2, výsledky s bodmi, pohľady bez PII, funkcie.
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { POINTS } from '../../../data.js';
import { ROOT, startStack, stopStack, rest, sql, sqlRows, sqlFile, seedUsers } from '../../helpers/stack.js';
import { DENIED, createRider, createRegistration, createNftToken, riderWithRegistration, riderRef } from './_fixtures.js';

const PII_TABLES = ['riders', 'rider_private', 'registrations', 'nft_tokens', 'audit_log', 'rate_limits', 'registrations_legacy'];
const PII_KEYS = ['display_name', 'nickname', 'legal_name', 'email', 'birth_date', 'phone', 'instagram', 'guardian_email',
  'guardian_name', 'rider_ref', 'token', 'guardian_token', 'registration_id', 'public_name_mode'];

let marek; // { rider_id, registration_id }

before(async () => {
  await startStack();
  seedUsers();
  marek = riderWithRegistration({ display_name: 'Marek Kupkovič', nickname: 'Kupko', mode: 'short', city: 'Bratislava' });
  createNftToken({ registration_id: marek.registration_id, status: 'minted', token_id: 7 });
  sql(`insert into public.audit_log (action, entity, entity_id) values ('test', 'x', '1');
       select public.rate_limit_hit('fixture', 5, 10);
       insert into public.registrations_legacy (event_id, name, category, contact, token)
         values ('bratislava-2', 'Starý Jazdec', 'open', 'stary@test.local', gen_random_uuid());`);
});

after(stopStack);

describe('anon has no access to personal data', () => {
  for (const t of [...PII_TABLES, 'events']) {
    test(`anon cannot read ${t}`, async () => {
      assert.ok(Number(sql(`select count(*) from public.${t}`)) > 0, `fixture row missing in ${t}`);
      const res = await rest(`/${t}?select=*`);
      assert.ok(DENIED.includes(res.status) || (res.status === 200 && res.body.length === 0), `${t}: ${res.status} ${JSON.stringify(res.body)}`);
    });
  }

  test('anon cannot INSERT into registrations, registrations_legacy or riders', async () => {
    const attempts = {
      registrations: { rider_id: marek.rider_id, event_id: 'bratislava-2', category: 'open', status: 'checked_in', consent_version: 'x', consent_at: '2026-10-01T00:00:00Z' },
      registrations_legacy: { event_id: 'bratislava-2', name: 'X', category: 'open', contact: 'x@test.local', token: randomUUID() },
      riders: { rider_ref: riderRef(), display_name: 'Hacker' },
      rider_private: { rider_id: marek.rider_id, legal_name: 'X', birth_date: '2000-01-01', email: 'x@test.local' },
      nft_tokens: { registration_id: marek.registration_id, chain_id: 1, contract: '0x0000000000000000000000000000000000000000', status: 'pending' },
      audit_log: { action: 'fake' },
      rate_limits: { key: 'x', window_start: '2026-01-01T00:00:00Z' },
      events: { id: 'fake-event', name: 'Fake' },
    };
    for (const [t, body] of Object.entries(attempts)) {
      for (const as of ['anon', 'authenticated', 'admin']) {
        const res = await rest(`/${t}`, { method: 'POST', as, body, headers: { Prefer: 'return=minimal' } });
        assert.ok(DENIED.includes(res.status), `${as} POST ${t}: ${res.status} ${JSON.stringify(res.body)}`);
      }
    }
    assert.equal(sql(`select count(*) from public.riders where display_name = 'Hacker'`), '0');
  });

  test('anon cannot UPDATE or DELETE registrations', async () => {
    for (const as of ['anon', 'authenticated', 'admin']) {
      const p = await rest(`/registrations?id=eq.${marek.registration_id}`, { method: 'PATCH', as, body: { status: 'checked_in' } });
      assert.ok(DENIED.includes(p.status), `${as} PATCH: ${p.status}`);
      const d = await rest(`/registrations?id=eq.${marek.registration_id}`, { method: 'DELETE', as });
      assert.ok(DENIED.includes(d.status), `${as} DELETE: ${d.status}`);
    }
    assert.equal(sql(`select status from public.registrations where id = '${marek.registration_id}'`), 'confirmed');
  });
});

describe('admin reads, only service_role writes', () => {
  test('admin can SELECT registrations and other private tables', async () => {
    for (const t of PII_TABLES.concat('events')) {
      const res = await rest(`/${t}?select=*`, { as: 'admin' });
      assert.equal(res.status, 200, `${t}: ${JSON.stringify(res.body)}`);
      assert.ok(res.body.length > 0, `admin should see rows in ${t}`);
    }
  });

  test('non-admin authenticated user cannot SELECT registrations', async () => {
    for (const t of PII_TABLES.concat('events')) {
      const res = await rest(`/${t}?select=*`, { as: 'authenticated' });
      assert.ok(DENIED.includes(res.status) || (res.status === 200 && res.body.length === 0), `${t}: ${res.status} ${JSON.stringify(res.body)}`);
    }
  });

  test('service_role can create a rider and a registration', async () => {
    const rider = { rider_ref: riderRef(), display_name: 'Servisný Jazdec', country: 'CZ', public_name_mode: 'full' };
    const r = await rest('/riders', { method: 'POST', as: 'service_role', body: rider, headers: { Prefer: 'return=representation' } });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const rid = r.body[0].id;
    const g = await rest('/registrations', { method: 'POST', as: 'service_role', headers: { Prefer: 'return=representation' },
      body: { rider_id: rid, event_id: 'bratislava-2', category: 'open', status: 'confirmed', consent_version: '2026-10', consent_at: new Date().toISOString() } });
    assert.equal(g.status, 201, JSON.stringify(g.body));
    assert.match(g.body[0].token, /^[0-9a-f-]{36}$/);
  });
});

describe('constraints', () => {
  test('a second registration of the same rider for the same event fails', async () => {
    const res = await rest('/registrations', { method: 'POST', as: 'service_role', headers: { Prefer: 'return=minimal' },
      body: { rider_id: marek.rider_id, event_id: 'bratislava-2', category: 'open', status: 'confirmed', consent_version: '2026-10', consent_at: new Date().toISOString() } });
    assert.equal(res.status, 409, JSON.stringify(res.body));
    assert.equal(res.body.code, '23505');
    assert.equal(sql(`select count(*) from public.registrations where rider_id = '${marek.rider_id}'`), '1');
  });

  test('registration needs an existing event', () => {
    assert.throws(() => createRegistration({ rider_id: marek.rider_id, event_id: 'neexistuje' }), /foreign key/);
  });

  test('rider_private is unique per lower(email) + birth_date', () => {
    createRider({ display_name: 'Prvý', email: 'Duplicita@Test.local', birth_date: '2001-02-03' });
    assert.throws(() => createRider({ display_name: 'Druhý', email: 'duplicita@test.local', birth_date: '2001-02-03' }), /duplicate key/);
    createRider({ display_name: 'Iný dátum', email: 'duplicita@test.local', birth_date: '2001-02-04' });
  });

  test('rider_ref must be 0x + 64 hex and country ISO-2 upper-case', () => {
    assert.throws(() => sql(`insert into public.riders (rider_ref, display_name) values ('abc', 'X')`), /check constraint/);
    assert.throws(() => sql(`insert into public.riders (rider_ref, display_name, country) values ('${riderRef()}', 'X', 'sk')`), /check constraint/);
  });

  test('categories and statuses are restricted', () => {
    const rider_id = createRider({ display_name: 'Kontrola Kategórie' });
    assert.throws(() => createRegistration({ rider_id, category: 'pro' }), /check constraint/);
    assert.throws(() => createRegistration({ rider_id, status: 'paid' }), /check constraint/);
  });
});

describe('functions', () => {
  test('points_for matches POINTS from data.js', () => {
    const got = sqlRows(`select p as place, public.points_for(p) as points from generate_series(1, 40) p`);
    for (const { place, points } of got) {
      const expected = POINTS.find(x => place <= x.upTo).points;
      assert.equal(points, expected, `place ${place}`);
    }
  });

  test('public_name modes: full, short, nick and nick fallback', () => {
    const rows = sqlRows(`select public.public_name('Marek Kupkovič', null, 'full') as full,
      public.public_name('Marek Kupkovič', null, 'short') as short,
      public.public_name('  marek   von   kupkovič ', null, 'short') as spaced,
      public.public_name('Marek Kupkovič', 'Kupko', 'nick') as nick,
      public.public_name('Marek Kupkovič', '', 'nick') as nick_empty,
      public.public_name('Marek Kupkovič', null, 'nick') as nick_null,
      public.public_name('Madonna', null, 'short') as single`)[0];
    assert.deepEqual(rows, { full: 'Marek Kupkovič', short: 'Marek K.', spaced: 'marek K.', nick: 'Kupko',
      nick_empty: 'Marek K.', nick_null: 'Marek K.', single: 'Madonna' });
  });

  test('rate_limit_hit flips to true after N calls (service_role only)', async () => {
    const key = `test:${randomUUID()}`;
    const calls = [];
    for (let i = 0; i < 4; i++) {
      const res = await rest('/rpc/rate_limit_hit', { method: 'POST', as: 'service_role', body: { p_key: key, p_limit: 3, p_window_minutes: 60 } });
      assert.equal(res.status, 200, JSON.stringify(res.body));
      calls.push(res.body);
    }
    assert.deepEqual(calls, [false, false, false, true]);
    assert.equal(sql(`select sum(count) from public.rate_limits where key = '${key}'`), '4');
    for (const as of ['anon', 'authenticated', 'admin']) {
      const res = await rest('/rpc/rate_limit_hit', { method: 'POST', as, body: { p_key: key, p_limit: 3, p_window_minutes: 60 } });
      assert.ok(DENIED.includes(res.status), `${as}: ${res.status} ${JSON.stringify(res.body)}`);
    }
    assert.equal(sql(`select sum(count) from public.rate_limits where key = '${key}'`), '4');
  });

  test('confirm_guardian flips pending_guardian to confirmed (service_role only)', async () => {
    const gt = randomUUID();
    const { registration_id } = riderWithRegistration({ display_name: 'Malý Jazdec', birth_date: '2013-01-01' },
      { category: 'u16', status: 'pending_guardian', guardian_token: gt });
    for (const as of ['anon', 'authenticated', 'admin']) {
      const res = await rest('/rpc/confirm_guardian', { method: 'POST', as, body: { p_token: gt } });
      assert.ok(DENIED.includes(res.status), `${as}: ${res.status}`);
    }
    assert.equal(sql(`select status from public.registrations where id = '${registration_id}'`), 'pending_guardian');

    const res = await rest('/rpc/confirm_guardian', { method: 'POST', as: 'service_role', body: { p_token: gt } });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.id, registration_id);
    assert.equal(res.body.status, 'confirmed');
    assert.equal(res.body.guardian_token, null);
    assert.ok(res.body.guardian_confirmed_at);

    const again = await rest('/rpc/confirm_guardian', { method: 'POST', as: 'service_role', body: { p_token: gt } });
    assert.equal(again.status, 404, JSON.stringify(again.body));
    assert.equal(again.body.code, 'PT404');
    assert.equal(again.body.message, 'invalid_token');
    const unknown = await rest('/rpc/confirm_guardian', { method: 'POST', as: 'service_role', body: { p_token: randomUUID() } });
    assert.equal(unknown.status, 404);
  });
});

describe('results and points', () => {
  test('points are computed by trigger from place', () => {
    sql(`insert into public.event_results (event_id, category, rider_name, place) values ('bratislava-2', 'open', 'Trigger Test', 3)`);
    assert.equal(sql(`select points from public.event_results where rider_name = 'Trigger Test'`), '60');
    sql(`update public.event_results set place = 1 where rider_name = 'Trigger Test'`);
    assert.equal(sql(`select points from public.event_results where rider_name = 'Trigger Test'`), '100');
    sql(`update public.event_results set points = 999 where rider_name = 'Trigger Test'`);
    assert.equal(sql(`select points from public.event_results where rider_name = 'Trigger Test'`), '100');
    sql(`delete from public.event_results where rider_name = 'Trigger Test'`);
  });

  test('two registered riders with the same name are two result rows; unregistered names stay unique', () => {
    const x = riderWithRegistration({ display_name: 'Ján Novák' });
    const y = riderWithRegistration({ display_name: 'Ján Novák' });
    sql(`insert into public.event_results (event_id, category, rider_name, place, registration_id) values
         ('bratislava-2', 'women', 'Ján Novák', 1, '${x.registration_id}'), ('bratislava-2', 'women', 'Ján Novák', 2, '${y.registration_id}')`);
    assert.equal(sql(`select count(*) from public.event_results where event_id = 'bratislava-2' and rider_name = 'Ján Novák'`), '2');
    sql(`insert into public.event_results (event_id, category, rider_name, place) values ('bratislava-2', 'women', 'Hosť', 3)`);
    assert.throws(() => sql(`insert into public.event_results (event_id, category, rider_name, place) values ('bratislava-2', 'women', 'Hosť', 4)`), /duplicate key/);
    sql(`delete from public.event_results where event_id = 'bratislava-2' and category = 'women'`);
  });

  test('a result needs a valid registration of the same event', () => {
    assert.throws(() => sql(`insert into public.event_results (event_id, category, rider_name, place, registration_id)
      values ('bratislava-2', 'open', 'Nikto', 1, '${randomUUID()}')`), /foreign key/);
    assert.throws(() => sql(`insert into public.event_results (event_id, category, rider_name, place, registration_id)
      values ('zilina-2026', 'u16', 'Marek', 1, '${marek.registration_id}')`), /registration_event_mismatch/);
  });

  test('results_public: legacy rows use rider_name, registered rows use public_name and NFT fields', async () => {
    sql(`insert into public.event_results (event_id, category, rider_name, place, registration_id)
         values ('bratislava-2', 'u16', 'Marek Kupkovič (interné)', 1, '${marek.registration_id}')`);
    const res = await rest('/results_public?select=*&event_id=eq.bratislava-2&category=eq.u16');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, [{ event_id: 'bratislava-2', category: 'u16', place: 1, points: 100, rider_id: marek.rider_id,
      public_name: 'Marek K.', chain_id: 31337, token_id: 7, nft_status: 'minted' }]);

    const legacy = await rest('/results_public?select=*&event_id=eq.bratislava-2026-05&category=eq.open&order=place');
    assert.equal(legacy.status, 200);
    assert.deepEqual(legacy.body.map(r => [r.place, r.public_name, r.rider_id, r.points]),
      [[1, 'Sebastian Kozmann', null, 100], [2, 'Tomáš Čekovský', null, 80], [3, 'Lukáš Ďuraj', null, 60]]);

    // priamo z event_results anon vidí len staršie výsledky bez registrácie (meno z formulára admina nie)
    const direct = await rest('/event_results?select=rider_name,registration_id&event_id=eq.bratislava-2');
    assert.equal(direct.status, 200);
    assert.ok(direct.body.every(r => r.registration_id === null), JSON.stringify(direct.body));
    assert.ok(!JSON.stringify(direct.body).includes('Kupkovič'));
    const admin = await rest('/event_results?select=rider_name&event_id=eq.bratislava-2', { as: 'admin' });
    assert.ok(JSON.stringify(admin.body).includes('Kupkovič'), 'admin sees registered rows');
  });

  test('erasing a rider keeps the result but drops the name', async () => {
    const r = riderWithRegistration({ display_name: 'Zmazaný Jazdec', mode: 'full' }, { event_id: 'bratislava-2' });
    sql(`insert into public.event_results (event_id, category, rider_name, place, registration_id)
         values ('bratislava-2', 'open', 'Zmazaný Jazdec', 2, '${r.registration_id}')`);
    sql(`delete from public.riders where id = '${r.rider_id}'`);
    assert.equal(sql(`select count(*) from public.registrations where id = '${r.registration_id}'`), '0');
    const rows = sqlRows(`select rider_name, registration_id, place, points from public.event_results
      where event_id = 'bratislava-2' and category = 'open' and place = 2`);
    assert.deepEqual(rows, [{ rider_name: 'GOSko jazdec', registration_id: null, place: 2, points: 80 }]);
    const pub = await rest('/results_public?select=public_name&event_id=eq.bratislava-2&category=eq.open&place=eq.2');
    assert.deepEqual(pub.body, [{ public_name: 'GOSko jazdec' }]);
  });
});

describe('public views expose no personal data', () => {
  test('riders_public short mode shows "Marek K." and only public columns', async () => {
    const res = await rest(`/riders_public?select=*&id=eq.${marek.rider_id}`);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, [{ id: marek.rider_id, public_name: 'Marek K.', country: 'SK', city: 'Bratislava', is_founder: false }]);
  });

  test('riders_public full / nick modes', async () => {
    const full = riderWithRegistration({ display_name: 'Tomáš Čekovský', mode: 'full' });
    const nick = riderWithRegistration({ display_name: 'Lukáš Ďuraj', nickname: 'Ďuro', mode: 'nick' });
    const res = await rest(`/riders_public?select=id,public_name&id=in.(${full.rider_id},${nick.rider_id})`);
    const byId = Object.fromEntries(res.body.map(r => [r.id, r.public_name]));
    assert.equal(byId[full.rider_id], 'Tomáš Čekovský');
    assert.equal(byId[nick.rider_id], 'Ďuro');
  });

  test('riders_public hides riders without a public registration (pending guardian, cancelled, u16 without consent)', async () => {
    const pending = riderWithRegistration({ display_name: 'Čakajúci Rodič' }, { category: 'u16', status: 'pending_guardian', guardian_token: randomUUID() });
    const cancelled = riderWithRegistration({ display_name: 'Zrušená Registrácia' }, { status: 'cancelled' });
    const noConsent = riderWithRegistration({ display_name: 'Bez Súhlasu' }, { category: 'u16', status: 'checked_in' });
    const consent = riderWithRegistration({ display_name: 'So Súhlasom' }, { category: 'u16', status: 'checked_in', guardian_confirmed_at: '2026-10-01T10:00:00Z' });
    const res = await rest(`/riders_public?select=id&id=in.(${[pending, cancelled, noConsent, consent].map(x => x.rider_id).join(',')})`);
    assert.deepEqual(res.body.map(r => r.id), [consent.rider_id]);

    sql(`insert into public.event_results (event_id, category, rider_name, place, registration_id)
         values ('bratislava-2', 'u16', 'Bez Súhlasu', 5, '${noConsent.registration_id}')`);
    const r = await rest('/results_public?select=public_name,rider_id&event_id=eq.bratislava-2&category=eq.u16&place=eq.5');
    assert.deepEqual(r.body, [{ public_name: 'GOSko jazdec', rider_id: noConsent.rider_id }]);
  });

  test('no public view has a personal-data column', () => {
    const cols = sqlRows(`select table_name, column_name from information_schema.columns
      where table_schema = 'public' and table_name in ('riders_public', 'results_public', 'events_public')`);
    const leaked = cols.filter(c => PII_KEYS.includes(c.column_name));
    assert.deepEqual(leaked, []);
    assert.deepEqual(cols.filter(c => c.table_name === 'results_public').map(c => c.column_name),
      ['event_id', 'category', 'place', 'points', 'rider_id', 'public_name', 'chain_id', 'token_id', 'nft_status']);
    assert.deepEqual(cols.filter(c => c.table_name === 'riders_public').map(c => c.column_name),
      ['id', 'public_name', 'country', 'city', 'is_founder']);
  });

  test('events_public lists the seeded events', async () => {
    const res = await rest('/events_public?select=id,status,registration_open,date,season&order=id');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, [
      { id: 'bratislava-2', status: 'open', registration_open: true, date: null, season: 2026 },
      { id: 'bratislava-2026-05', status: 'done', registration_open: false, date: '2026-05-31', season: 2026 },
      { id: 'zilina-2026', status: 'done', registration_open: false, date: null, season: 2026 },
    ]);
  });
});

describe('seed and re-runnable migrations', () => {
  test('seed has Bratislava results from data.js with points', () => {
    const rows = sqlRows(`select category, place, rider_name, points from public.event_results
      where event_id = 'bratislava-2026-05' order by category, place`);
    assert.deepEqual(rows, [
      { category: 'open', place: 1, rider_name: 'Sebastian Kozmann', points: 100 },
      { category: 'open', place: 2, rider_name: 'Tomáš Čekovský', points: 80 },
      { category: 'open', place: 3, rider_name: 'Lukáš Ďuraj', points: 60 },
      { category: 'u16', place: 1, rider_name: 'Marek Kupkovič', points: 100 },
      { category: 'u16', place: 2, rider_name: 'Andrej Jaško', points: 80 },
      { category: 'u16', place: 3, rider_name: 'Tomáš Matel', points: 60 },
      { category: 'women', place: 1, rider_name: 'Júlia Dubovská', points: 100 },
    ]);
  });

  test('migrations 001-003 and the seed can be applied again without changes', async () => {
    const state = () => sql(`select md5(string_agg(x, '|' order by x)) from (
      select id || status || category as x from public.registrations
      union all select id || name || status || registration_open::text from public.events
      union all select event_id || category || rider_name || place || points from public.event_results
      union all select id::text || public_name_mode from public.riders) s`);
    const before = state();
    for (const f of ['001_hardening', '002_registration_v2', '003_results_rpc']) sqlFile(join(ROOT, 'supabase', 'migrations', `${f}.sql`));
    sqlFile(join(ROOT, 'supabase', 'seed', 'events_2026.sql'));
    assert.equal(state(), before);
    assert.equal(sql(`select count(*) from public.registrations_legacy`), '1');
    const res = await rest('/registrations?select=*');
    assert.ok(DENIED.includes(res.status) || res.body.length === 0);
    assert.equal((await rest('/riders_public?select=id')).status, 200);
  });
});

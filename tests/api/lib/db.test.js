import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, DbError, UniqueViolationError, isUniqueViolation, eq, inList } from '../../../api/_lib/db.js';

function fakeFetch(responder) {
  const calls = [];
  const f = async (url, init) => {
    calls.push({ url, init });
    return responder(url, init, calls.length);
  };
  f.calls = calls;
  return f;
}
const json = (status, body, headers = {}) => new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

test('select: URL, hlavičky service role, filtre a poradie', async () => {
  const f = fakeFetch(() => json(200, [{ id: 'e1' }]));
  const db = createDb({ url: 'http://pg.test/rest/v1/', key: 'srv', fetch: f });
  const rows = await db.select('events', { id: eq('e1'), status: ['neq.cancelled', 'neq.done'] }, { select: 'id,name', order: 'date.asc', limit: 5 });
  assert.deepEqual(rows, [{ id: 'e1' }]);
  const { url, init } = f.calls[0];
  const u = new URL(url);
  assert.equal(u.origin + u.pathname, 'http://pg.test/rest/v1/events');
  assert.equal(u.searchParams.get('select'), 'id,name');
  assert.equal(u.searchParams.get('id'), 'eq.e1');
  assert.deepEqual(u.searchParams.getAll('status'), ['neq.cancelled', 'neq.done']);
  assert.equal(u.searchParams.get('order'), 'date.asc');
  assert.equal(u.searchParams.get('limit'), '5');
  assert.equal(init.method, 'GET');
  assert.equal(init.headers.apikey, 'srv');
  assert.equal(init.headers.Authorization, 'Bearer srv');
});

test('insert: Prefer return=representation a JSON telo', async () => {
  const f = fakeFetch(() => json(201, [{ id: 'r1', a: 1 }]));
  const db = createDb({ url: 'http://pg.test', key: 'srv', fetch: f });
  const out = await db.insert('riders', { a: 1 });
  assert.deepEqual(out, [{ id: 'r1', a: 1 }]);
  assert.equal(f.calls[0].init.method, 'POST');
  assert.equal(f.calls[0].init.headers.Prefer, 'return=representation');
  assert.equal(f.calls[0].init.headers['Content-Type'], 'application/json');
  assert.equal(f.calls[0].init.body, JSON.stringify({ a: 1 }));
});

test('insert s ignoreDuplicates a on_conflict', async () => {
  const f = fakeFetch(() => json(201, []));
  const db = createDb({ url: 'http://pg.test', key: 'srv', fetch: f });
  await db.insert('nft_tokens', { registration_id: 'x' }, { ignoreDuplicates: true, onConflict: 'registration_id' });
  assert.match(f.calls[0].init.headers.Prefer, /resolution=ignore-duplicates/);
  assert.equal(new URL(f.calls[0].url).searchParams.get('on_conflict'), 'registration_id');
});

test('update a delete vyžadujú filter', async () => {
  const db = createDb({ url: 'http://pg.test', key: 'srv', fetch: fakeFetch(() => json(200, [])) });
  await assert.rejects(db.update('registrations', {}, { status: 'x' }), DbError);
  await assert.rejects(db.delete('registrations', {}), DbError);
});

test('update: PATCH s filtrom', async () => {
  const f = fakeFetch(() => json(200, [{ id: 'r1', status: 'checked_in' }]));
  const db = createDb({ url: 'http://pg.test', key: 'srv', fetch: f });
  const rows = await db.update('registrations', { id: eq('r1') }, { status: 'checked_in' });
  assert.equal(rows[0].status, 'checked_in');
  assert.equal(f.calls[0].init.method, 'PATCH');
  assert.equal(new URL(f.calls[0].url).searchParams.get('id'), 'eq.r1');
});

test('rpc: POST na /rpc/<fn> a vráti JSON (aj skalár)', async () => {
  const f = fakeFetch(() => json(200, true));
  const db = createDb({ url: 'http://pg.test', key: 'srv', fetch: f });
  assert.equal(await db.rpc('rate_limit_hit', { p_key: 'k', p_limit: 5, p_window_minutes: 10 }), true);
  assert.equal(new URL(f.calls[0].url).pathname, '/rpc/rate_limit_hit');
  assert.deepEqual(JSON.parse(f.calls[0].init.body), { p_key: 'k', p_limit: 5, p_window_minutes: 10 });
});

test('rpc: prázdne telo vráti null', async () => {
  const db = createDb({ url: 'http://pg.test', key: 'srv', fetch: fakeFetch(() => new Response(null, { status: 204 })) });
  assert.equal(await db.rpc('confirm_guardian', { p_token: 'x' }), null);
});

test('chyba 23505 sa mapuje na UniqueViolationError', async () => {
  const db = createDb({ url: 'http://pg.test', key: 'srv', fetch: fakeFetch(() => json(409, { code: '23505', message: 'duplicate key', details: 'Key (rider_id, event_id)' })) });
  const err = await db.insert('registrations', {}).catch(e => e);
  assert.ok(err instanceof UniqueViolationError);
  assert.equal(isUniqueViolation(err), true);
  assert.equal(err.status, 409);
});

test('iná chyba PostgREST je DbError s kódom', async () => {
  const db = createDb({ url: 'http://pg.test', key: 'srv', fetch: fakeFetch(() => json(400, { code: '22P02', message: 'invalid input syntax for type uuid' })) });
  const err = await db.select('registrations', { id: eq('x') }).catch(e => e);
  assert.ok(err instanceof DbError);
  assert.ok(!(err instanceof UniqueViolationError));
  assert.equal(err.code, '22P02');
  assert.equal(err.status, 400);
});

test('sieťová chyba je DbError network', async () => {
  const db = createDb({ url: 'http://pg.test', key: 'srv', fetch: async () => { throw new TypeError('fetch failed'); } });
  const err = await db.select('events').catch(e => e);
  assert.equal(err.code, 'network');
});

test('bez konfigurácie DbError not_configured, bez volania fetch', async () => {
  let called = false;
  const db = createDb({ url: '', key: '', fetch: async () => { called = true; } });
  const err = await db.select('events').catch(e => e);
  assert.equal(err.code, 'not_configured');
  assert.equal(called, false);
});

test('count: HEAD s Prefer count=exact a Content-Range', async () => {
  const f = fakeFetch(() => new Response(null, { status: 200, headers: { 'content-range': '*/7' } }));
  const db = createDb({ url: 'http://pg.test', key: 'srv', fetch: f });
  assert.equal(await db.count('registrations', { event_id: eq('e1') }), 7);
  assert.equal(f.calls[0].init.method, 'HEAD');
  assert.equal(f.calls[0].init.headers.Prefer, 'count=exact');
});

test('inList: úvodzovky pre hodnoty s čiarkou', () => {
  assert.equal(inList(['a', 'b']), 'in.(a,b)');
  assert.equal(inList(['a,b', 'c']), 'in.("a,b",c)');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readJson, send, redirect, allowMethods, clientIp, queryOf, bearerToken, ApiError, sendError, pathParam } from '../../../api/_lib/http.js';
import { mockReq, mockRes } from '../_support/fakes.js';

test('readJson: objekt od Vercelu sa vráti priamo', async () => {
  assert.deepEqual(await readJson(mockReq({ method: 'POST', body: { a: 1 } })), { a: 1 });
});

test('readJson: string a Buffer sa parsujú', async () => {
  assert.deepEqual(await readJson(mockReq({ method: 'POST', body: '{"a":2}' })), { a: 2 });
  assert.deepEqual(await readJson(mockReq({ method: 'POST', body: Buffer.from('{"a":3}') })), { a: 3 });
});

test('readJson: čistý Node stream', async () => {
  assert.deepEqual(await readJson(mockReq({ method: 'POST', rawBody: '{"b":true}' })), { b: true });
  assert.deepEqual(await readJson(mockReq({ method: 'POST', rawBody: '' })), {});
});

test('readJson: zlý JSON alebo pole vyhodí ApiError 400 invalid_input', async () => {
  await assert.rejects(readJson(mockReq({ method: 'POST', rawBody: '{nie' })), e => e instanceof ApiError && e.status === 400 && e.code === 'invalid_input');
  await assert.rejects(readJson(mockReq({ method: 'POST', body: '[1,2]' })), e => e.status === 400);
});

test('readJson: príliš veľké telo vyhodí 413', async () => {
  const big = '{"a":"' + 'x'.repeat(70_000) + '"}';
  await assert.rejects(readJson(mockReq({ method: 'POST', rawBody: big })), e => e.status === 413);
});

test('send: JSON s no-store', () => {
  const res = mockRes();
  send(res, 201, { ok: true });
  assert.equal(res.statusCode, 201);
  assert.match(res.headers['content-type'], /application\/json/);
  assert.equal(res.headers['cache-control'], 'no-store');
  assert.deepEqual(res.json, { ok: true });
});

test('redirect: 302 s Location', () => {
  const res = mockRes();
  redirect(res, 'https://gosko.sk/#/x');
  assert.equal(res.statusCode, 302);
  assert.equal(res.headers.location, 'https://gosko.sk/#/x');
});

test('allowMethods: nepovolená metóda dostane 405 a Allow', () => {
  const res = mockRes();
  assert.equal(allowMethods(mockReq({ method: 'GET' }), res, ['POST']), false);
  assert.equal(res.statusCode, 405);
  assert.equal(res.headers.allow, 'POST');
  assert.equal(res.json.error, 'method_not_allowed');
  assert.equal(allowMethods(mockReq({ method: 'POST' }), mockRes(), ['POST']), true);
});

test('clientIp: prvá adresa z x-forwarded-for, potom x-real-ip', () => {
  assert.equal(clientIp(mockReq({ headers: { 'x-forwarded-for': ' 198.51.100.1 , 10.0.0.1' } })), '198.51.100.1');
  const r = mockReq({ headers: { 'x-real-ip': '198.51.100.9' } });
  delete r.headers['x-forwarded-for'];
  assert.equal(clientIp(r), '198.51.100.9');
  const n = mockReq();
  delete n.headers['x-forwarded-for'];
  assert.equal(clientIp(n), 'unknown');
});

test('queryOf: req.query alebo URL', () => {
  assert.deepEqual(queryOf(mockReq({ query: { token: 'a' } })), { token: 'a' });
  assert.deepEqual(queryOf(mockReq({ url: '/api/pass?token=b&x=1' })), { token: 'b', x: '1' });
});

test('pathParam: z req.query alebo z posledného segmentu cesty', () => {
  assert.equal(pathParam(mockReq({ query: { id: '12' } }), 'id'), '12');
  assert.equal(pathParam(mockReq({ url: '/api/nft/metadata/34?x=1' }), 'id'), '34');
});

test('bearerToken', () => {
  assert.equal(bearerToken(mockReq({ headers: { authorization: 'Bearer abc.def' } })), 'abc.def');
  assert.equal(bearerToken(mockReq({ headers: { authorization: 'Basic x' } })), null);
  assert.equal(bearerToken(mockReq()), null);
});

test('sendError: ApiError zachová kód, neznáma chyba je 500 bez detailov', () => {
  const r1 = mockRes();
  sendError(r1, new ApiError(422, 'event_closed', 'Registrácia je uzavretá.'));
  assert.equal(r1.statusCode, 422);
  assert.deepEqual(r1.json, { ok: false, error: 'event_closed', message: 'Registrácia je uzavretá.' });
  const r2 = mockRes();
  sendError(r2, new Error('password=tajne'), { error() {} });
  assert.equal(r2.statusCode, 500);
  assert.equal(r2.json.error, 'server_error');
  assert.ok(!r2.body.includes('tajne'));
});

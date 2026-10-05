// GET /api/consent, GET a POST /api/pass.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHandler as consentHandler } from '../../api/consent.js';
import { createHandler as passHandler } from '../../api/pass.js';
import { DbError } from '../../api/_lib/db.js';
import { FakeDb, fakeMail, testEnv, silentLog, fixedNow, baseEvent, call } from './_support/fakes.js';

const RIDER = 'bbbbbbbb-0000-4000-8000-000000000001';
const REG = 'aaaaaaaa-0000-4000-8000-000000000001';
const TOKEN = 'dddddddd-0000-4000-8000-000000000001';
const GTOKEN = 'eeeeeeee-0000-4000-8000-000000000001';
const OK = 'https://gosko.test/#/registracia/potvrdene';
const BAD = 'https://gosko.test/#/registracia/neplatny-odkaz';

function seed(regOver = {}) {
  return new FakeDb({
    events: [baseEvent()],
    riders: [{ id: RIDER, rider_ref: '0x' + '1'.repeat(64), display_name: 'Peter Malý', nickname: 'Peťo', public_name_mode: 'nick' }],
    rider_private: [{ rider_id: RIDER, legal_name: 'Peter Malý', birth_date: '2012-05-01', email: 'peto@example.sk', guardian_email: 'mama@example.sk' }],
    registrations: [{ id: REG, rider_id: RIDER, event_id: 'bratislava-2026-11', category: 'u16', status: 'pending_guardian', token: TOKEN, guardian_token: GTOKEN, consent_version: '2026-10', consent_at: '2026-10-05T10:00:00Z', ...regOver }],
  });
}
const consent = (db, mail = fakeMail()) => consentHandler({ env: testEnv(), db, mail, log: silentLog, now: fixedNow() });

/* ---------- consent ---------- */
test('consent: platný token potvrdí a presmeruje na potvrdene', async () => {
  const db = seed();
  const mail = fakeMail();
  const res = await call(consent(db, mail), { url: `/api/consent?token=${GTOKEN}`, query: { token: GTOKEN } });
  assert.equal(res.statusCode, 302);
  assert.equal(res.headers.location, OK);
  const reg = db.t('registrations')[0];
  assert.equal(reg.status, 'confirmed');
  assert.ok(reg.guardian_confirmed_at);
  assert.equal(reg.guardian_token, null);
  assert.deepEqual(db.callsOf('rpc', 'confirm_guardian')[0].args, { p_token: GTOKEN });
  // jazdec dostane potvrdenie s passom
  assert.equal(mail.sent.length, 1);
  assert.equal(mail.sent[0].to, 'peto@example.sk');
  assert.ok(mail.sent[0].text.includes(`https://gosko.test/#/pass/${TOKEN}`));
  assert.ok(db.t('audit_log').some(a => a.action === 'guardian_confirm'));
});

test('consent: použitý token (druhé kliknutie) ide na neplatny-odkaz', async () => {
  const db = seed();
  const h = consent(db);
  await call(h, { query: { token: GTOKEN } });
  const again = await call(h, { query: { token: GTOKEN } });
  assert.equal(again.statusCode, 302);
  assert.equal(again.headers.location, BAD);
});

test('consent: neplatný alebo chýbajúci token ide na neplatny-odkaz bez volania DB', async () => {
  for (const q of [{ token: 'nie-uuid' }, {}, { token: '' }]) {
    const db = seed();
    const res = await call(consent(db), { query: q });
    assert.equal(res.statusCode, 302);
    assert.equal(res.headers.location, BAD);
    assert.equal(db.calls.length, 0);
  }
});

test('consent: neznámy token (RPC vráti null alebo prázdny riadok) ide na neplatny-odkaz', async () => {
  for (const ret of [null, { id: null, status: null }, []]) {
    const db = seed();
    db.rpcs.confirm_guardian = () => ret;
    const res = await call(consent(db), { query: { token: GTOKEN } });
    assert.equal(res.headers.location, BAD, JSON.stringify(ret));
  }
});

test('consent: výnimka z DB funkcie (4xx) je neplatný odkaz, výpadok DB je 503 bez presmerovania', async () => {
  const db = seed();
  db.failNext['rpc:confirm_guardian'] = new DbError({ status: 400, code: 'P0001', message: 'invalid token' });
  const r1 = await call(consent(db), { query: { token: GTOKEN } });
  assert.equal(r1.headers.location, BAD);
  db.failNext['rpc:confirm_guardian'] = new DbError({ status: 503, code: 'network', message: 'down' });
  const r2 = await call(consent(db), { query: { token: GTOKEN } });
  assert.equal(r2.statusCode, 503);
  assert.match(r2.headers['content-type'], /text\/html/);
  assert.equal(db.t('registrations')[0].status, 'pending_guardian');
});

test('consent: chyba e-mailu jazdcovi nezastaví presmerovanie', async () => {
  const res = await call(consent(seed(), fakeMail({ fail: true })), { query: { token: GTOKEN } });
  assert.equal(res.headers.location, OK);
});

test('consent: POST je 405', async () => {
  assert.equal((await call(consent(seed()), { method: 'POST', query: { token: GTOKEN } })).statusCode, 405);
});

/* ---------- pass GET ---------- */
const pass = (db, mail = fakeMail()) => passHandler({ env: testEnv(), db, mail, log: silentLog, now: fixedNow() });

test('GET pass: vráti pass so stavom a verejným menom, bez osobných údajov', async () => {
  const db = seed({ status: 'confirmed' });
  const res = await call(pass(db), { query: { token: TOKEN } });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json, {
    ok: true,
    pass: { token: TOKEN, event_id: 'bratislava-2026-11', event_name: 'GOSko Bratislava', public_name: 'Peťo', category: 'u16', status: 'confirmed' },
  });
  for (const leak of ['peto@', '2012-05-01', 'Malý', 'mama@']) assert.ok(!res.body.includes(leak), leak);
});

test('GET pass: neznámy alebo neplatný token je 404', async () => {
  const r1 = await call(pass(seed()), { query: { token: 'dddddddd-0000-4000-8000-00000000ffff' } });
  assert.equal(r1.statusCode, 404);
  assert.equal(r1.json.error, 'not_found');
  const db = seed();
  const r2 = await call(pass(db), { query: { token: 'x' } });
  assert.equal(r2.statusCode, 404);
  assert.equal(db.calls.length, 0);
});

/* ---------- pass POST ---------- */
test('POST pass: existujúca registrácia dostane e-mail s odkazom, odpoveď je vždy {ok:true}', async () => {
  const db = seed({ status: 'confirmed' });
  const mail = fakeMail();
  const h = pass(db, mail);
  const hit = await call(h, { method: 'POST', body: { email: ' PETO@example.sk', event_id: 'bratislava-2026-11' } });
  assert.equal(hit.statusCode, 200);
  assert.deepEqual(hit.json, { ok: true });
  assert.equal(mail.sent.length, 1);
  assert.equal(mail.sent[0].to, 'peto@example.sk');
  assert.ok(mail.sent[0].text.includes(`https://gosko.test/#/pass/${TOKEN}`));

  const miss = await call(h, { method: 'POST', body: { email: 'nikto@example.sk', event_id: 'bratislava-2026-11' } });
  assert.equal(miss.statusCode, 200);
  assert.equal(miss.body, hit.body, 'odpoveď neprezradí, či registrácia existuje');
  const otherEvent = await call(h, { method: 'POST', body: { email: 'peto@example.sk', event_id: 'iny-event' } });
  assert.equal(otherEvent.body, hit.body);
  const invalid = await call(h, { method: 'POST', body: { email: 'zly', event_id: '' } });
  assert.equal(invalid.body, hit.body);
  assert.equal(mail.sent.length, 1);
});

test('POST pass: zrušená registrácia nedostane e-mail', async () => {
  const mail = fakeMail();
  await call(pass(seed({ status: 'cancelled' }), mail), { method: 'POST', body: { email: 'peto@example.sk', event_id: 'bratislava-2026-11' } });
  assert.equal(mail.sent.length, 0);
});

test('POST pass: nad limit sa e-mail nepošle, odpoveď je stále {ok:true}', async () => {
  const db = seed({ status: 'confirmed' });
  const mail = fakeMail();
  const h = pass(db, mail);
  for (let i = 0; i < 7; i++) {
    const r = await call(h, { method: 'POST', body: { email: 'peto@example.sk', event_id: 'bratislava-2026-11' } });
    assert.deepEqual(r.json, { ok: true });
  }
  assert.equal(mail.sent.length, 5);
  assert.equal(db.callsOf('rpc', 'rate_limit_hit')[0].args.p_key, 'pass:203.0.113.7');
});

test('POST pass: výpadok DB aj e-mailu vráti {ok:true}', async () => {
  const db = seed({ status: 'confirmed' });
  db.failNext['select:rider_private'] = new Error('down');
  const r = await call(pass(db), { method: 'POST', body: { email: 'peto@example.sk', event_id: 'bratislava-2026-11' } });
  assert.deepEqual(r.json, { ok: true });
  const r2 = await call(pass(seed({ status: 'confirmed' }), fakeMail({ fail: true })), { method: 'POST', body: { email: 'peto@example.sk', event_id: 'bratislava-2026-11' } });
  assert.deepEqual(r2.json, { ok: true });
});

test('pass: iná metóda je 405', async () => {
  assert.equal((await call(pass(seed()), { method: 'DELETE' })).statusCode, 405);
});

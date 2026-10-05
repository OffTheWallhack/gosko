// mail, turnstile, ratelimit, auth: všetko s falošným fetch, bez siete.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMailer, confirmationMail, guardianConsentMail, passResendMail, formatDateSk, escapeHtml } from '../../../api/_lib/mail.js';
import { createTurnstile } from '../../../api/_lib/turnstile.js';
import { rateLimitHit } from '../../../api/_lib/ratelimit.js';
import { createAuth } from '../../../api/_lib/auth.js';
import { FakeDb, testEnv, mockReq, ADMIN_ID } from '../_support/fakes.js';

const EM_DASH = '\u2014';
const recorder = (responder) => {
  const calls = [];
  const f = async (url, init) => { calls.push({ url: String(url), init }); return responder(url, init); };
  f.calls = calls;
  return f;
};
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/* ---------- mail ---------- */
test('mail: bez RESEND_API_KEY sa e-mail iba zaloguje [mail:dev]', async () => {
  const logged = [];
  const f = recorder(() => { throw new Error('nesmie volať sieť'); });
  const m = createMailer({ env: testEnv({ RESEND_API_KEY: '' }), fetch: f, log: { info: (...a) => logged.push(a), warn() {} } });
  const r = await m.send({ to: 'a@b.sk', subject: 'S', text: 'T', html: '<p>T</p>' });
  assert.equal(r.dev, true);
  assert.equal(f.calls.length, 0);
  assert.equal(logged[0][0], '[mail:dev]');
});

test('mail: v produkcii bez kľúča sa nelogujú osobné údaje', async () => {
  const logged = [];
  const m = createMailer({ env: testEnv({ RESEND_API_KEY: '', production: true }), log: { info: (...a) => logged.push(a), warn: (...a) => logged.push(a) } });
  await m.send({ to: 'tajny@b.sk', subject: 'S', text: 'odkaz https://x/#/pass/tok', html: '' });
  assert.ok(!JSON.stringify(logged).includes('tajny@b.sk'));
  assert.ok(!JSON.stringify(logged).includes('tok'));
});

test('mail: Resend dostane from, to, subject, text a html', async () => {
  const f = recorder(() => json(200, { id: 're_1' }));
  const m = createMailer({ env: testEnv({ RESEND_API_KEY: 're_key' }), fetch: f });
  const r = await m.send({ to: 'a@b.sk', subject: 'S', text: 'T', html: '<p>T</p>' });
  assert.equal(r.id, 're_1');
  assert.equal(f.calls[0].url, 'https://api.resend.com/emails');
  assert.equal(f.calls[0].init.headers.Authorization, 'Bearer re_key');
  const body = JSON.parse(f.calls[0].init.body);
  assert.deepEqual(body, { from: 'GOSko <registracia@gosko.sk>', to: ['a@b.sk'], subject: 'S', text: 'T', html: '<p>T</p>' });
});

test('mail: chyba Resend vyhodí MailError', async () => {
  const m = createMailer({ env: testEnv({ RESEND_API_KEY: 're_key' }), fetch: async () => json(422, { message: 'bad from' }) });
  await assert.rejects(m.send({ to: 'a@b.sk', subject: 'S', text: 'T', html: '' }), /Resend 422/);
});

test('šablóny: slovensky, s odkazom, bez dlhých pomlčiek, HTML escapované', () => {
  const c = confirmationMail({ eventName: 'GOSko Bratislava', eventDate: '2026-11-21', eventCity: 'Bratislava', publicName: 'Marek K.', category: 'open', passUrl: 'https://gosko.sk/#/pass/abc' });
  assert.match(c.subject, /Registrácia potvrdená/);
  assert.ok(c.text.includes('https://gosko.sk/#/pass/abc'));
  assert.ok(c.text.includes('21. 11. 2026'));
  assert.ok(c.html.includes('href="https://gosko.sk/#/pass/abc"'));

  const g = guardianConsentMail({ guardianName: 'Jana <b>', riderName: 'Peťo', eventName: 'GOSko Bratislava', eventDate: null, eventCity: null, nft: true, photo: true, consentUrl: 'https://gosko.sk/api/consent?token=t1' });
  assert.ok(g.text.includes('https://gosko.sk/api/consent?token=t1'));
  assert.ok(g.text.includes('NFT'));
  assert.ok(g.text.includes('dátum upresníme'));
  assert.ok(g.html.includes('Jana &lt;b&gt;'));
  assert.ok(!g.html.includes('Jana <b>'));

  const p = passResendMail({ eventName: 'GOSko Bratislava', eventDate: '2026-11-21', passUrl: 'https://gosko.sk/#/pass/x' });
  for (const m of [c, g, p]) {
    assert.ok(!m.text.includes(EM_DASH) && !m.subject.includes(EM_DASH) && !m.html.includes(EM_DASH));
  }
});

test('formatDateSk a escapeHtml', () => {
  assert.equal(formatDateSk('2026-05-31'), '31. 5. 2026');
  assert.equal(formatDateSk(null), '');
  assert.equal(escapeHtml(`<a href="x">'&`), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;');
});

/* ---------- turnstile ---------- */
test('turnstile: bez kľúča mimo produkcie bypass', async () => {
  const t = createTurnstile({ env: testEnv({ TURNSTILE_SECRET_KEY: '' }), fetch: async () => { throw new Error('nie'); } });
  assert.deepEqual(await t.verify('', '1.2.3.4'), { ok: true, bypass: true });
});

test('turnstile: bez kľúča v produkcii zlyhá', async () => {
  const t = createTurnstile({ env: testEnv({ TURNSTILE_SECRET_KEY: '', production: true }), log: { error() {} } });
  assert.equal((await t.verify('tok', '1.2.3.4')).ok, false);
});

test('turnstile: siteverify so secret, response a remoteip', async () => {
  const f = recorder(() => json(200, { success: true }));
  const t = createTurnstile({ env: testEnv(), fetch: f });
  assert.equal((await t.verify('tok', '1.2.3.4')).ok, true);
  const body = f.calls[0].init.body;
  assert.equal(body.get('secret'), 'ts-secret');
  assert.equal(body.get('response'), 'tok');
  assert.equal(body.get('remoteip'), '1.2.3.4');
});

test('turnstile: neplatný token, prázdny token a výpadok siete zlyhajú', async () => {
  const bad = createTurnstile({ env: testEnv(), fetch: async () => json(200, { success: false, 'error-codes': ['invalid-input-response'] }) });
  assert.deepEqual(await bad.verify('x', 'ip'), { ok: false, codes: ['invalid-input-response'] });
  assert.equal((await bad.verify('', 'ip')).ok, false);
  const down = createTurnstile({ env: testEnv(), fetch: async () => { throw new TypeError('fetch failed'); }, log: { warn() {} } });
  assert.equal((await down.verify('x', 'ip')).ok, false);
});

/* ---------- ratelimit ---------- */
test('rateLimitHit volá rpc rate_limit_hit s kľúčom, limitom a oknom', async () => {
  const db = new FakeDb();
  for (let i = 0; i < 5; i++) assert.equal(await rateLimitHit(db, 'reg:1.2.3.4', 5, 10), false);
  assert.equal(await rateLimitHit(db, 'reg:1.2.3.4', 5, 10), true);
  assert.deepEqual(db.callsOf('rpc', 'rate_limit_hit')[0].args, { p_key: 'reg:1.2.3.4', p_limit: 5, p_window_minutes: 10 });
});

/* ---------- auth ---------- */
test('auth: bez Bearer 401, bez volania siete', async () => {
  const f = recorder(() => json(200, {}));
  const a = createAuth({ env: testEnv(), db: new FakeDb(), fetch: f });
  await assert.rejects(a.requireAdmin(mockReq()), e => e.status === 401 && e.code === 'unauthorized');
  assert.equal(f.calls.length, 0);
});

test('auth: neplatný JWT (GoTrue 401) vráti 401', async () => {
  const a = createAuth({ env: testEnv(), db: new FakeDb(), fetch: async () => json(401, { msg: 'bad jwt' }) });
  await assert.rejects(a.requireAdmin(mockReq({ headers: { authorization: 'Bearer zly' } })), e => e.status === 401);
});

test('auth: platný používateľ, ktorý nie je admin, dostane 403', async () => {
  const f = recorder(() => json(200, { id: '22222222-2222-4222-8222-222222222222' }));
  const db = new FakeDb({ admins: [{ user_id: ADMIN_ID }] });
  const a = createAuth({ env: testEnv(), db, fetch: f });
  await assert.rejects(a.requireAdmin(mockReq({ headers: { authorization: 'Bearer user-jwt' } })), e => e.status === 403 && e.code === 'forbidden');
  assert.equal(f.calls[0].url, 'http://db.test/auth/v1/user');
  assert.equal(f.calls[0].init.headers.Authorization, 'Bearer user-jwt');
  assert.equal(f.calls[0].init.headers.apikey, 'service-key');
});

test('auth: admin prejde a vráti userId', async () => {
  const db = new FakeDb({ admins: [{ user_id: ADMIN_ID }] });
  const a = createAuth({ env: testEnv(), db, fetch: async () => json(200, { id: ADMIN_ID, email: 'x@y.sk' }) });
  assert.deepEqual(await a.requireAdmin(mockReq({ headers: { authorization: 'Bearer ok' } })), { userId: ADMIN_ID });
});

test('auth: výpadok GoTrue je 503', async () => {
  const a = createAuth({ env: testEnv(), db: new FakeDb(), fetch: async () => { throw new TypeError('fetch failed'); } });
  await assert.rejects(a.requireAdmin(mockReq({ headers: { authorization: 'Bearer ok' } })), e => e.status === 503);
});

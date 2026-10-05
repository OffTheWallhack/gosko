// POST /api/register podľa kontraktu §3.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../../api/register.js';
import { FakeDb, fakeMail, fakeTurnstile, testEnv, silentLog, fixedNow, baseEvent, call } from './_support/fakes.js';

const EVENT_ID = 'bratislava-2026-11';

function setup({ event = baseEvent(), turnstileOk = true, mailFail = false, env = {}, db } = {}) {
  db = db || new FakeDb({ events: [event] });
  const mail = fakeMail({ fail: mailFail });
  const turnstile = fakeTurnstile(turnstileOk);
  let n = 0;
  const handler = createHandler({
    env: testEnv(env), db, mail, turnstile, log: silentLog, now: fixedNow('2026-10-05T10:00:00Z'),
    uuid: () => `99999999-0000-4000-8000-${String(++n).padStart(12, '0')}`,
  });
  return { db, mail, turnstile, handler };
}

const adult = (over = {}) => ({
  event_id: EVENT_ID,
  legal_name: 'Marek Kováč',
  birth_date: '2000-04-10',
  email: 'Marek@Example.sk',
  phone: '+421 900 123 456',
  country: 'SK',
  city: 'Bratislava',
  public_name_mode: 'short',
  consents: { rules: true, privacy: true, photo: true, nft: true },
  turnstile_token: 'tok',
  ...over,
});
// 14 rokov k 21. 11. 2026
const kid = (over = {}) => adult({ legal_name: 'Peter Malý', email: 'peto@example.sk', birth_date: '2012-05-01', ...over });

const post = (handler, body, headers = {}) => call(handler, { method: 'POST', url: '/api/register', body, headers });

test('dospelý: 201 confirmed, pass, open, mail s odkazom na pass', async () => {
  const { handler, db, mail } = setup();
  const res = await post(handler, adult());
  assert.equal(res.statusCode, 201, res.body);
  const b = res.json;
  assert.equal(b.ok, true);
  assert.equal(b.status, 'confirmed');
  assert.deepEqual(Object.keys(b.pass).sort(), ['category', 'event_id', 'event_name', 'public_name', 'token']);
  assert.equal(b.pass.event_id, EVENT_ID);
  assert.equal(b.pass.event_name, 'GOSko Bratislava');
  assert.equal(b.pass.public_name, 'Marek K.');
  assert.equal(b.pass.category, 'open');
  assert.equal(b.mail_sent, true);
  const reg = db.t('registrations')[0];
  assert.equal(b.pass.token, reg.token);
  assert.equal(mail.sent.length, 1);
  assert.equal(mail.sent[0].to, 'marek@example.sk');
  assert.ok(mail.sent[0].text.includes(`https://gosko.test/#/pass/${reg.token}`));
});

test('súhlas sa uloží s verziou a časom, foto a NFT súhlas tiež', async () => {
  const { handler, db } = setup({ env: { CONSENT_VERSION: '2026-10b' } });
  await post(handler, adult({ consents: { rules: true, privacy: true, photo: false, nft: true } }));
  const reg = db.t('registrations')[0];
  assert.equal(reg.consent_version, '2026-10b');
  assert.equal(reg.consent_at, '2026-10-05T10:00:00.000Z');
  assert.equal(reg.photo_consent, false);
  assert.equal(reg.nft_consent, true);
  assert.equal(reg.status, 'confirmed');
  assert.equal(reg.guardian_token, null);
});

test('jazdec a súkromné údaje: rider_ref je 0x + 64 hex, e-mail malými písmenami', async () => {
  const { handler, db } = setup();
  await post(handler, adult({ nickname: 'Kovo', instagram: '@kovo.sk' }));
  const rider = db.t('riders')[0];
  assert.match(rider.rider_ref, /^0x[0-9a-f]{64}$/);
  assert.equal(rider.display_name, 'Marek Kováč');
  assert.equal(rider.public_name_mode, 'short');
  assert.equal(rider.nickname, 'Kovo');
  const priv = db.t('rider_private')[0];
  assert.equal(priv.rider_id, rider.id);
  assert.equal(priv.email, 'marek@example.sk');
  assert.equal(priv.birth_date, '2000-04-10');
  assert.equal(priv.legal_name, 'Marek Kováč');
  assert.equal(priv.instagram, 'kovo.sk');
});

test('jazdkyňa od 16 rokov s women: kategória women', async () => {
  const { handler } = setup();
  const res = await post(handler, adult({ legal_name: 'Júlia Dubovská', email: 'julia@example.sk', women: true }));
  assert.equal(res.json.pass.category, 'women');
});

test('14-ročný bez rodiča: 422 guardian_required a nič sa neuloží', async () => {
  const { handler, db, mail } = setup();
  const res = await post(handler, kid());
  assert.equal(res.statusCode, 422);
  assert.equal(res.json.error, 'guardian_required');
  assert.ok(res.json.message);
  assert.ok(res.json.errors.guardian_email);
  assert.equal(db.t('registrations').length, 0);
  assert.equal(db.t('riders').length, 0);
  assert.equal(mail.sent.length, 0);
});

test('14-ročný s rodičom: pending_guardian, u16 a e-mail rodičovi s jednorazovým odkazom', async () => {
  const { handler, db, mail } = setup();
  const res = await post(handler, kid({ guardian_email: 'Mama@Example.sk', guardian_name: 'Jana Malá', women: true }));
  assert.equal(res.statusCode, 201, res.body);
  assert.equal(res.json.status, 'pending_guardian');
  assert.equal(res.json.pass.category, 'u16');
  const reg = db.t('registrations')[0];
  assert.equal(reg.status, 'pending_guardian');
  assert.match(reg.guardian_token, /^[0-9a-f-]{36}$/);
  assert.equal(mail.sent.length, 1);
  assert.equal(mail.sent[0].to, 'mama@example.sk');
  assert.ok(mail.sent[0].text.includes(`https://gosko.test/api/consent?token=${reg.guardian_token}`));
  assert.ok(mail.sent[0].text.includes('Peter Malý'));
  assert.equal(db.t('rider_private')[0].guardian_email, 'mama@example.sk');
});

test('e-mail rodiča rovnaký ako jazdca: 400 invalid_input', async () => {
  const { handler } = setup();
  const res = await post(handler, kid({ guardian_email: 'peto@example.sk' }));
  assert.equal(res.statusCode, 400);
  assert.ok(res.json.errors.guardian_email);
});

test('vek sa počíta k dátumu eventu: dnes 15, na evente 16 je open bez rodiča', async () => {
  const { handler } = setup();
  const res = await post(handler, adult({ email: 'x@example.sk', birth_date: '2010-11-01' }));
  assert.equal(res.statusCode, 201, res.body);
  assert.equal(res.json.status, 'confirmed');
  assert.equal(res.json.pass.category, 'open');
});

test('event bez dátumu: vek sa počíta k dnešku', async () => {
  const { handler } = setup({ event: baseEvent({ date: null }) });
  const res = await post(handler, adult({ email: 'x@example.sk', birth_date: '2010-11-01' }));
  assert.equal(res.statusCode, 422);
  assert.equal(res.json.error, 'guardian_required');
});

test('neplatný captcha: 403 captcha_failed, bez rate limitu a bez zápisu', async () => {
  const { handler, db, turnstile } = setup({ turnstileOk: false });
  const res = await post(handler, adult());
  assert.equal(res.statusCode, 403);
  assert.equal(res.json.error, 'captcha_failed');
  assert.equal(turnstile.calls[0].token, 'tok');
  assert.equal(turnstile.calls[0].ip, '203.0.113.7');
  assert.equal(db.callsOf('rpc', 'rate_limit_hit').length, 0);
  assert.equal(db.t('registrations').length, 0);
});

test('šiesta registrácia z jednej IP za 10 minút: 429 rate_limited', async () => {
  const { handler, db } = setup();
  for (let i = 0; i < 5; i++) {
    const r = await post(handler, adult({ email: `j${i}@example.sk` }));
    assert.equal(r.statusCode, 201, r.body);
  }
  const sixth = await post(handler, adult({ email: 'j6@example.sk' }));
  assert.equal(sixth.statusCode, 429);
  assert.equal(sixth.json.error, 'rate_limited');
  assert.deepEqual(db.callsOf('rpc', 'rate_limit_hit')[0].args, { p_key: 'reg:203.0.113.7', p_limit: 5, p_window_minutes: 10 });
  assert.equal(db.t('registrations').length, 5);
  // iná IP prejde
  const other = await post(handler, adult({ email: 'j7@example.sk' }), { 'x-forwarded-for': '198.51.100.20' });
  assert.equal(other.statusCode, 201);
});

test('duplicita (rovnaký e-mail inak napísaný + dátum narodenia): 409 bez cudzích údajov', async () => {
  const { handler, db } = setup();
  await post(handler, adult({ nickname: 'Kovo' }));
  const res = await post(handler, adult({ email: 'MAREK@example.SK', legal_name: 'Niekto Iný' }));
  assert.equal(res.statusCode, 409);
  assert.equal(res.json.error, 'already_registered');
  assert.deepEqual(Object.keys(res.json).sort(), ['error', 'message', 'ok']);
  for (const leak of ['Marek', 'Kovo', 'marek@', '2000-04-10', db.t('registrations')[0].token]) {
    assert.ok(!res.body.includes(leak), `409 prezradil ${leak}`);
  }
  assert.equal(db.t('riders').length, 1);
  assert.equal(db.t('registrations').length, 1);
});

test('ten istý jazdec na inom evente: použije sa existujúci rider', async () => {
  const db = new FakeDb({ events: [baseEvent(), baseEvent({ id: 'zilina-2026-12', name: 'GOSko Žilina' })] });
  const { handler } = setup({ db });
  await post(handler, adult());
  const res = await post(handler, adult({ event_id: 'zilina-2026-12', email: 'marek@EXAMPLE.sk' }));
  assert.equal(res.statusCode, 201, res.body);
  assert.equal(db.t('riders').length, 1);
  assert.equal(db.t('registrations').length, 2);
  assert.equal(db.t('registrations')[0].rider_id, db.t('registrations')[1].rider_id);
});

test('súbeh pri vkladaní registrácie (23505): 409', async () => {
  const { handler, db } = setup();
  const { UniqueViolationError } = await import('../../api/_lib/db.js');
  db.failNext['insert:registrations'] = new UniqueViolationError({ status: 409, message: 'dup' });
  const res = await post(handler, adult());
  assert.equal(res.statusCode, 409);
  assert.equal(res.json.error, 'already_registered');
});

test('súbeh pri zakladaní jazdca (23505 na rider_private): použije existujúceho, sirota sa zmaže', async () => {
  const { handler, db } = setup();
  const RID = 'cccccccc-0000-4000-8000-000000000001';
  // iný request medzitým založil toho istého jazdca: select ho ešte nevidel
  db.t('riders').push({ id: RID, rider_ref: '0x' + '0'.repeat(64), display_name: 'Marek Kováč', nickname: null, public_name_mode: 'full' });
  const orig = db.select.bind(db);
  let first = true;
  db.select = async (t, f, o) => {
    if (t === 'rider_private' && first) {
      // prvý select ešte nič nenájde, súbežný request vloží riadok hneď potom
      first = false;
      db.t('rider_private').push({ rider_id: RID, email: 'marek@example.sk', birth_date: '2000-04-10', legal_name: 'Marek Kováč' });
      return [];
    }
    return orig(t, f, o);
  };
  const res = await post(handler, adult());
  assert.equal(res.statusCode, 201, res.body);
  assert.equal(db.t('riders').length, 1, 'sirota zmazaná');
  assert.equal(db.t('registrations')[0].rider_id, RID);
});

test('uzavretý event: 422 event_closed (registration_open false, done, minulý dátum, plná kapacita)', async () => {
  for (const ev of [baseEvent({ registration_open: false }), baseEvent({ status: 'done' }), baseEvent({ status: 'cancelled' }), baseEvent({ date: '2026-10-01' })]) {
    const { handler, db } = setup({ event: ev });
    const res = await post(handler, adult());
    assert.equal(res.statusCode, 422, JSON.stringify(ev));
    assert.equal(res.json.error, 'event_closed');
    assert.equal(db.t('registrations').length, 0);
  }
  const { handler, db } = setup({ event: baseEvent({ capacity: 1 }) });
  assert.equal((await post(handler, adult())).statusCode, 201);
  const full = await post(handler, adult({ email: 'iny@example.sk' }));
  assert.equal(full.statusCode, 422);
  assert.equal(full.json.error, 'event_closed');
  assert.equal(db.t('registrations').length, 1);
});

test('neexistujúci event: 404 event_not_found', async () => {
  const { handler } = setup();
  const res = await post(handler, adult({ event_id: 'neexistuje-2030' }));
  assert.equal(res.statusCode, 404);
  assert.equal(res.json.error, 'event_not_found');
});

test('neplatný vstup: 400 invalid_input s chybami po poliach', async () => {
  const { handler } = setup();
  const res = await post(handler, adult({ email: 'zly', consents: { rules: true, privacy: false } }));
  assert.equal(res.statusCode, 400);
  assert.equal(res.json.error, 'invalid_input');
  assert.ok(res.json.errors.email);
  assert.ok(res.json.errors.privacy);
});

test('zlý JSON: 400, iná metóda: 405', async () => {
  const { handler } = setup();
  const bad = await call(handler, { method: 'POST', rawBody: '{nie' });
  assert.equal(bad.statusCode, 400);
  const get = await call(handler, { method: 'GET' });
  assert.equal(get.statusCode, 405);
});

test('výpadok e-mailu: registrácia ostane, 201 s mail_sent false', async () => {
  const { handler, db } = setup({ mailFail: true });
  const res = await post(handler, adult());
  assert.equal(res.statusCode, 201);
  assert.equal(res.json.mail_sent, false);
  assert.equal(db.t('registrations').length, 1);
});

test('audit_log bez osobných údajov', async () => {
  const { handler, db } = setup();
  await post(handler, adult());
  const a = db.t('audit_log')[0];
  assert.equal(a.action, 'register');
  const s = JSON.stringify(a);
  assert.ok(!s.includes('marek') && !s.includes('Marek') && !s.includes('2000-04-10'));
});

test('výpadok DB: 500 server_error bez detailov', async () => {
  const { handler, db } = setup();
  db.failNext['select:events'] = new Error('connection refused at 10.0.0.5');
  const res = await post(handler, adult());
  assert.equal(res.statusCode, 500);
  assert.equal(res.json.error, 'server_error');
  assert.ok(!res.body.includes('10.0.0.5'));
});

// GET/POST /api/game/link-rider: prvé prihlásenie hráča (Task 2). Hráč = auth používateľ + jazdec.
// Napojenie na existujúceho jazdca podľa overeného e-mailu, inak nový jazdec. U16: súhlas rodiča s hrou.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../../api/game/link-rider.js';
import { FakeDb, fakeMail, fakeUserAuth, testEnv, silentLog, fixedNow, call } from './_support/fakes.js';

const NOW = '2026-10-05T10:00:00Z';
const USER = { id: 'aaaa0000-0000-4000-8000-000000000001', email: 'jano@example.sk' };
const KID = { id: 'aaaa0000-0000-4000-8000-000000000002', email: 'kubko@example.sk' };
const MAMA = { id: 'aaaa0000-0000-4000-8000-000000000003', email: 'mama@example.sk' };
const RIDER = 'bbbb0000-0000-4000-8000-000000000001';
const RIDER_KID = 'bbbb0000-0000-4000-8000-000000000002';
const RIDER_KID2 = 'bbbb0000-0000-4000-8000-000000000003';
const users = { 'jwt-jano': USER, 'jwt-kid': KID, 'jwt-mama': MAMA, 'jwt-unverified': { ...USER, verified: false } };

// PII, ktoré sa nikdy nesmú objaviť v odpovedi
const PII = ['jano@example.sk', 'kubko@example.sk', 'mama@example.sk', 'otec@example.sk', '1990-04-12', '2012-03-01', '2014-06-01', 'Ján Novák', 'Jakub Malý', 'Novák', 'Malý'];

function seed() {
  return new FakeDb({
    riders: [
      { id: RIDER, rider_ref: '0x' + '1'.repeat(64), display_name: 'Ján Novák', public_name_mode: 'full' },
      { id: RIDER_KID, rider_ref: '0x' + '2'.repeat(64), display_name: 'Jakub Malý', public_name_mode: 'short' },
    ],
    rider_private: [
      { rider_id: RIDER, legal_name: 'Ján Novák', birth_date: '1990-04-12', email: 'jano@example.sk' },
      { rider_id: RIDER_KID, legal_name: 'Jakub Malý', birth_date: '2012-03-01', email: 'kubko@example.sk', guardian_name: 'Eva Malá', guardian_email: 'mama@example.sk' },
    ],
  });
}

const handler = (db, { mail = fakeMail(), now = NOW } = {}) =>
  createHandler({ env: testEnv(), db, mail, auth: fakeUserAuth(users), log: silentLog, now: fixedNow(now) });

const get = (h, jwt) => call(h, { method: 'GET', headers: jwt ? { authorization: `Bearer ${jwt}` } : {} });
const post = (h, jwt, body) => call(h, { method: 'POST', headers: { authorization: `Bearer ${jwt}`, 'content-type': 'application/json' }, body });

const ONBOARD = { username: 'jano_flip', city: 'Bratislava', stance: 'regular', consents: { rules: true, privacy: true } };
const NEW_RIDER = { ...ONBOARD, name: 'Jozef Nový', birth_date: '1995-02-03', country: 'SK' };

const noPii = res => { for (const s of PII) assert.ok(!res.body.includes(s), `odpoveď obsahuje ${s}: ${res.body}`); };

/* ---------- prihlásenie ---------- */
test('link-rider: iná metóda 405, bez prihlásenia 401, neoverený e-mail 403', async () => {
  const h = handler(seed());
  assert.equal((await call(h, { method: 'PUT' })).statusCode, 405);
  assert.equal((await get(h)).statusCode, 401);
  const r = await get(h, 'jwt-unverified');
  assert.equal(r.statusCode, 403);
  assert.equal(r.json.error, 'email_unverified');
});

/* ---------- GET: stav pred onboardingom ---------- */
test('GET: nový e-mail -> rider none; e-mail z registrácie -> known (bez osobných údajov)', async () => {
  const db = seed();
  const fresh = await get(handler(db), 'jwt-mama');
  assert.equal(fresh.statusCode, 200);
  assert.deepEqual(fresh.json, { ok: true, status: 'new', rider: 'none', guardian_known: false });
  const known = await get(handler(db), 'jwt-kid');
  assert.deepEqual(known.json, { ok: true, status: 'new', rider: 'known', guardian_known: true });
  noPii(known);
});

test('GET: dvaja jazdci s rovnakým e-mailom (súrodenci) -> ambiguous', async () => {
  const db = seed();
  db.t('riders').push({ id: RIDER_KID2, rider_ref: '0x' + '3'.repeat(64), display_name: 'Ema Malá', public_name_mode: 'short' });
  db.t('rider_private').push({ rider_id: RIDER_KID2, legal_name: 'Ema Malá', birth_date: '2014-06-01', email: 'kubko@example.sk', guardian_email: 'mama@example.sk' });
  const res = await get(handler(db), 'jwt-kid');
  assert.equal(res.json.rider, 'ambiguous');
  noPii(res);
});

/* ---------- POST: existujúci jazdec ---------- */
test('POST: e-mail zo starej registrácie napojí toho istého jazdca, nový jazdec nevznikne', async () => {
  const db = seed();
  const res = await post(handler(db), 'jwt-jano', ONBOARD);
  assert.equal(res.statusCode, 201, res.body);
  assert.deepEqual(res.json, { ok: true, status: 'created', rider: 'linked', username: 'jano_flip', needs_guardian: false, guardian_mail_sent: false });
  const [p] = db.t('players');
  assert.equal(p.id, USER.id);
  assert.equal(p.rider_id, RIDER);
  assert.equal(p.city, 'Bratislava');
  assert.equal(p.stance, 'regular');
  assert.equal(db.t('riders').length, 2);
  assert.equal(db.t('rider_private').length, 2);
  assert.equal(db.t('player_guardian').length, 0);
  assert.ok(db.t('audit_log').some(a => a.action === 'game.link' && a.entity_id === USER.id && a.data.rider === 'linked'));
  noPii(res);
});

test('POST: opakované volanie hráča nevytvorí druhýkrát, vráti status player', async () => {
  const db = seed();
  await post(handler(db), 'jwt-jano', ONBOARD);
  const again = await post(handler(db), 'jwt-jano', { ...ONBOARD, username: 'iny_nick' });
  assert.equal(again.statusCode, 200);
  assert.equal(again.json.status, 'player');
  assert.equal(again.json.username, 'jano_flip');
  assert.equal(db.t('players').length, 1);
  const st = await get(handler(db), 'jwt-jano');
  assert.deepEqual(st.json, { ok: true, status: 'player', username: 'jano_flip', needs_guardian: false });
});

test('POST: IG sa doplní jazdcovi len vtedy, keď ho ešte nemá', async () => {
  const db = seed();
  await post(handler(db), 'jwt-jano', { ...ONBOARD, instagram: '@jano.flip' });
  assert.equal(db.t('rider_private').find(r => r.rider_id === RIDER).instagram, 'jano.flip');
  const db2 = seed();
  db2.t('rider_private').find(r => r.rider_id === RIDER).instagram = 'stary_ig';
  await post(handler(db2), 'jwt-jano', { ...ONBOARD, instagram: 'novy_ig' });
  assert.equal(db2.t('rider_private').find(r => r.rider_id === RIDER).instagram, 'stary_ig');
});

/* ---------- POST: nový jazdec ---------- */
test('POST: neznámy e-mail bez dátumu narodenia, mena alebo krajiny vráti chyby polí', async () => {
  const res = await post(handler(seed()), 'jwt-mama', ONBOARD);
  assert.equal(res.statusCode, 400);
  assert.equal(res.json.error, 'invalid_input');
  for (const f of ['birth_date', 'name', 'country']) assert.ok(res.json.errors[f], f);
});

test('POST: neznámy e-mail vytvorí nového jazdca s overeným e-mailom a hráča', async () => {
  const db = seed();
  const h = createHandler({ env: testEnv(), db, mail: fakeMail(), auth: fakeUserAuth({ 'jwt-x': { id: USER.id, email: 'Novy@Example.SK' } }), log: silentLog, now: fixedNow(NOW) });
  const res = await post(h, 'jwt-x', { ...NEW_RIDER, instagram: 'jozo' });
  assert.equal(res.statusCode, 201, res.body);
  assert.equal(res.json.rider, 'new');
  assert.equal(db.t('riders').length, 3);
  const priv = db.t('rider_private').find(r => r.email === 'novy@example.sk');
  assert.ok(priv, 'rider_private s e-mailom z prihlásenia');
  assert.equal(priv.birth_date, '1995-02-03');
  assert.equal(priv.legal_name, 'Jozef Nový');
  assert.equal(priv.instagram, 'jozo');
  const rider = db.t('riders').find(r => r.id === priv.rider_id);
  assert.match(rider.rider_ref, /^0x[0-9a-f]{64}$/);
  assert.equal(rider.country, 'SK');
  assert.equal(db.t('players')[0].rider_id, priv.rider_id);
  assert.ok(!res.body.includes('Jozef') && !res.body.includes('novy@') && !res.body.includes('1995'));
});

test('POST: e-mail zo stránky sa neberie z tela, iba z overeného prihlásenia', async () => {
  const db = seed();
  await post(handler(db), 'jwt-mama', { ...NEW_RIDER, email: 'jano@example.sk' });
  assert.ok(db.t('rider_private').some(r => r.email === 'mama@example.sk'));
  assert.notEqual(db.t('players')[0].rider_id, RIDER);
});

test('POST: obsadený username (bez ohľadu na veľkosť písmen) vráti 409 a nový jazdec nezostane', async () => {
  const db = seed();
  await post(handler(db), 'jwt-jano', ONBOARD);
  const res = await post(handler(db), 'jwt-mama', { ...NEW_RIDER, username: 'JANO_FLIP' });
  assert.equal(res.statusCode, 409);
  assert.equal(res.json.error, 'username_taken');
  assert.match(res.json.message, /nick/i);
  assert.equal(db.t('riders').length, 2, 'sirota rider');
  assert.equal(db.t('rider_private').length, 2);
  assert.equal(db.t('players').length, 1);
});

test('POST: zlý username, stance, IG, mesto a chýbajúci súhlas vrátia chyby polí', async () => {
  const res = await post(handler(seed()), 'jwt-jano', { username: 'ab', stance: 'mongo', instagram: 'zlý ig!', city: 'x'.repeat(61), consents: {} });
  assert.equal(res.statusCode, 400);
  for (const f of ['username', 'stance', 'instagram', 'city', 'privacy']) assert.ok(res.json.errors[f], f);
});

/* ---------- U16 ---------- */
test('POST U16 nový jazdec: bez e-mailu rodiča 422 guardian_required', async () => {
  const res = await post(handler(seed()), 'jwt-mama', { ...NEW_RIDER, birth_date: '2013-01-01' });
  assert.equal(res.statusCode, 422);
  assert.equal(res.json.error, 'guardian_required');
});

test('POST U16 nový jazdec: vznikne token pre rodiča a e-mail s herným súhlasom', async () => {
  const db = seed();
  const mail = fakeMail();
  const res = await post(handler(db, { mail }), 'jwt-mama', { ...NEW_RIDER, birth_date: '2013-01-01', guardian_name: 'Peter Otec', guardian_email: 'otec@example.sk' });
  assert.equal(res.statusCode, 201, res.body);
  assert.equal(res.json.needs_guardian, true);
  assert.equal(res.json.guardian_mail_sent, true);
  const [g] = db.t('player_guardian');
  assert.equal(g.player_id, MAMA.id);
  assert.equal(g.guardian_email, 'otec@example.sk');
  assert.match(g.token, /^[0-9a-f-]{36}$/);
  assert.equal(g.token_expires_at, '2026-10-19T10:00:00.000Z');
  assert.ok(!res.body.includes(g.token), 'token nesmie byť v odpovedi');
  assert.equal(mail.sent.length, 1);
  const m = mail.sent[0];
  assert.equal(m.to, 'otec@example.sk');
  assert.ok(m.text.includes(`https://gosko.test/api/consent?token=${g.token}`));
  for (const s of ['jano_flip', 'check-in', 'polohu', 'fotky', 'videá', 'crew']) assert.ok(m.text.includes(s), `e-mail: ${s}`);
  assert.ok(!m.text.includes('—'));
  // rodič patrí aj k jazdcovi (pre registrácie na eventy)
  const priv = db.t('rider_private').find(r => r.email === 'mama@example.sk');
  assert.equal(priv.guardian_email, 'otec@example.sk');
  noPii(res);
});

test('POST U16 existujúci jazdec: použije rodiča, ktorého už máme z registrácie', async () => {
  const db = seed();
  const mail = fakeMail();
  const res = await post(handler(db, { mail }), 'jwt-kid', { ...ONBOARD, username: 'kubko', guardian_email: 'podvrh@example.sk' });
  assert.equal(res.statusCode, 201, res.body);
  assert.equal(res.json.needs_guardian, true);
  assert.equal(db.t('player_guardian')[0].guardian_email, 'mama@example.sk');
  assert.equal(mail.sent[0].to, 'mama@example.sk');
  noPii(res);
});

test('POST U16: e-mail rodiča nesmie byť e-mail hráča', async () => {
  const res = await post(handler(seed()), 'jwt-mama', { ...NEW_RIDER, birth_date: '2013-01-01', guardian_email: 'mama@example.sk' });
  assert.equal(res.statusCode, 400);
  assert.ok(res.json.errors.guardian_email);
});

test('POST U16: zlyhaný e-mail rodiču hráča nezastaví, guardian_mail_sent je false', async () => {
  const db = seed();
  const res = await post(handler(db, { mail: fakeMail({ fail: true }) }), 'jwt-kid', { ...ONBOARD, username: 'kubko' });
  assert.equal(res.statusCode, 201);
  assert.equal(res.json.guardian_mail_sent, false);
  assert.equal(db.t('players').length, 1);
});

test('POST U16 hráč: resend_guardian vydá nový token a pošle e-mail znova', async () => {
  const db = seed();
  const mail = fakeMail();
  await post(handler(db, { mail }), 'jwt-kid', { ...ONBOARD, username: 'kubko' });
  const first = db.t('player_guardian')[0].token;
  const res = await post(handler(db, { mail }), 'jwt-kid', { resend_guardian: true });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json.guardian_mail_sent, true);
  assert.notEqual(db.t('player_guardian')[0].token, first);
  assert.equal(mail.sent.length, 2);
  assert.equal(db.t('player_guardian').length, 1);
});

test('POST: dospelý hráč s resend_guardian nič nepošle', async () => {
  const db = seed();
  const mail = fakeMail();
  await post(handler(db, { mail }), 'jwt-jano', ONBOARD);
  const res = await post(handler(db, { mail }), 'jwt-jano', { resend_guardian: true });
  assert.equal(res.json.needs_guardian, false);
  assert.equal(mail.sent.length, 0);
});

test('POST: súrodenci s jedným e-mailom bez dátumu 422 birth_date_required; s dátumom napojí správneho', async () => {
  const db = seed();
  db.t('riders').push({ id: RIDER_KID2, rider_ref: '0x' + '3'.repeat(64), display_name: 'Ema Malá', public_name_mode: 'short' });
  db.t('rider_private').push({ rider_id: RIDER_KID2, legal_name: 'Ema Malá', birth_date: '2014-06-01', email: 'kubko@example.sk', guardian_email: 'mama@example.sk' });
  const amb = await post(handler(db), 'jwt-kid', { ...ONBOARD, username: 'ema' });
  assert.equal(amb.statusCode, 422);
  assert.equal(amb.json.error, 'birth_date_required');
  const ok = await post(handler(db), 'jwt-kid', { ...ONBOARD, username: 'ema', birth_date: '2014-06-01' });
  assert.equal(ok.statusCode, 201, ok.body);
  assert.equal(db.t('players')[0].rider_id, RIDER_KID2);
  noPii(ok);
});

test('GET: jazdec už napojený na iného hráča sa neponúkne', async () => {
  const db = seed();
  db.t('players').push({ id: 'cccc0000-0000-4000-8000-000000000009', rider_id: RIDER, username: 'iny' });
  const st = await get(handler(db), 'jwt-jano');
  assert.equal(st.json.rider, 'none');
});

test('POST: rate limit vráti 429', async () => {
  const db = seed();
  db.rpcs.rate_limit_hit = () => true;
  const res = await post(handler(db), 'jwt-jano', ONBOARD);
  assert.equal(res.statusCode, 429);
  assert.equal(db.t('players').length, 0);
});

// GET/POST /api/consent (dvojkrokový súhlas rodiča), GET a POST /api/pass.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHandler as consentHandler } from '../../api/consent.js';
import { createHandler as passHandler } from '../../api/pass.js';
import { DbError } from '../../api/_lib/db.js';
import { FakeDb, fakeMail, fakeChain, testEnv, silentLog, fixedNow, baseEvent, call } from './_support/fakes.js';

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
    registrations: [{ id: REG, rider_id: RIDER, event_id: 'bratislava-2026-11', category: 'u16', status: 'pending_guardian', token: TOKEN, guardian_token: GTOKEN, consent_version: '2026-10', consent_at: '2026-10-05T10:00:00Z', nft_consent: true, photo_consent: true, ...regOver }],
  });
}
const consent = (db, mail = fakeMail(), chain = fakeChain()) => consentHandler({ env: testEnv(), db, mail, chain, log: silentLog, now: fixedNow() });
const confirmForm = (h, token) => call(h, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, rawBody: `token=${encodeURIComponent(token)}` });

/* ---------- consent GET: iba stránka, nič nepotvrdí ---------- */
test('consent GET: stránka s eventom, verejným menom a formulárom; token sa nepoužije', async () => {
  const db = seed();
  const res = await call(consent(db), { url: `/api/consent?token=${GTOKEN}`, query: { token: GTOKEN } });
  assert.equal(res.statusCode, 200);
  assert.match(res.headers['content-type'], /text\/html/);
  assert.equal(res.headers['cache-control'], 'no-store');
  assert.equal(res.headers['referrer-policy'], 'no-referrer');
  assert.match(res.headers['content-security-policy'], /form-action 'self'/);
  for (const s of ['GOSko Bratislava', 'Peťo', 'Potvrdzujem súhlas', 'method="post"', 'action="/api/consent"', `value="${GTOKEN}"`, '#A01D21', 'NFT']) {
    assert.ok(res.body.includes(s), s);
  }
  for (const pii of ['Malý', 'peto@', 'mama@', '2012-05-01']) assert.ok(!res.body.includes(pii), pii);
  assert.ok(!res.body.includes('\u2014'));
  assert.equal(db.callsOf('rpc', 'confirm_guardian').length, 0, 'GET nesmie potvrdiť');
  assert.equal(db.t('registrations')[0].status, 'pending_guardian');
});

test('consent GET: neplatný, chýbajúci alebo použitý token ide na neplatny-odkaz', async () => {
  for (const q of [{ token: 'nie-uuid' }, {}, { token: '' }]) {
    const db = seed();
    const res = await call(consent(db), { query: q });
    assert.equal(res.headers.location, BAD);
    assert.equal(db.calls.length, 0);
  }
  for (const over of [{ guardian_token: null }, { status: 'confirmed', guardian_confirmed_at: '2026-10-06T00:00:00Z' }, { status: 'cancelled' }]) {
    const res = await call(consent(seed(over)), { query: { token: GTOKEN } });
    assert.equal(res.statusCode, 302, JSON.stringify(over));
    assert.equal(res.headers.location, BAD);
  }
});

test('consent GET: stránka povie rodičovi, aké meno sa zverejní (audit M4)', async () => {
  const res = await call(consent(seed()), { query: { token: GTOKEN } });
  assert.match(res.body, /zobrazí meno: <strong>Peťo<\/strong>/);
});

test('consent: prepadnutý odkaz (guardian_token_expires_at) ide na neplatny-odkaz a nič nepotvrdí (audit L6)', async () => {
  const db = seed({ guardian_token_expires_at: '2026-10-05T09:59:59Z' });
  const get = await call(consent(db), { query: { token: GTOKEN } });
  assert.equal(get.headers.location, BAD);
  const post = await confirmForm(consent(db), GTOKEN);
  assert.equal(post.headers.location, BAD);
  assert.equal(db.t('registrations')[0].status, 'pending_guardian');
  const ok = await call(consent(seed({ guardian_token_expires_at: '2026-10-06T00:00:00Z' })), { query: { token: GTOKEN } });
  assert.equal(ok.statusCode, 200);
});

test('consent GET: výpadok DB je 503 stránka', async () => {
  const db = seed();
  db.failNext['select:registrations'] = new DbError({ status: 503, code: 'network', message: 'down' });
  const res = await call(consent(db), { query: { token: GTOKEN } });
  assert.equal(res.statusCode, 503);
  assert.match(res.headers['content-type'], /text\/html/);
});

/* ---------- consent POST ---------- */
test('consent POST (formulár): potvrdí, presmeruje na potvrdene, jazdec dostane pass', async () => {
  const db = seed();
  const mail = fakeMail();
  const res = await confirmForm(consent(db, mail), GTOKEN);
  assert.equal(res.statusCode, 302);
  assert.equal(res.headers.location, OK);
  const reg = db.t('registrations')[0];
  assert.equal(reg.status, 'confirmed');
  assert.ok(reg.guardian_confirmed_at);
  assert.equal(reg.guardian_token, null);
  assert.deepEqual(db.callsOf('rpc', 'confirm_guardian')[0].args, { p_token: GTOKEN });
  assert.equal(mail.sent.length, 1);
  assert.equal(mail.sent[0].to, 'peto@example.sk');
  assert.ok(mail.sent[0].text.includes(`https://gosko.test/#/pass/${TOKEN}`));
  assert.ok(db.t('audit_log').some(a => a.action === 'guardian_confirm'));
});

test('consent POST (JSON) funguje rovnako', async () => {
  const db = seed();
  const res = await call(consent(db), { method: 'POST', body: { token: GTOKEN } });
  assert.equal(res.headers.location, OK);
  assert.equal(db.t('registrations')[0].status, 'confirmed');
});

test('consent POST: použitý token (PT404), neplatný token a zlé telo idú na neplatny-odkaz', async () => {
  const db = seed();
  const h = consent(db);
  await confirmForm(h, GTOKEN);
  assert.equal((await confirmForm(h, GTOKEN)).headers.location, BAD);
  assert.equal((await confirmForm(h, 'nie')).headers.location, BAD);
  assert.equal((await call(h, { method: 'POST', rawBody: '{zly' , headers: { 'content-type': 'application/json' } })).headers.location, BAD);
  for (const ret of [null, { id: null }, []]) {
    const d = seed();
    d.rpcs.confirm_guardian = () => ret;
    assert.equal((await confirmForm(consent(d), GTOKEN)).headers.location, BAD, JSON.stringify(ret));
  }
});

test('consent POST: výpadok DB je 503 bez presmerovania a token ostáva platný', async () => {
  const db = seed();
  db.failNext['rpc:confirm_guardian'] = new DbError({ status: 503, code: 'network', message: 'down' });
  const r = await confirmForm(consent(db), GTOKEN);
  assert.equal(r.statusCode, 503);
  assert.equal(db.t('registrations')[0].status, 'pending_guardian');
  assert.equal((await confirmForm(consent(db), GTOKEN)).headers.location, OK);
});

test('consent POST: chyba e-mailu jazdcovi nezastaví presmerovanie', async () => {
  const res = await confirmForm(consent(seed(), fakeMail({ fail: true })), GTOKEN);
  assert.equal(res.headers.location, OK);
});

test('U16 odbavený pred súhlasom: GET ukáže stránku, POST ponechá checked_in a zmintuje (nft_consent)', async () => {
  const db = seed({ status: 'checked_in', checked_in_at: '2026-11-21T09:00:00Z' });
  const chain = fakeChain();
  const mail = fakeMail();
  const h = consent(db, mail, chain);
  assert.equal((await call(h, { query: { token: GTOKEN } })).statusCode, 200);
  const res = await confirmForm(h, GTOKEN);
  assert.equal(res.headers.location, OK);
  const reg = db.t('registrations')[0];
  assert.equal(reg.status, 'checked_in');
  assert.ok(reg.guardian_confirmed_at);
  assert.equal(chain.mintCalls.length, 1);
  assert.equal(chain.mintCalls[0].category, 'u16');
  assert.equal(db.t('nft_tokens')[0].status, 'minted');
  assert.equal(mail.sent.length, 0, 'odbavený jazdec pass e-mailom nepotrebuje');
});

test('U16 odbavený pred súhlasom bez nft_consent: žiadny mint; chyba mintu nezastaví presmerovanie', async () => {
  const chain = fakeChain();
  await confirmForm(consent(seed({ status: 'checked_in', nft_consent: false }), fakeMail(), chain), GTOKEN);
  assert.equal(chain.mintCalls.length, 0);
  const db = seed({ status: 'checked_in' });
  const res = await confirmForm(consent(db, fakeMail(), fakeChain({ failMint: 3 })), GTOKEN);
  assert.equal(res.headers.location, OK);
  assert.equal(db.t('nft_tokens')[0].status, 'failed');
});

test('consent POST pre bežné potvrdenie (status confirmed) nemintuje', async () => {
  const chain = fakeChain();
  await confirmForm(consent(seed(), fakeMail(), chain), GTOKEN);
  assert.equal(chain.mintCalls.length, 0);
});

test('consent: iné metódy sú 405', async () => {
  assert.equal((await call(consent(seed()), { method: 'PUT' })).statusCode, 405);
  assert.equal((await call(consent(seed()), { method: 'HEAD', query: { token: GTOKEN } })).statusCode, 405);
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

/* ---------- súhlas rodiča s hrou (player_guardian, 010 + 013) ---------- */
const PLAYER = 'cccccccc-0000-4000-8000-000000000001';
const PTOKEN = 'ffffffff-0000-4000-8000-000000000001';
const GAME_OK = 'https://gosko.test/#/hra/potvrdene';
function seedGame(over = {}) {
  const db = seed();
  db.t('players').push({ id: PLAYER, rider_id: RIDER, username: 'petko_kf', guardian_confirmed_at: null });
  db.t('player_guardian').push({ player_id: PLAYER, guardian_email: 'mama@example.sk', token: PTOKEN, token_expires_at: '2026-10-19T10:00:00Z', ...over });
  return db;
}

test('consent GET s herným tokenom: stránka s rozsahom hry (poloha, klipy, crew), nie eventu', async () => {
  const db = seedGame();
  const res = await call(consent(db), { query: { token: PTOKEN } });
  assert.equal(res.statusCode, 200);
  for (const s of ['Súhlas rodiča s hrou', 'petko_kf', 'check-in', 'polohu', 'fotky', 'videá', 'crew', 'Potvrdzujem súhlas', `value="${PTOKEN}"`]) {
    assert.ok(res.body.includes(s), s);
  }
  assert.ok(!res.body.includes('účasťou jazdca na podujatí'), 'text eventu nepatrí k hre');
  for (const pii of ['Malý', 'peto@', 'mama@', '2012-05-01']) assert.ok(!res.body.includes(pii), pii);
  assert.ok(!res.body.includes('—'));
  assert.equal(db.callsOf('rpc', 'confirm_player_guardian').length, 0, 'GET nesmie potvrdiť');
});

test('consent GET s herným tokenom: prepadnutý alebo použitý ide na neplatny-odkaz', async () => {
  for (const over of [{ token_expires_at: '2026-10-05T09:00:00Z' }, { token: null }]) {
    const res = await call(consent(seedGame(over)), { query: { token: PTOKEN } });
    assert.equal(res.headers.location, BAD, JSON.stringify(over));
  }
});

test('consent POST s herným tokenom: confirm_player_guardian odomkne hru, token sa použije raz', async () => {
  const db = seedGame();
  const h = consent(db);
  const res = await confirmForm(h, PTOKEN);
  assert.equal(res.statusCode, 302);
  assert.equal(res.headers.location, GAME_OK);
  assert.ok(db.t('players')[0].guardian_confirmed_at);
  assert.equal(db.t('player_guardian')[0].token, null);
  assert.equal(db.t('registrations')[0].status, 'pending_guardian', 'súhlas s hrou nepotvrdí event');
  assert.ok(db.t('audit_log').some(a => a.action === 'guardian_confirm_game' && a.entity_id === PLAYER));
  assert.equal((await confirmForm(h, PTOKEN)).headers.location, BAD);
});

test('consent POST s tokenom eventu nepotvrdí hru', async () => {
  const db = seedGame();
  await confirmForm(consent(db), GTOKEN);
  assert.equal(db.t('players')[0].guardian_confirmed_at, null);
  assert.equal(db.callsOf('rpc', 'confirm_player_guardian').length, 0);
});

test('consent POST: výpadok DB pri hernom tokene je 503', async () => {
  const db = seedGame();
  db.failNext['rpc:confirm_player_guardian'] = new DbError({ status: 503, code: 'network', message: 'down' });
  const r = await confirmForm(consent(db), PTOKEN);
  assert.equal(r.statusCode, 503);
  assert.equal(db.t('players')[0].guardian_confirmed_at, null);
});

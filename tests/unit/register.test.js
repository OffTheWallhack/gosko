import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as R from '../../assets/register.js';
import { ApiError, apiRequest } from '../../assets/api.js';
import { UserError } from '../../assets/util.js';

const ok = (v = {}) => ({
  legal_name: 'Eva Nová', nickname: '', public_name_mode: 'full', birth_date: '2000-05-01', email: 'eva@example.sk',
  instagram: '', country: 'SK', city: 'Bratislava', women: false, guardian_name: '', guardian_email: '',
  rules: true, privacy: true, photo: false, nft: false, captcha: 'tok', ...v,
});
const OPTS = { eventDate: '2026-11-14', today: '2026-10-05' };

/* falošný fetch: vráti zadanú odpoveď a zapamätá si požiadavky */
function fakeFetch(status, body, calls = []) {
  return Object.assign(async (url, init) => {
    calls.push({ url, init });
    return { ok: status >= 200 && status < 300, status, json: async () => { if (body instanceof Error) throw body; return body; } };
  }, { calls });
}

describe('ageAt a isMinor', () => {
  test('plné roky k dátumu', () => {
    assert.equal(R.ageAt('2010-11-14', '2026-11-14'), 16);
    assert.equal(R.ageAt('2010-11-15', '2026-11-14'), 15);
    assert.equal(R.ageAt('2000-01-01', '2026-11-14'), 26);
  });
  test('hranica narodenín: deň pred 16. narodeninami je U16, v deň narodenín už nie', () => {
    assert.equal(R.isMinor('2010-11-15', '2026-11-14', '2026-10-05'), true);
    assert.equal(R.isMinor('2010-11-14', '2026-11-14', '2026-10-05'), false);
  });
  test('vek sa ráta k dátumu eventu, nie k dnešku', () => {
    // dnes má 15, v deň eventu už 16
    assert.equal(R.isMinor('2010-11-01', '2026-11-14', '2026-10-05'), false);
  });
  test('event bez dátumu: vek k dnešku', () => {
    assert.equal(R.isMinor('2010-11-01', '', '2026-10-05'), true);
  });
  test('neplatný alebo prázdny dátum nie je U16 (polia rodiča sa neukážu naslepo)', () => {
    assert.equal(R.isMinor('', '2026-11-14', '2026-10-05'), false);
    assert.equal(R.isMinor('2010-02-30', '2026-11-14', '2026-10-05'), false);
  });
  test('29. február: narodeniny v nepriestupnom roku sú 1. marca', () => {
    assert.equal(R.ageAt('2008-02-29', '2024-02-28'), 15);
    assert.equal(R.ageAt('2008-02-29', '2024-02-29'), 16);
    assert.equal(R.ageAt('2008-02-29', '2025-02-28'), 16);
  });
});

describe('categoryFor', () => {
  test('U16 z veku, babská len od 16', () => {
    assert.equal(R.categoryFor(15, false), 'u16');
    assert.equal(R.categoryFor(15, true), 'u16');
    assert.equal(R.categoryFor(16, false), 'open');
    assert.equal(R.categoryFor(16, true), 'women');
  });
});

describe('validateRegistration', () => {
  test('platné údaje dospelého prejdú', () => {
    const r = R.validateRegistration(ok(), OPTS);
    assert.equal(r.ok, true, JSON.stringify(r.errors));
    assert.equal(r.minor, false);
  });
  test('bez súhlasu s pravidlami sa formulár neodošle', () => {
    const r = R.validateRegistration(ok({ rules: false }), OPTS);
    assert.equal(r.ok, false);
    assert.ok(r.errors.rules);
  });
  test('bez súhlasu so spracúvaním osobných údajov sa formulár neodošle', () => {
    const r = R.validateRegistration(ok({ privacy: false }), OPTS);
    assert.equal(r.ok, false);
    assert.ok(r.errors.privacy);
  });
  test('foto a NFT súhlas sú voliteľné', () => {
    assert.equal(R.validateRegistration(ok({ photo: false, nft: false }), OPTS).ok, true);
  });
  test('U16 bez e-mailu rodiča neprejde', () => {
    const r = R.validateRegistration(ok({ birth_date: '2012-03-03' }), OPTS);
    assert.equal(r.ok, false);
    assert.equal(r.minor, true);
    assert.ok(r.errors.guardian_email);
  });
  test('U16 s rodičom prejde; e-mail rodiča musí byť iný ako jazdca', () => {
    assert.equal(R.validateRegistration(ok({ birth_date: '2012-03-03', guardian_name: 'Jana Nová', guardian_email: 'mama@example.sk' }), OPTS).ok, true);
    const same = R.validateRegistration(ok({ birth_date: '2012-03-03', guardian_name: 'Jana Nová', guardian_email: 'EVA@example.sk' }), OPTS);
    assert.ok(same.errors.guardian_email);
  });
  test('dátum narodenia: povinný, nie v budúcnosti, vek 6 až 99', () => {
    assert.ok(R.validateRegistration(ok({ birth_date: '' }), OPTS).errors.birth_date);
    assert.ok(R.validateRegistration(ok({ birth_date: '2027-01-01' }), OPTS).errors.birth_date);
    assert.ok(R.validateRegistration(ok({ birth_date: '2024-01-01' }), OPTS).errors.birth_date);
  });
  test('e-mail, meno, krajina', () => {
    assert.ok(R.validateRegistration(ok({ email: 'nie' }), OPTS).errors.email);
    assert.ok(R.validateRegistration(ok({ legal_name: 'E' }), OPTS).errors.legal_name);
    assert.ok(R.validateRegistration(ok({ country: 'Slovensko' }), OPTS).errors.country);
  });
  test('prezývka je povinná, keď si ju jazdec vybral ako verejné meno', () => {
    assert.ok(R.validateRegistration(ok({ public_name_mode: 'nick', nickname: '' }), OPTS).errors.nickname);
    assert.equal(R.validateRegistration(ok({ public_name_mode: 'nick', nickname: 'Evka' }), OPTS).ok, true);
  });
  test('captcha: keď je zapnutá, bez tokenu neprejde', () => {
    assert.ok(R.validateRegistration(ok({ captcha: '' }), { ...OPTS, captchaRequired: true }).errors.captcha);
    assert.equal(R.validateRegistration(ok({ captcha: '' }), { ...OPTS, captchaRequired: false }).ok, true);
  });
});

describe('buildPayload', () => {
  test('tvar podľa kontraktu (POST /api/register)', () => {
    const p = R.buildPayload(ok({ women: true, photo: true, nickname: 'Evka', instagram: '@eva.n' }), 'bratislava-2', 'tok');
    assert.deepEqual(p, {
      event_id: 'bratislava-2', legal_name: 'Eva Nová', display_name: 'Eva Nová', nickname: 'Evka', birth_date: '2000-05-01',
      email: 'eva@example.sk', instagram: 'eva.n', country: 'SK', city: 'Bratislava', women: true,
      guardian_name: undefined, guardian_email: undefined, public_name_mode: 'full',
      consents: { rules: true, privacy: true, photo: true, nft: false }, turnstile_token: 'tok',
    });
  });
  test('prázdne voliteľné polia sa neposielajú ako prázdne reťazce', () => {
    const p = R.buildPayload(ok(), 'ev', '');
    assert.equal(p.nickname, undefined);
    assert.equal(p.instagram, undefined);
    assert.equal(p.guardian_email, undefined);
  });
  test('rodič sa posiela pri U16', () => {
    const p = R.buildPayload(ok({ guardian_name: 'Jana Nová', guardian_email: 'mama@example.sk' }), 'ev', 't');
    assert.equal(p.guardian_email, 'mama@example.sk');
    assert.equal(p.guardian_name, 'Jana Nová');
  });
});

describe('apiRequest', () => {
  test('JSON telo, hlavička Authorization pri tokene', async () => {
    const f = fakeFetch(200, { ok: true, x: 1 });
    const d = await apiRequest(f, '/api/admin/checkin', { method: 'POST', body: { token: 'a' }, token: 'jwt' });
    assert.equal(d.x, 1);
    assert.equal(f.calls[0].init.method, 'POST');
    assert.equal(f.calls[0].init.headers.Authorization, 'Bearer jwt');
    assert.equal(f.calls[0].init.headers['Content-Type'], 'application/json');
    assert.deepEqual(JSON.parse(f.calls[0].init.body), { token: 'a' });
  });
  test('chyba API: ApiError (UserError) so správou zo servera, kódom a dátami', async () => {
    const f = fakeFetch(409, { ok: false, error: 'ambiguous', message: 'Toto meno má viac registrácií.', candidates: [{ id: 'x' }] });
    await assert.rejects(apiRequest(f, '/api/x'), err => err instanceof ApiError && err instanceof UserError
      && err.status === 409 && err.code === 'ambiguous' && /viac registrácií/.test(err.message) && err.data.candidates.length === 1);
  });
  test('výpadok siete a odpoveď, ktorá nie je JSON, majú text pre človeka', async () => {
    await assert.rejects(apiRequest(async () => { throw new TypeError('Failed to fetch'); }, '/api/x'), err => err instanceof ApiError && err.code === 'network' && /spojiť/.test(err.message));
    await assert.rejects(apiRequest(fakeFetch(502, new SyntaxError('x')), '/api/x'), err => err instanceof ApiError && err.status === 502 && err.message.length > 10);
  });
});

describe('completeRegistration: pass len zo servera', () => {
  const ev = { id: 'bratislava-2', name: 'GOSko Bratislava', date: '2026-11-14' };
  const payload = R.buildPayload(ok(), ev.id, 'tok');
  const pass = { token: '11111111-2222-4333-8444-555555555555', event_id: ev.id, event_name: 'GOSko Bratislava', public_name: 'Eva Nová', category: 'open' };

  test('úspech: uloží pass zo servera (token, meno, kategória zo servera)', async () => {
    const saved = [];
    const f = fakeFetch(201, { ok: true, status: 'confirmed', pass });
    const r = await R.completeRegistration({ fetch: f, payload, ev, save: p => saved.push(p), now: 5 });
    assert.equal(f.calls[0].url, '/api/register');
    assert.equal(saved.length, 1);
    assert.deepEqual(saved[0], { token: pass.token, eventId: ev.id, event: 'GOSko Bratislava', date: '2026-11-14', name: 'Eva Nová', category: 'open', status: 'confirmed', created: 5 });
    assert.equal(r.status, 'confirmed');
    assert.equal(r.pass.token, pass.token);
  });
  test('API_BASE sa pridá pred cestu', async () => {
    const f = fakeFetch(201, { ok: true, status: 'confirmed', pass });
    await R.completeRegistration({ fetch: f, payload, ev, save: () => {}, apiBase: 'https://gosko.sk' });
    assert.equal(f.calls[0].url, 'https://gosko.sk/api/register');
  });
  for (const [status, body] of [
    [409, { ok: false, error: 'already_registered', message: 'Registrácia s týmito údajmi na tento event už existuje.' }],
    [422, { ok: false, error: 'guardian_required', message: 'Jazdec mladší ako 16 rokov potrebuje súhlas rodiča.' }],
    [403, { ok: false, error: 'captcha_failed', message: 'Overenie zlyhalo.' }],
    [429, { ok: false, error: 'rate_limited', message: 'Príliš veľa registrácií.' }],
    [500, { ok: false, error: 'server_error', message: 'Niečo sa pokazilo.' }],
  ]) {
    test(`chyba ${status} ${body.error}: hláška zo servera a ŽIADNY pass`, async () => {
      const saved = [];
      await assert.rejects(R.completeRegistration({ fetch: fakeFetch(status, body), payload, ev, save: p => saved.push(p) }),
        err => err instanceof UserError && err.message === body.message);
      assert.equal(saved.length, 0);
    });
  }
  test('výpadok siete: žiadny pass', async () => {
    const saved = [];
    await assert.rejects(R.completeRegistration({ fetch: async () => { throw new TypeError('offline'); }, payload, ev, save: p => saved.push(p) }), UserError);
    assert.equal(saved.length, 0);
  });
  test('odpoveď 201 bez tokenu passu: chyba, žiadny vymyslený pass', async () => {
    const saved = [];
    await assert.rejects(R.completeRegistration({ fetch: fakeFetch(201, { ok: true, status: 'confirmed', pass: {} }), payload, ev, save: p => saved.push(p) }), UserError);
    assert.equal(saved.length, 0);
  });
  test('202 check_email (známy jazdec): žiadny pass sa neuloží, status check_email', async () => {
    const saved = [];
    const r = await R.completeRegistration({ fetch: fakeFetch(202, { ok: true, status: 'check_email', mail_sent: true }), payload, ev, save: p => saved.push(p) });
    assert.deepEqual(r, { status: 'check_email', pass: null });
    assert.equal(saved.length, 0);
  });
  test('NAME_MODES: predvolená (prvá) voľba je meno a iniciála', () => {
    assert.equal(R.NAME_MODES[0].value, 'short');
  });
  test('pending_guardian: pass sa uloží so stavom čakania na rodiča', async () => {
    const saved = [];
    await R.completeRegistration({ fetch: fakeFetch(201, { ok: true, status: 'pending_guardian', pass: { ...pass, category: 'u16' } }), payload, ev, save: p => saved.push(p) });
    assert.equal(saved[0].status, 'pending_guardian');
    assert.equal(saved[0].category, 'u16');
  });
});

describe('fetchPass (GET /api/pass)', () => {
  test('vráti pass zo servera ako záznam do cache', async () => {
    const f = fakeFetch(200, { ok: true, pass: { token: '11111111-2222-4333-8444-555555555555', event_id: 'e1', event_name: 'GOSko', public_name: 'Eva N.', category: 'open', status: 'checked_in' } });
    const p = await R.fetchPass(f, '11111111-2222-4333-8444-555555555555', { now: 7, eventDate: () => '2026-11-14' });
    assert.match(f.calls[0].url, /^\/api\/pass\?token=11111111-2222-4333-8444-555555555555$/);
    assert.deepEqual(p, { token: '11111111-2222-4333-8444-555555555555', eventId: 'e1', event: 'GOSko', date: '2026-11-14', name: 'Eva N.', category: 'open', status: 'checked_in', created: 7 });
  });
  test('404: UserError', async () => {
    await assert.rejects(R.fetchPass(fakeFetch(404, { ok: false, error: 'not_found', message: 'Pass sme nenašli.' }), 'x'), err => err instanceof UserError && /nenašli/.test(err.message));
  });
});

describe('upsertPass', () => {
  test('nový pass ide navrch, rovnaký token sa nahradí, ostatné ostanú', () => {
    const a = { token: 'a', created: 1 }, b = { token: 'b', created: 2 };
    assert.deepEqual(R.upsertPass([b, a], { token: 'a', created: 3, status: 'checked_in' }).map(p => [p.token, p.status]), [['a', 'checked_in'], ['b', undefined]]);
  });
});

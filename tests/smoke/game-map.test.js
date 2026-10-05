// Smoke hernej mapy (#/mapa) v headless Chromiu proti lokálnemu dev serveru so stubnutým Supabase.
//
//   npm run test:smoke        (PLAYWRIGHT_MODULE=/cesta/k/node_modules/playwright, inak sa test preskočí)
//
// Dev server (scripts/dev-server.js) beží v tomto procese na voľnom porte, bez .env.local. Všetky
// požiadavky na Supabase projekt z data.js odpovedá stub v teste (nikdy nejdú na sieť), ostatné cudzie
// hosty (OpenFreeMap dlaždice, Google Fonts, CDN) sa zablokujú. Mapový štýl sa teda nenačíta a test
// overuje, že hra aj tak funguje: piny (markery alebo zoznam bez WebGL), holo karta, HUD, spodné menu,
// U16 páska, hláška TOO_FAR so vzdialenosťou a hláška pri zamietnutej polohe, reduced motion bez pulzu.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { createDevServer } from '../../scripts/dev-server.js';

const { CONFIG } = await import('../../data.js');
const SUPABASE_HOST = new URL(CONFIG.SUPABASE_URL).host;

async function loadPlaywright() {
  const spec = process.env.PLAYWRIGHT_MODULE;
  try {
    if (spec) return createRequire(pathToFileURL(`${spec.replace(/\/+$/, '')}/package.json`))('./index.js');
    return await import('playwright');
  } catch { return null; }
}
const pw = await loadPlaywright();

const USER_ID = '0b5b0000-0000-4000-8000-000000000001';
const SPOTS = [
  { id: '5a000000-0000-4000-8000-000000000001', name: 'Eurovea schody', city: 'Bratislava', kind: 'street', description: 'Prekážky: schody, ledge.', lat: 48.1405, lng: 17.1235,
    photo_url: null, needs_verification: false, skulls: 4.2, ratings: 7, people_now: 3, status: 'chill', bust: 'medium',
    control_crew_id: 'c0000000-0000-4000-8000-000000000001', control_tag: 'RR', control_color: '#FF3366', control_points: 145, loot_active: true },
  { id: '5a000000-0000-4000-8000-000000000002', name: 'Skatepark Petržalka', city: 'Bratislava', kind: 'park', description: null, lat: 48.1210, lng: 17.1100,
    photo_url: null, needs_verification: true, skulls: null, ratings: 0, people_now: 0, status: null, bust: null,
    control_crew_id: null, control_tag: null, control_color: null, control_points: null, loot_active: false },
];
const CFG = { checkin_radius_m: 150, checkin_max_minutes: 120, points_per_minute: 1, spots_per_day: 5, report_ttl_hours: 6, guardian_age: 16 };

const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const fakeJwt = () => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: USER_ID, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}.c2ln`;
const session = () => ({
  access_token: fakeJwt(), token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'stub-refresh',
  user: { id: USER_ID, aud: 'authenticated', role: 'authenticated', email: 'hrac@test.local', email_confirmed_at: '2026-10-05T10:00:00Z', app_metadata: {}, user_metadata: {} },
});

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,PATCH,DELETE,HEAD,OPTIONS', 'access-control-expose-headers': 'content-range' };

describe('smoke: herná mapa so stubnutým Supabase', { skip: pw ? false : 'Playwright chýba (nastav PLAYWRIGHT_MODULE)' }, () => {
  let dev, base, browser;

  before(async () => {
    dev = createDevServer({ loadEnv: false, log: () => {} });
    base = (await dev.listen(0, '127.0.0.1')).url;
    browser = await pw.chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  });
  after(async () => { await browser?.close(); await dev?.close(); });

  /**
   * Nová stránka so stubom. scenario: { me (game_me alebo null), signedIn, checkIn (odpoveď check_in), reducedMotion, geo }.
   * Vráti { page, hits (cesty na Supabase), blocked (cudzie hosty), errors (chyby v konzole stránky) }.
   */
  async function open(hash, scenario = {}) {
    const context = await browser.newContext({
      serviceWorkers: 'block',
      reducedMotion: scenario.reducedMotion ? 'reduce' : 'no-preference',
      ...(scenario.geo ? { geolocation: scenario.geo, permissions: ['geolocation'] } : {}),
    });
    if (scenario.signedIn) {
      await context.addInitScript(([s]) => { localStorage.setItem('gosko-auth', s); localStorage.setItem('gosko:game-hint', '1'); }, [JSON.stringify(session())]);
    }
    const hits = [], blocked = new Set(), errors = [];
    await context.route('**/*', async route => {
      const req = route.request();
      const url = new URL(req.url());
      if (url.hostname === '127.0.0.1') return route.continue();
      if (url.host !== SUPABASE_HOST) { blocked.add(url.hostname); return route.abort(); }
      hits.push(`${req.method()} ${url.pathname}`);
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
      const json = (body, status = 200, extra = {}) => route.fulfill({ status, headers: { ...CORS, 'content-type': 'application/json', ...extra }, body: JSON.stringify(body) });
      const p = url.pathname;
      if (p.startsWith('/auth/v1/user')) return scenario.signedIn ? json(session().user) : json({ msg: 'no session' }, 401);
      if (p.startsWith('/auth/v1/')) return json({ error: 'stub' }, 400);
      if (p === '/rest/v1/rpc/game_cfg') return json(CFG);
      if (p === '/rest/v1/rpc/game_me') return json(scenario.me ?? null);
      if (p === '/rest/v1/rpc/check_in') return scenario.checkIn ? json(scenario.checkIn.body, scenario.checkIn.status) : json({ message: 'BAD_INPUT' }, 400);
      if (p === '/rest/v1/spot_summary') return json(SPOTS);
      if (p === '/rest/v1/check_ins') return json([], 200, { 'content-range': '*/0' });
      return json([]);
    });
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(`${base}/${hash}`);
    await page.waitForSelector('.g-view', { timeout: 15000 });
    await page.waitForSelector('[data-spot-id]', { timeout: 15000 });
    return { page, context, hits, blocked, errors };
  }

  test('anonym: HUD, spodné menu, piny so crew, loot a pulzom, holo karta, check-in pýta prihlásenie', async () => {
    const { page, context, hits, blocked, errors } = await open('#/mapa');
    try {
      assert.deepEqual(await page.$$eval('.g-menu-item span', els => els.map(e => e.textContent)), ['MAPA', 'FEED', 'CREW', 'REBRÍČEK', 'LOADOUT']);
      assert.equal(await page.getAttribute('.g-menu-item[data-game-nav="map"]', 'aria-current'), 'page');
      assert.match(await page.textContent('.g-chip-player'), /Prihlásiť sa/);
      assert.equal(await page.$$eval('[data-spot-id]', els => new Set(els.map(e => e.dataset.spotId)).size), 2);
      const usingMap = await page.$('.g-pin[data-spot-id]');
      if (usingMap) {
        const crew = await page.$(`.g-pin[data-spot-id="${SPOTS[0].id}"]`);
        assert.equal(await crew.$eval('.g-pin-tag', e => e.textContent), 'RR');
        assert.ok(await crew.$('.g-pin-loot'), 'loot ikona');
        assert.equal(await crew.getAttribute('data-pulse'), '2');
        assert.ok(await crew.$('.g-ring'), 'pulz pri ľuďoch na spote');
        assert.match(await crew.getAttribute('style'), /--pin:\s*#ff3366/);
        assert.equal(await page.$eval(`.g-pin[data-spot-id="${SPOTS[1].id}"]`, e => e.dataset.pulse), '0');
      }
      await page.click(`[data-spot-id="${SPOTS[0].id}"]`);
      await page.waitForSelector('.g-sheet.open .g-holo');
      assert.equal(await page.textContent('#g-spot-name'), 'Eurovea schody');
      assert.equal(await page.$$eval('.g-holo .g-skull.on', els => els.length), 4);
      assert.equal(await page.getAttribute('.g-bust', 'data-level'), '2');
      assert.match(await page.textContent('.g-holo'), /RR drží spot · 145 b/);
      assert.match(await page.textContent('.g-holo'), /LOOT DROP/);
      // web má skutočné adresy: starý odkaz /#/mapa sa prepíše na /mapa, otvorený spot je /spot/<id>
      assert.match(await page.evaluate(() => location.pathname), /^\/spot\//);
      await page.click('.g-btn-in');
      await page.waitForSelector('dialog[open]');
      assert.match(await page.textContent('dialog[open]'), /Prihlásenie/);
      assert.ok(hits.some(h => h.endsWith('/rest/v1/spot_summary')), 'spoty zo spot_summary');
      assert.ok(!hits.some(h => h.includes('/rpc/check_in')), 'anonym nevolá check_in');
      for (const host of blocked) assert.ok(!host.endsWith('supabase.co'), `požiadavka na ${host} išla mimo stub`);
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });

  test('U16 bez súhlasu: páska „len prezeranie“ a check-in je vypnutý', async () => {
    const { page, context, errors } = await open('#/mapa', { signedIn: true, me: { id: USER_ID, username: 'kubko', city: 'Bratislava', stance: 'regular', board_config: {}, can_write: false, needs_guardian: true } });
    try {
      await page.waitForSelector('.g-banner.tape');
      assert.match(await page.textContent('.g-banner.tape'), /Len prezeranie/);
      assert.match(await page.textContent('.g-chip-player'), /@kubko/);
      await page.click(`[data-spot-id="${SPOTS[1].id}"]`);
      await page.waitForSelector('.g-sheet.open');
      assert.equal(await page.$eval('.g-btn-in', b => b.disabled), true);
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });

  test('hráč ďaleko od spotu: TOO_FAR ukáže vzdialenosť a limit', async () => {
    const { page, context } = await open(`#/spot/${SPOTS[0].id}`, {
      signedIn: true, geo: { latitude: 48.1436, longitude: 17.1235 },
      me: { id: USER_ID, username: 'jano_flip', city: 'Bratislava', stance: 'goofy', board_config: {}, can_write: true, needs_guardian: false },
      checkIn: { status: 400, body: { code: 'P0001', message: 'TOO_FAR', details: '{"distance_m": 340, "max_m": 150}', hint: null } },
    });
    try {
      await page.waitForSelector('.g-sheet.open .g-btn-in');
      await page.click('.g-btn-in');
      await page.waitForFunction(() => /Si 340 m od spotu/.test(document.querySelector('.g-sheet .g-msg')?.textContent || ''));
      assert.equal(await page.textContent('.g-sheet .g-msg'), 'Si 340 m od spotu. Podíď bližšie, limit je 150 m.');
      assert.equal(await page.$eval('.g-btn-in', b => b.disabled), false, 'check-in sa dá skúsiť znova');
    } finally { await context.close(); }
  });

  test('zamietnutá poloha: jasná hláška, na server nič nejde', async () => {
    const { page, context, hits } = await open(`#/spot/${SPOTS[0].id}`, {
      signedIn: true,
      me: { id: USER_ID, username: 'jano_flip', city: null, stance: null, board_config: {}, can_write: true, needs_guardian: false },
    });
    try {
      await context.clearPermissions();
      await page.evaluate(() => {   // headless nemá dialóg povolenia: simuluj PERMISSION_DENIED
        navigator.geolocation.getCurrentPosition = (_ok, fail) => setTimeout(() => fail({ code: 1, message: 'denied' }), 10);
      });
      await page.waitForSelector('.g-sheet.open .g-btn-in');
      await page.click('.g-btn-in');
      await page.waitForFunction(() => /Povoľ polohu/.test(document.querySelector('.g-sheet .g-msg')?.textContent || ''));
      assert.ok(!hits.some(h => h.includes('/rpc/check_in')));
    } finally { await context.close(); }
  });

  test('reduced motion: piny bez pulzu, počet ľudí ostáva', async () => {
    const { page, context } = await open('#/mapa', { reducedMotion: true });
    try {
      const pin = await page.$(`.g-pin[data-spot-id="${SPOTS[0].id}"]`);
      if (!pin) return;   // bez WebGL je zoznam, pulz tam nie je vôbec
      assert.equal(await pin.getAttribute('data-pulse'), '0');
      assert.equal(await pin.$('.g-ring'), null);
      assert.equal(await pin.$eval('.g-pin-count', e => e.textContent), '3');
    } finally { await context.close(); }
  });

  test('ďalšie herné stránky: FEED a LOADOUT čoskoro, REBRÍČEK crews, starý zoznam spotov ostal', async () => {
    const { page, context, errors } = await open('#/mapa');
    try {
      await page.click('.g-menu-item[data-game-nav="feed"]');
      await page.waitForSelector('.g-soon');
      assert.match(await page.textContent('.g-soon'), /ČOSKORO/);
      await page.click('.g-menu-item[data-game-nav="board"]');
      await page.waitForSelector('.g-board .g-hint');
      assert.match(await page.textContent('.g-board'), /Zatiaľ tu nie je žiadna crew/);
      await page.goto(`${base}/#/spoty`);
      await page.waitForSelector('.spot-list');
      assert.equal(await page.$('body.game-mode'), null, 'mimo hry sa herný režim vypne');
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });

  test('skutočné adresy: /mapa, /spot/<id>, herná CREW na /hra/crew, Robove crew na /crew', async () => {
    const { page, context, errors } = await open('mapa');
    try {
      assert.equal(await page.evaluate(() => location.pathname), '/mapa');
      await page.click('.g-menu-item[data-game-nav="crew"]');
      await page.waitForSelector('.g-soon');
      assert.equal(await page.evaluate(() => location.pathname), '/hra/crew');
      await page.goBack();
      await page.waitForSelector('[data-spot-id]');
      assert.equal(await page.evaluate(() => location.pathname), '/mapa');
      await page.goto(`${base}/crew`);
      await page.waitForSelector('.crew-grid');
      assert.equal(await page.$('body.game-mode'), null);
      await page.goto(`${base}/spot/${SPOTS[0].id}`);
      await page.waitForSelector('.g-sheet.open .g-holo');
      assert.equal(await page.textContent('#g-spot-name'), 'Eurovea schody');
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });
});

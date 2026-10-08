// Smoke hry Ghoskate (/hra, staré #/mapa) v headless Chromiu proti lokálnemu dev serveru so stubnutým Supabase.
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
      if (url.hostname === '127.0.0.1') {
        if (scenario.local && url.pathname.startsWith('/api/')) {
          const done = scenario.local(url.pathname, req, (body, status = 200) => route.fulfill({ status, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }));
          if (done) return done;
        }
        return route.continue();
      }
      if (url.host !== SUPABASE_HOST) { blocked.add(url.hostname); return route.abort(); }
      hits.push(`${req.method()} ${url.pathname}`);
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
      const json = (body, status = 200, extra = {}) => route.fulfill({ status, headers: { ...CORS, 'content-type': 'application/json', ...extra }, body: JSON.stringify(body) });
      const p = url.pathname;
      if (scenario.route) { const done = scenario.route(p, req, json); if (done) return done; }   // vráti Promise z json() alebo null
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
    const { page, context, hits, blocked, errors } = await open('hra');
    try {
      assert.deepEqual(await page.$$eval('.g-menu-item span', els => els.map(e => e.textContent)), ['MAPA', 'FEED', 'CREW', 'REBRÍČEK', 'LOADOUT']);
      assert.equal(await page.getAttribute('.g-top .g-me', 'href'), '#/hra/profil');
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
      // otvorený spot má vlastnú adresu v appke: /hra/spot/<id>
      assert.equal(await page.evaluate(() => location.pathname), `/hra/spot/${SPOTS[0].id}`);
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
    const { page, context, errors } = await open('hra', { signedIn: true, me: { id: USER_ID, username: 'kubko', city: 'Bratislava', stance: 'regular', board_config: {}, can_write: false, needs_guardian: true } });
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
    const { page, context } = await open(`hra/spot/${SPOTS[0].id}`, {
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
    const { page, context, hits } = await open(`hra/spot/${SPOTS[0].id}`, {
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
    const { page, context } = await open('hra', { reducedMotion: true });
    try {
      const pin = await page.$(`.g-pin[data-spot-id="${SPOTS[0].id}"]`);
      if (!pin) return;   // bez WebGL je zoznam, pulz tam nie je vôbec
      assert.equal(await pin.getAttribute('data-pulse'), '0');
      assert.equal(await pin.$('.g-ring'), null);
      assert.equal(await pin.$eval('.g-pin-count', e => e.textContent), '3');
    } finally { await context.close(); }
  });

  test('ďalšie herné stránky: FEED, LOADOUT čoskoro, REBRÍČEK crews, starý zoznam spotov ostal', async () => {
    const { page, context, errors } = await open('hra');
    try {
      await page.goto(`${base}/hra/feed`);
      await page.waitForSelector('.g-feed .g-hint');
      assert.match(await page.textContent('.g-feed'), /Zatiaľ žiadne klipy/);
      await page.goto(`${base}/hra/loadout`);
      await page.waitForFunction(() => /svoju dosku a odmeny/.test(document.querySelector('.g-page')?.textContent || ''));
      assert.equal(await page.getAttribute('.g-menu-item[data-game-nav="loadout"]', 'aria-current'), 'page');
      await page.click('.g-menu-item[data-game-nav="board"]');
      await page.waitForSelector('.g-board .g-hint');
      assert.equal(await page.evaluate(() => location.pathname), '/hra/rebricek');
      assert.match(await page.textContent('.g-board'), /Zatiaľ tu nie je žiadna crew/);
      await page.goto(`${base}/spoty`);
      await page.waitForSelector('.spot-list');
      assert.equal(await page.$('body.game-mode'), null, 'mimo hry sa herný režim vypne');
      assert.equal(await page.$('body.game-app'), null);
      assert.equal(await page.getAttribute('.page-head a[href="/hra"]', 'href'), '/hra', 'z Robovej mapy sa dá prejsť do hry');
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });

  test('herný shell: horná lišta Ghoskate s odkazom na GOSko, bez hlavičky, spodného menu a pätičky webu, herný manifest', async () => {
    const { page, context, errors } = await open('hra');
    try {
      const visible = sel => page.$eval(sel, e => getComputedStyle(e).display !== 'none' && e.getClientRects().length > 0).catch(() => false);
      assert.match(await page.textContent('.g-top'), /Ghoskate/);
      assert.equal(await page.getAttribute('.g-top a.g-back', 'href'), './');
      assert.match(await page.textContent('.g-top a.g-back'), /GOSko/);
      assert.equal(await visible('.g-top'), true);
      for (const sel of ['body > header.topbar', 'body > footer', 'nav.tabbar']) assert.equal(await visible(sel), false, `${sel} má byť v hre skrytý`);
      assert.equal(await page.getAttribute('link[rel="manifest"]', 'href'), 'ghoskate.webmanifest');
      assert.equal(await page.getAttribute('meta[name="apple-mobile-web-app-title"]', 'content'), 'Ghoskate');
      assert.equal(await page.getAttribute('meta[name="theme-color"]', 'content'), '#14111C');
      assert.equal(await page.getAttribute('link[rel="apple-touch-icon"]', 'href'), 'icons/ghoskate-apple-touch.png');
      const m = await page.evaluate(async () => (await fetch(document.querySelector('link[rel="manifest"]').href)).json());
      assert.equal(m.name, 'Ghoskate');
      assert.equal(m.start_url, '/hra');
      // na mobile tiež: herné menu dole, webové spodné menu nie
      await page.setViewportSize({ width: 390, height: 800 });
      assert.equal(await visible('nav.tabbar'), false);
      assert.equal(await visible('.g-menu'), true);
      // späť na web: hlavička a manifest GOSko sa vrátia
      await page.click('.g-top a.g-back');
      await page.waitForFunction(() => !document.body.classList.contains('game-app'));
      assert.equal(await page.evaluate(() => location.pathname), '/');
      assert.equal(await visible('body > header.topbar'), true);
      assert.equal(await page.getAttribute('link[rel="manifest"]', 'href'), 'manifest.webmanifest');
      assert.equal(await page.getAttribute('meta[name="apple-mobile-web-app-title"]', 'content'), 'GOSko');
      assert.equal(await page.$('.g-top'), null);
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });

  test('vstup z webu: hlavné menu má Ghoskate a vedie do appky na /hra', async () => {
    const { page, context, errors } = await open('hra');
    try {
      await page.goto(`${base}/eventy`);
      await page.waitForSelector('body:not(.game-app) .topbar .nav a[data-nav="hra"]');
      assert.match(await page.textContent('.topbar .nav a[data-nav="hra"]'), /Ghoskate/);
      await page.click('.topbar .nav a[data-nav="hra"]');
      await page.waitForSelector('[data-spot-id]');
      assert.equal(await page.evaluate(() => location.pathname), '/hra');
      assert.ok(await page.$('body.game-app'));
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });

  test('staré adresy vedú do /hra: /mapa, /spot/<id>, /feed, hash z e-mailu #/mapa a #/spot/<id>', async () => {
    const { page, context, errors } = await open('mapa');
    try {
      assert.equal(await page.evaluate(() => location.pathname), '/hra');
      await page.goto(`${base}/spot/${SPOTS[0].id}`);
      await page.waitForSelector('.g-sheet.open .g-holo');
      assert.equal(await page.evaluate(() => location.pathname), `/hra/spot/${SPOTS[0].id}`);
      assert.equal(await page.textContent('#g-spot-name'), 'Eurovea schody');
      await page.goto(`${base}/feed`);
      await page.waitForSelector('.g-feed');
      assert.equal(await page.evaluate(() => location.pathname), '/hra/feed');
      await page.goto(`${base}/#/mapa`);
      await page.waitForSelector('[data-spot-id]');
      await page.waitForFunction(() => location.pathname === '/hra' && !location.hash);
      await page.goto(`${base}/#/spot/${SPOTS[1].id}`);
      await page.waitForSelector('.g-sheet.open .g-holo');
      await page.waitForFunction(id => location.pathname === `/hra/spot/${id}`, SPOTS[1].id);
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });

  const PLAYER_ME = { id: USER_ID, username: 'jano_flip', city: 'Bratislava', stance: 'goofy', board_config: {}, can_write: true, needs_guardian: false, can_publish: true, media_consent: false };
  const CLIPS = [
    { id: 'c1000000-0000-4000-8000-000000000001', spot_id: SPOTS[0].id, spot_name: SPOTS[0].name, username: 'ghost_rr', crew_id: 'c0000000-0000-4000-8000-000000000001', crew_tag: 'RR', crew_color: '#FF3366',
      media_kind: 'video', media_path: `${USER_ID}/11111111-2222-4333-8444-555555555555.mp4`, embed_url: null, trick: 'kickflip', duration_s: 14, verified: true, likes: 3, created_at: new Date(Date.now() - 5 * 60_000).toISOString() },
    { id: 'c1000000-0000-4000-8000-000000000002', spot_id: SPOTS[1].id, spot_name: SPOTS[1].name, username: 'jano_flip', crew_id: null, crew_tag: null, crew_color: null,
      media_kind: 'embed', media_path: null, embed_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', trick: null, duration_s: null, verified: false, likes: 0, created_at: new Date(Date.now() - 3 * 3600_000).toISOString() },
    { id: 'c1000000-0000-4000-8000-000000000003', spot_id: SPOTS[1].id, spot_name: SPOTS[1].name, username: 'ema', crew_id: null, crew_tag: null, crew_color: null,
      media_kind: 'embed', media_path: null, embed_url: 'https://www.instagram.com/reel/C1a2B3c4D5e/', trick: 'boardslide', duration_s: null, verified: true, likes: 1, created_at: new Date(Date.now() - 30 * 3600_000).toISOString() },
  ];
  const clipRoute = (calls = []) => (p, req, json) => {
    if (p === '/rest/v1/clips_public') {
      const spot = new URL(req.url()).searchParams.get('spot_id');
      return json(spot ? CLIPS.filter(c => `eq.${c.spot_id}` === spot) : CLIPS);
    }
    if (p === '/storage/v1/object/sign/media') {
      const { paths } = req.postDataJSON();
      return json(paths.map(path => ({ path, signedURL: `/object/sign/media/${path}?token=stub`, error: null })));
    }
    if (p === '/rest/v1/rpc/add_clip') { calls.push(['add_clip', req.postDataJSON()]); return json({ id: 'c-new', verified: true, spot_id: SPOTS[0].id, created_at: new Date().toISOString() }); }
    if (p === '/rest/v1/rpc/like_clip') { calls.push(['like_clip', req.postDataJSON()]); return json({ clip_id: CLIPS[0].id, likes: 4 }); }
    if (p.startsWith('/storage/v1/object/media/')) { calls.push(['upload', p]); return json({ Key: p }); }
    return null;
  };

  test('FEED: klipy z clips_public, overené na spote, video s podpísanou URL, YouTube a Instagram, lajk', async () => {
    const calls = [];
    const { page, context, errors, hits } = await open('hra', { signedIn: true, me: PLAYER_ME, route: clipRoute(calls) });
    try {
      await page.click('.g-menu-item[data-game-nav="feed"]');
      await page.waitForSelector('.g-feed .g-clip');
      assert.equal(await page.evaluate(() => location.pathname), '/hra/feed');
      assert.equal(await page.getAttribute('.g-menu-item[data-game-nav="feed"]', 'aria-current'), 'page');
      assert.equal(await page.$$eval('.g-clip', els => els.length), 3);
      const first = await page.$(`.g-clip[data-clip-id="${CLIPS[0].id}"]`);
      assert.match(await first.textContent(), /@ghost_rr/);
      assert.match(await first.textContent(), /OVERENÉ NA SPOTE/);
      assert.match(await first.textContent(), /pred \d+ min/);
      assert.match(await first.$eval('video', v => v.getAttribute('src')), /\/storage\/v1\/object\/sign\/media\/.+\.mp4\?token=stub$/);
      assert.equal(await first.$eval('.g-clip-spot', a => a.getAttribute('href')), `#/hra/spot/${SPOTS[0].id}`);
      const yt = await page.$(`.g-clip[data-clip-id="${CLIPS[1].id}"]`);
      assert.match(await yt.$eval('img', i => i.src), /i\.ytimg\.com\/vi\/dQw4w9WgXcQ/);
      assert.equal(await yt.$eval('.g-like', b => b.disabled), true, 'vlastný klip sa nelajkuje');
      assert.ok(await yt.$('button.linklike'), 'vlastný klip sa dá zmazať');
      const ig = await page.$(`.g-clip[data-clip-id="${CLIPS[2].id}"]`);
      assert.equal(await ig.$eval('a.g-clip-media', a => a.href), 'https://www.instagram.com/reel/C1a2B3c4D5e/');
      assert.equal(await ig.$eval('a.g-clip-media', a => a.rel), 'noopener noreferrer');
      await first.$eval('.g-like', b => b.click());
      await page.waitForFunction(id => document.querySelector(`[data-clip-id="${id}"] .g-like`)?.getAttribute('aria-pressed') === 'true', CLIPS[0].id);
      assert.equal(await first.$eval('.g-like-n', e => e.textContent), '4');
      assert.deepEqual(calls.find(c => c[0] === 'like_clip')[1], { p_clip: CLIPS[0].id });
      assert.ok(hits.some(h => h === 'POST /storage/v1/object/sign/media'), 'podpísané URL pre súkromný bucket');
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });

  test('klip zo spotu: karta ukáže klipy spotu, neplatný odkaz má hlášku, platný ide do add_clip', async () => {
    const calls = [];
    const { page, context, errors } = await open(`hra/spot/${SPOTS[0].id}`, { signedIn: true, me: PLAYER_ME, route: clipRoute(calls) });
    try {
      await page.waitForSelector('.g-sheet.open .g-spot-clips .g-clip');
      assert.equal(await page.$$eval('.g-spot-clips .g-clip', els => els.length), 1, 'len klipy z tohto spotu');
      await page.click('.g-spot-clips .g-spot-sec-head button');
      await page.waitForSelector('.g-sheet-form input[name="link"]');
      await page.fill('.g-sheet-form input[name="link"]', 'https://vimeo.com/123456');
      await page.click('.g-sheet-form button[type="submit"]');
      await page.waitForFunction(() => /Instagram, TikTok alebo YouTube/.test(document.querySelector('.g-sheet-form .g-msg[role="alert"]')?.textContent || ''));
      assert.equal(calls.filter(c => c[0] === 'add_clip').length, 0, 'neplatný odkaz nejde na server');
      await page.fill('.g-sheet-form input[name="link"]', 'https://youtu.be/dQw4w9WgXcQ?si=abc');
      await page.fill('.g-sheet-form input[name="trick"]', 'tre flip');
      await page.click('.g-sheet-form button[type="submit"]');
      await page.waitForSelector('.g-toast');
      assert.match(await page.textContent('.g-toasts'), /overený na spote/);
      assert.deepEqual(calls.find(c => c[0] === 'add_clip')[1], { p_spot: SPOTS[0].id, p_kind: 'embed', p_embed_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', p_trick: 'tre flip' });
      await page.waitForSelector('.g-sheet.open .g-holo');
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });

  test('U16 so súhlasom s hrou, ale bez fotiek: namiesto Pridať klip výzva a odkaz na profil', async () => {
    const { page, context, errors } = await open(`hra/spot/${SPOTS[0].id}`, { signedIn: true, route: clipRoute(),
      me: { ...PLAYER_ME, username: 'kubko', can_publish: false } });
    try {
      await page.waitForSelector('.g-sheet.open .g-spot-clips');
      assert.equal(await page.$('.g-spot-clips .g-spot-sec-head button'), null);
      assert.match(await page.textContent('.g-spot-clips'), /súhlas s fotkami a videami/);
      await page.goto(`${base}/hra/profil`);
      await page.waitForSelector('.g-consent');
      assert.match(await page.textContent('.g-consent'), /Poslať rodičovi odkaz/);
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });

  const MY_CREW = { id: 'c0000000-0000-4000-8000-000000000001', name: 'Ružinov Rats', tag: 'RR', color: '#FF3DA5', role: 'owner', invite_code: 'ABCD2345', max: 10,
    points: 145, rank: 1, spots_controlled: 1,
    members: [{ player_id: USER_ID, username: 'jano_flip', role: 'owner', joined_at: '2026-10-01T10:00:00Z' },
      { player_id: '0b5b0000-0000-4000-8000-000000000002', username: 'ema', role: 'member', joined_at: '2026-10-02T10:00:00Z' }] };
  const crewRoute = (calls, state) => (p, req, json) => {
    if (p === '/rest/v1/rpc/my_crew') return json(state.crew);
    if (p === '/rest/v1/rpc/create_crew') { calls.push(['create_crew', req.postDataJSON()]); state.crew = MY_CREW; return json({ id: MY_CREW.id, name: 'Ružinov Rats', tag: 'RR', color: '#FF3DA5' }); }
    if (p === '/rest/v1/rpc/crew_preview') return state.preview ? json(state.preview) : json({ message: 'BAD_CODE' }, 400);
    if (p === '/rest/v1/rpc/join_crew') { calls.push(['join_crew', req.postDataJSON()]); return state.joinError ? json({ message: state.joinError }, 400) : (state.crew = { ...MY_CREW, role: 'member' }, json({ id: MY_CREW.id, tag: 'RR' })); }
    if (p === '/rest/v1/rpc/kick_crew_member') { calls.push(['kick', req.postDataJSON()]); state.crew = { ...MY_CREW, members: MY_CREW.members.slice(0, 1) }; return json({}); }
    if (p === '/rest/v1/spot_crew_scores') return json([{ crew_id: MY_CREW.id, tag: 'RR', color: '#FF3366', points: 145 }, { crew_id: 'c2', tag: 'GG', color: '#6FF3FF', points: 90 }]);
    return null;
  };

  test('CREW: hráč bez crew založí crew (zlý TAG má hlášku), potom vidí kód pozvánky, členov a vyhodí člena', async () => {
    const calls = [], state = { crew: null };
    const { page, context, errors } = await open('hra', { signedIn: true, me: PLAYER_ME, route: crewRoute(calls, state) });
    try {
      await page.click('.g-menu-item[data-game-nav="crew"]');
      await page.waitForSelector('form.g-card-form input[name="tag"]');
      await page.fill('input[name="name"]', 'Ružinov Rats');
      await page.fill('input[name="tag"]', 'R');
      await page.click('form.g-card-form:has(input[name="tag"]) button[type="submit"]');
      await page.waitForFunction(() => /TAG má 2 až 4 znaky/.test(document.querySelector('form.g-card-form .g-msg')?.textContent || ''));
      assert.equal(calls.length, 0);
      await page.fill('input[name="tag"]', 'rr');
      assert.equal(await page.inputValue('input[name="tag"]'), 'RR');
      await page.click('form.g-card-form:has(input[name="tag"]) button[type="submit"]');
      await page.waitForSelector('.g-crew .g-code');
      assert.deepEqual(calls[0], ['create_crew', { p_name: 'Ružinov Rats', p_tag: 'RR', p_color: '#FF3DA5' }]);
      assert.equal(await page.textContent('.g-code'), 'ABCD2345');
      assert.match(await page.textContent('.g-crew'), /2 z 10 členov/);
      assert.match(await page.textContent('.g-crew'), /145 b za 30 dní/);
      page.once('dialog', d => d.accept());
      await page.click('.g-roster li:nth-child(2) .linklike');
      await page.waitForFunction(() => document.querySelectorAll('.g-roster li').length === 1);
      assert.deepEqual(calls.at(-1), ['kick', { p_player: '0b5b0000-0000-4000-8000-000000000002' }]);
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });

  test('pozvánka odkazom /hra/crew/pridat/<KÓD>: náhľad crew, pridanie; plná crew má hlášku a vypnuté tlačidlo', async () => {
    const calls = [], state = { crew: null, preview: { id: MY_CREW.id, name: 'Ružinov Rats', tag: 'RR', color: '#FF3DA5', members: 9, max: 10, full: false } };
    const { page, context, errors } = await open('hra', { signedIn: true, me: PLAYER_ME, route: crewRoute(calls, state) });
    try {
      await page.goto(`${base}/hra/crew/pridat/ABCD2345`);
      await page.waitForSelector('.g-crew-card .g-btn-in');
      assert.match(await page.textContent('.g-crew-card'), /Ružinov Rats/);
      assert.match(await page.textContent('.g-crew-card'), /9 z 10 členov/);
      await page.click('.g-crew-card .g-btn-in');
      await page.waitForSelector('.g-crew .g-code');
      assert.deepEqual(calls[0], ['join_crew', { p_code: 'ABCD2345' }]);
      assert.equal(await page.evaluate(() => location.pathname), '/hra/crew');

      state.crew = null; state.preview = { ...state.preview, members: 10, full: true };
      await page.goto(`${base}/hra/crew/pridat/ABCD2345`);
      await page.waitForSelector('.g-crew-card .g-btn-in');
      assert.equal(await page.$eval('.g-crew-card .g-btn-in', b => b.disabled), true);
      assert.match(await page.textContent('.g-crew-card'), /Crew je plná/);

      state.preview = { ...state.preview, members: 9, full: false }; state.joinError = 'CREW_FULL';
      await page.goto(`${base}/hra/crew/pridat/ABCD2345`);
      await page.waitForSelector('.g-crew-card .g-btn-in:not([disabled])');
      await page.click('.g-crew-card .g-btn-in');
      await page.waitForFunction(() => /Crew je plná/.test(document.querySelector('.g-crew-card .g-msg[role="alert"]')?.textContent || ''));
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });

  test('karta spotu: Turf Wars „RR vedie 145 : 90 nad GG“ s pruhmi crews', async () => {
    const { page, context, errors } = await open(`hra/spot/${SPOTS[0].id}`, { route: crewRoute([], { crew: null }) });
    try {
      await page.waitForFunction(() => /RR vedie 145 : 90 nad GG/.test(document.querySelector('.g-spot-turf')?.textContent || ''));
      assert.equal(await page.$$eval('.g-turf li', els => els.length), 2);
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });

  const GEAR = [
    { id: 'gosko-ghost', name: 'Duch GOSko', kind: 'sticker', description: 'Prvá nálepka.', how_to_unlock: 'Máš ju od začiatku.', event_id: null },
    { id: 'ghost-drop', name: 'Ghost drop', kind: 'sticker', description: 'Z loot dropu.', how_to_unlock: 'Vyjazdi loot drop: check-in, overený klip na spote a kód odmeny.', event_id: null },
  ];
  const DROP = { id: 'd0000000-0000-4000-8000-000000000001', spot_id: SPOTS[0].id, title: 'Ghost drop', description: null, partner: 'Skateshop',
    starts_at: new Date(Date.now() - 3600_000).toISOString(), ends_at: null, tiers: [{ tier: 1, label: 'Top 3', up_to: 3, reward: 'Doska', gear_id: 'ghost-drop' }], capacity: 3, claimed: 1, remaining: 2 };
  const lootRoute = (calls, state) => (p, req, json) => {
    if (p === '/rest/v1/loot_public') return json([DROP]);
    if (p === '/rest/v1/rpc/claim_loot') { calls.push(['claim_loot', req.postDataJSON()]); return state.claimError ? json({ message: state.claimError }, 400) : json({ drop_id: DROP.id, tier: 1, rank: 2, label: 'Top 3', reward: 'Doska', gear_id: 'ghost-drop', reward_code: 'GHOST-42' }); }
    if (p === '/rest/v1/gear') return json(GEAR);
    if (p === '/rest/v1/unlocked_gear') return json([{ gear_id: 'gosko-ghost', source: 'starter' }]);
    if (p === '/rest/v1/rpc/my_loot') return json(state.loot || []);
    if (p === '/rest/v1/rpc/set_loadout') { calls.push(['set_loadout', req.postDataJSON()]); return json(req.postDataJSON().p_config); }
    if (p === '/rest/v1/rpc/set_nft_consent') { calls.push(['set_nft_consent', req.postDataJSON()]); return json({ nft_consent: req.postDataJSON().p_on }); }
    if (p === '/rest/v1/rpc/is_admin') return json(Boolean(state.admin));
    return null;
  };

  test('LOOT na karte spotu: tiery a vyzdvihnutie ukáže kód; NEED_CLIP_ON_SPOT má jasnú hlášku', async () => {
    const calls = [], state = { claimError: 'NEED_CLIP_ON_SPOT' };
    const { page, context, errors } = await open(`hra/spot/${SPOTS[0].id}`, { signedIn: true, me: PLAYER_ME, route: lootRoute(calls, state) });
    try {
      await page.waitForSelector('.g-sheet.open .g-drop-card .g-btn-in');
      assert.match(await page.textContent('.g-drop-card'), /1\. až 3\.: Doska \(Top 3\)/);
      assert.match(await page.textContent('.g-drop-card'), /2 z 3 odmien ostáva/);
      await page.click('.g-drop-card .g-btn-in');
      await page.waitForFunction(() => /overený klip/.test(document.querySelector('.g-drop-card .g-msg')?.textContent || ''));
      state.claimError = null;
      await page.click('.g-drop-card .g-btn-in');
      await page.waitForSelector('.g-reward .g-code');
      assert.equal(await page.textContent('.g-reward .g-code'), 'GHOST-42');
      assert.deepEqual(calls.filter(c => c[0] === 'claim_loot').map(c => c[1]), [{ p_drop: DROP.id }, { p_drop: DROP.id }]);
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });

  test('LOADOUT: vlastná nálepka sa dá nalepiť, zamknutá je silueta s popisom, uloženie dosky, súhlas s NFT, odmena s kódom', async () => {
    const calls = [], state = { loot: [{ claim_id: 'cl1', drop_id: DROP.id, spot_id: SPOTS[0].id, title: 'Ghost drop', partner: 'Skateshop', tier: 1, label: 'Top 3', reward: 'Doska', reward_code: 'GHOST-42', gear_id: null, rank: 2, claimed_at: new Date().toISOString(), nft_type: null, nft_status: null }] };
    const { page, context, errors } = await open('hra', { signedIn: true, me: { ...PLAYER_ME, nft_consent: false, board_config: {} }, route: lootRoute(calls, state) });
    try {
      await page.click('.g-menu-item[data-game-nav="loadout"]');
      await page.waitForSelector('.g-gear-list .g-gear');
      assert.match(await page.textContent('.g-gear.placed'), /Duch GOSko/, 'bez uloženej dosky sú nalepené vlastné nálepky');
      const locked = await page.$('.g-gear.locked');
      assert.match(await locked.textContent(), /Vyjazdi loot drop/);
      assert.equal(await locked.$('button'), null, 'zamknutú nálepku nejde nalepiť');
      await page.click('.g-gear.placed button');
      await page.waitForFunction(() => !document.querySelector('.g-gear.placed'));
      await page.click('.g-gear:not(.locked) button');
      await page.click('.g-loadout .g-btn-in');
      await page.waitForFunction(() => /Doska je uložená/.test(document.querySelector('.g-toasts')?.textContent || ''));
      assert.deepEqual(calls.find(c => c[0] === 'set_loadout')[1].p_config.stickers, ['gosko-ghost']);
      assert.equal(await page.textContent('.g-rewards .g-code'), 'GHOST-42');
      await page.check('.g-nft input[type="checkbox"]');
      await page.waitForFunction(() => /Súhlas s NFT je zapnutý/.test(document.querySelector('.g-toasts')?.textContent || ''));
      assert.deepEqual(calls.find(c => c[0] === 'set_nft_consent')[1], { p_on: true });
      assert.equal(await page.$('a[href="#/hra/admin"]'), null, 'odkaz na admina len pre admina');
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });

  test('ADMIN /hra/admin: bez admina zákaz; admin založí drop s tiermi cez /api/admin/loot', async () => {
    const calls = [], state = { admin: false };
    const posted = [];
    const local = (p, req, json) => {
      if (p !== '/api/admin/loot') return null;
      if (req.method() === 'POST') { posted.push(req.postDataJSON()); return json({ ok: true, id: DROP.id, capacity: 3 }, 201); }
      return json({ ok: true, drops: posted.length ? [{ id: DROP.id, spot_id: SPOTS[0].id, spot_name: SPOTS[0].name, title: 'Ghost drop', active: true, nft_type: 1, tiers: [{ up_to: 3 }], claimed: 0 }] : [] });
    };
    const { page, context, errors } = await open('hra', { signedIn: true, me: PLAYER_ME, route: lootRoute(calls, state), local });
    try {
      await page.goto(`${base}/hra/admin`);
      await page.waitForFunction(() => /Sem môže len admin/.test(document.querySelector('.g-page')?.textContent || ''));
      state.admin = true;
      await page.goto(`${base}/hra/admin`);
      await page.waitForSelector('form.g-card-form select[name="spot_id"]');
      await page.selectOption('select[name="spot_id"]', SPOTS[0].id);
      await page.fill('input[name="title"]', 'Ghost drop');
      await page.selectOption('select[name="nft_type"]', '1');
      const rows = await page.$$('.g-tier-row');
      await rows[0].$eval('[name=code]', (e) => { e.value = 'TOP3'; });
      await rows[1].$eval('[name=code]', (e) => { e.value = 'TOP50'; });
      await rows[0].$eval('[name=reward]', (e) => { e.value = 'Doska'; });
      await page.click('form.g-card-form button[type="submit"]');
      await page.waitForSelector('.g-drop-list li strong');
      assert.equal(posted.length, 1);
      assert.equal(posted[0].spot_id, SPOTS[0].id);
      assert.equal(posted[0].nft_type, 1);
      assert.deepEqual(posted[0].tiers.map(t => [t.label, t.up_to, t.code]), [['Top 3', 3, 'TOP3'], ['Top 50', 50, 'TOP50']]);
      assert.match(await page.textContent('.g-drop-list'), /0 z 3 vyzdvihnutých/);
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });

  test('PROFIL: úprava nicku, mesta, stance, avatara a farby; obsadený nick má hlášku', async () => {
    const calls = [];
    let taken = true;
    const route = (p, req, json) => {
      if (p !== '/rest/v1/rpc/update_profile') return null;
      calls.push(req.postDataJSON());
      if (taken) { taken = false; return json({ message: 'USERNAME_TAKEN' }, 400); }
      const v = req.postDataJSON();
      return json({ username: v.p_username, city: v.p_city, stance: v.p_stance, avatar: v.p_avatar, color: v.p_color });
    };
    const { page, context, errors } = await open('hra', { signedIn: true, me: { ...PLAYER_ME, avatar: 'ghost', color: '#FF3DA5' }, route });
    try {
      await page.click('.g-top .g-me');
      await page.waitForSelector('.g-profile .g-avatar.big');
      await page.click('.g-profile button.g-edit');
      await page.fill('input[name="username"]', 'novy_nick');
      await page.fill('input[name="city"]', 'Košice');
      await page.check('.g-pick-avatar input[value="skull"]');
      await page.check('.g-pick-color input[value="#6FF3FF"]');
      await page.click('.g-profile button[type="submit"]');
      await page.waitForFunction(() => /niekto má/.test(document.querySelector('.g-profile .g-msg')?.textContent || ''));
      await page.fill('input[name="username"]', 'iny_nick');
      await page.click('.g-profile button[type="submit"]');
      await page.waitForFunction(() => /@iny_nick/.test(document.querySelector('.g-profile h1')?.textContent || ''));
      assert.deepEqual(calls.at(-1), { p_username: 'iny_nick', p_city: 'Košice', p_stance: 'goofy', p_avatar: 'skull', p_color: '#6FF3FF' });
      assert.match(await page.textContent('.g-profile .g-holo-city'), /Košice · Goofy/);
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });

  test('herná CREW na /hra/crew, Robove crew na /crew, späť v histórii', async () => {
    const { page, context, errors } = await open('hra');
    try {
      await page.click('.g-menu-item[data-game-nav="crew"]');
      await page.waitForFunction(() => /Prihlás sa a založ si crew/.test(document.querySelector('.g-page')?.textContent || ''));
      assert.equal(await page.evaluate(() => location.pathname), '/hra/crew');
      await page.goBack();
      await page.waitForSelector('[data-spot-id]');
      assert.equal(await page.evaluate(() => location.pathname), '/hra');
      await page.click('.g-top .g-me[data-game-nav="profile"]');
      await page.waitForFunction(() => location.pathname === '/hra/profil');
      await page.goto(`${base}/crew`);
      await page.waitForSelector('.crew-grid');
      assert.equal(await page.$('body.game-mode'), null);
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });
});

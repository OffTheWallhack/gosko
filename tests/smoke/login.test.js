// Smoke prihlásenia heslom (CONFIG.LOGIN_MODE 'password') v headless Chromiu proti lokálnemu dev serveru.
//
//   npm run test:smoke        (PLAYWRIGHT_MODULE=/cesta/k/node_modules/playwright, inak sa test preskočí)
//
// Supabase Auth (/auth/v1/token, /signup, /resend) odpovedá stub v teste, nič nejde na sieť. Overuje:
// admin sa prihlási heslom bez kódu z e-mailu, nepotvrdený e-mail má jasnú hlášku a tlačidlo na nový
// potvrdzovací e-mail, zlé heslo, a nový účet bez session čaká na potvrdenie e-mailu.
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

const ADMIN_ID = '0a0a0000-0000-4000-8000-000000000001';
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const fakeJwt = () => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: ADMIN_ID, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}.c2ln`;
const user = { id: ADMIN_ID, aud: 'authenticated', role: 'authenticated', email: 'admin@test.local', email_confirmed_at: '2026-10-05T10:00:00Z', app_metadata: {}, user_metadata: {}, identities: [{}] };
const session = () => ({ access_token: fakeJwt(), token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'stub-refresh', user });
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,PATCH,DELETE,HEAD,OPTIONS', 'access-control-expose-headers': 'content-range' };
const authError = (code, msg, status = 400) => ({ status, body: { code: status, error_code: code, msg } });

describe('smoke: prihlásenie heslom', { skip: pw ? false : 'Playwright chýba (nastav PLAYWRIGHT_MODULE)' }, () => {
  let dev, base, browser;
  before(async () => {
    dev = createDevServer({ loadEnv: false, log: () => {} });
    base = (await dev.listen(0, '127.0.0.1')).url;
    browser = await pw.chromium.launch({ headless: true });
  });
  after(async () => { await browser?.close(); await dev?.close(); });

  /* scenario: { token: odpoveď /auth/v1/token, signup: odpoveď /auth/v1/signup } */
  async function open(hash, scenario = {}) {
    const context = await browser.newContext({ serviceWorkers: 'block' });
    const hits = [], errors = [];
    let signedIn = false;
    await context.route('**/*', async route => {
      const req = route.request(), url = new URL(req.url());
      if (url.hostname === '127.0.0.1') return route.continue();
      if (url.host !== SUPABASE_HOST) return route.abort();
      hits.push({ method: req.method(), path: url.pathname, search: url.search, body: req.postData() });
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
      const json = (body, status = 200) => route.fulfill({ status, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const p = url.pathname;
      if (p === '/auth/v1/token') {
        const r = scenario.token || { status: 200, body: session() };
        if (r.status === 200) signedIn = true;
        return json(r.body, r.status);
      }
      if (p === '/auth/v1/signup') { const r = scenario.signup; return json(r.body, r.status); }
      if (p === '/auth/v1/resend') return json({});
      if (p === '/auth/v1/user') return signedIn ? json(user) : json({ msg: 'no session' }, 401);
      if (p === '/auth/v1/otp') return json({ error: 'otp must not be used' }, 500);
      if (p === '/rest/v1/rpc/is_admin') return json(signedIn);
      return json([]);
    });
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(`${base}/${hash}`);
    return { page, context, hits, errors };
  }
  const openLogin = async page => {
    await page.locator('main button', { hasText: 'Prihlásiť sa' }).click();
    await page.waitForSelector('dialog[open] [name=password]');
  };

  test('admin: e-mail a heslo, bez kódu z e-mailu, potom admin', async () => {
    const { page, context, hits, errors } = await open('#/admin');
    try {
      await openLogin(page);
      const dlg = page.locator('dialog[open]');
      assert.equal(await dlg.locator('[name=code]').count(), 0, 'žiadny kód z e-mailu');
      assert.doesNotMatch(await dlg.textContent(), /kód/i);
      await dlg.locator('[name=email]').fill('Admin@test.local');
      await dlg.locator('[name=password]').fill('tajne-heslo-1');
      await dlg.locator('button[type=submit]').click();
      // po prihlásení sa admin prekreslí sám (route() zavrie okno)
      await page.waitForSelector('text=Zapisovať výsledky', { timeout: 10000 });
      const t = hits.find(h => h.path === '/auth/v1/token');
      assert.equal(t.search, '?grant_type=password');
      assert.deepEqual(JSON.parse(t.body), { email: 'admin@test.local', password: 'tajne-heslo-1', gotrue_meta_security: {} });
      assert.ok(!hits.some(h => h.path === '/auth/v1/otp'), 'magic link sa nevolá');
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });

  test('nepotvrdený e-mail: jasná hláška a nový potvrdzovací e-mail', async () => {
    const { page, context, hits, errors } = await open('#/admin', { token: authError('email_not_confirmed', 'Email not confirmed') });
    try {
      await openLogin(page);
      const dlg = page.locator('dialog[open]');
      await dlg.locator('[name=email]').fill('novy@test.local');
      await dlg.locator('[name=password]').fill('tajne-heslo-1');
      await dlg.locator('button[type=submit]').click();
      await page.waitForSelector('text=E-mail ešte nie je potvrdený');
      await dlg.locator('button', { hasText: 'Poslať potvrdzovací e-mail znova' }).click();
      await page.waitForSelector('text=Poslali sme ho znova');
      assert.deepEqual(JSON.parse(hits.find(h => h.path === '/auth/v1/resend').body).email, 'novy@test.local');
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });

  test('zlé heslo: hláška v okne, okno ostáva otvorené', async () => {
    const { page, context } = await open('#/admin', { token: authError('invalid_credentials', 'Invalid login credentials') });
    try {
      await openLogin(page);
      const dlg = page.locator('dialog[open]');
      await dlg.locator('[name=email]').fill('admin@test.local');
      await dlg.locator('[name=password]').fill('zle');
      await dlg.locator('button[type=submit]').click();
      await page.waitForSelector('text=Nesprávny e-mail alebo heslo.');
      assert.equal(await dlg.locator('[name=password]').count(), 1);
    } finally { await context.close(); }
  });

  test('nový účet: signUp e-mailom a heslom, bez session čaká na potvrdenie e-mailu', async () => {
    const { page, context, hits, errors } = await open('#/admin', {
      signup: { status: 200, body: { id: ADMIN_ID, email: 'hrac@test.local', identities: [{ id: 'x' }], aud: 'authenticated', role: 'authenticated' } },
    });
    try {
      await openLogin(page);
      await page.locator('dialog[open] button', { hasText: 'Založ si ho' }).click();
      await page.waitForSelector('dialog[open] [name=password2]');
      const dlg = page.locator('dialog[open]');
      await dlg.locator('[name=email]').fill('hrac@test.local');
      await dlg.locator('[name=password]').fill('kratke');
      await dlg.locator('[name=password2]').fill('kratke');
      await dlg.locator('button[type=submit]').click();
      await page.waitForSelector('text=aspoň 8 znakov');
      assert.ok(!hits.some(h => h.path === '/auth/v1/signup'), 'krátke heslo sa neposiela');
      await dlg.locator('[name=password]').fill('dlhe-heslo-1');
      await dlg.locator('[name=password2]').fill('dlhe-heslo-1');
      await dlg.locator('button[type=submit]').click();
      await page.waitForSelector('text=Účet je založený');
      const body = JSON.parse(hits.find(h => h.path === '/auth/v1/signup').body);
      assert.equal(body.email, 'hrac@test.local');
      assert.equal(body.password, 'dlhe-heslo-1');
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });
});

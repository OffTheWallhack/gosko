// Smoke test nasadenia: beží proti živej adrese (Vercel preview, produkcia alebo lokálny dev server).
//
//   GOSKO_URL=https://gosko-xyz.vercel.app node --test tests/smoke/deploy.test.js
//   GOSKO_URL=http://localhost:3000 npm run test:smoke        (so spusteným `node scripts/dev-server.js`)
//
// Bez GOSKO_URL sa celý súbor preskočí. Preview nasadenia sú predvolene za Vercel Authentication:
// nastav VERCEL_AUTOMATION_BYPASS_SECRET (Project Settings > Deployment Protection > Protection Bypass
// for Automation), test ho pošle v hlavičke x-vercel-protection-bypass.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const RAW_URL = process.env.GOSKO_URL;
const { CONFIG } = await import('../../data.js');
const SUPABASE_ORIGIN = new URL(CONFIG.SUPABASE_URL).origin;
const SKIP = RAW_URL ? false : 'GOSKO_URL nie je nastavené (napr. GOSKO_URL=http://localhost:3000)';
const BASE = RAW_URL ? RAW_URL.replace(/\/+$/, '') : 'http://unset.invalid';
const BYPASS = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
const ROOT = join(import.meta.dirname, '..', '..');

/** GET bez nasledovania presmerovaní, s bypass hlavičkou pre chránené preview. */
const get = (path, init = {}) => fetch(BASE + path, {
  redirect: 'manual',
  ...init,
  headers: { ...(BYPASS ? { 'x-vercel-protection-bypass': BYPASS } : {}), ...init.headers },
});

const hint = res => (res.status === 401 || res.status === 403
  ? ' (preview je asi za Vercel Authentication: nastav VERCEL_AUTOMATION_BYPASS_SECRET alebo vypni Deployment Protection)' : '');
const expectStatus = (res, status, path) => assert.equal(res.status, status, `${path}: čakal sa ${status}, prišlo ${res.status}${hint(res)}`);

// Všetky .js súbory v assets/ (aj vnorené, napr. assets/vendor) z lokálneho checkoutu; rovnaké musia byť aj na nasadení.
const assetScripts = readdirSync(join(ROOT, 'assets'), { recursive: true })
  .map(f => String(f).replaceAll('\\', '/'))
  .filter(f => f.endsWith('.js'))
  .map(f => `/assets/${f}`)
  .sort();

const parseCsp = value => new Map(String(value).split(';').map(s => s.trim()).filter(Boolean)
  .map(d => { const [name, ...sources] = d.split(/\s+/); return [name, sources]; }));

describe(`smoke: nasadenie${RAW_URL ? ` ${BASE}` : ""}`, { skip: SKIP }, () => {
  let home; // odpoveď na `/`, text a hlavičky

  before(async () => {
    let res;
    try { res = await get('/'); }
    catch (e) { throw new Error(`Nedá sa pripojiť na ${BASE}: ${e.cause?.code ?? e.message}`); }
    home = { status: res.status, headers: res.headers, text: await res.text() };
  });

  describe('verejné súbory vrátia 200', () => {
    for (const path of ['/', '/index.html', '/sw.js', '/manifest.webmanifest', '/data.js', '/assets/style.css', ...assetScripts]) {
      test(path, async () => {
        const res = await get(path);
        await res.arrayBuffer();
        expectStatus(res, 200, path);
      });
    }
  });

  test('assets/*.js: aspoň app.js je medzi súbormi, ktoré sa testujú', () => {
    assert.ok(assetScripts.includes('/assets/app.js'), `nenašiel som assets/app.js, testujem: ${assetScripts.join(', ')}`);
  });

  describe('typy obsahu', () => {
    const cases = [
      ['/', /^text\/html/], ['/sw.js', /javascript/], ['/data.js', /javascript/], ['/assets/app.js', /javascript/],
      ['/assets/style.css', /^text\/css/], ['/manifest.webmanifest', /json/],
    ];
    for (const [path, re] of cases) {
      test(`${path} je ${re}`, async () => {
        const res = await get(path);
        await res.arrayBuffer();
        expectStatus(res, 200, path);
        assert.match(res.headers.get('content-type') ?? '', re);
      });
    }
  });

  test('/ je skutočná stránka GOSko (nie prihlasovacia stránka Vercelu)', () => {
    assert.equal(home.status, 200, `/: ${home.status}`);
    assert.match(home.text, /<title>GOSko/);
    assert.match(home.text, /assets\/app\.js/);
  });

  describe('bezpečnostné hlavičky', () => {
    for (const path of ['/', '/sw.js', '/assets/app.js', '/manifest.webmanifest']) {
      test(path, async () => {
        const res = await get(path);
        await res.arrayBuffer();
        expectStatus(res, 200, path);
        const h = res.headers;
        assert.equal(h.get('x-content-type-options'), 'nosniff');
        assert.equal(h.get('referrer-policy'), 'strict-origin-when-cross-origin');
        const pp = h.get('permissions-policy') ?? '';
        for (const f of ['camera=(self)', 'geolocation=(self)', 'fullscreen=(self)', 'screen-wake-lock=(self)']) assert.ok(pp.includes(f), `Permissions-Policy: chýba ${f} (je: ${pp})`);
        // frame-ancestors sa vynucuje hneď a plná CSP beží ako Report-Only, neskôr ako vynucovaná
        const csps = [h.get('content-security-policy'), h.get('content-security-policy-report-only')].filter(Boolean).join('; ');
        assert.ok(csps, 'chýba Content-Security-Policy aj Content-Security-Policy-Report-Only');
        assert.match(csps, /frame-ancestors 'none'/);
      });
    }

    test('plná CSP na / má direktívy z auditu', () => {
      const csp = parseCsp([home.headers.get('content-security-policy-report-only'), home.headers.get('content-security-policy')]
        .filter(Boolean).join('; '));
      for (const d of ['script-src', 'style-src', 'font-src', 'img-src', 'connect-src', 'frame-src', 'worker-src', 'manifest-src', 'object-src', 'base-uri']) {
        assert.ok(csp.has(d), `CSP nemá ${d}`);
      }
      assert.deepEqual(csp.get('object-src'), ["'none'"]);
      assert.ok(csp.get('connect-src').includes(SUPABASE_ORIGIN));
    });

    test('každý inline <script> na nasadenej / má v script-src svoj sha256 hash (importmap)', () => {
      const csp = parseCsp([home.headers.get('content-security-policy-report-only'), home.headers.get('content-security-policy')]
        .filter(Boolean).join('; '));
      const allowed = csp.get('script-src') ?? [];
      const inline = [...home.text.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].filter(m => !/\bsrc\s*=/.test(m[1]));
      assert.ok(inline.length > 0, 'čakal sa aspoň importmap');
      for (const m of inline) {
        const hash = `'sha256-${createHash('sha256').update(m[2]).digest('base64')}'`;
        assert.ok(allowed.includes(hash), `script-src nemá ${hash} (nesedí hash importmapy, viď README: CSP hash)`);
      }
    });
  });

  describe('cache hlavičky', () => {
    test('/sw.js sa necachuje', async () => {
      const res = await get('/sw.js');
      await res.arrayBuffer();
      assert.match(res.headers.get('cache-control') ?? '', /no-cache|max-age=0/);
    });
    for (const path of ['/', '/index.html', '/data.js', '/assets/app.js', '/manifest.webmanifest']) {
      test(`${path}: max-age=0, must-revalidate, nikdy immutable`, async () => {
        const res = await get(path);
        await res.arrayBuffer();
        const cc = res.headers.get('cache-control') ?? '';
        assert.match(cc, /max-age=0/);
        assert.match(cc, /must-revalidate/);
        assert.doesNotMatch(cc, /immutable/);
      });
    }
  });

  describe('nič z .vercelignore nie je verejné (404)', () => {
    for (const path of ['/supabase-setup.sql', '/README.md', '/chain/', '/.env.example', '/.env', '/supabase/', '/docs/KONTRAKT-REGISTRACIA.md',
      '/scripts/dev-server.js', '/tests/smoke/deploy.test.js', '/.workflow/session.json']) {
      test(path, async () => {
        const res = await get(path);
        const body = await res.text();
        expectStatus(res, 404, path);
        assert.doesNotMatch(body, /create table|SUPABASE_SERVICE_ROLE_KEY|MINTER_PRIVATE_KEY/i, `${path} vrátilo obsah, ktorý tam nemá byť`);
      });
    }
  });

  describe('PWA', () => {
    test('manifest má id "/" a relatívny start_url a scope, ikony sú dostupné', async () => {
      const res = await get('/manifest.webmanifest');
      expectStatus(res, 200, '/manifest.webmanifest');
      const manifest = await res.json();
      assert.equal(manifest.id, '/');
      assert.equal(manifest.start_url, './');
      assert.equal(manifest.scope, './');
      for (const icon of manifest.icons) {
        const r = await get(`/${icon.src.replace(/^\.?\//, '')}`);
        await r.arrayBuffer();
        expectStatus(r, 200, icon.src);
        assert.match(r.headers.get('content-type') ?? '', /^image\//, icon.src);
      }
    });

    test('všetko, čo service worker precachuje (SHELL), je dostupné (inak sa SW neinštaluje)', async t => {
      const res = await get('/sw.js');
      const sw = await res.text();
      const shell = /const SHELL\s*=\s*\[([\s\S]*?)\]/.exec(sw);
      if (!shell) return t.skip('v sw.js som nenašiel pole SHELL');
      const files = [...shell[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
      assert.ok(files.length > 0);
      for (const f of files) {
        const path = f === './' ? '/' : `/${f.replace(/^\.?\//, '')}`;
        const r = await get(path);
        await r.arrayBuffer();
        expectStatus(r, 200, path);
      }
    });
  });

  describe('hra Ghoskate na /hra', () => {
    for (const path of ['/hra', '/hra/', '/hra/spot/5a000000-0000-4000-8000-000000000001', '/hra/profil', '/hra/crew', '/hra/rebricek', '/hra/feed', '/hra/loadout']) {
      test(`${path}: stránka webu (200, HTML)`, async () => {
        const res = await get(path);
        const body = await res.text();
        expectStatus(res, 200, path);
        assert.match(res.headers.get('content-type') ?? '', /text\/html/);
        assert.match(body, /assets\/app\.js/);
      });
    }

    test('/hra má náhľad Ghoskate a herný manifest hneď v HTML', async () => {
      const res = await get('/hra');
      const body = await res.text();
      assert.match(body, /<meta property="og:title" content="Ghoskate/);
      assert.match(body, /<link rel="manifest" href="ghoskate\.webmanifest">/);
    });

    for (const [from, to] of [['/mapa', '/hra'], ['/mapa/', '/hra'], ['/spot/abc-1', '/hra/spot/abc-1'], ['/feed', '/hra/feed'], ['/loadout', '/hra/loadout']]) {
      test(`${from} presmeruje na ${to}`, async () => {
        const res = await get(from);
        await res.arrayBuffer();
        assert.ok([301, 308].includes(res.status), `${from}: čakalo sa trvalé presmerovanie, prišlo ${res.status}${hint(res)}`);
        assert.equal(new URL(res.headers.get('location'), BASE).pathname, to);
      });
    }

    test('ghoskate.webmanifest: id, start_url a scope /hra, ikony sú dostupné', async () => {
      const res = await get('/ghoskate.webmanifest');
      expectStatus(res, 200, '/ghoskate.webmanifest');
      const m = await res.json();
      assert.equal(m.id, '/hra');
      assert.equal(m.start_url, '/hra');
      assert.equal(m.scope, '/hra');
      assert.equal(m.name, 'Ghoskate');
      for (const icon of m.icons) {
        const r = await get(`/${icon.src}`);
        await r.arrayBuffer();
        expectStatus(r, 200, icon.src);
        assert.match(r.headers.get('content-type') ?? '', /^image\/png/, icon.src);
      }
    });
  });

  describe('API', () => {
    test('cron endpoint nie je verejný: bez tajomstva nevráti 200', async t => {
      const res = await get('/api/cron/nft-retry');
      await res.arrayBuffer();
      if (res.status === 404) return t.skip('/api/cron/nft-retry na tomto nasadení ešte nie je');
      assert.ok([401, 403].includes(res.status), `bez Authorization má vrátiť 401 alebo 403, vrátilo ${res.status}${hint(res)}. Lokálne treba mať nastavené CRON_SECRET.`);
    });
  });
});

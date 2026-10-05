// Kontrola konfigurácie hostingu: vercel.json, .vercelignore a manifest.webmanifest.
// Beží bez siete. Stráži hlavne to, aby CSP hash sedel na inline importmap v index.html
// (po každej zmene importmapy treba hash prepočítať, viď README, časť Nasadenie) a aby
// .vercelignore nevylúčil nič, čo web alebo service worker potrebuje.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createIgnore, matchHeaders, matchRewrite } from '../../scripts/dev-server.js';

const ROOT = join(import.meta.dirname, '..', '..');
// CSP musí povoliť presne ten Supabase projekt, na ktorý ukazuje web (data.js CONFIG).
const { CONFIG } = await import('../../data.js');
const SUPABASE_ORIGIN = new URL(CONFIG.SUPABASE_URL).origin;
const read = f => readFileSync(join(ROOT, f), 'utf8');
const config = JSON.parse(read('vercel.json'));

/** Zlúčené hlavičky (kľúče malými písmenami) pre danú cestu, tak ako ich dá Vercel. */
const headersFor = path => Object.fromEntries(matchHeaders(config, path).map(([k, v]) => [k.toLowerCase(), v]));

/** Rozparsuje CSP na Map(directive -> [zdroje]). */
const parseCsp = value => new Map(String(value).split(';').map(s => s.trim()).filter(Boolean)
  .map(d => { const [name, ...sources] = d.split(/\s+/); return [name, sources]; }));

const cspOf = path => {
  const h = headersFor(path);
  return { reportOnly: h['content-security-policy-report-only'], enforced: h['content-security-policy'] };
};
const fullCsp = path => { const { reportOnly, enforced } = cspOf(path); return parseCsp(reportOnly ?? enforced); };

describe('vercel.json: základ', () => {
  test('statický web bez frameworku a bez buildu', () => {
    assert.equal(config.framework, null);
    assert.equal(config.outputDirectory, '.');
    assert.ok(!config.buildCommand, 'buildCommand nesmie byť nastavený');
  });

  test('cleanUrls je vypnuté (service worker precachuje index.html)', () => {
    assert.ok(!config.cleanUrls);
  });

  test('žiadne redirects', () => {
    assert.equal(config.redirects, undefined);
  });
});

/* Skutočné adresy webu (/eventy, /event/…, /checkin/<token>) vedú na index.html, router v app.js ich rozdelí.
   Súbory (assets, statické stránky pre zdieľanie) majú na Verceli prednosť pred rewrites. */
describe('vercel.json: rewrites na index.html', () => {
  const app = read('assets/app.js');
  const routes = [...app.matchAll(/^\s*\[\/\^#\\\/([a-z][\w-]*)/gm)].map(m => m[1]);

  test('všetky pravidlá idú na /index.html a sú bez has/missing', () => {
    assert.ok(config.rewrites?.length);
    for (const r of config.rewrites) { assert.equal(r.destination, '/index.html'); assert.ok(!r.has && !r.missing); }
  });

  test('každá stránka z ROUTES v assets/app.js má rewrite', () => {
    assert.ok(routes.length > 30, `našlo sa len ${routes.length} rout`);
    for (const seg of new Set(routes)) assert.equal(matchRewrite(config, `/${seg}`), '/index.html', `/${seg}`);
  });

  for (const p of ['/eventy', '/event/bratislava-2', '/jazdec/marek-kupkovic', '/checkin/0b6f2c1e-1111-4222-8333-444455556666', '/pass/abc-def',
    '/registracia/potvrdene', '/admin', '/admin/vysledky/bratislava-2', '/hra/profil', '/spot/abc', '/trik-tyzdna/', '/import-passes/eyJh']) {
    test(`app: ${p}`, () => assert.equal(matchRewrite(config, p), '/index.html'));
  }
  for (const p of ['/api/register', '/api/admin/checkin', '/assets/app.js', '/img/logo.webp', '/sw.js', '/data.js', '/chain/', '/supabase/',
    '/docs/KONTRAKT-REGISTRACIA.md', '/scripts/dev-server.js', '/hub/', '/redirect/', '/eventy.json', '/event/x.js', '/eventyx']) {
    test(`nie je app: ${p}`, () => assert.equal(matchRewrite(config, p), null));
  }
});

describe('vercel.json: cache hlavičky', () => {
  const revalidate = ['/', '/index.html', '/data.js', '/assets/app.js', '/assets/style.css', '/assets/vendor/lib.js', '/manifest.webmanifest'];
  for (const p of revalidate) {
    test(`${p}: max-age=0, must-revalidate`, () => {
      const cc = headersFor(p)['cache-control'];
      assert.match(cc, /max-age=0/);
      assert.match(cc, /must-revalidate/);
    });
  }

  test('/sw.js: no-cache', () => {
    assert.match(headersFor('/sw.js')['cache-control'], /no-cache|max-age=0/);
    assert.doesNotMatch(headersFor('/sw.js')['cache-control'], /max-age=[1-9]/);
  });

  test('/img/* a /icons/* môžu držať deň v cache', () => {
    assert.match(headersFor('/img/logo.webp')['cache-control'], /public, max-age=86400/);
    assert.match(headersFor('/icons/icon-192.png')['cache-control'], /public, max-age=86400/);
    assert.match(headersFor('/video/hero.mp4')['cache-control'], /public, max-age=86400/);
  });

  test('nikde immutable (názvy súborov nemajú hash)', () => {
    for (const rule of config.headers) {
      for (const h of rule.headers) assert.doesNotMatch(h.value, /immutable/i, `${rule.source}: ${h.key}`);
    }
  });

  test('pravidlá pre Cache-Control sa neprekrývajú (poradie pravidiel by nerozhodovalo)', () => {
    const paths = ['/', '/index.html', '/sw.js', '/data.js', '/assets/app.js', '/img/logo.webp', '/icons/icon-192.png', '/manifest.webmanifest'];
    for (const p of paths) {
      const rules = config.headers.filter(r => r.headers.some(h => h.key.toLowerCase() === 'cache-control')
        && matchHeaders({ headers: [r] }, p).length);
      assert.equal(rules.length, 1, `${p} zodpovedá ${rules.length} pravidlám s Cache-Control`);
    }
  });
});

describe('vercel.json: bezpečnostné hlavičky', () => {
  for (const p of ['/', '/index.html', '/sw.js', '/assets/app.js', '/img/logo.webp', '/api/register']) {
    test(`${p}`, () => {
      const h = headersFor(p);
      assert.equal(h['x-content-type-options'], 'nosniff');
      assert.equal(h['referrer-policy'], 'strict-origin-when-cross-origin');
      assert.equal(h['strict-transport-security'], 'max-age=63072000; includeSubDomains');
      const pp = h['permissions-policy'];
      for (const f of ['camera=(self)', 'geolocation=(self)', 'fullscreen=(self)', 'screen-wake-lock=(self)']) assert.ok(pp.includes(f), `Permissions-Policy: ${f}`);
      assert.ok(h['content-security-policy-report-only'] || h['content-security-policy'], 'CSP chýba');
    });
  }

  test('frame-ancestors \'none\' sa vynucuje hneď (aj keď je plná CSP len Report-Only)', () => {
    const { enforced } = cspOf('/');
    assert.ok(enforced, 'chýba vynucovaná CSP s frame-ancestors');
    assert.deepEqual(parseCsp(enforced).get('frame-ancestors'), ["'none'"]);
  });
});

describe('vercel.json: CSP', () => {
  const csp = fullCsp('/');
  const has = (directive, ...sources) => {
    const list = csp.get(directive);
    assert.ok(list, `chýba direktíva ${directive}`);
    for (const s of sources) assert.ok(list.includes(s), `${directive} neobsahuje ${s}: ${list.join(' ')}`);
  };

  test('plná CSP začína ako Report-Only (vynucovanie až po čistých reportoch)', () => {
    const { reportOnly } = cspOf('/');
    assert.ok(reportOnly, 'plná CSP má byť zatiaľ Content-Security-Policy-Report-Only; keď ju prepínaš na vynucovanie, uprav tento test');
  });

  test('script-src', () => {
    has('script-src', "'self'", 'https://cdn.jsdelivr.net/npm/three@0.160.0/', 'https://challenges.cloudflare.com');
    const list = csp.get('script-src');
    // celý jsdelivr by dovolil obísť CSP ľubovoľným npm balíkom (audit M3); povolený je len three
    assert.ok(!list.includes('https://cdn.jsdelivr.net'), 'script-src nesmie povoliť celý cdn.jsdelivr.net');
    assert.ok(!list.includes("'unsafe-inline'") && !list.includes("'unsafe-eval'"));
  });
  test('style-src', () => has('style-src', "'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://cdn.jsdelivr.net'));
  test('font-src', () => has('font-src', 'https://fonts.gstatic.com'));
  test('img-src', () => has('img-src', "'self'", 'data:', 'blob:', 'https://i.ytimg.com', 'https://tile.openstreetmap.org', SUPABASE_ORIGIN));
  /* úvodka a kalendár (Robova main): vlajky krajín z flagcdn.com, video na pozadí je z vlastnej domény (default-src 'self') */
  test('img-src: vlajky v kalendári (flagcdn.com)', () => has('img-src', 'https://flagcdn.com'));
  test('video na úvodke: media-src nie je nastavené, platí default-src self', () => {
    assert.ok(!csp.has('media-src'), 'media-src by prepísal default-src');
    has('default-src', "'self'");
  });
  test('connect-src', () => has('connect-src', "'self'", SUPABASE_ORIGIN, 'https://cdn.jsdelivr.net', 'https://fonts.googleapis.com', 'https://fonts.gstatic.com'));
  test('frame-src', () => has('frame-src', 'https://www.youtube-nocookie.com', 'https://challenges.cloudflare.com'));
  // herná mapa (assets/game/map.js): MapLibre GL + OpenFreeMap (štýl, dlaždice, písma a sprite z jedného hostu)
  test('herná mapa: OpenFreeMap v connect-src a img-src, worker MapLibre (self, blob:)', () => {
    has('connect-src', 'https://tiles.openfreemap.org');
    has('img-src', 'https://tiles.openfreemap.org', 'blob:');
    has('worker-src', "'self'", 'blob:');
    assert.ok(!csp.get('script-src').includes('blob:'), 'script-src nesmie povoliť blob:');
  });
  test('worker-src, manifest-src, object-src, base-uri, frame-ancestors', () => {
    has('worker-src', "'self'");
    has('manifest-src', "'self'");
    has('object-src', "'none'");
    has('base-uri', "'self'");
    has('frame-ancestors', "'none'");
  });

  test('každý inline <script> v index.html má v script-src svoj sha256 hash (importmap)', () => {
    const html = read('index.html');
    const inline = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].filter(m => !/\bsrc\s*=/.test(m[1]));
    assert.ok(inline.length > 0, 'v index.html sa čakal aspoň importmap');
    const allowed = csp.get('script-src');
    for (const m of inline) {
      const hash = `'sha256-${createHash('sha256').update(m[2]).digest('base64')}'`;
      assert.ok(allowed.includes(hash), `script-src nemá ${hash}. Prepočítaj hash podľa README (Nasadenie, CSP hash).`);
    }
  });
});

describe('vercel.json: funkcie a cron', () => {
  test('functions vzory sa neprekrývajú (Vercel inak build odmietne) a funkcie bežia vo fra1 pri Supabase', () => {
    assert.deepEqual(Object.keys(config.functions), ['api/**/*.js']);
    assert.deepEqual(config.regions, ['fra1']);
  });

  test('api/**/*.js má nastavený maxDuration a žiadne `runtime` (verzia Node sa berie z package.json engines)', () => {
    const fn = config.functions?.['api/**/*.js'];
    assert.ok(fn, 'chýba functions["api/**/*.js"]');
    assert.ok(Number.isInteger(fn.maxDuration) && fn.maxDuration > 0);
    for (const [pattern, cfg] of Object.entries(config.functions)) assert.equal(cfg.runtime, undefined, `${pattern}: runtime v vercel.json vyžaduje balík s verziou, nie nodejs22.x`);
  });

  test('package.json má engines.node na 22', () => {
    const engines = JSON.parse(read('package.json')).engines?.node;
    assert.match(engines ?? '', /22|>=\s*22/);
  });

  test('cron: nft-retry s platným päťpoľovým výrazom', () => {
    const cron = config.crons?.find(c => c.path === '/api/cron/nft-retry');
    assert.ok(cron, 'chýba cron /api/cron/nft-retry');
    assert.equal(cron.schedule.trim().split(/\s+/).length, 5);
  });

  test('cron ukazuje na existujúci handler (kontroluje sa, keď už existuje api/cron/)', t => {
    if (!existsSync(join(ROOT, 'api', 'cron'))) return t.skip('api/cron/ ešte nie je');
    for (const c of config.crons ?? []) {
      const base = join(ROOT, c.path.replace(/^\//, ''));
      assert.ok(['.js', '.mjs', '.cjs'].some(e => existsSync(base + e)) || existsSync(join(base, 'index.js')), `${c.path} nemá handler`);
    }
  });
});

describe('.vercelignore', () => {
  const ignores = createIgnore(read('.vercelignore'));

  for (const p of ['README.md', 'supabase/migrations/001_hardening.sql', 'supabase/migrations/014_main_sync.sql', 'supabase-setup.sql', 'supabase-seed-events.sql', 'tests/unit/ranking.test.js', 'chain/contracts/GoskoPass.sol',
    'scripts/dev-server.js', 'docs/KONTRAKT-REGISTRACIA.md', '.workflow/session.json', 'redirect/index.html', '.env', '.env.example', '.env.local',
    'zakladatelia.csv', 'Downloads/GOSko registrácie.xlsx', 'export.tsv']) {
    test(`vylúčené: ${p}`, () => assert.equal(ignores(p), true));
  }

  for (const p of ['index.html', 'sw.js', 'data.js', 'manifest.webmanifest', 'assets/app.js', 'assets/style.css', 'img/logo.webp', 'icons/icon-192.png',
    'video/hero.mp4', 'video/hero.webm', 'img/hero-poster.jpg', 'img/ghost.svg',
    'vercel.json', 'package.json', 'package-lock.json', 'api/register.js', 'api/_lib/db.js', 'api/nft/metadata/[id].js']) {
    test(`nevylúčené: ${p}`, () => assert.equal(ignores(p), false));
  }

  test('nič z precache zoznamu service workera ani z index.html nie je vylúčené a všetko existuje', () => {
    const sw = read('sw.js');
    const shell = /const SHELL\s*=\s*\[([\s\S]*?)\]/.exec(sw);
    const files = shell ? [...shell[1].matchAll(/'([^']+)'/g)].map(m => m[1]) : [];
    const html = read('index.html');
    const refs = [...html.matchAll(/\b(?:src|href)="([^"#]+)"/g)].map(m => m[1]).filter(r => !/^(?:[a-z]+:|\/\/)/i.test(r));
    for (const f of [...new Set([...files, ...refs])]) {
      const rel = f.replace(/^\.\//, '');
      if (rel === '' || rel === './') continue;
      assert.equal(ignores(rel), false, `.vercelignore vylučuje ${rel}`);
      // odkaz na stránku webu (napr. profil, eventy) nie je súbor: rieši ho rewrite na index.html
      assert.ok(existsSync(join(ROOT, rel)) || matchRewrite(config, `/${rel}`) === '/index.html', `chýba súbor ${rel}`);
    }
  });
});

describe('manifest.webmanifest', () => {
  const manifest = JSON.parse(read('manifest.webmanifest'));
  test('id je "/", start_url a scope zostávajú relatívne', () => {
    assert.equal(manifest.id, '/');
    assert.equal(manifest.start_url, './');
    assert.equal(manifest.scope, './');
  });
  test('ikony existujú', () => {
    for (const icon of manifest.icons) assert.ok(existsSync(join(ROOT, icon.src)), icon.src);
  });
});

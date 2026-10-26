// Test lokálneho dev servera (scripts/dev-server.js): statika, hlavičky z vercel.json,
// .vercelignore a Vercel-like routovanie /api/* (vrátane [id] segmentov).
// Beží proti dočasnému fixture priečinku, bez siete mimo localhostu.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import http from 'node:http';
import { pathToFileURL } from 'node:url';

const DEV = pathToFileURL(join(import.meta.dirname, '..', '..', 'scripts', 'dev-server.js')).href;
const {
  createDevServer, createIgnore, sourceToRegExp, matchHeaders, matchRewrite, matchRedirect, parseEnv, resolveApiRoute,
} = await import(DEV);

// ---------- čisté funkcie ----------

describe('sourceToRegExp (zdroje z vercel.json headers)', () => {
  const m = (src, path) => sourceToRegExp(src).test(path);

  test('presná cesta, bodka je doslovná', () => {
    assert.ok(m('/sw.js', '/sw.js'));
    assert.ok(!m('/sw.js', '/swXjs'));
    assert.ok(!m('/sw.js', '/sw.js/x'));
    assert.ok(!m('/sw.js', '/assets/sw.js'));
  });
  test('/ je iba koreň', () => {
    assert.ok(m('/', '/'));
    assert.ok(!m('/', '/index.html'));
  });
  test('/(.*) je všetko vrátane koreňa', () => {
    assert.ok(m('/(.*)', '/'));
    assert.ok(m('/(.*)', '/a/b/c.js'));
  });
  test('/assets/(.*) je len priečinok assets', () => {
    assert.ok(m('/assets/(.*)', '/assets/app.js'));
    assert.ok(m('/assets/(.*)', '/assets/vendor/x.js'));
    assert.ok(!m('/assets/(.*)', '/img/assets/app.js'));
    assert.ok(!m('/assets/(.*)', '/assetsX/app.js'));
  });
  test('pomenované parametre', () => {
    assert.ok(m('/api/nft/:id', '/api/nft/12'));
    assert.ok(!m('/api/nft/:id', '/api/nft/12/x'));
    assert.ok(m('/docs/:path*', '/docs'));
    assert.ok(m('/docs/:path*', '/docs/a/b'));
    assert.ok(!m('/docs/:path+', '/docs'));
    assert.ok(m('/docs/:path+', '/docs/a'));
  });
});

describe('matchHeaders', () => {
  const config = {
    headers: [
      { source: '/(.*)', headers: [{ key: 'X-A', value: '1' }, { key: 'Cache-Control', value: 'one' }] },
      { source: '/sw.js', headers: [{ key: 'cache-control', value: 'two' }] },
      { source: '/x', has: [{ type: 'header', key: 'x' }], headers: [{ key: 'X-Cond', value: 'y' }] },
    ],
  };
  test('spojí zhodné pravidlá, neskoršie prepíše skoršie (bez ohľadu na veľkosť písmen)', () => {
    const h = Object.fromEntries(matchHeaders(config, '/sw.js').map(([k, v]) => [k.toLowerCase(), v]));
    assert.equal(h['x-a'], '1');
    assert.equal(h['cache-control'], 'two');
  });
  test('nezhodné pravidlá sa nepoužijú, pravidlá s has/missing sa ignorujú', () => {
    const h = Object.fromEntries(matchHeaders(config, '/x'));
    assert.equal(h['X-A'], '1');
    assert.equal(h['X-Cond'], undefined);
  });
  test('bez konfigurácie nič', () => {
    assert.deepEqual(matchHeaders(null, '/'), []);
    assert.deepEqual(matchHeaders({}, '/'), []);
  });
});

describe('createIgnore (.vercelignore, syntax ako .gitignore)', () => {
  const ign = createIgnore(`
# komentár
README.md
/supabase/
supabase-setup.sql
tests/
*.sql
!keep.sql
.env*
/docs
`);
  test('súbor v koreni', () => {
    assert.equal(ign('README.md'), true);
    assert.equal(ign('supabase-setup.sql'), true);
    assert.equal(ign('index.html'), false);
  });
  test('názov bez lomky platí v každej hĺbke', () => {
    assert.equal(ign('assets/README.md'), true);
  });
  test('priečinok vylúči všetko pod ním', () => {
    assert.equal(ign('supabase/migrations/001.sql'), true);
    assert.equal(ign('supabase', true), true);
    assert.equal(ign('tests/unit/a.test.js'), true);
    assert.equal(ign('docs/KONTRAKT.md'), true);
  });
  test('/dir zakotvené v koreni, nie hlbšie', () => {
    assert.equal(ign('assets/docs/x.md'), false);
    assert.equal(ign('assets/supabase/x.js'), false);
  });
  test('wildcard a negácia', () => {
    assert.equal(ign('db/schema.sql'), true);
    assert.equal(ign('keep.sql'), false);
    assert.equal(ign('.env'), true);
    assert.equal(ign('.env.example'), true);
    assert.equal(ign('.env.local'), true);
  });
  test('prázdny zoznam nič nevylúči', () => {
    assert.equal(createIgnore('')('anything.txt'), false);
  });
});

describe('parseEnv', () => {
  test('KEY=VALUE, úvodzovky, komentáre, export, prázdne hodnoty', () => {
    const env = parseEnv(`
# komentár
A=1
B = "dva s medzerou"
C='tri'
export D=štyri
E=
F=x # komentár na konci
G="a#b"
H=a=b
not a line
`);
    assert.deepEqual(env, { A: '1', B: 'dva s medzerou', C: 'tri', D: 'štyri', E: '', F: 'x', G: 'a#b', H: 'a=b' });
  });
  test('\\n v úvodzovkách sa rozvinie (viacriadkové kľúče)', () => {
    assert.equal(parseEnv('K="a\\nb"').K, 'a\nb');
  });
});

// ---------- fixture ----------

let root, dev, base;
const NAME = 'GOSKO_DEVTEST_FOO';

function put(rel, content) {
  const f = join(root, rel);
  mkdirSync(dirname(f), { recursive: true });
  writeFileSync(f, content);
}

function raw(path, { method = 'GET', headers = {}, body } = {}) {
  const u = new URL(base);
  return new Promise((resolve, reject) => {
    const req = http.request({ host: u.hostname, port: u.port, path, method, headers }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

const j = async res => ({ status: res.status, headers: res.headers, json: await res.json() });

before(async () => {
  root = mkdtempSync(join(tmpdir(), 'gosko-dev-'));
  put('package.json', '{"type":"module"}');
  put('vercel.json', JSON.stringify({
    headers: [
      { source: '/(.*)', headers: [{ key: 'X-Content-Type-Options', value: 'nosniff' }, { key: 'X-Test-All', value: '1' }] },
      { source: '/', headers: [{ key: 'X-Root', value: '1' }] },
      { source: '/sw.js', headers: [{ key: 'Cache-Control', value: 'no-cache' }] },
      { source: '/assets/(.*)', headers: [{ key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' }] },
    ],
    rewrites: [{ source: '/((?:eventy|event|hidden)(?:/[^.]*)?)', destination: '/index.html' }],
    redirects: [
      { source: '/stara', destination: '/nova', permanent: true },
      { source: '/stary-spot/:id', destination: '/nova/spot/:id', permanent: true },
      { source: '/docasna', destination: '/nova', permanent: false },
      { source: '/event/zdielany', destination: '/nova' },
    ],
  }));
  put('.vercelignore', 'secret.txt\n/hidden/\n*.sql\n!keep.sql\n.env*\n');
  put('index.html', '<!doctype html><title>fixture</title>');
  put('sw.js', 'self.VERSION=1');
  put('data.js', 'export const A = 1;');
  put('assets/app.js', 'export const x = 1;');
  put('assets/sub/y.js', 'export const y = 1;');
  put('assets/style.css', 'body{}');
  put('manifest.webmanifest', '{}');
  put('img/a.webp', 'RIFFxxxxWEBP');
  put('secret.txt', 'tajne');
  put('hidden/a.txt', 'tajne');
  put('schema.sql', 'select 1');
  put('keep.sql', 'select 2');
  put('.env.local', `${NAME}=z-env-suboru\nQUOTED="a b"\n`);
  put('.env.example', 'X=');
  put('other.txt', 'plain');
  put('docs/readme.md', 'dokumentacia');
  put('event/zdielany/index.html', '<!doctype html><title>stranka pre zdielanie</title>');

  put('api/hello.js', `export default (req, res) => res.status(200).json({ ok: true, method: req.method, query: req.query });`);
  put('api/echo.js', `export default (req, res) => res.status(201).json({ body: req.body, type: typeof req.body, ct: req.headers['content-type'] ?? null });`);
  put('api/items/[id].js', `export default (req, res) => res.json({ route: 'dyn', id: req.query.id, query: req.query });`);
  put('api/items/new.js', `export default (req, res) => res.json({ route: 'static-new' });`);
  put('api/nft/metadata/[id].js', `export default (req, res) => res.json({ name: 'meta ' + req.query.id });`);
  put('api/nft/image/[id].js', `export default (req, res) => { res.setHeader('Content-Type', 'image/svg+xml'); res.setHeader('Cache-Control', 'public, s-maxage=60'); res.status(200).send('<svg id="' + req.query.id + '"/>'); };`);
  put('api/cron/run.js', `export default (req, res) => res.json({ auth: req.headers.authorization ?? null });`);
  put('api/redir.js', `export default (req, res) => res.redirect(req.query.code ? Number(req.query.code) : undefined, 'https://example.com/x');`);
  put('api/boom.js', `export default () => { throw new Error('bum'); };`);
  put('api/boom-async.js', `export default async () => { await null; throw new Error('bum async'); };`);
  put('api/env.js', `export default (req, res) => res.json({ v: process.env.${NAME}, q: process.env.QUOTED });`);
  put('api/files/[...rest].js', `export default (req, res) => res.json({ rest: req.query.rest });`);
  put('api/nested/index.js', `export default (req, res) => res.json({ route: 'nested-index' });`);
  put('api/_lib/helper.js', `export default (req, res) => res.json({ leaked: true });`);
  put('api/text.js', `export default (req, res) => res.status(202).send('ahoj');`);
  put('api/buf.js', `export default (req, res) => res.send(Buffer.from([1,2,3]));`);
  put('api/cookie.js', `export default (req, res) => res.json({ cookies: req.cookies });`);
  put('api/plain-end.js', `export default (req, res) => { res.statusCode = 204; res.end(); };`);

  delete process.env[NAME];
  delete process.env.QUOTED;
  dev = createDevServer({ root, log: () => {} });
  const { port } = await dev.listen(0, '127.0.0.1');
  base = `http://127.0.0.1:${port}`;
});

after(async () => {
  await dev?.close();
  if (root) rmSync(root, { recursive: true, force: true });
  delete process.env[NAME];
  delete process.env.QUOTED;
});

// ---------- statika a hlavičky ----------

describe('statické súbory', () => {
  test('/ vráti index.html s hlavičkami z vercel.json (aj pravidlo len pre koreň)', async () => {
    const res = await fetch(base + '/');
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /^text\/html/);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(res.headers.get('x-root'), '1');
    assert.equal(res.headers.get('x-test-all'), '1');
    assert.match(await res.text(), /fixture/);
  });

  test('/index.html je dostupné priamo (bez cleanUrls) a nemá hlavičku určenú iba koreňu', async () => {
    const res = await fetch(base + '/index.html');
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('x-root'), null);
    assert.equal(res.headers.get('x-test-all'), '1');
  });

  test('/sw.js dostane no-cache, /assets/* must-revalidate', async () => {
    const sw = await fetch(base + '/sw.js');
    assert.equal(sw.status, 200);
    assert.equal(sw.headers.get('cache-control'), 'no-cache');
    assert.match(sw.headers.get('content-type'), /javascript/);
    const app = await fetch(base + '/assets/app.js');
    assert.equal(app.status, 200);
    assert.equal(app.headers.get('cache-control'), 'public, max-age=0, must-revalidate');
    assert.match(app.headers.get('content-type'), /javascript/);
    const deep = await fetch(base + '/assets/sub/y.js');
    assert.equal(deep.headers.get('cache-control'), 'public, max-age=0, must-revalidate');
    const other = await fetch(base + '/other.txt');
    assert.equal(other.headers.get('cache-control') === 'no-cache', false);
  });

  test('content-type: css, manifest, webp', async () => {
    assert.match((await fetch(base + '/assets/style.css')).headers.get('content-type'), /^text\/css/);
    assert.match((await fetch(base + '/manifest.webmanifest')).headers.get('content-type'), /manifest\+json|application\/json/);
    assert.equal((await fetch(base + '/img/a.webp')).headers.get('content-type'), 'image/webp');
  });

  test('ETag a 304 pri If-None-Match', async () => {
    const first = await fetch(base + '/data.js');
    const etag = first.headers.get('etag');
    assert.ok(etag);
    const again = await fetch(base + '/data.js', { headers: { 'If-None-Match': etag } });
    assert.equal(again.status, 304);
    assert.equal(again.headers.get('x-content-type-options'), 'nosniff');
  });

  test('HEAD vráti hlavičky bez tela', async () => {
    const res = await raw('/', { method: 'HEAD' });
    assert.equal(res.status, 200);
    assert.equal(res.body, '');
    assert.ok(Number(res.headers['content-length']) > 0);
  });

  test('POST na statický súbor je 405', async () => {
    const res = await fetch(base + '/other.txt', { method: 'POST' });
    assert.equal(res.status, 405);
  });

  test('neexistujúci súbor je 404, hlavičky z vercel.json sa aplikujú aj na 404', async () => {
    const res = await fetch(base + '/neexistuje.js');
    assert.equal(res.status, 404);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  });
});

describe('rewrites (skutočné adresy webu)', () => {
  test('matchRewrite: prvé zhodné pravidlo, has/missing sa preskočí', () => {
    const cfg = { rewrites: [{ source: '/x', has: [{ type: 'header', key: 'a' }], destination: '/no' }, { source: '/x', destination: '/yes' }] };
    assert.equal(matchRewrite(cfg, '/x'), '/yes');
    assert.equal(matchRewrite(cfg, '/y'), null);
    assert.equal(matchRewrite(null, '/x'), null);
  });

  test('cesta bez súboru ide na index.html s hlavičkami pôvodnej cesty', async () => {
    for (const p of ['/eventy', '/eventy/', '/event/bratislava-2', '/event/a/b']) {
      const res = await fetch(base + p);
      assert.equal(res.status, 200, p);
      assert.match(await res.text(), /<title>fixture<\/title>/, p);
      assert.equal(res.headers.get('x-test-all'), '1');
    }
  });

  test('existujúci súbor má prednosť pred rewrite', async () => {
    const res = await fetch(base + '/event/zdielany/');
    assert.match(await res.text(), /stranka pre zdielanie/);
  });

  test('súbory, /api a cesty mimo pravidiel ostávajú 404; .vercelignore má prednosť', async () => {
    for (const p of ['/event/x.js', '/eventyx', '/api/neexistuje', '/hidden/a.txt']) assert.equal((await fetch(base + p)).status, 404, p);
  });
});

describe('redirects (staré adresy)', () => {
  test('matchRedirect: parametre :id sa dosadia, predvolene a permanent 308, permanent: false 307', () => {
    const cfg = { redirects: [{ source: '/a/:id', destination: '/b/:id', permanent: true }, { source: '/c', destination: '/d' }, { source: '/e', destination: '/f', permanent: false }, { source: '/x', has: [{ type: 'host', value: 'y' }], destination: '/z' }] };
    assert.deepEqual(matchRedirect(cfg, '/a/abc-1'), { location: '/b/abc-1', status: 308 });
    assert.deepEqual(matchRedirect(cfg, '/c'), { location: '/d', status: 308 });
    assert.deepEqual(matchRedirect(cfg, '/e'), { location: '/f', status: 307 });
    assert.equal(matchRedirect(cfg, '/x'), null);
    assert.equal(matchRedirect(cfg, '/a'), null);
    assert.equal(matchRedirect(null, '/c'), null);
  });

  test('presmerovanie má prednosť pred súbormi aj rewrites a zachová query', async () => {
    const get = p => fetch(base + p, { redirect: 'manual' });
    let res = await get('/stara');
    assert.equal(res.status, 308);
    assert.equal(res.headers.get('location'), '/nova');
    res = await get('/stary-spot/5a-1?x=1');
    assert.equal(res.status, 308);
    assert.equal(res.headers.get('location'), '/nova/spot/5a-1?x=1');
    res = await get('/docasna');
    assert.equal(res.status, 307);
    res = await get('/event/zdielany');
    assert.equal(res.status, 308, 'Vercel uplatní redirects pred súbormi');
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff', 'hlavičky z headers platia aj pre presmerovanie');
  });
});

describe('.vercelignore', () => {
  for (const p of ['/secret.txt', '/hidden/a.txt', '/hidden/', '/hidden', '/schema.sql', '/.env.local', '/.env.example']) {
    test(`${p} sa neservíruje (404)`, async () => {
      assert.equal((await fetch(base + p)).status, 404);
    });
  }
  test('negácia: /keep.sql sa servíruje', async () => {
    assert.equal((await fetch(base + '/keep.sql')).status, 200);
  });
  test('/docs/readme.md sa servíruje, keď ho .vercelignore nevylučuje', async () => {
    assert.equal((await fetch(base + '/docs/readme.md')).status, 200);
  });
  test('zdrojáky v api/ sa neservíruju ako statika', async () => {
    assert.equal((await fetch(base + '/api/hello.js')).headers.get('content-type')?.includes('javascript'), false);
    assert.equal((await fetch(base + '/package.json')).status, 404);
  });
  test('vstavané ochrany bez .vercelignore: .git, node_modules, .env*', async () => {
    const bare = mkdtempSync(join(tmpdir(), 'gosko-dev-bare-'));
    try {
      mkdirSync(join(bare, '.git'), { recursive: true });
      mkdirSync(join(bare, 'node_modules/x'), { recursive: true });
      writeFileSync(join(bare, '.git/config'), 'x');
      writeFileSync(join(bare, 'node_modules/x/i.js'), 'x');
      writeFileSync(join(bare, '.env'), 'S=1');
      writeFileSync(join(bare, 'ok.txt'), 'ok');
      const d2 = createDevServer({ root: bare, log: () => {} });
      const { port } = await d2.listen(0, '127.0.0.1');
      try {
        for (const p of ['/.git/config', '/node_modules/x/i.js', '/.env']) {
          assert.equal((await fetch(`http://127.0.0.1:${port}${p}`)).status, 404, p);
        }
        assert.equal((await fetch(`http://127.0.0.1:${port}/ok.txt`)).status, 200);
      } finally { await d2.close(); }
    } finally { rmSync(bare, { recursive: true, force: true }); }
  });
});

describe('bezpečnosť ciest', () => {
  for (const p of ['/%2e%2e/%2e%2e/etc/passwd', '/assets/..%2f..%2fpackage.json', '/..%2f..%2fetc%2fpasswd', '/assets/%2e%2e/%2e%2e/secret.txt', '/%00', '/assets/%00.js']) {
    test(`${p} nikdy nevráti 200`, async () => {
      const res = await raw(p);
      assert.ok([400, 403, 404].includes(res.status), `status ${res.status}`);
    });
  }
  test('neplatné percent kódovanie je 400', async () => {
    assert.equal((await raw('/%E0%A4%A')).status, 400);
  });
});

// ---------- /api ----------

describe('routovanie /api', () => {
  test('res.status().json() a req.query (opakovaný kľúč je pole)', async () => {
    const r = await j(await fetch(base + '/api/hello?x=1&x=2&y=3'));
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-type'), /^application\/json/);
    assert.deepEqual(r.json, { ok: true, method: 'GET', query: { x: ['1', '2'], y: '3' } });
  });

  test('hlavičky z vercel.json sa aplikujú aj na /api odpovede', async () => {
    const res = await fetch(base + '/api/hello');
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  });

  test('dynamický segment [id] sa mapuje na req.query.id', async () => {
    const r = await j(await fetch(base + '/api/items/42?foo=bar'));
    assert.deepEqual(r.json, { route: 'dyn', id: '42', query: { foo: 'bar', id: '42' } });
  });

  test('parameter cesty prepíše rovnomenný query parameter', async () => {
    const r = await j(await fetch(base + '/api/items/42?id=zly'));
    assert.equal(r.json.id, '42');
  });

  test('statický súbor má prednosť pred [id]', async () => {
    const r = await j(await fetch(base + '/api/items/new'));
    assert.equal(r.json.route, 'static-new');
  });

  test('vnorené dynamické cesty: nft/metadata/[id] a nft/image/[id]', async () => {
    assert.deepEqual((await j(await fetch(base + '/api/nft/metadata/12'))).json, { name: 'meta 12' });
    const img = await fetch(base + '/api/nft/image/12');
    assert.equal(img.status, 200);
    assert.equal(img.headers.get('content-type'), 'image/svg+xml');
    assert.equal(await img.text(), '<svg id="12"/>');
  });

  test('hlavička nastavená handlerom sa zachová spolu s hlavičkami z vercel.json', async () => {
    const res = await fetch(base + '/api/nft/image/1');
    assert.equal(res.headers.get('cache-control'), 'public, s-maxage=60');
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  });

  test('catch-all [...rest]', async () => {
    const r = await j(await fetch(base + '/api/files/a/b/c'));
    assert.deepEqual(r.json.rest, ['a', 'b', 'c']);
  });

  test('index.js v priečinku', async () => {
    assert.equal((await j(await fetch(base + '/api/nested'))).json.route, 'nested-index');
    assert.equal((await j(await fetch(base + '/api/nested/'))).json.route, 'nested-index');
  });

  test('koncová lomka: /api/hello/ funguje', async () => {
    assert.equal((await fetch(base + '/api/hello/')).status, 200);
  });

  test('POST s JSON telom: req.body je objekt', async () => {
    const res = await fetch(base + '/api/echo', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ a: 1, b: ['x'] }) });
    const r = await j(res);
    assert.equal(r.status, 201);
    assert.deepEqual(r.json.body, { a: 1, b: ['x'] });
    assert.equal(r.json.type, 'object');
  });

  test('JSON s charsetom a prázdne JSON telo ({})', async () => {
    const a = await j(await fetch(base + '/api/echo', { method: 'POST', headers: { 'content-type': 'application/json; charset=utf-8' }, body: '{"k":"š"}' }));
    assert.deepEqual(a.json.body, { k: 'š' });
    const b = await j(await fetch(base + '/api/echo', { method: 'POST', headers: { 'content-type': 'application/json' } }));
    assert.deepEqual(b.json.body, {});
  });

  test('neplatný JSON je 400', async () => {
    const res = await fetch(base + '/api/echo', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{nie json' });
    assert.equal(res.status, 400);
  });

  test('x-www-form-urlencoded a text/plain', async () => {
    const f = await j(await fetch(base + '/api/echo', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'a=1&b=dva' }));
    assert.deepEqual(f.json.body, { a: '1', b: 'dva' });
    const t = await j(await fetch(base + '/api/echo', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: 'surový text' }));
    assert.equal(t.json.body, 'surový text');
  });

  test('GET nemá body', async () => {
    const r = await j(await fetch(base + '/api/hello'));
    assert.equal(r.status, 200);
  });

  test('res.send: reťazec je text/html, Buffer je octet-stream, res.end funguje', async () => {
    const t = await fetch(base + '/api/text');
    assert.equal(t.status, 202);
    assert.match(t.headers.get('content-type'), /^text\/html/);
    assert.equal(await t.text(), 'ahoj');
    const b = await fetch(base + '/api/buf');
    assert.equal(b.headers.get('content-type'), 'application/octet-stream');
    assert.deepEqual([...new Uint8Array(await b.arrayBuffer())], [1, 2, 3]);
    assert.equal((await fetch(base + '/api/plain-end')).status, 204);
  });

  test('res.redirect: default 307, voliteľný status', async () => {
    const a = await fetch(base + '/api/redir', { redirect: 'manual' });
    assert.equal(a.status, 307);
    assert.equal(a.headers.get('location'), 'https://example.com/x');
    const b = await fetch(base + '/api/redir?code=302', { redirect: 'manual' });
    assert.equal(b.status, 302);
  });

  test('req.cookies a hlavička Authorization sa prenášajú', async () => {
    const c = await j(await fetch(base + '/api/cookie', { headers: { cookie: 'a=1; b=dva' } }));
    assert.deepEqual(c.json.cookies, { a: '1', b: 'dva' });
    const r = await j(await fetch(base + '/api/cron/run', { headers: { authorization: 'Bearer abc' } }));
    assert.equal(r.json.auth, 'Bearer abc');
  });

  test('handler, ktorý vyhodí chybu (sync aj async), dá 500 a server beží ďalej', async () => {
    assert.equal((await fetch(base + '/api/boom')).status, 500);
    assert.equal((await fetch(base + '/api/boom-async')).status, 500);
    assert.equal((await fetch(base + '/api/hello')).status, 200);
  });

  test('neexistujúca funkcia a súkromné _lib sú 404', async () => {
    assert.equal((await fetch(base + '/api/neexistuje')).status, 404);
    assert.equal((await fetch(base + '/api/_lib/helper')).status, 404);
    assert.equal((await fetch(base + '/api/_lib/helper.js')).status, 404);
    assert.equal((await fetch(base + '/api')).status, 404);
  });

  test('.env.local sa načíta pred spustením funkcií (existujúce premenné sa neprepíšu)', async () => {
    const r = await j(await fetch(base + '/api/env'));
    assert.equal(r.json.v, 'z-env-suboru');
    assert.equal(r.json.q, 'a b');
  });

  test('zmena súboru handlera sa prejaví bez reštartu', async () => {
    put('api/live.js', `export default (req, res) => res.json({ v: 1 });`);
    assert.equal((await j(await fetch(base + '/api/live'))).json.v, 1);
    await new Promise(r => setTimeout(r, 20));
    put('api/live.js', `export default (req, res) => res.json({ v: 2, pad: '${'x'.repeat(10)}' });`);
    assert.equal((await j(await fetch(base + '/api/live'))).json.v, 2);
  });
});

describe('resolveApiRoute', () => {
  test('vráti súbor a parametre', async () => {
    const r = await resolveApiRoute(root, '/api/nft/metadata/7');
    assert.ok(r.file.endsWith(join('api', 'nft', 'metadata', '[id].js')));
    assert.deepEqual(r.params, { id: '7' });
  });
  test('null pre neznámu cestu', async () => {
    assert.equal(await resolveApiRoute(root, '/api/nic/tu'), null);
  });
});

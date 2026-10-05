// Lokálny end-to-end beh v prehliadači: web + Vercel Functions cez scripts/dev-server.js,
// lokálny PostgREST (tests/helpers/stack.js), hardhat uzol s GoskoPass (chain/scripts/deploy-local.ts)
// a headless Chromium (Playwright).
//
//   npm run test:e2e
//
// Tok: registrácia dospelého -> pass · registrácia U16 -> stránka rodiča (GET) -> potvrdenie (POST)
// · admin check-in -> mint na lokálnom chaine -> metadáta bez osobných údajov · uloženie výsledkov
// -> rebríček · prázdne výsledky zmažú kategóriu a vynulujú výsledok na chaine.
//
// Prostredie dev servera sa posiela cez env (rovnaký účinok ako .env.local, ale nezostane súbor).
// GoTrue lokálne nebeží: malá brána na porte GATE_PORT robí /auth/v1/user (overí HS256 JWT testovacím
// tajomstvom PostgRESTu) a /rest/v1/* posiela na PostgREST, aby supabase-js v prehliadači fungoval ako
// proti Supabase. Prehliadač nesmie nikam mimo localhost: požiadavky na *.supabase.co a iné hosty
// sa zablokujú a test ich vypíše.
//
// Playwright nie je závislosť projektu: PLAYWRIGHT_MODULE=/cesta/k/node_modules/playwright
// (alebo nainštalovaný `playwright`). Bez neho, bez hardhatu alebo s obsadeným portom 8545 sa test preskočí.
// Na produkčný Supabase ani verejný chain sa nikdy nepripája.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createPublicClient, http as viemHttp } from 'viem';
import { hardhat } from 'viem/chains';

import * as stack from '../helpers/stack.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const HARDHAT_BIN = `${ROOT}chain/node_modules/.bin/hardhat`;
const DEPLOYMENT = `${ROOT}chain/deployments/local.json`;
const WEB_PORT = Number(process.env.GOSKO_E2E_PORT || 3010);
const GATE_PORT = 3902;
const WEB = `http://127.0.0.1:${WEB_PORT}`;
const GATE = `http://127.0.0.1:${GATE_PORT}`;
const RPC = 'http://127.0.0.1:8545';   // deploy-local.ts má sieť natvrdo localhost:8545
const EVENT = 'bratislava-2';          // seed: open, registration_open; v data.js status next + registration
// Predvolené testovacie účty hardhat uzla (verejne známe, nikdy nie na reálnej sieti).
const KEY_MINTER = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';
const CUSTODY = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';
const ARTIFACT = `${ROOT}chain/artifacts/contracts/GoskoPass.sol/GoskoPass.json`;
const passOf = async tokenId => {
  const pc = createPublicClient({ chain: hardhat, transport: viemHttp(RPC) });
  const p = await pc.readContract({ address: S.contract, abi: JSON.parse(readFileSync(ARTIFACT, 'utf8')).abi, functionName: 'passOf', args: [BigInt(tokenId)] });
  return [Number(p.placement), Number(p.points)];
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function loadPlaywright() {
  const spec = process.env.PLAYWRIGHT_MODULE;
  try {
    if (spec) return createRequire(pathToFileURL(`${spec.replace(/\/+$/, '')}/package.json`))('./index.js');
    return await import('playwright');
  } catch { return null; }
}

async function rpcUp() {
  try {
    const r = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}', signal: AbortSignal.timeout(500) });
    return (await r.json()).result;
  } catch { return null; }
}

const pw = await loadPlaywright();
const skip = !pw ? 'Playwright chýba (nastav PLAYWRIGHT_MODULE)'
  : !existsSync(HARDHAT_BIN) ? 'chain/node_modules chýba (cd chain && npm install)'
  : (await rpcUp()) ? 'port 8545 už obsadil iný uzol (zastav `npx hardhat node`)'
  : false;

const S = { blocked: [], pageErrors: [], children: [] };

// ---------------------------------------------------------------- pomocné servery a procesy

function verifyJwt(token) {
  const [h, p, sig] = String(token).split('.');
  if (!sig) return null;
  const want = createHmac('sha256', stack.JWT_SECRET).update(`${h}.${p}`).digest();
  const got = Buffer.from(sig, 'base64url');
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  const claims = JSON.parse(Buffer.from(p, 'base64url').toString());
  return claims.exp > Date.now() / 1000 ? claims : null;
}

/** Napodobenina Supabase pre prehliadač aj API: /auth/v1/user a /rest/v1/* -> PostgREST. */
function startGate() {
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS', 'access-control-expose-headers': 'content-range' };
  const server = http.createServer(async (req, res) => {
    if (req.method === 'OPTIONS') { res.writeHead(204, cors).end(); return; }
    const url = new URL(req.url, GATE);
    if (url.pathname === '/auth/v1/user') {
      const claims = verifyJwt((req.headers.authorization || '').replace(/^Bearer /, ''));
      if (!claims?.sub) { res.writeHead(401, { ...cors, 'content-type': 'application/json' }).end('{"msg":"invalid JWT"}'); return; }
      res.writeHead(200, { ...cors, 'content-type': 'application/json' }).end(JSON.stringify({ id: claims.sub, aud: 'authenticated', role: claims.role, email: 'admin@test.local' }));
      return;
    }
    if (!url.pathname.startsWith('/rest/v1/')) { res.writeHead(404, cors).end(); return; }
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const headers = {};
    for (const k of ['authorization', 'content-type', 'accept', 'prefer', 'range', 'accept-profile', 'content-profile']) if (req.headers[k]) headers[k] = req.headers[k];
    const up = await fetch(`${stack.REST_URL}${url.pathname.slice('/rest/v1'.length)}${url.search}`, { method: req.method, headers, body: chunks.length ? Buffer.concat(chunks) : undefined });
    const out = { ...cors };
    for (const k of ['content-type', 'content-range', 'preference-applied']) if (up.headers.get(k)) out[k] = up.headers.get(k);
    res.writeHead(up.status, out).end(Buffer.from(await up.arrayBuffer()));
  });
  return new Promise(ok => server.listen(GATE_PORT, '127.0.0.1', () => ok(server)));
}

function spawnLogged(cmd, args, opts) {
  const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], detached: true, ...opts });
  child.log = '';
  child.stdout.on('data', d => { child.log = (child.log + d).slice(-6000); });
  child.stderr.on('data', d => { child.log = (child.log + d).slice(-6000); });
  S.children.push(child);
  return child;
}

async function waitFor(fn, what, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await fn()) return;
    await sleep(250);
  }
  throw new Error(`${what}: nedočkal som sa`);
}

/** data.js pre prehliadač: Supabase = lokálna brána, anon JWT, adresa kontraktu z lokálneho deployu. */
function patchedDataJs() {
  const src = readFileSync(`${ROOT}data.js`, 'utf8');
  const out = src
    .replace(/SUPABASE_URL: '[^']*'/, `SUPABASE_URL: '${GATE}'`)
    .replace(/SUPABASE_ANON_KEY: '[^']*'/, `SUPABASE_ANON_KEY: '${stack.jwt('anon')}'`)
    .replace(/NFT_CONTRACT_ADDRESS: '[^']*'/, `NFT_CONTRACT_ADDRESS: '${S.contract}'`);
  assert.notEqual(out, src);
  assert.ok(!out.includes('supabase.co'), 'v upravenom data.js nesmie ostať produkčný Supabase');
  return out;
}

async function newPage(context) {
  const page = await context.newPage();
  page.on('pageerror', e => S.pageErrors.push(String(e)));
  return page;
}

async function newContext({ admin = false } = {}) {
  const context = await S.browser.newContext({ serviceWorkers: 'block', locale: 'sk-SK', timezoneId: 'Europe/Bratislava' });
  await context.route('**/*', route => {
    const u = new URL(route.request().url());
    if (u.hostname !== '127.0.0.1' && u.hostname !== 'localhost') { S.blocked.push(u.href); return route.abort('blockedbyclient'); }
    if (u.port === String(WEB_PORT) && u.pathname === '/data.js') {
      return route.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body: patchedDataJs() });
    }
    return route.continue();
  });
  if (admin) {
    const now = Math.floor(Date.now() / 1000);
    const session = {
      access_token: stack.jwt('authenticated', stack.ADMIN_ID, { aud: 'authenticated', email: 'admin@test.local' }),
      token_type: 'bearer', expires_in: 3600, expires_at: now + 3600, refresh_token: 'e2e-no-refresh',
      user: { id: stack.ADMIN_ID, aud: 'authenticated', role: 'authenticated', email: 'admin@test.local', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() },
    };
    await context.addInitScript(s => { try { localStorage.setItem('gosko-auth', s); } catch { /* ok */ } }, JSON.stringify(session));
  }
  return context;
}

const yearsAgo = n => { const d = new Date(); d.setFullYear(d.getFullYear() - n); d.setDate(d.getDate() - 10); return d.toISOString().slice(0, 10); };

async function fillRegistration(page, v) {
  const dlg = page.locator('dialog[open]');
  await dlg.waitFor();
  await dlg.locator('[name=legal_name]').fill(v.legal_name);
  await dlg.locator('[name=birth_date]').fill(v.birth_date);
  await dlg.locator('[name=birth_date]').dispatchEvent('change');
  await dlg.locator('[name=email]').fill(v.email);
  await dlg.locator('[name=public_name_mode]').selectOption(v.mode || 'full');
  if (v.guardian_name) {
    await dlg.locator('[name=guardian_name]').fill(v.guardian_name);
    await dlg.locator('[name=guardian_email]').fill(v.guardian_email);
  }
  for (const c of ['rules', 'privacy', 'nft']) await dlg.locator(`[name=${c}]`).check();
  await dlg.locator('button[type=submit]').click();
  await dlg.locator('.pass-done').waitFor({ timeout: 15_000 }).catch(async err => {
    throw new Error(`registrácia neprešla: ${await dlg.locator('.form-msg').textContent()} (${err.message})`);
  });
  return dlg.locator('.pass-done').textContent();
}

const regByEmail = email => stack.sqlRows(`select g.id, g.token, g.status, g.category, g.guardian_token, g.guardian_confirmed_at, g.checked_in_at
  from public.registrations g join public.rider_private p on p.rider_id = g.rider_id where p.email = '${email}'`)[0];

// ---------------------------------------------------------------- beh

if (skip) {
  test('e2e lokálne (preskočené)', { skip }, () => {});
} else {
  before(async () => {
    S.node = spawnLogged(HARDHAT_BIN, ['node'], { cwd: `${ROOT}chain` });
    await waitFor(async () => (await rpcUp()) === '0x7a69', `hardhat node\n${S.node.log}`, 90_000);
    execFileSync(`${ROOT}chain/node_modules/.bin/hardhat`, ['run', 'scripts/deploy-local.ts', '--network', 'localhost'],
      { cwd: `${ROOT}chain`, env: { ...process.env, PUBLIC_BASE_URL: WEB }, stdio: 'pipe' });
    S.deployment = JSON.parse(readFileSync(DEPLOYMENT, 'utf8'));
    S.contract = S.deployment.address;
    assert.equal(S.deployment.chainId, 31337);

    await stack.startStack();
    stack.seedUsers();
    S.gate = await startGate();

    S.web = spawnLogged(process.execPath, ['scripts/dev-server.js'], {
      cwd: ROOT,
      env: {
        PATH: process.env.PATH, HOME: process.env.HOME,
        PORT: String(WEB_PORT), HOST: '127.0.0.1', NODE_ENV: 'development',
        SUPABASE_URL: stack.REST_URL,
        SUPABASE_SERVICE_ROLE_KEY: stack.jwt('service_role'),
        SUPABASE_AUTH_URL: `${GATE}/auth/v1`,
        PUBLIC_BASE_URL: WEB,
        CHAIN_ID: '31337', RPC_URL: RPC, NFT_CONTRACT_ADDRESS: S.contract, MINTER_PRIVATE_KEY: KEY_MINTER, NFT_CUSTODY_ADDRESS: CUSTODY,
        CRON_SECRET: 'e2e-cron-secret', RATE_LIMIT_PER_10MIN: '50',
        TURNSTILE_SECRET_KEY: '', RESEND_API_KEY: '',
      },
    });
    await waitFor(async () => { try { return (await fetch(`${WEB}/`)).ok; } catch { return false; } }, `dev server\n${S.web.log}`, 20_000);
    S.browser = await pw.chromium.launch({ headless: true });
  }, { timeout: 180_000 });

  after(async () => {
    await S.browser?.close().catch(() => {});
    S.gate?.close();
    for (const c of S.children) { try { process.kill(-c.pid, 'SIGTERM'); } catch { /* už nebeží */ } }
    await stack.stopStack().catch(() => {});
  });

  test('dospelý: registrácia v prehliadači -> pass zo servera', { timeout: 60_000 }, async () => {
    const context = await newContext();
    const page = await newPage(context);
    await page.goto(`${WEB}/#/registracia/${EVENT}`);
    const done = await fillRegistration(page, { legal_name: 'Zuzana Tajomná', birth_date: yearsAgo(25), email: 'zuzana.e2e@example.sk', mode: 'short' });
    assert.match(done, /Si zaregistrovaný/);
    S.adult = regByEmail('zuzana.e2e@example.sk');
    assert.equal(S.adult.status, 'confirmed');

    await page.goto(`${WEB}/#/pass/${S.adult.token}`);
    await page.locator('.passes').waitFor();
    const text = await page.locator('#main').textContent();
    assert.match(text, /Zuzana T\./);
    assert.ok(!text.includes('zuzana.e2e@example.sk'), 'pass neukazuje e-mail');
    await context.close();
  });

  test('U16: registrácia -> stránka rodiča (GET nič nemení) -> potvrdenie (POST)', { timeout: 60_000 }, async () => {
    const context = await newContext();
    const page = await newPage(context);
    await page.goto(`${WEB}/#/registracia/${EVENT}`);
    const done = await fillRegistration(page, { legal_name: 'Peter Malý', birth_date: yearsAgo(14), email: 'peto.e2e@example.sk', guardian_name: 'Jana Malá', guardian_email: 'mama.e2e@example.sk' });
    assert.match(done, /súhlas rodiča/);
    S.kid = regByEmail('peto.e2e@example.sk');
    assert.equal(S.kid.status, 'pending_guardian');
    assert.equal(S.kid.category, 'u16');
    assert.ok(S.kid.guardian_token);

    await page.goto(`${WEB}/api/consent?token=${S.kid.guardian_token}`);
    assert.match(await page.content(), /Potvrdzujem súhlas/);
    assert.equal(regByEmail('peto.e2e@example.sk').status, 'pending_guardian', 'GET nesmie potvrdiť');
    await page.getByRole('button', { name: /Potvrdzujem súhlas/ }).click();
    await page.waitForURL(/#\/registracia\/potvrdene$/);
    await page.locator('h1', { hasText: 'Súhlas potvrdený' }).waitFor();
    const kid = regByEmail('peto.e2e@example.sk');
    assert.equal(kid.status, 'confirmed');
    assert.ok(kid.guardian_confirmed_at);
    assert.equal(kid.guardian_token, null);
    await context.close();
  });

  test('admin: check-in z QR odkazu -> mint na lokálnom chaine -> metadáta bez osobných údajov', { timeout: 90_000 }, async () => {
    const context = await newContext({ admin: true });
    const page = await newPage(context);
    await page.goto(`${WEB}/#/checkin/${S.adult.token}`);
    await page.getByRole('button', { name: 'Potvrdiť príchod' }).click();
    await page.locator('.ci-good').waitFor({ timeout: 30_000 });
    assert.match(await page.locator('.ci-good').textContent(), /Zapísané.*NFT: vydané/s);

    // U16 ručne podľa mena (jazdec bez telefónu)
    await page.locator('.res-add select').selectOption(EVENT);
    await page.locator('.res-add input').fill('Peter Malý');
    await page.getByRole('button', { name: 'Zapísať príchod' }).click();
    await page.locator('.ci-good').filter({ hasText: 'Peter' }).waitFor({ timeout: 30_000 });

    const [tok] = stack.sqlRows(`select token_id::text, status, lower(contract) as contract from public.nft_tokens where registration_id = '${S.adult.id}'`);
    assert.equal(tok.status, 'minted');
    assert.equal(tok.contract, S.contract.toLowerCase());
    S.tokenId = tok.token_id;
    assert.equal(stack.sql(`select status from public.nft_tokens where registration_id = '${S.kid.id}'`), 'minted');

    const meta = await fetch(`${WEB}/api/nft/metadata/${S.tokenId}`);
    assert.equal(meta.status, 200);
    const raw = await meta.text();
    const json = JSON.parse(raw);
    assert.match(json.name, /^GOSko Pass #\d+ · GOSko Bratislava/);
    assert.equal(json.image, `${WEB}/api/nft/image/${S.tokenId}`);
    for (const pii of ['Zuzana', 'Tajomná', 'zuzana.e2e', '@', yearsAgo(25)]) assert.ok(!raw.includes(pii), `metadáta obsahujú ${pii}`);
    await context.close();
  });

  test('admin: zoznam registrácií eventu (embed riders) a výsledky -> rebríček a NFT', { timeout: 90_000 }, async () => {
    const context = await newContext({ admin: true });
    const page = await newPage(context);
    await page.goto(`${WEB}/#/admin/vysledky/${EVENT}`);
    await page.locator('summary', { hasText: 'Alebo zapíš len poradie' }).click();
    await page.locator('textarea[aria-label="Poradie jazdcov"]').fill('Zuzana Tajomná\nHosť Bez Registrácie');
    await page.getByRole('button', { name: 'Uložiť poradie' }).click();
    await page.locator('.res-note', { hasText: 'Uložené: 2 jazdcov' }).waitFor({ timeout: 30_000 });

    const rows = stack.sqlRows(`select rider_name, place, points, registration_id from public.event_results where event_id = '${EVENT}' and category = 'open' order by place`);
    assert.deepEqual(rows.map(r => [r.place, r.points, r.registration_id]), [[1, 100, S.adult.id], [2, 80, null]], 'meno sa spárovalo s registráciou cez embed riders(display_name)');
    assert.equal(stack.sql(`select status from public.nft_tokens where registration_id = '${S.adult.id}'`), 'result_set');
    assert.deepEqual(await passOf(S.tokenId), [1, 100], 'setResult na chaine');
    const meta = await (await fetch(`${WEB}/api/nft/metadata/${S.tokenId}`)).json();
    assert.deepEqual(meta.attributes.filter(a => ['Umiestnenie', 'Body'].includes(a.trait_type)).map(a => a.value), [1, 100]);

    const pub = await newPage(await newContext());
    await pub.goto(`${WEB}/#/rebricek`);
    await pub.locator('#main', { hasText: 'Zuzana T.' }).waitFor({ timeout: 15_000 });
    const text = await pub.locator('#main').textContent();
    assert.ok(!text.includes('Tajomná'), 'rebríček rešpektuje public_name_mode short');
    await context.close();
  });

  test('admin: prázdne výsledky zmažú kategóriu, zapíšu audit a vynulujú výsledok na chaine', { timeout: 60_000 }, async () => {
    const audits = Number(stack.sql(`select count(*) from public.audit_log where action = 'results.save'`));
    const res = await fetch(`${WEB}/api/admin/results`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${stack.jwt('authenticated', stack.ADMIN_ID)}` },
      body: JSON.stringify({ event_id: EVENT, category: 'open', rows: [] }),
    });
    assert.equal(res.status, 200, await res.clone().text());
    assert.deepEqual(await res.json(), { ok: true, saved: 0, nft_updates: 1, nft_failed: 0 });
    assert.equal(stack.sql(`select count(*) from public.event_results where event_id = '${EVENT}' and category = 'open'`), '0');
    assert.equal(Number(stack.sql(`select count(*) from public.audit_log where action = 'results.save'`)), audits + 1);
    assert.equal(stack.sql(`select status from public.nft_tokens where registration_id = '${S.adult.id}'`), 'minted');
    assert.deepEqual(await passOf(S.tokenId), [0, 0], 'výsledok na chaine je vynulovaný');
    const meta = await (await fetch(`${WEB}/api/nft/metadata/${S.tokenId}`)).json();
    assert.ok(!meta.attributes.some(a => a.trait_type === 'Umiestnenie'));
  });

  test('admin endpointy odmietnu bežného používateľa a chýbajúci JWT', async () => {
    for (const [auth, status] of [[null, 401], [`Bearer ${stack.jwt('authenticated', stack.USER_ID)}`, 403], ['Bearer zly.token.x', 401]]) {
      for (const path of ['/api/admin/results', '/api/admin/checkin']) {
        const r = await fetch(`${WEB}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...(auth ? { authorization: auth } : {}) }, body: JSON.stringify({ event_id: EVENT, category: 'open', rows: [], token: S.adult.token }) });
        assert.equal(r.status, status, `${path} ${auth}`);
      }
    }
  });

  test('prehliadač nevolal nič mimo localhost a stránky nehodili chybu', () => {
    assert.deepEqual(S.blocked.filter(u => /supabase\.co/.test(u)), [], 'žiadna požiadavka na produkčný Supabase');
    assert.deepEqual(S.pageErrors, []);
    if (S.blocked.length) console.log('zablokované externé požiadavky (fonty, CDN):', [...new Set(S.blocked.map(u => new URL(u).host))].join(', '));
  });
}

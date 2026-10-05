// End-to-end API proti lokálnemu PostgRESTu (tests/helpers/stack.js) a lokálnemu hardhat uzlu.
// Tok: registrácia dospelého a U16 so súhlasom rodiča -> check-in s nft_consent -> mint na chaine
// -> výsledky -> setResult -> metadáta s umiestnením a bodmi -> zlyhaný mint dorobí cron.
//
// Hardhat uzol si test spustí sám na porte GOSKO_TEST_RPC_PORT (default 8546), aby nekolidoval
// s ručne spusteným `npx hardhat node` na 8545. Kontrakt nasadí zo skompilovaného artefaktu,
// chain/deployments/local.json nemení. Externý uzol: GOSKO_TEST_RPC_URL.
// Na produkčný Supabase ani verejný chain sa nikdy nepripája.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createPublicClient, createWalletClient, defineChain, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

import { readEnv } from '../../../api/_lib/env.js';
import { createDb, eq } from '../../../api/_lib/db.js';
import { createTurnstile } from '../../../api/_lib/turnstile.js';
import { createAuth } from '../../../api/_lib/auth.js';
import { createChain, encodeRegistrationKey, encodeEventId } from '../../../api/_lib/chain.js';
import { createHandler as registerHandler } from '../../../api/register.js';
import { createHandler as consentHandler } from '../../../api/consent.js';
import { createHandler as passHandler } from '../../../api/pass.js';
import { createHandler as checkinHandler } from '../../../api/admin/checkin.js';
import { createHandler as resultsHandler } from '../../../api/admin/results.js';
import { createHandler as metadataHandler } from '../../../api/nft/metadata/[id].js';
import { createHandler as imageHandler } from '../../../api/nft/image/[id].js';
import { createHandler as cronHandler } from '../../../api/cron/nft-retry.js';
import { call } from '../../api/_support/fakes.js';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const STACK = new URL('../../helpers/stack.js', import.meta.url);
const ARTIFACT = new URL('../../../chain/artifacts/contracts/GoskoPass.sol/GoskoPass.json', import.meta.url);
const HARDHAT_BIN = `${ROOT}chain/node_modules/.bin/hardhat`;

const missing = [
  !existsSync(STACK) && 'tests/helpers/stack.js (db teammate)',
  !existsSync(ARTIFACT) && 'chain/artifacts/.../GoskoPass.json (cd chain && npx hardhat build)',
  !process.env.GOSKO_TEST_RPC_URL && !existsSync(HARDHAT_BIN) && 'chain/node_modules (cd chain && npm install)',
].filter(Boolean);

// Predvolené testovacie účty hardhat uzla (verejne známe, nikdy nie na reálnej sieti).
const KEY_ADMIN = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const KEY_MINTER = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';
const CUSTODY = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC'; // účet #2
const BASE = 'http://localhost:3000';
const PORT = Number(process.env.GOSKO_TEST_RPC_PORT || 8546);
const RPC = process.env.GOSKO_TEST_RPC_URL || `http://127.0.0.1:${PORT}`;
const sleep = ms => new Promise(r => setTimeout(r, ms));

if (missing.length) {
  test('API integrácia (preskočené)', { skip: `chýba: ${missing.join(', ')}` }, () => {});
} else {
  const stack = await import(STACK.href);
  const chainDef = defineChain({ id: 31337, name: 'Hardhat', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [RPC] } } });
  const pc = createPublicClient({ chain: chainDef, transport: http(RPC) });
  // čítanie v teste ide cez plné skompilované ABI (ownerOf, balanceOf nie sú v ABI z kontraktu §4)
  const FULL_ABI = JSON.parse(readFileSync(ARTIFACT, 'utf8')).abi;
  const read = (functionName, args) => pc.readContract({ address: S.contract, abi: FULL_ABI, functionName, args });

  const S = {}; // zdieľaný stav medzi krokmi
  let node = null;

  async function rpcReady(timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      try {
        if ((await pc.getChainId()) === 31337) return true;
      } catch { /* ešte nebeží */ }
      await sleep(250);
    }
    return false;
  }

  async function startNode() {
    if (await rpcReady(500)) {
      if (!process.env.GOSKO_TEST_RPC_URL) throw new Error(`Port ${PORT} už obsadil iný uzol. Nastav GOSKO_TEST_RPC_PORT alebo GOSKO_TEST_RPC_URL.`);
      return;
    }
    if (process.env.GOSKO_TEST_RPC_URL) throw new Error(`GOSKO_TEST_RPC_URL ${RPC} neodpovedá`);
    let log = '';
    node = spawn(HARDHAT_BIN, ['node', '--port', String(PORT)], { cwd: `${ROOT}chain`, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
    node.stdout.on('data', d => { log = (log + d).slice(-4000); });
    node.stderr.on('data', d => { log = (log + d).slice(-4000); });
    if (!(await rpcReady(90_000))) throw new Error(`hardhat node na ${PORT} nenaštartoval:\n${log}`);
  }

  function stopNode() {
    if (!node) return;
    try { process.kill(-node.pid, 'SIGTERM'); } catch { /* už nebeží */ }
    node = null;
  }

  async function deploy() {
    const artifact = JSON.parse(readFileSync(ARTIFACT, 'utf8'));
    const admin = privateKeyToAccount(KEY_ADMIN);
    const minter = privateKeyToAccount(KEY_MINTER);
    const wc = createWalletClient({ account: admin, chain: chainDef, transport: http(RPC) });
    const hash = await wc.deployContract({ abi: artifact.abi, bytecode: artifact.bytecode, args: [admin.address, minter.address, `${BASE}/api/nft/metadata/`] });
    const receipt = await pc.waitForTransactionReceipt({ hash });
    assert.equal(receipt.status, 'success');
    return receipt.contractAddress;
  }

  // Port 3901 môže chvíľu držať iný beh (npm run test:db). Počká najviac 2 minúty.
  async function startStackPatiently() {
    const deadline = Date.now() + 120_000;
    for (;;) {
      try {
        return await stack.startStack();
      } catch (err) {
        if (!/busy/i.test(err.message) || Date.now() > deadline) throw err;
        await sleep(2000);
      }
    }
  }

  function makeDeps(over = {}) {
    const envSrc = {
      SUPABASE_URL: stack.REST_URL,
      SUPABASE_SERVICE_ROLE_KEY: stack.jwt('service_role'),
      PUBLIC_BASE_URL: BASE,
      CONSENT_VERSION: '2026-10-int',
      CHAIN_ID: '31337',
      RPC_URL: RPC,
      NFT_CONTRACT_ADDRESS: S.contract,
      MINTER_PRIVATE_KEY: KEY_MINTER,
      NFT_CUSTODY_ADDRESS: CUSTODY,
      CRON_SECRET: 'int-cron-secret',
      RATE_LIMIT_PER_10MIN: '5',
      NODE_ENV: 'test',
      ...over,
    };
    const env = readEnv(envSrc);
    const db = createDb({ url: env.SUPABASE_REST_URL, key: env.SUPABASE_SERVICE_ROLE_KEY });
    // GoTrue lokálne nebeží: nahradí sa iba volanie /user, riadok v admins sa overuje v skutočnej DB.
    const gotrue = async (url, init) => {
      const h = init.headers.Authorization;
      if (h === 'Bearer admin-jwt') return Response.json({ id: stack.ADMIN_ID });
      if (h === 'Bearer user-jwt') return Response.json({ id: stack.USER_ID });
      return Response.json({ msg: 'bad jwt' }, { status: 401 });
    };
    const log = { info() {}, warn() {}, error: (...a) => S.errors.push(a) };
    return {
      env, db, log,
      mail: S.mail,
      turnstile: createTurnstile({ env, log }),
      auth: createAuth({ env, db, fetch: gotrue }),
      chain: createChain({ env, receiptTimeoutMs: 15_000 }),
    };
  }

  const handlers = deps => ({
    register: registerHandler(deps),
    consent: consentHandler(deps),
    pass: passHandler(deps),
    checkin: checkinHandler(deps),
    results: resultsHandler(deps),
    metadata: metadataHandler(deps),
    image: imageHandler(deps),
    cron: cronHandler(deps),
  });

  const isoDate = d => d.toISOString().slice(0, 10);
  const yearsBefore = (iso, years) => `${Number(iso.slice(0, 4)) - years}${iso.slice(4)}`;
  const ADMIN = { authorization: 'Bearer admin-jwt' };

  before(async () => {
    S.errors = [];
    S.mail = { sent: [], async send(m) { this.sent.push(m); return { id: 'int' }; } };
    await startNode();
    S.contract = await deploy();
    await startStackPatiently();
    stack.seedUsers();
    S.deps = makeDeps();
    S.h = handlers(S.deps);
    // deň max. 28, aby dátumy narodenia (o 14 a 25 rokov skôr) boli vždy platné
    S.eventDate = isoDate(new Date(Date.now() + 60 * 86_400_000)).replace(/-(29|30|31)$/, '-28');
    S.eventId = 'int-api-test';
    await S.deps.db.insert('events', { id: S.eventId, name: 'GOSko Test', city: 'Trnava', country: 'SK', date: S.eventDate, season: Number(S.eventDate.slice(0, 4)), status: 'open', registration_open: true, capacity: 50 });
  }, { timeout: 240_000 });

  after(async () => {
    await stack.stopStack().catch(() => {});
    stopNode();
  });

  const body = (over = {}) => ({
    event_id: S.eventId,
    legal_name: 'Zuzana Tajomná',
    display_name: 'Zuzka Tajomná',
    nickname: 'Zuzi',
    birth_date: yearsBefore(S.eventDate, 25),
    email: 'Zuzana.Tajomna@example.sk',
    country: 'SK',
    public_name_mode: 'short',
    consents: { rules: true, privacy: true, photo: true, nft: true },
    turnstile_token: 'dev',
    ...over,
  });
  const post = (h, b, headers = {}) => call(h, { method: 'POST', body: b, headers: { 'x-forwarded-for': '198.51.100.10', ...headers } });

  test('env: lokálny PostgREST bez /rest/v1', () => {
    assert.equal(S.deps.env.SUPABASE_REST_URL, stack.REST_URL);
  });

  test('registrácia dospelého: 201 confirmed, údaje v DB, e-mail s passom', async () => {
    const res = await post(S.h.register, body());
    assert.equal(res.statusCode, 201, res.body);
    assert.equal(res.json.status, 'confirmed');
    assert.equal(res.json.pass.category, 'open');
    assert.equal(res.json.pass.public_name, 'Zuzka T.');
    S.adultToken = res.json.pass.token;
    const [reg] = await S.deps.db.select('registrations', { token: eq(S.adultToken) });
    S.adultReg = reg;
    assert.equal(reg.consent_version, '2026-10-int');
    assert.equal(reg.nft_consent, true);
    const [rider] = await S.deps.db.select('riders', { id: eq(reg.rider_id) });
    S.adultRiderRef = rider.rider_ref;
    assert.match(rider.rider_ref, /^0x[0-9a-f]{64}$/);
    const [priv] = await S.deps.db.select('rider_private', { rider_id: eq(reg.rider_id) });
    assert.equal(priv.email, 'zuzana.tajomna@example.sk');
    assert.ok(S.mail.sent.at(-1).text.includes(`${BASE}/#/pass/${S.adultToken}`));
  });

  test('duplicita: 202 check_email bez údajov, pass ide e-mailom jazdcovi', async () => {
    const res = await post(S.h.register, body({ email: 'ZUZANA.tajomna@example.sk', legal_name: 'Iné Meno' }), { 'x-forwarded-for': '198.51.100.11' });
    assert.equal(res.statusCode, 202);
    assert.deepEqual(res.json, { ok: true, status: 'check_email', mail_sent: true });
    assert.ok(!res.body.includes('Zuz') && !res.body.includes(S.adultToken));
    assert.equal(S.mail.sent.at(-1).to, 'zuzana.tajomna@example.sk');
    assert.ok(S.mail.sent.at(-1).text.includes(S.adultToken));
  });

  test('U16: bez rodiča 422, s rodičom pending_guardian, súhlas -> potvrdene, druhý klik -> neplatny-odkaz', async () => {
    const kid = body({ legal_name: 'Peter Malý', display_name: '', nickname: '', email: 'peto@example.sk', birth_date: yearsBefore(S.eventDate, 14), public_name_mode: 'full' });
    const no = await post(S.h.register, kid, { 'x-forwarded-for': '198.51.100.12' });
    assert.equal(no.statusCode, 422);
    assert.equal(no.json.error, 'guardian_required');
    const res = await post(S.h.register, { ...kid, guardian_email: 'mama@example.sk', guardian_name: 'Jana Malá' }, { 'x-forwarded-for': '198.51.100.12' });
    assert.equal(res.statusCode, 201, res.body);
    assert.equal(res.json.status, 'pending_guardian');
    assert.equal(res.json.pass.category, 'u16');
    S.kidToken = res.json.pass.token;
    const mail = S.mail.sent.at(-1);
    assert.equal(mail.to, 'mama@example.sk');
    const link = /\/api\/consent\?token=([0-9a-f-]{36})/.exec(mail.text);
    assert.ok(link, 'odkaz pre rodiča v e-maile');
    // krok 1: GET iba ukáže stránku (skener odkazov nič nepotvrdí)
    const page = await call(S.h.consent, { url: `/api/consent?token=${link[1]}` });
    assert.equal(page.statusCode, 200);
    assert.ok(page.body.includes('Potvrdzujem súhlas'));
    const [still] = await S.deps.db.select('registrations', { token: eq(S.kidToken) });
    assert.equal(still.status, 'pending_guardian');
    // krok 2: POST formulára
    const ok = await call(S.h.consent, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, rawBody: `token=${link[1]}` });
    assert.equal(ok.statusCode, 302);
    assert.equal(ok.headers.location, `${BASE}/#/registracia/potvrdene`);
    const [reg] = await S.deps.db.select('registrations', { token: eq(S.kidToken) });
    assert.equal(reg.status, 'confirmed');
    assert.ok(reg.guardian_confirmed_at);
    assert.equal(reg.guardian_token, null);
    S.kidReg = reg;
    const again = await call(S.h.consent, { method: 'POST', body: { token: link[1] } });
    assert.equal(again.headers.location, `${BASE}/#/registracia/neplatny-odkaz`);
  });

  test('rate limit cez rate_limit_hit: šiesty pokus z jednej IP je 429', async () => {
    const statuses = [];
    for (let i = 0; i < 6; i++) {
      const r = await post(S.h.register, { event_id: S.eventId, turnstile_token: 'dev' }, { 'x-forwarded-for': '198.51.100.66' });
      statuses.push(r.statusCode);
    }
    assert.deepEqual(statuses, [400, 400, 400, 400, 400, 429]);
  });

  test('GET pass zo servera', async () => {
    const res = await call(S.h.pass, { url: `/api/pass?token=${S.adultToken}` });
    assert.equal(res.statusCode, 200);
    assert.equal(res.json.pass.status, 'confirmed');
    assert.equal(res.json.pass.event_name, 'GOSko Test');
  });

  test('admin: neadmin dostane 403 (overenie v tabuľke admins)', async () => {
    const res = await post(S.h.checkin, { token: S.adultToken }, { authorization: 'Bearer user-jwt' });
    assert.equal(res.statusCode, 403);
  });

  test('check-in s nft_consent: mint na chaine, riderRef a kategória sedia', async () => {
    const res = await post(S.h.checkin, { token: S.adultToken }, ADMIN);
    assert.equal(res.statusCode, 200, res.body);
    assert.equal(res.json.registration.status, 'checked_in');
    assert.equal(res.json.nft.status, 'minted', JSON.stringify(S.errors));
    const [tok] = await S.deps.db.select('nft_tokens', { registration_id: eq(S.adultReg.id) });
    assert.equal(tok.status, 'minted');
    assert.equal(tok.contract, S.contract.toLowerCase());
    assert.match(tok.mint_tx, /^0x[0-9a-f]{64}$/);
    S.adultTokenId = BigInt(tok.token_id);
    assert.equal(await read('tokenOfRegistration', [encodeRegistrationKey(S.adultReg.id)]), S.adultTokenId);
    const pass = await read('passOf', [S.adultTokenId]);
    // 006 (audit M2): riderRef na chaine je náhodný pre token, nie riders.rider_ref
    assert.notEqual(pass.riderRef, S.adultRiderRef);
    assert.equal(pass.riderRef, tok.rider_ref);
    assert.equal(pass.eventId, encodeEventId(S.eventId));
    assert.equal(pass.category, 1);
    assert.equal((await read('ownerOf', [S.adultTokenId])).toLowerCase(), CUSTODY.toLowerCase());
  });

  test('check-in znova: idempotentný, žiadny druhý token', async () => {
    const res = await post(S.h.checkin, { registration_id: S.adultReg.id }, ADMIN);
    assert.equal(res.statusCode, 200);
    assert.equal(res.json.nft.status, 'minted');
    assert.equal(await read('balanceOf', [CUSTODY]), 1n);
  });

  test('U16 so súhlasom rodiča: check-in a mint s kategóriou u16', async () => {
    const res = await post(S.h.checkin, { token: S.kidToken }, ADMIN);
    assert.equal(res.json.registration.guardian_ok, true);
    assert.equal(res.json.nft.status, 'minted');
    const id = await read('tokenOfRegistration', [encodeRegistrationKey(S.kidReg.id)]);
    assert.equal((await read('passOf', [id])).category, 2);
  });

  test('výsledky: save_results a setResult na chaine', async () => {
    const res = await post(S.h.results, {
      event_id: S.eventId, category: 'open',
      rows: [{ registration_id: S.adultReg.id, rider_name: 'Zuzka T.', place: 1 }, { rider_name: 'Hosť Bez Registrácie', place: 2 }],
    }, ADMIN);
    assert.equal(res.statusCode, 200, res.body);
    assert.deepEqual(res.json, { ok: true, saved: 2, nft_updates: 1, nft_failed: 0 });
    const pass = await read('passOf', [S.adultTokenId]);
    assert.equal(pass.placement, 1);
    assert.equal(pass.points, 100);
    const [tok] = await S.deps.db.select('nft_tokens', { registration_id: eq(S.adultReg.id) });
    assert.equal(tok.status, 'result_set');
    assert.match(tok.result_tx, /^0x[0-9a-f]{64}$/);
  });

  test('metadáta ukazujú umiestnenie a body, bez osobných údajov; obrázok je SVG', async () => {
    const id = String(S.adultTokenId);
    const res = await call(S.h.metadata, { url: `/api/nft/metadata/${id}`, query: { id } });
    assert.equal(res.statusCode, 200, res.body);
    const attrs = Object.fromEntries(res.json.attributes.map(a => [a.trait_type, a.value]));
    assert.equal(attrs.Umiestnenie, 1);
    assert.equal(attrs.Body, 100);
    assert.equal(attrs['Kategória'], 'Open');
    assert.equal(res.json.image, `${BASE}/api/nft/image/${id}`);
    for (const pii of ['Zuzana', 'Zuzka', 'Zuzi', 'Tajomn', 'example.sk', S.adultReg.rider_id]) assert.ok(!res.body.includes(pii), pii);
    const img = await call(S.h.image, { url: `/api/nft/image/${id}`, query: { id } });
    assert.equal(img.statusCode, 200);
    assert.match(img.headers['content-type'], /image\/svg\+xml/);
    assert.ok(img.body.includes('TRNAVA'));
  });

  test('U16 odbavený pred súhlasom rodiča: po súhlase ostane checked_in a token sa zmintuje', async () => {
    const kid = body({ legal_name: 'Ema Mladá', display_name: '', nickname: '', email: 'ema@example.sk', birth_date: yearsBefore(S.eventDate, 13), public_name_mode: 'full', guardian_email: 'otec@example.sk' });
    const reg = await post(S.h.register, kid, { 'x-forwarded-for': '198.51.100.14' });
    assert.equal(reg.statusCode, 201, reg.body);
    const token = reg.json.pass.token;
    const link = /\/api\/consent\?token=([0-9a-f-]{36})/.exec(S.mail.sent.at(-1).text)[1];
    const chk = await post(S.h.checkin, { token }, ADMIN);
    assert.equal(chk.json.registration.guardian_ok, false);
    assert.equal(chk.json.nft.status, 'guardian_pending');
    assert.equal((await call(S.h.consent, { url: `/api/consent?token=${link}` })).statusCode, 200);
    const ok = await call(S.h.consent, { method: 'POST', body: { token: link } });
    assert.equal(ok.headers.location, `${BASE}/#/registracia/potvrdene`);
    const [row] = await S.deps.db.select('registrations', { token: eq(token) });
    assert.equal(row.status, 'checked_in');
    assert.ok(row.guardian_confirmed_at);
    const [tok] = await S.deps.db.select('nft_tokens', { registration_id: eq(row.id) });
    assert.equal(tok.status, 'minted', JSON.stringify(S.errors));
    const id = await read('tokenOfRegistration', [encodeRegistrationKey(row.id)]);
    assert.equal(BigInt(tok.token_id), id);
    assert.equal((await read('passOf', [id])).category, 2);
  });

  test('zlyhaný mint (RPC dole): check-in prejde s failed, cron ho dorobí bez duplikátu', async () => {
    const reg = await post(S.h.register, body({ legal_name: 'Ján Novák', display_name: '', nickname: '', email: 'jan@example.sk' }), { 'x-forwarded-for': '198.51.100.13' });
    assert.equal(reg.statusCode, 201, reg.body);
    const token = reg.json.pass.token;
    const broken = handlers(makeDeps({ RPC_URL: 'http://127.0.0.1:9' }));
    const res = await post(broken.checkin, { token }, ADMIN);
    assert.equal(res.statusCode, 200);
    assert.equal(res.json.registration.status, 'checked_in');
    assert.equal(res.json.nft.status, 'failed');
    const [row] = await S.deps.db.select('registrations', { token: eq(token) });
    const [tok] = await S.deps.db.select('nft_tokens', { registration_id: eq(row.id) });
    assert.equal(tok.status, 'failed');
    assert.ok(tok.error);

    const denied = await call(S.h.cron, { headers: { authorization: 'Bearer zly' } });
    assert.equal(denied.statusCode, 401);
    const cron = await call(S.h.cron, { headers: { authorization: 'Bearer int-cron-secret' } });
    assert.equal(cron.statusCode, 200, cron.body);
    assert.equal(cron.json.minted, 1);
    assert.equal(cron.json.failed, 0);
    const [after] = await S.deps.db.select('nft_tokens', { registration_id: eq(row.id) });
    assert.equal(after.status, 'minted');
    assert.equal(await read('tokenOfRegistration', [encodeRegistrationKey(row.id)]), BigInt(after.token_id));
    assert.equal(await read('balanceOf', [CUSTODY]), 4n);
  });
}

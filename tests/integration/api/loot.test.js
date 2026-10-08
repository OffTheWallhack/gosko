// Loot drop od admina po NFT (Task 6) proti lokálnemu PostgRESTu a lokálnemu hardhat uzlu s GoskoLoot:
// admin cez /api/admin/loot založí drop -> hráč check-in, overený klip, claim_loot (kód) -> bez súhlasu
// s NFT sa nemintuje -> so súhlasom /api/game/loot-nft vydá soulbound kus na custody, opakovanie nič nové.
// Bez LOOT_CONTRACT_ADDRESS je mint vypnutý. Uzol si test spustí sám na GOSKO_TEST_LOOT_RPC_PORT (default 8547).
// Na produkčný Supabase ani verejný chain sa nikdy nepripája.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createPublicClient, createWalletClient, defineChain, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

import { readEnv } from '../../../api/_lib/env.js';
import { createDb } from '../../../api/_lib/db.js';
import { createAuth } from '../../../api/_lib/auth.js';
import { createLootChain, encodeClaimRef } from '../../../api/_lib/lootchain.js';
import { createHandler as adminLootHandler } from '../../../api/admin/loot.js';
import { createHandler as lootNftHandler } from '../../../api/game/loot-nft.js';
import { call } from '../../api/_support/fakes.js';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const ARTIFACT = new URL('../../../chain/artifacts/contracts/GoskoLoot.sol/GoskoLoot.json', import.meta.url);
const HARDHAT_BIN = `${ROOT}chain/node_modules/.bin/hardhat`;
const missing = [
  !existsSync(ARTIFACT) && 'chain/artifacts/.../GoskoLoot.json (npm run test:chain)',
  !existsSync(HARDHAT_BIN) && 'chain/node_modules (cd chain && npm install)',
].filter(Boolean);

// Predvolené testovacie účty hardhat uzla (verejne známe, nikdy nie na reálnej sieti).
const KEY_ADMIN = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const KEY_MINTER = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';
const CUSTODY = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';
const PORT = Number(process.env.GOSKO_TEST_LOOT_RPC_PORT || 8547);
const RPC = `http://127.0.0.1:${PORT}`;
const sleep = ms => new Promise(r => setTimeout(r, ms));

if (missing.length) {
  test('loot API integrácia (preskočené)', { skip: `chýba: ${missing.join(', ')}` }, () => {});
} else {
  const stack = await import('../../helpers/stack.js');
  const { createPlayer, createSpot, SPOT } = await import('../db/_game.js');
  const chainDef = defineChain({ id: 31337, name: 'Hardhat', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [RPC] } } });
  const pc = createPublicClient({ chain: chainDef, transport: http(RPC) });
  const ABI = JSON.parse(readFileSync(ARTIFACT, 'utf8')).abi;
  const S = {};
  let node = null;

  const rpcReady = async ms => {
    const end = Date.now() + ms;
    while (Date.now() < end) { try { if ((await pc.getChainId()) === 31337) return true; } catch { /* ešte nebeží */ } await sleep(250); }
    return false;
  };

  before(async () => {
    if (await rpcReady(500)) throw new Error(`Port ${PORT} už obsadil iný uzol. Nastav GOSKO_TEST_LOOT_RPC_PORT.`);
    let log = '';
    node = spawn(HARDHAT_BIN, ['node', '--port', String(PORT)], { cwd: `${ROOT}chain`, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
    node.stdout.on('data', d => { log = (log + d).slice(-4000); });
    node.stderr.on('data', d => { log = (log + d).slice(-4000); });
    if (!(await rpcReady(90_000))) throw new Error(`hardhat node na ${PORT} nenaštartoval:\n${log}`);
    const artifact = JSON.parse(readFileSync(ARTIFACT, 'utf8'));
    const admin = privateKeyToAccount(KEY_ADMIN);
    const minter = privateKeyToAccount(KEY_MINTER);
    const wc = createWalletClient({ account: admin, chain: chainDef, transport: http(RPC) });
    const hash = await wc.deployContract({ abi: artifact.abi, bytecode: artifact.bytecode, args: [admin.address, minter.address, 'http://localhost:3000/api/nft/loot/{id}'] });
    S.contract = (await pc.waitForTransactionReceipt({ hash })).contractAddress;

    await stack.startStack();
    stack.seedUsers();
    S.users = new Map();
  });
  after(async () => {
    await stack.stopStack();
    if (node) { try { process.kill(-node.pid, 'SIGTERM'); } catch { /* už nebeží */ } node = null; }
  });

  function deps({ loot = true } = {}) {
    const env = readEnv({
      SUPABASE_URL: stack.REST_URL, SUPABASE_REST_URL: stack.REST_URL, SUPABASE_SERVICE_ROLE_KEY: stack.jwt('service_role'),
      SUPABASE_AUTH_URL: 'http://auth.local/auth/v1', PUBLIC_BASE_URL: 'http://localhost:3000', CHAIN_ID: '31337', RPC_URL: RPC,
      LOOT_CONTRACT_ADDRESS: loot ? S.contract : '', MINTER_PRIVATE_KEY: KEY_MINTER, NFT_CUSTODY_ADDRESS: CUSTODY, NODE_ENV: 'test',
    });
    const db = createDb({ url: env.SUPABASE_REST_URL, key: env.SUPABASE_SERVICE_ROLE_KEY });
    // GoTrue lokálne nebeží: /auth/v1/user odpovedá podľa tokenu, admin sa overuje v skutočnej tabuľke admins
    const gotrue = async (url, init) => {
      const t = String(init.headers.Authorization).replace('Bearer ', '');
      if (t === 'admin-jwt') return Response.json({ id: stack.ADMIN_ID, email: 'admin@test.local', email_confirmed_at: '2026-10-05T10:00:00Z' });
      const u = S.users.get(t);
      return u ? Response.json({ ...u, email_confirmed_at: '2026-10-05T10:00:00Z' }) : Response.json({ msg: 'bad jwt' }, { status: 401 });
    };
    const log = { info() {}, warn() {}, error() {} };
    return { env, db, log, auth: createAuth({ env, db, fetch: gotrue }), lootChain: createLootChain({ env, receiptTimeoutMs: 15_000 }) };
  }
  const asPlayer = (fn, p, body = {}) => stack.rest(`/rpc/${fn}`, { method: 'POST', as: 'authenticated', sub: p.id, body });

  test('admin drop -> check-in, overený klip, kód -> NFT len so súhlasom, na custody, raz', async () => {
    const spot = createSpot();
    const adminLoot = adminLootHandler(deps());
    const created = await call(adminLoot, { method: 'POST', headers: { authorization: 'Bearer admin-jwt', 'content-type': 'application/json' }, body: {
      spot_id: spot, title: 'Ghost drop', partner: 'Skateshop', nft_type: 1,
      tiers: [{ label: 'Top 1', up_to: 1, reward: 'Doska', code: 'GHOST-1', gear_id: 'ghost-drop' }, { label: 'Top 3', up_to: 3, reward: 'Zľava', code: 'GHOST-3' }],
    } });
    assert.equal(created.statusCode, 201, created.body);
    const drop = created.json.id;
    const list = await call(adminLoot, { method: 'GET', headers: { authorization: 'Bearer admin-jwt' } });
    assert.ok(list.json.drops.some(d => d.id === drop && d.claimed === 0));
    assert.ok(!list.body.includes('GHOST-1'));
    assert.equal((await call(adminLoot, { method: 'GET', headers: { authorization: 'Bearer nobody' } })).statusCode, 401);

    const p = createPlayer();
    S.users.set(`jwt-${p.id}`, { id: p.id, email: `${p.id}@test.local` });
    assert.equal((await asPlayer('check_in', p, { p_spot: spot, p_lat: SPOT.lat, p_lng: SPOT.lng })).status, 200);
    assert.equal((await asPlayer('add_clip', p, { p_spot: spot, p_kind: 'embed', p_embed_url: 'https://www.instagram.com/reel/C1a2B3c4D5e/' })).body.verified, true);
    const claim = await asPlayer('claim_loot', p, { p_drop: drop });
    assert.equal(claim.status, 200, JSON.stringify(claim.body));
    assert.equal(claim.body.reward_code, 'GHOST-1');

    const nft = lootNftHandler(deps());
    const post = () => call(nft, { method: 'POST', headers: { authorization: `Bearer jwt-${p.id}`, 'content-type': 'application/json' }, body: { drop_id: drop } });
    assert.equal((await post()).json.status, 'no_consent', 'bez súhlasu s NFT sa nemintuje');
    assert.equal((await asPlayer('set_nft_consent', p, { p_on: true })).status, 200);

    const off = await call(lootNftHandler(deps({ loot: false })), { method: 'POST', headers: { authorization: `Bearer jwt-${p.id}`, 'content-type': 'application/json' }, body: { drop_id: drop } });
    assert.equal(off.json.status, 'disabled', 'prázdna LOOT_CONTRACT_ADDRESS = žiadny mint');

    const res = await post();
    assert.equal(res.json.status, 'minted', res.body);
    const claimId = (await asPlayer('my_loot', p)).body[0].claim_id;
    const holder = await pc.readContract({ address: S.contract, abi: ABI, functionName: 'holderOfClaim', args: [encodeClaimRef(claimId)] });
    assert.equal(holder.toLowerCase(), CUSTODY.toLowerCase());
    assert.equal(await pc.readContract({ address: S.contract, abi: ABI, functionName: 'balanceOf', args: [CUSTODY, 1n] }), 1n);
    assert.equal((await post()).json.status, 'minted');
    assert.equal(await pc.readContract({ address: S.contract, abi: ABI, functionName: 'balanceOf', args: [CUSTODY, 1n] }), 1n, 'opakovanie nevydá druhý kus');
    const [row] = stack.sqlRows(`select status, token_type, contract from public.loot_nft where claim_id = '${claimId}'`);
    assert.deepEqual(row, { status: 'minted', token_type: 1, contract: S.contract.toLowerCase() });
    assert.equal((await asPlayer('my_loot', p)).body[0].nft_status, 'minted');
  });
}

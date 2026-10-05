// chain.js s nahradenými viem klientmi (žiadne RPC).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeEventTopics, encodeErrorResult, ContractFunctionRevertedError, ContractFunctionExecutionError, keccak256, stringToBytes, WaitForTransactionReceiptTimeoutError } from 'viem';
import { createChain, GOSKO_PASS_ABI, encodeRegistrationKey, encodeEventId, categoryCode, revertName, ChainDisabledError } from '../../../api/_lib/chain.js';
import { testEnv } from '../_support/fakes.js';

const CONTRACT = '0x5FbDB2315678afecb367f032d93F642f64180aa3';
const CUSTODY = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const MINTER = { address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266', type: 'local' };
const RID = '8b0f6c1e-3c4d-4e5f-8a9b-0c1d2e3f4a5b';
const RIDER_REF = '0x' + 'a1'.repeat(32);
const TX = '0x' + '11'.repeat(32);

function mintedLog(tokenId, registrationId, eventId, address = CONTRACT) {
  const topics = encodeEventTopics({ abi: GOSKO_PASS_ABI, eventName: 'Minted', args: { tokenId, registrationKey: encodeRegistrationKey(registrationId), eventId: encodeEventId(eventId) } });
  return { address: address.toLowerCase(), topics, data: '0x', blockNumber: 1n, logIndex: 0, transactionHash: TX, transactionIndex: 0, blockHash: '0x' + '22'.repeat(32), removed: false };
}

function alreadyMintedError() {
  const revert = new ContractFunctionRevertedError({ abi: GOSKO_PASS_ABI, functionName: 'mint', data: encodeErrorResult({ abi: GOSKO_PASS_ABI, errorName: 'AlreadyMinted' }) });
  return new ContractFunctionExecutionError(revert, { abi: GOSKO_PASS_ABI, functionName: 'mint', args: [], contractAddress: CONTRACT });
}

// simulovaný stav kontraktu
function mocks({ tokens = new Map(), writeImpl, receiptImpl } = {}) {
  const calls = { read: [], write: [], receipt: [] };
  const publicClient = {
    async readContract(p) { calls.read.push(p); return tokens.get(p.args[0]) ?? 0n; },
    async waitForTransactionReceipt(p) { calls.receipt.push(p); return receiptImpl ? receiptImpl(p) : { status: 'success', logs: [] }; },
  };
  const walletClient = {
    async writeContract(p) { calls.write.push(p); return writeImpl ? writeImpl(p) : TX; },
  };
  return { publicClient, walletClient, calls, tokens };
}

const env = (over = {}) => testEnv({ NFT_CONTRACT_ADDRESS: CONTRACT, NFT_CUSTODY_ADDRESS: CUSTODY, MINTER_PRIVATE_KEY: '', ...over });

test('ABI z kontraktu §4 sa sparsuje (funkcie, eventy, chyby)', () => {
  const names = GOSKO_PASS_ABI.map(x => `${x.type}:${x.name}`);
  for (const n of ['function:mint', 'function:setResult', 'function:tokenOfRegistration', 'function:passOf', 'function:locked', 'event:Minted', 'event:MetadataUpdate', 'error:AlreadyMinted']) {
    assert.ok(names.includes(n), n);
  }
});

test('kódovanie: keccak256(utf8(id)), kategórie 1 až 3', () => {
  assert.equal(encodeEventId('bratislava-2026-05'), '0x2a5e5f43ff8db6ce61206ff5875027a8539c5fdad766d944032ac2541b090a4d');
  assert.equal(encodeRegistrationKey(RID), keccak256(stringToBytes(RID)));
  assert.equal(categoryCode('open'), 1);
  assert.equal(categoryCode('u16'), 2);
  assert.equal(categoryCode('women'), 3);
  assert.throws(() => categoryCode('pro'));
});

test('bez NFT_CONTRACT_ADDRESS je chain vypnutý a nič nevolá', async () => {
  const m = mocks();
  const chain = createChain({ env: env({ NFT_CONTRACT_ADDRESS: '' }), ...m });
  assert.equal(chain.enabled, false);
  await assert.rejects(chain.mintPass({ registrationId: RID, eventId: 'e', riderRef: RIDER_REF, category: 'open' }), ChainDisabledError);
  assert.equal(m.calls.read.length + m.calls.write.length, 0);
});

test('mintPass: nový token, správne argumenty, tokenId z eventu Minted', async () => {
  const m = mocks({ receiptImpl: () => ({ status: 'success', logs: [mintedLog(7n, RID, 'ev-1')] }) });
  const chain = createChain({ env: env(), account: MINTER, ...m });
  const r = await chain.mintPass({ registrationId: RID, eventId: 'ev-1', riderRef: RIDER_REF, category: 'women' });
  assert.deepEqual(r, { tokenId: '7', txHash: TX, existing: false });
  assert.equal(m.calls.write.length, 1);
  const w = m.calls.write[0];
  assert.equal(w.functionName, 'mint');
  assert.equal(w.address, CONTRACT);
  assert.deepEqual(w.args, [CUSTODY, encodeRegistrationKey(RID), encodeEventId('ev-1'), RIDER_REF, 3]);
});

test('mintPass: bez custody adresy ide token na adresu mintera', async () => {
  const m = mocks({ receiptImpl: () => ({ status: 'success', logs: [mintedLog(1n, RID, 'e')] }) });
  const chain = createChain({ env: env({ NFT_CUSTODY_ADDRESS: '' }), account: MINTER, ...m });
  await chain.mintPass({ registrationId: RID, eventId: 'e', riderRef: RIDER_REF, category: 'open' });
  assert.equal(m.calls.write[0].args[0], MINTER.address);
});

test('mintPass je idempotentný: existujúci token sa vráti bez zápisu', async () => {
  const m = mocks({ tokens: new Map([[encodeRegistrationKey(RID), 4n]]) });
  const chain = createChain({ env: env(), account: MINTER, ...m });
  const r = await chain.mintPass({ registrationId: RID, eventId: 'e', riderRef: RIDER_REF, category: 'open' });
  assert.deepEqual(r, { tokenId: '4', txHash: null, existing: true });
  assert.equal(m.calls.write.length, 0);
});

test('mintPass: timeout po odoslaní a opakovanie nevyrobí druhý token', async () => {
  const tokens = new Map();
  const m = mocks({
    tokens,
    writeImpl: () => { tokens.set(encodeRegistrationKey(RID), 9n); return TX; }, // transakcia prešla
    receiptImpl: ({ hash }) => { throw new WaitForTransactionReceiptTimeoutError({ hash }); },
  });
  const chain = createChain({ env: env(), account: MINTER, ...m });
  await assert.rejects(chain.mintPass({ registrationId: RID, eventId: 'e', riderRef: RIDER_REF, category: 'open' }));
  const again = await chain.mintPass({ registrationId: RID, eventId: 'e', riderRef: RIDER_REF, category: 'open' });
  assert.deepEqual(again, { tokenId: '9', txHash: null, existing: true });
  assert.equal(m.calls.write.length, 1, 'mint sa odoslal len raz');
});

test('mintPass: revert AlreadyMinted (súbeh) vráti existujúci token', async () => {
  const tokens = new Map();
  const m = mocks({ tokens, writeImpl: () => { tokens.set(encodeRegistrationKey(RID), 2n); throw alreadyMintedError(); } });
  const chain = createChain({ env: env(), account: MINTER, ...m });
  const r = await chain.mintPass({ registrationId: RID, eventId: 'e', riderRef: RIDER_REF, category: 'u16' });
  assert.deepEqual(r, { tokenId: '2', txHash: null, existing: true });
});

test('revertName rozpozná AlreadyMinted', () => {
  assert.equal(revertName(alreadyMintedError()), 'AlreadyMinted');
  assert.equal(revertName(new Error('nonce too low')), null);
});

test('mintPass: reverted receipt bez tokenu vyhodí chybu', async () => {
  const m = mocks({ receiptImpl: () => ({ status: 'reverted', logs: [] }) });
  const chain = createChain({ env: env(), account: MINTER, ...m });
  await assert.rejects(chain.mintPass({ registrationId: RID, eventId: 'e', riderRef: RIDER_REF, category: 'open' }), /revert/);
});

test('mintPass: bez eventu Minted sa tokenId dočíta z tokenOfRegistration', async () => {
  const tokens = new Map();
  const m = mocks({ tokens, writeImpl: () => { tokens.set(encodeRegistrationKey(RID), 12n); return TX; } });
  const chain = createChain({ env: env(), account: MINTER, ...m });
  const r = await chain.mintPass({ registrationId: RID, eventId: 'e', riderRef: RIDER_REF, category: 'open' });
  assert.equal(r.tokenId, '12');
});

test('mintPass: neplatný rider_ref sa odmietne pred zápisom', async () => {
  const m = mocks();
  const chain = createChain({ env: env(), account: MINTER, ...m });
  await assert.rejects(chain.mintPass({ registrationId: RID, eventId: 'e', riderRef: '0x1234', category: 'open' }), /rider_ref/);
  assert.equal(m.calls.write.length, 0);
});

test('setPassResult: setResult(tokenId, placement, points)', async () => {
  const m = mocks();
  const chain = createChain({ env: env(), account: MINTER, ...m });
  assert.deepEqual(await chain.setPassResult({ tokenId: '5', placement: 2, points: 80 }), { txHash: TX });
  assert.equal(m.calls.write[0].functionName, 'setResult');
  assert.deepEqual(m.calls.write[0].args, [5n, 2, 80]);
  await assert.rejects(chain.setPassResult({ tokenId: '5', placement: -1, points: 80 }));
  await assert.rejects(chain.setPassResult({ tokenId: '0', placement: 1, points: 80 }));
});

test('ABI obsahuje vlastné chyby kontraktu (UnknownToken, EnforcedPause, AccessControl)', () => {
  const errs = GOSKO_PASS_ABI.filter(x => x.type === 'error').map(x => x.name);
  for (const n of ['AlreadyMinted', 'AlreadyClaimed', 'Soulbound', 'InvalidCategory', 'UnknownToken', 'EnforcedPause', 'AccessControlUnauthorizedAccount', 'ERC721NonexistentToken']) {
    assert.ok(errs.includes(n), n);
  }
});

test('ABI sedí so skompilovaným chain/abi/GoskoPass.json (ak existuje)', async (t) => {
  const { readFile } = await import('node:fs/promises');
  let compiled;
  try { compiled = JSON.parse(await readFile(new URL('../../../chain/abi/GoskoPass.json', import.meta.url), 'utf8')); } catch { t.skip('chain/abi/GoskoPass.json chýba'); return; }
  const abi = Array.isArray(compiled) ? compiled : compiled.abi;
  const sig = x => `${x.type}:${x.name}(${(x.inputs || []).map(i => i.type === 'tuple' ? `(${i.components.map(c => c.type).join(',')})` : i.type).join(',')})`;
  const theirs = new Set(abi.map(sig));
  for (const item of GOSKO_PASS_ABI) assert.ok(theirs.has(sig(item)), `chýba v skompilovanom ABI: ${sig(item)}`);
});

test('claimPass odmietne custody, minter, nulovú aj kontraktovú adresu bez zápisu', async () => {
  const m = mocks();
  const chain = createChain({ env: env(), account: MINTER, ...m });
  for (const to of [CUSTODY, CUSTODY.toLowerCase(), MINTER.address, CONTRACT, '0x0000000000000000000000000000000000000000', 'zla']) {
    await assert.rejects(chain.claimPass({ tokenId: '3', to }), /zakázaný|Neplatná/);
  }
  assert.equal(m.calls.write.length, 0);
  const wallet = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';
  assert.deepEqual(await chain.claimPass({ tokenId: '3', to: wallet }), { txHash: TX });
  assert.deepEqual(m.calls.write[0].args, [3n, wallet]);
});

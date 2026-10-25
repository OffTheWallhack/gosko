// GoskoPass cez viem (kontrakt §4). Idempotentný mint: pred zápisom sa vždy pozrie
// tokenOfRegistration, takže opakovanie po timeoute nevyrobí druhý token.
// Bez NFT_CONTRACT_ADDRESS je služba vypnutá a nič nevolá.
import {
  BaseError,
  ContractFunctionRevertedError,
  createPublicClient,
  createWalletClient,
  defineChain,
  getAddress,
  http,
  keccak256,
  parseAbi,
  parseEventLogs,
  stringToBytes,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

export const GOSKO_PASS_ABI = parseAbi([
  'function mint(address to, bytes32 registrationKey, bytes32 eventId, bytes32 riderRef, uint8 category) returns (uint256)',
  'function setResult(uint256 tokenId, uint16 placement, uint16 points)',
  'function revoke(uint256 tokenId)',
  'function claim(uint256 tokenId, address to)',
  'function tokenOfRegistration(bytes32 registrationKey) view returns (uint256)',
  'function passOf(uint256 tokenId) view returns ((bytes32 eventId, bytes32 riderRef, uint8 category, uint16 placement, uint16 points, bool claimed))',
  'function locked(uint256 tokenId) view returns (bool)',
  'function setBaseURI(string uri)',
  'function tokenURI(uint256 tokenId) view returns (string)',
  'event Minted(uint256 indexed tokenId, bytes32 indexed registrationKey, bytes32 indexed eventId)',
  'event ResultSet(uint256 indexed tokenId, uint16 placement, uint16 points)',
  'event Claimed(uint256 indexed tokenId, address to)',
  'event Locked(uint256 tokenId)',
  'event MetadataUpdate(uint256 _tokenId)',
  'event BatchMetadataUpdate(uint256 _fromTokenId, uint256 _toTokenId)',
  // chyby kontraktu (chain/abi/GoskoPass.json), aby viem vedel dekódovať revert
  'error AlreadyMinted()',
  'error AlreadyClaimed()',
  'error Soulbound()',
  'error InvalidCategory()',
  'error UnknownToken()',
  'error EnforcedPause()',
  'error AccessControlUnauthorizedAccount(address account, bytes32 neededRole)',
  'error ERC721NonexistentToken(uint256 tokenId)',
]);

export const CATEGORY_CODE = Object.freeze({ open: 1, u16: 2, women: 3 });

export function categoryCode(category) {
  const c = CATEGORY_CODE[category];
  if (!c) throw new Error(`Neznáma kategória: ${category}`);
  return c;
}

export const encodeRegistrationKey = registrationId => keccak256(stringToBytes(String(registrationId)));
export const encodeEventId = eventId => keccak256(stringToBytes(String(eventId)));

export function encodeRiderRef(riderRef) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(String(riderRef))) throw new Error('rider_ref musí byť 0x + 64 hex znakov');
  return String(riderRef).toLowerCase();
}

export class ChainError extends Error {
  constructor(message, txHash = null) {
    super(message);
    this.name = 'ChainError';
    this.txHash = txHash;
  }
}

export class ChainDisabledError extends Error {
  constructor() {
    super('NFT je vypnuté (NFT_CONTRACT_ADDRESS je prázdne).');
    this.name = 'ChainDisabledError';
  }
}

export function revertName(err) {
  if (err instanceof BaseError) {
    const r = err.walk(e => e instanceof ContractFunctionRevertedError);
    if (r?.data?.errorName) return r.data.errorName;
  }
  const m = /\b(AlreadyMinted|AlreadyClaimed|Soulbound|InvalidCategory|UnknownToken|EnforcedPause|AccessControlUnauthorizedAccount)\b/.exec(String(err?.message ?? ''));
  return m ? m[1] : null;
}

export function chainFor(env) {
  const names = { 8453: 'Base', 84532: 'Base Sepolia', 31337: 'Hardhat' };
  return defineChain({
    id: env.CHAIN_ID,
    name: names[env.CHAIN_ID] || `Chain ${env.CHAIN_ID}`,
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [env.RPC_URL] } },
  });
}

const DISABLED = Object.freeze({
  enabled: false,
  address: null,
  async readTokenOfRegistration() { throw new ChainDisabledError(); },
  async mintPass() { throw new ChainDisabledError(); },
  async setPassResult() { throw new ChainDisabledError(); },
  async claimPass() { throw new ChainDisabledError(); },
});

const isUint16 = n => Number.isInteger(n) && n >= 0 && n <= 65535;

/**
 * @param {{env: object, publicClient?: object, walletClient?: object, account?: object, receiptTimeoutMs?: number}} cfg
 *   publicClient/walletClient/account sa dajú v testoch nahradiť.
 */
export function createChain({ env, publicClient, walletClient, account, receiptTimeoutMs = 20_000 }) {
  if (!env.NFT_CONTRACT_ADDRESS) return DISABLED;

  let ctx = null;
  // Klienti vznikajú až pri prvom použití: import modulu nesmie padnúť na zlom kľúči.
  function c() {
    if (ctx) return ctx;
    const address = getAddress(env.NFT_CONTRACT_ADDRESS);
    const chain = chainFor(env);
    const acct = account || (walletClient?.account) || privateKeyToAccount(env.MINTER_PRIVATE_KEY);
    const transport = http(env.RPC_URL, { timeout: 15_000, retryCount: 1 });
    ctx = {
      address,
      chain,
      account: acct,
      publicClient: publicClient || createPublicClient({ chain, transport }),
      walletClient: walletClient || createWalletClient({ account: acct, chain, transport }),
      custody: env.NFT_CUSTODY_ADDRESS ? getAddress(env.NFT_CUSTODY_ADDRESS) : acct.address,
    };
    return ctx;
  }

  async function readTokenOfRegistration(registrationId) {
    const { publicClient: pc, address } = c();
    const id = await pc.readContract({
      address,
      abi: GOSKO_PASS_ABI,
      functionName: 'tokenOfRegistration',
      args: [encodeRegistrationKey(registrationId)],
    });
    return BigInt(id);
  }

  async function waitOk(hash) {
    const { publicClient: pc } = c();
    const receipt = await pc.waitForTransactionReceipt({ hash, timeout: receiptTimeoutMs });
    return receipt;
  }

  async function mintPass({ registrationId, eventId, riderRef, category }) {
    const key = encodeRegistrationKey(registrationId);
    const args = [null, key, encodeEventId(eventId), encodeRiderRef(riderRef), categoryCode(category)];

    const before = await readTokenOfRegistration(registrationId);
    if (before > 0n) return { tokenId: before.toString(), txHash: null, existing: true };

    const { walletClient: wc, address, chain, account: acct, custody } = c();
    args[0] = custody;
    let hash;
    try {
      hash = await wc.writeContract({ address, abi: GOSKO_PASS_ABI, functionName: 'mint', args, account: acct, chain });
    } catch (err) {
      if (revertName(err) === 'AlreadyMinted') {
        const t = await readTokenOfRegistration(registrationId);
        if (t > 0n) return { tokenId: t.toString(), txHash: null, existing: true };
      }
      throw err;
    }

    const receipt = await waitOk(hash);
    if (receipt.status !== 'success') {
      // súbežný mint mohol prejsť skôr: potom je token už na chaine
      const t = await readTokenOfRegistration(registrationId);
      if (t > 0n) return { tokenId: t.toString(), txHash: null, existing: true };
      throw new ChainError('Mint transakcia skončila revertom.', hash);
    }
    let tokenId = null;
    try {
      const logs = parseEventLogs({ abi: GOSKO_PASS_ABI, logs: receipt.logs || [], eventName: 'Minted' });
      const mine = logs.find(l => String(l.args.registrationKey).toLowerCase() === key.toLowerCase()
        && (!l.address || l.address.toLowerCase() === address.toLowerCase()));
      if (mine) tokenId = BigInt(mine.args.tokenId);
    } catch { /* nižšie fallback */ }
    if (!tokenId) tokenId = await readTokenOfRegistration(registrationId);
    if (!tokenId || tokenId === 0n) throw new ChainError('Mint prebehol, ale token sa na chaine nenašiel.', hash);
    return { tokenId: tokenId.toString(), txHash: hash, existing: false };
  }

  async function setPassResult({ tokenId, placement, points }) {
    if (!isUint16(placement) || !isUint16(points)) throw new ChainError('Umiestnenie a body musia byť celé čísla 0 až 65535.');
    const id = BigInt(tokenId);
    if (id <= 0n) throw new ChainError('Neplatné tokenId.');
    const { walletClient: wc, address, chain, account: acct } = c();
    const hash = await wc.writeContract({ address, abi: GOSKO_PASS_ABI, functionName: 'setResult', args: [id, placement, points], account: acct, chain });
    const receipt = await waitOk(hash);
    if (receipt.status !== 'success') throw new ChainError('setResult skončil revertom.', hash);
    return { txHash: hash };
  }

  // Prevzatie do vlastnej peňaženky (fáza 2). claim je jednorazový: claim na custody
  // adresu by ho spálil bez presunu tokenu, preto sa odmietne ešte pred zápisom.
  async function claimPass({ tokenId, to }) {
    const id = BigInt(tokenId);
    if (id <= 0n) throw new ChainError('Neplatné tokenId.');
    if (!/^0x[0-9a-fA-F]{40}$/.test(String(to))) throw new ChainError('Neplatná cieľová adresa.');
    const { walletClient: wc, address, chain, account: acct, custody } = c();
    const target = getAddress(to);
    const blocked = [custody, acct.address, address, '0x0000000000000000000000000000000000000000'].map(a => String(a).toLowerCase());
    if (blocked.includes(target.toLowerCase())) throw new ChainError('claim na správcovskú, minter, nulovú alebo kontraktovú adresu je zakázaný.');
    const hash = await wc.writeContract({ address, abi: GOSKO_PASS_ABI, functionName: 'claim', args: [id, target], account: acct, chain });
    const receipt = await waitOk(hash);
    if (receipt.status !== 'success') throw new ChainError('claim skončil revertom.', hash);
    return { txHash: hash };
  }

  return {
    enabled: true,
    get address() { return c().address; },
    readTokenOfRegistration,
    mintPass,
    setPassResult,
    claimPass,
  };
}

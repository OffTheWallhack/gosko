// GoskoLoot (chain/contracts/GoskoLoot.sol) cez viem: soulbound ERC-1155 odmeny z hry Ghoskate.
// Jeden claim z DB (loot_claims.id) = jeden kus, claimRef = keccak256(utf8(claim_id)). Na chaine nie sú
// osobné údaje. Kus ide na custody adresu (NFT_CUSTODY_ADDRESS, inak minter), peňaženky hráčov zatiaľ nie sú.
// Bez LOOT_CONTRACT_ADDRESS je služba vypnutá a nič nevolá. Pred zápisom sa pozrie holderOfClaim,
// takže opakovanie po timeoute nevyrobí druhý kus.
import { createPublicClient, createWalletClient, getAddress, http, keccak256, parseAbi, stringToBytes } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { ChainError, chainFor, revertName } from './chain.js';

export const GOSKO_LOOT_ABI = parseAbi([
  'function mint(address to, uint256 id, bytes32 claimRef)',
  'function revoke(bytes32 claimRef)',
  'function holderOfClaim(bytes32 claimRef) view returns (address)',
  'function typeOfClaim(bytes32 claimRef) view returns (uint256)',
  'function typeEnabled(uint256 id) view returns (bool)',
  'function balanceOf(address account, uint256 id) view returns (uint256)',
  'function uri(uint256 id) view returns (string)',
  'event LootMinted(address indexed to, uint256 indexed id, bytes32 indexed claimRef)',
  'error AlreadyMinted()',
  'error UnknownClaim()',
  'error TypeDisabled()',
  'error ZeroAddress()',
  'error Soulbound()',
  'error EnforcedPause()',
  'error AccessControlUnauthorizedAccount(address account, bytes32 neededRole)',
]);

export const encodeClaimRef = claimId => keccak256(stringToBytes(String(claimId)));
const ZERO = '0x0000000000000000000000000000000000000000';

const DISABLED = Object.freeze({ enabled: false, address: null, async mintLoot() { throw new ChainError('GoskoLoot je vypnutý (LOOT_CONTRACT_ADDRESS je prázdne).'); } });

export function createLootChain({ env, publicClient, walletClient, account, receiptTimeoutMs = 20_000 }) {
  if (!env.LOOT_CONTRACT_ADDRESS) return DISABLED;
  let ctx = null;
  function c() {
    if (ctx) return ctx;
    const chain = chainFor(env);
    const acct = account || walletClient?.account || privateKeyToAccount(env.MINTER_PRIVATE_KEY);
    const transport = http(env.RPC_URL, { timeout: 15_000, retryCount: 1 });
    ctx = {
      address: getAddress(env.LOOT_CONTRACT_ADDRESS), chain, account: acct,
      publicClient: publicClient || createPublicClient({ chain, transport }),
      walletClient: walletClient || createWalletClient({ account: acct, chain, transport }),
      custody: env.NFT_CUSTODY_ADDRESS ? getAddress(env.NFT_CUSTODY_ADDRESS) : acct.address,
    };
    return ctx;
  }
  const holderOf = async claimId => {
    const { publicClient: pc, address } = c();
    return pc.readContract({ address, abi: GOSKO_LOOT_ABI, functionName: 'holderOfClaim', args: [encodeClaimRef(claimId)] });
  };

  /** Vydá kus typu tokenType pre claim. { txHash, existing } */
  async function mintLoot({ claimId, tokenType }) {
    const type = BigInt(tokenType);
    if (type < 1n || type > 255n) throw new ChainError('Neplatný typ GoskoLoot.');
    if ((await holderOf(claimId)).toLowerCase() !== ZERO) return { txHash: null, existing: true };
    const { walletClient: wc, publicClient: pc, address, chain, account: acct, custody } = c();
    let hash;
    try {
      hash = await wc.writeContract({ address, abi: GOSKO_LOOT_ABI, functionName: 'mint', args: [custody, type, encodeClaimRef(claimId)], account: acct, chain });
    } catch (err) {
      if (revertName(err) === 'AlreadyMinted') return { txHash: null, existing: true };
      throw err;
    }
    const receipt = await pc.waitForTransactionReceipt({ hash, timeout: receiptTimeoutMs });
    if (receipt.status !== 'success') {
      if ((await holderOf(claimId)).toLowerCase() !== ZERO) return { txHash: null, existing: true };
      throw new ChainError('Mint GoskoLoot skončil revertom.', hash);
    }
    return { txHash: hash, existing: false };
  }

  return { enabled: true, get address() { return c().address; }, mintLoot, holderOf };
}

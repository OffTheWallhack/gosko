// POST /api/game/loot-nft {drop_id}: GoskoLoot NFT za vlastný claim loot dropu (plán Task 6).
// Mint iba keď: LOOT_CONTRACT_ADDRESS je nastavená (inak status 'disabled'), drop má nft_type
// (inak 'no_nft') a hráč dal súhlas s NFT (players.nft_consent_at, 018; inak 'no_consent').
// Kus ide na custody adresu, na chaine je len claimRef = keccak256(claim_id), žiadne osobné údaje.
// Idempotentné: hotový mint sa neopakuje, chyba chainu sa zapíše ako 'failed' a ďalší pokus ju dorobí.
import { baseDeps } from '../_lib/deps.js';
import { ApiError, allowMethods, readJson, send, sendError } from '../_lib/http.js';
import { eq } from '../_lib/db.js';
import { isUuid } from '../_lib/validate.js';
import { rateLimitHit } from '../_lib/ratelimit.js';
import { createLootChain } from '../_lib/lootchain.js';

const errText = err => String(err?.shortMessage || err?.message || err || 'neznáma chyba').slice(0, 500);

export function createHandler(deps) {
  const { env, db, auth } = deps;
  const log = deps.log || console;
  const now = deps.now || (() => new Date());
  const chain = deps.lootChain || createLootChain({ env });
  const stamp = () => now().toISOString();

  async function mint(claim, tokenType) {
    let row = await db.selectOne('loot_nft', { claim_id: eq(claim.id) });
    if (row?.status === 'minted') return { status: 'minted' };
    const attempts = (row?.attempts || 0) + 1;
    const base = { chain_id: env.CHAIN_ID, contract: String(chain.address).toLowerCase(), token_type: tokenType, status: 'pending', attempts, error: null, updated_at: stamp() };
    if (row) await db.update('loot_nft', { claim_id: eq(claim.id) }, base);
    else [row] = await db.insert('loot_nft', { claim_id: claim.id, ...base });
    try {
      const out = await chain.mintLoot({ claimId: claim.id, tokenType });
      await db.update('loot_nft', { claim_id: eq(claim.id) }, { status: 'minted', tx_hash: out.txHash, updated_at: stamp() });
      return { status: 'minted' };
    } catch (err) {
      log.warn('[loot-nft] mint zlyhal', claim.id, errText(err));
      await db.update('loot_nft', { claim_id: eq(claim.id) }, { status: 'failed', error: errText(err), updated_at: stamp() })
        .catch(e => log.error('[loot-nft] zápis stavu zlyhal', e?.message));
      return { status: 'failed' };
    }
  }

  return async function lootNft(req, res) {
    if (!allowMethods(req, res, ['POST'])) return;
    try {
      const user = await auth.requireUser(req);
      const body = await readJson(req);
      if (!isUuid(body.drop_id)) throw new ApiError(400, 'invalid_input', 'Chýba drop.');
      if (await rateLimitHit(db, `loot-nft:${user.userId}`, 10, 10)) throw new ApiError(429, 'rate_limited', 'Príliš veľa pokusov. Skús to o chvíľu.');
      const claim = await db.selectOne('loot_claims', { drop_id: eq(body.drop_id), player_id: eq(user.userId) }, { select: 'id,drop_id' });
      if (!claim) throw new ApiError(404, 'no_claim', 'Tento loot ešte nemáš.');
      const drop = await db.selectOne('loot_drops', { id: eq(claim.drop_id) }, { select: 'id,nft_type' });
      if (!drop?.nft_type) return send(res, 200, { ok: true, status: 'no_nft' });
      const player = await db.selectOne('players', { id: eq(user.userId) }, { select: 'id,nft_consent_at' });
      if (!player?.nft_consent_at) return send(res, 200, { ok: true, status: 'no_consent' });
      if (!chain.enabled) return send(res, 200, { ok: true, status: 'disabled' });
      send(res, 200, { ok: true, ...(await mint(claim, drop.nft_type)) });
    } catch (err) {
      sendError(res, err, log);
    }
  };
}

export default createHandler(baseDeps());

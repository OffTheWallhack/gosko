// GET /api/cron/nft-retry : Vercel cron s Authorization: Bearer ${CRON_SECRET}.
// Dorobí zlyhané a zaseknuté minty a čakajúce zápisy výsledkov.
import { createHash, timingSafeEqual } from 'node:crypto';
import { baseDeps } from '../_lib/deps.js';
import { allowMethods, bearerToken, send, sendError } from '../_lib/http.js';
import { createChain } from '../_lib/chain.js';
import { createNft } from '../_lib/nft.js';

const digest = s => createHash('sha256').update(String(s)).digest();

export function authorized(secret, token) {
  if (!secret || !token) return false;
  return timingSafeEqual(digest(secret), digest(token));
}

export function createHandler(deps) {
  const { env, db } = deps;
  const log = deps.log || console;
  const now = deps.now || (() => new Date());
  const nft = deps.nft || createNft({ env, db, chain: deps.chain, log, now });

  return async function nftRetry(req, res) {
    if (!allowMethods(req, res, ['GET'])) return;
    if (!authorized(env.CRON_SECRET, bearerToken(req))) {
      return send(res, 401, { ok: false, error: 'unauthorized', message: 'Chýba alebo nesedí CRON_SECRET.' });
    }
    try {
      const out = await nft.retryAll();
      send(res, 200, { ok: true, minted: out.minted, results: out.results, failed: out.failed });
    } catch (err) {
      sendError(res, err, log);
    }
  };
}

function defaultDeps() {
  const d = baseDeps();
  return { ...d, chain: createChain({ env: d.env }) };
}

export default createHandler(defaultDeps());

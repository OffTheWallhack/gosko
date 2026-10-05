#!/usr/bin/env node
// Dorobí NFT pre odbavené registrácie s nft_consent, ktoré ešte nemajú token (napr. zakladatelia
// po dodatočnom súhlase), a potom pošle výsledky na chain.
//
//   node scripts/backfill-mint.js [--dry-run] [--event <id>]
//
// Env ako API: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CHAIN_ID, RPC_URL,
// NFT_CONTRACT_ADDRESS, MINTER_PRIVATE_KEY, NFT_CUSTODY_ADDRESS.
// Idempotentné: ensureMinted pred mintom kontroluje tokenOfRegistration.
import { pathToFileURL } from 'node:url';
import { readEnv } from '../api/_lib/env.js';
import { createDb, eq, inList } from '../api/_lib/db.js';
import { createChain } from '../api/_lib/chain.js';
import { createNft } from '../api/_lib/nft.js';
import { isEventId } from '../api/_lib/validate.js';

const RETRYABLE = ['pending', 'failed'];

export function parseArgs(argv) {
  const opts = { dryRun: false, event: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--event') opts.event = argv[++i];
    else throw new Error(`Neznámy argument ${a}. Použitie: node scripts/backfill-mint.js [--dry-run] [--event ID]`);
  }
  if (opts.event !== null && !isEventId(opts.event)) throw new Error('--event má neplatné ID');
  return opts;
}

/** Registrácie, ktorým chýba token: checked_in + nft_consent a bez nft_tokens alebo v stave pending/failed. */
export async function findMissing(db, eventId = null) {
  const filters = { status: eq('checked_in'), nft_consent: eq(true) };
  if (eventId) filters.event_id = eq(eventId);
  const regs = await db.select('registrations', filters, { select: 'id,event_id,category,guardian_confirmed_at', order: 'created_at.asc' });
  if (!regs.length) return [];
  const tokens = await db.select('nft_tokens', { registration_id: inList(regs.map(r => r.id)) }, { select: 'registration_id,status,token_id' });
  const byReg = new Map(tokens.map(t => [t.registration_id, t]));
  return regs.filter(r => {
    if (r.category === 'u16' && !r.guardian_confirmed_at) return false; // bez súhlasu rodiča nie
    const t = byReg.get(r.id);
    return !t || (t.token_id == null && RETRYABLE.includes(t.status));
  });
}

export async function backfill({ db, nft, eventId = null, dryRun = false, log = console }) {
  const missing = await findMissing(db, eventId);
  const out = { candidates: missing.length, minted: 0, failed: 0, results: 0, resultsFailed: 0 };
  log.info(`${dryRun ? '[DRY RUN] ' : ''}Registrácie bez tokenu: ${missing.length}`);
  if (dryRun) {
    for (const r of missing) log.info(`  ${r.event_id} ${r.id} (${r.category})`);
    return out;
  }
  for (const r of missing) {
    const res = await nft.ensureMinted(r.id);
    if (res.status === 'failed') { out.failed += 1; log.info(`  CHYBA ${r.id}: ${res.error}`); }
    else if (res.tokenId) out.minted += 1;
  }
  const events = eventId ? [eventId] : [...new Set(missing.map(r => r.event_id))];
  for (const e of events) {
    const p = await nft.pushResults(e);
    out.results += p.updated;
    out.resultsFailed += p.failed;
  }
  log.info(`Zmintované: ${out.minted}, chyby: ${out.failed}, výsledky na chaine: ${out.results}, chyby výsledkov: ${out.resultsFailed}`);
  return out;
}

export async function main(argv, { env = readEnv(), db: injectedDb, chain: injectedChain, log = console } = {}) {
  const opts = parseArgs(argv);
  const db = injectedDb || createDb({ url: env.SUPABASE_REST_URL, key: env.SUPABASE_SERVICE_ROLE_KEY });
  const chain = injectedChain || createChain({ env });
  if (!chain.enabled && !opts.dryRun) throw new Error('NFT je vypnuté: nastav NFT_CONTRACT_ADDRESS, RPC_URL a MINTER_PRIVATE_KEY.');
  const nft = createNft({ env, db, chain, log });
  return backfill({ db, nft, eventId: opts.event, dryRun: opts.dryRun, log });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch(err => { console.error(err.message); process.exit(1); });
}

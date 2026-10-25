// Orchestrácia NFT nad DB (nft_tokens) a chainom. Žiadna funkcia nehádže volajúcemu:
// chyba sa zapíše ako status 'failed' (s error a attempts) a dorobí ju cron.
import { randomBytes } from 'node:crypto';
import { eq, inList, isUniqueViolation, lt, notNull } from './db.js';

export const MAX_ATTEMPTS = 10;
export const STUCK_PENDING_MINUTES = 5;
const DONE = ['minted', 'result_pending', 'result_set', 'revoked'];
// stavy, pri ktorých sa mint vôbec neskúša (nie sú to chyby chainu)
const SKIPPED = ['no_consent', 'guardian_pending', 'not_checked_in', 'not_found'];

// riderRef na chaine je náhodný pre každý token (006, nft_tokens.rider_ref): passy jedného jazdca
// sa podľa neho nedajú pospájať a po výmaze riadku nie je čím ich s jazdcom spojiť (audit M2).
const newRiderRef = () => `0x${randomBytes(32).toString('hex')}`;

const errText = err => String(err?.shortMessage || err?.message || err || 'neznáma chyba').slice(0, 500);

export function createNft({ env, db, chain, log = console, now = () => new Date() }) {
  const enabled = () => Boolean(chain && chain.enabled);
  const stamp = () => now().toISOString();

  async function safeUpdate(registrationId, patch, extraFilter = {}) {
    try {
      return await db.update('nft_tokens', { registration_id: eq(registrationId), ...extraFilter }, { ...patch, updated_at: stamp() });
    } catch (err) {
      log.error('[nft] zápis stavu zlyhal', registrationId, errText(err));
      return [];
    }
  }

  async function ensureRow(registrationId) {
    const found = await db.selectOne('nft_tokens', { registration_id: eq(registrationId) });
    if (found) return found;
    try {
      const [row] = await db.insert('nft_tokens', {
        registration_id: registrationId,
        chain_id: env.CHAIN_ID,
        contract: String(chain.address).toLowerCase(),
        rider_ref: newRiderRef(),
        status: 'pending',
        attempts: 0,
      });
      return row;
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      return db.selectOne('nft_tokens', { registration_id: eq(registrationId) });
    }
  }

  /**
   * Zabezpečí, že registrácia má token. Idempotentné: hotový token sa nemintuje znova
   * a chain.mintPass pred zápisom kontroluje tokenOfRegistration.
   * @returns {Promise<{status: string, tokenId?: string, txHash?: string|null, error?: string}>}
   */
  async function ensureMinted(registrationId) {
    if (!enabled()) return { status: 'disabled' };
    let row = null;
    try {
      const reg = await db.selectOne('registrations', { id: eq(registrationId) }, {
        select: 'id,rider_id,event_id,category,status,nft_consent,guardian_confirmed_at',
      });
      if (!reg) return { status: 'not_found' };
      if (!reg.nft_consent) return { status: 'no_consent' };
      if (reg.category === 'u16' && !reg.guardian_confirmed_at) return { status: 'guardian_pending' };
      if (reg.status !== 'checked_in') return { status: 'not_checked_in' };

      row = await ensureRow(registrationId);
      if (DONE.includes(row.status)) return { status: row.status, tokenId: row.token_id == null ? undefined : String(row.token_id) };

      // riadok spred 006 nemá rider_ref: dostane ho pred prvým mintom, opakovanie použije ten istý
      const riderRef = row.rider_ref || newRiderRef();
      const attempts = (row.attempts || 0) + 1;
      await safeUpdate(registrationId, { status: 'pending', attempts, ...(row.rider_ref ? {} : { rider_ref: riderRef }) });

      let minted;
      try {
        minted = await chain.mintPass({ registrationId, eventId: reg.event_id, riderRef, category: reg.category });
      } catch (err) {
        log.warn('[nft] mint zlyhal', registrationId, errText(err));
        await safeUpdate(registrationId, { status: 'failed', error: errText(err), attempts });
        return { status: 'failed', error: errText(err) };
      }
      // výsledok mohol byť uložený skôr ako mint: potom ho cron pošle na chain
      const result = await db.selectOne('event_results', { registration_id: eq(registrationId) }, { select: 'place' }).catch(() => null);
      const status = result ? 'result_pending' : 'minted';
      await safeUpdate(registrationId, {
        status,
        token_id: minted.tokenId,
        mint_tx: minted.txHash ?? row.mint_tx ?? null,
        error: null,
        attempts: 0,
      });
      return { status, tokenId: minted.tokenId, txHash: minted.txHash ?? null };
    } catch (err) {
      log.error('[nft] ensureMinted', registrationId, errText(err));
      if (row && (row.status === 'pending' || row.status === 'failed')) {
        await safeUpdate(registrationId, { status: 'failed', error: errText(err), attempts: (row.attempts || 0) + 1 });
      }
      return { status: 'failed', error: errText(err) };
    }
  }

  // Pošle jeden výsledok na chain; result null = výsledok zmizol, na chaine sa vynuluje (0, 0).
  // Pri chybe status 'failed'.
  async function pushOne(tok, result) {
    const attempts = (tok.attempts || 0) + 1;
    const placement = result ? Number(result.place) : 0;
    const points = result ? Number(result.points) : 0;
    try {
      if (tok.token_id == null) throw new Error('Token nemá tokenId.');
      const { txHash } = await chain.setPassResult({ tokenId: String(tok.token_id), placement, points });
      // kým sme zapisovali, mohli prísť nové výsledky: potom ostane result_pending
      const fresh = await db.selectOne('event_results', { registration_id: eq(tok.registration_id) }, { select: 'place,points' }).catch(() => null);
      const same = fresh ? Number(fresh.place) === placement && Number(fresh.points) === points : !result;
      const status = !same ? 'result_pending' : result ? 'result_set' : 'minted';
      await safeUpdate(tok.registration_id, { status, result_tx: txHash, error: null, attempts: 0 });
      return true;
    } catch (err) {
      log.warn('[nft] setResult zlyhal', tok.registration_id, errText(err));
      await safeUpdate(tok.registration_id, { status: 'failed', error: errText(err), attempts });
      return false;
    }
  }

  async function pushPending(tokens) {
    const out = { updated: 0, failed: 0 };
    if (!tokens.length) return out;
    const results = await db.select('event_results', { registration_id: inList(tokens.map(t => t.registration_id)) }, { select: 'registration_id,place,points' });
    const byReg = new Map(results.map(r => [r.registration_id, r]));
    for (const tok of tokens) {
      // bez výsledku (vymazaný z kategórie) sa výsledok na chaine vynuluje
      if (await pushOne(tok, byReg.get(tok.registration_id) || null)) out.updated += 1; else out.failed += 1;
    }
    return out;
  }

  /**
   * Po uložení výsledkov eventu pošle setResult pre každý token v stave result_pending.
   * Patria sem aj tokeny jazdcov, ktorých výsledok sa zmazal (save_results z 005 ich označí).
   */
  async function pushResults(eventId) {
    if (!enabled()) return { updated: 0, failed: 0 };
    try {
      const [results, regs] = await Promise.all([
        db.select('event_results', { event_id: eq(eventId), registration_id: notNull }, { select: 'registration_id' }),
        db.select('registrations', { event_id: eq(eventId) }, { select: 'id' }),
      ]);
      const ids = [...new Set([...results.map(r => r.registration_id), ...regs.map(r => r.id)])];
      if (!ids.length) return { updated: 0, failed: 0 };
      const tokens = await db.select('nft_tokens', {
        registration_id: inList(ids),
        status: eq('result_pending'),
      }, { select: 'registration_id,token_id,status,attempts' });
      return await pushPending(tokens);
    } catch (err) {
      log.error('[nft] pushResults', eventId, errText(err));
      return { updated: 0, failed: 0, error: errText(err) };
    }
  }

  /** Cron: dorobí zlyhané a zaseknuté minty, potom čakajúce výsledky. */
  async function retryAll({ limit = 25 } = {}) {
    const out = { minted: 0, results: 0, failed: 0 };
    if (!enabled()) return out;
    try {
      const stuckBefore = new Date(now().getTime() - STUCK_PENDING_MINUTES * 60_000).toISOString();
      const sel = { select: 'registration_id,token_id,status,attempts', order: 'updated_at.asc', limit };
      const failed = await db.select('nft_tokens', { status: eq('failed'), attempts: lt(MAX_ATTEMPTS) }, sel);
      const stuck = await db.select('nft_tokens', { status: eq('pending'), updated_at: lt(stuckBefore) }, sel);
      for (const tok of [...failed, ...stuck]) {
        const r = await ensureMinted(tok.registration_id);
        if (r.status === 'failed') out.failed += 1;
        else if (SKIPPED.includes(r.status)) {
          // posunie riadok na koniec poradia a po MAX_ATTEMPTS ho cron prestane skúšať
          await safeUpdate(tok.registration_id, { status: 'failed', error: `preskočené: ${r.status}`, attempts: (tok.attempts || 0) + 1 });
        } else if (tok.token_id == null) out.minted += 1;
      }
      const pending = await db.select('nft_tokens', { status: eq('result_pending') }, sel);
      const pushed = await pushPending(pending);
      out.results += pushed.updated;
      out.failed += pushed.failed;
    } catch (err) {
      log.error('[nft] retryAll', errText(err));
      out.error = errText(err);
    }
    return out;
  }

  return { enabled: enabled(), ensureMinted, pushResults, retryAll };
}

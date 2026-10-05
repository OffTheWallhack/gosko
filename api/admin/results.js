// POST /api/admin/results (kontrakt §3). Bearer admin; {event_id, category, rows:[{registration_id?, rider_name, place}]}.
// Uloží výsledky jednou transakciou (RPC save_results), potom pošle setResult pre tokeny result_pending.
import { baseDeps } from '../_lib/deps.js';
import { ApiError, allowMethods, readJson, send, sendError } from '../_lib/http.js';
import { eq, inList } from '../_lib/db.js';
import { CATEGORIES, isEventId, isUuid } from '../_lib/validate.js';
import { createChain } from '../_lib/chain.js';
import { createNft } from '../_lib/nft.js';
import { loadEvent, riderPublicName } from '../_lib/passview.js';

const MAX_ROWS = 256;

function parseRows(rows) {
  if (!Array.isArray(rows) || rows.length > MAX_ROWS) {
    throw new ApiError(400, 'invalid_input', `Výsledky musia byť zoznam s najviac ${MAX_ROWS} riadkami.`);
  }
  const errors = {};
  const names = new Set();
  const regs = new Set();
  const out = rows.map((row, i) => {
    const r = row && typeof row === 'object' ? row : {};
    const registration_id = r.registration_id === undefined || r.registration_id === null || r.registration_id === '' ? null : r.registration_id;
    const rider_name = typeof r.rider_name === 'string' ? r.rider_name.normalize('NFC').replace(/\s+/g, ' ').trim() : '';
    const place = r.place;
    if (registration_id !== null && !isUuid(registration_id)) errors[`rows.${i}.registration_id`] = 'Neplatné ID registrácie.';
    if (!Number.isInteger(place) || place < 1 || place > 200) errors[`rows.${i}.place`] = 'Umiestnenie musí byť celé číslo 1 až 200.';
    if (rider_name.length > 60 || (!rider_name && registration_id === null)) errors[`rows.${i}.rider_name`] = 'Meno jazdca musí mať 1 až 60 znakov.';
    if (rider_name) {
      const key = rider_name.toLowerCase();
      if (names.has(key)) errors[`rows.${i}.rider_name`] = 'Meno je vo výsledkoch dvakrát.';
      names.add(key);
    }
    if (registration_id) {
      if (regs.has(registration_id)) errors[`rows.${i}.registration_id`] = 'Registrácia je vo výsledkoch dvakrát.';
      regs.add(registration_id);
    }
    return { registration_id, rider_name, place };
  });
  if (Object.keys(errors).length) throw new ApiError(400, 'invalid_input', 'Skontroluj výsledky.', { errors });
  return out;
}

export function createHandler(deps) {
  const { env, db, auth } = deps;
  const log = deps.log || console;
  const now = deps.now || (() => new Date());
  const nft = deps.nft || createNft({ env, db, chain: deps.chain, log, now });

  return async function results(req, res) {
    if (!allowMethods(req, res, ['POST'])) return;
    try {
      const { userId } = await auth.requireAdmin(req);
      const body = await readJson(req);
      if (!isEventId(body.event_id)) throw new ApiError(400, 'invalid_input', 'Vyber event.');
      if (!CATEGORIES.includes(body.category)) throw new ApiError(400, 'invalid_input', 'Kategória musí byť open, u16 alebo women.');
      const rows = parseRows(body.rows);

      const event = await loadEvent(db, body.event_id);
      if (!event) throw new ApiError(404, 'event_not_found', 'Tento event sme nenašli.');

      const ids = rows.filter(r => r.registration_id).map(r => r.registration_id);
      if (ids.length) {
        const regs = await db.select('registrations', { id: inList(ids) }, { select: 'id,event_id,rider_id,status' });
        const byId = new Map(regs.map(r => [r.id, r]));
        const errors = {};
        rows.forEach((r, i) => {
          if (!r.registration_id) return;
          const reg = byId.get(r.registration_id);
          if (!reg || reg.event_id !== event.id) errors[`rows.${i}.registration_id`] = 'Registrácia nepatrí k tomuto eventu.';
          else if (reg.status === 'cancelled') errors[`rows.${i}.registration_id`] = 'Registrácia je zrušená.';
        });
        if (Object.keys(errors).length) throw new ApiError(400, 'invalid_input', 'Skontroluj výsledky.', { errors });
        // chýbajúce meno doplní verejné meno jazdca
        const missing = rows.filter(r => r.registration_id && !r.rider_name);
        if (missing.length) {
          const riderIds = [...new Set(missing.map(r => byId.get(r.registration_id).rider_id))];
          const riders = await db.select('riders', { id: inList(riderIds) }, { select: 'id,display_name,nickname,public_name_mode' });
          const rmap = new Map(riders.map(r => [r.id, r]));
          for (const r of missing) r.rider_name = riderPublicName(rmap.get(byId.get(r.registration_id).rider_id)).slice(0, 60) || 'Jazdec';
        }
      }

      let saved;
      try {
        saved = await db.rpc('save_results', { p_event_id: event.id, p_category: body.category, p_rows: rows, p_actor: userId });
      } catch (err) {
        // mapovanie chýb save_results (003): PT404 -> 404, 23503/23505 -> 409, 22023/23514/23502/22P02 -> 400
        const detail = { detail: String(err?.message || '').slice(0, 300) };
        if (err?.status === 404) throw new ApiError(404, 'event_not_found', 'Tento event sme nenašli.');
        if (err?.status === 409) throw new ApiError(409, 'conflict', 'Výsledky sa nepodarilo uložiť: neznáma registrácia alebo duplicitný riadok.', detail);
        if (Number.isInteger(err?.status) && err.status >= 400 && err.status < 500) {
          throw new ApiError(400, 'invalid_input', 'Výsledky sa nepodarilo uložiť. Skontroluj riadky.', detail);
        }
        throw err;
      }

      const pushed = await nft.pushResults(event.id);
      send(res, 200, {
        ok: true,
        saved: Number.isInteger(saved) ? saved : rows.length,
        nft_updates: pushed.updated,
        nft_failed: pushed.failed,
      });
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

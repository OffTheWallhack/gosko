// Loot dropy hry Ghoskate (plán Task 6). Bearer admin.
//   GET   /api/admin/loot                    -> { drops: [...] } aj vypnuté, s tiermi a počtom claimov, bez kódov
//   POST  /api/admin/loot {spot_id, title, description?, partner?, starts_at?, ends_at?, nft_type?, tiers:[{label, up_to, reward?, code, gear_id?}]}
//   PATCH /api/admin/loot {id, active}
// Zápis ide cez RPC admin_create_loot_drop (018) ako service_role: drop, tiery a kódy vzniknú naraz.
// Kódy odmien sa po uložení už nikdy nevracajú (ani adminovi). Bez peňažných výhier a vstupného (zákon 30/2019).
import { baseDeps } from '../_lib/deps.js';
import { ApiError, allowMethods, readJson, send, sendError } from '../_lib/http.js';
import { isUuid } from '../_lib/validate.js';

const clean = v => (typeof v === 'string' ? v.normalize('NFC').replace(/\s+/g, ' ').trim() : '');
const iso = v => (typeof v === 'string' && v && Number.isFinite(Date.parse(v)) ? new Date(v).toISOString() : null);
export const LOOT_NFT_TYPES = [1, 2, 3, 4, 5];   // 1 ghost drop, 2 park pass, 3 trick card, 4 crew/founder, 5 partner stamp

/** Vstup dropu -> { ok, value } alebo { errors } so slovenskými hláškami po poliach. */
export function parseDropInput(body, { now = new Date() } = {}) {
  const b = body && typeof body === 'object' ? body : {};
  const errors = {};
  const value = {
    p_spot: b.spot_id, p_title: clean(b.title), p_description: clean(b.description) || null, p_partner: clean(b.partner) || null,
    p_starts: iso(b.starts_at), p_ends: iso(b.ends_at), p_nft_type: b.nft_type === undefined || b.nft_type === null || b.nft_type === '' ? null : b.nft_type,
  };
  if (!isUuid(value.p_spot)) errors.spot_id = 'Vyber spot.';
  if (value.p_title.length < 1 || value.p_title.length > 80) errors.title = 'Názov dropu má 1 až 80 znakov.';
  if (value.p_description && value.p_description.length > 400) errors.description = 'Popis má najviac 400 znakov.';
  if (value.p_partner && value.p_partner.length > 80) errors.partner = 'Partner má najviac 80 znakov.';
  if (b.starts_at && !value.p_starts) errors.starts_at = 'Neplatný začiatok.';
  if (b.ends_at && !value.p_ends) errors.ends_at = 'Neplatný koniec.';
  const start = value.p_starts ? Date.parse(value.p_starts) : now.getTime();
  if (value.p_ends && Date.parse(value.p_ends) <= Math.max(start, now.getTime())) errors.ends_at = 'Koniec musí byť po začiatku a v budúcnosti.';
  if (value.p_nft_type !== null && !LOOT_NFT_TYPES.includes(value.p_nft_type)) errors.nft_type = 'Typ NFT je 1 až 5 alebo žiadny.';
  const tiers = Array.isArray(b.tiers) ? b.tiers : [];
  if (!tiers.length || tiers.length > 10) errors.tiers = 'Pridaj aspoň jeden tier (najviac 10).';
  let prev = 0;
  value.p_tiers = tiers.map((t, i) => {
    const r = t && typeof t === 'object' ? t : {};
    const tier = { label: clean(r.label), up_to: r.up_to, reward: clean(r.reward) || null, code: clean(r.code), gear_id: clean(r.gear_id) || null };
    if (tier.label.length < 1 || tier.label.length > 40) errors[`tiers.${i}.label`] = 'Názov tieru má 1 až 40 znakov.';
    if (!Number.isInteger(tier.up_to) || tier.up_to <= prev || tier.up_to > 100000) errors[`tiers.${i}.up_to`] = 'Počet kusov (do poradia) musí rásť: 1 až 100000.';
    else prev = tier.up_to;
    if (tier.code.length < 1 || tier.code.length > 100) errors[`tiers.${i}.code`] = 'Zadaj kód odmeny (1 až 100 znakov).';
    if (tier.reward && tier.reward.length > 200) errors[`tiers.${i}.reward`] = 'Popis odmeny má najviac 200 znakov.';
    if (tier.gear_id && !/^[a-z0-9][a-z0-9-]{1,59}$/.test(tier.gear_id)) errors[`tiers.${i}.gear_id`] = 'Neplatná nálepka.';
    return tier;
  });
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value };
}

const DB_ERRORS = {
  SPOT_NOT_FOUND: [404, 'spot_not_found', 'Spot nie je na mape.'],
  BAD_INPUT: [400, 'invalid_input', 'Skontroluj drop (tiery, nálepky, dátumy).'],
  DROP_INACTIVE: [404, 'drop_not_found', 'Drop neexistuje.'],
};
const fromDb = err => { const m = DB_ERRORS[err?.message]; return m ? new ApiError(...m) : err; };

export function createHandler(deps) {
  const { db, auth } = deps;
  const log = deps.log || console;
  const now = deps.now || (() => new Date());

  return async function loot(req, res) {
    if (!allowMethods(req, res, ['GET', 'POST', 'PATCH'])) return;
    try {
      const { userId } = await auth.requireAdmin(req);
      if (req.method === 'GET') return send(res, 200, { ok: true, drops: (await db.rpc('admin_loot_drops', {})) || [] });
      const body = await readJson(req);
      if (req.method === 'PATCH') {
        if (!isUuid(body.id) || typeof body.active !== 'boolean') throw new ApiError(400, 'invalid_input', 'Chýba id dropu alebo active (true/false).');
        const out = await db.rpc('admin_set_loot_drop_active', { p_actor: userId, p_drop: body.id, p_active: body.active }).catch(e => { throw fromDb(e); });
        return send(res, 200, { ok: true, ...out });
      }
      const v = parseDropInput(body, { now: now() });
      if (!v.ok) throw new ApiError(400, 'invalid_input', 'Skontroluj drop.', { errors: v.errors });
      const out = await db.rpc('admin_create_loot_drop', { p_actor: userId, ...v.value }).catch(e => { throw fromDb(e); });
      send(res, 201, { ok: true, id: out.id, capacity: out.capacity });
    } catch (err) {
      sendError(res, err, log);
    }
  };
}

export default createHandler(baseDeps());

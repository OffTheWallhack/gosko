// POST /api/admin/checkin (kontrakt §3). Bearer admin; {token} | {registration_id} | {event_id, rider_name}.
// Idempotentné. Pri nft_consent (a súhlase rodiča pri U16) skúsi mint; chyba mintu check-in nezhodí.
import { baseDeps } from '../_lib/deps.js';
import { ApiError, allowMethods, readJson, send, sendError } from '../_lib/http.js';
import { eq, inList, neq } from '../_lib/db.js';
import { isEventId, isUuid } from '../_lib/validate.js';
import { createChain } from '../_lib/chain.js';
import { createNft } from '../_lib/nft.js';
import { audit } from '../_lib/audit.js';
import { loadRider, riderPublicName } from '../_lib/passview.js';

const REG_COLS = 'id,rider_id,event_id,category,status,nft_consent,guardian_confirmed_at,checked_in_at';
const CHECKABLE = ['pending_guardian', 'confirmed', 'no_show'];

const norm = s => String(s ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();

export function createHandler(deps) {
  const { env, db, auth } = deps;
  const log = deps.log || console;
  const now = deps.now || (() => new Date());
  const nft = deps.nft || createNft({ env, db, chain: deps.chain, log, now });

  async function byName(eventId, riderName) {
    const needle = norm(riderName);
    const regs = await db.select('registrations', { event_id: eq(eventId), status: neq('cancelled') }, { select: REG_COLS });
    if (!regs.length) return [];
    const ids = [...new Set(regs.map(r => r.rider_id))];
    const [riders, privs] = await Promise.all([
      db.select('riders', { id: inList(ids) }, { select: 'id,display_name,nickname,public_name_mode' }),
      db.select('rider_private', { rider_id: inList(ids) }, { select: 'rider_id,legal_name' }),
    ]);
    const rider = new Map(riders.map(r => [r.id, r]));
    const legal = new Map(privs.map(p => [p.rider_id, p.legal_name]));
    return regs
      .filter(reg => {
        const r = rider.get(reg.rider_id);
        return [r?.display_name, r?.nickname, legal.get(reg.rider_id), riderPublicName(r)].some(n => n && norm(n) === needle);
      })
      .map(reg => ({ ...reg, _rider: rider.get(reg.rider_id) }));
  }

  async function findRegistration(body) {
    const notFound = new ApiError(404, 'not_found', 'Registrácia sa nenašla.');
    if (body.token !== undefined) {
      if (!isUuid(body.token)) throw new ApiError(400, 'invalid_input', 'Neplatný token passu.');
      return (await db.selectOne('registrations', { token: eq(body.token) }, { select: REG_COLS })) || Promise.reject(notFound);
    }
    if (body.registration_id !== undefined) {
      if (!isUuid(body.registration_id)) throw new ApiError(400, 'invalid_input', 'Neplatné ID registrácie.');
      return (await db.selectOne('registrations', { id: eq(body.registration_id) }, { select: REG_COLS })) || Promise.reject(notFound);
    }
    if (body.event_id !== undefined || body.rider_name !== undefined) {
      const name = typeof body.rider_name === 'string' ? body.rider_name.trim() : '';
      if (!isEventId(body.event_id) || name.length < 2 || name.length > 60) {
        throw new ApiError(400, 'invalid_input', 'Zadaj event a meno jazdcu (2 až 60 znakov).');
      }
      const found = await byName(body.event_id, name);
      if (!found.length) throw notFound;
      if (found.length > 1) {
        throw new ApiError(409, 'ambiguous', 'Toto meno má viac registrácií. Naskenuj QR kód alebo vyber konkrétnu registráciu.', {
          candidates: found.map(r => ({ id: r.id, public_name: riderPublicName(r._rider), category: r.category, status: r.status })),
        });
      }
      const { _rider, ...reg } = found[0];
      return reg;
    }
    throw new ApiError(400, 'invalid_input', 'Zadaj token passu, ID registrácie alebo event a meno jazdca.');
  }

  return async function checkin(req, res) {
    if (!allowMethods(req, res, ['POST'])) return;
    try {
      const { userId } = await auth.requireAdmin(req);
      const body = await readJson(req);
      let reg = await findRegistration(body);
      if (reg.status === 'cancelled') throw new ApiError(409, 'registration_cancelled', 'Táto registrácia je zrušená.');

      if (CHECKABLE.includes(reg.status)) {
        const [updated] = await db.update('registrations', { id: eq(reg.id), status: inList(CHECKABLE) }, {
          status: 'checked_in',
          checked_in_at: now().toISOString(),
        }, { select: REG_COLS });
        if (updated) {
          await audit(db, { actor: userId, action: 'checkin', entity: 'registration', entity_id: reg.id, data: { event_id: reg.event_id, from: reg.status } }, log);
          reg = updated;
        } else {
          // súbežný check-in to stihol skôr
          reg = (await db.selectOne('registrations', { id: eq(reg.id) }, { select: REG_COLS })) || reg;
        }
      }

      const guardianOk = reg.category !== 'u16' || Boolean(reg.guardian_confirmed_at);
      let nftStatus;
      if (!nft.enabled) nftStatus = 'disabled';
      else if (!reg.nft_consent) nftStatus = 'no_consent';
      else if (!guardianOk) nftStatus = 'guardian_pending';
      else nftStatus = (await nft.ensureMinted(reg.id)).status;

      const rider = await loadRider(db, reg.rider_id);
      send(res, 200, {
        ok: true,
        registration: { id: reg.id, status: reg.status, public_name: riderPublicName(rider), category: reg.category, guardian_ok: guardianOk },
        nft: { status: nftStatus },
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

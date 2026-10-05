// GET /api/pass?token= : pass zo servera. POST /api/pass {email, event_id}: znova pošle pass
// e-mailom. POST vždy vráti 200 {ok:true}, aby sa nedalo zisťovať, kto je registrovaný.
import { baseDeps } from './_lib/deps.js';
import { ApiError, allowMethods, clientIp, queryOf, readJson, send, sendError } from './_lib/http.js';
import { eq, inList } from './_lib/db.js';
import { isEmail, isEventId, isUuid } from './_lib/validate.js';
import { rateLimitHit } from './_lib/ratelimit.js';
import { passResendMail } from './_lib/mail.js';
import { loadEvent, loadRider, passOf, passUrl } from './_lib/passview.js';

const RESENDABLE = ['pending_guardian', 'confirmed', 'checked_in'];

export function createHandler(deps) {
  const { env, db, mail } = deps;
  const log = deps.log || console;

  async function getPass(req, res) {
    const token = queryOf(req).token;
    const notFound = new ApiError(404, 'not_found', 'Pass sme nenašli. Skontroluj odkaz.');
    if (!isUuid(token)) throw notFound;
    const reg = await db.selectOne('registrations', { token: eq(token) }, { select: 'id,token,event_id,rider_id,category,status' });
    if (!reg) throw notFound;
    const [event, rider] = await Promise.all([loadEvent(db, reg.event_id), loadRider(db, reg.rider_id)]);
    send(res, 200, { ok: true, pass: passOf(reg, event, rider, { withStatus: true }) });
  }

  async function resend(body, ip) {
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const eventId = typeof body.event_id === 'string' ? body.event_id.trim() : '';
    if (!isEmail(email) || !isEventId(eventId)) return;
    if (await rateLimitHit(db, `pass:${ip}`, env.RATE_LIMIT_PER_10MIN, 10)) return;
    const privs = await db.select('rider_private', { email: eq(email) }, { select: 'rider_id' });
    if (!privs.length) return;
    const regs = await db.select('registrations', {
      rider_id: inList(privs.map(p => p.rider_id)),
      event_id: eq(eventId),
      status: inList(RESENDABLE),
    }, { select: 'id,token,event_id' });
    if (!regs.length) return;
    const event = await loadEvent(db, eventId);
    for (const reg of regs) {
      await mail.send({
        to: email,
        ...passResendMail({ eventName: event?.name || eventId, eventDate: event?.date, eventCity: event?.city, passUrl: passUrl(env, reg.token) }),
      });
    }
  }

  return async function pass(req, res) {
    if (!allowMethods(req, res, ['GET', 'POST'])) return;
    try {
      if (req.method === 'GET') return await getPass(req, res);
      const body = await readJson(req);
      try {
        await resend(body, clientIp(req));
      } catch (err) {
        log.error('[pass] opätovné poslanie zlyhalo', err?.code, err?.message);
      }
      send(res, 200, { ok: true });
    } catch (err) {
      sendError(res, err, log);
    }
  };
}

export default createHandler(baseDeps());

// GET /api/consent?token= : rodič potvrdí súhlas jazdca do 16 rokov (kontrakt §3).
// Platný token -> 302 na #/registracia/potvrdene, inak #/registracia/neplatny-odkaz.
import { baseDeps } from './_lib/deps.js';
import { allowMethods, queryOf, redirect, sendRaw } from './_lib/http.js';
import { eq } from './_lib/db.js';
import { isUuid } from './_lib/validate.js';
import { confirmationMail } from './_lib/mail.js';
import { audit } from './_lib/audit.js';
import { loadEvent, loadRider, passUrl, riderPublicName } from './_lib/passview.js';

const UNAVAILABLE = `<!doctype html><html lang="sk"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>GOSko</title></head>
<body style="font-family:Arial,sans-serif;background:#F4EEE2;color:#111;padding:32px"><h1>Skús to o chvíľu</h1>
<p>Súhlas sa teraz nepodarilo uložiť. Odkaz z e-mailu ostáva platný, otvor ho znova o pár minút.</p></body></html>`;

export function createHandler(deps) {
  const { env, db, mail } = deps;
  const log = deps.log || console;

  const ok = () => `${env.PUBLIC_BASE_URL}/#/registracia/potvrdene`;
  const bad = () => `${env.PUBLIC_BASE_URL}/#/registracia/neplatny-odkaz`;

  async function notifyRider(reg) {
    try {
      const [priv, rider, event] = await Promise.all([
        db.selectOne('rider_private', { rider_id: eq(reg.rider_id) }, { select: 'email' }),
        loadRider(db, reg.rider_id),
        loadEvent(db, reg.event_id),
      ]);
      if (!priv?.email || !reg.token) return;
      await mail.send({
        to: priv.email,
        ...confirmationMail({
          eventName: event?.name || reg.event_id,
          eventDate: event?.date,
          eventCity: event?.city,
          publicName: riderPublicName(rider),
          category: reg.category,
          passUrl: passUrl(env, reg.token),
          guardianConfirmed: true,
        }),
      });
    } catch (err) {
      log.error('[consent] e-mail jazdcovi neodišiel', reg.id, err?.message);
    }
  }

  return async function consent(req, res) {
    if (!allowMethods(req, res, ['GET'])) return;
    const token = queryOf(req).token;
    if (!isUuid(token)) return redirect(res, bad());
    let reg;
    try {
      const out = await db.rpc('confirm_guardian', { p_token: token });
      reg = Array.isArray(out) ? out[0] : out;
    } catch (err) {
      if (err && Number.isInteger(err.status) && err.status >= 400 && err.status < 500) return redirect(res, bad());
      log.error('[consent] confirm_guardian zlyhal', err?.code, err?.message);
      return sendRaw(res, 503, 'text/html; charset=utf-8', UNAVAILABLE, { 'Cache-Control': 'no-store' });
    }
    if (!reg || !reg.id) return redirect(res, bad());

    await notifyRider(reg);
    await audit(db, { action: 'guardian_confirm', entity: 'registration', entity_id: reg.id, data: { event_id: reg.event_id } }, log);
    return redirect(res, ok());
  };
}

export default createHandler(baseDeps());

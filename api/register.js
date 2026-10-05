// POST /api/register (kontrakt §3). Poradie: Turnstile, rate limit, event, validácia,
// rodič pri U16, kapacita, jazdec (dedupe lower(email)+birth_date), registrácia, e-mail.
import { baseDeps } from './_lib/deps.js';
import { ApiError, allowMethods, clientIp, readJson, send, sendError } from './_lib/http.js';
import { eq, inList, isUniqueViolation } from './_lib/db.js';
import { U16_LIMIT, ageAt, categoryFor, isEventId, todayIn, validateRegistration } from './_lib/validate.js';
import { rateLimitHit } from './_lib/ratelimit.js';
import { confirmationMail, guardianConsentMail } from './_lib/mail.js';
import { audit } from './_lib/audit.js';
import { consentUrl, loadEvent, passOf, passUrl, riderPublicName } from './_lib/passview.js';
import { randomBytes as nodeRandomBytes, randomUUID } from 'node:crypto';

const ACTIVE = ['pending_guardian', 'confirmed', 'checked_in'];

const conflict = () => new ApiError(409, 'already_registered',
  'Registrácia s týmito údajmi na tento event už existuje. Pass ti vieme poslať znova e-mailom.');

export function createHandler(deps) {
  const { env, db, mail, turnstile } = deps;
  const log = deps.log || console;
  const now = deps.now || (() => new Date());
  const randomBytes = deps.randomBytes || nodeRandomBytes;
  const uuid = deps.uuid || randomUUID;

  async function findRider(input) {
    const priv = await db.selectOne('rider_private', { email: eq(input.email), birth_date: eq(input.birth_date) }, { select: 'rider_id' });
    if (!priv) return null;
    return db.selectOne('riders', { id: eq(priv.rider_id) }, { select: 'id,display_name,nickname,public_name_mode' });
  }

  async function findOrCreateRider(input, minor) {
    const existing = await findRider(input);
    if (existing) {
      // existujúci jazdec sa nemení; pri U16 si zapamätáme rodiča, ktorému ide súhlas
      if (minor) {
        await db.update('rider_private', { rider_id: eq(existing.id) }, {
          guardian_email: input.guardian_email,
          guardian_name: input.guardian_name,
          updated_at: now().toISOString(),
        });
      }
      return existing;
    }
    const [rider] = await db.insert('riders', {
      rider_ref: `0x${randomBytes(32).toString('hex')}`,
      display_name: input.display_name,
      nickname: input.nickname,
      country: input.country,
      city: input.city,
      public_name_mode: input.public_name_mode,
    });
    try {
      await db.insert('rider_private', {
        rider_id: rider.id,
        legal_name: input.legal_name,
        birth_date: input.birth_date,
        email: input.email,
        phone: input.phone,
        instagram: input.instagram,
        guardian_name: input.guardian_name,
        guardian_email: input.guardian_email,
      });
    } catch (err) {
      // nový rider bez súkromných údajov nesmie zostať
      await db.delete('riders', { id: eq(rider.id) }).catch(e => log.error('[register] sirota rider', e?.message));
      if (!isUniqueViolation(err)) throw err;
      const raced = await findRider(input); // súbežná registrácia toho istého jazdca
      if (!raced) throw err;
      return raced;
    }
    return rider;
  }

  return async function register(req, res) {
    if (!allowMethods(req, res, ['POST'])) return;
    try {
      const body = await readJson(req);
      const ip = clientIp(req);

      const captcha = await turnstile.verify(body.turnstile_token, ip);
      if (!captcha.ok) throw new ApiError(403, 'captcha_failed', 'Overenie, že nie si robot, zlyhalo. Obnov stránku a skús to znova.');

      if (await rateLimitHit(db, `reg:${ip}`, env.RATE_LIMIT_PER_10MIN, 10)) {
        throw new ApiError(429, 'rate_limited', 'Príliš veľa registrácií z tejto siete. Skús to znova o 10 minút.');
      }

      const eventId = typeof body.event_id === 'string' ? body.event_id.trim() : '';
      if (!isEventId(eventId)) throw new ApiError(400, 'invalid_input', 'Skontroluj vyplnené údaje.', { errors: { event_id: 'Vyber event.' } });
      const event = await loadEvent(db, eventId);
      if (!event) throw new ApiError(404, 'event_not_found', 'Tento event sme nenašli.');

      const today = todayIn(now());
      if (!event.registration_open || event.status === 'done' || event.status === 'cancelled' || (event.date && event.date < today)) {
        throw new ApiError(422, 'event_closed', 'Registrácia na tento event je uzavretá.');
      }

      const v = validateRegistration(body, { today, eventDate: event.date });
      if (!v.ok) throw new ApiError(400, 'invalid_input', 'Skontroluj vyplnené údaje.', { errors: v.errors });
      const input = v.value;

      const age = ageAt(input.birth_date, event.date || today);
      const minor = age < U16_LIMIT;
      if (minor && !input.guardian_email) {
        throw new ApiError(422, 'guardian_required',
          'Jazdec mladší ako 16 rokov potrebuje súhlas rodiča. Zadaj e-mail rodiča, pošleme mu odkaz na potvrdenie.',
          { errors: { guardian_email: 'Zadaj e-mail rodiča alebo zákonného zástupcu.' } });
      }

      if (event.capacity !== null && event.capacity !== undefined) {
        const taken = await db.count('registrations', { event_id: eq(event.id), status: inList(ACTIVE) });
        if (taken >= event.capacity) throw new ApiError(422, 'event_closed', 'Event je už plný.');
      }

      const rider = await findOrCreateRider(input, minor);
      const dup = await db.selectOne('registrations', { rider_id: eq(rider.id), event_id: eq(event.id) }, { select: 'id' });
      if (dup) throw conflict();

      const category = categoryFor(age, input.women);
      const status = minor ? 'pending_guardian' : 'confirmed';
      const guardianToken = minor ? uuid() : null;
      let reg;
      try {
        [reg] = await db.insert('registrations', {
          rider_id: rider.id,
          event_id: event.id,
          category,
          status,
          consent_version: env.CONSENT_VERSION,
          consent_at: now().toISOString(),
          photo_consent: input.consents.photo,
          nft_consent: input.consents.nft,
          guardian_token: guardianToken,
        });
      } catch (err) {
        if (isUniqueViolation(err)) throw conflict();
        throw err;
      }

      let mailSent = false;
      try {
        if (minor) {
          await mail.send({
            to: input.guardian_email,
            ...guardianConsentMail({
              guardianName: input.guardian_name,
              riderName: input.legal_name,
              eventName: event.name,
              eventDate: event.date,
              eventCity: event.city,
              photo: input.consents.photo,
              nft: input.consents.nft,
              consentUrl: consentUrl(env, guardianToken),
            }),
          });
        } else {
          await mail.send({
            to: input.email,
            ...confirmationMail({
              eventName: event.name,
              eventDate: event.date,
              eventCity: event.city,
              publicName: riderPublicName(rider),
              category,
              passUrl: passUrl(env, reg.token),
            }),
          });
        }
        mailSent = true;
      } catch (err) {
        log.error('[register] e-mail neodišiel', reg.id, err?.message);
      }

      await audit(db, {
        action: 'register',
        entity: 'registration',
        entity_id: reg.id,
        data: { event_id: event.id, category, status, consent_version: env.CONSENT_VERSION, mail_sent: mailSent },
      }, log);

      send(res, 201, { ok: true, status, pass: passOf(reg, event, rider), mail_sent: mailSent });
    } catch (err) {
      sendError(res, err, log);
    }
  };
}

export default createHandler(baseDeps());

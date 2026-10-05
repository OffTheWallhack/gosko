// POST /api/register (kontrakt §3). Poradie: Turnstile, rate limit, event, validácia,
// rodič pri U16, kapacita, jazdec (dedupe lower(email)+birth_date), registrácia, e-mail.
// Existujúci jazdec (rovnaký e-mail a dátum narodenia) dostane 202 check_email bez passu a mena:
// pass ide len e-mailom na adresu z registrácie, údaje jazdca ani rodiča sa neprepíšu (audit M1).
import { baseDeps } from './_lib/deps.js';
import { ApiError, allowMethods, clientIp, rateLimitIp, readJson, send, sendError } from './_lib/http.js';
import { eq, inList, isUniqueViolation } from './_lib/db.js';
import { U16_LIMIT, ageAt, categoryFor, isEventId, todayIn, validateRegistration } from './_lib/validate.js';
import { rateLimitHit } from './_lib/ratelimit.js';
import { confirmationMail, guardianConsentMail, passResendMail } from './_lib/mail.js';
import { audit } from './_lib/audit.js';
import { consentUrl, loadEvent, passOf, passUrl, riderPublicName } from './_lib/passview.js';
import { randomBytes as nodeRandomBytes, randomUUID } from 'node:crypto';

const ACTIVE = ['pending_guardian', 'confirmed', 'checked_in'];

const DAY = 86_400_000;
// Odkaz pre rodiča platí 7 dní po evente, bez dátumu eventu 60 dní (006, guardian_token_expires_at).
export const guardianExpiry = (eventDate, now) => (eventDate
  ? new Date(Date.parse(`${eventDate}T23:59:59Z`) + 7 * DAY)
  : new Date(now.getTime() + 60 * DAY)).toISOString();

export function createHandler(deps) {
  const { env, db, mail, turnstile } = deps;
  const log = deps.log || console;
  const now = deps.now || (() => new Date());
  const randomBytes = deps.randomBytes || nodeRandomBytes;
  const uuid = deps.uuid || randomUUID;

  async function findRider(input) {
    const priv = await db.selectOne('rider_private', { email: eq(input.email), birth_date: eq(input.birth_date) },
      { select: 'rider_id,email,guardian_name,guardian_email' });
    if (!priv) return null;
    const rider = await db.selectOne('riders', { id: eq(priv.rider_id) }, { select: 'id,display_name,nickname,public_name_mode' });
    return rider ? { ...rider, existing: true, priv } : null;
  }

  // Existujúci jazdec sa z neprihlásenej požiadavky nikdy nemení (ani rodič v rider_private).
  async function findOrCreateRider(input) {
    const existing = await findRider(input);
    if (existing) return existing;
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

  // Pass existujúcej registrácie znova e-mailom na adresu jazdca (duplicitná registrácia).
  async function resendPass(reg, event, to) {
    try {
      await mail.send({ to, ...passResendMail({ eventName: event.name, eventDate: event.date, eventCity: event.city, passUrl: passUrl(env, reg.token) }) });
      return true;
    } catch (err) {
      log.error('[register] e-mail neodišiel', reg.id, err?.message);
      return false;
    }
  }

  const checkEmail = (res, mailSent) => send(res, 202, { ok: true, status: 'check_email', mail_sent: mailSent });

  return async function register(req, res) {
    if (!allowMethods(req, res, ['POST'])) return;
    try {
      const body = await readJson(req);
      const ip = clientIp(req);

      const captcha = await turnstile.verify(body.turnstile_token, ip);
      if (!captcha.ok) throw new ApiError(403, 'captcha_failed', 'Overenie, že nie si robot, zlyhalo. Obnov stránku a skús to znova.');

      if (await rateLimitHit(db, `reg:${rateLimitIp(ip)}`, env.RATE_LIMIT_PER_10MIN, 10)) {
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

      const rider = await findOrCreateRider(input);
      const riderEmail = rider.priv?.email || input.email;
      const findDup = () => db.selectOne('registrations', { rider_id: eq(rider.id), event_id: eq(event.id) }, { select: 'id,token' });
      const dup = await findDup();
      if (dup) {
        const sent = await resendPass(dup, event, riderEmail);
        await audit(db, { action: 'register.duplicate', entity: 'registration', entity_id: dup.id, data: { event_id: event.id, mail_sent: sent } }, log);
        return checkEmail(res, sent);
      }

      const category = categoryFor(age, input.women);
      const status = minor ? 'pending_guardian' : 'confirmed';
      const guardianToken = minor ? uuid() : null;
      // rodič patrí k registrácii; pri známom jazdcovi platí rodič, ktorého už máme
      const guardian = minor
        ? (rider.priv?.guardian_email
          ? { name: rider.priv.guardian_name, email: rider.priv.guardian_email }
          : { name: input.guardian_name, email: input.guardian_email })
        : { name: null, email: null };
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
          guardian_token_expires_at: guardianToken ? guardianExpiry(event.date, now()) : null,
          guardian_name: guardian.name,
          guardian_email: guardian.email,
        });
      } catch (err) {
        if (!isUniqueViolation(err)) throw err;
        const raced = await findDup();
        if (!raced) throw err;
        return checkEmail(res, await resendPass(raced, event, riderEmail));
      }

      let mailSent = false;
      try {
        if (minor) {
          await mail.send({
            to: guardian.email,
            ...guardianConsentMail({
              guardianName: guardian.name,
              riderName: rider.existing ? riderPublicName(rider) : input.legal_name,
              publicName: riderPublicName(rider),
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
            to: riderEmail,
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
        data: { event_id: event.id, category, status, consent_version: env.CONSENT_VERSION, mail_sent: mailSent, existing_rider: Boolean(rider.existing) },
      }, log);

      if (rider.existing) return checkEmail(res, mailSent);
      send(res, 201, { ok: true, status, pass: passOf(reg, event, rider), mail_sent: mailSent });
    } catch (err) {
      sendError(res, err, log);
    }
  };
}

export default createHandler(baseDeps());

// Prvé prihlásenie hráča do hry (plán Ghoskate, Task 2; kontrakt §8).
//   GET  /api/game/link-rider  -> stav pred onboardingom: je už hráč? má jazdca z registrácie?
//   POST /api/game/link-rider  -> založí hráča (players) a napojí ho na jazdca
// Prihlásenie: Bearer JWT zo Supabase Auth (e-mailový odkaz alebo kód). E-mail sa berie iba
// z overeného prihlásenia, nikdy z tela požiadavky.
//
// Jazdec: existujúci podľa rider_private.email = overený e-mail (ešte nenapojený na iného hráča).
// Súrodenci s jedným e-mailom rodiča: rozhodne dátum narodenia. Inak vznikne nový jazdec.
// U16 (dnes mladší ako 16): vznikne token v player_guardian a rodič dostane e-mail so súhlasom
// s hrou. Súhlas s eventom hru neodomyká (013). Pri známom jazdcovi platí rodič, ktorého už máme.
// Odpovede neobsahujú osobné údaje (meno, e-mail, dátum narodenia, rodič, token).
import { baseDeps } from '../_lib/deps.js';
import { ApiError, allowMethods, readJson, send, sendError } from '../_lib/http.js';
import { eq, inList, isUniqueViolation } from '../_lib/db.js';
import { isDate, todayIn } from '../_lib/validate.js';
import { needsGuardian, validatePlayer } from '../_lib/game.js';
import { rateLimitHit } from '../_lib/ratelimit.js';
import { gameGuardianMail } from '../_lib/mail.js';
import { audit } from '../_lib/audit.js';
import { consentUrl, riderPublicName } from '../_lib/passview.js';
import { randomBytes as nodeRandomBytes, randomUUID } from 'node:crypto';

const DAY = 86_400_000;
export const GUARDIAN_TOKEN_DAYS = 14;
const PRIV_COLS = 'rider_id,birth_date,instagram,guardian_name,guardian_email';

export function createHandler(deps) {
  const { env, db, mail, auth } = deps;
  const log = deps.log || console;
  const now = deps.now || (() => new Date());
  const randomBytes = deps.randomBytes || nodeRandomBytes;
  const uuid = deps.uuid || randomUUID;

  // Jazdci s týmto e-mailom, ktorí ešte nie sú napojení na hráča.
  async function candidates(email) {
    const privs = await db.select('rider_private', { email: eq(email) }, { select: PRIV_COLS });
    if (!privs.length) return [];
    const linked = await db.select('players', { rider_id: inList(privs.map(p => p.rider_id)) }, { select: 'rider_id' });
    const taken = new Set(linked.map(p => p.rider_id));
    return privs.filter(p => !taken.has(p.rider_id));
  }

  const loadPlayer = userId => db.selectOne('players', { id: eq(userId) }, { select: 'id,rider_id,username,guardian_confirmed_at' });

  async function playerNeedsGuardian(player) {
    if (player.guardian_confirmed_at) return false;
    const priv = await db.selectOne('rider_private', { rider_id: eq(player.rider_id) }, { select: 'birth_date' });
    return !priv || needsGuardian(priv.birth_date, todayIn(now()));
  }

  // Nový token pre rodiča (starý prestane platiť) a e-mail. Vráti, či e-mail odišiel.
  async function issueGuardian(player, guardian, riderName) {
    const token = uuid();
    const row = {
      guardian_name: guardian.name || null,
      guardian_email: guardian.email,
      token,
      token_expires_at: new Date(now().getTime() + GUARDIAN_TOKEN_DAYS * DAY).toISOString(),
      requested_at: now().toISOString(),
    };
    const existing = await db.selectOne('player_guardian', { player_id: eq(player.id) }, { select: 'player_id' });
    if (existing) await db.update('player_guardian', { player_id: eq(player.id) }, row);
    else await db.insert('player_guardian', { player_id: player.id, ...row });
    try {
      await mail.send({ to: guardian.email, ...gameGuardianMail({ guardianName: guardian.name, riderName, username: player.username, consentUrl: consentUrl(env, token) }) });
      return true;
    } catch (err) {
      log.error('[game] e-mail rodičovi neodišiel', player.id, err?.message);
      return false;
    }
  }

  async function status(user, res) {
    const player = await loadPlayer(user.userId);
    if (player) return send(res, 200, { ok: true, status: 'player', username: player.username, needs_guardian: await playerNeedsGuardian(player) });
    const list = await candidates(user.email);
    const rider = list.length === 0 ? 'none' : list.length === 1 ? 'known' : 'ambiguous';
    send(res, 200, { ok: true, status: 'new', rider, guardian_known: rider === 'known' && Boolean(list[0].guardian_email) });
  }

  // Už existujúci hráč: nič nové nezakladá; U16 bez súhlasu si môže dať poslať e-mail rodičovi znova.
  async function existingPlayer(user, player, body, res) {
    const needs = await playerNeedsGuardian(player);
    let sent = false;
    if (needs && body.resend_guardian === true) {
      if (await rateLimitHit(db, `game-guardian:${user.userId}`, 3, 60)) {
        throw new ApiError(429, 'rate_limited', 'E-mail rodičovi sme poslali už viackrát. Skús to znova o hodinu.');
      }
      const stored = await db.selectOne('player_guardian', { player_id: eq(player.id) }, { select: 'guardian_name,guardian_email' });
      const priv = await db.selectOne('rider_private', { rider_id: eq(player.rider_id) }, { select: 'guardian_name,guardian_email' });
      const guardian = stored?.guardian_email ? { name: stored.guardian_name, email: stored.guardian_email }
        : priv?.guardian_email ? { name: priv.guardian_name, email: priv.guardian_email } : null;
      if (!guardian) throw new ApiError(422, 'guardian_required', 'Nemáme e-mail rodiča. Napíš nám cez žiadosť o súkromie na webe GOSko.');
      const rider = await db.selectOne('riders', { id: eq(player.rider_id) }, { select: 'display_name,nickname,public_name_mode' });
      sent = await issueGuardian(player, guardian, riderPublicName(rider) || player.username);
      await audit(db, { actor: user.userId, action: 'game.guardian_resend', entity: 'player', entity_id: player.id, data: { mail_sent: sent } }, log);
    }
    send(res, 200, { ok: true, status: 'player', username: player.username, needs_guardian: needs, guardian_mail_sent: sent });
  }

  // Nový jazdec bez hráča nesmie zostať (rider_private by v DB zmazala kaskáda, tu výslovne).
  async function dropRider(riderId) {
    await db.delete('rider_private', { rider_id: eq(riderId) }).catch(e => log.error('[game] sirota rider_private', e?.message));
    await db.delete('riders', { id: eq(riderId) }).catch(e => log.error('[game] sirota rider', e?.message));
  }

  async function createRider(user, v, guardian, minor) {
    const [rider] = await db.insert('riders', {
      rider_ref: `0x${randomBytes(32).toString('hex')}`,
      display_name: v.name,
      country: v.country,
      city: v.city,
      public_name_mode: minor ? 'short' : 'full',
    });
    try {
      await db.insert('rider_private', {
        rider_id: rider.id,
        legal_name: v.name,
        birth_date: v.birth_date,
        email: user.email,
        instagram: v.instagram,
        guardian_name: guardian?.name ?? null,
        guardian_email: guardian?.email ?? null,
      });
    } catch (err) {
      await db.delete('riders', { id: eq(rider.id) }).catch(e => log.error('[game] sirota rider', e?.message));
      throw err;
    }
    return rider;
  }

  async function link(user, req, res) {
    if (await rateLimitHit(db, `game-link:${user.userId}`, 10, 10)) {
      throw new ApiError(429, 'rate_limited', 'Príliš veľa pokusov. Skús to znova o 10 minút.');
    }
    const body = await readJson(req);
    const player = await loadPlayer(user.userId);
    if (player) return existingPlayer(user, player, body, res);

    const today = todayIn(now());
    const birth = typeof body.birth_date === 'string' && isDate(body.birth_date.trim()) ? body.birth_date.trim() : null;
    const list = await candidates(user.email);
    let priv = null;
    if (birth) priv = list.find(c => c.birth_date === birth) || null;
    else if (list.length === 1) priv = list[0];
    else if (list.length > 1) {
      throw new ApiError(422, 'birth_date_required', 'Na tento e-mail máme viac jazdcov. Zadaj svoj dátum narodenia.',
        { errors: { birth_date: 'Zadaj svoj dátum narodenia.' } });
    }
    const newRider = !priv;

    const v = validatePlayer(body, { today, newRider });
    if (!v.ok) throw new ApiError(400, 'invalid_input', 'Skontroluj vyplnené údaje.', { errors: v.errors });
    const input = v.value;

    const minor = needsGuardian(newRider ? input.birth_date : priv.birth_date, today);
    let guardian = null;
    if (minor) {
      guardian = priv?.guardian_email
        ? { name: priv.guardian_name, email: priv.guardian_email }
        : input.guardian_email ? { name: input.guardian_name, email: input.guardian_email } : null;
      if (!guardian) {
        throw new ApiError(422, 'guardian_required', 'Hráč mladší ako 16 rokov potrebuje súhlas rodiča. Zadaj e-mail rodiča, pošleme mu odkaz.',
          { errors: { guardian_email: 'Zadaj e-mail rodiča alebo zákonného zástupcu.' } });
      }
      if (guardian.email === user.email) {
        throw new ApiError(400, 'invalid_input', 'Skontroluj vyplnené údaje.', { errors: { guardian_email: 'E-mail rodiča musí byť iný ako tvoj e-mail.' } });
      }
    }

    let rider;
    if (newRider) {
      try {
        rider = await createRider(user, input, guardian, minor);
      } catch (err) {
        if (!isUniqueViolation(err)) throw err;
        throw new ApiError(409, 'rider_conflict', 'Jazdca s týmto e-mailom a dátumom narodenia už máme. Obnov stránku a skús to znova.');
      }
    } else {
      rider = await db.selectOne('riders', { id: eq(priv.rider_id) }, { select: 'id,display_name,nickname,public_name_mode' });
    }

    const playerRow = { id: user.userId, rider_id: rider.id, username: input.username, city: input.city, stance: input.stance };
    try {
      await db.insert('players', playerRow);
    } catch (err) {
      if (newRider) await dropRider(rider.id);
      if (!isUniqueViolation(err)) throw err;
      if (/username/.test(err.message || '')) throw new ApiError(409, 'username_taken', 'Tento nick už niekto má. Skús iný.', { errors: { username: 'Tento nick už niekto má.' } });
      const raced = await loadPlayer(user.userId); // dvojklik: hráč medzitým vznikol
      if (raced) return existingPlayer(user, raced, {}, res);
      throw new ApiError(409, 'rider_conflict', 'Tento jazdec už má hráča. Prihlás sa e-mailom, ktorým si ho založil.');
    }

    if (!newRider && input.instagram && !priv.instagram) {
      await db.update('rider_private', { rider_id: eq(rider.id) }, { instagram: input.instagram })
        .catch(e => log.error('[game] instagram sa neuložil', e?.message));
    }

    let mailSent = false;
    if (minor) mailSent = await issueGuardian(playerRow, guardian, newRider ? input.name : riderPublicName(rider));

    await audit(db, {
      actor: user.userId, action: 'game.link', entity: 'player', entity_id: user.userId,
      data: { rider: newRider ? 'new' : 'linked', needs_guardian: minor, mail_sent: mailSent },
    }, log);
    send(res, 201, { ok: true, status: 'created', rider: newRider ? 'new' : 'linked', username: input.username, needs_guardian: minor, guardian_mail_sent: mailSent });
  }

  return async function linkRider(req, res) {
    if (!allowMethods(req, res, ['GET', 'POST'])) return;
    try {
      const user = await auth.requireUser(req);
      if (req.method === 'GET') return await status(user, res);
      return await link(user, req, res);
    } catch (err) {
      sendError(res, err, log);
    }
  };
}

export default createHandler(baseDeps());

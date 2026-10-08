// Súhlas rodiča jazdca do 16 rokov, dvojkrokovo (ochrana pred skenermi odkazov v e-mailoch):
//   GET  /api/consent?token=  -> stránka s tlačidlom „Potvrdzujem súhlas“ (token sa ešte nepoužije)
//   POST /api/consent {token}  -> confirm_guardian -> 302 na #/registracia/potvrdene
// Neplatný alebo použitý token -> 302 na #/registracia/neplatny-odkaz.
// Ak bol jazdec už na mieste odbavený (checked_in) a má nft_consent, po súhlase sa skúsi mint.
// Dva druhy tokenu: registrácia na event (registrations.guardian_token) a hra (player_guardian.token,
// api/game/link-rider.js). Stránka ukáže rozsah podľa druhu; POST skúsi confirm_guardian a pri
// neznámom tokene confirm_player_guardian -> 302 na #/hra/potvrdene. Súhlas s eventom hru neodomyká.
// Herná stránka má zvlášť nezaškrtnuté políčko pre fotky a videá (media=1 -> p_media, 016).
import { baseDeps } from './_lib/deps.js';
import { allowMethods, queryOf, readBody, redirect, sendRaw } from './_lib/http.js';
import { eq } from './_lib/db.js';
import { isUuid } from './_lib/validate.js';
import { GAME_CONSENT_SCOPE, GAME_MEDIA_CONSENT, confirmationMail, escapeHtml, formatDateSk } from './_lib/mail.js';
import { audit } from './_lib/audit.js';
import { createChain } from './_lib/chain.js';
import { createNft } from './_lib/nft.js';
import { loadEvent, loadRider, passUrl, riderPublicName } from './_lib/passview.js';

const OPEN = ['pending_guardian', 'checked_in'];

const PAGE_HEADERS = {
  'Cache-Control': 'no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex, nofollow',
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
};

function page(title, inner) {
  return `<!doctype html><html lang="sk"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>${escapeHtml(title)} | GOSko</title></head>
<body style="margin:0;padding:24px 16px;background:#111111;color:#111111;font-family:Arial,Helvetica,sans-serif;font-size:17px;line-height:1.5">
<main style="max-width:520px;margin:0 auto;background:#F3EBDD;border:4px solid #111111;padding:24px">
<p style="margin:0 0 8px;font-size:28px;font-weight:900;letter-spacing:1px">GOSko</p>
<div style="height:6px;background:#A01D21;margin:0 0 20px"></div>
${inner}
</main></body></html>`;
}

export function consentPage({ token, eventName, eventDate, eventCity, publicName, photo, nft }) {
  const when = [formatDateSk(eventDate), eventCity].filter(Boolean).join(', ') || 'dátum upresníme';
  const extra = [];
  if (photo) extra.push('<li>fotografovanie jazdca na podujatí a zverejnenie fotiek a videí z podujatia,</li>');
  if (nft) extra.push('<li>vydanie digitálneho záznamu o účasti a výsledku (NFT), ktorý neobsahuje meno ani iné osobné údaje,</li>');
  return page('Súhlas rodiča', `<h1 style="margin:0 0 12px;font-size:24px">Súhlas rodiča</h1>
<p style="margin:0 0 12px">Podujatie: <strong>${escapeHtml(eventName)}</strong> (${escapeHtml(when)})<br>
Jazdec: <strong>${escapeHtml(publicName)}</strong></p>
<p style="margin:0 0 12px">Vo výsledkoch a v rebríčku sa po potvrdení zobrazí meno: <strong>${escapeHtml(publicName)}</strong>.
Ak chcete iné zobrazenie (napr. len meno a iniciálu), pošlite nám žiadosť o súkromie na webe GOSko.</p>
<p style="margin:0 0 8px">Potvrdením súhlasíte s:</p>
<ul style="margin:0 0 16px;padding-left:20px">
<li>účasťou jazdca na podujatí podľa pravidiel GOSko,</li>
<li>spracúvaním osobných údajov jazdca na účely registrácie a výsledkov,</li>
${extra.join('\n')}
</ul>
<form method="post" action="/api/consent" style="margin:0 0 16px">
<input type="hidden" name="token" value="${escapeHtml(token)}">
<button type="submit" style="width:100%;padding:14px 18px;border:0;background:#A01D21;color:#F3EBDD;font-size:18px;font-weight:900;cursor:pointer">Potvrdzujem súhlas</button>
</form>
<p style="margin:0;font-size:14px;color:#444">Ak o registrácii neviete, stránku zatvorte. Bez súhlasu registrácia nebude potvrdená.</p>`);
}

export function gameConsentPage({ token, username }) {
  return page('Súhlas rodiča s hrou', `<h1 style="margin:0 0 12px;font-size:24px">Súhlas rodiča s hrou</h1>
<p style="margin:0 0 12px">Hra GOSko Ghoskate, hráč: <strong>${escapeHtml(username)}</strong></p>
<p style="margin:0 0 12px">Hráč mladší ako 16 rokov môže hru len prezerať, kým nepotvrdíte súhlas.
Súhlas s registráciou na GOSko event hru neodomyká.</p>
<p style="margin:0 0 8px">Potvrdením povoľujete:</p>
<ul style="margin:0 0 16px;padding-left:20px">
${GAME_CONSENT_SCOPE.map(s => `<li>${escapeHtml(s)}</li>`).join('\n')}
</ul>
<p style="margin:0 0 16px">Hráčske meno je verejné, celé meno, vek ani e-mail sa v hre nezobrazujú.</p>
<form method="post" action="/api/consent" style="margin:0 0 16px">
<input type="hidden" name="token" value="${escapeHtml(token)}">
<label style="display:flex;gap:10px;align-items:flex-start;margin:0 0 16px;padding:12px;border:2px solid #111111;background:#fff">
<input type="checkbox" name="media" value="1" style="width:22px;height:22px;margin:2px 0 0;flex:none">
<span><strong>Súhlas s fotkami a videami (nepovinné).</strong> ${escapeHtml(GAME_MEDIA_CONSENT)} Bez tohto súhlasu hráč nemôže nahrávať klipy, ostatná hra funguje.</span>
</label>
<button type="submit" style="width:100%;padding:14px 18px;border:0;background:#A01D21;color:#F3EBDD;font-size:18px;font-weight:900;cursor:pointer">Potvrdzujem súhlas</button>
</form>
<p style="margin:0;font-size:14px;color:#444">Ak o hre neviete, stránku zatvorte. Bez súhlasu hráč nemôže robiť check-in, nahrávať klipy ani byť v crew.</p>`);
}

const UNAVAILABLE = page('Skús to o chvíľu', `<h1 style="margin:0 0 12px;font-size:24px">Skús to o chvíľu</h1>
<p style="margin:0">Súhlas sa teraz nepodarilo spracovať. Odkaz z e-mailu ostáva platný, otvor ho znova o pár minút.</p>`);

const clientError = err => Number.isInteger(err?.status) && err.status >= 400 && err.status < 500;

export function createHandler(deps) {
  const { env, db, mail } = deps;
  const log = deps.log || console;
  const now = deps.now || (() => new Date());
  const nft = deps.nft || createNft({ env, db, chain: deps.chain, log, now });

  const ok = () => `${env.PUBLIC_BASE_URL}/#/registracia/potvrdene`;
  const gameOk = () => `${env.PUBLIC_BASE_URL}/#/hra/potvrdene`;
  const bad = () => `${env.PUBLIC_BASE_URL}/#/registracia/neplatny-odkaz`;
  const unavailable = res => sendRaw(res, 503, 'text/html; charset=utf-8', UNAVAILABLE, PAGE_HEADERS);

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

  async function show(req, res) {
    const token = queryOf(req).token;
    if (!isUuid(token)) return redirect(res, bad());
    let reg;
    try {
      reg = await db.selectOne('registrations', { guardian_token: eq(token) }, {
        select: 'id,event_id,rider_id,status,guardian_confirmed_at,guardian_token_expires_at,photo_consent,nft_consent',
      });
    } catch (err) {
      if (clientError(err)) return redirect(res, bad());
      log.error('[consent] načítanie zlyhalo', err?.code, err?.message);
      return unavailable(res);
    }
    if (!reg) return showGame(token, res);
    if (reg.guardian_confirmed_at || !OPEN.includes(reg.status)) return redirect(res, bad());
    if (reg.guardian_token_expires_at && Date.parse(reg.guardian_token_expires_at) <= now().getTime()) return redirect(res, bad());
    const [event, rider] = await Promise.all([loadEvent(db, reg.event_id), loadRider(db, reg.rider_id)]).catch(() => [null, null]);
    const html = consentPage({
      token,
      eventName: event?.name || reg.event_id,
      eventDate: event?.date,
      eventCity: event?.city,
      publicName: riderPublicName(rider) || 'jazdec',
      photo: reg.photo_consent,
      nft: reg.nft_consent,
    });
    return sendRaw(res, 200, 'text/html; charset=utf-8', html, PAGE_HEADERS);
  }

  // Herný token (player_guardian). Platný = nepoužitý a neprepadnutý.
  async function showGame(token, res) {
    let g, player;
    try {
      g = await db.selectOne('player_guardian', { token: eq(token) }, { select: 'player_id,token_expires_at' });
      if (g) player = await db.selectOne('players', { id: eq(g.player_id) }, { select: 'username' });
    } catch (err) {
      if (clientError(err)) return redirect(res, bad());
      log.error('[consent] načítanie hry zlyhalo', err?.code, err?.message);
      return unavailable(res);
    }
    if (!g || !player) return redirect(res, bad());
    if (g.token_expires_at && Date.parse(g.token_expires_at) <= now().getTime()) return redirect(res, bad());
    return sendRaw(res, 200, 'text/html; charset=utf-8', gameConsentPage({ token, username: player.username }), PAGE_HEADERS);
  }

  async function confirmGame(token, media, res) {
    let out;
    try {
      out = await db.rpc('confirm_player_guardian', { p_token: token, p_media: media });
    } catch (err) {
      if (clientError(err)) return redirect(res, bad());
      log.error('[consent] confirm_player_guardian zlyhal', err?.code, err?.message);
      return unavailable(res);
    }
    const playerId = (Array.isArray(out) ? out[0] : out)?.player_id;
    if (!playerId) return redirect(res, bad());
    await audit(db, { action: 'guardian_confirm_game', entity: 'player', entity_id: playerId, data: { media } }, log);
    return redirect(res, gameOk());
  }

  async function confirm(req, res) {
    let body;
    try { body = await readBody(req); } catch { return redirect(res, bad()); }
    const token = typeof body?.token === 'string' ? body.token.trim() : '';
    if (!isUuid(token)) return redirect(res, bad());
    let reg;
    try {
      const out = await db.rpc('confirm_guardian', { p_token: token });
      reg = Array.isArray(out) ? out[0] : out;
    } catch (err) {
      if (clientError(err)) return confirmGame(token, body?.media === '1' || body?.media === true, res);
      log.error('[consent] confirm_guardian zlyhal', err?.code, err?.message);
      return unavailable(res);
    }
    if (!reg || !reg.id) return redirect(res, bad());

    let nftStatus = null;
    if (reg.status === 'checked_in') {
      // jazdec už bol na mieste: pass mu netreba, ale token môže vzniknúť až teraz
      if (reg.nft_consent) nftStatus = (await nft.ensureMinted(reg.id)).status;
    } else {
      await notifyRider(reg);
    }
    await audit(db, { action: 'guardian_confirm', entity: 'registration', entity_id: reg.id, data: { event_id: reg.event_id, status: reg.status, nft: nftStatus } }, log);
    return redirect(res, ok());
  }

  return async function consent(req, res) {
    if (!allowMethods(req, res, ['GET', 'POST'])) return;
    return req.method === 'GET' ? show(req, res) : confirm(req, res);
  };
}

function defaultDeps() {
  const d = baseDeps();
  return { ...d, chain: createChain({ env: d.env }) };
}

export default createHandler(defaultDeps());

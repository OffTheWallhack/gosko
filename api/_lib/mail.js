// E-maily cez Resend (fetch). Bez RESEND_API_KEY sa e-mail iba zaloguje ako '[mail:dev]'.
// Šablóny: čistý text + jednoduché HTML. Žiadne dlhé pomlčky vo vetách.

const RESEND_URL = 'https://api.resend.com/emails';

export class MailError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'MailError';
    this.status = status;
  }
}

export function createMailer({ env, fetch: f = globalThis.fetch, log = console }) {
  return {
    async send({ to, subject, text, html }) {
      if (!env.RESEND_API_KEY) {
        if (env.production) {
          // v produkcii bez kľúča nelogujeme obsah ani adresu (osobné údaje)
          log.warn('[mail:dev]', 'RESEND_API_KEY chýba, e-mail neodišiel:', subject);
        } else {
          // mimo produkcie: adresa a obsah sa logujú len s MAIL_DEV_LOG=full (osobné údaje, odkazy s tokenom)
          if (env.MAIL_DEV_LOG === 'full') log.info('[mail:dev]', JSON.stringify({ to, subject, text }));
          else log.info('[mail:dev]', 'RESEND_API_KEY chýba, e-mail neodišiel:', subject);
        }
        return { id: null, dev: true };
      }
      let resp;
      try {
        resp = await f(RESEND_URL, {
          method: 'POST',
          headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: env.MAIL_FROM, to: [to], subject, text, html }),
          signal: AbortSignal.timeout(10_000),
        });
      } catch (err) {
        throw new MailError(`Resend je nedostupný: ${err?.name || 'chyba'}`, 503);
      }
      if (!resp.ok) {
        let detail = '';
        try { detail = (await resp.json())?.message || ''; } catch { /* bez tela */ }
        throw new MailError(`Resend ${resp.status}${detail ? `: ${detail}` : ''}`, resp.status);
      }
      let id = null;
      try { id = (await resp.json())?.id ?? null; } catch { /* bez tela */ }
      return { id };
    },
  };
}

/* ---------- šablóny ---------- */

export const CATEGORY_LABEL = { open: 'Open', u16: 'U16', women: 'Babská' };

export function formatDateSk(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? ''));
  if (!m) return '';
  return `${Number(m[3])}. ${Number(m[2])}. ${m[1]}`;
}

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Bloky: reťazec = odsek (riadky oddelené \n), { href, label } = odkaz ako tlačidlo.
function render(blocks) {
  const text = blocks.map(b => (typeof b === 'string' ? b : `${b.label}:\n${b.href}`)).join('\n\n') + '\n';
  const body = blocks.map(b => {
    if (typeof b === 'string') return `<p style="margin:0 0 16px">${escapeHtml(b).replace(/\n/g, '<br>')}</p>`;
    return `<p style="margin:0 0 16px"><a href="${escapeHtml(b.href)}" style="display:inline-block;background:#A01D21;color:#F3EBDD;padding:12px 18px;text-decoration:none;font-weight:bold;border-radius:4px">${escapeHtml(b.label)}</a><br><span style="font-size:12px;color:#555">${escapeHtml(b.href)}</span></p>`;
  }).join('\n');
  const html = `<!doctype html><html lang="sk"><head><meta charset="utf-8"></head><body style="margin:0;padding:24px;background:#F3EBDD;color:#111;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5">
<div style="max-width:560px;margin:0 auto;background:#fff;border:3px solid #111;padding:24px">
<p style="margin:0 0 20px;font-size:22px;font-weight:900;letter-spacing:1px">GOSko</p>
${body}
</div></body></html>`;
  return { text, html };
}

const when = (date, city) => {
  const d = formatDateSk(date);
  if (d && city) return `${d}, ${city}`;
  return d || city || 'dátum upresníme';
};

export function confirmationMail({ eventName, eventDate, eventCity, publicName, category, passUrl, guardianConfirmed = false }) {
  const blocks = [
    'Ahoj,',
    guardianConfirmed
      ? `rodič potvrdil súhlas a tvoja registrácia na ${eventName} (${when(eventDate, eventCity)}) je potvrdená.`
      : `tvoja registrácia na ${eventName} (${when(eventDate, eventCity)}) je potvrdená.`,
    `Kategória: ${CATEGORY_LABEL[category] || category}\nMeno vo výsledkoch: ${publicName}`,
    { href: passUrl, label: 'Tvoj pass s QR kódom' },
    'Pass ukáž pri check-ine na mieste. Odkaz nikomu neposielaj, kto ho má, vidí tvoj pass.',
    'Ak si sa neregistroval ty, odpíš nám na tento e-mail.',
    'Vidíme sa na spote!\nGOSko',
  ];
  return { subject: `Registrácia potvrdená: ${eventName}`, ...render(blocks) };
}

export function guardianConsentMail({ guardianName, riderName, publicName, eventName, eventDate, eventCity, photo = false, nft = false, consentUrl }) {
  const extra = [];
  if (photo) extra.push('Súhlas zahŕňa aj fotografovanie jazdca na podujatí a zverejnenie fotiek a videí z podujatia.');
  if (nft) extra.push('Súhlas zahŕňa aj vydanie digitálneho záznamu o účasti a výsledku (NFT). Záznam neobsahuje meno ani iné osobné údaje.');
  const blocks = [
    guardianName ? `Dobrý deň, ${guardianName},` : 'Dobrý deň,',
    `prišla nám registrácia na podujatie ${eventName} (${when(eventDate, eventCity)}) pre jazdca: ${riderName}.`,
    'Jazdec mladší ako 16 rokov potrebuje súhlas rodiča alebo zákonného zástupcu. Súhlasom potvrdzujete účasť na podujatí podľa pravidiel GOSko a spracúvanie osobných údajov jazdca na účely registrácie a výsledkov.',
    ...(publicName ? [`Vo výsledkoch a v rebríčku sa po vašom súhlase zobrazí meno: ${publicName}. Zmenu nám napíšte cez žiadosť o súkromie na webe GOSko.`] : []),
    ...extra,
    { href: consentUrl, label: 'Potvrdiť súhlas' },
    'Ak o registrácii neviete, e-mail ignorujte. Bez súhlasu registrácia nebude potvrdená a jazdec sa nedostane do výsledkov.',
    'S pozdravom\nGOSko',
  ];
  return { subject: `Súhlas rodiča s registráciou na ${eventName}`, ...render(blocks) };
}

export function passResendMail({ eventName, eventDate, eventCity, passUrl }) {
  const blocks = [
    'Ahoj,',
    `posielame ti znova pass na ${eventName} (${when(eventDate, eventCity)}).`,
    { href: passUrl, label: 'Tvoj pass s QR kódom' },
    'Ak si o pass nežiadal ty, e-mail ignoruj. Odkaz nikomu neposielaj.',
    'GOSko',
  ];
  return { subject: `Tvoj pass na ${eventName}`, ...render(blocks) };
}

// Rozsah súhlasu rodiča s hrou Ghoskate. Ten istý text je na stránke /api/consent (gameConsentPage),
// aby rodič v e-maile aj na webe videl to isté. Súhlas s eventom hru neodomyká (013).
export const GAME_CONSENT_SCOPE = [
  'check-in na skate spotoch: hra overí polohu telefónu len v okamihu check-inu (do 150 m od spotu), polohu neukladáme, verejne je vidieť iba počet ľudí na spote, nie kto,',
  'nahrávanie klipov: fotky a videá z jazdenia na spotoch sú verejné v hre pod hráčskym menom,',
  'členstvo v crew: hráč môže založiť crew alebo sa pridať do crew iných hráčov,',
  'hodnotenie a hlásenia o stave spotov.',
];

export function gameGuardianMail({ guardianName, riderName, username, consentUrl }) {
  const blocks = [
    guardianName ? `Dobrý deň, ${guardianName},` : 'Dobrý deň,',
    `jazdec ${riderName} sa prihlásil do hry GOSko Ghoskate s hráčskym menom ${username}.`,
    'Hráč mladší ako 16 rokov môže hru len prezerať, kým rodič alebo zákonný zástupca nepotvrdí súhlas. Súhlas s registráciou na GOSko event hru neodomyká, rozhodujete o nej zvlášť.',
    `Súhlasom povoľujete:\n${GAME_CONSENT_SCOPE.map(s => `- ${s}`).join('\n')}`,
    'Hráčske meno je verejné, celé meno, vek ani e-mail sa v hre nezobrazujú.',
    { href: consentUrl, label: 'Potvrdiť súhlas s hrou' },
    'Ak o hre neviete, e-mail ignorujte. Bez súhlasu hráč nemôže robiť check-in, nahrávať klipy ani byť v crew.',
    'S pozdravom\nGOSko',
  ];
  return { subject: `Súhlas rodiča s hrou GOSko pre ${username}`, ...render(blocks) };
}

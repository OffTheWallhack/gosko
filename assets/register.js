/* Registrácia jazdca v2: čisté funkcie formulára (testujú sa v Node) a odoslanie na POST /api/register.
   Pass vzniká len z odpovede servera; localStorage je iba cache passov (kontrakt §6).
   Validácia zrkadlí api/_lib/validate.js, aby jazdec videl chybu hneď, rozhoduje však server. */
import { apiRequest, ApiError } from './api.js';

export const U16_LIMIT = 16;
/* Prvá možnosť je predvolená: meno a iniciála (audit M4, chráni hlavne jazdcov do 16 rokov). */
export const NAME_MODES = [
  { value: 'short', label: 'Meno a iniciála (napr. Marek K.)' },
  { value: 'full', label: 'Celé meno (napr. Marek Kupkovič)' },
  { value: 'nick', label: 'Prezývka' },
];
export const COUNTRIES = [
  { value: 'SK', label: 'Slovensko' }, { value: 'CZ', label: 'Česko' }, { value: 'AT', label: 'Rakúsko' }, { value: 'HU', label: 'Maďarsko' },
  { value: 'PL', label: 'Poľsko' }, { value: 'DE', label: 'Nemecko' }, { value: 'UA', label: 'Ukrajina' },
];

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const EMAIL_RE = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:]{2,}$/;
const NAME_RE = /^[\p{L}\p{M}][\p{L}\p{M} .'’-]*$/u;
const NICK_RE = /^[\p{L}\p{M}\p{N} ._'’-]+$/u;

function parseDate(s) {
  const m = DATE_RE.exec(String(s ?? ''));
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d ? { y, mo, d } : null;
}

/* Dnešný dátum na Slovensku ako 'YYYY-MM-DD'. */
export const todayIn = (now = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bratislava', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);

/* Plné roky k dátumu (narodený 29. 2. má v nepriestupnom roku narodeniny 1. 3.). */
export function ageAt(birthDate, atDate) {
  const b = parseDate(birthDate), a = parseDate(atDate);
  if (!b || !a) return NaN;
  let age = a.y - b.y;
  if (a.mo < b.mo || (a.mo === b.mo && a.d < b.d)) age -= 1;
  return age;
}

/* Jazdec do 16 rokov v deň eventu (event bez dátumu: k dnešku). Neplatný dátum = nie. */
export function isMinor(birthDate, eventDate, today = todayIn()) {
  const age = ageAt(birthDate, parseDate(eventDate) ? eventDate : today);
  return Number.isFinite(age) && age < U16_LIMIT;
}

export const categoryFor = (age, women) => (age < U16_LIMIT ? 'u16' : women ? 'women' : 'open');

const clean = v => (typeof v === 'string' ? v.normalize('NFC').replace(/\s+/g, ' ').trim() : '');
const opt = v => clean(v) || undefined;

/* Kontrola formulára pred odoslaním. v = hodnoty z formDialog (checkboxy ako boolean).
   opts = { eventDate, today, captchaRequired }. Vráti { ok, errors: { pole: text }, minor }. */
export function validateRegistration(v, opts = {}) {
  const today = opts.today || todayIn();
  const errors = {};
  const name = clean(v.legal_name);
  if (name.length < 2 || name.length > 60) errors.legal_name = 'Meno a priezvisko musí mať 2 až 60 znakov.';
  else if (!NAME_RE.test(name)) errors.legal_name = 'Meno môže obsahovať len písmená, medzery, bodku, spojovník a apostrof.';

  const nick = clean(v.nickname);
  if (nick && (nick.length > 30 || !NICK_RE.test(nick))) errors.nickname = 'Prezývka môže mať najviac 30 znakov (písmená, číslice, bodka, podčiarkovník).';
  if (v.public_name_mode === 'nick' && !nick) errors.nickname = 'Napíš prezývku, alebo vyber iné zobrazenie mena.';
  if (!NAME_MODES.some(m => m.value === v.public_name_mode)) errors.public_name_mode = 'Vyber, ako sa má zobraziť tvoje meno.';

  const bd = clean(v.birth_date);
  let minor = false;
  if (!parseDate(bd)) errors.birth_date = 'Zadaj platný dátum narodenia.';
  else if (bd > today) errors.birth_date = 'Dátum narodenia nemôže byť v budúcnosti.';
  else {
    const age = ageAt(bd, parseDate(opts.eventDate) ? opts.eventDate : today);
    if (!(age >= 6 && age <= 99)) errors.birth_date = 'Vek jazdca musí byť od 6 do 99 rokov.';
    minor = age < U16_LIMIT;
  }

  const email = clean(v.email).toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 254) errors.email = 'Zadaj platný e-mail.';
  if (!/^[A-Z]{2}$/.test(clean(v.country))) errors.country = 'Vyber krajinu.';
  const ig = clean(v.instagram).replace(/^@/, '');
  if (ig && !/^[A-Za-z0-9._]{1,30}$/.test(ig)) errors.instagram = 'Instagram nie je v správnom tvare.';
  if (clean(v.city).length > 60) errors.city = 'Mesto môže mať najviac 60 znakov.';

  if (minor) {
    const g = clean(v.guardian_email).toLowerCase();
    if (!g) errors.guardian_email = 'Jazdec do 16 rokov potrebuje súhlas rodiča. Zadaj e-mail rodiča alebo zákonného zástupcu.';
    else if (!EMAIL_RE.test(g)) errors.guardian_email = 'Zadaj platný e-mail rodiča.';
    else if (g === email) errors.guardian_email = 'E-mail rodiča musí byť iný ako e-mail jazdca.';
    const gn = clean(v.guardian_name);
    if (gn.length < 2 || gn.length > 60 || !NAME_RE.test(gn)) errors.guardian_name = 'Napíš meno rodiča alebo zákonného zástupcu.';
  }

  if (v.rules !== true) errors.rules = 'Bez súhlasu s pravidlami sa registrovať nedá.';
  if (v.privacy !== true) errors.privacy = 'Bez súhlasu so spracúvaním osobných údajov sa registrovať nedá.';
  if (opts.captchaRequired && !v.captcha) errors.captcha = 'Potvrď, že nie si robot.';
  return { ok: !Object.keys(errors).length, errors, minor };
}

/* Telo POST /api/register podľa kontraktu. Prázdne voliteľné polia sa neposielajú. */
export function buildPayload(v, eventId, turnstileToken) {
  const name = clean(v.legal_name);
  return {
    event_id: eventId, legal_name: name, display_name: name, nickname: opt(v.nickname), birth_date: clean(v.birth_date),
    email: clean(v.email).toLowerCase(), instagram: opt(clean(v.instagram).replace(/^@/, '')), country: clean(v.country), city: opt(v.city),
    women: v.women === true, guardian_name: opt(v.guardian_name), guardian_email: opt(clean(v.guardian_email).toLowerCase()),
    public_name_mode: v.public_name_mode, consents: { rules: v.rules === true, privacy: v.privacy === true, photo: v.photo === true, nft: v.nft === true },
    turnstile_token: turnstileToken || '',
  };
}

const BAD_PASS = 'Server nevrátil pass. Registráciu sme nepotvrdili, skús to znova alebo nám napíš.';
const toRecord = (p, date, status, now) => ({ token: p.token, eventId: p.event_id, event: p.event_name, date: date || '', name: p.public_name, category: p.category, status, created: now });

/* Odošle registráciu. save(pass) sa zavolá LEN pri úspechu s passom zo servera; pri chybe sa hodí UserError s textom zo servera.
   Známy jazdec (rovnaký e-mail a dátum narodenia) dostane status check_email bez passu: pass mu príde len e-mailom. */
export async function completeRegistration({ fetch, payload, ev, save, apiBase = '', now = Date.now() }) {
  const data = await apiRequest(fetch, `${apiBase}/api/register`, { method: 'POST', body: payload });
  if (data.status === 'check_email') return { status: 'check_email', pass: null };
  const p = data.pass;
  if (!p || typeof p.token !== 'string' || !p.token) throw new ApiError(BAD_PASS, { code: 'bad_response' });
  const rec = toRecord(p, ev?.date, data.status, now);
  save(rec);
  return { status: data.status, pass: rec };
}

/* Pass zo servera (GET /api/pass?token=) ako záznam do cache. eventDate(id) doplní dátum z data.js. */
export async function fetchPass(fetch, token, { apiBase = '', now = Date.now(), eventDate = () => '' } = {}) {
  const data = await apiRequest(fetch, `${apiBase}/api/pass?token=${encodeURIComponent(token)}`);
  const p = data.pass;
  if (!p || !p.token) throw new ApiError(BAD_PASS, { code: 'bad_response' });
  return toRecord(p, eventDate(p.event_id), p.status, now);
}

/* Uloží pass do zoznamu podľa tokenu (nový alebo obnovený ide navrch). */
export const upsertPass = (list, pass) => [pass, ...list.filter(p => p.token !== pass.token)];

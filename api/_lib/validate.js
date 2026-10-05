// Čisté funkcie validácie registrácie. Bez závislostí, bez I/O.

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const EMAIL_RE = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:]{2,}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EVENT_ID_RE = /^[a-z0-9][a-z0-9-]{0,59}$/;
// písmená všetkých abecied, medzera, bodka, spojovník, apostrof
const NAME_RE = /^[\p{L}\p{M}][\p{L}\p{M} .'’-]*$/u;
const NICK_RE = /^[\p{L}\p{M}\p{N} ._'’-]+$/u;

export const CATEGORIES = ['open', 'u16', 'women'];
export const NAME_MODES = ['full', 'short', 'nick'];
export const U16_LIMIT = 16;

export const isUuid = v => typeof v === 'string' && UUID_RE.test(v);
export const isEmail = v => typeof v === 'string' && v.length <= 254 && EMAIL_RE.test(v);
export const isEventId = v => typeof v === 'string' && EVENT_ID_RE.test(v);

function parseDate(s) {
  const m = DATE_RE.exec(String(s ?? ''));
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return { y, mo, d };
}
export const isDate = s => parseDate(s) !== null;

// Dnešný dátum na Slovensku ako 'YYYY-MM-DD'.
export function todayIn(now = new Date(), timeZone = 'Europe/Bratislava') {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

// Plné roky k dátumu (narodený 29. 2. má v nepriestupnom roku narodeniny 1. 3.).
export function ageAt(birthDate, atDate) {
  const b = parseDate(birthDate);
  const a = parseDate(atDate);
  if (!b || !a) return NaN;
  let age = a.y - b.y;
  if (a.mo < b.mo || (a.mo === b.mo && a.d < b.d)) age -= 1;
  return age;
}

export function categoryFor(age, women) {
  if (age < U16_LIMIT) return 'u16';
  return women ? 'women' : 'open';
}

// Zhodné s DB funkciou public_name (kontrakt §2).
export function publicName(displayName, nickname, mode) {
  const name = String(displayName ?? '').trim();
  const short = () => {
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length < 2) return name;
    return `${parts[0]} ${Array.from(parts[parts.length - 1])[0].toUpperCase()}.`;
  };
  if (mode === 'full') return name;
  if (mode === 'nick') return nickname && String(nickname).trim() ? String(nickname).trim() : short();
  return short();
}

const clean = v => (typeof v === 'string' ? v.normalize('NFC').replace(/\s+/g, ' ').trim() : '');
const bool = v => v === true;

function checkName(v, field, errors, { required = true } = {}) {
  const s = clean(v);
  if (!s) {
    if (required) errors[field] = 'Meno musí mať 2 až 60 znakov.';
    return null;
  }
  if (s.length < 2 || s.length > 60) errors[field] = 'Meno musí mať 2 až 60 znakov.';
  else if (!NAME_RE.test(s)) errors[field] = 'Meno môže obsahovať len písmená, medzery, bodku, spojovník a apostrof.';
  return s;
}

/**
 * Štrukturálna validácia vstupu z formulára. Povinnosť rodiča pri U16 rieši handler,
 * lebo závisí od dátumu eventu (vracia 422 guardian_required, nie 400).
 * @param {object} input
 * @param {{today?: string, eventDate?: string|null}} opts
 */
export function validateRegistration(input, opts = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, errors: { _: 'Chýbajú údaje registrácie.' } };
  }
  const today = opts.today || todayIn();
  const errors = {};
  const value = {};

  value.event_id = clean(input.event_id);
  if (!isEventId(value.event_id)) errors.event_id = 'Vyber event.';

  value.legal_name = checkName(input.legal_name, 'legal_name', errors);
  const display = clean(input.display_name);
  value.display_name = display ? checkName(display, 'display_name', errors) : value.legal_name;

  const nick = clean(input.nickname);
  value.nickname = nick || null;
  if (nick && (nick.length > 30 || !NICK_RE.test(nick))) errors.nickname = 'Prezývka môže mať najviac 30 znakov (písmená, číslice, bodka, podčiarkovník).';

  value.birth_date = clean(input.birth_date);
  if (!isDate(value.birth_date)) {
    errors.birth_date = 'Zadaj platný dátum narodenia.';
  } else if (value.birth_date > today) {
    errors.birth_date = 'Dátum narodenia nemôže byť v budúcnosti.';
  } else {
    const at = opts.eventDate && isDate(opts.eventDate) ? opts.eventDate : today;
    const age = ageAt(value.birth_date, at);
    if (!(age >= 6 && age <= 99)) errors.birth_date = 'Vek jazdca musí byť od 6 do 99 rokov.';
  }

  value.email = clean(input.email).toLowerCase();
  if (!isEmail(value.email)) errors.email = 'Zadaj platný e-mail.';

  const phone = clean(input.phone);
  value.phone = phone || null;
  if (phone && !/^\+?[0-9 ()/-]{6,30}$/.test(phone)) errors.phone = 'Telefón nie je v správnom tvare.';

  const ig = clean(input.instagram).replace(/^@/, '');
  value.instagram = ig || null;
  if (ig && !/^[A-Za-z0-9._]{1,30}$/.test(ig)) errors.instagram = 'Instagram nie je v správnom tvare.';

  value.country = clean(input.country).toUpperCase();
  if (!/^[A-Z]{2}$/.test(value.country)) errors.country = 'Krajina musí byť dvojpísmenový kód, napríklad SK.';

  const city = clean(input.city);
  value.city = city || null;
  if (city && city.length > 60) errors.city = 'Mesto môže mať najviac 60 znakov.';

  value.women = bool(input.women);

  value.public_name_mode = input.public_name_mode === undefined || input.public_name_mode === null || input.public_name_mode === ''
    ? 'full' : input.public_name_mode;
  if (!NAME_MODES.includes(value.public_name_mode)) errors.public_name_mode = 'Vyber, ako sa má zobraziť tvoje meno.';

  value.guardian_name = null;
  if (clean(input.guardian_name)) value.guardian_name = checkName(input.guardian_name, 'guardian_name', errors);
  const gEmail = clean(input.guardian_email).toLowerCase();
  value.guardian_email = gEmail || null;
  if (gEmail) {
    if (!isEmail(gEmail)) errors.guardian_email = 'Zadaj platný e-mail rodiča.';
    else if (gEmail === value.email) errors.guardian_email = 'E-mail rodiča musí byť iný ako e-mail jazdca.';
  }

  const c = input.consents && typeof input.consents === 'object' ? input.consents : {};
  value.consents = { rules: bool(c.rules), privacy: bool(c.privacy), photo: bool(c.photo), nft: bool(c.nft) };
  if (!value.consents.rules) errors.rules = 'Bez súhlasu s pravidlami sa registrovať nedá.';
  if (!value.consents.privacy) errors.privacy = 'Bez súhlasu so spracúvaním osobných údajov sa registrovať nedá.';

  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value };
}

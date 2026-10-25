// Čisté funkcie pre hru (Task 2): validácia onboardingu hráča. Bez I/O.
// Klient (assets/game/logic.js) má rovnaké pravidlá, rozhoduje však server.
import { U16_LIMIT, ageAt, isDate, isEmail } from './validate.js';

export const USERNAME_RE = /^[A-Za-z0-9_.]{3,20}$/;   // zhodné s CHECK v players (010)
export const STANCES = ['regular', 'goofy'];
const NAME_RE = /^[\p{L}\p{M}][\p{L}\p{M} .'’-]*$/u;

const clean = v => (typeof v === 'string' ? v.normalize('NFC').replace(/\s+/g, ' ').trim() : '');

/**
 * Vstup onboardingu. Údaje nového jazdca (meno, dátum narodenia, krajina) sú povinné len pri
 * newRider; dátum narodenia sa môže poslať aj pri napájaní (súrodenci s jedným e-mailom).
 * @param {object} input
 * @param {{today: string, newRider?: boolean}} opts
 */
export function validatePlayer(input, { today, newRider = false } = {}) {
  const src = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const errors = {};
  const value = {};

  value.username = clean(src.username);
  if (!USERNAME_RE.test(value.username)) errors.username = 'Nick musí mať 3 až 20 znakov: písmená bez diakritiky, číslice, bodka alebo podčiarkovník.';

  const city = clean(src.city);
  value.city = city || null;
  if (city.length > 60) errors.city = 'Mesto môže mať najviac 60 znakov.';

  value.stance = src.stance === undefined || src.stance === null || src.stance === '' ? null : src.stance;
  if (value.stance !== null && !STANCES.includes(value.stance)) errors.stance = 'Vyber regular alebo goofy.';

  const ig = clean(src.instagram).replace(/^@/, '');
  value.instagram = ig || null;
  if (ig && !/^[A-Za-z0-9._]{1,30}$/.test(ig)) errors.instagram = 'Instagram nie je v správnom tvare.';

  const birth = clean(src.birth_date);
  value.birth_date = birth || null;
  if (birth || newRider) {
    if (!isDate(birth)) errors.birth_date = 'Zadaj platný dátum narodenia.';
    else if (birth > today) errors.birth_date = 'Dátum narodenia nemôže byť v budúcnosti.';
    else {
      const age = ageAt(birth, today);
      if (!(age >= 6 && age <= 99)) errors.birth_date = 'Vek hráča musí byť od 6 do 99 rokov.';
    }
  }

  if (newRider) {
    value.name = clean(src.name);
    if (value.name.length < 2 || value.name.length > 60 || !NAME_RE.test(value.name)) errors.name = 'Napíš meno a priezvisko (2 až 60 písmen).';
    value.country = clean(src.country).toUpperCase();
    if (!/^[A-Z]{2}$/.test(value.country)) errors.country = 'Vyber krajinu.';
  }

  const gName = clean(src.guardian_name);
  value.guardian_name = gName || null;
  if (gName && (gName.length > 60 || !NAME_RE.test(gName))) errors.guardian_name = 'Meno rodiča môže obsahovať len písmená (najviac 60).';
  const gEmail = clean(src.guardian_email).toLowerCase();
  value.guardian_email = gEmail || null;
  if (gEmail && !isEmail(gEmail)) errors.guardian_email = 'Zadaj platný e-mail rodiča.';

  const c = src.consents && typeof src.consents === 'object' ? src.consents : {};
  if (c.rules !== true) errors.rules = 'Bez súhlasu s pravidlami hry sa hrať nedá.';
  if (c.privacy !== true) errors.privacy = 'Bez súhlasu so spracúvaním osobných údajov sa hrať nedá.';

  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value };
}

/** Potrebuje hráč súhlas rodiča? (dnes mladší ako 16) */
export const needsGuardian = (birthDate, today) => ageAt(birthDate, today) < U16_LIMIT;

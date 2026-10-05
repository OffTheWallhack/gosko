import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ageAt, categoryFor, validateRegistration, publicName, isUuid, todayIn } from '../../../api/_lib/validate.js';

const good = (over = {}) => ({
  event_id: 'bratislava-2026-11',
  legal_name: 'Marek Kováč',
  birth_date: '2000-04-10',
  email: ' Marek@Example.SK ',
  country: 'sk',
  public_name_mode: 'short',
  consents: { rules: true, privacy: true, photo: false, nft: true },
  ...over,
});

test('ageAt: plné roky k dátumu eventu', () => {
  assert.equal(ageAt('2010-11-21', '2026-11-21'), 16);
  assert.equal(ageAt('2010-11-22', '2026-11-21'), 15);
  assert.equal(ageAt('2000-01-01', '2026-05-31'), 26);
});

test('ageAt: narodený 29. 2. má narodeniny v nepriestupnom roku až 1. 3.', () => {
  assert.equal(ageAt('2008-02-29', '2024-02-28'), 15);
  assert.equal(ageAt('2008-02-29', '2024-02-29'), 16);
  assert.equal(ageAt('2008-02-29', '2025-02-28'), 16);
  assert.equal(ageAt('2009-02-28', '2025-02-28'), 16);
});

test('ageAt: neplatný dátum vráti NaN', () => {
  assert.ok(Number.isNaN(ageAt('2010-13-01', '2026-01-01')));
  assert.ok(Number.isNaN(ageAt('nie', '2026-01-01')));
});

test('categoryFor: u16 podľa veku, women len od 16', () => {
  assert.equal(categoryFor(15, false), 'u16');
  assert.equal(categoryFor(15, true), 'u16');
  assert.equal(categoryFor(16, false), 'open');
  assert.equal(categoryFor(16, true), 'women');
  assert.equal(categoryFor(40, true), 'women');
});

test('validateRegistration: platný vstup sa normalizuje', () => {
  const r = validateRegistration(good({ instagram: '@marek.k', display_name: '  Marek  ', women: 'nie' }), { today: '2026-10-05' });
  assert.equal(r.ok, true);
  assert.equal(r.value.email, 'marek@example.sk');
  assert.equal(r.value.country, 'SK');
  assert.equal(r.value.instagram, 'marek.k');
  assert.equal(r.value.display_name, 'Marek');
  assert.equal(r.value.women, false);
  assert.equal(r.value.consents.nft, true);
  assert.equal(r.value.consents.photo, false);
});

test('validateRegistration: display_name chýba, použije sa legal_name', () => {
  const r = validateRegistration(good(), { today: '2026-10-05' });
  assert.equal(r.value.display_name, 'Marek Kováč');
  assert.equal(r.value.public_name_mode, 'short');
});

test('validateRegistration: chyby po slovensky pre každé pole', () => {
  const r = validateRegistration({
    event_id: '', legal_name: 'M', birth_date: '2030-01-01', email: 'zly', country: 'Slovensko',
    public_name_mode: 'xyz', consents: { rules: false, privacy: false },
  }, { today: '2026-10-05' });
  assert.equal(r.ok, false);
  for (const f of ['event_id', 'legal_name', 'birth_date', 'email', 'country', 'public_name_mode', 'rules', 'privacy']) {
    assert.ok(r.errors[f], 'chýba chyba pre ' + f);
    assert.ok(!r.errors[f].includes('\u2014'), 'dlhá pomlčka v hláške');
  }
});

test('validateRegistration: vek mimo 6 až 99 rokov', () => {
  assert.match(validateRegistration(good({ birth_date: '2022-01-01' }), { today: '2026-10-05' }).errors.birth_date, /6 do 99/);
  assert.match(validateRegistration(good({ birth_date: '1900-01-01' }), { today: '2026-10-05' }).errors.birth_date, /6 do 99/);
});

test('validateRegistration: vek sa overí k dátumu eventu, ak je zadaný', () => {
  // k dnešku má 5 rokov, k eventu už 6
  const r = validateRegistration(good({ birth_date: '2020-11-01' }), { today: '2026-10-05', eventDate: '2026-11-21' });
  assert.equal(r.ok, true);
});

test('validateRegistration: meno nad 60 znakov a nepovolené znaky', () => {
  assert.ok(validateRegistration(good({ legal_name: 'a'.repeat(61) }), { today: '2026-10-05' }).errors.legal_name);
  assert.ok(validateRegistration(good({ legal_name: 'Marek <script>' }), { today: '2026-10-05' }).errors.legal_name);
});

test('validateRegistration: e-mail rodiča musí byť platný a iný ako e-mail jazdca', () => {
  assert.ok(validateRegistration(good({ guardian_email: 'zly' }), { today: '2026-10-05' }).errors.guardian_email);
  assert.ok(validateRegistration(good({ guardian_email: 'MAREK@example.sk' }), { today: '2026-10-05' }).errors.guardian_email);
  const ok = validateRegistration(good({ guardian_email: 'Mama@Example.sk', guardian_name: 'Jana Kováčová' }), { today: '2026-10-05' });
  assert.equal(ok.value.guardian_email, 'mama@example.sk');
});

test('validateRegistration: neobjekt', () => {
  assert.equal(validateRegistration(null).ok, false);
});

test('publicName: full, short, nick a nick bez prezývky', () => {
  assert.equal(publicName('Marek Kováč', null, 'full'), 'Marek Kováč');
  assert.equal(publicName('Marek Ján Kováč', null, 'short'), 'Marek K.');
  assert.equal(publicName('Marek', null, 'short'), 'Marek');
  assert.equal(publicName('Marek Kováč', 'Kovo', 'nick'), 'Kovo');
  assert.equal(publicName('Marek Kováč', '', 'nick'), 'Marek K.');
});

test('isUuid', () => {
  assert.equal(isUuid('8b0f6c1e-3c4d-4e5f-8a9b-0c1d2e3f4a5b'), true);
  assert.equal(isUuid('nie'), false);
  assert.equal(isUuid(undefined), false);
});

test('todayIn: dátum v Europe/Bratislava', () => {
  assert.equal(todayIn(new Date('2026-10-05T22:30:00Z')), '2026-10-06');
  assert.equal(todayIn(new Date('2026-10-05T10:00:00Z')), '2026-10-05');
});

// Prihlásenie: prepínač CONFIG.LOGIN_MODE, kontrola formulára, hlášky chýb Supabase Auth, výsledok registrácie.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { loginMode, credentialsError, loginErrorMessage, signUpOutcome, MIN_PASSWORD } from '../../assets/login.js';
import { CONFIG } from '../../data.js';

describe('loginMode', () => {
  test('predvolené je heslo', () => {
    assert.equal(loginMode({}), 'password');
    assert.equal(loginMode(), 'password');
    assert.equal(loginMode({ LOGIN_MODE: '' }), 'password');
  });
  test('magic a password sa dajú prepnúť (aj veľkými písmenami, s medzerami)', () => {
    assert.equal(loginMode({ LOGIN_MODE: 'magic' }), 'magic');
    assert.equal(loginMode({ LOGIN_MODE: ' MAGIC ' }), 'magic');
    assert.equal(loginMode({ LOGIN_MODE: 'password' }), 'password');
  });
  test('neznáma hodnota (preklep) nevypne prihlásenie: password', () => {
    assert.equal(loginMode({ LOGIN_MODE: 'otp' }), 'password');
    assert.equal(loginMode({ LOGIN_MODE: 42 }), 'password');
  });
  test('data.js je teraz na hesle', () => assert.equal(loginMode(CONFIG), 'password'));
});

describe('credentialsError', () => {
  test('prihlásenie: e-mail a neprázdne heslo', () => {
    assert.equal(credentialsError({ email: 'a@b.sk', password: 'x' }), '');
    assert.match(credentialsError({ email: 'zly', password: 'x' }), /e-mail/);
    assert.match(credentialsError({ email: 'a@b.sk', password: '' }), /heslo/i);
  });
  test('registrácia: dĺžka hesla a zhoda', () => {
    const ok = 'a'.repeat(MIN_PASSWORD);
    assert.equal(credentialsError({ email: 'a@b.sk', password: ok, password2: ok }, { signUp: true }), '');
    assert.match(credentialsError({ email: 'a@b.sk', password: 'kratke', password2: 'kratke' }, { signUp: true }), /aspoň/);
    assert.match(credentialsError({ email: 'a@b.sk', password: ok, password2: ok + 'x' }, { signUp: true }), /nezhodujú/);
  });
});

describe('loginErrorMessage', () => {
  test('nepotvrdený e-mail má jasnú hlášku', () => {
    assert.match(loginErrorMessage({ code: 'email_not_confirmed', status: 400 }), /nie je potvrdený/);
    assert.match(loginErrorMessage({ message: 'Email not confirmed' }), /nie je potvrdený/);
  });
  test('zlé heslo, existujúci účet, slabé heslo, limit', () => {
    assert.equal(loginErrorMessage({ code: 'invalid_credentials' }), 'Nesprávny e-mail alebo heslo.');
    assert.equal(loginErrorMessage({ message: 'Invalid login credentials' }), 'Nesprávny e-mail alebo heslo.');
    assert.match(loginErrorMessage({ code: 'user_already_exists' }), /už existuje/);
    assert.match(loginErrorMessage({ code: 'weak_password' }), /slabé/);
    assert.match(loginErrorMessage({ status: 429 }), /Veľa pokusov/);
  });
  test('neznáma chyba neprezradí detail', () => {
    assert.equal(loginErrorMessage(new Error('fetch failed: secret detail')), 'Prihlásenie sa nepodarilo. Skús to znova.');
    assert.equal(loginErrorMessage(null), 'Prihlásenie sa nepodarilo. Skús to znova.');
  });
});

describe('signUpOutcome', () => {
  test('so session je hneď prihlásený (potvrdzovanie e-mailu vypnuté)', () => assert.equal(signUpOutcome({ session: {}, user: {} }), 'signed_in'));
  test('bez session treba potvrdiť e-mail', () => assert.equal(signUpOutcome({ session: null, user: { identities: [{}] } }), 'confirm_email'));
  test('existujúci e-mail (prázdne identities)', () => assert.equal(signUpOutcome({ session: null, user: { identities: [] } }), 'exists'));
});

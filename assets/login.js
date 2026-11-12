/* Prihlásenie (admin, hlasovanie, fotky, hra). Bez DOM, testuje sa v Node (tests/unit/login.test.js).
   CONFIG.LOGIN_MODE: 'password' = e-mail a heslo (predvolené), 'magic' = kód alebo odkaz z e-mailu (signInWithOtp).
   Prepnutie späť na kód z e-mailu: v data.js nastav LOGIN_MODE: 'magic'. */
export const LOGIN_MODES = ['password', 'magic'];
export const MIN_PASSWORD = 8;

/* Neznáma alebo prázdna hodnota = 'password', aby preklep v data.js nevypol prihlásenie. */
export function loginMode(config = {}) {
  const m = String(config.LOGIN_MODE || '').trim().toLowerCase();
  return LOGIN_MODES.includes(m) ? m : 'password';
}

const isEmail = s => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s || '');

/* Kontrola formulára pred odoslaním. Vráti text chyby alebo ''. signUp: aj druhé heslo. */
export function credentialsError({ email, password, password2 } = {}, { signUp = false } = {}) {
  if (!isEmail(String(email || '').trim())) return 'Skontroluj e-mail.';
  if (!password) return 'Zadaj heslo.';
  if (signUp) {
    if (password.length < MIN_PASSWORD) return `Heslo musí mať aspoň ${MIN_PASSWORD} znakov.`;
    if (password !== password2) return 'Heslá sa nezhodujú.';
  }
  return '';
}

/* Chyba Supabase Auth (AuthApiError: code, status, message) -> text pre človeka. */
export function loginErrorMessage(err) {
  const code = err?.code || err?.error_code || '';
  const msg = String(err?.message || err?.msg || '');
  if (code === 'email_not_confirmed' || /email not confirmed/i.test(msg))
    return 'E-mail ešte nie je potvrdený. Klikni na odkaz v e-maile, ktorý sme ti poslali po registrácii (pozri aj spam), potom sa prihlás.';
  if (code === 'invalid_credentials' || /invalid login credentials/i.test(msg)) return 'Nesprávny e-mail alebo heslo.';
  if (code === 'user_already_exists' || code === 'email_exists' || /already registered/i.test(msg))
    return 'Účet s týmto e-mailom už existuje. Prihlás sa heslom.';
  if (code === 'weak_password' || /password should be/i.test(msg)) return `Heslo je príliš slabé. Použi aspoň ${MIN_PASSWORD} znakov, písmená aj čísla.`;
  if (code === 'signup_disabled' || /signups not allowed/i.test(msg)) return 'Registrácia nových účtov je vypnutá.';
  if (code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit' || err?.status === 429)
    return 'Veľa pokusov za krátky čas. Skús to o chvíľu.';
  return 'Prihlásenie sa nepodarilo. Skús to znova.';
}

/* Výsledok signUp: { session } -> hneď prihlásený; bez session -> treba potvrdiť e-mail.
   Supabase pri existujúcom e-maile (s potvrdzovaním) vracia používateľa bez identít a nič nepošle. */
export function signUpOutcome(data = {}) {
  if (data.session) return 'signed_in';
  if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) return 'exists';
  return 'confirm_email';
}

/* Zabudnuté heslo: kontrola e-mailu pred odoslaním reset e-mailu. Vráti text chyby alebo ''. */
export function resetRequestError({ email } = {}) {
  return isEmail(String(email || '').trim()) ? '' : 'Skontroluj e-mail.';
}

/* Nové heslo po kliknutí na odkaz z reset e-mailu. Vráti text chyby alebo ''. */
export function newPasswordError({ password, password2 } = {}) {
  if (!password || password.length < MIN_PASSWORD) return `Heslo musí mať aspoň ${MIN_PASSWORD} znakov.`;
  if (password !== password2) return 'Heslá sa nezhodujú.';
  return '';
}

/* Chyba pri posielaní reset e-mailu / ukladaní nového hesla -> text pre človeka. */
export function resetErrorMessage(err) {
  const code = err?.code || err?.error_code || '';
  const msg = String(err?.message || err?.msg || '');
  if (code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit' || err?.status === 429 || /rate limit/i.test(msg))
    return 'Poslali sme už veľa e-mailov. Počkaj pár minút a skús to znova.';
  if (code === 'same_password' || /different from the old/i.test(msg)) return 'Nové heslo musí byť iné ako staré.';
  if (code === 'weak_password' || /password should be/i.test(msg)) return `Heslo je príliš slabé. Použi aspoň ${MIN_PASSWORD} znakov, písmená aj čísla.`;
  if (code === 'session_not_found' || code === 'not_authenticated' || /session/i.test(msg)) return 'Odkaz z e-mailu už vypršal. Pošli si nový cez „Zabudol som heslo“.';
  return 'Nepodarilo sa. Skús to znova.';
}

/* Je to návrat z reset e-mailu? (Supabase pridá do adresy type=recovery.) */
export function isRecoveryUrl(hash = '', search = '') {
  return /(^|[#&?])type=recovery(&|$)/.test(String(hash) + '&' + String(search).replace(/^\?/, ''));
}

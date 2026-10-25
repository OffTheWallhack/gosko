// Testovacie dáta pre tests/integration/db (zapisuje superuser cez psql).
import { randomBytes, randomUUID } from 'node:crypto';
import { sql } from '../../helpers/stack.js';

export const DENIED = [401, 403];

/** SQL literál (alebo null). */
export const lit = v => (v === null || v === undefined ? 'null' : `'${String(v).replace(/'/g, "''")}'`);

export const riderRef = () => `0x${randomBytes(32).toString('hex')}`;

export function createRider({
  display_name = 'Test Jazdec', nickname = null, mode = 'full', country = 'SK', city = null,
  legal_name, birth_date = '2000-01-01', email, is_founder = false,
} = {}) {
  const id = randomUUID();
  sql(`insert into public.riders (id, rider_ref, display_name, nickname, country, city, public_name_mode, is_founder)
         values (${lit(id)}, ${lit(riderRef())}, ${lit(display_name)}, ${lit(nickname)}, ${lit(country)}, ${lit(city)}, ${lit(mode)}, ${is_founder});
       insert into public.rider_private (rider_id, legal_name, birth_date, email)
         values (${lit(id)}, ${lit(legal_name || display_name)}, ${lit(birth_date)}, ${lit(email || `${id}@test.local`)});`);
  return id;
}

export function createRegistration({
  rider_id, event_id = 'bratislava-2', category = 'open', status = 'confirmed',
  guardian_token = null, guardian_confirmed_at = null, nft_consent = true,
} = {}) {
  const id = randomUUID();
  sql(`insert into public.registrations (id, rider_id, event_id, category, status, consent_version, consent_at,
                                          nft_consent, guardian_token, guardian_confirmed_at)
         values (${lit(id)}, ${lit(rider_id)}, ${lit(event_id)}, ${lit(category)}, ${lit(status)}, '2026-10', now(),
                 ${nft_consent}, ${lit(guardian_token)}, ${lit(guardian_confirmed_at)});`);
  return id;
}

export function createNftToken({ registration_id, status = 'minted', token_id = null, chain_id = 31337 } = {}) {
  sql(`insert into public.nft_tokens (registration_id, chain_id, contract, token_id, status)
         values (${lit(registration_id)}, ${chain_id}, '0x5FbDB2315678afecb367f032d93F642f64180aa3', ${token_id ?? 'null'}, ${lit(status)});`);
}

/** Rider + registrácia na jeden krok. */
export function riderWithRegistration(rider = {}, registration = {}) {
  const rider_id = createRider(rider);
  const registration_id = createRegistration({ rider_id, ...registration });
  return { rider_id, registration_id };
}

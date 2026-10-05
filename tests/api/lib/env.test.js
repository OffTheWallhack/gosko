import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readEnv, validateEnv, nftEnabled, restUrlFor } from '../../../api/_lib/env.js';

test('readEnv: predvolené hodnoty podľa kontraktu §1', () => {
  const env = readEnv({ SUPABASE_URL: 'https://x.supabase.co/' });
  assert.equal(env.SUPABASE_URL, 'https://x.supabase.co');
  assert.equal(env.SUPABASE_AUTH_URL, 'https://x.supabase.co/auth/v1');
  assert.equal(env.SUPABASE_REST_URL, 'https://x.supabase.co/rest/v1');
  assert.equal(env.MAIL_FROM, 'GOSko <registracia@gosko.sk>');
  assert.equal(env.PUBLIC_BASE_URL, 'https://gosko.sk');
  assert.equal(env.CONSENT_VERSION, '2026-10');
  assert.equal(env.RATE_LIMIT_PER_10MIN, 5);
  assert.equal(env.TURNSTILE_SECRET_KEY, '');
  assert.equal(env.NFT_CONTRACT_ADDRESS, '');
  assert.equal(env.production, false);
});

test('readEnv: lomka na konci PUBLIC_BASE_URL sa odstráni, čísla sa parsujú', () => {
  const env = readEnv({ PUBLIC_BASE_URL: 'https://gosko.sk/', CHAIN_ID: '84532', RATE_LIMIT_PER_10MIN: '7', NODE_ENV: 'production' });
  assert.equal(env.PUBLIC_BASE_URL, 'https://gosko.sk');
  assert.equal(env.CHAIN_ID, 84532);
  assert.equal(env.RATE_LIMIT_PER_10MIN, 7);
  assert.equal(env.production, true);
});

test('readEnv: neplatný limit spadne na default 5', () => {
  assert.equal(readEnv({ RATE_LIMIT_PER_10MIN: 'abc' }).RATE_LIMIT_PER_10MIN, 5);
  assert.equal(readEnv({ RATE_LIMIT_PER_10MIN: '0' }).RATE_LIMIT_PER_10MIN, 5);
});

test('restUrlFor: lokálny PostgREST bez /rest/v1, Supabase s /rest/v1, explicitný override', () => {
  assert.equal(restUrlFor('http://127.0.0.1:3901'), 'http://127.0.0.1:3901');
  assert.equal(restUrlFor('http://localhost:3901'), 'http://localhost:3901');
  assert.equal(restUrlFor('https://abc.supabase.co'), 'https://abc.supabase.co/rest/v1');
  assert.equal(readEnv({ SUPABASE_URL: 'http://127.0.0.1:54321', SUPABASE_REST_URL: 'http://127.0.0.1:54321/rest/v1/' }).SUPABASE_REST_URL, 'http://127.0.0.1:54321/rest/v1');
});

test('validateEnv: hlási chýbajúce povinné premenné', () => {
  const problems = validateEnv(readEnv({}));
  assert.ok(problems.some(p => p.includes('SUPABASE_URL')));
  assert.ok(problems.some(p => p.includes('SUPABASE_SERVICE_ROLE_KEY')));
});

test('validateEnv: NFT zapnuté vyžaduje platnú adresu, kľúč a RPC', () => {
  const env = readEnv({ SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'k', NFT_CONTRACT_ADDRESS: 'nie-adresa' });
  const p = validateEnv(env);
  assert.ok(p.some(x => x.includes('NFT_CONTRACT_ADDRESS')));
  assert.ok(p.some(x => x.includes('MINTER_PRIVATE_KEY')));
  assert.ok(p.some(x => x.includes('RPC_URL')));
});

test('validateEnv: v produkcii bez Turnstile a bez CRON_SECRET je to problém', () => {
  const env = readEnv({ SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'k', NODE_ENV: 'production' });
  const p = validateEnv(env);
  assert.ok(p.some(x => x.includes('TURNSTILE_SECRET_KEY')));
  assert.ok(p.some(x => x.includes('CRON_SECRET')));
});

test('nftEnabled: len pri vyplnenej adrese kontraktu', () => {
  assert.equal(nftEnabled(readEnv({})), false);
  assert.equal(nftEnabled(readEnv({ NFT_CONTRACT_ADDRESS: '0x5FbDB2315678afecb367f032d93F642f64180aa3' })), true);
});

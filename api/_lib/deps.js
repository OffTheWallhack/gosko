// Predvolené závislosti handlerov. Nič tu nevolá sieť pri importe.
// Chain (viem) sa pridáva len v handleroch, ktoré ho potrebujú (withChain).
import { randomBytes, randomUUID } from 'node:crypto';
import { readEnv } from './env.js';
import { createDb } from './db.js';
import { createMailer } from './mail.js';
import { createTurnstile } from './turnstile.js';
import { createAuth } from './auth.js';

export function baseDeps(src = process.env) {
  const env = readEnv(src);
  const log = console;
  const db = createDb({ url: env.SUPABASE_REST_URL, key: env.SUPABASE_SERVICE_ROLE_KEY });
  return {
    env,
    log,
    db,
    fetch: globalThis.fetch,
    now: () => new Date(),
    randomBytes,
    uuid: randomUUID,
    mail: createMailer({ env, log }),
    turnstile: createTurnstile({ env, log }),
    auth: createAuth({ env, db }),
  };
}

/* Stav hráča: prihlásenie (Supabase Auth, e-mailový odkaz alebo kód zo store.login) a profil hráča
   (game_me). Po kliknutí na odkaz v e-maile sa web otvorí na úvode; return.js vráti hráča späť do hry. */
import { createGameApi } from './api.js';
import { playerMode } from './logic.js';
export { rememberReturn, consumeReturn } from './return.js';

let cached = null;
/* Jedna inštancia API na store (Supabase klient je v store.client). Bez klienta (demo, offline) null. */
export function gameApi(store, apiBase = '') {
  if (!store?.client) return null;
  if (!cached || cached.client !== store.client) cached = { client: store.client, api: createGameApi({ sb: store.client, apiBase }) };
  return cached.api;
}

/* { signedIn, me, mode } ; me = game_me() alebo null */
export async function loadPlayer(api) {
  const signedIn = await api.signedIn();
  const me = signedIn ? await api.me().catch(err => { console.error(err); return null; }) : null;
  return { signedIn, me, mode: playerMode({ signedIn, me }) };
}

// Testovacie dáta pre hernú časť (010–012). Zapisuje superuser cez psql.
import { randomUUID } from 'node:crypto';
import { sql, rest } from '../../helpers/stack.js';
import { createRider, createRegistration, lit } from './_fixtures.js';

// Spot pri Ružinove (blízko pravdy stačí, ide o test vzdialenosti).
export const SPOT = { lat: 48.1500, lng: 17.1500 };

/** Dátum narodenia pre vek `years` k dnešku (narodeniny boli včera, nezávisle od časového pásma DB). */
export function birthDateForAge(years) {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - years);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Hráč = auth.users + jazdec (riders, rider_private) + players.
 * age: vek dnes; guardian: potvrdenie rodiča pre hru (players.guardian_confirmed_at).
 */
export function createPlayer({ age = 20, guardian = false, username } = {}) {
  const id = randomUUID();
  const rider_id = createRider({ display_name: 'Hráč Test', birth_date: birthDateForAge(age), email: `${id}@test.local` });
  const name = username || `p_${id.slice(0, 8)}`;
  sql(`insert into auth.users (id, email, email_confirmed_at) values (${lit(id)}, ${lit(`${id}@test.local`)}, now());
       insert into public.players (id, rider_id, username, guardian_confirmed_at)
         values (${lit(id)}, ${lit(rider_id)}, ${lit(name)}, ${guardian ? 'now()' : 'null'});`);
  return { id, rider_id, username: name };
}

/** Schválený spot (superuser), vráti id. */
export function createSpot({ lat = SPOT.lat, lng = SPOT.lng, name = 'Test spot', approved = true } = {}) {
  const id = randomUUID();
  sql(`insert into public.spots (id, user_id, name, city, kind, lat, lng, approved)
         values (${lit(id)}, null, ${lit(name)}, 'Bratislava', 'park', ${lat}, ${lng}, ${approved})`);
  return id;
}

/** Bod `meters` severne od (lat, lng). */
export const north = (meters, { lat, lng } = SPOT) => ({ lat: lat + meters / 111320, lng });

/** RPC ako prihlásený hráč. */
export const rpc = (fn, player, body = {}) => rest(`/rpc/${fn}`, { method: 'POST', as: 'authenticated', sub: player?.id ?? player, body });

let crewSeq = 0;
/** Jedinečný 4-znakový tag (Z + 3 písmená), aby nekolidoval s tagmi z testov. */
const nextTag = () => { const n = crewSeq++; return 'Z' + [2, 1, 0].map(i => String.fromCharCode(65 + Math.floor(n / 26 ** i) % 26)).join(''); };

/** Hráč vytvorí crew cez RPC, vráti id crew. */
export async function makeCrew(owner, { name, tag } = {}) {
  const res = await rpc('create_crew', owner, { p_name: name || `Crew ${randomUUID().slice(0, 8)}`, p_tag: tag || nextTag(), p_color: '#ff3366' });
  if (res.status !== 200) throw new Error(`create_crew ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.id;
}

/** Vloží check-in priamo (superuser), napr. so začiatkom v minulosti. */
export function insertCheckIn({ player, spot, crew = null, startedMinAgo = 0, endedMinAgo = null }) {
  const id = randomUUID();
  sql(`insert into public.check_ins (id, player_id, spot_id, crew_id, distance_m, started_at, ended_at)
         values (${lit(id)}, ${lit(player.id ?? player)}, ${lit(spot)}, ${lit(crew)}, 0,
                 now() - interval '${startedMinAgo} minutes',
                 ${endedMinAgo === null ? 'null' : `now() - interval '${endedMinAgo} minutes'`})`);
  return id;
}

/** Overený klip priamo (superuser) s počtom lajkov od nových hráčov. */
export function insertClip({ player, spot, crew = null, verified = true, likes = 0, minAgo = 0 }) {
  const id = randomUUID();
  sql(`insert into public.clips (id, player_id, spot_id, crew_id, media_url, media_kind, verified, created_at)
         values (${lit(id)}, ${lit(player.id ?? player)}, ${lit(spot)}, ${lit(crew)}, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'embed', ${verified},
                 now() - interval '${minAgo} minutes')`);
  for (let i = 0; i < likes; i++) {
    const fan = createPlayer();
    sql(`insert into public.clip_likes (clip_id, player_id) values (${lit(id)}, ${lit(fan.id)})`);
  }
  return id;
}

export { createRegistration };

/* Check-in a check-out cez GPS. Poloha sa pošle iba do check_in (server ju neukladá, kontrakt §8).
   Chyby polohy aj servera majú slovenskú hlášku (logic.js). Prvý check-in hráča = achievement. */
import { T } from './i18n-sk.js';
import { checkoutMessage, geoErrorMessage } from './logic.js';
import { UserError } from '../util.js';

/* Jedna poloha z GPS. Chyba je UserError s hláškou pre hráča. */
export function currentPosition(geo = globalThis.navigator?.geolocation, { timeout = 15000 } = {}) {
  return new Promise((resolve, reject) => {
    if (!geo || typeof geo.getCurrentPosition !== 'function') return reject(new UserError(geoErrorMessage({ code: 'unsupported' })));
    geo.getCurrentPosition(
      p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      err => reject(new UserError(geoErrorMessage(err))),
      { enableHighAccuracy: true, timeout, maximumAge: 10_000 });
  });
}

/* Check-in na spot. Vráti { row, first, message }. Chyba: UserError / GameError s hláškou. */
export async function doCheckIn(api, spot, { geo } = {}) {
  const pos = await currentPosition(geo);
  const row = await api.checkIn(spot.id, pos.lat, pos.lng);
  let first = false;
  try { first = (await api.checkinCount()) === 1; } catch { /* achievement nie je dôležitý */ }
  return { row, first, message: T.checkin.ok(spot.name) };
}

export async function doCheckOut(api) {
  const out = await api.checkOut();
  return { out, message: checkoutMessage(out) };
}

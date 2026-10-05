// Pass pre jazdca: verejné meno podľa public_name_mode, bez osobných údajov.
import { eq } from './db.js';
import { publicName } from './validate.js';

export const passUrl = (env, token) => `${env.PUBLIC_BASE_URL}/#/pass/${token}`;
export const consentUrl = (env, guardianToken) => `${env.PUBLIC_BASE_URL}/api/consent?token=${guardianToken}`;

export async function loadRider(db, riderId) {
  return db.selectOne('riders', { id: eq(riderId) }, { select: 'id,display_name,nickname,public_name_mode,is_founder' });
}

export async function loadEvent(db, eventId) {
  return db.selectOne('events', { id: eq(eventId) }, { select: 'id,name,city,date,season,status,registration_open,capacity' });
}

export const riderPublicName = rider => (rider ? publicName(rider.display_name, rider.nickname, rider.public_name_mode) : '');

export function passOf(reg, event, rider, { withStatus = false } = {}) {
  const pass = {
    token: reg.token,
    event_id: reg.event_id,
    event_name: event?.name || reg.event_id,
    public_name: riderPublicName(rider),
    category: reg.category,
  };
  if (withStatus) pass.status = reg.status;
  return pass;
}

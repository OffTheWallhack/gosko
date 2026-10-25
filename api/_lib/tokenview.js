// Verejný pohľad na token pre metadáta a obrázok. Číta len stĺpce bez osobných údajov:
// nikdy legal_name, email, birth_date, nickname ani display_name.
import { eq } from './db.js';

// Kolá, v ktorých jazdci s riders.is_founder dostanú pás ZAKLADATEĽ.
export const FOUNDER_EVENT_IDS = ['bratislava-2026-05'];
export const CATEGORY_NAME = { open: 'Open', u16: 'U16', women: 'Babská' };
const VISIBLE = ['minted', 'result_pending', 'result_set'];

export const isTokenId = v => typeof v === 'string' && /^[1-9][0-9]{0,15}$/.test(v);

export async function loadTokenView({ db, env }, tokenId) {
  if (!isTokenId(tokenId) || !env.NFT_CONTRACT_ADDRESS) return null;
  const tok = await db.selectOne('nft_tokens', {
    token_id: eq(tokenId),
    chain_id: eq(env.CHAIN_ID),
    contract: eq(env.NFT_CONTRACT_ADDRESS.toLowerCase()),
  }, { select: 'registration_id,token_id,status' });
  if (!tok || !VISIBLE.includes(tok.status)) return null;

  const reg = await db.selectOne('registrations', { id: eq(tok.registration_id) }, { select: 'id,event_id,category,rider_id' });
  if (!reg) return null;
  const [event, result, rider] = await Promise.all([
    db.selectOne('events', { id: eq(reg.event_id) }, { select: 'id,name,city,date,season' }),
    db.selectOne('event_results', { registration_id: eq(reg.id) }, { select: 'place,points' }),
    db.selectOne('riders', { id: eq(reg.rider_id) }, { select: 'is_founder' }),
  ]);
  const date = event?.date || null;
  const year = date ? date.slice(0, 4) : (event?.season ? String(event.season) : '');
  return {
    tokenId,
    eventId: reg.event_id,
    eventName: event?.name || 'GOSko',
    city: event?.city || '',
    date,
    year,
    category: reg.category,
    categoryName: CATEGORY_NAME[reg.category] || reg.category,
    place: result ? Number(result.place) : null,
    points: result ? Number(result.points) : null,
    founder: Boolean(rider?.is_founder) && FOUNDER_EVENT_IDS.includes(reg.event_id),
  };
}

// GET /api/nft/loot/:id : metadáta typu GoskoLoot (ERC-1155). Rovnaké pre všetkých držiteľov, bez osobných údajov.
// ERC-1155 klient dosadí do {id} 64-znakové hex číslo, preto platí aj tento tvar.
import { baseDeps } from '../../_lib/deps.js';
import { allowMethods, pathParam, send, sendError } from '../../_lib/http.js';

export const LOOT_TYPES = Object.freeze({
  1: { name: 'Ghost drop', description: 'Odmena z loot dropu na skate spote v hre Ghoskate: check-in, overený klip a kód.' },
  2: { name: 'Park pass', description: 'Záznam o jazdení v skateparku v hre Ghoskate.' },
  3: { name: 'Trick card', description: 'Karta triku z hry Ghoskate.' },
  4: { name: 'Crew founder', description: 'Záznam o založení alebo členstve v crew v hre Ghoskate.' },
  5: { name: 'Partner stamp', description: 'Pečiatka partnera GOSko z loot dropu v hre Ghoskate.' },
});

export function parseTokenType(raw) {
  const s = String(raw ?? '');
  const n = /^\d{1,3}$/.test(s) ? Number(s) : /^[0-9a-fA-F]{64}$/.test(s) ? Number(BigInt(`0x${s}`) <= 255n ? BigInt(`0x${s}`) : 0n) : 0;
  return LOOT_TYPES[n] ? n : null;
}

export function createHandler(deps) {
  const { env } = deps;
  const log = deps.log || console;
  return async function lootMeta(req, res) {
    if (!allowMethods(req, res, ['GET', 'HEAD'])) return;
    try {
      const id = parseTokenType(pathParam(req, 'id'));
      if (!id) return send(res, 404, { ok: false, error: 'not_found', message: 'Typ neexistuje.' });
      const t = LOOT_TYPES[id];
      send(res, 200, {
        name: t.name,
        description: `${t.description} Neprenosné (soulbound).`,
        image: `${env.PUBLIC_BASE_URL}/icons/ghoskate-512.png`,
        external_url: `${env.PUBLIC_BASE_URL}/hra`,
        attributes: [{ trait_type: 'Hra', value: 'Ghoskate' }, { trait_type: 'Typ', value: t.name }, { trait_type: 'Neprenosné', value: 'Áno' }],
      }, { 'Cache-Control': 'public, max-age=300, s-maxage=3600', 'Access-Control-Allow-Origin': '*' });
    } catch (err) {
      sendError(res, err, log);
    }
  };
}

export default createHandler(baseDeps());

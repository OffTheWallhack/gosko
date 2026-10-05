// GET /api/nft/metadata/:id : ERC-721 metadáta GoskoPass (kontrakt §5). Bez osobných údajov.
import { baseDeps } from '../../_lib/deps.js';
import { allowMethods, pathParam, send, sendError } from '../../_lib/http.js';
import { loadTokenView } from '../../_lib/tokenview.js';

export const DESCRIPTION = 'Záznam o účasti a výsledku v sérii Game of S.K.A.T.E. GOSko. Neprenosný.';

export function buildMetadata(env, view) {
  const attributes = [{ trait_type: 'Event', value: view.eventName }];
  if (view.date) attributes.push({ trait_type: 'Dátum', value: view.date });
  attributes.push({ trait_type: 'Kategória', value: view.categoryName });
  if (view.place !== null) {
    attributes.push({ trait_type: 'Umiestnenie', value: view.place, display_type: 'number' });
    attributes.push({ trait_type: 'Body', value: view.points, display_type: 'number' });
  }
  if (view.founder) attributes.push({ trait_type: 'Zakladateľ', value: 'Áno' });
  return {
    name: `GOSko Pass #${view.tokenId} · ${view.eventName}${view.year ? ` ${view.year}` : ''}`,
    description: DESCRIPTION,
    image: `${env.PUBLIC_BASE_URL}/api/nft/image/${view.tokenId}`,
    external_url: `${env.PUBLIC_BASE_URL}/#/event/${encodeURIComponent(view.eventId)}`,
    attributes,
  };
}

export function createHandler(deps) {
  const { env } = deps;
  const log = deps.log || console;
  return async function metadata(req, res) {
    if (!allowMethods(req, res, ['GET', 'HEAD'])) return;
    try {
      const view = await loadTokenView(deps, pathParam(req, 'id'));
      if (!view) return send(res, 404, { ok: false, error: 'not_found', message: 'Token neexistuje.' });
      send(res, 200, buildMetadata(env, view), {
        'Cache-Control': 'public, max-age=60, s-maxage=300',
        'Access-Control-Allow-Origin': '*',
      });
    } catch (err) {
      sendError(res, err, log);
    }
  };
}

export default createHandler(baseDeps());

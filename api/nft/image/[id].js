// GET /api/nft/image/:id : SVG nálepka GoskoPass. Bez mien a osobných údajov.
import { baseDeps } from '../../_lib/deps.js';
import { allowMethods, pathParam, send, sendError, sendRaw } from '../../_lib/http.js';
import { loadTokenView } from '../../_lib/tokenview.js';
import { renderSticker } from '../../_lib/sticker.js';

export function createHandler(deps) {
  const log = deps.log || console;
  return async function image(req, res) {
    if (!allowMethods(req, res, ['GET', 'HEAD'])) return;
    try {
      const view = await loadTokenView(deps, pathParam(req, 'id'));
      if (!view) return send(res, 404, { ok: false, error: 'not_found', message: 'Token neexistuje.' });
      sendRaw(res, 200, 'image/svg+xml; charset=utf-8', renderSticker(view), {
        'Cache-Control': 'public, max-age=300, s-maxage=3600',
        'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'",
        'X-Content-Type-Options': 'nosniff',
        'Access-Control-Allow-Origin': '*',
      });
    } catch (err) {
      sendError(res, err, log);
    }
  };
}

export default createHandler(baseDeps());

// SVG nálepka GOSko Pass. Štýl webu: čierna, krémová, červená #A01D21.
// Bez mien a osobných údajov: event, mesto, dátum, kategória, umiestnenie, body, číslo tokenu.

const RED = '#A01D21';
const BAND = '#A01414';
const CREAM = '#F3EBDD';
const BLACK = '#111111';
const FONT = "'Arial Black','Helvetica Neue',Arial,sans-serif";
const MEDAL = { 1: '#E0B33A', 2: '#C9CED6', 3: '#C27C3E' };

export const xmlEscape = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));

const dateSk = iso => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? ''));
  return m ? `${Number(m[3])}. ${Number(m[2])}. ${m[1]}` : '';
};

function citySize(text) {
  const n = Array.from(text).length;
  if (n <= 10) return 52;
  if (n <= 14) return 40;
  if (n <= 20) return 30;
  return 24;
}

/**
 * @param {{tokenId: string, city: string, eventName: string, date: string|null, categoryName: string,
 *          place: number|null, points: number|null, founder: boolean}} v
 */
export function renderSticker(v) {
  const city = Array.from(String(v.city || v.eventName || 'GOSko').toUpperCase()).slice(0, 24).join('');
  const date = dateSk(v.date) || (v.year ? String(v.year) : '');
  const cat = String(v.categoryName || '').toUpperCase();
  const hasPlace = Number.isInteger(v.place) && v.place > 0;
  const medalFill = hasPlace ? (MEDAL[v.place] || RED) : BLACK;
  const medalText = hasPlace ? `${v.place}.` : 'ÚČASŤ';
  const medalInk = hasPlace && MEDAL[v.place] ? BLACK : CREAM;
  const medalSize = hasPlace ? (v.place >= 100 ? 48 : 64) : 22;
  const points = Number.isInteger(v.points) ? `${v.points} B` : '';

  const founder = v.founder
    ? `<g transform="rotate(45 482 118)"><rect x="342" y="94" width="280" height="48" fill="${BAND}" stroke="${CREAM}" stroke-width="3"/>
<text x="482" y="127" text-anchor="middle" font-family="${FONT}" font-weight="900" font-size="22" letter-spacing="2" fill="${CREAM}">ZAKLADATEĽ</text></g>`
    : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600" role="img" aria-label="${xmlEscape(`GOSko Pass #${v.tokenId}`)}">
<defs><clipPath id="c"><rect width="600" height="600"/></clipPath></defs>
<rect width="600" height="600" fill="${BLACK}"/>
<g clip-path="url(#c)">
<g transform="rotate(-3 300 300)">
<rect x="62" y="66" width="480" height="480" rx="28" fill="#000000" opacity="0.6"/>
<rect x="52" y="52" width="480" height="480" rx="28" fill="${CREAM}" stroke="${BLACK}" stroke-width="8"/>
<text x="292" y="516" text-anchor="middle" font-family="${FONT}" font-weight="900" font-size="16" fill="${RED}">#${xmlEscape(v.tokenId)}</text>
<text x="292" y="160" text-anchor="middle" font-family="${FONT}" font-weight="900" font-size="88" fill="${BLACK}">GOSko</text>
<text x="292" y="196" text-anchor="middle" font-family="${FONT}" font-weight="700" font-size="20" letter-spacing="6" fill="${RED}">GAME OF S.K.A.T.E.</text>
<rect x="56" y="214" width="472" height="80" fill="${RED}"/>
<text x="292" y="${254 + Math.round(citySize(city) / 3)}" text-anchor="middle" font-family="${FONT}" font-weight="900" font-size="${citySize(city)}" letter-spacing="3" fill="${CREAM}">${xmlEscape(city)}</text>
<text x="292" y="332" text-anchor="middle" font-family="${FONT}" font-weight="700" font-size="24" fill="${BLACK}">${xmlEscape(date)}</text>
<circle cx="292" cy="420" r="68" fill="${medalFill}" stroke="${BLACK}" stroke-width="6"/>
<text x="292" y="${420 + Math.round(medalSize / 3)}" text-anchor="middle" font-family="${FONT}" font-weight="900" font-size="${medalSize}" fill="${medalInk}">${xmlEscape(medalText)}</text>
<rect x="76" y="470" width="128" height="40" rx="20" fill="${BLACK}"/>
<text x="140" y="497" text-anchor="middle" font-family="${FONT}" font-weight="900" font-size="18" fill="${CREAM}">${xmlEscape(cat)}</text>
<text x="508" y="499" text-anchor="end" font-family="${FONT}" font-weight="900" font-size="28" fill="${RED}">${xmlEscape(points)}</text>
</g>
${founder}
</g>
</svg>
`;
}

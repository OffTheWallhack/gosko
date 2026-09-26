/* Dekoračné nálepky a čmáranice. Všetko vlastné SVG, žiadne cudzie logá. */
const F = 'font-family:Archivo,system-ui,sans-serif;font-weight:900;font-stretch:125%';

function star(cx, cy, n, R, r) {
  const p = [];
  for (let i = 0; i < n * 2; i++) { const a = i * Math.PI / n - Math.PI / 2, rad = i % 2 ? r : R; p.push(`${(cx + Math.cos(a) * rad).toFixed(1)},${(cy + Math.sin(a) * rad).toFixed(1)}`); }
  return p.join(' ');
}

const SVG = {
  skate: `<svg viewBox="0 0 230 72"><rect x="3" y="3" width="224" height="66" rx="10" fill="#fff"/><rect x="9" y="9" width="212" height="54" rx="6" fill="#111"/>
    <text x="115" y="48" text-anchor="middle" style="${F};font-size:34px;letter-spacing:1px" fill="#F3EBDD">S.K.A.T.E.</text>
    <path d="M24 44 L64 27" stroke="#A01D21" stroke-width="6" stroke-linecap="round"/><path d="M70 44 L108 27" stroke="#A01D21" stroke-width="6" stroke-linecap="round"/></svg>`,
  burst: `<svg viewBox="0 0 130 130"><polygon points="${star(65, 65, 16, 62, 48)}" fill="#F3EBDD"/><polygon points="${star(65, 65, 16, 55, 42)}" fill="#A01D21"/>
    <text x="65" y="66" text-anchor="middle" style="${F};font-size:30px" fill="#F3EBDD">+100</text>
    <text x="65" y="86" text-anchor="middle" style="${F};font-size:13px;letter-spacing:1px" fill="#111">BODOV</text></svg>`,
  land: `<svg viewBox="0 0 170 60"><rect x="3" y="3" width="164" height="54" fill="#fff"/><rect x="9" y="9" width="152" height="42" fill="none" stroke="#A01D21" stroke-width="4"/>
    <text x="85" y="42" text-anchor="middle" transform="skewX(-10) translate(7 0)" style="${F};font-size:28px" fill="#A01D21">LAND IT</text></svg>`,
  oval: `<svg viewBox="0 0 140 90"><ellipse cx="70" cy="45" rx="66" ry="41" fill="#fff" stroke="#111" stroke-width="6"/>
    <text x="70" y="58" text-anchor="middle" style="${F};font-size:38px" fill="#111">GOS</text></svg>`,
  round: `<img src="img/sticker-cut.webp" alt="" width="320" height="320">`,
  sk: `<svg viewBox="0 0 150 64"><path d="M6 8 L144 4 L140 58 L10 60 Z" fill="#A01D21"/>
    <text x="75" y="41" text-anchor="middle" style="${F};font-size:21px" fill="#F3EBDD">SLOVENSKO</text></svg>`,
  arrow: `<svg viewBox="0 0 140 90" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">
    <path d="M8 16 C 40 4, 92 10, 104 44 C 110 60, 108 70, 104 80"/><path d="M90 66 L104 82 L118 66"/></svg>`,
  circle: `<svg viewBox="0 0 100 100" fill="none" stroke="#F3EBDD" stroke-width="3.5" stroke-linecap="round">
    <path d="M58 10 C 20 6, 4 34, 10 60 C 16 88, 64 96, 84 76 C 100 58, 92 24, 62 14 C 50 10, 36 14, 30 20"/></svg>`,
};

export function deco(name, cls = '') {
  const el = document.createElement('span');
  el.className = `deco deco-${name} ${cls}`.trim();
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = SVG[name];
  return el;
}

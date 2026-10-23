/* Pixelový duch GOSko: ten istý duch ako v 3D, ale ako postavička zo starej hry (12 snímok/s, dithering, grimasy).
   Bez three.js. API: mountPixelGhost(canvas, { ghost, look, interactive, onScene }) a renderPixelGhost(ghost, { look, width, height }) pre statický obrázok.
   Nastavenie ducha = profiles.ghost (ghost.js, ghostOf). Doska = loadout (looks.js). */
import { ghostOf, BODY_COLORS, EYE_COLORS as EYES, HEADS as HEAD, EXTRAS as EXTRA, MARKS, FINISHES, EX, EMOTES, randomEmote, BODY_PATH, EYE_L_PATH, EYE_R_PATH, MOUTH_PATH } from './ghost.js';
import { DECKS, WHEELS, TRUCKS, isHex } from './looks.js';

const hex6 = n => '#' + n.toString(16).padStart(6, '0');
/* nastavenie pre renderer: duch + farby dosky z loadoutu */
function toS(g, look = {}) {
  const n = ghostOf(g);
  const deck = isHex(look.deck) ? look.deck : look.deck === 'image' ? (isHex(look.deckTone) ? look.deckTone : '#6b6359') : (DECKS[look.deck]?.base || '#A01414');
  const wheels = isHex(look.wheels) ? look.wheels : hex6(WHEELS[look.wheels]?.color ?? 0xf3ebdd);
  const trucks = isHex(look.trucks) ? look.trucks : hex6(TRUCKS[look.trucks]?.color ?? 0xc9ccd0);
  return { ...n, wear: n.scuff, board: { show: true, deck, wheels, trucks, shoes: n.shoes, shoeColor: n.shoeColor, extra: n.boardExtra } };
}

function makeEngine(canvas, { ghost, look, bare = false, fixed = null, autoOn: autoStart = true } = {}) {
  let S = toS(ghost, look);
/* ================= farby ================= */
const hexRgb = h => { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
const pack = c => (255 << 24 | c[2] << 16 | c[1] << 8 | c[0]) | 0;
const unpack = v => [v & 255, v >> 8 & 255, v >> 16 & 255];
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t | 0, a[1] + (b[1] - a[1]) * t | 0, a[2] + (b[2] - a[2]) * t | 0];
function rgbHsl([r, g, b]) { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2; let h = 0, s = 0; if (mx !== mn) { const d = mx - mn; s = l > .5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; } return [h, s, l]; }
function hslRgb(h, s, l) { h = ((h % 360) + 360) % 360 / 360; s = Math.max(0, Math.min(1, s)); l = Math.max(0, Math.min(1, l)); if (!s) return [l * 255 | 0, l * 255 | 0, l * 255 | 0]; const q = l < .5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q; const f = t => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < .5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; }; return [f(h + 1 / 3) * 255 | 0, f(h) * 255 | 0, f(h - 1 / 3) * 255 | 0]; }
const toward = (h, t, a) => { let d = ((t - h + 540) % 360) - 180; return h + Math.sign(d) * Math.min(Math.abs(d), a); };
/* tónová škála ako v starých hrách: svetlá idú do teplej, tiene do fialovej */
function ramp(hex, soft = false) {
  const [h, s, l] = rgbHsl(hexRgb(hex)), k = soft ? .62 : 1;
  const warm = [255, 246, 222], cool1 = [92, 78, 150], cool2 = [52, 40, 104];
  return [
    mix(hslRgb(h, s * .95, Math.min(.98, l + .1 * k + (l < .25 ? .06 : 0))), warm, .14),
    hexRgb(hex),
    mix(hslRgb(h, Math.min(1, s * 1.02), Math.max(.05, l - .13 * k)), cool1, .16 * k),
    mix(hslRgb(h, Math.min(1, s * 1.04), Math.max(.03, l - .26 * k)), cool2, .26 * k),
  ];
}
const GOLD = { H: [255, 241, 168], Y: [242, 194, 58], O: [192, 132, 31], D: [122, 74, 18] };
const INK = [18, 13, 16];

/* ================= duch z loga ako pixelová maska ================= */
const BODY = new Path2D(BODY_PATH);
const FACE = new Path2D(EYE_L_PATH + EYE_R_PATH + MOUTH_PATH);
const GW = 40, SC = GW / 462, GH = Math.ceil(521 * SC) + 1, CX = GW / 2, HC = GW / 2;
const mask = new Uint8Array(GW * GH), face = new Uint8Array(GW * GH);
{
  const c = document.createElement('canvas'); c.width = GW; c.height = GH; const x = c.getContext('2d');
  x.setTransform(SC, 0, 0, SC, -169 * SC, -228 * SC); x.fill(BODY);
  let a = x.getImageData(0, 0, GW, GH).data; for (let i = 0; i < GW * GH; i++) mask[i] = a[i * 4 + 3] >= 128 ? 1 : 0;
  x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, GW, GH); x.setTransform(SC, 0, 0, SC, -169 * SC, -228 * SC); x.fill(FACE, 'evenodd');
  a = x.getImageData(0, 0, GW, GH).data; for (let i = 0; i < GW * GH; i++) face[i] = mask[i] && a[i * 4 + 3] >= 105 ? 1 : 0;
}
const M = (x, y) => x >= 0 && y >= 0 && x < GW && y < GH && mask[y * GW + x];
const spanL = [], spanR = [], colTop = [];
for (let y = 0; y < GH; y++) { let l = -1, r = -1; for (let x = 0; x < GW; x++) if (M(x, y)) { if (l < 0) l = x; r = x; } spanL[y] = l; spanR[y] = r; }
for (let x = 0; x < GW; x++) { colTop[x] = GH; for (let y = 0; y < GH; y++) if (M(x, y)) { colTop[x] = y; break; } }
// riadok, kde končia oči a začína úsmev
let faceTop = GH, faceBot = 0, split = 0;
{ const rows = []; for (let y = 0; y < GH; y++) { let any = 0; for (let x = 0; x < GW; x++) any |= face[y * GW + x]; rows.push(any); if (any) { faceTop = Math.min(faceTop, y); faceBot = y; } }
  for (let y = faceTop; y <= faceBot; y++) if (!rows[y]) { split = y; break; } if (!split) split = Math.round(faceTop + (faceBot - faceTop) * .55); }

/* ================= pomôcky ================= */
const hsh = (x, y, s) => { let n = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 1442695041) | 0; n = Math.imul(n ^ n >>> 13, 1274126177); return ((n ^ n >>> 16) >>> 0) / 4294967296; };
const rng = seed => () => { seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const B4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const bayer = (x, y) => (B4[(y & 3) * 4 + (x & 3)] + .5) / 16;
class Layer {
  constructor(w, h) { this.w = w; this.h = h; this.c = new Int32Array(w * h); this.holo = new Uint8Array(w * h).fill(255); this.aura = []; }
  get(x, y) { return x < 0 || y < 0 || x >= this.w || y >= this.h ? 0 : this.c[y * this.w + x]; }
  set(x, y, v, holo = 255) { if (x < 0 || y < 0 || x >= this.w || y >= this.h) return; this.c[y * this.w + x] = v; this.holo[y * this.w + x] = holo; }
  outline(col) { const o = new Int32Array(this.c), w = this.w; for (let y = 0; y < this.h; y++) for (let x = 0; x < w; x++) if (!this.c[y * w + x] && (this.get(x - 1, y) || this.get(x + 1, y) || this.get(x, y - 1) || this.get(x, y + 1))) o[y * w + x] = col; this.c = o; }
  draw(art, ox, oy, pal, flip = false) { art.forEach((row, y) => [...row].forEach((ch, i) => { const x = flip ? row.length - 1 - i : i; if (pal[ch]) this.set(ox + x, oy + y, pack(pal[ch])); })); }
}

/* ================= stavba ducha ================= */
const PX = 10, PT = 13, LW = GW + PX * 2, LH = GH + PT + 2;
let spriteKey = '';
function bodyPixels() {
  const soft = S.finish === 'mat' || S.finish === 'concrete', R1 = S.finish === 'gold' ? ramp('#f2c23a') : S.finish === 'marble' ? ramp('#efece6') : ramp(S.color, soft), R2 = ramp(S.color2, soft), R3 = ramp(S.color2, soft).map(c => mix(c, [0, 0, 0], .45)), d = S.dirt / 100, w = S.wear / 100;
  const leo = []; if (S.pattern === 'leopard') { const P = rng(S.seed * 11 + 5); for (let i = 0; i < 60 && leo.length < 14; i++) { const x = 1 + P() * (GW - 2) | 0, y = 1 + P() * (GH - 4) | 0; if (!M(x, y) || (x > 7 && x < 33 && y > faceTop - 2 && y < faceBot + 2)) continue; leo.push([x, y]); } }
  const out = new Int32Array(GW * GH), holo = new Uint8Array(GW * GH).fill(255), tones = new Uint8Array(GW * GH);
  const L = [-.5, -.62, .6], ln = Math.hypot(...L);
  const glowUp = S.finish === 'glow';
  const CH = (() => { const [h, s, l] = rgbHsl(hexRgb(S.color)); return [.97, .82, .5, .3, .15].map(v => hslRgb(h, Math.min(.35, s * .5), v * .85 + l * .15)); })();
  // fľaky (vzor)
  const spots = []; if (S.pattern === 'spots') { const P = rng(S.seed * 7 + 3); for (let i = 0; i < 40 && spots.length < 8; i++) { const x = 2 + P() * (GW - 4) | 0, y = 2 + P() * (GH - 8) | 0; if (!M(x, y) || (x > 7 && x < 33 && y > faceTop - 2 && y < faceBot + 2)) continue; spots.push([x, y, P() < .5 ? 2 : 1.5]); } }
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
    if (!M(x, y)) continue;
    const r = GW / 2; let nx = (x + .5 - CX) / r, ny = y + .5 < HC ? (y + .5 - HC) / r : 0;
    if (y > GH - 10) ny = (y - (GH - 10)) / 14;
    let l2 = nx * nx + ny * ny; if (l2 > .97) { const k = Math.sqrt(.97 / l2); nx *= k; ny *= k; l2 = .97; }
    const nz = Math.sqrt(1 - l2);
    let v = .22 + .78 * Math.max(0, (L[0] * nx + L[1] * ny + L[2] * nz) / ln);
    if (!M(x + 1, y) || !M(x, y + 1)) v -= .14;
    if (!M(x - 1, y) || !M(x, y - 1)) v += .04;
    const ths = soft ? [.84, .56, .34] : [.86, .62, .4], band = soft ? .07 : .035;
    let t = v > ths[0] ? 0 : v > ths[1] ? 1 : v > ths[2] ? 2 : 3;
    for (let k = 0; k < 3; k++) if (Math.abs(v - ths[k]) < band && bayer(x, y) < .5) t = v > ths[k] ? k + 1 : k;
    // (špina ďalej)
    if (d > 0 && y > GH - 9 && bayer(x, y) < d * .75) t = Math.min(3, t + 1);
    tones[y * GW + x] = t;
    let ramp_ = R1;
    if (S.pattern === 'stripe' && (y === faceBot + 2 || y === faceBot + 3)) ramp_ = R2;
    if (S.pattern === 'split' && (y < 9 || (y === 9 && (x + y) % 2))) ramp_ = R2;
    if (spots.some(([sx, sy, sr]) => Math.abs(x - sx) + Math.abs(y - sy) * 1.2 <= sr)) ramp_ = R2;
    // ďalšie vzory
    if (S.pattern === 'checker' && ((x / 5 | 0) + (y / 5 | 0)) % 2 === 0) ramp_ = R2;
    if (S.pattern === 'hstripes' && y % 7 < 3 && y > 3) ramp_ = R2;
    if (S.pattern === 'camo') { const n = hsh(x / 4 | 0, y / 3 | 0, S.seed + 4); if (n < .3) ramp_ = R2; else if (n < .45) ramp_ = R3; }
    if (S.pattern === 'tiedye') { const dd = Math.hypot((x - CX) * .8, (y - HC - 8) * .55); if ((dd / 4 | 0) % 2 === 0 || hsh(x, y, 2) < .12) ramp_ = R2; }
    if (S.pattern === 'leopard') { let hit = 0; for (const [sx, sy] of leo) { const dd = Math.hypot((x - sx) * .85, y - sy); if (dd <= 1.6) { hit = 1; break; } if (dd <= 2.7) hit = 2; } if (hit === 1) ramp_ = R2; else if (hit === 2) ramp_ = R3; }
    if (S.pattern === 'flames') { const hgt = 4 + Math.round(hsh(x / 2 | 0, 0, S.seed + 8) * 9) + ((x % 3 === 0) ? 2 : 0); if (y > GH - 2 - hgt) ramp_ = (y > GH - 2 - hgt * .5) ? R3 : R2; }
    let c = ramp_[t];
    // povrchy s textúrou
    if (S.finish === 'concrete') { const n = hsh(x, y, 13); if (n < .12) c = mix(c, [0, 0, 0], .25); else if (n > .9) c = mix(c, [255, 255, 255], .18); }
    if (S.finish === 'wood') { const g = Math.sin(y * 1.1 + Math.sin(x * .3) * 1.5); c = mix(c, g > .55 ? [110, 70, 35] : [240, 205, 150], g > .55 ? .35 : .12); }
    if (S.finish === 'carbon') { const k = ((x >> 1) + (y >> 1)) % 2; c = mix(c, k ? [0, 0, 0] : [255, 255, 255], k ? .4 : .12); }
    if (S.finish === 'marble') { const v = Math.sin(x * .45 + Math.sin(y * .5) * 2.5 + y * .2); if (v > .85) c = mix(c, [90, 90, 110], .6); }
    if (S.finish === 'gold') { const gl = v > .86 ? [255, 241, 168] : v > .62 ? [242, 194, 58] : v > .4 ? [192, 132, 31] : [122, 74, 18]; c = gl; if ((x + y * 3) % 11 === 0 && v > .5) c = [255, 248, 200]; }
    if (S.finish === 'translucent') holo[y * GW + x] = t;
    if (glowUp) c = mix(c, [255, 255, 255], .12);
    if (S.finish === 'chrome') { const ci = v > .88 ? 0 : v > .7 ? 1 : v > .57 ? 3 : v > .44 ? 2 : v > .32 ? 1 : 4; c = mix(CH[ci], ramp_[1], ramp_ === R1 ? .18 : .5); }
    if (S.finish === 'holo' && ramp_ === R1) holo[y * GW + x] = t;
    // špina: zrnká prachu a fľaky
    if (d > 0 && hsh(x, y, S.seed) < d * (.03 + .5 * Math.pow(y / GH, 3))) c = mix(c, [74, 58, 42], .55);
    out[y * GW + x] = pack(c);
  }
  // znak na tele (tetovanie): vľavo dole, kde je telo celé
  if (S.mark !== 'none') {
    const mc = hexRgb(S.markColor), ox = 5, oy = GH - 14;
    const artM = MARKS[S.mark].art || null, txt = S.mark === 'number' ? String(S.seed).padStart(4, '0') : S.mark === 'initials' ? S.initials : MARKS[S.mark].text || '';
    const setM = (X, Y) => { if (M(X, Y)) { out[Y * GW + X] = pack(mix(mc, unpack(out[Y * GW + X]), .12)); holo[Y * GW + X] = 255; } };
    if (artM) artM.forEach((row, y) => [...row].forEach((ch, x) => { if (ch === '#') setM(ox + x, oy + y); }));
    else { const str = txt; [...str].forEach((ch, i) => { const g = FONT[ch]; for (let k = 0; k < 15; k++) if (g[k] === '1') setM(ox + i * 4 + k % 3, oy + 1 + (k / 3 | 0)); }); }
  }
  // odlesk (vinyl/holo)
  if (S.finish === 'vinyl' || S.finish === 'holo') { const sx = CX - 9, sy = HC - 10; [[0, 0], [1, 0], [0, 1], [1, 1], [-1, 1], [3, -1]].forEach(([a, b]) => { const x = sx + a, y = sy + b; if (M(x, y)) { out[y * GW + x] = pack(S.finish === 'holo' ? [255, 255, 255] : mix(R1[0], [255, 255, 255], .7)); holo[y * GW + x] = 255; } }); }
  // šmuhy
  if (d > .2) { const P = rng(S.seed + 11); for (let i = 0; i < 5 * d; i++) { const x = 3 + P() * (GW - 6) | 0, y = 12 + P() * (GH - 16) | 0; if (y >= faceTop - 1 && y <= faceBot + 1 && x > 8 && x < 32) continue; [[0, 0], [1, 0], [0, 1], [-1, 0], [1, 1]].forEach(([a, b]) => { if (M(x + a, y + b) && P() < .8) { const i2 = (y + b) * GW + x + a; out[i2] = pack(mix(unpack(out[i2]), [40, 32, 26], .35 * d + .1)); } }); } }
  // ošúchanie: odreté hrany a nožičky, škrabance
  if (w > 0) {
    const lum = rgbHsl(hexRgb(S.color))[2], primer = lum > .6 ? [150, 141, 133] : [176, 168, 158];
    const scratch = lum > .6 ? R1[3] : mix(R1[0], [255, 255, 255], .35);
    for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
      if (!M(x, y) || face[y * GW + x]) continue;
      const edge = !M(x - 1, y) || !M(x + 1, y) || !M(x, y + 1);
      const h = hsh(x, y, S.seed + 5);
      if ((edge && y > GH * .4 && h < w * .42) || (y > GH - 4 && h < w * .5)) { out[y * GW + x] = pack(primer); holo[y * GW + x] = 255; }
    }
    const P = rng(S.seed + 23);
    for (let i = 0; i < Math.round(11 * w); i++) {
      let x = 3 + P() * (GW - 6) | 0, y = 4 + P() * (GH - 8) | 0; const dy = P() < .5 ? 1 : -1, len = 2 + (P() * 2 | 0);
      for (let k = 0; k < len; k++, x++, y += (k % 2 ? dy : 0)) if (M(x, y) && !face[y * GW + x]) { out[y * GW + x] = pack(scratch); holo[y * GW + x] = 255; }
    }
  }
  // nálepky z eventov
  if (S.stickers) {
    const st = (art, ox, oy, pal) => art.forEach((row, y) => [...row].forEach((ch, x) => { const X = ox + x, Y = oy + y; if (pal[ch] && M(X, Y) && !face[Y * GW + X]) { out[Y * GW + X] = pack(pal[ch] === 'sh' ? mix(unpack(out[Y * GW + X]), [0, 0, 0], .35) : pal[ch]); holo[Y * GW + X] = 255; } }));
    st(['rRRRRw', 'RcRcRR', 'RRRRRR', '.sssss'], 2, faceBot - 4, { r: [196, 40, 40], R: [160, 20, 20], c: [243, 235, 221], w: [255, 250, 240], s: 'sh' });
    st(['CCCC', 'CkkC', 'CCCc', '.sss'], GW - 8, faceBot + 1, { C: [243, 235, 221], c: [205, 196, 182], k: [21, 19, 18], s: 'sh' });
    st(['VVV', 'VvV', '.ss'], 7, 7, { V: [196, 173, 255], v: [120, 96, 200], s: 'sh' });
  }
  return { out, holo };
}
/* ================= výrazy tváre (ako Doomguy v Doome) =================
   Oči a úsmev z loga sú základ. Ostatné výrazy sú ručne kreslené pixely, ktoré sa položia na miesto očí a úst. */
const EYE = new Uint8Array(GW * GH), MOUTH = new Uint8Array(GW * GH);
for (let i = 0; i < GW * GH; i++) if (face[i]) ((i / GW | 0) < split ? EYE : MOUTH)[i] = 1;
function bboxOf(arr, test) { let x0 = GW, x1 = -1, y0 = GH, y1 = -1; for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) if (arr[y * GW + x] && test(x)) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } return { x0, x1, y0, y1, cx: (x0 + x1 + 1) / 2, cy: (y0 + y1 + 1) / 2 }; }
const EL = bboxOf(EYE, x => x < CX), ER = bboxOf(EYE, x => x >= CX), MB = bboxOf(MOUTH, () => true);
const ART = {
  relax: ['#.....#', '.#####.'],
  ouch: ['##.....', '.###...', '....##.', '.###...', '##.....'],
  brow: ['....##', '.###..'],
  O: ['.####.', '#rrrr#', '#rrrr#', '#rrrr#', '#rrrr#', '.####.'],
  yawn: ['..#####..', '.#rrrrr#.', '#rrrrrrr#', '#rrrrrrr#', '#rrrrrrr#', '#rrtttrr#', '.#ttttt#.', '..#####..'],
  small: ['#......#', '.######.'],
  sniffM: ['.####.', '#....#'],
  grimace: ['.#############.', '#w#ww#ww#ww#w#', '#w#ww#ww#ww#w#', '.#############.'].map(r => r.padEnd(15, '.')),
};
const CODE = { '#': 1, w: 2, r: 3, t: 4, m: 13 };
const flipArt = a => a.map(r => [...r].reverse().join(''));
function stamp(c, art, cx, cy) { const h = art.length, w = art[0].length, ox = Math.round(cx - w / 2), oy = Math.round(cy - h / 2); art.forEach((row, y) => [...row].forEach((ch, x) => { const X = ox + x, Y = oy + y; if (CODE[ch] && M(X, Y)) c[Y * GW + X] = CODE[ch]; })); }
/* vystrašené oko: čierne a okrúhle, len s malým odleskom, ktorý sa posúva podľa pohľadu */
const SCARED_EYE = ['..#####..', '.#######.', '#########', '#########', '#########', '#########', '.#######.', '..#####..'];
function scaredEye(pdx) { return SCARED_EYE.map((r, y) => y === 2 || y === 3 ? [...r].map((ch, x) => x === 2 + pdx * 2 + (y === 3 ? 1 : 0) || (y === 2 && x === 3 + pdx * 2) ? 'w' : ch).join('') : r); }
/* základné body očí podľa tvaru; grimasy ich potom stláčajú alebo posúvajú */
const EYE_ART = {
  round: ['.###.', '#####', '#####', '#####', '.###.'],
  dots: ['.##.', '####', '.##.'],
  slits: ['######', '.#####', '..####'],
  sleepy: ['#####', '.####', '..###'],
  x: ['#...#', '.#.#.', '..#..', '.#.#.', '#...#'],
};
function eyeBase(shape) {
  const pts = [];
  if (shape === 'logo') { for (let y = 0; y < split; y++) for (let x = 0; x < GW; x++) if (EYE[y * GW + x]) pts.push([x, y, x < CX ? EL : ER]); return pts; }
  const a = EYE_ART[shape];
  [[EL, false], [ER, true]].forEach(([E, fl]) => { const art = fl ? flipArt(a) : a, h = art.length, w = art[0].length, ox = Math.round(E.cx - w / 2 + (fl ? -1 : 1) * (shape === 'slits' ? 0 : 0)), oy = Math.round(E.cy - h / 2 + (shape === 'dots' ? 1 : 0)); art.forEach((row, y) => [...row].forEach((ch, x) => { if (ch === '#') pts.push([ox + x, oy + y, { cy: oy + h / 2 }]); })); });
  return pts;
}
const EX = {
  idle: {}, left: { dx: -2 }, right: { dx: 2 }, blink: { eyes: 'closed' },
  squint: { eyes: 'squint' }, squintL: { eyes: 'squint', dx: -2 }, squintR: { eyes: 'squint', dx: 2 },
  grin: { eyes: 'squint', mouth: 'grin' }, sniff: { eyes: 'closed', mouth: 'sniffM' },
  scared: { eyes: 'scared', mouth: 'O' }, scaredL: { eyes: 'scared', mouth: 'O', pdx: -1 }, scaredR: { eyes: 'scared', mouth: 'O', pdx: 1 },
  sleepy: { eyes: 'relax', mouth: 'small' }, yawn: { eyes: 'relax', mouth: 'yawn' }, ouch: { eyes: 'ouch', mouth: 'grimace' },
};
function faceCodes(ex) {
  const c = new Uint8Array(GW * GH), dx = ex.dx || 0, mdx = Math.sign(dx), eyes = ex.eyes || 'logo', mouth = ex.mouth || (S.mouth === 'teeth' ? 'grin' : S.mouth === 'o' ? 'O' : 'logo');
  const putM = (x, y, v) => { if (M(x, y)) c[y * GW + x] = v; };
  if (eyes === 'logo' || eyes === 'squint' || eyes === 'closed') {
    const k = eyes === 'squint' ? .42 : eyes === 'closed' ? .1 : 1;   // prižmúrenie = oko stlačené na výšku, sklon ostane
    for (const [x, y, E] of eyeBase(S.eyeShape)) putM(x + dx, Math.round(E.cy - .5 + (y - E.cy + .5) * k + (eyes === 'closed' ? 1 : 0)), 1);
  } else if (eyes === 'scared') {
    const pd = ex.pdx || 0;
    stamp(c, scaredEye(pd), EL.cx, EL.cy - .5); stamp(c, scaredEye(pd), ER.cx, ER.cy - .5);
    stamp(c, ART.brow, EL.cx + .5, EL.y0 - 3); stamp(c, flipArt(ART.brow), ER.cx - .5, ER.y0 - 3);
  } else if (eyes === 'relax') {
    stamp(c, ART.relax, EL.cx, EL.cy + 1); stamp(c, ART.relax, ER.cx, ER.cy + 1);
  } else if (eyes === 'ouch') {
    stamp(c, ART.ouch, EL.cx + .5, EL.cy); stamp(c, flipArt(ART.ouch), ER.cx - .5, ER.cy);
  }
  if (mouth === 'logo' || mouth === 'grin') {
    for (let x = 0; x < GW; x++) {
      let top = -1, bot = -1; for (let y = split; y < GH; y++) if (MOUTH[y * GW + x]) { if (top < 0) top = y; bot = y; }
      if (top < 0) continue;
      if (mouth === 'logo') {
        if (S.mouth === 'flat') { if (x > MB.x0 + 4 && x < MB.x1 - 4) putM(x + mdx, MB.y1 - 2, 1); continue; }
        if (S.mouth === 'smirk') { if (x > MB.cx - 2) { for (let y = top; y <= bot; y++) if (MOUTH[y * GW + x]) putM(x + mdx, y - Math.round((x - MB.cx) * .12), 1); } else if (x > MB.x0 + 6) putM(x + mdx, MB.y1 - 3, 1); continue; }
        if (S.mouth === 'gap') { for (let y = top; y <= bot; y++) if (MOUTH[y * GW + x]) putM(x + mdx, y, (y === top && x > MB.x0 + 4 && x < MB.x1 - 4 && x % 3 !== 0 && Math.abs(x - MB.cx) > 1.5) ? 2 : 1); continue; }
        for (let y = top; y <= bot; y++) if (MOUTH[y * GW + x]) putM(x + mdx, y, 1);
        if (S.mouth === 'fangs' && (x === Math.round(MB.cx) - 5 || x === Math.round(MB.cx) + 4)) { putM(x + mdx - 1, bot + 1, 1); putM(x + mdx + 1, bot + 1, 1); putM(x + mdx, bot + 1, 2); putM(x + mdx, bot + 2, 2); putM(x + mdx - 1, bot + 2, 1); putM(x + mdx + 1, bot + 2, 1); putM(x + mdx, bot + 3, 1); }
        continue;
      }
      const deep = bot >= MB.y1 - 2, nb = deep ? bot + 2 : bot;
      for (let y = top; y <= nb; y++) putM(x, y, 1);
      if (deep && x > MB.x0 + 2 && x < MB.x1 - 2) putM(x, bot + 1, x % 3 === 0 ? 1 : 2);   // zuby
    }
    if (S.mouth === 'tongue' && mouth === 'logo') stamp(c, ['#rrr#', '#rrr#', '.#r#.'], MB.cx + mdx, MB.y1 + 1.5);
  } else if (mouth === 'grimace') stamp(c, ART.grimace, MB.cx, MB.cy + 1);
  else if (mouth === 'yawn') stamp(c, ART.yawn, MB.cx, MB.cy + .5);
  else if (mouth === 'O') stamp(c, ART.O, MB.cx + mdx, MB.cy);
  else if (mouth === 'small') stamp(c, ART.small, MB.cx, MB.y1 - 1);
  else if (mouth === 'sniffM') stamp(c, ART.sniffM, MB.cx, MB.y1 - 1);
  // tvár navyše
  const fe = S.faceExtra;
  if (fe === 'blush') [[EL.cx - 1, EL.y1 + 3], [ER.cx + 1, ER.y1 + 3]].forEach(([x, y]) => { for (let a = -2; a <= 2; a++) for (let b = 0; b <= 1; b++) if (!c[Math.round(y + b) * GW + Math.round(x + a)]) putM(Math.round(x + a), Math.round(y + b), 5); });
  if (fe === 'freckles') [[EL.cx - 3, EL.y1 + 3], [EL.cx, EL.y1 + 4], [EL.cx + 2, EL.y1 + 2], [ER.cx + 3, ER.y1 + 3], [ER.cx, ER.y1 + 4], [ER.cx - 2, ER.y1 + 2]].forEach(([x, y]) => putM(Math.round(x), Math.round(y), 6));
  if (fe === 'bandaid') stamp(c, ['7777.', '.7777', '..777'], ER.cx + 3, ER.y1 + 3);
  if (fe === 'eyeblack') [EL, ER].forEach(E => { for (let x = Math.round(E.cx) - 3; x <= Math.round(E.cx) + 3; x++) { putM(x, E.y1 + 2, 1); } });
  if (fe === 'scar') { for (let k = 0; k < 5; k++) putM(Math.round(ER.cx) + 1 + Math.round(k * .5), ER.y0 - 3 + k, 6); for (const k of [0, 2, 4]) { putM(Math.round(ER.cx) + Math.round(k * .5), ER.y0 - 3 + k, 6); putM(Math.round(ER.cx) + 2 + Math.round(k * .5), ER.y0 - 3 + k, 6); } }
  if (fe === 'piercing') { const nx = Math.round(MB.cx), ny = Math.round(EL.y1) + 4; putM(nx, ny, 10); putM(nx - 1, ny + 1, 10); putM(nx, ny + 2, 10); putM(nx + 1, ny + 1, 1); }
  if (fe === 'mustache') stamp(c, ['##.......##', '###.....###', '.####.####.', '..###.###..'].map(r => r.replace(/#/g, 'm')), MB.cx, MB.y0 - 2.5);
  if (fe === 'eyepatch') { for (let y = ER.y0 - 1; y <= ER.y1 + 1; y++) for (let x = ER.x0 - 1; x <= ER.x1 + 1; x++) putM(x, y, 11); for (let x = EL.x0 - 2; x < ER.x0 - 1; x++) putM(x, Math.round(ER.y0 - 1 + (x - EL.x0) * .15), 11); }
  if (fe === 'monocle') { const cx0 = Math.round(ER.cx), cy0 = Math.round(ER.cy), r = 5; for (let a = 0; a < 32; a++) { const x = Math.round(cx0 + Math.cos(a / 32 * Math.PI * 2) * r), y = Math.round(cy0 + Math.sin(a / 32 * Math.PI * 2) * r); if (!c[y * GW + x]) putM(x, y, 12); } for (let k = 0; k < 5; k++) putM(cx0 + r + (k < 3 ? 0 : -1), cy0 + 2 + k, 12); }
  return c;
}
const FACE_COL = { 2: [250, 246, 236], 3: [74, 16, 24], 4: [214, 92, 104], 5: [240, 130, 150], 6: [120, 80, 60], 7: [232, 201, 166], 10: [220, 220, 225], 11: null, 12: [226, 181, 60], 13: [42, 29, 22] };
function applyFace(arr, codes) {
  const e = EYES[S.eyes], ec = hexRgb(e.color), core = mix(ec, [255, 255, 255], .5);
  const a = new Int32Array(arr), keep = new Uint8Array(GW * GH);
  for (let i = 0; i < GW * GH; i++) keep[i] = codes[i] ? 1 : 0;
  for (let y = 1; y < GH - 1; y++) for (let x = 1; x < GW - 1; x++) {
    const i = y * GW + x, v = codes[i]; if (!v) continue;
    if (v === 1) { const inner = codes[i - 1] === 1 && codes[i + 1] === 1 && codes[i - GW] === 1 && codes[i + GW] === 1; a[i] = pack(e.glow ? (inner ? core : ec) : INK); }
    else a[i] = pack(v === 11 ? ramp(S.faceColor)[1] : FACE_COL[v]);
  }
  if (e.glow) for (let y = 1; y < GH - 1; y++) for (let x = 1; x < GW - 1; x++) { const i = y * GW + x; if (!keep[i] && M(x, y) && (codes[i - 1] === 1 || codes[i + 1] === 1 || codes[i - GW] === 1 || codes[i + GW] === 1)) a[i] = pack(mix(unpack(a[i]), ec, .45)); }
  return { a, keep };
}
const hemOff = (y, f) => y < GH - 9 ? 0 : Math.round(Math.sin(f / 4 * Math.PI * 2 + (y - (GH - 9)) * .7) * ((y - (GH - 9)) / 8));
/* snímky sa kreslia, až keď sú treba, a pamätajú sa, kým sa duch nezmení */
const frameCache = new Map(); let bodyCache = null;
let DIST = null;
function getFrame(expr, f) {
  const key = JSON.stringify(S); if (key !== spriteKey) { spriteKey = key; frameCache.clear(); bodyCache = bodyPixels(); }
  if (!DIST) { const occ = new Uint8Array(LW * LH); for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) if (mask[y * GW + x]) occ[(y + PT) * LW + x + PX] = 1; DIST = chebyshevOut(occ, LW, LH, 4); }
  const k = expr + '|' + f; let L = frameCache.get(k); if (L) return L;
  const { out, holo } = bodyCache, { a, keep } = applyFace(out, faceCodes(EX[expr] || EX.idle));
  L = new Layer(LW, LH);
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) { const sx = x - hemOff(y, f); if (sx < 0 || sx >= GW) continue; const i = y * GW + sx; if (mask[i]) L.set(x + PX, y + PT, a[i], keep[i] ? 255 : holo[i]); }
  drawItems(L, DIST);
  L.outline(S.outline ? pack(INK) : pack(ramp(S.color)[3].map(v => v * .45 | 0)));
  if (S.finish === 'glow') { const g = ramp(S.color)[0]; for (let y = 0; y < LH; y++) for (let x = 0; x < LW; x++) { if (L.get(x, y)) continue; let n = 0; for (let b = -2; b <= 2; b++) for (let c2 = -2; c2 <= 2; c2++) if (L.get(x + c2, y + b)) n++; if (n && ((x + y) % 2 === 0 || n > 6)) L.aura.push([x, y, Math.min(.5, n * .06)]); } L.auraCol = g; }
  frameCache.set(k, L); return L;
}
function chebyshevOut(occ, w, h, max) {
  const d = new Uint8Array(w * h).fill(255);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { if (occ[y * w + x]) { d[y * w + x] = 0; continue; } let best = 255; for (let b = -max; b <= max; b++) for (let c = -max; c <= max; c++) { const X = x + c, Y = y + b; if (X >= 0 && Y >= 0 && X < w && Y < h && occ[Y * w + X]) best = Math.min(best, Math.max(Math.abs(b), Math.abs(c))); } d[y * w + x] = best; }
  return d;
}

/* ================= veci (ručne kreslené pixely) ================= */
const POM = [' hbb ', 'hbbbs', 'bbbbs', 'bbsss', ' sss '];
const HORN = ['...h', '..hb', '.hbs', '.bbs', 'bbs.', 'bss.'];
const CROWN = ['H.....H.....H', 'YH...HYH...HY', 'YYH.HYYYH.HYO', 'YYYYYYYYYYYYO', 'HYRYYBYBYYRYO', 'YYYYYYYYYYYOO', 'OOOOOOOOOOODD'];
const CUP = ['.hbb.', 'hbbbs', 'hbbbs', 'hbkbs', 'hbkbs', 'hbbbs', 'bbbss', '.sss.'];
const HALO = ['...HHHHHHHH...', '.HY........YH.', 'HY..........YH', '.OY........YO.', '...OOOOOOOO...'];
const pal4 = r => ({ h: r[0], b: r[1], s: r[2], k: r[3] });
function drawItems(L, dist) {
  const cx = PX + CX, top = PT;
  const toneAt = (x, l, r) => { const t = (x - l) / Math.max(1, r - l); return t < .22 ? 0 : t < .62 ? 1 : t < .86 ? 2 : 3; };
  if (S.head === 'beanie') {
    const R = ramp(S.headColor);
    for (let by = -1; by <= 9; by++) {
      const l = by < 0 ? spanL[0] + 1 : spanL[by] - 1, r = by < 0 ? spanR[0] - 1 : spanR[by] + 1, cuff = by >= 7;
      const L2 = cuff ? l - 1 : l, R2 = cuff ? r + 1 : r;
      for (let x = L2; x <= R2; x++) { let t = toneAt(x, L2, R2); if (cuff && x % 2 === 0) t = Math.min(3, t + 1); if (!cuff && (x + by) % 4 === 0) t = Math.min(3, t + 1); if (by === 9) t = Math.min(3, t + 1); if (by === -1) t = Math.max(0, t - 1); L.set(x + PX, by + top, pack(R[t])); }
    }
    L.draw(POM, cx - 3, top - 6, pal4(ramp('#F3EBDD')));
  }
  if (S.head === 'cap') {
    const R = ramp(S.headColor);
    for (let by = -1; by <= 7; by++) {
      const l = by < 0 ? spanL[0] + 1 : spanL[by] - 1, r = by < 0 ? spanR[0] - 1 : spanR[by] + 1;
      for (let x = l; x <= r; x++) {
        const X = x + PX; const open = (by === 5 && Math.abs(X + .5 - cx) < 1.5) || (by === 6 && Math.abs(X + .5 - cx) < 2.5);
        if (open) continue;
        let t = toneAt(x, l, r); if (X === cx && by < 5) t = Math.min(3, t + 1);
        L.set(X, by + top, pack(by === 7 && Math.abs(X + .5 - cx) < 3.5 ? (X % 2 ? [29, 26, 23] : [70, 64, 58]) : R[t]));
      }
    }
    L.set(cx - 1, top - 2, pack(R[0])); L.set(cx, top - 2, pack(R[1]));
    const r6 = spanR[6] + PX;
    for (let x = r6 - 1; x <= r6 + 5; x++) { L.set(x, top + 6, pack(R[2])); L.set(x, top + 7, pack(R[3])); }
    L.set(r6 + 6, top + 6, pack(R[2]));
  }
  if (S.head === 'bandana') {
    const R = ramp(S.headColor);
    for (let by = 8; by <= 10; by++) { const l = spanL[by] - 1, r = spanR[by] + 1; for (let x = l; x <= r; x++) { let t = toneAt(x, l, r); if (by === 10) t = Math.min(3, t + 1); const dot = by === 9 && (x % 3 === 0); L.set(x + PX, by + top, pack(dot ? [243, 235, 221] : R[t])); } }
    const r = spanR[9] + PX + 1;
    L.draw(['bs', 'hbs', 'bs'], r, top + 8, pal4(R));
    [[1, 11], [2, 12], [2, 13], [3, 14], [0, 11], [0, 12], [1, 13]].forEach(([a, b], i) => L.set(r + a, top + b, pack(R[i < 4 ? 2 : 3])));
  }
  if (S.head === 'horns') {
    const R = pal4(ramp('#c8242c'));
    const lx = cx - 12, rx = cx + 8;
    L.draw(HORN, lx, top + colTop[lx - PX + 2] - 4, R);
    L.draw(HORN, rx, top + colTop[rx - PX + 1] - 4, R, true);
  }
  if (S.head === 'crown') L.draw(CROWN, cx - 6, top - 6, { ...GOLD, R: [210, 30, 40], B: [60, 120, 230] });
  if (S.extra === 'headphones') {
    const R = ramp(S.extraColor);
    for (let y = 0; y < LH; y++) for (let x = 0; x < LW; x++) { if (y - PT >= HC - 4) continue; const dd = dist[y * LW + x]; if (dd === 2) L.set(x, y, pack(x < cx ? R[0] : R[1])); else if (dd === 3) L.set(x, y, pack(R[2])); }
    L.draw(CUP, spanL[HC] + PX - 3, top + HC - 4, pal4(R));
    L.draw(CUP, spanR[HC] + PX - 1, top + HC - 4, pal4(R), true);
  }
  /* ---- ďalšie veci na hlavu (pixel) ---- */
  const capDome = (R, rows, knit = false) => { for (let by = -1; by <= rows; by++) { const l = by < 0 ? spanL[0] + 1 : spanL[by] - 1, r = by < 0 ? spanR[0] - 1 : spanR[by] + 1; for (let x = l; x <= r; x++) { let t = toneAt(x, l, r); if (knit && (x + by) % 4 === 0) t = Math.min(3, t + 1); if (by === -1) t = Math.max(0, t - 1); L.set(x + PX, by + top, pack(R[t])); } } };
  const brimBand = (R, row, ext = 2, rows = 2) => { for (let k = 0; k < rows; k++) { const by = row + k, l = spanL[Math.min(GH - 1, by)] - ext, r = spanR[Math.min(GH - 1, by)] + ext; for (let x = l; x <= r; x++) L.set(x + PX, by + top, pack(R[k === 0 ? 2 : 3])); } };
  if (S.head === 'snapback') { const R = ramp(S.headColor); capDome(R, 7); brimBand(R, 8, 3); const C = ramp('#F3EBDD'); for (let x = -3; x <= 3; x++) for (let y = 3; y <= 5; y++) L.set(cx + x, top + y, pack(C[1])); [[-2, 4], [0, 4], [2, 4]].forEach(([a, b]) => L.set(cx + a, top + b, pack([160, 20, 20]))); }
  if (S.head === 'fivepanel') { const R = ramp(S.headColor); for (let by = 2; by <= 8; by++) { const l = spanL[by] - 1, r = spanR[by] + 1; for (let x = l; x <= r; x++) L.set(x + PX, by + top, pack(R[by === 2 ? 0 : toneAt(x, l, r)])); } brimBand(R, 9, 3); }
  if (S.head === 'helmet') { const R = ramp(S.headColor); for (let by = -2; by <= 10; by++) { const src = Math.max(0, by), l = spanL[src] - (by < 0 ? -1 : 2), r = spanR[src] + (by < 0 ? -1 : 2); for (let x = l; x <= r; x++) L.set(x + PX, by + top, pack(by === 10 ? [30, 26, 28] : R[toneAt(x, l, r)])); } [[-6, 0], [-1, -1], [4, 0]].forEach(([a, b]) => { L.set(cx + a, top + b, pack([30, 26, 28])); L.set(cx + a + 1, top + b, pack([30, 26, 28])); }); L.draw(['CCCC', 'CkkC'], cx - 9, top + 5, { C: [243, 235, 221], k: [160, 20, 20] }); L.draw(['RRR', 'RwR'], cx + 6, top + 6, { R: [160, 20, 20], w: [243, 235, 221] }); L.draw(['BBB'], cx - 1, top + 3, { B: [45, 108, 192] }); }
  if (S.head === 'headband') { const R = ramp(S.headColor); for (let by = 9; by <= 10; by++) { const l = spanL[by] - 1, r = spanR[by] + 1; for (let x = l; x <= r; x++) L.set(x + PX, by + top, pack(R[(x + by) % 3 === 0 ? 2 : toneAt(x, l, r)])); } }
  if (S.head === 'bucket') { const R = ramp(S.headColor); for (let by = 0; by <= 7; by++) { const l = spanL[by] + (by < 2 ? 1 : 0), r = spanR[by] - (by < 2 ? 1 : 0); for (let x = l; x <= r; x++) L.set(x + PX, by + top, pack(R[by === 0 ? 0 : toneAt(x, l, r)])); } for (let by = 8; by <= 10; by++) { const e = by - 7, l = spanL[8] - 1 - e, r = spanR[8] + 1 + e; for (let x = l; x <= r; x++) L.set(x + PX, by + top, pack(R[by === 8 ? 1 : by === 9 ? 2 : 3])); } }
  if (S.head === 'trucker') { const R = ramp(S.headColor), W = ramp('#F3EBDD'); capDome(W, 7); for (let by = 1; by <= 7; by++) { for (let x = cx - 7; x <= cx + 7; x++) L.set(x, by + top, pack(R[Math.abs(x - cx) > 5 ? 2 : 1])); } for (let by = 0; by <= 7; by++) { const l = spanL[by] - 1, r = spanR[by] + 1; for (let x = l; x <= r; x++) if (Math.abs(x + PX - cx) > 7 && (x + by) % 2 === 0) L.set(x + PX, by + top, pack(W[3])); } brimBand(R, 8, 3); L.draw(['kkk', 'k.k', 'kkk'], cx - 1, top + 3, { k: [21, 19, 18] }); }
  if (S.head === 'hood') { const R = ramp(S.headColor); for (let by = -2; by <= 24; by++) { const src = Math.max(0, Math.min(GH - 1, by)), l = spanL[src] - (by < 0 ? -2 : 2), r = spanR[src] + (by < 0 ? -2 : 2); for (let x = l; x <= r; x++) { const inside = by >= 8 && x > spanL[Math.max(0, by)] + 2 && x < spanR[Math.max(0, by)] - 2; if (inside) continue; L.set(x + PX, by + top, pack(R[(by >= 8 && (x <= spanL[Math.max(0, by)] + 2 || x >= spanR[Math.max(0, by)] - 2)) ? 0 : toneAt(x, l, r)])); } } [-3, 3].forEach(s => { for (let y = 26; y <= 34; y++) L.set(cx + s, top + y, pack([243, 235, 221])); L.set(cx + s, top + 35, pack([60, 56, 52])); }); }
  if (S.head === 'balaclava') { const R = ramp(S.headColor); for (let by = -1; by <= faceBot + 1; by++) { const src = Math.max(0, by), l = spanL[src] - (by < 0 ? -1 : 1), r = spanR[src] + (by < 0 ? -1 : 1); for (let x = l; x <= r; x++) { const slot = by >= faceTop - 1 && by <= split && x >= 7 && x <= 32; if (slot) continue; let t = toneAt(x, l, r); if ((x + by) % 4 === 0) t = Math.min(3, t + 1); L.set(x + PX, by + top, pack(R[t])); } } }
  if (S.head === 'laurel') { const by = 8; for (let x = spanL[by] - 1; x <= spanR[by] + 1; x++) { const k = (x - spanL[by]) % 4; L.set(x + PX, top + by + (k === 1 || k === 2 ? -1 : 0), pack(k === 0 ? GOLD.D : k === 3 ? GOLD.O : GOLD.Y)); if (k === 1) L.set(x + PX, top + by - 2, pack(GOLD.H)); } }
  if (S.head === 'catears') { const R = ramp(S.headColor), EAR = ['...h', '..hb', '.hpb', 'hppb', 'bbbs']; L.draw(EAR, cx - 13, top + colTop[CX - 10] - 4, { ...pal4(R), p: [240, 168, 184] }); L.draw(EAR, cx + 7, top + colTop[CX + 8] - 4, { ...pal4(R), p: [240, 168, 184] }, true); }
  if (S.head === 'cone') { const CONE = ['....oo....', '....oo....', '...oOOo...', '...wwww...', '..oOOOOo..', '..oOOOOo..', '.wwwwwwww.', '.oOOOOOOo.', 'oOOOOOOOOo', 'kkkkkkkkkk']; L.draw(CONE, cx - 5, top - 9, { o: [255, 150, 60], O: [255, 122, 26], w: [243, 235, 221], k: [42, 34, 40] }); }
  if (S.head === 'mohawk') { const R = ramp(S.headColor); for (let i = -7; i <= 7; i++) { const x = cx + i, h = 3 + Math.round(Math.cos(i / 7 * 1.4) * 4), y0 = top + colTop[Math.max(0, Math.min(GW - 1, x - PX))]; for (let k = 1; k <= h; k++) L.set(x, y0 - k, pack(R[k === h ? 0 : i % 2 ? 2 : 1])); L.set(x, y0, pack(R[3])); } }
  /* ---- tvár navyše v pixeloch (okuliare) ---- */
  if (S.faceExtra === 'sunglasses') { const F = ramp(S.faceColor); for (const [E, fl] of [[EL, 0], [ER, 1]]) { const x0 = Math.round(E.cx) - 5, y0 = Math.round(E.cy) - 2; for (let y = 0; y < 5; y++) for (let x = 0; x < 10; x++) { const edge = y === 0 || y === 4 || x === 0 || x === 9; L.set(PX + x0 + x, top + y0 + y, pack(edge ? F[2] : y === 1 && x < 4 ? [70, 70, 76] : [18, 16, 20])); } } for (let x = Math.round(EL.cx) + 5; x < Math.round(ER.cx) - 5; x++) L.set(PX + x, top + Math.round(EL.cy) - 1, pack(F[2])); for (const x of [spanL[Math.round(EL.cy)] - 1, spanR[Math.round(EL.cy)] + 1]) for (let k = 0; k < 2; k++) L.set(PX + x + (x < CX ? k : -k), top + Math.round(EL.cy) - 1, pack(F[3])); }
  if (S.faceExtra === 'goggles') { const F = ramp(S.faceColor); for (let x = cx - 9; x <= cx + 9; x++) for (let y = 9; y <= 12; y++) { const edge = y === 9 || y === 12 || x === cx - 9 || x === cx + 9 || x === cx; L.set(x, top + y, pack(edge ? F[2] : (y === 10 && x % 5 === 1) ? [255, 220, 150] : [255, 140, 50])); } for (let x = spanL[10] - 1; x <= spanR[10] + 1; x++) if (x + PX < cx - 9 || x + PX > cx + 9) L.set(x + PX, top + 10, pack([21, 19, 18])); }
  /* ---- ďalšie doplnky ---- */
  if (S.extra === 'earbuds') { const W = [243, 235, 221]; [[spanL[HC], -1], [spanR[HC], 1]].forEach(([x, s]) => { L.set(x + PX + s, top + HC, pack(W)); L.set(x + PX + s, top + HC + 1, pack(W)); for (let k = 1; k < 10; k++) L.set(x + PX + s - Math.round(s * k * .4), top + HC + 1 + k, pack([230, 225, 215])); }); }
  if (S.extra === 'neckerchief') { const R = ramp(S.extraColor); for (let by = faceBot + 3; by <= faceBot + 5; by++) { const l = spanL[by], r = spanR[by]; for (let x = l; x <= r; x++) L.set(x + PX, by + top, pack(by === faceBot + 5 ? R[3] : (x % 3 === 0 && by === faceBot + 4) ? [243, 235, 221] : R[toneAt(x, l, r)])); } L.draw(['bb', 'sb', 's.'], spanR[faceBot + 4] + PX - 1, top + faceBot + 6, pal4(R)); }
  if (S.extra === 'skatetool') { const x = spanR[GH - 12] + PX - 3, y = top + GH - 12; L.draw(['.s.', 'sss', '.r.', '.r.', '.r.'], x, y, { s: [210, 212, 216], r: [160, 20, 20] }); L.set(x + 1, y - 1, pack([210, 212, 216])); }
  if (S.extra === 'backpack') { const R = ramp(S.extraColor); for (let by = 22; by <= 40; by++) { const l = spanL[by], r = spanR[by]; for (const x of [l + 4, l + 5, r - 5, r - 4]) L.set(x + PX, by + top, pack(R[3])); for (let k = 1; k <= 3; k++) { if (by >= 26 && by <= 40) { L.set(l - k + PX, by + top, pack(R[k === 3 ? 2 : 1])); L.set(r + k + PX, by + top, pack(R[k === 3 ? 2 : 1])); } } } }
  if (S.extra === 'fanny') { const R = ramp(S.extraColor); for (let k = 0; k <= 18; k++) { const x = 9 + k, y = 22 + Math.round(k * .95); if (M(x, y)) L.set(x + PX, y + top, pack(R[3])); if (M(x + 1, y)) L.set(x + 1 + PX, y + top, pack(R[2])); } L.draw(['.bbbbbb.', 'bhbbbbbb', 'bbbbbbsb', '.ssssss.'], PX + 24, top + 36, pal4(R)); L.set(PX + 27, top + 37, pack([210, 212, 216])); L.set(PX + 28, top + 37, pack([210, 212, 216])); }
  if (S.extra === 'lanyard') { const Rr = ramp('#A01414'); for (let k = 0; k < 9; k++) { L.set(cx - 7 + Math.round(k * .7), top + faceBot + 3 + k, pack(Rr[2])); L.set(cx + 6 - Math.round(k * .7), top + faceBot + 3 + k, pack(Rr[2])); } L.draw(['kkkkkkk', 'kwwwwwk', 'kwrrrwk', 'kwwwwwk', 'kwrwrwk', 'kwwwwwk', 'kkkkkkk'], cx - 3, top + faceBot + 11, { k: [21, 19, 18], w: [243, 235, 221], r: [160, 20, 20] }); }
  if (S.extra === 'camera') { for (let k = 0; k < 8; k++) { L.set(cx - 9 + k, top + faceBot + 2 + Math.round(k * .5), pack([21, 19, 18])); L.set(cx + 8 - k, top + faceBot + 2 + Math.round(k * .5), pack([21, 19, 18])); } L.draw(['.kkkkkkkk.', 'kkkkggkkkk', 'kkggbbggkk', 'kkggbbggkk', 'kkkkggkkkk', '.kkkkkkkk.'], cx - 5, top + faceBot + 6, { k: [26, 26, 30], g: [70, 72, 78], b: [60, 110, 170] }); L.set(cx + 3, top + faceBot + 7, pack([255, 40, 40])); }
  if (S.extra === 'wings') { const Wg = ['#......', '##.....', '####...', '#######', '.######', '...###.', '....##.']; L.draw(Wg, spanL[24] + PX - 8, top + 20, { '#': [27, 22, 32] }); L.draw(flipArt(Wg), spanR[24] + PX + 2, top + 20, { '#': [27, 22, 32] }); }
  if (S.extra === 'scarf') { const R = ramp(S.extraColor); for (let by = faceBot + 2; by <= faceBot + 6; by++) { const l = spanL[by] - 1, r = spanR[by] + 1; for (let x = l; x <= r; x++) { let t = toneAt(x, l, r); if ((x + by) % 3 === 0) t = Math.min(3, t + 1); if (by === faceBot + 6) t = 3; L.set(x + PX, by + top, pack(R[t])); } } for (let k = 0; k < 9; k++) { const y = faceBot + 7 + k, x = cx - 9 + (k > 5 ? 1 : 0); L.set(x, top + y, pack(R[k % 2 ? 1 : 2])); L.set(x + 1, top + y, pack(R[k % 2 ? 2 : 1])); L.set(x + 2, top + y, pack(R[3])); } for (let k = 0; k < 3; k++) L.set(cx - 8 + k, top + faceBot + 16, pack(R[3])); }
  if (S.extra === 'medal') { const Rr = ramp('#A01414'); for (let k = 0; k < 7; k++) { L.set(cx - 6 + Math.round(k * .7), top + faceBot + 3 + k, pack(Rr[k % 2 ? 2 : 1])); L.set(cx + 5 - Math.round(k * .7), top + faceBot + 3 + k, pack(Rr[k % 2 ? 2 : 1])); } L.draw(['..HYY..', '.YYYYO.', 'HYYDYOO', 'YYYDYYO', 'YYDDDOO', '.OOOOO.', '..DDD..'], cx - 3, top + faceBot + 9, GOLD); }
  if (S.extra === 'chain') {
    const y0 = top + faceBot + 2;
    const pts = []; for (let i = -11; i <= 11; i++) pts.push([cx + i, y0 + Math.round((11 - Math.abs(i)) * 3 / 11)]);
    pts.forEach(([x, y], i) => L.set(x, y, pack(i % 2 ? GOLD.O : GOLD.H)));
    L.draw(['OYYYO', '.D.D.'], cx - 2, y0 + 4, GOLD);
  }
}

/* ================= scéna ================= */
const cv = canvas, ctx = cv.getContext('2d');
const off = document.createElement('canvas'), octx = off.getContext('2d');
let SW = 0, SH = 0, SCALE = 4, img, buf, bg, zoom = 1, FY = 0, CXs = 0, winList = [], starList = [];
function resize() {
  let Wd, Hd;
  if (fixed) { Wd = fixed[0]; Hd = fixed[1]; } else { const r = cv.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2); Wd = Math.round(r.width * dpr); Hd = Math.round(r.height * dpr); }
  if (!Wd || !Hd) return;
  cv.width = Wd; cv.height = Hd;
  SCALE = Math.max(1, Math.floor(Math.min(Hd / (bare ? 60 : 84), Wd / (bare ? 56 : 80))));
  SW = Math.ceil(Wd / SCALE); SH = Math.ceil(Hd / SCALE);
  off.width = SW; off.height = SH; img = octx.createImageData(SW, SH); buf = new Uint32Array(img.data.buffer);
  if (bare) { FY = SH - 6; CXs = Math.round(SW / 2); bg = new Uint32Array(SW * SH); } else buildBg();
  draw();
}
const put = (x, y, c) => { x |= 0; y |= 0; if (x >= 0 && y >= 0 && x < SW && y < SH) buf[y * SW + x] = c; };
const blend = (x, y, c, a) => { x |= 0; y |= 0; if (x < 0 || y < 0 || x >= SW || y >= SH) return; const v = buf[y * SW + x]; buf[y * SW + x] = pack(mix(unpack(v), c, a)) >>> 0; };
function line(x0, y0, x1, y1, f) { x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0; const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1; let e = dx + dy; for (;;) { f(x0, y0); if (x0 === x1 && y0 === y1) break; const e2 = 2 * e; if (e2 >= dy) { e += dy; x0 += sx; } if (e2 <= dx) { e += dx; y0 += sy; } } }
function art(rows, ox, oy, pal) { rows.forEach((row, y) => [...row].forEach((ch, x) => { if (pal[ch]) put(ox + x, oy + y, pack(pal[ch]) >>> 0); })); }

/* noc v Bratislave: hrad na kopci, paneláky, Most SNP s UFOm, betónový park s lampou a ledgom */
const SKIES = {
  night: [[20, 19, 39], [34, 25, 58], [58, 33, 72], [98, 41, 74], [154, 63, 63], [208, 112, 66]],
  sunset: [[52, 32, 78], [120, 48, 92], [200, 82, 84], [240, 132, 72], [252, 186, 90], [255, 226, 150]],
  snow: [[28, 30, 48], [44, 48, 72], [66, 72, 100], [96, 104, 132], [130, 140, 164], [168, 178, 196]],
  rain: [[14, 14, 24], [22, 22, 36], [34, 32, 50], [48, 44, 64], [62, 56, 78], [80, 70, 92]],
  day: [[70, 140, 220], [90, 160, 230], [120, 180, 240], [150, 200, 245], [185, 220, 250], [220, 236, 252]],
  garage: [[20, 22, 24], [24, 26, 28], [28, 30, 32], [32, 34, 36], [36, 38, 40], [40, 42, 44]],
  bridge: [[40, 38, 44], [48, 46, 52], [56, 54, 60], [64, 62, 68], [72, 70, 76], [80, 78, 84]],
  rooftop: [[40, 24, 70], [96, 40, 90], [170, 70, 90], [230, 120, 80], [250, 170, 90], [255, 220, 150]],
};
let SKY = SKIES.night, lampOn = true, GROUND = [[91, 83, 97], [56, 50, 64]];
function buildBg() {
  FY = SH - Math.max(10, Math.round(SH * .13)); CXs = Math.round(SW / 2);
  const HZ = FY - 22, cx = CXs, P = rng(42), sc = S.scene;
  SKY = SKIES[sc]; lampOn = !['sunset', 'day', 'rooftop', 'garage'].includes(sc); const city = !['garage', 'bridge'].includes(sc), hk = sc === 'rooftop' ? .4 : 1;
  GROUND = sc === 'garage' ? [[70, 68, 74], [44, 42, 48]] : sc === 'bridge' ? [[80, 76, 84], [50, 46, 54]] : sc === 'rooftop' ? [[110, 100, 100], [70, 62, 62]] : sc === 'day' ? [[136, 128, 140], [96, 88, 100]] : sc === 'snow' ? [[214, 220, 232], [168, 176, 196]] : sc === 'rain' ? [[58, 54, 70], [34, 31, 44]] : sc === 'sunset' ? [[120, 100, 112], [78, 64, 80]] : [[91, 83, 97], [56, 50, 64]];
  winList = []; starList = [];
  for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) {
    if (y < HZ) { const t = Math.pow(y / HZ, 1.6) * (SKY.length - 1), i = Math.floor(t), f = t - i; const c = (f - .72) * 3.6 > bayer(x, y) ? SKY[Math.min(SKY.length - 1, i + 1)] : SKY[i]; put(x, y, pack(c) >>> 0); }
    else { const t = (y - HZ) / (SH - HZ), [a, b] = GROUND; const c = mix(a, b, Math.min(1, t * 1.2)); const n = hsh(x, y, 9); put(x, y, pack(n < .08 ? mix(c, [0, 0, 0], .14) : n > .95 ? mix(c, [255, 255, 255], .07) : c) >>> 0); }
  }
  if (sc === 'night' || sc === 'rooftop') for (let i = 0; i < SW * HZ / 160; i++) { const x = P() * SW | 0, y = P() * HZ * .55 | 0; starList.push([x, y, P()]); put(x, y, pack(P() < .3 ? [255, 244, 214] : [170, 160, 205]) >>> 0); }
  // mesiac
  const mx = cx - 14, my = 12;
  if (sc === 'sunset') { for (let y = -5; y <= 5; y++) for (let x = -5; x <= 5; x++) if (x * x + y * y <= 26) put(cx + 26 + x, HZ - 21 + y, pack(y > 1 ? [255, 160, 80] : [255, 214, 120]) >>> 0); for (let x = 0; x < SW; x++) if (bayer(x, HZ - 4) < .5) blend(x, HZ - 4, [255, 200, 120], .25); }
  else if (sc === 'day') { for (let y = -5; y <= 5; y++) for (let x = -5; x <= 5; x++) if (x * x + y * y <= 24) put(cx + 24 + x, 12 + y, pack(y < -2 || x > 3 ? [255, 250, 220] : [255, 230, 120]) >>> 0); [[cx - 40, 8], [cx - 10, 18], [cx + 36, 24]].forEach(([x, y]) => art(['....####....', '..########..', '.##########.', '############', '.##########.'], x, y, { '#': [250, 252, 255] })); }
  else if (!['rain', 'garage', 'bridge'].includes(sc)) for (let y = -4; y <= 4; y++) for (let x = -4; x <= 4; x++) if (x * x + y * y <= 18) put(mx + x, my + y, pack((x - 1) * (x - 1) + (y + 1) * (y + 1) <= 4 && x > -2 ? [255, 246, 220] : x + y > 2 ? [206, 196, 186] : [238, 230, 214]) >>> 0);
  put(mx - 1, my + 1, pack([200, 190, 180]) >>> 0); put(mx + 2, my - 2, pack([210, 200, 190]) >>> 0);
  const SIL = sc === 'day' ? [120, 140, 170] : sc === 'rooftop' ? [60, 34, 70] : sc === 'sunset' ? [70, 40, 84] : sc === 'snow' ? [52, 56, 84] : sc === 'rain' ? [26, 24, 40] : [38, 29, 56], SIL2 = mix(SIL, [0, 0, 0], .2), WIN = sc === 'sunset' || sc === 'day' ? mix(SIL, [255, 220, 160], .5) : [242, 196, 109], WIN2 = sc === 'sunset' || sc === 'day' ? mix(SIL, [255, 180, 120], .5) : [243, 156, 74], WD = mix(SIL, [0, 0, 0], .3);
  if (city) {
  // hrad na kopci
  const hx = cx - 48;
  for (let x = hx - 26; x <= hx + 26; x++) { const t = (x - hx) / 26, top = HZ - 7 + Math.round(t * t * 7); for (let y = top; y < HZ; y++) put(x, y, pack(SIL2) >>> 0); }
  for (let y = HZ - 15; y < HZ - 7; y++) for (let x = hx - 9; x <= hx + 9; x++) put(x, y, pack(SIL) >>> 0);
  [[-9, -10], [8, -10], [-6, -9], [5, -9]].forEach(([a, h], i) => { for (let y = HZ - 15 + (i > 1 ? 1 : 0) - 3; y < HZ - 15; y++) { put(hx + a, y, pack(i > 1 ? SIL2 : SIL) >>> 0); put(hx + a + 1, y, pack(i > 1 ? SIL2 : SIL) >>> 0); } put(hx + a, HZ - 19 + (i > 1 ? 1 : 0), pack([70, 56, 96]) >>> 0); });
  for (let x = hx - 7; x <= hx + 7; x += 2) { if (P() < .7) put(x, HZ - 13, pack(WIN) >>> 0); if (P() < .5) put(x, HZ - 10, pack(WIN2) >>> 0); }
  // paneláky
  [[cx - 28, 13, Math.round(24 * hk)], [cx - 14, 9, Math.round(17 * hk)], [cx + 9, 11, Math.round(20 * hk)]].forEach(([x0, w, h]) => {
    for (let y = HZ - h; y < HZ; y++) for (let x = x0; x < x0 + w; x++) put(x, y, pack(x === x0 + w - 1 ? SIL2 : SIL) >>> 0);
    for (let y = HZ - h + 2; y < HZ - 1; y += 2) for (let x = x0 + 1; x < x0 + w - 1; x += 2) { const lit = P() < .32; put(x, y, pack(lit ? (P() < .7 ? WIN : WIN2) : WD) >>> 0); if (lit) winList.push([x, y]); }
  });
  // Most SNP s UFOm
  const px = cx + 40;
  for (let x = px - 52; x < SW; x++) { put(x, HZ - 2, pack(SIL2) >>> 0); put(x, HZ - 1, pack(SIL) >>> 0); if (x % 4 === 0) put(x, HZ - 3, pack(WIN) >>> 0); }
  for (let i = 0; i < 7; i++) line(px + 2, HZ - 27, px - 46 + i * 7, HZ - 3, (x, y) => put(x, y, pack([66, 53, 92]) >>> 0));
  line(px - 1, HZ - 1, px + 2, HZ - 27, (x, y) => { put(x, y, pack(SIL) >>> 0); put(x + 1, y, pack(SIL) >>> 0); });
  line(px + 4, HZ - 1, px + 3, HZ - 27, (x, y) => put(x, y, pack(SIL) >>> 0));
  art(['...SSSSSS...', '.SSSSSSSSSS.', 'SSwSSwSSwSSS', '.ssssssssss.'], px - 3, HZ - 32, { S: SIL, s: SIL2, w: [159, 227, 255] });
  }
  if (sc === 'garage') { const C = [52, 52, 58], C2 = [38, 38, 44]; for (let y = 0; y < 7; y++) for (let x = 0; x < SW; x++) put(x, y, pack(y === 6 ? C2 : C) >>> 0); for (let x = 0; x < SW; x++) if (x % 3 !== 1) put(x, 8, pack([57, 255, 20]) >>> 0); for (const px0 of [cx - 34, cx + 30]) for (let y = 7; y < HZ + 3; y++) for (let x = px0; x < px0 + 7; x++) put(x, y, pack(x === px0 + 6 ? C2 : hsh(x, y, 5) < .07 ? [70, 70, 78] : C) >>> 0); pixText('P2', cx - 33, 14, [255, 198, 26], [20, 20, 24]); for (let x = 0; x < SW; x++) if ((x >> 2) % 2 === 0) put(x, HZ + 5, pack([255, 198, 26]) >>> 0); for (let y = HZ - 4; y < HZ; y++) for (let x = 0; x < SW; x++) if (hsh(x, y, 15) < .5) put(x, y, pack(C2) >>> 0); }
  if (sc === 'bridge') { const C = [96, 92, 100], C2 = [70, 66, 74]; for (let y = 0; y < 9; y++) for (let x = 0; x < SW; x++) put(x, y, pack(y === 8 ? C2 : hsh(x, y, 6) < .06 ? [110, 106, 114] : C) >>> 0); for (const px0 of [cx - 40, cx + 32]) for (let y = 9; y < HZ + 2; y++) for (let x = px0; x < px0 + 11; x++) put(x, y, pack(x >= px0 + 9 ? C2 : hsh(x, y, 7) < .05 ? [110, 106, 114] : C) >>> 0); pixText('GOS', cx - 39, 20, [255, 43, 214], [60, 20, 60]); pixText('SK8', cx + 33, 30, [0, 240, 255], [20, 60, 70]); pixText('BA', cx - 36, 34, [255, 198, 26], [60, 50, 20]); for (let i = 0; i < 4; i++) { const x = (hsh(i, 3, 8) * SW) | 0; for (let y = 9; y < 9 + 6 + i * 3; y++) put(x, y, pack([60, 56, 64]) >>> 0); } }
  if (sc === 'rooftop') { for (let y = HZ - 1; y <= HZ + 2; y++) for (let x = 0; x < SW; x++) put(x, y, pack(y === HZ - 1 ? [190, 186, 180] : y === HZ + 2 ? [110, 104, 100] : [150, 144, 140]) >>> 0); art(['.##########.', '############', '#oooooooooo#', '#o........o#', '#oooooooooo#', '############', '############'], cx - 44, FY - 12, { '#': [140, 143, 150], o: [60, 62, 70] }); for (let i = 0; i < 10; i++) put(cx - 42 + i, FY - 9, pack((i + (performance.now() / 100 | 0)) % 2 ? [60, 62, 70] : [200, 200, 205]) >>> 0); art(['.###.', '#####', '.#.#.', '.#.#.', '.#.#.', '.#.#.', '.#.#.'], cx + 36, FY - 12, { '#': [160, 164, 172] }); }
  // horizont: žiara mesta
  for (let x = 0; x < SW; x++) if (bayer(x, HZ) < .5) put(x, HZ, pack([120, 92, 110]) >>> 0);
  // betón: škáry v perspektíve
  const JC = [44, 39, 51];
  [3, 7, 13, 21].forEach(o => { const y = HZ + o; if (y < SH) for (let x = 0; x < SW; x++) put(x, y, pack(JC) >>> 0); });
  for (let k = -8; k <= 8; k++) line(cx + k * 4, HZ + 1, cx + k * 26, SH + 30, (x, y) => { if (y > HZ && y < SH) put(x, y, pack(JC) >>> 0); });
  for (let i = 0; i < 6; i++) { let x = P() * SW | 0, y = HZ + 4 + P() * (SH - HZ - 4) | 0; for (let k = 0; k < 6; k++) { put(x, y, pack([38, 33, 44]) >>> 0); x += P() < .5 ? 1 : 2; y += P() < .5 ? 0 : (P() < .5 ? 1 : -1); } }
  // sneh na strechách a na ledgi
  if (sc === 'snow') { for (let x = 0; x < SW; x++) { for (let y = 0; y < HZ; y++) { const v = buf[y * SW + x], c = unpack(v); if (c[0] === SIL[0] && c[1] === SIL[1] && c[2] === SIL[2] || c[0] === SIL2[0] && c[1] === SIL2[1] && c[2] === SIL2[2]) { put(x, y, pack([236, 240, 248]) >>> 0); if (y + 1 < HZ) put(x, y + 1, pack([200, 208, 224]) >>> 0); break; } } } }
  // lampa a svetlo na betóne
  const lx = cx - 36;
  if (!['garage', 'bridge', 'rooftop'].includes(sc)) {
  for (let y = FY + 2; y > HZ - 26; y--) put(lx, y, pack([28, 22, 34]) >>> 0);
  for (let x = lx; x <= lx + 4; x++) put(x, HZ - 26, pack([28, 22, 34]) >>> 0);
  art(['kkkk', 'LLLL', '.ll.'], lx + 2, HZ - 26, { k: [28, 22, 34], L: lampOn ? [255, 236, 170] : [60, 50, 64], l: lampOn ? [255, 214, 120] : [50, 42, 54] });
  }
  if (sc === 'garage' || sc === 'bridge') { /* bez lampy */ } else if (lampOn) for (let y = HZ - 23; y < FY + 6; y++) for (let x = lx - 30; x < lx + 40; x++) {
    const dx = (x - lx - 4) / 26, dy = (y - FY - 1) / 7, d = dx * dx + dy * dy;
    if (y > HZ && d < 1) blend(x, y, [255, 196, 110], d < .45 ? .22 : (bayer(x, y) < .5 ? .14 : .05));
    const cdx = (x - lx - 4) / Math.max(1, (y - (HZ - 23)) * .55), inCone = Math.abs(cdx) < 1 && y < FY;
    if (inCone && bayer(x, y) < .12) blend(x, y, [255, 226, 150], .18);
  }
  // ledge s kovovou hranou a tagom
  const gx = cx + 30;
  if (gx < SW) {
    for (let y = FY - 10; y < FY - 7; y++) for (let x = gx + (FY - 7 - y); x < gx + 30 + (FY - 7 - y); x++) put(x, y, pack(hsh(x, y, 3) < .06 ? [165, 157, 176] : [128, 120, 135]) >>> 0);
    for (let x = gx; x < gx + 30; x++) put(x, FY - 7, pack(x % 5 === 0 ? [240, 242, 245] : [201, 204, 208]) >>> 0);
    for (let y = FY - 6; y <= FY + 1; y++) for (let x = gx; x < gx + 30; x++) put(x, y, pack(mix([106, 98, 112], [78, 71, 84], (y - FY + 6) / 8)) >>> 0);
    pixText('GOS', gx + 5, FY - 5, [214, 58, 52], [60, 20, 22]);
    if (sc === 'snow') for (let y = FY - 11; y < FY - 7; y++) for (let x = gx + (FY - 7 - y) - 1; x < gx + 30 + (FY - 7 - y); x++) put(x, y, pack(y === FY - 11 ? [255, 255, 255] : [228, 234, 244]) >>> 0);
    if (sc === 'rain') for (let x = 2; x < SW - 2; x += 1) if (hsh(x, 5, 31) < .35 && x > cx + 8) blend(x, FY + 3, [120, 130, 170], .35);
  }
  // kužeľ
  art(['..o..', '..o..', '.oWo.', '.oOo.', 'oWWWo', 'ooooo', 'DDDDD'], cx - 31, FY - 4, { o: [255, 122, 26], O: [212, 86, 26], W: [243, 235, 221], D: [42, 34, 40] });
  if (sc === 'snow') art(['.ww.', 'wwww'], cx - 31, FY - 5, { w: [240, 244, 250] });
  bg = new Uint32Array(buf);
}

/* malé písmo 3×5 */
const FONT = { A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111', F: '111100110100100', G: '011100101101011', H: '101101111101101', I: '111010010010111', J: '001001001101010', K: '101101110101101', L: '100100100100111', M: '101111111101101', N: '110101101101101', O: '010101101101010', P: '110101110100100', Q: '010101101110011', R: '110101110101101', S: '011100010001110', T: '111010010010010', U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101', Y: '101101010010010', Z: '111001010100111', 0: '111101101101111', 1: '010110010010111', 2: '110001010100111', 3: '110001010001110', 4: '101101111001001', 5: '111100110001110', 6: '011100110101010', 7: '111001010010010', 8: '010101010101010', 9: '010101011001110', '#': '101111101111101', '-': '000000111000000', ' ': '000000000000000' };
function pixText(s, x, y, col, shadow) {
  s = s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
  [...s].forEach((ch, i) => { const g = FONT[ch] || FONT[' ']; for (let k = 0; k < 15; k++) if (g[k] === '1') { const X = x + i * 4 + k % 3, Y = y + (k / 3 | 0); if (shadow) put(X + 1, Y + 1, pack(shadow) >>> 0); put(X, Y, pack(col) >>> 0); } });
}

/* doska v štyroch fázach kickflipu */
const yoff = x => x < 2 ? -2 : x < 5 ? -1 : x > 43 ? -2 : x > 40 ? -1 : 0;
function boardLayer(phase, tick) {
  const L = new Layer(52, 18), o = 2, y0 = 5, D = ramp(S.board.deck), Wr = ramp(S.board.wheels);
  const G = [43, 39, 37], G2 = [64, 58, 54], WO = [220, 193, 150], WOd = [179, 142, 92];
  const T = [7, 34], TR = ramp(S.board.trucks), M0 = TR[0], M1 = TR[1], M2 = TR[3];
  const normal = () => {
    for (let x = 0; x < 46; x++) { const y = y0 + yoff(x); L.set(o + x, y, pack(hsh(x, 1, 2) < .25 ? G2 : G)); L.set(o + x, y + 1, pack(x < 3 || x > 42 ? WOd : WO)); L.set(o + x, y + 2, pack(D[x < 8 ? 0 : x > 38 ? 2 : 1])); }
    const spin = [[1, 1], [2, 1], [2, 2], [1, 2]][tick % 4];
    T.forEach(t => {
      [' ab ', 'abbc', 'abbc', ' cc '].forEach((row, r) => [...row].forEach((ch, c) => { if (ch === ' ') return; const col = (c === spin[0] && r === spin[1]) ? mix(Wr[0], [255, 255, 255], .5) : Wr[ch === 'a' ? 0 : ch === 'b' ? 1 : 2]; L.set(o + t + c, y0 + 5 + r, pack(col)); }));
      for (let x = t; x < t + 4; x++) L.set(o + x, y0 + 3, pack(M0));
      for (let x = t - 1; x < t + 5; x++) L.set(o + x, y0 + 4, pack(x === t + 1 ? M2 : M1));
    });
    // tenisky na doske (nad gripom), 2 kusy
    const sk = S.board.shoes;
    if (sk !== 'none') {
      const Sh = ramp(S.board.shoeColor), W = [243, 235, 221], K = [21, 19, 18];
      const drawShoe = (x0, flip) => {
        const hgt = sk === 'hightop' ? 5 : 3, soleH = sk === 'chunky' ? 2 : 1, base = y0 - 1;
        for (let r = 0; r < soleH; r++) for (let x = 0; x < 9; x++) L.set(o + x0 + x, base - r, pack(sk === 'chunky' && r === 1 ? [200, 206, 214] : W));
        for (let r = 1; r <= hgt; r++) { const w = r > hgt - 1 ? 6 : 8, off = flip ? 0 : 1; for (let x = 0; x < w; x++) { const tone = r === hgt ? 0 : x === 0 || x === w - 1 ? 2 : 1; L.set(o + x0 + off + x + (flip ? 1 : 0), base - soleH - r + 1, pack(Sh[tone])); } }
        if (sk === 'skate') for (let x = 1; x < 8; x++) L.set(o + x0 + x, base - soleH, pack(K));
        if (sk === 'slipon') for (let x = 1; x < 8; x += 2) L.set(o + x0 + x, base - soleH - 1, pack(W));
        if (sk === 'canvas' || sk === 'skate' || sk === 'hightop') for (let x = 3; x < 6; x++) L.set(o + x0 + x, base - soleH - hgt + 1, pack(W));
        if (sk === 'hightop') for (let x = 2; x < 6; x += 2) L.set(o + x0 + x, base - soleH - 3, pack(W));
        if (sk === 'chunky') for (let x = 2; x < 7; x++) L.set(o + x0 + x, base - 1, pack([110, 150, 210]));
        L.set(o + x0 + (flip ? 1 : 8), base - soleH - 1, pack(Sh[0]));   // špička
      };
      drawShoe(9, true); drawShoe(27, false);
    }
    // doplnky dosky
    const bxk = S.board.extra;
    if (bxk === 'rails') for (const x of [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37]) L.set(o + x, y0 + 3, pack([243, 235, 221]));
    if (bxk === 'tailguard') for (let x = 0; x < 4; x++) for (let r = 0; r <= 2; r++) L.set(o + x, y0 + yoff(x) + r, pack([30, 26, 28]));
    if (bxk === 'snapped') { for (let x = 41; x < 46; x++) for (let r = 0; r <= 2; r++) { const v = L.get(o + x, y0 + yoff(x) + r); L.set(o + x, y0 + yoff(x) + r, 0); L.set(o + x, y0 + yoff(x) + r + Math.ceil((x - 40) / 2), v); } for (let r = 0; r <= 3; r++) L.set(o + 40, y0 + r, pack([217, 185, 138])); }
  };
  const rect = (fill) => { for (let y = -2; y <= 5; y++) for (let x = 0; x < 46; x++) { const e = y === -2 || y === 5 ? 2 : y === -1 || y === 4 ? 1 : 0; if (x < e || x > 45 - e) continue; L.set(o + x, y0 + y, pack(fill(x, y))); } };
  if (phase === 0) normal();
  if (phase === 2) { normal(); const c = new Int32Array(L.c); for (let y = 0; y < 18; y++) for (let x = 0; x < 52; x++) L.c[y * 52 + x] = c[(2 * y0 + 6 - y) * 52 + x] || 0; }
  if (phase === 1) rect((x, y) => y === -2 ? G2 : hsh(x, y, 4) < .2 ? G2 : G);
  if (phase === 3) {
    const cream = rgbHsl(hexRgb(S.board.deck))[2] > .7, ic = cream ? [21, 19, 18] : [243, 235, 221], ik = cream ? [243, 235, 221] : [21, 19, 18], stripe = S.board.deck.toLowerCase() === '#a01414' ? [21, 19, 18] : [160, 20, 20];
    rect((x, y) => (x === 5 || x === 6 || x === 39 || x === 40) ? stripe : D[y <= -1 ? 0 : y >= 4 ? 2 : 1]);
    L.draw(['.ccccc.', 'ccccccc', 'ckccckc', 'cckkkcc', 'ccccccc', 'c.c.c.c'], o + 19, y0 - 1, { c: ic, k: ik });
    T.forEach(t => { for (let x = t; x < t + 4; x++) { L.set(o + x, y0 - 4, pack(Wr[1])); L.set(o + x, y0 - 3, pack(Wr[2])); L.set(o + x, y0 + 6, pack(Wr[1])); L.set(o + x, y0 + 7, pack(Wr[2])); } for (let x = t; x < t + 4; x++) { L.set(o + x, y0 + 1, pack(M1)); L.set(o + x, y0 + 2, pack(M2)); } });
  }
  L.outline(pack(INK));
  return L;
}
function blitLayer(L, ox, oy, t) {
  const holo = S.finish === 'holo';
  if (L.aura.length) { const g = L.auraCol; L.aura.forEach(([x, y, a]) => blend(ox + x, oy + y, g, a)); }
  for (let y = 0; y < L.h; y++) for (let x = 0; x < L.w; x++) {
    const v = L.c[y * L.w + x]; if (!v) continue;
    const ht = L.holo[y * L.w + x];
    if (S.finish === 'translucent' && ht !== 255 && (x + y) % 2) continue;
    if (holo && ht !== 255) { const hue = (x * 9 + y * 6 + t * 24) % 360; put(ox + x, oy + y, pack(hslRgb(hue, .62, [.9, .8, .7, .6][ht])) >>> 0); }
    else put(ox + x, oy + y, v >>> 0);
  }
}

/* ================= animácia (12 snímok/s ako na starých konzolách) ================= */
const HOP = [0, -3, -6, -9, -11, -12, -12, -11, -9, -6, -3, 0];
const FLIP = [0, 0, 0, 1, 1, 2, 2, 3, 3, 0, 0, 0];
let tick = 0, trick = null, dust = [], lastInput = performance.now();
const EMOTES = {
  look: { name: 'Rozhliadne sa', about: 'Doľava, doprava a späť na teba.', steps: [['left', 7], ['idle', 2], ['right', 7], ['idle', 2], ['left', 3], ['idle', 3]] },
  glare: { name: 'Zamračí sa', about: 'Prižmúri oči a podozrievavo sa obzerá.', steps: [['squint', 8], ['squintL', 6], ['squint', 3], ['squintR', 6], ['squint', 6]] },
  grin: { name: 'Zlý úškrn', about: 'Vycerí zuby ako Doomguy so zbraňou.', steps: [['grin', 18]] },
  sniff: { name: 'Potiahne nosom', about: 'Niečo cíti. Trikrát si potiahne.', steps: [['sniff', 3, { dy: -1, puff: 1 }], ['blink', 2], ['sniff', 3, { dy: -1, puff: 1 }], ['blink', 2], ['sniff', 4, { dy: -1, puff: 1 }], ['squint', 6]] },
  scared: { name: 'Zľakne sa', about: 'Vyskočí, roztrasie sa a zapotí.', steps: [['scared', 3, { dy: -4, bang: 1 }], ['scared', 8, { dy: -2, shake: 1, bang: 1, drop: 1 }], ['scaredL', 4, { dy: -1, shake: 1 }], ['scaredR', 4, { dy: -1, shake: 1 }], ['scared', 3], ['blink', 2]] },
  yawn: { name: 'Zíva', about: 'Natiahne sa a poriadne zazíva.', steps: [['sleepy', 4], ['yawn', 14, { dy: -1, stretch: 1 }], ['sleepy', 6], ['blink', 2]] },
  ouch: { name: 'Au!', about: 'Keď doňho ťukneš. Zaškrípe zubami.', steps: [['ouch', 8, { shake: 1, squash: 1 }], ['squint', 5]] },
};
let emote = null, idleGap = 20, autoOn = autoStart, lastEm = null, ghostBox = null;
const playEmote = (k, byUser = true) => { if (byUser) lastInput = performance.now(); emote = { k, i: 0, t: 0 }; };
function emoteStep() {
  if (!emote) {
    if (autoOn && !trick && --idleGap <= 0) playEmote(randomEmote(), false);
    else return null;
  }
  const steps = EMOTES[emote.k].steps, st = steps[emote.i], res = { expr: st[0], fx: st[2] || {}, first: emote.t === 0 };
  if (++emote.t >= st[1]) { emote.t = 0; if (++emote.i >= steps.length) { emote = null; idleGap = 24 + (Math.random() * 50 | 0); } }
  return res;
}
const BANG = ['.kk.', 'kYYk', 'kYYk', 'kYYk', 'kYYk', '.kk.', 'kYYk', '.kk.'];
const startTrick = kind => { lastInput = performance.now(); if (!trick) trick = { kind, k: 0 }; };
function draw(advance = false) {
  if (!buf) return;
  if (advance && !bare) lastEm = emoteStep();
  const em = lastEm, fx = em ? em.fx : {};
  buf.set(bg);
  const t = tick, cx = CXs;
  if (!bare) {
  // počasie
  if (S.scene === 'snow') for (let i = 0; i < SW * FY / 90; i++) { const sp = .35 + hsh(i, 0, 5) * .4, x = (hsh(i, 1, 5) * SW + Math.sin((t + i) * .15) * 1.5 + t * .15 * (i % 2 ? 1 : -1) + SW) % SW, y = (hsh(i, 2, 5) * FY + t * sp) % (FY + 2); put(x, y, pack(i % 3 ? [240, 244, 252] : [200, 210, 230]) >>> 0); }
  if (S.scene === 'rain') { for (let i = 0; i < SW * FY / 45; i++) { const x = (hsh(i, 1, 6) * SW - t * .6 + SW * 4) % SW, y = (hsh(i, 2, 6) * FY + t * 3.2) % (FY + 1); put(x, y, pack([120, 130, 170]) >>> 0); put(x, y - 1, pack([88, 94, 128]) >>> 0); } for (let i = 0; i < 6; i++) { const x = (hsh(i, 9, 6) * SW) | 0, y = FY + 1 + (hsh(i, 8, 6) * 6 | 0); if ((t + i * 5) % 14 < 3) { put(x - 1, y, pack([140, 150, 190]) >>> 0); put(x + 1, y, pack([140, 150, 190]) >>> 0); } } }
  // hviezdy blikajú, okná na panelákoch občas zhasnú
  starList.forEach(([x, y, p], i) => { if ((t + i * 7) % 47 === 0) put(x, y, pack([255, 255, 255]) >>> 0); });
  winList.forEach(([x, y], i) => { if (hsh(i, t >> 4, 77) < .04) put(x, y, pack([27, 21, 38]) >>> 0); });
  }
  let hop = 0, phase = 0, squash = 0;
  if (trick) { hop = HOP[trick.k]; if (trick.kind === 'flip') phase = FLIP[trick.k]; }
  const bx = cx - 23, deckY = FY - 8 + hop;
  if (!bare) {
  // tieň (a svetlo pri Glow)
  const rx = Math.max(8, 15 + hop / 2);
  for (let y = -2; y <= 2; y++) for (let x = -rx - 2; x <= rx + 2; x++) { const d = (x / rx) ** 2 + (y / 2.2) ** 2; if (d < .6) blend(cx + x, FY + 1 + y, [10, 6, 14], .42); else if (d < 1.1 && (x + y) % 2 === 0) blend(cx + x, FY + 1 + y, [10, 6, 14], .3); }
  if (S.finish === 'glow') { const g = ramp(S.color)[0]; for (let y = -6; y <= 6; y++) for (let x = -34; x <= 34; x++) { const d = (x / 32) ** 2 + (y / 5) ** 2; if (d < 1 && FY + y > FY - 4) blend(cx + x, FY + 1 + y, g, d < .4 ? .2 : bayer(cx + x, FY + y) < .5 ? .12 : 0); } }
  }
  if (trick && trick.k === HOP.length - 1) squash = 1;
  const bob = [0, 0, -1, -1, -1, 0][(t >> 2) % 6];
  const ghostBottom = S.board.show ? deckY - 3 : FY - 4 + hop;
  const fi = (t >> 1) % 4, blink = ((t + 24) % 60 > 57) ? 1 : 0;
  const G = getFrame(em ? em.expr : blink ? 'blink' : 'idle', fi);
  const gx = cx - PX - CX + (fx.shake ? (t % 2 ? 1 : -1) : 0), gy = ghostBottom - (PT + GH - 1) + bob + (trick && trick.k > 2 && trick.k < 9 ? -1 : 0) + squash + (fx.dy || 0) + (fx.squash ? 1 : 0) - (fx.stretch ? 1 : 0);
  ghostBox = [gx + PX, gy + PT, gx + PX + GW, gy + PT + GH];
  if (advance && em && em.first) {
    const mx = gx + PX + MB.cx, my = gy + PT + MB.y1;
    if (fx.puff) for (const s of [-1, 1]) for (let k = 0; k < 2; k++) dust.push({ x: mx + s * (8 + k * 2), y: my - 2 - k, vx: -s * (1.1 + k * .3), vy: 0, g: 0, life: 5, col: [214, 222, 236] });
    if (fx.drop) dust.push({ x: gx + PX + ER.x1 + 1, y: gy + PT + ER.y0 - 1, vx: .45, vy: -.9, g: .12, life: 12, col: [140, 210, 255], tall: 1 });
  }
  if (S.board.show) blitLayer(boardLayer(phase, t), bx - 2, deckY - 5, t);
  blitLayer(G, gx, gy, t);
  if (!bare) {
  // kamoš
  if (S.buddy !== 'none') drawBuddy(t, cx);
  }
  if (!bare) {
  // efekty
  if (S.effect === 'sparkle') for (let i = 0; i < 3; i++) { const ph = (t + i * 9) % 27; if (ph < 4) { const sx = gx + PX + (hsh(i, t / 27 | 0, 44) * (GW + 10) | 0) - 5, sy = gy + PT + (hsh(i, t / 27 | 0, 45) * GH | 0); const c = pack(ph < 2 ? [255, 252, 230] : [255, 220, 120]) >>> 0; put(sx, sy, c); if (ph === 1 || ph === 2) { put(sx - 1, sy, c); put(sx + 1, sy, c); put(sx, sy - 1, c); put(sx, sy + 1, c); } } }
  if (S.effect === 'notes') for (let i = 0; i < 3; i++) { const life = 36, ph = (t + i * 12) % life, nx = gx + PX + GW + 1 + (i % 2 ? 3 : 0) + Math.round(Math.sin((t + i * 7) * .3) * 2), ny = gy + PT + 10 - (ph * .6 | 0); if (ph < 28) art(i % 2 ? ['..#', '..#', '..#', '.##', '###', '.##'] : ['.####', '.#..#', '.#..#', '##.##', '##.##'], nx, ny, { '#': ph > 22 ? [150, 140, 170] : [243, 235, 221] }); }
  if (S.effect === 'hearts') for (let i = 0; i < 3; i++) { const life = 40, ph = (t + i * 13) % life; if (ph < 32) art(['#.#', '###', '.#.'], gx + PX + 6 + i * 14 + Math.round(Math.sin((t + i * 9) * .25) * 2), gy + PT + 6 - (ph * .55 | 0), { '#': ph > 24 ? [180, 90, 110] : [255, 77, 109] }); }
  if (S.effect === 'sparks' && S.board.show) { for (let i = 0; i < 7; i++) { const ph = (t * 2 + i * 5) % 12, side = i % 2 ? -1 : 1; if (ph < 7) put(cx + side * 20 + side * ph * 2 + (i % 3), deckY + 4 - Math.round(ph * 1.6 - ph * ph * .18), pack(ph < 3 ? [255, 250, 200] : [255, 190, 60]) >>> 0); } }
  if (S.effect === 'raincloud') { const cxx = gx + PX + CX + Math.round(Math.sin(t * .05) * 2), cy = gy + PT - 14; art(['...####....', '.########..', '############', '.##########', '..########.'], cxx - 6, cy, { '#': [106, 111, 128] }); for (let i = 0; i < 5; i++) { const ph = (t * 2 + i * 7) % 16, x = cxx - 4 + i * 2; put(x, cy + 5 + ph, pack([150, 190, 255]) >>> 0); } }
  if (S.effect === 'trail') { for (let k = 2; k >= 1; k--) { const ox = gx - k * 4, oy = gy + k; for (let y = 0; y < G.h; y++) for (let x = 0; x < G.w; x++) { const v = G.c[y * G.w + x]; if (!v || (x + y + k) % 2) continue; blend(ox + x, oy + y, unpack(v), .35 - k * .1); } } }
  if (S.effect === 'confetti') { const cols = [[160, 20, 20], [243, 235, 221], [255, 198, 26], [45, 108, 192], [57, 255, 20], [238, 111, 174]]; for (let i = 0; i < 18; i++) { const sp = 1 + (i % 3) * .5, x = (hsh(i, 1, 21) * SW + Math.sin((t + i) * .2) * 2) | 0, y = ((hsh(i, 2, 21) * FY + t * sp) % (FY + 4)) | 0; put(x, y, pack(cols[i % 6]) >>> 0); if (i % 2) put(x + 1, y, pack(cols[i % 6]) >>> 0); } }
  if (S.effect === 'lightning') { const ph = t % 70; if (ph < 3) { const side = (t / 70 | 0) % 2 ? -1 : 1, x = gx + PX + (side > 0 ? GW + 4 : -8), y = gy + PT - 6; art(['..##', '.##.', '####', '..##', '.##.', '.#..'], x, y, { '#': ph === 1 ? [255, 255, 255] : [159, 212, 255] }); for (let k = 0; k < 6; k++) blend(gx + PX + (k * 7) % GW, gy + PT + (k * 11) % GH, [255, 255, 255], .25); } }
  if (S.effect === 'aura') { for (let a = 0; a < 48; a++) { const ang = a / 48 * Math.PI * 2 + t * .03, r = 25 + Math.round(Math.sin(t * .2 + a) * 1.5); const x = gx + PX + CX + Math.round(Math.cos(ang) * r * 1.1), y = gy + PT + 22 + Math.round(Math.sin(ang) * r); if ((a + t) % 3 === 0) put(x, y, pack([255, 215, 90]) >>> 0); else blend(x, y, [255, 200, 80], .5); } for (let i = 0; i < 4; i++) { const ph = (t + i * 11) % 30; if (ph < 5) { const x = gx + PX - 6 + (hsh(i, t / 30 | 0, 61) * (GW + 12) | 0), y = gy + PT - 4 + (hsh(i, t / 30 | 0, 62) * (GH + 8) | 0); put(x, y, pack([255, 250, 210]) >>> 0); put(x - 1, y, pack([255, 215, 90]) >>> 0); put(x + 1, y, pack([255, 215, 90]) >>> 0); put(x, y - 1, pack([255, 215, 90]) >>> 0); put(x, y + 1, pack([255, 215, 90]) >>> 0); } } }
  if (S.effect === 'flames' && S.board.show) { const fr = t % 2, FL = fr ? ['...o...', '..oY...', '.oYYo..', 'oYWYYo.', '.oYYo..'] : ['..o....', '.oYo...', '.oYYo..', 'oYWYo..', '.oYo...']; art(FL, bx - 7, deckY - 7, { o: [255, 90, 20], Y: [255, 180, 40], W: [255, 240, 180] }); art(FL.slice(1), bx + 44, deckY - 6, { o: [255, 90, 20], Y: [255, 180, 40], W: [255, 240, 180] }); }
  }
  if (fx.bang) art(BANG, gx + PX + GW - 2, gy + PT - 12, { k: [24, 14, 18], Y: [255, 208, 64] });
  if (S.board.extra === 'wax' && S.board.show) art(['.wwww.', 'wWWWww', 'wWrrww', 'wwwwww', '.ssss.'], cx + 30, deckY + 1, { w: [243, 235, 221], W: [255, 250, 240], r: [160, 20, 20], s: [180, 170, 160] });
  if (S.extra === 'halo') { const hy = gy + PT - 10 + ((t >> 3) % 2 ? -1 : 0); art(HALO, cx - 7, hy, GOLD); if (t % 6 < 3) put(cx - 9 + (t % 18), hy - 1, pack([255, 250, 210]) >>> 0); }
  // prach pri dopade
  if (advance) { dust = dust.filter(p => p.life-- > 0); dust.forEach(p => { p.x += p.vx; p.y += p.vy; p.vy += p.g ?? .15; }); }
  dust.forEach(p => { const c = pack(p.col || (p.life > 3 ? [200, 192, 205] : [140, 132, 150])) >>> 0; put(p.x, p.y, c); if (p.tall) { put(p.x, p.y + 1, c); put(p.x, p.y - 1, pack(mix(p.col, [255, 255, 255], .6)) >>> 0); } });
  if (!bare) {
  // názov ducha
  const nm = (BODY_COLORS.find(c => c[1].toLowerCase() === S.color.toLowerCase())?.[0] || 'Vlastny');
  pixText(nm, 4, 4, [243, 235, 221], [10, 8, 14]);
  pixText('#' + String(S.seed).padStart(4, '0'), 4, 11, [179, 169, 191], [10, 8, 14]);
  }
  octx.putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = false; ctx.drawImage(off, 0, 0, SW * SCALE, SH * SCALE);
  if (trick && advance) { trick.k++; if (trick.k >= HOP.length) { trick = null; for (let i = 0; i < 8; i++) dust.push({ x: cx + (i < 4 ? -14 : 14) + (Math.random() * 4 - 2), y: FY, vx: (i < 4 ? -1 : 1) * (.4 + Math.random() * .8), vy: -.6 - Math.random() * .6, life: 6 + (Math.random() * 3 | 0) }); } }
}
/* kamoši: 2-snímkové pixel postavičky */
const CAT = [['..#.#..', '..###..', '.#####.', '.#####.', '..###..', '..###.#', '..###.#', '.#####.'], ['..#.#..', '..###..', '.#####.', '.#####.', '..###..', '..###..', '..####.', '.####.#']];
const PIGEON = [['..###.', '.#####', '.##o##', '######', '.####.', '..#.#.'], ['..###.', '.##o##', '.#####', '######', '.####.', '.#.#..']];
const RAT = [['......##', '.####.#.', '######..', '.#.#.#..'], ['.....##.', '.####.#.', '######..', '#.#..#..']];
function drawBuddy(t, cx) {
  const f = (t >> 2) % 2, gx = cx + 30;
  if (S.buddy === 'cat') art(CAT[f], gx + 2, FY - 18, { '#': [32, 28, 36] });
  if (S.buddy === 'pigeon') art(PIGEON[f], gx + 3, FY - 16, { '#': [120, 118, 140], o: [255, 140, 60] });
  if (S.buddy === 'rat') { const x = cx + 30 + Math.round(Math.sin(t * .08) * 7), fl = Math.cos(t * .08) < 0; art(fl ? RAT[f].map(r => [...r].reverse().join('')) : RAT[f], x, FY + 2, { '#': [96, 82, 90] }); }
  if (S.buddy === 'moths') { const lx = cx - 36 + 4, ly = FY - 22 - 26 + 1; for (let i = 0; i < 4; i++) { const a = t * (.18 + i * .05) + i * 1.6, x = lx + Math.round(Math.cos(a) * (3 + i)), y = ly + Math.round(Math.sin(a * 1.7) * 3); put(x, y, pack(t % 2 ? [238, 230, 200] : [200, 190, 160]) >>> 0); if (t % 2) { put(x - 1, y, pack([200, 190, 160]) >>> 0); put(x + 1, y, pack([200, 190, 160]) >>> 0); } } }
  if (S.buddy === 'butterfly') { const a = t * .05, x = cx + Math.round(Math.cos(a) * 28), y = FY - 34 + Math.round(Math.sin(t * .13) * 6); art((t >> 1) % 2 ? ['o.o', 'OkO', 'o.o'] : ['.k.', 'oko', '.k.'], x - 1, y, { o: [255, 122, 26], O: [212, 86, 26], k: [21, 19, 18] }); }
  if (S.buddy === 'balloon') { const R = ramp(S.buddyColor), bx0 = cx + 24 + Math.round(Math.sin(t * .07) * 2), by0 = FY - 40 + Math.round(Math.sin(t * .11) * 2); art(['.bbbb.', 'bhbbbb', 'bhbbbs', 'bbbbbs', 'bbbbss', '.bsss.', '..ss..', '...s..'], bx0, by0, pal4(R)); for (let k = 1; k < 30; k++) put(bx0 + 3 + Math.round(Math.sin(k * .3 + t * .1) * 1), by0 + 8 + k, pack([230, 225, 215]) >>> 0); }
  if (S.buddy === 'dog') { const f = (t >> 2) % 2; art(f ? ['....####..', '...#kk##k.', '.##k####k.', '#########.', '#########.', '.##.##..#.', '.#..#...#.', '.##.##.##.'] : ['....####..', '...#kk##k.', '.##k####k.', '#########.', '#########r', '.##.##..#.', '.#..#...#.', '.##.##.##.'], cx + 32, FY - 7, { '#': [214, 190, 150], k: [60, 42, 32], r: [224, 96, 112] }); put(cx + 38, FY - 5, pack([21, 19, 18]) >>> 0); put(cx + 41, FY - 5, pack([21, 19, 18]) >>> 0); }
  if (S.buddy === 'boombox') { const bx0 = cx - 44, by0 = FY - 36 + Math.round(Math.sin(t * .1) * 2); art(['.kkkkkkkkkkkkk.', 'kggggggggggggk', 'kgoookggkoookk', 'kgokokggkokokk', 'kgoookggkoookk', 'kggggwwwggggk.', 'kkkkkkkkkkkkk.'], bx0, by0, { k: [34, 34, 40], g: [70, 72, 80], o: [20, 20, 24], w: [21, 19, 18] }); for (let i = 0; i < 4; i++) put(bx0 + 5 + i, by0 + 5, pack((t + i) % 3 ? [57, 255, 20] : [20, 80, 20]) >>> 0); if (t % 4 < 2) { put(bx0 + 4, by0 + 3, pack([120, 120, 130]) >>> 0); put(bx0 + 10, by0 + 3, pack([120, 120, 130]) >>> 0); } }
  if (S.buddy === 'bats') { for (let i = 0; i < 2; i++) { const a = t * .06 + i * Math.PI, x = cx + Math.round(Math.cos(a) * 30), y = FY - 44 + Math.round(Math.sin(t * .12 + i) * 5); art((t + i) % 2 ? ['#.....#', '##.#.##', '.#####.'] : ['.......', '##.#.##', '#######'], x - 3, y, { '#': [27, 22, 32] }); put(x - 1, y + 1, pack([255, 42, 31]) >>> 0); put(x + 1, y + 1, pack([255, 42, 31]) >>> 0); } }
  if (S.buddy === 'crow') { const gx = cx + 30; art((t >> 3) % 2 ? ['....##', '...####', 'o#####.', '.####..', '.#.#...'] : ['....##.', '...####', '.######', 'o###...', '.#.#...'], gx + 4, FY - 15, { '#': [24, 24, 30], o: [80, 80, 90] }); put(gx + 9, FY - 14, pack([230, 230, 240]) >>> 0); }
  if (S.buddy === 'drone') { const x = cx + 20 + Math.round(Math.sin(t * .05) * 10), y = FY - 52 + Math.round(Math.sin(t * .09) * 3); art(['r#.....#r', 'k#######k', '.#kkkkk#.', '....k....'], x - 4, y, { '#': [40, 40, 46], k: [26, 26, 30], r: [255, 42, 31] }); if (t % 2) { for (const dx of [-5, 4]) { put(x + dx, y - 1, pack([120, 120, 130]) >>> 0); put(x + dx + 1, y - 1, pack([120, 120, 130]) >>> 0); } } put(x, y + 3, pack([57, 255, 20]) >>> 0); }
  if (S.buddy === 'mini') { const R = ramp(S.color), y = FY - 30 + Math.round(Math.sin(t * .18) * 2); art(['..####..', '.######.', '########', '#.####.#', '########', '########', '#.##.##.'], gx + 6, y, { '#': R[1] }); put(gx + 8, y + 3, pack(INK) >>> 0); put(gx + 11, y + 3, pack(INK) >>> 0); }
}

  return { draw, resize, buildBg, startTrick, playEmote, get S() { return S; }, set S(v) { S = v; }, setAuto: v => { autoOn = !!v; idleGap = 6; }, hasGhost: () => !!ghostBox, ghostBox: () => ghostBox, isBusy: () => !!(trick || dust.length || emote), tick: () => { tick++; }, wake: () => { lastInput = performance.now(); }, idle: () => performance.now() - lastInput, sw: () => SW };
}

/* Živý pixelový duch na plátne. Vráti funkciu na upratanie s metódami setGhost(), setLook(), emote(), trick(), setAuto(). */
export function mountPixelGhost(canvas, { ghost, look, interactive = true, onScene = null, autoOn = true } = {}) {
  const E = makeEngine(canvas, { ghost, look, autoOn });
  const sceneOf = () => { canvas.dataset.scene = E.S.scene; onScene?.(E.S.scene); };
  const ro = new ResizeObserver(() => { E.resize(); }); ro.observe(canvas); E.resize(); sceneOf();
  let alive = true, visible = true, last = 0;
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; }); io.observe(canvas);
  const wakeEvents = ['pointerdown', 'pointermove', 'wheel', 'input', 'click', 'keydown', 'touchstart'];
  const wake = () => E.wake(); wakeEvents.forEach(ev => addEventListener(ev, wake, { passive: true }));
  (function loop(now) {
    if (!alive) return;
    requestAnimationFrame(loop);
    if (!visible || document.hidden || now - last < 83) return;
    if (E.idle() > 60000 && !E.isBusy()) return;   // šetrí batériu: po minúte bez dotyku duch zaspí
    last = now; E.tick(); E.draw(true);
  })(0);
  let tap = null;
  const onDown = e => { tap = [e.clientX, e.clientY, performance.now()]; };
  const onUp = e => {
    if (!tap || Math.hypot(e.clientX - tap[0], e.clientY - tap[1]) > 10 || performance.now() - tap[2] > 400) { tap = null; return; }
    tap = null; if (!interactive) return;
    const r = canvas.getBoundingClientRect(), b = E.ghostBox(); const x = (e.clientX - r.left) * canvas.width / r.width, y = (e.clientY - r.top) * canvas.height / r.height;
    E.wake();
    if (b && hitGhost(E, canvas, x, y)) E.playEmote(Math.random() < .6 ? 'ouch' : 'scared'); else E.startTrick('flip');
  };
  canvas.addEventListener('pointerdown', onDown); canvas.addEventListener('pointerup', onUp);
  const api = () => { alive = false; ro.disconnect(); io.disconnect(); wakeEvents.forEach(ev => removeEventListener(ev, wake)); canvas.removeEventListener('pointerdown', onDown); canvas.removeEventListener('pointerup', onUp); };
  api.setGhost = g => { E.S = toS(g, look); E.buildBg(); sceneOf(); E.draw(); E.wake(); };
  api.setLook = l => { look = l; E.S = toS(E.S, look); E.draw(); };
  api.emote = k => { E.playEmote(k); E.wake(); };
  api.trick = () => E.startTrick('flip');
  api.setAuto = v => E.setAuto(v);
  return api;
}
function hitGhost(E, canvas, x, y) { const b = E.ghostBox(); if (!b) return false; const scale = canvas.width / E.sw(); return x >= b[0] * scale && x < b[2] * scale && y >= b[1] * scale && y < b[3] * scale; }

/* Statický obrázok ducha (bez pozadia) pre zoznamy, mapu a karty. Vráti canvas. */
export function renderPixelGhost(ghost, { look, width = 160, height = 180 } = {}) {
  const c = document.createElement('canvas');
  const E = makeEngine(c, { ghost, look, bare: true, fixed: [width, height], autoOn: false });
  E.resize();
  return c;
}

/* Duch GOSko: katalóg vzhľadu, výrazy a kreslenie tváre. Bez three.js, aby to zvládol aj ľahký web (Ghoskate, karty).
   Nastavenie ducha (profiles.ghost, verzia 2) vykreslí 3D model (mascot.js) aj 2D obrázok (profile.js). */

export const RARITY = {
  free: { cls: 'r-free', label: { sk: 'Free', cs: 'Free', en: 'Free' } },
  event: { cls: 'r-event', label: { sk: 'Event', cs: 'Event', en: 'Event' } },
  wave: { cls: 'r-wave', label: { sk: '1. vlna', cs: '1. vlna', en: 'Wave 1' } },
  win: { cls: 'r-win', label: { sk: 'Víťaz', cs: 'Vítěz', en: 'Winner' } },
};
/* lock = vec v inventári, bez ktorej sa voľba nedá vybrať */
export const BODY_COLORS = [['Klasik', '#F3EBDD'], ['Červený', '#C9332C'], ['Mätový', '#A6EFC9'], ['Ľadový', '#A3DCF5'], ['Fialový', '#C4ADFF'], ['Uhľový', '#2a2826'], ['Betón', '#8d8a84'], ['Piesok', '#E8D6A8'], ['Oranž', '#FF7A1A'], ['Žltý', '#FFC61A'], ['Ružový', '#EE6FAE'], ['Modrý', '#2D6CC0']];
export const ITEM_COLORS = ['#A01414', '#151312', '#F3EBDD', '#2D6CC0', '#1E6B45', '#FF7A1A', '#EE6FAE', '#FFC61A'];
export const PATTERNS = {
  none: { name: 'Bez vzoru', about: 'Čistá farba.', r: 'free' },
  stripe: { name: 'Pás', about: 'Pás nad nožičkami ako na doske.', r: 'free' },
  spots: { name: 'Fľaky', about: 'Náhodné škvrny, každý duch iné.', r: 'free' },
  split: { name: 'Dvojfarebný', about: 'Hlava v druhej farbe.', r: 'event', src: 'Za účasť na GOSku', lock: 'pattern:split' },
};
export const FINISHES = {
  vinyl: { name: 'Vinyl', about: 'Lesklá figúrka, základ.', r: 'free' },
  mat: { name: 'Mat', about: 'Mäkký, ako guma.', r: 'free' },
  chrome: { name: 'Chróm', about: 'Zrkadlový kov.', r: 'event', src: 'Za 3 odjazdené GOSká', lock: 'finish:chrome' },
  holo: { name: 'Founder holo', about: 'Perleťový dúhový lesk.', r: 'wave', src: 'Len do spustenia. Potom už nikdy.', lock: 'skin:founder' },
  glow: { name: 'Glow', about: 'Svieti v tme.', r: 'win', src: 'Víťaz GOSka', lock: 'finish:glow' },
};
export const EYE_COLORS = {
  ink: { name: 'Tuš', color: '#0e0d0c', glow: 0, r: 'free' },
  red: { name: 'Červené', color: '#ff2a1f', glow: 1.8, r: 'free' },
  ice: { name: 'Ľadové', color: '#7DF9FF', glow: 1.6, r: 'free' },
  neon: { name: 'Neón', color: '#39FF14', glow: 1.8, r: 'event', src: 'Afterparty GOSka', lock: 'eyes:neon' },
  gold: { name: 'Zlaté', color: '#ffd04a', glow: 1.4, r: 'win', src: 'Víťaz GOSka', lock: 'eyes:gold' },
};
export const EYE_SHAPES = {
  logo: { name: 'Z loga', about: 'Zlé šikmé oči ako na logu.', r: 'free' },
  round: { name: 'Okrúhle', about: 'Guľaté, trochu prekvapené.', r: 'free' },
  dots: { name: 'Bodky', about: 'Malé, pokojné.', r: 'free' },
  slits: { name: 'Štrbiny', about: 'Úzke, nahnevané.', r: 'event', src: 'Za check-in na GOSku', lock: 'face:slits' },
};
export const MOUTHS = {
  logo: { name: 'Úsmev z loga', about: 'Široký zlý úsmev.', r: 'free' },
  flat: { name: 'Rovné', about: 'Bez nálady. Poker face.', r: 'free' },
  fangs: { name: 'Tesáky', about: 'Úsmev s dvoma zubami.', r: 'event', src: 'Afterparty GOSka', lock: 'face:fangs' },
  tongue: { name: 'Jazyk', about: 'Vyplazený jazyk.', r: 'free' },
};
export const HEADS = {
  none: { name: 'Nič', about: 'Holá hlava.', r: 'free' },
  beanie: { name: 'Čiapka', about: 'Zimná s brmbolcom.', r: 'free', color: true },
  cap: { name: 'Šiltovka', about: 'Šiltom dozadu.', r: 'free', color: true },
  bandana: { name: 'Šatka', about: 'Bandana okolo hlavy.', r: 'event', src: 'GOSko 3 Bratislava', color: true, lock: 'head:bandana' },
  horns: { name: 'Rohy', about: 'Malý čertík.', r: 'wave', src: 'Len 1. vlna', lock: 'head:horns' },
  crown: { name: 'Koruna', about: 'Pre kráľa parku.', r: 'win', src: 'Víťaz GOSka', lock: 'head:crown' },
};
export const EXTRAS = {
  none: { name: 'Nič', about: 'Bez doplnku.', r: 'free' },
  headphones: { name: 'Slúchadlá', about: 'Na DJ set aj na session.', r: 'free', color: true },
  chain: { name: 'Retiazka', about: 'Zlatá s doskou.', r: 'event', src: 'Za check-in na evente', lock: 'extra:chain' },
  halo: { name: 'Svätožiara', about: 'Vznáša sa nad hlavou.', r: 'wave', src: 'Len 1. vlna', lock: 'extra:halo' },
};
export const MARKS = {
  none: { name: 'Nič', about: 'Čisté telo.', r: 'free' },
  ghost: { name: 'Duch', about: 'Malý GOSko duch.', r: 'free', art: ['.#####.', '#######', '#.###.#', '#######', '#######', '#######', '#.#.#.#'] },
  skull: { name: 'Lebka', about: 'Klasika zo skejtu.', r: 'free', art: ['.#####.', '#######', '#.###.#', '#######', '.##.##.', '.#####.', '.#.#.#.'] },
  flame: { name: 'Plameň', about: 'Horí mu to.', r: 'free', art: ['...#...', '..##...', '.###.#.', '.#####.', '#######', '#######', '.#####.'] },
  bolt: { name: 'Blesk', about: 'Rýchly ako blesk.', r: 'free', art: ['...###.', '..###..', '.###...', '#######', '...###.', '..###..', '.###...'] },
  star: { name: 'Hviezda', about: 'Hviezda parku.', r: 'event', src: 'Best Trick na GOSku', lock: 'mark:star', art: ['...#...', '..###..', '#######', '.#####.', '.#####.', '##...##', '#.....#'] },
  heart: { name: 'Srdce', about: 'Skate je láska.', r: 'free', art: ['.##.##.', '#######', '#######', '#######', '.#####.', '..###..', '...#...'] },
  number: { name: 'Číslo', about: 'Tvoje číslo ducha.', r: 'wave', src: 'Len 1. vlna', lock: 'mark:number' },
};
export const BUDDIES = {
  none: { name: 'Nikto', about: 'Jazdí sám.', r: 'free' },
  cat: { name: 'Mačka', about: 'Sedí vedľa a švihá chvostom.', r: 'free' },
  pigeon: { name: 'Holub', about: 'Bratislavský holub. Kýva hlavou.', r: 'free' },
  rat: { name: 'Potkan', about: 'Behá okolo dosky.', r: 'event', src: 'Za nočný check-in', lock: 'buddy:rat' },
  mini: { name: 'Mini duch', about: 'Malý duch v tvojej farbe, lieta vedľa.', r: 'wave', src: 'Len 1. vlna', lock: 'buddy:mini' },
};
export const SCENES = {
  night: { name: 'Noc', about: 'Tmavé štúdio, červené svetlo zozadu.', r: 'free' },
  sunset: { name: 'Západ', about: 'Teplé oranžové svetlo.', r: 'free' },
  snow: { name: 'GOSko Winter', about: 'Sneží, biely betón.', r: 'event', src: 'Za GOSko Winter', lock: 'scene:winter' },
  rain: { name: 'Dážď', about: 'Kvapky a mokrý lesklý betón.', r: 'free' },
};
export const EFFECTS = {
  none: { name: 'Nič', about: 'Bez efektu.', r: 'free' },
  sparkle: { name: 'Iskry', about: 'Okolo ducha sa občas zablysne.', r: 'free' },
  notes: { name: 'Noty', about: 'Stúpajú z ducha ako z beatu.', r: 'free' },
  flames: { name: 'Plamene', about: 'Horí mu doska.', r: 'win', src: 'Víťaz GOSka', lock: 'fx:flames' },
};
export const WEAR_PRESETS = {
  clean: { name: 'Čistý', about: 'Rovno z krabice.', dirt: 0, scuff: 0, stickers: false },
  dirty: { name: 'Špinavý', about: 'Prach z parku, fľaky, šmuhy.', dirt: 75, scuff: 18, stickers: false },
  skate: { name: 'Ako doska', about: 'Ošúchaný z grindov, s nálepkami z eventov.', dirt: 40, scuff: 85, stickers: true },
};
/* Staré skiny (Ghoskate ich ukazuje ako rýchly výber farby). Verzia 2 ich prekladá na farbu + povrch. */
export const GHOST_SKINS = {
  classic: { color: '#F3EBDD', name: { sk: 'Klasik', cs: 'Klasik', en: 'Classic' } },
  red: { color: '#C9332C', name: { sk: 'Červený', cs: 'Červený', en: 'Red' } },
  mint: { color: '#A6EFC9', name: { sk: 'Mätový', cs: 'Mátový', en: 'Mint' } },
  ice: { color: '#A3DCF5', name: { sk: 'Ľadový', cs: 'Ledový', en: 'Ice' } },
  violet: { color: '#C4ADFF', name: { sk: 'Fialový', cs: 'Fialový', en: 'Violet' } },
  founder: { color: '#F2E6FF', holo: true, locked: 'skin:founder', name: { sk: 'Founder holo', cs: 'Founder holo', en: 'Founder holo' } },
};
export const DEFAULT_GHOST = { v: 2, skin: 'classic', color: '#F3EBDD', pattern: 'none', color2: '#A01414', eyes: 'ink', eyeShape: 'logo', mouth: 'logo', finish: 'vinyl', outline: true,
  dirt: 0, scuff: 0, stickers: false, seed: 1995, head: 'none', headColor: '#A01414', extra: 'none', extraColor: '#151312', mark: 'none', markColor: '#151312', buddy: 'none', scene: 'night', effect: 'none' };
const isHex = v => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
const pick = (cat, v, d) => (cat[v] ? v : d);
const num = (v, d, max = 100) => (typeof v === 'number' && v >= 0 && v <= max ? Math.round(v) : d);
/* Normalizuje nastavenie ducha: staré { skin } aj nové v2. Vždy vráti kompletný objekt so všetkými kľúčmi. */
export function ghostOf(g) {
  g = g && typeof g === 'object' ? g : {};
  const D = DEFAULT_GHOST;
  const skin = GHOST_SKINS[g.skin] ? g.skin : 'classic';
  const fromSkin = !g.v;   // starý zápis: len skin
  const color = fromSkin || !isHex(g.color) ? GHOST_SKINS[skin].color : g.color;
  const finish = fromSkin ? (GHOST_SKINS[skin].holo ? 'holo' : 'vinyl') : pick(FINISHES, g.finish, 'vinyl');
  const out = { v: 2, skin, color, pattern: pick(PATTERNS, g.pattern, 'none'), color2: isHex(g.color2) ? g.color2 : D.color2,
    eyes: pick(EYE_COLORS, g.eyes, 'ink'), eyeShape: pick(EYE_SHAPES, g.eyeShape, 'logo'), mouth: pick(MOUTHS, g.mouth, 'logo'), finish, outline: g.outline !== false,
    dirt: num(g.dirt, 0), scuff: num(g.scuff, 0), stickers: !!g.stickers, seed: num(g.seed, D.seed, 9999),
    head: pick(HEADS, g.head, 'none'), headColor: isHex(g.headColor) ? g.headColor : D.headColor, extra: pick(EXTRAS, g.extra, 'none'), extraColor: isHex(g.extraColor) ? g.extraColor : D.extraColor,
    mark: pick(MARKS, g.mark, 'none'), markColor: isHex(g.markColor) ? g.markColor : D.markColor, buddy: pick(BUDDIES, g.buddy, 'none'), scene: pick(SCENES, g.scene, 'night'), effect: pick(EFFECTS, g.effect, 'none') };
  // skin sa drží v súlade s farbou (kvôli starému strážcovi v databáze a Ghoskate výberu)
  const match = Object.entries(GHOST_SKINS).find(([k, s]) => s.color.toLowerCase() === out.color.toLowerCase() && !!s.holo === (out.finish === 'holo'));
  out.skin = match ? match[0] : (out.finish === 'holo' ? 'founder' : 'classic');
  return out;
}
/* Rýchly výber skinu (Ghoskate): zmení farbu a povrch, ostatné nastavenia ostanú. */
export const withSkin = (g, skin) => { const s = GHOST_SKINS[skin] || GHOST_SKINS.classic; return ghostOf({ ...ghostOf(g), color: s.color, finish: s.holo ? 'holo' : (ghostOf(g).finish === 'holo' ? 'vinyl' : ghostOf(g).finish) }); };
export const skinColor = g => ghostOf(g).color;
/* Všetky zámky, ktoré nastavenie používa (na kontrolu proti inventáru). */
export function ghostLocks(g) {
  g = ghostOf(g); const L = [];
  const add = (cat, k) => { const l = cat[k]?.lock; if (l) L.push(l); };
  add(PATTERNS, g.pattern); add(FINISHES, g.finish); add(EYE_COLORS, g.eyes); add(EYE_SHAPES, g.eyeShape); add(MOUTHS, g.mouth); add(HEADS, g.head); add(EXTRAS, g.extra); add(MARKS, g.mark); add(BUDDIES, g.buddy); add(SCENES, g.scene); add(EFFECTS, g.effect);
  return L;
}
/* Vráti ducha len s vecami, ktoré má človek v inventári. Zamknuté voľby padnú na základ. */
export function unlockedGhost(g, inventory = []) {
  g = ghostOf(g); const has = l => !l || inventory.includes(l);
  const fix = (cat, key, d) => { if (!has(cat[g[key]]?.lock)) g[key] = d; };
  fix(PATTERNS, 'pattern', 'none'); fix(FINISHES, 'finish', 'vinyl'); fix(EYE_COLORS, 'eyes', 'ink'); fix(EYE_SHAPES, 'eyeShape', 'logo'); fix(MOUTHS, 'mouth', 'logo');
  fix(HEADS, 'head', 'none'); fix(EXTRAS, 'extra', 'none'); fix(MARKS, 'mark', 'none'); fix(BUDDIES, 'buddy', 'none'); fix(SCENES, 'scene', 'night'); fix(EFFECTS, 'effect', 'none');
  return ghostOf(g);
}

/* ================= výrazy (ako tvár v Doome) ================= */
export const EX = {
  idle: {}, left: { dx: -1 }, right: { dx: 1 }, blink: { eyes: 'closed' },
  squint: { eyes: 'squint' }, squintL: { eyes: 'squint', dx: -1 }, squintR: { eyes: 'squint', dx: 1 },
  grin: { eyes: 'squint', mouth: 'grin' }, sniff: { eyes: 'closed', mouth: 'sniffM' },
  scared: { eyes: 'scared', mouth: 'O' }, scaredL: { eyes: 'scared', mouth: 'O', pdx: -1 }, scaredR: { eyes: 'scared', mouth: 'O', pdx: 1 },
  sleepy: { eyes: 'relax', mouth: 'small' }, yawn: { eyes: 'relax', mouth: 'yawn' }, ouch: { eyes: 'ouch', mouth: 'grimace' },
};
/* kroky v tikoch po 83 ms; fx: dy = poskok, shake = trasenie, bang = „!“ nad hlavou, squash/stretch = stlačenie */
export const EMOTES = {
  look: { name: 'Rozhliadne sa', about: 'Doľava, doprava a späť na teba.', steps: [['left', 7], ['idle', 2], ['right', 7], ['idle', 2], ['left', 3], ['idle', 3]] },
  glare: { name: 'Zamračí sa', about: 'Prižmúri oči a podozrievavo sa obzerá.', steps: [['squint', 8], ['squintL', 6], ['squint', 3], ['squintR', 6], ['squint', 6]] },
  grin: { name: 'Zlý úškrn', about: 'Vycerí zuby.', steps: [['grin', 26]] },
  sniff: { name: 'Potiahne nosom', about: 'Niečo cíti. Trikrát si potiahne.', steps: [['sniff', 3, { dy: 1 }], ['blink', 2], ['sniff', 3, { dy: 1 }], ['blink', 2], ['sniff', 4, { dy: 1 }], ['squint', 6]] },
  scared: { name: 'Zľakne sa', about: 'Vyskočí, roztrasie sa.', steps: [['scared', 3, { dy: 4, bang: 1 }], ['scared', 8, { dy: 2, shake: 1, bang: 1 }], ['scaredL', 4, { dy: 1, shake: 1 }], ['scaredR', 4, { dy: 1, shake: 1 }], ['scared', 3], ['blink', 2]] },
  yawn: { name: 'Zíva', about: 'Natiahne sa a poriadne zazíva.', steps: [['sleepy', 4], ['yawn', 14, { dy: 1, stretch: 1 }], ['sleepy', 6], ['blink', 2]] },
  ouch: { name: 'Au!', about: 'Keď doňho ťukneš. Zaškrípe zubami.', steps: [['ouch', 8, { shake: 1, squash: 1 }], ['squint', 5]] },
};
export const AUTO_EMOTES = [['look', 30], ['glare', 18], ['sniff', 14], ['grin', 12], ['yawn', 10], ['scared', 5]];
export function randomEmote() { let r = Math.random() * AUTO_EMOTES.reduce((a, w) => a + w[1], 0); return AUTO_EMOTES.find(w => (r -= w[1]) < 0)[0]; }

/* ================= tvár ================= */
/* Oči a úsmev z loga (img/ghost.svg, súradnice SVG: viewBox 160 220 480 540). */
export const EYE_L_PATH = 'M284.787 397.599C281.68 399.71 273.309 410.413 270.631 415.7C267.46 421.959 264.56 434.22 264.56 441.369C264.56 448.533 267.465 460.796 270.64 467.038C276.472 478.502 287.575 488.899 299.689 494.24C315.142 501.054 333.663 500.457 349.56 492.634C362.39 486.32 376.884 468.906 379.197 457.025L379.847 453.682L375.744 455.775C370.115 458.647 361.795 458.535 354.388 455.488C344.507 451.424 335.704 444.173 311.06 419.795C287.578 396.567 287.011 396.088 284.787 397.599Z';
export const EYE_R_PATH = 'M488.856 419.421C464.481 444.057 454.713 452.103 444.433 456.009C437.894 458.494 429.102 458.44 424.09 455.884C421.948 454.792 420.048 454.047 419.868 454.228C419.687 454.409 420.211 456.463 421.033 458.792C427.764 477.87 444.046 492.943 462.663 497.332C482.459 501.998 501.995 496.745 517.015 482.717C528.842 471.672 534.894 457.8 534.836 441.869C534.777 425.929 529.725 413.284 518.856 401.879L512.652 395.369L488.856 419.421Z';
export const MOUTH_PATH = 'M265.516 520.369C280.287 545.316 305.293 568.929 330.56 581.788C353.658 593.544 369.856 597.755 395.06 598.559C414.171 599.168 428.552 597.356 444.56 592.323C470.666 584.113 497.522 566.41 516.089 545.173C523.477 536.723 535.56 519.722 535.56 517.778C535.56 517.25 532.568 519.356 528.911 522.459C514.003 535.105 491.698 548.015 472.115 555.332C424.725 573.038 374.454 572.996 327.06 555.212C309.956 548.793 286.638 535.444 273.059 524.296C262.609 515.716 262.828 515.83 265.516 520.369Z';
let P = null;
const paths = () => P || (P = { L: new Path2D(EYE_L_PATH), R: new Path2D(EYE_R_PATH), M: new Path2D(MOUTH_PATH) });
export const EYE_CENTERS = [[322, 436], [478, 436]], MOUTH_CENTER = [400, 557];
function rrect(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
/* Nakreslí tvár v SVG súradniciach loga. alpha = true kreslí len bielu masku (pre priehľadnosť v 3D). */
export function drawFace(c, g, exprName = 'idle', alpha = false) {
  g = ghostOf(g); const ex = EX[exprName] || EX.idle, e = EYE_COLORS[g.eyes], { L, R, M } = paths();
  const ink = alpha ? '#fff' : (e.glow ? e.color : '#0e0d0c'), white = alpha ? '#fff' : '#faf6ec', red = alpha ? '#fff' : '#4a1018', pink = alpha ? '#fff' : '#d65c68';
  const dx = (ex.dx || 0) * 24, eyes = ex.eyes || 'logo', mouth = ex.mouth || 'logo', EC = EYE_CENTERS, [mx, my] = MOUTH_CENTER;
  c.lineCap = 'round'; c.lineJoin = 'round';
  const eyeShape = i => {
    const [x, y] = EC[i]; c.fillStyle = ink;
    if (g.eyeShape === 'logo') { c.fill(i ? R : L, 'evenodd'); return; }
    c.beginPath();
    if (g.eyeShape === 'round') c.arc(x, y, 40, 0, 7);
    else if (g.eyeShape === 'dots') c.arc(x, y + 6, 22, 0, 7);
    else { const d = i ? -1 : 1; c.moveTo(x - 60 * d, y - 22); c.lineTo(x + 60 * d, y - 2); c.lineTo(x + 60 * d, y + 16); c.lineTo(x - 60 * d, y + 2); c.closePath(); }
    c.fill();
  };
  if (eyes === 'logo' || eyes === 'squint' || eyes === 'closed') {
    const k = eyes === 'squint' ? .42 : eyes === 'closed' ? .12 : 1;
    [0, 1].forEach(i => { const [x, y] = EC[i]; c.save(); c.translate(x + dx, y + (eyes === 'closed' ? 14 : 0)); c.scale(1, k); c.translate(-x, -y); eyeShape(i); c.restore(); });
  } else if (eyes === 'scared') {
    const pd = (ex.pdx || 0) * 12;
    [0, 1].forEach(i => { const [x, y] = EC[i]; c.fillStyle = ink; c.beginPath(); c.arc(x, y, 46, 0, 7); c.fill();
      if (!alpha) { c.fillStyle = '#fff'; c.beginPath(); c.arc(x - 14 + pd, y - 14, 11, 0, 7); c.fill(); }
      c.strokeStyle = ink; c.lineWidth = 16; c.beginPath(); const d = i ? -1 : 1; c.moveTo(x - 50 * d, y - 86); c.lineTo(x + 30 * d, y - 66); c.stroke(); });
  } else if (eyes === 'relax') {
    [0, 1].forEach(i => { const [x, y] = EC[i]; c.strokeStyle = ink; c.lineWidth = 15; c.beginPath(); c.arc(x, y - 24, 44, Math.PI * .2, Math.PI * .8); c.stroke(); });
  } else if (eyes === 'ouch') {
    [0, 1].forEach(i => { const [x, y] = EC[i]; const d = i ? -1 : 1; c.strokeStyle = ink; c.lineWidth = 16; c.beginPath(); c.moveTo(x - 36 * d, y - 34); c.lineTo(x + 24 * d, y); c.lineTo(x - 36 * d, y + 34); c.stroke(); });
  }
  const mdx = Math.sign(ex.dx || 0) * 12;
  if (mouth === 'logo') {
    c.save(); c.translate(mdx, 0); c.fillStyle = ink;
    if (g.mouth === 'flat') c.fillRect(mx - 95, my - 4, 190, 16); else c.fill(M, 'evenodd');
    if (g.mouth === 'fangs') [-52, 52].forEach(o => { c.fillStyle = white; c.beginPath(); c.moveTo(mx + o - 16, my + 10); c.lineTo(mx + o + 16, my + 10); c.lineTo(mx + o, my + 58); c.closePath(); c.fill(); c.strokeStyle = ink; c.lineWidth = 6; c.stroke(); });
    if (g.mouth === 'tongue') { c.fillStyle = pink; c.beginPath(); c.ellipse(mx + 10, my + 46, 34, 26, 0, 0, 7); c.fill(); c.strokeStyle = ink; c.lineWidth = 6; c.stroke(); }
    c.restore();
  }
  else if (mouth === 'grin') { c.fillStyle = ink; c.fill(M, 'evenodd'); c.save(); c.clip(M, 'evenodd'); c.fillStyle = white; c.fillRect(mx - 120, my - 2, 240, 30); c.strokeStyle = ink; c.lineWidth = 5; for (let x = mx - 100; x <= mx + 100; x += 25) { c.beginPath(); c.moveTo(x, my - 10); c.lineTo(x, my + 36); c.stroke(); } c.restore(); }
  else if (mouth === 'grimace') { c.fillStyle = ink; rrect(c, mx - 125, my - 30, 250, 62, 14); c.fill(); c.fillStyle = white; rrect(c, mx - 112, my - 18, 224, 38, 8); c.fill(); c.strokeStyle = ink; c.lineWidth = 6; for (let x = mx - 84; x <= mx + 84; x += 28) { c.beginPath(); c.moveTo(x, my - 18); c.lineTo(x, my + 20); c.stroke(); } c.beginPath(); c.moveTo(mx - 112, my + 1); c.lineTo(mx + 112, my + 1); c.stroke(); }
  else if (mouth === 'yawn') { c.fillStyle = ink; c.beginPath(); c.ellipse(mx, my + 6, 74, 62, 0, 0, 7); c.fill(); c.fillStyle = red; c.beginPath(); c.ellipse(mx, my + 8, 58, 48, 0, 0, 7); c.fill(); c.fillStyle = pink; c.beginPath(); c.ellipse(mx, my + 44, 34, 18, 0, 0, 7); c.fill(); }
  else if (mouth === 'O') { c.fillStyle = ink; c.beginPath(); c.arc(mx + mdx, my + 4, 40, 0, 7); c.fill(); c.fillStyle = red; c.beginPath(); c.arc(mx + mdx, my + 6, 28, 0, 7); c.fill(); }
  else if (mouth === 'small') { c.strokeStyle = ink; c.lineWidth = 14; c.beginPath(); c.arc(mx, my - 20, 46, Math.PI * .2, Math.PI * .8); c.stroke(); }
  else if (mouth === 'sniffM') { c.strokeStyle = ink; c.lineWidth = 14; c.beginPath(); c.arc(mx, my + 36, 44, Math.PI * 1.2, Math.PI * 1.8); c.stroke(); }
}

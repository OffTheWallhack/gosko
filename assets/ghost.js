/* Duch GOSko: katalóg vzhľadu, výrazy a kreslenie tváre. Bez three.js, aby to zvládol aj ľahký web (Ghoskate, karty).
   Nastavenie ducha (profiles.ghost, verzia 2) vykreslí 3D model (mascot.js) aj 2D obrázok (profile.js). */

/* ===== Katalóg ducha (3D, pixel, PS1). Veci sa odomykajú levelmi (XP) a eventmi (vec v inventári). ===== */
export const LEVELS = [
  [1, 'Nováčik', 'Registrácia. Základná výbava.'], [2, 'Prvý spot', 'Pridal si spot na mapu.'], [3, 'Check-in', 'Prvý check-in na GOSku.'],
  [4, 'Lokál', '3 check-iny. Park ťa pozná.'], [5, 'Jazdec', 'Odjazdené GOSko.'], [6, 'Crew', '3 GOSká alebo člen crew.'],
  [7, 'Best trick', 'Top 3 alebo Best Trick.'], [8, 'Víťaz', 'Vyhral si GOSko.'], [9, 'Šampión', 'Vyhral si finále sezóny.'], [10, 'Legenda', 'Sieň slávy GOSka.'],
];
export const RARITY = { free: { cls: 'r-free', label: { sk: 'Free', cs: 'Free', en: 'Free' } }, lvl: { cls: 'r-lvl', label: { sk: 'Lvl', cs: 'Lvl', en: 'Lvl' } }, event: { cls: 'r-event', label: { sk: 'Event', cs: 'Event', en: 'Event' } }, wave: { cls: 'r-wave', label: { sk: '1. vlna', cs: '1. vlna', en: 'Wave 1' } }, win: { cls: 'r-win', label: { sk: 'Víťaz', cs: 'Vítěz', en: 'Winner' } } };
export const FLAGS = { founder: '1. vlna (Founder)', winter: 'GOSko Winter', after: 'Afterparty GOSka', night: 'Nočný check-in', ba3: 'GOSko 3 Bratislava' };
/* ktorá vec v inventári odomkne event/vlnu */
export const FLAG_ITEMS = { founder: 'skin:founder', winter: 'event:winter', after: 'event:after', night: 'event:night', ba3: 'event:ba3' };
export const BODY_COLORS = [['Klasik', '#F3EBDD'], ['Červený', '#C9332C'], ['Mätový', '#A6EFC9'], ['Ľadový', '#A3DCF5'], ['Fialový', '#C4ADFF'], ['Uhľový', '#2a2826'], ['Betón', '#8d8a84'], ['Piesok', '#E8D6A8'], ['Oranž', '#FF7A1A'], ['Žltý', '#FFC61A'], ['Ružový', '#EE6FAE'], ['Modrý', '#2D6CC0']];
export const ITEM_COLORS = ['#A01414', '#151312', '#F3EBDD', '#2D6CC0', '#1E6B45', '#FF7A1A', '#EE6FAE', '#FFC61A', '#8d8a84', '#6B3FB8'];
export const DECK_COLORS = ['#A01414', '#151312', '#F3EBDD', '#7A7772', '#2D6CC0', '#6DBE45', '#6B3FB8', '#FF7A1A'];
export const WHEEL_COLORS = ['#F3EBDD', '#A01414', '#1b1918', '#39FF14', '#00A8FF', '#FF1F7A', '#FFF200', '#B026FF'];
export const TRUCK_COLORS = ['#C9CCD0', '#2B2A2E', '#E2B53C', '#A01414', '#2D6CC0', '#E0A28C'];
export const SHOE_COLORS = ['#151312', '#F3EBDD', '#A01414', '#2D6CC0', '#7A7772', '#1E6B45', '#E8D6A8', '#EE6FAE'];
/* lvl = od ktorého levelu; lock = event/vlna (kľúč z FLAGS); win = 8+ */
export const PATTERNS = {
  none: { name: 'Bez vzoru', about: 'Čistá farba.', lvl: 1 },
  stripe: { name: 'Pás', about: 'Pás nad nožičkami ako na doske.', lvl: 1 },
  spots: { name: 'Fľaky', about: 'Náhodné škvrny, každý duch iné.', lvl: 1 },
  checker: { name: 'Šachovnica', about: 'Klasika zo skate tenisiek.', lvl: 2 },
  hstripes: { name: 'Pásiky', about: 'Priečne pásiky ako na tričku.', lvl: 2 },
  camo: { name: 'Kamufláž', about: 'Vojenský vzor v tvojich farbách.', lvl: 3 },
  split: { name: 'Dvojfarebný', about: 'Hlava v druhej farbe.', lvl: 1, lock: 'ba3' },
  tiedye: { name: 'Batika', about: 'Rozpité farby ako z tričkovej dielne.', lvl: 4 },
  leopard: { name: 'Leopard', about: 'Škvrny s tmavým okrajom.', lvl: 5 },
  flames: { name: 'Plamene', about: 'Horiaci lem ako na hot rode.', lvl: 6 },
};
export const FINISHES = {
  vinyl: { name: 'Vinyl', about: 'Lesklá figúrka, základ.', lvl: 1 },
  mat: { name: 'Mat', about: 'Mäkký, ako guma.', lvl: 1 },
  concrete: { name: 'Betón', about: 'Drsný ako ledge v parku.', lvl: 2 },
  wood: { name: 'Javor', about: 'Drevo ako z decku, s letokruhmi.', lvl: 3 },
  translucent: { name: 'Priehľadný', about: 'Naozajstný duch. Vidno cez neho.', lvl: 4 },
  carbon: { name: 'Karbón', about: 'Tkaný karbón, matný lesk.', lvl: 5 },
  chrome: { name: 'Chróm', about: 'Zrkadlový kov.', lvl: 6 },
  marble: { name: 'Mramor', about: 'Biely mramor so žilkami.', lvl: 7 },
  glow: { name: 'Glow', about: 'Svieti v tme.', lvl: 8 },
  gold: { name: 'Zlato', about: 'Celý zo zlata. Šampión.', lvl: 9 },
  holo: { name: 'Founder holo', about: 'Perleťový dúhový lesk. Len do spustenia.', lvl: 1, lock: 'founder' },
};
export const EYE_COLORS = {
  ink: { name: 'Tuš', color: '#0e0d0c', glow: 0, lvl: 1 }, red: { name: 'Červené', color: '#ff2a1f', glow: 1.8, lvl: 1 }, ice: { name: 'Ľadové', color: '#7DF9FF', glow: 1.6, lvl: 2 },
  violet: { name: 'Fialové', color: '#c46bff', glow: 1.6, lvl: 3 }, neon: { name: 'Neón', color: '#39FF14', glow: 1.8, lvl: 1, lock: 'after' }, gold: { name: 'Zlaté', color: '#ffd04a', glow: 1.4, lvl: 8 },
};
export const EYE_SHAPES = {
  logo: { name: 'Z loga', about: 'Zlé šikmé oči ako na logu.', lvl: 1 }, round: { name: 'Okrúhle', about: 'Guľaté, trochu prekvapené.', lvl: 1 },
  dots: { name: 'Bodky', about: 'Malé, pokojné.', lvl: 1 }, slits: { name: 'Štrbiny', about: 'Úzke, nahnevané.', lvl: 3 }, sleepy: { name: 'Ospalé', about: 'Napoly zavreté, chill.', lvl: 2 },
  x: { name: 'Krížiky', about: 'Oči ako po slame. Knockout.', lvl: 5 },
};
export const MOUTHS = {
  logo: { name: 'Úsmev z loga', about: 'Široký zlý úsmev.', lvl: 1 }, flat: { name: 'Rovné', about: 'Poker face.', lvl: 1 }, tongue: { name: 'Jazyk', about: 'Vyplazený jazyk.', lvl: 1 },
  fangs: { name: 'Tesáky', about: 'Úsmev s dvoma zubami.', lvl: 1, lock: 'after' }, gap: { name: 'Medzera v zuboch', about: 'Po slamu na raile.', lvl: 4 }, smirk: { name: 'Úškrn', about: 'Jeden kútik hore.', lvl: 2 },
  teeth: { name: 'Vycerené zuby', about: 'Zuby stále von. Hype.', lvl: 3 }, o: { name: 'Prekvapené', about: 'Ústa do O. Videl trik.', lvl: 2 },
};
export const FACE_EXTRAS = {
  none: { name: 'Nič', about: 'Čistá tvár.', lvl: 1 },
  blush: { name: 'Červenanie', about: 'Líčka do ružova.', lvl: 1 },
  freckles: { name: 'Pehy', about: 'Pár bodiek na lícach.', lvl: 1 },
  bandaid: { name: 'Náplasť', about: 'Na líci. Včera to nevyšlo.', lvl: 1 },
  sunglasses: { name: 'Slnečné okuliare', about: 'Čierne, úzke.', lvl: 2, color: true },
  eyeblack: { name: 'Čierne pásy', about: 'Pod očami ako hráč.', lvl: 3 },
  goggles: { name: 'Okuliare na čelo', about: 'Snowboardové, vytiahnuté hore.', lvl: 4, color: true },
  scar: { name: 'Jazva', about: 'Cez obočie. Z ledgu.', lvl: 5 },
  piercing: { name: 'Piercing', about: 'Krúžok v nose.', lvl: 4 },
  mustache: { name: 'Fúzy', about: 'Hustý knír. Movember.', lvl: 3 },
  eyepatch: { name: 'Páska cez oko', about: 'Pirát z parku.', lvl: 4, color: true },
  monocle: { name: 'Monokel', about: 'Sklíčko na retiazke. Džentlmen.', lvl: 6 },
};
export const HEADS = {
  none: { name: 'Nič', about: 'Holá hlava.', lvl: 1 },
  beanie: { name: 'Čiapka', about: 'Zimná s brmbolcom.', lvl: 1, color: true },
  cap: { name: 'Šiltovka dozadu', about: 'Klasika.', lvl: 1, color: true },
  snapback: { name: 'Snapback', about: 'Šiltom dopredu, rovný šilt.', lvl: 2, color: true },
  fivepanel: { name: '5-panel', about: 'Nízka, plochá.', lvl: 2, color: true },
  helmet: { name: 'Helma', about: 'Skate helma s nálepkami.', lvl: 2, color: true },
  headband: { name: 'Čelenka', about: 'Froté, cez čelo.', lvl: 2, color: true },
  bucket: { name: 'Bucket', about: 'Rybársky klobúk.', lvl: 3, color: true },
  trucker: { name: 'Trucker', about: 'Sieťka vzadu, penový predok.', lvl: 3, color: true },
  hood: { name: 'Kapucňa', about: 'Mikina s kapucňou na hlave.', lvl: 3, color: true },
  bandana: { name: 'Šatka', about: 'Bandana okolo hlavy.', lvl: 1, lock: 'ba3', color: true },
  balaclava: { name: 'Kukla', about: 'Len oči von.', lvl: 5, color: true },
  catears: { name: 'Mačacie uši', about: 'Dve špicaté uši.', lvl: 2, color: true },
  cone: { name: 'Kužeľ', about: 'Dopravný kužeľ z parku. Na hlave.', lvl: 3 },
  mohawk: { name: 'Irokez', about: 'Punk hrebeň cez celú hlavu.', lvl: 4, color: true },
  horns: { name: 'Rohy', about: 'Malý čertík.', lvl: 1, lock: 'founder' },
  crown: { name: 'Koruna', about: 'Pre kráľa parku.', lvl: 8 },
  laurel: { name: 'Vavrín', about: 'Zlatý veniec šampióna.', lvl: 9 },
};
export const EXTRAS = {
  none: { name: 'Nič', about: 'Bez doplnku.', lvl: 1 },
  headphones: { name: 'Slúchadlá', about: 'Na DJ set aj na session.', lvl: 1, color: true },
  earbuds: { name: 'Slúchadlá do uší', about: 'Biele, s káblom.', lvl: 2 },
  neckerchief: { name: 'Šatka na krk', about: 'Bandana uviazaná vzadu.', lvl: 2, color: true },
  skatetool: { name: 'Skate tool', about: 'Kľúč na karabínke.', lvl: 2 },
  backpack: { name: 'Batoh', about: 'S popruhmi na dosku.', lvl: 2, color: true },
  fanny: { name: 'Ľadvinka', about: 'Cez hruď, ako sa nosí.', lvl: 3, color: true },
  lanyard: { name: 'Šnúrka s pasom', about: 'Event pass z GOSka.', lvl: 3 },
  chain: { name: 'Retiazka', about: 'Zlatá s doskou.', lvl: 1, lock: 'night' },
  camera: { name: 'Kamera', about: 'Fisheye na krku. Filmer.', lvl: 4 },
  scarf: { name: 'Šál', about: 'Pletený, omotaný okolo krku.', lvl: 2, color: true },
  medal: { name: 'Medaila', about: 'Zlatá na stuhe. Z bedne.', lvl: 7 },
  wings: { name: 'Krídla', about: 'Malé netopierie krídla.', lvl: 7 },
  halo: { name: 'Svätožiara', about: 'Vznáša sa nad hlavou.', lvl: 1, lock: 'founder' },
};
export const MARKS = {
  none: { name: 'Nič', about: 'Čisté telo.', lvl: 1 },
  ghost: { name: 'Duch', about: 'Malý GOSko duch.', lvl: 1, art: ['.#####.', '#######', '#.###.#', '#######', '#######', '#######', '#.#.#.#'] },
  heart: { name: 'Srdce', about: 'Skate je láska.', lvl: 1, art: ['.##.##.', '#######', '#######', '#######', '.#####.', '..###..', '...#...'] },
  skull: { name: 'Lebka', about: 'Klasika zo skejtu.', lvl: 2, art: ['.#####.', '#######', '#.###.#', '#######', '.##.##.', '.#####.', '.#.#.#.'] },
  flame: { name: 'Plameň', about: 'Horí mu to.', lvl: 2, art: ['...#...', '..##...', '.###.#.', '.#####.', '#######', '#######', '.#####.'] },
  bolt: { name: 'Blesk', about: 'Rýchly ako blesk.', lvl: 3, art: ['...###.', '..###..', '.###...', '#######', '...###.', '..###..', '.###...'] },
  gos: { name: 'GOS', about: 'Nápis ako tag na ledgi.', lvl: 3, text: 'GOS' },
  initials: { name: 'Iniciály', about: 'Dve písmená podľa teba.', lvl: 4, text: 'RD' },
  star: { name: 'Hviezda', about: 'Hviezda parku.', lvl: 7, art: ['...#...', '..###..', '#######', '.#####.', '.#####.', '##...##', '#.....#'] },
  number: { name: 'Číslo', about: 'Tvoje číslo ducha.', lvl: 1, lock: 'founder' },
};
export const SHOES = {
  none: { name: 'Bez tenisiek', about: 'Duch stojí na doske len tak.', lvl: 1 },
  canvas: { name: 'Plátenky', about: 'Nízke, biela podrážka.', lvl: 1, color: true },
  skate: { name: 'Skate tenisky', about: 'Vulkanizované, s pásikom.', lvl: 2, color: true },
  slipon: { name: 'Slip-on', about: 'Bez šnúrok, šachovnica.', lvl: 2, color: true },
  hightop: { name: 'High top', about: 'Vysoké, chránia členky.', lvl: 3, color: true },
  chunky: { name: 'Chunky', about: 'Hrubé, 2000s.', lvl: 5, color: true },
};
export const BOARD_EXTRAS = {
  none: { name: 'Nič', about: 'Čistá doska.', lvl: 1 },
  wax: { name: 'Vosk', about: 'Kocka vosku vedľa dosky.', lvl: 2 },
  rails: { name: 'Raily', about: 'Plastové lišty pod doskou.', lvl: 3 },
  tailguard: { name: 'Tail guard', about: 'Chránič tailu.', lvl: 4 },
  snapped: { name: 'Zlomený nos', about: 'Doska po slame. Stále jazdí.', lvl: 5 },
};
export const BUDDIES = {
  none: { name: 'Nikto', about: 'Jazdí sám.', lvl: 1 },
  moths: { name: 'Mory', about: 'Krúžia okolo lampy.', lvl: 1 },
  cat: { name: 'Mačka', about: 'Sedí vedľa a švihá chvostom.', lvl: 1 },
  pigeon: { name: 'Holub', about: 'Bratislavský holub. Kýva hlavou.', lvl: 1 },
  butterfly: { name: 'Motýľ', about: 'Lieta okolo ducha.', lvl: 2 },
  balloon: { name: 'Balón', about: 'Priviazaný k doske.', lvl: 2, color: true },
  dog: { name: 'Buldog', about: 'Sedí pri doske a dýcha.', lvl: 3 },
  boombox: { name: 'Boombox', about: 'Lieta vedľa a hrá.', lvl: 3 },
  bats: { name: 'Netopiere', about: 'Dva, krúžia v noci.', lvl: 4 },
  crow: { name: 'Vrana', about: 'Sedí na ledgi a pozerá.', lvl: 4 },
  drone: { name: 'Dron', about: 'Filmuje ťa zhora.', lvl: 5 },
  rat: { name: 'Potkan', about: 'Behá okolo dosky.', lvl: 1, lock: 'night' },
  mini: { name: 'Mini duch', about: 'Malý duch v tvojej farbe.', lvl: 1, lock: 'founder' },
};
export const SCENES = {
  night: { name: 'Noc', about: 'Bratislava v noci, lampa svieti.', lvl: 1 },
  day: { name: 'Deň', about: 'Slnko, modré nebo, mraky.', lvl: 1 },
  sunset: { name: 'Západ', about: 'Teplé nebo nad Petržalkou.', lvl: 1 },
  rain: { name: 'Dážď', about: 'Mokrý betón, kvapky.', lvl: 2 },
  garage: { name: 'Garáž', about: 'Parkovací dom s neónom.', lvl: 3 },
  bridge: { name: 'Pod mostom', about: 'Betónové piliere, graffiti.', lvl: 4 },
  rooftop: { name: 'Strecha', about: 'Nad mestom, vietor.', lvl: 6 },
  snow: { name: 'GOSko Winter', about: 'Sneží, všetko je biele.', lvl: 1, lock: 'winter' },
};
export const EFFECTS = {
  none: { name: 'Nič', about: 'Bez efektu.', lvl: 1 },
  sparkle: { name: 'Iskry', about: 'Okolo ducha sa občas zablysne.', lvl: 1 },
  notes: { name: 'Noty', about: 'Stúpajú z ducha ako z beatu.', lvl: 1 },
  hearts: { name: 'Srdiečka', about: 'Lietajú hore.', lvl: 2 },
  sparks: { name: 'Iskry z grindu', about: 'Sršia od truckov.', lvl: 3 },
  raincloud: { name: 'Mráčik', about: 'Vlastný dažďový mrak nad hlavou.', lvl: 4 },
  trail: { name: 'Stopa', about: 'Duch za sebou necháva obrysy.', lvl: 5 },
  confetti: { name: 'Konfety', about: 'Oslava, padajú farebné.', lvl: 6 },
  lightning: { name: 'Blesky', about: 'Občas ho preskočí blesk.', lvl: 7 },
  flames: { name: 'Plamene', about: 'Horí mu doska.', lvl: 8 },
  aura: { name: 'Aura legendy', about: 'Zlatá žiara. Len sieň slávy.', lvl: 10 },
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
export const DEFAULT_GHOST = { v: 3, skin: 'classic', style: '3d', color: '#F3EBDD', pattern: 'none', color2: '#A01414', eyes: 'ink', eyeShape: 'logo', mouth: 'logo', faceExtra: 'none', faceColor: '#151312', finish: 'vinyl', outline: true,
  dirt: 0, scuff: 0, stickers: false, seed: 1995, head: 'none', headColor: '#A01414', extra: 'none', extraColor: '#151312', mark: 'none', markColor: '#151312', initials: 'GO', buddy: 'none', buddyColor: '#A01414', scene: 'night', effect: 'none',
  shoes: 'none', shoeColor: '#151312', boardExtra: 'none' };
export const STYLES = { '3d': { name: '3D', about: 'Hlavný duch, plný model.' }, pixel: { name: 'Pixel', about: 'Ako zo starej hry. Mapa, zoznamy, Reels.' }, ps1: { name: 'PS1', about: 'Retro low-poly. Odomkne sa na leveli 6.', lvl: 6 } };
export const CATS = { pattern: PATTERNS, finish: FINISHES, eyes: EYE_COLORS, eyeShape: EYE_SHAPES, mouth: MOUTHS, faceExtra: FACE_EXTRAS, head: HEADS, extra: EXTRAS, mark: MARKS, buddy: BUDDIES, scene: SCENES, effect: EFFECTS, shoes: SHOES, boardExtra: BOARD_EXTRAS };
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
  const ini = String(g.initials || D.initials).replace(/[^A-Za-z0-9ÁÄČĎÉÍĹĽŇÓÔŔŠŤÚÝŽáäčďéíĺľňóôŕšťúýž]/g, '').slice(0, 2).toUpperCase() || D.initials;
  const out = { v: 3, skin, style: STYLES[g.style] ? g.style : '3d', color, pattern: pick(PATTERNS, g.pattern, 'none'), color2: isHex(g.color2) ? g.color2 : D.color2,
    eyes: pick(EYE_COLORS, g.eyes, 'ink'), eyeShape: pick(EYE_SHAPES, g.eyeShape, 'logo'), mouth: pick(MOUTHS, g.mouth, 'logo'), faceExtra: pick(FACE_EXTRAS, g.faceExtra, 'none'), faceColor: isHex(g.faceColor) ? g.faceColor : D.faceColor, finish, outline: g.outline !== false,
    dirt: num(g.dirt, 0), scuff: num(g.scuff, 0), stickers: !!g.stickers, seed: num(g.seed, D.seed, 9999),
    head: pick(HEADS, g.head, 'none'), headColor: isHex(g.headColor) ? g.headColor : D.headColor, extra: pick(EXTRAS, g.extra, 'none'), extraColor: isHex(g.extraColor) ? g.extraColor : D.extraColor,
    mark: pick(MARKS, g.mark, 'none'), markColor: isHex(g.markColor) ? g.markColor : D.markColor, initials: ini, buddy: pick(BUDDIES, g.buddy, 'none'), buddyColor: isHex(g.buddyColor) ? g.buddyColor : D.buddyColor, scene: pick(SCENES, g.scene, 'night'), effect: pick(EFFECTS, g.effect, 'none'),
    shoes: pick(SHOES, g.shoes, 'none'), shoeColor: isHex(g.shoeColor) ? g.shoeColor : D.shoeColor, boardExtra: pick(BOARD_EXTRAS, g.boardExtra, 'none') };
  // skin sa drží v súlade s farbou (kvôli starému strážcovi v databáze a Ghoskate výberu)
  const match = Object.entries(GHOST_SKINS).find(([k, s]) => s.color.toLowerCase() === out.color.toLowerCase() && !!s.holo === (out.finish === 'holo'));
  out.skin = match ? match[0] : (out.finish === 'holo' ? 'founder' : 'classic');
  return out;
}
/* Rýchly výber skinu (Ghoskate): zmení farbu a povrch, ostatné nastavenia ostanú. */
export const withSkin = (g, skin) => { const s = GHOST_SKINS[skin] || GHOST_SKINS.classic; return ghostOf({ ...ghostOf(g), color: s.color, finish: s.holo ? 'holo' : (ghostOf(g).finish === 'holo' ? 'vinyl' : ghostOf(g).finish) }); };
export const skinColor = g => ghostOf(g).color;
/* Level ducha (1–10) z aktivity na webe: rovnaké XP ako v Mojom profile. */
export const XP_RULES = [['checkins', 100], ['finalist', 100], ['rider', 50], ['tricks', 40], ['spots', 30], ['parks', 25], ['photos', 20], ['ratings', 5], ['trick_votes', 5], ['park_votes', 2]];
export const LEVEL_XP = [0, 50, 150, 350, 700, 1200, 1800, 2600, 3600, 5000];
export const xpOf = a => XP_RULES.reduce((s, [k, w]) => s + (a?.[k] || 0) * w, 0);
export const ghostLevel = a => { const xp = xpOf(a); let l = 1; LEVEL_XP.forEach((m, i) => { if (xp >= m) l = i + 1; }); return l; };
/* Je voľba odomknutá? ctx = { level, inventory } */
export const isUnlocked = (o, ctx = {}) => !!o && (o.lvl || 1) <= (ctx.level || 1) && (!o.lock || (ctx.inventory || []).includes(FLAG_ITEMS[o.lock]));
/* Chip na kartu voľby: [trieda, text] */
export const chipOf = (o, lang = 'sk') => o.lock ? (o.lock === 'founder' ? ['r-wave', RARITY.wave.label[lang]] : ['r-event', FLAGS[o.lock]]) : (o.lvl || 1) >= 8 ? ['r-win', 'Lvl ' + o.lvl] : (o.lvl || 1) > 1 ? ['r-lvl', 'Lvl ' + o.lvl] : ['r-free', RARITY.free.label[lang]];
/* Všetky zámky (vecí v inventári), ktoré nastavenie používa. */
export function ghostLocks(g) { g = ghostOf(g); const L = []; for (const [k, cat] of Object.entries(CATS)) { const l = cat[g[k]]?.lock; if (l) L.push(FLAG_ITEMS[l]); } return L; }
/* Vráti ducha len s tým, čo má človek odomknuté (level + inventár). Zamknuté voľby padnú na základ. */
export function unlockedGhost(g, inventory = [], level = 10) {
  g = ghostOf(g); const ctx = { level, inventory };
  for (const [k, cat] of Object.entries(CATS)) if (!isUnlocked(cat[g[k]], ctx)) g[k] = Object.keys(cat)[0];
  if (g.style === 'ps1' && level < STYLES.ps1.lvl) g.style = '3d';
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
  const dx = (ex.dx || 0) * 24, eyes = ex.eyes || 'logo', mouth = ex.mouth || (g.mouth === 'teeth' ? 'grin' : g.mouth === 'o' ? 'O' : 'logo'), EC = EYE_CENTERS, [mx, my] = MOUTH_CENTER;
  c.lineCap = 'round'; c.lineJoin = 'round';
  const eyeShape = i => {
    const [x, y] = EC[i]; c.fillStyle = ink;
    if (g.eyeShape === 'logo') { c.fill(i ? R : L, 'evenodd'); return; }
    c.beginPath();
    if (g.eyeShape === 'round') c.arc(x, y, 40, 0, 7);
    else if (g.eyeShape === 'dots') c.arc(x, y + 6, 22, 0, 7);
    else if (g.eyeShape === 'sleepy') { c.arc(x, y + 8, 40, Math.PI * .05, Math.PI * .95); c.closePath(); }
    else if (g.eyeShape === 'x') { c.strokeStyle = ink; c.lineWidth = 16; c.moveTo(x - 32, y - 32); c.lineTo(x + 32, y + 32); c.moveTo(x + 32, y - 32); c.lineTo(x - 32, y + 32); c.stroke(); return; }
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
  if (mouth === 'logo' && g.mouth === 'smirk') { c.save(); c.translate(mx + mdx, my); c.rotate(-.12); c.scale(1, .55); c.translate(-mx, -my); c.fillStyle = ink; c.fill(M, 'evenodd'); c.restore(); }
  else if (mouth === 'logo') {
    c.save(); c.translate(mdx, 0); c.fillStyle = ink;
    if (g.mouth === 'flat') c.fillRect(mx - 95, my - 4, 190, 16); else c.fill(M, 'evenodd');
    if (g.mouth === 'gap') { c.save(); c.clip(M, 'evenodd'); c.fillStyle = white; c.fillRect(mx - 120, my - 8, 240, 26); c.strokeStyle = ink; c.lineWidth = 5; for (let x = mx - 100; x <= mx + 100; x += 25) { c.beginPath(); c.moveTo(x, my - 10); c.lineTo(x, my + 30); c.stroke(); } c.fillStyle = ink; c.fillRect(mx - 25, my - 12, 25, 34); c.restore(); }
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
  // tvár navyše (2D časť; okuliare sú v 3D samostatné telesá)
  const fe = g.faceExtra;
  if (fe === 'blush') { c.fillStyle = alpha ? '#fff' : 'rgba(240,110,130,.55)'; [[270, 500], [530, 500]].forEach(([x, y]) => { c.beginPath(); c.ellipse(x, y, 34, 18, 0, 0, 7); c.fill(); }); }
  if (fe === 'freckles') { c.fillStyle = alpha ? '#fff' : 'rgba(110,70,50,.75)'; [[250, 495], [272, 512], [292, 498], [262, 528], [548, 495], [526, 512], [506, 498], [536, 528]].forEach(([x, y]) => { c.beginPath(); c.arc(x, y, 5, 0, 7); c.fill(); }); }
  if (fe === 'bandaid') { c.save(); c.translate(545, 505); c.rotate(-.5); c.fillStyle = alpha ? '#fff' : '#e8c9a6'; rrect(c, -46, -16, 92, 32, 10); c.fill(); c.fillStyle = alpha ? '#fff' : '#d9b48f'; c.fillRect(-18, -12, 36, 24); if (!alpha) { c.fillStyle = 'rgba(0,0,0,.18)'; for (let i = -12; i <= 12; i += 8) for (let j = -8; j <= 8; j += 8) { c.beginPath(); c.arc(i, j, 1.8, 0, 7); c.fill(); } } c.restore(); }
  if (fe === 'eyeblack') { c.fillStyle = alpha ? '#fff' : '#1a1416'; [[322, 505], [478, 505]].forEach(([x, y]) => c.fillRect(x - 34, y - 9, 68, 18)); }
  if (fe === 'scar') { c.strokeStyle = alpha ? '#fff' : '#b0616a'; c.lineWidth = 9; c.beginPath(); c.moveTo(538, 372); c.lineTo(560, 428); c.stroke(); c.lineWidth = 5; [384, 398, 412].forEach(y => { c.beginPath(); c.moveTo(538 + (y - 372) * .39 - 13, y); c.lineTo(538 + (y - 372) * .39 + 13, y); c.stroke(); }); }
  if (fe === 'piercing') { c.lineWidth = 11; c.strokeStyle = alpha ? '#fff' : '#2a2628'; c.beginPath(); c.arc(400, 498, 16, Math.PI * .05, Math.PI * .95); c.stroke(); if (!alpha) { c.lineWidth = 5; c.strokeStyle = '#e8e8ec'; c.beginPath(); c.arc(400, 498, 16, Math.PI * .05, Math.PI * .95); c.stroke(); } }
  if (fe === 'mustache') { c.fillStyle = alpha ? '#fff' : '#2a1d16'; c.beginPath(); c.moveTo(400, 520); c.quadraticCurveTo(360, 490, 318, 512); c.quadraticCurveTo(330, 536, 365, 530); c.quadraticCurveTo(385, 526, 400, 534); c.quadraticCurveTo(415, 526, 435, 530); c.quadraticCurveTo(470, 536, 482, 512); c.quadraticCurveTo(440, 490, 400, 520); c.closePath(); c.fill(); }
  if (fe === 'eyepatch') { const col = alpha ? '#fff' : g.faceColor; c.strokeStyle = col; c.lineWidth = 10; c.beginPath(); c.moveTo(258, 400); c.lineTo(440, 372); c.stroke(); c.fillStyle = col; rrect(c, 428, 394, 108, 84, 26); c.fill(); if (!alpha) { c.strokeStyle = 'rgba(255,255,255,.35)'; c.lineWidth = 4; rrect(c, 440, 404, 84, 62, 20); c.stroke(); } }
  if (fe === 'monocle') { c.strokeStyle = alpha ? '#fff' : '#e2b53c'; c.lineWidth = 9; c.beginPath(); c.arc(478, 436, 58, 0, 7); c.stroke(); c.lineWidth = 5; c.beginPath(); c.moveTo(528, 468); c.quadraticCurveTo(548, 520, 520, 560); c.stroke(); if (!alpha) { c.fillStyle = 'rgba(200,230,255,.22)'; c.beginPath(); c.arc(478, 436, 54, 0, 7); c.fill(); c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = 6; c.beginPath(); c.arc(478, 436, 44, Math.PI * 1.1, Math.PI * 1.45); c.stroke(); } }
  if (fe === 'sunglasses' && !alpha && c.canvas && c.canvas.dataset?.flat) { c.fillStyle = g.faceColor; [[322, 436], [478, 436]].forEach(([x, y]) => { rrect(c, x - 62, y - 30, 124, 60, 14); c.fill(); }); c.fillRect(380, 430, 40, 10); }
}
/* Obrys ducha z loga (telo), SVG súradnice ako tvár. */
export const BODY_PATH = 'M241.706 292.369C282.408 253.295 333.788 231.337 391.06 228.54C394.36 228.379 397.51 228.169 398.06 228.073C401.199 227.526 429.782 230.176 439.541 231.918C486.493 240.303 527.651 261.953 562.06 296.367C592.575 326.886 613.107 363.164 623.467 404.869C630.198 431.964 629.848 423.954 630.263 560.224C630.683 697.885 631.068 689.273 623.98 700.981C615.144 715.577 599.994 723.611 583.151 722.633C568.12 721.76 560.147 717.395 544.58 701.518C539.917 696.761 535.781 692.869 535.389 692.869C534.614 692.869 530.82 697.709 518.927 713.869C500.607 738.761 487.946 747.559 468.919 748.62C461.452 749.037 458.522 748.745 452.919 747.029C439.891 743.037 428.154 733.316 413.52 714.398C403.975 702.058 401.318 699.494 398.88 700.267C397.863 700.59 392.356 706.729 386.642 713.91C373.116 730.908 364.569 738.777 353.875 744.076C346.563 747.699 344.431 748.287 337.234 748.665C321.743 749.478 310.62 745.328 298.694 734.287C291.652 727.767 280.791 714.74 274.585 705.369C272.764 702.619 269.686 698.696 267.745 696.651L264.216 692.933L253.016 703.783C238.927 717.431 231.103 721.747 218.945 722.579C204.003 723.6 191.899 719.098 182.174 708.903C174.043 700.379 170.294 691.907 169.547 680.369C168.399 662.655 169.227 446.959 170.483 436.369C173.781 408.561 181.199 383.422 193.497 358.369C206.287 332.315 220.819 312.419 241.706 292.369Z';

/* Spoločný profil skejtera pre GOSko web aj Ghoskate:
   jeden účet, jeden duch, jedna doska (loadout) a jeden inventár (loot).
   Databáza: tabuľky profiles a inventory (supabase-ghoskate.sql). */

/* Vzhľad ducha: katalóg, normalizácia (ghostOf) a staré skiny sú v ghost.js. Tu sa len preposielajú. */
import { GHOST_SKINS, DEFAULT_GHOST, ghostOf, skinColor, withSkin, EYE_COLORS, ghostLocks, unlockedGhost } from './ghost.js';
export { GHOST_SKINS, DEFAULT_GHOST, ghostOf, skinColor, withSkin, ghostLocks, unlockedGhost };

/* Katalóg lootu. Kľúč = item v tabuľke inventory. */
export const ITEMS = {
  'skin:founder': { kind: 'skin', name: { sk: 'Founder duch', cs: 'Founder duch', en: 'Founder ghost' },
    about: { sk: 'Holo skin pre tých, čo prišli pred spustením.', cs: 'Holo skin pro ty, co přišli před spuštěním.', en: 'A holo skin for everyone who joined before launch.' } },
  'sticker:founder-2026': { kind: 'sticker', sticker: { kind: 'loot', title: 'FOUNDER', sub: '2026' }, name: { sk: 'Nálepka Founder 2026', cs: 'Samolepka Founder 2026', en: 'Founder 2026 sticker' },
    about: { sk: 'Sedí na tvojej doske na GOSko webe aj v appke.', cs: 'Sedí na tvé desce na GOSko webu i v appce.', en: 'Sits on your board on the GOSko site and in the app.' } },
  'badge:founder': { kind: 'badge', name: { sk: 'Odznak Founder', cs: 'Odznak Founder', en: 'Founder badge' },
    about: { sk: 'Znamená, že si bol pri tom pred spustením.', cs: 'Znamená, že jsi byl u toho před spuštěním.', en: 'Means you were here before launch.' } },
  'head:horns': { kind: 'item', name: { sk: 'Rohy pre ducha', cs: 'Rohy pro ducha', en: 'Ghost horns' }, about: { sk: 'Malý čertík. Len pre prvú vlnu.', cs: 'Malý čertík. Jen pro první vlnu.', en: 'A little devil. First wave only.' } },
  'extra:halo': { kind: 'item', name: { sk: 'Svätožiara', cs: 'Svatozář', en: 'Halo' }, about: { sk: 'Vznáša sa duchovi nad hlavou. Len pre prvú vlnu.', cs: 'Vznáší se duchovi nad hlavou. Jen pro první vlnu.', en: 'Floats above your ghost. First wave only.' } },
  'mark:number': { kind: 'item', name: { sk: 'Číslo ducha', cs: 'Číslo ducha', en: 'Ghost number' }, about: { sk: 'Tvoje číslo ako znak na tele. Len pre prvú vlnu.', cs: 'Tvé číslo jako znak na těle. Jen pro první vlnu.', en: 'Your number as a body mark. First wave only.' } },
  'buddy:mini': { kind: 'item', name: { sk: 'Mini duch', cs: 'Mini duch', en: 'Mini ghost' }, about: { sk: 'Malý kamoš v tvojej farbe. Len pre prvú vlnu.', cs: 'Malý kamarád ve tvé barvě. Jen pro první vlnu.', en: 'A tiny buddy in your colour. First wave only.' } },
  'pattern:split': { kind: 'item', name: { sk: 'Dvojfarebný duch', cs: 'Dvoubarevný duch', en: 'Two-tone ghost' }, about: { sk: 'Hlava v druhej farbe. Za účasť na GOSku.', cs: 'Hlava v druhé barvě. Za účast na GOSku.', en: 'Head in a second colour. For riding a GOSko.' } },
  'finish:chrome': { kind: 'item', name: { sk: 'Chrómový duch', cs: 'Chromový duch', en: 'Chrome ghost' }, about: { sk: 'Zrkadlový povrch. Za 3 odjazdené GOSká.', cs: 'Zrcadlový povrch. Za 3 odjeté GOSka.', en: 'Mirror finish. For riding 3 GOSkos.' } },
  'finish:glow': { kind: 'item', name: { sk: 'Glow duch', cs: 'Glow duch', en: 'Glow ghost' }, about: { sk: 'Svieti v tme. Len pre víťazov.', cs: 'Svítí ve tmě. Jen pro vítěze.', en: 'Glows in the dark. Winners only.' } },
  'eyes:neon': { kind: 'item', name: { sk: 'Neónové oči', cs: 'Neonové oči', en: 'Neon eyes' }, about: { sk: 'Z afterparty GOSka.', cs: 'Z afterparty GOSka.', en: 'From the GOSko afterparty.' } },
  'eyes:gold': { kind: 'item', name: { sk: 'Zlaté oči', cs: 'Zlaté oči', en: 'Gold eyes' }, about: { sk: 'Len pre víťazov.', cs: 'Jen pro vítěze.', en: 'Winners only.' } },
  'face:slits': { kind: 'item', name: { sk: 'Oči štrbiny', cs: 'Oči štěrbiny', en: 'Slit eyes' }, about: { sk: 'Za check-in na GOSku.', cs: 'Za check-in na GOSku.', en: 'For checking in at a GOSko.' } },
  'face:fangs': { kind: 'item', name: { sk: 'Tesáky', cs: 'Tesáky', en: 'Fangs' }, about: { sk: 'Z afterparty GOSka.', cs: 'Z afterparty GOSka.', en: 'From the GOSko afterparty.' } },
  'head:bandana': { kind: 'item', name: { sk: 'Šatka', cs: 'Šátek', en: 'Bandana' }, about: { sk: 'Z GOSko 3 Bratislava.', cs: 'Z GOSko 3 Bratislava.', en: 'From GOSko 3 Bratislava.' } },
  'head:crown': { kind: 'item', name: { sk: 'Koruna', cs: 'Koruna', en: 'Crown' }, about: { sk: 'Pre víťaza GOSka.', cs: 'Pro vítěze GOSka.', en: 'For a GOSko winner.' } },
  'extra:chain': { kind: 'item', name: { sk: 'Retiazka', cs: 'Řetízek', en: 'Chain' }, about: { sk: 'Zlatá s doskou. Za check-in na evente.', cs: 'Zlatý s deskou. Za check-in na eventu.', en: 'Gold with a board. For an event check-in.' } },
  'mark:star': { kind: 'item', name: { sk: 'Hviezda na tele', cs: 'Hvězda na těle', en: 'Star mark' }, about: { sk: 'Za Best Trick na GOSku.', cs: 'Za Best Trick na GOSku.', en: 'For Best Trick at a GOSko.' } },
  'buddy:rat': { kind: 'item', name: { sk: 'Potkan', cs: 'Potkan', en: 'Rat' }, about: { sk: 'Behá okolo dosky. Za nočný check-in.', cs: 'Běhá kolem desky. Za noční check-in.', en: 'Runs around your board. For a night check-in.' } },
  'scene:winter': { kind: 'item', name: { sk: 'Scéna GOSko Winter', cs: 'Scéna GOSko Winter', en: 'GOSko Winter scene' }, about: { sk: 'Sneží okolo ducha. Za GOSko Winter.', cs: 'Sněží kolem ducha. Za GOSko Winter.', en: 'Snow around your ghost. For GOSko Winter.' } },
  'fx:flames': { kind: 'item', name: { sk: 'Horiaca doska', cs: 'Hořící deska', en: 'Flaming board' }, about: { sk: 'Len pre víťazov.', cs: 'Jen pro vítěze.', en: 'Winners only.' } },
  'sticker:spot-hunter': { kind: 'sticker', sticker: { kind: 'loot', title: 'SPOT HUNTER', sub: 'GHOSKATE' }, name: { sk: 'Nálepka Spot hunter', cs: 'Samolepka Spot hunter', en: 'Spot hunter sticker' },
    about: { sk: 'Za prvý spot, ktorý schválime.', cs: 'Za první spot, který schválíme.', en: 'For your first approved spot.' } },
};
/* Nálepky z inventára, ktoré idú na dosku (formát pre board.js). */
export const lootStickers = inv => (inv || []).map(i => ITEMS[i]?.sticker).filter(Boolean);

/* Doska: rovnaké kľúče ako board.js (DECKS, GRIPS, WHEELS, TRUCKS). */
export const DEFAULT_LOADOUT = { deck: 'cream', grip: 'black', wheels: 'cream', trucks: 'silver' };

/* Duch ako SVG (rovnaký tvar ako img/ghost.svg), telo vo farbe skinu. */
const BODY = 'M241.706 292.369C282.408 253.295 333.788 231.337 391.06 228.54C394.36 228.379 397.51 228.169 398.06 228.073C401.199 227.526 429.782 230.176 439.541 231.918C486.493 240.303 527.651 261.953 562.06 296.367C592.575 326.886 613.107 363.164 623.467 404.869C630.198 431.964 629.848 423.954 630.263 560.224C630.683 697.885 631.068 689.273 623.98 700.981C615.144 715.577 599.994 723.611 583.151 722.633C568.12 721.76 560.147 717.395 544.58 701.518C539.917 696.761 535.781 692.869 535.389 692.869C534.614 692.869 530.82 697.709 518.927 713.869C500.607 738.761 487.946 747.559 468.919 748.62C461.452 749.037 458.522 748.745 452.919 747.029C439.891 743.037 428.154 733.316 413.52 714.398C403.975 702.058 401.318 699.494 398.88 700.267C397.863 700.59 392.356 706.729 386.642 713.91C373.116 730.908 364.569 738.777 353.875 744.076C346.563 747.699 344.431 748.287 337.234 748.665C321.743 749.478 310.62 745.328 298.694 734.287C291.652 727.767 280.791 714.74 274.585 705.369C272.764 702.619 269.686 698.696 267.745 696.651L264.216 692.933L253.016 703.783C238.927 717.431 231.103 721.747 218.945 722.579C204.003 723.6 191.899 719.098 182.174 708.903C174.043 700.379 170.294 691.907 169.547 680.369C168.399 662.655 169.227 446.959 170.483 436.369C173.781 408.561 181.199 383.422 193.497 358.369C206.287 332.315 220.819 312.419 241.706 292.369Z';
let darkPath = null;
async function loadDark() {
  if (darkPath) return darkPath;
  const t = await fetch('img/ghost.svg').then(r => r.text());
  const m = t.match(/<path[^>]*fill="#0e0d0c"[^>]*d="([^"]+)"/) || t.match(/<path[^>]*d="([^"]+)"[^>]*fill="#0e0d0c"/);
  darkPath = m ? m[1] : '';
  return darkPath;
}
let uid = 0;
export async function ghostSvg(g, { title = '' } = {}) {
  const gh = ghostOf(g), holo = gh.finish === 'holo', d = await loadDark(), id = 'gh' + (++uid);
  const fill = holo ? `url(#${id})` : gh.color, ink = EYE_COLORS[gh.eyes]?.glow ? EYE_COLORS[gh.eyes].color : '#0e0d0c';
  const defs = holo ? `<defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#9ff3ff"/><stop offset=".45" stop-color="#ffc6f1"/><stop offset=".75" stop-color="#fff2a8"/><stop offset="1" stop-color="#b9ffcf"/></linearGradient></defs>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="160 220 480 540" role="img" aria-label="${title.replace(/"/g, '&quot;')}">${defs}<path fill="${fill}" d="${BODY}"/><path fill="${ink}" fill-rule="evenodd" d="${d}"/></svg>`;
}

/* Lokálna kópia profilu, aby duch a doska sedeli aj pred načítaním z databázy. */
const LS_PROFILE = 'gosko:profile-cache', LS_INV = 'gosko:inventory';
const read = (k, f) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : f; } catch { return f; } };
const write = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch { /* bez úložiska to ide aj tak */ } };
export const cachedProfile = () => read(LS_PROFILE, null);
export const cachedInventory = () => read(LS_INV, []);
export function cacheProfile(p, inv) {
  write(LS_PROFILE, p ? { nickname: p.nickname, ghost: p.ghost, loadout: p.loadout } : null);
  if (inv !== undefined) write(LS_INV, inv);
  if (p?.loadout) {
    const keepPhoto = read('gosko:board-look', {}).deck === 'photo';   // fotka na doske ostáva len v tomto zariadení
    const look = { ...DEFAULT_LOADOUT, ...p.loadout, ...(keepPhoto ? { deck: 'photo' } : {}) };
    write('gosko:board-look', look); write('gosko:deck', look.deck);
  }
  if (p?.ghost) write('gosko:ghost', ghostOf(p.ghost));
}
export const localGhost = () => ghostOf(read('gosko:ghost', DEFAULT_GHOST));
/* Duch uložený len v tomto prehliadači (keď človek ešte nemá profil alebo kým sa uloží). */
export const cacheGhost = g => write('gosko:ghost', ghostOf(g));
export const localLoadout = () => ({ ...DEFAULT_LOADOUT, deck: read('gosko:deck', 'cream'), ...read('gosko:board-look', {}) });

/* Vzhľad dosky: diely, palety a názvy. Bez three.js, aby ich mohol použiť aj ľahký web (Ghoskate).
   look = { deck, grip, wheels, trucks } – kľúče z tabuliek alebo vlastná farba #rrggbb (doska aj 'photo') */
export const DECKS = {
  cream: { name: 'Krémová', base: '#F3EBDD', stripe: '#A01D21', ink: '#F3EBDD' },
  black: { name: 'Čierna', base: '#151312', stripe: '#F3EBDD', ink: '#151312' },
  red: { name: 'Červená', base: '#A01414', stripe: '#0e0d0c', ink: '#F3EBDD' },
  ghosts: { name: 'Duchovia', base: '#151312', stripe: '#A01414', ink: '#F3EBDD', pattern: 'ghosts' },
  poster: { name: 'Plagát', base: '#F3EBDD', stripe: '#0e0d0c', ink: '#F3EBDD', pattern: 'word' },
};
export const GRIPS = {
  black: { name: 'Čierny', base: 27 },
  ghost: { name: 'S duchom', base: 27, ghost: true },
  red: { name: 'Červený', base: 0, tint: [140, 20, 20] },
};
export const WHEELS = {
  cream: { name: 'Krémové', color: 0xf3ebdd, core: 0xa01d21 },
  red: { name: 'Červené', color: 0xa01414, core: 0xf3ebdd },
  black: { name: 'Čierne', color: 0x1b1918, core: 0xa01d21 },
};
export const TRUCKS = {
  silver: { name: 'Strieborné', color: 0xc9ccd0, metal: .55 },
  black: { name: 'Čierne', color: 0x26231f, metal: .35 },
  red: { name: 'Červené', color: 0xa01d21, metal: .2 },
};
export const DEFAULT_LOOK = { deck: 'cream', grip: 'black', wheels: 'cream', trucks: 'silver' };

/* Farebné palety (okrem vzorov hore sa dá vybrať aj ľubovoľná vlastná farba ako #rrggbb). */
export const DECK_COLORS = [
  { name: 'Biela', hex: '#F5F2EA' }, { name: 'Uhľová', hex: '#1C1B1A' }, { name: 'Betónová', hex: '#7A7772' }, { name: 'Červená', hex: '#E5322D' },
  { name: 'Oranžová', hex: '#FF7A1A' }, { name: 'Žltá', hex: '#FFC61A' }, { name: 'Piesková', hex: '#E8D6A8' }, { name: 'Okrová', hex: '#C49A4A' },
  { name: 'Trávová', hex: '#6DBE45' }, { name: 'Lesná', hex: '#1E6B45' }, { name: 'Olivová', hex: '#5A6B2F' }, { name: 'Tyrkysová', hex: '#2FB3A6' },
  { name: 'Ľadová', hex: '#CFE3F1' }, { name: 'Modrá', hex: '#2D6CC0' }, { name: 'Námornícka', hex: '#18264F' }, { name: 'Fialová', hex: '#6B3FB8' },
  { name: 'Levanduľová', hex: '#C9B8EC' }, { name: 'Ružová', hex: '#EE6FAE' }, { name: 'Bledoružová', hex: '#F6C3D2' }, { name: 'Hnedá', hex: '#7A4A26' },
];
export const GRIP_COLORS = [   // pastelové
  { name: 'Ružová', hex: '#F4C2D7' }, { name: 'Cukrová vata', hex: '#F9D3EC' }, { name: 'Broskyňová', hex: '#FAD3B8' }, { name: 'Marhuľová', hex: '#F8C49B' },
  { name: 'Koralová', hex: '#F6B6AA' }, { name: 'Citrónová', hex: '#F6EFA4' }, { name: 'Vanilková', hex: '#F5E7C2' }, { name: 'Piesková', hex: '#E8D8BD' },
  { name: 'Pistáciová', hex: '#D2E8AE' }, { name: 'Mätová', hex: '#BDEBD5' }, { name: 'Šalviová', hex: '#C6D7BE' }, { name: 'Tyrkysová', hex: '#B3E4E2' },
  { name: 'Ľadová', hex: '#D9F0F6' }, { name: 'Nebeská', hex: '#BCDCF5' }, { name: 'Periwinkle', hex: '#C3C8F2' }, { name: 'Levanduľová', hex: '#D5CBF2' },
  { name: 'Lila', hex: '#E2C7EE' }, { name: 'Fialková', hex: '#C8B6E7' }, { name: 'Holubia', hex: '#C9CED6' }, { name: 'Perlová', hex: '#EFECE7' },
];
export const WHEEL_COLORS = [  // kričiace, svietia
  { name: 'Neónová zelená', hex: '#39FF14' }, { name: 'Limetková', hex: '#C6FF00' }, { name: 'Kyselinová', hex: '#E4FF1A' }, { name: 'Neónová žltá', hex: '#FFF200' },
  { name: 'Mango', hex: '#FFB300' }, { name: 'Neónová oranžová', hex: '#FF6A00' }, { name: 'Lávová', hex: '#FF3D00' }, { name: 'Neónová červená', hex: '#FF1744' },
  { name: 'Hot pink', hex: '#FF1F7A' }, { name: 'Malinová', hex: '#FF0090' }, { name: 'Neónová ružová', hex: '#FF2BD6' }, { name: 'Neónová fialová', hex: '#B026FF' },
  { name: 'Ultrafialová', hex: '#7A00FF' }, { name: 'Kobaltová', hex: '#2D5BFF' }, { name: 'Elektrická modrá', hex: '#00A8FF' }, { name: 'Azúrová', hex: '#00F0FF' },
  { name: 'Ľadová modrá', hex: '#7DF9FF' }, { name: 'Laserová tyrkys', hex: '#00FFC3' }, { name: 'Korálová neón', hex: '#FF5E5B' }, { name: 'Žiarivá biela', hex: '#FFFFFF' },
].map(w => ({ ...w, glow: .55 }));
export const TRUCK_COLORS = [  // kovové
  { name: 'Chróm', hex: '#E9ECEF', metal: 1, rough: .12 }, { name: 'Leštené striebro', hex: '#C9CCD0', metal: .95, rough: .22 }, { name: 'Platina', hex: '#D8D6CC', metal: .95, rough: .18 },
  { name: 'Titán', hex: '#8E9196', metal: .9, rough: .3 }, { name: 'Gunmetal', hex: '#4A4E55', metal: .9, rough: .3 }, { name: 'Grafit', hex: '#34363A', metal: .85, rough: .35 },
  { name: 'Čierny chróm', hex: '#1E1F23', metal: 1, rough: .16 }, { name: 'Zlatá', hex: '#E2B53C', metal: 1, rough: .18 }, { name: 'Matné zlato', hex: '#B8973E', metal: .95, rough: .42 },
  { name: 'Šampanské', hex: '#E6D3A3', metal: .95, rough: .2 }, { name: 'Ružové zlato', hex: '#E0A28C', metal: 1, rough: .2 }, { name: 'Meď', hex: '#C47A45', metal: 1, rough: .25 },
  { name: 'Bronz', hex: '#A97142', metal: .95, rough: .32 }, { name: 'Červený elox', hex: '#D02B2B', metal: .9, rough: .25 }, { name: 'Ružový elox', hex: '#E0409A', metal: .9, rough: .25 },
  { name: 'Fialový elox', hex: '#7B3FD1', metal: .9, rough: .25 }, { name: 'Modrý elox', hex: '#2F6FD6', metal: .9, rough: .25 }, { name: 'Petrolej', hex: '#2E6E7E', metal: .9, rough: .28 },
  { name: 'Zelený elox', hex: '#2FAE6B', metal: .9, rough: .25 }, { name: 'Oceľová modrá', hex: '#5B7A99', metal: .9, rough: .3 },
];
export const isHex = v => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
export const hexNum = v => parseInt(v.slice(1), 16);
export const hexRgb = v => [hexNum(v) >> 16 & 255, hexNum(v) >> 8 & 255, hexNum(v) & 255];
export const luma = v => { const [r, g, b] = hexRgb(v); return (.299 * r + .587 * g + .114 * b) / 255; };
export const findHex = (list, v) => list.find(c => c.hex.toLowerCase() === String(v).toLowerCase());
/* názov časti vzhľadu pre popis (vzor, farba z palety alebo vlastná) */
export function lookName(part, v) {
  const T = { deck: [DECKS, DECK_COLORS], grip: [GRIPS, GRIP_COLORS], wheels: [WHEELS, WHEEL_COLORS], trucks: [TRUCKS, TRUCK_COLORS] }[part];
  if (part === 'deck' && v === 'photo') return 'Tvoja fotka';
  return T?.[0][v]?.name || findHex(T?.[1] || [], v)?.name || (isHex(v) ? 'Vlastná farba ' + v.toUpperCase() : '');
}

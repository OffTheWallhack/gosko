/* Úprava ducha (Môj profil): nálada, farba, tvár, povrch, stav, veci, scéna.
   Zamknuté voľby ukazuje so zámkom; vybrať ich môže len ten, kto má vec v inventári. Bez three.js. */
import { RARITY, BODY_COLORS, ITEM_COLORS, PATTERNS, FINISHES, EYE_COLORS, EYE_SHAPES, MOUTHS, HEADS, EXTRAS, MARKS, BUDDIES, SCENES, EFFECTS, WEAR_PRESETS, EMOTES, ghostOf, DEFAULT_GHOST } from './ghost.js';

function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) { if (v == null || v === false) continue; if (k === 'class') el.className = v; else if (k.startsWith('on')) el.addEventListener(k.slice(2), v); else el.setAttribute(k, v === true ? '' : v); }
  for (const k of kids.flat(Infinity)) if (k != null && k !== false) el.append(k instanceof Node ? k : String(k));
  return el;
}
const TABS = [['nalada', 'Nálada'], ['farba', 'Farba'], ['tvar', 'Tvár'], ['povrch', 'Povrch'], ['stav', 'Stav'], ['veci', 'Veci'], ['scena', 'Scéna']];

/* root: kam sa editor vykreslí. ghost: nastavenie. inventory: zoznam vecí. onChange(ghost, { full }) sa volá pri každej zmene; onEmote(k); onAuto(bool). */
export function mountGhostEditor(root, { ghost, inventory = [], onChange, onEmote, onAuto, autoOn = true } = {}) {
  let G = ghostOf(ghost), tab = 'nalada';
  const has = lock => !lock || inventory.includes(lock);
  const emit = (full = true) => onChange?.(ghostOf(G), { full });
  const chip = r => h('span', { class: 'ge-chip ' + RARITY[r].cls }, RARITY[r].label.sk);
  const named = arr => arr.map((hex, i) => ['Farba ' + (i + 1), hex]);
  const tabsEl = h('div', { class: 'ge-tabs', role: 'tablist' }), pane = h('div', { class: 'ge-pane', role: 'tabpanel' });
  root.replaceChildren(h('div', { class: 'ge' }, tabsEl, pane));

  function swatches(list, cur, onPick, custom = true) {
    const w = h('div', { class: 'ge-sws' });
    for (const [n, hex] of list) w.append(h('button', { type: 'button', class: 'ge-sw', title: n, 'aria-label': n, style: `background:${hex}`, 'aria-pressed': String(hex.toLowerCase() === String(cur).toLowerCase()), onclick: () => onPick(hex) }));
    if (custom) {
      const isCustom = !list.some(c => c[1].toLowerCase() === String(cur).toLowerCase());
      const inp = h('input', { type: 'color', value: cur, 'aria-label': 'Vlastná farba' }); inp.addEventListener('input', () => onPick(inp.value, true));
      w.append(h('label', { class: 'ge-sw custom', title: 'Vlastná farba', 'aria-pressed': String(isCustom) }, inp));
    }
    return w;
  }
  function options(cat, cur, onPick) {
    const w = h('div', { class: 'ge-opts' });
    for (const [k, o] of Object.entries(cat)) {
      const locked = !has(o.lock);
      w.append(h('button', { type: 'button', class: 'ge-opt' + (locked ? ' locked' : ''), 'aria-pressed': String(k === cur), 'aria-disabled': locked ? 'true' : null,
        onclick: () => { if (locked) { note.textContent = o.name + ': ' + (o.src || 'Zamknuté.') + ' Odomkne sa vecou v inventári.'; return; } note.textContent = ''; onPick(k); } },
        chip(o.r), h('b', {}, o.name), h('small', {}, o.src || o.about), locked ? h('span', { class: 'ge-lock', 'aria-hidden': 'true' }) : null));
    }
    return w;
  }
  const sec = (title, ...kids) => h('div', { class: 'ge-sec' }, h('h3', {}, title), ...kids);
  const note = h('p', { class: 'ge-note', role: 'status', 'aria-live': 'polite' });
  function slider(id, label, val, on) {
    const out = h('output', {}, String(val));
    const inp = h('input', { id, type: 'range', min: 0, max: 100, value: val });
    inp.addEventListener('input', () => { out.textContent = inp.value; on(+inp.value); });
    return h('label', { class: 'ge-sl', for: id }, h('span', {}, label), inp, out);
  }
  const set = (patch, full = true) => { Object.assign(G, patch); G = ghostOf(G); emit(full); render(); };
  const live = (key, hex, isLive) => { G[key] = hex; isLive ? emit(false) : set({}); };

  function render() {
    const keep = pane.scrollTop;
    tabsEl.replaceChildren(...TABS.map(([k, n]) => h('button', { type: 'button', class: 'ge-tab', role: 'tab', 'aria-selected': String(k === tab), onclick: () => { tab = k; render(); pane.scrollTop = 0; } }, n)));
    const p = [];
    if (tab === 'nalada') {
      const cb = h('input', { id: 'ge-auto', type: 'checkbox', checked: autoOn || null });
      cb.addEventListener('change', () => { autoOn = cb.checked; onAuto?.(autoOn); });
      p.push(sec('Sám od seba', h('label', { class: 'ge-tgl', for: 'ge-auto' }, cb, ' Duch robí grimasy sám od seba'), h('p', { class: 'ge-note' }, 'Chvíľu len tak visí, potom sa rozhliadne, zamračí, potiahne nosom alebo zazíva. Ťuk na ducha ho zľakne.')));
      p.push(sec('Vyskúšaj', h('div', { class: 'ge-opts' }, Object.entries(EMOTES).map(([k, o]) => h('button', { type: 'button', class: 'ge-opt', onclick: () => onEmote?.(k) }, h('b', {}, o.name), h('small', {}, o.about))))));
    }
    if (tab === 'farba') {
      p.push(sec('Telo', swatches(BODY_COLORS, G.color, (hex, l) => live('color', hex, l))));
      p.push(sec('Vzor', options(PATTERNS, G.pattern, k => set({ pattern: k }))));
      if (G.pattern !== 'none') p.push(sec('Druhá farba', swatches(BODY_COLORS, G.color2, (hex, l) => live('color2', hex, l))));
    }
    if (tab === 'tvar') {
      p.push(sec('Tvar očí', options(EYE_SHAPES, G.eyeShape, k => set({ eyeShape: k }))));
      p.push(sec('Farba očí', options(EYE_COLORS, G.eyes, k => set({ eyes: k }))));
      p.push(sec('Ústa', options(MOUTHS, G.mouth, k => set({ mouth: k }))));
    }
    if (tab === 'povrch') {
      p.push(sec('Povrch', options(FINISHES, G.finish, k => set({ finish: k }))));
      const cb = h('input', { id: 'ge-ol', type: 'checkbox', checked: G.outline || null }); cb.addEventListener('change', () => set({ outline: cb.checked }));
      p.push(sec('Obrys', h('label', { class: 'ge-tgl', for: 'ge-ol' }, cb, ' Čierny obrys ako v logu')));
    }
    if (tab === 'stav') {
      const cur = Object.entries(WEAR_PRESETS).find(([, w]) => w.dirt === G.dirt && w.scuff === G.scuff && w.stickers === G.stickers)?.[0];
      p.push(sec('Ako vyzerá', h('div', { class: 'ge-opts' }, Object.entries(WEAR_PRESETS).map(([k, o]) => h('button', { type: 'button', class: 'ge-opt', 'aria-pressed': String(k === cur), onclick: () => set({ dirt: o.dirt, scuff: o.scuff, stickers: o.stickers }, false) }, chip('free'), h('b', {}, o.name), h('small', {}, o.about))))));
      const st = h('input', { id: 'ge-st', type: 'checkbox', checked: G.stickers || null }); st.addEventListener('change', () => set({ stickers: st.checked }, false));
      p.push(sec('Doladiť', h('div', { class: 'ge-fine' },
        slider('ge-sd', 'Špina', G.dirt, v => { G.dirt = v; emit(false); }), slider('ge-sw', 'Ošúchanie', G.scuff, v => { G.scuff = v; emit(false); }),
        h('label', { class: 'ge-tgl', for: 'ge-st' }, st, ' Nálepky z odjazdených GOSkov'),
        h('div', { class: 'ge-row' }, h('button', { type: 'button', class: 'btn small', onclick: () => set({ seed: Math.floor(Math.random() * 9999) }, false) }, 'Nové fľaky a škrabance'), h('span', { class: 'ge-note' }, `Duch č. ${String(G.seed).padStart(4, '0')}. Každý účet má svoje číslo, takže fľaky sú vždy iné.`)))));
    }
    if (tab === 'veci') {
      p.push(sec('Hlava', options(HEADS, G.head, k => set({ head: k }))));
      if (HEADS[G.head].color) p.push(sec('Farba: ' + HEADS[G.head].name.toLowerCase(), swatches(named(ITEM_COLORS), G.headColor, (hex, l) => live('headColor', hex, l))));
      p.push(sec('Doplnok', options(EXTRAS, G.extra, k => set({ extra: k }))));
      if (EXTRAS[G.extra].color) p.push(sec('Farba: ' + EXTRAS[G.extra].name.toLowerCase(), swatches(named(ITEM_COLORS), G.extraColor, (hex, l) => live('extraColor', hex, l))));
      p.push(sec('Znak na tele', options(MARKS, G.mark, k => set({ mark: k }))));
      if (G.mark !== 'none') p.push(sec('Farba znaku', swatches(named(ITEM_COLORS), G.markColor, (hex, l) => live('markColor', hex, l))));
      p.push(sec('Kamoš', options(BUDDIES, G.buddy, k => set({ buddy: k }))));
      p.push(sec('Odkiaľ sa veci berú', h('div', { class: 'ge-legend' },
        h('div', {}, chip('free'), h('span', {}, 'Má každý od registrácie.')), h('div', {}, chip('event'), h('span', {}, 'Za účasť alebo check-in na GOSku. Neskôr sa nedajú kúpiť.')),
        h('div', {}, chip('wave'), h('span', {}, 'Len prvá vlna pred spustením. Potom už nikdy, maximálne výmenou.')), h('div', {}, chip('win'), h('span', {}, 'Len víťazi a top 3.')))));
    }
    if (tab === 'scena') {
      p.push(sec('Kde jazdí', options(SCENES, G.scene, k => set({ scene: k }))));
      p.push(sec('Efekt', options(EFFECTS, G.effect, k => set({ effect: k }))));
      p.push(sec('Reset', h('button', { type: 'button', class: 'btn small', onclick: () => { G = ghostOf(DEFAULT_GHOST); emit(); render(); } }, 'Späť na klasika')));
    }
    pane.replaceChildren(...p, note);
    pane.scrollTop = keep;
  }
  render();
  return { get: () => ghostOf(G), set: g => { G = ghostOf(g); render(); }, setInventory: inv => { inventory = inv; render(); } };
}

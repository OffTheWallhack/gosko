/* Triky a vyhľadávanie: časti rozhrania. Logika je v tricks.js a search.js, obsah v data.js.
   Pomocníkov (h, pageHead, …) dostane od app.js, nech sa nič nekopíruje. */
import { TRICKS, TRICK_LEVELS, TRICKS_PAGE } from '../data.js';
import { trickOfDay, filterTricks, pickTrick, newGos, gosMiss, gosLand, gosWinner, gosLetters, gosOut, GOS_WORD } from './tricks.js';
import { search, KINDS } from './search.js';

const levelLabel = id => TRICK_LEVELS.find(l => l.id === id)?.label || '';
const firstSentence = s => (String(s).match(/^.*?[.!?](\s|$)/) || [s])[0].trim();

function trickCard(h, t, { big = false } = {}) {
  return h('article', { class: 'tk-card' + (big ? ' big' : '') },
    h('span', { class: 'tk-lvl ' + t.level }, levelLabel(t.level)),
    h(big ? 'h3' : 'h4', { class: 'wide tk-name' }, t.name),
    h('p', { class: 'tk-how' }, t.how),
    t.tip ? h('p', { class: 'tk-tip' }, h('b', {}, 'Rada: '), t.tip) : null);
}

/* ---------- karta „Trik dňa“ na úvodke ---------- */
export function trickTeaser({ h, icon }) {
  if (!TRICKS_PAGE.enabled || !TRICKS.length) return null;
  const t = trickOfDay(TRICKS);
  return h('a', { class: 'fb-card trick-day', href: '#/triky' },
    h('span', { class: 'mono hs-k' }, 'Trik dňa'),
    h('h3', {}, t.name),
    h('p', {}, firstSentence(t.how)),
    h('span', { class: 'btn small' }, 'Hádž trik a slovník', icon('arrow')));
}

/* ---------- stránka #/triky ---------- */
export function pageTricks(root, { h, pageHead, put, icon }) {
  root.append(pageHead(TRICKS_PAGE.title, TRICKS_PAGE.lead));
  const body = h('div', { class: 'wrap page-body tk' });
  root.append(body);
  if (!TRICKS.length) { put(body, h('p', { class: 'note' }, 'Zoznam trikov dopĺňame.')); return; }

  /* trik dňa */
  put(body, h('section', { class: 'tk-sec' }, h('h2', { class: 'wide sub' }, 'Trik dňa'), trickCard(h, trickOfDay(TRICKS), { big: true }),
    h('p', { class: 'note' }, 'Každý deň nový. Skús ho dať ešte dnes.')));

  /* hádž trik a počítadlo písmen */
  let level = '', current = null, game = null;
  const out = h('div', { class: 'tk-out', 'aria-live': 'polite' });
  const board = h('div', { class: 'tk-board' });
  const names = h('input', { type: 'text', class: 'tk-names', value: 'Ty, Kamoš', maxlength: '80', 'aria-label': 'Mená hráčov oddelené čiarkou', autocomplete: 'off' });
  const levels = h('div', { class: 'chips', role: 'group', 'aria-label': 'Obtiažnosť' }, [{ id: '', label: 'Všetko' }, ...TRICK_LEVELS].map(l =>
    h('button', { type: 'button', class: 'chip', 'aria-pressed': String(l.id === level), onclick: e => {
      level = l.id; levels.querySelectorAll('.chip').forEach(c => c.setAttribute('aria-pressed', String(c === e.currentTarget)));
    } }, l.label)));
  const renderBoard = () => {
    board.replaceChildren();
    if (!game) return;
    const win = gosWinner(game);
    put(board, h('ul', { class: 'tk-players' }, game.players.map((p, i) => h('li', { class: (i === game.turn && win === null ? 'on ' : '') + (gosOut(p) ? 'out' : '') },
      h('b', {}, p.name), h('span', { class: 'tk-letters', 'aria-label': `písmená: ${gosLetters(p) || 'žiadne'}` },
        GOS_WORD.split('').map((c, k) => h('i', { class: k < p.letters ? 'x' : '' }, c))),
      i === game.turn && win === null ? h('em', {}, 'na ťahu') : null))));
    if (win !== null) put(board, h('p', { class: 'tk-win' }, `Vyhral ${game.players[win].name}!`),
      h('button', { type: 'button', class: 'btn small', onclick: () => { game = newGos(game.players.map(p => p.name)); current = null; out.replaceChildren(); renderBoard(); } }, 'Nová hra'));
    else put(board, h('div', { class: 'tk-act' },
      h('button', { type: 'button', class: 'btn small', onclick: () => { game = gosLand(game); renderBoard(); } }, `${game.players[game.turn].name} dal ✓`),
      h('button', { type: 'button', class: 'btn small', onclick: () => { game = gosMiss(game); renderBoard(); } }, `${game.players[game.turn].name} nedal ✗`)));
  };
  const throwIt = () => {
    current = pickTrick(TRICKS, { level, exclude: current });
    out.replaceChildren(current ? trickCard(h, current, { big: true }) : h('p', { class: 'note' }, 'V tejto obtiažnosti zatiaľ nemáme triky.'));
  };
  const start = () => {
    const g = newGos(names.value.split(','));
    if (g.players.length < 2) { names.setCustomValidity?.('Napíš aspoň dvoch hráčov'); names.reportValidity?.(); return; }
    names.setCustomValidity?.(''); game = g; renderBoard();
  };
  put(body, h('section', { class: 'tk-sec' }, h('h2', { class: 'wide sub' }, 'Hádž trik'), h('p', { class: 'lead' }, TRICKS_PAGE.gosIntro), levels,
    h('div', { class: 'tk-throw' }, h('button', { type: 'button', class: 'btn primary', onclick: throwIt }, 'Hádž trik', icon('arrow'))), out,
    h('details', { class: 'tk-gos' }, h('summary', {}, 'Počítadlo písmen S.K.A.T.E.'),
      h('label', { class: 'tk-label' }, 'Hráči (oddelení čiarkou, aj viac ako dvaja)', names),
      h('button', { type: 'button', class: 'btn small', onclick: start }, 'Začať hru'), board)));

  /* slovník */
  let q = '', lv = '';
  const list = h('div', { class: 'tk-list' });
  const count = h('p', { class: 'note', 'aria-live': 'polite' });
  const draw = () => {
    const rows = filterTricks(TRICKS, { level: lv, q });
    list.replaceChildren(...rows.map(t => trickCard(h, t)));
    count.textContent = rows.length ? `${rows.length} ${rows.length === 1 ? 'trik' : rows.length < 5 ? 'triky' : 'trikov'}` : 'Nič sme nenašli. Skús iné slovo.';
  };
  const lvChips = h('div', { class: 'chips', role: 'group', 'aria-label': 'Filter podľa obtiažnosti' }, [{ id: '', label: 'Všetko' }, ...TRICK_LEVELS].map(l =>
    h('button', { type: 'button', class: 'chip', 'aria-pressed': String(l.id === lv), onclick: e => {
      lv = l.id; lvChips.querySelectorAll('.chip').forEach(c => c.setAttribute('aria-pressed', String(c === e.currentTarget))); draw();
    } }, l.label)));
  put(body, h('section', { class: 'tk-sec' }, h('h2', { class: 'wide sub' }, 'Slovník trikov'),
    h('input', { type: 'search', class: 'tk-q', placeholder: 'Hľadaj trik, napr. kickflip', 'aria-label': 'Hľadať trik', autocomplete: 'off', oninput: e => { q = e.target.value; draw(); } }),
    lvChips, count, list, h('p', { class: 'note' }, TRICKS_PAGE.safety)));
  draw();
}

/* ---------- vyhľadávanie po celom webe ---------- */
let searchDlg = null;
export function openSearch({ h, index, onGo }) {
  if (searchDlg?.open) { searchDlg.querySelector('input')?.focus(); return; }
  let sel = 0, rows = [];
  const results = h('ul', { class: 'srch-list', role: 'listbox', id: 'srch-list', 'aria-label': 'Výsledky hľadania' });
  const empty = h('p', { class: 'srch-empty' });
  const input = h('input', { type: 'search', class: 'srch-q', placeholder: 'Hľadaj event, jazdca, park, trik…', 'aria-label': 'Hľadať na webe', 'aria-controls': 'srch-list', autocomplete: 'off', enterkeyhint: 'go', spellcheck: 'false' });
  const dlg = h('dialog', { class: 'srch', 'aria-label': 'Hľadanie' },
    h('div', { class: 'srch-head' }, input, h('button', { class: 'x', type: 'button', 'aria-label': 'Zavrieť', onclick: () => dlg.close() }, '✕')), empty, results);
  const mark = () => { [...results.children].forEach((li, i) => { li.setAttribute('aria-selected', String(i === sel)); if (i === sel) li.scrollIntoView?.({ block: 'nearest' }); }); };
  const draw = () => {
    rows = input.value.trim() ? search(index, input.value) : [];
    sel = 0;
    results.replaceChildren(...rows.map(r => h('li', { role: 'option', 'aria-selected': 'false' }, h('a', { href: r.href, onclick: () => dlg.close() },
      h('span', { class: 'srch-kind' }, KINDS[r.kind] || ''), h('b', {}, r.title), r.sub ? h('small', {}, r.sub) : null))));
    empty.textContent = input.value.trim() ? (rows.length ? '' : 'Nič sme nenašli. Skús kratšie slovo.') : 'Začni písať. Nájdeš eventy, jazdcov, crew, parky, triky aj stránky.';
    mark();
  };
  input.addEventListener('input', draw);
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(rows.length - 1, sel + 1); mark(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); mark(); }
    else if (e.key === 'Enter' && rows[sel]) { e.preventDefault(); dlg.close(); onGo(rows[sel].href); }
  });
  dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
  dlg.addEventListener('close', () => { dlg.remove(); searchDlg = null; });
  searchDlg = dlg;
  document.body.append(dlg); dlg.showModal(); draw(); input.focus();
}

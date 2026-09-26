/* Odznaky jazdcov. Počítajú sa len z reálnych výsledkov v data.js, nič sa nevymýšľa dopredu. */
const I = {
  debut: '<path d="M4 15h16M7 15l-2 4M17 15l2 4" /><circle cx="7" cy="19" r="1.6"/><circle cx="17" cy="19" r="1.6"/><path d="M3 12c3-1 15-1 18 0"/>',
  podium: '<path d="M3 20V14h6v6M9 20V9h6v11M15 20v-8h6v8" />',
  champ: '<path d="M4 18h16l-1-10-4 4-3-7-3 7-4-4z"/>',
  junior: '<text x="12" y="16.5" text-anchor="middle" font-size="9" font-weight="900" stroke="none" fill="currentColor" style="font-family:Archivo,system-ui,sans-serif">U16</text>',
  women: '<path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7z"/>',
  trick: '<path d="M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-4-1-6 1-9z"/>',
  loyal: '<path d="M4 12a8 8 0 0 1 14-5l2-2v6h-6l2.3-2.3A5.5 5.5 0 0 0 6.5 12M20 12a8 8 0 0 1-14 5l-2 2v-6h6l-2.3 2.3A5.5 5.5 0 0 0 17.5 12"/>',
};

export const BADGES = [
  { id: 'debut', name: 'Debut', text: 'Prvé GOSko má za sebou', icon: I.debut,
    test: r => r.events.length > 0, detail: r => [...r.events].sort((a, b) => (a.date || '9').localeCompare(b.date || '9'))[0]?.name },
  { id: 'podium', name: 'Pódium', text: 'Stál na bedni', icon: I.podium, test: r => r.results.some(x => x.place <= 3) },
  { id: 'champ', name: 'Šampión', text: 'Vyhral GOSko', icon: I.champ, test: r => r.results.some(x => x.place === 1) },
  { id: 'junior', name: 'Junior', text: 'Jazdí v U16', icon: I.junior, test: r => r.results.some(x => x.cat === 'u16') },
  { id: 'women', name: 'Babská sila', text: 'Jazdí v babskej kategórii', icon: I.women, test: r => r.results.some(x => x.cat === 'women') },
  { id: 'trick', name: 'Best Trick', text: 'Trik dňa', icon: I.trick, test: r => r.awards.some(a => a.name === 'Best Trick') },
  { id: 'loyal', name: 'Verný jazdec', text: 'Odjazdil všetky zastávky sezóny', icon: I.loyal,
    test: (r, ctx) => ctx.seasonEvents.length >= 2 && ctx.seasonEvents.every(ev => r.events.includes(ev)) },
];

/* ctx.seasonEvents = odjazdené eventy sezóny, ktoré už majú výsledky */
export function badgesFor(rider, ctx) {
  return BADGES.filter(b => b.test(rider, ctx)).map(b => ({ ...b, detail: b.detail ? b.detail(rider) : '' }));
}

export function badgeSvg(b, size = 22) {
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${b.icon}</svg>`;
}

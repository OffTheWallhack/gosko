/* Vygeneruje statické stránky pre zdieľanie a Google:
   každý event, jazdec, článok a hlavné sekcie dostanú vlastnú adresu s náhľadom (og:title, og:image…).
   Spúšťa sa samo cez GitHub Actions (.github/workflows/pages.yml), ručne: node scripts/build-pages.mjs
   Adresa webu: env SITE_URL, inak <meta name="gosko:base-url"> v index.html (master-gosko: https://gosko.sk).
   <base href> v stránkach sa nastaví podľa nej (web v koreni domény = "/").
   Bez siete (napr. lokálne): POSTS_FILE=cesta.json (pole článkov) a databáza sa nevolá. */
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const template0 = readFileSync(join(ROOT, 'index.html'), 'utf8');
const metaBase = /<meta name="gosko:base-url" content="([^"]+)">/.exec(template0)?.[1];
const SITE_URL = (process.env.SITE_URL || metaBase || 'https://offthewallhack.github.io/gosko/').replace(/\/?$/, '/');
const BASE_PATH = new URL(SITE_URL).pathname;
const { CONFIG, SITE, EVENTS, RIDERS = {}, CREWS = [] } = await import(join(ROOT, 'data.js'));
const { appHead } = await import(join(ROOT, 'assets/game/return.js'));

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const slug = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const ogImg = u => { const m = /^img\/([\w-]+)\.webp$/.exec(u || ''); return m && existsSync(join(ROOT, 'img/og', m[1] + '.jpg')) ? `img/og/${m[1]}.jpg` : u; };
const abs = u => { u = ogImg(u || 'img/ba-podium.webp'); return /^https?:/.test(u) ? u : SITE_URL + u.replace(/^\//, ''); };
const fmt = d => { if (!d) return ''; const [y, m, dd] = d.split('-').map(Number); return `${dd}. ${m}. ${y}`; };
const clip = (s, n = 180) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };

const template = template0.replace(/<base href="[^"]*">/, `<base href="${BASE_PATH}">`);
const pages = [];
function page(path, { title, description, image, body = '', type = 'website', head = null }) {
  const url = SITE_URL + (path ? path + '/' : '');
  const full = title ? `${title} | GOSko` : 'GOSko | Game of S.K.A.T.E. na Slovensku';
  let html = template
    .replace(/<title>[^<]*<\/title>/, `<title>${esc(full)}</title>`)
    .replace(/<meta name="description"[^>]*>/, `<meta name="description" content="${esc(description)}">`)
    .replace(/<meta property="og:[^>]*>\n?/g, '').replace(/<meta name="twitter:[^>]*>\n?/g, '').replace(/<link rel="canonical"[^>]*>\n?/g, '')
    .replace('<meta name="theme-color"', [
      `<link rel="canonical" href="${esc(url)}">`,
      `<meta property="og:type" content="${type}">`, `<meta property="og:site_name" content="GOSko">`, `<meta property="og:locale" content="sk_SK">`,
      `<meta property="og:title" content="${esc(full)}">`, `<meta property="og:description" content="${esc(description)}">`,
      `<meta property="og:url" content="${esc(url)}">`, `<meta property="og:image" content="${esc(abs(image))}">`,
      `<meta name="twitter:card" content="summary_large_image">`, '<meta name="theme-color"'].join('\n'));
  // obsah pre vyhľadávače a prehliadače bez JavaScriptu; aplikácia ho po načítaní nahradí
  html = html.replace(/<main id="main"([^>]*)>[\s\S]*?<\/main>/, `<main id="main"$1><div class="wrap seo-pre"><h1>${esc(title || 'GOSko')}</h1><p>${esc(description)}</p>${body}</div></main>`);
  /* samostatná appka (Ghoskate na /hra): vlastný manifest, názov na ploche, ikona a farba lišty už v HTML, nech sa dá hneď inštalovať */
  if (head) html = html
    .replace(/<link rel="manifest" href="[^"]*">/, `<link rel="manifest" href="${head.manifest}">`)
    .replace(/<meta name="apple-mobile-web-app-title" content="[^"]*">/, `<meta name="apple-mobile-web-app-title" content="${esc(head.title)}">`)
    .replace(/<link rel="apple-touch-icon" href="[^"]*">/, `<link rel="apple-touch-icon" href="${head.icon}">`)
    .replace(/<meta name="theme-color" content="[^"]*">/, `<meta name="theme-color" content="${head.theme}">`);
  if (path) { mkdirSync(join(ROOT, path), { recursive: true }); writeFileSync(join(ROOT, path, 'index.html'), html); }
  pages.push(path);
  return html;
}
const link = (href, text) => `<a href="${esc(href)}">${esc(text)}</a>`;
const list = items => `<ul>${items.map(x => `<li>${x}</li>`).join('')}</ul>`;

/* jazdci z výsledkov */
const riders = new Map();
for (const ev of EVENTS) {
  for (const [cat, names] of Object.entries(ev.results || {})) names.forEach((n, i) => { const s = slug(n); const r = riders.get(s) || { name: n, slug: s, res: [] }; r.res.push(`${i + 1}. miesto, ${cat}, ${ev.name}`); riders.set(s, r); });
  for (const a of ev.awards || []) { const s = slug(a.rider); const r = riders.get(s) || { name: a.rider, slug: s, res: [] }; r.res.push(`${a.name}, ${ev.name}`); riders.set(s, r); }
}

/* články zo Supabase (ak sa dajú načítať) alebo zo súboru POSTS_FILE */
let posts = [], postsLoaded = false;
if (process.env.POSTS_FILE) { posts = JSON.parse(readFileSync(process.env.POSTS_FILE, 'utf8')); postsLoaded = true; }
else try {
  const r = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/posts?select=id,title,summary,body,image_url,created_at&published=eq.true&order=created_at.desc&limit=200`, { headers: { apikey: CONFIG.SUPABASE_ANON_KEY } });
  if (r.ok) { posts = await r.json(); postsLoaded = true; } else console.warn('posts', r.status);
} catch (err) { console.warn('Články sa nenačítali:', err.message); }
/* stránky článkov sa pri úspešnom načítaní zostavia nanovo (zmazané a skryté články zmiznú) */
if (postsLoaded && existsSync(join(ROOT, 'novinka'))) rmSync(join(ROOT, 'novinka'), { recursive: true, force: true });

/* sekcie */
const SECTIONS = [
  ['eventy', 'Eventy', 'GOSko zastávky Game of S.K.A.T.E. a skate kalendár eventov na Slovensku, v Česku aj vo svete.'],
  ['rebricek', 'Rebríček', `Rebríček jazdcov GOSko ${SITE.season}: body, výsledky a najlepší skejteri.`],
  ['jazdci', 'Jazdci', 'Skejteri, ktorí jazdili GOSko: profily, výsledky a dosky.'],
  ['sien-slavy', 'Sieň slávy', 'Víťazi GOSko eventov a ocenenia.'],
  ['novinky', 'Novinky', 'Čo sa deje v GOSku a na skate scéne.'],
  ['hra', 'Ghoskate', 'Ghoskate, hra od GOSko: herná mapa skate spotov na Slovensku, check-in na spote, crew, body a rebríček. Pridaj si ju na plochu ako appku.'],
  ['spoty', 'Skateparky a spoty', 'Skateparky a street spoty na Slovensku s hodnotením. Pridaj aj svoj spot a ohodnoť ostatné.'],
  ['parky', 'Postav si skatepark', '3D stavebnica skateparku. Najlepšie parky podľa hlasov idú do top 10.'],
  ['doska', 'Navrhni si dosku', 'Tvoja 3D skateboard doska s nálepkami z GOSko eventov.'],
  ['trik-tyzdna', 'Trik týždňa', 'Pošli klip, vyberieme troch finalistov a víťaza určíte hlasovaním.'],
  ['crew', 'Crew', 'Skate crew zo Slovenska: členovia, eventy a spoty.'],
  ['komunita', 'Komunita', 'Discord, trik týždňa, crew a všetko okolo GOSko komunity.'],
  ['rodicia', 'Pre rodičov', 'Ako funguje GOSko pre jazdcov do 16 rokov: bezpečnosť, súhlas rodiča, čo priniesť.'],
  ['shop', 'Shop', 'GOSko merch a podpora komunity.'],
  ['partneri', 'Pre partnerov', 'Spolupráca s GOSko: čísla, plán a ako sa pridať.'],
  ['o-nas', 'Kto sme', 'GOSko je komunitná značka, ktorá robí skate eventy na Slovensku. Slovenská Federácia Skateboardingu (o. z. v príprave).'],
  ['pravidla', 'Pravidlá', 'Pravidlá Game of S.K.A.T.E. na GOSko eventoch.'],
];

/* úvodka (template = index.html, len doplníme náhľad) */
const homeBody = list(SECTIONS.map(([p, t]) => link(p, t)));
const homeDesc = 'GOSko je séria Game of S.K.A.T.E. súťaží po Slovensku a v Česku. Eventy, rebríček skejterov, trik týždňa, mapa spotov a 3D doska.';
const home = page('', { title: '', description: homeDesc, body: homeBody });
/* index.html si nechá vlastnú hlavičku (náhľad 1200×630, twitter:*), mení sa len obsah pre vyhľadávače v <main> */
writeFileSync(join(ROOT, 'index.html'), template0.replace(/<main id="main"([^>]*)>[\s\S]*?<\/main>/,
  `<main id="main"$1><div class="wrap seo-pre"><h1>GOSko</h1><p>${esc(homeDesc)}</p>${homeBody}</div></main>`));
writeFileSync(join(ROOT, '404.html'), home.replace('<meta name="theme-color"', '<meta name="robots" content="noindex">\n<meta name="theme-color"'));

/* staré /mapa presmeruje Vercel na /hra (vercel.json redirects), stránka mapa/ by sa nikdy neukázala */
if (existsSync(join(ROOT, 'mapa'))) rmSync(join(ROOT, 'mapa'), { recursive: true, force: true });
for (const [p, t, d] of SECTIONS) page(p, { title: t, description: d, head: p === 'hra' ? appHead(true) : null, image: p === 'hra' ? 'img/ba-trick-5.webp' : undefined,
  body: p === 'eventy' ? list(EVENTS.map(e => link(`event/${e.id}`, e.name))) : p === 'jazdci' || p === 'rebricek' ? list([...riders.values()].map(r => link(`jazdec/${r.slug}`, r.name))) : p === 'novinky' ? list(posts.map(x => link(`novinka/${x.id}`, x.title))) : '' });
for (const e of EVENTS) page(`event/${e.id}`, { title: e.name, type: 'article', image: e.photos?.[0]?.src,
  description: clip([e.status === 'next' ? 'Ďalší stop GOSko' : 'GOSko', e.place, e.date ? fmt(e.date) : e.when || 'coming soon', e.about].filter(Boolean).join(' · ')),
  body: e.results ? list(Object.entries(e.results).flatMap(([c, n]) => n.map((x, i) => `${esc(c)} ${i + 1}. ${link(`jazdec/${slug(x)}`, x)}`))) : '' });
for (const r of riders.values()) page(`jazdec/${r.slug}`, { title: r.name, type: 'profile', image: RIDERS[r.slug]?.photo,
  description: clip(`${r.name} na GOSko: ${r.res.join('; ')}.`), body: list(r.res.map(esc)) });
for (const x of posts) page(`novinka/${x.id}`, { title: x.title, type: 'article', image: x.image_url,
  description: clip(x.summary || x.body || x.title), body: `<p>${esc(clip(x.body || '', 1200))}</p>` });
for (const c of CREWS) page(`crew/${c.id}`, { title: c.name, description: clip(c.about || `${c.name}: skate crew na GOSko.`), image: c.image });

/* sitemap a robots */
writeFileSync(join(ROOT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${[...pages.map(p => p ? p + '/' : ''), 'hub/'].map(p => `  <url><loc>${SITE_URL}${p}</loc></url>`).join('\n')}\n</urlset>\n`);
writeFileSync(join(ROOT, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${SITE_URL}sitemap.xml\n`);
console.log(`Hotovo: ${pages.length} stránok, ${posts.length} článkov.`);

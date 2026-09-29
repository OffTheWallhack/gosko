/* Stará CRT telka na skate ledgi: kanál 1 = video z YouTube, kanál 2 = fotky z eventu.
   Okolo nej sú prilepené polaroidy. Bez závislostí, samostatný modul. */
import { deco } from './deco.js';

const el = (tag, props = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (k === 'class') n.className = v;
    else n.setAttribute(k, v === true ? '' : v);
  }
  n.append(...kids.flat().filter(x => x != null && x !== false));
  return n;
};

const ANTENNA = `<svg viewBox="0 0 240 90" preserveAspectRatio="xMidYMax meet" focusable="false">
  <g stroke="#cfcac0" stroke-width="3" stroke-linecap="round" fill="none">
    <path d="M120 88 L52 8"/><path d="M120 88 L188 14"/></g>
  <circle cx="52" cy="8" r="5" fill="#cfcac0"/><circle cx="188" cy="14" r="5" fill="#cfcac0"/>
  <ellipse cx="120" cy="88" rx="26" ry="7" fill="#2a2724"/></svg>`;

const reduced = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function crtTv({ videoId, title = 'Video z eventu', photos = [], stamp = '' }) {
  const channels = [];
  if (videoId) channels.push({ id: 'video', name: 'VIDEO' });
  if (photos.length) channels.push({ id: 'photos', name: 'FOTKY' });
  if (!channels.length) return null;

  let on = false, ch = 0, slide = 0, timer = null, touched = false;
  const content = el('div', { class: 'crt-content' });
  const stat = el('div', { class: 'crt-static', 'aria-hidden': 'true' });
  const osdCh = el('span', { class: 'osd osd-ch', 'aria-hidden': 'true' });
  const osdPlay = el('span', { class: 'osd osd-play', 'aria-hidden': 'true' });
  const osdStamp = el('span', { class: 'osd osd-stamp', 'aria-hidden': 'true' });
  const live = el('p', { class: 'crt-live', role: 'status' });
  const screen = el('div', { class: 'crt-screen off' },
    content, stat,
    el('div', { class: 'crt-fx', 'aria-hidden': 'true' }),
    osdCh, osdPlay, osdStamp);
  const led = el('span', { class: 'crt-led', 'aria-hidden': 'true' });
  const chBtn = el('button', { type: 'button', class: 'crt-knob crt-ch', 'aria-label': 'Ďalší kanál' }, el('span', { 'aria-hidden': 'true' }, 'CH'));
  const pwBtn = el('button', { type: 'button', class: 'crt-knob crt-pw', 'aria-label': 'Zapnúť telku', 'aria-pressed': 'false' }, el('span', { 'aria-hidden': 'true' }, '⏻'));
  const panel = el('div', { class: 'crt-panel' },
    el('div', { class: 'crt-grille', 'aria-hidden': 'true' }),
    el('div', { class: 'crt-ctrl' }, chBtn, el('span', { class: 'crt-lbl', 'aria-hidden': 'true' }, 'KANÁL')),
    el('div', { class: 'crt-ctrl' }, pwBtn, el('span', { class: 'crt-lbl', 'aria-hidden': 'true' }, 'ZAP')),
    led);
  const root = el('div', { class: 'crt', role: 'group', 'aria-label': `Televízor: ${title}` },
    el('div', { class: 'crt-antenna', 'aria-hidden': 'true' }),
    el('div', { class: 'crt-body' }, el('div', { class: 'crt-bezel' }, screen), panel),
    el('div', { class: 'crt-feet', 'aria-hidden': 'true' }, el('i'), el('i')),
    live);
  root.querySelector('.crt-antenna').innerHTML = ANTENNA;

  const blip = () => {
    if (reduced()) return;
    stat.classList.add('on'); setTimeout(() => stat.classList.remove('on'), 240);
  };
  const stopTimer = () => { clearInterval(timer); timer = null; };
  const flashCh = text => {
    osdCh.textContent = text; osdCh.classList.add('show');
    clearTimeout(flashCh.t); flashCh.t = setTimeout(() => osdCh.classList.remove('show'), 2200);
  };

  function showVideo() {
    const poster = el('button', { type: 'button', class: 'crt-poster', 'aria-label': `Prehrať video: ${title}` },
      el('img', { src: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`, alt: '', width: 480, height: 360 }),
      el('span', { class: 'crt-play', 'aria-hidden': 'true' }));
    const box = el('div', { class: 'crt-video' }, poster);
    poster.addEventListener('click', () => {
      blip(); osdPlay.textContent = '▶ PLAY';
      box.replaceChildren(el('iframe', {
        src: `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1`, title,
        allow: 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture', allowfullscreen: true }));
    });
    content.replaceChildren(box);
    osdPlay.textContent = '■ STOP'; osdStamp.textContent = stamp;
  }

  function showPhoto() {
    const p = photos[slide % photos.length];
    content.replaceChildren(el('img', { class: 'crt-photo', src: p.src, alt: p.alt || '', width: 1400, height: 933 }));
    osdPlay.textContent = '▶ PLAY'; osdStamp.textContent = stamp;
  }

  function render() {
    stopTimer();
    const c = channels[ch];
    if (c.id === 'video') showVideo();
    else {
      showPhoto();
      if (!reduced() && photos.length > 1) timer = setInterval(() => {
        if (!root.isConnected) return stopTimer();
        slide++; blip(); showPhoto();
      }, 4500);
    }
    flashCh(`CH ${ch + 1}  ${c.name}`);
    live.textContent = `Kanál ${ch + 1}: ${c.id === 'video' ? 'video' : 'fotky z eventu'}`;
  }

  function power(next, fromUser) {
    if (fromUser) touched = true;
    if (next === on) return;
    on = next;
    pwBtn.setAttribute('aria-pressed', String(on));
    pwBtn.setAttribute('aria-label', on ? 'Vypnúť telku' : 'Zapnúť telku');
    root.classList.toggle('is-on', on);
    if (on) {
      screen.classList.remove('off', 'closing'); screen.classList.add('booting');
      render();
      setTimeout(() => screen.classList.remove('booting'), 800);
    } else {
      stopTimer();
      screen.classList.add('closing');
      setTimeout(() => { if (!on) { screen.classList.remove('closing'); screen.classList.add('off'); content.replaceChildren(); } }, reduced() ? 0 : 420);
    }
  }

  pwBtn.addEventListener('click', () => power(!on, true));
  chBtn.addEventListener('click', () => {
    touched = true;
    if (!on) { power(true, true); return; }
    ch = (ch + 1) % channels.length; blip(); render();
  });
  // ťuknutie na obrazovku s fotkami = ďalšia fotka
  screen.addEventListener('click', e => {
    if (!on || channels[ch].id !== 'photos' || e.target.closest('button')) return;
    slide++; blip(); showPhoto(); if (timer) { stopTimer(); timer = setInterval(() => { if (!root.isConnected) return stopTimer(); slide++; blip(); showPhoto(); }, 4500); }
  });

  // telka sa sama zapne, keď ju človek doscrolluje (len raz, kým sa jej sám nedotkol)
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(es => {
      if (es.some(e => e.isIntersecting) && !touched && !on) { power(true, false); io.disconnect(); }
    }, { threshold: .55 });
    io.observe(root);
  } else power(true, false);

  return root;
}

/* Celá scéna: telka na ledgi + polaroidy (na mobile ako pás pod ňou). */
export function tvScene({ videoId, title, photos = [], stamp = '', polaroids = true, onPhoto }) {
  const tv = crtTv({ videoId, title, photos, stamp });
  if (!tv) return null;
  const pols = photos.slice(0, 8);
  const pol = (p, i, cls) => el('button', {
    type: 'button', class: `ph pol ${cls || ''}`, style: `--r:${((i * 37) % 9) - 4}deg`,
    'aria-label': 'Zväčšiť: ' + (p.alt || 'fotka'), onclick: () => onPhoto && onPhoto(photos, photos.indexOf(p)),
  }, el('img', { src: p.src, alt: p.alt || '', loading: 'lazy', width: 1400, height: 933 }));
  const ledge = el('div', { class: 'crt-ledge', 'aria-hidden': 'true' });
  ledge.append(deco('burst', 'crt-deco'));
  const stage = el('div', { class: 'scene-stage' },
    polaroids ? el('div', { class: 'pol-wall pol-left' }, pols.slice(0, 3).map((p, i) => pol(p, i, `p${i + 1}`))) : null,
    el('div', { class: 'crt-wrap' }, tv, ledge),
    polaroids ? el('div', { class: 'pol-wall pol-right' }, pols.slice(3, 6).map((p, i) => pol(p, i + 3, `p${i + 4}`))) : null);
  const scene = el('div', { class: 'tv-scene' + (polaroids ? '' : ' plain') }, stage,
    polaroids && pols.length ? el('div', { class: 'pol-strip', role: 'list' }, pols.map((p, i) => pol(p, i))) : null);
  return scene;
}

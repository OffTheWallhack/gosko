/* Stará CRT telka na skate ledgi.
   Video sa spustí samo (bez zvuku, kým človek neťukne). Ťuknutie na telku ukáže náhodnú fotku,
   ďalšie ťuknutie pustí video so zvukom, a tak dokola. Okolo telky sú prilepené polaroidy. */
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
const YT = 'https://www.youtube-nocookie.com';

export function crtTv({ videoId, title = 'Video z eventu', photos = [], stamp = '' }) {
  const hasVideo = !!videoId, hasPhotos = photos.length > 0;
  if (!hasVideo && !hasPhotos) return null;

  let state = 'off';            // off | poster | video | photo
  let lastPhoto = -1, iframe = null, box = null, started = false, inView = false;

  const content = el('div', { class: 'crt-content' });
  const photoLayer = el('div', { class: 'crt-photo-layer', 'aria-hidden': 'true' });
  const stat = el('div', { class: 'crt-static', 'aria-hidden': 'true' });
  const osdCh = el('span', { class: 'osd osd-ch', 'aria-hidden': 'true' });
  const osdPlay = el('span', { class: 'osd osd-play', 'aria-hidden': 'true' });
  const osdStamp = el('span', { class: 'osd osd-stamp', 'aria-hidden': 'true' }, stamp);
  const live = el('p', { class: 'crt-live', role: 'status' });
  const hit = el('button', { type: 'button', class: 'crt-hit', 'aria-label': 'Zapína sa televízor' });
  const screen = el('div', { class: 'crt-screen off' },
    content, photoLayer, stat,
    el('div', { class: 'crt-fx', 'aria-hidden': 'true' }),
    osdCh, osdPlay, osdStamp, hit);

  // ovládanie na boku je len na ozdobu: gombíky sa točia a ťuknutie prepína ako na obrazovke
  const knobs = [el('div', { class: 'crt-knob' }, el('span', {}, 'VOL')), el('div', { class: 'crt-knob' }, el('span', {}, 'TUNE'))];
  const panel = el('div', { class: 'crt-panel', 'aria-hidden': 'true' },
    el('div', { class: 'crt-grille' }), knobs[0], knobs[1], el('span', { class: 'crt-led' }));
  const root = el('div', { class: 'crt', role: 'group', 'aria-label': `Televízor: ${title}` },
    el('div', { class: 'crt-antenna', 'aria-hidden': 'true' }),
    el('div', { class: 'crt-body' }, el('div', { class: 'crt-bezel' }, screen), panel),
    el('div', { class: 'crt-feet', 'aria-hidden': 'true' }, el('i'), el('i')),
    live);
  root.querySelector('.crt-antenna').innerHTML = ANTENNA;

  const blip = () => { if (reduced()) return; stat.classList.add('on'); setTimeout(() => stat.classList.remove('on'), 240); };
  const cmd = (func, args = []) => {
    try { iframe && iframe.contentWindow && iframe.contentWindow.postMessage(JSON.stringify({ event: 'command', func, args }), YT); } catch { /* iframe sa ešte nenačítal */ }
  };
  const flash = text => {
    osdCh.textContent = text; osdCh.classList.add('show');
    clearTimeout(flash.t); flash.t = setTimeout(() => osdCh.classList.remove('show'), 2000);
  };
  function label() {
    const [aria, osd, say] = {
      poster: [`Prehrať video: ${title}`, '■ STOP', 'Video je pripravené. Ťukni a spustí sa.'],
      video: [hasPhotos ? 'Ťukni a ukáže sa náhodná fotka' : 'Ťukni a zapne sa zvuk', '▶ PLAY', 'Prehráva sa video.'],
      photo: [hasVideo ? 'Ťukni a pustí sa video' : 'Ťukni a ukáže sa ďalšia fotka', hasVideo ? '❚❚ PAUSE' : '▶ PLAY', 'Zobrazená fotka z eventu.'],
    }[state] || ['Televízor', '', ''];
    hit.setAttribute('aria-label', aria); osdPlay.textContent = osd; live.textContent = say;
  }

  function buildVideo({ muted }) {
    const q = new URLSearchParams({ autoplay: '1', mute: muted ? '1' : '0', loop: '1', playlist: videoId, controls: '0', playsinline: '1',
      rel: '0', modestbranding: '1', iv_load_policy: '3', disablekb: '1', enablejsapi: '1', origin: location.origin });
    iframe = el('iframe', { class: 'crt-yt', src: `${YT}/embed/${videoId}?${q}`, title, tabindex: '-1',
      allow: 'autoplay; encrypted-media; picture-in-picture', referrerpolicy: 'strict-origin-when-cross-origin' });
    if (!box) {
      box = el('div', { class: 'crt-video' }, el('img', { class: 'crt-posterimg', src: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`, alt: '', width: 480, height: 360 }));
      content.replaceChildren(box);
    }
    box.classList.remove('paused'); box.querySelector('.crt-play')?.remove(); box.append(iframe);
  }
  function showPoster() {
    box = el('div', { class: 'crt-video paused' },
      el('img', { class: 'crt-posterimg', src: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`, alt: '', width: 480, height: 360 }),
      el('span', { class: 'crt-play', 'aria-hidden': 'true' }));
    content.replaceChildren(box);
  }
  function showPhoto() {
    let i; do { i = Math.floor(Math.random() * photos.length); } while (photos.length > 1 && i === lastPhoto);
    lastPhoto = i;
    const p = photos[i];
    photoLayer.replaceChildren(el('img', { class: 'crt-photo', src: p.src, alt: p.alt || '', width: 1400, height: 933 }));
    screen.classList.add('show-photo');
  }

  function toggle() {
    if (state === 'off') return;
    if (state === 'poster') { buildVideo({ muted: false }); state = 'video'; }
    else if (state === 'video') {
      if (hasPhotos) { blip(); showPhoto(); cmd('pauseVideo'); state = 'photo'; flash('FOTKA'); }
      else { cmd('unMute'); cmd('playVideo'); }
    } else if (state === 'photo') {
      blip();
      if (hasVideo) {
        screen.classList.remove('show-photo');
        if (iframe) { cmd('unMute'); cmd('playVideo'); } else buildVideo({ muted: false });
        state = 'video'; flash('VIDEO');
      } else showPhoto();
    }
    label();
  }
  hit.addEventListener('click', toggle);
  panel.addEventListener('click', e => {
    const k = e.target.closest('.crt-knob');
    if (k) k.style.transform = `rotate(${(k._a = (k._a || 0) + 70)}deg)`;
    toggle();
  });

  function boot() {
    started = true;
    screen.classList.remove('off'); screen.classList.add('booting'); root.classList.add('is-on');
    setTimeout(() => screen.classList.remove('booting'), 800);
    if (hasVideo) { if (reduced()) { showPoster(); state = 'poster'; } else { buildVideo({ muted: true }); state = 'video'; } }
    else { showPhoto(); state = 'photo'; }
    label(); flash(hasVideo ? 'VIDEO' : 'FOTKA');
  }

  // telka sa zapne, keď ju človek doscrolluje, a pozastaví sa, keď ju stratí z očí
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(es => {
      const r = Math.max(...es.map(e => e.isIntersecting ? e.intersectionRatio : 0));
      inView = r > 0.25;
      if (!started && r >= 0.5) boot();
      else if (started && state === 'video') cmd(inView ? 'playVideo' : 'pauseVideo');
    }, { threshold: [0, .1, .25, .5] }).observe(root);
    document.addEventListener('visibilitychange', () => {
      if (!root.isConnected) return;
      if (started && state === 'video') cmd(document.hidden || !inView ? 'pauseVideo' : 'playVideo');
    });
  } else boot();

  return root;
}

/* Polaroid: prilepená fotka, ťuknutím sa otvorí na celú obrazovku. */
const polaroid = (p, i, all, onPhoto, cls = '') => el('button', {
  type: 'button', class: `ph pol ${cls}`, style: `--r:${((i * 37) % 9) - 4}deg`,
  'aria-label': 'Zväčšiť: ' + (p.alt || 'fotka'), onclick: () => onPhoto && onPhoto(all, all.indexOf(p)),
}, el('img', { src: p.src, alt: p.alt || '', loading: 'lazy', width: 1400, height: 933 }));

const shuffle = list => { const a = [...list]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

/* Pás polaroidov na spodok ostatných stránok (zábava až dole). */
export function polaroidStrip(photos, onPhoto, { count = 8 } = {}) {
  if (!photos.length) return null;
  const pick = shuffle(photos).slice(0, count);
  const strip = el('div', { class: 'fun-strip', role: 'list' }, pick.map((p, i) => polaroid(p, i, photos, onPhoto)));
  return el('div', { class: 'fun-wrap' }, strip, deco('burst', 'fun-deco'));
}

/* Celá scéna: telka na ledgi + polaroidy (na mobile ako pás pod ňou). */
export function tvScene({ videoId, title, photos = [], stamp = '', polaroids = true, onPhoto }) {
  const tv = crtTv({ videoId, title, photos, stamp });
  if (!tv) return null;
  const pols = photos.slice(0, 8);
  const ledge = el('div', { class: 'crt-ledge', 'aria-hidden': 'true' });
  ledge.append(deco('burst', 'crt-deco'));
  const stage = el('div', { class: 'scene-stage' },
    polaroids ? el('div', { class: 'pol-wall pol-left' }, pols.slice(0, 3).map((p, i) => polaroid(p, i, photos, onPhoto, `p${i + 1}`))) : null,
    el('div', { class: 'crt-wrap' }, tv, ledge),
    polaroids ? el('div', { class: 'pol-wall pol-right' }, pols.slice(3, 6).map((p, i) => polaroid(p, i + 3, photos, onPhoto, `p${i + 4}`))) : null);
  return el('div', { class: 'tv-scene' + (polaroids ? '' : ' plain') }, stage,
    polaroids && pols.length ? el('div', { class: 'pol-strip', role: 'list' }, pols.map((p, i) => polaroid(p, i, photos, onPhoto))) : null);
}

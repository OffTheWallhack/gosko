import * as THREE from 'three';

const FONT = '"Archivo", system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
/* matchMedia až pri vykreslení (nie pri importe modulu), aby sa board.js dal načítať aj mimo prehliadača a lenivo */
const reduceMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

let logoPromise = null;
export function loadLogo() {
  if (!logoPromise) {
    logoPromise = (async () => {
      await Promise.race([document.fonts.load(`900 60px ${FONT}`), new Promise(r => setTimeout(r, 1500))]).catch(() => {});
      const img = new Image(); img.src = 'img/logo.webp'; await img.decode();
      try { const g = new Image(); g.src = 'img/ghost.svg'; await g.decode(); GHOST = g; } catch { /* duch je len ozdoba */ }
      try { const w = new Image(); w.src = 'img/gosko-wordmark.svg'; await w.decode(); WORD = w; } catch { /* nápis je len ozdoba */ }
      return img;
    })();
  }
  return logoPromise;
}
let GHOST = null, WORD = null;

/* ---------- kreslenie nálepiek ---------- */
function rr(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function fit(ctx, text, weight, maxW, size) {
  for (; size > 8; size--) { ctx.font = `${weight} ${size}px ${FONT}`; if (ctx.measureText(text).width <= maxW) break; }
}
function stretch(ctx, v) { if ('fontStretch' in ctx) ctx.fontStretch = v; }

/* spec: { kind: 'band'|'round'|'next'|'medal'|'trick', title, sub, place } */
export function stickerCanvas(spec, logo) {
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const x = c.getContext('2d'); x.textAlign = 'center'; x.textBaseline = 'middle';
  const title = (spec.title || '').toLocaleUpperCase('sk'), sub = (spec.sub || '').toLocaleUpperCase('sk');
  switch (spec.kind) {
    case 'round': {
      x.fillStyle = '#fff'; x.beginPath(); x.arc(256, 256, 246, 0, 7); x.fill();
      x.fillStyle = '#111'; x.beginPath(); x.arc(256, 256, 232, 0, 7); x.fill();
      const lw = 250, lh = lw * logo.height / logo.width; x.drawImage(logo, 256 - lw / 2, 52, lw, lh);
      if (title) { stretch(x, 'expanded'); x.fillStyle = '#F3EBDD'; fit(x, title, 900, 280, 60); x.fillText(title, 256, 52 + lh + 38); }
      break;
    }
    case 'next': {
      x.fillStyle = 'rgba(17,17,17,.72)'; rr(x, 36, 60, 440, 392, 36); x.fill();
      x.setLineDash([22, 14]); x.lineWidth = 8; x.strokeStyle = '#F3EBDD'; rr(x, 36, 60, 440, 392, 36); x.stroke();
      x.fillStyle = '#F3EBDD'; stretch(x, 'expanded');
      x.font = `900 150px ${FONT}`; x.fillText('?', 256, 205);
      fit(x, 'ĎALŠÍ STOP', 900, 360, 54); x.fillText('ĎALŠÍ STOP', 256, 330);
      stretch(x, 'condensed'); fit(x, title, 600, 360, 44); x.fillText(title, 256, 385);
      break;
    }
    case 'medal': {
      x.fillStyle = '#fff'; x.beginPath(); x.arc(256, 256, 236, 0, 7); x.fill();
      x.fillStyle = '#A01D21'; x.beginPath(); x.arc(256, 256, 222, 0, 7); x.fill();
      x.strokeStyle = '#F3EBDD'; x.lineWidth = 6; x.beginPath(); x.arc(256, 256, 200, 0, 7); x.stroke();
      stretch(x, 'expanded'); x.fillStyle = '#F3EBDD';
      x.font = `900 190px ${FONT}`; x.fillText(`${spec.place}.`, 256, 205);
      fit(x, 'MIESTO', 900, 300, 56); x.fillText('MIESTO', 256, 318);
      stretch(x, 'condensed'); fit(x, title, 700, 290, 40); x.fillText(title, 256, 378);
      break;
    }
    case 'trick': {
      const spikes = 14, R = 240, r2 = 200; x.beginPath();
      for (let i = 0; i < spikes * 2; i++) { const a = i * Math.PI / spikes - Math.PI / 2, rad = i % 2 ? r2 : R; x.lineTo(256 + Math.cos(a) * rad, 256 + Math.sin(a) * rad); }
      x.closePath(); x.fillStyle = '#F3EBDD'; x.fill(); x.lineWidth = 10; x.strokeStyle = '#A01D21'; x.stroke();
      stretch(x, 'expanded'); x.fillStyle = '#A01D21';
      fit(x, 'BEST', 900, 280, 96); x.fillText('BEST', 256, 200);
      fit(x, 'TRICK', 900, 300, 96); x.fillText('TRICK', 256, 292);
      stretch(x, 'condensed'); x.fillStyle = '#111'; fit(x, title, 700, 240, 36); x.fillText(title, 256, 368);
      break;
    }
    case 'skate': { // odomknutá nálepka z hry S.K.A.T.E. na úvodke
      x.save(); x.translate(256, 256); x.rotate(-.06);
      x.fillStyle = '#F3EBDD'; rr(x, -236, -150, 472, 300, 26); x.fill();
      x.fillStyle = '#0e0d0c'; rr(x, -222, -136, 444, 272, 16); x.fill();
      if (GHOST) { const gw = 120, gh = gw * GHOST.height / GHOST.width; x.drawImage(GHOST, 100 - gw / 2, -112, gw, gh); }
      x.textAlign = 'left'; x.fillStyle = '#a49b8f'; stretch(x, 'expanded');
      x.font = `800 34px ${FONT}`; x.fillText('GAME OF', -190, -78);
      x.fillStyle = '#F3EBDD'; stretch(x, 'condensed'); fit(x, 'S.K.A.T.E.', 900, 400, 130); x.fillText('S.K.A.T.E.', -192, 30);
      x.strokeStyle = '#A01414'; x.lineWidth = 12; x.lineCap = 'round';
      for (let i = 0; i < 5; i++) { const lx = -186 + i * 80; x.beginPath(); x.moveTo(lx, 52); x.lineTo(lx + 56, 6); x.stroke(); }
      x.fillStyle = '#A01414'; x.fillRect(-222, 92, 444, 44);
      x.fillStyle = '#F3EBDD'; x.textAlign = 'center'; stretch(x, 'expanded'); fit(x, 'ODOMKNUTÉ NA GOSKO.SK', 800, 400, 26); x.fillText('ODOMKNUTÉ NA GOSKO.SK', 0, 115);
      x.restore();
      break;
    }
    default: { // band
      x.fillStyle = '#fff'; rr(x, 16, 36, 480, 440, 40); x.fill();
      x.fillStyle = '#111'; rr(x, 30, 50, 452, 412, 28); x.fill();
      const lw = 220, lh = lw * logo.height / logo.width; x.drawImage(logo, 256 - lw / 2, 62, lw, lh);
      x.fillStyle = '#A01414'; x.fillRect(30, 62 + lh + 4, 452, 70);
      stretch(x, 'expanded'); x.fillStyle = '#fff'; fit(x, title, 900, 410, 58); x.fillText(title, 256, 62 + lh + 41);
      if (sub) { stretch(x, 'condensed'); x.fillStyle = '#F3EBDD'; fit(x, sub, 600, 300, 30); x.fillText(sub, 256, 62 + lh + 98); }
    }
  }
  return c;
}

/* ---------- vzhľad dosky ----------
   look = { deck, grip, wheels, trucks } – kľúče z tabuliek nižšie */
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
const lookOf = l => ({ deck: DECKS[l?.deck] ? l.deck : 'cream', grip: GRIPS[l?.grip] ? l.grip : 'black', wheels: WHEELS[l?.wheels] ? l.wheels : 'cream', trucks: TRUCKS[l?.trucks] ? l.trucks : 'silver' });

function deckGraphic(deck = 'cream') {
  const D = DECKS[deck] || DECKS.cream;
  const c = document.createElement('canvas'); c.width = 2048; c.height = 540;
  const x = c.getContext('2d');
  x.fillStyle = D.base; x.fillRect(0, 0, c.width, c.height);
  if (D.pattern === 'ghosts' && GHOST) {
    for (let i = 0; i < 26; i++) {
      const gx = 360 + (i % 13) * 105 + (i > 12 ? 50 : 0), gy = i > 12 ? 380 : 150, s = 110;
      x.save(); x.translate(gx, gy); x.rotate(Math.PI / 2 + (i % 3 - 1) * .25); x.globalAlpha = .9; x.drawImage(GHOST, -s / 2, -s * .56, s, s * GHOST.height / GHOST.width); x.restore();
    }
  } else if (D.pattern === 'word' && WORD) {
    const h = 300, w = h * WORD.width / WORD.height; x.save(); x.translate(1024, 270); x.rotate(Math.PI / 2); x.drawImage(WORD, -w / 2, -h / 2, w, h); x.restore();
  } else if (GHOST) {
    const gh = 380, gw = gh * GHOST.width / GHOST.height; x.save(); x.translate(1024, 270); x.rotate(Math.PI / 2); x.drawImage(GHOST, -gw / 2, -gh / 2, gw, gh); x.restore();
  }
  for (const bx of [150, 1748]) {
    x.fillStyle = D.stripe; x.fillRect(bx, 0, 150, c.height);
    x.save(); x.translate(bx + 75, c.height / 2); x.rotate(Math.PI / 2);
    x.fillStyle = D.ink; x.textAlign = 'center'; x.textBaseline = 'middle'; stretch(x, 'expanded');
    fit(x, 'GAME OF S.K.A.T.E.', 900, 470, 58); x.fillText('GAME OF S.K.A.T.E.', 0, 4); x.restore();
  }
  x.fillStyle = D.stripe; x.fillRect(320, 0, 14, c.height); x.fillRect(1714, 0, 14, c.height);
  return c;
}
function gripTexture(grip = 'black') {
  const G = GRIPS[grip] || GRIPS.black;
  const c = document.createElement('canvas'); c.width = 1024; c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = G.tint ? `rgb(${G.tint})` : `rgb(${G.base},${G.base},${G.base})`; x.fillRect(0, 0, c.width, c.height);
  for (let i = 0; i < 36000; i++) {
    const g = Math.random() * 60;
    x.fillStyle = G.tint ? `rgba(${G.tint[0] + 40},${G.tint[1] + 20},${G.tint[2] + 20},${(.2 + Math.random() * .5).toFixed(2)})` : `rgb(${30 + g},${30 + g},${30 + g})`;
    x.fillRect(Math.random() * c.width, Math.random() * c.height, 1.4, 1.4);
  }
  if (G.ghost && GHOST) {
    x.globalAlpha = .22;
    for (const gx of [200, 512, 824]) { const s = 150; x.save(); x.translate(gx, 128); x.rotate(Math.PI / 2); x.drawImage(GHOST, -s / 2, -s * .56, s, s * GHOST.height / GHOST.width); x.restore(); }
    x.globalAlpha = 1;
  }
  return c;
}

const bx = (w, h, d, m, x, y, z) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); return o; };
const cy = (r1, r2, h, m, s) => new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, s), m);

/* miesta na nálepky medzi podvozkami (x = dĺžka dosky, z = šírka) */
const SLOTS = [
  { x: .118, z: .028, r: -.14 }, { x: .012, z: -.03, r: .2 }, { x: -.1, z: .032, r: -.06 },
  { x: -.135, z: -.036, r: .12 }, { x: .1, z: -.042, r: .08 }, { x: -.02, z: .045, r: -.18 },
  { x: .15, z: -.01, r: .25 }, { x: -.06, z: -.005, r: -.22 },
];
export const MAX_STICKERS = SLOTS.length;   // ranking.js MAX_STICKERS musí sedieť (test v tests/unit/ranking.test.js)

function buildBoard(stickers, logo, renderer, look) {
  look = lookOf(look);
  const L = .8, W = .21, T = .013, NOSE = L / 2 - W / 2 * .95, FLAT = .26, N = 160, M = 14;
  const halfW = x => { const ax = Math.abs(x); if (ax <= NOSE) return W / 2; const t = Math.min(1, (ax - NOSE) / (L / 2 - NOSE)); return W / 2 * Math.sqrt(1 - t * t); };
  const lift = x => { const ax = Math.abs(x); if (ax <= FLAT) return 0; const t = ax - FLAT; return t * t * 3.2; };
  const aniso = renderer.capabilities.getMaxAnisotropy();
  const disposables = [];
  const tex = cnv => { const t = new THREE.CanvasTexture(cnv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = aniso; disposables.push(t); return t; };
  const mat = o => { const m = new THREE.MeshStandardMaterial(o); disposables.push(m); return m; };

  function surface(sign) {
    const pos = [], uv = [], idx = [];
    for (let i = 0; i <= N; i++) {
      const x = -L / 2 + L * i / N, hw = halfW(x), y = lift(x) + sign * T / 2;
      for (let j = 0; j <= M; j++) { const z = -hw + 2 * hw * j / M; pos.push(x, y, z); uv.push(i / N, (z + W / 2) / W); }
    }
    for (let i = 0; i < N; i++) for (let j = 0; j < M; j++) {
      const a = i * (M + 1) + j, b = a + 1, c = a + M + 1, d = c + 1;
      if (sign > 0) idx.push(a, b, c, b, d, c); else idx.push(a, c, b, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals(); return g;
  }
  function sides() {
    const pos = [], idx = []; let base = 0;
    for (const s of [1, -1]) {
      for (let i = 0; i <= N; i++) { const x = -L / 2 + L * i / N, z = halfW(x) * s, y = lift(x); pos.push(x, y - T / 2, z, x, y + T / 2, z); }
      for (let i = 0; i < N; i++) { const p0 = base + i * 2, p1 = p0 + 1, p2 = p0 + 2, p3 = p0 + 3; if (s > 0) idx.push(p0, p2, p1, p1, p2, p3); else idx.push(p0, p1, p2, p1, p3, p2); }
      base += (N + 1) * 2;
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
  }

  const TR = TRUCKS[look.trucks], WH = WHEELS[look.wheels];
  const steel = mat({ color: TR.color, metalness: TR.metal, roughness: .38 });
  const wheel = mat({ color: WH.color, roughness: .5 });
  const core = mat({ color: WH.core, roughness: .45, metalness: .15 });
  const board = new THREE.Group();
  const grip = tex(gripTexture(look.grip)); grip.wrapS = grip.wrapT = THREE.RepeatWrapping; grip.repeat.set(1.5, 1);
  board.add(new THREE.Mesh(surface(1), mat({ map: grip, roughness: .95 })));
  board.add(new THREE.Mesh(surface(-1), mat({ map: tex(deckGraphic(look.deck)), roughness: .55 })));
  board.add(new THREE.Mesh(sides(), mat({ color: 0xd9b27a, roughness: .7 })));
  for (const tx of [-.235, .235]) {
    const t = new THREE.Group();
    t.add(bx(.07, .008, .056, steel, 0, -T / 2 - .004, 0), bx(.028, .03, .04, steel, 0, -T / 2 - .023, 0));
    const hanger = cy(.013, .019, .13, steel, 14); hanger.rotation.x = Math.PI / 2; hanger.position.set(0, -T / 2 - .043, 0); t.add(hanger);
    const axle = cy(.0045, .0045, .2, steel, 8); axle.rotation.x = Math.PI / 2; axle.position.set(0, -T / 2 - .047, 0); t.add(axle);
    for (const wz of [-.084, .084]) {
      const w = cy(.027, .027, .032, wheel, 32); w.rotation.x = Math.PI / 2; w.position.set(0, -T / 2 - .047, wz); t.add(w);
      const c = cy(.013, .013, .0335, core, 20); c.rotation.x = Math.PI / 2; c.position.copy(w.position); t.add(c);
    }
    t.position.x = tx; board.add(t);
  }
  stickers.slice(0, SLOTS.length).forEach((spec, i) => {
    const s = SLOTS[i];
    const m = new THREE.Mesh(new THREE.PlaneGeometry(.098, .098), mat({ map: tex(stickerCanvas(spec, logo)), transparent: true, alphaTest: .08, roughness: .4 }));
    m.position.set(s.x, -T / 2 - .0011 - i * .0004, s.z);
    m.rotation.set(Math.PI / 2, 0, -Math.PI / 2 + s.r);
    m.userData.link = spec.link || null;
    board.add(m);
  });
  const dispose = () => { board.traverse(o => { if (o.isMesh) o.geometry.dispose(); }); disposables.forEach(d => d.dispose()); };
  return { board, dispose };
}

/* Samotný model dosky (pre maskota a iné scény). */
export async function makeBoardModel(renderer, { look, stickers = [] } = {}) {
  const logo = await loadLogo();
  return buildBoard(stickers, logo, renderer, look);
}

/* scéna: lean (sklon podľa rozloženia) > pitch (naklonenie myšou) > spin (otáčanie) > trick (triky) > face > mid > holder (doska) */
function makeBoardScene(stickers, logo, renderer, look) {
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(30, 1, .01, 20);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x2a1a1a, 1.1));
  const key = new THREE.DirectionalLight(0xffffff, 2.3); key.position.set(1.6, 2, 3); scene.add(key);
  const rim = new THREE.DirectionalLight(0xffe2c4, 2.4); rim.position.set(-3, 1, -2.5); scene.add(rim);
  const holder = new THREE.Group();
  let built = buildBoard(stickers, logo, renderer, look); holder.add(built.board);
  const mid = new THREE.Group(); mid.add(holder); mid.rotation.z = Math.PI / 2;
  const face = new THREE.Group(); face.add(mid); face.rotation.y = -Math.PI / 2;
  const trick = new THREE.Group(); trick.add(face);
  const spin = new THREE.Group(); spin.add(trick); spin.rotation.y = -.45;
  const pitch = new THREE.Group(); pitch.add(spin);
  const lean = new THREE.Group(); lean.add(pitch); scene.add(lean);
  let zoom = 1, aspect = 1, leanAmt = .45;
  const fitCamera = (a, l) => {
    aspect = a; leanAmt = l; camera.aspect = a;
    const tf = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const hh = .45 * Math.cos(l) + .14 * Math.sin(l), hw = .45 * Math.sin(l) + .15 * Math.cos(l);
    camera.position.set(0, 0, (Math.max(hh / tf, hw / (tf * a)) + .06) * zoom);
    camera.updateProjectionMatrix();
  };
  const setZoom = z => { zoom = Math.max(.45, Math.min(1.4, z)); fitCamera(aspect, leanAmt); };
  const rebuild = (st, lk) => { holder.remove(built.board); built.dispose(); built = buildBoard(st, logo, renderer, lk); holder.add(built.board); };
  const dispose = () => built.dispose();
  return { scene, camera, spin, pitch, trick, lean, mid, holder, fitCamera, setZoom, getZoom: () => zoom, rebuild, dispose, boardObj: () => built.board };
}

/* Jednorazový obrázok dosky (karta jazdca, rebríček). Priehľadné pozadie. Vráti canvas. */
let imgRenderer = null;
export async function renderBoardImage(stickers, { width = 800, height = 1100, tilt = -.42, turn = -.5, look } = {}) {
  const logo = await loadLogo();
  if (!imgRenderer) {
    const canvas = document.createElement('canvas');
    imgRenderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
    imgRenderer.setPixelRatio(1); imgRenderer.setClearColor(0x000000, 0);
  }
  imgRenderer.setSize(width, height, false);
  const s = makeBoardScene(stickers, logo, imgRenderer, look);
  s.lean.rotation.z = tilt; s.spin.rotation.y = turn;
  s.fitCamera(width / height, Math.abs(tilt));
  imgRenderer.render(s.scene, s.camera);
  const out = document.createElement('canvas'); out.width = width; out.height = height;
  out.getContext('2d').drawImage(imgRenderer.domElement, 0, 0);
  s.dispose();
  return out;
}

const TRICKS = {
  kickflip: { name: 'Kickflip', ms: 750, f: (t, g) => { g.rotation.y = t * Math.PI * 2; } },
  impossible: { name: 'Impossible', ms: 850, f: (t, g) => { g.rotation.x = t * Math.PI * 2; } },
  tre: { name: '360 flip', ms: 950, f: (t, g) => { g.rotation.y = t * Math.PI * 2; g.rotation.z = t * Math.PI * 2; } },
};
export const TRICK_NAMES = Object.fromEntries(Object.entries(TRICKS).map(([k, v]) => [k, v.name]));

/* ---------- 3D scény okolo dosky ---------- */
export const SCENES = {
  wall: 'Pri stene',
  ride: 'Jazda',
  free: 'Voľný pohľad',
};
const LEGACY = { roll: 'ride', ramp: 'wall', ledge: 'wall' };
const WHEEL_Y = .0805;   // výška stredu dosky nad zemou, keď stojí na kolieskach
const rnd = (a, b) => a + Math.random() * (b - a);
function concreteTex(seams = true, size = 512) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const x = c.getContext('2d'), k = size / 512;
  x.fillStyle = '#8c877f'; x.fillRect(0, 0, size, size);
  for (let i = 0; i < 30000 * k * k; i++) { const g = 105 + Math.random() * 70; x.fillStyle = `rgba(${g},${g - 4},${g - 10},.45)`; x.fillRect(Math.random() * size, Math.random() * size, 1.6, 1.6); }
  for (let i = 0; i < 16; i++) { x.fillStyle = `rgba(40,36,32,${Math.random() * .09})`; x.beginPath(); x.arc(Math.random() * size, Math.random() * size, (30 + Math.random() * 110) * k, 0, 7); x.fill(); }
  // vlasové praskliny
  x.strokeStyle = 'rgba(30,27,24,.35)'; x.lineWidth = 1.2;
  for (let i = 0; i < 3; i++) { let px = Math.random() * size, py = Math.random() * size; x.beginPath(); x.moveTo(px, py); for (let j = 0; j < 9; j++) { px += rnd(-28, 28) * k; py += rnd(-28, 28) * k; x.lineTo(px, py); } x.stroke(); }
  if (seams) { x.strokeStyle = 'rgba(32,29,26,.6)'; x.lineWidth = 3 * k; x.strokeRect(0, 0, size, size); }
  return c;
}
/* stena so sprejom: GOSko kúsok, duch, tagy, plagát a špina pri zemi */
function wallTex() {
  const W = 2048, H = 820, c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  const con = concreteTex(false, 512);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) x.drawImage(con, i * 512, j * 410, 512, 410);
  // betónové panely
  x.strokeStyle = 'rgba(25,22,20,.55)'; x.lineWidth = 4; for (let i = 1; i < 4; i++) { x.beginPath(); x.moveTo(i * 512, 0); x.lineTo(i * 512, H); x.stroke(); }
  x.fillStyle = 'rgba(20,18,16,.18)'; x.fillRect(0, 0, W, H);
  // podklad pod kúsok
  x.save(); x.translate(1300, 545); x.rotate(-.05);
  x.fillStyle = 'rgba(14,13,12,.82)'; x.beginPath(); x.ellipse(0, 0, 360, 125, 0, 0, 7); x.fill();
  x.font = '400 175px "Pirata One", "Anton", serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.lineJoin = 'round'; x.lineWidth = 34; x.strokeStyle = '#F3EBDD'; x.strokeText('GOSko', 0, 6);
  x.lineWidth = 14; x.strokeStyle = '#0e0d0c'; x.strokeText('GOSko', 0, 6);
  const gr = x.createLinearGradient(0, -150, 0, 150); gr.addColorStop(0, '#d0201c'); gr.addColorStop(1, '#7a0f10');
  x.fillStyle = gr; x.fillText('GOSko', 0, 6);
  x.fillStyle = 'rgba(255,255,255,.5)'; for (let i = 0; i < 12; i++) x.fillRect(rnd(-240, 220), rnd(-52, 22), rnd(8, 22), 4);   // odlesky
  x.restore();
  // stekance farby
  for (let i = 0; i < 12; i++) { const dx = rnd(1020, 1560), dy = rnd(600, 640), len = rnd(20, 120); x.fillStyle = 'rgba(140,16,16,.85)'; x.fillRect(dx, dy, 4, len); x.beginPath(); x.arc(dx + 2, dy + len, 4, 0, 7); x.fill(); }
  // duch šablónou
  if (GHOST) { x.save(); x.translate(690, 600); x.rotate(-.12); x.globalAlpha = .95; x.drawImage(GHOST, -110, -125, 220, 248); x.restore(); }
  // plagát
  x.save(); x.translate(330, 360); x.rotate(-.04);
  x.fillStyle = '#efe6d6'; x.fillRect(-120, -170, 240, 330);
  x.fillStyle = '#0e0d0c'; x.fillRect(-104, -152, 208, 150);
  if (GHOST) x.drawImage(GHOST, -48, -140, 96, 108);
  x.fillStyle = '#A01414'; x.fillRect(-104, 8, 208, 40);
  x.fillStyle = '#F3EBDD'; x.font = '800 30px "Archivo", sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('GAME OF SKATE', 0, 29);
  x.fillStyle = '#0e0d0c'; x.font = '700 22px "IBM Plex Mono", monospace'; x.fillText('POP-UP · SK / CZ', 0, 82); x.fillText('COMING SOON', 0, 116);
  x.fillStyle = 'rgba(255,255,255,.35)'; x.beginPath(); x.moveTo(120, -170); x.lineTo(70, -170); x.lineTo(120, -120); x.fill();   // odlepený roh
  x.restore();
  // tagy
  x.font = '700 46px "IBM Plex Mono", monospace'; x.fillStyle = 'rgba(243,235,221,.75)'; x.save(); x.translate(1560, 360); x.rotate(-.08); x.fillText('S.K.A.T.E.', 0, 0); x.restore();
  x.font = '400 70px "Pirata One", serif'; x.fillStyle = 'rgba(14,13,12,.8)'; x.save(); x.translate(860, 470); x.rotate(.06); x.fillText('ride or die', 0, 0); x.restore();
  // špina a vlhkosť pri zemi
  const g2 = x.createLinearGradient(0, H * .7, 0, H); g2.addColorStop(0, 'rgba(14,13,12,0)'); g2.addColorStop(1, 'rgba(14,13,12,.75)');
  x.fillStyle = g2; x.fillRect(0, H * .7, W, H * .3);
  return c;
}
function coneTex() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 256;
  const x = c.getContext('2d'); x.fillStyle = '#d8431c'; x.fillRect(0, 0, 64, 256);
  x.fillStyle = '#efe9df'; x.fillRect(0, 70, 64, 34); x.fillRect(0, 150, 64, 26);
  return c;
}
function gridTex() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const x = c.getContext('2d'); x.fillStyle = '#121110'; x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 4000; i++) { const g = 18 + Math.random() * 14; x.fillStyle = `rgb(${g},${g - 1},${g - 2})`; x.fillRect(Math.random() * 256, Math.random() * 256, 1.5, 1.5); }
  x.strokeStyle = 'rgba(243,235,221,.16)'; x.lineWidth = 2; x.strokeRect(0, 0, 256, 256);
  x.strokeStyle = 'rgba(243,235,221,.05)'; x.lineWidth = 1; x.beginPath(); x.moveTo(128, 0); x.lineTo(128, 256); x.moveTo(0, 128); x.lineTo(256, 128); x.stroke();
  return c;
}
function buildEnv(name, renderer, dispList) {
  const env = new THREE.Group();
  const tex = (cnv, rx = 1, ry = rx) => { const t = new THREE.CanvasTexture(cnv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.anisotropy = renderer.capabilities.getMaxAnisotropy(); dispList.push(t); return t; };
  const mat = o => { const m = new THREE.MeshStandardMaterial(o); dispList.push(m); return m; };
  const mesh = (g, m, cast = true) => { const o = new THREE.Mesh(g, m); o.castShadow = cast; o.receiveShadow = true; dispList.push(g); return o; };
  const concrete = mat({ map: tex(concreteTex(false), 1), roughness: .9 });
  const steel = mat({ color: 0xc9ccd0, metalness: .7, roughness: .3 });
  const cone = () => {
    const g = new THREE.Group(), m = mat({ map: tex(coneTex()), roughness: .6 });
    const body = mesh(new THREE.CylinderGeometry(.018, .1, .42, 28, 1, true), m); body.position.y = .23; g.add(body);
    const base = mesh(new THREE.BoxGeometry(.26, .025, .26), mat({ color: 0x1a1816, roughness: .8 })); base.position.y = .0125; g.add(base);
    return g;
  };
  if (name === 'free') {
    const floor = mesh(new THREE.PlaneGeometry(40, 40), mat({ map: tex(gridTex(), 40), roughness: .95 }), false);
    floor.rotation.x = -Math.PI / 2; env.add(floor);
    // prach vo vzduchu
    const n = 260, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { pos[i * 3] = rnd(-4, 4); pos[i * 3 + 1] = rnd(0, 3); pos[i * 3 + 2] = rnd(-4, 4); }
    const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); dispList.push(pg);
    const pm = new THREE.PointsMaterial({ color: 0xf3ebdd, size: .012, transparent: true, opacity: .55 }); dispList.push(pm);
    const dust = new THREE.Points(pg, pm); env.add(dust); env.userData.dust = dust;
    return env;
  }
  const groundTex = tex(concreteTex(), name === 'ride' ? 24 : 8, name === 'ride' ? 6 : 8);
  const ground = mesh(new THREE.PlaneGeometry(name === 'ride' ? 32 : 12, name === 'ride' ? 8 : 12), mat({ map: groundTex, roughness: .95 }), false);
  ground.rotation.x = -Math.PI / 2; env.add(ground);
  env.userData.groundTex = groundTex;
  if (name === 'wall') {
    const wall = mesh(new THREE.BoxGeometry(6, 2.4, .25), mat({ map: tex(wallTex(), 1), roughness: .92 }));
    wall.position.set(0, 1.2, -.575); env.add(wall);
    const curb = mesh(new THREE.BoxGeometry(1.7, .16, .34), concrete); curb.position.set(-1.45, .08, -.27); env.add(curb);
    const edge = mesh(new THREE.BoxGeometry(1.7, .02, .02), steel); edge.position.set(-1.45, .16, -.1); env.add(edge);
    const c1 = cone(); c1.position.set(.9, 0, .05); c1.rotation.y = .4; env.add(c1);
    const c2 = cone(); c2.position.set(1.2, .1, -.3); c2.rotation.set(.0, .2, Math.PI / 2 - .05); c2.position.y = .1; env.add(c2);   // zvalený kužeľ
  }
  if (name === 'ride') {
    // múr s grafitmi v pozadí uteká pomalšie (paralaxa)
    const bt = tex(wallTex(), 3, 1);
    const back = mesh(new THREE.PlaneGeometry(18, 2.2), mat({ map: bt, roughness: .95 }), false); back.position.set(0, 1.1, -2.6); env.add(back);
    env.userData.backTex = bt;
    const props = [];
    for (let i = 0; i < 5; i++) {
      const p = i % 2 ? cone() : (() => { const g = new THREE.Group(); const b = mesh(new THREE.BoxGeometry(1.2, .15, .3), concrete); b.position.y = .075; g.add(b); const e = mesh(new THREE.BoxGeometry(1.2, .02, .02), steel); e.position.set(0, .15, .15); g.add(e); return g; })();
      p.position.set(-7 + i * 3.4, 0, i % 2 ? rnd(-1.2, -.6) : rnd(-1.6, -1.1)); env.add(p); props.push(p);
    }
    env.userData.props = props;
    // vodorovná čiara na zemi
    const line = mesh(new THREE.PlaneGeometry(32, .05), mat({ color: 0xe9e1d2, roughness: .8 }), false); line.rotation.x = -Math.PI / 2; line.position.set(0, .002, .55); env.add(line);
  }
  return env;
}
/* poloha dosky a kamery v scéne: pose = pozícia/otočenie dosky, cam = [yaw, pitch, dist], target */
const POSES = {
  ride: { pos: [0, WHEEL_Y, 0], rot: [0, 0, 0], cam: [.95, .16, 1.45], target: [0, .14, 0], sun: [-1.5, 3, 2] },
  // opretá o stenu: dĺžka skoro zvislo, spodok s nálepkami k divákovi, grip k stene
  wall: { pos: [0, .39, -.25], lean: .3, cam: [.3, .08, 3], target: [.05, .44, -.3], sun: [2.4, 2.6, 2.2] },
  free: { pos: [0, .55, 0], rot: [0, 0, 0], cam: [.75, .32, 1.9], target: [0, .5, 0], sun: [1.5, 4, 1.5] },
};
const PITCH = { free: [-.35, 1.45], wall: [.02, 1.1], ride: [.02, 1.1] }, DIST = { free: [.6, 5], wall: [.8, 3.2], ride: [.8, 3.2] };

/* Pripojí dosku na plátno. Vráti funkciu na upratanie, na ktorej sú aj ovládacie metódy:
   flip(), trick(name), reset(), zoomBy(f), setAuto(bool), setLook(look), setStickers(list), setScene(name). */
export async function mountBoard(canvas, { stickers = [], onSticker, look, deck, scene: startScene = 'studio' } = {}) {
  const logo = await loadLogo();
  const noop = () => {};
  if (!canvas.isConnected) return Object.assign(() => {}, { flip: noop, trick: noop, reset: noop, zoomBy: noop, setAuto: noop, setLook: noop, setStickers: noop, setScene: noop });
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  let curLook = lookOf(look || (deck ? { deck } : DEFAULT_LOOK)), curStickers = stickers;
  const S = makeBoardScene(stickers, logo, renderer, curLook);
  const { scene, camera, spin, pitch, trick, lean, mid, holder } = S;
  canvas.tabIndex = 0;

  /* scénický svet: vlastné svetlá, zem a rekvizity; doska sa doň presunie */
  const world = new THREE.Group(); world.visible = false; scene.add(world);
  const sun = new THREE.DirectionalLight(0xfff1dc, 2.6); sun.position.set(2, 3.2, 1.6); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -2.5, right: 2.5, top: 2.5, bottom: -2.5, near: .5, far: 12 }); sun.shadow.bias = -.0004; sun.shadow.normalBias = .02;
  const spot = new THREE.SpotLight(0xfff1dc, 18, 6, .55, .6, 1.4); spot.position.set(0, 3.2, .4); spot.target.position.set(0, 0, 0); spot.castShadow = true; spot.shadow.mapSize.set(1024, 1024);
  world.add(sun, spot, spot.target, new THREE.HemisphereLight(0xd8e4ff, 0x3a2f28, .9));
  let nextRideTrick = 0;
  const rig = new THREE.Group(), rigTrick = new THREE.Group(); rig.add(rigTrick); world.add(rig);
  let env = null, envDisp = [], sceneName = 'studio';
  const orbit = { yaw: 0, pitch: .2, dist: 1.6, target: new THREE.Vector3() };
  const shadowsOn = on => S.boardObj().traverse(o => { if (o.isMesh) { o.castShadow = on; o.receiveShadow = on; } });

  function setScene(name) {
    name = LEGACY[name] || name;
    if (!SCENES[name]) name = 'studio';
    sceneName = name;
    if (env) { world.remove(env); envDisp.forEach(d => d.dispose()); envDisp = []; env = null; }
    if (name === 'studio') {
      mid.add(holder); holder.position.set(0, 0, 0); holder.rotation.set(0, 0, 0);
      world.visible = false; lean.visible = true; scene.fog = null; shadowsOn(false); resize(); return;
    }
    env = buildEnv(name, renderer, envDisp); world.add(env);
    const P = POSES[name];
    sun.position.set(...P.sun); sun.intensity = name === 'free' ? 1.6 : 2.6;
    spot.visible = name === 'free'; rig.rotation.set(0, 0, 0); rigTrick.rotation.set(0, 0, 0); rigTrick.position.set(0, 0, 0); anim = null;
    nextRideTrick = performance.now() + 3500;
    rigTrick.add(holder); holder.position.set(0, 0, 0); holder.rotation.set(0, 0, 0);
    rig.position.set(...P.pos);
    if (P.lean !== undefined) {
      const a = P.lean, m = new THREE.Matrix4().makeBasis(new THREE.Vector3(0, Math.cos(a), -Math.sin(a)), new THREE.Vector3(0, -Math.sin(a), -Math.cos(a)), new THREE.Vector3(-1, 0, 0));
      rig.setRotationFromMatrix(m);
    } else rig.rotation.set(...P.rot);
    [orbit.yaw, orbit.pitch, orbit.dist] = P.cam; orbit.target.set(...P.target);
    lean.visible = false; world.visible = true; shadowsOn(true);
    scene.fog = name === 'free' ? new THREE.Fog(0x0e0d0c, 2.5, 9) : new THREE.Fog(0x0e0d0c, name === 'ride' ? 3.5 : 4, name === 'ride' ? 9 : 8.5);
    resize();
  }
  function placeOrbit() {
    const cp = Math.cos(orbit.pitch);
    camera.position.set(orbit.target.x + Math.sin(orbit.yaw) * cp * orbit.dist, orbit.target.y + Math.sin(orbit.pitch) * orbit.dist, orbit.target.z + Math.cos(orbit.yaw) * cp * orbit.dist);
    camera.lookAt(orbit.target);
  }
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight; if (!w || !h) return;
    renderer.setSize(w, h, false);
    if (sceneName === 'studio') { const wide = w / h > .95, l = wide ? .45 : .09; lean.rotation.z = wide ? -l : l; S.fitCamera(w / h, l); }
    else { camera.aspect = w / h; camera.position.set(0, 0, 0); camera.updateProjectionMatrix(); placeOrbit(); }
  }
  const ro = new ResizeObserver(resize); ro.observe(canvas);

  let vel = 0, pvel = 0, drag = null, idleAt = 0, alive = true, visible = true, auto = !reduceMotion();
  let anim = null, flipTo = null, last = 0;
  const pointers = new Map(); let pinch = null;
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const hit = e => {
    const r = canvas.getBoundingClientRect();
    ndc.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const h = ray.intersectObject(holder, true)[0];
    return h && h.object.userData.link ? h.object.userData.link : null;
  };
  const lim = (v, [a, b]) => Math.max(a, Math.min(b, v));
  const zoomTo = z => { if (sceneName === 'studio') S.setZoom(z); else { orbit.dist = lim(orbit.dist * z / (S._z || 1), DIST[sceneName]); S._z = z; placeOrbit(); } };
  const getZoom = () => sceneName === 'studio' ? S.getZoom() : (S._z || 1);
  const down = e => {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: getZoom() }; drag = null; return; }
    drag = { x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, moved: 0, type: e.pointerType }; vel = 0; pvel = 0; flipTo = null;
    if (e.pointerType === 'mouse') { canvas.setPointerCapture(e.pointerId); canvas.style.cursor = 'grabbing'; }
  };
  const move = e => {
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pointers.size === 2) { const [a, b] = [...pointers.values()]; zoomTo(pinch.z * pinch.d / Math.max(20, Math.hypot(a.x - b.x, a.y - b.y))); return; }
    if (drag) {
      const dx = e.clientX - drag.lx, dy = e.clientY - drag.ly; drag.lx = e.clientX; drag.ly = e.clientY; drag.moved += Math.abs(dx) + Math.abs(dy);
      if (sceneName === 'studio') {
        spin.rotation.y += dx * .012; vel = dx * .012;
        if (drag.type === 'mouse') { pitch.rotation.x = Math.max(-1.2, Math.min(1.2, pitch.rotation.x + dy * .01)); pvel = dy * .01; }
      } else {
        orbit.yaw -= dx * .008; vel = -dx * .008;
        if (drag.type === 'mouse') orbit.pitch = lim(orbit.pitch + dy * .006, PITCH[sceneName]);
        placeOrbit();
      }
    } else if (e.pointerType === 'mouse') canvas.style.cursor = hit(e) ? 'pointer' : 'grab';
  };
  const up = e => {
    pointers.delete(e.pointerId); if (pointers.size < 2) pinch = null;
    if (!drag) return;
    const tap = drag.moved < 6 && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 8;
    drag = null; idleAt = performance.now(); canvas.style.cursor = 'grab';
    if (tap && e.type === 'pointerup') { const link = hit(e); if (link && onSticker) onSticker(link); }
  };
  const wheel = e => {
    if (document.activeElement !== canvas && !e.ctrlKey) return;   // stránka sa dá rolovať, kým neklikneš na dosku
    e.preventDefault(); zoomTo(getZoom() * Math.exp(e.deltaY * .0012));
  };
  const key = e => {
    const k = e.key, st = sceneName === 'studio';
    if (k === 'ArrowLeft') st ? spin.rotation.y -= .25 : (orbit.yaw += .2, placeOrbit());
    else if (k === 'ArrowRight') st ? spin.rotation.y += .25 : (orbit.yaw -= .2, placeOrbit());
    else if (k === 'ArrowUp') st ? pitch.rotation.x = Math.max(-1.2, pitch.rotation.x - .2) : (orbit.pitch = lim(orbit.pitch + .1, PITCH[sceneName]), placeOrbit());
    else if (k === 'ArrowDown') st ? pitch.rotation.x = Math.min(1.2, pitch.rotation.x + .2) : (orbit.pitch = lim(orbit.pitch - .1, PITCH[sceneName]), placeOrbit());
    else if (k === 'f' || k === 'F') api.flip(); else if (k === 'k' || k === 'K') api.trick('kickflip'); else if (k === '+' || k === '=') api.zoomBy(.85); else if (k === '-') api.zoomBy(1.18);
    else return;
    e.preventDefault(); idleAt = performance.now();
  };
  canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', wheel, { passive: false });
  canvas.addEventListener('keydown', key);
  canvas.addEventListener('dblclick', () => api.flip());
  const io = new IntersectionObserver(([en]) => { visible = en.isIntersecting; }); io.observe(canvas);

  (function loop(now) {
    if (!alive) return;
    requestAnimationFrame(loop);
    const dt = Math.min(.05, (now - last) / 1000 || 0); last = now;
    if (!visible) return;
    const studio = sceneName === 'studio';
    const g = studio ? trick : rigTrick;
    if (anim) {
      const t = Math.min(1, (now - anim.t0) / anim.ms), e = t < .5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
      const pop = t < .22 ? t / .22 * .42 : t < .62 ? .42 - (t - .22) / .4 * .5 : -.08 + (t - .62) / .38 * .08;   // ollie: chvost dole, predok hore, vyrovnanie
      if (studio) anim.f(e, g);
      else if (anim.key === 'ollie') g.rotation.z = pop;
      else if (anim.key === 'kickflip') { g.rotation.x = e * Math.PI * 2; g.rotation.z = pop * .6; }
      else if (anim.key === 'impossible') g.rotation.z = e * Math.PI * 2;
      else { g.rotation.x = e * Math.PI * 2; g.rotation.y = e * Math.PI * 2; }
      g.position.y = Math.sin(t * Math.PI) * (studio ? .12 : anim.key === 'ollie' ? .22 : .3);
      if (t >= 1) { g.rotation.set(0, 0, 0); g.position.y = 0; anim = null; idleAt = now; }
    }
    if (studio) {
      if (!drag) {
        if (flipTo !== null) { const d = flipTo - spin.rotation.y; spin.rotation.y += d * .12; if (Math.abs(d) < .002) { spin.rotation.y = flipTo; flipTo = null; idleAt = now; } }
        else {
          vel *= .95; pvel *= .9;
          pitch.rotation.x = Math.max(-1.2, Math.min(1.2, pitch.rotation.x + pvel));
          if (now - idleAt > 2500) pitch.rotation.x *= .97;
          const a = auto ? .0035 : 0;
          if (Math.abs(vel) < a && now - idleAt > 2500) vel = a;
          spin.rotation.y += vel;
        }
      }
    } else {
      if (sceneName === 'ride' && !reduceMotion()) {
        const v = 2.1;   // m/s
        env.userData.groundTex.offset.x += dt * v * 24 / 32;   // zem uteká pod doskou
        env.userData.backTex.offset.x += dt * v * .25 * 3 / 18;
        for (const p of env.userData.props) { p.position.x -= dt * v; if (p.position.x < -8.5) p.position.x += 17; }
        rig.position.y = WHEEL_Y + Math.sin(now / 90) * .0015;
        if (!anim && auto && now > nextRideTrick) { api.trick(Math.random() < .6 ? 'ollie' : 'kickflip'); nextRideTrick = now + 7000 + Math.random() * 6000; }
      }
      if (sceneName === 'free' && !reduceMotion()) {
        rig.position.y = POSES.free.pos[1] + Math.sin(now / 800) * .035;
        if (auto && !drag) rig.rotation.y += dt * .35;
        const d = env.userData.dust; if (d) d.rotation.y += dt * .02;
      }
      if (!drag) {
        if (flipTo !== null) { const d = flipTo - orbit.yaw; orbit.yaw += d * .1; if (Math.abs(d) < .002) { orbit.yaw = flipTo; flipTo = null; idleAt = now; } placeOrbit(); }
        else { vel *= .94; const a = auto && sceneName === 'wall' ? .0016 : 0; if (Math.abs(vel) < a && now - idleAt > 2500) vel = a; if (vel) { orbit.yaw += vel; placeOrbit(); } }
      }
    }
    renderer.render(scene, camera);
  })(0);

  const api = () => {
    alive = false; ro.disconnect(); io.disconnect();
    if (env) envDisp.forEach(d => d.dispose());
    S.dispose(); renderer.dispose(); renderer.forceContextLoss();
  };
  Object.assign(api, {
    flip() { vel = 0; flipTo = (sceneName === 'studio' ? spin.rotation.y : orbit.yaw) + Math.PI; },
    trick(name) { const T = TRICKS[name] || (name === 'ollie' ? { name: 'Ollie', ms: 700 } : null); if (!T || anim || reduceMotion()) return; anim = { ...T, key: name, t0: performance.now() }; if (name === 'kickflip' && sceneName !== 'studio') anim.ms = 820; },
    reset() { vel = 0; pvel = 0; flipTo = null; if (sceneName === 'studio') { spin.rotation.y = -.45; pitch.rotation.x = 0; S.setZoom(1); } else { S._z = 1; setScene(sceneName); } idleAt = performance.now(); },
    zoomBy(f) { zoomTo(getZoom() * f); },
    setAuto(on) { auto = !!on && !reduceMotion(); if (!auto) vel = 0; },
    setLook(l) { curLook = lookOf(l); S.rebuild(curStickers, curLook); if (sceneName !== 'studio') shadowsOn(true); },
    setStickers(list) { curStickers = list; S.rebuild(curStickers, curLook); if (sceneName !== 'studio') shadowsOn(true); },
    setScene,
    scene: () => sceneName,
    snapshot: () => renderBoardImage(curStickers, { width: 900, height: 1200, look: curLook }),
  });
  setScene(startScene);
  return api;
}

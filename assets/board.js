import * as THREE from 'three';

const FONT = '"Archivo", system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

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
export const MAX_STICKERS = SLOTS.length;

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
  studio: 'Štúdio',
  roll: 'V pohybe',
  wall: 'Pri stene',
  ramp: 'Na rampe',
  ledge: 'Na ledgi',
};
const WHEEL_Y = .0805;   // výška stredu dosky nad zemou, keď stojí na kolieskach
function concreteTex(seams = true) {
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const x = c.getContext('2d');
  x.fillStyle = '#8f8a82'; x.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 26000; i++) { const g = 110 + Math.random() * 60; x.fillStyle = `rgba(${g},${g - 4},${g - 10},.5)`; x.fillRect(Math.random() * 512, Math.random() * 512, 1.6, 1.6); }
  for (let i = 0; i < 14; i++) { x.fillStyle = `rgba(40,36,32,${Math.random() * .08})`; x.beginPath(); x.arc(Math.random() * 512, Math.random() * 512, 30 + Math.random() * 90, 0, 7); x.fill(); }
  if (seams) { x.strokeStyle = 'rgba(40,36,32,.55)'; x.lineWidth = 3; x.strokeRect(0, 0, 512, 512); }
  return c;
}
function wallTex() {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 512;
  const x = c.getContext('2d');
  x.drawImage(concreteTex(false), 0, 0, 512, 512); x.drawImage(concreteTex(false), 512, 0, 512, 512);
  x.fillStyle = 'rgba(20,18,16,.25)'; x.fillRect(0, 0, 1024, 512);
  // tagy sprejom
  x.save(); x.translate(560, 250); x.rotate(-.08);
  x.font = '400 190px "Pirata One", "Anton", serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.lineWidth = 16; x.strokeStyle = 'rgba(14,13,12,.85)'; x.strokeText('GOSko', 0, 0);
  x.fillStyle = '#A01414'; x.fillText('GOSko', 0, 0);
  x.restore();
  if (GHOST) { x.save(); x.translate(860, 360); x.rotate(.2); x.globalAlpha = .9; x.drawImage(GHOST, -70, -80, 140, 158); x.restore(); }
  x.fillStyle = 'rgba(243,235,221,.75)'; x.font = '700 34px "IBM Plex Mono", monospace'; x.fillText('S.K.A.T.E.', 120, 430);
  for (let i = 0; i < 6; i++) { x.fillStyle = 'rgba(160,20,20,.7)'; x.fillRect(470 + i * 55 + Math.random() * 10, 330, 3, 20 + Math.random() * 60); }   // stekance
  return c;
}
function buildEnv(name, renderer, dispList) {
  const env = new THREE.Group();
  const tex = (cnv, rep = 1) => { const t = new THREE.CanvasTexture(cnv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep, rep); t.anisotropy = renderer.capabilities.getMaxAnisotropy(); dispList.push(t); return t; };
  const mat = o => { const m = new THREE.MeshStandardMaterial(o); dispList.push(m); return m; };
  const mesh = (g, m) => { const o = new THREE.Mesh(g, m); o.castShadow = o.receiveShadow = true; dispList.push(g); return o; };
  const groundTex = tex(concreteTex(), 6);
  const ground = mesh(new THREE.PlaneGeometry(12, 12), mat({ map: groundTex, roughness: .95 }));
  ground.rotation.x = -Math.PI / 2; env.add(ground);
  env.userData.groundTex = groundTex;
  const concrete = mat({ map: tex(concreteTex(false), 1), roughness: .9 });
  const steel = mat({ color: 0xc9ccd0, metalness: .6, roughness: .35 });
  if (name === 'wall') {
    const wall = mesh(new THREE.BoxGeometry(4, 1.6, .2), mat({ map: tex(wallTex(), 1), roughness: .9 }));
    wall.material.map.repeat.set(1, 1); wall.position.set(0, .8, -.45); env.add(wall);
  }
  if (name === 'ramp') {
    const sh = new THREE.Shape(), R = .55, W = .7, H = .6;
    sh.moveTo(0, 0); sh.lineTo(W, 0); sh.lineTo(W, H); sh.lineTo(W - .04, H); sh.absarc(W - .04 - R, H, R, 0, -Math.PI / 2, true); sh.lineTo(0, 0);
    const g = new THREE.ExtrudeGeometry(sh, { depth: 2.4, bevelEnabled: false, curveSegments: 28 }); g.translate(-W, 0, -1.2);
    const ramp = mesh(g, concrete); ramp.position.x = .55; env.add(ramp);
    const cop = mesh(new THREE.CylinderGeometry(.03, .03, 2.4, 14), steel); cop.rotation.x = Math.PI / 2; cop.position.set(.55 - .04, H, 0); env.add(cop);
    const deck = mesh(new THREE.BoxGeometry(.8, H, 2.4), concrete); deck.position.set(.55 + .4, H / 2, 0); env.add(deck);
  }
  if (name === 'ledge') {
    const ledge = mesh(new THREE.BoxGeometry(2.6, .32, .45), concrete); ledge.position.set(0, .16, 0); env.add(ledge);
    const edge = mesh(new THREE.BoxGeometry(2.6, .03, .03), steel); edge.position.set(0, .32, .225); env.add(edge);
  }
  if (name === 'roll') {
    for (const z of [-1.3, 1.3]) { const c = mesh(new THREE.BoxGeometry(12, .12, .2), concrete); c.position.set(0, .06, z); env.add(c); }
  }
  return env;
}
/* poloha dosky a kamery v scéne: pose = pozícia/otočenie dosky, cam = [yaw, pitch, dist], target */
const POSES = {
  roll: { pos: [0, WHEEL_Y, 0], rot: [0, 0, 0], cam: [.9, .18, 1.35], target: [0, .08, 0] },
  // opretá o stenu: dĺžka skoro zvislo, spodok s nálepkami k divákovi, grip k stene
  wall: { pos: [0, .39, -.23], lean: .3, cam: [.35, .14, 1.75], target: [0, .42, -.2] },
  // na hornej plošine rampy, chvost nad copingom
  ramp: { pos: [.84, .6 + WHEEL_Y, 0], rot: [0, 0, 0], cam: [.28, .22, 2.1], target: [.3, .38, 0] },
  ledge: { pos: [.1, .32 + WHEEL_Y, .05], rot: [0, .12, .06], cam: [.8, .32, 1.55], target: [0, .32, 0] },
};

/* Pripojí dosku na plátno. Vráti funkciu na upratanie, na ktorej sú aj ovládacie metódy:
   flip(), trick(name), reset(), zoomBy(f), setAuto(bool), setLook(look), setStickers(list), setScene(name). */
export async function mountBoard(canvas, { stickers = [], onSticker, look, deck, scene: startScene = 'studio' } = {}) {
  const logo = await loadLogo();
  const noop = () => {};
  if (!canvas.isConnected) return Object.assign(() => {}, { flip: noop, trick: noop, reset: noop, zoomBy: noop, setAuto: noop, setLook: noop, setStickers: noop, setScene: noop });
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  let curLook = lookOf(look || (deck ? { deck } : DEFAULT_LOOK)), curStickers = stickers;
  const S = makeBoardScene(stickers, logo, renderer, curLook);
  const { scene, camera, spin, pitch, trick, lean, mid, holder } = S;
  canvas.tabIndex = 0;

  /* scénický svet: vlastné svetlá, zem a rekvizity; doska sa doň presunie */
  const world = new THREE.Group(); world.visible = false; scene.add(world);
  const sun = new THREE.DirectionalLight(0xfff1dc, 2.6); sun.position.set(2, 3.2, 1.6); sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024); Object.assign(sun.shadow.camera, { left: -2, right: 2, top: 2, bottom: -2, near: .5, far: 10 }); sun.shadow.bias = -.0005;
  world.add(sun, new THREE.HemisphereLight(0xd8e4ff, 0x3a2f28, .9));
  const rig = new THREE.Group(), rigTrick = new THREE.Group(); rig.add(rigTrick); world.add(rig);
  let env = null, envDisp = [], sceneName = 'studio';
  const orbit = { yaw: 0, pitch: .2, dist: 1.6, target: new THREE.Vector3() };
  const shadowsOn = on => S.boardObj().traverse(o => { if (o.isMesh) { o.castShadow = on; o.receiveShadow = on; } });

  function setScene(name) {
    if (!SCENES[name]) name = 'studio';
    sceneName = name;
    if (env) { world.remove(env); envDisp.forEach(d => d.dispose()); envDisp = []; env = null; }
    if (name === 'studio') {
      mid.add(holder); holder.position.set(0, 0, 0); holder.rotation.set(0, 0, 0);
      world.visible = false; lean.visible = true; scene.fog = null; shadowsOn(false); resize(); return;
    }
    env = buildEnv(name, renderer, envDisp); world.add(env);
    const P = POSES[name];
    rigTrick.add(holder); holder.position.set(0, 0, 0); holder.rotation.set(0, 0, 0);
    rig.position.set(...P.pos);
    if (P.lean !== undefined) {
      const a = P.lean, m = new THREE.Matrix4().makeBasis(new THREE.Vector3(0, Math.cos(a), -Math.sin(a)), new THREE.Vector3(0, -Math.sin(a), -Math.cos(a)), new THREE.Vector3(-1, 0, 0));
      rig.setRotationFromMatrix(m);
    } else rig.rotation.set(...P.rot);
    [orbit.yaw, orbit.pitch, orbit.dist] = P.cam; orbit.target.set(...P.target);
    lean.visible = false; world.visible = true; shadowsOn(true);
    scene.fog = new THREE.Fog(0x0e0d0c, 3, 7.5);
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

  let vel = 0, pvel = 0, drag = null, idleAt = 0, alive = true, visible = true, auto = !reduceMotion;
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
  const zoomTo = z => { if (sceneName === 'studio') S.setZoom(z); else { orbit.dist = Math.max(.7, Math.min(3.2, orbit.dist * z / (S._z || 1))); S._z = z; placeOrbit(); } };
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
        if (drag.type === 'mouse') orbit.pitch = Math.max(.03, Math.min(1.2, orbit.pitch + dy * .006));
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
    else if (k === 'ArrowUp') st ? pitch.rotation.x = Math.max(-1.2, pitch.rotation.x - .2) : (orbit.pitch = Math.min(1.2, orbit.pitch + .1), placeOrbit());
    else if (k === 'ArrowDown') st ? pitch.rotation.x = Math.min(1.2, pitch.rotation.x + .2) : (orbit.pitch = Math.max(.03, orbit.pitch - .1), placeOrbit());
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
      if (studio) anim.f(e, g);
      else if (anim.key === 'kickflip') g.rotation.x = e * Math.PI * 2;
      else if (anim.key === 'impossible') g.rotation.z = e * Math.PI * 2;
      else { g.rotation.x = e * Math.PI * 2; g.rotation.y = e * Math.PI * 2; }
      g.position.y = Math.sin(t * Math.PI) * (studio ? .12 : .32);
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
      if (sceneName === 'roll' && !reduceMotion) {
        env.userData.groundTex.offset.x -= dt * .55;   // zem uteká pod doskou
        rig.position.y = WHEEL_Y + Math.sin(now / 90) * .0015;
      }
      if (!drag) {
        if (flipTo !== null) { const d = flipTo - orbit.yaw; orbit.yaw += d * .1; if (Math.abs(d) < .002) { orbit.yaw = flipTo; flipTo = null; idleAt = now; } placeOrbit(); }
        else { vel *= .94; const a = auto ? .0022 : 0; if (Math.abs(vel) < a && now - idleAt > 2500) vel = a; if (vel) { orbit.yaw += vel; placeOrbit(); } }
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
    trick(name) { const T = TRICKS[name]; if (!T || anim || reduceMotion) return; anim = { ...T, key: name, t0: performance.now() }; },
    reset() { vel = 0; pvel = 0; flipTo = null; if (sceneName === 'studio') { spin.rotation.y = -.45; pitch.rotation.x = 0; S.setZoom(1); } else { S._z = 1; setScene(sceneName); } idleAt = performance.now(); },
    zoomBy(f) { zoomTo(getZoom() * f); },
    setAuto(on) { auto = !!on && !reduceMotion; if (!auto) vel = 0; },
    setLook(l) { curLook = lookOf(l); S.rebuild(curStickers, curLook); if (sceneName !== 'studio') shadowsOn(true); },
    setStickers(list) { curStickers = list; S.rebuild(curStickers, curLook); if (sceneName !== 'studio') shadowsOn(true); },
    setScene,
    scene: () => sceneName,
    snapshot: () => renderBoardImage(curStickers, { width: 900, height: 1200, look: curLook }),
  });
  setScene(startScene);
  return api;
}

import * as THREE from 'three';

const FONT = '"Archivo", system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

let logoPromise = null;
export function loadLogo() {
  if (!logoPromise) {
    logoPromise = (async () => {
      await Promise.race([document.fonts.load(`900 60px ${FONT}`), new Promise(r => setTimeout(r, 1500))]).catch(() => {});
      const img = new Image(); img.src = 'img/logo.webp'; await img.decode(); return img;
    })();
  }
  return logoPromise;
}

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

function deckGraphic() {
  const c = document.createElement('canvas'); c.width = 2048; c.height = 540;
  const x = c.getContext('2d');
  x.fillStyle = '#F3EBDD'; x.fillRect(0, 0, c.width, c.height);
  for (const bx of [150, 1748]) {
    x.fillStyle = '#A01D21'; x.fillRect(bx, 0, 150, c.height);
    x.save(); x.translate(bx + 75, c.height / 2); x.rotate(Math.PI / 2);
    x.fillStyle = '#F3EBDD'; x.textAlign = 'center'; x.textBaseline = 'middle'; stretch(x, 'expanded');
    fit(x, 'GAME OF S.K.A.T.E.', 900, 470, 58); x.fillText('GAME OF S.K.A.T.E.', 0, 4); x.restore();
  }
  x.fillStyle = '#A01D21'; x.fillRect(320, 0, 14, c.height); x.fillRect(1714, 0, 14, c.height);
  return c;
}
function gripTexture() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 128;
  const x = c.getContext('2d'); x.fillStyle = '#1b1b1b'; x.fillRect(0, 0, 512, 128);
  for (let i = 0; i < 9000; i++) { const g = 30 + Math.random() * 60; x.fillStyle = `rgb(${g},${g},${g})`; x.fillRect(Math.random() * 512, Math.random() * 128, 1.2, 1.2); }
  return c;
}

const STEEL = new THREE.MeshStandardMaterial({ color: 0xc9ccd0, metalness: .55, roughness: .38 });
const RED = new THREE.MeshStandardMaterial({ color: 0xa01d21, roughness: .45, metalness: .15 });
const WHEEL = new THREE.MeshStandardMaterial({ color: 0xf3ebdd, roughness: .5 });
const bx = (w, h, d, m, x, y, z) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); return o; };
const cy = (r1, r2, h, m, s) => new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, s), m);

/* miesta na nálepky medzi podvozkami (x = dĺžka dosky, z = šírka) */
const SLOTS = [
  { x: .118, z: .028, r: -.14 }, { x: .012, z: -.03, r: .2 }, { x: -.1, z: .032, r: -.06 },
  { x: -.135, z: -.036, r: .12 }, { x: .1, z: -.042, r: .08 }, { x: -.02, z: .045, r: -.18 },
  { x: .15, z: -.01, r: .25 }, { x: -.06, z: -.005, r: -.22 },
];
export const MAX_STICKERS = SLOTS.length;

function buildBoard(stickers, logo, renderer) {
  const L = .8, W = .21, T = .013, NOSE = L / 2 - W / 2 * .95, FLAT = .26, N = 160, M = 14;
  const halfW = x => { const ax = Math.abs(x); if (ax <= NOSE) return W / 2; const t = Math.min(1, (ax - NOSE) / (L / 2 - NOSE)); return W / 2 * Math.sqrt(1 - t * t); };
  const lift = x => { const ax = Math.abs(x); if (ax <= FLAT) return 0; const t = ax - FLAT; return t * t * 3.2; };
  const aniso = renderer.capabilities.getMaxAnisotropy();
  const disposables = [];
  const tex = cnv => { const t = new THREE.CanvasTexture(cnv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = aniso; disposables.push(t); return t; };

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

  const board = new THREE.Group();
  const grip = tex(gripTexture()); grip.wrapS = grip.wrapT = THREE.RepeatWrapping; grip.repeat.set(3, 1);
  board.add(new THREE.Mesh(surface(1), new THREE.MeshStandardMaterial({ map: grip, roughness: .95 })));
  board.add(new THREE.Mesh(surface(-1), new THREE.MeshStandardMaterial({ map: tex(deckGraphic()), roughness: .55 })));
  board.add(new THREE.Mesh(sides(), new THREE.MeshStandardMaterial({ color: 0xd9b27a, roughness: .7 })));
  for (const tx of [-.235, .235]) {
    const t = new THREE.Group();
    t.add(bx(.07, .008, .056, STEEL, 0, -T / 2 - .004, 0), bx(.028, .03, .04, STEEL, 0, -T / 2 - .023, 0));
    const hanger = cy(.013, .019, .13, STEEL, 14); hanger.rotation.x = Math.PI / 2; hanger.position.set(0, -T / 2 - .043, 0); t.add(hanger);
    const axle = cy(.0045, .0045, .2, STEEL, 8); axle.rotation.x = Math.PI / 2; axle.position.set(0, -T / 2 - .047, 0); t.add(axle);
    for (const wz of [-.084, .084]) {
      const w = cy(.027, .027, .032, WHEEL, 32); w.rotation.x = Math.PI / 2; w.position.set(0, -T / 2 - .047, wz); t.add(w);
      const core = cy(.013, .013, .0335, RED, 20); core.rotation.x = Math.PI / 2; core.position.copy(w.position); t.add(core);
    }
    t.position.x = tx; board.add(t);
  }
  stickers.slice(0, SLOTS.length).forEach((spec, i) => {
    const s = SLOTS[i];
    const m = new THREE.Mesh(new THREE.PlaneGeometry(.098, .098), new THREE.MeshStandardMaterial({
      map: tex(stickerCanvas(spec, logo)), transparent: true, alphaTest: .08, roughness: .4,
    }));
    m.position.set(s.x, -T / 2 - .0011 - i * .0004, s.z);
    m.rotation.set(Math.PI / 2, 0, -Math.PI / 2 + s.r);
    m.userData.link = spec.link || null;
    board.add(m);
  });
  return { board, disposables };
}

/* Pripojí dosku na plátno. Vráti funkciu na upratanie. */
export async function mountBoard(canvas, { stickers = [], onSticker } = {}) {
  const logo = await loadLogo();
  if (!canvas.isConnected) return () => {};
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(30, 1, .01, 20);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x2a1a1a, 1.1));
  const key = new THREE.DirectionalLight(0xffffff, 2.3); key.position.set(1.6, 2, 3); scene.add(key);
  const rim = new THREE.DirectionalLight(0xff3b3b, 3.2); rim.position.set(-3, 1, -2.5); scene.add(rim);

  const { board, disposables } = buildBoard(stickers, logo, renderer);
  const mid = new THREE.Group(); mid.add(board); mid.rotation.z = Math.PI / 2;
  const face = new THREE.Group(); face.add(mid); face.rotation.y = -Math.PI / 2;
  const spin = new THREE.Group(); spin.add(face); spin.rotation.y = -.45;
  const lean = new THREE.Group(); lean.add(spin); scene.add(lean);

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight; if (!w || !h) return;
    renderer.setSize(w, h, false); camera.aspect = w / h;
    const tf = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const l = camera.aspect > .95 ? .45 : .09; lean.rotation.z = camera.aspect > .95 ? -l : l;
    const hh = .45 * Math.cos(l) + .14 * Math.sin(l), hw = .45 * Math.sin(l) + .15 * Math.cos(l);
    camera.position.set(0, 0, Math.max(hh / tf, hw / (tf * camera.aspect)) + .06);
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize); ro.observe(canvas); resize();

  let vel = 0, drag = null, idleAt = 0, alive = true, visible = true;
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const hit = e => {
    const r = canvas.getBoundingClientRect();
    ndc.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const h = ray.intersectObject(lean, true)[0];
    return h && h.object.userData.link ? h.object.userData.link : null;
  };
  const down = e => { drag = { x: e.clientX, y: e.clientY, last: e.clientX, moved: 0 }; vel = 0; };
  const move = e => {
    if (drag) { const dx = e.clientX - drag.last; drag.last = e.clientX; drag.moved += Math.abs(dx); spin.rotation.y += dx * .012; vel = dx * .012; }
    else if (e.pointerType === 'mouse') canvas.style.cursor = hit(e) ? 'pointer' : 'grab';
  };
  const up = e => {
    if (!drag) return;
    const tap = drag.moved < 6 && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 8;
    drag = null; idleAt = performance.now();
    if (tap && e.type === 'pointerup') { const link = hit(e); if (link && onSticker) onSticker(link); }
  };
  canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  const io = new IntersectionObserver(([en]) => { visible = en.isIntersecting; }); io.observe(canvas);

  (function loop(now) {
    if (!alive) return;
    requestAnimationFrame(loop);
    if (!visible) return;
    if (!drag) {
      vel *= .95;
      const auto = reduceMotion ? 0 : .0035;
      if (Math.abs(vel) < auto && now - idleAt > 2500) vel = auto;
      spin.rotation.y += vel;
    }
    renderer.render(scene, camera);
  })(0);

  return () => {
    alive = false; ro.disconnect(); io.disconnect();
    scene.traverse(o => { if (o.isMesh) { o.geometry.dispose(); if (o.material.map) o.material.map.dispose(); if (![STEEL, RED, WHEEL].includes(o.material)) o.material.dispose(); } });
    disposables.forEach(t => t.dispose());
    renderer.dispose(); renderer.forceContextLoss();
  };
}

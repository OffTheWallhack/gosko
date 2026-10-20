/* GOSko maskot: duch ako skutočný 3D model (kupola, telo, lem s nožičkami), tvár z loga ako nálepka,
   grimasy ako tvár v Doome, veci na hlavu, znak na tele, kamoš, scéna a efekty. Doska je z board.js (rovnaká ako v garáži).
   Nastavenie ducha = profiles.ghost (assets/ghost.js, ghostOf). API: mountMascot(canvas, { look, ghost, stickers, interactive }) */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { DecalGeometry } from 'three/addons/geometries/DecalGeometry.js';
import { makeBoardModel } from './board.js';
import { ghostOf, EYE_COLORS as EYES, HEADS as HEAD, EXTRAS as EXTRA, MARKS, FINISHES, EX, EMOTES, randomEmote, drawFace } from './ghost.js';

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const K = .31;   // mierka sveta ducha (hlava má polomer 1) na dosku z board.js (dĺžka .8)

/* Pripojí ducha na plátno. Vráti funkciu na upratanie s metódami trick(), emote(), setGhost(), setLook(). */
const toS = g => { const n = ghostOf(g); return { ...n, wear: n.scuff, board: { show: true, shoes: n.shoes, shoeColor: n.shoeColor, extra: n.boardExtra } }; };
export async function mountMascot(canvas, { look, ghost: ghostCfg, stickers = [], interactive = true, onScene = null, ps1 = false } = {}) {
  let S = toS(ghostCfg);
  const PS1_W = 176;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !ps1, alpha: true });
  renderer.setPixelRatio(ps1 ? 1 : Math.min(devicePixelRatio, 1.5)); renderer.setClearColor(0, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  const scene = new THREE.Scene();
  if (ps1) scene.fog = new THREE.Fog(0x0a0a10, 9 * K, 20 * K);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), .04).texture;
  const camera = new THREE.PerspectiveCamera(30, 1, .05, 30);
  const HOME = new THREE.Vector3(1.7, 1.2, 9.3).multiplyScalar(K);
  camera.position.copy(HOME);
  const controls = new OrbitControls(camera, canvas);
  controls.target.set(0, -.05 * K, 0); controls.enableDamping = true; controls.enablePan = false; controls.enableZoom = false; controls.enabled = interactive;
  controls.minPolarAngle = .5; controls.maxPolarAngle = 1.8; controls.rotateSpeed = .7;
  const hemi = new THREE.HemisphereLight(0xfff1e0, 0x2a1414, .9); scene.add(hemi);
  const key = new THREE.DirectionalLight(0xffffff, 2.1); key.position.set(3, 4, 5); scene.add(key);
  const rim = new THREE.DirectionalLight(0xff4a3a, 2.4); rim.position.set(-4, 1.5, -3.5); scene.add(rim);
  const fill = new THREE.DirectionalLight(0x9fc4ff, .5); fill.position.set(4, -1, -2); scene.add(fill);
  const world = new THREE.Group(); world.scale.setScalar(K); scene.add(world);
  const disposeTree = o => o.traverse(x => { x.geometry?.dispose(); if (x.material) [].concat(x.material).forEach(m => { m.map?.dispose(); m.dispose(); }); });

  /* tieň pod doskou */
  let shadow;
  {
    const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d');
    const g = x.createRadialGradient(128, 128, 0, 128, 128, 128); g.addColorStop(0, 'rgba(0,0,0,.55)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(0, 0, 256, 256);
    shadow = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 1.6), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2; shadow.position.y = -1.98; world.add(shadow);
  }

const PN = ps1 ? [9, 5, 3, 4] : [30, 18, 12, 14];
/* náhodné čísla so semienkom: každý duch má vlastné fľaky */
const rng = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };

/* ================= telo ducha =================
   Skutočný 3D tvar, nie vytlačené logo: kupola hlavy, telo so zaoblenými bokmi, spodný lem so 4 nožičkami vpredu
   (8 dookola), zaoblená hrana a vyklenutý spodok. Hlava má polomer 1, telo je spredu-dozadu trochu sploštené. */
const D = 1, NU = ps1 ? 28 : 160;   // okrúhly prierez: zhora je duch kruh, nie vajce
const hemY = th => { const L = Math.abs(Math.sin(4 * th)); return -1.0 - .26 * Math.pow(L, .5); };
function profile(th) {
  const pts = [], h = hemY(th), rho = .1;
  for (let i = 0; i <= PN[0]; i++) { const p = i / PN[0] * Math.PI / 2; pts.push([Math.sin(p), Math.cos(p)]); }
  for (let i = 1; i <= PN[1]; i++) { const t = i / PN[1], y = (h + rho) * t; pts.push([1 + .035 * t * t, y]); }   // plynulý prechod z hlavy do boku, bez zárezu pri očiach
  const r0 = pts[pts.length - 1][0];
  for (let i = 1; i <= PN[2]; i++) { const a = i / PN[2] * Math.PI; pts.push([r0 - rho + rho * Math.cos(a), h + rho - rho * Math.sin(a)]); }
  const rs = r0 - 2 * rho, ys = h + rho, yu = -.7;
  for (let i = 1; i <= PN[3]; i++) { const t = i / PN[3]; pts.push([rs * (1 - t), ys + (yu - ys) * (1 - (1 - t) * (1 - t))]); }
  return pts;
}
function buildBodyGeometry() {
  const cols = [], NS = profile(0).length;
  const pos = [], uv = [], theta = [];
  for (let i = 0; i <= NU; i++) {
    const th = -Math.PI / 2 + i / NU * Math.PI * 2, pr = profile(th);
    let len = 0; const lens = [0];
    for (let j = 1; j < pr.length; j++) { len += Math.hypot(pr[j][0] - pr[j - 1][0], pr[j][1] - pr[j - 1][1]); lens.push(len); }
    for (let j = 0; j < pr.length; j++) {
      const [r, y] = pr[j];
      pos.push(r * Math.cos(th), y, r * Math.sin(th) * D);
      uv.push(i / NU, 1 - lens[j] / 4.05); theta.push(th);
    }
  }
  const idx = [];
  for (let i = 0; i < NU; i++) for (let j = 0; j < NS - 1; j++) {
    const a = i * NS + j, b = (i + 1) * NS + j;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.userData = { NS, base: Float32Array.from(pos), theta: Float32Array.from(theta) };
  normals(g);
  return g;
}
/* normály + zlepenie švu vzadu, aby tam nebola hrana */
function normals(g) {
  g.computeVertexNormals();
  const n = g.attributes.normal.array, NS = g.userData.NS;
  for (let j = 0; j < NS; j++) {
    const a = j * 3, b = (NU * NS + j) * 3;
    for (let k = 0; k < 3; k++) { const m = (n[a + k] + n[b + k]) / 2; n[a + k] = n[b + k] = m; }
  }
  g.attributes.normal.needsUpdate = true;
}



/* textúra tela: farba, vzor, špina, ošúchanie, nálepky. U = dookola (stred predku je u=.5), V = zhora nadol */
const TW = ps1 ? 256 : 1024, TH = ps1 ? 128 : 512;
const colorCanvas = document.createElement('canvas'); colorCanvas.width = TW; colorCanvas.height = TH;
const roughCanvas = document.createElement('canvas'); roughCanvas.width = TW; roughCanvas.height = TH;
const colorTex = new THREE.CanvasTexture(colorCanvas); colorTex.colorSpace = THREE.SRGBColorSpace; colorTex.anisotropy = ps1 ? 1 : 4; if (ps1) { colorTex.minFilter = colorTex.magFilter = THREE.NearestFilter; colorTex.generateMipmaps = false; }
const roughTex = new THREE.CanvasTexture(roughCanvas);
/* plátna tela sa kreslia softvérovo (willReadFrequently): akcelerované plátno vie po prekreslení poslať do GPU starý obsah */
const CTX2D = { willReadFrequently: true };
const HEM_F = .66;   // kde je približne lem (podiel výšky textúry)
const shade = (hex, k) => { const c = new THREE.Color(hex); c.offsetHSL(0, 0, k); return '#' + c.getHexString(); };
function wrapDraw(x, w, fn) { fn(x); if (x - w < 0) fn(x + TW); if (x + w > TW) fn(x - TW); }
function paintBody() {
  const c = colorCanvas.getContext('2d', CTX2D), r = roughCanvas.getContext('2d', CTX2D), R = rng(S.seed);
  const baseRough = { vinyl: .32, mat: .78, chrome: .12, holo: .22, glow: .5 }[S.finish];
  c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
  c.fillStyle = S.color; c.fillRect(0, 0, TW, TH);
  r.fillStyle = gray(baseRough); r.fillRect(0, 0, TW, TH);
  // vzory
  if (S.pattern === 'stripe') { c.fillStyle = S.color2; c.fillRect(0, TH * .565, TW, TH * .06); c.fillStyle = shade(S.color2, .1); c.fillRect(0, TH * .55, TW, TH * .01); }
  if (S.pattern === 'split') { c.fillStyle = S.color2; c.fillRect(0, 0, TW, TH * .30); }
  if (S.pattern === 'spots') {
    const P = rng(S.seed * 7 + 3); c.fillStyle = S.color2;
    for (let i = 0; i < 26; i++) {
      const x = P() * TW, y = TH * (.08 + P() * .6), rad = 14 + P() * 34;
      if (Math.abs(x - TW / 2) < 120 && y > TH * .14 && y < TH * .45) continue;   // nechaj tvár voľnú
      wrapDraw(x, rad * 1.6, X => blob(c, X, y, rad, P));
    }
  }
  // ďalšie vzory
  if (S.pattern === 'checker') { const n = 16, cw = TW / n, chh = TH / 8; c.fillStyle = S.color2; for (let j = 0; j < 8; j++) for (let i = 0; i < n; i++) if ((i + j) % 2 === 0) c.fillRect(i * cw, j * chh, cw + .5, chh + .5); }
  if (S.pattern === 'hstripes') { c.fillStyle = S.color2; for (let y = TH * .12; y < TH * .9; y += TH * .12) c.fillRect(0, y, TW, TH * .055); }
  if (S.pattern === 'camo') { const P = rng(S.seed * 3 + 7), cols = [S.color2, shade(S.color2, -.14), shade(S.color, -.16)]; for (let i = 0; i < 70; i++) { c.fillStyle = cols[i % 3]; const x = P() * TW, y = P() * TH, r = 26 + P() * 50; wrapDraw(x, r * 1.8, X => blob(c, X, y, r, P)); } }
  if (S.pattern === 'tiedye') { const P = rng(S.seed * 5 + 1); for (let i = 0; i < 9; i++) { const x = P() * TW, y = P() * TH, r = 90 + P() * 160; wrapDraw(x, r, X => { const g = c.createRadialGradient(X, y, 0, X, y, r); g.addColorStop(0, i % 2 ? S.color2 : shade(S.color, .25)); g.addColorStop(.6, i % 2 ? shade(S.color2, .2) : S.color2); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.globalAlpha = .75; c.fillRect(X - r, y - r, r * 2, r * 2); c.globalAlpha = 1; }); } for (let i = 0; i < 14; i++) { c.strokeStyle = 'rgba(255,255,255,.35)'; c.lineWidth = 3; c.beginPath(); c.arc(TW * .5, TH * .45, 40 + i * 32, 0, 7); c.stroke(); } }
  if (S.pattern === 'leopard') { const P = rng(S.seed * 11 + 5); for (let i = 0; i < 90; i++) { const x = P() * TW, y = P() * TH, r = 12 + P() * 16; wrapDraw(x, r * 2, X => { c.fillStyle = shade(S.color2, -.35); c.beginPath(); c.ellipse(X, y, r * 1.5, r, P() * 3, 0, 7); c.fill(); c.fillStyle = S.color2; c.beginPath(); c.ellipse(X + 2, y + 1, r * 1.05, r * .68, 0, 0, 7); c.fill(); }); } }
  if (S.pattern === 'flames') { const P = rng(S.seed * 2 + 9), cols = [S.color2, shade(S.color2, .18), shade(S.color2, .4)], B = TH * (HEM_F + .06); cols.forEach((col, k) => { c.fillStyle = col; c.beginPath(); c.moveTo(0, TH); for (let x = 0; x <= TW; x += 24) { const hgt = TH * (.3 - k * .08) * (.55 + P() * .9); c.lineTo(x, B - hgt); c.lineTo(x + 12, B - hgt * .35); } c.lineTo(TW, TH); c.closePath(); c.fill(); }); }
  if (S.finish === 'holo') { const g = c.createLinearGradient(0, 0, TW, TH * .6); ['#ff6ad5', '#ffd36a', '#8aff9a', '#6ad5ff', '#b46aff', '#ff6ad5'].forEach((col, i, a) => g.addColorStop(i / (a.length - 1), col)); c.globalAlpha = .32; c.fillStyle = g; c.fillRect(0, 0, TW, TH); c.globalAlpha = 1; }
  // povrchy, ktoré majú vlastnú textúru (kreslia sa cez farbu tela)
  if (S.finish === 'wood') { const P = rng(31); c.globalAlpha = .55; for (let y = 0; y < TH; y += 3) { c.fillStyle = P() < .5 ? 'rgba(120,80,40,.5)' : 'rgba(230,200,150,.4)'; const w = 1 + P() * 3; c.fillRect(0, y + Math.sin(y * .05) * 4, TW, w); } c.globalAlpha = 1; for (let i = 0; i < 3; i++) { const x = P() * TW, y = TH * (.3 + P() * .5); c.strokeStyle = 'rgba(80,50,20,.55)'; for (let r = 8; r < 70; r += 9) { c.lineWidth = 2; c.beginPath(); c.ellipse(x, y, r * 2.6, r, 0, 0, 7); c.stroke(); } } }
  if (S.finish === 'carbon') { for (let y = 0; y < TH; y += 8) for (let x = 0; x < TW; x += 8) { const k = ((x / 8 + y / 8) % 2); c.fillStyle = k ? 'rgba(0,0,0,.45)' : 'rgba(255,255,255,.08)'; c.fillRect(x, y, 8, 8); c.fillStyle = 'rgba(0,0,0,.3)'; c.fillRect(x + (k ? 0 : 4), y, 1, 8); } }
  if (S.finish === 'marble') { const P = rng(77); c.globalAlpha = .9; c.fillStyle = '#efece6'; c.fillRect(0, 0, TW, TH); c.globalAlpha = 1; for (let i = 0; i < 18; i++) { c.strokeStyle = `rgba(${80 + P() * 60 | 0},${80 + P() * 60 | 0},${90 + P() * 60 | 0},${.25 + P() * .4})`; c.lineWidth = 1 + P() * 3; c.beginPath(); let x = P() * TW, y = P() * TH; c.moveTo(x, y); for (let k = 0; k < 12; k++) { x += (P() - .5) * 140; y += (P() - .5) * 90; c.lineTo(x, y); } c.stroke(); } }
  if (S.finish === 'concrete') { const P = rng(19); for (let i = 0; i < 14000; i++) { const x = P() * TW, y = P() * TH, v = P(); c.fillStyle = v < .5 ? 'rgba(0,0,0,.18)' : 'rgba(255,255,255,.14)'; c.fillRect(x, y, 1 + P() * 2, 1 + P() * 2); } for (let i = 0; i < 40; i++) { c.fillStyle = 'rgba(0,0,0,.22)'; c.beginPath(); c.arc(P() * TW, P() * TH, 2 + P() * 5, 0, 7); c.fill(); } }
  // špina: prach odspodu, fľaky, šmuhy od gripu
  const d = S.dirt / 100;
  if (d > 0) {
    let g = c.createLinearGradient(0, TH * .30, 0, TH);
    g.addColorStop(0, 'rgba(70,58,44,0)'); g.addColorStop(.42, `rgba(70,58,44,${.35 * d})`); g.addColorStop(.6, `rgba(40,33,26,${.7 * d})`); g.addColorStop(1, `rgba(25,20,16,${.85 * d})`);
    c.fillStyle = g; c.fillRect(0, 0, TW, TH);
    for (let i = 0; i < 1800 * d; i++) {
      const y = TH * Math.pow(R(), .55), x = R() * TW, s = .6 + R() * 2.2;
      c.fillStyle = `rgba(${40 + R() * 40 | 0},${32 + R() * 30 | 0},${22 + R() * 20 | 0},${(.15 + R() * .45) * d})`;
      c.fillRect(x, y, s, s);
    }
    for (let i = 0; i < 14 * d; i++) {   // šmuhy
      const x = R() * TW, y = TH * (.2 + R() * .55), rad = 20 + R() * 50;
      if (Math.abs(x - TW / 2) < 100 && y < TH * .46) continue;
      wrapDraw(x, rad, X => { const gg = c.createRadialGradient(X, y, 0, X, y, rad); gg.addColorStop(0, `rgba(20,18,16,${.35 * d})`); gg.addColorStop(1, 'rgba(20,18,16,0)'); c.fillStyle = gg; c.fillRect(X - rad, y - rad, rad * 2, rad * 2); });
    }
    let rg = r.createLinearGradient(0, TH * .3, 0, TH); rg.addColorStop(0, 'rgba(255,255,255,0)'); rg.addColorStop(1, `rgba(255,255,255,${.6 * d})`);
    r.fillStyle = rg; r.fillRect(0, 0, TW, TH);
  }
  // ošúchanie: odreté miesta (podklad presvitá), škrabance hlavne na lemoch, kde to „grinduje“
  const w = S.wear / 100;
  if (w > 0) {
    const under = new THREE.Color(S.color).getHSL({}).l > .55 ? 'rgba(120,112,100,.55)' : 'rgba(205,196,182,.6)';
    for (let i = 0; i < 45 * w; i++) {
      const lip = R() < .55, y = lip ? TH * (HEM_F - .05 + R() * .1) : TH * (.1 + R() * .5), x = R() * TW, rad = 3 + R() * (lip ? 14 : 8);
      if (!lip && Math.abs(x - TW / 2) < 110 && y > TH * .12 && y < TH * .47) continue;
      wrapDraw(x, rad * 1.6, X => { c.fillStyle = under; chip(c, X, y, rad, R); r.fillStyle = gray(.85); chip(r, X, y, rad, rng(i * 13 + S.seed)); });
    }
    c.lineCap = 'round';
    for (let i = 0; i < 260 * w; i++) {
      const lip = R() < .5, x = R() * TW, y = lip ? TH * (HEM_F - .07 + R() * .12) : TH * (.05 + R() * .6);
      const ang = (R() - .5) * .9, len = 6 + R() * (lip ? 46 : 24);
      c.strokeStyle = R() < .6 ? `rgba(255,252,245,${.25 + R() * .45})` : `rgba(30,26,22,${.2 + R() * .4})`;
      c.lineWidth = .6 + R() * 1.4;
      wrapDraw(x, len, X => { c.beginPath(); c.moveTo(X, y); c.lineTo(X + Math.cos(ang) * len, y + Math.sin(ang) * len); c.stroke(); });
    }
  }
  if (S.stickers) drawStickers(c, R);
  // znak na tele (tetovanie), vľavo dole na predku; kreslí sa pred špinou, takže sa ošúcha s telom
  if (S.mark !== 'none') {
    const cell = TW / 93, ox = TW * .36, oy = TH * .50; c.fillStyle = S.markColor; c.globalAlpha = .92;
    c.save(); c.translate(ox + TW * .078, 0); c.scale(-1, 1);   // textúra je na tele zrkadlovo, preto sa znak kreslí prevrátený
    const artM = MARKS[S.mark].art || null, txt = S.mark === 'number' ? String(S.seed).padStart(4, '0') : S.mark === 'initials' ? S.initials : MARKS[S.mark].text || '';
    if (!artM) { c.restore(); c.save(); c.translate(TW * .49, 0); c.scale(-1, 1); c.font = Math.round(TW / (txt.length > 3 ? 16 : 12.5)) + 'px Anton, Impact, sans-serif'; c.textAlign = 'left'; c.fillText(txt, 0, oy + TH / 7.75); }
    else artM.forEach((row, y) => [...row].forEach((ch, x) => { if (ch === '#') c.fillRect(x * cell, oy + y * cell, cell + .5, cell + .5); }));
    c.restore(); c.globalAlpha = 1;
  }
  colorTex.needsUpdate = true; roughTex.needsUpdate = true;
}
const gray = v => { const k = Math.round(Math.max(0, Math.min(1, v)) * 255); return `rgb(${k},${k},${k})`; };
function blob(c, x, y, rad, P) { c.beginPath(); const n = 9; for (let i = 0; i <= n; i++) { const a = i / n * Math.PI * 2, rr = rad * (.75 + P() * .45); const px = x + Math.cos(a) * rr * 1.5, py = y + Math.sin(a) * rr; i ? c.lineTo(px, py) : c.moveTo(px, py); } c.closePath(); c.fill(); }
function chip(c, x, y, rad, R) { c.beginPath(); const n = 8; for (let i = 0; i <= n; i++) { const a = i / n * Math.PI * 2, rr = rad * (.4 + R() * .8); const px = x + Math.cos(a) * rr * 1.6, py = y + Math.sin(a) * rr; i ? c.lineTo(px, py) : c.moveTo(px, py); } c.closePath(); c.fill(); }
function drawStickers(c, R) {
  const list = [['GOSKO', 'BRATISLAVA', '#A01414', '#F3EBDD'], ['GOSKO 2', 'ŽILINA', '#151312', '#F3EBDD'], ['GOSKO 3', 'BA WINTER', '#F3EBDD', '#A01414'], ['FOUNDER', '2026', '#c4adff', '#151312']];
  const spots = [[.2, .42], [.8, .38], [.03, .3], [.68, .55]];
  list.forEach(([t, s, bg, fg], i) => {
    const [u, v] = spots[i]; const x = u * TW, y = v * TH, ang = (R() - .5) * .5, w = TW / 8.5, h = TH / 8.8, k = TW / 1024;
    wrapDraw(x, w, X => {
      c.save(); c.translate(X, y); c.rotate(ang);
      c.fillStyle = 'rgba(0,0,0,.25)'; rr(c, -w / 2 + 2 * k, -h / 2 + 3 * k, w, h, 10 * k); c.fill();
      c.fillStyle = bg; rr(c, -w / 2, -h / 2, w, h, 10 * k); c.fill();
      c.strokeStyle = fg; c.lineWidth = 2 * k; rr(c, -w / 2 + 5 * k, -h / 2 + 5 * k, w - 10 * k, h - 10 * k, 7 * k); c.stroke();
      c.fillStyle = fg; c.textAlign = 'center'; c.font = Math.round(28 * k) + 'px Anton, Impact, sans-serif'; c.fillText(t, 0, 6 * k);
      c.font = '700 ' + Math.round(11 * k) + 'px "IBM Plex Mono", monospace'; c.fillText(s, 0, 21 * k);
      // ošúchaný roh nálepky
      c.fillStyle = 'rgba(255,255,255,.35)'; c.beginPath(); c.moveTo(w / 2 - 18 * k, -h / 2); c.lineTo(w / 2, -h / 2); c.lineTo(w / 2, -h / 2 + 16 * k); c.fill();
      c.restore();
    });
  });
}
function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }

function bodyMaterial() {
  const f = S.finish, m = new THREE.MeshPhysicalMaterial({ map: colorTex, roughnessMap: roughTex, roughness: 1, envMapIntensity: .7 });
  if (f === 'vinyl') { m.clearcoat = .7; m.clearcoatRoughness = .18; m.sheen = .2; }
  if (f === 'mat') { m.sheen = .6; m.sheenRoughness = .8; m.sheenColor = new THREE.Color(0xffffff); m.envMapIntensity = .35; }
  if (f === 'chrome') { m.metalness = .9; m.envMapIntensity = 1.8; m.clearcoat = .4; }
  if (f === 'holo') { m.iridescence = 1; m.iridescenceIOR = 1.7; m.iridescenceThicknessRange = [160, 900]; m.clearcoat = 1; m.clearcoatRoughness = .1; m.metalness = .15; m.envMapIntensity = 1.1; }
  if (f === 'glow') { m.emissive = new THREE.Color(S.color); m.emissiveMap = colorTex; m.emissiveIntensity = .38; m.envMapIntensity = .3; }
  if (f === 'concrete') { m.roughness = 1; m.envMapIntensity = .2; }
  if (f === 'wood') { m.clearcoat = .35; m.clearcoatRoughness = .4; m.envMapIntensity = .5; }
  if (f === 'translucent') { m.roughness = .12; m.transparent = true; m.opacity = .58; m.clearcoat = 1; m.clearcoatRoughness = .08; m.envMapIntensity = 1.3; m.depthWrite = false; }
  if (f === 'carbon') { m.clearcoat = 1; m.clearcoatRoughness = .25; m.metalness = .2; m.envMapIntensity = .9; }
  if (f === 'marble') { m.clearcoat = .9; m.clearcoatRoughness = .12; m.envMapIntensity = .9; }
  if (f === 'gold') { m.metalness = .85; m.roughness = .3; m.color = new THREE.Color(0xffc83a); m.envMapIntensity = 3.2; m.map = null; m.roughnessMap = null; m.emissive = new THREE.Color(0x7a5200); m.emissiveIntensity = .7; m.clearcoat = 1; m.clearcoatRoughness = .15; }
  return m;
}



  /* tvár: oči a úsmev z loga (ghost.js), premietnuté na predok ako nálepka; výraz sa mení prekreslením plátna */
  const FW = ps1 ? 192 : 1024, FH = ps1 ? 146 : 780;
  const faceCanvas = document.createElement('canvas'); faceCanvas.width = FW; faceCanvas.height = FH;
  const alphaCanvas = document.createElement('canvas'); alphaCanvas.width = FW; alphaCanvas.height = FH;
  const faceTex = new THREE.CanvasTexture(faceCanvas); faceTex.colorSpace = THREE.SRGBColorSpace; faceTex.anisotropy = ps1 ? 1 : 8;
  const alphaTex = new THREE.CanvasTexture(alphaCanvas); alphaTex.anisotropy = ps1 ? 1 : 8;
  if (ps1) [faceTex, alphaTex].forEach(tx => { tx.minFilter = tx.magFilter = THREE.NearestFilter; tx.generateMipmaps = false; });
  const FACE_W = 1.45, FACE_H = 1.15, FACE_Y = -.17;
  let faceExpr = 'idle';
  function paintFace(expr) {
    if (expr) faceExpr = expr;
    [[faceCanvas, false], [alphaCanvas, true]].forEach(([cv, alpha]) => {
      const c = cv.getContext('2d', CTX2D); c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, FW, FH);
      if (alpha) { c.fillStyle = '#000'; c.fillRect(0, 0, FW, FH); }
      const k = FW / (FACE_W * 231); c.setTransform(k, 0, 0, k, -(400 - FACE_W * 231 / 2) * k, -(458 - FACE_Y * 231 - FACE_H * 231 / 2) * k);
      drawFace(c, S, faceExpr, alpha);
    });
    faceTex.needsUpdate = true; alphaTex.needsUpdate = true;
  }

  /* model */
  const rig = new THREE.Group(); world.add(rig);
  const ghost = new THREE.Group(); rig.add(ghost);
  const bodyGeo = buildBodyGeometry();
  const body = new THREE.Mesh(bodyGeo, bodyMaterial()); ghost.add(body);
  const outlineMat = new THREE.MeshBasicMaterial({ color: 0x0e0d0c, side: THREE.BackSide });
  outlineMat.onBeforeCompile = sh => { sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed += normal * 0.045;'); };
  const outline = new THREE.Mesh(bodyGeo, outlineMat); ghost.add(outline);
  const faceMat = new THREE.MeshStandardMaterial({ map: faceTex, alphaMap: alphaTex, transparent: true, color: 0xffffff, roughness: .3, metalness: .1, bumpMap: alphaTex, bumpScale: -1.5, polygonOffset: true, polygonOffsetFactor: -4, depthWrite: false });
  body.updateMatrixWorld(true);
  const face = new THREE.Mesh(new DecalGeometry(body, new THREE.Vector3(0, FACE_Y, D), new THREE.Euler(0, 0, 0), new THREE.Vector3(FACE_W, FACE_H, 1.1)), faceMat); ghost.add(face);
  ghost.position.y = .2;
  const items = new THREE.Group(); ghost.add(items);
const stickerTex2 = (bg, txt, fg) => { const cv = document.createElement('canvas'); cv.width = 128; cv.height = 64; const x = cv.getContext('2d'); x.fillStyle = bg; x.fillRect(0, 0, 128, 64); x.fillStyle = fg; x.textAlign = 'center'; x.font = '36px Anton, Impact, sans-serif'; x.fillText(txt, 64, 46); const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t; };
const std = (color, o = {}) => new THREE.MeshPhysicalMaterial({ color, roughness: .55, ...o });
const gold = () => std(0xe2b53c, { metalness: 1, roughness: .2, envMapIntensity: 1.3 });
function knitTex(color) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64; const x = c.getContext('2d');
  x.fillStyle = color; x.fillRect(0, 0, 256, 64);
  for (let i = 0; i < 256; i += 8) { x.fillStyle = 'rgba(0,0,0,.22)'; x.fillRect(i, 0, 3, 64); x.fillStyle = 'rgba(255,255,255,.08)'; x.fillRect(i + 4, 0, 2, 64); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.repeat.x = 6; return t;
}
function bandanaTex(color) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 64; const x = c.getContext('2d');
  x.fillStyle = color; x.fillRect(0, 0, 512, 64); x.fillStyle = 'rgba(255,255,255,.85)';
  for (let i = 0; i < 512; i += 32) for (let j = 8; j < 64; j += 24) { x.beginPath(); x.arc(i + (j % 48 ? 16 : 0), j, 3.5, 0, 7); x.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.repeat.x = 3; return t;
}
function buildItems() {
  disposeTree(items); items.clear();
  const head = new THREE.Group(); head.scale.set(1, 1, D); items.add(head);   // hlava je sploštená ako telo
  const hc = S.headColor, xc = S.extraColor;
  if (S.head === 'beanie') {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(1.06, 64, 24, 0, Math.PI * 2, 0, Math.PI * .38), std(0xffffff, { map: knitTex(hc), roughness: .9, sheen: 1, sheenColor: new THREE.Color(hc) }));
    head.add(cap);
    const cuff = new THREE.Mesh(new THREE.TorusGeometry(.95, .11, 16, 80), std(0xffffff, { map: knitTex(shade(hc, -.06)), roughness: .9 }));
    cuff.rotation.x = Math.PI / 2; cuff.position.y = .38; cuff.scale.set(1, 1, 1.5); head.add(cuff);
    const pg = new THREE.IcosahedronGeometry(.24, 3), p = pg.attributes.position; const R = rng(7);
    for (let i = 0; i < p.count; i++) { const v = new THREE.Vector3().fromBufferAttribute(p, i); v.multiplyScalar(1 + (R() - .5) * .18); p.setXYZ(i, v.x, v.y, v.z); }
    pg.computeVertexNormals();
    const pom = new THREE.Mesh(pg, std(S.color === '#F3EBDD' ? 0xf3ebdd : 0xffffff, { roughness: 1, sheen: 1 })); pom.position.y = 1.22; head.add(pom);
  }
  if (S.head === 'cap') {
    const m = std(hc, { roughness: .7, sheen: .5 });
    head.add(new THREE.Mesh(new THREE.SphereGeometry(1.04, 64, 24, 0, Math.PI * 2, 0, Math.PI * .42), m));
    const sh = new THREE.Shape(); sh.absellipse(0, 0, .62, .5, 0, Math.PI * 2);
    const brim = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: .04, bevelEnabled: true, bevelThickness: .02, bevelSize: .02, bevelSegments: 3 }), std(shade(hc, -.08), { roughness: .7 }));
    brim.rotation.x = Math.PI / 2 - .12; brim.position.set(0, .3, -1.25); head.add(brim);
    const btn = new THREE.Mesh(new THREE.SphereGeometry(.07, 16, 8), m); btn.position.y = 1.04; head.add(btn);
    const band = new THREE.Mesh(new THREE.TorusGeometry(.93, .035, 8, 64), std(0x111111)); band.rotation.x = Math.PI / 2; band.position.y = .35; head.add(band);
  }
  if (S.head === 'bandana') {
    const t = bandanaTex(hc), m = std(0xffffff, { map: t, roughness: .8, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(.93, .985, .26, 80, 1, true), m); ring.position.y = .42; ring.rotation.z = .08; head.add(ring);
    const knot = new THREE.Mesh(new THREE.SphereGeometry(.12, 16, 12), m); knot.position.set(0, .44, -.98); head.add(knot);
    [-1, 1].forEach(s => { const tail = new THREE.Mesh(new THREE.BoxGeometry(.16, .5, .03), m); tail.position.set(s * .14, .2, -1.04); tail.rotation.z = s * .35; tail.rotation.x = .3; head.add(tail); });
  }
  if (S.head === 'horns') {
    const m = std(0xb3121a, { roughness: .35, clearcoat: .6 });
    [-1, 1].forEach(s => {
      const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(s * .15, .32, 0), new THREE.Vector3(s * .02, .52, .08));
      const g = new THREE.TubeGeometry(curve, 24, .13, 16, false), p = g.attributes.position;
      // zúženie do špičky
      for (let i = 0; i < p.count; i++) { const ring = Math.floor(i / 17) / 24, c = curve.getPoint(ring), v = new THREE.Vector3().fromBufferAttribute(p, i).sub(c).multiplyScalar(1 - ring * .92).add(c); p.setXYZ(i, v.x, v.y, v.z); }
      g.computeVertexNormals();
      const h = new THREE.Mesh(g, m); h.position.set(s * .5, .82, .1); h.rotation.z = -s * .35; head.add(h);
    });
  }
  if (S.head === 'crown') {
    const m = gold(), cr = new THREE.Group();
    cr.add(new THREE.Mesh(new THREE.CylinderGeometry(.5, .52, .2, 48, 1, true), m));
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * Math.PI * 2, sp = new THREE.Mesh(new THREE.ConeGeometry(.11, .28, 12), m); sp.position.set(Math.cos(a) * .5, .23, Math.sin(a) * .5); cr.add(sp);
      const gem = new THREE.Mesh(new THREE.SphereGeometry(.045, 12, 8), std(i % 2 ? 0xa01414 : 0x2d6cc0, { roughness: .1, clearcoat: 1 })); gem.position.set(Math.cos(a) * .53, 0, Math.sin(a) * .53); cr.add(gem);
    }
    cr.position.set(.12, .97, 0); cr.rotation.z = -.22; head.add(cr);
  }
  if (S.extra === 'headphones') {
    const m = std(xc, { roughness: .4, clearcoat: .5 }), pad = std(0x151312, { roughness: .9 });
    const arc = new THREE.Mesh(new THREE.TorusGeometry(1.1, .055, 12, 64, Math.PI), m); arc.position.y = .12; arc.rotation.y = 0; head.add(arc);
    [-1, 1].forEach(s => { const cup = new THREE.Mesh(new THREE.CylinderGeometry(.3, .3, .22, 32), m); cup.rotation.z = Math.PI / 2; cup.position.set(s * 1.06, .12, 0); head.add(cup);
      const cushion = new THREE.Mesh(new THREE.TorusGeometry(.22, .07, 10, 32), pad); cushion.rotation.y = Math.PI / 2; cushion.position.set(s * .95, .12, 0); head.add(cushion); });
  }
  if (S.extra === 'halo') {
    const halo = new THREE.Mesh(new THREE.TorusGeometry(.55, .06, 16, 64), std(0xffe28a, { metalness: .6, roughness: .2, emissive: new THREE.Color(0xffc94a), emissiveIntensity: 1.2 }));
    halo.rotation.x = Math.PI / 2 - .25; halo.position.y = 1.45; halo.name = 'halo'; items.add(halo);
  }
  /* ---- ďalšie veci na hlavu ---- */
  const dome = (r, h, m, top = 0) => { const g = new THREE.SphereGeometry(r, 64, 24, 0, Math.PI * 2, 0, h); return new THREE.Mesh(g, m); };
  const brim = (m, w = .62, l = .5, y = .3, z = 1.25, rotX = Math.PI / 2 - .12) => { const sh = new THREE.Shape(); sh.absellipse(0, 0, w, l, 0, Math.PI * 2); const b = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: .04, bevelEnabled: true, bevelThickness: .02, bevelSize: .02, bevelSegments: 3 }), m); b.rotation.x = rotX; b.position.set(0, y, z); return b; };
  const stickerTex = (bg, txt, fg) => { const cv = document.createElement('canvas'); cv.width = 128; cv.height = 64; const x = cv.getContext('2d'); x.fillStyle = bg; rr(x, 2, 2, 124, 60, 10); x.fill(); x.fillStyle = fg; x.textAlign = 'center'; x.font = '34px Anton, Impact, sans-serif'; x.fillText(txt, 64, 44); const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t; };
  if (S.head === 'snapback') {
    const m = std(hc, { roughness: .7, sheen: .5 });
    head.add(dome(1.04, Math.PI * .42, m));
    const b = brim(std(shade(hc, -.08), { roughness: .7 }), .6, .52, .3, 1.3, Math.PI / 2 - .05); head.add(b);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(.5, .32, .04), std(0xf3ebdd, { map: stickerTex('#f3ebdd', 'GOS', '#a01414'), roughness: .7 })); panel.position.set(0, .42, 1.0); panel.rotation.x = -.3; head.add(panel);
    const band = new THREE.Mesh(new THREE.TorusGeometry(.95, .03, 8, 64), std(0x111111)); band.rotation.x = Math.PI / 2; band.position.y = .34; head.add(band);
  }
  if (S.head === 'fivepanel') {
    const m = std(hc, { roughness: .85 });
    const top = new THREE.Mesh(new THREE.CylinderGeometry(.98, 1.03, .34, 48), m); top.position.y = .62; head.add(top);
    const lid = new THREE.Mesh(new THREE.CircleGeometry(.98, 48), m); lid.rotation.x = -Math.PI / 2; lid.position.y = .79; head.add(lid);
    head.add(brim(std(shade(hc, -.1)), .58, .42, .5, 1.3, Math.PI / 2 - .02));
    const strap = new THREE.Mesh(new THREE.BoxGeometry(.2, .06, .03), std(0x222222)); strap.position.set(0, .5, -1.02); head.add(strap);
  }
  if (S.head === 'helmet') {
    const m = std(hc, { roughness: .25, clearcoat: .8 });
    const sh = dome(1.1, Math.PI * .46, m); sh.position.y = .3; head.add(sh);
    const rimm = new THREE.Mesh(new THREE.TorusGeometry(1.1, .05, 10, 64), std(0x111111, { roughness: .8 })); rimm.rotation.x = Math.PI / 2; rimm.position.y = .36; head.add(rimm);
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + .3; const v = new THREE.Mesh(new THREE.BoxGeometry(.1, .18, .03), std(0x111111)); v.position.set(Math.cos(a) * .72, 1.05, Math.sin(a) * .72); v.lookAt(0, 0, 0); head.add(v); }
    [['#f3ebdd', 'GOSKO', '#a01414', -.9, .35], ['#a01414', 'BA', '#f3ebdd', .4, .7], ['#151312', 'ŽILINA', '#f3ebdd', 1.9, .55]].forEach(([bg, t, fg, a, y]) => { const s = new THREE.Mesh(new THREE.PlaneGeometry(.42, .21), std(0xffffff, { map: stickerTex(bg, t, fg), roughness: .6 })); s.position.set(Math.sin(a) * 1.11, y + .3, Math.cos(a) * 1.11); s.lookAt(Math.sin(a) * 3, y + .3, Math.cos(a) * 3); head.add(s); });
    [-1, 1].forEach(s => { const strapL = new THREE.Mesh(new THREE.BoxGeometry(.05, .5, .02), std(0x111111)); strapL.position.set(s * .98, .05, .35); strapL.rotation.z = s * .25; head.add(strapL); });
  }
  if (S.head === 'headband') { const hb = new THREE.Mesh(new THREE.TorusGeometry(1.01, .09, 12, 64), std(0xffffff, { map: knitTex(hc), roughness: 1, sheen: 1 })); hb.rotation.x = Math.PI / 2; hb.position.y = .42; hb.scale.set(1, 1, .9); head.add(hb); }
  if (S.head === 'bucket') {
    const m = std(hc, { roughness: .9, sheen: .4 });
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(.9, 1.02, .5, 48, 1, true), m); crown.position.y = .62; head.add(crown);
    const lid = new THREE.Mesh(new THREE.CircleGeometry(.9, 48), m); lid.rotation.x = -Math.PI / 2; lid.position.y = .87; head.add(lid);
    const bb = new THREE.Mesh(new THREE.CylinderGeometry(1.45, 1.1, .3, 48, 1, true), std(shade(hc, -.06), { roughness: .9, side: THREE.DoubleSide })); bb.position.y = .25; head.add(bb);
    const seam = new THREE.Mesh(new THREE.TorusGeometry(1.0, .02, 6, 64), std(shade(hc, -.25))); seam.rotation.x = Math.PI / 2; seam.position.y = .5; head.add(seam);
  }
  if (S.head === 'trucker') {
    const front = std(hc, { roughness: .9 }), meshM = std(0xf3ebdd, { roughness: .9, transparent: true, opacity: .75 });
    head.add(dome(1.05, Math.PI * .4, meshM));
    const fr = new THREE.Mesh(new THREE.SphereGeometry(1.07, 64, 24, Math.PI * .5 - 1.0, 2.0, 0, Math.PI * .4), front); head.add(fr);
    head.add(brim(std(shade(hc, -.1)), .6, .48, .3, 1.3, Math.PI / 2 - .12));
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(.55, .3), std(0xffffff, { map: stickerTex('#ffffff', 'GOSKO', '#151312') })); panel.position.set(0, .62, 1.0); panel.rotation.x = -.45; head.add(panel);
  }
  if (S.head === 'hood') {
    const m = std(hc, { roughness: 1, sheen: .5 });
    const hd = new THREE.Mesh(new THREE.SphereGeometry(1.16, 64, 32, Math.PI * .5 + .55, Math.PI * 2 - 1.1, 0, Math.PI * .62), m); hd.position.y = .02; head.add(hd);
    const edge = new THREE.Mesh(new THREE.TorusGeometry(1.1, .07, 10, 48, Math.PI * 1.6), std(shade(hc, -.1), { roughness: 1 })); edge.rotation.set(Math.PI * .55, 0, Math.PI * .2); edge.position.set(0, .05, .35); head.add(edge);
    [-1, 1].forEach(s => { const str = new THREE.Mesh(new THREE.CylinderGeometry(.025, .025, .7, 8), std(0xf3ebdd)); str.position.set(s * .35, -.85, .98); head.add(str); const tip = new THREE.Mesh(new THREE.CylinderGeometry(.035, .035, .1, 8), std(0x333333)); tip.position.set(s * .35, -1.22, .98); head.add(tip); });
    const chest = new THREE.Mesh(new THREE.SphereGeometry(1.08, 48, 16, Math.PI * .5 + .5, Math.PI * 2 - 1, Math.PI * .4, Math.PI * .22), m); chest.position.y = .02; head.add(chest);
  }
  if (S.head === 'balaclava') {
    const m = std(hc, { map: knitTex(hc), roughness: 1 });
    head.add(dome(1.09, Math.PI * .3, m));
    const sides = new THREE.Mesh(new THREE.SphereGeometry(1.09, 64, 24, Math.PI * .5 + .78, Math.PI * 2 - 1.56, Math.PI * .3, Math.PI * .24), m); head.add(sides);
    const lower = new THREE.Mesh(new THREE.SphereGeometry(1.09, 64, 24, 0, Math.PI * 2, Math.PI * .54, Math.PI * .24), m); head.add(lower);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(.62, .06, 8, 48), std(shade(hc, -.2), { roughness: 1 })); ring.position.set(0, .04, .9); ring.scale.set(1.3, .66, 1); head.add(ring);
  }
  if (S.head === 'laurel') {
    const m = gold();
    for (const s of [-1, 1]) for (let i = 0; i < 9; i++) { const a = Math.PI * .5 + s * (i / 9) * Math.PI * .85; const leaf = new THREE.Mesh(new THREE.SphereGeometry(.09, 10, 8), m); leaf.scale.set(1, .4, 2.2); leaf.position.set(Math.cos(a) * 1.02, .5 + Math.sin(i * .9) * .05, Math.sin(a) * 1.02); leaf.lookAt(0, .5, 0); leaf.rotation.z += s * .5; head.add(leaf); }
    const bandG = new THREE.Mesh(new THREE.TorusGeometry(1.0, .03, 8, 64, Math.PI * 1.7), m); bandG.rotation.set(Math.PI / 2, 0, Math.PI * .15); bandG.position.y = .5; head.add(bandG);
  }
  if (S.head === 'catears') {
    const m = std(hc, { roughness: .9, sheen: 1, sheenColor: new THREE.Color(hc) }), inner = std(0xf0a8b8, { roughness: 1 });
    [-1, 1].forEach(s => { const ear = new THREE.Mesh(new THREE.ConeGeometry(.3, .55, 4), m); ear.position.set(s * .58, 1.05, .05); ear.rotation.z = -s * .35; ear.rotation.y = Math.PI / 4; head.add(ear); const inn = new THREE.Mesh(new THREE.ConeGeometry(.17, .36, 4), inner); inn.position.set(s * .58, 1.0, .12); inn.rotation.z = -s * .35; inn.rotation.y = Math.PI / 4; head.add(inn); });
  }
  if (S.head === 'cone') {
    const m = std(0xff7a1a, { roughness: .7 }), wht = std(0xf3ebdd, { roughness: .6 }), cg = new THREE.Group(); cg.position.set(0, .72, 0); cg.rotation.z = -.08; head.add(cg);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(.58, 1.3, 28), m); cone.position.y = .65; cg.add(cone);
    [.4, .75].forEach(hh => { const r = .58 * (1 - hh / 1.3); const band = new THREE.Mesh(new THREE.CylinderGeometry(r - .035, r + .035, .12, 28, 1, true), wht); band.position.y = hh; cg.add(band); });
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.15, .08, 1.15), std(0x1a1a1c, { roughness: .9 })); base.position.y = .04; cg.add(base);
  }
  if (S.head === 'mohawk') {
    const m = std(hc, { roughness: .95 }), sh = new THREE.Shape(); const N = 8;
    // hrebeň: plutva od čela po tylo so špicami, vytiahnutá do hrúbky (rovina Y-Z)
    sh.moveTo(Math.sin(-.4) * .9, Math.cos(-.4) * .9);
    for (let i = 0; i <= N; i++) { const t = i / N, a = (t - .5) * Math.PI * .9, hh = .95 + Math.sin(t * Math.PI) * .55; sh.lineTo(Math.sin(a) * 1.0 * hh + Math.sin(a) * .2, Math.cos(a) * 1.0 * hh); if (i < N) { const a2 = (t + .5 / N - .5) * Math.PI * .9; sh.lineTo(Math.sin(a2) * 1.0, Math.cos(a2) * 1.0); } }
    sh.lineTo(Math.sin(.4) * .9, Math.cos(.4) * .9); sh.closePath();
    const fin = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: .16, bevelEnabled: true, bevelThickness: .03, bevelSize: .03, bevelSegments: 2 }), m);
    fin.rotation.y = -Math.PI / 2; fin.position.x = .08; fin.position.y = .02; head.add(fin);
  }
  if (S.extra === 'scarf') {
    const m = std(0xffffff, { map: knitTex(xc), roughness: 1, sheen: 1, sheenColor: new THREE.Color(xc) });
    const wrap1 = new THREE.Mesh(new THREE.TorusGeometry(1.0, .16, 12, 64), m); wrap1.rotation.x = Math.PI / 2 + .1; wrap1.position.y = -.62; wrap1.scale.set(1, 1, D); items.add(wrap1);
    const wrap2 = new THREE.Mesh(new THREE.TorusGeometry(1.02, .14, 12, 64), m); wrap2.rotation.x = Math.PI / 2 - .08; wrap2.position.y = -.84; wrap2.scale.set(1, 1, D); items.add(wrap2);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(.3, .9, .08), m); tail.position.set(-.55, -1.3, .98); tail.rotation.z = .15; tail.name = 'scarf'; items.add(tail);
    for (let i = 0; i < 4; i++) { const fr = new THREE.Mesh(new THREE.CylinderGeometry(.02, .02, .18, 6), std(shade(xc, -.15))); fr.position.set(-.66 + i * .08, -1.82, .99); items.add(fr); }
  }
  if (S.extra === 'medal') {
    const rib = std(0xa01414, { roughness: .9 });
    [-1, 1].forEach(s => { const r = new THREE.Mesh(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(new THREE.Vector3(s * .62, -.3, .82), new THREE.Vector3(s * .5, -.9, 1.0), new THREE.Vector3(s * .04, -1.3, 1.02)), 10, .05, 6, false), rib); items.add(r); });
    const md = new THREE.Mesh(new THREE.CylinderGeometry(.3, .3, .06, 32), gold()); md.rotation.x = Math.PI / 2; md.position.set(0, -1.52, 1.04); md.name = 'pass'; items.add(md);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(.3, .025, 8, 32), gold()); ring.position.set(0, -1.52, 1.08); items.add(ring);
    const one = new THREE.Mesh(new THREE.PlaneGeometry(.26, .26), std(0xffffff, { map: stickerTex('#e2b53c', '1', '#7a5200'), roughness: .3, metalness: .6 })); one.position.set(0, -1.52, 1.075); items.add(one);
  }
  if (S.finish === 'glow') {
    const tex = (() => { const cv = document.createElement('canvas'); cv.width = cv.height = 128; const x = cv.getContext('2d'); const g = x.createRadialGradient(64, 64, 10, 64, 64, 64); const col = new THREE.Color(S.color); const rgb = `${col.r * 255 | 0},${col.g * 255 | 0},${col.b * 255 | 0}`; g.addColorStop(0, `rgba(${rgb},.5)`); g.addColorStop(.55, `rgba(${rgb},.16)`); g.addColorStop(1, `rgba(${rgb},0)`); x.fillStyle = g; x.fillRect(0, 0, 128, 128); const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t; })();
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); sp.scale.setScalar(4.6); sp.position.set(0, -.3, -.2); items.add(sp);
  }
  /* ---- tvár navyše v 3D (okuliare) ---- */
  const fcol = S.faceColor;
  if (S.faceExtra === 'sunglasses') {
    const m = std(fcol, { roughness: .2, clearcoat: 1 }), lens = std(0x111111, { roughness: .05, metalness: .3, clearcoat: 1 });
    [-1, 1].forEach(s => { const l = new THREE.Mesh(new THREE.BoxGeometry(.5, .22, .06), lens); l.position.set(s * .36, .02, .98); l.rotation.y = s * .25; head.add(l); const f = new THREE.Mesh(new THREE.BoxGeometry(.56, .28, .04), m); f.position.set(s * .36, .02, .96); f.rotation.y = s * .25; head.add(f); const arm = new THREE.Mesh(new THREE.BoxGeometry(.04, .05, .9), m); arm.position.set(s * .72, .05, .5); arm.rotation.y = s * .4; head.add(arm); });
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(.16, .05, .04), m); bridge.position.set(0, .06, 1.02); head.add(bridge);
  }
  if (S.faceExtra === 'goggles') {
    const m = std(fcol, { roughness: .4 }), lens = std(0xff7a1a, { roughness: .05, metalness: .2, clearcoat: 1, iridescence: .8 });
    const gg = new THREE.Group(); gg.position.set(0, .62, .78); gg.rotation.x = -.6; head.add(gg);
    const fr = new THREE.Mesh(new THREE.BoxGeometry(1.0, .34, .14), m); gg.add(fr);
    const ln = new THREE.Mesh(new THREE.BoxGeometry(.86, .22, .06), std(0x173a66, { roughness: .05, metalness: .3, clearcoat: 1, iridescence: .9 })); ln.position.z = .06; gg.add(ln);
    const nose = new THREE.Mesh(new THREE.BoxGeometry(.1, .12, .16), m); nose.position.set(0, -.14, 0); gg.add(nose);
    const strap = new THREE.Mesh(new THREE.TorusGeometry(1.02, .06, 8, 64, Math.PI * 1.3), std(0x151312)); strap.rotation.set(Math.PI / 2 - .4, 0, Math.PI * .35); strap.position.y = .62; head.add(strap);
  }
  /* ---- ďalšie doplnky ---- */
  if (S.extra === 'earbuds') { const w = std(0xf3ebdd, { roughness: .5 }); [-1, 1].forEach(s => { const bud = new THREE.Mesh(new THREE.SphereGeometry(.07, 10, 8), w); bud.position.set(s * .99, .05, .12); items.add(bud); const cable = new THREE.Mesh(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(new THREE.Vector3(s * .99, .0, .12), new THREE.Vector3(s * 1.1, -.6, .5), new THREE.Vector3(s * .12, -1.0, 1.02)), 14, .012, 6, false), w); items.add(cable); }); }
  if (S.extra === 'neckerchief') { const m = std(0xffffff, { map: bandanaTex(xc), roughness: .8, side: THREE.DoubleSide }); const ring = new THREE.Mesh(new THREE.CylinderGeometry(1.02, 1.1, .22, 64, 1, true), m); ring.position.y = -.72; items.add(ring); const knot = new THREE.Mesh(new THREE.SphereGeometry(.12, 12, 10), m); knot.position.set(0, -.76, -1.05); items.add(knot); [-1, 1].forEach(s => { const tail = new THREE.Mesh(new THREE.BoxGeometry(.16, .4, .03), m); tail.position.set(s * .12, -1.0, -1.06); tail.rotation.z = s * .3; items.add(tail); }); }
  if (S.extra === 'skatetool') { const m = std(0xc9ccd0, { metalness: .9, roughness: .3 }); const ring = new THREE.Mesh(new THREE.TorusGeometry(.1, .02, 8, 20), m); ring.position.set(.95, -.6, .6); items.add(ring); const tool = new THREE.Group(); [[0, 0, 0, .3], [0, 0, Math.PI / 2, .22]].forEach(([x, y, r, l]) => { const bar = new THREE.Mesh(new THREE.CylinderGeometry(.03, .03, l, 8), std(0xa01414, { roughness: .4 })); bar.rotation.z = r; tool.add(bar); }); tool.position.set(1.0, -.82, .62); tool.rotation.z = .3; tool.name = 'tool'; items.add(tool); }
  if (S.extra === 'backpack') {
    const m = std(xc, { roughness: .9, sheen: .4 }), dark = std(shade(xc, -.25), { roughness: .9 });
    const bag = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.1, .5), m); bag.position.set(0, -.45, -1.0); items.add(bag);
    const pocket = new THREE.Mesh(new THREE.BoxGeometry(.8, .45, .14), dark); pocket.position.set(0, -.75, -1.3); items.add(pocket);
    const flap = new THREE.Mesh(new THREE.BoxGeometry(1.12, .3, .54), dark); flap.position.set(0, .08, -1.0); items.add(flap);
    [-1, 1].forEach(s => { const st = new THREE.Mesh(new THREE.BoxGeometry(.12, .02, 1.2), dark); st.position.set(s * .45, .2, -.45); st.rotation.x = .9; items.add(st); const shoulder = new THREE.Mesh(new THREE.TorusGeometry(.5, .05, 8, 24, Math.PI), dark); shoulder.position.set(s * .5, .25, -.5); shoulder.rotation.set(0, Math.PI / 2, 0); items.add(shoulder); });
    [-1, 1].forEach(s => { const fs = new THREE.Mesh(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(new THREE.Vector3(s * .7, .3, .72), new THREE.Vector3(s * .74, -.25, 1.02), new THREE.Vector3(s * .6, -.85, .86)), 16, .055, 8, false), dark); items.add(fs); const buckle = new THREE.Mesh(new THREE.BoxGeometry(.14, .1, .04), std(0x222222)); buckle.position.set(s * .72, -.4, .98); items.add(buckle); });
    // doska priviazaná na batohu: dve lišty
    [-1, 1].forEach(s => { const r = new THREE.Mesh(new THREE.BoxGeometry(.06, .5, .06), std(0x222222)); r.position.set(s * .5, -.45, -1.28); items.add(r); });
  }
  if (S.extra === 'fanny') { const m = std(xc, { roughness: .8 }); const strap = new THREE.Mesh(new THREE.TorusGeometry(1.08, .05, 8, 64, Math.PI * 1.9), std(shade(xc, -.3))); strap.rotation.set(0, 0, Math.PI * .6); strap.rotation.x = .3; strap.position.y = -.45; items.add(strap); const bag = new THREE.Mesh(new THREE.BoxGeometry(.6, .32, .22), m); bag.position.set(.42, -.55, .95); bag.rotation.y = -.35; bag.rotation.z = .5; items.add(bag); const zip = new THREE.Mesh(new THREE.BoxGeometry(.5, .025, .02), std(0xc9ccd0, { metalness: .8 })); zip.position.set(.42, -.47, 1.07); zip.rotation.y = -.35; zip.rotation.z = .5; items.add(zip); }
  if (S.extra === 'lanyard') { const m = std(0xa01414, { roughness: .9 }); [-1, 1].forEach(s => { const str = new THREE.Mesh(new THREE.TubeGeometry(new THREE.LineCurve3(new THREE.Vector3(s * .5, -.3, .9), new THREE.Vector3(s * .08, -1.15, 1.02)), 1, .025, 6, false), m); items.add(str); }); const pass = new THREE.Mesh(new THREE.BoxGeometry(.4, .55, .02), std(0xffffff, { map: stickerTex('#f3ebdd', 'CREW', '#a01414'), roughness: .6 })); pass.position.set(0, -1.4, 1.03); pass.name = 'pass'; items.add(pass); }
  if (S.extra === 'camera') { const body = std(0x1a1a1c, { roughness: .5 }), m2 = std(0x3a3a3e, { metalness: .6, roughness: .3 }); const cam = new THREE.Group(); cam.add(new THREE.Mesh(new THREE.BoxGeometry(.6, .4, .3), body)); const lens = new THREE.Mesh(new THREE.CylinderGeometry(.16, .18, .22, 24), m2); lens.rotation.x = Math.PI / 2; lens.position.z = .25; cam.add(lens); const glass = new THREE.Mesh(new THREE.SphereGeometry(.14, 16, 12), std(0x224466, { roughness: 0, clearcoat: 1, metalness: .4 })); glass.position.z = .36; cam.add(glass); cam.position.set(0, -1.2, 1.05); cam.rotation.x = -.2; items.add(cam); const str = new THREE.Mesh(new THREE.TorusGeometry(.9, .03, 6, 48, Math.PI * 1.1), std(0x151312)); str.rotation.set(0, 0, Math.PI * -.05); str.rotation.x = -.5; str.position.set(0, -.6, .3); items.add(str); }
  if (S.extra === 'wings') { const m = std(0x1b1620, { roughness: .8, side: THREE.DoubleSide }); [-1, 1].forEach(s => { const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.quadraticCurveTo(.5, .6, 1.1, .4); sh.lineTo(.95, .15); sh.lineTo(1.2, -.1); sh.lineTo(.9, -.15); sh.lineTo(1.0, -.45); sh.quadraticCurveTo(.5, -.35, 0, -.3); const w = new THREE.Mesh(new THREE.ShapeGeometry(sh), m); w.position.set(s * .7, -.2, -.85); w.rotation.y = s * -.7; w.scale.x = s; w.name = 'wing' + s; items.add(w); }); }
  if (S.extra === 'chain') {
    const m = gold(), ch = new THREE.Group();
    for (let i = 0; i < 26; i++) { const a = Math.PI * .1 + i / 25 * Math.PI * .8, l = new THREE.Mesh(new THREE.TorusGeometry(.045, .016, 6, 12), m); l.position.set(Math.cos(a) * 1.08, -.62 - Math.sin(a) * .22, Math.sin(a) * 1.08 * D + .03); l.rotation.set(0, -a + Math.PI / 2, i % 2 ? Math.PI / 2 : 0); ch.add(l); }
    const pend = new THREE.Mesh(new THREE.BoxGeometry(.32, .1, .03), m); pend.position.set(0, -.88, D * 1.08 + .06); pend.rotation.z = .05; ch.add(pend);
    items.add(ch);
  }
}



  /* doska z board.js (rovnaká ako v garáži a na karte), v mierke sveta ducha */
  const boardRig = new THREE.Group(), flip = new THREE.Group(); boardRig.add(flip); rig.add(boardRig);
  boardRig.rotation.order = 'YXZ'; boardRig.rotation.y = .35; boardRig.position.y = -1.6;
  let model = await makeBoardModel(renderer, { look, stickers });
  flip.add(model.board); model.board.scale.setScalar(1 / K * 1.05);
  const boardY = -1.6;
  function buildShoes() {
    [...flip.children].filter(o => o !== model.board).forEach(o => { flip.remove(o); disposeTree(o); });
  /* ---- tenisky na doske (duch stojí v teniskách, nohy nevidno) ---- */
  const shoeK = S.board.shoes;
  if (shoeK !== 'none') {
    const sc = S.board.shoeColor, upper = std(sc, { roughness: .85, sheen: .5 }), sole = std(0xf3ebdd, { roughness: .6 }), lace = std(0xf3ebdd, { roughness: .9 }), dark = std(0x151312, { roughness: .8 });
    const mkShoe = (x, ang) => {
      const g = new THREE.Group(); const H = shoeK === 'hightop' ? .34 : .2, chunky = shoeK === 'chunky';
      const s = new THREE.Mesh(new THREE.BoxGeometry(.62, H, .3), upper); s.position.y = H / 2 + (chunky ? .09 : .05); g.add(s);
      const toe = new THREE.Mesh(new THREE.SphereGeometry(.15, 16, 12), upper); toe.scale.set(1.05, .75, 1); toe.position.set(.3, .11 + (chunky ? .05 : 0), 0); g.add(toe);
      const sl = new THREE.Mesh(new THREE.BoxGeometry(.72, chunky ? .12 : .06, .34), chunky ? std(0xffffff, { roughness: .4 }) : sole); sl.position.y = (chunky ? .06 : .03); g.add(sl);
      if (chunky) { const air = new THREE.Mesh(new THREE.BoxGeometry(.5, .06, .36), std(0x224466, { roughness: .1, clearcoat: 1 })); air.position.y = .06; g.add(air); }
      if (shoeK === 'skate' || shoeK === 'canvas') { const stripe = new THREE.Mesh(new THREE.BoxGeometry(.74, .02, .36), dark); stripe.position.y = .07; g.add(stripe); }
      if (shoeK === 'skate') { const side = new THREE.Mesh(new THREE.BoxGeometry(.3, .12, .32), std(shade(sc, .25), { roughness: .8 })); side.position.set(-.05, .15, 0); g.add(side); }
      if (shoeK === 'slipon') { for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) if ((i + j) % 2) { const sq = new THREE.Mesh(new THREE.BoxGeometry(.12, .07, .31), std(0xf3ebdd)); sq.position.set(-.2 + i * .13, .11 + j * .07, 0); g.add(sq); } const el = new THREE.Mesh(new THREE.BoxGeometry(.1, .08, .32), dark); el.position.set(-.1, .2, 0); g.add(el); }
      else { for (let i = 0; i < (shoeK === 'hightop' ? 5 : 3); i++) { const l = new THREE.Mesh(new THREE.BoxGeometry(.03, .025, .2), lace); l.position.set(-.1 + i * .08, H + (chunky ? .1 : .06), 0); l.rotation.y = i % 2 ? .4 : -.4; g.add(l); } }
      if (shoeK === 'hightop') { const collar = new THREE.Mesh(new THREE.TorusGeometry(.14, .04, 8, 20), std(shade(sc, -.15))); collar.rotation.x = Math.PI / 2; collar.position.set(-.1, H + .05, 0); g.add(collar); }
      const heel = new THREE.Mesh(new THREE.BoxGeometry(.1, H * .9, .3), std(shade(sc, -.12), { roughness: .9 })); heel.position.set(-.32, H / 2 + .05, 0); g.add(heel);
      g.position.set(x, .035, 0); g.rotation.y = ang; return g;
    };
    flip.add(mkShoe(-.55, .35), mkShoe(.5, .15));
  }
  /* ---- doplnky dosky ---- */
  const bx = S.board.extra;
  if (bx === 'wax') { const wx = new THREE.Mesh(new THREE.BoxGeometry(.3, .22, .3), std(0xf3ebdd, { roughness: .35, clearcoat: .6, transmission: .2 })); wx.position.set(1.0, -.21, .8); wx.rotation.y = .4; flip.add(wx); const lbl = new THREE.Mesh(new THREE.PlaneGeometry(.26, .14), std(0xffffff, { map: stickerTex2('#a01414', 'WAX', '#f3ebdd') })); lbl.position.set(1.0, -.19, .96); lbl.rotation.y = .4; flip.add(lbl); }
  if (bx === 'rails') { [-.3, .3].forEach(z => { const r = new THREE.Mesh(new THREE.BoxGeometry(1.3, .05, .07), std(0xf3ebdd, { roughness: .5 })); r.position.set(0, -.09, z); flip.add(r); }); }
  if (bx === 'tailguard') { const tg = new THREE.Mesh(new THREE.BoxGeometry(.3, .06, .5), std(0x151312, { roughness: .6 })); tg.position.set(-1.28, .11, 0); tg.rotation.z = .5; flip.add(tg); }
  // 'snapped' (zlomený nos) sa na webovej doske z board.js zatiaľ nekreslí
  }

/* ================= scéna (svetlo, počasie, zem) ================= */
const weather = new THREE.Group(); world.add(weather);
let ground = null;
function buildScene() {
  disposeTree(weather); weather.clear(); if (ground) { world.remove(ground); disposeTree(ground); ground = null; }
  const sc = S.scene; canvas.dataset.scene = sc; onScene?.(sc);
  const L = { night: [[0xfff1e0, 0x2a1414, .9], [0xffffff, 2.1], [0xff4a3a, 2.4]], day: [[0xdfefff, 0x8a7a66, 1.5], [0xfff6e0, 2.8], [0xbcd8ff, 1.2]], sunset: [[0xffd9a0, 0x4a2418, 1.1], [0xffc070, 2.6], [0xff7a30, 2.2]], snow: [[0xe8f0ff, 0x6a7a90, 1.3], [0xf4f8ff, 2.2], [0x9fc4ff, 1.6]], rain: [[0xb8c4e0, 0x1a1a28, .7], [0xcfd8f0, 1.6], [0x6a8aff, 2.2]], garage: [[0xe0ffe8, 0x1a1a22, .8], [0xfff0ff, 1.5], [0x39ff14, 2.8]], bridge: [[0xc8d0e0, 0x2a2420, .9], [0xffffff, 1.6], [0xff8a3a, 1.8]], rooftop: [[0xffe8c8, 0x30281e, 1.2], [0xffe4b0, 2.6], [0x9fc4ff, 1.4]] }[sc];
  hemi.color.set(L[0][0]); hemi.groundColor.set(L[0][1]); hemi.intensity = L[0][2]; key.color.set(L[1][0]); key.intensity = L[1][1]; rim.color.set(L[2][0]); rim.intensity = L[2][1];
  if (sc === 'snow' || sc === 'rain') {
    const n = sc === 'snow' ? 500 : 900, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { pos[i * 3] = (Math.random() - .5) * 9; pos[i * 3 + 1] = Math.random() * 7 - 2; pos[i * 3 + 2] = (Math.random() - .5) * 7; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const dot = document.createElement('canvas'); dot.width = dot.height = 32; const x = dot.getContext('2d');
    if (sc === 'snow') { x.fillStyle = '#fff'; x.beginPath(); x.arc(16, 16, 11, 0, 7); x.fill(); } else { x.fillStyle = 'rgba(190,205,255,.9)'; x.fillRect(14, 2, 4, 28); }
    const m = new THREE.PointsMaterial({ size: (sc === 'snow' ? .12 : .22) * K, map: new THREE.CanvasTexture(dot), transparent: true, depthWrite: false, opacity: sc === 'snow' ? .95 : .55 });
    const pts = new THREE.Points(g, m); pts.name = sc; weather.add(pts);
  }
  if (sc === 'snow' || sc === 'rain') {
    const gc = document.createElement('canvas'); gc.width = gc.height = 256; const gx = gc.getContext('2d'); const gr = gx.createRadialGradient(128, 128, 20, 128, 128, 128); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.7, 'rgba(255,255,255,.8)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); gx.fillStyle = gr; gx.fillRect(0, 0, 256, 256);
    const am = new THREE.CanvasTexture(gc);
    ground = new THREE.Mesh(new THREE.CircleGeometry(4.5, 48), sc === 'snow' ? std(0xeef2fa, { roughness: .95, sheen: 1, sheenColor: new THREE.Color(0xffffff), alphaMap: am, transparent: true }) : std(0x14131a, { roughness: .06, metalness: .3, clearcoat: 1, envMapIntensity: 1.8, alphaMap: am, transparent: true }));
  }
  if (ground) { ground.rotation.x = -Math.PI / 2; ground.position.y = -1.99; world.add(ground); }
  // kulisy scén
  const concrete = std(0x5a5660, { roughness: 1 });
  if (sc === 'garage') { [-3.2, 3.2].forEach(x => { const p = new THREE.Mesh(new THREE.BoxGeometry(.8, 6, .8), concrete); p.position.set(x, 1, -2.5); weather.add(p); }); const neon = new THREE.Mesh(new THREE.CylinderGeometry(.05, .05, 5, 8), std(0x9fffb0, { emissive: new THREE.Color(0x39ff14), emissiveIntensity: 2.5 })); neon.rotation.z = Math.PI / 2; neon.position.set(0, 3.2, -2.4); weather.add(neon); const stripe = new THREE.Mesh(new THREE.PlaneGeometry(9, .25), std(0xffc61a, { roughness: .9 })); stripe.rotation.x = -Math.PI / 2; stripe.position.set(0, -1.985, -1.2); weather.add(stripe); const wall = new THREE.Mesh(new THREE.PlaneGeometry(10, 7), std(0x2a2830, { roughness: 1 })); wall.position.set(0, 1.5, -3); weather.add(wall); }
  if (sc === 'bridge') { const pil = new THREE.Mesh(new THREE.BoxGeometry(1.6, 7, 1.6), concrete); pil.position.set(-2.8, 1.5, -2.2); weather.add(pil); const pil2 = new THREE.Mesh(new THREE.BoxGeometry(1.6, 7, 1.6), concrete); pil2.position.set(3.2, 1.5, -2.6); weather.add(pil2); const beam = new THREE.Mesh(new THREE.BoxGeometry(12, 1, 3), concrete); beam.position.set(0, 4.6, -2.3); weather.add(beam); const tag = new THREE.Mesh(new THREE.PlaneGeometry(1.3, .6), std(0xffffff, { map: stickerTex2('#ff2bd6', 'GOS', '#151312'), roughness: 1 })); tag.position.set(-2.8, .6, -1.38); weather.add(tag); const tag2 = new THREE.Mesh(new THREE.PlaneGeometry(1.2, .5), std(0xffffff, { map: stickerTex2('#00f0ff', 'SKATE', '#151312'), roughness: 1 })); tag2.position.set(3.2, 1.4, -1.78); weather.add(tag2); }
  if (sc === 'rooftop') { const ac = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.1, 1.2), std(0x8c8f96, { roughness: .7, metalness: .3 })); ac.position.set(-2.9, -1.45, -1.8); weather.add(ac); const fan = new THREE.Mesh(new THREE.CylinderGeometry(.45, .45, .05, 24), std(0x333333)); fan.position.set(-2.9, -.88, -1.8); fan.name = 'fan'; weather.add(fan); const edge = new THREE.Mesh(new THREE.BoxGeometry(12, .4, .5), concrete); edge.position.set(0, -1.8, -3.2); weather.add(edge); const vent = new THREE.Mesh(new THREE.CylinderGeometry(.25, .3, 1.6, 12), std(0xa0a4ac, { metalness: .5, roughness: .5 })); vent.position.set(3.1, -1.2, -2.4); weather.add(vent); const cap = new THREE.Mesh(new THREE.SphereGeometry(.35, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), std(0xa0a4ac, { metalness: .5 })); cap.position.set(3.1, -.4, -2.4); weather.add(cap); }
  if (sc === 'day') { const m = std(0xffffff, { roughness: 1, emissive: new THREE.Color(0xffffff), emissiveIntensity: .4 }); [[-3.5, 3.6, -5, 1.2], [2.8, 4.2, -6, 1.6], [0.5, 3.1, -5.5, .8]].forEach(([x, y, z, r]) => { for (let i = 0; i < 4; i++) { const c = new THREE.Mesh(new THREE.SphereGeometry(r * (.5 + (i % 2) * .4), 12, 8), m); c.position.set(x + i * r * .7 - r, y + (i % 2) * r * .3, z); weather.add(c); } }); }
}
function tickWeather(dt) {
  const fan = weather.getObjectByName('fan'); if (fan) fan.rotation.y += dt * 6;
  const p = weather.children.find(o => o.isPoints); if (!p) return;
  const a = p.geometry.attributes.position, snow = p.name === 'snow';
  for (let i = 0; i < a.count; i++) { let y = a.getY(i) - dt * (snow ? .8 : 9); let x = a.getX(i) + (snow ? Math.sin(performance.now() / 900 + i) * dt * .3 : 0); if (y < -2) { y = 5; x = (Math.random() - .5) * 9; } a.setXY(i, x, y); }
  a.needsUpdate = true;
}
/* kamoš */
const buddyG = new THREE.Group(); world.add(buddyG);
function buildBuddy() {
  disposeTree(buddyG); buddyG.clear(); buddyG.position.set(0, 0, 0); buddyG.rotation.set(0, 0, 0); buddyG.scale.setScalar(1);
  const b = S.buddy; if (b === 'none') return;
  if (b === 'cat') {
    const m = std(0x1c1a1f, { roughness: .9, sheen: .6, sheenColor: new THREE.Color(0x44404a) });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(.17, .22, 6, 16), m); body.rotation.z = .25; body.position.y = .22; buddyG.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(.16, 20, 14), m); head.position.set(.05, .5, 0); buddyG.add(head);
    [-1, 1].forEach(s => { const ear = new THREE.Mesh(new THREE.ConeGeometry(.05, .1, 8), m); ear.position.set(.05, .64, s * .09); buddyG.add(ear); const eye = new THREE.Mesh(new THREE.SphereGeometry(.025, 8, 6), std(0xd8ff5a, { emissive: new THREE.Color(0x9ad020), emissiveIntensity: .8 })); eye.position.set(.2, .52, s * .06); buddyG.add(eye); });
    const tail = new THREE.Mesh(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(new THREE.Vector3(-.15, .12, 0), new THREE.Vector3(-.4, .05, .1), new THREE.Vector3(-.45, .35, .15)), 12, .03, 8, false), m); tail.name = 'tail'; buddyG.add(tail);
    buddyG.position.set(1.5, -1.98, .5); buddyG.rotation.y = -.6;
  }
  if (b === 'pigeon') {
    const m = std(0x8a8aa0, { roughness: .8 }), body = new THREE.Mesh(new THREE.SphereGeometry(.16, 18, 12), m); body.scale.set(1.3, 1, 1); body.position.y = .2; buddyG.add(body);
    const head = new THREE.Group(); head.name = 'head'; head.position.set(.17, .34, 0); buddyG.add(head);
    head.add(new THREE.Mesh(new THREE.SphereGeometry(.08, 14, 10), std(0x4a5a6a, { roughness: .7, iridescence: .6 })));
    const beak = new THREE.Mesh(new THREE.ConeGeometry(.025, .07, 8), std(0xff9a3c)); beak.rotation.z = -Math.PI / 2; beak.position.x = .1; head.add(beak);
    [-1, 1].forEach(s => { const leg = new THREE.Mesh(new THREE.CylinderGeometry(.012, .012, .12, 6), std(0xd04040)); leg.position.set(0, .06, s * .05); buddyG.add(leg); });
    buddyG.position.set(1.4, -1.98, .9); buddyG.rotation.y = -.4;
  }
  if (b === 'rat') {
    const m = std(0x5a4c56, { roughness: .9 }), body = new THREE.Mesh(new THREE.SphereGeometry(.14, 16, 12), m); body.scale.set(1.7, .8, 1); body.position.y = .11; buddyG.add(body);
    const nose = new THREE.Mesh(new THREE.SphereGeometry(.02, 8, 6), std(0xe08090)); nose.position.set(.25, .1, 0); buddyG.add(nose);
    [-1, 1].forEach(s => { const ear = new THREE.Mesh(new THREE.SphereGeometry(.04, 10, 8), std(0xd8a0a8)); ear.position.set(.12, .22, s * .07); buddyG.add(ear); });
    const tail = new THREE.Mesh(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(new THREE.Vector3(-.2, .08, 0), new THREE.Vector3(-.45, .02, .2), new THREE.Vector3(-.6, .04, -.1)), 10, .015, 6, false), std(0xd8a0a8)); buddyG.add(tail);
    buddyG.position.set(0, -1.98, 1.6);
  }
  if (b === 'moths') { const m = std(0xd8d0b8, { roughness: 1, side: THREE.DoubleSide }); for (let i = 0; i < 5; i++) { const mo = new THREE.Group(); [-1, 1].forEach(s => { const w = new THREE.Mesh(new THREE.CircleGeometry(.09, 10), m); w.scale.set(1.4, 1, 1); w.position.x = s * .1; w.name = 'w' + (s > 0 ? 'r' : 'l'); mo.add(w); }); mo.userData.i = i; buddyG.add(mo); } }
  if (b === 'butterfly') { const bf = new THREE.Group(); const m = std(0xff7a1a, { roughness: .8, side: THREE.DoubleSide, emissive: new THREE.Color(0x662200), emissiveIntensity: .3 }); [-1, 1].forEach(s => { const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.quadraticCurveTo(s * .35, .35, s * .3, .05); sh.quadraticCurveTo(s * .32, -.2, 0, -.1); const w = new THREE.Mesh(new THREE.ShapeGeometry(sh), m); w.name = 'w' + (s > 0 ? 'r' : 'l'); bf.add(w); const dot = new THREE.Mesh(new THREE.CircleGeometry(.04, 10), std(0x151312)); dot.position.set(s * .2, .08, .002); w.add(dot); }); const bodyB = new THREE.Mesh(new THREE.CapsuleGeometry(.025, .18, 4, 8), std(0x151312)); bf.add(bodyB); buddyG.add(bf); }
  if (b === 'balloon') { const m = std(S.buddyColor, { roughness: .1, clearcoat: 1, transmission: .15 }); const bl = new THREE.Mesh(new THREE.SphereGeometry(.42, 24, 18), m); bl.scale.y = 1.15; bl.name = 'balloon'; buddyG.add(bl); const knot = new THREE.Mesh(new THREE.ConeGeometry(.07, .12, 8), m); knot.rotation.x = Math.PI; knot.position.y = -.52; knot.name = 'knot'; buddyG.add(knot); const str = new THREE.Mesh(new THREE.TubeGeometry(new THREE.LineCurve3(new THREE.Vector3(0, -.55, 0), new THREE.Vector3(0, -2.2, 0)), 1, .01, 4, false), std(0xf3ebdd)); str.name = 'string'; buddyG.add(str); buddyG.position.set(1.35, .4, .3); }
  if (b === 'dog') { const fur = std(0xd9c2a0, { roughness: 1, sheen: .5 }), dark = std(0x3b2a20, { roughness: 1 }); const bd = new THREE.Mesh(new THREE.CapsuleGeometry(.26, .3, 6, 16), fur); bd.rotation.z = Math.PI / 2; bd.position.y = .3; buddyG.add(bd); const hd = new THREE.Mesh(new THREE.BoxGeometry(.42, .36, .4), fur); hd.position.set(.38, .5, 0); buddyG.add(hd); const muzzle = new THREE.Mesh(new THREE.BoxGeometry(.2, .18, .3), dark); muzzle.position.set(.58, .4, 0); buddyG.add(muzzle); const nose = new THREE.Mesh(new THREE.SphereGeometry(.05, 8, 6), std(0x111111)); nose.position.set(.69, .46, 0); buddyG.add(nose); [-1, 1].forEach(s => { const ear = new THREE.Mesh(new THREE.ConeGeometry(.08, .16, 6), dark); ear.position.set(.3, .72, s * .15); ear.rotation.z = -.2; buddyG.add(ear); const eye = new THREE.Mesh(new THREE.SphereGeometry(.035, 8, 6), std(0x111111)); eye.position.set(.6, .56, s * .12); buddyG.add(eye); for (const lx of [.1, -.3]) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(.06, .07, .3, 8), fur); leg.position.set(lx, .12, s * .14); buddyG.add(leg); } }); const tongue = new THREE.Mesh(new THREE.BoxGeometry(.08, .03, .12), std(0xe06070)); tongue.position.set(.66, .3, 0); tongue.name = 'tongue'; buddyG.add(tongue); const collar = new THREE.Mesh(new THREE.TorusGeometry(.2, .03, 8, 20), std(0xa01414)); collar.rotation.x = Math.PI / 2; collar.position.set(.2, .5, 0); buddyG.add(collar); buddyG.position.set(1.5, -1.98, .7); buddyG.rotation.y = -.9; }
  if (b === 'boombox') { const bb = new THREE.Group(); const m = std(0x2a2a2e, { roughness: .5, metalness: .3 }); bb.add(new THREE.Mesh(new THREE.BoxGeometry(1.1, .55, .35), m)); [-.33, .33].forEach(x => { const sp = new THREE.Mesh(new THREE.CylinderGeometry(.19, .19, .06, 24), std(0x111111)); sp.rotation.x = Math.PI / 2; sp.position.set(x, -.05, .18); sp.name = 'spk'; bb.add(sp); const cone = new THREE.Mesh(new THREE.ConeGeometry(.13, .06, 20), std(0x444448)); cone.rotation.x = -Math.PI / 2; cone.position.set(x, -.05, .2); bb.add(cone); }); const tape = new THREE.Mesh(new THREE.BoxGeometry(.3, .18, .04), std(0x151312)); tape.position.set(0, .12, .18); bb.add(tape); const handle = new THREE.Mesh(new THREE.TorusGeometry(.35, .03, 8, 24, Math.PI), m); handle.position.y = .28; bb.add(handle); for (let i = 0; i < 5; i++) { const led = new THREE.Mesh(new THREE.BoxGeometry(.04, .04, .02), std(0x39ff14, { emissive: new THREE.Color(0x39ff14), emissiveIntensity: 1 })); led.position.set(-.1 + i * .05, -.2, .18); led.name = 'led' + i; bb.add(led); } bb.name = 'bb'; buddyG.add(bb); buddyG.position.set(-1.55, -.3, .4); buddyG.rotation.y = .5; }
  if (b === 'bats') { const m = std(0x1b1620, { roughness: .9, side: THREE.DoubleSide }); for (let i = 0; i < 2; i++) { const bat = new THREE.Group(); [-1, 1].forEach(s => { const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.lineTo(s * .18, .12); sh.lineTo(s * .4, .05); sh.lineTo(s * .3, -.05); sh.lineTo(s * .42, -.14); sh.lineTo(s * .18, -.1); sh.lineTo(0, -.08); const w = new THREE.Mesh(new THREE.ShapeGeometry(sh), m); w.name = 'w' + (s > 0 ? 'r' : 'l'); bat.add(w); }); const bd = new THREE.Mesh(new THREE.SphereGeometry(.07, 8, 6), m); bat.add(bd); [-1, 1].forEach(s => { const eye = new THREE.Mesh(new THREE.SphereGeometry(.015, 6, 4), std(0xff2a1f, { emissive: new THREE.Color(0xff2a1f), emissiveIntensity: 2 })); eye.position.set(s * .03, .02, .06); bat.add(eye); }); bat.userData.i = i; buddyG.add(bat); } }
  if (b === 'crow') { const m = std(0x16161a, { roughness: .6, iridescence: .4 }); const bd = new THREE.Mesh(new THREE.SphereGeometry(.2, 18, 12), m); bd.scale.set(1.5, 1, 1); bd.position.y = .22; buddyG.add(bd); const hd = new THREE.Group(); hd.name = 'head'; hd.position.set(.26, .42, 0); buddyG.add(hd); hd.add(new THREE.Mesh(new THREE.SphereGeometry(.11, 12, 10), m)); const beak = new THREE.Mesh(new THREE.ConeGeometry(.035, .16, 8), std(0x333333)); beak.rotation.z = -Math.PI / 2; beak.position.x = .16; hd.add(beak); const eye = new THREE.Mesh(new THREE.SphereGeometry(.02, 6, 4), std(0xffffff)); eye.position.set(.06, .03, .09); hd.add(eye); const tail = new THREE.Mesh(new THREE.BoxGeometry(.3, .04, .14), m); tail.position.set(-.38, .22, 0); tail.rotation.z = .3; buddyG.add(tail); [-1, 1].forEach(s => { const leg = new THREE.Mesh(new THREE.CylinderGeometry(.012, .012, .14, 6), std(0x333333)); leg.position.set(0, .07, s * .06); buddyG.add(leg); }); buddyG.position.set(1.55, -1.98, -.4); buddyG.rotation.y = -1.4; }
  if (b === 'drone') { const dr = new THREE.Group(); const m = std(0x2a2a2e, { roughness: .4, metalness: .4 }); dr.add(new THREE.Mesh(new THREE.BoxGeometry(.4, .12, .4), m)); [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([x, z]) => { const arm = new THREE.Mesh(new THREE.BoxGeometry(.5, .04, .06), m); arm.position.set(x * .28, 0, z * .28); arm.rotation.y = x * z > 0 ? -Math.PI / 4 : Math.PI / 4; dr.add(arm); const rotor = new THREE.Mesh(new THREE.CylinderGeometry(.22, .22, .01, 16), std(0x444444, { transparent: true, opacity: .45 })); rotor.position.set(x * .46, .05, z * .46); rotor.name = 'rotor'; dr.add(rotor); const led = new THREE.Mesh(new THREE.SphereGeometry(.03, 6, 4), std(x > 0 ? 0x39ff14 : 0xff2a1f, { emissive: new THREE.Color(x > 0 ? 0x39ff14 : 0xff2a1f), emissiveIntensity: 2 })); led.position.set(x * .46, -.03, z * .46); dr.add(led); }); const cam = new THREE.Mesh(new THREE.SphereGeometry(.08, 10, 8), std(0x111111, { roughness: .1, clearcoat: 1 })); cam.position.set(.18, -.1, 0); dr.add(cam); dr.name = 'drone'; buddyG.add(dr); buddyG.position.set(1.6, 1.6, .5); }
  if (b === 'mini') {
    const g = buildBodyGeometry(), m = bodyMaterial(); const mesh = new THREE.Mesh(g, m); buddyG.add(mesh);
    [-1, 1].forEach(s => { const eye = new THREE.Mesh(new THREE.SphereGeometry(.14, 10, 8), std(0x0e0d0c)); eye.position.set(s * .32, .1, .92); eye.scale.set(1, .6, .4); eye.rotation.z = -s * .5; buddyG.add(eye); });
    buddyG.scale.setScalar(.34); buddyG.position.set(-1.6, -.4, .4);
  }
  const big = { cat: 1.25, pigeon: 1.3, rat: 1.2, crow: 1.2, drone: 1.1 }[b];
  if (big) buddyG.scale.multiplyScalar(big);
  if (b === 'moths' || b === 'bats' || b === 'butterfly') buddyG.children.forEach(ch => ch.scale.setScalar(1.25));
}
function tickBuddy(t) {
  const b = S.buddy; if (b === 'none') return;
  if (b === 'cat') { const tail = buddyG.getObjectByName('tail'); if (tail) tail.rotation.x = Math.sin(t * 2.5) * .5; }
  if (b === 'pigeon') { const h = buddyG.getObjectByName('head'); if (h) h.position.x = .17 + (Math.sin(t * 6) > .3 ? .05 : 0); buddyG.position.x = 1.4 + Math.sin(t * .4) * .2; }
  if (b === 'rat') { const a = t * 1.1; buddyG.position.set(Math.cos(a) * 1.5, -1.98, Math.sin(a) * .7 + .3); buddyG.rotation.y = -a + Math.PI / 2 + Math.PI; }
  if (b === 'moths') { const lampP = new THREE.Vector3(-1.9, 1.3, .2); buddyG.children.forEach(mo => { const i = mo.userData.i, a = t * (1.6 + i * .3) + i * 1.3; mo.position.set(lampP.x + Math.cos(a) * (.35 + i * .08), lampP.y + Math.sin(a * 1.7) * .3, lampP.z + Math.sin(a) * .35); mo.rotation.y = a; const f = Math.sin(t * 28 + i) * .9; mo.getObjectByName('wl').rotation.y = f; mo.getObjectByName('wr').rotation.y = -f; }); }
  if (b === 'butterfly') { const bf = buddyG.children[0]; if (!bf) return; const a = t * .5; bf.position.set(Math.cos(a) * 1.4, .3 + Math.sin(t * 1.3) * .6, Math.sin(a) * .9 + .3); bf.rotation.y = -a + Math.PI / 2; const f = Math.sin(t * 14) * 1.1; bf.getObjectByName('wl').rotation.y = f; bf.getObjectByName('wr').rotation.y = -f; }
  if (b === 'balloon') { buddyG.position.x = 1.35 + Math.sin(t * .7) * .15; buddyG.position.y = .4 + Math.sin(t * 1.1) * .1; buddyG.rotation.z = Math.sin(t * .7) * .12; }
  if (b === 'dog') { const tg = buddyG.getObjectByName('tongue'); if (tg) tg.position.y = .3 + (Math.sin(t * 9) > 0 ? .02 : 0); buddyG.scale.y = 1 + Math.sin(t * 9) * .012; }
  if (b === 'boombox') { buddyG.position.y = -.3 + Math.sin(t * 1.4) * .12; buddyG.rotation.z = Math.sin(t * 2.8) * .04; const bb = buddyG.getObjectByName('bb'); if (bb) { bb.children.forEach(o => { if (o.name === 'spk') o.scale.setScalar(1 + (Math.sin(t * 9) > .6 ? .08 : 0)); if (o.name.startsWith('led')) o.material.emissiveIntensity = (Math.sin(t * 9 + +o.name[3]) > .2 ? 1.5 : .1); }); } }
  if (b === 'bats') { buddyG.children.forEach(bat => { const i = bat.userData.i, a = t * .9 + i * Math.PI; bat.position.set(Math.cos(a) * 1.7, 1.6 + Math.sin(t * 1.7 + i) * .4, Math.sin(a) * 1.0); bat.rotation.y = -a; const f = Math.sin(t * 16 + i) * .8; bat.getObjectByName('wl').rotation.y = f; bat.getObjectByName('wr').rotation.y = -f; }); }
  if (b === 'crow') { const h = buddyG.getObjectByName('head'); if (h) { h.rotation.y = Math.sin(t * .8) > .7 ? .6 : 0; h.position.y = .42 + (Math.sin(t * 5) > .9 ? -.04 : 0); } }
  if (b === 'drone') { buddyG.position.set(1.35 + Math.sin(t * .6) * .3, 1.7 + Math.sin(t * 1.5) * .12, .5 + Math.cos(t * .5) * .3); buddyG.rotation.y = -.4 + Math.sin(t * .6) * .3; buddyG.rotation.z = Math.sin(t * .6) * .1; buddyG.getObjectByName('drone')?.children.forEach(o => { if (o.name === 'rotor') o.rotation.y = t * 40; }); }
  if (b === 'mini') { buddyG.position.y = -.4 + Math.sin(t * 2.1) * .12; buddyG.rotation.y = Math.sin(t * .8) * .3 + .4; }
}
/* efekty: sprity z plátna */
const fxG = new THREE.Group(); world.add(fxG);
const spriteTex = draw => { const c = document.createElement('canvas'); c.width = c.height = 128; draw(c.getContext('2d')); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; };
let flameTex = null, flameCv = null;
function buildFx() {
  disposeTree(fxG); fxG.clear(); const f = S.effect; if (f === 'none') return;
  if (f === 'sparkle') { const tex = spriteTex(x => { x.fillStyle = '#fff'; x.beginPath(); x.moveTo(64, 4); x.quadraticCurveTo(66, 62, 124, 64); x.quadraticCurveTo(66, 66, 64, 124); x.quadraticCurveTo(62, 66, 4, 64); x.quadraticCurveTo(62, 62, 64, 4); x.fill(); }); for (let i = 0; i < 7; i++) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: i % 2 ? 0xffe9a0 : 0xffffff, transparent: true, depthWrite: false })); sp.scale.setScalar(.22); sp.userData.i = i; fxG.add(sp); } }
  if (f === 'notes') { const tex = spriteTex(x => { x.fillStyle = '#f3ebdd'; x.font = '110px "Archivo", sans-serif'; x.textAlign = 'center'; x.fillText('♪', 64, 104); }); for (let i = 0; i < 3; i++) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false })); sp.scale.setScalar(.4); sp.userData.i = i; fxG.add(sp); } }
  if (f === 'hearts') { const tex = spriteTex(x => { x.fillStyle = '#ff4d6d'; x.beginPath(); x.moveTo(64, 116); x.bezierCurveTo(10, 70, 10, 20, 44, 20); x.bezierCurveTo(56, 20, 64, 30, 64, 40); x.bezierCurveTo(64, 30, 72, 20, 84, 20); x.bezierCurveTo(118, 20, 118, 70, 64, 116); x.fill(); }); for (let i = 0; i < 4; i++) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false })); sp.scale.setScalar(.32); sp.userData.i = i; fxG.add(sp); } }
  if (f === 'sparks') { const g = new THREE.BufferGeometry(); const n = 40; g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3)); const life = new Float32Array(n).map(() => Math.random()); g.userData = { life, vel: new Float32Array(n * 3) }; const pts = new THREE.Points(g, new THREE.PointsMaterial({ size: .08, color: 0xffc040, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); pts.name = 'sparks'; fxG.add(pts); }
  if (f === 'raincloud') { const cl = new THREE.Group(); const m = std(0x6a6f80, { roughness: 1 }); [[0, 0, .45], [-.4, -.1, .32], [.42, -.08, .34], [.1, .22, .3]].forEach(([x, y, r]) => { const s = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), m); s.position.set(x, y, 0); cl.add(s); }); cl.name = 'cloud'; fxG.add(cl); const g = new THREE.BufferGeometry(); const n = 30, pos = new Float32Array(n * 3); for (let i = 0; i < n; i++) { pos[i * 3] = (Math.random() - .5) * .9; pos[i * 3 + 1] = -Math.random() * 1.6; pos[i * 3 + 2] = (Math.random() - .5) * .5; } g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); const drops = new THREE.Points(g, new THREE.PointsMaterial({ size: .06, color: 0x9fc4ff, transparent: true, opacity: .8 })); drops.name = 'drops'; fxG.add(drops); }
  if (f === 'trail') { for (let i = 0; i < 3; i++) { const gh = new THREE.Mesh(bodyGeo, new THREE.MeshBasicMaterial({ color: S.color, transparent: true, opacity: .22 - i * .06, depthWrite: false })); gh.userData.i = i; fxG.add(gh); } }
  if (f === 'confetti') { const cols = [0xa01414, 0xf3ebdd, 0xffc61a, 0x2d6cc0, 0x39ff14, 0xee6fae]; for (let i = 0; i < 40; i++) { const c = new THREE.Mesh(new THREE.PlaneGeometry(.1, .06), std(cols[i % cols.length], { side: THREE.DoubleSide, roughness: .6 })); c.userData = { i, x: (Math.random() - .5) * 4, z: (Math.random() - .5) * 3, s: .4 + Math.random() * .5, r: Math.random() * 6 }; fxG.add(c); } }
  if (f === 'lightning') { const tex = spriteTex(x => { x.strokeStyle = '#fff'; x.lineWidth = 8; x.lineJoin = 'round'; x.beginPath(); x.moveTo(70, 4); x.lineTo(40, 60); x.lineTo(66, 58); x.lineTo(44, 124); x.lineTo(96, 50); x.lineTo(68, 52); x.lineTo(90, 4); x.closePath(); x.stroke(); x.fillStyle = '#9fd4ff'; x.fill(); }); for (let i = 0; i < 2; i++) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false })); sp.scale.setScalar(.7); sp.userData.i = i; sp.visible = false; fxG.add(sp); } }
  if (f === 'aura') { const tex = spriteTex(x => { const g = x.createRadialGradient(64, 64, 10, 64, 64, 64); g.addColorStop(0, 'rgba(255,220,120,.55)'); g.addColorStop(.6, 'rgba(255,190,60,.18)'); g.addColorStop(1, 'rgba(255,190,60,0)'); x.fillStyle = g; x.fillRect(0, 0, 128, 128); }); const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); sp.scale.setScalar(4.2); sp.name = 'aura'; fxG.add(sp); const ring = new THREE.Mesh(new THREE.TorusGeometry(1.6, .03, 8, 80), std(0xffd04a, { emissive: new THREE.Color(0xffc040), emissiveIntensity: 1.5 })); ring.rotation.x = Math.PI / 2; ring.name = 'ring'; fxG.add(ring); for (let i = 0; i < 10; i++) { const st = new THREE.Sprite(new THREE.SpriteMaterial({ map: spriteTex(x => { x.fillStyle = '#fff2b0'; x.beginPath(); x.moveTo(64, 4); x.quadraticCurveTo(66, 62, 124, 64); x.quadraticCurveTo(66, 66, 64, 124); x.quadraticCurveTo(62, 66, 4, 64); x.quadraticCurveTo(62, 62, 64, 4); x.fill(); }), transparent: true, depthWrite: false })); st.scale.setScalar(.25); st.userData.i = i; fxG.add(st); } }
  if (f === 'flames') { flameCv = document.createElement('canvas'); flameCv.width = 64; flameCv.height = 96; flameTex = new THREE.CanvasTexture(flameCv); flameTex.colorSpace = THREE.SRGBColorSpace; [-1.3, 1.3].forEach(x => { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: flameTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); sp.scale.set(.55, .8, 1); sp.userData.x = x; fxG.add(sp); }); }
}
function tickFx(t) {
  const f = S.effect; if (f === 'none') return;
  const gp = ghost.position;
  if (f === 'sparkle') fxG.children.forEach(sp => { const i = sp.userData.i, ph = (t * 2 + i * 1.3) % 4; sp.visible = ph < .6; const a = i * 2.4 + Math.floor((t * 2 + i * 1.3) / 4); sp.position.set(gp.x + Math.cos(a) * 1.3, gp.y + Math.sin(a * 1.7) * 1.1, gp.z + Math.sin(a) * 1.0); sp.material.rotation = ph * 2; });
  if (f === 'notes') fxG.children.forEach(sp => { const i = sp.userData.i, ph = ((t * .5 + i * .33) % 1); sp.position.set(gp.x + 1.2 + Math.sin(t * 2 + i) * .15, gp.y + .2 + ph * 1.6, gp.z + .3 - i * .3); sp.material.opacity = ph < .8 ? 1 : (1 - ph) * 5; });
  if (f === 'hearts') fxG.children.forEach(sp => { const i = sp.userData.i, ph = ((t * .4 + i * .25) % 1); sp.position.set(gp.x + Math.sin(t * 1.5 + i * 2) * .5, gp.y + .4 + ph * 1.8, gp.z + .6 - i * .3); sp.material.opacity = ph < .75 ? 1 : (1 - ph) * 4; const s = .22 + (i % 2) * .1; sp.scale.setScalar(s); });
  if (f === 'sparks') { const p = fxG.getObjectByName('sparks'); if (p) { const a = p.geometry.attributes.position, { life, vel } = p.geometry.userData; const bp = boardRig.position; for (let i = 0; i < a.count; i++) { life[i] -= .06; if (life[i] <= 0) { life[i] = .4 + Math.random() * .6; const side = Math.random() < .5 ? -1 : 1; a.setXYZ(i, bp.x + side * .9, bp.y - .25, bp.z + (Math.random() - .5) * .5); vel[i * 3] = side * (1 + Math.random() * 2); vel[i * 3 + 1] = 1.5 + Math.random() * 2; vel[i * 3 + 2] = (Math.random() - .5) * 2; } a.setXYZ(i, a.getX(i) + vel[i * 3] * .03, a.getY(i) + vel[i * 3 + 1] * .03, a.getZ(i) + vel[i * 3 + 2] * .03); vel[i * 3 + 1] -= .25; } a.needsUpdate = true; p.visible = S.board.show; } }
  if (f === 'raincloud') { const cl = fxG.getObjectByName('cloud'), dr = fxG.getObjectByName('drops'); if (cl) { cl.position.set(gp.x + Math.sin(t * .8) * .15, gp.y + 2.0, gp.z); } if (dr) { dr.position.copy(cl.position); const a = dr.geometry.attributes.position; for (let i = 0; i < a.count; i++) { let y = a.getY(i) - .09; if (y < -1.7) y = 0; a.setY(i, y); } a.needsUpdate = true; } }
  if (f === 'trail') fxG.children.forEach(gh => { const i = gh.userData.i, lag = (i + 1) * .18; gh.position.set(gp.x - Math.sin(t * .6) * lag * .8, gp.y - Math.sin(t * 1.7) * .08 * (i + 1) * .5 - lag * .15, gp.z - lag); gh.rotation.copy(ghost.rotation); gh.scale.copy(ghost.scale); });
  if (f === 'confetti') fxG.children.forEach(c => { const u = c.userData, ph = ((t * u.s * .25 + u.i * .07) % 1); c.position.set(gp.x + u.x + Math.sin(t * 2 + u.i) * .15, gp.y + 2.4 - ph * 4.6, gp.z + u.z); c.rotation.set(t * 3 + u.r, t * 2 + u.r, u.r); });
  if (f === 'lightning') fxG.children.forEach(sp => { const i = sp.userData.i, ph = (t * 1.5 + i * 2.3) % 7; sp.visible = ph < .25; if (sp.visible) { sp.position.set(gp.x + (i ? -.9 : .9), gp.y + .9 - ph * 2, gp.z + .4); sp.material.opacity = ph < .12 ? 1 : .4; } });
  if (f === 'aura') fxG.children.forEach(o => { if (o.name === 'aura') { o.position.set(gp.x, gp.y + .1, gp.z - .3); o.material.opacity = .8 + Math.sin(t * 2) * .2; } else if (o.name === 'ring') { o.position.set(gp.x, gp.y - 1.5, gp.z); o.rotation.z = t * .4; o.scale.setScalar(1 + Math.sin(t * 2) * .04); } else { const i = o.userData.i, a = t * .6 + i * .63; o.position.set(gp.x + Math.cos(a) * 1.5, gp.y - .8 + ((t * .3 + i * .1) % 1) * 2.2, gp.z + Math.sin(a) * 1.1); o.material.opacity = .5 + Math.sin(t * 4 + i) * .5; } });
  if (f === 'flames' && flameCv) { const x = flameCv.getContext('2d'); x.clearRect(0, 0, 64, 96); for (let k = 0; k < 3; k++) { const g = x.createRadialGradient(32, 80, 2, 32 + Math.sin(t * 9 + k) * 6, 60 - k * 14, 26 - k * 7); g.addColorStop(0, ['rgba(255,120,30,.9)', 'rgba(255,200,60,.9)', 'rgba(255,250,200,.95)'][k]); g.addColorStop(1, 'rgba(255,60,0,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 96); } flameTex.needsUpdate = true; fxG.children.forEach(sp => { sp.position.set(boardRig.position.x + sp.userData.x * Math.cos(boardRig.rotation.y), boardRig.position.y + .25, boardRig.position.z - sp.userData.x * Math.sin(boardRig.rotation.y)); sp.visible = S.board.show; }); }
}


  /* nálady: kroky v tikoch po 83 ms */
  let emote = null, nextAuto = performance.now() + 3000, autoOn = true, curFx = {};
  const playEmote = (k, byUser = true) => { if (!EMOTES[k]) return; if (byUser) lastInput = performance.now(); emote = { k, i: 0, t0: performance.now() }; };
  function tickEmote(now) {
    if (!emote) {
      if (autoOn && !trick && now > nextAuto && !reduceMotion) playEmote(randomEmote(), false);
      else { const bl = (now / 83 | 0) % 60 > 57 ? 'blink' : 'idle'; if (bl !== faceExpr) paintFace(bl); curFx = {}; return; }
    }
    const steps = EMOTES[emote.k].steps, st = steps[emote.i];
    if (st[0] !== faceExpr) paintFace(st[0]);
    curFx = st[2] || {};
    if (now - emote.t0 >= st[1] * 83) { emote.t0 = now; if (++emote.i >= steps.length) { emote = null; nextAuto = now + 3000 + Math.random() * 5000; curFx = {}; paintFace('idle'); } }
  }
  const bang = new THREE.Sprite(new THREE.SpriteMaterial({ map: spriteTex(x => { x.fillStyle = '#ffd040'; x.strokeStyle = '#1a0e12'; x.lineWidth = 10; x.font = '900 120px "Archivo", sans-serif'; x.textAlign = 'center'; x.strokeText('!', 64, 110); x.fillText('!', 64, 110); }), transparent: true, depthWrite: false })); bang.scale.setScalar(.5); bang.visible = false; world.add(bang);

  function applyAll() {
    paintBody();
    const old = body.material; body.material = bodyMaterial(); old.dispose();
    const e = EYES[S.eyes]; faceMat.emissive.set(e.glow ? '#ffffff' : '#000000'); faceMat.emissiveMap = e.glow ? faceTex : null; faceMat.emissiveIntensity = e.glow * .5; faceMat.needsUpdate = true; paintFace();
    outline.visible = S.outline;
    buildItems(); buildShoes(); buildScene(); buildBuddy(); buildFx();
    if (ps1) ps1ify();
  }
  /* PS1: ploché tieňovanie, vrcholy skáču na mriežku, hrubé textúry */
  const SNAP = `
  vec4 _p = gl_Position; _p.xyz /= _p.w; _p.xy = floor(_p.xy * vec2(88.0, 110.0) + 0.5) / vec2(88.0, 110.0); _p.xyz *= _p.w; gl_Position = _p;`;
  function ps1ify() {
    scene.traverse(o => {
      if (!o.material) return;
      [].concat(o.material).forEach(m => {
        if (m.userData.ps1) return; m.userData.ps1 = true;
        if ('flatShading' in m && !o.isSprite && !o.isPoints) m.flatShading = true;
        if (m.map) { m.map.minFilter = m.map.magFilter = THREE.NearestFilter; m.map.generateMipmaps = false; m.map.needsUpdate = true; }
        if (o.isSprite || o.isPoints) return;
        const prev = m.onBeforeCompile;
        m.onBeforeCompile = sh => { if (prev) prev(sh); sh.vertexShader = sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>' + SNAP); };
        m.needsUpdate = true;
      });
    });
  }

  const resize = () => { const w = canvas.clientWidth, h = canvas.clientHeight; if (!w || !h) return; if (ps1) renderer.setSize(PS1_W, Math.round(PS1_W * h / w), false); else renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); };
  const ro = new ResizeObserver(resize); ro.observe(canvas); resize();
  let alive = true, trick = null; const t0 = performance.now();
  const startTrick = kind => { lastInput = performance.now(); if (!trick && !reduceMotion) trick = { kind, t: performance.now() }; };
  let visible = true; const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; }); io.observe(canvas);
function wobble(t, amp) {
  const g = bodyGeo, p = g.attributes.position.array, base = g.userData.base, th = g.userData.theta;
  for (let i = 0, v = 0; i < p.length; i += 3, v++) {
    const y = base[i + 1];
    if (y < -.72) { const k = Math.min(1, (-.72 - y) / .5) * amp; const s = Math.sin(t * 3.2 + th[v] * 2 + y * 2); p[i] = base[i] + s * .05 * k * Math.cos(th[v] + .6); p[i + 2] = base[i + 2] + Math.cos(t * 2.7 + th[v] * 3) * .04 * k; p[i + 1] = base[i + 1] + s * .02 * k; }
  }
  g.attributes.position.needsUpdate = true; normals(g);
}

  /* šetrenie batérie: max 30 snímok/s, po minúte bez dotyku duch zaspí (každý dotyk ho zobudí) */
  let lastInput = performance.now(), lastFrame = 0, nextTrick = t0 + 4000, ps1Last = 0;
  const wake = () => { lastInput = performance.now(); };
  const wakeEvents = ['pointerdown', 'pointermove', 'wheel', 'input', 'click', 'keydown', 'touchstart'];
  wakeEvents.forEach(ev => addEventListener(ev, wake, { passive: true }));
  controls.addEventListener('change', wake);
  (function loop(now) {
    if (!alive) return;
    requestAnimationFrame(loop);
    if (!visible || document.hidden) return;
    if (now - lastFrame < 31) return;
    if (now - lastInput > 60000 && !trick && !emote) return;
    const dt = Math.min(.1, (now - lastFrame) / 1000); lastFrame = now;
    const t = (now - t0) / 1000, m = reduceMotion ? 0 : 1;
    controls.update(); tickEmote(now); tickWeather(dt); tickBuddy(t); tickFx(t);
    if (ps1 && (now / 500 | 0) !== ps1Last) { ps1Last = now / 500 | 0; ps1ify(); }
    if (m) wobble(t, trick ? 2 : 1);
    const fx = curFx, ex = EX[faceExpr] || {};
    ghost.position.y = .2 + Math.sin(t * 1.7) * .08 * m + (fx.dy || 0) * .09;
    ghost.position.x = fx.shake ? (Math.sin(now / 25) > 0 ? .04 : -.04) : 0;
    ghost.scale.set(1, fx.squash ? .94 : fx.stretch ? 1.06 : 1, 1);
    ghost.rotation.z = Math.sin(t * 1.2 + 1) * .05 * m; ghost.rotation.y = Math.sin(t * .6) * .12 * m + (ex.dx || 0) * .22;
    rig.rotation.y = Math.sin(t * .5) * .08 * m;
    bang.visible = !!fx.bang; if (bang.visible) { const gp = ghost.position; bang.position.set(gp.x + .7, gp.y + 1.45 + Math.sin(now / 60) * .03, gp.z + .3); }
    boardRig.position.y = boardY + Math.sin(t * 1.7 - .5) * .03 * m;
    const halo = items.getObjectByName('halo'); if (halo) { halo.position.y = 1.45 + Math.sin(t * 2.2) * .05; halo.rotation.z = t * .6; }
    const wl = items.getObjectByName('wing-1'), wr = items.getObjectByName('wing1'); if (wl && wr) { const f = Math.sin(t * 7) * .5; wl.rotation.y = .7 + f; wr.rotation.y = -.7 - f; }
    const pass = items.getObjectByName('pass'); if (pass) pass.rotation.z = Math.sin(t * 1.7) * .12;
    const scf = items.getObjectByName('scarf'); if (scf) scf.rotation.z = .15 + Math.sin(t * 2.3) * .12;
    const tool = items.getObjectByName('tool'); if (tool) tool.rotation.z = .3 + Math.sin(t * 1.9) * .2;
    if (!trick && m && now > nextTrick && !emote) { startTrick(Math.random() < .7 ? 'flip' : 'ollie'); nextTrick = now + 7000 + Math.random() * 6000; }
    if (trick) {
      const k = Math.min(1, (now - trick.t) / 950), e = k < .5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2, hop = Math.sin(k * Math.PI);
      if (trick.kind === 'spin') { ghost.rotation.y += e * Math.PI * 2; ghost.position.y += hop * .3; }
      else { boardRig.position.y += hop * .55; ghost.position.y += hop * .75; flip.rotation.x = trick.kind === 'ollie' ? 0 : e * Math.PI * 2; flip.rotation.z = trick.kind === 'ollie' ? Math.sin(k * Math.PI * 2) * .3 : 0; }
      if (k >= 1) { flip.rotation.set(0, 0, 0); trick = null; }
    }
    renderer.render(scene, camera);
  })(t0);

  /* ťuk na ducha = reakcia, ťuk vedľa = kickflip (nie ťahanie) */
  let down = null;
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const onDown = e => { down = [e.clientX, e.clientY, performance.now()]; };
  const onUp = e => {
    if (down && Math.hypot(e.clientX - down[0], e.clientY - down[1]) < 6 && performance.now() - down[2] < 350) {
      const r = canvas.getBoundingClientRect(); ndc.set((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); ray.setFromCamera(ndc, camera);
      if (ray.intersectObject(body, false).length) playEmote(Math.random() < .6 ? 'ouch' : 'scared'); else startTrick('flip');
    }
    down = null;
  };
  canvas.addEventListener('pointerdown', onDown); canvas.addEventListener('pointerup', onUp);

  applyAll();

  const api = () => {
    alive = false; ro.disconnect(); io.disconnect(); wakeEvents.forEach(ev => removeEventListener(ev, wake)); controls.dispose();
    canvas.removeEventListener('pointerdown', onDown); canvas.removeEventListener('pointerup', onUp);
    disposeTree(world); model.dispose(); bodyGeo.dispose(); faceTex.dispose(); alphaTex.dispose(); colorTex.dispose(); roughTex.dispose(); pmrem.dispose();
    renderer.dispose(); renderer.forceContextLoss();
  };
  api.trick = startTrick;
  api.emote = k => playEmote(k);
  api.setAuto = v => { autoOn = !!v; nextAuto = performance.now() + 500; };
  api.setGhost = g => { S = toS(g); applyAll(); wake(); };
  api.setLook = async (l, st = stickers) => { const m2 = await makeBoardModel(renderer, { look: l, stickers: st }); flip.remove(model.board); model.dispose(); model = m2; flip.add(m2.board); m2.board.scale.setScalar(1 / K * 1.05); wake(); };
  return api;
}

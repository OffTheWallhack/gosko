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
export async function mountMascot(canvas, { look, ghost: ghostCfg, stickers = [], interactive = true, onScene = null } = {}) {
  let S = { ...ghostOf(ghostCfg), wear: ghostOf(ghostCfg).scuff, board: { show: true } };
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); renderer.setClearColor(0, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  const scene = new THREE.Scene();
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

/* náhodné čísla so semienkom: každý duch má vlastné fľaky */
const rng = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };

/* ================= telo ducha =================
   Skutočný 3D tvar, nie vytlačené logo: kupola hlavy, telo so zaoblenými bokmi, spodný lem so 4 nožičkami vpredu
   (8 dookola), zaoblená hrana a vyklenutý spodok. Hlava má polomer 1, telo je spredu-dozadu trochu sploštené. */
const D = 1, NU = 160;   // okrúhly prierez: zhora je duch kruh, nie vajce
const hemY = th => { const L = Math.abs(Math.sin(4 * th)); return -1.0 - .26 * Math.pow(L, .5); };
function profile(th) {
  const pts = [], h = hemY(th), rho = .1;
  for (let i = 0; i <= 30; i++) { const p = i / 30 * Math.PI / 2; pts.push([Math.sin(p), Math.cos(p)]); }
  for (let i = 1; i <= 18; i++) { const t = i / 18, y = (h + rho) * t; pts.push([1 + .035 * t * t, y]); }   // plynulý prechod z hlavy do boku, bez zárezu pri očiach
  const r0 = pts[pts.length - 1][0];
  for (let i = 1; i <= 12; i++) { const a = i / 12 * Math.PI; pts.push([r0 - rho + rho * Math.cos(a), h + rho - rho * Math.sin(a)]); }
  const rs = r0 - 2 * rho, ys = h + rho, yu = -.7;
  for (let i = 1; i <= 14; i++) { const t = i / 14; pts.push([rs * (1 - t), ys + (yu - ys) * (1 - (1 - t) * (1 - t))]); }
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
const TW = 1024, TH = 512;
const colorCanvas = document.createElement('canvas'); colorCanvas.width = TW; colorCanvas.height = TH;
const roughCanvas = document.createElement('canvas'); roughCanvas.width = TW; roughCanvas.height = TH;
const colorTex = new THREE.CanvasTexture(colorCanvas); colorTex.colorSpace = THREE.SRGBColorSpace; colorTex.anisotropy = 4;
const roughTex = new THREE.CanvasTexture(roughCanvas);
const HEM_F = .66;   // kde je približne lem (podiel výšky textúry)
const shade = (hex, k) => { const c = new THREE.Color(hex); c.offsetHSL(0, 0, k); return '#' + c.getHexString(); };
function wrapDraw(x, w, fn) { fn(x); if (x - w < 0) fn(x + TW); if (x + w > TW) fn(x - TW); }
function paintBody() {
  const c = colorCanvas.getContext('2d'), r = roughCanvas.getContext('2d'), R = rng(S.seed);
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
    const cell = 11, ox = TW * .36, oy = TH * .50; c.fillStyle = S.markColor; c.globalAlpha = .92;
    c.save(); c.translate(ox + 80, 0); c.scale(-1, 1);   // textúra je na tele zrkadlovo, preto sa znak kreslí prevrátený
    if (S.mark === 'number') { c.font = '64px Anton, Impact, sans-serif'; c.textAlign = 'left'; c.fillText(String(S.seed).padStart(4, '0'), -4, oy + 60); }
    else MARKS[S.mark].art.forEach((row, y) => [...row].forEach((ch, x) => { if (ch === '#') c.fillRect(x * cell, oy + y * cell, cell + .5, cell + .5); }));
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
    const [u, v] = spots[i]; const x = u * TW, y = v * TH, ang = (R() - .5) * .5, w = 120, h = 58;
    wrapDraw(x, w, X => {
      c.save(); c.translate(X, y); c.rotate(ang);
      c.fillStyle = 'rgba(0,0,0,.25)'; rr(c, -w / 2 + 2, -h / 2 + 3, w, h, 10); c.fill();
      c.fillStyle = bg; rr(c, -w / 2, -h / 2, w, h, 10); c.fill();
      c.strokeStyle = fg; c.lineWidth = 2; rr(c, -w / 2 + 5, -h / 2 + 5, w - 10, h - 10, 7); c.stroke();
      c.fillStyle = fg; c.textAlign = 'center'; c.font = '28px Anton, Impact, sans-serif'; c.fillText(t, 0, 6);
      c.font = '700 11px "IBM Plex Mono", monospace'; c.fillText(s, 0, 21);
      // ošúchaný roh nálepky
      c.fillStyle = 'rgba(255,255,255,.35)'; c.beginPath(); c.moveTo(w / 2 - 18, -h / 2); c.lineTo(w / 2, -h / 2); c.lineTo(w / 2, -h / 2 + 16); c.fill();
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
  if (f === 'glow') { m.emissive = new THREE.Color(S.color); m.emissiveMap = colorTex; m.emissiveIntensity = .9; }
  return m;
}


  /* tvár: oči a úsmev z loga (ghost.js), premietnuté na predok ako nálepka; výraz sa mení prekreslením plátna */
  const faceCanvas = document.createElement('canvas'); faceCanvas.width = 1024; faceCanvas.height = 780;
  const alphaCanvas = document.createElement('canvas'); alphaCanvas.width = 1024; alphaCanvas.height = 780;
  const faceTex = new THREE.CanvasTexture(faceCanvas); faceTex.colorSpace = THREE.SRGBColorSpace; faceTex.anisotropy = 8;
  const alphaTex = new THREE.CanvasTexture(alphaCanvas); alphaTex.anisotropy = 8;
  const FACE_W = 1.25, FACE_H = .95, FACE_Y = -.17;
  let faceExpr = 'idle';
  function paintFace(expr) {
    if (expr) faceExpr = expr;
    [[faceCanvas, false], [alphaCanvas, true]].forEach(([cv, alpha]) => {
      const c = cv.getContext('2d'); c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, 1024, 780);
      if (alpha) { c.fillStyle = '#000'; c.fillRect(0, 0, 1024, 780); }
      const k = 1024 / (FACE_W * 231); c.setTransform(k, 0, 0, k, -(400 - FACE_W * 231 / 2) * k, -(458 - FACE_Y * 231 - FACE_H * 231 / 2) * k);
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
/* doplnky */
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

/* ================= scéna (svetlo, počasie, zem) ================= */
const weather = new THREE.Group(); world.add(weather);
let ground = null;
function buildScene() {
  disposeTree(weather); weather.clear(); if (ground) { world.remove(ground); disposeTree(ground); ground = null; }
  const sc = S.scene; canvas.dataset.scene = sc; onScene?.(sc);
  const L = { night: [[0xfff1e0, 0x2a1414, .9], [0xffffff, 2.1], [0xff4a3a, 2.4]], sunset: [[0xffd9a0, 0x4a2418, 1.1], [0xffc070, 2.6], [0xff7a30, 2.2]], snow: [[0xe8f0ff, 0x6a7a90, 1.3], [0xf4f8ff, 2.2], [0x9fc4ff, 1.6]], rain: [[0xb8c4e0, 0x1a1a28, .7], [0xcfd8f0, 1.6], [0x6a8aff, 2.2]] }[sc];
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
}
function tickWeather(dt) {
  const p = weather.children[0]; if (!p) return;
  const a = p.geometry.attributes.position, snow = p.name === 'snow';
  for (let i = 0; i < a.count; i++) { let y = a.getY(i) - dt * (snow ? .8 : 9); let x = a.getX(i) + (snow ? Math.sin(performance.now() / 900 + i) * dt * .3 : 0); if (y < -2) { y = 5; x = (Math.random() - .5) * 9; } a.setXY(i, x, y); }
  a.needsUpdate = true;
}
/* kamoš */
const buddyG = new THREE.Group(); world.add(buddyG);
function buildBuddy() {
  disposeTree(buddyG); buddyG.clear(); buddyG.position.set(0, 0, 0);
  const b = S.buddy; if (b === 'none') return;
  if (b === 'cat') {
    const m = std(0x1c1a1f, { roughness: .9, sheen: .6, sheenColor: new THREE.Color(0x44404a) });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(.17, .22, 6, 16), m); body.rotation.z = .25; body.position.y = .22; buddyG.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(.16, 20, 14), m); head.position.set(.05, .5, 0); buddyG.add(head);
    [-1, 1].forEach(s => { const ear = new THREE.Mesh(new THREE.ConeGeometry(.05, .1, 8), m); ear.position.set(.05, .64, s * .09); buddyG.add(ear); const eye = new THREE.Mesh(new THREE.SphereGeometry(.025, 8, 6), std(0xd8ff5a, { emissive: new THREE.Color(0x9ad020), emissiveIntensity: .8 })); eye.position.set(.2, .52, s * .06); buddyG.add(eye); });
    const tail = new THREE.Mesh(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(new THREE.Vector3(-.15, .12, 0), new THREE.Vector3(-.4, .05, .1), new THREE.Vector3(-.45, .35, .15)), 12, .03, 8, false), m); tail.name = 'tail'; buddyG.add(tail);
    buddyG.position.set(1.9, -1.98, .5); buddyG.rotation.y = -.6;
  }
  if (b === 'pigeon') {
    const m = std(0x8a8aa0, { roughness: .8 }), body = new THREE.Mesh(new THREE.SphereGeometry(.16, 18, 12), m); body.scale.set(1.3, 1, 1); body.position.y = .2; buddyG.add(body);
    const head = new THREE.Group(); head.name = 'head'; head.position.set(.17, .34, 0); buddyG.add(head);
    head.add(new THREE.Mesh(new THREE.SphereGeometry(.08, 14, 10), std(0x4a5a6a, { roughness: .7, iridescence: .6 })));
    const beak = new THREE.Mesh(new THREE.ConeGeometry(.025, .07, 8), std(0xff9a3c)); beak.rotation.z = -Math.PI / 2; beak.position.x = .1; head.add(beak);
    [-1, 1].forEach(s => { const leg = new THREE.Mesh(new THREE.CylinderGeometry(.012, .012, .12, 6), std(0xd04040)); leg.position.set(0, .06, s * .05); buddyG.add(leg); });
    buddyG.position.set(1.7, -1.98, .9); buddyG.rotation.y = -.4;
  }
  if (b === 'rat') {
    const m = std(0x5a4c56, { roughness: .9 }), body = new THREE.Mesh(new THREE.SphereGeometry(.14, 16, 12), m); body.scale.set(1.7, .8, 1); body.position.y = .11; buddyG.add(body);
    const nose = new THREE.Mesh(new THREE.SphereGeometry(.02, 8, 6), std(0xe08090)); nose.position.set(.25, .1, 0); buddyG.add(nose);
    [-1, 1].forEach(s => { const ear = new THREE.Mesh(new THREE.SphereGeometry(.04, 10, 8), std(0xd8a0a8)); ear.position.set(.12, .22, s * .07); buddyG.add(ear); });
    const tail = new THREE.Mesh(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(new THREE.Vector3(-.2, .08, 0), new THREE.Vector3(-.45, .02, .2), new THREE.Vector3(-.6, .04, -.1)), 10, .015, 6, false), std(0xd8a0a8)); buddyG.add(tail);
    buddyG.position.set(0, -1.98, 1.6);
  }
  if (b === 'mini') {
    const g = buildBodyGeometry(), m = bodyMaterial(); const mesh = new THREE.Mesh(g, m); buddyG.add(mesh);
    [-1, 1].forEach(s => { const eye = new THREE.Mesh(new THREE.SphereGeometry(.14, 10, 8), std(0x0e0d0c)); eye.position.set(s * .32, .1, .92); eye.scale.set(1, .6, .4); eye.rotation.z = -s * .5; buddyG.add(eye); });
    buddyG.scale.setScalar(.28); buddyG.position.set(-2.1, -.4, .4);
  }
}
function tickBuddy(t) {
  const b = S.buddy; if (b === 'none') return;
  if (b === 'cat') { const tail = buddyG.getObjectByName('tail'); if (tail) tail.rotation.x = Math.sin(t * 2.5) * .5; }
  if (b === 'pigeon') { const h = buddyG.getObjectByName('head'); if (h) h.position.x = .17 + (Math.sin(t * 6) > .3 ? .05 : 0); buddyG.position.x = 1.7 + Math.sin(t * .4) * .3; }
  if (b === 'rat') { const a = t * 1.1; buddyG.position.set(Math.cos(a) * 1.9, -1.98, Math.sin(a) * 1.0 + .5); buddyG.rotation.y = -a + Math.PI / 2 + Math.PI; }
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
  if (f === 'flames') { flameCv = document.createElement('canvas'); flameCv.width = 64; flameCv.height = 96; flameTex = new THREE.CanvasTexture(flameCv); flameTex.colorSpace = THREE.SRGBColorSpace; [-1.3, 1.3].forEach(x => { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: flameTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); sp.scale.set(.55, .8, 1); sp.userData.x = x; fxG.add(sp); }); }
}
function tickFx(t) {
  const f = S.effect; if (f === 'none') return;
  const gp = ghost.position;
  if (f === 'sparkle') fxG.children.forEach(sp => { const i = sp.userData.i, ph = (t * 2 + i * 1.3) % 4; sp.visible = ph < .6; const a = i * 2.4 + Math.floor((t * 2 + i * 1.3) / 4); sp.position.set(gp.x + Math.cos(a) * 1.3, gp.y + Math.sin(a * 1.7) * 1.1, gp.z + Math.sin(a) * 1.0); sp.material.rotation = ph * 2; });
  if (f === 'notes') fxG.children.forEach(sp => { const i = sp.userData.i, ph = ((t * .5 + i * .33) % 1); sp.position.set(gp.x + 1.2 + Math.sin(t * 2 + i) * .15, gp.y + .2 + ph * 1.6, gp.z + .3 - i * .3); sp.material.opacity = ph < .8 ? 1 : (1 - ph) * 5; });
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
    const e = EYES[S.eyes]; faceMat.emissive.set(e.glow ? '#ffffff' : '#000000'); faceMat.emissiveMap = e.glow ? faceTex : null; faceMat.emissiveIntensity = e.glow; faceMat.needsUpdate = true; paintFace();
    outline.visible = S.outline;
    buildItems(); buildScene(); buildBuddy(); buildFx();
  }

  const resize = () => { const w = canvas.clientWidth, h = canvas.clientHeight; if (!w || !h) return; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); };
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
  let lastInput = performance.now(), lastFrame = 0, nextTrick = t0 + 4000;
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
  api.setGhost = g => { const n = ghostOf(g); S = { ...n, wear: n.scuff, board: S.board }; applyAll(); wake(); };
  api.setLook = async (l, st = stickers) => { const m2 = await makeBoardModel(renderer, { look: l, stickers: st }); flip.remove(model.board); model.dispose(); model = m2; flip.add(m2.board); m2.board.scale.setScalar(1 / K * 1.05); wake(); };
  return api;
}

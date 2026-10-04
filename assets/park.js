import * as THREE from 'three';

/* Veľkosti plochy v dlaždiciach. Staré parky (uložené ako pole) sú S. */
export const SIZES = {
  S: { w: 10, d: 8, name: 'Malá' },
  M: { w: 14, d: 10, name: 'Stredná' },
  L: { w: 18, d: 12, name: 'Veľká' },
};
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const uid = () => Math.random().toString(36).slice(2, 10);
const LS = {
  get(k, f) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : f; } catch { return f; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } },
};

export const TYPES = {
  kicker:   { name: 'Kicker',     w: 1, d: 1, icon: '<path d="M4 22H36V8Z"/>' },
  rail:     { name: 'Rail',       w: 2, d: 1, icon: '<rect x="3" y="7" width="34" height="3"/><rect x="8" y="7" width="3" height="15"/><rect x="29" y="7" width="3" height="15"/>' },
  kinkrail: { name: 'Kink rail',  w: 3, d: 1, icon: '<path d="M3 6H12L28 14H37" fill="none" stroke="currentColor" stroke-width="3"/><rect x="5" y="6" width="3" height="16"/><rect x="32" y="14" width="3" height="8"/><rect x="18" y="10" width="3" height="12"/>' },
  flatbar:  { name: 'Flatbar',    w: 2, d: 1, icon: '<rect x="3" y="13" width="34" height="3"/><rect x="8" y="13" width="3" height="9"/><rect x="29" y="13" width="3" height="9"/>' },
  ledge:    { name: 'Ledge',      w: 2, d: 1, icon: '<rect x="3" y="10" width="34" height="12"/>' },
  manual:   { name: 'Manual pad', w: 2, d: 1, icon: '<rect x="3" y="15" width="34" height="7"/>' },
  bench:    { name: 'Lavička',    w: 2, d: 1, icon: '<rect x="3" y="8" width="34" height="3"/><rect x="2" y="14" width="36" height="2"/><rect x="8" y="11" width="3" height="11"/><rect x="29" y="11" width="3" height="11"/>' },
  quarter:  { name: 'Quarter',    w: 1, d: 2, icon: '<path d="M4 22Q33 22 33 4H36V22Z"/>' },
  wallride: { name: 'Wallride',   w: 2, d: 1, icon: '<rect x="28" y="2" width="5" height="20"/><path d="M10 22Q28 22 28 14V22Z"/>' },
  bank:     { name: 'Bank',       w: 2, d: 2, icon: '<path d="M2 22H38V5Z"/>' },
  spine:    { name: 'Spine',      w: 2, d: 2, icon: '<path d="M2 22Q19 22 19 6H21Q21 22 38 22Z"/>' },
  stairs:   { name: 'Schody',     w: 2, d: 2, icon: '<path d="M2 22V18H9V14H16V10H38V22Z"/><path d="M3 12L16 4H37" fill="none" stroke="currentColor" stroke-width="2"/>' },
  funbox:   { name: 'Funbox',     w: 3, d: 2, icon: '<path d="M2 22L12 10H28L38 22Z"/>' },
  hubba:    { name: 'Hubba',      w: 3, d: 2, icon: '<path d="M2 22V19H8V16H14V13H20V10H38V22Z"/><path d="M2 15L20 5H38V8H20L2 18Z"/>' },
  minirampa:{ name: 'Minirampa',  w: 3, d: 2, icon: '<path d="M2 9H5Q5 21 13 21H27Q35 21 35 9H38V23H2Z"/>' },
  pyramid:  { name: 'Pyramída',   w: 3, d: 3, icon: '<path d="M2 22L16 7H24L38 22Z"/>' },
  halfpipe: { name: 'U-rampa',    w: 4, d: 2, icon: '<path d="M2 3H5Q5 21 15 21H25Q35 21 35 3H38V23H2Z"/>' },
};

/* Farby prekážok. null = prirodzený materiál (betón, drevo, kov). */
export const PAINTS = {
  natural: { name: 'Prirodzená', hex: null },
  red: { name: 'Červená', hex: 0xa01d21 },
  black: { name: 'Čierna', hex: 0x2a2a2a },
  white: { name: 'Biela', hex: 0xefebe2 },
  blue: { name: 'Modrá', hex: 0x2f5fa8 },
  yellow: { name: 'Žltá', hex: 0xe8b422 },
  green: { name: 'Zelená', hex: 0x3f8a4f },
  pink: { name: 'Ružová', hex: 0xe07aa6 },
};

const MAT = {
  concrete: new THREE.MeshStandardMaterial({ color: 0xd8d2c6, roughness: .92 }),
  concreteDark: new THREE.MeshStandardMaterial({ color: 0xa8a194, roughness: .95 }),
  ply: new THREE.MeshStandardMaterial({ color: 0xc79d63, roughness: .8 }),
  plyEdge: new THREE.MeshStandardMaterial({ color: 0x8f6a3e, roughness: .85 }),
  steel: new THREE.MeshStandardMaterial({ color: 0xc9ccd0, metalness: .55, roughness: .38 }),
  red: new THREE.MeshStandardMaterial({ color: 0xa01d21, roughness: .45, metalness: .15 }),
};
const paintCache = new Map();
function paintMat(key) {
  if (!paintCache.has(key)) paintCache.set(key, new THREE.MeshStandardMaterial({ color: PAINTS[key].hex, roughness: .6, metalness: .05 }));
  return paintCache.get(key);
}
const PAINTABLE = new Set([MAT.concrete, MAT.ply, MAT.red]);

function mesh(geo, mat) { const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true; return m; }
function box(w, h, d, mat, x = 0, y = h / 2, z = 0) { const m = mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); return m; }
function cyl(r1, r2, h, mat, seg = 16) { return mesh(new THREE.CylinderGeometry(r1, r2, h, seg), mat); }
/* hranol: profil v rovine xy, vytiahnutý do hĺbky d okolo z = 0 */
function prism(pts, d, surf, side) {
  const s = new THREE.Shape(); s.moveTo(...pts[0]); for (const p of pts.slice(1)) s.lineTo(...p); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false }); g.translate(0, 0, -d / 2);
  return mesh(g, [side, surf]);
}
const wedge = (w, h, d, surf, side) => prism([[-w / 2, 0], [w / 2, 0], [w / 2, h]], d, surf, side);
function quarter(h, d, R) {
  const w = 1, deck = .12, r = Math.min(R, w - deck, h);
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(w / 2, h); s.lineTo(-w / 2 + r, h); s.lineTo(-w / 2 + r, r);
  s.absarc(-w / 2, r, r, 0, -Math.PI / 2, true);
  const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false, curveSegments: 24 }); g.translate(0, 0, -d / 2);
  const grp = new THREE.Group(); grp.add(mesh(g, [MAT.plyEdge, MAT.ply]));
  const cop = cyl(.035, .035, d, MAT.steel, 12); cop.rotation.x = Math.PI / 2; cop.position.set(-w / 2 + r, h, 0); grp.add(cop);
  return grp;
}
function buildObstacle(type, paint) {
  const g = new THREE.Group();
  switch (type) {
    case 'kicker': g.add(wedge(.94, .42, .9, MAT.ply, MAT.plyEdge), box(.12, .012, .9, MAT.steel, -.41, .006)); break;
    case 'rail': {
      const bar = cyl(.035, .035, 1.84, MAT.red); bar.rotation.z = Math.PI / 2; bar.position.y = .4; g.add(bar);
      for (const x of [-.72, .72]) { const p = cyl(.028, .028, .4, MAT.red, 12); p.position.set(x, .2, 0); g.add(p, box(.16, .02, .16, MAT.steel, x, .01, 0)); }
      break;
    }
    case 'kinkrail': {
      const pts = [[-1.45, .45], [-.55, .45], [.55, .85], [1.45, .85]];
      for (let i = 0; i < pts.length - 1; i++) {
        const [[x1, y1], [x2, y2]] = [pts[i], pts[i + 1]], len = Math.hypot(x2 - x1, y2 - y1);
        const bar = cyl(.035, .035, len, MAT.red, 12); bar.position.set((x1 + x2) / 2, (y1 + y2) / 2, 0); bar.rotation.z = Math.atan2(y2 - y1, x2 - x1) - Math.PI / 2; g.add(bar);
      }
      for (const [x, y] of [[-1.3, .45], [0, .65], [1.3, .85]]) { const p = cyl(.028, .028, y, MAT.red, 12); p.position.set(x, y / 2, 0); g.add(p, box(.16, .02, .16, MAT.steel, x, .01, 0)); }
      break;
    }
    case 'flatbar': {
      g.add(box(1.84, .05, .05, MAT.red, 0, .25));
      for (const x of [-.72, .72]) g.add(box(.05, .25, .05, MAT.red, x, .125), box(.05, .02, .5, MAT.red, x, .01));
      break;
    }
    case 'ledge': g.add(box(1.84, .4, .6, MAT.concrete), box(1.84, .04, .04, MAT.steel, 0, .4, .3), box(1.84, .04, .04, MAT.steel, 0, .4, -.3)); break;
    case 'manual': g.add(box(1.84, .2, .9, MAT.concrete), box(1.84, .03, .03, MAT.steel, 0, .2, .45), box(1.84, .03, .03, MAT.steel, 0, .2, -.45)); break;
    case 'bench':
      g.add(box(1.7, .06, .5, MAT.ply, 0, .72), box(1.7, .05, .2, MAT.ply, 0, .45, .37), box(1.7, .05, .2, MAT.ply, 0, .45, -.37));
      for (const x of [-.7, .7]) g.add(box(.06, .7, .06, MAT.steel, x, .35), box(.06, .06, .9, MAT.steel, x, .42));
      break;
    case 'wallride': {
      g.add(box(1.84, 1.2, .15, MAT.concrete, 0, .6, .35), box(1.84, .04, .19, MAT.steel, 0, 1.2, .35));
      const w = wedge(.4, .35, 1.84, MAT.concrete, MAT.concreteDark); w.rotation.y = -Math.PI / 2; w.position.z = .075; g.add(w);
      break;
    }
    case 'bank': g.add(wedge(1.9, .7, 1.9, MAT.concrete, MAT.concreteDark)); break;
    case 'quarter': g.add(quarter(.9, 1.9, .86)); break;
    case 'spine': {
      const a = quarter(.75, 1.9, .75); a.position.x = -.5;
      const b = quarter(.75, 1.9, .75); b.position.x = .5; b.rotation.y = Math.PI;
      g.add(a, b); break;
    }
    case 'halfpipe': {
      const a = quarter(.8, 1.9, .8); a.position.x = 1.5;
      const b = quarter(.8, 1.9, .8); b.position.x = -1.5; b.rotation.y = Math.PI;
      g.add(a, b, box(2, .03, 1.9, MAT.ply)); break;
    }
    case 'minirampa': {
      const a = quarter(.5, 1.9, .5); a.position.x = 1;
      const b = quarter(.5, 1.9, .5); b.position.x = -1; b.rotation.y = Math.PI;
      g.add(a, b, box(1, .03, 1.9, MAT.ply)); break;
    }
    case 'funbox': {
      const l = wedge(1, .45, 1.9, MAT.concrete, MAT.concreteDark); l.position.x = -1;
      const r = wedge(1, .45, 1.9, MAT.concrete, MAT.concreteDark); r.position.x = 1; r.rotation.y = Math.PI;
      g.add(box(1, .45, 1.9, MAT.concrete), l, r, box(1, .04, .04, MAT.steel, 0, .45, .95), box(1, .04, .04, MAT.steel, 0, .45, -.95)); break;
    }
    case 'pyramid': {
      const p = mesh(new THREE.CylinderGeometry(.65 * Math.SQRT2, 1.45 * Math.SQRT2, .5, 4, 1), MAT.concrete);
      p.rotation.y = Math.PI / 4; p.position.y = .25; g.add(p);
      g.add(box(1.3, .03, .03, MAT.steel, 0, .5, .65), box(1.3, .03, .03, MAT.steel, 0, .5, -.65));
      break;
    }
    case 'stairs': {
      g.add(box(1, .5, 1.9, MAT.concrete, .5));
      for (let i = 0; i < 3; i++) g.add(box(1 / 3, (i + 1) * .5 / 3, 1.9, MAT.concrete, -1 + (i + .5) / 3));
      const bar = cyl(.03, .03, Math.hypot(1, .5), MAT.red, 12);
      bar.position.set(-.5, .67, .72); bar.rotation.z = Math.atan2(.5, 1) - Math.PI / 2; g.add(bar);
      const p1 = cyl(.025, .025, .31, MAT.red, 10); p1.position.set(-.9, .322, .72);
      const p2 = cyl(.025, .025, .37, MAT.red, 10); p2.position.set(-.1, .685, .72); g.add(p1, p2);
      break;
    }
    case 'hubba': {
      const top = .6, z0 = -1, z1 = .5;   // schody v z0..z1, hubba ledge vedľa nich
      g.add(box(1, top, z1 - z0, MAT.concrete, 1, top / 2, (z0 + z1) / 2));
      for (let i = 0; i < 4; i++) { const h = (i + 1) * top / 5; g.add(box(.5, h, z1 - z0, MAT.concrete, -1.5 + (i + .5) * .5, h / 2, (z0 + z1) / 2)); }
      g.add(prism([[-1.5, 0], [1.5, 0], [1.5, top + .3], [.5, top + .3], [-1.5, .3]], .45, MAT.concrete, MAT.concreteDark));
      g.children.at(-1).position.z = .75;
      break;
    }
  }
  if (paint && PAINTS[paint]?.hex != null) {
    const pm = paintMat(paint);
    const swap = m => PAINTABLE.has(m) ? pm : m;
    g.traverse(o => { if (o.isMesh) o.material = Array.isArray(o.material) ? o.material.map(swap) : swap(o.material); });
  }
  return g;
}

export const footprint = it => { const t = TYPES[it.type]; return it.rot % 2 === 0 ? { w: t.w, d: t.d } : { w: t.d, d: t.w }; };
function fits(park, c, ignoreId) {
  const f = footprint(c), S = SIZES[park.size];
  if (c.x < 0 || c.z < 0 || c.x + f.w > S.w || c.z + f.d > S.d) return false;
  return !park.items.some(it => {
    if (it.id === ignoreId) return false;
    const g = footprint(it);
    return c.x < it.x + g.w && c.x + f.w > it.x && c.z < it.z + g.d && c.z + f.d > it.z;
  });
}
/* Prijme starý formát (pole prekážok) aj nový { size, items }. Vráti { size, items } s id. */
export function cleanLayout(raw) {
  const list = Array.isArray(raw) ? raw : Array.isArray(raw?.items) ? raw.items : [];
  const out = { size: !Array.isArray(raw) && SIZES[raw?.size] ? raw.size : 'S', items: [] };
  for (const r of list.slice(0, 150)) {
    if (!r || !TYPES[r.type]) continue;
    const it = { id: uid(), type: r.type, x: r.x | 0, z: r.z | 0, rot: ((r.rot | 0) % 4 + 4) % 4 };
    if (PAINTS[r.color]?.hex != null) it.color = r.color;
    if (fits(out, it)) out.items.push(it);
  }
  return out;
}
/* Na uloženie. Malá plocha bez farieb ostáva v starom formáte (pole), aby jej rozumeli aj staršie verzie webu. */
export function slimLayout(park) {
  const items = park.items.map(({ type, x, z, rot, color }) => color ? { type, x, z, rot, color } : { type, x, z, rot });
  return park.size === 'S' && !items.some(i => i.color) ? items : { size: park.size, items };
}

function makeParkScene() {
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xfff8ee, 0x8a8276, 1.15));
  const sun = new THREE.DirectionalLight(0xffffff, 2.1); sun.position.set(6, 11, 4); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -.0006; scene.add(sun);
  const floor = new THREE.Group(); scene.add(floor);
  const itemsGroup = new THREE.Group(); scene.add(itemsGroup);
  const ps = { scene, itemsGroup, ground: null, size: null };
  ps.setSize = size => {
    if (ps.size === size) return;
    ps.size = size;
    const { w: W, d: D } = SIZES[size];
    for (const ch of [...floor.children]) { ch.geometry.dispose(); floor.remove(ch); }
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ color: 0xbdb6aa, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; floor.add(ground); ps.ground = ground;
    const t = .16;
    floor.add(box(W + 2 * t, .09, t, MAT.concreteDark, 0, .045, D / 2 + t / 2), box(W + 2 * t, .09, t, MAT.concreteDark, 0, .045, -D / 2 - t / 2),
              box(t, .09, D, MAT.concreteDark, W / 2 + t / 2, .045, 0), box(t, .09, D, MAT.concreteDark, -W / 2 - t / 2, .045, 0));
    const pts = [];
    for (let x = 0; x <= W; x++) pts.push(x - W / 2, .004, -D / 2, x - W / 2, .004, D / 2);
    for (let z = 0; z <= D; z++) pts.push(-W / 2, .004, z - D / 2, W / 2, .004, z - D / 2);
    const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    floor.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x8f887b, transparent: true, opacity: .55 })));
    const r = Math.max(W, D) / 2 + 2;
    Object.assign(sun.shadow.camera, { left: -r, right: r, top: r, bottom: -r, near: 1, far: 40 }); sun.shadow.camera.updateProjectionMatrix();
  };
  return ps;
}
function disposeTree(o) { o.traverse(m => { if (m.isMesh) m.geometry.dispose(); }); }
function fillPark(group, park) {
  for (const ch of [...group.children]) { disposeTree(ch); group.remove(ch); }
  const S = SIZES[park.size];
  for (const it of park.items) group.add(placeObject(buildObstacle(it.type, it.color), it, S));
}
function placeObject(o, it, S) {
  const f = footprint(it);
  o.position.set(it.x + f.w / 2 - S.w / 2, 0, it.z + f.d / 2 - S.d / 2);
  o.rotation.y = -it.rot * Math.PI / 2;
  o.userData.id = it.id; o.traverse(m => { m.userData.id = it.id; });
  return o;
}

/* Kamera: najprv zarovná celú plochu do záberu, potom priblíži (zoom) a posunie (pan). */
export const defaultView = () => ({ angle: Math.PI / 2 - .5, elev: .9, zoom: 1, panX: 0, panZ: 0 });
function aimCamera(cam, view, aspect, size) {
  const { w: W, d: D } = SIZES[size];
  const fit = [];
  for (const x of [-W / 2 - .2, W / 2 + .2]) for (const z of [-D / 2 - .2, D / 2 + .2]) for (const y of [0, 1]) fit.push(new THREE.Vector3(x, y, z));
  const el = clamp(view.elev + (aspect < 1.3 ? .12 : 0), .3, 1.5), tf = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
  const dir = new THREE.Vector3(Math.cos(view.angle) * Math.cos(el), Math.sin(el), Math.sin(view.angle) * Math.cos(el));
  const target = new THREE.Vector3(0, .2, 0), v = new THREE.Vector3(), right = new THREE.Vector3(), up = new THREE.Vector3();
  cam.aspect = aspect; cam.updateProjectionMatrix();
  let dist = 20;
  const place = () => { cam.position.copy(dir).multiplyScalar(dist).add(target); cam.lookAt(target); cam.updateMatrixWorld(); };
  for (let k = 0; k < 10; k++) {
    place();
    let x0 = 9, x1 = -9, y0 = 9, y1 = -9;
    for (const p of fit) { v.copy(p).project(cam); x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y); }
    right.setFromMatrixColumn(cam.matrixWorld, 0); up.setFromMatrixColumn(cam.matrixWorld, 1);
    target.addScaledVector(right, (x0 + x1) / 2 * dist * tf * aspect).addScaledVector(up, (y0 + y1) / 2 * dist * tf);
    dist *= Math.max((x1 - x0) / 2, (y1 - y0) / 2) / .92;
  }
  dist *= view.zoom || 1;
  target.x += view.panX || 0; target.z += view.panZ || 0;
  place();
  return dist;
}

/* náhľady parkov */
let thumbR = null;
const thumbCache = new Map();
export function renderThumb(layout, cacheKey) {
  if (cacheKey && thumbCache.has(cacheKey)) return thumbCache.get(cacheKey);
  const park = layout?.size && Array.isArray(layout.items) && layout.items.every(i => i.id) ? layout : cleanLayout(layout);
  if (!thumbR) {
    const c = document.createElement('canvas');
    const r = new THREE.WebGLRenderer({ canvas: c, antialias: true, preserveDrawingBuffer: true });
    r.setPixelRatio(1); r.setSize(480, 300, false); r.shadowMap.enabled = true; r.setClearColor(0xe7ddcb, 1);
    const ps = makeParkScene(), cam = new THREE.PerspectiveCamera(35, 1.6, .1, 200);
    ps.setSize('S'); aimCamera(cam, defaultView(), 1.6, 'S');
    r.render(ps.scene, cam);   // prvé vykreslenie niekedy vyjde prázdne
    thumbR = { r, ps, cam };
  }
  thumbR.ps.setSize(park.size); aimCamera(thumbR.cam, defaultView(), 1.6, park.size);
  fillPark(thumbR.ps.itemsGroup, park);
  thumbR.r.render(thumbR.ps.scene, thumbR.cam);
  const url = thumbR.r.domElement.toDataURL('image/jpeg', .8);
  if (cacheKey) thumbCache.set(cacheKey, url);
  return url;
}

/* stav stavebnice prežije prechod medzi stránkami */
const B = { park: null, tool: 'kicker', placeRot: 0, paint: 'natural', selected: null, viewing: null, draft: null, view: defaultView(), undo: [], redo: [] };

export function mountBuilder(root) {
  const $ = s => root.querySelector(s);
  const canvas = $('.park-canvas');
  canvas.tabIndex = 0;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const ps = makeParkScene(), { scene, itemsGroup } = ps;
  const camera = new THREE.PerspectiveCamera(35, 1, .1, 200);
  const hover = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .6, depthWrite: false }));
  hover.rotation.x = -Math.PI / 2; hover.position.y = .012; hover.visible = false; scene.add(hover);
  const frame = new THREE.Group(); scene.add(frame);
  const frameMat = new THREE.MeshBasicMaterial({ color: 0xa01d21 });
  let raf = 0;
  const draw = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; renderer.render(scene, camera); }); };
  const say = t => { $('.status').textContent = t; };
  if (!B.park) B.park = cleanLayout(LS.get('gosko:draft', []));
  const S = () => SIZES[B.park.size];
  const finePointer = matchMedia('(pointer: fine)').matches;

  let camDist = 20;
  function aim() { camDist = aimCamera(camera, B.view, camera.aspect || 1, B.park.size); draw(); }
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight; if (!w || !h) return;
    renderer.setSize(w, h, false); camera.aspect = w / h; aim();
  }
  const ro = new ResizeObserver(resize); ro.observe(canvas);

  /* ---------- história (späť / znova) ---------- */
  const snap = () => JSON.stringify(B.park);
  function remember() { B.undo.push(snap()); if (B.undo.length > 100) B.undo.shift(); B.redo = []; syncButtons(); }
  function restore(json) { B.park = JSON.parse(json); if (!B.park.items.some(i => i.id === B.selected)) B.selected = null; ps.setSize(B.park.size); aim(); rebuild(); saveDraft(); syncSizes(); }
  function undo() { if (B.viewing || !B.undo.length) return; B.redo.push(snap()); restore(B.undo.pop()); say('Späť.'); syncButtons(); }
  function redo() { if (B.viewing || !B.redo.length) return; B.undo.push(snap()); restore(B.redo.pop()); say('Znova.'); syncButtons(); }

  function syncButtons() {
    const it = sel();
    for (const a of ['delete', 'duplicate']) { const b = $(`[data-act=${a}]`); if (b) b.disabled = !it || !!B.viewing; }
    const u = $('[data-act=undo]'), r = $('[data-act=redo]');
    if (u) u.disabled = !B.undo.length || !!B.viewing;
    if (r) r.disabled = !B.redo.length || !!B.viewing;
    root.querySelectorAll('.swatch').forEach(s => s.setAttribute('aria-pressed', String(s.dataset.paint === (it ? it.color || 'natural' : B.paint))));
  }
  const sel = () => B.park.items.find(i => i.id === B.selected);

  function updateFrame() {
    for (const ch of [...frame.children]) { ch.geometry.dispose(); frame.remove(ch); }
    syncButtons();
    const it = sel();
    if (!it) return;
    const f = footprint(it), cx = it.x + f.w / 2 - S().w / 2, cz = it.z + f.d / 2 - S().d / 2, b = .1, h = .05;
    const add = (w, d, x, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), frameMat); m.position.set(x, h / 2 + .005, z); frame.add(m); };
    add(f.w + b, b, cx, cz - f.d / 2); add(f.w + b, b, cx, cz + f.d / 2);
    add(b, f.d + b, cx - f.w / 2, cz); add(b, f.d + b, cx + f.w / 2, cz);
  }
  function rebuild() { fillPark(itemsGroup, B.park); updateFrame(); draw(); }
  function select(id) { B.selected = id; updateFrame(); draw(); }
  function saveDraft() { if (!B.viewing) LS.set('gosko:draft', slimLayout(B.park)); }
  const objectOf = id => itemsGroup.children.find(o => o.userData.id === id);

  /* ---------- myš a dotyk ---------- */
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const aimRay = e => { const r = canvas.getBoundingClientRect(); ndc.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1); ray.setFromCamera(ndc, camera); };
  const tileAt = () => { const h = ray.intersectObject(ps.ground)[0]; return h ? { tx: Math.floor(h.point.x + S().w / 2), tz: Math.floor(h.point.z + S().d / 2) } : null; };
  const itemAt = () => { const h = ray.intersectObjects(itemsGroup.children, true)[0]; return h ? h.object.userData.id : null; };
  const anchor = (type, rot, tx, tz) => { const f = footprint({ type, rot }); return { x: clamp(tx - Math.floor((f.w - 1) / 2), 0, S().w - f.w), z: clamp(tz - Math.floor((f.d - 1) / 2), 0, S().d - f.d) }; };

  function showHover(type, rot, a, ok) {
    const f = footprint({ type, rot });
    hover.scale.set(f.w, f.d, 1); hover.position.set(a.x + f.w / 2 - S().w / 2, .012, a.z + f.d / 2 - S().d / 2);
    hover.material.color.set(ok ? 0xffffff : 0xa01d21); hover.visible = true; draw();
  }
  function placeAt(type, e) {
    aimRay(e);
    const t = tileAt(); if (!t) { say('Prekážku polož na plochu.'); return false; }
    const cand = { id: uid(), type, rot: B.placeRot, ...anchor(type, B.placeRot, t.tx, t.tz) };
    if (B.paint !== 'natural') cand.color = B.paint;
    if (!fits(B.park, cand)) { say('Sem sa to nezmestí. Skús iné miesto alebo prekážku otoč (R).'); return false; }
    remember(); B.park.items.push(cand); hover.visible = false; rebuild(); select(cand.id); saveDraft(); say('');
    return true;
  }

  /* gesto: ťuk = položiť/vybrať, ťahanie prekážky = presun, ťahanie plochy = otáčanie pohľadu,
     pravé tlačidlo = otáčanie, stredné alebo Shift = posun pohľadu, koliesko = priblíženie */
  let g = null;
  function startDrag(e) {
    const it = B.park.items.find(i => i.id === g.id); if (!it) { g = null; return; }
    g.mode = 'move'; g.orig = { x: it.x, z: it.z }; g.moved = false;
    select(it.id); canvas.style.cursor = 'grabbing';
    const o = objectOf(it.id); if (o) o.position.y = .08;
    if (navigator.vibrate && e.pointerType === 'touch') navigator.vibrate(15);
    say('Presúvaš prekážku. Pusť ju na voľné miesto.'); draw();
  }
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('pointerdown', e => {
    canvas.focus({ preventScroll: true });
    aimRay(e);
    const id = !B.viewing && e.button === 0 && !e.shiftKey ? itemAt() : null;
    g = { pid: e.pointerId, x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, type: e.pointerType, btn: e.button, shift: e.shiftKey, id, mode: 'pending' };
    if (e.pointerType === 'mouse') canvas.setPointerCapture(e.pointerId);
    if (id && e.pointerType !== 'mouse') {
      // na dotyku sa prekážka chytí podržaním prsta
      g.timer = setTimeout(() => { if (g?.mode === 'pending') { canvas.setPointerCapture?.(g.pid); startDrag(e); } }, 280);
    }
    if (id) { const it = B.park.items.find(i => i.id === id); aimRay(e); const t = tileAt(); g.grab = t ? { dx: t.tx - it.x, dz: t.tz - it.z } : { dx: 0, dz: 0 }; }
  });
  canvas.addEventListener('pointermove', e => {
    if (!g || e.pointerId !== g.pid) { if (e.pointerType === 'mouse') hoverAt(e); return; }
    const dist = Math.hypot(e.clientX - g.x, e.clientY - g.y);
    if (g.mode === 'pending' && dist > (g.type === 'mouse' ? 4 : 10)) {
      clearTimeout(g.timer);
      if (g.id && g.type === 'mouse') startDrag(e);
      else if (g.btn === 1 || g.shift) g.mode = 'pan';
      else if (g.type === 'mouse' || Math.abs(e.clientX - g.x) > Math.abs(e.clientY - g.y)) g.mode = 'orbit';
      else { g = null; return; }   // zvislé ťahanie prstom posúva stránku
    }
    const dx = e.clientX - g.lx, dy = e.clientY - g.ly; g.lx = e.clientX; g.ly = e.clientY;
    if (g.mode === 'move') {
      aimRay(e);
      const it = B.park.items.find(i => i.id === g.id), t = tileAt(); if (!it || !t) return;
      const f = footprint(it);
      const c = { ...it, x: clamp(t.tx - g.grab.dx, 0, S().w - f.w), z: clamp(t.tz - g.grab.dz, 0, S().d - f.d) };
      if (c.x === it.x && c.z === it.z) { hover.visible = false; draw(); return; }
      if (fits(B.park, c, it.id)) {
        it.x = c.x; it.z = c.z; g.moved = true; hover.visible = false;
        const o = objectOf(it.id); if (o) { placeObject(o, it, S()); o.position.y = .08; }
        updateFrame(); draw();
      } else showHover(it.type, it.rot, c, false);
    } else if (g.mode === 'orbit') {
      B.view.angle += dx * .008; B.view.elev = clamp(B.view.elev - dy * .006, .3, 1.45); aim();
    } else if (g.mode === 'pan') {
      const k = camDist * .0016 * 600 / Math.max(300, canvas.clientWidth);
      const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0); right.y = 0; right.normalize();
      const fwd = new THREE.Vector3(right.z, 0, -right.x);
      B.view.panX = clamp(B.view.panX - (right.x * dx - fwd.x * dy) * k, -S().w / 2, S().w / 2);
      B.view.panZ = clamp(B.view.panZ - (right.z * dx - fwd.z * dy) * k, -S().d / 2, S().d / 2);
      aim();
    }
  });
  canvas.addEventListener('touchmove', e => { if (g && (g.mode === 'move' || g.mode === 'orbit')) e.preventDefault(); }, { passive: false });
  function endGesture(e, cancelled) {
    if (!g || (e && e.pointerId !== g.pid)) return;
    clearTimeout(g.timer);
    const done = g; g = null;
    if (done.mode === 'move') {
      const it = B.park.items.find(i => i.id === done.id);
      if (it && done.moved) { const now = { x: it.x, z: it.z }; Object.assign(it, done.orig); remember(); Object.assign(it, now); saveDraft(); }
      hover.visible = false; rebuild(); say(''); canvas.style.cursor = '';
    } else if (done.mode === 'pending' && !cancelled && done.btn === 0) tap(e, done.id);
  }
  canvas.addEventListener('pointerup', e => endGesture(e, false));
  canvas.addEventListener('pointercancel', e => endGesture(e, true));
  canvas.addEventListener('pointerleave', e => { if (!g) { hover.visible = false; draw(); } });
  canvas.addEventListener('wheel', e => {
    if (document.activeElement !== canvas && !e.ctrlKey) return;   // stránka sa dá ďalej rolovať, kým neklikneš do plochy
    e.preventDefault();
    B.view.zoom = clamp(B.view.zoom * Math.exp(e.deltaY * .0012), .3, 1.6); aim();
  }, { passive: false });

  function tap(e, id) {
    if (B.viewing) return;
    if (id) { select(id); say(finePointer ? 'Ťahaj myšou, R otočí, Delete zmaže.' : 'Podrž a ťahaj, alebo použi tlačidlá dole.'); return; }
    if (!B.tool) { select(null); return; }
    placeAt(B.tool, e);
  }
  function hoverAt(e) {
    if (B.viewing) { hover.visible = false; draw(); return; }
    aimRay(e);
    if (itemAt()) { hover.visible = false; canvas.style.cursor = 'grab'; draw(); return; }
    if (!B.tool) { canvas.style.cursor = ''; hover.visible = false; draw(); return; }
    canvas.style.cursor = 'crosshair';
    const t = tileAt(); if (!t) { hover.visible = false; draw(); return; }
    const a = anchor(B.tool, B.placeRot, t.tx, t.tz);
    showHover(B.tool, B.placeRot, a, fits(B.park, { type: B.tool, rot: B.placeRot, ...a }));
  }

  /* ---------- nástroje: klik vyberie, potiahnutie myšou na plochu rovno položí ---------- */
  const tools = $('.tools');
  function setTool(key) {
    B.tool = key;
    tools.querySelectorAll('.tool').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.type === B.tool)));
    select(null); say(B.tool ? `${TYPES[key].name}: ${finePointer ? 'klikni na plochu alebo ju sem potiahni' : 'ťukni na plochu'}.` : '');
  }
  Object.entries(TYPES).forEach(([key, t], i) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'tool'; b.dataset.type = key;
    b.setAttribute('aria-pressed', String(key === B.tool));
    if (i < 9) b.title = `${t.name} (kláves ${i + 1})`;
    b.innerHTML = `<svg viewBox="0 0 40 24" aria-hidden="true">${t.icon}</svg>`;
    const n = document.createElement('span'); n.textContent = t.name;
    const s = document.createElement('small'); s.textContent = `${t.w}×${t.d}`;
    b.append(n, s);
    let dragged = false;
    b.addEventListener('click', () => { if (dragged) { dragged = false; return; } setTool(B.tool === key ? null : key); });
    b.addEventListener('pointerdown', e => {
      if (e.pointerType !== 'mouse' || e.button !== 0 || B.viewing) return;
      e.preventDefault(); dragged = false;
      const over = ev => { const r = canvas.getBoundingClientRect(); return ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom; };
      const move = ev => {
        if (!dragged && Math.hypot(ev.clientX - e.clientX, ev.clientY - e.clientY) < 6) return;
        if (!dragged) { dragged = true; if (B.tool !== key) setTool(key); document.body.style.cursor = 'grabbing'; }
        if (over(ev)) { aimRay(ev); const t = tileAt(); if (t) { const a = anchor(key, B.placeRot, t.tx, t.tz); showHover(key, B.placeRot, a, fits(B.park, { type: key, rot: B.placeRot, ...a })); } }
        else { hover.visible = false; draw(); }
      };
      const up = ev => {
        removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', up);
        document.body.style.cursor = '';
        if (dragged && ev.type === 'pointerup' && over(ev)) placeAt(key, ev);
        hover.visible = false; draw();
      };
      addEventListener('pointermove', move); addEventListener('pointerup', up); addEventListener('pointercancel', up);
    });
    tools.append(b);
  });

  /* ---------- farby a veľkosť plochy ---------- */
  const swatches = $('.swatches');
  if (swatches) for (const [key, p] of Object.entries(PAINTS)) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'swatch'; b.dataset.paint = key;
    b.title = p.name; b.setAttribute('aria-label', `Farba: ${p.name}`);
    b.style.setProperty('--sw', p.hex == null ? 'linear-gradient(135deg,#c79d63 50%,#d8d2c6 50%)' : '#' + p.hex.toString(16).padStart(6, '0'));
    b.addEventListener('click', () => {
      if (B.viewing) return;
      const it = sel();
      if (it) {
        if ((it.color || 'natural') === key) return;
        remember(); if (key === 'natural') delete it.color; else it.color = key;
        rebuild(); saveDraft();
      }
      B.paint = key; syncButtons();
      say(it ? `Prekážka je teraz ${p.name.toLowerCase()}.` : `Ďalšie prekážky budú ${p.name.toLowerCase()}.`);
    });
    swatches.append(b);
  }
  const sizes = $('.sizes');
  function syncSizes() { sizes?.querySelectorAll('.chip').forEach(c => c.setAttribute('aria-pressed', String(c.dataset.size === B.park.size))); }
  if (sizes) for (const [key, s] of Object.entries(SIZES)) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.dataset.size = key;
    b.textContent = `${s.name} ${s.w}×${s.d}`;
    b.addEventListener('click', () => {
      if (B.viewing || B.park.size === key) return;
      const next = { size: key, items: B.park.items };
      if (B.park.items.some(it => !fits({ ...next, items: [] }, it))) { say('Niektoré prekážky by sa na menšiu plochu nezmestili. Posuň ich bližšie k rohu alebo ich zmaž.'); return; }
      remember(); B.park.size = key; ps.setSize(key); B.view.panX = B.view.panZ = 0; aim(); rebuild(); saveDraft(); syncSizes();
      say(`Plocha ${s.w}×${s.d} dlaždíc.`);
    });
    sizes.append(b);
  }

  /* ---------- akcie ---------- */
  function rotate() {
    const it = sel();
    if (it) {
      const f0 = footprint(it), rot = (it.rot + 1) % 4;
      const cand = { ...it, rot, ...anchor(it.type, rot, it.x + Math.floor((f0.w - 1) / 2), it.z + Math.floor((f0.d - 1) / 2)) };
      if (fits(B.park, cand, it.id)) { remember(); Object.assign(it, cand); rebuild(); saveDraft(); say(''); } else say('Na otočenie tu nie je miesto.');
    } else { B.placeRot = (B.placeRot + 1) % 4; say('Ďalšia prekážka sa položí otočená.'); }
  }
  function del() {
    if (!B.selected || B.viewing) return;
    remember(); B.park.items = B.park.items.filter(i => i.id !== B.selected); B.selected = null; rebuild(); saveDraft(); say('');
  }
  function duplicate() {
    const it = sel(); if (!it || B.viewing) return;
    const f = footprint(it);
    // najbližšie voľné miesto vedľa originálu
    const spots = [];
    for (let dz = -S().d; dz <= S().d; dz++) for (let dx = -S().w; dx <= S().w; dx++) if (dx || dz) spots.push({ dx, dz });
    spots.sort((a, b) => Math.hypot(a.dx / f.w, a.dz / f.d) - Math.hypot(b.dx / f.w, b.dz / f.d));
    for (const s of spots) {
      const c = { ...it, id: uid(), x: it.x + s.dx, z: it.z + s.dz };
      if (fits(B.park, c)) { remember(); B.park.items.push(c); rebuild(); select(c.id); saveDraft(); say('Prekážka skopírovaná.'); return; }
    }
    say('Na kópiu už nie je miesto.');
  }
  function nudge(dx, dz) {
    const it = sel(); if (!it || B.viewing) return false;
    const c = { ...it, x: it.x + dx, z: it.z + dz };
    if (!fits(B.park, c, it.id)) { say('Tam sa nedá posunúť.'); return true; }
    remember(); Object.assign(it, c); rebuild(); saveDraft(); say(''); return true;
  }
  const act = (name, fn) => { const b = $(`[data-act=${name}]`); if (b) b.addEventListener('click', fn); };
  act('rotate', rotate); act('delete', del); act('duplicate', duplicate); act('undo', undo); act('redo', redo);
  act('clear', () => {
    if (!B.park.items.length || !confirm('Naozaj vyčistiť celú plochu?')) return;
    remember(); B.park.items = []; B.selected = null; rebuild(); saveDraft(); say('Plocha je prázdna. Ctrl+Z ju vráti.');
  });
  act('random', () => {
    if (B.viewing) return;
    const keys = Object.keys(TYPES), park = { size: B.park.size, items: [] };
    const target = Math.round(S().w * S().d / 9);
    for (let n = 0; n < 400 && park.items.length < target; n++) {
      const type = keys[Math.floor(Math.random() * keys.length)], rot = Math.floor(Math.random() * 4), f = footprint({ type, rot });
      const c = { id: uid(), type, rot, x: Math.floor(Math.random() * (S().w - f.w + 1)), z: Math.floor(Math.random() * (S().d - f.d + 1)) };
      // nechá okolo prekážok aspoň dlaždicu voľnú, aby sa dalo jazdiť
      const pad = { ...c, x: c.x - 1, z: c.z - 1 };
      const free = !park.items.some(it => { const g = footprint(it); return pad.x < it.x + g.w && pad.x + f.w + 2 > it.x && pad.z < it.z + g.d && pad.z + f.d + 2 > it.z; });
      if (free && fits(park, c)) { if (B.paint !== 'natural') c.color = B.paint; park.items.push(c); }
    }
    remember(); B.park = park; B.selected = null; rebuild(); saveDraft(); say('Náhodný park. Nepáči sa? Klikni znova alebo Ctrl+Z.');
  });
  act('view', () => { B.view.angle += Math.PI / 2; aim(); });
  act('zoom-in', () => { B.view.zoom = clamp(B.view.zoom / 1.25, .3, 1.6); aim(); });
  act('zoom-out', () => { B.view.zoom = clamp(B.view.zoom * 1.25, .3, 1.6); aim(); });
  act('reset-view', () => { B.view = defaultView(); aim(); });

  /* ---------- klávesnica ---------- */
  function onKey(e) {
    if (!root.isConnected || e.defaultPrevented || document.querySelector('dialog[open]')) return;
    if (e.target.closest?.('input, textarea, select, [contenteditable]')) return;
    const k = e.key, mod = e.ctrlKey || e.metaKey;
    if (mod && (k === 'z' || k === 'Z')) { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if (mod && (k === 'y' || k === 'Y')) { e.preventDefault(); redo(); return; }
    if (mod && (k === 'd' || k === 'D')) { e.preventDefault(); duplicate(); return; }
    if (mod || e.altKey || B.viewing) return;
    if (k === 'r' || k === 'R') rotate();
    else if (k === 'Delete' || k === 'Backspace') { if (B.selected) { e.preventDefault(); del(); } }
    else if (k === 'Escape') { setTool(null); select(null); }
    else if (k === 'q' || k === 'Q') { B.view.angle -= Math.PI / 8; aim(); }
    else if (k === 'e' || k === 'E') { B.view.angle += Math.PI / 8; aim(); }
    else if (k === '+' || k === '=') { B.view.zoom = clamp(B.view.zoom / 1.15, .3, 1.6); aim(); }
    else if (k === '-' || k === '_') { B.view.zoom = clamp(B.view.zoom * 1.15, .3, 1.6); aim(); }
    else if (k === 'f' || k === 'F' || k === 'Home') { B.view = defaultView(); aim(); }
    else if (/^[1-9]$/.test(k)) { const key = Object.keys(TYPES)[+k - 1]; if (key) setTool(B.tool === key ? null : key); }
    else if (k.startsWith('Arrow') && B.selected) {
      // šípky idú podľa toho, odkiaľ sa pozeráš
      e.preventDefault();
      const fwd = new THREE.Vector3(); camera.getWorldDirection(fwd);
      const f = Math.abs(fwd.x) > Math.abs(fwd.z) ? { x: Math.sign(fwd.x), z: 0 } : { x: 0, z: Math.sign(fwd.z) };
      const r = { x: -f.z, z: f.x };
      const d = { ArrowUp: f, ArrowDown: { x: -f.x, z: -f.z }, ArrowRight: r, ArrowLeft: { x: -r.x, z: -r.z } }[k];
      if (d) nudge(d.x, d.z);
    }
  }
  addEventListener('keydown', onKey);
  const help = $('.kbd-help'); if (help) help.hidden = !finePointer;

  function setViewing(park) {
    if (park) {
      if (!B.viewing) B.draft = B.park;
      B.viewing = park; B.park = cleanLayout(park.layout);
      $('.viewing-text').textContent = `Pozeráš park „${park.name}“ od ${park.author}.`;
    } else { B.viewing = null; B.park = B.draft || cleanLayout([]); B.draft = null; }
    $('.viewing').hidden = !park;
    $('.tools').setAttribute('aria-disabled', String(!!park));
    for (const a of ['rotate', 'clear', 'send', 'undo', 'redo', 'duplicate', 'random']) { const b = $(`[data-act=${a}]`); if (b) b.disabled = !!park; }
    for (const el of root.querySelectorAll('.sizes, .swatches')) el.setAttribute('aria-disabled', String(!!park));
    B.selected = null; B.view.panX = B.view.panZ = 0; ps.setSize(B.park.size); aim(); rebuild(); syncSizes(); syncButtons(); say('');
  }
  $('.viewing-exit').addEventListener('click', () => setViewing(null));

  ps.setSize(B.park.size);
  if (B.viewing) { const v = B.viewing; B.viewing = null; B.park = B.draft || B.park; setViewing(v); }
  resize(); rebuild(); syncSizes(); syncButtons();
  return {
    say, setViewing,
    layout: () => B.park,
    destroy() {
      ro.disconnect(); removeEventListener('keydown', onKey); cancelAnimationFrame(raf);
      fillPark(itemsGroup, { size: B.park.size, items: [] });
      renderer.dispose(); renderer.forceContextLoss();
    },
  };
}

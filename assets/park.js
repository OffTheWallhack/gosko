import * as THREE from 'three';

export const GW = 10, GD = 8;   // plocha v dlaždiciach
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const uid = () => Math.random().toString(36).slice(2, 10);
const LS = {
  get(k, f) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : f; } catch { return f; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } },
};

export const TYPES = {
  kicker:   { name: 'Kicker',     w: 1, d: 1, icon: '<path d="M4 22H36V8Z"/>' },
  rail:     { name: 'Rail',       w: 2, d: 1, icon: '<rect x="3" y="7" width="34" height="3"/><rect x="8" y="7" width="3" height="15"/><rect x="29" y="7" width="3" height="15"/>' },
  ledge:    { name: 'Ledge',      w: 2, d: 1, icon: '<rect x="3" y="10" width="34" height="12"/>' },
  manual:   { name: 'Manual pad', w: 2, d: 1, icon: '<rect x="3" y="15" width="34" height="7"/>' },
  quarter:  { name: 'Quarter',    w: 1, d: 2, icon: '<path d="M4 22Q33 22 33 4H36V22Z"/>' },
  halfpipe: { name: 'U-rampa',    w: 4, d: 2, icon: '<path d="M2 3H5Q5 21 15 21H25Q35 21 35 3H38V23H2Z"/>' },
  bank:     { name: 'Bank',       w: 2, d: 2, icon: '<path d="M2 22H38V5Z"/>' },
  funbox:   { name: 'Funbox',     w: 3, d: 2, icon: '<path d="M2 22L12 10H28L38 22Z"/>' },
  stairs:   { name: 'Schody',     w: 2, d: 2, icon: '<path d="M2 22V18H9V14H16V10H38V22Z"/><path d="M3 12L16 4H37" fill="none" stroke="currentColor" stroke-width="2"/>' },
};

const MAT = {
  concrete: new THREE.MeshStandardMaterial({ color: 0xd8d2c6, roughness: .92 }),
  concreteDark: new THREE.MeshStandardMaterial({ color: 0xa8a194, roughness: .95 }),
  ply: new THREE.MeshStandardMaterial({ color: 0xc79d63, roughness: .8 }),
  plyEdge: new THREE.MeshStandardMaterial({ color: 0x8f6a3e, roughness: .85 }),
  steel: new THREE.MeshStandardMaterial({ color: 0xc9ccd0, metalness: .55, roughness: .38 }),
  red: new THREE.MeshStandardMaterial({ color: 0xa01d21, roughness: .45, metalness: .15 }),
};
function mesh(geo, mat) { const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true; return m; }
function box(w, h, d, mat, x = 0, y = h / 2, z = 0) { const m = mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); return m; }
function cyl(r1, r2, h, mat, seg = 16) { return mesh(new THREE.CylinderGeometry(r1, r2, h, seg), mat); }
function wedge(w, h, d, surf, side) {
  const s = new THREE.Shape(); s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(w / 2, h); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false }); g.translate(0, 0, -d / 2);
  return mesh(g, [side, surf]);
}
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
function buildObstacle(type) {
  const g = new THREE.Group();
  switch (type) {
    case 'kicker': g.add(wedge(.94, .42, .9, MAT.ply, MAT.plyEdge), box(.12, .012, .9, MAT.steel, -.41, .006)); break;
    case 'rail': {
      const bar = cyl(.035, .035, 1.84, MAT.red); bar.rotation.z = Math.PI / 2; bar.position.y = .4; g.add(bar);
      for (const x of [-.72, .72]) { const p = cyl(.028, .028, .4, MAT.red, 12); p.position.set(x, .2, 0); g.add(p, box(.16, .02, .16, MAT.steel, x, .01, 0)); }
      break;
    }
    case 'ledge': g.add(box(1.84, .4, .6, MAT.concrete), box(1.84, .04, .04, MAT.steel, 0, .4, .3), box(1.84, .04, .04, MAT.steel, 0, .4, -.3)); break;
    case 'manual': g.add(box(1.84, .2, .9, MAT.concrete), box(1.84, .03, .03, MAT.steel, 0, .2, .45), box(1.84, .03, .03, MAT.steel, 0, .2, -.45)); break;
    case 'bank': g.add(wedge(1.9, .7, 1.9, MAT.concrete, MAT.concreteDark)); break;
    case 'quarter': g.add(quarter(.9, 1.9, .86)); break;
    case 'halfpipe': {
      const a = quarter(.8, 1.9, .8); a.position.x = 1.5;
      const b = quarter(.8, 1.9, .8); b.position.x = -1.5; b.rotation.y = Math.PI;
      g.add(a, b, box(2, .03, 1.9, MAT.ply)); break;
    }
    case 'funbox': {
      const l = wedge(1, .45, 1.9, MAT.concrete, MAT.concreteDark); l.position.x = -1;
      const r = wedge(1, .45, 1.9, MAT.concrete, MAT.concreteDark); r.position.x = 1; r.rotation.y = Math.PI;
      g.add(box(1, .45, 1.9, MAT.concrete), l, r, box(1, .04, .04, MAT.steel, 0, .45, .95), box(1, .04, .04, MAT.steel, 0, .45, -.95)); break;
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
  }
  return g;
}

export const footprint = it => { const t = TYPES[it.type]; return it.rot % 2 === 0 ? { w: t.w, d: t.d } : { w: t.d, d: t.w }; };
function fits(items, c, ignoreId) {
  const f = footprint(c);
  if (c.x < 0 || c.z < 0 || c.x + f.w > GW || c.z + f.d > GD) return false;
  return !items.some(it => {
    if (it.id === ignoreId) return false;
    const g = footprint(it);
    return c.x < it.x + g.w && c.x + f.w > it.x && c.z < it.z + g.d && c.z + f.d > it.z;
  });
}
export function cleanLayout(raw) {
  const out = [];
  if (!Array.isArray(raw)) return out;
  for (const r of raw.slice(0, 80)) {
    if (!r || !TYPES[r.type]) continue;
    const it = { id: uid(), type: r.type, x: r.x | 0, z: r.z | 0, rot: ((r.rot | 0) % 4 + 4) % 4 };
    if (fits(out, it)) out.push(it);
  }
  return out;
}
export const slimLayout = items => items.map(({ type, x, z, rot }) => ({ type, x, z, rot }));

function makeParkScene() {
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xfff8ee, 0x8a8276, 1.15));
  const sun = new THREE.DirectionalLight(0xffffff, 2.1); sun.position.set(6, 11, 4); sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024); Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 1, far: 30 });
  sun.shadow.bias = -.0006; scene.add(sun);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(GW, GD), new THREE.MeshStandardMaterial({ color: 0xbdb6aa, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  const t = .16;
  scene.add(box(GW + 2 * t, .09, t, MAT.concreteDark, 0, .045, GD / 2 + t / 2), box(GW + 2 * t, .09, t, MAT.concreteDark, 0, .045, -GD / 2 - t / 2),
            box(t, .09, GD, MAT.concreteDark, GW / 2 + t / 2, .045, 0), box(t, .09, GD, MAT.concreteDark, -GW / 2 - t / 2, .045, 0));
  const pts = [];
  for (let x = 0; x <= GW; x++) pts.push(x - GW / 2, .004, -GD / 2, x - GW / 2, .004, GD / 2);
  for (let z = 0; z <= GD; z++) pts.push(-GW / 2, .004, z - GD / 2, GW / 2, .004, z - GD / 2);
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  scene.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x8f887b, transparent: true, opacity: .55 })));
  const itemsGroup = new THREE.Group(); scene.add(itemsGroup);
  return { scene, ground, itemsGroup };
}
function disposeTree(o) { o.traverse(m => { if (m.isMesh) m.geometry.dispose(); }); }
function fillPark(group, items) {
  for (const ch of [...group.children]) { disposeTree(ch); group.remove(ch); }
  for (const it of items) {
    const o = buildObstacle(it.type), f = footprint(it);
    o.position.set(it.x + f.w / 2 - GW / 2, 0, it.z + f.d / 2 - GD / 2);
    o.rotation.y = -it.rot * Math.PI / 2;
    o.traverse(m => { m.userData.id = it.id; });
    group.add(o);
  }
}
const FIT_PTS = [];
for (const x of [-GW / 2 - .2, GW / 2 + .2]) for (const z of [-GD / 2 - .2, GD / 2 + .2]) for (const y of [0, 1]) FIT_PTS.push(new THREE.Vector3(x, y, z));
function aimCamera(cam, angle, aspect) {
  const el = aspect < 1.3 ? 1.0 : .88, tf = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
  const dir = new THREE.Vector3(Math.cos(angle) * Math.cos(el), Math.sin(el), Math.sin(angle) * Math.cos(el));
  const target = new THREE.Vector3(0, .2, 0), v = new THREE.Vector3(), right = new THREE.Vector3(), up = new THREE.Vector3();
  cam.aspect = aspect; cam.updateProjectionMatrix();
  let dist = 20;
  const place = () => { cam.position.copy(dir).multiplyScalar(dist).add(target); cam.lookAt(target); cam.updateMatrixWorld(); };
  for (let k = 0; k < 10; k++) {
    place();
    let x0 = 9, x1 = -9, y0 = 9, y1 = -9;
    for (const p of FIT_PTS) { v.copy(p).project(cam); x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y); }
    right.setFromMatrixColumn(cam.matrixWorld, 0); up.setFromMatrixColumn(cam.matrixWorld, 1);
    target.addScaledVector(right, (x0 + x1) / 2 * dist * tf * aspect).addScaledVector(up, (y0 + y1) / 2 * dist * tf);
    dist *= Math.max((x1 - x0) / 2, (y1 - y0) / 2) / .92;
  }
  place();
}

/* náhľady parkov */
let thumbR = null;
const thumbCache = new Map();
export function renderThumb(items, cacheKey) {
  if (cacheKey && thumbCache.has(cacheKey)) return thumbCache.get(cacheKey);
  if (!thumbR) {
    const c = document.createElement('canvas');
    const r = new THREE.WebGLRenderer({ canvas: c, antialias: true, preserveDrawingBuffer: true });
    r.setPixelRatio(1); r.setSize(480, 300, false); r.shadowMap.enabled = true; r.setClearColor(0xe7ddcb, 1);
    const ps = makeParkScene(), cam = new THREE.PerspectiveCamera(35, 1.6, .1, 100); aimCamera(cam, Math.PI / 2 - .5, 1.6);
    r.render(ps.scene, cam);   // prvé vykreslenie niekedy vyjde prázdne
    thumbR = { r, ps, cam };
  }
  fillPark(thumbR.ps.itemsGroup, items);
  thumbR.r.render(thumbR.ps.scene, thumbR.cam);
  const url = thumbR.r.domElement.toDataURL('image/jpeg', .8);
  if (cacheKey) thumbCache.set(cacheKey, url);
  return url;
}

/* stav stavebnice prežije prechod medzi stránkami */
const B = { items: null, tool: 'kicker', placeRot: 0, selected: null, viewing: null, draft: null, view: Math.PI / 2 - .5 };
export const builderItems = () => B.viewing ? B.draft || [] : B.items || [];

export function mountBuilder(root) {
  const $ = s => root.querySelector(s);
  const canvas = $('.park-canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const { scene, ground, itemsGroup } = makeParkScene();
  const camera = new THREE.PerspectiveCamera(35, 1, .1, 100);
  const hover = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .6, depthWrite: false }));
  hover.rotation.x = -Math.PI / 2; hover.position.y = .012; hover.visible = false; scene.add(hover);
  const frame = new THREE.Group(); scene.add(frame);
  const frameMat = new THREE.MeshBasicMaterial({ color: 0xa01d21 });
  const draw = () => renderer.render(scene, camera);
  const say = t => { $('.status').textContent = t; };
  if (!B.items) B.items = cleanLayout(LS.get('gosko:draft', []));

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight; if (!w || !h) return;
    renderer.setSize(w, h, false); aimCamera(camera, B.view, w / h); draw();
  }
  const ro = new ResizeObserver(resize); ro.observe(canvas);

  function updateFrame() {
    for (const ch of [...frame.children]) { ch.geometry.dispose(); frame.remove(ch); }
    const it = B.items.find(i => i.id === B.selected);
    $('[data-act=delete]').disabled = !it || !!B.viewing;
    if (!it) return;
    const f = footprint(it), cx = it.x + f.w / 2 - GW / 2, cz = it.z + f.d / 2 - GD / 2, b = .1, h = .05;
    const add = (w, d, x, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), frameMat); m.position.set(x, h / 2 + .005, z); frame.add(m); };
    add(f.w + b, b, cx, cz - f.d / 2); add(f.w + b, b, cx, cz + f.d / 2);
    add(b, f.d + b, cx - f.w / 2, cz); add(b, f.d + b, cx + f.w / 2, cz);
  }
  function rebuild() { fillPark(itemsGroup, B.items); updateFrame(); draw(); }
  function select(id) { B.selected = id; updateFrame(); draw(); }
  function saveDraft() { if (!B.viewing) LS.set('gosko:draft', slimLayout(B.items)); }

  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const aim = e => { const r = canvas.getBoundingClientRect(); ndc.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1); ray.setFromCamera(ndc, camera); };
  const tileAt = () => { const h = ray.intersectObject(ground)[0]; return h ? { tx: Math.floor(h.point.x + GW / 2), tz: Math.floor(h.point.z + GD / 2) } : null; };
  const anchor = (type, rot, tx, tz) => { const f = footprint({ type, rot }); return { x: clamp(tx - Math.floor((f.w - 1) / 2), 0, GW - f.w), z: clamp(tz - Math.floor((f.d - 1) / 2), 0, GD - f.d) }; };

  function tap(e) {
    if (B.viewing) return;
    aim(e);
    const hitObj = ray.intersectObjects(itemsGroup.children, true)[0];
    if (hitObj) { select(hitObj.object.userData.id); say(''); return; }
    const t = tileAt(); if (!t || !B.tool) { select(null); return; }
    const cand = { id: uid(), type: B.tool, rot: B.placeRot, ...anchor(B.tool, B.placeRot, t.tx, t.tz) };
    if (!fits(B.items, cand)) { say('Sem sa to nezmestí. Skús iné miesto alebo prekážku otoč.'); return; }
    B.items.push(cand); hover.visible = false; rebuild(); select(cand.id); saveDraft(); say('');
  }
  function hoverAt(e) {
    if (B.viewing || !B.tool) { hover.visible = false; draw(); return; }
    aim(e);
    if (ray.intersectObjects(itemsGroup.children, true)[0]) { hover.visible = false; canvas.style.cursor = 'pointer'; draw(); return; }
    canvas.style.cursor = 'crosshair';
    const t = tileAt(); if (!t) { hover.visible = false; draw(); return; }
    const a = anchor(B.tool, B.placeRot, t.tx, t.tz), f = footprint({ type: B.tool, rot: B.placeRot });
    hover.scale.set(f.w, f.d, 1); hover.position.set(a.x + f.w / 2 - GW / 2, .012, a.z + f.d / 2 - GD / 2);
    hover.material.color.set(fits(B.items, { type: B.tool, rot: B.placeRot, ...a }) ? 0xffffff : 0xa01d21);
    hover.visible = true; draw();
  }
  let down = null;
  canvas.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY }; });
  canvas.addEventListener('pointerup', e => { if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 8) tap(e); down = null; });
  canvas.addEventListener('pointercancel', () => { down = null; });
  canvas.addEventListener('pointermove', e => { if (e.pointerType === 'mouse') hoverAt(e); });
  canvas.addEventListener('pointerleave', () => { hover.visible = false; draw(); });

  const tools = $('.tools');
  for (const [key, t] of Object.entries(TYPES)) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'tool'; b.dataset.type = key;
    b.setAttribute('aria-pressed', String(key === B.tool));
    b.innerHTML = `<svg viewBox="0 0 40 24" aria-hidden="true">${t.icon}</svg>`;
    const n = document.createElement('span'); n.textContent = t.name;
    const s = document.createElement('small'); s.textContent = `${t.w}×${t.d}`;
    b.append(n, s);
    b.addEventListener('click', () => {
      B.tool = B.tool === key ? null : key;
      tools.querySelectorAll('.tool').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.type === B.tool)));
      select(null); say(B.tool ? `${t.name}: ťukni na plochu.` : '');
    });
    tools.append(b);
  }
  $('[data-act=rotate]').addEventListener('click', () => {
    const it = B.items.find(i => i.id === B.selected);
    if (it) {
      const f0 = footprint(it), rot = (it.rot + 1) % 4;
      const cand = { ...it, rot, ...anchor(it.type, rot, it.x + Math.floor((f0.w - 1) / 2), it.z + Math.floor((f0.d - 1) / 2)) };
      if (fits(B.items, cand, it.id)) { Object.assign(it, cand); rebuild(); saveDraft(); say(''); } else say('Na otočenie tu nie je miesto.');
    } else { B.placeRot = (B.placeRot + 1) % 4; say('Ďalšia prekážka sa položí otočená.'); }
  });
  $('[data-act=delete]').addEventListener('click', () => {
    if (!B.selected) return;
    B.items = B.items.filter(i => i.id !== B.selected); B.selected = null; rebuild(); saveDraft(); say('');
  });
  $('[data-act=clear]').addEventListener('click', () => {
    if (!B.items.length || !confirm('Naozaj vyčistiť celú plochu?')) return;
    B.items = []; B.selected = null; rebuild(); saveDraft(); say('');
  });
  $('[data-act=view]').addEventListener('click', () => { B.view += Math.PI / 2; aimCamera(camera, B.view, camera.aspect); draw(); });

  function setViewing(park) {
    if (park) {
      if (!B.viewing) B.draft = B.items;
      B.viewing = park; B.items = cleanLayout(park.layout);
      $('.viewing-text').textContent = `Pozeráš park „${park.name}“ od ${park.author}.`;
    } else { B.viewing = null; B.items = B.draft || []; B.draft = null; }
    $('.viewing').hidden = !park;
    $('.tools').setAttribute('aria-disabled', String(!!park));
    for (const a of ['rotate', 'clear', 'send']) $(`[data-act=${a}]`).disabled = !!park;
    B.selected = null; rebuild(); say('');
  }
  $('.viewing-exit').addEventListener('click', () => setViewing(null));
  if (B.viewing) { const v = B.viewing; B.viewing = null; B.items = B.draft || B.items; setViewing(v); }

  resize(); rebuild();
  return {
    say, setViewing,
    items: () => B.items,
    destroy() {
      ro.disconnect();
      scene.traverse(o => { if (o.isMesh && o.parent === itemsGroup) o.geometry.dispose(); });
      fillPark(itemsGroup, []);
      renderer.dispose(); renderer.forceContextLoss();
    },
  };
}

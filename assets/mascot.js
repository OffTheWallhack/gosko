/* GOSko maskot: duch z loga ako 3D model, lieta na skateboarde.
   Neskôr si ho ľudia upravia v profile ako svoj avatar (look = vzhľad dosky). */
import * as THREE from 'three';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import { makeBoardModel } from './board.js';

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
let svgPromise = null;
const loadGhostSvg = () => (svgPromise ||= fetch('img/ghost.svg').then(r => r.text()).then(t => new SVGLoader().parse(t)));

/* duch: telo (krémové), obrys (tmavý) a tvár (tmavá), všetko vytlačené do 3D */
function buildGhost(data) {
  const g = new THREE.Group(), geos = [], mats = [];
  const cream = new THREE.MeshStandardMaterial({ color: 0xf3ebdd, roughness: .55, emissive: 0x2a2520, emissiveIntensity: .35 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x0e0d0c, roughness: .35, metalness: .1 });
  mats.push(cream, dark);
  const [bodyPath, darkPath] = data.paths;
  const ext = (shapes, o, m) => { const geo = new THREE.ExtrudeGeometry(shapes, { curveSegments: 18, ...o }); geos.push(geo); const mesh = new THREE.Mesh(geo, m); g.add(mesh); return mesh; };
  const body = ext(SVGLoader.createShapes(bodyPath), { depth: 60, bevelEnabled: true, bevelThickness: 26, bevelSize: 16, bevelSegments: 8 }, cream);
  // tmavá cesta = obrys (prstenec) + oči + ústa; prstenec je najväčší tvar
  const darkShapes = SVGLoader.createShapes(darkPath).map(sh => ({ sh, a: Math.abs(THREE.ShapeUtils.area(sh.getPoints())) })).sort((a, b) => b.a - a.a);
  const ring = ext(darkShapes[0].sh, { depth: 64, bevelEnabled: true, bevelThickness: 22, bevelSize: 6, bevelSegments: 4 }, dark);
  ring.position.z = -2;
  const face = ext(darkShapes.slice(1).map(x => x.sh), { depth: 6, bevelEnabled: true, bevelThickness: 3, bevelSize: 2, bevelSegments: 2 }, dark);
  face.position.z = 60 + 26 - 2;
  // stred, mierka a SVG os y smeruje dole
  const box = new THREE.Box3().setFromObject(g), c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
  g.children.forEach(m => { m.position.x -= c.x; m.position.y -= c.y; });
  const pivot = new THREE.Group(); pivot.add(g);
  const k = .62 / size.y; pivot.scale.set(k, -k, k);
  pivot.userData.wobble = [body.geometry, ring.geometry].map(geo => ({ geo, base: Float32Array.from(geo.attributes.position.array) }));
  pivot.userData.hemY = c.y + size.y * .18;   // spodok (lem) sa vlní, v SVG súradniciach
  pivot.userData.dispose = () => { geos.forEach(x => x.dispose()); mats.forEach(x => x.dispose()); };
  return pivot;
}

/* Pripojí maskota na plátno. Vráti funkciu na upratanie (s metódami trick() a setLook()). */
export async function mountMascot(canvas, { look, interactive = true } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setClearColor(0, 0);
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(32, 1, .05, 20);
  camera.position.set(0, .25, 2.6); camera.lookAt(0, .12, 0);
  scene.add(new THREE.HemisphereLight(0xfff4e6, 0x301818, 1.25));
  const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(1.4, 2, 2.4); scene.add(key);
  const rim = new THREE.DirectionalLight(0xff5a4a, 2.6); rim.position.set(-2.2, .6, -1.6); scene.add(rim);

  const [data] = await Promise.all([loadGhostSvg()]);
  const ghost = buildGhost(data);
  const rig = new THREE.Group(), boardRig = new THREE.Group(), flip = new THREE.Group();
  let model = await makeBoardModel(renderer, { look });
  flip.add(model.board); boardRig.add(flip); boardRig.position.y = -.3; boardRig.rotation.y = .5;
  ghost.position.y = .1;
  rig.add(ghost, boardRig); scene.add(rig);

  const resize = () => { const w = canvas.clientWidth, h = canvas.clientHeight; if (!w || !h) return; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); };
  const ro = new ResizeObserver(resize); ro.observe(canvas); resize();

  let alive = true, visible = true, t0 = performance.now(), nextTrick = t0 + 3500, trick = null;
  const look2 = { x: 0, y: 0, tx: 0, ty: 0 };
  const onMove = e => { const r = canvas.getBoundingClientRect(); look2.tx = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / innerWidth * 2)); look2.ty = Math.max(-1, Math.min(1, (e.clientY - (r.top + r.height / 2)) / innerHeight * 2)); };
  if (interactive) addEventListener('pointermove', onMove, { passive: true });
  const startTrick = kind => { if (!trick && !reduceMotion) trick = { kind, t: performance.now() }; };
  canvas.addEventListener('click', () => startTrick(Math.random() < .5 ? 'kickflip' : 'tre'));
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; }); io.observe(canvas);

  const wob = ghost.userData.wobble, hemY = ghost.userData.hemY;
  (function loop(now) {
    if (!alive) return;
    requestAnimationFrame(loop);
    if (!visible || document.hidden) return;
    const t = (now - t0) / 1000;
    // vlnenie lemu ducha
    if (!reduceMotion) for (const { geo, base } of wob) {
      const p = geo.attributes.position.array;
      for (let i = 0; i < p.length; i += 3) { const y = base[i + 1]; if (y > hemY) { const k = (y - hemY) / 120; p[i] = base[i] + Math.sin(t * 4 + base[i] * .03) * 9 * k; } }
      geo.attributes.position.needsUpdate = true;
    }
    look2.x += (look2.tx - look2.x) * .06; look2.y += (look2.ty - look2.y) * .06;
    const bob = reduceMotion ? 0 : Math.sin(t * 1.7) * .05;
    rig.position.set(reduceMotion ? 0 : Math.sin(t * .6) * .06, bob, 0);
    rig.rotation.set(look2.y * .18, look2.x * .45 + (reduceMotion ? 0 : Math.sin(t * .5) * .12), reduceMotion ? 0 : Math.sin(t * 1.1) * .06);
    ghost.rotation.z = reduceMotion ? 0 : Math.sin(t * 1.3 + 1) * .05;
    if (!trick && now > nextTrick) { startTrick(Math.random() < .65 ? 'kickflip' : 'ollie'); nextTrick = now + 6000 + Math.random() * 5000; }
    if (trick) {
      const k = Math.min(1, (now - trick.t) / 900), e = k < .5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2, hop = Math.sin(k * Math.PI);
      boardRig.position.y = -.3 + hop * .32; ghost.position.y = .1 + hop * .4;
      flip.rotation.x = trick.kind === 'ollie' ? 0 : e * Math.PI * 2;
      flip.rotation.y = trick.kind === 'tre' ? e * Math.PI * 2 : 0;
      flip.rotation.z = trick.kind === 'ollie' ? Math.sin(k * Math.PI * 2) * .35 : 0;
      if (k >= 1) { flip.rotation.set(0, 0, 0); boardRig.position.y = -.3; ghost.position.y = .1; trick = null; }
    }
    renderer.render(scene, camera);
  })(t0);

  const api = () => { alive = false; ro.disconnect(); io.disconnect(); removeEventListener('pointermove', onMove); ghost.userData.dispose(); model.dispose(); renderer.dispose(); renderer.forceContextLoss(); };
  api.trick = startTrick;
  api.setLook = async l => { const m = await makeBoardModel(renderer, { look: l }); flip.remove(model.board); model.dispose(); model = m; flip.add(m.board); };
  return api;
}

// Vista esplosa 3D dell'auto stilizzata della pagina pubblica.
// Sorgente: viene compilato con `npm run build:3d` in frontend/js/garage3d.js (ES module,
// Three.js incluso e ridotto ai soli moduli usati). La pagina lo importa solo al clic.
//
// Modello procedurale, nessun asset esterno: cinque gruppi rigidi (carrozzeria, vetri,
// telaio, motore, ruote) con posizione assemblata ed esplosa esplicite. Lo stato è un
// solo numero t ∈ [0, 1] interpolato verso il bersaglio: l'animazione si può invertire
// a metà e non accumula errori perché ogni posizione è ricalcolata da base + offset · t.
// Si disegna solo quando qualcosa cambia (niente ciclo continuo a scena ferma).
import {
  WebGLRenderer,
  Scene,
  PerspectiveCamera,
  HemisphereLight,
  DirectionalLight,
  Group,
  Mesh,
  InstancedMesh,
  Object3D,
  Shape,
  ExtrudeGeometry,
  BoxGeometry,
  CylinderGeometry,
  MeshLambertMaterial,
  Color,
  SRGBColorSpace
} from 'three';

// Coordinate prese dal disegno SVG (viewBox 800×460): x centrata, y dal suolo, 1 unità = 100 px
const X0 = 414;
const GROUND = 348;
const px = x => (x - X0) / 100;
const py = y => (GROUND - y) / 100;

const COLORS = {
  body: 0x2a2e33,
  glass: 0x9aa3ab,
  tyre: 0x16181a,
  rim: 0xd4d0c7,
  hub: 0x43474d,
  chassis: 0x43474d,
  engine: 0xf26b1d,
  engineDark: 0x16181a
};

// Profilo laterale della carrozzeria, con i due passaruota
function bodyShape() {
  const s = new Shape();
  s.moveTo(px(84), py(286));
  s.lineTo(px(84), py(236));
  s.quadraticCurveTo(px(86), py(206), px(128), py(196));
  s.lineTo(px(214), py(182));
  s.quadraticCurveTo(px(262), py(128), px(330), py(118));
  s.lineTo(px(470), py(116));
  s.quadraticCurveTo(px(516), py(118), px(556), py(150));
  s.lineTo(px(600), py(186));
  s.lineTo(px(700), py(204));
  s.quadraticCurveTo(px(738), py(212), px(742), py(244));
  s.lineTo(px(744), py(286));
  s.lineTo(px(652), py(286));
  s.absarc(px(590), py(286), 0.62, 0, Math.PI, false);
  s.lineTo(px(272), py(286));
  s.absarc(px(210), py(286), 0.62, 0, Math.PI, false);
  s.closePath();
  return s;
}

function glassShapes() {
  const rear = new Shape();
  rear.moveTo(px(232), py(184));
  rear.quadraticCurveTo(px(272), py(142), px(330), py(134));
  rear.lineTo(px(392), py(132));
  rear.lineTo(px(392), py(184));
  rear.closePath();
  const front = new Shape();
  front.moveTo(px(408), py(132));
  front.lineTo(px(466), py(132));
  front.quadraticCurveTo(px(506), py(134), px(538), py(160));
  front.lineTo(px(566), py(184));
  front.lineTo(px(408), py(184));
  front.closePath();
  return [rear, front];
}

const WIDTH = 1.6; // larghezza della vettura (asse z)

export async function mount(stage, { exploded = true, onLost = () => {} } = {}) {
  const canvas = document.createElement('canvas');
  canvas.tabIndex = 0;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute(
    'aria-label',
    'Auto stilizzata in 3D. Frecce sinistra e destra per ruotarla, pulsante Assembla per unire le parti.'
  );
  stage.appendChild(canvas);

  const renderer = new WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: 'low-power'
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = SRGBColorSpace;

  const scene = new Scene();
  const camera = new PerspectiveCamera(28, 1, 0.1, 100);

  scene.add(new HemisphereLight(0xffffff, 0x8a8478, 2.2));
  const sun = new DirectionalLight(0xffffff, 1.6);
  sun.position.set(4, 8, 6);
  scene.add(sun);

  // Materiali condivisi: uno per colore
  const mat = {};
  Object.entries(COLORS).forEach(
    ([k, v]) => (mat[k] = new MeshLambertMaterial({ color: new Color(v) }))
  );
  const geometries = [];
  const keep = g => (geometries.push(g), g);

  const root = new Group();
  root.position.y = -1.05;
  scene.add(root);

  // Carrozzeria (estrusione del profilo) e vetri
  const body = new Group();
  const bodyGeo = keep(
    new ExtrudeGeometry(bodyShape(), {
      depth: WIDTH,
      bevelEnabled: true,
      bevelThickness: 0.06,
      bevelSize: 0.05,
      bevelSegments: 2,
      curveSegments: 10
    })
  );
  bodyGeo.translate(0, 0, -WIDTH / 2);
  body.add(new Mesh(bodyGeo, mat.body));
  const glassGeo = keep(
    new ExtrudeGeometry(glassShapes(), {
      depth: WIDTH + 0.14,
      bevelEnabled: false,
      curveSegments: 8
    })
  );
  glassGeo.translate(0, 0, -(WIDTH + 0.14) / 2);
  body.add(new Mesh(glassGeo, mat.glass));
  root.add(body);

  // Telaio: piano e longheroni
  const chassis = new Group();
  const plate = keep(new BoxGeometry(5.66, 0.16, WIDTH - 0.2));
  const platform = new Mesh(plate, mat.chassis);
  platform.position.set(px(401), py(300), 0);
  chassis.add(platform);
  const rail = keep(new BoxGeometry(5.0, 0.1, 0.18));
  [-0.5, 0.5].forEach(z => {
    const r = new Mesh(rail, mat.engineDark);
    r.position.set(px(400), py(313), z);
    chassis.add(r);
  });
  root.add(chassis);

  // Gruppo motore: blocco, testata, cilindri (instanced), puleggia
  const engine = new Group();
  const block = new Mesh(keep(new BoxGeometry(0.9, 0.42, 0.86)), mat.engine);
  engine.add(block);
  const head = new Mesh(keep(new BoxGeometry(0.78, 0.12, 0.7)), mat.engineDark);
  head.position.y = 0.27;
  engine.add(head);
  const cyl = new InstancedMesh(
    keep(new CylinderGeometry(0.07, 0.07, 0.12, 12)),
    mat.engineDark,
    4
  );
  const tmp = new Object3D();
  for (let i = 0; i < 4; i++) {
    tmp.position.set(-0.27 + i * 0.18, 0.39, 0);
    tmp.updateMatrix();
    cyl.setMatrixAt(i, tmp.matrix);
  }
  engine.add(cyl);
  const pulley = new Mesh(keep(new CylinderGeometry(0.16, 0.16, 0.08, 20)), mat.engineDark);
  pulley.rotation.x = Math.PI / 2;
  pulley.position.set(-0.3, -0.05, 0.47);
  engine.add(pulley);
  engine.position.set(px(640), 1.12, 0);
  root.add(engine);

  // Ruote: pneumatici, cerchi e mozzi in tre InstancedMesh da quattro
  const wheelBase = [
    { x: px(210), z: WIDTH / 2 - 0.12, front: false },
    { x: px(210), z: -(WIDTH / 2 - 0.12), front: false },
    { x: px(590), z: WIDTH / 2 - 0.12, front: true },
    { x: px(590), z: -(WIDTH / 2 - 0.12), front: true }
  ];
  const tyreGeo = keep(new CylinderGeometry(0.56, 0.56, 0.3, 28));
  tyreGeo.rotateX(Math.PI / 2);
  const rimGeo = keep(new CylinderGeometry(0.33, 0.33, 0.32, 20));
  rimGeo.rotateX(Math.PI / 2);
  const hubGeo = keep(new CylinderGeometry(0.12, 0.12, 0.34, 12));
  hubGeo.rotateX(Math.PI / 2);
  const tyres = new InstancedMesh(tyreGeo, mat.tyre, 4);
  const rims = new InstancedMesh(rimGeo, mat.rim, 4);
  const hubs = new InstancedMesh(hubGeo, mat.hub, 4);
  root.add(tyres, rims, hubs);

  // Posizioni esplose (offset rispetto all'assemblato)
  const OFFSET = {
    body: { y: 1.05 },
    engine: { x: 0.35, y: 2.15 },
    wheelX: 0.4,
    wheelZ: 0.75,
    wheelY: -0.35
  };

  let t = exploded ? 1 : 0;
  let target = t;
  let yaw = -0.55;
  let yawVel = 0;
  let frame = 0;
  let visible = true;
  let disposed = false;

  function applyPose() {
    const e = easeInOut(t);
    body.position.y = OFFSET.body.y * e;
    engine.position.x = px(640) + OFFSET.engine.x * e;
    engine.position.y = 1.12 + OFFSET.engine.y * e;
    wheelBase.forEach((w, i) => {
      tmp.position.set(
        w.x + (w.front ? 1 : -1) * OFFSET.wheelX * e,
        0.56 + OFFSET.wheelY * e,
        w.z + Math.sign(w.z) * OFFSET.wheelZ * e
      );
      tmp.rotation.set(0, 0, 0);
      tmp.updateMatrix();
      tyres.setMatrixAt(i, tmp.matrix);
      rims.setMatrixAt(i, tmp.matrix);
      hubs.setMatrixAt(i, tmp.matrix);
    });
    tyres.instanceMatrix.needsUpdate = true;
    rims.instanceMatrix.needsUpdate = true;
    hubs.instanceMatrix.needsUpdate = true;
    root.rotation.y = yaw;
  }

  function resize() {
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Inquadra tutta l'auto esplosa anche su schermi stretti
    const dist = camera.aspect < 1.2 ? 15.5 : 12.5;
    camera.position.set(0, 3.6, dist);
    camera.lookAt(0, 0.35, 0);
    camera.updateProjectionMatrix();
    requestRender();
  }

  function render() {
    frame = 0;
    if (disposed) return;
    const dt = 1 / 60;
    let moving = false;
    if (t !== target) {
      const step = dt / 0.65; // circa 650 ms per l'intera corsa
      t = target > t ? Math.min(target, t + step) : Math.max(target, t - step);
      moving = true;
    }
    if (Math.abs(yawVel) > 0.0005) {
      yaw += yawVel;
      yawVel *= 0.9;
      moving = true;
    }
    applyPose();
    renderer.render(scene, camera);
    if (moving) requestRender();
  }

  function requestRender() {
    if (!frame && visible && !disposed && !document.hidden) frame = requestAnimationFrame(render);
  }

  // Rotazione: trascinamento orizzontale (lo scroll verticale resta alla pagina) e frecce
  let dragX = null;
  const onDown = ev => {
    dragX = ev.clientX;
    canvas.setPointerCapture(ev.pointerId);
  };
  const onMove = ev => {
    if (dragX === null) return;
    const dx = ev.clientX - dragX;
    dragX = ev.clientX;
    yaw += dx * 0.01;
    yawVel = dx * 0.002;
    requestRender();
  };
  const onUp = () => (dragX = null);
  const onKey = ev => {
    if (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight') {
      ev.preventDefault();
      yaw += ev.key === 'ArrowLeft' ? -0.2 : 0.2;
      requestRender();
    }
  };
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('keydown', onKey);

  const onVisibility = () => requestRender();
  document.addEventListener('visibilitychange', onVisibility);
  const io = new IntersectionObserver(entries => {
    visible = entries[0].isIntersecting;
    requestRender();
  });
  io.observe(stage);
  const ro = new ResizeObserver(resize);
  ro.observe(stage);

  const onContextLost = ev => {
    ev.preventDefault();
    api.dispose();
    onLost();
  };
  canvas.addEventListener('webglcontextlost', onContextLost);

  // Compila gli shader prima del primo frame visibile
  renderer.compile(scene, camera);
  resize();
  applyPose();
  renderer.render(scene, camera);

  const api = {
    setExploded(value) {
      target = value ? 1 : 0;
      requestRender();
    },
    stats() {
      return {
        triangles: renderer.info.render.triangles,
        calls: renderer.info.render.calls,
        geometries: renderer.info.memory.geometries,
        pixelRatio: renderer.getPixelRatio()
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (frame) cancelAnimationFrame(frame);
      io.disconnect();
      ro.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      geometries.forEach(g => g.dispose());
      Object.values(mat).forEach(m => m.dispose());
      tyres.dispose();
      rims.dispose();
      hubs.dispose();
      cyl.dispose();
      renderer.dispose();
      canvas.remove();
    }
  };
  window.__garage3d = api;
  return api;
}

function easeInOut(x) {
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

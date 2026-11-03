// Auto stilizzata in 3D, dall'assemblato alla vista esplosa.
// Sorgente compilato con `npm run build:3d` in frontend/js/garage3d.js (ES module con Three.js
// ridotto ai moduli usati). La pagina lo importa solo quando serve (vedi landing.js).
//
// Modello procedurale, nessun asset esterno e nessun marchio: un'auto generica, non la
// ricostruzione di un veicolo reale. Gruppi rigidi con posizione assemblata ed esplosa
// esplicite: carrozzeria, abitacolo vetrato, sedili, motore, telaio con assali, quattro
// ruote (pneumatico, cerchio, disco, pinza). Lo stato è un solo numero t ∈ [0, 1]
// interpolato verso il bersaglio: si può invertire a metà senza accumulare errori, perché
// ogni posa è ricalcolata da base + offset · t. Si disegna solo quando qualcosa cambia.
import {
  WebGLRenderer,
  Scene,
  PerspectiveCamera,
  DirectionalLight,
  HemisphereLight,
  Group,
  Mesh,
  InstancedMesh,
  Object3D,
  BufferGeometry,
  Float32BufferAttribute,
  BoxGeometry,
  CylinderGeometry,
  LatheGeometry,
  PlaneGeometry,
  TorusGeometry,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  MeshBasicMaterial,
  CanvasTexture,
  Vector2,
  PMREMGenerator,
  Raycaster,
  Color,
  Vector3,
  ACESFilmicToneMapping,
  SRGBColorSpace
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

// ─── Proporzioni (metri) ──────────────────────────────────────────────────────
// Riferimento concordato: una GT a motore centrale (proporzioni da berlinetta Ferrari),
// resa generica e senza marchi. Muso basso e corto, abitacolo avanzato, fianchi posteriori
// larghi, motore dietro i sedili. Non è la ricostruzione di un modello reale.
const L = 4.56; // lunghezza
const HALF_W = 0.98; // mezza larghezza della carrozzeria
const WHEEL_X = [-1.36, 1.3]; // assale posteriore, anteriore (passo 2,66 m)
const WHEEL_R = 0.345;
const TRACK = 0.84; // distanza del centro ruota dall'asse

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const lerp = (a, b, t) => a + (b - a) * t;

// Arrotondamento di muso e coda: la sezione si chiude dolcemente alle estremità
const endScale = u =>
  u > 0.5
    ? Math.pow(1 - Math.pow(2 * u - 1, 3.2), 1 / 3.2) // muso arrotondato
    : Math.pow(1 - Math.pow(1 - 2 * u, 6), 1 / 6); // coda tronca

// Profilo inferiore con i passaruota ricavati dalla superficie
function bottomY(x) {
  let y = 0.15;
  for (const wx of WHEEL_X) {
    const dx = x - wx;
    const ra = 0.44;
    if (Math.abs(dx) < ra) y = Math.max(y, 0.32 + Math.sqrt(ra * ra - dx * dx));
  }
  return y;
}

// Linea di cintura: coda, fianco, cofano che scende verso il muso
// u: 0 coda → 1 muso. Coda tronca, fianchi alti sopra la ruota posteriore, vita più bassa,
// parafango anteriore e cofano che scende fino al muso
function beltY(u) {
  if (u < 0.07) return lerp(0.72, 0.88, smooth(0, 0.07, u));
  if (u < 0.3) return lerp(0.88, 0.9, Math.sin(((u - 0.07) / 0.23) * Math.PI));
  if (u < 0.62) return lerp(0.88, 0.82, smooth(0.3, 0.62, u));
  if (u < 0.82) return lerp(0.82, 0.8, smooth(0.62, 0.82, u));
  return lerp(0.8, 0.42, smooth(0.82, 1, u));
}

// Larghezza: fianchi posteriori pieni, vita stretta, parafango anteriore, muso affusolato
function halfWidth(u) {
  const haunch = Math.exp(-Math.pow((u - 0.2) / 0.12, 2)) * 0.06;
  const front = Math.exp(-Math.pow((u - 0.78) / 0.1, 2)) * 0.03;
  const base = lerp(0.88, 0.94, smooth(0, 0.15, u)) * lerp(1, 0.8, smooth(0.86, 1, u));
  return HALF_W * (base + haunch + front);
}

// Superficie chiusa costruita per sezioni: superellisse tra yBottom e yTop
function sectionSurface({ stations, around, u0, u1, section, colorAt = null }) {
  const pos = [];
  const idx = [];
  for (let i = 0; i <= stations; i++) {
    const u = lerp(u0, u1, i / stations);
    const s = section(u);
    for (let j = 0; j < around; j++) {
      const th = (j / around) * Math.PI * 2;
      const c = Math.cos(th);
      const sn = Math.sin(th);
      const n = s.n || 4;
      const zz = Math.sign(c) * Math.pow(Math.abs(c), 2 / n);
      const yy = Math.sign(sn) * Math.pow(Math.abs(sn), 2 / n);
      // In alto la sezione si stringe (tumblehome)
      const w = yy > 0 ? lerp(s.w, s.wTop || s.w, yy) : s.w;
      pos.push(s.x, s.yc + yy * s.h * 0.5, zz * w);
    }
  }
  for (let i = 0; i < stations; i++) {
    for (let j = 0; j < around; j++) {
      const a = i * around + j;
      const b = i * around + ((j + 1) % around);
      const c = a + around;
      const d = b + around;
      idx.push(a, c, b, b, c, d);
    }
  }
  // Tappi alle estremità
  const capStart = pos.length / 3;
  const first = section(u0);
  pos.push(first.x, first.yc, 0);
  const capEnd = pos.length / 3;
  const last = section(u1);
  pos.push(last.x, last.yc, 0);
  for (let j = 0; j < around; j++) {
    idx.push(capStart, j, (j + 1) % around);
    const base = stations * around;
    idx.push(capEnd, base + ((j + 1) % around), base + j);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  if (colorAt) {
    // Bicolore: vernice sopra, grafite su minigonne e paraurti (y bassa)
    const col = [];
    for (let i = 0; i < pos.length; i += 3) col.push(...colorAt(pos[i], pos[i + 1]));
    g.setAttribute('color', new Float32BufferAttribute(col, 3));
  }
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

const PAINT = [1, 1, 1];
const SILL = [0.09, 0.1, 0.11];
function bodyGeometry() {
  return sectionSurface({
    colorAt: (x, y) => (y < bottomY(x) + 0.09 ? SILL : PAINT),
    stations: 96,
    around: 44,
    u0: 0.002,
    u1: 0.998,
    section: u => {
      const x = (u - 0.5) * L;
      const e = endScale(u);
      const yb = bottomY(x);
      const yt = beltY(u);
      const mid = (yb + yt) / 2;
      const h = Math.max(0.04, (yt - yb) * lerp(0.35, 1, e));
      // Sezione più tonda verso il muso, più squadrata sui fianchi
      const n = lerp(3.2, 5, smooth(1, 0.8, u));
      return { x, yc: mid, h, w: halfWidth(u) * lerp(0.6, 1, e), wTop: halfWidth(u) * 0.9, n };
    }
  });
}

// Abitacolo vetrato: parabrezza inclinato, tetto, lunotto
function cabinGeometry() {
  const a = 0.3;
  const b = 0.7;
  return sectionSurface({
    stations: 48,
    around: 32,
    u0: a,
    u1: b,
    section: u => {
      const x = (u - 0.5) * L;
      const k = (u - a) / (b - a);
      // Lunotto lungo e basso verso il cofano motore, parabrezza molto inclinato
      const rise = smooth(0, 0.5, k) * (1 - smooth(0.6, 1, k));
      const base = beltY(u) - 0.06;
      const top = base + 0.06 + rise * 0.4;
      return {
        x,
        yc: (base + top) / 2,
        h: top - base,
        w: halfWidth(u) * 0.78,
        wTop: halfWidth(u) * 0.6,
        n: 4
      };
    }
  });
}

function tyreGeometry() {
  // Sezione dello pneumatico ruotata attorno all'asse: spalla arrotondata, battistrada piatto
  const pts = [];
  const r0 = 0.25; // spalla bassa: cerchi grandi
  const r1 = WHEEL_R;
  const w = 0.14;
  pts.push(new Vector2(r0, -w));
  for (let i = 0; i <= 8; i++) {
    const a = -Math.PI / 2 + (i / 8) * (Math.PI / 2);
    pts.push(new Vector2(r1 - 0.04 + Math.cos(a) * 0.04, -w + 0.04 + Math.sin(a) * 0.04 + 0.04));
  }
  for (let i = 0; i <= 8; i++) {
    const a = (i / 8) * (Math.PI / 2);
    pts.push(new Vector2(r1 - 0.04 + Math.cos(a) * 0.04, w - 0.04 + Math.sin(a) * 0.04 - 0.04));
  }
  pts.push(new Vector2(r0, w));
  const g = new LatheGeometry(pts, 36);
  g.rotateX(Math.PI / 2); // asse lungo z
  return g;
}

function shadowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const grd = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
  grd.addColorStop(0, 'rgba(0,0,0,0.85)');
  grd.addColorStop(0.55, 'rgba(0,0,0,0.35)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, 128, 128);
  return new CanvasTexture(c);
}

// ─── Montaggio della scena ────────────────────────────────────────────────────

export async function mount(stage, options = {}) {
  const {
    exploded = true,
    intro = true,
    reducedMotion = false,
    pixelRatio = 1.5,
    onLost = () => {},
    onPick = () => {},
    onHover = () => {},
    onFrame = () => {},
    preserveDrawingBuffer = false
  } = options;

  const canvas = document.createElement('canvas');
  canvas.className = 'garage3d-canvas';
  canvas.tabIndex = 0;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute(
    'aria-label',
    "Auto stilizzata in 3D. Frecce sinistra e destra per ruotarla; il pulsante sotto l'auto la assembla o la scompone."
  );
  stage.appendChild(canvas);

  const renderer = new WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
    preserveDrawingBuffer
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, pixelRatio));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.82;

  const scene = new Scene();
  const pmrem = new PMREMGenerator(renderer);
  const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
  scene.environment = envRT.texture;
  pmrem.dispose();

  const camera = new PerspectiveCamera(26, 1, 0.1, 60);
  const key = new DirectionalLight(0xffffff, 1.4);
  key.position.set(-3, 6, 4);
  scene.add(key, new HemisphereLight(0xffffff, 0x222222, 0.35));

  // Materiali condivisi
  const mat = {
    paint: new MeshPhysicalMaterial({
      color: 0xc4561a,
      vertexColors: true,
      metalness: 0.4,
      roughness: 0.28,
      clearcoat: 1,
      clearcoatRoughness: 0.06
    }),
    glass: new MeshPhysicalMaterial({
      color: 0x0b0d10,
      metalness: 0.2,
      roughness: 0.04,
      clearcoat: 1
    }),
    tyre: new MeshStandardMaterial({ color: 0x141518, roughness: 0.9 }),
    rim: new MeshStandardMaterial({ color: 0x2b2e33, metalness: 0.9, roughness: 0.28 }),
    disc: new MeshStandardMaterial({ color: 0x9aa0a6, metalness: 1, roughness: 0.35 }),
    caliper: new MeshStandardMaterial({ color: 0xe9e4da, metalness: 0.2, roughness: 0.4 }),
    dark: new MeshStandardMaterial({ color: 0x1b1d21, metalness: 0.4, roughness: 0.55 }),
    steel: new MeshStandardMaterial({ color: 0x6b7178, metalness: 0.85, roughness: 0.3 }),
    engine: new MeshStandardMaterial({ color: 0x3a3f46, metalness: 0.7, roughness: 0.35 }),
    seat: new MeshStandardMaterial({ color: 0x23262b, roughness: 0.8 }),
    lamp: new MeshStandardMaterial({
      color: 0xdfe6ee,
      metalness: 0.3,
      roughness: 0.15,
      emissive: 0x8fb4e8,
      emissiveIntensity: 0.35
    }),
    tail: new MeshStandardMaterial({
      color: 0x9b1712,
      roughness: 0.3,
      emissive: 0xb3201b,
      emissiveIntensity: 0.6
    })
  };
  const geos = [];
  const keep = g => (geos.push(g), g);
  const tmp = new Object3D();

  const root = new Group();
  scene.add(root);

  // Carrozzeria
  const body = new Mesh(keep(bodyGeometry()), mat.paint);
  // Fari sottili sul muso, fanale posteriore a tutta larghezza, prese d'aria laterali
  // davanti alle ruote posteriori, estrattore sotto la coda
  // Fari: sottili, quasi annegati nella superficie del cofano (seguono la sua pendenza)
  const headGeo = keep(new BoxGeometry(0.3, 0.025, 0.2));
  const headU = (L / 2 - 0.36) / L + 0.5;
  [-1, 1].forEach(side => {
    const head = new Mesh(headGeo, mat.lamp);
    head.position.set(L / 2 - 0.36, beltY(headU) - 0.05, side * 0.55);
    head.rotation.set(0, side * 0.35, -0.42);
    body.add(head);
    const intakeSide = new Mesh(keep(new BoxGeometry(0.42, 0.2, 0.06)), mat.dark);
    intakeSide.position.set(-0.68, 0.56, side * HALF_W * 0.95);
    intakeSide.rotation.y = side * -0.12;
    body.add(intakeSide);
  });
  const tailLight = new Mesh(keep(new BoxGeometry(0.04, 0.03, 1.15)), mat.tail);
  tailLight.position.set(-L / 2 + 0.11, 0.75, 0);
  body.add(tailLight);
  const diffuser = new Mesh(keep(new BoxGeometry(0.3, 0.1, 1.3)), mat.dark);
  diffuser.position.set(-L / 2 + 0.2, 0.24, 0);
  body.add(diffuser);
  root.add(body);

  // Abitacolo vetrato
  const cabin = new Mesh(keep(cabinGeometry()), mat.glass);
  root.add(cabin);

  // Sedili e volante
  const seats = new Group();
  const cushion = keep(new BoxGeometry(0.5, 0.12, 0.46));
  const back = keep(new BoxGeometry(0.12, 0.6, 0.46));
  [-0.38, 0.38].forEach(z => {
    const c = new Mesh(cushion, mat.seat);
    c.position.set(-0.05, 0.42, z);
    const bk = new Mesh(back, mat.seat);
    bk.position.set(-0.32, 0.72, z);
    bk.rotation.z = -0.18;
    seats.add(c, bk);
  });
  const wheelRing = new Mesh(keep(new TorusGeometry(0.16, 0.025, 8, 28)), mat.dark);
  wheelRing.position.set(0.42, 0.86, 0.38);
  wheelRing.rotation.y = Math.PI / 2;
  wheelRing.rotation.x = 0.4;
  seats.add(wheelRing);
  root.add(seats);

  // Motore: blocco, testata, coperchio, collettore, puleggia
  const engine = new Group();
  const block = new Mesh(keep(new BoxGeometry(0.62, 0.3, 0.66)), mat.engine);
  const headBox = new Mesh(keep(new BoxGeometry(0.5, 0.12, 0.6)), mat.steel);
  headBox.position.y = 0.21;
  const cover = new Mesh(keep(new BoxGeometry(0.44, 0.05, 0.46)), mat.paint);
  cover.position.y = 0.3;
  const intake = new InstancedMesh(
    keep(new CylinderGeometry(0.035, 0.035, 0.26, 10)),
    mat.steel,
    4
  );
  for (let i = 0; i < 4; i++) {
    tmp.position.set(-0.18 + i * 0.12, 0.2, -0.38);
    tmp.rotation.set(Math.PI / 2.6, 0, 0);
    tmp.updateMatrix();
    intake.setMatrixAt(i, tmp.matrix);
  }
  const pulley = new Mesh(keep(new CylinderGeometry(0.11, 0.11, 0.05, 24)), mat.dark);
  pulley.rotation.z = Math.PI / 2;
  pulley.position.set(0.34, -0.04, 0.12);
  engine.add(block, headBox, cover, intake, pulley);
  // Motore centrale, dietro i sedili
  const ENGINE_BASE = { x: -0.95, y: 0.4 };
  root.add(engine);

  // Telaio: pianale, longheroni, assali
  const chassis = new Group();
  const floor = new Mesh(keep(new BoxGeometry(3.4, 0.06, 1.36)), mat.dark);
  floor.position.set(-0.05, 0.24, 0);
  chassis.add(floor);
  const railGeo = keep(new BoxGeometry(3.9, 0.08, 0.1));
  [-0.55, 0.55].forEach(z => {
    const r = new Mesh(railGeo, mat.steel);
    r.position.set(-0.03, 0.28, z);
    chassis.add(r);
  });
  const axleGeo = keep(new CylinderGeometry(0.035, 0.035, TRACK * 2 - 0.2, 10));
  axleGeo.rotateX(Math.PI / 2);
  WHEEL_X.forEach(x => {
    const a = new Mesh(axleGeo, mat.steel);
    a.position.set(x, WHEEL_R, 0);
    chassis.add(a);
  });
  root.add(chassis);

  // Ruote: quattro istanze per pneumatico, cerchio, razze, disco, pinza
  const wheels = WHEEL_X.flatMap(x => [
    { x, z: TRACK, side: 1 },
    { x, z: -TRACK, side: -1 }
  ]);
  const tyres = new InstancedMesh(keep(tyreGeometry()), mat.tyre, 4);
  const rimGeo = keep(new CylinderGeometry(0.22, 0.22, 0.2, 40, 1, true));
  rimGeo.rotateX(Math.PI / 2);
  const rims = new InstancedMesh(rimGeo, mat.rim, 4);
  const hubGeo = keep(new CylinderGeometry(0.06, 0.06, 0.22, 16));
  hubGeo.rotateX(Math.PI / 2);
  const hubs = new InstancedMesh(hubGeo, mat.steel, 4);
  const spokeGeo = keep(new BoxGeometry(0.035, 0.36, 0.03));
  const spokes = new InstancedMesh(spokeGeo, mat.rim, 4 * 5);
  const discGeo = keep(new CylinderGeometry(0.17, 0.17, 0.025, 32));
  discGeo.rotateX(Math.PI / 2);
  const discs = new InstancedMesh(discGeo, mat.disc, 4);
  const caliperGeo = keep(new BoxGeometry(0.08, 0.16, 0.07));
  const calipers = new InstancedMesh(caliperGeo, mat.caliper, 4);
  root.add(tyres, rims, hubs, spokes, discs, calipers);

  // Ombra di contatto
  const shadowTex = shadowTexture();
  const shadowMat = new MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false });
  const shadow = new Mesh(keep(new PlaneGeometry(5.6, 2.8)), shadowMat);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.002;
  root.add(shadow);

  // ─── Pezzi selezionabili (menu) ─────────────────────────────────────────────
  // Ogni pezzo ha materiali propri (clonati) così si può evidenziare da solo; ogni mesh
  // sa a quale pezzo appartiene (userData.part) per il raggio di selezione.
  const PARTS = {
    carrozzeria: [body],
    cabina: [cabin, seats],
    motore: [engine],
    telaio: [chassis],
    ruote: [tyres, rims, hubs, spokes, discs, calipers]
  };
  const partMaterials = {};
  const pickables = [];
  Object.entries(PARTS).forEach(([name, roots]) => {
    partMaterials[name] = [];
    roots.forEach(r =>
      r.traverse(o => {
        if (!o.isMesh) return;
        o.material = o.material.clone();
        if (o.material.emissive) partMaterials[name].push(o.material);
        o.userData.part = name;
        pickables.push(o);
      })
    );
  });
  const HIGHLIGHT = new Color(0xd97030);
  function setHighlight(name) {
    Object.entries(partMaterials).forEach(([part, list]) =>
      list.forEach(m => {
        m.emissive.copy(HIGHLIGHT);
        m.emissiveIntensity = part === name ? 0.55 : 0;
      })
    );
    requestRender();
  }

  // Punti di ancoraggio delle etichette: seguono i pezzi, anche in vista esplosa
  const anchors = {
    carrozzeria: new Object3D(),
    cabina: new Object3D(),
    motore: new Object3D(),
    telaio: new Object3D(),
    ruote: new Object3D()
  };
  anchors.carrozzeria.position.set(-0.75, 0.55, 0.85);
  body.add(anchors.carrozzeria);
  anchors.cabina.position.set(0.05, 1.25, 0);
  cabin.add(anchors.cabina);
  anchors.motore.position.set(0, 0.1, 0);
  engine.add(anchors.motore);
  anchors.telaio.position.set(-0.4, 0.27, 0.62);
  chassis.add(anchors.telaio);
  root.add(anchors.ruote);
  const anchorVec = new Vector3();
  function project(name) {
    root.updateMatrixWorld(true);
    anchors[name].getWorldPosition(anchorVec);
    anchorVec.project(camera);
    return {
      x: +((anchorVec.x * 0.5 + 0.5) * 100).toFixed(2),
      y: +((-anchorVec.y * 0.5 + 0.5) * 100).toFixed(2)
    };
  }
  function allPositions() {
    const out = {};
    Object.keys(anchors).forEach(n => (out[n] = project(n)));
    return out;
  }

  // ─── Pose ───────────────────────────────────────────────────────────────────
  // Esploso: carrozzeria e abitacolo salgono, il motore esce dalla coda, le ruote si allargano
  const OFF = { body: 0.95, cabin: 1.6, seats: 0.36, engineY: 0.3, engineX: -1.75, wheelZ: 0.62 };
  let t = exploded && (!intro || reducedMotion) ? 1 : 0;
  let target = exploded ? 1 : 0;
  let yaw = -0.62;
  let yawVel = 0;
  let frame = 0;
  let visible = true;
  let disposed = false;
  let last = 0;

  const ease = x => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

  function pose() {
    const e = ease(t);
    body.position.y = OFF.body * e;
    cabin.position.y = OFF.cabin * e;
    seats.position.y = OFF.seats * e;
    engine.position.set(ENGINE_BASE.x + OFF.engineX * e, ENGINE_BASE.y + OFF.engineY * e, 0);
    shadow.material.opacity = 1 - 0.35 * e;
    wheels.forEach((w, i) => {
      const z = w.z + w.side * OFF.wheelZ * e;
      tmp.rotation.set(0, 0, 0);
      tmp.position.set(w.x, WHEEL_R, z);
      tmp.updateMatrix();
      tyres.setMatrixAt(i, tmp.matrix);
      tmp.position.set(w.x, WHEEL_R, z + w.side * 0.02);
      tmp.updateMatrix();
      rims.setMatrixAt(i, tmp.matrix);
      hubs.setMatrixAt(i, tmp.matrix);
      for (let k = 0; k < 5; k++) {
        tmp.position.set(w.x, WHEEL_R, z + w.side * 0.09);
        tmp.rotation.set(0, 0, (k / 5) * Math.PI * 2);
        tmp.updateMatrix();
        spokes.setMatrixAt(i * 5 + k, tmp.matrix);
      }
      tmp.rotation.set(0, 0, 0);
      tmp.position.set(w.x, WHEEL_R, z - w.side * 0.05);
      tmp.updateMatrix();
      discs.setMatrixAt(i, tmp.matrix);
      tmp.position.set(w.x - 0.12, WHEEL_R + 0.08, z - w.side * 0.05);
      tmp.updateMatrix();
      calipers.setMatrixAt(i, tmp.matrix);
    });
    [tyres, rims, hubs, spokes, discs, calipers].forEach(
      m => (m.instanceMatrix.needsUpdate = true)
    );
    const fw = wheels[2];
    anchors.ruote.position.set(fw.x, WHEEL_R + 0.1, fw.z + fw.side * OFF.wheelZ * e);
    root.rotation.y = yaw;
  }

  function resize() {
    const w = Math.max(1, stage.clientWidth);
    const h = Math.max(1, stage.clientHeight);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const dist = camera.aspect < 1 ? 14 : camera.aspect < 1.4 ? 11 : 9.4;
    camera.position.set(0, 2.9, dist);
    camera.lookAt(0.2, 1.25, 0);
    camera.updateProjectionMatrix();
    requestRender();
  }

  function render(now) {
    frame = 0;
    if (disposed) return;
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    last = now;
    let moving = false;
    if (t !== target) {
      const step = dt / 1.4; // circa 1,4 s per la corsa completa
      t = target > t ? Math.min(target, t + step) : Math.max(target, t - step);
      moving = true;
    }
    if (Math.abs(yawVel) > 0.0004) {
      yaw += yawVel;
      yawVel *= 0.92;
      moving = true;
    }
    pose();
    renderer.render(scene, camera);
    onFrame(allPositions(), yaw);
    if (moving) requestRender();
    else last = 0;
  }

  function requestRender() {
    if (!frame && visible && !disposed && !document.hidden) frame = requestAnimationFrame(render);
  }

  // Rotazione: solo trascinamento orizzontale (lo scroll verticale resta alla pagina) e frecce.
  // Un tocco senza trascinamento seleziona il pezzo sotto il dito.
  const raycaster = new Raycaster();
  const ndc = new Vector2();
  function partAt(ev) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.intersectObjects(pickables, false)[0];
    return hit ? hit.object.userData.part : null;
  }
  let dragX = null;
  let startX = 0;
  let moved = 0;
  let hoverPart = null;
  const onDown = ev => {
    dragX = startX = ev.clientX;
    moved = 0;
    canvas.setPointerCapture(ev.pointerId);
  };
  const onMove = ev => {
    if (dragX === null) {
      const part = partAt(ev);
      if (part !== hoverPart) {
        hoverPart = part;
        canvas.style.cursor = part ? 'pointer' : 'grab';
        onHover(part);
      }
      return;
    }
    const dx = ev.clientX - dragX;
    dragX = ev.clientX;
    moved = Math.max(moved, Math.abs(ev.clientX - startX));
    yaw += dx * 0.008;
    yawVel = dx * 0.0016;
    requestRender();
  };
  const onUp = ev => {
    if (dragX !== null && moved < 6) {
      const part = partAt(ev);
      if (part) onPick(part);
    }
    dragX = null;
  };
  const onCancel = () => (dragX = null);
  const onLeave = () => {
    if (hoverPart) {
      hoverPart = null;
      onHover(null);
    }
  };
  const onKey = ev => {
    if (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight') {
      ev.preventDefault();
      yaw += ev.key === 'ArrowLeft' ? -0.25 : 0.25;
      requestRender();
    }
  };
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onCancel);
  canvas.addEventListener('pointerleave', onLeave);
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

  const t0 = performance.now();
  renderer.compile(scene, camera);
  const compileMs = performance.now() - t0;
  resize();
  pose();
  renderer.render(scene, camera);

  const api = {
    setExploded(value) {
      target = value ? 1 : 0;
      requestRender();
    },
    highlight: setHighlight,
    positions: allPositions,
    isExploded: () => target === 1,
    stats() {
      return {
        triangles: renderer.info.render.triangles,
        calls: renderer.info.render.calls,
        geometries: renderer.info.memory.geometries,
        textures: renderer.info.memory.textures,
        pixelRatio: renderer.getPixelRatio(),
        compileMs: Math.round(compileMs)
      };
    },
    // Per la verifica: porta subito a una posa e un angolo senza animazione
    snap(value, angle) {
      t = target = value;
      if (typeof angle === 'number') yaw = angle;
      pose();
      renderer.render(scene, camera);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (frame) cancelAnimationFrame(frame);
      io.disconnect();
      ro.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      geos.forEach(g => g.dispose());
      Object.values(mat).forEach(m => m.dispose());
      Object.values(partMaterials).forEach(list => list.forEach(m => m.dispose()));
      canvas.removeEventListener('pointerleave', onLeave);
      shadowMat.dispose();
      shadowTex.dispose();
      envRT.dispose();
      [tyres, rims, hubs, spokes, discs, calipers, intake].forEach(m => m.dispose());
      renderer.dispose();
      canvas.remove();
    }
  };

  // Introduzione: dall'assemblato alla vista esplosa, una volta sola
  if (exploded && intro && !reducedMotion) {
    setTimeout(() => api.setExploded(true), 450);
    target = 0;
  }
  window.__garage3d = api;
  return api;
}

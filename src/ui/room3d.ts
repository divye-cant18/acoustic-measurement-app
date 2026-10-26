/* The room in 3D for Room Setup (three.js): its box to scale, each part of each wall, the floor and the ceiling in their
   type's colour and texture (src/ui/looks.ts), doors and windows, and a camera that glides to the surface being
   edited. Walls between the camera and the room lower themselves, as on an architect's model. It builds up as the
   room is entered: nothing, then the floor (length and width), then the walls (height). It draws what the screen hands
   it (Snapshot) and nothing else: it measures and estimates nothing. createRoom3D returns null where WebGL is not
   available (the screen keeps its flat sketch). It draws only while something moves, then rests; one material per type
   is shared by every piece of it, and the shadows are worked out again only when the room changes. */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { lookOf } from './looks';

/* eslint-disable @typescript-eslint/no-explicit-any */
// A part of a wall from its left end, as fractions of its length; a door or window: fractions along it, heights in m.
export interface Part3D { type: string; f0: number; f1: number; info: string }
export interface Opening3D { kind: string; f0: number; f1: number; z0: number; z1: number }
export interface Wall3D { key: 'wall1' | 'wall2' | 'wall3' | 'wall4'; name: string; parts: Part3D[]; ops: Opening3D[] }
export interface Snapshot {
  L: number; W: number; H: number; floorOk: boolean; wallsOk: boolean; size: string; message: string;
  walls: Wall3D[]; floor: { type: string; info: string }; ceiling: { type: string; info: string };
}
export interface Room3D { update(s: Snapshot): void; mark(k: string): void; focus(k: string): void; orbit(dir: number): void; tour(): void; dispose(): void }

const T = 0.12, CUT = 0.14;   // wall thickness (m); a lowered wall keeps 14 % of its height
// Wall 1 runs along the length, Wall 2 along the width, and so on round the room (corners as fractions of L and W).
const ENDS: Record<string, [[number, number], [number, number]]> = { wall1: [[0, 0], [1, 0]], wall2: [[1, 0], [1, 1]], wall3: [[1, 1], [0, 1]], wall4: [[0, 1], [0, 0]] };
const TILE: Record<string, number> = { felt: 0.6, slots: 0.6, perf: 0.6, plaster: 1.2, drywall: 1.2, brick: 0.72, block: 1.2, concrete: 1.6, wood: 0.8, fabric: 0.6, panels: 0.6, ctiles: 1.2, metal: 0.6, carpet: 0.5, tiles: 1.2, vinyl: 1.6 };
const ROUGH: Record<string, number> = { felt: 1, slots: 0.75, perf: 0.7, plaster: 0.92, drywall: 0.9, brick: 0.95, block: 0.93, concrete: 0.88, wood: 0.62, fabric: 1, panels: 0.8, ctiles: 0.95, metal: 0.38, carpet: 1, tiles: 0.35, vinyl: 0.55, mirror: 0.06 };

export function createRoom3D(host: HTMLElement, onPick: (k: string) => void): Room3D | null {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    if (!renderer.getContext()) throw new Error('no WebGL');
  } catch { return null; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;   // worked out again only when the room changes (see shade)
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.02;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  host.appendChild(renderer.domElement);
  const labels = new CSS2DRenderer(); labels.domElement.className = 'v-labels'; host.appendChild(labels.domElement);
  const div = (cls: string, text = '') => { const d = document.createElement('div'); d.className = cls; d.textContent = text; host.appendChild(d); return d; };
  const tip = div('v-tip'), hint = div('v-hint', 'Drag to look around · click a wall to edit it'), size = div('v-size'), msg = div('v-msg');

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer), env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = env;
  const camera = new THREE.PerspectiveCamera(34, 1, 0.05, 200);
  const controls = new OrbitControls(camera, renderer.domElement);
  Object.assign(controls, { enableDamping: true, dampingFactor: 0.1, enablePan: false, minDistance: 1.2, maxDistance: 40, rotateSpeed: 0.8 });
  controls.maxPolarAngle = Math.PI * 0.49;

  // light: a warm sun with soft shadows, sky fill, a cool rim
  scene.add(new THREE.HemisphereLight(0xfff7f0, 0xd8ccc8, 0.55));
  const sun = new THREE.DirectionalLight(0xffecd9, 2.3);
  sun.position.set(6, 10, 7); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 1, far: 50 });
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.025;
  scene.add(sun);
  const rim = new THREE.DirectionalLight(0xdde7f3, 0.55); rim.position.set(-7, 6, -6); scene.add(rim);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.ShadowMaterial({ opacity: 0.14 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.16; ground.receiveShadow = true; scene.add(ground);

  /* ---------- surfaces: a painted texture per type, in its own colour ---------- */
  const cache: Record<string, THREE.CanvasTexture> = {}, aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const rng = (seed: number) => { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; };
  const tone = (hex: string, dl: number) => { const c = new THREE.Color(hex); c.offsetHSL(0, 0, dl); return `#${c.getHexString()}`; };
  function paint(key: string, c: string, lk: string) {
    const N = 512, cv = document.createElement('canvas'); cv.width = cv.height = N;
    const g = cv.getContext('2d')!, r = rng(key.length * 7919 + key.charCodeAt(key.length - 1) * 31 + 13);
    const base = (col: string) => { g.fillStyle = col; g.fillRect(0, 0, N, N); };
    const speck = (n: number, a: number, sz = 2) => { for (let i = 0; i < n; i++) { g.fillStyle = r() > 0.5 ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`; g.fillRect(r() * N, r() * N, sz * r() + 0.6, sz * r() + 0.6); } };
    if (lk === 'brick' || lk === 'block') {
      const rows = lk === 'brick' ? 8 : 4, h = N / rows, bw = N / (lk === 'brick' ? 4 : 2), gap = lk === 'brick' ? 4 : 3;
      base(lk === 'brick' ? '#E7DDD7' : tone(c, -0.08));
      for (let y = 0; y < rows; y++) for (let x = -1; x < N / bw + 1; x++) { g.fillStyle = tone(c, (r() - 0.5) * 0.09); g.fillRect(x * bw + (y % 2 ? bw / 2 : 0) + gap, y * h + gap, bw - 2 * gap, h - 2 * gap); }
      speck(2500, 0.05);
    } else if (lk === 'wood') {
      for (let b = 0; b < 4; b++) { g.fillStyle = tone(c, (r() - 0.5) * 0.07); g.fillRect(b * N / 4, 0, N / 4, N); }
      g.lineWidth = 1.2;
      for (let i = 0; i < 70; i++) { const x0 = r() * N; g.strokeStyle = `rgba(80,45,20,${0.05 + r() * 0.07})`; g.beginPath(); for (let y = 0; y <= N; y += 16) g.lineTo(x0 + Math.sin(y / 40 + i) * 4, y); g.stroke(); }
      g.fillStyle = 'rgba(60,35,15,.35)'; for (let b = 1; b <= 4; b++) g.fillRect(b * N / 4 - 2, 0, 3, N);
    } else if (lk === 'panels') {
      base(c); speck(1800, 0.04);
      for (let x = 0; x < N; x += N / 8) { const gr = g.createLinearGradient(x, 0, x + 18, 0); gr.addColorStop(0, 'rgba(0,0,0,.42)'); gr.addColorStop(0.6, 'rgba(0,0,0,.12)'); gr.addColorStop(1, 'rgba(255,255,255,.08)'); g.fillStyle = gr; g.fillRect(x, 0, 18, N); }
    } else if (lk === 'fabric') {
      base(c);
      for (let x = 0; x < N; x += 64) { const gr = g.createLinearGradient(x, 0, x + 64, 0); gr.addColorStop(0, 'rgba(0,0,0,.14)'); gr.addColorStop(0.5, 'rgba(255,255,255,.14)'); gr.addColorStop(1, 'rgba(0,0,0,.14)'); g.fillStyle = gr; g.fillRect(x, 0, 64, N); }
      speck(3000, 0.03, 1);
    } else if (lk === 'concrete') {
      base(c);
      for (let i = 0; i < 40; i++) { const x = r() * N, y = r() * N, rad = 30 + r() * 90, gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, `rgba(0,0,0,${0.04 + r() * 0.05})`); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - rad, y - rad, 2 * rad, 2 * rad); }
      speck(3500, 0.08, 1.6);
    } else if (lk === 'tiles' || lk === 'ctiles') {
      base(lk === 'tiles' ? '#EFE9E4' : '#F2EFEC'); const n = 2, s = N / n;
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { g.fillStyle = tone(c, (r() - 0.5) * 0.05); g.fillRect(i * s + 3, j * s + 3, s - 6, s - 6); }
      if (lk === 'ctiles') speck(2600, 0.12, 1.4); else speck(1200, 0.03);
    } else if (lk === 'carpet') {
      base(c); speck(16000, 0.07, 1.4);
    } else if (lk === 'metal') {
      base(c); for (let y = 0; y < N; y += 2) { g.fillStyle = `rgba(255,255,255,${r() * 0.06})`; g.fillRect(0, y, N, 1); }
      g.fillStyle = 'rgba(0,0,0,.18)'; for (let y = 0; y < N; y += N / 4) g.fillRect(0, y, N, 3);
    } else if (lk === 'vinyl') {
      base(c); g.strokeStyle = 'rgba(255,255,255,.07)'; g.lineWidth = 6;
      for (let i = 0; i < 12; i++) { g.beginPath(); g.moveTo(0, r() * N); g.bezierCurveTo(N / 3, r() * N, 2 * N / 3, r() * N, N, r() * N); g.stroke(); }
    } else if (lk === 'felt') {
      base(c); speck(9000, 0.05, 1.2);
    } else if (lk === 'slots') {
      base(c); g.fillStyle = 'rgba(30,15,8,.55)'; for (let x = 10; x < N; x += N / 10) g.fillRect(x, 0, 8, N);
    } else if (lk === 'perf') {
      base(c); g.fillStyle = 'rgba(0,0,0,.32)'; for (let y = 8; y < N; y += 16) for (let x = 8; x < N; x += 16) { g.beginPath(); g.arc(x, y, 2.6, 0, Math.PI * 2); g.fill(); }
    } else if (lk === 'drywall') {
      base(c); speck(1500, 0.025); g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(N - 3, 0, 3, N);
    } else { base(c); speck(2600, 0.035); }
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = aniso;
    return t;
  }
  // A type's material, made once and shared by every piece of it (a change to the room never copies or uploads a texture
  // again); its texture repeats in metres through each piece's own coordinates (tiled). Not chosen yet: light grey.
  const mats: Record<string, THREE.Material> = {};
  const keep = <M extends THREE.Material>(m: M) => { m.userData.shared = true; return m; };
  const BLANK = keep(new THREE.MeshStandardMaterial({ color: 0xEDE8E6, roughness: 0.95 }));
  function surface(kind: string, type: string): THREE.Material {
    const l = lookOf(kind, type), key = `${kind}:${type}`;
    if (!l) return BLANK;
    if (!mats[key]) {
      mats[key] = keep(l.look === 'mirror'
        ? new THREE.MeshStandardMaterial({ color: new THREE.Color(l.color), roughness: ROUGH.mirror, metalness: 0.9, envMapIntensity: 1.2 })
        : new THREE.MeshStandardMaterial({ map: cache[key] || (cache[key] = paint(key, l.color, l.look)), roughness: ROUGH[l.look] ?? 0.85, metalness: l.look === 'metal' ? 0.55 : 0, envMapIntensity: 0.5 }));
    }
    return mats[key];
  }
  const tileOf = (kind: string, type: string) => { const l = lookOf(kind, type); return (l && TILE[l.look]) || 1; };
  // A piece's texture coordinates in tiles: on a box w × h × d, each face by its own two sides (BoxGeometry's faces:
  // ±x d × h, ±y w × d, ±z w × h); on a plane w × h.
  function tiled<G extends THREE.BufferGeometry>(geo: G, w: number, h: number, d: number | null, tile: number) {
    const uv = geo.attributes.uv as THREE.BufferAttribute, faces: [number, number][] = d == null ? [[w, h]] : [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
    for (let i = 0; i < uv.count; i++) { const [a, b] = faces[d == null ? 0 : Math.floor(i / 4)]; uv.setXY(i, uv.getX(i) * a / tile, uv.getY(i) * b / tile); }
    return geo;
  }
  const FRAME = keep(new THREE.MeshStandardMaterial({ color: 0x3B3536, roughness: 0.4, metalness: 0.6, envMapIntensity: 0.8 }));
  const WHITE = keep(new THREE.MeshStandardMaterial({ color: 0xF4F1EF, roughness: 0.6, envMapIntensity: 0.5 }));
  const LEAF = keep(new THREE.MeshStandardMaterial({ color: 0xF7F4F2, roughness: 0.45, envMapIntensity: 0.6 }));
  // glass: see-through without writing depth, so panes behind each other never flicker as the view turns
  const PANE = keep(new THREE.MeshStandardMaterial({ color: 0xDCEFF3, transparent: true, opacity: 0.26, roughness: 0.05, metalness: 0, envMapIntensity: 1.4, depthWrite: false }));
  const GLOW = keep(new THREE.MeshBasicMaterial({ color: 0xEE4935, transparent: true, opacity: 0.85 }));
  const LAMP = keep(new THREE.MeshBasicMaterial({ color: 0xFFF7E8 }));
  const glassOf = (hex: string) => mats[`glass:${hex}`] || (mats[`glass:${hex}`] = keep(new THREE.MeshStandardMaterial({ color: new THREE.Color(hex), transparent: true, opacity: 0.38, roughness: 0.05, metalness: 0.05, envMapIntensity: 1.5, depthWrite: false })));

  /* ---------- the room ---------- */
  let snap: Snapshot | null = null, sel = '', room: THREE.Group | null = null, glow: THREE.Group | null = null, sig = '', lastKey = '', lastSpan = 0, settle = 0, dragging = false;
  let walls: Record<string, THREE.Group> = {}, badges: Record<string, CSS2DObject> = {};
  function frameOf(k: string) {
    const s = snap!, [[ax, ay], [bx, by]] = ENDS[k], A = { x: ax * s.L, y: ay * s.W }, B = { x: bx * s.L, y: by * s.W };
    const len = Math.hypot(B.x - A.x, B.y - A.y), d = { x: (B.x - A.x) / len, y: (B.y - A.y) / len };
    return { A, d, n: { x: -d.y, y: d.x }, len };   // n: into the room
  }
  // A box on the wall: u along it, z up; off: its distance in front of the inner face (into the room is positive).
  // tile: the texture's size in m, for a piece with a type's texture.
  function onWall(f: ReturnType<typeof frameOf>, u0: number, u1: number, z0: number, z1: number, depth: number, off: number, mat: THREE.Material, tile?: number) {
    const s = snap!, uc = (u0 + u1) / 2, px = f.A.x + f.d.x * uc + f.n.x * off, py = f.A.y + f.d.y * uc + f.n.y * off, w = Math.max(u1 - u0, 0.001), h = Math.max(z1 - z0, 0.001);
    const geo = new THREE.BoxGeometry(w, h, depth), m = new THREE.Mesh(tile ? tiled(geo, w, h, depth, tile) : geo, mat);
    m.position.set(px - s.L / 2, (z0 + z1) / 2, py - s.W / 2); m.rotation.y = -Math.atan2(f.d.y, f.d.x);
    m.castShadow = true; m.receiveShadow = true;
    return m;
  }
  type Rect = { u0: number; u1: number; z0: number; z1: number };
  const minus = (rects: Rect[], h: Rect) => rects.flatMap(r => {
    if (h.u1 <= r.u0 || h.u0 >= r.u1 || h.z1 <= r.z0 || h.z0 >= r.z1) return [r];
    const a = Math.max(r.u0, h.u0), b = Math.min(r.u1, h.u1);
    return [{ u0: r.u0, u1: a, z0: r.z0, z1: r.z1 }, { u0: b, u1: r.u1, z0: r.z0, z1: r.z1 }, { u0: a, u1: b, z0: r.z0, z1: h.z0 }, { u0: a, u1: b, z0: h.z1, z1: r.z1 }]
      .filter(x => x.u1 - x.u0 > 0.005 && x.z1 - x.z0 > 0.005);
  });
  function buildWall(w: Wall3D) {
    const g = new THREE.Group(), f = frameOf(w.key), H = snap!.H, k = w.key, len = f.len;
    g.userData = Object.assign({ k }, f);
    const ops = w.ops.map(o => ({ kind: o.kind, u0: o.f0 * len, u1: o.f1 * len, z0: o.z0, z1: Math.min(o.z1, H) })).filter(o => o.u1 > o.u0);
    w.parts.forEach(p => {
      const u0 = p.f0 * len, u1 = p.f1 * len;
      if (u1 - u0 <= 0) return;
      let rects: Rect[] = [{ u0, u1, z0: 0, z1: H }];
      ops.forEach(o => { rects = minus(rects, o); });
      const l = lookOf('wall', p.type), info = `${w.name} · ${p.info}`;
      rects.forEach(r => {
        if (l && l.look === 'glass') {
          const pane = onWall(f, r.u0, r.u1, r.z0, r.z1, 0.014, -T / 2, glassOf(l.color)); pane.castShadow = false; pane.userData = { k, info }; g.add(pane);
          const bars = [onWall(f, r.u0, r.u1, r.z0, r.z0 + 0.07, 0.06, -T / 2, FRAME), onWall(f, r.u0, r.u1, r.z1 - 0.05, r.z1, 0.06, -T / 2, FRAME)];
          const cols = Math.max(1, Math.round((r.u1 - r.u0) / 1.1));
          for (let i = 0; i <= cols; i++) { const u = r.u0 + (r.u1 - r.u0) * i / cols; bars.push(onWall(f, Math.max(r.u0, u - 0.025), Math.min(r.u1, u + 0.025), r.z0, r.z1, 0.06, -T / 2, FRAME)); }
          bars.forEach(b => { b.userData = { k, info }; g.add(b); });
        } else {
          const m = onWall(f, r.u0, r.u1, r.z0, r.z1, T, -T / 2, surface('wall', p.type), tileOf('wall', p.type)); m.userData = { k, info }; g.add(m);
        }
      });
    });
    ops.forEach(o => {
      const info = `${w.name} · ${o.kind === 'window' ? 'window' : o.kind === 'door' ? 'door' : 'opening'}`, add = (m: THREE.Mesh) => { m.userData = { k, info }; g.add(m); }, fw = 0.05;
      add(onWall(f, o.u0, o.u0 + fw, o.z0, o.z1, T + 0.02, -T / 2, WHITE)); add(onWall(f, o.u1 - fw, o.u1, o.z0, o.z1, T + 0.02, -T / 2, WHITE));
      add(onWall(f, o.u0, o.u1, o.z1 - fw, o.z1, T + 0.02, -T / 2, WHITE));
      if (o.kind === 'door') {
        add(onWall(f, o.u0 + fw, o.u1 - fw, 0, o.z1 - fw, 0.04, -0.03, LEAF));
        add(onWall(f, o.u1 - fw - 0.12, o.u1 - fw - 0.06, 1.0, 1.03, 0.06, 0.02, FRAME));
      } else if (o.kind === 'window') {
        add(onWall(f, o.u0, o.u1, o.z0, o.z0 + fw, T + 0.06, -T / 2 + 0.02, WHITE));
        const p = onWall(f, o.u0 + fw, o.u1 - fw, o.z0 + fw, o.z1 - fw, 0.012, -T / 2, PANE); p.castShadow = false; add(p);
        add(onWall(f, (o.u0 + o.u1) / 2 - 0.02, (o.u0 + o.u1) / 2 + 0.02, o.z0 + fw, o.z1 - fw, 0.04, -T / 2, WHITE));
      }
    });
    return g;
  }
  // The surface being edited: a frame on a wall's inner face, and its badge lit.
  function drawGlow() {
    if (glow) { if (glow.parent) glow.parent.remove(glow); glow.traverse((c: any) => { if (c.isMesh) c.geometry.dispose(); }); }
    glow = null;
    Object.entries(badges).forEach(([k, b]) => b.element.classList.toggle('on', k === sel));
    const w = walls[sel];
    if (!w || !room || !snap) return;
    const f = frameOf(sel), H = snap.H, t = 0.035, off = 0.012, len = f.len;
    glow = new THREE.Group();
    [[0, len, H - t, H], [0, len, 0, t], [0, t, 0, H], [len - t, len, 0, H]].forEach(([a, b, c, d]) => { const m = onWall(f, a, b, c, d, 0.01, off, GLOW); m.castShadow = false; m.receiveShadow = false; glow!.add(m); });
    w.add(glow);
  }
  function badge(k: string, text: string, soft: boolean) {
    const el = document.createElement('button'); el.type = 'button'; el.className = soft ? 'badge3d soft' : 'badge3d'; el.textContent = text; el.setAttribute('aria-label', `Edit ${text.length > 1 ? text.toLowerCase() : `Wall ${text}`}`);
    el.addEventListener('click', ev => { ev.stopPropagation(); onPick(k); });
    return new CSS2DObject(el);
  }
  function dispose(o: THREE.Object3D) {
    o.traverse((c: any) => {
      if (c.isMesh) { c.geometry.dispose(); if (c.material && !c.material.userData.shared) c.material.dispose(); }
      if (c.isCSS2DObject && c.element.parentNode) c.element.parentNode.removeChild(c.element);
    });
  }
  function build() {
    const s = snap!, { L, W, H, floorOk, wallsOk } = s, prevCut: Record<string, number> = {};
    Object.entries(walls).forEach(([k, g]) => { prevCut[k] = g.scale.y; });
    if (room) { scene.remove(room); dispose(room); }
    room = new THREE.Group(); walls = {}; badges = {}; glow = null;
    msg.textContent = s.message; size.textContent = s.size;
    // the sun's shadows cover the room closely (sharper, steadier), worked out again for the new room
    const reach = Math.hypot(L, W) / 2 + (wallsOk ? H : 0) * 0.7 + 0.6;
    Object.assign(sun.shadow.camera, { left: -reach, right: reach, top: reach, bottom: -reach });
    sun.shadow.camera.updateProjectionMatrix(); shade();
    // the model's base (faint until there is a floor), the floor and the ceiling (the ceiling only shows from inside: it faces down)
    const base = new THREE.Mesh(new THREE.BoxGeometry(L + 2 * T + 0.5, 0.15, W + 2 * T + 0.5), new THREE.MeshStandardMaterial({ color: 0xEAE4E1, roughness: 0.85, transparent: !floorOk, opacity: floorOk ? 1 : 0.45 }));
    base.position.y = -0.075; base.receiveShadow = true; base.castShadow = floorOk; room.add(base);
    scene.add(room);
    if (!floorOk) return;
    const floor = new THREE.Mesh(tiled(new THREE.PlaneGeometry(L, W), L, W, null, tileOf('floor', s.floor.type)), surface('floor', s.floor.type)); floor.rotation.x = -Math.PI / 2; floor.position.y = 0.002; floor.receiveShadow = true;
    floor.userData = { k: 'floor', info: `Floor · ${s.floor.info}` }; room.add(floor);
    const bf = badge('floor', 'Floor', true); bf.position.set(0, 0.06, 0); badges.floor = bf; room.add(bf);
    if (!wallsOk) { drawGlow(); return; }
    const ceil = new THREE.Mesh(tiled(new THREE.PlaneGeometry(L, W), L, W, null, tileOf('ceiling', s.ceiling.type)), surface('ceiling', s.ceiling.type)); ceil.rotation.x = Math.PI / 2; ceil.position.y = H;
    ceil.userData = { k: 'ceiling', info: `Ceiling · ${s.ceiling.info}` }; room.add(ceil);
    [[-L / 4, -W / 4], [L / 4, -W / 4], [-L / 4, W / 4], [L / 4, W / 4]].forEach(([x, z]) => { const d = new THREE.Mesh(new THREE.CircleGeometry(0.09, 24), LAMP); d.rotation.x = Math.PI / 2; d.position.set(x, H - 0.005, z); room!.add(d); });
    const bulb = new THREE.PointLight(0xffe9cc, 3.2, Math.max(L, W) * 2.4, 1.4); bulb.position.set(0, H * 0.55, 0); room.add(bulb);
    s.walls.forEach(w => {
      const g = buildWall(w); g.scale.y = prevCut[w.key] ?? 0.02; walls[w.key] = g; room!.add(g);   // new walls rise
      const b = badge(w.key, w.key.slice(4), false); badges[w.key] = b; room!.add(b);
    });
    const bc = badge('ceiling', 'Ceiling', true); bc.position.set(0, H + 0.25, 0); badges.ceiling = bc; room.add(bc);
    drawGlow();
  }

  /* ---------- the camera: views and glides ---------- */
  const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  interface View { t: THREE.Vector3; r: number; phi: number; theta: number; maxPolar?: number }
  let glide: any = null;
  function viewFor(k: string): View {
    // far enough for the whole room to fit the view whatever its shape: its bounding sphere in the narrower of the
    // vertical and horizontal fields of view
    const s = snap!, H = s.wallsOk ? s.H : 2.7, vf = camera.fov * Math.PI / 180, hf = 2 * Math.atan(Math.tan(vf / 2) * camera.aspect);
    const far = 0.5 * Math.hypot(s.L, s.W, H) / Math.sin(Math.min(vf, hf) / 2) * 1.05;
    if (k === 'ceiling' && s.wallsOk) return { t: new THREE.Vector3(0, H * 0.92, 0), r: Math.min(s.L, s.W) * 0.5, phi: 2.2, theta: Math.PI * 0.27, maxPolar: Math.PI * 0.98 };
    if (k === 'floor') return { t: new THREE.Vector3(0, 0, 0), r: far * 0.95, phi: 0.5, theta: Math.PI * 0.27 };
    if (!ENDS[k] || !walls[k]) return { t: new THREE.Vector3(0, H * 0.35, 0), r: far, phi: 0.95, theta: Math.PI * 0.25 };
    const f = frameOf(k);   // stand on the side the wall's inner face looks at, a little to one side
    return { t: new THREE.Vector3(0, H * 0.36, 0), r: far, phi: 1.03, theta: Math.atan2(f.n.x, f.n.y) + 0.42 };
  }
  const still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;   // then views change at once
  function glideTo(v: View, ms = 1500) {
    if (still) ms = 1;
    const from = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
    let dth = v.theta - from.theta; while (dth > Math.PI) dth -= 2 * Math.PI; while (dth < -Math.PI) dth += 2 * Math.PI;
    glide = { s: performance.now(), ms, t0: controls.target.clone(), t1: v.t, r0: from.radius, r1: v.r, p0: from.phi, p1: v.phi, th0: from.theta, th1: from.theta + dth, maxPolar: v.maxPolar || Math.PI * 0.49 };
    controls.maxPolarAngle = Math.PI * 0.98; controls.minDistance = 0.4;
    wake();
  }
  function tour() {
    if (still) return;
    const sph = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
    glide = { s: performance.now(), ms: 14000, t0: controls.target.clone(), t1: controls.target.clone(), r0: sph.radius, r1: sph.radius, p0: sph.phi, p1: sph.phi, th0: sph.theta, th1: sph.theta + 2 * Math.PI, maxPolar: controls.maxPolarAngle, linear: true };
    wake();
  }
  // A drag, a wheel turn or a touch takes over from any glide or tour at once.
  const stopGlide = () => { if (glide) { controls.maxPolarAngle = glide.maxPolar; controls.minDistance = glide.maxPolar > 2 ? 0.4 : 1.2; glide = null; } };
  controls.addEventListener('start', () => { dragging = true; clearTimeout(settle); stopGlide(); });
  controls.addEventListener('end', () => { dragging = false; });
  controls.addEventListener('change', () => wake());

  /* ---------- pointing at the room ---------- */
  const ray = new THREE.Raycaster(), ptr = new THREE.Vector2(), cv = renderer.domElement;
  let downAt: [number, number] | null = null;
  function hit(ev: PointerEvent) {
    const b = cv.getBoundingClientRect(); ptr.set(((ev.clientX - b.left) / b.width) * 2 - 1, -((ev.clientY - b.top) / b.height) * 2 + 1);
    ray.setFromCamera(ptr, camera);
    const hits = room ? ray.intersectObjects(room.children, true).filter(h => h.object.userData && h.object.userData.info && h.object.visible) : [];
    return hits[0] || null;
  }
  const onMove = (ev: PointerEvent) => {
    if (ev.buttons) { tip.classList.remove('show'); return; }   // turning the view: no tooltip
    const h = hit(ev), b = host.getBoundingClientRect();
    if (h) { tip.textContent = h.object.userData.info; tip.style.left = `${ev.clientX - b.left + 14}px`; tip.style.top = `${ev.clientY - b.top + 12}px`; tip.classList.add('show'); cv.style.cursor = 'pointer'; }
    else { tip.classList.remove('show'); cv.style.cursor = 'grab'; }
  };
  const onLeave = () => tip.classList.remove('show');
  const onDown = (ev: PointerEvent) => { downAt = [ev.clientX, ev.clientY]; hint.classList.add('gone'); stopGlide(); };
  const onUp = (ev: PointerEvent) => {
    if (!downAt || Math.hypot(ev.clientX - downAt[0], ev.clientY - downAt[1]) > 5) return;
    const h = hit(ev); if (h && h.object.userData.k) onPick(h.object.userData.k);
  };
  cv.addEventListener('pointermove', onMove); cv.addEventListener('pointerleave', onLeave); cv.addEventListener('pointerdown', onDown); cv.addEventListener('pointerup', onUp);

  /* ---------- size and frames: drawn while something moves, then at rest ---------- */
  function resize() {
    const w = host.clientWidth, h = host.clientHeight; if (!w || !h) return;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); renderer.setSize(w, h, false); labels.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); wake(); }
  const ro = new ResizeObserver(resize); ro.observe(host);
  const clock = new THREE.Clock();
  let raf = 0, quiet = 0;
  function shade() { renderer.shadowMap.needsUpdate = true; wake(); }
  function wake() { quiet = 0; if (!raf) { clock.getDelta(); raf = requestAnimationFrame(frame); } }
  function frame() {
    raf = 0;
    if (!snap) return;
    const now = performance.now(), dt = Math.min(clock.getDelta(), 0.05);
    let busy = false;
    if (glide) {
      busy = true;
      const p = Math.min(1, (now - glide.s) / glide.ms), e = glide.linear ? p : ease(p);
      controls.target.lerpVectors(glide.t0, glide.t1, e);
      const sp = new THREE.Spherical(glide.r0 + (glide.r1 - glide.r0) * e, glide.p0 + (glide.p1 - glide.p0) * e, glide.th0 + (glide.th1 - glide.th0) * e);
      camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(sp)); camera.lookAt(controls.target);
      if (p >= 1) { controls.maxPolarAngle = glide.maxPolar; controls.minDistance = glide.maxPolar > 2 ? 0.4 : 1.2; glide = null; }
    } else if (controls.update()) busy = true;
    // walls between the camera and the room lower themselves; from inside, every wall stands. A wall lowers once the
    // camera is clearly outside it and rises once clearly inside (0.5 m either way), so it never flicks at a corner.
    const { L, W, H } = snap, cx = camera.position.x + L / 2, cy = camera.position.z + W / 2;
    const inside = cx > 0 && cx < L && cy > 0 && cy < W && camera.position.y < H;
    Object.values(walls).forEach(g => {
      const { A, d, n, len } = g.userData, mx = A.x + d.x * len / 2, my = A.y + d.y * len / 2, out = (mx - cx) * n.x + (my - cy) * n.y;
      g.userData.low = !inside && (g.userData.low == null ? out > 0 : g.userData.low ? out > -0.5 : out > 0.5);
      const target = g.userData.low ? CUT : 1, step = (target - g.scale.y) * Math.min(1, dt * 7);
      if (Math.abs(target - g.scale.y) > 0.002) { g.scale.y += step; busy = true; renderer.shadowMap.needsUpdate = true; } else if (g.scale.y !== target) { g.scale.y = target; renderer.shadowMap.needsUpdate = true; }
      const b = badges[g.userData.k]; if (b) b.position.set(mx - L / 2 + n.x * 0.05, g.scale.y * H + 0.22, my - W / 2 + n.y * 0.05);
    });
    renderer.render(scene, camera); labels.render(scene, camera);
    // a few more frames after the last movement, so damping settles
    if (busy) quiet = 0; else quiet++;
    // one loop only: controls.update() above may already have asked for the next frame (its 'change' wakes the view)
    if (quiet < 10 && !raf) raf = requestAnimationFrame(frame);
  }

  /* ---------- talking to the screen ---------- */
  let first = true;
  return {
    update(s: Snapshot) {
      const sg = JSON.stringify(s);
      if (sg === sig) return;
      sig = sg; snap = s; build(); wake();
      const key = `${s.floorOk}${s.wallsOk}`, span = Math.max(s.L, s.W) * 1.3 + s.H * 0.85;
      if (first) {   // the opening shot: from further out, gliding to the surface being edited
        first = false; lastKey = key; lastSpan = span;
        resize();   // the view's own shape first: the framing depends on it
        const v = viewFor(sel), start0 = new THREE.Spherical(v.r * 1.7, 0.6, v.theta - 0.7);
        controls.target.copy(v.t); camera.position.copy(v.t).add(new THREE.Vector3().setFromSpherical(start0)); camera.lookAt(v.t);
        glideTo(v, 1500);
      } else if (key !== lastKey || Math.abs(span - lastSpan) / lastSpan > 0.15) {
        // the room grew or shrank enough to need re-framing: once the typing has paused, unless the user is turning it
        lastKey = key; lastSpan = span; clearTimeout(settle);
        settle = window.setTimeout(() => { if (!dragging) glideTo(viewFor(sel), 1000); }, 900);
      }
    },
    mark(k: string) { if (k === sel) return; sel = k; if (snap) { drawGlow(); wake(); } },
    focus(k: string) { if (snap) glideTo(viewFor(k), 1000); },
    orbit(dir: number) {
      const sph = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
      glideTo({ t: controls.target.clone(), r: sph.radius, phi: sph.phi, theta: sph.theta + dir * Math.PI / 2, maxPolar: controls.maxPolarAngle }, 800);
    },
    tour,
    dispose() {
      if (raf) cancelAnimationFrame(raf);
      clearTimeout(settle); ro.disconnect(); controls.dispose();
      cv.removeEventListener('pointermove', onMove); cv.removeEventListener('pointerleave', onLeave); cv.removeEventListener('pointerdown', onDown); cv.removeEventListener('pointerup', onUp);
      if (room) dispose(room);
      Object.values(cache).forEach(t => t.dispose()); [...Object.values(mats), BLANK, FRAME, WHITE, LEAF, PANE, GLOW, LAMP].forEach(m => m.dispose()); env.dispose(); pmrem.dispose();
      renderer.dispose(); renderer.forceContextLoss();
      host.innerHTML = '';
    },
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

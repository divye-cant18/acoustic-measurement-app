/* Drawings for the solutions explorer (Treatment), in the manner of a product catalogue: each kind of product
   (AM.services.solutions kindOf) shown in a small lit interior. Wall products hang on a wall with a chair in front for
   scale; clouds and ceiling tiles are seen in a room drawn in one-point perspective, with a table and chairs below.
   Product, room and furniture colours are theme tokens (--sc-*, css/app.css). Nothing in a drawing is product data
   except its depth, which follows the version's thickness (exaggerated, but in step with it).

   RoomPreview draws how much of the walls or ceiling an amount covers: the share of the free surface, laid out tidily,
   not the exact positions. */
import { useId } from 'react';
import type { ReactNode } from 'react';

type Pt = [number, number];
type P3 = [number, number, number];
const V = (n: string) => `var(--sc-${n})`;
const P = (a: Pt[]) => a.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
const lerp = (a: Pt, b: Pt, t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
// A point inside a four-corner shape (top-left, top-right, bottom-right, bottom-left), u across and v down.
const inQuad = (q: Pt[], u: number, v: number): Pt => lerp(lerp(q[0], q[1], u), lerp(q[3], q[2], u), v);
const svgId = (raw: string) => `sc${raw.replace(/[^a-zA-Z0-9]/g, '')}`;

/* ---------- a room in one-point perspective: x across, y up from the floor, z away from the viewer ---------- */
type Cam = { at: (x: number, y: number, z: number) => Pt; eye: number; f: number };
const camera = (f: number, cx: number, cy: number, eye: number): Cam => ({ at: (x, y, z) => [cx + (f * x) / z, cy - (f * (y - eye)) / z], eye, f });
type Room = { w: number; h: number; z0: number; z1: number }; // half the width, the height, the front and the back
const quad = (cam: Cam, pts: P3[]) => P(pts.map(([x, y, z]) => cam.at(x, y, z)));
function surfaces(r: Room): Record<'ceil' | 'floor' | 'back' | 'left' | 'right', P3[]> {
  const { w, h, z0, z1 } = r;
  return {
    ceil: [[-w, h, z0], [w, h, z0], [w, h, z1], [-w, h, z1]],
    floor: [[-w, 0, z0], [w, 0, z0], [w, 0, z1], [-w, 0, z1]],
    back: [[-w, h, z1], [w, h, z1], [w, 0, z1], [-w, 0, z1]],
    left: [[-w, h, z0], [-w, h, z1], [-w, 0, z1], [-w, 0, z0]],
    right: [[w, h, z0], [w, h, z1], [w, 0, z1], [w, 0, z0]],
  };
}
// The room's ceiling, walls and floor; `mark` tints the surfaces a product goes on.
function Shell({ cam, room, id, mark }: { cam: Cam; room: Room; id: string; mark?: string[] }) {
  const s = surfaces(room), on = (k: string) => !!mark && mark.includes(k);
  const fills: Record<string, string> = { ceil: `url(#${id}c)`, left: V('side'), right: V('side-2'), floor: `url(#${id}f)`, back: `url(#${id}w)` };
  const order = ['ceil', 'left', 'right', 'floor', 'back'] as const;
  return (
    <g className="sc-shell">
      {order.map(k => <polygon key={k} points={quad(cam, s[k])} fill={fills[k]} />)}
      {order.filter(on).map(k => <polygon key={`m${k}`} points={quad(cam, s[k])} fill={V('target')} />)}
      <polygon points={quad(cam, s.back)} fill="none" stroke={V('line')} strokeWidth={0.8} vectorEffect="non-scaling-stroke" />
    </g>
  );
}
// A soft armchair, drawn 42 wide with its feet at y 29; placed and scaled where it stands.
function Armchair({ id, x, y, k = 1 }: { id: string; x: number; y: number; k?: number }) {
  return (
    <g className="sc-prop" transform={`translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${k.toFixed(3)})`}>
      <ellipse cx={21} cy={30.5} rx={24} ry={2.8} fill={V('shadow')} filter={`url(#${id}b)`} />
      <rect x={4} y={0} width={34} height={24} rx={8} fill={V('prop-2')} />
      <rect x={0} y={12} width={42} height={17} rx={6} fill={V('prop')} />
      <rect x={7} y={11} width={28} height={7} rx={3.5} fill={V('prop-hi')} />
    </g>
  );
}
// Two armchairs and a round table between them, standing on the floor at depth z, for scale.
function Lounge({ cam, id, z }: { cam: Cam; id: string; z: number }) {
  const k = (0.01 * cam.f) / z, chair = (x: number) => { const [bx, by] = cam.at(x, 0, z); return <Armchair id={id} x={bx - 21 * k} y={by - 29 * k} k={k} />; };
  const [tx, ty] = cam.at(0, 0.2, z - 0.04), [, fy] = cam.at(0, 0, z - 0.04), r = (0.2 * cam.f) / z;
  return (
    <g>
      {chair(-0.62)}{chair(0.62)}
      <ellipse cx={tx} cy={fy + 0.6} rx={r * 0.8} ry={r * 0.12} fill={V('shadow')} filter={`url(#${id}b)`} />
      <path d={`M${tx.toFixed(1)} ${ty.toFixed(1)}V${fy.toFixed(1)}`} stroke={V('prop-2')} strokeWidth={Math.max(1, r * 0.12)} />
      <ellipse cx={tx} cy={ty} rx={r} ry={Math.max(1, r * 0.16)} fill={V('prop-hi')} stroke={V('prop-2')} strokeWidth={0.6} />
    </g>
  );
}
/* ---------- shared fills ---------- */
function Defs({ id }: { id: string }) {
  const stop = (offset: string, color: string, opacity?: number | string) => <stop offset={offset} style={{ stopColor: color, stopOpacity: opacity == null ? 1 : opacity }} />;
  return (
    <defs>
      <linearGradient id={`${id}w`} x1="0" y1="0" x2="0" y2="1">{stop('0', V('wall-hi'))}{stop('1', V('wall-lo'))}</linearGradient>
      <linearGradient id={`${id}c`} x1="0" y1="0" x2="0" y2="1">{stop('0', V('ceil-hi'))}{stop('1', V('ceil-lo'))}</linearGradient>
      <linearGradient id={`${id}f`} x1="0" y1="0" x2="0" y2="1">{stop('0', V('floor-hi'))}{stop('1', V('floor-lo'))}</linearGradient>
      <linearGradient id={`${id}p`} x1="0" y1="0" x2="1" y2="1">{stop('0', V('face-lit'))}{stop('1', V('face'))}</linearGradient>
      <linearGradient id={`${id}r`} x1="0" y1="0" x2="1" y2="0">{stop('0', V('face-lit'))}{stop('.45', V('face'))}{stop('1', V('edge'))}</linearGradient>
      <radialGradient id={`${id}l`} cx="0.1" cy="-0.1" r="1">{stop('0', V('light'))}{stop('.65', V('light'), 0)}</radialGradient>
      <linearGradient id={`${id}s`} x1="0" y1="0" x2="1" y2="0">{stop('0', '#fff', 0)}{stop('.5', '#fff', 'var(--sc-sheen)')}{stop('1', '#fff', 0)}</linearGradient>
      <pattern id={`${id}t`} width="3.2" height="3.2" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 0V3.2" stroke={V('lo')} strokeWidth="1" /></pattern>
      <filter id={`${id}b`} x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="1.5" /></filter>
      <clipPath id={`${id}k`}><rect x={PX} y={PY} width={PW} height={PH} rx={0.6} /></clipPath>
    </defs>
  );
}

/* ---------- wall products: on a lit wall, front on, their depth shown by the shadow and the bevel ---------- */
const PX = 32, PY = 11, PW = 96, PH = 60; // the product's place on the wall
// Thickness in mm → depth in the drawing (px): exaggerated, but thicker always draws deeper.
const depthPx = (mm?: number | null) => (mm == null || !Number.isFinite(mm) ? 3.6 : Math.min(10, 0.5 + Math.sqrt(mm) * 0.8));
function Slab({ id, x, y, w, h, d, fill, children }: { id: string; x: number; y: number; w: number; h: number; d: number; fill?: string; children?: ReactNode }) {
  const b = Math.max(0.6, d * 0.26);
  return (
    <g>
      <rect x={x + d * 0.5} y={y + d * 0.85} width={w} height={h} rx={1} fill={V('shadow')} filter={`url(#${id}b)`} />
      <rect x={x} y={y} width={w} height={h} rx={0.6} fill={fill || `url(#${id}p)`} />
      {children}
      <rect x={x} y={y} width={w} height={b * 0.7} fill={V('hi')} />
      <rect x={x + w - b * 0.8} y={y} width={b * 0.8} height={h} fill={V('lo')} />
      <rect x={x} y={y + h - b} width={w} height={b} fill={V('lo-2')} />
    </g>
  );
}
const grid = (cols: number, rows: number) => Array.from({ length: cols * rows }, (_, k) => [k % cols, Math.floor(k / cols)] as Pt);

const WALL: Record<string, (id: string, d: number) => ReactNode> = {
  panel: (id, d) => <>{[0, 1, 2].map(k => <Slab key={k} id={id} x={36 + k * 30} y={PY} w={27} h={PH} d={d} />)}</>,
  printed: (id, d) => (
    <Slab id={id} x={PX} y={PY} w={PW} h={PH} d={d}>
      <g clipPath={`url(#${id}k)`}>
        <circle cx={106} cy={26} r={7} fill={V('face-lit')} />
        <path d="M32 54C46 42 56 48 68 38S96 22 128 31V71H32Z" fill={V('face-2')} />
        <path d="M32 63C50 53 66 59 84 49S112 43 128 49V71H32Z" fill={V('edge')} opacity={0.8} />
      </g>
    </Slab>
  ),
  fluted: (id, d) => (
    <Slab id={id} x={PX} y={PY} w={PW} h={PH} d={d}>
      {Array.from({ length: 16 }, (_, k) => <rect key={k} x={PX + k * 6} y={PY} width={6} height={PH} fill={`url(#${id}r)`} />)}
    </Slab>
  ),
  relief: (id, d) => (
    <Slab id={id} x={PX} y={PY} w={PW} h={PH} d={d}>
      {grid(8, 5).map(([c, r]) => {
        const x = PX + c * 12, y = PY + r * 12, m: Pt = [x + 6, y + 6];
        return (
          <g key={`${c}-${r}`}>
            <polygon points={P([[x, y], [x + 12, y], m])} fill={V('hi')} />
            <polygon points={P([[x, y], m, [x, y + 12]])} fill={V('hi-2')} />
            <polygon points={P([[x + 12, y], [x + 12, y + 12], m])} fill={V('lo')} />
            <polygon points={P([[x, y + 12], m, [x + 12, y + 12]])} fill={V('lo-2')} />
          </g>
        );
      })}
    </Slab>
  ),
  rain: (id, d) => (
    <Slab id={id} x={PX} y={PY} w={PW} h={PH} d={d}>
      {grid(6, 5).map(([c, r]) => {
        const x = PX + 10 + c * 15 + (r % 2) * 7, y = PY + 5 + r * 11;
        return <g key={`${c}-${r}`}><path d={`M${x + 0.9} ${y + 0.3}l-2.4 7`} stroke={V('hi')} strokeWidth={0.8} strokeLinecap="round" /><path d={`M${x} ${y}l-2.4 7`} stroke={V('groove')} strokeWidth={1.2} strokeLinecap="round" /></g>;
      })}
    </Slab>
  ),
  penray: (id, d) => (
    <Slab id={id} x={PX} y={PY} w={PW} h={PH} d={d}>
      {grid(4, 3).map(([c, r]) => {
        const x = PX + 12 + c * 24, y = PY + 10 + r * 20, k = 7 * 0.7071;
        return (
          <g key={`${c}-${r}`}>
            <circle cx={x} cy={y} r={7} fill={V('face-2')} />
            <path d={`M${x - k} ${y + k}A7 7 0 0 1 ${x + k} ${y - k}`} fill="none" stroke={V('hi')} strokeWidth={1.4} />
            <path d={`M${x + k} ${y - k}A7 7 0 0 1 ${x - k} ${y + k}`} fill="none" stroke={V('lo-2')} strokeWidth={1.4} />
          </g>
        );
      })}
    </Slab>
  ),
  tiles: (id, d) => <>{grid(4, 3).map(([c, r]) => {
    const x = 34 + c * 24, y = 13 + r * 20;
    return <Slab key={`${c}-${r}`} id={id} x={x} y={y} w={20} h={16} d={d * 0.8} fill={(c + r) % 2 ? V('face-2') : undefined}><circle cx={x + 10} cy={y + 8} r={3.6} fill="none" stroke={V('lo-2')} strokeWidth={0.9} /></Slab>;
  })}</>,
  strips: (id, d) => (
    <Slab id={id} x={PX} y={PY} w={PW} h={PH} d={d}>
      {Array.from({ length: 12 }, (_, k) => <rect key={k} x={PX + k * 8} y={PY} width={8} height={PH} fill={[V('face-lit'), V('face'), V('face-2')][k % 3]} />)}
      {Array.from({ length: 11 }, (_, k) => <path key={k} d={`M${PX + (k + 1) * 8} ${PY}V${PY + PH}`} stroke={V('groove')} strokeWidth={0.9} />)}
    </Slab>
  ),
  roll: id => (
    <g>
      {[0, 1].map(k => <g key={k}><rect x={22 + k * 34} y={0} width={34} height={82} fill={`url(#${id}p)`} /><rect x={22 + k * 34} y={0} width={34} height={82} fill={`url(#${id}t)`} /></g>)}
      <rect x={90} y={0} width={34} height={58} fill={`url(#${id}p)`} /><rect x={90} y={0} width={34} height={58} fill={`url(#${id}t)`} />
      <rect x={90} y={55} width={34} height={7} rx={3.5} fill={V('face-2')} /><path d="M92 57.2h30" stroke={V('hi')} strokeWidth={1} strokeLinecap="round" />
      <path d="M56 0V82M90 0V82" stroke={V('lo-2')} strokeWidth={0.7} />
    </g>
  ),
  wool: (id, d) => {
    const D = d * 1.5, dx = D * 0.8, dy = D * 0.55;
    return (
      <g>
        <polygon points={P([[46, 82], [108 + dx, 82], [112 + dx + 6, 88], [42, 88]])} fill={V('shadow')} filter={`url(#${id}b)`} />
        <polygon points={P([[40, 26], [100, 26], [100 + dx, 26 - dy], [40 + dx, 26 - dy]])} fill={V('face-lit')} />
        <polygon points={P([[100, 26], [100 + dx, 26 - dy], [100 + dx, 82 - dy], [100, 82]])} fill={V('edge')} />
        <rect x={40} y={26} width={60} height={56} fill={`url(#${id}p)`} />
        {Array.from({ length: 7 }, (_, r) => <path key={r} d={`M42 ${31 + r * 7.5}q4-2.6 8 0t8 0 8 0 8 0 8 0 8 0 8 0`} fill="none" stroke={V('lo')} strokeWidth={0.9} />)}
        {Array.from({ length: Math.max(2, Math.round(D / 2.6)) }, (_, k) => <path key={`e${k}`} d={`M${100 + (dx * (k + 0.5)) / Math.max(2, Math.round(D / 2.6))} ${30 - (dy * (k + 0.5)) / Math.max(2, Math.round(D / 2.6))}v48`} stroke={V('lo')} strokeWidth={0.6} />)}
      </g>
    );
  },
};
// A roll of the paper, on the floor in front of the wallpaper.
const Roll = ({ id }: { id: string }) => (
  <g className="sc-prop">
    <ellipse cx={128} cy={93} rx={20} ry={2.2} fill={V('shadow')} filter={`url(#${id}b)`} />
    <rect x={108} y={83} width={36} height={9} rx={4.5} fill={`url(#${id}p)`} />
    <ellipse cx={143} cy={87.5} rx={2.6} ry={4.5} fill={V('face-2')} />
    <ellipse cx={143} cy={87.5} rx={1} ry={1.8} fill={V('edge')} />
  </g>
);

/* ---------- ceiling products: clouds hung in a room, or tiles in the ceiling grid ---------- */
const CAM = camera(200 / 3, 80, 70, 0.45); // a seated eye, looking up at the ceiling
const ROOM: Room = { w: 1.2, h: 1.5, z0: 1, z1: 2.6 };
const ring = (n: number, r: (a: number) => number = () => 1): Pt[] => Array.from({ length: n }, (_, k) => { const a = (2 * Math.PI * k) / n; return [Math.cos(a) * r(a), Math.sin(a) * r(a)]; });
const SHAPES: Record<string, Pt[]> = {
  round: ring(36),
  hex: ring(6),
  petal: ring(72, a => 0.78 + 0.22 * Math.abs(Math.cos(3 * a))),
  square: [[-0.78, -0.78], [0.78, -0.78], [0.78, 0.78], [-0.78, 0.78]],
  rect: [[-0.95, -0.76], [0.95, -0.76], [0.95, 0.76], [-0.95, 0.76]],
};
const shapeOf = (kind: string, i: number) => (kind.includes('round') ? SHAPES.round : kind.includes('hex') ? SHAPES.hex : kind.includes('petal') ? SHAPES.petal
  : kind === 'cloud-rect' ? SHAPES.rect : kind.includes('mixed') ? (i % 2 ? SHAPES.round : SHAPES.square) : SHAPES.square);
type Hung = { x: number; z: number; y: number; s: number; rot: number };
// One cloud: its underside, the edge above it, the hangers to the ceiling; 3D kinds show their raised face.
function Cloud({ cam, room, id, kind, c, i, t, cls }: { cam: Cam; room: Room; id: string; kind: string; c: Hung; i: number; t: number; cls?: string }) {
  const shape = shapeOf(kind, i), cs = Math.cos(c.rot), sn = Math.sin(c.rot);
  const w = (u: number, v: number): [number, number] => [c.x + (u * cs - v * sn) * c.s, c.z + (u * sn + v * cs) * c.s];
  const at = (y: number, k = 1, du = 0, dv = 0, pts = shape) => pts.map(([u, v]) => { const [x, z] = w(u * k + du, v * k + dv); return cam.at(x, y, z); });
  const relief = kind.endsWith('-3d') ? <polygon points={P(at(c.y, 0.6))} fill={V('face-2')} stroke={V('hi')} strokeWidth={0.6} />
    : kind === 'cloud-rect' ? <>{grid(3, 2).map(([a, b]) => <polygon key={`${a}${b}`} points={P(at(c.y, 0.16, (a - 1) * 0.58, (b - 0.5) * 0.7, SHAPES.round))} fill={V('face-2')} />)}</> : null;
  return (
    <g className={cls || 'sc-cloud'}>
      {[-0.45, 0.45].map(u => { const [x, z] = w(u, 0), a = cam.at(x, c.y + t, z), b = cam.at(x, room.h, z); return <path key={u} d={`M${a[0].toFixed(1)} ${a[1].toFixed(1)}L${b[0].toFixed(1)} ${b[1].toFixed(1)}`} stroke={V('wire')} strokeWidth={0.5} vectorEffect="non-scaling-stroke" />; })}
      <polygon points={P(at(c.y + t))} fill={V('edge')} />
      <polygon points={P(at(c.y))} fill={`url(#${id}p)`} />
      {relief}
    </g>
  );
}
const cloudShadow = (cam: Cam, kind: string, c: Hung, i: number) => {
  const cs = Math.cos(c.rot), sn = Math.sin(c.rot);
  return P(shapeOf(kind, i).map(([u, v]) => cam.at(c.x + (u * cs - v * sn) * c.s * 1.1, 0, c.z + (u * sn + v * cs) * c.s * 1.1)));
};
// A loose cluster at different heights and turns, farthest first.
const CLUSTER: Hung[] = [
  { x: 0.02, z: 2.35, y: 1.02, s: 0.28, rot: 0.15 },
  { x: -0.82, z: 2.2, y: 0.98, s: 0.3, rot: 0.5 },
  { x: 0.8, z: 2.15, y: 1, s: 0.3, rot: 1.1 },
  { x: -0.55, z: 1.42, y: 1.1, s: 0.3, rot: -0.35 },
  { x: 0.52, z: 1.38, y: 1.12, s: 0.3, rot: 0.8 },
];
function GridCeiling({ id }: { id: string }) {
  const h = ROOM.h, g = 0.014, tiles = grid(6, 4).filter(([c, r]) => !(c === 3 && r === 1));
  const tile = (x0: number, z0: number, y: number) => quad(CAM, [[x0 + g, y, z0 + g], [x0 + 0.4 - g, y, z0 + g], [x0 + 0.4 - g, y, z0 + 0.4 - g], [x0 + g, y, z0 + 0.4 - g]]);
  // One tile let down on its far edge, as when it is laid into the grid.
  const drop = (lift: number): P3[] => [[0.04, h - 0.3 + lift, 1.5], [0.44, h - 0.3 + lift, 1.5], [0.44, h - 0.02 + lift, 1.8], [0.04, h - 0.02 + lift, 1.8]];
  return (
    <g>
      {tiles.map(([c, r]) => <polygon key={`${c}-${r}`} points={tile(-1.2 + c * 0.4, 1 + r * 0.4, h)} fill={(c + r) % 2 ? V('face') : `url(#${id}p)`} stroke={V('lo')} strokeWidth={0.5} />)}
      <polygon points={tile(0, 1.4, h)} fill={V('groove')} />
      <polygon points={quad(CAM, drop(0.025))} fill={V('edge')} />
      <polygon points={quad(CAM, drop(0))} fill={`url(#${id}p)`} />
    </g>
  );
}
function CeilingScene({ kind, id, mm, full }: { kind: string; id: string; mm?: number | null; full: boolean }) {
  const t = 0.014 + (mm == null || !Number.isFinite(mm) ? 25 : mm) * 0.0011;
  return (
    <>
      <Shell cam={CAM} room={ROOM} id={id} />
      {kind === 'grid' ? null : CLUSTER.map((c, i) => <polygon key={i} points={cloudShadow(CAM, kind, c, i)} fill={V('shadow')} opacity={0.35} filter={`url(#${id}b)`} />)}
      {full ? <Lounge cam={CAM} id={id} z={1.9} /> : null}
      {kind === 'grid' ? <GridCeiling id={id} /> : CLUSTER.map((c, i) => <Cloud key={i} cam={CAM} room={ROOM} id={id} kind={kind} c={c} i={i} t={t} />)}
    </>
  );
}

/** A product's drawing, by kind (AM.services.solutions). `mm`: the version's thickness, drawn as depth. Decorative:
    the card names the product. 'mini' leaves out the furniture and the hover light. */
export function SolutionArt({ kind, mm, variant = 'card' }: { kind: string; mm?: number | null; variant?: 'card' | 'hero' | 'mini' }) {
  const id = svgId(useId()), full = variant !== 'mini', ceiling = kind.startsWith('cloud') || kind === 'grid';
  const draw = WALL[kind] || WALL.panel;
  return (
    <svg className={`sol-art is-${variant}`} viewBox="0 0 160 100" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      <Defs id={id} />
      {ceiling ? <CeilingScene kind={kind} id={id} mm={mm} full={full} /> : (
        <>
          <rect width={160} height={82} fill={`url(#${id}w)`} />
          <rect y={82} width={160} height={18} fill={`url(#${id}f)`} />
          <path d="M0 82H160" stroke={V('line')} strokeWidth={0.8} />
          {draw(id, depthPx(mm))}
          {full && kind !== 'wool' ? (kind === 'roll' ? <Roll id={id} /> : <Armchair id={id} x={100} y={58} />) : null}
        </>
      )}
      <rect width={160} height={100} fill={`url(#${id}l)`} pointerEvents="none" />
      {full ? <g transform="skewX(-16)"><rect className="sc-sheen" x={-40} y={-10} width={34} height={120} fill={`url(#${id}s)`} /></g> : null}
    </svg>
  );
}

/* ---------- how much: the room, with the share of its walls or ceiling that an amount covers ---------- */
const RCAM = camera(100, 120, 75, 0.75);
const RROOM: Room = { w: 1.2, h: 1.5, z0: 1, z1: 2.4 };
type Surf = 'back' | 'left' | 'right' | 'ceil';
type Slot = { key: string; surf: Surf; a0: number; a1: number; b0: number; b1: number };
const centreOut = (n: number) => { const m = (n - 1) / 2; return Array.from({ length: n }, (_, i) => i).sort((p, q) => Math.abs(p - m) - Math.abs(q - m) || p - q); };
// Wall places: ear height first, then above, then below; each row from the middle outwards, as panels are usually hung.
function wallSlots(surf: Surf, n: number, a0: number, a1: number): Slot[] {
  const rows: [number, number][] = [[0.64, 0.96], [1.0, 1.32], [0.28, 0.6]], step = (a1 - a0) / n, gap = 0.016;
  return rows.flatMap(([b0, b1], r) => centreOut(n).map(c => ({ key: `${surf}${r}-${c}`, surf, a0: a0 + c * step + gap, a1: a0 + (c + 1) * step - gap, b0, b1 })));
}
// Ceiling places: from the middle of the room outwards.
function ceilSlots(): Slot[] {
  const out: (Slot & { d: number })[] = [], cols = 6, rows = 4, x0 = -1.1, x1 = 1.1, z0 = 1.12, z1 = 2.32, sx = (x1 - x0) / cols, sz = (z1 - z0) / rows, g = 0.016;
  grid(cols, rows).forEach(([c, r]) => out.push({ key: `ceil${c}-${r}`, surf: 'ceil', a0: x0 + c * sx + g, a1: x0 + (c + 1) * sx - g, b0: z0 + r * sz + g, b1: z0 + (r + 1) * sz - g, d: Math.hypot((c - (cols - 1) / 2) / cols, ((r - (rows - 1) / 2) / rows) * 1.3) }));
  return out.sort((p, q) => p.d - q.d).map(({ d: _d, ...s }) => s);
}
// Several surfaces fill together, each in proportion to its places.
const merged = (lists: Slot[][]) => lists.flatMap(l => l.map((s, i) => ({ s, k: (i + 0.5) / l.length }))).sort((a, b) => a.k - b.k).map(x => x.s);
const SURFS: Record<string, Surf[]> = { Walls: ['back', 'left', 'right'], Ceiling: ['ceil'], 'Walls and ceiling': ['back', 'left', 'right', 'ceil'] };
const surfsFor = (placement: string): Surf[] => SURFS[placement] || ['back']; // one named wall: drawn as the wall ahead
function slotsFor(surfs: Surf[]): Slot[] {
  const r = RROOM;
  return merged(surfs.map(s => (s === 'ceil' ? ceilSlots() : s === 'back' ? wallSlots('back', 8, -1.1, 1.1) : wallSlots(s, 5, r.z0 + 0.08, r.z1 - 0.08))));
}
function slotQuad(s: Slot): P3[] {
  const { w, h, z1 } = RROOM;
  if (s.surf === 'back') return [[s.a0, s.b1, z1], [s.a1, s.b1, z1], [s.a1, s.b0, z1], [s.a0, s.b0, z1]];
  if (s.surf === 'left') return [[-w, s.b1, s.a0], [-w, s.b1, s.a1], [-w, s.b0, s.a1], [-w, s.b0, s.a0]];
  if (s.surf === 'right') return [[w, s.b1, s.a1], [w, s.b1, s.a0], [w, s.b0, s.a0], [w, s.b0, s.a1]];
  return [[s.a0, h, s.b1], [s.a1, h, s.b1], [s.a1, h, s.b0], [s.a0, h, s.b0]];
}
// The kind's face, in miniature, on a covered place.
function detail(kind: string, q: Pt[]): ReactNode {
  const line = (a: Pt, b: Pt, k: string | number) => <path key={k} d={`M${a[0].toFixed(1)} ${a[1].toFixed(1)}L${b[0].toFixed(1)} ${b[1].toFixed(1)}`} stroke={V('lo-2')} strokeWidth={0.6} />;
  if (kind === 'fluted' || kind === 'strips') return (kind === 'fluted' ? [0.25, 0.5, 0.75] : [0.2, 0.4, 0.6, 0.8]).map(u => line(inQuad(q, u, 0), inQuad(q, u, 1), u));
  if (kind === 'relief') return [line(q[0], q[2], 'a'), line(q[1], q[3], 'b')];
  if (kind === 'rain') return [line(inQuad(q, 0.35, 0.2), inQuad(q, 0.25, 0.55), 'a'), line(inQuad(q, 0.72, 0.45), inQuad(q, 0.62, 0.8), 'b')];
  if (kind === 'penray' || kind === 'tiles') return <polygon points={P(ring(12).map(([u, v]) => inQuad(q, 0.5 + u * 0.22, 0.5 + v * 0.22)))} fill="none" stroke={V('lo-2')} strokeWidth={0.6} />;
  if (kind === 'printed') return <polyline points={P([inQuad(q, 0, 0.72), inQuad(q, 0.35, 0.48), inQuad(q, 0.65, 0.6), inQuad(q, 1, 0.38)])} fill="none" stroke={V('edge')} strokeWidth={0.8} />;
  return null;
}

/** How much of the walls or ceiling an amount covers, in a room sketch: `share` is this product's part of the free
    surface there (0–1), `others` the part the plan's other products take there. The layout is tidy, not the real one. */
export function RoomPreview({ kind, placement, share, others = 0 }: { kind: string; placement: string; share: number; others?: number }) {
  const id = svgId(useId()), surfs = surfsFor(placement), slots = slotsFor(surfs), n = slots.length;
  const mine = share > 0 ? Math.max(1, Math.round(Math.min(1, share) * n)) : 0;
  const theirs = others > 0 ? Math.max(mine, Math.min(n, Math.round(Math.min(1, share + others) * n))) : mine;
  const hang = kind.startsWith('cloud');
  const flat = slots.map((s, i) => ({ s, i })).filter(({ s }) => !(hang && s.surf === 'ceil'));
  const hung = slots.map((s, i) => ({ s, i })).filter(({ s, i }) => hang && s.surf === 'ceil' && i < theirs).sort((a, b) => (b.s.b0 + b.s.b1) - (a.s.b0 + a.s.b1));
  return (
    <svg className="rp" viewBox="0 0 240 150" aria-hidden="true" focusable="false">
      <Defs id={id} />
      <Shell cam={RCAM} room={RROOM} id={id} mark={surfs} />
      {flat.map(({ s, i }) => {
        const q = slotQuad(s).map(([x, y, z]) => RCAM.at(x, y, z));
        if (i >= theirs) return <polygon key={s.key} points={P(q)} fill="none" stroke={V('line')} strokeWidth={0.6} strokeDasharray="1.5 2.5" opacity={0.75} />;
        return (
          <g key={s.key} className={i < mine ? 'rp-on' : 'rp-on is-other'}>
            <polygon points={P(q)} fill={i < mine ? `url(#${id}p)` : V('other')} stroke={V('lo-2')} strokeWidth={0.5} />
            {i < mine ? detail(kind, q) : null}
          </g>
        );
      })}
      <Lounge cam={RCAM} id={id} z={1.78} />
      {hung.map(({ s, i }) => (
        <Cloud key={s.key} cam={RCAM} room={RROOM} id={id} kind={i < mine ? kind : 'cloud-square'} i={i} t={0.03}
          c={{ x: (s.a0 + s.a1) / 2, z: (s.b0 + s.b1) / 2, y: RROOM.h - 0.16 - (i % 3) * 0.04, s: 0.12, rot: i * 2.4 }} cls={i < mine ? 'rp-drop' : 'rp-drop is-other'} />
      ))}
      <rect width={240} height={150} fill={`url(#${id}l)`} pointerEvents="none" />
    </svg>
  );
}

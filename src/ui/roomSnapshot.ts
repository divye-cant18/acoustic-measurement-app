/* The room as the 3D drawing shows it (src/ui/room3d.ts), from Room Setup's description: one source for Room Setup and
   the Treatment step, so both draw the same room. */
import { fmt, isNum, stageModel, SURF } from '../lib';
import type { Snapshot, Wall3D } from './room3d';

/* eslint-disable @typescript-eslint/no-explicit-any */
export const BOX = ['wall1', 'wall2', 'wall3', 'wall4'];
export const surfOf = (r: any, k: string) => (r.surfaces || {})[k] || SURF.blankSurface();
export const typeIdOf = (r: any, k: string, kind: string) => { const x = SURF.typeOfSurface(surfOf(r, k), kind); return x ? x.type.id : ''; };
export const typeLabel = (kind: string, id: string) => { const t = id ? SURF.typeOf(kind, id) : null; return t ? t.name : 'Not chosen yet'; };
const dimError = (k: string, v: unknown): string | null => stageModel<{ dimError(k: string, v: unknown): string | null }>('room').dimError(k, v);

/* A wall laid out from its left end, in m: its sections, then its own type in the width they leave. Doors are placed
   from the right end and windows from the left (sill 0.9 m), where they usually are: where they are is not recorded.
   Without the wall's size, a 4 × 2.7 m outline. Drawn face-on on its card and in the 3D room. */
export function wallLayout(model: any, s: any) {
  const known = isNum(model.lengthM) && isNum(model.heightM), L: number = known ? model.lengthM : 4, H: number = known ? model.heightM : 2.7;
  let u = 0;
  const parts = SURF.sectionsOf(s).map((x: any) => {
    const w = isNum(x.widthM) && x.widthM > 0 ? Math.min(x.widthM, Math.max(0, L - u)) : 0, part = { type: x.type || '', u0: u, w };
    u += w;
    return part;
  });
  const own = SURF.typeOfSurface(s, 'wall');
  parts.push({ type: own ? own.type.id : '', u0: u, w: Math.max(0, L - u) });
  const ops: { kind: string; u0: number; u1: number; z0: number; z1: number }[] = [];
  let right = L - 0.3, left = 0.4;
  (s.openings || []).forEach((o: any) => {
    if (!(isNum(o.widthM) && isNum(o.heightM) && o.widthM > 0 && o.heightM > 0)) return;
    const h = Math.min(o.heightM, H);
    for (let i = 0; i < (isNum(o.count) && o.count >= 1 ? Math.floor(o.count) : 1); i++) {
      if (o.kind === 'window') { const z0 = Math.max(0, Math.min(0.9, H - h)); ops.push({ kind: o.kind, u0: left, u1: Math.min(L, left + o.widthM), z0, z1: z0 + h }); left += o.widthM + 0.4; }
      else { ops.push({ kind: o.kind, u0: Math.max(0, right - o.widthM), u1: Math.max(0, right), z0: 0, z1: h }); right -= o.widthM + 0.3; }
    }
  });
  return { known, L, H, parts: parts.filter((x: any) => x.w > 0) as { type: string; u0: number; w: number }[], ops: ops.filter(o => o.u1 > o.u0) };
}

// What the 3D room draws: the box as far as its size is entered, walls 1–4 laid out as on their cards, floor and ceiling.
export function snapshotOf(r: any): Snapshot {
  const ok = (k: string) => isNum(r[k]) && !dimError(k, r[k]), floorOk = ok('L') && ok('W'), wallsOk = floorOk && ok('H');
  const L: number = floorOk ? r.L : 4, W: number = floorOk ? r.W : 3, H: number = wallsOk ? r.H : 2.7;
  const walls = SURF.wallKeysOf(r).filter((k: string) => BOX.includes(k)).map((k: string): Wall3D => {
    const def = SURF.surfaceDef(k, r), s = surfOf(r, k), lay = wallLayout(SURF.surfaceModel(r, k), s);
    return {
      key: k as Wall3D['key'], name: s.label ? `${def.name} (${s.label})` : def.name,
      parts: lay.parts.map(x => ({ type: x.type, f0: x.u0 / lay.L, f1: (x.u0 + x.w) / lay.L, info: `${typeLabel('wall', x.type)}${lay.known ? ` · ${fmt.m(+x.w.toFixed(2))}` : ''}` })),
      ops: lay.ops.map(o => ({ kind: o.kind, f0: o.u0 / lay.L, f1: o.u1 / lay.L, z0: o.z0, z1: o.z1 })),
    };
  });
  const fl = typeIdOf(r, 'floor', 'floor'), ce = typeIdOf(r, 'ceiling', 'ceiling');
  return {
    L, W, H, floorOk, wallsOk, walls,
    size: wallsOk ? `${fmt.m(L)} × ${fmt.m(W)} × ${fmt.m(H)} · ${(L * W * H).toFixed(0)} m³` : floorOk ? `${fmt.m(L)} × ${fmt.m(W)}` : '',
    message: !floorOk ? 'Enter the length and width: the floor appears' : !wallsOk ? 'Now the height: the walls go up' : '',
    floor: { type: fl, info: typeLabel('floor', fl) }, ceiling: { type: ce, info: typeLabel('ceiling', ce) },
  };
}

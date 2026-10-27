/* Step 1 · Room Setup — what the room is, its size, what it is made of and what is on its walls. The room (name and
   reference, industry and room type, main activity and purpose, the industry's own questions), its size and shape,
   occupancy and furnishing; its walls (added, duplicated and removed), floor and ceiling sections, each with what it
   is built from, its visible finish and its acoustic data from the sourced library, an existing covering, and on walls
   openings and the equipment on it (ticked, no sizes); current problems and the outcome wanted (AM.services.surfaces, js/data/room-form.js). The
   surfaces describe the room and tell the treatment prediction what each product covers and how much wall is free
   for it; the room's RT60 is measured, never estimated here. Limits, checks and actions: js/stages/room.js. */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { acoustics, am, cx, DEMO, fmt, isNum, S, stageModel, SURF, TGT } from '../lib';
import type { Ctx } from '../am';
import { Btn, Card, Field, GuideThumb, Icon, Kv, KvNote, Note, NumberInput, Pill, Seg, SelectInput, SyncSelect, TextInput } from '../ui/kit';
import { fillOf, lookDefs, lookOf } from '../ui/looks';
import { createRoom3D, type Room3D, type Snapshot, type Wall3D } from '../ui/room3d';

/* eslint-disable @typescript-eslint/no-explicit-any */
interface Question { id: string; label: string; kind: 'int' | 'choice' | 'multi'; options?: string[]; hint?: string }
interface RoomModel { DIMS: [string, string, string][]; dimError(k: string, v: unknown): string | null; occError(r: unknown): string | null; questionsFor(r: unknown): Question[] }
const M = () => stageModel<RoomModel>('room');
const RF = (): any => (window.AM as any).roomFormData;

/* Isometric sketch of the room box, scaled to its real proportions. */
function IsoRoom({ r }: { r: any }) {
  const g = acoustics.geometry(r);
  if (!g || M().DIMS.some(([k]) => M().dimError(k, r[k]))) {
    return <div className="iso-empty"><svg className="i" width={40} height={40} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.3} aria-hidden="true" dangerouslySetInnerHTML={{ __html: am.util.ICONS.room }} /><span>Enter length, width and height to see the room.</span></div>;
  }
  const c = Math.cos(Math.PI / 6), s = 0.5;
  const P = (x: number, y: number, z: number) => [(x - y) * c, (x + y) * s - z];
  const corners = [[0, 0, 0], [g.L, 0, 0], [0, g.W, 0], [g.L, g.W, 0], [0, 0, g.H], [g.L, 0, g.H], [0, g.W, g.H], [g.L, g.W, g.H]].map(q => P(q[0], q[1], q[2]));
  const xs = corners.map(q => q[0]), ys = corners.map(q => q[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const VW = 340, VH = 230, pad = 34;
  const k = Math.min((VW - 2 * pad) / (maxX - minX), (VH - 2 * pad) / (maxY - minY));
  const ox = (VW - (maxX - minX) * k) / 2, oy = (VH - (maxY - minY) * k) / 2;
  const T = (q: number[]) => { const [x, y] = P(q[0], q[1], q[2]); return [ox + (x - minX) * k, oy + (y - minY) * k]; };
  const pts = (arr: number[][]) => arr.map(q => T(q).map(n => n.toFixed(1)).join(',')).join(' ');
  const { L, W: Wd, H } = g;
  const mid = (a: number[], b: number[]) => { const A = T(a), B = T(b); return [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2]; };
  const lL = mid([0, Wd, 0], [L, Wd, 0]), lW = mid([L, 0, 0], [L, Wd, 0]), lH = mid([0, Wd, 0], [0, Wd, H]);
  const edge = (a: number[], b: number[], key: string) => { const A = T(a), B = T(b); return <line key={key} className="hidden-edge" x1={A[0].toFixed(1)} y1={A[1].toFixed(1)} x2={B[0].toFixed(1)} y2={B[1].toFixed(1)} />; };
  return (
    <svg className="iso" viewBox={`0 0 ${VW} ${VH}`} role="img" aria-label={`Room sketch, ${fmt.dims(g)}`}>
      {edge([0, 0, 0], [L, 0, 0], 'a')}{edge([0, 0, 0], [0, Wd, 0], 'b')}{edge([0, 0, 0], [0, 0, H], 'c')}
      <polygon className="f-top" points={pts([[0, 0, H], [L, 0, H], [L, Wd, H], [0, Wd, H]])} />
      <polygon className="f-a" points={pts([[0, Wd, 0], [L, Wd, 0], [L, Wd, H], [0, Wd, H]])} />
      <polygon className="f-b" points={pts([[L, 0, 0], [L, Wd, 0], [L, Wd, H], [L, 0, H]])} />
      <text x={(lL[0] - 8).toFixed(1)} y={(lL[1] + 20).toFixed(1)} textAnchor="end">{fmt.m(L)}</text>
      <text x={(lW[0] + 8).toFixed(1)} y={(lW[1] + 20).toFixed(1)}>{fmt.m(Wd)}</text>
      <text x={(lH[0] - 8).toFixed(1)} y={(lH[1] + 4).toFixed(1)} textAnchor="end">{fmt.m(H)}</text>
    </svg>
  );
}

/* ---------- the room in 3D ---------- */
const BOX = ['wall1', 'wall2', 'wall3', 'wall4'];
const surfOf = (r: any, k: string) => (r.surfaces || {})[k] || SURF.blankSurface();
const typeIdOf = (r: any, k: string, kind: string) => { const x = SURF.typeOfSurface(surfOf(r, k), kind); return x ? x.type.id : ''; };
const typeLabel = (kind: string, id: string) => { const t = id ? SURF.typeOf(kind, id) : null; return t ? t.name : 'Not chosen yet'; };
// What the 3D room draws: the box as far as its size is entered, walls 1–4 laid out as on their cards, floor and ceiling.
function snapshotOf(r: any): Snapshot {
  const ok = (k: string) => isNum(r[k]) && !M().dimError(k, r[k]), floorOk = ok('L') && ok('W'), wallsOk = floorOk && ok('H');
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
// The key: each type in its colour and pattern, with its area once the size is known.
function legendOf(r: any) {
  const out = new Map<string, { kind: string; type: string; m2: number | null }>();
  const add = (kind: string, type: string, m2: number | null) => {
    if (!type || type === 'other' || !lookOf(kind, type)) return;
    const k = `${kind}:${type}`, cur = out.get(k);
    out.set(k, { kind, type, m2: m2 == null ? (cur ? cur.m2 : null) : (cur && cur.m2 != null ? cur.m2 : 0) + m2 });
  };
  SURF.surfacesOf(r).forEach((def: any) => {
    const s = surfOf(r, def.key), m = SURF.surfaceModel(r, def.key), own = typeIdOf(r, def.key, def.kind), ct = SURF.coverTypeOf(s.cover, def.kind);
    const typeOfPart = (x: any) => (x.role === 'finish' ? own : x.role === 'section' ? x.type : x.role === 'cover' && ct ? ct.id : '');
    if (m.parts.length) m.parts.forEach((x: any) => { if (x.areaM2 > 0) add(def.kind, typeOfPart(x), x.areaM2); });
    else [own, ...(def.kind === 'wall' ? SURF.sectionsOf(s).map((x: any) => x.type) : []), ct ? ct.id : ''].forEach((t: string) => add(def.kind, t, null));
  });
  return [...out.values()].sort((a, b) => (b.m2 || 0) - (a.m2 || 0));
}
const surfName = (r: any, k: string) => { const d = SURF.surfaceDef(k, r); return d ? d.name : k; };
// A surface tapped in the drawing, in words: its name, what it is, how many parts, its area.
function pickedText(r: any, k: string) {
  const def = SURF.surfaceDef(k, r);
  if (!def) return null;
  const s = surfOf(r, k), m = SURF.surfaceModel(r, k), n = def.kind === 'wall' ? SURF.sectionsOf(s).length : 0;
  return { name: s.label ? `${def.name} (${s.label})` : def.name, text: [SURF.typeText(s, def.kind) || 'Not described yet', n ? `${n + 1} parts` : '', m.grossM2 != null ? fmt.m2(m.grossM2) : ''].filter(Boolean).join(' · ') };
}
/* The room in 3D as it is described (src/ui/room3d.ts): it builds up as the size is entered (the floor, then the walls),
   shows each wall's parts, doors and windows and the floor and ceiling in their types' colours, and turns to the surface
   being edited (the card last clicked or typed in). A tap on a wall in the drawing highlights it and names it, with
   "Edit" to go to its card: the page never moves by itself. Without WebGL, the flat sketch. */
function RoomView({ r }: { r: any }) {
  const host = useRef<HTMLDivElement>(null), view = useRef<Room3D | null>(null), selRef = useRef('wall1'), follow = useRef(true), room = useRef(r);
  room.current = r;
  const [failed, setFailed] = useState(false), [sel, setSel] = useState('wall1'), [turn, setTurn] = useState(true), [picked, setPicked] = useState<string | null>(null);
  const pick = (k: string) => {
    if (k === selRef.current) return;
    selRef.current = k; setSel(k);
    const v = view.current;
    if (v) { v.mark(k); if (follow.current || !k.startsWith('wall')) v.focus(k); }
  };
  // "Edit": its card opens and comes into view.
  const edit = (k: string) => {
    setPicked(null);
    S.ui({ open: Object.assign({}, (S.state.ui as any).open, { [`surf-${k}`]: true }) });
    requestAnimationFrame(() => {
      const c = document.getElementById(`surf-card-${k}`), s = c && c.querySelector<HTMLElement>('summary');
      if (c) c.scrollIntoView({ block: 'start' });
      if (s) s.focus({ preventScroll: true });
    });
  };
  useEffect(() => {
    const el = host.current;
    if (!el || !el.closest('#app')) return undefined; // not when the screen is drawn as HTML (the step's view)
    // The surface being edited: the card last clicked or typed in (the name shown for a tapped wall then goes).
    const on = (e: Event) => { const c = e.target instanceof Element ? e.target.closest('details.surf') : null; if (c && c.id.startsWith('surf-card-')) { pick(c.id.slice(10)); setPicked(null); } };
    // Started once the screen has settled, so a step passed straight through (a new project going on) never builds it.
    const later = window.setTimeout(() => {
      const v = createRoom3D(el, k => { if (k) pick(k); setPicked(k); });   // a tap: that surface, or nothing
      if (!v) { setFailed(true); return; }
      view.current = v;
      v.mark(selRef.current); v.update(snapshotOf(room.current));
      document.addEventListener('focusin', on); document.addEventListener('click', on);
    }, 120);
    return () => {
      window.clearTimeout(later);
      document.removeEventListener('focusin', on); document.removeEventListener('click', on);
      if (view.current) { view.current.dispose(); view.current = null; }
    };
  }, []);
  useEffect(() => { const v = view.current; if (v) { v.mark(selRef.current); v.update(snapshotOf(r)); } }); // redrawn only where something changed
  const legend = legendOf(r), notDrawn = SURF.wallKeysOf(r).filter((k: string) => !BOX.includes(k)).map((k: string) => surfName(r, k));
  const act = (label: string, fn: () => void, icon?: string, text?: string) => (
    <button type="button" className="btn btn-ghost btn-sm" aria-label={label} title={label} onClick={fn}>{icon ? <Icon name={icon} size={15} sw={2.1} /> : null}{text}</button>
  );
  if (failed) return <IsoRoom r={r} />;
  const info = picked ? pickedText(r, picked) : null;
  return (
    <div className="room3d">
      <div className="v-head">
        <span className="small muted">{`Editing: ${surfName(r, sel)}`}</span>
        <span className="v-acts">
          {act('See the whole room', () => { if (view.current) view.current.focus('overview'); }, undefined, 'Overview')}
          {act('A slow turn around the room', () => { if (view.current) view.current.tour(); }, undefined, '360°')}
          {act('Turn left', () => { if (view.current) view.current.orbit(-1); }, 'chevL')}
          {act('Turn right', () => { if (view.current) view.current.orbit(1); }, 'chevR')}
        </span>
      </div>
      <div className={cx('viewer-wrap', info && 'has-pick')}>
        <div className="viewer" ref={host} />
        {info && picked ? (
          <div className="v-pick" role="status">
            <span className="v-pick-dot" aria-hidden="true" />
            <span className="v-pick-t"><b>{info.name}</b>{` · ${info.text}`}</span>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => edit(picked)}>Edit<Icon name="arrowD" size={14} sw={2.4} /></button>
            <button type="button" className="v-pick-x" aria-label="Close" onClick={() => setPicked(null)}><Icon name="x" size={14} sw={2.4} /></button>
          </div>
        ) : null}
      </div>
      <label className="v-follow small"><input type="checkbox" checked={turn} onChange={e => { follow.current = e.target.checked; setTurn(e.target.checked); if (e.target.checked && view.current) view.current.focus(selRef.current); }} /> Turn to the wall I edit</label>
      <div className="v-legend">{legend.length ? legend.map(x => (
        <span key={`${x.kind}:${x.type}`}><svg className="sw" aria-hidden="true"><rect width="100%" height="100%" fill={fillOf(x.kind, x.type)} /></svg>{typeLabel(x.kind, x.type)}{x.m2 != null ? <em>{fmt.m2(x.m2)}</em> : null}</span>
      )) : <span className="muted">Choose what each surface is: it appears here.</span>}</div>
      {notDrawn.length ? <p className="small muted">{`${notDrawn.join(', ')} ${notDrawn.length > 1 ? 'are' : 'is'} not drawn: the drawing is the room's box, walls 1 to 4.`}</p> : null}
      {r.shape && r.shape !== 'rectangular' ? <p className="small muted">Drawn as a box of the room's length, width and height.</p> : null}
    </div>
  );
}

// Whether the screen is narrow: Room Setup's two columns are then one (css/app.css, max-width 1180px).
const NARROW = '(max-width: 1180px)';
function useNarrow() {
  const [n, setN] = useState(() => typeof window.matchMedia === 'function' && window.matchMedia(NARROW).matches);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const m = window.matchMedia(NARROW), on = () => setN(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return n;
}

/* Chips that toggle membership of a list on the room (furnishings, problems, outcomes, a multiple-choice question). */
function Chips({ path, options, value, label }: { path: string; options: { value: string; label: string }[]; value: string[] | undefined; label: string }) {
  const on = new Set(value || []);
  return (
    <div className="chips" role="group" aria-label={label}>
      {options.map(o => <button type="button" key={o.value} className="chip" data-action="toggleItem" data-value={`${path}|${o.value}`} aria-pressed={on.has(o.value)}>{o.label}</button>)}
    </div>
  );
}

/* ---------- what a surface is made of ---------- */
const QUALITY: Record<string, [string, string]> = {
  manufacturer: ['good', 'Manufacturer test data'], published: ['neutral', 'Published reference values'],
  compilation: ['warn', 'Engineering compilation'], definition: ['neutral', 'By definition'], none: ['critical', 'No data'],
};
// A material's families for a kind of surface, in categories: [{ category, families: [{ name, variants }] }]; a search
// keeps the families with an entry whose wording matches.
function families(kind: string, opening?: string, fit?: { construction?: string; finish?: string }, search?: string) {
  const q = (search || '').trim().toLowerCase();
  return SURF.materialsFor(kind, opening, fit).map((g: any) => {
    const fam = new Map<string, any[]>();
    g.items.forEach((m: any) => {
      if (q && !`${m.variant || ''} ${SURF.familyOf(m, kind)} ${g.category}`.toLowerCase().includes(q)) return;
      const f = SURF.familyOf(m, kind);
      if (!fam.has(f)) fam.set(f, []);
      fam.get(f)!.push(m);
    });
    return { category: g.category as string, families: [...fam].map(([name, variants]) => ({ name, variants })) };
  }).filter((g: any) => g.families.length);
}
// The material select: families in their categories; a family with several entries gets a second select.
function materialPicker({ id, kind, opening, keyName, part, value, label, fit, search }: { id: string; kind: string; opening?: string; keyName: string; part: string; value: string | null; label: string; fit?: any; search?: string }) {
  const cur = SURF.material(value), groups = families(kind, opening, fit, search);
  // The chosen entry stays offered even when the search would hide it.
  const fam = cur && (groups.flatMap((g: any) => g.families.filter((f: any) => f.variants.includes(cur)))[0] || families(kind, opening, fit).flatMap((g: any) => g.families.filter((f: any) => f.variants.includes(cur)))[0]);
  const shown = fam && !groups.some((g: any) => g.families.includes(fam)) ? [{ category: 'Chosen', families: [fam] }, ...groups] : groups;
  const none = !shown.length; // nothing in the library for this choice: say so, rather than an empty list
  const emptyText = search ? 'No entry matches the search' : fit && fit.finish === 'other' ? 'Not in the library: a finish that is not listed' : fit && (fit.construction || fit.finish) ? 'No library entry for this construction and finish' : 'No materials in the library for this surface';
  const sel = (
    <Field id={id} label={label}>
      <SyncSelect className="select" id={id} value={fam ? fam.variants[0].id : ''} data-change-action="surfaceMaterial" data-key={keyName} data-part={part} disabled={none || undefined}>
        <option value="" disabled>{none ? emptyText : 'Choose a material'}</option>
        {shown.map((g: any) => <optgroup label={g.category} key={g.category}>{g.families.map((f: any) => <option value={f.variants[0].id} key={f.variants[0].id}>{f.name}</option>)}</optgroup>)}
      </SyncSelect>
    </Field>
  );
  const variant = fam && fam.variants.length > 1 ? (
    <Field id={`${id}-v`} label="Exact build-up">
      <SyncSelect className="select" id={`${id}-v`} value={cur.id} data-change-action="surfaceMaterial" data-key={keyName} data-part={part}>
        {fam.variants.map((m: any) => <option value={m.id} key={m.id}>{m.variant}</option>)}
      </SyncSelect>
    </Field>
  ) : null;
  return { sel, variant, cur, none };
}
// What the data behind a material is: its class, source, the conditions it holds for, and its α per band.
function DataLine({ m }: { m: any }) {
  if (!m) return null;
  const [tone, word] = QUALITY[m.quality] || QUALITY.none, src = SURF.sourceOf(m), al = SURF.alphaOf(m.id);
  return (
    <div className="surf-data">
      <Pill tone={tone} text={word} />
      <span className="small muted" title={m.notes || undefined}>
        {`${m.conditions ? `${m.conditions} · ` : ''}α ${DEMO.BANDS.map((f: number) => (al.values[f] == null ? '—' : al.values[f].toFixed(2))).join(' · ')}${al.capped.length ? ' (limited to 1.00)' : ''}`}
        {src ? <>{' · '}<a href={src.url} target="_blank" rel="noopener">{src.short}</a></> : null}
      </span>
    </div>
  );
}

/* What a surface is, in everyday words: one button per type (js/data/room-form.js SURFACE_TYPES), those most often met
   in the room's type first. The type's hint is its tooltip and is shown once it is chosen. `only`: a fixed list (what
   covers part of a surface, doors and windows). */
function TypePicker({ id, kind, room, value, action, keyName, question, only }: { id: string; kind?: string; room?: any; value: string; action: string; keyName: string; question: string; only?: any[] }) {
  const g = only ? { common: [], rest: only, label: '' } : SURF.typesFor(kind, room);
  const chip = (t: any) => (
    <button type="button" key={t.id} className="chip" id={`${id}-${t.id}`} data-action={action} data-value={`${keyName}|${t.id}`} aria-pressed={value === t.id} title={t.hint || undefined}>{t.name}</button>
  );
  return (
    <Field label={question}>
      <div className="type-pick">
        {g.common.length ? <>
          <span className="type-pick-l">{g.label}</span>
          <div className="chips" role="group" aria-label={`${question} ${g.label.toLowerCase()}`}>{g.common.map(chip)}</div>
          <span className="type-pick-l">More types</span>
        </> : null}
        <div className="chips" role="group" aria-label={question}>{g.rest.map(chip)}</div>
      </div>
    </Field>
  );
}
/* How much sound the chosen material absorbs, in plain words (SURF.soundRating, from its sourced data), and whether that
   is the type's typical data or an exact entry. Without data, that it is recorded and treated as unknown. */
function SoundLine({ m, typical }: { m: any; typical: boolean }) {
  if (!m) return <p className="small muted surf-sound-none">No sound data in the library for this yet. It is recorded as described, and the treatment prediction treats it as unknown rather than guess.</p>;
  const r = SURF.soundRating(m.id);
  return (
    <div className="surf-sound">
      <span className="sound-meter" aria-hidden="true">{[0, 1, 2, 3].map(i => <i key={i} className={r && i <= r.level ? 'on' : ''} />)}</span>
      <span><b>{r ? r.word : 'Sound data for some bands only'}</b><span className="small muted">{typical ? ' · typical values for this type' : ' · values for the exact type chosen'}</span></span>
    </div>
  );
}
// "Other / not listed": what it is called, and anything known about it. Its properties are left unspecified.
function CustomEntry({ keyName, field, what, value }: { keyName: string; field: string; what: string; value: any }) {
  const v = value || {};
  return (
    <div className="surf-sub surf-custom">
      <div className="grid g2">
        <TextInput id={`surf-${keyName}-${field}-name`} label={`Name of the ${what}`} bind={`room.surfaces.${keyName}.${field}.name`} value={v.name} placeholder={what === 'finish' ? 'e.g. Lime plaster with jute fibre' : 'e.g. Hempcrete blocks'} req />
        <TextInput id={`surf-${keyName}-${field}-notes`} label="What is known about it" bind={`room.surfaces.${keyName}.${field}.notes`} value={v.notes} placeholder="e.g. thickness, maker, product name" req="optional" />
      </div>
    </div>
  );
}

/* What is on a wall: ticked, no sizes. "Other" can say what it is. */
function EquipmentTicks({ keyName, s }: { keyName: string; s: any }) {
  const on = new Set((s.equipment || []).map((e: any) => (e && typeof e === 'object' ? e.type : e)));
  return (
    <div className="surf-eq">
      <Field label="On this wall" hint="Tick what is mounted on it. Recorded for the recommendations; nothing to measure.">
        <div className="chips" role="group" aria-label="On this wall">
          {RF().EQUIPMENT.map((t: any) => <button type="button" key={t.id} className="chip" id={`surf-${keyName}-eq-${t.id}`} data-action="toggleEquipment" data-value={`${keyName}|${t.id}`} aria-pressed={on.has(t.id)}>{t.name}</button>)}
        </div>
      </Field>
      {on.has('other') ? <div className="surf-name"><TextInput id={`surf-${keyName}-eq-other-name`} label="What else is on it" bind={`room.surfaces.${keyName}.equipmentOther`} value={s.equipmentOther} placeholder="e.g. Fire alarm panel" req="optional" /></div> : null}
    </div>
  );
}

/* ---------- a wall in parts: what it is along its length, and its doors and windows ---------- */
const shortName = (name: string) => name.replace(/ \(.*\)$/, '');
const typeName = (id: string) => { const t = SURF.typeOf('wall', id); return t ? t.name : 'Not chosen yet'; };
/* A wall laid out from its left end, in m: its sections, then its own type in the width they leave. Doors are placed
   from the right end and windows from the left (sill 0.9 m), where they usually are: where they are is not recorded.
   Without the wall's size, a 4 × 2.7 m outline. Drawn face-on on its card and in the 3D room. */
function wallLayout(model: any, s: any) {
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
// The wall seen face-on, to scale.
function WallStrip({ name, model, s }: { name: string; model: any; s: any }) {
  const { known, L, H, parts: shown, ops } = wallLayout(model, s);
  const VW = 600, VH = Math.max(70, Math.min(150, VW * H / L)), sx = VW / L, fh = VH - 18, sz = fh / H;
  return (
    <svg className="wstrip" viewBox={`0 0 ${VW} ${VH}`} role="img" aria-label={`${name} seen face-on: ${shown.map((x: any) => `${typeName(x.type)}${known ? `, ${fmt.m(+x.w.toFixed(2))}` : ''}`).join('; ')}`}>
      {shown.map((x: any, i: number) => <rect key={`p${i}`} className="wstrip-part" x={x.u0 * sx} y={0} width={x.w * sx} height={fh} fill={fillOf('wall', x.type)}><title>{`${typeName(x.type)}${known ? ` · ${fmt.m(+x.w.toFixed(2))}` : ''}`}</title></rect>)}
      {ops.map((o, i) => <rect key={`o${i}`} className={`wstrip-${o.kind === 'window' ? 'window' : 'door'}`} x={o.u0 * sx} y={(H - o.z1) * sz} width={(o.u1 - o.u0) * sx} height={(o.z1 - o.z0) * sz}><title>{SURF.OPENINGS[o.kind] || 'Opening'}</title></rect>)}
      {shown.filter((x: any) => x.w * sx > 80).map((x: any, i: number) => {
        const cx0 = (x.u0 + x.w / 2) * sx, bw = Math.min(x.w * sx - 12, 170);
        return <g key={`l${i}`} className="wstrip-l"><rect x={cx0 - bw / 2} y={fh / 2 - 11} width={bw} height={22} rx={6} /><text x={cx0} y={fh / 2 + 4} textAnchor="middle">{`${shortName(typeName(x.type))}${known ? ` · ${fmt.m(+x.w.toFixed(2))}` : ''}`}</text></g>;
      })}
      <line className="wstrip-dim" x1={0} y1={VH - 9} x2={VW} y2={VH - 9} />
      <text className="wstrip-dim-t" x={VW / 2} y={VH - 1} textAnchor="middle">{known ? fmt.m(+L.toFixed(2)) : 'size not entered'}</text>
    </svg>
  );
}
// A part's sound data in one line: α per band as small bars, in words, and its source.
function PartData({ id }: { id: string }) {
  const m = SURF.material(id);
  if (!m) return <span className="wpart-data small muted">No sound data in the library for this yet</span>;
  const r = SURF.soundRating(m.id), al = SURF.alphaOf(m.id), src = SURF.sourceOf(m);
  return (
    <span className="wpart-data small muted" title={m.variant || undefined}>
      <span className="wbars" aria-hidden="true">{DEMO.BANDS.map((f: number) => <i key={f} style={{ height: `${Math.max(2, Math.round((al.values[f] || 0) * 16))}px` }} />)}</span>
      <span>{r ? r.word : 'Sound data for some bands only'}{src ? <>{' · '}<a href={src.url} target="_blank" rel="noopener">{src.short}</a></> : null}</span>
    </span>
  );
}
/* The wall from left to right: one row per section (what it is, its width) and one for the wall's own type in the width
   they leave; "Split the wall"; and its doors and windows, one more or one less. */
function WallParts({ def, model, s, room }: { def: any; model: any; s: any; room: any }) {
  const key = def.key, g = SURF.typesFor('wall', room), secs = SURF.sectionsOf(s), own = SURF.typeOfSurface(s, 'wall');
  const counted = model.parts.filter((x: any) => x.role === 'section'), used = counted.reduce((t: number, x: any) => t + x.widthM, 0);
  const options = <>
    <option value="" disabled>Choose what it is</option>
    {g.common.length ? <optgroup label={g.label}>{g.common.map((t: any) => <option value={t.id} key={t.id}>{t.name}</option>)}</optgroup> : null}
    <optgroup label={g.common.length ? 'More types' : 'Types'}>{g.rest.map((t: any) => <option value={t.id} key={t.id}>{t.name}</option>)}</optgroup>
  </>;
  const pick = (part: string, type: string, label: string) => (
    <SyncSelect className="select" id={`surf-${key}-part-${part}`} value={type} data-change-action="setWallPart" data-key={key} data-part={part} aria-label={label}>{options}</SyncSelect>
  );
  const swatch = (type: string) => <svg className="sw" aria-hidden="true"><rect width="100%" height="100%" fill={fillOf('wall', type)} /></svg>;
  const count = (kind: string) => (s.openings || []).filter((o: any) => o.kind === kind).reduce((t: number, o: any) => t + (isNum(o.count) && o.count >= 1 ? Math.floor(o.count) : 1), 0);
  const step = (kind: string, word: string) => {
    const n = count(kind);
    return (
      <span className="wstep"><span className="small">{`${word}s`}</span>
        <span className="stepper stepper-sm">
          <button type="button" id={`surf-${key}-${kind}-less`} data-action="stepOpening" data-value={`${key}|${kind}|-1`} aria-label={`One ${word.toLowerCase()} less`} disabled={!n || undefined}><Icon name="minus" size={14} sw={2.4} /></button>
          <output aria-label={`${word}s on ${def.name}`}>{n}</output>
          <button type="button" id={`surf-${key}-${kind}-more`} data-action="stepOpening" data-value={`${key}|${kind}|1`} aria-label={`One ${word.toLowerCase()} more`}><Icon name="plus" size={14} sw={2.4} /></button>
        </span>
      </span>
    );
  };
  return (
    <div className="wparts">
      <WallStrip name={def.name} model={model} s={s} />
      {secs.map((x: any, i: number) => (
        <div className="wpart" key={x.id}>
          {swatch(x.type)}
          <div className="wpart-main">
            {pick(x.id, x.type || '', `${def.name}, section ${i + 1}: what it is`)}
            {x.type ? <PartData id={x.material} /> : null}
          </div>
          <NumberInput id={`surf-${key}-sec-${x.id}-w`} label={`Section ${i + 1} width`} bind={`room.surfaces.${key}.sections.${i}.widthM`} value={x.widthM} unit="m" placeholder="e.g. 2.4"
            error={isNum(x.widthM) && x.widthM <= 0 ? 'Enter more than 0 m' : null} />
          <Btn action="removeSection" value={`${key}|${x.id}`} variant="ghost" size="sm" icon="x" label={`Remove section ${i + 1}`} />
        </div>
      ))}
      <div className="wpart">
        {swatch(own ? own.type.id : '')}
        <div className="wpart-main">
          {pick('main', own ? own.type.id : '', secs.length ? `${def.name}, the rest of it: what it is` : `${def.name}: what it is`)}
          {own && own.type.id !== 'other' ? <PartData id={s.material} /> : null}
        </div>
        <span className="wpart-rest small muted">{`${secs.length ? 'the rest' : 'whole wall'}${isNum(model.lengthM) ? ` · ${fmt.m(+Math.max(0, model.lengthM - used).toFixed(2))}` : ''}`}</span>
      </div>
      <div className="wparts-acts">
        <Btn action="addSection" value={key} variant="ghost" size="sm" icon="plus">Split the wall</Btn>
        <span className="wparts-steps">{step('door', 'Door')}{step('window', 'Window')}</span>
      </div>
    </div>
  );
}

function SurfaceCard({ p, def, model, search, confirm, walls }: { p: any; def: any; model: any; search: string; confirm: string | null; walls: number }) {
  const s = (p.room.surfaces || {})[def.key] || SURF.blankSurface(), key = def.key, ok = model.grossM2 != null, wall = def.kind === 'wall';
  const r = p.room, g = acoustics.geometry(r);
  const dimText = wall ? (model.lengthM && model.heightM ? `${fmt.m(model.lengthM)} × ${fmt.m(model.heightM)}` : '') : def.section ? '' : ok && g ? `${fmt.m(r.L)} × ${fmt.m(r.W)}` : '';
  // Its everyday type (chosen, or recognised for a surface saved before types existed); the exact entries offered are
  // those of that type.
  const tx = SURF.typeOfSurface(s, def.kind), type = tx ? tx.type : null, other = !!type && type.id === 'other';
  const fit = type ? { construction: type.construction || '', finish: type.finish } : { construction: s.construction || '', finish: s.finish || '' };
  const fin = materialPicker({ id: `surf-${key}`, kind: def.kind, keyName: key, part: 'finish', value: s.material, label: 'Exact type', fit, search });
  const typical = !!(type && type.material && s.material === type.material);
  const question = wall ? 'What is this wall?' : def.kind === 'floor' ? 'What is the floor?' : 'What is this ceiling?';
  const cov = s.cover && (s.cover.type || s.cover.material || isNum(s.cover.pct));
  let coverHtml: ReactNode = null;
  if (cov) {
    const ct = SURF.coverTypeOf(s.cover, def.kind), ctFit = ct && ct.id !== 'other' ? { construction: ct.construction || '', finish: ct.finish } : undefined;
    const c = materialPicker({ id: `surf-${key}-cov`, kind: def.kind, keyName: key, part: 'cover', value: s.cover.material, label: 'Exact type', fit: ctFit });
    coverHtml = (
      <div className="surf-sub">
        <TypePicker id={`surf-${key}-cov-type`} only={SURF.coverTypesFor(def.kind)} value={ct ? ct.id : ''} action="setCoverType" keyName={key} question="What covers part of it?" />
        {ct && ct.id === 'other' ? <div className="surf-name"><TextInput id={`surf-${key}-cov-name`} label="What it is" bind={`room.surfaces.${key}.cover.name`} value={s.cover.name} placeholder="e.g. Felt wall hanging" req="optional" /></div> : null}
        <div className="surf-row">
          <NumberInput id={`surf-${key}-pct`} label="How much of it is covered" bind={`room.surfaces.${key}.cover.pct`} value={s.cover.pct} unit="%" placeholder="50"
            error={isNum(s.cover.pct) && (s.cover.pct < 0 || s.cover.pct > 100) ? 'Enter 0–100 %' : null} />
          <span className="small muted">{ok ? `${fmt.m2(model.coverM2)} covered, ${fmt.m2(model.finishM2)} left as it is` : ''}</span>
          <Btn action="removeCover" value={key} variant="ghost" size="sm" icon="x">Remove</Btn>
        </div>
        {ct && ct.id !== 'other' ? <SoundLine m={c.cur} typical={!!(ct.material && s.cover.material === ct.material)} /> : null}
        {!c.none ? <details className="surf-exact"><summary>Exact type and sound data (optional)</summary><div className="grid g2">{c.sel}{c.variant}</div><DataLine m={c.cur} /></details> : null}
      </div>
    );
  }
  const ops = wall ? (s.openings || []).map((o: any, i: number) => {
    const m = materialPicker({ id: `surf-${key}-o${o.id}`, kind: 'opening', opening: o.kind, keyName: key, part: o.id, value: o.material, label: 'Exact type' });
    const a = SURF.openingArea(o), types = SURF.openingTypesFor(o.kind), ot = SURF.openingTypeOf(o);
    return (
      <div className="surf-sub surf-op" key={o.id}>
        {types.length > 1
          ? <TypePicker id={`surf-${key}-o${o.id}-type`} only={types} value={ot ? ot.id : ''} action="setOpeningType" keyName={`${key}|${o.id}`} question={SURF.OPENINGS[o.kind] || 'Opening'} />
          : <span className="field-l">{SURF.OPENINGS[o.kind] || 'Opening'}</span>}
        <div className="surf-row surf-dims">
          <NumberInput id={`surf-${key}-o${o.id}-w`} label="Width" bind={`room.surfaces.${key}.openings.${i}.widthM`} value={o.widthM} unit="m" placeholder="e.g. 0.9" />
          <NumberInput id={`surf-${key}-o${o.id}-h`} label="Height" bind={`room.surfaces.${key}.openings.${i}.heightM`} value={o.heightM} unit="m" placeholder="e.g. 2.1" />
          <NumberInput id={`surf-${key}-o${o.id}-n`} label="How many" bind={`room.surfaces.${key}.openings.${i}.count`} value={o.count} type="int" placeholder="1" error={isNum(o.count) && o.count < 1 ? 'Enter 1 or more' : null} />
          <span className="small muted">{a != null ? fmt.m2(a) : 'Enter its size'}</span>
          <Btn action="removeOpening" value={`${key}|${o.id}`} variant="ghost" size="sm" icon="x" label={`Remove this ${(SURF.OPENINGS[o.kind] || 'opening').toLowerCase()}`} />
        </div>
        {types.length > 1 && !m.none ? <details className="surf-exact"><summary>Exact type and sound data (optional)</summary><div className="grid g2">{m.sel}{m.variant}</div><DataLine m={m.cur} /></details> : null}
      </div>
    );
  }) : null;
  const eq = wall ? <EquipmentTicks keyName={key} s={s} /> : null;
  // A wall's own length and height are asked only where the room's size does not give them: an added wall, or a room
  // that is not rectangular.
  const ownSize = wall && (def.added || (r.shape && r.shape !== 'rectangular'));
  const derived = (k: 'L' | 'W' | 'H') => (isNum(r[k]) && r[k] > 0 ? `${r[k]} (room)` : '');
  const asking = confirm === `surface:${key}`, removable = (wall && walls > 1) || def.section;
  // What the header says the surface is: its type, or what was recorded earlier, or that it is not described yet.
  const built = [s.construction ? SURF.constructionText(s, def.kind) : '', s.finish ? SURF.finishText(s, def.kind).toLowerCase() : ''].filter(Boolean).join(', ');
  const what = SURF.typeText(s, def.kind) || built || (fin.cur ? fin.cur.variant || SURF.familyOf(fin.cur, def.kind) : '');
  const nSec = wall ? SURF.sectionsOf(s).length : 0;
  const counts = [nSec ? `${nSec + 1} parts` : '', (s.openings || []).length ? `${(s.openings || []).length} opening${(s.openings || []).length > 1 ? 's' : ''}` : '', ...model.equipment.map((e: any) => e.label.toLowerCase())].filter(Boolean).join(' · ');
  const opened = (S.state.ui as any).open || {}, open = !!opened[`surf-${key}`];
  const nameField = <div className="surf-name"><TextInput id={`surf-${key}-label`} label="Name (optional)" bind={`room.surfaces.${key}.label`} value={s.label} placeholder={wall ? 'e.g. Window wall' : 'e.g. Raft over the table'} /></div>;
  // What it is in detail: on a wall, under "More details" (its parts, doors and windows come first).
  const detail = <>
    <TypePicker id={`surf-${key}-type`} kind={def.kind} room={r} value={type ? type.id : ''} action="setSurfaceType" keyName={key} question={nSec ? `${question.replace('?', '')} (the rest of it)?` : question} />
    {!type && built ? <p className="small muted">{`Recorded earlier: ${built}. Choose what it is above, or leave it as recorded.`}</p> : null}
    {type && type.hint && !other ? <p className="small muted surf-hint">{type.hint}</p> : null}
    {other ? <CustomEntry keyName={key} field="finishOther" what="material" value={s.finishOther} /> : null}
    {s.construction === 'other' ? <CustomEntry keyName={key} field="constructionOther" what="construction" value={s.constructionOther} /> : null}
    {other || s.construction === 'other' ? <p className="small muted">Kept with this room, with its sound properties left unknown until they are sourced: nothing is estimated for it. When you send the report form, the name is included so it can be reviewed for the library.</p> : null}
    {type && !other ? <SoundLine m={fin.cur} typical={typical} /> : null}
    {!other && (!fin.none || search) ? (
      <details className="surf-exact" open={(!type && !!s.material) || !!search || undefined}>
        <summary>Exact type and sound data (optional)</summary>
        <p className="small muted">{type ? `Only if you know exactly what it is: the library's entries for ${type.name.toLowerCase()}, with their tested or published values.` : 'The library’s entries for this surface, with their tested or published values.'}</p>
        <input className="input input-sm" id={`surf-${key}-search`} type="text" role="searchbox" data-uibind={`matSearch.${key}`} defaultValue={search} placeholder="Search, e.g. painted" aria-label={`Search the library for ${def.name}`} autoComplete="off" />
        <div className="grid g2">{fin.sel}{fin.variant}</div><DataLine m={fin.cur} />
      </details>
    ) : null}
    {coverHtml}{ops}{eq}
    <div className="surf-adds">
      {!cov ? <Btn action="addCover" value={key} variant="ghost" size="sm" icon="plus">Something covering part of it</Btn> : null}
      {wall ? ['door', 'window', 'opening'].map(k => <Btn key={k} action="addOpening" value={`${key}|${k}`} variant="ghost" size="sm" icon="plus">{k === 'opening' ? 'Opening' : SURF.OPENINGS[k]}</Btn>) : null}
    </div>
  </>;
  return (
    <details className="surf" id={`surf-card-${key}`} data-open-id={`surf-${key}`} open={open}>
      <summary className="surf-h">
        <Icon name="chevR" size={14} sw={2.4} />
        <b>{def.name}</b>{s.label ? <span className="surf-label">{s.label}</span> : null}
        <span className="surf-what small">{what ? <span>{what}</span> : <span className="muted">Not described yet</span>}{counts ? <span className="muted">{` · ${counts}`}</span> : null}{model.problems.length ? <span className="surf-warn"><Icon name="alert" size={12} sw={2.4} />{`${model.problems.length} to check`}</span> : null}</span>
        <span className="surf-area">{ok ? fmt.m2(model.grossM2) : '—'}{ok && model.openingsM2 > 0 ? <small>{`${fmt.m2(model.solidM2)} solid`}</small> : null}{ok && wall && model.availableM2 != null && (model.coverM2 > 0 || model.openingsM2 > 0 || model.availableM2 < model.finishM2 - 1e-9) ? <small className="surf-free">{`${fmt.m2(model.availableM2)} free`}</small> : null}</span>
      </summary>
      <div className="surf-b">
      <p className="small muted surf-where">{`${def.where}${dimText ? ` · ${dimText}` : ''}`}</p>
      {s.origin === 'migrated' && s.legacy ? <Note tone="warn">{`Filled from the earlier single choice “${s.legacy}”. Check that it describes ${def.name.toLowerCase()}.`}</Note> : null}
      {!s.material && s.legacy ? <p className="small muted">{`Earlier entry: “${s.legacy}”. It does not say which material this is, so choose it here.`}</p> : null}
      {wall ? (ownSize ? (
        <div className="surf-row surf-dims">
          <NumberInput id={`surf-${key}-len`} label="Length" bind={`room.surfaces.${key}.lengthM`} value={s.lengthM} unit="m" placeholder={def.a ? derived(def.a) : 'required'} error={SURF.wallDimError('lengthM', s.lengthM)} />
          <NumberInput id={`surf-${key}-ht`} label="Height" bind={`room.surfaces.${key}.heightM`} value={s.heightM} unit="m" placeholder={derived('H')} error={SURF.wallDimError('heightM', s.heightM)} />
        </div>
      ) : null) : def.section ? (
        <div className="surf-row surf-dims">
          {nameField}
          <NumberInput id={`surf-${key}-area`} label="Area" bind={`room.surfaces.${key}.areaM2`} value={s.areaM2} unit="m²" placeholder="required" error={isNum(s.areaM2) && s.areaM2 <= 0 ? 'Enter more than 0 m²' : null} />
        </div>
      ) : null}
      {wall ? <>
        <WallParts def={def} model={model} s={s} room={r} />
        <details className="surf-more" data-open-id={`surf-${key}-more`} open={!!opened[`surf-${key}-more`] || undefined}>
          <summary>More details</summary>
          <div className="surf-more-b"><div className="surf-row surf-dims">{nameField}</div>{detail}</div>
        </details>
      </> : detail}
      {model.problems.length ? <ul className="bullets small">{model.problems.map((x: string, i: number) => <li key={i}>{x}</li>)}</ul> : null}
      {wall || def.section ? (
        <div className="surf-foot">
          {wall ? <Btn action="duplicateWall" value={key} variant="ghost" size="sm" icon="copy">Duplicate</Btn> : null}
          {removable ? (asking
            ? <span className="surf-confirm"><span className="small">{`Remove ${def.name} and everything recorded on it?`}</span><Btn action="removeSurface" value={key} variant="primary" size="sm">Remove</Btn><Btn action="cancelRemoveSurface" variant="ghost" size="sm">Keep</Btn></span>
            : <Btn action="askRemoveSurface" value={key} variant="ghost" size="sm" icon="trash">Remove</Btn>) : null}
        </div>
      ) : null}
      </div>
    </details>
  );
}

/* A saved choice that is no longer offered (a room type without a verified RT60 criterion, kept from an earlier version)
   stays visible as it was saved, marked, so nothing saved is lost or changed. */
const withSaved = (list: string[], v: string, mark: string) => (v && !list.includes(v) ? [...list.map(x => ({ value: x, label: x })), { value: v, label: `${v} (${mark})` }] : list);

/* Whether a target can be generated for the room as described (AM.services.target.availability). */
function CriterionStatus({ av, rec }: { av: any; rec: any }) {
  if (rec) return <Note tone="good" icon="seal">{`Verified criterion: ${rec.reference.short}, ${rec.criterion.name}${rec.reference.evidence === 'primary' ? '' : ' (checked in published sources; the standard\'s own text was not available)'}. The target is worked out in step 2.`}</Note>;
  if (av.status === 'unselected') return null;
  if (av.status === 'needs-input') return <p className="small muted">{av.message}</p>;
  return <Note tone="warn">{av.message}</Note>;
}

/* The industry's own questions: all optional, recorded for later recommendations. */
function Questions({ r, qs }: { r: any; qs: Question[] }) {
  const c = r.context || {};
  return (
    <div className="fields q-fields">
      {qs.map(q => q.kind === 'int'
        ? <NumberInput key={q.id} id={`q-${q.id}`} label={q.label} bind={`room.context.${q.id}`} value={c[q.id]} type="int" placeholder="optional" hint={q.hint} />
        : <Field key={q.id} label={q.label} hint={q.hint}>{q.kind === 'multi'
          ? <Chips path={`context.${q.id}`} options={(q.options || []).map(o => ({ value: o, label: o }))} value={c[q.id]} label={q.label} />
          : <Seg bind={`room.context.${q.id}`} value={c[q.id] || ''} options={(q.options || []).map(o => ({ value: o, label: o }))} label={q.label} id={`q-${q.id}`} />}</Field>)}
    </div>
  );
}

export function RoomScreen({ ctx }: { ctx: Ctx }) {
  const r: any = ctx.project.room, g = acoustics.geometry(r), m = M(), O = DEMO.OPTIONS as any;
  const validG = g && !m.DIMS.some(([k]) => m.dimError(k, r[k]));
  // Every industry and room type is offered. Room types and activities with a verified RT60 criterion come first; the
  // others are grouped and marked: they can be measured, and step 2 says why no target is recommended for them.
  const NONE = 'No verified RT60 target (can still be measured)';
  const types: string[] = DEMO.roomTypesFor(r.industry), tg = TGT.typeGroups(r.industry);
  const typeGroups = [{ label: 'RT60 target from a standard', options: tg.target }, { label: NONE, options: tg.none }];
  const known: string[] = types.includes(r.type) ? TGT.knownUses(r.type) : [], ug = TGT.useGroups(r.type);
  const useSaved = r.use && !known.includes(r.use) ? [{ value: r.use, label: `${r.use} (saved)` }] : [];
  const useGroups = [{ label: 'RT60 target from a standard', options: types.includes(r.type) ? ug.target : [] }, { label: NONE, options: types.includes(r.type) ? ug.none : [] }];
  const hasUses = known.length + useSaved.length > 0;
  // A size outside the limits gives no target yet: the criterion is not judged on a size Room Setup does not accept.
  const avRaw = TGT.availability(r), sizeBad = !validG && (avRaw.status === 'ok' || avRaw.status === 'outside');
  const av = sizeBad ? Object.assign({}, avRaw, { status: 'needs-input', message: 'The recommended RT60 appears once the length, width and height are within the limits shown.' }) : avRaw;
  const rec = validG ? TGT.recommend(r) : null;
  const occ = m.occError(r), guide = am.guides.dimensions, qs = r.industry ? m.questionsFor(r) : [];
  const defs = SURF.surfacesOf(r), walls = defs.filter((d: any) => d.kind === 'wall'), others = defs.filter((d: any) => d.kind !== 'wall');
  const ui: any = S.state.ui, search = (k: string) => ((ui.matSearch || {})[k] || ''), confirm = ui.confirm || null;
  const card = (def: any) => <SurfaceCard key={def.key} p={ctx.project} def={def} model={SURF.surfaceModel(r, def.key)} search={search(def.key)} confirm={confirm} walls={walls.length} />;
  const shape = (O.shape as any[]).find(x => x.value === (r.shape || 'rectangular')) || O.shape[0];
  const t = SURF.totals(r), fin = SURF.finishes(r), narrow = useNarrow();
  return (
    <div className="grid split">
      <svg className="look-defs" width={0} height={0} aria-hidden="true" focusable="false"><defs dangerouslySetInnerHTML={{ __html: lookDefs() }} /></svg>
      <div className="stack">
        <Card icon="doc" title="Room">
          <div className="fields">
            <div className="grid g2">
              <TextInput id="room-name" label="Room name" bind="room.name" value={r.name} placeholder="e.g. Conference Room A" req />
              <TextInput id="room-ref" label="Reference" bind="room.reference" value={r.reference} placeholder="e.g. Level 3, room 3.14" req="optional" />
            </div>
            <div className="grid g2">
              <SelectInput id="room-industry" label="Industry" changeAction="setIndustry" value={r.industry} options={withSaved(DEMO.INDUSTRIES.map((i: { name: string }) => i.name), r.industry, 'saved')} placeholder="Choose an industry" req />
              <SelectInput id="room-type" label="Room type" changeAction="setType" value={types.includes(r.type) ? r.type : ''} options={[]} groups={typeGroups} placeholder={r.industry ? 'Choose a room type' : 'Choose an industry first'} req disabled={!r.industry}
                hint="Room types with no verified RT60 standard can still be measured; step 2 says why no target is recommended for them." />
            </div>
            {r.industry === DEMO.OTHER_INDUSTRY || r.type === DEMO.OTHER_TYPE ? (
              <div className="grid g2">
                {r.industry === DEMO.OTHER_INDUSTRY ? <TextInput id="room-industry-other" label="Name of the industry" bind="room.industryOther" value={r.industryOther} placeholder="e.g. Transport hub" req /> : <span />}
                {r.type === DEMO.OTHER_TYPE ? <TextInput id="room-type-other" label="Name of the room type" bind="room.typeOther" value={r.typeOther} placeholder="e.g. Podcast booth" req /> : null}
              </div>
            ) : null}
            {r.type === DEMO.OTHER_TYPE ? null : <SelectInput id="room-use" label="Main activity" bind="room.use" value={hasUses ? r.use || '' : ''} options={useSaved} groups={useGroups} placeholder={r.type ? 'Choose the main activity' : 'Choose a room type first'}
              hint={((window.AM as any).targetData.USES[r.use] || {}).hint || 'The main activity decides which criterion the target follows.'} req disabled={!hasUses} />}
            <CriterionStatus av={av} rec={rec} />
            <TextInput id="room-purpose" label="Purpose and intended use" bind="room.purpose" value={r.purpose} placeholder="e.g. Weekly all-hands, client presentations, hybrid calls" req="optional" />
          </div>
        </Card>
        {qs.length ? (
          <Card icon="list" title="About how the room is used" sub={`Questions for ${String(r.industry).toLowerCase()}. All optional; recorded for the recommendations, they do not change the target.`}>
            <Questions r={r} qs={qs} />
          </Card>
        ) : null}
        <Card icon="room" title="Dimensions" sub="Inside measurements, wall to wall and floor to ceiling.">
          <div className="guide-row">
            <GuideThumb id="dimensions" size={18} />
            <div className="guide-row-text">
              <span>Measure inside the room: wall face to wall face, and floor to the ceiling you can see. A laser meter is quickest.</span>
              <div><Btn action="openGuide" value="dimensions" size="sm" icon="info">{guide.title}</Btn></div>
            </div>
          </div>
          <Field label="Room shape" hint={shape.hint}><Seg bind="room.shape" value={r.shape || 'rectangular'} options={O.shape} label="Room shape" id="room-shape" /></Field>
          <div className="dims-grid">
            {m.DIMS.map(([k, label]) => (
              <NumberInput key={k} id={`room-${k}`} label={label} bind={`room.${k}`} value={r[k] as number | null} unit="m" error={m.dimError(k, r[k])} req placeholder={k === 'H' ? '3.0' : '0.0'} />
            ))}
          </div>
          <div className="well vol">
            <span className="muted small">Volume</span><span className="stat-v">{validG ? g.V.toFixed(0) : '—'}<small>m³</small></span>
            <span className="small muted">{validG ? `${fmt.dims(g)} · floor ${fmt.m2(g.floor)}` : 'Updates as you type'}</span>
          </div>
        </Card>
        <Card icon="users" title="Occupancy and furnishing">
          <div className="grid g2">
            <NumberInput id="room-occ" label="Typical occupancy (people)" bind="room.occupancy" value={r.occupancy} type="int" placeholder="0" req="optional" error={occ} />
            <Field label="Furnishing"><Seg bind="room.furnishing" value={r.furnishing} options={O.furnishing.map((v: string) => ({ value: v, label: v }))} label="Furnishing" id="room-furn" /></Field>
          </div>
          <Field label="In the room" hint="Anything soft or acoustic already there. Choose all that apply."><Chips path="furnishings" options={O.furnishings} value={r.furnishings} label="In the room" /></Field>
        </Card>
        <Card icon="wall" title={`Walls (${walls.length})`} sub="Each wall: what it is along its length, its doors and windows, and what is on it. Their sizes come from the room; walls go round it: 1 and 3 are the long walls, 2 and 4 the end walls.">
          <p className="small muted">Open a wall to describe it. Where part of it is something else (a glass section, fitted panels), split it. Its line shows what is recorded so far.</p>
          <div className="surfs">{walls.map(card)}</div>
          <div className="hstack"><Btn action="addWall" icon="plus" size="sm">Add a wall</Btn><span className="small muted">Or duplicate a wall to copy what is recorded on it.</span></div>
        </Card>
        <Card icon="room" title="Floor and ceiling" sub={t.ceilingSections > 1 ? `The ceiling has ${t.ceilingSections} sections; the main ceiling keeps the floor area the others leave.` : 'Add a ceiling section where part of the ceiling is different (a raft, a bulkhead, another finish).'}>
          <div className="surfs">{others.map(card)}</div>
          <div className="hstack"><Btn action="addCeilingSection" icon="plus" size="sm">Add a ceiling section</Btn></div>
          {r.existing && r.existing !== 'None' ? <p className="small muted">{`Earlier entry for existing treatment: “${r.existing}”. Describe it on the surfaces it covers.`}</p> : null}
          <Note>The surfaces describe the room and tell the treatment prediction what each product covers and how much of each wall is free, so no surface is counted twice. The room's RT60 is measured, not estimated from them; they never change the target or a measurement.</Note>
        </Card>
        {narrow ? <Card icon="room" title="The room in 3D" sub="The room as described above: its size, walls, floor and ceiling. Tap a wall to see what it is." cls="card-room3d"><RoomView r={r} /></Card> : null}
        <Card icon="flag" title="Acoustic problems and goals" sub="What people notice now, and what should improve. Optional; recorded for the recommendations.">
          <Field label="Current problems"><Chips path="problems" options={O.problems} value={r.problems} label="Current problems" /></Field>
          <Field label="Outcome wanted"><Chips path="outcomes" options={O.outcomes} value={r.outcomes} label="Outcome wanted" /></Field>
          <TextInput id="room-acoustic-notes" label="In your own words" bind="room.acousticNotes" value={r.acousticNotes} placeholder="e.g. Remote callers say we sound echoey; the far end of the table cannot hear" req="optional" />
        </Card>
      </div>
      <div className="stack sticky">
        <Card icon="seal" title="Room summary" right={validG ? null : <Pill tone="neutral" text="Incomplete" />} cls="card-summary">
          {narrow ? null : <RoomView r={r} />}
          <Kv rows={[
            ['Volume', validG ? fmt.m3(g.V) : '—', 'is-strong'],
            ['Floor area', validG ? fmt.m2(g.floor) : '—'],
            ['Wall area', t.wallM2 != null ? <>{fmt.m2(t.wallM2)}<KvNote>{`${t.walls} wall${t.walls === 1 ? '' : 's'}`}</KvNote></> : '—'],
            ['Free wall area', t.wallAvailableM2 != null ? <>{fmt.m2(t.wallAvailableM2)}<KvNote>less openings, coverings and fitted treatment</KvNote></> : '—'],
            ['Equipment on walls', t.equipmentItems ? `${t.equipmentItems} on ${t.wallsWithEquipment} wall${t.wallsWithEquipment === 1 ? '' : 's'}` : 'None ticked'],
            ['Ceiling area', t.ceilingM2 != null ? <>{fmt.m2(t.ceilingM2)}{t.ceilingSections > 1 ? <KvNote>{`${t.ceilingSections} sections`}</KvNote> : null}</> : '—'],
            ['Total surface', t.wallM2 != null && t.floorM2 != null && t.ceilingM2 != null ? fmt.m2(t.wallM2 + t.floorM2 + t.ceilingM2) : '—'],
            ['Occupancy', isNum(r.occupancy) && !occ ? `${r.occupancy} people` : '—'],
            ['Surfaces described', `${fin.chosen} of ${fin.of}`],
            ['Recommended RT60', rec ? <>{TGT.valueText(rec)}<KvNote>{`${rec.form === 'max' ? 'upper limit' : TGT.rangeText(rec)} · ${rec.reference.short}`}</KvNote></> : av.status === 'unselected' || av.status === 'needs-input' ? '—' : 'None', 'is-strong'],
          ]} />
          <p className={cx('small', 'muted')}>{rec ? 'From the verified criterion for this room category and size. Step 2 shows the source.'
            : av.status === 'unselected' || av.status === 'needs-input' ? 'Appears once the room type, main activity and size are entered.' : 'No verified criterion applies, so no target is generated. Step 2 says why.'}</p>
        </Card>
      </div>
    </div>
  );
}
/* eslint-enable @typescript-eslint/no-explicit-any */

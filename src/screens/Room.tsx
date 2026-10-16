/* Step 1 · Room Setup — what the room is, its size and what it is made of. Six surfaces, each with its own finish, an
   optional partial covering and, on walls, doors, windows and openings (AM.services.surfaces). The surfaces describe the
   room and tell the treatment prediction what each product covers; the room's RT60 is measured, never estimated here.
   Limits and checks: js/stages/room.js. */
import type { ReactNode } from 'react';
import { acoustics, am, DEMO, fmt, isNum, stageModel, SURF, TGT } from '../lib';
import type { Ctx } from '../am';
import { Btn, Card, Field, GuideThumb, Kv, KvNote, Note, NumberInput, Pill, Seg, SelectInput, SyncSelect, TextInput } from '../ui/kit';

interface RoomModel { DIMS: [string, string, string][]; dimError(k: string, v: unknown): string | null; occError(r: unknown): string | null }
const M = () => stageModel<RoomModel>('room');

/* Isometric sketch of the room box, scaled to its real proportions. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
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

/* ---------- surfaces ---------- */
const QUALITY: Record<string, [string, string]> = {
  manufacturer: ['good', 'Manufacturer test data'], published: ['neutral', 'Published reference values'],
  compilation: ['warn', 'Engineering compilation'], definition: ['neutral', 'By definition'], none: ['critical', 'No data'],
};
/* eslint-disable @typescript-eslint/no-explicit-any */
// A material's families for a kind of surface, in categories: [{ category, families: [{ name, variants }] }].
function families(kind: string, opening?: string) {
  return SURF.materialsFor(kind, opening).map((g: any) => {
    const fam = new Map<string, any[]>();
    g.items.forEach((m: any) => { const f = SURF.familyOf(m, kind); if (!fam.has(f)) fam.set(f, []); fam.get(f)!.push(m); });
    return { category: g.category as string, families: [...fam].map(([name, variants]) => ({ name, variants })) };
  });
}
// The material select: families in their categories; a family with several constructions gets a second select.
function materialPicker({ id, kind, opening, keyName, part, value, label }: { id: string; kind: string; opening?: string; keyName: string; part: string; value: string | null; label: string }) {
  const cur = SURF.material(value), groups = families(kind, opening);
  const fam = cur && groups.flatMap((g: any) => g.families.filter((f: any) => f.variants.includes(cur)))[0];
  const none = !groups.length; // no sourced material for this kind of surface: say so, rather than an empty list
  const sel = (
    <Field id={id} label={label}>
      <SyncSelect className="select" id={id} value={fam ? fam.variants[0].id : ''} data-change-action="surfaceMaterial" data-key={keyName} data-part={part} disabled={none || undefined}>
        <option value="" disabled>{none ? 'No materials in the library for this surface' : 'Choose a material'}</option>
        {groups.map((g: any) => <optgroup label={g.category} key={g.category}>{g.families.map((f: any) => <option value={f.variants[0].id} key={f.variants[0].id}>{f.name}</option>)}</optgroup>)}
      </SyncSelect>
    </Field>
  );
  const variant = fam && fam.variants.length > 1 ? (
    <Field id={`${id}-v`} label="Construction">
      <SyncSelect className="select" id={`${id}-v`} value={cur.id} data-change-action="surfaceMaterial" data-key={keyName} data-part={part}>
        {fam.variants.map((m: any) => <option value={m.id} key={m.id}>{m.variant}</option>)}
      </SyncSelect>
    </Field>
  ) : null;
  return { sel, variant, cur };
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

function SurfaceCard({ p, def, model }: { p: any; def: any; model: any }) {
  const s = (p.room.surfaces || {})[def.key] || SURF.blankSurface(), key = def.key, ok = model.grossM2 != null;
  const dimText = ok ? `${fmt.m(p.room[def.a])} × ${fmt.m(p.room[def.b])}` : '';
  const fin = materialPicker({ id: `surf-${key}`, kind: def.kind, keyName: key, part: 'finish', value: s.material, label: 'Material' });
  const cov = s.cover && (s.cover.material || isNum(s.cover.pct));
  let coverHtml: ReactNode = null;
  if (cov) {
    const c = materialPicker({ id: `surf-${key}-cov`, kind: def.kind, keyName: key, part: 'cover', value: s.cover.material, label: 'Covered by' });
    coverHtml = (
      <div className="surf-sub">
        <div className="grid g2">{c.sel}{c.variant}</div>
        <div className="surf-row">
          <NumberInput id={`surf-${key}-pct`} label="Share of the surface" bind={`room.surfaces.${key}.cover.pct`} value={s.cover.pct} unit="%" placeholder="50"
            error={isNum(s.cover.pct) && (s.cover.pct < 0 || s.cover.pct > 100) ? 'Enter 0–100 %' : null} />
          <span className="small muted">{ok ? `${fmt.m2(model.coverM2)} covered, ${fmt.m2(model.finishM2)} of the material above` : ''}</span>
          <Btn action="removeCover" value={key} variant="ghost" size="sm" icon="x">Remove</Btn>
        </div>
        <DataLine m={c.cur} />
      </div>
    );
  }
  const ops = def.kind === 'wall' ? (s.openings || []).map((o: any, i: number) => {
    const m = materialPicker({ id: `surf-${key}-o${o.id}`, kind: 'opening', opening: o.kind, keyName: key, part: o.id, value: o.material, label: SURF.OPENINGS[o.kind] || 'Opening' });
    const a = SURF.openingArea(o);
    return (
      <div className="surf-sub surf-op" key={o.id}>
        <div className="grid g2">{m.sel}{m.variant}</div>
        <div className="surf-row surf-dims">
          <NumberInput id={`surf-${key}-o${o.id}-w`} label="Width" bind={`room.surfaces.${key}.openings.${i}.widthM`} value={o.widthM} unit="m" placeholder="e.g. 0.9" />
          <NumberInput id={`surf-${key}-o${o.id}-h`} label="Height" bind={`room.surfaces.${key}.openings.${i}.heightM`} value={o.heightM} unit="m" placeholder="e.g. 2.1" />
          <NumberInput id={`surf-${key}-o${o.id}-n`} label="How many" bind={`room.surfaces.${key}.openings.${i}.count`} value={o.count} type="int" placeholder="1" />
          <span className="small muted">{a != null ? fmt.m2(a) : 'Enter its size'}</span>
          <Btn action="removeOpening" value={`${key}|${o.id}`} variant="ghost" size="sm" icon="x" label={`Remove this ${(SURF.OPENINGS[o.kind] || 'opening').toLowerCase()}`} />
        </div>
        <DataLine m={m.cur} />
      </div>
    );
  }) : null;
  return (
    <div className="surf" id={`surf-card-${key}`}>
      <div className="surf-h">
        <b>{def.name}</b><span className="small muted">{`${def.where}${dimText ? ` · ${dimText}` : ''}`}</span>
        <span className="surf-area">{ok ? fmt.m2(model.grossM2) : '—'}{ok && model.openingsM2 > 0 ? <small>{`${fmt.m2(model.solidM2)} solid`}</small> : null}</span>
      </div>
      {s.origin === 'migrated' && s.legacy ? <Note tone="warn">{`Filled from the earlier single choice “${s.legacy}”. Check that it describes ${def.name.toLowerCase()}.`}</Note> : null}
      {!s.material && s.legacy ? <p className="small muted">{`Earlier entry: “${s.legacy}”. It does not say which material this is, so choose it here.`}</p> : null}
      <div className="grid g2">{fin.sel}{fin.variant}</div>
      <DataLine m={fin.cur} />
      {coverHtml}{ops}
      <div className="hstack surf-adds">
        {!cov ? <Btn action="addCover" value={key} variant="ghost" size="sm" icon="plus">Partly covered by…</Btn> : null}
        {def.kind === 'wall' ? ['door', 'window', 'opening'].map(k => <Btn key={k} action="addOpening" value={`${key}|${k}`} variant="ghost" size="sm" icon="plus">{k === 'opening' ? 'Opening' : SURF.OPENINGS[k]}</Btn>) : null}
      </div>
      {model.problems.length ? <ul className="bullets small">{model.problems.map((x: string, i: number) => <li key={i}>{x}</li>)}</ul> : null}
    </div>
  );
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export function RoomScreen({ ctx }: { ctx: Ctx }) {
  const r = ctx.project.room, g = acoustics.geometry(r), m = M();
  const validG = g && !m.DIMS.some(([k]) => m.dimError(k, (r as Record<string, unknown>)[k]));
  const types: string[] = DEMO.roomTypesFor(r.industry), uses: string[] = types.includes(r.type) ? TGT.usesFor(r.type) : [];
  const rec = validG && uses.includes(r.use) ? TGT.recommend(r) : null;
  const occ = m.occError(r), guide = am.guides.dimensions;
  return (
    <div className="grid split">
      <div className="stack">
        <Card icon="doc" title="Room">
          <div className="fields">
            <TextInput id="room-name" label="Room name" bind="room.name" value={r.name} placeholder="e.g. Conference Room A" req />
            <div className="grid g2">
              <SelectInput id="room-industry" label="Industry type" changeAction="setIndustry" value={r.industry} options={DEMO.INDUSTRIES.map((i: { name: string }) => i.name)} placeholder="Choose an industry" req />
              <SelectInput id="room-type" label="Room type" changeAction="setType" value={types.includes(r.type) ? r.type : ''} options={types} placeholder={r.industry ? 'Choose a room type' : 'Choose an industry first'} req disabled={!r.industry} />
            </div>
            <SelectInput id="room-use" label="Room use" bind="room.use" value={uses.includes(r.use) ? r.use : ''} options={uses} placeholder={r.type ? 'Choose a use' : 'Choose a room type first'}
              hint="The main activity decides which acoustic criterion the target follows." req disabled={!uses.length} />
          </div>
        </Card>
        <Card icon="room" title="Dimensions" sub="Inside measurements, wall to wall and floor to ceiling.">
          <div className="guide-row">
            <GuideThumb id="dimensions" size={18} />
            <div className="guide-row-text">
              <span>Measure inside the room: wall face to wall face, and floor to the ceiling you can see. A laser meter is quickest.</span>
              <div><Btn action="openGuide" value="dimensions" size="sm" icon="info">{guide.title}</Btn></div>
            </div>
          </div>
          <div className="dims-grid">
            {m.DIMS.map(([k, label]) => (
              <NumberInput key={k} id={`room-${k}`} label={label} bind={`room.${k}`} value={(r as Record<string, unknown>)[k] as number | null} unit="m" error={m.dimError(k, (r as Record<string, unknown>)[k])} req placeholder={k === 'H' ? '3.0' : '0.0'} />
            ))}
          </div>
          <div className="well vol"><span className="muted small">Volume</span><span className="stat-v">{validG ? g.V.toFixed(0) : '—'}<small>m³</small></span><span className="small muted">{validG ? fmt.dims(g) : 'Updates as you type'}</span></div>
        </Card>
        <Card icon="users" title="Occupancy and furnishing">
          <div className="grid g2">
            <NumberInput id="room-occ" label="Typical occupancy (people)" bind="room.occupancy" value={r.occupancy} type="int" placeholder="0" req="optional" error={occ}
              hint="Rooms for speech get a target that allows for the people usually present." />
            <Field label="Furnishing"><Seg bind="room.furnishing" value={r.furnishing} options={DEMO.OPTIONS.furnishing.map((v: string) => ({ value: v, label: v }))} label="Furnishing" id="room-furn" /></Field>
          </div>
        </Card>
        <Card icon="wall" title="Surfaces" sub="What each surface is made of. Walls go round the room: 1 and 3 are the long walls, 2 and 4 the end walls.">
          <div className="surfs">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {SURF.SURFACES.map((def: any) => <SurfaceCard key={def.key} p={ctx.project} def={def} model={SURF.surfaceModel(r, def.key)} />)}
          </div>
          {r.existing && r.existing !== 'None' ? <p className="small muted">{`Earlier entry for existing treatment: “${r.existing}”. Describe it on the surfaces it covers.`}</p> : null}
          <Note>The surfaces describe the room and tell the treatment prediction what each product covers, so no surface is counted twice. The room's RT60 is measured, not estimated from them; they never change the target or a measurement.</Note>
        </Card>
      </div>
      <div className="stack sticky">
        <Card icon="seal" title="Room summary" right={validG ? null : <Pill tone="neutral" text="Incomplete" />} cls="card-summary">
          <IsoRoom r={r} />
          <Kv rows={[
            ['Volume', validG ? fmt.m3(g.V) : '—', 'is-strong'],
            ['Floor area', validG ? fmt.m2(g.floor) : '—'],
            ['Wall area', validG ? fmt.m2(g.walls) : '—'],
            ['Ceiling area', validG ? fmt.m2(g.ceiling) : '—'],
            ['Total surface', validG ? fmt.m2(g.total) : '—'],
            ['Occupancy', isNum(r.occupancy) && !occ ? `${r.occupancy} people` : '—'],
            ['Surfaces described', `${SURF.finishes(r).chosen} of ${SURF.SURFACES.length}`],
            ['Recommended RT60', rec ? <>{fmt.s(rec.preferred)}<KvNote>{`${rec.min.toFixed(2)}–${fmt.s(rec.max)} · ${rec.source.short}`}</KvNote></> : '—', 'is-strong'],
          ]} />
          <p className="small muted">{rec ? 'Worked out from the room type, use, size and occupancy. Step 2 explains it.' : 'Appears once the room type, use and size are entered.'}</p>
        </Card>
      </div>
    </div>
  );
}

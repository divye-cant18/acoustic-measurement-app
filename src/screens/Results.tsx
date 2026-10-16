/* Step 6 · Results — the room as measured: RT60 band by band over every measuring position, each position's own values,
   the decay curves of the latest take, and how each value was calculated. Measured values only; the target is compared
   in the next step. The room's values are the average over the valid positions (AM.derive.room). */
import { useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { am, D, DEMO, fmt, MEAS, PROC, RA } from '../lib';
import type { Average, Ctx, PrimaryAction, Project, TakeRow } from '../am';
import { Btn, Card, Chart, Details, Icon, Kv, KvNote, Legend, Note, NoteActions, NotReliable, Pill, TableWrap, Tag, TechH, type KvRow } from '../ui/kit';
import { AverageSummary, MeasureCheck, SoundTiles } from '../ui/blocks';
import { ui } from '../lib';

/* eslint-disable @typescript-eslint/no-explicit-any */
// Browser processing as the take recorded it: each feature reported off, reported on, or not reported (unknown).
const processingOf = (meta: any): string => {
  if (meta.config && meta.config.processing) return MEAS.processingText(meta.config.processing);
  return meta.settings ? MEAS.processingText(MEAS.processingState(meta.settings, null)) : 'Not recorded with this take';
};
// The sound output as the take recorded it: confirmed by the browser, or played through the system's output unconfirmed.
function outputOf(meta: any): ReactNode {
  const o = meta.config && meta.config.output, name = meta.outputLabel || null;
  if (!o) return name || 'Not named by the browser';
  if (o.verified) return <>{name || 'Selected output'}<KvNote>selected and confirmed by the browser</KvNote></>;
  if (o.selectable) return <>{name || 'The system default output'}<KvNote>the system default: which device played was not confirmed</KvNote></>;
  return <>{name || "The system's current output"}<KvNote>this browser could not choose or confirm the output</KvNote></>;
}
// What showed the recording to be continuous, as the take recorded it. A check this take could not make says so.
function continuity(meta: any): { word: string; note: string | null } {
  const ig = meta.integrity, ck = meta.clicks, t = meta.timing, CK = am.analysis.CRITERIA.take as any, said: string[] = [];
  if (ig) said.push(ig.inputLostFrames == null && ig.outputUnderruns == null ? 'this browser keeps no count of lost audio' : `the browser counted ${ig.inputLostFrames === 0 ? 'no lost microphone audio' : `${ig.inputLostFrames} lost microphone frames`}${ig.outputUnderruns != null ? ` and ${ig.outputUnderruns === 0 ? 'no gap' : `${ig.outputUnderruns} gaps`} in the sound output` : ''}`);
  if (ck) said.push(ck.checked ? `no click (above ${CK.clicks.db} dB) from ${ck.fromSec.toFixed(1)} s to ${ck.toSec.toFixed(1)} s into the sweep` : 'clicks not checked: nothing to read above the sweep');
  if (t) said.push(t.checked ? `the sweep arrived on time in ${t.segments} parts (largest step ${t.maxStepMs} ms)` : `timing not checked: ${t.reason || ''}`);
  if (!said.length) return { word: 'Not checked with this take', note: null };
  const checked = (ig && (ig.inputLostFrames != null || ig.outputUnderruns != null)) || (ck && ck.checked) || (t && t.checked);
  return { word: checked ? 'Continuous' : 'Not checked', note: said.join('; ') };
}
function continuityOf(meta: any): ReactNode {
  const c = continuity(meta);
  return c.note ? <>{c.word}<KvNote>{c.note}</KvNote></> : c.word;
}
const signedDb = (x: number) => `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(x).toFixed(1)} dB`;

/* The latest take in a few plain lines (where, with what, when, and the recording checks it passed), the whole technical
   record one click away. Every line is a value of the take itself, worded as the full record words it. */
export function TakeChecks({ meta, snrDb }: { meta: any; snrDb: number | null | undefined }) {
  const c = continuity(meta), g = meta.sweepGainDb;
  const items: [boolean, string][] = [
    [c.word === 'Continuous', c.word === 'Continuous' ? 'Recording continuous' : 'Recording continuity not checked'],
    [g != null && Math.abs(g) < 1, g == null ? 'Input level not checked with this take' : Math.abs(g) < 1 ? 'Input level steady during the sweep' : `Input level changed by ${signedDb(g)} during the sweep`],
  ];
  return (
    <ul className="qa-list">
      {items.map(([ok, text], i) => <li key={i} className={ok ? 'is-ok' : 'is-info'}><Icon name={ok ? 'check' : 'info'} size={15} sw={ok ? 2.4 : 2} /><span>{text}</span></li>)}
      {snrDb != null ? <li className="is-info"><Icon name="wave" size={15} sw={2} /><span>{`Test signal ${snrDb.toFixed(1)} dB above the background`}</span></li> : null}
    </ul>
  );
}

// The room's warnings name their position ("P1: …"); the same warning at several positions is said once, with all of them.
function sameWarningsOnce(ws: string[]): string[] {
  const by = new Map<string, string[]>(), out: string[] = [];
  ws.forEach(w => { const m = /^(P\d+): ([\s\S]*)$/.exec(w); if (!m) { out.push(w); return; } if (!by.has(m[2])) by.set(m[2], []); by.get(m[2])!.push(m[1]); });
  by.forEach((ps, text) => out.push(`${ps.join(' and ')}: ${text}`));
  return out;
}

const bandsNote = (a: Average) => (!a.available ? 'Not available' : a.partial ? `${a.n} of ${a.total} bands · ${a.missing.map(x => fmt.hz(x.f)).join(', ')} not measured` : `All ${a.total} bands measured`);
const HeroValue = ({ a, cls, watch }: { a: Average; cls: string; watch: string }) => (
  <div className={cls} data-watch={watch}>{a.available && a.value != null ? <>{a.value.toFixed(2)}<small>s</small></> : '—'}</div>
);

/* The takes of this project side by side, with the sweep level each was made at. Shown once there is more than one. */
const TAKE_STATUS: Record<string, [string, string]> = { current: ['good', 'Latest'], 'in-use': ['good', 'In use'], superseded: ['neutral', 'Replaced'], invalid: ['critical', 'Not valid'], failed: ['critical', 'Not used'] };
function Comparison({ p }: { p: Project }) {
  const { rows, spread } = D.takeComparison(p);
  if (rows.length < 2) return null;
  const f = fmt.hz(DEMO.REFERENCE_BAND);
  return (
    <Card icon="history" title="Takes in this project"
      sub={`Each take with its position and the sweep level it was made at: its own ${RA.SHORT} average, and RT60, usable decay, T20 / T30 and r² at ${f}. "In use": the latest valid take at its position, part of the room's values. Takes replaced before the six-band average existed show "—" (their bands are not kept, so it cannot be worked out).`}>
      <TableWrap>
        <table className="tbl">
          <thead><tr><th>Taken</th><th>Position</th><th>Sweep level</th><th>Status</th><th className="r">{`Average ${RA.SHORT}`}</th><th className="r">{`RT60 at ${f}`}</th><th>Method</th><th className="r">Usable decay</th><th className="r">T20 / T30</th><th className="r">r²</th><th className="r">Bands with a value</th><th>Distortion · reason</th></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr className={r.status === 'current' ? 'is-ref' : undefined} key={i}>
                <td>{fmt.when(r.takenAt)}</td><td>{r.position || '—'}</td><td>{ui.levelDb(r.levelDb)}</td><td><Pill tone={TAKE_STATUS[r.status][0]} text={TAKE_STATUS[r.status][1]} /></td>
                <td className="r">{r.average != null && r.averageBands === RA.SHORT ? fmt.s(r.average) : '—'}</td><td className="r">{r.rt60 != null ? <b>{fmt.s(r.rt60)}</b> : '—'}</td><td>{r.method == null ? '—' : r.method}</td>
                <td className="r">{r.decayDb != null ? `${Math.round(r.decayDb)} dB` : '—'}</td>
                <td className="r">{`${r.t20 != null ? fmt.s(r.t20) : '—'} / ${r.t30 != null ? fmt.s(r.t30) : '—'}`}</td>
                <td className="r">{r.r2 != null ? r.r2.toFixed(4) : '—'}</td>
                <td className="r">{r.bandsValid != null ? `${r.bandsValid} of ${r.bandsTotal}` : '—'}</td>
                <td>{r.distortion ? ui.distortionText(r.distortion) : '—'}{r.reason ? <KvNote>{r.reason}</KvNote> : null}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
      {spread != null && spread > 0.1 ? <Note tone="warn"><b>{`RT60 at ${f} differs by ${Math.round(spread * 100)} % between sweep levels at the same position.`}</b> With linear playback and recording, valid takes agree whatever the level. Distortion at the higher level or noise at the lower one may be affecting a take: compare their distortion and usable decay, and measure again.</Note> : null}
      <p className="small muted">With linear playback and recording, valid takes at different sweep levels give similar RT60 at the same position: the level changes how far the room's decay rises above the background, not the decay itself. A higher level helps only while it adds usable decay without distortion, so the loudest is not automatically the best. Different positions differ for real and are averaged, not compared, here. Earlier takes are kept here, not overwritten.</p>
    </Card>
  );
}

/* ---------- the takes, one card each: swipe (or drag, or the arrows) from the current measurement to the others ---------- */
const TAKE_PILL: Record<string, [string, string, string?]> = { current: ['good', 'Current', 'seal'], 'in-use': ['good', 'In use', 'check'], superseded: ['neutral', 'Replaced'], invalid: ['critical', 'Not valid', 'x'], failed: ['critical', 'Not used', 'x'] };
const WHERE_NOTE: Record<string, string> = { 'in-use': "part of the room's values", superseded: 'replaced by a later valid take at this position', invalid: "not part of the room's values", failed: "not part of the room's values" };
interface Slide { row: TakeRow; result: any }

// The full record of a take that has its analysis (a valid take, or the latest one that was not valid).
function recordRows(p: Project, res: any, current: boolean): KvRow[] {
  const meta = res.meta || {}, lv = meta.levels || {}, plan = meta.plan || {}, ref = res.bands.find((b: any) => b.f === res.referenceBand) || {};
  const pos = DEMO.POSITIONS.find((x: any) => x.id === (meta.position || p.setup.position)) || DEMO.POSITIONS[0];
  const kind = meta.deviceKind && DEMO.DEVICE_KINDS[meta.deviceKind], direct = am.analysis.CRITERIA.decay.directAllowanceDb;
  const s = D.positions(p), room = D.room(p) as any, hist = p.processing.history || [];
  return [
    ['Recorded', fmt.when(res.takenAt)],
    ['Measuring device', <>{kind ? kind.name : 'This device'}<KvNote>its own speaker and microphone</KvNote></>],
    ['Position', `${pos.id} · ${pos.name}`],
    current ? ['Positions measured', `${s.count} of at least ${s.required}${s.count && room ? `: ${room.positions.map((x: any) => x.id).join(', ')}` : ''}`] : null,
    ['Test signal', plan.f1 ? `Sine sweep ${plan.f1} Hz–${(plan.f2 / 1000).toFixed(plan.f2 % 1000 ? 1 : 0)} kHz, ${plan.seconds} s` : '—'],
    ['Sweep level', <>{ui.levelDb(plan.levelDb)}<KvNote>relative to the app's default sweep; not sound pressure</KvNote></>],
    ['Distortion', <>{ui.distortionText(meta.distortion)}<KvNote>harmonics against the main response, from the sweep</KvNote></>],
    ['Sound output', outputOf(meta)],
    ['Microphone', <>{meta.deviceLabel || '—'}<KvNote>{`${meta.sampleRate ? `${meta.sampleRate / 1000} kHz · ` : ''}uncalibrated${meta.config && meta.config.browser ? ` · ${meta.config.browser}` : ''}`}</KvNote></>],
    ['Browser processing', <>{processingOf(meta)}<KvNote>all three were requested off; one the browser does not report is unknown, not off</KvNote></>],
    ['Recording continuity', continuityOf(meta)],
    ['Input level during the sweep', meta.sweepGainDb != null ? <>{Math.abs(meta.sweepGainDb) < 1 ? 'Steady' : `${meta.sweepGainDb > 0 ? '+' : '−'}${Math.abs(meta.sweepGainDb).toFixed(1)} dB`}<KvNote>{`the background above the sweep against before it (${meta.sweepGainDb > 0 ? '+' : meta.sweepGainDb < 0 ? '−' : ''}${Math.abs(meta.sweepGainDb).toFixed(1)} dB); a device turning its input down shows here`}</KvNote></> : 'Not checked with this take'],
    ['Arrival delay', meta.latencySec != null ? <>{`${Math.round(meta.latencySec * 1000)} ms`}<KvNote>from playing to recording, read from the recording</KvNote></> : '—'],
    ['Direct sound', ref.headDb != null ? <>{`${ref.headDb.toFixed(1)} dB above the room's decay at ${fmt.hz(ref.f)}`}<KvNote>{ref.headDb > direct ? `evaluation moved ${(ref.headDb - direct).toFixed(1)} dB lower, below it` : 'no dominant direct sound: standard evaluation'}</KvNote></> : '—'],
    ['Background before the signal', ui.dbfs(lv.preRollDbfs)],
    ['Signal above background', lv.snrDb != null ? `${lv.snrDb.toFixed(1)} dB` : '—'],
    ['Analysis', 'Sweep deconvolution · octave filters · direct sound separated · recording background noise found (Lundeby) · Schroeder integration'],
    current ? ['Earlier takes', hist.length ? `${hist.length} replaced by a newer valid take at the same position (superseded)` : 'None'] : null,
  ];
}

function TakeCard({ p, slide, current }: { p: Project; slide: Slide; current: boolean }) {
  const { row, result } = slide, meta = result ? result.meta || {} : {}, valid = row.status === 'current' || row.status === 'in-use';
  const pos = DEMO.POSITIONS.find((x: any) => x.id === (row.position || meta.position)) || null;
  const kind = meta.deviceKind && DEMO.DEVICE_KINDS[meta.deviceKind];
  const s = D.positions(p), hist = p.processing.history || [], [tone, word, ic] = TAKE_PILL[row.status] || TAKE_PILL.superseded;
  const f = fmt.hz(DEMO.REFERENCE_BAND);
  return (
    <Card icon="doc" title={current ? `Latest take · ${pos ? pos.id : ''}` : `Take · ${pos ? pos.id : '—'}`} sub={current ? 'Where, with what and when it was recorded' : undefined} right={<Pill tone={tone} text={word} icon={ic} />} cls="card-record">
      <ul className="take-sum">
        <li><Icon name="pin" size={16} sw={2} /><span><b>{pos ? `${pos.id} · ${pos.name}` : 'Position not recorded'}</b><small>{current ? `${s.count} of at least ${s.required} positions measured` : WHERE_NOTE[row.status] || ''}</small></span></li>
        {result ? <li><Icon name={meta.deviceKind === 'mobile' ? 'phone' : 'laptop'} size={16} sw={2} /><span><b>{kind ? kind.name : 'This device'}</b><small>its own speaker and microphone</small></span></li> : null}
        <li><Icon name="history" size={16} sw={2} /><span><b>{fmt.when(row.takenAt)}</b><small>{current ? (hist.length ? `${hist.length} earlier take${hist.length > 1 ? 's' : ''} at this position replaced` : 'the latest valid take') : `sweep level ${ui.levelDb(row.levelDb)}`}</small></span></li>
      </ul>
      {row.rt60 != null ? (
        <div className="take-figs">
          <div className="take-fig"><span className="label">{`Average, ${RA.SHORT}`}</span><b>{row.average != null && row.averageBands === RA.SHORT ? fmt.s(row.average) : '—'}</b></div>
          <div className="take-fig"><span className="label">{`At ${f}`}</span><b>{fmt.s(row.rt60)}</b>{row.method ? <small>{row.method}</small> : null}</div>
        </div>
      ) : null}
      {valid && result ? <TakeChecks meta={meta} snrDb={(meta.levels || {}).snrDb} /> : null}
      {row.status === 'invalid' || row.status === 'failed' ? <Note tone="critical"><b>{row.status === 'failed' ? 'This take could not be analysed.' : 'This take gave no RT60.'}</b>{` ${row.reason || ''}`}</Note> : null}
      {current ? <p className="small muted">Measured with this device's own speaker and microphone, which are not calibrated: not a laboratory-grade measurement.</p> : null}
      {result ? (
        <Details id={current ? 'results-record' : `results-take-${row.takenAt}`} summary="Show all recording details">
          <Kv rows={recordRows(p, result, current)} />
          {current ? <>
            <p className="small muted">A browser-based measurement with the device's built-in speaker and microphone. RT60 comes from the room's measured decay; the microphone and speaker are not calibrated and no correction for them is applied, so this is not a calibrated or laboratory-grade measurement.</p>
            <div className="row-actions"><Btn action="copyDiagnostics" size="sm" icon="copy">Copy diagnostics</Btn><span className="small muted">The technical record of the latest take and the room's values per position, to send if a device measures oddly: no audio, no names, no device labels.</span></div>
          </> : null}
        </Details>
      ) : row.status === 'superseded' ? (
        <Details id={`results-take-${row.takenAt}`} summary="Show the details kept for this take">
          <Kv rows={[
            ['Sweep level', ui.levelDb(row.levelDb)],
            [`Usable decay at ${f}`, row.decayDb != null ? `${Math.round(row.decayDb)} dB` : '—'],
            ['T20 / T30', `${row.t20 != null ? fmt.s(row.t20) : '—'} / ${row.t30 != null ? fmt.s(row.t30) : '—'}`],
            ['r²', row.r2 != null ? row.r2.toFixed(4) : '—'],
            ['Bands with a value', row.bandsValid != null ? `${row.bandsValid} of ${row.bandsTotal}` : '—'],
            ['Distortion', row.distortion ? ui.distortionText(row.distortion) : '—'],
          ]} />
          <p className="small muted">A replaced take keeps these figures; its recording details are not kept.</p>
        </Details>
      ) : null}
    </Card>
  );
}

export function TakeDeck({ p }: { p: Project }) {
  const { rows } = D.takeComparison(p);
  const byPosition = (D as unknown as { positionResults(p: Project): { id: string; result: any }[] }).positionResults(p), att = p.processing.attempt as any;
  const resultOf = (r: TakeRow) => (r.status === 'current' || r.status === 'in-use' ? (byPosition.find(e => e.result.takenAt === r.takenAt) || { result: null }).result
    : r.status === 'invalid' && att && att.takenAt === r.takenAt ? att.result : null);
  const all: Slide[] = rows.map(row => ({ row, result: resultOf(row) }));
  const cur = all.find(x => x.row.status === 'current');
  const slides = cur ? [cur, ...all.filter(x => x !== cur)] : all; // the current measurement first, then every other take, newest first
  const n = slides.length;
  const ref = useRef<HTMLDivElement>(null), drag = useRef<{ x: number; left: number; moved: boolean } | null>(null);
  const [at, setAt] = useState(0);
  // The deck is as tall as the card on show (and follows it when its details open), so nothing floats below a short card.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const slide = el.children[at] as HTMLElement | undefined;
    if (n < 2 || !slide || typeof ResizeObserver === 'undefined') { el.style.height = ''; return; }
    const fit = () => { el.style.height = `${slide.offsetHeight}px`; };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(slide);
    return () => ro.disconnect();
  }, [at, n]);
  if (!n) return null;
  const offsetOf = (i: number) => { const el = ref.current; if (!el) return 0; const c = el.children[i] as HTMLElement | undefined, f0 = el.children[0] as HTMLElement | undefined; return c && f0 ? c.offsetLeft - f0.offsetLeft : 0; };
  const nearest = () => { const el = ref.current; if (!el) return 0; let best = 0; for (let i = 0; i < n; i++) if (Math.abs(offsetOf(i) - el.scrollLeft) < Math.abs(offsetOf(best) - el.scrollLeft)) best = i; return best; };
  const go = (i: number) => { const el = ref.current, k = Math.max(0, Math.min(n - 1, i)); if (el) el.scrollTo({ left: offsetOf(k), behavior: 'smooth' }); setAt(k); };
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'mouse' || e.button !== 0 || n < 2 || (e.target as Element).closest('button, a, input, select, summary')) return;
    drag.current = { x: e.clientX, left: ref.current ? ref.current.scrollLeft : 0, moved: false };
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current, el = ref.current;
    if (!d || !el) return;
    const dx = e.clientX - d.x;
    if (!d.moved && Math.abs(dx) < 6) return;
    if (!d.moved) { d.moved = true; el.classList.add('is-dragging'); el.setPointerCapture(e.pointerId); }
    el.scrollLeft = d.left - dx;
  };
  const onPointerUp = () => {
    const d = drag.current, el = ref.current;
    drag.current = null;
    if (!d || !d.moved || !el) return;
    el.classList.remove('is-dragging');
    const moved = el.scrollLeft - d.left; // a short flick is enough to turn to the next card
    go(Math.abs(moved) > el.clientWidth * 0.18 ? at + Math.sign(moved) : nearest());
  };
  return (
    <div className="take-deck-wrap">
      {n > 1 ? (
        <div className="deck-bar">
          <span className="label">Takes in this project</span>
          <span className="deck-count">{`${at + 1} of ${n}`}</span>
          <button type="button" className="deck-btn" onClick={() => go(at - 1)} disabled={at <= 0} aria-label="Previous take"><Icon name="chevL" size={16} sw={2.2} /></button>
          <button type="button" className="deck-btn" onClick={() => go(at + 1)} disabled={at >= n - 1} aria-label="Next take"><Icon name="chevR" size={16} sw={2.2} /></button>
        </div>
      ) : null}
      <div ref={ref} className={n > 1 ? 'take-deck is-swipe' : 'take-deck'} role="group" aria-roledescription="carousel" aria-label="Takes in this project" tabIndex={n > 1 ? 0 : undefined}
        onScroll={() => { if (!drag.current) { const k = nearest(); if (k !== at) setAt(k); } }}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
        onKeyDown={e => { if (e.target !== e.currentTarget) return; if (e.key === 'ArrowRight') { e.preventDefault(); go(at + 1); } else if (e.key === 'ArrowLeft') { e.preventDefault(); go(at - 1); } }}>
        {slides.map((x, i) => (
          <div className="take-slide" key={x.row.takenAt + x.row.status} role="group" aria-roledescription="slide" aria-label={`Take ${i + 1} of ${n}`}>
            <TakeCard p={p} slide={x} current={x.row.status === 'current'} />
          </div>
        ))}
      </div>
      {n > 1 ? (
        <div className="deck-dots">
          {slides.map((x, i) => <button type="button" key={i} aria-label={`Take ${i + 1}: ${(TAKE_PILL[x.row.status] || TAKE_PILL.superseded)[1]}`} aria-current={i === at ? 'true' : undefined} onClick={() => go(i)} />)}
        </div>
      ) : <p className="small muted deck-one">Each new take is added here as its own card, to swipe through.</p>}
    </div>
  );
}

const POS: Record<string, [string, string, string?]> = { valid: ['good', 'Used', 'check'], waiting: ['neutral', 'Not processed'], invalid: ['critical', 'Not valid', 'x'], failed: ['critical', 'Not used', 'x'] };

export function ResultsScreen({ ctx }: { ctx: Ctx }) {
  const p = ctx.project, res = D.measured(p) as any, room = D.room(p) as any;
  if (!res || !room) return <Note tone="warn">There is no valid measurement yet. Go back to Processing.</Note>;
  const ref = res.bands.find((b: any) => b.f === res.referenceBand);
  const sel = res.bands.find((b: any) => b.f === ctx.state.ui.band && b.curve) || ref;
  const change = D.noiseChange(p);
  const s = D.positions(p), pol = D.policy(p), here = D.positionOf(res);
  // Two averages side by side: over the bands the room's criterion sets (what the target is checked on), and over all bands.
  const avg = D.averageRT60(p), sm = D.summaryRT60(p), rh = room.headline;
  const where = `${s.count} position${s.count > 1 ? 's' : ''}`;
  const nx = s.next ? s.rows.find(r => r.id === s.next) : null;
  const used: string[] = room.positions.map((x: any) => x.id);
  const fit = sel.fit, mult = sel.path ? PROC.FACTOR[sel.path] : null, groups = D.soundGroups(p) || [];
  const direct = am.analysis.CRITERIA.decay.directAllowanceDb;
  const unreliable = room.bands.filter((b: any) => b.rt60 == null);
  const partialBands = room.bands.filter((b: any) => b.n < b.of && b.n > 0);
  const later = D.laterTakes(p);

  const hero = (
    <section className="card hero-card is-measured-card">
      <header className="card-h"><span className="label">{`Measured RT60 · average over ${where}`}</span><Tag kind="measured" /></header>
      <div className="hero-two">
        <div className="h2"><span className="h2-k">{pol.label}</span><HeroValue a={sm} cls="hero-v" watch="summary-headline" /><span className="h2-s">{sm.available ? `What the target is checked on · ${bandsNote(sm).toLowerCase()}` : 'Not available'}</span></div>
        <div className="h2"><span className="h2-k">{`All bands, ${RA.SHORT}`}</span><HeroValue a={avg} cls="hero-v hero-v2" watch="avg-headline" /><span className="h2-s">{bandsNote(avg)}</span></div>
      </div>
      <div className="hero-pills">
        <Pill tone={s.complete ? 'good' : 'warn'} text={`${s.count} of ${s.required} positions${s.complete ? '' : ' · incomplete'}`} icon={s.complete ? 'seal' : 'pin'} />
        {sm.available ? null : <Pill tone="warn" text="No summary" icon="alert" />}
        {room.status === 'warning' ? <Pill tone="warn" text="With warnings" icon="alert" /> : <Pill tone="good" text="Valid" icon="seal" />}
        <Pill tone="neutral" text={`${rh.quality} · ${rh.confidence.toLowerCase()} confidence at ${fmt.hzShort(rh.f)} Hz`} />
      </div>
      <p className="small muted">{sm.available
        ? `The first covers the bands this room's target is set for (${pol.criterion || "the app's default"}), and is compared with it in the next step${sm.partial ? `; ${sm.missing.map(x => fmt.hz(x.f)).join(' and ')} could not be measured at any position, so ${sm.missing.length > 1 ? 'they are' : 'it is'} left out` : ''}. The second covers every band. Each is the average of the positions, band by band; each position's own values are below.`
        : `${sm.reason || ''} Without it the room cannot be assessed against its target. Each is the average of the positions, band by band; each position's own values are below.`}</p>
    </section>
  );


  return (
    <>
      {s.complete ? null : (
        <Note tone="warn" icon="pin">
          <b>{`Measured at ${s.count} of ${s.required} positions.`}</b>{` The room needs at least ${s.required} valid positions. The values here rest on ${s.count === 1 ? 'one position only' : `${s.count} positions`}. Next: ${nx ? `${nx.id}, ${nx.name.toLowerCase()}` : 'another position'}.`}
          <NoteActions><Btn action="nextPosition" variant="primary" size="sm" icon="pin">{`Measure position ${s.next || ''}`}</Btn></NoteActions>
        </Note>
      )}
      <div className="grid split">
        <div className="stack">
          {hero}
          {/* Newer takes that are not this measurement: said next to the values they did not replace. */}
          {later.map((k, i) => (k.kind === 'unprocessed'
            ? <Note tone="warn" key={i}><b>{`A newer take, recorded ${fmt.when(k.takenAt)}, has not been processed yet.`}</b>{` The values here are from the takes processed so far (latest ${fmt.when(res.takenAt)}). `}<Btn action="processLatest" size="sm">Process it</Btn></Note>
            : <Note tone="warn" key={i}><b>{`Your latest take (${fmt.when(k.takenAt)}) gave no value${k.kind === 'failed' ? ': it could not be analysed' : ''}.`}</b>{` ${k.reason || ''} Shown: the valid takes, the latest from ${fmt.when(res.takenAt)}.`}</Note>))}
          {change != null ? <Note tone="warn"><b>The background has changed.</b>{` The latest noise measurement is ${Math.abs(change)} dB ${change > 0 ? 'louder' : 'quieter'} than when this RT60 was measured. Measure again to confirm it.`}</Note> : null}
          {room.warnings && room.warnings.length ? <Note tone="warn"><b>Measured with warnings.</b>{` ${sameWarningsOnce(room.warnings).join(' ')}`}</Note> : null}
          <Card icon="bars" title="How long sound rings in this room" right={<Tag kind="measured" />}>
            <SoundTiles groups={groups} />
            <Details id="results-bands">
              <TechH title={`RT60 by octave band, average over ${where}`} />
              <Chart type="bands" spec={{ series: [{ label: 'Measured RT60', kind: 'measured', values: room.bands.map((b: any) => b.rt60) }], unit: 's', label: room.referenceBand, height: 240, yTitle: 'RT60 (s)', aria: 'Measured RT60 by octave band, averaged over the positions', missingText: 'not reliable' }} height={240} />
              <AverageSummary avg={avg} />
              {unreliable.length ? <><p className="small muted">Bands without a value could not be measured reliably at any position:</p><ul className="bullets small">{unreliable.map((b: any) => <li key={b.f}><b>{`${fmt.hz(b.f)}:`}</b>{` ${b.reason || 'Not reliable'}`}</li>)}</ul></> : null}
            </Details>
          </Card>
          <Card icon="pin" title={`Measured at ${where}`} right={<Tag kind="measured" />} sub={`The room's values are the average of the valid positions, band by band. At least ${s.required} are needed.`}>
            <TableWrap>
              <table className="tbl">
                <thead><tr><th>Position</th><th className="r">{pol.short}</th><th className="r">All bands</th><th>Status</th></tr></thead>
                <tbody>
                  {s.rows.filter(r => r.status !== 'not-measured').map(r => {
                    const pr = r.result, a = pr ? RA.ofBands(pr, pol.primary) : null, all = pr ? RA.of(pr) : null, w = POS[r.status];
                    return (
                      <tr className={pr && pr.recordingId === res.recordingId ? 'is-ref' : undefined} key={r.id}>
                        <td><b>{r.id}</b>{' '}<span className="muted">{r.name}</span></td>
                        <td className="r">{a && a.available ? fmt.s(a.value) : '—'}</td><td className="r">{all && all.available ? fmt.s(all.value) : '—'}</td>
                        <td>{w ? <Pill tone={w[0]} text={w[1]} icon={w[2]} /> : <Pill tone="neutral" text="Not measured" />}{r.issue ? <KvNote>{r.issue.reason || ''}</KvNote> : null}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableWrap>
            <Details id="results-positions">
              <TechH title="RT60 by band and position" note="The room's value is the mean of the positions with a reliable value in that band (arithmetic mean, ISO 3382-2 spatial averaging); spread is the longest minus the shortest." />
              <TableWrap>
                <table className="tbl">
                  <thead><tr><th>Band</th>{used.map(id => <th className="r" key={id}>{id}</th>)}<th className="r">Room</th><th className="r">Positions</th><th className="r">Spread</th><th>Method</th><th>Quality</th></tr></thead>
                  <tbody>
                    {room.bands.map((b: any) => (
                      <tr className={b.f === room.referenceBand ? 'is-ref' : undefined} key={b.f}>
                        <td>{fmt.hz(b.f)}</td>
                        {b.values.map((v: any, i: number) => <td className="r" key={i}>{v.rt60 != null ? fmt.s(v.rt60) : <NotReliable reason={v.reason} text="—" />}</td>)}
                        <td className="r">{b.rt60 != null ? <b>{fmt.s(b.rt60)}</b> : <NotReliable reason={b.reason} />}</td><td className="r">{`${b.n} of ${b.of}`}</td>
                        <td className="r">{b.spread != null ? fmt.s(b.spread) : '—'}</td><td>{b.path || '—'}</td><td><Pill tone={ui.tone[b.quality] || 'neutral'} text={b.quality} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
              {partialBands.length ? <p className="small muted">{partialBands.map((b: any) => `${fmt.hz(b.f)}: ${b.notes[0] || ''}`).join(' ')}</p> : null}
            </Details>
          </Card>
          <Card icon="seal" title="Can you trust this measurement?">
            <MeasureCheck groups={groups} />
            <Details id="results-decay">
              <TechH title={`Latest take (${here}): decay curve at ${fmt.hz(sel.f)}`} note="The band-filtered impulse response and its backward-integrated decay." />
              <div className="chips">
                {res.bands.map((b: any) => <button type="button" className="chip" key={b.f} data-action="band" data-value={String(b.f)} aria-pressed={b.f === sel.f} disabled={b.curve ? undefined : true} title={b.rt60 == null ? b.reason || 'Not reliable' : ''}>{fmt.hz(b.f)}</button>)}
              </div>
              <Chart type="decay" spec={{ curve: sel.curve, noiseDb: sel.noiseFloorDb, fit: fit || null, path: sel.path, rt: sel.rt60, f: sel.f, crossSec: sel.crossSec }} height={290} />
              <Legend items={[['line', 'Decay curve (backward-integrated)'], ['faint', 'Band energy'], ['eval', `${sel.path || 'Evaluation'} range`], ['dash', 'Fit, extended over 60 dB of decay'], ['dash-muted', 'Recording background noise']]} />
              <p className="chart-caption">{fit && sel.rt60 != null
                ? <>{`${sel.path} at ${fmt.hz(sel.f)}: the fitted decay falls from −${+Math.abs(fit.from).toFixed(1)} dB at ${fit.t1.toFixed(2)} s to −${+Math.abs(fit.to).toFixed(1)} dB at ${fit.t2.toFixed(2)} s. ${(fit.t2 - fit.t1).toFixed(3)} s × ${mult} = `}<b>{fmt.s(sel.rt60)}</b>{` (r² ${fit.r2.toFixed(4)}).${sel.headDb > direct ? ` The device's direct sound lies ${sel.headDb.toFixed(1)} dB above the start of the room's decay here, so the range starts below it.` : ''}`}</>
                : `No RT60 at ${fmt.hz(sel.f)}: ${sel.reason || 'not enough usable decay'}`}</p>
              <TechH title={`Latest take (${here}) band by band`} />
              <TableWrap>
                <table className="tbl">
                  <thead><tr><th>Band</th><th className="r">T20</th><th className="r">T30</th><th className="r">RT60</th><th>Method</th><th className="r">Usable decay</th><th>Quality</th></tr></thead>
                  <tbody>
                    {res.bands.map((b: any) => (
                      <tr className={b.f === res.referenceBand ? 'is-ref' : undefined} key={b.f}>
                        <td>{fmt.hz(b.f)}</td><td className="r">{b.t20 != null ? fmt.s(b.t20) : '—'}</td><td className="r">{b.t30 != null ? fmt.s(b.t30) : '—'}</td>
                        <td className="r">{b.rt60 != null ? <b>{fmt.s(b.rt60)}</b> : <NotReliable reason={b.reason} />}</td>
                        <td>{b.path || '—'}</td><td className="r">{b.decayRangeDb != null ? `${Math.round(b.decayRangeDb)} dB` : '—'}</td><td><Pill tone={ui.tone[b.quality] || 'neutral'} text={b.quality} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            </Details>
          </Card>
        </div>
        <TakeDeck p={p} />
      </div>
      <Comparison p={p} />
    </>
  );
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export function resultsPrimary(ctx: Ctx): PrimaryAction | null {
  const p = ctx.project;
  if (!D.measured(p) || !D.room(p)) return null;
  const s = D.positions(p);
  return s.complete ? null : { label: `Measure position ${s.next}`, action: 'nextPosition' };
}

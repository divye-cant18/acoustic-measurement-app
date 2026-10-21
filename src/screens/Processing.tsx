/* Step 5 · Measurement Processing — is the recorded decay trustworthy, which calculation is valid, then RT60.
   AM.services.processing validates the latest take (js/stages/processing.js runs it and stores the outcome). Invalid data
   never becomes an RT60. Until at least two positions are measured the step leads to the next one. */
import type { ReactNode } from 'react';
import { am, D, DEMO, fmt, LIVE, PROC, RA, stageModel, ui } from '../lib';
import type { Ctx, PrimaryAction, Project, Result } from '../am';
import { Btn, Card, Icon, Kv, Note, NoteActions, NotReliable, Pill, Spin, TableWrap } from '../ui/kit';
import { AverageSummary } from '../ui/blocks';

/* eslint-disable @typescript-eslint/no-explicit-any */
interface ProcessingModel { outcome(p: Project, rec: any): Result | null; job(): { i: number } | null }
const M = () => stageModel<ProcessingModel>('processing');
const PROC_CURVATURE = (): number => (am as any).analysis.CRITERIA.decay.curvature;

/* The reported value is T20 (ISO 3382-2's preferred range); where 45 dB of decay is usable, T30 is worked out as well,
   as a check that the decay is one straight line (curvature C = T30/T20 − 1). */
function Cascade({ band }: { band: any }) {
  // Ranges are counted from the start of the room's decay (below the device's direct sound, when that is strong).
  if (band.decayRangeDb == null) return <ol className="cascade"><li className="cq is-fail"><span className="cq-q">No usable decay</span><span className="cq-need">{band.reason || 'Not measured'}</span><span className="cq-a">Stop</span></li></ol>;
  // Sounds during the take (voices, knocks) count as background: the usable decay is what lies above them as well.
  const dist = band.disturbanceDb || 0, has = band.decayRangeDb - dist;
  const hasText = dist ? `has ${Math.round(has)} dB (${Math.round(band.decayRangeDb)} dB less ${Math.round(dist)} dB of sounds during the take)` : `has ${Math.round(has)} dB`;
  const yes = band.path === 'T20', C = band.curvature, lim = PROC_CURVATURE();
  const checkText = band.t30 == null ? 'Not available: the confidence stays medium'
    : `T30 ${fmt.s(band.t30)}, ${C == null ? '' : `${C > 0 ? '+' : C < 0 ? '−' : ''}${Math.abs(C)} % from T20: `}${C != null && Math.abs(C) <= lim ? 'the decay is one straight line' : 'the decay is curved (see the notes)'}`;
  return (
    <ol className="cascade">
      <li className={`cq ${yes ? 'is-yes' : 'is-no'}`}>
        <span className="cq-q">Enough decay for T20?</span><span className="cq-need">{`Needs ${PROC.REQUIRED.T20} dB, ${hasText}`}</span><span className="cq-a">{yes ? 'Yes' : 'No'}</span>
        {yes ? <span className="cq-calc">{`RT60 = T20, fitted from 5 to 25 dB below the start of the room's decay, extrapolated to 60 dB: ${fmt.s(band.rt60)}${band.r2 != null ? ` (r² ${band.r2.toFixed(4)})` : ''}`}</span> : null}
      </li>
      {yes ? (
        <li className={`cq ${band.t30 != null ? 'is-yes' : 'is-skipped'}`}>
          <span className="cq-q">Enough decay for the T30 check?</span><span className="cq-need">{`Needs ${PROC.REQUIRED.T30} dB, ${hasText}`}</span><span className="cq-a">{band.t30 != null ? 'Yes' : 'No'}</span>
          <span className="cq-calc">{checkText}</span>
        </li>
      ) : <li className="cq is-fail"><span className="cq-q">Measurement insufficient</span><span className="cq-need">{band.reason || 'Repeat or adjust the measurement'}</span><span className="cq-a">Stop</span></li>}
    </ol>
  );
}

const STATUS: Record<string, [string, string, string]> = { valid: ['good', 'Valid result', 'seal'], warning: ['warn', 'Valid, with warnings', 'alert'], invalid: ['critical', 'Not valid', 'x'] };

export function ProcessingScreen({ ctx }: { ctx: Ctx }) {
  const p = ctx.project, rec = p.measurement.recording as any, cur = D.measured(p) as any;
  if (!rec || rec.status !== 'captured') return <Note tone="warn">There is no recording to process. Go back to Acoustic Measurement.</Note>;
  const res = M().outcome(p, rec) as any, finished = !!res, job = M().job();
  const preview = res || PROC.evaluate(rec, { noise: p.setup.noise });
  const det: string[] = PROC.details(rec, preview);
  const [tone, text, ic] = finished ? STATUS[res.status] : ['acoustic', 'Processing', 'decay'];

  const steps = (PROC.STEPS as { id: string; label: string }[]).map((st, i) => {
    let state = finished ? 'done' : job ? (i < job.i ? 'done' : i === job.i ? 'running' : 'pending') : 'pending';
    if (finished && !res.valid) {
      if (st.id === 'path' || st.id === 'validate') state = 'failed';
      if (st.id === 'rt60') state = 'skipped';
    }
    const mark = state === 'done' ? <Icon name="check" size={13} sw={2.6} /> : state === 'running' ? <Spin /> : state === 'failed' ? <Icon name="x" size={13} sw={2.6} /> : state === 'skipped' ? '–' : null;
    const showDetail = state === 'done' || state === 'failed' || state === 'skipped';
    return <li className={`ps is-${state}`} key={st.id}><span className="ps-mark">{mark}</span><span className="ps-t">{st.label}</span>{showDetail ? <span className="ps-d">{det[i]}</span> : null}</li>;
  });

  // Where this take stands in the session: positions measured, and where to measure next.
  const s = D.positions(p), here = D.positionOf(rec), nx = s.next ? s.rows.find(r => r.id === s.next) : null;
  const noun = (DEMO.DEVICE_KINDS[LIVE.kindOf(p)] || {}).noun || 'device';
  let session: ReactNode = null;
  if (finished) {
    if (res.valid && s.complete) {
      session = <Note tone="good" icon="seal"><b>{`${here} measured. The room is now measured at ${s.count} positions`}</b>{` (at least ${s.required} are needed). Its values are the average over them, band by band; each position keeps its own.${nx ? ` You can add ${nx.id}, ${nx.name.toLowerCase()}, for a fuller picture: optional.` : ''}`}</Note>;
    } else if (res.valid && nx) {
      session = (
        <Note tone="info" icon="pin">
          <b>{`${here} measured: ${s.count} of ${s.required} positions.`}</b>{` Next: move the ${noun} to ${nx.id}, ${nx.name.toLowerCase()} (${nx.detail.toLowerCase()}), check the background there and measure.`}
          <NoteActions><Btn action="nextPosition" variant="primary" size="sm" icon="pin">{`Measure position ${nx.id}`}</Btn><Btn action="continue" size="sm">View results so far</Btn></NoteActions>
        </Note>
      );
    } else if (!res.valid) {
      const row = s.rows.find(r => r.id === here);
      session = <Note tone="warn"><b>{`Position ${here}: this take is not used.`}</b>{` ${row && row.result ? `The earlier valid take at ${here} is kept. ` : ''}Measure ${here} again, or move on to another position; a position without a valid take is not part of the room's values.`}</Note>;
    }
  }

  let after: ReactNode = null;
  if (finished) {
    const ref = res.bands.find((b: any) => b.f === res.referenceBand) || { f: res.referenceBand };
    const cell = (v: number | null) => (v != null ? fmt.s(v) : <span className="muted">—</span>);
    const notes: string[] = [...res.warnings, ...res.bands.flatMap((b: any) => (b.notes || []).map((n: string) => `${fmt.hz(b.f)}: ${n}`))];
    const curAvg = D.averageRT60(p), own = RA.of(res);
    const kept = cur && cur.recordingId !== rec.id ? ` The current measurement from ${fmt.when(cur.takenAt)} (average RT60, ${RA.SHORT}: ${curAvg.available ? fmt.s(curAvg.value) : 'not available'}; ${fmt.s(cur.headline.rt60)} at ${fmt.hz(cur.headline.f)}) stays in force.` : '';
    const reasons = res.bands.filter((b: any) => b.rt60 == null && b.reason);
    after = <>
      {!res.valid ? (
        <Note tone="critical"><b>Unable to obtain a reliable RT60 measurement.</b>{` ${res.reason || ''} RT60 is not calculated from data that cannot support it.${kept}`}
          <NoteActions><Btn action="repeat" variant="primary" size="sm" icon="refresh">Measure again</Btn></NoteActions></Note>
      ) : null}
      {res.valid && !own.available ? <Note tone="warn" icon="alert"><b>Valid, but with no average RT60.</b>{` ${own.reason || ''} The room is compared with its target by the average of the bands that were measured, and at least half of them are needed, so without it there is no assessment, treatment amount or prediction. Measuring again (a quieter room, or a higher sweep level) can give those bands enough usable decay.`}</Note> : null}
      {notes.length ? <Note tone="warn"><b>Warnings.</b><ul className="bullets">{notes.map((n, i) => <li key={i}>{n}</li>)}</ul></Note> : null}
      <div className="grid split">
        <Card icon="sliders" title={`Calculation path at ${fmt.hz(ref.f)}`} sub="The reference band decides whether the measurement is valid."><Cascade band={ref} /></Card>
        <Card icon="decay" title="Required usable decay">
          <Kv rows={[['T20 (20 dB × 3), the value', `${PROC.REQUIRED.T20} dB`], ['T30 (30 dB × 2), the check', `${PROC.REQUIRED.T30} dB`]]} />
          <p className="small muted">Each is the evaluation range plus a 5 dB start offset and a 10 dB margin above the recording background noise (ISO 3382). Usable decay is the room's own decay in each band: from where it starts, below the direct sound of the measuring device, down to the recording background noise.</p>
        </Card>
      </div>
      <Card icon="bars" title="Band by band">
        <TableWrap>
          <table className="tbl">
            <thead><tr><th>Band</th><th className="r">Direct sound</th><th className="r">Usable decay</th><th>Path</th><th className="r">T20</th><th className="r">T30</th><th className="r">RT60</th><th className="r">r²</th><th>Quality</th></tr></thead>
            <tbody>
              {res.bands.map((b: any) => (
                <tr className={b.f === res.referenceBand ? 'is-ref' : undefined} key={b.f}>
                  <td>{fmt.hz(b.f)}</td><td className="r">{b.headDb != null ? `${b.headDb.toFixed(1)} dB` : '—'}</td><td className="r">{b.decayRangeDb != null ? `${Math.round(b.decayRangeDb)} dB` : '—'}</td>
                  <td>{b.path || '—'}</td><td className="r">{cell(b.t20)}</td><td className="r">{cell(b.t30)}</td>
                  <td className="r">{b.rt60 != null ? <b>{fmt.s(b.rt60)}</b> : <NotReliable reason={b.reason} />}</td>
                  <td className="r">{b.r2 != null ? b.r2.toFixed(4) : '—'}</td>
                  <td><Pill tone={ui.tone[b.quality] || 'neutral'} text={b.quality} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
        <AverageSummary avg={own} />
        <p className="small muted">{`Direct sound: how far the device's direct sound and earliest reflections lie above the start of the room's decay in that band. Above ${am.analysis.CRITERIA.decay.directAllowanceDb} dB the evaluation moves below them, so it measures the room, not the device.`}</p>
        {reasons.length ? <ul className="bullets small">{reasons.map((b: any) => <li key={b.f}><b>{`${fmt.hz(b.f)}:`}</b>{` ${b.reason}`}</li>)}</ul> : null}
      </Card>
    </>;
  }

  return (
    <>
      {session}
      <div className="grid split">
        <Card icon="gauge" title="Processing steps" sub={`Take recorded ${fmt.when(rec.takenAt)}`} right={<Pill tone={tone} text={text} icon={ic} />}><ol className="psteps">{steps}</ol></Card>
        <Card icon="info" title="How a result is earned">
          <ol className="principle">
            <li><span><b>Is the decay trustworthy?</b>Separate the device's own direct sound from the room's decay, then find the recording background noise in each band and how much of the room's decay lies above it.</span></li>
            <li><span><b>Which calculation is valid?</b>T20 from at least 35 dB of usable decay, checked against T30 where 45 dB is usable.</span></li>
            <li><span><b>Calculate RT60.</b>Only from a valid path and a straight decay. Otherwise stop and measure again.</span></li>
          </ol>
          <Note tone="info">Every value comes from this take's recording. Where the recording cannot support a value, none is given.</Note>
        </Card>
      </div>
      {after}
    </>
  );
}

export function processingPrimary(ctx: Ctx): PrimaryAction | null {
  const p = ctx.project, rec = p.measurement.recording as any;
  if (!rec || rec.status !== 'captured') return null;
  const res = M().outcome(p, rec) as any;
  if (!res) return null;
  if (!res.valid) return D.measured(p) ? { label: 'Continue with the current measurement', action: 'continue' } : { label: 'Measure again', action: 'repeat' };
  const s = D.positions(p);
  return s.complete ? null : { label: `Measure position ${s.next}`, action: 'nextPosition' };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

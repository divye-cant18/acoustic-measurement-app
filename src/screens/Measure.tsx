/* Step 4 · Acoustic Measurement — a real take: this device plays the test sweep through its own speaker and records the
   room with its own microphone, then analyses it. Everything here reads AM.live and the project; the live parts (scope,
   level meter, progress) are drawn by js/stages/measure.js from real level reports. The room is measured at two or more
   positions (AM.derive.positions). */
import type { ReactNode } from 'react';
import { AN, am, D, DEMO, fmt, LIVE, MEAS, stageModel, ui } from '../lib';
import type { Ctx, PrimaryAction, Project } from '../am';
import { Btn, Card, Details, GuideThumb, Icon, Kv, KvNote, More, Note, Pill, Spin, Stepper } from '../ui/kit';
import { LevelMeter, MicLine } from '../ui/blocks';

/* eslint-disable @typescript-eslint/no-explicit-any */
interface MeasureModel {
  takeFor(p: Project): any; noiseRun(p: Project): boolean; evaluated(p: Project, rec: any): boolean; failedLatest(p: Project): boolean;
  startBlocker(p: Project, auto?: boolean): string | null; noiseElsewhere(p: Project): boolean; needsNoise(p: Project): boolean; screenState(p: Project): string; curPlan(): any; primaryFor(p: Project): PrimaryAction | null;
}
const M = () => stageModel<MeasureModel>('measure');

const HEAD: Record<string, [string, string, string, string]> = {
  mic: ['Microphone needed', 'Connect the microphone to measure. Its status is shown below.', 'neutral', 'Not connected'],
  'not-measured': ['Ready to measure', 'Press Start measurement. It checks the background noise first, then plays the test sound.', 'neutral', 'Ready'],
  'noise-elsewhere': ['Check the background here', 'This is a new position: check the background noise here first, then start the measurement.', 'neutral', 'Not measured here'],
  'noise-invalid': ['Background not usable', 'The last background measurement could not be used: the reason is shown below. Measure it again.', 'critical', 'Noise not usable'],
  'measuring-noise': ['Measuring the background', 'Keep the room quiet. The level is read from the microphone.', 'acoustic', 'Measuring'],
  'auto-noise': ['Checking the background first', 'Keep the room quiet. The test sound follows by itself in a few seconds.', 'acoustic', 'Checking'],
  analysing: ['Working out the result', 'Checking the recording and calculating RT60. A few seconds.', 'acoustic', 'Analysing'],
  'all-done': ['Measuring done', 'Enough positions are measured. Press See results, or measure another position if you like.', 'good', 'Done'],
  'ready-for-rt60': ['Ready to measure', 'Start the take. This device plays the test sweep through its speaker and records the room with its microphone.', 'good', 'Ready'],
  'measuring-rt60': ['Measuring', 'Recording the room. Stay still and silent until the take is complete.', 'live', 'Recording'],
  processing: ['Analysing the recording', 'Recovering the impulse response and the decay in each band.', 'acoustic', 'Analysing'],
  captured: ['Take recorded', 'Process it to check the decay and calculate RT60.', 'good', 'Recorded'],
  failed: ['Take could not be used', 'See the reason below, fix it and measure again.', 'critical', 'Failed'],
};

const LiveRow = ({ k, children }: { k: string; children: ReactNode }) => <div className="live-r"><span className="live-k">{k}</span>{children}</div>;

function MicRow({ p }: { p: Project }) {
  const mic = LIVE.state.mic;
  const btn = mic.status === 'suspended' ? <Btn action="resumeMic" size="sm" icon="play">Start microphone</Btn>
    : ['error', 'stopped', 'off', 'muted'].includes(mic.status) ? <Btn action="reconnectMic" size="sm" icon="refresh">{mic.status === 'off' ? 'Connect microphone' : 'Try again'}</Btn> : null;
  const help = mic.status === 'error' && mic.code ? <span className="small muted">{ui.accessHelp(mic.code) || mic.message || ''}</span> : mic.status === 'stopped' ? <span className="small muted">Check the connection, then try again.</span> : null;
  return <LiveRow k="Microphone"><span className="live-v"><MicLine mic={mic} setup={p.setup} /></span>{help}{btn ? <div>{btn}</div> : null}</LiveRow>;
}

/* The sweep level for the next take: − / + in steps, reset, and what it means. Only the played copy is scaled. */
function LevelControl({ p, running }: { p: Project; running: boolean }) {
  const r = AN.levelRange(), lv = AN.sweepLevel(p.setup.sweepLevelDb), C = AN.CRITERIA.take;
  const peak = 20 * Math.log10(C.amplitude * AN.levelGain(lv)), base = 20 * Math.log10(C.amplitude);
  const [tone, word] = lv === 0 ? ['neutral', 'Default'] : lv > 0 ? ['acoustic', 'Above default'] : ['acoustic', 'Below default'];
  const limit = lv >= r.max ? 'This is the highest level. For more sound, turn up the device volume, carefully.'
    : lv <= r.min ? 'This is the lowest level. Use it only if louder distorts or rattles.' : '';
  return (
    <div className="sweep-level">
      <div className="sl-row">
        <span className="live-k" id="sl-label">Sweep level</span>
        <Stepper id="sweep-level" action="sweepLevel" value={lv} display={ui.levelDb(lv, false)} min={r.min} max={r.max} label="sweep level" disabled={running} />
        <Pill tone={tone} text={word} />
        {lv !== 0 ? <Btn action="sweepLevelReset" variant="ghost" size="sm" icon="refresh" disabled={running}>Reset to default</Btn> : null}
      </div>
      <p className="small muted">How loud the test sound plays. The default suits most rooms: raise it in a noisy room, lower it if the sound distorts or rattles.</p>
      {limit ? <p className="small muted">{limit}</p> : null}
      <More summary="Details"><p className="small muted">{`Relative to the app's default (0 dB: peak ${ui.dbfs(base)}; now ${ui.dbfs(peak)}). Not the room's noise level and not sound pressure: the device volume still decides how loud the room hears it. A higher level lifts the room's decay further above the background.`}</p></More>
    </div>
  );
}

const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
// Why the last background check could not be used, in plain words (the technical reason stays in Measurement Setup's details).
function attemptWords(a: { status: string; reasons: string[] }): string {
  const r = a.reasons[0] || '';
  if (/overload|full scale|clip/i.test(r)) return 'The last check was too loud for the microphone. Move away from the noise or turn the input level down, then check again.';
  return `The last check could not be used${r ? `: ${r}` : '.'}`;
}
function NoiseRow({ p }: { p: Project }) {
  const n = p.setup.noise, a = p.setup.noiseAttempt, run = M().noiseRun(p), busy = !!(LIVE.state.take || LIVE.state.noise);
  const change = D.noiseChange(p);
  return (
    <LiveRow k="Background noise">
      <span className="live-v">{run ? <><Spin />Checking the background…</> : n ? `${cap(ui.noiseWord(n.status))} · checked ${ui.timeOf(n.takenAt)}${n.position ? ` at ${n.position}` : ''}` : 'Not checked yet'}</span>
      {a ? <span className="small tone-critical">{`${attemptWords(a)}${n ? ' The earlier check still counts.' : ''}`}</span> : null}
      {change != null ? <span className="small tone-warn">{`${Math.abs(change)} dB ${change > 0 ? 'louder' : 'quieter'} than during the current RT60 measurement. Measure again to confirm it.`}</span> : null}
      {M().noiseElsewhere(p) && n ? <span className="small tone-warn">{`Checked at ${n.position}. Start measurement checks it again here first.`}</span> : null}
      <div className="hstack">{run ? <Btn action="cancelNoise" variant="ghost" size="sm" icon="x">Cancel</Btn>
        : <Btn action="measureNoise" size="sm" icon={n ? 'refresh' : 'gauge'} disabled={busy || LIVE.state.mic.status !== 'live'}>{!n ? 'Check background' : M().noiseElsewhere(p) ? 'Check here' : 'Check again'}</Btn>}</div>
    </LiveRow>
  );
}

/* The positions of the session: which are measured, the one selected for the next take, and what is still needed.
   ISO 3382-2 (4.3.1) prefers positions at least 2 m apart and 1 m from walls: the plan's distances are checked. */
function PositionsCard({ p, busy }: { p: Project; busy: boolean }) {
  const s = D.positions(p), g = D.geometry(p);
  const word: Record<string, [string, string, string?]> = { valid: ['good', 'Measured', 'check'], waiting: ['neutral', 'Recorded, not processed'], invalid: ['critical', 'Not valid', 'x'], failed: ['critical', 'Not used', 'x'] };
  const close: string[] = [];
  if (g) {
    const P: { id: string; x: number; y: number }[] = DEMO.POSITIONS, used = s.rows.filter(r => r.status === 'valid' || r.current).map(r => P.find(x => x.id === r.id)!);
    for (let i = 0; i < used.length; i++) for (let j = i + 1; j < used.length; j++) {
      const d = Math.hypot((used[i].x - used[j].x) * g.L, (used[i].y - used[j].y) * g.W);
      if (d < 2) close.push(`${used[i].id} and ${used[j].id} (${d.toFixed(1)} m)`);
    }
  }
  const head = s.complete ? `${s.count} positions measured: the session is complete${s.next ? `. ${s.next} can be added (optional)` : ''}.` : `${s.count} of ${s.required} positions measured: ${s.need} more needed.`;
  return (
    <Card icon="pin" title="Measuring positions" sub={head} cls="card-positions"
      right={<Pill tone={s.complete ? 'good' : 'acoustic'} text={s.complete ? `${s.count} positions` : `${s.count} of ${s.required}`} icon={s.complete ? 'seal' : 'pin'} />}>
      <ol className="pos-list">
        {s.rows.map(r => {
          const w = word[r.status];
          const st = w ? <Pill tone={w[0]} text={w[1]} icon={w[2]} /> : r.id === s.next && !s.complete ? <Pill tone="acoustic" text="Needed next" icon="pin" /> : <Pill tone="neutral" text={s.complete ? 'Optional' : 'Needed'} />;
          const what = r.result ? `${fmt.s(r.result.headline.rt60)} at ${fmt.hz(r.result.headline.f)} · ${fmt.when(r.result.takenAt)}${r.issue ? ` · latest retry ${r.issue.kind === 'failed' ? 'not used' : 'not valid'}, the valid take is kept` : ''}`
            : r.issue ? `${r.issue.kind === 'failed' ? 'Take not used' : 'Take not valid'}: ${r.issue.reason || 'see Processing'}` : r.detail;
          const act = busy ? null : r.current ? <span className="small muted"><Icon name="pin" size={13} sw={2} /> Selected for the next take</span>
            : <Btn action="usePosition" value={r.id} size="sm">{r.status === 'valid' ? 'Measure again here' : r.status === 'invalid' || r.status === 'failed' ? 'Retry here' : 'Measure here'}</Btn>;
          return (
            <li className={`pos-row is-${r.status}${r.current ? ' is-current' : ''}`} key={r.id}>
              <span className="pos-id">{r.id}</span><span className="pos-main"><b>{r.name}</b><small>{what}</small></span><span className="pos-st">{st}</span><span className="pos-act">{act}</span>
            </li>
          );
        })}
      </ol>
      <p className="small muted">Measure at each position in turn: check the background there, then start the measurement. The room's result is the average of the positions. If a position does not work, measure it again or use another one.</p>
      {close.length ? <Note tone="info">{`${close.join(' and ')} ${close.length > 1 ? 'are each' : 'are'} less than 2 m apart in this room. Place the device as far from the other positions as you can: ideally 2 m apart and 1 m from walls.`}</Note> : null}
    </Card>
  );
}

// The latest take: what was recorded, or why it could not be used.
function TakeCard({ p }: { p: Project }) {
  const rec = p.measurement.recording as any, f = p.measurement.failed as any, cur = D.measured(p);
  if (M().failedLatest(p)) {
    return (
      <Card icon="doc" title="Latest take" sub={`${fmt.when(f.takenAt)} · sweep level ${ui.levelDb(f.levelDb)}`} right={<Pill tone="critical" text="Not used" icon="x" />}>
        <Note tone="critical"><b>This take could not be used.</b>{` ${f.reason}`}</Note>
        {cur ? <p className="small muted">{`The current measurement from ${fmt.when(cur.takenAt)} is kept.`}</p> : null}
      </Card>
    );
  }
  if (!rec) return null;
  const lv = rec.levels, cpu = p.processing;
  const status = cpu.result && cpu.result.recordingId === rec.id ? <Pill tone="good" text="Current measurement" icon="seal" />
    : cpu.attempt && cpu.attempt.recordingId === rec.id ? <Pill tone="critical" text="Not valid" icon="x" /> : <Pill tone="neutral" text="Waiting to be processed" />;
  const rpos = DEMO.POSITIONS.find((x: { id: string }) => x.id === rec.position);
  const dn = ui.distortionNote(rec.analysis.distortion);
  return (
    <Card icon="play" title="Latest take" sub={fmt.when(rec.takenAt)} right={status}>
      <ul className="take-sum">
        <li><Icon name="pin" size={16} sw={2} /><span><b>{rpos ? `${rpos.id} · ${rpos.name}` : 'Position not recorded'}</b><small>where it was taken</small></span></li>
        <li><Icon name="speaker" size={16} sw={2} /><span><b>{`Sweep level ${ui.levelDb(rec.plan && rec.plan.levelDb)}`}</b><small>how loud the test sweep was played</small></span></li>
        <li><Icon name="wave" size={16} sw={2} /><span><b>{`Test signal ${lv.snrDb.toFixed(1)} dB above the background`}</b><small>Processing checks the recording before it gives an RT60</small></span></li>
      </ul>
      {dn ? <Note tone="warn">{dn}</Note> : null}
      {rec.warnings && rec.warnings.length ? <Note tone="warn">{rec.warnings.join(' ')}</Note> : null}
      <Details id="measure-take" summary="Show all recording details">
      <div className="grid g2">
        <Kv rows={[
          ['Device', rec.deviceKind ? DEMO.DEVICE_KINDS[rec.deviceKind].name : '—'],
          ['Position', rpos ? `${rpos.id} · ${rpos.name}` : '—'],
          ['Microphone', rec.deviceLabel || '—'],
          ['Sound output', rec.outputLabel ? rec.outputLabel : 'Not named by this browser'],
          ['Sample rate', `${rec.sampleRate / 1000} kHz`],
          ['Sweep level', <>{ui.levelDb(rec.plan && rec.plan.levelDb)}{rec.plan && rec.plan.playedPeakDbfs != null ? <KvNote>{`played peak ${ui.dbfs(rec.plan.playedPeakDbfs)}`}</KvNote> : null}</>],
        ]} />
        <Kv rows={[
          ['Arrival delay', rec.analysis.latencySec != null ? <>{`${(rec.analysis.latencySec * 1000).toFixed(0)} ms`}<KvNote>read from the recording</KvNote></> : '—'],
          ['Peak level', ui.dbfs(lv.peakDbfs)], ['Background before the signal', ui.dbfs(lv.preRollDbfs)],
          ['Signal level during the sweep', ui.dbfs(lv.sweepDbfs)], ['Signal above background', `${lv.snrDb.toFixed(1)} dB`],
          ['Distortion', <>{ui.distortionText(rec.analysis.distortion)}<KvNote>harmonics against the main response</KvNote></>],
        ]} />
      </div>
      </Details>
      <p className="small muted">Recorded audio is analysed straight away and not stored; the project keeps the analysis.</p>
    </Card>
  );
}

// The room as measured so far: its summary over the positions, and how many positions it rests on.
function CurrentCard({ p }: { p: Project }) {
  const cur = D.measured(p) as any, hist = p.processing.history || [], r = D.room(p), s = D.positions(p);
  const avg = D.averageRT60(p), sm = D.summaryRT60(p), pol = D.policy(p);
  return (
    <Card icon="mic" title="The room so far" cls="card-sofar"
      right={r ? <Pill tone={s.complete ? 'good' : 'neutral'} text={s.complete ? `${s.count} positions` : `${s.count} of ${s.required} positions`} icon={s.complete ? 'seal' : 'pin'} /> : <Pill tone="neutral" text="Not measured" />}>
      {r && cur ? <>
        <div className="vol">
          <span className="stat-v">{sm.available && sm.value != null ? <>{sm.value.toFixed(2)}<small>s</small></> : '—'}</span><span className="muted">{`${pol.label}, average over ${s.count} position${s.count > 1 ? 's' : ''}${s.complete ? '' : ` · ${s.need} more position${s.need > 1 ? 's' : ''} needed`} · all bands, ${am.services.rt60Average.SHORT}: ${avg.available ? fmt.s(avg.value) : `none (${avg.reason || ''})`} · at ${fmt.hz(r.headline.f)}: ${fmt.s(r.headline.rt60)} · latest take ${fmt.when(cur.takenAt)}, at ${D.positionOf(cur)}, sweep level ${ui.levelDb(cur.meta && cur.meta.plan && cur.meta.plan.levelDb)}`}</span>
        </div>
        {hist.length ? <p className="small muted">{`${hist.length} earlier take${hist.length > 1 ? 's' : ''} replaced by a newer valid take at the same position (superseded).`}</p> : null}
      </> : <div className="vol"><span className="stat-v">—</span><span className="muted">RT60 not measured</span></div>}
    </Card>
  );
}

export function MeasureScreen({ ctx }: { ctx: Ctx }) {
  const p = ctx.project, m = M(), take = m.takeFor(p), rec = p.measurement.recording as any, cur = D.measured(p);
  const st0 = m.screenState(p), st = st0 === 'measuring-noise' && LIVE.state.noise && LIVE.state.noise.auto ? 'auto-noise' : st0;
  let [title, sub, tone, pill] = HEAD[st] || HEAD['ready-for-rt60'];
  const plan = m.curPlan(), phases: any[] = MEAS.phases(plan), running = !!take, sec: number = take ? take.sec : 0;
  const pos = DEMO.POSITIONS.find((x: { id: string }) => x.id === p.setup.position) || DEMO.POSITIONS[0];
  const kind = LIVE.kindOf(p), K = DEMO.DEVICE_KINDS[kind];
  const retry = p.measurement.retry;
  const blocker = m.startBlocker(p, true), canStart = !blocker;
  // The console speaks of the position selected for the next take: a take made at another position is not this one's.
  const recHere = !!rec && D.positionOf(rec) === p.setup.position, failed = m.failedLatest(p);
  const hereRow = (D.positions(p).rows as any[]).find(r => r.current), triedHere = recHere || (!!hereRow && hereRow.status !== 'not-measured');
  // A new position: what was just done, and where to go now. A take that was not valid: why, and what to press.
  if (st === 'noise-elsewhere') {
    const done = cur && D.positionOf(cur) !== pos.id ? D.positionOf(cur) : null;
    title = `${done ? `${done} done. ` : ''}Next: ${pos.id}, ${pos.name.toLowerCase()}`;
    sub = `Move the ${K.noun} there and press Start measurement. It checks the background noise there first, then measures.`;
    pill = 'Next position';
  } else if (st === 'take-invalid') {
    const why = p.processing.attempt && p.processing.attempt.reason;
    [title, sub, tone, pill] = [`The take at ${pos.id} was not valid`, `${why ? `${why} ` : ''}Fix it, then press Retry ${pos.id} to measure again.`, 'critical', 'Not valid'];
  }
  const stepState = (ph: any) => {
    if (!running) return recHere && !failed ? 'done' : 'idle';
    if (ph.id === 'complete') return 'idle';
    if (ph.id === 'quality') return take.phase === 'quality' ? 'active' : 'idle';
    if (take.phase === 'quality' || sec >= ph.to) return 'done';
    return sec >= ph.from ? 'active' : 'idle';
  };
  const sweepState = !running ? (recHere && !failed ? 'Played' : 'Waiting') : sec < plan.preRoll ? 'Starts in a moment' : take.phase === 'play' ? 'Playing' : 'Finished';
  const takeText = running ? (take.phase === 'quality' ? 'Analysing the recording' : `Recording · ${sec.toFixed(1)} of ${plan.total.toFixed(1)} s`)
    : failed ? 'Last take failed' : recHere ? (m.evaluated(p, rec) ? 'Take processed' : 'Take recorded, not processed yet') : rec ? `Not measured at ${p.setup.position} yet` : 'Not measured';
  return (
    <>
      <section className="card measure-intro" aria-label="Before you measure">
        <GuideThumb id="measure" disabled={running} />
        <div className="mi-body">
          <span className="label">Before you start</span>
          <h2 className="mi-title">Measure how long the room echoes</h2>
          <p className="mi-text">{`The ${K.noun} plays a short test sound and listens to how the room rings. It takes about ${Math.round(plan.total)} seconds.`}</p>
          <ul className="mi-tips">
            <li><Icon name={kind === 'mobile' ? 'phone' : 'laptop'} size={16} sw={2} /><span><b>{`${K.noun.charAt(0).toUpperCase()}${K.noun.slice(1)} at ${pos.id}`}</b>{`, ${pos.name.toLowerCase()}: on a table, not held`}</span></li>
            <li><Icon name="speaker" size={16} sw={2} /><span><b>Volume up</b>, headphones unplugged</span></li>
            <li><Icon name="users" size={16} sw={2} /><span><b>Everyone quiet</b> and still until it finishes</span></li>
          </ul>
          <div className="hstack">
            <Btn action="openGuide" value="measure" size="sm" icon="play" disabled={running}>{`Watch how (${am.guides.measure.lengthLabel})`}</Btn>
            {running ? <span className="small muted">Available when the take has finished.</span> : null}
          </div>
        </div>
      </section>
      {p.legacyNote ? <Note tone="warn" icon="alert">{p.legacyNote}</Note> : null}
      <PositionsCard p={p} busy={running || m.noiseRun(p)} />
      <div className="measure-label"><Icon name="wave" size={15} sw={2} />{` Room measurement at ${pos.id} · ${pos.name}`}</div>
      {retry && !running && !(rec && !m.evaluated(p, rec))
        ? <Note tone="warn"><b>The last take was not valid.</b>{` ${retry.reason || ''} Before measuring again, close doors and windows, switch off ventilation and air conditioning, make sure nobody talks or moves, check that the ${K.noun}'s speaker and microphone are uncovered, and turn its volume up if it can play louder without distorting.`}</Note> : null}
      <ol className="proc" aria-label="Measurement procedure">
        {phases.map((ph, i) => {
          const s = stepState(ph);
          return <li className={`proc-step is-${s}`} key={ph.id}><span className="proc-dot">{s === 'done' ? <Icon name="check" size={13} sw={2.6} /> : String(i + 1)}</span><span className="proc-t">{ph.label}</span><span className="proc-h">{ph.hint}</span></li>;
        })}
      </ol>
      <Card icon="rec" cls={`console-card is-${tone}`} title={<span className="status-title">{title}</span>} sub={sub} right={<Pill tone={tone} text={pill} />}>
        <div className="console">
          <div className="stack console-scope">
            <div className="scope"><canvas id="scope" aria-label="Microphone input" /></div>
            <div className="prog-row">
              <span id="ptime" dangerouslySetInnerHTML={{ __html: `${running ? sec.toFixed(1) : '0.0'} s` }} />
              <div className={running ? 'meter is-live' : 'meter'}><i id="prog" style={{ width: `${running ? (take.frac * 100).toFixed(1) : 0}%` }} /></div>
              <span>{`${plan.total.toFixed(1)} s`}</span>
            </div>
          </div>
          <div className="live-list">
            <MicRow p={p} />
            <LiveRow k="Input level"><LevelMeter id="mic-level" /></LiveRow>
            <NoiseRow p={p} />
            <LiveRow k="Test signal"><span className="live-v"><Icon name="speaker" size={16} sw={1.9} />{`Sweep · ${running && take.levelDb != null ? `${ui.levelDb(take.levelDb)} · ` : ''}${sweepState}`}</span></LiveRow>
            <LiveRow k="Measurement"><span className="live-v" id="take-text" dangerouslySetInnerHTML={{ __html: am.util.esc(takeText) }} /></LiveRow>
          </div>
        </div>
        <div className="console-actions">
          <LevelControl p={p} running={running} />
          <div className="hstack">
            {running
              ? <Btn action="cancelTake" icon="stop" disabled={take.phase === 'quality'}>Cancel</Btn>
              : <button type="button" className="btn btn-primary is-rec" data-action="startTake" disabled={canStart ? undefined : true}><span className="rec"><Icon name="rec" size={16} sw={2} /></span>{` ${triedHere ? 'Measure again' : 'Start measurement'}`}</button>}
            <span className="small muted">{running ? 'Leaving this step cancels the take.' : canStart ? (m.needsNoise(p) ? 'Checks the background noise here first, then measures.' : cur ? 'A new take becomes the current measurement only if it is valid.' : `Uses this ${K.noun}'s own speaker and microphone.`) : blocker || ''}</span>
          </div>
        </div>
      </Card>
      <TakeCard p={p} />
      <CurrentCard p={p} />
    </>
  );
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export const measurePrimary = (ctx: Ctx): PrimaryAction | null => M().primaryFor(ctx.project);

/* Larger pieces shared by several screens: the average summary under a band table, the plain-language views of the
   measured room (low sounds, voices, high sounds), saved projects (Home, Measurement History), the background-noise
   result and live level meter. Every figure comes from the project or AM.live; nothing here makes one up. */
import type { ReactNode } from 'react';
import { am, cx, fmt, S, ui } from '../lib';
import type { Average, SoundGroup, Summary, Project } from '../am';
import { Btn, Icon, Kv, KvNote, More, Note, Pill, Spin, TableWrap, type KvRow } from './kit';

/* ---------- the headline average under a band table (AM.services.rt60Average) ---------- */
export function AverageSummary({ avg }: { avg: Average }) {
  const RA = am.services.rt60Average, inc = avg.included;
  const short = (r: string) => String(r || '').split(':')[0].toLowerCase();
  const others = avg.excluded.map(b => fmt.hz(b.f)).join(', ');
  return (
    <div className="avg-sum" data-watch="avg-summary">
      <div className="avg-h">
        <span className="label">{RA.LABEL}</span>
        {avg.available && avg.value != null
          ? <><span className="avg-v">{avg.value.toFixed(2)}<small>s</small></span><span className="small muted">{`mean of ${inc.map(b => fmt.hz(b.f)).join(', ')}`}</span></>
          : <span className="avg-v is-empty">Unavailable</span>}
      </div>
      {avg.available && avg.value != null
        ? <p className="small avg-calc">{`(${inc.map(b => b.rt60.toFixed(3)).join(' + ')}) ÷ ${avg.n} = ${avg.value.toFixed(3)} s${others ? ` · not part of the average: ${others}` : ''}${avg.partial ? ` · left out, not measured reliably: ${avg.missing.map(m => fmt.hz(m.f)).join(', ')}` : ''}`}</p>
        : <p className="small">{avg.missing.length && avg.missing[0].reason !== 'Take not valid'
          ? `Required band${avg.missing.length > 1 ? 's' : ''} without a reliable value: ${avg.missing.map(m => `${fmt.hz(m.f)} (${short(m.reason)})`).join(', ')}. The reason for each is listed with the band table.`
          : avg.reason || ''}</p>}
      <p className="small muted">{RA.METHOD}</p>
    </div>
  );
}

/* ---------- plain-language views (AM.derive.soundGroups) ---------- */
/** How long sound rings, per group: the value, an everyday example, and whether it was measured clearly. */
export function SoundTiles({ groups }: { groups: SoundGroup[] }) {
  return (
    <div className="sound-tiles">
      {groups.map(g => {
        const note = !g.missing.length ? 'Measured clearly' : g.value == null ? 'Could not be measured' : g.id === 'low' && g.missing.includes(125) ? 'Lowest sounds not measured' : 'Part of it not measured';
        return (
          <div className={cx('sound-tile', g.id === 'voices' && 'is-main')} key={g.id}>
            <div className="st-h"><span className="st-k"><Icon name={g.icon} size={15} sw={2} />{g.label}</span>{g.id === 'voices' ? <span className="st-tag">Most important</span> : null}</div>
            <div className="st-eg">{g.example}</div>
            <div className="st-v">{g.value != null ? <>{g.value.toFixed(2)}<small>s</small></> : '—'}</div>
            <div className={cx('st-note', g.missing.length > 0 && 'is-warn')}>{note}</div>
          </div>
        );
      })}
    </div>
  );
}

const SOUND_STATUS: Record<string, [string, string, string?]> = { above: ['warn', 'Too echoey', 'arrowUp'], within: ['good', 'Just right', 'check'], below: ['warn', 'Too dull', 'arrowDn'], none: ['neutral', 'No target here'] };
export function SoundStatus({ status }: { status: SoundGroup['status'] }) {
  const x = status ? SOUND_STATUS[status] : null;
  return x ? <Pill tone={x[0]} text={x[1]} icon={x[2]} /> : <Pill tone="neutral" text="Not measured" />;
}
/** Each group against the target range, on its own strip: too dull, just right or too echoey. */
export function SoundStrips({ groups, t }: { groups: SoundGroup[]; t: { min: number | null; max: number } }) {
  // An upper-limit target has no lower limit: nothing is "too dull" against it.
  const lo = t.min != null ? t.min : 0, goal = t.min != null ? `${t.min.toFixed(2)}–${fmt.s(t.max)}` : `at most ${fmt.s(t.max)}`;
  const top = Math.max(t.max * 1.6, ...groups.map(g => (g.value || 0) * 1.12));
  const at = (v: number) => `${(Math.max(0, Math.min(1, v / top)) * 100).toFixed(1)}%`;
  const mid = (a: number, b: number) => `${((a + b) / 2 / top * 100).toFixed(1)}%`;
  return (
    <div className="sound-strips">
      <div className="ss-row ss-head"><span /><div className="ss-scale">{t.min != null ? <span style={{ left: mid(0, lo) }}>Too dull</span> : null}<span style={{ left: mid(lo, t.max) }}>Just right</span><span style={{ left: mid(t.max, top) }}>Too echoey</span></div><span /></div>
      {groups.map(g => (
        <div className={cx('ss-row', g.id === 'voices' && 'is-main')} key={g.id}>
          <span className="ss-k">{g.label}</span>
          <div className="ss-strip" title={`${g.label}: ${g.value != null ? fmt.s(g.value) : 'not measured'}; goal ${goal}`}>
            <i className="ss-z is-off" style={{ left: 0, width: at(lo) }} />
            <i className="ss-z is-ok" style={{ left: at(lo), width: `calc(${at(t.max)} - ${at(lo)})` }} />
            <i className="ss-z is-off" style={{ left: at(t.max), right: 0 }} />
            {g.value != null ? <b className="ss-dot" style={{ left: at(g.value) }} /> : null}
          </div>
          <span className="ss-s"><SoundStatus status={g.status} /></span>
        </div>
      ))}
      <p className="small muted">{`Goal ${goal} for this room.`}</p>
    </div>
  );
}
/** Can the measurement be trusted? One line per group. */
export function MeasureCheck({ groups }: { groups: SoundGroup[] }) {
  const missed = groups.filter(g => g.missing.length), voices = groups.find(g => g.id === 'voices');
  const verdict = !missed.length ? <Pill tone="good" text="Measured clearly" icon="seal" />
    : voices && voices.missing.length ? <Pill tone="warn" text="Measure again" icon="alert" /> : <Pill tone="good" text="Mostly measured clearly" icon="seal" />;
  return (
    <div className="measure-check">
      <div>{verdict}</div>
      <ul>
        {groups.map(g => {
          if (!g.missing.length) return <li className="mc-ok" key={g.id}><Icon name="check" size={16} sw={2.4} /><div>{`${g.label} measured clearly`}{g.id === 'voices' ? <small>The part that matters most for meetings and talks</small> : null}</div></li>;
          const what = g.value == null ? `${g.label} could not be measured` : g.id === 'low' && g.missing.includes(125) ? 'The lowest sounds could not be measured' : `Part of the ${g.label.toLowerCase()} could not be measured`;
          return <li className="mc-warn" key={g.id}><Icon name="alert" size={16} sw={2.2} /><div>{what}<small>Not enough test sound reached the microphone above the background noise there. Keep the room quiet, turn the volume up, and measure again.</small></div></li>;
        })}
      </ul>
    </div>
  );
}

/* ---------- saved projects ---------- */
// at: "pc" on a Home card, "hl" in Measurement History; the ids let focus stay on the same project's controls.
export function DeleteConfirm({ s, at }: { s: Summary; at: string }) {
  return (
    <div className="del-confirm" role="group" aria-label={`Delete ${s.name}`}>
      <span>{`Delete “${s.name}”? Its room, measurement and treatment plan are removed from this device. This cannot be undone.`}</span>
      <span className="hstack"><Btn action="doDelete" value={s.id} variant="danger" size="sm" id={`${at}-delyes-${s.id}`}>Delete project</Btn><Btn action="cancelDelete" value={s.id} variant="ghost" size="sm">Cancel</Btn></span>
    </div>
  );
}
export const DeleteButton = ({ s, at }: { s: Summary; at: string }) => (
  <button type="button" className="iconbtn del-btn" id={`${at}-del-${s.id}`} data-action="askDelete" data-value={s.id} aria-label={`Delete ${s.name}`} title="Delete project"><Icon name="trash" size={17} sw={1.9} /></button>
);

const RESULT: Record<string, [string, string]> = { above: ['warn', 'Above target'], within: ['good', 'Within target'], below: ['warn', 'Below target'] };
/** A saved project on Home (Pinned and Recent). s = AM.derive.summary(project). */
export function ProjectCard({ s, activeId }: { s: Summary; activeId?: string | null }) {
  const open = s.id === activeId, t = s.treatment;
  const room = [[s.industry, s.type].filter(Boolean).join(' · ') || 'Room not described yet', s.geometry ? fmt.m3(s.geometry.V) : ''].filter(Boolean).join(' · ');
  const stat = (k: string, v: string, c = '') => <div className={cx('pc-stat', c)} key={k}><span className="pc-k">{k}</span><span className="pc-v">{v}</span></div>;
  // The status is the verdict (every judged band against the target); the figure is the average over those bands.
  // A room measured at fewer positions than it needs has no verdict yet (Assessment calls it provisional).
  const result = s.status ? <Pill tone={RESULT[s.status][0]} text={RESULT[s.status][1]} />
    : s.provisional ? <Pill tone="neutral" text={s.positions < s.positionsRequired ? `Provisional · ${s.positions} of ${s.positionsRequired} positions` : 'Provisional'} icon="pin" />
      : s.measured != null ? <Pill tone="warn" text="Not assessed" icon="alert" /> : <Pill tone="neutral" text="Not measured yet" />;
  const treatment = !s.status ? ''
    : t.items ? `Treatment: ${t.items} product${t.items === 1 ? '' : 's'}${t.predictedStatus ? ` · predicted ${RESULT[t.predictedStatus][1].toLowerCase()}` : ''}`
      : t.required ? 'No treatment chosen yet' : 'No treatment needed';
  const progress = s.review ? `${s.review} step${s.review > 1 ? 's' : ''} to review · next: ${s.reviewNext}` : s.next ? `${s.done} of ${s.total} steps · next: ${s.next}` : 'Complete';
  return (
    <article className={cx('pcard', s.pinned && 'is-pinned', open && 'is-open')} aria-label={s.name}>
      <header className="pc-h">
        <div className="pc-title"><button type="button" className="pc-name" data-action="openProject" data-value={s.id}>{s.name}</button>{open ? <Pill tone="neutral" text="Open now" /> : null}</div>
        <span className="pc-tools">
          <DeleteButton s={s} at="pc" />
          <button type="button" className="pin-btn" id={`pc-pin-${s.id}`} data-action="togglePin" data-value={s.id} aria-pressed={s.pinned} aria-label={`Pin ${s.name}`} title={s.pinned ? 'Unpin project' : 'Pin project'}><Icon name="pushpin" size={17} sw={2} /></button>
        </span>
      </header>
      <div className="pc-room">{room}</div>
      <div className="pc-stats">
        {stat('Measured', s.summary != null ? fmt.s(s.summary) : '—')}
        {stat('Target', s.targetText || '—')}
        {t.predicted != null ? stat('Predicted', fmt.s(t.predicted), 'is-pred') : null}
      </div>
      <div className="pc-status">{result}{treatment ? <span className="pc-treat">{treatment}</span> : null}</div>
      {ui.confirmingDelete(s.id) ? <DeleteConfirm s={s} at="pc" /> : (
        <footer className="pc-f">
          <span className="pc-when">{`Updated ${fmt.ago(s.updatedAt)}${s.measuredAt ? ` · measured ${fmt.ago(s.measuredAt)}` : ''}`}<br />{progress}</span>
          <Btn action="openProject" value={s.id} size="sm" iconAfter="arrowR">Open project</Btn>
        </footer>
      )}
    </article>
  );
}

/** Measurement History list: each row reopens its project; the bin deletes it (after asking). */
export function HistoryList({ items, activeId }: { items: Summary[]; activeId?: string | null }) {
  if (!items.length) return <div className="hist-empty"><Icon name="history" size={28} sw={1.6} /><span>No measurements yet. Start a new measurement and it will be kept here.</span></div>;
  return (
    <ul className="hist-list">
      {items.map(s => {
        const kind = [s.industry, s.type].filter(Boolean).join(' · ') || 'Room type not set';
        const size = s.geometry ? `${fmt.dims(s.geometry)} · ${fmt.m3(s.geometry.V)}` : '';
        const open = s.id === activeId;
        const step = s.review ? `${s.review} step${s.review > 1 ? 's' : ''} to review · next: ${s.reviewNext}` : s.next ? `${s.done} of ${s.total} steps · next: ${s.next}` : 'Complete';
        if (ui.confirmingDelete(s.id)) return <li className="hist-item" key={s.id}><DeleteConfirm s={s} at="hl" /></li>;
        return (
          <li className="hist-item" key={s.id}>
            <button type="button" className={cx('hist-row', open && 'is-open')} data-action="openProject" data-value={s.id}>
              <span className="hist-main">
                <span className="hist-name">{s.pinned ? <span className="hist-pin" title="Pinned"><Icon name="pushpin" size={14} sw={2} /></span> : null}{s.name}{open ? <Pill tone="neutral" text="Open now" /> : null}</span>
                <span className="hist-meta">{[kind, size].filter(Boolean).join(' · ')}</span>
                <span className="hist-date">{`Last updated ${fmt.when(s.updatedAt)}`}</span>
              </span>
              <span className="hist-side">
                <span className="hist-rt">{s.summary != null
                  ? <>{`RT60 ${fmt.s(s.summary)} `}<span className="muted">{`${s.summaryName.toLowerCase()}, ${s.summaryShort} · ${s.positions} position${s.positions === 1 ? '' : 's'}`}</span></>
                  : s.measured != null ? <span className="muted">{`Measured; no ${s.summaryShort} average`}</span> : <span className="muted">Not measured yet</span>}</span>
                <span className={cx('hist-step', s.review > 0 && 'is-review')}>{step}</span>
                <span className="progress"><i style={{ width: `${(s.done / s.total) * 100}%` }} /></span>
              </span>
            </button>
            <DeleteButton s={s} at="hl" />
          </li>
        );
      })}
    </ul>
  );
}

/* ---------- live measurement pieces ---------- */
/** Live input level: the bar and value are filled in by ui.updateLevel (js/ui/live-ui.js) from real level reports. */
export function LevelMeter({ id }: { id: string }) {
  return <div className="level" id={id}><div className="meter is-live live-meter"><i className="lm-bar" /><b className="lm-peak" /></div><span className="lm-val" dangerouslySetInnerHTML={{ __html: '—' }} /></div>;
}

const ACCESS: Record<string, [string, string]> = {
  'not-requested': ['neutral', 'Not requested yet'], granted: ['good', 'Allowed'], denied: ['critical', 'Blocked'], embedded: ['critical', 'Not available in this view'],
  'no-device': ['critical', 'No microphone found'], busy: ['critical', 'Could not start'], unsupported: ['critical', 'Not supported here'], insecure: ['critical', 'Needs a secure page'], error: ['critical', 'Failed'],
};
export function AccessPill({ permission }: { permission: string }) {
  const [tone, text] = ACCESS[permission] || ACCESS.error;
  return <Pill tone={tone} text={text} icon={tone === 'good' ? 'seal' : tone === 'critical' ? 'alert' : null} />;
}
/** One line: is a microphone stream open and are samples arriving right now? */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function MicLine({ mic, setup }: { mic: any; setup?: Project['setup'] }) {
  const L = am.live as unknown as { receiving(): boolean }, SILENT = (am.analysis.CRITERIA as any).noise.silenceDbfs as number; // eslint-disable-line @typescript-eslint/no-explicit-any
  const dot = (c: string, text: ReactNode) => <><span className={cx('dot', c)} /><span>{text}</span></>;
  switch (mic.status) {
    case 'live':
      if (!L.receiving()) return dot('busy', 'Connected, but no audio is arriving yet');
      if (mic.level.rmsDbfs < SILENT) return dot('busy', 'Live, but the input is silent: the microphone may be muted');
      return dot('live', `Live · ${mic.label}${mic.sampleRate ? ` · ${mic.sampleRate / 1000} kHz` : ''}`);
    case 'starting': return <><Spin /><span>Starting the microphone…</span></>;
    case 'suspended': return dot('busy', 'Audio is paused by the browser');
    case 'muted': return dot('busy', 'The microphone is muted by the system or the device');
    case 'stopped': return dot('bad', 'The microphone stopped delivering audio');
    case 'error': return dot('bad', (ACCESS[mic.code] || ACCESS.error)[1]);
    default: return setup && setup.permission === 'granted'
      ? dot('', `Access allowed · not in use${setup.deviceLabel ? ` · ${setup.deviceLabel}` : ''}`)
      : dot('', 'Not connected');
  }
}

/* Background noise: the current valid measurement, the latest attempt if it was not accepted, and the run in progress. */
const NOISE: Record<string, [string, string, string]> = { valid: ['good', 'Suitable for measuring', 'seal'], warning: ['warn', 'Measure with care', 'alert'], unassessed: ['neutral', 'Unable to assess', 'info'], invalid: ['critical', 'Measure the background again', 'x'], failed: ['critical', 'Failed', 'x'] };
export function NoisePill({ status }: { status: string }) { const [tone, text, ic] = NOISE[status] || NOISE.invalid; return <Pill tone={tone} text={text} icon={ic} />; }
const NOISE_SAYS: Record<string, string> = {
  valid: 'The room is quiet enough. Go ahead.',
  warning: 'A little noisy, but you can measure. Each take checks itself and says if the noise affected it.',
  unassessed: 'You can still measure: each take checks its own recording.',
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function NoiseBody({ p, bands = true }: { p: any; bands?: boolean }) {
  const s = p.setup, n = s.noise, a = s.noiseAttempt, L = am.live.state as any, run = L.noise && L.noise.pid === p.id; // eslint-disable-line @typescript-eslint/no-explicit-any
  const C = (am.analysis.CRITERIA as any).noise; // eslint-disable-line @typescript-eslint/no-explicit-any
  const total = C.seconds + C.settle;
  if (run) {
    return (
      <div className="noise-run">
        <div className="status-line"><Spin />Measuring the background: keep the room quiet</div>
        <div className="prog-row"><span id="nz-time" dangerouslySetInnerHTML={{ __html: `${(L.noise.sec || 0).toFixed(1)} s` }} /><div className="meter is-live"><i id="nz-prog" style={{ width: `${((L.noise.frac || 0) * 100).toFixed(1)}%` }} /></div><span>{`${total.toFixed(1)} s`}</span></div>
        <LevelMeter id="nz-level" />
        <div><Btn action="cancelNoise" variant="ghost" size="sm" icon="x">Cancel</Btn></div>
      </div>
    );
  }
  const signed = (x: number) => `${x > 0 ? '+' : x < 0 ? '−' : '±'}${Math.abs(x).toFixed(1)} dB`;
  const ib = n && n.inBand;
  const cautions: string[] = n && n.warnings ? n.warnings.filter((w: string) => !/does not report whether/.test(w)) : [];
  const time = ui.timeOf;
  const rows: KvRow[] = n ? [
    ...(ib ? [
      ['Recording noise level in the measured bands (125–4000 Hz)', <>{ui.dbfs(ib.leqDbfs)}<KvNote>{`usual level (median) ${ui.dbfs(ib.l50)}; a caution when louder than ${ui.dbfs(C.highDbfs, 0)}`}</KvNote></>],
      ['Loudest moment above the usual level', <>{`${ib.soundDb.toFixed(1)} dB`}<KvNote>{`in the ${fmt.hz(ib.soundBand)} band; a caution above ${C.soundDb} dB`}</KvNote></>],
      ['Change across the window', <>{signed(ib.driftDb)}<KvNote>{`in the measured bands; a caution beyond ±${C.changeDb} dB`}</KvNote></>],
      ['Steadiness (L10 − L90)', <>{`${ib.spreadDb.toFixed(1)} dB`}<KvNote>in the measured bands; information only</KvNote></>],
    ] as KvRow[] : [['Steadiness (L10 − L90)', `${n.spreadDb.toFixed(1)} dB`], ['Loudest moment above L90', `${n.jumpDb.toFixed(1)} dB`], ['Change across the window', signed(n.driftDb)]] as KvRow[]),
    ['Unweighted, all frequencies', <>{`Leq ${ui.dbfs(n.leqDbfs)} · L10 − L90 ${n.spreadDb.toFixed(1)} dB · change ${signed(n.driftDb)}`}<KvNote>{`${n.dcDbfs !== undefined ? 'DC offset removed; ' : ''}including rumble below 88 Hz, which no RT60 band hears`}</KvNote></>],
    n.dcDbfs !== undefined ? ['DC offset of the input', <>{ui.dbfs(n.dcDbfs)}<KvNote>a constant offset from the microphone or converter; not sound, and not counted in any level</KvNote></>] : null,
  ] : [];
  const allowed = s.permission === 'granted' || ['live', 'suspended'].includes(L.mic.status), busy = !!(L.noise || L.take);
  return (
    <>
      {n ? <>
        <div className="vol"><NoisePill status={n.status} /></div>
        {(n.status === 'warning' || n.status === 'unassessed') && cautions.length ? <ul className="bullets">{cautions.map((w, i) => <li key={i}>{w}</li>)}</ul> : null}
        <p className="small">{NOISE_SAYS[n.status] || ''}</p>
        <p className="small muted">{`Checked at ${time(n.takenAt)}.`}</p>
        <More summary="Details">
          <p className="small muted">{`Recording noise level ${ui.dbfs(ib ? ib.leqDbfs : n.leqDbfs)}${ib ? ' in the RT60 bands' : ''}: how far below the loudest level the microphone can record (max). It is not the room's real loudness, because the microphone is not calibrated. It cannot tell the room's noise from the microphone's own noise or from what the device's processing did to it. RT60 does not depend on it; it only limits how much decay a take can use.`}</p>
          <Kv rows={rows} />
          {bands ? <>
            <TableWrap><table className="tbl tbl-mini"><thead><tr>{n.bands.map((b: { f: number }) => <th className="r" key={b.f}>{fmt.hzShort(b.f)}</th>)}</tr></thead>
              <tbody><tr>{n.bands.map((b: { f: number; leqDbfs: number | null }) => <td className="r" key={b.f}>{b.leqDbfs == null ? '—' : b.leqDbfs.toFixed(0)}</td>)}</tr></tbody></table></TableWrap>
            <p className="small muted">{`Recording noise level per octave band, in dB relative to max (0 dB is the loudest level the microphone can record), averaged over ${n.seconds} s.`}</p>
          </> : null}
        </More>
      </> : <div className="vol"><span className="stat-v">—</span><span className="muted">Not measured</span></div>}
      {a ? <Note tone="critical" icon="alert"><b>{`Latest attempt ${time(a.takenAt)}: ${a.status === 'failed' ? 'failed' : 'not usable'}.`}</b>{` ${a.reasons.join(' ')}${n ? ` The measurement from ${time(n.takenAt)} is kept.` : ''}`}</Note> : null}
      <div className="hstack">
        <Btn action="measureNoise" variant={n ? 'secondary' : 'primary'} size="sm" icon={n ? 'refresh' : 'gauge'} disabled={busy || !allowed}>{n ? 'Measure again' : 'Measure background noise'}</Btn>
        <span className="small muted">{!allowed ? 'Allow microphone access first.' : busy ? 'Wait for the measurement in progress.' : `Takes ${total.toFixed(0)} s. Keep the room as it will be during the measurement.`}</span>
      </div>
    </>
  );
}

/** S.history() summaries (for Home and the history sheet). */
export const summaries = (): Summary[] => S.history().map(p => am.derive.summary(p));

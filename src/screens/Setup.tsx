/* Step 3 · Measurement Setup — the measuring device, microphone access, measuring position, room preparation and a real
   background-noise measurement. Microphone and noise work goes through AM.live; this screen only shows its state.
   Checks and actions: js/stages/setup.js. */
import { DEMO, fmt, LIVE, MEAS, stageModel, ui } from '../lib';
import type { Ctx } from '../am';
import { Btn, Card, Check, Icon, Kv, KvNote, Note, Pill, SelectInput, Spin } from '../ui/kit';
import { AccessPill, MicLine, NoiseBody } from '../ui/blocks';

type Prep = [string, string, string];
const PREP = (): Prep[] => stageModel<{ PREP: Prep[] }>('setup').PREP;

// Small drawings of the measuring device for the plan: a laptop or a phone.
const at = (v: number) => Math.round(v * 10) / 10;
const Glyph = ({ kind, x, y }: { kind: string; x: number; y: number }) => (kind === 'mobile'
  ? <rect x={at(x - 5)} y={at(y - 8.5)} width="10" height="17" rx="2.2" />
  : <><rect x={at(x - 8)} y={at(y - 9)} width="16" height="11" rx="1.6" /><rect x={at(x - 10.5)} y={at(y + 2.6)} width="21" height="3.2" rx="1.2" /></>);

/* Plan view: the measuring positions, and the device placed at the chosen one. The device itself plays and records. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function Plan({ room, posId, kind }: { room: any; posId: string; kind: string }) {
  const g = (window.AM as any).acoustics.geometry(room); // eslint-disable-line @typescript-eslint/no-explicit-any
  const L = g ? g.L : 10, Wd = g ? g.W : 6;
  const VW = 320, pad = 28, pw = VW - pad * 2, ph = Math.min(210, Math.max(90, pw * Wd / L)), VH = ph + pad * 2;
  const r1 = (v: number) => Math.round(v * 10) / 10, X = (f: number) => r1(pad + f * pw), Y = (f: number) => r1(pad + f * ph);
  const P: { id: string; name: string; x: number; y: number }[] = DEMO.POSITIONS;
  const sel = P.find(p => p.id === posId) || P[0], cx = X(sel.x), cy = Y(sel.y);
  return (
    <svg className="plan" viewBox={`0 0 ${VW} ${VH.toFixed(0)}`} role="img" aria-label={`Plan view of the room: the ${DEMO.DEVICE_KINDS[kind].noun} is placed at ${sel.id}, ${sel.name}`}>
      <rect className="pl-room" x={pad} y={pad} width={pw} height={ph.toFixed(1)} rx="3" />
      <line className="pl-front" x1={pad} y1={pad + 2} x2={pad} y2={(pad + ph - 2).toFixed(1)} /><text className="pl-front-t" x={pad + 7} y={pad + 14}>Front</text>
      {P.filter(p => p.id !== sel.id).map(p => <g className="pl-pos" key={p.id}><circle cx={X(p.x)} cy={Y(p.y)} r="5" /><text x={X(p.x)} y={Y(p.y) - 12} textAnchor="middle">{p.id}</text></g>)}
      <g className="pl-pos on"><circle className="pl-ring" cx={cx} cy={cy} r="17" /><g className="pl-dev"><Glyph kind={kind} x={cx} y={cy} /></g><text x={cx} y={cy - 23} textAnchor="middle">{sel.id}</text></g>
      <text className="pl-dim" x={VW / 2} y={VH - 8} textAnchor="middle">{fmt.m(L)}</text>
      <text className="pl-dim" x={pad - 8} y={pad + ph / 2} textAnchor="middle" transform={`rotate(-90 ${pad - 8} ${pad + ph / 2})`}>{fmt.m(Wd)}</text>
    </svg>
  );
}

const ACCESS_TEXT: Record<string, string> = { granted: 'Allowed', 'not-requested': 'Not requested yet', denied: 'Blocked', embedded: 'Not available in this view', 'no-device': 'No microphone found', busy: 'Could not start', unsupported: 'Not supported here', insecure: 'Needs a secure page', error: 'Failed' };
// The setup summary: [label, value, done, needs attention].
function items(p: Ctx['project']): [string, string, boolean, boolean?][] {
  const s = p.setup, n = s.noise, prepDone = PREP().filter(([k]) => s.prep[k]).length;
  const pos = DEMO.POSITIONS.find((x: { id: string }) => x.id === s.position) || DEMO.POSITIONS[0];
  return [
    ['Measuring device', `${DEMO.DEVICE_KINDS[LIVE.kindOf(p)].name}${s.deviceKind ? '' : ' (detected)'}, its own speaker and microphone`, true],
    ['Microphone', s.deviceLabel || (s.deviceId === 'default' ? 'Default microphone' : 'Selected microphone'), s.permission === 'granted'],
    ['Microphone access', ACCESS_TEXT[s.permission] || 'Failed', s.permission === 'granted', !['granted', 'not-requested'].includes(s.permission)],
    ['Measuring position', `${pos.id} · ${pos.name}`, true],
    ['Room preparation', `${prepDone} of ${PREP().length} done`, prepDone === PREP().length],
    // Each position has its own background check: one made at another position does not count here.
    n && n.position && n.position !== s.position
      ? ['Background noise', `Measured at ${n.position}; measure it at ${s.position}`, false, true]
      : ['Background noise', n ? `${ui.dbfs(n.inBand ? n.inBand.leqDbfs : n.leqDbfs)}${n.inBand ? ' in the RT60 bands' : ''} · ${ui.noiseWord(n.status)}${n.position ? ` · at ${n.position}` : ''}` : s.noiseAttempt ? 'Last attempt not usable' : 'Not measured', !!n, n ? n.status === 'warning' || n.status === 'unassessed' : !!s.noiseAttempt],
  ];
}

export function SetupScreen({ ctx }: { ctx: Ctx }) {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const p = ctx.project, s = p.setup as any, L = LIVE.state;
  const pos = DEMO.POSITIONS.find((x: any) => x.id === s.position) || DEMO.POSITIONS[0];
  const list = items(p), left = list.filter(i => !i[2]).length;
  const allowed = s.permission === 'granted', asking = !!(L.access && L.access.pid === p.id);
  const devices = L.devices.length ? L.devices : [{ id: s.deviceId || 'default', label: s.deviceLabel || 'Default microphone' }];
  const options = devices.map((d: any) => ({ value: d.id, label: d.label }));
  // The saved choice when the list does not have it: the system default by name (some browsers list no 'default' entry),
  // never twice when a listed microphone already carries its label.
  if (!options.some((o: any) => o.value === s.deviceId) && !(s.deviceLabel && options.some((o: any) => o.label === s.deviceLabel))) {
    options.unshift({ value: s.deviceId, label: s.deviceLabel || (s.deviceId === 'default' ? 'Default microphone' : 'Previously selected microphone') });
  }
  const settings = s.input && s.input.settings, cfg = s.input && s.input.config;
  const procWarn: string[] = settings ? MEAS.processingWarnings(settings).filter((w: string) => !/does not report/.test(w)) : [];
  const kind = LIVE.kindOf(p), K = DEMO.DEVICE_KINDS[kind], detected = MEAS.deviceKind();
  // The sound output: chosen and confirmed where the browser can route to it; otherwise stated as not choosable.
  const selectable = MEAS.canSelectOutput(), outs = L.outputs || [];
  const outOptions = [{ value: 'default', label: 'System default output' }, ...outs.filter((o: any) => o.id !== 'default').map((o: any) => ({ value: o.id, label: o.label }))];
  if (!outOptions.some(o => o.value === (s.outputId || 'default'))) outOptions.push({ value: s.outputId, label: 'Previously selected output (not available now)' });
  const outProblem = LIVE.configProblem(p);
  /* eslint-enable @typescript-eslint/no-explicit-any */
  const prepDone = PREP().filter(([k]) => s.prep[k]).length;
  const speaker = selectable && outOptions.length > 1 ? <>
    <SelectInput id="setup-output" label="Sound output" changeAction="setOutput" value={s.outputId || 'default'} options={outOptions} />
    <p className="small muted">{(s.outputId || 'default') === 'default' ? `Choose this ${K.noun}'s built-in speakers.`
      : cfg && cfg.output && cfg.output.verified ? `Playing through ${cfg.output.label || 'the selected output'}.` : cfg && cfg.output && cfg.output.error ? '' : 'Confirmed once microphone access is allowed.'}</p>
  </> : <Kv rows={[['Sound output', <>{L.output ? L.output : "The system's current output"}<KvNote>{`Unplug headphones and turn off Bluetooth audio, so the sound comes from this ${K.noun}'s own speaker${kind === 'mobile' ? '' : 's'}.`}</KvNote></>]]} />;

  return (
    <>
      {p.legacyNote ? <Note tone="warn" icon="alert">{p.legacyNote}</Note> : null}
      <div className="grid g2">
        <div className="stack">
          <Card icon={kind === 'mobile' ? 'phone' : 'laptop'} title="Measuring device" right={allowed ? <Pill tone="neutral" text="Uncalibrated" /> : null}>
            <p className="small">{`One device does the whole measurement: this ${K.noun}'s speaker plays the test signal and its microphone records the room. Nothing else needs to be connected.`}</p>
            <SelectInput id="setup-kind" label="Device profile" changeAction="setKind" value={kind}
              options={Object.entries(DEMO.DEVICE_KINDS).map(([v, k]) => ({ value: v, label: `${(k as { name: string }).name}${v === detected ? ' (detected)' : ''}` }))} />
            {s.deviceKind && s.deviceKind !== detected ? <Note tone="warn">{`This page runs on ${detected === 'mobile' ? 'a phone or tablet' : 'a computer'}. Choosing “${K.name}” changes the instructions only: the measurement always uses the speaker and microphone of the device this page runs on.`}</Note> : null}
            <SelectInput id="setup-device" label="Microphone" changeAction="setDevice" value={options.some((o: any) => o.value === s.deviceId) ? s.deviceId : (options.find((o: any) => o.label === s.deviceLabel) || { value: s.deviceId }).value} options={options} />
            <div className="status-line"><MicLine mic={L.mic} setup={p.setup} /></div>
            {speaker}
            {outProblem ? <Note tone="critical" icon="alert">{outProblem}</Note> : null}
            {procWarn.map((w, i) => <Note tone="warn" key={i}>{w}</Note>)}
            <ul className="bullets small">{K.checks.map((t: string, i: number) => <li key={i}>{t}</li>)}</ul>
          </Card>
          <Card icon="shield" title="Microphone access">
            {asking ? <div className="status-line"><Spin />Waiting for the browser…</div> : <>
              <div className="hstack"><AccessPill permission={s.permission} />{allowed && s.deviceLabel ? <span className="small muted">{s.deviceLabel}</span> : null}</div>
              {['denied', 'embedded', 'no-device', 'busy', 'unsupported', 'insecure', 'error'].includes(s.permission) ? <Note tone="critical" icon="alert">{ui.accessHelp(s.permission) || L.mic.message || ''}</Note> : null}
              <div><Btn action="allowMic" variant={allowed ? 'secondary' : 'primary'} size="sm" icon="shield">{allowed ? 'Check again' : s.permission === 'not-requested' ? 'Allow microphone access' : 'Try again'}</Btn></div>
            </>}
            <p className="small muted">The browser asks once. The microphone is opened only while the app is measuring and is released straight after.</p>
          </Card>
        </div>
        <Card icon="pin" title="Measuring position" sub={`Where the ${K.noun} is placed for the take`}>
          <SelectInput id="setup-pos" label="Position" bind="setup.position" value={s.position} options={DEMO.POSITIONS.map((x: { id: string; name: string }) => ({ value: x.id, label: `${x.id} · ${x.name}` }))} />
          <Plan room={p.room} posId={s.position} kind={kind} />
          <p className="small"><b>{`${pos.id} · ${pos.name}:`}</b>{` ${pos.detail}. ${K.place}`}</p>
          <ul className="bullets small">{[K.support, ...DEMO.PLACEMENT.slice(1)].map((t: string, i: number) => <li key={i}>{t}</li>)}</ul>
        </Card>
      </div>
      <Card icon="list" cls="prep-card" title="Room preparation" sub={`${prepDone} of ${PREP().length} done`}>
        <div className="checks">{PREP().map(([k, label, hint]) => <Check key={k} id={`prep-${k}`} bind={`setup.prep.${k}`} checked={!!s.prep[k]} label={label} hint={hint} />)}</div>
      </Card>
      {/* The last thing before measuring, after the room is prepared. */}
      <Card icon="wave" title="Background noise" sub="A few seconds of silence, to check the room is quiet enough."><NoiseBody p={p} /></Card>
      <Card icon="seal" title="Setup summary">
        <div className="summary">
          {list.map(([k, v, ok, warn]) => (
            <div className="sum-r" key={k}><span className={warn ? 'warn' : ok ? 'ok' : 'todo'}><Icon name={warn ? 'alert' : ok ? 'seal' : 'info'} size={18} sw={2} /></span><span>{k}</span><span className="sum-v">{v}</span></div>
          ))}
        </div>
        {left ? <div className="ready is-not"><Icon name="list" size={20} sw={2} />{` ${left} item${left > 1 ? 's' : ''} left before measuring`}</div> : <div className="ready is-ready"><Icon name="seal" size={20} sw={2.2} /> Ready to measure</div>}
      </Card>
    </>
  );
}

/* Step 4 · Acoustic Measurement — a real take: the microphone is opened when this step is shown, the background is
   recorded, the test sweep is played through this device's own speaker and the room's response is recorded by its own
   microphone, then analysed. One device does all of it; nothing else is connected.
   Everything on this screen reads AM.live (js/measurement/live.js) and the project; nothing here makes up a value.
   A captured take still has to pass Processing before it becomes the current measurement. */
(function (AM) {
  'use strict';
  const { esc, icon, fmt } = AM.util;
  const W = AM.workflow, S = AM.store, D = AM.demo, ui = AM.ui;
  const LIVE = AM.live, MEAS = AM.services.measurement, AN = AM.analysis;

  const curPlan = () => AN.sweepPlan(LIVE.state.mic.sampleRate || 48000);
  const takeFor = p => (LIVE.state.take && LIVE.state.take.pid === p.id ? LIVE.state.take : null);
  const noiseRun = p => !!(LIVE.state.noise && LIVE.state.noise.pid === p.id);
  const evaluated = (p, rec) => !!rec && ((p.processing.result && p.processing.result.recordingId === rec.id) || (p.processing.attempt && p.processing.attempt.recordingId === rec.id));
  const failedLatest = p => { const f = p.measurement.failed, r = p.measurement.recording; return !!f && (!r || f.takenAt > r.takenAt); };

  // Why a take cannot start right now (null when it can).
  function startBlocker(p) {
    const mic = LIVE.state.mic;
    if (takeFor(p)) return 'Wait for the measurement to finish.';
    if (noiseRun(p)) return 'Wait for the background noise measurement to finish.';
    if (mic.status === 'starting') return 'The microphone is starting.';
    if (mic.status === 'suspended') return 'Audio is paused by the browser. Click Start microphone.';
    if (mic.status !== 'live') return mic.message || 'The microphone is not connected.';
    if (!LIVE.receiving()) return 'No audio is arriving from the microphone.';
    // The configuration selected in Measurement Setup has to be the one in force (output applied where it can be chosen).
    if (mic.output && mic.output.error) return `The selected sound output could not be used (${mic.output.error}). Choose another in Measurement Setup.`;
    const problem = LIVE.configProblem(p);
    if (problem) return problem;
    if (!p.setup.noise) return 'Measure the background noise first.';
    return null;
  }

  /* The state on screen, in the measurement-state terms of the service. */
  function screenState(p) {
    const T = MEAS.STATES, take = takeFor(p), rec = p.measurement.recording;
    if (take) return take.phase === 'quality' ? T.PROCESSING : T.MEASURING_RT60;
    if (noiseRun(p)) return T.MEASURING_NOISE;
    if (LIVE.state.mic.status !== 'live') return 'mic';
    if (!p.setup.noise) return p.setup.noiseAttempt ? T.NOISE_INVALID : T.NOT_MEASURED;
    if (failedLatest(p)) return T.FAILED;
    if (rec && !evaluated(p, rec)) return 'captured';
    return T.READY_FOR_RT60;
  }
  const HEAD = {
    mic: ['Microphone needed', 'Connect the microphone to measure. Its status is shown below.', 'neutral', 'Not connected'],
    'not-measured': ['Measure the background first', 'The background noise is measured before the test signal, so the decay can be judged against it.', 'neutral', 'Not measured'],
    'noise-invalid': ['Background not usable', 'The last background measurement could not be used: the reason is shown below. Measure it again.', 'critical', 'Noise not usable'],
    'measuring-noise': ['Measuring the background', 'Keep the room quiet. The level is read from the microphone.', 'acoustic', 'Measuring'],
    'ready-for-rt60': ['Ready to measure', 'Start the take. This device plays the test sweep through its speaker and records the room with its microphone.', 'good', 'Ready'],
    'measuring-rt60': ['Measuring', 'Recording the room. Stay still and silent until the take is complete.', 'live', 'Recording'],
    processing: ['Analysing the recording', 'Recovering the impulse response and the decay in each band.', 'acoustic', 'Analysing'],
    captured: ['Take recorded', 'Process it to check the decay and calculate RT60.', 'good', 'Recorded'],
    failed: ['Take could not be used', 'See the reason below, fix it and measure again.', 'critical', 'Failed'],
  };

  function micRow(p) {
    const mic = LIVE.state.mic;
    const btn = mic.status === 'suspended' ? `<button class="btn btn-secondary btn-sm" data-action="resumeMic">${icon('play', 14)} Start microphone</button>`
      : ['error', 'stopped', 'off', 'muted'].includes(mic.status) ? `<button class="btn btn-secondary btn-sm" data-action="reconnectMic">${icon('refresh', 14, 2)} ${mic.status === 'off' ? 'Connect microphone' : 'Try again'}</button>` : '';
    const help = mic.status === 'error' && mic.code ? `<span class="small muted">${esc(ui.accessHelp(mic.code) || mic.message || '')}</span>` : mic.status === 'stopped' ? `<span class="small muted">Check the connection, then try again.</span>` : '';
    return `<div class="live-r"><span class="live-k">Microphone</span><span class="live-v">${ui.micLine(mic, p.setup)}</span>${help}${btn ? `<div>${btn}</div>` : ''}</div>`;
  }
  /* The sweep level for the next take: − / + in steps, reset, and what it means. Only the played copy of the sweep is
     scaled (AM.analysis.playbackSignal); the limits come from the sweep's digital headroom (AM.analysis.levelRange). */
  function levelControl(p, running) {
    const r = AN.levelRange(), lv = AN.sweepLevel(p.setup.sweepLevelDb), C = AN.CRITERIA.take;
    const peak = 20 * Math.log10(C.amplitude * AN.levelGain(lv)), base = 20 * Math.log10(C.amplitude);
    const [tone, word] = lv === 0 ? ['neutral', 'Default'] : lv > 0 ? ['acoustic', 'Above default'] : ['acoustic', 'Below default'];
    const limit = lv >= r.max ? `${ui.levelDb(r.max, false)} is the highest level: the sweep's peak is then ${ui.dbfs(peak)}, just below digital full scale, and louder would clip. For more sound, raise the device volume, carefully.`
      : lv <= r.min ? `${ui.levelDb(r.min, false)} is the lowest level: every ${r.step} dB lower costs ${r.step} dB of usable decay.` : '';
    return `<div class="sweep-level">
      <div class="sl-row"><span class="live-k" id="sl-label">Sweep level</span>
        ${ui.stepper({ id: 'sweep-level', action: 'sweepLevel', value: lv, display: ui.levelDb(lv, false), min: r.min, max: r.max, label: 'sweep level', disabled: running })}
        ${ui.pill(tone, word)}
        ${lv !== 0 ? `<button class="btn btn-ghost btn-sm" data-action="sweepLevelReset" ${running ? 'disabled' : ''}>${icon('refresh', 14, 2)} Reset to default</button>` : ''}
      </div>
      <p class="small muted">How loud this app plays the test sweep, relative to its default (0 dB: peak ${ui.dbfs(base)}; now ${ui.dbfs(peak)}). Not the room's noise level and not sound pressure: the device volume still decides how loud the room hears it. A higher level can lift the room's decay further above the background. Use a comfortable listening level, and lower it if the sound distorts or rattles.</p>
      ${limit ? `<p class="small muted">${esc(limit)}</p>` : ''}
    </div>`;
  }

  function noiseRow(p) {
    const n = p.setup.noise, a = p.setup.noiseAttempt, run = noiseRun(p), busy = !!(LIVE.state.take || LIVE.state.noise);
    const text = run ? '<span class="spin"></span>Measuring the background…'
      : n ? `${ui.dbfs(n.leqDbfs)} · ${ui.noiseWord(n.status)} · ${ui.timeOf(n.takenAt)}` : 'Not measured';
    const latest = a ? `<span class="small" style="color:var(--critical-ink)">Latest attempt ${a.status === 'failed' ? 'failed' : 'not usable'}: ${esc(a.reasons[0] || '')}${n ? ' The measurement above is kept.' : ''}</span>` : '';
    const change = AM.derive.noiseChange(p);
    const moved = change != null ? `<span class="small" style="color:var(--warn-ink)">${Math.abs(change)} dB ${change > 0 ? 'louder' : 'quieter'} than during the current RT60 measurement. Measure again to confirm it.</span>` : '';
    return `<div class="live-r"><span class="live-k">Background noise</span><span class="live-v">${text}</span>${latest}${moved}
      <div class="hstack">${run ? `<button class="btn btn-ghost btn-sm" data-action="cancelNoise">${icon('x', 14, 2)} Cancel</button>` : `<button class="btn btn-secondary btn-sm" data-action="measureNoise" ${busy || LIVE.state.mic.status !== 'live' ? 'disabled' : ''}>${icon(n ? 'refresh' : 'gauge', 14, 2)} ${n ? 'Measure again' : 'Measure noise'}</button>`}</div></div>`;
  }

  function view(ctx) {
    const p = ctx.project, take = takeFor(p), rec = p.measurement.recording, cur = AM.derive.measured(p);
    const st = screenState(p), [title, sub, tone, pill] = HEAD[st] || HEAD['ready-for-rt60'];
    const plan = curPlan(), phases = MEAS.phases(plan), running = !!take, sec = take ? take.sec : 0;
    const pos = D.POSITIONS.find(x => x.id === p.setup.position) || D.POSITIONS[0], guide = AM.guides.measure;
    const kind = LIVE.kindOf(p), K = D.DEVICE_KINDS[kind];

    const intro = `<section class="card measure-intro" aria-label="Before you measure">
      <button class="mi-thumb" data-action="openGuide" ${running ? 'disabled' : ''} aria-label="Play the How to measure video, ${esc(guide.lengthLabel)}">
        ${AM.guide.poster('measure')}<span class="mi-play">${icon('play', 22, 2.4)}</span><span class="mi-len">${esc(guide.lengthLabel)}</span>
      </button>
      <div class="mi-body">
        <span class="label">Before you start</span>
        <h2 class="mi-title">Record how the room rings after a short test signal</h2>
        <p class="mi-text">This ${esc(K.noun)} does the whole measurement. It records the room for ${plan.preRoll} s, plays a ${plan.seconds} s sweep from ${plan.f1} Hz to ${(plan.f2 / 1000).toFixed(plan.f2 % 1000 ? 1 : 0)} kHz through its own speaker, and keeps recording with its own microphone for ${plan.tail} s while the sound dies away. One take lasts about ${Math.round(plan.total)} seconds.</p>
        <ul class="mi-tips">
          <li>${icon(kind === 'mobile' ? 'phone' : 'laptop', 16, 2)}<span><b>Your ${esc(K.noun)}</b> at ${esc(pos.id)} · ${esc(pos.name)}, on a firm, stable support, not held, at least 1 m from walls where practical</span></li>
          <li>${icon('speaker', 16, 2)}<span><b>Its speaker and microphone</b> uncovered, headphones disconnected, volume high but not distorting</span></li>
          <li>${icon('users', 16, 2)}<span><b>Everyone</b> still and silent until the take is complete. Nobody touches the ${esc(K.noun)} or what it stands on</span></li>
        </ul>
        <div class="hstack">
          <button class="btn btn-secondary btn-sm" data-action="openGuide" ${running ? 'disabled' : ''}>${icon('info', 16, 2)} How to measure</button>
          <span class="small muted">${running ? 'Available when the take has finished.' : 'A short video. It does not start the measurement.'}</span>
        </div>
      </div>
    </section>`;

    const legacy = p.legacyNote ? ui.note(esc(p.legacyNote), 'warn', 'alert') : '';
    const retry = p.measurement.retry;
    const retryNote = retry && !running && !(rec && !evaluated(p, rec)) ? ui.note(`<b>The last take was not valid.</b> ${esc(retry.reason || '')} Before measuring again, close doors and windows, switch off ventilation and air conditioning, make sure nobody talks or moves, check that the ${esc(K.noun)}'s speaker and microphone are uncovered, and turn its volume up if it can play louder without distorting.`, 'warn') : '';

    const stepState = ph => {
      if (!running) return rec && !failedLatest(p) ? 'done' : 'idle';
      if (ph.id === 'complete') return 'idle';
      if (ph.id === 'quality') return take.phase === 'quality' ? 'active' : 'idle';
      if (take.phase === 'quality' || sec >= ph.to) return 'done';
      return sec >= ph.from ? 'active' : 'idle';
    };
    const proc = `<ol class="proc" aria-label="Measurement procedure">${phases.map((ph, i) => {
      const s = stepState(ph);
      return `<li class="proc-step is-${s}"><span class="proc-dot">${s === 'done' ? icon('check', 13, 2.6) : i + 1}</span><span class="proc-t">${ph.label}</span><span class="proc-h">${ph.hint}</span></li>`;
    }).join('')}</ol>`;

    const canStart = !startBlocker(p);
    const sweepState = !running ? (rec ? 'Played' : 'Waiting') : sec < plan.preRoll ? 'Starts in a moment' : take.phase === 'play' ? 'Playing' : 'Finished';
    const takeText = running ? (take.phase === 'quality' ? 'Analysing the recording' : `Recording · ${sec.toFixed(1)} of ${plan.total.toFixed(1)} s`)
      : st === 'failed' ? 'Last take failed' : rec ? (evaluated(p, rec) ? 'Take processed' : 'Take recorded, not processed yet') : 'Not measured';
    const panel = ui.card({
      title: `<span class="status-title">${title}</span>`, sub, right: ui.pill(tone, pill),
      body: `<div class="console">
        <div class="stack" style="gap:10px">
          <div class="scope"><canvas id="scope" aria-label="Microphone input"></canvas></div>
          <div class="prog-row"><span id="ptime">${running ? sec.toFixed(1) : '0.0'} s</span><div class="meter ${running ? 'is-live' : ''}"><i id="prog" style="width:${running ? (take.frac * 100).toFixed(1) : 0}%"></i></div><span>${plan.total.toFixed(1)} s</span></div>
        </div>
        <div class="live-list">
          ${micRow(p)}
          <div class="live-r"><span class="live-k">Input level</span>${ui.levelMeter('mic-level')}</div>
          ${noiseRow(p)}
          <div class="live-r"><span class="live-k">Test signal</span><span class="live-v">${icon('speaker', 16, 1.9)}Sweep · ${running && take.levelDb != null ? `${ui.levelDb(take.levelDb)} · ` : ''}${sweepState}</span></div>
          <div class="live-r"><span class="live-k">Measurement</span><span class="live-v">${takeText}</span></div>
        </div>
      </div>
      <div class="console-actions">
        ${levelControl(p, running)}
        <div class="hstack">
          ${running
            ? `<button class="btn btn-secondary" data-action="cancelTake" ${take.phase === 'quality' ? 'disabled' : ''}>${icon('stop', 16)} Cancel</button>`
            : `<button class="btn btn-primary" data-action="startTake" ${canStart ? '' : 'disabled'}><span class="rec">${icon('rec', 16, 2)}</span> ${rec || cur ? 'Measure again' : 'Start measurement'}</button>`}
          <span class="small muted">${running ? 'Leaving this step cancels the take.' : canStart ? (cur ? 'A new take becomes the current measurement only if it is valid.' : `Uses this ${esc(K.noun)}'s own speaker and microphone.`) : esc(startBlocker(p) || '')}</span>
        </div>
      </div>` });

    return { body: `${intro}${legacy}<div class="measure-label">${icon('wave', 15, 2)} Room measurement</div>${retryNote}${proc}${panel}${takeCard(p)}${currentCard(p)}`, primary: primaryFor(p) };
  }

  // The latest take: what was recorded, or why it could not be used.
  function takeCard(p) {
    const rec = p.measurement.recording, f = p.measurement.failed, cur = AM.derive.measured(p);
    if (failedLatest(p)) {
      return ui.card({ title: 'Latest take', sub: `${fmt.when(f.takenAt)} · sweep level ${ui.levelDb(f.levelDb)}`, right: ui.pill('critical', 'Not used', 'x'),
        body: `${ui.note(`<b>This take could not be used.</b> ${esc(f.reason)}`, 'critical')}${cur ? `<p class="small muted">The current measurement from ${fmt.when(cur.takenAt)} is kept.</p>` : ''}` });
    }
    if (!rec) return '';
    const lv = rec.levels, cpu = p.processing;
    const status = cpu.result && cpu.result.recordingId === rec.id ? ui.pill('good', 'Current measurement', 'seal')
      : cpu.attempt && cpu.attempt.recordingId === rec.id ? ui.pill('critical', 'Not valid', 'x') : ui.pill('neutral', 'Waiting to be processed');
    const rpos = D.POSITIONS.find(x => x.id === rec.position);
    return ui.card({
      title: 'Latest take', sub: fmt.when(rec.takenAt), right: status,
      body: `<div class="grid g2">
        ${ui.kv([
          ['Device', rec.deviceKind ? esc(D.DEVICE_KINDS[rec.deviceKind].name) : '—'],
          ['Position', rpos ? `${rpos.id} · ${esc(rpos.name)}` : '—'],
          ['Microphone', esc(rec.deviceLabel || '—')],
          ['Sound output', rec.outputLabel ? esc(rec.outputLabel) : 'Not named by this browser'],
          ['Sample rate', `${rec.sampleRate / 1000} kHz`],
          ['Sweep level', `${ui.levelDb(rec.plan && rec.plan.levelDb)}${rec.plan && rec.plan.playedPeakDbfs != null ? `<div class="kv-note">played peak ${ui.dbfs(rec.plan.playedPeakDbfs)}</div>` : ''}`],
        ])}
        ${ui.kv([
          ['Arrival delay', rec.analysis.latencySec != null ? `${(rec.analysis.latencySec * 1000).toFixed(0)} ms<div class="kv-note">read from the recording</div>` : '—'],
          ['Peak level', ui.dbfs(lv.peakDbfs)], ['Background before the signal', ui.dbfs(lv.preRollDbfs)],
          ['Signal level during the sweep', ui.dbfs(lv.sweepDbfs)], ['Signal above background', `${lv.snrDb.toFixed(1)} dB`],
          ['Distortion', `${ui.distortionText(rec.analysis.distortion)}<div class="kv-note">harmonics against the main response</div>`],
        ])}
      </div>
      ${ui.distortionNote(rec.analysis.distortion) ? ui.note(esc(ui.distortionNote(rec.analysis.distortion)), 'warn') : ''}
      ${rec.warnings && rec.warnings.length ? ui.note(rec.warnings.map(esc).join(' '), 'warn') : ''}
      <p class="small muted">Recorded audio is analysed straight away and not stored; the project keeps the analysis.</p>`,
    });
  }

  // The current measurement, if there is one: what the rest of the project uses.
  function currentCard(p) {
    const cur = AM.derive.measured(p), hist = p.processing.history || [], avg = AM.derive.averageRT60(p);
    const h = cur && cur.headline;
    const body = cur
      ? `<div class="vol"><span class="stat-v">${avg.available ? `${avg.value.toFixed(2)}<small>s</small>` : '—'}</span><span class="muted">${avg.available ? AM.services.rt60Average.LABEL : `No average RT60 (500–2000 Hz): ${esc(avg.reason || '')}`} · at ${fmt.hz(h.f)}: ${fmt.s(h.rt60)}, ${h.method}, ${h.confidence.toLowerCase()} confidence · sweep level ${ui.levelDb(cur.meta && cur.meta.plan && cur.meta.plan.levelDb)} · taken ${fmt.when(cur.takenAt)}</span></div>${hist.length ? `<p class="small muted">${hist.length} earlier measurement${hist.length > 1 ? 's' : ''} replaced (superseded).</p>` : ''}`
      : '<div class="vol"><span class="stat-v">—</span><span class="muted">RT60 not measured</span></div>';
    return ui.card({ title: 'Current measurement', right: cur ? ui.pill('good', 'Current', 'seal') : ui.pill('neutral', 'Not measured'), body });
  }

  function primaryFor(p) {
    const rec = p.measurement.recording;
    if (takeFor(p)) return null;                                  // continue (disabled while running)
    if (rec && rec.status === 'captured' && !evaluated(p, rec)) return null; // "Process recording"
    if (AM.derive.measured(p) && !failedLatest(p)) return null;
    return !startBlocker(p) ? { label: rec || AM.derive.measured(p) ? 'Measure again' : 'Start measurement', action: 'startTake', rec: true } : null;
  }

  /* ---------- live drawing ---------- */
  function draw(p) {
    const cv = document.getElementById('scope');
    if (!cv) return;
    const dpr = window.devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight;
    if (!w || !h) return;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    const g = cv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const css = getComputedStyle(cv), col = n => css.getPropertyValue(n).trim(), mid = h / 2, amp = h * 0.42;
    g.font = '11px ' + col('--font');
    const take = takeFor(p), rec = p.measurement.recording, L = LIVE.state;
    const text = (t, x = 8) => { g.fillStyle = col('--scope-dim'); g.fillText(t, x, 16); };
    const env = (vals, n) => {
      g.fillStyle = col('--scope-trace');
      const bw = w / n;
      for (let i = 0; i < vals.length; i++) { const y = Math.max(0.5, Math.min(1, vals[i]) * amp); g.fillRect(i * bw, mid - y, Math.max(1, bw - 0.5), y * 2); }
    };
    const regions = plan => {
      const X = t => (t / plan.total) * w;
      g.fillStyle = col('--scope-region'); g.fillRect(X(plan.preRoll), 0, X(plan.preRoll + plan.seconds) - X(plan.preRoll), h);
      g.fillStyle = col('--scope-dim'); g.fillText('Test signal', X(plan.preRoll) + 8, 16); g.fillText('Decay', X(plan.preRoll + plan.seconds) + 8, 16);
    };
    g.fillStyle = col('--scope-grid'); g.fillRect(0, Math.round(mid), w, 1);
    if (take) {
      regions(curPlan());
      env(take.envelope, take.envelope.length);
      g.fillStyle = col('--brand'); g.fillRect(take.frac * w - 1, 0, 2, h);
    } else if (L.mic.status === 'live' && L.levels.length) {
      // Live input: the last few seconds of level reports (RMS, dBFS mapped from −90 to 0 dB).
      text('Live input');
      const n = 140, vals = L.levels.map(d => Math.max(0, (d + 90) / 90));
      g.fillStyle = col('--scope-trace');
      const bw = w / n;
      vals.forEach((v, i) => { const y = Math.max(0.5, v * amp); g.fillRect((n - vals.length + i) * bw, mid - y, Math.max(1, bw - 1), y * 2); });
    } else if (rec && rec.waveform) {
      regions(rec.plan);
      env(rec.waveform, rec.waveform.length);
    } else {
      g.fillStyle = col('--scope-dim'); g.textAlign = 'center';
      g.fillText(L.mic.status === 'live' ? 'Waiting for audio' : 'Microphone not connected', w / 2, mid - 10);
      g.textAlign = 'start';
    }
  }

  function update(p) {
    const take = takeFor(p), $ = id => document.getElementById(id);
    ui.updateLevel('mic-level', LIVE.state.mic);
    if (take) {
      const pr = $('prog'); if (pr) pr.style.width = (take.frac * 100).toFixed(1) + '%';
      const pt = $('ptime'); if (pt) pt.textContent = take.sec.toFixed(1) + ' s';
    }
    draw(p);
  }

  W.define('measure', {
    view,
    canContinue: p => {
      if (takeFor(p)) return { ok: false, reason: 'Wait for the measurement to finish.' };
      const rec = p.measurement.recording;
      if (rec && rec.status === 'captured') return { ok: true };
      if (AM.derive.measured(p)) return { ok: true };
      return { ok: false, reason: startBlocker(p) || 'Run the measurement first.' };
    },
    continueLabel: 'Process recording',
    actions: {
      startTake: ctx => {
        const why = startBlocker(ctx.project);
        if (why) { S.toast(why); return; }
        if (S.state.ui.sheet && S.state.ui.sheet.kind === 'guide') S.state.ui.sheet = null; // never play the video during a take
        LIVE.measureRT60(ctx.project);
      },
      cancelTake: () => LIVE.cancelTake(),
      // The sweep level for the next take; never while a take is running (that take keeps the level it started with).
      sweepLevel: (ctx, v) => {
        if (takeFor(ctx.project)) return;
        S.update(pp => { pp.setup.sweepLevelDb = AN.sweepLevel(AN.sweepLevel(pp.setup.sweepLevelDb) + Math.sign(Number(v) || 0) * AN.levelRange().step); });
      },
      sweepLevelReset: ctx => { if (!takeFor(ctx.project)) S.update(pp => { pp.setup.sweepLevelDb = 0; }); },
      measureNoise: ctx => LIVE.measureNoise(ctx.project),
      cancelNoise: () => LIVE.cancelNoise(),
      reconnectMic: ctx => LIVE.startMonitor(ctx.project, true),
      resumeMic: () => LIVE.resume(),
      // The instructional video opens over this step and closes back to it. Not during a take.
      openGuide: ctx => { if (!takeFor(ctx.project)) S.ui({ sheet: { kind: 'guide', id: 'measure' } }); },
      closeGuide: () => {
        S.ui({ sheet: null });
        const b = document.querySelector('[data-action="startTake"]');
        if (b) { b.scrollIntoView({ block: 'center', behavior: 'smooth' }); b.focus({ preventScroll: true }); }
      },
    },
    mount(root, ctx) {
      const p = ctx.project;
      if (!p) return;
      LIVE.bind(() => update(p));
      // The microphone is opened while this step is on screen (the browser has already allowed it in Setup).
      if (p.setup.permission === 'granted' || LIVE.state.mic.status === 'live') LIVE.startMonitor(p);
      update(p);
    },
    resize: () => { const p = S.state.project; if (p) draw(p); },
    leave() {
      if (LIVE.state.take) LIVE.cancelTake();
      if (LIVE.state.noise) LIVE.cancelNoise();
      LIVE.bind(null);
      LIVE.stopMonitor();
    },
    // Developer tools cannot fill this step: it needs a real take. A project that already has one can pass.
    demoFill: p => !!(p.measurement.recording || AM.derive.measured(p)),
  });
})(window.AM);

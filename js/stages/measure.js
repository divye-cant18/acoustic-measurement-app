/* Step 4 · Acoustic Measurement — a real take: the microphone is opened when this step is shown, the background is
   recorded, the test sweep is played through this device's own speaker and the room's response is recorded by its own
   microphone, then analysed. One device does all of it; nothing else is connected.
   Everything on this screen reads AM.live (js/measurement/live.js) and the project; nothing here makes up a value.
   A captured take still has to pass Processing before it becomes the current measurement.
   The room is measured at two or more positions (AM.derive.positions): the positions card shows which are done, which
   is selected for the next take and what is still needed; each position gets its own background check and take, and a
   position whose take was not valid can be measured again.
   The screen is drawn by the interface (src/screens/Measure.tsx); this file keeps the step's state, checks, actions and
   the live drawing (scope, level meter, progress) from real level reports. */
(function (AM) {
  'use strict';
  const W = AM.workflow, S = AM.store, ui = AM.ui;
  const LIVE = AM.live, MEAS = AM.services.measurement, AN = AM.analysis;

  const curPlan = () => AN.sweepPlan(LIVE.state.mic.sampleRate || 48000);
  const takeFor = p => (LIVE.state.take && LIVE.state.take.pid === p.id ? LIVE.state.take : null);
  const noiseRun = p => !!(LIVE.state.noise && LIVE.state.noise.pid === p.id);
  const evaluated = (p, rec) => !!rec && ((p.processing.result && p.processing.result.recordingId === rec.id) || (p.processing.attempt && p.processing.attempt.recordingId === rec.id));
  const failedLatest = p => { const f = p.measurement.failed, r = p.measurement.recording; return !!f && (!r || f.takenAt > r.takenAt); };

  /* Why a take cannot start right now (null when it can). With `auto`, a background check missing at this position is
     not a reason: Start measurement then checks the background here first and goes straight on to the take. */
  function startBlocker(p, auto) {
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
    // The room-preparation checklist of Measurement Setup (asked again after the device profile changes).
    const prep = ((W.get('setup') || {}).model || {}).PREP || [], left = prep.filter(([k]) => !p.setup.prep[k]).length;
    if (left) return `Finish the room preparation checklist in Measurement Setup (${prep.length - left} of ${prep.length} done).`;
    // A take recorded at another position and not processed yet would be replaced by the new one: process it first.
    const rec = p.measurement.recording;
    if (rec && rec.status === 'captured' && !evaluated(p, rec) && AM.derive.positionOf(rec) !== p.setup.position) return `Process the take recorded at ${AM.derive.positionOf(rec)} first (Process recording), so it is not replaced.`;
    if (!auto && !p.setup.noise) return 'Measure the background noise first.';
    if (!auto && noiseElsewhere(p)) return `Check the background noise here at ${p.setup.position} first.`;
    return null;
  }
  // Start measurement checks the background first when it has not been checked at this position.
  const needsNoise = p => !p.setup.noise || noiseElsewhere(p);
  // The take being worked out on this step, straight after it was recorded (Processing's job).
  const proc = () => (W.get('processing') || {}).model || {};
  const analysing = (p, rec) => { const j = proc().job && proc().job(); return !!(j && rec && j.recId === rec.id); };
  // The latest background check was made at another position than the one selected for the next take.
  const noiseElsewhere = p => !!(p.setup.noise && p.setup.noise.position && p.setup.noise.position !== p.setup.position);

  /* The state on screen, in the measurement-state terms of the service. */
  function screenState(p) {
    const T = MEAS.STATES, take = takeFor(p), rec = p.measurement.recording;
    if (take) return take.phase === 'quality' ? T.PROCESSING : T.MEASURING_RT60;
    if (noiseRun(p)) return T.MEASURING_NOISE;
    if (LIVE.state.mic.status !== 'live') return 'mic';
    if (!p.setup.noise) return p.setup.noiseAttempt ? T.NOISE_INVALID : T.NOT_MEASURED;
    if (noiseElsewhere(p)) return 'noise-elsewhere';
    if (failedLatest(p)) return T.FAILED;
    if (rec && !evaluated(p, rec)) return analysing(p, rec) ? 'analysing' : 'captured';
    const s = AM.derive.positions(p), here = s.rows.find(r => r.current);
    if (here && here.status === 'invalid') return 'take-invalid';
    if (s.complete && here && here.status === 'valid') return 'all-done';
    return T.READY_FOR_RT60;
  }
  function primaryFor(p) {
    const rec = p.measurement.recording;
    if (takeFor(p)) return null;                                  // continue (disabled while running)
    if (noiseRun(p)) return { label: 'Checking the background', action: 'continue' }; // disabled until it has finished
    if (rec && rec.status === 'captured' && !evaluated(p, rec)) return analysing(p, rec) ? { label: 'Working out the result', action: 'continue' } : null; // "Process recording"
    // The position selected for the next take has no valid take yet (or its latest failed): measure it.
    const here = AM.derive.positions(p).rows.find(r => r.current);
    if (here && here.status !== 'valid' && !startBlocker(p, true)) return { label: here.status === 'invalid' || here.status === 'failed' ? `Retry ${here.id}` : `Measure ${here.id}`, action: 'startTake', rec: true };
    // Enough positions measured: straight on to the results (Processing stays there for the details of each take).
    if (AM.derive.positions(p).complete && AM.derive.measured(p) && !failedLatest(p)) return { label: 'See results', action: 'seeResults' };
    // Nothing waiting to be processed: the step leads on to Processing, where the latest take's outcome is shown.
    const onward = rec || AM.derive.measured(p) ? { label: 'Continue to Processing', action: 'continue' } : null;
    if (AM.derive.measured(p) && !failedLatest(p)) return onward;
    return !startBlocker(p, true) ? { label: rec || AM.derive.measured(p) ? 'Measure again' : 'Start measurement', action: 'startTake', rec: true } : onward;
  }

  /* The result of a take, worked out on this step straight after it (Processing's own calculation). A valid one moves
     the next take to the next position that still needs one. */
  function workOut(p) {
    const run = proc().process;
    if (!run) return;
    run(p).then(result => {
      if (!result || !result.valid || S.state.project !== p || S.state.current !== 'measure') return;
      const s = AM.derive.positions(p);
      if (!s.complete && s.next && s.next !== p.setup.position) S.update(pp => { pp.setup.position = s.next; });
    });
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
      // The status line follows the recording too, not only the bar (it showed the second it was drawn at).
      const tt = $('take-text'); if (tt && take.phase !== 'quality' && take.seconds) tt.textContent = `Recording · ${take.sec.toFixed(1)} of ${take.seconds.toFixed(1)} s`;
    }
    draw(p);
  }

  W.define('measure', {
    // Read by the screen.
    model: { takeFor, noiseRun, evaluated, failedLatest, startBlocker, noiseElsewhere, needsNoise, screenState, curPlan, primaryFor },
    canContinue: p => {
      if (takeFor(p)) return { ok: false, reason: 'Wait for the measurement to finish.' };
      if (noiseRun(p)) return { ok: false, reason: 'Checking the background noise. Wait for it to finish.' };
      const rec = p.measurement.recording;
      if (rec && rec.status === 'captured') return analysing(p, rec) ? { ok: false, reason: 'Working out the result of the take. A few seconds.' } : { ok: true };
      if (AM.derive.measured(p)) return { ok: true };
      return { ok: false, reason: startBlocker(p) || 'Run the measurement first.' };
    },
    continueLabel: 'Process recording',
    actions: {
      /* One press measures a position: the background is checked here first when it has not been (a new position),
         then the take, then its result is worked out on this step. A valid result moves on to the next position that
         still needs one; with enough positions, See results is offered. */
      startTake: ctx => {
        const p = ctx.project, why = startBlocker(p, true);
        if (why) { S.toast(why); return; }
        if (S.state.ui.sheet && S.state.ui.sheet.kind === 'guide') S.state.ui.sheet = null; // never play the video during a take
        const here = () => S.state.project === p && S.state.current === 'measure';
        const take = () => {
          const before = p.measurement.recording && p.measurement.recording.id;
          LIVE.measureRT60(p, () => { const r = p.measurement.recording; if (here() && r && r.id !== before && r.status === 'captured') workOut(p); });
        };
        if (!needsNoise(p)) { take(); return; }
        const was = p.setup.noise && p.setup.noise.takenAt;
        LIVE.measureNoise(p, () => {
          const n = p.setup.noise; // checked here, and usable: straight on to the take
          if (here() && n && n.takenAt !== was && n.position === p.setup.position && !startBlocker(p)) take();
        });
      },
      // Enough positions: Measurement and Processing are done, on to Results.
      seeResults: ctx => {
        const p = ctx.project, s = AM.derive.positions(p), chk = W.get('processing').canContinue(p);
        if (!s.complete || !chk.ok) { S.toast(chk.ok ? `Measure ${s.need} more position${s.need > 1 ? 's' : ''} first.` : chk.reason); return; }
        S.complete('measure'); S.complete('processing');
        S.go('results');
      },
      cancelTake: () => LIVE.cancelTake(),
      // Selects the position for the next take (each take records it). Nothing measured changes.
      usePosition: (ctx, v) => { if (!takeFor(ctx.project) && !noiseRun(ctx.project) && AM.demo.POSITIONS.some(x => x.id === v)) S.update(pp => { pp.setup.position = v; }); },
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
      // A named video (the walkthrough from the Help menu) opens as itself; without a name, the measuring video.
      openGuide: (ctx, id) => { if (!takeFor(ctx.project)) S.ui({ sheet: { kind: 'guide', id: id && AM.guides[id] ? id : 'measure' }, navOpen: false }); },
      closeGuide: () => {
        const own = (S.state.ui.sheet || {}).id === 'measure';
        S.ui({ sheet: null });
        if (!own) return;
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

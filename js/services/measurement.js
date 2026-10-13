/* MeasurementService — LIVE. Real microphone audio (AM.audioIO), analysed by AM.analysis.
   It never returns a value without a recording behind it: when the microphone, the room or the signal does not allow a
   reliable result, it returns a failure with the reason. There is no simulated path and no fallback data.

   Single device: the device running the app is the whole measuring system. Its own speaker (the system's sound output)
   plays the test signal and its own microphone records the room. No second device, external speaker or external
   microphone is needed. The distance between its speaker and microphone and the delay between playing and recording
   are never assumed: the analysis reads both effects from the recording (analysis.js).

   Contract used by the stages:
     STATES, PHASES                     measurement states and the steps of one take
     plan(fs)                           test-signal plan (sweep range and durations) for a sample rate
     support()                          what this browser can do
     requestAccess(deviceId)            -> Promise<Access>       opens the microphone once, reads its settings, releases it
     monitor(deviceId, onLevel, onState) -> Promise<Monitor>     keeps the microphone open for live levels { session, stop() }
     measureNoise({ deviceId, onProgress })                      -> { done: Promise<NoiseResult>, cancel() }
     measureRT60({ deviceId, context, levelDb, onPhase, onProgress }) -> { done: Promise<Take>, cancel() }
       context: { position, deviceKind } recorded with the take (where the device stood, which kind it is)
       levelDb: the sweep level relative to the default (AM.analysis.sweepLevel); only the played copy is scaled
     deviceKind()                       'computer' | 'mobile', as the browser reports it
     outputLabel()                      the system sound output's name, or null when the browser does not say
     calibration(deviceId)              -> null: no calibration exists, so levels are relative input levels (dBFS)
     levelText(dbfs, deviceId)          how a level is shown: dBFS today, dB SPL once a calibration exists

   NoiseResult: AM.analysis.analyseNoise(...) + { id, takenAt, deviceLabel, settings, calibrated }
   Take: { id, takenAt, status: 'captured' | 'failed', reason, deviceLabel, outputLabel, deviceKind, position, sampleRate,
           settings, plan, levels, waveform, analysis: { latencySec, arrivalClarityDb, onsetSec, irSeconds, bands },
           warnings }   (no raw audio is stored) */
(function (AM) {
  'use strict';
  const IO = AM.audioIO, AN = AM.analysis;

  // Measurement states (the names follow the product specification). Stages derive the state on screen from the project.
  const STATES = {
    NOT_MEASURED: 'not-measured', READY: 'ready',
    MEASURING_NOISE: 'measuring-noise', NOISE_VALID: 'noise-valid', NOISE_INVALID: 'noise-invalid',
    READY_FOR_RT60: 'ready-for-rt60', MEASURING_RT60: 'measuring-rt60', PROCESSING: 'processing',
    VALID: 'valid', INVALID: 'invalid', FAILED: 'failed', SUPERSEDED: 'superseded', CURRENT: 'current',
  };

  // The steps of one take, with the time each one starts and ends (seconds into the take).
  function phases(p) {
    const s = p.preRoll, e = p.preRoll + p.seconds, end = p.total;
    return [
      { id: 'prepare', label: 'Background', hint: 'Recording the room before the signal', from: 0, to: s },
      { id: 'play', label: 'Play test signal', hint: 'Sweep from this device\'s speaker', from: s, to: e },
      { id: 'record', label: 'Record', hint: 'Capturing the response', from: 0, to: end },
      { id: 'monitor', label: 'Decay', hint: 'Listening to the room ring down', from: e, to: end },
      { id: 'quality', label: 'Analyse', hint: 'Impulse response and decay', from: end, to: end },
      { id: 'complete', label: 'Complete', hint: 'Take stored', from: end, to: end },
    ];
  }

  const newId = prefix => prefix + Date.now().toString(36) + (performance.now() * 1000 | 0).toString(36).slice(-4);
  const SETTING_KEYS = ['sampleRate', 'channelCount', 'echoCancellation', 'noiseSuppression', 'autoGainControl', 'latency'];
  const pickSettings = st => Object.fromEntries(SETTING_KEYS.filter(k => st && st[k] !== undefined).map(k => [k, st[k]]));

  // Browser processing that could not be switched off. Each one can change a decay, so the result carries a warning.
  function processingWarnings(st) {
    const w = [];
    if (st.autoGainControl === true) w.push('The browser kept automatic gain control on. It can change the level during the decay.');
    if (st.noiseSuppression === true) w.push('The browser kept noise suppression on. It can cut off the end of the decay and shorten the result.');
    if (st.echoCancellation === true) w.push('The browser kept echo cancellation on. It can remove part of the test signal and its decay.');
    return w;
  }

  // No calibration mechanism exists yet. A calibrated microphone would return { offsetDb, method, date } here.
  const calibration = () => null;
  function levelText(dbfs, deviceId) {
    if (dbfs == null || !isFinite(dbfs)) return 'Not measured';
    const cal = calibration(deviceId);
    return cal ? `${(dbfs + cal.offsetDb).toFixed(1)} dB SPL` : `${dbfs.toFixed(1)} dBFS`;
  }

  async function requestAccess(deviceId) {
    const s = await IO.acquire('access', deviceId);
    const info = { permission: 'granted', deviceId: s.deviceId, label: s.label, sampleRate: s.sampleRate, settings: pickSettings(s.settings), tap: s.tap.kind, checkedAt: new Date().toISOString() };
    IO.release('access');
    info.devices = await IO.devices();
    info.output = await IO.outputLabel();
    return info;
  }

  // Each subscription gets its own wrapper, so ending one (a take) never removes another (the live monitor).
  const subscribe = (s, fn) => (fn ? s.onLevel(l => fn(l)) : () => {});

  async function monitor(deviceId, onLevel, onState) {
    const s = await IO.acquire('monitor', deviceId);
    const offL = subscribe(s, onLevel), offS = onState ? s.onState(st => onState(st)) : () => {};
    return { session: s, stop: () => { offL(); offS(); IO.release('monitor'); } };
  }

  function measureNoise({ deviceId, onProgress, onLevel }) {
    let cancelled = false, rec = null;
    const done = (async () => {
      const s = await IO.acquire('noise', deviceId);
      const off = subscribe(s, onLevel);
      try {
        await s.waitForAudio();
        const c = AN.CRITERIA.noise, fs = s.sampleRate;
        rec = s.record(Math.round((c.seconds + c.settle) * fs), onProgress);
        const x = await rec.done;
        if (cancelled) throw new IO.AudioError('cancelled', IO.MESSAGES.cancelled);
        const r = AN.analyseNoise(x, fs);
        return Object.assign(r, {
          id: newId('n'), takenAt: new Date().toISOString(), deviceId: s.deviceId, deviceLabel: s.label,
          settings: pickSettings(s.settings), calibrated: !!calibration(s.deviceId),
          warnings: r.warnings.concat(processingWarnings(s.settings)),
        });
      } finally { off(); IO.release('noise'); }
    })();
    return { done, cancel: () => { cancelled = true; if (rec) rec.cancel(); } };
  }

  function measureRT60({ deviceId, context = {}, levelDb = 0, onPhase, onProgress, onLevel }) {
    let cancelled = false, rec = null, play = null;
    const done = (async () => {
      const s = await IO.acquire('take', deviceId);
      const off = subscribe(s, onLevel);
      try {
        await s.waitForAudio();
        const output = await IO.outputLabel();
        // The reference sweep (and the inverse filter made from it) stays at the default level; only the copy that is
        // played carries the chosen level's gain, so it is applied once and never to the recording.
        const level = AN.sweepLevel(levelDb), plan = Object.assign(AN.sweepPlan(s.sampleRate), { levelDb: level });
        const sweep = AN.makeSweep(plan), played = AN.playbackSignal(sweep.signal, level), total = Math.round(plan.total * plan.fs);
        let phase = '';
        const at = sec => (sec < plan.preRoll ? 'prepare' : sec < plan.preRoll + plan.seconds ? 'play' : 'monitor');
        const step = id => { if (id !== phase) { phase = id; if (onPhase) onPhase(id); } };
        step('prepare');
        rec = s.record(total, (sec, frac, chunk, offset) => { step(at(sec)); if (onProgress) onProgress(sec, frac, chunk, offset, total, plan); });
        play = s.play(played.signal, plan.preRoll);
        const x = await rec.done;
        if (cancelled) throw new IO.AudioError('cancelled', IO.MESSAGES.cancelled);
        step('quality');
        await new Promise(r => setTimeout(r, 40)); // let the screen show "Analysing" before the analysis runs
        const a = AN.analyseTake(x, plan, sweep);
        return {
          id: newId('r'), takenAt: new Date().toISOString(), status: a.status, reason: a.reason,
          deviceId: s.deviceId, deviceLabel: s.label, outputLabel: output, deviceKind: context.deviceKind || IO.deviceKind(), position: context.position || null,
          sampleRate: plan.fs, settings: pickSettings(s.settings), tap: s.tap.kind,
          plan: { f1: plan.f1, f2: plan.f2, seconds: plan.seconds, preRoll: plan.preRoll, tail: plan.tail, total: plan.total, amplitude: plan.amplitude, fadeIn: AN.CRITERIA.take.fadeIn,
            levelDb: played.levelDb, playedPeakDbfs: Math.round(200 * Math.log10(played.peak)) / 10 },
          levels: a.levels, waveform: a.waveform,
          analysis: { latencySec: a.latencySec, arrivalClarityDb: a.arrivalClarityDb, onsetSec: a.onsetSec, irSeconds: a.irSeconds, distortion: a.distortion, bands: a.bands },
          warnings: processingWarnings(s.settings),
        };
      } finally { off(); if (play) play.stop(); IO.release('take'); }
    })();
    return { done, cancel: () => { cancelled = true; if (rec) rec.cancel(); if (play) play.stop(); } };
  }

  AM.services.measurement = {
    kind: 'live', STATES, phases, plan: AN.sweepPlan, support: IO.support, permissionState: IO.permissionState, devices: IO.devices,
    deviceKind: IO.deviceKind, outputLabel: IO.outputLabel,
    requestAccess, monitor, measureNoise, measureRT60, calibration, levelText, processingWarnings,
  };
})(window.AM);

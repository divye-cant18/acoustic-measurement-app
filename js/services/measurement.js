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
     requestAccess(deviceId, outputId, context) -> Promise<Access> opens the microphone and output once, reads the whole
                                        configuration (config), lists inputs and choosable outputs, releases them
     monitor(deviceId, onLevel, onState, outputId) -> Promise<Monitor>  keeps the microphone open for live levels
     measureNoise({ deviceId, outputId, context, onProgress })   -> { done: Promise<NoiseResult>, cancel() }
     measureRT60({ deviceId, outputId, context, levelDb, onPhase, onProgress }) -> { done: Promise<Take>, cancel() }
       context: { position, deviceKind, profileChosen } recorded with the take (where the device stood, its profile)
     processingState(settings, capabilities) / processingText(state)  requested · reported · possible, per feature
     configOf(session, context, outputName)  the configuration in use, stored with each take and noise check
       levelDb: the sweep level relative to the default (AM.analysis.sweepLevel); only the played copy is scaled
     deviceKind()                       'computer' | 'mobile', as the browser reports it
     outputLabel()                      the system sound output's name, or null when the browser does not say
     calibration(deviceId)              -> null: no calibration exists, so levels are relative input levels (dBFS)
     levelText(dbfs, deviceId)          how a level is shown: "N dB below max" (dBFS) today, dB SPL once a calibration exists

   NoiseResult: AM.analysis.analyseNoise(...) + { id, takenAt, deviceLabel, settings, calibrated }
   Take: { id, takenAt, status: 'captured' | 'failed', reason, deviceLabel, outputLabel, deviceKind, position, sampleRate,
           settings, plan, levels, waveform, analysis: { latencySec, arrivalClarityDb, onsetSec, irSeconds, distortion, timing,
           clicks, sweepGain, bands }, config, integrity: { inputLostFrames, outputUnderruns, outputUnderrunMs } (the
           browser's own counts of lost audio during the take, null where it keeps none), warnings }
         (no raw audio is stored) */
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

  /* The three kinds of browser processing this app asks to be off, each as requested, reported and possible:
       state 'off'      reported off
             'on'       reported on: the browser did not switch it off
             'unknown'  the browser does not report it (not the same as off)
       capable: the values the browser says it can apply (getCapabilities), or null when it does not say.
     The one description every screen and the report use. */
  const PROCESSING = [['echoCancellation', 'echo cancellation'], ['noiseSuppression', 'noise suppression'], ['autoGainControl', 'automatic gain']];
  function processingState(settings, capabilities) {
    return PROCESSING.map(([key, name]) => {
      const rep = settings ? settings[key] : undefined, cap = capabilities && Array.isArray(capabilities[key]) ? capabilities[key] : null;
      return { key, name, requested: false, reported: rep === true || rep === false ? rep : null, capable: cap, state: rep === false ? 'off' : rep === true ? 'on' : 'unknown' };
    });
  }
  // One line: "echo cancellation off · noise suppression not reported · automatic gain ON". Never "all off" unless all
  // three are reported off.
  function processingText(state) {
    const word = { off: 'off', on: 'ON (not switched off)', unknown: 'not reported' };
    if (state.every(s => s.state === 'off')) return 'Echo cancellation, noise suppression and automatic gain all reported off';
    const t = state.map(s => `${s.name} ${word[s.state]}`).join(' · ');
    return t[0].toUpperCase() + t.slice(1);
  }

  // The same in a few words, for narrow places (the PDF report): never "off" for a feature that was not reported off.
  function processingShort(state) {
    const by = st => state.filter(s => s.state === st).map(s => s.name), on = by('on'), off = by('off'), unknown = by('unknown');
    if (on.length) return `ON: ${on.join(', ')}`;
    if (!unknown.length) return 'All three reported off';
    if (!off.length) return 'Not reported by this browser';
    const cap = t => t[0].toUpperCase() + t.slice(1);
    return off.length === 1 ? `${cap(off[0])} off; others unknown` : `${cap(unknown[0])} unknown; others off`;
  }

  // Browser processing that is on, or not reported. Each one can change a decay, so the result carries a warning (and
  // so no band is "High confidence"); one reported on also makes the take invalid (processing.js).
  function processingWarnings(st) {
    const w = [];
    if (st.autoGainControl === true) w.push('The browser kept automatic gain control on. It can change the level during the decay.');
    if (st.noiseSuppression === true) w.push('The browser kept noise suppression on. It can cut off the end of the decay and shorten the result.');
    if (st.echoCancellation === true) w.push('The browser kept echo cancellation on. It can remove part of the test signal and its decay.');
    const unknown = PROCESSING.filter(([k]) => st[k] !== true && st[k] !== false).map(([, n]) => n);
    if (unknown.length) w.push(`This browser does not report whether ${unknown.join(' and ')} ${unknown.length > 1 ? 'are' : 'is'} switched off, so ${unknown.length > 1 ? 'they' : 'it'} may still be working on the recording. Results are given with medium confidence at most.`);
    return w;
  }

  // Browser and system family, for the configuration record (no version detail beyond the major number).
  function browserFamily() {
    const ua = navigator.userAgent || '';
    const b = /Edg\//.test(ua) ? 'Edge' : /SamsungBrowser/.test(ua) ? 'Samsung Internet' : /CriOS/.test(ua) ? 'Chrome (iOS)' : /FxiOS/.test(ua) ? 'Firefox (iOS)' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
    const os = /iPhone|iPad|iPod/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? (navigator.maxTouchPoints > 1 ? 'iPadOS' : 'macOS') : /Windows/.test(ua) ? 'Windows' : /CrOS/.test(ua) ? 'ChromeOS' : /Linux/.test(ua) ? 'Linux' : 'other';
    return `${b} on ${os}`;
  }

  /* The configuration a session actually has, as one record: what was requested, what the browser reports, what it
     could not confirm. context: { profile, profileChosen } from the project. Stored with every take and noise check,
     so a report shows the configuration that was used, not what is selected now. */
  function configOf(s, context = {}, outputName = null) {
    const out = s.output || { requested: 'default', selectable: false, applied: null, error: null };
    return {
      profile: context.profile || IO.deviceKind(), profileChosen: !!context.profileChosen, detected: IO.deviceKind(),
      input: { deviceId: s.deviceId, label: s.label },
      // Confirmed only when a specific output was selected and the browser applied it: "the system default" does not
      // say which device plays (on a phone it may be the earpiece; on a computer, Bluetooth headphones).
      output: { requested: out.requested, selectable: out.selectable, applied: out.applied, error: out.error, label: outputName,
        verified: !!(out.selectable && !out.error && out.requested !== 'default' && out.applied === out.requested) },
      requested: { echoCancellation: IO.REQUESTED.echoCancellation, noiseSuppression: IO.REQUESTED.noiseSuppression, autoGainControl: IO.REQUESTED.autoGainControl, channelCount: 1 },
      supported: s.supported || null, processing: processingState(s.settings, s.capabilities),
      sampleRate: s.sampleRate, channelCount: s.settings && s.settings.channelCount != null ? s.settings.channelCount : null, tap: s.tap ? s.tap.kind : null,
      browser: browserFamily(),
    };
  }

  /* Lost audio the browser itself counted during a take, from readings before it (c0) and after it (cIn for the input,
     cOut for the output; audio-io.js counters): { inputLostFrames, outputUnderruns, outputUnderrunMs } with null for a
     count this browser does not keep. processing.js makes a take with any loss not valid. */
  function integrityOf(c0, cIn, cOut) {
    const lost = (a, b) => Math.max(0, (b.total - b.delivered) - (a.total - a.delivered));
    return {
      inputLostFrames: c0 && c0.input && cIn && cIn.input ? lost(c0.input, cIn.input) : null,
      outputUnderruns: c0 && c0.output && cOut && cOut.output ? Math.max(0, cOut.output.underruns - c0.output.underruns) : null,
      outputUnderrunMs: c0 && c0.output && cOut && cOut.output ? Math.round(Math.max(0, cOut.output.underrunSec - c0.output.underrunSec) * 1000) : null,
    };
  }

  // No calibration mechanism exists yet. A calibrated microphone would return { offsetDb, method, date } here.
  const calibration = () => null;
  function levelText(dbfs, deviceId) {
    if (dbfs == null || !isFinite(dbfs)) return 'Not measured';
    const cal = calibration(deviceId);
    return cal ? `${(dbfs + cal.offsetDb).toFixed(1)} dB SPL` : AM.util.fmt.dbfs(dbfs);
  }

  // Opens the microphone (and the selected output) once, reads back the whole configuration, releases them.
  async function requestAccess(deviceId, outputId, context = {}) {
    const s = await IO.acquire('access', deviceId, outputId);
    const output = await IO.outputLabel(s.output && s.output.applied);
    const info = { permission: 'granted', deviceId: s.deviceId, label: s.label, sampleRate: s.sampleRate, settings: pickSettings(s.settings), tap: s.tap.kind, checkedAt: new Date().toISOString(),
      config: configOf(s, context, output) };
    IO.release('access');
    info.devices = await IO.devices();
    info.outputs = await IO.outputs();
    info.output = output;
    return info;
  }

  // Each subscription gets its own wrapper, so ending one (a take) never removes another (the live monitor).
  const subscribe = (s, fn) => (fn ? s.onLevel(l => fn(l)) : () => {});

  async function monitor(deviceId, onLevel, onState, outputId) {
    const s = await IO.acquire('monitor', deviceId, outputId);
    const offL = subscribe(s, onLevel), offS = onState ? s.onState(st => onState(st)) : () => {};
    return { session: s, stop: () => { offL(); offS(); IO.release('monitor'); } };
  }

  function measureNoise({ deviceId, outputId, context = {}, onProgress, onLevel }) {
    let cancelled = false, rec = null;
    const done = (async () => {
      const s = await IO.acquire('noise', deviceId, outputId);
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
          config: configOf(s, context, await IO.outputLabel(s.output && s.output.applied)),
          warnings: r.warnings.concat(processingWarnings(s.settings)),
        });
      } finally { off(); IO.release('noise'); }
    })();
    return { done, cancel: () => { cancelled = true; if (rec) rec.cancel(); } };
  }

  /* context: { position, deviceKind, profileChosen } from the project. The take keeps the configuration it was made
     with (config), so the result and the report describe what was used, not what is selected later. */
  function measureRT60({ deviceId, outputId, context = {}, levelDb = 0, onPhase, onProgress, onLevel }) {
    let cancelled = false, rec = null, play = null;
    const done = (async () => {
      const s = await IO.acquire('take', deviceId, outputId);
      const off = subscribe(s, onLevel);
      try {
        await s.waitForAudio();
        if (s.output && s.output.error) throw new IO.AudioError('error', `The selected sound output could not be used (${s.output.error}). Choose another output in Measurement Setup.`);
        const output = await IO.outputLabel(s.output && s.output.applied);
        // The reference sweep (and the inverse filter made from it) stays at the default level; only the copy that is
        // played carries the chosen level's gain, so it is applied once and never to the recording.
        const level = AN.sweepLevel(levelDb), plan = Object.assign(AN.sweepPlan(s.sampleRate), { levelDb: level });
        const sweep = AN.makeSweep(plan), played = AN.playbackSignal(sweep.signal, level), total = Math.round(plan.total * plan.fs);
        let phase = '';
        const at = sec => (sec < plan.preRoll ? 'prepare' : sec < plan.preRoll + plan.seconds ? 'play' : 'monitor');
        const step = id => { if (id !== phase) { phase = id; if (onPhase) onPhase(id); } };
        step('prepare');
        const c0 = s.counters ? s.counters() : null;
        rec = s.record(total, (sec, frac, chunk, offset) => { step(at(sec)); if (onProgress) onProgress(sec, frac, chunk, offset, total, plan); });
        play = s.play(played.signal, plan.preRoll);
        const x = await rec.done;
        if (cancelled) throw new IO.AudioError('cancelled', IO.MESSAGES.cancelled);
        step('quality');
        // The browser's own counts over the take (where it keeps them): the input's at once, the output's a second later,
        // when its totals have caught up; the analysis waits, so nothing else keeps the page busy meanwhile.
        const cIn = s.counters ? s.counters() : null;
        await new Promise(r => setTimeout(r, c0 && c0.output ? 1100 : 40));
        const cOut = s.counters ? s.counters() : null;
        const integrity = integrityOf(c0, cIn, cOut);
        if (cancelled) throw new IO.AudioError('cancelled', IO.MESSAGES.cancelled);
        const a = AN.analyseTake(x, plan, sweep);
        return {
          id: newId('r'), takenAt: new Date().toISOString(), status: a.status, reason: a.reason,
          deviceId: s.deviceId, deviceLabel: s.label, outputLabel: output, deviceKind: context.deviceKind || IO.deviceKind(), position: context.position || null,
          sampleRate: plan.fs, settings: pickSettings(s.settings), tap: s.tap.kind,
          plan: { f1: plan.f1, f2: plan.f2, seconds: plan.seconds, preRoll: plan.preRoll, tail: plan.tail, total: plan.total, amplitude: plan.amplitude, fadeIn: AN.CRITERIA.take.fadeIn,
            levelDb: played.levelDb, playedPeakDbfs: Math.round(200 * Math.log10(played.peak)) / 10 },
          levels: a.levels, waveform: a.waveform,
          analysis: { latencySec: a.latencySec, arrivalClarityDb: a.arrivalClarityDb, onsetSec: a.onsetSec, irSeconds: a.irSeconds, distortion: a.distortion, timing: a.timing, clicks: a.clicks, sweepGain: a.sweepGain, bands: a.bands },
          config: configOf(s, { profile: context.deviceKind, profileChosen: context.profileChosen }, output),
          integrity,
          warnings: processingWarnings(s.settings),
        };
      } finally { off(); if (play) play.stop(); IO.release('take'); }
    })();
    return { done, cancel: () => { cancelled = true; if (rec) rec.cancel(); if (play) play.stop(); } };
  }

  AM.services.measurement = {
    kind: 'live', STATES, phases, plan: AN.sweepPlan, support: IO.support, permissionState: IO.permissionState, devices: IO.devices,
    outputs: IO.outputs, canSelectOutput: IO.canSelectOutput, deviceKind: IO.deviceKind, outputLabel: IO.outputLabel, REQUESTED: IO.REQUESTED,
    requestAccess, monitor, measureNoise, measureRT60, calibration, levelText, processingWarnings, processingState, processingText, processingShort, configOf, browserFamily, integrityOf,
  };
})(window.AM);

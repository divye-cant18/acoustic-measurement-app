/* Live measurement controller: what the microphone is doing right now, the measurement in progress, and how a
   finished measurement is written to the project. Stages render this state; they never compute acoustic values.

   Rules it enforces:
     - The microphone is only reported as live while a real stream is open and samples are arriving.
     - A noise measurement or take is applied only to the project that started it, if it is still open.
     - An invalid or failed noise measurement never replaces the current valid one; it is kept as the latest attempt.
     - A failed take never replaces the latest good take; a take becomes the CURRENT measurement only after Processing
       has validated it (stages/processing.js).
     - A new valid noise measurement that differs by more than 6 dB from the one behind the current RT60 puts the
       measurement steps up for review.

   state.mic.status: off | starting | live | suspended | muted | stopped | error (code: denied, no-device, busy, …) */
(function (AM) {
  'use strict';
  const MEAS = AM.services.measurement, S = () => AM.store;

  const state = {
    mic: { status: 'off', code: null, message: null, label: '', sampleRate: null, settings: null, deviceId: null, level: null, clipAt: 0, tap: null },
    devices: [],
    output: null,    // the system sound output's name, when the browser reports it
    access: null,    // { pid } while asking for access
    noise: null,     // { pid, sec, frac, ctl }
    take: null,      // { pid, phase, sec, frac, total, ctl, envelope }
    levels: [],      // recent input levels (dBFS) for the live trace
  };
  let monitor = null, updater = null, queued = false, shownReceiving = null, watch = 0;

  // Re-render once after the current work (safe to call from inside a render).
  const render = () => { if (queued) return; queued = true; queueMicrotask(() => { queued = false; if (AM.app) AM.app.render(); }); };
  const notify = () => { if (updater) { try { updater(state); } catch (e) { /* a screen element went away */ } } };
  const bind = fn => { updater = fn; };
  const isOpen = p => S().state.project === p;
  // The measuring device's kind: as chosen in Measurement Setup, otherwise as the browser reports it.
  const kindOf = p => (p && p.setup.deviceKind) || MEAS.deviceKind();

  function onLevel(level) {
    state.mic.level = level;
    if (level.clipped) state.mic.clipAt = performance.now();
    state.levels.push(level.rmsDbfs);
    if (state.levels.length > 140) state.levels.shift();
    checkReceiving();
    notify();
  }
  // Whether audio is arriving decides what can be started. Screens read receiving() while drawing; when the input no
  // longer matches what they last read (checked on every level report, and every second while the microphone is
  // open), they are redrawn.
  function checkReceiving() { if (shownReceiving != null && isReceiving() !== shownReceiving) render(); }
  function onState(status) {
    state.mic.status = status;
    if (status === 'stopped') {
      state.mic.code = 'stopped'; state.mic.message = AM.audioIO.MESSAGES.stopped;
      if (monitor) { monitor.stop(); monitor = null; }
    }
    render();
  }
  const isReceiving = () => !!(state.mic.level && performance.now() - state.mic.level.at < 1000 && state.mic.level.samples > 0);
  const receiving = () => (shownReceiving = isReceiving());

  // Microphone access results also update what the project knows about its input.
  function notePermission(p, e) {
    if (!isOpen(p)) return;
    const code = e ? (e.code || 'error') : 'granted';
    if (code === 'cancelled' || code === 'stopped' || code === 'suspended') return;
    if (p.setup.permission !== code) S().update(pp => { pp.setup.permission = code; });
  }

  async function requestAccess(p) {
    if (state.access) return;
    state.access = { pid: p.id };
    render();
    try {
      const info = await MEAS.requestAccess(p.setup.deviceId);
      state.devices = info.devices;
      state.output = info.output;
      Object.assign(state.mic, { code: null, message: null });
      if (isOpen(p)) S().update(pp => { Object.assign(pp.setup, { permission: 'granted', deviceLabel: info.label, input: { label: info.label, sampleRate: info.sampleRate, settings: info.settings, tap: info.tap, checkedAt: info.checkedAt } }); });
    } catch (e) {
      Object.assign(state.mic, { code: e.code || 'error', message: e.message });
      notePermission(p, e);
    } finally { state.access = null; render(); }
  }

  async function refreshDevices() { state.devices = await MEAS.devices(); state.output = await MEAS.outputLabel(); render(); }

  async function startMonitor(p, force) {
    if (monitor && state.mic.deviceId === p.setup.deviceId) return;
    // Failures are not retried on their own: the screen offers "Try again".
    if (!force && ['starting', 'error', 'stopped'].includes(state.mic.status)) return;
    if (monitor) stopMonitor();
    Object.assign(state.mic, { status: 'starting', code: null, message: null, deviceId: p.setup.deviceId });
    render();
    try {
      const m = await MEAS.monitor(p.setup.deviceId, onLevel, onState);
      if (!isOpen(p) || S().state.current !== 'measure') { m.stop(); state.mic.status = 'off'; return; }
      monitor = m;
      if (!watch) watch = setInterval(checkReceiving, 1000);
      const s = m.session;
      Object.assign(state.mic, { status: s.status, label: s.label, sampleRate: s.sampleRate, settings: s.settings, tap: s.tap.kind });
      notePermission(p, null);
    } catch (e) {
      Object.assign(state.mic, { status: 'error', code: e.code || 'error', message: e.message });
      notePermission(p, e);
    }
    render();
  }
  function stopMonitor() {
    if (monitor) { monitor.stop(); monitor = null; }
    clearInterval(watch); watch = 0;
    Object.assign(state.mic, { status: 'off', level: null });
    state.levels = [];
    shownReceiving = null;
  }
  async function resume() { const s = AM.audioIO.current(); if (s) { try { await s.resume(); } catch (e) { /* still paused */ } state.mic.status = s.status; render(); } }

  /* ---------- background noise ---------- */
  function measureNoise(p) {
    if (state.noise || state.take) return;
    const ctl = MEAS.measureNoise({
      deviceId: p.setup.deviceId, onLevel,
      onProgress: (sec, frac) => { if (state.noise) { state.noise.sec = sec; state.noise.frac = frac; notify(); } },
    });
    state.noise = { pid: p.id, sec: 0, frac: 0, ctl };
    render();
    ctl.done.then(r => applyNoise(p, r), e => applyNoiseError(p, e)).finally(() => { state.noise = null; render(); });
  }
  const attemptOf = r => ({ status: 'invalid', takenAt: r.takenAt, leqDbfs: r.leqDbfs, spreadDb: r.spreadDb, jumpDb: r.jumpDb, driftDb: r.driftDb, reasons: r.reasons, warnings: r.warnings });
  function applyNoise(p, r) {
    if (!isOpen(p)) return; // the project was switched: the reading belongs to nobody on screen and is dropped
    notePermission(p, null);
    if (r.status === 'invalid') {
      S().update(pp => { pp.setup.noiseAttempt = attemptOf(r); });
      S().toast(p.setup.noise ? 'Background noise measurement not usable. The previous measurement is kept.' : 'Background noise measurement not usable. See the reason and measure again.');
      return;
    }
    S().update(pp => { pp.setup.noise = r; pp.setup.noiseAttempt = null; });
    const d = AM.derive.noiseChange(p);
    if (d != null) S().flagFrom('setup', `The background is now ${Math.abs(d)} dB ${d > 0 ? 'louder' : 'quieter'} than during the current measurement. Measure again to confirm the RT60.`);
  }
  function applyNoiseError(p, e) {
    if (e && e.code === 'cancelled') return;
    notePermission(p, e);
    if (e && ['stopped', 'error'].includes(e.code)) Object.assign(state.mic, { code: e.code, message: e.message });
    if (isOpen(p)) S().update(pp => { pp.setup.noiseAttempt = { status: 'failed', code: (e && e.code) || 'error', takenAt: new Date().toISOString(), reasons: [(e && e.message) || 'The background noise could not be measured.'] }; });
  }
  // Messages are shown after the current render: cancelling is often part of leaving a step.
  const later = msg => queueMicrotask(() => S().toast(msg));
  function cancelNoise() { if (state.noise) { state.noise.ctl.cancel(); later('Background noise measurement cancelled.'); } }

  /* ---------- one take ---------- */
  function measureRT60(p) {
    if (state.take || state.noise) return;
    const env = new Float32Array(240);
    const ctl = MEAS.measureRT60({
      deviceId: p.setup.deviceId, onLevel, context: { position: p.setup.position, deviceKind: kindOf(p) }, levelDb: AM.analysis.sweepLevel(p.setup.sweepLevelDb),
      onPhase: ph => { if (state.take) { state.take.phase = ph; render(); } },
      onProgress: (sec, frac, chunk, offset, total) => {
        const t = state.take;
        if (!t) return;
        Object.assign(t, { sec, frac, total, seconds: frac > 0 ? sec / frac : null });
        for (let i = 0; i < chunk.length; i++) {
          const b = Math.min(239, Math.floor((offset + i) / total * 240)), a = Math.abs(chunk[i]);
          if (a > env[b]) env[b] = a;
        }
        notify();
      },
    });
    state.take = { pid: p.id, phase: 'prepare', sec: 0, frac: 0, total: 0, seconds: null, ctl, envelope: env, levelDb: AM.analysis.sweepLevel(p.setup.sweepLevelDb) };
    render();
    ctl.done.then(t => applyTake(p, t), e => applyTakeError(p, e)).finally(() => { state.take = null; render(); });
  }
  function applyTake(p, take) {
    if (!isOpen(p)) return;
    if (take.status !== 'captured') {
      S().update(pp => { pp.measurement.failed = { reason: take.reason, takenAt: take.takenAt, levels: take.levels, levelDb: take.plan ? take.plan.levelDb : 0 }; });
      S().toast(p.measurement.recording || p.processing.result ? 'This take could not be used. The previous measurement is kept.' : 'This take could not be used. See the reason and measure again.');
      return;
    }
    S().update(pp => {
      pp.measurement.recording = take; pp.measurement.failed = null; pp.measurement.retry = null;
      delete pp.legacyNote;
      // A new take is waiting to be processed: Processing has to be gone through again.
      if (pp.completed.includes('processing') && !pp.review.includes('processing')) pp.review.push('processing');
    });
  }
  function applyTakeError(p, e) {
    if (e && e.code === 'cancelled') return;
    notePermission(p, e);
    if (e && e.code === 'stopped') Object.assign(state.mic, { status: 'stopped', code: 'stopped', message: e.message });
    if (isOpen(p)) S().update(pp => { pp.measurement.failed = { reason: (e && e.message) || 'The measurement failed.', code: e && e.code, takenAt: new Date().toISOString() }; });
  }
  function cancelTake(silent) { if (state.take) { state.take.ctl.cancel(); if (!silent) later('Measurement cancelled. No recording was stored.'); } }

  AM.live = { state, bind, render, receiving, kindOf, requestAccess, refreshDevices, startMonitor, stopMonitor, resume, measureNoise, cancelNoise, measureRT60, cancelTake };
})(window.AM);

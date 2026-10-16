/* Wording and live updates for the measurement screens: levels in plain words, distortion, times, input settings, the
   microphone-access help, and the live input level meter (filled in from real level reports). The screens themselves
   (microphone status, background-noise card) are drawn by the interface (src/ui/blocks.tsx). Every number comes from a
   measurement or is shown as not measured. */
(function (AM) {
  'use strict';
  const { fmt } = AM.util;
  const ui = AM.ui;
  const MEAS = AM.services.measurement;

  const dbfs = (x, d = 1) => (x == null || !isFinite(x) ? '—' : fmt.dbfs(x, d)); // "N dB below max" (util.js)
  ui.dbfs = dbfs;
  // A sweep level relative to the default, as every screen shows it. Takes from before the level existed were played at
  // the default (null → 0 dB).
  ui.levelDb = (db, withDefault = true) => { const d = db == null ? 0 : db; return d === 0 ? (withDefault ? '0 dB (default)' : '0 dB') : `${d > 0 ? '+' : '−'}${Math.abs(d)} dB`; };
  // Distortion products of a take, relative to the main response (analysis.js, distortion).
  ui.distortionText = d => {
    if (!d) return 'Not measured';
    const one = (k, v) => (v == null ? `${k} below ${Math.round(-d.floorDb)} dB` : `${k} −${Math.abs(v).toFixed(0)} dB`);
    return `${one('2nd', d.h2Db)} · ${one('3rd', d.h3Db)}`;
  };
  // The strongest distortion product, when it is close enough to the main response to mention (null otherwise).
  ui.distortionNote = d => {
    const top = d ? Math.max(d.h2Db == null ? -Infinity : d.h2Db, d.h3Db == null ? -Infinity : d.h3Db) : -Infinity;
    return top >= AM.analysis.CRITERIA.take.distortionNoteDb ? `The sound distorted at this level: its harmonics reached ${Math.round(-top)} dB below the main response. The sweep keeps them out of the room's decay, but they cost usable decay; a lower sweep level or device volume may give a cleaner take.` : null;
  };
  const time = iso => (iso ? new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '');
  ui.timeOf = time;

  // What the browser applied to the input, as reported by the track (not assumed).
  ui.inputSettings = st => {
    if (!st) return 'Not checked yet';
    const on = v => (v === true ? 'on' : v === false ? 'off' : 'not reported');
    const parts = [];
    if (st.sampleRate) parts.push(`${st.sampleRate / 1000} kHz`);
    if (st.channelCount) parts.push(`${st.channelCount} channel${st.channelCount > 1 ? 's' : ''}`);
    parts.push(`echo cancellation ${on(st.echoCancellation)}`, `noise suppression ${on(st.noiseSuppression)}`, `automatic gain ${on(st.autoGainControl)}`);
    return parts.join(' · ');
  };

  ui.accessHelp = permission => (AM.audioIO.MESSAGES[permission] || '');

  // Live input level: the bar and value of the meter the screen draws (src/ui/blocks.tsx LevelMeter), from real level reports.
  const SILENT = AM.analysis.CRITERIA.noise.silenceDbfs; // below this the input is digital silence (muted, blocked)
  const pos = db => Math.max(0, Math.min(1, (db + 90) / 90)) * 100;
  ui.updateLevel = (id, mic) => {
    const el = document.getElementById(id);
    if (!el) return;
    const l = mic.level, fresh = l && performance.now() - l.at < 1000 && l.samples > 0, clip = performance.now() - mic.clipAt < 1500;
    el.querySelector('.lm-bar').style.width = fresh ? pos(l.rmsDbfs) + '%' : '0%';
    el.querySelector('.lm-peak').style.left = fresh ? pos(l.peakDbfs) + '%' : '0%';
    el.querySelector('.lm-val').textContent = !fresh ? 'No signal' : clip ? 'Overload' : l.rmsDbfs < SILENT ? 'Silent' : dbfs(l.rmsDbfs);
    el.classList.toggle('is-clip', !!clip);
  };

  ui.noiseWord = st => ({ valid: 'suitable', warning: 'measure with care', unassessed: 'unable to assess' }[st] || 'not usable');

  // How a level is presented (relative until a calibration exists).
  ui.levelText = (x, deviceId) => MEAS.levelText(x, deviceId);
})(window.AM);

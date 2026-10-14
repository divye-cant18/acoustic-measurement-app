/* Screen pieces for the live measurement: microphone status, the input level meter, the background-noise result.
   They show the state in AM.live and the project; every number comes from a measurement or is shown as not measured. */
(function (AM) {
  'use strict';
  const { esc, icon, fmt } = AM.util;
  const ui = AM.ui;
  const MEAS = AM.services.measurement;

  const dbfs = (x, d = 1) => (x == null || !isFinite(x) ? '—' : `${x < 0 ? '−' : ''}${Math.abs(x).toFixed(d)} dBFS`);
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

  /* Browser processing, per feature: requested, reported by the browser, and whether the browser says it can switch it
     at all. From the stored configuration (cfg, AM.services.measurement.configOf) or, for inputs checked before it
     existed, the reported settings alone. Unknown stays unknown: it is never shown as off. */
  ui.processingTable = (cfg, settings) => {
    const M = AM.services.measurement;
    if (!cfg && !settings) return ui.kv([['Browser processing', 'Checked once microphone access is allowed']]);
    const state = cfg ? cfg.processing : M.processingState(settings, null);
    const rep = s => (s.state === 'off' ? 'reported off' : s.state === 'on' ? '<b>reported ON</b>: the browser did not switch it off' : 'not reported by this browser: unknown');
    const cap = s => (!s.capable ? '' : s.capable.includes(false) ? ' · the browser says it can switch it off' : ' · the browser says it cannot switch it off');
    const rows = state.map(s => [s.name[0].toUpperCase() + s.name.slice(1), `Requested off · ${rep(s)}${cap(s)}`]);
    if (cfg) rows.push(['Input', `${cfg.sampleRate ? `${cfg.sampleRate / 1000} kHz` : 'rate not known'}${cfg.channelCount ? ` · ${cfg.channelCount} channel${cfg.channelCount > 1 ? 's' : ''}` : ''} · ${esc(cfg.browser || '')}`]);
    return `<div class="sub-h">Browser processing</div>${ui.kv(rows)}`;
  };

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

  const ACCESS = {
    'not-requested': ['neutral', 'Not requested yet'],
    granted: ['good', 'Allowed'],
    denied: ['critical', 'Blocked'],
    embedded: ['critical', 'Not available in this view'],
    'no-device': ['critical', 'No microphone found'],
    busy: ['critical', 'Could not start'],
    unsupported: ['critical', 'Not supported here'],
    insecure: ['critical', 'Needs a secure page'],
    error: ['critical', 'Failed'],
  };
  ui.accessPill = permission => { const [tone, text] = ACCESS[permission] || ACCESS.error; return ui.pill(tone, text, tone === 'good' ? 'seal' : tone === 'critical' ? 'alert' : null); };
  ui.accessHelp = permission => (AM.audioIO.MESSAGES[permission] || '');

  // One line: is a microphone stream open and are samples arriving right now?
  ui.micLine = (mic, setup) => {
    const L = AM.live;
    switch (mic.status) {
      case 'live':
        if (!L.receiving()) return '<span class="dot busy"></span><span>Connected, but no audio is arriving yet</span>';
        if (mic.level.rmsDbfs < SILENT) return '<span class="dot busy"></span><span>Live, but the input is silent: the microphone may be muted</span>';
        return `<span class="dot live"></span><span>Live · ${esc(mic.label)}${mic.sampleRate ? ` · ${mic.sampleRate / 1000} kHz` : ''}</span>`;
      case 'starting': return '<span class="spin"></span><span>Starting the microphone…</span>';
      case 'suspended': return '<span class="dot busy"></span><span>Audio is paused by the browser</span>';
      case 'muted': return '<span class="dot busy"></span><span>The microphone is muted by the system or the device</span>';
      case 'stopped': return '<span class="dot bad"></span><span>The microphone stopped delivering audio</span>';
      case 'error': return `<span class="dot bad"></span><span>${esc((ACCESS[mic.code] || ACCESS.error)[1])}</span>`;
      default: return setup && setup.permission === 'granted'
        ? `<span class="dot"></span><span>Access allowed · not in use${setup.deviceLabel ? ` · ${esc(setup.deviceLabel)}` : ''}</span>`
        : '<span class="dot"></span><span>Not connected</span>';
    }
  };

  // Live input level: the bar and value are filled in by ui.updateLevel from real level reports.
  ui.levelMeter = id => `<div class="level" id="${id}"><div class="meter is-live live-meter"><i class="lm-bar"></i><b class="lm-peak"></b></div><span class="lm-val">—</span></div>`;
  const SILENT = AM.analysis.CRITERIA.noise.silenceDbfs; // below this the input is digital silence (muted, blocked)
  const pos = db => Math.max(0, Math.min(1, (db + 90) / 90)) * 100;
  ui.updateLevel = (id, mic) => {
    const el = document.getElementById(id);
    if (!el) return;
    const l = mic.level, fresh = l && performance.now() - l.at < 1000 && l.samples > 0, clip = performance.now() - mic.clipAt < 1500;
    el.querySelector('.lm-bar').style.width = fresh ? pos(l.rmsDbfs) + '%' : '0%';
    el.querySelector('.lm-peak').style.left = fresh ? pos(l.peakDbfs) + '%' : '0%';
    el.querySelector('.lm-val').textContent = !fresh ? 'No signal' : clip ? 'Overload' : l.rmsDbfs < SILENT ? 'Silent' : `${dbfs(l.rmsDbfs)} RMS`;
    el.classList.toggle('is-clip', !!clip);
  };

  /* Background noise: the current valid measurement, the latest attempt if it was not accepted, and the run in progress.
     It leads with what the user needs (suitable, measure with care, or measure the background again); the figures behind
     it are under Details. Whether a take is reliable is decided on the take itself. */
  const NOISE = { valid: ['good', 'Suitable for measuring', 'seal'], warning: ['warn', 'Measure with care', 'alert'], unassessed: ['neutral', 'Unable to assess', 'info'], invalid: ['critical', 'Measure the background again', 'x'], failed: ['critical', 'Failed', 'x'] };
  ui.noisePill = st => { const [tone, text, ic] = NOISE[st] || NOISE.invalid; return ui.pill(tone, text, ic); };
  ui.noiseWord = st => ({ valid: 'suitable', warning: 'measure with care', unassessed: 'unable to assess' }[st] || 'not usable');
  const NOISE_SAYS = {
    valid: 'The background is quiet and steady enough in the bands RT60 is measured in. Go ahead.',
    warning: 'You can measure. The take checks its own background and decay, and says so if the noise affected them.',
    unassessed: 'The take checks its own recording, so you can still measure.',
  };

  ui.noiseBody = (p, opts = {}) => {
    const s = p.setup, n = s.noise, a = s.noiseAttempt, L = AM.live.state, run = L.noise && L.noise.pid === p.id;
    const total = AM.analysis.CRITERIA.noise.seconds + AM.analysis.CRITERIA.noise.settle;
    if (run) {
      return `<div class="noise-run">
        <div class="status-line"><span class="spin"></span>Measuring the background: keep the room quiet</div>
        <div class="prog-row"><span id="nz-time">${(L.noise.sec || 0).toFixed(1)} s</span><div class="meter is-live"><i id="nz-prog" style="width:${((L.noise.frac || 0) * 100).toFixed(1)}%"></i></div><span>${total.toFixed(1)} s</span></div>
        ${ui.levelMeter('nz-level')}
        <div><button class="btn btn-ghost btn-sm" data-action="cancelNoise">${icon('x', 15, 2)} Cancel</button></div>
      </div>`;
    }
    const signed = x => `${x > 0 ? '+' : x < 0 ? '−' : '±'}${Math.abs(x).toFixed(1)} dB`;
    const ib = n && n.inBand; // missing in measurements saved before the in-band check
    // Cautions about the room only; "browser does not report" notes belong to the input's configuration (Measuring device).
    const cautions = n && n.warnings ? n.warnings.filter(w => !/does not report whether/.test(w)) : [];
    const value = n
      ? `<div class="vol">${ui.noisePill(n.status)}</div>
         ${(n.status === 'warning' || n.status === 'unassessed') && cautions.length ? `<ul class="bullets">${cautions.map(w => `<li>${esc(w)}</li>`).join('')}</ul>` : ''}
         <p class="small">${esc(NOISE_SAYS[n.status] || '')}</p>
         <p class="small muted">Background ${ui.dbfs(ib ? ib.leqDbfs : n.leqDbfs)}${ib ? ' in the RT60 bands' : ''}, measured ${time(n.takenAt)}: a level relative to the input's full scale (dBFS), not calibrated sound pressure. It cannot tell the room's noise from the microphone's own noise or from what the device's processing did to it. RT60 does not depend on it; it only limits how much decay a take can use.</p>
         <details class="more"><summary>Details</summary>
           ${ui.kv([
             ...(ib ? [
               ['Level in the measured bands (125–4000 Hz)', `${ui.dbfs(ib.leqDbfs)}<div class="kv-note">usual level (median) ${ui.dbfs(ib.l50)}; a caution above ${AM.analysis.CRITERIA.noise.highDbfs} dBFS</div>`],
               ['Loudest moment above the usual level', `${ib.soundDb.toFixed(1)} dB<div class="kv-note">in the ${fmt.hz(ib.soundBand)} band; a caution above ${AM.analysis.CRITERIA.noise.soundDb} dB</div>`],
               ['Change across the window', `${signed(ib.driftDb)}<div class="kv-note">in the measured bands; a caution beyond ±${AM.analysis.CRITERIA.noise.changeDb} dB</div>`],
               ['Steadiness (L10 − L90)', `${ib.spreadDb.toFixed(1)} dB<div class="kv-note">in the measured bands; information only</div>`],
             ] : [['Steadiness (L10 − L90)', `${n.spreadDb.toFixed(1)} dB`], ['Loudest moment above L90', `${n.jumpDb.toFixed(1)} dB`], ['Change across the window', signed(n.driftDb)]]),
             ['Unweighted, all frequencies', `Leq ${ui.dbfs(n.leqDbfs)} · L10 − L90 ${n.spreadDb.toFixed(1)} dB · change ${signed(n.driftDb)}<div class="kv-note">${n.dcDbfs !== undefined ? 'DC offset removed; ' : ''}including rumble below 88 Hz, which no RT60 band hears</div>`],
             ...(n.dcDbfs !== undefined ? [['DC offset of the input', `${ui.dbfs(n.dcDbfs)}<div class="kv-note">a constant offset from the microphone or converter; not sound, and not counted in any level</div>`]] : []),
           ])}
           ${opts.bands === false ? '' : `<div class="tbl-wrap"><table class="tbl tbl-mini"><thead><tr>${n.bands.map(b => `<th class="r">${fmt.hzShort(b.f)}</th>`).join('')}</tr></thead><tbody><tr>${n.bands.map(b => `<td class="r">${b.leqDbfs == null ? '—' : b.leqDbfs.toFixed(0)}</td>`).join('')}</tr></tbody></table><p class="small muted">Background per octave band, dBFS, Leq over ${n.seconds} s.</p></div>`}
         </details>`
      : '<div class="vol"><span class="stat-v">—</span><span class="muted">Not measured</span></div>';
    const attempt = a ? ui.note(`<b>Latest attempt ${time(a.takenAt)}: ${a.status === 'failed' ? 'failed' : 'not usable'}.</b> ${a.reasons.map(esc).join(' ')}${n ? ` The measurement from ${time(n.takenAt)} is kept.` : ''}`, 'critical', 'alert') : '';
    const allowed = s.permission === 'granted' || ['live', 'suspended'].includes(L.mic.status), busy = !!(L.noise || L.take);
    return `${value}${attempt}
      <div class="hstack"><button class="btn ${n ? 'btn-secondary' : 'btn-primary'} btn-sm" data-action="measureNoise" ${busy || !allowed ? 'disabled' : ''}>${icon(n ? 'refresh' : 'gauge', 15, 2)} ${n ? 'Measure again' : 'Measure background noise'}</button>
      <span class="small muted">${!allowed ? 'Allow microphone access first.' : busy ? 'Wait for the measurement in progress.' : `Takes ${total.toFixed(0)} s. Keep the room as it will be during the measurement.`}</span></div>`;
  };

  // How a level is presented (relative until a calibration exists).
  ui.levelText = (x, deviceId) => MEAS.levelText(x, deviceId);
})(window.AM);

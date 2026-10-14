/* Step 3 · Measurement Setup — the measuring device, microphone access, measuring position, room preparation, test
   signal and a real background-noise measurement. The microphone is only opened while it is needed and released
   afterwards. Microphone and noise work goes through AM.live (js/measurement/live.js); this file only shows its state.

   One device measures: the laptop or phone running the app plays the test signal through its own speaker and records
   the room with its own microphone. The instructions place that device; nothing else is set up. */
(function (AM) {
  'use strict';
  const { esc, icon, fmt, clamp } = AM.util;
  const W = AM.workflow, S = AM.store, D = AM.demo, ui = AM.ui;
  const LIVE = AM.live;

  const PREP = [
    ['doors', 'Doors and windows closed', 'Openings leak sound and change the decay.'],
    ['hvac', 'Ventilation and air conditioning off or at minimum', 'Fan noise raises the noise floor.'],
    ['quiet', 'Room quiet, nobody talking', 'Stay still and silent during the take.'],
    ['placed', 'Device placed at the measuring position, not held', 'On a firm, stable support. Nobody touches it or the surface it stands on during the take.'],
    ['uncovered', 'Microphone and speaker openings uncovered', 'No case flap, cover, paper or hand over them.'],
    ['output', 'Sound plays into the room from this device', 'Headphones and earbuds (wired or Bluetooth) disconnected; volume high but not distorting.'],
  ];
  // The checklist items that depend on how the device is placed: asked again when the device profile changes.
  const PLACEMENT_PREP = ['placed', 'uncovered', 'output'];

  // Small drawings of the measuring device for the plan: a laptop or a phone.
  const at = v => Math.round(v * 10) / 10;
  const glyph = (kind, x, y) => (kind === 'mobile'
    ? `<rect x="${at(x - 5)}" y="${at(y - 8.5)}" width="10" height="17" rx="2.2"/>`
    : `<rect x="${at(x - 8)}" y="${at(y - 9)}" width="16" height="11" rx="1.6"/><rect x="${at(x - 10.5)}" y="${at(y + 2.6)}" width="21" height="3.2" rx="1.2"/>`);

  /* Plan view: the measuring positions, and the device placed at the chosen one. There is no separate speaker: the
     device itself plays the test signal and records the room. */
  function plan(room, posId, kind) {
    const g = AM.acoustics.geometry(room);
    const L = g ? g.L : 10, Wd = g ? g.W : 6;
    const VW = 320, pad = 28, pw = VW - pad * 2, ph = clamp(pw * Wd / L, 90, 210), VH = ph + pad * 2;
    const r1 = v => Math.round(v * 10) / 10, X = f => r1(pad + f * pw), Y = f => r1(pad + f * ph);
    const sel = D.POSITIONS.find(p => p.id === posId) || D.POSITIONS[0];
    let s = `<rect class="pl-room" x="${pad}" y="${pad}" width="${pw}" height="${ph.toFixed(1)}" rx="3"/>`;
    s += `<line class="pl-front" x1="${pad}" y1="${pad + 2}" x2="${pad}" y2="${(pad + ph - 2).toFixed(1)}"/><text class="pl-front-t" x="${pad + 7}" y="${pad + 14}">Front</text>`;
    D.POSITIONS.forEach(p => {
      if (p.id === sel.id) return;
      s += `<g class="pl-pos"><circle cx="${X(p.x)}" cy="${Y(p.y)}" r="5"/><text x="${X(p.x)}" y="${Y(p.y) - 12}" text-anchor="middle">${p.id}</text></g>`;
    });
    const cx = X(sel.x), cy = Y(sel.y);
    s += `<g class="pl-pos on"><circle class="pl-ring" cx="${cx}" cy="${cy}" r="17"/><g class="pl-dev">${glyph(kind, cx, cy)}</g><text x="${cx}" y="${cy - 23}" text-anchor="middle">${sel.id}</text></g>`;
    s += `<text class="pl-dim" x="${VW / 2}" y="${VH - 8}" text-anchor="middle">${fmt.m(L)}</text>`;
    s += `<text class="pl-dim" x="${pad - 8}" y="${pad + ph / 2}" text-anchor="middle" transform="rotate(-90 ${pad - 8} ${pad + ph / 2})">${fmt.m(Wd)}</text>`;
    return `<svg class="plan" viewBox="0 0 ${VW} ${VH.toFixed(0)}" role="img" aria-label="Plan view of the room: the ${esc(D.DEVICE_KINDS[kind].noun)} is placed at ${sel.id}, ${esc(sel.name)}">${s}</svg>`;
  }

  const ACCESS_TEXT = { granted: 'Allowed', 'not-requested': 'Not requested yet', denied: 'Blocked', embedded: 'Not available in this view', 'no-device': 'No microphone found', busy: 'Could not start', unsupported: 'Not supported here', insecure: 'Needs a secure page', error: 'Failed' };
  function items(p) {
    const s = p.setup, n = s.noise;
    const prepDone = PREP.filter(([k]) => s.prep[k]).length;
    const pos = D.POSITIONS.find(x => x.id === s.position) || D.POSITIONS[0];
    return [
      ['Measuring device', `${D.DEVICE_KINDS[LIVE.kindOf(p)].name}${s.deviceKind ? '' : ' (detected)'}, its own speaker and microphone`, true],
      ['Microphone', s.deviceLabel || (s.deviceId === 'default' ? 'Default microphone' : 'Selected microphone'), s.permission === 'granted'],
      ['Microphone access', ACCESS_TEXT[s.permission] || 'Failed', s.permission === 'granted', !['granted', 'not-requested'].includes(s.permission)],
      ['Measuring position', `${pos.id} · ${pos.name}`, true],
      ['Room preparation', `${prepDone} of ${PREP.length} done`, prepDone === PREP.length],
      ['Test signal', D.SIGNALS[0].name, true],
      ['Background noise', n ? `${ui.dbfs(n.inBand ? n.inBand.leqDbfs : n.leqDbfs)}${n.inBand ? ' in the RT60 bands' : ''} · ${ui.noiseWord(n.status)}` : s.noiseAttempt ? 'Last attempt not usable' : 'Not measured', !!n, n ? n.status === 'warning' || n.status === 'unassessed' : !!s.noiseAttempt],
    ];
  }

  function view(ctx) {
    const p = ctx.project, s = p.setup, L = LIVE.state;
    const pos = D.POSITIONS.find(x => x.id === s.position) || D.POSITIONS[0];
    const list = items(p), left = list.filter(i => !i[2]).length;
    const allowed = s.permission === 'granted', asking = !!(L.access && L.access.pid === p.id);

    const devices = L.devices.length ? L.devices : [{ id: s.deviceId || 'default', label: s.deviceLabel || 'Default microphone' }];
    const options = devices.map(d => ({ value: d.id, label: d.label }));
    if (!options.some(o => o.value === s.deviceId)) options.unshift({ value: s.deviceId, label: s.deviceLabel || 'Previously selected microphone' });
    const settings = s.input && s.input.settings, cfg = s.input && s.input.config;
    const procWarn = settings ? AM.services.measurement.processingWarnings(settings).filter(w => !/does not report/.test(w)) : [];
    const kind = LIVE.kindOf(p), K = D.DEVICE_KINDS[kind], detected = AM.services.measurement.deviceKind();
    // The sound output: chosen and confirmed where the browser can route to it; otherwise stated as not choosable.
    const selectable = AM.services.measurement.canSelectOutput(), outs = L.outputs || [];
    const outOptions = [{ value: 'default', label: 'System default output' }, ...outs.filter(o => o.id !== 'default').map(o => ({ value: o.id, label: o.label }))];
    if (!outOptions.some(o => o.value === (s.outputId || 'default'))) outOptions.push({ value: s.outputId, label: 'Previously selected output (not available now)' });
    const outProblem = LIVE.configProblem(p);
    // Only offered where the browser can route to an output and there is more than the default to choose.
    const speaker = selectable && outOptions.length > 1
      ? `${ui.select({ id: 'setup-output', label: 'Sound output', changeAction: 'setOutput', value: s.outputId || 'default', options: outOptions })}
         <p class="small muted">${(s.outputId || 'default') === 'default' ? 'The system default output plays the test signal; which device that is, is not confirmed. Choose the built-in speakers to have the browser confirm them.'
           : cfg && cfg.output && cfg.output.verified ? `In use, as confirmed by the browser: ${esc(cfg.output.label || 'the selected output')}.` : cfg && cfg.output && cfg.output.error ? '' : 'Confirmed once microphone access is allowed.'}</p>`
      : `${ui.kv([['Sound output', `${L.output ? esc(L.output) : 'The system\'s current output'}<div class="kv-note">This browser cannot choose or confirm the sound output: the test signal plays through whatever the system uses now${kind === 'mobile' ? ', which on some phones is the earpiece while the microphone is on' : ''}. Disconnect headphones and Bluetooth audio.</div>`]])}`;
    const mismatch = s.deviceKind && s.deviceKind !== detected
      ? ui.note(`This page runs on ${detected === 'mobile' ? 'a phone or tablet' : 'a computer'}. Choosing “${esc(K.name)}” changes the instructions only: the measurement always uses the speaker and microphone of the device this page runs on.`, 'warn') : '';
    const mic = ui.card({ title: 'Measuring device', right: allowed ? ui.pill('neutral', 'Uncalibrated') : '', body: `
      <p class="small">One device does the whole measurement: this ${esc(K.noun)}'s speaker plays the test signal and its microphone records the room. Nothing else needs to be connected.</p>
      ${ui.select({ id: 'setup-kind', label: 'Device profile', changeAction: 'setKind', value: kind, options: Object.entries(D.DEVICE_KINDS).map(([v, k]) => ({ value: v, label: `${k.name}${v === detected ? ' (detected)' : ''}` })) })}
      ${mismatch}
      ${ui.select({ id: 'setup-device', label: 'Microphone', changeAction: 'setDevice', value: s.deviceId, options })}
      <div class="status-line">${ui.micLine(L.mic, s)}</div>
      ${speaker}
      ${outProblem ? ui.note(esc(outProblem), 'critical', 'alert') : ''}
      ${ui.processingTable(cfg, settings)}
      ${procWarn.map(w => ui.note(esc(w), 'warn')).join('')}
      <ul class="bullets small">${K.checks.map(t => `<li>${esc(t)}</li>`).join('')}</ul>
      <p class="small muted">Levels are relative to the input's full scale (dBFS). This microphone is not calibrated, so they are not sound pressure levels. RT60 does not need a calibrated microphone.</p>` });

    const permBody = asking ? '<div class="status-line"><span class="spin"></span>Waiting for the browser…</div>'
      : `<div class="hstack">${ui.accessPill(s.permission)}${allowed && s.deviceLabel ? `<span class="small muted">${esc(s.deviceLabel)}</span>` : ''}</div>
        ${['denied', 'embedded', 'no-device', 'busy', 'unsupported', 'insecure', 'error'].includes(s.permission) ? ui.note(esc(ui.accessHelp(s.permission) || L.mic.message || ''), 'critical', 'alert') : ''}
        <div><button class="btn ${allowed ? 'btn-secondary' : 'btn-primary'} btn-sm" data-action="allowMic">${icon('shield', 16, 2)} ${allowed ? 'Check again' : s.permission === 'not-requested' ? 'Allow microphone access' : 'Try again'}</button></div>`;
    const perm = ui.card({ title: 'Microphone access', body: `${permBody}
      <p class="small muted">The browser asks once. The microphone is opened only while the app is measuring and is released straight after.</p>` });

    const position = ui.card({ title: 'Measuring position', sub: `Where the ${esc(K.noun)} is placed for the take`, body: `
      ${ui.select({ id: 'setup-pos', label: 'Position', bind: 'setup.position', value: s.position, options: D.POSITIONS.map(x => ({ value: x.id, label: `${x.id} · ${x.name}` })) })}
      ${plan(p.room, s.position, kind)}
      <p class="small"><b>${esc(pos.id)} · ${esc(pos.name)}:</b> ${esc(pos.detail)}. ${esc(K.place)}</p>
      <ul class="bullets small">${[K.support, ...D.PLACEMENT.slice(1)].map(t => `<li>${esc(t)}</li>`).join('')}</ul>
      <p class="small muted">To measure another position, move the same ${esc(K.noun)} there and take a new measurement.</p>` });

    const prep = ui.card({ title: 'Room preparation', sub: `${PREP.filter(([k]) => s.prep[k]).length} of ${PREP.length} done`, body: `
      <div class="checks">${PREP.map(([k, label, hint]) => ui.check({ id: `prep-${k}`, bind: `setup.prep.${k}`, checked: s.prep[k], label, hint })).join('')}</div>` });

    const sp = AM.analysis.sweepPlan((s.input && s.input.sampleRate) || 48000), lvl = AM.analysis.sweepLevel(s.sweepLevelDb);
    const played = 20 * Math.log10(sp.amplitude * AM.analysis.levelGain(lvl));
    const signal = ui.card({ title: 'Test signal', body: `
      ${ui.kv([['Signal', esc(D.SIGNALS[0].name)], ['Frequency range', `${sp.f1} Hz to ${(sp.f2 / 1000).toFixed(sp.f2 % 1000 ? 1 : 0)} kHz`], ['Length', `${sp.seconds} s, then ${sp.tail} s of listening`],
        ['Played at', `${ui.dbfs(played)} peak<div class="kv-note">sweep level ${ui.levelDb(lvl)}; change it on Acoustic Measurement</div>`]])}
      <p class="small muted">${esc(D.SIGNALS[0].detail)} Set the ${esc(K.noun)}'s volume high, just below where the sound starts to distort or rattle. Each take lasts about ${Math.round(sp.total)} seconds.</p>` });

    const noise = ui.card({ title: 'Background noise', sub: 'Measured with the microphone. The noise floor limits how much decay can be measured.', body: ui.noiseBody(p) });

    const legacy = p.legacyNote ? ui.note(esc(p.legacyNote), 'warn', 'alert') : '';
    const summary = ui.card({ title: 'Setup summary', body: `
      <div class="summary">${list.map(([k, v, ok, warn]) => `<div class="sum-r"><span class="${warn ? 'warn' : ok ? 'ok' : 'todo'}">${icon(warn ? 'alert' : ok ? 'seal' : 'info', 18, 2)}</span><span>${k}</span><span class="sum-v">${esc(v)}</span></div>`).join('')}</div>
      ${left ? `<div class="ready is-not">${icon('list', 20, 2)} ${left} item${left > 1 ? 's' : ''} left before measuring</div>` : `<div class="ready is-ready">${icon('seal', 20, 2.2)} Ready to measure</div>`}` });

    return { body: `${legacy}<div class="grid g2">${mic}${perm}${position}${prep}${signal}${noise}</div>${summary}` };
  }

  function canContinue(p) {
    const s = p.setup, L = LIVE.state;
    if (L.noise) return { ok: false, reason: 'Wait for the background noise measurement to finish.' };
    if (s.permission !== 'granted') return { ok: false, reason: s.permission === 'not-requested' ? 'Allow microphone access first.' : 'The microphone is not available. See Microphone access.' };
    const problem = LIVE.configProblem(p);
    if (problem) return { ok: false, reason: problem };
    const done = PREP.filter(([k]) => s.prep[k]).length;
    if (done < PREP.length) return { ok: false, reason: `Finish the room preparation checklist (${done} of ${PREP.length} done).` };
    if (!s.noise) return { ok: false, reason: s.noiseAttempt ? 'The last background noise measurement could not be used. Measure it again.' : 'Measure the background noise.' };
    return { ok: true };
  }

  let checkedFor = null; // the project whose browser permission state was read on this visit
  W.define('setup', {
    view,
    canContinue,
    continueLabel: 'Continue to measurement',
    actions: {
      allowMic: ctx => LIVE.requestAccess(ctx.project),
      /* The device profile decides how the device is placed and what to check (DEVICE_KINDS); the audio request is the
         same for every profile, since a decay must reach the analysis unprocessed either way. A new profile therefore
         asks for the placement items of the checklist again and reads the input's configuration again; the background
         measurement (same microphone, same room) stays. Takes already made keep the profile they were made with.
         Picking the detected kind returns to following the browser. */
      setKind: (ctx, v) => {
        const p = ctx.project;
        if (!D.DEVICE_KINDS[v] || v === LIVE.kindOf(p)) return;
        S.update(pp => { pp.setup.deviceKind = v === AM.services.measurement.deviceKind() ? null : v; PLACEMENT_PREP.forEach(k => { pp.setup.prep[k] = false; }); });
        if (p.setup.permission === 'granted') LIVE.requestAccess(p);
        S.toast(`Profile: ${D.DEVICE_KINDS[v].name}. Check its placement and tick those room preparation items again.`);
      },
      // Levels are relative to each microphone's own full scale, so another microphone needs its own noise measurement.
      setDevice: (ctx, id) => {
        const d = LIVE.state.devices.find(x => x.id === id);
        S.set('setup', Object.assign({}, ctx.project.setup, { deviceId: id, deviceLabel: d ? d.label : '', input: null, noise: null, noiseAttempt: null }));
        if (ctx.project.setup.permission === 'granted') LIVE.requestAccess(ctx.project);
      },
      // Another output (where the browser can choose one) changes where the test signal plays, not the background:
      // the configuration is read again with it, and a take cannot start until the browser has applied it.
      setOutput: (ctx, id) => {
        S.update(pp => { pp.setup.outputId = id || 'default'; });
        if (ctx.project.setup.permission === 'granted') LIVE.requestAccess(ctx.project);
      },
      measureNoise: ctx => LIVE.measureNoise(ctx.project),
      cancelNoise: () => LIVE.cancelNoise(),
    },
    mount(root, ctx) {
      const p = ctx.project;
      LIVE.bind(st => {
        if (!st.noise) return;
        const t = document.getElementById('nz-time'), pr = document.getElementById('nz-prog');
        if (t) t.textContent = st.noise.sec.toFixed(1) + ' s';
        if (pr) pr.style.width = (st.noise.frac * 100).toFixed(1) + '%';
        ui.updateLevel('nz-level', st.mic);
      });
      if (!p || checkedFor === p.id) return;
      checkedFor = p.id;
      // What the browser says now, without asking: a permission withdrawn since the last visit is shown as blocked.
      AM.services.measurement.permissionState().then(st => {
        if (S.state.project !== p) return;
        if ((st === 'denied' || st === 'embedded') && p.setup.permission !== st) S.update(pp => { pp.setup.permission = st; });
        // Blocked by an embedding page last time, opened on its own now: access has not been asked for here yet.
        else if (st !== 'embedded' && p.setup.permission === 'embedded') S.update(pp => { pp.setup.permission = 'not-requested'; });
        if (st === 'granted' && !LIVE.state.devices.length) LIVE.refreshDevices(p);
      });
    },
    leave() { checkedFor = null; LIVE.bind(null); if (LIVE.state.noise) LIVE.cancelNoise(); },
    // Developer tools: tick the checklist. Microphone access and background noise can only come from a real measurement.
    demoFill(p) {
      PREP.forEach(([k]) => { p.setup.prep[k] = true; });
      return !!p.setup.noise && p.setup.permission === 'granted';
    },
  });
})(window.AM);

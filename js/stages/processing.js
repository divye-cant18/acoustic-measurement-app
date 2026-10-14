/* Step 5 · Measurement Processing — is the recorded decay trustworthy, which calculation is valid, then RT60.
   Validates the latest take with AM.services.processing. Invalid data never becomes an RT60.
   A valid take becomes the CURRENT measurement and the previous one is kept as SUPERSEDED. An invalid take is kept as
   the latest attempt; the current measurement, if there is one, stays in force. */
(function (AM) {
  'use strict';
  const { esc, icon, fmt } = AM.util;
  const W = AM.workflow, S = AM.store, ui = AM.ui;
  const PROC = AM.services.processing;

  let job = null; // { ctl, i, recId }

  // The evaluation shown for the latest take: the current result, the stored invalid attempt, or none yet.
  function outcome(p, rec) {
    const cur = p.processing.result, att = p.processing.attempt;
    if (cur && cur.recordingId === rec.id) return cur;
    if (att && att.recordingId === rec.id) return att.result;
    return null;
  }

  function cascade(ref) {
    // Ranges are counted from the start of the room's decay (below the device's direct sound, when that is strong).
    const rows = [
      { q: 'Enough decay for T30?', path: 'T30', calc: 'RT60 = T30, fitted from 5 to 35 dB below the start of the room\'s decay, extrapolated to 60 dB' },
      { q: 'Enough decay for T20?', path: 'T20', calc: 'RT60 = T20, fitted from 5 to 25 dB below the start of the room\'s decay, extrapolated to 60 dB' },
    ];
    if (ref.decayRangeDb == null) return `<ol class="cascade"><li class="cq is-fail"><span class="cq-q">No usable decay</span><span class="cq-need">${esc(ref.reason || 'Not measured')}</span><span class="cq-a">Stop</span></li></ol>`;
    let open = true;
    const html = rows.map(r => {
      const need = PROC.REQUIRED[r.path];
      if (!open) return `<li class="cq is-skipped"><span class="cq-q">${r.q}</span><span class="cq-need">Needs ${need} dB</span><span class="cq-a">Not needed</span></li>`;
      const yes = ref.path === r.path;
      if (yes) open = false;
      const has = `Needs ${need} dB, has ${Math.round(ref.decayRangeDb)} dB`;
      return `<li class="cq ${yes ? 'is-yes' : 'is-no'}"><span class="cq-q">${r.q}</span><span class="cq-need">${has}</span><span class="cq-a">${yes ? 'Yes' : 'No'}</span>${yes ? `<span class="cq-calc">${r.calc}: ${fmt.s(ref.rt60)} (r² ${ref.r2.toFixed(4)})</span>` : ''}</li>`;
    }).join('');
    const end = open ? `<li class="cq is-fail"><span class="cq-q">Measurement insufficient</span><span class="cq-need">${esc(ref.reason || 'Repeat or adjust the measurement')}</span><span class="cq-a">Stop</span></li>` : '';
    return `<ol class="cascade">${html}${end}</ol>`;
  }

  const STATUS = { valid: ['good', 'Valid result', 'seal'], warning: ['warn', 'Valid, with warnings', 'alert'], invalid: ['critical', 'Not valid', 'x'] };

  function view(ctx) {
    const p = ctx.project, rec = p.measurement.recording, cur = AM.derive.measured(p);
    if (!rec || rec.status !== 'captured') return { body: ui.note('There is no recording to process. Go back to Acoustic Measurement.', 'warn') };
    const res = outcome(p, rec), finished = !!res;
    const preview = res || PROC.evaluate(rec, { noise: p.setup.noise });
    const det = PROC.details(rec, preview);

    const steps = PROC.STEPS.map((st, i) => {
      let state = finished ? 'done' : job ? (i < job.i ? 'done' : i === job.i ? 'running' : 'pending') : 'pending';
      if (finished && !res.valid) {
        if (st.id === 'path' || st.id === 'validate') state = 'failed';
        if (st.id === 'rt60') state = 'skipped';
      }
      const mark = { done: icon('check', 13, 2.6), running: '<span class="spin"></span>', pending: '', failed: icon('x', 13, 2.6), skipped: '–' }[state];
      const showDetail = state === 'done' || state === 'failed' || state === 'skipped';
      return `<li class="ps is-${state}"><span class="ps-mark">${mark}</span><span class="ps-t">${st.label}</span>${showDetail ? `<span class="ps-d">${esc(det[i])}</span>` : ''}</li>`;
    }).join('');

    const [tone, text, ic] = finished ? STATUS[res.status] : ['acoustic', 'Processing', 'decay'];
    const stepsCard = ui.card({ title: 'Processing steps', sub: `Take recorded ${fmt.when(rec.takenAt)}`, right: ui.pill(tone, text, ic), body: `<ol class="psteps">${steps}</ol>` });

    const principle = ui.card({ title: 'How a result is earned', body: `
      <ol class="principle">
        <li><span><b>Is the decay trustworthy?</b>Separate the device's own direct sound from the room's decay, then find the noise floor in each band and how much of the room's decay lies above it.</span></li>
        <li><span><b>Which calculation is valid?</b>Choose T30 or T20 from the usable decay.</span></li>
        <li><span><b>Calculate RT60.</b>Only from a valid path and a straight decay. Otherwise stop and measure again.</span></li>
      </ol>
      ${ui.note('Every value comes from this take\'s recording. Where the recording cannot support a value, none is given.', 'info')}` });

    let after = '';
    if (finished) {
      const ref = res.bands.find(b => b.f === res.referenceBand) || { f: res.referenceBand };
      const cell = (v, b) => (v != null ? fmt.s(v) : '<span class="muted">—</span>');
      const rows = res.bands.map(b => `<tr class="${b.f === res.referenceBand ? 'is-ref' : ''}">
        <td>${fmt.hz(b.f)}</td><td class="r">${b.headDb != null ? `${b.headDb.toFixed(1)} dB` : '—'}</td><td class="r">${b.decayRangeDb != null ? `${Math.round(b.decayRangeDb)} dB` : '—'}</td>
        <td>${b.path || '—'}</td><td class="r">${cell(b.t20)}</td><td class="r">${cell(b.t30)}</td>
        <td class="r">${b.rt60 != null ? `<b>${fmt.s(b.rt60)}</b>` : `<span class="nr" title="${esc(b.reason || '')}">Not reliable</span>`}</td>
        <td class="r">${b.r2 != null ? b.r2.toFixed(4) : '—'}</td>
        <td>${ui.pill(ui.tone[b.quality] || 'neutral', b.quality)}</td></tr>`).join('');
      const reasons = res.bands.filter(b => b.rt60 == null && b.reason).map(b => `<li><b>${fmt.hz(b.f)}:</b> ${esc(b.reason)}</li>`).join('');
      const notes = [...res.warnings, ...res.bands.flatMap(b => (b.notes || []).map(n => `${fmt.hz(b.f)}: ${n}`))];
      const curAvg = AM.derive.averageRT60(p);
      const kept = cur && cur.recordingId !== rec.id ? ` The current measurement from ${fmt.when(cur.takenAt)} (average RT60, 500–2000 Hz: ${curAvg.available ? fmt.s(curAvg.value) : 'not available'}; ${fmt.s(cur.headline.rt60)} at ${fmt.hz(cur.headline.f)}) stays in force.` : '';
      after = `${!res.valid ? ui.note(`<b>Unable to obtain a reliable RT60 measurement.</b> ${esc(res.reason || '')} RT60 is not calculated from data that cannot support it.${kept}<div class="note-actions"><button class="btn btn-primary btn-sm" data-action="repeat">${icon('refresh', 15, 2)} Measure again</button></div>`, 'critical') : ''}
      ${notes.length ? ui.note(`<b>Warnings.</b><ul class="bullets">${notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>`, 'warn') : ''}
      <div class="grid split">
        ${ui.card({ title: `Calculation path at ${fmt.hz(ref.f)}`, sub: 'The reference band decides whether the measurement is valid.', body: cascade(ref) })}
        ${ui.card({ title: 'Required usable decay', body: ui.kv([['T30 (30 dB × 2)', `${PROC.REQUIRED.T30} dB`], ['T20 (20 dB × 3)', `${PROC.REQUIRED.T20} dB`]]) + '<p class="small muted">Each is the evaluation range plus a 5 dB start offset and a 10 dB margin above the noise floor (ISO 3382). Usable decay is the room\'s own decay in each band: from where it starts, below the direct sound of the measuring device, down to the noise floor.</p>' })}
      </div>
      ${ui.card({ title: 'Band by band', body: `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Band</th><th class="r">Direct sound</th><th class="r">Usable decay</th><th>Path</th><th class="r">T20</th><th class="r">T30</th><th class="r">RT60</th><th class="r">r²</th><th>Quality</th></tr></thead><tbody>${rows}</tbody></table></div>
        ${ui.averageSummary(AM.services.rt60Average.of(res))}
        <p class="small muted">Direct sound: how far the device's direct sound and earliest reflections lie above the start of the room's decay in that band. Above ${AM.analysis.CRITERIA.decay.directAllowanceDb} dB the evaluation moves below them, so it measures the room, not the device.</p>
        ${reasons ? `<ul class="bullets small">${reasons}</ul>` : ''}` })}`;
    }

    const v = { body: `<div class="grid split">${stepsCard}${principle}</div>${after}` };
    if (finished && !res.valid) v.primary = cur ? { label: 'Continue with the current measurement', action: 'continue' } : { label: 'Measure again', action: 'repeat' };
    return v;
  }

  function canContinue(p) {
    const rec = p.measurement.recording, cur = AM.derive.measured(p);
    if (!rec && !cur) return { ok: false, reason: 'Measure the room first.' };
    if (rec && rec.status === 'captured' && !outcome(p, rec)) return { ok: false, reason: 'Processing is still running.' };
    if (!cur) return { ok: false, reason: 'The measurement is not valid. Measure again.' };
    return { ok: true };
  }

  // Writes the evaluation to the project: CURRENT if valid (the previous current becomes SUPERSEDED), otherwise the
  // latest invalid attempt. Later steps run again only when the current measurement actually changed.
  function apply(p, result) {
    if (S.state.project !== p) return;
    const prev = p.processing.result, replaced = result.valid && prev && prev.recordingId !== result.recordingId;
    S.update(pp => {
      if (result.valid) {
        if (replaced) pp.processing.history = (pp.processing.history || []).concat([Object.assign({ status: 'superseded', recordingId: prev.recordingId, takenAt: prev.takenAt, processedAt: prev.processedAt, rt60: prev.headline.rt60, method: prev.headline.method, f: prev.headline.f }, AM.derive.takeSummary(prev))]).slice(-20);
        pp.processing.result = result; pp.processing.attempt = null; pp.measurement.retry = null;
      } else {
        const ref = result.bands.find(b => b.f === result.referenceBand);
        pp.processing.attempt = { status: 'invalid', recordingId: result.recordingId, takenAt: result.takenAt, processedAt: result.processedAt, reason: result.reason, result };
        pp.measurement.retry = { f: result.referenceBand, decayDb: ref ? ref.decayRangeDb : null, neededDb: PROC.REQUIRED.T20, reason: result.reason };
      }
    });
    if (replaced) {
      S.resetFrom('results');
      S.toast('The new measurement is now current. Results and the steps after it will be checked again.');
    }
  }

  W.define('processing', {
    view,
    canContinue,
    continueLabel: 'View results',
    actions: {
      // Back to Measurement for a new take. The latest take and the current measurement stay until a new take replaces them.
      repeat: () => S.go('measure'),
    },
    mount() {
      const p = S.state.project, rec = p && p.measurement.recording;
      if (!rec || rec.status !== 'captured' || job || outcome(p, rec)) return;
      // Each job clears only itself: a cancelled job's late answer must not end the job that replaced it (another
      // project opened on this step meanwhile).
      const mine = job = { i: -1, recId: rec.id, ctl: PROC.run(rec, { noise: p.setup.noise, onStep: i => { if (job === mine) { mine.i = i; AM.app.render(); } } }) };
      mine.ctl.done.then(result => { if (job === mine) job = null; apply(p, result); }, () => { if (job === mine) job = null; });
    },
    leave() { if (job) { job.ctl.cancel(); job = null; } },
    // Developer tools: only a project with a real, valid measurement can pass this step.
    demoFill: p => !!AM.derive.measured(p),
  });
})(window.AM);

/* Step 6 · Results — the current measurement: RT60 band by band, the measured decay curves, and how each value was
   calculated. Measured values only, all from the take that is the current measurement. The target is compared in the
   next step, not here. A band the recording could not support shows "Not reliable", never a value.
   The headline is the average RT60 across the bands that have a value (AM.services.rt60Average), labelled as such;
   each band, 1000 Hz included, keeps its own value in the table and the chart. */
(function (AM) {
  'use strict';
  const { esc, icon, fmt } = AM.util;
  const W = AM.workflow, S = AM.store, D = AM.demo, ui = AM.ui;
  const PROC = AM.services.processing;

  // Browser processing as the take recorded it: each feature reported off, reported on, or not reported (unknown).
  // Never "switched off" for a feature the browser did not report.
  const processingOf = meta => {
    const M = AM.services.measurement;
    if (meta.config && meta.config.processing) return M.processingText(meta.config.processing);
    return meta.settings ? M.processingText(M.processingState(meta.settings, null)) : 'Not recorded with this take';
  };
  // The sound output as the take recorded it: confirmed by the browser, or played through the system's output unconfirmed.
  const outputOf = meta => {
    const o = meta.config && meta.config.output, name = meta.outputLabel ? esc(meta.outputLabel) : null;
    if (!o) return name || 'Not named by the browser';
    if (o.verified) return `${name || 'Selected output'}<div class="kv-note">selected and confirmed by the browser</div>`;
    if (o.selectable) return `${name || 'The system default output'}<div class="kv-note">the system default: which device played was not confirmed</div>`;
    return `${name || 'The system\'s current output'}<div class="kv-note">this browser could not choose or confirm the output</div>`;
  };

  // What showed the recording to be continuous, as the take recorded it: the browser's own count of lost audio, no
  // click above the sweep, and the sweep's own timing. A check this take could not make says so.
  const continuityOf = meta => {
    const ig = meta.integrity, ck = meta.clicks, t = meta.timing, CK = AM.analysis.CRITERIA.take.clicks, said = [];
    if (ig) said.push(ig.inputLostFrames == null && ig.outputUnderruns == null ? 'this browser keeps no count of lost audio' : `the browser counted ${ig.inputLostFrames === 0 ? 'no lost microphone audio' : `${ig.inputLostFrames} lost microphone frames`}${ig.outputUnderruns != null ? ` and ${ig.outputUnderruns === 0 ? 'no gap' : `${ig.outputUnderruns} gaps`} in the sound output` : ''}`);
    if (ck) said.push(ck.checked ? `no click (above ${CK.db} dB) from ${ck.fromSec.toFixed(1)} s to ${ck.toSec.toFixed(1)} s into the sweep` : 'clicks not checked: nothing to read above the sweep');
    if (t) said.push(t.checked ? `the sweep arrived on time in ${t.segments} parts (largest step ${t.maxStepMs} ms)` : `timing not checked: ${t.reason || ''}`);
    if (!said.length) return 'Not checked with this take';
    const checked = (ig && (ig.inputLostFrames != null || ig.outputUnderruns != null)) || (ck && ck.checked) || (t && t.checked);
    return `${checked ? 'Continuous' : 'Not checked'}<div class="kv-note">${esc(said.join('; '))}</div>`;
  };

  function view(ctx) {
    const p = ctx.project, res = AM.derive.measured(p);
    if (!res) return { body: ui.note('There is no valid measurement yet. Go back to Processing.', 'warn') };
    const h = res.headline, ref = res.bands.find(b => b.f === res.referenceBand), meta = res.meta || {}, lv = meta.levels || {}, plan = meta.plan || {};
    const sel = res.bands.find(b => b.f === ctx.state.ui.band && b.curve) || ref;
    const hist = p.processing.history || [];
    const change = AM.derive.noiseChange(p);

    // The headline is the average of the fixed bands 500, 1000 and 2000 Hz (AM.derive.averageRT60); without all three
    // it is unavailable and says which band failed. The 1000 Hz value, the reference band the target is compared at,
    // stays a band value: in the last tile and in the table.
    const RA = AM.services.rt60Average, avg = AM.derive.averageRT60(p);
    const req = RA.REQUIRED.map(f => res.bands.find(b => b.f === f) || { f });
    const hero = `<section class="card hero-card is-measured-card">
      <header class="card-h"><span class="label">${RA.LABEL}</span>${ui.tag('measured')}</header>
      <div class="hero-row">
        <div class="hero-v" data-watch="avg-headline">${avg.available ? `${avg.value.toFixed(2)}<small>s</small>` : '—'}</div>
        <div class="hero-pills">${avg.available ? ui.pill('neutral', `Mean of ${RA.REQUIRED.map(f => fmt.hzShort(f)).join(', ')} Hz`) : ui.pill('warn', 'No average', 'alert')}${res.status === 'warning' ? ui.pill('warn', 'With warnings', 'alert') : ui.pill('good', 'Valid', 'seal')}</div>
      </div>
      <div class="mini-stats">
        ${[...req.map(b => [fmt.hz(b.f), b.rt60 != null ? `${fmt.s(b.rt60)} · ${b.path}` : 'Not reliable']), [`Measured at ${fmt.hz(h.f)}`, `${h.quality} · ${h.confidence.toLowerCase()} confidence`]].map(([k, v]) => `<div class="mini"><span class="mini-k">${k}</span><span class="mini-v">${v}</span></div>`).join('')}
      </div>
      <p class="small muted">${avg.available ? `The mean of the RT60 at ${RA.REQUIRED.map(f => fmt.hz(f)).join(', ')}, always these three bands: a summary of the mid frequencies, not a standardised single-number rating.` : esc(avg.reason || '')} Every band's RT60 is in the table below. The target is compared at ${fmt.hz(h.f)}, in the next step.</p>
    </section>`;

    // Where the take was made comes from the take itself (older takes did not record it: then the setup's position).
    const pos = D.POSITIONS.find(x => x.id === (meta.position || p.setup.position)) || D.POSITIONS[0];
    const kind = meta.deviceKind && D.DEVICE_KINDS[meta.deviceKind];
    const record = ui.card({ title: 'Measurement record', right: ui.pill('good', 'Current', 'seal'), body: `${ui.kv([
      ['Recorded', fmt.when(res.takenAt)],
      ['Measuring device', `${kind ? esc(kind.name) : 'This device'}<div class="kv-note">its own speaker and microphone</div>`],
      ['Position', `${pos.id} · ${esc(pos.name)}`],
      ['Test signal', plan.f1 ? `Sine sweep ${plan.f1} Hz–${(plan.f2 / 1000).toFixed(plan.f2 % 1000 ? 1 : 0)} kHz, ${plan.seconds} s` : '—'],
      ['Sweep level', `${ui.levelDb(plan.levelDb)}<div class="kv-note">relative to the app's default sweep; not sound pressure</div>`],
      ['Distortion', `${ui.distortionText(meta.distortion)}<div class="kv-note">harmonics against the main response, from the sweep</div>`],
      ['Sound output', outputOf(meta)],
      ['Microphone', `${esc(meta.deviceLabel || '—')}<div class="kv-note">${meta.sampleRate ? `${meta.sampleRate / 1000} kHz · ` : ''}uncalibrated${meta.config && meta.config.browser ? ` · ${esc(meta.config.browser)}` : ''}</div>`],
      ['Browser processing', `${esc(processingOf(meta))}<div class="kv-note">all three were requested off; one the browser does not report is unknown, not off</div>`],
      ['Recording continuity', continuityOf(meta)],
      ['Input level during the sweep', meta.sweepGainDb != null ? `${Math.abs(meta.sweepGainDb) < 1 ? 'Steady' : `${meta.sweepGainDb > 0 ? '+' : '−'}${Math.abs(meta.sweepGainDb).toFixed(1)} dB`}<div class="kv-note">the background above the sweep against before it (${meta.sweepGainDb > 0 ? '+' : meta.sweepGainDb < 0 ? '−' : ''}${Math.abs(meta.sweepGainDb).toFixed(1)} dB); a device turning its input down shows here</div>` : 'Not checked with this take'],
      ['Arrival delay', meta.latencySec != null ? `${Math.round(meta.latencySec * 1000)} ms<div class="kv-note">from playing to recording, read from the recording</div>` : '—'],
      ['Direct sound', ref.headDb != null ? `${ref.headDb.toFixed(1)} dB above the room's decay at ${fmt.hz(ref.f)}<div class="kv-note">${ref.headDb > AM.analysis.CRITERIA.decay.directAllowanceDb ? `evaluation moved ${(ref.headDb - AM.analysis.CRITERIA.decay.directAllowanceDb).toFixed(1)} dB lower, below it` : 'no dominant direct sound: standard evaluation'}</div>` : '—'],
      ['Background before the signal', ui.dbfs(lv.preRollDbfs)],
      ['Signal above background', lv.snrDb != null ? `${lv.snrDb.toFixed(1)} dB` : '—'],
      ['Analysis', 'Sweep deconvolution · octave filters · direct sound separated · Lundeby noise floor · Schroeder integration'],
      ['Earlier measurements', hist.length ? `${hist.length} replaced (superseded)` : 'None'],
    ])}
      <p class="small muted">A browser-based measurement with the device's built-in speaker and microphone. RT60 comes from the room's measured decay; the microphone and speaker are not calibrated and no correction for them is applied, so this is not a calibrated or laboratory-grade measurement.</p>
      <div class="row-actions"><button class="btn btn-secondary btn-sm" data-action="copyDiagnostics">${icon('copy', 15, 2)}Copy diagnostics</button><span class="small muted">The technical record of this take, to send if a device measures oddly: no audio, no names, no device labels.</span></div>` });

    // Newer takes that are not this measurement (AM.derive.laterTakes): said here, next to the values they did not
    // replace, so a value from an earlier take is never taken for the latest one.
    const later = AM.derive.laterTakes(p).map(k => (k.kind === 'unprocessed'
      ? ui.note(`<b>A newer take, recorded ${esc(fmt.when(k.takenAt))}, has not been processed yet.</b> The values here are from the measurement of ${esc(fmt.when(res.takenAt))}. <button class="btn btn-secondary btn-sm" data-action="processLatest">Process it</button>`, 'warn')
      : ui.note(`<b>Your latest take (${esc(fmt.when(k.takenAt))}) gave no value${k.kind === 'failed' ? ': it could not be analysed' : ''}.</b> ${esc(k.reason || '')} Shown: the measurement of ${esc(fmt.when(res.takenAt))}.`, 'warn'))).join('');
    const notes = `${later}${change != null ? ui.note(`<b>The background has changed.</b> The latest noise measurement is ${Math.abs(change)} dB ${change > 0 ? 'louder' : 'quieter'} than when this RT60 was measured. Measure again to confirm it.`, 'warn') : ''}
      ${res.warnings && res.warnings.length ? ui.note(`<b>Measured with warnings.</b> ${res.warnings.map(esc).join(' ')}`, 'warn') : ''}`;

    const fit = sel.fit, mult = sel.path ? PROC.FACTOR[sel.path] : null;
    const chips = res.bands.map(b => `<button class="chip" data-action="band" data-value="${b.f}" aria-pressed="${b.f === sel.f}" ${b.curve ? '' : 'disabled'} title="${b.rt60 == null ? esc(b.reason || 'Not reliable') : ''}">${fmt.hz(b.f)}</button>`).join('');
    const decay = ui.card({
      title: `Decay curve at ${fmt.hz(sel.f)}`, sub: 'Measured: the band-filtered impulse response and its backward-integrated decay.', right: `<div class="chips">${chips}</div>`,
      body: `${ui.chart('decay', { curve: sel.curve, noiseDb: sel.noiseFloorDb, fit: fit || null, path: sel.path, rt: sel.rt60, f: sel.f, crossSec: sel.crossSec }, 290)}
        ${ui.legend([['line', 'Decay curve (backward-integrated)'], ['faint', 'Band energy'], ['eval', `${sel.path || 'Evaluation'} range`], ['dash', 'Fit, extended over 60 dB of decay'], ['dash-muted', 'Noise floor']])}
        <p class="chart-caption">${fit && sel.rt60 != null
          ? `${sel.path} at ${fmt.hz(sel.f)}: the fitted decay falls from −${+Math.abs(fit.from).toFixed(1)} dB at ${fit.t1.toFixed(2)} s to −${+Math.abs(fit.to).toFixed(1)} dB at ${fit.t2.toFixed(2)} s. ${(fit.t2 - fit.t1).toFixed(3)} s × ${mult} = <b>${fmt.s(sel.rt60)}</b> (r² ${fit.r2.toFixed(4)}).${sel.headDb > AM.analysis.CRITERIA.decay.directAllowanceDb ? ` The device's direct sound lies ${sel.headDb.toFixed(1)} dB above the start of the room's decay here, so the range starts below it.` : ''}`
          : `No RT60 at ${fmt.hz(sel.f)}: ${esc(sel.reason || 'not enough usable decay')}`}</p>`,
    });

    const rows = res.bands.map(b => `<tr class="${b.f === res.referenceBand ? 'is-ref' : ''}"><td>${fmt.hz(b.f)}</td>
      <td class="r">${b.t20 != null ? fmt.s(b.t20) : '—'}</td><td class="r">${b.t30 != null ? fmt.s(b.t30) : '—'}</td>
      <td class="r">${b.rt60 != null ? `<b>${fmt.s(b.rt60)}</b>` : `<span class="nr" title="${esc(b.reason || '')}">Not reliable</span>`}</td>
      <td>${b.path || '—'}</td><td class="r">${b.decayRangeDb != null ? `${Math.round(b.decayRangeDb)} dB` : '—'}</td><td>${ui.pill(ui.tone[b.quality] || 'neutral', b.quality)}</td></tr>`).join('');
    const unreliable = res.bands.filter(b => b.rt60 == null).map(b => `<li><b>${fmt.hz(b.f)}:</b> ${esc(b.reason || 'Not reliable')}</li>`).join('');
    const bands = ui.card({
      title: 'RT60 by octave band', right: ui.tag('measured'),
      body: `${ui.chart('bands', { series: [{ label: 'Measured RT60', kind: 'measured', values: res.bands.map(b => b.rt60) }], unit: 's', label: res.referenceBand, height: 240, yTitle: 'RT60 (s)', aria: 'Measured RT60 by octave band', missingText: 'not reliable' }, 240)}
        <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Band</th><th class="r">T20</th><th class="r">T30</th><th class="r">RT60</th><th>Method</th><th class="r">Usable decay</th><th>Quality</th></tr></thead><tbody>${rows}</tbody></table></div>
        ${ui.averageSummary(avg)}
        ${unreliable ? `<p class="small muted">Bands without a value could not be measured reliably in this take:</p><ul class="bullets small">${unreliable}</ul>` : ''}`,
    });

    return { body: `<div class="grid split">${hero}${record}</div>${notes}${decay}${bands}${comparison(p)}` };
  }

  /* The takes of this project side by side, with the sweep level each was made at (AM.derive.takeComparison). Shown
     once there is more than one. */
  const STATUS = { current: ['good', 'Current'], superseded: ['neutral', 'Replaced'], invalid: ['critical', 'Not valid'], failed: ['critical', 'Not used'] };
  function comparison(p) {
    const { rows, spread } = AM.derive.takeComparison(p);
    if (rows.length < 2) return '';
    const f = fmt.hz(AM.demo.REFERENCE_BAND), n = v => (v == null ? '—' : v);
    const body = rows.map(r => `<tr class="${r.status === 'current' ? 'is-ref' : ''}">
      <td>${fmt.when(r.takenAt)}</td><td>${ui.levelDb(r.levelDb)}</td><td>${ui.pill(STATUS[r.status][0], STATUS[r.status][1])}</td>
      <td class="r">${r.average != null ? fmt.s(r.average) : '—'}</td><td class="r">${r.rt60 != null ? `<b>${fmt.s(r.rt60)}</b>` : '—'}</td><td>${n(r.method)}</td>
      <td class="r">${r.decayDb != null ? `${Math.round(r.decayDb)} dB` : '—'}</td>
      <td class="r">${r.t20 != null ? fmt.s(r.t20) : '—'} / ${r.t30 != null ? fmt.s(r.t30) : '—'}</td>
      <td class="r">${r.r2 != null ? r.r2.toFixed(4) : '—'}</td>
      <td class="r">${r.bandsValid != null ? `${r.bandsValid} of ${r.bandsTotal}` : '—'}</td>
      <td>${r.distortion ? esc(ui.distortionText(r.distortion)) : '—'}${r.reason ? `<div class="kv-note">${esc(r.reason)}</div>` : ''}</td></tr>`).join('');
    return ui.card({
      title: 'Takes in this project', sub: `Each take with the sweep level it was made at: its 500–2000 Hz average, and RT60, usable decay, T20 / T30 and r² at ${f}. Takes replaced before this column existed show "—".`,
      body: `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Taken</th><th>Sweep level</th><th>Status</th><th class="r">Average 500–2000 Hz</th><th class="r">RT60 at ${f}</th><th>Method</th><th class="r">Usable decay</th><th class="r">T20 / T30</th><th class="r">r²</th><th class="r">Bands with a value</th><th>Distortion · reason</th></tr></thead><tbody>${body}</tbody></table></div>
        ${spread != null && spread > 0.1 ? ui.note(`<b>RT60 at ${f} differs by ${Math.round(spread * 100)} % between sweep levels.</b> With linear playback and recording, valid takes agree whatever the level. Distortion at the higher level or noise at the lower one may be affecting a take: compare their distortion and usable decay, and measure again.`, 'warn') : ''}
        <p class="small muted">With linear playback and recording, valid takes at different sweep levels give similar RT60: the level changes how far the room's decay rises above the background, not the decay itself. A higher level helps only while it adds usable decay without distortion, so the loudest is not automatically the best. The current measurement is the latest valid take; earlier ones are kept here, not overwritten.</p>`,
    });
  }

  W.define('results', {
    view,
    canContinue: p => (AM.derive.measured(p) ? { ok: true } : { ok: false, reason: 'There is no valid measurement yet.' }),
    continueLabel: 'Assess against target',
    actions: {
      band: (ctx, v) => S.ui({ band: Number(v) }),
      processLatest: () => S.go('processing'),
      copyDiagnostics: async ctx => {
        const d = AM.derive.diagnostics(ctx.project);
        if (!d) return;
        const text = JSON.stringify(d, null, 2);
        let ok = false;
        try { await navigator.clipboard.writeText(text); ok = true; } catch (e) {
          // Without the clipboard permission (or on http): the classic copy of a selected text field.
          const ta = document.createElement('textarea');
          ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
          document.body.appendChild(ta); ta.select();
          try { ok = document.execCommand('copy'); } catch (e2) { ok = false; }
          ta.remove();
        }
        S.toast(ok ? 'Diagnostics copied. Paste them into an email or message.' : 'This browser did not allow copying. Nothing was copied.');
      },
    },
  });
})(window.AM);

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

  const onSettings = st => {
    if (!st) return 'Not reported';
    const on = ['echoCancellation', 'noiseSuppression', 'autoGainControl'].filter(k => st[k] === true);
    const names = { echoCancellation: 'echo cancellation', noiseSuppression: 'noise suppression', autoGainControl: 'automatic gain' };
    return on.length ? `Still on: ${on.map(k => names[k]).join(', ')}` : ['echoCancellation', 'noiseSuppression', 'autoGainControl'].some(k => st[k] === false) ? 'Switched off' : 'Not reported by this browser';
  };

  function view(ctx) {
    const p = ctx.project, res = AM.derive.measured(p);
    if (!res) return { body: ui.note('There is no valid measurement yet. Go back to Processing.', 'warn') };
    const h = res.headline, ref = res.bands.find(b => b.f === res.referenceBand), meta = res.meta || {}, lv = meta.levels || {}, plan = meta.plan || {};
    const sel = res.bands.find(b => b.f === ctx.state.ui.band && b.curve) || ref;
    const hist = p.processing.history || [];
    const change = AM.derive.noiseChange(p);

    // The headline is the average across the measured bands (AM.derive.averageRT60). The 1000 Hz value, the reference
    // band the target is compared at, stays a band value: in the last tile and in the table.
    const avg = AM.derive.averageRT60(p), inc = avg.included.map(b => b.rt60);
    const hero = `<section class="card hero-card is-measured-card">
      <header class="card-h"><span class="label">${AM.services.rt60Average.LABEL}</span>${ui.tag('measured')}</header>
      <div class="hero-row">
        <div class="hero-v" data-watch="avg-headline">${avg.available ? `${avg.value.toFixed(2)}<small>s</small>` : '—'}</div>
        <div class="hero-pills">${ui.pill('neutral', `Average of ${avg.n} of ${avg.total} bands`)}${res.status === 'warning' ? ui.pill('warn', 'With warnings', 'alert') : ui.pill('good', 'Valid', 'seal')}</div>
      </div>
      <div class="mini-stats">
        ${[['Bands averaged', avg.n ? `${avg.included.map(b => fmt.hzShort(b.f)).join(' · ')} Hz` : 'None'], ['Left out', avg.excluded.length ? avg.excluded.map(b => fmt.hz(b.f)).join(', ') : 'None'],
          ['Band values', inc.length ? `${Math.min(...inc).toFixed(2)}–${fmt.s(Math.max(...inc))}` : '—'], [`At ${fmt.hz(h.f)}`, `${fmt.s(h.rt60)} · ${h.method} · ${h.quality}`]].map(([k, v]) => `<div class="mini"><span class="mini-k">${k}</span><span class="mini-v">${v}</span></div>`).join('')}
      </div>
      <p class="small muted">${avg.available ? 'The mean of the bands with a reliable value, as a summary: not a standardised single-number rating.' : esc(avg.reason || '')} Each band's RT60 is in the table below. The target is compared at ${fmt.hz(h.f)}, in the next step.</p>
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
      ['Sound output', meta.outputLabel ? esc(meta.outputLabel) : 'Not named by the browser'],
      ['Microphone', `${esc(meta.deviceLabel || '—')}<div class="kv-note">${meta.sampleRate ? `${meta.sampleRate / 1000} kHz · ` : ''}uncalibrated</div>`],
      ['Browser processing', esc(onSettings(meta.settings))],
      ['Arrival delay', meta.latencySec != null ? `${Math.round(meta.latencySec * 1000)} ms<div class="kv-note">from playing to recording, read from the recording</div>` : '—'],
      ['Direct sound', ref.headDb != null ? `${ref.headDb.toFixed(1)} dB above the room's decay at ${fmt.hz(ref.f)}<div class="kv-note">${ref.headDb > AM.analysis.CRITERIA.decay.directAllowanceDb ? `evaluation moved ${(ref.headDb - AM.analysis.CRITERIA.decay.directAllowanceDb).toFixed(1)} dB lower, below it` : 'no dominant direct sound: standard evaluation'}</div>` : '—'],
      ['Background before the signal', ui.dbfs(lv.preRollDbfs)],
      ['Signal above background', lv.snrDb != null ? `${lv.snrDb.toFixed(1)} dB` : '—'],
      ['Analysis', 'Sweep deconvolution · octave filters · direct sound separated · Lundeby noise floor · Schroeder integration'],
      ['Earlier measurements', hist.length ? `${hist.length} replaced (superseded)` : 'None'],
    ])}
      <p class="small muted">A browser-based measurement with the device's built-in speaker and microphone. RT60 comes from the room's measured decay; the microphone and speaker are not calibrated and no correction for them is applied, so this is not a calibrated or laboratory-grade measurement.</p>` });

    const notes = `${change != null ? ui.note(`<b>The background has changed.</b> The latest noise measurement is ${Math.abs(change)} dB ${change > 0 ? 'louder' : 'quieter'} than when this RT60 was measured. Measure again to confirm it.`, 'warn') : ''}
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
      <td class="r">${r.rt60 != null ? `<b>${fmt.s(r.rt60)}</b>` : '—'}</td><td>${n(r.method)}</td>
      <td class="r">${r.decayDb != null ? `${Math.round(r.decayDb)} dB` : '—'}</td>
      <td class="r">${r.t20 != null ? fmt.s(r.t20) : '—'} / ${r.t30 != null ? fmt.s(r.t30) : '—'}</td>
      <td class="r">${r.r2 != null ? r.r2.toFixed(4) : '—'}</td>
      <td class="r">${r.bandsValid != null ? `${r.bandsValid} of ${r.bandsTotal}` : '—'}</td>
      <td>${r.distortion ? esc(ui.distortionText(r.distortion)) : '—'}${r.reason ? `<div class="kv-note">${esc(r.reason)}</div>` : ''}</td></tr>`).join('');
    return ui.card({
      title: 'Takes in this project', sub: `Each take with the sweep level it was made at. RT60, usable decay, T20 / T30 and r² at ${f}.`,
      body: `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Taken</th><th>Sweep level</th><th>Status</th><th class="r">RT60</th><th>Method</th><th class="r">Usable decay</th><th class="r">T20 / T30</th><th class="r">r²</th><th class="r">Bands with a value</th><th>Distortion · reason</th></tr></thead><tbody>${body}</tbody></table></div>
        ${spread != null && spread > 0.1 ? ui.note(`<b>RT60 at ${f} differs by ${Math.round(spread * 100)} % between sweep levels.</b> With linear playback and recording, valid takes agree whatever the level. Distortion at the higher level or noise at the lower one may be affecting a take: compare their distortion and usable decay, and measure again.`, 'warn') : ''}
        <p class="small muted">With linear playback and recording, valid takes at different sweep levels give similar RT60: the level changes how far the room's decay rises above the background, not the decay itself. A higher level helps only while it adds usable decay without distortion, so the loudest is not automatically the best. The current measurement is the latest valid take; earlier ones are kept here, not overwritten.</p>`,
    });
  }

  W.define('results', {
    view,
    canContinue: p => (AM.derive.measured(p) ? { ok: true } : { ok: false, reason: 'There is no valid measurement yet.' }),
    continueLabel: 'Assess against target',
    actions: { band: (ctx, v) => S.ui({ band: Number(v) }) },
  });
})(window.AM);

/* Step 7 · Acoustic Assessment — how does the measured room compare with the target?
   Target, measured value and assessment stay three separate things on screen. */
(function (AM) {
  'use strict';
  const { esc, icon, fmt } = AM.util;
  const W = AM.workflow, ui = AM.ui;

  function sentence(a) {
    const t = a.target, f = fmt.hz(a.f);
    if (a.status === 'above') return `At ${f} the room measures ${fmt.s(a.rt)}: ${fmt.s(a.diff)} longer than the preferred ${fmt.s(t.preferred)} and ${fmt.s(a.rt - t.max)} above the top of the range. ${a.above} of ${a.bands.length} bands ${a.above === 1 ? 'is' : 'are'} above the range.`;
    if (a.status === 'below') return `At ${f} the room measures ${fmt.s(a.rt)}, which is ${fmt.s(t.min - a.rt)} below the bottom of the range. It is drier than intended, and adding absorption would make it drier still.`;
    return `At ${f} the room measures ${fmt.s(a.rt)}, inside the ${t.min.toFixed(2)}–${fmt.s(t.max)} range. The room meets its target.`;
  }

  function view(ctx) {
    const a = AM.derive.assessment(ctx.project);
    if (!a) return { body: ui.note('Assessment needs a target and a valid measurement.', 'warn') };
    const t = a.target;

    const tri = `<div class="grid g3">
      ${ui.stat({ kind: 'target', label: 'Preferred target', value: t.preferred.toFixed(2), tag: ui.tag('target'), sub: `Range ${t.min.toFixed(2)}–${fmt.s(t.max)} · set in step 2` })}
      ${ui.stat({ kind: 'measured', label: `Measured at ${fmt.hz(a.f)}`, value: a.rt.toFixed(2), tag: ui.tag('measured'), sub: `${a.method} · ${a.confidence.toLowerCase()} confidence · step 6` })}
      ${ui.stat({ label: 'Assessment', value: fmt.signedS(a.diff).replace(' s', ''), sub: `${ui.status(a.status)}<span>vs preferred</span>` })}
    </div>`;

    // The comparison stays at the reference band, where the target is set; the average on Results is a summary only.
    const avg = AM.derive.averageRT60(ctx.project);
    const scale = ui.card({ title: `Measured against target at ${fmt.hz(a.f)}`, body: `${ui.rtScale({ target: t, measured: a.rt })}<p class="lead">${sentence(a)}</p>
      ${avg.available ? `<p class="small muted">The average RT60 across the measured bands is ${fmt.s(avg.value)} (${avg.n} of ${avg.total} bands, Results). The target is set at ${fmt.hz(a.f)}, so the room is assessed with its ${fmt.hz(a.f)} value; the other bands are compared below.</p>` : ''}` });

    const rows = a.bands.map(b => `<tr class="${b.f === a.f ? 'is-ref' : ''}"><td>${fmt.hz(b.f)}</td><td class="r">${fmt.s(b.rt)}</td><td class="r">${t.min.toFixed(2)}–${fmt.s(t.max)}</td><td class="r">${fmt.signedS(b.diff)}</td><td>${ui.status(b.status)}</td></tr>`).join('');
    const bands = ui.card({
      title: 'Band by band', sub: 'Measured RT60 in each octave band, against the target range.',
      body: `${ui.chart('bands', { series: [{ label: 'Measured RT60', kind: 'measured', values: a.bands.map(b => b.rt) }], target: t, unit: 's', label: a.f, height: 240, yTitle: 'RT60 (s)', aria: 'Measured RT60 by band against the target range' }, 240)}
        ${ui.legend([['measured', 'Measured RT60'], ['zone', `Target range ${t.min.toFixed(2)}–${t.max.toFixed(2)} s`], ['pref', 'Preferred']])}
        <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Band</th><th class="r">Measured</th><th class="r">Target range</th><th class="r">vs preferred</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table></div>`,
    });

    const decision = a.status === 'above'
      ? ui.note(`<b>Treatment needed.</b> The next step looks at how much absorption would bring ${fmt.hz(a.f)} down to ${fmt.s(t.preferred)}.`, 'warn')
      : a.status === 'within'
        ? ui.note('<b>Room meets target.</b> Treatment is optional. You can still explore it in the next step.', 'good')
        : ui.note('<b>Drier than the target.</b> Adding absorption would move the room further from the target. Treatment is not recommended.', 'warn');

    const v = { body: `${tri}${scale}${decision}${bands}` };
    v.primary = { label: a.status === 'above' ? 'Explore treatment' : 'Continue to Treatment', action: 'continue' };
    return v;
  }

  W.define('assessment', {
    view,
    canContinue: p => (AM.derive.assessment(p) ? { ok: true } : { ok: false, reason: 'Assessment needs a target and a valid measurement.' }),
  });
})(window.AM);

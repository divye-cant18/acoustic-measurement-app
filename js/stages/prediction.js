/* Step 9 · Predicted Result — measured condition + the whole treatment plan = predicted condition, compared with the target.
   Predicted values come only from AM.services.prediction (the RT60 after treatment, from the measured room) and are
   always styled apart from measured ones. The room's own RT60 is never predicted. */
(function (AM) {
  'use strict';
  const { esc, icon, fmt } = AM.util;
  const W = AM.workflow, ui = AM.ui;

  function sentence(h, t, st, area, f) {
    if (!area) return 'No treatment area yet, so the prediction equals the measured value.';
    const gain = `Shortens RT60 at ${fmt.hz(f)} by ${fmt.s(h.measured - h.predicted)}`;
    if (st === 'above') return `${gain}. Still ${fmt.s(h.predicted - t.max)} above the target range.`;
    if (st === 'below') return `${gain}, but overshoots: ${fmt.s(t.min - h.predicted)} below the target range. Less treatment would do.`;
    return `${gain}, into the target range.`;
  }

  function view(ctx) {
    const p = ctx.project, pred = AM.derive.prediction(p), a = AM.derive.assessment(p), g = AM.derive.geometry(p);
    if (a && !pred && AM.derive.noTreatment(p)) {
      // No treatment chosen because the room does not need it: nothing to model, the measured room stands.
      return { body: ui.card({
        title: `Measured and target at ${fmt.hz(a.f)}`, right: ui.status(a.status),
        body: `${ui.rtScale({ target: a.target, measured: a.rt })}
          <p class="lead">No treatment was selected, so there is nothing to predict. The room measures ${fmt.s(a.rt)} at ${fmt.hz(a.f)}, ${a.status === 'within' ? 'inside the target range' : 'below the target range'}.</p>` }) };
    }
    if (!pred || !a) return { body: ui.note(esc(AM.derive.planProblem(p) || 'Prediction needs a valid measurement and a selected product configuration.'), 'warn') };
    const h = pred.headline, t = a.target, items = pred.items, multi = items.length > 1;
    const st = AM.acoustics.classify(h.predicted, t);
    // The "reach the target" suggestion is for the product being edited, given what the others add.
    const sel = items.find(i => i.id === (AM.derive.treatmentSelection(p) || {}).id) || items[items.length - 1];
    const goal = AM.derive.treatmentForTarget(p, sel);

    const compare = `<div class="compare">
      ${ui.stat({ kind: 'measured', label: 'Current', value: h.measured.toFixed(2), tag: ui.tag('measured'), sub: `${fmt.hz(h.f)} · from the measurement` })}
      <span class="compare-sep" aria-hidden="true">${icon('arrowR', 22, 2)}</span>
      ${ui.stat({ kind: 'predicted', label: multi ? 'Predicted, all products' : 'Predicted', value: h.predicted.toFixed(2), tag: ui.tag('predicted'), sub: ui.planText(items), watch: 'pred-headline' })}
      <span class="compare-sep" aria-hidden="true">vs</span>
      ${ui.stat({ kind: 'target', label: 'Target', value: t.preferred.toFixed(2), tag: ui.tag('target'), sub: `Range ${t.min.toFixed(2)}–${fmt.s(t.max)}` })}
    </div>`;

    const scale = ui.card({
      title: `Measured, predicted and target at ${fmt.hz(h.f)}`, right: ui.predStatus(st),
      body: `${ui.rtScale({ target: t, measured: h.measured, predicted: h.predicted, arrow: true })}<p class="lead">${sentence(h, t, st, pred.plan.areaM2, h.f)}</p>`,
    });

    const goalText = !goal ? null : sel.mode === 'units' ? `${goal.units} panels` : fmt.m2(goal.areaM2);
    const qty = ui.card({
      title: 'Try a different amount', sub: 'Changes here update the treatment plan and the prediction together.',
      body: `${items.map(it => `<div class="selected-product"><b>${multi ? `#${it.no} ` : ''}${esc(it.product.name)}</b><span>${esc(it.configuration.label)}</span></div>
          ${ui.amountControl(it, 'pred')}`).join('')}
        ${ui.coverageWarning(AM.derive.coverage(p))}
        ${goalText ? ui.kv([[`${sel.mode === 'units' ? 'Panels' : 'Area'}${multi ? ` of #${sel.no}` : ''} to reach ${fmt.s(t.preferred)}`, goalText, 'is-strong']]) : ''}
        ${ui.amountGoal(goal, sel, t.preferred)}`,
    });

    // One line per product (its own amount × its own α), then the plan total.
    const k = h.items, V = g.V;
    // Where Room Setup says what finish an item covers, its own absorption is replaced: area × (α − finish α).
    const addedRows = items.map((it, i) => {
      const label = multi ? `Added by #${it.no} ${esc(it.product.name)}` : 'Added absorption', sym = multi ? `ΔA${it.no}` : 'ΔA', x = k[i];
      const factor = x.coveredKnown ? `(α − finish α)` : 'α', fv = x.coveredKnown ? `(${x.alpha.toFixed(2)} − ${x.coveredAlpha.toFixed(2)})` : x.alpha.toFixed(2);
      return it.mode === 'units'
        ? [label, `${sym} = panels × panel area × ${factor}(${h.f} Hz)`, `${it.quantity} × ${it.size.areaM2.toFixed(3)} × ${fv} = <b>${fmt.m2(x.addedA)}</b>`]
        : [label, `${sym} = treatment area × ${factor}(${h.f} Hz)`, `${it.areaM2.toFixed(1)} × ${fv} = <b>${fmt.m2(x.addedA)}</b>`];
    });
    const unknownCover = items.filter((it, i) => !k[i].coveredKnown);
    const calc = ui.card({
      title: `How this is calculated at ${fmt.hz(h.f)}`, sub: 'Simplified Sabine model',
      body: `<div class="calc">
        ${[
          ['Room volume', 'V', `<b>${fmt.m3(V)}</b>`],
          ['Existing absorption', 'A₀ = 0.161 × V ÷ measured RT60', `0.161 × ${V.toFixed(0)} ÷ ${h.measured.toFixed(2)} = <b>${fmt.m2(h.existingA)}</b>`],
          ...addedRows,
          multi ? ['Added, all products', `ΔA = ${items.map(it => `ΔA${it.no}`).join(' + ')}`, `<b>${fmt.m2(h.addedA)}</b>`] : null,
          ['Total absorption', 'A = A₀ + ΔA', `<b>${fmt.m2(h.totalA)}</b>`],
          ['Predicted RT60', 'RT60 = 0.161 × V ÷ A', `0.161 × ${V.toFixed(0)} ÷ ${h.totalA.toFixed(1)} = <b>${fmt.s(h.predicted)}</b>`, 'is-result'],
        ].filter(Boolean).map(([key, f, v, cls]) => `<div class="calc-r ${cls || ''}"><span class="calc-k">${key}</span><span class="calc-f">${f}</span><span class="calc-v">${v}</span></div>`).join('')}
      </div>
      ${(pred.checks || []).map(c => ui.note(esc(c.text), 'warn')).join('')}
      ${ui.note(`A₀ is the room's equivalent absorption from the measured RT60 (the relation ISO 354 uses): furniture, people and air included. α is the octave-band value of ${items.map(it => `${multi ? `#${it.no} ` : ''}${esc(it.configuration.label)} (certificate ${esc(it.configuration.test.certificate || '—')})`).join(', ')}: the mean of the three tested one-third-octave values in each octave, at most 1.00. The finish α is that of the surface each product covers, from Room Setup.${unknownCover.length ? ` For ${unknownCover.map(it => `${multi ? `#${it.no} ` : ''}${esc(it.product.name)}`).join(', ')} the covered finish is not set, so its own absorption is not subtracted and the effect may be overstated a little.` : ''} The model assumes an even (diffuse) sound field and that the measured RT60 represents the room; placement and edge effects of the panels are not modelled, so treat the result as an estimate.`, 'info', 'flask')}`,
    });

    const rows = pred.bands.map(b => {
      const s = AM.acoustics.classify(b.predicted, t);
      return `<tr class="${b.f === h.f ? 'is-ref' : ''}"><td>${fmt.hz(b.f)}</td><td class="r">${fmt.s(b.measured)}</td><td class="r">${fmt.s(b.predicted)}</td><td class="r">${b.predicted != null ? fmt.signedS(b.predicted - b.measured) : '—'}</td><td>${b.measured == null ? '<span class="small muted">Not measured reliably</span>' : b.missingAlpha ? '<span class="small muted">No tested α at this band</span>' : b.coveredExceedsMeasured ? '<span class="small muted">Finish values do not fit the room here</span>' : ui.predStatus(s)}</td></tr>`;
    }).join('');
    const bands = ui.card({
      title: 'Band by band',
      body: `${ui.chart('bands', { series: [{ label: 'Measured', kind: 'measured', values: pred.bands.map(b => b.measured) }, { label: 'Predicted', kind: 'predicted', values: pred.bands.map(b => b.predicted) }], target: t, unit: 's', label: h.f, height: 250, yTitle: 'RT60 (s)', aria: 'Measured and predicted RT60 by band' }, 250)}
        ${ui.legend([['measured', 'Measured'], ['predicted', 'Predicted (modelled)'], ['zone', `Target range ${t.min.toFixed(2)}–${t.max.toFixed(2)} s`], ['pref', 'Preferred']])}
        <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Band</th><th class="r">Measured</th><th class="r">Predicted</th><th class="r">Change</th><th>Predicted vs target</th></tr></thead><tbody>${rows}</tbody></table></div>`,
    });

    return { body: `${compare}${scale}<div class="grid split">${calc}${qty}</div>${bands}` };
  }

  W.define('prediction', {
    view,
    canContinue: p => {
      // Amounts can also be changed here, so the plan is checked again.
      const problem = AM.derive.treatmentItems(p).length ? AM.derive.planProblem(p) : null;
      if (problem) return { ok: false, reason: problem };
      return AM.derive.prediction(p) || AM.derive.noTreatment(p) ? { ok: true } : { ok: false, reason: 'Prediction needs a valid measurement.' };
    },
    continueLabel: 'View final result',
  });
})(window.AM);

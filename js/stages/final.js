/* Step 10 · Final Result — the whole journey: room, target, measured, treatment, predicted, compared with target.
   Validation by a second measurement after installation is shown as the next stage, not built yet.
   The project report (PDF, js/report) is offered once, at the bottom, after everything it summarises, and only after
   the report form for this project has been received (js/services/report-gate.js). */
(function (AM) {
  'use strict';
  const { esc, icon, fmt } = AM.util;
  const W = AM.workflow, S = AM.store, D = AM.demo, ui = AM.ui;
  let reportBusy = false;

  function view(ctx) {
    const p = ctx.project, g = AM.derive.geometry(p), a = AM.derive.assessment(p), pred = AM.derive.prediction(p);
    const none = !pred && AM.derive.noTreatment(p); // room meets (or is below) the target and no treatment was chosen
    if (!g || !a || (!pred && !none)) return { body: ui.note('The summary needs every earlier step.', 'warn') };
    // The whole treatment plan. With one product the page reads as before; with several it names each one.
    const t = a.target, h = pred ? pred.headline : null, items = pred ? pred.items : [], multi = items.length > 1;
    const avg = AM.derive.averageRT60(p); // summary only: the journey below is at the reference band, where the target is set
    const sel = items[0] || null, prod = sel && sel.product, cfg = sel && sel.configuration, totalArea = pred ? pred.plan.areaM2 : 0;
    const st = pred ? AM.acoustics.classify(h.predicted, t) : a.status;
    const done = W.isDone(p, 'final');
    const amountOf = it => (it.mode === 'units' ? `${it.quantity} panels` : fmt.m2(it.areaM2));
    const amount = none ? 'None' : multi ? `${items.length} products` : amountOf(sel);
    let headline;
    if (none) {
      headline = a.status === 'within'
        ? `At ${fmt.hz(a.f)} the room measures ${fmt.s(a.rt)}, inside the ${t.min.toFixed(2)}–${fmt.s(t.max)} target range. No treatment is needed.`
        : `At ${fmt.hz(a.f)} the room measures ${fmt.s(a.rt)}, below the target range. Adding absorption would make it drier, so no treatment was selected.`;
    } else {
      const gapText = `still ${fmt.s(h.predicted - t.max)} above the target range`;
      const what = multi ? `${items.length} products (${fmt.m2(totalArea)} in total)` : `${amount} of ${esc(prod.name)}`;
      const are = multi || sel.mode === 'units' ? 'are' : 'is'; // "10 panels … are", "12.5 m² … is"
      headline = !totalArea
        ? `No treatment area yet. The room stays at ${fmt.s(h.measured)} against a target of ${fmt.s(t.preferred)}.`
        : st === 'within'
          ? `${what} ${are} predicted to bring ${fmt.hz(h.f)} from ${fmt.s(h.measured)} to ${fmt.s(h.predicted)}, inside the target range.`
          : st === 'above'
            ? `${what} ${are} predicted to bring ${fmt.hz(h.f)} from ${fmt.s(h.measured)} to ${fmt.s(h.predicted)}. That is ${gapText}.`
            : `${what} ${are} predicted to bring ${fmt.hz(h.f)} to ${fmt.s(h.predicted)}, below the target range. Less treatment would do.`;
    }

    // "Project complete" only when nothing earlier is waiting for review.
    const flagged = W.needsReview(p, 'final') || p.review.some(id => id !== 'final');
    const badge = done && !flagged ? ui.pill('good', 'Project complete', 'seal') : done && flagged ? ui.pill('warn', 'Needs review', 'alert') : '';
    const hero = ui.card({
      cls: done && !flagged ? 'is-complete' : '',
      title: esc(p.room.name || 'Untitled room'), sub: `${esc([p.room.industry, p.room.type].filter(Boolean).join(' · ') || 'Room')} · ${fmt.dims(g)} · ${fmt.m3(g.V)}`,
      right: `${badge}${none ? ui.status(st) : ui.predStatus(st)}`,
      body: `<p class="lead">${headline}</p>`,
    });

    const node = (cls, label, value, sub, tag = '') => `<div class="f-node ${cls}"><div class="hstack" style="justify-content:space-between"><span class="label">${label}</span>${tag}</div><span class="f-v">${value}</span><span class="f-s">${sub}</span></div>`;
    const arrow = `<span class="f-arrow" aria-hidden="true">${icon('arrowR', 20, 2)}</span>`;
    const flow = ui.card({
      title: `Before → treatment → predicted → target, at ${fmt.hz(a.f)}`,
      body: `<div class="flow4">
          ${node('is-measured', 'Before', fmt.s(a.rt), `Measured at ${fmt.hz(a.f)}, ${a.method}`, ui.tag('measured'))}${arrow}
          ${none
            ? node('is-treatment', 'Treatment', 'None', a.status === 'within' ? 'Not needed: the room meets the target' : 'Not recommended: the room is below the target')
            : multi
              ? node('is-treatment', 'Treatment', amount, `${items.map(it => `#${it.no} ${esc(it.product.name)} · ${amountOf(it)}`).join('<br>')}<br>${fmt.m2(totalArea)} in total`)
              : node('is-treatment', 'Treatment', amount, `${esc(prod.name)} · ${esc(cfg.label)} · ${fmt.m2(sel.areaM2)}`)}${arrow}
          ${none
            ? node('is-predicted', 'Predicted', '—', 'Nothing to predict without treatment', ui.tag('predicted'))
            : node('is-predicted', 'Predicted', fmt.s(h.predicted), `${fmt.signedS(h.predicted - h.measured)} vs measured`, ui.tag('predicted'))}${arrow}
          ${node('is-target', 'Target', fmt.s(t.preferred), `${!none && totalArea ? `Gap ${fmt.signedS(h.predicted - t.preferred)}` : `Range ${t.min.toFixed(2)}–${fmt.s(t.max)}`}`, ui.tag('target'))}
        </div>
        ${none ? ui.rtScale({ target: t, measured: a.rt }) : ui.rtScale({ target: t, measured: h.measured, predicted: h.predicted, arrow: true })}`,
    });

    const record = ui.card({
      title: 'Project record',
      body: `<div class="record">
        ${ui.kv([['Room', fmt.dims(g)], ['Volume', fmt.m3(g.V)], ['Use', esc(p.room.use || '—')]])}
        ${ui.kv([['Target', `${fmt.s(t.preferred)} (${t.min.toFixed(2)}–${fmt.s(t.max)})${p.target.basis ? `<div class="kv-note">${esc(p.target.basis)}</div>` : ''}`],
          ['Average RT60', avg.available ? `${fmt.s(avg.value)}<div class="kv-note">across ${avg.n} of ${avg.total} measured bands</div>` : 'Unavailable'],
          [`Measured at ${fmt.hz(a.f)}`, `${fmt.s(a.rt)} · ${a.method}`], ['Confidence', `${a.confidence}<div class="kv-note">at ${fmt.hz(a.f)}</div>`]])}
        ${none
          ? ui.kv([['Treatment', 'None'], ['Predicted', '—']])
          : multi
            ? ui.kv([...items.map(it => [`Treatment #${it.no}`, `${amountOf(it)} × ${esc(it.product.name)}<div class="kv-note">${esc(it.configuration.label)}${it.configuration.test.certificate ? ` · ${esc(it.configuration.test.certificate)}` : ''}</div>`]), ['Treatment area', fmt.m2(totalArea)], ['Predicted', fmt.s(h.predicted)]])
            : ui.kv([['Treatment', `${amount} × ${esc(prod.name)}`], ['Configuration', `${esc(cfg.label)}<div class="kv-note">${esc(cfg.test.certificate || '')}</div>`], ['Treatment area', fmt.m2(sel.areaM2)], ['Predicted', fmt.s(h.predicted)]])}
      </div>`,
    });

    const next = none ? '' : ui.card({
      title: 'Next: verify with a new measurement', cls: 'no-print',
      body: `<p class="lead">Install the treatment, then measure the room again. Comparing the new measurement with this one is what proves the improvement. Until then, ${fmt.s(h.predicted)} is an estimate.</p>
        <div class="hstack"><button class="btn btn-secondary btn-sm" data-action="followUp">${icon('mic', 16, 2)} Measure the treated room</button><span class="small muted">Starts a new project with this room and target, at Measurement Setup.</span></div>`,
    });

    // The report unlocks once this project's report form has been received (AM.reportGate): the form until then.
    const m = AM.derive.measured(p);
    const about = `A PDF to share with a client or an acoustic consultant, made from this project's saved data: the room, the current measurement (${esc(fmt.when(m.takenAt))}), the target and the assessment${none ? '' : ', the treatment plan and the predicted result, labelled as a model estimate'}. ${none ? 'One page.' : items.length > 6 ? 'Three pages: the treatment plan is long.' : 'Two pages.'}`;
    const report = AM.reportGate ? AM.reportGate.card(p, { about, reportBusy })
      : ui.card({ title: 'Project report', cls: 'no-print', body: ui.note('The report form is not available, so the PDF report is locked.', 'warn') });

    // With a treatment plan: the official UniVicoustic panel and wall configurator, in a new tab, as the next design step.
    // It is a separate website with its own sign-in; it receives nothing from this project.
    const configure = none ? '' : `<section class="card ext-card no-print" aria-label="UniVicoustic Panel and Wall Configurator">${ui.extLink({
      tone: 'acoustic', glyph: 'wall', href: AM.brand.links.configurator, level: 2,
      title: 'Explore panel and wall configurations',
      text: 'Explore panel and wall configuration options for your acoustic treatment project.',
      label: 'Open Panel & Wall Configurator',
      note: 'Opens the UniVicoustic configurator in a new tab, where you sign in. It does not receive this room, the selected products, their quantities or the RT60 results; this project stays as it is here.',
    })}</section>`;

    const v = { body: `${hero}${flow}${none ? record : `<div class="grid g2">${record}${next}</div>`}${configure}${report}` };
    // Once finished, the main action goes home, unless an earlier change has put the summary up for review again.
    if (done && !W.needsReview(p, 'final')) v.primary = { label: 'Back to Home', action: 'go', value: 'home' };
    return v;
  }

  function canContinue(p) {
    const flagged = p.review.filter(id => id !== 'final').map(id => W.get(id).title);
    if (flagged.length) {
      return { ok: false, reason: `${flagged.length === 1 ? 'An earlier step is' : `${flagged.length} earlier steps are`} marked for review (${flagged.join(', ')}). Open each one and continue through it before finishing.` };
    }
    const problem = AM.derive.treatmentItems(p).length ? AM.derive.planProblem(p) : null;
    if (problem) return { ok: false, reason: problem };
    return AM.derive.prediction(p) || AM.derive.noTreatment(p) ? { ok: true } : { ok: false, reason: 'The summary needs every earlier step.' };
  }

  W.define('final', {
    view,
    canContinue,
    continueLabel: 'Finish project',
    mount: ($app, ctx) => { if (AM.reportGate) AM.reportGate.mount(ctx.project); },
    leave: () => { if (AM.reportGate) AM.reportGate.leave(); },
    actions: {
      reportSubmit: ctx => AM.reportGate.submit(ctx.project),
      reportRetry: ctx => AM.reportGate.retry(ctx.project),
      reportHealth: () => AM.reportGate.recheckHealth(),
      // The report of the project on screen, from its saved state. Only once its report form was received:
      // AM.report.download asks the server to confirm that again before it builds anything.
      downloadReport: async ctx => {
        if (reportBusy) return;
        const p = ctx.project;
        if (!AM.reportGate || !AM.reportGate.isUnlocked(p)) { S.toast('The PDF report unlocks after the report form is received.'); return; }
        reportBusy = true; AM.app.render();
        try {
          const r = await AM.report.download(p);
          S.toast(r.ok ? `PDF report ready: ${r.name}` : r.message);
        } catch (e) {
          S.toast('The PDF report could not be created.');
        } finally { reportBusy = false; AM.app.render(); }
      },
    },
  });
})(window.AM);

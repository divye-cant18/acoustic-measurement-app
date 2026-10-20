/* Step 10 · Final Result — the whole journey: room, target, measured, treatment, predicted, compared with target.
   Validation by a second measurement after installation is shown as the next stage, not built yet.
   The project report (PDF, js/report) is offered once, at the bottom, after everything it summarises, and only after
   the report form for this project has been received (js/services/report-gate.js).
   The screen is drawn by the interface (src/screens/Final.tsx); this file keeps the step's check and actions. */
(function (AM) {
  'use strict';
  const W = AM.workflow, S = AM.store;
  let reportBusy = false;

  function canContinue(p) {
    const flagged = p.review.filter(id => id !== 'final').map(id => W.get(id).title);
    if (flagged.length) {
      return { ok: false, reason: `${flagged.length === 1 ? 'An earlier step is' : `${flagged.length} earlier steps are`} marked for review (${flagged.join(', ')}). Open each one and continue through it before finishing.` };
    }
    const problem = AM.derive.treatmentItems(p).length ? AM.derive.planProblem(p) : null;
    if (problem) return { ok: false, reason: problem };
    const why = AM.derive.predictionMissing(p);
    return why ? { ok: false, reason: why } : { ok: true };
  }

  W.define('final', {
    model: { reportBusy: () => reportBusy }, // read by the screen
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
          S.toast(r.ok ? (r.message || `PDF report ready: ${r.name}`) : r.message);
        } catch (e) {
          S.toast('The PDF report could not be created.');
        } finally { reportBusy = false; AM.app.render(); }
      },
    },
  });
})(window.AM);

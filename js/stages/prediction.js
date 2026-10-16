/* Step 9 · Predicted Result — measured condition + the whole treatment plan = predicted condition, compared with the target.
   Predicted values come only from AM.services.prediction (the RT60 after treatment, from the measured room) and are
   always styled apart from measured ones. The room's own RT60 is never predicted. Measured and predicted are compared as
   the average over the bands the room is judged in (AM.derive.prediction: measured, predicted), and the predicted verdict
   judges every one of those bands on its own (pred.verdict): an average inside the range never hides a band outside it.
   Every band is also shown, and one band's calculation is written out as an example.
   The screen is drawn by the interface (src/screens/Prediction.tsx). */
(function (AM) {
  'use strict';
  const W = AM.workflow;

  W.define('prediction', {
    canContinue: p => {
      // Amounts can also be changed here, so the plan is checked again.
      const problem = AM.derive.treatmentItems(p).length ? AM.derive.planProblem(p) : null;
      if (problem) return { ok: false, reason: problem };
      const a = AM.derive.assessment(p);
      if (a && !a.available) return { ok: false, reason: a.blocked };
      return AM.derive.prediction(p) || AM.derive.noTreatment(p) ? { ok: true } : { ok: false, reason: 'Prediction needs a valid measurement.' };
    },
    continueLabel: 'View final result',
  });
})(window.AM);

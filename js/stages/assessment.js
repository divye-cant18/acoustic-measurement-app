/* Step 7 · Acoustic Assessment — how does the measured room compare with the target?
   Target, measured values and the verdict stay separate things on screen. The room is judged by the rule of the
   criterion its target comes from (AM.derive.assessment, AM.services.evaluation): every band the criterion sets (for a
   meeting room under DIN 18041, 250 Hz–2 kHz) has to lie within the target range. That is the VERDICT. The average over
   those bands is shown as its summary figure, but never decides alone: a band outside the range fails the room even when
   the average is inside. Bands the criterion gives wider limits (125 Hz and 4 kHz for DIN 18041 group A) are BAND
   WARNINGS, shown apart from the verdict. Every band, its limits and how many positions it rests on are in the table.
   Without the summary (too few of the criterion's bands measured) the room is not assessed and the step says why.
   The screen is drawn by the interface (src/screens/Assessment.tsx). */
(function (AM) {
  'use strict';
  const W = AM.workflow;

  W.define('assessment', {
    canContinue: p => {
      const a = AM.derive.assessment(p);
      if (!a) return { ok: false, reason: 'Assessment needs a target and a valid measurement.' };
      return a.available ? { ok: true } : { ok: false, reason: a.blocked };
    },
  });
})(window.AM);

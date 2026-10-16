/* Step 6 · Results — the room as measured: RT60 band by band over every measuring position, each position's own values,
   the measured decay curves of the latest take, and how each value was calculated. Measured values only. The target is
   compared in the next step, not here. A band no position could support shows "Not reliable", never a value.
   The room's values are the average over the valid positions, band by band (AM.derive.room, AM.services.spatial). The
   headline is the average over the bands the room's criterion sets (AM.derive.summaryRT60, e.g. 250 Hz–2 kHz for a
   meeting room under DIN 18041), with the average over all bands, 125–4000 Hz, beside it; each band keeps its own value
   in the tables and the chart. At least two valid positions are needed to continue (AM.services.spatial.MIN_POSITIONS).
   1000 Hz stays marked as the reference band: it decides whether a take is valid (services/processing.js).
   The screen is drawn by the interface (src/screens/Results.tsx); this file keeps the step's check and actions. */
(function (AM) {
  'use strict';
  const W = AM.workflow, S = AM.store;

  W.define('results', {
    // A completed session: at least two valid positions (AM.services.spatial.MIN_POSITIONS).
    canContinue: p => {
      if (!AM.derive.measured(p)) return { ok: false, reason: 'There is no valid measurement yet.' };
      const s = AM.derive.positions(p);
      return s.complete ? { ok: true } : { ok: false, reason: `Measure at least ${s.required} positions: ${s.count} ${s.count === 1 ? 'is' : 'are'} measured. Next: ${s.next}.` };
    },
    continueLabel: 'Assess against target',
    actions: {
      band: (ctx, v) => S.ui({ band: Number(v) }),
      processLatest: () => S.go('processing'),
      // The next position without a valid take, selected for the next take, then Acoustic Measurement.
      nextPosition: ctx => { const nx = AM.derive.positions(ctx.project).next; if (nx) S.update(pp => { pp.setup.position = nx; }); S.go('measure'); },
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

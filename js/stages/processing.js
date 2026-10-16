/* Step 5 · Measurement Processing — is the recorded decay trustworthy, which calculation is valid, then RT60.
   Validates the latest take with AM.services.processing. Invalid data never becomes an RT60.
   A valid take becomes the CURRENT measurement and its position's result; the previous valid take at that position is
   kept as SUPERSEDED, the other positions stay. An invalid take is kept as the latest attempt; the valid results stay in
   force. Until at least two positions are measured (AM.services.spatial.MIN_POSITIONS) the step leads to the next one.
   The screen is drawn by the interface (src/screens/Processing.tsx); this file runs the processing and stores it. */
(function (AM) {
  'use strict';
  const W = AM.workflow, S = AM.store;
  const PROC = AM.services.processing;

  let job = null; // { ctl, i, recId }

  // The evaluation shown for the latest take: the current result, the stored invalid attempt, or none yet.
  function outcome(p, rec) {
    const cur = p.processing.result, att = p.processing.attempt;
    if (cur && cur.recordingId === rec.id) return cur;
    if (att && att.recordingId === rec.id) return att.result;
    return null;
  }

  function canContinue(p) {
    const rec = p.measurement.recording, cur = AM.derive.measured(p);
    if (!rec && !cur) return { ok: false, reason: 'Measure the room first.' };
    if (rec && rec.status === 'captured' && !outcome(p, rec)) return { ok: false, reason: 'Processing is still running.' };
    if (!cur) return { ok: false, reason: 'The measurement is not valid. Measure again.' };
    return { ok: true };
  }

  /* Writes the evaluation to the project. A valid take becomes the CURRENT measurement and its position's result
     (processing.positions[position]); the earlier valid take AT THAT POSITION, if any, becomes SUPERSEDED. Results at
     other positions stay: they are part of the room. An invalid take is kept as the latest attempt, with its position;
     the valid results stay as they are. When the room's values change (a position added or measured again), Results and
     the steps after it run again. */
  function apply(p, result) {
    if (S.state.project !== p) return;
    const D = AM.derive, pos = D.positionOf(result), before = D.positionResults(p);
    const prev = (before.find(e => e.id === pos) || {}).result || null;
    const changed = result.valid && !before.some(e => e.result.recordingId === result.recordingId) && before.length > 0;
    S.update(pp => {
      if (result.valid) {
        // Results measured before positions were kept: the current take is the only one, at its own position.
        const map = pp.processing.positions || (pp.processing.positions = {});
        before.forEach(e => { if (!map[e.id]) map[e.id] = e.result; });
        if (prev && prev.recordingId !== result.recordingId) pp.processing.history = (pp.processing.history || []).concat([Object.assign({ status: 'superseded', recordingId: prev.recordingId, takenAt: prev.takenAt, processedAt: prev.processedAt, rt60: prev.headline.rt60, method: prev.headline.method, f: prev.headline.f }, D.takeSummary(prev))]).slice(-20);
        map[pos] = result;
        pp.processing.result = result; pp.processing.attempt = null; pp.measurement.retry = null;
      } else {
        const ref = result.bands.find(b => b.f === result.referenceBand);
        pp.processing.attempt = { status: 'invalid', recordingId: result.recordingId, takenAt: result.takenAt, processedAt: result.processedAt, reason: result.reason, position: pos, result };
        pp.measurement.retry = { f: result.referenceBand, decayDb: ref ? ref.decayRangeDb : null, neededDb: PROC.REQUIRED.T20, reason: result.reason, position: pos };
      }
    });
    if (changed) {
      S.resetFrom('results');
      const s = D.positions(p);
      S.toast(`${pos} ${prev ? 'measured again' : 'added'}: the room is now measured at ${s.count} position${s.count > 1 ? 's' : ''}. Results and the steps after it will be checked again.`);
    }
  }

  W.define('processing', {
    model: { outcome, job: () => job }, // read by the screen
    canContinue,
    continueLabel: 'View results',
    actions: {
      // Back to Measurement for a new take. The latest take and the current measurement stay until a new take replaces them.
      repeat: () => S.go('measure'),
      // The next position that has no valid take: chosen for the next take, then back to Measurement.
      nextPosition: ctx => { const nx = AM.derive.positions(ctx.project).next; if (nx) S.update(pp => { pp.setup.position = nx; }); S.go('measure'); },
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

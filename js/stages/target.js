/* Step 2 · Target / Ideal RT60 — what we want, decided before measuring.
   The recommendation comes from AM.services.target (criteria in js/data/targets.js). The project keeps the values
   it confirms: while the user has not adjusted them they follow the recommendation for the room as it is now.
   The screen is drawn by the interface (src/screens/Target.tsx). */
(function (AM) {
  'use strict';
  const { isNum, round, clamp } = AM.util;
  const W = AM.workflow, S = AM.store, ui = AM.ui, TS = AM.services.target;

  const STEP = 0.05, MIN = 0.1, MAX = 4.0;

  function problem(t) {
    if (![t.preferred, t.min, t.max].every(isNum)) return 'Set a preferred value and a range.';
    if (t.min >= t.max) return 'The lower limit must be below the upper limit.';
    if (t.preferred < t.min || t.preferred > t.max) return 'The preferred value must sit inside the range.';
    return null;
  }

  const fromRecommendation = rec => ({ preferred: rec.preferred, min: rec.min, max: rec.max, source: 'recommended', basis: rec.basisLabel });
  const sameValues = (a, b) => a.preferred === b.preferred && a.min === b.min && a.max === b.max;

  W.define('target', {
    model: { MIN, MAX, problem, sameValues }, // read by the screen
    canContinue: p => { const e = problem(p.target); return e ? { ok: false, reason: e } : { ok: true }; },
    continueLabel: 'Confirm target',
    // Until the user adjusts it, the project target follows the recommendation for the room as it is now.
    // Called by the store whenever project data changes, so a room edit updates the target everywhere at once.
    sync(p) {
      if (!p || p.target.source === 'custom') return false;
      const rec = TS.recommend(p.room);
      if (!rec) return false;
      const next = fromRecommendation(rec);
      if (JSON.stringify(next) === JSON.stringify(p.target)) return false;
      p.target = next;
      return true;
    },
    // Projects saved before the room was edited catch up when the step is opened.
    mount(root, ctx) {
      const p = ctx.project;
      if (!p || p.target.source === 'custom') return;
      const rec = TS.recommend(p.room);
      if (rec) S.set('target', fromRecommendation(rec));
    },
    actions: {
      nudge: (ctx, v) => {
        const [key, dir] = v.split('|');
        delete ui.bad[`tgt-${key}-in`];
        const t = ctx.project.target, rec = TS.recommend(ctx.project.room);
        const cur = isNum(t[key]) ? t[key] : rec ? rec[key] : 0.5;
        S.set('target', Object.assign({}, t, {
          [key]: round(clamp(cur + Number(dir) * STEP, MIN, MAX), 2),
          source: 'custom', basis: rec ? `Adjusted from ${rec.basisLabel}` : 'Set manually',
        }));
      },
      // A typed value (Enter or leaving the field). Out-of-range or non-numeric text stays in the field with a message.
      typeTarget: (ctx, v, el) => {
        const key = el.dataset.key, n = AM.util.num(v), t = ctx.project.target;
        if (n == null || n < MIN || n > MAX) {
          ui.bad[el.id] = v;
          S.toast(`Enter a value from ${MIN.toFixed(2)} to ${MAX.toFixed(2)} s, e.g. 0.60.`);
          return;
        }
        delete ui.bad[el.id];
        const value = round(n, 2), rec = TS.recommend(ctx.project.room);
        if (value === t[key]) { ctx.render(); return; }
        S.set('target', Object.assign({}, t, { [key]: value, source: 'custom', basis: rec ? `Adjusted from ${rec.basisLabel}` : 'Set manually' }));
      },
      useRecommended: ctx => { const rec = TS.recommend(ctx.project.room); if (rec) S.set('target', fromRecommendation(rec)); },
    },
    demoFill(p) {
      const rec = TS.recommend(p.room);
      if (rec && (p.target.source !== 'custom' || problem(p.target))) p.target = fromRecommendation(rec);
    },
  });
})(window.AM);

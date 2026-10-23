/* Step 2 · Target / Ideal RT60 — what we want, decided before measuring.
   The recommendation comes from AM.services.target (criteria in js/data/targets.js), only from a verified criterion that
   applies to the room. The project keeps the values it confirms: while the user has not adjusted them they follow the
   recommendation for the room as it is now, with the criterion's record (source, clause, conditions, inputs); when no
   verified criterion applies they stay empty, never filled with another room's or a generic value.
   The project's own target (source 'custom'): adjusted from the recommendation, or, when there is none, entered by the
   user with where it comes from (note), so a target is never left without its source. A target is a range (preferred,
   lower and upper limit) or, when its criterion gives only a maximum, an upper limit (form 'max').
   The screen is drawn by the interface (src/screens/Target.tsx). */
(function (AM) {
  'use strict';
  const { isNum, round, clamp } = AM.util;
  const W = AM.workflow, S = AM.store, ui = AM.ui, TS = AM.services.target;

  const STEP = 0.05, MIN = 0.1, MAX = 4.0;
  const OWN_BASIS = 'Set for the project: no verified criterion applies to this room';

  // own: the target was entered without a recommendation, so its source has to be said.
  function problem(t, own) {
    if (TS.form(t) === 'max') {
      if (!isNum(t.max)) return 'Set the upper limit.';
    } else {
      if (![t.preferred, t.min, t.max].every(isNum)) return 'Set a preferred value and a range.';
      if (t.min >= t.max) return 'The lower limit must be below the upper limit.';
      if (t.preferred < t.min || t.preferred > t.max) return 'The preferred value must sit inside the range.';
    }
    if (own && (t.note || '').trim().length < 3) return 'Say where this target comes from, e.g. the client\'s specification.';
    return null;
  }
  const isOwn = (t, rec) => t.source === 'custom' && !rec;

  // tsoll: DIN 18041's T_soll, unrounded, so the band limits at 125 Hz and 4 kHz are the standard's own (evaluation.js).
  const fromRecommendation = rec => Object.assign({ preferred: rec.preferred, min: rec.min, max: rec.max, form: rec.form, source: 'recommended', basis: rec.basisLabel }, rec.tsoll != null ? { tsoll: rec.tsoll } : {}, { record: rec.record });
  // No verified criterion applies: no values (an earlier version's values are kept apart by the store, never used).
  const blank = t => Object.assign({ preferred: null, min: null, max: null, form: 'range', source: 'recommended', basis: '' }, t && t.earlier ? { earlier: t.earlier } : {});
  const sameValues = (a, b) => a.preferred === b.preferred && a.min === b.min && a.max === b.max && TS.form(a) === TS.form(b);
  /* The project's own target, adjusted from a recommendation: what it started from (adjustedFrom), so its basis can say
     when the room no longer gives that recommendation. A target already the project's own keeps its basis. */
  const adjusted = (t, rec) => (t.source === 'custom' ? { basis: t.basis || OWN_BASIS }
    : rec ? { basis: `Adjusted from ${rec.basisLabel}`, adjustedFrom: { label: rec.basisLabel, preferred: rec.preferred, min: rec.min, max: rec.max } }
      : { basis: t.basis || OWN_BASIS });
  const EARLIER = from => `Set for the project; adjusted earlier from ${from} for the room as it was then`;

  // What the target should be now, unless the user has set their own.
  function followed(p) {
    const rec = TS.recommend(p.room);
    return rec ? fromRecommendation(rec) : blank(p.target);
  }

  W.define('target', {
    model: { MIN, MAX, problem, sameValues, isOwn }, // read by the screen
    canContinue: p => {
      const rec = TS.recommend(p.room);
      if (!rec && p.target.source !== 'custom') {
        const av = TS.availability(p.room);
        // Short, for the action bar; the step itself shows the full reason.
        return { ok: false, reason: av.status === 'needs-input' || av.status === 'unselected' ? av.message
          : `No verified target criteria for this room${av.status === 'outside' ? ' at this size' : ''}. Choose another room category in Room Setup, or set the project's own target.` };
      }
      const e = problem(p.target, isOwn(p.target, rec));
      return e ? { ok: false, reason: e } : { ok: true };
    },
    continueLabel: 'Confirm target',
    // Until the user adjusts it, the project target follows the recommendation for the room as it is now (or stays
    // empty when no verified criterion applies). Called by the store whenever project data changes.
    sync(p) {
      if (p && p.target.source === 'custom') {
        // The room changed and no longer gives the recommendation this target was adjusted from: its basis says so.
        const t = p.target, rec = TS.recommend(p.room), from = t.adjustedFrom;
        const fromLabel = from ? from.label : /^Adjusted from /.test(t.basis || '') ? t.basis.replace(/^Adjusted from /, '') : null;
        if (!fromLabel) return false;
        const same = rec && rec.basisLabel === fromLabel && (!from || (rec.preferred === from.preferred && rec.min === from.min && rec.max === from.max));
        if (same) return false;
        const next = Object.assign({}, t, { basis: EARLIER(fromLabel) });
        delete next.adjustedFrom;
        p.target = next;
        return true;
      }
      if (!p) return false;
      const next = followed(p);
      if (JSON.stringify(next) === JSON.stringify(p.target)) return false;
      p.target = next;
      delete p.targetNote; // a note about the saved target (store migration) no longer applies
      return true;
    },
    // Projects saved before the room was edited catch up when the step is opened.
    mount(root, ctx) {
      const p = ctx.project;
      if (!p || p.target.source === 'custom') return;
      const next = followed(p);
      if (JSON.stringify(next) !== JSON.stringify(p.target)) S.set('target', next);
    },
    actions: {
      // − / +: from the value in the field. An empty field is never started from a made-up value.
      nudge: (ctx, v) => {
        const [key, dir] = v.split('|');
        delete ui.bad[`tgt-${key}-in`];
        const t = ctx.project.target, rec = TS.recommend(ctx.project.room);
        if (!isNum(t[key])) { S.toast('Type a value first, e.g. 0.60.'); return; }
        S.set('target', Object.assign({}, t, {
          [key]: round(clamp(t[key] + Number(dir) * STEP, MIN, MAX), 2),
          source: 'custom',
        }, adjusted(t, rec)));
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
        S.set('target', Object.assign({}, t, { [key]: value, source: 'custom' }, adjusted(t, rec)));
      },
      useRecommended: ctx => { const rec = TS.recommend(ctx.project.room); if (rec) { delete ctx.project.targetNote; S.set('target', fromRecommendation(rec)); } },
      // No verified criterion: the user enters the project's own target, with its source. Nothing is filled in for them.
      ownTarget: ctx => {
        if (TS.recommend(ctx.project.room)) return;
        delete ctx.project.targetNote;
        S.set('target', Object.assign(blank(ctx.project.target), { source: 'custom', basis: OWN_BASIS, note: '' }));
      },
      // Back to following the room's criteria (empty while none applies).
      dropOwnTarget: ctx => { S.set('target', blank(ctx.project.target)); },
    },
    demoFill(p) {
      const rec = TS.recommend(p.room);
      if (rec && (p.target.source !== 'custom' || problem(p.target, false))) p.target = fromRecommendation(rec);
    },
  });
})(window.AM);

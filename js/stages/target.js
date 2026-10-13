/* Step 2 · Target / Ideal RT60 — what we want, decided before measuring.
   The recommendation comes from AM.services.target (criteria in js/data/targets.js). The project keeps the values
   it confirms: while the user has not adjusted them they follow the recommendation for the room as it is now. */
(function (AM) {
  'use strict';
  const { esc, fmt, isNum, round, clamp } = AM.util;
  const W = AM.workflow, S = AM.store, D = AM.demo, ui = AM.ui, TS = AM.services.target;

  const STEP = 0.05, MIN = 0.1, MAX = 4.0;

  function problem(t) {
    if (![t.preferred, t.min, t.max].every(isNum)) return 'Set a preferred value and a range.';
    if (t.min >= t.max) return 'The lower limit must be below the upper limit.';
    if (t.preferred < t.min || t.preferred > t.max) return 'The preferred value must sit inside the range.';
    return null;
  }

  const fromRecommendation = rec => ({ preferred: rec.preferred, min: rec.min, max: rec.max, source: 'recommended', basis: rec.basisLabel });
  const sameValues = (a, b) => a.preferred === b.preferred && a.min === b.min && a.max === b.max;

  function recommendationCard(rec) {
    if (!rec) return ui.card({ title: 'Recommended target', body: ui.note('Describe the room type, use and size in Room Setup to get a recommendation.', 'warn') });
    const occupied = rec.inUse && rec.inUse.people;
    return ui.card({
      title: 'Recommended target for this room', sub: `${esc(rec.source.short)} · ${esc(rec.criterion.name)}`,
      right: rec.interpretation ? ui.pill('warn', 'Engineering interpretation', 'info') : ui.pill('neutral', 'From the standard', 'seal'),
      body: `<div class="grid ${occupied ? 'g2' : ''}">
          ${ui.stat({ kind: 'target', label: occupied ? 'Recommended RT60, room empty' : 'Recommended RT60', value: rec.preferred.toFixed(2), tag: ui.tag('target'), sub: `Acceptable ${rec.min.toFixed(2)}–${fmt.s(rec.max)} at ${fmt.hz(D.REFERENCE_BAND)}` })}
          ${occupied ? ui.stat({ label: `In use, ${AM.util.trimNum(rec.inUse.present)} people present`, value: rec.inUse.preferred.toFixed(2), sub: `${rec.inUse.min.toFixed(2)}–${fmt.s(rec.inUse.max)} · the value the standard sets` }) : ''}
        </div>
        <p class="lead"><b>Why.</b> ${esc(rec.reason)}</p>
        ${ui.note('This is an acoustic design target, not a measured value. The measurement in step 4 is compared with it.', 'info', 'target')}`,
    });
  }

  function analysisCard(rec) {
    if (!rec) return '';
    return ui.card({
      title: 'How it was worked out',
      body: `<div class="sub-h">Room analysed</div>
        ${ui.kv(rec.factors.map(([k, v, effect]) => [k, `${esc(v)}<div class="kv-note">${esc(effect)}</div>`]))}
        <div class="sub-h">Calculation</div>
        <ol class="rec-steps">${rec.steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol>
        ${rec.notes.map(n => ui.note(esc(n), 'warn')).join('')}
        <p class="small muted">Compared at ${fmt.hz(D.REFERENCE_BAND)}. The standards apply across several mid-frequency bands around it.</p>
        <div class="sub-h">Sources</div>
        <ul class="rec-sources">${rec.sources.map(s => `<li>${esc(s.title)}</li>`).join('')}</ul>`,
    });
  }

  function view(ctx) {
    const p = ctx.project, t = p.target, rec = TS.recommend(p.room);
    const err = problem(t), custom = t.source === 'custom';
    const stepper = (key, label, big) => ui.stepper({ id: `tgt-${key}`, action: 'nudge', typeAction: 'typeTarget', unit: 's', key, value: t[key], display: isNum(t[key]) ? t[key].toFixed(2) : '', min: MIN, max: MAX, label, big });
    // The scale always shows the whole target range, at least 0–2 s.
    const scaleMax = Math.max(2, Math.ceil((isNum(t.max) ? t.max : 0) * 1.15 / 0.5) * 0.5);

    const concept = `<div class="grid g2">
      <section class="card concept is-target">${ui.tag('target')}<h2>What we want</h2><p>The target is a decision: how reverberant this room should be for the way it is used. It is recommended from the room you described, before anything is measured.</p></section>
      <section class="card concept is-measured">${ui.tag('measured')}<h2>What we measure</h2><p>The measured RT60 is evidence from the room itself. It comes from the acoustic measurement in step 4 and is never adjusted to fit the target.</p></section>
    </div>`;

    const editor = ui.card({
      title: 'Project target', sub: `At the reference band, ${fmt.hz(D.REFERENCE_BAND)}. Starts at the recommendation; adjust it only if the project has its own criteria. Type a value or use − and +.`,
      right: custom ? ui.pill('warn', 'Adjusted') : ui.pill('good', 'Recommended', 'seal'),
      body: `<div class="target-row">
          <div class="field"><span class="field-l">Preferred</span>${stepper('preferred', 'preferred RT60', true)}</div>
          <div class="field"><span class="field-l">Range from</span>${stepper('min', 'lower limit')}</div>
          <div class="field"><span class="field-l">to</span>${stepper('max', 'upper limit')}</div>
        </div>
        ${err ? ui.note(esc(err), 'critical') : ''}
        ${ui.rtScale({ target: err ? null : t, max: scaleMax })}
        ${custom && rec && !sameValues(t, rec) ? `${ui.note(`This target differs from the recommendation of ${fmt.s(rec.preferred)} (${rec.min.toFixed(2)}–${fmt.s(rec.max)}).`, 'warn')}
          <div><button class="btn btn-secondary btn-sm" data-action="useRecommended">Use the recommended target</button></div>` : ''}`,
    });

    // The decision first (recommendation and editor), the background explanation after it.
    return { body: `${recommendationCard(rec)}<div class="grid split">${editor}${analysisCard(rec)}</div>${concept}` };
  }

  W.define('target', {
    view,
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

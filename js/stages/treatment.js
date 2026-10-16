/* Step 8 · Treatment — build a treatment plan: one or more products, each in one of its tested configurations,
   with its own amount and placement. A decision tool, not a shop. Product data comes only from
   AM.services.catalog (the NRC Master File database). This stage records the project's plan: per item a product id,
   configuration id, size, quantity or area, placement. The product database is never written to.
   The prediction adds every item's own area × α band by band; items are never merged into one product.
   The screen is drawn by the interface (src/screens/Treatment.tsx); this file keeps the plan's checks and actions. */
(function (AM) {
  'use strict';
  const { isNum } = AM.util;
  const W = AM.workflow, S = AM.store, D = AM.demo;
  const CAT = AM.services.catalog;

  function canContinue(p) {
    const a = AM.derive.assessment(p);
    if (a && !a.available) return { ok: false, reason: a.blocked };
    const plan = AM.derive.treatmentPlan(p);
    if (!plan.items.length) return AM.derive.treatmentRequired(p) ? { ok: false, reason: 'Choose a product.' } : { ok: true };
    const problem = AM.derive.planProblem(p);
    if (problem) return { ok: false, reason: problem };
    return AM.derive.prediction(p) ? { ok: true } : { ok: false, reason: 'Treatment needs a valid measurement.' };
  }

  // Bring a part of the page into view after the next render.
  const reveal = (selector, focus) => setTimeout(() => {
    const el = document.querySelector(selector);
    if (!el) return;
    el.scrollIntoView({ block: 'start', behavior: 'smooth' });
    if (focus) el.focus({ preventScroll: true });
  }, 0);
  const catalogUi = (ctx, patch) => S.ui({ catalog: Object.assign({}, ctx.state.ui.catalog, patch) });

  W.define('treatment', {
    canContinue,
    continueLabel: 'Predict result',
    actions: {
      // Adds a new item to the plan, or replaces the product of the item being edited ("Change product").
      pickProduct: (ctx, id) => {
        const product = CAT.getProduct(id);
        if (!product) return;
        const t = ctx.project.treatment, sel = AM.derive.treatmentSelection(ctx.project);
        const cfgs = CAT.getAcousticConfigurations(id);
        const hasSizes = product.size.options.some(o => isNum(o.areaM2) && o.areaM2 > 0);
        // One tested configuration is selected for you; with several, the choice is left to the user.
        // A directly entered area belongs to the previous product, so it is cleared.
        const fresh = { productId: id, configurationId: cfgs.length === 1 ? cfgs[0].id : null, size: hasSizes ? null : 'area', areaM2: null };
        if (!sel || ctx.state.ui.catalog.adding) {
          const item = Object.assign(D.newTreatmentItem(t.items), fresh);
          S.set('treatment', { items: [...t.items, item], active: item.id });
        } else if (sel.product.id !== id) {
          S.set(sel.path, Object.assign({}, t.items[sel.index], fresh));
        }
        catalogUi(ctx, { browsing: false, adding: false });
        reveal('#treat-editor');
      },
      addProduct: ctx => { catalogUi(ctx, { browsing: true, adding: true }); reveal('#cat-q', true); },
      // Which item the editor shows. Not project data in the review sense, so no step is flagged.
      editItem: (ctx, id) => { S.update(pp => { pp.treatment.active = id; }); catalogUi(ctx, { browsing: false, adding: false }); reveal('#treat-editor'); },
      removeItem: (ctx, id) => {
        const t = ctx.project.treatment, index = t.items.findIndex(x => x.id === id), items = t.items.filter(x => x.id !== id);
        const gone = AM.derive.treatmentItems(ctx.project).find(x => x.id === id);
        ctx.state.ui.removed = index < 0 ? null : { item: JSON.parse(JSON.stringify(t.items[index])), index, active: t.active, no: index + 1, name: gone ? gone.product.name : 'product' };
        S.set('treatment', { items, active: t.active === id ? (items.length ? items[items.length - 1].id : null) : t.active });
        catalogUi(ctx, { browsing: false, adding: false });
      },
      undoRemove: ctx => {
        const r = ctx.state.ui.removed;
        if (!r) return;
        const items = ctx.project.treatment.items.slice();
        items.splice(Math.min(r.index, items.length), 0, r.item);
        ctx.state.ui.removed = null;
        S.set('treatment', { items, active: r.item.id });
      },
      pickConfig: (ctx, id) => { const sel = AM.derive.treatmentSelection(ctx.project); if (sel) S.set(`${sel.path}.configurationId`, id); },
      browse: ctx => { catalogUi(ctx, { browsing: true, adding: false }); reveal('#cat-q', true); },
      cancelBrowse: ctx => catalogUi(ctx, { browsing: false, adding: false }),
      catCategory: (ctx, v) => S.uiSet('catalog.category', v),
      catSurface: (ctx, v) => S.uiSet('catalog.surface', v),
    },
    leave() { S.state.ui.removed = null; }, // the undo offer belongs to this visit of the step
    // Developer tools only: one item, the first product (in source order) with a panel size and complete octave-band α.
    demoFill(p) {
      const plan = AM.derive.treatmentPlan(p);
      if (plan.items.length && plan.items.every(i => i.complete && !i.missingBands.length)) return;
      for (const product of CAT.getProducts()) {
        if (!product.size.options.some(o => isNum(o.areaM2) && o.areaM2 > 0)) continue;
        const cfg = CAT.getAcousticConfigurations(product.id).find(c => !CAT.getOctaveAbsorption(c.id, D.BANDS).missing.length);
        if (cfg) {
          const item = Object.assign(D.newTreatmentItem([]), { productId: product.id, configurationId: cfg.id, size: null });
          p.treatment = { items: [item], active: item.id };
          return;
        }
      }
    },
  });
})(window.AM);

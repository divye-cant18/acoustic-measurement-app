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

  /* The app chooses for the user: the tested mounting that does best in this room (AM.derive.recommendConfig) and the
     amounts of all its products together (AM.derive.autoPlan). A product whose amount the user set keeps it (amountBy
     'user'); the app's products are worked out again around it whenever the plan changes. */
  const itemOf = id => AM.derive.treatmentItems(S.state.project).find(x => x.id === id) || null;
  function applyAutoPlan() {
    const p = S.state.project;
    if (!p) return;
    const plan = AM.derive.autoPlan(p), t = p.treatment, its = AM.derive.treatmentItems(p);
    const items = t.items.map(x => {
      const sug = plan[x.id], it = its.find(i => i.id === x.id);
      if (!sug || !it) return x;
      return Object.assign({}, x, it.mode === 'units' ? { quantity: sug.quantity } : { size: 'area', areaM2: Math.round(sug.areaM2 * 10) / 10 });
    });
    if (JSON.stringify(items) !== JSON.stringify(t.items)) S.set('treatment', Object.assign({}, t, { items }));
  }
  // A product just chosen: the app's mounting for it, then the amounts of the plan.
  function autoFill(id) {
    const it = itemOf(id);
    if (!it) return;
    const raw = S.state.project.treatment.items[it.index], cfg = AM.derive.recommendConfig(S.state.project, it) || raw.configurationId;
    S.set(it.path, Object.assign({}, raw, { configurationId: cfg, recommendedConfig: cfg, amountBy: 'app' }));
    applyAutoPlan();
  }

  /* A product into the plan: a new item (adding), or the product of the item being edited replaced by it (another
     version). The app then chooses its mounting and the amounts (autoFill); a directly entered area belongs to the
     previous product, so it is cleared. A product made only for ceilings starts on the ceiling, one only for walls on
     the walls. */
  function choose(ctx, id, adding) {
    const product = CAT.getProduct(id);
    if (!product) return;
    const t = ctx.project.treatment, sel = AM.derive.treatmentSelection(ctx.project);
    const cfgs = CAT.getAcousticConfigurations(id), hasSizes = product.size.options.some(o => isNum(o.areaM2) && o.areaM2 > 0);
    const fresh = { productId: id, configurationId: cfgs.length === 1 ? cfgs[0].id : null, size: hasSizes ? null : 'area', areaM2: null, quantity: 0, amountBy: 'app' };
    const where = (product.application && product.application.surfaces) || [];
    if (where.length && where.every(x => x === 'Ceiling')) fresh.placement = 'Ceiling';
    else if (where.length && where.every(x => x === 'Wall')) fresh.placement = 'Walls';
    let changed = null;
    if (!sel || adding) {
      const item = Object.assign(D.newTreatmentItem(t.items), fresh);
      S.set('treatment', { items: [...t.items, item], active: item.id });
      changed = item.id;
    } else if (sel.product.id !== id) {
      S.set(sel.path, Object.assign({}, t.items[sel.index], fresh));
      changed = sel.id;
    }
    const sol = AM.services.solutions.ofProduct(id);
    catalogUi(ctx, Object.assign({ adding: false, variant: null }, sol ? { view: 'product', cat: sol.category, group: sol.key } : {}));
    if (changed) autoFill(changed);
  }

  W.define('treatment', {
    canContinue,
    model: { applyAutoPlan }, // also run by the amount controls (src/events.ts)
    continueLabel: 'View results',
    actions: {
      /* ---------- choosing products (src/screens/Treatment.tsx, the solutions explorer) ----------
         Screen state only (ui.catalog): which view (home, a category, a product), which category and product, the
         version looked at and the search words. The selection itself is the plan (project data), so nothing chosen is
         lost while moving between them. */
      solHome: ctx => { catalogUi(ctx, { view: 'home', query: '' }); reveal('#solutions'); },
      solCategory: (ctx, id) => { catalogUi(ctx, { view: 'category', cat: id, query: '' }); reveal('#solutions'); },
      // A product: the item of the plan that has it becomes the one edited; otherwise its versions are only looked at.
      solOpen: (ctx, key) => {
        const sol = AM.services.solutions.get(key);
        if (!sol) return;
        const mine = AM.derive.treatmentItems(ctx.project).filter(it => sol.products.some(p => p.id === it.product.id));
        const active = mine.find(it => it.id === ctx.project.treatment.active) || mine[0];
        if (active && active.id !== ctx.project.treatment.active) S.update(pp => { pp.treatment.active = active.id; });
        catalogUi(ctx, { view: 'product', cat: sol.category, group: key, variant: null });
        reveal('#solutions');
      },
      // Another version (thickness, weight, size): a product in the selection changes to it, with the app's mounting and
      // amount again; one not chosen yet is only shown.
      solVariant: (ctx, id) => {
        const sol = AM.services.solutions.ofProduct(id), sel = AM.derive.treatmentSelection(ctx.project);
        if (sel && sol && sol.products.some(p => p.id === sel.product.id)) choose(ctx, id, false);
        else catalogUi(ctx, { variant: id });
      },
      // Into the selection: a new item, mounted and sized by the app; the product page then shows its result.
      solAdd: (ctx, id) => choose(ctx, id, true),
      // Kept for earlier links: a product chosen straight from a list.
      pickProduct: (ctx, id) => choose(ctx, id, !!ctx.state.ui.catalog.adding),
      // "Add a product": back to the categories.
      addProduct: ctx => { catalogUi(ctx, { view: 'home', query: '' }); reveal('#solutions'); },
      // Edit an item of the selection: its product page.
      editItem: (ctx, id) => {
        S.update(pp => { pp.treatment.active = id; });
        const it = itemOf(id), sol = it && AM.services.solutions.ofProduct(it.product.id);
        if (sol) catalogUi(ctx, { view: 'product', cat: sol.category, group: sol.key, variant: null });
        reveal('#solutions');
      },
      removeItem: (ctx, id) => {
        const t = ctx.project.treatment, index = t.items.findIndex(x => x.id === id), items = t.items.filter(x => x.id !== id);
        const gone = AM.derive.treatmentItems(ctx.project).find(x => x.id === id);
        ctx.state.ui.removed = index < 0 ? null : { item: JSON.parse(JSON.stringify(t.items[index])), index, active: t.active, no: index + 1, name: gone ? gone.product.name : 'product' };
        S.set('treatment', { items, active: t.active === id ? (items.length ? items[items.length - 1].id : null) : t.active });
        applyAutoPlan(); // the app's other products take up what the removed one did
      },
      undoRemove: ctx => {
        const r = ctx.state.ui.removed;
        if (!r) return;
        const items = ctx.project.treatment.items.slice();
        items.splice(Math.min(r.index, items.length), 0, r.item);
        ctx.state.ui.removed = null;
        S.set('treatment', { items, active: r.item.id });
        applyAutoPlan();
      },
      // Another mounting: its own absorption, so the amount is worked out again for it.
      pickConfig: (ctx, id) => {
        const sel = AM.derive.treatmentSelection(ctx.project);
        if (!sel) return;
        S.set(`${sel.path}.configurationId`, id);
        applyAutoPlan();
      },
      // Another panel size: the app's amounts are worked out again in whole panels of it.
      setSize: (ctx, v, el) => { const it = itemOf(el.dataset.key); if (!it) return; S.set(`${it.path}.size`, v); applyAutoPlan(); },
      // Where it goes: the amount follows when it was the app's (another surface has another free area and finish).
      setPlacement: (ctx, v, el) => {
        const it = itemOf(el.dataset.key);
        if (!it) return;
        S.set(`${it.path}.placement`, v);
        applyAutoPlan();
      },
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

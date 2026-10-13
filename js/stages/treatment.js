/* Step 8 · Treatment — build a treatment plan: one or more products, each in one of its tested configurations,
   with its own amount and placement. A decision tool, not a shop. Product data comes only from
   AM.services.catalog (the NRC Master File database). This stage records the project's plan: per item a product id,
   configuration id, size, quantity or area, placement. The product database is never written to.
   The prediction adds every item's own area × α band by band; items are never merged into one product. */
(function (AM) {
  'use strict';
  const { esc, icon, fmt, clamp, trimNum, isNum } = AM.util;
  const W = AM.workflow, S = AM.store, D = AM.demo, ui = AM.ui;
  const CAT = AM.services.catalog;

  const SURFACES = [['Any', 'Any surface'], ['Wall', 'Wall'], ['Ceiling', 'Ceiling']];

  const nrcRange = s => (s.nrcMin == null ? 'NRC —' : s.nrcMin === s.nrcMax ? `NRC ${s.nrcMin.toFixed(2)}` : `NRC ${s.nrcMin.toFixed(2)}–${s.nrcMax.toFixed(2)}`);
  const variantText = p => [p.category, p.finish, p.gsm.raw && `${p.gsm.raw} GSM`, p.thickness.raw && `${p.thickness.raw} mm`, p.size.raw].filter(Boolean).join(' · ');

  function configChips(c) {
    const k = c.condition, chips = [];
    if (k.mounting === 'Direct fix') chips.push('Direct fix');
    if (k.mounting === 'Air gap' && isNum(k.airGapMm)) chips.push(`Air gap ${trimNum(k.airGapMm)} mm`);
    if (k.cavityFill) chips.push(`Fill: ${k.cavityFill.material} ${trimNum(k.cavityFill.thicknessMm)} mm`);
    if (k.backing) chips.push(`Backing: ${k.backing.description} ${trimNum(k.backing.thicknessMm)} mm`);
    if (k.sourceFacing) chips.push(k.sourceFacing);
    return chips.map(t => `<span class="chip-sm">${esc(t)}</span>`).join('');
  }

  function flagList(flags) {
    if (!flags.length) return '';
    return `<ul class="flags">${flags.map(f => `<li class="flag flag-${f.severity}">${icon(f.severity === 'warning' ? 'alert' : 'info', 14, 2)}<span>${esc(f.message)}</span></li>`).join('')}</ul>`;
  }

  /* ---------- product browser ---------- */
  function browser(ctx, sel, adding) {
    const c = ctx.state.ui.catalog, src = CAT.getSource();
    const list = CAT.getProducts({ query: c.query, category: c.category, surface: c.surface });
    const chip = (action, value, current, label) => `<button class="chip" data-action="${action}" data-value="${esc(value)}" aria-pressed="${value === current}">${esc(label)}</button>`;
    const rows = list.map(p => {
      const s = CAT.getSummary(p.id);
      return `<li><button class="cat-row" data-action="pickProduct" data-value="${esc(p.id)}" aria-pressed="${!adding && !!sel && sel.product.id === p.id}">
        <span class="cat-main"><span class="cat-name">${esc(p.name)}</span><span class="cat-meta">${esc(variantText(p))}</span></span>
        <span class="cat-side"><span class="cat-nrc">${nrcRange(s)}</span><span class="cat-cfg">${s.configurationCount} tested configuration${s.configurationCount === 1 ? '' : 's'}</span></span>
      </button></li>`;
    }).join('');
    // Product discovery on the official UniVicoustic catalogue, in a new tab. The plan is built only from the tested
    // configurations listed below; nothing from the website is added to it.
    const discover = ui.extLink({
      tone: 'brand', glyph: 'panels', href: AM.brand.links.catalogue,
      title: 'Discover acoustic products',
      text: 'Explore acoustic products, finishes and applications to discover potential solutions for your room.',
      label: 'Explore UniVicoustic Product Catalogue',
      note: 'Opens the UniVicoustic website in a new tab; this project stays as it is. To use a product here, choose it below: the prediction uses only the tested data in this list.',
    });
    return ui.card({
      title: adding ? 'Add a product to the plan' : sel ? `Change the product of #${sel.no}` : 'Choose a product',
      sub: `${src.counts.products} products, ${src.counts.configurations} tested configurations · ${esc(src.file)}`,
      right: sel ? '<button class="btn btn-ghost btn-sm" data-action="cancelBrowse">Cancel</button>' : '',
      body: `${discover}
        <div class="cat-filters">
          <label class="search" for="cat-q">${icon('search', 16, 2)}<input id="cat-q" type="text" data-uibind="catalog.query" value="${esc(c.query)}" placeholder="Search name, GSM, thickness, mounting or certificate" autocomplete="off"></label>
          <div class="chips">${['All', ...CAT.getCategories()].map(v => chip('catCategory', v, c.category, v === 'All' ? 'All categories' : v)).join('')}</div>
          <div class="chips">${SURFACES.map(([v, l]) => chip('catSurface', v, c.surface, l)).join('')}</div>
        </div>
        <div class="cat-count">${list.length === src.counts.products ? `${list.length} products` : `${list.length} of ${src.counts.products} products`}</div>
        ${list.length ? `<ul class="cat-list">${rows}</ul>` : '<div class="cat-empty">No products match. Try fewer words or another category.</div>'}`,
    });
  }

  /* ---------- selected product, its configurations, and the chosen configuration's α(f) ---------- */
  function productCard(sel, refBand) {
    const p = sel.product, c = sel.configuration, cfgs = CAT.getAcousticConfigurations(p.id), src = CAT.getSource();
    const sizes = p.size.options.map(o => `${esc(o.label)}${isNum(o.areaM2) ? ` <span class="muted">${ui.panelArea(o.areaM2)}</span>` : ''}`).join('<br>');
    const facts = ui.kv([
      ['Thickness', p.thickness.mm != null ? `${trimNum(p.thickness.mm)} mm${p.thicknessTolerance.raw ? ` <span class="muted">(${esc(p.thicknessTolerance.raw)} mm)</span>` : ''}` : esc(p.thickness.raw || '—')],
      ['GSM', esc(p.gsm.raw || '—')],
      ['Sizes', sizes || '—'],
      ['Application', esc(p.application.raw || 'Not stated')],
    ]);

    const cfgRows = cfgs.map(x => {
      const warn = x.flags.filter(f => f.severity === 'warning').length;
      const chips = configChips(x);
      return `<li><button class="cfg" data-action="pickConfig" data-value="${esc(x.id)}" aria-pressed="${!!c && c.id === x.id}">
        <span class="cfg-radio" aria-hidden="true"></span>
        <span class="cfg-main"><span class="cfg-label">${esc(x.label)}</span>${chips ? `<span class="cfg-chips">${chips}</span>` : ''}<span class="cfg-cert">${esc(x.test.certificate || 'No certificate number')}</span></span>
        <span class="cfg-side"><span class="cfg-nrc">NRC ${x.ratings.nrc != null ? x.ratings.nrc.toFixed(2) : '—'}</span><span class="cfg-sub">${[x.ratings.nrcClass.grade && `Class ${x.ratings.nrcClass.grade}`, x.ratings.alphaW != null && `αw ${x.ratings.alphaW.toFixed(2)}`].filter(Boolean).join(' · ')}</span>${warn ? `<span class="cfg-warn">${icon('alert', 12, 2.2)}${warn} to check</span>` : ''}</span>
      </button></li>`;
    }).join('');

    let detail;
    if (c) {
      const fr = CAT.getFrequencyResponse(c.id);
      // The prediction works in octave bands: each octave's α is the mean of its three one-third-octave values, ≤ 1.00.
      const oct = CAT.getOctaveAbsorption(c.id, D.BANDS);
      const grouped = D.BANDS.flatMap(f => oct.thirds[f]).join() === fr.map(x => x.f).join();
      const octCell = f => (oct.values[f] != null ? oct.values[f].toFixed(2) : '<span class="cell-missing">—</span>');
      const above1 = fr.some(x => x.alpha != null && x.alpha > 1);
      const cell = x => (x.alpha != null ? x.alpha.toFixed(2) : `<span class="cell-missing" title="Source cell: ${esc(x.sourceValue || 'empty')}">—</span>`);
      detail = `<div class="cfg-detail">
        <div class="sub-h">Sound absorption by frequency · ${esc(c.label)}</div>
        ${ui.chart('bands', { freqs: fr.map(x => x.f), series: [{ label: 'α', kind: 'material', values: fr.map(x => x.alpha) }], emphasis: fr.map(x => x.f), ticks: D.BANDS, label: refBand, digits: 2, unit: '', step: 0.25, height: 210, yTitle: 'α', missingText: 'no usable value in the source', aria: `Absorption coefficient by one-third-octave band, ${c.label}` }, 210)}
        ${ui.legend([['material', 'α as tested, one-third-octave bands']])}
        <div class="tbl-wrap"><table class="tbl alpha-tbl"><thead><tr><th>Hz</th>${fr.map(x => `<th class="r">${x.f}</th>`).join('')}</tr></thead>
          <tbody><tr><td>α</td>${fr.map(x => `<td class="r">${cell(x)}</td>`).join('')}</tr>
          ${grouped ? `<tr class="alpha-oct"><td>Octave α used</td>${D.BANDS.map(f => `<td class="is-used" colspan="3"><span class="muted">${f >= 1000 ? `${f / 1000} kHz` : `${f} Hz`}</span> ${octCell(f)}</td>`).join('')}</tr>` : ''}</tbody></table></div>
        ${grouped ? '' : `<p class="small">Octave-band α used by the prediction: ${D.BANDS.map(f => `${fmt.hz(f)} ${octCell(f)}`).join(' · ')}</p>`}
        <p class="small muted">The prediction uses one α per octave band: the mean of the three one-third-octave values inside it, at most 1.00 (as ISO 11654 forms the practical absorption coefficient).${above1 ? ' Values above 1.00 are as reported by the test, which is common in reverberation-room measurements; no surface absorbs more sound than reaches it.' : ''}</p>
        ${flagList([...p.flags, ...c.flags])}
        <div class="src">${icon('doc', 14, 1.9)}<span>${esc(src.file)} › ${esc(c.source.sheet)} › row ${c.source.row}${c.source.srNo != null ? ` (SR ${c.source.srNo})` : ''} · Certificate ${esc(c.test.certificate || '—')} · ${esc(c.test.method || 'Method not stated')}${c.test.lab ? `, ${esc(c.test.lab)}` : ''} · NRC ${c.ratings.nrc != null ? c.ratings.nrc.toFixed(2) : '—'} as per test report</span></div>
      </div>`;
    } else {
      detail = ui.note(`This product was tested in ${cfgs.length} configurations. Choose the one that matches how it will be installed; each has its own absorption data.`, 'warn');
    }

    const columns = CAT.getColumns();
    const noteFor = (defs, key) => (defs.find(d => d.key === key) || { notes: [] }).notes;
    const fireRows = p.fire.map(x => [esc(`Fire · ${x.standard}`), `${esc(x.value || '—')}${[...x.notes, ...noteFor(columns.fire, x.key)].map(n => `<div class="kv-note">${esc(n)}</div>`).join('')}`]);
    const certRows = p.certifications.map(x => [esc(x.label), `${esc(x.value || '—')}${[...x.notes, ...noteFor(columns.certifications, x.key)].map(n => `<div class="kv-note">${esc(n)}</div>`).join('')}`]);
    const more = `<details class="more"><summary>More product data from the source</summary>
      ${ui.kv([...fireRows, ...certRows, p.remarks.length ? ['Remarks', p.remarks.map(esc).join('<br>')] : null])}
      <p class="small muted">Shown exactly as listed in the source, rows ${p.source.rows.join(', ')}.</p></details>`;

    return ui.card({
      title: esc(p.name), sub: esc(variantText(p)),
      right: `<button class="btn btn-ghost btn-sm" data-action="removeItem" data-value="${esc(sel.id)}">Remove</button><button class="btn btn-secondary btn-sm" data-action="browse">Change product</button>`,
      body: `${facts}
        <div><div class="sub-h">Tested configurations (${cfgs.length})</div><ul class="cfg-list">${cfgRows}</ul></div>
        ${detail}
        ${more}`,
    });
  }

  /* ---------- the treatment plan: every item on its own, then combined ---------- */
  function planCard(p, plan, pred, a, sel) {
    const f = a.f, h = pred ? pred.headline : null, items = plan.items;
    const r = id => pred && pred.items.find(i => i.id === id);
    const n = items.length, plural = n === 1 ? '' : 's';

    const rows = items.map(it => {
      const x = r(it.id), al = it.complete ? it.alpha[f] : null;
      const cfg = it.complete ? `<div class="pl-cfg">${esc(it.configuration.label)}</div>` : `<div class="pl-cfg is-missing">${icon('alert', 12, 2.2)} Choose a tested configuration</div>`;
      // data-label: the column name, shown above each value when the table stacks on narrow screens
      return `<tr class="${it.id === sel.id ? 'is-active' : ''}">
        <td class="pl-n">${it.no}</td>
        <td class="pl-prod" data-label="#${it.no}"><div class="pl-name">${esc(it.product.name)}</div>${cfg}<div class="kv-note">${esc(it.placement)}</div></td>
        <td class="pl-qty" data-label="Quantity · panel size">${it.mode === 'units' ? `${ui.qty(it.quantity, ui.MAX_PANELS, it, 'plan')}<div class="kv-note">of ${esc(it.size.label)} · ${ui.panelArea(it.size.areaM2)} each</div>` : `${ui.areaIn(it, 'plan')}<div class="kv-note">area entered</div>`}</td>
        <td class="r" data-label="Area">${fmt.m2(it.areaM2)}</td>
        <td class="r" data-label="α at ${fmt.hz(f)}">${isNum(al) ? al.toFixed(2) : '—'}</td>
        <td class="r" data-label="Added at ${fmt.hz(f)}">${x && isNum(x.addedA) ? fmt.m2(x.addedA) : '—'}</td>
        <td class="r" data-label="Predicted RT60">${x && x.alone && x.alone.predicted != null ? fmt.s(x.alone.predicted) : '—'}<div class="kv-note">on its own</div></td>
        <td class="pl-act"><button class="btn btn-ghost btn-sm" data-action="editItem" data-value="${esc(it.id)}" aria-pressed="${it.id === sel.id}">Edit</button><button class="iconbtn" data-action="removeItem" data-value="${esc(it.id)}" aria-label="Remove ${esc(it.product.name)} from the plan">${icon('x', 16, 2)}</button></td>
      </tr>`;
    }).join('');
    const eff = h && plan.areaM2 > 0 ? h.addedA / plan.areaM2 : null;
    const counted = plan.complete.length === n ? `All ${n} product${plural}` : `${plan.complete.length} of ${n} products (the rest need a configuration)`;
    const table = `<div class="tbl-wrap"><table class="tbl pl-tbl">
      <thead><tr><th></th><th>Product · configuration · placement</th><th>Quantity · panel size</th><th class="r">Area</th><th class="r"><span class="nocase">α</span> at ${fmt.hz(f)}</th><th class="r">Added at ${fmt.hz(f)}</th><th class="r">Predicted RT60</th><th></th></tr></thead>
      <tbody><tr class="pl-grp"><td colspan="8">Individual products</td></tr>${rows}</tbody>
      <tfoot><tr class="pl-grp"><td colspan="8">Combined treatment</td></tr>
        <tr class="pl-total"><td></td><td class="pl-prod"><b>${counted}</b></td><td></td>
          <td class="r" data-label="Area"><b>${fmt.m2(plan.areaM2)}</b></td>
          <td class="r" data-label="α at ${fmt.hz(f)}">${eff != null ? eff.toFixed(2) : '—'}<div class="kv-note">area-weighted</div></td>
          <td class="r" data-label="Added at ${fmt.hz(f)}"><b>${h ? fmt.m2(h.addedA) : '—'}</b></td>
          <td class="r" data-label="Predicted RT60"><b>${h ? fmt.s(h.predicted) : '—'}</b><div class="kv-note">together</div></td><td></td></tr></tfoot>
    </table></div>`;

    let total;
    if (h) {
      total = `<div class="plan-total"><span>Combined: <b>${ui.planText(plan.complete)}</b> adds <b>${fmt.m2(h.addedA)}</b> of absorption at ${fmt.hz(f)}</span>
        <span class="plan-rt">${fmt.s(h.measured)} ${icon('arrowR', 15, 2)} <b class="plan-pred" data-watch="plan-pred">${fmt.s(h.predicted)}</b>${ui.predStatus(AM.acoustics.classify(h.predicted, a.target))}</span></div>`;
    } else {
      const gap = plan.complete.find(i => i.missingBands.includes(f));
      total = ui.note(gap ? `#${gap.no} ${esc(gap.product.name)} has no usable α at ${fmt.hz(f)} in the source, so the plan cannot be predicted at that band.` : 'Choose a tested configuration for each product to see the combined result.', 'info');
    }

    // Frequency-dependent data: each item's α and added absorption, the combined total, and the predicted room.
    const freq = !pred ? '' : `<div class="sub-h">Absorption by frequency · individual and combined</div>
      <div class="tbl-wrap"><table class="tbl pl-freq"><thead><tr><th></th>${pred.bands.map(b => `<th class="r${b.f === f ? ' is-used' : ''}">${fmt.hz(b.f)}</th>`).join('')}</tr></thead><tbody>
      ${pred.items.map((it, k) => `<tr class="pl-item"><td>#${it.no} ${esc(it.product.name)} · α</td>${pred.bands.map(b => `<td class="r">${isNum(b.items[k].alpha) ? b.items[k].alpha.toFixed(2) : '<span class="cell-missing">—</span>'}</td>`).join('')}</tr>
        ${pred.bands.some(b => b.items[k].coveredKnown) ? `<tr class="pl-sub"><td>α of the finish it covers (${esc(it.placement)})</td>${pred.bands.map(b => `<td class="r">${isNum(b.items[k].coveredAlpha) ? b.items[k].coveredAlpha.toFixed(2) : '—'}</td>`).join('')}</tr>` : ''}
        <tr class="pl-sub"><td>Added: ${it.areaM2.toFixed(2)} m² × ${pred.bands.some(b => b.items[k].coveredKnown) ? '(α − finish α)' : 'α'}</td>${pred.bands.map(b => `<td class="r">${isNum(b.items[k].addedA) ? b.items[k].addedA.toFixed(2) : '—'}</td>`).join('')}</tr>`).join('')}
      <tr class="pl-sum"><td>Combined added absorption (m²)</td>${pred.bands.map(b => `<td class="r">${isNum(b.addedA) ? b.addedA.toFixed(2) : '—'}</td>`).join('')}</tr>
      <tr><td>Measured RT60</td>${pred.bands.map(b => `<td class="r">${fmt.s(b.measured)}</td>`).join('')}</tr>
      <tr class="pl-sum"><td>Predicted RT60, all products</td>${pred.bands.map(b => `<td class="r">${fmt.s(b.predicted)}</td>`).join('')}</tr>
      </tbody></table></div>
      <p class="small muted">Each product adds its own area × its own octave-band α in every band (the mean of its tested one-third-octave values in that octave, at most 1.00). Where Room Setup says what finish it covers, that finish's own absorption on the same area is replaced, not counted twice: area × (α − finish α). The plan adds them up: RT60 = 0.161 × V ÷ (A₀ + ΣΔA). A band where any product has no tested α is not predicted.</p>`;

    return ui.card({
      title: 'Treatment plan', sub: `${n} product${plural}. Each keeps its own configuration, amount and absorption data.`,
      right: `<button class="btn btn-secondary btn-sm" data-action="addProduct">${icon('plus', 15, 2.2)} Add another product</button>`,
      body: `${total}${table}${ui.coverageWarning(AM.derive.coverage(p))}${freq}`,
    });
  }

  /* ---------- the amount of the item being edited ---------- */
  function amountCard(p, sel, pred, a, need) {
    const head = { title: `Quantity · #${sel.no}`, sub: 'This product’s amount in the plan. The product database is not changed.' };
    if (!sel.complete) return ui.card(Object.assign(head, { body: ui.note('Choose a tested configuration first.') }));
    const x = pred && pred.items.find(i => i.id === sel.id), cov = AM.derive.coverage(p, sel.placement)[0];
    const RMS = AM.services.surfaces, under = RMS.coveredBy(p.room, sel.placement), f0 = a.f;
    const covers = under.known
      ? `It covers the finish of ${esc(under.names.join(', '))} (α ${under.alpha[f0].toFixed(2)} at ${fmt.hz(f0)}, from Room Setup), whose own absorption on this area is replaced, not counted twice.`
      : `The finish there is not complete in Room Setup (${esc(under.why || 'not set')}), so its own absorption is not subtracted: the prediction may overstate the effect a little. Set the surfaces in Room Setup to include it.`;
    const sizeOptions = [...sel.sizes.map(o => ({ value: String(o.index), label: `${o.label} · ${ui.panelArea(o.areaM2)} each` })), { value: 'area', label: 'Enter the treatment area directly' }];
    const sizeField = sel.sizes.length
      ? ui.select({ id: `treat-size-${sel.id}`, label: 'Panel size', bind: `${sel.path}.size`, value: sel.mode === 'area' ? 'area' : String(sel.size.index), options: sizeOptions })
      : ui.note('The source gives no panel area for this product, so enter the treatment area directly.', 'info');
    return ui.card(Object.assign(head, {
      body: `${sizeField}
        ${ui.amountControl(sel, 'edit')}
        ${ui.kv([
          ['Treatment area', fmt.m2(sel.areaM2), 'is-strong'],
          cov && [`Free surface on ${/^Wall \d$/.test(cov.label) ? cov.label : cov.label.toLowerCase()}`, fmt.m2(cov.surfaceM2)],
          cov && [`Coverage${cov.count > 1 ? ` (${cov.count} products)` : ''}`, fmt.pct(cov.fraction, 1)],
          [`Added absorption at ${fmt.hz(a.f)}`, x && isNum(x.addedA) ? fmt.m2(x.addedA) : '—'],
        ])}
        ${need > 0.05 ? ui.amountGoal(AM.derive.treatmentForTarget(p, sel), sel, a.target.preferred) : ''}
        ${ui.select({ id: `place-${sel.id}`, label: 'Placement', bind: `${sel.path}.placement`, value: sel.placement, options: RMS.PLACEMENTS.map(pl => ({ value: pl.value, label: pl.label })), hint: `Where it goes. ${covers}` })}`,
    }));
  }

  function view(ctx) {
    const p = ctx.project, g = AM.derive.geometry(p), a = AM.derive.assessment(p);
    if (!a || !g) return { body: ui.note('Treatment needs a room, a target and a valid measurement.', 'warn') };
    const plan = AM.derive.treatmentPlan(p), sel = AM.derive.treatmentSelection(p), pred = AM.derive.prediction(p);
    const need = AM.derive.absorptionGap(p);
    const added = pred ? pred.headline.addedA : 0, share = need > 0 ? added / need : 0;
    const cat = ctx.state.ui.catalog, browsing = !sel || cat.browsing, adding = !!sel && cat.adding;
    const required = AM.derive.treatmentRequired(p);

    const needCard = need > 0.05 ? ui.card({
      title: 'Absorption needed', sub: `Simplified Sabine estimate at ${fmt.hz(a.f)}`,
      body: `<div class="need">
        <div class="need-v"><span class="stat-v">${need.toFixed(1)}<small>m²</small></span><span class="small muted">more absorption to bring ${fmt.hz(a.f)} from ${fmt.s(a.rt)} to the preferred ${fmt.s(a.target.preferred)}</span></div>
        <div><div class="meter ${share >= 1 ? 'good' : ''}"><i style="width:${clamp(share, 0, 1) * 100}%"></i></div>
          <div class="need-cap">${pred ? `<span>${plan.complete.length > 1 ? 'This plan' : 'This selection'} adds <b>${added.toFixed(1)} m²</b></span><span>${fmt.pct(share)} of what is needed</span>` : '<span>Choose a product and configuration to see how much of this it covers.</span>'}</div></div>
      </div>`,
    }) : a.status === 'below'
      ? ui.note(`The room is below the target range at ${fmt.hz(a.f)}. Adding absorption would make it drier still, so treatment is not recommended. You can continue without it.`, 'warn')
      : ui.note(`The room already meets the target at ${fmt.hz(a.f)}. Treatment is optional: continue without it, or choose a product to explore.`, 'good');

    const editor = browsing
      ? `${sel ? `<div class="section-label">${adding ? `Add product #${plan.items.length + 1}` : `Change the product of #${sel.no}`}</div>` : ''}${browser(ctx, sel, adding)}`
      : `<div class="section-label" id="treat-editor">Editing #${sel.no} · ${esc(sel.product.name)}</div><div class="grid split">${productCard(sel, a.f)}${amountCard(p, sel, pred, a, need)}</div>`;
    // The last product removed from the plan, with a way to put it back.
    const removed = ctx.state.ui.removed;
    const undo = removed ? `<div class="undo-bar" role="status">${icon('trash', 15, 1.9)}<span>Removed #${removed.no} ${esc(removed.name)} from the plan.</span><button class="btn btn-secondary btn-sm" data-action="undoRemove">Undo</button></div>` : '';
    const v = { body: `${needCard}${undo}${plan.items.length ? planCard(p, plan, pred, a, sel) : ''}${editor}` };
    if (!plan.items.length && !required) v.primary = { label: 'Continue without treatment', action: 'continue' };
    return v;
  }

  function canContinue(p) {
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
    view,
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

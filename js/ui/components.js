/* UI building blocks. Each returns an HTML string.
   Inputs carry data-bind="path.to.value" and the shell writes them to the project store.
   Buttons carry data-action (+ data-value); the shell routes them to the stage first, then to global actions. */
(function (AM) {
  'use strict';
  const { esc, icon, fmt, clamp, isNum } = AM.util;
  const ui = {};

  // Application icon (the supplied brand icon) on a white tile, the same in light and dark mode.
  ui.logo = (s = 36) => `<span class="logo-tile" style="width:${s}px;height:${s}px"><img src="${AM.brand.icon}" alt="" width="${s}" height="${s}" decoding="async"></span>`;
  // Application name (the supplied wordmark). Dark mode shows it reversed (light lettering, brand red kept).
  ui.wordmark = (h = 32) => `<img class="wordmark" src="${AM.brand.wordmark}" alt="${esc(AM.brand.name)}. ${esc(AM.brand.tagline)}." style="height:${h}px" decoding="async">`;

  /* ---------- tags: what kind of value is this? ---------- */
  const TAGS = {
    measured: ['tag-measured', 'mic', 'Measured'],
    predicted: ['tag-predicted', 'trend', 'Predicted'],
    target: ['tag-target', 'target', 'Target'],
  };
  ui.tag = (kind, text) => { const [cls, ic, label] = TAGS[kind]; return `<span class="tag ${cls}">${icon(ic, 12, 2.2)}${esc(text || label)}</span>`; };

  ui.pill = (tone, text, ic) => `<span class="pill pill-${tone}">${ic ? icon(ic, 13, 2.2) : ''}${esc(text)}</span>`;
  ui.tone = { Good: 'good', Fair: 'warn', Insufficient: 'critical', 'Not measured': 'neutral', High: 'good', Medium: 'warn', None: 'critical' };

  // Status of a measured value against the target (Assessment wording).
  // Colour carries meaning only: amber = needs attention, green = target met, crimson = failed or not calculated.
  const STATUS = {
    above: ['warn', 'arrowUp', 'Needs treatment'],
    within: ['good', 'seal', 'Meets target'],
    below: ['warn', 'arrowDn', 'Below target'],
    insufficient: ['critical', 'x', 'Not calculated'],
  };
  ui.status = (s, text) => { const [tone, ic, label] = STATUS[s] || STATUS.insufficient; return ui.pill(tone, text || label, ic); };
  // Status of a predicted value against the target.
  ui.predStatus = s => ({ above: ui.pill('warn', 'Above target', 'arrowUp'), within: ui.pill('good', 'Within target', 'seal'), below: ui.pill('warn', 'Below target', 'arrowDn') }[s] || '');

  /* ---------- containers ---------- */
  ui.card = ({ title, sub, right = '', body = '', cls = '', id = '' }) =>
    `<section class="card ${cls}"${id ? ` id="${id}"` : ''}>${title ? `<header class="card-h"><div class="card-ht"><h2 class="card-t">${title}</h2>${sub ? `<p class="card-s">${sub}</p>` : ''}</div>${right ? `<div class="card-hr">${right}</div>` : ''}</header>` : ''}${body}</section>`;

  ui.note = (html, tone = 'info', ic) =>
    `<div class="note note-${tone}">${icon(ic || (tone === 'good' ? 'seal' : tone === 'info' ? 'info' : 'alert'), 16, 2)}<div>${html}</div></div>`;

  /* A link to an official UniVicoustic website (AM.brand.links): a short invitation with one button that opens the site in
     a new tab. The page keeps the project as it is; nothing is sent to the site and nothing from it enters the project.
     tone 'brand' or 'acoustic'; level: heading level of the title (3 inside a card, 2 as a section of its own). */
  ui.extLink = ({ tone = 'brand', glyph, title, text, label, href, note = '', level = 3 }) =>
    `<div class="ext-cta ext-${tone}">
      <span class="ext-ic" aria-hidden="true">${icon(glyph, 22, 1.9)}</span>
      <div class="ext-body"><h${level} class="ext-t">${esc(title)}</h${level}><p class="ext-s">${esc(text)}</p>${note ? `<p class="ext-n">${esc(note)}</p>` : ''}</div>
      <a class="btn ext-btn" href="${esc(href)}" target="_blank" rel="noopener noreferrer" aria-label="${esc(label)} (opens in a new tab)">${esc(label)} <span class="ext-arrow" aria-hidden="true">↗</span></a>
    </div>`;

  ui.kv = rows => `<dl class="kv">${rows.filter(Boolean).map(([k, v, cls]) => `<div class="kv-r ${cls || ''}"><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>`;

  // watch: a key for a value that can change while the step is open (e.g. a prediction); the shell marks it briefly when it does.
  ui.stat = ({ kind = 'plain', label, value, unit = 's', sub = '', tag = '', watch = '' }) =>
    `<div class="stat stat-${kind}"${watch ? ` data-watch="${esc(watch)}"` : ''}><div class="stat-h"><span class="stat-l">${esc(label)}</span>${tag}</div><div class="stat-v">${value}${unit ? `<small>${unit}</small>` : ''}</div>${sub ? `<div class="stat-sub">${sub}</div>` : ''}</div>`;

  ui.legend = items => `<div class="legend">${items.map(([cls, text]) => `<span class="lg"><i class="lg-${cls}"></i>${text}</span>`).join('')}</div>`;

  ui.chart = (type, spec, height) =>
    `<div class="chart" data-chart="${type}" data-spec="${esc(JSON.stringify(spec))}" style="min-height:${height}px"></div>`;

  /* Average RT60 across the measured bands, as a summary under a band table: the value, the calculation with the band
     values as stored, and the bands left out with why. avg = AM.services.rt60Average.of(result) or AM.derive.averageRT60(p). */
  ui.averageSummary = avg => {
    const RA = AM.services.rt60Average, inc = avg.included;
    const short = r => String(r || '').split(':')[0].toLowerCase();
    const excluded = avg.excluded.length ? avg.excluded.map(b => `${fmt.hz(b.f)} (${esc(short(b.reason))})`).join(', ') : 'none';
    return `<div class="avg-sum" data-watch="avg-summary">
      <div class="avg-h"><span class="label">${RA.LABEL}</span>${avg.available
        ? `<span class="avg-v">${avg.value.toFixed(2)}<small>s</small></span><span class="small muted">mean of ${avg.n} of ${avg.total} bands</span>`
        : `<span class="avg-v is-empty">Unavailable</span><span class="small muted">${esc(avg.reason || '')}</span>`}</div>
      ${avg.available ? `<p class="small avg-calc">(${inc.map(b => b.rt60.toFixed(3)).join(' + ')}) ÷ ${avg.n} = ${avg.value.toFixed(3)} s · included: ${inc.map(b => fmt.hz(b.f)).join(', ')} · excluded: ${excluded}</p>` : ''}
      <p class="small muted">${RA.METHOD} Each band's own RT60 is in the table.</p>
    </div>`;
  };

  /* ---------- form controls ---------- */
  function field(id, label, control, hint, req) {
    const tag = req === true ? '<span class="req">Required</span>' : req === 'optional' ? '<span class="opt">Optional</span>' : '';
    return `<div class="field"><label class="field-l" for="${id}">${esc(label)}${tag}</label>${control}${hint ? `<div class="field-h">${hint}</div>` : ''}</div>`;
  }
  ui.text = ({ id, label, bind, value, placeholder = '', hint, req }) =>
    field(id, label, `<input class="input" id="${id}" type="text" data-bind="${bind}" value="${esc(value ?? '')}" placeholder="${esc(placeholder)}" autocomplete="off">`, hint, req);

  /* Text typed into a number field that is not a number, by field id. The shell keeps it here so the field shows
     what was typed with an error, instead of silently dropping it. Cleared when the entry becomes a number. */
  ui.bad = {};
  const badText = (id, type) => (ui.bad[id] != null ? (type === 'int' ? 'Enter a whole number, e.g. 12' : 'Enter a number, e.g. 4.5') : null);

  ui.number = ({ id, label, bind, value, unit, hint, req, error, type = 'num', placeholder = '' }) => {
    const err = badText(id, type) || error, shown = ui.bad[id] != null ? ui.bad[id] : isNum(value) ? value : '';
    return field(id, label, `<div class="unit"><input class="input${err ? ' is-invalid' : ''}" id="${id}" type="text" inputmode="${type === 'int' ? 'numeric' : 'decimal'}" data-bind="${bind}" data-type="${type}" value="${esc(shown)}" placeholder="${esc(placeholder)}" autocomplete="off"${err ? ` aria-invalid="true" aria-describedby="${id}-err"` : ''}>${unit ? `<span class="unit-s">${unit}</span>` : ''}</div>${err ? `<div class="field-err" id="${id}-err">${icon('alert', 13, 2.2)}${esc(err)}</div>` : ''}`, hint, req);
  };

  // changeAction: route the change to a stage action instead of writing data-bind directly (for linked fields).
  ui.select = ({ id, label, bind, value, options, placeholder, hint, req, disabled, changeAction }) =>
    field(id, label, `<select class="select" id="${id}" ${changeAction ? `data-change-action="${changeAction}"` : `data-bind="${bind}"`}${disabled ? ' disabled' : ''}>${placeholder ? `<option value="" ${!value ? 'selected' : ''} disabled>${esc(placeholder)}</option>` : ''}${options.map(o => {
      const v = typeof o === 'string' ? o : o.value, l = typeof o === 'string' ? o : o.label;
      return `<option value="${esc(v)}" ${v === value ? 'selected' : ''}>${esc(l)}</option>`;
    }).join('')}</select>`, hint, req);

  // action: 'set' writes data-bind directly; a stage can pass its own action when a choice needs more than that.
  ui.seg = ({ bind, value, options, type = 'str', label, id, action = 'set' }) =>
    `<div class="seg" role="group"${label ? ` aria-label="${esc(label)}"` : ''}>${options.map((o, i) =>
      `<button type="button" ${id ? `id="${id}-${i}"` : ''} data-action="${action}" data-bind="${bind}" data-type="${type}" data-value="${esc(o.value)}" aria-pressed="${String(o.value) === String(value)}">${o.icon ? icon(o.icon, 14, 2) : ''}${esc(o.label)}</button>`).join('')}</div>`;

  /* data-value is "-1" / "1", prefixed with "key|" when one action serves several steppers.
     typeAction: the value can also be typed; the stage action gets it when the field is committed (Enter or leaving it).
     disabled: both buttons off (for example while a measurement runs). */
  ui.stepper = ({ id, action, key, value, display, min, max, label, big, typeAction, unit, disabled }) => {
    const v = d => (key ? `${key}|${d}` : String(d)), inId = `${id}-in`, bad = ui.bad[inId] != null;
    const mid = typeAction
      ? `<label class="step-val${bad ? ' is-invalid' : ''}"><input class="step-in" id="${inId}" type="text" inputmode="decimal" autocomplete="off" value="${esc(bad ? ui.bad[inId] : display)}" data-change-action="${typeAction}" data-key="${esc(key || '')}" aria-label="${esc(label)}"${bad ? ' aria-invalid="true"' : ''}>${unit ? `<small>${unit}</small>` : ''}</label>`
      : `<output id="${id}-out">${display}</output>`;
    return `<div class="stepper${big ? ' big' : ''}" role="group" aria-label="${esc(label)}"><button type="button" id="${id}-dec" data-action="${action}" data-value="${v(-1)}" aria-label="Decrease ${esc(label)}" ${disabled || value <= min + 1e-9 ? 'disabled' : ''}>${icon('minus', 16, 2.2)}</button>${mid}<button type="button" id="${id}-inc" data-action="${action}" data-value="${v(1)}" aria-label="Increase ${esc(label)}" ${disabled || value >= max - 1e-9 ? 'disabled' : ''}>${icon('plus', 16, 2.2)}</button></div>`;
  };

  /* Treatment amounts, shared by Treatment and Predicted Result. sel = one resolved treatment item
     (AM.derive.treatmentItems / treatmentSelection). Units: quantity × the chosen panel size. Area: entered directly.
     Controls carry the item id (data-item) and bind to that item's own fields, so several items can sit on one page;
     `key` keeps element ids unique when the same item appears twice (e.g. 'plan' and 'edit'). */
  ui.MAX_PANELS = 1000;
  ui.panelArea = a => fmt.m2(a, 3); // 3 decimals so quantity × area × α visibly adds up for small tiles
  ui.amountText = sel => (sel.mode === 'units'
    ? `${sel.quantity} panel${sel.quantity === 1 ? '' : 's'} · ${fmt.m2(sel.areaM2)}`
    : fmt.m2(sel.areaM2));
  // The whole plan in a few words: one item reads as before, several as a count and total area.
  ui.planText = items => (items.length === 1 ? ui.amountText(items[0])
    : `${items.length} products · ${fmt.m2(items.reduce((s, i) => s + i.areaM2, 0))}`);
  const areaError = sel => (isNum(sel.rawAreaM2) && sel.rawAreaM2 < 0 ? 'Enter 0 m² or more' : null);
  ui.amountControl = (sel, key = 'edit') => (sel.mode === 'units'
    ? `<div class="qty-row">${ui.qty(sel.quantity, ui.MAX_PANELS, sel, key)}<span class="muted">panels of ${ui.panelArea(sel.size.areaM2)}</span>${ui.bad[`${key}-qty-${sel.id}`] != null ? `<span class="field-err">${icon('alert', 13, 2.2)}Enter a whole number of panels</span>` : ''}</div>`
    : ui.number({ id: `${key}-area-${sel.id}`, label: 'Treatment area', bind: `${sel.path}.areaM2`, value: sel.rawAreaM2, unit: 'm²', placeholder: '0.0', error: areaError(sel) }));
  // Compact area field for tables.
  ui.areaIn = (sel, key = 'plan') => {
    const id = `${key}-area-${sel.id}`, bad = ui.bad[id] != null || !!areaError(sel);
    return `<span class="area-in"><input id="${id}" class="qty-in${bad ? ' is-invalid' : ''}" type="text" inputmode="decimal" data-bind="${sel.path}.areaM2" data-type="num" value="${esc(ui.bad[id] != null ? ui.bad[id] : isNum(sel.rawAreaM2) ? sel.rawAreaM2 : '')}" placeholder="0.0" aria-label="Treatment area of ${esc(sel.product.name)}"${bad ? ' aria-invalid="true"' : ''}><span class="muted">m²</span></span>`;
  };
  ui.amountGoal = (goal, sel, targetRT) => {
    if (!goal || goal.areaM2 <= 0) return '';
    const item = ` data-item="${esc(sel.id)}"`, also = goal.withOthers ? ' with the other products' : '';
    if (sel.mode === 'units') {
      if (goal.units === sel.quantity) return '';
      if (goal.units > ui.MAX_PANELS) return ui.note(`Reaching ${fmt.s(targetRT)} needs ${goal.units} panels of this size, more than the ${ui.MAX_PANELS} this tool allows. Choose a larger panel or enter the area directly.`, 'warn');
      return `<div><button class="btn btn-secondary btn-sm" data-action="setQty" data-value="${goal.units}"${item}>Use ${goal.units} panels to reach ${fmt.s(targetRT)}${also}</button></div>`;
    }
    const a = Math.round(goal.areaM2 * 10) / 10;
    return Math.abs(a - sel.areaM2) < 0.05 ? '' : `<div><button class="btn btn-secondary btn-sm" data-action="setArea" data-value="${a}"${item}>Use ${a.toFixed(1)} m² to reach ${fmt.s(targetRT)}${also}</button></div>`;
  };

  /* Deleting a project asks first, in place: state.ui.confirm = 'delete:<id>'. */
  ui.confirmingDelete = id => AM.store.state.ui.confirm === `delete:${id}`;
  ui.deleteConfirm = s => `<div class="del-confirm" role="group" aria-label="Delete ${esc(s.name)}">
      <span>Delete “${esc(s.name)}”? Its room, measurement and treatment plan are removed from this device. This cannot be undone.</span>
      <span class="hstack"><button class="btn btn-danger btn-sm" data-action="doDelete" data-value="${esc(s.id)}">Delete project</button><button class="btn btn-ghost btn-sm" data-action="cancelDelete">Cancel</button></span>
    </div>`;
  ui.deleteButton = s => `<button class="iconbtn del-btn" data-action="askDelete" data-value="${esc(s.id)}" aria-label="Delete ${esc(s.name)}" title="Delete project">${icon('trash', 17, 1.9)}</button>`;

  /* Measurement History list, used in the history panel. items = AM.store.history().map(AM.derive.summary).
     Each row reopens its project where it was left; the bin next to it deletes the project (after asking). */
  ui.historyList = (items, activeId) => {
    if (!items.length) return `<div class="hist-empty">${icon('history', 28, 1.6)}<span>No measurements yet. Start a new measurement and it will be kept here.</span></div>`;
    return `<ul class="hist-list">${items.map(s => {
      const kind = [s.industry, s.type].filter(Boolean).join(' · ') || 'Room type not set';
      const size = s.geometry ? `${fmt.dims(s.geometry)} · ${fmt.m3(s.geometry.V)}` : '';
      const open = s.id === activeId;
      const step = s.review ? `${s.review} step${s.review > 1 ? 's' : ''} to review · next: ${esc(s.reviewNext)}`
        : s.next ? `${s.done} of ${s.total} steps · next: ${esc(s.next)}` : 'Complete';
      if (ui.confirmingDelete(s.id)) return `<li class="hist-item">${ui.deleteConfirm(s)}</li>`;
      return `<li class="hist-item"><button class="hist-row${open ? ' is-open' : ''}" data-action="openProject" data-value="${esc(s.id)}">
        <span class="hist-main">
          <span class="hist-name">${s.pinned ? `<span class="hist-pin" title="Pinned">${icon('pushpin', 14, 2)}</span>` : ''}${esc(s.name)}${open ? '<span class="pill pill-neutral">Open now</span>' : ''}</span>
          <span class="hist-meta">${esc([kind, size].filter(Boolean).join(' · '))}</span>
          <span class="hist-date">Last updated ${esc(fmt.when(s.updatedAt))}</span>
        </span>
        <span class="hist-side">
          <span class="hist-rt">${s.average != null ? `RT60 ${fmt.s(s.average)} <span class="muted">average of ${s.averageBands} bands</span>` : '<span class="muted">Not measured yet</span>'}</span>
          <span class="hist-step${s.review ? ' is-review' : ''}">${step}</span>
          <span class="progress"><i style="width:${(s.done / s.total) * 100}%"></i></span>
        </span>
      </button>${ui.deleteButton(s)}</li>`;
    }).join('')}</ul>`;
  };

  /* A saved project on the Home page (Pinned and Recent). s = AM.derive.summary(project).
     Shows the room, the latest result against its target, the treatment and when it was last worked on. */
  const RESULT = { above: ['warn', 'Above target'], within: ['good', 'Within target'], below: ['warn', 'Below target'] };
  ui.projectCard = (s, activeId) => {
    const open = s.id === activeId, t = s.treatment;
    const room = [[s.industry, s.type].filter(Boolean).join(' · ') || 'Room not described yet', s.geometry ? fmt.m3(s.geometry.V) : ''].filter(Boolean).join(' · ');
    const stat = (k, v, cls = '') => `<div class="pc-stat ${cls}"><span class="pc-k">${k}</span><span class="pc-v">${v}</span></div>`;
    // The status is the assessment at the reference band, where the target is set; the measured figure is the average.
    const result = s.status ? ui.pill(RESULT[s.status][0], `${RESULT[s.status][1]} at ${fmt.hzShort(s.band)}Hz`) : ui.pill('neutral', 'Not measured yet');
    const treatment = !s.status ? ''
      : t.items ? `Treatment: ${t.items} product${t.items === 1 ? '' : 's'}${t.predictedStatus ? ` · predicted ${RESULT[t.predictedStatus][1].toLowerCase()}` : ''}`
        : t.required ? 'No treatment chosen yet' : 'No treatment needed';
    const progress = s.review ? `${s.review} step${s.review > 1 ? 's' : ''} to review · ${esc(s.reviewNext)}`
      : s.next ? `${s.done} of ${s.total} steps · next: ${esc(s.next)}` : 'Complete';
    return `<article class="pcard${s.pinned ? ' is-pinned' : ''}${open ? ' is-open' : ''}" aria-label="${esc(s.name)}">
      <header class="pc-h">
        <div class="pc-title"><button class="pc-name" data-action="openProject" data-value="${esc(s.id)}">${esc(s.name)}</button>${open ? '<span class="pill pill-neutral">Open now</span>' : ''}</div>
        <span class="pc-tools">${ui.deleteButton(s)}<button class="pin-btn" data-action="togglePin" data-value="${esc(s.id)}" aria-pressed="${s.pinned}" aria-label="${s.pinned ? 'Unpin' : 'Pin'} ${esc(s.name)}" title="${s.pinned ? 'Unpin project' : 'Pin project'}">${icon('pushpin', 17, 2)}</button></span>
      </header>
      <div class="pc-room">${esc(room)}</div>
      <div class="pc-stats">
        ${stat('Avg RT60', s.average != null ? fmt.s(s.average) : '—')}
        ${stat('Target', s.target != null ? fmt.s(s.target) : '—')}
        ${t.predicted != null ? stat('Predicted', fmt.s(t.predicted), 'is-pred') : ''}
      </div>
      <div class="pc-status">${result}${treatment ? `<span class="pc-treat">${esc(treatment)}</span>` : ''}</div>
      ${ui.confirmingDelete(s.id) ? ui.deleteConfirm(s) : `<footer class="pc-f">
        <span class="pc-when">Updated ${esc(fmt.ago(s.updatedAt))}${s.measuredAt ? ` · measured ${esc(fmt.ago(s.measuredAt))}` : ''}<br>${progress}</span>
        <button class="btn btn-secondary btn-sm" data-action="openProject" data-value="${esc(s.id)}">Open project ${icon('arrowR', 14, 2.2)}</button>
      </footer>`}
    </article>`;
  };

  // Warns when the treatment on a surface is larger than that surface. cov = AM.derive.coverage(p) (one group or a list).
  ui.coverageWarning = cov => [].concat(cov || []).filter(c => c.fraction > 1).map(c =>
    ui.note(`The treatment placed on ${/^Wall \d$/.test(c.label) ? c.label : `the ${c.label.toLowerCase()}`} (${fmt.m2(c.areaM2)}${c.count > 1 ? `, ${c.count} products` : ''}) is more than the free surface there (${fmt.m2(c.surfaceM2)}: its area less doors, windows and any existing covering). Check the amounts or the placement.`, 'warn')).join('');

  // Panel quantity stepper for one treatment item.
  ui.qty = (q, max, sel, key = 'edit') => {
    const id = `${key}-qty-${sel.id}`, item = `data-item="${esc(sel.id)}"`, bad = ui.bad[id] != null;
    return `<div class="stepper${bad ? ' is-invalid' : ''}" role="group" aria-label="Panel quantity, ${esc(sel.product.name)}"><button type="button" id="${id}-dec" data-action="qty" data-value="-1" ${item} aria-label="One panel fewer" ${q <= 0 ? 'disabled' : ''}>${icon('minus', 16, 2.2)}</button><input id="${id}" class="qty-in${bad ? ' is-invalid' : ''}" type="text" inputmode="numeric" data-bind="${sel.path}.quantity" data-type="int" data-min="0" data-max="${max}" value="${esc(bad ? ui.bad[id] : q)}" aria-label="Number of panels, ${esc(sel.product.name)}"${bad ? ' aria-invalid="true"' : ''}><button type="button" id="${id}-inc" data-action="qty" data-value="1" ${item} aria-label="One panel more" ${q >= max ? 'disabled' : ''}>${icon('plus', 16, 2.2)}</button></div>`;
  };

  ui.check = ({ id, bind, checked, label, hint }) =>
    `<label class="check" for="${id}"><input type="checkbox" id="${id}" data-bind="${bind}" ${checked ? 'checked' : ''}><span class="check-t"><span>${esc(label)}</span>${hint ? `<span class="check-h">${esc(hint)}</span>` : ''}</span></label>`;

  /* ---------- RT60 scale: target band, measured and predicted on one axis ---------- */
  ui.rtScale = ({ target, measured, predicted, arrow = false, max }) => {
    const top = Math.max(measured || 0, predicted || 0, target ? target.max : 0);
    const M = max || Math.max(1.5, Math.ceil(top * 1.3 / 0.5) * 0.5);
    const pos = v => clamp(v / M * 100, 0, 100);
    const lab = (v, text) => { const x = pos(v); const a = x < 9 ? 'a-start' : x > 91 ? 'a-end' : ''; return `<span class="rts-lab ${a}" style="left:${x}%">${text}</span>`; };
    let ticks = '', minor = '';
    for (let v = 0; v <= M + 1e-9; v += 0.5) {
      const x = pos(v), edge = x < 3 ? 'edge-l' : x > 97 ? 'edge-r' : '';
      ticks += `<span class="${edge}" style="left:${x}%">${v.toFixed(1)} s</span>`;
    }
    // Graduations every 0.1 s, longer every 0.5 s, like the scale of an instrument.
    for (let k = 1; k * 0.1 < M - 1e-9; k++) minor += `<i class="${k % 5 ? '' : 'mj'}" style="left:${pos(k * 0.1)}%"></i>`;
    const legend = [];
    if (target) legend.push(['zone', `Target range ${target.min.toFixed(2)}–${target.max.toFixed(2)} s`], ['pref', `Preferred ${target.preferred.toFixed(2)} s`]);
    if (isNum(measured)) legend.push(['measured lg-dot', 'Measured']);
    if (isNum(predicted)) legend.push(['predicted lg-dot', 'Predicted (modelled)']);
    return `<div class="rts" role="img" aria-label="${esc([isNum(measured) ? `Measured ${fmt.s(measured)}` : '', isNum(predicted) ? `predicted ${fmt.s(predicted)}` : '', target ? `target ${target.min}–${target.max} s` : ''].filter(Boolean).join(', '))}">
      <div class="rts-row">${isNum(measured) ? lab(measured, `Measured ${fmt.s(measured)}`) : ''}</div>
      <div class="rts-track">
        ${target ? `<div class="rts-band" style="left:${pos(target.min)}%;width:${pos(target.max) - pos(target.min)}%"></div><div class="rts-pref" style="left:${pos(target.preferred)}%"></div>` : ''}
        ${arrow && isNum(measured) && isNum(predicted) && predicted < measured - 0.005 ? `<div class="rts-arrow" style="left:${pos(predicted)}%;width:${pos(measured) - pos(predicted)}%"></div>` : ''}
        ${isNum(measured) ? `<span class="rts-dot measured" style="left:${pos(measured)}%"></span>` : ''}
        ${isNum(predicted) ? `<span class="rts-dot predicted" style="left:${pos(predicted)}%"></span>` : ''}
      </div>
      <div class="rts-ticks" aria-hidden="true">${minor}</div>
      <div class="rts-row below">${isNum(predicted) ? lab(predicted, `Predicted ${fmt.s(predicted)}`) : ''}</div>
      <div class="rts-axis">${ticks}</div>
      ${ui.legend(legend)}
    </div>`;
  };

  AM.ui = ui;
})(window.AM);

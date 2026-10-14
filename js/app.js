/* Application shell: workflow rail, context bar, stage canvas, action bar, sheets and toasts.
   Stages render into the canvas through their view(); everything else here is shared chrome and event wiring. */
(function (AM) {
  'use strict';
  const { esc, icon, fmt, num, int, clamp } = AM.util;
  const W = AM.workflow, S = AM.store, ui = AM.ui;
  const $app = document.getElementById('app');
  const $sheet = document.getElementById('sheet-root');
  const $toast = document.getElementById('toast-root');
  const $tip = document.getElementById('tip');
  let lastStage = null, lastSheet = '', lastToast = '', lastNav = false;
  let lastClick = null, returnTo = null; // the control that opened a panel gets focus back when it closes
  // When the step last changed. The action bar's buttons sit in the same place on every step, so the second click of a
  // double click on "Continue" would otherwise land on the next step's button and confirm a step nobody has seen.
  let stepChangedAt = 0;
  const STEP_CLICK_GUARD_MS = 450;

  const ctx = () => ({ project: S.state.project, state: S.state, store: S, render });

  /* ---------- workflow rail ---------- */
  function railHTML() {
    const p = S.state.project, cur = S.state.current;
    const label = { current: 'Current', completed: 'Completed', available: 'Upcoming', locked: 'Locked' };
    const item = s => {
      const st = W.status(p, s.id, cur), done = W.isDone(p, s.id), rev = W.needsReview(p, s.id);
      const n = W.stepNo(s.id);
      const mark = (st === 'completed' || (st === 'current' && done && s.id !== 'home')) ? icon('check', 13, 2.8)
        : st === 'locked' ? icon('lock', 11, 2.4)
        : s.id === 'home' ? icon('home', 13, 2.2) : n;
      const state = st === 'current' && done ? 'Current · completed' : label[st];
      return `<button class="wf-item is-${st}${done ? ' is-done' : ''}${rev ? ' is-flagged' : ''}" data-action="nav" data-value="${s.id}" ${st === 'current' ? 'aria-current="step"' : ''} ${st === 'locked' ? 'aria-disabled="true"' : ''}>
        <span class="wf-mark">${mark}</span>
        <span class="wf-text"><span class="wf-title">${esc(s.nav)}</span><span class="wf-state">${state}</span></span>
        ${rev ? '<span class="wf-flag" title="An earlier step changed after this one was finished">Review</span>' : ''}
      </button>`;
    };
    let wf = item(W.get('home'));
    W.PHASES.forEach(ph => { wf += `<div class="wf-phase">${ph}</div>` + W.STAGES.filter(s => s.phase === ph).map(item).join(''); });

    const g = p ? AM.derive.geometry(p) : null;
    const done = p ? p.completed.filter(id => id !== 'home').length : 0;
    const review = p ? p.review.length : 0;
    // One segment per step: done, done but to review, the current step, or still to do.
    const meter = W.STAGES.filter(s => s.id !== 'home').map(s => {
      const cls = p && W.needsReview(p, s.id) ? 'is-review' : p && W.isDone(p, s.id) ? 'is-done' : s.id === cur ? 'is-now' : '';
      return `<i class="${cls}" data-step="${s.id}" title="${esc(s.nav)}"></i>`;
    }).join('');
    return `<div class="brand">${ui.logo(34)}<div><div class="brand-name">${esc(AM.brand.name)}</div><div class="brand-sub">Acoustic Measurement</div></div>
        <button class="iconbtn only-mobile rail-close" data-action="closeNav" aria-label="Close workflow">${icon('x', 18, 2)}</button></div>
      ${p ? `<div class="proj"><span class="label">Project</span><span class="proj-name">${esc(p.room.name || 'Untitled room')}</span><span class="proj-meta">${g ? `${fmt.dims(g)} · ${fmt.m3(g.V)}` : 'Room not described yet'}</span>
        <span class="proj-saved">${icon('check', 12, 2.6)}Saved on this device · ${esc(fmt.ago(p.updatedAt))}</span></div>` : ''}
      <button class="rail-history" data-action="history">${icon('history', 16, 1.9)}<span>Measurement History</span><span class="rail-count">${S.state.projects.length}</span></button>
      <nav class="wf" aria-label="Workflow">${wf}</nav>
      <div class="rail-foot">
        <div class="rail-progress"><span>${done} of ${W.NUMBERED} steps complete</span>${review ? `<span class="is-review">${review} to review</span>` : `<span>${Math.round((done / W.NUMBERED) * 100)}%</span>`}</div>
        <div class="seg-meter" role="img" aria-label="${done} of ${W.NUMBERED} steps complete${review ? `, ${review} to review` : ''}">${meter}</div>
        <div class="legend-states" aria-hidden="true">
          <span class="is-completed"><span class="wf-mark"></span>Completed</span>
          <span class="is-current"><span class="wf-mark"></span>Current</span>
          <span class="is-available"><span class="wf-mark"></span>Upcoming</span>
          <span class="is-locked"><span class="wf-mark"></span>Locked</span>
        </div>
        <button class="rail-tools" data-action="tools">${icon('flask', 16, 1.9)} Developer tools</button>
      </div>`;
  }

  /* ---------- context bar ---------- */
  function topbarHTML(stage) {
    const p = S.state.project;
    const n = W.stepNo(stage.id);
    let facts = '';
    if (p && stage.id !== 'home') { // Home is the application's page; project values belong to project steps
      // Measured: the average RT60 at 500–2000 Hz (AM.derive.averageRT60). Target and Predicted are at the
      // reference band, where the target is set and compared; each says so in its tooltip.
      const g = AM.derive.geometry(p), t = AM.derive.target(p), avg = AM.derive.averageRT60(p), f = fmt.hz(AM.demo.REFERENCE_BAND);
      const pr = AM.derive.predictionStarted(p, S.state.current) ? AM.derive.prediction(p) : null;
      // A newer take that the measured value does not include is flagged on the value itself (and named in the tooltip).
      const later = AM.derive.laterTakes(p)[0];
      const fact = (cls, ic, k, v, tip, stale) => `<span class="fact ${cls}${v == null ? ' is-empty' : ''}${stale ? ' is-stale' : ''}" data-watch="fact-${cls}"${tip ? ` title="${esc(tip)}"` : ''}>${icon(ic, 13, 2)}<span class="fact-k">${k}</span><span class="fact-v">${v ?? '—'}</span>${stale ? '<span class="sr-only"> (from an earlier take)</span>' : ''}</span>`;
      facts = `<div class="facts" aria-label="Project values">
        ${fact('room', 'room', 'Room', g ? fmt.m3(g.V) : null)}
        ${fact('target', 'target', 'Target', t && (W.isDone(p, 'target') || stage.id === 'target') ? fmt.s(t.preferred) : null, `Preferred target RT60 at ${f}`)}
        ${fact('measured', 'mic', 'Measured avg', avg.available ? fmt.s(avg.value) : null, `${avg.available ? `${AM.services.rt60Average.LABEL}: the mean of 500, 1000 and 2000 Hz` : avg.reason || ''}${later ? ` · From an earlier take: the latest take (${fmt.when(later.takenAt)}) ${later.kind === 'unprocessed' ? 'has not been processed yet' : 'gave no value'}.` : ''}`, !!later)}
        ${fact('predicted', 'trend', 'Predicted', pr && pr.headline.predicted != null ? fmt.s(pr.headline.predicted) : null, `Predicted RT60 at ${f} after treatment (model estimate)`)}
      </div>`;
    }
    return `<header class="topbar">
      <button class="iconbtn only-mobile" data-action="openNav" aria-label="Open workflow">${icon('menu', 20, 2)}</button>
      <div class="crumb">
        <span class="crumb-project">${p && stage.id !== 'home' ? esc(p.room.name || 'Untitled room') : esc(AM.brand.name)}</span>
        ${stage.id !== 'home' ? `<span class="crumb-sep">/</span><span class="crumb-stage">${n}. ${esc(stage.title)}</span>` : ''}
      </div>
      ${facts}
    </header>`;
  }

  /* ---------- stage header and action bar ---------- */
  function headHTML(stage) {
    const p = S.state.project, done = W.isDone(p, stage.id), rev = W.needsReview(p, stage.id);
    return `<header class="stage-head">
      <div class="stage-head-text">
        <div class="eyebrow">Step ${W.stepNo(stage.id)} of ${W.NUMBERED} · ${stage.phase}</div>
        <h1 class="stage-title">${esc(stage.title)}</h1>
        <p class="stage-purpose">${esc(stage.purpose)}</p>
      </div>
      <div class="stage-tools">
        ${rev ? ui.pill('warn', 'Review: an earlier step changed', 'alert') : done ? ui.pill('neutral', 'Completed', 'check') : ''}
        <button class="btn btn-secondary btn-sm" data-action="explain">${icon('info', 16, 2)} Explain this step</button>
      </div>
    </header>`;
  }

  function footerHTML(stage, v) {
    if (v.footer === false) return '';
    const p = S.state.project, prev = W.prev(stage.id), nxt = W.next(stage.id);
    const primary = v.primary || { label: stage.continueLabel || (nxt ? `Continue to ${nxt.nav}` : 'Finish'), action: 'continue' };
    const chk = primary.action === 'continue' && stage.canContinue ? stage.canContinue(p) : { ok: true };
    return `<footer class="actionbar">
      ${prev ? `<button class="btn btn-secondary" data-action="back">${icon('chevL', 16, 2.2)}<span class="hide-sm">${esc(prev.nav)}</span><span class="show-sm">Back</span></button>` : '<span></span>'}
      <span class="actionbar-note">${chk.ok ? '' : `${icon('info', 15, 2)}${esc(chk.reason)}`}</span>
      <button class="btn btn-primary" data-action="${primary.action}"${primary.value ? ` data-value="${primary.value}"` : ''}${chk.ok ? '' : ` aria-disabled="true" data-reason="${esc(chk.reason)}"`}>${primary.rec ? `<span class="rec">${icon('rec', 16, 2)}</span>` : ''}${esc(primary.label)}${primary.rec ? '' : ` ${icon('arrowR', 16, 2.2)}`}</button>
    </footer>`;
  }

  /* ---------- sheets ---------- */
  function sheetHTML() {
    const sh = S.state.ui.sheet;
    if (!sh) return '';
    const p = S.state.project;
    let title = '', badge = '', body = '', cls = '';
    if (sh.kind === 'explain') {
      const e = AM.services.explain.forStage(sh.stage, p);
      title = e.title;
      badge = '<span class="tag tag-guide">Step guide</span>';
      body = e.paragraphs.map(t => `<p>${esc(t)}</p>`).join('') +
        `<div class="sheet-foot">${icon('info', 15, 1.9)}<span>This guide uses this project's own numbers. It explains the results; it never calculates or changes them.</span></div>`;
    } else if (sh.kind === 'tools') {
      title = 'Developer tools';
      const rows = W.STAGES.filter(s => s.id !== 'home').map(s =>
        `<button class="tool-row" data-action="autofill" data-value="${s.id}"><span class="wf-mark">${W.stepNo(s.id)}</span><span>${esc(s.title)}</span>${icon('chevR', 14, 2)}</button>`).join('');
      body = `<p>Shortcuts for reviewing one step without clicking through the ones before it. Room Setup and Target are filled with a sample room. Measurement steps are never filled in: they need a real background-noise measurement and a real take, so the shortcut stops at the first step that needs one.</p>
        <div class="sub-h">Jump to a step</div><div class="tool-list">${rows}</div>
        ${p ? `<div class="sub-h">This project</div>
          ${S.state.ui.confirm === 'reset'
            ? `<div class="confirm"><span>Reset clears this project’s data and progress.</span><button class="btn btn-sm btn-primary" data-action="doReset">Reset project</button><button class="btn btn-sm btn-ghost" data-action="cancelReset">Cancel</button></div>`
            : `<div class="hstack"><button class="btn btn-secondary btn-sm" data-action="askReset">${icon('refresh', 15, 2)} Reset project</button><button class="btn btn-ghost btn-sm" data-action="closeProject">Close project</button></div>`}` : ''}`;
    } else if (sh.kind === 'history') {
      title = 'Measurement History';
      body = `<div><button class="btn btn-primary btn-sm" data-action="startNew">${icon('plus', 16, 2.4)} New Measurement</button></div>
        ${ui.historyList(S.history().map(AM.derive.summary), p && p.id)}
        <div class="sheet-foot">${icon('info', 15, 1.9)}<span>Measurements are kept in this browser on this device. There is no account. The only thing ever sent is the report form, when you submit it on Final Result.</span></div>`;
    } else if (sh.kind === 'guide') {
      // Instructional video. It only plays a guide; closing it returns to the same step.
      const g = AM.guides[sh.id];
      title = g.title;
      badge = `<span class="tag tag-sim">${icon('play', 12, 2.2)}${esc(g.lengthLabel)} video</span>`;
      cls = ' sheet-video';
      body = `${AM.guide.html(sh.id)}
        <div class="hstack"><button class="btn btn-primary btn-sm" data-action="closeGuide">${esc(g.closeLabel || 'Close')}</button></div>
        <div class="sheet-foot">${icon('info', 15, 1.9)}<span>This video is a guide to the procedure. It does not start or record a measurement.</span></div>`;
    }
    return `<div class="sheet-scrim" data-action="closeSheet"></div>
      <aside class="sheet${cls}" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
        <header class="sheet-h"><h2 id="sheet-title">${esc(title)}</h2>${badge}<button class="iconbtn" id="sheet-close" data-action="closeSheet" aria-label="Close">${icon('x', 18, 2)}</button></header>
        <div class="sheet-b">${body}</div>
      </aside>`;
  }

  // The control a click came from, found again after a re-render (by id, else by its action and value).
  function findControl(d) {
    if (!d) return null;
    if (d.id && document.getElementById(d.id)) return document.getElementById(d.id);
    const v = d.value != null ? `[data-value="${CSS.escape(d.value)}"]` : '';
    return $app.querySelector(`[data-action="${CSS.escape(d.action)}"]${v}`);
  }

  function renderLayers() {
    const sh = sheetHTML();
    if (sh !== lastSheet) {
      const opening = !lastSheet && sh, closing = lastSheet && !sh;
      $sheet.innerHTML = sh;
      lastSheet = sh;
      $app.toggleAttribute('inert', !!sh); // the page behind an open panel cannot be reached
      AM.guide.sync($sheet, S.state.ui.sheet); // start or stop the instructional video with its sheet
      if (opening) { returnTo = lastClick; const c = document.getElementById('sheet-close'); if (c) c.focus({ preventScroll: true }); }
      if (closing) { const t = findControl(returnTo); if (t && !t.disabled) t.focus({ preventScroll: true }); returnTo = null; }
    }
    const t = S.state.ui.toast ? `<div class="toast">${icon('info', 16, 2)}<span>${esc(S.state.ui.toast)}</span></div>` : '';
    if (t !== lastToast) { $toast.innerHTML = t; lastToast = t; }
  }

  /* ---------- render ---------- */
  function captureFocus() {
    const a = document.activeElement;
    if (!a || !a.id || !$app.contains(a)) return null;
    let s = null, e = null;
    try { s = a.selectionStart; e = a.selectionEnd; } catch (x) { /* not a text field */ }
    return { id: a.id, value: a.value, s, e, text: (a.tagName === 'INPUT' && (a.type === 'text' || a.type === 'email')) || a.tagName === 'TEXTAREA' };
  }
  function restoreFocus(f) {
    if (!f) return;
    const n = document.getElementById(f.id);
    if (!n) return;
    if (f.text && (n.tagName === 'INPUT' || n.tagName === 'TEXTAREA')) n.value = f.value; // keep what the user is typing, e.g. "10."
    n.focus({ preventScroll: true });
    if (f.text && f.s != null) { try { n.setSelectionRange(f.s, f.e); } catch (x) { /* ignore */ } }
  }

  /* ---------- motion hooks ----------
     The canvas is rebuilt on every change, so CSS transitions cannot carry a value from its old element to
     its new one. Instead render() compares before and after, and marks only what actually changed:
     the step content when you arrive at a step, a watched value whose text changed while you stay on it,
     and a step that has just been completed. The marks are classes; CSS decides how (or whether) they move.
     One action can render twice in a row (e.g. a toast); a mark made a moment ago is put back on the new element
     with a negative delay, so its motion carries on instead of being cut or restarted. */
  const ENTER_MS = 350, UPDATED_MS = 900, DONE_MS = 450;
  const textOf = el => el.textContent.replace(/\s+/g, ' ').trim();
  const watched = () => {
    const m = new Map();
    $app.querySelectorAll('[data-watch]').forEach(el => m.set(el.dataset.watch, textOf(el)));
    return m;
  };
  const resume = (el, cls, at, now) => { el.classList.add(cls); if (now > at) el.style.animationDelay = `${at - now}ms`; };
  let enteredAt = 0, settled = null;
  const updated = new Map(), justDone = new Map(); // key or step id -> when it was marked
  function markChanges(before, sameView, pid) {
    const now = performance.now(), inner = $app.querySelector('.content-inner');
    if (!sameView) { enteredAt = now; updated.clear(); }
    else if (inner && now - enteredAt < ENTER_MS) { inner.classList.add('is-entering'); inner.style.setProperty('--since', `${Math.round(now - enteredAt)}ms`); }
    if (sameView) {
      $app.querySelectorAll('[data-watch]').forEach(el => {
        const key = el.dataset.watch, was = before.get(key), text = textOf(el), u = updated.get(key);
        if (was != null && was !== text) { updated.set(key, { at: now, text }); el.classList.add('is-updated'); }
        else if (u && u.text === text && now - u.at < UPDATED_MS) resume(el, 'is-updated', u.at, now);
      });
    }
    // Settled = completed and not waiting for review. A step that becomes settled (finished, or reviewed again) confirms itself.
    const p = S.state.project, ids = p ? p.completed.filter(id => id !== 'home' && !p.review.includes(id)) : [];
    if (!settled || settled.pid !== pid) justDone.clear();
    else ids.filter(id => !settled.ids.includes(id)).forEach(id => justDone.set(id, now));
    settled = { pid, ids };
    justDone.forEach((at, id) => {
      if (now - at >= DONE_MS) { justDone.delete(id); return; }
      $app.querySelectorAll(`.wf-item[data-value="${CSS.escape(id)}"], .seg-meter i[data-step="${CSS.escape(id)}"]`).forEach(el => resume(el, 'just-done', at, now));
    });
  }

  let lastProjectId = null, leaving = false;
  function render() {
    const st = S.state, stage = W.get(st.current);
    const pid = st.project ? st.project.id : null;
    const sameView = lastStage === stage.id && pid === lastProjectId; // same step of the same project: values may update, nothing enters
    if (pid !== lastProjectId) { ui.bad = {}; lastProjectId = pid; } // field errors belong to the project they were typed in
    // A step's leave() runs once per change of step, even if it causes another render.
    if (!leaving && lastStage && lastStage !== stage.id) {
      const prev = W.get(lastStage);
      leaving = true;
      try { if (prev.leave) prev.leave(ctx()); } finally { leaving = false; }
    }
    const focus = captureFocus();
    const content = $app.querySelector('.content'), rail = $app.querySelector('.rail');
    const keepScroll = lastStage === stage.id && content ? content.scrollTop : 0;
    const railScroll = rail ? rail.scrollTop : 0;
    const before = sameView ? watched() : null;
    if (lastStage !== stage.id) stepChangedAt = performance.now();

    const v = stage.view(ctx());
    $app.innerHTML = `
      <aside class="rail${st.ui.navOpen ? ' open' : ''}" aria-label="Workflow">${railHTML()}</aside>
      ${st.ui.navOpen ? '<div class="scrim" data-action="closeNav"></div>' : ''}
      <main class="main">
        ${topbarHTML(stage)}
        <div class="content"><div class="content-inner${sameView ? '' : ' is-entering'}">${v.header === false ? '' : headHTML(stage)}${v.body}</div></div>
        ${footerHTML(stage, v)}
      </main>`;

    markChanges(before, sameView, pid);
    restoreFocus(focus);
    const c2 = $app.querySelector('.content'); if (c2) c2.scrollTop = keepScroll;
    const r2 = $app.querySelector('.rail'); if (r2) r2.scrollTop = railScroll;
    AM.charts.hydrate($app);
    lastStage = stage.id;
    $tip.hidden = true; $tip._el = null;
    // Mobile workflow drawer: focus moves into it when it opens and back to the menu button when it closes.
    if (!!st.ui.navOpen !== lastNav) {
      lastNav = !!st.ui.navOpen;
      if (window.matchMedia('(max-width: 900px)').matches) {
        const t = lastNav ? $app.querySelector('.rail .wf-item[aria-current]') || $app.querySelector('.rail-close') : $app.querySelector('[data-action="openNav"]');
        if (t) t.focus({ preventScroll: true });
      }
    }
    if (stage.mount) stage.mount($app, ctx());
    markScrollableTables();
    renderLayers();
  }

  // Tables wider than the screen scroll sideways; on a phone nothing shows that more columns are there. Such a table
  // gets a hint under it (css: .tbl-wrap.is-scrollable), checked after each render and when the window changes size.
  function markScrollableTables() {
    $app.querySelectorAll('.tbl-wrap').forEach(w => {
      const more = w.scrollWidth > w.clientWidth + 1, next = w.nextElementSibling, hint = next && next.classList.contains('tbl-hint') ? next : null;
      w.classList.toggle('is-scrollable', more);
      const end = () => w.classList.toggle('at-end', w.scrollLeft + w.clientWidth >= w.scrollWidth - 1);
      end();
      if (more && !w.dataset.scrollWatch) { w.dataset.scrollWatch = '1'; w.addEventListener('scroll', end, { passive: true }); }
      if (more && !hint) w.insertAdjacentHTML('afterend', '<p class="tbl-hint">Scroll the table sideways to see every column.</p>');
      if (!more && hint) hint.remove();
    });
  }
  window.addEventListener('resize', () => { if ($app) markScrollableTables(); });

  /* ---------- actions ---------- */
  const coerce = (v, type) => (type === 'num' ? num(v) : type === 'int' ? int(v) : type === 'bool' ? v === 'true' : v);
  // Treatment amounts are per item; the buttons carry the item id (data-item).
  const itemPath = (p, id) => { const i = p.treatment.items.findIndex(x => x.id === id); return i < 0 ? null : `treatment.items.${i}`; };
  const setQuantity = (p, id, q) => { const path = itemPath(p, id); if (path) S.set(`${path}.quantity`, clamp(q, 0, ui.MAX_PANELS)); };

  const GLOBAL = {
    nav: (c, v) => S.go(v),
    go: (c, v) => S.go(v),
    continue: () => S.advance(),
    back: () => S.back(),
    set: (c, v, el) => S.set(el.dataset.bind, coerce(v, el.dataset.type)),
    openNav: () => S.ui({ navOpen: true }),
    closeNav: () => S.ui({ navOpen: false }),
    explain: () => S.ui({ sheet: { kind: 'explain', stage: S.state.current } }),
    tools: () => S.ui({ sheet: { kind: 'tools' }, navOpen: false, confirm: null }),
    closeSheet: () => S.ui({ sheet: null, confirm: null }),
    openGuide: (c, id) => { if (AM.guides[id]) S.ui({ sheet: { kind: 'guide', id }, navOpen: false }); },
    closeGuide: () => S.ui({ sheet: null }),
    autofill: (c, v) => S.autofillTo(v),
    askReset: () => S.ui({ confirm: 'reset' }),
    cancelReset: () => S.ui({ confirm: null }),
    doReset: () => { S.resetProject(); S.toast('Project reset.'); },
    closeProject: () => S.closeProject(),
    history: () => S.ui({ sheet: { kind: 'history' }, navOpen: false, confirm: null }),
    startNew: () => S.startProject('new'),
    openProject: (c, id) => S.openProject(id),
    togglePin: (c, id) => S.togglePin(id),
    askDelete: (c, id) => S.ui({ confirm: `delete:${id}` }),
    cancelDelete: () => S.ui({ confirm: null }),
    doDelete: (c, id) => S.deleteProject(id),
    followUp: () => S.startFollowUp(),
    qty: (c, v, el) => { const it = c.project.treatment.items.find(x => x.id === el.dataset.item); if (it) setQuantity(c.project, it.id, (it.quantity || 0) + Number(v)); },
    setQty: (c, v, el) => setQuantity(c.project, el.dataset.item, Number(v)),
    setArea: (c, v, el) => { const path = itemPath(c.project, el.dataset.item); if (path) S.set(`${path}.areaM2`, Math.max(0, Math.round(Number(v) * 10) / 10)); },
  };

  document.addEventListener('click', e => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    if (el.getAttribute('aria-disabled') === 'true' && el.dataset.reason) { S.toast(el.dataset.reason); return; }
    const name = el.dataset.action, stage = W.get(S.state.current);
    const fn = (stage.actions && stage.actions[name]) || GLOBAL[name];
    if (!fn) return;
    e.preventDefault();
    if (el.closest('.actionbar') && performance.now() - stepChangedAt < STEP_CLICK_GUARD_MS) return; // see stepChangedAt
    if ($app.contains(el)) lastClick = { action: name, value: el.dataset.value != null ? el.dataset.value : null, id: el.id || null };
    fn(ctx(), el.dataset.value, el, e);
  });

  function readValue(el) {
    if (el.type === 'checkbox') return el.checked;
    let v = coerce(el.value, el.dataset.type);
    if (v != null && el.dataset.max != null) {
      const limited = clamp(v, Number(el.dataset.min || 0), Number(el.dataset.max));
      if (limited !== v) el.value = String(limited); // show the value that is actually kept
      v = limited;
    }
    return v;
  }
  document.addEventListener('input', e => {
    const el = e.target;
    if (!el.dataset || el.type !== 'text') return;
    if (el.dataset.bind) {
      // A number field holding text that is not a number keeps the text and shows an error (ui.bad), until corrected.
      const raw = el.value.trim(), numeric = el.dataset.type === 'num' || el.dataset.type === 'int';
      const was = ui.bad[el.id];
      if (numeric && el.id && raw && num(raw) == null) ui.bad[el.id] = el.value; else delete ui.bad[el.id];
      S.set(el.dataset.bind, readValue(el));
      if (was !== ui.bad[el.id]) render();
    } else if (el.dataset.uibind) S.uiSet(el.dataset.uibind, el.value); // screen state such as a search box
  });
  document.addEventListener('change', e => {
    const el = e.target;
    if (!el.dataset) return;
    if (el.dataset.changeAction) { // a select whose change also updates related fields (stage action)
      const stage = W.get(S.state.current), fn = stage.actions && stage.actions[el.dataset.changeAction];
      if (fn) fn(ctx(), el.value, el, e);
      return;
    }
    if (el.dataset.bind && (el.type === 'checkbox' || el.tagName === 'SELECT')) S.set(el.dataset.bind, readValue(el));
  });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (S.state.ui.sheet) S.ui({ sheet: null, confirm: null });
    else if (S.state.ui.navOpen) S.ui({ navOpen: false });
  });

  /* ---------- tooltips for chart marks ---------- */
  function showTip(el) {
    const lines = (el.getAttribute('data-tip') || '').split('\n');
    $tip.innerHTML = `<b>${esc(lines[0])}</b>${lines.slice(1).map(l => `<span>${esc(l)}</span>`).join('')}`;
    $tip.hidden = false;
    $tip._el = el;
  }
  function placeTip(x, y) {
    const r = $tip.getBoundingClientRect();
    let left = x + 14, top = y + 14;
    if (left + r.width > window.innerWidth - 8) left = x - r.width - 14;
    if (top + r.height > window.innerHeight - 8) top = y - r.height - 14;
    $tip.style.left = Math.max(8, left) + 'px';
    $tip.style.top = Math.max(8, top) + 'px';
  }
  document.addEventListener('pointermove', e => {
    const el = e.target.closest && e.target.closest('[data-tip]');
    if (!el) { if (!$tip.hidden) { $tip.hidden = true; $tip._el = null; } return; }
    if ($tip._el !== el) showTip(el);
    placeTip(e.clientX, e.clientY);
  });
  document.addEventListener('focusin', e => {
    const el = e.target.closest && e.target.closest('[data-tip]');
    if (!el) return;
    showTip(el);
    const r = el.getBoundingClientRect();
    placeTip(r.left + r.width / 2, r.top);
  });
  document.addEventListener('focusout', () => { $tip.hidden = true; $tip._el = null; });

  /* ---------- start ---------- */
  AM.app = { render };
  S.load();
  S.subscribe(render);
  render();
  if (window.ResizeObserver) {
    new ResizeObserver(() => {
      AM.charts.hydrate($app);
      const s = W.get(S.state.current);
      if (s.resize) s.resize();
    }).observe($app);
  }
})(window.AM);

/* Event wiring, as the earlier shell (js/app.js) did it: one listener per event on the document. Buttons carry
   data-action (+ data-value, data-item), fields data-bind (+ data-type, data-min, data-max); a stage's own action is
   used before a global one. Native events, so the tests that drive the page with DOM events see the same behaviour. */
import { am, makeCtx, S, ui, W } from './lib';
import type { ActionFn } from './am';
import { tourActions } from './shell/Tour';

const { num, int, clamp } = am.util;
// When the step last changed. The action bar's buttons sit in the same place on every step, so the second click of a
// double click on "Continue" would otherwise land on the next step's button and confirm a step nobody has seen.
export const clicks = { stepChangedAt: 0, last: null as null | { action: string; value: string | null; id: string | null; el?: HTMLElement | null } };
const STEP_CLICK_GUARD_MS = 450;

const listOf = (el?: Element | null) => (el && el.closest('.hist-list') ? 'hl' : 'pc');
const focusId = (id: string) => { const t = document.getElementById(id); if (t) t.focus({ preventScroll: true }); };
const coerce = (v: string, type?: string): unknown => (type === 'num' ? num(v) : type === 'int' ? int(v) : type === 'bool' ? v === 'true' : v);
// Treatment amounts are per item; the buttons carry the item id (data-item).
const itemPath = (id: string | undefined) => { const p = S.state.project!, i = p.treatment.items.findIndex(x => x.id === id); return i < 0 ? null : `treatment.items.${i}`; };
/* An amount the user sets is theirs (amountBy 'user'): it stays as set, and the app works out its own products again
   around it (the treatment stage's applyAutoPlan). */
const replan = () => { const m = (W.get('treatment') as unknown as { model?: { applyAutoPlan?: () => void } }).model; if (m && m.applyAutoPlan) m.applyAutoPlan(); };
const setItem = (id: string | undefined, patch: Record<string, unknown>) => {
  const path = itemPath(id), raw = S.state.project!.treatment.items.find(x => x.id === id);
  if (!path || !raw) return;
  S.set(path, Object.assign({}, raw, patch));
  replan();
};
const setQuantity = (id: string | undefined, q: number) => setItem(id, { quantity: clamp(q, 0, ui.MAX_PANELS), amountBy: 'user' });

const GLOBAL: Record<string, ActionFn> = {
  nav: (_c, v) => S.go(v!),
  go: (_c, v) => S.go(v!),
  continue: () => S.advance(),
  back: () => S.back(),
  set: (_c, v, el) => S.set(el.dataset.bind!, coerce(v!, el.dataset.type)),
  openNav: () => S.ui({ navOpen: true }),
  closeNav: () => S.ui({ navOpen: false }),
  explain: () => S.ui({ sheet: { kind: 'explain', stage: S.state.current } }),
  tools: () => S.ui({ sheet: { kind: 'tools' }, navOpen: false, confirm: null }),
  closeSheet: () => S.ui({ sheet: null, confirm: null }),
  openGuide: (_c, id) => { if (id && am.guides[id]) S.ui({ sheet: { kind: 'guide', id }, navOpen: false }); },
  closeGuide: () => S.ui({ sheet: null }),
  // The step shortcuts only work while Developer tools are turned on, and only ever fill a sample project.
  autofill: (_c, v) => { if (S.devTools) S.autofillTo(v!, { safe: true }); },
  askReset: () => S.ui({ confirm: 'reset' }),
  cancelReset: () => S.ui({ confirm: null }),
  doReset: () => { S.resetProject(); S.toast('Project reset.'); },
  closeProject: () => S.closeProject(),
  history: () => S.ui({ sheet: { kind: 'history' }, navOpen: false, confirm: null }),
  startNew: () => S.startProject('new'),
  openProject: (_c, id) => S.openProject(id!),
  // Pinning moves the card to the other section and deleting asks first: focus stays on the same project's control
  // (cards on Home are "pc-…", rows of Measurement History "hl-…").
  togglePin: (_c, id, el) => { S.togglePin(id!); focusId(`${listOf(el)}-pin-${id}`); },
  askDelete: (_c, id, el) => { S.ui({ confirm: `delete:${id}` }); focusId(`${listOf(el)}-delyes-${id}`); },
  cancelDelete: (_c, id, el) => { S.ui({ confirm: null }); if (id) focusId(`${listOf(el)}-del-${id}`); },
  doDelete: (_c, id) => S.deleteProject(id!),
  followUp: () => S.startFollowUp(),
  qty: (c, v, el) => { const it = c.project.treatment.items.find(x => x.id === el.dataset.item); if (it) setQuantity(it.id, (it.quantity || 0) + Number(v)); },
  setQty: (_c, v, el) => setQuantity(el.dataset.item, Number(v)),
  setArea: (_c, v, el) => setItem(el.dataset.item, { areaM2: Math.max(0, Math.round(Number(v) * 10) / 10), amountBy: 'user' }),
  // Back to the amount the app suggests for an item (AM.derive.autoAmount), on Treatment or Predicted Result.
  useAutoAmount: (_c, id) => setItem(id!, { amountBy: 'app' }),
  /* The "how much" slider (src/ui/kit.tsx AmountSlider): whole panels, or, for a product sold without a panel size, a
     share of the free surface where it goes (data-avail, m²), kept as the area that share is (to 0.1 m²). */
  setAmount: (_c, v, el) => {
    if (el.dataset.mode === 'units') { setQuantity(el.dataset.item, Math.round(Number(v))); return; }
    setItem(el.dataset.item, { size: 'area', areaM2: Math.max(0, Math.round(Number(v) / 100 * Number(el.dataset.avail || 0) * 10) / 10), amountBy: 'user' });
  },
  // Help on a step (its menu), and the tour of the screen (src/shell/Tour.tsx).
  toggleHelp: () => S.ui({ help: !S.state.ui.help }),
  ...tourActions,
};

function readValue(el: HTMLInputElement | HTMLSelectElement): unknown {
  if (el instanceof HTMLInputElement && el.type === 'checkbox') return el.checked;
  let v = coerce(el.value, el.dataset.type);
  if (v != null && el.dataset.max != null) {
    const limited = clamp(v as number, Number(el.dataset.min || 0), Number(el.dataset.max));
    if (limited !== v) el.value = String(limited); // show the value that is actually kept
    v = limited;
  }
  return v;
}

export function wireEvents(app: HTMLElement, render: () => void) {
  const tip = document.getElementById('tip') as HTMLElement & { _el?: Element | null };

  document.addEventListener('click', e => {
    const el = (e.target as Element).closest<HTMLElement>('[data-action]');
    // Any click but on the Help button itself closes the Help menu (a choice in it, then runs as usual). A panel opened
    // from the menu gives the focus back to the Help button when it closes.
    if (S.state.ui.help && !(e.target as Element).closest('.topbar-helpbtn')) {
      if (el && el.closest('.help-menu')) clicks.last = { action: 'toggleHelp', value: null, id: null, el: document.querySelector<HTMLElement>('.topbar-helpbtn') };
      S.ui({ help: false });
    }
    if (!el) return;
    if (el.getAttribute('aria-disabled') === 'true' && el.dataset.reason) { S.toast(el.dataset.reason); return; }
    const name = el.dataset.action!, stage = W.get(S.state.current);
    const fn = (stage.actions && stage.actions[name]) || GLOBAL[name];
    if (!fn) return;
    e.preventDefault();
    if (el.closest('.actionbar') && performance.now() - clicks.stepChangedAt < STEP_CLICK_GUARD_MS) return; // see stepChangedAt
    // The control itself is kept too (also outside the page, e.g. the tour offer), so focus can return to exactly it.
    if (!el.closest('.help-menu') && !el.closest('#sheet-root')) clicks.last = { action: name, value: el.dataset.value != null ? el.dataset.value : null, id: el.id || null, el };
    fn(makeCtx(), el.dataset.value, el, e);
  });

  document.addEventListener('input', e => {
    const el = e.target as HTMLInputElement;
    // A slider whose action runs as it moves (the treatment amount): the result follows while it is dragged.
    if (el.dataset && el.type === 'range' && el.dataset.inputAction) {
      const stage = W.get(S.state.current), fn = (stage.actions && stage.actions[el.dataset.inputAction]) || GLOBAL[el.dataset.inputAction];
      if (fn) fn(makeCtx(), el.value, el, e);
      return;
    }
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
    const el = e.target as HTMLInputElement | HTMLSelectElement;
    if (!el.dataset) return;
    if (el.dataset.changeAction) { // a select whose change also updates related fields (stage action)
      const stage = W.get(S.state.current), fn = stage.actions && stage.actions[el.dataset.changeAction];
      if (fn) fn(makeCtx(), el.value, el, e);
      return;
    }
    if (el.dataset.bind && ((el as HTMLInputElement).type === 'checkbox' || el.tagName === 'SELECT')) S.set(el.dataset.bind, readValue(el));
  });

  document.addEventListener('keydown', e => {
    if (S.state.ui.tour) { // the tour: arrows step through it, Escape ends it
      if (e.key === 'Escape') tourActions.endTour();
      else if (e.key === 'ArrowRight') tourActions.tourNext();
      else if (e.key === 'ArrowLeft') tourActions.tourBack();
      else return;
      e.preventDefault();
      return;
    }
    if (S.state.ui.help) { // the Help menu: up and down move through it, Escape closes it
      const items = [...document.querySelectorAll<HTMLElement>('#help-menu [role="menuitem"]')], at = items.indexOf(document.activeElement as HTMLElement);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const n = items.length, down = e.key === 'ArrowDown';
        if (n) items[at < 0 ? (down ? 0 : n - 1) : (at + (down ? 1 : n - 1)) % n].focus();
        return;
      }
      if (e.key === 'Escape' || e.key === 'Tab') {
        S.ui({ help: false });
        if (e.key === 'Escape') { const b = document.querySelector<HTMLElement>('.topbar-helpbtn'); if (b) b.focus(); }
        return;
      }
    }
    if (e.key !== 'Escape') return;
    if (S.state.ui.sheet) S.ui({ sheet: null, confirm: null });
    else if (S.state.ui.navOpen) S.ui({ navOpen: false });
  });

  /* ---------- tooltips for chart marks ---------- */
  const esc = am.util.esc;
  function showTip(el: Element) {
    const lines = (el.getAttribute('data-tip') || '').split('\n');
    tip.innerHTML = `<b>${esc(lines[0])}</b>${lines.slice(1).map(l => `<span>${esc(l)}</span>`).join('')}`;
    tip.hidden = false;
    tip._el = el;
  }
  function placeTip(x: number, y: number) {
    const r = tip.getBoundingClientRect();
    let left = x + 14, top = y + 14;
    if (left + r.width > window.innerWidth - 8) left = x - r.width - 14;
    if (top + r.height > window.innerHeight - 8) top = y - r.height - 14;
    tip.style.left = `${Math.max(8, left)}px`;
    tip.style.top = `${Math.max(8, top)}px`;
  }
  document.addEventListener('pointermove', e => {
    const el = (e.target as Element).closest && (e.target as Element).closest('[data-tip]');
    if (!el) { if (!tip.hidden) { tip.hidden = true; tip._el = null; } return; }
    if (tip._el !== el) showTip(el);
    placeTip(e.clientX, e.clientY);
  });
  document.addEventListener('focusin', e => {
    const el = (e.target as Element).closest && (e.target as Element).closest('[data-tip]');
    if (!el) return;
    showTip(el);
    const r = el.getBoundingClientRect();
    placeTip(r.left + r.width / 2, r.top);
  });
  document.addEventListener('focusout', () => { tip.hidden = true; tip._el = null; });

  // "Show technical details": remember which are open, so a re-render keeps them open, and draw the charts inside when
  // one opens (a closed one has no width to draw at).
  document.addEventListener('toggle', e => {
    const d = e.target as HTMLDetailsElement;
    if (!d || !d.dataset || !d.dataset.openId) return;
    S.state.ui.open = Object.assign({}, S.state.ui.open, { [d.dataset.openId]: d.open });
    if (d.open) am.charts.hydrate(d);
  }, true);

  if (window.ResizeObserver) {
    new ResizeObserver(() => {
      am.charts.hydrate(app);
      const s = W.get(S.state.current);
      if (s.resize) s.resize();
    }).observe(app);
  }
}

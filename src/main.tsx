/* The interface: React renders the shell and the step's screen into #app, synchronously on every change of the project
   store (AM.app.render, as before), then the step's own mount() runs (live meters, processing jobs, the report form).
   Each stage's view(ctx) still returns its screen as HTML (rendered to static markup) for the tests and anything else
   that reads it. Nothing here measures, calculates or stores project data. */
import type { ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { am, makeCtx, S, ui, W } from './lib';
import type { Average, Ctx, Summary } from './am';
import { App } from './shell/Shell';
import { SCREENS } from './screens/registry';
import { clicks, wireEvents } from './events';
import { AverageSummary, HistoryList, NoiseBody, ProjectCard } from './ui/blocks';

const $app = document.getElementById('app') as HTMLElement;
const $sheet = document.getElementById('sheet-root') as HTMLElement;
// The tour of the screen and its offer (src/shell/Tour.tsx) sit outside #app, so they stay usable while #app is inert.
if (!document.getElementById('tour-root')) document.body.appendChild(Object.assign(document.createElement('div'), { id: 'tour-root' }));
const $tip = document.getElementById('tip') as HTMLElement & { _el?: Element | null };
const root = createRoot($app);

/* A component as HTML: drawn into a detached element and read back (never while the application itself is drawing). */
function toHTML(node: ReactNode): string {
  const div = document.createElement('div');
  let error: unknown = null;
  const r = createRoot(div, { onUncaughtError: e => { error = e; } });
  flushSync(() => r.render(node));
  const html = div.innerHTML;
  r.unmount();
  if (error) throw error;
  return html;
}

/* ---------- each step's view(ctx): its screen as HTML, its main action, its chrome ---------- */
Object.entries(SCREENS).forEach(([id, sc]) => {
  W.get(id).view = (ctx: Ctx) => {
    const v: { body: string; primary?: ReturnType<NonNullable<typeof sc.primary>>; header?: boolean; footer?: boolean } = { body: toHTML(<sc.Body ctx={ctx} />) };
    if (sc.primary) v.primary = sc.primary(ctx);
    if (sc.header === false) v.header = false;
    if (sc.footer === false) v.footer = false;
    return v as ReturnType<NonNullable<ReturnType<typeof W.get>['view']>>;
  };
});

/* The shared pieces as HTML, for code that reads them as strings (the tests; the report form's state pill, which
   js/services/report-gate.js updates while the form is typed in, so it is plain text with no React behind it). */
const esc = am.util.esc;
Object.assign(ui, {
  averageSummary: (avg: Average) => toHTML(<AverageSummary avg={avg} />),
  projectCard: (s: Summary, activeId?: string) => toHTML(<ProjectCard s={s} activeId={activeId} />),
  historyList: (items: Summary[], activeId?: string) => toHTML(<HistoryList items={items} activeId={activeId} />),
  noiseBody: (p: unknown, opts: { bands?: boolean } = {}) => toHTML(<NoiseBody p={p} bands={opts.bands !== false} />),
  pill: (tone: string, text: string, ic?: string | null) => `<span class="pill pill-${tone}">${ic ? am.util.icon(ic, 13, 2.2) : ''}${esc(text)}</span>`,
});

/* ---------- focus: kept on the control being used, and returned to the one that opened a panel ---------- */
interface Focus { id: string; value: string; s: number | null; e: number | null; text: boolean }
function captureFocus(): Focus | null {
  const a = document.activeElement as HTMLInputElement | null;
  if (!a || !a.id || !$app.contains(a)) return null;
  let s: number | null = null, e: number | null = null;
  try { s = a.selectionStart; e = a.selectionEnd; } catch { /* not a text field */ }
  return { id: a.id, value: a.value, s, e, text: (a.tagName === 'INPUT' && (a.type === 'text' || a.type === 'email')) || a.tagName === 'TEXTAREA' };
}
function restoreFocus(f: Focus | null) {
  if (!f) return;
  const n = document.getElementById(f.id) as HTMLInputElement | null;
  if (!n || document.activeElement === n) return; // still there: React kept it, with what is being typed
  if (f.text && (n.tagName === 'INPUT' || n.tagName === 'TEXTAREA')) n.value = f.value;
  n.focus({ preventScroll: true });
  if (f.text && f.s != null) { try { n.setSelectionRange(f.s, f.e); } catch { /* ignore */ } }
}
// The control a click came from: the element itself while it is still on the page and visible, else found again (by id,
// else by its action and value, the first visible match), else the menu button that leads back to it on a phone.
const visible = (el: Element | null): el is HTMLElement => !!el && (el as HTMLElement).isConnected && el.getClientRects().length > 0;
function findControl(d: typeof clicks.last): HTMLElement | null {
  if (!d) return null;
  if (visible(d.el || null)) return d.el as HTMLElement;
  const byId = d.id ? document.getElementById(d.id) : null;
  if (visible(byId)) return byId;
  const v = d.value != null ? `[data-value="${CSS.escape(d.value)}"]` : '';
  const match = Array.from(document.querySelectorAll(`[data-action="${CSS.escape(d.action)}"]${v}`)).find(visible);
  if (match) return match as HTMLElement;
  const menu = $app.querySelector('[data-action="openNav"]');
  return visible(menu) ? menu : null;
}

/* ---------- motion: only what actually changed is marked ----------
   A watched value whose text changed while the step stays open gets a short wash (is-updated); a step that has just
   been completed confirms itself once in the rail (just-done). The marks are classes; CSS decides how they move. */
const textOf = (el: Element) => (el.textContent || '').replace(/\s+/g, ' ').trim();
const watched = () => { const m = new Map<string, string>(); $app.querySelectorAll<HTMLElement>('[data-watch]').forEach(el => m.set(el.dataset.watch!, textOf(el))); return m; };
function flash(el: Element, cls: string) {
  el.classList.remove(cls);
  void (el as HTMLElement).offsetWidth; // restart the animation
  el.classList.add(cls);
  el.addEventListener('animationend', () => el.classList.remove(cls), { once: true });
}
let settled: { pid: string | null; ids: string[] } | null = null;
function markChanges(before: Map<string, string> | null, pid: string | null) {
  if (before) $app.querySelectorAll<HTMLElement>('[data-watch]').forEach(el => { const was = before.get(el.dataset.watch!); if (was != null && was !== textOf(el)) flash(el, 'is-updated'); });
  // Settled = completed and not waiting for review. A step that becomes settled confirms itself.
  const p = S.state.project, ids = p ? p.completed.filter(id => id !== 'home' && !p.review.includes(id)) : [];
  if (settled && settled.pid === pid) ids.filter(id => !settled!.ids.includes(id)).forEach(id => {
    $app.querySelectorAll(`.wf-item[data-value="${CSS.escape(id)}"], .seg-meter i[data-step="${CSS.escape(id)}"]`).forEach(el => flash(el, 'just-done'));
  });
  settled = { pid, ids };
}

/* ---------- render ---------- */
let lastStage: string | null = null, lastProjectId: string | null = null, leaving = false;
let rendering = false, again = false, lastSheet = '', lastNav = false, returnTo: typeof clicks.last = null;

function renderOnce() {
  const st = S.state, stage = W.get(st.current), pid = st.project ? st.project.id : null;
  const sameView = lastStage === stage.id && pid === lastProjectId; // same step of the same project: values may update, nothing enters
  if (pid !== lastProjectId) { ui.bad = {}; lastProjectId = pid; } // field errors belong to the project they were typed in
  // A step's leave() runs once per change of step, even if it causes another render.
  if (!leaving && lastStage && lastStage !== stage.id) {
    const prev = W.get(lastStage);
    leaving = true;
    try { if (prev.leave) prev.leave(makeCtx()); } finally { leaving = false; }
  }
  const focus = captureFocus(), before = sameView ? watched() : null;
  if (lastStage !== stage.id) clicks.stepChangedAt = performance.now();
  const stepChanged = lastStage !== stage.id;

  flushSync(() => root.render(<App sameView={sameView} />));

  if (stepChanged) { const c = $app.querySelector('.content'); if (c) c.scrollTop = 0; }
  markChanges(before, pid);
  restoreFocus(focus);
  am.charts.hydrate($app);
  lastStage = stage.id;
  $tip.hidden = true; $tip._el = null;
  // Mobile workflow drawer: the page behind it cannot be reached while it is open (keyboard focus stays in it); focus
  // moves into it when it opens and back to the menu button when it closes.
  const $main = $app.querySelector('main');
  if ($main) $main.toggleAttribute('inert', !!st.ui.navOpen && window.matchMedia('(max-width: 900px)').matches);
  if (!!st.ui.navOpen !== lastNav) {
    lastNav = !!st.ui.navOpen;
    if (window.matchMedia('(max-width: 900px)').matches) {
      const t = lastNav ? $app.querySelector<HTMLElement>('.rail .wf-item[aria-current]') || $app.querySelector<HTMLElement>('.rail-close') : $app.querySelector<HTMLElement>('[data-action="openNav"]');
      if (t) t.focus({ preventScroll: true });
    }
  }
  if (stage.mount) stage.mount($app, makeCtx());
  // Panels: the page behind an open panel cannot be reached; the video plays with its panel; focus moves in and back.
  const sh = st.ui.sheet, key = sh ? JSON.stringify(sh) : '';
  // The page behind an open panel, or behind the tour, cannot be reached (set before focus moves back into it).
  $app.toggleAttribute('inert', !!key || !!st.ui.tour);
  if (key !== lastSheet) {
    const opening = !lastSheet && !!key, closing = !!lastSheet && !key;
    lastSheet = key;
    am.guide.sync($sheet, st.ui.sheet);
    if (opening) { returnTo = clicks.last; const c = document.getElementById('sheet-close'); if (c) c.focus({ preventScroll: true }); }
    if (closing) { const t = findControl(returnTo) as HTMLButtonElement | null; if (t && !t.disabled) t.focus({ preventScroll: true }); returnTo = null; }
  }
}

// A render asked for while one is running (a stage's mount() changing the store) runs straight after it.
function render() {
  if (rendering) { again = true; return; }
  rendering = true;
  try {
    let n = 0;
    do { again = false; renderOnce(); } while (again && ++n < 20);
  } finally { rendering = false; }
}

/* ---------- start ---------- */
am.app = { render };
wireEvents($app, render);
S.load();
S.subscribe(render);
render();

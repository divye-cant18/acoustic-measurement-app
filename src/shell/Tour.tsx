/* The tour of the screen: a spotlight on the real controls, one at a time, with what each one is for. There are two
   tours, chosen by where you are: Home (how to start) and a step (how every step works). The words come from the
   workflow and from the screen itself (the step you are on, why Continue is not ready yet), so the tour can never
   disagree with the interface. It only points: while it runs the page behind it cannot be used (inert, as behind a
   panel), and it never changes the project. It is offered on every visit (Take the tour / Not now); once answered it
   stays away until the next visit. "Take the tour" on Home and Help on every step replay it. */
import { useEffect, useLayoutEffect, useRef } from 'react';
import { am, cx, S, W } from '../lib';
import { Btn, Icon } from '../ui/kit';

type Kind = 'home' | 'step';
export interface TourState { kind: Kind; i: number; at: string }
type Side = 'right' | 'left' | 'bottom' | 'top';
type Align = 'start' | 'center' | 'end';
interface Now { tone: 'info' | 'warn' | 'good'; text: string }
interface Stop {
  title: string; text: string; side: Side; align?: Align;
  // The first target on screen is the one shown (the rail on a wide screen, its menu button on a phone).
  targets: { sel: string; text?: string }[];
  now?: (el: HTMLElement) => Now | null;
}
interface Resolved { stop: Stop; el: HTMLElement; text: string; now: Now | null }

/* ---------- this visit only: whether the tour was offered and answered (nothing is stored, so every visit offers it) ---------- */
interface Prefs { declined?: boolean; home?: boolean; step?: boolean }
let prefs: Prefs = {};
function remember(patch: Prefs) { prefs = { ...prefs, ...patch }; }
// The offer was passed over (the person moved on without answering, or chose the video).
const visit = { offerAt: null as string | null, offerHidden: false };
// An earlier version kept the answer in this browser; it is no longer read, so it is cleared.
try { localStorage.removeItem('acoustic-measurement-prototype:tour'); } catch { /* storage unavailable */ }

const kindOf = (stageId: string): Kind => (stageId === 'home' ? 'home' : 'step');
const video = () => am.guides.tour.lengthLabel;
const doneCount = () => { const p = S.state.project; return p ? p.completed.filter(id => id !== 'home').length : 0; };

/* ---------- the stops ---------- */
const RAIL = '.rail .wf', MENU = '.topbar [data-action="openNav"]';

function homeStops(): Stop[] {
  const p = S.state.project, first = W.STAGES.find(s => s.id !== 'home')!;
  return [
    { title: 'Start here', side: 'bottom', align: 'start',
      targets: [{ sel: '.home-actions [data-action="startNew"]' }],
      text: `New Measurement starts a project and opens step ${W.stepNo(first.id)}, ${first.title}. Everything is saved in this browser as you go; there is no account.` },
    { title: 'Ten steps, from room to report', side: 'right', align: 'start',
      targets: [{ sel: RAIL }, { sel: MENU, text: `The ${W.NUMBERED} steps of a project open from this menu. Each one unlocks when the one before it is finished.` }],
      text: `Every project follows the same ${W.NUMBERED} steps, from describing the room to the final report. Each one unlocks when the one before it is finished.`,
      now: () => (p ? { tone: 'info', text: `Open now: ${p.room.name || 'Untitled room'}, ${doneCount()} of ${W.NUMBERED} steps done.` } : null) },
    { title: 'Pick up where you left off', side: 'top', align: 'start',
      targets: [{ sel: '.home .pcards' }],
      text: 'Your saved projects. Open one to carry on at the step where you stopped, or pin it to keep it at the top.' },
    { title: 'Measurement History', side: 'right', align: 'center',
      targets: [{ sel: '.rail .rail-history' }],
      text: 'Every project saved in this browser, on this device. Home shows the latest; this lists them all.' },
    { title: 'Help, any time', side: 'bottom', align: 'end',
      targets: [{ sel: '.topbar .topbar-helpers' }],
      text: `Quick help plays a ${video()} video of the whole workflow. Take the tour replays this tour, and on every step Help has a tour of the step screen.`,
      now: () => (!prefs.declined && !prefs.step ? { tone: 'info', text: 'When you open a step, a short tour of it is offered too.' } : null) },
  ];
}

function stepStops(): Stop[] {
  const stage = W.get(S.state.current), proc = W.get('processing');
  return [
    { title: `The ${W.NUMBERED} steps, in order`, side: 'right', align: 'start',
      targets: [{ sel: RAIL }, { sel: MENU, text: `The list of the ${W.NUMBERED} steps opens from this menu. A tick means a step is done; a lock opens once the step before it is finished.` }],
      text: 'Work down this list. A tick means a step is done; a lock opens once the step before it is finished. You can go back to any step you have finished.',
      now: () => ({ tone: 'info', text: `You are on step ${W.stepNo(stage.id)}, ${stage.title}. ${doneCount()} of ${W.NUMBERED} done.` }) },
    { title: 'What this step is for', side: 'bottom', align: 'start',
      targets: [{ sel: '.stage-head-text' }],
      text: 'Every step opens with its name, where it sits in the workflow and one line on what it is for.' },
    { title: 'Not sure? Explain this step', side: 'bottom', align: 'end',
      targets: [{ sel: '.stage-tools [data-action="explain"]' }],
      text: 'Opens a plain-language guide to this step, worked out with this project’s own numbers. It explains; it never changes anything.' },
    { title: 'The project at a glance', side: 'bottom', align: 'end',
      targets: [{ sel: '.topbar .facts' }],
      text: 'Room, Target, Measured and Predicted fill in as the project goes on, and stay in view on every step. Measured values are teal, predicted values violet.',
      now: el => (el.querySelector('.fact.measured.is-empty') ? { tone: 'info', text: `Measured fills in once a measurement has been processed, in step ${W.stepNo(proc.id)}, ${proc.title}.` } : null) },
    { title: 'Your next move is always here', side: 'top', align: 'end',
      targets: [{ sel: '.actionbar .btn-primary' }],
      text: 'The main button for each step sits at the bottom right; Back, on the left, returns to the step before. Your work is saved on this device as you go.',
      now: el => {
        const label = (el.textContent || '').trim();
        if (el.getAttribute('aria-disabled') === 'true' && el.dataset.reason) return { tone: 'warn', text: `Not yet: ${el.dataset.reason}` };
        return el.dataset.action === 'continue' ? { tone: 'good', text: `Ready: “${label}”.` } : { tone: 'info', text: `On this step: “${label}”.` };
      } },
    { title: 'Help, whenever you need it', side: 'bottom', align: 'end',
      targets: [{ sel: '.topbar .topbar-helpbtn' }],
      text: `Replay this tour, watch the ${video()} video of the whole workflow, or open the guide to the step you are on.` },
  ];
}

function shown(el: Element | null): el is HTMLElement {
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return (r.width > 0 || r.height > 0) && getComputedStyle(el).visibility !== 'hidden';
}

/** The stops of a tour that have something on screen to point at, now. */
function resolve(kind: Kind): Resolved[] {
  const out: Resolved[] = [];
  for (const stop of kind === 'home' ? homeStops() : stepStops()) {
    for (const t of stop.targets) {
      const el = document.querySelector(t.sel);
      if (shown(el)) { out.push({ stop, el, text: t.text || stop.text, now: stop.now ? stop.now(el) : null }); break; }
    }
  }
  return out;
}

/* ---------- actions (src/events.ts) ---------- */
function returnFocus() {
  const t = document.querySelector<HTMLElement>('.topbar .topbar-helpbtn, .topbar .topbar-tour');
  if (t) t.focus({ preventScroll: true });
}
export const tourActions = {
  startTour: () => {
    const L = am.live.state;
    if (L.take || L.noise) { S.toast('The tour can start once this measurement has finished.'); return; } // never over a measurement
    const kind = kindOf(S.state.current);
    remember({ [kind]: true });
    visit.offerAt = null; // answered: the other tour may still be offered where it fits (Home first, then a step)
    S.ui({ tour: { kind, i: 0, at: S.state.current }, help: false, navOpen: false, sheet: null });
  },
  tourNext: () => {
    const t = S.state.ui.tour;
    if (!t) return;
    if (t.i + 1 >= resolve(t.kind).length) tourActions.endTour();
    else S.ui({ tour: { ...t, i: t.i + 1 } });
  },
  tourBack: () => { const t = S.state.ui.tour; if (t && t.i > 0) S.ui({ tour: { ...t, i: t.i - 1 } }); },
  endTour: () => { S.ui({ tour: null }); returnFocus(); },
  declineTour: () => {
    remember({ declined: true });
    visit.offerHidden = true;
    S.toast('You can take the tour any time, from the top right.');
  },
  offerVideo: () => { visit.offerHidden = true; S.ui({ sheet: { kind: 'guide', id: 'tour' }, navOpen: false }); },
};

/* ---------- the offer: on every visit, on the first screen it fits ---------- */
function offerFor(): Kind | null {
  const st = S.state;
  if (prefs.declined || visit.offerHidden || st.ui.tour || st.ui.sheet || st.ui.navOpen) return null;
  const kind = kindOf(st.current);
  if (kind === 'home' ? prefs.home || prefs.step : prefs.step) return null;
  const L = am.live.state;
  if (L.take || L.noise) return null; // never during a measurement
  // Shown on one screen; moving on without answering passes it over for this visit.
  const here = `${st.project ? st.project.id : '-'}:${st.current}`;
  if (visit.offerAt == null) visit.offerAt = here;
  else if (visit.offerAt !== here) { visit.offerHidden = true; return null; }
  return kind;
}

function Offer({ kind }: { kind: Kind }) {
  return (
    <aside className={cx('tour-offer', kind === 'home' && 'is-home')} aria-labelledby="tour-offer-t">
      <span className="to-ic" aria-hidden="true"><Icon name="tour" size={20} sw={2} /></span>
      <div className="to-body">
        <h2 id="tour-offer-t" className="to-title">{kind === 'home' ? 'New here? Take a quick tour' : 'Take a quick tour of a step?'}</h2>
        <p className="to-text">{kind === 'home'
          ? 'A few stops on this screen: how to start, the ten steps and where to find help.'
          : 'A few stops on this screen: what the step is for, where to get help and how to move on.'}</p>
        <div className="to-acts">
          <Btn action="startTour" variant="primary" size="sm" icon="tour">Take the tour</Btn>
          <Btn action="declineTour" variant="ghost" size="sm">Not now</Btn>
        </div>
        <button type="button" className="to-video" data-action="offerVideo"><Icon name="play" size={12} sw={2.2} />{`Or watch the ${video()} video`}</button>
      </div>
      <button type="button" className="iconbtn to-x" data-action="declineTour" aria-label="Not now"><Icon name="x" size={16} sw={2} /></button>
    </aside>
  );
}

/* ---------- the tour: spotlight and card ---------- */
const PAD = 6, GAP = 16, EDGE = 12;

function place(card: HTMLElement, hole: HTMLElement, cur: Resolved) {
  const vw = window.innerWidth, vh = window.innerHeight, r = cur.el.getBoundingClientRect();
  const x1 = Math.max(r.left - PAD, 4), y1 = Math.max(r.top - PAD, 4), x2 = Math.min(r.right + PAD, vw - 4), y2 = Math.min(r.bottom + PAD, vh - 4);
  Object.assign(hole.style, { left: `${x1}px`, top: `${y1}px`, width: `${Math.max(0, x2 - x1)}px`, height: `${Math.max(0, y2 - y1)}px` });
  const cw = card.offsetWidth, ch = card.offsetHeight, al = cur.stop.align || 'center';
  const cX = (x: number) => Math.min(Math.max(x, EDGE), vw - cw - EDGE), cY = (y: number) => Math.min(Math.max(y, EDGE), vh - ch - EDGE);
  const aX = al === 'start' ? x1 : al === 'end' ? x2 - cw : (x1 + x2) / 2 - cw / 2;
  const aY = al === 'start' ? y1 : al === 'end' ? y2 - ch : (y1 + y2) / 2 - ch / 2;
  let side = 'center', left = (vw - cw) / 2, top = vh - ch - EDGE;
  if (vw <= 640) {
    // A phone: the card is a sheet at the bottom, or at the top when what it points at is low on the screen.
    side = (y1 + y2) / 2 > vh * 0.55 ? 'sheet-top' : 'sheet-bottom';
    top = side === 'sheet-top' ? EDGE : vh - ch - EDGE;
  } else {
    const tries: Record<Side, () => [number, number, boolean]> = {
      bottom: () => [cX(aX), y2 + GAP, y2 + GAP + ch <= vh - EDGE],
      top: () => [cX(aX), y1 - GAP - ch, y1 - GAP - ch >= EDGE],
      right: () => [x2 + GAP, cY(aY), x2 + GAP + cw <= vw - EDGE],
      left: () => [x1 - GAP - cw, cY(aY), x1 - GAP - cw >= EDGE],
    };
    for (const s of [cur.stop.side, 'bottom', 'top', 'right', 'left'] as Side[]) {
      const [l, t, ok] = tries[s]();
      if (ok) { side = s; left = l; top = t; break; }
    }
  }
  card.style.left = `${Math.round(left)}px`;
  card.style.top = `${Math.round(top)}px`;
  card.dataset.side = side;
  // The arrow points at the middle of what the card and the target share along that edge.
  const mid = (a1: number, a2: number, b1: number, b2: number) => (Math.max(a1, b1) + Math.min(a2, b2)) / 2;
  card.style.setProperty('--ax', `${Math.round(Math.min(Math.max(mid(x1, x2, left, left + cw) - left, 22), cw - 22))}px`);
  card.style.setProperty('--ay', `${Math.round(Math.min(Math.max(mid(y1, y2, top, top + ch) - top, 22), ch - 22))}px`);
  if (!card.dataset.placed) requestAnimationFrame(() => { card.dataset.placed = '1'; hole.dataset.placed = '1'; });
}

function TourCard({ t }: { t: TourState }) {
  const holeRef = useRef<HTMLDivElement>(null), cardRef = useRef<HTMLDivElement>(null), nextRef = useRef<HTMLButtonElement>(null);
  const stops = resolve(t.kind), k = Math.min(t.i, stops.length - 1), cur = stops[k] as Resolved | undefined, last = k === stops.length - 1;
  const curRef = useRef(cur);
  curRef.current = cur;

  // A new stop: bring it into view, then move the focus to the card.
  useLayoutEffect(() => {
    const c = curRef.current;
    if (!c) return;
    // Scrolled only when needed: something taller than the window (the step list) stays put while its top shows.
    const r = c.el.getBoundingClientRect(), vh = window.innerHeight, fits = r.height <= vh * 0.7;
    if (r.top < 0 || (fits && r.bottom > vh) || (!fits && r.top > vh * 0.5)) c.el.scrollIntoView({ block: fits ? 'center' : 'start' });
    if (nextRef.current) nextRef.current.focus({ preventScroll: true });
  }, [t.kind, k]);

  // Every render (the screen behind may change), and whenever the window or a scroller moves.
  useLayoutEffect(() => { if (cur && cardRef.current && holeRef.current) place(cardRef.current, holeRef.current, cur); });
  useEffect(() => {
    const again = () => { const c = curRef.current; if (c && cardRef.current && holeRef.current) place(cardRef.current, holeRef.current, c); };
    window.addEventListener('resize', again);
    window.addEventListener('scroll', again, true);
    const ro = window.ResizeObserver ? new ResizeObserver(again) : null;
    if (ro && curRef.current) ro.observe(curRef.current.el);
    return () => { window.removeEventListener('resize', again); window.removeEventListener('scroll', again, true); if (ro) ro.disconnect(); };
  }, [t.kind, k]);

  // Nothing to point at (cannot normally happen): the tour ends rather than showing an empty card.
  const none = !cur;
  useEffect(() => { if (none) S.ui({ tour: null }); }, [none]);
  if (!cur) return null;

  return (
    <>
      <div className="tour-hole" ref={holeRef} aria-hidden="true" />
      <div className="tour-card" ref={cardRef} role="dialog" aria-modal="true" aria-labelledby="tour-t" aria-describedby="tour-d">
        <span className="tour-arrow" aria-hidden="true" />
        <div className="tour-top">
          <span className="tour-count">{`${k + 1} of ${stops.length}`}</span>
          <span className="tour-kind">{t.kind === 'home' ? 'Tour of Home' : 'Tour of a step'}</span>
          <button type="button" className="iconbtn tour-x" data-action="endTour" aria-label="End the tour"><Icon name="x" size={16} sw={2} /></button>
        </div>
        <div aria-live="polite">
          <h2 id="tour-t" className="tour-title">{cur.stop.title}</h2>
          <p id="tour-d" className="tour-text">{cur.text}</p>
          {cur.now ? <p className={cx('tour-now', `is-${cur.now.tone}`)}><Icon name={cur.now.tone === 'warn' ? 'alert' : cur.now.tone === 'good' ? 'check' : 'info'} size={14} sw={2.2} /><span>{cur.now.text}</span></p> : null}
        </div>
        <div className="tour-foot">
          <div className="tour-dots" aria-hidden="true">{stops.map((_, j) => <i key={j} className={cx(j === k && 'is-on', j < k && 'is-past')} />)}</div>
          {k > 0 ? <Btn action="tourBack" variant="ghost" size="sm" icon="chevL">Back</Btn> : <Btn action="endTour" variant="ghost" size="sm">Skip tour</Btn>}
          <button type="button" ref={nextRef} className="btn btn-primary btn-sm" data-action="tourNext">{last ? 'Finish' : 'Next'}{last ? null : <Icon name="arrowR" size={15} sw={2.2} />}</button>
        </div>
      </div>
    </>
  );
}

/** The tour, or the offer of it. Rendered outside #app (src/shell/Shell.tsx, #tour-root). */
export function TourLayer() {
  const t = S.state.ui.tour, cur = S.state.current;
  const stale = !!t && t.at !== cur;
  // The step changed under the tour (not by the person: the page is inert while it runs): it ends.
  useEffect(() => { if (stale) S.ui({ tour: null }); }, [stale]);
  if (t && !stale) return <TourCard t={t} key={t.kind} />;
  const offer = t ? null : offerFor();
  return offer ? <Offer kind={offer} /> : null;
}

/* Estimate | Measure: one toggle across this measuring app and Lighter RT60, the quick sales estimator (as in the
   approved preview). Pressing Estimate slides the thumb across, the screen settles softly onto Lighter's backdrop with
   the UV tile in the middle, and Lighter opens behind it, starting at once: at the room this project came from
   (js/services/handoff.js), else at its projects. The tile stays still (no spinner) at the size and place where Lighter
   shows its own, so the change of page is invisible; if the network is slow it only breathes gently.

   When the page before this one is that same Lighter page (the rep came from it and has not left this one since), the
   switch uses the browser's Back: Lighter is shown at once, exactly as it was left. */
import { am, S } from '../lib';

const EASE = 'cubic-bezier(.22,1,.36,1)';
/** Lighter's own backdrop, so the hand-over to its first frame is seamless. */
const ESTIMATE_BG = '#f3f2ef';
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
const icon = (): string => (window as any).UV_ICON || 'assets/brand/univicoustic-icon.png';
const handoff = () => (am.services as any).handoff;
let going = false;
let left = false;
/** Counts the times this page was left: a timer from before leaving does nothing once the page is shown again. */
let visits = 0;

/** Gets Lighter's server ready (connection and first page) while the rep is about to switch. Once a page. */
let warmed = false;
function warmUp() {
  if (warmed) return;
  warmed = true;
  try {
    const url: string = handoff().ESTIMATE_URL;
    const add = (rel: string, href: string) => {
      const l = document.createElement('link');
      l.rel = rel;
      l.href = href;
      if (rel === 'preconnect') l.crossOrigin = '';
      document.head.appendChild(l);
    };
    add('preconnect', new URL(url).origin);
    add('prefetch', `${url}/`);
  } catch (e) { /* only a speed-up */ }
}

/** The switch's thumb and labels, moved by hand (the screen is not drawn again while the page changes). */
function flip(toEstimate: boolean) {
  const sw = document.querySelector('.app-switch');
  if (!sw) return;
  const thumb = sw.querySelector('.as-thumb') as HTMLElement | null;
  const [est, mea] = Array.from(sw.querySelectorAll('.as-opt'));
  est?.classList.toggle('on', toEstimate);
  mea?.classList.toggle('on', !toEstimate);
  if (thumb && !matchMedia('(prefers-reduced-motion: reduce)').matches)
    thumb.animate([{ transform: toEstimate ? 'none' : 'translateX(-100%)' }, { transform: toEstimate ? 'translateX(-100%)' : 'none' }], { duration: 300, easing: EASE, fill: 'forwards' });
}

async function toEstimate() {
  if (going) return;
  going = true;
  left = false;
  const visit = visits;
  warmUp();
  const p = S.state.project;
  const href: string = handoff().estimateLink(p);
  const back: boolean = !!handoff().canGoBack?.(p);
  flip(true);
  const over = document.createElement('div');
  over.className = 'app-switch-spin to-estimate';
  over.style.background = ESTIMATE_BG;
  over.style.opacity = '0';
  over.setAttribute('role', 'status');
  over.setAttribute('aria-label', 'Opening the quick estimate');
  over.innerHTML = '<div style="opacity:0"><div class="app-switch-tile" style="opacity:1"><img alt=""></div></div>';
  const box = over.firstElementChild as HTMLElement, tile = box.firstElementChild as HTMLElement;
  (tile.firstElementChild as HTMLImageElement).src = icon();
  document.body.appendChild(over);
  over.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 230, delay: 70, easing: 'ease-out', fill: 'forwards' });
  box.animate([{ opacity: 0, transform: 'scale(.94)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 300, delay: 110, easing: EASE, fill: 'forwards' });
  // Only if Lighter is slow to come: a calm breath, never a spinner.
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches)
    tile.animate([{ transform: 'scale(1)' }, { transform: 'scale(.965)' }, { transform: 'scale(1)' }], { duration: 1600, delay: 1100, iterations: Infinity, easing: 'ease-in-out' });
  await wait(300);
  if (back) {
    history.back();
    // Back did nothing (the browser kept no page before this one): open Lighter by its address instead.
    setTimeout(() => { if (!left && going && visit === visits) window.location.assign(href); }, 900);
  } else window.location.assign(href);
  // Still here after a long while (offline, or the page was blocked): give the screen back.
  setTimeout(() => {
    if (left || visit !== visits || document.visibilityState !== 'visible' || !over.isConnected) return;
    going = false;
    flip(false);
    over.remove();
    S.toast('The estimate did not open. Check the internet connection and try again.');
  }, 15000);
}

window.addEventListener('pagehide', () => { left = true; visits++; });
// Back from Lighter with the browser's Forward (the page comes back as it was left): the cover lifts, the thumb returns.
window.addEventListener('pageshow', (e: PageTransitionEvent) => {
  going = false;
  left = false;
  const covers = document.querySelectorAll<HTMLElement>('.app-switch-spin.to-estimate');
  if (!covers.length) return;
  covers.forEach(el => el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: e.persisted ? 260 : 0, easing: 'ease-out', fill: 'forwards' }).finished.then(() => el.remove(), () => el.remove()));
  flip(false);
});

const ZAP = '<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>';
const WAVE = '<path d="M2 10v3"/><path d="M6 6v11"/><path d="M10 3v18"/><path d="M14 8v7"/><path d="M18 5v13"/><path d="M22 10v3"/>';
const Svg = ({ d }: { d: string }) => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" dangerouslySetInnerHTML={{ __html: d }} />
);

export function AppSwitch() {
  const p = S.state.project, back = !!(p && (p.room as any).estimateBack);
  return (
    <div className="app-switch" role="radiogroup" aria-label="Switch app">
      <span className="as-thumb" aria-hidden="true" />
      <button type="button" role="radio" aria-checked="false" className="as-opt" onClick={toEstimate} onPointerEnter={warmUp} onFocus={warmUp}
        title={back ? 'Lighter RT60: back to this room in the quick estimate' : 'Lighter RT60: quick sales estimate'}>
        <span className="as-ic"><Svg d={ZAP} /></span>Estimate
      </button>
      <button type="button" role="radio" aria-checked="true" className="as-opt on" title="Full RT60: measurement, results and report (you are here)">
        <span className="as-ic"><Svg d={WAVE} /></span>Measure
      </button>
    </div>
  );
}

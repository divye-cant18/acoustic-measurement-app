/* Estimate | Measure: the switch between this measuring app and Lighter RT60, the quick sales estimator (as in the
   approved preview). Estimate shows only the Univicoustic UV tile, turning on Lighter's backdrop while Lighter opens:
   at the room this project came from (js/services/handoff.js), else at its projects.

   The tile's logo is built into the page (window.UV_ICON, index.html), so it never waits on a download, and Lighter
   starts loading as the tile appears (not after it has finished turning): the tile keeps turning until Lighter's first
   screen replaces it. Lighter's own opening shows the same tile at once, so the two meet without a blank moment. */
import { am, S } from '../lib';

const EASE = 'cubic-bezier(.22,1,.36,1)';
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
const icon = (): string => (window as any).UV_ICON || 'assets/brand/univicoustic-icon.png';
let going = false;

/** Gets Lighter's server ready (connection and first page) while the rep is about to switch. Once a page. */
let warmed = false;
function warmUp() {
  if (warmed) return;
  warmed = true;
  try {
    const url: string = (am.services as any).handoff.ESTIMATE_URL;
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

async function toEstimate() {
  if (going) return;
  going = true;
  warmUp();
  const href: string = (am.services as any).handoff.estimateLink(S.state.project);
  const over = document.createElement('div');
  over.className = 'app-switch-spin to-estimate';
  over.setAttribute('role', 'status');
  over.setAttribute('aria-label', 'Opening the quick estimate');
  // The outer box grows in; the tile inside it turns.
  over.innerHTML = '<div style="opacity:0"><div class="app-switch-tile" style="opacity:1"><img alt=""></div></div>';
  const box = over.firstElementChild as HTMLElement, tile = box.firstElementChild as HTMLElement;
  const img = tile.firstElementChild as HTMLImageElement;
  img.src = icon();
  document.body.appendChild(over);
  await img.decode().catch(() => {});
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  box.animate([{ transform: 'scale(.7)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }], { duration: 240, easing: EASE, fill: 'forwards' });
  if (!reduced) tile.animate([{ transform: 'rotate(0turn)' }, { transform: 'rotate(1turn)' }], { duration: 900, delay: 160, iterations: Infinity, easing: 'cubic-bezier(.65,0,.35,1)' });
  await wait(reduced ? 120 : 380);
  window.location.assign(href);
  // Still here after a long while (offline, or the page was blocked): give the screen back.
  setTimeout(() => {
    if (document.visibilityState !== 'visible' || !over.isConnected) return;
    going = false;
    over.remove();
    S.toast('The estimate did not open. Check the internet connection and try again.');
  }, 15000);
}

// Back from Lighter: the browser may bring this page back as it was left, spinner and all.
window.addEventListener('pageshow', () => {
  going = false;
  document.querySelectorAll('.app-switch-spin.to-estimate').forEach(el => el.remove());
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

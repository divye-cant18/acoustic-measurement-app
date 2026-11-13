/* Estimate | Measure: the switch between this measuring app and Lighter RT60, the quick sales estimator (as in the
   approved preview). Estimate shows only the Univicoustic UV tile, turning 2 or 3 times on Lighter's backdrop, then
   opens Lighter: at the room this project came from (js/services/handoff.js), else at its projects. */
import { am, S } from '../lib';

const EASE = 'cubic-bezier(.22,1,.36,1)';
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
let going = false;

async function toEstimate() {
  if (going) return;
  going = true;
  const href: string = (am.services as any).handoff.estimateLink(S.state.project);
  const over = document.createElement('div');
  over.className = 'app-switch-spin to-estimate';
  over.setAttribute('role', 'status');
  over.setAttribute('aria-label', 'Opening the quick estimate');
  over.innerHTML = '<div class="app-switch-tile"><img src="assets/brand/univicoustic-icon.png" alt=""></div>';
  document.body.appendChild(over);
  const tile = over.firstElementChild as HTMLElement;
  tile.animate([{ transform: 'scale(.7)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }], { duration: 260, easing: EASE, fill: 'forwards' });
  await wait(240);
  const turns = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 2 + Math.floor(Math.random() * 2);
  if (turns) await tile.animate([{ transform: 'rotate(0turn)' }, { transform: `rotate(${turns}turn)` }], { duration: 520 * turns, easing: 'cubic-bezier(.65,0,.35,1)' }).finished.catch(() => {});
  window.location.assign(href);
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
      <button type="button" role="radio" aria-checked="false" className="as-opt" onClick={toEstimate}
        title={back ? 'Lighter RT60: back to this room in the quick estimate' : 'Lighter RT60: quick sales estimate'}>
        <span className="as-ic"><Svg d={ZAP} /></span>Estimate
      </button>
      <button type="button" role="radio" aria-checked="true" className="as-opt on" title="Full RT60: measurement, results and report (you are here)">
        <span className="as-ic"><Svg d={WAVE} /></span>Measure
      </button>
    </div>
  );
}

/* The octave bands, read across one row each: the band and its sound group, its allowed range (a dashed box), the value
   as a dot, and the value and its status in words. The preferred value is the dashed line through every row.
   Assessment shows the measured room (the dot coloured by status). Predicted Result passes `from`, the measured value:
   a black dot for now and a red dot for after treatment, joined, with the status of the value after treatment.
   Colour never carries the status alone: the words beside each row say it too. */
import { fmt } from '../lib';

export type Band = { f: number; rt: number | null; min: number | null; max: number | null; role?: string; status: string | null; from?: number | null; note?: string | null };
const groupOf = (f: number) => (f <= 250 ? 'low sounds' : f >= 4000 ? 'high sounds' : 'voices');
const BAND_WORD: Record<string, string> = { within: 'just right', above: 'too echoey', below: 'too dull' };

export function BandRanges({ bands, preferred, label = 'Each pitch against its allowed range' }: { bands: Band[]; preferred: number | null; label?: string }) {
  const change = bands.some(b => b.from != null);
  const top = Math.max(0.5, ...bands.map(b => Math.max(b.rt || 0, b.max || 0, b.from || 0)), preferred || 0);
  const M = Math.ceil(top * 1.15 * 10) / 10, frac = (v: number) => Math.max(0, Math.min(1, v / M)) * 100, at = (v: number) => `${frac(v).toFixed(2)}%`;
  const pref = preferred != null ? <i className="br-pref" style={{ left: at(preferred) }} /> : null;
  return (
    <div className={change ? 'br is-change' : 'br'}>
      <ul className="br-list" aria-label={label}>
        {bands.map(b => {
          const measured = b.rt != null && b.status !== 'insufficient', st = !measured ? 'none' : b.status && BAND_WORD[b.status] ? b.status : 'free';
          const lo = b.min != null ? b.min : 0, from = b.from != null ? b.from : null;
          return (
            <li className={`br-row is-${st}`} key={b.f}>
              <span className="br-k"><b>{fmt.hz(b.f)}</b><small>{groupOf(b.f)}</small></span>
              <span className="br-track" aria-hidden="true">
                {pref}
                {b.max != null ? <i className="br-box" style={{ left: at(lo), width: `calc(${at(b.max)} - ${at(lo)})` }} /> : null}
                {from != null && measured ? <i className="br-link" style={{ left: at(Math.min(from, b.rt as number)), width: `${Math.abs(frac(from) - frac(b.rt as number)).toFixed(2)}%` }} /> : null}
                {from != null ? <i className="br-dot is-from" style={{ left: at(from) }} /> : null}
                {measured ? <i className={change ? 'br-dot is-after' : 'br-dot'} style={{ left: at(b.rt as number) }} /> : null}
              </span>
              <span className="br-v">{measured
                ? <><b>{from != null ? `${from.toFixed(2)} → ${fmt.s(b.rt)}` : fmt.s(b.rt)}</b><small>{b.note || (st === 'free' ? 'no limit here' : BAND_WORD[st])}</small></>
                : <small>{b.note || 'not measured'}</small>}</span>
            </li>
          );
        })}
      </ul>
      <div className="br-row br-axis" aria-hidden="true">
        <span />
        <span className="br-track is-axis"><em style={{ left: '0%' }}>0 s</em>{preferred != null ? <em className="is-pref" style={{ left: at(preferred) }}>{`preferred ${fmt.s(preferred)}`}</em> : null}<em style={{ left: '100%' }}>{`${M.toFixed(1)} s`}</em></span>
        <span />
      </div>
      <div className="br-legend" aria-hidden="true">
        {change
          ? <><span><i className="br-sw" />Now (measured)</span><span><i className="br-sw is-after" />After treatment (estimate)</span></>
          : <><span><i className="br-sw" />Just right</span><span><i className="br-sw is-below" />Too dull</span><span><i className="br-sw is-above" />Too echoey</span></>}
        <span><i className="br-sw is-box" />Allowed range</span>{preferred != null ? <span><i className="br-sw is-pref" />Preferred</span> : null}
      </div>
    </div>
  );
}

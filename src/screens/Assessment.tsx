/* Step 7 · Acoustic Assessment — how does the measured room compare with the target? The room is judged by the rule of
   its criterion (AM.derive.assessment, AM.services.evaluation): every band the criterion sets has to lie within the
   target range. That is the verdict; the average is its summary, never deciding alone. Bands with their own, wider
   limits are band warnings, shown apart.
   The screen leads with the verdict in words and the room's RT60 beside its target, then what to fix for low sounds,
   voices and high sounds (AM.derive.soundGroups, each with the bands that are off). The averages, the formal explanation,
   the band warnings, the band chart and the table are under "Show technical details". */
import type { ReactNode } from 'react';
import { D, fmt, RA, TGT } from '../lib';
import type { Ctx, PrimaryAction, SoundGroup } from '../am';
import { Chart, Details, Icon, Legend, Note, RtScale, Stat, StatusPill, TableWrap, Tag, TechH } from '../ui/kit';

const VERDICT: Record<string, [string, string, string]> = { within: ['good', 'Meets the target', 'check'], above: ['critical', 'Does not meet the target', 'arrowUp'], below: ['warn', 'Drier than the target', 'arrowDn'] };
const ROLE: Record<string, string> = { primary: 'Judged, target range', edge: 'Judged, own limit', secondary: 'Warning only', info: 'No limit' };

/* One sentence the sales person can say, from the three groups' statuses, voices first. */
function advice(groups: SoundGroup[]): string {
  const by = (id: string) => groups.find(g => g.id === id), v = by('voices');
  const name: Record<string, string> = { low: 'low sounds like footsteps', high: 'high sounds like clinking cups' };
  const others = groups.filter(g => g.id !== 'voices');
  const echo = others.filter(g => g.status === 'above'), dry = others.filter(g => g.status === 'below');
  const list = (xs: SoundGroup[]) => xs.map(g => name[g.id]).join(' and ');
  const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);
  if (!v || v.status == null) return 'Voices could not be measured clearly. Measure again before deciding on treatment.';
  if (v.status === 'above') return `Voices echo, so speech will sound muddy.${echo.length ? ` ${cap(list(echo))} linger too.` : ''} Sound-absorbing treatment will help.`;
  if (v.status === 'below') return 'Voices sound drier than the goal. Adding absorption would make the room drier still.';
  if (echo.length) return `Voices sound clear. ${cap(list(echo))} linger, so panels that absorb ${echo.length > 1 ? 'low and high' : echo[0].id} sounds would help most.`;
  if (dry.length) return `Voices sound clear. ${cap(list(dry))} are a little dry, which needs no treatment.`;
  return 'Voices, low sounds and high sounds are all within the goal.';
}

/* ---------- what to fix: one row per sound group ---------- */
const GROUP_STATE: Record<string, [string, string, string]> = { above: ['above', 'Too echoey', 'arrowUp'], below: ['below', 'Too dull', 'arrowDn'], within: ['within', 'Just right', 'check'], none: ['none', 'Not measured', 'minus'] };
function hint(g: SoundGroup): string {
  if (g.status === 'above') return g.id === 'low' ? 'They ring too long. Thicker panels, or panels with an air gap, help most.' : g.id === 'voices' ? 'They ring too long, so speech sounds muddy. Sound-absorbing panels help.' : 'They ring too long. Most acoustic panels absorb these well.';
  if (g.status === 'below') return 'A little dry. Avoid adding much more soft material for these.';
  if (g.status === 'within') return 'On target.';
  return 'Not measured clearly in this room.';
}
function FixRow({ g, bands }: { g: SoundGroup; bands: { f: number; status: string | null }[] }) {
  const [cls, word, icon] = GROUP_STATE[g.status || 'none'] || GROUP_STATE.none;
  // The bands of the group that are outside their own limits: why a group can be off although its average looks fine.
  const off = bands.filter(b => (g.bands as number[]).includes(b.f) && (b.status === 'above' || b.status === 'below'));
  return (
    <li className={`fix-row is-${cls}`}>
      <span className="fix-ic" aria-hidden="true"><Icon name={icon} size={18} sw={2.4} /></span>
      <span className="fix-k"><b>{g.label}</b><span>{g.example}</span></span>
      <span className="fix-v">{g.value != null ? <>{g.value.toFixed(2)}<small>s</small></> : '—'}</span>
      <span className="fix-say">
        <b>{word}</b>
        <span>{hint(g)}</span>
        {off.length && g.status !== 'within' ? <span className="fix-bands">{off.map(b => <span className="fix-band" key={b.f}>{`${fmt.hz(b.f)} ${b.status === 'above' ? 'rings too long' : 'too short'}`}</span>)}</span> : null}
      </span>
    </li>
  );
}

export function AssessmentScreen({ ctx }: { ctx: Ctx }) {
  const a = D.assessment(ctx.project);
  if (!a) return <Note tone="warn">Assessment needs a target and a valid measurement.</Note>;
  const t = a.target, pol = a.policy, v = a.verdict, ex = a.explanation;
  const vd = a.available && a.status ? VERDICT[a.status] : null;
  const groups = D.soundGroups(ctx.project) || [];
  const verdictWord = vd ? (v.complete || a.status !== 'within' ? vd[1] : 'Meets the target where measured') : 'Not assessed';
  const next: ReactNode = !a.available ? null
    : a.status === 'above' ? <><b>Treatment needed.</b>{` The next step works out how much the room needs to reach ${t.preferred != null ? fmt.s(t.preferred) : `the ${fmt.s(t.max)} limit`}.`}</>
      : a.status === 'within' ? <><b>{`Meets the target${v.complete ? '' : ' where measured'}.`}</b> Treatment is optional.</>
        : <><b>Drier than the target.</b> Adding absorption would move it further away, so treatment is not recommended.</>;
  const tone = vd ? vd[0] : 'warn';
  return (
    <>
      {a.provisional ? <Note tone="warn" icon="pin"><b>{!a.positions.complete ? `Provisional: measured at ${a.positions.valid} of the ${a.positions.required} positions needed.` : `Provisional: ${(a as any).thinBands.map((f: number) => fmt.hz(f)).join(', ')} rest${(a as any).thinBands.length > 1 ? '' : 's'} on fewer than ${a.positions.required} positions.`}</b> Measure another position in Acoustic Measurement to complete the result.</Note> : null}

      {/* The verdict, in words, with the room's RT60 beside its target. */}
      <section className={`card av-hero is-${tone}`} aria-label="Verdict">
        <div className="av-main">
          <span className="av-ic" aria-hidden="true"><Icon name={vd ? vd[2] : 'alert'} size={28} sw={2.4} /></span>
          <div className="av-words">
            <span className="av-k">Verdict</span><b className="av-verdict">{verdictWord}</b>
            <p className="av-say">{a.available ? advice(groups) : <>The room cannot be assessed.{` ${a.reason || ''}`}</>}</p>
            {next ? <p className="av-next">{next}</p> : null}
          </div>
        </div>
        <div className="av-figs">
          <div className="av-fig is-room"><span className="av-k">RT60 of the room</span><span className="av-n">{a.available && a.rt != null ? <>{a.rt.toFixed(2)}<small>s</small></> : '—'}</span><span className="av-sub">{`average, ${pol.short}`}</span></div>
          <div className="av-fig is-target"><span className="av-k">Target</span><span className="av-n">{t.preferred != null ? <>{t.preferred.toFixed(2)}<small>s</small></> : <>{`≤ ${t.max.toFixed(2)}`}<small>s</small></>}</span><span className="av-sub">{t.preferred != null ? `range ${TGT.rangeText(t)}` : `at ${pol.short}`}</span></div>
          {a.available ? <div className="av-scale"><RtScale target={t} measured={a.rt} /></div> : null}
        </div>
      </section>

      {/* What to fix: each sound group, its status, the bands that are off, and what helps. */}
      <section className="card fix-card" aria-labelledby="fix-h">
        <header className="card-h"><span className="card-ic" aria-hidden="true"><Icon name="bars" size={16} sw={2} /></span><div className="card-ht"><h2 className="card-t" id="fix-h">What to fix</h2><p className="card-s">{`Low sounds, voices and high sounds, each against the target (${TGT.rangeText(t)}).`}</p></div></header>
        <ul className="fix-list">{groups.map(g => <FixRow key={g.id} g={g} bands={a.bands as any} />)}</ul>
        {!a.available ? <p className="small">{`The room is judged in the ${pol.label.toLowerCase()}, and at least half of those bands need a value. Without them there is no verdict, no treatment amount and no prediction. Measure again in Acoustic Measurement: a quieter room, or a higher sweep level, can give the missing bands enough usable decay.`}</p> : null}

        <Details id="assessment-bands">
          <div className="grid g2 stat-row">
            <Stat kind="measured" label={`Average, ${pol.short}`} value={a.available && a.rt != null ? a.rt.toFixed(2) : '—'} unit={a.available ? 's' : ''} tag={<Tag kind="measured" />}
              sub={a.available ? <><StatusPill status={a.summaryStatus} /><span>{`${pol.short} · ${a.summary.partial ? `${a.summary.n} of ${a.summary.total} bands` : a.summary.total === 1 ? 'measured' : `all ${a.summary.total} bands`}`}</span></> : 'Not available'} />
            <Stat kind="measured" label="Average, all bands" value={a.average.available && a.average.value != null ? a.average.value.toFixed(2) : '—'} unit={a.average.available ? 's' : ''}
              sub={a.average.available ? <span>{`${RA.SHORT}${a.average.partial ? ` · ${a.average.n} of ${a.average.total} bands, ${a.average.missing.map(x => fmt.hz(x.f)).join(', ')} not measured` : ''} · overall figure, not judged`}</span> : 'Not available'} />
          </div>
          <TechH title="Result against the target" note={a.available && vd ? ex.headline : 'Not assessed'} />
          {a.available && vd ? <p className="small">{`${ex.headline}. ${ex.lines.join(' ')}`}</p> : null}
          <p className="small muted">{`How it is judged: ${pol.basis}${pol.custom && pol.criterion ? " The target was adjusted by hand; the bands are those of the room's criterion." : ''}${a.available ? ` The RT60 of the room is the average over ${pol.short}, ${fmt.s(a.rt)}, across ${a.positions.valid} position${a.positions.valid > 1 ? 's' : ''}; it is a summary, and the verdict is decided band by band.` : ''}`}</p>
          {ex.warnings.length ? <>
            <TechH title="Band warnings" note={`These bands have their own, wider limits in ${pol.criterion || 'the criterion'}. They do not change the verdict.`} />
            <ul className="bullets small">{ex.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
          </> : null}
          <TechH title="Band by band" note={`Measured RT60 in each octave band (average over the positions), against that band's limits. "Judged": the band decides the verdict, against the target range or the criterion's own limits for that band; "no limit": the criterion sets nothing there.`} />
          <Chart type="bands" spec={{ series: [{ label: 'Measured RT60', kind: 'measured', values: a.bands.map(b => b.rt) }], target: t, limits: a.bands.map(b => ({ min: b.min, max: b.max })), unit: 's', height: 240, yTitle: 'RT60 (s)', aria: 'Measured RT60 by band against the target range' }} height={240} />
          <Legend items={t.preferred != null ? [['measured', 'Measured RT60'], ['zone', `Target range ${TGT.rangeText(t)}`], ['pref', 'Preferred']] : [['measured', 'Measured RT60'], ['zone', `Target ${TGT.rangeText(t)}`]]} />
          <TableWrap>
            <table className="tbl">
              <thead><tr><th>Band</th><th className="r">Measured</th><th className="r">Limits</th><th>Role</th><th className="r">Positions</th><th>Status</th></tr></thead>
              <tbody>
                {a.bands.map(b => (
                  <tr className={b.role === 'primary' || b.role === 'edge' ? 'is-ref' : undefined} key={b.f}>
                    <td>{fmt.hz(b.f)}</td><td className="r">{b.rt != null ? fmt.s(b.rt) : '—'}</td>
                    <td className="r">{b.max != null ? (b.min != null ? `${b.min.toFixed(2)}–${fmt.s(b.max)}` : `≤ ${fmt.s(b.max)}`) : '—'}</td><td>{ROLE[b.role]}</td><td className="r">{`${b.n} of ${b.of}`}</td>
                    <td>{b.status === 'insufficient' ? <span className="nr">Not measured</span> : b.status ? <StatusPill status={b.status} /> : <span className="muted">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </Details>
      </section>
    </>
  );
}

export function assessmentPrimary(ctx: Ctx): PrimaryAction | null {
  const a = D.assessment(ctx.project);
  return a && a.available ? { label: a.status === 'above' ? 'Explore treatment' : 'Continue to Treatment', action: 'continue' } : null;
}
